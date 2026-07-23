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

        /// <summary>
        /// AUTHORING/VIEW-ONLY slot grid — the per-deck 2×4 compartment layout the warm
        /// SVG Overview/Room-Zoom consume via the <c>decks</c> wire channel (geometry +
        /// binding + roomType per slot). This is a PLAN-LEVEL field: it is NEVER copied
        /// into World/ZLevel state, a save chapter, or <c>World.HashInto</c>, and — like
        /// every other <see cref="ShipPlan"/> field — the plan itself is never serialized
        /// (a plan is a pure function of author/seed; saves persist the BUILT world). It
        /// therefore moves NO determinism hash. <see cref="SlotGridPlanner"/> fills it as
        /// it carves each deck; ships that use no slot grid (Perilune/PeriluneSlice) leave
        /// it empty. The host's future <c>BuildDecks()</c> reads it for slot geometry, and
        /// derives <c>occupied</c>/<c>active</c>/blanked <c>anchorName</c> from live
        /// <see cref="RoomState"/> (never from this field).
        /// </summary>
        public readonly List<SlotDescriptor> SlotGrid = new List<SlotDescriptor>();
    }

    /// <summary>One 2×4 slot of a deck's compartment grid — the authoring source for a
    /// <c>decks</c> wire SlotTuple. View/authoring-only: not saved, not hashed (see
    /// <see cref="ShipPlan.SlotGrid"/>). <paramref name="X"/>/<paramref name="Y"/>/
    /// <paramref name="W"/>/<paramref name="H"/> is the slot's tile rect in frame/click
    /// space (wall-inclusive compartment window). <see cref="Anchor"/> joins to the
    /// room's <c>RoomAnchor.Name</c> (and the MOSS namespace); an unfurnished hall carries
    /// its own anchor with <see cref="RoomType.None"/>.</summary>
    public struct SlotDescriptor
    {
        public int Deck;
        public int Index;   // 0..7, row-major over the 2×4 grid (0..3 top, 4..7 bottom)
        public int X, Y, W, H;
        public string Anchor;
        public RoomType Type;
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
