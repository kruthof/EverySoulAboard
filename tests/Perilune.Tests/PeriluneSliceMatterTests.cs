using System.Collections.Generic;
using Perilune.Gen;
using Perilune.Gen.Validate;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// P2 M2 — the slice's matter balance. The eight-crew ship must run UNATTENDED for three
    /// days with air/water/food/power margins (nobody dies, life support stays in band), yet
    /// sit close enough to the edge that degradation bites: under maximum wear pressure a
    /// generator grinds down and the ship browns out inside the window — the tension the
    /// Director works with. The balance is authored into PeriluneSlice's device/stock mix (a
    /// fab-bay radiator, filled tanks, a primed greywater reserve, a fuller pantry, a second
    /// corridor scrubber, and a wandering crew that never piles into one room) — NOT a global
    /// .def change, which would fold into boot state and move the pinned 2-crew reference hash.
    /// The wear stress is forced with an in-test defs override, so no shipped .def moves.
    /// </summary>
    public class PeriluneSliceMatterTests
    {
        private const long TicksPerDay = 864000L;

        [Test]
        public void Slice_SurvivesThreeUnattendedDays_WithLifeSupportInBand()
        {
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;
            for (long t = 0; t < 3 * TicksPerDay; t++) sim.Tick();

            int alive = 0;
            foreach (var c in sim.Citizens.Items) if (!c.Dead) alive++;
            Assert.That(alive, Is.EqualTo(8), "all eight crew survive three unattended days");

            var m = ShipMetrics.Compute(sim);
            Assert.That(m.Oxygen, Is.GreaterThan(0.9f), "mean O2 holds well within band after three days");

            // A breathable, powered life-support compartment is still pressurised.
            float lsPressure = (float)sim.Rooms.RoomAt(sim.World, new Int3(28, 13, 0)).PressureKPa;
            Assert.That(lsPressure, Is.GreaterThan(90f), "life support stays pressurised");

            // Water and food loops are still live (not merely coasting on the opening buffer).
            float storedWater = sim.WastewaterLiters;
            bool growBed = false;
            foreach (var d in sim.Devices.Items)
            {
                if (d.Kind == DeviceKind.WaterTank) storedWater += d.StoredLiters;
                if (d.Kind == DeviceKind.GrowBed) growBed = true;
            }
            Assert.That(storedWater, Is.GreaterThan(50f), "water reserve intact");
            Assert.That(growBed, Is.True, "food production aboard");
        }

        [Test]
        public void Slice_ThreeDaySurvival_PassesTheValidationGateSuite()
        {
            // The generalised WS-SHIPGEN survivability gate, at the slice's three-day horizon.
            var report = ShipGates.Run(AuthoredShips.PeriluneSlice(), SimDefs.Default, days: 3);
            Assert.That(report.AllPassed, report.Format());
        }

        [Test]
        public void Slice_UnderMaxWearPressure_BrownsOutWithinTheWindow()
        {
            // Force maximum wear pressure with an in-test defs override: crank the solar wings'
            // wear so the generators grind below their fail threshold faster than the crew can
            // jury-rig them. Nothing shipped changes — this is the "def override" lever.
            const string machines =
                "[machines]\n" +
                "#          draw  gen  tier     blocks  heat  wear   maint  fail\n" +
                "SolarWing  0     6    Comfort  false   0     4.0    0.4    0.10\n";
            var defs = DefsParser.Parse(
                new List<(string, string)> { ("machines.def", machines) },
                new List<(string, string)>(), new List<string>());

            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), defs).Sim;

            long brownoutTick = -1;
            long horizon = 2 * TicksPerDay;
            for (long t = 0; t < horizon && brownoutTick < 0; t++)
            {
                sim.Tick();
                if (IsBrownedOut(sim)) brownoutTick = sim.TickCount;
            }

            Assert.That(brownoutTick, Is.GreaterThanOrEqualTo(0),
                "maximum wear pressure must brown the ship out within two days");
            Assert.That(brownoutTick, Is.LessThan(TicksPerDay),
                "the brownout arrives inside the first day (Director tension window)");
        }

        /// <summary>A network is browned out when a power-drawing device on a real network is
        /// left unpowered (its tier was shed) — the same signal the PowerSystem publishes.</summary>
        private static bool IsBrownedOut(Simulation sim)
        {
            foreach (var d in sim.Devices.Items)
            {
                var def = sim.Defs.Machines[(int)d.Kind];
                if (def.DrawKW > 0f && d.NetworkId != 0 && !d.Powered) return true;
            }
            return false;
        }
    }
}
