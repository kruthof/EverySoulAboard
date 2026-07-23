using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// AddRoomCommand (the Overview ＋ADD ROOM affordance): commissioning an EMPTY HALL on the grid
    /// ship into a live, typed, pressurised room. The command must LOWER ENTIRELY to existing hashed
    /// operations (RoomAnchor.Type + Device.IsOpen/IsLocked + room gas moles) and stay deterministic —
    /// so a twin-run that both commission the same hall must fold to identical StateHashes, and the
    /// slot must genuinely become a non-vacuum room carrying the requested anchor/type.
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

        private static SlotDescriptor FirstEmptyHall(ShipPlan plan)
        {
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Type == RoomType.None) return plan.SlotGrid[i];
            Assert.Fail("grid ship has no empty hall to commission");
            return default;
        }

        [Test]
        public void CommissionEmptyHall_IsDeterministic_AndMakesTheSlotALiveRoom()
        {
            var plan = AuthoredShips.PeriluneGrid();
            var hall = FirstEmptyHall(plan);
            var probe = new Int3(hall.X + hall.W / 2, hall.Y + hall.H / 2, hall.Deck);
            const RoomType type = RoomType.Medbay;

            var a = ShipPlanBuilder.Build(plan, Stack());
            var b = ShipPlanBuilder.Build(plan, Stack());

            // Warm up so the RoomId plane + atmosphere settle identically on both twins.
            for (int i = 0; i < 20; i++) { a.Tick(); b.Tick(); }

            // BEFORE: the target is a sealed, AIRLESS compartment — a distinct (non-vacuum-sink) room
            // with zero moles. This is exactly the state AddRoomCommand requires (and the check its
            // validation makes), so proving it here also proves the command's precondition is real.
            var hallRoomBefore = a.Rooms.RoomAt(a.World, probe);
            Assert.That(ReferenceEquals(hallRoomBefore, a.Rooms.Rooms[0]), Is.False,
                "an empty hall must be its own sealed room, not the vacuum sink");
            Assert.That(hallRoomBefore.TotalMoles, Is.EqualTo(0.0),
                "an un-commissioned hall must be airless");

            // Commission the SAME hall on both twins, then advance both.
            a.EnqueueCommand(CommandFor(hall, type));
            b.EnqueueCommand(CommandFor(hall, type));
            for (int i = 0; i < 200; i++) { a.Tick(); b.Tick(); }

            // Determinism: the two runs fold identically (no new/unhashed state introduced).
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()),
                "twin runs that both commission the same hall must produce identical StateHashes");

            // The slot is now a LIVE room: pressurised (non-vacuum) and carrying the requested type.
            var hallRoomAfter = a.Rooms.RoomAt(a.World, probe);
            Assert.That(ReferenceEquals(hallRoomAfter, a.Rooms.Rooms[0]), Is.False,
                "the commissioned hall must not resolve to vacuum");
            Assert.That(hallRoomAfter.TotalMoles, Is.GreaterThan(0.0),
                "the commissioned hall must hold breathable air");

            var anchor = a.Rooms.Anchors.Find(x => x.Name == hall.Anchor);
            Assert.That(anchor.Name, Is.EqualTo(hall.Anchor), "the hall's anchor must survive commissioning");
            Assert.That(anchor.Type, Is.EqualTo(type), "the anchor must carry the commissioned room type");
            Assert.That(a.Rooms.RoomIdAt(a.World, anchor.Probe),
                Is.EqualTo(a.Rooms.RoomIdAt(a.World, probe)),
                "the anchor must probe the commissioned room");
        }

        [Test]
        public void Commission_IsRejected_OnAnAlreadyLiveRoom()
        {
            var plan = AuthoredShips.PeriluneGrid();
            // A furnished, pressurised room on deck 0 (its slot is Type != None).
            SlotDescriptor furnished = default;
            bool found = false;
            for (int i = 0; i < plan.SlotGrid.Count; i++)
                if (plan.SlotGrid[i].Deck == 0 && plan.SlotGrid[i].Type != RoomType.None)
                { furnished = plan.SlotGrid[i]; found = true; break; }
            Assert.That(found, Is.True, "deck 0 must have a furnished room");

            var sim = ShipPlanBuilder.Build(plan, Stack());
            for (int i = 0; i < 20; i++) sim.Tick();

            var probe = new Int3(furnished.X + furnished.W / 2, furnished.Y + furnished.H / 2, furnished.Deck);
            var anchor = sim.Rooms.Anchors.Find(x => x.Name == furnished.Anchor);
            var typeBefore = anchor.Type;

            // Try to re-commission it as something else — the airless-precondition must reject it.
            sim.EnqueueCommand(new AddRoomCommand(furnished.Deck, furnished.Index, RoomType.Storage, probe, furnished.Anchor));
            sim.Tick();

            var anchorAfter = sim.Rooms.Anchors.Find(x => x.Name == furnished.Anchor);
            Assert.That(anchorAfter.Type, Is.EqualTo(typeBefore),
                "commissioning a live room must be a no-op — its type must not change");
        }
    }
}
