using System;

namespace Perilune.Sim
{
    /// <summary>
    /// Deterministic RNG (xoshiro256**). All sim randomness flows through named streams
    /// forked from the world seed so systems can't perturb each other's sequences.
    /// State is serializable (4 ulongs) and included in the state hash.
    /// </summary>
    public sealed class SimRng
    {
        private ulong _s0, _s1, _s2, _s3;

        public SimRng(ulong seed)
        {
            // SplitMix64 to spread the seed into four non-zero words.
            ulong sm = seed;
            _s0 = SplitMix64(ref sm);
            _s1 = SplitMix64(ref sm);
            _s2 = SplitMix64(ref sm);
            _s3 = SplitMix64(ref sm);
            if ((_s0 | _s1 | _s2 | _s3) == 0) _s0 = 0x9E3779B97F4A7C15UL;
        }

        private SimRng(ulong s0, ulong s1, ulong s2, ulong s3)
        {
            _s0 = s0; _s1 = s1; _s2 = s2; _s3 = s3;
        }

        /// <summary>Derive an independent stream (e.g. per system) without advancing this one's future.</summary>
        public SimRng Fork(ulong streamId)
        {
            ulong sm = _s0 ^ (streamId * 0xBF58476D1CE4E5B9UL);
            ulong a = SplitMix64(ref sm), b = SplitMix64(ref sm), c = SplitMix64(ref sm), d = SplitMix64(ref sm);
            return new SimRng(a, b, c, d);
        }

        public (ulong, ulong, ulong, ulong) State => (_s0, _s1, _s2, _s3);

        public void Restore(ulong s0, ulong s1, ulong s2, ulong s3)
        {
            _s0 = s0; _s1 = s1; _s2 = s2; _s3 = s3;
        }

        public ulong NextULong()
        {
            ulong result = RotL(_s1 * 5, 7) * 9;
            ulong t = _s1 << 17;
            _s2 ^= _s0;
            _s3 ^= _s1;
            _s1 ^= _s2;
            _s0 ^= _s3;
            _s2 ^= t;
            _s3 = RotL(_s3, 45);
            return result;
        }

        /// <summary>Uniform int in [0, maxExclusive).</summary>
        public int NextInt(int maxExclusive)
        {
            if (maxExclusive <= 0) throw new ArgumentOutOfRangeException(nameof(maxExclusive));
            return (int)(NextULong() % (ulong)maxExclusive);
        }

        public int NextInt(int minInclusive, int maxExclusive) => minInclusive + NextInt(maxExclusive - minInclusive);

        /// <summary>Uniform float in [0, 1).</summary>
        public float NextFloat() => (NextULong() >> 40) * (1f / (1 << 24));

        /// <summary>Uniform double in [0, 1).</summary>
        public double NextDouble() => (NextULong() >> 11) * (1.0 / (1L << 53));

        public bool NextBool() => (NextULong() & 1) != 0;

        private static ulong RotL(ulong x, int k) => (x << k) | (x >> (64 - k));

        private static ulong SplitMix64(ref ulong state)
        {
            ulong z = state += 0x9E3779B97F4A7C15UL;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }
    }
}
