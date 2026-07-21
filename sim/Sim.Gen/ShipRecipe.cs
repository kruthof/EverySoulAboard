using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// The seeded parameter set a procedural ship is generated from — the embryo of the
    /// P2 generator. For P1 the hull and the proven band pattern are fixed; the recipe
    /// varies only what is safe to vary within that pattern (room order inside each band,
    /// crew-cabin count), so <c>gen --seed N</c> yields a deterministic <em>valid</em>
    /// variant every time. A recipe is a pure function of its seed; the generator forks the
    /// sim RNG from it, so the same seed always produces byte-identical geometry.
    /// </summary>
    public sealed class ShipRecipe
    {
        public ulong Seed;

        // Hull dimensions (fixed for P1 — the proven Perilune envelope).
        public int Width = 64;
        public int Height = 20;

        /// <summary>Crew cabins carved off the quarters hall (varies 3..4).</summary>
        public int CabinCount = 4;

        /// <summary>Crew placed aboard (always breathing in the recirculated spine).</summary>
        public int CrewCount = 2;

        /// <summary>Derive a recipe from a seed: cabin count 3 or 4, otherwise the fixed
        /// envelope. Deterministic and culture-free.</summary>
        public static ShipRecipe FromSeed(ulong seed)
        {
            // Fork a throwaway stream purely to spread the seed across the parameter space
            // without disturbing the sim RNG the generator will use.
            var rng = new SimRng(seed).Fork(0x5EC1DEUL);
            return new ShipRecipe
            {
                Seed = seed,
                CabinCount = rng.NextInt(3, 5), // 3 or 4
                CrewCount = 2,
            };
        }
    }
}
