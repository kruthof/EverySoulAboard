namespace Perilune.Sim
{
    /// <summary>
    /// One z-level as flat SoA arrays (index = y * Width + x).
    /// Rooms/regions are derived data maintained incrementally by their systems.
    /// </summary>
    public sealed class ZLevel
    {
        public readonly int Width, Height;
        public readonly ushort[] Floor;    // TileDefId, 0 = void/rock ceiling gap
        public readonly ushort[] Wall;     // TileDefId, 0 = none
        public readonly byte[] Flags;      // TileFlags
        public readonly ushort[] RoomId;   // 0 = outside/vacuum
        public readonly ushort[] RegionId; // pathfinding region
        public readonly byte[] Material;   // wall/floor material variant id, 0 = default

        public ZLevel(int width, int height)
        {
            Width = width; Height = height;
            int n = width * height;
            Floor = new ushort[n];
            Wall = new ushort[n];
            Flags = new byte[n];
            RoomId = new ushort[n];
            RegionId = new ushort[n];
            Material = new byte[n];
        }

        public int Index(int x, int y) => y * Width + x;
    }
}
