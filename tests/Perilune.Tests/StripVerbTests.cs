using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tools;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WebCommand, CmdKind
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

        // ============================================ the DEVICE emitter (pass 4) — the live bug

        // Two floor tiles inside room A, both walkable, so a device may stand on either.
        private static readonly Int3 DeskTile = new Int3(3, 3, 0);
        private static readonly Int3 ControlTile = new Int3(2, 2, 0);

        /// <summary>
        /// THE BUG THE OWNER REPORTED THREE TIMES, pinned. A condemned DEVICE must project
        /// <see cref="GlyphColor.Deconstruct"/> exactly as a condemned wall does. Before the pass-4
        /// fix it projected <see cref="GlyphColor.Device"/>: pass 1 wrote the designation colour and
        /// pass 4 unconditionally repainted the device's own colour over it, so the order registered
        /// and was serviced but NEVER reached the client. To the player that is indistinguishable
        /// from a broken verb — *"I can see the button, I can see the square when I hover over the
        /// furniture, but after clicking, the square disappears"* (the square is the tool's hover
        /// preview, which correctly clears on release; the persistent mark that should replace it
        /// never arrived). See <c>docs/HANDOVER.md</c> §4g.
        ///
        /// THE WALL LEG IS A NON-VACUITY CONTROL AND IT IS THE POINT OF PUTTING BOTH IN ONE TEST.
        /// The wall emitter has worked since E0-5 WP-4. A test that only asserted "a condemned tile
        /// is amber" would have passed on the broken build via its wall half, which is precisely how
        /// this defect survived a package, a review, and three reports. Asserting BOTH in one sim,
        /// with the device assertion able to fail while the wall assertion holds, is what proves the
        /// test can tell the two cases apart.
        ///
        /// THE UNTOUCHED DEVICE is the third leg: it proves the new line is a per-tile registry
        /// probe and not a blanket recolour of every device the moment anything is condemned.
        ///
        /// MUTATION that makes this fail (apply, observe, revert): delete
        /// <c>if (anyStrip &amp;&amp; strip.TryGet(p, out _)) fg = GlyphColor.Deconstruct;</c> from
        /// pass 4 of <c>GlyphMapper.Project</c> ⇒ the desk projects Device and the wall still
        /// projects Deconstruct — i.e. exactly the shipped bug, and only the device leg reddens.
        /// </summary>
        [Test]
        public void ACondemnedDeviceProjectsDeconstruct_WithTheWallAsANonVacuityControl()
        {
            var sim = Build();
            var desk = sim.AddDevice(DeviceKind.Desk, DeskTile, "desk_probe");
            sim.AddDevice(DeviceKind.MedBed, ControlTile, "bed_control");
            sim.Tick();
            Reveal(sim);

            // Preconditions: neither device is condemned, so neither may be reading the strip colour
            // for any reason other than the designation this test is about to make.
            var deskBefore = Project(sim, DeskTile.X, DeskTile.Y);
            Assert.That(deskBefore.Fg, Is.EqualTo(GlyphColor.Device),
                "precondition: an undesignated desk reads the plain device colour");
            Assert.That(deskBefore.Glyph, Is.EqualTo(Glyphs.ForDevice(DeviceKind.Desk)),
                "precondition: the desk projects its own glyph");
            Assert.That(Project(sim, ControlTile.X, ControlTile.Y).Fg, Is.EqualTo(GlyphColor.Device),
                "precondition: the control medbed reads the plain device colour");

            // Condemn the desk AND the partition wall in the same sim, at the same tick.
            sim.EnqueueCommand(new DesignateDeconstructCommand(DeskTile, DeconstructKind.Device, on: true));
            sim.EnqueueCommand(new DesignateDeconstructCommand(Partition, DeconstructKind.Wall, on: true));
            sim.Tick();
            Assert.That(sim.Deconstruct.TryGet(DeskTile, out var site), Is.True,
                "precondition: the device designation reached the registry (the verb was never broken)");
            Assert.That(site.Kind, Is.EqualTo(DeconstructKind.Device));
            Assert.That(site.TargetId, Is.EqualTo(desk.Id), "the site resolved the device standing there");

            // THE ASSERTION THAT WAS RED BEFORE THIS FIX.
            var deskCell = Project(sim, DeskTile.X, DeskTile.Y);
            Assert.That(deskCell.Fg, Is.EqualTo(GlyphColor.Deconstruct),
                "a condemned DEVICE must be visible to the player — pass 4 used to repaint over it");
            Assert.That(deskCell.Glyph, Is.EqualTo(Glyphs.ForDevice(DeviceKind.Desk)),
                "a condemned desk is still a desk: the designation recolours, it does not re-glyph");

            // THE CONTROL THAT WAS ALREADY GREEN — if this ever fails together with the desk, the
            // test has stopped discriminating and proves nothing about pass 4.
            Assert.That(Project(sim, Partition.X, Partition.Y).Fg, Is.EqualTo(GlyphColor.Deconstruct),
                "the wall emitter (pass 1) must be untouched by the device fix");

            // The untouched neighbour stays its own colour.
            Assert.That(Project(sim, ControlTile.X, ControlTile.Y).Fg, Is.EqualTo(GlyphColor.Device),
                "an undesignated device must NOT be recoloured because some other tile is condemned");

            // And the player can undo what they can now see.
            sim.EnqueueCommand(new DesignateDeconstructCommand(DeskTile, DeconstructKind.Device, on: false));
            sim.Tick();
            Assert.That(Project(sim, DeskTile.X, DeskTile.Y).Fg, Is.EqualTo(GlyphColor.Device),
                "clearing a device order restores the device colour");
        }

        /// <summary>
        /// The Dim ATTRIBUTE survives the recolour. `fg` and `attr` are different fields of a
        /// <see cref="GlyphCell"/>, and a condemned machine that has also lost power is still
        /// unpowered — the designation must not silently erase an unrelated state signal.
        /// A <see cref="DeviceKind.Light"/> draws power and nothing on this bare map supplies it.
        ///
        /// MUTATION: write the strip colour by rebuilding the cell without <c>prev.Attr | attr</c>
        /// (e.g. <c>new GlyphCell(glyph, fg, prev.Bg)</c>) ⇒ the Dim assertion reddens while the
        /// colour assertion stays green.
        /// </summary>
        [Test]
        public void ACondemnedUnpoweredMachineKeepsItsDimAttribute()
        {
            var sim = Build();
            // Device is a reference type, so this handle stays live. AddDevice hands back a POWERED
            // device and this bare map has no reactor, so the un-powering is done explicitly (and
            // re-done after each tick, since PowerSystem owns the flag between ticks).
            var light = sim.AddDevice(DeviceKind.Light, DeskTile, "light_probe");
            sim.Tick();
            Reveal(sim);
            light.Powered = false;

            var before = Project(sim, DeskTile.X, DeskTile.Y);
            Assert.That(before.Attr & GlyphAttr.Dim, Is.EqualTo(GlyphAttr.Dim),
                "precondition: an unpowered light reads Dim, or this test measures nothing");

            sim.EnqueueCommand(new DesignateDeconstructCommand(DeskTile, DeconstructKind.Device, on: true));
            sim.Tick();
            light.Powered = false;

            var after = Project(sim, DeskTile.X, DeskTile.Y);
            Assert.That(after.Fg, Is.EqualTo(GlyphColor.Deconstruct), "condemned reads the strip colour");
            Assert.That(after.Attr & GlyphAttr.Dim, Is.EqualTo(GlyphAttr.Dim),
                "a condemned machine is still an unpowered machine — attr is a different field from fg");
        }

        /// <summary>The fog gate stays FIRST for the device emitter too: pass 4 already skips an
        /// unexplored tile, and the new registry probe sits INSIDE that guard rather than before it.
        /// A designation is knowledge about the world and must not paint through fog.
        /// MUTATION: hoist the strip recolour above pass 4's <c>Explored(...)</c> guard (or write it
        /// straight into <c>dst</c> outside the loop) ⇒ the condemned desk paints through fog.</summary>
        [Test]
        public void ACondemnedDeviceNeverLeaksThroughFog()
        {
            var sim = Build();
            sim.AddDevice(DeviceKind.Desk, DeskTile, "desk_probe");
            sim.Tick();
            sim.EnqueueCommand(new DesignateDeconstructCommand(DeskTile, DeconstructKind.Device, on: true));
            sim.Tick();

            var level = sim.World.Levels[0];
            for (int i = 0; i < level.Flags.Length; i++)
                level.Flags[i] &= unchecked((byte)~(byte)TileFlags.Explored);

            Assert.That(Project(sim, DeskTile.X, DeskTile.Y), Is.EqualTo(GlyphCell.Blank),
                "a condemned device must not be visible through fog");
        }

        /// <summary>Projection stays PURE with a condemned DEVICE present — the registry probe pass 4
        /// gained must read and never write, under every lens (the Water lens takes a different branch
        /// inside <c>DeviceColour</c>, so it is not redundant with Lens.None).
        /// MUTATION: have the pass-4 emitter call anything that mutates and this fails.</summary>
        [Test]
        public void ProjectingACondemnedDeviceDoesNotMutateTheSim()
        {
            var sim = Build();
            sim.AddDevice(DeviceKind.WaterTank, DeskTile, "tank_probe");
            sim.Tick();
            Reveal(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(DeskTile, DeconstructKind.Device, on: true));
            sim.Tick();
            Assert.That(sim.Deconstruct.TryGet(DeskTile, out _), Is.True, "precondition: condemned");

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

        // ============================================ the host status line (HANDOVER §4g defect 2)

        /// <summary>Boot the STANDARD ship (`--ship grid`, the one the owner plays) behind a real
        /// <see cref="GameSession"/>, not started, so commands can be applied between ticks.</summary>
        private static (GameSession gs, SimHost host, List<string> sink) BootGrid()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed, ship: ShipChoice.Grid);
            return (new GameSession(host, sink.Add), host, sink);
        }

        /// <summary>
        /// The status text AS THE PLAYER RECEIVES IT — pulled out of the real broadcast, not off a
        /// private field. Deliberate: a test-only getter would pass even if the string never reached
        /// the wire, and "the player is never told" is the entire bug class this section is about.
        /// </summary>
        private static string StatusOnTheWire(GameSession gs, List<string> sink)
        {
            sink.Clear();
            gs.RenderForTest();
            for (int i = sink.Count - 1; i >= 0; i--)
                if (sink[i].StartsWith("{\"type\":\"status\"", System.StringComparison.Ordinal))
                {
                    const string key = "\"text\":\"";
                    int a = sink[i].IndexOf(key, System.StringComparison.Ordinal);
                    if (a < 0) break;
                    a += key.Length;
                    int b = sink[i].IndexOf('"', a);
                    return b < 0 ? "" : sink[i].Substring(a, b - a);
                }
            Assert.Fail("no status frame was broadcast");
            return "";
        }

        /// <summary>First tile on deck 0 satisfying <paramref name="want"/>, or (-1,-1,0).</summary>
        private static Int3 FindTile(Simulation sim, System.Func<Int3, bool> want)
        {
            for (int y = 0; y < sim.World.Height; y++)
                for (int x = 0; x < sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    if (want(p)) return p;
                }
            return new Int3(-1, -1, 0);
        }

        /// <summary>
        /// THE STATUS LINE USED TO LIE, and this pins that it no longer does. <c>HandleStrip</c> set
        /// <c>_status = "designate strip"</c> BEFORE the sim ever saw the command, so a refused tile
        /// reported success: a plain floor click produced <c>"designate strip"</c> and no
        /// designation. That made accepted and silently-refused indistinguishable — which is exactly
        /// why the invisible device mark took three reports to pin down, and it is what makes the
        /// shelf/rug trap (client-local decor, no sim device, always refused) unreportable.
        ///
        /// ALL FOUR OUTCOMES ARE DRIVEN, and the accepted leg is the non-vacuity control: a test
        /// that only asserted the refusals would pass on a handler that refused everything.
        ///
        /// MUTATION that makes this fail (apply, observe, revert): restore the old body — replace
        /// the whole tail of <c>HandleStrip</c> with <c>_status = on ? "designate strip" : "clear
        /// strip";</c> ⇒ the floor leg, the door leg, the already-condemned leg and the
        /// nothing-to-clear leg all redden while the accepted leg stays green.
        /// </summary>
        [Test]
        public void TheStripStatusLineDistinguishesAcceptedFromRefused_OnTheStandardShip()
        {
            var (gs, host, sink) = BootGrid();
            var sim = host.Sim;

            // A strippable device: any grid device on deck 0 that is not a Door.
            var devicePos = FindTile(sim, p => sim.TryGetDeviceAt(p, out var d) && d.Kind != DeviceKind.Door);
            // A plain floor: walkable, no device, not a wall — the measured control that used to lie.
            var floorPos = FindTile(sim, p => (sim.World.GetFlags(p) & TileFlags.Walkable) != 0
                                              && !sim.TryGetDeviceAt(p, out _));
            var doorPos = FindTile(sim, p => sim.TryGetDeviceAt(p, out var d) && d.Kind == DeviceKind.Door);
            Assert.That(devicePos.X, Is.GreaterThanOrEqualTo(0), "the grid ship must have a strippable device");
            Assert.That(floorPos.X, Is.GreaterThanOrEqualTo(0), "the grid ship must have a bare floor tile");
            Assert.That(doorPos.X, Is.GreaterThanOrEqualTo(0), "the grid ship must have a door");

            // 1. REFUSED — a bare floor is neither a wall nor a device. This is the leg that used to
            //    report "designate strip" while designating nothing at all.
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, floorPos.X, floorPos.Y, i: 1));
            Assert.That(StatusOnTheWire(gs, sink), Does.StartWith("cannot strip"),
                "a floor tile is refused by the sim and the player must be told so");
            sim.Tick();
            Assert.That(sim.Deconstruct.TryGet(floorPos, out _), Is.False,
                "and the refusal was real — nothing was designated");

            // 2. REFUSED, and NAMED — a Door is the one device kind strip may not touch.
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, doorPos.X, doorPos.Y, i: 1));
            Assert.That(StatusOnTheWire(gs, sink), Is.EqualTo("cannot strip door"),
                "the refusal names what was clicked, so the player can tell WHICH rule stopped them");

            // 3. NOTHING TO CLEAR — un-designating a tile that carries no order.
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 0));
            Assert.That(StatusOnTheWire(gs, sink), Is.EqualTo("nothing to clear here"));

            // 4. ACCEPTED — the non-vacuity control. If this ever reddens with the others, the
            //    handler has started refusing everything and the refusals above prove nothing.
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 1));
            Assert.That(StatusOnTheWire(gs, sink), Is.EqualTo("designate strip"),
                "a legal device strip still reports success");
            sim.Tick();
            Assert.That(sim.Deconstruct.TryGet(devicePos, out _), Is.True,
                "and the success was real — the site is in the registry");

            // 5. ALREADY CONDEMNED — a second click on the same tile is a no-op, and saying
            //    "designate strip" again would imply a second order was placed.
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 1));
            Assert.That(StatusOnTheWire(gs, sink), Is.EqualTo("already condemned"));

            // 6. And the clear leg now reports honestly on a tile that DOES carry an order — AND the
            //    clear really happened. Asserting only the string here would be the same mistake the
            //    old status line made: `already` is true either way, so a swallowed clear command
            //    still prints "clear strip".
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 0));
            Assert.That(StatusOnTheWire(gs, sink), Is.EqualTo("clear strip"));
            sim.Tick();
            Assert.That(sim.Deconstruct.TryGet(devicePos, out _), Is.False,
                "the order was cleared in word only — the site is still in the registry");
        }

        /// <summary>
        /// THE PRE-CHECK MUST NEVER GATE THE COMMAND, and this test is driven through the CLEAR path
        /// because that is the only place where gating is OBSERVABLE — a distinction found by
        /// mutation testing rather than by reading, and worth recording.
        ///
        /// ⚠️ AN EQUIVALENT MUTANT LIVES HERE. The obvious mutation — wrap the enqueue in
        /// <c>if (!on || CanDesignate(...))</c> — SURVIVES every assertion, and it survives for a
        /// real reason rather than a missing assertion: the host asks
        /// <see cref="DeconstructSystem.CanDesignate"/>, which is the very predicate
        /// <c>DesignateDeconstructCommand</c> re-runs at the tick boundary. So for <c>on: true</c>
        /// the two are behaviourally identical — a command the host would suppress is exactly a
        /// command the sim would refuse — and no test can tell them apart without reaching into the
        /// private command queue. Do not "fix" that by adding an accessor to
        /// <see cref="Simulation"/>: the gate is still wrong on principle (two owners for one
        /// decision, and it silently converts the honest residual race into a dropped order), and it
        /// is CATCHABLE in the form anyone would actually write it in.
        ///
        /// MUTATION THAT DOES BITE, and it is the realistic one: gate the enqueue on
        /// <c>CanDesignate</c> WITHOUT an <c>on</c> escape hatch — <c>if (strip.CanDesignate(_sim,
        /// pos, kind)) _sim.EnqueueCommand(...);</c>. On a condemned tile <c>CanDesignate</c> is
        /// false (its already-designated clause), so **CLEARING WOULD STOP WORKING ENTIRELY** and
        /// the player could never un-condemn anything. The status line would go on saying
        /// <c>"clear strip"</c> the whole time, because `already` is true — which is why the
        /// registry, not the status string, is what this test asserts on.
        /// </summary>
        [Test]
        public void TheStatusPreCheckDoesNotGateTheCommand_ClearingStillWorksOnACondemnedTile()
        {
            var (gs, host, _) = BootGrid();
            var sim = host.Sim;
            var devicePos = FindTile(sim, p => sim.TryGetDeviceAt(p, out var d) && d.Kind != DeviceKind.Door);

            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 1));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1), "precondition: one site");

            // THE TRAP: CanDesignate is FALSE here — not because clearing is illegal, but because
            // the tile is already designated. A gate keyed on it would swallow the clear.
            Assert.That(sim.Deconstruct.CanDesignate(sim, devicePos, DeconstructKind.Device), Is.False,
                "precondition: the predicate a naive gate would consult says NO on a condemned tile");

            Assert.That(gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 0)), Is.True,
                "the handler ran and reported a change");
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(0),
                "the clear command was swallowed by a host-side gate — the player can condemn a device "
                + "and can never un-condemn it, silently, while the status line still says 'clear strip'");

            // And the duplicate-designate path is still a harmless sim no-op (not a gate, an absorb).
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Strip, devicePos.X, devicePos.Y, i: 1));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1),
                "two identical designates must leave exactly one site — the sim absorbs the duplicate");
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
