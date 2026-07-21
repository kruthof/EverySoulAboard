using System;
using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Carves a band of rooms along one side of a corridor — the geometry half of
    /// the ship designer. Each room takes its <see cref="RoomProgramme"/> footprint
    /// off the corridor wall (rooms always touch the corridor; leftover band area
    /// stays solid hull mass), gets a door gap + Door device in that wall, and a
    /// typed room anchor at its center. Rooms pack left→right with one wall column
    /// between; a room may pin its door X (hand-tuned layouts, e.g. DeviceLayout
    /// yaw overrides, stay valid), which also pins the room around that door.
    /// Pure function of its inputs — same band spec, same ship, every run.
    /// </summary>
    public static class BandPlanner
    {
        /// <summary>Interior rect of a carved room (inclusive bounds).</summary>
        public readonly struct Rect
        {
            public readonly int X0, Y0, X1, Y1;
            public Rect(int x0, int y0, int x1, int y1) { X0 = x0; Y0 = y0; X1 = x1; Y1 = y1; }
            public int CenterX => (X0 + X1) / 2;
            public int CenterY => (Y0 + Y1) / 2;
        }

        public struct Room
        {
            public string Anchor;
            public RoomType Type;
            public int DoorX;       // -1 = centered on the room
            public string DoorName; // null = "door_" + Anchor
            public bool DoorClosed; // sealed-by-fiction doors (observatory)
        }

        /// <summary>
        /// Carve one band. <paramref name="corridorWallY"/> is the wall row the
        /// rooms attach to; <paramref name="roomsAbove"/> says which side of it the
        /// rooms extend to. Returns anchor → interior rect for the outfitter.
        /// </summary>
        public static Dictionary<string, Rect> Carve(
            GridCanvas deck, ShipPlan plan, int z, int startX, int corridorWallY, bool roomsAbove,
            IReadOnlyList<Room> rooms)
        {
            var rects = new Dictionary<string, Rect>();
            int cursor = startX;
            foreach (var room in rooms)
            {
                var fp = RoomProgramme.Of(room.Type);
                int x0 = room.DoorX >= 0 ? room.DoorX - (fp.Width - 1) / 2 : cursor;
                if (x0 < cursor)
                    throw new ArgumentException(
                        $"band room '{room.Anchor}': pinned door x{room.DoorX} overlaps the previous room");
                int x1 = x0 + fp.Width - 1;
                int y0 = roomsAbove ? corridorWallY - fp.Depth : corridorWallY + 1;
                int y1 = roomsAbove ? corridorWallY - 1 : corridorWallY + fp.Depth;
                deck.FillRect(x0, y0, x1, y1, '.');

                int doorX = room.DoorX >= 0 ? room.DoorX : (x0 + x1) / 2;
                deck.Set(doorX, corridorWallY, '.');
                plan.Devices.Add(new DeviceSpec
                {
                    Kind = DeviceKind.Door,
                    Pos = new Int3(doorX, corridorWallY, z),
                    Name = room.DoorName ?? "door_" + room.Anchor,
                    IsOpen = !room.DoorClosed,
                });

                var rect = new Rect(x0, y0, x1, y1);
                rects[room.Anchor] = rect;
                plan.Rooms.Add(new RoomSpec
                {
                    Anchor = room.Anchor,
                    Type = room.Type,
                    Probe = new Int3(rect.CenterX, rect.CenterY, z),
                });
                cursor = x1 + 2; // one wall column between rooms
            }
            return rects;
        }
    }
}
