using System;

namespace Perilune.Sim
{
    /// <summary>Tile coordinate: x/y within a z-level, z = level index.</summary>
    public readonly struct Int3 : IEquatable<Int3>
    {
        public readonly int X, Y, Z;

        public Int3(int x, int y, int z)
        {
            X = x; Y = y; Z = z;
        }

        public static Int3 operator +(Int3 a, Int3 b) => new Int3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Int3 operator -(Int3 a, Int3 b) => new Int3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static bool operator ==(Int3 a, Int3 b) => a.X == b.X && a.Y == b.Y && a.Z == b.Z;
        public static bool operator !=(Int3 a, Int3 b) => !(a == b);

        /// <summary>The canonical 4-neighborhood, order +x, -x, +y, -y — shared by pathing,
        /// room flood, atmosphere edges, power nets and dig adjacency so they can never
        /// disagree about adjacency or traversal order.</summary>
        public static Int3 Neighbor4(Int3 p, int i) => i switch
        {
            0 => new Int3(p.X + 1, p.Y, p.Z),
            1 => new Int3(p.X - 1, p.Y, p.Z),
            2 => new Int3(p.X, p.Y + 1, p.Z),
            _ => new Int3(p.X, p.Y - 1, p.Z),
        };

        public static int Manhattan(Int3 a, Int3 b) =>
            System.Math.Abs(a.X - b.X) + System.Math.Abs(a.Y - b.Y) + System.Math.Abs(a.Z - b.Z);

        /// <summary>Same-deck 4-adjacency (the only adjacency the sim uses on foot).</summary>
        public static bool IsAdjacent4(Int3 a, Int3 b) =>
            a.Z == b.Z && System.Math.Abs(a.X - b.X) + System.Math.Abs(a.Y - b.Y) == 1;

        public bool Equals(Int3 other) => this == other;
        public override bool Equals(object obj) => obj is Int3 other && this == other;
        public override int GetHashCode() => X * 73856093 ^ Y * 19349663 ^ Z * 83492791;
        public override string ToString() => $"({X},{Y},{Z})";
    }
}
