using System;
using System.Runtime.InteropServices;

namespace Moonbase.Sim
{
    /// <summary>The spatial truth: a stack of z-levels. All mutation goes through setters that keep Flags coherent.</summary>
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

        public void SetFlag(Int3 p, TileFlags flag, bool on)
        {
            var level = Levels[p.Z];
            int i = level.Index(p.X, p.Y);
            if (on) level.Flags[i] |= (byte)flag;
            else level.Flags[i] &= (byte)~flag;
        }

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

        /// <summary>Chain all tile arrays into the state hash.</summary>
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
