using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// One episodic memory (LLM_CITIZENS.md §3). v0 simplification: a single Tag
    /// string instead of the doc's Tags array — the rule table assigns exactly one
    /// tag per entry today ("alarm", "death", "social", "promise", "conversation",
    /// "player"); widen to an array when the topic classifier lands (v1).
    /// </summary>
    public struct MemoryEntry
    {
        public long Tick;
        public string Text;
        public float Importance; // 0..1, assigned by rule table at creation
        public string Tag;
    }

    /// <summary>
    /// Game-sized generative-agents-lite memory: capped episodic list, rule-based
    /// writes, importance x recency retrieval (no embeddings — a linear scan over
    /// ≤120 entries is free). v0: no compaction; on overflow the lowest-importance
    /// entry is dropped (ties: the older one goes, keeping recency).
    /// TODO(persistence): serialize via a dedicated save chapter (doc §3 "MEMS").
    /// </summary>
    public sealed class CitizenMemory
    {
        public const int Cap = 120;
        public const long HalfLifeTicks = 2 * SimClockUtil.TicksPerDay; // recency half-life: 2 sim-days
        private const int MaxK = 64;

        public readonly List<MemoryEntry> Episodic = new List<MemoryEntry>(Cap);

        public void Add(in MemoryEntry entry)
        {
            if (Episodic.Count >= Cap)
            {
                int lowest = 0;
                for (int i = 1; i < Episodic.Count; i++)
                    if (Episodic[i].Importance < Episodic[lowest].Importance)
                        lowest = i;
                if (Episodic[lowest].Importance > entry.Importance) return; // new entry IS the least important
                Episodic.RemoveAt(lowest);
            }
            Episodic.Add(entry);
        }

        /// <summary>score = importance * 0.5^(age / halfLife).</summary>
        public double Score(in MemoryEntry entry, long nowTick)
        {
            long age = nowTick - entry.Tick;
            if (age < 0) age = 0;
            return entry.Importance * Math.Pow(0.5, age / (double)HalfLifeTicks);
        }

        /// <summary>
        /// Top-k entries by score into the caller's list (cleared first), best
        /// first; ties resolve to insertion (chronological) order. tagFilter
        /// null/"" = all tags. Allocates nothing beyond the caller's list.
        /// </summary>
        public void GetTop(long nowTick, string tagFilter, List<MemoryEntry> into, int k = 8)
        {
            into.Clear();
            if (k <= 0) return;
            if (k > MaxK) k = MaxK;
            bool filtered = !string.IsNullOrEmpty(tagFilter);

            Span<double> scores = stackalloc double[k];
            int count = 0;
            for (int i = 0; i < Episodic.Count; i++)
            {
                var entry = Episodic[i];
                if (filtered && entry.Tag != tagFilter) continue;
                double s = Score(in entry, nowTick);

                if (count == k && s <= scores[count - 1]) continue; // strict '>' keeps earlier entries on ties
                int pos;
                if (count < k)
                {
                    into.Add(entry); // placeholder slot; shifted into place below
                    pos = count++;
                }
                else
                {
                    pos = count - 1; // displace the current worst
                }
                while (pos > 0 && scores[pos - 1] < s)
                {
                    scores[pos] = scores[pos - 1];
                    into[pos] = into[pos - 1];
                    pos--;
                }
                scores[pos] = s;
                into[pos] = entry;
            }
        }
    }

    /// <summary>
    /// LLM-citizen state for one citizen. Lives OUTSIDE <see cref="Citizen"/> on
    /// purpose — the sim's entity data model is frozen for v0, so player-facing
    /// disposition, acted emotion, persona and memory sit in this parallel store.
    /// </summary>
    public sealed class CitizenMind
    {
        public uint CitizenId;
        public float AffinityToPlayer; // -100..100
        public float TrustToPlayer;    // -100..100
        public string Emotion = "";    // acted emotional state; stale once past EmotionUntilTick
        public long EmotionUntilTick;

        /// <summary>v0: flag only — no follow movement behavior yet (host/CitizenSystem, v1).</summary>
        public bool FollowingPlayer;

        public PersonaSheet Persona;
        public readonly CitizenMemory Memory = new CitizenMemory();

        /// <summary>Facts this citizen can reveal (persona secrets + witnessed events later).</summary>
        public readonly List<uint> KnownFactIds = new List<uint>(4);

        // Per-day disposition budget accumulators (EffectValidator).
        public long AffinityBudgetDay;
        public float AffinitySpentToday;

        /// <summary>Emotion expiry is evaluated lazily — no per-tick sweep needed.</summary>
        public string ActiveEmotion(long tick) => tick < EmotionUntilTick ? Emotion : "";
    }

    /// <summary>Mind store mirroring the EntityStore pattern: list for deterministic iteration, dictionary for lookup.</summary>
    public sealed class CitizenMinds
    {
        public readonly List<CitizenMind> Items = new List<CitizenMind>();
        private readonly Dictionary<uint, CitizenMind> _byId = new Dictionary<uint, CitizenMind>();

        public int Count => Items.Count;

        public bool TryGet(uint citizenId, out CitizenMind mind) => _byId.TryGetValue(citizenId, out mind);

        public CitizenMind GetOrCreate(uint citizenId)
        {
            if (_byId.TryGetValue(citizenId, out var mind)) return mind;
            mind = new CitizenMind { CitizenId = citizenId };
            Items.Add(mind);
            _byId.Add(citizenId, mind);
            return mind;
        }

        /// <summary>Drop every mind (used by MemorySystem.RestoreState so a restore is idempotent).</summary>
        public void Clear()
        {
            Items.Clear();
            _byId.Clear();
        }
    }

    /// <summary>
    /// Root object for all LLM-citizen sim-side state, constructed by the host
    /// (Bootstrap / tests) and passed to the pump, validator, capability computer
    /// and generator — Simulation.cs is not modified.
    /// TODO(persistence): personas + memories + dispositions serialize via a
    /// dedicated save chapter (not wired in v0; SaveWriter/Reader untouched).
    /// NOTE: minds are not covered by Simulation.StateHash — replay determinism
    /// requires replaying the effect stream alongside the command log.
    /// </summary>
    public sealed class MindState
    {
        /// <summary>Template conversation-end summaries (LLM upgrade comes later).</summary>
        public const float ConversationSummaryImportance = 0.5f;

        public readonly CitizenMinds Minds = new CitizenMinds();

        /// <summary>Doc-shaped retrieval entry point (nowTick added — decay needs the clock).</summary>
        public void GetTopMemories(uint citizenId, long nowTick, string tagFilter, List<MemoryEntry> into, int k = 8)
        {
            into.Clear();
            if (Minds.TryGet(citizenId, out var mind))
                mind.Memory.GetTop(nowTick, tagFilter, into, k);
        }

        /// <summary>
        /// Host-callable conversation-end summary: writes one episodic "conversation"
        /// memory for the citizen (template one-liner today; an LLM-authored recap
        /// replaces the text at the same call site later). No-op if the citizen has no
        /// mind (no LLM presence). Not covered by StateHash — mind state is unhashed.
        /// </summary>
        public void WriteConversationSummary(uint citizenId, long tick, string text)
        {
            if (!Minds.TryGet(citizenId, out var mind)) return;
            mind.Memory.Add(new MemoryEntry
            {
                Tick = tick,
                Text = text ?? "",
                Importance = ConversationSummaryImportance,
                Tag = "conversation",
            });
        }
    }

    /// <summary>
    /// Rule table converting sim events into memories (LLM_CITIZENS.md §3): the
    /// event log is the source, importance is rule-assigned. Ship-wide rules
    /// broadcast; pairwise/personal rules write only to the citizens involved:
    /// - AlarmRaisedEvent → 0.5 for all living crew (alarms are ship-wide klaxons and
    ///   carry no position, so "same room/nearby" degrades to everyone — deviation,
    ///   documented); CitizenDiedEvent → 0.95 for everyone alive.
    /// - ArgumentEvent → 0.55 "social" for both participants (each remembers the other).
    /// - BondEvent → 0.5 "social" for both participants.
    /// - RelationshipChangedEvent → 0.6 "social" for the opinion holder (the From side).
    /// - CitizenEffectAppliedEvent (Accepted AgreeTask) → 0.7 "promise" for the citizen
    ///   who agreed — promise FORMATION. (Promise BREAKING is deferred: see the class
    ///   note — it needs a broken-promise signal + a def-tunable window this lane cannot
    ///   add without a spine/def change; filed as contract requests.)
    /// Machine-failure alarms already arrive as AlarmRaisedEvent (MachineWearSystem).
    /// Registered by the HOST after the systems that publish these events.
    /// IntervalTicks is 1 (doc says 1 Hz) because the event bus is double-buffered
    /// per tick — a 10-tick reader would miss events from unaligned ticks.
    /// Steady state (no events) does not allocate. Importances are hardcoded consts,
    /// NOT def fields: the def registry (SimDefs.cs) is an integrator-gated spine file,
    /// so tuning them is a contract request, not an in-lane def-field commit.
    ///
    /// PERSISTENCE (N3): the system is an <see cref="IStatefulSystem"/>, so the whole
    /// mind store (personas incl. secrets, dispositions, emotions, known-fact ids and the
    /// episodic memory list) plus the host's <see cref="FactRegistry"/> ride the existing
    /// SYSS chapter — no SaveWriter/Reader edit. The 'MEMS' <see cref="StateChecksum"/>
    /// folds STRUCTURE ONLY (counts, ticks, importance/affinity/trust bits, fact ids +
    /// flags); free text (names, prose, tags, emotion, memory bodies) is hash-EXEMPT per
    /// the HIST/SOCL precedent, so rewording a memory never perturbs determinism but
    /// adding one — or moving a tick/importance — does. When a MemorySystem is registered
    /// in the sim's system array (the LLM hosts append it), its checksum joins the
    /// determinism canary; the pure-sim scenario stack does not include it.
    /// </summary>
    public sealed class MemorySystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Memory";
        public int IntervalTicks => 1;

        // v1: minds (persona+secrets, dispositions, known facts, episodic) + fact registry.
        public ushort StateVersion => 1;

        public const float AlarmImportance = 0.5f;
        public const float DeathImportance = 0.95f;
        public const float ArgumentImportance = 0.55f;
        public const float BondImportance = 0.5f;
        public const float RelationshipImportance = 0.6f;
        public const float PromiseImportance = 0.7f;

        private readonly MindState _minds;

        /// <summary>
        /// The host's fact store, persisted alongside minds so secrets/known-fact ids keep
        /// their backing <see cref="ShipFact"/> across save/load. Optional: a MemorySystem
        /// wired without a registry (some rule-only tests) simply persists zero facts.
        /// </summary>
        private readonly FactRegistry _facts;

        public MemorySystem(MindState minds, FactRegistry facts = null)
        {
            _minds = minds ?? throw new ArgumentNullException(nameof(minds));
            _facts = facts;
        }

        public void Tick(Simulation sim)
        {
            var alarms = sim.Events.Read<AlarmRaisedEvent>();
            for (int i = 0; i < alarms.Length; i++)
            {
                string text = "Alarm: " + alarms[i].SourceId + " — " + alarms[i].Message;
                Broadcast(sim, text, AlarmImportance, "alarm");
            }

            var deaths = sim.Events.Read<CitizenDiedEvent>();
            for (int i = 0; i < deaths.Length; i++)
                Broadcast(sim, "We lost someone.", DeathImportance, "death");

            var arguments = sim.Events.Read<ArgumentEvent>();
            for (int i = 0; i < arguments.Length; i++)
            {
                var e = arguments[i];
                WriteTo(sim, e.A, "Argued with " + NameOf(sim, e.B) + ".", ArgumentImportance, "social");
                WriteTo(sim, e.B, "Argued with " + NameOf(sim, e.A) + ".", ArgumentImportance, "social");
            }

            var bonds = sim.Events.Read<BondEvent>();
            for (int i = 0; i < bonds.Length; i++)
            {
                var e = bonds[i];
                WriteTo(sim, e.A, "Grew closer to " + NameOf(sim, e.B) + ".", BondImportance, "social");
                WriteTo(sim, e.B, "Grew closer to " + NameOf(sim, e.A) + ".", BondImportance, "social");
            }

            var relationships = sim.Events.Read<RelationshipChangedEvent>();
            for (int i = 0; i < relationships.Length; i++)
            {
                var e = relationships[i];
                WriteTo(sim, e.From, "My feelings about " + NameOf(sim, e.To) + " changed.",
                    RelationshipImportance, "social");
            }

            // Promise formation: the citizen accepted a task the player asked of them.
            var effects = sim.Events.Read<CitizenEffectAppliedEvent>();
            for (int i = 0; i < effects.Length; i++)
            {
                var e = effects[i];
                if (e.Accepted && e.Kind == EffectKind.AgreeTask)
                    WriteTo(sim, e.CitizenId, "I agreed to dig out some debris for the captain.",
                        PromiseImportance, "promise");
            }
        }

        /// <summary>Ship-wide write: every living crew member with a mind remembers it.</summary>
        private void Broadcast(Simulation sim, string text, float importance, string tag)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead) continue;
                if (!_minds.Minds.TryGet(citizen.Id, out var mind)) continue;
                mind.Memory.Add(new MemoryEntry
                {
                    Tick = sim.TickCount,
                    Text = text,
                    Importance = importance,
                    Tag = tag,
                });
            }
        }

        /// <summary>Targeted write: one specific citizen, if alive and LLM-present.</summary>
        private void WriteTo(Simulation sim, uint citizenId, string text, float importance, string tag)
        {
            if (!sim.Citizens.TryGet(citizenId, out var citizen) || citizen.Dead) return;
            if (!_minds.Minds.TryGet(citizenId, out var mind)) return;
            mind.Memory.Add(new MemoryEntry
            {
                Tick = sim.TickCount,
                Text = text,
                Importance = importance,
                Tag = tag,
            });
        }

        private static string NameOf(Simulation sim, uint id)
            => id != 0 && sim.Citizens.TryGet(id, out var c) && !string.IsNullOrEmpty(c.Name) ? c.Name : "someone";

        // ------------------------------------------------------------ IStatefulSystem

        /// <summary>FourCC seed for the structural checksum ('MEMS').</summary>
        private const ulong MemsSeed = 0x4D454D53UL;

        /// <summary>
        /// Full-fidelity capture: every mind (list order, deterministic) then the fact
        /// registry. Field order mirrors <see cref="RestoreState"/> 1:1. Strings ARE written
        /// (persistence keeps the prose); they are just excluded from <see cref="StateChecksum"/>.
        /// </summary>
        public void CaptureState(System.IO.BinaryWriter writer)
        {
            var minds = _minds.Minds.Items;
            writer.Write(minds.Count);
            for (int i = 0; i < minds.Count; i++)
            {
                var m = minds[i];
                writer.Write(m.CitizenId);
                writer.Write(m.AffinityToPlayer);
                writer.Write(m.TrustToPlayer);
                writer.Write(m.Emotion ?? "");
                writer.Write(m.EmotionUntilTick);
                writer.Write(m.FollowingPlayer);
                writer.Write(m.AffinityBudgetDay);
                writer.Write(m.AffinitySpentToday);

                WritePersona(writer, m.Persona);

                writer.Write(m.KnownFactIds.Count);
                for (int k = 0; k < m.KnownFactIds.Count; k++) writer.Write(m.KnownFactIds[k]);

                var ep = m.Memory.Episodic;
                writer.Write(ep.Count);
                for (int e = 0; e < ep.Count; e++)
                {
                    var entry = ep[e];
                    writer.Write(entry.Tick);
                    writer.Write(entry.Text ?? "");
                    writer.Write(entry.Importance);
                    writer.Write(entry.Tag ?? "");
                }
            }

            var facts = _facts != null ? _facts.Facts : null;
            int factCount = facts != null ? facts.Count : 0;
            writer.Write(factCount);
            for (int i = 0; i < factCount; i++)
            {
                var f = facts[i];
                writer.Write(f.Id);
                writer.Write(f.Text ?? "");
                WriteNullableInt3(writer, f.MarkerPos);
                writer.Write(f.RevealedToCrewPlayer);
            }
        }

        /// <summary>
        /// Rebuild the minds and fact registry from the blob. Expects the fresh host-owned
        /// stores a reload provides (the fact registry is replayed through
        /// <see cref="FactRegistry.Add"/>, which reproduces the saved ids only from an empty
        /// registry — the standard "fresh instances on load" contract). A future-version
        /// blob is skipped gracefully (minds left empty, SaveReader resyncs on the SYSS
        /// length prefix), per the chaptered-save law.
        /// </summary>
        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version < 1 || version > StateVersion) return; // unknown/future blob — skip cleanly

            _minds.Minds.Clear();
            int mindCount = reader.ReadInt32();
            for (int i = 0; i < mindCount; i++)
            {
                uint cid = reader.ReadUInt32();
                var m = _minds.Minds.GetOrCreate(cid);
                m.AffinityToPlayer = reader.ReadSingle();
                m.TrustToPlayer = reader.ReadSingle();
                m.Emotion = reader.ReadString();
                m.EmotionUntilTick = reader.ReadInt64();
                m.FollowingPlayer = reader.ReadBoolean();
                m.AffinityBudgetDay = reader.ReadInt64();
                m.AffinitySpentToday = reader.ReadSingle();

                m.Persona = ReadPersona(reader);

                int kf = reader.ReadInt32();
                m.KnownFactIds.Clear();
                for (int k = 0; k < kf; k++) m.KnownFactIds.Add(reader.ReadUInt32());

                int ep = reader.ReadInt32();
                m.Memory.Episodic.Clear();
                for (int e = 0; e < ep; e++)
                {
                    long tick = reader.ReadInt64();
                    string text = reader.ReadString();
                    float importance = reader.ReadSingle();
                    string tag = reader.ReadString();
                    m.Memory.Episodic.Add(new MemoryEntry { Tick = tick, Text = text, Importance = importance, Tag = tag });
                }
            }

            int factCount = reader.ReadInt32();
            for (int i = 0; i < factCount; i++)
            {
                uint id = reader.ReadUInt32();
                string text = reader.ReadString();
                Int3? marker = ReadNullableInt3(reader);
                bool revealed = reader.ReadBoolean();
                if (_facts != null)
                {
                    var f = _facts.Add(text, marker); // ids replay sequentially from a fresh registry
                    f.RevealedToCrewPlayer = revealed;
                }
            }
        }

        /// <summary>
        /// STRUCTURAL checksum folded into Simulation.StateHash: counts, ticks, and the
        /// bit patterns of numeric fields (affinity/trust/importance/reveal-difficulty),
        /// plus fact ids + reveal/marker flags. Never any string — rewording a memory or a
        /// persona must NOT move the hash, but adding an entry, or shifting a tick/importance,
        /// must. RelationshipNotes keys are folded in ascending order (dictionary iteration
        /// is not deterministic).
        /// </summary>
        public ulong StateChecksum()
        {
            ulong h = MemsSeed;
            var minds = _minds.Minds.Items;
            h = XxHash64.Combine(h, (ulong)minds.Count);
            for (int i = 0; i < minds.Count; i++)
            {
                var m = minds[i];
                h = XxHash64.Combine(h, (ulong)m.CitizenId);
                h = XxHash64.Combine(h, m.AffinityToPlayer);
                h = XxHash64.Combine(h, m.TrustToPlayer);
                h = XxHash64.Combine(h, (ulong)m.EmotionUntilTick);
                h = XxHash64.Combine(h, m.FollowingPlayer ? 1UL : 0UL);
                h = XxHash64.Combine(h, (ulong)m.AffinityBudgetDay);
                h = XxHash64.Combine(h, m.AffinitySpentToday);

                var p = m.Persona;
                h = XxHash64.Combine(h, p != null ? 1UL : 0UL);
                if (p != null)
                {
                    h = XxHash64.Combine(h, (ulong)p.CitizenId);
                    h = XxHash64.Combine(h, (ulong)p.Traits.Length);
                    h = XxHash64.Combine(h, (ulong)p.Values.Length);
                    h = XxHash64.Combine(h, (ulong)p.Fears.Length);
                    h = XxHash64.Combine(h, (ulong)p.Secrets.Length);
                    for (int s = 0; s < p.Secrets.Length; s++)
                    {
                        var sec = p.Secrets[s];
                        h = XxHash64.Combine(h, (ulong)sec.FactId);
                        h = XxHash64.Combine(h, sec.RevealDifficulty);
                        h = XxHash64.Combine(h, sec.RevealedToPlayer ? 1UL : 0UL);
                    }
                    h = XxHash64.Combine(h, (ulong)p.RelationshipNotes.Count);
                    foreach (var key in SortedKeys(p.RelationshipNotes))
                        h = XxHash64.Combine(h, (ulong)key);
                }

                h = XxHash64.Combine(h, (ulong)m.KnownFactIds.Count);
                for (int k = 0; k < m.KnownFactIds.Count; k++)
                    h = XxHash64.Combine(h, (ulong)m.KnownFactIds[k]);

                var ep = m.Memory.Episodic;
                h = XxHash64.Combine(h, (ulong)ep.Count);
                for (int e = 0; e < ep.Count; e++)
                {
                    h = XxHash64.Combine(h, (ulong)ep[e].Tick);
                    h = XxHash64.Combine(h, ep[e].Importance);
                }
            }

            var facts = _facts != null ? _facts.Facts : null;
            int factCount = facts != null ? facts.Count : 0;
            h = XxHash64.Combine(h, (ulong)factCount);
            for (int i = 0; i < factCount; i++)
            {
                var f = facts[i];
                h = XxHash64.Combine(h, (ulong)f.Id);
                if (f.MarkerPos.HasValue)
                {
                    var pos = f.MarkerPos.Value;
                    h = XxHash64.Combine(h, 1UL);
                    h = XxHash64.Combine(h, (ulong)(uint)pos.X);
                    h = XxHash64.Combine(h, (ulong)(uint)pos.Y);
                    h = XxHash64.Combine(h, (ulong)(uint)pos.Z);
                }
                else
                {
                    h = XxHash64.Combine(h, 0UL);
                }
                h = XxHash64.Combine(h, f.RevealedToCrewPlayer ? 1UL : 0UL);
            }
            return h;
        }

        // --- persona blob (strings persisted, never checksummed) ----------------

        private static void WritePersona(System.IO.BinaryWriter w, PersonaSheet p)
        {
            w.Write(p != null);
            if (p == null) return;
            w.Write(p.CitizenId);
            w.Write(p.Name ?? "");
            w.Write(p.RolePreRaid ?? "");
            w.Write(p.RoleNow ?? "");
            WriteStringArray(w, p.Traits);
            WriteStringArray(w, p.Values);
            WriteStringArray(w, p.Fears);
            w.Write(p.Secrets.Length);
            for (int i = 0; i < p.Secrets.Length; i++)
            {
                var s = p.Secrets[i];
                w.Write(s.FactId);
                w.Write(s.Text ?? "");
                w.Write(s.RevealDifficulty);
                w.Write(s.RevealedToPlayer);
            }
            w.Write(p.RaidBackstory ?? "");
            w.Write(p.SpeechStyle ?? "");
            // RelationshipNotes: sorted by key for a deterministic byte layout.
            w.Write(p.RelationshipNotes.Count);
            foreach (var key in SortedKeys(p.RelationshipNotes))
            {
                w.Write(key);
                w.Write(p.RelationshipNotes[key] ?? "");
            }
        }

        private static PersonaSheet ReadPersona(System.IO.BinaryReader r)
        {
            if (!r.ReadBoolean()) return null;
            var p = new PersonaSheet
            {
                CitizenId = r.ReadUInt32(),
                Name = r.ReadString(),
                RolePreRaid = r.ReadString(),
                RoleNow = r.ReadString(),
                Traits = ReadStringArray(r),
                Values = ReadStringArray(r),
                Fears = ReadStringArray(r),
            };
            int secretCount = r.ReadInt32();
            var secrets = new SecretRecord[secretCount];
            for (int i = 0; i < secretCount; i++)
            {
                secrets[i] = new SecretRecord
                {
                    FactId = r.ReadUInt32(),
                    Text = r.ReadString(),
                    RevealDifficulty = r.ReadSingle(),
                    RevealedToPlayer = r.ReadBoolean(),
                };
            }
            p.Secrets = secrets;
            p.RaidBackstory = r.ReadString();
            p.SpeechStyle = r.ReadString();
            int noteCount = r.ReadInt32();
            for (int i = 0; i < noteCount; i++)
            {
                uint key = r.ReadUInt32();
                string note = r.ReadString();
                p.RelationshipNotes[key] = note;
            }
            return p;
        }

        private static void WriteStringArray(System.IO.BinaryWriter w, string[] a)
        {
            a = a ?? System.Array.Empty<string>();
            w.Write(a.Length);
            for (int i = 0; i < a.Length; i++) w.Write(a[i] ?? "");
        }

        private static string[] ReadStringArray(System.IO.BinaryReader r)
        {
            int n = r.ReadInt32();
            if (n == 0) return System.Array.Empty<string>();
            var a = new string[n];
            for (int i = 0; i < n; i++) a[i] = r.ReadString();
            return a;
        }

        private static void WriteNullableInt3(System.IO.BinaryWriter w, Int3? pos)
        {
            w.Write(pos.HasValue);
            if (!pos.HasValue) return;
            w.Write(pos.Value.X);
            w.Write(pos.Value.Y);
            w.Write(pos.Value.Z);
        }

        private static Int3? ReadNullableInt3(System.IO.BinaryReader r)
        {
            if (!r.ReadBoolean()) return null;
            int x = r.ReadInt32();
            int y = r.ReadInt32();
            int z = r.ReadInt32();
            return new Int3(x, y, z);
        }

        /// <summary>Ascending-sorted keys of a note map — dictionary iteration order is not deterministic.</summary>
        private static List<uint> SortedKeys(Dictionary<uint, string> notes)
        {
            var keys = new List<uint>(notes.Keys);
            keys.Sort();
            return keys;
        }
    }
}
