using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// B2 plumbing: the optional <c>SimDefs</c> ctor param and its pass-throughs
    /// (ShipPlanBuilder / SaveReader). Pure plumbing — no system reads Defs yet, so
    /// behaviour is unchanged; these only prove the instance is threaded to
    /// <c>sim.Defs</c> and that the default is the frozen <see cref="SimDefs.Default"/>.
    /// </summary>
    public class DefsPlumbingTests
    {
        private static ISimSystem[] Systems() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static World TinyWorld() => AsciiWorld.Build(new[]
        {
            "#####",
            "#...#",
            "#####",
        });

        [Test]
        public void Simulation_DefaultsToFrozenDefault_WhenParamOmitted()
        {
            var sim = new Simulation(TinyWorld(), 7, Systems());
            Assert.That(sim.Defs, Is.SameAs(SimDefs.Default),
                "omitting the defs param must fall back to the frozen SimDefs.Default");
        }

        [Test]
        public void Simulation_DefaultsToFrozenDefault_WhenNullPassed()
        {
            var sim = new Simulation(TinyWorld(), 7, Systems(), null);
            Assert.That(sim.Defs, Is.SameAs(SimDefs.Default));
        }

        [Test]
        public void Simulation_UsesCustomDefs_WhenProvided()
        {
            var custom = SimDefs.CreateDefault();
            var sim = new Simulation(TinyWorld(), 7, Systems(), custom);
            Assert.That(sim.Defs, Is.SameAs(custom),
                "a supplied SimDefs instance must land verbatim on sim.Defs");
        }

        [Test]
        public void ShipPlanBuilder_ForwardsDefs()
        {
            var plan = new ShipPlan
            {
                Name = "plumbing",
                Seed = 3,
                DeckRows = new[] { new[] { "#####", "#...#", "#####" } },
            };
            var custom = SimDefs.CreateDefault();
            var sim = ShipPlanBuilder.Build(plan, Systems(), custom);
            Assert.That(sim.Defs, Is.SameAs(custom));

            // Omitted param still defaults through the builder.
            var plain = ShipPlanBuilder.Build(plan, Systems());
            Assert.That(plain.Defs, Is.SameAs(SimDefs.Default));
        }

        [Test]
        public void CustomDefs_DoNotAffectStateHash()
        {
            // Defs are deliberately NOT folded into StateHash (both determinism twins
            // share one instance); until B3/B4 no system reads them, so a different
            // defs instance must leave the run bit-identical.
            var a = new Simulation(TinyWorld(), 11, Systems(), SimDefs.Default);
            var problems = new List<string>();
            var edited = DefsParser.Parse(new[] { ("edit.def", "[thermal]\ncitizen_heat_w = 999\n") }, problems);
            Assert.That(problems, Is.Empty);
            Assert.That(edited.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));
            var b = new Simulation(TinyWorld(), 11, Systems(), edited);

            for (int i = 0; i < 100; i++) { a.Tick(); b.Tick(); }
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()),
                "defs are not part of canonical state — behaviour must be unchanged in B2");
        }
    }
}
