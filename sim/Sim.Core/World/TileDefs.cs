using System;

namespace Moonbase.Sim
{
    [Flags]
    public enum TileFlags : byte
    {
        None = 0,
        Walkable = 1 << 0,
        BlocksGas = 1 << 1,
        HasDevice = 1 << 2,
        Designated = 1 << 3,  // clear order on a debris tile
        Stockpile = 1 << 4,   // haul destination zone
        Explored = 1 << 5,    // fog of war: seen at least once (persists in saves)
        Scenery = 1 << 6,     // blocking set-dressing prop occupies the tile (RoomDresser)
    }

    /// <summary>Static tile definition. Ids are stable and saved; never reorder.</summary>
    public readonly struct TileDef
    {
        public readonly ushort Id;
        public readonly string Name;
        public readonly bool Walkable;
        public readonly bool BlocksGas;

        public TileDef(ushort id, string name, bool walkable, bool blocksGas)
        {
            Id = id; Name = name; Walkable = walkable; BlocksGas = blocksGas;
        }
    }

    public static class TileDefs
    {
        public const ushort Void = 0;   // vacuum / not-yet-dug space outside the base shell
        public const ushort Floor = 1;
        public const ushort Wall = 2;
        public const ushort Debris = 3;  // debris-choked/sealed section — clearable (legacy map char R)

        private static readonly TileDef[] Table =
        {
            new TileDef(Void, "void", walkable: false, blocksGas: false),
            new TileDef(Floor, "floor", walkable: true, blocksGas: false),
            new TileDef(Wall, "wall", walkable: false, blocksGas: true),
            new TileDef(Debris, "debris", walkable: false, blocksGas: true),
        };

        public static TileDef ById(ushort id) => Table[id];
        public static int Count => Table.Length;
    }
}
