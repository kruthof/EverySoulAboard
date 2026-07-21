using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Web;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W2: the pure per-tile light projection. Mirrors GlyphMapper's tripwires — Project
    /// never mutates the sim, the fog gate is first (unexplored ⇒ 0), and twin sims project
    /// byte-identically — plus the v0 room-light semantics and the light-message RLE.
    /// </summary>
    public class LightMapperTests
    {
        private static byte[] Buffer(Simulation sim) =>
            new byte[sim.World.Width * sim.World.Height];

        /// <summary>THE tripwire: projection is pure. Tick first (rooms + power balanced),
        /// then StateHash must be byte-identical before and after Project.</summary>
        [Test]
        public void ProjectDoesNotMutateSim()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var into = Buffer(sim);

            ulong before = sim.StateHash();
            LightMapper.Project(sim, 0, into);
            Assert.That(sim.StateHash(), Is.EqualTo(before), "Project mutated the sim");
        }

        /// <summary>Projection must stay read-only even while rooms are dirty (no sneaky recompute).</summary>
        [Test]
        public void ProjectDoesNotRecomputeDirtyRooms()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            sim.AddDevice(DeviceKind.Light, new Int3(2, 1, 0), "dirty_probe"); // marks rooms dirty
            Assert.That(sim.Rooms.Dirty, Is.True);

            ulong before = sim.StateHash();
            LightMapper.Project(sim, 0, Buffer(sim));
            Assert.That(sim.StateHash(), Is.EqualTo(before), "Project mutated a dirty-room sim");
            Assert.That(sim.Rooms.Dirty, Is.True, "Project must not recompute rooms");
        }

        /// <summary>Fog gate FIRST: with nothing explored, every tile is Unknown(0), leaking
        /// nothing about rooms, lights or power.</summary>
        [Test]
        public void FogGate_UnexploredIsAlwaysZero()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            var level = sim.World.Levels[0];
            for (int y = 0; y < level.Height; y++)
                for (int x = 0; x < level.Width; x++)
                    sim.World.SetFlag(new Int3(x, y, 0), TileFlags.Explored, false);

            var into = Buffer(sim);
            LightMapper.Project(sim, 0, into);
            foreach (byte b in into)
                Assert.That(b, Is.EqualTo((byte)LightState.Unknown), "an unexplored tile leaked a non-fog state");
        }

        /// <summary>v0 semantics: a room with a powered light reads Powered(4); a room with no
        /// light reads Dead(1); walls/void (roomless) read Dead(1) once explored.</summary>
        [Test]
        public void Semantics_PoweredRoom_vs_DeadRoom()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var light = FindDevice(sim, "light");
            Assert.That(light.Powered, Is.True, "scenario light should be powered after balancing");

            var into = Buffer(sim);
            LightMapper.Project(sim, 0, into);
            int w = sim.World.Width;
            Assert.That(into[2 * w + 8], Is.EqualTo((byte)LightState.Powered), "right room (has powered light)");
            Assert.That(into[2 * w + 2], Is.EqualTo((byte)LightState.Dead), "left room (no light)");
            Assert.That(into[0 * w + 0], Is.EqualTo((byte)LightState.Dead), "wall tile (roomless) explored");
        }

        /// <summary>Brownout derivation: a Light on a network yet unpowered (Comfort tier shed)
        /// reads Brownout(3) for its whole room.</summary>
        [Test]
        public void Semantics_BrownoutFromShedLight()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var light = FindDevice(sim, "light");
            Assert.That(light.NetworkId, Is.Not.EqualTo(0), "light should be attached to a network");
            light.Powered = false; // simulate the Comfort tier being shed (on-grid but unlit)

            var into = Buffer(sim);
            LightMapper.Project(sim, 0, into);
            int w = sim.World.Width;
            Assert.That(into[2 * w + 8], Is.EqualTo((byte)LightState.Brownout), "shed on-grid light ⇒ brownout");
        }

        /// <summary>Twin determinism: two identical sims project byte-identical light grids.</summary>
        [Test]
        public void TwinSimsProjectByteEqual()
        {
            var a = GlyphTestScenario.Build();
            var b = GlyphTestScenario.Build();
            for (int i = 0; i < 30; i++) { a.Tick(); b.Tick(); }
            GlyphTestScenario.RevealLevel(a, 0);
            GlyphTestScenario.RevealLevel(b, 0);

            var la = Buffer(a);
            var lb = Buffer(b);
            LightMapper.Project(a, 0, la);
            LightMapper.Project(b, 0, lb);
            Assert.That(la, Is.EqualTo(lb), "twin light grids diverged");
        }

        // ---------------------------------------------------------------- RLE

        [Test]
        public void Rle_EncodesRunsCompactly()
        {
            // 3×2 grid: [1,1,1, 4,4,0] → runs 1×3, 4×2, 0×1.
            byte[] states = { 1, 1, 1, 4, 4, 0 };
            Assert.AreEqual(
                "{\"type\":\"light\",\"deck\":2,\"w\":3,\"h\":2,\"rle\":[[1,3],[4,2],[0,1]]}",
                WireFormat.Light(2, 3, 2, states));
        }

        [Test]
        public void Rle_RoundTrips_A_Real_Projection()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            int w = sim.World.Width, h = sim.World.Height;
            var states = new byte[w * h];
            LightMapper.Project(sim, 0, states);

            string json = WireFormat.Light(0, w, h, states);
            byte[] decoded = DecodeRle(json, w * h);
            Assert.That(decoded, Is.EqualTo(states), "RLE decode did not reproduce the projected grid");
        }

        /// <summary>Expand the "rle":[[state,count],...] pairs back into a flat byte grid.
        /// Scans the inner-pair region for every [state,count] pair and repeats each state.</summary>
        private static byte[] DecodeRle(string json, int expectedLen)
        {
            int open = json.IndexOf("\"rle\":[", System.StringComparison.Ordinal) + "\"rle\":[".Length;
            int end = json.IndexOf("]}", open, System.StringComparison.Ordinal); // outer array close
            string body = json.Substring(open, end - open); // e.g. "[1,3],[4,2],[0,1]"
            var outp = new System.Collections.Generic.List<byte>(expectedLen);
            foreach (var pair in body.Split(new[] { "],[" }, System.StringSplitOptions.None))
            {
                string p = pair.Trim('[', ']');
                if (p.Length == 0) continue;
                var kv = p.Split(',');
                int state = int.Parse(kv[0], System.Globalization.CultureInfo.InvariantCulture);
                int count = int.Parse(kv[1], System.Globalization.CultureInfo.InvariantCulture);
                for (int c = 0; c < count; c++) outp.Add((byte)state);
            }
            return outp.ToArray();
        }

        private static Device FindDevice(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail($"no device '{name}'");
            return null;
        }
    }
}
