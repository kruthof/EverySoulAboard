using System.Collections.Generic;
using System.IO;

namespace Perilune.Sim
{
    /// <summary>How a goal decides it is complete (data, not code — goals are saved).
    /// Values are persisted as a byte in the SYSS chapter, so this enum is append-only.</summary>
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
        public bool Done;          // latched: never re-opens once set, even if the condition lapses
        public long DoneTick;      // sim tick of completion; 0 while pending
    }

    /// <summary>
    /// The objective tracker behind CURRENT PRIORITIES: authored goals with
    /// data-driven completion conditions, polled at 1 Hz. Completion publishes
    /// <see cref="GoalCompletedEvent"/> (HistorySystem turns it into a day-stamped
    /// log line). Goals are sim state (SYSS chapter); strings are hash-exempt per
    /// convention, so the checksum covers kinds, flags and ticks only.
    ///
    /// HOW A GOAL BECOMES WORK: it doesn't. This system is a pure OBSERVER — it reads
    /// rooms, tiles and fog flags, and the only thing it ever writes is a goal's own
    /// Done/DoneTick. It creates no job, no designation, no haul demand; it never sets
    /// <see cref="Simulation.JobsDirty"/>; no other system reads
    /// <see cref="Goals"/>. A goal is a scoreboard entry, and the player (or an LLM
    /// <c>CitizenEffect</c>) is the only thing that turns it into labour.
    ///
    /// The consequence that reads as a bug and is not one: "Clear the aft debris" is
    /// satisfied only when no <see cref="TileDefs.Debris"/> wall remains, and debris is
    /// removed exclusively by <see cref="JobKind.Dig"/>. JobSystem boards a dig only for
    /// tiles carrying <see cref="TileFlags.Designated"/>, and that flag is set in exactly
    /// two places: <c>DesignateDigCommand</c> (a host/player command) and the validated
    /// LLM SetJob effect. Nothing in ship authoring pre-designates. So a freshly booted
    /// ship shows a debris goal against a permanently empty dig board until the player
    /// paints designations — the goal does not recruit the crew, and the crew will
    /// never notice the goal.
    ///
    /// Latch semantics: Done is one-way. A pressurize goal that completes and then
    /// decompresses stays complete, so DoneTick is a genuine "first achieved" stamp and
    /// the Chronicle line is published exactly once.
    ///
    /// Determinism/allocation: a linear pass over an authored list (usually 3 entries),
    /// no RNG; the only per-pass cost worth noting is <see cref="GoalKind.ClearAllDebris"/>,
    /// which scans every tile of every deck each second until it succeeds. Nothing is
    /// allocated in <see cref="Tick"/> (<see cref="GoalCompletedEvent"/> is a struct on
    /// a typed channel). Anchors are resolved by NAME through a linear scan of
    /// <see cref="RoomState.Anchors"/>; a goal naming an anchor that does not exist
    /// evaluates false forever rather than throwing.
    /// </summary>
    public sealed class GoalSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Goals";
        public int IntervalTicks => 10; // condition polling at 1 Hz

        /// <summary>Authored objectives in declaration order (ShipPlanBuilder replays
        /// <c>plan.Goals</c> into here at boot). Public and unbounded; among the shipping
        /// hosts the only reader is the TUI's PRIORITIES panel, which renders it in this
        /// order. <see cref="Add"/> does not deduplicate.</summary>
        public readonly List<Goal> Goals = new List<Goal>(8);

        /// <summary>Bumped on every add/completion — cheap change detection for the HUD.</summary>
        public int Version { get; private set; }

        public ushort StateVersion => 1;

        /// <summary>Register an objective. Boot-time path only in practice
        /// (ShipPlanBuilder); nulls are normalized to "" so the save never writes a
        /// null string.</summary>
        public void Add(GoalKind kind, string param, string text)
        {
            Goals.Add(new Goal { Kind = kind, Param = param ?? "", Text = text ?? "" });
            Version++;
        }

        /// <summary>Poll every pending condition. Completed goals are skipped before
        /// evaluation, so an expensive kind (ClearAllDebris) stops costing anything the
        /// moment it latches.</summary>
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

        /// <summary>
        /// Test one goal's condition against the live sim. Pure read: no branch here
        /// mutates anything. Every kind returns false rather than throwing on missing
        /// data, so a goal naming a deleted anchor is merely unachievable.
        /// </summary>
        private static bool Evaluate(Simulation sim, Goal goal)
        {
            switch (goal.Kind)
            {
                case GoalKind.PressurizeAnchor:
                {
                    if (!TryAnchor(sim, goal.Param, out var probe)) return false;
                    ushort roomId = sim.Rooms.RoomIdAt(sim.World, probe);
                    if (roomId == 0 || roomId == RoomState.DoorMarker) return false; // vacuum / threshold: not a room
                    // 90 kPa is an inline objective threshold, NOT a def field, and is
                    // its own number: distinct from the vent's 101.3 kPa top-up ceiling
                    // (atmosphere.def nominal_pressure_kpa) and from the 5 kPa at which
                    // needs.def calls a room vacuum. It sits just under a full fill so a
                    // room the vents are still topping off already counts as restored.
                    return sim.Rooms.RoomAt(sim.World, probe).PressureKPa > 90.0;
                }
                case GoalKind.ClearAllDebris:
                {
                    // Whole-world scan, every pass, until it finally succeeds. Note it
                    // is vacuously TRUE on a ship authored without debris — such a goal
                    // completes on the first tick it is polled.
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
                    // Fog is a ratchet (ExplorationSystem never clears Explored), so once
                    // this reads true it stays true — the Done latch is belt-and-braces
                    // here, unlike PressurizeAnchor where the condition really can lapse.
                    if (!TryAnchor(sim, goal.Param, out var probe)) return false;
                    return (sim.World.GetFlags(probe) & TileFlags.Explored) != 0;
                }
                default:
                    return false;
            }
        }

        /// <summary>Resolve an anchor name to its probe tile. Anchors name a TILE, not a
        /// room id, so the lookup survives every room recompute (merges and splits
        /// included) — which is why goals can be authored before the ship is flooded.</summary>
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
            Version++; // not saved — a restore just has to look like a change to the HUD
        }

        /// <summary>
        /// Folds into <see cref="Simulation.StateHash"/>. Param and Text are saved but
        /// deliberately NOT hashed (project convention: strings are hash-exempt), so
        /// rewording an objective is a content edit that cannot move a determinism pin;
        /// changing a goal's KIND or its completion tick can and must.
        /// </summary>
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
