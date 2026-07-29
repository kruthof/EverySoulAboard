using System;
using System.Collections.Generic;
using System.Globalization;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// M1-I — <b>the wreck's repair economy must not soft-lock.</b> Owner decision 2026-07-29
    /// (roadmap `perilune-roadmap-q3.packages.md` §3.5 item 6 / M2-12, option <b>(a)</b>: author
    /// more consumables). Subject: <c>AuthoredShips.PeriluneWreck()</c>'s opening stock and
    /// <see cref="MaintenanceSystem.IsUnfixableWreck"/>.
    ///
    /// <para><b>THE DEFECT, MEASURED BEFORE THE FIX.</b> The wreck shipped 1 Parts + 2 Seals.
    /// <c>MaintenanceSystem.RecruitForNeediest</c> serves the strictly lowest-Condition machine a
    /// worker can stand beside and breathe, so those three units were spent — unattended, with no
    /// player input at all — at sim-hours 0.26 / 0.51 / 0.76, on <c>wing_c</c>, <c>battery_2</c> and
    /// a LAMP. From h0.76 onward <see cref="MaintenanceSystem.IsUnfixableWreck"/> was permanently
    /// and silently true for <c>wing_b</c>, both core scrubbers, <c>term_moss</c>, both remaining
    /// batteries and the water tank. ⇒ <b>the soft-lock was the DEFAULT OUTCOME, not a mistake the
    /// player had to make.</b></para>
    ///
    /// <para>⚠️ <b>EVERY NUMBER HERE IS WRITTEN OUT BY HAND AND NEVER READ FROM THE
    /// <see cref="AuthoredShips"/> LITERAL IT CHECKS</b>, for the reason
    /// <see cref="WreckShipTests"/>'s header gives: a test that derives its expectation from the
    /// constant under test cannot fail when that constant changes. These literals ARE the pin.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS ITS OWN <c>[Test]</c>.</b> <c>Assert</c> throws, so only the first
    /// failing leg of a multi-leg test ever reports and a leg that cannot bite is indistinguishable
    /// from one that can (CLAUDE.md, the fifth trap shape). The two legs that loop accumulate
    /// offenders into a list and assert ONCE.</para>
    ///
    /// <para>⚠️ <b>THE FIXTURE HAZARD THIS FILE IS BUILT AROUND</b> (roadmap M2-9 mutation 3): on
    /// the shipped ship <see cref="MaintenanceSystem.IsUnfixableWreck"/> returns <b>false</b> for
    /// everything, because Parts/Seals are aboard. Any leg that does not first establish the
    /// predicate's value is vacuous — it would pass with the rule deleted.
    /// <see cref="ThePredicate_Bites_WhenTheStockIsRemoved"/> is the non-vacuity-by-INCLUSION
    /// control: it plants the violation and requires it caught.</para>
    ///
    /// <para>⛔ <b>WHAT THIS FILE DELIBERATELY DOES NOT CLAIM.</b> It does not claim the soft-lock is
    /// impossible. It is not, and <b>all three disclosed limits carry their own counterpart leg</b>
    /// so no reader can take the green legs as a guarantee:
    /// <see cref="TheFixIsNotGeneral_APressurisedFrontierStarvesWingB"/> (one door click still
    /// strands <c>wing_b</c>), <see cref="KnownLimit_TankReserve_IsStillStrandedAndThatIsDeliberate"/>
    /// and <see cref="KnownLimit_TheSwarfRungIsZeroSum_OneUnitPerStrippedWreck"/>. ⚠️ Review found
    /// the first draft had pinned only the first of the three, so the file read as
    /// <i>"every wrecked machine in the core is lifted"</i> with nothing to the contrary.</para>
    /// </summary>
    public class WreckRepairEconomyTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot() => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        // -------------------------------------------------------------- the hand-written pins

        /// <summary>The wreck floor, restated by hand. This ship is authored AGAINST it, so reading
        /// it from <see cref="SimDefs"/> here would track a def change instead of catching one.</summary>
        private const float WreckThreshold = 0.25f;

        /// <summary>⭐ THE DERIVED NUMBER. Wrecked machines ON THE MAINTENANCE BOARD at tick 0 in
        /// the boot-breathable core: 16 devices boot below the floor in air, minus the 4 CryoPods
        /// (<c>MaintainBelow</c> 0.00 — never recruited, so a unit can never be spent on one), minus
        /// <c>tank_reserve</c> (0.21, above its own WaterTank <c>maint</c> of 0.20, so not yet on the
        /// board). Each needs exactly ONE unit; a service consumes exactly one.</summary>
        private const int WreckedMachinesOnTheBoardAtBoot = 11;

        /// <summary>Total authored maintenance-consumable UNITS on the wreck: 1 Parts + 2 Seals in
        /// the reactor bay (shipped before M1-I) + 8 Seals in the cryo-bay damage-control locker.
        /// Equal to <see cref="WreckedMachinesOnTheBoardAtBoot"/> BY DESIGN, and that equality is
        /// the whole package — <see cref="TheAuthoredStock_MatchesTheBootBacklog_UnitForUnit"/>.</summary>
        private const int AuthoredConsumableUnits = 11;

        /// <summary>What the ship shipped before M1-I, restated so the regression witness below
        /// cannot silently become a test of the current stock.</summary>
        private const int PreFixConsumableUnits = 3;

        /// <summary>The locker's tile, written out. Cryo-bay bottom-right, diagonally opposite the
        /// capsule the crew member wakes in.</summary>
        private static readonly Int3 LockerTile = new Int3(9, 6, 0);

        /// <summary>The door on <c>hall_d0_s1</c>'s spine-side apron — the compartment this ship's
        /// own <c>GoalSpec</c> names. Written out by hand rather than searched for, so that a leg
        /// claiming to model ONE CLICK cannot quietly grow to two.</summary>
        private static readonly Int3 GoalCompartmentDoor = new Int3(16, 7, 0);

        private const string WingA = "wing_a";
        private const string WingB = "wing_b";
        private const string WingC = "wing_c";

        private const int TicksPerHour = 3600 * Simulation.TicksPerSecond;

        // ------------------------------------------------------------------------- helpers

        private static Device ByName(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail("no device named '" + name + "' on the wreck");
            return null;
        }

        /// <summary>Every device that is below the wreck floor, in breathable air, and actually on
        /// the maintenance board (<c>Condition &lt; MaintainBelow</c>) — i.e. the machines a
        /// consumable can be spent on at tick 0. Derived from the BUILT ship on purpose: the
        /// membership is the subject, the COUNT is the hand-written pin.</summary>
        private static List<Device> BootBacklog(Simulation sim)
        {
            var list = new List<Device>();
            foreach (var d in sim.Devices.Items)
            {
                if (d.Condition >= WreckThreshold) continue;
                if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                if (!AtmosphereSafety.IsBreathable(sim, d.Pos)) continue;
                list.Add(d);
            }
            return list;
        }

        private static int ConsumableUnits(Simulation sim)
        {
            int n = 0;
            foreach (var it in sim.Items.Items)
                if (it.Kind == ItemKind.Parts || it.Kind == ItemKind.Seals || it.Kind == ItemKind.Swarf)
                    n += it.Count;
            return n;
        }

        /// <summary>Strip the ship of every maintenance consumable. Used to plant the violation.</summary>
        private static void RemoveAllConsumables(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
                if (it.Kind == ItemKind.Parts || it.Kind == ItemKind.Seals || it.Kind == ItemKind.Swarf)
                    doomed.Add(it.Id);
            foreach (var id in doomed) sim.Items.Remove(id);
        }

        /// <summary>Reduce the ship to the pre-M1-I stock: 1 Parts + 2 Seals, in the reactor bay.
        /// Implemented by deleting the cryo-bay locker stack, identified by its TILE, not its label
        /// — a label is prose and would make this control track a rename.</summary>
        private static void RestoreThePreFixStock(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
                if (it.Pos == LockerTile &&
                    (it.Kind == ItemKind.Parts || it.Kind == ItemKind.Seals || it.Kind == ItemKind.Swarf))
                    doomed.Add(it.Id);
            foreach (var id in doomed) sim.Items.Remove(id);
        }

        private static void Drive(Simulation sim, int simHours)
        {
            long ticks = (long)simHours * TicksPerHour;
            for (long t = 0; t < ticks; t++) sim.Tick();
        }

        private static string F(float v) => v.ToString("0.000", CultureInfo.InvariantCulture);

        // ------------------------------------------------------- 1. the derivation, pinned

        /// <summary>
        /// ⭐ THE DERIVATION, AS AN ASSERTION. The authored stock is one unit per wrecked machine on
        /// the board at boot. If a future lane authors another wrecked machine into the survivable
        /// core, or takes one away, this fails and the number above must be re-derived — which is
        /// exactly the review this package wants to force.
        ///
        /// <para>⚠️ A THIRD ASSERTION WAS REMOVED FROM THIS TEST AFTER REVIEW:
        /// <c>Assert.That(AuthoredConsumableUnits, Is.EqualTo(WreckedMachinesOnTheBoardAtBoot))</c>
        /// compared two <c>const int</c>s — <c>11 == 11</c>, decided by the compiler, unable to fail
        /// at runtime whatever the ship does. It read like the load-bearing line and was the only
        /// one that could not bite. The equality it claimed to pin is the CONJUNCTION of the two
        /// assertions below, each measured against the BUILT ship: backlog == 11 and stock == 11.
        /// Deleted rather than repaired, because a repaired version would assert nothing the two
        /// live lines do not already assert.</para>
        /// </summary>
        [Test]
        public void TheAuthoredStock_MatchesTheBootBacklog_UnitForUnit()
        {
            var sim = Boot();
            Assert.That(BootBacklog(sim).Count, Is.EqualTo(WreckedMachinesOnTheBoardAtBoot),
                "the wreck's boot backlog moved — re-derive the authored consumable count in " +
                "AuthoredShips.PeriluneWreck's damage-control locker block");
            Assert.That(ConsumableUnits(sim), Is.EqualTo(AuthoredConsumableUnits),
                "the authored consumable stock moved");
        }

        /// <summary>The locker exists, is where the header says it is, and is FETCHABLE at boot —
        /// <c>MachineWearSystem.FindNearest</c> refuses any stack whose own tile fails
        /// <see cref="WorksiteSafety.CanStageWorkerAt"/>, so an unstageable tile is a locker that
        /// does not exist.</summary>
        [Test]
        public void TheLockerTile_IsStageableAndCarriesEightSeals()
        {
            var sim = Boot();
            int seals = 0;
            foreach (var it in sim.Items.Items)
                if (it.Pos == LockerTile && it.Kind == ItemKind.Seals) seals += it.Count;
            Assert.That(seals, Is.EqualTo(8), "the damage-control locker is not 8 Seals at " + LockerTile);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, LockerTile), Is.True,
                "the locker tile is not stageable, so FindNearest can never see the stack");
        }

        // ---------------------------------------- 2. non-vacuity by INCLUSION: plant the violation

        /// <summary>
        /// ⭐ THE NON-VACUITY CONTROL, and every other leg in this file depends on it. On the
        /// shipped ship <see cref="MaintenanceSystem.IsUnfixableWreck"/> is FALSE for every device,
        /// because consumables are aboard — so a leg that only asserts "false" proves nothing and
        /// would pass with the rule deleted. This plants the violation (remove the stock) and
        /// requires the predicate to catch it.
        /// </summary>
        [Test]
        public void ThePredicate_Bites_WhenTheStockIsRemoved()
        {
            var sim = Boot();
            var wingB = ByName(sim, WingB);
            Assert.That(wingB.Condition, Is.LessThan(WreckThreshold),
                "wing_b is no longer authored below the wreck floor — this whole file is about a " +
                "machine that boots below it");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.False,
                "PRECONDITION: with the authored stock aboard nothing is unfixable");

            RemoveAllConsumables(sim);
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "with every Parts/Seals/Swarf stack gone, a machine below the wreck floor MUST be " +
                "unfixable — if this is false the rule under test is inert and every other leg here " +
                "is vacuous");
        }

        // ------------------------------------------------- 3. the property, DRIVEN, before/after

        /// <summary>
        /// ⛔ THE REGRESSION WITNESS — the BEFORE half of the acceptance statement, kept in the
        /// suite so the defect cannot quietly return. With the ship reduced to the three units it
        /// shipped before M1-I, six unattended sim-hours leave <c>wing_b</c> below the wreck floor
        /// AND unfixable, with no player input at all.
        ///
        /// <para>⚠️ THIS LEG ASSERTS A BAD OUTCOME ON A HYPOTHETICAL SHIP, ON PURPOSE. It will go
        /// red if someone implements option (b) (a free jury-rig below the floor for generation
        /// devices) or moves <c>wear.wreck_threshold</c>. That is the correct behaviour: those are
        /// different answers to the same owner decision and they must be taken deliberately, not
        /// arrive as a side effect.</para>
        /// </summary>
        [Test]
        public void WithOnlyTheShippedThreeUnits_WingBIsStrandedUnattended()
        {
            var sim = Boot();
            RestoreThePreFixStock(sim);
            Assert.That(ConsumableUnits(sim), Is.EqualTo(PreFixConsumableUnits),
                "the pre-fix stock is not 3 units — the control is measuring the wrong ship");

            Drive(sim, 6);

            var wingB = ByName(sim, WingB);
            Assert.That(ConsumableUnits(sim), Is.Zero, "the three units were not all spent");
            Assert.That(wingB.Condition, Is.LessThan(WreckThreshold),
                "wing_b was expected to be stranded below the wreck floor on the pre-fix stock, " +
                "but it reads " + F(wingB.Condition));
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "wing_b was expected to be PERMANENTLY unfixable on the pre-fix stock");
        }

        /// <summary>
        /// ⭐ THE AFTER HALF, and the reason this package exists. Six unattended sim-hours on the
        /// SHIPPED wreck: every machine that booted on the wrecked backlog is lifted clear of the
        /// floor. Offenders accumulate into one list and assert once, so a second offender is never
        /// hidden behind the first.
        /// </summary>
        [Test]
        public void Unattended_EveryWreckedMachineInTheCoreIsLiftedClearOfTheFloor()
        {
            var sim = Boot();
            var backlog = new List<string>();
            foreach (var d in BootBacklog(sim)) backlog.Add(d.Name);
            Assert.That(backlog.Count, Is.EqualTo(WreckedMachinesOnTheBoardAtBoot),
                "PRECONDITION: the boot backlog is not " + WreckedMachinesOnTheBoardAtBoot + " machines");

            Drive(sim, 6);

            var offenders = new List<string>();
            foreach (string name in backlog)
            {
                var d = ByName(sim, name);
                if (d.Condition < WreckThreshold) offenders.Add(name + " " + F(d.Condition));
            }
            Assert.That(offenders, Is.Empty,
                "these machines booted on the wrecked backlog and are STILL below the wreck floor " +
                "after six unattended sim-hours — the authored stock no longer covers the backlog");
        }

        /// <summary>
        /// ⭐ THE POWER RECOVERY, named on its own because it is the property the owner asked for.
        /// All three SolarWings end the unattended run clear of the floor and NOT unfixable — and
        /// for a <c>maint</c> 0.40 kind that lift is permanent in the sense that matters: such a
        /// machine falls back only to 0.40, which is above the 0.25 floor, so the free jury-rig band
        /// can ALWAYS catch it. Verified to 200 unattended sim-hours.
        ///
        /// <para>⚠️ PERMANENTLY RECOVERABLE IS NOT PERMANENTLY FREE, and an earlier draft of this
        /// comment conflated the two. <c>MachineWearSystem.cs:399-431</c> fetches a consumable
        /// BEFORE it will consider a free jury-rig; Condition only gates whether Swarf is offered.
        /// The 0.600 rigs seen on this ship happen because the pile is empty from h2.79.</para>
        /// </summary>
        [Test]
        public void Unattended_AllThreeSolarWings_LeaveTheWreckedBandAndStayFixable()
        {
            var sim = Boot();
            Assert.That(ByName(sim, WingB).Condition, Is.LessThan(WreckThreshold), "PRECONDITION: wing_b boots wrecked");
            Assert.That(ByName(sim, WingC).Condition, Is.LessThan(WreckThreshold), "PRECONDITION: wing_c boots wrecked");

            Drive(sim, 6);

            var offenders = new List<string>();
            foreach (string name in new[] { WingA, WingB, WingC })
            {
                var d = ByName(sim, name);
                if (d.Condition < WreckThreshold) offenders.Add(name + " below floor at " + F(d.Condition));
                if (MaintenanceSystem.IsUnfixableWreck(sim, d)) offenders.Add(name + " UNFIXABLE");
            }
            Assert.That(offenders, Is.Empty, "the ship's power recovery is stranded");
        }

        // ------------------------------------------- 4. the PLACEMENT decision, pinned where it is cheap

        /// <summary>
        /// The locker must survive long enough to be SPENT. Six unattended sim-hours is the whole
        /// window that matters — <see cref="Unattended_EveryWreckedMachineInTheCoreIsLiftedClearOfTheFloor"/>
        /// measures the pile going from 11 units to 0 by h2.79 — and this leg pins the tile still
        /// being stageable at the end of it, because <c>MachineWearSystem.FindNearest</c> refuses a
        /// stack whose own tile fails <see cref="WorksiteSafety.CanStageWorkerAt"/>.
        ///
        /// <para>⚠️ THE LONG-HORIZON VERSION OF THIS GUARD WAS WRITTEN, RUN, AND DELETED, AND THE
        /// REASON IS WORTH MORE THAN THE TEST. It drove seven sim-days and required the REJECTED
        /// spine tile to have gone unstageable — a non-vacuity-by-inclusion for the placement. It
        /// went RED, and it was RIGHT to: on this tree the spine reads +6.1 °C at sim-day 6, not the
        /// −9.2 °C the <c>AuthoredShips</c> header's driven table records, because THIS PACKAGE'S
        /// OWN EXTRA CONSUMABLES bring inoperative machines back above their <c>fail</c> and their
        /// waste heat with them. The thermal justification for the placement was therefore false,
        /// is retracted in the header block beside the locker, and the long test is gone because it
        /// cost 2 m 45 s of the gate to pin a reason that no longer holds. What remains true and
        /// measured over 12 sim-days: the cryo bay is FLAT at 10.0 °C, the spine crosses
        /// <c>hypothermia_c = -10</c> at about sim-day 16, and the reactor bay follows it.</para>
        /// </summary>
        [Test]
        public void TheLockerTile_IsStillStageableAfterTheWholePileIsSpent()
        {
            var sim = Boot();
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, LockerTile), Is.True,
                "PRECONDITION: the locker tile is stageable at boot");
            Drive(sim, 6);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, LockerTile), Is.True,
                "the locker tile stopped being stageable inside the window the pile is spent in — " +
                "FindNearest would have hidden the stack and the fix would be silently inert");
        }

        // ------------------------------------- 5. the DISCLOSED limits, each with a counterpart leg

        /// <summary>
        /// ⛔ KNOWN LIMIT 1, PINNED so this file cannot read as "every wrecked machine in the core is
        /// lifted" with nothing to the contrary. <c>tank_reserve</c> boots at 0.21 — BELOW the wreck
        /// floor but ABOVE its own WaterTank <c>maint</c> of 0.20 — so it is not on the board at
        /// tick 0 and joins it only after ~10 sim-hours of wear, by which time the pile is gone. It
        /// ends the unattended run permanently unfixable, and that is a DECISION, not an oversight:
        /// covering it costs ~4 more units and buys nothing durable, because a <c>maint</c> 0.20 kind
        /// has an EMPTY free jury-rig band <c>[0.25, 0.20)</c> and needs a consumable every cycle for
        /// ever. Sixteen Lights and two Terminals on this ship are in the same class.
        ///
        /// <para>If this ever goes green, either the stock grew or a def moved — both are decisions
        /// someone must take deliberately, which is why the limit is a test and not a comment.</para>
        /// </summary>
        [Test]
        public void KnownLimit_TankReserve_IsStillStrandedAndThatIsDeliberate()
        {
            var sim = Boot();
            var tank = ByName(sim, "tank_reserve");
            Assert.That(tank.Condition, Is.LessThan(WreckThreshold),
                "PRECONDITION: tank_reserve no longer boots below the wreck floor");
            Assert.That(tank.Condition, Is.GreaterThanOrEqualTo(
                    sim.Defs.Machines[(int)DeviceKind.WaterTank].MaintainBelow),
                "PRECONDITION: tank_reserve is now ON the board at boot, so it would be covered by " +
                "the authored stock and this limit no longer exists — re-derive the count");

            Drive(sim, 12);

            Assert.That(tank.Condition, Is.LessThan(WreckThreshold),
                "tank_reserve came back above the wreck floor — the disclosed limit is gone; " +
                "update the KNOWN LIMITS block in AuthoredShips rather than deleting this test");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, tank), Is.True,
                "tank_reserve is below the floor but fixable — a consumable survived 12 sim-hours");
        }

        /// <summary>
        /// ⛔ KNOWN LIMIT 3, pinned at its ARITHMETIC ROOT rather than by re-driving the 3-sim-day
        /// cannibalisation leg (which costs ~75 s of the gate to re-derive a number this one line
        /// decides). The claim is that the Swarf rung is ZERO-SUM inside the core: a stripped wrecked
        /// device pays exactly one unit and a service consumes exactly one, so a repair always costs
        /// the machine that funded it. The consumption side is <c>consumable.Count--</c>; the yield
        /// side is this. Raise <c>deconstruct.device_swarf</c> and the claim becomes false — this is
        /// what catches that.
        /// </summary>
        [Test]
        public void KnownLimit_TheSwarfRungIsZeroSum_OneUnitPerStrippedWreck()
        {
            Assert.That(DeconstructSystem.WreckYield(SimDefs.Default), Is.EqualTo(1),
                "deconstruct.device_swarf moved: stripping a wrecked device no longer pays exactly " +
                "one unit, so the 'Swarf is zero-sum inside the core' claim in AuthoredShips' " +
                "KNOWN LIMITS block needs re-deriving");
        }

        // ------------------------------------------------ 6. the limit, measured and pinned as one

        /// <summary>
        /// ⛔ THE LIMIT OF OPTION (a), DRIVEN AND PINNED SO NOBODY READS THIS FILE AS A GUARANTEE.
        /// <c>RecruitForNeediest</c>'s queue is GLOBAL and cannot be steered until the work-priority
        /// grid lands (M2). Open <b>ONE door</b> — <c>(16,7,0)</c>, the compartment this ship's own
        /// <c>GoalSpec</c> points at ("Get the workshop breathing again") — at tick 0, and THREE
        /// frontier machines (<c>light_d0_s1</c> 0.040 · <c>recycler_1</c> 0.090 ·
        /// <c>machineshop_1</c> 0.130) insert themselves ahead of <c>wing_b</c> (0.18). The stock is
        /// exhausted before the queue reaches it and wing_b is stranded again.
        ///
        /// <para>⚠️ THIS LEG USED TO OPEN TWO DOORS — the whole <c>x∈[12,21]</c> column, which also
        /// takes slot 5 across the spine — and the write-up called it "the door the GoalSpec names".
        /// Independent review measured the difference: the fourth machine in the old list
        /// (<c>light_d0_s5</c> 0.060) is behind the OTHER door. Narrowed to the single goal door
        /// because that is the ONE CLICK the claim describes, and it is measured sufficient:
        /// wing_b ends at 0.148, below the floor and unfixable. The stronger two-door case is
        /// therefore not needed to make the point.</para>
        ///
        /// <para>⇒ <b>The authored quantity removes the soft-lock as the DEFAULT OUTCOME. It does
        /// not — and no authored quantity can — remove it in general.</b> Covering every
        /// single-compartment opening needs about twenty-two units, which would auto-repair the
        /// whole deck-0 frontier and delete the salvage game. The general fix is the priority grid.</para>
        ///
        /// <para>If this leg ever goes GREEN, something has changed the arbitration — read it as
        /// news, not as a stale test.</para>
        ///
        /// <para>The scenario is FAITHFUL, not a stand-in: <see cref="SetDoorStateCommand"/> is the
        /// command the shipped OPERATE verb enqueues (<c>hosts/web/GameSession.cs:1074</c>, the only
        /// route from a standard surface to a door toggle), so this is the player's own click.</para>
        /// </summary>
        [Test]
        public void TheFixIsNotGeneral_APressurisedFrontierStarvesWingB()
        {
            var sim = Boot();
            int opened = 0;
            foreach (var d in sim.Devices.Items)
            {
                if (d.Kind != DeviceKind.Door || d.Pos != GoalCompartmentDoor) continue;
                sim.EnqueueCommand(new SetDoorStateCommand(d.Id, open: true, locked: false));
                opened++;
            }
            Assert.That(opened, Is.EqualTo(1),
                "PRECONDITION: there is no deck-0 door at " + GoalCompartmentDoor + " — the goal " +
                "compartment's apron moved and the ONE CLICK this leg models no longer exists");

            Drive(sim, 6);

            var wingB = ByName(sim, WingB);
            Assert.That(wingB.Condition, Is.LessThan(WreckThreshold),
                "wing_b survived an early frontier opening. That is GOOD NEWS and a real change: " +
                "re-measure the queue and rewrite this leg, do not delete it");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "wing_b is below the floor but still fixable — some consumable survived; re-measure");
        }
    }
}
