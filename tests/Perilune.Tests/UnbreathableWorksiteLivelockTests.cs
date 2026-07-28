using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// REGRESSION TESTS for the maintenance / deconstruct LIVELOCK — <c>docs/HANDOVER.md</c> §5
    /// item 2, the same class as the haul livelock E0-4 WP-7 fixed and never fixed for work that
    /// stands still at a tile.
    ///
    /// THE PATHOLOGY THAT WAS. Nothing in the dispatcher asked whether a worker could SURVIVE at
    /// the tile it was about to be parked on, so:
    ///
    ///   pass N   : <c>MaintenanceSystem.RecruitForNeediest</c> picks the neediest machine — one
    ///              sitting in a vacuum compartment — stamps an idle crew member
    ///              <c>JobKind.Maintain</c> and paths it there.
    ///   +45 s    : <c>Suffocation</c> crosses <c>flee_suffocation</c>. <c>SafetySystem</c> calls
    ///              <c>Simulation.CancelJob</c> and takes <c>JobKind.Flee</c>; the crew member
    ///              walks back to air.
    ///   +~8 s    : recovered below half the threshold ⇒ back to <c>JobKind.None</c>.
    ///   pass N+1 : the machine is STILL needy (no work ever landed on it) and the crew member is
    ///              idle again, so it is recruited for the same machine. Forever.
    ///
    /// <c>DeconstructJobSource</c> is the same shape and its existing <c>_retryAt</c> backoff
    /// cannot see it: that stamp is only written when <c>FindPath</c> FAILS, and here the path
    /// succeeds every time.
    ///
    /// MEASURED before the fix, <c>--ship grid</c>, seed 20260723 (<c>occupancy --maint-audit</c>):
    ///   14 sim-days, no flags : Maintain 16.245 % / Flee 4.325 %; 47 640 job starts of which
    ///                           18 301 ended in a flee; 311 services in 14 days, and in the FINAL
    ///                           HOUR 643 starts against 2 services. From ~h270 the hourly report
    ///                           reads 91 % busy / 70 % "productive" forever, which scores A1 PASS.
    ///   2 sim-days, --strip 20 --strip-deck 2 : Deconstruct 24.653 % / Flee 19.072 %; 7 429 job
    ///                           starts of which 7 427 ended in a flee; 0 of 20 walls torn down.
    /// After: 297 / 0 / 308 and 0 / 0 / 0 respectively — see the commit message for the table.
    ///
    /// THE FIX. One rule — <see cref="WorksiteSafety.CanStageWorkerAt"/> — asked by the only two
    /// places in the sim that choose the tile a worker will stand on: <see cref="JobWork"/>'s
    /// <c>TryPathToAdjacent</c> (dig, build, deconstruct) and <c>MaintenanceSystem</c>'s
    /// <c>TryFindStagingTile</c>. It adds no state, no save field, no hash fold and no def, and it
    /// is INERT unless both a <see cref="NeedsSystem"/> and a <see cref="SafetySystem"/> are
    /// registered.
    ///
    /// WHAT EACH TEST IS FOR, because "no churn" alone is satisfied by a dozen wrong fixes:
    ///   • the two REFUSAL tests pin that the cycle is gone;
    ///   • the two CONTROLS pin that real maintenance and real stripping still happen — a rule that
    ///     bought its quiet board by suppressing all work would be worse than the livelock;
    ///   • <see cref="RepressurisingTheCompartment_MakesTheRefusedMachineServiceableAgain"/> pins
    ///     that it is a LIVE predicate and not a blacklist;
    ///   • <see cref="PlantedServicerInVacuum_Flees_AndIsNeverPutBackOnTheJob"/> is the INCLUSION
    ///     control: it plants the known violation and requires the guard to catch its consequence;
    ///   • <see cref="AMachineOnAPressureBoundary_IsServicedFromTheBreathableSide"/> pins the half
    ///     of the rule that is easy to leave out and that the grid ship's own needy machines (eight
    ///     DOORS) would have defeated;
    ///   • <see cref="WithoutNeedsOrSafety_TheRuleIsInertAndVacuumWorkIsStillDispatched"/> pins the
    ///     inertness condition, which is what keeps every atmosphere-free fixture and host alive;
    ///   • <see cref="ADigReachedOnlyThroughADoorway_IsStillWorked"/> pins that a DOOR TILE IS NOT
    ///     VACUUM — the mistake the first draft made, which refused the shipped slice's whole aft
    ///     dig field and moved the slice tick-3000 golden.
    ///
    /// THE NAMED MUTATIONS. Each was physically applied to the shipped source, the suite run, the
    /// failure set read, and the source restored from a copy taken before the first mutation (never
    /// from git — <c>CLAUDE.md</c> trap 2). Counts are failures within THIS file:
    ///   M-1  <c>JobWork.TryPathToAdjacent</c> drops its <c>CanStageWorkerAt</c> guard      → 1  (sole)
    ///   M-2  <c>MaintenanceSystem.TryFindStagingTile</c> drops its guard                   → 4
    ///   M-3  <c>CanStageWorkerAt</c> refuses every non-doorway tile                        → 4
    ///   M-4  <c>CanCycle</c> is always true (the rule stops being inert)                   → 1  (sole)
    ///   M-5  the <c>DoorMarker</c> clause is dropped (a doorway reads as the vacuum sink)  → 1  (sole)
    /// "(sole)" = exactly one test in this file catches it. Every run was a SEMANTIC red: the
    /// harness fails the whole run if the mutated tree emits a single <c>CS</c> error, because a
    /// mutation that does not compile reddens for the wrong reason and proves nothing
    /// (<c>CLAUDE.md</c> trap 3).
    /// </summary>
    public class UnbreathableWorksiteLivelockTests
    {
        // Two compartments joined ONLY by the door tile (4,3), so they hold independent
        // atmospheres while a crew member can still walk between them.
        //   LEFT  (x 1..3, y 1..4) — the work compartment
        //   RIGHT (x 5..7, y 1..4) — the refuge, where the crew live
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
        private static readonly Int3 WorkMachine = new Int3(1, 1, 0);   // left compartment
        private static readonly Int3 RefugeMachine = new Int3(6, 1, 0); // right compartment
        private static readonly Int3 WorkStrip = new Int3(2, 2, 0);     // interior wall, left compartment
        private static readonly Int3 RefugeStrip = new Int3(6, 2, 0);   // interior wall, right compartment
        private static readonly Int3 CrewHome = new Int3(7, 4, 0);      // right compartment
        private static readonly Int3 WorkSideTile = new Int3(2, 1, 0);  // left compartment, walkable

        /// <summary>Neither wall may be pressure hull, or the strip legs below would be refused for
        /// a completely different reason and would pass while asserting nothing about air.</summary>
        private static void AssertStripSitesAreLegal(Simulation sim)
        {
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, WorkStrip), Is.False,
                "premise: the work-compartment strip site must be an interior wall, not hull");
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, RefugeStrip), Is.False,
                "premise: the refuge strip site must be an interior wall, not hull");
        }

        /// <summary>
        /// The fixture. <paramref name="withNeeds"/>/<paramref name="withGuard"/> exist only for
        /// the inertness test; every other caller takes both.
        ///
        /// NO AtmosphereSystem ON PURPOSE: nothing then refills the vacuum compartment or diffuses
        /// through the open door, so the two pressures are exactly what this fixture sets and stay
        /// that way for the whole run. NO MachineWearSystem either — Condition is set by hand, so a
        /// Condition that RISES can only be a completed service.
        /// </summary>
        private static Simulation NewSim(bool withNeeds = true, bool withGuard = true)
        {
            var systems = new List<ISimSystem> { new CitizenSystem(), new JobSystem() };
            if (withNeeds) systems.Add(new NeedsSystem());
            if (withGuard) systems.Add(new SafetySystem());
            systems.Add(new MaintenanceSystem());
            systems.Add(new DeconstructSystem());

            var sim = new Simulation(AsciiWorld.Build(TwoCompartments), 7, systems.ToArray());
            sim.World.SetWall(WorkStrip, TileDefs.Wall);   // an interior partition in each compartment,
            sim.World.SetWall(RefugeStrip, TileDefs.Wall); // so a strip can be designated on either side
            sim.AddDevice(DeviceKind.Door, DoorTile, "door").IsOpen = true;

            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, CrewHome));

            sim.AddCitizen("Adeyemi", CrewHome);
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        private static Device NeedyMachineAt(Simulation sim, Int3 pos, string name)
        {
            var d = sim.AddDevice(DeviceKind.Scrubber, pos, name);
            d.Condition = 0.2f; // below maintain_below (0.4), above fail_below (0.10)
            Assert.That(d.Condition, Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "premise: the fixture machine must actually want service");
            return d;
        }

        /// <summary>Counts of interest over a run. <see cref="Services"/> counts a device whose
        /// Condition ROSE — with no MachineWearSystem in the stack nothing else can move it, so it
        /// is a direct reading of work completed rather than of work attempted.</summary>
        private struct Counts
        {
            public int MaintainStarts, DeconstructStarts, FleeStarts, Services;
            // TICKS as well as STARTS, because a job claimed on the premise tick — before Run() takes
            // its first snapshot — is a job in progress with no transition to count. The refusal
            // tests assert BOTH are zero; the controls assert on ticks, which cannot miss it.
            public int MaintainTicks, DeconstructTicks;
            public bool AnyoneDied;
        }

        private static Counts Run(Simulation sim, int ticks)
        {
            var crew = sim.Citizens.Items;
            var wasKind = new JobKind[crew.Count];
            for (int i = 0; i < crew.Count; i++) wasKind[i] = crew[i].JobKind;
            var wasCondition = new Dictionary<uint, float>();
            foreach (var d in sim.Devices.Items) wasCondition[d.Id] = d.Condition;

            var c = new Counts();
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                for (int i = 0; i < crew.Count && i < wasKind.Length; i++)
                {
                    var now = crew[i].Dead ? JobKind.None : crew[i].JobKind;
                    if (crew[i].Dead) c.AnyoneDied = true;
                    if (now == JobKind.Maintain) c.MaintainTicks++;
                    if (now == JobKind.Deconstruct) c.DeconstructTicks++;
                    if (now != wasKind[i])
                    {
                        if (now == JobKind.Maintain) c.MaintainStarts++;
                        if (now == JobKind.Deconstruct) c.DeconstructStarts++;
                        if (now == JobKind.Flee) c.FleeStarts++;
                        wasKind[i] = now;
                    }
                }
                foreach (var d in sim.Devices.Items)
                {
                    if (wasCondition.TryGetValue(d.Id, out float before) && d.Condition > before) c.Services++;
                    wasCondition[d.Id] = d.Condition;
                }
            }
            return c;
        }

        // ------------------------------------------------------------------ the premise

        /// <summary>
        /// THE PREMISE EVERY REFUSAL TEST RESTS ON, and it is four separate facts because three of
        /// them are the ways this fixture could be quiet for the WRONG reason. The machine is needy;
        /// there IS a walkable tile beside it (so "walled in" is not the explanation); a crew member
        /// CAN path to that tile (so the WP-7 unreachable backoff is not the explanation); and the
        /// air there is lethal (so the rule under test is the only thing left).
        /// </summary>
        [Test]
        public void TheVacuumCompartment_IsWalkableAndReachable_ButNotBreathable()
        {
            var sim = NewSim();
            var machine = NeedyMachineAt(sim, WorkMachine, "scrubber_dark");
            sim.Tick();

            Assert.That(sim.IsWalkable(WorkSideTile), Is.True,
                "premise: there is a floor tile beside the machine a crew member could stand on");
            Assert.That(Int3.IsAdjacent4(WorkSideTile, machine.Pos), Is.True,
                "premise: and it is adjacent to the machine");
            var path = new List<Int3>(64);
            Assert.That(sim.Paths.FindPath(sim, sim.Citizens.Items[0].Pos, WorkSideTile, path), Is.True,
                "premise: the crew member can PATH there — this is not the WP-7 unreachable case");
            Assert.That(AtmosphereSafety.IsBreathable(sim, WorkSideTile), Is.False,
                "premise: and the air there is lethal");
            Assert.That(AtmosphereSafety.IsBreathable(sim, CrewHome), Is.True,
                "premise: while the refuge next door breathes — so the crew has somewhere to flee TO, " +
                "which is exactly what makes the cycle infinite instead of fatal");
        }

        // ------------------------------------------------------------------- the refusals

        /// <summary>
        /// THE MAINTENANCE LIVELOCK IS GONE. A needy machine in vacuum is never staffed at all: no
        /// Maintain job is ever started, so no flee ever follows, and the crew member sits idle in
        /// breathable air instead of walking a 45-second death loop for the rest of the game.
        ///
        /// NAMED MUTATIONS caught here: M-2 (MaintenanceSystem's staging picker drops the guard) and
        /// M-3.
        /// </summary>
        [Test]
        public void NeedyMachineInVacuum_IsNeverStaffed_AndNobodyEverFlees()
        {
            var sim = NewSim();
            var machine = NeedyMachineAt(sim, WorkMachine, "scrubber_dark");

            var c = Run(sim, 12000); // > one 900 s service plus travel

            Assert.That(c.MaintainStarts, Is.Zero,
                "a machine nobody can survive beside must never be staffed — the shipped bug started " +
                "a job every ~100 s per crew member, forever");
            Assert.That(c.FleeStarts, Is.Zero,
                "and with no job to walk into, there is nothing to flee from");
            Assert.That(c.AnyoneDied, Is.False, "the crew member is alive and idle, not dead and busy");
            Assert.That(machine.Condition, Is.EqualTo(0.2f),
                "the machine is not repaired either — that is the honest cost, and it was never " +
                "repairable: a 900 s service against a 45 s flee deadline cannot be completed");
        }

        /// <summary>
        /// THE DECONSTRUCT LIVELOCK IS GONE — the second instance, and the one whose existing
        /// <c>_retryAt</c> backoff could never see the problem because the path SUCCEEDS.
        ///
        /// NAMED MUTATION caught here: M-1 (JobWork.TryPathToAdjacent drops the guard). This test is
        /// the ONLY one in the file M-1 fails, so it is the sole guard on that call site — the
        /// maintenance tests cannot see it, because maintenance stages through its own picker.
        /// </summary>
        [Test]
        public void StripSiteInVacuum_IsNeverClaimed_AndTheSiteStaysPending()
        {
            var sim = NewSim();
            AssertStripSitesAreLegal(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(WorkStrip, DeconstructKind.Wall, on: true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1),
                "premise: the designation was accepted, so there IS strip demand on the board");

            var c = Run(sim, 6000); // > four 120 s wall strips

            Assert.That(c.DeconstructStarts, Is.Zero,
                "a strip nobody can survive beside must never be claimed — the shipped bug claimed " +
                "and abandoned it thousands of times per sim-day");
            Assert.That(c.DeconstructTicks, Is.Zero,
                "and not one tick of it was ever worked — the belt to the STARTS brace, so a claim " +
                "taken on the premise tick could not hide inside a zero transition count");
            Assert.That(c.FleeStarts, Is.Zero, "and therefore nothing flees");
            Assert.That(sim.World.GetWall(WorkStrip), Is.EqualTo(TileDefs.Wall),
                "the wall is still standing — unachievable work is refused, not silently completed");
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1),
                "and the player's designation is still there, waiting for the compartment to be " +
                "repressurised — a refusal must not consume the order");
        }

        // ------------------------------------------------------------------- the controls

        /// <summary>
        /// THE FIX MUST NOT BUY ITS QUIET BOARD BY SUPPRESSING WORK. Same fixture, machine moved
        /// into the breathable compartment: it is staffed and it is actually REPAIRED.
        ///
        /// NAMED MUTATION caught here: M-3 (refuse everything). That is the whole shape of "the fix
        /// is worse than the bug" — a rule that never lets anyone work anywhere greys out the entire
        /// colony, and this control is what refuses to let that pass.
        /// </summary>
        [Test]
        public void NeedyMachineInBreathableAir_IsStillServiced()
        {
            var sim = NewSim();
            var machine = NeedyMachineAt(sim, RefugeMachine, "scrubber_bright");

            var c = Run(sim, 12000);

            Assert.That(c.MaintainStarts, Is.GreaterThan(0), "a serviceable machine must still be staffed");
            Assert.That(c.Services, Is.GreaterThan(0), "and the service must actually COMPLETE");
            Assert.That(machine.Condition, Is.EqualTo(sim.Defs.Wear.JuryRigCondition),
                "the ship holds no Parts and no Seals, so the completed service is a jury-rig — the " +
                "exact value pins that a real MaintenanceSystem completion ran, not some other write");
            Assert.That(c.FleeStarts, Is.Zero, "nobody was ever in danger");
        }

        /// <summary>
        /// The strip control. A designated interior wall in breathable air is still torn down.
        ///
        /// NAMED MUTATION caught here: M-3.
        /// </summary>
        [Test]
        public void StripSiteInBreathableAir_IsStillTornDown()
        {
            var sim = NewSim();
            AssertStripSitesAreLegal(sim);
            sim.EnqueueCommand(new DesignateDeconstructCommand(RefugeStrip, DeconstructKind.Wall, on: true));
            sim.Tick();
            Assert.That(sim.Deconstruct.Pending.Count, Is.EqualTo(1), "premise: the designation took");

            var c = Run(sim, 6000);

            Assert.That(c.DeconstructTicks, Is.GreaterThan(0), "a survivable strip must still be claimed and worked");
            Assert.That(sim.World.GetWall(RefugeStrip), Is.Not.EqualTo(TileDefs.Wall),
                "and the wall must actually come down");
            Assert.That(sim.Deconstruct.Pending.Count, Is.Zero, "the site is consumed on completion");
        }

        // --------------------------------------------------------- a predicate, not a blacklist

        /// <summary>
        /// IT IS A LIVE PREDICATE, NOT A BLACKLIST — the test that would catch the obvious wrong fix
        /// (remember the refused machine and never offer it again) and the subtle one (a backoff
        /// nothing ever re-triggers). Nothing is remembered anywhere, so simply giving the
        /// compartment air makes the machine serviceable with no invalidation hook, no timer to wait
        /// out and no rescan trigger of any kind: the atmosphere is written DIRECTLY here, setting
        /// no <see cref="Simulation.JobsDirty"/> flag and publishing no event.
        ///
        /// NAMED MUTATION caught here: M-3.
        /// </summary>
        [Test]
        public void RepressurisingTheCompartment_MakesTheRefusedMachineServiceableAgain()
        {
            var sim = NewSim();
            var machine = NeedyMachineAt(sim, WorkMachine, "scrubber_dark");

            var before = Run(sim, 3000);
            Assert.That(before.MaintainStarts, Is.Zero, "premise: refused while the compartment is vacuum");

            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, WorkSideTile));
            Assert.That(sim.JobsDirty, Is.EqualTo(JobBoardDirty.None),
                "premise: writing the atmosphere sets no dirty flag — if it did, this test would be " +
                "measuring a rescan rather than the liveness of the predicate itself");

            var after = Run(sim, 12000);

            Assert.That(after.MaintainStarts, Is.GreaterThan(0),
                "with air in the room the machine must become serviceable again immediately");
            Assert.That(machine.Condition, Is.EqualTo(sim.Defs.Wear.JuryRigCondition),
                "and the service must complete — the refusal cost the player nothing but the vacuum");
        }

        // --------------------------------------------------- the INCLUSION (non-vacuity) control

        /// <summary>
        /// THE INCLUSION CONTROL — plant the known violation and require it to be caught. Every
        /// other refusal test above asserts that something does NOT happen, and a population count
        /// of zero proves a matcher matched nothing, never that it would have matched the thing
        /// (<c>CLAUDE.md</c>, the fourth trap shape). So here the violation is manufactured by hand:
        /// a crew member is planted ON the vacuum machine's job, standing beside it, exactly as the
        /// shipped dispatcher used to put it there.
        ///
        /// TWO assertions, and the FIRST is the non-vacuity half: the planted worker really does
        /// suffocate and really is pulled off by <see cref="SafetySystem"/>. That proves this
        /// fixture can still produce the hazard — that the refusals above are the guard working and
        /// not the fixture having quietly become harmless. The second half is the fix: once it has
        /// recovered it is never put back.
        ///
        /// NAMED MUTATIONS caught here: M-2 and M-3.
        /// </summary>
        [Test]
        public void PlantedServicerInVacuum_Flees_AndIsNeverPutBackOnTheJob()
        {
            var sim = NewSim();
            var machine = NeedyMachineAt(sim, WorkMachine, "scrubber_dark");
            var crew = sim.Citizens.Items[0];

            // Plant the violation: the crew member IS the servicer, standing at the machine, mid-job
            // — the exact state RecruitForNeediest + DriveWorker used to manufacture every ~100 s.
            crew.Pos = WorkSideTile;
            crew.PrevPos = WorkSideTile;
            crew.ClearPath();
            crew.JobKind = JobKind.Maintain;
            crew.JobTarget = machine.Pos;
            crew.JobWorkTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;

            bool everFled = false;
            int maintainStartsAfterTheFlee = 0;
            var wasKind = crew.JobKind;
            for (int t = 0; t < 12000; t++)
            {
                sim.Tick();
                var now = crew.Dead ? JobKind.None : crew.JobKind;
                if (now != wasKind)
                {
                    if (now == JobKind.Flee) everFled = true;
                    if (now == JobKind.Maintain && everFled) maintainStartsAfterTheFlee++;
                    wasKind = now;
                }
            }

            Assert.That(everFled, Is.True,
                "NON-VACUITY: the planted violation must still bite. A servicer standing at this " +
                "machine suffocates and is pulled off the job — so the zero counts in the tests " +
                "above are the staging rule refusing to create this state, not a fixture that " +
                "stopped being dangerous");
            Assert.That(crew.Dead, Is.False, "SafetySystem got it out alive, as it always did");
            Assert.That(maintainStartsAfterTheFlee, Is.Zero,
                "and THE FIX: once recovered it is never handed back to the machine it just fled. " +
                "That single re-recruitment is the whole livelock — 47 640 of them over 14 sim-days " +
                "on the grid ship, for 311 services");
        }

        // --------------------------------------------------------------- the boundary machine

        // Mirrored fixture for the boundary case: the LEFT compartment breathes and the RIGHT is
        // vacuum, so the canonical Neighbor4 order (+x first) offers the LETHAL side of a boundary
        // machine before the survivable one. That is not a contrivance — it is the shipped grid
        // ship's own case: every needy machine there at h270+ is a DOOR, and a door's two sides are
        // two different rooms.
        private static readonly Int3 BoundaryCrewHome = new Int3(1, 1, 0); // left, breathable
        private static readonly Int3 BreathableSide = new Int3(3, 3, 0);   // left of the door
        private static readonly Int3 LethalSide = new Int3(5, 3, 0);       // right of the door

        /// <summary>
        /// THE HALF OF THE RULE THAT IS EASY TO LEAVE OUT. A machine ON a pressure boundary has
        /// neighbours in two different rooms, so "is there ANY survivable tile beside it" is true
        /// while "the tile we happen to pick first" is lethal. Take the first walkable neighbour and
        /// the servicer is planted in vacuum one step from breathable air, and the livelock returns
        /// for exactly the machines that produced it on the real ship.
        ///
        /// The fixture puts the lethal side FIRST in <c>Int3.Neighbor4</c> order, so the naive
        /// picker fails it and the guarded one passes.
        ///
        /// NAMED MUTATIONS caught here: M-2 and M-3.
        /// </summary>
        [Test]
        public void AMachineOnAPressureBoundary_IsServicedFromTheBreathableSide()
        {
            var systems = new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new NeedsSystem(), new SafetySystem(),
                new MaintenanceSystem(),
            };
            var sim = new Simulation(AsciiWorld.Build(TwoCompartments), 11, systems);
            var door = sim.AddDevice(DeviceKind.Door, DoorTile, "door_boundary");
            door.IsOpen = true;
            door.Condition = 0.2f; // below the Door row's maintain 0.3, above its fail 0.05

            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, BoundaryCrewHome)); // left only
            sim.AddCitizen("Vasquez", BoundaryCrewHome);
            sim.JobsDirty = JobBoardDirty.All;

            Assert.That(Int3.Neighbor4(DoorTile, 0), Is.EqualTo(LethalSide),
                "premise: the FIRST neighbour in canonical order is the lethal side, or this test " +
                "would pass with the guard removed and pin nothing");
            Assert.That(AtmosphereSafety.IsBreathable(sim, LethalSide), Is.False, "premise: +x is vacuum");
            Assert.That(AtmosphereSafety.IsBreathable(sim, BreathableSide), Is.True, "premise: -x breathes");

            var crew = sim.Citizens.Items[0];
            bool everStoodOnTheLethalSide = false;
            var c = new Counts();
            var wasKind = crew.JobKind;
            float wasCondition = door.Condition;
            for (int t = 0; t < 12000; t++)
            {
                sim.Tick();
                if (crew.Pos == LethalSide) everStoodOnTheLethalSide = true;
                var now = crew.Dead ? JobKind.None : crew.JobKind;
                if (now != wasKind)
                {
                    if (now == JobKind.Maintain) c.MaintainStarts++;
                    if (now == JobKind.Flee) c.FleeStarts++;
                    wasKind = now;
                }
                if (door.Condition > wasCondition) c.Services++;
                wasCondition = door.Condition;
            }

            Assert.That(c.MaintainStarts, Is.GreaterThan(0),
                "a boundary machine with ONE survivable side is workable and must still be staffed");
            Assert.That(everStoodOnTheLethalSide, Is.False,
                "and the servicer must be staged on the side it can breathe on — the naive 'first " +
                "walkable neighbour' picks the vacuum side here");
            Assert.That(c.FleeStarts, Is.Zero, "so nothing ever flees");
            Assert.That(c.Services, Is.GreaterThan(0), "and the service completes");
        }

        // ------------------------------------------------------------------- the doorway

        // A dig whose ONLY approach is a doorway: the debris at (4,2) has three wall neighbours and
        // one walkable one, the door tile at (3,2). This is the shipped slice's aft field in
        // miniature — its 48 tiles are reached only through `door_aft` at (56,9,0).
        private static readonly string[] DiggingThroughADoorway =
        {
            "#######",
            "#..####",
            "#.....#",
            "#..####",
            "#######",
        };

        private static readonly Int3 DoorwayTile = new Int3(3, 2, 0);
        private static readonly Int3 BehindTheDoorway = new Int3(4, 2, 0);

        /// <summary>
        /// ⚠️ A DOOR TILE IS NOT VACUUM — the mistake the first draft of this package made, and the
        /// most expensive one available to it.
        ///
        /// A door tile is a room EDGE, not a room member: it carries <see cref="RoomState.DoorMarker"/>
        /// and <c>RoomAt</c> resolves it to <c>Rooms[0]</c>, the vacuum sink, which reads 0 kPa and
        /// therefore "lethal". But <see cref="NeedsSystem"/> SKIPS a crew member standing on a door
        /// marker outright (<c>NeedsSystem.cs:105</c>), so no suffocation accrues there, no flee can
        /// follow, and no cycle can start. Refusing a doorway refuses every worksite whose only
        /// approach is a doorway — and on the shipped slice that is the ENTIRE 48-tile aft dig
        /// field, which took slice Dig occupancy to 0.00 %, moved the slice tick-3000 golden and
        /// reddened five tests before the clause was added.
        ///
        /// Both halves are asserted: that the naive reading really is wrong here (the sink DOES
        /// report the doorway as unbreathable — otherwise this test would pass for a reason that has
        /// nothing to do with the clause), and that the work happens anyway.
        ///
        /// NAMED MUTATION caught here: M-5 (drop the DoorMarker clause). This test is the SOLE guard
        /// on it inside this file; on the wider suite it is also what `SliceDigLoopTests` and the
        /// slice golden catch, at 3 s a run instead of 20 ms.
        /// </summary>
        [Test]
        public void ADigReachedOnlyThroughADoorway_IsStillWorked()
        {
            var systems = new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new NeedsSystem(), new SafetySystem(),
            };
            var sim = new Simulation(AsciiWorld.Build(DiggingThroughADoorway), 5, systems);
            sim.AddDevice(DeviceKind.Door, DoorwayTile, "door_only_way").IsOpen = true;
            sim.World.SetWall(BehindTheDoorway, TileDefs.Debris);
            sim.World.SetFloor(BehindTheDoorway, TileDefs.Debris);
            sim.World.SetWall(new Int3(5, 2, 0), TileDefs.Wall); // seal the far side
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(1, 2, 0)));
            var crew = sim.AddCitizen("Iqbal", new Int3(1, 2, 0));
            sim.EnqueueCommand(new DesignateDigCommand(BehindTheDoorway, on: true));
            sim.Tick();

            Assert.That(sim.Rooms.RoomIdAt(sim.World, DoorwayTile), Is.EqualTo(RoomState.DoorMarker),
                "premise: the approach tile really is a door marker");
            Assert.That(sim.IsWalkable(DoorwayTile), Is.True, "premise: and it is walkable (the door is open)");
            Assert.That(AtmosphereSafety.IsBreathable(sim, DoorwayTile), Is.False,
                "premise, and THE TRAP: RoomAt sends a door marker to the vacuum sink, so the naive " +
                "reading calls this doorway lethal. If this ever starts returning true, this test " +
                "stops pinning anything and the DoorMarker clause is untested");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, DoorwayTile), Is.True,
                "and the staging rule must nevertheless allow it — NeedsSystem never suffocates a " +
                "crew member standing on a door marker, so there is no cycle to prevent");
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(BehindTheDoorway, i);
                if (n == DoorwayTile) continue;
                Assert.That(sim.IsWalkable(n), Is.False,
                    $"premise: {n} must not be walkable — the doorway has to be the ONLY approach, " +
                    "or the dig could be staged from somewhere else and this test would pass without " +
                    "the clause");
            }

            int digTicks = 0;
            for (int t = 0; t < 9000; t++) // 600 s of dig plus travel
            {
                sim.Tick();
                if (crew.JobKind == JobKind.Dig) digTicks++;
            }

            Assert.That(digTicks, Is.GreaterThan(0), "the dig must be claimed and worked");
            Assert.That(sim.World.GetWall(BehindTheDoorway), Is.Not.EqualTo(TileDefs.Debris),
                "and completed — the debris is gone");
            Assert.That(crew.Dead, Is.False, "and nobody suffocated in the doorway doing it");
        }

        // ------------------------------------------------------------------- the inert case

        /// <summary>
        /// THE RULE IS INERT WITHOUT BOTH HALVES OF THE CYCLE, and that is load-bearing rather than
        /// defensive. A sim with no <see cref="NeedsSystem"/> never accumulates suffocation and a
        /// sim with no <see cref="SafetySystem"/> never pulls a worker off, so neither can livelock
        /// — and both are common: several shipped fixtures build a full stack minus NeedsSystem on
        /// an ASCII map nobody pressurised, where EVERY room reads 0 kPa. An unconditional rule
        /// would stop all work everywhere on those, which is how a livelock fix turns into a
        /// colony-wide outage.
        ///
        /// NAMED MUTATION caught here: M-4 (CanCycle returns true always). This test is the SOLE
        /// guard on the inertness condition.
        /// </summary>
        [Test]
        public void WithoutNeedsOrSafety_TheRuleIsInertAndVacuumWorkIsStillDispatched()
        {
            var noGuard = NewSim(withNeeds: true, withGuard: false);
            NeedyMachineAt(noGuard, WorkMachine, "scrubber_dark");
            var a = Run(noGuard, 3000);
            Assert.That(a.MaintainStarts, Is.GreaterThan(0),
                "with no SafetySystem nothing can pull a worker off a job, so there is no cycle to " +
                "break and the machine must still be staffed exactly as it was before this package");

            var noNeeds = NewSim(withNeeds: false, withGuard: true);
            NeedyMachineAt(noNeeds, WorkMachine, "scrubber_dark");
            var b = Run(noNeeds, 3000);
            Assert.That(b.MaintainStarts, Is.GreaterThan(0),
                "with no NeedsSystem Suffocation never rises, so a worker in vacuum simply works — " +
                "and an atmosphere-free fixture must keep behaving byte-for-byte as it did");
        }
    }
}
