using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// BuildSystem M1 (WS-MATTER): the designate → haul → construct loop for walls and
    /// doors. Covers the full breach-seal-pressurize path, cancel/refund conservation,
    /// designation rejection, builder-reservation racing, mid-build save round-trip,
    /// the ConstructionCompletedEvent contract, zero-alloc steady state, twin determinism
    /// and the build.def consumption tripwire.
    ///
    /// BuildSystem is spine-registered in SystemStack.CreateDefault; these tests resolve
    /// the stack's own instance. JobSystem resolves the BuildSystem from sim.Systems, so
    /// the build path only lights up when one is present.
    /// </summary>
    public class BuildSystemTests
    {
        // --- Full-loop map: an enclosed room with one stub tile (5,3) that leaks to a
        // void breach (5,4). Building a wall on the stub seals the room. ---
        private static readonly string[] BreachMap =
        {
            "########",
            "#......#",
            "#......#",
            "#####.##",
            "##### ##",
            "########",
        };

        private static readonly Int3 StubSite = new Int3(5, 3, 0);

        private static ISimSystem[] AugmentedStack(out BuildSystem build)
        {
            // BuildSystem is spine-registered in CreateDefault since the P2 integrator
            // commit — use the stack's own instance (appending a second one would leave
            // JobSystem resolving the first, designation-less copy).
            var baseStack = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            build = null;
            foreach (var s in baseStack)
                if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "BuildSystem must be registered in SystemStack.CreateDefault");
            // E0-2: drop NeedsSystem. The work-rate rebase makes a wall 2400 ticks (was 60), and
            // a lone crew in these unpressurized micro-maps suffocates in ~900 ticks — the old
            // tests only passed by finishing the build before death. Suffocation is orthogonal to
            // the build/haul/seal mechanics under test; AtmosphereSystem stays, so FullLoop's
            // seal→pressurize is unaffected. Slice-level tests keep the full stack and its
            // survival model (GenSimHost on the authored, life-supported ship).
            return DropNeedsSystem(baseStack);
        }

        /// <summary>Return the stack without its <see cref="NeedsSystem"/> (suffocation/needs
        /// death), so a mechanic test can run past the E0-2 work durations without the crew
        /// dying in an unpressurized micro-map. See AugmentedStack for the rationale.</summary>
        private static ISimSystem[] DropNeedsSystem(ISimSystem[] stack)
        {
            var kept = new List<ISimSystem>(stack.Length);
            foreach (var s in stack) if (!(s is NeedsSystem)) kept.Add(s);
            return kept.ToArray();
        }

        private static Simulation NewSim(string[] map, ulong seed, out BuildSystem build, SimDefs defs = null)
        {
            var systems = AugmentedStack(out build);
            return new Simulation(AsciiWorld.Build(map), seed, systems, defs);
        }

        /// <summary>Wire a powered, open air vent into the room so the atmosphere sim can
        /// pressurize it once sealed (solar → conduit → vent, all inside the room).</summary>
        private static void AddVentedPower(Simulation sim)
        {
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            sim.AddDevice(DeviceKind.AirVent, new Int3(3, 1, 0), "vent").IsOpen = true;
        }

        // ------------------------------------------------------------ designation

        [Test]
        public void Designate_RejectsInvalidTilesDeterministically()
        {
            var sim = NewSim(BreachMap, 1, out var build);
            sim.AddCitizen("Occupant", new Int3(2, 2, 0));

            // Already-walled tile ((0,0) is a wall).
            Assert.That(build.Designate(sim, new Int3(0, 0, 0), BuildKind.Wall), Is.False, "walled tile");
            // Void tile (the breach).
            Assert.That(build.Designate(sim, new Int3(5, 4, 0), BuildKind.Wall), Is.False, "void tile");
            // Occupied tile (a citizen stands there).
            Assert.That(build.Designate(sim, new Int3(2, 2, 0), BuildKind.Wall), Is.False, "occupied tile");
            // Out of bounds.
            Assert.That(build.Designate(sim, new Int3(-1, 0, 0), BuildKind.Wall), Is.False, "oob");

            // A clean floor tile is accepted; a duplicate is rejected.
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True, "valid floor");
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.False, "duplicate");
            Assert.That(build.Pending, Has.Count.EqualTo(1));
        }

        // -------------------------------------------------------------- full loop

        [Test]
        public void FullLoop_DesignateHaulBuild_SealsAndPressurizes()
        {
            var sim = NewSim(BreachMap, 42, out var build);
            AddVentedPower(sim);
            var builder = sim.AddCitizen("Ito", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0)); // exactly a wall's worth

            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True);

            var completions = new List<ConstructionCompletedEvent>();
            int roomsChanged = 0;
            sim.Rooms.RecomputeIfDirty(sim); // rooms are derived on the first tick — force it to read now
            bool wasVacuumBeforeSeal = sim.Rooms.RoomAt(sim.World, new Int3(3, 1, 0)) == sim.Rooms.Rooms[0];

            // E0-2: WallConstructTicks 60→2400 (plus haul/travel), so the budget is widened.
            for (int t = 0; t < 6000 && build.Pending.Count > 0; t++)
            {
                sim.Tick();
                completions.AddRange(sim.Events.Read<ConstructionCompletedEvent>().ToArray());
                if (sim.Events.Read<RoomsChangedEvent>().Length > 0) roomsChanged++;
            }

            Assert.That(wasVacuumBeforeSeal, Is.True, "precondition: the breached room starts as vacuum");
            Assert.That(build.Pending, Is.Empty, "the build must finish");
            Assert.That(sim.World.GetWall(StubSite), Is.EqualTo(TileDefs.Wall), "the tile is now a wall");
            Assert.That(roomsChanged, Is.GreaterThan(0), "the reflood must fire RoomsChanged");

            Assert.That(completions, Has.Count.EqualTo(1), "exactly one completion event");
            Assert.That(completions[0].Pos, Is.EqualTo(StubSite));
            Assert.That(completions[0].BuildKind, Is.EqualTo((byte)BuildKind.Wall));
            Assert.That(completions[0].BuilderId, Is.EqualTo(builder.Id));

            // The now-sealed compartment pressurizes through the existing vent flow. (The
            // reflood runs at the start of the tick AFTER the wall write, so tick on.)
            for (int t = 0; t < 800; t++) sim.Tick();
            Assert.That(sim.Rooms.RoomAt(sim.World, new Int3(3, 1, 0)), Is.Not.SameAs(sim.Rooms.Rooms[0]),
                "the sealed region is no longer vacuum");
            Assert.That(sim.Rooms.RoomAt(sim.World, new Int3(3, 1, 0)).PressureKPa, Is.GreaterThan(10.0),
                "the vent must be pressurizing the newly sealed compartment");
        }

        [Test]
        public void DoorBuild_SpawnsRuntimeDoorDevice()
        {
            // A door is built on an interior floor tile; on completion a Door device
            // exists there (proves the runtime device-spawn path).
            var sim = NewSim(BreachMap, 7, out var build);
            AddVentedPower(sim);
            var builder = sim.AddCitizen("Vega", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0));

            var doorPos = new Int3(4, 1, 0);
            Assert.That(build.Designate(sim, doorPos, BuildKind.Door), Is.True);

            var completions = new List<ConstructionCompletedEvent>();
            // E0-2: DoorConstructTicks 40→1800 (plus haul/travel), so the budget is widened.
            for (int t = 0; t < 5000 && build.Pending.Count > 0; t++)
            {
                sim.Tick();
                completions.AddRange(sim.Events.Read<ConstructionCompletedEvent>().ToArray());
            }

            Assert.That(build.Pending, Is.Empty);
            Assert.That(sim.TryGetDeviceAt(doorPos, out var device), Is.True, "a device now occupies the tile");
            Assert.That(device.Kind, Is.EqualTo(DeviceKind.Door));
            Assert.That(completions, Has.Count.EqualTo(1));
            Assert.That(completions[0].BuildKind, Is.EqualTo((byte)BuildKind.Door));
            Assert.That(completions[0].BuilderId, Is.EqualTo(builder.Id));
        }

        // --------------------------------------------------------------- cancel

        [Test]
        public void Cancel_RefundsStagedMaterialExactly_ConservingTotal()
        {
            // A wall wants 2 units; two count-1 stacks are provided so it takes two haul
            // trips. Cancel after exactly one is staged: the refund is that one unit, the
            // second stack is untouched, and total Regolith is conserved.
            var sim = NewSim(BreachMap, 3, out var build);
            AddVentedPower(sim);
            sim.AddCitizen("Halden", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 1, 0));

            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True);

            int guard = 0;
            while (build.TryGet(StubSite, out var b) && b.Delivered < 1 && guard++ < 3000) sim.Tick();
            Assert.That(build.TryGet(StubSite, out var mid), Is.True);
            Assert.That(mid.Delivered, Is.EqualTo(1), "precondition: exactly one unit staged");

            Assert.That(build.Cancel(sim, StubSite), Is.True);
            Assert.That(build.Pending, Is.Empty, "cancel clears the designation");

            // The staged unit is refunded as a loose stack at the site.
            int atSite = 0, total = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i].Kind != ItemKind.Regolith) continue;
                total += items[i].Count;
                if (items[i].CarriedBy == 0 && items[i].Pos == StubSite) atSite += items[i].Count;
            }
            Assert.That(atSite, Is.EqualTo(1), "exactly the staged unit is refunded at the site");
            Assert.That(total, Is.EqualTo(2), "no material created or destroyed by the cancel");
        }

        // ----------------------------------------------------------- reservation

        [Test]
        public void TwoBuilders_RaceOneReadySite_OnlyOneWins()
        {
            // A materialed site with two idle citizens both adjacent: reservation discipline
            // must hand the Build job to exactly one of them.
            var map = new[]
            {
                "#######",
                "#.....#",
                "#######",
            };
            var sim = NewSim(map, 9, out var build);
            var a = sim.AddCitizen("A", new Int3(2, 1, 0));
            var b = sim.AddCitizen("B", new Int3(4, 1, 0));

            Assert.That(build.Designate(sim, new Int3(3, 1, 0), BuildKind.Wall), Is.True);
            Assert.That(build.Deposit(sim, new Int3(3, 1, 0), sim.Defs.Build.WallMaterial),
                Is.EqualTo(sim.Defs.Build.WallMaterial), "stage the site to ready");

            sim.Tick(); // one assignment pass

            int building = (a.JobKind == JobKind.Build ? 1 : 0) + (b.JobKind == JobKind.Build ? 1 : 0);
            Assert.That(building, Is.EqualTo(1), "exactly one builder may claim the site");
        }

        // -------------------------------------------------------------- save/load

        [Test]
        public void MidBuild_SaveRoundTrips_DeliveredAndProgress_HashEqual()
        {
            var sim = NewSim(BreachMap, 11, out var build);
            AddVentedPower(sim);
            sim.AddCitizen("Okafor", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0));
            build.Designate(sim, StubSite, BuildKind.Wall);

            // Run until a builder is mid-construction (materialed, progress started).
            int guard = 0;
            Citizen builder = sim.Citizens.Items[0];
            // E0-2: WallConstructTicks 60→2400 + slower movement, so widen the reach-mid-build guard.
            while (guard++ < 6000 &&
                   !(builder.JobKind == JobKind.Build && builder.JobWorkTicks < sim.Defs.Build.WallConstructTicks
                     && builder.JobWorkTicks > 0))
                sim.Tick();
            Assert.That(builder.JobKind, Is.EqualTo(JobKind.Build), "precondition: mid-build");
            Assert.That(build.TryGet(StubSite, out var pend), Is.True);
            Assert.That(pend.Delivered, Is.EqualTo(pend.Required), "precondition: materialed");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadSystems = AugmentedStack(out var loadedBuild);
            var loaded = SaveReader.Read(ms, loadSystems);

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "the BULD chapter (delivered + kind) plus the citizen's progress must round-trip bit-exactly");
            Assert.That(loadedBuild.TryGet(StubSite, out var lp), Is.True);
            Assert.That(lp.Delivered, Is.EqualTo(pend.Delivered));

            // Both resume identically and both finish the same wall. E0-2: WallConstructTicks
            // 60→2400, and mid-build can be caught right after the countdown starts, so allow
            // the full construct time to elapse.
            for (int t = 0; t < 2800; t++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "resumed sims stay bit-identical");
            Assert.That(sim.World.GetWall(StubSite), Is.EqualTo(TileDefs.Wall));
            Assert.That(loaded.World.GetWall(StubSite), Is.EqualTo(TileDefs.Wall));
        }

        [Test]
        public void BuldChapter_RoundTripsPendingList()
        {
            // Direct BULD-chapter round-trip with several partially-staged designations.
            var sim = NewSim(BreachMap, 5, out var build);
            build.Designate(sim, StubSite, BuildKind.Wall);
            build.Designate(sim, new Int3(4, 1, 0), BuildKind.Door);
            build.Deposit(sim, StubSite, 1); // partial stage

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loaded = SaveReader.Read(ms, AugmentedStack(out var loadedBuild));
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()));
            Assert.That(loadedBuild.Pending, Has.Count.EqualTo(2));
            Assert.That(loadedBuild.TryGet(StubSite, out var w), Is.True);
            Assert.That(w.Kind, Is.EqualTo(BuildKind.Wall));
            Assert.That(w.Delivered, Is.EqualTo(1));
            Assert.That(loadedBuild.TryGet(new Int3(4, 1, 0), out var d), Is.True);
            Assert.That(d.Kind, Is.EqualTo(BuildKind.Door));
        }

        // ---------------------------------------------------------- determinism

        [Test]
        public void TwinRuns_StayHashIdentical()
        {
            Simulation Build(ulong seed)
            {
                var sim = NewSim(BreachMap, seed, out var build);
                AddVentedPower(sim);
                sim.AddCitizen("Twin", new Int3(3, 2, 0));
                sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0));
                build.Designate(sim, StubSite, BuildKind.Wall);
                return sim;
            }

            var x = Build(77);
            var y = Build(77);
            Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), "twins start identical");
            for (int t = 1; t <= 1500; t++)
            {
                x.Tick(); y.Tick();
                if (t % 250 == 0)
                    Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), $"twins diverged at tick {t}");
            }
        }

        [Test]
        public void ZeroAllocSteadyState_NoPendingBuilds()
        {
            // A JobSystem + BuildSystem stack with an idle citizen and no designations:
            // once warmed up, the build path must allocate nothing (the inert-board case).
            var build = new BuildSystem();
            var sim = new Simulation(AsciiWorld.Build(BreachMap), 1,
                new ISimSystem[] { new JobSystem(), build });
            sim.AddCitizen("Idle", new Int3(3, 2, 0)); // AutoWander false → never self-moves

            for (int i = 0; i < 200; i++) sim.Tick(); // warm-up (resolve build, first rescan)

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"steady-state build-free JobSystem/BuildSystem pass must be zero-alloc, saw {delta} bytes");
        }

        // --------------------------------------------------------------- defs

        [Test]
        public void BuildDefValuesAreActuallyConsumed()
        {
            // DEF-FIELD tripwire: a retuned wall_material must change behavior. With the
            // default (2), two staged units complete the wall; with a tuned 5, the same two
            // units never satisfy the requirement, so the wall never builds — proving the
            // parser key AND BuildSystem's consumption of sim.Defs.Build.WallMaterial.
            var problems = new List<string>();
            var tuned = DefsParser.Parse(new[] { ("build.def", "[build]\nwall_material = 5\n") }, problems);
            Assert.That(problems, Is.Empty);
            Assert.That(tuned.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                "a retuned build value must move the checksum (parser key + fold)");

            bool Builds(SimDefs defs)
            {
                var sim = NewSim(BreachMap, 21, out var build, defs);
                AddVentedPower(sim);
                sim.AddCitizen("Test", new Int3(3, 2, 0));
                sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0)); // only two units available
                build.Designate(sim, StubSite, BuildKind.Wall);
                // E0-2: WallConstructTicks 60→2400 (plus haul/travel), so the budget is widened.
                for (int t = 0; t < 6000 && build.Pending.Count > 0; t++) sim.Tick();
                return sim.World.GetWall(StubSite) == TileDefs.Wall;
            }

            Assert.That(Builds(SimDefs.CreateDefault()), Is.True, "default wall_material=2 completes with 2 units");
            Assert.That(Builds(tuned), Is.False, "tuned wall_material=5 cannot complete with only 2 units");
        }
    }
}
