using System.Collections.Generic;
using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-14 — THE VACUUM-WORK LADDER: a direct order may cross the pressure frontier.</b>
    ///
    /// <para><b>THE PLAYER'S SENTENCE.</b> Today an order into an airless compartment is refused
    /// silently and forever. After this a direct (held) order <b>goes anyway</b> — she walks into
    /// vacuum because you told her to — and the menu, the job and the tile's blocked-reason all
    /// agree about it.</para>
    ///
    /// <para><b>THE ANALOGUE, CITED AND NOT DERIVED:</b> <c>docs/design/rimworld-reference.md</c>
    /// §2.4 (<c>Danger</c>) and §8.4 (the four-rung override ladder). Perilune and RimWorld already
    /// made the SAME rung-0 choice — autonomous work does not enter vacuum, refused at the
    /// dispatcher — and §8.4's retraction box is binding on keeping it. This package builds three
    /// of the four rungs on top; <b>rung 1 (opt-in deadly work givers) is DEFERRED BY NAME to
    /// M3-7</b> (owner batch item 7, answer B, 2026-07-31).</para>
    ///
    /// <list type="table">
    ///   <item><b>rung 0 (KEPT)</b> — an unordered crew member with Repair on her grid never walks
    ///     into vacuum: <see cref="Rung0_AnUnorderedPawnWithRepairOn_NeverEntersTheVacuumCompartment"/>.</item>
    ///   <item><b>rung 2</b> — a job under <c>Citizen.HeldByOrder</c> bypasses
    ///     <c>WorksiteSafety.CanStageWorkerAt</c>:
    ///     <see cref="Rung2_TheOrderedPawnWalksIntoVacuumAndWorksThere"/>, and the consumable half
    ///     <see cref="Rung2_TheOrderReachesAPartsStackStrandedInVacuum"/>.</item>
    ///   <item><b>rung 3</b> — one rule at every surface that asks it:
    ///     <see cref="Rung3_TheBadgeDoesNotSayNOPARTSAboutAShipThatHasParts"/> (the reachable half,
    ///     over the wire) and <c>BlockedChannelTests</c>' held-site leg.</item>
    ///   <item><b>rung 4</b> — <c>JobKind.Flee</c> does not pull a pawn off a held order:
    ///     <see cref="Rung4_SheDoesNotFleeMidOrder"/>, <see cref="Rung4_AndHerSuffocationReallyRises"/>
    ///     (BLINDED — separate tests, fifth trap), <see cref="Rung4_SheMayDie_AndThatIsTheFeature"/>,
    ///     and <see cref="Rung4_TheSuppressionIsScopedToTheHeldPawn_TheOtherCrewMemberStillFlees"/>
    ///     (TWO crew, M2-18's precedent).</item>
    /// </list>
    ///
    /// <para>⚠️ <b>WHAT IS NOT OVERRIDDEN, AND THE LEG THAT SAYS SO:</b> the APPROACH. An order
    /// crosses air, never geometry —
    /// <see cref="TheOrderStillNeverOverridesTheApproach_AWalledInMachineIsRefusedInVacuumToo"/>
    /// runs the walled-in refusal on a stack where the air half is LIVE, which
    /// <c>PrioritiseOrderTests</c>' twin deliberately cannot (it has no
    /// <see cref="SafetySystem"/>).</para>
    ///
    /// <para><b>PIN-NEUTRAL BY CONSTRUCTION, AND THE CONSTRUCTION IS THE ARGUMENT:</b> every pinned
    /// run is unattended, no command is ever enqueued, so no job is ever <c>HeldByOrder</c> and the
    /// bypass branch is never taken. That claim is only worth having with a NON-VACUITY control
    /// beside it — a fixture that DOES issue a held order into vacuum and shows the behaviour
    /// change — which is what this file is.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND MEASURED (2026-07-31).</b> Each row
    /// was edited into the tree, the run below taken, and the tree restored from an IN-MEMORY copy
    /// — never <c>git checkout</c> (TRAPS 2) — and every file verified byte-identical by digest
    /// afterwards. A mutation that did not COMPILE would be reported INVALID rather than scored as
    /// a red (TRAPS 3), and the summary line is parsed in GERMAN because the dev machine is
    /// de-CH (TRAPS 5). <b>"RED n/91" is what the run reported</b>, over
    /// <c>VacuumOrderLadderTests|BlockedChannelTests|PrioritiseOrderTests|StickyClaimTests|UnbreathableWorksiteLivelockTests|WreckRepairEconomyTests</c>
    /// — the neighbours are in the filter so a mutation that reddened THIS file by breaking one of
    /// them would show. Baseline GREEN 0/91.</para>
    /// <list type="table">
    ///   <item><b>1 — bypass in <c>sim/</c> but NOT at <c>GameSession.BlockedReason</c></b> ⇒
    ///     <b>RED 1/91</b>: <c>BlockedChannelTests.A_Site_A_Held_Order_Is_Working_Is_Not_Badged_As_Airless</c>.</item>
    ///   <item><b>1 (the REACHABLE spelling) — <c>GameSession</c>'s <c>IsUnfixableWreck</c> left
    ///     un-forced</b> ⇒ <b>RED 1/91</b>:
    ///     <see cref="Rung3_TheBadgeDoesNotSayNOPARTSAboutAShipThatHasParts"/>.</item>
    ///   <item>⚠️ <b>1b — bypass in <c>sim/</c> but not in <c>hosts/scenario</c></b> ⇒ <b>GREEN
    ///     0/91, A CLEAN SURVIVOR, and it is reported rather than papered over.</b> Nothing drives
    ///     the scenario host's <c>--maint-audit</c> block from a test, and the branch is
    ///     unreachable on that ship anyway: the scenario issues no commands, so no job is ever
    ///     held. The parity edit is argued in the source and pinned by NOTHING. Filed.</item>
    ///   <item><b>1c — <c>MachineWearSystem.TryFindStagingTile</c>'s <c>forced</c> dropped</b> ⇒
    ///     <b>RED 8/91</b> (every driven leg in this file bar rung 0 and the badge). Same count for
    ///     <b><c>PrioritiseJobCommand</c>'s issue-time <c>forced</c></b> ⇒ <b>RED 8/91</b>.</item>
    ///   <item><b>1c — the CONSUMABLE gate's <c>forced</c> (<c>FindNearest</c>)</b> ⇒ <b>RED 2/91</b>:
    ///     <see cref="Rung2_TheOrderReachesAPartsStackStrandedInVacuum"/> and the badge leg.
    ///     <b><c>PrioritiseJobCommand</c>'s <c>IsUnfixableWreck</c></b> ⇒ <b>RED 1/91</b>.</item>
    ///   <item>⚠️ <b>1c — <c>JobContext.TryPathToAdjacent</c>'s <c>forced</c></b> ⇒ <b>GREEN 0/91,
    ///     A CLEAN SURVIVOR, AND IT IS UNREACHABLE BY CONSTRUCTION</b> — the only writer of the
    ///     hold issues <c>JobKind.Maintain</c>, and <see cref="Citizen.IsRecruitableForWork"/>
    ///     excludes a held pawn, so no dig/build/deconstruct source can claim one. The line is
    ///     wired for coherence and says so in its own doc comment; it is NOT tested into existence
    ///     with a fabricated fixture. Filed.</item>
    ///   <item><b>2 — bypass for ANY job rather than only a held one.</b> ⚠️ The single-site
    ///     spelling (<c>RecruitForNeediest</c> forced) is <b>GREEN 0/91 and genuinely INERT</b>:
    ///     <c>DriveWorker</c> re-asks the rule un-forced in the same tick, so the recruit is
    ///     claimed and abandoned before any sampler between ticks can see it. The faithful
    ///     COMPOUND spelling (both sites forced) ⇒ <b>RED 6/91</b>, headed by
    ///     <see cref="Rung0_AnUnorderedPawnWithRepairOn_NeverEntersTheVacuumCompartment"/> and
    ///     taking five of <c>UnbreathableWorksiteLivelockTests</c> with it — rung 0 is pinned by
    ///     this file AND by the file that built it.</item>
    ///   <item><b>3 — let <c>Flee</c> pre-empt a held order</b> ⇒ <b>RED 5/91</b>:
    ///     <see cref="Rung4_SheDoesNotFleeMidOrder"/>,
    ///     <see cref="Rung4_SheMayDie_AndThatIsTheFeature"/>, the two-crew leg,
    ///     <see cref="CancellingTheOrderGivesHerSelfRescueBack"/> and
    ///     <c>StickyClaimTests.Release_OnSafetyCancel_TheHeldPawnStaysInLethalAirUntilTheOrderEnds</c>.
    ///     ⚠️ <see cref="Rung4_AndHerSuffocationReallyRises"/> STAYED GREEN, which is the whole
    ///     point of blinding it: it is the leg that proves the DANGER was real, not the leg that
    ///     proves the suppression works.</item>
    ///   <item><b>5 — suppress <c>Flee</c> for ALL pawns</b> ⇒ <b>RED 5/91</b>, and the two-crew
    ///     leg <see cref="Rung4_TheSuppressionIsScopedToTheHeldPawn_TheOtherCrewMemberStillFlees"/>
    ///     is in that set together with three E0-2 legs it would otherwise kill silently. With one
    ///     crew member aboard this mutation is indistinguishable from the correct code.</item>
    ///   <item>⭐ <b>X (not chartered — the one this package could most easily have got wrong) —
    ///     let <c>forced</c> stand in for the caller's <c>IsWalkable</c> test too</b> ⇒ <b>RED
    ///     1/91</b>:
    ///     <see cref="TheOrderStillNeverOverridesTheApproach_AWalledInMachineIsRefusedInVacuumToo"/>.
    ///     <c>PrioritiseOrderTests</c>' walled-in leg cannot see it (no <see cref="SafetySystem"/>
    ///     in that stack ⇒ the rule short-circuits), which is why this file carries its own.</item>
    /// </list>
    ///
    /// <para>Charter: <c>docs/design/perilune-m3.packages.md</c> § "M3-14". Behaviour as
    /// implemented: <c>MECHANICS</c> §13.21 (the staging rule) and §6.2c/d (the hold and the
    /// order).</para>
    /// </summary>
    public class VacuumOrderLadderTests
    {
        // ══════════════════════════════════════════════════════════════════════ the fixture
        //
        // UnbreathableWorksiteLivelockTests' map, deliberately: that file pins the rung-0 refusal
        // this one bypasses, and a different map would make the two suites' results incomparable.
        //   LEFT  (x 1..3, y 1..4) — the airless work compartment
        //   RIGHT (x 5..7, y 1..4) — the pressurised refuge, where the crew live
        // The two are joined ONLY by the door tile (4,3), so they hold independent atmospheres
        // while a crew member can still walk between them.

        private static readonly string[] TwoCompartments =
        {
            "#########",
            "#...#...#",
            "#...#...#",
            "#.......#",
            "#...#...#",
            "#########",
        };

        private static readonly Int3 DoorTile = new Int3(4, 3, 0);
        private static readonly Int3 VacuumMachine = new Int3(1, 1, 0);   // left compartment
        private static readonly Int3 VacuumSideTile = new Int3(2, 1, 0);  // beside it, also airless
        private static readonly Int3 VacuumFloor = new Int3(3, 4, 0);     // left compartment, free floor
        private static readonly Int3 RefugeMachine = new Int3(6, 1, 0);   // right compartment
        private static readonly Int3 CrewHome = new Int3(7, 4, 0);        // right compartment
        private static readonly Int3 WalledMachine = new Int3(0, 0, 0);   // hull corner: no walkable neighbour

        /// <summary>
        /// The shipped stack's relative order for the systems this file needs. BOTH halves of
        /// <c>WorksiteSafety.CanCycle</c> are present — <see cref="NeedsSystem"/> and
        /// <see cref="SafetySystem"/> — which is what makes the AIR half of the staging rule LIVE
        /// here; without them the rule short-circuits to true and every leg below would be vacuous.
        ///
        /// NO <c>AtmosphereSystem</c> ON PURPOSE: nothing then refills the vacuum compartment or
        /// diffuses through the open door, so the two pressures are exactly what this fixture sets
        /// and stay that way for the whole run.
        /// </summary>
        private static Simulation NewSim()
        {
            var sim = new Simulation(AsciiWorld.Build(TwoCompartments), 7, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new NeedsSystem(),
                new SafetySystem(),
                new MaintenanceSystem(),
            });
            sim.AddDevice(DeviceKind.Door, DoorTile, "door").IsOpen = true;
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, CrewHome));
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>A machine that wants service and that the WRECK rule is not what would refuse —
        /// <c>PrioritiseOrderTests</c>' helper, restated so a change there cannot silently retune
        /// this file. At 0.30 she can jury-rig it EMPTY-HANDED, so no fetch is on the path and the
        /// legs below measure the staging rule rather than the consumable ladder.</summary>
        private static Device NeedyMachine(Simulation sim, Int3 pos, string name, float condition = 0.30f)
        {
            var machine = sim.AddDevice(DeviceKind.Scrubber, pos, name);
            machine.Condition = condition;
            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: " + name + " really wants service");
            return machine;
        }

        /// <summary>The order, sent the ONLY way a player can send one: through the command inbox
        /// (CLAUDE.md's first invariant — input only via <c>ISimCommand</c>).</summary>
        private static void Order(Simulation sim, Citizen who, Device machine)
            => sim.EnqueueCommand(new PrioritiseJobCommand((int)who.Id, (int)machine.Id));

        /// <summary>
        /// THE PREMISE EVERY LEG RESTS ON, and it is four facts because three of them are the ways
        /// this fixture could be quiet for the wrong reason: the left compartment is walkable,
        /// reachable and NOT breathable, and the right one breathes — so the crew always have
        /// somewhere to flee TO, which is what makes rung 4's suppression a real choice rather
        /// than a sealed pocket.
        /// </summary>
        private static void AssertPremises(Simulation sim)
        {
            Assert.That(sim.IsWalkable(VacuumSideTile), Is.True,
                "premise: there is a floor tile beside the machine a crew member could stand on");
            Assert.That(AtmosphereSafety.IsBreathable(sim, VacuumSideTile), Is.False,
                "premise: and the air there is lethal");
            Assert.That(AtmosphereSafety.IsBreathable(sim, CrewHome), Is.True,
                "premise: while the refuge next door breathes — so a pawn who COULD flee has " +
                "somewhere to flee to. Without this, rung 4 would be pinned by a sealed pocket " +
                "rather than by the suppression.");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, VacuumSideTile), Is.False,
                "⛔ PREMISE: the staging rule must REFUSE that tile unforced. If it accepts, both " +
                "halves of CanCycle are not in this stack and every leg here is a green vacuity.");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, VacuumSideTile, forced: true), Is.True,
                "premise: …and accept it when the player ordered it — the whole rung");
        }

        /// <summary>Tick until <paramref name="who"/> is servicing <paramref name="machine"/>, or
        /// give up. Returns the tick she took it, or -1.</summary>
        private static long DriveUntilServicing(Simulation sim, Citizen who, Device machine, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (!who.Dead && who.JobKind == JobKind.Maintain && who.JobTarget == machine.Pos)
                    return sim.TickCount;
            }
            return -1;
        }

        // ═══════════════════════════════════════════════ rung 0 — the behaviour we are KEEPING

        /// <summary>
        /// ⭐⭐ <b>RUNG 0 SURVIVED.</b> A crew member with Repair at the HIGHEST priority and a needy
        /// machine sitting in vacuum <b>stays put</b>. This is §8.4's own conclusion — *"the
        /// directive points toward keeping it"* — and it is the half of this package that is a
        /// non-change.
        ///
        /// <para>⛔ MUTATION 2 (charter): pass the bypass for ANY job rather than only a held one
        /// (e.g. <c>forced: true</c> in <c>MaintenanceSystem.RecruitForNeediest</c>) ⇒ RED here.
        /// ⚠️ THE INCLUSION CONTROL IS THE SECOND HALF: the SAME pawn, the same tick budget, an
        /// identical machine in BREATHABLE air, which she must take — otherwise "she stayed put"
        /// would be satisfied by a fixture in which she can do nothing at all.</para>
        /// </summary>
        [Test]
        public void Rung0_AnUnorderedPawnWithRepairOn_NeverEntersTheVacuumCompartment()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            pawn.SetWorkPriority(WorkType.Repair, 1); // the HIGHEST — 1 is highest here
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            for (int t = 0; t < 600; t++)
            {
                sim.Tick();
                Assert.That(pawn.JobKind == JobKind.Maintain && pawn.JobTarget == dark.Pos, Is.False,
                    "⛔ RUNG 0 IS GONE: an UNORDERED crew member walked into vacuum for a machine " +
                    "nobody told her to fix (tick " + sim.TickCount + "). The bypass is keyed on " +
                    "something other than the player's own hold.");
            }
            Assert.That(pawn.Dead, Is.False, "control: and she is alive, having never gone in");

            // INCLUSION: the same pawn, an identical machine, breathable air.
            var lit = NeedyMachine(sim, RefugeMachine, "scrubber_lit");
            sim.JobsDirty = JobBoardDirty.All;
            Assert.That(DriveUntilServicing(sim, pawn, lit, 600), Is.GreaterThan(0),
                "⛔ CONTROL FAILED: she will not take a needy machine in GOOD air either, so the " +
                "refusal above says nothing about vacuum — it says this fixture dispatches nothing.");
        }

        // ═══════════════════════════════════════════════════ rung 2 — the order crosses over

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S SENTENCE, DRIVEN: she walks into vacuum because the player told her
        /// to, and she works there.</b> The grid is at its OD-H boot state — every work type OFF —
        /// so the ORDER is the only thing that could have produced this job.
        ///
        /// <para>Three assertions, and the third is the one that separates "the order was accepted"
        /// from "the work is happening": she is HELD, she is STANDING on a tile the unforced rule
        /// refuses, and her <c>JobWorkTicks</c> are counting down — the service is under way inside
        /// the airless compartment.</para>
        ///
        /// <para>⛔ MUTATION 1c (charter): drop the <c>forced</c> argument at
        /// <c>MachineWearSystem.TryFindStagingTile</c> (the MachineWearSystem-staged path — this
        /// fixture targets a SERVICE, not a dig) ⇒ RED here. ⛔ MUTATION: drop it in
        /// <c>PrioritiseJobCommand</c> ⇒ RED here (the order is refused at issue time).</para>
        /// </summary>
        [Test]
        public void Rung2_TheOrderedPawnWalksIntoVacuumAndWorksThere()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);
            Assert.That(pawn.CanTakeWorkType(WorkType.Repair), Is.False,
                "premise: the grid is at its OD-H boot state, so nothing but the ORDER can produce " +
                "this job — the fixture a player is actually in");

            Order(sim, pawn, dark);
            long took = DriveUntilServicing(sim, pawn, dark, 200);

            Assert.That(took, Is.GreaterThan(0),
                "⛔ THE ORDER WAS REFUSED. An order into an airless compartment is still dropped " +
                "silently and forever — the defect this package exists to close.");
            Assert.That(pawn.HeldByOrder, Is.True,
                "⛔ the hold is the order (M2-19 / §2.2). Without it the bypass has nothing to read " +
                "and the very next staging pass would abandon the job.");

            // …and she gets there and starts, INSIDE the vacuum.
            for (int t = 0; t < 400 && pawn.JobWorkTicks == 0 && !pawn.Dead; t++) sim.Tick();

            Assert.That(pawn.Dead, Is.False, "premise: she must still be alive at this point");
            Assert.That(pawn.JobWorkTicks, Is.GreaterThan(0),
                "⛔ she took the order and never started work. The bypass reached the ISSUE gate " +
                "and not the DRIVE gate — MaintenanceSystem re-asks the staging rule every tick.");
            Assert.That(Int3.IsAdjacent4(pawn.Pos, dark.Pos), Is.True,
                "⛔ she is not standing beside the machine");
            Assert.That(AtmosphereSafety.IsBreathable(sim, pawn.Pos), Is.False,
                "⛔ SHE IS WORKING IN BREATHABLE AIR, so this fixture never tested the frontier at " +
                "all. The tile she stands on must be the one the unforced rule refuses.");
        }

        /// <summary>
        /// ⭐ <b>RUNG 2, THE CONSUMABLE HALF — a Parts stack stranded in vacuum is reachable by an
        /// ORDER and invisible to the dispatcher.</b> <c>MachineWearSystem.FindNearest</c> filters
        /// on the STACK'S OWN tile (*"a flee mid-carry sets its cargo down wherever the crew member
        /// happened to be standing"*), which is the second of the two places this system parks a
        /// worker — and the charter's site 2.
        ///
        /// <para>The machine is below <c>wear.wreck_threshold</c>, so the empty-handed jury-rig is
        /// refused and the fetch is the ONLY route to a service: if the stack cannot be reached the
        /// order cannot be taken at all. That is what makes this leg about the consumable gate
        /// rather than about the staging gate.</para>
        ///
        /// <para>⛔ MUTATION: drop the <c>forced</c> argument at <c>FindNearest</c> /
        /// <c>FindNearestConsumable</c> / <c>IsUnfixableWreck</c> ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void Rung2_TheOrderReachesAPartsStackStrandedInVacuum()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            // BELOW the wreck floor ⇒ no free jury-rig; a consumable is the only way to service it.
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_wrecked", 0.10f);
            Assert.That(dark.Condition, Is.LessThan(sim.Defs.Wear.WreckThreshold),
                "premise: below the wreck floor, so the empty-handed jury-rig is refused and the " +
                "FETCH is the only route to a service");
            var stranded = sim.AddItem(ItemKind.Parts, 4, VacuumFloor);
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Assert.That(AtmosphereSafety.IsBreathable(sim, stranded.Pos), Is.False,
                "premise: the ONLY Parts stack aboard is behind the pressure frontier");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, dark), Is.True,
                "⛔ PREMISE: to the DISPATCHER this wreck is unfixable — the stack is in air nobody " +
                "may fetch it from. If this is false the leg below proves nothing.");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, dark, forced: true), Is.False,
                "⛔ …and to an ORDER it is fixable, because an order may go and get it. These two " +
                "answers to the same question are the rung.");

            Order(sim, pawn, dark);
            Assert.That(DriveUntilServicing(sim, pawn, dark, 200), Is.GreaterThan(0),
                "⛔ the order was refused for want of a consumable on a ship that HAS one, three " +
                "tiles from the machine. The bypass did not reach the consumable gate.");

            bool everCarried = false;
            for (int t = 0; t < 600 && !pawn.Dead; t++)
            {
                sim.Tick();
                if (pawn.CarryingItemId == stranded.Id) everCarried = true;
            }
            Assert.That(everCarried, Is.True,
                "⛔ she took the order but never picked the stranded stack up, so the fetch leg of " +
                "the bypass is not live — only the staging leg is.");
        }

        /// <summary>
        /// ⛔ <b>AN ORDER OVERRIDES THE AIR, NEVER THE GEOMETRY.</b> A machine with no walkable
        /// 4-neighbour at all is refused with the flag set, exactly as it always was:
        /// <c>TryFindStagingTile</c> asks <see cref="Simulation.IsWalkable"/> OUTSIDE the bypass.
        ///
        /// <para>⚠️ <b>THIS IS NOT A DUPLICATE OF
        /// <c>PrioritiseOrderTests.TheOrderNeverOverridesTheStagingRule_AWalledInMachineIsRefused</c>,
        /// AND THE DIFFERENCE IS THE POINT.</b> That file's stack has NO
        /// <see cref="SafetySystem"/>, so <c>CanStageWorkerAt</c> short-circuits to true there and
        /// its walled-in leg would stay green even if the bypass had swallowed the walkability test
        /// too. Here both halves of <c>CanCycle</c> are live, so this is the version of the claim
        /// that can actually see that mistake.</para>
        ///
        /// <para>⛔ MUTATION: make <c>CanStageWorkerAt(…, forced: true)</c> also stand in for the
        /// caller's <c>IsWalkable</c> test ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void TheOrderStillNeverOverridesTheApproach_AWalledInMachineIsRefusedInVacuumToo()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            var walled = NeedyMachine(sim, WalledMachine, "scrubber_walled");
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, walled.Pos, out _, forced: true), Is.False,
                "premise: even FORCED there is nowhere beside the walled-in machine to stand");

            Order(sim, pawn, walled);
            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(pawn.JobKind == JobKind.Maintain && pawn.JobTarget == walled.Pos, Is.False,
                "⛔ an order sent a crew member to a machine she cannot stand beside. The bypass " +
                "waives the AIR question and must not touch the approach.");
            Assert.That(pawn.HeldByOrder, Is.False, "⛔ and no hold was left on a refused order");

            // INCLUSION: the same pawn, the same budget, the AIRLESS-but-approachable machine.
            Order(sim, pawn, dark);
            Assert.That(DriveUntilServicing(sim, pawn, dark, 200), Is.GreaterThan(0),
                "⛔ CONTROL: the refusal above must be about the WALLS, not about this fixture being " +
                "unable to accept any order at all.");
        }

        // ═════════════════════════════════════════ rung 4 — suppressible self-rescue (BLINDED)

        /// <summary>
        /// ⭐⭐ <b>RUNG 4 — SHE DOES NOT FLEE MID-ORDER.</b> Past the flee threshold, on a tile whose
        /// air is lethal, with breathable air one room away, a <c>HeldByOrder</c> crew member stays
        /// on the job. §8.4, <c>JobGiver_FindOxygen</c>: *"the player can order a colonist to stay
        /// and suffocate, and RimWorld implements that deliberately as one clause."*
        ///
        /// <para>⚠️ <b>BLINDED (fifth trap).</b> <c>assert</c> throws, so a two-legged test reports
        /// only its first leg — and the leg that could go dead here is *"her suffocation actually
        /// rose"*. It is therefore its OWN test
        /// (<see cref="Rung4_AndHerSuffocationReallyRises"/>), not a second assertion in this one.
        /// This test asserts only the JOB.</para>
        ///
        /// <para>⛔ MUTATION 3 (charter): delete <c>if (c.HeldByOrder) continue;</c> from
        /// <c>SafetySystem.Tick</c> ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void Rung4_SheDoesNotFleeMidOrder()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Order(sim, pawn, dark);
            Assert.That(DriveUntilServicing(sim, pawn, dark, 200), Is.GreaterThan(0),
                "fixture: the order must land before the flee question can even be asked");

            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            bool everFled = false;
            for (int t = 0; t < 600 && !pawn.Dead; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Flee) everFled = true;
            }

            Assert.That(everFled, Is.False,
                "⛔ SHE FLED AN ORDER THE PLAYER GAVE. Rung 4 is gone: a bypass that quietly " +
                "rescues the pawn is a bypass the player cannot reason about, and it re-creates the " +
                "silent refusal in a nicer costume. (flee threshold " +
                fleeAt.ToString(System.Globalization.CultureInfo.InvariantCulture) + ")");
        }

        /// <summary>
        /// ⭐ <b>THE BLINDED SECOND LEG: her suffocation really does climb past the flee
        /// threshold.</b> Without this, <see cref="Rung4_SheDoesNotFleeMidOrder"/> would be
        /// satisfied by a fixture in which the flee question is never asked at all — a pawn who
        /// never suffocates never flees, and the two are indistinguishable from the outside.
        ///
        /// <para>This is the ⭐ acceptance step *"her Suffocation climbs on the crew dock"*, driven.</para>
        /// </summary>
        [Test]
        public void Rung4_AndHerSuffocationReallyRises()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Order(sim, pawn, dark);
            Assert.That(DriveUntilServicing(sim, pawn, dark, 200), Is.GreaterThan(0),
                "fixture: the order must land");

            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            float peak = 0f;
            for (int t = 0; t < 600 && !pawn.Dead; t++)
            {
                sim.Tick();
                if (pawn.Suffocation > peak) peak = pawn.Suffocation;
            }

            Assert.That(peak, Is.GreaterThan(fleeAt),
                "⛔ THE FLEE QUESTION WAS NEVER ASKED. Her suffocation never reached the threshold, " +
                "so the sibling test's 'she did not flee' is a green vacuity rather than a claim " +
                "about the suppression.");
        }

        /// <summary>
        /// ⭐⭐ <b>SHE MAY DIE, AND THAT IS THE FEATURE.</b> The acceptance step a reviewer will want
        /// softened; §8.4 says RimWorld ships exactly this clause and the charter says <b>do
        /// not</b>. Left as an order in hard vacuum, she suffocates and the game does not save her.
        ///
        /// <para>⚠️ <b>THE CONTROL IS THE OTHER HALF, AND IT IS WHAT KEEPS THIS FROM PINNING "THE
        /// SIM KILLS PEOPLE":</b> an identical pawn in the same compartment with NO order lives,
        /// because rung 4 is scoped to the hold and nothing else.</para>
        /// </summary>
        [Test]
        public void Rung4_SheMayDie_AndThatIsTheFeature()
        {
            var sim = NewSim();
            var ordered = sim.AddCitizen("Adeyemi", CrewHome);
            var bystander = sim.AddCitizen("Rell", CrewHome);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Order(sim, ordered, dark);
            Assert.That(DriveUntilServicing(sim, ordered, dark, 200), Is.GreaterThan(0),
                "fixture: the order must land");

            for (int t = 0; t < 2000 && !ordered.Dead; t++) sim.Tick();

            Assert.That(ordered.Dead, Is.True,
                "⛔ THE ORDER WAS QUIETLY RESCUED. She was held on a 900 s service in hard vacuum " +
                "with a 90 s survival budget; something pulled her out, and the player's order no " +
                "longer means what it says.");
            Assert.That(bystander.Dead, Is.False,
                "⛔ CONTROL: the un-ordered crew member died too, so this test pins 'the sim kills " +
                "people' rather than 'an order suppresses self-rescue'.");
        }

        /// <summary>
        /// ⭐⭐ <b>THE SUPPRESSION IS SCOPED TO THE HELD PAWN — THE TWO-CREW LEG.</b> With one crew
        /// member aboard, "Flee is suppressed for the held pawn" and "Flee is suppressed for
        /// everybody" are indistinguishable (M2-18's precedent), so this fixture carries two: one
        /// ORDERED into the vacuum and one who simply walks in.
        ///
        /// <para>⛔ MUTATION 5 (charter): suppress <c>Flee</c> for ALL pawns (drop the
        /// <c>c.HeldByOrder</c> condition and <c>continue</c> unconditionally, or hoist the guard
        /// out of the per-citizen loop) ⇒ RED here, GREEN in every other test in this file.</para>
        /// </summary>
        [Test]
        public void Rung4_TheSuppressionIsScopedToTheHeldPawn_TheOtherCrewMemberStillFlees()
        {
            var sim = NewSim();
            var ordered = sim.AddCitizen("Adeyemi", CrewHome);
            // The second soul starts INSIDE the airless compartment and is given no order at all.
            var stranded = sim.AddCitizen("Rell", VacuumFloor);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);
            Assert.That(AtmosphereSafety.IsBreathable(sim, stranded.Pos), Is.False,
                "premise: the second crew member starts in the lethal compartment");

            Order(sim, ordered, dark);
            Assert.That(DriveUntilServicing(sim, ordered, dark, 200), Is.GreaterThan(0),
                "fixture: the order must land");

            bool strandedFled = false, orderedFled = false;
            for (int t = 0; t < 900 && !ordered.Dead; t++)
            {
                sim.Tick();
                if (!stranded.Dead && stranded.JobKind == JobKind.Flee) strandedFled = true;
                if (!ordered.Dead && ordered.JobKind == JobKind.Flee) orderedFled = true;
            }

            Assert.That(strandedFled, Is.True,
                "⛔ THE UN-ORDERED CREW MEMBER NEVER FLED. Self-rescue has been suppressed for the " +
                "whole ship rather than for the pawn the player ordered — the E0-2 guard is dead " +
                "and every crew member now stands in bad air until they drop.");
            Assert.That(orderedFled, Is.False,
                "control: and the ORDERED one still did not flee, so the leg above is not simply " +
                "'the suppression was reverted'");
        }

        // ═════════════════════════════════════════════ the release — autonomy resumes (OD-G)

        /// <summary>
        /// ⭐ <b>THE HOLD ENDS AND THE RESCUE COMES BACK.</b> Rung 4 is scoped to the ORDER, not to
        /// the pawn: <c>Citizen.JobKind</c>'s setter releases the hold on the way past
        /// <c>None</c>, so the moment the player cancels, the very next 1 Hz pass of
        /// <see cref="SafetySystem"/> sees an ordinary suffocating crew member and pulls her out.
        /// This is OD-G's *"autonomy is what she returns to when the job ends"*, in its most
        /// literal form.
        ///
        /// <para>⛔ MUTATION: key the suppression on something with a longer life than the job (a
        /// per-pawn flag, a timer, a saved order registry) ⇒ RED here — she would keep standing
        /// there after the order was cancelled.</para>
        /// </summary>
        [Test]
        public void CancellingTheOrderGivesHerSelfRescueBack()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Adeyemi", CrewHome);
            var dark = NeedyMachine(sim, VacuumMachine, "scrubber_dark");
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            AssertPremises(sim);

            Order(sim, pawn, dark);
            Assert.That(DriveUntilServicing(sim, pawn, dark, 200), Is.GreaterThan(0),
                "fixture: the order must land");

            // Drive her past the flee threshold while she is still held — she stays.
            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            for (int t = 0; t < 600 && !pawn.Dead && pawn.Suffocation <= fleeAt; t++) sim.Tick();
            Assert.That(pawn.Dead, Is.False, "premise: still alive at the threshold");
            Assert.That(pawn.Suffocation, Is.GreaterThan(fleeAt), "premise: past the flee threshold");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain), "premise: and still on the order");

            // THE CANCEL — the player changes their mind.
            sim.CancelJob(pawn);
            Assert.That(pawn.HeldByOrder, Is.False,
                "premise: ending the job released the hold (the JobKind setter's contract)");

            bool fled = false;
            for (int t = 0; t < 200 && !pawn.Dead; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Flee) fled = true;
            }
            Assert.That(fled, Is.True,
                "⛔ SHE STAYED IN THE VACUUM AFTER THE ORDER WAS CANCELLED. The suppression outlives " +
                "the order it belongs to, so the player can no longer take it back.");
        }

        // ══════════════════════════════════════════ rung 3 — the surfaces tell the same story
        //
        // The wire half, on --ship wreck: the reachable case in which an un-bypassed host would
        // paint a badge that is FALSE ABOUT THE SHIP. The held-site leg for `BlockedReason` itself
        // lives in BlockedChannelTests, beside the rest of that channel's suite.

        /// <summary>The shipping ship, with a session over it and no sim thread —
        /// <c>PrioritiseOrderTests.BootWreck</c>, restated.</summary>
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        /// <summary>Every Parts / Seals / Swarf stack, gone — <c>PrioritiseOrderTests</c>' helper.
        /// All three kinds, because <c>IsUnfixableWreck</c> asks with <c>allowSwarf: true</c>.</summary>
        private static void RemoveAllConsumables(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
                if (it.Kind == ItemKind.Parts || it.Kind == ItemKind.Seals || it.Kind == ItemKind.Swarf)
                    doomed.Add(it.Id);
            foreach (var id in doomed) sim.Items.Remove(id);
        }

        private static (int X, int Y, int Deck, int Order, int Reason)? RepairRowAt(GameSession gs, Int3 p)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up");
            int at = json.IndexOf("[[", System.StringComparison.Ordinal);
            if (at < 0) return null;
            foreach (var part in json.Substring(at + 1).Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Substring(0, part.IndexOf(']')).Split(',');
                if (f.Length < 5) continue;
                var row = (X: int.Parse(f[0], System.Globalization.CultureInfo.InvariantCulture),
                           Y: int.Parse(f[1], System.Globalization.CultureInfo.InvariantCulture),
                           Deck: int.Parse(f[2], System.Globalization.CultureInfo.InvariantCulture),
                           Order: int.Parse(f[3], System.Globalization.CultureInfo.InvariantCulture),
                           Reason: int.Parse(f[4], System.Globalization.CultureInfo.InvariantCulture));
                if (row.Order == WireFormat.OrderRepair && row.X == p.X && row.Y == p.Y && row.Deck == p.Z)
                    return row;
            }
            return null;
        }

        /// <summary>Right-click ▸ <i>prioritise: repair</i>, as the wire spells it.</summary>
        private static void OrderOverTheWire(GameSession gs, Citizen who, Device machine)
            => gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, machine.Pos.X, machine.Pos.Y,
                                             i: machine.Pos.Z, cid: who.Id));

        /// <summary>A walkable, EXPLORED tile on the wreck whose air is not survivable — where a
        /// stack can be stranded behind the pressure frontier. Deterministic (z,y,x, first match),
        /// and a PREMISE: if the wreck ever boots pressurised this fails loudly rather than turning
        /// the leg below into a vacuity.</summary>
        private static Int3 FindAirlessFloor(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!sim.IsWalkable(p)) continue;
                        if (WorksiteSafety.CanStageWorkerAt(sim, p)) continue;
                        return p;
                    }
            Assert.Fail("PREMISE FAILED: --ship wreck has no explored, walkable tile the staging " +
                        "rule refuses, so a stack cannot be stranded behind the frontier and the " +
                        "leg below is vacuous.");
            return default;
        }

        /// <summary>
        /// ⭐⭐ <b>RUNG 3, THE REACHABLE HALF: THE BADGE MUST NOT SAY "NO PARTS ABOARD" ABOUT A SHIP
        /// THAT HAS PARTS.</b> The wreck premise makes this state ordinary — a machine below the
        /// wreck floor and the only consumable aboard stranded behind the pressure frontier.
        ///
        /// <para>The dispatcher's answer is UNFIXABLE and it is correct: nobody may fetch that
        /// stack on their own. The ORDER's answer is FIXABLE, because it may. A
        /// <c>GameSession</c> that kept asking the dispatcher's question about the player's order
        /// would stamp <c>ReasonNoConsumable</c> — *"NO PARTS OR SEALS ABOARD"* — <b>over a ship
        /// that is holding four Parts.</b></para>
        ///
        /// <para>⚠️ <b>AND THAT SENTENCE USED TO READ "over a repair that is already under way three
        /// tiles from the stack", WHICH IS MORE THAN THIS FIXTURE SHOWS — corrected by independent
        /// review rather than by growing the fixture.</b> What is asserted here is the BADGE and
        /// only the badge: the row is gone because the host now asks the player's question. Whether
        /// the sim also TOOK the order on this ship at this tick is a separate fact this leg does
        /// not establish (it is <see cref="Rung2_TheOrderReachesAPartsStackStrandedInVacuum"/>'s,
        /// on a fixture built for it), and claiming it here would be a test's prose asserting what
        /// its own asserts do not — the exact defect this repo has retracted three headline claims
        /// for. <b>The badge is the deliverable; the fetch is pinned next door.</b></para>
        ///
        /// <para>⚠️ THE CONTROL COMES FIRST AND IT IS NOT DECORATION: with the stack REMOVED
        /// entirely the badge must be up, or the absence asserted afterwards would be satisfied by
        /// a host that emits nothing at all.</para>
        ///
        /// <para>⛔ MUTATION 1 (charter), the reachable spelling: bypass in <c>sim/</c> but leave
        /// <c>GameSession</c>'s <c>IsUnfixableWreck</c> call un-forced ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void Rung3_TheBadgeDoesNotSayNOPARTSAboutAShipThatHasParts()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var crew = sim.Citizens.Items[0];
            RemoveAllConsumables(sim);

            Device wreckMachine = null;
            foreach (var d in sim.Devices.Items)
                if (d.Condition < sim.Defs.Wear.WreckThreshold &&
                    MaintenanceSystem.TryFindStagingTile(sim, d.Pos, out _, forced: true))
                { wreckMachine = d; break; }
            Assert.IsNotNull(wreckMachine,
                "PREMISE FAILED: the wreck has no machine below wear.wreck_threshold with anywhere " +
                "at all to stand — nothing here can be ordered and the leg is vacuous.");

            // CONTROL: nothing aboard at all ⇒ the badge is up and the order is refused.
            OrderOverTheWire(gs, crew, wreckMachine);
            Assert.That(RepairRowAt(gs, wreckMachine.Pos), Is.Not.Null,
                "⛔ CONTROL FAILED: with every consumable stripped the NO-PARTS badge is not up, so " +
                "the absence asserted below would prove nothing.");

            // …now strand ONE Parts stack behind the frontier. The ship HAS parts.
            var airless = FindAirlessFloor(sim);
            var stranded = sim.AddItem(ItemKind.Parts, 4, airless);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, stranded.Pos), Is.False,
                "premise: the stack really is somewhere the dispatcher may not fetch it from");
            Assert.That(MaintenanceSystem.IsUnfixableWreck(sim, wreckMachine), Is.True,
                "premise: so the DISPATCHER still calls the machine unfixable — correctly");

            OrderOverTheWire(gs, crew, wreckMachine);

            Assert.That(RepairRowAt(gs, wreckMachine.Pos), Is.Null,
                "⛔ THE BADGE SAYS 'NO PARTS OR SEALS ABOARD' ABOUT A SHIP HOLDING FOUR PARTS. The " +
                "host is asking the dispatcher's question about the PLAYER'S ORDER: one rule, one " +
                "flag, both gates (§8.4 rung 3). A false badge is worse than the silence this " +
                "channel exists to remove.");
        }
    }
}
