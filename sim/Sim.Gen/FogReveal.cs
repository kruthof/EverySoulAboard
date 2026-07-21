using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Boot-time fog seed, shared by every host (Unity view and headless clients).
    /// Engine-free so the terminal/web skins reveal exactly what the game does.
    /// </summary>
    public static class FogReveal
    {
        /// <summary>
        /// One-time fog reveal of everything the crew can currently reach (through open
        /// doors and ladders). Sealed compartments stay dark until entered — that IS
        /// the fog of war, scoped to genuinely-unknown territory rather than your own
        /// lit ship. Walls/doors bounding a revealed room are revealed too so the
        /// cross-section reads.
        /// </summary>
        public static void RevealReachable(Simulation sim)
        {
            var world = sim.World;
            sim.Rooms.RecomputeIfDirty(sim);
            var visited = new System.Collections.Generic.HashSet<Int3>();
            var seenRooms = new System.Collections.Generic.HashSet<ushort>();
            var queue = new System.Collections.Generic.Queue<Int3>();

            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                // Non-revealing citizens (Reyes, sealed in the observatory) must not
                // seed the boot reveal either — his cabin stays dark until you reach
                // him, which is exactly what the "Find the crew" objective tracks.
                if (!citizens[i].RevealsFog) continue;
                if (visited.Add(citizens[i].Pos)) queue.Enqueue(citizens[i].Pos);
            }

            while (queue.Count > 0)
            {
                var p = queue.Dequeue();
                var lvl = world.Levels[p.Z];
                ushort rid = lvl.RoomId[lvl.Index(p.X, p.Y)];
                if (rid != 0 && rid != RoomState.DoorMarker) seenRooms.Add(rid);

                for (int n = 0; n < 4; n++)
                {
                    var q = Int3.Neighbor4(p, n);
                    if (world.InBounds(q) && sim.IsWalkable(q) && visited.Add(q)) queue.Enqueue(q);
                }
                // Ladder z-links (mirror PathService).
                if (sim.TryGetDeviceAt(p, out var here) && here.Kind == DeviceKind.Ladder && p.Z + 1 < world.Depth)
                {
                    var up = new Int3(p.X, p.Y, p.Z + 1);
                    if (sim.IsWalkable(up) && visited.Add(up)) queue.Enqueue(up);
                }
                if (p.Z > 0 && sim.TryGetDeviceAt(new Int3(p.X, p.Y, p.Z - 1), out var below) && below.Kind == DeviceKind.Ladder)
                {
                    var down = new Int3(p.X, p.Y, p.Z - 1);
                    if (sim.IsWalkable(down) && visited.Add(down)) queue.Enqueue(down);
                }
            }

            // Reveal every tile of a seen room, plus the walls/doors that bound it.
            for (int z = 0; z < world.Depth; z++)
            {
                var lvl = world.Levels[z];
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        int idx = lvl.Index(x, y);
                        ushort rid = lvl.RoomId[idx];
                        bool inSeenRoom = (rid != 0 && rid != RoomState.DoorMarker && seenRooms.Contains(rid));
                        bool boundsSeen = false;
                        if (!inSeenRoom)
                            for (int n = 0; n < 4 && !boundsSeen; n++)
                            {
                                var q = Int3.Neighbor4(new Int3(x, y, z), n);
                                if (!world.InBounds(q)) continue;
                                var ql = world.Levels[q.Z];
                                ushort qr = ql.RoomId[ql.Index(q.X, q.Y)];
                                if (qr != 0 && qr != RoomState.DoorMarker && seenRooms.Contains(qr)) boundsSeen = true;
                            }
                        if (inSeenRoom || boundsSeen)
                            lvl.Flags[idx] |= (byte)TileFlags.Explored;
                    }
            }
        }
    }
}
