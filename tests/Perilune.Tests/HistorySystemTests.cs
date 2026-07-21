using System;
using System.IO;
using System.Text;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// HistorySystem enrichment (WS-NARRATIVE N1): entries gain a structural Kind +
    /// two subject ids, deaths keep their CitizenId + name, the new contract events
    /// (brownout/relationship/argument/bond/construction) become history, and the
    /// SYSS blob versions v1→v2 while strings stay hash-exempt. The tick-3000 golden +
    /// the ScenarioRunner pin (ci.sh) prove the intended hash move under twin-run.
    /// </summary>
    public class HistorySystemTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        private static Simulation NewSim(ulong seed = 7)
            => new Simulation(AsciiWorld.Build(OneRoom), seed, new ISimSystem[0]);

        // Publish-then-swap: the event bus serves the PREVIOUS tick's buffer, so a swap
        // moves freshly-published events into readable position before HistorySystem runs.
        private static void Deliver(Simulation sim, HistorySystem h)
        {
            sim.Events.SwapBuffers();
            h.Tick(sim);
        }

        // ------------------------------------------------------------- enrichment writes

        [Test]
        public void DeathEntryKeepsCitizenIdAndName()
        {
            var sim = NewSim();
            var vega = sim.AddCitizen("Vega", new Int3(1, 1, 0));
            var h = new HistorySystem();

            sim.Events.Publish(new CitizenDiedEvent { CitizenId = vega.Id, Pos = vega.Pos });
            Deliver(sim, h);

            Assert.That(h.Entries.Count, Is.EqualTo(1));
            var e = h.Entries[0];
            Assert.That(e.Kind, Is.EqualTo((byte)HistoryKind.Death));
            Assert.That(e.SubjectA, Is.EqualTo(vega.Id), "the CitizenId must be retained, not discarded");
            Assert.That(e.Text, Does.Contain("Vega"), "entry text names the crew member when resolvable");
        }

        [Test]
        public void DeathOfAlreadyRemovedCitizenKeepsIdWithGracefulText()
        {
            // Mirrors the live path: NeedsSystem.Kill removes the citizen the same tick it
            // publishes CitizenDiedEvent, so at HistorySystem's next-tick read the lookup
            // misses. The id survives; the text degrades to a neutral line.
            var sim = NewSim();
            var h = new HistorySystem();
            const uint ghostId = 4242;

            sim.Events.Publish(new CitizenDiedEvent { CitizenId = ghostId, Pos = new Int3(1, 1, 0) });
            Deliver(sim, h);

            var e = h.Entries[0];
            Assert.That(e.Kind, Is.EqualTo((byte)HistoryKind.Death));
            Assert.That(e.SubjectA, Is.EqualTo(ghostId));
            Assert.That(e.Text, Is.EqualTo("A crew member has died."));
        }

        [Test]
        public void ContractEventsBecomeCategorisedHistoryWithSubjects()
        {
            var sim = NewSim();
            var a = sim.AddCitizen("Ada", new Int3(1, 1, 0));
            var b = sim.AddCitizen("Bo", new Int3(2, 1, 0));
            var h = new HistorySystem();

            sim.Events.Publish(new BrownoutChangedEvent { NetworkId = 3, InBrownout = true });
            sim.Events.Publish(new RelationshipChangedEvent { From = a.Id, To = b.Id, OldRel = 0, NewRel = 1 });
            sim.Events.Publish(new ArgumentEvent { A = a.Id, B = b.Id });
            sim.Events.Publish(new BondEvent { A = a.Id, B = b.Id });
            sim.Events.Publish(new ConstructionCompletedEvent { BuilderId = a.Id, BuildKind = 1, Pos = new Int3(1, 1, 0) });
            Deliver(sim, h);

            Assert.That(h.Entries.Count, Is.EqualTo(5));
            AssertHasKind(h, HistoryKind.Brownout, 0, 0);
            AssertHasKind(h, HistoryKind.RelationshipChanged, a.Id, b.Id);
            AssertHasKind(h, HistoryKind.Argument, a.Id, b.Id);
            AssertHasKind(h, HistoryKind.Bond, a.Id, b.Id);
            AssertHasKind(h, HistoryKind.ConstructionCompleted, a.Id, 0);

            // Names are woven into the pairwise text.
            foreach (var e in h.Entries)
                if (e.Kind == (byte)HistoryKind.Argument)
                    Assert.That(e.Text, Does.Contain("Ada").And.Contain("Bo"));
        }

        [Test]
        public void AlarmAndGoalPreserveLegacyTextAndKind()
        {
            var sim = NewSim();
            var h = new HistorySystem();
            sim.Events.Publish(new AlarmRaisedEvent { SourceId = "reactor", Message = "OVERHEAT" });
            sim.Events.Publish(new GoalCompletedEvent { Text = "Restore power" });
            Deliver(sim, h);

            AssertHasKind(h, HistoryKind.Alarm, 0, 0);
            AssertHasKind(h, HistoryKind.Goal, 0, 0);
            foreach (var e in h.Entries)
            {
                if (e.Kind == (byte)HistoryKind.Alarm) Assert.That(e.Text, Is.EqualTo("reactor: OVERHEAT"));
                if (e.Kind == (byte)HistoryKind.Goal) Assert.That(e.Text, Is.EqualTo("Objective complete: Restore power"));
            }
        }

        // ---------------------------------------------------------------- save versioning

        [Test]
        public void V1SaveLoadsWithDefaultKindAndSubjects()
        {
            // A pre-enrichment (v1) blob: count + (tick, text) pairs, no kind/subjects.
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true))
            {
                w.Write(2);
                w.Write(100L); w.Write("Blight detected in Bay 3");
                w.Write(250L); w.Write("A crew member has died.");
            }
            ms.Position = 0;

            var h = new HistorySystem();
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
                h.RestoreState(r, 1);

            Assert.That(h.Entries.Count, Is.EqualTo(2));
            Assert.That(h.Entries[0].Tick, Is.EqualTo(100L));
            Assert.That(h.Entries[0].Text, Is.EqualTo("Blight detected in Bay 3"));
            foreach (var e in h.Entries)
            {
                Assert.That(e.Kind, Is.EqualTo((byte)HistoryKind.Generic), "v1 entries default to Generic");
                Assert.That(e.SubjectA, Is.EqualTo(0u));
                Assert.That(e.SubjectB, Is.EqualTo(0u));
            }
        }

        [Test]
        public void V2RoundTripsAllFieldsAndChecksum()
        {
            var h = new HistorySystem();
            h.Entries.Add(new HistoryEntry(100, "reactor: OVERHEAT", (byte)HistoryKind.Alarm));
            h.Entries.Add(new HistoryEntry(200, "Ada and Bo argued.", (byte)HistoryKind.Argument, 5, 9));
            h.Entries.Add(new HistoryEntry(300, "Vega has died.", (byte)HistoryKind.Death, 7));

            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true)) h.CaptureState(w);
            ms.Position = 0;

            var loaded = new HistorySystem();
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
                loaded.RestoreState(r, h.StateVersion);

            Assert.That(loaded.Entries.Count, Is.EqualTo(3));
            for (int i = 0; i < h.Entries.Count; i++)
            {
                Assert.That(loaded.Entries[i].Tick, Is.EqualTo(h.Entries[i].Tick));
                Assert.That(loaded.Entries[i].Text, Is.EqualTo(h.Entries[i].Text));
                Assert.That(loaded.Entries[i].Kind, Is.EqualTo(h.Entries[i].Kind));
                Assert.That(loaded.Entries[i].SubjectA, Is.EqualTo(h.Entries[i].SubjectA));
                Assert.That(loaded.Entries[i].SubjectB, Is.EqualTo(h.Entries[i].SubjectB));
            }
            Assert.That(loaded.StateChecksum(), Is.EqualTo(h.StateChecksum()));
        }

        // ------------------------------------------------------ checksum: structure hashed

        [Test]
        public void MutatingTextDoesNotChangeChecksumButKindAndSubjectsDo()
        {
            var baseline = Single(100, "text one", HistoryKind.Argument, 5, 9);

            // Same structure, wildly different text → identical checksum (strings exempt).
            Assert.That(Single(100, "a COMPLETELY different sentence", HistoryKind.Argument, 5, 9).StateChecksum(),
                Is.EqualTo(baseline.StateChecksum()), "free text must not enter the checksum");

            // Any structural change moves it.
            Assert.That(Single(100, "text one", HistoryKind.Bond, 5, 9).StateChecksum(),
                Is.Not.EqualTo(baseline.StateChecksum()), "Kind is folded");
            Assert.That(Single(100, "text one", HistoryKind.Argument, 6, 9).StateChecksum(),
                Is.Not.EqualTo(baseline.StateChecksum()), "SubjectA is folded");
            Assert.That(Single(100, "text one", HistoryKind.Argument, 5, 10).StateChecksum(),
                Is.Not.EqualTo(baseline.StateChecksum()), "SubjectB is folded");
            Assert.That(Single(101, "text one", HistoryKind.Argument, 5, 9).StateChecksum(),
                Is.Not.EqualTo(baseline.StateChecksum()), "Tick is folded");
        }

        // --------------------------------------------------------------- determinism / alloc

        [Test]
        public void QuietTicksAllocateNothing()
        {
            var sim = NewSim();
            var h = new HistorySystem();

            // Warm up: the first Read<T> per event type constructs its channel (one-off
            // alloc). After a full tick every channel exists, so steady state is quiet.
            Deliver(sim, h);
            Deliver(sim, h);

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 500; i++) Deliver(sim, h);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0), $"quiet history ticks must not allocate (saw {delta} bytes)");
            Assert.That(h.Entries.Count, Is.EqualTo(0));
        }

        [Test]
        public void TwinRunsHashIdenticalWithHistoryFold()
        {
            var a = SimHost.Build(SimHost.DefaultSeed);
            var b = SimHost.Build(SimHost.DefaultSeed);
            for (int i = 0; i < 400; i++) { a.Sim.Tick(); b.Sim.Tick(); }
            Assert.That(a.Sim.StateHash(), Is.EqualTo(b.Sim.StateHash()),
                "the HIST fold (kind+subjects) must stay deterministic across twins");
        }

        // ----------------------------------------------------------------------- helpers

        private static HistorySystem Single(long tick, string text, HistoryKind kind, uint a = 0, uint b = 0)
        {
            var h = new HistorySystem();
            h.Entries.Add(new HistoryEntry(tick, text, (byte)kind, a, b));
            return h;
        }

        private static void AssertHasKind(HistorySystem h, HistoryKind kind, uint a, uint b)
        {
            foreach (var e in h.Entries)
                if (e.Kind == (byte)kind && e.SubjectA == a && e.SubjectB == b)
                    return;
            Assert.Fail($"no {kind} entry with subjects ({a},{b})");
        }
    }
}
