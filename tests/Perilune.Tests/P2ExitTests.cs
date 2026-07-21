using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Llm;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE P2 exit test: one headless "Talking Ship" slice boot exercising every P2 lane's
    /// contract together, entirely offline (TemplateBackend, no network) and deterministic.
    /// On a single 8-crew <see cref="AuthoredShips.PeriluneSlice"/> boot (via the file-IO-free
    /// <see cref="GenSimHost"/> + <see cref="SimDefs.Default"/> path the survivability canary
    /// already uses) we drive one arc and prove, in order:
    ///
    ///   1. A <see cref="ConversationService"/> turn writes memory — a slice citizen asked
    ///      about their secret reveals a REAL fact: it flips in the <see cref="FactRegistry"/>,
    ///      the persona secret's revealed flag flips, and conversation-derived memories land.
    ///   2. MEMS survives a full SaveWriter/SaveReader round-trip mid-run — personas/memories
    ///      are byte-faithful (GetTop equality) and every canonical system fold (MEMS incl.)
    ///      continues bit-identically N ticks past the reload vs the uninterrupted twin.
    ///   3. Social fires naturally — the seeded web produces an Argument/Bond early, and it
    ///      lands in History AND as memories in both minds.
    ///   4. A death through the REAL physics path (a sealed cabin vented to vacuum by a
    ///      SetTileCommand hull breach) fires a named CitizenDiedEvent; the EulogySystem
    ///      writes a eulogy whose quoted lines are verbatim in the mourner's mind, the
    ///      Chronicle's death day headlines that eulogy, and grief memories land.
    ///   5. The Director stays alive — WearPressure builds above 1.0 over the quiet stretch,
    ///      and after the death Tension &gt; 0 with WearPressure in [1, MaxWearPressure].
    ///   6. The ENTIRE arc, run twice with the same seed and command script (conversation
    ///      included), stays hash-identical.
    ///   7. Offline template turns never bill: their reported token usage is all-zero, so even
    ///      priced against a haiku-class model in a real price table the projected $/hr is 0.
    ///
    /// Timing: the whole suite adds well under the CI budget (the slice boot is cheap and the
    /// death physics need only a few thousand ticks). The arc is built twice in OneTimeSetUp
    /// (primary + determinism twin) and shared across the P1..P5 asserts.
    /// </summary>
    public class P2ExitTests
    {
        // ---- geometry of the death path (cabin_1 on deck 1) ----
        private static readonly Int3 CabinTarget = new Int3(43, 2, 1); // an interior cabin_1 tile
        private static readonly Int3 CabinDoor = new Int3(44, 5, 1);   // door_cabin_1
        private static readonly Int3 CabinBreach = new Int3(43, 3, 1); // voided → vents the sealed cabin

        private const string Victim = "Amara Okonkwo"; // isolated + vented; mourner is her strongest tie
        private const string Interlocutor = "Dmitri Volkov"; // the conversation partner (not the victim)
        private const string Utterance = "So — got any secrets for me?";

        private Arc _arc;
        private ulong _twinHash;

        [OneTimeSetUp]
        public void BuildScenarioOnce()
        {
            _arc = RunArc();
            _twinHash = RunArc().FinalHash; // twin: same seed + same command script
        }

        // ============================================================ the shared arc

        private static GenSimHost BootSlice()
        {
            var host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default);
            AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, Find<SocialSystem>(host.Sim));
            return host;
        }

        private sealed class Arc
        {
            public ulong FinalHash;
            // P1 — conversation writes memory + flips a real fact
            public int RevealDispatched;
            public bool FactRevealedBefore, FactRevealedAfter, SecretFlagAfter;
            public int RevealMemDelta;
            public float AffinityDelta;
            // P3 — social fires naturally
            public bool SocialFound;
            public HistoryKind SocialKind;
            public uint SocialA, SocialB;
            public string SocialAName, SocialBName;
            public bool AMindNamesB, BMindNamesA;
            // P5 — director builds during the quiet stretch
            public float MaxQuietWear;
            // P4 — death → eulogy
            public bool DeathFired;
            public string DiedEventName;
            public int AliveAfterDeath;
            public string EulogyDead, EulogyFriend, EulogyText;
            public uint EulogyFriendId;
            public List<string> EulogyLines;
            public bool AllLinesVerbatim, MournerGrief, BroadcastGrief;
            public string DeathDayHeadline;
            // P5 — director after the death
            public float PostTension, PostWear, WearMax;
        }

        private static Arc RunArc()
        {
            var arc = new Arc { EulogyLines = new List<string>() };
            var host = BootSlice();
            var sim = host.Sim;
            var director = Find<DirectorSystem>(sim);
            var eulogy = Find<EulogySystem>(sim);
            var history = Find<HistorySystem>(sim);

            uint interlocutor = Id(sim, Interlocutor);
            uint victim = Id(sim, Victim);

            // ---- P1: a conversation turn reveals a real, fact-backed secret. -------------
            host.Minds.Minds.TryGet(interlocutor, out CitizenMind mind);
            uint factId = mind.Persona.Secrets[0].FactId;
            host.Facts.TryGet(factId, out ShipFact fact);
            arc.FactRevealedBefore = fact.RevealedToCrewPlayer;
            int memBefore = mind.Memory.Episodic.Count;
            float affBefore = mind.AffinityToPlayer;

            var conversation = new ConversationService(sim, host.Minds, host.Facts, new TemplateBackend());
            ConversationTurn turn = conversation.Converse(interlocutor, Utterance);
            arc.RevealDispatched = turn.DispatchedEffects.Count;

            sim.Tick(); // the dispatched effects apply at this tick boundary (inbox path)
            arc.FactRevealedAfter = fact.RevealedToCrewPlayer;
            arc.SecretFlagAfter = mind.Persona.Secrets[0].RevealedToPlayer;
            arc.RevealMemDelta = mind.Memory.Episodic.Count - memBefore;
            arc.AffinityDelta = mind.AffinityToPlayer - affBefore;

            // ---- P3 + P5(quiet): a quiet stretch — capture the first natural social event
            //      (and prove it landed in both minds) while WearPressure builds. -----------
            int scanned = 0;
            while (sim.TickCount < 300)
            {
                sim.Tick();
                if (director.WearPressure > arc.MaxQuietWear) arc.MaxQuietWear = director.WearPressure;
                if (!arc.SocialFound)
                    CaptureFirstSocial(sim, host, history, ref scanned, arc);
            }

            // ---- P4(setup): isolate the victim in cabin_1, then seal + breach it. ---------
            sim.EnqueueCommand(new MoveCitizenCommand(victim, CabinTarget));
            for (int t = 0; t < 1200; t++)
            {
                sim.Tick();
                if (director.WearPressure > arc.MaxQuietWear) arc.MaxQuietWear = director.WearPressure;
                if (sim.Citizens.TryGet(victim, out Citizen v) && InCabin1(v.Pos)) break;
            }
            // Close the cabin door (isolates the compartment) then void one interior tile:
            // a Void floor makes the whole sealed cabin region vacuum-connected (RoomState),
            // so NeedsSystem asphyxiates the lone occupant over the real ~90 s physics while
            // the rest of the ship stays pressurised behind the closed door.
            sim.TryGetDeviceAt(CabinDoor, out Device door);
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: false));
            sim.EnqueueCommand(new SetTileCommand(CabinBreach, floor: TileDefs.Void));

            // ---- P4: run the physics until the breach kills the isolated victim. ----------
            for (int t = 0; t < 3000 && !arc.DeathFired; t++)
            {
                sim.Tick();
                var deaths = sim.Events.Read<CitizenDiedEvent>();
                if (deaths.Length > 0)
                {
                    arc.DeathFired = true;
                    arc.DiedEventName = deaths[0].Name;
                }
            }
            sim.Tick(); // EulogySystem consumes the death event one tick later (double-buffered bus)

            // ---- P4: gather eulogy / chronicle / grief observations. ----------------------
            EulogyRecord last = eulogy.Last;
            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            arc.AliveAfterDeath = alive;
            if (last != null)
            {
                arc.EulogyDead = last.DeadName;
                arc.EulogyFriend = last.FriendName;
                arc.EulogyFriendId = last.FriendId;
                arc.EulogyText = last.Text;
                arc.EulogyLines = new List<string>(last.MemoryLines);

                host.Minds.Minds.TryGet(last.FriendId, out CitizenMind mourner);
                arc.AllLinesVerbatim = last.MemoryLines.Count > 0;
                foreach (string line in last.MemoryLines)
                    if (!MindHasMemoryText(mourner, line)) arc.AllLinesVerbatim = false;
                arc.MournerGrief = MindHasGrief(mourner, EulogySystem.GriefFriendImportance);

                // Some other living crew member registered the 0.5 broadcast grief.
                foreach (var c in sim.Citizens.Items)
                {
                    if (c.Dead || c.Id == last.FriendId) continue;
                    if (host.Minds.Minds.TryGet(c.Id, out CitizenMind m)
                        && MindHasGrief(m, EulogySystem.GriefBroadcastImportance))
                    { arc.BroadcastGrief = true; break; }
                }

                int deadDay = Chronicle.DayOf(last.Tick);
                foreach (ChronicleDay d in Chronicle.Render(history))
                    if (d.Day == deadDay) arc.DeathDayHeadline = d.Headline;
            }

            // ---- P5: director alive after the death. --------------------------------------
            arc.PostTension = director.Tension;
            arc.PostWear = director.WearPressure;
            arc.WearMax = sim.Defs.Director.MaxWearPressure;

            arc.FinalHash = sim.StateHash();
            return arc;
        }

        private static void CaptureFirstSocial(Simulation sim, GenSimHost host, HistorySystem history,
                                               ref int scanned, Arc arc)
        {
            var entries = history.Entries;
            for (; scanned < entries.Count; scanned++)
            {
                var e = entries[scanned];
                if (e.Kind != (byte)HistoryKind.Argument && e.Kind != (byte)HistoryKind.Bond) continue;
                arc.SocialFound = true;
                arc.SocialKind = (HistoryKind)e.Kind;
                arc.SocialA = e.SubjectA;
                arc.SocialB = e.SubjectB;
                arc.SocialAName = NameOf(sim, e.SubjectA);
                arc.SocialBName = NameOf(sim, e.SubjectB);
                arc.AMindNamesB = MindHasSocialNaming(host.Minds, e.SubjectA, arc.SocialBName);
                arc.BMindNamesA = MindHasSocialNaming(host.Minds, e.SubjectB, arc.SocialAName);
                return;
            }
        }

        // ============================================================ the P1..P7 asserts

        // -------- P1 --------------------------------------------------------------------
        [Test]
        public void P1_ConversationRevealsRealFact_AndWritesMemory()
        {
            Assert.That(_arc.RevealDispatched, Is.GreaterThan(0),
                "asking a slice citizen about their secret must dispatch whitelisted effects");
            Assert.That(_arc.FactRevealedBefore, Is.False, "the secret starts unrevealed");
            Assert.That(_arc.FactRevealedAfter, Is.True,
                "the RevealInfo effect flipped the real fact in the FactRegistry");
            Assert.That(_arc.SecretFlagAfter, Is.True, "the persona secret's revealed flag flipped too");
            Assert.That(_arc.RevealMemDelta, Is.GreaterThan(0),
                "conversation-derived memories (the reveal + the warmth) landed in the mind");
            Assert.That(_arc.AffinityDelta, Is.GreaterThan(0f),
                "the reveal's warmth reached the citizen's disposition");
        }

        // -------- P3 --------------------------------------------------------------------
        [Test]
        public void P3_SocialEventFiresNaturally_LandsInHistoryAndBothMinds()
        {
            Assert.That(_arc.SocialFound, Is.True,
                "the seeded, co-located crew produce an Argument or Bond in the first sim-minutes");
            Assert.That(_arc.SocialKind, Is.AnyOf(HistoryKind.Argument, HistoryKind.Bond));
            Assert.That(_arc.SocialAName, Is.Not.Empty);
            Assert.That(_arc.SocialBName, Is.Not.Empty);
            Assert.That(_arc.AMindNamesB, Is.True,
                $"{_arc.SocialAName}'s mind holds a social memory naming {_arc.SocialBName}");
            Assert.That(_arc.BMindNamesA, Is.True,
                $"{_arc.SocialBName}'s mind holds a social memory naming {_arc.SocialAName}");
        }

        // -------- P4 --------------------------------------------------------------------
        [Test]
        public void P4_BreachDeath_ProducesNamedEvent_Eulogy_Chronicle_Grief()
        {
            Assert.That(_arc.DeathFired, Is.True, "the sealed-cabin vacuum breach killed the isolated victim");
            Assert.That(_arc.DiedEventName, Is.EqualTo(Victim), "CitizenDiedEvent carries the dead's name");
            Assert.That(_arc.AliveAfterDeath, Is.EqualTo(7),
                "exactly one crew member died — the rest stayed pressurised behind the closed door");

            Assert.That(_arc.EulogyDead, Is.EqualTo(Victim), "the eulogy is for the dead");
            Assert.That(_arc.EulogyFriendId, Is.Not.EqualTo(0u), "a living mourner spoke for the dead");
            Assert.That(_arc.EulogyLines.Count, Is.GreaterThan(0), "the eulogy quotes real shared memories");
            Assert.That(_arc.AllLinesVerbatim, Is.True,
                "every quoted eulogy line is verbatim in the mourner's own mind (anti-hallucination)");

            Assert.That(_arc.DeathDayHeadline, Is.Not.Null.And.Contain(_arc.EulogyText),
                "the Chronicle's death day headlines the eulogy (Eulogy outranks the bare death line)");

            Assert.That(_arc.MournerGrief, Is.True, "the mourner carries the 0.9 grief memory");
            Assert.That(_arc.BroadcastGrief, Is.True, "the rest of the crew registered the 0.5 broadcast grief");
        }

        // -------- P5 --------------------------------------------------------------------
        [Test]
        public void P5_DirectorAlive_QuietBuild_ThenPostDeathTensionAndLever()
        {
            Assert.That(_arc.MaxQuietWear, Is.GreaterThan(1.0f),
                "on the quiet pre-incident stretch the Director's WearPressure built above 1.0");
            Assert.That(_arc.PostTension, Is.GreaterThan(0f), "after the death Tension is positive");
            Assert.That(_arc.PostWear, Is.GreaterThanOrEqualTo(1f).And.LessThanOrEqualTo(_arc.WearMax),
                "WearPressure stays clamped to [1, MaxWearPressure]");
        }

        // -------- P6 --------------------------------------------------------------------
        [Test]
        public void P6_WholeArc_IsTwinDeterministic()
        {
            Assert.That(_arc.FinalHash, Is.EqualTo(_twinHash),
                "the entire arc — conversation, social, breach death, eulogy — is bit-identical across twins");
        }

        // -------- P2 --------------------------------------------------------------------
        [Test]
        public void P2_MemsSurvivesSaveReload_ByteFaithful_AndContinuesLikeTheTwin()
        {
            const int T = 500, N = 400;

            // Uninterrupted twin: boot, converse (writes MEMS), run T+N ticks.
            var twin = BootSlice();
            new ConversationService(twin.Sim, twin.Minds, twin.Facts, new TemplateBackend())
                .Converse(Id(twin.Sim, Interlocutor), Utterance);
            for (int i = 0; i < T + N; i++) twin.Sim.Tick();

            // Save run: same boot + conversation, run to T, then a full SaveWriter round-trip.
            var host = BootSlice();
            new ConversationService(host.Sim, host.Minds, host.Facts, new TemplateBackend())
                .Converse(Id(host.Sim, Interlocutor), Utterance);
            for (int i = 0; i < T; i++) host.Sim.Tick();

            var blob = new MemoryStream();
            SaveWriter.Write(host.Sim, blob);
            blob.Position = 0;

            // Reconstruct a FRESH slice system stack (MOSS not yet compiled) exactly as
            // GenSimHost assembles it, so SaveReader restores each IStatefulSystem into it and
            // the single post-load ApplyScripts re-phases the MOSS every-timers correctly.
            var (systems, moss, registry) = RebuildSliceSystems(out MindState minds, out FactRegistry facts);
            Simulation loaded = SaveReader.Read(blob, systems, SimDefs.Default);
            MossBindings.RegisterAdapters(loaded, registry);
            MossBindings.ApplyScripts(loaded, moss);

            // The save round-trips bit-exact at T: MEMS and every other saved+hashed field
            // restored identically (proven by the pre-run-on full StateHash match).
            Assert.That(loaded.StateHash(), Is.EqualTo(host.Sim.StateHash()),
                "a full SaveWriter/SaveReader round-trip is bit-exact at the save tick");

            for (int i = 0; i < N; i++) loaded.Tick();

            // Byte-faithful personas/memories: GetTop retrieval matches the twin entry-for-entry.
            uint dmitri = Id(twin.Sim, Interlocutor);
            var a = new List<MemoryEntry>();
            var b = new List<MemoryEntry>();
            minds.GetTopMemories(dmitri, loaded.TickCount, null, a, 64);
            twin.Minds.GetTopMemories(dmitri, twin.Sim.TickCount, null, b, 64);
            Assert.That(a.Count, Is.EqualTo(b.Count).And.GreaterThan(0), "GetTop retrieval count matches the twin");
            for (int i = 0; i < a.Count; i++)
            {
                Assert.That(a[i].Text, Is.EqualTo(b[i].Text));
                Assert.That(a[i].Tick, Is.EqualTo(b[i].Tick));
                Assert.That(a[i].Importance, Is.EqualTo(b[i].Importance));
            }

            // Run-on == twin at the canonical-system level: every IStatefulSystem fold (MEMS,
            // SOCL, DRCT, MOSS, HIST, GOAL, …) that SaveWriter persists continues bit-identically
            // N ticks past the reload. (The one field with a residual ULP delta on reload is raw
            // room thermal — see the gap note below — never anything the mind store touches.)
            foreach (var pair in StatefulByName(loaded))
            {
                ulong twinFold = FoldOf(twin.Sim, pair.Key);
                Assert.That(pair.Value.StateChecksum(), Is.EqualTo(twinFold),
                    $"the '{pair.Key}' fold continues identically past a reload (MEMS included)");
            }
        }

        // -------- P7 --------------------------------------------------------------------
        [Test]
        public async Task P7_OfflineTemplateTurns_NeverBill()
        {
            // A representative shipped-style price table: a real haiku-class model, priced
            // (Anthropic Haiku 4.5 list rates, $1.00 / $5.00 per 1M in/out). The tripwire: even
            // against a genuinely-priced model, an offline template turn bills $0 — because the
            // turn reports all-zero token usage.
            var prices = new Dictionary<string, ModelPrice>
            {
                ["claude-haiku-4-5"] = new ModelPrice(inputPerMillion: 1.00m, outputPerMillion: 5.00m),
            };
            var meter = new CostMeter(prices, budgetPerHourUsd: 0.50m);
            var now = new DateTime(2026, 7, 21, 12, 0, 0, DateTimeKind.Utc);

            // Read the usage a REAL template turn reports (drive the streaming path over the same
            // conversation the arc runs), then price it as if it had been billed to the haiku model.
            var host = BootSlice();
            var conversation = new ConversationService(host.Sim, host.Minds, host.Facts, new TemplateBackend());
            TurnPlan plan = conversation.PrepareTurn(Id(host.Sim, Interlocutor), Utterance);

            TurnUsage reported = null;
            await foreach (ChatDelta delta in new TemplateBackend()
                .SendAsync(plan.Request, Utterance, CancellationToken.None))
                if (delta is TurnComplete tc) reported = tc.Usage;

            Assert.That(reported, Is.Not.Null, "the template turn reports a usage on completion");
            Assert.That(reported.InputTokens + reported.OutputTokens
                        + reported.CacheReadTokens + reported.CacheWriteTokens, Is.EqualTo(0),
                "offline template turns carry zero tokens");

            // Re-stamp the (zero) template token counts onto the haiku model id and record several
            // such turns; even at haiku prices the projected hourly burn is exactly $0.
            var asHaiku = new TurnUsage(reported.InputTokens, reported.OutputTokens,
                reported.CacheReadTokens, reported.CacheWriteTokens, "claude-haiku-4-5");
            Assert.That(meter.CostOf(asHaiku), Is.EqualTo(0m), "a zero-token turn costs $0 even when priced");
            for (int i = 0; i < 5; i++) meter.Record(asHaiku, LlmPriority.Dialogue, now.AddMinutes(i));

            Assert.That(meter.CostPerHourUsd(now.AddMinutes(5)), Is.EqualTo(0m),
                "offline mode is literally free — the projected $/hr with template usage is 0");
            Assert.That(meter.Recommend(now.AddMinutes(5)), Is.EqualTo(ShedLevel.None),
                "with no spend there is nothing to shed");
            Assert.That(CostMeter.FormatUsd(meter.CostPerHourUsd(now.AddMinutes(5))), Is.EqualTo("$0.0000"),
                "InvariantCulture money formatting");
        }

        // ============================================================ helpers

        private static (ISimSystem[] systems, ScriptRuntime moss, DeviceRegistry registry)
            RebuildSliceSystems(out MindState minds, out FactRegistry facts)
        {
            // Mirror GenSimHost.MakeSystems with SimDefs.Default (no designer rules): EffectPump
            // first, the authoritative SystemStack in the middle, MemorySystem then EulogySystem last.
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            minds = new MindState();
            facts = new FactRegistry();
            var effects = new PendingEffectBuffer();
            var designer = RulesLoader.CreateSystem(SimDefs.Default, registry);

            var stack = SystemStack.CreateDefault(moss, designer);
            SocialSystem social = null;
            HistorySystem history = null;
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] is SocialSystem s) social = s;
                if (stack[i] is HistorySystem h) history = h;
            }

            var systems = new ISimSystem[stack.Length + 3];
            systems[0] = new EffectPump(effects, minds, facts);
            for (int i = 0; i < stack.Length; i++) systems[i + 1] = stack[i];
            systems[systems.Length - 2] = new MemorySystem(minds, facts);
            systems[systems.Length - 1] = new EulogySystem(minds, social, history);
            return (systems, moss, registry);
        }

        private static Dictionary<string, IStatefulSystem> StatefulByName(Simulation sim)
        {
            var map = new Dictionary<string, IStatefulSystem>();
            foreach (var s in sim.Systems)
                if (s is IStatefulSystem st) map[s.Name] = st;
            return map;
        }

        private static ulong FoldOf(Simulation sim, string name)
        {
            foreach (var s in sim.Systems)
                if (s is IStatefulSystem st && s.Name == name) return st.StateChecksum();
            Assert.Fail($"no stateful system named '{name}'");
            return 0;
        }

        private static bool InCabin1(Int3 p) =>
            p.Z == 1 && p.X >= 42 && p.X <= 45 && p.Y >= 1 && p.Y <= 4;

        private static bool MindHasMemoryText(CitizenMind mind, string text)
        {
            if (mind == null) return false;
            foreach (var m in mind.Memory.Episodic) if (m.Text == text) return true;
            return false;
        }

        private static bool MindHasGrief(CitizenMind mind, float importance)
        {
            if (mind == null) return false;
            foreach (var m in mind.Memory.Episodic)
                if (m.Tag == "grief" && m.Importance == importance) return true;
            return false;
        }

        private static bool MindHasSocialNaming(MindState minds, uint citizenId, string otherName)
        {
            if (string.IsNullOrEmpty(otherName)) return false;
            if (!minds.Minds.TryGet(citizenId, out CitizenMind mind)) return false;
            foreach (var m in mind.Memory.Episodic)
                if (m.Tag == "social" && m.Text != null && m.Text.Contains(otherName)) return true;
            return false;
        }

        private static T Find<T>(Simulation sim) where T : class
        {
            foreach (var s in sim.Systems) if (s is T t) return t;
            Assert.Fail($"no system of type {typeof(T).Name}");
            return null;
        }

        private static uint Id(Simulation sim, string name)
        {
            foreach (var c in sim.Citizens.Items) if (c.Name == name) return c.Id;
            Assert.Fail($"citizen '{name}' not found");
            return 0;
        }

        private static string NameOf(Simulation sim, uint id)
            => sim.Citizens.TryGet(id, out var c) ? c.Name : "";
    }
}
