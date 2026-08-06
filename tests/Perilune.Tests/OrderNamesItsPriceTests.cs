using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>THE ORDER NAMES ITS PRICE</b> (T13 finding, owner-authorised 2026-08-02).
    ///
    /// <para><b>THE OUTCOME THIS FILE DRIVES:</b> <i>before you order a repair, the offer tells you
    /// which consumable it will spend — the ship's last Part is never eaten invisibly.</i></para>
    ///
    /// <para><b>THE DEFECT, MEASURED IN THE T13 RUN.</b> <c>--ship wreck</c> boots with EXACTLY ONE
    /// <c>Parts</c> unit aboard (<c>AuthoredShips.cs</c>, the WINNABILITY block) and the player's
    /// first repair order — <c>term_moss</c>, the one the whole commissioning chain hangs off — ate
    /// it. Nothing on any surface said so. <i>Invisible feedback is FUNCTIONAL.</i></para>
    ///
    /// <para>⛔ <b>THE ANSWER IS NOT <see cref="MaintenanceSystem.WantedRepairConsumable"/>, AND THAT
    /// IS THE POINT OF THE FIRST TEST.</b> That property is <c>RepairConsumableTier(0)</c>
    /// UNCONDITIONALLY — correct for the <c>blocked</c> badge it serves, which is raised only when
    /// the ship holds NONE of the three rungs, and a confident lie as a price: on a Seals-only ship
    /// it says PARTS while the service eats Seals.
    /// <see cref="TheOfferNamesTheRungTheShipACTUALLYHAS_NotTierZero"/> asserts the lie's existence
    /// beside the correct answer, so the substitution cannot pass.</para>
    ///
    /// <para><b>EVERY LEG IS DRIVEN AGAINST A REAL <see cref="Simulation"/></b> — real defs, real
    /// item store, real <see cref="SystemStack"/> — and the wire legs go through the shipping
    /// <see cref="GameSession"/> render. Nothing re-derives an expected value with the expression
    /// under test, and no determinism-pin literal is asserted here (this package moves none: no def
    /// scalar, no hashed field, no save chapter, no <c>GlyphColor</c> id).</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED (CLAUDE.md, fifth shape).</b> <c>Assert</c> throws, so a
    /// multi-leg test reports only its first failing leg and a dead leg looks exactly like a live
    /// one. Each leg below builds its own fixture, records into a local, and the results are
    /// asserted together inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class OrderNamesItsPriceTests
    {
        // ═══════════════════════════════════════════════════════════════════════════ helpers

        /// <summary>Below <c>wear.wreck_threshold</c> (0.25): the Swarf rung is legal and an
        /// empty-handed jury-rig is REFUSED, so "no consumable" means "no service at all".</summary>
        private const float BelowTheWreckFloor = 0.05f;

        /// <summary>Inside <c>[wreck_threshold, maint)</c> = [0.25, 0.40) for a Scrubber: the Swarf
        /// rung is refused and an empty-handed jury-rig is legal, so "no consumable" means
        /// "the FREE repair".</summary>
        private const float InTheJuryRigBand = 0.30f;

        /// <summary>
        /// A powered, pressurised bay with ONE wear-bearing machine at
        /// <paramref name="condition"/> and whatever loose stock the caller asks for. Deliberately
        /// the same shape as <c>RepairReserveTests.BuildBay</c> — a <see cref="DeviceKind.Scrubber"/>
        /// (<c>machines.def</c>: <c>maint 0.40</c>, <c>fail 0.10</c>) on a lit conduit run, with the
        /// stock on the far row so a service is a genuine fetch.
        /// </summary>
        private static Simulation BuildBay(float condition,
                                           int parts = 0, int seals = 0, int swarf = 0)
        {
            string[] map =
            {
                "################",
                "#..............#",
                "#..............#",
                "#..............#",
                "################",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss));

            for (int x = 1; x <= 14; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");

            var d = sim.AddDevice(DeviceKind.Scrubber, new Int3(4, 2, 0), "subject");
            d.Condition = condition;

            int slot = 1;
            for (int u = 0; u < parts; u++) sim.AddItem(ItemKind.Parts, 1, new Int3(slot++, 3, 0));
            for (int u = 0; u < seals; u++) sim.AddItem(ItemKind.Seals, 1, new Int3(slot++, 3, 0));
            for (int u = 0; u < swarf; u++) sim.AddItem(ItemKind.Swarf, 1, new Int3(slot++, 3, 0));

            sim.AddCitizen("crew0", new Int3(14, 3, 0)).GiveAllWork();

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static Device Subject(Simulation sim)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == "subject") return d;
            Assert.Fail("the fixture lost its subject machine");
            return null;
        }

        /// <summary>The price an ORDER would pay — <c>forced: true</c>, which is what every
        /// host-side caller passes and what the offer surface means.</summary>
        private static (MaintenanceSystem.RepairSpend outcome, ItemKind kind) Price(Simulation sim)
        {
            var outcome = MaintenanceSystem.WhatARepairWouldSpend(sim, Subject(sim), forced: true, out var kind);
            return (outcome, kind);
        }

        // ═══════════════════════════════ 1. THE HEADLINE — the price names the rung the ship HAS

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME, DRIVEN, AND THE LEG THAT KILLS THE TIER-0 ANSWER BY CONSTRUCTION.</b>
        /// One wrecked scrubber, three ships:
        /// <list type="bullet">
        /// <item>Parts + Seals aboard ⇒ the offer names <b>PARTS</b> (tier before distance).</item>
        /// <item>strip the Parts, leave the Seals ⇒ the offer names <b>SEALS</b>.</item>
        /// <item>strip those too, leave Swarf ⇒ the offer names <b>SWARF</b> (the machine is below
        /// the wreck floor, so the bottom rung is legal).</item>
        /// </list>
        ///
        /// <para>⛔ <b>THE THIRD ASSERTION IS THE INSTRUMENT, NOT THE FIRST.</b>
        /// <see cref="MaintenanceSystem.WantedRepairConsumable"/> is <c>Parts</c> on ALL THREE of
        /// these ships, and this test says so out loud in its own final leg — so substituting that
        /// property for the query under test passes leg 1 and fails legs 2 and 3. That is the named
        /// mutation, applied and observed red; without the tier-0 assertion a reader could not tell
        /// this suite from one that never left tier 0.</para>
        ///
        /// <para><b>THE THREE LEGS ARE SEPARATE FIXTURES</b>, so the second cannot be an artefact of
        /// the first's stock having been mutated mid-flight, and all three are asserted together
        /// (the fifth trap shape: <c>Assert</c> throws).</para>
        /// </summary>
        [Test]
        public void TheOfferNamesTheRungTheShipACTUALLYHAS_NotTierZero()
        {
            var withParts = Price(BuildBay(BelowTheWreckFloor, parts: 1, seals: 3));
            var sealsOnly = Price(BuildBay(BelowTheWreckFloor, seals: 3));
            var swarfOnly = Price(BuildBay(BelowTheWreckFloor, swarf: 3));

            Assert.Multiple(() =>
            {
                Assert.That(withParts.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable),
                    "a ship holding Parts has a paid service to offer");
                Assert.That(withParts.kind, Is.EqualTo(ItemKind.Parts),
                    "TIER BEFORE DISTANCE: a Parts stack anywhere beats a Seals stack at the machine's feet");

                Assert.That(sealsOnly.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable),
                    "a Seals-only ship still has a paid service to offer");
                Assert.That(sealsOnly.kind, Is.EqualTo(ItemKind.Seals),
                    "⛔ THE OFFER NAMED THE WRONG ITEM. This ship holds no Parts at all; the service " +
                    "will eat a SEAL. This is the exact leg MaintenanceSystem.WantedRepairConsumable " +
                    "— tier 0 unconditionally — gets wrong, and it is why the price asks the fetch " +
                    "funnel instead of the badge's property.");

                Assert.That(swarfOnly.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable),
                    "salvage is what makes a WRECK fixable at all (wreck start, owner decision 3)");
                Assert.That(swarfOnly.kind, Is.EqualTo(ItemKind.Swarf),
                    "the bottom rung is legal below wear.wreck_threshold and the price must name it");

                // ⭐ THE NON-VACUITY CONTROL FOR THE TWO LEGS ABOVE: the wrong answer really is
                // reachable and really is wrong. Without this line, "the query returned Seals" is
                // indistinguishable from a ladder that happens to start at Seals on this fixture.
                Assert.That(MaintenanceSystem.WantedRepairConsumable, Is.EqualTo(ItemKind.Parts),
                    "the tier-0 property no longer answers Parts, so the legs above have stopped " +
                    "being a test OF anything — re-derive the substitution mutation before trusting them");
            });
        }

        // ═══════════════════════════════ 2. THE TWO KINDS OF "NOTHING", WHICH ARE DIFFERENT SENTENCES

        /// <summary>
        /// ⭐ <b>AN EMPTY SHIP ANSWERS TWO DIFFERENT THINGS DEPENDING ON THE WRECK FLOOR, AND THE
        /// PLAYER'S SENTENCE DIFFERS.</b> Same stock (none), same machine kind, two conditions:
        /// <list type="bullet">
        /// <item>at 0.30 — inside <c>[wreck_threshold, maint)</c> — the crew member jury-rigs with
        /// empty hands and the ship pays NOTHING. That is a fact worth telling the player: it is the
        /// reason to pick this machine first when stock is short.</item>
        /// <item>at 0.05 — below the floor — there is NO SERVICE AT ALL (the W2 wreck rule), so
        /// there is no price to name and the surface must say nothing.</item>
        /// </list>
        ///
        /// <para><b>THE SECOND LEG IS CROSS-CHECKED AGAINST <see cref="MaintenanceSystem.IsUnfixableWreck"/>
        /// RATHER THAN ASSERTED ALONE</b> — <c>NoService</c> claims to BE that predicate, and two
        /// answers that are supposed to agree are worth measuring against each other rather than
        /// against two hand-written expectations.</para>
        /// </summary>
        [Test]
        public void AnEmptyShip_JuryRigsForFreeAboveTheFloor_AndHasNoServiceBelowIt()
        {
            var juryRig = Price(BuildBay(InTheJuryRigBand));
            var wreck = BuildBay(BelowTheWreckFloor);
            var noService = Price(wreck);
            bool unfixable = MaintenanceSystem.IsUnfixableWreck(wreck, Subject(wreck), forced: true);

            Assert.Multiple(() =>
            {
                Assert.That(juryRig.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Nothing),
                    "an empty-handed service inside the jury-rig band costs the ship nothing, and " +
                    "'nothing' is a price the player should be told");
                Assert.That(noService.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.NoService),
                    "below wear.wreck_threshold with nothing aboard there is no service to price at all");
                Assert.That(unfixable, Is.True,
                    "NON-VACUITY: RepairSpend.NoService claims to be IsUnfixableWreck, so the two " +
                    "must agree on this fixture — if the predicate says FIXABLE the leg above is " +
                    "asserting a state the sim does not believe in");
            });
        }

        // ═══════════════════════════════ 3. THE SWARF RUNG IS GATED, AND THAT IS THE SECOND ANSWER

        /// <summary>
        /// ⭐⭐ <b>THE TWO-ANSWER SPLIT, AT THE SIM LEVEL: ONE SHIP, ONE STOCK, TWO PRICES.</b> A ship
        /// holding ONLY Swarf answers <b>SWARF</b> for a machine below <c>wear.wreck_threshold</c>
        /// and <b>NOTHING</b> (the free jury-rig) for one at or above it — because <c>allowSwarf</c>
        /// IS the wreck floor and <c>swarf_service_condition</c> (0.45) is BELOW
        /// <c>jury_rig_condition</c> (0.6), so offering salvage to a merely-rotted machine would send
        /// a crew member on a fetch to end up WORSE than empty-handed.
        ///
        /// <para><b>THIS IS THE FIXTURE THE HOST'S PROLOGUE IS MEASURED WITH</b>
        /// (<see cref="TheWireRowSelectsTheAnswerByTheWreckFloor_NotTheOtherWayRound"/>): it is the
        /// ONLY state in which the two precomputed answers differ, so a prologue whose condition
        /// compare is inverted is invisible on every other ship.</para>
        /// </summary>
        [Test]
        public void OnASwarfOnlyShip_TheWreckFloorDecidesBetweenSalvageAndAFreeJuryRig()
        {
            var below = Price(BuildBay(BelowTheWreckFloor, swarf: 3));
            var above = Price(BuildBay(InTheJuryRigBand, swarf: 3));

            Assert.Multiple(() =>
            {
                Assert.That(below.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable));
                Assert.That(below.kind, Is.EqualTo(ItemKind.Swarf),
                    "below the wreck floor the salvage rung is the ship's only service");
                Assert.That(above.outcome, Is.EqualTo(MaintenanceSystem.RepairSpend.Nothing),
                    "⛔ THE GATE IS GONE. Swarf offered to a merely-rotted machine restores it to " +
                    "0.45, BELOW the 0.6 an empty-handed jury-rig would have reached — the price " +
                    "would be advertising a service that makes the machine worse than doing nothing.");
            });
        }

        // ═══════════════════════════════ 4. A PRICE IS FOR AN ORDER, SO IT SEES D3'S RESERVE

        /// <summary>
        /// ⭐ <b>THE PRICE IS ASKED WITH <c>forced: true</c> BECAUSE IT PRICES AN ORDER.</b> D3's
        /// reserve floor lives inside <c>FindNearestConsumable</c>, so on a ship down to
        /// <see cref="MaintenanceSystem.AutonomousRepairReserve"/> (4) loose units the UNFORCED
        /// answer is "nothing" while the ship visibly holds stock. That is correct for the standing
        /// rule and wrong for a menu the player is about to click: an order may spend those units.
        ///
        /// <para><b>BOTH HALVES ARE ASSERTED, so this is a 2×2 rather than a one-sided claim</b> —
        /// the unforced answer really is the free jury-rig here (the machine is inside the band),
        /// and the forced one really does name the Seals.</para>
        /// </summary>
        [Test]
        public void ThePriceAnOrderPays_SeesTheStockTheAutonomousReserveHides()
        {
            var sim = BuildBay(InTheJuryRigBand, seals: MaintenanceSystem.AutonomousRepairReserve);
            var ordered = MaintenanceSystem.WhatARepairWouldSpend(sim, Subject(sim), forced: true, out var orderedKind);
            var standing = MaintenanceSystem.WhatARepairWouldSpend(sim, Subject(sim), forced: false, out _);

            Assert.Multiple(() =>
            {
                Assert.That(ordered, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable));
                Assert.That(orderedKind, Is.EqualTo(ItemKind.Seals),
                    "an ORDER may spend the reserve, so the offer must name what it will spend");
                Assert.That(standing, Is.EqualTo(MaintenanceSystem.RepairSpend.Nothing),
                    "NON-VACUITY for the leg above: at exactly the reserve the STANDING rule may " +
                    "spend nothing, so `forced` really is the difference here and the offer really " +
                    "would print the wrong price if the host stopped passing it");
            });
        }

        // ═══════════════════════════════ 5. THE POSITION ARGUMENT, MEASURED RATHER THAN ASSERTED

        /// <summary>
        /// <b>THE DEVICE'S TILE CANNOT CHANGE THE KIND</b> — the argument the query's doc makes for
        /// having no <c>from</c> parameter, driven instead of asserted. Two machines at opposite ends
        /// of the bay, one Seals stack beside each end: the chosen STACK differs by distance, the
        /// KIND cannot. Both answer Seals.
        ///
        /// <para>It is worth a leg because the query passes the ORIGIN to
        /// <c>FindNearestConsumable</c>, which looks like a shortcut until you check that the tier
        /// loop picks by EXISTENCE and <c>from</c> only breaks distance ties.</para>
        /// </summary>
        [Test]
        public void ThePriceIsPositionIndependent_TheTileBreaksTiesAndNothingElse()
        {
            var sim = BuildBay(InTheJuryRigBand, seals: 2);
            var near = sim.AddDevice(DeviceKind.Scrubber, new Int3(2, 2, 0), "near");
            var far = sim.AddDevice(DeviceKind.Scrubber, new Int3(13, 2, 0), "far");
            near.Condition = InTheJuryRigBand;
            far.Condition = InTheJuryRigBand;

            var a = MaintenanceSystem.WhatARepairWouldSpend(sim, near, forced: true, out var kindNear);
            var b = MaintenanceSystem.WhatARepairWouldSpend(sim, far, forced: true, out var kindFar);

            Assert.Multiple(() =>
            {
                Assert.That(a, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable));
                Assert.That(b, Is.EqualTo(MaintenanceSystem.RepairSpend.Consumable));
                Assert.That(kindNear, Is.EqualTo(ItemKind.Seals));
                Assert.That(kindFar, Is.EqualTo(kindNear),
                    "two machines eleven tiles apart were priced differently — the tier is chosen by " +
                    "EXISTENCE, so a position-dependent KIND means the ladder has been re-derived");
            });
        }

        // ═══════════════════════════════ 6. THE WIRE — the element, and the prologue's SELECT

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed, ship: ship);
            return (new GameSession(host, sink.Add), host); // NOT started ⇒ no sim thread
        }

        private static void RevealAll(Simulation sim)
        {
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
            }
        }

        /// <summary>Every emitted row's <c>(x, y, deck, spend)</c>, positionally parsed — the tuple
        /// IS the contract and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, int Spend)> SpendRows(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"devices\""));
            Assert.IsNotNull(json, "the devices channel is not cached — nothing to read a price off");
            var rows = new List<(int, int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.AreEqual(11, f.Length,
                    "a devices tuple is ELEVEN elements (x,y,deck,kind,cond,oper,open,serv,air,spend,face)");
                rows.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[9], CultureInfo.InvariantCulture)));
            }
            return rows;
        }

        private static int SpendAt(GameSession gs, Int3 p)
        {
            foreach (var r in SpendRows(gs)) if (r.X == p.X && r.Y == p.Y && r.Deck == p.Z) return r.Spend;
            Assert.Fail($"no devices row at {p.X},{p.Y},{p.Z} — the fixture is not emitting the machine it means to");
            return 0;
        }

        /// <summary>Strip every repair-ladder unit off the ship, so the fixture's own stock is the
        /// only stock. Returns how many units it removed, as its own non-vacuity note.</summary>
        private static void StripConsumables(Simulation sim)
        {
            var doomed = sim.Items.Items
                .Where(i => i.Kind == ItemKind.Parts || i.Kind == ItemKind.Seals || i.Kind == ItemKind.Swarf)
                .Select(i => i.Id).ToList();
            foreach (var id in doomed) sim.Items.Remove(id);
            Assert.That(sim.Items.Items.Any(i => i.Kind == ItemKind.Parts || i.Kind == ItemKind.Seals
                                                 || i.Kind == ItemKind.Swarf), Is.False,
                "the strip left consumables aboard — every price leg below would be about the wrong ship");
        }

        /// <summary>An EMPTY walkable tile — nothing else on it, so a fixture puts exactly what it
        /// means to put there.</summary>
        private static Int3 EmptyWalkable(Simulation sim, int skip = 0)
        {
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if ((world.GetFlags(p) & TileFlags.HasDevice) != 0) continue;
                        if (sim.Items.Items.Any(i => i.CarriedBy == 0 && i.Pos.Equals(p))) continue;
                        if (sim.Devices.Items.Any(d => d.Pos.Equals(p))) continue;
                        if (skip-- > 0) continue;
                        return p;
                    }
            Assert.Fail("no empty walkable tile on this ship");
            return default;
        }

        /// <summary>
        /// ⭐⭐ <b>THE PROLOGUE'S SELECT, DRIVEN ACROSS THE THRESHOLD — the mutation this leg exists
        /// for is "the condition compare is inverted".</b> One ship, one stock (Swarf only), TWO
        /// machines: one below <c>wear.wreck_threshold</c> and one above it. The wire must read
        /// <c>9</c> (<see cref="ItemKind.Swarf"/>) on the wreck and
        /// <see cref="WireFormat.SpendNothing"/> on the sound one.
        ///
        /// <para><b>SWARF-ONLY IS THE ONLY STOCK THAT CAN CATCH IT</b>, and that is why the fixture
        /// strips the ship first: with any Parts or Seals aboard BOTH precomputed answers are the
        /// same value and an inverted select is bit-identical. That is the fourth trap shape waiting
        /// to happen — a guard whose fixture excludes the violation.</para>
        ///
        /// <para>Both directions are asserted, so swapping the two answers reddens BOTH rows rather
        /// than leaving one that could pass by accident.</para>
        /// </summary>
        [Test]
        public void TheWireRowSelectsTheAnswerByTheWreckFloor_NotTheOtherWayRound()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);
            StripConsumables(sim);

            var wreckTile = EmptyWalkable(sim);
            var soundTile = EmptyWalkable(sim, skip: 1);
            var wrecked = sim.AddDevice(DeviceKind.Scrubber, wreckTile, "price-probe-wreck");
            var sound = sim.AddDevice(DeviceKind.Scrubber, soundTile, "price-probe-sound");
            wrecked.Condition = BelowTheWreckFloor;
            sound.Condition = InTheJuryRigBand;
            sim.AddItem(ItemKind.Swarf, 3, EmptyWalkable(sim, skip: 2));

            int onTheWreck = SpendAt(gs, wreckTile);
            int onTheSoundOne = SpendAt(gs, soundTile);

            Assert.Multiple(() =>
            {
                Assert.That(onTheWreck, Is.EqualTo((int)ItemKind.Swarf),
                    "the wrecked machine's row does not name the salvage the service would eat. If " +
                    "it reads -2 the prologue's condition compare is INVERTED: the sound machine's " +
                    "answer has been stamped on the wreck.");
                Assert.That(onTheSoundOne, Is.EqualTo(WireFormat.SpendNothing),
                    "the sound machine's row prices a Swarf it will never be offered — swarf_service " +
                    "(0.45) is BELOW jury_rig (0.6), so this service is FREE and the row must say so");
            });
        }

        /// <summary>
        /// ⭐ <b>THE ROW IS POPULATED FROM THE SIM'S ANSWER AND FOLLOWS THE SHIP'S STOCK.</b> The
        /// same machine, priced three times on one ship as the stock is walked down the ladder:
        /// PARTS ▸ SEALS ▸ (nothing aboard, machine inside the band) SPENDS-NOTHING. A row that
        /// carried a constant, or that was computed once and cached, passes at most one of these.
        ///
        /// <para>It also pins the SHIP-GLOBAL character of the element, which is the reason
        /// <c>SameAs</c> had to gain the clause in the same commit: nothing about THIS device
        /// changes between the three reads.</para>
        /// </summary>
        [Test]
        public void TheRowFollowsTheShipsStockDownTheLadder()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);
            StripConsumables(sim);

            var tile = EmptyWalkable(sim);
            var machine = sim.AddDevice(DeviceKind.Scrubber, tile, "price-probe");
            machine.Condition = InTheJuryRigBand;

            var partsStack = sim.AddItem(ItemKind.Parts, 1, EmptyWalkable(sim, skip: 1));
            var sealsStack = sim.AddItem(ItemKind.Seals, 1, EmptyWalkable(sim, skip: 2));
            int withParts = SpendAt(gs, tile);

            sim.Items.Remove(partsStack.Id);
            int withSeals = SpendAt(gs, tile);

            sim.Items.Remove(sealsStack.Id);
            int withNothing = SpendAt(gs, tile);

            Assert.Multiple(() =>
            {
                Assert.That(withParts, Is.EqualTo((int)ItemKind.Parts));
                Assert.That(withSeals, Is.EqualTo((int)ItemKind.Seals),
                    "the row did not follow the ship down a rung. `WantedRepairConsumable` — tier 0 " +
                    "unconditionally — would still read 5 here while the service eats a Seal.");
                Assert.That(withNothing, Is.EqualTo(WireFormat.SpendNothing),
                    "with nothing aboard and the machine inside the jury-rig band the service is FREE");
            });
        }

        /// <summary>
        /// <b>PROJECTION-PURE / PIN-NEUTRAL for the new element specifically.</b>
        /// <c>DevicesChannelTests.Rendering_The_Devices_Channel_Never_Touches_The_Sim</c> already
        /// makes this claim for the channel; it is EXTENDED here rather than duplicated, on a ship
        /// where the price is non-trivial (stripped, Swarf-only, a machine on each side of the wreck
        /// floor) — i.e. the one state in which the two-answer prologue actually does different work.
        /// The funnel it calls walks the item store; a walk that reserved, carried or consumed
        /// anything would move <see cref="Simulation.StateHash"/> and with it every determinism pin.
        /// </summary>
        [Test]
        public void PricingTheChannelNeverTouchesTheSim()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);
            StripConsumables(sim);
            var wrecked = sim.AddDevice(DeviceKind.Scrubber, EmptyWalkable(sim), "purity-probe");
            wrecked.Condition = BelowTheWreckFloor;
            sim.AddItem(ItemKind.Swarf, 2, EmptyWalkable(sim, skip: 1));

            gs.RenderForTest();                 // prime, so the reads below are steady-state
            ulong before = sim.StateHash();
            var first = SpendRows(gs);
            var second = SpendRows(gs);
            ulong after = sim.StateHash();

            Assert.Multiple(() =>
            {
                Assert.That(after, Is.EqualTo(before),
                    "pricing the channel moved the sim's StateHash. This element is VIEW-ONLY; a " +
                    "write here moves all five determinism pins for a layer the sim does not have.");
                CollectionAssert.AreEqual(first, second,
                    "two renders of an unchanged sim priced it differently — the funnel is being " +
                    "read as if it had state");
                Assert.That(first.Any(r => r.Spend == (int)ItemKind.Swarf), Is.True,
                    "NON-VACUITY: no row carries the salvage price, so this purity claim is about a " +
                    "render that never exercised the new code path");
            });
        }

        // ═══════════════════════════════ 7. THE VOCABULARY IS COMPLETE FOR THE LADDER

        /// <summary>
        /// <b>EVERY RUNG OF <see cref="MaintenanceSystem.RepairConsumableTier"/> HAS PLAYER WORDS.</b>
        /// The price clause spells its kind through <c>ThawGate.ItemWords</c> (mirrored client-side
        /// by <c>ITEM_WORDS</c>, pinned equal by a test that parses the C#), and a rung with no words
        /// makes the clause silently vanish on exactly the ship where the price matters most.
        ///
        /// <para>DERIVED FROM THE LADDER, not from a hand-written list of three — the ladder has one
        /// declaration and a second copy here would be the thing M3-13 removed.</para>
        /// </summary>
        [Test]
        public void EveryRungOfTheRepairLadderHasPlayerWords()
        {
            for (int tier = 0; tier < MaintenanceSystem.RepairConsumableTierCount; tier++)
            {
                var kind = MaintenanceSystem.RepairConsumableTier(tier);
                string words = ThawGate.ItemWords(kind);
                Assert.That(words, Is.Not.Empty, $"rung {tier} ({kind}) has no player words");
                Assert.That(words, Is.EqualTo(words.ToUpperInvariant()),
                    $"rung {tier} ({kind}) is not spelled in the refusal vocabulary's upper case");
            }
        }
    }
}
