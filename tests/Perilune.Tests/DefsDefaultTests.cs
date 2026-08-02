using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
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

        /// <summary>M3-10. Same shape as the radiator's pin above, for the field that is its exact
        /// mirror: the const and the graph must agree, AND the graph must hold the documented
        /// literal — two assertions, because "equal to the const" alone is satisfied by both of them
        /// drifting together.</summary>
        [Test]
        public void HeaterOutput_MatchesConst()
        {
            Assert.That(D.HeaterOutputKW, Is.EqualTo(MachineDefs.HeaterOutputKW));
            Assert.That(D.HeaterOutputKW, Is.EqualTo(5f));
        }

        /// <summary>M3-10. The heater's own machine row, written out by hand — the table comparison
        /// elsewhere in this file proves the three transcriptions AGREE, and this proves they agree
        /// on the values the package actually decided.</summary>
        [Test]
        public void HeaterRow_MatchesDocumentedDefaults()
        {
            var h = D.Machines[(int)DeviceKind.Heater];
            Assert.That(h.DrawKW, Is.EqualTo(1.0f), "draw — sized against the wreck's measured LifeSupport headroom");
            Assert.That(h.GenerationKW, Is.EqualTo(0f));
            Assert.That(h.Tier, Is.EqualTo(PowerTier.LifeSupport), "Industry is measurably SHED on the shipped wreck");
            Assert.That(h.Blocks, Is.False);
            Assert.That(h.HeatKW, Is.EqualTo(0f),
                "heat MUST be 0: this column is unconditional, un-condition-scaled WASTE heat, and a "
                + "heater's output is its product — it rides heater_output_kw instead, and a non-zero "
                + "value here would double-count and would ignore Device.EffectiveRate");
            Assert.That(h.WearPerHour, Is.EqualTo(0.006f), "the Radiator's rate — same class of plant");
            Assert.That(h.MaintainBelow, Is.EqualTo(0.4f));
            Assert.That(h.FailBelow, Is.EqualTo(0.10f));
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
            Assert.That(D.Thermal.HeaterCeilingK, Is.EqualTo(294.15));   // M3-10, 21 °C
            Assert.That(D.Thermal.HeaterCeilingK, Is.GreaterThan(D.Thermal.RadiatorFloorK),
                "the heater's ceiling must sit ABOVE the radiator's floor, or a room with both would "
                + "oscillate between two devices fighting each other every pass");
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
        public void Atmosphere_DiffusionCoefficient_MatchesDocumentedDefault()
        {
            // B-3: AtmosphereSystem reads sim.Defs.Atmosphere.DiffusionCoefficient for the
            // per-species partial-pressure diffusion term — pin the documented literal.
            Assert.That(D.Atmosphere.DiffusionCoefficient, Is.EqualTo(0.5));
        }

        /// <summary>E0-5: the shipped <c>[deconstruct]</c> values, pinned as literals so a silent
        /// retune of the compiled default is a red test rather than an economy drift. The
        /// wall_recovery relationship to <c>build.wall_material</c> is what makes the loop lossy,
        /// so it is asserted as the DERIVED yield too, not just the raw fraction.</summary>
        [Test]
        public void Deconstruct_MatchesDocumentedDefaults_AndYieldsHalfOfABuild()
        {
            Assert.That(D.Deconstruct.WallRecovery, Is.EqualTo(0.5f));
            Assert.That(D.Deconstruct.WallWorkTicks, Is.EqualTo(1200));
            Assert.That(D.Deconstruct.MaxStaged, Is.EqualTo(D.Build.MaxStaged));
            Assert.That(D.Deconstruct.WallWorkTicks * 2, Is.EqualTo(D.Build.WallConstructTicks),
                "tearing down is deliberately exactly half a build");
            Assert.That(DeconstructSystem.WallYield(D), Is.EqualTo(1),
                "floor(2 × 0.5): a stripped wall returns HALF of what raising it cost");

            // E0-5 WP-2 device strip.
            Assert.That(D.Deconstruct.DeviceParts, Is.EqualTo(2));
            Assert.That(D.Deconstruct.DeviceWorkTicks, Is.EqualTo(900));
            Assert.That(D.Deconstruct.DeviceWorkTicks, Is.LessThan(D.Deconstruct.WallWorkTicks),
                "pulling a machine is deliberately quicker than cutting structure");
            Assert.That(D.Deconstruct.DeviceParts, Is.EqualTo(D.Recipes[(int)DeviceKind.MachineShop].InputCount),
                "device_parts is priced off the MachineShop's 2-Parts input: one stripped machine " +
                "is worth one ControllerModule of value");
        }

        /// <summary>
        /// E0-5 WP-3 — THE LOSSINESS INVARIANT, asserted on the DEFAULTS rather than on one
        /// scenario. <c>PlaceDeviceCommand</c> charges <c>build.device_place_cost</c> Parts and
        /// <c>DeconstructSystem</c> refunds at most <c>floor(deconstruct.device_parts × 1.0)</c>
        /// Parts, so the shipped pair is only safe while the charge STRICTLY exceeds the best
        /// possible refund. If it ever does not, place → strip → repeat is an unbounded Parts
        /// faucet into <c>MaintenanceSystem</c>, the ship's one never-ending sink — measured by
        /// WP-2's review at 1 Part per 476 ticks with zero matter input.
        ///
        /// It is asserted as an INEQUALITY, not as "3 and 2", so a future retune of either number
        /// is free as long as the pair stays lossy — and the recovery band is checked against
        /// <c>ECONOMY.md</c> §9.6 ("recoverable at 50–70 %") so a technically-lossy but absurd
        /// pricing (cost 100, yield 2) is also a red test.
        ///
        /// MUTATION (apply, observe, revert): set <c>DevicePlaceCost = 2</c> in
        /// <c>SimDefs.CreateDefault</c> → the strict-inequality assertion fails (2 &gt; 2 is false),
        /// which is exactly the free-matter regression this pins. Set it to 5 → the ≥ 50 % band
        /// assertion fails (2/5 = 40 %).
        /// </summary>
        [Test]
        public void Build_DevicePlaceCost_StrictlyExceedsTheBestPossibleStripYield()
        {
            Assert.That(D.Build.DevicePlaceCost, Is.EqualTo(3), "the shipped price, in Parts");
            Assert.That(PlaceDeviceCommand.Currency, Is.EqualTo(DeconstructSystem.DeviceSalvage),
                "the charge and the refund must be the SAME currency, or the loop is only " +
                "material-neutral and still a labour exploit");

            int bestYield = D.Deconstruct.DeviceParts; // floor(device_parts × Condition 1.0)
            Assert.That(D.Build.DevicePlaceCost, Is.GreaterThan(bestYield),
                "placing then stripping a PRISTINE device must leave the ship strictly poorer");

            double recovery = bestYield / (double)D.Build.DevicePlaceCost;
            Assert.That(recovery, Is.GreaterThanOrEqualTo(0.50).And.LessThanOrEqualTo(0.70),
                "ECONOMY.md §9.6: matter already installed is recoverable at 50–70 % — " +
                $"measured {recovery:P1}");
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
            Assert.That(D.Wear.MaintenanceWorkSeconds, Is.EqualTo(900)); // E0-2 L1 rebase (was 20)
            Assert.That(D.Wear.JuryRigCondition, Is.EqualTo(0.6f));
        }

        [Test]
        public void Citizen_TicksPerTile_MatchesConst()
        {
            // CitizenSystem.TicksPerTile stays a public const (frozen Game.View reads it),
            // so this keeps referencing the real const — the defs graph must mirror it.
            Assert.That(D.Citizen.TicksPerTile, Is.EqualTo(CitizenSystem.TicksPerTile));
            Assert.That(D.Citizen.IdleTicksBetweenWanders, Is.EqualTo(30));
            Assert.That(D.Citizen.WanderRadiusTiles, Is.EqualTo(8)); // E0-1 wander scope
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
            // E0-6: 4 -> 3 (75%), was 1 -> 2. The legacy row is the fallback leg for a defs set
            // with an EMPTY [production] section, so leaving it at 1 -> 2 would have kept the
            // mass creation reachable one branch away from the fix that removed it.
            Assert.That(salvage.InputCount, Is.EqualTo(4));
            Assert.That(salvage.OutputCount, Is.EqualTo(3));
            Assert.That(salvage.OutputCount, Is.LessThan(salvage.InputCount),
                "the legacy recycler row must be lossy too — ECONOMY.md §2.1 is a property of the " +
                "ladder, not of whichever container happens to express it");
            Assert.That(salvage.WorkSeconds, Is.EqualTo(2400)); // E0-6 (600 per Regolith unit, unchanged)

            var fab = D.Recipes[(int)DeviceKind.Fabricator];
            Assert.That(fab.Input, Is.EqualTo(ItemKind.Scrap));
            Assert.That(fab.InputCount, Is.EqualTo(2));
            Assert.That(fab.Output, Is.EqualTo(ItemKind.Parts));
            Assert.That(fab.WorkSeconds, Is.EqualTo(900)); // E0-2 L1 rebase (was 30)

            var shop = D.Recipes[(int)DeviceKind.MachineShop];
            Assert.That(shop.Output, Is.EqualTo(ItemKind.ControllerModule));
            Assert.That(shop.WorkSeconds, Is.EqualTo(1800)); // E0-2 L1 rebase (was 40)

            // A non-crafting kind has no recipe.
            Assert.That(D.Recipes[(int)DeviceKind.Door].Defined, Is.False);
        }
    }
}
