using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M2-19 — THE STICKY CLAIM. A DIRECT ORDER HOLDS THE CREW MEMBER ON IT UNTIL IT IS
    /// DONE.</b>
    ///
    /// <para>M2-8 landed pre-emption: a strictly better BAND takes a busy pawn back in one tick.
    /// That is the mechanism the player's grid needs — and it is also the mechanism that eats the
    /// player's own direct order, because a pawn ordered onto a band-4 job is taken straight off it
    /// again by anything the grid ranks higher. <c>Citizen.HeldByOrder</c> is what outranks the
    /// grid: <i>"that machine, NOW"</i> is a HOLD, not a preference.</para>
    ///
    /// <para>⭐ <b>THE MECHANISM IS RIMWORLD'S <c>Job.playerForced</c></b>
    /// (<c>docs/design/rimworld-reference.md</c> §2.2, which reads it off <c>curJob.playerForced</c>
    /// — the forced flag lives on the JOB and dies with it). So does this one: the invariant is
    /// <c>HeldByOrder ⇒ JobKind != None</c>, enforced in the <see cref="Citizen.JobKind"/> setter,
    /// which is the ONE place a job can end. RimWorld's other half — the
    /// <c>Pawn_MindState.priorityWork</c> record that RE-ISSUES a prioritised job and expires after
    /// 30 000 ticks — is deliberately not built: it needs a saved target this pin-neutral package
    /// may not add, and the integrator ruling rejects the timeout outright. <b>That divergence from
    /// §2.2 is recorded, not hidden.</b></para>
    ///
    /// <para>⭐ <b>THE WRITER LANDED IN M2-9</b> — <c>PrioritiseJobCommand</c>; the browser
    /// acceptance is still M2-10's milestone demo, by charter. Every leg here stages the hold the
    /// way that command does: give her the job, THEN set the bool (the writer contract on the
    /// field). A leg that set the bool first would watch it be cleared again on the way past
    /// <c>None</c>, which is the whole point of the invariant and is pinned below. ⚠️ These legs
    /// deliberately keep staging it BY HAND rather than routing through the command: this suite's
    /// subject is the HOLD, and driving it through M2-9's refusals would make every leg depend on a
    /// machine being serviceable.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS DRIVEN.</b> The sim is ticked until the pawn genuinely holds the job
    /// under test and the hold is placed at that moment; the lethal-air and death legs run real
    /// atmosphere on real stacks. Under OD-H every work type boots OFF, so every fixture GRANTS work
    /// explicitly — a fixture that forgot would exercise nothing and read as a perfect pass.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row was
    /// edited into the tree, this whole fixture was run, and the tree was restored from an in-memory
    /// copy taken before the first row — never <c>git checkout</c> (TRAPS 2). <b>"RED" is what the
    /// run reported.</b> The charter's own table is at
    /// <c>docs/design/perilune-roadmap-q3.packages.md:2931-2940</c>, and ⚠️ <b>rows 1 and 2 of it
    /// are STALE — the finding is written out below rather than quietly re-scored.</b></para>
    /// <list type="table">
    ///   <item><b>1 (charter) — check the hold in <c>IsRecruitableForWork</c> only</b> ⇒ <b>RED
    ///     3/11</b>: <see cref="HeldMidHaul_ABetterBandedRepairDoesNotTakeHer"/> ("she must COMPLETE
    ///     the ordered haul"), <see cref="HeldPawn_IsNeverClaimedByMaintenance_AcrossThirtyThousandTicks"/>
    ///     ("the hold must have been in force for a real window") and
    ///     <see cref="TheHoldIsReadThroughTheOnePredicateEveryClaimGateShares"/>.
    ///     ⚠️ <b>IT REDDENS FOR A DIFFERENT REASON THAN THE CHARTER GIVES, and that is a finding
    ///     about the tree.</b> The charter (written pre-M2-2) predicted a dispatcher-only hold would
    ///     be re-claimed by a push recruiter in the same tick. M2-2 has since moved BOTH push
    ///     recruiters (<c>MachineWearSystem.cs:522</c>, <c>CraftingSystem.cs:654</c>) onto
    ///     <c>IsRecruitableForWork</c>, so that half of the prediction is dead. What actually bites
    ///     is that <c>IsRecruitableForWork</c> requires <c>JobKind == None</c> while a held pawn
    ///     ALWAYS carries a job — so the hold moved there is not merely weaker, it is <b>wholly
    ///     inert</b>, and M2-8 pre-empts her exactly as if it were not written.</item>
    ///   <item><b>2 (charter) — check it in the two push recruiters only</b> ⇒ <b>RED 3/11</b>, the
    ///     same three, for the same reason: a hold spelled in the recruiters is invisible to
    ///     <c>JobSystem.TryPreempt</c>, and the recruiters' own gate could never have fired.</item>
    ///   <item>⭐⭐ <b>THE NEW ROWS — the interaction the charter predates, and the measurement that
    ///     changed what this suite claims.</b> The pre-emption path reads
    ///     <see cref="Citizen.IsRecruitableIgnoringJob"/> TWICE: once at <c>TryPreempt</c>'s own gate
    ///     (<c>JobSystem.cs:293</c>) and again inside <c>HasClaimableWork(asIfIdle: true)</c> in all
    ///     three providers. Measured separately:
    ///     <list type="bullet">
    ///       <item><b>(a) blind <c>TryPreempt</c>'s gate alone ⇒ GREEN 0/11.</b></item>
    ///       <item><b>(b) blind the three <c>asIfIdle</c> offer queries alone ⇒ GREEN 0/11.</b></item>
    ///       <item><b>(c) blind BOTH ⇒ RED 2/11</b> (the two pre-emption legs).</item>
    ///     </list>
    ///     ⛔ <b>So neither call site is individually pinned, and no test in this file could pin
    ///     one.</b> The fact that IS pinned — by rows 1 and 2 above — is
    ///     <see cref="Citizen.IsRecruitableIgnoringJob"/> itself, which is exactly why the hold is
    ///     placed in that property and not written out at the sites. Recorded rather than papered
    ///     over: a reader who assumed the <c>TryPreempt</c> line was the guarded one would be
    ///     wrong, and a later lane that "tidied" it away would break nothing here.</item>
    ///   <item><b>3 (charter) — never release the hold</b> (drop the clear from the
    ///     <see cref="Citizen.JobKind"/> setter) ⇒ <b>RED 8/11</b>, one per decided release
    ///     condition and each its own <c>[Test]</c>:
    ///     <see cref="Release_OnCompletion_SheReturnsToAutonomyUnderTheGrid"/>,
    ///     <see cref="Release_ANewDirectOrderReplacesTheOldHold"/>,
    ///     <see cref="Release_OnDeath_TheHoldDoesNotOutliveTheCitizen"/>,
    ///     <see cref="Release_OnSafetyCancel_TheHeldPawnStaysInLethalAirUntilTheOrderEnds"/>,
    ///     <see cref="TheHoldCannotOutliveTheJobItWasPlacedOn"/>, plus
    ///     <see cref="HeldWhileFleeing_StillReachesAirAndLives"/> and both headline legs, which see
    ///     the invariant break at the delivery tick.</item>
    ///   <item><b>4 (charter) — let the hold survive <c>JobKind.Flee</c></b> (re-arm it across
    ///     <c>SafetySystem</c>'s cancel) ⇒ <b>RED 1/11</b>:
    ///     <see cref="Release_OnSafetyCancel_TheHeldPawnStaysInLethalAirUntilTheOrderEnds"/>.
    ///     ⚠️ <b>THAT LEG WAS REVERSED BY M3-14 (2026-07-31, owner batch item 7 answer B) and its
    ///     count above is M2-19's, not re-measured on this tree</b> — a held pawn no longer flees
    ///     at all, so the mutation now bites through the CANCEL half of the same test rather than
    ///     through the flee. The leg's own doc comment quotes what it used to assert.
    ///     ⭐ <b>AND <see cref="HeldWhileFleeing_StillReachesAirAndLives"/> STAYED GREEN, which is
    ///     the precise truth rather than the dramatic one:</b> a hold that survives into a flee does
    ///     NOT kill her, because <c>SafetySystem</c> and the path follower consult no recruitability
    ///     predicate at all. What it leaves is a stale order — which is why the leg asserts the
    ///     RELEASE and not a death.</item>
    ///   <item><b>5 (charter) — let the hold suppress Eat / Drink</b> (fold it into
    ///     <see cref="Citizen.IsIdleForWork"/>) ⇒ <b>RED 1/11</b>:
    ///     <see cref="TheHoldNeverReachesSustenance_AJoblessHeldPawnStillEats"/>. The refusal is a
    ///     PLACEMENT: <c>SustenanceSystem</c> gates on <c>IsIdleForWork</c>, which the hold does not
    ///     touch.</item>
    ///   <item><b>6 (charter) — drop the bool from the save writer / reader / hash fold</b> ⇒
    ///     <b>ALREADY PINNED BY M2-1; NOT DUPLICATED HERE, and that was verified rather than
    ///     assumed.</b> Dropping it from <c>SaveWriter</c> ⇒ RED 2 in the EXISTING suites:
    ///     <c>WorkPriorityStateTests.SaveRoundTrip_PreservesTheReservedHeldByOrderBool</c> (seeded
    ///     TRUE, so it is not an always-false round trip) and
    ///     <c>StateHashHonestyTests.SaveRoundTrip_PreservesTheWholeGrid_AndTheLoadHashesEqual</c>.
    ///     The offset leg is <c>WorkPriorityStateTests.GridWidthMismatch_KeepsTheStreamInSync</c>
    ///     (both directions) and the fold is <c>StateHashHonestyTests</c>' <c>Citizen.HeldByOrder</c>
    ///     case. A fourth spelling here would pin nothing new.</item>
    /// </list>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-19 — THE STICKY
    /// CLAIM". Mechanism authority: <c>docs/design/rimworld-reference.md</c> §2.2. Behaviour as
    /// implemented: <c>docs/MECHANICS.md</c> §6.2c.</para>
    /// </summary>
    [TestFixture]
    public class StickyClaimTests
    {
        // ------------------------------------------------------------------ shared fixtures
        // Deliberately the SAME hall PreemptionTests uses: this package's whole subject is what
        // M2-8 does to an ordered pawn, and a different map would make the two suites' results
        // incomparable.

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
        private static readonly Int3 PartsTile = new Int3(3, 1, 0);

        /// <summary>The shipped stack's relative order for the systems these legs use.
        /// <see cref="JobSystem"/> BEFORE the two push recruiters is shipped behaviour and is what
        /// makes a freed pawn claimable by a recruiter in the same tick — the measured defect this
        /// package exists to close.</summary>
        private static Simulation NewSim(out DeconstructSystem strip)
        {
            strip = new DeconstructSystem();
            return new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                strip,
            });
        }

        private static Simulation NewSim() => NewSim(out _);

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

        /// <summary>The grid says repair matters more than whatever she is on, and a machine that
        /// wants servicing appears. This is the pressure the hold has to survive.</summary>
        private static Device RaiseRepairTo(Simulation sim, Citizen pawn, byte band)
        {
            var machine = NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            pawn.SetWorkPriority(WorkType.Repair, band);
            sim.JobsDirty = JobBoardDirty.All;
            return machine;
        }

        /// <summary>One loose stack and somewhere to put it, far apart.</summary>
        private static ItemStack Haulable(Simulation sim)
        {
            var cargo = sim.AddItem(ItemKind.Scrap, 1, CargoStart);
            sim.World.SetFlag(Stockpile, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
            return cargo;
        }

        /// <summary>Tick until <paramref name="pawn"/> is carrying the haul she was given.</summary>
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
            Assert.Fail("fixture: the pawn never picked the haul up, so there is no job to hold her on");
            return null;
        }

        /// <summary>⭐ <b>THE ORDER, staged the way M2-9's <c>PrioritiseJobCommand</c> must: the job
        /// FIRST, the hold SECOND.</b> The precondition is the invariant — a hold on a pawn with no
        /// job is the one state the mechanism must never leave standing.</summary>
        private static void Hold(Citizen pawn)
        {
            Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.None),
                "fixture: the hold is placed on a JOB (RimWorld §2.2's curJob.playerForced). " +
                "Setting it on an idle pawn stages the illegal state, not the order.");
            pawn.HeldByOrder = true;
        }

        // ================================================== the headline legs

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S SENTENCE: she was told to do THIS, so the grid does not get to take
        /// her off it.</b>
        ///
        /// <para>She is claimed at <c>Haul@4</c> and driven until she is genuinely CARRYING the
        /// crate; the order is placed at that moment; then <c>Repair@1</c> and a machine crying out
        /// for service arrive — the exact fixture in which
        /// <c>PreemptionTests.RaisedBand_MidHaul_TheHaulIsDroppedAndTheRepairIsTaken</c> measures
        /// the crate hitting the floor. Held, she must carry it all the way.</para>
        ///
        /// <para><b>The controls are what make this more than "she eventually delivered":</b> the
        /// machine must still be WAITING the whole time (so the offer was real), and
        /// <see cref="Unheld_TheIdenticalFixtureIsPreemptedAndTheCrateNeverArrives"/> runs the same
        /// fixture without the hold and requires that she IS taken.</para>
        /// </summary>
        [Test]
        public void HeldMidHaul_ABetterBandedRepairDoesNotTakeHer()
        {
            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(cargo.Pos, Is.Not.EqualTo(Stockpile),
                "fixture: she must still be EN ROUTE when the order lands");
            Hold(pawn);

            var machine = RaiseRepairTo(sim, pawn, WorkPriority.Highest);

            bool delivered = false;
            bool machineStillWaitingWhenHeld = false;
            for (int t = 0; t < 3000 && !delivered; t++)
            {
                sim.Tick();
                if (pawn.HeldByOrder)
                {
                    Assert.That(pawn.JobKind, Is.EqualTo(JobKind.HaulDeliver),
                        "⛔ THE HOLD: a crew member the player put on a job stays on it. She left " +
                        "it at tick " + sim.TickCount + " for work the GRID ranked higher — which " +
                        "is M2-8 eating the player's own instrument.");
                    if (machine.Condition < sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow)
                        machineStillWaitingWhenHeld = true;
                }
                delivered = cargo.Pos == Stockpile && cargo.CarriedBy == 0;
            }

            Assert.That(delivered, Is.True,
                "she must COMPLETE the ordered haul — a hold that merely stops her being reassigned " +
                "and leaves her standing still is not 'the order sticks'");
            Assert.That(machineStillWaitingWhenHeld, Is.True,
                "⛔ CONTROL: the better-banded work must have been REAL and WAITING while she was " +
                "held. A repaired (or unclaimable) machine makes every assertion above vacuous.");
            Assert.That(pawn.HeldByOrder, Is.False,
                "and completion RELEASES the hold — §2.2's forced flag dies with its job");
        }

        /// <summary>
        /// ⛔ <b>THE INCLUSION CONTROL, in its own <c>[Test]</c> because <c>assert</c> throws.</b> The
        /// identical fixture with the hold left OFF: M2-8 must take her, and the crate must NOT
        /// reach the stockpile. Without this the leg above is satisfied by a fixture in which
        /// nothing could ever have pre-empted anybody.
        /// </summary>
        [Test]
        public void Unheld_TheIdenticalFixtureIsPreemptedAndTheCrateNeverArrives()
        {
            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(pawn.HeldByOrder, Is.False, "control: NO hold in this leg");

            RaiseRepairTo(sim, pawn, WorkPriority.Highest);

            long served = -1;
            for (int t = 0; t < 3000 && served < 0; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain) served = sim.TickCount;
            }
            Assert.That(served, Is.GreaterThan(0),
                "control: unheld, Repair@1 DOES reach a pawn busy at Haul@4 — that is M2-8, and it " +
                "is what the hold has to overrule");
            Assert.That(cargo.Pos, Is.Not.EqualTo(Stockpile),
                "control: and she left the crate short of the stockpile, so the held leg's delivery " +
                "is the hold's doing and not the fixture's");
        }

        /// <summary>
        /// ⭐⭐ <b>THE CHARTER'S HEADLINE LEG: 30 000 TICKS WITH A NEEDY MACHINE PRESENT, AND
        /// <c>MaintenanceSystem</c> NEVER GETS HER WHILE SHE IS HELD.</b> The M2-0 spike's window,
        /// run whole — it measured a directly-ordered pawn idle on 11 ticks of exactly this many.
        ///
        /// <para>Three things are checked on EVERY one of those ticks, because the failure this
        /// package exists to close is a same-tick one and a sampled check would step over it:
        /// she is never <c>Maintain</c> while held, she never holds NO job while held (the
        /// invariant), and the machine's need is recorded so the run cannot pass by being empty.</para>
        ///
        /// <para><b>And the ordering assertion is the real claim:</b> the ordered haul must complete
        /// BEFORE the repair is ever started. "She repaired it eventually" is true with no hold at
        /// all — it is the order of the two events that says the player was obeyed.</para>
        /// </summary>
        [Test]
        public void HeldPawn_IsNeverClaimedByMaintenance_AcrossThirtyThousandTicks()
        {
            const int Window = 30000;

            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Hold(pawn);
            var machine = RaiseRepairTo(sim, pawn, WorkPriority.Highest);
            float maintainBelow = sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow;

            int heldTicks = 0, heldTicksWithTheMachineWaiting = 0;
            long deliveredAt = -1, firstMaintainAt = -1;
            for (int t = 0; t < Window; t++)
            {
                sim.Tick();

                if (pawn.HeldByOrder)
                {
                    heldTicks++;
                    Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.Maintain),
                        "⛔ THE HEADLINE: MaintenanceSystem claimed a HELD crew member at tick " +
                        sim.TickCount);
                    Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.None),
                        "⛔ THE INVARIANT (HeldByOrder ⇒ JobKind != None) broke at tick " +
                        sim.TickCount + ". A hold that outlives its job is a crew member nothing " +
                        "may recruit and nothing can re-order — a silent, permanent idle.");
                    if (machine.Condition < maintainBelow) heldTicksWithTheMachineWaiting++;
                }

                if (deliveredAt < 0 && cargo.Pos == Stockpile && cargo.CarriedBy == 0)
                    deliveredAt = sim.TickCount;
                if (firstMaintainAt < 0 && pawn.JobKind == JobKind.Maintain)
                    firstMaintainAt = sim.TickCount;
            }

            Assert.That(heldTicks, Is.GreaterThan(100),
                "fixture: the hold must have been in force for a real window, not two ticks");
            Assert.That(heldTicksWithTheMachineWaiting, Is.EqualTo(heldTicks),
                "⛔ CONTROL: the machine wanted service on EVERY held tick. If it did not, " +
                "'she was never taken to it' says nothing at all.");
            Assert.That(deliveredAt, Is.GreaterThan(0), "the ordered haul must have completed");
            Assert.That(firstMaintainAt, Is.GreaterThan(0),
                "⛔ CONTROL: and she DOES service the machine once the order is done — the refusal " +
                "above is the hold, not an unreachable machine (this is the leg that would go " +
                "green on a fixture where nobody could ever have been recruited)");
            Assert.That(firstMaintainAt, Is.GreaterThanOrEqualTo(deliveredAt),
                "⛔ THE ORDER OF EVENTS IS THE CLAIM: the player's order finished FIRST, and only " +
                "then did the grid get her back");
            // ⭐ MEASURED, and it is why the bound above is >= and not >: the two land on the SAME
            // TICK (161 and 161 on this fixture). JobSystem completes the delivery, the release
            // fires inside that write, and MaintenanceSystem — which runs LATER in the same tick —
            // claims her immediately. That is the M2-0 same-tick re-claim doing exactly what it
            // should once the order is over, and it is the charter's acceptance step 4 ("when it
            // completes, she returns to normal autonomy") with no idle gap at all.
            Assert.That(firstMaintainAt - deliveredAt, Is.LessThan(20),
                "control: and the hand-back is immediate — a release that only took effect on some " +
                "later pass would leave the player's crew standing about after every order");
        }

        // ================================================== the release legs (mutation 3)

        /// <summary>
        /// <b>RELEASE 1 — COMPLETION. She returns to normal autonomy under the grid</b> (the
        /// charter's acceptance step 4). Blinded of the other release conditions.
        ///
        /// <para>The tick of the release is read exactly: the hold must be gone on the FIRST tick
        /// she reads <c>JobKind.None</c>, not a pass later — a recruiter running after
        /// <see cref="JobSystem"/> in the same tick is entitled to her from that instant.</para>
        /// </summary>
        [Test]
        public void Release_OnCompletion_SheReturnsToAutonomyUnderTheGrid()
        {
            var sim = NewSim();
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Hold(pawn);

            bool sawRelease = false;
            for (int t = 0; t < 3000 && !sawRelease; t++)
            {
                sim.Tick();
                if (cargo.Pos == Stockpile && cargo.CarriedBy == 0)
                {
                    Assert.That(pawn.HeldByOrder, Is.False,
                        "⛔ THE ORDER IS OVER THE MOMENT THE JOB IS: a hold that survives its own " +
                        "completion locks her out of every recruiter forever");
                    sawRelease = true;
                }
            }
            Assert.That(sawRelease, Is.True, "fixture: the ordered haul must have completed");

            // Non-vacuity: released means RECRUITABLE, not merely "the bool went false".
            var machine = RaiseRepairTo(sim, pawn, WorkPriority.Highest);
            long served = -1;
            for (int t = 0; t < 6000 && served < 0; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain) served = sim.TickCount;
            }
            Assert.That(served, Is.GreaterThan(0),
                "and she is genuinely back in the labour pool — the grid picks her up again");
            Assert.That(machine, Is.Not.Null);
        }

        /// <summary>
        /// <b>RELEASE 2 — A NEW DIRECT ORDER.</b> Every direct order cancels what she was doing
        /// first (<c>MoveCitizenCommand</c> already does exactly that, <c>Commands.cs:71</c>), so the
        /// old hold falls with the old job and the new one is placed on the new job. Blinded.
        ///
        /// <para>The second half is the one worth having: the NEW order must be just as sticky as
        /// the first. A release rule that quietly disarmed the mechanism after one use would pass a
        /// "the bool went false" assertion perfectly.</para>
        /// </summary>
        [Test]
        public void Release_ANewDirectOrderReplacesTheOldHold()
        {
            var sim = NewSim(out var strip);
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            pawn.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Lowest);

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Hold(pawn);

            // --- THE NEW ORDER, step one: it cancels what she was doing.
            sim.CancelJob(pawn);
            pawn.ClearPath();
            Assert.That(pawn.HeldByOrder, Is.False,
                "⛔ the OLD order is over: a hold that survives the cancel would protect a job she " +
                "is no longer on");
            Assert.That(cargo.CarriedBy, Is.EqualTo(0u),
                "fixture control: the cancel really happened (she set the crate down)");

            // --- Step two: the new order is a strip of the hall's one interior wall. Claimed
            // through the dispatcher at Deconstruct@4, then held — the writer's own sequence.
            // Haul goes OFF first: the crate she just set down is still on the board, and a
            // dispatcher choosing between two band-4 jobs by DISTANCE would hand her the crate at
            // her feet, so the "new order" would be the old one wearing a different name.
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Off);
            Assert.That(strip.Designate(sim, StripWall, DeconstructKind.Wall), Is.True,
                "fixture: the interior wall is the hall's one legal strip target");
            sim.JobsDirty = JobBoardDirty.All;
            long claimed = -1;
            for (int t = 0; t < 600 && claimed < 0; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Deconstruct) claimed = sim.TickCount;
            }
            Assert.That(claimed, Is.GreaterThan(0), "fixture: she must take the new job");
            Hold(pawn);

            // --- And the NEW order is sticky too: Repair@1 must not take her off it.
            RaiseRepairTo(sim, pawn, WorkPriority.Highest);
            bool stripped = false;
            for (int t = 0; t < 20000 && !stripped; t++)
            {
                sim.Tick();
                if (pawn.HeldByOrder)
                    Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Deconstruct),
                        "⛔ the SECOND order must hold exactly as the first did — she left it at " +
                        "tick " + sim.TickCount);
                stripped = sim.World.GetWall(StripWall) == 0;
            }
            Assert.That(stripped, Is.True, "the newly-ordered strip must complete");
            Assert.That(strip, Is.Not.Null);
        }

        /// <summary>
        /// <b>RELEASE 3 — DEATH.</b> Driven on real atmosphere: she digs in a compartment whose air
        /// is blown out from under her, with <c>SafetySystem</c> deliberately ABSENT (the
        /// <c>CrewSafetyTests</c> mutation stack), so <c>NeedsSystem</c> kills her. Blinded.
        ///
        /// <para>A dead crew member holds no job, and a hold on a corpse is state that can never be
        /// cleared by anything: nothing ticks her and no order can reach her.</para>
        /// </summary>
        [Test]
        public void Release_OnDeath_TheHoldDoesNotOutliveTheCitizen()
        {
            var sim = NewVentedDigSim(withSafetyGuard: false, out var crew);
            Assert.That(DigStartedThenVentTheWorkRoom(sim, crew), Is.True,
                "fixture: she must be settled on the dig before the air goes");
            Hold(crew);

            for (int t = 0; t < 6000 && !crew.Dead; t++) sim.Tick();

            Assert.That(crew.Dead, Is.True,
                "fixture: without SafetySystem she must actually die in the vacuum — otherwise this " +
                "leg tests nothing (CrewSafetyTests' own mutation control)");
            Assert.That(crew.HeldByOrder, Is.False,
                "⛔ death releases the hold. NeedsSystem.Kill routes through Simulation.CancelJob, " +
                "which is a job ending like any other.");
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.None),
                "control: and it is the job ending that did it, not a special death branch");
        }

        /// <summary>
        /// ⭐⭐ <b>RELEASE 4 — REVERSED BY OWNER DECISION, 2026-07-31 (M3-14 RUNG 4). THE HELD PAWN
        /// DOES NOT FLEE.</b>
        ///
        /// <para>⛔ <b>WHAT THIS TEST USED TO ASSERT, QUOTED SO THE CHANGE IS A DECISION ON THE PAGE
        /// AND NOT A GREEN SUITE THAT DRIFTED:</b> it was headed *"GENUINE INABILITY:
        /// <c>SafetySystem</c> CANCELS THE ORDERED JOB AND SHE FLEES"*, and it failed with *"⛔
        /// SURVIVAL OUTRANKS THE ORDER: a held crew member in lethal air still flees.
        /// <c>SafetySystem</c> consults no recruitability predicate, and this is the leg that would
        /// catch anyone teaching it one."* <b>M2-19 was right about the tree it shipped on and the
        /// rule it described is now retired.</b> Owner batch item 7, answer B (M3-14, the
        /// vacuum-work ladder) takes RimWorld's rung 4:
        /// <c>docs/design/rimworld-reference.md</c> §8.4, <c>JobGiver_FindOxygen</c>'s second
        /// guard — *"the player can order a colonist to stay and suffocate, and RimWorld implements
        /// that deliberately as one clause."* <c>SafetySystem</c> now consults exactly one predicate
        /// and it is <see cref="Citizen.HeldByOrder"/>.</para>
        ///
        /// <para>⚠️ <b>SHE MAY DIE, AND THAT IS THE FEATURE, NOT A REGRESSION THIS LEG SHOULD
        /// SOFTEN.</b> A bypass that quietly rescues the pawn is a bypass the player cannot reason
        /// about. What is asserted instead is that the order is still the whole contract: she stays
        /// while it lasts, and the moment it ends the rescue is hers again — which is the
        /// <see cref="CancelJob"/> leg at the bottom.</para>
        ///
        /// <para>Same fixture as the death leg with the guard back IN, so the ONLY difference from
        /// <see cref="Release_OnDeath_TheHoldDoesNotOutliveTheCitizen"/> is the presence of the
        /// system that would have saved her. Blinded.</para>
        /// </summary>
        [Test]
        public void Release_OnSafetyCancel_TheHeldPawnStaysInLethalAirUntilTheOrderEnds()
        {
            var sim = NewVentedDigSim(withSafetyGuard: true, out var crew);
            Assert.That(DigStartedThenVentTheWorkRoom(sim, crew), Is.True,
                "fixture: she must be settled on the dig before the air goes");
            Hold(crew);

            // ⚠️ STOPPED AT THE THRESHOLD, NOT RUN TO DEATH — and that is a fixture decision worth
            // the line. Rung 4 means she now DIES if left there (VacuumOrderLadderTests pins that
            // deliberately), and a release leg measured on a corpse would pass for the wrong reason:
            // a dead pawn does not flee either.
            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            bool fled = false;
            for (int t = 0; t < 8000 && !crew.Dead && crew.Suffocation <= fleeAt; t++)
            {
                sim.Tick();
                if (crew.JobKind == JobKind.Flee) fled = true;
            }
            // …and a few seconds PAST it, so the 1 Hz guard has had passes in which to trip.
            for (int t = 0; t < 60 && !crew.Dead; t++)
            {
                sim.Tick();
                if (crew.JobKind == JobKind.Flee) fled = true;
            }

            Assert.That(crew.Dead, Is.False,
                "fixture: she must still be alive here — the release below is a claim about a living " +
                "crew member, and a corpse would satisfy 'did not flee' for the wrong reason");
            Assert.That(crew.Suffocation, Is.GreaterThan(fleeAt),
                "fixture: her suffocation must actually cross the flee threshold, or 'she did not " +
                "flee' is a vacuity about a pawn who was never in danger");
            Assert.That(fled, Is.False,
                "⛔ M3-14 RUNG 4: a HELD crew member fled an order the player gave. §8.4's clause is " +
                "one line in SafetySystem.Tick and something has softened it — which re-creates the " +
                "silent refusal in a nicer costume.");

            // …and the order is still the whole contract: END it, and the rescue is hers again.
            sim.CancelJob(crew);
            Assert.That(crew.HeldByOrder, Is.False,
                "premise: ending the job released the hold (the JobKind setter's contract)");

            for (int t = 0; t < 1200 && !crew.Dead && crew.JobKind != JobKind.Flee; t++) sim.Tick();
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Flee),
                "⛔ THE SUPPRESSION OUTLIVED THE ORDER IT BELONGS TO. Rung 4 is scoped to the hold " +
                "and to nothing else — an un-held crew member in lethal air must still be pulled out.");
        }

        /// <summary>
        /// ⛔ <b>MUTATION 4, IN ITS STRONGEST FORM: a hold FORCED onto a pawn who is already
        /// fleeing cannot stop her.</b> The illegal state is staged on purpose — this is the leg
        /// that fails if any future edit teaches the flee path, the path-follower or the recovery
        /// branch to consult <c>HeldByOrder</c>.
        /// </summary>
        [Test]
        public void HeldWhileFleeing_StillReachesAirAndLives()
        {
            var sim = NewVentedDigSim(withSafetyGuard: true, out var crew);
            Assert.That(DigStartedThenVentTheWorkRoom(sim, crew), Is.True, "fixture: the dig started");

            for (int t = 0; t < 6000 && crew.JobKind != JobKind.Flee; t++) sim.Tick();
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Flee), "fixture: she must be mid-flee");

            crew.HeldByOrder = true; // the state the invariant forbids, staged as a weapon

            float fleeAt = sim.Defs.Needs.FleeSuffocation;
            bool recovered = false;
            for (int t = 0; t < 6000 && !recovered; t++)
            {
                sim.Tick();
                recovered = crew.Suffocation < 0.5f * fleeAt && crew.JobKind != JobKind.Flee;
            }

            Assert.That(crew.Dead, Is.False,
                "⛔ she must live. A hold that reached the flee would leave her standing in vacuum.");
            Assert.That(recovered, Is.True, "she completed the flee and recovered in good air");
            Assert.That(crew.HeldByOrder, Is.False,
                "and the staged hold was cleared when the flee ended (JobKind → None) — the " +
                "invariant repairs itself rather than stranding her");
        }

        // ================================================== survival (mutation 5)

        /// <summary>
        /// ⛔ <b>MUTATION 5 — THE HOLD NEVER SUPPRESSES EAT/DRINK, and the reason is a PLACEMENT:
        /// <c>SustenanceSystem</c> gates on <see cref="Citizen.IsIdleForWork"/>, which does not
        /// carry the hold.</b> Fold the hold into <c>IsIdleForWork</c> instead of
        /// <see cref="Citizen.IsRecruitableIgnoringJob"/> and this leg reddens.
        ///
        /// <para>The hold is staged on a JOBLESS pawn — the illegal state again, deliberately,
        /// because it is the only way to ask the question at all: a pawn who holds a job never
        /// self-serves whether she is held or not, so a "legal" fixture would be green for a reason
        /// that has nothing to do with the hold. Real hunger, a real potato, a real meal.</para>
        /// </summary>
        [Test]
        public void TheHoldNeverReachesSustenance_AJoblessHeldPawnStillEats()
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                new SustenanceSystem(),
            });
            var pawn = sim.AddCitizen("Rell", PawnStart);
            sim.AddItem(ItemKind.Potato, 1, new Int3(17, 2, 0));
            sim.JobsDirty = JobBoardDirty.All;

            pawn.Hunger = 0.80f;
            Assert.That(pawn.Hunger, Is.GreaterThanOrEqualTo(sim.Defs.Sustenance.NeedThreshold),
                "fixture: she must really be hungry enough to self-serve");
            pawn.HeldByOrder = true;

            bool ateWhileHeld = false;
            for (int t = 0; t < 900; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Eat) ateWhileHeld = true;
            }

            Assert.That(ateWhileHeld, Is.True,
                "⛔ NEEDS ARE NOT WORK. An order the player gave must never be a way to starve " +
                "someone — the same rule E0-3 wrote for OrderedMove.");
            Assert.That(pawn.Hunger, Is.LessThan(sim.Defs.Sustenance.NeedThreshold),
                "and the meal actually COMPLETED — a pawn who starts eating and is cancelled off " +
                "the food every tick starves just as surely");
        }

        // ================================================== the invariant contract

        /// <summary>
        /// ⛔ <b>THE INVARIANT, AS A CONTRACT: <c>HeldByOrder ⇒ JobKind != None</c>.</b> Ending the
        /// job releases the hold, and ONLY ending it does — the setter must not clear on every
        /// write, or a writer could never place a hold at all.
        /// </summary>
        [Test]
        public void TheHoldCannotOutliveTheJobItWasPlacedOn()
        {
            var sim = NewSim();
            var pawn = sim.AddCitizen("Rell", PawnStart);

            pawn.JobKind = JobKind.Dig;
            pawn.HeldByOrder = true;
            Assert.That(pawn.HeldByOrder, Is.True,
                "non-vacuity: a hold can be placed at all — a setter that cleared unconditionally " +
                "would make every other leg in this file green for the wrong reason");

            pawn.JobKind = JobKind.HaulPickup;
            Assert.That(pawn.HeldByOrder, Is.True,
                "a change of KIND is not the end of the order — the writer stages job then hold, " +
                "and a source that re-kinds a job mid-errand (HaulPickup → HaulDeliver) must not " +
                "drop it");

            pawn.JobKind = JobKind.None;
            Assert.That(pawn.HeldByOrder, Is.False,
                "⛔ and the job ending IS the release. This one line stands in for the twenty " +
                "sites in sim/ that end a job; releasing at those instead is the five-site " +
                "discipline, and one missed site is a permanently unrecruitable crew member.");
        }

        /// <summary>
        /// ⭐ <b>THE PLACEMENT, PINNED AS BEHAVIOUR: the hold is read through the ONE predicate every
        /// claim gate and the pre-emption gate share</b> (<see cref="Citizen.IsRecruitableIgnoringJob"/>),
        /// so no site can drift laxer than another.
        ///
        /// <para>Asked as a BEHAVIOUR rather than as a text scan (TRAPS 4): a held pawn must answer
        /// <c>false</c> to both recruitability predicates while a pawn identical in every other
        /// respect answers <c>true</c>. The <c>IsRecruitableForWork</c> half is honestly SUBSUMED by
        /// the <c>JobKind == None</c> clause and is asserted anyway, because a later refactor that
        /// re-splits the two predicates must not be able to leave the hold behind in one of
        /// them.</para>
        /// </summary>
        [Test]
        public void TheHoldIsReadThroughTheOnePredicateEveryClaimGateShares()
        {
            var sim = NewSim();
            var free = sim.AddCitizen("Free", PawnStart);
            var held = sim.AddCitizen("Held", new Int3(3, 2, 0));

            free.JobKind = JobKind.Maintain;
            held.JobKind = JobKind.Maintain;
            held.HeldByOrder = true;

            Assert.That(free.IsRecruitableIgnoringJob, Is.True,
                "control: everything except the hold is identical, so the pair differ in one bit");
            Assert.That(held.IsRecruitableIgnoringJob, Is.False,
                "⛔ the pre-emption gate (JobSystem.TryPreempt) and all three asIfIdle offer " +
                "queries read this — it is the site that actually stops the steal");

            free.JobKind = JobKind.None;
            held.JobKind = JobKind.None;
            held.HeldByOrder = true; // re-staged: the transition above released it by design
            Assert.That(free.IsRecruitableForWork, Is.True, "control");
            Assert.That(held.IsRecruitableForWork, Is.False,
                "and the claim gates (the dispatcher and both push recruiters) see the same rule");
        }

        // ------------------------------------------------------------------ atmosphere fixture

        private static readonly string[] TwoRoomMap =
        {
            "#######",
            "#..#..#",
            "#.....#",
            "#..#..#",
            "#######",
        };

        private static readonly Int3 WorkTile = new Int3(1, 1, 0);   // in the room that gets vented
        private static readonly Int3 DebrisTile = new Int3(2, 1, 0); // the dig, adjacent to WorkTile
        private static readonly Int3 RefugeTile = new Int3(4, 2, 0); // stays breathable
        private static readonly Int3 DoorTile = new Int3(3, 2, 0);

        /// <summary>
        /// <c>CrewSafetyTests</c>' two-room fixture, reused rather than re-invented: a real dig in a
        /// compartment that is vented once she is settled on it. Both rooms boot PRESSURISED — the
        /// worksite-staging rule refuses to dispatch anyone into already-lethal air, so the only way
        /// to get a working crew member into a vacuum is to take the air away afterwards.
        /// <paramref name="withSafetyGuard"/> off is that suite's own mutation stack, and it kills
        /// her.
        /// </summary>
        private static Simulation NewVentedDigSim(bool withSafetyGuard, out Citizen crew)
        {
            var systems = new List<ISimSystem>
            {
                new CitizenSystem(), new JobSystem(), new NeedsSystem(),
            };
            if (withSafetyGuard) systems.Add(new SafetySystem());
            var sim = new Simulation(AsciiWorld.Build(TwoRoomMap), 1, systems.ToArray());

            sim.AddDevice(DeviceKind.Door, DoorTile, "door").IsOpen = true;
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, RefugeTile));
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, WorkTile));

            sim.World.SetWall(DebrisTile, TileDefs.Debris);
            sim.World.SetFlag(DebrisTile, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;

            crew = sim.AddCitizen("Ito", WorkTile).GiveAllWork();
            return sim;
        }

        /// <summary>Tick until she is settled ON the dig (working, not walking), then blow the
        /// compartment's atmosphere. This stack carries no <c>AtmosphereSystem</c>, so nothing
        /// refills it and the refuge stays breathable — the breach is permanent.</summary>
        private static bool DigStartedThenVentTheWorkRoom(Simulation sim, Citizen crew, int budget = 600)
        {
            for (int t = 0; t < budget; t++)
            {
                sim.Tick();
                if (crew.Dead) return false;
                if (crew.JobKind != JobKind.Dig || crew.HasPath) continue;
                if (!Int3.IsAdjacent4(crew.Pos, DebrisTile)) continue;
                var room = sim.Rooms.RoomAt(sim.World, crew.Pos);
                room.O2Moles = 0;
                room.CO2Moles = 0;
                room.N2Moles = 0;
                return true;
            }
            return false;
        }
    }
}
