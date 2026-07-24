using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Glyph
{
    /// <summary>
    /// THE projection: a read-only, allocation-free snapshot of one z-level of a
    /// Simulation into a GlyphBuffer. Pure by contract — it reads sim state and never
    /// mutates it (no RecomputeIfDirty, no command enqueue, no caching), so
    /// sim.StateHash() is identical before and after. This purity is the whole point:
    /// the map layer can be driven from any thread/skin without perturbing the sim.
    ///
    /// Layering (later passes overdraw earlier ones), fog-gated in every pass:
    ///   1. terrain + lens background (per tile)
    ///   2. utility overlays (Conduit under Power, Pipe under Water)
    ///   3. ground item stacks (topmost by store order)
    ///   4. devices (Door state / broken / unpowered colouring)
    ///   5. living citizens ('@', coloured by faction)
    ///   6. cursor (Inverse attr)
    /// The fog gate is FIRST in pass 1: an unexplored tile is a blank Unknown cell, and
    /// no later pass draws onto an unexplored tile — a citizen or device standing in the
    /// dark is invisible until the tile is revealed.
    /// </summary>
    public static class GlyphMapper
    {
        public static void Project(Simulation sim, int z, Lens lens, Int3? cursor, GlyphBuffer dst)
        {
            var world = sim.World;
            int w = dst.Width < world.Width ? dst.Width : world.Width;
            int h = dst.Height < world.Height ? dst.Height : world.Height;
            var level = world.Levels[z];
            var rooms = sim.Rooms.Rooms;

            // Anything the world doesn't cover stays blank fog.
            dst.Fill(GlyphCell.Blank);

            // --- Pass 1: terrain + lens background, fog-gated. ---
            for (int y = 0; y < h; y++)
            {
                int row = y * level.Width;
                for (int x = 0; x < w; x++)
                {
                    int i = row + x;
                    if ((level.Flags[i] & (byte)TileFlags.Explored) == 0)
                    {
                        dst[x, y] = GlyphCell.Blank; // FOG GATE: seen nothing here
                        continue;
                    }

                    char glyph;
                    GlyphColor fg;
                    ushort wall = level.Wall[i];
                    if (wall == TileDefs.Wall) { glyph = Glyphs.Wall; fg = GlyphColor.Wall; }
                    else if (wall == TileDefs.Debris) { glyph = Glyphs.Debris; fg = GlyphColor.Debris; }
                    else
                    {
                        ushort floor = level.Floor[i];
                        if (floor == TileDefs.Floor) { glyph = Glyphs.Floor; fg = GlyphColor.Floor; }
                        else if (floor == TileDefs.Debris) { glyph = Glyphs.Debris; fg = GlyphColor.Debris; }
                        else { glyph = Glyphs.Void; fg = GlyphColor.Void; }
                    }

                    // Player designations recolour the terrain they sit on (E0-3). Both ids were
                    // reserved in GlyphColor from the start with no emitter; this is that emitter.
                    // Dig outranks stockpile: DesignateDigCommand only marks Debris walls and
                    // DesignateStockpileCommand only marks walkable tiles, so the two flags cannot
                    // legally coexist — but a stale flag left by an older save must still resolve
                    // to exactly one colour, so the order is stated rather than assumed.
                    byte flags = level.Flags[i];
                    if ((flags & (byte)TileFlags.Designated) != 0) fg = GlyphColor.Designate;
                    else if ((flags & (byte)TileFlags.Stockpile) != 0) fg = GlyphColor.Stockpile;

                    GlyphColor bg = LensBackground(sim, lens, rooms, level.RoomId[i]);
                    dst[x, y] = new GlyphCell(glyph, fg, bg);
                }
            }

            // --- Pass 2: utility overlays (not in the device grid). ---
            if (lens == Lens.Power || lens == Lens.Water)
            {
                var devices = sim.Devices.Items;
                for (int d = 0; d < devices.Count; d++)
                {
                    var device = devices[d];
                    if (!Simulation.IsUtilityOverlay(device.Kind)) continue;
                    if (lens == Lens.Power && device.Kind != DeviceKind.Conduit) continue;
                    if (lens == Lens.Water && device.Kind != DeviceKind.Pipe) continue;
                    var p = device.Pos;
                    if (p.Z != z || !Explored(level, dst, p.X, p.Y)) continue;
                    var prev = dst[p.X, p.Y];
                    dst[p.X, p.Y] = new GlyphCell(Glyphs.ForDevice(device.Kind), GlyphColor.Accent, prev.Bg);
                }
            }

            // --- Pass 3: ground item stacks (topmost = last in store order). ---
            var items = sim.Items.Items;
            for (int n = 0; n < items.Count; n++)
            {
                var item = items[n];
                if (item.CarriedBy != 0) continue; // carried items ride their carrier
                var p = item.Pos;
                if (p.Z != z || !Explored(level, dst, p.X, p.Y)) continue;
                var prev = dst[p.X, p.Y];
                GlyphColor fg = item.Kind == ItemKind.Corpse ? GlyphColor.Broken : GlyphColor.Item;
                dst[p.X, p.Y] = new GlyphCell(Glyphs.ForItem(item.Kind), fg, prev.Bg, prev.Attr);
            }

            // --- Pass 4: devices (grid-resident kinds only). ---
            var devs = sim.Devices.Items;
            for (int d = 0; d < devs.Count; d++)
            {
                var device = devs[d];
                if (Simulation.IsUtilityOverlay(device.Kind)) continue; // handled in pass 2
                var p = device.Pos;
                if (p.Z != z || !Explored(level, dst, p.X, p.Y)) continue;

                char glyph = DeviceGlyph(device);
                var (fg, attr) = DeviceColour(device, lens, sim.Defs);
                var prev = dst[p.X, p.Y];
                dst[p.X, p.Y] = new GlyphCell(glyph, fg, prev.Bg, prev.Attr | attr);
            }

            // --- Pass 5: living citizens. Dead ones leave the store (a Corpse item
            //     carries their identity), so anyone here is alive. ---
            var citizens = sim.Citizens.Items;
            for (int c = 0; c < citizens.Count; c++)
            {
                var citizen = citizens[c];
                if (citizen.Dead) continue; // defensive: dead are removed, not stored
                var p = citizen.Pos;
                if (p.Z != z || !Explored(level, dst, p.X, p.Y)) continue;
                var prev = dst[p.X, p.Y];
                GlyphColor fg = citizen.Faction == 1 ? GlyphColor.Hostile : GlyphColor.Crew;
                dst[p.X, p.Y] = new GlyphCell(Glyphs.Citizen, fg, prev.Bg, prev.Attr);
            }

            // --- Pass 6: cursor overlay (UI, not fog-gated). ---
            if (cursor.HasValue)
            {
                var cur = cursor.Value;
                if (cur.Z == z && dst.InBounds(cur.X, cur.Y))
                {
                    var prev = dst[cur.X, cur.Y];
                    dst[cur.X, cur.Y] = prev.WithAttr(prev.Attr | GlyphAttr.Inverse);
                }
            }
        }

        /// <summary>True if the tile is explored AND inside the buffer.</summary>
        private static bool Explored(ZLevel level, GlyphBuffer dst, int x, int y)
        {
            if (!dst.InBounds(x, y) || x >= level.Width || y >= level.Height) return false;
            return (level.Flags[y * level.Width + x] & (byte)TileFlags.Explored) != 0;
        }

        /// <summary>Door glyph is chosen by state; every other kind uses its rest glyph.</summary>
        private static char DeviceGlyph(Device device)
        {
            if (device.Kind == DeviceKind.Door)
            {
                if (device.IsLocked) return Glyphs.DoorLocked;
                return device.IsOpen ? Glyphs.DoorOpen : Glyphs.DoorClosed;
            }
            return Glyphs.ForDevice(device.Kind);
        }

        /// <summary>
        /// Device foreground/attribute from state, not kind: broken (below FailBelow)
        /// reads Broken; a powered-draw device with no power is Dim + DeviceDim; a locked
        /// door reads Locked; under the Water lens a tank reads its fill band. Highest
        /// priority wins the colour; the Dim attribute is layered independently.
        /// </summary>
        private static (GlyphColor fg, GlyphAttr attr) DeviceColour(Device device, Lens lens, SimDefs defs)
        {
            bool consumer = defs.Machines[(int)device.Kind].DrawKW > 0f;
            bool unpowered = consumer && !device.Powered;
            GlyphAttr attr = unpowered ? GlyphAttr.Dim : GlyphAttr.None;

            GlyphColor fg;
            if (!device.IsOperational(defs)) fg = GlyphColor.Broken;
            else if (lens == Lens.Water && device.Kind == DeviceKind.WaterTank)
                fg = LensRamps.WaterFill(device.StoredLiters / defs.Water.TankCapacityLiters);
            else if (device.Kind == DeviceKind.Door && device.IsLocked) fg = GlyphColor.Locked;
            else if (unpowered) fg = GlyphColor.DeviceDim;
            else if (device.Kind == DeviceKind.Terminal) fg = GlyphColor.Terminal;
            else fg = GlyphColor.Device;
            return (fg, attr);
        }

        /// <summary>
        /// The lens background for a tile's room. None/Power/Water tint nothing (Power and
        /// Water express themselves on devices, not the floor). Room 0 (vacuum), door
        /// tiles and unassigned tiles keep the default background.
        /// </summary>
        private static GlyphColor LensBackground(Simulation sim, Lens lens, List<Room> rooms, ushort roomId)
        {
            if (lens == Lens.None || lens == Lens.Power || lens == Lens.Water) return GlyphColor.Void;
            if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) return GlyphColor.Void;
            var room = rooms[roomId];
            switch (lens)
            {
                case Lens.Pressure: return LensRamps.Pressure(room.PressureKPa);
                case Lens.Oxygen: return LensRamps.Oxygen(room.O2Fraction);
                case Lens.Co2: return LensRamps.Co2(room.CO2Ppm);
                case Lens.Temperature: return LensRamps.Temperature(room.TemperatureK - 273.15);
                default: return GlyphColor.Void;
            }
        }
    }
}
