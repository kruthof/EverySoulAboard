using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Director v0 (WS-NARRATIVE N6): a deterministic tension curve from REAL sim state
    /// (resource/morale deficits + exponentially-decayed recent alarm/death pressure) driving
    /// ONE sim-legal lever — WearPressure, a bounded multiplier on machine wear. The Director
    /// never rolls dice or spawns events. Covers the tension golden over a scripted stress arc,
    /// lever build-when-quiet / release-after-incidents, the clamp under adversarial all-dead /
    /// zero-resource states, the MachineWear coupling (absent = identity 1.0, present scales
    /// wear), save round-trip + twin-run on an AUGMENTED stack, def equivalence + tripwire, and
    /// zero-alloc in the cadenced pass. Ships UNREGISTERED — these tests build it standalone.
    /// </summary>
    public class DirectorSystemTests
    {
        private static readonly string[] OneRoom = { "#######", "#.....#", "#######" };
        private static readonly Int3 Inside = new Int3(1, 1, 0);

        private static void TickTo(Simulation sim, long target)
        {
            while (sim.TickCount < target) sim.Tick();
        }

        // A director-only sim with fully-controlled metrics.
        private static Simulation DirectorSim(out DirectorSystem director, SimDefs defs = null)
        {
            director = new DirectorSystem();
            return new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { director }, defs);
        }

        // Drive all deficits to zero: high morale, full water, food-per-head met, power served.
        private static void MakeQuiet(Simulation sim)
        {
            var a = sim.AddCitizen("A", Inside); a.Mood = 100f;
            var b = sim.AddCitizen("B", new Int3(2, 1, 0)); b.Mood = 100f;
            sim.AddDevice(DeviceKind.WaterTank, new Int3(3, 1, 0), "tank").StoredLiters = sim.Defs.Water.TankCapacityLiters;
            sim.AddItem(ItemKind.Potato, 10, new Int3(4, 1, 0)); // pop 2 → target 10 → Food = 1
        }

        // Publishes scripted deaths/alarms on given ticks (before the Director in the array, so
        // the Director reads them one tick later via the double-buffered bus).
        private sealed class Stimulus : ISimSystem
        {
            public string Name => "Stim";
            public int IntervalTicks => 1;
            public readonly Dictionary<long, int> Deaths = new Dictionary<long, int>();
            public readonly Dictionary<long, int> Alarms = new Dictionary<long, int>();
            public void Tick(Simulation sim)
            {
                if (Deaths.TryGetValue(sim.TickCount, out int dc))
                    for (int i = 0; i < dc; i++) sim.Events.Publish(new CitizenDiedEvent { CitizenId = 1, Name = "x" });
                if (Alarms.TryGetValue(sim.TickCount, out int ac))
                    for (int i = 0; i < ac; i++) sim.Events.Publish(new AlarmRaisedEvent { SourceId = "s", Message = "m" });
            }
        }

        // ------------------------------------------------------------ tension baseline

        [Test]
        public void EmptySimTensionIsTheWeightedResourceDeficitBaseline()
        {
            // pop 0, no tanks, no power draw → morale/water/food deficits = 1, power deficit = 0.
            // tension = 0.4 + 0.2 + 0.2 + 0 = 0.8 exactly. No dice, no events — pure state read.
            var sim = DirectorSim(out var director);
            TickTo(sim, 1); // tick 0 is a cadenced pass
            Assert.That(director.Tension, Is.EqualTo(0.8f).Within(1e-5f));
        }

        // ------------------------------------------------------------ tension golden arc

        [Test]
        public void TensionGolden_QuietBaseline_DeathSpike_ThenDecay()
        {
            var director = new DirectorSystem();
            var stim = new Stimulus();
            stim.Deaths[100] = 1; // one death, read on tick 101, folded at the tick-200 recompute
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { stim, director });
            MakeQuiet(sim);

            TickTo(sim, 101); // after the tick-100 cadenced pass (death not yet accumulated)
            float leverQuiet = director.WearPressure;
            Assert.That(director.Tension, Is.EqualTo(0f).Within(1e-5f), "all deficits zero → tension 0");
            Assert.That(leverQuiet, Is.GreaterThan(1f), "quiet stretch BUILDS the lever above 1.0");

            TickTo(sim, 201); // after the tick-200 pass: deathAccum = 1 → tension = 0.5 * 1
            Assert.That(director.Tension, Is.EqualTo(0.5f).Within(1e-5f), "one recent death → 0.5 tension");
            Assert.That(director.WearPressure, Is.LessThan(leverQuiet), "tension above target RELEASES the lever");

            TickTo(sim, 301); // after the tick-300 pass: deathAccum decayed 0.95 → tension 0.475
            Assert.That(director.Tension, Is.EqualTo(0.475f).Within(1e-4f), "death pressure decays exponentially");
        }

        [Test]
        public void RecentAlarmsRaiseTension()
        {
            var director = new DirectorSystem();
            var stim = new Stimulus();
            stim.Alarms[100] = 2; // two alarms, weight 0.1 each → +0.2 over the quiet baseline
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { stim, director });
            MakeQuiet(sim);

            TickTo(sim, 201);
            Assert.That(director.Tension, Is.EqualTo(0.2f).Within(1e-5f), "2 alarms × 0.1 weight = 0.2");
        }

        // ------------------------------------------------------------ lever clamp

        [Test]
        public void LeverClampedUnderAllDeadAndZeroResources()
        {
            // Adversarial: no crew, no tanks — every deficit maxes out and deaths pile on.
            var director = new DirectorSystem();
            var stim = new Stimulus();
            for (long t = 0; t < 2000; t += 50) stim.Deaths[t] = 3; // sustained catastrophe
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { stim, director });

            TickTo(sim, 2001);
            Assert.That(director.Tension, Is.InRange(0f, 1f), "tension stays clamped to [0,1] (never NaN)");
            Assert.That(float.IsNaN(director.WearPressure), Is.False);
            Assert.That(director.WearPressure, Is.EqualTo(1f),
                "sustained high tension pins the lever at its 1.0 floor — never below, never runaway");
        }

        [Test]
        public void LeverNeverExceedsTheDefBound()
        {
            // Quiet forever → the lever builds, but only up to MaxWearPressure.
            var sim = DirectorSim(out var director);
            MakeQuiet(sim);
            TickTo(sim, 6000); // ~60 periods, far more than needed to saturate
            Assert.That(director.WearPressure, Is.EqualTo(sim.Defs.Director.MaxWearPressure).Within(1e-5f));
            Assert.That(director.WearPressure, Is.LessThanOrEqualTo(sim.Defs.Director.MaxWearPressure));
        }

        // ------------------------------------------------------------ MachineWear coupling

        [Test]
        public void WearPressureIsIdentityWhenDirectorAbsent()
        {
            // A never-ticked Director sits at WearPressure 1.0; coupling to it must be a no-op
            // (× 1f is IEEE identity), so the coupled sim hashes byte-identically to the plain one.
            ulong Run(bool couple)
            {
                var director = new DirectorSystem(); // constructed, never ticked → WearPressure 1.0
                Assert.That(director.WearPressure, Is.EqualTo(1f));
                var wear = couple ? new MachineWearSystem(director) : new MachineWearSystem();
                var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { wear });
                var scr = sim.AddDevice(DeviceKind.Scrubber, new Int3(2, 1, 0), "scr");
                scr.Powered = true; scr.Condition = 1f;
                for (int i = 0; i < 1000; i++) sim.Tick();
                return sim.StateHash();
            }
            Assert.That(Run(true), Is.EqualTo(Run(false)), "absent/1.0 WearPressure changes nothing");
        }

        [Test]
        public void HigherWearPressureAcceleratesWear()
        {
            Device BuildAndRun(bool withDirector)
            {
                DirectorSystem director = withDirector ? new DirectorSystem() : null;
                var wear = new MachineWearSystem(director);
                var systems = director != null
                    ? new ISimSystem[] { director, wear }
                    : new ISimSystem[] { wear };
                var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, systems);
                MakeQuiet(sim); // quiet → the Director builds WearPressure toward the max
                var scr = sim.AddDevice(DeviceKind.Scrubber, new Int3(5, 1, 0), "scr");
                scr.Powered = true; scr.Condition = 1f;
                for (int i = 0; i < 6000; i++) sim.Tick();
                if (withDirector)
                    Assert.That(director.WearPressure, Is.GreaterThan(1.5f), "quiet stretch built the lever up");
                return scr;
            }

            var coupled = BuildAndRun(true);
            var plain = BuildAndRun(false);
            Assert.That(coupled.Condition, Is.LessThan(plain.Condition),
                "a raised WearPressure grinds the machine down faster than the uncoupled baseline");
        }

        // ------------------------------------------------------------ persistence + twins

        // The M1 "resolve-if-present, else append" pattern: use the integrator's DirectorSystem
        // once it is registered; until then append one in its planned slot (before HistorySystem).
        private static ISimSystem[] AugmentedStack(out DirectorSystem director)
        {
            var baseStack = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            director = null;
            foreach (var s in baseStack) if (s is DirectorSystem d) director = d;
            if (director != null) return baseStack;

            var list = new List<ISimSystem>(baseStack);
            director = new DirectorSystem();
            int idx = list.FindIndex(s => s is HistorySystem);
            if (idx < 0) idx = list.Count;
            list.Insert(idx, director);
            return list.ToArray();
        }

        private static Simulation AugmentedSim(ulong seed, out DirectorSystem director)
        {
            var systems = AugmentedStack(out director);
            var sim = new Simulation(AsciiWorld.Build(OneRoom), seed, systems);
            MakeQuiet(sim);
            return sim;
        }

        [Test]
        public void StateRoundTripsUnit()
        {
            var sim = DirectorSim(out var director);
            MakeQuiet(sim);
            TickTo(sim, 500); // populate tension / lever / accumulators with non-trivial values

            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true)) director.CaptureState(w);
            ms.Position = 0;

            var loaded = new DirectorSystem();
            using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                loaded.RestoreState(r, director.StateVersion);

            Assert.That(loaded.StateChecksum(), Is.EqualTo(director.StateChecksum()));
            Assert.That(loaded.Tension, Is.EqualTo(director.Tension));
            Assert.That(loaded.WearPressure, Is.EqualTo(director.WearPressure));
        }

        [Test]
        public void FullSaveLoadRoundTripsThroughTheSyssChapter()
        {
            // A Director+Stimulus stack: the deaths/alarms populate non-trivial tension/lever/
            // accumulators, and all fire well before the save so the event bus is EMPTY at the
            // save boundary (avoiding the in-flight-event artifact of mid-flight saves).
            Simulation Build(out DirectorSystem d)
            {
                d = new DirectorSystem();
                var stim = new Stimulus();
                stim.Deaths[50] = 2;
                stim.Alarms[120] = 3;
                return new Simulation(AsciiWorld.Build(OneRoom), 11, new ISimSystem[] { stim, d });
            }

            var sim = Build(out var director);
            for (int i = 0; i < 500; i++) sim.Tick(); // last event at tick 120 → bus quiet by 500

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadedDirector = new DirectorSystem();
            var loaded = SaveReader.Read(ms, new ISimSystem[] { new Stimulus(), loadedDirector });
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "the 'DRCT' chapter (tension, lever, accumulators) round-trips bit-exactly");
            Assert.That(loadedDirector.WearPressure, Is.EqualTo(director.WearPressure));
            Assert.That(loadedDirector.Tension, Is.EqualTo(director.Tension));

            for (int i = 0; i < 300; i++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "resumed sims stay bit-identical");
        }

        [Test]
        public void TwinRunsOnAnAugmentedStackHashIdentical()
        {
            var a = AugmentedSim(11, out _);
            var b = AugmentedSim(11, out _);
            for (int i = 0; i < 800; i++) { a.Tick(); b.Tick(); }
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()),
                "the 'DRCT' fold stays deterministic across twins");
        }

        // ------------------------------------------------------------ def ritual

        private static SimDefs ParseDirector(string text)
        {
            var problems = new List<string>();
            var d = DefsParser.Parse(new[] { ("director.def", text) }, problems);
            Assert.That(problems, Is.Empty, "unexpected parse problems: " + string.Join(" | ", problems));
            return d;
        }

        [Test]
        public void ShippedDirectorDefaultsEqualTheCompiledChecksum()
        {
            var d = ParseDirector(
                "[director]\n" +
                "weight_morale_deficit  = 0.4\n" +
                "weight_water_deficit   = 0.2\n" +
                "weight_food_deficit    = 0.2\n" +
                "weight_power_deficit   = 0.2\n" +
                "weight_alarm           = 0.1\n" +
                "weight_death           = 0.5\n" +
                "alarm_decay_per_period = 0.9\n" +
                "death_decay_per_period = 0.95\n" +
                "max_wear_pressure      = 2\n" +
                "lever_target_tension   = 0.35\n" +
                "lever_step             = 0.1\n" +
                "period_ticks           = 100\n");
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum),
                "authoring the director defaults as data must not change any tuning value");
        }

        [Test]
        public void DirectorValueEditChangesChecksum()
        {
            var edited = ParseDirector("[director]\nmax_wear_pressure = 3\n");
            Assert.That(edited.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum), "a director value edit is folded");
        }

        [Test]
        public void DirectorReadsMaxWearPressureFromDefs()
        {
            // Tripwire: the system must clamp the lever to the DEF bound, not a const. Raise the
            // bound to 3 and a quiet sim builds the lever past 2.0.
            var mutated = SimDefs.CreateDefault();
            mutated.Director.MaxWearPressure = 3f;
            mutated.ComputeChecksum();

            var sim = DirectorSim(out var director, mutated);
            MakeQuiet(sim);
            TickTo(sim, 8000);
            Assert.That(director.WearPressure, Is.EqualTo(3f).Within(1e-5f),
                "the lever saturates at the def bound (3.0), proving the system reads sim.Defs.Director");
        }

        // ------------------------------------------------------------ zero-alloc

        [Test]
        public void CadencedPassAllocatesNothing()
        {
            var sim = DirectorSim(out _);
            MakeQuiet(sim);
            // Warm up: room recompute settles and every event channel is constructed.
            for (int i = 0; i < 205; i++) sim.Tick(); // spans two cadenced passes

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 500; i++) sim.Tick(); // includes 5 cadenced recomputes
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0), $"the director (incl. cadenced recompute) must not allocate (saw {delta} bytes)");
        }
    }
}
