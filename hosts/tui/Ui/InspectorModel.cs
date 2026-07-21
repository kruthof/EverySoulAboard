using System.Collections.Generic;
using System.Globalization;
using Perilune.Sim;

namespace Perilune.Tui.Ui
{
    /// <summary>
    /// Pure "what's under the cursor" reader — turns sim + cursor into the inspector's
    /// text lines, with no layout or colour concerns (ScreenComposer places them). Reads
    /// state only; never mutates the sim, so it is safe to call inside the render path.
    /// Every number is InvariantCulture and fixed in shape so goldens stay stable.
    ///
    /// Layered like the map: terrain, then the room's atmosphere, then any device on the
    /// tile, then any living citizen — the same stacking a player reads top-to-bottom.
    /// </summary>
    public static class InspectorModel
    {
        /// <summary>Build the inspector lines for <paramref name="cursor"/>. When
        /// <paramref name="selectedCitizenId"/> is non-zero, a trailing "selected" line
        /// names the citizen currently taking move orders.</summary>
        public static List<string> Build(Simulation sim, Int3 cursor, uint selectedCitizenId = 0)
        {
            var ic = CultureInfo.InvariantCulture;
            var lines = new List<string>(8);
            lines.Add($"@ {cursor.X.ToString(ic)},{cursor.Y.ToString(ic)},{cursor.Z.ToString(ic)}");

            var world = sim.World;
            if (!world.InBounds(cursor))
            {
                lines.Add("off-map");
                AppendSelection(sim, selectedCitizenId, lines);
                return lines;
            }

            bool explored = (world.GetFlags(cursor) & TileFlags.Explored) != 0;
            if (!explored)
            {
                lines.Add("unexplored");
                AppendSelection(sim, selectedCitizenId, lines);
                return lines;
            }

            lines.Add("tile: " + TerrainName(world, cursor));

            // Room atmosphere (skip vacuum / door markers).
            ushort roomId = sim.Rooms.RoomIdAt(world, cursor);
            var rooms = sim.Rooms.Rooms;
            if (roomId != 0 && roomId != RoomState.DoorMarker && roomId < rooms.Count)
            {
                var room = rooms[roomId];
                double tempC = room.TemperatureK - 273.15;
                lines.Add("room: " + room.PressureKPa.ToString("0.0", ic) + "kPa  "
                          + (room.O2Fraction * 100.0).ToString("0.0", ic) + "%O2");
                lines.Add("      CO2 " + room.CO2Ppm.ToString("0", ic) + "ppm  "
                          + tempC.ToString("0.0", ic) + "C");
            }
            else
            {
                lines.Add("room: vacuum");
            }

            // Device on this tile (first match wins; grid tiles hold at most one).
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Pos.X != cursor.X || d.Pos.Y != cursor.Y || d.Pos.Z != cursor.Z) continue;
                lines.Add("dev: " + d.Kind + "  " + DeviceState(d));
                lines.Add("     cond " + (d.Condition * 100f).ToString("0", ic) + "%  "
                          + (d.Powered ? "powered" : "no-power"));
                break;
            }

            // Living citizen on this tile.
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.Pos.X != cursor.X || c.Pos.Y != cursor.Y || c.Pos.Z != cursor.Z) continue;
                string name = string.IsNullOrEmpty(c.Name) ? ("#" + c.Id.ToString(ic)) : c.Name;
                lines.Add("crew: " + name + (c.Faction != 0 ? " (hostile)" : ""));
                lines.Add("     hp " + (c.Health * 100f).ToString("0", ic) + "%  mood "
                          + c.Mood.ToString("0", ic));
                lines.Add("     hun " + Pct(c.Hunger) + " thi " + Pct(c.Thirst) + " fat " + Pct(c.Fatigue));
                lines.Add("     job " + c.JobKind);
                break;
            }

            AppendSelection(sim, selectedCitizenId, lines);
            return lines;
        }

        private static void AppendSelection(Simulation sim, uint selectedCitizenId, List<string> lines)
        {
            if (selectedCitizenId == 0) return;
            if (!sim.Citizens.TryGet(selectedCitizenId, out var c) || c.Dead) return;
            string name = string.IsNullOrEmpty(c.Name)
                ? ("#" + c.Id.ToString(CultureInfo.InvariantCulture)) : c.Name;
            lines.Add("* selected: " + name);
        }

        private static string TerrainName(World world, Int3 p)
        {
            ushort wall = world.GetWall(p);
            if (wall == TileDefs.Wall) return "wall";
            if (wall == TileDefs.Debris) return "debris";
            ushort floor = world.GetFloor(p);
            if (floor == TileDefs.Floor) return "floor";
            if (floor == TileDefs.Debris) return "debris-floor";
            return "void";
        }

        private static string DeviceState(Device d)
        {
            if (d.Kind == DeviceKind.Door)
                return d.IsLocked ? "locked" : (d.IsOpen ? "open" : "closed");
            return d.IsOpen ? "on" : "off";
        }

        private static string Pct(float f)
        {
            int v = (int)(f * 100f + 0.5f);
            if (v < 0) v = 0; if (v > 100) v = 100;
            return v.ToString(CultureInfo.InvariantCulture) + "%";
        }
    }
}
