using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// WP-1 (console retirement): the grid ship's authored CONTENT — the deck-1 wreck, the
    /// ClearAllDebris goal and the eight-hand crew that make <c>--ship grid</c> a game rather than
    /// a sandbox. It is the one standard play ship, and before WP-1 it carried zero debris, zero
    /// goals and three crew: <see cref="DesignateDigCommand"/> refuses any tile whose wall is not
    /// <see cref="TileDefs.Debris"/>, so DIG was a guaranteed silent no-op on the ship the player
    /// plays.
    ///
    /// Two kinds of test here, and the second kind is the point. The pins (debris count, goal,
    /// roster, and the empty hall's untouched sealed/airless state) stop the content drifting
    /// silently. The PLAYABILITY tests drive the real system stack and prove the crew actually
    /// reach the wreck and clear it in breathable air — because "a ship that HAS debris no crew can
    /// reach is not playable" is a mistake this repo has already shipped (E0-4 zoned a sealed room
    /// and measured it for days), and debris authored into the airless decks 2..7 would have looked
    /// identical in a screenshot.
    /// </summary>
    public class GridWreckTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        // ⚠️ EVERY expectation below is written out BY HAND, never read from the AuthoredShips
        // constants it checks. A test that derives its expected value from the authoring constant
        // cannot fail when that constant changes — the recurring review defect in this repo ("the
        // test whose named mutation cannot bite", six instances in E0-4), and one this file was
        // caught committing: with WreckRows read from AuthoredShips.GridWreckRows, halving the
        // wreck left all eight tests green. These literals ARE the pin; changing the ship's
        // content means changing them in the same commit, deliberately.
        private const int WreckDeck = 1;                 // AuthoredShips.GridWreckDeck
        private const int OpenSlot = 6;                  // AuthoredShips.GridOpenWreckSlot
        private const int WreckRows = 2;                 // AuthoredShips.GridWreckRows
        private const int WreckTilesPerSlot = 20;        // WreckRows × SlotGridPlanner.InteriorW (10)
        private static readonly int[] ExpectedWreckSlots = { 5, 6, 7 };
        private const int ExpectedWreckTiles = 60;       // 3 slots × 20

        [Test]
        public void TheseTestsPinTheAuthoredShip_NotTheOtherWayRound()
        {
            Assert.That(WreckDeck, Is.EqualTo(AuthoredShips.GridWreckDeck), "the wreck moved deck");
            Assert.That(OpenSlot, Is.EqualTo(AuthoredShips.GridOpenWreckSlot), "the live wreck moved slot");
            Assert.That(WreckRows, Is.EqualTo(AuthoredShips.GridWreckRows), "the collapse got deeper or shallower");
            Assert.That(WreckTilesPerSlot, Is.EqualTo(WreckRows * SlotGridPlanner.InteriorW),
                "the slot geometry changed under the wreck");
            Assert.That(ExpectedWreckTiles, Is.EqualTo(ExpectedWreckSlots.Length * WreckTilesPerSlot));
        }

        private static List<Int3> DebrisTiles(Simulation sim)
        {
            var found = new List<Int3>(128);
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) == TileDefs.Debris) found.Add(p);
                    }
            return found;
        }

        /// <summary>Debris inside one deck-1 slot's interior — a whole-ship count would be
        /// satisfied by another slot's rubble.</summary>
        private static List<Int3> DebrisIn(Simulation sim, int slot)
        {
            var r = SlotGridPlanner.InteriorRect(slot);
            var found = new List<Int3>(32);
            for (int y = r.Y0; y <= r.Y1; y++)
                for (int x = r.X0; x <= r.X1; x++)
                {
                    var p = new Int3(x, y, WreckDeck);
                    if (sim.World.GetWall(p) == TileDefs.Debris) found.Add(p);
                }
            return found;
        }

        /// <summary>CO2 ppm of the room a tile is in.</summary>
        private static double Co2At(Simulation sim, Int3 probe) => sim.Rooms.RoomAt(sim.World, probe).CO2Ppm;

        /// <summary>The worst (highest) CO2 ppm among a deck's live, air-holding rooms — the same
        /// "worst pressurised room" reading ShipMetrics puts on the HUD.</summary>
        private static double WorstCo2OnDeck(Simulation sim, int deck)
        {
            double worst = 0;
            foreach (var a in sim.Rooms.Anchors)
            {
                if (a.Probe.Z != deck) continue;
                var room = sim.Rooms.RoomAt(sim.World, a.Probe);
                if (room.TotalMoles <= 0) continue;
                if (room.CO2Ppm > worst) worst = room.CO2Ppm;
            }
            return worst;
        }

        private static Int3 HallProbe(int slot, int deck)
        {
            var r = SlotGridPlanner.InteriorRect(slot);
            return new Int3(r.CenterX, r.CenterY, deck);
        }

        private static Device DoorOf(Simulation sim, int deck, int slot)
        {
            string name = $"door_d{deck}_s{slot}";
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Name == name) return devices[i];
            Assert.Fail($"grid ship has no device named '{name}'");
            return null;
        }

        // ------------------------------------------------------------------ content pins

        /// <summary>
        /// The wreck exists, is exactly the authored size, and sits ONLY in the three free deck-1
        /// halls — on their hull-side rows, never on the door apron or the room's centre probe.
        /// Mutation: widen GridWreckRows, add a slot to GridWreckSlots, or move the fill to another
        /// deck, and this fails on the count or the containment check.
        /// </summary>
        [Test]
        public void Wreck_SitsOnlyInTheThreeFreeDeck1Halls()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            var debris = DebrisTiles(sim);

            Assert.That(debris.Count, Is.EqualTo(ExpectedWreckTiles),
                "the grid ship must carry exactly the authored wreck — no more (stray fill) and no less " +
                "(DIG has no legal target without it)");

            foreach (var p in debris)
            {
                Assert.That(p.Z, Is.EqualTo(WreckDeck),
                    $"debris at {p} is off deck {WreckDeck}; decks 2..7 boot airless behind closed doors, " +
                    "so debris there could never be dug and would make ClearAllDebris unreachable");

                bool inAWreckSlot = false;
                foreach (int slot in ExpectedWreckSlots)
                {
                    var r = SlotGridPlanner.InteriorRect(slot);
                    if (p.X < r.X0 || p.X > r.X1 || p.Y < r.Y1 - WreckRows + 1 || p.Y > r.Y1) continue;
                    inAWreckSlot = true;
                    Assert.That(new Int3(r.CenterX, r.CenterY, p.Z), Is.Not.EqualTo(p),
                        $"slot {slot}'s centre PROBE tile is buried — anchors, pressurisation and ＋ADD ROOM " +
                        "all resolve the room through it");
                    Assert.That(p.Y, Is.Not.EqualTo(r.Y0),
                        $"slot {slot}'s door apron row is buried — the compartment would be sealed from the inside");
                }
                Assert.That(inAWreckSlot, Is.True,
                    $"debris at {p} is outside the hull-side rows of slots 5/6/7");
            }
        }

        /// <summary>
        /// THE EMPTY HALL IS UNTOUCHED — deck 1 slot 3, the ship's one carved, sealed, AIRLESS,
        /// debris-free compartment. Deck 0 is fully furnished, so slot 3 is the first
        /// <c>RoomType.None</c> entry in <c>plan.SlotGrid</c>, and it is the FIXTURE the two
        /// pressure-frontier tests below run on. This states the contract from the AUTHORING side,
        /// so wrecking slot 3 fails here — naming the reason — instead of only making those two go
        /// mysteriously red. Mutation: add 3 to GridWreckSlots, or add its anchor to
        /// PressurizedAnchors, or open its door.
        ///
        /// <para>⭐ M1-L-b: this was <c>AddRoomSlot_StaysSealedAirlessAndDebrisFree</c>, and its slot
        /// was "the ＋ADD ROOM demonstration slot". The verb, its command and its enum member are all
        /// deleted (OD-K); the compartment is not a demonstration of anything any more, it is simply
        /// the ship's one empty room — which under M1-L is a ROOM like every other, drawn, named and
        /// enterable.</para>
        /// </summary>
        [Test]
        public void TheEmptyHallSlot_StaysSealedAirlessAndDebrisFree()
        {
            var plan = AuthoredShips.PeriluneGrid();

            int firstEmpty = -1;
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Type == RoomType.None) { firstEmpty = i; break; }
            Assert.That(firstEmpty, Is.GreaterThanOrEqualTo(0), "the grid ship must keep an empty hall to commission");
            var hall = plan.SlotGrid[firstEmpty];
            Assert.That(hall.Deck, Is.EqualTo(WreckDeck), "the first empty hall is expected on deck 1");
            Assert.That(hall.Index, Is.EqualTo(3),
                "the first empty hall must stay slot 3 — the wreck must not consume the compartment " +
                "the pressure-frontier tests below are written against");

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = HallProbe(3, WreckDeck);
            var room = sim.Rooms.RoomAt(sim.World, probe);
            Assert.That(ReferenceEquals(room, sim.Rooms.Rooms[0]), Is.False,
                "slot 3 must stay its own sealed room, not the vacuum sink");
            Assert.That(room.TotalMoles, Is.EqualTo(0.0),
                "slot 3 must stay AIRLESS — it is the fixture for the two fill tests below, and a " +
                "compartment that boots with air can prove nothing about earning it");
            Assert.That(DoorOf(sim, WreckDeck, 3).IsOpen, Is.False, "slot 3's door must stay closed");

            foreach (var p in DebrisTiles(sim))
            {
                var r = SlotGridPlanner.InteriorRect(3);
                bool inSlot3 = p.Z == WreckDeck && p.X >= r.X0 && p.X <= r.X1 && p.Y >= r.Y0 && p.Y <= r.Y1;
                Assert.That(inSlot3, Is.False, $"debris at {p} is inside the empty hall");
            }
        }

        // ------------------------------------------------- the pressure frontier (moved by M1-L-b)

        /// <summary>
        /// <b>⭐ NAMING IS FREE, AIR IS EARNED — the pressure frontier, driven end to end and the fill
        /// TIME measured. MOVED HERE BY M1-L-b from <c>AddRoomCommandTests</c>.</b>
        ///
        /// <para><b>Why it moved rather than died with that file.</b> W4b took the air out of ＋ADD
        /// ROOM, and this test was written to say what replaced it; M1-L-b then deleted the command
        /// itself. But the mechanic under test was never about the command — an allocation only ever
        /// set an anchor's <see cref="RoomType"/>, which no gas term reads. What it measures is the
        /// ATMOSPHERE: a carved, sealed, airless compartment fills through an OPENED DOOR from deck
        /// 1's spine vent (<c>vent_spine_1</c>), over time. So the allocation step is simply dropped
        /// and everything the test asserted still holds. Under M1-L the compartment did not need
        /// naming to be a room in the first place.</para>
        ///
        /// <para><b>MEASURED, not predicted, and the answer is good news for pacing.</b> The 60-tile
        /// compartment crosses 50 kPa at tick <b>460 (46.0 s)</b> and 90 kPa — the threshold a
        /// <c>PressurizeAnchor</c> goal calls restored — at tick <b>1 542 (154.2 s ≈ 2.6
        /// sim-minutes)</b>. ⚠️ In <c>AddRoomCommandTests</c> these read 461 / 1 543, and the
        /// one-tick difference is not noise: that version spent one <c>Tick()</c> draining the
        /// allocation command before opening the door, so the fill started a tick later. Re-measured
        /// here rather than carried over — a number you did not measure yourself is not evidence.
        /// The wreck-start plan's revision-1 worry was that a compartment might take
        /// twenty sim-minutes; it takes two and a half. (On <c>--ship wreck</c>, measured the same way:
        /// every 60-tile deck-0 hall reaches 90 kPa at tick 2 986–2 992 ≈ 5.0 sim-minutes, slower
        /// because <c>vent_cryo</c> boots at <c>Condition 0.62</c> and the wreck's pressurised
        /// reservoir is three anchors against grid's thirteen. ⛔ Deck 1 of the wreck is a different
        /// story and an OPEN, OWNER-ACCEPTED defect — <c>W4b-DEAD-DECK</c>, no vertical gas term.)</para>
        ///
        /// <para>The band is deliberately wide (~0.5×–2.6× the measurement) — this is a PACING check,
        /// not a golden. NON-VACUITY / negative control: the paired test below leaves the door SHUT
        /// and requires the compartment to stay at exactly zero for the same tick budget.</para>
        /// </summary>
        [Test]
        public void OpeningACompartmentsDoor_FillsIt_AndTheFillTimeIsMeasured()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = HallProbe(3, WreckDeck);
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "the compartment must start in vacuum — nothing below is measurable otherwise");

            sim.EnqueueCommand(new SetDoorStateCommand(DoorOf(sim, WreckDeck, 3).Id, open: true));
            sim.Tick();
            Assert.That(DoorOf(sim, WreckDeck, 3).IsOpen, Is.True,
                "the door refused to open — nothing below is measurable");

            const int Cap = 20000;   // ~33 sim-minutes; the measured 90 kPa crossing is 1 543
            long half = -1, full = -1;
            for (int t = 1; t <= Cap && full < 0; t++)
            {
                sim.Tick();
                double kpa = sim.Rooms.RoomAt(sim.World, probe).PressureKPa;
                if (half < 0 && kpa >= 50.0) half = t;
                if (kpa >= 90.0) full = t;
            }

            TestContext.WriteLine(System.FormattableString.Invariant(
                $"FILL TIME, grid deck {WreckDeck} slot 3 (60 tiles) via the spine vent through one open door: 50 kPa at tick {half} ({half / 10.0:F1} s), 90 kPa at tick {full} ({full / 10.0:F1} s)"));

            Assert.That(full, Is.GreaterThan(0),
                $"the compartment never reached 90 kPa in {Cap} ticks — the pressure frontier is unplayable");
            Assert.That(full, Is.InRange(800, 4000),
                "the door-flow fill time moved out of its measured band (1 543 ticks ≈ 2.6 sim-minutes). " +
                "This is a PACING assertion, not a golden: if it moved, say by how much and why.");
            Assert.That(half, Is.InRange(230, 1200),
                "the 50 kPa crossing moved out of its measured band (461 ticks ≈ 46 s)");
            Assert.That(half, Is.LessThan(full), "the half-way crossing must precede the full one");

            // And the compartment is genuinely workable, not merely pressurised on paper.
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).O2Fraction, Is.GreaterThan(0.15),
                "the filled compartment is at pressure but not breathable");
        }

        /// <summary>
        /// <b>THE NEGATIVE CONTROL for the fill test above, and the honest statement of what W4b
        /// cost: with its door left SHUT, a sealed compartment NEVER fills</b> — not once in the whole
        /// 20 000-tick budget the fill test is allowed. Without this, "it filled" could be something
        /// the ship does anyway.
        ///
        /// <para>⭐ M1-L-b merged <c>AddRoomCommandTests.AnAllocatedHallWithItsDoorShut_NeverFills</c>
        /// with that file's <c>AllocatedButAirless_IsAStableState_ForTenSimMinutes</c>, whose one
        /// surviving contribution was its NON-VACUITY leg: it sampled deck 1's SPINE throughout and
        /// required it to stay breathable, so "everything on this ship is airless" cannot be what
        /// makes the test pass. That leg is carried below at the same 500-tick sampling interval. The
        /// rest of that test asserted that an ALLOCATION was not lost over time, which is a statement
        /// about a command that no longer exists.</para>
        ///
        /// <para>MUTATION: give the compartment a free 101.3 kPa (the pre-W4b <c>RoomState.Pressurize</c>
        /// wand, in any form) ⇒ RED on the first sample.</para>
        /// </summary>
        [Test]
        public void ASealedCompartmentWithItsDoorShut_NeverFills()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = HallProbe(3, WreckDeck);
            var spineProbe = new Int3(2, SlotGridPlanner.SpineY0, WreckDeck);

            for (int t = 0; t < 20000; t++)
            {
                sim.Tick();
                if (t % 500 != 0) continue;
                Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                    $"air appeared in a sealed compartment at tick {t} with its door still shut");
                Assert.That(DoorOf(sim, WreckDeck, 3).IsOpen, Is.False,
                    $"the sealed compartment's door opened by itself at tick {t}");
                // NON-VACUITY: the ship's atmosphere really is running in this sim, so "stayed at
                // zero" is a fact about THIS compartment and not about a dead simulation.
                Assert.That(sim.Rooms.RoomAt(sim.World, spineProbe).PressureKPa, Is.GreaterThan(90.0),
                    $"deck {WreckDeck}'s spine lost pressure at tick {t} — this run proves nothing " +
                    "about the sealed hall if the whole ship is airless");
            }
        }

        /// <summary>
        /// Exactly one wreck boots LIVE — door open, compartment pressurised, debris designated —
        /// and the other two boot as ordinary sealed halls. Both halves matter: without the live one
        /// the ship demonstrates nothing at boot, and without the sealed ones the goal needs no
        /// player verb. Mutation: drop the SetDeviceOpen call (door closed ⇒ every designated tile
        /// unreachable, the slice's door_aft lesson), drop the PressurizedAnchors line (diggers
        /// suffocate), or drop the DigDesignations loop (the board boots empty).
        /// </summary>
        [Test]
        public void OneWreckBootsLive_TheOtherTwoBootSealed()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            int designated = 0;
            foreach (var p in DebrisTiles(sim))
                if ((sim.World.GetFlags(p) & TileFlags.Designated) != 0) designated++;
            Assert.That(designated, Is.EqualTo(WreckTilesPerSlot),
                "exactly one wreck's worth of debris must boot designated — a goal designates nothing " +
                "(GoalSystem is a pure observer), so this is the only dig work the ship starts with");

            foreach (int slot in ExpectedWreckSlots)
            {
                var probe = HallProbe(slot, WreckDeck);
                var room = sim.Rooms.RoomAt(sim.World, probe);
                bool live = slot == OpenSlot;

                Assert.That(DoorOf(sim, WreckDeck, slot).IsOpen, Is.EqualTo(live),
                    $"slot {slot}: the live wreck's door must boot OPEN and the sealed ones CLOSED");
                Assert.That(ReferenceEquals(room, sim.Rooms.Rooms[0]), Is.False,
                    $"slot {slot} must be its own sealed room even wrecked, not the vacuum sink");
                Assert.That(room.PressureKPa > 90.0, Is.EqualTo(live),
                    $"slot {slot}: the live wreck must boot breathable and the sealed ones airless");
            }
        }

        /// <summary>
        /// THE LIVE WRECK IS A TYPED ROOM, AND THAT IS A CLIENT CONTRACT, not decoration. An
        /// EVERY carved slot reads OCCUPIED to <c>GameSession.ResolveSlot</c> since M1-L, and the
        /// Overview draws an occupied slot as a room with a label of
        /// <c>roomLabel(roomType) || anchorName</c> (<c>decks-model.js deckSlotView</c>). So a
        /// <c>RoomType.None</c> slot renders LABELLED WITH ITS INTERNAL ANCHOR ID in an
        /// UPPERCASE-label UI. That shipped in this package's first draft and is what this test
        /// exists to stop coming back — and it matters MORE now, not less: the sentence used to end
        /// *"and can never be commissioned either, because AddRoomCommand returns early on
        /// TotalMoles &gt; 0"*, i.e. the player had a gesture that could at least in principle put a
        /// label on it. M1-L-b deleted that gesture (OD-K), so <b>authoring is the only thing that
        /// can give a compartment a label at all</b>.
        /// Mutation: put the live wreck back to <c>Hall(1, 6)</c> and the type/anchor assertions
        /// fail (and `hall_d1_s6` is exactly the string that would have reached the player).
        /// </summary>
        [Test]
        public void LiveWreck_IsATypedRoom_SoTheClientHasALabelForIt()
        {
            var plan = AuthoredShips.PeriluneGrid();

            SlotDescriptor live = default;
            bool found = false;
            foreach (var s in plan.SlotGrid)
                if (s.Deck == WreckDeck && s.Index == OpenSlot) { live = s; found = true; }
            Assert.That(found, Is.True);
            Assert.That(live.Type, Is.Not.EqualTo(RoomType.None),
                "the live wreck is pressurised, so the client reads it as OCCUPIED and draws a ROOM — " +
                "with RoomType.None its label falls back to the raw anchor id");
            Assert.That(live.Type, Is.EqualTo(RoomType.Storage), "the collapsed hold is a Storage room");
            Assert.That(live.Anchor, Is.EqualTo("hold"));
            Assert.That(live.Anchor, Does.Not.StartWith("hall_"),
                "an anchor of the hall_dN_sM form is an internal identifier, not a player-facing name");

            // The two sealed wrecks stay UNTYPED and sealed — authored that way, and nothing the
            // player can do re-types them: M1-L-b deleted the last writer of a RoomType (OD-K), so
            // a room type is authoring-only. They are still the player's work, but the work is
            // opening and clearing them, not naming them.
            foreach (var s in plan.SlotGrid)
            {
                if (s.Deck != WreckDeck || s.Index == OpenSlot) continue;
                bool wrecked = false;
                foreach (int slot in ExpectedWreckSlots) if (s.Index == slot) wrecked = true;
                if (wrecked) Assert.That(s.Type, Is.EqualTo(RoomType.None), $"slot {s.Index} must stay commissionable");
            }

            // RoomDresser furnishes only Quarters/Mess/Commons/Command/Observatory/Medbay/Bridge, so
            // typing the wreck Storage must not have dropped furniture into a collapsed compartment.
            var r = SlotGridPlanner.InteriorRect(OpenSlot);
            foreach (var d in plan.Devices)
            {
                if (d.Pos.Z != WreckDeck) continue;
                if (d.Pos.X < r.X0 || d.Pos.X > r.X1 || d.Pos.Y < r.Y0 || d.Pos.Y > r.Y1) continue;
                Assert.That(d.Kind, Is.EqualTo(DeviceKind.Conduit),
                    $"a {d.Kind} was furnished into the collapsed hold at {d.Pos}");
            }
        }

        /// <summary>
        /// The deck-1 life-support pair is authored where the crew now work: three scrubbers and an
        /// OPEN vent, all on spine floor. A plan-level pin, because the behaviour they buy is slow
        /// (see the CO2 assertion in the full-clear test for the part that is measured) and a device
        /// silently dropped in a refactor would otherwise show up as a ship that poisons itself over
        /// days. The ladder trunk is pinned here too: it is the stated premise of the AutoWander
        /// decision AND the only way the crew reach the wreck at all.
        /// </summary>
        [Test]
        public void Deck1_HasItsLifeSupportPair_AndTheLadderTrunkIsWholeShip()
        {
            var plan = AuthoredShips.PeriluneGrid();

            int scrubbers = 0, openVents = 0, ladders = 0, regolith = 0;
            var ladderDecks = new HashSet<int>();
            foreach (var d in plan.Devices)
            {
                if (d.Kind == DeviceKind.Ladder)
                {
                    ladders++;
                    ladderDecks.Add(d.Pos.Z);
                    Assert.That(d.Pos.X, Is.EqualTo(SlotGridPlanner.LadderX));
                    Assert.That(d.Pos.Y, Is.EqualTo(SlotGridPlanner.SpineY0));
                }
                if (d.Pos.Z != WreckDeck) continue;
                bool onSpine = d.Pos.Y == SlotGridPlanner.SpineY0 || d.Pos.Y == SlotGridPlanner.SpineY1;
                if (d.Kind == DeviceKind.Scrubber) { scrubbers++; Assert.That(onSpine, Is.True, $"scrubber off-spine at {d.Pos}"); }
                if (d.Kind == DeviceKind.AirVent && d.IsOpen) { openVents++; Assert.That(onSpine, Is.True, $"vent off-spine at {d.Pos}"); }
            }
            Assert.That(scrubbers, Is.EqualTo(3),
                "deck 1 carries three scrubbers — the whole eight-crew CO2 load on this deck alone " +
                "(3 × 0.001 mol/s > 8 × 2.73e-4), reached by B-3 diffusion across the open doors");
            Assert.That(openVents, Is.EqualTo(1),
                "deck 1 carries one OPEN vent — every dug tile is ~2.5 m³ of new volume to make up");
            Assert.That(ladderDecks.Count, Is.EqualTo(AuthoredShips.GridDepth),
                "the ladder trunk must reach every deck: it is how the crew get to the wreck at all");
            Assert.That(ladders, Is.EqualTo(AuthoredShips.GridDepth));

            foreach (var item in plan.Items) if (item.Kind == ItemKind.Regolith) regolith += item.Count;
            Assert.That(regolith, Is.EqualTo(24),
                "the opening regolith stock is the build loop's only matter until the first tile is dug " +
                "(wall_material 2 ⇒ twelve walls); without it every designation starves at '0 regolith aboard'");
        }

        /// <summary>
        /// The goal is real: one authored objective, ClearAllDebris, and it is NOT vacuously true at
        /// boot. ClearAllDebris completes on its first poll on a ship authored without debris — which
        /// is exactly what the grid ship was before WP-1 — so "the ship has a goal" is only worth
        /// anything together with "the goal is open". Mutation: remove the wreck and this fails on
        /// the Done latch within a second of sim time; remove the goal and it fails on the count.
        /// </summary>
        [Test]
        public void Goal_IsAnOpenClearAllDebris_NotAVacuousOne()
        {
            var systems = Stack();
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), systems);

            GoalSystem goals = null;
            foreach (var s in systems) if (s is GoalSystem g) goals = g;
            Assert.That(goals, Is.Not.Null, "the default stack must carry a GoalSystem");

            Assert.That(goals.Goals.Count, Is.EqualTo(1), "the grid ship authors exactly one goal");
            Assert.That(goals.Goals[0].Kind, Is.EqualTo(GoalKind.ClearAllDebris));
            Assert.That(goals.Goals[0].Text, Is.Not.Empty, "a goal the player reads needs a line to read");

            for (int i = 0; i < 20; i++) sim.Tick(); // GoalSystem polls at 1 Hz — two polls
            Assert.That(goals.Goals[0].Done, Is.False,
                "ClearAllDebris must be OPEN at boot; it is vacuously true on a debris-free ship");
        }

        /// <summary>
        /// Eight crew, all recruitable. Three (one of them held) could not exercise the economy
        /// verbs; eight is the slice's number and what deck 0's loops are sized for. AutoWander is
        /// TRUE (2026-07-25, matching the slice) — the standard play ship should not read as dead
        /// while its crew are idle, and that is only safe because the idle sampler is now confined to
        /// the crew member's own deck, putting the ladder trunk's six airless decks out of one draw's
        /// reach. <see cref="DeckConfinedWanderTests"/> drives that end to end; this only pins the
        /// authored flag. Mutation: restore the three-crew roster, or flip a HoldPosition, and the
        /// count/flag assertions fail.
        /// </summary>
        [Test]
        public void Crew_AreEight_AllWorkable_AndStartInBreathableAir()
        {
            var plan = AuthoredShips.PeriluneGrid();
            Assert.That(plan.Citizens.Count, Is.EqualTo(8), "the grid ship crews eight");

            var seen = new HashSet<Int3>();
            foreach (var c in plan.Citizens)
            {
                Assert.That(c.HoldPosition, Is.False,
                    $"{c.Name} is held: a held crew member is never offered work (IsIdleForWork) and reads " +
                    "in play as 'my crew ignores me'");
                Assert.That(c.AutoWander, Is.True,
                    $"{c.Name} stands still while idle: the standard play ship reads as dead. Safe since " +
                    "the idle sampler became deck-confined (PathService.TryRandomWalkableTileNear)");
                Assert.That(c.Pos.Z, Is.EqualTo(0), $"{c.Name} must start on the pressurised, provisioned deck 0");
                Assert.That(seen.Add(c.Pos), Is.True, $"two crew are authored onto {c.Pos}");
            }

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();
            foreach (var c in sim.Citizens.Items)
            {
                var room = sim.Rooms.RoomAt(sim.World, c.Pos);
                Assert.That(room.PressureKPa, Is.GreaterThan(90.0), $"{c.Name} wakes in thin air");
            }
        }


        // ------------------------------------------------------------------ playability

        /// <summary>
        /// THE PLAYABILITY PROOF for the live wreck: with no player input at all, the crew walk from
        /// deck 0, climb the ladder, and dig the authored collapse out — in breathable air, with the
        /// spoil landing on the cleared tiles. This is what "the ship demonstrates the dig loop"
        /// means, and it is the assertion a sealed or airless wreck cannot pass: a closed door makes
        /// every designated tile unreachable, and an airless one makes the digger flee
        /// (SafetySystem/JobKind.Flee) instead of working.
        ///
        /// MARGIN: the first tile comes out at tick 6,160 and the tenth — the bar below — at 12,200,
        /// against a 25,000-tick budget (2.05×). It ran at 15,000 (1.23×) until the review pointed
        /// out that was the thinnest bound in the file; the extra ticks are free next to the digs.
        /// </summary>
        [Test]
        public void Crew_ClearTheLiveWreck_OnceGivenMine_AndInBreathableAir()
        {
            // ⚠️ M2-2 RENAMED THIS TEST, because OD-H inverted the word in its old name. It was
            // "…_UnpromptedAndInBreathableAir" and unprompted digging is now precisely what must NOT
            // happen: every work type boots off, so the grid's crew clear the wreck only after the
            // player switches Mine on. Everything else about the leg — the tick budget, the
            // breathable-air control, the ten-tile bar — is unchanged, and the SILENCE before the
            // order is pinned by WorkTypeVetoTests on --ship wreck.
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack()).GiveAllCrewAllWork();
            int debrisAtBoot = DebrisIn(sim, OpenSlot).Count;  // the live wreck only, not the ship
            Assert.That(debrisAtBoot, Is.EqualTo(WreckTilesPerSlot));

            bool sawDig = false, sawFlee = false;
            var diggers = new HashSet<string>();
            for (int t = 0; t < 25000; t++)   // ~42 sim-minutes; the tenth tile is out by 12,200
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items)
                {
                    if (c.JobKind == JobKind.Dig) { sawDig = true; diggers.Add(c.Name); }
                    if (c.JobKind == JobKind.Flee) sawFlee = true;
                }
            }

            Assert.That(sawDig, Is.True, "no crew member ever took a dig job on the authored, designated field");
            Assert.That(sawFlee, Is.False, "a crew member fled unbreathable air — the wreck is not a survivable worksite");

            int cleared = debrisAtBoot - DebrisIn(sim, OpenSlot).Count;
            Assert.That(cleared, Is.GreaterThanOrEqualTo(WreckTilesPerSlot / 2),
                $"only {cleared} of the live wreck's {WreckTilesPerSlot} tiles came out in 25 sim-minutes " +
                $"({diggers.Count} crew dug) — the field is reachable in principle but not in practice");

            // Spoil: digging is the ship's only in-sim source of Regolith, and it drops on the tile.
            int spoilOnDeck1 = 0;
            foreach (var item in sim.Items.Items)
                if (item.Kind == ItemKind.Regolith && item.Pos.Z == WreckDeck && item.CarriedBy == 0) spoilOnDeck1++;
            Assert.That(spoilOnDeck1, Is.GreaterThan(0), "clearing the wreck produced no Regolith spoil on deck 1");

            foreach (var c in sim.Citizens.Items)
            {
                Assert.That(c.Dead, Is.False, $"{c.Name} died clearing the wreck");
                Assert.That(c.Suffocation, Is.LessThan(0.1f), $"{c.Name} is suffocating at the worksite");
            }

            // The compartment stays breathable as the dig GROWS its volume (deck 1's vent makes it up).
            var hall = sim.Rooms.RoomAt(sim.World, HallProbe(OpenSlot, WreckDeck));
            Assert.That(hall.PressureKPa, Is.GreaterThan(90.0),
                "the cleared compartment thinned out — each dug tile is new volume to fill");
        }

        /// <summary>
        /// THE PLAYABILITY PROOF for the two sealed wrecks: the player's own route works. ⚠️ <b>W4b
        /// REWROTE THAT ROUTE AND M1-L-b SHORTENED IT AGAIN.</b> ＋ADD ROOM used to open the hall's
        /// door and fill it with air in the same gesture; W4b cut it back to NAMING the compartment
        /// (naming is free, air is earned), and M1-L-b deleted the verb altogether on OD-K — every
        /// carved compartment already IS a room, so there is nothing to allocate. The route is
        /// therefore just: <b>OPEN THE DOOR</b>, wait while deck 1's spine vent pushes gas through
        /// the doorway, then paint DIG and let the crew work. Without this the sealed wrecks would be
        /// scenery and the ClearAllDebris goal would be unreachable — the ship would LOOK playable
        /// and not be.
        ///
        /// The fill is not instantaneous and the worksite-safety rule refuses to stage a worker in
        /// unbreathable air, so the wait is load-bearing, not padding: the compartment crosses 90 kPa
        /// at ~1 543 ticks (≈2.6 sim-minutes, measured by
        /// <see cref="OpeningACompartmentsDoor_FillsIt_AndTheFillTimeIsMeasured"/> above; the 6 000
        /// ticks waited below is ~3.9× that, and it is the WRECKED slot 5 rather than the clear slot
        /// 3, so the margin is deliberate). Mutation: drop the <c>SetDoorStateCommand</c> and the same
        /// crew clear nothing.
        /// </summary>
        [Test]
        public void SealedWreck_IsPlayable_ViaOpeningTheDoorThenDig()
        {
            const int sealedSlot = 5;
            var plan = AuthoredShips.PeriluneGrid();
            // M2-2 (OD-H): the crew take no job until they are given one; this leg is about whether the
            // SEALED wreck is reachable at all, so it gives them the work the player would.
            var sim = ShipPlanBuilder.Build(plan, Stack()).GiveAllCrewAllWork();
            for (int i = 0; i < 20; i++) sim.Tick();

            SlotDescriptor slot = default;
            foreach (var s in plan.SlotGrid)
                if (s.Deck == WreckDeck && s.Index == sealedSlot) slot = s;
            var probe = new Int3(slot.X + slot.W / 2, slot.Y + slot.H / 2, slot.Deck);

            // 1a. THE PREMISE, asserted rather than assumed: the sealed wreck boots SHUT and AIRLESS.
            //     This used to be the "＋ADD ROOM changed neither of these" assertion; with the verb
            //     gone it is the plainer and stronger statement that nothing gives the player air for
            //     free before they open anything.
            Assert.That(DoorOf(sim, WreckDeck, sealedSlot).IsOpen, Is.False,
                "the sealed wreck's door boots OPEN — the route below proves nothing");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "the sealed wreck boots with AIR — air is supposed to be earned");

            // 1b. OPEN THE DOOR — the gesture W4b hands the player — and let the spine vent fill the
            //     compartment through it. AIR IS EARNED.
            sim.EnqueueCommand(new SetDoorStateCommand(DoorOf(sim, WreckDeck, sealedSlot).Id, open: true));
            for (int i = 0; i < 6000; i++) sim.Tick();
            Assert.That(DoorOf(sim, WreckDeck, sealedSlot).IsOpen, Is.True, "the door refused to open");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).PressureKPa, Is.GreaterThan(90.0),
                "the opened compartment never filled — the crew cannot be staged in it at all");

            // 2. DIG — the player paints the rubble. The command refuses anything that is not debris,
            //    so this is also the proof the authored tiles are legal targets.
            int painted = 0;
            var r = SlotGridPlanner.InteriorRect(sealedSlot);
            for (int y = r.Y0; y <= r.Y1; y++)
                for (int x = r.X0; x <= r.X1; x++)
                {
                    var p = new Int3(x, y, WreckDeck);
                    sim.EnqueueCommand(new DesignateDigCommand(p, true));
                    sim.Tick();
                    if ((sim.World.GetFlags(p) & TileFlags.Designated) != 0) painted++;
                }
            Assert.That(painted, Is.EqualTo(WreckTilesPerSlot),
                "DesignateDigCommand accepted a different number of tiles than the slot's authored rubble");

            // Counted INSIDE slot 5 only. A whole-ship count would be satisfied by the live wreck
            // (slot 6) the crew are already digging at boot, and this test would pass with the
            // door-opening step deleted — measured, not hypothetical.
            int before = DebrisIn(sim, sealedSlot).Count;
            Assert.That(before, Is.EqualTo(WreckTilesPerSlot), "the sealed slot's rubble is not where it was authored");
            // 40,000 ticks (~66 sim-minutes), not 15,000: the crew are ALSO clearing the live wreck
            // the ship boots designated, and the dispatcher picks the nearest site, so slot 5 only
            // gets hands once slot 6 thins out. At 15,000 this test failed with 0 cleared — which is
            // the ship being honest, not the route being broken. MARGIN: the first slot-5 tile comes
            // out at tick 18,500, so the budget is 2.16×.
            for (int t = 0; t < 40000; t++) sim.Tick();
            int cleared = before - DebrisIn(sim, sealedSlot).Count;
            Assert.That(cleared, Is.GreaterThan(0),
                "the crew never cleared a tile of the opened wreck — the player's route is scenery");
        }

        /// <summary>
        /// THE WHOLE THING, END TO END: the authored goal is COMPLETABLE by the authored crew on the
        /// authored ship, through the player's real route (OPEN THE TWO SEALED WRECKS' DOORS, wait
        /// for the spine vent to fill them, paint DIG over all sixty tiles, let eight crew work).
        /// ⚠️ W4b inserted the door + fill steps, because allocation stopped opening or pressurising
        /// anything; M1-L-b then removed the allocation step itself (OD-K — every carved compartment
        /// already IS a room). Originally MEASURED at tick 55,191 — 1.53 sim-hours — and re-measured
        /// on the W4b route (see the assertion's own note); the cap stays where it was, wide enough
        /// not to be flaky and far short of "any number passes". A goal the ship cannot reach would be
        /// worse than no goal at all, and nothing short of running it proves the difference.
        ///
        /// It also pins deck 1's atmosphere under the dig, which is the only place the deck-1 vent
        /// earns its place: every cleared tile is ~2.5 m³ of NEW volume in the same connected mass,
        /// and all sixty of them dilute an unvented deck 1 from 101.3 kPa to ~89 kPa — under the
        /// 90 kPa a PressurizeAnchor goal calls restored. Mutation: delete vent_spine_1 and the
        /// pressure assertions fail while the rest of the test still passes.
        /// </summary>
        [Test]
        public void Goal_IsCompletable_ByTheAuthoredCrew_ViaOpeningDoorsAndDig()
        {
            const int TickCap = 150000; // ~4.2 sim-hours; MARGIN: the goal latches at 55,191 (2.72×)
            var systems = Stack();
            var plan = AuthoredShips.PeriluneGrid();
            // M2-2 (OD-H): the goal is completable BY A CREW THAT HAS BEEN GIVEN WORK.
            var sim = ShipPlanBuilder.Build(plan, systems).GiveAllCrewAllWork();

            GoalSystem goals = null;
            foreach (var s in systems) if (s is GoalSystem g) goals = g;
            for (int i = 0; i < 20; i++) sim.Tick();

            // The baseline for the CO2 trend assertion below, read from this same run rather than
            // hard-coded — and pinned, so a change to the fill mix is visible here too. A room the
            // authoring pressurises boots at the structural 0.0005 CO2 fraction = 500 ppm.
            double bootCo2 = Co2At(sim, HallProbe(OpenSlot, WreckDeck));
            double bootWorst = WorstCo2OnDeck(sim, WreckDeck);
            Assert.That(bootCo2, Is.EqualTo(500.0).Within(1.0), "a freshly pressurised room boots at 500 ppm CO2");

            // 1. OPEN THE TWO SEALED WRECKS' DOORS. ⚠️ The SetDoorStateCommand is the WHOLE of the
            //    player's opening move now — the door and the air are two separate, earned things —
            //    and the 6 000-tick wait is what lets deck 1's spine vent fill the compartments
            //    through the open doorways. (M1-L-b removed a preceding AddRoomCommand here; it only
            //    ever set an anchor's RoomType, which no gas or job term reads, so the route is
            //    unchanged in everything it measures.)
            foreach (var s in plan.SlotGrid)
            {
                if (s.Deck != WreckDeck || s.Index == OpenSlot) continue;
                bool wrecked = false;
                foreach (int slot in ExpectedWreckSlots) if (s.Index == slot) wrecked = true;
                if (!wrecked) continue;
                sim.EnqueueCommand(new SetDoorStateCommand(DoorOf(sim, WreckDeck, s.Index).Id, open: true));
            }
            for (int i = 0; i < 6000; i++) sim.Tick();

            // 2. Paint DIG over every remaining debris tile.
            foreach (var p in DebrisTiles(sim)) sim.EnqueueCommand(new DesignateDigCommand(p, true));

            // 3. Let the crew work.
            long doneAt = -1;
            for (int t = 0; t < TickCap && doneAt < 0; t++)
            {
                sim.Tick();
                if (goals.Goals[0].Done) doneAt = sim.TickCount;
            }

            Assert.That(doneAt, Is.GreaterThan(0),
                $"the ClearAllDebris goal did not complete in {TickCap} ticks — " +
                $"{DebrisTiles(sim).Count} debris tiles left of {ExpectedWreckTiles}");

            // CO2 TREND, at zero extra runtime: after eight crew have spent an hour working deck 1,
            // its worst room must be BELOW where the deck booted. That is the deck-1 scrubbers doing
            // their job through B-3 door diffusion, and it is the only assertion in the suite that
            // can bite on them — the narcosis threshold is ~190 h away, but the direction separates
            // inside this run (measured at the completion tick: 384 ppm falling with the three
            // scrubbers, 792 ppm rising without them; at one sim-day, 9 ppm vs 3,405 ppm).
            // Read the LIVE WRECK'S OWN ROOM first — the compartment the crew have been breathing in
            // for the whole run, and the one with no scrubber of its own, so it is the honest test of
            // whether B-3 diffusion is carrying its CO2 out to the spine scrubbers.
            var wreckRoom = sim.Rooms.RoomAt(sim.World, HallProbe(OpenSlot, WreckDeck));
            // Identity check, so this assertion cannot drift onto some other room and stay green: the
            // wreck's compartment is the only room on the ship that GREW — 40 clear tiles at boot plus
            // the 20 its crew dug out. It also pins that the dug volume actually joined the room.
            Assert.That(wreckRoom.TileCount, Is.EqualTo(SlotGridPlanner.InteriorW * SlotGridPlanner.InteriorH),
                "the cleared wreck must be a whole 10x6 compartment again — 40 clear + 20 dug");
            double wreckCo2 = wreckRoom.CO2Ppm;
            Assert.That(wreckCo2, Is.LessThan(bootCo2),
                $"the wreck the crew just spent an hour digging is at {wreckCo2:0} ppm CO2, at or above its " +
                $"{bootCo2:0} ppm boot value — its CO2 is not reaching deck 1's scrubbers");
            double worstCo2 = WorstCo2OnDeck(sim, WreckDeck);
            Assert.That(worstCo2, Is.LessThan(bootWorst),
                $"deck 1's worst room is at {worstCo2:0} ppm CO2, at or above the deck's {bootWorst:0} ppm boot " +
                "value — the deck is accumulating what its crew breathe out instead of scrubbing it");
            Assert.That(DebrisTiles(sim).Count, Is.Zero, "the goal latched with debris still aboard");

            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            Assert.That(alive, Is.EqualTo(plan.Citizens.Count), "the crew did not survive clearing their own ship");

            Assert.That(sim.Rooms.RoomAt(sim.World, HallProbe(OpenSlot, WreckDeck)).PressureKPa,
                Is.GreaterThan(90.0), "the cleared wreck thinned out — deck 1's vent is not making the new volume up");
            Assert.That(sim.Rooms.RoomAt(sim.World, new Int3(2, SlotGridPlanner.SpineY0, WreckDeck)).PressureKPa,
                Is.GreaterThan(90.0), "deck 1's spine thinned out as the wreck opened into it");
        }
    }
}
