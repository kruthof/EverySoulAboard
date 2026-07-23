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
        public void Slice_HydroLoopSurvivesPastDay1_2()
        {
            // B-2 regression. The hydro bay is a self-contained closed loop (its own
            // tank_hydro + reclaimer_hydro on one fluid network); with no runtime water source
            // the lossy loop (0.8 transpiration × 0.93 reclaim ⇒ ~0.256 L/L destroyed) drank
            // the SHARED greywater pool dry ~day 1.2, after which reclaimer_hydro had nothing to
            // cycle, tank_hydro never refilled, and every grow bed stalled FOREVER — yet the
            // shipwide-total water the other slice test checks still plateaued ~500 L (that test
            // slips past this bug).
            //
            // This test must DISCRIMINATE the fix (it goes RED with RunMakeup removed / the floor
            // at 0). Weak checks do NOT: "tank > 0" passes pre-fix at the ~0.003 L DrawEpsilon
            // residue, and growbed_1 (FIRST in store order) wins an occasional sip from the crew's
            // drinking/transpiration trickle even with the pool dead. The real, pre-fix-lethal
            // signals (reviewer-traced): growbed_2 AND growbed_3 (LATER in store order — the first
            // bed drinks the trickle first) freeze PERMANENTLY after ~day 0.6 without the fix, and
            // tank_hydro collapses to the DrawEpsilon residue instead of holding its authored ~500 L.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

            const long day1_2 = (long)(1.2 * TicksPerDay); // 1_036_800
            for (long t = 0; t < day1_2; t++) sim.Tick();

            // Watch every bed from day 1.2 on: a rise = live growth; a sharp drop = a harvest.
            var beds = new[] { FindDevice(sim, "growbed_1"), FindDevice(sim, "growbed_2"), FindDevice(sim, "growbed_3") };
            var prev = new float[beds.Length];
            var advanced = new bool[beds.Length];
            var harvests = new int[beds.Length];
            for (int b = 0; b < beds.Length; b++) prev[b] = beds[b].Progress;
            for (long t = day1_2; t < 2 * TicksPerDay; t++)
            {
                sim.Tick();
                for (int b = 0; b < beds.Length; b++)
                {
                    float now = beds[b].Progress;
                    if (now > prev[b]) advanced[b] = true;           // still growing
                    else if (prev[b] - now > 0.5f) harvests[b]++;    // Progress reset ⇒ a crop landed
                    prev[b] = now;
                }
            }

            var tankHydro = FindDevice(sim, "tank_hydro");
            Assert.That(tankHydro.StoredLiters, Is.GreaterThan(50f),
                "tank_hydro must hold real water past day 1.2 (post-fix it pins near its authored ~500 L); " +
                "pre-fix it collapses to the ~0.003 L DrawEpsilon residue as the pool dies");
            Assert.That(advanced[1], Is.True,
                "growbed_2 must keep advancing after day 1.2 — pre-fix the later beds freeze permanently " +
                "once the shared greywater pool runs dry");
            Assert.That(advanced[2], Is.True,
                "growbed_3 must keep advancing after day 1.2 — pre-fix the later beds freeze permanently");
            Assert.That(harvests[0] + harvests[1] + harvests[2], Is.GreaterThan(0),
                "at least one crop must be harvested after day 1.2 — the food loop is genuinely running, " +
                "not merely holding a residue");
        }

        private static Device FindDevice(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail($"no device '{name}' aboard the slice");
            return null;
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
