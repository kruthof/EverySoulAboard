using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// SocialSystem v0 (WS-SOCIAL P1): co-location familiarity, decay toward zero,
    /// clamps, save round-trip via the SYSS chapter, twin determinism, and the
    /// defs tripwire proving the system actually reads social.def values.
    /// </summary>
    public class SocialSystemTests
    {
        private static readonly string[] OneRoom =
        {
            "#####",
            "#...#",
            "#####",
        };

        private static readonly string[] TwoRooms =
        {
            "#########",
            "#...#...#",
            "#########",
        };

        private static Simulation NewSim(string[] map, ulong seed, out SocialSystem social, SimDefs defs = null)
        {
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            social = FindSocial(systems);
            return new Simulation(AsciiWorld.Build(map), seed, systems, defs);
        }

        private static SocialSystem FindSocial(ISimSystem[] systems)
        {
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is SocialSystem s) return s;
            Assert.Fail("SocialSystem missing from SystemStack.CreateDefault");
            return null;
        }

        // 30 social passes in 300 ticks; per pass net = (familiarize − decay) / 3600 s.
        private const int Ticks = 300;
        private const int Passes = Ticks / 10;

        [Test]
        public void SharedRoomFamiliarizesBothDirections()
        {
            var sim = NewSim(OneRoom, 7, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            for (int i = 0; i < Ticks; i++) sim.Tick();

            float perPass = (2f - 0.1f) / 3600f;
            float expected = Passes * perPass;
            Assert.That(social.GetOpinion(a.Id, b.Id), Is.EqualTo(expected).Within(1e-4));
            Assert.That(social.GetOpinion(b.Id, a.Id), Is.EqualTo(social.GetOpinion(a.Id, b.Id)));
        }

        [Test]
        public void SeparateRoomsStayStrangers()
        {
            var sim = NewSim(TwoRooms, 7, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(6, 1, 0));
            for (int i = 0; i < Ticks; i++) sim.Tick();

            Assert.That(social.GetOpinion(a.Id, b.Id), Is.EqualTo(0f));
            Assert.That(social.Edges.Count, Is.EqualTo(0), "no edge may exist for a never-met pair");
        }

        [Test]
        public void OpinionDecaysTowardZeroWhenApart()
        {
            var sim = NewSim(TwoRooms, 7, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(6, 1, 0));
            social.Nudge(a.Id, b.Id, 5f, sim.Defs.Social);
            social.Nudge(b.Id, a.Id, -5f, sim.Defs.Social);
            for (int i = 0; i < Ticks; i++) sim.Tick();

            float decayed = Passes * (0.1f / 3600f);
            Assert.That(social.GetOpinion(a.Id, b.Id), Is.EqualTo(5f - decayed).Within(1e-4));
            Assert.That(social.GetOpinion(b.Id, a.Id), Is.EqualTo(-5f + decayed).Within(1e-4));
        }

        [Test]
        public void OpinionsClampToDefsBounds()
        {
            var sim = NewSim(TwoRooms, 7, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(6, 1, 0));

            social.Nudge(a.Id, b.Id, 1e6f, sim.Defs.Social);
            social.Nudge(a.Id, b.Id, 10f, sim.Defs.Social);
            Assert.That(social.GetOpinion(a.Id, b.Id), Is.EqualTo(100f));

            social.Nudge(b.Id, a.Id, -1e6f, sim.Defs.Social);
            Assert.That(social.GetOpinion(b.Id, a.Id), Is.EqualTo(-100f));
        }

        [Test]
        public void OpinionsSurviveSaveRoundTripHashEqual()
        {
            var sim = NewSim(OneRoom, 7, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            for (int i = 0; i < Ticks; i++) sim.Tick();
            Assert.That(social.Edges.Count, Is.GreaterThan(0), "precondition: edges exist");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            var loaded = SaveReader.Read(ms, systems);
            var loadedSocial = FindSocial(systems);

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "save → load must be hash-equal including the SOCL system fold");
            Assert.That(loadedSocial.GetOpinion(a.Id, b.Id),
                Is.EqualTo(social.GetOpinion(a.Id, b.Id)));
        }

        [Test]
        public void TwinRunsWithSocialInteractionsStayHashIdentical()
        {
            var simA = NewSim(OneRoom, 11, out _);
            var simB = NewSim(OneRoom, 11, out _);
            simA.AddCitizen("A", new Int3(1, 1, 0)); simA.AddCitizen("B", new Int3(3, 1, 0));
            simB.AddCitizen("A", new Int3(1, 1, 0)); simB.AddCitizen("B", new Int3(3, 1, 0));
            for (int i = 0; i < Ticks; i++) { simA.Tick(); simB.Tick(); }
            Assert.That(simA.StateHash(), Is.EqualTo(simB.StateHash()));
        }

        [Test]
        public void SocialDefFileValuesAreActuallyConsumed()
        {
            // Defs tripwire (README.def invariant): a retuned social.def must change
            // behavior — proving parser key AND system consumption, not just storage.
            var problems = new List<string>();
            var tuned = DefsParser.Parse(
                new[] { ("social.def", "[social]\nfamiliarize_per_hour = 4\n") }, problems);
            Assert.That(problems, Is.Empty);
            Assert.That(tuned.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            var simDefault = NewSim(OneRoom, 7, out var socialDefault);
            var simTuned = NewSim(OneRoom, 7, out var socialTuned, tuned);
            var d1 = simDefault.AddCitizen("A", new Int3(1, 1, 0));
            simDefault.AddCitizen("B", new Int3(3, 1, 0));
            var t1 = simTuned.AddCitizen("A", new Int3(1, 1, 0));
            simTuned.AddCitizen("B", new Int3(3, 1, 0));
            for (int i = 0; i < Ticks; i++) { simDefault.Tick(); simTuned.Tick(); }

            float defaultOpinion = socialDefault.GetOpinion(d1.Id, d1.Id + 1);
            float tunedOpinion = socialTuned.GetOpinion(t1.Id, t1.Id + 1);
            Assert.That(tunedOpinion, Is.GreaterThan(defaultOpinion),
                "doubled familiarize_per_hour must accrue faster than the default");
        }
    }
}
