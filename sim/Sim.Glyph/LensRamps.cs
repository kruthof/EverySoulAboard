namespace Perilune.Glyph
{
    /// <summary>
    /// Quantised threshold ramps: a room/device metric → a semantic overlay colour.
    /// Deliberately banded (not a continuous gradient) so a frame is exactly reproducible
    /// and every boundary is a single documented compare — no float formatting, no
    /// interpolation. Boundaries follow the lower-inclusive convention. Units match the
    /// Sim.Core room fields: kPa, mole fraction, ppm, and °C (convert Kelvin at the call
    /// site: TemperatureK - 273.15).
    /// </summary>
    public static class LensRamps
    {
        /// <summary>Cabin pressure in kPa (nominal ~101).</summary>
        public static GlyphColor Pressure(double kPa)
        {
            if (kPa < 60.0) return GlyphColor.LensBad;   // vacuum through unsurvivable low
            if (kPa < 96.0) return GlyphColor.LensWarn;  // thin
            if (kPa <= 102.0) return GlyphColor.LensGood; // nominal band
            return GlyphColor.LensOk;                    // over-pressured
        }

        /// <summary>Oxygen mole fraction (0..1); nominal ~0.21.</summary>
        public static GlyphColor Oxygen(double fraction)
        {
            if (fraction < 0.10) return GlyphColor.LensBad;
            if (fraction < 0.17) return GlyphColor.LensWarn;
            return GlyphColor.LensGood;
        }

        /// <summary>Carbon dioxide in ppm; nominal ~500.</summary>
        public static GlyphColor Co2(double ppm)
        {
            if (ppm < 1000.0) return GlyphColor.LensGood;
            if (ppm <= 2000.0) return GlyphColor.LensWarn;
            return GlyphColor.LensBad;
        }

        /// <summary>Room temperature in °C.</summary>
        public static GlyphColor Temperature(double celsius)
        {
            if (celsius < 10.0) return GlyphColor.LensCold; // sub-zero through chilly
            if (celsius < 35.0) return GlyphColor.LensGood;
            if (celsius <= 45.0) return GlyphColor.LensWarn;
            return GlyphColor.LensHot;
        }

        /// <summary>Water tank fill fraction (StoredLiters / capacity, 0..1).</summary>
        public static GlyphColor WaterFill(double fraction)
        {
            if (fraction < 0.15) return GlyphColor.LensBad;
            if (fraction < 0.40) return GlyphColor.LensWarn;
            if (fraction < 0.80) return GlyphColor.LensOk;
            return GlyphColor.LensGood;
        }
    }
}
