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
    ///
    /// <para>⭐⭐ <b>D3 (2026-08-02) MOVED THIS FILE'S HEADLINE AND IT IS SAID HERE RATHER THAN
    /// LEFT IN THE LEGS.</b> <see cref="MaintenanceSystem.AutonomousRepairReserve"/> stops the
    /// STANDING RULE at the ship's last 4 loose units, so unattended recovery no longer clears the
    /// whole backlog — it clears <c>18 − 4 = 14</c> of it and hands the rest to the player.
    /// ⚠️ THIS ARITHMETIC READ <c>11 − 4 = 7</c> UNTIL D7 (2026-08-03), and it went stale for the
    /// reason a headline always does: D7 moved the ship's stock to 18 units and updated the
    /// matching leg (<see cref="Unattended_TheCoreIsLiftedDownToTheReserve_AndTheRestStayOrderable"/>'s
    /// non-vacuity assertion, 7 → 14) without moving the sentence that summarises it. The
    /// dispatcher sees ONE pile — <c>AuthoredConsumableUnits</c> is
    /// <c>MaintenanceSizedUnits + CabinStoresUnits</c> — so the autonomous spend-down doubled while
    /// D3's floor did not move. M1-I's
    /// question ("does the stock cover the backlog?") is unchanged and still answered YES; what
    /// changed is WHO spends the last four units. FOUR legs were restated in the same commit:
    /// <see cref="Unattended_TheCoreIsLiftedDownToTheReserve_AndTheRestStayOrderable"/>,
    /// <see cref="Unattended_AllThreeSolarWings_LeaveTheWreckedBandAndStayFixable"/>,
    /// <see cref="WithOnlyTheShippedThreeUnits_WingBIsStrandedUnattended"/> and — added at the
    /// review send-back — <see cref="TheFixIsNotGeneral_APressurisedFrontierStarvesWingB"/>, each
    /// carrying its own before/after note. ⚠️ The reserve's own instrument is
    /// <c>RepairReserveTests</c>; this file measures the SHIP, not the rule.</para>
    ///
    /// <para>⛔ <b>THE THREE-COUNTERPART ACCOUNTING ABOVE STILL HOLDS, AND IT WAS ONE SEND-BACK
    /// AWAY FROM NOT HOLDING.</b> Independent review measured that D3 had killed the FIRST of the
    /// three: the reserve strands <c>wing_b</c> whether or not the door is opened, so
    /// <see cref="TheFixIsNotGeneral_APressurisedFrontierStarvesWingB"/> passed with its own
    /// subject removed (<c>open: true</c> → <c>open: false</c>, still GREEN). It is now a TWO-CELL
    /// discriminator — identical ships, identical waits, the click the only difference — and its
    /// closed-door cell is the control that fails loudly if a future change ever swamps the
    /// frontier again. All three limits therefore still carry a live counterpart leg.</para>
    /// </summary>
    public class WreckRepairEconomyTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        // M2-2: OD-H boots every work type OFF, so the wreck's crew member takes no job until she
        // is given one. Every leg here is about the repair ECONOMY — what a servicing crew member
        // consumes and whether the stock lasts — so the fixture gives her the work the player would
        // on the WORK tab. The boot state itself is WorkTypeVetoTests' subject, not this file's.
        private static Simulation Boot() =>
            ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack()).GiveAllCrewAllWork();

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

        /// <summary>The units M1-I SIZED AGAINST THE BOARD: 1 Parts + 2 Seals in the reactor bay
        /// (shipped before M1-I) + 8 Seals in the cryo-bay damage-control locker. Equal to
        /// <see cref="WreckedMachinesOnTheBoardAtBoot"/> BY DESIGN, and that equality is M1-I's whole
        /// package — <see cref="TheAuthoredStock_MatchesTheBootBacklog_UnitForUnit"/>.</summary>
        private const int MaintenanceSizedUnits = 11;

        /// <summary>⭐ D7 (2026-08-03) — the <c>cabin stores</c>: SEVEN one-unit Parts crates on the
        /// cryo bay's bottom row, authored against <c>build.device_place_cost</c> so the player can
        /// place furniture at all, NOT against the maintenance board.
        ///
        /// <para>⚠️ <b>THE SIM CANNOT TELL THE TWO PILES APART AND THIS FILE MUST NOT PRETEND IT
        /// CAN.</b> Parts is <c>RepairConsumableTier(0)</c>, so autonomous maintenance spends the
        /// cabin stores FIRST and the D3 reserve — a floor on the ship's TOTAL loose units, all
        /// three rungs summed — can never protect them. The split below is a statement of AUTHORING
        /// INTENT, and it is kept as two constants only so that
        /// <see cref="TheAuthoredStock_MatchesTheBootBacklog_UnitForUnit"/> can still assert M1-I's
        /// derivation (board == maintenance-sized stock) instead of losing it inside a bigger
        /// total. Everything DRIVEN in this file measures the total.</para></summary>
        private const int CabinStoresUnits = 7;

        /// <summary>Total authored maintenance-consumable UNITS on the wreck — what every DRIVEN leg
        /// here spends down, because the dispatcher sees one pile.</summary>
        private const int AuthoredConsumableUnits = MaintenanceSizedUnits + CabinStoresUnits;

        /// <summary>What the ship shipped before M1-I, restated so the regression witness below
        /// cannot silently become a test of the current stock.</summary>
        private const int PreFixConsumableUnits = 3;

        /// <summary>The locker's tile, written out. Cryo-bay bottom-right, diagonally opposite the
        /// capsule the crew member wakes in.</summary>
        private static readonly Int3 LockerTile = new Int3(9, 6, 0);

        /// <summary>D7's seven <c>cabin stores</c> tiles, written out by hand for the same reason
        /// <see cref="LockerTile"/> is — the same row, inboard of the locker.</summary>
        private static readonly Int3[] CabinStoresTiles =
        {
            new Int3(2, 6, 0), new Int3(3, 6, 0), new Int3(4, 6, 0), new Int3(5, 6, 0),
            new Int3(6, 6, 0), new Int3(7, 6, 0), new Int3(8, 6, 0),
        };

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
        /// Implemented by deleting the cryo-bay stacks, identified by their TILES, not their labels
        /// — a label is prose and would make this control track a rename.
        /// <para>⚠️ D7: it must now clear the <c>cabin stores</c> row TOO. Deleting only the locker
        /// left 15 units on the deck and the "pre-fix stock is 3 units" precondition below caught it
        /// — which is exactly what that precondition is for.</para></summary>
        private static void RestoreThePreFixStock(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
            {
                if (it.Kind != ItemKind.Parts && it.Kind != ItemKind.Seals && it.Kind != ItemKind.Swarf) continue;
                bool inCryo = it.Pos == LockerTile;
                foreach (var tile in CabinStoresTiles) if (it.Pos == tile) inCryo = true;
                if (inCryo) doomed.Add(it.Id);
            }
            foreach (var id in doomed) sim.Items.Remove(id);
        }


        /// <summary>
        /// ⚠️⚠️ <b>D7 (2026-08-03) — THE WRECK ON ITS MAINTENANCE-SIZED STOCK, i.e. with the
        /// <c>cabin stores</c> stripped.</b> Those seven Parts are authored against
        /// <c>build.device_place_cost</c> so the player can place furniture at all, and the
        /// dispatcher cannot tell them from repair stock — so on the shipped ship the frontier leg
        /// below no longer strands <c>wing_b</c> at all (measured: 0.875, fixed). Its SUBJECT is
        /// M1-I's disclosed limit — <i>"one door click inserts three frontier machines that outrank
        /// wing_b"</i> — so it is driven on the stock that limit was derived against, and the cache
        /// is removed BY TILE (never by label; prose tracks renames).
        /// <para>⛔ That the shipped ship now passes where this fixture fails is a CONTENT
        /// CONSEQUENCE filed for the owner, not a defect settled here. Same treatment, same reason,
        /// as <c>ChronicleSignalTests.WreckInPowerDeficit</c>.</para>
        /// </summary>
        private static Simulation BootOnMaintenanceSizedStock()
        {
            var sim = Boot();
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
            {
                if (it.Kind != ItemKind.Parts) continue;
                foreach (var tile in CabinStoresTiles) if (it.Pos == tile) { doomed.Add(it.Id); break; }
            }
            foreach (uint id in doomed) sim.Items.Remove(id);
            return sim;
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
            // ⭐ D7 — M1-I's derivation, kept alive as an assertion rather than absorbed into the
            // bigger total. Subtracting the cabin stores by TILE is the only way to ask "is the
            // MAINTENANCE-sized stock still one unit per board machine?" on a ship where the
            // dispatcher sees one pile. If a future lane moves the cabin stores, this reads as a
            // stock change and says so — which is the review it is here to force.
            int outsideTheCabinStores = ConsumableUnits(sim);
            foreach (var it in sim.Items.Items)
                foreach (var tile in CabinStoresTiles)
                    if (it.Pos == tile && it.Kind == ItemKind.Parts) outsideTheCabinStores -= it.Count;
            Assert.That(outsideTheCabinStores, Is.EqualTo(WreckedMachinesOnTheBoardAtBoot),
                "M1-I's derivation is gone: the stock authored FOR THE BOARD is no longer one unit " +
                "per wrecked machine on it. (D7's cabin stores are excluded here by tile — they are " +
                "authored against build.device_place_cost, and the sim cannot tell the two piles " +
                "apart, which is why every DRIVEN leg below spends the total.)");
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
            // ⭐ D3 — THIS LINE READ `Is.Zero` UNTIL THE RESERVE LANDED. Three units is BELOW
            // `MaintenanceSystem.AutonomousRepairReserve`, so on the pre-M1-I ship the standing rule
            // now declines to spend anything at all and the pile is untouched. The leg's SUBJECT is
            // unchanged and if anything sharper: on that ship wing_b is stranded, and it is stranded
            // with the stock still on the deck for the player to spend by hand.
            Assert.That(ConsumableUnits(sim), Is.EqualTo(PreFixConsumableUnits),
                "at or below the reserve the standing rule spends NOTHING — the three units must " +
                "still be on the deck");
            Assert.That(wingB.Condition, Is.LessThan(WreckThreshold),
                "wing_b was expected to be stranded below the wreck floor on the pre-fix stock, " +
                "but it reads " + F(wingB.Condition));
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "wing_b was expected to be unfixable TO THE STANDING RULE on the pre-fix stock. " +
                "⚠️ D3 CHANGED WHICH FACT SATISFIES THIS: it used to be EXHAUSTION (all three units " +
                "spent), it is now the RESERVE (3 units is at or below AutonomousRepairReserve, so " +
                "the pile is untouched and autonomy may not spend it). 'PERMANENTLY' is no longer " +
                "the right word either — the player can still buy this repair by hand, which is " +
                "the whole point of the floor.");
        }

        /// <summary>
        /// ⭐ THE AFTER HALF, and the reason M1-I's locker exists — ⚠️ <b>RESTATED AT D3, BECAUSE
        /// THE PACKAGE THAT PUT A RESERVE ON AUTONOMOUS SPEND CHANGED WHAT THIS LEG IS ABLE TO
        /// CLAIM.</b> It read <i>"every machine that booted on the wrecked backlog is lifted clear
        /// of the floor"</i> and that is no longer true, ON PURPOSE.
        ///
        /// <para><b>THE OLD CLAIM AND WHY IT WENT.</b> Backlog 11 machines, stock 11 units, one
        /// unit per service — the ship recovered itself completely and unattended, and the demo
        /// then measured what that costs: with the work grid on, autonomy spends the ENTIRE pile in
        /// ~4 sim-hours and the run terminally stalls, because the three benches and the MOSS
        /// terminal on the player's critical path have nothing left to be repaired with
        /// (HANDOVER finding D3). <see cref="MaintenanceSystem.AutonomousRepairReserve"/> is the
        /// answer: the standing rule now stops at 4 units.</para>
        ///
        /// <para><b>THE POST-D3 CLAIM, AND IT IS THE STRONGER ONE.</b> Three things, driven:
        /// (1) autonomy spends exactly <c>11 − 4 = 7</c> units and stops ON the reserve;
        /// (2) at most <see cref="MaintenanceSystem.AutonomousRepairReserve"/> backlog machines are
        /// left below the floor — which is the WINNABILITY invariant, because each reserved unit
        /// buys exactly one service, so more offenders than units would be a ship the player cannot
        /// finish recovering; and (3) ⭐ every one of those offenders is still fixable BY ORDER
        /// (<c>IsUnfixableWreck(forced: true)</c> is false), which is the whole point of holding the
        /// units back rather than letting the pile go to zero.</para>
        ///
        /// <para>Offenders accumulate into one list and assert once, so a second offender is never
        /// hidden behind the first.</para>
        /// </summary>
        [Test]
        public void Unattended_TheCoreIsLiftedDownToTheReserve_AndTheRestStayOrderable()
        {
            var sim = Boot();
            var backlog = new List<string>();
            foreach (var d in BootBacklog(sim)) backlog.Add(d.Name);
            Assert.That(backlog.Count, Is.EqualTo(WreckedMachinesOnTheBoardAtBoot),
                "PRECONDITION: the boot backlog is not " + WreckedMachinesOnTheBoardAtBoot + " machines");

            Drive(sim, 6);

            var offenders = new List<string>();
            var unorderable = new List<string>();
            foreach (string name in backlog)
            {
                var d = ByName(sim, name);
                if (d.Condition >= WreckThreshold) continue;
                offenders.Add(name + " " + F(d.Condition));
                // ⭐ THE HALF THAT MATTERS: a machine autonomy declined must still be reachable by
                // the player's own order, or the reserve has bought nothing.
                if (MaintenanceSystem.IsUnfixableWreck(sim, d, forced: true)) unorderable.Add(name);
            }

            Assert.Multiple(() =>
            {
                Assert.That(ConsumableUnits(sim), Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve),
                    "autonomy must stop ON the reserve — spending past it is finding D3, leaving " +
                    "the critical path unbuyable; not reaching it means the stock or the backlog moved");
                Assert.That(AuthoredConsumableUnits - MaintenanceSystem.AutonomousRepairReserve,
                    Is.EqualTo(14), "NON-VACUITY: fourteen units really were spendable, so the run " +
                    "above did real work rather than declining everything. ⚠️ D7: this read SEVEN " +
                    "until the `cabin stores` cache authored seven more Parts — the dispatcher sees " +
                    "ONE pile, so the autonomous spend-down doubled. The leg's claim (autonomy stops " +
                    "ON the reserve, and the offenders it leaves are still orderable) is unchanged " +
                    "and still measured.");
                Assert.That(offenders.Count, Is.LessThanOrEqualTo(MaintenanceSystem.AutonomousRepairReserve),
                    "⛔ WINNABILITY: more machines left below the floor than there are reserved units " +
                    "to fix them with — the player cannot finish the recovery by hand. Offenders: " +
                    string.Join(", ", offenders));
                Assert.That(unorderable, Is.Empty,
                    "⛔ a machine the standing rule declined is ALSO refused to a direct order — the " +
                    "reserve would then be holding units nobody can spend, which is worse than the " +
                    "defect it was built to close");
            });
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

            // ⭐ D3 — THE QUESTION IS ASKED WITH `forced: true`, AND THAT IS THE CHANGE. The
            // standing rule now declines the ship's last `AutonomousRepairReserve` units, so a wing
            // MAY finish the unattended run below the floor — measured, `wing_b` does. What must
            // never happen is that it becomes unfixable to the PLAYER, and that is the reading this
            // leg pins. The un-forced answer is the dispatcher's ("I am not allowed to spend the
            // reserve"), not the ship's.
            var unorderable = new List<string>();
            var belowFloor = new List<string>();
            foreach (string name in new[] { WingA, WingB, WingC })
            {
                var d = ByName(sim, name);
                if (d.Condition < WreckThreshold) belowFloor.Add(name + " below floor at " + F(d.Condition));
                if (MaintenanceSystem.IsUnfixableWreck(sim, d, forced: true)) unorderable.Add(name + " UNFIXABLE");
            }

            // ⭐⭐ AND IT IS DRIVEN RATHER THAN ARGUED: the player orders the repair the standing
            // rule declined, and the wing comes back. Without this the assertions above are a claim
            // about a predicate; with it they are a claim about the ship.
            var stranded = ByName(sim, WingB);
            float before = stranded.Condition;
            sim.EnqueueCommand(new PrioritiseJobCommand((int)sim.Citizens.Items[0].Id, (int)stranded.Id));
            for (int t = 0; t < 14000 && stranded.Condition <= before; t++) sim.Tick();

            Assert.Multiple(() =>
            {
                Assert.That(unorderable, Is.Empty,
                    "⛔ the ship's power recovery is stranded — a wing no order can reach");
                Assert.That(stranded.Condition, Is.GreaterThan(WreckThreshold),
                    "⛔ THE OUTCOME: one direct order must lift the wing the standing rule left " +
                    "behind, spending a RESERVED unit. It reads " + F(stranded.Condition) +
                    " (it booted wrecked and ended the unattended run at " + F(before) + ").");
                Assert.That(belowFloor.Count, Is.LessThanOrEqualTo(1),
                    "at most ONE wing may be left for the player: the reserve is 4 units and the " +
                    "backlog is the whole core, so two stranded wings would mean the spend order " +
                    "changed. Saw: " + string.Join(", ", belowFloor));
            });
        }

        // ------------------------------------------- 4. the PLACEMENT decision, pinned where it is cheap

        /// <summary>
        /// The locker must survive long enough to be SPENT. Six unattended sim-hours is the whole
        /// window that matters — <see cref="Unattended_TheCoreIsLiftedDownToTheReserve_AndTheRestStayOrderable"/>
        /// measures the pile going from 11 units to 4 (D3: the reserve is what it stops on) — and this
        /// leg pins the tile still
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
        /// tick 0 and joins it only after ~10 sim-hours of wear, by which time the pile is down to the
        /// D3 reserve and the standing rule may spend no more of it (it USED to be gone; the
        /// outcome for this machine is identical and the reason is not). It
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
        /// command the shipped door verb enqueues, so this is the player's own gesture.
        /// ⭐ <b>AMENDED BY M3-15 (OD-N, 2026-07-31), AND THE AMENDMENT MAKES IT MORE FAITHFUL, NOT
        /// LESS.</b> The Room Zoom's click is deleted and the gesture is now a line typed at the MOSS
        /// console — which the player can only reach after REPAIRING <c>term_moss</c>. So the leg
        /// services the terminal first and then opens the door: that is the shipped order of events,
        /// and without the service <see cref="SetDoorStateCommand"/> refuses and this measurement
        /// silently becomes "a door that never opened".</para>
        /// </summary>
        [Test]
        public void TheFixIsNotGeneral_APressurisedFrontierStarvesWingB()
        {
            // ⛔ TWO CELLS, IDENTICAL IN EVERY RESPECT BUT THE CLICK, AND THAT IS THE FIX FOR THE
            // DEFECT DESCRIBED ABOVE. Each is built, topped up and waited out the same way; the
            // ONLY difference is the SetDoorStateCommand. Both results are recorded into locals and
            // asserted together, so neither leg can hide behind the other's throw (fifth shape).
            var closed = BootOnMaintenanceSizedStock();
            TopUpTheReserve(closed);
            WaitForTheConsole(closed, "CLOSED cell");
            Drive(closed, 6);
            float closedWingB = ByName(closed, WingB).Condition;

            var open = BootOnMaintenanceSizedStock();
            TopUpTheReserve(open);
            WaitForTheConsole(open, "OPEN cell");
            int opened = 0;
            foreach (var d in open.Devices.Items)
            {
                if (d.Kind != DeviceKind.Door || d.Pos != GoalCompartmentDoor) continue;
                open.EnqueueCommand(new SetDoorStateCommand(d.Id, open: true, locked: false));
                opened++;
            }
            Assert.That(opened, Is.EqualTo(1),
                "PRECONDITION: there is no deck-0 door at " + GoalCompartmentDoor + " — the goal " +
                "compartment's apron moved and the ONE CLICK this leg models no longer exists");
            Drive(open, 6);
            var openWingB = ByName(open, WingB);

            Assert.Multiple(() =>
            {
                Assert.That(closedWingB, Is.GreaterThan(WreckThreshold),
                    "⛔ THE DISCRIMINATOR'S OTHER HALF, AND WITHOUT IT THIS WHOLE LEG IS DEAD: with " +
                    "the frontier SHUT and a budget of 11 spendable units the queue must reach " +
                    "wing_b and lift it. It reads " + F(closedWingB) + ". If this fails, the " +
                    "assertion below is satisfied by something other than the door and proves " +
                    "nothing about the frontier.");
                Assert.That(openWingB.Condition, Is.LessThan(WreckThreshold),
                    "wing_b survived an early frontier opening. That is GOOD NEWS and a real change: " +
                    "re-measure the queue and rewrite this leg, do not delete it");
                Assert.That(MaintenanceSystem.IsUnfixableWreck(open, openWingB), Is.True,
                    "wing_b is below the floor but the STANDING RULE could still spend on it — the " +
                    "budget was not actually exhausted down to the reserve; re-measure");
            });
        }

        /// <summary>
        /// ⭐ D3 — ADD EXACTLY <see cref="MaintenanceSystem.AutonomousRepairReserve"/> UNITS, so the
        /// ship's SPENDABLE budget is the 11 this leg has always been measuring.
        ///
        /// <para><b>WHY THE LEG NEEDS IT.</b> The reserve holds 4 units back, so on the shipped
        /// stock wing_b ends below the floor whether the door is opened or not — the leg passed with
        /// its own subject removed, which independent review measured (<c>open: true</c> →
        /// <c>open: false</c>, <c>opened == 1</c> intact, still GREEN). Topping the pile up by the
        /// reserve restores the pre-D3 SPENDABLE budget without touching the rule, so the click is
        /// once again the only thing that can decide wing_b's fate. It is a fixture, not a claim
        /// about the shipped ship — the shipped ship's post-reserve behaviour is
        /// <see cref="Unattended_TheCoreIsLiftedDownToTheReserve_AndTheRestStayOrderable"/>'s
        /// subject.</para>
        /// </summary>
        private static void TopUpTheReserve(Simulation sim)
        {
            sim.AddItem(ItemKind.Seals, MaintenanceSystem.AutonomousRepairReserve, LockerTile);
            // ⚠️ D7: MaintenanceSizedUnits, not AuthoredConsumableUnits. Its only caller is the
            // frontier leg, which now runs on BootOnMaintenanceSizedStock() — the `cabin stores`
            // are stripped there, so the budget this helper tops up is M1-I's 11 + the reserve.
            Assert.That(ConsumableUnits(sim),
                Is.EqualTo(MaintenanceSizedUnits + MaintenanceSystem.AutonomousRepairReserve),
                "the top-up did not land — the spendable budget is not the 11 this leg measures");
        }

        /// <summary>
        /// ⭐ OD-N: THE CONSOLE MUST BE ALIVE BEFORE THE SHIP ANSWERS — AND THE CREW BRINGS IT UP,
        /// THIS TEST DOES NOT. Setting <c>term_moss.Condition</c> by hand was tried first and CHANGED
        /// THE MEASUREMENT: <c>term_moss</c> boots at 0.14, i.e. ON the maintenance board, so writing
        /// it healthy silently removes one job AND the consumable that job would have spent — and
        /// wing_b then survives for a reason that has nothing to do with the frontier. Driving the
        /// repair instead keeps the ship's own arithmetic intact and is what a player watches happen.
        /// (Measured: with the hand-write, wing_b ended at 0.883.)
        ///
        /// <para>⚠️ RUN ON BOTH CELLS, including the one that never opens a door. The wait TICKS THE
        /// SIM for up to four sim-hours and spends consumables while it does, so a cell that skipped
        /// it would differ from its twin in something other than the click.</para>
        /// </summary>
        private static void WaitForTheConsole(Simulation sim, string cell)
        {
            int wait = 0;
            while (!MossGate.IsServerLive(sim) && wait++ < 4 * TicksPerHour) sim.Tick();
            Assert.That(MossGate.IsServerLive(sim), Is.True,
                "PRECONDITION (" + cell + "): four sim-hours and the crew never brought term_moss " +
                "above its `maintain` floor, so the door command is REFUSED and this leg would " +
                "measure a compartment that never opened rather than one that opened too early");
        }
    }
}
