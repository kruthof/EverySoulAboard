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
    ///
    /// E0-5 WP-3: PLACEMENT NOW COSTS <c>build.device_place_cost</c> PARTS, so every test that
    /// expects a placement to succeed must first fund the ship — see <see cref="Fund"/>. That is
    /// not incidental bookkeeping: before the charge existed, place → strip → repeat minted Parts
    /// out of nothing into the ship's one never-ending sink. The economics of the round trip are
    /// owned by <c>DeconstructSystemTests</c>; this file only proves that the price does not break
    /// placement's determinism, its whitelist or its tile rules.
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
        private static readonly Int3 PurseSite = new Int3(1, 1, 0);

        private static Simulation NewSim(ulong seed)
        {
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            return new Simulation(AsciiWorld.Build(RoomMap), seed, systems);
        }

        /// <summary>Drop enough loose Parts on one tile to pay for <paramref name="placements"/>
        /// placements at the shipped price. Deterministic and hashed like any other ground stack —
        /// no reservation, no carrier — so twins funded identically stay identical.</summary>
        private static void Fund(Simulation sim, int placements)
        {
            sim.AddItem(ItemKind.Parts, SimDefs.Default.Build.DevicePlaceCost * placements, PurseSite);
        }

        [Test]
        public void PlaceThenRemove_TwinRuns_StayHashIdentical()
        {
            Simulation Build(ulong seed)
            {
                var sim = NewSim(seed);
                sim.AddCitizen("Twin", new Int3(1, 1, 0));
                Fund(sim, 1); // placement costs Parts (E0-5 WP-3); an unfunded twin places nothing
                // Place a bed, run a bit, then remove it — the whole cycle over the command inbox.
                // ⭐ PLACE **AND BUILD**: since 2026-08-05 a placement lays a blueprint, and the
                // RemoveDeviceCommand at tick 50 below removes a DEVICE. Left as a bare place this
                // stayed GREEN — twins agree about a no-op just as readily as about a removal — so
                // the cycle this test names would have quietly stopped happening.
                sim.PlaceAndBuild(DeviceKind.Bed, FloorSite);
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
            Fund(sim, 1);
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "tile starts empty");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.Walkable) != 0, Is.True, "tile starts walkable");

            // ⭐⭐ THE PRESS LAYS A BLUEPRINT — asserted here rather than skipped past, because this
            // is the file that owns the placement verb and the intermediate state is now part of it.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Desk, FloorSite));
            sim.Tick();
            Assert.That(sim.Build, Is.Not.Null, "this bench has no BuildSystem");
            Assert.That(sim.Build.TryGet(FloorSite, out var site), Is.True, "the press laid no blueprint");
            Assert.That(site.Kind, Is.EqualTo(BuildKind.Device));
            Assert.That((byte)DeviceKind.Desk, Is.EqualTo(site.Device), "the blueprint is for the wrong piece");
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False,
                "the piece exists before a builder has touched it — placement is supposed to be a "
                + "blueprint now (the owner's \"it should stay as a ghost until the pawn assembles it\")");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.HasDevice) == 0, Is.True,
                "a mere blueprint set HasDevice, which would make the tile refuse everything");

            // …and the builder finishes it.
            Assert.That(sim.Build.Complete(sim, FloorSite, 0), Is.True, "the ready site would not complete");
            Assert.That(sim.TryGetDeviceAt(FloorSite, out var placed), Is.True, "furniture is placed");
            Assert.That(placed.Kind, Is.EqualTo(DeviceKind.Desk));
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.HasDevice) != 0, Is.True, "HasDevice flag set");

            sim.EnqueueCommand(new RemoveDeviceCommand(FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "furniture is removed");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.HasDevice) == 0, Is.True, "HasDevice flag cleared");
            Assert.That((sim.World.GetFlags(FloorSite) & TileFlags.Walkable) != 0, Is.True, "tile walkable again");
        }

        /// <summary>
        /// The three rejections, each funded so that MONEY is never the reason — the ship is given
        /// TWO placements' worth throughout, and only one legal placement is ever made. That also
        /// pins E0-5 WP-3's charged-LAST ordering: an illegal kind, an illegal tile and an occupied
        /// tile must all cost nothing, so exactly one placement's price is missing at the end.
        ///
        /// MUTATION: move the <c>TryPay</c> call in <c>PlaceDeviceCommand.Execute</c> above the
        /// <c>IsPlaceableFurniture</c> check → the Door and wall-tile attempts each spend the price
        /// and the final purse assertion fails (0 Parts left, not one placement's worth).
        /// </summary>
        [Test]
        public void Place_RejectsNonFurnitureKinds_AndBadTiles_AndNoRejectionEverSpends()
        {
            var sim = NewSim(3);
            int price = SimDefs.Default.Build.DevicePlaceCost;
            Fund(sim, 2); // twice what the one legal placement below needs

            // Non-furniture kind (a door) is refused — the whitelist blocks it.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Door, FloorSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(FloorSite, out _), Is.False, "a Door is not placeable furniture");

            // A wall tile is not a valid floor target.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, WallSite));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(WallSite, out _), Is.False, "a wall tile rejects placement");
            Assert.That(PlaceDeviceCommand.Affordable(sim), Is.EqualTo(price * 2),
                "neither illegal request spent a thing — the cost is charged LAST");

            // One-per-tile: pressing twice leaves exactly one piece, and pays exactly once.
            // ⚠️ THE SECOND PRESS IS REFUSED BY A DIFFERENT CLAUSE THAN IT USED TO BE, and the
            // distinction is real rather than pedantic: it used to hit the OCCUPIED check (a device
            // was standing there), and now it hits ALREADY-QUEUED (a blueprint is). Both are free,
            // which is what this leg is actually about, and `PlaceRefusalTests` drives the two
            // reasons apart by name.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Chair, FloorSite));
            sim.Tick();
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Locker, FloorSite));
            sim.Tick();
            Assert.That(sim.Build.TryGet(FloorSite, out var one), Is.True, "no blueprint on the tile at all");
            Assert.That((byte)DeviceKind.Chair, Is.EqualTo(one.Device),
                "the second press overwrote the first — a tile already queued must be a no-op");
            Assert.That(PlaceDeviceCommand.Affordable(sim), Is.EqualTo(price),
                "…and the already-queued refusal was free: exactly ONE placement was ever paid for");
            // Finish it, so the tile ends this test in the state the name promises.
            Assert.That(sim.Build.Complete(sim, FloorSite, 0), Is.True);
            Assert.That(sim.TryGetDeviceAt(FloorSite, out var only), Is.True);
            Assert.That(only.Kind, Is.EqualTo(DeviceKind.Chair));
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
