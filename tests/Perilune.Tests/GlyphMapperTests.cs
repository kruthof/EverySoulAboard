using Moonbase.Dsl;
using Moonbase.Glyph;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    public class GlyphMapperTests
    {
        private static GlyphBuffer BufferFor(Simulation sim) =>
            new GlyphBuffer(sim.World.Width, sim.World.Height);

        /// <summary>
        /// THE tripwire: projection is pure. Rooms are recomputed inside Tick, so tick
        /// once first (rooms present); then the hash must be byte-identical before and
        /// after Project under every lens.
        /// </summary>
        [Test]
        public void ProjectDoesNotMutateSim()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick(); // compute rooms + seed fog
            GlyphTestScenario.RevealLevel(sim, 0);
            var dst = BufferFor(sim);

            foreach (Lens lens in System.Enum.GetValues(typeof(Lens)))
            {
                ulong before = sim.StateHash();
                GlyphMapper.Project(sim, 0, lens, new Int3(4, 2, 0), dst);
                ulong after = sim.StateHash();
                Assert.That(after, Is.EqualTo(before), $"Project under {lens} mutated the sim");
            }
        }

        /// <summary>Projection must stay read-only even while rooms are dirty — a future
        /// RecomputeIfDirty sneaking into a called member is invisible on clean rooms
        /// (no-op) but rewrites RoomId/Rooms on dirty ones.</summary>
        [Test]
        public void ProjectDoesNotRecomputeDirtyRooms()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            sim.AddDevice(DeviceKind.Light, new Int3(2, 1, 0), "dirty_probe"); // marks rooms dirty
            Assert.That(sim.Rooms.Dirty, Is.True, "scenario should leave rooms dirty");

            ulong before = sim.StateHash();
            GlyphMapper.Project(sim, 0, Lens.Pressure, null, BufferFor(sim));
            Assert.That(sim.StateHash(), Is.EqualTo(before), "Project mutated a dirty-room sim");
            Assert.That(sim.Rooms.Dirty, Is.True, "Project must not recompute rooms");
        }

        /// <summary>Unexplored tiles are blank even with a citizen/device on them; once
        /// revealed, the entity appears.</summary>
        [Test]
        public void FogGatesEntitiesUntilExplored()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick();
            var dst = BufferFor(sim);

            // Reyes stands at (8,2); nothing has been revealed there yet in this tiny run.
            var citizen = FindCitizen(sim, "Reyes");
            // Force the tile dark to make the assertion independent of exploration radius.
            sim.World.SetFlag(citizen.Pos, TileFlags.Explored, false);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[citizen.Pos.X, citizen.Pos.Y].Glyph, Is.EqualTo(' '),
                "citizen on an unexplored tile must be hidden");
            Assert.That(dst[citizen.Pos.X, citizen.Pos.Y].Fg, Is.EqualTo(GlyphColor.Unknown));

            sim.World.SetFlag(citizen.Pos, TileFlags.Explored, true);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[citizen.Pos.X, citizen.Pos.Y].Glyph, Is.EqualTo('@'),
                "revealed citizen must render");
        }

        [Test]
        public void DeviceHiddenUntilTileExplored()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick();
            var dst = BufferFor(sim);
            var vent = FindDevice(sim, "vent");

            sim.World.SetFlag(vent.Pos, TileFlags.Explored, false);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[vent.Pos.X, vent.Pos.Y].Glyph, Is.EqualTo(' '));

            sim.World.SetFlag(vent.Pos, TileFlags.Explored, true);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[vent.Pos.X, vent.Pos.Y].Glyph, Is.EqualTo('^'));
        }

        /// <summary>Two identical sims produce identical frames after N ticks.</summary>
        [Test]
        public void IdenticalSimsProduceIdenticalFrames()
        {
            var a = GlyphTestScenario.Build();
            var b = GlyphTestScenario.Build();
            for (int i = 0; i < 200; i++) { a.Tick(); b.Tick(); }
            GlyphTestScenario.RevealLevel(a, 0);
            GlyphTestScenario.RevealLevel(b, 0);

            var fa = BufferFor(a);
            var fb = BufferFor(b);
            GlyphMapper.Project(a, 0, Lens.Pressure, null, fa);
            GlyphMapper.Project(b, 0, Lens.Pressure, null, fb);
            Assert.That(fa.ContentEquals(fb), Is.True, "twin frames diverged");
        }

        /// <summary>Door glyph tracks IsOpen / IsLocked without changing the vocabulary.</summary>
        [Test]
        public void DoorStatesRenderAsClosedOpenLocked()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var dst = BufferFor(sim);
            var door = FindDevice(sim, "door_mid");

            door.IsOpen = false; door.IsLocked = false;
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[door.Pos.X, door.Pos.Y].Glyph, Is.EqualTo('+'), "closed");

            door.IsOpen = true; door.IsLocked = false;
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[door.Pos.X, door.Pos.Y].Glyph, Is.EqualTo('/'), "open");

            door.IsLocked = true;
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            Assert.That(dst[door.Pos.X, door.Pos.Y].Glyph, Is.EqualTo('X'), "locked");
            Assert.That(dst[door.Pos.X, door.Pos.Y].Fg, Is.EqualTo(GlyphColor.Locked));
        }

        [Test]
        public void CursorCellGetsInverseAttr()
        {
            var sim = GlyphTestScenario.Build();
            sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var dst = BufferFor(sim);

            GlyphMapper.Project(sim, 0, Lens.None, new Int3(3, 2, 0), dst);
            Assert.That((dst[3, 2].Attr & GlyphAttr.Inverse), Is.EqualTo(GlyphAttr.Inverse));
            Assert.That((dst[4, 2].Attr & GlyphAttr.Inverse), Is.EqualTo(GlyphAttr.None));
        }

        private static Citizen FindCitizen(Simulation sim, string name)
        {
            foreach (var c in sim.Citizens.Items) if (c.Name == name) return c;
            Assert.Fail($"no citizen '{name}'");
            return null;
        }

        private static Device FindDevice(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail($"no device '{name}'");
            return null;
        }
    }
}
