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
    /// E0-4 WP-3 — the <c>occupancy --stockpile &lt;bench|far&gt; [N]</c> measurement selector
    /// (<see cref="StockpileHarness"/>). Host-side, zero sim state; this pins only that it selects the
    /// prefix of a TOTAL order over walkable tiles — so the A/B a reviewer reruns is the same experiment
    /// every time, on the same tiles. The sim mechanics (filter/haul) are pinned by the WP-1/WP-2/WP-4
    /// suites.
    /// </summary>
    public class StockpileHarnessTests
    {
        private static Simulation Slice() =>
            GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

        private static bool IsBench(DeviceKind k) =>
            k == DeviceKind.SalvageRecycler || k == DeviceKind.Fabricator || k == DeviceKind.MachineShop;

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
        /// for them (measured on the slice: bench N=12 ⇒ 12 candidates for 9 slots; far N=12 ⇒ 8 for 4).
        /// N=12 is chosen for MARGIN, not because a smaller N was vacuous: N=4 also passes the guard and
        /// the tie-break mutation already bites there. At N=12, 9 of the 12 picks are tie-decided instead
        /// of 1 of 4, so the mutation is caught by a much wider margin and the test survives a future
        /// shift in slice geometry. (Not every N is safe: far N=8 lands EXACTLY on the boundary — 5
        /// candidates for 5 slots — and would be vacuous; the guard would say so rather than pass.)
        ///
        /// MUTATION: remove the <c>a.key.CompareTo(b.key)</c> tie-break from the sort (i.e.
        /// <c>return c;</c>) ⇒ the 807-element introsort reorders the contested boundary and the pick
        /// list no longer equals the oracle prefix. Second MUTATION: swap
        /// <c>far ? b.dist.CompareTo(a.dist) : a.dist.CompareTo(b.dist)</c> to the other way round ⇒ each
        /// mode returns the other mode's prefix.</summary>
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
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        var f = world.GetFlags(p);
                        if ((f & TileFlags.Stockpile) != 0) anyPreZoned = true;
                        if ((f & TileFlags.Walkable) == 0) continue;
                        // 100_000 is StockpileHarness.DeckPenalty (private), mirrored DELIBERATELY — it is
                        // the metric's definition, not a property. Change it there and this fails with an
                        // ordering message: the cause is here, not in the sort.
                        cands.Add((benches.Min(b =>
                            Math.Abs(p.X - b.X) + Math.Abs(p.Y - b.Y) + 100_000 * Math.Abs(p.Z - b.Z)), p));
                    }
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

        /// <summary>Every pick is a legal stockpile tile: walkable floor (the exact gate
        /// <c>DesignateStockpileCommand</c> enforces) and not already zoned, in strict canonical z,y,x
        /// order among equal-distance ties. MUTATION: drop the walkable filter ⇒ a wall/void tile is
        /// picked and the walkable assertion fails (far mode only — bench mode's nearest tiles are
        /// walkable either way, so the <c>far=false</c> case does not detect this).</summary>
        [Test]
        public void SelectStockpile_PicksAreWalkableFloor([Values(false, true)] bool far)
        {
            var world = Slice().World;
            List<Int3> picks = StockpileHarness.SelectStockpile(Slice(), far, 4);
            foreach (var p in picks)
                Assert.That((world.GetFlags(p) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                    $"{p} is not walkable floor — a stockpile can never live there");
        }

        /// <summary>The two modes MEAN opposite things: <c>far</c> lands on the deck OPPOSITE the
        /// crafting benches (the wrong-deck regression), <c>bench</c> lands on the SAME deck as (and on
        /// and beside) them (the buffer). On the slice the three benches are all on deck 0, so far ⇒
        /// deck 1, bench ⇒ deck 0. MUTATION: flip the ascending/descending distance compare ⇒ the deck
        /// assertions swap and this fails.</summary>
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
                Assert.That(p.Z, Is.EqualTo(0), $"bench-mode tile {p} must be on the bench deck (0)");
            foreach (var p in far)
                Assert.That(p.Z, Is.EqualTo(1), $"far-mode tile {p} must be on the opposite deck (1)");
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
        }
    }
}
