using System.Collections.Generic;
using System.Linq;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M2-9 — THE DIRECT ORDER: <i>"that machine, now."</i></b> The player points at one
    /// broken machine, names one crew member, and she goes and stays. <c>PrioritiseJobCommand</c> is
    /// the sim verb; <c>GameSession.HandlePrioritise</c> is the wire bridge (the right-click that
    /// sends it is M2-10's package).
    ///
    /// <para>⭐ <b>THE DESIGN DECISION THIS PACKAGE TOOK, AND ITS AUTHORITY.</b> An explicit order
    /// <b>OVERRIDES the work grid</b> and overrides nothing else.
    /// <c>docs/design/rimworld-reference.md</c> §2.2, source-grade half, reading
    /// <c>Pawn_JobTracker.cs:112-120</c>: <i>"incapability wins even over a player order; a player's
    /// own priority-0 setting does not."</i> §2.2's other paragraph — *"it does NOT override disabled
    /// or incapable"* — is about <c>PawnCanUseWorkGiver</c>, which tests <c>WorkTypeIsDisabled</c>
    /// (incapability) and NOT <c>GetPriority(w) == 0</c>, and that file marks the looser wiki wording
    /// <b>UNVERIFIED</b> with an explicit instruction not to encode it. So the two boundaries are
    /// pinned separately here: <see cref="AnIncapableCrewMemberIsRefused_ThoughTheOrderOverridesTheGrid"/>
    /// and <see cref="TheOrderNeverOverridesTheStagingRule_AWalledInMachineIsRefused"/>.</para>
    ///
    /// <para>⚠️ <b>UNDER OD-H THE OVERRIDE IS THE DEFAULT CASE, NOT AN EDGE CASE.</b> Every work type
    /// boots OFF on every ship, so <see cref="TheOrder_OverridesAGridWithRepairOff"/>'s fixture is
    /// the BOOT fixture. A no-override answer would have refused the player's very first right-click
    /// and dead-ended OD-G's opening beat anywhere outside the WORK tab. The ENABLED case is run as
    /// its own control (<see cref="WithRepairEnabled_TheOrderStillOutranksTheNeedierMachine"/>) so
    /// "it works when the grid is off" cannot be a claim about a fixture rather than about the
    /// verb.</para>
    ///
    /// <para><b>NO SAVED STATE WAS ADDED.</b> The held job IS the order (§2.2 keeps the forced flag
    /// on <c>curJob</c>); the host's pending-order record is transient render scratch. The pins are
    /// therefore untouched — a command nobody sends changes nothing.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND MEASURED — RE-MEASURED IN FULL AFTER
    /// THE FIX-BACK (2026-07-30).</b> Each row was edited into the tree, the run below taken, and the
    /// tree restored from an in-memory copy — never <c>git checkout</c> (TRAPS 2), and verified
    /// byte-identical afterwards. <b>"RED n/67" is what the run reported</b>, over
    /// <c>PrioritiseOrderTests|BlockedChannelTests|StickyClaimTests|WreckRepairEconomyTests</c> —
    /// the neighbours are in the filter so a mutation that reddened THIS file by breaking one of
    /// them would show. Rows 1–5 are the charter's; <b>rows 6–8 are independent review's, and rows
    /// 6, 7 and 8 each found a LIVE defect rather than confirming a guard</b>.
    /// ⚠️ The counts for rows 1–5 are NOT the pre-fix-back ones (6/7/5/2/1 of 63): the fix-back added
    /// four legs and moved <c>IsUnfixableWreck</c>'s call site, so the whole table was re-run rather
    /// than partially re-scored.</para>
    /// <list type="table">
    ///   <item><b>1 — <c>PrioritiseJobCommand.Execute</c> becomes a no-op</b> ⇒ <b>RED 10/67</b> —
    ///     every sim leg that expects an accepted order, headed by
    ///     <see cref="TheOrder_SendsTheNamedPawnToTheNamedMachine_AndHoldsHerThere"/> ("the sim has
    ///     no 'that one, now'").</item>
    ///   <item><b>2 — consult <c>CanTakeWorkType</c> (i.e. let the GRID refuse the order)</b> ⇒
    ///     <b>RED 8/67</b>, headed by <see cref="TheOrder_OverridesAGridWithRepairOff"/> — the
    ///     decided behaviour's own leg. ⭐ <b>AND THE TWO GRID-ON LEGS STAYED GREEN —
    ///     <see cref="WithRepairEnabled_TheOrderStillOutranksTheNeedierMachine"/> and
    ///     <see cref="AnOrderAtAMachineSheAlreadyChose_AddsTheHoldWithoutTouchingTheJob"/> — which
    ///     is the precise truth rather than the dramatic one:</b> with the grid ON there is nothing
    ///     for the override to override, so neither can see this mutation at all. That is exactly
    ///     why the OD-H boot state is the fixture that pins the decision.</item>
    ///   <item><b>3 — drop the emission from <c>GameSession.AddUnfixableRow</c> (refuse and say
    ///     NOTHING)</b> ⇒ <b>RED 5/67</b>, headed by
    ///     <see cref="AnOrderedUnfixableMachine_ReachesTheBlockedChannelAsNoConsumable"/>.
    ///     ⚠️ Its fixture STRIPS EVERY Parts/Seals/<b>Swarf</b> stack first and asserts the predicate
    ///     is true before driving anything — the wreck ships 11 consumable units and
    ///     <c>IsUnfixableWreck</c> asks with <c>allowSwarf: true</c>, so without the strip the leg
    ///     would pass with the emission deleted.</item>
    ///   <item><b>4 — re-derive "is there Parts aboard" host-side instead of asking the sim</b> ⇒
    ///     <b>RED 2/67</b>, and it is pinned BEHAVIOURALLY rather than by a text scan: the two legs
    ///     construct the states where the naive answer differs from the dispatcher's, in OPPOSITE
    ///     directions. <see cref="OneSwarfStackClearsTheBadge_BecauseSwarfIsARepairTier"/> (no Parts
    ///     aboard, still FIXABLE) and
    ///     <see cref="AReservedPartsStackDoesNotCount_TheChannelFollowsTheDispatcher"/> (Parts
    ///     aboard, still UNFIXABLE). A name scan could not see either.</item>
    ///   <item><b>5 — let the order survive the pawn's death</b> (drop the prune pass) ⇒
    ///     <b>RED 1/67</b>: <see cref="OnDeath_ThePendingOrderIsDroppedByTheHost"/>.
    ///     ⚠️ <b><see cref="OnDeath_TheOrderLeavesNoResidueInTheSim"/> STAYED GREEN, and that is a
    ///     fact about where the risk lives</b>: the SIM half of the cleanup is M2-19's
    ///     <c>JobKind</c> setter, which this package did not touch. The residue M2-9 could leave is
    ///     entirely host-side, and it is invisible on the wire — hence the count seam.</item>
    ///   <item>⭐ <b>6 (INDEPENDENT REVIEW) — break the <c>"prioritise"</c> JSON reader four ways</b>
    ///     (x/y swapped, <c>deck</c> read as <c>"z"</c>, <c>cid</c> read as <c>"citizen"</c>) ⇒ on
    ///     the tree as first submitted this was <b>a CLEAN SURVIVOR, 0 red</b>: no leg reached
    ///     <c>WebCommand.Parse</c> and the string <c>"prioritise"</c> appeared in no test. Now
    ///     <b>RED 1/67</b> — <see cref="Parse_Reads_The_Prioritise_Message_Cid_X_Y_And_Deck"/>.
    ///     ⚠️ <c>assert</c> throws, so the four-way break reports only its FIRST leg; each break was
    ///     therefore also applied ALONE and each reddens with its own message (x/y ⇒ "x must come
    ///     from \"x\"", deck ⇒ "the deck must ride in I", cid ⇒ "the crew id must come from
    ///     \"cid\"").</item>
    ///   <item>⭐ <b>7 (INDEPENDENT REVIEW) — drop the <c>servicer == citizen</c> branch</b>, so a
    ///     repeat order at the machine she is already servicing falls through to
    ///     <c>Simulation.CancelJob</c> ⇒ <b>RED 2/67</b>:
    ///     <see cref="ARepeatOrderAtTheSameMachine_DoesNotDestroyTheServiceInFlight"/> and
    ///     <see cref="AnOrderAtAMachineSheAlreadyChose_AddsTheHoldWithoutTouchingTheJob"/>. This was
    ///     a LIVE defect, measured: <c>JobWorkTicks</c> 8 770 → 0 and the carried Parts dropped.</item>
    ///   <item>⭐ <b>8 (INDEPENDENT REVIEW) — put the retire rule back to a BLACKLIST</b> (retire
    ///     only the order the sim took) ⇒ <b>RED 1/67</b>:
    ///     <see cref="AnOrderRefusedForANonWreckReason_IsNotRemembered"/>. Also a LIVE defect: an
    ///     order refused on Condition/staging/incapability leaked its host-side entry for the rest
    ///     of the session.</item>
    /// </list>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-9". Mechanism
    /// authority: <c>rimworld-reference.md</c> §2.2. Behaviour as implemented: <c>MECHANICS</c>
    /// §6.2d.</para>
    /// </summary>
    public class PrioritiseOrderTests
    {
        // ══════════════════════════════════════════════════════ the sim fixture
        // Deliberately StickyClaimTests' hall: this package is M2-19's writer, and a different map
        // would make the two suites' results incomparable. Row 0 is solid, so (0,0,0) is a tile
        // whose every 4-neighbour is a wall — the walled-in machine the staging leg needs.

        private static readonly string[] HallMap =
        {
            "####################",
            "#..................#",
            "#.......#..........#",
            "#..................#",
            "####################",
        };

        private static readonly Int3 PawnStart = new Int3(2, 2, 0);
        private static readonly Int3 FarMachine = new Int3(17, 1, 0);
        private static readonly Int3 NearMachine = new Int3(5, 3, 0);
        private static readonly Int3 WalledMachine = new Int3(0, 0, 0);
        private static readonly Int3 PartsTile = new Int3(3, 1, 0);

        /// <summary>The shipped stack's relative order for the systems these legs use, minus
        /// <see cref="SafetySystem"/> — StickyClaimTests' stack, and the same consequence: with no
        /// safety guard registered <c>WorksiteSafety.CanStageWorkerAt</c> short-circuits to true, so
        /// the AIR half of the staging rule is inert here and the walled-in leg exercises its
        /// APPROACH half. Stated rather than left to be discovered.</summary>
        private static Simulation NewSim()
            => new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
            });

        /// <summary>A machine that wants service, with the wreck rule NOT what could refuse it —
        /// StickyClaimTests' helper, restated so a change there cannot silently retune this
        /// file.</summary>
        private static Device NeedyMachine(Simulation sim, Int3 pos, string name, float condition = 0.30f)
        {
            var machine = sim.AddDevice(DeviceKind.Scrubber, pos, name);
            machine.Condition = condition;
            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: " + name + " really wants service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "control: and the WRECK rule is not what would refuse it");
            return machine;
        }

        /// <summary>The order, sent the ONLY way a player can send one: through the command inbox.
        /// (CLAUDE.md's first invariant — input only via <c>ISimCommand</c>.)</summary>
        private static void Order(Simulation sim, Citizen who, Device machine)
            => sim.EnqueueCommand(new PrioritiseJobCommand((int)who.Id, (int)machine.Id));

        /// <summary>Tick until <paramref name="who"/> is servicing <paramref name="machine"/>, or
        /// give up. Returns the tick she took it, or -1.</summary>
        private static long DriveUntilServicing(Simulation sim, Citizen who, Device machine, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (who.JobKind == JobKind.Maintain && who.JobTarget == machine.Pos) return sim.TickCount;
            }
            return -1;
        }

        // ══════════════════════════════════════════════════════ 1. the headline: the verb exists

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S SENTENCE, DRIVEN: the named crew member goes to the named machine,
        /// and the order HOLDS her there until it is done.</b>
        ///
        /// <para>The grid is at its OD-H boot state — every work type OFF — which is deliberately the
        /// ordinary case rather than a special one, and the reason a player's first right-click can
        /// work at all. The controls are what make this more than "she eventually repaired
        /// something": she must take THE ORDERED machine (not the needier one standing beside her),
        /// she must be <c>HeldByOrder</c> for as long as she works it, and the machine must actually
        /// come back up.</para>
        ///
        /// <para>⛔ MUTATION 1: make <c>PrioritiseJobCommand.Execute</c> a no-op ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void TheOrder_SendsTheNamedPawnToTheNamedMachine_AndHoldsHerThere()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);
            var ordered = NeedyMachine(sim, FarMachine, "scrubber_far");
            var needier = NeedyMachine(sim, NearMachine, "scrubber_near", 0.26f);
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Assert.That(needier.Condition, Is.LessThan(ordered.Condition),
                "fixture: the machine she is NOT ordered onto must be the one the dispatcher would " +
                "prefer (RecruitForNeediest takes the lowest Condition first) — otherwise 'she took " +
                "the ordered one' is not a claim about the order");

            Order(sim, pawn, ordered);
            long took = DriveUntilServicing(sim, pawn, ordered, 200);

            Assert.That(took, Is.GreaterThan(0),
                "⛔ THE VERB: an ordered crew member never took the machine the player pointed at. " +
                "This is the whole package — the sim has no 'that one, now'.");
            Assert.That(pawn.HeldByOrder, Is.True,
                "⛔ THE HOLD (M2-19's writer contract): the job was assigned but the order was not " +
                "placed on it, so the grid may take her straight back off it");

            bool everOnTheOtherOne = false;
            for (int t = 0; t < 20000 && ordered.Condition < 1f; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain && pawn.JobTarget == needier.Pos) everOnTheOtherOne = true;
                if (pawn.HeldByOrder)
                    Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain),
                        "⛔ the hold must imply a job — HeldByOrder ⇒ JobKind != None is the " +
                        "invariant the whole mechanism rests on (tick " + sim.TickCount + ")");
            }

            Assert.That(ordered.Condition, Is.EqualTo(1f),
                "she must FINISH the ordered repair — a Parts service is a full overhaul, and an " +
                "order that merely reserves her is not 'the ship visibly changes'");
            Assert.That(everOnTheOtherOne, Is.False,
                "⛔ she was diverted onto the NEEDIER machine. The player named a target; the " +
                "dispatcher's own preference does not get to overrule it.");
            Assert.That(pawn.HeldByOrder, Is.False,
                "and completion RELEASES the hold — §2.2's forced flag dies with its job");
        }

        // ══════════════════════════════════════════════════════ 2. the decided behaviour

        /// <summary>
        /// ⭐⭐ <b>THE DECISION, PINNED: AN EXPLICIT ORDER OVERRIDES A WORK GRID THAT HAS REPAIR
        /// OFF.</b> §2.2, source-grade: <i>"incapability wins even over a player order; a player's
        /// own priority-0 setting does not."</i>
        ///
        /// <para>⛔ <b>THE CONTROL RUNS FIRST AND IT IS THE POINT.</b> The identical fixture with NO
        /// order must leave the machine untouched for the whole window — otherwise "the order got
        /// her there" would be satisfied by a fixture in which the GRID would have got her there
        /// anyway, and this leg would pin nothing at all. Under OD-H that control is also the
        /// shipped boot state.</para>
        ///
        /// <para>⛔ MUTATION 2: add <c>if (!citizen.CanTakeWorkType(work)) return;</c> to
        /// <c>Execute</c> (i.e. let the grid refuse the order) ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void TheOrder_OverridesAGridWithRepairOff()
        {
            // ── control: no order, grid off ⇒ nothing happens, for 200 ticks ──
            var control = NewSim();
            var idle = control.AddCitizen("Rell", PawnStart);
            var untouched = NeedyMachine(control, FarMachine, "scrubber");
            control.AddItem(ItemKind.Parts, 4, PartsTile);
            control.JobsDirty = JobBoardDirty.All;
            Assert.That(idle.CanTakeWorkType(WorkType.Repair), Is.False,
                "premise: OD-H boots Repair OFF, so the grid alone refuses this work");
            for (int t = 0; t < 200; t++) control.Tick();
            Assert.That(idle.JobKind, Is.EqualTo(JobKind.None),
                "⛔ CONTROL: with Repair off and no order she must take NO job. If she services the " +
                "machine here, the subject below proves nothing — the grid would have done it.");
            Assert.That(untouched.Condition, Is.LessThan(1f), "control: and the machine is unrepaired");

            // ── subject: the same fixture, plus the order ──
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;
            Assert.That(pawn.CanTakeWorkType(WorkType.Repair), Is.False,
                "premise: the SUBJECT's grid is off too — same state as the control");

            Order(sim, pawn, machine);
            Assert.That(DriveUntilServicing(sim, pawn, machine, 200), Is.GreaterThan(0),
                "⛔ THE DECIDED BEHAVIOUR: a direct order must beat a work setting (§2.2). Under " +
                "OD-H every machine on every ship is 'a machine the grid has off' at boot, so a " +
                "refusal here refuses the player's very first right-click.");
            Assert.That(pawn.GetWorkPriority(WorkType.Repair), Is.EqualTo(WorkPriority.Off),
                "⛔ and the order must not have WRITTEN the grid to get its way. It overrides the " +
                "setting for this job; it does not silently enrol her in repair duty forever.");
        }

        /// <summary>
        /// ⛔ <b>THE ENABLED CONTROL, in its own <c>[Test]</c> because <c>assert</c> throws.</b> With
        /// Repair switched ON at the highest band the order must behave IDENTICALLY — and now the
        /// dispatcher is a live competitor, so this is also where "the maintenance system never
        /// steals her" has teeth: a needier machine is waiting the whole time and
        /// <c>RecruitForNeediest</c> prefers the lowest Condition first.
        /// </summary>
        [Test]
        public void WithRepairEnabled_TheOrderStillOutranksTheNeedierMachine()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();
            var ordered = NeedyMachine(sim, FarMachine, "scrubber_far");
            var needier = NeedyMachine(sim, NearMachine, "scrubber_near", 0.26f);
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Order(sim, pawn, ordered);
            Assert.That(DriveUntilServicing(sim, pawn, ordered, 200), Is.GreaterThan(0),
                "with the work type ENABLED the order must land exactly as it does with it off");

            bool needierStillWaiting = false, diverted = false;
            for (int t = 0; t < 20000 && ordered.Condition < 1f; t++)
            {
                sim.Tick();
                // ⚠️ "WHILE THE ORDERED MACHINE IS STILL UNREPAIRED" IS LOAD-BEARING, not a
                // softening. With Repair ON, the tick that COMPLETES the ordered service also frees
                // her, and RecruitForNeediest claims the second machine inside that same tick
                // (DriveWorkers then RecruitForNeediest) — which is autonomy correctly resuming
                // after the order, OD-G's own sentence, not the grid stealing her. The claim here
                // is about the window in which the order is still owed.
                if (ordered.Condition < 1f && pawn.JobKind == JobKind.Maintain && pawn.JobTarget == needier.Pos)
                    diverted = true;
                if (pawn.HeldByOrder && needier.Condition < sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow)
                    needierStillWaiting = true;
            }

            Assert.That(diverted, Is.False,
                "⛔ MaintenanceSystem took the ordered crew member off the machine the player named " +
                "and put her on the one IT preferred. That is the grid eating the player's own " +
                "instrument, which is exactly what the hold exists to stop.");
            Assert.That(needierStillWaiting, Is.True,
                "⛔ CONTROL: the competing work must have been REAL and WAITING while she was held. " +
                "A repaired or unclaimable rival makes the assertion above vacuous.");
            Assert.That(ordered.Condition, Is.EqualTo(1f), "and the ordered machine came back up");
        }

        // ══════════════════════════════════════════════════════ 3. the two boundaries

        /// <summary>
        /// ⛔ <b>BOUNDARY 1 — INCAPABLE ≠ DISABLED.</b> The order overrides what the PLAYER switched
        /// off; it never overrides what the PERSON cannot do. §2.2 reads the distinction straight off
        /// <c>Pawn_JobTracker.cs:112-120</c>, and it is the owner's own line.
        ///
        /// <para>⚠️ <b>BOTH LEGS RUN WITH THE GRID AT ITS OD-H BOOT STATE (Repair OFF), AND THAT IS
        /// WHAT MAKES THIS AN INCLUSION TEST RATHER THAN A COINCIDENCE.</b> With the grid ON,
        /// <c>MaintenanceSystem</c> would recruit the capable control ANYWAY — so the control would
        /// pass with the order broken — and the incapable subject would be refused by
        /// <c>CanTakeWorkType</c> BEFORE the order was consulted, so neither leg would be about the
        /// order at all. Grid off, the order is the ONLY thing that can produce this job, and the one
        /// difference between the two legs is the incapability.</para>
        /// </summary>
        [Test]
        public void AnIncapableCrewMemberIsRefused_ThoughTheOrderOverridesTheGrid()
        {
            // ── control: capable, grid OFF ⇒ the order (and nothing else) lands ──
            var control = NewSim();
            var capable = control.AddCitizen("Rell", PawnStart);
            var ok = NeedyMachine(control, FarMachine, "scrubber");
            control.AddItem(ItemKind.Parts, 4, PartsTile);
            control.JobsDirty = JobBoardDirty.All;
            Order(control, capable, ok);
            Assert.That(DriveUntilServicing(control, capable, ok, 200), Is.GreaterThan(0),
                "⛔ CONTROL: this fixture must ACCEPT an order — and with the grid off the ORDER is " +
                "the only thing that could have produced this job. Without that, the refusal below " +
                "says nothing.");

            // ── subject: the same, with the person unable to do repair work at all ──
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetIncapableOf(WorkType.Repair, true);
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;
            Assert.That(pawn.IsIncapableOf(WorkType.Repair), Is.True,
                "premise: the ONE difference from the control is the incapability");

            Order(sim, pawn, machine);
            for (int t = 0; t < 200; t++) sim.Tick();

            Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.Maintain),
                "⛔ an order put an INCAPABLE crew member on the work. §2.2: incapability wins even " +
                "over a player order.");
            Assert.That(pawn.HeldByOrder, Is.False,
                "⛔ and — worse — a hold was placed on a crew member who never got the job. A held " +
                "jobless pawn is unrecruitable by everything and re-orderable by nothing.");
        }

        /// <summary>
        /// ⛔ <b>BOUNDARY 2 — THE STAGING RULE IS NEVER OVERRIDDEN.</b> A machine with nowhere for a
        /// servicer to stand is refused, order or no order:
        /// <c>MaintenanceSystem.TryFindStagingTile</c> is asked, and it is the dispatcher's own.
        ///
        /// <para>⚠️ <b>THIS EXERCISES THE APPROACH HALF OF THAT RULE, NOT THE AIR HALF</b>, and the
        /// difference is stated rather than glossed: with no <see cref="SafetySystem"/> in this
        /// stack <c>WorksiteSafety.CanStageWorkerAt</c> short-circuits to true, so the machine is
        /// refused because every 4-neighbour of (0,0,0) is HULL. The air half of the same call is
        /// covered where a safety guard actually runs.</para>
        ///
        /// <para>The grid stays at its OD-H boot state so the ORDER is the only thing that could
        /// produce either job — the inclusion control at the bottom would otherwise be satisfied by
        /// <c>MaintenanceSystem</c> recruiting her of its own accord.</para>
        /// </summary>
        [Test]
        public void TheOrderNeverOverridesTheStagingRule_AWalledInMachineIsRefused()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);
            var reachable = NeedyMachine(sim, FarMachine, "scrubber_reachable");
            var walledIn = NeedyMachine(sim, WalledMachine, "scrubber_walled");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, walledIn.Pos, out _), Is.False,
                "premise: the walled-in machine really has nowhere to stand");
            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, reachable.Pos, out _), Is.True,
                "premise: and the control machine really does");

            Order(sim, pawn, walledIn);
            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(pawn.JobTarget == walledIn.Pos && pawn.JobKind == JobKind.Maintain, Is.False,
                "⛔ an order sent a crew member to a machine she cannot stand beside. Safety and " +
                "staging are never overridden — only the work GRID is.");
            Assert.That(pawn.HeldByOrder, Is.False, "⛔ and no hold was left on a refused order");

            // INCLUSION: the same pawn, the same tick budget, a machine that IS stageable.
            Order(sim, pawn, reachable);
            Assert.That(DriveUntilServicing(sim, pawn, reachable, 200), Is.GreaterThan(0),
                "⛔ CONTROL: the refusal above must be about the WALLED-IN machine, not about this " +
                "fixture being unable to accept any order at all");
        }

        // ══════════════════════════════════════════════════════ 4. one servicer per machine

        /// <summary>
        /// A machine already being serviced refuses a second order.
        /// <c>MaintenanceSystem.DriveWorkers</c> drives EVERY Maintain citizen bound to the tile, so
        /// two would repair one machine twice over while <c>FindWorker</c> could only ever see the
        /// first — the reason that predicate is now public and asked here.
        /// </summary>
        [Test]
        public void ASecondOrderAtOneMachineIsRefused_OneServicerPerMachine()
        {
            var sim = NewSim();
            var first = sim.AddCitizen("Rell", PawnStart);
            var second = sim.AddCitizen("Okafor", new Int3(3, 3, 0));
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Order(sim, first, machine);
            Assert.That(DriveUntilServicing(sim, first, machine, 200), Is.GreaterThan(0),
                "fixture: the first order must land");

            Order(sim, second, machine);
            for (int t = 0; t < 50; t++) sim.Tick();

            Assert.That(second.JobKind, Is.Not.EqualTo(JobKind.Maintain),
                "⛔ a second crew member was bound to a machine that already has a servicer");
            Assert.That(second.HeldByOrder, Is.False, "⛔ and held on a job she never received");
            Assert.That(first.JobKind, Is.EqualTo(JobKind.Maintain),
                "⛔ CONTROL: and the FIRST crew member was not knocked off it either — a refused " +
                "order must change nothing at all");
            Assert.That(first.HeldByOrder, Is.True, "control: her hold survives the refused order");
        }

        /// <summary>
        /// ⭐⭐ <b>CLICKING THE SAME MACHINE TWICE COSTS NOTHING.</b> A repeat order at the machine
        /// she is ALREADY servicing must leave the service untouched — M2-10 puts the second
        /// right-click one click away from the first.
        ///
        /// <para>⛔ <b>MEASURED DEFECT, FOUND BY INDEPENDENT REVIEW.</b> The first version fell
        /// through to <c>Simulation.CancelJob</c> on this path: <c>JobWorkTicks</c> 8 770 → 0 and the
        /// Parts stack in her hands dropped on the floor, i.e. the player's second click threw away
        /// a quarter of an hour of the crew member's life and un-fetched the part. The guard is
        /// <c>servicer == citizen</c>.</para>
        ///
        /// <para>⛔ THE CONTROL IS THE POINT: the work counter must be genuinely NON-ZERO and the
        /// carry genuinely non-empty when the second order lands, or "it survived" is a claim about
        /// a pawn who had nothing to lose. Both are asserted before the re-order.</para>
        /// </summary>
        [Test]
        public void ARepeatOrderAtTheSameMachine_DoesNotDestroyTheServiceInFlight()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Order(sim, pawn, machine);
            Assert.That(DriveUntilServicing(sim, pawn, machine, 200), Is.GreaterThan(0),
                "fixture: the first order must land");
            // Drive her all the way into the WORK phase, parts in hand and the clock running.
            for (int t = 0; t < 4000 && pawn.JobWorkTicks == 0; t++) sim.Tick();

            int ticksBefore = pawn.JobWorkTicks;
            uint carriedBefore = pawn.CarryingItemId;
            Assert.That(ticksBefore, Is.GreaterThan(0),
                "⛔ CONTROL: she must be COUNTING DOWN a real service when the second click lands — " +
                "a pawn with nothing in progress cannot demonstrate that nothing was lost");
            Assert.That(carriedBefore, Is.Not.EqualTo(0u),
                "⛔ CONTROL: and she must be holding the consumable, which is the other half of what " +
                "the fall-through used to drop on the floor");

            Order(sim, pawn, machine);   // …the player clicks the same machine again
            sim.Tick();

            Assert.That(pawn.JobWorkTicks, Is.GreaterThan(0),
                "⛔ the repeat order RESET the service. Falling through to CancelJob on a machine " +
                "she is already servicing throws away every tick of work already done.");
            Assert.That(pawn.JobWorkTicks, Is.LessThanOrEqualTo(ticksBefore),
                "sanity: the countdown may advance, but it must not have been re-armed from scratch");
            Assert.That(pawn.CarryingItemId, Is.EqualTo(carriedBefore),
                "⛔ the repeat order made her DROP the consumable she had already fetched");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain), "and she is still on the job");
            Assert.That(pawn.JobTarget, Is.EqualTo(machine.Pos), "…at the same machine");
            Assert.That(pawn.HeldByOrder, Is.True, "…and still held by the order");
        }

        /// <summary>
        /// The other half of the same branch: an order at a machine she reached ON HER OWN still
        /// takes — it just takes as a HOLD rather than as a new job. <c>MaintenanceSystem</c>
        /// recruited her, the player sees her working and says "stay on THAT"; an order that
        /// returned without writing the bool would leave the grid free to take her off it, which is
        /// the promise the verb makes.
        /// </summary>
        [Test]
        public void AnOrderAtAMachineSheAlreadyChose_AddsTheHoldWithoutTouchingTheJob()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();   // grid ON: she takes it herself
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            long took = DriveUntilServicing(sim, pawn, machine, 400);
            Assert.That(took, Is.GreaterThan(0), "fixture: the GRID must have got her there, unprompted");
            Assert.That(pawn.HeldByOrder, Is.False,
                "⛔ CONTROL: and she is NOT held — nobody has ordered anything yet, so the hold " +
                "below has to be this order's doing");
            for (int t = 0; t < 4000 && pawn.JobWorkTicks == 0; t++) sim.Tick();
            int ticksBefore = pawn.JobWorkTicks;
            Assert.That(ticksBefore, Is.GreaterThan(0), "fixture: a real service is in flight");

            Order(sim, pawn, machine);
            sim.Tick();

            Assert.That(pawn.HeldByOrder, Is.True,
                "⛔ the order did not stick to a crew member who was already on the right machine. " +
                "\"Stay on THAT\" is exactly what the player asked for.");
            Assert.That(pawn.JobWorkTicks, Is.GreaterThan(0),
                "⛔ and it must not have cost her the service to say so");
            Assert.That(pawn.JobTarget, Is.EqualTo(machine.Pos), "still the same machine");
        }

        // ══════════════════════════════════════════════════════ 5. death leaves no residue

        /// <summary>
        /// ⛔ <b>MUTATION 5, SIM HALF — THE ORDER DIES WITH THE PAWN.</b> §2.1: a designation survives
        /// its pawn, a DIRECT ORDER does not. Driven on real suffocation (this stack has
        /// <see cref="NeedsSystem"/> and deliberately no <see cref="SafetySystem"/>, the
        /// <c>CrewSafetyTests</c> mutation stack), so <c>NeedsSystem.Kill</c> is what runs.
        ///
        /// <para>What must be left behind: nothing. No hold on a corpse, no phantom servicer bound to
        /// the machine, and the machine free for whoever is left.</para>
        /// </summary>
        [Test]
        public void OnDeath_TheOrderLeavesNoResidueInTheSim()
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new MaintenanceSystem(),
                new NeedsSystem(),
            });
            var pawn = sim.AddCitizen("Rell", PawnStart);
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            sim.JobsDirty = JobBoardDirty.All;

            Order(sim, pawn, machine);
            Assert.That(DriveUntilServicing(sim, pawn, machine, 200), Is.GreaterThan(0),
                "fixture: the order must land BEFORE the air kills her, or this leg is about nothing");
            uint id = pawn.Id;

            for (int t = 0; t < 20000 && !pawn.Dead; t++) sim.Tick();

            Assert.That(pawn.Dead, Is.True,
                "fixture: with no SafetySystem and no atmosphere she must actually die — otherwise " +
                "this leg tests nothing (CrewSafetyTests' own control)");
            Assert.That(sim.Citizens.TryGet(id, out _), Is.False,
                "fixture: NeedsSystem.Kill removes the citizen from the store, which is the state " +
                "every cleanup below keys on");
            Assert.That(pawn.HeldByOrder, Is.False,
                "⛔ the order outlived the crew member. A hold on a corpse can never be cleared by " +
                "anything: nothing ticks her and no order can reach her.");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None),
                "control: and it is the JOB ending that released it, not a special death branch");
            Assert.That(MaintenanceSystem.FindWorker(sim, machine.Pos), Is.Null,
                "⛔ the machine still has a servicer bound to it — a phantom job, which makes the " +
                "machine permanently unclaimable by anyone else");
        }

        // ══════════════════════════════════════════════════════ the wire half, on --ship wreck

        /// <summary>The shipping ship, with a session over it and no sim thread. ⚠️ NOT
        /// <c>GiveAllCrewAllWork</c>: this half of the file is about an order that works at the OD-H
        /// boot state, which is the state a player is actually in.</summary>
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        private static Device ByName(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail("no device named '" + name + "' on the wreck");
            return null;
        }

        /// <summary>Every Parts / Seals / <b>Swarf</b> stack, gone. The wreck ships 11 consumable
        /// units and <c>IsUnfixableWreck</c> asks with <c>allowSwarf: true</c>, so ALL THREE kinds
        /// have to go or the predicate is false and every leg using it is vacuous.</summary>
        private static void RemoveAllConsumables(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
                if (it.Kind == ItemKind.Parts || it.Kind == ItemKind.Seals || it.Kind == ItemKind.Swarf)
                    doomed.Add(it.Id);
            foreach (var id in doomed) sim.Items.Remove(id);
        }

        /// <summary>The cached <c>blocked</c> payload's tuples, taken from the SNAPSHOT a
        /// reconnecting client is caught up from — BlockedChannelTests' reader, restated so this
        /// file parses the wire rather than a builder's return value.</summary>
        private static List<(int X, int Y, int Deck, int Order, int Reason, int Detail)> Rows(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up");
            var rows = new List<(int, int, int, int, int, int)>();
            int at = json.IndexOf("[[", System.StringComparison.Ordinal);
            if (at < 0) return rows;
            foreach (var part in json.Substring(at + 1).Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Substring(0, part.IndexOf(']')).Split(',');
                // ⭐ M3-13 — SIX, and the parse ASSERTS it rather than tolerating five. A reader that
                // silently accepted a short row would keep working while the sixth element vanished
                // from the wire, which is the positional array's whole hazard measured from the
                // reading end. (`< 5` here until M3-13; the tolerance was for a tuple that could not
                // yet grow.)
                Assert.That(f.Length, Is.EqualTo(6),
                    "a blocked tuple is six elements since M3-13, saw: [" + string.Join(",", f) + "]");
                rows.Add((int.Parse(f[0], System.Globalization.CultureInfo.InvariantCulture),
                          int.Parse(f[1], System.Globalization.CultureInfo.InvariantCulture),
                          int.Parse(f[2], System.Globalization.CultureInfo.InvariantCulture),
                          int.Parse(f[3], System.Globalization.CultureInfo.InvariantCulture),
                          int.Parse(f[4], System.Globalization.CultureInfo.InvariantCulture),
                          int.Parse(f[5], System.Globalization.CultureInfo.InvariantCulture)));
            }
            return rows;
        }

        private static (int X, int Y, int Deck, int Order, int Reason, int Detail)? RepairRowAt(GameSession gs, Int3 p)
        {
            foreach (var t in Rows(gs))
                if (t.Order == WireFormat.OrderRepair && t.X == p.X && t.Y == p.Y && t.Deck == p.Z) return t;
            return null;
        }

        /// <summary>Right-click ▸ <i>prioritise: repair</i>, as the wire spells it. The tile→device
        /// resolution is the host's, exactly as it will be for M2-10's real click.</summary>
        private static void OrderOverTheWire(GameSession gs, Citizen who, Device machine)
            => gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, machine.Pos.X, machine.Pos.Y,
                                             i: machine.Pos.Z, cid: who.Id));

        /// <summary>
        /// ⭐⭐ <b>THE <c>ReasonNoConsumable</c> DISCHARGE — the reserved reason, emitted at last.</b>
        /// The player orders a repair on a machine below <c>wear.wreck_threshold</c> with nothing
        /// aboard to fix it with, and the refusal REACHES HIM on the <c>blocked</c> channel instead
        /// of being the third silent refusal.
        ///
        /// <para>⚠️ <b>THE FIXTURE STRIPS THE AUTHORED CONSUMABLES FIRST AND ASSERTS THE PREDICATE
        /// BEFORE DRIVING ANYTHING.</b> The wreck ships 11 units (1 Parts + 2 Seals in the reactor
        /// bay, 8 Seals in the cryo-bay locker) and Swarf counts too, so on the shipped ship
        /// <c>IsUnfixableWreck</c> is FALSE for every device and this leg would pass with the
        /// emission deleted.</para>
        ///
        /// <para>⛔ AND THE UN-ORDERED CONTROL IS THE OTHER HALF: the same unfixable machine, before
        /// the order, must NOT be on the channel. Automatic maintenance stays off this channel — on a
        /// wreck the row count would otherwise be every damaged device aboard.</para>
        ///
        /// <para>⛔ MUTATION 3: delete the <c>IsUnfixableWreck</c> line in
        /// <c>GameSession.AddUnfixableRow</c> ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void AnOrderedUnfixableMachine_ReachesTheBlockedChannelAsNoConsumable()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];

            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.False,
                "premise: with the authored stock aboard nothing is unfixable");
            RemoveAllConsumables(sim);
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "⛔ PREMISE: with every Parts/Seals/Swarf stack gone a machine below the wreck floor " +
                "MUST be unfixable. If this is false the leg below is vacuous and would pass with " +
                "the emission deleted.");

            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Null,
                "⛔ CONTROL: an unfixable machine NOBODY ORDERED must not be on the channel. This " +
                "channel is scoped to what the player asked for; badging every damaged device on a " +
                "wreck is a permanent nag about work nobody ordered.");

            OrderOverTheWire(gs, crew, wingB);
            var row = RepairRowAt(gs, wingB.Pos);

            Assert.That(row, Is.Not.Null,
                "⛔ THE DISCHARGE: the player ordered a repair the ship cannot perform and the game " +
                "said NOTHING. A refusal the player cannot see is indistinguishable from a broken " +
                "verb — the failure this repo has paid three owner reports for.");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoConsumable),
                "the reason must be NO CONSUMABLE — the client already names it 'NO PARTS OR SEALS " +
                "ABOARD', which points at the fix");
            Assert.That(row.Value.Order, Is.EqualTo(WireFormat.OrderRepair),
                "and the order kind must say REPAIR, not borrow dig/strip/build's meaning");
        }

        /// <summary>
        /// ⛔ <b>SINGLE AUTHORITY, LEG 1 — SWARF COUNTS.</b> A host-side re-derivation of *"is there
        /// any Parts aboard"* answers "no, blocked" for a ship holding one Swarf stack and nothing
        /// else; the dispatcher answers "fixable", because <c>IsUnfixableWreck</c> asks with
        /// <c>allowSwarf: true</c> — salvage from the dead half of the ship is what makes a wreck
        /// fixable at all. The badge must follow the DISPATCHER.
        ///
        /// <para>Pinned behaviourally rather than by scanning source for the predicate's name: what
        /// matters is that the two answers cannot diverge, and a name scan cannot see a divergence.
        /// The row before/after one stack is the whole test.</para>
        /// </summary>
        [Test]
        public void OneSwarfStackClearsTheBadge_BecauseSwarfIsARepairTier()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];
            RemoveAllConsumables(sim);
            OrderOverTheWire(gs, crew, wingB);
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Not.Null,
                "control: with nothing aboard the badge is up");

            var swarf = sim.AddItem(ItemKind.Swarf, 1, crew.Pos);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, swarf.Pos), Is.True,
                "premise: the stack must be somewhere a crew member could actually fetch it — " +
                "FindNearest filters on the stack tile's own breathability");

            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Null,
                "⛔ ONE SWARF STACK and the badge is still up. Someone re-derived 'is there Parts " +
                "aboard' host-side instead of asking MaintenanceSystem.IsUnfixableWreck — the three " +
                "tier ladder (Parts ▸ Seals ▸ Swarf) lives behind that one call, and re-deriving is " +
                "how the two answers drift apart.");
        }

        // ════════════════════════════════════ M3-13 — THE ROW NAMES THE ITEM THE ORDER IS WAITING FOR

        /// <summary>
        /// ⭐⭐ <b>M3-13 — THE SIXTH TUPLE ELEMENT, DRIVEN ON THE SHIPPING SHIP.</b> The badge over a
        /// stalled repair order used to read the generic <i>NO PARTS OR SEALS ABOARD</i>; it now
        /// carries the <c>ItemKind</c> the order is waiting for, so the client can say
        /// <c>NEEDS PARTS — NOTHING ABOARD TO REPAIR IT WITH</c>.
        ///
        /// <para>⛔ <b>THE ASSERTION IS THE LITERAL ITEM, AND THAT IS THE MUTATION-KILLING SHAPE
        /// RATHER THAN THE LAZY ONE.</b> Asserting <c>Detail == (int)MaintenanceSystem
        /// .WantedRepairConsumable</c> would FOLLOW a mutation to the sim's ladder and stay green on
        /// both sides of it — vacuous by construction. Asserting <c>ItemKind.Parts</c> reddens under
        /// the charter's mutation 3 exactly when the host ASKS the sim, and stays green exactly when
        /// the host has re-derived the answer with a literal of its own.
        /// <br/>MUTATION 3 (the charter's, physically applied): swap cases 0 and 1 in
        /// <c>MachineWearSystem.RepairConsumableTier</c> so tier 0 is <c>Seals</c> ⇒ RED here, with
        /// the wire reading 7. Restore ⇒ green. If a later edit hard-codes
        /// <c>(int)ItemKind.Parts</c> in <c>GameSession.AddUnfixableRow</c>, that same mutation stops
        /// reddening — which is the signal, and it is why the mutation is named here rather than
        /// merely performed once.</para>
        ///
        /// <para>⚠️ AND THE CONTROL BELOW IT IS THE SENTINEL: a reason with nothing to add must send
        /// <c>DetailNone</c>, not <c>0</c>. <c>0</c> is <c>ItemKind.Regolith</c>, so a zero default
        /// would make every airless dig order claim to be waiting for rubble.</para>
        /// </summary>
        [Test]
        public void TheNoConsumableRow_NamesTheItemTheOrderIsWaitingFor()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];

            RemoveAllConsumables(sim);
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wingB), Is.True,
                "⛔ PREMISE: with every Parts/Seals/Swarf stack gone the machine must be unfixable, " +
                "or there is no row and this whole test is vacuous.");

            OrderOverTheWire(gs, crew, wingB);
            var row = RepairRowAt(gs, wingB.Pos);
            Assert.That(row, Is.Not.Null, "premise: the refusal reached the channel at all");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoConsumable),
                "premise: it is the consumable refusal and not some other one");

            Assert.That(row.Value.Detail, Is.EqualTo((int)ItemKind.Parts),
                "⛔ THE ROW DOES NOT NAME THE ITEM. Without it the badge falls back to the generic " +
                "'NO PARTS OR SEALS ABOARD' — which OMITS SWARF (a third tier that clears this row " +
                "on its own) and names no item to go and get. (⚠️ NOT a ControllerModule problem: a " +
                "repair order never wants one. See WireFormat.ReasonNoConsumable's remarks.) See " +
                "this test's own remarks for why the literal, and not the accessor, is asserted.");
            Assert.That(row.Value.Detail, Is.Not.EqualTo(WireFormat.DetailNone),
                "the reason that HAS something to say must not send the sentinel");
        }

        /// <summary>
        /// ⭐ <b>M3-13 MUTATION 1b — THE NON-VACUITY CONTROL, AND IT IS LABELLED ONE BECAUSE IT
        /// CANNOT FAIL FOR THE REASON PEOPLE EXPECT.</b> The charter asks: change <c>Detail</c>
        /// mid-session and assert the client re-renders.
        ///
        /// <para>⛔ <b>IT PASSES BY CONSTRUCTION.</b> <c>blocked</c> ships through
        /// <c>GameSession.Send</c>, which dedupes on the WHOLE SERIALIZED STRING
        /// (<c>if (!force &amp;&amp; _cache.TryGetValue(channel, out var prev) &amp;&amp; prev == json) return;</c>)
        /// — <see cref="WireFormat.BlockedCell"/> has no <c>SameAs</c> and this channel has no
        /// field-list delta gate at all. A serialized <c>Detail</c> is therefore inside the dedupe
        /// key the moment the serializer emits it, and the <see cref="WireFormat.DeviceCell"/> scar
        /// (a field the key does not read is a field whose change is never re-sent) is UNREACHABLE
        /// here. Revision 2 of the charter imported that scar by analogy from a sibling struct; round
        /// 3 corrected it, and this test is the correction stated as code.</para>
        ///
        /// <para>⇒ <b>WHAT IT IS FOR:</b> establishing, once, that the channel really does re-send on
        /// a detail-only change — i.e. that the element is inside the key rather than merely on the
        /// wire. What it is NOT is a guard: it can never go red for a field-list reason, and saying
        /// so here is the whole point of running it. The <b>real</b> guard for the sixth element is
        /// the decoder, and it lives in <c>client/test/blocked-model.test.js</c> ("a `detail` on the
        /// wire CHANGES THE RENDERED BADGE").</para>
        /// </summary>
        [Test]
        public void MUTATION_1b_NON_VACUITY_CONTROL_ADetailOnlyChangeReallyDoesReSerialize()
        {
            var a = new[] { new WireFormat.BlockedCell(4, 7, 1, WireFormat.OrderRepair,
                                                      WireFormat.ReasonNoConsumable, (int)ItemKind.Parts) };
            // ⚠️ `Seals`, NOT `ControllerModule`: both are legal bytes for a serializer test, but only
            // one of them is a REPAIR-ladder item, and a fixture that pairs OrderRepair with a
            // ControllerModule quietly restates the charter's false premise (a repair order never
            // wants one — see WireFormat.ReasonNoConsumable's remarks).
            var b = new[] { new WireFormat.BlockedCell(4, 7, 1, WireFormat.OrderRepair,
                                                      WireFormat.ReasonNoConsumable, (int)ItemKind.Seals) };
            Assert.That(WireFormat.Blocked(a), Is.Not.EqualTo(WireFormat.Blocked(b)),
                "two rows differing ONLY in Detail serialize identically, so `Send`'s whole-string " +
                "dedupe would swallow the change and the badge would keep naming the old item " +
                "forever. This is the one way the field-list defect COULD reach this channel.");
            Assert.That(WireFormat.Blocked(a), Is.EqualTo(WireFormat.Blocked(a)),
                "control: the same cells serialize identically, so the inequality above is about " +
                "Detail and not about the serializer being non-deterministic");
        }

        /// <summary>
        /// ⛔ <b>SINGLE AUTHORITY, LEG 2 — A RESERVED STACK IS NOT STOCK, and this one fails a naive
        /// re-derivation in the OPPOSITE direction.</b> The ship holds Parts, so *"is there any Parts
        /// aboard"* says "fine"; <c>FindNearest</c> skips a reserved or carried stack, so the
        /// dispatcher says "unfixable" and no service will ever be offered. The badge must follow the
        /// dispatcher.
        ///
        /// <para>⚠️ <b>EACH ASSERTION FOLLOWS ITS OWN CLICK</b>, which is both what a player does and
        /// what the retire rule requires: an order at a machine the sim can currently service is
        /// retired on the very next render (it is not held, and it is not an unfixable wreck), so the
        /// control's own render deliberately consumes the first order. Re-issuing is the honest
        /// fixture, not a workaround — nothing carries a stale order across a world change.</para>
        /// </summary>
        [Test]
        public void AReservedPartsStackDoesNotCount_TheChannelFollowsTheDispatcher()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];
            RemoveAllConsumables(sim);

            var parts = sim.AddItem(ItemKind.Parts, 1, crew.Pos);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, parts.Pos), Is.True,
                "premise: the stack is fetchable where it lies");
            OrderOverTheWire(gs, crew, wingB);
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Null,
                "control: a free Parts stack aboard makes the machine fixable and clears the badge");

            parts.ReservedBy = crew.Id;
            OrderOverTheWire(gs, crew, wingB);   // the player clicks again, the ship now spoken for
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Not.Null,
                "⛔ THE SHIP HOLDS PARTS AND THE MACHINE IS STILL UNFIXABLE — the stack is spoken " +
                "for. A host-side 'is there any Parts aboard' would report the ship healthy and the " +
                "player would wait forever for a service the dispatcher will never offer.");
        }

        /// <summary>
        /// THE FOG GATE, mirroring every sparse channel since <c>marks</c>: a machine the player has
        /// not seen cannot be ordered and emits nothing. The control is the point — the SAME machine,
        /// two states, one difference — or this passes on a host that emits nothing at all.
        /// </summary>
        [Test]
        public void AnUnexploredMachineIsNeverOrdered()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];
            RemoveAllConsumables(sim);

            sim.World.SetFlag(wingB.Pos, TileFlags.Explored, false);
            OrderOverTheWire(gs, crew, wingB);
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "an order was accepted for a machine the player cannot see");
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Null, "and nothing reached the wire");

            sim.World.SetFlag(wingB.Pos, TileFlags.Explored, true);
            OrderOverTheWire(gs, crew, wingB);
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Not.Null,
                "⛔ CONTROL: the identical order on the EXPLORED tile must reach the channel, or the " +
                "leg above is satisfied by a host that emits nothing");
        }

        /// <summary>
        /// ⭐⭐ <b>THE JSON READER ITSELF — every field, off the raw line.</b> Nothing else in this
        /// file reaches <c>WebCommand.Parse</c>: the driven legs build the struct directly, so the
        /// <c>"prioritise"</c> case was a COMPLETE SURVIVOR until this leg existed — independent
        /// review applied a four-way break (x/y swapped, <c>deck</c> read as <c>"z"</c>, <c>cid</c>
        /// read as <c>"citizen"</c>) and the whole suite stayed green.
        ///
        /// <para>⛔ <b>THIS IS THE SHAPE THAT HAS ALREADY SHIPPED HERE ONCE</b> —
        /// <c>StockpileFilterVerbTests</c>' own header records the <c>filter</c> case being
        /// copy-pasted from the dig/stockpile/strip cases directly above it and reading the wrong
        /// key. Every {x,y,deck} verb in this reader is a copy of its neighbour; the compiler cannot
        /// see across this seam and neither can the client.</para>
        ///
        /// <para>MUTATIONS, each applied and measured: swap <c>"x"</c>/<c>"y"</c> ⇒ RED · read the
        /// deck from <c>"z"</c> ⇒ RED (deck 0 for every order, so every click lands on the wrong
        /// deck's tile) · read the crew id from <c>"citizen"</c> ⇒ RED (id 0, an id no citizen has,
        /// so every order is silently refused) · drop the <c>Kind</c> ⇒ RED.</para>
        /// </summary>
        [Test]
        public void Parse_Reads_The_Prioritise_Message_Cid_X_Y_And_Deck()
        {
            var cmd = WebCommand.Parse("{\"cmd\":\"prioritise\",\"cid\":7,\"x\":9,\"y\":4,\"deck\":1}");
            Assert.AreEqual(CmdKind.Prioritise, cmd.Kind, "the verb string no longer routes to Prioritise");
            Assert.AreEqual(9, cmd.X, "x must come from \"x\" — a swap sends the order to the wrong tile");
            Assert.AreEqual(4, cmd.Y, "y must come from \"y\"");
            Assert.AreEqual(1, cmd.I, "the deck must ride in I, as operate/place/remove/commission do");
            Assert.AreEqual(7u, cmd.Cid, "the crew id must come from \"cid\", the key talk/bio/workPriority use");

            // A missing deck is deck 0, not a rejection — the same total-parse contract every other
            // {x,y,deck} verb here has (OperateVerbTests draws the identical line).
            Assert.AreEqual(0, WebCommand.Parse("{\"cmd\":\"prioritise\",\"cid\":7,\"x\":1,\"y\":1}").I,
                "a missing deck must read as deck 0, not turn the message into a rejection");
        }

        /// <summary>
        /// A right-click on a tile with no machine on it is refused WITHOUT ENQUEUING — the OPERATE
        /// verb's shape. Nothing is remembered, so a mis-click cannot leave a pending order behind.
        /// </summary>
        [Test]
        public void AnOrderAtATileWithNoMachineIsRefused()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var crew = sim.Citizens.Items[0];

            gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, crew.Pos.X, crew.Pos.Y,
                                           i: crew.Pos.Z, cid: crew.Id));
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "a tile with no device on it left a pending order behind");
        }

        /// <summary>
        /// ⭐ <b>THE ORDER IS RETIRED THE MOMENT THE SIM TURNS IT INTO A HELD JOB.</b> From then on
        /// the held job IS the order (§2.2 keeps the forced flag on <c>curJob</c>), so a machine she
        /// successfully repaired cannot inherit a badge belonging to an order that finished.
        /// </summary>
        [Test]
        public void ThePendingOrderIsRetired_OnceTheSimTurnsItIntoAHeldJob()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];

            OrderOverTheWire(gs, crew, wingB);   // the SHIPPED stock is aboard: this order is fixable
            Assert.That(gs.PendingOrderCount, Is.EqualTo(1), "fixture: the order is pending");

            for (int t = 0; t < 200 && !crew.HeldByOrder; t++) sim.Tick();
            Assert.That(crew.HeldByOrder, Is.True, "fixture: the sim must have taken the order");
            Assert.That(crew.JobTarget, Is.EqualTo(wingB.Pos), "fixture: on the ordered machine");

            gs.RenderForTest();
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "⛔ an order the sim has already turned into a held job is still pending host-side. " +
                "The job is the record now; keeping this one badges the machine again the day it " +
                "wears out with the bins empty, for an order that finished long ago.");
        }

        /// <summary>
        /// ⭐⭐ <b>AN ORDER THE SIM REFUSED FOR ANY NON-WRECK REASON IS NOT REMEMBERED.</b> The retire
        /// rule is a WHITELIST: an entry survives a render only while she is HELD on a job at that
        /// machine, or while the machine is an unfixable wreck (the one refusal the badge names).
        ///
        /// <para>⛔ <b>MEASURED LEAK, FOUND BY INDEPENDENT REVIEW.</b> With the old blacklist rule an
        /// order at a HEALTHY machine — refused sim-side on <c>Condition &gt;= MaintainBelow</c> —
        /// left its entry in place for the rest of the session: up to three item-store scans per
        /// render forever, and a machine that later wore below the wreck floor with the bins empty
        /// would raise a NO PARTS badge for an order the sim had never taken.</para>
        ///
        /// <para>The machine here is deliberately HEALTHY, so the sim refuses on the condition gate
        /// and nothing else; the control asserts the order really was refused (she takes no job)
        /// before the count is read.</para>
        /// </summary>
        [Test]
        public void AnOrderRefusedForANonWreckReason_IsNotRemembered()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var crew = sim.Citizens.Items[0];

            // A machine in fine condition: nothing to service, so the command refuses on Condition.
            var healthy = ByName(sim, "wing_b");
            healthy.Condition = 1f;
            Assert.That(healthy.Condition,
                Is.GreaterThanOrEqualTo(sim.Defs.Machines[(int)healthy.Kind].MaintainBelow),
                "fixture: the machine must be ABOVE its maintain threshold, so the refusal is the " +
                "condition gate and not the wreck rule");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, healthy), Is.False,
                "fixture: and it is emphatically not an unfixable wreck — that is the ONE refusal " +
                "the entry is allowed to outlive");

            OrderOverTheWire(gs, crew, healthy);
            Assert.That(gs.PendingOrderCount, Is.EqualTo(1), "fixture: the order was accepted host-side");
            for (int t = 0; t < 50; t++) sim.Tick();

            Assert.That(crew.HeldByOrder, Is.False,
                "⛔ CONTROL: the sim must really have REFUSED this order — otherwise the count below " +
                "is about an order that was taken, and the leg tests nothing");

            gs.RenderForTest();
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "⛔ a refused order is still remembered. It costs up to three item-store scans on " +
                "every render for the rest of the session, and the day this machine wears below the " +
                "wreck floor with the bins empty it raises a NO PARTS badge for an order nobody holds.");
            Assert.That(RepairRowAt(gs, healthy.Pos), Is.Null, "and it puts nothing on the wire");
        }

        /// <summary>
        /// ⛔ <b>MUTATION 5, HOST HALF — A DEAD CREW MEMBER'S ORDER IS DROPPED.</b>
        ///
        /// <para>⚠️ <b>THE COUNT IS ASSERTED BECAUSE THE WIRE PHYSICALLY CANNOT SEE THIS.</b>
        /// <c>NeedsSystem.Kill</c> removes the citizen from the store, so the emit walk never visits
        /// her and a leaked order emits no row, changes no payload and would sit in the map for the
        /// rest of the session. A leg written against the payload could not fail.</para>
        ///
        /// <para>⚠️ <b>AND THE DEATH IS REPRODUCED, NOT DRIVEN, in THIS leg only</b> — the wreck's
        /// stack contains <see cref="SafetySystem"/>, which exists precisely to stop a crew member
        /// dying, so no fixture on the shipping ship can kill her cheaply. The three lines below are
        /// <c>NeedsSystem.Kill</c>'s own, in its order (<c>Dead</c>, <c>CancelJob</c>, remove from the
        /// store), and <see cref="OnDeath_TheOrderLeavesNoResidueInTheSim"/> is the leg that drives a
        /// REAL suffocation and proves that is what death leaves behind.</para>
        /// </summary>
        [Test]
        public void OnDeath_ThePendingOrderIsDroppedByTheHost()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var wingB = ByName(sim, "wing_b");
            var crew = sim.Citizens.Items[0];
            RemoveAllConsumables(sim);

            OrderOverTheWire(gs, crew, wingB);
            Assert.That(gs.PendingOrderCount, Is.EqualTo(1), "fixture: the order is pending");
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Not.Null, "fixture: and it is on the wire");

            crew.Dead = true;                 // NeedsSystem.Kill, line for line
            sim.CancelJob(crew);
            sim.Citizens.Remove(crew.Id);

            gs.RenderForTest();
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "⛔ the order outlived the crew member who was given it. §2.1: a designation survives " +
                "its pawn, a DIRECT ORDER does not — and this one can never be retired, because the " +
                "condition that retires it needs her to hold the job.");
            Assert.That(RepairRowAt(gs, wingB.Pos), Is.Null,
                "and no badge is left standing for an order nobody holds");
        }
    }
}
