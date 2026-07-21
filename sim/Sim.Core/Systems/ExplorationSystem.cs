namespace Moonbase.Sim
{
    /// <summary>
    /// Fog of war v0 (GDD 4.14): tiles start unexplored; living citizens reveal their
    /// surroundings once per second. Reveal rule per tile within radius (same deck):
    /// visible if it shares the citizen's room, or is a gas-blocking boundary (walls,
    /// debris) or a door tile — so you see your compartment and its shell, but never
    /// into sealed neighbors. Explored is a tile flag: saved verbatim, never unset.
    /// </summary>
    public sealed class ExplorationSystem : ISimSystem
    {
        public string Name => "Exploration";
        public int IntervalTicks => 10; // 1 Hz

        // Radius (8, Chebyshev, ~one compartment) now lives in sim.Defs.Exploration
        // (SimDefs.Default reproduces it). Tick reads it each pass so parallel sims with
        // different defs never cross-talk.

        public void Tick(Simulation sim)
        {
            var world = sim.World;
            var citizens = sim.Citizens.Items;
            int radius = sim.Defs.Exploration.Radius;
            int newlyRevealed = 0;

            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead || !citizen.RevealsFog) continue;
                var pos = citizen.Pos;
                var level = world.Levels[pos.Z];
                ushort citizenRoom = level.RoomId[level.Index(pos.X, pos.Y)];

                int x0 = pos.X - radius < 0 ? 0 : pos.X - radius;
                int x1 = pos.X + radius >= world.Width ? world.Width - 1 : pos.X + radius;
                int y0 = pos.Y - radius < 0 ? 0 : pos.Y - radius;
                int y1 = pos.Y + radius >= world.Height ? world.Height - 1 : pos.Y + radius;

                for (int y = y0; y <= y1; y++)
                {
                    int row = y * world.Width;
                    for (int x = x0; x <= x1; x++)
                    {
                        int idx = row + x;
                        if ((level.Flags[idx] & (byte)TileFlags.Explored) != 0) continue;
                        if (level.Floor[idx] == TileDefs.Void) continue;

                        ushort tileRoom = level.RoomId[idx];
                        bool boundary = (level.Flags[idx] & (byte)TileFlags.BlocksGas) != 0
                                        || tileRoom == RoomState.DoorMarker;
                        if (!boundary && tileRoom != citizenRoom) continue;

                        level.Flags[idx] |= (byte)TileFlags.Explored;
                        newlyRevealed++;
                    }
                }
            }

            // One dedicated event per reveal pass — never overload RoomsChangedEvent
            // (rooms did not change; consumers keying on topology must not fire).
            if (newlyRevealed > 0)
                sim.Events.Publish(new FogRevealedEvent { NewlyRevealed = newlyRevealed });
        }
    }
}
