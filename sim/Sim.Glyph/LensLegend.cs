using System;

namespace Perilune.Glyph
{
    /// <summary>
    /// The human-readable band key for each <see cref="Lens"/>, mirroring the thresholds in
    /// <see cref="LensRamps"/> exactly — one source of truth, so if a ramp boundary moves the
    /// legend here moves with it (guarded by LensRampTests). Every string is fixed-width ASCII
    /// so a sidebar or a web overlay can lay it out without measuring. Lens.None has no legend
    /// (the plain terrain view); its entry is an empty array. Shared by every skin (terminal
    /// sidebar today, web overlay in A6) — do not duplicate these strings per host.
    /// </summary>
    public static class LensLegend
    {
        private static readonly string[] None = Array.Empty<string>();

        // Bands read best→worst, following the lower-inclusive convention in LensRamps.
        private static readonly string[] Pressure =
        {
            "PRESSURE kPa",
            " good 96-102  ok >102",
            " warn 60-96   bad <60",
        };

        private static readonly string[] Oxygen =
        {
            "OXYGEN fraction",
            " good >=.17",
            " warn .10-.17  bad <.10",
        };

        private static readonly string[] Co2 =
        {
            "CO2 ppm",
            " good <1000  warn <=2000",
            " bad >2000",
        };

        private static readonly string[] Temperature =
        {
            "TEMP degC",
            " good 10-35   warn 35-45",
            " cold <10     hot >45",
        };

        private static readonly string[] Power =
        {
            "POWER overlay",
            " ~ conduit line",
            " dim glyph = unpowered",
        };

        private static readonly string[] Water =
        {
            "WATER tank fill",
            " good >=.80   ok .40-.80",
            " warn .15-.40 bad <.15",
        };

        /// <summary>The legend lines for <paramref name="lens"/> (empty for None). The array
        /// is shared/immutable — callers must not mutate it.</summary>
        public static string[] For(Lens lens)
        {
            switch (lens)
            {
                case Lens.Pressure: return Pressure;
                case Lens.Oxygen: return Oxygen;
                case Lens.Co2: return Co2;
                case Lens.Temperature: return Temperature;
                case Lens.Power: return Power;
                case Lens.Water: return Water;
                default: return None;
            }
        }
    }
}
