using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using Moonbase.Glyph;
using Moonbase.Sim;
using Moonbase.Tui;
using Moonbase.Tui.Ui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// Golden full-screen compositions of the shipping boot. The map comes from the exact
    /// projection the CLI uses (GlyphMapper); the sidebar/inspector/status panes come from
    /// the real ShipMetrics + InspectorModel. A 120×36 target frame pins the full layout;
    /// an 80×24 frame pins the sidebar-collapsed path. Structural invariants (every row is
    /// exactly `width` chars — nothing wraps) are asserted directly. UPDATE_GOLDEN=1 rewrites.
    /// </summary>
    public class ScreenComposerTests
    {
        private static HudModel BootModel(int deck, Int3 cursor)
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var map = new GlyphBuffer(host.Sim.World.Width, host.Sim.World.Height);
            GlyphMapper.Project(host.Sim, deck, Lens.None, cursor, map);
            return new HudModel
            {
                Map = map,
                Metrics = ShipMetrics.Compute(host.Sim),
                Inspector = InspectorModel.Build(host.Sim, cursor),
                Goals = host.Goals != null ? GoalLines(host) : Array.Empty<string>(),
                EventLog = Array.Empty<string>(),
                Day = 0.0,
                SpeedLabel = "1x",
                Deck = deck,
                DeckCount = host.Sim.World.Depth,
                LensLabel = "none",
                StatusMessage = "",
            };
        }

        private static string[] GoalLines(SimHost host)
        {
            var g = host.Goals.Goals;
            var lines = new string[g.Count];
            for (int i = 0; i < g.Count; i++) lines[i] = (g[i].Done ? "[x] " : "[ ] ") + g[i].Text;
            return lines;
        }

        [Test]
        public void Compose_120x36_Boot()
        {
            var buf = ScreenComposer.Compose(BootModel(0, new Int3(32, 10, 0)), 120, 36);
            AssertNoWrap(buf, 120, 36);
            CheckGolden("screen_120x36_boot.txt", GlyphFrame.ToText(buf));
        }

        [Test]
        public void Compose_80x24_Min_SidebarCollapses()
        {
            var buf = ScreenComposer.Compose(BootModel(0, new Int3(32, 10, 0)), 80, 24);
            AssertNoWrap(buf, 80, 24);
            // Collapsed: no vertical separator column at x=64 across the body.
            bool hasSep = false;
            for (int y = 0; y < 20; y++) if (buf.Width > 64 && buf[64, y].Glyph == '|') hasSep = true;
            Assert.IsFalse(hasSep, "sidebar should collapse at 80 wide");
            CheckGolden("screen_80x24_boot.txt", GlyphFrame.ToText(buf));
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
