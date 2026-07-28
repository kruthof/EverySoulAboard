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
    ///   4. devices (Door state / broken / unpowered colouring; a CONDEMNED device keeps its
    ///      glyph but reads GlyphColor.Deconstruct, mirroring pass 1's wall emitter)
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
            // The deconstruct registry (E0-5), resolved once. It is a REGISTRY, not a tile flag, so
            // the strip emitter below must query it per tile rather than read level.Flags. Null on a
            // reduced stack, and skipped entirely when nothing is condemned (the common case) so a
            // strip-free ship pays zero — no per-tile registry probe unless a site exists.
            var strip = sim.Deconstruct;
            bool anyStrip = strip != null && strip.Pending.Count > 0;

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

                    // Player designations recolour the terrain they sit on. Both flag ids were
                    // reserved in GlyphColor from the start with no emitter; this is that emitter.
                    // PRECEDENCE, stated rather than assumed (an old save may carry a stale flag, so
                    // every tile must resolve to exactly one colour):
                    //   1. Designate (dig)   — TileFlags.Designated
                    //   2. Stockpile (zone)  — TileFlags.Stockpile
                    //   3. Deconstruct (E0-5 strip) — the registry, NOT a flag
                    // Dig outranks stockpile because DesignateDigCommand only marks Debris walls and
                    // DesignateStockpileCommand only marks walkable tiles, so the two cannot legally
                    // coexist. Deconstruct is LAST: it targets a standing WALL (dig targets Debris,
                    // stockpile targets floor), so it cannot legally share a tile with either flag —
                    // but ranking it last keeps a corrupt-state tile deterministic. The registry is
                    // queried only when something is actually condemned (anyStrip), so the common
                    // strip-free frame never touches it.
                    //
                    // ⚠️ THE CLAUSE "it cannot legally share a tile with either flag" IS FALSE FOR
                    // STOCKPILE, and this comment survives only by accident. `CanDesignate` also
                    // accepts a DEVICE (`DeconstructKind.Device`), every device kind is non-blocking,
                    // so a condemned device stands on a WALKABLE tile that `DesignateStockpileCommand`
                    // will happily zone — two ordinary clicks. The ranking below then chooses
                    // Stockpile(16) for that tile and PASS 4 SILENTLY REPAIRS IT, re-applying
                    // GlyphColor.Deconstruct unconditionally a hundred lines down. So the frame is
                    // right and the reason written here is not; whoever relies on this precedence
                    // must know that pass 4, not this block, is what decides a condemned device.
                    // It is left ranked as-is deliberately — reordering it would move the projection,
                    // and therefore every golden and pin, for no visible gain. The `marks` wire
                    // channel, which has no pass 4 to save it, ranks strip ABOVE stockpile and says
                    // why (hosts/web/WireFormat.Marks.cs). Copying this block without pass 4 shipped
                    // exactly one live regression; do not copy it again.
                    byte flags = level.Flags[i];
                    if ((flags & (byte)TileFlags.Designated) != 0) fg = GlyphColor.Designate;
                    else if ((flags & (byte)TileFlags.Stockpile) != 0) fg = GlyphColor.Stockpile;
                    else if (anyStrip && strip.TryGet(new Int3(x, y, z), out _)) fg = GlyphColor.Deconstruct;

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
                // A CONDEMNED DEVICE KEEPS ITS GLYPH AND LOSES ITS COLOUR. Pass 1 already wrote
                // GlyphColor.Deconstruct into this tile's fg; the line above has just overwritten it
                // with the device's own colour, and that overwrite is the whole of the bug the owner
                // reported three times — a strip order on a desk/bed/locker registered, was serviced,
                // and NEVER reached the client, so it was indistinguishable from a broken verb
                // (docs/HANDOVER.md §4g; §4b recorded it as cosmetic, which it was not).
                //
                // Recolouring rather than re-glyphing is deliberate and matches the wall emitter in
                // pass 1: a designation says "this is condemned", not "this is no longer a desk". The
                // player must still recognise what they condemned, and `mark-overlay.js` draws the
                // amber ring + ✕ from the fg byte alone, so the glyph is free to stay itself.
                //
                // The Dim/attr layer is deliberately KEPT: an unpowered condemned machine is still
                // unpowered, and attr rides in a different field from fg, so nothing is being
                // overwritten twice.
                //
                // `anyStrip` short-circuits before the registry probe, so a ship with nothing
                // condemned — the overwhelmingly common frame — pays one bool test per device and no
                // lookup at all. `p` is the device's own Int3 struct, already in hand: no allocation
                // is added to this per-visible-tile loop. The registry itself was resolved ONCE at
                // Simulation construction (`Simulation.Deconstruct`), never per device.
                //
                // KNOWN-BETTER FIX, deliberately not taken here: a `strips` wire channel mirroring
                // `DeconstructSystem.Pending`, built like `hosts/web/WireFormat.Zones.cs`. It would
                // also survive pass 3 (a ground item landing on a condemned device's tile) and pass 5
                // (a crew member standing on a condemned tile), neither of which this fg-byte route
                // can. It is a bigger package and touches the `WireFormat` spine file; this is the
                // smallest change that makes the reported bug go away. See HANDOVER §4g.
                if (anyStrip && strip.TryGet(p, out _)) fg = GlyphColor.Deconstruct;
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

        /// <summary>Door and cryo-pod glyphs are chosen by state; every other kind uses its rest
        /// glyph. Purely a read of <see cref="Device"/> state — no mutation, per the projection
        /// invariant.</summary>
        private static char DeviceGlyph(Device device)
        {
            if (device.Kind == DeviceKind.Door)
            {
                if (device.IsLocked) return Glyphs.DoorLocked;
                return device.IsOpen ? Glyphs.DoorOpen : Glyphs.DoorClosed;
            }
            // The wreck start (W3): an OPEN capsule and an OCCUPIED one are different objects to the
            // player and the warm set ships a separate piece for each. `CryoPodClosed` is also the
            // ForDevice arm, so only `CryoPodOpen` is genuinely an override — but both are written
            // here rather than falling through, so the state rule reads in one place.
            if (device.Kind == DeviceKind.CryoPod)
                return device.IsOpen ? Glyphs.CryoPodOpen : Glyphs.CryoPodClosed;
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
