using System.Collections.Generic;

namespace Moonbase.Sim
{
    /// <summary>One line of ship history, day-stamped ("Day 142.12 — Blight detected in Bay 3").</summary>
    public readonly struct HistoryEntry
    {
        public readonly long Tick;
        public readonly string Text;

        public HistoryEntry(long tick, string text)
        {
            Tick = tick;
            Text = text;
        }

        public double Day => Tick / (double)SimClockUtil.TicksPerDay;
    }

    public static class SimClockUtil
    {
        public const long TicksPerDay = Simulation.TicksPerSecond * 60L * 60L * 24L;
    }

    /// <summary>
    /// Historical layer v0 (SIMULATION_ARCHITECTURE §6): notable events become
    /// day-stamped history — the event log's data source. v0 records alarms and
    /// deaths; later: arrivals, research, promotions, policy changes, and citizen
    /// memory hooks. Entries are sim state (saved via IStatefulSystem; strings are
    /// hash-exempt per convention, so the checksum covers count + ticks only).
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

        public ushort StateVersion => 1;

        public void Tick(Simulation sim)
        {
            foreach (var alarm in sim.Events.Read<AlarmRaisedEvent>())
                Add(sim.TickCount, $"{alarm.SourceId}: {alarm.Message}");

            foreach (var death in sim.Events.Read<CitizenDiedEvent>())
                Add(sim.TickCount, "A crew member has died.");

            foreach (var goal in sim.Events.Read<GoalCompletedEvent>())
                Add(sim.TickCount, $"Objective complete: {goal.Text}");
        }

        private void Add(long tick, string text)
        {
            if (Entries.Count >= MaxEntries) Entries.RemoveAt(0);
            Entries.Add(new HistoryEntry(tick, text));
        }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(Entries.Count);
            for (int i = 0; i < Entries.Count; i++)
            {
                writer.Write(Entries[i].Tick);
                writer.Write(Entries[i].Text);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            Entries.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                long tick = reader.ReadInt64();
                string text = reader.ReadString();
                Entries.Add(new HistoryEntry(tick, text));
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x48495354UL; // 'HIST'
            for (int i = 0; i < Entries.Count; i++)
                h = h * 31UL + (ulong)Entries[i].Tick;
            return h;
        }
    }
}
