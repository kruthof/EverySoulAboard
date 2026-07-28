using System;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// PERF package: <c>WaterSystem.HasIceChain</c> is memoised against
    /// <see cref="Simulation.DeviceTopologyVersion"/>.
    ///
    /// The scan walked the whole device store on the 2 Hz water pass of every ship. MEASURED on
    /// `--ship grid --days 1` (Release, n = 1, instrumented counter, instrumentation reverted):
    /// 73 377 calls × 1 250 devices = <b>91 721 250 device slots per sim-day</b> — on the one
    /// standard play ship, which owns no melter and so can never act on the answer. Worth ~90 ms
    /// of a ~8.2 s sim-day (~1.1 %), which is smaller than the slot count sounds; the figure and
    /// its bounds are in <c>WaterSystem.HasIceChain</c>'s comment.
    ///
    /// A memo is only as good as its key, and a WRONG key here is INVISIBLE: on grid the answer
    /// never changes, so a permanently stale cache would return the right answer forever and every
    /// golden would still match. That is precisely why the tests below are about the FLIP, in both
    /// directions, driven through the real system stack.
    ///
    /// ⚠ THE TWO FLIP TESTS ARE SPLIT ONE DIRECTION PER TEST — that is the only thing the split
    /// buys, and an earlier draft of this header overclaimed it as "none of them is a multi-leg
    /// test", which is FALSE and is corrected here rather than quietly deleted:
    /// <c>TheMemoAgrees_WithAnUnMemoisedScan_AtEveryTopology</c> is three topologies × two
    /// assertions, and the save/load test carries seven assertions. CLAUDE.md trap 5 says `assert`
    /// throws, so a later leg of a passing test can be dead and look exactly like a live one — the
    /// countermeasure is BLINDING, not sentence-writing, and blinding is what was done (see the
    /// ledger below). A reader who believed the old sentence would skip it on the next package.
    ///
    /// Every named mutation was physically applied, observed RED, and reverted from an in-memory
    /// copy — never `git checkout` (CLAUDE.md trap 2); every mutated tree was BUILT first, so no
    /// red is a crash (trap 3). Red counts are in the package report.
    ///
    /// BLINDING LEDGER — FOUR RUNS, and the strongest evidence in this package. Measured by the
    /// INDEPENDENT REVIEWER, not by the implementer; recorded here because it is the evidence, and
    /// attributed because a measurement someone else took is not yours to present as your own:
    ///   1. the three topologies of <c>TheMemoAgrees_…</c>, each run with the other two blinded —
    ///      each fired alone;
    ///   2. its two assertion KINDS (the answer, and the version stamp) separated — each fired
    ///      alone, so the version half is not decoration;
    ///   3. the save/load test's seven assertions — each fired alone;
    ///   4. two mutations this package's own ledger had not thought of, both caught ONLY by the
    ///      `internal` test seams: never stamping the version at all, and relaxing the key
    ///      comparison from <c>!=</c> to <c>&gt;</c>. That pair is why the seams earn their keep.
    /// </summary>
    public class IceChainMemoTests
    {
        // ══════════════════════════════════════════════════════════════════════════ the fixture

        /// <summary>
        /// A minimal powered, plumbed ship: one crew member, a tank and (optionally) an ice melter.
        /// Deliberately NOT a copy of <c>IceMelterTests.BuildMelterScenario</c>'s hauling fixture —
        /// nothing here needs a crew member to fetch anything. What it needs is a ship on which
        /// B-2's makeup floor is OBSERVABLE (the pool moves) and a melter can be added or removed
        /// mid-run.
        /// </summary>
        private static Simulation Build(SimDefs defs, bool withMelter, out WaterSystem water)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var systems = SystemStack.CreateDefault(moss);
            water = null;
            for (int i = 0; i < systems.Length; i++) if (systems[i] is WaterSystem w) water = w;
            Assert.That(water, Is.Not.Null, "PRECONDITION: the default stack registers a WaterSystem");

            var sim = new Simulation(AsciiWorld.Build(map), 42, systems, defs);
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            for (int x = 3; x <= 5; x++) sim.AddDevice(DeviceKind.Pipe, new Int3(x, 1, 0), $"p{x}");
            if (withMelter) sim.AddDevice(DeviceKind.IceMelter, new Int3(3, 2, 0), "melter");
            sim.AddDevice(DeviceKind.WaterTank, new Int3(5, 2, 0), "tank").StoredLiters = 0f;

            sim.AddCitizen("Smith", new Int3(1, 2, 0));
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static Device Dev(Simulation sim, string name)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) return devices[i];
            throw new InvalidOperationException("no device named " + name);
        }

        private static void Run(Simulation sim, int ticks) { for (int t = 0; t < ticks; t++) sim.Tick(); }

        /// <summary>Ten water passes (IntervalTicks = 5) — enough for the floor to fire several
        /// times over, short enough that nothing else on the ship has time to matter.</summary>
        private const int TenWaterPasses = 50;

        // ══════════════════════════════════════════ 1. the flip, driven, one direction per test

        /// <summary>
        /// A MELTER REMOVED MID-RUN RE-ARMS B-2's MAKEUP FLOOR. The observable is the greywater
        /// pool: with a melter the ship gets no free water and the pool stays where the loop left
        /// it; strip the melter and the floor must come back on the very next pass.
        ///
        /// This is the direction a stale memo breaks HARDEST in play, because it is reachable:
        /// E0-5's DEMOLISH verb removes devices through <c>Simulation.RemoveDevice</c>, and a ship
        /// whose melter has been stripped would keep being denied the stand-in forever — its hydro
        /// loop dies on day 1.2 with nothing anywhere saying why.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>WaterSystem.HasIceChain</c>, replace
        /// <c>if (_iceChainVersion != sim.DeviceTopologyVersion)</c> with
        /// <c>if (_iceChainVersion == -1)</c> — compute once, never again. The module still loads
        /// (CLAUDE.md trap 3), the memo is simply never invalidated, and the stripped ship stays
        /// dry.
        /// </summary>
        [Test]
        public void RemovingTheMelterMidRun_ReArmsTheMakeupFloor()
        {
            var defs = SimDefs.CreateDefault();
            Assert.That(defs.Water.MakeupFloorLiters, Is.GreaterThan(0f),
                "PRECONDITION: the B-2 stand-in is switched on in shipped defs, or this measures nothing");

            var sim = Build(defs, withMelter: true, out _);
            sim.WastewaterLiters = 0f;
            Run(sim, TenWaterPasses);
            Assert.That(sim.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "PRECONDITION: while the melter is aboard the ship gets no makeup at all");

            sim.RemoveDevice(Dev(sim, "melter").Id);
            sim.WastewaterLiters = 0f;
            Run(sim, TenWaterPasses);

            Assert.That(sim.WastewaterLiters, Is.EqualTo(defs.Water.MakeupFloorLiters).Within(0.001f),
                "THE MEMO MUST FOLLOW A REMOVAL: with the melter stripped this ship has no ice " +
                "chain, so B-2's floor is live again. A pool still at 0 means the cached answer " +
                "outlived the device that justified it.");
        }

        /// <summary>
        /// A MELTER BUILT MID-RUN SUPPRESSES B-2's MAKEUP FLOOR — the same decision, the other way
        /// up, and the direction that matters for measurement rather than survival: if the floor
        /// kept running after a melter was installed, the ice chain would be decorative and every
        /// number taken off it would be a number about the stand-in.
        ///
        /// Reachable today only through <c>Simulation.AddDevice</c> from a host or a ship plan (the
        /// player's <c>PlaceDeviceCommand</c> whitelist has no melter in it yet) — but that command
        /// goes through the same door, so the day the melter joins the whitelist this is the live
        /// path.
        ///
        /// MUTATION THAT MAKES THIS FAIL: the same <c>if (_iceChainVersion == -1)</c> freeze — the
        /// memo keeps answering "no melter" and the new melter's ship goes on being handed free
        /// water.
        /// </summary>
        [Test]
        public void BuildingAMelterMidRun_SuppressesTheMakeupFloor()
        {
            var defs = SimDefs.CreateDefault();
            var sim = Build(defs, withMelter: false, out _);
            sim.WastewaterLiters = 0f;
            Run(sim, TenWaterPasses);
            Assert.That(sim.WastewaterLiters, Is.EqualTo(defs.Water.MakeupFloorLiters).Within(0.001f),
                "PRECONDITION: with no melter aboard this ship really is living on B-2's floor");

            sim.AddDevice(DeviceKind.IceMelter, new Int3(3, 2, 0), "melter");
            sim.WastewaterLiters = 0f;
            Run(sim, TenWaterPasses);

            Assert.That(sim.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "THE MEMO MUST FOLLOW AN ADDITION: the moment a melter exists the stand-in steps " +
                "aside. A pool back at the floor means the cached answer outlived the ship that " +
                "had no melter.");
        }

        // ══════════════════════════════════════════ 2. the memo against ground truth

        /// <summary>
        /// THE MEMO EQUALS A FRESH SCAN, AT EVERY TOPOLOGY THE SHIP PASSES THROUGH, and it is
        /// stamped with the version it was taken at. This is the assertion that would catch a key
        /// which is merely *usually* right: it compares the cached bit against
        /// <c>WaterSystem.ScanForIceChain</c> — the untouched un-memoised loop — rather than
        /// against a hand-written expectation.
        ///
        /// The version equality is the second half and is not decoration: a memo can hold the right
        /// ANSWER by luck while its key has drifted, and the next mutation is then silent.
        ///
        /// MUTATION THAT MAKES THIS FAIL: freeze the key as above (<c>if (_iceChainVersion == -1)</c>).
        /// SECOND MUTATION: make <c>Simulation.RemoveDevice</c> stop bumping
        /// <c>DeviceTopologyVersion</c> — i.e. delete the very line this key rests on — and the
        /// removal leg's answer comparison fails.
        /// </summary>
        [Test]
        public void TheMemoAgrees_WithAnUnMemoisedScan_AtEveryTopology()
        {
            var defs = SimDefs.CreateDefault();
            var sim = Build(defs, withMelter: false, out var water);

            Run(sim, TenWaterPasses);
            AssertMemoIsGroundTruth(sim, water, "no melter, boot topology");

            sim.AddDevice(DeviceKind.IceMelter, new Int3(3, 2, 0), "melter");
            sim.WastewaterLiters = 0f;   // force RunMakeup past its pool-level early return
            Run(sim, TenWaterPasses);
            AssertMemoIsGroundTruth(sim, water, "after a melter was built");

            sim.RemoveDevice(Dev(sim, "melter").Id);
            sim.WastewaterLiters = 0f;
            Run(sim, TenWaterPasses);
            AssertMemoIsGroundTruth(sim, water, "after the melter was stripped");
        }

        private static void AssertMemoIsGroundTruth(Simulation sim, WaterSystem water, string where)
        {
            Assert.That(water.IceChainMemoVersion, Is.EqualTo(sim.DeviceTopologyVersion),
                $"the memo's key is stale ({where}) — it is answering for a topology the ship left");
            Assert.That(water.IceChainMemo, Is.EqualTo(WaterSystem.ScanForIceChain(sim)),
                $"the memo disagrees with an un-memoised scan of the live device store ({where})");
        }

        // ══════════════════════════════════════════ 3. the memo is a CACHE, not state

        /// <summary>
        /// THE ONE PLACE THE KEY IS NOT BUMPED, and why it is safe. <c>SaveReader</c> does not go
        /// through <c>Simulation.AddDevice</c> — it pushes straight into the store
        /// (<c>sim.Devices.Add(d, id)</c>) — so a loaded ship's
        /// <see cref="Simulation.DeviceTopologyVersion"/> is 0 no matter how many melters it owns.
        /// That is harmless for exactly one reason, and it is a reason worth pinning rather than
        /// believing: a load builds a FRESH <see cref="Simulation"/> with FRESH systems, so the
        /// memo that reads the loaded store has never been computed (its own sentinel), and the
        /// same is true of the fluid-network cache that already depended on this.
        ///
        /// Driven, not argued: a melter ship is saved, reloaded, and both ships are then run a
        /// thousand more ticks and required to stay bit-identical. A memo that survived into the
        /// loaded sim holding the wrong answer would hand the loaded ship B-2's free water and the
        /// hashes would part.
        ///
        /// MUTATION THAT MAKES THIS FAIL: initialise <c>_iceChainVersion</c> to <c>0</c> instead of
        /// <c>-1</c> — the loaded sim's version is also 0, the never-computed memo is mistaken for a
        /// fresh one, its default <c>false</c> is believed, and the reloaded melter ship starts
        /// conjuring water.
        /// </summary>
        [Test]
        public void AMelterShip_SurvivesSaveLoad_WithTheMemoRecomputedNotInherited()
        {
            var defs = SimDefs.CreateDefault();
            var sim = Build(defs, withMelter: true, out _);
            sim.WastewaterLiters = 0f;
            Run(sim, 600);
            Assert.That(sim.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "PRECONDITION: before the save, the melter is suppressing the floor");

            var blob = new System.IO.MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var moss = new ScriptRuntime(new DeviceRegistry());
            var systems = SystemStack.CreateDefault(moss);
            var loaded = SaveReader.Read(blob, systems, defs);
            WaterSystem loadedWater = null;
            for (int i = 0; i < systems.Length; i++) if (systems[i] is WaterSystem w) loadedWater = w;

            Assert.That(loaded.DeviceTopologyVersion, Is.EqualTo(0),
                "PRECONDITION — THE GAP ITSELF: the load path never bumps the key, so the loaded " +
                "ship's version is 0 while it demonstrably owns a melter");
            Assert.That(WaterSystem.ScanForIceChain(loaded), Is.True,
                "PRECONDITION: the melter really did come back through the save");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the load-time hash matches");

            // CONTROLLED CONFOUND, borrowed verbatim from SaveRestoreRunOnTests: a load leaves the
            // room partition dirty, so the loaded sim takes a Recompute the uninterrupted twin does
            // not, and RoomState.RemapGas is not bit-idempotent (a pre-existing defect, HANDOVER
            // "Save-reload thermal ULP drift"). Marking the twin dirty puts the identical recompute
            // on BOTH sides so the run-on comparison can demand exact equality.
            sim.Rooms.MarkDirty();
            for (int t = 0; t < 1000; t++) { sim.WastewaterLiters = 0f; loaded.WastewaterLiters = 0f; sim.Tick(); loaded.Tick(); }

            Assert.That(loadedWater.IceChainMemo, Is.True,
                "the loaded ship's memo was RECOMPUTED from its own store, not inherited or defaulted");
            Assert.That(loadedWater.IceChainMemoVersion, Is.EqualTo(0),
                "...and it is stamped with the loaded sim's version (0), so the next add/remove still bites");
            Assert.That(loaded.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "THE OBSERVABLE: the reloaded melter ship is still denied B-2's floor");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "and a thousand ticks later the two ships are still bit-identical");
        }

        /// <summary>
        /// THE MEMO ALLOCATES NOTHING on the 2 Hz path — the tick-path rule. Measured on a ship
        /// with NO melter, which is the expensive case (the scan returns only at the end of the
        /// store) and the case the memo exists for.
        ///
        /// PRECONDITION ASSERTED BEFORE THE OUTCOME: the makeup floor is really firing inside the
        /// measured window, so <c>RunMakeup</c> really is reaching <c>HasIceChain</c> — a window in
        /// which the pool never dipped would measure the early return above it and prove nothing.
        ///
        /// MUTATION THAT MAKES THIS FAIL: allocate on the MEMOISED path, not inside the scan —
        /// <c>var churn = new List&lt;Device&gt;(sim.Devices.Items);</c> as the first line of
        /// <c>HasIceChain</c>, above the version check. One list per water pass at 2 Hz, and the
        /// measured delta stops being 0. (Allocating inside <c>ScanForIceChain</c> instead would
        /// NOT redden this — and that is the memo working, not a hole: the scan is entered once per
        /// topology change, which is zero times inside a settled window. Said out loud because it
        /// is exactly the kind of gap that reads like a passing test and is not one.)
        /// </summary>
        [Test]
        public void TheMemoisedPass_AllocatesNothing_WhileTheFloorIsReallyFiring()
        {
            var defs = SimDefs.CreateDefault();
            var sim = Build(defs, withMelter: false, out _);
            Run(sim, 600);   // warm up: JIT, room recompute, first network rebuild

            sim.WastewaterLiters = 0f;
            bool floorFired = false;
            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int t = 0; t < 3000; t++)
            {
                sim.WastewaterLiters = 0f;   // every single pass must reach HasIceChain
                sim.Tick();
                if (sim.WastewaterLiters > 0f) floorFired = true;
            }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(floorFired, Is.True,
                "PRECONDITION: the floor really fired INSIDE the measured window, so RunMakeup " +
                "really reached HasIceChain rather than returning at the pool-level line above it");
            Assert.That(delta, Is.EqualTo(0L),
                "the memoised makeup pass allocates nothing in steady state");
        }
    }
}
