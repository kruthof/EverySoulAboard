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

        /// <summary>
        /// THE INVARIANTCULTURE GUARD, MADE TO BITE.
        ///
        /// ⚠️ THE VERSION THAT SHIPPED FIRST COULD NOT FAIL, and the reason is worth writing down
        /// because it will be true of every "is it InvariantCulture?" test anyone writes about integer
        /// fields. It set <c>CurrentCulture</c> to de-DE and compared the output with the invariant
        /// one. <b>Those are byte-identical no matter what the emitter does</b>: <c>int.ToString()</c>
        /// uses the "G" format, which NEVER emits a group separator, and .NET renders Latin digits for
        /// every built-in culture. The only <c>NumberFormatInfo</c> knob that can reach a bare integer
        /// is <see cref="NumberFormatInfo.NegativeSign"/> — and today's four fields (two tile
        /// coordinates, a deck index and a kind id) are all non-negative. So the property was true by
        /// construction and the guard was decoration wearing the name of a guard, which is this repo's
        /// signature defect.
        ///
        /// WHAT THIS PINS INSTEAD, and why it is worth pinning at all: THE EMITTER'S DISCIPLINE. The
        /// tuple is append-only, and the day it grows a field that can be negative or fractional, a
        /// bare <c>ToString()</c> starts producing locale bytes on a de-DE dev machine and nothing
        /// else in the tree would notice. The culture below carries a custom negative sign and the
        /// cell carries negative coordinates — a shape the sim never produces, chosen precisely
        /// because it is the only shape that makes the property observable. The non-vacuity leg proves
        /// the culture really does perturb a bare <c>ToString()</c>, so this cannot silently rot back
        /// into the version it replaced.
        ///
        /// ⚠️ THE FIXTURE'S <c>Kind</c> IS NEGATIVE, AND THAT IS THE FIX FOR A NAMED MUTATION THAT
        /// COULD NOT BITE. The first version of this test carried <c>kind: 2</c>, so of the four
        /// <c>ToString</c> calls only three sat on a negative value and dropping <c>MarkIc</c> from
        /// the <c>Kind</c> one SURVIVED — while the summary claimed "any of the four". A named
        /// mutation that cannot bite, inside the test written to fix a named mutation that could not
        /// bite (<c>docs/HANDOVER.md</c> §4k, finding G1). A negative kind is no more synthetic than
        /// the negative coordinates beside it — the whole cell is a shape the sim never produces,
        /// chosen because it is the only shape that makes the property observable — so the claim is
        /// made TRUE rather than narrowed. Verified by physically applying all four mutations.
        ///
        /// MUTATION: drop <c>MarkIc</c> from any of the four <c>ToString</c> calls in
        /// <see cref="WireFormat.Marks"/> ⇒ this fails (all four verified).
        /// </summary>
        [Test]
        public void Marks_Serialization_Is_InvariantCulture()
        {
            var loud = (CultureInfo)CultureInfo.GetCultureInfo("de-DE").Clone();
            loud.NumberFormat.NegativeSign = "MINUS";

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = loud;

                // NON-VACUITY, FIRST: the culture must actually change what a bare ToString() emits,
                // or everything below is the test that could not fail, again.
                Assert.AreEqual("MINUS3", (-3).ToString(),
                    "the ambient culture does not perturb a bare int.ToString(), so this guard is " +
                    "decoration. Pick a culture knob that DOES reach an integer before trusting it.");

                // Every one of the FOUR fields is negative — see the note above: with a non-negative
                // kind, dropping MarkIc from that one call survived the guard named after it.
                var negative = new[] { new WireFormat.MarkCell(-3, -4, -1, -2) };
                StringAssert.Contains("[-3,-4,-1,-2]", WireFormat.Marks(negative),
                    "the marks emitter picked up the ambient culture's negative sign. Every number on " +
                    "this channel must go through InvariantCulture — the dev machine is de-DE, and a " +
                    "wire payload that changes with the operator's locale is not a wire payload.");

                // …and the ordinary, non-negative case is unchanged under the same loud culture, which
                // is the honest statement of today's position: the fields in use cannot express the
                // difference, and the discipline is what protects the field that one day will.
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Marks(new[] { new WireFormat.MarkCell(1234, 7, 2, 3) });
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(inv, WireFormat.Marks(new[] { new WireFormat.MarkCell(1234, 7, 2, 3) }));
                StringAssert.Contains("[1234,7,2,3]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ═══════════════════════════════════════════════════════════════════ the session bridge

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship = ShipChoice.Perilune)
        {
            var (gs, host, _) = BootWithSink(ship);
            return (gs, host);
        }

        /// <summary>As <see cref="Boot"/>, but hands back the BROADCAST SINK — every payload the
        /// session actually put on the socket, in order. Needed by the forced-render test, which is
        /// about what is BROADCAST rather than about what is cached.</summary>
        private static (GameSession gs, SimHost host, List<string> sink) BootWithSink(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Perilune
                ? SimHost.Build(SimHost.DefaultSeed)
                : SimHost.Build(ship == ShipChoice.Slice ? SimHost.SliceSeed : SimHost.DefaultSeed, ship: ship);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host, sink);
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

        /// <summary>
        /// THE DIG × STRIP UNREACHABILITY ARGUMENT, TURNED FROM A SENTENCE INTO A GUARD — and its
        /// cited reason corrected (<c>docs/HANDOVER.md</c> §4k, finding G3).
        ///
        /// ⚠️ WHAT WAS WRONG WITH THE OLD CITATION. Both this file and <c>WireFormat.Marks.cs</c>
        /// justified "dig and strip cannot share a tile" with *"<c>CanDesignate</c> refuses any wall
        /// that is not <c>TileDefs.Wall</c>"*. That is the <b>Wall</b> path only.
        /// <see cref="DeconstructSystem.CanDesignate"/>'s <b>Device</b> path returns BEFORE that check
        /// and asks nothing whatever about the tile — only whether a device is present and is not a
        /// Door. So a device sitting on a rubble tile would have made dig and strip collide, and the
        /// published argument would not have noticed.
        ///
        /// WHAT ACTUALLY CLOSES IT: no device can be on a rubble tile.
        /// <see cref="PlaceDeviceCommand"/> — the only device spawner a player can reach at runtime —
        /// requires <see cref="TileFlags.Walkable"/> AND <c>GetWall(pos) == TileDefs.Void</c>, and a
        /// Debris wall fails BOTH.
        ///
        /// ⚠️ HONEST MUTATION ACCOUNTING: THOSE TWO GUARDS ARE REDUNDANT, so a SINGLE-guard mutation
        /// is a GREEN survivor and saying otherwise would be exactly the defect this package hunts.
        /// Deleting only the <c>wall == Void</c> line leaves <c>Walkable</c> refusing the tile;
        /// deleting only the <c>Walkable</c> line leaves <c>wall == Void</c> refusing it. The claim
        /// below is therefore scoped to the CONJUNCTION.
        ///
        /// ⚠️ AND THE PARTS SEEDING BELOW IS NOT DECORATION — WITHOUT IT THIS TEST'S OWN NAMED
        /// MUTATION COULD NOT BITE. Measured: deleting BOTH tile guards left this test GREEN,
        /// because <see cref="PlaceDeviceCommand"/> has a THIRD refusal —
        /// <c>TryPay(sim.Defs.Build.DevicePlaceCost)</c> — and no authored ship carries loose
        /// <c>Parts</c> at boot, so every placement was already being refused for lack of money. The
        /// leg was passing for the wrong reason: a guard over a fixture too weak to express the
        /// failure, written INSIDE the package that exists to hunt exactly that. The fixture now
        /// funds the purchase and ASSERTS IT CAN AFFORD ONE before scoring the refusal — the house
        /// "assert the branch was REACHED before scoring its outcome" countermeasure
        /// (<c>ZonesChannelTests</c>'s anti-tautology note sets the precedent).
        ///
        /// MUTATION: delete BOTH the <c>Walkable</c> and <c>wall == Void</c> checks from
        /// <see cref="PlaceDeviceCommand"/>'s <c>Execute</c> ⇒ a device lands on rubble and this
        /// fails (verified RED only AFTER the Parts seeding; verified GREEN before it). MUTATION 2:
        /// make <see cref="DeconstructSystem.CanDesignate"/>'s Device path return <c>true</c> when no
        /// device is present ⇒ rubble accepts a strip order and this fails (verified). MUTATION 3:
        /// delete EITHER <see cref="PlaceDeviceCommand"/> tile guard alone ⇒ GREEN, by the redundancy
        /// stated above (verified) — an equivalent-in-effect mutant, recorded rather than claimed.
        /// </summary>
        [Test]
        public void No_Device_Can_Stand_On_A_Rubble_Tile_So_Dig_And_Strip_Cannot_Meet()
        {
            foreach (var ship in new[] { ShipChoice.Perilune, ShipChoice.Grid, ShipChoice.Slice })
            {
                var (_, host) = Boot(ship);
                var sim = host.Sim;
                var world = sim.World;

                var rubble = new List<Int3>();
                for (int z = 0; z < world.Depth; z++)
                    for (int y = 0; y < world.Height; y++)
                        for (int x = 0; x < world.Width; x++)
                        {
                            var p = new Int3(x, y, z);
                            if (world.GetWall(p) == TileDefs.Debris) rubble.Add(p);
                        }

                // NON-VACUITY: a ship with no rubble would pass every loop below without executing
                // one iteration — the zero-iteration guard that asserts nothing.
                Assert.That(rubble.Count, Is.GreaterThan(0),
                    ship + ": no Debris-wall tile at all, so this guard runs zero assertions");

                foreach (var p in rubble)
                {
                    Assert.That(world.GetFlags(p) & TileFlags.Walkable, Is.EqualTo((TileFlags)0),
                        ship + " " + p + ": a rubble tile is WALKABLE, so PlaceDeviceCommand's first " +
                        "guard no longer refuses it — half the dig x strip argument is gone");
                    Assert.That(sim.TryGetDeviceAt(p, out _), Is.False,
                        ship + " " + p + ": an AUTHORED device stands on rubble. PlaceDeviceCommand " +
                        "cannot produce this, but AuthoredShips calls sim.AddDevice directly, and a " +
                        "device here makes the tile both dig-able and strip-able at once");
                    Assert.That(sim.Deconstruct.CanDesignate(sim, p, DeconstructKind.Device), Is.False,
                        ship + " " + p + ": rubble accepted a DEVICE strip order, so dig and strip " +
                        "share a tile and the precedence between them stops being synthetic");
                    Assert.That(sim.Deconstruct.CanDesignate(sim, p, DeconstructKind.Wall), Is.False,
                        ship + " " + p + ": rubble accepted a WALL strip order — that is the half the " +
                        "old citation covered, and it still holds");
                }

                // …and the command itself refuses, driven for real rather than argued from source.
                // FUND IT FIRST. PlaceDeviceCommand's LAST guard is TryPay, and no authored ship
                // carries loose Parts at boot — so without this the refusal below is a refusal for
                // lack of money and the tile guards are never reached. See the note above: this is
                // the difference between a leg that bites and a leg that only looks like it does.
                int cost = sim.Defs.Build.DevicePlaceCost;
                var sample = rubble.Take(12).ToList();
                sim.AddItem(ItemKind.Parts, cost * (sample.Count + 1) + 1, EmptyWalkable(sim));
                sim.Tick();
                Assert.That(PlaceDeviceCommand.Affordable(sim), Is.GreaterThanOrEqualTo(cost),
                    ship + ": the fixture cannot afford ONE device, so every placement below is " +
                    "refused by TryPay and the tile guards this test names are never reached");

                int placed = 0;
                foreach (var p in sample)
                {
                    Assert.That(PlaceDeviceCommand.Affordable(sim), Is.GreaterThanOrEqualTo(cost),
                        ship + " " + p + ": ran out of Parts mid-loop — from here on the refusals " +
                        "are about money, not about the tile");
                    sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Locker, p));
                    sim.Tick();
                    if (sim.TryGetDeviceAt(p, out _)) placed++;
                }
                Assert.AreEqual(0, placed,
                    ship + ": PlaceDeviceCommand put " + placed + " device(s) on rubble out of " +
                    sample.Count + " FUNDED attempts. It must refuse every one — Walkable and " +
                    "wall == Void both fail on a Debris wall, and the dig x strip argument rests " +
                    "on that.");
            }
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
        /// PRECEDENCE, half of it: DIG outranks the DEBRIS it sits on. An order on a rubble tile must
        /// read as an order, not as more rubble, and getting that backwards makes every dig
        /// designation on the standard surface invisible. The other three rankings —
        /// dig ▸ strip ▸ stockpile — are pinned by
        /// <see cref="The_Full_Precedence_Order_Is_Pinned_Including_The_Pair_That_Is_REACHABLE"/>.
        ///
        /// ⚠️ THIS TEST'S OLD SUMMARY CLAIMED THE ORDER WAS *"`GlyphMapper` pass 1's line for line"*
        /// and that *"the first three cannot legally coexist"*. Both are retracted — see
        /// <c>WireFormat.Marks.cs</c>'s header. Stockpile and strip coexist with two ordinary clicks,
        /// and the channel now ranks strip ABOVE stockpile, which is NOT pass 1's order.
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
        /// runs. The measured cost is small (see the package report: ~0.3 msg/s and ~160 B/s on the
        /// socket, +61 microseconds per render), but it is not zero and it must not be described as
        /// zero.
        ///
        /// The numbers are pinned by EQUALITY so that a change to an authored ship's wreck says so
        /// here instead of quietly changing what every player's socket carries.
        ///
        /// ⚠️ THESE ARE FULLY-REVEALED COUNTS AND A LIVE HOST SHIPS FEWER — AND A LIVE COUNT IS NOT A
        /// CONSTANT. <see cref="Reveal"/> is called for every deck first, deliberately, so the census
        /// measures the SHIP and not the crew's exploration history, which is the only way to pin a
        /// number at all. On a real boot of <c>--ship grid</c> the fog gate cuts these 60 down, and
        /// then the crew keep exploring: the payload was measured at 35 cells / 446 bytes shortly
        /// after boot in one session and 50 cells / 626 bytes in another, both rising toward 60 as
        /// tiles are revealed (and falling again as digs complete). Any live figure is a SNAPSHOT
        /// and must be quoted as one — the fully-revealed 60 is the ceiling and the only stable
        /// number.
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

        /// <summary>
        /// THE FULL PRECEDENCE ORDER — dig ▸ strip ▸ stockpile ▸ debris — AND THE ONE PAIR A PLAYER
        /// CAN ACTUALLY REACH.
        ///
        /// ⚠️ THIS TEST EXISTS BECAUSE THE ORDER SHIPPED WRONG AND NOTHING CAUGHT IT. The first draft
        /// copied <c>GlyphMapper</c> pass 1 (stockpile above strip) on the strength of a header
        /// claiming the kinds "cannot legally coexist". They can:
        ///
        ///   ZONE A TILE THAT HAS A DEVICE ON IT, THEN CONDEMN THE DEVICE. Two ordinary clicks. Every
        ///   device kind is non-blocking, so the tile is walkable, zonable AND condemnable. Under the
        ///   old ranking that tile shipped <c>stockpile</c> — and the Room Zoom's mark layer SKIPS the
        ///   stockpile kind on purpose (the `zones` channel owns that tile) while the Overview draws a
        ///   slate tint, so THE ✕ APPEARED NOWHERE. That is the invisible-condemned-device bug that
        ///   cost three owner reports, reintroduced by a rendering fix.
        ///
        /// Leg (a) is therefore driven entirely through REAL COMMANDS on a real ship — no hand-set
        /// flags — because it is a state the game produces. The rest are set by hand, and are labelled
        /// SYNTHETIC because no legal command sequence reaches them: a dig target is an unwalkable
        /// Debris wall (so it cannot be zoned, and <c>DigJobSource</c> clears <c>Designated</c> on
        /// completion so a dug-out floor cannot keep it), and no device can stand on a rubble tile
        /// (so dig and strip cannot share a tile) — see
        /// <see cref="No_Device_Can_Stand_On_A_Rubble_Tile_So_Dig_And_Strip_Cannot_Meet"/>, which
        /// CORRECTS this sentence's old citation of <c>CanDesignate</c> (that is the Wall path only;
        /// <c>docs/HANDOVER.md</c> §4k finding G3). They are pinned anyway
        /// for the reason the wall-vs-floor test gives: an ordering rule that only shipped content can
        /// exercise is an ordering rule with no guard, and this file already learned that once.
        ///
        /// MUTATION: swap the dig and strip branches ⇒ leg (c) fails. MUTATION 2: swap strip and
        /// stockpile back to pass 1's order ⇒ leg (a) fails — the regression, caught. MUTATION 3: swap
        /// dig and stockpile ⇒ leg (b) fails.
        /// </summary>
        [Test]
        public void The_Full_Precedence_Order_Is_Pinned_Including_The_Pair_That_Is_REACHABLE()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Reveal(sim, tile.Z);
            var level = sim.World.Levels[tile.Z];
            int i = level.Index(tile.X, tile.Y);

            // ── (a) STOCKPILE + STRIP, THE REACHABLE PAIR, through the real commands only. ──
            sim.AddDevice(DeviceKind.Locker, tile, "marks_test_precedence");
            sim.Tick();
            sim.EnqueueCommand(new DesignateStockpileCommand(tile, true));
            sim.Tick();
            Assert.That((level.Flags[i] & (byte)TileFlags.Stockpile), Is.Not.Zero,
                "precondition: DesignateStockpileCommand really zoned a tile with a device on it — " +
                "if it refused, the reachable pair is not reachable and this leg is vacuous");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile), "zoned, not yet condemned");

            sim.EnqueueCommand(new DesignateDeconstructCommand(tile, DeconstructKind.Device, true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1),
                "precondition: the strip order registered on the zoned device, through the real command");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStrip),
                "A CONDEMNED DEVICE INSIDE A STOCKPILE ZONE SHIPPED 'stockpile'. The Room Zoom skips " +
                "the stockpile kind (the `zones` channel owns that tile) and the Overview draws a " +
                "tint, so the player's strip order is invisible on BOTH surfaces — the exact bug that " +
                "cost three owner reports. An ORDER outranks a ZONE.");

            // …and the FRAME agrees, which is the claim the old header asserted and never checked.
            // Pass 4 re-applies the condemned colour over the device unconditionally, so the frame
            // says Deconstruct here too: the channel and the projection now tell the same story.
            Assert.That(ProjectedFg(sim, tile), Is.EqualTo(GlyphColor.Deconstruct),
                "the frame and the channel disagree about a condemned, zoned device");

            // ── (b) DIG + STOCKPILE (SYNTHETIC — no command sequence reaches it). ──
            sim.EnqueueCommand(new DesignateDeconstructCommand(tile, DeconstructKind.Device, false));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(0), "precondition: the strip cleared");
            level.Flags[i] |= (byte)TileFlags.Designated;
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkDig),
                "SYNTHETIC: a dig order must outrank a stockpile zone on the same tile");

            // ── (c) DIG + STRIP (SYNTHETIC). ──
            sim.EnqueueCommand(new DesignateDeconstructCommand(tile, DeconstructKind.Device, true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1), "precondition: condemned again");
            Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkDig),
                "SYNTHETIC: a dig order must outrank a strip order on the same tile");

            // ── (d) STRIP + DEBRIS terrain (SYNTHETIC) and (e) STOCKPILE + DEBRIS (SYNTHETIC). ──
            ushort wall0 = level.Wall[i], floor0 = level.Floor[i];
            try
            {
                level.Flags[i] &= unchecked((byte)~(byte)TileFlags.Designated);
                level.Wall[i] = TileDefs.Debris;
                Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStrip),
                    "SYNTHETIC: a strip order must outrank the debris terrain under it");

                sim.EnqueueCommand(new DesignateDeconstructCommand(tile, DeconstructKind.Device, false));
                sim.Tick();
                Assert.That(KindAt(gs, tile), Is.EqualTo(WireFormat.MarkStockpile),
                    "SYNTHETIC: a stockpile zone must outrank the debris terrain under it");
            }
            finally { level.Wall[i] = wall0; level.Floor[i] = floor0; }
        }

        /// <summary>
        /// THE <c>force</c> FLAG. <see cref="GameSession.Send"/> dedupes by string equality, so an
        /// UNCHANGED payload is normally not broadcast at all — which is the whole reason this channel
        /// is cheap. A forced render must override that: it is what primes a newly-connected client
        /// and what re-asserts every channel after a state jump.
        ///
        /// ⚠️ WRITTEN BECAUSE THE MUTATION SURVIVED. Passing <c>false</c> instead of <c>force</c> at
        /// the <c>Send("marks", …)</c> call site left the whole 1016-test suite green: every other
        /// assertion in this file reads the payload out of <see cref="GameSession.Snapshot"/>, which is
        /// fed by the CACHE and is written even when nothing is broadcast. So the cache tests could not
        /// see it. This one counts what actually reached the socket.
        ///
        /// MUTATION: <c>Send("marks", …, false)</c> ⇒ the second forced render broadcasts nothing and
        /// this fails.
        /// </summary>
        [Test]
        public void A_Forced_Render_Rebroadcasts_Marks_Even_When_Nothing_Changed()
        {
            var (gs, host, sink) = BootWithSink(ShipChoice.Grid);
            for (int z = 0; z < host.Sim.World.Depth; z++) Reveal(host.Sim, z);

            gs.RenderForTest();                       // Render(force: true)
            int after1 = sink.Count(p => p.Contains("\"type\":\"marks\""));
            gs.RenderForTest();                       // same sim state, same payload
            int after2 = sink.Count(p => p.Contains("\"type\":\"marks\""));

            Assert.That(after1, Is.GreaterThanOrEqualTo(1), "the first forced render broadcast no marks at all");
            Assert.That(after2, Is.EqualTo(after1 + 1),
                "a FORCED render did not re-broadcast the marks channel. Send() dedupes unchanged " +
                "payloads, and `force` is what overrides that — it is how a newly-connected client is " +
                "primed. Dropping it makes the channel invisible to anything that is not reading the " +
                "Snapshot cache, and every other test here reads the cache.");

            // …and the dedupe itself still works, or the assertion above would pass for the wrong
            // reason (a channel that broadcasts unconditionally also satisfies it).
            var (gs2, host2, sink2) = BootWithSink(ShipChoice.Grid);
            for (int z = 0; z < host2.Sim.World.Depth; z++) Reveal(host2.Sim, z);
            gs2.RenderForTest();
            sink2.Clear();
            gs2.RenderUnforcedForTest();
            Assert.That(sink2.Count(p => p.Contains("\"type\":\"marks\"")), Is.EqualTo(0),
                "an UNCHANGED marks payload was broadcast on an unforced render — Send()'s dedupe is " +
                "not holding, and this channel would then be on the socket every single frame");
        }
    }
}
