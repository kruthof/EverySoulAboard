using System;
using System.Collections.Generic;
using System.IO;
using Moonbase.Dsl;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// DesignerRuleSystem (B5): ship-wide rules authored as MOSS in <c>SimDefs.Rules</c>,
    /// run by a second interpreter over the SHARED device registry. Covers edge-trigger
    /// once, fail-soft compile, budget halt isolation, twin determinism (incl. latch/timer
    /// fold), SYSS save round-trip, the read-only <c>ship</c> namespace, the rules-absent
    /// hash invariant, and the shipped example rule compiling clean.
    /// </summary>
    public class DesignerRuleTests
    {
        // ---- a tiny scriptable, standalone (the Unity FakeDevice isn't in this host) ----
        private sealed class FakeDevice : IScriptable
        {
            public readonly Dictionary<string, DslValue> Props = new Dictionary<string, DslValue>();
            public int InvokeCount;
            public string LastVerb;

            public bool TryGetProperty(string name, out DslValue value) => Props.TryGetValue(name, out value);

            public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
            {
                error = null;
                InvokeCount++;
                LastVerb = verb;
                return true;
            }
        }

        private static SimDefs DefsWithRules(params (string name, string source)[] rules)
        {
            var d = SimDefs.CreateDefault(); // fresh, mutable graph (never the frozen Default)
            d.Rules = new RuleDef[rules.Length];
            for (int i = 0; i < rules.Length; i++) d.Rules[i] = new RuleDef(rules[i].name, rules[i].source);
            d.ComputeChecksum();
            return d;
        }

        /// <summary>A bare 4x4 sim with the rule system wired to <paramref name="registry"/>
        /// and a ship-metrics adapter registered — devices the rules reference must be
        /// registered on <paramref name="registry"/> before the first tick.</summary>
        private static (Simulation sim, DesignerRuleSystem rules) NewRuleSim(
            DeviceRegistry registry, ulong seed, SimDefs defs)
        {
            var moss = new ScriptRuntime(registry);
            var rules = new DesignerRuleSystem(registry);
            var sim = new Simulation(new World(4, 4, 1), seed, SystemStack.CreateDefault(moss, rules), defs);
            registry.Register("ship", new ShipMetricsAdapter(sim));
            return (sim, rules);
        }

        // ------------------------------------------------------------------ fires once

        [Test]
        public void Rule_EdgeTrigger_FiresExactlyOnce()
        {
            var registry = new DeviceRegistry();
            var sensor = new FakeDevice(); sensor.Props["value"] = DslValue.Number(10);
            var door = new FakeDevice();
            registry.Register("sensor", sensor);
            registry.Register("door_a", door);

            var (sim, rules) = NewRuleSim(registry, 1,
                DefsWithRules(("open_when_high", "when sensor.value > 5: open(door_a)\n")));

            sim.Tick();
            Assert.AreEqual(1, door.InvokeCount, "condition true on the first tick fires once");
            Assert.AreEqual(1, rules.ActiveRuleCount, "the rule compiled clean and is live");

            for (int t = 0; t < 20; t++) sim.Tick();
            Assert.AreEqual(1, door.InvokeCount, "edge latch: no re-fire while the condition stays true");

            // A real false->true edge fires exactly once more.
            sensor.Props["value"] = DslValue.Number(0);
            sim.Tick();
            sensor.Props["value"] = DslValue.Number(10);
            sim.Tick();
            Assert.AreEqual(2, door.InvokeCount, "re-armed latch fires once on the next real edge");
        }

        // ---------------------------------------------------------------- fail-soft

        [Test]
        public void BrokenRule_FailsSoft_OthersRun_DiagnosticsRecorded()
        {
            var registry = new DeviceRegistry();
            var sensor = new FakeDevice(); sensor.Props["value"] = DslValue.Number(10);
            var door = new FakeDevice();
            registry.Register("sensor", sensor);
            registry.Register("door_a", door);

            var (sim, rules) = NewRuleSim(registry, 1, DefsWithRules(
                ("broken", "when sensor.value >: open(door_a)\n"),      // malformed comparison
                ("good", "when sensor.value > 5: open(door_a)\n")));

            sim.Tick();

            Assert.AreEqual(1, door.InvokeCount, "the healthy rule still runs despite the broken sibling");
            Assert.AreEqual(1, rules.ActiveRuleCount, "only the good rule is active");

            bool brokenReported = false;
            foreach (var (rule, diags) in rules.CompileDiagnostics)
                if (rule == "broken" && diags.Count > 0) brokenReported = true;
            Assert.IsTrue(brokenReported, "the broken rule's compile diagnostics are collected and exposed");
        }

        // ------------------------------------------------------------- budget halt

        [Test]
        public void BudgetOverrun_HaltsRuleNotSim_OthersUnaffected()
        {
            var over = new System.Text.StringBuilder();
            for (int i = 0; i < 300; i++) over.Append("let x = 1 + 1\n"); // blows the 1000-step/rule budget

            var registry = new DeviceRegistry();
            var sensor = new FakeDevice(); sensor.Props["value"] = DslValue.Number(10);
            var door = new FakeDevice();
            registry.Register("sensor", sensor);
            registry.Register("door_a", door);

            var (sim, rules) = NewRuleSim(registry, 1, DefsWithRules(
                ("hog", over.ToString()),
                ("good", "when sensor.value > 5: open(door_a)\n")));

            Assert.DoesNotThrow(() => sim.Tick(), "a rule budget overrun must never take the sim down");
            Assert.IsTrue(rules.TryGetRuntimeError("hog", out var e));
            Assert.AreEqual("BudgetExceeded", e);
            Assert.AreEqual(1, door.InvokeCount, "the sibling rule ran normally the same tick");

            for (int t = 0; t < 10; t++) Assert.DoesNotThrow(() => sim.Tick());
            Assert.IsTrue(rules.TryGetRuntimeError("hog", out _), "the halted rule stays halted");
        }

        // -------------------------------------------------------- twin determinism

        [Test]
        public void TwinDeterminism_WithRules_IdenticalHashesInclLatchState()
        {
            SimDefs Defs() => DefsWithRules(
                ("latch", "when sensor.value > 5: open(door_a)\n"),
                ("timer", "every 3s: alarm(\"tick\")\n"));

            (Simulation, DesignerRuleSystem) Build(ulong seed)
            {
                var reg = new DeviceRegistry();
                var sensor = new FakeDevice(); sensor.Props["value"] = DslValue.Number(10);
                reg.Register("sensor", sensor);
                reg.Register("door_a", new FakeDevice());
                return NewRuleSim(reg, seed, Defs());
            }

            var (a, _) = Build(42);
            var (b, _) = Build(42);
            for (int t = 0; t < 200; t++)
            {
                a.Tick(); b.Tick();
                if (t % 25 == 0)
                    Assert.AreEqual(a.StateHash(), b.StateHash(), $"rule twins diverged at tick {t}");
            }
            Assert.AreEqual(a.StateHash(), b.StateHash(), "final rule-twin hashes match (incl. latch/timer fold)");

            // The rule system's presence actually perturbs the hash (the honest gating):
            // an otherwise-identical sim with NO rule system must differ.
            var regPlain = new DeviceRegistry();
            var mossPlain = new ScriptRuntime(regPlain);
            var plain = new Simulation(new World(4, 4, 1), 42, SystemStack.CreateDefault(mossPlain), DefsWithRules());
            for (int t = 0; t < 200; t++) plain.Tick();
            Assert.AreNotEqual(a.StateHash(), plain.StateHash(),
                "a rules-present sim must fold its latch/timer state into StateHash");
        }

        // ---------------------------------------------------- SYSS save round-trip

        [Test]
        public void SaveRoundTrip_PreservesLatchState_NoPhantomRefire()
        {
            const string source = "when sensor.value > 5: open(door_a)\n";

            var reg1 = new DeviceRegistry();
            var sensor1 = new FakeDevice(); sensor1.Props["value"] = DslValue.Number(10);
            var door1 = new FakeDevice();
            reg1.Register("sensor", sensor1);
            reg1.Register("door_a", door1);
            var (sim, _) = NewRuleSim(reg1, 7, DefsWithRules(("latch", source)));

            for (int t = 0; t < 10; t++) sim.Tick();
            Assert.AreEqual(1, door1.InvokeCount, "precondition: latched exactly once before the save");

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;

            // Fresh everything, as a real load would build it — rules come from defs again.
            var reg2 = new DeviceRegistry();
            var sensor2 = new FakeDevice(); sensor2.Props["value"] = DslValue.Number(10);
            var door2 = new FakeDevice();
            reg2.Register("sensor", sensor2);
            reg2.Register("door_a", door2);
            var moss2 = new ScriptRuntime(reg2);
            var rules2 = new DesignerRuleSystem(reg2);
            var loaded = SaveReader.Read(blob, SystemStack.CreateDefault(moss2, rules2),
                DefsWithRules(("latch", source)), new List<string>());
            reg2.Register("ship", new ShipMetricsAdapter(loaded));

            for (int t = 0; t < 50; t++)
            {
                loaded.Tick();
                Assert.AreEqual(0, loaded.Events.Read<AlarmRaisedEvent>().Length, "no phantom alarm after load");
            }
            Assert.AreEqual(0, door2.InvokeCount, "restored latch does NOT re-run its body — behaves as if never interrupted");

            // The restored latch is live, not dead: a real edge after load fires once.
            sensor2.Props["value"] = DslValue.Number(0);
            loaded.Tick();
            sensor2.Props["value"] = DslValue.Number(10);
            loaded.Tick();
            Assert.AreEqual(1, door2.InvokeCount, "a genuine edge after load fires exactly once");
        }

        // ------------------------------------------------- ship.* metrics namespace

        [Test]
        public void ShipNamespace_DirectRead_AllPropertiesResolve()
        {
            var reg = new DeviceRegistry();
            var (sim, _) = NewRuleSim(reg, 1, DefsWithRules());
            var ship = new ShipMetricsAdapter(sim);

            foreach (var prop in new[] { "power", "o2", "co2", "water", "food", "heat", "morale" })
                Assert.IsTrue(ship.TryGetProperty(prop, out _), $"ship.{prop} must resolve");

            Assert.IsFalse(ship.TryGetProperty("nonsense", out _), "unknown ship property is unresolved, not thrown");

            // With no powered demand, Power is a full 1.0 (deterministic on a bare sim).
            Assert.IsTrue(ship.TryGetProperty("power", out var power));
            Assert.AreEqual(1.0, power.Num, 1e-9, "no demand => power fully served");

            Assert.IsFalse(ship.TryInvoke("open", Array.Empty<DslValue>(), 0, out _), "ship is read-only");
        }

        [Test]
        public void ShipNamespace_ReadableFromAPlayerScript()
        {
            // The same shared registry backs both runtimes, so a PLAYER script reads ship.*.
            var reg = new DeviceRegistry();
            var moss = new ScriptRuntime(reg);
            var door = new FakeDevice();
            reg.Register("door_a", door);
            var sim = new Simulation(new World(4, 4, 1), 1, new ISimSystem[] { moss });
            reg.Register("ship", new ShipMetricsAdapter(sim));

            var diags = moss.SetProgram("term_a", "when ship.power > 0.5: open(door_a)\n");
            Assert.AreEqual(0, diags.Count, diags.Count > 0 ? diags[0].ToString() : "");

            sim.Tick();
            Assert.AreEqual(1, door.InvokeCount, "a player script can read the ship metrics namespace");
        }

        // ---------------------------------------------------- rules-absent invariant

        [Test]
        public void RulesAbsent_NullArg_MatchesOneArgOverload_NoPerturbation()
        {
            Simulation Plain(bool twoArgNull)
            {
                var reg = new DeviceRegistry();
                var moss = new ScriptRuntime(reg);
                var stack = twoArgNull
                    ? SystemStack.CreateDefault(moss, null)
                    : SystemStack.CreateDefault(moss);
                return new Simulation(new World(4, 4, 1), 42, stack);
            }

            var a = Plain(false);
            var b = Plain(true);
            for (int t = 0; t < 200; t++) { a.Tick(); b.Tick(); }
            Assert.AreEqual(a.StateHash(), b.StateHash(),
                "designerRules=null must build the exact pre-B5 stack (no extra IStatefulSystem fold)");
        }

        // ------------------------------------------------------ shipped example rule

        [Test]
        public void ShippedExampleRule_CompilesWithZeroDiagnostics()
        {
            string dir = FindSimDefsDir();
            Assert.That(dir, Is.Not.Null, "StreamingAssets/SimDefs must be discoverable from the test binary");
            string path = Path.Combine(dir, "rules", "overheat_guard.moss");
            Assert.That(File.Exists(path), Is.True, "the example rule overheat_guard.moss must ship");

            var compiled = MossCompiler.Compile(File.ReadAllText(path));
            Assert.IsFalse(compiled.HasErrors, "the shipped example rule must compile clean");
            Assert.AreEqual(0, compiled.Diagnostics.Count,
                compiled.Diagnostics.Count > 0 ? compiled.Diagnostics[0].ToString() : "");
        }

        private static string FindSimDefsDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "content", "core", "SimDefs");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }
    }
}
