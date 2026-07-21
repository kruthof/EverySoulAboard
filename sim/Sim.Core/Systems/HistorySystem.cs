using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Category of a history entry. APPEND-ONLY (persisted as a byte and folded into
    /// the state checksum): never reorder, never repurpose a value. 0 = the pre-enrichment
    /// legacy value, so v1 saves (which carried no kind) restore as <see cref="Generic"/>.
    /// </summary>
    public enum HistoryKind : byte
    {
        Generic = 0,               // legacy / uncategorised
        Alarm = 1,
        Death = 2,
        Goal = 3,
        Brownout = 4,
        RelationshipChanged = 5,
        Argument = 6,
        Bond = 7,
        ConstructionCompleted = 8,
        Eulogy = 9,                // a closest-friend eulogy on a death (EulogySystem, N5)
    }

    /// <summary>One line of ship history, day-stamped ("Day 142.12 — Blight detected in Bay 3").</summary>
    public readonly struct HistoryEntry
    {
        public readonly long Tick;
        public readonly string Text;

        /// <summary><see cref="HistoryKind"/> as a byte — structural, checksum-folded.</summary>
        public readonly byte Kind;

        /// <summary>Primary subject id (citizen or device); 0 = none.</summary>
        public readonly uint SubjectA;

        /// <summary>Secondary subject id (the other party in a pairwise event); 0 = none.</summary>
        public readonly uint SubjectB;

        public HistoryEntry(long tick, string text, byte kind = 0, uint subjectA = 0, uint subjectB = 0)
        {
            Tick = tick;
            Text = text;
            Kind = kind;
            SubjectA = subjectA;
            SubjectB = subjectB;
        }

        public double Day => Tick / (double)SimClockUtil.TicksPerDay;
    }

    public static class SimClockUtil
    {
        public const long TicksPerDay = Simulation.TicksPerSecond * 60L * 60L * 24L;
    }

    /// <summary>
    /// Historical layer (SIMULATION_ARCHITECTURE §6): notable events become day-stamped
    /// history — the event log's data source and the Chronicle renderer's input. Each
    /// entry carries a structural <see cref="HistoryEntry.Kind"/> + up to two subject ids
    /// (citizen/device) so downstream renderers (chronicle, eulogy) can query by category
    /// and name the people involved, while the human-readable Text stays the display line.
    ///
    /// Entries are sim state (saved via IStatefulSystem). Per the HIST convention strings
    /// are hash-EXEMPT: the checksum folds tick + kind + subjects (the structural fields),
    /// never the free text — so rewording an entry never perturbs determinism, but adding
    /// one, or changing its kind/subjects, does.
    /// </summary>
    public sealed class HistorySystem : ISimSystem, IStatefulSystem
    {
        public string Name => "History";
        // Every tick: the event bus double-buffers per tick (events are readable for
        // exactly one tick after publish), so a 10-tick sampler would miss nearly all
        // of them (found by the effect-spine review).
        public int IntervalTicks => 1;

        public const int MaxEntries = 200;

        public readonly List<HistoryEntry> Entries = new List<HistoryEntry>(MaxEntries);

        // v1 = tick+text only (Kind implicitly Generic, subjects 0).
        // v2 = tick+kind+subjectA+subjectB+text (this build).
        public ushort StateVersion => 2;

        public void Tick(Simulation sim)
        {
            long tick = sim.TickCount;

            foreach (var alarm in sim.Events.Read<AlarmRaisedEvent>())
                Add(tick, $"{alarm.SourceId}: {alarm.Message}", HistoryKind.Alarm);

            // Keep the CitizenId (previously discarded) and name the crew member. NeedsSystem.Kill
            // removes the citizen from the store the same tick it publishes CitizenDiedEvent, and
            // HistorySystem reads events one tick later — so in the live death path the id lookup
            // misses. The event now CARRIES the name (P2 wave-2 contract), so the text names the
            // dead from CitizenDiedEvent.Name when the lookup misses; a null/empty name still
            // degrades to the neutral "A crew member" line. The id (SubjectA) is always retained.
            foreach (var death in sim.Events.Read<CitizenDiedEvent>())
                Add(tick, DeathText(sim, death.CitizenId, death.Name), HistoryKind.Death, death.CitizenId);

            foreach (var goal in sim.Events.Read<GoalCompletedEvent>())
                Add(tick, $"Objective complete: {goal.Text}", HistoryKind.Goal);

            foreach (var brownout in sim.Events.Read<BrownoutChangedEvent>())
                Add(tick,
                    brownout.InBrownout
                        ? $"Power network {brownout.NetworkId} browned out — non-critical loads shed."
                        : $"Power network {brownout.NetworkId} recovered.",
                    HistoryKind.Brownout);

            foreach (var rel in sim.Events.Read<RelationshipChangedEvent>())
                Add(tick, $"{NameOf(sim, rel.From)}'s regard for {NameOf(sim, rel.To)} shifted.",
                    HistoryKind.RelationshipChanged, rel.From, rel.To);

            foreach (var arg in sim.Events.Read<ArgumentEvent>())
                Add(tick, $"{NameOf(sim, arg.A)} and {NameOf(sim, arg.B)} argued.",
                    HistoryKind.Argument, arg.A, arg.B);

            foreach (var bond in sim.Events.Read<BondEvent>())
                Add(tick, $"{NameOf(sim, bond.A)} and {NameOf(sim, bond.B)} grew closer.",
                    HistoryKind.Bond, bond.A, bond.B);

            foreach (var build in sim.Events.Read<ConstructionCompletedEvent>())
                Add(tick, $"{NameOf(sim, build.BuilderId)} finished a construction.",
                    HistoryKind.ConstructionCompleted, build.BuilderId);
        }

        /// <summary>Citizen name if the sim can still resolve the id, else a neutral placeholder.</summary>
        private static string NameOf(Simulation sim, uint id)
            => id != 0 && sim.Citizens.TryGet(id, out var c) && !string.IsNullOrEmpty(c.Name)
                ? c.Name
                : "A crew member";

        /// <summary>
        /// Names the dead: the still-resolvable citizen name first, then the name the
        /// event carried (the live same-tick-removal path), then the neutral fallback.
        /// </summary>
        private static string DeathText(Simulation sim, uint id, string eventName)
        {
            if (id != 0 && sim.Citizens.TryGet(id, out var c) && !string.IsNullOrEmpty(c.Name))
                return $"{c.Name} has died.";
            if (!string.IsNullOrEmpty(eventName))
                return $"{eventName} has died.";
            return "A crew member has died.";
        }

        private void Add(long tick, string text, HistoryKind kind, uint subjectA = 0, uint subjectB = 0)
        {
            if (Entries.Count >= MaxEntries) Entries.RemoveAt(0);
            Entries.Add(new HistoryEntry(tick, text, (byte)kind, subjectA, subjectB));
        }

        /// <summary>
        /// Append a categorised entry through the same capped buffer the event ingestion
        /// uses. Public so the eulogy renderer (<see cref="EulogySystem"/>, host-registered
        /// after this system) can write its Eulogy entry into the ship's history — and thus
        /// the Chronicle — the same tick it reads the death.
        /// </summary>
        public void Record(long tick, string text, HistoryKind kind, uint subjectA = 0, uint subjectB = 0)
            => Add(tick, text, kind, subjectA, subjectB);

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(Entries.Count);
            for (int i = 0; i < Entries.Count; i++)
            {
                var e = Entries[i];
                writer.Write(e.Tick);
                writer.Write(e.Kind);
                writer.Write(e.SubjectA);
                writer.Write(e.SubjectB);
                writer.Write(e.Text);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version == 0) return; // no such blob is ever written
            Entries.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                if (version >= 2)
                {
                    long tick = reader.ReadInt64();
                    byte kind = reader.ReadByte();
                    uint subjectA = reader.ReadUInt32();
                    uint subjectB = reader.ReadUInt32();
                    string text = reader.ReadString();
                    Entries.Add(new HistoryEntry(tick, text, kind, subjectA, subjectB));
                }
                else // v1: tick + text only; kind defaults to Generic, subjects to 0.
                {
                    long tick = reader.ReadInt64();
                    string text = reader.ReadString();
                    Entries.Add(new HistoryEntry(tick, text));
                }
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x48495354UL; // 'HIST'
            for (int i = 0; i < Entries.Count; i++)
            {
                var e = Entries[i];
                h = h * 31UL + (ulong)e.Tick;
                h = h * 31UL + e.Kind;
                h = h * 31UL + e.SubjectA;
                h = h * 31UL + e.SubjectB;
            }
            return h;
        }
    }
}
