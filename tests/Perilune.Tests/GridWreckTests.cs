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
    /// roster, and the ＋ADD ROOM slot's untouched sealed/airless state) stop the content drifting
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

        private const int WreckDeck = AuthoredShips.GridWreckDeck;
        private const int OpenSlot = AuthoredShips.GridOpenWreckSlot;
        private const int WreckRows = AuthoredShips.GridWreckRows;

        /// <summary>Slots authored wrecked. Mirrored from the (private) authoring list on purpose:
        /// a test that reads the same field it checks cannot fail, so this is written out by hand
        /// and <see cref="Wreck_SitsOnlyInTheThreeFreeDeck1Halls"/> proves the world agrees.</summary>
        private static readonly int[] ExpectedWreckSlots = { 5, 6, 7 };

        private static int WreckTilesPerSlot => WreckRows * SlotGridPlanner.InteriorW;
        private static int ExpectedWreckTiles => ExpectedWreckSlots.Length * WreckTilesPerSlot;

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
        /// ＋ADD ROOM's slot is untouched. Deck 0 is fully furnished, so deck 1 slot 3 is the first
        /// RoomType.None entry in plan.SlotGrid — AddRoomCommandTests' FirstEmptyHall, which probes
        /// its centre tile and asserts a sealed, AIRLESS, non-vacuum room. This states that contract
        /// from the AUTHORING side, so wrecking slot 3 fails here (naming the reason) as well as
        /// over in AddRoomCommandTests. Mutation: add 3 to GridWreckSlots, or add its anchor to
        /// PressurizedAnchors, or open its door.
        /// </summary>
        [Test]
        public void AddRoomSlot_StaysSealedAirlessAndDebrisFree()
        {
            var plan = AuthoredShips.PeriluneGrid();

            int firstEmpty = -1;
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Type == RoomType.None) { firstEmpty = i; break; }
            Assert.That(firstEmpty, Is.GreaterThanOrEqualTo(0), "the grid ship must keep an empty hall to commission");
            var hall = plan.SlotGrid[firstEmpty];
            Assert.That(hall.Deck, Is.EqualTo(WreckDeck), "FirstEmptyHall is expected on deck 1");
            Assert.That(hall.Index, Is.EqualTo(3),
                "FirstEmptyHall must stay slot 3 — the wreck must not consume the ＋ADD ROOM demonstration slot");

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = HallProbe(3, WreckDeck);
            var room = sim.Rooms.RoomAt(sim.World, probe);
            Assert.That(ReferenceEquals(room, sim.Rooms.Rooms[0]), Is.False,
                "slot 3 must stay its own sealed room, not the vacuum sink");
            Assert.That(room.TotalMoles, Is.EqualTo(0.0),
                "slot 3 must stay AIRLESS — AddRoomCommand refuses a compartment that already holds air");
            Assert.That(DoorOf(sim, WreckDeck, 3).IsOpen, Is.False, "slot 3's door must stay closed");

            foreach (var p in DebrisTiles(sim))
            {
                var r = SlotGridPlanner.InteriorRect(3);
                bool inSlot3 = p.Z == WreckDeck && p.X >= r.X0 && p.X <= r.X1 && p.Y >= r.Y0 && p.Y <= r.Y1;
                Assert.That(inSlot3, Is.False, $"debris at {p} is inside the ＋ADD ROOM slot");
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
        /// verbs; eight is the slice's number and what deck 0's loops are sized for. AutoWander stays
        /// FALSE against the slice's setting because this ship's ladder trunk makes six VACUUM decks
        /// walkable from tick 0. Mutation: restore the three-crew roster, or flip a HoldPosition, and
        /// the count/flag assertions fail.
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
                Assert.That(c.AutoWander, Is.False,
                    $"{c.Name} may wander: the ladder trunk makes six vacuum decks walkable from tick 0");
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
        /// </summary>
        [Test]
        public void Crew_ClearTheLiveWreck_UnpromptedAndInBreathableAir()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            int debrisAtBoot = DebrisTiles(sim).Count;

            bool sawDig = false, sawFlee = false;
            var diggers = new HashSet<string>();
            for (int t = 0; t < 15000; t++)   // 25 sim-minutes: travel + two 10-minute digs
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

            var left = DebrisTiles(sim);
            int cleared = debrisAtBoot - left.Count;
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
        /// THE PLAYABILITY PROOF for the two sealed wrecks: the player's own route works. ＋ADD ROOM
        /// commissions a wrecked hall (opening its door and filling it with air), DIG designates the
        /// rubble, and the crew clear it. Without this the sealed wrecks would be scenery and the
        /// ClearAllDebris goal would be unreachable — the ship would LOOK playable and not be.
        /// Mutation: leave a sealed wreck's door shut (skip the AddRoomCommand) and the same crew
        /// clear nothing.
        /// </summary>
        [Test]
        public void SealedWreck_IsPlayable_ViaAddRoomThenDig()
        {
            const int sealedSlot = 5;
            var plan = AuthoredShips.PeriluneGrid();
            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            SlotDescriptor slot = default;
            foreach (var s in plan.SlotGrid)
                if (s.Deck == WreckDeck && s.Index == sealedSlot) slot = s;
            var probe = new Int3(slot.X + slot.W / 2, slot.Y + slot.H / 2, slot.Deck);

            // 1. ＋ADD ROOM — the Overview affordance. Opens the door and pressurises the compartment.
            sim.EnqueueCommand(new AddRoomCommand(slot.Deck, slot.Index, RoomType.Storage, probe, slot.Anchor));
            for (int i = 0; i < 20; i++) sim.Tick();
            Assert.That(DoorOf(sim, WreckDeck, sealedSlot).IsOpen, Is.True, "＋ADD ROOM must open the hall's door");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).PressureKPa, Is.GreaterThan(90.0),
                "＋ADD ROOM must make the wrecked hall breathable");

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

            int before = DebrisTiles(sim).Count;
            for (int t = 0; t < 15000; t++) sim.Tick();
            int cleared = before - DebrisTiles(sim).Count;
            Assert.That(cleared, Is.GreaterThan(0),
                "the crew never cleared a tile of the commissioned wreck — the player's route is scenery");
        }

        /// <summary>
        /// THE WHOLE THING, END TO END: the authored goal is COMPLETABLE by the authored crew on the
        /// authored ship, through the player's real route (＋ADD ROOM the two sealed wrecks, paint DIG
        /// over all sixty tiles, let eight crew work). MEASURED at tick 55,191 — 1.53 sim-hours —
        /// with the cap here set at ~2.7× that, wide enough not to be flaky and far short of "any
        /// number passes". A goal the ship cannot reach would be worse than no goal at all, and
        /// nothing short of running it proves the difference.
        ///
        /// It also pins deck 1's atmosphere under the dig, which is the only place the deck-1 vent
        /// earns its place: every cleared tile is ~2.5 m³ of NEW volume in the same connected mass,
        /// and all sixty of them dilute an unvented deck 1 from 101.3 kPa to ~89 kPa — under the
        /// 90 kPa a PressurizeAnchor goal calls restored. Mutation: delete vent_spine_1 and the
        /// pressure assertions fail while the rest of the test still passes.
        /// </summary>
        [Test]
        public void Goal_IsCompletable_ByTheAuthoredCrew_ViaAddRoomAndDig()
        {
            const int TickCap = 150000; // ~4.2 sim-hours; the measured completion is 55,191
            var systems = Stack();
            var plan = AuthoredShips.PeriluneGrid();
            var sim = ShipPlanBuilder.Build(plan, systems);

            GoalSystem goals = null;
            foreach (var s in systems) if (s is GoalSystem g) goals = g;
            for (int i = 0; i < 20; i++) sim.Tick();

            // 1. Commission the two sealed wrecks (＋ADD ROOM opens the door + fills the compartment).
            foreach (var s in plan.SlotGrid)
            {
                if (s.Deck != WreckDeck || s.Index == OpenSlot) continue;
                bool wrecked = false;
                foreach (int slot in ExpectedWreckSlots) if (s.Index == slot) wrecked = true;
                if (!wrecked) continue;
                var probe = new Int3(s.X + s.W / 2, s.Y + s.H / 2, s.Deck);
                sim.EnqueueCommand(new AddRoomCommand(s.Deck, s.Index, RoomType.Storage, probe, s.Anchor));
            }
            for (int i = 0; i < 20; i++) sim.Tick();

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
