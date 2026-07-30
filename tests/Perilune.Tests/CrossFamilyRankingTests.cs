using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M2-5 — CROSS-FAMILY RANKING. THE BAND LOOP AND THE RECRUITER-CLAIM QUERY.</b>
    ///
    /// <para>Before this package a work type could be on or off (M2-2) but nothing ranked two KINDS
    /// of work against each other: dispatch was a distance-only tournament and source registration
    /// order was a tie-break, not a priority. After it, <c>Repair@1 / Haul@4</c> means what it
    /// says.</para>
    ///
    /// <para>⭐ <b>WHY THERE ARE TWO HEADLINE LEGS AND NOT ONE, AND WHY THE ORDER THEY ARE READ IN
    /// MATTERS.</b> The M2-0 spike built the dispatcher half alone — <c>TryAssign</c> defers to a
    /// better-banded push recruiter — and it was <b>byte-identical to no change at all</b> on the
    /// owner's own case, because <c>MaintenanceSystem.Tick</c> frees and re-claims the same pawn
    /// inside ONE tick and the dispatcher never sees her idle.
    /// <list type="bullet">
    ///   <item><see cref="Inversion_RepairAtOne_DeconstructAtFour_TheServiceIsTakenFirst"/> is the
    ///     <b>t=0</b> case. It PASSES with the push gate deleted — that is exactly how the spike's
    ///     no-op looked green.</item>
    ///   <item><see cref="MidChain_DeconstructAtOne_PaintedDuringAChain_IsServedWithoutWaitingItOut"/>
    ///     is the <b>running-chain</b> case, and it is the leg this package exists for. It is the
    ///     only one the defer half alone cannot produce.</item>
    /// </list>
    /// ⛔ <b>A reviewer must refuse a package that ships only the defer half.</b> It passes a t=0
    /// demo, it passes a plausible suite, and it delivers nothing the owner asked for.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS DRIVEN.</b> Nothing here scans for a method name or asserts that a
    /// predicate exists — "verb parity is not sufficient" — and every leg that asserts a REFUSAL
    /// carries its non-vacuity half in the same fixture, so "she never took it" can never be
    /// satisfied by an empty board or a pawn nobody could have recruited.</para>
    ///
    /// <para>Under OD-H every work type boots OFF, so every fixture here GRANTS work explicitly. A
    /// fixture that forgot would exercise nothing at all and read as a perfect pass.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row
    /// was edited into the shipped tree, all 12 legs were run, and the tree was restored from an
    /// in-memory copy taken before the first row — never <c>git checkout</c> (TRAPS 2). The harness
    /// hard-errors when a mutation's anchor text is not found, so "applied" is not an assumption.
    /// <b>"RED" below is what the run reported, not what was expected</b>, and two rows did not
    /// report what was expected — both are written down rather than tidied.</para>
    /// <list type="table">
    ///   <item><b>1</b> ship the DEFER half only (both push gates deleted) ⇒ RED:
    ///     <c>MidChain_*</c>, <c>CraftPushGate_*</c> (2/12). ⭐⭐ <b><c>Inversion_*</c> STAYED
    ///     GREEN</b> — the spike's half-done shipment, reproduced on demand.</item>
    ///   <item><b>2</b> ship the PUSH GATE only (the defer deleted) ⇒ RED: <c>Inversion_*</c>,
    ///     <c>Ranking_*</c>, both <c>EqualBand_*</c> (4/12). ⭐ <b><c>MidChain_*</c> STAYED
    ///     GREEN</b> — the two halves are pinned by disjoint legs, which is the whole point.</item>
    ///   <item><b>3</b> collapse the band loop to a single pass ⇒ RED: both <c>EqualBand_*</c>
    ///     (2/12). ⚠️ <b>NOT <c>Ranking_*</c>, and the charter predicted it would be.</b> Measured
    ///     reason: with the per-band defer still in place, band 1's defer to a better-ranked push
    ///     recruiter rescues <c>Repair@1</c>/<c>Haul@4</c> on its own. <c>Ranking_*</c> is guarded by
    ///     row 7 instead. A prediction is not a measurement.</item>
    ///   <item><b>4</b> swap the two ENDS of the authored order (Repair 900 ↔ Haul 100) ⇒ RED:
    ///     <c>EqualBand_RepairAndHaul*</c> (1/12) — and <c>EqualBand_TheTieFollows*</c> stays green,
    ///     because a correct arbitration follows the constant wherever it points.</item>
    ///   <item><b>4b(i)</b> author the constants ALPHABETICALLY, enum untouched ⇒ RED:
    ///     <c>EqualBand_RepairAndHaul*</c> (1/12).</item>
    ///   <item>⭐⭐ <b>4b(ii)</b> the same alphabetical table AND the arbitration tying on the
    ///     <see cref="WorkType"/> enum's DECLARATION ORDER ⇒ RED:
    ///     <c>EqualBand_TheTieFollows*</c> (1/12) — <b>and <c>EqualBand_RepairAndHaul*</c> stays
    ///     GREEN.</b> That inversion is the proof the two legs are not restatements of each other:
    ///     the display and the constant agree in the shipped table, so only a leg that reads the
    ///     CONSTANT can see an arbitration that has implemented the display.</item>
    ///   <item><b>5</b> the arbitration always answers "nothing better" ⇒ RED: 7/12.</item>
    ///   <item><b>6</b> ...always answers "something better" ⇒ RED: 11/12 — including
    ///     <c>IdleStarvation_*</c>, the leg that exists for exactly this.</item>
    ///   <item><b>7</b> iterate the bands 4 → 1 ⇒ RED: <c>Ranking_*</c>, <c>Inversion_*</c>,
    ///     <c>MidChain_*</c> (3/12).</item>
    ///   <item><b>8</b> skip the <c>d &gt;= bestDist</c> guard inside a band ⇒ RED:
    ///     <c>ArgminIntegrity_*</c> ALONE (1/12).</item>
    ///   <item><b>9a</b> let staging ignore walkability ⇒ RED:
    ///     <c>PriorityNeverOverridesPhysics_*</c> (and 5 collateral, 6/12).</item>
    ///   <item>⛔ <b>9b</b> the charter's literal form — <c>WorksiteSafety.CanStageWorkerAt</c>
    ///     always permits ⇒ <b>ALL GREEN. NOT COVERED HERE, and filed rather than hidden.</b> This
    ///     fixture's physics leg is GEOMETRIC (a machine walled into a pocket), so it exercises the
    ///     walkability half of the staging rule and not the AIR half; the air half needs a
    ///     <c>NeedsSystem</c> + <c>SafetySystem</c> + a pressurised room, and is already guarded by
    ///     <c>BlockedChannelTests</c> and the worksite-safety package. ⚠️ What M2-5 could have broken
    ///     is a band buying PAST the rule, and that is what 9a shows it cannot.</item>
    ///   <item>⭐ <b>10</b> <c>CraftingSystem</c>'s query over-reports (staged inputs ignored) ⇒ RED:
    ///     <c>MultiPawnStall_*</c> ALONE (1/12) — the spike's own accidental bug, caught by the only
    ///     leg with four pawns in it.</item>
    ///   <item><b>11</b> the five arbitration sites, one omission each ⇒ site 1 (<c>TryAssign</c>)
    ///     RED <c>Inversion_*</c> +3; site 2 (the dispatcher's fan-out) RED <c>MidChain_*</c>; site 3
    ///     (<c>MaintenanceSystem</c>) RED <c>MidChain_*</c>; site 4 (<c>CraftingSystem</c>) RED
    ///     <c>CraftPushGate_*</c> ALONE; site 5 (<c>EffectValidator</c>) RED <c>LlmGrant_*</c> ALONE.
    ///     ⚠️ <b>SITES 2 AND 3 SHARE ONE LEG and this fixture cannot separate them</b> — the
    ///     running-chain case needs the dispatcher to ANSWER "I have a deconstruct" and the
    ///     recruiter to ASK, so it is jointly load-bearing on both. Stated as an instrument limit,
    ///     because "two sites, one leg" and "one site I forgot to cover" look identical in a
    ///     green run.</item>
    /// </list>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-5 — cross-family
    /// ranking". Mechanism authority: <c>docs/design/rimworld-reference.md</c> §1.3. Order: OD-J.</para>
    /// </summary>
    [TestFixture]
    public class CrossFamilyRankingTests
    {
        // ------------------------------------------------------------------ shared fixtures

        /// <summary>One open room with ONE INTERIOR WALL at <see cref="StripWall"/> — the only
        /// deconstruct target the rule accepts (the outer ring is pressure hull and is refused).
        /// Everything is reachable from everything, so a refusal in any leg here is the arbitration
        /// and never M1-H's reachability probe.</summary>
        private static readonly string[] OpenMap =
        {
            "############",
            "#..........#",
            "#....#.....#",
            "#..........#",
            "############",
        };

        private static readonly Int3 StripWall = new Int3(5, 2, 0);
        private static readonly Int3 PawnStart = new Int3(2, 2, 0);
        private static readonly Int3 FarMachine = new Int3(10, 1, 0);

        /// <summary>The shipped stack's relative order for the systems these legs use. It is not a
        /// convenience: <c>JobSystem</c> BEFORE the two push recruiters is what makes "leave her
        /// idle and the recruiter takes her this same tick" true, and reversing it would make every
        /// defer cost a tick.</summary>
        private static ISimSystem[] Stack(out DeconstructSystem strip)
        {
            strip = new DeconstructSystem();
            return new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                strip,
            };
        }

        private static Simulation NewSim(out DeconstructSystem strip) =>
            new Simulation(AsciiWorld.Build(OpenMap), 11, Stack(out strip));

        /// <summary>A machine that wants service, with the consumable a service needs aboard.
        /// Condition sits below its maintain threshold and above the wreck floor, so neither the
        /// W2 wreck rule nor a missing Part is what could refuse it.</summary>
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

        private static void Debris(Simulation sim, Int3 p)
        {
            sim.World.SetWall(p, TileDefs.Debris);
            sim.World.SetFlag(p, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;
        }

        private static void Haulable(Simulation sim, Int3 stack, Int3 stockpile)
        {
            sim.AddItem(ItemKind.Scrap, 1, stack);
            sim.World.SetFlag(stockpile, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
        }

        /// <summary>Run until <paramref name="pawn"/> holds a WORK job (needs and self-preservation
        /// are not work and are not the subject), and report which one — or
        /// <see cref="JobKind.None"/> if she never took any.</summary>
        private static JobKind FirstWorkKind(Simulation sim, Citizen pawn, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (WorkTypeMap.TryOf(pawn.JobKind, out _)) return pawn.JobKind;
            }
            return JobKind.None;
        }

        /// <summary>The tick at which <paramref name="pawn"/> first holds <paramref name="kind"/>,
        /// or -1. Ticks from the CURRENT tick, so a caller may set the world up mid-run.</summary>
        private static long TickOfFirst(Simulation sim, Citizen pawn, JobKind kind, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (pawn.JobKind == kind) return sim.TickCount;
            }
            return -1;
        }

        // ================================================== the two headline legs

        /// <summary>
        /// ⭐ <b>THE t=0 INVERSION — mutation 2's leg (ship the PUSH GATE only) and mutation 5's
        /// (the arbitration query always answers false).</b>
        ///
        /// <para><c>Repair@1</c> and <c>Deconstruct@4</c>, both claimable at tick 0, and the
        /// deconstruct is the NEARER of the two. Without the defer half <c>JobSystem</c> runs first
        /// in the tick, sees a deconstruct site and claims it — the low-band order steals the pawn
        /// before <c>MaintenanceSystem</c> is ever asked. The distance is the fixture: put the
        /// service nearer and the leg proves nothing, because the argmin would have chosen it
        /// anyway.</para>
        ///
        /// <para>⚠️ <b>THIS LEG PASSES WITH THE PUSH GATE DELETED.</b> That is not a weakness — it is
        /// the recorded signature of the M2-0 spike's half-done shipment, and the reason the
        /// running-chain leg below exists and is run BLINDED of this one.</para>
        /// </summary>
        [Test]
        public void Inversion_RepairAtOne_DeconstructAtFour_TheServiceIsTakenFirst()
        {
            var sim = NewSim(out var strip);
            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            var pawn = sim.AddCitizen("Rell", PawnStart);
            Assert.That(strip.Designate(sim, StripWall, DeconstructKind.Wall), Is.True,
                "precondition: the interior wall really is a legal strip target");
            sim.JobsDirty = JobBoardDirty.All;

            Assert.That(Int3.Manhattan(pawn.Pos, StripWall),
                Is.LessThan(Int3.Manhattan(pawn.Pos, FarMachine)),
                "fixture: the LOW-band deconstruct must be the NEARER job, or the distance argmin " +
                "picks the service for free and this leg cannot fail");

            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Lowest);

            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(JobKind.Maintain),
                "Repair@1 must be taken before Deconstruct@4 even though the strip is nearer — the " +
                "player's band dominates distance absolutely (RimWorld §1.3: x100000)");

            // --- THE NON-VACUITY HALF: the same fixture with the bands swapped. Without it, a
            // dispatcher that simply never handed out deconstruct would pass the assertion above.
            var sim2 = NewSim(out var strip2);
            NeedyMachine(sim2, FarMachine, "scrubber");
            sim2.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            var pawn2 = sim2.AddCitizen("Rell", PawnStart);
            Assert.That(strip2.Designate(sim2, StripWall, DeconstructKind.Wall), Is.True);
            sim2.JobsDirty = JobBoardDirty.All;
            pawn2.SetWorkPriority(WorkType.Repair, WorkPriority.Lowest);
            pawn2.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Highest);

            Assert.That(FirstWorkKind(sim2, pawn2, 3000), Is.EqualTo(JobKind.Deconstruct),
                "control: this strip really was claimable — with the bands the other way round the " +
                "same pawn takes it, so the refusal above is the ranking and not an empty board");
        }

        /// <summary>
        /// ⭐⭐ <b>THE HEADLINE LEG — mutation 1 (ship the DEFER half only). THE ONE THIS PACKAGE
        /// EXISTS FOR, and the one a defer-only implementation cannot produce.</b>
        ///
        /// <para>The owner's own sentence: an order painted while a maintenance chain is already
        /// running. <c>Deconstruct@1 / Repair@4</c>, but the strip is designated at <b>t = 2000</b>,
        /// with the pawn already several sim-minutes into servicing the first of FOUR needy
        /// machines. <c>MaintenanceSystem.Tick</c> runs <c>DriveWorkers</c> and then
        /// <c>RecruitForNeediest</c> — it frees and re-claims the same pawn inside one tick — so the
        /// dispatcher never sees her idle and a defer query in <c>TryAssign</c> can never fire. The
        /// order reaches her only because the PUSH GATE refuses to re-claim her.</para>
        ///
        /// <para>⭐ <b>THE CONTROL IS THE WHOLE TEST, and it is not the tick count.</b> "She
        /// eventually deconstructed" is also true of the broken build — it just waits the entire
        /// chain out. So this leg asserts that <b>machines were still waiting for service when she
        /// walked away</b>: she was RELEASED, not left with nothing to do. Without that assertion a
        /// generous tick budget makes the leg pass on the defect.</para>
        /// </summary>
        [Test]
        public void MidChain_DeconstructAtOne_PaintedDuringAChain_IsServedWithoutWaitingItOut()
        {
            var sim = NewSim(out var strip);
            var machines = new List<Device>
            {
                NeedyMachine(sim, new Int3(10, 1, 0), "m1"),
                NeedyMachine(sim, new Int3(10, 2, 0), "m2"),
                NeedyMachine(sim, new Int3(10, 3, 0), "m3"),
                NeedyMachine(sim, new Int3(9, 1, 0), "m4"),
            };
            sim.AddItem(ItemKind.Parts, 16, new Int3(2, 1, 0));
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Lowest);
            pawn.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Highest);

            // A whole service is maintenance_work_seconds long; the chain is FOUR of them plus the
            // walking. Read off defs rather than written as a literal, so retuning the def retunes
            // the budget instead of silently making the leg trivial.
            int serviceTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;

            for (int t = 0; t < 2000; t++) sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain),
                "precondition: she must already be INSIDE the chain when the order is given — that " +
                "is the entire subject, and a pawn who is idle here would be tested by the t=0 leg");

            // THE ORDER, painted mid-chain.
            Assert.That(strip.Designate(sim, StripWall, DeconstructKind.Wall), Is.True);
            sim.JobsDirty = JobBoardDirty.All;

            long served = TickOfFirst(sim, pawn, JobKind.Deconstruct, 8 * serviceTicks);
            Assert.That(served, Is.GreaterThan(0),
                "the order must be served at all — a pawn who never deconstructs has been captured " +
                "by the maintenance chain for good");

            int stillNeedy = 0;
            foreach (var m in machines)
                if (m.Condition < sim.Defs.Machines[(int)m.Kind].MaintainBelow) stillNeedy++;
            Assert.That(stillNeedy, Is.GreaterThanOrEqualTo(2),
                "⛔ THE CONTROL: machines must STILL BE WAITING when she walks away. Otherwise " +
                "'she deconstructed' only means the chain ran out, which is exactly what the " +
                "defer-only build does — 54 652 ticks later, and green.");

            Assert.That(served, Is.LessThan(2000 + 2 * serviceTicks),
                "and she must leave at the end of the service she was ALREADY in, not at the end of " +
                "the chain: the push gate refuses the RE-claim, it does not interrupt running work " +
                "(pre-emption is M2-8's).");
        }

        // ================================================== the ranking legs

        /// <summary>
        /// ⭐ <b>MUTATION 3's LEG (collapse the band loop to a single pass) and MUTATION 7's
        /// (iterate the bands 4 → 1).</b> <c>Repair@1 / Haul@4</c> with the HAUL NEARER: a single
        /// pass over every source is a distance tournament and takes the haul, and a reversed band
        /// loop reaches band 4 first and takes it too.
        /// </summary>
        [Test]
        public void Ranking_RepairAtOne_HaulAtFour_TheNearerHaulLoses()
        {
            var sim = NewSim(out _);
            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            var pawn = sim.AddCitizen("Rell", PawnStart);
            Haulable(sim, new Int3(3, 3, 0), new Int3(1, 3, 0));

            Assert.That(Int3.Manhattan(pawn.Pos, new Int3(3, 3, 0)),
                Is.LessThan(Int3.Manhattan(pawn.Pos, FarMachine)),
                "fixture: the LOW-band haul must be strictly nearer, or the argmin refuses it for " +
                "free and neither mutation can bite");

            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);

            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(JobKind.Maintain),
                "Repair@1 beats Haul@4 even with the haul at her feet");

            // --- the non-vacuity half: the same fixture, bands swapped.
            var sim2 = NewSim(out _);
            NeedyMachine(sim2, FarMachine, "scrubber");
            sim2.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            var pawn2 = sim2.AddCitizen("Rell", PawnStart);
            Haulable(sim2, new Int3(3, 3, 0), new Int3(1, 3, 0));
            pawn2.SetWorkPriority(WorkType.Repair, WorkPriority.Lowest);
            pawn2.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);

            Assert.That(FirstWorkKind(sim2, pawn2, 3000), Is.EqualTo(JobKind.HaulPickup),
                "control: the haul really was claimable");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 4's LEG — THE EQUAL-BAND TIE-BREAK.</b> <c>Repair@2</c> and
        /// <c>Haul@2</c>, both claimable at once, with the haul NEARER. Same band, so the player's
        /// number decides nothing and distance must not either: OD-J's authored order
        /// (<c>Repair · Construct · Craft · Deconstruct · Mine · Haul</c>) decides it, and Repair is
        /// first because repair is the wreck's premise.
        ///
        /// <para>⛔ <b>THERE IS DELIBERATELY NO "byte-identical to main" CONTROL HERE.</b> Revision 2
        /// of the charter paired this row with one and OD-J struck it: the authored order does not
        /// reproduce shipped precedence, on purpose, so there is no baseline this package should
        /// match. The pins move and that is the result, not a regression.</para>
        ///
        /// <para>The mutation is a swap of the two ENDS of the list, not of two adjacent members: a
        /// <c>Craft</c>/<c>Repair</c> swap moves the outcome for fewer configurations, which reads
        /// as an equally green test while being a weaker one.</para>
        /// </summary>
        [Test]
        public void EqualBand_RepairAndHaulBothAtTwo_RepairWinsByTheAuthoredOrder()
        {
            var sim = EqualBandFixture(out var pawn);
            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(JobKind.Maintain),
                "at the SAME band and with the haul NEARER, Repair must still win — OD-J puts it " +
                "first in the work list and the work list is the tie-break");
        }

        /// <summary>
        /// ⭐⭐ <b>MUTATION 4b's LEG — THE ORDER IS NOT THE DISPLAY.</b>
        ///
        /// <para>RimWorld does not tie-break on column order: it ties on a per-work-type
        /// <c>naturalPriority</c> CONSTANT, and left-to-right is a correct PREDICTION of the outcome
        /// only because the tab happens to be rendered in that constant's order (reference §1.3).
        /// Encode declaration order, array index or column index and you have implemented the
        /// display — and the two orderings agree today, so nothing else in the suite can tell them
        /// apart.</para>
        ///
        /// <para>⇒ This leg DRIVES the same tie and asserts the winner is the one
        /// <see cref="WorkPriority.NaturalPriority"/> names, read at runtime. Re-author the constants
        /// (alphabetically, or in <c>DefaultSources()</c> order) and a correct arbitration follows
        /// them, so this leg stays green while the hard-coded leg above goes red; make the
        /// arbitration tie on the <see cref="WorkType"/> enum's declaration order instead and the
        /// opposite happens — <b>this leg goes red and the one above stays green</b>, because
        /// declaration order and the constant are authored to agree in the shipped table. That
        /// asymmetry is the whole point of having both.</para>
        ///
        /// <para>⚠️ It never reads a column, a grid, or a wire channel. A test that checks the
        /// columns render in OD-J's order passes while the dispatcher ties on something else
        /// entirely, which is precisely the "tidy the columns" regression this package must be
        /// unable to suffer silently.</para>
        /// </summary>
        [Test]
        public void EqualBand_TheTieFollowsTheNaturalPriorityConstant_NotAnyDisplayOrder()
        {
            int repair = WorkPriority.NaturalPriority(WorkType.Repair);
            int haul = WorkPriority.NaturalPriority(WorkType.Haul);
            Assert.That(repair, Is.Not.EqualTo(haul),
                "fixture: the two work types must be RANKED differently, or the tie has no answer " +
                "to follow and this leg asserts nothing");
            var expected = repair > haul ? JobKind.Maintain : JobKind.HaulPickup;

            var sim = EqualBandFixture(out var pawn);
            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(expected),
                $"the equal-band winner must be the one NaturalPriority ranks higher (Repair " +
                $"{repair}, Haul {haul}) — not the enum's declaration order, not DefaultSources() " +
                "registration order, not the grid's column layout");
        }

        /// <summary>Repair and Haul BOTH at band 2, both claimable, the haul strictly nearer — so
        /// neither the player's number nor the distance argmin can explain the outcome and only the
        /// tie-break can.</summary>
        private static Simulation EqualBandFixture(out Citizen pawn)
        {
            var sim = NewSim(out _);
            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            pawn = sim.AddCitizen("Rell", PawnStart);
            var stack = new Int3(3, 3, 0);
            Haulable(sim, stack, new Int3(1, 3, 0));

            Assert.That(Int3.Manhattan(pawn.Pos, stack),
                Is.LessThan(Int3.Manhattan(pawn.Pos, FarMachine)),
                "fixture: the haul must be strictly NEARER, or distance explains a Repair win");

            const byte SameBand = 2;
            pawn.SetWorkPriority(WorkType.Repair, SameBand);
            pawn.SetWorkPriority(WorkType.Haul, SameBand);
            Assert.That(pawn.GetWorkPriority(WorkType.Repair),
                Is.EqualTo(pawn.GetWorkPriority(WorkType.Haul)),
                "fixture: the two must really be at the SAME band");
            return sim;
        }

        // ================================================== the per-site legs (mutation 11)

        /// <summary>
        /// ⭐ <b>MUTATION 11's LEG FOR SITE 4 — <c>CraftingSystem</c>'s push gate, and the ONLY leg
        /// in this fixture that reddens when it alone is omitted.</b>
        ///
        /// <para><c>Repair@1</c> and <c>Craft@2</c>, with a live bench holding a satisfiable bill AND
        /// a machine that wants service. Neither work type has an <see cref="IJobSource"/>, so the
        /// band loop cannot rank them — the dispatcher simply leaves her idle. <c>CraftingSystem</c>
        /// then runs BEFORE <c>MaintenanceSystem</c> in the shipped order and would take her first
        /// on sheer registration position, which is exactly the "push before pull, then stack order"
        /// accident OD-J replaced with an authored rule.</para>
        ///
        /// <para>⚠️ Blinded of site 3: <c>MaintenanceSystem</c>'s own gate cannot decide this leg,
        /// because Repair is the work that WINS — a missing gate there costs nothing here.</para>
        /// </summary>
        [Test]
        public void CraftPushGate_ABenchDoesNotTakeAPawnWhoseRepairOrderOutranksIt()
        {
            var sim = CraftVsRepairFixture(out var pawn, craftBand: 2, repairBand: WorkPriority.Highest);
            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(JobKind.Maintain),
                "the bench must ASK before claiming: Repair@1 outranks Craft@2, and a recruiter " +
                "that simply takes the first idle pawn it finds re-imposes stack order as priority");

            // --- non-vacuity: the SAME fixture with the bands the other way round.
            var sim2 = CraftVsRepairFixture(out var pawn2, craftBand: WorkPriority.Highest, repairBand: 2);
            Assert.That(FirstWorkKind(sim2, pawn2, 3000), Is.EqualTo(JobKind.Craft),
                "control: the bench really was claimable — with Craft@1 the same pawn is recruited " +
                "to it, so the refusal above is the ranking and not a dead bench");
        }

        /// <summary>A live SalvageRecycler with its whole input batch on the floor AND a machine
        /// below its maintain threshold with Parts aboard: both push families want the same idle
        /// pawn, and only the authored ranking can say which gets her.</summary>
        private static Simulation CraftVsRepairFixture(out Citizen pawn, byte craftBand, byte repairBand)
        {
            var sim = NewSim(out _);
            var bench = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(10, 3, 0), "recycler");
            Assert.That(bench.Powered && bench.IsOperational(sim.Defs), Is.True,
                "fixture: the bench must be live");
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.SalvageRecycler, out var bill),
                Is.True, "fixture: and have a bill");
            sim.AddItem(bill.Input(0).Kind, bill.Input(0).Count, new Int3(3, 1, 0));

            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));

            pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Craft, craftBand);
            pawn.SetWorkPriority(WorkType.Repair, repairBand);
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>
        /// ⭐ <b>MUTATION 11's LEG FOR SITE 5 — <c>EffectValidator.ApplyAgreeTask</c>.</b> The LLM
        /// effect pipeline is bounded by the work grid and never overrides it (the M2-2 ruling), and
        /// M2-5 makes the grid an ORDER rather than a switch: a crew member with <c>Repair@1</c> and
        /// a machine waiting must not be talked into a <c>Mine@4</c> dig. If she could, the one path
        /// into the sim that is NOT a recruiter would quietly outrank everything the player set.
        ///
        /// <para>⚠️ <b>Blinded of every other site:</b> there is no <c>JobSystem</c> in this stack, so
        /// no dispatcher can race the effect to the same tile, and the assertion is on
        /// <see cref="EffectValidator.TryApply"/>'s own return value. Driven, not scanned.</para>
        /// </summary>
        [Test]
        public void LlmGrant_IsBoundedByTheRanking_NotOnlyByTheOnOffSwitch()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new MaintenanceSystem() });
            NeedyMachine(sim, FarMachine, "scrubber");
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            var target = new Int3(4, 3, 0);
            Debris(sim, target);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Lowest);
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var validator = new EffectValidator();

            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None),
                "precondition: she is off-job, so the idleness guard is not what refuses this");
            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.True,
                "precondition: Mine is ON — M2-2's veto is not what refuses this either");

            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.False,
                "a grant must not outrank the player's own ordering: Repair@1 work is waiting and " +
                "the dig is Mine@4");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "and no job may have been written");

            // --- NON-VACUITY: the same effect, the same tile, with the better work taken away.
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Off);
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.True,
                "control: this exact dig IS an acceptable agreement once nothing outranks it — so " +
                "the refusal above is the ranking and not a broken target");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Dig), "and the grant really lands");
        }

        // ================================================== the seam legs

        /// <summary>
        /// ⭐ <b>MUTATION 6's LEG — IDLE STARVATION.</b> An arbitration that answers "yes, somebody
        /// has something better" to every question stops the whole ship: every recruiter defers and
        /// nobody claims. The cheapest possible fixture — one pawn, one haul, one kind of work
        /// enabled, and the full set of providers registered so the arbitration is live and simply
        /// has nothing to offer.
        ///
        /// <para>⚠️ Blinded of the ranking legs: there is no machine and no bench on this map, so it
        /// cannot pass or fail for a reason about repair or crafting.</para>
        /// </summary>
        [Test]
        public void IdleStarvation_TheOnlyWorkOnTheShipIsStillTaken()
        {
            var sim = NewSim(out _);
            var pawn = sim.AddCitizen("Rell", PawnStart);
            Haulable(sim, new Int3(4, 3, 0), new Int3(1, 3, 0));
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);

            Assert.That(sim.Devices.Items.Count, Is.Zero,
                "fixture: no machine and no bench, so nothing can legitimately outrank the haul");

            Assert.That(FirstWorkKind(sim, pawn, 3000), Is.EqualTo(JobKind.HaulPickup),
                "an arbitration that always says 'somebody has better work' starves the ship: the " +
                "dispatcher defers, both recruiters decline, and no job is ever claimed");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 8's LEG — THE ARGMIN'S INTEGRITY INSIDE A BAND.</b>
        /// <c>JobSystem.TryAssign</c>'s <c>d &gt;= bestDist</c> guard is not paranoia about the
        /// shipped sources: the argmin is a running minimum threaded THROUGH the providers, so ONE
        /// source reporting a worse distance raises the bar for every source after it. Banding
        /// restricts which sources are asked and must change nothing about that.
        ///
        /// <para>The guard can only be tested with a source that BREAKS the contract, so this leg
        /// registers one: <see cref="OverReportingSource"/> answers with a candidate that is farther
        /// than the running minimum it was handed. Both it and the dig sit at band 1, so the
        /// mutation is squarely "inside a band". With the guard the near dig wins; without it the
        /// liar's later, worse answer overwrites the winner.</para>
        /// </summary>
        [Test]
        public void ArgminIntegrity_ASourceReportingAWorseDistanceIsDeclined_NotObeyed()
        {
            var liar = new OverReportingSource();
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(new IJobSource[] { new DigJobSource(), liar }),
            });
            var pawn = sim.AddCitizen("Rell", PawnStart);
            Debris(sim, new Int3(4, 2, 0));
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Craft, WorkPriority.Highest); // the liar's own work type

            Assert.That(liar.ReportedDistance, Is.GreaterThan(Int3.Manhattan(pawn.Pos, new Int3(4, 2, 0))),
                "fixture: the liar must report a STRICTLY WORSE distance than the dig, or the guard " +
                "has nothing to decline and this leg cannot fail");

            Assert.That(FirstWorkKind(sim, pawn, 600), Is.EqualTo(JobKind.Dig),
                "the dispatcher ENFORCES the running minimum rather than trusting it — a source " +
                "answering with a worse distance is declined, not obeyed");
            Assert.That(liar.Claims, Is.Zero, "and the liar's candidate was never committed");

            // NON-VACUITY: the same liar, telling the truth, DOES win when it is genuinely nearer.
            var honest = new OverReportingSource { ReportedDistance = 1 };
            var sim2 = new Simulation(AsciiWorld.Build(OpenMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(new IJobSource[] { new DigJobSource(), honest }),
            });
            var pawn2 = sim2.AddCitizen("Rell", PawnStart);
            Debris(sim2, new Int3(4, 2, 0));
            pawn2.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            pawn2.SetWorkPriority(WorkType.Craft, WorkPriority.Highest);

            Assert.That(FirstWorkKind(sim2, pawn2, 600), Is.EqualTo(JobKind.Craft),
                "control: this source IS reachable and IS offered — so the refusal above is the " +
                "guard and not a source the band loop forgot to ask");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 9's LEG — A PRIORITY MAY NEVER OVERRIDE PHYSICS.</b>
        /// <c>WorksiteSafety.CanStageWorkerAt</c> refuses to park a worker where the sim would then
        /// pull her off the job to flee, and no band can buy past it. <c>Repair@1</c> — the highest
        /// band of the highest-ranked work type there is — against a machine nobody can stand
        /// beside.
        ///
        /// <para>The machine is walled into the map's own hull corner, so all four of its
        /// neighbours fail the staging test for geometry rather than for air; that keeps the leg
        /// free of an atmosphere model it does not need. Its non-vacuity half moves the SAME
        /// machine, at the SAME band, to a tile with somewhere to stand.</para>
        /// </summary>
        [Test]
        public void PriorityNeverOverridesPhysics_ABandOneServiceWithNowhereToStandIsRefused()
        {
            // A sealed 1-tile pocket: the machine sits inside it and every neighbour is wall.
            string[] sealedMap =
            {
                "##########",
                "#........#",
                "#...###..#",
                "#...#.#..#",
                "#...###..#",
                "##########",
            };
            var sim = new Simulation(AsciiWorld.Build(sealedMap), 11, new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MaintenanceSystem(),
            });
            var pocket = new Int3(5, 3, 0);
            var machine = sim.AddDevice(DeviceKind.Scrubber, pocket, "sealed");
            machine.Condition = 0.30f;
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            for (int i = 0; i < 4; i++)
                Assert.That(sim.IsWalkable(Int3.Neighbor4(pocket, i)), Is.False,
                    "fixture: every approach tile must be un-standable, or the refusal below is " +
                    "not physics");

            var seen = new HashSet<JobKind>();
            for (int t = 0; t < 3000; t++) { sim.Tick(); seen.Add(pawn.JobKind); }
            Assert.That(seen, Does.Not.Contain(JobKind.Maintain),
                "Repair@1 must NOT be able to buy past 'there is nowhere to stand' — a priority " +
                "orders work that is possible; it does not make impossible work possible");

            // --- non-vacuity: the SAME machine at the SAME band, somewhere reachable.
            var sim2 = new Simulation(AsciiWorld.Build(sealedMap), 11, new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MaintenanceSystem(),
            });
            var open = sim2.AddDevice(DeviceKind.Scrubber, new Int3(8, 2, 0), "open");
            open.Condition = 0.30f;
            var pawn2 = sim2.AddCitizen("Rell", new Int3(2, 2, 0));
            sim2.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            pawn2.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            Assert.That(FirstWorkKind(sim2, pawn2, 3000), Is.EqualTo(JobKind.Maintain),
                "control: an identical machine with somewhere to stand IS serviced at the same " +
                "band, so the refusal above is the staging rule and not a dead recruiter");
        }

        // ================================================== the multi-pawn stall

        /// <summary>
        /// ⭐⭐ <b>MUTATION 10's LEG — THE SILENT MULTI-PAWN STALL, AND A ONE-PAWN FIXTURE CANNOT SEE
        /// IT AT ALL.</b>
        ///
        /// <para>The defer query is optimistic by construction: it cannot be made as strong as the
        /// actual claim without walking the path, which IS the expensive part. So its failure mode
        /// is an OVER-REPORT, and an over-report has no error, no log and no symptom except that
        /// crew stand around — <b>it looks exactly like "the pawn is busy"</b>. The M2-0 spike
        /// shipped one: <c>CraftingSystem</c>'s query could not see <c>AllInputsStaged</c> or the
        /// build-material gate, both computed later in its own <c>Tick</c>, so a bench with
        /// un-staged inputs reported itself claimable forever and a four-pawn fixture took
        /// <b>40 782</b> ticks to serve an order that should have been immediate.</para>
        ///
        /// <para>FOUR pawns, a live bench whose bill can NEVER be satisfied (no input anywhere
        /// aboard), <c>Craft@1</c> and <c>Haul@2</c>. Every pawn's best band is the crafting one, so
        /// an over-reporting query parks all four of them. The assertion is that the low-band haul
        /// IS served, and served promptly.</para>
        /// </summary>
        [Test]
        public void MultiPawnStall_ABenchThatCanNeverStartDoesNotPark_TheLowBandOrderIsServed()
        {
            var sim = NewSim(out _);
            var bench = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(10, 2, 0), "recycler");
            Assert.That(bench.Powered && bench.IsOperational(sim.Defs), Is.True,
                "fixture: the bench must be LIVE, or TickStation returns for a reason that has " +
                "nothing to do with the query under test");
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.SalvageRecycler, out var bill),
                Is.True, "fixture: and it must have a bill");
            for (int i = 0; i < bill.InputPortCount; i++)
                foreach (var item in sim.Items.Items)
                    Assert.That(item.Kind, Is.Not.EqualTo(bill.Input(i).Kind),
                        "fixture: NOTHING the bill wants may exist aboard — an un-staged, " +
                        "un-fetchable input is precisely the state the spike's query mis-read");

            var pawns = new List<Citizen>();
            for (int i = 0; i < 4; i++)
            {
                var c = sim.AddCitizen("Crew" + i.ToString(System.Globalization.CultureInfo.InvariantCulture),
                                       new Int3(2 + i, 2, 0));
                c.SetWorkPriority(WorkType.Craft, WorkPriority.Highest);
                c.SetWorkPriority(WorkType.Haul, 2);
                pawns.Add(c);
            }
            Assert.That(pawns, Has.Count.GreaterThanOrEqualTo(4),
                "⛔ the fixture must be MULTI-PAWN: with one pawn the band never has anybody left " +
                "to stall and this whole class of defect is invisible");

            Haulable(sim, new Int3(4, 3, 0), new Int3(1, 3, 0));

            bool served = false;
            for (int t = 0; t < 40000 && !served; t++)
            {
                sim.Tick();
                foreach (var c in pawns)
                    if (c.JobKind == JobKind.HaulPickup || c.JobKind == JobKind.HaulDeliver) { served = true; break; }
            }

            Assert.That(served, Is.True,
                "the Haul@2 order must be served: an over-reporting Craft query parks every pawn " +
                "at or below the Craft band on a bench that will never offer anything, and the " +
                "M1-H backoff cannot break the stall because a station that returns early never " +
                "ATTEMPTS a claim and therefore never stamps one");
            Assert.That(sim.TickCount, Is.LessThan(3000),
                "and served PROMPTLY — the spike's stall was 40 782 ticks and every intermediate " +
                "value of that is still a multi-sim-hour hole with no error in it");
        }

        // ================================================== the arbitration's own shape

        /// <summary>
        /// The band dominates absolutely, asserted on the key rather than through a sim: RimWorld
        /// constrains <c>naturalPriority</c> to 0..10000 against a <c>×100000</c> player term
        /// precisely so the constant can never overcome the number the player typed. A table whose
        /// values grew past the weight would silently make band 2 beat band 1 for one pair of work
        /// types and nothing else in the suite would say so.
        /// </summary>
        [Test]
        public void TheBandAlwaysOutranksTheTieBreak_ForEveryPairOfWorkTypes()
        {
            var offenders = new List<string>();
            for (int a = 0; a < WorkPriority.WorkTypeCount; a++)
                for (int b = 0; b < WorkPriority.WorkTypeCount; b++)
                    for (int band = WorkPriority.Highest; band < WorkPriority.Lowest; band++)
                    {
                        int better = WorkArbiter.Score(band, (WorkType)a);
                        int worse = WorkArbiter.Score(band + 1, (WorkType)b);
                        if (better >= worse)
                            offenders.Add($"{(WorkType)a}@{band} does not beat {(WorkType)b}@{band + 1}");
                    }
            Assert.That(offenders, Is.Empty,
                "a work type's natural priority must never overcome the player's band:\n" +
                string.Join("\n", offenders));
        }

        // ------------------------------------------------------------------ the contract-breaking stub

        /// <summary>
        /// A deliberately NON-CONFORMING <see cref="IJobSource"/> for the argmin-integrity leg: its
        /// <see cref="Select"/> ignores the running minimum it is handed and answers with
        /// <see cref="ReportedDistance"/> regardless. It exists because the guard it tests can only
        /// be violated by a source that breaks the contract, and every shipped source honours it —
        /// so mutating the dispatcher with only conforming sources registered is a mutation that
        /// cannot bite.
        ///
        /// <para>It handles <see cref="JobKind.Craft"/>, the one kind no <see cref="IJobSource"/>
        /// claims, so it can be registered beside a real source without colliding.</para>
        /// </summary>
        private sealed class OverReportingSource : IJobSource
        {
            private static readonly JobKind[] Kinds = { JobKind.Craft };

            /// <summary>What <see cref="Select"/> answers, whatever it was asked.</summary>
            public int ReportedDistance { get; set; } = 9;

            /// <summary>How many times the dispatcher actually COMMITTED this source's candidate.</summary>
            public int Claims { get; private set; }

            public string Name => "OverReporting";
            public JobKind[] HandledKinds => Kinds;
            public int CandidateCount => 1;

            public bool IsBackedOff(Int3 pos, long tick, out long untilTick) { untilTick = 0; return false; }
            public void BeginTick(Simulation sim) { }
            public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what) { }

            public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
            {
                dist = ReportedDistance; // ⛔ THE CONTRACT VIOLATION, on purpose: bestDist ignored.
                return 0;
            }

            public bool TryClaim(Simulation sim, Citizen citizen, int candidate, long gen, JobContext ctx)
            {
                Claims++;
                citizen.JobKind = JobKind.Craft;
                citizen.JobTarget = citizen.Pos;
                citizen.JobWorkTicks = 100000; // held forever — the leg only cares that it was taken
                return true;
            }

            public void Progress(Simulation sim, Citizen citizen, JobContext ctx) { }
            public void OnGroundItemReserved(Simulation sim, ItemStack item) { }
        }
    }
}
