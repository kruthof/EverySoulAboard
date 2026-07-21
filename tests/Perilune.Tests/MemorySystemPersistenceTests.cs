using System.Collections.Generic;
using System.IO;
using System.Text;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// MemorySystem persistence (WS-NARRATIVE N3): the mind store — personas incl. secrets,
    /// dispositions, emotion, known-fact ids and the episodic list — plus the host's
    /// FactRegistry now ride the existing SYSS chapter via IStatefulSystem, with NO
    /// SaveWriter/Reader edit. The 'MEMS' checksum folds STRUCTURE ONLY (counts, ticks,
    /// importance/affinity/trust bits, fact ids + flags): rewording a memory is hash-silent,
    /// moving a tick/importance is not (HIST/SOCL precedent). These tests prove byte-identical
    /// retrieval, full persona/secret/fact round-trip, checksum text-invariance vs
    /// tick-sensitivity, a save@T + N-tick twin match, graceful future-version + truncation
    /// handling, and — because the MEMS fold is only present when a MemorySystem is registered
    /// in a sim's system array — that a populated mind store DOES move that sim's StateHash.
    /// </summary>
    public class MemorySystemPersistenceTests
    {
        private static readonly string[] OneRoom = { "#####", "#...#", "#####" };

        // Build a deterministic, richly-populated mind store + backing fact registry.
        private static (MindState minds, FactRegistry facts) MakePopulated()
        {
            var facts = new FactRegistry();
            var cache = facts.Add("A pre-raid supply cache near (3,4) on deck 1.", new Int3(3, 4, 1));
            var witness = facts.Add("Someone unsealed the aft airlock from the inside.");
            witness.RevealedToCrewPlayer = true;

            var minds = new MindState();
            var m = minds.Minds.GetOrCreate(10);
            m.AffinityToPlayer = 12.5f;
            m.TrustToPlayer = -3.25f;
            m.Emotion = "wary";
            m.EmotionUntilTick = 999;
            m.FollowingPlayer = true;
            m.AffinityBudgetDay = 5;
            m.AffinitySpentToday = 1.5f;
            m.Persona = new PersonaSheet
            {
                CitizenId = 10,
                Name = "Vega",
                RolePreRaid = "navigator",
                RoleNow = "general crew",
                Traits = new[] { "stoic", "wry", "haunted" },
                Values = new[] { "the ship comes first", "no one eats alone" },
                Fears = new[] { "dying in vacuum", "the dark between airlocks" },
                Secrets = new[]
                {
                    new SecretRecord { FactId = cache.Id, Text = "I stashed supplies off the manifest.", RevealDifficulty = 0.42f, RevealedToPlayer = false },
                },
                RaidBackstory = "Vega served as navigator aboard the MSV Perilune.",
                SpeechStyle = "clipped deck-slang",
            };
            m.Persona.RelationshipNotes[20] = "old bunkmate";
            m.Persona.RelationshipNotes[5] = "owes them air";
            m.KnownFactIds.Add(cache.Id);
            m.KnownFactIds.Add(witness.Id);
            m.Memory.Episodic.Add(new MemoryEntry { Tick = 100, Text = "Argued with Bo.", Importance = 0.55f, Tag = "social" });
            m.Memory.Episodic.Add(new MemoryEntry { Tick = 250, Text = "We lost someone.", Importance = 0.95f, Tag = "death" });

            // A second, sparse mind (no persona) to cover the null-persona path.
            var m2 = minds.Minds.GetOrCreate(20);
            m2.AffinityToPlayer = -8f;
            m2.Memory.Episodic.Add(new MemoryEntry { Tick = 300, Text = "Grew closer to Vega.", Importance = 0.5f, Tag = "social" });

            return (minds, facts);
        }

        private static Simulation NewSimWith(MemorySystem mem, ulong seed = 7)
            => new Simulation(AsciiWorld.Build(OneRoom), seed, new ISimSystem[] { mem });

        // -------------------------------------------------------- full SaveWriter round-trip

        [Test]
        public void SaveLoadRoundTripsMindsAndFactsHashEqual()
        {
            var (minds, facts) = MakePopulated();
            var mem = new MemorySystem(minds, facts);
            var sim = NewSimWith(mem);

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadedMinds = new MindState();
            var loadedFacts = new FactRegistry();
            var loadedMem = new MemorySystem(loadedMinds, loadedFacts);
            var loaded = SaveReader.Read(ms, new ISimSystem[] { loadedMem });

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "save → load must be hash-equal including the MEMS system fold");

            // Persona + secrets + facts + revealed flags all round-trip.
            Assert.That(loadedMinds.Minds.TryGet(10, out var m), Is.True);
            Assert.That(m.Persona, Is.Not.Null);
            Assert.That(m.Persona.Name, Is.EqualTo("Vega"));
            Assert.That(m.Persona.Traits, Is.EqualTo(new[] { "stoic", "wry", "haunted" }));
            Assert.That(m.Persona.Secrets.Length, Is.EqualTo(1));
            Assert.That(m.Persona.Secrets[0].RevealDifficulty, Is.EqualTo(0.42f));
            Assert.That(m.Persona.Secrets[0].RevealedToPlayer, Is.False);
            Assert.That(m.Persona.RelationshipNotes[5], Is.EqualTo("owes them air"));
            Assert.That(m.AffinityToPlayer, Is.EqualTo(12.5f));
            Assert.That(m.TrustToPlayer, Is.EqualTo(-3.25f));
            Assert.That(m.Emotion, Is.EqualTo("wary"));
            Assert.That(m.EmotionUntilTick, Is.EqualTo(999));
            Assert.That(m.FollowingPlayer, Is.True);
            Assert.That(m.KnownFactIds, Is.EqualTo(new List<uint> { 1u, 2u }));

            Assert.That(loadedFacts.Count, Is.EqualTo(2));
            Assert.That(loadedFacts.TryGet(1, out var f1), Is.True);
            Assert.That(f1.MarkerPos, Is.EqualTo((Int3?)new Int3(3, 4, 1)));
            Assert.That(f1.RevealedToCrewPlayer, Is.False);
            Assert.That(loadedFacts.TryGet(2, out var f2), Is.True);
            Assert.That(f2.MarkerPos, Is.Null);
            Assert.That(f2.RevealedToCrewPlayer, Is.True, "the revealed flag must survive the round-trip");
        }

        [Test]
        public void GetTopRetrievalIsByteIdenticalAfterReload()
        {
            var (minds, facts) = MakePopulated();
            var mem = new MemorySystem(minds, facts);
            var sim = NewSimWith(mem);

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadedMinds = new MindState();
            var loadedMem = new MemorySystem(loadedMinds, new FactRegistry());
            SaveReader.Read(ms, new ISimSystem[] { loadedMem });

            var before = new List<MemoryEntry>();
            var after = new List<MemoryEntry>();
            minds.GetTopMemories(10, 400, null, before, 64);
            loadedMinds.GetTopMemories(10, 400, null, after, 64);

            Assert.That(after.Count, Is.EqualTo(before.Count));
            Assert.That(after.Count, Is.GreaterThan(0), "precondition: memories exist");
            for (int i = 0; i < before.Count; i++)
            {
                Assert.That(after[i].Tick, Is.EqualTo(before[i].Tick));
                Assert.That(after[i].Text, Is.EqualTo(before[i].Text));
                Assert.That(after[i].Importance, Is.EqualTo(before[i].Importance));
                Assert.That(after[i].Tag, Is.EqualTo(before[i].Tag));
            }
        }

        // ---------------------------------------------------------------- checksum structure

        [Test]
        public void ChecksumIgnoresTextButTracksTickAndImportance()
        {
            var (minds, facts) = MakePopulated();
            var mem = new MemorySystem(minds, facts);
            ulong baseline = mem.StateChecksum();

            // Reword memory bodies, tag, persona prose, emotion, names — all strings, exempt.
            var m = minds.Minds.Items[0];
            var e = m.Memory.Episodic[0];
            e.Text = "A COMPLETELY different sentence.";
            e.Tag = "totally-different-tag";
            m.Memory.Episodic[0] = e;
            m.Emotion = "furious";
            m.Persona.Name = "Renamed";
            m.Persona.SpeechStyle = "rewritten";
            m.Persona.Secrets[0].Text = "reworded secret";
            m.Persona.RelationshipNotes[5] = "reworded note";
            facts.Facts[0].Text = "reworded fact";
            Assert.That(mem.StateChecksum(), Is.EqualTo(baseline), "free text must not enter the MEMS checksum");

            // A tick moves it.
            var e2 = m.Memory.Episodic[0];
            e2.Tick += 1;
            m.Memory.Episodic[0] = e2;
            Assert.That(mem.StateChecksum(), Is.Not.EqualTo(baseline), "tick is folded");

            // Reset, then an importance change moves it.
            var (minds2, facts2) = MakePopulated();
            var mem2 = new MemorySystem(minds2, facts2);
            var em = minds2.Minds.Items[0].Memory.Episodic[0];
            em.Importance += 0.01f;
            minds2.Minds.Items[0].Memory.Episodic[0] = em;
            Assert.That(mem2.StateChecksum(), Is.Not.EqualTo(baseline), "importance is folded");
        }

        [Test]
        public void ChecksumTracksAffinityTrustSecretsAndFactFlags()
        {
            var baseline = new MemorySystem(MakePopulated().minds, MakePopulated().facts).StateChecksum();

            var (m1, f1) = MakePopulated();
            m1.Minds.Items[0].AffinityToPlayer += 1f;
            Assert.That(new MemorySystem(m1, f1).StateChecksum(), Is.Not.EqualTo(baseline), "affinity bits fold");

            var (m2, f2) = MakePopulated();
            m2.Minds.Items[0].TrustToPlayer += 1f;
            Assert.That(new MemorySystem(m2, f2).StateChecksum(), Is.Not.EqualTo(baseline), "trust bits fold");

            var (m3, f3) = MakePopulated();
            m3.Minds.Items[0].Persona.Secrets[0].RevealedToPlayer = true;
            Assert.That(new MemorySystem(m3, f3).StateChecksum(), Is.Not.EqualTo(baseline), "secret reveal flag folds");

            var (m4, f4) = MakePopulated();
            f4.Facts[1].RevealedToCrewPlayer = false; // was true
            Assert.That(new MemorySystem(m4, f4).StateChecksum(), Is.Not.EqualTo(baseline), "fact reveal flag folds");
        }

        // ------------------------------------------------------------ live fold in the sim hash

        [Test]
        public void PopulatedMindsMoveTheRegisteredSimHash()
        {
            // The MEMS fold only enters StateHash when a MemorySystem is in the sim's system
            // array. An empty store vs a populated store must then hash differently — proving
            // the folds are live (the scenario pin does NOT move only because BuildScenario's
            // pure-sim stack has no MemorySystem).
            var emptyMem = new MemorySystem(new MindState(), new FactRegistry());
            var simEmpty = NewSimWith(emptyMem);

            var (minds, facts) = MakePopulated();
            var fullMem = new MemorySystem(minds, facts);
            var simFull = NewSimWith(fullMem);

            Assert.That(simFull.StateHash(), Is.Not.EqualTo(simEmpty.StateHash()),
                "a registered, populated mind store must move the sim StateHash");
        }

        // ---------------------------------------------------------------- save@T + N-tick twin

        [Test]
        public void SaveAtTPlusNTicksMatchesUninterruptedTwin()
        {
            const int T = 40, N = 60;

            // Twin: populate (a conversation wrote memories before T), then run uninterrupted.
            var (twinMinds, twinFacts) = MakePopulated();
            twinMinds.WriteConversationSummary(10, 0, "we talked about the reactor");
            var twin = NewSimWith(new MemorySystem(twinMinds, twinFacts));
            for (int i = 0; i < T + N; i++) twin.Tick();

            // Save path: same populate, save at T, reload into a fresh stack, run N more.
            var (saveMinds, saveFacts) = MakePopulated();
            saveMinds.WriteConversationSummary(10, 0, "we talked about the reactor");
            var toSave = NewSimWith(new MemorySystem(saveMinds, saveFacts));
            for (int i = 0; i < T; i++) toSave.Tick();

            var ms = new MemoryStream();
            SaveWriter.Write(toSave, ms);
            ms.Position = 0;

            var loadedMem = new MemorySystem(new MindState(), new FactRegistry());
            var loaded = SaveReader.Read(ms, new ISimSystem[] { loadedMem });
            for (int i = 0; i < N; i++) loaded.Tick();

            Assert.That(loaded.StateHash(), Is.EqualTo(twin.StateHash()),
                "save@T + N ticks must equal the uninterrupted twin, minds included");
        }

        // ---------------------------------------------------------------- fail-soft / versioning

        [Test]
        public void FutureVersionBlobIsSkippedGracefully()
        {
            var (minds, facts) = MakePopulated();
            var mem = new MemorySystem(minds, facts);

            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true)) mem.CaptureState(w);
            ms.Position = 0;

            // A blob from a newer build (version above StateVersion) must not throw and must
            // leave the store untouched (the chaptered-save law: SaveReader resyncs on the
            // SYSS length prefix and the sim keeps its freshly-constructed minds).
            var freshMinds = new MindState();
            freshMinds.Minds.GetOrCreate(99); // pre-existing content must be preserved (no read happens)
            var freshMem = new MemorySystem(freshMinds, new FactRegistry());
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
                Assert.DoesNotThrow(() => freshMem.RestoreState(r, (ushort)(mem.StateVersion + 1)));

            Assert.That(freshMinds.Minds.Count, Is.EqualTo(1), "future-version blob skipped, store left as-is");
            Assert.That(freshMinds.Minds.TryGet(99, out _), Is.True);
        }

        [Test]
        public void TruncatedBlobFailsSoftInsteadOfCorrupting()
        {
            var (minds, facts) = MakePopulated();
            var mem = new MemorySystem(minds, facts);

            var full = new MemoryStream();
            using (var w = new BinaryWriter(full, Encoding.UTF8, leaveOpen: true)) mem.CaptureState(w);
            byte[] bytes = full.ToArray();

            // Chop the blob mid-stream: restore must DETECT the truncation (throw) rather than
            // silently accept a half-parsed mind store.
            var truncated = new MemoryStream(bytes, 0, bytes.Length / 2);
            var freshMem = new MemorySystem(new MindState(), new FactRegistry());
            using (var r = new BinaryReader(truncated, Encoding.UTF8, leaveOpen: true))
                Assert.Throws<EndOfStreamException>(() => freshMem.RestoreState(r, mem.StateVersion));
        }

        // ---------------------------------------------------------------------- empty store

        [Test]
        public void EmptyMindsRoundTripAndChecksumIsDeterministic()
        {
            var mem = new MemorySystem(new MindState(), new FactRegistry());
            var sim = NewSimWith(mem);

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;

            var loadedMinds = new MindState();
            var loadedFacts = new FactRegistry();
            var loadedMem = new MemorySystem(loadedMinds, loadedFacts);
            var loaded = SaveReader.Read(ms, new ISimSystem[] { loadedMem });

            Assert.That(loadedMinds.Minds.Count, Is.EqualTo(0));
            Assert.That(loadedFacts.Count, Is.EqualTo(0));
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()));

            // Empty checksum is a fixed function of the 'MEMS' seed (two independent empties agree).
            var other = new MemorySystem(new MindState(), new FactRegistry());
            Assert.That(other.StateChecksum(), Is.EqualTo(mem.StateChecksum()));
        }
    }
}
