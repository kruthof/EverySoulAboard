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

        /// <summary>
        /// W1 (the wreck start) — the device's boot <see cref="Device.Condition"/>, 1 = pristine …
        /// 0 = wrecked, or <c>null</c> for "the author said nothing; leave the device's own field
        /// initialiser alone". <see cref="ShipPlanBuilder"/> writes it only when it has a value.
        ///
        /// <b>THE NULL IS THE WHOLE SAFETY ARGUMENT, AND IT IS WHY THIS IS A <c>float?</c> RATHER
        /// THAN A <c>float</c> WITH A MAGIC SENTINEL.</b> <see cref="DeviceSpec"/> is a struct and
        /// C# 9 forbids instance field initialisers on one, so every spec an authored ship emits
        /// starts life as zeroed memory — whether it is written
        /// <c>new DeviceSpec { Kind = …, Pos = … }</c> (an object initialiser runs the implicit
        /// parameterless ctor, which zeroes), <c>default(DeviceSpec)</c>, or an element of a
        /// <c>DeviceSpec[]</c>. A plain <c>float Condition</c> would therefore read <c>0f</c> on
        /// every device of every existing ship and the builder would boot the whole repo WRECKED.
        /// A "<c>-1f</c> means unset" sentinel does NOT fix that: zeroed memory is <c>0f</c>, not
        /// <c>-1f</c>, so the sentinel would be missed on exactly the specs that need it and hit
        /// only on the ones that opted in. <c>Nullable&lt;float&gt;</c> is the one encoding whose
        /// "unspecified" state survives all three ways a struct comes into existence, and it costs
        /// nothing: it is itself a struct (no allocation), the authoring path is not a tick path,
        /// and <c>Condition = 0.14f</c> still reads verbatim at the call site.
        ///
        /// Precedent for the encoding, in this repo, meaning exactly this: <c>SetDoorStateCommand
        /// (bool? open, bool? locked)</c> and <c>SetDeviceStateCommand(bool? open, float? rate)</c>.
        ///
        /// NOT hashed and NOT saved by this field: <c>Device.Condition</c> already folds into
        /// <c>StateHash</c> and already persists (DEVC v3). A plan is never serialized. So
        /// authoring damage moves no determinism pin — only the resulting sim state differs, on
        /// ships that opt in.
        /// </summary>
        public float? Condition;

        /// <summary>
        /// W1 — the device's boot <see cref="Device.Scriptable"/> (has a ControllerModule been
        /// fitted?), or <c>null</c> for "leave the device's own initialiser — <c>true</c> — alone".
        /// A wreck authors <c>false</c> so MOSS is dark until a <c>CommissionDeviceCommand</c>
        /// spends a module on the terminal.
        ///
        /// <b>A plain <c>bool</c> here would be precisely the regression <see cref="Device"/>'s own
        /// header calls catastrophic</b>: <c>default</c> is <c>false</c>, so every device on every
        /// ship would boot un-commissioned, <c>MossBindings.RegisterAdapters</c> would register no
        /// adapter for any of them, and every authored program would silently stop binding. Same
        /// encoding and same argument as <see cref="Condition"/> above.
        /// </summary>
        public bool? Scriptable;
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
