using Perilune.Sim;

namespace Perilune.Glyph
{
    /// <summary>
    /// The light projection: a pure, read-only snapshot of one deck's per-tile
    /// illumination into a byte grid. Like <see cref="GlyphMapper"/> it reads sim
    /// state and NEVER mutates it (no room recompute, no command enqueue), so
    /// <c>sim.StateHash()</c> is byte-identical before and after Project. The fog
    /// gate is FIRST: an unexplored tile is always <see cref="LightState.Unknown"/>,
    /// leaking nothing about the dark.
    ///
    /// v0 semantics (per tile, after the fog gate):
    ///   - a tile whose room contains at least one POWERED Light device -> Powered(4)
    ///   - a tile whose room has a Light on a power network but currently unpowered
    ///     (its Comfort tier was shed) -> Brownout(3). Brownout is not cleanly
    ///     readable from PowerSystem (private per-network state), so it is derived
    ///     from device Powered + NetworkId: a Light on a network yet not powered is,
    ///     by the power balance, a shed (browned-out) light.
    ///   - any other explored tile (no functioning light, roomless, vacuum, door) -> Dead(1)
    /// Emergency(2) is reserved (an emergency-lighting pass may emit it later) and is
    /// never produced by v0. The vocabulary is append-only.
    /// </summary>
    public static class LightMapper
    {
        /// <summary>Project deck <paramref name="deck"/> into <paramref name="into"/> (row-major,
        /// index = y*world.Width + x). Writes min(into.Length, w*h) tiles; the caller sizes the
        /// buffer to world.Width*world.Height.</summary>
        public static void Project(Simulation sim, int deck, byte[] into)
        {
            var world = sim.World;
            var level = world.Levels[deck];
            var rooms = sim.Rooms.Rooms;
            int w = world.Width, h = world.Height;

            // --- Per-room light aggregate from Light devices on this deck. ---
            // roomLight[roomId]: highest priority seen (Powered(4) > Brownout(3) > none(0)).
            byte[] roomLight = rooms.Count > 0 ? new byte[rooms.Count] : System.Array.Empty<byte>();
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];
                if (device.Kind != DeviceKind.Light || device.Pos.Z != deck) continue;
                if (device.Pos.X < 0 || device.Pos.Y < 0 || device.Pos.X >= w || device.Pos.Y >= h) continue;
                ushort roomId = level.RoomId[level.Index(device.Pos.X, device.Pos.Y)];
                if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) continue;

                byte contribution;
                if (device.Powered) contribution = (byte)LightState.Powered;      // 4
                else if (device.NetworkId != 0) contribution = (byte)LightState.Brownout; // 3: on-grid but shed
                else contribution = 0;                                            // off-grid: no light
                if (contribution > roomLight[roomId]) roomLight[roomId] = contribution;
            }

            // --- Per-tile state, fog-gated first (row-major, index = y*w + x). ---
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int outIdx = y * w + x;
                    if (outIdx >= into.Length) return;
                    int i = level.Index(x, y);
                    if ((level.Flags[i] & (byte)TileFlags.Explored) == 0)
                    {
                        into[outIdx] = (byte)LightState.Unknown; // FOG GATE: nothing seen here
                        continue;
                    }
                    ushort roomId = level.RoomId[i];
                    if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count)
                    {
                        into[outIdx] = (byte)LightState.Dead; // explored but roomless / vacuum / door
                        continue;
                    }
                    byte state = roomLight[roomId];
                    into[outIdx] = state != 0 ? state : (byte)LightState.Dead;
                }
            }
        }
    }

    /// <summary>Append-only per-tile light vocabulary (see <see cref="LightMapper"/>).</summary>
    public enum LightState : byte
    {
        Unknown = 0,   // fog / unexplored — leaks nothing
        Dead = 1,      // explored, no functioning light
        Emergency = 2, // reserved (emergency lighting) — not emitted in v0
        Brownout = 3,  // room light on a shed (browned-out) network
        Powered = 4,   // room has at least one powered Light
    }
}
