using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui.Ui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Layout goldens built from a FIXED, hand-authored <see cref="HudModel"/> — a synthetic
    /// map, a synthetic metrics snapshot, and canned text panes — with NO sim in the loop. This
    /// separates "did the composer's layout change?" from "did a sim number drift?": the boot
    /// goldens (ScreenComposerTests / PeriluneGoldenTests) are the integration snapshots that
    /// move when the sim moves; these move ONLY when ScreenComposer's geometry changes. They
    /// also pin the two A5 additions — the lens legend in the sidebar and the MOSS pane modal.
    /// </summary>
    public class ComposerLayoutTests
    {
        private static GlyphBuffer FixedMap()
        {
            // A tiny 12x6 room: wall border, floor interior, one door, one device, one crew.
            var map = new GlyphBuffer(12, 6);
            for (int y = 0; y < 6; y++)
                for (int x = 0; x < 12; x++)
                {
                    bool border = x == 0 || x == 11 || y == 0 || y == 5;
                    map[x, y] = border
                        ? new GlyphCell('#', GlyphColor.Wall, GlyphColor.Void)
                        : new GlyphCell('.', GlyphColor.Floor, GlyphColor.LensGood); // pressure-good tint
                }
            map[0, 3] = new GlyphCell('+', GlyphColor.Device, GlyphColor.Void);   // door
            map[5, 2] = new GlyphCell('@', GlyphColor.Crew, GlyphColor.LensGood);  // crew
            map[8, 3] = new GlyphCell('V', GlyphColor.Device, GlyphColor.LensGood); // a vent
            map[5, 2] = map[5, 2].WithAttr(GlyphAttr.Inverse);                      // cursor on crew
            return map;
        }

        private static ShipMetricsSnapshot FixedMetrics() => new ShipMetricsSnapshot
        {
            Power = 0.80f, Oxygen = 0.95f, Co2Ppm = 640.0, Water = 0.55f,
            Food = 0.40f, Heat = 0.70f, Structural = 0.90f, Morale = 0.62f,
            DayFraction = 0.25,
        };

        private static HudModel BaseModel() => new HudModel
        {
            Map = FixedMap(),
            Metrics = FixedMetrics(),
            Inspector = new[] { "@ 5,2,0", "tile: floor", "room: 101.3kPa  20.9%O2", "crew: Reyes" },
            EventLog = new[] { "D0.10 boot complete", "D0.20 reactor online", "D0.24 door_storage opened" },
            Goals = new[] { "[x] restore power", "[ ] seal the breach" },
            Day = 0.25,
            SpeedLabel = "1x",
            Deck = 0,
            DeckCount = 2,
            LensLabel = "pressure",
            LensLegend = LensLegend.For(Lens.Pressure),
            StatusMessage = "synthetic frame",
        };

        [Test]
        public void Synthetic_120x36_WithLensLegend()
        {
            var buf = ScreenComposer.Compose(BaseModel(), 120, 36);
            AssertNoWrap(buf, 120, 36);
            CheckGolden("layout_synthetic_120x36.txt", GlyphFrame.ToText(buf));
        }

        [Test]
        public void Synthetic_MossPane()
        {
            var m = BaseModel();
            m.Moss = new MossPaneModel
            {
                TerminalId = "term_hydro",
                SourceLines = new[]
                {
                    "# life support watch",
                    "every 2s:",
                    "  if hydro.pressure < 96kPa: open(vent_hydro)",
                },
                Diagnostics = new[] { "OK - compiles clean" },
                Hint = "e edit in $EDITOR    esc close",
            };
            var buf = ScreenComposer.Compose(m, 120, 36);
            AssertNoWrap(buf, 120, 36);
            string text = GlyphFrame.ToText(buf);
            StringAssert.Contains("MOSS  term_hydro", text);
            StringAssert.Contains("1| # life support watch", text);
            StringAssert.Contains("OK - compiles clean", text);
            CheckGolden("layout_moss_pane_120x36.txt", text);
        }

        [Test]
        public void MossPane_WithDiagnostics_ShowsErrorLine()
        {
            var m = BaseModel();
            m.Moss = new MossPaneModel
            {
                TerminalId = "term_hydro",
                SourceLines = new[] { "if broken(" },
                Diagnostics = new[] { "line 1:11  unexpected end of input" },
                Hint = "e edit in $EDITOR    esc close",
            };
            var buf = ScreenComposer.Compose(m, 120, 36);
            AssertNoWrap(buf, 120, 36);
            StringAssert.Contains("line 1:11  unexpected end of input", GlyphFrame.ToText(buf));
        }

        [Test]
        public void LegendAbsent_WhenLensNone()
        {
            var m = BaseModel();
            m.LensLabel = "none";
            m.LensLegend = LensLegend.For(Lens.None); // empty
            var buf = ScreenComposer.Compose(m, 120, 36);
            // The "LENS" sidebar header must not appear when no lens is active.
            StringAssert.DoesNotContain("PRESSURE kPa", GlyphFrame.ToText(buf));
        }

        private static void AssertNoWrap(GlyphBuffer buf, int w, int h)
        {
            Assert.AreEqual(w, buf.Width);
            Assert.AreEqual(h, buf.Height);
            string[] rows = GlyphFrame.ToText(buf).Split('\n');
            Assert.AreEqual(h, rows.Length, "row count == height");
            for (int i = 0; i < rows.Length; i++)
                Assert.AreEqual(w, rows[i].Length, $"row {i} is exactly {w} wide (no wrap)");
        }

        // ------------------------------------------------------------------ harness

        private static void CheckGolden(string fileName, string actual)
        {
            actual = actual.Replace("\r\n", "\n");
            string path = Path.Combine(GoldenDir(), fileName);

            if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") == "1")
            {
                Directory.CreateDirectory(GoldenDir());
                File.WriteAllText(path, actual);
                Assert.Pass($"golden rewritten: {fileName}");
                return;
            }

            if (!File.Exists(path))
                Assert.Fail($"missing golden '{fileName}' — run once with UPDATE_GOLDEN=1 to create it");

            string expected = File.ReadAllText(path).Replace("\r\n", "\n");
            if (expected == actual) return;
            Assert.Fail($"golden mismatch for {fileName}:\n{Diff(expected, actual)}");
        }

        private static string Diff(string expected, string actual)
        {
            string[] e = expected.Split('\n');
            string[] a = actual.Split('\n');
            var sb = new StringBuilder();
            int max = Math.Max(e.Length, a.Length);
            for (int i = 0; i < max; i++)
            {
                string el = i < e.Length ? e[i] : "<none>";
                string al = i < a.Length ? a[i] : "<none>";
                if (el == al) continue;
                sb.Append("- ").Append(el).Append('\n');
                sb.Append("+ ").Append(al).Append('\n');
            }
            return sb.ToString();
        }

        private static string GoldenDir([CallerFilePath] string thisFile = "") =>
            Path.Combine(Path.GetDirectoryName(thisFile) ?? ".", "Golden");
    }
}
