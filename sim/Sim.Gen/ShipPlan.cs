using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// A complete declarative starting ship — tiles, rooms, devices, crew, items,
    /// starting atmosphere, goals and MOSS scripts. Both the hand-authored
    /// Perilune (<see cref="AuthoredShips"/>) and the future procedural generator
    /// emit this; <see cref="ShipPlanBuilder"/> is the single path from a plan to
    /// a running <see cref="Simulation"/>. Plans are never serialized to disk: a
    /// generated plan is a pure function of (generator version, seed), and saves
    /// persist the built world.
    /// </summary>
    public sealed class ShipPlan
    {
        public string Name = "";
        public ulong Seed;

        /// <summary>Per-deck ASCII rows, AsciiWorld charset ('.', '#', 'R', ' ').</summary>
        public string[][] DeckRows;

        public readonly List<RoomSpec> Rooms = new List<RoomSpec>();
        public readonly List<DeviceSpec> Devices = new List<DeviceSpec>();
        public readonly List<CitizenSpec> Citizens = new List<CitizenSpec>();
        public readonly List<ItemSpec> Items = new List<ItemSpec>();
        public readonly List<string> PressurizedAnchors = new List<string>();

        /// <summary>Debris tiles the ship boots with already marked for digging (the dig
        /// board's authored seed — the same <see cref="TileFlags.Designated"/> flag a player's
        /// <see cref="DesignateDigCommand"/> sets, just placed by the author instead of by
        /// hand at runtime). Empty on ships whose debris is purely a player objective.</summary>
        public readonly List<Int3> DigDesignations = new List<Int3>();

        public readonly List<GoalSpec> Goals = new List<GoalSpec>();
        public readonly List<ScriptSpec> Scripts = new List<ScriptSpec>();
    }

    /// <summary>A named, typed room anchor (the MOSS namespace + template key).</summary>
    public struct RoomSpec
    {
        public string Anchor;
        public RoomType Type;
        public Int3 Probe;
    }

    public struct DeviceSpec
    {
        public DeviceKind Kind;
        public Int3 Pos;
        public string Name;
        public bool IsOpen;
        public float StoredKWh;
        public float StoredLiters;
    }

    public struct CitizenSpec
    {
        public string Name;
        public Int3 Pos;
        public bool AutoWander;
        public bool RevealsFog;
        public bool HoldPosition; // strict player control: moves only on direct orders
    }

    public struct ItemSpec
    {
        public ItemKind Kind;
        public int Count;
        public Int3 Pos;
        public string Label;
    }

    public struct GoalSpec
    {
        public GoalKind Kind;
        public string Param;
        public string Text;
    }

    public struct ScriptSpec
    {
        public string TerminalId;
        public string Source;
    }
}
