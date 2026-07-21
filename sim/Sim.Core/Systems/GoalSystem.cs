using System.Collections.Generic;
using System.IO;

namespace Perilune.Sim
{
    /// <summary>How a goal decides it is complete (data, not code — goals are saved).</summary>
    public enum GoalKind : byte
    {
        /// <summary>The room at the named anchor holds breathable pressure (&gt; 90 kPa).</summary>
        PressurizeAnchor = 0,
        /// <summary>No debris walls remain anywhere in the world.</summary>
        ClearAllDebris = 1,
        /// <summary>The tile at the named anchor has been revealed (fog lifted).</summary>
        ExploreAnchor = 2,
    }

    /// <summary>One player-facing objective (the CURRENT PRIORITIES panel).</summary>
    public sealed class Goal
    {
        public GoalKind Kind;
        public string Param = "";  // anchor name for anchor-based kinds
        public string Text = "";   // player-facing line
        public bool Done;
        public long DoneTick;
    }

    /// <summary>
    /// The objective tracker behind CURRENT PRIORITIES: authored goals with
    /// data-driven completion conditions, polled at 1 Hz. Completion publishes
    /// <see cref="GoalCompletedEvent"/> (HistorySystem turns it into a day-stamped
    /// log line). Goals are sim state (SYSS chapter); strings are hash-exempt per
    /// convention, so the checksum covers kinds, flags and ticks only.
    /// </summary>
    public sealed class GoalSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Goals";
        public int IntervalTicks => 10; // condition polling at 1 Hz

        public readonly List<Goal> Goals = new List<Goal>(8);

        /// <summary>Bumped on every add/completion — cheap change detection for the HUD.</summary>
        public int Version { get; private set; }

        public ushort StateVersion => 1;

        public void Add(GoalKind kind, string param, string text)
        {
            Goals.Add(new Goal { Kind = kind, Param = param ?? "", Text = text ?? "" });
            Version++;
        }

        public void Tick(Simulation sim)
        {
            for (int i = 0; i < Goals.Count; i++)
            {
                var goal = Goals[i];
                if (goal.Done || !Evaluate(sim, goal)) continue;
                goal.Done = true;
                goal.DoneTick = sim.TickCount;
                Version++;
                sim.Events.Publish(new GoalCompletedEvent { Text = goal.Text });
            }
        }

        private static bool Evaluate(Simulation sim, Goal goal)
        {
            switch (goal.Kind)
            {
                case GoalKind.PressurizeAnchor:
                {
                    if (!TryAnchor(sim, goal.Param, out var probe)) return false;
                    ushort roomId = sim.Rooms.RoomIdAt(sim.World, probe);
                    if (roomId == 0 || roomId == RoomState.DoorMarker) return false;
                    return sim.Rooms.RoomAt(sim.World, probe).PressureKPa > 90.0;
                }
                case GoalKind.ClearAllDebris:
                {
                    var world = sim.World;
                    for (int z = 0; z < world.Depth; z++)
                    {
                        var level = world.Levels[z];
                        for (int i = 0; i < level.Wall.Length; i++)
                            if (level.Wall[i] == TileDefs.Debris) return false;
                    }
                    return true;
                }
                case GoalKind.ExploreAnchor:
                {
                    if (!TryAnchor(sim, goal.Param, out var probe)) return false;
                    return (sim.World.GetFlags(probe) & TileFlags.Explored) != 0;
                }
                default:
                    return false;
            }
        }

        private static bool TryAnchor(Simulation sim, string name, out Int3 probe)
        {
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                if (anchors[i].Name != name) continue;
                probe = anchors[i].Probe;
                return true;
            }
            probe = default;
            return false;
        }

        public void CaptureState(BinaryWriter writer)
        {
            writer.Write(Goals.Count);
            for (int i = 0; i < Goals.Count; i++)
            {
                var goal = Goals[i];
                writer.Write((byte)goal.Kind);
                writer.Write(goal.Param);
                writer.Write(goal.Text);
                writer.Write(goal.Done);
                writer.Write(goal.DoneTick);
            }
        }

        public void RestoreState(BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            Goals.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                Goals.Add(new Goal
                {
                    Kind = (GoalKind)reader.ReadByte(),
                    Param = reader.ReadString(),
                    Text = reader.ReadString(),
                    Done = reader.ReadBoolean(),
                    DoneTick = reader.ReadInt64(),
                });
            }
            Version++;
        }

        public ulong StateChecksum()
        {
            ulong h = 0x474F414CUL; // 'GOAL'
            for (int i = 0; i < Goals.Count; i++)
            {
                h = h * 31UL + (ulong)Goals[i].Kind;
                h = h * 31UL + (Goals[i].Done ? 1UL : 0UL);
                h = h * 31UL + (ulong)Goals[i].DoneTick;
            }
            return h;
        }
    }
}
