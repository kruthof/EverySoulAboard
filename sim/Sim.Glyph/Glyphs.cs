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

        // --- Cryo pods: state picks the glyph, exactly as doors do (the wreck start, W3) ---
        // A pod is the SECOND kind whose glyph comes from state rather than from ForDevice, and the
        // reason is the same one that gives a door three chars: an OPEN capsule and an OCCUPIED one
        // are different objects to a player, the warm item set ships a separate piece for each
        // (CRYO CAPSULE · OPEN and CRYO CAPSULE · OCCUPIED), and colour cannot say which is which
        // because GlyphColor is already spent on Broken/Dim by DeviceColour.
        //
        // `CryoPodClosed` is the ForDevice ARM (the kind's rest glyph, like DoorClosed); the open
        // state is a GlyphMapper.DeviceGlyph override and appears in no switch arm at all. That is
        // exactly the shape that let two door glyphs escape the client art guard for months, so it
        // is called out here: `client/test/device-sprite-coverage.test.js` parses DeviceGlyph's own
        // body as well as this switch, and both chars are in its pinned population.
        //
        // 'K' / 'k' were the free pair. 'C' is MedCabinet, 'c' is the ControllerModule ground stack.
        public const char CryoPodClosed = 'K';
        public const char CryoPodOpen = 'k';

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
            // M3-10. Upper case like every other machine. 'H' is the Ladder and 'h' the Chair, so
            // the heater's own initial was taken in both cases; 'E' is the next free letter of the
            // word and nothing else in ForDevice, ForItem or the mapper's state overrides claims
            // it. The client's `space-heater` piece skins it directly — see items/index.js, where
            // that piece has read `deviceKind: 'Heater'` since the warm set was drawn, waiting for
            // this enum member to exist.
            DeviceKind.Heater => 'E',
            // The wreck start: the REST glyph of a pod is the occupied capsule. The open state is
            // GlyphMapper.DeviceGlyph's override, in the same way DoorClosed is the arm here while
            // DoorOpen/DoorLocked live only in the mapper.
            DeviceKind.CryoPod => CryoPodClosed,
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
