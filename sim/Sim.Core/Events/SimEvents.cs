namespace Perilune.Sim
{
    /// <summary>A tile's floor/wall/flags changed — view marks the containing chunk dirty.</summary>
    public struct TileChangedEvent : ISimEvent
    {
        public Int3 Pos;
    }

    /// <summary>Rooms were recomputed (topology change) — atmosphere overlays refresh.</summary>
    public struct RoomsChangedEvent : ISimEvent
    {
        public int RoomCount;
    }

    /// <summary>Fog of war: at least one tile became Explored this pass (view refresh).</summary>
    public struct FogRevealedEvent : ISimEvent
    {
        public int NewlyRevealed;
    }

    public struct DoorStateChangedEvent : ISimEvent
    {
        public uint DeviceId;
        public bool IsOpen;
    }

    /// <summary>Raised by MOSS `alarm(...)` / `alarm when` and by sim systems; feeds the alerts UI.</summary>
    public struct AlarmRaisedEvent : ISimEvent
    {
        public string SourceId;   // terminal/device name
        public string Message;
    }

    public struct CitizenDiedEvent : ISimEvent
    {
        public uint CitizenId;
        public Int3 Pos;
    }

    /// <summary>An authored objective completed (GoalSystem); HistorySystem logs it.</summary>
    public struct GoalCompletedEvent : ISimEvent
    {
        public string Text;
    }

    /// <summary>A power network shed (or restored) consumers this balance pass.</summary>
    public struct BrownoutChangedEvent : ISimEvent
    {
        public ushort NetworkId;
        public bool InBrownout;
    }

    /// <summary>
    /// A directed opinion edge crossed a relationship-type threshold (SocialSystem hysteresis
    /// classifier). Rel values are the Social RelationType enum, carried as byte so the event
    /// contract stays append-only and lane-independent.
    /// </summary>
    public struct RelationshipChangedEvent : ISimEvent
    {
        public uint From;
        public uint To;
        public byte OldRel;
        public byte NewRel;
    }

    /// <summary>Two co-located citizens argued (deterministic social pass roll) — memory + history consume.</summary>
    public struct ArgumentEvent : ISimEvent
    {
        public uint A;
        public uint B;
        public Int3 Pos;
    }

    /// <summary>Two co-located citizens bonded (deterministic social pass roll) — memory + history consume.</summary>
    public struct BondEvent : ISimEvent
    {
        public uint A;
        public uint B;
        public Int3 Pos;
    }

    /// <summary>A designated build (wall/door/device) finished constructing (BuildSystem).</summary>
    public struct ConstructionCompletedEvent : ISimEvent
    {
        public Int3 Pos;
        public byte BuildKind;   // BuildSystem's kind enum as byte (append-only contract)
        public uint BuilderId;
    }
}
