using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>Spot-checks that <see cref="SimDefs.CreateDefault"/> reproduces today's
    /// constants. Assertions reference the REAL public consts wherever they are public,
    /// so any drift between the systems and the defs graph fails here (the B3/B4
    /// default-equivalence keystone starts from this guarantee).</summary>
    public class DefsDefaultTests
    {
        private static readonly SimDefs D = SimDefs.Default;

        [Test]
        public void MachineTable_MatchesMachineDefs_EntireTable()
        {
            Assert.That(D.Machines.Length, Is.EqualTo(MachineDefs.Count));
            for (int i = 0; i < D.Machines.Length; i++)
            {
                var expected = MachineDefs.Of((DeviceKind)i);
                var actual = D.Machines[i];
                Assert.That(actual.DrawKW, Is.EqualTo(expected.DrawKW), "DrawKW " + (DeviceKind)i);
                Assert.That(actual.GenerationKW, Is.EqualTo(expected.GenerationKW), "GenerationKW " + (DeviceKind)i);
                Assert.That(actual.Tier, Is.EqualTo(expected.Tier), "Tier " + (DeviceKind)i);
                Assert.That(actual.Blocks, Is.EqualTo(expected.Blocks), "Blocks " + (DeviceKind)i);
                Assert.That(actual.HeatKW, Is.EqualTo(expected.HeatKW), "HeatKW " + (DeviceKind)i);
                Assert.That(actual.WearPerHour, Is.EqualTo(expected.WearPerHour), "WearPerHour " + (DeviceKind)i);
                Assert.That(actual.MaintainBelow, Is.EqualTo(expected.MaintainBelow), "MaintainBelow " + (DeviceKind)i);
                Assert.That(actual.FailBelow, Is.EqualTo(expected.FailBelow), "FailBelow " + (DeviceKind)i);
            }
        }

        [Test]
        public void SolarWingGeneration_Is6()
        {
            Assert.That(D.Machines[(int)DeviceKind.SolarWing].GenerationKW, Is.EqualTo(6f));
        }

        [Test]
        public void RadiatorReject_MatchesConst()
        {
            Assert.That(D.RadiatorRejectKW, Is.EqualTo(MachineDefs.RadiatorRejectKW));
            Assert.That(D.RadiatorRejectKW, Is.EqualTo(5f));
        }

        [Test]
        public void Thermal_MatchesDocumentedDefaults()
        {
            // B3 moved these consts INTO the defs graph (ThermalSystem now reads
            // sim.Defs.Thermal.*), so the guard pins CreateDefault to the documented
            // literal values rather than to a now-removed const.
            Assert.That(D.Thermal.HeatCapacityJPerKPerTile, Is.EqualTo(53_000.0));
            Assert.That(D.Thermal.CitizenHeatW, Is.EqualTo(100.0));
            Assert.That(D.Thermal.RadiatorFloorK, Is.EqualTo(283.15));
            Assert.That(D.Thermal.DoorConductOpenWPerK, Is.EqualTo(40.0));
            Assert.That(D.Thermal.DoorConductClosedWPerK, Is.EqualTo(8.0));
            Assert.That(D.Thermal.HullLossWPerKelvinPerTile, Is.EqualTo(0.09));
            Assert.That(D.Thermal.SpaceSinkK, Is.EqualTo(3.0));
            Assert.That(D.Thermal.MinTemperatureK, Is.EqualTo(3.0));
            Assert.That(D.Thermal.MaxTemperatureK, Is.EqualTo(500.0));
        }

        [Test]
        public void Atmosphere_NominalPressure_MatchesRoomState()
        {
            Assert.That(D.Atmosphere.NominalPressureKPa, Is.EqualTo(RoomState.NominalPressureKPa));
        }

        [Test]
        public void Sustenance_MatchesDocumentedDefaults()
        {
            // B4 moved these consts INTO the defs graph (SustenanceSystem now reads
            // sim.Defs.Sustenance.*), so the guard pins CreateDefault to the documented
            // literal values rather than to a now-removed const.
            Assert.That(D.Sustenance.DrinkLiters, Is.EqualTo(0.5f));
            Assert.That(D.Sustenance.PotatoHungerValue, Is.EqualTo(0.36f));
            Assert.That(D.Sustenance.NeedThreshold, Is.EqualTo(0.5f));
        }

        [Test]
        public void Water_MatchesDocumentedDefaults()
        {
            // B4: WaterSystem reads sim.Defs.Water.* — pin the documented literals.
            Assert.That(D.Water.TankCapacityLiters, Is.EqualTo(500f));
            Assert.That(D.Water.ReclaimerLitersPerSecond, Is.EqualTo(0.05f));
            Assert.That(D.Water.ReclaimEfficiency, Is.EqualTo(0.93f));
        }

        [Test]
        public void Hydro_MatchesDocumentedDefaults()
        {
            // B4: HydroponicsSystem reads sim.Defs.Hydro.* — pin the documented literals.
            Assert.That(D.Hydro.GrowBedWaterPerSecond, Is.EqualTo(0.02f));
            Assert.That(D.Hydro.GrowSecondsPerCrop, Is.EqualTo(600f));
            Assert.That(D.Hydro.TranspirationRecaptureFraction, Is.EqualTo(0.8f));
        }

        [Test]
        public void Wear_Maintenance_MatchesDocumentedDefaults()
        {
            // B4: MachineWearSystem/MaintenanceSystem read sim.Defs.Wear.* — pin the
            // documented literals (WorkTicks is now derived at use, not a const).
            Assert.That(D.Wear.HotThresholdC, Is.EqualTo(35f));
            Assert.That(D.Wear.WearPerDegreeC, Is.EqualTo(0.05f));
            Assert.That(D.Wear.MaxHeatMultiplier, Is.EqualTo(3f));
            Assert.That(D.Wear.MaintenanceWorkSeconds, Is.EqualTo(20));
            Assert.That(D.Wear.JuryRigCondition, Is.EqualTo(0.6f));
        }

        [Test]
        public void Citizen_TicksPerTile_MatchesConst()
        {
            // CitizenSystem.TicksPerTile stays a public const (frozen Game.View reads it),
            // so this keeps referencing the real const — the defs graph must mirror it.
            Assert.That(D.Citizen.TicksPerTile, Is.EqualTo(CitizenSystem.TicksPerTile));
            Assert.That(D.Citizen.IdleTicksBetweenWanders, Is.EqualTo(30));
        }

        [Test]
        public void Exploration_MatchesDocumentedDefault()
        {
            // B4: ExplorationSystem reads sim.Defs.Exploration.Radius — pin the literal.
            Assert.That(D.Exploration.Radius, Is.EqualTo(8));
        }

        [Test]
        public void Recipes_MatchCraftingTable()
        {
            var salvage = D.Recipes[(int)DeviceKind.SalvageRecycler];
            Assert.That(salvage.Defined, Is.True);
            Assert.That(salvage.Input, Is.EqualTo(ItemKind.Regolith));
            Assert.That(salvage.Output, Is.EqualTo(ItemKind.Scrap));
            Assert.That(salvage.OutputCount, Is.EqualTo(2));
            Assert.That(salvage.WorkSeconds, Is.EqualTo(20));

            var fab = D.Recipes[(int)DeviceKind.Fabricator];
            Assert.That(fab.Input, Is.EqualTo(ItemKind.Scrap));
            Assert.That(fab.InputCount, Is.EqualTo(2));
            Assert.That(fab.Output, Is.EqualTo(ItemKind.Parts));
            Assert.That(fab.WorkSeconds, Is.EqualTo(30));

            var shop = D.Recipes[(int)DeviceKind.MachineShop];
            Assert.That(shop.Output, Is.EqualTo(ItemKind.ControllerModule));
            Assert.That(shop.WorkSeconds, Is.EqualTo(40));

            // A non-crafting kind has no recipe.
            Assert.That(D.Recipes[(int)DeviceKind.Door].Defined, Is.False);
        }
    }
}
