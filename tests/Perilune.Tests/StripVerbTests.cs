using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tools;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-5 WP-4 — the STRIP verb's player-facing surface: the <see cref="GlyphColor.Deconstruct"/>
    /// emitter (so a condemned tile is VISIBLE, or the verb is a dead UI) and the
    /// <c>occupancy --strip N</c> measurement harness (<see cref="StripHarness"/>).
    ///
    /// The sim mechanics themselves (hull guardrail, room merge, yields, save/hash, flee, device
    /// strip) are pinned by <c>DeconstructSystemTests</c>; this file pins only what WP-4 adds — the
    /// map layer's emitter and the host-side measurement selector. Deconstruct is a REGISTRY, not a
    /// TileFlags bit, so unlike dig/stockpile the emitter reads the registry (via
    /// <see cref="Simulation.Deconstruct"/>), which is the one thing that could quietly break.
    /// </summary>
    public class StripVerbTests
    {
        // A sealed two-room map (same shape DeconstructSystemTests uses): rooms A (x1-4) and B (x6-9)
        // split by the SOLID partition column x=5. The partition is interior (strippable) and
        // reachable from either room; the outer ring is hull. (5,2,0) is the partition's middle.
        private static readonly string[] TwoRooms =
        {
            "###########",
            "#....#....#",
            "#....#....#",
            "#....#....#",
            "###########",
        };

        private static readonly Int3 Partition = new Int3(5, 2, 0);

        private static Simulation Build()
        {
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(TwoRooms), 42, SystemStack.CreateDefault(moss));
            sim.Tick(); // rooms computed; DeconstructSystem present
            return sim;
        }

        /// <summary>Reveal the whole level so the fog gate (which runs FIRST in Project) is never
        /// what a colour assertion is actually measuring.</summary>
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

        // =============================================================== the emitter

        /// <summary>Precondition twin: before any order the partition is a plain wall, so the
        /// Deconstruct colour below can only come from the designation, never from the terrain.</summary>
        [Test]
        public void UndesignatedWallKeepsItsWallColour()
        {
            var sim = Build();
            Reveal(sim);
            Assert.That(Project(sim, 5, 2).Fg, Is.EqualTo(GlyphColor.Wall), "partition before any order");
        }

        /// <summary>
        /// THE emitter, end to end: a strip designation recolours its wall to
        /// <see cref="GlyphColor.Deconstruct"/> — through the real registry + real projection, NOT a
        /// recomputed enum literal. Clearing it restores the wall colour, so the player can undo what
        /// they see. The glyph stays <see cref="Glyphs.Wall"/>: designation recolours the terrain, it
        /// does not replace it.
        ///
        /// MUTATION that makes this fail (apply, observe, revert): delete the
        /// <c>else if (anyStrip &amp;&amp; strip.TryGet(...)) fg = GlyphColor.Deconstruct;</c> line
        /// from <c>GlyphMapper.Project</c> → the condemned wall projects <c>GlyphColor.Wall</c> and
        /// the player has no way to see the order they issued. (A second, independent mutation the
        /// clear-half catches: make the emitter ignore <c>anyStrip</c> and always probe the registry —
        /// harmless here, but the <c>UndesignatedWallKeepsItsWallColour</c> twin proves an empty
        /// registry emits nothing.)
        /// </summary>
        [Test]
        public void StripDesignationRecoloursTheWallToDeconstruct_AndClearingRestoresIt()
        {
            var sim = Build();
            Reveal(sim);

            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: true));
            sim.Tick();

            Assert.That(sim.Deconstruct, Is.Not.Null, "the default stack registers a DeconstructSystem");
            Assert.That(sim.Deconstruct.TryGet(Partition, out _), Is.True,
                "precondition: the command actually created the pending site");
            var cell = Project(sim, 5, 2);
            Assert.That(cell.Fg, Is.EqualTo(GlyphColor.Deconstruct),
                "a condemned wall must be visible to the player, or the strip verb is a dead UI");
            Assert.That(cell.Glyph, Is.EqualTo(Glyphs.Wall),
                "designation recolours the terrain; it does not replace the wall glyph");

            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: false));
            sim.Tick();
            Assert.That(Project(sim, 5, 2).Fg, Is.EqualTo(GlyphColor.Wall),
                "clearing the order restores the wall colour");
        }

        /// <summary>The fog gate runs first and must stay first: a condemned tile reads Blank while
        /// unexplored. A designation is knowledge about the world, and projecting it through fog would
        /// leak the map. MUTATION: move the anyStrip emitter ABOVE the fog `continue;` → the order
        /// paints through fog and this fails.</summary>
        [Test]
        public void StripDesignationNeverLeaksThroughFog()
        {
            var sim = Build();
            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: true));
            sim.Tick();

            // Deliberately NOT revealed.
            var level = sim.World.Levels[0];
            for (int i = 0; i < level.Flags.Length; i++)
                level.Flags[i] &= unchecked((byte)~(byte)TileFlags.Explored);

            Assert.That(Project(sim, 5, 2), Is.EqualTo(GlyphCell.Blank),
                "a condemned wall must not be visible through fog");
        }

        /// <summary>The dig FLAG outranks a strip designation on the same tile (the doc'd precedence
        /// Designate &gt; Stockpile &gt; Deconstruct). The two states cannot legally coexist — dig
        /// marks Debris, strip marks a standing Wall — so this forces the corrupt combination by hand
        /// to prove the RESOLVER is deterministic, not left to chance. MUTATION: reorder the if-chain
        /// in Project to test Deconstruct before Designated → the tile paints Deconstruct and this
        /// fails.</summary>
        [Test]
        public void DigFlagOutranksAStripDesignation_OnTheSameTile()
        {
            var sim = Build();
            Reveal(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: true));
            sim.Tick();
            // Force the illegal overlap: set the dig flag on the already-condemned wall.
            sim.World.SetFlag(Partition, TileFlags.Designated, true);

            Assert.That(Project(sim, 5, 2).Fg, Is.EqualTo(GlyphColor.Designate),
                "dig (Designated) must win over a strip designation on the same tile");
        }

        /// <summary>Projection stays PURE with a strip designation present — the same tripwire
        /// GlyphMapperTests applies to every pass, extended to the registry read the emitter adds.
        /// MUTATION: have the emitter call anything that mutates (e.g. Reap) and this fails.</summary>
        [Test]
        public void ProjectingAStripDoesNotMutateTheSim()
        {
            var sim = Build();
            Reveal(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: true));
            sim.Tick();

            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            foreach (Lens lens in System.Enum.GetValues(typeof(Lens)))
            {
                ulong before = sim.StateHash();
                GlyphMapper.Project(sim, 0, lens, null, dst);
                Assert.That(sim.StateHash(), Is.EqualTo(before), $"Project under {lens} mutated the sim");
            }
        }

        // ======================================================= the --strip N harness

        private static Simulation Slice() =>
            GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        /// <summary>
        /// The <c>occupancy --strip N</c> selector, pinned ON THE REAL SLICE (not a synthetic map —
        /// the measurement runs on the slice). It must return EXACTLY N tiles, each a WORKABLE
        /// interior wall, in strict canonical z,y,x order. "Workable" is the correction WP-4 measured:
        /// the naive "non-hull wall" selector the lane plan specified picks structural walls buried in
        /// the slice's solid mass (no walkable neighbour), which the dispatcher can never reach — it
        /// tore down 0/40 and moved occupancy nothing. Requiring a walkable neighbour picks the
        /// reachable partitions a crew actually strips.
        ///
        /// TWO mutations bite here, one per independently-exercised clause (apply, observe, revert):
        ///   * drop <c>HasWalkableNeighbor</c> → a buried wall with no walkable neighbour is picked →
        ///     the walkable-neighbour assertion fails (and the whole point of WP-4's correction is lost).
        ///   * change the scan to x,y,z (or any non-canonical order) → the strictly-increasing
        ///     packed-order assertion fails.
        /// The <c>IsPressureHull</c> clause is NOT independently exercised on this fixture: the slice is
        /// carved from solid mass (no Void tile), so its only hull walls are the map-edge ring, whose
        /// inner neighbours are also solid wall — the walkable-neighbour filter already excludes every
        /// hull wall, making hull∩walkable empty here. The clause is load-bearing on non-solid-mass ships
        /// and its real guardrail is <c>DeconstructSystemTests</c>' <c>CanDesignate</c> hull coverage, not
        /// this selector test. (Reviewer finding F1, WP-4.)
        /// </summary>
        [Test]
        public void SelectWalls_OnTheSlice_IsExactlyNWorkableNonHullWalls_InCanonicalZyxOrder()
        {
            var world = Slice().World;
            const int n = 40;
            List<Int3> picks = StripHarness.SelectWalls(world, n);

            Assert.That(picks.Count, Is.EqualTo(n),
                "the slice must have at least N workable interior walls for the measurement to mean anything");

            ulong prev = 0;
            bool first = true;
            foreach (var p in picks)
            {
                Assert.That(world.GetWall(p), Is.EqualTo(TileDefs.Wall), $"{p} is not a wall");
                Assert.That(DeconstructSystem.IsPressureHull(world, p), Is.False,
                    $"{p} is hull — the selector must never designate the canvas edge");

                bool reachable = false;
                for (int i = 0; i < 4; i++)
                {
                    var neighbor = Int3.Neighbor4(p, i);
                    if (world.InBounds(neighbor) &&
                        (world.GetFlags(neighbor) & TileFlags.Walkable) != 0) { reachable = true; break; }
                }
                Assert.That(reachable, Is.True,
                    $"{p} has no walkable neighbour — a crew could never path adjacent to strip it");

                ulong key = Pack(p);
                if (!first)
                    Assert.That(key, Is.GreaterThan(prev),
                        $"{p} breaks strict canonical z,y,x order (packed {key} <= previous {prev})");
                prev = key; first = false;
            }
        }

        /// <summary>Degenerate inputs are safe no-ops: N &lt;= 0 or a null world returns an empty
        /// list, so <c>--strip 0</c> (the CI-pinned default) never selects, designates, or ticks
        /// anything different. MUTATION: make <c>SelectWalls</c> ignore the <c>n &lt;= 0</c> guard →
        /// <c>--strip 0</c> would start scanning and this fails.</summary>
        [Test]
        public void SelectWalls_IsAnEmptyNoOp_ForNonPositiveN_AndNullWorld()
        {
            var world = Slice().World;
            Assert.That(StripHarness.SelectWalls(world, 0), Is.Empty, "N=0 selects nothing");
            Assert.That(StripHarness.SelectWalls(world, -5), Is.Empty, "N<0 selects nothing");
            Assert.That(StripHarness.SelectWalls(null, 40), Is.Empty, "a null world selects nothing");
        }

        /// <summary>The harness designates through the SAME command the client issues, and the sites
        /// land in the registry the emitter and dispatcher both read — so what it measures is what a
        /// player gets. MUTATION: point <c>EnqueueStrip</c> at a different command / kind and the
        /// pending count or kind assertion fails.</summary>
        [Test]
        public void EnqueueStrip_LandsExactlyNWallSites_InTheRegistry()
        {
            var sim = Slice();
            const int n = 12;
            int enqueued = StripHarness.EnqueueStrip(sim, n);
            sim.Tick(); // commands apply at the tick boundary

            Assert.That(enqueued, Is.EqualTo(n), "the slice has at least N workable walls");
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(n),
                "every enqueued designation must become a pending site (all workable, none rejected)");
            foreach (var site in sim.Deconstruct.Pending)
                Assert.That(site.Kind, Is.EqualTo(DeconstructKind.Wall),
                    "the harness strips walls only");
        }
    }
}
