using System;

namespace Moonbase.Sim
{
    /// <summary>
    /// xxHash64 over byte spans. Used for the determinism canary (Simulation.StateHash):
    /// chain per-array hashes with the previous hash as seed.
    /// </summary>
    public static class XxHash64
    {
        private const ulong Prime1 = 11400714785074694791UL;
        private const ulong Prime2 = 14029467366897019727UL;
        private const ulong Prime3 = 1609587929392839161UL;
        private const ulong Prime4 = 9650029242287828579UL;
        private const ulong Prime5 = 2870177450012600261UL;

        public static ulong Hash(ReadOnlySpan<byte> data, ulong seed = 0)
        {
            int len = data.Length;
            int offset = 0;
            ulong h;

            if (len >= 32)
            {
                ulong v1 = seed + Prime1 + Prime2;
                ulong v2 = seed + Prime2;
                ulong v3 = seed;
                ulong v4 = seed - Prime1;

                while (len - offset >= 32)
                {
                    v1 = Round(v1, ReadULong(data, offset));
                    v2 = Round(v2, ReadULong(data, offset + 8));
                    v3 = Round(v3, ReadULong(data, offset + 16));
                    v4 = Round(v4, ReadULong(data, offset + 24));
                    offset += 32;
                }

                h = RotL(v1, 1) + RotL(v2, 7) + RotL(v3, 12) + RotL(v4, 18);
                h = MergeRound(h, v1);
                h = MergeRound(h, v2);
                h = MergeRound(h, v3);
                h = MergeRound(h, v4);
            }
            else
            {
                h = seed + Prime5;
            }

            h += (ulong)data.Length;

            while (len - offset >= 8)
            {
                h ^= Round(0, ReadULong(data, offset));
                h = RotL(h, 27) * Prime1 + Prime4;
                offset += 8;
            }

            if (len - offset >= 4)
            {
                h ^= ReadUInt(data, offset) * Prime1;
                h = RotL(h, 23) * Prime2 + Prime3;
                offset += 4;
            }

            while (offset < len)
            {
                h ^= data[offset] * Prime5;
                h = RotL(h, 11) * Prime1;
                offset++;
            }

            h ^= h >> 33;
            h *= Prime2;
            h ^= h >> 29;
            h *= Prime3;
            h ^= h >> 32;
            return h;
        }

        /// <summary>Fold a float's exact bits into the hash — use for every float field of
        /// canonical state so "add field → add one Combine call" stays mechanical.</summary>
        public static ulong Combine(ulong accumulator, float value) =>
            Combine(accumulator, (ulong)(uint)BitConverter.SingleToInt32Bits(value));

        public static ulong Combine(ulong accumulator, double value) =>
            Combine(accumulator, (ulong)BitConverter.DoubleToInt64Bits(value));

        /// <summary>Hash a single 64-bit value into an accumulator (for scalars like tick count).</summary>
        public static ulong Combine(ulong accumulator, ulong value)
        {
            Span<byte> buf = stackalloc byte[8];
            for (int i = 0; i < 8; i++) buf[i] = (byte)(value >> (i * 8));
            return Hash(buf, accumulator);
        }

        private static ulong Round(ulong acc, ulong input)
        {
            acc += input * Prime2;
            acc = RotL(acc, 31);
            acc *= Prime1;
            return acc;
        }

        private static ulong MergeRound(ulong acc, ulong val)
        {
            val = Round(0, val);
            acc ^= val;
            acc = acc * Prime1 + Prime4;
            return acc;
        }

        private static ulong RotL(ulong x, int r) => (x << r) | (x >> (64 - r));

        private static ulong ReadULong(ReadOnlySpan<byte> data, int offset)
        {
            ulong v = 0;
            for (int i = 0; i < 8; i++) v |= (ulong)data[offset + i] << (i * 8);
            return v;
        }

        private static uint ReadUInt(ReadOnlySpan<byte> data, int offset)
        {
            uint v = 0;
            for (int i = 0; i < 4; i++) v |= (uint)data[offset + i] << (i * 8);
            return v;
        }
    }
}
