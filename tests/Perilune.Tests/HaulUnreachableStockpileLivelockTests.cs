using System;
using System.Collections.Generic;
using Perilune.Sim;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-7 — REGRESSION TESTS for the unreachable-stockpile haul livelock.
    ///
    /// HISTORY. This file began life on <c>lane/e0-4-haul-diagnosis</c> (commit 487d924) as a
    /// CHARACTERIZATION suite that asserted the BROKEN behaviour on purpose, so that whoever fixed
    /// the bug would find out immediately. WP-7 is that fix, and this is the same file with the same
    /// scenarios, inverted: every assertion now pins the FIXED behaviour, and the measured numbers
    /// from the diagnosis are kept verbatim below because they are the evidence.
    ///
    /// THE PATHOLOGY THAT WAS. Zone a stockpile tile that is walkable but that no crew member can
    /// *path* to, and every idle crew member entered a two-tick claim/abandon livelock that never
    /// delivered anything:
    ///
    ///   tick N   : <see cref="HaulJobSource.TryClaim"/> succeeds — the citizen is standing ON the
    ///              nearest loose stack, so <c>PathService.FindPath(start == goal)</c> returns true
    ///              with an EMPTY path (<c>Path/PathService.cs:37</c>). JobKind = HaulPickup.
    ///   tick N+1 : ProgressPickup sees HasPath == false and Pos == JobTarget, so it calls
    ///              TryPathToFreeStockpile, which finds no *reachable* free tile and returns false.
    ///              The reservation is released and the job abandoned — with NO backoff recorded,
    ///              unlike the TryClaim failure path and unlike the discipline MECHANICS §6.2 step 4
    ///              documents.
    ///   tick N+2 : identical to tick N. Forever.
    ///
    /// ROOT CAUSE. The candidate gate asked "does a free stockpile tile EXIST"
    /// (<see cref="JobWork.IsFreeStockpileTile"/>, <c>JobContext.cs:115</c> — Stockpile flag +
    /// Walkable flag + no ground stack). It never asked "can anyone REACH it". The delivery step
    /// asked the stronger question and could never be satisfied, so the job board manufactured work
    /// that could never be completed.
    ///
    /// THE FIX (WP-7, M3). A per-TILE unreachable backoff in <see cref="HaulJobSource"/>: every
    /// failed <c>FindPath</c> to a stockpile tile stamps that tile for
    /// <see cref="JobWork.UnreachableRetryTicks"/>, every successful one clears it, and all THREE
    /// read sites — the kind-less candidate gate, the E0-4 filtered <c>AnyFreeStockpileAccepts</c>,
    /// and the destination-selection loop — skip a stamped tile. Transient job-board scratch: never
    /// saved, never hashed, never iterated, so all four determinism pins are unmoved.
    ///
    /// MEASURED, 30,000 slice ticks (the same harness the diagnosis used):
    ///   the 3 sealed-observatory tiles zoned : 72,928 pickup starts / 0 deliveries / 31.191 % of
    ///                                          crew-ticks  →  918 / 0 / 2.254 %  (51 s → 1.2 s wall)
    ///   (60,1,1) alone, far deck, REACHABLE  : 2 / 2 / 0.175 %  →  2 / 2 / 0.175 % (unchanged)
    ///   `bench` 4, reachable                 : 10 / 9 / 0.913 %  →  10 / 9 / 0.913 % (unchanged)
    /// Cross-deck haul was never the problem, and the fix must not suppress it — hence the controls.
    ///
    /// PRE-EXISTING, NOT E0-4. Measured identically at the lane parent 6911d18 (pre-E0-4): 30,000
    /// ticks, the four `--stockpile far 4` tiles zoned by hand → 75,872 pickup starts, ticks/start
    /// 1.06, pickup share 33.457 %.
    ///
    /// THE SLICE SHIPS SUCH A TILE. The observatory (x52–58, y12–15, z1) is authored sealed —
    /// <c>AuthoredShips.cs:93</c> <c>DoorClosed = true</c>, "Reyes sealed himself in" — and
    /// <see cref="Simulation.IsWalkable"/> refuses a closed door (<c>Simulation.cs:155</c>), so its
    /// floor is permanently unreachable while still carrying <see cref="TileFlags.Walkable"/>. The
    /// E0-4 WP-3 `--stockpile far` harness picks three of its tiles, which is why that leg measured
    /// 49.233 % HaulPickup against 0.017 % HaulDeliver.
    ///
    /// THE NAMED MUTATIONS. Ten, each physically applied to the source, run, observed failing, and
    /// reverted; every one was checked against the WHOLE file, so no mutation is credited to a test
    /// that some other assertion happened to catch. Failure counts out of 10 tests:
    ///   M-A  `AuthoredShips.cs:93` DoorClosed true → false (unseal the observatory)   → 5
    ///   M-B  the kind-less candidate gate stops consulting the backoff                → 1  (sole)
    ///   M-C1 `IsPathworthy` returns false always (a permanent global blacklist)        → 9
    ///   M-C2 a SUCCESSFUL path stamps the tile instead of clearing it                  → 1  (sole)
    ///   M-D1 `BeginTick` never wakes the board when a backoff expires                  → 2
    ///   M-E  a tile-board change no longer forgets the backoffs                        → 1  (sole)
    ///   M-F  the E0-4 FILTERED gate stops consulting the backoff                       → 1  (sole)
    ///   M-G  `IsPathworthy` drops its expiry comparison (blacklist until a tile edit)  → 3
    ///   M-H  the map is rebuilt with `new Dictionary…` instead of `Clear()`ed          → 1  (sole)
    ///   M-I  the backoffs are forgotten on EVERY rescan, not only a tile-board change  → 4
    /// "(sole)" = that test is the only one in this file which catches it. M-I is the guard against
    /// over-clearing, the failure mode in the opposite direction from M-E: forget too eagerly and the
    /// livelock comes straight back (it fails
    /// <see cref="UnreachableStockpile_NoLongerLivelocksTheHaulBoard"/>).
    /// </summary>
    public class HaulUnreachableStockpileLivelockTests
    {
        /// <summary>Three tiles inside the slice's sealed observatory — walkable floor, zero crew
        /// can path there. Exactly the tiles `occupancy --stockpile far 4` designates.</summary>
        private static readonly Int3[] SealedObservatoryTiles =
        {
            new Int3(58, 14, 1), new Int3(57, 15, 1), new Int3(58, 15, 1),
        };

        /// <summary>A far-deck tile that IS reachable — the control that proves reachability, not
        /// distance or deck, is the differentiator.</summary>
        private static readonly Int3 ReachableFarTile = new Int3(60, 1, 1);

        private static SimHost BootSlice() => SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);

        /// <summary>The live <see cref="HaulJobSource"/> out of the running stack — the WP-7
        /// diagnostic surface (<see cref="HaulJobSource.BackedOffStockpileTiles"/>) hangs off it, and
        /// reading it is how these tests prove the backoff branch was REACHED rather than inferring a
        /// quiet board from some unrelated cause.</summary>
        private static HaulJobSource Haul(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (!(systems[i] is JobSystem js)) continue;
                for (int s = 0; s < js.Sources.Count; s++)
                    if (js.Sources[s] is HaulJobSource h) return h;
            }
            Assert.Fail("no HaulJobSource in the running system stack");
            return null;
        }

        /// <summary>Counts of interest over a run: how often crew ENTER each haul phase, and the
        /// high-water mark of the WP-7 backoff map.</summary>
        private struct Counts
        {
            public int PickupStarts, DeliverStarts, DeliverTicks, PickupTicks, MaxBackedOff;
        }

        private static Counts Run(Simulation sim, int ticks)
        {
            var haul = Haul(sim);
            var crew = sim.Citizens.Items;
            var wasPickup = new bool[crew.Count];
            var wasDeliver = new bool[crew.Count];
            var c = new Counts();

            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (haul.BackedOffStockpileTiles > c.MaxBackedOff) c.MaxBackedOff = haul.BackedOffStockpileTiles;
                for (int i = 0; i < crew.Count; i++)
                {
                    bool p = crew[i].JobKind == JobKind.HaulPickup;
                    bool d = crew[i].JobKind == JobKind.HaulDeliver;
                    if (p && !wasPickup[i]) c.PickupStarts++;
                    if (d && !wasDeliver[i]) c.DeliverStarts++;
                    if (p) c.PickupTicks++;
                    if (d) c.DeliverTicks++;
                    wasPickup[i] = p;
                    wasDeliver[i] = d;
                }
            }
            return c;
        }

        private static void ZoneObservatory(Simulation sim)
        {
            for (int i = 0; i < SealedObservatoryTiles.Length; i++)
                sim.EnqueueCommand(new DesignateStockpileCommand(SealedObservatoryTiles[i], on: true));
        }

        // ---------------------------------------------------------------- the premise

        /// <summary>The premise every other assertion here rests on: these tiles pass the job
        /// board's free-stockpile predicate, and no crew member can path to any of them.</summary>
        [Test]
        public void SealedObservatoryTiles_AreWalkableFlagged_ButUnreachable()
        {
            var sim = BootSlice().Sim;
            var path = new List<Int3>(256);

            foreach (var tile in SealedObservatoryTiles)
            {
                Assert.That((sim.World.GetFlags(tile) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                    $"{tile} must carry the Walkable flag the free-stockpile predicate reads");
                foreach (var citizen in sim.Citizens.Items)
                    Assert.That(sim.Paths.FindPath(sim, citizen.Pos, tile, path), Is.False,
                        $"no crew member may reach {tile} — the observatory door is authored closed");
            }
        }

        // ------------------------------------------------------------------- the fix

        /// <summary>
        /// The livelock is gone. Zone only the unreachable tiles, run 3,000 ticks, and count how
        /// often crew ENTER HaulPickup. Before WP-7 this was ~7,300 (one per crew member every other
        /// tick, forever, measured 72,928 over 30,000); after it is a bounded trickle — one re-probe
        /// per <see cref="JobWork.UnreachableRetryTicks"/> while the zone stays unreachable.
        ///
        /// The <see cref="Counts.MaxBackedOff"/> assertions are NOT decoration: without them a
        /// quiet board would satisfy the churn ceiling for any number of unrelated reasons (no
        /// haulable items, a broken tile scan, crew all dead), and the test would pass while
        /// asserting nothing about WP-7. They pin that the backoff branch was actually entered, and
        /// that the map it fills is bounded by the zoned tile count rather than growing per tick.
        ///
        /// NAMED MUTATIONS caught here (applied, observed failing, reverted): M-B (the kind-less
        /// gate stops consulting the backoff — this test is the ONLY one M-B fails, so it is the
        /// sole guard on that call site), M-A, M-C1, M-I.
        /// </summary>
        [Test]
        public void UnreachableStockpile_NoLongerLivelocksTheHaulBoard()
        {
            var sim = BootSlice().Sim;
            ZoneObservatory(sim);

            const int Ticks = 3000;
            var c = Run(sim, Ticks);

            Assert.That(c.MaxBackedOff, Is.GreaterThan(0),
                "the WP-7 backoff branch must actually be REACHED — a quiet board proves nothing " +
                "about this fix unless a tile was stamped unreachable");
            Assert.That(c.MaxBackedOff, Is.LessThanOrEqualTo(SealedObservatoryTiles.Length),
                "the backoff map is bounded by the stockpile tile count at ALL times — only tiles " +
                "taken from `_stockpiles` are ever stamped, and JobSystem.Rescan rebuilds that list " +
                "(the tile-scanner pass) BEFORE ForgetBackoffsOnTileChange empties the map, both " +
                "behind the same Tiles flag, so the map can never outlive the board it indexes");
            Assert.That(c.DeliverTicks, Is.Zero,
                "nothing can be delivered into a sealed room — that part was never the bug");
            Assert.That(c.PickupStarts, Is.LessThan(200),
                $"the board must stop manufacturing haul work with no reachable destination " +
                $"({c.PickupStarts} claims in {Ticks} ticks; the shipped bug produced ~7,300, and the " +
                "ceiling here is roughly one re-probe per UnreachableRetryTicks per idle crew member)");
        }

        // --------------------------------------------------------------- the controls

        /// <summary>
        /// The control that proves reachability — not distance, not deck, not the E0-4 filter — is
        /// the differentiator, AND that WP-7 did not buy its quiet board by suppressing legitimate
        /// haul. A fix that greys out a working zone is worse than the livelock, so this asserts
        /// deliveries actually HAPPEN, not merely that the churn is low.
        ///
        /// NAMED MUTATION caught here: M-C1 (`IsPathworthy` always false). That is the whole shape
        /// of "the fix is worse than the bug" — a backoff that never lifts silently greys out every
        /// zone on the ship, and this control is what refuses to let that pass.
        /// </summary>
        [Test]
        public void ReachableFarStockpile_StillDeliversAndDoesNotLivelock()
        {
            var sim = BootSlice().Sim;
            sim.EnqueueCommand(new DesignateStockpileCommand(ReachableFarTile, on: true));

            var c = Run(sim, 3000);

            Assert.That(c.DeliverStarts, Is.GreaterThan(0),
                "a REACHABLE far-deck stockpile must still receive cargo — WP-7 must not suppress " +
                "legitimate cross-deck haul");
            Assert.That(c.PickupStarts, Is.LessThan(50),
                "a REACHABLE far-deck stockpile is healthy — cross-deck haul works; the livelock " +
                "needs a free-but-unreachable tile");
        }

        /// <summary>
        /// A stockpile beside the crafting benches — the pre-positioning-buffer case, chosen by the
        /// same <c>occupancy --stockpile bench</c> selector the lane measures with — keeps working
        /// and keeps filling. The second half of "the fix must not cost throughput".
        ///
        /// NAMED MUTATIONS caught here: M-C2 (a successful path stamps the tile instead of clearing
        /// it — this test is the ONLY one M-C2 fails, so it is the sole guard on the clear half of
        /// the stamp/clear pair) and M-C1.
        /// </summary>
        [Test]
        public void BenchStockpile_StillFills()
        {
            var sim = BootSlice().Sim;
            var tiles = Perilune.Tools.StockpileHarness.SelectStockpile(sim, far: false, n: 4);
            Assert.That(tiles.Count, Is.EqualTo(4), "the slice must offer four bench-adjacent tiles");
            for (int i = 0; i < tiles.Count; i++)
                sim.EnqueueCommand(new DesignateStockpileCommand(tiles[i], on: true));

            var c = Run(sim, 3000);

            int stored = 0;
            foreach (var it in sim.Items.Items)
                if (it.CarriedBy == 0 && (sim.World.GetFlags(it.Pos) & TileFlags.Stockpile) != 0) stored++;

            Assert.That(c.DeliverStarts, Is.GreaterThan(0), "the bench buffer must still receive cargo");
            Assert.That(stored, Is.GreaterThan(0), "and stacks must actually come to rest inside it");
            Assert.That(c.MaxBackedOff, Is.Zero,
                "no bench-adjacent tile is unreachable, so WP-7 must never stamp one — a fix that " +
                "backs off reachable tiles would be the RimWorld grey-out bug in miniature");
        }

        // ------------------------------------------------------- symmetry / self-healing

        /// <summary>
        /// A BACKOFF IS A RATE LIMITER, NOT A BLACKLIST. Zone the sealed observatory, let the board
        /// stamp it unreachable, then break the seal (open the door — exactly what a crew member or a
        /// MOSS script would do) and assert the zone comes back to life without any invalidation
        /// hook: the stamps expire, <c>BeginTick</c> wakes the board, a hauler paths in, and the
        /// successful FindPath clears the stamp.
        ///
        /// This is the test that would catch the obvious wrong fix (a permanent unreachable set) and
        /// the subtle one (a correct expiry that nothing ever re-triggers, leaving the board asleep
        /// on a quiet ship). <c>SetDoorStateCommand</c> deliberately does NOT set
        /// <see cref="Simulation.JobsDirty"/>, so the wake-up has to come from WP-7 itself.
        ///
        /// MEASURED LIMIT, stated because it matters. On the slice this test does NOT depend on the
        /// wake-up: the board is re-dirtied constantly by dig/build/craft traffic, so M-D1 (kill the
        /// wake) passes it. It catches M-G (never expire) and M-C1 (never lift), which is what it is
        /// for; the wake-up itself is pinned by
        /// <see cref="SealedZone_ComesBackToLife_WithNothingElseDirtyingTheBoard"/>, on a bare stack
        /// where no other writer of JobsDirty exists. A slice test is a good canary and a bad proof.
        /// </summary>
        [Test]
        public void BackedOffTile_GoesLiveAgain_WhenTheSealIsBroken()
        {
            var sim = BootSlice().Sim;
            ZoneObservatory(sim);

            var before = Run(sim, 600);
            Assert.That(before.MaxBackedOff, Is.GreaterThan(0),
                "premise: the observatory tiles must have been stamped unreachable first");
            Assert.That(before.DeliverStarts, Is.Zero, "premise: nothing could be delivered while sealed");

            uint doorId = 0;
            foreach (var d in sim.Devices.Items)
                if (d.Kind == DeviceKind.Door && d.Name == "door_observatory") doorId = d.Id;
            Assert.That(doorId, Is.Not.Zero, "the slice must author a named observatory door");
            sim.EnqueueCommand(new SetDoorStateCommand(doorId, open: true));

            var after = Run(sim, 3000);

            Assert.That(after.DeliverStarts, Is.GreaterThan(0),
                "with the seal broken the zone must become a live destination again — the backoff " +
                "expires, BeginTick re-dirties the board, and the successful path clears the stamp");
        }

        /// <summary>
        /// The map is reclaimed when the player un-zones. Stamp the observatory tiles, then clear
        /// their Stockpile bit and tick twice: <c>ForgetBackoffsOnTileChange</c> must drop the
        /// now-meaningless entries on the Tiles-dirty rescan the de-designation triggers, which is
        /// what BOUNDS the map to the stockpile tile count over a long game of paint-and-repaint.
        ///
        /// Two ticks, not fifty, and the count reaching ZERO is unambiguous: WP-7 has no sweep, so an
        /// expired entry STAYS in the map (<c>IsPathworthy</c> simply reads past its deadline) and
        /// expiry can never decrement the count. The clear is the only thing in the package that can
        /// remove an entry the player did not make reachable.
        ///
        /// NAMED MUTATION caught here: M-E (`ForgetBackoffsOnTileChange` stops clearing). This test
        /// is the ONLY one M-E fails — it is the sole guard on the map's bound AND on the
        /// re-open-immediately-on-a-terrain-edit promise.
        /// </summary>
        [Test]
        public void UnzoningAStockpile_ReclaimsItsBackoffEntry()
        {
            var sim = BootSlice().Sim;
            ZoneObservatory(sim);
            var haul = Haul(sim);

            int guard = 0;
            while (haul.BackedOffStockpileTiles == 0 && guard++ < 600) sim.Tick();
            Assert.That(haul.BackedOffStockpileTiles, Is.GreaterThan(0),
                "premise: a tile must be stamped before un-zoning can reclaim it");
            long stampedAt = sim.TickCount;

            for (int i = 0; i < SealedObservatoryTiles.Length; i++)
                sim.EnqueueCommand(new DesignateStockpileCommand(SealedObservatoryTiles[i], on: false));
            sim.Tick(); // command applies + Tiles-dirty rescan
            sim.Tick();

            Assert.That(sim.TickCount - stampedAt, Is.LessThan(JobWork.UnreachableRetryTicks),
                "belt-and-braces, and deliberately kept although WP-7 no longer needs it: the entries " +
                "are still inside their backoff window. If anyone ever reintroduces an expiry sweep, " +
                "this line stops the test below from starting to pass for THAT reason instead");
            Assert.That(haul.BackedOffStockpileTiles, Is.Zero,
                "un-zoning a stockpile must reclaim its backoff entry. Nothing else in WP-7 can " +
                "remove one — a successful path needs a reachable tile and there is none, and expiry " +
                "leaves the entry in place — so a ZERO count here is direct proof that " +
                "ForgetBackoffsOnTileChange fired, not merely evidence consistent with it");
        }

        // ------------------------------------------- the liveness guarantee, in isolation

        /// <summary>A sealed two-room corridor: the left half is where the crew and the cargo live,
        /// the right half is walled off at column 6 and is where the stockpile goes.</summary>
        private static readonly string[] SealedRoomMap =
        {
            "#############",
            "#.....#.....#",
            "#.....#.....#",
            "#############",
        };

        /// <summary>
        /// THE LIVENESS GUARANTEE, isolated. The slice cannot test this: its board is re-dirtied
        /// constantly by dig/build/craft traffic, so the zone would come back there even if WP-7's
        /// wake-up did nothing (verified — the wake-up mutation passes every slice-based test in
        /// this file). A bare <see cref="JobSystem"/>-only sim has no other dirty source at all,
        /// which is exactly what makes the guarantee observable.
        ///
        /// The tile backoff acts through Rescan's candidate gate, and Rescan runs only when
        /// <see cref="Simulation.JobsDirty"/> is set — so once the gate closes on an unreachable
        /// zone, SOMETHING has to re-open it or the zone is dead forever. Here the wall is knocked
        /// out by writing the world DIRECTLY: no command, no <c>TileChangedEvent</c>, no JobsDirty.
        /// (That is not a contrivance — <see cref="SetDoorStateCommand"/>, the way a player or a
        /// MOSS script actually breaks a seal, sets no JobsDirty either.) The only thing that can
        /// wake the board is <see cref="HaulJobSource.BeginTick"/>'s expiry check.
        ///
        /// NAMED MUTATIONS caught here: M-D1 (BeginTick never wakes the board) — before this test
        /// existed the wake-up was live but wholly untested, which is how that was found — plus
        /// M-C1, M-G and M-I.
        /// </summary>
        [Test]
        public void SealedZone_ComesBackToLife_WithNothingElseDirtyingTheBoard()
        {
            // CitizenSystem (movement) then JobSystem (dispatch) — the shipped order, and the
            // smallest stack that can carry a haul from claim to delivery. Nothing else: no
            // sustenance, no crafting, no build, no atmosphere, so no other writer of JobsDirty.
            var sim = new Simulation(AsciiWorld.Build(SealedRoomMap), 23,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            sim.AddCitizen("Hauler", new Int3(2, 2, 0));
            var cargo = sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 1, 0));
            var zone = new Int3(9, 2, 0);
            var seal = new Int3(6, 2, 0);
            sim.World.SetFlag(zone, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;

            // Run until the zone is stamped unreachable AND the board has settled — a tick on which
            // nothing at all is pending, so the ONLY thing that can rescan the board afterwards is
            // WP-7's own wake-up. Both conditions matter: without the settle this would break the
            // seal on a tick that was already dirty from the abandon, and the rescan that follows
            // would prove nothing.
            var haul = Haul(sim);
            int guard = 0;
            while (guard++ < 800 &&
                   (haul.BackedOffStockpileTiles == 0 || sim.JobsDirty != JobBoardDirty.None))
                sim.Tick();
            Assert.That(haul.BackedOffStockpileTiles, Is.EqualTo(1),
                "premise: the sealed zone tile must be stamped unreachable, and it is the only one");
            Assert.That(sim.JobsDirty, Is.EqualTo(JobBoardDirty.None),
                "premise: the board must be quiescent before the seal breaks");
            Assert.That(cargo.Pos, Is.Not.EqualTo(zone), "premise: nothing can be delivered while sealed");

            // Break the seal WITHOUT touching the job board. SetWall re-derives Walkable.
            sim.World.SetWall(seal, 0);
            Assert.That(sim.IsWalkable(seal), Is.True, "premise: knocking the wall out must open the way");
            Assert.That(sim.JobsDirty, Is.EqualTo(JobBoardDirty.None),
                "premise: a direct world write sets no dirty flag — if it did, this test would be " +
                "measuring the backstop in JobSystem.Tick instead of WP-7's wake-up");

            for (int i = 0; i < 600; i++) sim.Tick();

            Assert.That(cargo.Pos, Is.EqualTo(zone),
                "the zone must come back to life on its own: the backoff expires, BeginTick re-dirties " +
                "the board, and the cargo finally reaches the stockpile. Without that wake-up the " +
                "board never rescans again and the zone is permanently dead — the exact new bug a " +
                "backoff must not introduce");
        }

        /// <summary>
        /// EXPIRY IS THE SOLE LIFTING MECHANISM, and it is a single comparison. WP-7 keeps no sweep
        /// over the backoff map (<see cref="IJobSource"/> rule 4 bars iterating it at all), so the
        /// only two things that can ever lift a stamp are <c>IsPathworthy</c>'s
        /// <c>sim.TickCount &lt; until</c> and the wholesale clear on a tile-board change. This test
        /// removes the second: a bare stack with NOTHING that dirties Tiles, so the map is never
        /// cleared — <see cref="HaulJobSource.BackedOffStockpileTiles"/> is asserted to stay pinned
        /// at 1 for the whole window, which is what proves the clear never fired — and the board must
        /// still come back round to re-probe the tile.
        ///
        /// The reviewer found that deleting only <c>sim.TickCount &lt; until</c> passed all eight
        /// earlier tests, because the old expiry sweep masked it. With the sweep gone that comparison
        /// is load-bearing on its own, so it gets its own guard.
        ///
        /// NAMED MUTATIONS caught here: M-G (drop <c>sim.TickCount &lt; until</c>), M-I (forget on
        /// every rescan — the only mutation that trips this test's "the count stays pinned at 1"
        /// assertion for the RIGHT reason), M-D1 and M-C1. Not a sole guard for any single mutation,
        /// but it is the only test that asserts the map is NOT cleared while it works.
        /// </summary>
        [Test]
        public void ExpiredBackoff_LiftsItselfWithNoTileBoardChange()
        {
            var sim = new Simulation(AsciiWorld.Build(SealedRoomMap), 23,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            sim.AddCitizen("Hauler", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 1, 0));
            sim.World.SetFlag(new Int3(9, 2, 0), TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;

            var haul = Haul(sim);
            int guard = 0;
            while (haul.BackedOffStockpileTiles == 0 && guard++ < 500) sim.Tick();
            Assert.That(haul.BackedOffStockpileTiles, Is.EqualTo(1), "premise: the tile must be stamped");

            // Nothing here dirties Tiles, so ForgetBackoffsOnTileChange can never run. If the entry
            // count ever moved off 1 the clear WOULD have fired and this test would be measuring it
            // instead of the expiry comparison.
            int reprobes = 0;
            bool wasClaimed = false;
            for (int i = 0; i < 5 * JobWork.UnreachableRetryTicks; i++)
            {
                sim.Tick();
                Assert.That(haul.BackedOffStockpileTiles, Is.EqualTo(1),
                    "the map must never be cleared here — only the expiry comparison may lift the stamp");
                bool claimed = sim.Citizens.Items[0].JobKind == JobKind.HaulPickup;
                if (claimed && !wasClaimed) reprobes++;
                wasClaimed = claimed;
            }

            Assert.That(reprobes, Is.GreaterThan(0),
                "the stamp must time out on its own: with no tile-board change and no sweep, " +
                "`sim.TickCount < until` is the only thing that can ever let the tile be tried again, " +
                "and without it the backoff is a permanent blacklist");
        }

        // ------------------------------------------------------------------- zero alloc

        /// <summary>
        /// ZERO ALLOCATION on the tick path — a <c>CLAUDE.md</c> hard invariant, and WP-7 adds a
        /// <see cref="Dictionary{TKey,TValue}"/> plus a wholesale clear to a job source's rescan.
        /// Modelled on WP-4's <c>BenchRuleHaulTests.FullRescanReachingTheBenchRule_IsZeroAlloc</c>,
        /// with one deliberate difference: WP-4 could hold its citizen still, because the branch it
        /// measured was pure derivation. WP-7's map is only WRITTEN by a hauler failing to path, so a
        /// held citizen would measure the map being read and never filled. This uses a LIVE hauler
        /// and forces a full <c>JobBoardDirty.All</c> rescan every tick, which is the worst case for
        /// this package: the world pass reruns, the map is cleared, the gate rescans it, the hauler
        /// re-claims and re-stamps. Every WP-7 line is on the measured path.
        ///
        /// PRECONDITION (lane plan §7 trap 5): a zero-alloc assertion over an UNREACHED branch is a
        /// tautology. The backoff map is asserted non-empty BEFORE the counter starts and observed
        /// non-empty INSIDE the window, so the stamp/clear churn provably happened while measuring.
        ///
        /// NAMED MUTATION caught here: M-H (allocate per stamp — e.g. box the key by typing the map
        /// <c>Dictionary&lt;object, long&gt;</c>, or rebuild it with <c>new Dictionary…</c> instead of
        /// <c>Clear()</c>). This test is the ONLY one M-H fails.
        /// </summary>
        [Test]
        public void RescanChurningTheUnreachableBackoff_IsZeroAlloc()
        {
            var sim = new Simulation(AsciiWorld.Build(SealedRoomMap), 23,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            sim.AddCitizen("Hauler", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 1, 0));
            sim.World.SetFlag(new Int3(9, 2, 0), TileFlags.Stockpile, true);

            var haul = Haul(sim);
            int warmPeak = 0;
            for (int i = 0; i < 400; i++)   // warm every list, array, path buffer and dictionary bucket
            {
                sim.JobsDirty = JobBoardDirty.All;
                sim.Tick();
                if (haul.BackedOffStockpileTiles > warmPeak) warmPeak = haul.BackedOffStockpileTiles;
            }
            Assert.That(warmPeak, Is.EqualTo(1),
                "precondition: the warm-up must have stamped the unreachable tile at least once, or " +
                "the window below measures a branch that never runs");

            long before = GC.GetAllocatedBytesForCurrentThread();
            int peak = 0;
            for (int i = 0; i < 3000; i++)
            {
                sim.JobsDirty = JobBoardDirty.All;
                sim.Tick();
                if (haul.BackedOffStockpileTiles > peak) peak = haul.BackedOffStockpileTiles;
            }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(peak, Is.EqualTo(1),
                "precondition: the stamp/clear cycle ran INSIDE the measured window too");
            Assert.That(delta, Is.EqualTo(0),
                $"a rescan that clears, rescans and re-stamps the WP-7 backoff map must not allocate, saw {delta} bytes");
        }

        // ------------------------------------------------------ the E0-4 filtered path

        /// <summary>
        /// The filtered gate needs the same guard, and this is the shape that proves it. The
        /// kind-less gate (<c>anyFreeStockpile</c>) is held OPEN by a reachable decoy tile whose
        /// filter accepts NOTHING — so it never fills, and it never closes the gate. Every carryable
        /// kind is then accepted only by the sealed observatory. Without WP-7's guard inside
        /// <c>AnyFreeStockpileAccepts</c>, every such item boards and the livelock returns one kind
        /// at a time, with the kind-less gate powerless to stop it.
        ///
        /// This is the one arrangement in which the second call site is load-bearing rather than
        /// belt-and-braces, which is precisely why it is the one asserted.
        ///
        /// NAMED MUTATION caught here: M-F (the filtered gate stops consulting the backoff). This
        /// test is the ONLY one M-F fails, which is the point — with any simpler arrangement the
        /// kind-less gate closes first and the second call site is never reached, so the mutation
        /// would not bite and the guard would be untested decoration.
        /// </summary>
        [Test]
        public void FilteredBoard_UnreachableAcceptingTile_DoesNotLivelockEither()
        {
            var sim = BootSlice().Sim;

            // The decoy: reachable, zoned, accepts nothing ⇒ permanently free ⇒ the kind-less gate
            // stays open for the whole run.
            sim.EnqueueCommand(new DesignateStockpileCommand(ReachableFarTile, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(ReachableFarTile, 0UL));
            // The trap: unreachable, accepts every kind.
            ZoneObservatory(sim);
            for (int i = 0; i < SealedObservatoryTiles.Length; i++)
                sim.EnqueueCommand(new SetStockpileFilterCommand(SealedObservatoryTiles[i], ulong.MaxValue));

            const int Ticks = 3000;
            var c = Run(sim, Ticks);

            Assert.That(sim.StockZones, Is.Not.Null, "premise: the filtered path needs a StockZoneSystem");
            Assert.That(sim.StockZones.Zones.Count, Is.EqualTo(4),
                "premise: four filters must be live, or the filtered branch is never taken and this " +
                "test degenerates into the kind-less one");
            Assert.That(sim.StockZones.Accepts(ReachableFarTile, ItemKind.Regolith), Is.False,
                "premise: the decoy must refuse cargo, so it stays free and holds the kind-less gate open");
            Assert.That(c.MaxBackedOff, Is.GreaterThan(0),
                "premise: the observatory tiles must have been stamped, or the filtered gate was " +
                "never asked the question this test exists to ask");
            Assert.That(c.DeliverTicks, Is.Zero, "neither zone can accept a delivery");
            Assert.That(c.PickupStarts, Is.LessThan(200),
                $"the FILTERED candidate gate must honour the backoff too ({c.PickupStarts} claims in " +
                $"{Ticks} ticks) — otherwise an accept-all unreachable zone re-opens the livelock " +
                "behind a decoy that keeps the kind-less gate open");
        }
    }
}
