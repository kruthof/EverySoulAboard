using Perilune.Dsl;
using Perilune.Glyph;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-3 — the player verbs (ECONOMY-PLAN §E0, closing the designation half of MECHANICS §13.6).
    ///
    /// The two designate commands already existed and were exercised from the TUI alone; what was
    /// missing was (a) a way for the shipping web client to issue them and (b) any way for the
    /// player to SEE the result. These tests pin (b) — the two reserved GlyphColor ids finally
    /// getting an emitter — plus the sim-side preconditions the host relies on being enforced
    /// sim-side rather than host-side.
    ///
    /// The wire needs no change for this: the frame ships raw GlyphColor bytes and the client
    /// palette has carried entries for Designate (15) and Stockpile (16) since it was written.
    /// </summary>
    public class DesignationVerbTests
    {
        // A 6×3 strip: floor with a rubble plug at (4,1), so one tile is diggable and the rest
        // are zonable. 'R' is AsciiWorld's debris char (floor AND wall set to TileDefs.Debris).
        private static readonly string[] Deck =
        {
            "######",
            "#...R#",
            "######",
        };

        private static Simulation Build()
        {
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(Deck), 42, SystemStack.CreateDefault(moss));
            sim.Tick(); // rooms computed
            // GIVE THE DECK AIR. AsciiWorld.Build leaves every room at 0 kPa, and since the
            // worksite staging rule (docs/HANDOVER.md §5 item 2) the dispatcher will not park a
            // worker on a tile where it would suffocate — so on a full stack (NeedsSystem +
            // SafetySystem, both in CreateDefault) an unpressurised fixture offers no work at all.
            // That is the correct sim behaviour and the wrong fixture: a sealed interior strip in
            // which the crew are expected to work is a strip with atmosphere in it. Room 0 is the
            // vacuum sink and is deliberately left alone.
            for (int i = 1; i < sim.Rooms.Rooms.Count; i++) RoomState.Pressurize(sim.Rooms.Rooms[i]);
            return sim;
        }

        /// <summary>Reveal the whole level so the fog gate (which runs FIRST in Project) can never
        /// be what a colour assertion is actually measuring.</summary>
        private static void Reveal(Simulation sim)
        {
            var level = sim.World.Levels[0];
            for (int i = 0; i < level.Flags.Length; i++)
                level.Flags[i] |= (byte)TileFlags.Explored;
        }

        private static GlyphCell Project(Simulation sim, int x, int y)
        {
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, 0, Lens.None, null, dst);
            return dst[x, y];
        }

        [Test]
        public void UndesignatedTerrainKeepsItsOwnColour()
        {
            var sim = Build();
            Reveal(sim);
            Assert.That(Project(sim, 4, 1).Fg, Is.EqualTo(GlyphColor.Debris), "rubble before any order");
            Assert.That(Project(sim, 1, 1).Fg, Is.EqualTo(GlyphColor.Floor), "floor before any order");
        }

        [Test]
        public void DigDesignationRecoloursTheTileToDesignate()
        {
            var sim = Build();
            Reveal(sim);
            var rubble = new Int3(4, 1, 0);

            sim.EnqueueCommand(new DesignateDigCommand(rubble, on: true));
            sim.Tick();

            Assert.That((sim.World.GetFlags(rubble) & TileFlags.Designated), Is.Not.EqualTo(0),
                "the command should have set the flag");
            var cell = Project(sim, 4, 1);
            Assert.That(cell.Fg, Is.EqualTo(GlyphColor.Designate),
                "a designated dig target must be visible to the player, or the verb is a dead UI");
            Assert.That(cell.Glyph, Is.EqualTo(Glyphs.Debris),
                "designation recolours the terrain; it does not replace it");

            // Clearing the order restores the terrain colour — the player can undo what they see.
            sim.EnqueueCommand(new DesignateDigCommand(rubble, on: false));
            sim.Tick();
            Assert.That(Project(sim, 4, 1).Fg, Is.EqualTo(GlyphColor.Debris));
        }

        [Test]
        public void StockpileZoneRecoloursTheFloorToStockpile()
        {
            var sim = Build();
            Reveal(sim);
            var floor = new Int3(2, 1, 0);

            sim.EnqueueCommand(new DesignateStockpileCommand(floor, on: true));
            sim.Tick();

            Assert.That((sim.World.GetFlags(floor) & TileFlags.Stockpile), Is.Not.EqualTo(0));
            var cell = Project(sim, 2, 1);
            Assert.That(cell.Fg, Is.EqualTo(GlyphColor.Stockpile));
            Assert.That(cell.Glyph, Is.EqualTo(Glyphs.Floor), "a zone is a floor, still walkable");

            sim.EnqueueCommand(new DesignateStockpileCommand(floor, on: false));
            sim.Tick();
            Assert.That(Project(sim, 2, 1).Fg, Is.EqualTo(GlyphColor.Floor));
        }

        /// <summary>The fog gate runs first and must stay first: an unexplored tile reads Blank no
        /// matter what the player has designated on it. Designation is knowledge about the world,
        /// and projecting it through fog would leak the map.</summary>
        [Test]
        public void DesignationNeverLeaksThroughFog()
        {
            var sim = Build();
            var rubble = new Int3(4, 1, 0);
            sim.EnqueueCommand(new DesignateDigCommand(rubble, on: true));
            sim.EnqueueCommand(new DesignateStockpileCommand(new Int3(2, 1, 0), on: true));
            sim.Tick();

            // Deliberately NOT revealed.
            var level = sim.World.Levels[0];
            for (int i = 0; i < level.Flags.Length; i++)
                level.Flags[i] &= unchecked((byte)~(byte)TileFlags.Explored);

            Assert.That(Project(sim, 4, 1), Is.EqualTo(GlyphCell.Blank), "dig order visible through fog");
            Assert.That(Project(sim, 2, 1), Is.EqualTo(GlyphCell.Blank), "zone visible through fog");
        }

        /// <summary>Both commands enforce their own preconditions, which is exactly why the web
        /// host may enqueue a click blind: an illegal order is a deterministic sim no-op decided at
        /// the tick boundary, not a host-side guess that could race the sim.</summary>
        [Test]
        public void IllegalOrdersAreSilentSimNoOps()
        {
            var sim = Build();
            Reveal(sim);
            var solidWall = new Int3(0, 0, 0);
            var rubble = new Int3(4, 1, 0);

            sim.EnqueueCommand(new DesignateDigCommand(solidWall, on: true));      // not debris
            sim.EnqueueCommand(new DesignateStockpileCommand(rubble, on: true));   // not walkable
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(99, 99, 0), on: true)); // out of bounds
            sim.Tick();

            Assert.That((sim.World.GetFlags(solidWall) & TileFlags.Designated), Is.EqualTo((TileFlags)0),
                "only rubble is diggable");
            Assert.That((sim.World.GetFlags(rubble) & TileFlags.Stockpile), Is.EqualTo((TileFlags)0),
                "only walkable tiles can be zoned");
            Assert.That(Project(sim, 0, 0).Fg, Is.EqualTo(GlyphColor.Wall));
            Assert.That(Project(sim, 4, 1).Fg, Is.EqualTo(GlyphColor.Debris));
        }

        /// <summary>Projection stays pure with designations present — the same tripwire
        /// GlyphMapperTests applies to every other pass, extended to the new one.</summary>
        [Test]
        public void ProjectingDesignationsDoesNotMutateTheSim()
        {
            var sim = Build();
            Reveal(sim);
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(4, 1, 0), on: true));
            sim.EnqueueCommand(new DesignateStockpileCommand(new Int3(2, 1, 0), on: true));
            sim.Tick();

            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            foreach (Lens lens in System.Enum.GetValues(typeof(Lens)))
            {
                ulong before = sim.StateHash();
                GlyphMapper.Project(sim, 0, lens, null, dst);
                Assert.That(sim.StateHash(), Is.EqualTo(before), $"Project under {lens} mutated the sim");
            }
        }

        /// <summary>
        /// THE point of the lane, end to end: a designation is what creates DEMAND. Before E0-3 the
        /// shipping client could not set TileFlags.Designated at all, so JobKind.Dig was measured at
        /// 0.00 % occupancy over three sim-days (MECHANICS §13.6) — the labour pool E0-1 unlocked had
        /// nothing to do. One order should put an idle crew member on a dig job.
        /// </summary>
        [Test]
        public void ADigOrderPutsAnIdleCrewMemberToWork()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.Tick();
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.None), "precondition: nothing to do yet");

            sim.EnqueueCommand(new DesignateDigCommand(new Int3(4, 1, 0), on: true));
            for (int i = 0; i < 5 && crew.JobKind == JobKind.None; i++) sim.Tick();

            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Dig),
                "a designated rubble tile must reach the dispatcher and be taken");
        }
    }
}
