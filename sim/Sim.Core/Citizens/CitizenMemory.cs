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
    /// Mind state is deliberately UNHASHED — nothing here touches Simulation.StateHash.
    /// </summary>
    public sealed class MemorySystem : ISimSystem
    {
        public string Name => "Memory";
        public int IntervalTicks => 1;

        public const float AlarmImportance = 0.5f;
        public const float DeathImportance = 0.95f;
        public const float ArgumentImportance = 0.55f;
        public const float BondImportance = 0.5f;
        public const float RelationshipImportance = 0.6f;
        public const float PromiseImportance = 0.7f;

        private readonly MindState _minds;

        public MemorySystem(MindState minds)
        {
            _minds = minds ?? throw new ArgumentNullException(nameof(minds));
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
    }
}
