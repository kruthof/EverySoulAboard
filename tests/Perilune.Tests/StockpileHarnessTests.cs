using System;
using System.Collections.Generic;
using System.Linq;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tools;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-3 / WP-4b — the <c>occupancy --stockpile &lt;bench|far|filtered-far&gt; [N]</c>
    /// measurement selector (<see cref="StockpileHarness"/>). Host-side, zero sim state; this pins that
    /// it selects the prefix of a TOTAL order over walkable tiles the crew can actually REACH — so the
    /// A/B a reviewer reruns is the same experiment every time, on the same tiles, and those tiles are
    /// not a sealed room. The sim mechanics (filter/haul) are pinned by the WP-1/WP-2/WP-4 suites.
    ///
    /// WP-4b — WHY REACHABILITY IS PINNED HERE. Selecting on the <c>Walkable</c> FLAG alone put 3 of
    /// the 4 <c>far</c> tiles inside the slice's authored SEALED observatory (walkable floor behind a
    /// permanently closed door), and the whole `far` column this lane published was therefore a
    /// measurement of a compartment no crew member can enter. Nothing in the suite noticed, because
    /// <see cref="SelectStockpile_PicksAreWalkableFloor_AndReachableByCrew"/> used to assert exactly the
    /// insufficient predicate. It now asserts both.
    /// </summary>
    public class StockpileHarnessTests
    {
        private static Simulation Slice() =>
            GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

        private static bool IsBench(DeviceKind k) =>
            k == DeviceKind.SalvageRecycler || k == DeviceKind.Fabricator || k == DeviceKind.MachineShop;

        /// <summary>The three slice tiles inside the authored observatory (<c>AuthoredShips.cs</c>'s
        /// <c>door_observatory</c>, <c>DoorClosed = true</c>). Walkable floor, top-ranked for
        /// <c>far</c> by distance, and unreachable forever — nothing in the sim opens a door. Named
        /// literally, because it is the concrete geometry the reachability gate exists for; if the
        /// slice's authored layout changes,
        /// <see cref="FarModeSkipsTheSealedObservatory_TheConfoundTheGateRemoves"/> fails on its own
        /// preconditions and says so rather than passing hollowly.</summary>
        private static readonly Int3[] Observatory =
            { new Int3(58, 15, 1), new Int3(58, 14, 1), new Int3(57, 15, 1) };

        /// <summary>The test's own reachability probe. Deliberately the SAME oracle the gate consults
        /// (<c>sim.Paths.FindPath</c> from every live crew member) and written independently of it — the
        /// claim under test is not "reachability can be computed", it is "the harness agrees with the
        /// ENGINE about which tiles the crew can get to". Re-deriving connectivity here with a private
        /// BFS would test agreement with a second implementation of the walkability rules, which is a
        /// weaker and more brittle thing to pin. Never passes a <c>Citizen.Path</c>.</summary>
        private static bool ReachableByAnyCrew(Simulation sim, Int3 tile)
        {
            var scratch = new List<Int3>();
            foreach (var c in sim.Citizens.Items)
                if (!c.Dead && sim.Paths.FindPath(sim, c.Pos, tile, scratch)) return true;
            return false;
        }

        /// <summary>The determinism contract the harness actually claims is a TOTAL-ORDER one: the picks
        /// are the first N candidates under (distance-to-nearest-bench, canonical z,y,x), so two reviewers
        /// on two machines designate the same tiles. Two-run equality ALONE cannot prove that — this test
        /// used to assert only that, and could not fail: <c>List.Sort</c> is a deterministic function of
        /// its input, so an incomplete comparer produces the same arbitrary-but-identical order on both
        /// runs. So the order is checked against an ORACLE built by a DIFFERENT MECHANISM: candidates
        /// enumerated in canonical z,y,x order, then ordered by DISTANCE ALONE through LINQ's
        /// documented-stable <c>OrderBy</c>/<c>OrderByDescending</c>. Stability over a canonical
        /// enumeration reproduces the tie-break without ever touching the harness's <c>Pack</c> key or its
        /// comparer — so a missing tie-break is visible here.
        ///
        /// HONESTY about what is and is not independent: the distance METRIC (Manhattan + a per-deck
        /// penalty) is the harness's own definition of near/far and is necessarily mirrored — no test can
        /// derive it. It IS written independently in shape (a LINQ <c>Min</c> over the benches vs. the
        /// harness's manual best-so-far loop), so a broken loop is caught, but agreement on the metric is
        /// not the point. What the oracle establishes independently is the SELECTION CONTRACT over that
        /// metric: total order, correct direction per mode, first N taken.
        ///
        /// NON-VACUITY: a tie-break assertion over a tie-free sample proves nothing, so the boundary
        /// distance is asserted CONTESTED — strictly more candidates share it than there are slots left
        /// for them. RE-MEASURED after WP-4b's reachability gate narrowed the candidate pool from 807
        /// walkable tiles to the 657 that are reachable (150 walkable slice tiles are unreachable):
        /// bench N=12 ⇒ 12 candidates share the boundary for 9 slots; far N=12 ⇒ 7 for 1. N=12 is chosen
        /// for MARGIN on the bench side, where 9 of the 12 picks are tie-decided, so the tie-break
        /// mutation is caught by a wide margin and the test survives a future shift in slice geometry.
        /// The guard is checked at the N actually used, so if the geometry ever does shift the test says
        /// VACUOUS instead of passing hollowly.
        ///
        /// MUTATION: remove the <c>a.key.CompareTo(b.key)</c> tie-break from the sort (i.e.
        /// <c>return c;</c>) ⇒ the introsort reorders the contested boundary and the pick list no longer
        /// equals the oracle prefix. Second MUTATION: swap
        /// <c>far ? b.dist.CompareTo(a.dist) : a.dist.CompareTo(b.dist)</c> to the other way round ⇒ each
        /// mode returns the other mode's prefix. Third MUTATION (WP-4b): delete the
        /// <c>IsReachableByAnyCrew</c> gate from the harness ⇒ the far prefix leads with the sealed
        /// observatory and no longer equals the oracle's reachable-only prefix.</summary>
        [Test]
        public void SelectStockpile_IsThePrefixOfATotalDistanceThenCanonicalOrder([Values(false, true)] bool far)
        {
            const int N = 12;
            var sim = Slice();
            var world = sim.World;

            // Preconditions — assert the path is real before asserting the outcome.
            var benches = new List<Int3>();
            foreach (var d in sim.Devices.Items) if (IsBench(d.Kind)) benches.Add(d.Pos);
            Assert.That(benches, Is.Not.Empty, "precondition: the slice must have benches to be near/far from");

            // The oracle. Canonical z,y,x enumeration + a STABLE sort on distance alone.
            var cands = new List<(int dist, Int3 pos)>();
            bool anyPreZoned = false;
            int unreachableCands = 0;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        var f = world.GetFlags(p);
                        if ((f & TileFlags.Stockpile) != 0) anyPreZoned = true;
                        if ((f & TileFlags.Walkable) == 0) continue;
                        // WP-4b: the gate is part of the SELECTION CONTRACT, so the oracle must apply it
                        // too. Without this the assertion below fails on the far side, because the
                        // farthest walkable tiles on the slice are the sealed observatory's.
                        if (!ReachableByAnyCrew(sim, p)) { unreachableCands++; continue; }
                        // 100_000 is StockpileHarness.DeckPenalty (private), mirrored DELIBERATELY — it is
                        // the metric's definition, not a property. Change it there and this fails with an
                        // ordering message: the cause is here, not in the sort.
                        cands.Add((benches.Min(b =>
                            Math.Abs(p.X - b.X) + Math.Abs(p.Y - b.Y) + 100_000 * Math.Abs(p.Z - b.Z)), p));
                    }
            Assert.That(unreachableCands, Is.GreaterThan(0),
                "precondition: the slice must CONTAIN walkable-but-unreachable floor, or the reachability " +
                "term of this order is untested here and the whole oracle collapses to the old one");
            Assert.That(anyPreZoned, Is.False,
                "precondition: a fresh slice zones nothing, so the harness's already-zoned skip is inert here " +
                "and the oracle may omit it");

            List<(int dist, Int3 pos)> ordered = far
                ? cands.OrderByDescending(c => c.dist).ToList()
                : cands.OrderBy(c => c.dist).ToList();
            Assert.That(ordered.Count, Is.GreaterThan(N),
                "precondition: the slice must have more walkable floor than the zone needs, else the order is moot");

            // Non-vacuity: the tie-break has to be deciding real picks at the boundary.
            int boundary = ordered[N - 1].dist;
            int sharing = 0, slots = 0;
            for (int i = 0; i < ordered.Count; i++)
            {
                if (ordered[i].dist != boundary) continue;
                sharing++;
                if (i < N) slots++;
            }
            Assert.That(sharing, Is.GreaterThan(slots),
                $"VACUOUS: {sharing} candidates share the boundary distance {boundary} for {slots} slot(s) — " +
                "with no contest the tie-break decides nothing and this pin proves nothing");

            var expected = new List<Int3>(N);
            for (int i = 0; i < N; i++) expected.Add(ordered[i].pos);

            List<Int3> picks = StockpileHarness.SelectStockpile(Slice(), far, N);
            Assert.That(picks, Is.EqualTo(expected),
                $"far={far}: the picks must be the first {N} of the (distance, canonical z,y,x) total order");

            // And it is reproducible across two independent boots (necessary, not sufficient — see above).
            Assert.That(StockpileHarness.SelectStockpile(Slice(), far, N), Is.EqualTo(picks),
                "the harness must designate the same tiles on two runs");
        }

        /// <summary>Every pick is a legal MEASUREMENT tile — two independent requirements:
        ///   * walkable floor (the exact gate <c>DesignateStockpileCommand</c> enforces), and
        ///   * REACHABLE by some live crew member (WP-4b).
        ///
        /// The second is the one this test used to be missing, and its absence is what let the lane
        /// publish a `far` column measured inside a sealed room. Walkability is a per-tile flag and says
        /// nothing about connectivity.
        ///
        /// MUTATION: drop the walkable filter ⇒ a wall/void tile is picked and the walkable assertion
        /// fails (far mode only — bench mode's nearest tiles are walkable either way). MUTATION (WP-4b):
        /// drop the <c>IsReachableByAnyCrew</c> gate ⇒ the far picks lead with the observatory and the
        /// reachability assertion fails.</summary>
        [Test]
        public void SelectStockpile_PicksAreWalkableFloor_AndReachableByCrew([Values(false, true)] bool far)
        {
            var sim = Slice();
            List<Int3> picks = StockpileHarness.SelectStockpile(Slice(), far, 4);
            Assert.That(picks.Count, Is.EqualTo(4),
                "precondition: 4 tiles must come back — the slice has 657 reachable walkable tiles, so " +
                "this returns 4 because N=4, not because 4 is all there is");
            foreach (var p in picks)
            {
                Assert.That((sim.World.GetFlags(p) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                    $"{p} is not walkable floor — a stockpile can never live there");
                Assert.That(ReachableByAnyCrew(sim, p), Is.True,
                    $"{p} is walkable but NO crew member can path to it — zoning it measures a sealed " +
                    "compartment, not a stockpile");
            }
        }

        /// <summary>
        /// WP-4b — THE TEST THAT WOULD HAVE CAUGHT THE BUG. The slice's farthest-from-bench walkable
        /// floor is inside the authored observatory, sealed by <c>door_observatory</c>
        /// (<c>DoorClosed = true</c>, and no system in the sim ever opens a door). Distance-descending
        /// <c>far</c> therefore RANKED IT FIRST, and the reachability gate is the only thing that keeps
        /// it out of the measurement.
        ///
        /// Asserted in the form that actually bites — not merely "the picks are reachable" (which a
        /// broken gate could satisfy by luck on some other ship) but "these three specific tiles are
        /// REJECTED BY THE GATE": they appear in the harness's own <c>skippedUnreachable</c> audit list
        /// and not in the picks. Preconditions assert they are walkable and unreachable FIRST, so if the
        /// slice's layout ever changes this fails on a precondition instead of passing hollowly.
        ///
        /// MUTATION: delete the <c>IsReachableByAnyCrew</c> gate from <c>SelectStockpile</c> ⇒ all three
        /// tiles are selected, <c>skipped</c> is empty, and both assertions fail.
        /// </summary>
        [Test]
        public void FarModeSkipsTheSealedObservatory_TheConfoundTheGateRemoves()
        {
            var sim = Slice();
            foreach (var p in Observatory)
            {
                Assert.That((sim.World.GetFlags(p) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                    $"precondition: {p} must be WALKABLE floor, or the gate is not what excludes it and " +
                    "this test proves nothing about reachability");
                Assert.That(ReachableByAnyCrew(sim, p), Is.False,
                    $"precondition: {p} must be UNREACHABLE (behind the authored-closed observatory door)");
            }

            var skipped = new List<Int3>();
            List<Int3> picks = StockpileHarness.SelectStockpile(Slice(), far: true, 4, skipped);

            foreach (var p in Observatory)
            {
                Assert.That(picks, Does.Not.Contain(p),
                    $"{p} is inside the sealed observatory and must never be a measurement tile");
                Assert.That(skipped, Does.Contain(p),
                    $"{p} must be recorded as SKIPPED-UNREACHABLE — that is the gate rejecting it, as " +
                    "opposed to the ordering happening to rank it below the picks");
            }
        }

        /// <summary>The two modes MEAN opposite things: <c>far</c> lands on the deck OPPOSITE the
        /// crafting benches, <c>bench</c> lands on the SAME deck as (and on and beside) them (the
        /// buffer). On the slice the three benches are all on deck 0, so far ⇒ deck 1, bench ⇒ deck 0.
        /// WP-4b adds the term this test was silent about: BOTH modes' tiles must be crew-reachable, so
        /// "opposite deck" means a deck the crew can actually walk to (they can — the ladders work; that
        /// cross-deck haul is possible is the finding that retracted this lane's wrong-deck thesis).
        /// MUTATION: flip the ascending/descending distance compare ⇒ the deck assertions swap and this
        /// fails. MUTATION (WP-4b): drop the gate ⇒ far picks the observatory, still on deck 1, so the
        /// deck assertions still pass and only the reachability assertion bites.</summary>
        [Test]
        public void FarIsTheOppositeDeck_BenchIsTheBenchDeck()
        {
            var sim = Slice();
            // The slice's benches are all on deck 0 (RoomOutfitter.Engineering/Fabrication, north0).
            int benchZ = -1;
            foreach (var d in sim.Devices.Items) if (IsBench(d.Kind)) { benchZ = d.Pos.Z; break; }
            Assert.That(benchZ, Is.EqualTo(0), "precondition: the slice benches sit on deck 0");

            List<Int3> bench = StockpileHarness.SelectStockpile(Slice(), far: false, 4);
            List<Int3> far = StockpileHarness.SelectStockpile(Slice(), far: true, 4);

            foreach (var p in bench)
            {
                Assert.That(p.Z, Is.EqualTo(0), $"bench-mode tile {p} must be on the bench deck (0)");
                Assert.That(ReachableByAnyCrew(sim, p), Is.True, $"bench-mode tile {p} must be reachable");
            }
            foreach (var p in far)
            {
                Assert.That(p.Z, Is.EqualTo(1), $"far-mode tile {p} must be on the opposite deck (1)");
                Assert.That(ReachableByAnyCrew(sim, p), Is.True,
                    $"far-mode tile {p} must be reachable — a far deck the crew can reach is the whole " +
                    "point; an unreachable one measures nothing");
            }
        }

        /// <summary>Degenerate inputs are safe no-ops: N &lt;= 0 or a null sim returns an empty list, so
        /// the no-flag occupancy path (which never calls the harness) can never select or designate
        /// anything.
        ///
        /// HONEST MUTATION ACCOUNTING — this test used to name "drop the <c>n &lt;= 0</c> guard", which it
        /// does NOT bite. That early return is defence in depth, not a behavioural branch: the real result
        /// guard is the selection loop's own <c>picks.Count &lt; n</c> condition, already false for
        /// n &lt;= 0, so deleting the early return alone leaves every result identical. Its actual job is
        /// to skip the full <c>Width × Height × Depth</c> tile scan (64 × 20 × 2 = 2560 on the slice; only
        /// 807 of those survive as candidates) — a cost, not an observable. (It is NOT what keeps the return list's
        /// capacity argument non-negative either: that list is constructed on the line ABOVE the guard,
        /// so the clamp below does that job.) Nothing here can see the early return, and this test does
        /// not claim to.
        ///
        /// The two mutations it DOES bite, each verified applied:
        ///   * MUTATION: drop the <c>sim == null</c> short-circuit ⇒ <c>sim.World</c> throws
        ///     <c>NullReferenceException</c> (the null-sim assertion).
        ///   * MUTATION: drop the <c>n &lt; 0 ? 0 : n</c> capacity clamp on
        ///     <c>new List&lt;Int3&gt;(...)</c> ⇒ <c>new List&lt;Int3&gt;(-5)</c> throws
        ///     <c>ArgumentOutOfRangeException</c> (the N=-5 assertion). This bites only because the list
        ///     is constructed BEFORE the guards — which is exactly why the N &lt; 0 case is worth a
        ///     separate assertion from N = 0.</summary>
        [Test]
        public void SelectStockpile_IsAnEmptyNoOp_ForNonPositiveN_AndNullSim()
        {
            Assert.That(StockpileHarness.SelectStockpile(Slice(), far: true, 0), Is.Empty, "N=0 selects nothing");
            Assert.That(StockpileHarness.SelectStockpile(Slice(), far: false, -5), Is.Empty, "N<0 selects nothing");
            Assert.That(StockpileHarness.SelectStockpile(null, far: true, 4), Is.Empty, "a null sim selects nothing");

            // And the no-op is TOTAL: nothing was designated on the way out, so the verb-less occupancy
            // path (which never calls the harness at all) cannot possibly zone a tile.
            var sim = Slice();
            Assert.That(StockpileHarness.EnqueueStockpile(sim, far: true, 0), Is.EqualTo(0),
                "N=0 enqueues no DesignateStockpileCommand at all");
            Assert.That(StockpileHarness.EnqueueFilteredFarStockpile(sim, 0), Is.EqualTo(0),
                "N=0 enqueues neither a designate nor a filter command");
            sim.Tick();
            Assert.That(CountStockpileTiles(sim), Is.EqualTo(0), "no tile may be zoned by a no-op selection");
            Assert.That(sim.StockZones.Zones, Is.Empty, "and no filter entry may exist either");
        }

        private static int CountStockpileTiles(Simulation sim)
        {
            var w = sim.World;
            int n = 0;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                        if ((w.GetFlags(new Int3(x, y, z)) & TileFlags.Stockpile) != 0) n++;
            return n;
        }

        /// <summary>
        /// WP-4b — <c>filtered-far</c> is <c>far</c>'s TILES plus a Potato-rejecting filter, and both
        /// halves of that sentence are load-bearing. This is the test whose absence let a reviewer mutate
        /// the mode into meaninglessness with the whole suite still green.
        ///
        /// MUTATION M1 — <c>SelectStockpile(sim, far: true, n)</c> → <c>far: false</c> inside
        /// <c>EnqueueFilteredFarStockpile</c>: the mode zones the BENCH deck and the A/B against `far`
        /// is destroyed. Caught by the tile-set equality (and by the deck assertion).
        ///
        /// MUTATION M2 — delete the <c>SetStockpileFilterCommand</c> enqueue: <c>filtered-far</c>
        /// silently degenerates into <c>far</c>, i.e. the "after" leg secretly re-measures the "before"
        /// leg. Caught by the stored-mask assertion (no entry ⇒ <c>TryGetFilter</c> false) and by
        /// <c>Accepts(Potato)</c> flipping to true.
        ///
        /// The tile set is read from the WORLD after the tick, not from the returned list, so it pins
        /// what the sim actually did rather than what the harness intended.
        /// </summary>
        [Test]
        public void EnqueueFilteredFar_ZonesTheSameFarTiles_AndRejectsPotato()
        {
            var sim = Slice();
            List<Int3> expected = StockpileHarness.SelectStockpile(sim, far: true, 4);
            Assert.That(expected.Count, Is.EqualTo(4), "precondition: the slice has 4 legal far tiles");

            var designated = new List<Int3>();
            int zoned = StockpileHarness.EnqueueFilteredFarStockpile(sim, 4, null, designated);
            Assert.That(zoned, Is.EqualTo(4), "all 4 far tiles must be designated");
            sim.Tick();   // applies the enqueued Designate + SetStockpileFilter commands at the boundary

            // M1: the tiles the SIM ended up zoning must be exactly `far`'s tiles.
            var actual = new List<Int3>();
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Stockpile) != 0) actual.Add(p);
                    }
            Assert.That(actual, Is.EquivalentTo(expected),
                "filtered-far must zone the SAME tiles as far — otherwise the two legs are not an A/B");
            Assert.That(designated, Is.EqualTo(expected), "the reported designated list must be the far selection");
            foreach (var p in expected)
                Assert.That(p.Z, Is.EqualTo(1), $"{p} must be on the far deck (1), not the bench deck");

            // M2: every one of them really carries the filter.
            foreach (var p in expected)
            {
                Assert.That(sim.StockZones.TryGetFilter(p, out ulong m), Is.True,
                    $"{p} must carry a STORED filter entry — with none, filtered-far silently degenerates " +
                    "into the accept-all far leg and the 'after' re-measures the 'before'");
                Assert.That(m, Is.EqualTo(StockpileHarness.RejectPotatoMask),
                    $"{p}'s stored mask must be exactly RejectPotatoMask");
                Assert.That(sim.StockZones.Accepts(p, ItemKind.Potato), Is.False,
                    $"{p} must REJECT Potato — that is what the mode names");
                Assert.That(sim.StockZones.Accepts(p, ItemKind.ControllerModule), Is.True,
                    $"{p} must still accept the terminal good");
            }
        }

        /// <summary>
        /// WP-4b (review NICE-TO-HAVE 1) — THE LIVENESS HALF OF THE GATE. `IsReachableByAnyCrew` makes
        /// two claims its shipped tests could not see, and a reviewer proved both invisible: mutating
        /// the crew loop to probe only <c>crew[0]</c>, and deleting the <c>Dead</c> skip, each left the
        /// WHOLE suite green. Both are pinned here, each by the arrangement that makes it BITE.
        ///
        /// MUTATION R3 — `for (i = 0; i &lt; crew.Count; …)` → `i &lt; 1` (i.e. "any crew" collapses to
        /// "crew 0"): killing crew[0] must NOT change the selection, because seven others can still
        /// reach the tiles. Under R3 the only witness is dead ⇒ nothing is reachable ⇒ empty. FAILS.
        ///
        /// MUTATION R4 — delete `if (crew[i].Dead) continue;`: with EVERY crew member dead there is no
        /// one to haul, so nothing is a legal measurement tile and the selection must be EMPTY. Under
        /// R4 corpses count as reachability witnesses ⇒ a full selection comes back. FAILS.
        ///
        /// Also pins the documented "no crew aboard ⇒ empty" for a genuinely crewless sim (the crew
        /// REMOVED, not merely dead) — the harness's stated contract, previously untested.
        /// </summary>
        [Test]
        public void ReachabilityGate_NeedsALIVECrewMember_AndConsultsAllOfThem()
        {
            // R3: crew[0] dead, the rest alive ⇒ the other seven are still valid witnesses.
            var one = Slice();
            Assert.That(one.Citizens.Items.Count, Is.GreaterThan(1),
                "precondition: the slice must have >1 crew member, or 'consults all of them' is vacuous");
            one.Citizens.Items[0].Dead = true;
            Assert.That(StockpileHarness.SelectStockpile(one, far: true, 4), Has.Count.EqualTo(4),
                "one dead crew member must not shrink the selection — the gate asks EVERY live crew " +
                "member, not just the first");

            // R4: everybody dead ⇒ no one can haul ⇒ no tile is a legal measurement tile.
            var allDead = Slice();
            foreach (var c in allDead.Citizens.Items) c.Dead = true;
            Assert.That(StockpileHarness.SelectStockpile(allDead, far: true, 4), Is.Empty,
                "with no LIVE crew nothing is reachable — a corpse is not a reachability witness");
            Assert.That(StockpileHarness.EnqueueFilteredFarStockpile(allDead, 4), Is.EqualTo(0),
                "and nothing is designated either");

            // The documented crewless case: crew removed outright, not just dead.
            var crewless = Slice();
            var ids = new List<uint>();
            foreach (var c in crewless.Citizens.Items) ids.Add(c.Id);
            foreach (var id in ids) crewless.Citizens.Remove(id);
            Assert.That(crewless.Citizens.Items, Is.Empty, "precondition: the sim must really be crewless");
            Assert.That(StockpileHarness.SelectStockpile(crewless, far: true, 4), Is.Empty,
                "a crewless ship has no legal measurement tile at all");
        }

        /// <summary>
        /// WP-4b — THE MATTER-CEILING WARNING IS GUARDED, because it is the remediation for the exact
        /// misreading that caused this whole retraction: `occupancy --ship slice --days 3` reports
        /// `ControllerModule=31`, that 31 is the ship's matter ceiling rather than a throughput reading
        /// (`MECHANICS §13.15`), and this lane published it as a wrong-deck regression. A reviewer
        /// mutation deleted the warning with a fully green gate — an untested remediation is the pattern
        /// this lane has failed on repeatedly, so the branch is pinned here.
        ///
        /// MUTATION: `if (stripN &gt; 0) return null;` → `if (stripN &gt;= 0) return null;` (equivalently
        /// the old call-site form `stripN &lt;= 0` → `stripN &lt; 0`) ⇒ the no-headroom case returns null,
        /// the warning vanishes from every default run, and the first assertion fails.
        /// MUTATION: return the warning unconditionally ⇒ the `--strip 40` assertion fails, which is the
        /// half that keeps the warning HONEST — a run with headroom must not be told it has none.
        ///
        /// The message CONTENT is asserted too, not just its presence: a warning that no longer names the
        /// remedy (`--strip`) or the constraint (matter) has stopped being a remediation.
        /// </summary>
        [Test]
        public void MatterHeadroomWarning_AppearsWithoutStrip_AndVanishesWithIt()
        {
            string noHeadroom = StockpileHarness.MatterHeadroomWarning(0);
            Assert.That(noHeadroom, Is.Not.Null,
                "a run with no --strip MUST be warned that its ControllerModule count is a matter " +
                "ceiling — that unwarned number is what this lane published as a wrong-deck regression");
            Assert.That(noHeadroom, Does.Contain("--strip"), "the warning must name the remedy");
            Assert.That(noHeadroom.ToUpperInvariant(), Does.Contain("MATTER"),
                "the warning must name the binding constraint");

            Assert.That(StockpileHarness.MatterHeadroomWarning(40), Is.Null,
                "a run WITH headroom must not be warned it has none — the warning has to discriminate, " +
                "or it is noise that readers learn to skip");
            Assert.That(StockpileHarness.MatterHeadroomWarning(1), Is.Null,
                "one stripped wall is still headroom: the boundary is > 0, not some threshold");
        }

        /// <summary>
        /// WP-4b (review NICE-TO-HAVE 2) — THE PURITY PIN, and it guards a determinism invariant rather
        /// than a nicety. `IsReachableByAnyCrew` takes a caller-owned <c>scratch</c> list precisely so it
        /// never writes <c>Citizen.Path</c>; `Path` and `PathIndex` are FOLDED INTO
        /// <see cref="Simulation.StateHash"/> (W0-1b hashed the thirteen saved-but-unhashed fields), so
        /// a measurement helper that borrowed a crew member's path buffer would silently mutate hashed
        /// sim state — the exact class of thing that moves a pin for no reason.
        ///
        /// MUTATION R2 — swap `scratch` for `crew[i].Path` inside `IsReachableByAnyCrew`: the whole
        /// shipped suite stayed GREEN before this test existed. Here the StateHash comparison fails.
        ///
        /// N=40 with far:true is chosen deliberately: it runs the gate over many candidates INCLUDING
        /// 26 failed probes, so every branch of the loop writes to the buffer.
        /// </summary>
        [Test]
        public void SelectStockpile_DoesNotMutateHashedSimState()
        {
            var sim = Slice();
            ulong before = sim.StateHash();
            List<Int3> picks = StockpileHarness.SelectStockpile(sim, far: true, 40);
            Assert.That(picks, Has.Count.EqualTo(40),
                "precondition: the selection must actually run (and probe failures) for this to pin anything");
            Assert.That(sim.StateHash(), Is.EqualTo(before),
                "SelectStockpile must not touch hashed sim state — Citizen.Path/PathIndex are folded " +
                "into StateHash, so borrowing a crew member's path buffer as pathfinder scratch would " +
                "make a measurement helper move a determinism pin");
        }

        /// <summary>
        /// WP-4b — the mask is DERIVED from the enum through WP-6's <c>AcceptAllMask</c>, restricted to
        /// the live <see cref="ItemKind"/> range, and still restrictive enough to be STORED.
        ///
        /// Why each row matters:
        ///   1. No bit above the last declared kind. The previous spelling
        ///      (<c>~(1UL &lt;&lt; Potato)</c> = <c>0xFFFFFFFFFFFFFFF7</c>) set 57 inert bits that were
        ///      nevertheless folded verbatim into <c>StockZoneSystem.StateChecksum</c>, so this harness's
        ///      zone checksum could not be compared with a client-authored mask.
        ///   2. Exactly one kind rejected, and it is Potato. Derived here from the ENUM
        ///      (<c>Enum.GetValues</c>), not from <c>AcceptAllMask</c>, so the row does not simply restate
        ///      the harness's own arithmetic.
        ///   3. NOT equal to <c>AcceptAllMask</c>. This is the non-obvious one: WP-6 collapses an
        ///      accept-everything mask to NO ENTRY, so a mask that accidentally accepted every kind would
        ///      leave the "filtered" leg with no filter at all and no test would notice — the sim would
        ///      simply be running the <c>far</c> leg under a different mode name.
        ///
        /// MUTATION: drop the <c>&amp; StockZoneSystem.AcceptAllMask</c> ⇒ row 1 fails. MUTATION: reject
        /// a different kind (e.g. Scrap) ⇒ row 2 fails. MUTATION: define it as
        /// <c>StockZoneSystem.AcceptAllMask</c> ⇒ rows 2 and 3 fail.
        /// </summary>
        [Test]
        public void RejectPotatoMask_IsLiveRangeOnly_RejectsOnlyPotato_AndIsStorable()
        {
            ulong mask = StockpileHarness.RejectPotatoMask;

            Assert.That(mask & ~StockZoneSystem.AcceptAllMask, Is.EqualTo(0UL),
                $"0x{mask:x16} sets bits above the last declared ItemKind — inert in behaviour, but folded " +
                "verbatim into StockZoneSystem.StateChecksum, so it would make this harness's zone " +
                "checksum incomparable with a client-authored mask");

            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
            {
                bool accepted = (mask & (1UL << (int)k)) != 0;
                Assert.That(accepted, Is.EqualTo(k != ItemKind.Potato),
                    $"{k} must be {(k == ItemKind.Potato ? "REJECTED" : "accepted")} by RejectPotatoMask");
            }

            Assert.That(mask, Is.Not.EqualTo(StockZoneSystem.AcceptAllMask),
                "an accept-EVERYTHING mask is collapsed to no entry by StockZoneSystem.SetFilter, so this " +
                "mask must genuinely restrict something or filtered-far carries no filter");
        }
    }
}
