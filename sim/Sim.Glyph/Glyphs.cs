using Perilune.Sim;

namespace Perilune.Glyph
{
    /// <summary>
    /// THE glyph vocabulary — the single source of truth for which character stands for
    /// what. State (open/broken/unpowered) changes a cell's COLOUR, never its glyph, so
    /// the map reads the same whatever the palette. Tables are exhaustive switches over
    /// the Sim.Core enums and are guarded by an enum-coverage test; any new DeviceKind or
    /// ItemKind fails to compile (switch arm) or fails that test until it gets a glyph.
    /// </summary>
    public static class Glyphs
    {
        // --- Terrain (see AsciiWorld / TileDefs) ---
        public const char Floor = '.';
        public const char Wall = '#';
        public const char Debris = '%';
        public const char Void = ' ';     // vacuum OR not-yet-explored fog
        public const char Citizen = '@';

        // --- Doors: state picks the glyph (colour is set by the mapper) ---
        public const char DoorClosed = '+';
        public const char DoorOpen = '/';
        public const char DoorLocked = 'X';

        // --- Utility overlays: drawn only under the matching lens ---
        public const char Conduit = '~';
        public const char Pipe = '~';     // intentional share: both are service-tray lines

        /// <summary>
        /// Glyph for a device kind at rest. Doors are handled by the mapper from IsOpen/
        /// IsLocked (this returns the closed glyph as the base). Conduit/Pipe both map to
        /// '~' — an intentional, documented collision (they are the same visual line).
        /// </summary>
        public static char ForDevice(DeviceKind kind) => kind switch
        {
            DeviceKind.Door => DoorClosed,
            DeviceKind.AirVent => '^',
            DeviceKind.Scrubber => 'S',
            DeviceKind.Ladder => 'H',
            DeviceKind.Terminal => 'T',
            DeviceKind.SolarWing => 'G',
            DeviceKind.Battery => 'B',
            DeviceKind.Conduit => Conduit,
            DeviceKind.Light => '*',
            DeviceKind.GrowBed => '"',
            DeviceKind.WaterTank => 'O',
            DeviceKind.Pipe => Pipe,
            DeviceKind.Reclaimer => 'R',
            DeviceKind.Fabricator => 'F',
            DeviceKind.MachineShop => 'M',
            DeviceKind.SalvageRecycler => 'Y',
            DeviceKind.Radiator => '=',
            DeviceKind.Bed => 'b',
            DeviceKind.Table => 't',
            DeviceKind.Chair => 'h',
            DeviceKind.MedBed => 'd',
            DeviceKind.MedCabinet => 'C',
            DeviceKind.Locker => 'L',
            DeviceKind.Desk => 'D',
            DeviceKind.PlantPot => 'P',
            DeviceKind.Telescope => 'x',
            DeviceKind.IceMelter => 'I',   // E0-7 (upper case, like every other machine)
            _ => '?',
        };

        /// <summary>Glyph for a ground item stack (topmost on its tile).</summary>
        public static char ForItem(ItemKind kind) => kind switch
        {
            ItemKind.Regolith => ',',
            ItemKind.MetalOre => 'o',
            ItemKind.Corpse => '&',
            ItemKind.Potato => 'f',
            ItemKind.Scrap => 's',
            ItemKind.Parts => 'p',
            ItemKind.ControllerModule => 'c',
            ItemKind.Seals => 'g',   // E0-6: 'g' for gasket. 's' is Scrap and 'S' is the Scrubber
                                     // device, so neither initial of "seals" was free.
            ItemKind.Ice => 'i',     // E0-7 (lower case, like every other ground item)
            ItemKind.Swarf => 'w',   // wreck start: 's' is Scrap, 'S' is the Scrubber and 'c' is the
                                     // ControllerModule, so 'w' (swarf/waste metal) is the free char.
            _ => '?',
        };
    }
}
