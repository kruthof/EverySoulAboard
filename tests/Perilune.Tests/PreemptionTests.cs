using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M2-8 — PRE-EMPTION. A RAISED PRIORITY REACHES A CREW MEMBER WHO IS ALREADY WORKING.</b>
    ///
    /// <para>Before this package nothing in the sim could take a busy pawn back:
    /// <see cref="Citizen.IsRecruitableForWork"/> requires <c>JobKind == None</c>, so every
    /// recruiter and the dispatcher alike could only ever hand work to somebody who had none, and
    /// the ONLY pre-emption anywhere was the flee path (<c>SafetySystem.cs:233</c>). A player who
    /// changed their mind mid-job waited the job out. After it, a job at a strictly better BAND
    /// takes her off the one she is on, in one tick.</para>
    ///
    /// <para>⭐ <b>THE RULE IS THE BAND AND ONLY THE BAND, and that is a decision rather than a
    /// simplification.</b> <c>WorkArbiter.HasBetterOfferThan</c> — the M2-5 claim-time gate — also
    /// lets the <see cref="WorkPriority.NaturalPriority"/> constant win INSIDE a band, because
    /// declining to hand out a job costs nothing. Taking one away is not free: it drops cargo,
    /// abandons a walk and re-runs a claim. So <see cref="WorkArbiter.HasOfferAboveBand"/> queries
    /// only the bands ABOVE hers, and <see cref="EqualBand_NothingIsPreempted_AndTheSameFixtureAtBandOneIs"/>
    /// is the leg that pins it.</para>
    ///
    /// <para>⛔ <b>THIS SUITE IS THE ACCEPTANCE. There is no browser demo, and that is the
    /// charter's own instruction, not a shortcut.</b> A pre-empted pawn is re-claimable in the same
    /// tick by whichever recruiter holds the better work, so on screen a pre-emption that lands and
    /// one that does nothing look identical until the STICKY CLAIM (M2-19) exists to hold her.
    /// Nothing here reads or writes <c>Citizen.HeldByOrder</c>.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS DRIVEN</b> — the sim is ticked until the pawn genuinely holds the job
    /// under test, and the order is given at that moment. Nothing scans for a method name. Under
    /// OD-H every work type boots OFF, so every fixture GRANTS work explicitly; a fixture that
    /// forgot would exercise nothing and read as a perfect pass.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row was
    /// edited into the tree, this whole fixture was run, and the tree was restored from an in-memory
    /// copy taken before the first row — never <c>git checkout</c> (TRAPS 2). <b>"RED" is what the
    /// run reported</b>, not what was expected.</para>
    /// <list type="table">
    ///   <item><b>1</b> the pre-emption check is a no-op (an early <c>return false</c> in
    ///     <c>JobSystem.TryPreempt</c>) ⇒ RED 7/11: every positive leg —
    ///     <see cref="RaisedBand_MidHaul_TheHaulIsDroppedAndTheRepairIsTaken"/>,
    ///     <see cref="MidHaul_TheCargoIsSetDownUnreservedAndReEntersTheHaulBoard"/>,
    ///     <see cref="MidChain_APawnNoJobSourceDrivesIsStillReachable"/>,
    ///     <see cref="EqualBand_NothingIsPreempted_AndTheSameFixtureAtBandOneIs"/> (its INCLUSION
    ///     half), <see cref="Preemption_DirtiesTheBoard_SoTheFREEDSiteIsClaimableByAnother"/>,
    ///     <see cref="MidCraft_TheStationsProgressSurvives_AndAnotherWorkerResumesIt"/>,
    ///     <see cref="MidBuild_TheDeliveredMaterialSurvives"/>. The four survival/premise legs stay
    ///     green, which is what "blinded" means here.
    ///     ⚠️ ⭐ <b>AND THE FIRST RUN OF THIS ROW REDDENED ONLY SIX. <c>MidChain_*</c> WAS GREEN
    ///     WITH PRE-EMPTION DELETED</b>, because its budget was one service length — and M2-5's
    ///     push gate ALREADY frees a servicer at the end of the service she is in. The bound is now
    ///     two sim-seconds. Written down rather than tidied: a generous budget turns the one leg
    ///     that reaches a push-recruited pawn into a re-statement of the package before it.</item>
    ///   <item>⭐ <b>2</b> route through <c>JobWork.AbandonJob</c> instead of
    ///     <see cref="Simulation.CancelJob"/> ⇒ RED 1/11:
    ///     <see cref="MidHaul_TheCargoIsSetDownUnreservedAndReEntersTheHaulBoard"/> — <b>the case
    ///     that loses matter if it is wrong</b>, and it reddens on <c>CarriedBy</c>, not on a
    ///     crash. <c>AbandonJob</c>'s own doc says reservations are *"the CALLER's to release
    ///     first"*, so a pawn pre-empted through it walks off still holding the stack.</item>
    ///   <item><b>3 + 4</b> unmapped job kinds pre-empt at <see cref="WorkPriority.Lowest"/> instead
    ///     of being refused (the ONE survival guard, inverted) ⇒ RED 3/11:
    ///     <see cref="Fleeing_IsNeverPreempted"/> (<b>she DIES</b> — the flee path is cleared under
    ///     her every tick), <see cref="Eating_IsNeverPreempted"/> and
    ///     <see cref="Drinking_IsNeverPreempted"/>. Each is its own <c>[Test]</c>, run blinded of
    ///     the positives and of each other — <c>assert</c> throws, so legs sharing a method cannot
    ///     all report.
    ///     ⚠️ ⭐ <b>THE FIRST RUN OF THIS ROW REDDENED ONLY THE FLEE LEG.</b> Eat and Drink broke out
    ///     of their watch loop on the first change of <c>JobKind</c> — and a pre-empted pawn reads
    ///     <c>None</c> on that tick and <c>Maintain</c> only on the next, so the assertion looked at
    ///     <c>None</c>, passed, and guarded nothing. Both now watch the WHOLE errand and also
    ///     require that the meal/drink actually completed.</item>
    ///   <item><b>5</b> pre-empt at EQUAL band too (query <c>band &lt;= myBand</c>) ⇒ RED 1/11:
    ///     <see cref="EqualBand_NothingIsPreempted_AndTheSameFixtureAtBandOneIs"/> — she set the
    ///     crate down at tick 22. ⚠️ Its control is NOT the OD-H default ship: with nothing enabled
    ///     nothing is ever claimed, so a default-grid control is byte-identical for a reason that
    ///     has nothing to do with pre-emption. The fixture GRANTS a grid at equal bands.</item>
    ///   <item><b>6</b> drop <c>JobsDirty</c> from <see cref="Simulation.CancelJob"/> ⇒ RED 1/11:
    ///     <see cref="Preemption_DirtiesTheBoard_SoTheFREEDSiteIsClaimableByAnother"/> — the freed
    ///     dig stays in <c>DigJobSource</c>'s derived assigned set and no one else can have it.</item>
    ///   <item>⭐ <b>7</b> zero <c>station.Progress</c> in the pre-emption path ⇒ RED 1/11:
    ///     <see cref="MidCraft_TheStationsProgressSurvives_AndAnotherWorkerResumesIt"/>. Progress
    ///     lives on the <c>Device</c>; a refactor moving it onto the pawn would silently delete a
    ///     batch every time the player changes their mind.</item>
    ///   <item><b>8</b> zero the site's <c>Delivered</c> count in the pre-emption path ⇒ RED 1/11:
    ///     <see cref="MidBuild_TheDeliveredMaterialSurvives"/>.</item>
    /// </list>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-8 — PRE-EMPTION"
    /// (and the retracted M2-7 directly above it, whose measured hard-case table rows 2, 7 and 8
    /// turn into pins). Mechanism authority: <c>docs/design/rimworld-reference.md</c> §1.3.</para>
    /// </summary>
    [TestFixture]
    public class PreemptionTests
    {
        // ------------------------------------------------------------------ shared fixtures

        /// <summary>A long open hall with ONE INTERIOR WALL at <see cref="StripWall"/> — the only
        /// legal deconstruct target (the outer ring is pressure hull and is refused). Long on
        /// purpose: a carry across it takes tens of ticks, so there is a real "mid-job" to
        /// interrupt.</summary>
        private static readonly string[] HallMap =
        {
            "####################",
            "#..................#",
            "#.......#..........#",
            "#..................#",
            "####################",
        };

        private static readonly Int3 PawnStart = new Int3(2, 2, 0);
        private static readonly Int3 StripWall = new Int3(8, 2, 0);
        private static readonly Int3 FarMachine = new Int3(17, 1, 0);
        private static readonly Int3 CargoStart = new Int3(4, 2, 0);
        private static readonly Int3 Stockpile = new Int3(17, 3, 0);

        /// <summary>The shipped stack's relative order for the systems these legs use.
        /// <see cref="JobSystem"/> BEFORE the two push recruiters is shipped behaviour and is what
        /// makes a pre-empted pawn claimable by a recruiter in the same tick.</summary>
        private static ISimSystem[] Stack(out DeconstructSystem strip, out BuildSystem build)
        {
            strip = new DeconstructSystem();
            build = new BuildSystem();
            return new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                strip,
                build,
            };
        }

        private static Simulation NewSim(out DeconstructSystem strip, out BuildSystem build) =>
            new Simulation(AsciiWorld.Build(HallMap), 11, Stack(out strip, out build));

        private static Simulation NewSim() => NewSim(out _, out _);

        /// <summary>A machine that wants service, with Parts aboard. Condition sits below its
        /// maintain threshold and above the wreck floor, so neither the W2 wreck rule nor a missing
        /// Part is what could refuse the service.</summary>
        private static Device NeedyMachine(Simulation sim, Int3 pos, string name)
        {
            var machine = sim.AddDevice(DeviceKind.Scrubber, pos, name);
            machine.Condition = 0.30f;
            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: " + name + " really wants service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "control: and the WRECK rule is not what would refuse it");
            return machine;
        }

        /// <summary>⭐ THE ORDER: the player raises Repair to band 1 on this crew member and a
        /// machine that wants servicing appears. Returns the machine.</summary>
        private static Device RaiseRepairTo(Simulation sim, Citizen pawn, byte band, Int3 partsAt)
        {
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, partsAt);
            pawn.SetWorkPriority(WorkType.Repair, band);
            sim.JobsDirty = JobBoardDirty.All;
            return machine;
        }

        /// <summary>Tick until <paramref name="pawn"/> holds <paramref name="kind"/>; the tick it
        /// happened, or -1. Counts from the CURRENT tick, so a caller may set the world up
        /// mid-run.</summary>
        private static long TickOfFirst(Simulation sim, Citizen pawn, JobKind kind, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (pawn.JobKind == kind) return sim.TickCount;
            }
            return -1;
        }

        /// <summary>Tick until <paramref name="pawn"/> is carrying the haul she was given, and
        /// return the stack. Fails the fixture if she never gets there.</summary>
        private static ItemStack DriveToMidHaul(Simulation sim, Citizen pawn, uint cargoId, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.HaulDeliver && pawn.CarryingItemId == cargoId)
                {
                    Assert.That(sim.Items.TryGet(cargoId, out var carried), Is.True);
                    return carried;
                }
            }
            Assert.Fail("fixture: the pawn never picked the haul up, so there is no mid-job to interrupt");
            return null;
        }

        /// <summary>One loose stack and somewhere to put it, far apart.</summary>
        private static ItemStack Haulable(Simulation sim)
        {
            var cargo = sim.AddItem(ItemKind.Scrap, 1, CargoStart);
            sim.World.SetFlag(Stockpile, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
            return cargo;
        }

        // ================================================== the headline leg

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S SENTENCE: the player raises Repair to 1 while she is halfway across
        /// the hall with a crate, and she puts it down and goes.</b> Mutation 1's leg.
        ///
        /// <para>The haul is claimed at <c>Haul@4</c> first and driven until she is genuinely
        /// CARRYING it; only then does the machine appear and Repair go to band 1. The control is
        /// the one that matters: <b>the crate must NOT have reached the stockpile.</b> "She
        /// eventually repaired" is also true of a build with no pre-emption at all — it just waits
        /// the delivery out.</para>
        /// </summary>
        [Test]
        public void RaisedBand_MidHaul_TheHaulIsDroppedAndTheRepairIsTaken()
        {
            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            var carried = DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(carried.Pos, Is.Not.EqualTo(Stockpile),
                "fixture: she must still be EN ROUTE when the order lands");

            RaiseRepairTo(sim, pawn, WorkPriority.Highest, new Int3(3, 1, 0));
            long ordered = sim.TickCount;

            long served = TickOfFirst(sim, pawn, JobKind.Maintain, 3000);
            Assert.That(served, Is.GreaterThan(0),
                "Repair@1 must reach a pawn who is BUSY at Haul@4 — before M2-8 nothing in the sim " +
                "could take a job back and she would have finished the delivery first");

            Assert.That(cargo.Pos, Is.Not.EqualTo(Stockpile),
                "⛔ THE CONTROL: the crate must still be short of the stockpile. If it arrived, she " +
                "simply finished the haul and then went — which is exactly the pre-M2-8 behaviour " +
                "and a generous tick budget makes it look like a pass.");
            Assert.That(served - ordered, Is.LessThan(60),
                "and it must be a PRE-EMPTION, not a coincidence: the spike measured one tick from " +
                "order to new job; the budget here is six sim-seconds of walking to the machine");
        }

        // ================================================== the cargo leg (mutation 2)

        /// <summary>
        /// ⭐ <b>MUTATION 2's LEG — THE ONE THAT LOSES MATTER IF THE WRONG CANCEL PATH IS WIRED.</b>
        ///
        /// <para>Pre-empt a pawn who is CARRYING a stack and the stack must be set down at her feet,
        /// <c>CarriedBy == 0</c>, <c>ReservedBy == 0</c>, and RE-ENTER the haul board — proved by a
        /// second crew member claiming it, not by inspecting a private field. Routed through
        /// <c>JobWork.AbandonJob</c> (whose contract explicitly leaves reservations to the caller)
        /// she walks away still holding it and every one of these reads is wrong.</para>
        ///
        /// <para>The drop is read at the EXACT tick she loses the haul — she is walking, so one tick
        /// later her position is no longer the drop tile.</para>
        /// </summary>
        [Test]
        public void MidHaul_TheCargoIsSetDownUnreservedAndReEntersTheHaulBoard()
        {
            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(cargo.CarriedBy, Is.EqualTo(pawn.Id), "fixture: she really has it in hand");

            RaiseRepairTo(sim, pawn, WorkPriority.Highest, new Int3(3, 1, 0));

            Int3 dropTile = default;
            bool dropped = false;
            for (int t = 0; t < 3000 && !dropped; t++)
            {
                sim.Tick();
                if (pawn.CarryingItemId == 0) { dropTile = pawn.Pos; dropped = true; }
            }
            Assert.That(dropped, Is.True, "precondition: the pre-emption must actually have happened");

            Assert.That(cargo.Pos, Is.EqualTo(dropTile),
                "the stack is set down AT HER FEET — not carried on by a pawn with no job, and not " +
                "teleported home");
            Assert.That(cargo.CarriedBy, Is.EqualTo(0u),
                "⛔ nobody is carrying it. JobWork.AbandonJob leaves this pointing at her and the " +
                "stack becomes matter attached to a citizen who is repairing a scrubber");
            Assert.That(cargo.ReservedBy, Is.EqualTo(0u),
                "⛔ and nobody has it claimed — a leaked reservation is a stack no hauler may ever " +
                "touch again, which reads in play as matter that has vanished");

            // --- RE-ENTRY: a second crew member, standing on the drop, must be able to haul it.
            var second = sim.AddCitizen("Vek", dropTile);
            second.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            sim.JobsDirty = JobBoardDirty.All;

            bool reclaimed = false;
            for (int t = 0; t < 600 && !reclaimed; t++)
            {
                sim.Tick();
                reclaimed = second.ReservedItemId == cargo.Id || second.CarryingItemId == cargo.Id;
            }
            Assert.That(reclaimed, Is.True,
                "the dropped stack must RE-ENTER the haul board — a stack that is on the ground, " +
                "unreserved, and still invisible to the board is lost just as surely");
        }

        // ================================================== the site-coverage leg

        /// <summary>
        /// ⭐⭐ <b>PRE-EMPTION REACHES A PAWN NO <see cref="IJobSource"/> DRIVES — the M2-5 lesson,
        /// asked of the new mechanism.</b>
        ///
        /// <para><c>JobKind.Maintain</c> and <c>JobKind.Craft</c> have no <see cref="IJobSource"/> at
        /// all: <c>MaintenanceSystem</c> frees and re-claims its own worker inside one tick, and the
        /// dispatcher never sees her idle. That is why M2-5 needed five arbitration sites. The
        /// pre-emption check is asked at ONE site and still reaches her, because
        /// <see cref="JobSystem.Tick"/>'s citizen loop walks EVERY citizen — a Maintain pawn reaches
        /// it and falls out at <c>owner == null</c>. Put the same check in <c>TryAssign</c> and this
        /// leg is the one that dies, silently, on the case the owner cares about.</para>
        ///
        /// <para>⛔ <b>THE CONTROL IS NOT THE TICK COUNT:</b> machines must still be WAITING when she
        /// walks away, or "she eventually dug" only means the chain ran out.</para>
        /// </summary>
        [Test]
        public void MidChain_APawnNoJobSourceDrivesIsStillReachable()
        {
            var sim = NewSim();
            var machines = new List<Device>
            {
                NeedyMachine(sim, new Int3(16, 1, 0), "m1"),
                NeedyMachine(sim, new Int3(17, 1, 0), "m2"),
                NeedyMachine(sim, new Int3(16, 3, 0), "m3"),
                NeedyMachine(sim, new Int3(17, 3, 0), "m4"),
            };
            sim.AddItem(ItemKind.Parts, 16, new Int3(15, 2, 0));
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;

            int serviceTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;

            long inChain = TickOfFirst(sim, pawn, JobKind.Maintain, 3000);
            Assert.That(inChain, Is.GreaterThan(0),
                "fixture: she must be INSIDE the maintenance chain — a pawn who is idle here is the " +
                "case every other recruiter already handles");
            for (int t = 0; t < serviceTicks / 10; t++) sim.Tick(); // a little way INTO the service
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain), "fixture: still servicing");

            // THE ORDER: a dig at band 1, painted mid-chain.
            var debris = new Int3(4, 2, 0);
            sim.World.SetWall(debris, TileDefs.Debris);
            sim.World.SetFlag(debris, TileFlags.Designated, true);
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            sim.JobsDirty = JobBoardDirty.All;
            long ordered = sim.TickCount;

            long dug = TickOfFirst(sim, pawn, JobKind.Dig, 4 * serviceTicks);
            Assert.That(dug, Is.GreaterThan(0),
                "Mine@1 must reach a pawn already inside a Repair@4 chain — the chain never yields " +
                "to the dispatcher, so nothing but pre-emption can get her out of it");
            Assert.That(dug - ordered, Is.LessThan(20),
                "⛔ AND THE BOUND IS TWO SIM-SECONDS, MEASURED RATHER THAN GENEROUS. M2-5's push " +
                "gate ALREADY frees her at the end of the service she is in — that is not " +
                "pre-emption, and a budget of one service length is satisfied by it. (Recorded: " +
                "with the pre-emption check no-oped this leg was GREEN at the looser bound.)");

            int stillNeedy = 0;
            foreach (var m in machines)
                if (m.Condition < sim.Defs.Machines[(int)m.Kind].MaintainBelow) stillNeedy++;
            Assert.That(stillNeedy, Is.GreaterThanOrEqualTo(2),
                "⛔ THE CONTROL: machines must STILL be waiting when she walks away, or 'she dug' " +
                "only means the chain ran out of work");
        }

        // ================================================== the survival guards (mutations 3, 4)
        // ⚠️ Three separate [Test]s. `assert` throws, so legs sharing a method cannot all report,
        // and a suite that only proves pre-emption WORKS is satisfied by one that fires on
        // everything — the failure mode being a crew member who starves while being reassigned.

        /// <summary>
        /// ⛔ <b>MUTATION 3 — A FLEEING CREW MEMBER IS NEVER PRE-EMPTED. SURVIVAL OUTRANKS
        /// EVERYTHING.</b>
        ///
        /// <para>Driven on the real stack in a real vacuum pocket (the <c>CrewSafetyTests</c> breach
        /// fixture): she suffocates, <c>SafetySystem</c> cancels her job and commits her to
        /// <c>JobKind.Flee</c> with a live path to breathable air. THEN the order lands. Pre-empting
        /// her clears that path and leaves her standing in vacuum.</para>
        ///
        /// <para><b>The non-vacuity half is in the same fixture and it is essential:</b> once she is
        /// safe and idle she DOES take the repair, so the refusal above is the guard and not a dead
        /// machine nobody could have been given.</para>
        /// </summary>
        [Test]
        public void Fleeing_IsNeverPreempted()
        {
            var sim = NewBreachPocketSim(out var crew);

            Citizen fleeing = null;
            for (int t = 0; t < 6000 && fleeing == null; t++)
            {
                sim.Tick();
                if (crew.JobKind == JobKind.Flee && crew.HasPath) fleeing = crew;
            }
            Assert.That(fleeing, Is.Not.Null,
                "fixture: she must genuinely be mid-Flee, carrying a live flee path");

            // THE ORDER, given to a crew member who is running for her life.
            var machine = NeedyMachine(sim, new Int3(5, 1, 0), "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(4, 1, 0));
            crew.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            crew.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;

            // Long enough for the flee to complete and the suffocation to clear. A pre-emption that
            // could reach her would take her path away on EVERY tick of it.
            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            bool repairedInDanger = false;
            for (int t = 0; t < 2000; t++)
            {
                sim.Tick();
                if (crew.JobKind == JobKind.Maintain && crew.Suffocation >= fleeAt) repairedInDanger = true;
            }

            Assert.That(repairedInDanger, Is.False,
                "⛔ SURVIVAL OUTRANKS EVERYTHING: Repair@1 must not put a crew member on a machine " +
                "while she is still past the flee threshold. Flee carries no WorkType and the " +
                "player's grid does not rank it.");
            Assert.That(crew.Dead, Is.False,
                "⛔ AND SHE MUST LIVE. A pre-emption that reaches a fleeing pawn clears the flee " +
                "path she is walking, every tick, and she suffocates where she stands — the exact " +
                "failure mode these two negative legs exist for.");
            Assert.That(crew.Pos.Y, Is.LessThan(3),
                "she completed the flee: out of the vacuum pocket (y>=3) and into the refuge");

            // --- NON-VACUITY: the offer was real. Once she is safe and idle she takes it.
            long served = TickOfFirst(sim, crew, JobKind.Maintain, 6000);
            Assert.That(served, Is.GreaterThan(0),
                "control: the very same machine IS claimable by the very same pawn once she is out " +
                "of danger — so the refusal above is the survival guard, not an empty board");
            Assert.That(machine, Is.Not.Null);
        }

        /// <summary>⛔ <b>MUTATION 4a — AN EATING CREW MEMBER IS NEVER PRE-EMPTED (§12.3).</b> Driven:
        /// Hunger is over <c>need_threshold</c> and the only potato is at the far end of the hall,
        /// so she is genuinely walking to food when Repair@1 lands. The non-vacuity half is the same
        /// pawn taking the same machine once she has eaten.</summary>
        [Test]
        public void Eating_IsNeverPreempted()
        {
            var sim = NewSustenanceSim(out var pawn);
            sim.AddItem(ItemKind.Potato, 1, new Int3(17, 2, 0));
            pawn.Hunger = 0.80f; // one potato (potato_hunger_value) really clears the threshold
            Assert.That(pawn.Hunger, Is.GreaterThanOrEqualTo(sim.Defs.Sustenance.NeedThreshold),
                "fixture: she must really be hungry enough to self-serve");

            long eating = TickOfFirst(sim, pawn, JobKind.Eat, 600);
            Assert.That(eating, Is.GreaterThan(0), "fixture: she must be walking to the food");

            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 1, 0));
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;

            // ⚠️ NOT "break the moment she stops eating": a pre-empted pawn reads JobKind.None on
            // that tick and only takes the machine on the NEXT one, so a break-on-change loop
            // reports None, passes, and the guard is worth nothing. (Measured: it was.) Watch the
            // whole meal instead.
            float threshold = sim.Defs.Sustenance.NeedThreshold;
            bool servedWhileHungry = false;
            for (int t = 0; t < 900; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain && pawn.Hunger >= threshold) servedWhileHungry = true;
            }
            Assert.That(servedWhileHungry, Is.False,
                "⛔ Repair@1 must not take a crew member off her way to food. An order the player " +
                "gave must not be a way to starve someone.");
            Assert.That(pawn.Hunger, Is.LessThan(threshold),
                "and the meal completed — a pawn cancelled off her food every tick never eats " +
                "either, which is the same defect wearing a different failure");

            long served = TickOfFirst(sim, pawn, JobKind.Maintain, 3000);
            Assert.That(served, Is.GreaterThan(0),
                "control: the machine IS claimable by this pawn once she has eaten — the refusal " +
                "above is the survival guard and not an empty board");
        }

        /// <summary>⛔ <b>MUTATION 4b — A DRINKING CREW MEMBER IS NEVER PRE-EMPTED (§12.3).</b> The
        /// twin of the Eat leg, on a stocked <c>WaterTank</c> at the far end, and blinded of
        /// it.</summary>
        [Test]
        public void Drinking_IsNeverPreempted()
        {
            var sim = NewSustenanceSim(out var pawn);
            sim.AddDevice(DeviceKind.WaterTank, new Int3(17, 2, 0), "tank").StoredLiters = 50f;
            pawn.Thirst = 0.95f;
            Assert.That(pawn.Thirst, Is.GreaterThanOrEqualTo(sim.Defs.Sustenance.NeedThreshold),
                "fixture: she must really be thirsty enough to self-serve");

            long drinking = TickOfFirst(sim, pawn, JobKind.Drink, 600);
            Assert.That(drinking, Is.GreaterThan(0), "fixture: she must be walking to the tank");

            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 1, 0));
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;

            // Same correction as the Eat leg: watch the whole errand, never break on the first
            // change of kind — the pre-empted tick reads None and would pass.
            float threshold = sim.Defs.Sustenance.NeedThreshold;
            bool servedWhileThirsty = false;
            for (int t = 0; t < 900; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain && pawn.Thirst >= threshold) servedWhileThirsty = true;
            }
            Assert.That(servedWhileThirsty, Is.False,
                "⛔ Repair@1 must not take a crew member off her way to water");
            Assert.That(pawn.Thirst, Is.LessThan(threshold),
                "and the drink completed — a pawn cancelled off the tank every tick never drinks");

            long served = TickOfFirst(sim, pawn, JobKind.Maintain, 3000);
            Assert.That(served, Is.GreaterThan(0),
                "control: the machine IS claimable by this pawn once she has drunk");
        }

        /// <summary>
        /// The PREMISE the single survival guard rests on, pinned rather than assumed:
        /// <see cref="WorkTypeMap.TryOf"/> refuses <c>Flee</c>, <c>Eat</c> and <c>Drink</c>, and
        /// accepts every other live kind. <c>JobSystem.TryPreempt</c> has exactly one guard for the
        /// three survival kinds — two guards for one rule means neither can be shown to bite — so
        /// the day somebody gives Eat a <see cref="WorkType"/>, this fails here and loudly rather
        /// than in play, as a pre-emption that interrupts a meal.
        /// </summary>
        [Test]
        public void SurvivalKinds_CarryNoWorkType_WhichIsTheWholeSurvivalGuard()
        {
            foreach (var survival in new[] { JobKind.Flee, JobKind.Eat, JobKind.Drink })
                Assert.That(WorkTypeMap.TryOf(survival, out _), Is.False,
                    survival + " must carry no WorkType — JobSystem.TryPreempt's ONLY refusal of " +
                    "the survival kinds is that they are not work");

            foreach (var work in new[]
                     {
                         JobKind.Dig, JobKind.HaulPickup, JobKind.HaulDeliver, JobKind.Build,
                         JobKind.HaulToBuild, JobKind.Deconstruct, JobKind.Craft, JobKind.Maintain,
                     })
                Assert.That(WorkTypeMap.TryOf(work, out _), Is.True,
                    "non-vacuity: " + work + " IS work and pre-emption must be able to reach it — " +
                    "a map that answered false for everything would pass the loop above");
        }

        // ================================================== equal band (mutation 5)

        /// <summary>
        /// ⛔ <b>MUTATION 5 — AT EQUAL BAND NOTHING PRE-EMPTS, and the control is NOT the shipped
        /// default ship.</b>
        ///
        /// <para>Under OD-H nothing is enabled, so nothing is ever claimed and an all-default
        /// control is byte-identical for a reason that has nothing to do with pre-emption — a green
        /// that means *"my instrument sees nothing"*. So this fixture GRANTS a full grid at band 2:
        /// <c>Haul@2</c> and <c>Repair@2</c>, a live haul in her hands and a machine crying out for
        /// service. She must finish the delivery.</para>
        ///
        /// <para><b>The inclusion half runs the identical fixture with Repair at band 1</b> and
        /// requires that she IS taken off it — so "nothing moved" cannot be satisfied by a machine
        /// that was never claimable or a haul that was never interruptible.</para>
        /// </summary>
        [Test]
        public void EqualBand_NothingIsPreempted_AndTheSameFixtureAtBandOneIs()
        {
            const byte SameBand = 2;

            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, SameBand);
            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            RaiseRepairTo(sim, pawn, SameBand, new Int3(3, 1, 0));
            Assert.That(pawn.GetWorkPriority(WorkType.Repair),
                Is.EqualTo(pawn.GetWorkPriority(WorkType.Haul)),
                "fixture: the two must really be at the SAME band");

            bool delivered = false;
            for (int t = 0; t < 3000 && !delivered; t++)
            {
                sim.Tick();
                Assert.That(cargo.CarriedBy == pawn.Id || cargo.Pos == Stockpile, Is.True,
                    "⛔ AT EQUAL BAND NOTHING PRE-EMPTS. She put the crate down mid-hall at tick " +
                    sim.TickCount + " for work the player ranked no higher — a ship that churns " +
                    "its crew when the player changed nothing is a ship the player is not driving.");
                delivered = cargo.Pos == Stockpile && cargo.CarriedBy == 0;
            }
            Assert.That(delivered, Is.True, "fixture: she must actually complete the delivery");

            // --- THE INCLUSION HALF: the identical fixture, Repair one band better.
            var sim2 = NewSim();
            var cargo2 = Haulable(sim2);
            var pawn2 = sim2.AddCitizen("Rell", PawnStart);
            pawn2.SetWorkPriority(WorkType.Haul, SameBand);
            DriveToMidHaul(sim2, pawn2, cargo2.Id, 600);
            RaiseRepairTo(sim2, pawn2, WorkPriority.Highest, new Int3(3, 1, 0));

            Assert.That(TickOfFirst(sim2, pawn2, JobKind.Maintain, 3000), Is.GreaterThan(0),
                "control: one band better and the SAME machine DOES take her off the SAME haul — " +
                "so the inertness above is the equal-band rule, not an inert fixture");
            Assert.That(cargo2.Pos, Is.Not.EqualTo(Stockpile),
                "control: and she left the crate short of the stockpile");
        }

        // ================================================== the board rebuild (mutation 6)

        /// <summary>
        /// ⛔ <b>MUTATION 6 — A PRE-EMPTION THAT DOES NOT DIRTY THE BOARD LEAVES A PHANTOM
        /// ASSIGNMENT.</b>
        ///
        /// <para><c>DigJobSource</c>'s assigned set is DERIVED, rebuilt from citizen state whenever
        /// <see cref="Simulation.JobsDirty"/> is non-zero. Pre-empt a digger without dirtying it and
        /// the site she walked away from stays booked to her forever: no error, no log, one dig that
        /// nobody may ever have again.</para>
        ///
        /// <para>The fixture is deliberately QUIET — no items, no machines, no atmosphere — so that
        /// the ONLY thing that can rebuild the board after the pre-emption is the pre-emption
        /// itself. The better-banded work is a Deconstruct, which the dispatcher claims without
        /// touching <see cref="Simulation.JobsDirty"/> (<c>TryAssign</c> is forbidden to).</para>
        /// </summary>
        [Test]
        public void Preemption_DirtiesTheBoard_SoTheFREEDSiteIsClaimableByAnother()
        {
            var sim = NewSim(out var strip, out _);
            var debris = new Int3(4, 2, 0);
            sim.World.SetWall(debris, TileDefs.Debris);
            sim.World.SetFlag(debris, TileFlags.Designated, true);

            var digger = sim.AddCitizen("Rell", PawnStart);            // nearest: she gets it
            digger.SetWorkPriority(WorkType.Mine, WorkPriority.Lowest);
            var other = sim.AddCitizen("Vek", new Int3(16, 3, 0));     // has Mine, but the site is taken
            other.SetWorkPriority(WorkType.Mine, 2);
            sim.JobsDirty = JobBoardDirty.All;

            long digging = TickOfFirst(sim, digger, JobKind.Dig, 600);
            Assert.That(digging, Is.GreaterThan(0), "fixture: the near pawn must hold the dig");
            Assert.That(other.JobKind, Is.EqualTo(JobKind.None),
                "fixture: and the far pawn must have nothing — one site, and it is booked");

            // THE ORDER: a strip at band 1 for the DIGGER only.
            Assert.That(strip.Designate(sim, StripWall, DeconstructKind.Wall), Is.True,
                "precondition: the interior wall really is a legal strip target");
            digger.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Highest);
            sim.JobsDirty = JobBoardDirty.All;

            long freed = -1;
            for (int t = 0; t < 600 && freed < 0; t++)
            {
                sim.Tick();
                if (digger.JobKind != JobKind.Dig) freed = sim.TickCount;
            }
            Assert.That(freed, Is.GreaterThan(0), "precondition: the digger must be pre-empted");

            long taken = TickOfFirst(sim, other, JobKind.Dig, 20);
            Assert.That(taken, Is.GreaterThan(0),
                "⛔ THE FREED SITE MUST BE CLAIMABLE. Without JobsDirty the derived assigned set " +
                "still books this dig to a pawn who is off deconstructing a wall, and no one else " +
                "can ever have it — a phantom assignment with no error and no log.");
            Assert.That(other.JobTarget, Is.EqualTo(debris),
                "and it is the very site the pre-empted pawn walked away from");
        }

        // ================================================== survival of the work itself (7, 8)

        /// <summary>
        /// ⭐ <b>MUTATION 7 — A HALF-DONE BATCH SURVIVES THE PRE-EMPTION, AND ANOTHER WORKER
        /// RESUMES IT.</b> The M2-0 spike measured <c>recycler_1.Progress</c> 0.474 → 0.474 across a
        /// cancel and 0.486 three hundred ticks later because somebody else picked the batch up;
        /// this pins that measurement instead of hoping for it.
        ///
        /// <para>Progress lives on the <see cref="Device"/>, not on the pawn — a refactor that moves
        /// it onto the citizen would delete a batch every time the player changes their mind, and
        /// nothing but this leg would say so. The reading is taken at the EXACT pre-emption tick
        /// (<c>before</c> vs <c>after</c>), so an advance or a reset both fail.</para>
        /// </summary>
        [Test]
        public void MidCraft_TheStationsProgressSurvives_AndAnotherWorkerResumesIt()
        {
            var sim = NewSim();
            var bench = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(17, 2, 0), "recycler_1");
            Assert.That(bench.Powered && bench.IsOperational(sim.Defs), Is.True, "fixture: live bench");
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.SalvageRecycler, out var bill),
                Is.True, "fixture: and it has a bill");
            sim.AddItem(bill.Input(0).Kind, bill.Input(0).Count, new Int3(16, 2, 0)); // staged adjacent

            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Craft, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;

            bool working = false;
            for (int t = 0; t < 3000 && !working; t++)
            {
                sim.Tick();
                working = pawn.JobKind == JobKind.Craft && bench.Progress > 0f;
            }
            Assert.That(working, Is.True,
                "fixture: she must be crafting with REAL progress banked — zero progress survives " +
                "a reset trivially and this leg would assert nothing");

            RaiseRepairTo(sim, pawn, WorkPriority.Highest, new Int3(3, 1, 0));

            float before = -1f;
            bool preempted = false;
            for (int t = 0; t < 3000 && !preempted; t++)
            {
                float progressBeforeTick = bench.Progress;
                bool wasCrafting = pawn.JobKind == JobKind.Craft;
                sim.Tick();
                if (wasCrafting && pawn.JobKind != JobKind.Craft) { before = progressBeforeTick; preempted = true; }
            }
            Assert.That(preempted, Is.True, "precondition: the pre-emption must have happened");
            Assert.That(before, Is.GreaterThan(0f), "precondition: there was a real batch to lose");

            Assert.That(bench.Progress, Is.EqualTo(before),
                "⛔ THE BATCH SURVIVES: station progress lives on the Device and a pre-emption must " +
                "not touch it. Reset it and the player is punished with a lost batch every time " +
                "she re-prioritises.");

            // --- AND IT IS RESUMABLE: a second crew member picks the same batch up where it stands.
            var second = sim.AddCitizen("Vek", new Int3(15, 2, 0));
            second.SetWorkPriority(WorkType.Craft, 2);
            sim.JobsDirty = JobBoardDirty.All;

            bool resumed = false;
            for (int t = 0; t < 3000 && !resumed; t++)
            {
                sim.Tick();
                resumed = bench.Progress > before;
            }
            Assert.That(resumed, Is.True,
                "another worker must be able to CONTINUE the batch — surviving as a frozen number " +
                "nobody can add to is not surviving");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 8 — MATERIAL ALREADY DELIVERED TO A BUILD SITE SURVIVES THE
        /// PRE-EMPTION.</b> The site keeps it (<c>req=N delivered=N</c> unchanged); only the pawn's
        /// own <c>JobWorkTicks</c> countdown is lost, because that is the only part of the job that
        /// ever lived on her.
        /// </summary>
        [Test]
        public void MidBuild_TheDeliveredMaterialSurvives()
        {
            var sim = NewSim(out _, out var build);
            var site = new Int3(6, 1, 0);
            sim.AddItem(ItemKind.Regolith, sim.Defs.Build.WallMaterial, new Int3(4, 1, 0));
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Construct, WorkPriority.Lowest);
            Assert.That(build.Designate(sim, site, BuildKind.Wall, material: 3), Is.True,
                "fixture: the site must be a legal wall build");
            sim.JobsDirty = JobBoardDirty.All;

            bool staged = false;
            for (int t = 0; t < 6000 && !staged; t++)
            {
                sim.Tick();
                staged = build.TryGet(site, out var s) && s.Delivered >= s.Required &&
                         pawn.JobKind == JobKind.Build;
            }
            Assert.That(staged, Is.True,
                "fixture: she must be BUILDING with the material already delivered — that is the " +
                "state the spike measured and the only one where material can be lost");

            Assert.That(build.TryGet(site, out var before), Is.True);
            RaiseRepairTo(sim, pawn, WorkPriority.Highest, new Int3(3, 3, 0));

            bool preempted = false;
            for (int t = 0; t < 3000 && !preempted; t++)
            {
                sim.Tick();
                preempted = pawn.JobKind != JobKind.Build;
            }
            Assert.That(preempted, Is.True, "precondition: the pre-emption must have happened");

            Assert.That(build.TryGet(site, out var after), Is.True,
                "the site itself must still be pending — a pre-emption is not a cancellation of the " +
                "player's build order");
            Assert.That(after.Delivered, Is.EqualTo(before.Delivered),
                "⛔ THE MATERIAL SURVIVES: it is staged at the SITE, not carried by the pawn, and " +
                "deleting it makes every re-prioritisation cost a wall's worth of regolith");
            Assert.That(after.Required, Is.EqualTo(before.Required),
                "and the requirement is unchanged, so 'delivered' still means what it did");
        }

        // ------------------------------------------------------------------ survival fixtures

        /// <summary>The <c>CrewSafetyTests</c> breach pocket: a crew member standing in a vacuum
        /// pocket with a pressurised refuge one open door away. Sim-driven atmosphere on the FULL
        /// shipped stack — she suffocates and <c>SafetySystem</c> commits her to a real
        /// <see cref="JobKind.Flee"/>.</summary>
        private static Simulation NewBreachPocketSim(out Citizen crew)
        {
            var map = new[]
            {
                "########",
                "#......#",
                "#......#",
                "##.#####",
                "##.  ###",
                "########",
            };
            var sim = new Simulation(AsciiWorld.Build(map), 3,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(3, 1, 0), "conduit_b");
            sim.AddDevice(DeviceKind.Conduit, new Int3(4, 1, 0), "conduit_c");
            sim.AddDevice(DeviceKind.Conduit, new Int3(5, 1, 0), "conduit_d");
            sim.AddDevice(DeviceKind.AirVent, new Int3(3, 2, 0), "vent_a").IsOpen = true;
            sim.AddDevice(DeviceKind.AirVent, new Int3(4, 2, 0), "vent_b").IsOpen = true;
            sim.AddDevice(DeviceKind.AirVent, new Int3(5, 2, 0), "vent_c").IsOpen = true;
            sim.AddDevice(DeviceKind.Door, new Int3(2, 3, 0), "door").IsOpen = true;
            crew = sim.AddCitizen("Rao", new Int3(2, 4, 0));
            return sim;
        }

        /// <summary>The hall, plus <c>SustenanceSystem</c> so a hungry/thirsty crew member really
        /// self-serves. <c>NeedsSystem</c> is deliberately absent: the meters are set by the fixture
        /// so the leg is about the pre-emption guard and not about a ramp rate.</summary>
        private static Simulation NewSustenanceSim(out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                new SustenanceSystem(),
            });
            pawn = sim.AddCitizen("Rell", PawnStart);
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }
    }
}
