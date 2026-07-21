using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using Perilune.Glyph;
using Perilune.Tools;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Golden fixtures for the P2 "Talking Ship" slice (AuthoredShips.PeriluneSlice, booted
    /// through the same SimHost the hosts use with <c>--ship slice</c>). These are the slice's
    /// OWN goldens — an entirely separate file set from the pinned 2-crew Perilune goldens,
    /// which this lane must never move. Boot frames pin the eight-crew map + fog; a 3000-tick
    /// StateHash pins early-sim stability (twin determinism proven in PeriluneSliceTests); and
    /// the persona JSON is the byte-stable portrait-pipeline handoff (pk_ keys + persona
    /// summary, secrets firewalled) the ART lane conditions on. Set UPDATE_GOLDEN=1 to (re)write.
    /// </summary>
    public class PeriluneSliceGoldenTests
    {
        [Test]
        public void Slice_Boot_Deck0_NoLens()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            CheckGolden("slice_boot_deck0.txt", DumpMode.RenderFrame(host.Sim, 0, Lens.None, null, annotated: true));
        }

        [Test]
        public void Slice_Boot_Deck1_NoLens()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            CheckGolden("slice_boot_deck1.txt", DumpMode.RenderFrame(host.Sim, 1, Lens.None, null, annotated: true));
        }

        [Test]
        public void Slice_Tick3000_StateHash_IsStable()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            for (int i = 0; i < 3000; i++) host.Sim.Tick();
            string hash = host.Sim.StateHash().ToString("x16", System.Globalization.CultureInfo.InvariantCulture);
            CheckGolden("slice_tick3000_hash.txt", hash);
        }

        [Test]
        public void Slice_PersonaDump_IsStable_PortraitHandoff()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            string json = PersonaDump.Render(host.Seed, host.Sim, host.Minds, host.Facts);
            CheckGolden("slice_personas.json", json);
        }

        // ------------------------------------------------------------------ harness
        // (mirrors PeriluneGoldenTests; slice goldens live beside the Perilune ones)

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
