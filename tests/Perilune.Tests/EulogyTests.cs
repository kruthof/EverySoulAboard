using System;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Eulogy (WS-NARRATIVE N5): a death produces a deterministic eulogy in the closest
    /// living friend's voice, quoting only REAL shared memories, written into the ship's
    /// history (a Eulogy entry → the Chronicle) plus grief memories (0.9 mourner / 0.5
    /// broadcast). Covers friend selection incl. deterministic ties, the anti-hallucination
    /// contract (every quote is verbatim in a real mind), the no-friend ship's-log fallback,
    /// grief importances, the Eulogy history entry + subjects, quiet-tick zero-alloc, the
    /// death-name path end-to-end through the REAL NeedsSystem.Kill, and twin-run determinism.
    /// </summary>
    public class EulogyTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };
        private static readonly SimDefs Defs = SimDefs.Default;

        private static Simulation NewSim(ulong seed = 7)
            => new Simulation(AsciiWorld.Build(OneRoom), seed, new ISimSystem[0]);

        // Publish-then-swap, mirroring the live path: the bus serves the previous tick's
        // buffer, so a swap moves the freshly-published death into readable position.
        private static void Deliver(Simulation sim, EulogySystem e)
        {
            sim.Events.SwapBuffers();
            e.Tick(sim);
        }

        private static void Remember(MindState minds, uint id, long tick, string text, float importance, string tag = "social")
            => minds.Minds.GetOrCreate(id).Memory.Add(new MemoryEntry { Tick = tick, Text = text, Importance = importance, Tag = tag });

        // ------------------------------------------------------------ friend selection

        [Test]
        public void ClosestFriendIsHighestPositiveOpinion_TieBreaksToLowestId()
        {
            var sim = NewSim();
            var a = sim.AddCitizen("Ada", new Int3(1, 1, 0));   // lower id
            var b = sim.AddCitizen("Bo", new Int3(2, 1, 0));    // higher id
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id); // the live path: gone from the store

            var minds = new MindState();
            var social = new SocialSystem();
            var history = new HistorySystem();
            // Equal positive regard from both → the tie must resolve to the lower id (Ada).
            social.Nudge(a.Id, dead.Id, 40f, Defs.Social);
            social.Nudge(b.Id, dead.Id, 40f, Defs.Social);

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            Assert.That(eulogy.Last, Is.Not.Null);
            Assert.That(eulogy.Last.FriendId, Is.EqualTo(a.Id), "equal opinion ties to the lowest id");
        }

        [Test]
        public void HigherOpinionWinsRegardlessOfIdOrder()
        {
            var sim = NewSim();
            var a = sim.AddCitizen("Ada", new Int3(1, 1, 0));   // lower id, weaker regard
            var b = sim.AddCitizen("Bo", new Int3(2, 1, 0));    // higher id, stronger regard
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id);

            var minds = new MindState();
            var social = new SocialSystem();
            var history = new HistorySystem();
            social.Nudge(a.Id, dead.Id, 15f, Defs.Social);
            social.Nudge(b.Id, dead.Id, 70f, Defs.Social);

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            Assert.That(eulogy.Last.FriendId, Is.EqualTo(b.Id), "the strongest positive regard is the mourner");
        }

        // ------------------------------------------------------------ anti-hallucination

        [Test]
        public void EveryQuotedLineIsVerbatimARealMemoryInTheFriendMind()
        {
            var sim = NewSim();
            var friend = sim.AddCitizen("Bo", new Int3(1, 1, 0));
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id);

            var minds = new MindState();
            var social = new SocialSystem();
            var history = new HistorySystem();
            social.Nudge(friend.Id, dead.Id, 55f, Defs.Social);

            // Two genuinely-shared memories: one that NAMES the dead, one at a tick the dead
            // also holds a memory (co-experience). Plus a decoy that is neither — must NOT be quoted.
            Remember(minds, friend.Id, 100, "Grew closer to Vega.", 0.5f);        // references the dead
            Remember(minds, dead.Id, 250, "Grew closer to Bo.", 0.5f);            // same tick as ↓ (co-experience)
            Remember(minds, friend.Id, 250, "The klaxon woke the whole deck.", 0.7f);
            Remember(minds, friend.Id, 300, "I fixed the scrubber alone.", 0.9f); // decoy: no name, no shared tick

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            var lines = eulogy.Last.MemoryLines;
            Assert.That(lines.Count, Is.GreaterThan(0), "a real shared memory must be quoted");
            var friendTexts = minds.Minds.GetOrCreate(friend.Id).Memory.Episodic
                .ConvertAll(m => m.Text);
            foreach (var line in lines)
            {
                Assert.That(friendTexts, Does.Contain(line), "every quoted fragment is a REAL memory text");
                Assert.That(eulogy.Last.Text, Does.Contain(line), "the rendered eulogy quotes it verbatim");
            }
            Assert.That(lines, Does.Not.Contain("I fixed the scrubber alone."),
                "an unshared memory (no name, no shared tick) is never quoted");
        }

        // ------------------------------------------------------------ no-friend fallback

        [Test]
        public void NoLivingFriendFallsBackToShipsLog()
        {
            var sim = NewSim();
            var loner = sim.AddCitizen("Ada", new Int3(1, 1, 0)); // alive, but no positive regard
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id);

            var minds = new MindState();
            var social = new SocialSystem();
            var history = new HistorySystem();
            social.Nudge(loner.Id, dead.Id, -40f, Defs.Social); // enmity is not friendship

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            Assert.That(eulogy.Last.FriendId, Is.EqualTo(0u), "no mourner");
            Assert.That(eulogy.Last.Text, Does.Contain("ship's log").And.Contain("Vega"));

            var e = history.Entries[history.Entries.Count - 1];
            Assert.That(e.Kind, Is.EqualTo((byte)HistoryKind.Eulogy));
            Assert.That(e.SubjectA, Is.EqualTo(dead.Id));
            Assert.That(e.SubjectB, Is.EqualTo(0u), "no friend subject in the fallback");
        }

        [Test]
        public void FallbackUsesEventNameWhenTheDeadCannotBeResolved()
        {
            var sim = NewSim();
            var eulogy = new EulogySystem(new MindState(), new SocialSystem(), new HistorySystem());
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = 999, Name = "Okafor" });
            Deliver(sim, eulogy);

            Assert.That(eulogy.Last.DeadName, Is.EqualTo("Okafor"));
            Assert.That(eulogy.Last.Text, Does.Contain("Okafor"));
        }

        // ------------------------------------------------------------ grief + history entry

        [Test]
        public void GriefMemoriesLandWithMournerNineAndBroadcastFive()
        {
            var sim = NewSim();
            var friend = sim.AddCitizen("Bo", new Int3(1, 1, 0));
            var bystander = sim.AddCitizen("Ada", new Int3(2, 1, 0));
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id);

            var minds = new MindState();
            minds.Minds.GetOrCreate(friend.Id);
            minds.Minds.GetOrCreate(bystander.Id);
            var social = new SocialSystem();
            var history = new HistorySystem();
            social.Nudge(friend.Id, dead.Id, 50f, Defs.Social);

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            Assert.That(HasMemory(minds, friend.Id, EulogySystem.GriefFriendImportance, "grief"), Is.True,
                "the mourner carries the 0.9 grief");
            Assert.That(HasMemory(minds, bystander.Id, EulogySystem.GriefBroadcastImportance, "grief"), Is.True,
                "the rest of the crew registers the 0.5 broadcast grief");
            // The mourner is EXCLUDED from the 0.5 broadcast (they carry the stronger 0.9).
            Assert.That(HasMemory(minds, friend.Id, EulogySystem.GriefBroadcastImportance, "grief"), Is.False);
        }

        [Test]
        public void HistoryEntryCarriesEulogyKindAndBothSubjects()
        {
            var sim = NewSim();
            var friend = sim.AddCitizen("Bo", new Int3(1, 1, 0));
            var dead = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            sim.Citizens.Remove(dead.Id);

            var minds = new MindState();
            var social = new SocialSystem();
            var history = new HistorySystem();
            social.Nudge(friend.Id, dead.Id, 50f, Defs.Social);

            var eulogy = new EulogySystem(minds, social, history);
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = dead.Id, Name = "Vega" });
            Deliver(sim, eulogy);

            var e = history.Entries[history.Entries.Count - 1];
            Assert.That(e.Kind, Is.EqualTo((byte)HistoryKind.Eulogy));
            Assert.That(e.SubjectA, Is.EqualTo(dead.Id), "primary subject = the dead");
            Assert.That(e.SubjectB, Is.EqualTo(friend.Id), "secondary subject = the mourner");
        }

        // ------------------------------------------------------------ zero-alloc quiet

        [Test]
        public void QuietTicksAllocateNothing()
        {
            var sim = NewSim();
            var eulogy = new EulogySystem(new MindState(), new SocialSystem(), new HistorySystem());

            Deliver(sim, eulogy); // warm the CitizenDiedEvent channel
            Deliver(sim, eulogy);

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 500; i++) Deliver(sim, eulogy);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0), $"death-free eulogy ticks must not allocate (saw {delta} bytes)");
        }

        // ------------------------------------------------------------ end-to-end (real Kill)

        // Minimal live stack: the REAL NeedsSystem asphyxiates the victim and publishes the
        // named CitizenDiedEvent; History + Memory + Eulogy consume it one tick later.
        private static ISimSystem[] LiveStack(MindState minds, SocialSystem social, out HistorySystem history, out EulogySystem eulogy)
        {
            history = new HistorySystem();
            eulogy = new EulogySystem(minds, social, history);
            return new ISimSystem[] { new NeedsSystem(), history, new MemorySystem(minds), eulogy };
        }

        [Test]
        public void RealNeedsKillNamesTheDeadAndEulogizesFromTheEvent()
        {
            var minds = new MindState();
            var social = new SocialSystem();
            var systems = LiveStack(minds, social, out var history, out var eulogy);
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, systems);

            var survivor = sim.AddCitizen("Bo", new Int3(3, 1, 0));
            var victim = sim.AddCitizen("Vega", new Int3(1, 1, 0));
            minds.Minds.GetOrCreate(survivor.Id);
            minds.Minds.GetOrCreate(victim.Id);
            social.Nudge(survivor.Id, victim.Id, 50f, Defs.Social); // the mourner
            victim.Suffocation = 0.99f;                             // one NeedsSystem pass from death (vacuum room)

            for (int i = 0; i < 5; i++) sim.Tick();

            Assert.That(sim.Citizens.TryGet(victim.Id, out _), Is.False, "the victim really died via NeedsSystem.Kill");
            AssertHasEntry(history, HistoryKind.Death, "Vega has died.");
            var eul = FindEntry(history, HistoryKind.Eulogy);
            Assert.That(eul.SubjectA, Is.EqualTo(victim.Id));
            Assert.That(eul.SubjectB, Is.EqualTo(survivor.Id), "the survivor eulogized the dead");
            Assert.That(HasMemory(minds, survivor.Id, EulogySystem.GriefFriendImportance, "grief"), Is.True);
        }

        [Test]
        public void TwinRunsHashIdenticalThroughTheEulogyPath()
        {
            ulong Run()
            {
                var minds = new MindState();
                var social = new SocialSystem();
                var systems = LiveStack(minds, social, out _, out _);
                var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, systems);
                var survivor = sim.AddCitizen("Bo", new Int3(3, 1, 0));
                var victim = sim.AddCitizen("Vega", new Int3(1, 1, 0));
                minds.Minds.GetOrCreate(survivor.Id);
                minds.Minds.GetOrCreate(victim.Id);
                social.Nudge(survivor.Id, victim.Id, 50f, Defs.Social);
                victim.Suffocation = 0.99f;
                for (int i = 0; i < 20; i++) sim.Tick();
                return sim.StateHash(); // folds HIST (the eulogy entry) + MEMS (the grief)
            }

            Assert.That(Run(), Is.EqualTo(Run()), "the eulogy path must be deterministic across twins");
        }

        // ----------------------------------------------------------------------- helpers

        private static bool HasMemory(MindState minds, uint id, float importance, string tag)
        {
            if (!minds.Minds.TryGet(id, out var mind)) return false;
            foreach (var m in mind.Memory.Episodic)
                if (m.Tag == tag && m.Importance == importance) return true;
            return false;
        }

        private static void AssertHasEntry(HistorySystem h, HistoryKind kind, string text)
        {
            foreach (var e in h.Entries)
                if (e.Kind == (byte)kind && e.Text == text) return;
            Assert.Fail($"no {kind} entry with text \"{text}\"");
        }

        private static HistoryEntry FindEntry(HistorySystem h, HistoryKind kind)
        {
            foreach (var e in h.Entries)
                if (e.Kind == (byte)kind) return e;
            Assert.Fail($"no {kind} entry");
            return default;
        }
    }
}
