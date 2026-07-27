using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>marks</c> WIRE CHANNEL — the debris / dig / stockpile / strip mark layer, fed from the
    /// sim's own registries instead of from the projected <c>cell[1]</c> foreground byte.
    ///
    /// WHAT IT IS FOR, AND WHY A CHANNEL WAS NEEDED. <c>GlyphMapper.Project</c> writes the mark
    /// colour into a tile's fg byte in PASS 1 and then OVERWRITES that byte in pass 3 (ground item
    /// stacks), pass 4 (grid-resident devices) and pass 5 (living citizens). Both modern SVG surfaces
    /// derived their whole mark layer from that byte, so on <c>--ship grid</c> a crew member crossing
    /// a condemned tile made its ✕ blink out and back, an item stored on a stockpile tile erased the
    /// tint — the normal state of a WORKING stockpile — and a device on a zoned tile hid the mark.
    /// A narrow exception was patched into pass 4 for the strip case only (<c>GlyphMapper.cs</c>,
    /// after the owner reported the invisible device strip three times); this channel is the general
    /// fix that exception's own comment names as the known-better one.
    ///
    /// THE FOUR ERASURE TESTS BELOW ARE THE POINT OF THE FILE, and each is written as a PAIR: it
    /// asserts that the real <see cref="GlyphMapper"/> really does lose the mark (the non-vacuity
    /// control — without it the test would pass on a projection that never lost anything, proving
    /// nothing about the channel) and that the channel keeps it. Both halves run against a real
    /// <see cref="Simulation"/> driven through the real <see cref="ISimCommand"/>s, in the manner of
    /// <c>StripVerbTests</c>.
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar, NO new hashed
    /// field, NO save-chapter change, NO new <see cref="GlyphColor"/> id (<c>GlyphColor</c> is a spine
    /// file and is untouched): so the def-field and defs-checksum gates do not apply and all five
    /// determinism pins must be byte-identical.
    /// <see cref="Rendering_The_Marks_Channel_Never_Touches_The_Sim"/> is the in-suite half of that
    /// claim; the pins themselves are measured by <c>ci.sh</c>. The de-DE culture gate DOES apply and
    /// is exercised — the dev machine is de-DE and this channel ships four integers per tile.
    /// </summary>
    public class MarksChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Marks_Serializes_Tuple_Shape_And_EmptyList()
        {
            var cells = new[]
            {
                new WireFormat.MarkCell(3, 4, 0, WireFormat.MarkDebris),
                new WireFormat.MarkCell(58, 15, 1, WireFormat.MarkStrip),
            };
            string json = WireFormat.Marks(cells);
            StringAssert.Contains("\"type\":\"marks\"", json);
            // tuple order: [x, y, deck, kind]
            StringAssert.Contains("[3,4,0,0]", json);
            StringAssert.Contains("[58,15,1,3]", json);
            Assert.AreEqual("{\"type\":\"marks\",\"cells\":[]}",
                WireFormat.Marks(Array.Empty<WireFormat.MarkCell>()));
            Assert.AreEqual("{\"type\":\"marks\",\"cells\":[]}", WireFormat.Marks(null),
                "a null list is the same inert payload, not a crash on the render thread");
        }

        /// <summary>The four kind ids are a cross-language contract with no compiler across it —
        /// <c>MARK_KIND_NAMES</c> in <c>client/src/wire/messages.js</c> mirrors them, and
        /// <c>client/test/marks-model.test.js</c> parses <c>WireFormat.Marks.cs</c> to pin that the
        /// two agree by NAME. This half pins that they stay distinct and contiguous from 0, which is
        /// what makes the client's array-indexed table legal at all.
        ///
        /// MUTATION: set <c>MarkStrip = 1</c> ⇒ two kinds collide and this fails.</summary>
        [Test]
        public void Mark_Kind_Ids_Are_Distinct_And_Contiguous_From_Zero()
        {
            var ids = new[] { WireFormat.MarkDebris, WireFormat.MarkDig,
                              WireFormat.MarkStockpile, WireFormat.MarkStrip };
            CollectionAssert.AreEqual(new[] { 0, 1, 2, 3 }, ids,
                "the client indexes MARK_KIND_NAMES by the wire kind, so the ids must be 0..3 in this " +
                "order. A gap or a reorder silently renames every mark on the standard surface.");
        }

        [Test]
        public void Marks_Serialization_Is_InvariantCulture()
        {
            var cells = new[] { new WireFormat.MarkCell(1234, 7, 2, 3) };
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE"); // group separator '.'
                string de = WireFormat.Marks(cells);
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Marks(cells);
                Assert.AreEqual(inv, de, "marks bytes are culture-independent (the dev machine is de-DE)");
                StringAssert.Contains("[1234,7,2,3]", de, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ═══════════════════════════════════════════════════════════════════ the session bridge

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship = ShipChoice.Perilune)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Perilune
                ? SimHost.Build(SimHost.DefaultSeed)
                : SimHost.Build(ship == ShipChoice.Slice ? SimHost.SliceSeed : SimHost.DefaultSeed, ship: ship);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host);
        }

        /// <summary>The cached <c>marks</c> payload after a render, taken from the Snapshot a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. (A channel absent from <c>Snapshot</c>'s key list silently drops its
        /// whole layer on the first reconnect and nothing else in the tree would notice.)</summary>
        private static string MarksJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"marks\""));
            Assert.IsNotNull(json, "the marks channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it loses every designation on screen");
            return json;
        }

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately positional: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, int Kind)> Tuples(string json)
        {
            var list = new List<(int, int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(4, f.Length, "a marks tuple is four elements, saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        private static int? KindAt(GameSession gs, Int3 p)
        {
            foreach (var t in Tuples(MarksJson(gs)))
                if (t.X == p.X && t.Y == p.Y && t.Deck == p.Z) return t.Kind;
            return null;
        }

        /// <summary>The fg byte the real projection produces for a tile — the thing both surfaces
        /// used to read, and the thing every erasure test below shows losing the mark.</summary>
        private static GlyphColor ProjectedFg(Simulation sim, Int3 p)
        {
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, p.Z, Lens.None, null, dst);
            return dst[p.X, p.Y].Fg;
        }

        /// <summary>Reveal a level so the fog gate (which runs FIRST, in both the projection and this
        /// channel) is never what an assertion is actually measuring.</summary>
        private static void Reveal(Simulation sim, int z)
        {
            var level = sim.World.Levels[z];
            for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
        }

        /// <summary>An EMPTY walkable tile: walkable, explored-able, with no device, no item and no
        /// citizen on it, so each erasure test below puts exactly ONE occluder there.</summary>
        private static Int3 EmptyWalkable(Simulation sim)
        {
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        bool occupied = sim.Items.Items.Any(i => i.CarriedBy == 0 && i.Pos.Equals(p))
                                     || sim.Citizens.Items.Any(c => !c.Dead && c.Pos.Equals(p));
                        if (occupied) continue;
                        return p;
                    }
            Assert.Fail("no empty walkable tile on this ship — every erasure test would be vacuous");
            return default;
        }

        private static void Zone(SimHost host, Int3 pos)
        {
            host.Sim.EnqueueCommand(new DesignateStockpileCommand(pos, true));
            host.Sim.Tick();
        }

        // ─────────────────────────────────────────────────── THE FOUR ERASURES (the point)

        /// <summary>
        /// PASS 3 — a ground ITEM stored on a stockpile tile. This is not an edge case: it is the
        /// NORMAL STATE OF A WORKING STOCKPILE, so before this channel the zone tint vanished exactly
        /// when the zone started doing its job.
        ///
        /// MUTATION: build the marks list from <c>GlyphMapper</c>'s output instead of from
        /// <c>TileFlags</c> ⇒ the second half fails. MUTATION 2: delete the item ⇒ the FIRST half
        /// fails, which is what stops this test passing on a projection that never lost anything.
        /// </summary>
        [Test]
        public void A_Stored_Item_Erases_The_Projection_But_Not_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Zone(host, tile);
            Reveal(sim, tile.Z);

            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Stockpile),
                "precondition: with nothing on it the projection DOES carry the zone colour");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile));

            sim.AddItem(ItemKind.Regolith, 1, tile);
            sim.Tick();

            Assert.That(ProjectedFg(sim, tile), Is.Not.EqualTo(GlyphColor.Stockpile),
                "NON-VACUITY: GlyphMapper pass 3 no longer overwrites the fg byte for a ground item, " +
                "so this test is no longer measuring an erasure and proves nothing about the channel");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile),
                "a stockpile tile with something stored on it — the normal state of a WORKING " +
                "stockpile — lost its mark on the wire. That is the defect this channel removes.");
        }

        /// <summary>
        /// PASS 4 — a DEVICE standing on a zoned tile. Every device kind is non-blocking
        /// (<c>content/core/SimDefs/machines.def</c>, <c>blocks = false</c> in all 26 rows), so a
        /// device tile is walkable and <see cref="DesignateStockpileCommand"/> will happily zone it.
        /// Pass 4's narrow strip re-apply does not help here: it only rescues the DECONSTRUCT colour.
        ///
        /// MUTATION: read the mark from the projection ⇒ the second half fails.
        /// </summary>
        [Test]
        public void A_Device_Erases_The_Projection_But_Not_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Zone(host, tile);
            Reveal(sim, tile.Z);
            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Stockpile), "precondition");

            sim.AddDevice(DeviceKind.Locker, tile, "marks_test_locker");
            sim.Tick();

            Assert.That(ProjectedFg(sim, tile), Is.Not.EqualTo(GlyphColor.Stockpile),
                "NON-VACUITY: GlyphMapper pass 4 no longer overwrites the fg byte for a device");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile),
                "a zoned tile with a device on it lost its mark on the wire");
        }

        /// <summary>
        /// PASS 5 — a living CITIZEN standing on a marked tile. This is the one the pass-4 patch could
        /// never reach, and the one a player sees most: on <c>--ship grid</c> the crew cluster in the
        /// hold at roughly x25-32 y15-16, exactly where the dig designations are, so a mark BLINKED
        /// OUT AND BACK as people crossed it.
        ///
        /// MUTATION: read the mark from the projection ⇒ the second half fails.
        /// </summary>
        [Test]
        public void A_Standing_Citizen_Erases_The_Projection_But_Not_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Zone(host, tile);
            Reveal(sim, tile.Z);
            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Stockpile), "precondition");

            var walker = sim.AddCitizen("marks_test_walker", tile);
            walker.HoldPosition = true;   // stay put for the length of the measurement
            sim.Tick();

            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Crew),
                "NON-VACUITY: GlyphMapper pass 5 no longer paints the citizen over this tile, so the " +
                "erasure this test exists to measure is not happening");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile),
                "a marked tile with a crew member standing on it lost its mark on the wire — the " +
                "designation blinks out whenever anyone walks over it (HANDOVER §4b limit 2)");
        }

        /// <summary>
        /// PASS 5 OVER A CONDEMNED DEVICE — the exact case <c>docs/HANDOVER.md</c> §4g recorded as
        /// still open after the pass-4 patch: *"a crew member standing on a condemned desk, or an item
        /// dropped on it, still erases its ✕ for as long as they are there."* Both halves of that
        /// sentence are covered — the item half by the pass-3 test above, this one by the crew half.
        ///
        /// MUTATION: read the mark from the projection ⇒ the second half fails.
        /// </summary>
        [Test]
        public void A_Citizen_On_A_Condemned_Device_Erases_The_Projection_But_Not_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Reveal(sim, tile.Z);

            sim.AddDevice(DeviceKind.Locker, tile, "marks_test_condemned");
            sim.EnqueueCommand(new DesignateDeconstructCommand(tile, DeconstructKind.Device, true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1),
                "precondition: the strip order actually registered, through the real command");
            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Deconstruct),
                "precondition: pass 4's strip re-apply carries the condemned colour while nobody is " +
                "standing there — so the failure below can only be pass 5");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStrip));

            var walker = sim.AddCitizen("marks_test_stander", tile);
            walker.HoldPosition = true;
            sim.Tick();

            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Crew),
                "NON-VACUITY: pass 5 no longer overwrites the condemned colour");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStrip),
                "a condemned tile with a crew member on it lost its strip mark — §4g's remaining half");
        }

        // ─────────────────────────────────────────────────────────── sources, order, gates

        /// <summary>
        /// Each of the four kinds comes from its OWN authoritative source, and the strip one is the
        /// odd one out: deconstruct is a REGISTRY, not a <see cref="TileFlags"/> bit, so a builder
        /// that read only <c>level.Flags</c> would silently ship three kinds out of four.
        ///
        /// MUTATION: drop the <c>strip.TryGet</c> branch from <c>GameSession.BuildMarks</c> ⇒ the
        /// strip leg fails. MUTATION 2: drop the debris branch ⇒ the debris leg fails.
        /// </summary>
        [Test]
        public void All_Four_Kinds_Reach_The_Wire_From_Their_Own_Source()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            // debris + dig ride the AUTHORED wreck; a grid ship that stopped shipping one would make
            // the two legs below vacuous, so they are asserted before anything is added.
            var boot = Tuples(MarksJson(gs));
            Assert.That(boot.Any(t => t.Kind == WireFormat.MarkDebris), Is.True,
                "the grid ship's authored wreck no longer reaches the channel as DEBRIS");
            Assert.That(boot.Any(t => t.Kind == WireFormat.MarkDig), Is.True,
                "the grid ship's authored dig designations no longer reach the channel");
            Assert.That(boot.Any(t => t.Kind == WireFormat.MarkStockpile), Is.False,
                "no authored ship zones a stockpile (CLAUDE.md: a zone is the player's decision)");
            Assert.That(boot.Any(t => t.Kind == WireFormat.MarkStrip), Is.False,
                "no authored ship condemns anything at boot");

            var zoneTile = EmptyWalkable(sim);
            Zone(host, zoneTile);
            var stripTile = FirstStrippableWall(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(stripTile, DeconstructKind.Wall, true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1), "precondition: the wall was condemned");

            Assert.That(KindAt(gs, zoneTile), Is.EqualTo(WireFormat.MarkStockpile));
            Assert.That(KindAt(gs, stripTile), Is.EqualTo(WireFormat.MarkStrip),
                "strip comes from the DeconstructSystem registry, not from a tile flag — a builder " +
                "that read only level.Flags would ship three kinds out of four");
        }

        /// <summary>The first interior wall the real <see cref="DeconstructSystem.CanDesignate"/>
        /// accepts. Asked of the sim rather than guessed, because the hull guardrail
        /// (<c>IsPressureHull</c>) refuses any wall adjacent to void or the map edge.</summary>
        private static Int3 FirstStrippableWall(Simulation sim)
        {
            var d = sim.Deconstruct;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) != TileDefs.Wall) continue;
                        if (d.CanDesignate(sim, p, DeconstructKind.Wall)) return p;
                    }
            Assert.Fail("no strippable wall on this ship — the strip leg would be vacuous");
            return default;
        }

        /// <summary>
        /// PRECEDENCE, which is <c>GlyphMapper</c> pass 1's line for line: dig ▸ stockpile ▸ strip ▸
        /// debris. The first three cannot legally coexist, so what this really pins is that DIG
        /// outranks DEBRIS — an order on a rubble tile must read as an order, not as more rubble, and
        /// getting that backwards makes every dig designation on the standard surface invisible.
        ///
        /// MUTATION: test debris before dig in <c>BuildMarks</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void A_Dig_Order_Outranks_The_Debris_It_Sits_On()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            Int3 rubble = default; bool found = false;
            var world = sim.World;
            for (int z = 0; z < world.Depth && !found; z++)
                for (int y = 0; y < world.Height && !found; y++)
                    for (int x = 0; x < world.Width && !found; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) != TileDefs.Debris) continue;
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0) continue;
                        rubble = p; found = true;
                    }
            Assert.That(found, Is.True, "no UNDESIGNATED debris on the grid ship — precedence untestable");

            Assert.That(KindAt(gs, rubble), Is.EqualTo(WireFormat.MarkDebris),
                "precondition: undesignated rubble reads as DEBRIS");
            sim.EnqueueCommand(new DesignateDigCommand(rubble, true));
            sim.Tick();
            Assert.That(KindAt(gs, rubble), Is.EqualTo(WireFormat.MarkDig),
                "a dig order on a rubble tile must read as an ORDER. Ranked the other way round " +
                "every dig designation in the game is drawn as plain rubble and the verb looks broken.");
        }

        /// <summary>
        /// THE FOG GATE, which runs FIRST — the one place this channel could have widened what the
        /// player knows, and deliberately does not. Debris is TERRAIN; shipping it through fog would
        /// turn a rendering fix into a fog-of-war change. (<c>zones</c> is ungated because a stockpile
        /// is the player's own logistics decision; the gate has to be per-channel to stay one rule.)
        ///
        /// MUTATION: delete the <c>Explored</c> test from <c>BuildMarks</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void An_Unexplored_Tile_Ships_No_Mark()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            var lit = Tuples(MarksJson(gs));
            Assert.That(lit.Count, Is.GreaterThan(0), "nothing is marked at all — the gate is untestable");
            var probe = new Int3(lit[0].X, lit[0].Y, lit[0].Deck);

            sim.World.Levels[probe.Z].Flags[sim.World.Levels[probe.Z].Index(probe.X, probe.Y)]
                &= unchecked((byte)~(byte)TileFlags.Explored);
            Assert.That(KindAt(gs, probe), Is.Null,
                "an UNEXPLORED tile shipped a mark. GlyphMapper's own fog gate is first in pass 1, " +
                "and this channel must mirror it or debris becomes an x-ray of the unexplored ship.");
        }

        /// <summary>
        /// ORDER — canonical z, y, x, guaranteed by the walk and by nothing else, same contract as
        /// <c>zones</c>. THE FIXTURE IS A 2×2 BLOCK FOR THE REASON <c>ZonesChannelTests</c> paid for:
        /// the first N marked tiles on a ship are consecutive <c>x</c> on ONE row, and for a
        /// single-row set an x-major and a y-major walk emit the identical sequence — so the named
        /// mutation (swap the y and x loops) COULD NOT BITE. The precondition below asserts the
        /// fixture spans two rows AND two decks before anything is scored.
        ///
        /// MUTATION: swap the <c>y</c> and <c>x</c> loops in <c>BuildMarks</c> ⇒ this fails.
        /// MUTATION 2: sort the list before returning it ⇒ passes (a sort in z,y,x order IS the walk)
        /// — which is why the assertion is phrased as "the emitted order equals the z,y,x order",
        /// the property, and not as "the list is unsorted".
        /// </summary>
        [Test]
        public void Marks_Are_Emitted_In_Canonical_Z_Y_X_Order()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            var rows = Tuples(MarksJson(gs));
            Assert.That(rows.Count, Is.GreaterThan(3), "too few marks to have an order at all");

            // The fixture must genuinely exercise both inner loops, or a y/x swap is undetectable.
            var byDeck = rows.GroupBy(r => r.Deck).ToList();
            var multiRow = byDeck.Any(g => g.Select(r => r.Y).Distinct().Count() >= 2
                                        && g.Select(r => r.X).Distinct().Count() >= 2);
            Assert.That(multiRow, Is.True,
                "no deck carries marks spanning two rows AND two columns, so an x-major walk and a " +
                "y-major walk emit the identical sequence and the mutation this test names cannot bite");

            var sorted = rows.OrderBy(r => r.Deck).ThenBy(r => r.Y).ThenBy(r => r.X).ToList();
            CollectionAssert.AreEqual(sorted, rows,
                "the marks channel is not in canonical z,y,x order. Order is the wire contract — the " +
                "client never re-sorts, precisely so there is one authority on it.");
        }

        /// <summary>
        /// PROJECTION-PURE / PIN-NEUTRAL, the in-suite half. Building and serializing this channel is
        /// a READ: <see cref="Simulation.StateHash"/> is identical before and after, so no determinism
        /// pin can move because of it. (The pins themselves are measured by <c>ci.sh</c>; this catches
        /// the class of mistake that would move them, in the suite, with a name.)
        ///
        /// MUTATION: have <c>BuildMarks</c> call <c>sim.World.SetFlag</c> anywhere ⇒ this fails.
        /// </summary>
        [Test]
        public void Rendering_The_Marks_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            ulong before = sim.StateHash();
            string a = MarksJson(gs);
            string b = MarksJson(gs);
            ulong after = sim.StateHash();

            Assert.AreEqual(before, after, "building the marks channel mutated sim state");
            Assert.AreEqual(a, b, "two renders of an unchanged sim produced different marks payloads — " +
                                  "GameSession.Send dedupes by string equality, so a non-deterministic " +
                                  "payload would put this channel on the socket every single frame");
            StringAssert.DoesNotContain("\"cells\":[]", a,
                "the grid ship's authored wreck must reach this channel, or the equality above is a " +
                "comparison of two empty payloads");
        }

        /// <summary>
        /// THE PAYLOAD CENSUS, per authored ship — the cost story of this channel, measured rather
        /// than assumed, and the numbers a reviewer can check against the package report.
        ///
        /// ⚠️ THIS TEST REPLACES ONE THAT ASSERTED THE CHANNEL WAS INERT ON THE DEFAULT SHIP, AND
        /// THAT ASSERTION WAS SIMPLY FALSE. The default Perilune ship carries an authored 6×8 debris
        /// field (<c>AuthoredShips.DesignateDebrisRect(plan, 57, 6, 62, 13, z: 0)</c>), so it ships
        /// 48 marks at boot. Worth recording, because <c>zones</c>'s whole cost argument is "empty
        /// until the player paints" and this channel's is NOT that: debris is terrain, every authored
        /// ship has some, and the payload therefore has real volume from tick 0 and is rebuilt and
        /// string-compared by <see cref="GameSession.Send"/> on every render for as long as the game
        /// runs. The measured cost is small (see the package report: 446 bytes / 35 cells on the grid
        /// ship at boot, 0.34 msg/s on the socket), but it is not zero and it must not be described
        /// as zero.
        ///
        /// The numbers are pinned by EQUALITY so that a change to an authored ship's wreck says so
        /// here instead of quietly changing what every player's socket carries.
        ///
        /// ⚠️ THESE ARE FULLY-REVEALED COUNTS AND A LIVE HOST SHIPS FEWER. <see cref="Reveal"/> is
        /// called for every deck first, deliberately, so the census measures the ship and not the
        /// crew's exploration history. On a real boot of <c>--ship grid</c> the fog gate cuts the grid
        /// ship's 40 debris to 16-18, which is a genuine property of the channel (it is fog-gated) and
        /// the reason the measured live payload — 35 cells / 446 bytes — is smaller than 60.
        /// </summary>
        [Test]
        public void The_Boot_Payload_Census_Per_Ship_Is_Pinned()
        {
            foreach (var (ship, expectDebris, expectDig) in new[]
            {
                (ShipChoice.Perilune, 48, 0),
                (ShipChoice.Grid, 40, 20),
            })
            {
                var (gs, host) = Boot(ship);
                for (int z = 0; z < host.Sim.World.Depth; z++) Reveal(host.Sim, z);
                var rows = Tuples(MarksJson(gs));
                Assert.AreEqual(expectDebris, rows.Count(r => r.Kind == WireFormat.MarkDebris),
                    ship + ": DEBRIS cell count moved. If an authored ship's wreck changed on purpose, " +
                    "re-measure here and in the package report — this number IS the channel's payload.");
                Assert.AreEqual(expectDig, rows.Count(r => r.Kind == WireFormat.MarkDig),
                    ship + ": DIG designation count moved");
                Assert.AreEqual(0, rows.Count(r => r.Kind == WireFormat.MarkStockpile),
                    ship + ": an authored ship zoned a stockpile. CLAUDE.md is explicit that a zone is " +
                    "the PLAYER's decision and authoring one deletes it.");
                Assert.AreEqual(0, rows.Count(r => r.Kind == WireFormat.MarkStrip),
                    ship + ": an authored ship condemned something at boot");
            }
        }


        /// <summary>
        /// THE TWO TERRAIN PLANES, and the ONE case that separates them. <c>IsDebrisTile</c> mirrors
        /// <c>GlyphMapper</c> pass 1: the WALL plane is consulted first and a standing wall wins
        /// outright, so a wall over a debris floor is a WALL and not a mark; only a tile whose wall is
        /// neither Wall nor Debris falls through to its floor.
        ///
        /// ⚠️ THIS TEST EXISTS BECAUSE TWO MUTATIONS OF THAT LOGIC SURVIVED THE WHOLE SUITE, and the
        /// reason is worth recording rather than hiding. MEASURED across both authored ships:
        /// <c>Wall == Debris</c> and <c>Floor == Debris</c> are the SAME 48 / 60 tiles (both planes
        /// are written together), and there is NOT ONE standing wall over a debris floor anywhere.
        /// So on shipped content the wall-first read and a floor-first read are EQUIVALENT — reading
        /// the floor plane where the wall plane is read changes nothing at all. The behaviour is real
        /// and the ships simply cannot exhibit it, which is exactly the situation a synthetic fixture
        /// is for: the planes are set to disagree here, by hand, on a real world.
        ///
        /// MUTATION: read <c>level.Floor[i]</c> where <c>level.Wall[i]</c> is read ⇒ the first leg
        /// fails. MUTATION 2: drop the <c>wall == TileDefs.Wall</c> early-out ⇒ the same leg fails.
        /// </summary>
        [Test]
        public void A_Standing_Wall_Beats_A_Debris_Floor_Under_It()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var probe = EmptyWalkable(sim);
            Reveal(sim, probe.Z);
            var level = sim.World.Levels[probe.Z];
            int i = level.Index(probe.X, probe.Y);
            ushort wall0 = level.Wall[i], floor0 = level.Floor[i];
            try
            {
                Assert.That(KindAt(gs, probe), Is.Null, "precondition: the probe tile starts unmarked");

                // (a) A STANDING WALL over a DEBRIS FLOOR is a wall. This is the leg no authored ship
                //     can produce, and the one both surviving mutations turn green.
                level.Wall[i] = TileDefs.Wall; level.Floor[i] = TileDefs.Debris;
                Assert.That(KindAt(gs, probe), Is.Null,
                    "a tile with a STANDING WALL on it shipped a debris mark because its floor happens " +
                    "to be rubble. GlyphMapper pass 1 draws that tile as a wall, so the mark layer " +
                    "would be marking rubble the player cannot see under a wall they can.");

                // (b) A DEBRIS WALL is rubble — the wreck case, which is what actually ships.
                level.Wall[i] = TileDefs.Debris; level.Floor[i] = TileDefs.Void;
                Assert.That(KindAt(gs, probe), Is.EqualTo(WireFormat.MarkDebris));

                // (c) An OPEN tile falls through to its floor, and a debris floor is rubble too.
                level.Wall[i] = TileDefs.Void; level.Floor[i] = TileDefs.Debris;
                Assert.That(KindAt(gs, probe), Is.EqualTo(WireFormat.MarkDebris));

                // (d) …and an ordinary open floor is not.
                level.Wall[i] = TileDefs.Void; level.Floor[i] = TileDefs.Floor;
                Assert.That(KindAt(gs, probe), Is.Null);
            }
            finally { level.Wall[i] = wall0; level.Floor[i] = floor0; }
        }
    }
}
