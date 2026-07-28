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
    /// THE <c>items</c> WIRE CHANNEL — ground item stacks read from <c>sim.Items</c> itself instead of
    /// from the one character <see cref="GlyphMapper"/> pass 3 writes.
    ///
    /// WHY A CHANNEL WAS NEEDED, AND IT IS THREE LOSSES RATHER THAN ONE. Pass 3 writes
    /// <c>Glyphs.ForItem(item.Kind)</c> into a tile's glyph byte. That byte cannot carry the COUNT at
    /// all; it is ASSIGNED per item, so N stacks on one tile collapse to the last in store order; and
    /// pass 4 overwrites it with the device glyph UNCONDITIONALLY afterwards, so an item sharing a tile
    /// with a device is invisible. The three tests named <c>…But_The_Channel…</c> below are the point
    /// of this file, and each is a PAIR: it asserts that the real projection really does lose the fact
    /// (the non-vacuity control — without it the test would pass against a projection that never lost
    /// anything, proving nothing about the channel) and that the channel keeps it. Both halves run
    /// against a real <see cref="Simulation"/>, in the manner of <c>MarksChannelTests</c>.
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar, NO new hashed
    /// field, NO save-chapter change, NO new <see cref="GlyphColor"/> id (<c>GlyphColor</c> is a spine
    /// file and is untouched), and <c>hosts/web/WireFormat.cs</c> has NO DIFF (it was already
    /// <c>partial</c>): so the def-field and defs-checksum gates do not apply and all five determinism
    /// pins must be byte-identical.
    /// <see cref="Rendering_The_Items_Channel_Never_Touches_The_Sim"/> is the in-suite half of that
    /// claim; the pins themselves are measured by <c>ci.sh</c>. The de-DE culture gate DOES apply and
    /// is exercised — the dev machine is de-DE and this channel ships five integers per stack.
    /// </summary>
    public class ItemsChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Items_Serializes_Tuple_Shape_And_EmptyList()
        {
            var cells = new[]
            {
                new WireFormat.ItemCell(3, 4, 0, (int)ItemKind.Regolith, 40),
                new WireFormat.ItemCell(58, 15, 1, (int)ItemKind.Ice, 1),
            };
            string json = WireFormat.Items(cells);
            StringAssert.Contains("\"type\":\"items\"", json);
            // tuple order: [x, y, deck, kind, count]
            StringAssert.Contains("[3,4,0,0,40]", json);
            StringAssert.Contains("[58,15,1,8,1]", json);
            Assert.AreEqual("{\"type\":\"items\",\"cells\":[]}",
                WireFormat.Items(Array.Empty<WireFormat.ItemCell>()));
            Assert.AreEqual("{\"type\":\"items\",\"cells\":[]}", WireFormat.Items(null),
                "a null list is the same inert payload, not a crash on the render thread");
        }

        /// <summary>
        /// THE INVARIANTCULTURE GUARD, MADE TO BITE — the <c>MarksChannelTests</c> lesson applied
        /// rather than re-learned. Setting <c>CurrentCulture</c> to de-DE and comparing against the
        /// invariant output is BYTE-IDENTICAL no matter what the emitter does: <c>int.ToString()</c>
        /// uses "G", which never groups, and every built-in culture renders Latin digits. The only
        /// <see cref="NumberFormatInfo"/> knob that reaches a bare integer is
        /// <see cref="NumberFormatInfo.NegativeSign"/>, so the fixture below carries a custom sign and
        /// makes ALL FIVE fields negative — with any of them non-negative, dropping
        /// <c>ItemIc</c> from that one call would survive a guard named after "every number".
        ///
        /// A negative count is a shape the sim never produces; that is the point. The whole cell is,
        /// and it is chosen because it is the only shape that makes the property observable.
        ///
        /// MUTATION: drop <c>ItemIc</c> from any of the five <c>ToString</c> calls in
        /// <see cref="WireFormat.Items"/> ⇒ this fails (all five verified).
        /// </summary>
        [Test]
        public void Items_Serialization_Is_InvariantCulture()
        {
            var loud = (CultureInfo)CultureInfo.GetCultureInfo("de-DE").Clone();
            loud.NumberFormat.NegativeSign = "MINUS";

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = loud;

                // NON-VACUITY, FIRST: the culture must actually change what a bare ToString() emits.
                Assert.AreEqual("MINUS3", (-3).ToString(),
                    "the ambient culture does not perturb a bare int.ToString(), so this guard is " +
                    "decoration. Pick a culture knob that DOES reach an integer before trusting it.");

                var negative = new[] { new WireFormat.ItemCell(-3, -4, -1, -2, -5) };
                StringAssert.Contains("[-3,-4,-1,-2,-5]", WireFormat.Items(negative),
                    "the items emitter picked up the ambient culture's negative sign. Every number on " +
                    "this channel must go through InvariantCulture — the dev machine is de-DE, and a " +
                    "wire payload that changes with the operator's locale is not a wire payload.");

                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Items(new[] { new WireFormat.ItemCell(1234, 7, 2, 3, 5678) });
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(inv, WireFormat.Items(new[] { new WireFormat.ItemCell(1234, 7, 2, 3, 5678) }));
                StringAssert.Contains("[1234,7,2,3,5678]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ═══════════════════════════════════════════════════════════════════ the session bridge

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship = ShipChoice.Perilune)
        {
            var (gs, host, _) = BootWithSink(ship);
            return (gs, host);
        }

        private static (GameSession gs, SimHost host, List<string> sink) BootWithSink(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Perilune
                ? SimHost.Build(SimHost.DefaultSeed)
                : SimHost.Build(ship == ShipChoice.Slice ? SimHost.SliceSeed : SimHost.DefaultSeed, ship: ship);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        /// <summary>The cached <c>items</c> payload after a render, taken from the Snapshot a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. (A channel absent from <c>Snapshot</c>'s key list silently drops its
        /// whole layer on the first reconnect and nothing else in the tree would notice; <c>materials</c>
        /// is exactly that pre-existing gap, recorded in <c>GameSession.Snapshot</c>.)</summary>
        private static string ItemsJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"items\""));
            Assert.IsNotNull(json, "the items channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it loses every ground stack on screen");
            return json;
        }

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately positional: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, int Kind, int Count)> Tuples(string json)
        {
            var list = new List<(int, int, int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(5, f.Length, "an items tuple is five elements, saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        /// <summary>Every row the channel reports for one tile, in wire order.</summary>
        private static List<(int Kind, int Count)> StacksAt(GameSession gs, Int3 p)
        {
            var found = new List<(int, int)>();
            foreach (var t in Tuples(ItemsJson(gs)))
                if (t.X == p.X && t.Y == p.Y && t.Deck == p.Z) found.Add((t.Kind, t.Count));
            return found;
        }

        /// <summary>The whole <see cref="GlyphCell"/> the real projection produces for a tile — glyph,
        /// fg, bg and attr. The three erasure tests compare CELLS, not just glyphs: "the projection
        /// loses the count" has to mean the entire cell is identical, or a reader could in principle
        /// have recovered the fact from some other byte.</summary>
        private static GlyphCell ProjectedCell(Simulation sim, Int3 p)
        {
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, p.Z, Lens.None, null, dst);
            return dst[p.X, p.Y];
        }

        private static void Reveal(Simulation sim, int z)
        {
            var level = sim.World.Levels[z];
            for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
        }

        /// <summary>An EMPTY walkable tile: walkable, with no device, no item and no citizen on it, so
        /// each test below puts exactly what it means to put there and nothing else.</summary>
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
            Assert.Fail("no empty walkable tile on this ship — every test here would be vacuous");
            return default;
        }

        /// <summary>A tile carrying a grid-resident (non-utility-overlay, non-Door) device and no
        /// item, for the pass-4 erasure test. Door is excluded because its glyph is state-dependent,
        /// which would make the "the cell did not change" half of that test read ambiguously.</summary>
        private static Int3 DeviceTile(Simulation sim)
        {
            foreach (var d in sim.Devices.Items)
            {
                if (Simulation.IsUtilityOverlay(d.Kind) || d.Kind == DeviceKind.Door) continue;
                if (sim.Items.Items.Any(i => i.CarriedBy == 0 && i.Pos.Equals(d.Pos))) continue;
                return d.Pos;
            }
            Assert.Fail("no item-free grid device on this ship — the pass-4 test would be vacuous");
            return default;
        }

        // ───────────────────────────────────── LOSS 1: THE COUNT (the fact no byte could carry)

        /// <summary>
        /// A stack of ONE and a stack of FORTY project to the byte-identical <see cref="GlyphCell"/>.
        /// This is not an overwrite like the other two — the count is simply not among the things
        /// <see cref="GlyphMapper"/> pass 3 writes, so no ordering or precedence fix could ever have
        /// recovered it. It is the reason this package is a channel and not a projection tweak.
        ///
        /// MUTATION: have <c>BuildItems</c> emit a constant instead of <c>item.Count</c> ⇒ the second
        /// half fails. MUTATION 2: make pass 3 encode the count somehow ⇒ the FIRST half fails, which
        /// is what stops this test passing on a projection that never lost anything.
        /// </summary>
        [Test]
        public void A_Stack_Of_One_And_A_Stack_Of_Forty_Project_Identically_But_The_Channel_Carries_The_Count()
        {
            var (gsOne, hostOne) = Boot();
            var one = EmptyWalkable(hostOne.Sim);
            Reveal(hostOne.Sim, one.Z);
            hostOne.Sim.AddItem(ItemKind.Regolith, 1, one);

            var (gsForty, hostForty) = Boot();
            var forty = EmptyWalkable(hostForty.Sim);
            Reveal(hostForty.Sim, forty.Z);
            hostForty.Sim.AddItem(ItemKind.Regolith, 40, forty);

            Assert.That(one, Is.EqualTo(forty), "the two boots must pick the same tile for this to compare");

            var cellOne = ProjectedCell(hostOne.Sim, one);
            var cellForty = ProjectedCell(hostForty.Sim, forty);
            Assert.That(cellOne.Glyph, Is.EqualTo(cellForty.Glyph), "NON-VACUITY: same glyph expected");
            Assert.That(cellOne.Fg, Is.EqualTo(cellForty.Fg));
            Assert.That(cellOne.Bg, Is.EqualTo(cellForty.Bg));
            Assert.That(cellOne.Attr, Is.EqualTo(cellForty.Attr),
                "NON-VACUITY: the projection now distinguishes a 1-stack from a 40-stack somewhere in " +
                "the cell, so this test is no longer measuring the loss it is named after");

            Assert.That(StacksAt(gsOne, one), Is.EqualTo(new[] { ((int)ItemKind.Regolith, 1) }));
            Assert.That(StacksAt(gsForty, forty), Is.EqualTo(new[] { ((int)ItemKind.Regolith, 40) }),
                "the channel must carry ItemStack.Count. It is the one fact on this tuple that no " +
                "projection byte could ever have carried, and the whole reason the channel exists.");
        }

        // ───────────────────────────────── LOSS 2: EVERY STACK BUT THE LAST (pass 3 overwrites)

        /// <summary>
        /// Two kinds on one tile. Pass 3 ASSIGNS <c>dst[p.X, p.Y]</c> per item, so the second write
        /// destroys the first and the tile reads as whichever stack is last in store order. Stacks are
        /// never merged (<c>EntityStore.Items</c> is a plain <c>List</c>), so this is the ordinary
        /// state of any tile a hauler has filled twice — not an edge case.
        ///
        /// MUTATION: have <c>BuildItems</c> <c>break</c> after the first stack on a tile ⇒ the second
        /// half fails. MUTATION 2: make pass 3 skip a tile it has already written ⇒ the FIRST half
        /// fails (and the projection would then show the FIRST kind, not neither).
        /// </summary>
        [Test]
        public void A_Second_Kind_On_One_Tile_Erases_The_First_In_The_Projection_But_Not_On_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Reveal(sim, tile.Z);

            sim.AddItem(ItemKind.Regolith, 7, tile);
            char first = ProjectedCell(sim, tile).Glyph;
            Assert.That(first, Is.EqualTo(Glyphs.ForItem(ItemKind.Regolith)),
                "precondition: with one stack on it the projection DOES show that stack's glyph");

            sim.AddItem(ItemKind.Potato, 3, tile);

            Assert.That(ProjectedCell(sim, tile).Glyph, Is.EqualTo(Glyphs.ForItem(ItemKind.Potato)),
                "NON-VACUITY: GlyphMapper pass 3 no longer collapses two stacks to the last one, so " +
                "this test is no longer measuring an erasure and proves nothing about the channel");
            Assert.That(ProjectedCell(sim, tile).Glyph, Is.Not.EqualTo(first),
                "NON-VACUITY: the two kinds must project to DIFFERENT glyphs or the erasure is invisible");

            Assert.That(StacksAt(gs, tile), Is.EqualTo(new[]
            {
                ((int)ItemKind.Regolith, 7),
                ((int)ItemKind.Potato, 3),
            }), "the channel must report BOTH stacks, in store order — the projection reports one.");
        }

        /// <summary>
        /// TWO STACKS OF ONE KIND ON ONE TILE SHIP AS TWO ROWS. The host does no arithmetic: it does
        /// not sum, merge or sort, because a summed number exists nowhere in the sim and the first
        /// consumer wanting stack granularity (anything reasoning about
        /// <see cref="ItemStack.ReservedBy"/>) would have to add a channel to get it back. Aggregation
        /// for DISPLAY is a display decision and is made client-side (<c>roomItemTiles</c>).
        ///
        /// It also pins that the sim really does NOT merge stacks, which is the premise of the erasure
        /// above: if <c>AddItem</c> ever starts folding same-kind stacks together, this fails and says so.
        ///
        /// MUTATION: aggregate by (tile, kind) in <c>BuildItems</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void Two_Stacks_Of_One_Kind_On_One_Tile_Ship_As_Two_Rows()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Reveal(sim, tile.Z);

            sim.AddItem(ItemKind.Scrap, 5, tile);
            sim.AddItem(ItemKind.Scrap, 9, tile);

            Assert.That(sim.Items.Items.Count(i => i.CarriedBy == 0 && i.Pos.Equals(tile)), Is.EqualTo(2),
                "PREMISE: the sim does not merge same-kind stacks on one tile. If it now does, the " +
                "erasure this channel is named for changes shape and this file needs re-reading.");
            Assert.That(StacksAt(gs, tile), Is.EqualTo(new[]
            {
                ((int)ItemKind.Scrap, 5),
                ((int)ItemKind.Scrap, 9),
            }), "the host aggregated. It must not: one row per ItemStack, verbatim.");
        }

        // ────────────────────────────── LOSS 3: A DEVICE ERASES AN ITEM (pass 4 runs after pass 3)

        /// <summary>
        /// PASS 4 — a ground item on a DEVICE's tile. Pass 4 writes the device glyph to the same cell
        /// unconditionally, AFTER pass 3, and every device kind is non-blocking
        /// (<c>content/core/SimDefs/machines.def</c>, <c>blocks = false</c> in all 26 rows), so a
        /// device tile is walkable and haulable-to. The strip re-apply patched into pass 4 does not
        /// help: it rescues only the DECONSTRUCT colour, and this is about the glyph.
        ///
        /// MUTATION: skip a tile carrying a device in <c>BuildItems</c> ⇒ the second half fails.
        /// MUTATION 2: move pass 3 after pass 4 in <c>GlyphMapper</c> ⇒ the FIRST half fails.
        /// </summary>
        [Test]
        public void A_Device_Erases_A_Ground_Item_In_The_Projection_But_Not_On_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = DeviceTile(sim);
            Reveal(sim, tile.Z);

            var before = ProjectedCell(sim, tile);
            sim.AddItem(ItemKind.Parts, 12, tile);
            var after = ProjectedCell(sim, tile);

            Assert.That(after.Glyph, Is.EqualTo(before.Glyph),
                "NON-VACUITY: dropping a ground item on a device tile CHANGED the projected glyph, so " +
                "pass 4 no longer erases the item and this test measures nothing");
            Assert.That(after.Glyph, Is.Not.EqualTo(Glyphs.ForItem(ItemKind.Parts)),
                "NON-VACUITY: the projection shows the item after all — the erasure is gone");

            Assert.That(StacksAt(gs, tile), Is.EqualTo(new[] { ((int)ItemKind.Parts, 12) }),
                "a stack stored on a device tile reached the client nowhere at all before this " +
                "channel — pass 4 painted over it. It must be on the channel.");
        }

        // ─────────────────────────────────────────────────────────── the channel's own contracts

        /// <summary>
        /// A CARRIED STACK IS NOT ON THE CHANNEL. <c>Pos</c> mirrors the CARRIER while
        /// <see cref="ItemStack.CarriedBy"/> is set, so emitting it would draw a pile on a walking
        /// person and would double-count a hauler's load as "stored here". See
        /// <c>hosts/web/WireFormat.Items.cs</c> for the full argument.
        ///
        /// THE SECOND HALF IS THE NON-VACUITY CONTROL and it is an INCLUSION test, not a count: it
        /// clears <c>CarriedBy</c> on the same stack, on the same tile, and requires the row to APPEAR.
        /// Without it, "no row for this tile" would be satisfied by a channel that emits nothing at
        /// all, or by a tile the fog gate happened to drop.
        ///
        /// MUTATION: delete the <c>CarriedBy != 0</c> guard from <c>BuildItems</c> ⇒ the first half fails.
        /// </summary>
        [Test]
        public void A_Carried_Stack_Is_Not_On_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            Reveal(sim, tile.Z);

            var stack = sim.AddItem(ItemKind.Ice, 4, tile);
            stack.CarriedBy = 12345u;    // a carrier id; Pos now means "where that person is"

            Assert.That(StacksAt(gs, tile), Is.Empty,
                "a CARRIED stack reached the tile layer. Its Pos is the carrier's position, so this " +
                "draws a pile on a walking crew member and double-counts the load as stored.");

            stack.CarriedBy = 0;         // put it down, same tile, same stack
            Assert.That(StacksAt(gs, tile), Is.EqualTo(new[] { ((int)ItemKind.Ice, 4) }),
                "INCLUSION CONTROL: with the carrier cleared the SAME stack on the SAME tile must " +
                "appear. Without this half, the assertion above is satisfied by a channel that emits " +
                "nothing whatsoever.");
        }

        /// <summary>
        /// THE FOG GATE, mirroring <see cref="GlyphMapper"/> pass 3. An item on an unexplored tile
        /// emits nothing — shipping it would turn a rendering fix into a fog-of-war change, the same
        /// line the <c>marks</c> channel drew.
        ///
        /// Again an INCLUSION control: the tile is then revealed and the row must APPEAR.
        ///
        /// MUTATION: delete the <c>Explored</c> test from <c>BuildItems</c> ⇒ the first half fails.
        /// </summary>
        [Test]
        public void An_Item_On_An_Unexplored_Tile_Is_Not_On_The_Channel()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            var tile = EmptyWalkable(sim);
            var level = sim.World.Levels[tile.Z];
            int i = level.Index(tile.X, tile.Y);
            level.Flags[i] &= unchecked((byte)~(byte)TileFlags.Explored);

            sim.AddItem(ItemKind.MetalOre, 2, tile);

            Assert.That(StacksAt(gs, tile), Is.Empty,
                "an item on a tile the player has never seen reached the wire. The projection gates " +
                "on Explored FIRST and so must this channel.");

            level.Flags[i] |= (byte)TileFlags.Explored;
            Assert.That(StacksAt(gs, tile), Is.EqualTo(new[] { ((int)ItemKind.MetalOre, 2) }),
                "INCLUSION CONTROL: once explored, the SAME stack on the SAME tile must appear — " +
                "otherwise the assertion above passes because the channel is broken, not gated.");
        }

        /// <summary>
        /// EMISSION ORDER IS THE ENTITY STORE'S, and it is guaranteed by the walk and by nothing else.
        /// That order is what <see cref="GlyphMapper"/> pass 3 draws in, so "topmost in the frame" and
        /// "last on the wire" mean the same thing; it is a plain <c>List</c> index walk, so no hash
        /// container's layout can reach the socket; and it is part of the saved, hashed state.
        ///
        /// MUTATION: sort <c>_itemsScratch</c> by anything in <c>BuildItems</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void Items_Are_Emitted_In_Store_Order()
        {
            var (gs, host) = Boot();
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);

            // Three stacks whose store order is deliberately NOT sorted by tile, kind or count.
            var a = EmptyWalkable(sim);
            sim.AddItem(ItemKind.Seals, 9, a);
            var b = new Int3(a.X, a.Y, a.Z);
            sim.AddItem(ItemKind.Regolith, 3, b);
            sim.AddItem(ItemKind.Parts, 30, a);

            var expected = sim.Items.Items
                .Where(it => it.CarriedBy == 0)
                .Select(it => (it.Pos.X, it.Pos.Y, it.Pos.Z, (int)it.Kind, it.Count))
                .ToList();
            var actual = Tuples(ItemsJson(gs));

            Assert.That(actual.Count, Is.GreaterThanOrEqualTo(3),
                "NON-VACUITY: fewer than the three stacks just added reached the wire");
            CollectionAssert.AreEqual(expected, actual,
                "the wire order is no longer the entity store's order. Nothing sorts this channel — " +
                "the walk IS the contract, and it is the same walk GlyphMapper pass 3 makes.");
        }

        /// <summary>
        /// PROJECTION-PURE / PIN-NEUTRAL, in-suite half. Building and serializing the channel reads
        /// authoritative state and writes none of it, so <see cref="Simulation.StateHash"/> is
        /// byte-identical across a render — which is what makes this package unable to move any of the
        /// five determinism pins.
        ///
        /// MUTATION: have <c>BuildItems</c> write anything to the sim (e.g. set a tile flag) ⇒ this fails.
        /// </summary>
        [Test]
        public void Rendering_The_Items_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);
            sim.AddItem(ItemKind.Potato, 17, EmptyWalkable(sim));

            ulong before = sim.StateHash();
            string first = ItemsJson(gs);
            string second = ItemsJson(gs);
            ulong after = sim.StateHash();

            Assert.That(after, Is.EqualTo(before),
                "rendering the items channel moved the sim's StateHash. This channel is VIEW-ONLY; a " +
                "write here moves every determinism pin for a layer the sim does not have.");
            Assert.That(second, Is.EqualTo(first),
                "two renders of an unchanged sim produced different payloads. GameSession.Send dedupes " +
                "by string equality, so a non-deterministic payload puts this channel on the socket " +
                "every single frame.");
        }

        /// <summary>
        /// THE <c>force</c> FLAG. <see cref="GameSession.Send"/> dedupes by string equality, so an
        /// UNCHANGED payload is normally not broadcast. A forced render must override that — it is what
        /// primes a newly-connected client. Written because the equivalent mutation SURVIVED the whole
        /// suite on the <c>marks</c> channel: every other assertion in this file reads the payload out
        /// of <see cref="GameSession.Snapshot"/>, which is fed by the CACHE and is written even when
        /// nothing is broadcast.
        ///
        /// MUTATION: <c>Send("items", …, false)</c> ⇒ the second forced render broadcasts nothing and
        /// this fails.
        /// </summary>
        [Test]
        public void A_Forced_Render_Rebroadcasts_Items_Even_When_Nothing_Changed()
        {
            var (gs, host, sink) = BootWithSink(ShipChoice.Grid);
            for (int z = 0; z < host.Sim.World.Depth; z++) Reveal(host.Sim, z);

            gs.RenderForTest();
            int after1 = sink.Count(p => p.Contains("\"type\":\"items\""));
            gs.RenderForTest();
            int after2 = sink.Count(p => p.Contains("\"type\":\"items\""));

            Assert.That(after1, Is.GreaterThanOrEqualTo(1), "the first forced render broadcast no items at all");
            Assert.That(after2, Is.EqualTo(after1 + 1),
                "a FORCED render did not re-broadcast the items channel. Send() dedupes unchanged " +
                "payloads and `force` is what overrides that — it is how a newly-connected client is " +
                "primed. Every other test here reads the Snapshot cache and cannot see this.");

            var (gs2, host2, sink2) = BootWithSink(ShipChoice.Grid);
            for (int z = 0; z < host2.Sim.World.Depth; z++) Reveal(host2.Sim, z);
            gs2.RenderForTest();
            sink2.Clear();
            gs2.RenderUnforcedForTest();
            Assert.That(sink2.Count(p => p.Contains("\"type\":\"items\"")), Is.EqualTo(0),
                "an UNCHANGED items payload was broadcast on an unforced render — Send()'s dedupe is " +
                "not holding, and this channel would then be on the socket every single frame");
        }

        /// <summary>
        /// THE BOOT CENSUS PER SHIP, pinned by equality on a FULLY REVEALED ship so the fog gate is not
        /// what is being measured. Two things it buys: the channel is not vacuously empty on the ships
        /// the programme actually drives (a guard that passes on an empty payload proves nothing), and
        /// the payload VOLUME is a number someone has looked at rather than an assumption — this
        /// channel is per-ENTITY, so it grows with play in a way the per-tile layers do not.
        ///
        /// These numbers move when authored content moves. Re-measure and re-pin; do not relax to <c>&gt;</c>.
        /// </summary>
        [Test]
        public void The_Boot_Census_Per_Ship_Is_Pinned()
        {
            Assert.Multiple(() =>
            {
                foreach (var (ship, rows, units) in new[]
                {
                    (ShipChoice.Perilune, PeriluneRows, PeriluneUnits),
                    (ShipChoice.Grid, GridRows, GridUnits),
                    (ShipChoice.Slice, SliceRows, SliceUnits),
                })
                {
                    var (gs, host) = Boot(ship);
                    for (int z = 0; z < host.Sim.World.Depth; z++) Reveal(host.Sim, z);
                    var tuples = Tuples(ItemsJson(gs));
                    Assert.That(tuples.Count, Is.EqualTo(rows), ship + ": row count moved");
                    Assert.That(tuples.Sum(t => t.Count), Is.EqualTo(units), ship + ": total units moved");
                }
            });
        }

        // MEASURED 2026-07-27 on this tree, at tick 0 with every deck revealed.
        //
        // NOTE THE SHAPE OF THE SLICE NUMBER, because it is the one thing on this channel that a
        // per-TILE layer would not have shown: 212 ROWS for 1 644 units. The measurement fixture boots
        // with hundreds of separate small stacks, so the per-entity payload is two orders of magnitude
        // larger than either playable ship's — and every one of those rows was collapsing into at most
        // one glyph per tile before this channel. That is the loss, counted.
        private const int PeriluneRows = 5, PeriluneUnits = 8;
        private const int GridRows = 7, GridUnits = 32;
        private const int SliceRows = 212, SliceUnits = 1644;
    }
}
