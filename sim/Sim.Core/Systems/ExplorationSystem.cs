namespace Perilune.Sim
{
    /// <summary>
    /// Fog of war v0 (GDD 4.14), 1 Hz: tiles start unexplored; living citizens with
    /// <see cref="Citizen.RevealsFog"/> reveal their surroundings once per second.
    /// Reveal rule per tile within radius (same deck only — fog never propagates
    /// through a ladder): visible if it shares the citizen's room, or is a gas-blocking
    /// boundary (walls, debris) or a door tile — so you see your compartment and its
    /// shell, but never into sealed neighbors.
    ///
    /// The reach is `content/core/SimDefs/exploration.def [exploration] radius`, in
    /// TILES and CHEBYSHEV (the scan is a clamped square box, not a disc), sized at 8
    /// to be about one compartment.
    ///
    /// Ratchet, not a visibility test: <see cref="TileFlags.Explored"/> is only ever
    /// set, never cleared. Fog is memory of having been somewhere, not line of sight,
    /// so a compartment stays drawn after the crew leaves and after it decompresses.
    /// The flag lives in the tile grid — preserved across <c>World.SetFloor/SetWall</c>
    /// (RecomputeFlags keeps it), saved verbatim in the tile chapter, and hashed by
    /// <c>World.HashInto</c>. This system therefore holds no state of its own and is
    /// NOT an <see cref="IStatefulSystem"/>.
    ///
    /// Nothing here gates rendering: the fog GATE is applied by the projection
    /// (GlyphMapper), which is pure and read-only. This system only decides what has
    /// been seen.
    ///
    /// Ordering/allocation: registered late (after Needs and Social), so this second's
    /// moves and deaths are already settled when it runs; citizens are walked in store
    /// order; no RNG; the scan is index arithmetic over the raw tile arrays and
    /// allocates nothing.
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
                // The room to match against. A citizen standing ON a door tile carries
                // DoorMarker here, which matches no room's interior — so mid-doorway
                // they reveal only boundary tiles (walls and other doors) and neither
                // compartment. One second of a walk-through; a stopped citizen in a
                // doorway reveals nothing new at all.
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
                        if ((level.Flags[idx] & (byte)TileFlags.Explored) != 0) continue; // already known: the common case
                        if (level.Floor[idx] == TileDefs.Void) continue; // open space is never "explored"

                        ushort tileRoom = level.RoomId[idx];
                        // Boundaries are revealed unconditionally within the radius: you
                        // can see the wall or door that encloses you without seeing past
                        // it. That is what stops the fog from following gas topology into
                        // a sealed neighbour, while still drawing the compartment's shell.
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
