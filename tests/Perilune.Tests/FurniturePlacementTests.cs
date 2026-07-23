using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Runtime furniture placement/removal (Room Zoom decorate palette): PlaceDeviceCommand +
    /// RemoveDeviceCommand ride the existing hashed Device state (Kind/Pos/Name), add no new saved
    /// field, and are deterministic. These pin twin-run hash identity across a place→remove cycle,
    /// the whitelist (only furniture kinds place/remove), tile validation (floor only, one per
    /// tile), and the round-trip back to an empty, walkable tile.
    /// </summary>
    public class FurniturePlacementTests
    {
        // A small enclosed room; interior '.' tiles are open floor.
        private static readonly string[] RoomMap =
        {
            "######",
            "#....#",
            "#....#",
            "#....#",
            "######",
        };

        private static readonly Int3 FloorSite = new Int3(2, 2, 0);
        private static readonly Int3 WallSite = new Int3(0, 0, 0);

        private static Simulation NewSim(ulong seed)
        {
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            return new Simulation(AsciiWorld.Build(RoomMap), seed, systems);
        }

        [Test]
        public void PlaceThenRemove_TwinRuns_StayHashIdentical()
        {
            Simulation Build(ulong seed)
            {
                var sim = NewSim(seed);
                sim.AddCitizen("Twin", new Int3(1, 1, 0));
                // Place a bed, run a bit, then remove it — the whole cycle over the command inbox.
                sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, FloorSite));
                return sim;
            }

            var x = Build(101);
            var y = Build(101);
            Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), "twins start identical");

            for (int t = 1; t <= 400; t++)
            {
                if (t == 50) { x.EnqueueCommand(new RemoveDeviceCommand(FloorSite)); y.EnqueueCommand(new RemoveDeviceCommand(FloorSite)); }
                x.Tick(); y.Tick();
                if (t % 100 == 0)
                    Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), $"twins diverged at tick {t}");
            }
            Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), "twins end identical after place→remove");
        }

        [Test]
        public void Place_AddsFurniture_Remove_ReturnsTileToEmptyWalkable()
        {
            var sim = NewSim(7);
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "tile starts empty");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.Walkable) != 0, Is.True, "tile starts walkable");

            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Desk, FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out var placed), Is.True, "furniture is placed");
            Assert.That(placed.Kind, Is.EqualTo(DeviceKind.Desk));
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.HasDevice) != 0, Is.True, "HasDevice flag set");

            sim.EnqueueCommand(new RemoveDeviceCommand(FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "furniture is removed");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.HasDevice) == 0, Is.True, "HasDevice flag cleared");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.Walkable) != 0, Is.True, "tile walkable again");
        }

        [Test]
        public void Place_RejectsNonFurnitureKinds_AndBadTiles()
        {
            var sim = NewSim(3);

            // Non-furniture kind (a door) is refused — the whitelist blocks it.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Door, FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "a Door is not placeable furniture");

            // A wall tile is not a valid floor target.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, WallSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(WallSite, out _), Is.False, "a wall tile rejects placement");

            // One-per-tile: placing twice leaves exactly one device.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Chair, FloorSite));
            sim.Tick();
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Locker, FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out var only), Is.True);
            Assert.That(only.Kind, Is.EqualTo(DeviceKind.Chair), "second placement on an occupied tile is a no-op");
        }

        [Test]
        public void Remove_RefusesNonFurniture_Devices()
        {
            var sim = NewSim(9);
            // Author a door directly (not via the command), then try to remove it via the furniture path.
            var door = sim.AddDevice(DeviceKind.Door, FloorSite, "door_test");
            sim.EnqueueCommand(new RemoveDeviceCommand(FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out var still), Is.True, "the door survives");
            Assert.That(still.Id, Is.EqualTo(door.Id), "RemoveDeviceCommand never deletes a non-furniture device");
        }

        [Test]
        public void Whitelist_ExactlyTheFurnitureSet()
        {
            // The nine placeable furniture kinds.
            foreach (var kind in new[]
            {
                DeviceKind.Bed, DeviceKind.Desk, DeviceKind.Chair, DeviceKind.Locker,
                DeviceKind.PlantPot, DeviceKind.Light, DeviceKind.GrowBed, DeviceKind.MedBed, DeviceKind.Table,
            })
                Assert.That(PlaceDeviceCommand.IsPlaceableFurniture(kind), Is.True, $"{kind} is placeable furniture");

            // A representative spread of everything else is refused.
            foreach (var kind in new[]
            {
                DeviceKind.Door, DeviceKind.AirVent, DeviceKind.Scrubber, DeviceKind.SolarWing,
                DeviceKind.Battery, DeviceKind.Conduit, DeviceKind.Fabricator, DeviceKind.Radiator,
                DeviceKind.Telescope, DeviceKind.WaterTank, DeviceKind.MedCabinet, DeviceKind.Terminal,
            })
                Assert.That(PlaceDeviceCommand.IsPlaceableFurniture(kind), Is.False, $"{kind} is NOT placeable");
        }
    }
}
