using System;
using System.Runtime.InteropServices;

namespace Perilune.Sim
{
    /// <summary>
    /// The spatial truth: a stack of z-levels. All mutation goes through setters that
    /// keep Flags coherent.
    ///
    /// Every tile carries a floor id, a wall id (0 = none), derived flags and a room id,
    /// stored as parallel flat arrays per <see cref="ZLevel"/>. Walls are their own
    /// TILES here, not edges between tiles — which is why a 1-tile-thick partition
    /// occupies a grid cell, why <see cref="RoomState"/> floods around walls rather
    /// than testing edges, and why "adjacent to void" is a meaningful hull test.
    ///
    /// Contract: <see cref="TileFlags.Walkable"/> and <see cref="TileFlags.BlocksGas"/>
    /// are DERIVED — recomputed from the tile defs on every floor/wall write and never
    /// settable by hand. Everything else in TileFlags (HasDevice, Designated, Stockpile,
    /// Explored, Scenery) is authoritative, owned by other systems, and preserved
    /// verbatim across those writes. Preservation cuts both ways: because SetWall keeps
    /// Designated, JobSystem has to clear that flag EXPLICITLY when a dig completes,
    /// or the freshly cleared tile would still read as a standing order.
    ///
    /// This class is pure geometry: no ticking, no events, no SimDefs — though
    /// <see cref="RecomputeFlags"/> does read the compiled <see cref="TileDefs"/> table
    /// to derive Walkable/BlocksGas. Room ids live here but are owned and rewritten by
    /// <see cref="RoomState"/>. Four of <see cref="ZLevel"/>'s five arrays (Floor, Wall,
    /// Flags, RoomId) are folded into the determinism hash (<see cref="HashInto"/>), so
    /// any tile write is hash-visible — including a fog reveal; the fifth, RegionId, is
    /// derived and currently neither saved nor hashed.
    ///
    /// Bounds are the CALLER's job: every accessor indexes directly, so callers gate on
    /// <see cref="InBounds"/> first. Getting that wrong fails in two different ways — a
    /// bad Z throws on the Levels lookup, and a bad X or Y goes through
    /// <c>ZLevel.Index</c>, a bare <c>y * Width + x</c> over a Width*Height array, where
    /// the outcome depends on where the arithmetic lands. If the computed index leaves
    /// the array it THROWS (<c>y == Height</c>, the classic off-by-one; or
    /// <c>x = -1, y = 0</c> → index −1). If it stays in range it does NOT throw and
    /// silently aliases into the neighbouring row. Those silent wrong-tile reads are the
    /// failure mode to watch for.
    /// </summary>
    public sealed class World
    {
        public readonly int Width, Height, Depth;
        public readonly ZLevel[] Levels;

        public World(int width, int height, int depth)
        {
            if (width <= 0 || height <= 0 || depth <= 0) throw new ArgumentOutOfRangeException();
            Width = width; Height = height; Depth = depth;
            Levels = new ZLevel[depth];
            for (int z = 0; z < depth; z++) Levels[z] = new ZLevel(width, height);
        }

        public bool InBounds(Int3 p) =>
            p.X >= 0 && p.X < Width && p.Y >= 0 && p.Y < Height && p.Z >= 0 && p.Z < Depth;

        public ushort GetFloor(Int3 p) => Levels[p.Z].Floor[Levels[p.Z].Index(p.X, p.Y)];
        public ushort GetWall(Int3 p) => Levels[p.Z].Wall[Levels[p.Z].Index(p.X, p.Y)];
        public TileFlags GetFlags(Int3 p) => (TileFlags)Levels[p.Z].Flags[Levels[p.Z].Index(p.X, p.Y)];

        public void SetFloor(Int3 p, ushort tileDefId)
        {
            var level = Levels[p.Z];
            level.Floor[level.Index(p.X, p.Y)] = tileDefId;
            RecomputeFlags(level, p.X, p.Y);
        }

        public void SetWall(Int3 p, ushort tileDefId)
        {
            var level = Levels[p.Z];
            level.Wall[level.Index(p.X, p.Y)] = tileDefId;
            RecomputeFlags(level, p.X, p.Y);
        }

        /// <summary>Set/clear a NON-derived flag. Nothing stops a caller passing
        /// Walkable or BlocksGas, but the next floor/wall write on that tile silently
        /// overwrites it — those two belong to <see cref="RecomputeFlags"/> alone.</summary>
        public void SetFlag(Int3 p, TileFlags flag, bool on)
        {
            var level = Levels[p.Z];
            int i = level.Index(p.X, p.Y);
            if (on) level.Flags[i] |= (byte)flag;
            else level.Flags[i] &= (byte)~flag;
        }

        /// <summary>
        /// Re-derive the two computed flags for one tile. Walkable requires a walkable
        /// floor AND an empty wall slot; BlocksGas is the OR of the wall and floor defs.
        /// With the shipped tile table only Wall and Debris block gas, so a VOID tile is
        /// unwalkable and gas-PERMEABLE — deliberately: void is what rooms leak into,
        /// and RoomState decides vacuum connectivity by testing for the void floor id
        /// explicitly rather than by this flag.
        /// </summary>
        private static void RecomputeFlags(ZLevel level, int x, int y)
        {
            int i = level.Index(x, y);
            TileDef floor = TileDefs.ById(level.Floor[i]);
            TileDef wall = TileDefs.ById(level.Wall[i]);
            // Preserve every non-derived flag; recompute only Walkable/BlocksGas.
            byte preserved = (byte)(level.Flags[i] & (byte)(
                TileFlags.HasDevice | TileFlags.Designated | TileFlags.Stockpile |
                TileFlags.Explored | TileFlags.Scenery));
            byte derived = 0;
            if (floor.Walkable && level.Wall[i] == 0) derived |= (byte)TileFlags.Walkable;
            if (wall.BlocksGas || floor.BlocksGas) derived |= (byte)TileFlags.BlocksGas;
            level.Flags[i] = (byte)(preserved | derived);
        }

        /// <summary>Chain all tile arrays into the state hash. RoomId is included even
        /// though it is derived — it is saved, and the project rule is that everything
        /// saved is hashed, so a room recompute that lands differently is caught by the
        /// determinism canary rather than by a divergence hours later.</summary>
        public ulong HashInto(ulong h)
        {
            for (int z = 0; z < Depth; z++)
            {
                var level = Levels[z];
                h = XxHash64.Hash(MemoryMarshal.AsBytes((ReadOnlySpan<ushort>)level.Floor), h);
                h = XxHash64.Hash(MemoryMarshal.AsBytes((ReadOnlySpan<ushort>)level.Wall), h);
                h = XxHash64.Hash(level.Flags, h);
                h = XxHash64.Hash(MemoryMarshal.AsBytes((ReadOnlySpan<ushort>)level.RoomId), h);
            }
            return h;
        }
    }
}
