using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// S2 (wall drag-build + authoritative materials): a build designation carries a material
    /// byte that is recorded via <see cref="World.SetMaterial"/> on completion, and the new
    /// <see cref="BuildKind.Floor"/> re-materials an existing floor tile through the same
    /// haul+build job flow (no wall created). Covers material capture on wall/floor completion,
    /// Floor designation legality, the v1→v2 BULD-chapter round-trip (Material folds last), the
    /// checksum sensitivity to Material, and an end-to-end floor build that consumes Regolith.
    /// </summary>
    public class BuildMaterialTests
    {
        private static readonly string[] BreachMap =
        {
            "########",
            "#......#",
            "#......#",
            "#####.##",
            "##### ##",
            "########",
        };

        private static readonly Int3 StubSite = new Int3(5, 3, 0);

        private static ISimSystem[] AugmentedStack(out BuildSystem build)
        {
            var baseStack = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            build = null;
            foreach (var s in baseStack)
                if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "BuildSystem must be registered in SystemStack.CreateDefault");
            return baseStack;
        }

        private static Simulation NewSim(string[] map, ulong seed, out BuildSystem build)
        {
            var systems = AugmentedStack(out build);
            return new Simulation(AsciiWorld.Build(map), seed, systems);
        }

        private static void AddVentedPower(Simulation sim)
        {
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            sim.AddDevice(DeviceKind.AirVent, new Int3(3, 1, 0), "vent").IsOpen = true;
        }

        // ------------------------------------------------------- material capture

        [Test]
        public void WallBuild_RecordsMaterial_AndTileIsWall()
        {
            var sim = NewSim(BreachMap, 42, out var build);
            AddVentedPower(sim);
            sim.AddCitizen("Ito", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, sim.Defs.Build.WallMaterial, new Int3(4, 2, 0));

            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall, material: 3), Is.True);

            for (int t = 0; t < 2000 && build.Pending.Count > 0; t++) sim.Tick();

            Assert.That(build.Pending, Is.Empty, "the wall must finish");
            Assert.That(sim.World.GetWall(StubSite), Is.EqualTo(TileDefs.Wall), "tile is a wall");
            Assert.That(sim.World.GetMaterial(StubSite), Is.EqualTo((byte)3), "wall recorded its material byte");
        }

        [Test]
        public void FloorBuild_RecordsMaterial_AndTileStaysFloor()
        {
            var sim = NewSim(BreachMap, 7, out var build);
            AddVentedPower(sim);
            sim.AddCitizen("Vega", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0)); // FloorMaterialCost == 1

            var floorPos = new Int3(4, 1, 0);
            ushort floorBefore = sim.World.GetFloor(floorPos);
            Assert.That(build.Designate(sim, floorPos, BuildKind.Floor, material: 2), Is.True);

            var completions = new List<ConstructionCompletedEvent>();
            for (int t = 0; t < 2000 && build.Pending.Count > 0; t++)
            {
                sim.Tick();
                completions.AddRange(sim.Events.Read<ConstructionCompletedEvent>().ToArray());
            }

            Assert.That(build.Pending, Is.Empty, "the floor must finish");
            Assert.That(sim.World.GetMaterial(floorPos), Is.EqualTo((byte)2), "floor recorded its material byte");
            Assert.That(sim.World.GetWall(floorPos), Is.EqualTo((ushort)0), "no wall was created");
            Assert.That(sim.World.GetFloor(floorPos), Is.EqualTo(floorBefore), "the floor tile is unchanged");
            Assert.That(sim.TryGetDeviceAt(floorPos, out _), Is.False, "no device spawned");
            Assert.That(completions, Has.Count.EqualTo(1), "exactly one completion event");
            Assert.That(completions[0].BuildKind, Is.EqualTo((byte)BuildKind.Floor));
        }

        // ------------------------------------------------------- floor legality

        [Test]
        public void CanDesignateFloor_RejectsVoidWalledAndSameMaterial_AcceptsNewMaterial()
        {
            var sim = NewSim(BreachMap, 1, out var build);

            // Void tile (the breach) — nothing to floor.
            Assert.That(build.CanDesignate(sim, new Int3(5, 4, 0), BuildKind.Floor, material: 2), Is.False, "void");
            // Walled tile.
            Assert.That(build.CanDesignate(sim, new Int3(0, 0, 0), BuildKind.Floor, material: 2), Is.False, "walled");

            var floorPos = new Int3(4, 1, 0);
            // A normal floor with a new (non-default) material is accepted.
            Assert.That(build.CanDesignate(sim, floorPos, BuildKind.Floor, material: 2), Is.True, "new material");
            // Re-flooring the SAME material (default 0 on an untouched tile) is a no-op.
            Assert.That(sim.World.GetMaterial(floorPos), Is.EqualTo((byte)0));
            Assert.That(build.CanDesignate(sim, floorPos, BuildKind.Floor, material: 0), Is.False, "same material no-op");

            // After the tile already carries material 5, re-flooring 5 is rejected but 6 is accepted.
            sim.World.SetMaterial(floorPos, 5);
            Assert.That(build.CanDesignate(sim, floorPos, BuildKind.Floor, material: 5), Is.False, "re-floor same");
            Assert.That(build.CanDesignate(sim, floorPos, BuildKind.Floor, material: 6), Is.True, "re-floor different");
        }

        [Test]
        public void FloorDesignate_AllowedUnderStandingCitizenAndDevice()
        {
            // A floor re-material is an inert identity write, so unlike a wall/door it may be
            // designated under a standing citizen or a device.
            var sim = NewSim(BreachMap, 2, out var build);
            var occupied = new Int3(2, 2, 0);
            sim.AddCitizen("Occupant", occupied);
            Assert.That(build.CanDesignate(sim, occupied, BuildKind.Floor, material: 1), Is.True,
                "floor may go under a standing citizen");
            // A wall is still blocked there.
            Assert.That(build.CanDesignate(sim, occupied, BuildKind.Wall), Is.False,
                "wall is still blocked under a citizen");

            var devPos = new Int3(3, 2, 0);
            sim.AddDevice(DeviceKind.AirVent, devPos, "vent2");
            Assert.That(build.CanDesignate(sim, devPos, BuildKind.Floor, material: 1), Is.True,
                "floor may go under a device");
            Assert.That(build.CanDesignate(sim, devPos, BuildKind.Wall), Is.False,
                "wall is still blocked under a device");
        }

        // ---------------------------------------------------------- costs/ticks

        [Test]
        public void FloorCostsAndTicks_AreTheV1Literals()
        {
            var sim = NewSim(BreachMap, 3, out var build);
            var floorPos = new Int3(4, 1, 0);
            Assert.That(build.Designate(sim, floorPos, BuildKind.Floor, material: 2), Is.True);
            Assert.That(build.TryGet(floorPos, out var b), Is.True);
            Assert.That(b.Required, Is.EqualTo(1), "FloorMaterialCost v1 literal");
            Assert.That(b.WorkTicks, Is.EqualTo(20), "FloorConstructTicks v1 literal");
            Assert.That(b.Material, Is.EqualTo((byte)2));
        }

        // ---------------------------------------------------------- save/hash

        [Test]
        public void PendingMaterial_RoundTripsV2_AndChecksumIsMaterialSensitive()
        {
            // Two systems differing ONLY in a pending entry's Material must hash differently.
            var simA = NewSim(BreachMap, 5, out var buildA);
            var simB = NewSim(BreachMap, 5, out var buildB);
            Assert.That(buildA.Designate(simA, StubSite, BuildKind.Wall, material: 0), Is.True);
            Assert.That(buildB.Designate(simB, StubSite, BuildKind.Wall, material: 7), Is.True);
            Assert.That(buildA.StateChecksum(), Is.Not.EqualTo(buildB.StateChecksum()),
                "a differing Material must move the BULD checksum");

            // v2 CaptureState → RestoreState preserves a non-zero Material.
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                buildB.CaptureState(w);
            ms.Position = 0;

            var restored = new BuildSystem();
            using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                restored.RestoreState(r, buildB.StateVersion);
            Assert.That(restored.TryGet(StubSite, out var rb), Is.True);
            Assert.That(rb.Material, Is.EqualTo((byte)7), "Material survives the v2 round-trip");
            Assert.That(restored.StateChecksum(), Is.EqualTo(buildB.StateChecksum()),
                "the round-tripped checksum is bit-identical");
        }

        [Test]
        public void SimulatedV1Restore_YieldsMaterialZero()
        {
            // Hand-craft a pre-v2 BULD payload (no trailing Material byte) and restore it with
            // version 1: Material must default to 0 (back-compat, matches the S1 pre-v2 rule).
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);              // count
                w.Write(StubSite.X);
                w.Write(StubSite.Y);
                w.Write(StubSite.Z);
                w.Write((byte)BuildKind.Wall);
                w.Write(2);              // Required
                w.Write(1);              // Delivered
                w.Write(60);             // WorkTicks
                // no Material byte — this is the v1 layout
            }
            ms.Position = 0;

            var restored = new BuildSystem();
            using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                restored.RestoreState(r, 1);

            Assert.That(restored.TryGet(StubSite, out var b), Is.True);
            Assert.That(b.Material, Is.EqualTo((byte)0), "a v1 restore leaves Material at the default 0");
            Assert.That(b.Delivered, Is.EqualTo(1));
            Assert.That(b.WorkTicks, Is.EqualTo(60));
        }

        // ------------------------------------------------------- end-to-end flow

        [Test]
        public void FloorBuild_ConsumesRegolith_EndToEndThroughJobSource()
        {
            var sim = NewSim(BreachMap, 21, out var build);
            AddVentedPower(sim);
            sim.AddCitizen("Halden", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0)); // exactly a floor's worth

            var floorPos = new Int3(4, 1, 0);
            Assert.That(build.Designate(sim, floorPos, BuildKind.Floor, material: 4), Is.True);

            for (int t = 0; t < 2000 && build.Pending.Count > 0; t++) sim.Tick();

            Assert.That(build.Pending, Is.Empty, "the floor build finished through the haul+build job flow");
            Assert.That(sim.World.GetMaterial(floorPos), Is.EqualTo((byte)4));

            // The single Regolith unit was consumed into the build — no free stack remains.
            int freeRegolith = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Kind == ItemKind.Regolith && items[i].CarriedBy == 0)
                    freeRegolith += items[i].Count;
            Assert.That(freeRegolith, Is.EqualTo(0), "the floor consumed its Regolith");
        }
    }
}
