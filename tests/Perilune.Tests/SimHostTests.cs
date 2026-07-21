using System.IO;
using Moonbase.Glyph;
using Moonbase.Sim;
using Moonbase.Tui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// The headless boot (Moonbase.Tui.SimHost) must reproduce the shipping ship Unity
    /// boots: right dimensions, deterministic across twin builds, and the exact boot fog
    /// (the sealed observatory — and Reyes inside it — stay dark until reached).
    /// </summary>
    public class SimHostTests
    {
        [Test]
        public void Build_FromCheckout_Succeeds_WithCleanLayout()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            Assert.That(host.Sim, Is.Not.Null, "sim built");
            Assert.That(host.LayoutPath, Is.Not.Null, "DeviceLayout.json auto-discovered from the checkout");
            Assert.That(host.LayoutProblemCount, Is.Zero, "the real repo layout parses with no problems");
        }

        [Test]
        public void ShipDimensions_MatchAuthoredPerilune()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            Assert.That(host.Width, Is.EqualTo(64));
            Assert.That(host.Height, Is.EqualTo(20));
            Assert.That(host.Depth, Is.EqualTo(2));
        }

        [Test]
        public void TwinBuild_ThenTicks_ProduceIdenticalStateHash()
        {
            const ulong seed = 42;
            var a = SimHost.Build(seed);
            var b = SimHost.Build(seed);
            for (int i = 0; i < 500; i++) { a.Sim.Tick(); b.Sim.Tick(); }
            Assert.That(a.Sim.StateHash(), Is.EqualTo(b.Sim.StateHash()),
                "twin headless boots must stay bit-identical (determinism canary)");
        }

        [Test]
        public void BootFog_Deck0_HasExploredTiles()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            string frame = DumpMode.RenderFrame(host.Sim, 0, Lens.None, null, annotated: false);
            Assert.That(frame.Replace("\n", "").Trim(), Is.Not.Empty,
                "deck 0 is reachable at boot and must render structure, not all fog");
            // Stronger: some cell carries real terrain, not the blank fog glyph.
            var buffer = new GlyphBuffer(host.Width, host.Height);
            GlyphMapper.Project(host.Sim, 0, Lens.None, null, buffer);
            Assert.That(AnyNonBlank(buffer), Is.True, "deck 0 has explored tiles at boot");
        }

        [Test]
        public void BootFog_ReyesCabin_IsSealed_AndReyesNotVisible()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var reyes = FindCitizen(host.Sim, "Reyes");
            Assert.That(reyes, Is.Not.Null, "Reyes is authored into the Perilune crew");
            var p = reyes.Pos;

            // 1. The tile itself is unexplored in the sim (the fog seed never reached it).
            var level = host.Sim.World.Levels[p.Z];
            byte flags = level.Flags[level.Index(p.X, p.Y)];
            Assert.That(flags & (byte)TileFlags.Explored, Is.Zero,
                $"Reyes's tile {p} must be unexplored at boot (sealed observatory)");

            // 2. And therefore the projected cell is blank fog — Reyes is not drawn.
            var buffer = new GlyphBuffer(host.Width, host.Height);
            GlyphMapper.Project(host.Sim, p.Z, Lens.None, null, buffer);
            Assert.That(buffer[p.X, p.Y], Is.EqualTo(GlyphCell.Blank),
                "Reyes's cell renders as fog at boot — he is hidden until reached");
        }

        [Test]
        public void Build_WithTempDefsDir_LoadsOverride_ChangingChecksum()
        {
            // A value override must reach sim.Defs: the parsed checksum differs from the
            // compiled default and the host surfaces the same fingerprint. (Behaviour is
            // unchanged until the B3 migration wires systems to sim.Defs — we assert the
            // plumbing, not the effect.)
            string dir = Path.Combine(Path.GetTempPath(), "perilune_defs_" + System.Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            try
            {
                File.WriteAllText(Path.Combine(dir, "thermal.def"), "[thermal]\ncitizen_heat_w = 125.5\n");
                var host = SimHost.Build(SimHost.DefaultSeed, layoutPath: null, dataDir: dir);

                Assert.That(host.DefsProblems, Is.Empty, "the override parses cleanly");
                Assert.That(host.DefsFileCount, Is.EqualTo(1));
                Assert.That(host.DefsChecksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                    "a value override changes the defs checksum");
                Assert.That(host.Sim.Defs.Checksum, Is.EqualTo(host.DefsChecksum),
                    "the sim was built with the loaded defs");
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }

        private static bool AnyNonBlank(GlyphBuffer buffer)
        {
            for (int y = 0; y < buffer.Height; y++)
                for (int x = 0; x < buffer.Width; x++)
                    if (buffer[x, y] != GlyphCell.Blank) return true;
            return false;
        }

        private static Citizen FindCitizen(Simulation sim, string name)
        {
            var items = sim.Citizens.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Name == name) return items[i];
            return null;
        }
    }
}
