using System;
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

        /// <summary>A sim whose ONLY system is SocialSystem: citizens never move, no needs
        /// overwrite Mood, no other system draws sim.Rng — so the S1 hysteresis + roll
        /// behavior is exercised in isolation and its event counts are exactly deterministic.
        /// (Simulation.Tick still recomputes rooms each tick, so co-location works.)</summary>
        private static Simulation NewSocialOnly(string[] map, ulong seed, out SocialSystem social, SimDefs defs = null)
        {
            social = new SocialSystem();
            return new Simulation(AsciiWorld.Build(map), seed, new ISimSystem[] { social }, defs);
        }

        private static readonly string[] TwoRoomsPairs =
        {
            "#########",
            "#...#...#",
            "#########",
        };

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

        // ---------------------------------------------------------------- S1: types

        // Advance one 1 Hz social pass (10 ticks), tallying events AFTER EACH tick — the
        // event bus double-buffer only retains the previous tick, so a once-per-pass event
        // is lost if you read only at the end of the block.
        private static void RunPass(Simulation sim, ref int rel, ref int arg, ref int bond)
        {
            for (int t = 0; t < 10; t++)
            {
                sim.Tick();
                rel += sim.Events.Read<RelationshipChangedEvent>().Length;
                arg += sim.Events.Read<ArgumentEvent>().Length;
                bond += sim.Events.Read<BondEvent>().Length;
            }
        }

        [Test]
        public void HysteresisHoldsFriendAcrossOpinionJitter()
        {
            // Drive ONE directed edge's opinion 31↔29 repeatedly (astride the Friend
            // enter=30 / exit=20 band). Hysteresis must classify Friend ONCE and hold it —
            // exactly one transition, exactly one event — never re-firing on the jitter.
            var sim = NewSocialOnly(TwoRooms, 7, out var social); // apart → no co-location rolls
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(6, 1, 0));

            int rel = 0, arg = 0, bond = 0;
            social.Nudge(a.Id, b.Id, 31f, sim.Defs.Social);   // 0 → 31 (enter Friend)
            RunPass(sim, ref rel, ref arg, ref bond);
            Assert.That(social.GetRelation(a.Id, b.Id), Is.EqualTo(RelationType.Friend));
            Assert.That(rel, Is.EqualTo(1), "None→Friend is the first and only transition");

            for (int cycle = 0; cycle < 12; cycle++)
            {
                social.Nudge(a.Id, b.Id, -2.001f, sim.Defs.Social); // ~31 → ~29 (inside the band)
                RunPass(sim, ref rel, ref arg, ref bond);
                social.Nudge(a.Id, b.Id, 2.001f, sim.Defs.Social);  // ~29 → ~31
                RunPass(sim, ref rel, ref arg, ref bond);
            }

            Assert.That(social.GetRelation(a.Id, b.Id), Is.EqualTo(RelationType.Friend),
                "held Friend across the whole jitter");
            Assert.That(rel, Is.EqualTo(1), "hysteresis fired exactly one relationship transition");
            Assert.That(arg + bond, Is.EqualTo(0), "separated pair never argues or bonds");
        }

        [Test]
        public void FixedSeedScenarioHasExactDeterministicEventCounts()
        {
            // Exact-count golden (NOT statistical): one bonding pair (seeded +40, happy) and
            // one arguing pair (seeded -40, miserable), each co-located, over 10k ticks under
            // the shipped defaults. The counts below are pinned; a behavior change moves them.
            int rel = 0, arg = 0, bond = 0;
            RunFixedScenario(1234, ref rel, ref arg, ref bond);

            Assert.That(rel, Is.EqualTo(8),  "relationship transitions (Friend+CloseFriend ×2 edges, Rival+Enemy ×2 edges)");
            Assert.That(arg, Is.EqualTo(51), "argument events over the 10k-tick run");
            Assert.That(bond, Is.EqualTo(19), "bond events over the 10k-tick run");

            // Twin determinism on the exact same scenario: identical counts, bit-for-bit.
            int rel2 = 0, arg2 = 0, bond2 = 0;
            RunFixedScenario(1234, ref rel2, ref arg2, ref bond2);
            Assert.That((rel2, arg2, bond2), Is.EqualTo((rel, arg, bond)), "twin run must reproduce every count");
        }

        private static void RunFixedScenario(ulong seed, ref int rel, ref int arg, ref int bond)
        {
            var sim = NewSocialOnly(TwoRoomsPairs, seed, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));   // room L
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            var c = sim.AddCitizen("C", new Int3(5, 1, 0));   // room R
            var d = sim.AddCitizen("D", new Int3(7, 1, 0));

            // Bonding pair: warm, happy (bond gate = opinion ≥ 20).
            social.Nudge(a.Id, b.Id, 40f, sim.Defs.Social);
            social.Nudge(b.Id, a.Id, 40f, sim.Defs.Social);
            // Arguing pair: sour + miserable (argument gate = opinion ≤ -20 AND mood < 0).
            social.Nudge(c.Id, d.Id, -40f, sim.Defs.Social);
            social.Nudge(d.Id, c.Id, -40f, sim.Defs.Social);
            c.Mood = -20f; d.Mood = -20f; // no NeedsSystem here, so this stays put

            for (int i = 0; i < 1000; i++) RunPass(sim, ref rel, ref arg, ref bond); // 10k ticks
        }

        [Test]
        public void V1SaveBlobRestoresRelAsNoneThenRederives()
        {
            // A pre-S1 (v1) SYSS blob has NO Rel byte and NO roll-stream words. It must load
            // (edges intact, Rel=None), and the very next social pass must re-derive Rel.
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);            // edge count (v1 layout: count, then From/To/Opinion)
                w.Write((uint)100);    // From
                w.Write((uint)200);    // To
                w.Write(50f);          // Opinion (Friend zone)
            }
            ms.Position = 0;

            var social = new SocialSystem();
            using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                social.RestoreState(r, version: 1);

            Assert.That(social.Edges.Count, Is.EqualTo(1), "v1 edge restored");
            Assert.That(social.GetOpinion(100, 200), Is.EqualTo(50f));
            Assert.That(social.GetRelation(100, 200), Is.EqualTo(RelationType.None),
                "v1 blob has no Rel — restores as None");

            // Attach to a sim and run one pass: classification must re-derive Friend.
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[] { social });
            for (int t = 0; t < 10; t++) sim.Tick();
            Assert.That(social.GetRelation(100, 200), Is.EqualTo(RelationType.Friend),
                "the next pass re-derives Rel from the restored opinion");
        }

        [Test]
        public void SteadyStateSocialPassAllocatesNothing()
        {
            // Alloc-cop: after warm-up (edges formed, roll stream forked, event channels &
            // buffers sized, all transitions fired), the co-location + roll + classify pass
            // must allocate zero bytes — the sorted-insert-on-first-contact convention.
            var sim = NewSocialOnly(OneRoom, 99, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            // Push straight into the stable CloseFriend + bonds-firing regime.
            social.Nudge(a.Id, b.Id, 100f, sim.Defs.Social);
            social.Nudge(b.Id, a.Id, 100f, sim.Defs.Social);

            for (int i = 0; i < 5000; i++) sim.Tick();  // warm-up (fork, channels, transitions)

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();  // steady state
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"steady-state social pass must be zero-alloc, saw {delta} bytes");
        }

        [Test]
        public void RelSurvivesSaveRoundTripHashEqualAndRollStreamResumes()
        {
            // S1 v2 save: OpinionEdge.Rel AND the forked roll-stream state round-trip, and
            // the StateHash (SOCL fold) matches — so a resumed game keeps identical
            // relationship tiers and an identical future argument/bond cadence.
            var sim = NewSocialOnly(OneRoom, 5, out var social);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            social.Nudge(a.Id, b.Id, 65f, sim.Defs.Social);   // CloseFriend zone
            social.Nudge(b.Id, a.Id, 65f, sim.Defs.Social);
            for (int i = 0; i < 50; i++) sim.Tick();
            Assert.That(social.GetRelation(a.Id, b.Id), Is.EqualTo(RelationType.CloseFriend));

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadedSocial = new SocialSystem();
            var loaded = SaveReader.Read(ms, new ISimSystem[] { loadedSocial });

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "v2 SOCL fold (Rel + roll stream) must be hash-equal across save/load");
            Assert.That(loadedSocial.GetRelation(a.Id, b.Id), Is.EqualTo(RelationType.CloseFriend));

            // Continue both sims equally: identical future ⇒ the roll stream resumed exactly.
            for (int i = 0; i < 500; i++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "resumed roll stream must keep the two sims bit-identical");
        }

        [Test]
        public void SocialS1DefFieldsAreActuallyConsumed()
        {
            // DEF-FIELD tripwire for the S1 tunables: retuning them must change behavior,
            // proving parser keys AND system consumption (not just storage + checksum).
            var problems = new List<string>();

            // (a) A lower friend_enter_opinion classifies Friend at a lower opinion.
            var tunedThresh = DefsParser.Parse(
                new[] { ("social.def", "[social]\nfriend_enter_opinion = 10\n") }, problems);
            Assert.That(problems, Is.Empty);
            Assert.That(tunedThresh.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            var simDef = NewSocialOnly(TwoRooms, 3, out var socDef);
            var simTun = NewSocialOnly(TwoRooms, 3, out var socTun, tunedThresh);
            var da = simDef.AddCitizen("A", new Int3(1, 1, 0)); simDef.AddCitizen("B", new Int3(6, 1, 0));
            var ta = simTun.AddCitizen("A", new Int3(1, 1, 0)); simTun.AddCitizen("B", new Int3(6, 1, 0));
            socDef.Nudge(da.Id, da.Id + 1, 15f, simDef.Defs.Social); // 15: below default enter, above tuned
            socTun.Nudge(ta.Id, ta.Id + 1, 15f, simTun.Defs.Social);
            for (int t = 0; t < 10; t++) { simDef.Tick(); simTun.Tick(); }
            Assert.That(socDef.GetRelation(da.Id, da.Id + 1), Is.EqualTo(RelationType.None),
                "opinion 15 < default friend_enter_opinion (30) ⇒ still None");
            Assert.That(socTun.GetRelation(ta.Id, ta.Id + 1), Is.EqualTo(RelationType.Friend),
                "opinion 15 ≥ tuned friend_enter_opinion (10) ⇒ Friend — the field is consumed");

            // (b) A raised bond_chance_per_pass fires strictly more bonds over a fixed run.
            var tunedRate = DefsParser.Parse(
                new[] { ("social.def", "[social]\nbond_chance_per_pass = 0.9\n") }, problems);
            Assert.That(problems, Is.Empty);
            int rBase = 0, aBase = 0, bBase = 0, rTun = 0, aTun = 0, bTun = 0;
            RunBondScenario(SimDefs.CreateDefault(), ref rBase, ref aBase, ref bBase);
            RunBondScenario(tunedRate, ref rTun, ref aTun, ref bTun);
            Assert.That(bTun, Is.GreaterThan(bBase),
                "raising bond_chance_per_pass must fire more bond events — the rate is consumed");
        }

        private static void RunBondScenario(SimDefs defs, ref int rel, ref int arg, ref int bond)
        {
            var sim = NewSocialOnly(OneRoom, 8, out var social, defs);
            var a = sim.AddCitizen("A", new Int3(1, 1, 0));
            var b = sim.AddCitizen("B", new Int3(3, 1, 0));
            social.Nudge(a.Id, b.Id, 50f, sim.Defs.Social);
            social.Nudge(b.Id, a.Id, 50f, sim.Defs.Social);
            for (int i = 0; i < 200; i++) RunPass(sim, ref rel, ref arg, ref bond);
        }
    }
}
