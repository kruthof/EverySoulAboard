using System;
using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Memory rules enrichment (WS-NARRATIVE N2): the MemorySystem rule table turns the
    /// wave-1 social/promise events into episodic memories for the citizens involved,
    /// the conversation-summary API writes a template recap, dead citizens are skipped,
    /// and the cap/eviction protects high-importance memories. Mind state only enters
    /// Simulation.StateHash when the MemorySystem is registered in the sim's system array
    /// (N3's MEMS fold); the tests below drive an UNregistered MemorySystem, so those runs
    /// stay hash-neutral — the round-trip + fold coverage lives in MemorySystemPersistenceTests.
    /// </summary>
    public class MemoryRulesTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        private sealed class Fx
        {
            public Simulation Sim;
            public MindState Minds;
            public MemorySystem Mem;
            public Citizen A;
            public Citizen B;
        }

        private static Fx Build(bool mindForA = true, bool mindForB = true)
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            var a = sim.AddCitizen("Ada", new Int3(1, 1, 0));
            var b = sim.AddCitizen("Bo", new Int3(2, 1, 0));
            var minds = new MindState();
            if (mindForA) minds.Minds.GetOrCreate(a.Id);
            if (mindForB) minds.Minds.GetOrCreate(b.Id);
            return new Fx { Sim = sim, Minds = minds, Mem = new MemorySystem(minds), A = a, B = b };
        }

        // The event bus serves the PREVIOUS tick's buffer, so swap freshly-published
        // events into readable position before the MemorySystem rule pass runs.
        private static void Deliver(Fx fx)
        {
            fx.Sim.Events.SwapBuffers();
            fx.Mem.Tick(fx.Sim);
        }

        private static List<MemoryEntry> Memories(Fx fx, uint id)
        {
            var into = new List<MemoryEntry>();
            fx.Minds.GetTopMemories(id, fx.Sim.TickCount, null, into, 64);
            return into;
        }

        // ------------------------------------------------------------- pairwise/personal

        [Test]
        public void ArgumentWritesOneSocialMemoryToEachParticipantAboutTheOther()
        {
            var fx = Build();
            fx.Sim.Events.Publish(new ArgumentEvent { A = fx.A.Id, B = fx.B.Id });
            Deliver(fx);

            var forA = Memories(fx, fx.A.Id);
            var forB = Memories(fx, fx.B.Id);
            Assert.That(forA.Count, Is.EqualTo(1));
            Assert.That(forB.Count, Is.EqualTo(1));
            Assert.That(forA[0].Tag, Is.EqualTo("social"));
            Assert.That(forA[0].Importance, Is.EqualTo(MemorySystem.ArgumentImportance));
            Assert.That(forA[0].Text, Does.Contain("Bo"), "A remembers arguing with B");
            Assert.That(forB[0].Text, Does.Contain("Ada"), "B remembers arguing with A");
        }

        [Test]
        public void EachRuleFiresExactlyOncePerEvent()
        {
            var fx = Build();
            fx.Sim.Events.Publish(new ArgumentEvent { A = fx.A.Id, B = fx.B.Id });
            Deliver(fx);
            // A second pass with nothing re-published: the buffer is empty, no new writes.
            Deliver(fx);

            Assert.That(Memories(fx, fx.A.Id).Count, Is.EqualTo(1), "one event → one memory, not one-per-tick");
        }

        [Test]
        public void BondAndRelationshipWriteSocialMemories()
        {
            var fx = Build();
            fx.Sim.Events.Publish(new BondEvent { A = fx.A.Id, B = fx.B.Id });
            fx.Sim.Events.Publish(new RelationshipChangedEvent { From = fx.A.Id, To = fx.B.Id, OldRel = 0, NewRel = 2 });
            Deliver(fx);

            var forA = Memories(fx, fx.A.Id);
            var forB = Memories(fx, fx.B.Id);
            // A: bond + relationship (relationship is directed, only the From side).
            Assert.That(forA.Count, Is.EqualTo(2));
            Assert.That(forB.Count, Is.EqualTo(1), "relationship change writes only to the opinion holder");
            foreach (var m in forA) Assert.That(m.Tag, Is.EqualTo("social"));
            Assert.That(HasImportance(forA, MemorySystem.BondImportance));
            Assert.That(HasImportance(forA, MemorySystem.RelationshipImportance));
        }

        [Test]
        public void AcceptedAgreeTaskWritesAPromiseMemoryOnlyOnAcceptance()
        {
            var fx = Build();
            fx.Sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = fx.A.Id, Kind = EffectKind.AgreeTask, Accepted = true });
            // A rejected agree, and an accepted but different effect: neither is a promise.
            fx.Sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = fx.B.Id, Kind = EffectKind.AgreeTask, Accepted = false });
            fx.Sim.Events.Publish(new CitizenEffectAppliedEvent
            { CitizenId = fx.B.Id, Kind = EffectKind.SetEmotionalState, Accepted = true });
            Deliver(fx);

            var forA = Memories(fx, fx.A.Id);
            Assert.That(forA.Count, Is.EqualTo(1));
            Assert.That(forA[0].Tag, Is.EqualTo("promise"));
            Assert.That(forA[0].Importance, Is.EqualTo(MemorySystem.PromiseImportance));
            Assert.That(Memories(fx, fx.B.Id).Count, Is.EqualTo(0), "rejected / non-task effects form no promise");
        }

        // ------------------------------------------------------------------ dead / absent

        [Test]
        public void DeadCitizensReceiveNoMemories()
        {
            var fx = Build();
            fx.B.Dead = true;
            fx.Sim.Events.Publish(new ArgumentEvent { A = fx.A.Id, B = fx.B.Id });
            Deliver(fx);

            Assert.That(Memories(fx, fx.A.Id).Count, Is.EqualTo(1), "the living participant still remembers");
            Assert.That(Memories(fx, fx.B.Id).Count, Is.EqualTo(0), "the dead participant records nothing");
        }

        [Test]
        public void CitizenWithoutAMindIsSkippedSafely()
        {
            var fx = Build(mindForB: false);
            fx.Sim.Events.Publish(new ArgumentEvent { A = fx.A.Id, B = fx.B.Id });
            Assert.DoesNotThrow(() => Deliver(fx));
            Assert.That(Memories(fx, fx.A.Id).Count, Is.EqualTo(1));
        }

        // ------------------------------------------------------------------ summary API

        [Test]
        public void WriteConversationSummaryAddsATaggedMemory()
        {
            var fx = Build();
            fx.Minds.WriteConversationSummary(fx.A.Id, 500, "We talked about the reactor.");
            var forA = Memories(fx, fx.A.Id);
            Assert.That(forA.Count, Is.EqualTo(1));
            Assert.That(forA[0].Tag, Is.EqualTo("conversation"));
            Assert.That(forA[0].Text, Is.EqualTo("We talked about the reactor."));
            Assert.That(forA[0].Importance, Is.EqualTo(MindState.ConversationSummaryImportance));

            // No-op for a citizen without a mind.
            Assert.DoesNotThrow(() => fx.Minds.WriteConversationSummary(9999, 500, "nobody"));
        }

        // -------------------------------------------------------------- cap / eviction

        [Test]
        public void FloodOfLowImportanceNeverEvictsAHighImportanceDeathMemory()
        {
            var mind = new CitizenMind { CitizenId = 1 };
            mind.Memory.Add(new MemoryEntry { Tick = 0, Text = "Vega died.", Importance = 0.95f, Tag = "death" });

            // Overflow the cap many times over with 0.1-importance social noise.
            for (int i = 0; i < CitizenMemory.Cap * 3; i++)
                mind.Memory.Add(new MemoryEntry { Tick = i + 1, Text = "small talk", Importance = 0.1f, Tag = "social" });

            Assert.That(mind.Memory.Episodic.Count, Is.EqualTo(CitizenMemory.Cap));
            bool deathSurvives = false;
            foreach (var m in mind.Memory.Episodic)
                if (m.Tag == "death" && m.Importance >= 0.95f) deathSurvives = true;
            Assert.That(deathSurvives, Is.True, "the 0.95 death memory must outlive a flood of 0.1 entries");
        }

        // -------------------------------------------------------- unhashed / determinism

        [Test]
        public void MemoryWritesDoNotTouchTheSimStateHash()
        {
            // Isolate memory from history: a stack with ONLY the MemorySystem (no
            // HistorySystem, which N1 makes hash these same events). simA gets a social
            // event + a promise + a conversation summary; simB gets none. The MemorySystem
            // here is driven manually, NOT registered in either sim's system array, so its
            // MEMS fold never enters StateHash — the two stay hash-identical even though A's
            // minds diverge. (Registered-fold coverage is in MemorySystemPersistenceTests.)
            var simA = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            var simB = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[0]);
            var a1 = simA.AddCitizen("Ada", new Int3(1, 1, 0)); var a2 = simA.AddCitizen("Bo", new Int3(2, 1, 0));
            simB.AddCitizen("Ada", new Int3(1, 1, 0)); simB.AddCitizen("Bo", new Int3(2, 1, 0));

            var mindsA = new MindState(); mindsA.Minds.GetOrCreate(a1.Id); mindsA.Minds.GetOrCreate(a2.Id);
            var mindsB = new MindState(); mindsB.Minds.GetOrCreate(a1.Id); mindsB.Minds.GetOrCreate(a2.Id);
            var memA = new MemorySystem(mindsA);
            var memB = new MemorySystem(mindsB);

            Assert.That(simA.StateHash(), Is.EqualTo(simB.StateHash()), "precondition: twins start equal");

            // A gets events; B does not. Drive each MemorySystem over the delivered buffer.
            simA.Events.Publish(new ArgumentEvent { A = a1.Id, B = a2.Id });
            simA.Events.Publish(new CitizenEffectAppliedEvent { CitizenId = a1.Id, Kind = EffectKind.AgreeTask, Accepted = true });
            simA.Events.SwapBuffers(); memA.Tick(simA);
            simB.Events.SwapBuffers(); memB.Tick(simB);
            mindsA.WriteConversationSummary(a1.Id, simA.TickCount, "chatter");

            var forA = new List<MemoryEntry>();
            mindsA.GetTopMemories(a1.Id, simA.TickCount, null, forA, 64);
            Assert.That(forA.Count, Is.GreaterThan(0), "precondition: A's minds actually diverged");

            Assert.That(simA.StateHash(), Is.EqualTo(simB.StateHash()),
                "memory writes are unhashed — the sim with memories hashes identically to the one without");
        }

        [Test]
        public void QuietTicksAllocateNothing()
        {
            var fx = Build();
            Deliver(fx); // warm all event channels
            Deliver(fx);

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 500; i++) Deliver(fx);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;
            Assert.That(delta, Is.EqualTo(0), $"quiet memory ticks must not allocate (saw {delta} bytes)");
        }

        private static bool HasImportance(List<MemoryEntry> ms, float imp)
        {
            foreach (var m in ms) if (Math.Abs(m.Importance - imp) < 1e-6f) return true;
            return false;
        }
    }
}
