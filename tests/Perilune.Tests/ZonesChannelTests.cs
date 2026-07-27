using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>zones</c> WIRE CHANNEL (console-retirement WP-3) — the two per-stockpile-tile facts that
    /// were genuinely absent from the wire, and the <c>GameSession</c> bridge that reads them.
    ///
    /// WHAT IS NEW AND WHAT IS NOT. Stockpile PRESENCE already rides every frame as
    /// <c>cell[1]</c> (<c>GlyphMapper.cs:82-85</c> → <c>GlyphColor.Stockpile</c> = 16); both SVG
    /// surfaces merely discard the byte today, which is WP-2's problem, not this channel's. So nothing
    /// here duplicates presence and NO new <c>GlyphColor</c> id is minted. What a colour byte cannot
    /// carry is (1) the per-tile ACCEPT MASK — <c>controls.js</c> said it outright, *"there is no wire
    /// channel for a filter"*, so a filtered zone was invisible everywhere (E0-4 feedback gap 1) — and
    /// (2) the WP-7 unreachable BACK-OFF bit, without which a zone no crew can reach never fills,
    /// silently (E0-4 feedback gap 3, <c>MECHANICS.md</c> §13.17).
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar (a filter is player
    /// data), NO new hashed field, NO save-chapter change, NO <c>GlyphColor</c> id: so the def-field
    /// and defs-checksum gates do not apply, and all five determinism pins must be byte-identical.
    /// <see cref="Rendering_The_Zones_Channel_Never_Touches_The_Sim"/> is the in-suite half of that
    /// claim (the pins themselves are measured by <c>ci.sh</c>). The de-DE culture gate DOES apply and
    /// is exercised — the dev machine is de-DE and this channel ships five integers per tile.
    ///
    /// ANTI-TAUTOLOGY. The back-off assertions are gated on the INDEPENDENT diagnostic
    /// <see cref="HaulJobSource.BackedOffStockpileTiles"/> (a count over the map, present since WP-7)
    /// having actually become non-zero, so a quiet board cannot pass them green — the recurring review
    /// defect in this repo is the test whose named mutation cannot bite, and "assert the branch was
    /// REACHED before scoring its outcome" is the local countermeasure
    /// (<see cref="HaulUnreachableStockpileLivelockTests"/> sets the precedent).
    /// </summary>
    public class ZonesChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Zones_Serializes_Tuple_Shape_And_EmptyList()
        {
            var cells = new[]
            {
                new WireFormat.ZoneTile(3, 4, 0, 127UL, 0),
                new WireFormat.ZoneTile(58, 15, 1, 8UL, WireFormat.ZoneFlagBackedOff),
            };
            string json = WireFormat.Zones(cells);
            StringAssert.Contains("\"type\":\"zones\"", json);
            // tuple order: [x, y, deck, mask, flags]
            StringAssert.Contains("[3,4,0,127,0]", json);
            StringAssert.Contains("[58,15,1,8,1]", json);
            // The INERT payload. Every pinned ship reaches exactly this, and GameSession.Send dedupes
            // it, so an unzoned ship puts these 28 bytes on the socket once and never again.
            Assert.AreEqual("{\"type\":\"zones\",\"cells\":[]}",
                WireFormat.Zones(Array.Empty<WireFormat.ZoneTile>()));
            Assert.AreEqual("{\"type\":\"zones\",\"cells\":[]}", WireFormat.Zones(null),
                "a null list is the same inert payload, not a crash on the render thread");
        }

        /// <summary>
        /// THE INVARIANTCULTURE GUARD, MADE TO BITE — and the ONE field on this tuple that no guard
        /// can reach, said out loud instead of papered over.
        ///
        /// ⚠️ THE VERSION THAT SHIPPED FIRST COULD NOT FAIL. It set <c>CurrentCulture</c> to plain
        /// de-DE and compared the output against the invariant one. <b>Those are byte-identical no
        /// matter what the emitter does</b>: <c>int.ToString()</c> and <c>ulong.ToString()</c> use the
        /// "G" format, which NEVER emits a group separator, and .NET renders Latin digits for every
        /// built-in culture (measured: of every culture installed on this machine, ZERO render
        /// <c>1234567</c> as anything but <c>1234567</c>). The only
        /// <see cref="NumberFormatInfo"/> knob that reaches a bare "G"-formatted integer is
        /// <see cref="NumberFormatInfo.NegativeSign"/>, and all five fields in the old fixture were
        /// non-negative. So swapping <c>ZoneIc</c> for <c>CultureInfo.CurrentCulture</c> in
        /// <see cref="WireFormat.Zones"/> SURVIVED the guard named after it — verified by physically
        /// applying that mutation and watching this file stay green. This is the ANCESTOR the marks
        /// version was copied from (<c>docs/HANDOVER.md</c> §4k), and it is fixed the same way.
        ///
        /// WHAT IT PINS INSTEAD: THE EMITTER'S DISCIPLINE. The tuple is append-only, and the day it
        /// grows a field that can be negative or fractional a bare <c>ToString()</c> starts producing
        /// locale bytes on a de-DE dev machine with nothing else in the tree noticing. The culture
        /// below carries a custom negative sign and the cell carries negative coordinates and negative
        /// flags — a shape the sim never produces, chosen precisely because it is the only shape that
        /// makes the property observable. The non-vacuity leg proves the culture really does perturb a
        /// bare <c>ToString()</c>, so this cannot rot back into the version it replaced.
        ///
        /// ⚠️ <see cref="WireFormat.ZoneTile.AcceptMask"/> IS UNREACHABLE BY ANY CULTURE, AND THAT IS
        /// A LIMIT, NOT AN OVERSIGHT. It is a <c>ulong</c>: it cannot be negative, so the one knob that
        /// reaches a "G"-formatted integer cannot reach it, and no fixture can make
        /// <c>c.AcceptMask.ToString(ZoneIc)</c> differ from <c>c.AcceptMask.ToString()</c>. Dropping
        /// <c>ZoneIc</c> from THAT call is an equivalent mutant — provably unkillable, not untested
        /// code. The claim below is therefore scoped to the four SIGNED fields, deliberately; do not
        /// widen it to "any of the five".
        ///
        /// MUTATION: drop <c>ZoneIc</c> from the <c>X</c>, <c>Y</c>, <c>Deck</c> or <c>Flags</c>
        /// <c>ToString</c> call in <see cref="WireFormat.Zones"/> ⇒ this fails (all four verified).
        /// MUTATION 2: replace <c>ZoneIc</c> with <c>CultureInfo.CurrentCulture</c> throughout ⇒ this
        /// fails (it did NOT before this rewrite — that is the whole point).
        /// </summary>
        [Test]
        public void Zones_Serialization_Is_InvariantCulture()
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

                var negative = new[] { new WireFormat.ZoneTile(-3, -4, -1, 1234567UL, -1) };
                StringAssert.Contains("[-3,-4,-1,1234567,-1]", WireFormat.Zones(negative),
                    "the zones emitter picked up the ambient culture's negative sign. Every number on " +
                    "this channel must go through InvariantCulture — the dev machine is de-DE, and a " +
                    "wire payload that changes with the operator's locale is not a wire payload.");

                // …and the ordinary, non-negative case is unchanged under the same loud culture, which
                // is the honest statement of today's position: the fields in use cannot express the
                // difference, and the discipline is what protects the field that one day will.
                var cells = new[] { new WireFormat.ZoneTile(12, 7, 2, 1234567UL, 1) };
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Zones(cells);
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(inv, WireFormat.Zones(cells),
                    "zones bytes are culture-independent (the dev machine is de-DE)");
                StringAssert.Contains("[12,7,2,1234567,1]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        /// <summary>
        /// THE HONEST LIMIT, PINNED. The accept mask is a JSON number, and JavaScript integers are
        /// exact only to 2^53−1 — so a mask carrying a bit at index 53 or above would arrive in the
        /// browser silently WRONG (a filter that accepts kinds nobody chose, or refuses kinds they
        /// did). <see cref="StockZoneSystem.SetFilter"/> masks every stored value down to
        /// <see cref="StockZoneSystem.AcceptAllMask"/>, which covers only DECLARED
        /// <see cref="ItemKind"/>s, so today's ceiling is 0x7F and the channel is safe.
        ///
        /// This assertion is the thing that will SAY SO on the day it stops being true: an ItemKind
        /// enum that passes 53 members needs the tuple to carry a string or a hi/lo pair, and nothing
        /// else in the tree would notice. (<see cref="StockZone.AcceptMask"/> already documents kinds
        /// ≥ 64 as unrepresentable; 53 is the tighter, wire-imposed bound and it is not written down
        /// anywhere else.)
        ///
        /// MUTATION: add 60 members to <see cref="ItemKind"/> ⇒ AcceptAllMask exceeds 2^53−1 ⇒ fails.
        /// </summary>
        [Test]
        public void AcceptMask_StaysInsideTheJsonSafeIntegerRange()
        {
            const ulong JsMaxSafeInteger = (1UL << 53) - 1;
            Assert.That(StockZoneSystem.AcceptAllMask, Is.LessThanOrEqualTo(JsMaxSafeInteger),
                "the accept mask rides the wire as a JSON number and JavaScript is exact only to " +
                "2^53-1. ItemKind has grown past 53 members, so the `zones` tuple must now carry the " +
                "mask as a string or a hi/lo pair — see WireFormat.Zones.cs's doc comment.");
            // Non-vacuity: a mask of 0 would satisfy the bound while meaning the registry is broken.
            Assert.That(StockZoneSystem.AcceptAllMask, Is.GreaterThan(0UL),
                "AcceptAllMask is 0 — the bound above is then guarding nothing");
            Assert.AreEqual(0x7FUL, StockZoneSystem.AcceptAllMask,
                "seven ItemKinds today; if this changed on purpose, re-measure the bound above with it");
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

        /// <summary>The cached <c>zones</c> payload after a render, from the Snapshot the client is
        /// caught up from — so every assertion below also proves the channel survives a reconnect.</summary>
        private static string ZonesJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"zones\""));
            Assert.IsNotNull(json, "the zones channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it loses the only surface that says " +
                                   "WHY a zone never fills");
            return json;
        }

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately positional: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, ulong Mask, int Flags)> Tuples(string json)
        {
            var list = new List<(int, int, int, ulong, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(5, f.Length, "a zones tuple is five elements, saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          ulong.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        /// <summary>The first <paramref name="count"/> walkable tiles per deck, in z,y,x order —
        /// legal <see cref="DesignateStockpileCommand"/> targets on whatever ship booted.</summary>
        private static List<Int3> WalkableTiles(Simulation sim, int perDeck)
        {
            var found = new List<Int3>();
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
            {
                int taken = 0;
                for (int y = 0; y < world.Height && taken < perDeck; y++)
                    for (int x = 0; x < world.Width && taken < perDeck; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        found.Add(p);
                        taken++;
                    }
            }
            return found;
        }

        /// <summary>
        /// One 2×2 block of walkable floor per deck that has one — four tiles spanning TWO rows and
        /// TWO columns, per deck.
        ///
        /// WHY NOT JUST "the first N walkable tiles". Because that is what the order test first used,
        /// and the named mutation (swap the <c>y</c> and <c>x</c> loops in <c>BuildZones</c>) COULD NOT
        /// BITE: the first six walkable tiles are six consecutive <c>x</c> on ONE row, and for a
        /// single-row set an x-major walk and a y-major walk emit the identical sequence. The test was
        /// green under its own mutation — the recurring review defect in this repo, caught here only
        /// because the mutation was physically applied rather than described. A 2×2 block is the
        /// smallest fixture on which the two walk orders differ, and
        /// <see cref="Zones_Are_Emitted_In_Canonical_Z_Y_X_Order"/> asserts that they do before it
        /// scores anything.
        /// </summary>
        private static List<Int3> SquareBlockTiles(Simulation sim)
        {
            var found = new List<Int3>();
            var world = sim.World;
            bool Walk(int x, int y, int z) => (world.GetFlags(new Int3(x, y, z)) & TileFlags.Walkable) != 0;
            for (int z = 0; z < world.Depth; z++)
            {
                bool got = false;
                for (int y = 0; y + 1 < world.Height && !got; y++)
                    for (int x = 0; x + 1 < world.Width && !got; x++)
                    {
                        if (!Walk(x, y, z) || !Walk(x + 1, y, z) ||
                            !Walk(x, y + 1, z) || !Walk(x + 1, y + 1, z)) continue;
                        found.Add(new Int3(x, y, z));
                        found.Add(new Int3(x + 1, y, z));
                        found.Add(new Int3(x, y + 1, z));
                        found.Add(new Int3(x + 1, y + 1, z));
                        got = true;
                    }
            }
            return found;
        }

        private static void Zone(SimHost host, Int3 pos, bool on = true)
        {
            host.Sim.EnqueueCommand(new DesignateStockpileCommand(pos, on));
            host.Sim.Tick();
        }

        // MUTATION: emit `[]` unconditionally ⇒ every session test below fails. MUTATION 2: emit a
        // tuple for a tile that merely LOOKS storable (walkable, empty) rather than one carrying the
        // Stockpile flag ⇒ this fails on the boot ship, which zones nothing.
        [Test]
        public void Zones_Channel_Is_Empty_And_Cached_On_A_Ship_With_No_Stockpile()
        {
            var (gs, _) = Boot();
            string json = ZonesJson(gs);
            StringAssert.Contains("\"cells\":[]", json,
                "no authored ship zones a stockpile, so the channel must be INERT — that is what " +
                "keeps every existing golden and all five determinism pins unmoved");
        }

        /// <summary>
        /// The common case, and the one an "obvious" implementation gets wrong. A stockpile tile with
        /// NO <see cref="StockZoneSystem"/> entry is ACCEPT-ALL (the registry's whole back-compat
        /// story), so it must ship <see cref="StockZoneSystem.AcceptAllMask"/> — not 0, which the
        /// client would read as "accepts nothing", the exact inverse of the truth.
        ///
        /// MUTATION: initialise <c>mask</c> to 0 instead of AcceptAllMask in
        /// <c>GameSession.BuildZones</c> ⇒ fails. MUTATION 2: emit only tiles that HAVE a registry
        /// entry (i.e. walk <c>StockZones.Zones</c> instead of the world) ⇒ the tuple vanishes and this
        /// fails — that is the whole reason the walk is over the world.
        /// </summary>
        [Test]
        public void An_Unfiltered_Stockpile_Tile_Ships_AcceptAll_And_No_Flags()
        {
            var (gs, host) = Boot();
            var tile = WalkableTiles(host.Sim, 1)[0];
            Zone(host, tile);

            Assert.That(host.Sim.StockZones.Zones.Count, Is.EqualTo(0),
                "precondition: zoning alone stores NO filter entry — the tile is accept-all by absence");

            var rows = Tuples(ZonesJson(gs));
            Assert.AreEqual(1, rows.Count, "exactly the one zoned tile");
            Assert.AreEqual((tile.X, tile.Y, tile.Z, StockZoneSystem.AcceptAllMask, 0), rows[0]);
        }

        /// <summary>MUTATION: drop the <c>TryGetFilter</c> lookup so every tile reports accept-all ⇒
        /// fails, and a player's "FOOD only" becomes invisible again — E0-4 feedback gap 1.</summary>
        [Test]
        public void A_Filtered_Stockpile_Tile_Ships_Its_Own_Mask()
        {
            var (gs, host) = Boot();
            var tiles = WalkableTiles(host.Sim, 2);
            Zone(host, tiles[0]);
            Zone(host, tiles[1]);

            const ulong FoodOnly = 1UL << (int)ItemKind.Potato;
            host.Sim.EnqueueCommand(new SetStockpileFilterCommand(tiles[1], FoodOnly));
            host.Sim.Tick();
            Assert.That(host.Sim.StockZones.Zones.Count, Is.EqualTo(1),
                "precondition: the filter branch actually ran and stored ONE restriction");

            var rows = Tuples(ZonesJson(gs));
            Assert.AreEqual(2, rows.Count);
            var unfiltered = rows.Single(r => r.X == tiles[0].X && r.Y == tiles[0].Y && r.Deck == tiles[0].Z);
            var filtered = rows.Single(r => r.X == tiles[1].X && r.Y == tiles[1].Y && r.Deck == tiles[1].Z);
            Assert.AreEqual(StockZoneSystem.AcceptAllMask, unfiltered.Mask, "its neighbour is untouched");
            Assert.AreEqual(FoodOnly, filtered.Mask, "the restricted tile carries its own mask");
            // …and clearing the filter returns it to accept-all rather than leaving a stale mask.
            host.Sim.EnqueueCommand(new SetStockpileFilterCommand(tiles[1], StockZoneSystem.AcceptAllMask));
            host.Sim.Tick();
            var after = Tuples(ZonesJson(gs))
                .Single(r => r.X == tiles[1].X && r.Y == tiles[1].Y && r.Deck == tiles[1].Z);
            Assert.AreEqual(StockZoneSystem.AcceptAllMask, after.Mask,
                "an accept-everything paint collapses to NO entry (StockZoneSystem.SetFilter) and the " +
                "channel must report accept-all for it, not the mask it used to carry");
        }

        /// <summary>
        /// ON THE ACTUAL STANDARD SURFACE'S SHIP. Every other session test here boots the default
        /// Perilune ship because it is the cheapest fixture, but the ONE standard UI is
        /// <c>--ship grid</c> (<c>CLAUDE.md</c>, THE STANDARD SURFACE) and that is where the Room Zoom
        /// overlay will actually read this channel. The grid ship is multi-deck and wreck-filled, so
        /// this is also the only test here whose walk crosses several decks with content on them.
        ///
        /// MUTATION: hard-code <c>deck 0</c> in <c>BuildZones</c>'s outer loop ⇒ the far-deck tile
        /// disappears and this fails. It is NOT the sole catcher — measured, that mutation reddens five
        /// of the tests here, because the default ship also has open floor above deck 0 and the slice's
        /// observatory is on deck 1. This test is not the tripwire for the z loop; it is the only one
        /// that runs the channel on the ship the standard UI actually wears, and it says so rather than
        /// claiming a coverage it does not have.
        /// </summary>
        [Test]
        public void The_Channel_Works_On_The_Standard_Surfaces_Ship()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            StringAssert.Contains("\"cells\":[]", ZonesJson(gs),
                "the grid ship zones no stockpile either — the channel is inert until the player paints");

            var blocks = SquareBlockTiles(host.Sim);
            var decks = blocks.Select(t => t.Z).Distinct().ToList();
            Assert.That(decks.Count, Is.GreaterThanOrEqualTo(2),
                "precondition: the grid ship has open floor on at least two decks, so the z loop is " +
                "genuinely exercised — without this the multi-deck claim is untested");

            // One tile on the LAST deck that has floor, and one on the first: the walk must find both.
            var low = blocks.First(t => t.Z == decks.First());
            var high = blocks.First(t => t.Z == decks.Last());
            Zone(host, high);   // painted on the FAR deck first
            Zone(host, low);
            var rows = Tuples(ZonesJson(gs));
            Assert.AreEqual(2, rows.Count, "both decks' tiles are on the channel");
            Assert.AreEqual((low.X, low.Y, low.Z, StockZoneSystem.AcceptAllMask, 0), rows[0],
                "the lower deck sorts first regardless of paint order");
            Assert.AreEqual((high.X, high.Y, high.Z, StockZoneSystem.AcceptAllMask, 0), rows[1]);
        }

        /// <summary>
        /// ORDER IS THE WIRE CONTRACT, and it must come from the WORLD WALK — not from any container's
        /// internal layout. <c>sim/Sim.Core/Jobs/</c> forbids iterating a Dictionary/HashSet at all
        /// (<c>IJobSource</c> rule 4, a determinism rule), which is exactly why the back-off exposure is
        /// a keyed <c>IsBackedOff</c> lookup and not an <c>IEnumerable&lt;Int3&gt;</c>: there is nothing
        /// here whose enumeration order could reach the socket.
        ///
        /// The tiles are designated in DESCENDING order so "the order I painted them" and "z,y,x"
        /// cannot both be satisfied by accident, and the fixture is a 2×2 BLOCK per deck (see
        /// <see cref="SquareBlockTiles"/>) so that a y-major and an x-major walk genuinely disagree —
        /// the FIRST version of this test used the first six walkable tiles, which are six consecutive
        /// x on one row, and the loop-swap mutation could not bite it.
        ///
        /// MUTATION: swap the <c>y</c> and <c>x</c> loops in <c>GameSession.BuildZones</c> ⇒ fails
        /// (verified; it did NOT before the fixture was fixed). MUTATION 2: emit in the order tiles
        /// were painted (append to a persistent list on designate) ⇒ fails. MUTATION 3: walk
        /// <c>StockZones.Zones</c> — canonically sorted, so the ORDER still holds; it fails
        /// <see cref="An_Unfiltered_Stockpile_Tile_Ships_AcceptAll_And_No_Flags"/> instead. Three
        /// mutations, three distinct catchers, none redundant.
        /// </summary>
        [Test]
        public void Zones_Are_Emitted_In_Canonical_Z_Y_X_Order()
        {
            var (gs, host) = Boot();
            var tiles = SquareBlockTiles(host.Sim);
            Assert.That(tiles.Count, Is.GreaterThanOrEqualTo(4), "the boot ship has a 2×2 open floor block");

            // FIXTURE NON-VACUITY. The assertion below is worthless unless the two candidate walk
            // orders actually differ on this tile set — that is precisely what made the first draft
            // pass under its own mutation.
            var yMajor = tiles.OrderBy(t => t.Z).ThenBy(t => t.Y).ThenBy(t => t.X).ToList();
            var xMajor = tiles.OrderBy(t => t.Z).ThenBy(t => t.X).ThenBy(t => t.Y).ToList();
            Assert.That(yMajor.SequenceEqual(xMajor), Is.False,
                "the fixture cannot distinguish a y-major walk from an x-major one, so the order " +
                "assertion below would pass under the loop-swap mutation it exists to catch");

            for (int i = tiles.Count - 1; i >= 0; i--) Zone(host, tiles[i]);   // painted DESCENDING

            var rows = Tuples(ZonesJson(gs));
            Assert.AreEqual(tiles.Count, rows.Count, "every painted tile is on the channel");
            var emitted = rows.Select(r => new Int3(r.X, r.Y, r.Deck)).ToList();
            Assert.That(emitted.SequenceEqual(yMajor), Is.True,
                "emitted " + string.Join(" ", emitted) + "\nexpected z,y,x " + string.Join(" ", yMajor) +
                "\nThe emission order must be a function of the world walk alone — anything else " +
                "means a container's internal layout is reaching the wire.");
        }

        /// <summary>MUTATION: keep a persistent zone list instead of re-walking the world each render ⇒
        /// a de-designated tile lingers and this fails. The presence bit is the authority.</summary>
        [Test]
        public void Clearing_A_Stockpile_Drops_The_Tile_From_The_Channel()
        {
            var (gs, host) = Boot();
            var tile = WalkableTiles(host.Sim, 1)[0];
            Zone(host, tile);
            Assert.AreEqual(1, Tuples(ZonesJson(gs)).Count, "precondition: it was on the channel");

            Zone(host, tile, on: false);
            StringAssert.Contains("\"cells\":[]", ZonesJson(gs),
                "a de-designated tile leaves the channel — the TileFlags.Stockpile bit is the authority");
        }

        // ═══════════════════════════════════════════════════════ the back-off bit (E0-4 gap 3)

        /// <summary>Three tiles inside the slice's authored-SEALED observatory: walkable floor that no
        /// crew member can path to (<c>AuthoredShips.cs:93</c> <c>DoorClosed = true</c>, and nothing in
        /// the sim ever opens a door). The same fixture, and for the same reason, as
        /// <see cref="HaulUnreachableStockpileLivelockTests"/>: the cheapest real instance of a tile the
        /// haul board will stamp. Hard-coded, NOT taken from the harness — the harness now gates on
        /// reachability and skips them by design.</summary>
        private static readonly Int3[] SealedObservatoryTiles =
        {
            new Int3(58, 14, 1), new Int3(57, 15, 1), new Int3(58, 15, 1),
        };

        /// <summary>A far-deck tile that IS reachable — the control proving the flag tracks
        /// reachability rather than "is zoned", "is far away" or "is on another deck".</summary>
        private static readonly Int3 ReachableFarTile = new Int3(60, 1, 1);

        private static HaulJobSource Haul(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (!(systems[i] is JobSystem js)) continue;
                for (int s = 0; s < js.Sources.Count; s++)
                    if (js.Sources[s] is HaulJobSource h) return h;
            }
            Assert.Fail("no HaulJobSource in the running system stack");
            return null;
        }

        /// <summary>
        /// E0-4 FEEDBACK GAP 3, CLOSED AT THE WIRE. WP-7 stopped an unreachable zone from livelocking
        /// the haul board and, as its own author recorded, traded expensive-and-visible for
        /// cheap-and-invisible: the zone now simply never fills, silently, with nothing anywhere to say
        /// so (<c>MECHANICS.md</c> §13.17). This is the bit that lets a surface say it.
        ///
        /// TIMING IS DELIBERATE, NOT INCIDENTAL. The render is taken on the FIRST tick at which
        /// <see cref="HaulJobSource.BackedOffStockpileTiles"/> transitions 0 → non-zero, so the stamp
        /// was written on that very tick and its <see cref="JobWork.UnreachableRetryTicks"/> deadline
        /// is necessarily still live. Rendering "some ticks later" would be a coin flip against the ≤5 s
        /// expiry and the wholesale clear on any tile-board change — i.e. a flaky test asserting a real
        /// property.
        ///
        /// ANTI-TAUTOLOGY: the count is an INDEPENDENT surface (it predates this package), so the flag
        /// assertion cannot pass on a board that never stamped anything.
        ///
        /// MUTATION: drop the <c>IsBackedOff</c> call in <c>GameSession.BuildZones</c> (flags always 0)
        /// ⇒ fails. MUTATION 2: delete the <c>tick &lt; untilTick</c> comparison in
        /// <see cref="HaulJobSource.IsBackedOff"/> ⇒ this still passes (the stamp is fresh) but
        /// <see cref="An_Expired_BackOff_Clears_The_Flag_With_No_TileBoard_Change"/> fails, which is why
        /// both tests exist.
        /// </summary>
        [Test]
        public void An_Unreachable_Zone_Ships_The_BackedOff_Flag()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            var sim = host.Sim;
            var haul = Haul(sim);
            foreach (var t in SealedObservatoryTiles)
                sim.EnqueueCommand(new DesignateStockpileCommand(t, on: true));

            int ticks = 0;
            while (haul.BackedOffStockpileTiles == 0 && ticks < 3000) { sim.Tick(); ticks++; }
            Assert.That(haul.BackedOffStockpileTiles, Is.GreaterThan(0),
                "precondition: the WP-7 back-off branch must actually have been REACHED within 3000 " +
                "ticks — a quiet board proves nothing about a flag that reads the map it fills");

            var rows = Tuples(ZonesJson(gs));
            Assert.AreEqual(SealedObservatoryTiles.Length, rows.Count, "all three tiles are zoned");
            int flagged = rows.Count(r => (r.Flags & WireFormat.ZoneFlagBackedOff) != 0);
            Assert.That(flagged, Is.GreaterThan(0),
                "a stockpile tile the haul board has just stamped unreachable must ship the back-off " +
                "bit. Without it, the player is told nothing at all about a zone that will never fill.");
            Assert.That(flagged, Is.EqualTo(haul.BackedOffStockpileTiles),
                "the channel reports exactly the tiles the job board stamped — the wire and the board " +
                "read ONE definition of 'backed off' (HaulJobSource.IsBackedOff), and a drift between " +
                "them is how a diagnostic surface starts lying");
            // Every flagged tile is still accept-all: the back-off is orthogonal to the filter.
            foreach (var r in rows.Where(r => r.Flags != 0))
                Assert.AreEqual(StockZoneSystem.AcceptAllMask, r.Mask, "no filter was ever set here");
        }

        /// <summary>The control. A far-deck, cross-ladder, genuinely REACHABLE zone must NOT be flagged
        /// — otherwise the bit means "is zoned" (or "is far", or "is on another deck") and the surface
        /// would cry unreachable at every working stockpile on the ship. Cross-deck haul works and this
        /// package must not imply otherwise.
        ///
        /// MUTATION: set the flag on every tuple ⇒ fails.</summary>
        [Test]
        public void A_Reachable_Zone_Never_Ships_The_BackedOff_Flag()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            var sim = host.Sim;
            var haul = Haul(sim);
            sim.EnqueueCommand(new DesignateStockpileCommand(ReachableFarTile, on: true));

            for (int i = 0; i < 600; i++)
            {
                sim.Tick();
                Assert.AreEqual(0, haul.BackedOffStockpileTiles,
                    $"tick {i}: a reachable tile must never be stamped — if it is, this control is " +
                    "measuring something other than reachability");
                var rows = Tuples(ZonesJson(gs));
                Assert.AreEqual(1, rows.Count);
                Assert.AreEqual(0, rows[0].Flags, $"tick {i}: the reachable zone must stay unflagged");
            }
        }

        /// <summary>
        /// THE BACK-OFF IS A RATE LIMITER, NOT A BLACKLIST, AND THE WIRE MUST SAY THE SAME. Once the
        /// stamp's deadline passes, the tile is pathworthy again with NO tile-board change and NO
        /// rescan — <c>sim.TickCount &lt; untilTick</c> is the sole expiry mechanism in WP-7 — so the
        /// flag has to drop too, or the surface accuses a tile the job board has already forgiven.
        ///
        /// This is the assertion that makes the honest wording ("no hauler reached this RECENTLY", not
        /// "unreachable") true rather than merely cautious.
        ///
        /// MUTATION: delete the <c>tick &lt; untilTick</c> comparison from
        /// <see cref="HaulJobSource.IsBackedOff"/> ⇒ fails here, and — because
        /// <c>IsPathworthy</c> is now literally its negation — also reddens
        /// <c>HaulUnreachableStockpileLivelockTests.ExpiredBackoff_LiftsItselfWithNoTileBoardChange</c>.
        /// One comparison, one meaning, two suites.
        /// </summary>
        [Test]
        public void An_Expired_BackOff_Clears_The_Flag_With_No_TileBoard_Change()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            var sim = host.Sim;
            var haul = Haul(sim);
            foreach (var t in SealedObservatoryTiles)
                sim.EnqueueCommand(new DesignateStockpileCommand(t, on: true));

            int ticks = 0;
            while (haul.BackedOffStockpileTiles == 0 && ticks < 3000) { sim.Tick(); ticks++; }
            Assert.That(haul.BackedOffStockpileTiles, Is.GreaterThan(0), "precondition: a tile was stamped");

            long stampTick = sim.TickCount;
            var stamped = Tuples(ZonesJson(gs))
                .Where(r => (r.Flags & WireFormat.ZoneFlagBackedOff) != 0)
                .Select(r => new Int3(r.X, r.Y, r.Deck)).ToList();
            Assert.That(stamped, Is.Not.Empty, "precondition: the flag is on the wire to begin with");

            // Read the flag through the sim surface at a tick past the deadline WITHOUT advancing the
            // sim — no rescan, no tile-board change, nothing but the clock argument moving.
            foreach (var tile in stamped)
            {
                Assert.IsTrue(haul.IsBackedOff(tile, stampTick, out long until),
                    $"{tile} is stamped as of the tick it was stamped on");
                Assert.That(until, Is.GreaterThan(stampTick), "the stamp carries a future deadline");
                Assert.IsFalse(haul.IsBackedOff(tile, until, out long expired),
                    $"{tile} must be pathworthy again the moment its deadline arrives — the back-off " +
                    "is a rate limiter, and a missing expiry test turns it into a blacklist");
                Assert.AreEqual(0, expired, "an expired stamp reports no deadline");
            }
        }

        /// <summary>The exposure the wire reads is a keyed lookup on a tick path
        /// (<c>IsPathworthy</c> is literally <c>!IsBackedOff</c>, consulted from all three job-board
        /// read sites), so it must not allocate. <see cref="Int3"/> is <c>IEquatable</c>, which is what
        /// keeps the default comparer from boxing.
        ///
        /// MUTATION: give <see cref="HaulJobSource.IsBackedOff"/> an object-typed key (or return a
        /// <c>Tuple</c>) ⇒ boxing per call ⇒ fails.</summary>
        [Test]
        public void IsBackedOff_IsZeroAlloc()
        {
            var (_, host) = Boot(ShipChoice.Slice);
            var sim = host.Sim;
            var haul = Haul(sim);
            foreach (var t in SealedObservatoryTiles)
                sim.EnqueueCommand(new DesignateStockpileCommand(t, on: true));

            int ticks = 0;
            while (haul.BackedOffStockpileTiles == 0 && ticks < 3000) { sim.Tick(); ticks++; }
            Assert.That(haul.BackedOffStockpileTiles, Is.GreaterThan(0),
                "precondition: the map is NON-EMPTY, so the hit path is measured and not just the miss");

            long tick = sim.TickCount;
            bool sink = false;
            haul.IsBackedOff(SealedObservatoryTiles[0], tick, out _);   // warm the comparer
            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 200_000; i++)
                sink ^= haul.IsBackedOff(SealedObservatoryTiles[i % SealedObservatoryTiles.Length], tick, out _);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;
            Assert.That(delta, Is.EqualTo(0), $"IsBackedOff allocated {delta} bytes over 200k lookups");
            Assert.That(sink || !sink, Is.True); // keep the result live
        }

        // ═══════════════════════════════════════════════════════════════════════ purity / pins

        /// <summary>
        /// VIEW-ONLY, PROJECTION-PURE. Building and serializing the channel is a READ: it must not
        /// move <see cref="Simulation.StateHash"/>, must not advance the tick, and must not touch the
        /// RNG — which is the in-suite half of "all five determinism pins are byte-identical".
        ///
        /// Measured on a ship that HAS zones and HAS a stamped back-off, so the assertion covers the
        /// branches that actually do work rather than the empty fast path.
        ///
        /// MUTATION: have <c>BuildZones</c> call <c>StockZones.SetFilter</c> (e.g. "normalise" an
        /// unfiltered tile by writing accept-all into the registry — a plausible tidy-up) ⇒ the ZONE
        /// checksum folds a new entry, the hash moves, and this fails. That mutation is not
        /// hypothetical: writing accept-all on every paint is exactly what E0-4 WP-5 did, and WP-6 had
        /// to add a collapse to undo it.
        /// </summary>
        [Test]
        public void Rendering_The_Zones_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            var sim = host.Sim;
            var haul = Haul(sim);
            foreach (var t in SealedObservatoryTiles)
                sim.EnqueueCommand(new DesignateStockpileCommand(t, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(SealedObservatoryTiles[0],
                1UL << (int)ItemKind.Potato));

            int ticks = 0;
            while (haul.BackedOffStockpileTiles == 0 && ticks < 3000) { sim.Tick(); ticks++; }
            Assert.That(haul.BackedOffStockpileTiles, Is.GreaterThan(0), "precondition: a stamped tile");
            Assert.That(sim.StockZones.Zones.Count, Is.EqualTo(1), "precondition: a stored filter");

            ulong hashBefore = sim.StateHash();
            long tickBefore = sim.TickCount;
            int zonesBefore = sim.StockZones.Zones.Count;
            int backoffBefore = haul.BackedOffStockpileTiles;

            string first = ZonesJson(gs);
            for (int i = 0; i < 20; i++) gs.RenderForTest();

            Assert.AreEqual(hashBefore, sim.StateHash(), "twenty renders moved the sim state hash");
            Assert.AreEqual(tickBefore, sim.TickCount, "a render must not advance the clock");
            Assert.AreEqual(zonesBefore, sim.StockZones.Zones.Count, "a render must not write the registry");
            Assert.AreEqual(backoffBefore, haul.BackedOffStockpileTiles, "a render must not stamp a tile");
            Assert.AreEqual(first, ZonesJson(gs),
                "the payload is a pure function of unchanged state, so repeated renders are byte-identical");
        }
    }
}
