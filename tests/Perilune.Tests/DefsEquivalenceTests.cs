using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE keystone for the tuning layer (plan B3). Two ways of producing the sim's
    /// constants must be bit-for-bit interchangeable:
    ///   (a) <see cref="SimDefs.CreateDefault"/> — the compiled defaults, and
    ///   (b) <see cref="DefsParser"/> over the ACTUAL shipped
    ///       <c>StreamingAssets/SimDefs/*.def</c> files (machines.def + thermal.def +
    ///       the comment-only README.def).
    /// Running the full system stack on twin sims — one per source — must yield an
    /// identical <see cref="Simulation.StateHash"/> at every checkpoint, with zero
    /// parse problems and equal checksums. This is default-equivalence: authoring the
    /// defaults as data changed nothing.
    ///
    /// The mirror test proves the systems ACTUALLY read <c>sim.Defs</c> now (the whole
    /// point of the migration): a mutated graph — thermal (CitizenHeatW) or the machine
    /// table (a Fabricator's HeatKW) — MUST diverge within a few thousand ticks. If a
    /// consumer still read the static <c>MachineDefs</c>/const table, the mutation would
    /// be ignored and the hash would stay equal — failing this test.
    /// </summary>
    public class DefsEquivalenceTests
    {
        private const int LongRun = 20_000;

        // ------------------------------------------------------------- scenario

        /// <summary>A compact self-sustaining section with a real thermal + power +
        /// wear load and two citizens (mirrors the ScenarioRunner scenario, minus the
        /// MOSS watch). Built against a caller-supplied defs graph so the twins differ
        /// only in where their constants came from.</summary>
        private static Simulation BuildScenario(ulong seed, SimDefs defs)
        {
            string[] deck =
            {
                "######################",
                "#........#...........#",
                "#........#...........#",
                "#........D...........#",
                "#........#...........#",
                "######################",
            };
            var map = new string[deck.Length];
            for (int i = 0; i < deck.Length; i++) map[i] = deck[i].Replace('D', '.');

            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            sim.AddDevice(DeviceKind.Door, new Int3(9, 3, 0), "door_a").IsOpen = true;

            for (int x = 11; x <= 20; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(11, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Battery, new Int3(12, 1, 0), "battery").StoredKWh = 20f;
            sim.AddDevice(DeviceKind.Conduit, new Int3(16, 3, 0), "c_leg1");
            sim.AddDevice(DeviceKind.Conduit, new Int3(16, 4, 0), "c_leg2");

            sim.AddDevice(DeviceKind.Pipe, new Int3(13, 3, 0), "p1");
            sim.AddDevice(DeviceKind.Pipe, new Int3(14, 3, 0), "p2");
            sim.AddDevice(DeviceKind.Pipe, new Int3(15, 3, 0), "p3");
            sim.AddDevice(DeviceKind.Reclaimer, new Int3(12, 3, 0), "reclaimer");
            sim.AddDevice(DeviceKind.WaterTank, new Int3(13, 4, 0), "tank").StoredLiters = 200f;
            sim.AddDevice(DeviceKind.GrowBed, new Int3(15, 4, 0), "bed_1");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(17, 4, 0), "fab");   // heat + wear + power draw
            sim.AddDevice(DeviceKind.Scrubber, new Int3(18, 1, 0), "scrubber");
            sim.AddDevice(DeviceKind.AirVent, new Int3(19, 1, 0), "vent").IsOpen = true;
            sim.AddDevice(DeviceKind.Light, new Int3(18, 3, 0), "light_a");
            sim.AddDevice(DeviceKind.Radiator, new Int3(20, 1, 0), "radiator_a");
            sim.AddDevice(DeviceKind.Radiator, new Int3(7, 1, 0), "radiator_b");
            sim.WastewaterLiters = 150f;

            sim.AddItem(ItemKind.Scrap, 6, new Int3(17, 3, 0)); // feed the fabricator

            sim.AddCitizen("Okafor", new Int3(3, 2, 0));
            sim.AddCitizen("Reyes", new Int3(5, 2, 0));

            sim.Rooms.SetAnchor("quarters", new Int3(2, 2, 0));
            sim.Rooms.SetAnchor("hydro", new Int3(14, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(14, 2, 0)));
            return sim;
        }

        // ------------------------------------------------------ shipped defs load

        private static SimDefs ParseShippedDefs(out List<string> problems, out int fileCount)
        {
            string dir = FindSimDefsDir();
            Assert.That(dir, Is.Not.Null,
                "the shipped StreamingAssets/SimDefs directory must be discoverable from the test binary");

            string[] paths = Directory.GetFiles(dir, "*.def");
            Array.Sort(paths, StringComparer.Ordinal);
            fileCount = paths.Length;
            Assert.That(fileCount, Is.GreaterThanOrEqualTo(2),
                "machines.def and thermal.def must ship alongside README.def");

            var files = new List<(string name, string text)>(paths.Length);
            foreach (var path in paths) files.Add((Path.GetFileName(path), File.ReadAllText(path)));

            problems = new List<string>();
            return DefsParser.Parse(files, problems);
        }

        /// <summary>Probe upward from the test binary for content/core/SimDefs.</summary>
        private static string FindSimDefsDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(
                    dir.FullName, "content", "core", "SimDefs");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }

        // ------------------------------------------------------------------ tests

        [Test]
        public void ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault()
        {
            var parsed = ParseShippedDefs(out var problems, out int fileCount);
            Assert.That(problems, Is.Empty,
                "the shipped .def files must parse with zero problems: " + string.Join(" | ", problems));
            Assert.That(parsed.Checksum, Is.EqualTo(SimDefs.Default.Checksum),
                "authoring the defaults as data must not change any tuning value");
            Console.WriteLine($"parsed {fileCount} shipped .def files, checksum {parsed.Checksum:x16}");
        }

        [Test]
        public void ShippedDefs_vs_CreateDefault_IdenticalStateHash_OverLongRun()
        {
            var parsed = ParseShippedDefs(out var problems, out _);
            Assert.That(problems, Is.Empty);

            var fromDefault = BuildScenario(42, SimDefs.CreateDefault());
            var fromFiles = BuildScenario(42, parsed);

            Assert.That(fromFiles.StateHash(), Is.EqualTo(fromDefault.StateHash()),
                "twins must start identical");

            for (int t = 1; t <= LongRun; t++)
            {
                fromDefault.Tick();
                fromFiles.Tick();
                if (t % 2500 == 0)
                    Assert.That(fromFiles.StateHash(), Is.EqualTo(fromDefault.StateHash()),
                        $"parsed-shipped-files defs diverged from CreateDefault at tick {t}");
            }
        }

        [Test]
        public void MutatedThermalDefs_Diverge_ProvingSystemsReadDefs()
        {
            // CitizenHeatW doubled: ThermalSystem must inject twice the body heat, so
            // room TemperatureK (part of StateHash) drifts apart. If ThermalSystem still
            // read a const, this would never diverge.
            var mutated = SimDefs.CreateDefault();
            mutated.Thermal.CitizenHeatW *= 2.0;
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 4000, "doubled CitizenHeatW");
        }

        [Test]
        public void MutatedMachineTable_Diverge_ProvingMachinesReadDefs()
        {
            // A Fabricator's waste HeatKW doubled: ThermalSystem reads the machine table
            // for HeatKW, so the fabricator's room heats faster and TemperatureK drifts.
            // Proves the machines[] migration (not just the thermal scalars) landed.
            var mutated = SimDefs.CreateDefault();
            int fi = (int)DeviceKind.Fabricator;
            var f = mutated.Machines[fi];
            mutated.Machines[fi] = new MachineDef(
                f.DrawKW, f.GenerationKW, f.Tier, f.Blocks,
                f.HeatKW * 2f, f.WearPerHour, f.MaintainBelow, f.FailBelow);
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 8000, "doubled Fabricator HeatKW");
        }

        // --- B4 tripwires: prove the survival-loop + long-tail systems read sim.Defs ---

        [Test]
        public void MutatedGenerationKW_Diverge_ProvingPowerReadsDefs()
        {
            // SolarWing generation zeroed: PowerSystem must now discharge the battery to
            // cover demand instead of charging it from surplus, so Battery.StoredKWh (part
            // of StateHash) drifts. Proves PowerSystem reads sim.Defs.Machines[].GenerationKW.
            var mutated = SimDefs.CreateDefault();
            int si = (int)DeviceKind.SolarWing;
            var s = mutated.Machines[si];
            mutated.Machines[si] = new MachineDef(
                s.DrawKW, 0f, s.Tier, s.Blocks,
                s.HeatKW, s.WearPerHour, s.MaintainBelow, s.FailBelow);
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 4000, "zeroed SolarWing GenerationKW");
        }

        [Test]
        public void MutatedWaterReclaimRate_Diverge_ProvingWaterReadsDefs()
        {
            // Reclaimer output rate doubled: the tank fills faster, so WaterTank.StoredLiters
            // (part of StateHash) drifts within the first reclaimer pass. Proves WaterSystem
            // reads sim.Defs.Water.ReclaimerLitersPerSecond.
            var mutated = SimDefs.CreateDefault();
            mutated.Water.ReclaimerLitersPerSecond *= 2f;
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 2000, "doubled ReclaimerLitersPerSecond");
        }

        [Test]
        public void MutatedMakeupFloor_Diverge_ProvingWaterReadsMakeup()
        {
            // Makeup floor raised above the scenario's primed greywater pool (150 L): the first
            // Water pass tops the pool up to the floor, so Simulation.WastewaterLiters (part of
            // StateHash) jumps immediately. If WaterSystem.RunMakeup did not read
            // sim.Defs.Water.MakeupFloorLiters, the pool would only drift down and never diverge.
            var mutated = SimDefs.CreateDefault();
            mutated.Water.MakeupFloorLiters = 300f; // > BuildScenario's 150 L pool, fires at once
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 50, "raised MakeupFloorLiters above the pool");
        }

        [Test]
        public void MutatedDiffusionCoefficient_Diverge_ProvingAtmosphereReadsDefs()
        {
            // DiffusionCoefficient zeroed: the per-species diffusion term (B-3) stops moving
            // gas across the open door between the two rooms, so the crew-side CO2/O2 and the
            // hydro-side (vent-fed) mix — both in StateHash via Room moles — drift apart from
            // the diffusing baseline. If AtmosphereSystem ignored the def, this would never
            // diverge (the scenario's one open door links the two compartments).
            var mutated = SimDefs.CreateDefault();
            mutated.Atmosphere.DiffusionCoefficient = 0.0;
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 4000, "zeroed DiffusionCoefficient");
        }

        [Test]
        public void MutatedNeedsRate_Diverge_ProvingNeedsReadsDefs()
        {
            // Hunger rate x10: every living citizen accumulates Hunger (and thus Mood, both
            // part of StateHash) at a different rate from the very first NeedsSystem pass.
            // Proves NeedsSystem reads sim.Defs.Needs.HungerPerSecond.
            var mutated = SimDefs.CreateDefault();
            mutated.Needs.HungerPerSecond *= 10f;
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(SimDefs.CreateDefault(), mutated, 1000, "x10 HungerPerSecond");
        }

        [Test]
        public void MutatedBlocks_Diverge_ProvingIsWalkableReadsDefs()
        {
            // A chokepoint machine's Blocks flipped to true: Simulation.IsWalkable now
            // reports its tile impassable, so the wandering citizen's reachable set (and the
            // RNG draws TryRandomWalkableTile makes) diverge — Rng state and Citizen.Pos are
            // both in StateHash. Needs a dedicated corridor scenario where the only device
            // sits on the single passage tile (build the mini-scenario accordingly).
            var mutated = SimDefs.CreateDefault();
            int li = (int)DeviceKind.Light; // Light.Blocks is false by default
            var l = mutated.Machines[li];
            Assert.That(l.Blocks, Is.False, "test premise: Light does not block by default");
            mutated.Machines[li] = new MachineDef(
                l.DrawKW, l.GenerationKW, l.Tier, true /* Blocks */,
                l.HeatKW, l.WearPerHour, l.MaintainBelow, l.FailBelow);
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(BuildBlocksScenario, SimDefs.CreateDefault(), mutated, 5000,
                "chokepoint Light Blocks=true");
        }

        [Test]
        public void MutatedProductionNodeWorkSeconds_Diverge_ProvingCraftingReadsTheGraphTable()
        {
            // E0-6 REPLACED THE SUBJECT OF THIS TRIPWIRE, and the replacement is the point.
            // Until E0-6 the Fabricator ran its legacy [recipes] row, so doubling
            // Recipes[Fabricator].WorkSeconds diverged the twins. It now runs the [production] node
            // `fab_components`, so that mutation is INERT on the Fabricator. The node's WorkSeconds
            // is doubled instead.
            //
            // ⚠️ CORRECTION, and it matters because the first draft of this comment got it exactly
            // backwards. The old test did NOT go quietly vacuous. Its assertion is "the twins
            // DIVERGE", so an inert mutation makes it FAIL, loudly, which is what happened
            // (measured: `AssertDivergesWithin` reported Expected True / But was False on the first
            // full run after the [production] rows landed). Verified again by mutation: reverting
            // the body below to the old Recipes[Fabricator] mutation turns this test RED, not
            // green. A tripwire whose subject moves under it is a maintenance cost here, not a
            // silent hole — do not repeat the stronger claim.
            //
            // Device.Progress (part of StateHash) advances at 1/WorkSeconds per work pass, so the
            // twins drift on the first work pass after the batch starts.
            var mutated = SimDefs.CreateDefault();
            Assert.That(mutated.Production.TryGetNode(DeviceKind.Fabricator, 0, out var node), Is.True,
                "test premise: the Fabricator runs a [production] node, not the legacy row");
            mutated.Production.Nodes[IndexOfNode(mutated, node.Id)] = new ProductionNode(
                node.Id, node.Station, node.WorkSeconds * 2, node.Inputs, node.Outputs);
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(BuildCraftScenario, SimDefs.CreateDefault(), mutated, 8000,
                "doubled fab_components WorkSeconds");
        }

        [Test]
        public void MutatedRecipeWorkSeconds_Diverge_ProvingTheLEGACYFallbackStillReadsDefs()
        {
            // The other half of the same tripwire, kept alive on the station that still TAKES the
            // fallback leg. E0-6 gave the SalvageRecycler and the Fabricator [production] nodes and
            // deliberately left the MachineShop on its legacy [recipes] row, so this is a live
            // proof that ProductionDefs.TryGetBill's fallback is still wired to defs — the half
            // that would otherwise be covered by nothing at all once every station has a node.
            var mutated = SimDefs.CreateDefault();
            int mi = (int)DeviceKind.MachineShop;
            var r = mutated.Recipes[mi];
            Assert.That(r.Defined, Is.True, "test premise: the MachineShop has a legacy recipe");
            Assert.That(mutated.Production.CountFor(DeviceKind.MachineShop), Is.EqualTo(0),
                "test premise: ...and NO [production] node, or this would measure the wrong leg");
            mutated.Recipes[mi] = new RecipeDef(r.Input, r.InputCount, r.Output, r.OutputCount, r.WorkSeconds * 2);
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(BuildMachineShopScenario, SimDefs.CreateDefault(), mutated, 8000,
                "doubled MachineShop recipe WorkSeconds (the legacy fallback leg)");
        }

        /// <summary>Table index of a node by id — the mutation above rewrites a row in place, and
        /// the table is an ordered list whose order is itself a value.</summary>
        private static int IndexOfNode(SimDefs defs, string id)
        {
            for (int i = 0; i < defs.Production.Nodes.Length; i++)
                if (defs.Production.Nodes[i].Id == id) return i;
            Assert.Fail("no [production] node with id '" + id + "'");
            return -1;
        }

        [Test]
        public void MutatedTicksPerTile_Diverge_ProvingStartPathReadsDefs()
        {
            // Isolates Citizen.StartPath's first-tile cooldown from CitizenSystem.Tick's
            // per-step cadence: a citizen is commanded ONE tile (adjacent target), so its
            // only hash-affecting movement is the single step StartPath schedules. Tick's
            // post-step MoveCooldown only drives the PrevPos settle window, which is NOT in
            // StateHash — so the step's TIMING (tick == ticks_per_tile) is the sole signal.
            // A doubled TicksPerTile delays that step, diverging Citizen.Pos. If StartPath
            // still read the retained const, both twins would step on the same tick and this
            // would never diverge (the plain Tick-path tripwire cannot catch that regression).
            var mutated = SimDefs.CreateDefault();
            mutated.Citizen.TicksPerTile *= 2;
            mutated.ComputeChecksum();
            Assert.That(mutated.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            AssertDivergesWithin(BuildSingleStepScenario, SimDefs.CreateDefault(), mutated, 40,
                "doubled TicksPerTile on a single-tile commanded path");
        }

        // --------------------------------------------------------- tripwire scenarios

        /// <summary>One citizen in a pressurized room, commanded a single tile to an adjacent
        /// target at tick 0. The lone movement is the step Citizen.StartPath schedules, so the
        /// tick it lands on is governed purely by the StartPath first-tile cooldown.</summary>
        private static Simulation BuildSingleStepScenario(ulong seed, SimDefs defs)
        {
            string[] map =
            {
                "#####",
                "#...#",
                "#####",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            var mover = sim.AddCitizen("Mover", new Int3(1, 1, 0)); // AutoWander false → no wander cadence
            sim.Rooms.SetAnchor("cell", new Int3(1, 1, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(1, 1, 0)));

            sim.EnqueueCommand(new MoveCitizenCommand(mover.Id, new Int3(2, 1, 0))); // one tile east
            return sim;
        }

        /// <summary>A single-room corridor split by one machine on its only passage tile,
        /// plus one wandering citizen. With the machine's Blocks false the citizen can cross;
        /// flip it true and its reachable set (and the wander RNG stream) changes.</summary>
        private static Simulation BuildBlocksScenario(ulong seed, SimDefs defs)
        {
            string[] map =
            {
                "#########",
                "#.......#",
                "#########",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            sim.AddDevice(DeviceKind.Light, new Int3(4, 1, 0), "gate"); // the sole chokepoint tile

            var walker = sim.AddCitizen("Walker", new Int3(1, 1, 0));
            walker.AutoWander = true; // defaults to false; wandering is what exercises IsWalkable

            sim.Rooms.SetAnchor("hall", new Int3(1, 1, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(1, 1, 0))); // keep the walker alive
            return sim;
        }

        /// <summary>A powered Fabricator with Scrap staged on its bench tile and one idle
        /// citizen a few tiles away, so CraftingSystem recruits, stages and drives Progress.
        /// Mutating the recipe's WorkSeconds changes the per-tick Progress increment.</summary>
        private static Simulation BuildCraftScenario(ulong seed, SimDefs defs)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            // Power: a solar wing + conduit spine along the top row feeds the fabricator.
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(3, 2, 0), "fab"); // adjacent to conduit (3,1)
            sim.AddItem(ItemKind.Scrap, 6, new Int3(4, 2, 0));             // staged on the bench's +x neighbor

            sim.AddCitizen("Smith", new Int3(1, 2, 0)); // idle (AutoWander false) → recruitable to craft

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>BuildCraftScenario's twin for the LEGACY fallback leg: a powered MachineShop
        /// with staged Parts, so the station under test is the one E0-6 left on its [recipes] row.</summary>
        private static Simulation BuildMachineShopScenario(ulong seed, SimDefs defs)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.MachineShop, new Int3(3, 2, 0), "shop");
            sim.AddItem(ItemKind.Parts, 6, new Int3(4, 2, 0));

            sim.AddCitizen("Smith", new Int3(1, 2, 0));

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static void AssertDivergesWithin(SimDefs baseDefs, SimDefs mutatedDefs, int ticks, string what)
            => AssertDivergesWithin(BuildScenario, baseDefs, mutatedDefs, ticks, what);

        private static void AssertDivergesWithin(
            Func<ulong, SimDefs, Simulation> build, SimDefs baseDefs, SimDefs mutatedDefs, int ticks, string what)
        {
            var baseline = build(42, baseDefs);
            var mutated = build(42, mutatedDefs);
            Assert.That(mutated.StateHash(), Is.EqualTo(baseline.StateHash()),
                "the two sims must start identical (defs aren't in the hash)");

            bool diverged = false;
            for (int t = 1; t <= ticks && !diverged; t++)
            {
                baseline.Tick();
                mutated.Tick();
                if (baseline.StateHash() != mutated.StateHash()) diverged = true;
            }
            Assert.That(diverged, Is.True,
                $"{what}: a mutated defs graph must change the StateHash within {ticks} ticks — " +
                "if it does not, a consumer is still reading the static default table");
        }
    }
}
