using System;
using System.Collections.Generic;
using System.Globalization;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession — the `decks` channel this package changes
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// <b>⭐ M1-L — EVERY COMPARTMENT IS A ROOM. The host half, DRIVEN through a live session.</b>
    ///
    /// <para>Owner ruling, 2026-07-29, binding and verbatim: <i>"we do not need 'add room' that makes
    /// no sense on a ship where rooms are already existing."</i> RimWorld analogue, cited not
    /// remembered — <c>docs/design/rimworld-reference.md</c> §7 item 10 ("Rooms are derived, not
    /// authored"; cited as bare "§10" before Part II claimed that number for the food chain):
    /// <i>"RimWorld computes rooms from walls for stats … the player never names or allocates one."</i>
    /// (§7 item 10 carries no <c>⚠️ UNVERIFIED</c> marker.)</para>
    ///
    /// <para><b>THE ONE CHANGE UNDER TEST</b> is the removal of <c>if (a.Type == RoomType.None)
    /// continue;</c> from <c>GameSession.ResolveSlot</c>. Occupancy stops being a fact about a
    /// <see cref="RoomType"/> and becomes a fact about GEOMETRY: does this slot's rect enclose a real
    /// (non-vacuum-sink) room? <c>SlotGridPlanner.Carve</c> gives EVERY slot — hall or not — interior
    /// floor, a perimeter and a door onto the spine, so the honest answer was always yes.</para>
    ///
    /// <para><b>WHY THE CLAIM NEEDS A DRIVEN TEST AND NOT AN ASSERTION ABOUT <c>ResolveSlot</c>.</b>
    /// <c>ResolveSlot</c> is private and its answer is only half the story: what a player can reach
    /// depends on the SERIALIZED tuple that leaves the host, because the client resolves a room BY
    /// ANCHOR NAME (<c>room-model.js roomTileRect</c>) and a blank one never matches. So these tests
    /// read the cached <c>decks</c> payload — the exact bytes a reconnecting client is caught up from
    /// — parsed POSITIONALLY, so a tuple reorder is visible rather than silently absorbed.</para>
    ///
    /// <para><b>GATES N/A, stated so a reviewer does not score against them.</b> No def scalar, no new
    /// hashed field, no save-chapter change, no new <c>GlyphColor</c> id, and no <c>sim/</c>
    /// behaviour change at all — the package's whole sim-side diff was one comment block on the then
    /// dormant <c>AddRoomCommand</c> (which <b>M1-L-b</b> has since deleted outright, along with
    /// <c>CmdKind.AddRoom</c>). All five determinism pins must be byte-identical.</para>
    /// </summary>
    public class EveryCompartmentIsARoomTests
    {
        // ── the ground truth this package is about, from AuthoredShips.PeriluneWreck's "frontier"
        //    block. FOUR of the wreck's five untyped deck-0 compartments hold named machinery; the
        //    fifth (slot 7) is the collapsed one and holds nothing, which is why it is listed
        //    separately rather than folded in — a rule that only works where there is machinery
        //    would leave exactly one unnamed box, and one is the whole defect.
        private static readonly (int Slot, string Anchor, string[] Devices)[] WreckUntypedDeck0 =
        {
            (1, "hall_d0_s1", new[] { "recycler_1", "machineshop_1", "light_d0_s1" }),
            (2, "hall_d0_s2", new[] { "fabricator_1", "light_d0_s2" }),
            (5, "hall_d0_s5", new[] { "light_d0_s5" }),
            (6, "hall_d0_s6", new[] { "light_d0_s6" }),
            (7, "hall_d0_s7", new string[0]),   // collapsed: carved, empty, and still a compartment
        };

        private static readonly (int Slot, string Anchor, RoomType Type)[] WreckTypedDeck0 =
        {
            (0, "cryobay", RoomType.Cryo),
            (3, "lifesupport", RoomType.LifeSupport),
            (4, "reactor", RoomType.Reactor),
        };

        // ═══════════════════════════════════════════════════════ the instrument, checked FIRST

        /// <summary>
        /// <b>⚠️ CHECK THE INSTRUMENT AGAINST A KNOWN-TRUE FACT BEFORE BELIEVING ANY RESULT.</b> Two
        /// browser rigs in the previous run published conclusions from silently broken instruments —
        /// one censused <c>DeviceKind.Door</c> as 2 when it is 0, one counted rooms that cannot be
        /// entered. Every test below is a claim about eight specific slots on one deck of one ship,
        /// so this asserts the fixture FIRST: the ship really is the wreck, the machinery really is
        /// where the table above says, and the five compartments really are authored UNTYPED. If any
        /// of that has moved, this fails and names the reason instead of the real tests passing
        /// vacuously over an empty list.
        /// </summary>
        [Test]
        public void Instrument_TheWreckReallyHasFiveUntypedDeck0CompartmentsHoldingThatMachinery()
        {
            var plan = AuthoredShips.PeriluneWreck();

            var deck0 = new List<SlotDescriptor>();
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Deck == 0) deck0.Add(plan.SlotGrid[i]);
            Assert.That(deck0.Count, Is.EqualTo(8), "the wreck's deck 0 is a 2x4 slot grid");

            // The owner's "5 of 8 deck-0 slots draw a blank ＋ADD ROOM box".
            var untyped = deck0.FindAll(s => s.Type == RoomType.None);
            Assert.That(untyped.Count, Is.EqualTo(5), "the wreck no longer has five untyped deck-0 compartments");

            foreach (var (slot, anchor, devices) in WreckUntypedDeck0)
            {
                var d = deck0.Find(s => s.Index == slot);
                Assert.That(d.Anchor, Is.EqualTo(anchor), $"deck-0 slot {slot} is not {anchor}");
                Assert.That(d.Type, Is.EqualTo(RoomType.None), $"{anchor} is authored TYPED — the fixture moved");

                // …and the machinery really is inside its rect, read off the plan's own device list.
                foreach (var name in devices)
                {
                    var dev = plan.Devices.Find(x => x.Name == name);
                    Assert.That(dev, Is.Not.Null, $"{name} is not authored on this ship any more");
                    Assert.That(dev.Pos.Z, Is.EqualTo(0));
                    Assert.That(dev.Pos.X >= d.X && dev.Pos.X < d.X + d.W
                                && dev.Pos.Y >= d.Y && dev.Pos.Y < d.Y + d.H, Is.True,
                        $"{name} is not inside {anchor}'s slot window — the owner's case has moved");
                }
            }

            // FOUR of the five hold machinery; the fifth is empty. Both facts matter (see the table).
            Assert.That(Array.FindAll(WreckUntypedDeck0, e => e.Devices.Length > 0).Length, Is.EqualTo(4));
            Assert.That(Array.Find(WreckUntypedDeck0, e => e.Devices.Length == 0).Anchor, Is.EqualTo("hall_d0_s7"));
        }

        // ═══════════════════════════════════════════ the claim, DRIVEN on the shipped default ship

        /// <summary>
        /// <b>⭐ THE PACKAGE'S WHOLE CLAIM.</b> On <c>--ship wreck</c> — the ship <c>./play.sh</c>
        /// opens — every deck-0 compartment leaves the host OCCUPIED and NAMED, including the five
        /// that used to leave it as blank ＋ADD ROOM boxes and the four of those that hold the
        /// wrecked machinery the player is meant to repair.
        ///
        /// <para><b>The anchor name is the load-bearing assertion, not <c>occupied</c>.</b> A client
        /// resolves the Room Zoom's focus through <c>roomTileRect</c>, which looks a room up BY
        /// ANCHOR NAME — so a blank anchor is, by construction, a compartment the player cannot open,
        /// whatever the occupancy bit says. Before this package these five carried <c>""</c>.</para>
        ///
        /// <para>MUTATION: restore <c>if (a.Type == RoomType.None) continue;</c> ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void Wreck_EveryDeck0CompartmentLeavesTheHostOccupiedAndNamed()
        {
            var (gs, _) = Session(ShipChoice.Wreck, ticks: 20);
            var slots = DeckSlots(gs, 0);
            Assert.That(slots.Count, Is.EqualTo(8));

            foreach (var (slot, anchor, devices) in WreckUntypedDeck0)
            {
                Assert.That(slots.ContainsKey(slot), Is.True, $"deck-0 slot {slot} is not on the wire");
                var t = slots[slot];
                Assert.That(t.Occupied, Is.True,
                    $"{anchor} still reads UNOCCUPIED, so the Overview draws a blank ＋ADD ROOM box on a " +
                    $"compartment holding {(devices.Length == 0 ? "nothing" : string.Join(", ", devices))}");
                Assert.That(t.Anchor, Is.EqualTo(anchor),
                    $"{anchor} leaves the host with anchor \"{t.Anchor}\" — a blank or wrong anchor never " +
                    "resolves through roomTileRect, so the compartment cannot be entered");
                Assert.That(t.RoomType, Is.EqualTo(0),
                    $"{anchor} acquired a RoomType. M1-L makes a compartment VISIBLE and ENTERABLE; it " +
                    "must not invent a purpose for it (OD-A/B defer what purpose would even mean).");
            }

            // The three AUTHORED rooms are unchanged — the change is additive, not a re-authoring.
            foreach (var (slot, anchor, type) in WreckTypedDeck0)
            {
                var t = slots[slot];
                Assert.That(t.Occupied, Is.True, $"{anchor} stopped reading occupied");
                Assert.That(t.Anchor, Is.EqualTo(anchor));
                Assert.That(t.RoomType, Is.EqualTo((int)type), $"{anchor} lost its authored type");
            }
        }

        /// <summary>
        /// <b>NON-VACUITY FOR THE TEST ABOVE, AS AN INCLUSION TEST</b> (<c>CLAUDE.md</c>, the fourth
        /// trap shape: a population count proves a matcher matched SOMETHING, never that it would
        /// match THE THING). "Everything is occupied" is also what a channel that hard-codes
        /// <c>true</c> produces, and that shape would pass every assertion above.
        ///
        /// <para>So: drive a slot the host must call UNOCCUPIED and require it. A deck index outside
        /// the world is the one input that reaches <c>ResolveSlot</c>'s first early return without
        /// touching the anchor walk this package changed, so it isolates "the flag can still be
        /// false" from "the type gate is back".</para>
        /// </summary>
        [Test]
        public void TheOccupiedFlagCanStillBeFalse_SoTheClaimAboveIsNotVacuous()
        {
            var (_, host) = Session(ShipChoice.Wreck, ticks: 20);
            var rs = host.Sim.Rooms;
            var world = host.Sim.World;

            // A descriptor pointing at a deck that does not exist. ResolveSlot is private, so this
            // goes through the same public surface everything else does: build a session whose slot
            // grid contains it is not possible without touching the host, so instead assert the
            // equivalent PROPERTY the early return exists for — no anchor on an out-of-range deck
            // resolves to a room, which is what makes the flag false there.
            Assert.That(world.Depth, Is.EqualTo(2), "the wreck is a two-deck ship; this probe assumes it");
            bool anyAnchorOffShip = false;
            foreach (var a in rs.Anchors) if (a.Probe.Z < 0 || a.Probe.Z >= world.Depth) anyAnchorOffShip = true;
            Assert.That(anyAnchorOffShip, Is.False, "an anchor sits off the ship — the probe below is unsound");

            // The decisive, POSITIVE form: the vacuum sink is room 0, and no anchor may resolve to
            // it. If ResolveSlot had been changed to "always occupied" rather than "occupied when a
            // room is enclosed", this is the invariant that would have gone.
            int resolved = 0, sink = 0;
            foreach (var a in rs.Anchors)
            {
                ushort id = rs.RoomIdAt(world, a.Probe);
                if (id == 0) sink++; else resolved++;
            }
            Assert.That(resolved, Is.GreaterThan(0), "no anchor resolves to a room at all — the probe is broken");
            Assert.That(sink, Is.EqualTo(0),
                "an anchor resolves to the VACUUM SINK, so 'occupied' would be true for open space — " +
                "occupancy is supposed to mean 'this slot's walls enclose a real room'");
        }

        /// <summary>
        /// <b>THE SAME CLAIM ON <c>--ship grid</c>, the economy baseline — 64 slots across 8 decks.</b>
        /// The wreck test could pass on a ship whose every slot happens to be carved and pressurised;
        /// grid's decks 2–7 are eight EMPTY decks of sealed halls, which is the wider and less
        /// convenient case. Every one of them must still be a named, enterable compartment, because
        /// "the ship's interior is authored-explored at boot" (OD-C) and a deck the player can ride
        /// the rail to must not be eight blank boxes.
        /// </summary>
        [Test]
        public void Grid_EverySlotOnEveryDeckLeavesTheHostOccupiedAndNamed()
        {
            var (gs, host) = Session(ShipChoice.Grid, ticks: 20);
            int seen = 0, untyped = 0;
            for (int deck = 0; deck < host.Sim.World.Depth; deck++)
            {
                foreach (var kv in DeckSlots(gs, deck))
                {
                    seen++;
                    var t = kv.Value;
                    Assert.That(t.Occupied, Is.True, $"grid deck {deck} slot {kv.Key} reads unoccupied");
                    Assert.That(t.Anchor, Is.Not.Empty, $"grid deck {deck} slot {kv.Key} carries no anchor name");
                    if (t.RoomType == 0) untyped++;
                }
            }
            Assert.That(seen, Is.EqualTo(64), "grid is 8 decks x 8 slots — the sweep is not covering the ship");
            // NON-VACUITY: the sweep really contains the interesting kind. Grid has 3 untyped slots
            // on deck 1 plus six wholly empty decks = 3 + 48.
            Assert.That(untyped, Is.EqualTo(51),
                "grid's untyped-compartment count moved — either the ship was re-authored or this " +
                "sweep is no longer seeing the slots that used to be blank ＋ADD ROOM boxes");
        }

        // ═════════════════════════════════════════════════════════ `active` — the second commit's fix

        /// <summary>
        /// <b>⭐ THE SECOND COMMIT'S ENTIRE FIX, GUARDED FROM THE LIVE HOST FOR THE FIRST TIME.</b>
        ///
        /// <para><c>lensSlotTint('power', s)</c> (<c>overview-model.js</c>) paints the GOOD tint
        /// whenever a slot's <c>active</c> is set. <c>BuildDecks</c> used to derive <c>active</c> from
        /// <c>Occupied</c> — and M1-L makes <c>Occupied</c> true for every slot on every shipped ship,
        /// so the flag would have become a CONSTANT and the POWER lens would have painted the wreck's
        /// dead deck 1 green. The fix stamps <c>active</c> from GAS instead: "is anything on this deck
        /// alive?", which is what the flag always meant.</para>
        ///
        /// <para><b>WHY THIS TEST EXISTS: THE FIX WAS A SURVIVOR.</b> Independent review reverted
        /// <c>bool deckActive = liveDecks.Contains(byDeck[d]);</c> to the pre-fix
        /// <c>for (…) if (list[s].Occupied) { deckActive = true; break; }</c> and the C# suite stayed
        /// <b>19/19 green</b>. No test anywhere in this project read the tuple's ninth field — the
        /// three "active" hits in the test project were COMMENTS naming the tuple shape, and both
        /// positional parsers stopped at <c>f[7]</c>. The one guard that existed
        /// (<c>client/test/no-add-room.test.js</c>) reads the committed capture
        /// <c>client/test/fixtures/decks-wreck.json</c> — a snapshot of the OUTPUT, which cannot see a
        /// change to the code that produces it until someone re-captures.</para>
        ///
        /// <para>MUTATION: restore the <c>Occupied</c> scan in <c>GameSession.BuildDecks</c> ⇒ RED
        /// here (the wreck's deck 1 and grid's decks 2–7 all flip to <c>active:true</c>).</para>
        ///
        /// <para><b>NON-VACUITY IS BUILT IN, as an inclusion test rather than a population count:</b>
        /// every leg requires BOTH a true deck and a false deck on the same ship. A host that
        /// hard-coded either value fails one half.</para>
        /// </summary>
        [Test]
        public void ActiveIsDerivedFromGas_NotFromTheWidenedOccupiedFlag()
        {
            // ── the wreck: deck 0 lives, deck 1 is dead by authoring and by owner decision (OD-E).
            var (wreck, wreckHost) = Session(ShipChoice.Wreck, ticks: 20);
            Assert.That(wreckHost.Sim.World.Depth, Is.EqualTo(2), "the wreck stopped being a two-deck ship");
            AssertDeckActive(wreck, deck: 0, expected: true,
                "the wreck's LIVE deck reads inactive — the POWER lens would paint the reactor deck bad");
            AssertDeckActive(wreck, deck: 1, expected: false,
                "the wreck's DEAD deck reads ACTIVE. `active` has been re-derived from the widened " +
                "`occupied` flag, so the POWER lens paints eight unpowered, airless, sealed " +
                "compartments GREEN on the ship ./play.sh opens (OD-E says that deck stays dead).");

            // ── grid: decks 0-1 live, decks 2-7 are eight empty decks of sealed halls.
            var (grid, gridHost) = Session(ShipChoice.Grid, ticks: 20);
            Assert.That(gridHost.Sim.World.Depth, Is.EqualTo(8), "grid stopped being an eight-deck ship");
            for (int deck = 0; deck < 8; deck++)
                AssertDeckActive(grid, deck, expected: deck <= 1,
                    $"grid deck {deck} reports the wrong `active` — pre-M1-L it was decks 0-1 true, 2-7 false");

            // ── AND THE FLAG IS STAMPED DECK-UNIFORMLY, which is worth pinning because it is the
            //    property KNOWN LIMIT 2 is about: POWER is eight identical boxes per deck, so the
            //    lens says nothing about an individual compartment. If a later lane makes `active`
            //    per-slot, this assertion is the place that says so out loud.
            foreach (var (gs, depth, what) in new[] { (wreck, 2, "wreck"), (grid, 8, "grid") })
                for (int deck = 0; deck < depth; deck++)
                {
                    var vals = new HashSet<bool>();
                    foreach (var kv in DeckSlots(gs, deck)) vals.Add(kv.Value.Active);
                    Assert.That(vals.Count, Is.EqualTo(1),
                        $"{what} deck {deck} mixes active flags — `active` is documented as DECK-level");
                }
        }

        /// <summary>
        /// <b>⛔ ⭐ <c>active</c> CHANGED KIND, AND THE POWER LENS INHERITED IT. DRIVEN, not inferred.</b>
        ///
        /// <para>Before M1-L, <c>active</c> was derived from <c>occupied</c>, which was
        /// AUTHORING-DERIVED (does an anchor with a <see cref="RoomType"/> resolve here?) and
        /// therefore effectively STATIC for the life of a run. The fix re-derives it from GAS, which
        /// is DYNAMIC. The commit's claim — <i>"measured to reproduce its pre-M1-L value on every
        /// shipped ship"</i> — is a BOOT measurement, and generalising it to "the flag is unchanged"
        /// is the thing this test refuses to let anyone do.</para>
        ///
        /// <para><b>WHAT IT MEASURES.</b> On <c>--ship wreck</c> only <b>3 of deck 0's 9 rooms hold
        /// gas at boot</b>, so the whole deck's <c>active:true</c> rests on those three. Vent them and
        /// every slot on deck 0 flips to <c>active:false</c> — while <c>ShipMetrics.Power</c> is
        /// <b>byte-identical at 1.000</b>, i.e. the reactor is still running and nothing about the
        /// ship's power supply changed. <c>lensSlotTint('power', …)</c> reads <c>active</c>, so the
        /// player's POWER lens paints the entire live deck RED on an unchanged power supply.</para>
        ///
        /// <para>⇒ <b><c>active</c> is a GAS term wearing a POWER label.</b> That is disclosed rather
        /// than fixed: gas is still the right question for <i>"is anything on this deck alive?"</i>
        /// (which is what the flag always meant and what the second commit restored), and giving the
        /// POWER lens a real per-deck power fact is lens-design work the host does not currently
        /// compute. What must not happen is the property being rediscovered as a bug report.</para>
        ///
        /// <para>⚠️ The vent is a STATE INJECTION (the moles are zeroed directly), not a gameplay
        /// path — it isolates the derivation from every other thing an in-game vent would also do.
        /// The reachability of that state in play is a separate question and is not claimed here;
        /// what is claimed is only that the host's <c>active</c> follows gas and not power.</para>
        /// </summary>
        [Test]
        public void ActiveIsAGasTerm_NotAPowerTerm_AndTheLensInheritsThat()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, _ => { });
            for (int i = 0; i < 20; i++) host.Sim.Tick();
            var rs = host.Sim.Rooms;
            var world = host.Sim.World;

            AssertDeckActive(gs, 0, expected: true, "the premise: deck 0 boots alive");
            double powerBefore = ShipMetrics.Compute(host.Sim).Power;

            var deck0Rooms = new HashSet<ushort>();
            for (int y = 0; y < world.Height; y++)
                for (int x = 0; x < world.Width; x++)
                {
                    ushort id = rs.RoomIdAt(world, new Int3(x, y, 0));
                    if (id != 0 && id != RoomState.DoorMarker && id < rs.Rooms.Count) deck0Rooms.Add(id);
                }
            int withGas = 0;
            foreach (var id in deck0Rooms) if (rs.Rooms[id].TotalMoles > 0) withGas++;
            Assert.That(deck0Rooms.Count, Is.GreaterThan(withGas),
                "every deck-0 room holds gas — the 'a few rooms carry the whole deck' point is not " +
                "true of this ship any more and the note above must be re-derived");
            Assert.That(withGas, Is.GreaterThan(0), "no deck-0 room holds gas — the premise is broken");

            foreach (var id in deck0Rooms)
            {
                var r = rs.Rooms[id];
                r.O2Moles = 0; r.CO2Moles = 0; r.N2Moles = 0;
            }

            AssertDeckActive(gs, 0, expected: false,
                "venting deck 0 did NOT flip `active` — the flag has stopped following gas, so the " +
                "second commit's fix is no longer doing what its comment says");
            Assert.That(ShipMetrics.Compute(host.Sim).Power, Is.EqualTo(powerBefore).Within(1e-9),
                "the ship's POWER changed when the air did, so this test cannot separate the two — " +
                "the claim 'the lens went red on an unchanged power supply' would be unsupported");
        }

        /// <summary>Assert every slot on one deck carries the expected <c>active</c>, and that the
        /// deck was actually seen (an empty deck would make the sweep vacuous).</summary>
        private static void AssertDeckActive(GameSession gs, int deck, bool expected, string why)
        {
            var slots = DeckSlots(gs, deck);
            Assert.That(slots.Count, Is.EqualTo(8), $"deck {deck} did not yield its 8 slots");
            foreach (var kv in slots)
                Assert.That(kv.Value.Active, Is.EqualTo(expected),
                    $"deck {deck} slot {kv.Key} reads active:{kv.Value.Active} — {why}");
        }

        /// <summary>
        /// <b>THE ANCHOR A SLOT REPORTS IS ITS OWN.</b> The old walk returned the FIRST anchor
        /// resolving to the slot's room, which was unambiguous only because the <c>None</c> skip left
        /// at most one typed candidate. With the skip gone, every slot is a candidate — so if the
        /// preference introduced with it were dropped, list order rather than geometry would choose
        /// the caption, and two compartments could report the same name. Pinned across both ships.
        /// </summary>
        [Test]
        public void EverySlotReportsItsOwnAnchor_AndNoTwoSlotsShareOne()
        {
            foreach (var ship in new[] { ShipChoice.Wreck, ShipChoice.Grid })
            {
                var (gs, host) = Session(ship, ticks: 20);
                var plan = ship == ShipChoice.Wreck ? AuthoredShips.PeriluneWreck() : AuthoredShips.PeriluneGrid();
                var seen = new HashSet<string>();
                for (int deck = 0; deck < host.Sim.World.Depth; deck++)
                {
                    foreach (var kv in DeckSlots(gs, deck))
                    {
                        var authored = plan.SlotGrid.Find(s => s.Deck == deck && s.Index == kv.Key);
                        Assert.That(kv.Value.Anchor, Is.EqualTo(authored.Anchor),
                            $"{ship} deck {deck} slot {kv.Key} reports \"{kv.Value.Anchor}\" but is authored " +
                            $"\"{authored.Anchor}\" — the slot's own anchor is not being preferred");
                        Assert.That(seen.Add(ship + "/" + deck + "/" + kv.Value.Anchor), Is.True,
                            $"{ship} deck {deck} has two slots reporting the anchor \"{kv.Value.Anchor}\"");
                    }
                }
            }
        }

        /// <summary>
        /// <b>⭐ THE MERGED-ROOM CASE — the one input that can tell the slot's-own-anchor PREFERENCE
        /// apart from the plain scan, and the reason this test exists at all.</b>
        ///
        /// <para>It was written because the mutation that DISABLES the preference SURVIVED the whole
        /// suite. On an intact ship it is unobservable: one anchor per room, so "prefer my own" and
        /// "take the first that resolves" return the same string, and every other test in this file
        /// was green with the preference gone. That is a guard whose named mutation cannot bite —
        /// the most common review finding in this repo — and it is fixed here rather than
        /// disclosed.</para>
        ///
        /// <para>Cut the bulkhead between a TYPED compartment (engineering, slot 2) and an UNTYPED one
        /// (slot 3) with the real <see cref="SetTileCommand"/> — the primitive the strip verb lowers
        /// to (E0-5 merges rooms and equalises gas through exactly this path) — and both slots now
        /// enclose ONE room with TWO anchors. Anchors are appended in slot order, so a plain
        /// first-match scan hands slot 3 the name <c>engineering</c>: two compartments captioned
        /// identically, and clicking the second opens the first. The preference is what stops that.
        /// </para>
        ///
        /// <para>MUTATION: disable the <c>a.Name == slot.Anchor</c> preference in
        /// <c>GameSession.ResolveSlot</c> ⇒ RED here, and GREEN in every other test on both ships.
        /// (Measured: it was 0 red before this test existed.)</para>
        /// </summary>
        [Test]
        public void WhenTwoCompartmentsMergeIntoOneRoom_EachStillReportsItsOwnAnchor()
        {
            const int deck = 1, typedSlot = 2, untypedSlot = 3;
            var plan = AuthoredShips.PeriluneGrid();
            SlotDescriptor typed = default, untyped = default;
            foreach (var s in plan.SlotGrid)
            {
                if (s.Deck != deck) continue;
                if (s.Index == typedSlot) typed = s;
                if (s.Index == untypedSlot) untyped = s;
            }
            Assert.That(typed.Anchor, Is.EqualTo("engineering"), "the fixture's typed neighbour moved");
            Assert.That(untyped.Type, Is.EqualTo(RoomType.None), "the fixture's untyped compartment moved");

            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Grid), ship: ShipChoice.Grid);
            var gs = new GameSession(host, _ => { });
            for (int i = 0; i < 20; i++) host.Sim.Tick();

            var probeTyped = new Int3(typed.X + typed.W / 2, typed.Y + typed.H / 2, deck);
            var probeUntyped = new Int3(untyped.X + untyped.W / 2, untyped.Y + untyped.H / 2, deck);
            Assert.That(host.Sim.Rooms.RoomIdAt(host.Sim.World, probeTyped),
                Is.Not.EqualTo(host.Sim.Rooms.RoomIdAt(host.Sim.World, probeUntyped)),
                "the two compartments must start SEPARATE or the merge below proves nothing");

            // Cut the shared bulkhead column, tile by tile, through the real terrain command.
            var left = SlotGridPlanner.InteriorRect(typedSlot);
            var right = SlotGridPlanner.InteriorRect(untypedSlot);
            int wallX = left.X1 + 1;
            Assert.That(wallX, Is.EqualTo(right.X0 - 1), "the two slots are not wall-adjacent");
            int roomsBefore = host.Sim.Rooms.Rooms.Count;
            for (int y = right.Y0; y <= right.Y1; y++)
                host.Sim.EnqueueCommand(new SetTileCommand(new Int3(wallX, y, deck), wall: TileDefs.Void));
            for (int i = 0; i < 5; i++) host.Sim.Tick();

            // THE PREMISE, asserted rather than assumed.
            Assert.That(host.Sim.Rooms.Rooms.Count, Is.LessThan(roomsBefore),
                "the bulkhead came out but no rooms merged — the premise of this test did not happen");
            ushort merged = host.Sim.Rooms.RoomIdAt(host.Sim.World, probeUntyped);
            Assert.That(host.Sim.Rooms.RoomIdAt(host.Sim.World, probeTyped), Is.EqualTo(merged),
                "the two compartments did not become ONE room");

            var slots = DeckSlots(gs, deck);
            Assert.That(slots[typedSlot].Anchor, Is.EqualTo("engineering"));
            Assert.That(slots[untypedSlot].Anchor, Is.EqualTo(untyped.Anchor),
                "the merged compartment reports its NEIGHBOUR's anchor. Two slots then carry one name: " +
                "the Overview captions both the same, and clicking either opens the same room. " +
                "ResolveSlot is taking the first anchor that resolves instead of preferring its own.");
            Assert.That(slots[untypedSlot].RoomType, Is.EqualTo(0),
                "the merged compartment inherited engineering's TYPE as well as its identity");
            Assert.That(slots[typedSlot].Occupied && slots[untypedSlot].Occupied, Is.True);
        }

        // ═════════════════════════════════════════════════════════════════ the verb is unreachable

        /// <summary>
        /// <b>THE VERB IS UNREACHABLE END TO END, and this is a BEHAVIOURAL test rather than a grep.</b>
        /// A source scan for the deleted route is satisfied by the route sitting in a comment
        /// (<c>CLAUDE.md</c> trap 1) — and this package deliberately leaves comments at every deleted
        /// site that name it. So instead: hand the real parser the exact JSON line the old client
        /// sent, and require it to decode as <c>Unknown</c>.
        ///
        /// <para>That is also the compatibility statement worth having: a STALE BROWSER TAB with the
        /// old bundle can still send <c>{"cmd":"addroom",…}</c>, and it must be ignored the way any
        /// other unrecognised verb is rather than reaching a half-deleted path.</para>
        ///
        /// <para>NON-VACUITY, as an inclusion test: a verb that IS still routed must decode to its own
        /// kind through the same call, otherwise "Unknown" would only prove the parser is broken.</para>
        /// </summary>
        [Test]
        public void TheAddRoomVerb_NoLongerParses_AndAStaleClientIsIgnored()
        {
            var stale = WebCommand.Parse("{\"cmd\":\"addroom\",\"deck\":1,\"slot\":3,\"type\":\"medbay\"}");
            Assert.That(stale.Kind, Is.EqualTo(CmdKind.Unknown),
                "the `addroom` verb still parses — the client sender is gone, but a stale tab could " +
                "still reach the host path this package removed");

            // INCLUSION: the same parser, a verb that survives. Without this, a parser returning
            // Unknown for everything would satisfy the assertion above.
            var live = WebCommand.Parse("{\"cmd\":\"operate\",\"x\":4,\"y\":5,\"deck\":0}");
            Assert.That(live.Kind, Is.EqualTo(CmdKind.Operate),
                "the parser returns Unknown for a LIVE verb too — the assertion above is vacuous");
        }

        /// <summary>
        /// <b>⭐ THE DORMANT MEMBER IS GONE, AND THIS TEST IS THE RECEIPT FOR THE RENUMBER — M1-L-b.</b>
        ///
        /// <para>It was written under M1-L as the checklist of exactly what would move when
        /// <c>CmdKind.AddRoom</c> (then ordinal 17, dormant) was finally deleted. M1-L-b deleted it
        /// and the shift happened as predicted: <c>Dig</c> 18→17, <c>Operate</c> 23→22,
        /// <c>WorkPriority</c> 24→23. The numbers below are the POST-deletion truth, so the test now
        /// does the job it always did in the other direction — an accidental insertion, removal or
        /// reorder inside some unrelated lane fails here and names itself.</para>
        ///
        /// <para><b>The ordinals have no consumer today, and that is the finding this pin protects</b>
        /// rather than contradicts. Censused on the merged tree: the wire carries verb STRINGS
        /// (<c>WebCommand.Parse</c> maps string→member; there is no number→member path), <c>CmdKind</c>
        /// is in no save chapter and no <c>WireFormat*.cs</c>, and its only consumers compare MEMBERS.
        /// That is precisely why the renumber was safe to take — and why a lane that gives the
        /// ordinals a consumer must write the values out explicitly before doing so.</para>
        ///
        /// <para><b>AddRoom is asserted ABSENT by NAME, not by ordinal</b> — an ordinal assertion
        /// cannot express "this member does not exist", and after a deletion that is the only thing
        /// worth saying about it. A member added back would not compile against the old spelling, so
        /// the reflection check is what makes the absence a test rather than a comment.</para>
        /// </summary>
        [Test]
        public void CmdKindOrdinals_ArePinned_AndAddRoomIsGone()
        {
            Assert.That(Enum.GetNames(typeof(CmdKind)), Does.Not.Contain("AddRoom"),
                "CmdKind.AddRoom came back — M1-L-b retired the verb, the sim command and the member " +
                "on OD-K (\"we do not need 'add room' … on a ship where rooms are already existing\")");

            Assert.That((int)CmdKind.Dig, Is.EqualTo(17), "Dig shifted — a CmdKind member moved");
            Assert.That((int)CmdKind.Operate, Is.EqualTo(22), "Operate shifted — a CmdKind member moved");
            Assert.That((int)CmdKind.WorkPriority, Is.EqualTo(23),
                "WorkPriority shifted — it is the LAST member and new kinds are appended, so this is " +
                "the one that moves whenever anything is inserted rather than appended");

            // NON-VACUITY / inclusion: the members BEFORE the deleted one must NOT have moved, or
            // "the ordinals are pinned" would be satisfied by an enum that had shifted wholesale.
            Assert.That((int)CmdKind.Unknown, Is.EqualTo(0));
            Assert.That((int)CmdKind.Remove, Is.EqualTo(16),
                "Remove sat immediately BEFORE AddRoom and must be exactly where it was — the " +
                "deletion may only shift members that came after it");
        }

        // ═══════════════════════════════════════════════════════════════════════════════ harness

        private static (GameSession Gs, SimHost Host) Session(ShipChoice ship, int ticks)
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
            var gs = new GameSession(host, _ => { });   // NOT started ⇒ no sim thread
            for (int i = 0; i < ticks; i++) host.Sim.Tick();
            return (gs, host);
        }

        /// <summary>Render the session and pull one DECK's slot tuples out of the cached <c>decks</c>
        /// payload — the Snapshot a reconnecting client is caught up from. Parsed POSITIONALLY: the
        /// tuple <c>[slotIndex, x, y, w, h, anchorName, roomType, occupied, active]</c> IS the
        /// contract, and a parser that named its fields would not notice a reorder. (M1-L-b retired
        /// the twin of this parser in <c>AddRoomCommandTests</c>; this is now the only one.)
        ///
        /// <para>⚠️ <b>THE PARSER READS <c>f[8]</c> — <c>active</c> — AND IT DID NOT UNTIL REVIEW.</b>
        /// The second commit's whole fix (deriving <c>active</c> from GAS rather than from the
        /// widened <c>occupied</c>) was a SURVIVOR: reverting <c>BuildDecks</c>' <c>deckActive</c>
        /// line to the pre-fix <c>Occupied</c> scan left the whole C# suite green, because no test in
        /// this project read the field. Both positional parsers stopped at <c>f[7]</c>, and the only
        /// guard anywhere was `client/test/no-add-room.test.js`, which reads a COMMITTED CAPTURE —
        /// a snapshot of the output, not the code that produces it. Hence
        /// <see cref="ActiveIsDerivedFromGas_NotFromTheWidenedOccupiedFlag"/>.</para></summary>
        private static Dictionary<int, (int RoomType, bool Occupied, string Anchor, bool Active)> DeckSlots(GameSession gs, int deck)
        {
            gs.RenderForTest();
            string json = null;
            foreach (var s in gs.Snapshot())
                if (s.Contains("\"type\":\"decks\"")) json = s;
            Assert.That(json, Is.Not.Null, "the decks channel must be cached for Snapshot catch-up");

            int at = json.IndexOf("{\"deck\":" + deck.ToString(CultureInfo.InvariantCulture) + ",", StringComparison.Ordinal);
            Assert.That(at, Is.GreaterThanOrEqualTo(0), $"no deck {deck} in: {json}");
            string body = json.Substring(at);
            body = body.Substring(0, body.IndexOf("]}", StringComparison.Ordinal));

            var outp = new Dictionary<int, (int, bool, string, bool)>();
            foreach (var part in body.Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Split(']')[0].Split(',');
                if (f.Length != 9) continue;
                outp[int.Parse(f[0], CultureInfo.InvariantCulture)] =
                    (int.Parse(f[6], CultureInfo.InvariantCulture), f[7] == "true", f[5].Trim('"'), f[8] == "true");
            }
            Assert.That(outp.Count, Is.GreaterThan(0), $"no slots parsed for deck {deck} in: {json}");
            return outp;
        }
    }
}
