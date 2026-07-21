using System;
using Moonbase.Glyph;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>Boundary-value coverage of every lens ramp — one assert per documented edge.</summary>
    public class LensRampTests
    {
        // ---- LensLegend: every active lens has an ASCII band key; None has none. ----

        [Test]
        public void Legend_None_IsEmpty() =>
            Assert.AreEqual(0, LensLegend.For(Lens.None).Length);

        [Test]
        public void Legend_EveryActiveLens_HasAsciiLines()
        {
            foreach (Lens lens in Enum.GetValues(typeof(Lens)))
            {
                var lines = LensLegend.For(lens);
                if (lens == Lens.None) { Assert.AreEqual(0, lines.Length); continue; }
                Assert.Greater(lines.Length, 0, $"{lens} must have a legend");
                foreach (var line in lines)
                {
                    Assert.IsNotNull(line);
                    foreach (char ch in line)
                        Assert.IsTrue(ch >= 0x20 && ch < 0x7f, $"{lens} legend must be printable ASCII, got 0x{(int)ch:x2}");
                }
            }
        }

        // The legend is a hand-written mirror of LensRamps — if a boundary here ever
        // drifts from the ramp, this and the boundary cases above disagree loudly.
        // One case per NUMERIC lens (Power is an overlay, no bands).
        [TestCase(Lens.Pressure, "60", "96", "102")]
        [TestCase(Lens.Oxygen, "10", "17", null)]
        [TestCase(Lens.Co2, "1000", "2000", null)]
        [TestCase(Lens.Temperature, "10", "35", "45")]
        [TestCase(Lens.Water, "15", "40", "80")]
        public void Legend_MentionsRampBoundaries(Lens lens, string a, string b, string c)
        {
            var text = string.Join(" ", LensLegend.For(lens));
            StringAssert.Contains(a, text);
            StringAssert.Contains(b, text);
            if (c != null) StringAssert.Contains(c, text);
        }

        [TestCase(5.0, GlyphColor.LensBad)]
        [TestCase(9.999, GlyphColor.LensBad)]
        [TestCase(10.0, GlyphColor.LensBad)]
        [TestCase(59.999, GlyphColor.LensBad)]
        [TestCase(60.0, GlyphColor.LensWarn)]
        [TestCase(95.999, GlyphColor.LensWarn)]
        [TestCase(96.0, GlyphColor.LensGood)]
        [TestCase(102.0, GlyphColor.LensGood)]
        [TestCase(102.001, GlyphColor.LensOk)]
        public void Pressure(double kPa, GlyphColor expected) =>
            Assert.That(LensRamps.Pressure(kPa), Is.EqualTo(expected));

        [TestCase(0.099, GlyphColor.LensBad)]
        [TestCase(0.10, GlyphColor.LensWarn)]
        [TestCase(0.169, GlyphColor.LensWarn)]
        [TestCase(0.17, GlyphColor.LensGood)]
        [TestCase(0.30, GlyphColor.LensGood)]
        public void Oxygen(double fraction, GlyphColor expected) =>
            Assert.That(LensRamps.Oxygen(fraction), Is.EqualTo(expected));

        [TestCase(500.0, GlyphColor.LensGood)]
        [TestCase(999.999, GlyphColor.LensGood)]
        [TestCase(1000.0, GlyphColor.LensWarn)]
        [TestCase(2000.0, GlyphColor.LensWarn)]
        [TestCase(2000.001, GlyphColor.LensBad)]
        public void Co2(double ppm, GlyphColor expected) =>
            Assert.That(LensRamps.Co2(ppm), Is.EqualTo(expected));

        [TestCase(-5.0, GlyphColor.LensCold)]
        [TestCase(-0.001, GlyphColor.LensCold)]
        [TestCase(0.0, GlyphColor.LensCold)]
        [TestCase(9.999, GlyphColor.LensCold)]
        [TestCase(10.0, GlyphColor.LensGood)]
        [TestCase(34.999, GlyphColor.LensGood)]
        [TestCase(35.0, GlyphColor.LensWarn)]
        [TestCase(45.0, GlyphColor.LensWarn)]
        [TestCase(45.001, GlyphColor.LensHot)]
        public void Temperature(double celsius, GlyphColor expected) =>
            Assert.That(LensRamps.Temperature(celsius), Is.EqualTo(expected));

        [TestCase(0.0, GlyphColor.LensBad)]
        [TestCase(0.149, GlyphColor.LensBad)]
        [TestCase(0.15, GlyphColor.LensWarn)]
        [TestCase(0.399, GlyphColor.LensWarn)]
        [TestCase(0.40, GlyphColor.LensOk)]
        [TestCase(0.799, GlyphColor.LensOk)]
        [TestCase(0.80, GlyphColor.LensGood)]
        [TestCase(1.0, GlyphColor.LensGood)]
        public void WaterFill(double fraction, GlyphColor expected) =>
            Assert.That(LensRamps.WaterFill(fraction), Is.EqualTo(expected));
    }
}
