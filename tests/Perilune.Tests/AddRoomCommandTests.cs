using System;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice — the goldens' own boot path
using Perilune.Web;   // GameSession — the decks channel this command has to be visible on
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// <b>AddRoomCommand after W4b — NAMING IS FREE, AIR IS EARNED.</b>
    ///
    /// <para>The Overview's ＋ADD ROOM affordance used to do three things: name+type the compartment,
    /// force every bordering door open AND unlocked, and <c>RoomState.Pressurize</c> it — 101.3 kPa of
    /// 21 % O₂ conjured from nothing, instantly. The owner's rev-2 decision deleted the last two. What
    /// is left is an ALLOCATION: a name and a type, and nothing else moves.</para>
    ///
    /// <para><b>THE LOAD-BEARING CHANGE IS THE REJECTION PREDICATE, not the deletions.</b> The old
    /// double-commission guard was <c>room.TotalMoles &gt; 0</c>, which is only a proxy for "already
    /// commissioned" while naming and pressurising are the same event. They no longer are, in BOTH
    /// directions: an allocated compartment is airless (so the gas predicate would let a player re-type
    /// it forever) and a FURNISHED room can be airless too (breach, a door opened onto vacuum) — so the
    /// gas predicate would let a player re-type a furnished, dressed room. The predicate now asks the
    /// ANCHOR. <see cref="Allocate_IsRejected_OnAFurnishedRoomThatHasBeenVented"/> is the decisive test
    /// of that: it is a state the OLD predicate accepted and the new one refuses, so it fails on the
    /// old code by construction rather than by inspection.</para>
    ///
    /// <para><b>⛔ TWO OPEN DEFECTS THIS PACKAGE CREATED OR EXPOSED, filed and NOT fixed. Read them
    /// before writing anything that depends on a freshly allocated compartment being usable.</b>
    /// Full measurements in <c>docs/HANDOVER.md</c> ("NEW, OPEN ON THE OWNER" items 4 and 5) and in
    /// <c>docs/design/perilune-wreck-start.plan.md</c> under W4b.
    /// <list type="number">
    /// <item><b>"W4b-DEAD-DECK"</b> — on the SHIPPED DEFAULT SHIP <c>--ship wreck</c>, all eight
    /// deck-1 compartments now have NO route to air: both authored <c>AirVent</c>s are on deck 0 and
    /// gas transport is strictly in-plane, so allocating + opening the door leaves them at peak
    /// <c>0.000</c> kPa over 20 000 ticks. Before W4b, ＋ADD ROOM pressurised them instantly. The
    /// door/vent verb lane does not help — there is no vent up there. <b>OWNER DECISION</b>; not fixed
    /// here because the fix is content.</item>
    /// <item><b>"W4b-BLOCKED-FOG"</b> — the <c>blocked</c> channel is fog-gated
    /// (<c>GameSession.AddIfBlocked</c>), and a freshly allocated compartment has never been entered,
    /// so <b>the channel is silent in exactly the situation this package makes normal</b>. A build
    /// ghost still draws (<c>designs</c> is not fog-gated) with no reason beside it; a dig/strip mark
    /// does not draw at all. ⚠️ <b>Do not write "W4's blocked channel already covers the silent
    /// worksite refusal for an allocated room" — it does not.</b></item>
    /// </list></para>
    ///
    /// <para><b>GATES N/A, stated so a reviewer does not score against them.</b> No def scalar, no new
    /// hashed field, no save-chapter change, no new <c>GlyphColor</c> id. The command's ONE
    /// surviving effect (a <see cref="RoomAnchor"/>'s <c>Type</c>) was hashed before and is hashed now.
    /// All five determinism pins must be byte-identical: nothing in the three pinned runs constructs an
    /// <see cref="AddRoomCommand"/> — verified mechanically, not by grep, in
    /// <see cref="NoPinnedRunDrivesThisCommand_Probe"/>.</para>
    /// </summary>
    public class AddRoomCommandTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        /// <summary>Mirror of GameSession.HandleAddRoom's geometry derivation: the interior centre of
        /// the wall-inclusive slot window is the probe, and the slot keeps its own anchor.</summary>
        private static AddRoomCommand CommandFor(SlotDescriptor slot, RoomType type) =>
            new AddRoomCommand(slot.Deck, slot.Index, type,
                new Int3(slot.X + slot.W / 2, slot.Y + slot.H / 2, slot.Deck), slot.Anchor);

        private static Int3 ProbeOf(SlotDescriptor slot) =>
            new Int3(slot.X + slot.W / 2, slot.Y + slot.H / 2, slot.Deck);

        private static SlotDescriptor FirstEmptyHall(ShipPlan plan)
        {
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Type == RoomType.None) return plan.SlotGrid[i];
            Assert.Fail("grid ship has no empty hall to commission");
            return default;
        }

        private static SlotDescriptor FurnishedSlot(ShipPlan plan, int deck = 0)
        {
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Deck == deck && plan.SlotGrid[i].Type != RoomType.None)
                    return plan.SlotGrid[i];
            Assert.Fail($"deck {deck} must have a furnished room");
            return default;
        }

        private static RoomType TypeOfAnchor(Simulation sim, string anchorName)
        {
            var a = sim.Rooms.Anchors.Find(x => x.Name == anchorName);
            Assert.That(a.Name, Is.EqualTo(anchorName), $"anchor '{anchorName}' is missing entirely");
            return a.Type;
        }

        /// <summary>The single door carved into a grid slot's spine-facing wall
        /// (<c>SlotGridPlanner.Carve</c> names it <c>door_dZ_sN</c>).</summary>
        private static Device DoorOf(Simulation sim, SlotDescriptor slot)
        {
            string name = System.FormattableString.Invariant($"door_d{slot.Deck}_s{slot.Index}");
            foreach (var d in sim.Devices.Items)
                if (d.Kind == DeviceKind.Door && d.Name == name) return d;
            Assert.Fail($"no door named {name}");
            return null;
        }

        // ═════════════════════════════════════════════ 1. what allocation DOES, and what it no longer does

        /// <summary>
        /// The renamed successor of <c>CommissionEmptyHall_IsDeterministic_AndMakesTheSlotALiveRoom</c>.
        /// Its ANCHOR assertions are carried over unchanged — they were always the ones testing the
        /// right thing — and its <c>TotalMoles &gt; 0</c> assertion is INVERTED: an allocated hall is
        /// airless, its door is shut, and its lock is exactly where the authoring left it.
        ///
        /// The door/lock legs are not decoration: force-opening + force-unlocking is what the old
        /// command did, it is R-11 (a free skeleton key past a Lien-owned lock), and it is the root
        /// cause of the owner's *"doors are only drawn in front of empty rooms"* report.
        ///
        /// MUTATIONS: restore <c>RoomState.Pressurize(room)</c> ⇒ the airless leg fails; restore the
        /// door-forcing loop ⇒ the IsOpen leg fails.
        /// </summary>
        [Test]
        public void AllocateEmptyHall_IsDeterministic_NamesTheSlot_AndMakesNoAirAndOpensNoDoor()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = ProbeOf(hall);
            const RoomType type = RoomType.Medbay;

            var a = ShipPlanBuilder.Build(plan, Stack());
            var b = ShipPlanBuilder.Build(plan, Stack());

            // Warm up so the RoomId plane + atmosphere settle identically on both twins.
            for (int i = 0; i < 20; i++) { a.Tick(); b.Tick(); }

            // BEFORE: the target is a sealed, AIRLESS compartment — a distinct (non-vacuum-sink) room
            // with zero moles, behind a shut door.
            var hallRoomBefore = a.Rooms.RoomAt(a.World, probe);
            Assert.That(ReferenceEquals(hallRoomBefore, a.Rooms.Rooms[0]), Is.False,
                "an empty hall must be its own sealed room, not the vacuum sink");
            Assert.That(hallRoomBefore.TotalMoles, Is.EqualTo(0.0),
                "an un-allocated hall must be airless");
            Assert.That(DoorOf(a, hall).IsOpen, Is.False, "an empty hall's door boots CLOSED");

            // LOCK the door on both twins first. Without this the lock leg below CANNOT BITE — grid
            // authors no locked doors, so `IsLocked` is false before AND after, and the natural way to
            // write the assertion (`Is.EqualTo(lockedBefore)`) is satisfied by a command that unlocks
            // everything. MEASURED, not argued: with this setup replaced by `bool lockedBefore = …`
            // and the assertion written against it, the door-forcing mutation leaves the lock leg
            // GREEN — while with the lock in place the same mutation reddens it (blinded runs B3/B4).
            a.EnqueueCommand(new SetDoorStateCommand(DoorOf(a, hall).Id, locked: true));
            b.EnqueueCommand(new SetDoorStateCommand(DoorOf(b, hall).Id, locked: true));
            a.Tick(); b.Tick();
            Assert.That(DoorOf(a, hall).IsLocked, Is.True, "the lock leg's own precondition failed");

            // Allocate the SAME hall on both twins, then advance both.
            a.EnqueueCommand(CommandFor(hall, type));
            b.EnqueueCommand(CommandFor(hall, type));
            for (int i = 0; i < 200; i++) { a.Tick(); b.Tick(); }

            // Determinism: the two runs fold identically (no new/unhashed state introduced).
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()),
                "twin runs that both allocate the same hall must produce identical StateHashes");

            // The slot is now ALLOCATED — named and typed — and STILL AIRLESS behind a SHUT door.
            var hallRoomAfter = a.Rooms.RoomAt(a.World, probe);
            Assert.That(ReferenceEquals(hallRoomAfter, a.Rooms.Rooms[0]), Is.False,
                "the allocated hall must not resolve to vacuum");
            Assert.That(hallRoomAfter.TotalMoles, Is.EqualTo(0.0),
                "W4b: ＋ADD ROOM must NOT conjure air — the compartment stays vacuum until a vent fills it");
            Assert.That(DoorOf(a, hall).IsOpen, Is.False,
                "W4b: ＋ADD ROOM must NOT open the compartment's door (the owner's vanishing-doors report)");
            Assert.That(DoorOf(a, hall).IsLocked, Is.True,
                "W4b: ＋ADD ROOM must NOT unlock anything (R-11: a free skeleton key past a Lien lock)");

            var anchor = a.Rooms.Anchors.Find(x => x.Name == hall.Anchor);
            Assert.That(anchor.Name, Is.EqualTo(hall.Anchor), "the hall's anchor must survive allocation");
            Assert.That(anchor.Type, Is.EqualTo(type), "the anchor must carry the allocated room type");
            Assert.That(a.Rooms.RoomIdAt(a.World, anchor.Probe),
                Is.EqualTo(a.Rooms.RoomIdAt(a.World, probe)),
                "the anchor must probe the allocated room");
        }

        /// <summary>
        /// A NAMED-BUT-AIRLESS room is a LEGITIMATE, STABLE state — the thing W4b makes normal and the
        /// thing the old gas predicate could not represent. Driven for 6 000 ticks (10 sim-minutes)
        /// after allocation: nothing in the whole system stack quietly re-pressurises it, re-types it,
        /// opens its door or drops the anchor. NON-VACUITY: the same run asserts deck 1's spine (which
        /// DOES have a vent) stays breathable throughout, so "everything is airless" cannot be what
        /// makes this pass.
        ///
        /// MUTATION: restore <c>RoomState.Pressurize(room)</c> in the command ⇒ the airless leg fails
        /// at tick 0 of the loop.
        /// </summary>
        [Test]
        public void AllocatedButAirless_IsAStableState_ForTenSimMinutes()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = ProbeOf(hall);
            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            sim.EnqueueCommand(CommandFor(hall, RoomType.Quarters));
            sim.Tick();
            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Quarters));

            var spineProbe = new Int3(2, SlotGridPlanner.SpineY0, hall.Deck);
            for (int t = 0; t < 6000; t++)
            {
                sim.Tick();
                if (t % 500 != 0) continue;
                Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                    $"the allocated hall gained air at tick {t} with its door still shut");
                Assert.That(DoorOf(sim, hall).IsOpen, Is.False,
                    $"the allocated hall's door opened by itself at tick {t}");
                Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Quarters),
                    $"the allocation was lost at tick {t}");
                // NON-VACUITY: the ship's atmosphere really is running in this sim.
                Assert.That(sim.Rooms.RoomAt(sim.World, spineProbe).PressureKPa, Is.GreaterThan(90.0),
                    $"deck {hall.Deck}'s spine lost pressure at tick {t} — this run proves nothing about " +
                    "the hall if the whole ship is airless");
            }
        }

        // ═════════════════════════════════════════════════════════ 2. the rejection predicate (3 legs)

        /// <summary>
        /// LEG 1 (carried over from <c>Commission_IsRejected_OnAnAlreadyLiveRoom</c>): a FURNISHED,
        /// pressurised, typed room refuses re-allocation. Deliberately its own [Test] and not a leg
        /// inside a bigger one — <c>assert</c> throws, so a second leg in the same method is
        /// indistinguishable from a dead one (CLAUDE.md, the fifth trap shape).
        /// MUTATION: delete the anchor loop from <c>AddRoomCommand.Execute</c> ⇒ RED.
        /// </summary>
        [Test]
        public void Allocate_IsRejected_OnAnAlreadyNamedRoom_Furnished()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var furnished = FurnishedSlot(plan);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = ProbeOf(furnished);
            var typeBefore = TypeOfAnchor(sim, furnished.Anchor);
            Assert.That(typeBefore, Is.Not.EqualTo(RoomType.Storage), "pick a different target type");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.GreaterThan(0.0),
                "this leg is about a FURNISHED, pressurised room — it must actually hold air");

            sim.EnqueueCommand(new AddRoomCommand(furnished.Deck, furnished.Index, RoomType.Storage, probe, furnished.Anchor));
            sim.Tick();

            Assert.That(TypeOfAnchor(sim, furnished.Anchor), Is.EqualTo(typeBefore),
                "allocating an already-named room must be a no-op — its type must not change");
        }

        /// <summary>
        /// LEG 2 — THE ONE W4b CREATED: an ALLOCATED but AIRLESS hall refuses re-allocation. Under the
        /// retired gas predicate this compartment reads <c>TotalMoles == 0</c> and would be re-typed on
        /// every click, forever.
        /// MUTATION: delete the anchor loop from <c>AddRoomCommand.Execute</c> ⇒ RED (and this is the
        /// leg that would go green again if someone "restored" the gas predicate).
        /// </summary>
        [Test]
        public void Allocate_IsRejected_OnAnAlreadyNamedRoom_AllocatedButAirless()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = ProbeOf(hall);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            sim.Tick();
            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Medbay),
                "the first allocation must land — otherwise the re-allocation below proves nothing");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "this leg is about an AIRLESS allocated room: the retired gas predicate would accept it");

            sim.EnqueueCommand(CommandFor(hall, RoomType.Workshop));
            sim.Tick();

            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Medbay),
                "an allocated compartment must not be re-typed — 'airless' no longer means 'unallocated'");
        }

        /// <summary>
        /// LEG 3 — THE DECISIVE ONE. A FURNISHED room that has been VENTED (breach, a door opened onto
        /// vacuum) is typed AND airless at the same time. The retired <c>TotalMoles &gt; 0</c> predicate
        /// ACCEPTS it: a player could re-type a dressed, furnished medbay as a broom cupboard because it
        /// happened to be in vacuum at that moment. This is the state the anchor predicate exists for,
        /// and it fails on the old code by construction rather than by inspection.
        ///
        /// The venting is done by zeroing the room's moles directly rather than by cutting a hull — the
        /// assertion is about the PREDICATE, and routing through a 40-minute breach would only add ways
        /// for the test to be about something else. The control below proves the state is real.
        /// MUTATION: delete the anchor loop ⇒ RED. Also, MEASURED: replace the anchor loop with
        /// <c>if (room.TotalMoles &gt; 0) return;</c> (the retired predicate) ⇒ <b>THREE</b> reds —
        /// here, the airless leg above, and
        /// <see cref="Allocate_ToRoomTypeNone_CannotUnAllocateAnAlreadyAllocatedRoom"/> — and GREEN on
        /// the furnished leg. Those three ARE the specification of what the predicate change bought.
        /// ⚠️ An earlier version of this sentence said "two" and called them "the ONLY reds that
        /// mutation produces in the whole file". The count was wrong (found in independent review, and
        /// re-measured here), and "only" was the defect in it — a claim about what a mutation does NOT
        /// touch is a claim about every other test in the file, and it had not been counted.
        /// </summary>
        [Test]
        public void Allocate_IsRejected_OnAFurnishedRoomThatHasBeenVented()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var furnished = FurnishedSlot(plan);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = ProbeOf(furnished);
            var typeBefore = TypeOfAnchor(sim, furnished.Anchor);
            var room = sim.Rooms.RoomAt(sim.World, probe);
            Assert.That(room.TotalMoles, Is.GreaterThan(0.0), "the furnished room must start with air");

            // Vent it: everything the compartment held is gone.
            room.O2Moles = 0; room.N2Moles = 0; room.CO2Moles = 0;
            // CONTROL: the state the old predicate keys on is genuinely present at the tick boundary.
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "the vented furnished room is not actually airless — this test would prove nothing");

            sim.EnqueueCommand(new AddRoomCommand(furnished.Deck, furnished.Index, RoomType.Storage, probe, furnished.Anchor));
            sim.Tick();

            Assert.That(TypeOfAnchor(sim, furnished.Anchor), Is.EqualTo(typeBefore),
                "a FURNISHED room that happens to be in vacuum was re-typed — this is the exact hole the " +
                "anchor predicate was written to close, and the retired gas predicate leaves it open");
        }

        /// <summary>
        /// LEG 4 — <b>ROOM IDENTITY, the guard's decisive property, which nothing else here pinned.</b>
        /// The predicate is *"does an anchor resolving to THIS ROOM carry a type"*, and the load-bearing
        /// half of that is <c>RoomIdAt(anchor.Probe) == roomId</c> — a question about GEOMETRY, not about
        /// names. Every other test in this file targets a compartment whose own anchor is the one being
        /// re-typed, so all of them stay green if the loop is weakened to <c>anchor.Name == _anchorName</c>
        /// (measured: mutation H, whole suite GREEN). That weakening is not academic — it re-opens
        /// exactly the hole the class comment claims to close.
        ///
        /// <para>So: MERGE two compartments and allocate the one whose anchor is still untyped. Stripping
        /// the shared bulkhead between grid deck-1 slot 2 (<c>engineering</c>, furnished and TYPED) and
        /// slot 3 (an empty hall) makes one room carrying two anchors with DIFFERENT NAMES. Allocating
        /// slot 3 must be refused, because the room it names is engineering's. Under the name-matching
        /// mutation it is accepted, and a furnished, dressed engineering bay acquires a second, player-set
        /// room type.</para>
        ///
        /// <para>The merge is driven through the real <see cref="SetTileCommand"/> — the same primitive the
        /// build/strip verbs lower to — and asserted (room count falls, both probes resolve to ONE id)
        /// rather than assumed. NON-VACUITY: the control at the end allocates the SAME slot on an
        /// UNMERGED ship and requires it to SUCCEED, so "refused" cannot be something the fixture does
        /// to slot 3 generally.</para>
        ///
        /// MUTATION H: <c>rooms.RoomIdAt(sim.World, anchors[i].Probe) == roomId</c> →
        /// <c>anchors[i].Name == _anchorName</c> ⇒ RED here and GREEN everywhere else in the suite.
        /// </summary>
        [Test]
        public void Allocate_IsRejected_WhenADIFFERENTLY_NAMED_TypedAnchorOwnsTheMergedRoom()
        {
            var plan = AuthoredShips.PeriluneGrid();
            const int deck = 1, typedSlot = 2, hallSlot = 3;

            SlotDescriptor typed = default, hall = default;
            foreach (var s in plan.SlotGrid)
            {
                if (s.Deck != deck) continue;
                if (s.Index == typedSlot) typed = s;
                if (s.Index == hallSlot) hall = s;
            }
            Assert.That(typed.Anchor, Is.EqualTo("engineering"), "the fixture's typed neighbour moved");
            Assert.That(hall.Type, Is.EqualTo(RoomType.None), "the fixture's hall moved");
            Assert.That(hall.Anchor, Is.Not.EqualTo(typed.Anchor),
                "the two anchors must have DIFFERENT NAMES or this test cannot distinguish the two predicates");

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var typedProbe = ProbeOf(typed);
            var hallProbe = ProbeOf(hall);
            int roomsBefore = sim.Rooms.Rooms.Count;
            Assert.That(sim.Rooms.RoomIdAt(sim.World, typedProbe),
                Is.Not.EqualTo(sim.Rooms.RoomIdAt(sim.World, hallProbe)),
                "the two compartments must start SEPARATE");

            // Cut out the shared bulkhead column between the two interiors, tile by tile, through the
            // real terrain command (which recomputes tile flags and marks the room graph dirty).
            var left = SlotGridPlanner.InteriorRect(typedSlot);
            var right = SlotGridPlanner.InteriorRect(hallSlot);
            int wallX = left.X1 + 1;
            Assert.That(wallX, Is.EqualTo(right.X0 - 1), "the two slots are not wall-adjacent");
            for (int y = right.Y0; y <= right.Y1; y++)
                sim.EnqueueCommand(new SetTileCommand(new Int3(wallX, y, deck), wall: TileDefs.Void));
            for (int i = 0; i < 5; i++) sim.Tick();

            Assert.That(sim.Rooms.Rooms.Count, Is.LessThan(roomsBefore),
                "the bulkhead came out but no rooms merged — the premise of this test did not happen");
            ushort merged = sim.Rooms.RoomIdAt(sim.World, hallProbe);
            Assert.That(sim.Rooms.RoomIdAt(sim.World, typedProbe), Is.EqualTo(merged),
                "the two compartments did not become ONE room");
            Assert.That(TypeOfAnchor(sim, typed.Anchor), Is.EqualTo(RoomType.Engineering),
                "engineering lost its type in the merge — the assertion below would then prove nothing");
            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.None),
                "the hall's own anchor must still be untyped — that is what makes the name test pass and " +
                "the identity test fail");

            // THE ALLOCATION. Its anchor name is untyped; the ROOM it names is engineering's.
            sim.EnqueueCommand(CommandFor(hall, RoomType.Storage));
            sim.Tick();

            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.None),
                "a compartment merged into a FURNISHED, TYPED room was allocated anyway. The guard is " +
                "matching anchor NAMES instead of asking which room the anchor resolves to, so the " +
                "engineering bay now carries a second, player-set room type.");
            Assert.That(TypeOfAnchor(sim, typed.Anchor), Is.EqualTo(RoomType.Engineering),
                "engineering was re-typed");

            // NON-VACUITY CONTROL: the identical allocation on an UNMERGED ship must SUCCEED, so the
            // refusal above is caused by the merge and not by anything else about slot 3.
            var control = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            for (int i = 0; i < 20; i++) control.Tick();
            control.EnqueueCommand(CommandFor(hall, RoomType.Storage));
            control.Tick();
            Assert.That(TypeOfAnchor(control, hall.Anchor), Is.EqualTo(RoomType.Storage),
                "the control allocation failed, so 'refused' above says nothing about the merge");
        }

        /// <summary>
        /// THE UN-ALLOCATE TRAPDOOR IS CLOSED BY THE ANCHOR PREDICATE ALONE — and this test is here to
        /// say so, having been rewritten after its first version was measured to be worthless.
        ///
        /// <para>⚠️ <b>WHAT HAPPENED, recorded because it is the repo's most common review defect.</b>
        /// This lane first shipped a second guard, <c>if (_type == RoomType.None) return;</c>, with a
        /// test asserting it. The mutation harness deleted that line and <b>the whole suite stayed
        /// GREEN, 21/21</b>: the anchor loop already returns one statement earlier, because an
        /// allocated compartment's anchor is TYPED. The guard could not bite and neither could the
        /// test. Both were deleted; this test survives as the behavioural statement, and its named
        /// mutation is now one that CAN bite (deleting the anchor loop).</para>
        ///
        /// MUTATION: delete the anchor loop from <c>AddRoomCommand.Execute</c> ⇒ RED.
        /// </summary>
        [Test]
        public void Allocate_ToRoomTypeNone_CannotUnAllocateAnAlreadyAllocatedRoom()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            sim.Tick();
            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Medbay));

            sim.EnqueueCommand(CommandFor(hall, RoomType.None));
            sim.Tick();
            Assert.That(TypeOfAnchor(sim, hall.Anchor), Is.EqualTo(RoomType.Medbay),
                "allocating to None un-allocated the room — the anchor predicate has a trapdoor");
        }

        // ═════════════════════════════════════════════════════ 3. AIR IS EARNED — the fill, measured

        /// <summary>
        /// <b>AIR IS EARNED: the player's real route, driven end to end, and the fill TIME measured.</b>
        /// Allocate the hall (no air), then OPEN ITS DOOR — the one gesture W4b hands back to the
        /// player — and let deck 1's spine vent (<c>vent_spine_1</c>, an authored AirVent in the
        /// corridor) push gas through the doorway until the compartment is breathable.
        ///
        /// <para><b>MEASURED, not predicted — and the answer is GOOD NEWS for pacing.</b> The 60-tile
        /// compartment crosses 50 kPa at tick <b>461 (46.1 s)</b> and 90 kPa — the threshold a
        /// <c>PressurizeAnchor</c> goal calls restored, and comfortably breathable — at tick
        /// <b>1 543 (154.3 s ≈ 2.6 sim-minutes)</b>. The plan's revision-1 worry was that a compartment
        /// might take twenty sim-minutes; it takes two and a half.</para>
        ///
        /// <para><b>AND ON THE SHIP THAT MATTERS — <c>--ship wreck</c>, measured the same way with a
        /// throwaway probe, one fresh sim per slot:</b> every 60-tile <b>deck-0</b> hall reaches 90 kPa
        /// at tick <b>2 986–2 992 (≈299 s ≈ 5.0 sim-minutes)</b>, and the 40-tile slot 7 at tick 1 870
        /// (187 s). Slower than grid for two authored reasons, both intended: <c>vent_cryo</c> boots at
        /// <c>Condition 0.62</c>, so <c>Device.EffectiveRate</c> tapers it, and the wreck's pressurised
        /// reservoir is THREE anchors (cryo bay, spine, reactor) against grid's thirteen. Nowhere near
        /// the twenty minutes that would have made this wave a pacing problem. ⛔ <b>Deck 1 is a
        /// different story entirely and it is an OPEN DEFECT — see
        /// <c>docs/HANDOVER.md</c> "W4b-DEAD-DECK".</b> Not asserted here — this file's fixture is the
        /// grid ship, and a wreck assertion belongs beside the wreck's own authoring tests.</para>
        ///
        /// <para><b>⚠️ THE PLAN'S ≈208 s ARITHMETIC IS RIGHT, AND AN EARLIER VERSION OF THIS COMMENT
        /// CALLED IT "THE WRONG MODEL". THAT RETRACTION IS THE IMPORTANT PART OF THIS PARAGRAPH.</b>
        /// The claim was that the plan assumes a vent INSIDE the compartment and that no shipped ship
        /// has one. <b>The wreck has one:</b> <c>vent_ls</c> (<c>AuthoredShips.cs</c>, the
        /// <c>lifesupport</c> block — that slot was the unnamed hall <c>hall_d0_s3</c> until M1-1
        /// named it) is a <see cref="DeviceKind.AirVent"/> authored INSIDE that
        /// compartment, closed and at <c>Condition 0.15</c>, and its own authoring comment says the
        /// player's first act there is to open it. Driven — repaired, powered, opened, <b>with the
        /// compartment's door SHUT</b> — that 60-tile room reaches 90 kPa at tick 1 846 and 101 kPa at
        /// tick <b>2 072 = 207.2 s</b>. The plan's figure is accurate to under half a percent, and the
        /// vent verb is exactly the right affordance for it. I reached the opposite conclusion by
        /// checking which ship I had a fixture for instead of grepping the authoring for
        /// <c>AirVent</c>.</para>
        ///
        /// <para>What survives of that paragraph, because it is separately true: no player verb BUILDS
        /// a vent — <c>PlaceDeviceCommand.IsPlaceableFurniture</c> excludes
        /// <see cref="DeviceKind.AirVent"/> — so an in-compartment vent is something a ship is AUTHORED
        /// with, never something the player adds. And the number measured by the test below is a
        /// DIFFERENT mechanism with its own arithmetic: no vent in the room, so the gas arrives through
        /// the doorway by <c>AtmosphereSystem.FlowAcrossDoor</c> at <c>flow_coefficient</c> (0.5)
        /// mol/(kPa·s) × Δp — ~50 mol/s at a 101 kPa head, decaying as the pressures converge. Both
        /// routes exist, the plan modelled the first, and this test measures the second.</para>
        ///
        /// The band below is deliberately wide (~0.5×–2.6× the measurement) — this is a PACING check,
        /// not a golden. NON-VACUITY / negative control: the paired test below leaves the door shut and
        /// requires the compartment to stay at zero.
        /// </summary>
        [Test]
        public void OpeningTheDoor_FillsAnAllocatedHall_OverTime_AndTheFillTimeIsMeasured()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = ProbeOf(hall);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            sim.Tick();
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "allocation alone must leave the compartment in vacuum");

            var door = DoorOf(sim, hall);
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: true));
            sim.Tick();
            Assert.That(DoorOf(sim, hall).IsOpen, Is.True, "the door refused to open — nothing below is measurable");

            const int Cap = 20000;   // ~33 sim-minutes; the measured 90 kPa crossing is 1 543
            long half = -1, full = -1;
            for (int t = 1; t <= Cap && full < 0; t++)
            {
                sim.Tick();
                double kpa = sim.Rooms.RoomAt(sim.World, probe).PressureKPa;
                if (half < 0 && kpa >= 50.0) half = t;
                if (kpa >= 90.0) full = t;
            }

            TestContext.WriteLine(FormattableString.Invariant(
                $"FILL TIME, grid deck {hall.Deck} slot {hall.Index} (60 tiles) via the spine vent through one open door: 50 kPa at tick {half} ({half / 10.0:F1} s), 90 kPa at tick {full} ({full / 10.0:F1} s)"));

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
        /// THE NEGATIVE CONTROL for the test above, and the honest statement of what W4b costs: with the
        /// door left SHUT, the allocated compartment never fills — for the whole 20 000-tick budget the
        /// fill test is allowed. Without this, "it filled" could be something the ship does anyway.
        /// MUTATION: restore <c>RoomState.Pressurize</c> to the command ⇒ RED immediately.
        /// </summary>
        [Test]
        public void AnAllocatedHallWithItsDoorShut_NeverFills()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = ProbeOf(hall);

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            for (int t = 0; t < 20000; t++) sim.Tick();

            Assert.That(DoorOf(sim, hall).IsOpen, Is.False, "nothing may open the door on its own");
            Assert.That(sim.Rooms.RoomAt(sim.World, probe).TotalMoles, Is.EqualTo(0.0),
                "air appeared in a sealed allocated compartment");
        }

        // ═══════════════════════════════ 4. the OTHER half: allocation must be VISIBLE on the wire

        /// <summary>
        /// <b>⭐ M1-L INVERTED THE FIRST HALF OF THIS TEST, AND THAT INVERSION IS THE PACKAGE.</b>
        ///
        /// <para>It used to open by asserting that an UN-ALLOCATED hall reads
        /// <c>occupied:false</c> with a blank name and no type — the "before" of an allocation
        /// gesture. That is now the DEFECT: a compartment the ship carved (floor, perimeter walls, a
        /// door onto the spine) reported itself as nothing at all, so the Overview drew a blank
        /// ＋ADD ROOM box on it and the Room Zoom could not open it. The owner's ruling
        /// (2026-07-29): <i>"we do not need 'add room' that makes no sense on a ship where rooms are
        /// already existing."</i> So the first half now asserts the OPPOSITE, on the same slot, on
        /// the same ship, through the same live session.</para>
        ///
        /// <para><b>What the second half still pins, unchanged:</b> a re-type is VISIBLE on the
        /// <c>decks</c> channel. <see cref="AddRoomCommand"/> is dormant (nothing in the client or
        /// the host constructs one any more — see its header), but it is not DELETED, so it is not
        /// left unguarded either: driving it directly must still move the slot's live type. That is
        /// also the control which proves this test can see a change at all — without it, "occupied
        /// before AND after" could be a channel that is stuck rather than one that is correct.</para>
        ///
        /// <para>MUTATION: restore <c>if (a.Type == RoomType.None) continue;</c> in
        /// <c>GameSession.ResolveSlot</c> ⇒ RED on the first half.</para>
        /// </summary>
        [Test]
        public void AnUnallocatedHall_ReadsOCCUPIED_AndCarriesItsOwnAnchor()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Grid), ship: ShipChoice.Grid);
            var gs = new GameSession(host, _ => { });   // NOT started ⇒ no sim thread
            var hall = FirstEmptyHall(AuthoredShips.PeriluneGrid());
            for (int i = 0; i < 20; i++) host.Sim.Tick();

            // CONTROL: the compartment really is airless. Occupancy is GEOMETRY now — not gas, and
            // not type — so this is the state the retired gas gate could never report as occupied.
            Assert.That(host.Sim.Rooms.RoomAt(host.Sim.World, ProbeOf(hall)).TotalMoles, Is.EqualTo(0.0),
                "this hall has air, so the leg below would pass under the retired gas gate too");

            var before = SlotTuple(gs, hall.Deck, hall.Index);
            Assert.That(before.Occupied, Is.True,
                "an UN-ALLOCATED but CARVED compartment must read OCCUPIED — otherwise the Overview " +
                "draws a blank box on it and the Room Zoom cannot open it (M1-L)");
            Assert.That(before.Anchor, Is.EqualTo(hall.Anchor),
                "the compartment carries no live anchor name — a blank one never resolves through " +
                "roomTileRect, so the player cannot enter it whatever else is true");
            Assert.That(before.RoomType, Is.EqualTo(0),
                "an un-allocated compartment must still have NO TYPE — M1-L makes it visible and " +
                "enterable, it does not invent a purpose for it");

            // The dormant command still moves the live type, which is also this test's non-vacuity:
            // it proves the decks channel is being re-read rather than cached from the first call.
            host.Sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            for (int i = 0; i < 5; i++) host.Sim.Tick();

            var after = SlotTuple(gs, hall.Deck, hall.Index);
            Assert.That(after.Occupied, Is.True);
            Assert.That(after.Anchor, Is.EqualTo(hall.Anchor));
            Assert.That(after.RoomType, Is.EqualTo((int)RoomType.Medbay),
                "the slot's live type did not change — this test cannot see a change at all, so its " +
                "'occupied before and after' assertions are measuring a stuck channel");
        }

        /// <summary>Render the session and pull ONE slot's tuple out of the cached <c>decks</c> payload —
        /// the Snapshot a reconnecting client is caught up from. Parsed POSITIONALLY: the tuple
        /// [slotIndex, x, y, w, h, anchorName, roomType, occupied, active] is the contract, and a parser
        /// that named its fields would not notice a reorder.</summary>
        private static (int RoomType, bool Occupied, string Anchor) SlotTuple(GameSession gs, int deck, int slotIndex)
        {
            gs.RenderForTest();
            string json = null;
            foreach (var s in gs.Snapshot())
                if (s.Contains("\"type\":\"decks\"")) json = s;
            Assert.That(json, Is.Not.Null, "the decks channel must be cached for Snapshot catch-up");

            int at = json.IndexOf("{\"deck\":" + deck.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",", StringComparison.Ordinal);
            Assert.That(at, Is.GreaterThanOrEqualTo(0), $"no deck {deck} in: {json}");
            string body = json.Substring(at);
            int end = body.IndexOf("]}", StringComparison.Ordinal);
            body = body.Substring(0, end);

            foreach (var part in body.Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Split(']')[0].Split(',');
                if (f.Length != 9) continue;
                if (int.Parse(f[0], System.Globalization.CultureInfo.InvariantCulture) != slotIndex) continue;
                return (int.Parse(f[6], System.Globalization.CultureInfo.InvariantCulture),
                        f[7] == "true",
                        f[5].Trim('"'));
            }
            Assert.Fail($"no slot {slotIndex} on deck {deck} in: {json}");
            return default;
        }

        // ═══════════════════════════════════════════════ 5. the pin argument, mechanised (not a grep)

        /// <summary>
        /// <b>THE "NO PINNED RUN DRIVES AddRoomCommand" CLAIM, AS AN INCLUSION TEST.</b> The plan says
        /// to verify it and not assume it. A source grep proves nothing (CLAUDE.md trap 1), so instead:
        /// every construction of an <see cref="AddRoomCommand"/> anywhere in the shipped tree lives
        /// behind PLAYER INTENT — <c>GameSession.HandleAddRoom</c>, reached only from a
        /// <c>CmdKind.AddRoom</c> web command — and the three pinned runs
        /// (<c>hosts/scenario --days 3 --seed 42</c>, the tick-3000 golden, the slice tick-3000 golden)
        /// have no such input. This test drives the two GOLDEN ships for their pinned windows with a
        /// tripwire on the command's only observable effect (a <see cref="RoomAnchor"/> whose Type
        /// changed) and requires the anchor table to be byte-identical at the end.
        ///
        /// <para>NON-VACUITY, as an INCLUSION test (CLAUDE.md, the fourth trap shape): the same helper
        /// is run once more with ONE <see cref="AddRoomCommand"/> planted, and the tripwire must FIRE.
        /// Without that, a tripwire that can never fire would report "no pinned run drives it" forever.
        /// The scenario pin itself is a separate binary and is measured by <c>ci.sh</c>, not here — and
        /// the DECISIVE version of this check is the mutation the package ran and reported: an
        /// unconditional <c>throw</c> at the top of <c>Execute</c>, with all three pinned runs still
        /// passing.</para>
        /// </summary>
        [Test]
        public void NoPinnedRunDrivesThisCommand_Probe()
        {
            // The two golden ships, built EXACTLY as their golden tests build them, over their pinned
            // windows. A re-type inside the window is the command's only observable effect.
            Assert.That(AnchorSignatureAfter(ShipChoice.Perilune, 3000),
                Is.EqualTo(AnchorSignatureAfter(ShipChoice.Perilune, 0)),
                "the tick-3000 golden ship re-typed a room inside its pinned window");
            Assert.That(AnchorSignatureAfter(ShipChoice.Slice, 3000),
                Is.EqualTo(AnchorSignatureAfter(ShipChoice.Slice, 0)),
                "the slice tick-3000 golden ship re-typed a room inside its pinned window");

            // INCLUSION: plant the very thing being claimed absent and require the tripwire to catch it.
            var hall = FirstEmptyHall(AuthoredShips.PeriluneGrid());
            string before = AnchorSignatureAfter(ShipChoice.Grid, 0);
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Grid), ship: ShipChoice.Grid);
            for (int i = 0; i < 20; i++) host.Sim.Tick();
            host.Sim.EnqueueCommand(CommandFor(hall, RoomType.Medbay));
            for (int i = 0; i < 20; i++) host.Sim.Tick();
            Assert.That(Signature(host.Sim), Is.Not.EqualTo(before),
                "the tripwire cannot see an AddRoomCommand at all — the two assertions above are vacuous");
        }

        private static string AnchorSignatureAfter(ShipChoice ship, int ticks)
        {
            var host = ship == ShipChoice.Slice
                ? SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice)
                : ship == ShipChoice.Perilune
                    ? SimHost.Build(SimHost.DefaultSeed)
                    : SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
            for (int i = 0; i < ticks; i++) host.Sim.Tick();
            return Signature(host.Sim);
        }

        private static string Signature(Simulation sim)
        {
            var sb = new System.Text.StringBuilder();
            foreach (var a in sim.Rooms.Anchors)
                sb.Append(a.Name).Append('=').Append((int)a.Type).Append(';');
            return sb.ToString();
        }
    }
}
