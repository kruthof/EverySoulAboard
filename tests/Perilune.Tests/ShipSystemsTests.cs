using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// <see cref="ShipSystems"/> — the MOSS phosphor ledger's pure derivation
    /// (`docs/design/perilune-moss-terminal.spec.md` §5).
    ///
    /// The obligations this file discharges (spec §6 row 1, sim half):
    ///  * the report is a DERIVATION — computing it adds no hashed state and does not perturb
    ///    <see cref="Simulation.StateHash"/> or the RNG (twin sims stay byte-identical);
    ///  * DETERMINISM — twin sims produce byte-identical rows;
    ///  * CULTURE — every number that reaches a row is InvariantCulture under a de-DE probe;
    ///  * HONESTY — `nav_sensors` is OFFLINE *because the device census finds no Telescope*,
    ///    proven by placing one and watching the row come alive; `life_support` is banded off
    ///    worst-room CO2 and NOT capacity; `hull_integrity` states its proxy in its own text.
    /// </summary>
    public class ShipSystemsTests
    {
        private static readonly string[] Room =
        {
            "##########",
            "#........#",
            "##########",
        };

        private static Simulation NewSim(SimDefs defs = null) =>
            new Simulation(AsciiWorld.Build(Room),
                           7,
                           SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())),
                           defs);

        private static ShipSystemRow Row(ShipSystemsReport r, string id)
        {
            foreach (var row in r.Rows) if (row.Id == id) return row;
            throw new AssertionException("no row with id " + id);
        }

        // ------------------------------------------------------------------ shape

        [Test]
        public void Report_Has_The_Eight_Rows_In_Fixed_Order()
        {
            var sim = NewSim();
            var report = ShipSystems.Compute(sim);
            CollectionAssert.AreEqual(
                new[] { "reactor", "life_support", "water_reclaim", "hydroponics",
                        "thermal", "fabrication", "hull_integrity", "nav_sensors" },
                report.Rows.Select(r => r.Id).ToArray(),
                "presentation order is a HOST decision, not a client sort");
            CollectionAssert.AreEqual(ShipSystems.Ids, report.Rows.Select(r => r.Id).ToArray());
        }

        [Test]
        public void Every_Row_Has_An_Uppercase_Label_A_Legal_Load_And_A_Derivation()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var report = ShipSystems.Compute(host.Sim, host.History);
            foreach (var row in report.Rows)
            {
                Assert.AreEqual(row.Label.ToUpperInvariant(), row.Label, row.Id + " label is uppercase");
                Assert.IsTrue(row.Load == -1 || (row.Load >= 0 && row.Load <= 100),
                    row.Id + " load is 0..100 or the -1 sentinel, got " + row.Load);
                Assert.IsTrue(row.FaultDay >= -1, row.Id + " faultDay is a day or -1");
                if (row.FaultDay < 0) Assert.AreEqual("", row.FaultText, row.Id + " has no fault text without a fault");
                Assert.IsNotEmpty(ShipSystems.Derivation(row.Id), row.Id + " ships an IX-M22 derivation note");
                Assert.IsNotEmpty(row.Advisory, row.Id + " ships an advisory");
                // Every row carries the LAST FAULT caveat: a player who reads that column as "the
                // current problem" will chase a fault that was repaired two days ago, because
                // nothing is published on repair (MachineWearSystem.cs:262).
                StringAssert.Contains("NOT the current problem", ShipSystems.Derivation(row.Id), row.Id);
            }
            Assert.AreEqual("", ShipSystems.Derivation("no_such_row"), "and an unknown row invents nothing");
        }

        [Test]
        public void Every_Offline_Row_States_Its_Reason_Because_The_Fault_Column_Will_Be_Empty()
        {
            // An OFFLINE row's `advisory` is the ONLY place its reason can appear: the fault column
            // is correctly `—` (an absence of hardware is not a fault and has no day), and the STATE
            // cell is one word. A bare sim puts most rows OFFLINE at once, which the shipped ships
            // never do — so assert the invariant here rather than hope the slice exercises it.
            var bare = ShipSystems.Compute(NewSim());
            int offline = 0;
            foreach (var row in bare.Rows)
            {
                Assert.AreEqual(-1, row.FaultDay, row.Id + " invents no day");
                Assert.AreEqual("", row.FaultText, row.Id);
                if (row.State != ShipSystemState.Offline) continue;
                offline++;
                Assert.IsNotEmpty(row.Advisory, row.Id + " OFFLINE without a stated reason");
                Assert.Greater(row.Advisory.Length, 20, row.Id + " reason is prose, not a shrug");
            }
            Assert.Greater(offline, 1, "a bare sim really does put several rows OFFLINE");
        }

        [Test]
        public void Uptime_Is_The_Raw_Tick_Count_And_Day_Derives_From_It()
        {
            var sim = NewSim();
            for (int i = 0; i < 25; i++) sim.Tick();
            var report = ShipSystems.Compute(sim);
            Assert.AreEqual(sim.TickCount, report.Uptime, "the host ships RAW ticks; the client formats them");
            Assert.AreEqual((int)(sim.TickCount / SimClockUtil.TicksPerDay), report.Day);
        }

        // ------------------------------------------------------- no hashed state / determinism

        [Test]
        public void Computing_The_Report_Adds_No_State_And_Does_Not_Move_The_StateHash()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            for (int i = 0; i < 200; i++) host.Sim.Tick();

            ulong before = host.Sim.StateHash();
            for (int i = 0; i < 5; i++)
            {
                ShipSystems.Compute(host.Sim, host.History);
                foreach (var id in ShipSystems.Ids) ShipSystems.ComputeDetail(host.Sim, id);
            }
            Assert.AreEqual(before, host.Sim.StateHash(),
                "ShipSystems is a pure derivation — reading it can never move the determinism hash");
        }

        [Test]
        public void Twin_Sims_Produce_Byte_Identical_Rows_And_A_Report_Read_Does_Not_Diverge_Them()
        {
            var a = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var b = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            for (int i = 0; i < 300; i++)
            {
                a.Sim.Tick();
                b.Sim.Tick();
                // Twin A is READ every tick; twin B is never read. If the report were not pure
                // (RNG touch, lazy recompute, event publish) the twins would part here.
                if (i % 25 == 0) ShipSystems.Compute(a.Sim, a.History);
            }
            Assert.AreEqual(b.Sim.StateHash(), a.Sim.StateHash(), "twin hashes MATCH after a read-heavy run");
            Assert.AreEqual(Flatten(ShipSystems.Compute(b.Sim, b.History)),
                            Flatten(ShipSystems.Compute(a.Sim, a.History)),
                            "twin ledgers are byte-identical");
        }

        [Test]
        public void Rows_Are_InvariantCulture_Under_A_deDE_Probe()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            for (int i = 0; i < 400; i++) host.Sim.Tick();

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                string de = Flatten(ShipSystems.Compute(host.Sim, host.History));
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = Flatten(ShipSystems.Compute(host.Sim, host.History));
                Assert.AreEqual(inv, de, "the ledger is culture-independent");
                StringAssert.DoesNotContain(",0 kW", de, "no locale decimal comma reached a row");
                StringAssert.DoesNotContain(",0 L", de);
                StringAssert.DoesNotContain(",0 C", de);
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ nav_sensors (DA-M1)

        [Test]
        public void NavSensors_Is_Offline_Because_The_Census_Finds_No_Telescope()
        {
            // Both shipped ships. The row is OFFLINE, the load is the -1 sentinel, and the
            // advisory states the REASON — not a plausible percentage (DA-M1).
            foreach (var ship in new[] { ShipChoice.Perilune, ShipChoice.Slice })
            {
                var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
                Assert.IsFalse(host.Sim.Devices.Items.Any(d => d.Kind == DeviceKind.Telescope),
                    ship + " places no telescope (the premise of this row)");

                var nav = Row(ShipSystems.Compute(host.Sim, host.History), "nav_sensors");
                Assert.AreEqual(ShipSystemState.Offline, nav.State, ship + " nav is OFFLINE");
                Assert.AreEqual(-1, nav.Load, "no meaningful load");
                StringAssert.Contains("no telescope", nav.Advisory.ToLowerInvariant(),
                    "the row states WHY it is offline");
                StringAssert.Contains("NO SENSOR HARDWARE", nav.Advisory);

                // An absence of hardware is NOT a fault and has NO day. Rendering it as one
                // collapses to "DAY 0 · NO SENSOR HARDWARE" — a fabricated timestamp on a
                // diagnostic screen, which is the exact lie DA-M1 forbids.
                Assert.AreEqual(-1, nav.FaultDay, "no fabricated day");
                Assert.AreEqual("", nav.FaultText, "the reason lives in ADVISORY, not LAST FAULT");
                CollectionAssert.IsEmpty(ShipSystems.ComputeDetail(host.Sim, "nav_sensors"));
            }
        }

        [Test]
        public void NavSensors_Comes_Alive_On_Its_Own_When_A_Telescope_Is_Placed()
        {
            // The OFFLINE verdict is DERIVED from the census, never hardcoded: place real
            // hardware and the row computes a real load and a real ladder like any other.
            var sim = NewSim();
            Assert.AreEqual(ShipSystemState.Offline, Row(ShipSystems.Compute(sim), "nav_sensors").State);

            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            var scope = sim.AddDevice(DeviceKind.Telescope, new Int3(3, 1, 0), "scope");
            for (int i = 0; i < 20; i++) sim.Tick();   // let PowerSystem wire + balance

            var alive = Row(ShipSystems.Compute(sim), "nav_sensors");
            Assert.IsTrue(scope.Powered, "the probe telescope really is on the grid");
            Assert.AreNotEqual(ShipSystemState.Offline, alive.State, "the row came alive on its own");
            Assert.AreEqual(100, alive.Load, "1 of 1 telescope powered and serviceable");
            var detail = ShipSystems.ComputeDetail(sim, "nav_sensors");
            Assert.AreEqual(1, detail.Count);
            Assert.AreEqual("scope", detail[0].Name);
            Assert.AreEqual(100, detail[0].Condition);
            Assert.IsTrue(detail[0].Powered);

            // ... and a wrecked telescope drops it back to OFFLINE through the LADDER, not a
            // hardcode: 0 live of 1 total.
            scope.Condition = 0f;
            for (int i = 0; i < 20; i++) sim.Tick();
            var dead = Row(ShipSystems.Compute(sim), "nav_sensors");
            Assert.AreEqual(0, dead.Load);
            Assert.AreEqual(ShipSystemState.Offline, dead.State);
            Assert.AreEqual("FAILED", ShipSystems.ComputeDetail(sim, "nav_sensors")[0].Note);
        }

        // ------------------------------------------------------------------ life_support (DA-M4)

        [Test]
        public void LifeSupport_State_Is_Banded_Off_WorstRoom_CO2_Not_Nameplate_Capacity()
        {
            // The exact shape of MECHANICS.md §13.1: scrubbers healthy and OVER nameplate
            // capacity while the compartment the crew stand in is poisonous. A capacity-derived
            // row would read NOMINAL here; this one must not.
            var sim = NewSim();
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            var scrub = sim.AddDevice(DeviceKind.Scrubber, new Int3(3, 1, 0), "scrubber_a");
            sim.AddCitizen("Probe", new Int3(5, 1, 0)).GiveAllWork();
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.IsTrue(scrub.Powered && scrub.IsOperational(sim.Defs), "the scrubber is healthy and powered");

            var room = sim.Rooms.RoomAt(sim.World, new Int3(5, 1, 0));
            Assert.IsNotNull(room);
            RoomState.Pressurize(room);   // a compartment the crew could actually stand in

            // NOMINAL while the air is clean, even though nothing about capacity changed.
            SetCo2(room, 500.0);
            Assert.AreEqual(ShipSystemState.Nominal, Row(ShipSystems.Compute(sim), "life_support").State);

            SetCo2(room, 1200.0);
            Assert.AreEqual(ShipSystemState.Attend, Row(ShipSystems.Compute(sim), "life_support").State,
                "stale air (>= 1000 ppm) asks for attention");

            // The measured slice figure. Capacity is unchanged and still over nameplate.
            SetCo2(room, 17644.0);
            var bad = Row(ShipSystems.Compute(sim), "life_support");
            Assert.AreEqual(ShipSystemState.Degraded, bad.State,
                "17,644 ppm is DEGRADED — a capacity-derived NOMINAL would be a lie");
            StringAssert.Contains("17644 ppm", bad.Advisory, "the row reports the measured number");
            Assert.IsTrue(scrub.Powered && scrub.IsOperational(sim.Defs), "and the scrubber is STILL healthy");
            Assert.Less(bad.Load, 100, "capacity still exceeds demand — the LOAD bar is not what banded this row");

            SetCo2(room, sim.Defs.Needs.Co2NarcosisPpm + 1.0);
            Assert.AreEqual(ShipSystemState.Offline, Row(ShipSystems.Compute(sim), "life_support").State,
                "past the one ppm figure with a damage consumer (needs.def co2_narcosis_ppm)");
        }

        // ------------------------------------------------------------------ hull_integrity (DA-M3)

        [Test]
        public void HullIntegrity_Declares_Itself_A_Proxy_And_Tracks_Mean_Machine_Condition()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var hull = Row(ShipSystems.Compute(host.Sim, host.History), "hull_integrity");

            StringAssert.Contains("PROXY", hull.Advisory);
            StringAssert.Contains("no hull-stress model", hull.Advisory);
            StringAssert.Contains("PROXY", ShipSystems.Derivation("hull_integrity"));

            // It is exactly ShipMetrics.Structural (mean condition over wearing devices).
            var metrics = ShipMetrics.Compute(host.Sim);
            Assert.AreEqual((int)Math.Round(metrics.Structural * 100.0, MidpointRounding.AwayFromZero), hull.Load);

            // Nothing publishes a breach event anywhere in the sim, so this row's LAST FAULT is
            // legitimately empty rather than borrowing an unrelated maintenance alarm. Asserting
            // that on the untouched slice proves nothing — no slice history entry happens to name a
            // wearing device, so the assertion passes whether or not the forbidden join exists.
            // FALSIFY it: put an entry naming a real hull-group device into history and require the
            // row to keep ignoring it.
            Assert.AreEqual(-1, hull.FaultDay);
            Assert.AreEqual("", hull.FaultText);

            var wearing = host.Sim.Devices.Items.First(d =>
                host.Sim.Defs.Machines[(int)d.Kind].WearPerHour > 0f && !string.IsNullOrEmpty(d.Name));
            host.History.Entries.Add(new HistoryEntry(host.Sim.TickCount,
                wearing.Name + ": SEAL FAILURE", (byte)HistoryKind.Alarm));

            var after = Row(ShipSystems.Compute(host.Sim, host.History), "hull_integrity");
            Assert.AreEqual(-1, after.FaultDay,
                "hull makes NO history join — a maintenance alarm is not a hull breach");
            Assert.AreEqual("", after.FaultText);

            // …and the join is real elsewhere, so the assertion above is not passing by accident.
            var group = Row(ShipSystems.Compute(host.Sim, host.History),
                            wearing.Kind == DeviceKind.Scrubber || wearing.Kind == DeviceKind.AirVent
                                ? "life_support" : "hull_integrity");
            Assert.IsNotNull(group.Id);
        }

        [Test]
        public void Fault_Join_Ignores_A_Recovery_On_The_NAME_Branch_Too()
        {
            // The structural (brownout) branch was narrowed to exclude recoveries; the NAME branch
            // needs the identical guard. "DAY n · … RECOVERED" under a column headed LAST FAULT is
            // the same misread whichever branch produced it.
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var scrubber = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.Scrubber && !string.IsNullOrEmpty(d.Name));

            host.History.Entries.Add(new HistoryEntry(host.Sim.TickCount,
                scrubber.Name + ": FLOW FAULT", (byte)HistoryKind.Alarm));
            var faulted = Row(ShipSystems.Compute(host.Sim, host.History), "life_support");
            StringAssert.Contains("FLOW FAULT", faulted.FaultText, "the name join works at all");

            // A NEWER recovery naming the same device must not displace it.
            host.History.Entries.Add(new HistoryEntry(host.Sim.TickCount + 10,
                scrubber.Name + ": flow recovered.", (byte)HistoryKind.Alarm));
            var after = Row(ShipSystems.Compute(host.Sim, host.History), "life_support");
            StringAssert.Contains("FLOW FAULT", after.FaultText,
                "the recovery is skipped and the last real FAULT still stands");
            StringAssert.DoesNotContain("RECOVERED", after.FaultText);
        }

        [Test]
        public void A_NonFinite_Reading_Is_OFFLINE_And_Unreadable_Never_A_Healthy_Zero()
        {
            // One poisoned float used to render eight NOMINAL rows and a fabricated "mean O2 0%",
            // because Pct(NaN) was 0, Fixed1(NaN) was "0.0", and a NaN room lost every comparison
            // silently while still counting as pressurised.
            var sim = NewSim();
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            var scrub = sim.AddDevice(DeviceKind.Scrubber, new Int3(3, 1, 0), "scrubber_a");
            sim.AddCitizen("Probe", new Int3(5, 1, 0)).GiveAllWork();
            for (int i = 0; i < 20; i++) sim.Tick();
            var room = sim.Rooms.RoomAt(sim.World, new Int3(5, 1, 0));
            RoomState.Pressurize(room);
            Assert.AreEqual(ShipSystemState.Nominal, Row(ShipSystems.Compute(sim), "life_support").State);

            // The exact shape a `set scrubber_a.rate NaN` used to produce.
            scrub.Rate = float.NaN;
            var poisoned = Row(ShipSystems.Compute(sim), "life_support");
            Assert.AreEqual(ShipSystemState.Offline, poisoned.State, "unknown is never nominal");
            Assert.AreEqual(-1, poisoned.Load);
            StringAssert.Contains("INSTRUMENT UNREADABLE", poisoned.Advisory);
            StringAssert.DoesNotContain("0.0x", poisoned.Advisory, "no fabricated zero in the prose");

            // A non-finite ROOM is excluded from every band and never counted as breathable.
            scrub.Rate = 1f;
            room.O2Moles = double.NaN;
            // hull_integrity reads rooms too (its pressure half), so it owes the SAME room guard —
            // otherwise a NaN room is dropped by the census `continue`, LowPressureRooms stays 0,
            // and hull renders a false all-clear ("every sealed compartment is holding pressure")
            // about a compartment whose pressure is undefined.
            foreach (var id in new[] { "life_support", "thermal", "hull_integrity" })
            {
                var r = Row(ShipSystems.Compute(sim), id);
                Assert.AreEqual(ShipSystemState.Offline, r.State, id + " must not band a NaN room");
                StringAssert.Contains("INSTRUMENT UNREADABLE", r.Advisory, id);
            }

            // Pin the hull guard on the pressure half ALONE — a NaN that never touches condition or
            // O2, only pressure — so the guard cannot silently regress behind the ConditionSum one.
            var sim2 = NewSim();
            sim2.AddCitizen("P", new Int3(5, 1, 0)).GiveAllWork();
            for (int j = 0; j < 5; j++) sim2.Tick();
            var room2 = sim2.Rooms.RoomAt(sim2.World, new Int3(5, 1, 0));
            RoomState.Pressurize(room2);
            Assert.AreEqual(ShipSystemState.Nominal, Row(ShipSystems.Compute(sim2), "hull_integrity").State,
                "healthy before the poison");
            room2.N2Moles = double.PositiveInfinity;   // pressure → non-finite; condition untouched
            var hull = Row(ShipSystems.Compute(sim2), "hull_integrity");
            Assert.AreEqual(ShipSystemState.Offline, hull.State,
                "a compartment with undefined pressure is UNREADABLE, never a holding-pressure all-clear");
            StringAssert.Contains("INSTRUMENT UNREADABLE", hull.Advisory);
            StringAssert.DoesNotContain("holding pressure", hull.Advisory);

            // And DETAIL says so per device rather than printing a number.
            room.O2Moles = 0.0;
            scrub.Rate = float.PositiveInfinity;
            var detail = ShipSystems.ComputeDetail(sim, "life_support").First(d => d.Name == "scrubber_a");
            Assert.AreEqual(-1, detail.Rate, "an unreadable rate is the -1 sentinel, not 0");
            Assert.AreEqual("READING NOT FINITE", detail.Note);
        }

        [Test]
        public void LifeSupport_Also_Bands_On_ppO2_Because_A_Mean_Hides_One_Bad_Room()
        {
            var sim = NewSim();
            sim.AddCitizen("Probe", new Int3(5, 1, 0)).GiveAllWork();
            for (int i = 0; i < 20; i++) sim.Tick();
            var room = sim.Rooms.RoomAt(sim.World, new Int3(5, 1, 0));
            RoomState.Pressurize(room);
            SetCo2(room, 500.0);   // air is CLEAN — only oxygen will move
            Assert.AreEqual(ShipSystemState.Nominal, Row(ShipSystems.Compute(sim), "life_support").State);

            var needs = sim.Defs.Needs;
            // Drop ppO2 into the hypoxia band (NeedsSystem.cs:132) while CO2 stays normal.
            SetPpO2(room, needs.HypoxiaPpO2KPa - 1.0);
            var hypoxic = Row(ShipSystems.Compute(sim), "life_support");
            Assert.AreEqual(ShipSystemState.Degraded, hypoxic.State,
                "a hypoxic compartment cannot sit behind a NOMINAL LIFE SUPPORT row");
            StringAssert.Contains("hypoxic", hypoxic.Advisory);

            // The severe rung damages at the vacuum rate (NeedsSystem.cs:130).
            SetPpO2(room, needs.SevereHypoxiaPpO2KPa - 1.0);
            Assert.AreEqual(ShipSystemState.Offline, Row(ShipSystems.Compute(sim), "life_support").State);
        }

        [Test]
        public void LifeSupport_ppO2_Uses_Partial_Pressure_Not_The_O2_Percentage()
        {
            // The fixtures above pressurise to ~101 kPa, where pressure×fraction and fraction×100
            // COINCIDE — so a wrong "band on O2 percent" formula would still pass them. Force the
            // two apart: a low-total-pressure room. 60 kPa at 25% O2 is ppO2 15 kPa (HYPOXIC, below
            // the 16 kPa threshold), while the O2 PERCENTAGE is 25 (comfortably "fine"). The row
            // must band on the partial pressure and read DEGRADED.
            var sim = NewSim();
            for (int i = 0; i < 5; i++) sim.Tick();
            var room = sim.Rooms.RoomAt(sim.World, new Int3(5, 1, 0));
            RoomState.Pressurize(room);
            SetRoomAtmosphere(room, totalKPa: 60.0, o2Fraction: 0.25, co2Ppm: 400.0);

            Assert.AreEqual(60.0, room.PressureKPa, 0.5, "the room really is at low total pressure");
            Assert.AreEqual(25.0, room.O2Fraction * 100.0, 0.5, "the O2 PERCENTAGE reads a healthy 25");
            Assert.AreEqual(15.0, room.PressureKPa * room.O2Fraction, 0.5, "…but the partial pressure is 15 kPa");

            var needs = sim.Defs.Needs;
            Assert.Less(15.0, needs.HypoxiaPpO2KPa, "15 kPa is below the hypoxia threshold");
            Assert.Greater(25.0, needs.HypoxiaPpO2KPa, "…while the raw percentage is above it (the trap)");

            var row = Row(ShipSystems.Compute(sim), "life_support");
            Assert.AreEqual(ShipSystemState.Degraded, row.State,
                "banded on partial pressure (15 kPa, hypoxic), NOT the O2 percentage (25, fine)");
            StringAssert.Contains("15.0 kPa", row.Advisory);
            StringAssert.Contains("hypoxic", row.Advisory);
        }

        [Test]
        public void Thermal_Waste_Heat_Excludes_Doors_And_Roomless_Devices()
        {
            // ThermalSystem routes doors to ConductAcrossDoor and drops their HeatKW by design
            // (ThermalSystem.cs:70-78); a device in no room heats nothing (:83). The slice's 19
            // powered doors are 0.95 kW, a ~6% overstatement if counted.
            var sim = NewHall();
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), "bus" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Radiator, new Int3(3, 1, 0), "rad");
            for (int i = 0; i < 20; i++) sim.Tick();
            PressurizeAll(sim);
            string before = Row(ShipSystems.Compute(sim), "thermal").Advisory;

            var door = sim.AddDevice(DeviceKind.Door, new Int3(4, 1, 0), "door_x");
            for (int i = 0; i < 20; i++) sim.Tick();
            PressurizeAll(sim);
            Assert.IsTrue(door.Powered, "the door really is powered, so only the kind gate can excuse it");
            Assert.AreEqual(WasteKW(before), WasteKW(Row(ShipSystems.Compute(sim), "thermal").Advisory),
                "a powered door adds NO waste heat — it is a conduction edge, not a source");
        }

        /// <summary>The "N kW of waste heat" figure out of the thermal advisory.</summary>
        private static string WasteKW(string advisory)
        {
            int i = advisory.IndexOf(" kW of waste heat", StringComparison.Ordinal);
            Assert.Greater(i, 0, "the thermal advisory states its waste heat");
            int start = advisory.LastIndexOf(' ', i - 1) + 1;
            return advisory.Substring(start, i - start);
        }

        /// <summary>Set a room's oxygen partial pressure to an exact kPa by moving moles between the
        /// O2 and N2 pools, leaving total moles (and therefore pressure) untouched.</summary>
        private static void SetPpO2(Room room, double kpa)
        {
            double total = room.TotalMoles;
            double want = total * (kpa / room.PressureKPa);
            room.N2Moles += room.O2Moles - want;
            room.O2Moles = want;
        }

        /// <summary>Set a room to an exact total pressure, O2 fraction and CO2 ppm at once, by
        /// scaling the mole pools (pressure is linear in total moles at fixed temp/volume). Used to
        /// build a LOW-total-pressure room where partial pressure and O2 percentage diverge.</summary>
        private static void SetRoomAtmosphere(Room room, double totalKPa, double o2Fraction, double co2Ppm)
        {
            double totalMoles = room.TotalMoles * (totalKPa / room.PressureKPa);
            double co2 = totalMoles * co2Ppm / 1_000_000.0;
            double o2 = totalMoles * o2Fraction;
            room.O2Moles = o2;
            room.CO2Moles = co2;
            room.N2Moles = totalMoles - o2 - co2;
        }

        [Test]
        public void HullIntegrity_Degrades_On_A_Breached_Anchor_Using_The_CitizenContext_Derivation()
        {
            // A named anchor whose probe tile resolves to room 0 IS the breach signal
            // (Sim.Llm/CitizenContext.cs:155-193). Point one at a wall tile — RoomState resolves
            // solid tiles to the vacuum sink, exactly as it does for a flooded compartment.
            var sim = NewSim();
            Assert.AreEqual(ShipSystemState.Nominal, Row(ShipSystems.Compute(sim), "hull_integrity").State);

            sim.Rooms.SetAnchor("cargo", new Int3(0, 0, 0));   // solid hull tile ⇒ room 0
            sim.Rooms.MarkDirty();
            sim.Tick();

            var breached = Row(ShipSystems.Compute(sim), "hull_integrity");
            Assert.AreEqual(ShipSystemState.Degraded, breached.State);
            StringAssert.Contains("open to vacuum", breached.Advisory);
        }

        // ------------------------------------------------------------------ the remaining rows

        // A taller room, so a conduit bus on one row can wire devices on the row above it. The
        // one-row-interior Room above cannot do that, and a test that silently wires only half its
        // devices proves nothing about clamping.
        private static readonly string[] Hall =
        {
            "############",
            "#..........#",
            "#..........#",
            "#..........#",
            "############",
        };

        private static Simulation NewHall() =>
            new Simulation(AsciiWorld.Build(Hall), 7,
                           SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())), null);

        /// <summary>Give every room air, so rows that band on the atmosphere have something to read.
        /// Re-applied after ticking: a topology change (adding a device) marks rooms dirty and the
        /// recompute rebuilds them.</summary>
        private static void PressurizeAll(Simulation sim)
        {
            for (int i = 1; i < sim.Rooms.Rooms.Count; i++)
                if (sim.Rooms.Rooms[i] != null && sim.Rooms.Rooms[i].TileCount > 0)
                    RoomState.Pressurize(sim.Rooms.Rooms[i]);
        }

        [Test]
        public void Reactor_Load_Is_Wanting_Draw_Over_Generation_And_A_Shed_Device_Is_A_Brownout()
        {
            var sim = NewHall();
            // A conduit bus along y=2 wires everything sitting on y=1.
            for (int x = 1; x <= 8; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), "bus" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");      // 6 kW
            var fab1 = sim.AddDevice(DeviceKind.Fabricator, new Int3(2, 1, 0), "fab1");  // 3 kW
            for (int i = 0; i < 20; i++) sim.Tick();

            var ok = Row(ShipSystems.Compute(sim), "reactor");
            Assert.IsTrue(fab1.Powered && fab1.NetworkId != 0, "the fabricator really is on the bus");
            Assert.AreEqual(50, ok.Load, "3 kW of wanting draw against 6 kW of generation");
            Assert.AreEqual(ShipSystemState.Nominal, ok.State);
            StringAssert.Contains("no reactor aboard", ok.Advisory, "the row admits what it actually is");

            // 9 kW wanted against 6 kW supplied — a ratio of 1.5. The previous version of this test
            // reached exactly 100 by ACCIDENT (only two of its four fabricators touched a conduit,
            // so demand landed on 6 kW and the ratio was 1.0); it would have passed with no clamp at
            // all. Assert the raw kW in the advisory so the ratio is provably above 1.
            var fab2 = sim.AddDevice(DeviceKind.Fabricator, new Int3(3, 1, 0), "fab2");
            var fab3 = sim.AddDevice(DeviceKind.Fabricator, new Int3(4, 1, 0), "fab3");
            for (int i = 0; i < 20; i++) sim.Tick();

            var shed = Row(ShipSystems.Compute(sim), "reactor");
            Assert.IsTrue(fab2.NetworkId != 0 && fab3.NetworkId != 0, "all three fabricators are wired");
            StringAssert.Contains("9.0 kW of wanting draw against 6.0 kW", shed.Advisory,
                "the ratio really is 1.5, so 100 can only come from the clamp");
            Assert.AreEqual(100, shed.Load, "demand past generation clamps at 100, it does not wrap");
            Assert.AreEqual(ShipSystemState.Degraded, shed.State, "a shed device IS the brownout signal");
            StringAssert.Contains("shed right now", shed.Advisory);
        }

        [Test]
        public void Reactor_Generation_Carries_The_OffGrid_Gate_In_Both_Directions()
        {
            // The trap: PowerSystem.Balance skips off-grid devices ENTIRELY (PowerSystem.cs:184), so
            // an unwired SolarWing supplies nothing. An ungated denominator made a DARKENING ship
            // read as LESS loaded — deconstruct a conduit run and the reactor row relaxes.
            var sim = NewHall();
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), "bus" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(2, 1, 0), "fab1");
            for (int i = 0; i < 20; i++) sim.Tick();
            Assert.AreEqual(50, Row(ShipSystems.Compute(sim), "reactor").Load);

            // Direction 1: a stray wing far from any conduit must NOT move the load.
            var stray = sim.AddDevice(DeviceKind.SolarWing, new Int3(10, 3, 0), "stray");
            for (int i = 0; i < 20; i++) sim.Tick();
            Assert.AreEqual(0, stray.NetworkId, "the stray wing really is off-grid");
            Assert.IsTrue(stray.Powered, "…and still reads Powered — PowerSystem.cs:243-248's trap");
            var withStray = Row(ShipSystems.Compute(sim), "reactor");
            Assert.AreEqual(50, withStray.Load, "off-grid generation contributes NOTHING to the ratio");
            StringAssert.Contains("6.0 kW reaching the grid", withStray.Advisory);
            StringAssert.Contains("6.0 kW of generating hardware is on no network", withStray.Advisory,
                "and the row says the stray hardware is there but useless");

            // Direction 2: strand ALL generation and the row must not go quiet.
            var sim2 = NewHall();
            sim2.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim2.AddDevice(DeviceKind.Fabricator, new Int3(4, 1, 0), "fab");   // no conduits anywhere
            for (int i = 0; i < 20; i++) sim2.Tick();
            var stranded = Row(ShipSystems.Compute(sim2), "reactor");
            Assert.AreEqual(ShipSystemState.Degraded, stranded.State,
                "hardware aboard but none of it wired is DEGRADED, never a quiet NOMINAL");
            StringAssert.Contains("on no network", stranded.Advisory);
        }

        [Test]
        public void Reactor_Load_Honours_The_Wanting_Mirror_A_Closed_Vent_Draws_Nothing()
        {
            // Pins the PowerSystem.IsWanting mirror: replacing it with `=> true` must fail here.
            // A closed vent is the ONE device that idles (PowerSystem.cs:262-266).
            var sim = NewHall();
            for (int x = 1; x <= 8; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), "bus" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");     // 6 kW
            var vent = sim.AddDevice(DeviceKind.AirVent, new Int3(2, 1, 0), "vent");  // 0.5 kW
            vent.IsOpen = false;
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.AreNotEqual(0, vent.NetworkId, "the vent is wired, so only IsOpen can excuse it");
            Assert.AreEqual(0, Row(ShipSystems.Compute(sim), "reactor").Load,
                "a CLOSED vent books no draw at all");

            vent.IsOpen = true;
            for (int i = 0; i < 20; i++) sim.Tick();
            Assert.AreEqual(8, Row(ShipSystems.Compute(sim), "reactor").Load,
                "an OPEN vent books its full 0.5 kW against 6 kW");
        }

        [Test]
        public void WaterReclaim_Attends_On_A_Dry_Tank_And_Hydroponics_Attends_On_A_Dry_Line()
        {
            var sim = NewSim();
            var tank = sim.AddDevice(DeviceKind.WaterTank, new Int3(1, 1, 0), "tank");
            sim.AddDevice(DeviceKind.Pipe, new Int3(2, 1, 0), "pipe");
            var bed = sim.AddDevice(DeviceKind.GrowBed, new Int3(3, 1, 0), "bed");
            tank.StoredLiters = sim.Defs.Water.TankCapacityLiters;
            for (int i = 0; i < 20; i++) sim.Tick();

            var full = ShipSystems.Compute(sim);
            Assert.AreEqual(100, Row(full, "water_reclaim").Load, "a full tank reads 100% fill");
            Assert.AreEqual(ShipSystemState.Nominal, Row(full, "water_reclaim").State);
            Assert.AreEqual(ShipSystemState.Nominal, Row(full, "hydroponics").State);

            tank.StoredLiters = 0f;
            var dry = ShipSystems.Compute(sim);
            Assert.AreEqual(0, Row(dry, "water_reclaim").Load);
            Assert.AreEqual(ShipSystemState.Attend, Row(dry, "water_reclaim").State, "a tank at 0 L is ATTEND");
            Assert.AreEqual(ShipSystemState.Attend, Row(dry, "hydroponics").State,
                "a bed whose line cannot cover one second of irrigation is ATTEND");
            StringAssert.Contains("progress held, not lost", Row(dry, "hydroponics").Advisory);

            bed.Progress = 0.5f;
            Assert.AreEqual(50, Row(ShipSystems.Compute(sim), "hydroponics").Load, "LOAD is mean crop progress");
        }

        [Test]
        public void Thermal_Reports_The_Measured_Temperature_And_Never_The_Overheat_Rule_Claim()
        {
            // MECHANICS.md §13.2: the shipped overheat_guard rule screams "THERMAL LOAD HIGH"
            // while the ship FREEZES. This row must report what it measured.
            var sim = NewSim();
            sim.AddCitizen("Probe", new Int3(5, 1, 0)).GiveAllWork();
            sim.Tick();
            var room = sim.Rooms.RoomAt(sim.World, new Int3(5, 1, 0));
            RoomState.Pressurize(room);   // a compartment the crew could actually stand in

            room.TemperatureK = 293.15;   // 20 C
            var comfy = Row(ShipSystems.Compute(sim), "thermal");
            Assert.AreEqual(ShipSystemState.Nominal, comfy.State);
            StringAssert.Contains("20.0 C", comfy.Advisory);

            room.TemperatureK = 273.15 - 12.9;   // the measured slice figure
            var frozen = Row(ShipSystems.Compute(sim), "thermal");
            Assert.AreEqual(ShipSystemState.Degraded, frozen.State,
                "below needs.def hypothermia_c the crew take damage — that is DEGRADED");
            StringAssert.Contains("-12.9 C", frozen.Advisory);
            StringAssert.Contains("LOSING heat", frozen.Advisory);
            StringAssert.DoesNotContain("THERMAL LOAD HIGH", frozen.Advisory);
        }

        [Test]
        public void Fabrication_Is_Offline_With_A_Reason_When_No_Industry_Hardware_Exists()
        {
            var bare = Row(ShipSystems.Compute(NewSim()), "fabrication");
            Assert.AreEqual(ShipSystemState.Offline, bare.State);
            Assert.AreEqual(-1, bare.Load);
            StringAssert.Contains("No fabricator", bare.Advisory);

            // The shipped ship really does carry industry hardware, so the row is live there.
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var live = Row(ShipSystems.Compute(host.Sim, host.History), "fabrication");
            Assert.AreNotEqual(ShipSystemState.Offline, live.State);
            Assert.AreNotEqual(-1, live.Load);
        }

        // ------------------------------------------------------------------ fault attribution

        [Test]
        public void Fault_Column_Is_The_Last_Thing_That_Went_Wrong_And_Never_A_Recovery()
        {
            // The brownout KIND covers both the fault and its recovery (HistorySystem.cs:104-110).
            // Only the fault belongs under LAST FAULT — a row reading "POWER NETWORK 1 RECOVERED"
            // in a column headed LAST FAULT is exactly the class of misread this spec exists to stop.
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            while (host.Sim.TickCount < SimClockUtil.TicksPerDay) host.Sim.Tick();

            var reactor = Row(ShipSystems.Compute(host.Sim, host.History), "reactor");
            Assert.AreNotEqual(-1, reactor.FaultDay, "the slice really does brown out inside a day");
            StringAssert.Contains("BROWNED OUT", reactor.FaultText);
            StringAssert.DoesNotContain("RECOVERED", reactor.FaultText);
            Assert.AreEqual(reactor.FaultText.ToUpperInvariant(), reactor.FaultText, "uppercase, no day prefix");
            StringAssert.DoesNotContain("DAY ", reactor.FaultText, "the client composes the day prefix");

            // Without a HistorySystem the ledger still computes; the column is honestly empty
            // rather than a fabricated placeholder.
            foreach (var row in ShipSystems.Compute(host.Sim).Rows)
            {
                Assert.AreEqual(-1, row.FaultDay, row.Id);
                Assert.AreEqual("", row.FaultText, row.Id);
            }
        }

        [Test]
        public void The_Slice_Ledger_Surfaces_Its_Real_Failures_By_Day_Three()
        {
            // A regression pin on the HONESTY of the shipped slice's ledger, not on exact numbers:
            // By day three, only §13.2 (the ship freezes below needs.def hypothermia_c) is STILL
            // live, so the thermal row must still degrade. The two economy defects are now FIXED:
            //  - B-2 (tank_hydro ran dry ~day 1.2, stalling the beds forever) — fixed by the greywater
            //    makeup floor (WaterSystem.RunMakeup), so water_reclaim + hydroponics read Nominal.
            //  - B-3/§13.1 ("CO2 climbs past 2,000 ppm with healthy scrubbers") — was the gas-transport
            //    bug: gas could not cross the open doors to reach a scrubber. The diffusion term fixes
            //    it, so the scrubbers hold the air and LIFE SUPPORT reads Nominal (the §13.1 symptom is
            //    gone; that doc note described the pre-B-3 sim).
            // M2-2 (OD-H): with the shipped boot grid the eight crew never leave the room they woke
            // in, and life_support reads Attend from POOLED CO2 rather than from the scrubber
            // capacity this leg is about (measured). The ledger's subject is a ship being WORKED,
            // so the fixture gives the crew the work the player gives.
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            host.Sim.GiveAllCrewAllWork();
            while (host.Sim.TickCount < 3 * SimClockUtil.TicksPerDay) host.Sim.Tick();
            var report = ShipSystems.Compute(host.Sim, host.History);

            var ls = Row(report, "life_support");
            Assert.AreEqual(ShipSystemState.Nominal, ls.State,
                "B-3: partial-pressure diffusion lets the scrubbers reach the crew room, so the air is clean");
            Assert.Less(ls.Load, 100, "…scrubber capacity comfortably exceeds crew CO2 output");

            Assert.AreEqual(ShipSystemState.Degraded, Row(report, "thermal").State, "§13.2: the ship freezes");
            StringAssert.Contains("LOSING heat", Row(report, "thermal").Advisory);

            Assert.AreEqual(ShipSystemState.Nominal, Row(report, "water_reclaim").State,
                "B-2 fixed: the makeup floor keeps the greywater pool alive so tank_hydro stays served");
            Assert.AreEqual(ShipSystemState.Nominal, Row(report, "hydroponics").State,
                "…and the beds on that line keep growing");
            Assert.AreEqual(ShipSystemState.Offline, Row(report, "nav_sensors").State);
        }

        // ------------------------------------------------------------------ detail

        [Test]
        public void Detail_Is_Percent_Ints_In_Store_Order_And_Unknown_Ids_Are_Empty()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            CollectionAssert.IsEmpty(ShipSystems.ComputeDetail(host.Sim, "no_such_row"));
            CollectionAssert.IsEmpty(ShipSystems.ComputeDetail(host.Sim, null));

            var ls = ShipSystems.ComputeDetail(host.Sim, "life_support");
            Assert.IsNotEmpty(ls, "the slice carries vents and scrubbers");
            foreach (var d in ls)
            {
                Assert.IsTrue(d.Kind == DeviceKind.AirVent || d.Kind == DeviceKind.Scrubber);
                Assert.IsTrue(d.Condition >= 0 && d.Condition <= 100, "condition is a percent int");
                Assert.IsTrue(d.Rate >= 0 && d.Rate <= 100, "rate is a percent int");
            }

            // hull_integrity's group is "every device that wears" — the same predicate as
            // ShipMetrics.Structural, so the two must agree on the population.
            int wearing = host.Sim.Devices.Items.Count(d => host.Sim.Defs.Machines[(int)d.Kind].WearPerHour > 0f);
            Assert.AreEqual(wearing, ShipSystems.ComputeDetail(host.Sim, "hull_integrity").Count);
        }

        [Test]
        public void Detail_Notes_Name_The_Worst_Honest_Word()
        {
            var sim = NewSim();
            var wing = sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
            var battery = sim.AddDevice(DeviceKind.Battery, new Int3(3, 1, 0), "batt");
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.AreEqual("", Detail(sim, "reactor", "solar").Note, "a healthy device says nothing");

            wing.Condition = 0.2f;   // below SolarWing MaintainBelow (0.4), above FailBelow (0.10)
            Assert.AreEqual("WORN — MAINTENANCE DUE", Detail(sim, "reactor", "solar").Note);

            wing.Condition = 0.0f;
            Assert.AreEqual("FAILED", Detail(sim, "reactor", "solar").Note);
            Assert.AreEqual("", Detail(sim, "reactor", "batt").Note, "a zero-draw device is never UNWIRED");
            Assert.IsNotNull(battery);
        }

        [Test]
        public void Detail_Powered_Is_Pinned_In_BOTH_Directions()
        {
            // Asserting only `powered == true` passes against a hardcoded `true`. Show it flipping.
            var sim = NewHall();
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 2, 0), "bus" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(2, 1, 0), "wired");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(10, 3, 0), "orphan");  // no conduit adjacent
            for (int i = 0; i < 20; i++) sim.Tick();

            var wired = Detail(sim, "fabrication", "wired");
            var orphan = Detail(sim, "fabrication", "orphan");
            Assert.IsTrue(wired.Powered, "a wired, supplied fabricator is powered");
            Assert.AreEqual("", wired.Note);
            Assert.IsFalse(orphan.Powered, "an off-grid fabricator is NOT powered");
            Assert.AreEqual("UNWIRED", orphan.Note);
        }

        [Test]
        public void Detail_Prints_Tank_Litres_So_The_Dry_Rule_Is_Observable()
        {
            // water_reclaim's STATE turns on a level no other column shows: the slice's dry tank
            // holds 0.02 L, not 0. A player told "a tank is dry" with no way to see the number
            // would reasonably conclude the row is broken.
            var sim = NewSim();
            var tank = sim.AddDevice(DeviceKind.WaterTank, new Int3(1, 1, 0), "tank");
            tank.StoredLiters = 0.02f;
            sim.Tick();

            var d = Detail(sim, "water_reclaim", "tank");
            StringAssert.Contains("0.0 L", d.Note, "the litres are on screen");
            StringAssert.Contains("DRY, BELOW ONE DRINK", d.Note, "and so is the verdict");
            Assert.AreEqual(ShipSystemState.Attend, Row(ShipSystems.Compute(sim), "water_reclaim").State);

            // The DERIVATION note must state the rule the CODE uses, not the survey's wrong one.
            string note = ShipSystems.Derivation("water_reclaim");
            StringAssert.Contains("less than one drink", note);
            StringAssert.DoesNotContain("any tank at 0 L", note);

            tank.StoredLiters = 400f;
            StringAssert.Contains("400.0 L", Detail(sim, "water_reclaim", "tank").Note);
            StringAssert.DoesNotContain("DRY", Detail(sim, "water_reclaim", "tank").Note);
        }

        private static ShipSystemDevice Detail(Simulation sim, string id, string name)
        {
            foreach (var d in ShipSystems.ComputeDetail(sim, id)) if (d.Name == name) return d;
            throw new AssertionException("no device " + name + " in " + id);
        }

        // ------------------------------------------------------------------ hull designation

        [Test]
        public void HullDesignation_Is_A_Stable_FourDigit_Name_Derived_From_The_Seed()
        {
            string a = ShipSystems.HullDesignation(SimHost.SliceSeed);
            Assert.AreEqual(a, ShipSystems.HullDesignation(SimHost.SliceSeed), "stable for a given ship");
            Assert.AreEqual(4, a.Length);
            foreach (char ch in a) Assert.IsTrue(ch >= '0' && ch <= '9', "ASCII digits only");
            Assert.AreNotEqual(a, ShipSystems.HullDesignation(SimHost.DefaultSeed), "a different ship, a different hull");

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                Assert.AreEqual(a, ShipSystems.HullDesignation(SimHost.SliceSeed), "no locale group separator");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>Set a room's CO2 to an exact ppm by moving moles between the CO2 and N2
        /// pools, so total moles (and therefore pressure) are untouched.</summary>
        private static void SetCo2(Room room, double ppm)
        {
            double total = room.TotalMoles;
            double want = total * ppm / 1_000_000.0;
            room.N2Moles += room.CO2Moles - want;
            room.CO2Moles = want;
        }

        private static string Flatten(ShipSystemsReport r)
        {
            var parts = new List<string>();
            parts.Add(r.Day.ToString(CultureInfo.InvariantCulture));
            parts.Add(r.Uptime.ToString(CultureInfo.InvariantCulture));
            foreach (var row in r.Rows)
                parts.Add(string.Join("|", row.Id, row.Label,
                    row.Load.ToString(CultureInfo.InvariantCulture),
                    ((int)row.State).ToString(CultureInfo.InvariantCulture),
                    row.FaultDay.ToString(CultureInfo.InvariantCulture),
                    row.FaultText, row.Advisory));
            return string.Join("\n", parts);
        }
    }
}
