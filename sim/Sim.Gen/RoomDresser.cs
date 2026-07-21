using System;
using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Rule-driven room furnishing — the "dressing" half of the ship generator.
    /// Given a complete <see cref="ShipPlan"/> (tiles carved, doors/devices/crew
    /// placed), Dress appends furniture DeviceSpecs per typed room using geometric
    /// placement rules, so EVERY ship — authored or generated — is furnished by the
    /// same logic and none is ever hand-dressed (the institutional rule from the
    /// third pivot: hand-dressing failed to converge; automation lives in
    /// sim-validatable domains).
    ///
    /// The rules that make an arrangement read "natural":
    ///  - beds/med-beds/cabinets hug walls (corners preferred for beds), placed as
    ///    far from the door as the room allows — you sleep away from traffic;
    ///  - tables sit on the room's center line, spread evenly, chairs pulled up
    ///    on opposite sides;
    ///  - nothing lands on another device, an item spawn, a crew spawn, a door
    ///    tile, or a door's 4-neighbour apron (doors keep a clear approach);
    ///  - placement is a PURE function of the plan (scan-order tie-breaks, no
    ///    RNG), so a plan dresses identically on every run — determinism is free.
    ///
    /// Furniture kinds are inert (draw/heat/wear 0 in the machine table); this
    /// pass is layout only. Behavior (rest, meals, treatment) hooks in later.
    /// </summary>
    public static class RoomDresser
    {
        /// <summary>Furnish every typed room of the plan in room-list order.</summary>
        public static void Dress(ShipPlan plan)
        {
            var occupied = BuildOccupancy(plan);
            var doorTiles = BuildDoorSet(plan);

            foreach (var room in plan.Rooms)
            {
                var region = FloodRegion(plan, room.Probe, doorTiles);
                if (region.Count == 0) continue;
                var ctx = new RoomCtx(plan, room, region, occupied, doorTiles);
                switch (room.Type)
                {
                    case RoomType.Quarters: DressQuarters(ctx); break;
                    case RoomType.Mess: DressTables(ctx, maxTables: 3, areaPerTable: 16); break;
                    case RoomType.Commons: DressTables(ctx, maxTables: 2, areaPerTable: 24); PlacePlant(ctx); break;
                    case RoomType.Command: DressCommand(ctx); break;
                    case RoomType.Observatory: DressTables(ctx, maxTables: 1, areaPerTable: 1); PlacePlant(ctx); break;
                    case RoomType.Medbay: DressMedbay(ctx); break;
                    case RoomType.Bridge: DressBridge(ctx); break;
                    // Machine rooms (reactor, engineering, hydro, …) and corridors
                    // are furnished by their devices, not furniture.
                }
            }
        }

        // ------------------------------------------------------------ room rules

        /// <summary>A lived-in cabin: bunk against the wall farthest from the door
        /// (corner preferred) with a chair pulled beside it; wardrobe locker by the
        /// door, personal desk on another wall, and a plant in a leftover corner.
        /// Each step degrades gracefully when the room runs out of free tiles.</summary>
        private static void DressQuarters(RoomCtx c)
        {
            var bed = BestWallTile(c, preferCorner: true);
            if (bed == null) return;
            c.Place(DeviceKind.Bed, bed.Value, "bed");
            var chair = BestNeighbor(c, bed.Value, preferInterior: true);
            if (chair != null) c.Place(DeviceKind.Chair, chair.Value, "chair");
            // Lockers and desks have a painted FRONT (3/4-view art, non-rotatable):
            // they only read correctly standing against the north wall, front south.
            var locker = BestWallTile(c, preferCorner: false, nearDoor: true, northWall: true);
            if (locker != null) c.Place(DeviceKind.Locker, locker.Value, "locker");
            var desk = BestWallTile(c, preferCorner: false, northWall: true);
            if (desk != null) c.Place(DeviceKind.Desk, desk.Value, "desk");
            PlacePlant(c);
        }

        /// <summary>A touch of life: one potted plant in a free wall corner.</summary>
        private static void PlacePlant(RoomCtx c)
        {
            var spot = BestWallTile(c, preferCorner: true);
            if (spot != null) c.Place(DeviceKind.PlantPot, spot.Value, "plant");
        }

        /// <summary>Tables on the room's center row, spread evenly across its width,
        /// chairs pulled up above and below each.</summary>
        private static void DressTables(RoomCtx c, int maxTables, int areaPerTable)
        {
            int count = Math.Max(1, Math.Min(maxTables, c.Region.Count / Math.Max(1, areaPerTable)));
            int midY = (c.MinY + c.MaxY) / 2;
            int span = c.MaxX - c.MinX + 1;
            for (int i = 0; i < count; i++)
            {
                int wantX = c.MinX + span * (i + 1) / (count + 1);
                var table = SnapFree(c, wantX, midY, radius: 2);
                if (table == null) continue;
                c.Place(DeviceKind.Table, table.Value, "table");
                var t = table.Value;
                var up = new Int3(t.X, t.Y - 1, t.Z);
                var down = new Int3(t.X, t.Y + 1, t.Z);
                if (c.IsFree(up)) c.Place(DeviceKind.Chair, up, "chair");
                if (c.IsFree(down)) c.Place(DeviceKind.Chair, down, "chair");
            }
        }

        /// <summary>Command: one planning table dead center, chairs on all four sides.</summary>
        private static void DressCommand(RoomCtx c)
        {
            var table = SnapFree(c, (c.MinX + c.MaxX) / 2, (c.MinY + c.MaxY) / 2, radius: 2);
            if (table == null) return;
            c.Place(DeviceKind.Table, table.Value, "table");
            var t = table.Value;
            foreach (var n in Neighbors(t))
                if (c.IsFree(n)) c.Place(DeviceKind.Chair, n, "chair");
        }

        /// <summary>Medbay: clinical beds spaced along the wall row farthest from the
        /// door, supply cabinet in a wall corner near the door, one visitor chair.</summary>
        private static void DressMedbay(RoomCtx c)
        {
            // Bed row: wall-adjacent tiles on the bbox edge row with the greater
            // door distance (patients rest away from traffic).
            int rowTop = c.MinY, rowBot = c.MaxY;
            int row = c.DoorDist(new Int3(c.CenterX, rowTop, c.Z)) >= c.DoorDist(new Int3(c.CenterX, rowBot, c.Z)) ? rowTop : rowBot;
            int placed = 0;
            for (int x = c.MinX + 1; x <= c.MaxX - 1 && placed < 3; x += 3)
            {
                var p = new Int3(x, row, c.Z);
                if (!c.IsFree(p) || !c.IsWallAdjacent(p)) continue;
                c.Place(DeviceKind.MedBed, p, "medbed");
                placed++;
            }
            var cab = BestWallTile(c, preferCorner: true, nearDoor: true);
            if (cab != null) c.Place(DeviceKind.MedCabinet, cab.Value, "medcab");
            // One visitor chair next to the first med-bed's interior side.
            if (placed > 0)
            {
                var first = c.Placed[0].Pos;
                var chair = BestNeighbor(c, first, preferInterior: true);
                if (chair != null) c.Place(DeviceKind.Chair, chair.Value, "chair");
            }
        }

        /// <summary>Bridge: two flight chairs facing the fore (min-x) wall.</summary>
        private static void DressBridge(RoomCtx c)
        {
            int midY = (c.MinY + c.MaxY) / 2;
            foreach (int y in new[] { midY - 1, midY + 1 })
            {
                var p = SnapFree(c, c.MinX, y, radius: 1);
                if (p != null && c.IsWallAdjacent(p.Value)) c.Place(DeviceKind.Chair, p.Value, "chair");
            }
        }

        // ------------------------------------------------------- placement helpers

        /// <summary>Best free wall-adjacent tile: corners (two wall neighbours) first,
        /// then door distance (far by default, near for supply cabinets), then scan
        /// order. <paramref name="northWall"/> restricts to tiles whose NORTH
        /// neighbour is wall — for furniture with a painted front (lockers, desks)
        /// that only reads correctly standing back-to-north. Null when the room
        /// has no qualifying free tile.</summary>
        private static Int3? BestWallTile(RoomCtx c, bool preferCorner, bool nearDoor = false, bool northWall = false)
        {
            Int3? best = null;
            int bestScore = int.MinValue;
            foreach (var p in c.Region)
            {
                if (!c.IsFree(p) || !c.IsWallAdjacent(p)) continue;
                if (northWall && !c.IsWallAt(p.X, p.Y - 1)) continue;
                int dd = c.DoorDist(p);
                int score = (preferCorner && c.WallNeighborCount(p) >= 2 ? 1000 : 0)
                            + (nearDoor ? -dd : dd);
                if (score > bestScore) { bestScore = score; best = p; }
            }
            return best;
        }

        /// <summary>Free 4-neighbour of an anchor tile; interior (non-wall-adjacent)
        /// neighbours win when asked — a chair sits toward the room, not in the corner.</summary>
        private static Int3? BestNeighbor(RoomCtx c, Int3 anchor, bool preferInterior)
        {
            Int3? best = null;
            int bestScore = int.MinValue;
            foreach (var n in Neighbors(anchor))
            {
                if (!c.IsFree(n)) continue;
                int score = preferInterior && !c.IsWallAdjacent(n) ? 10 : 0;
                if (score > bestScore) { bestScore = score; best = n; }
            }
            return best;
        }

        /// <summary>The free region tile nearest to (x,y) within a Chebyshev radius,
        /// scanning outward ring by ring (deterministic order). Null if none.</summary>
        private static Int3? SnapFree(RoomCtx c, int x, int y, int radius)
        {
            for (int r = 0; r <= radius; r++)
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        var p = new Int3(x + dx, y + dy, c.Z);
                        if (c.IsFree(p)) return p;
                    }
            return null;
        }

        private static IEnumerable<Int3> Neighbors(Int3 p)
        {
            yield return new Int3(p.X, p.Y - 1, p.Z);
            yield return new Int3(p.X - 1, p.Y, p.Z);
            yield return new Int3(p.X + 1, p.Y, p.Z);
            yield return new Int3(p.X, p.Y + 1, p.Z);
        }

        // ------------------------------------------------------------- geometry

        /// <summary>4-directional flood over carved '.' tiles from the room probe,
        /// never entering a door tile — door tiles are the seams BETWEEN rooms, so
        /// the flood is exactly one compartment.</summary>
        private static List<Int3> FloodRegion(ShipPlan plan, Int3 probe, HashSet<Int3> doors)
        {
            var region = new List<Int3>();
            var rows = plan.DeckRows[probe.Z];
            var seen = new HashSet<Int3>();
            var queue = new Queue<Int3>();
            if (At(rows, probe.X, probe.Y) != '.') return region;
            queue.Enqueue(probe);
            seen.Add(probe);
            while (queue.Count > 0)
            {
                var p = queue.Dequeue();
                region.Add(p);
                foreach (var n in Neighbors(p))
                {
                    if (seen.Contains(n) || doors.Contains(n)) continue;
                    if (At(rows, n.X, n.Y) != '.') continue;
                    seen.Add(n);
                    queue.Enqueue(n);
                }
            }
            return region;
        }

        private static char At(string[] rows, int x, int y) =>
            y < 0 || y >= rows.Length || x < 0 || x >= rows[y].Length ? '#' : rows[y][x];

        /// <summary>Tiles no furniture may take: every non-service device (conduits and
        /// pipes are under-floor trays), every item spawn, every crew spawn.</summary>
        private static HashSet<Int3> BuildOccupancy(ShipPlan plan)
        {
            var occ = new HashSet<Int3>();
            foreach (var d in plan.Devices)
                if (d.Kind != DeviceKind.Conduit && d.Kind != DeviceKind.Pipe) occ.Add(d.Pos);
            foreach (var it in plan.Items) occ.Add(it.Pos);
            foreach (var ci in plan.Citizens) occ.Add(ci.Pos);
            return occ;
        }

        private static HashSet<Int3> BuildDoorSet(ShipPlan plan)
        {
            var doors = new HashSet<Int3>();
            foreach (var d in plan.Devices)
                if (d.Kind == DeviceKind.Door) doors.Add(d.Pos);
            return doors;
        }

        // ------------------------------------------------------------- room context

        /// <summary>Per-room working state: region tiles, bbox, occupancy view, the
        /// door-apron keep-clear set, and the furniture placed so far (for naming
        /// and adjacency rules).</summary>
        private sealed class RoomCtx
        {
            public readonly ShipPlan Plan;
            public readonly RoomSpec Spec;
            public readonly List<Int3> Region;
            public readonly int MinX, MaxX, MinY, MaxY, Z;
            public readonly List<DeviceSpec> Placed = new List<DeviceSpec>();

            private readonly HashSet<Int3> _regionSet;
            private readonly HashSet<Int3> _occupied;      // shared across rooms (mutated by Place)
            private readonly HashSet<Int3> _apron;         // door tiles + their 4-neighbours
            private readonly List<Int3> _roomDoors;        // doors on this room's boundary
            private readonly string[] _rows;
            private readonly Dictionary<string, int> _counters = new Dictionary<string, int>();

            public int CenterX => (MinX + MaxX) / 2;

            public RoomCtx(ShipPlan plan, RoomSpec spec, List<Int3> region, HashSet<Int3> occupied, HashSet<Int3> doors)
            {
                Plan = plan;
                Spec = spec;
                Region = region;
                _regionSet = new HashSet<Int3>(region);
                _occupied = occupied;
                _rows = plan.DeckRows[spec.Probe.Z];
                Z = spec.Probe.Z;
                MinX = int.MaxValue; MaxX = int.MinValue; MinY = int.MaxValue; MaxY = int.MinValue;
                foreach (var p in region)
                {
                    if (p.X < MinX) MinX = p.X;
                    if (p.X > MaxX) MaxX = p.X;
                    if (p.Y < MinY) MinY = p.Y;
                    if (p.Y > MaxY) MaxY = p.Y;
                }
                _roomDoors = new List<Int3>();
                _apron = new HashSet<Int3>();
                foreach (var d in doors)
                {
                    if (d.Z != Z) continue;
                    bool touches = false;
                    foreach (var n in Neighbors(d)) if (_regionSet.Contains(n)) { touches = true; break; }
                    if (!touches) continue;
                    _roomDoors.Add(d);
                    _apron.Add(d);
                    foreach (var n in Neighbors(d)) _apron.Add(n);
                }
            }

            public bool IsFree(Int3 p) =>
                _regionSet.Contains(p) && !_occupied.Contains(p) && !_apron.Contains(p);

            public bool IsWallAdjacent(Int3 p) => WallNeighborCount(p) >= 1;

            public bool IsWallAt(int x, int y) => At(_rows, x, y) == '#';

            public int WallNeighborCount(Int3 p)
            {
                int n = 0;
                if (At(_rows, p.X, p.Y - 1) == '#') n++;
                if (At(_rows, p.X - 1, p.Y) == '#') n++;
                if (At(_rows, p.X + 1, p.Y) == '#') n++;
                if (At(_rows, p.X, p.Y + 1) == '#') n++;
                return n;
            }

            /// <summary>Manhattan distance to the nearest of this room's doors
            /// (a windowless inner room without doors scores 0 everywhere).</summary>
            public int DoorDist(Int3 p)
            {
                int best = 0;
                for (int i = 0; i < _roomDoors.Count; i++)
                {
                    int d = Math.Abs(p.X - _roomDoors[i].X) + Math.Abs(p.Y - _roomDoors[i].Y);
                    if (i == 0 || d < best) best = d;
                }
                return best;
            }

            /// <summary>Append the furniture device (stable MOSS-style name
            /// {kind}_{anchor}[_{n}]) and mark its tile occupied.</summary>
            public void Place(DeviceKind kind, Int3 pos, string prefix)
            {
                _counters.TryGetValue(prefix, out int n);
                _counters[prefix] = n + 1;
                string name = n == 0 ? prefix + "_" + Spec.Anchor : prefix + "_" + Spec.Anchor + "_" + (n + 1);
                var spec = new DeviceSpec { Kind = kind, Pos = pos, Name = name };
                Plan.Devices.Add(spec);
                Placed.Add(spec);
                _occupied.Add(pos);
            }
        }
    }
}
