using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using Moonbase.Glyph;
using Moonbase.Tui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// Golden fixtures of the SHIPPING ship, rendered through the exact helper the
    /// <c>--dump</c> CLI uses (DumpMode.RenderFrame) — so a golden file is byte-for-byte
    /// what an agent sees on the terminal. Boot frames (deck 0 + deck 1, no lens) pin the
    /// map and the boot fog; a 3000-tick StateHash pins early-sim stability (a full frame
    /// would be brittle over a run, so the long check asserts the hash footer only — the
    /// twin test proves that hash is deterministic). Set UPDATE_GOLDEN=1 to (re)write.
    /// </summary>
    public class PeriluneGoldenTests
    {
        [Test]
        public void Boot_Deck0_NoLens()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            CheckGolden("perilune_boot_deck0.txt", DumpMode.RenderFrame(host.Sim, 0, Lens.None, null, annotated: true));
        }

        [Test]
        public void Boot_Deck1_NoLens()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            CheckGolden("perilune_boot_deck1.txt", DumpMode.RenderFrame(host.Sim, 1, Lens.None, null, annotated: true));
        }

        // Per-lens boot goldens. Deliberately MAP-ONLY annotated frames (not composed screens):
        // a lens recolours cell fg/bg, which a ToText composed screen can't capture and an
        // annotated composed screen would bury under churny sidebar numbers. A map-only
        // annotated frame at tick 0 isolates exactly the lens projection and is fully stable.
        // Deck 0 carries the most rooms and the conduit tray (power '~' overlay). At the
        // all-nominal boot every numeric lens tints identically (all LensGood), so ONE
        // numeric-lens golden (pressure) proves the bg-tint wiring — a second would be
        // byte-identical and prove nothing (review A5); ramp band LOGIC is pinned by
        // LensRampTests. The sidebar legend is pinned separately by the synthetic
        // ScreenComposer test, so lens numbers never mix with layout regressions.

        [Test]
        public void Boot_Deck0_PressureLens()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            CheckGolden("perilune_boot_deck0_pressure.txt", DumpMode.RenderFrame(host.Sim, 0, Lens.Pressure, null, annotated: true));
        }

        [Test]
        public void Boot_Deck0_PowerLens()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            CheckGolden("perilune_boot_deck0_power.txt", DumpMode.RenderFrame(host.Sim, 0, Lens.Power, null, annotated: true));
        }

        [Test]
        public void Tick3000_StateHash_IsStable()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            for (int i = 0; i < 3000; i++) host.Sim.Tick();
            string hash = host.Sim.StateHash().ToString("x16");
            CheckGolden("perilune_tick3000_hash.txt", hash);
        }

        // ------------------------------------------------------------------ harness
        // (mirrors GoldenFrameTests; each golden lives in the shared Golden/ dir)

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
