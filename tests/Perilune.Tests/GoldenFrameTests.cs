using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using Moonbase.Glyph;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// Golden frames of the shared mini-scenario: the annotated (glyph+fg+bg+attr) text
    /// of a boot frame and a 1000-tick frame, compared byte-for-byte to committed files.
    /// Set UPDATE_GOLDEN=1 to rewrite the files instead of failing (then re-run without
    /// it to confirm they pass). A mismatch prints a per-line diff.
    /// </summary>
    public class GoldenFrameTests
    {
        [Test]
        public void MiniScenario_Tick0_NoneLens()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick(); // compute rooms so a later lens frame is meaningful; None here
            GlyphTestScenario.RevealLevel(sim, 0);
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            CheckGolden("mini_tick0_none.txt", GlyphFrame.ToAnnotatedText(dst));
        }

        [Test]
        public void MiniScenario_Tick1000_PressureLens()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 1000; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, 0, Lens.Pressure, null, dst);
            CheckGolden("mini_tick1000_pressure.txt", GlyphFrame.ToAnnotatedText(dst));
        }

        // ------------------------------------------------------------------ harness

        private static void CheckGolden(string fileName, string actual)
        {
            // Normalise to '\n' so a checkout with CRLF autocrlf can't fail the compare.
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
