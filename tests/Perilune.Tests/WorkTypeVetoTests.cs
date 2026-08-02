using System;
using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M2-2 — THE WORK-TYPE VETO. ELEVEN CLAIM SITES, FIVE GATES, THREE EXCLUSIONS.</b>
    ///
    /// <para>A work type the player switched off must be refused at EVERY place the sim can put a
    /// job on a pawn, and because OD-H makes <i>off</i> the boot default, this is the package that
    /// delivers OD-G's opening beat: the pawn boots idle and waiting, and the player's first act is
    /// an order.</para>
    ///
    /// <para><b>WHY THERE ARE FIVE GATE LEGS AND NOT ONE.</b> The dispatcher is not the only door.
    /// <c>CraftingSystem</c> and <c>MaintenanceSystem</c> PUSH-recruit outside it,
    /// <c>EffectValidator</c> grants a dig straight from an LLM effect, and
    /// <c>CapabilityComputer</c> decides whether that dig is OFFERED to the model at all. A single
    /// test covering only <c>TryAssign</c> passes with four of five vetoes missing — that is the
    /// half-done shipment this file exists to make impossible. ⚠️ <b>Each gate is its own
    /// <c>[Test]</c>, so deleting one veto reddens exactly one leg.</b> <c>Assert</c> throws, so
    /// legs bundled into one method report only the first failure and a dead leg is
    /// indistinguishable from a live one (CLAUDE.md, fifth trap shape).</para>
    ///
    /// <para><b>EVERY LEG IS DRIVEN, NEVER SCANNED</b> — "verb parity is not sufficient". A scan for
    /// the predicate's name at five call sites is satisfied by five calls that do nothing. Every
    /// leg below runs the real system stack and asserts an observable: a <see cref="JobKind"/> a
    /// pawn did or did not reach, a batch that did or did not complete, a capability bit, a
    /// delivered stack.</para>
    ///
    /// <para><b>AND EVERY VETO LEG CARRIES ITS NON-VACUITY HALF IN THE SAME FIXTURE.</b> "She never
    /// took the job" is satisfied by a package that grants no work at all, or by a fixture with no
    /// work in it. Each gate leg therefore flips the ONE bit under test back on and requires the
    /// job to be taken — the inclusion test, not a population count (CLAUDE.md trap 4, fourth
    /// shape).</para>
    ///
    /// <para>⛔ <b>THE NEGATIVE LEGS ARE NOT DECORATION.</b> <c>MidHaul_*</c> pins an integrator
    /// RULING (gate at CLAIM, never mid-job) — without it, "we decided not to gate
    /// <c>HaulJobSource.cs:365</c>" and "we missed it" are indistinguishable in a diff, and the next
    /// lane completing the set will gate it and drop a pawn's cargo on the floor as a side effect
    /// of a checkbox. <c>Needs_*</c> pins the three exclusions: under OD-H "all six work types off"
    /// is not a hostile fixture, it is the state of every pawn on every ship at boot, so a
    /// regression there starves the wreck's boot pawn in the first sim-hour of a new game.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row
    /// was edited into the shipped tree, the whole fixture (20 legs) was run, and the tree was
    /// restored from an in-memory copy — never <c>git checkout</c> (TRAPS 2). "RED" is what the run
    /// actually reported, not what was expected:</para>
    /// <list type="table">
    ///   <item><b>1</b> delete the veto from <c>TryAssign</c>'s candidate SUM ⇒ RED:
    ///     <c>G1_AFullyVetoedPawn_StillWanders</c> (1 of 20)</item>
    ///   <item><b>1b</b> delete it from <c>TryAssign</c>'s SELECTION loop ⇒ RED: both
    ///     <c>MixedGrid_*OnMineOff/MineOnHaulOff</c> legs (2 of 20)</item>
    ///   <item><b>2</b> delete it at <c>MaintenanceSystem</c> (G3) ⇒ RED:
    ///     <c>G3_Maintenance_*</c>, <c>MixedGrid_HaulOnRepairOff_*</c>,
    ///     <c>OdG_Wreck_EveryWorkTypeOff_*</c> (3 of 20)</item>
    ///   <item><b>3</b> delete it at <c>CraftingSystem</c> (G2) ⇒ RED: <c>G2_Crafting_*</c> (1)</item>
    ///   <item><b>4</b> delete it at <c>EffectValidator</c> (G4) ⇒ RED: <c>G4_LlmGrant_*</c> (1)</item>
    ///   <item><b>4b</b> delete it at <c>CapabilityComputer</c> (G5) ⇒ RED: <c>G5_LlmOffer_*</c> (1)</item>
    ///   <item><b>5</b> INVERT the predicate ⇒ RED: 18 of 20 — everything except the two structural
    ///     pins, which do not read it</item>
    ///   <item><b>7</b> gate on <c>IsRecruitableForWork</c> instead of per type ⇒ RED: all four
    ///     <c>MixedGrid_*</c> legs (4 of 20)</item>
    ///   <item><b>8</b> ADD a veto at <c>HaulJobSource</c>'s in-job pickup→deliver transition ⇒
    ///     REFUSED, RED: <c>MidHaul_SwitchedOffDuringPickup_*</c> (1 of 20)</item>
    /// </list>
    ///
    /// <para>⛔ <b>AND ROW 1b IS WHY THAT TABLE IS RUN AND NOT WRITTEN.</b> On the first pass it
    /// reddened <b>NOTHING</b>: with every work type off the candidate sum is already zero, so
    /// <c>TryAssign</c> returns before <c>Select</c> is reached and half of G1 was covered by no leg
    /// at all. The missing case — a MIXED grid across two of the dispatcher's OWN sources, with the
    /// vetoed job the NEARER one — was added because of that run, not planned. A guard whose named
    /// mutation cannot bite is this repo's most frequent defect, and it was in this file's first
    /// draft too.</para>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-2 — the work-type
    /// veto". Mechanism authority: <c>docs/design/rimworld-reference.md</c> §1.</para>
    /// </summary>
    [TestFixture]
    public class WorkTypeVetoTests
    {
        // ------------------------------------------------------------------ shared fixtures

        /// <summary>One open room, interior x 1..8, y 1..3. Everything is reachable from
        /// everything, which is what keeps a refusal in these legs attributable to the VETO rather
        /// than to pathing (M1-H's probe refuses unreachable work, and that is a different bug).</summary>
        private static readonly string[] OpenMap =
        {
            "##########",
            "#........#",
            "#........#",
            "#........#",
            "##########",
        };

        private static readonly Int3 StationPos = new Int3(7, 2, 0);
        private static readonly Int3 StagingPos = new Int3(8, 2, 0); // Neighbor4(+x) of the station

        // ⚠️ THERE IS DELIBERATELY NO all-work HELPER IN THIS FILE, and one was deleted from it.
        // An unused `EnableAllWork(Citizen)` sat here claiming in its own doc comment to be "the
        // control condition for every veto leg" — with ZERO callers. Every control half below sets
        // the ONE bit under test (`SetWorkPriority(type, Highest)`) and leaves the other five at
        // their shipped value, because a leg that starts from an all-on grid is measuring a state
        // no new game is ever in. The blanket helper for fixtures whose subject is something else
        // is `WorkGridTestSupport.GiveAllWork()`, and it is deliberately not used here.

        private static void Debris(Simulation sim, Int3 p)
        {
            sim.World.SetWall(p, TileDefs.Debris);
            sim.World.SetFlag(p, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;
        }

        /// <summary>Units of Regolith one SalvageRecycler batch wants, read off the SHIPPED bill
        /// (a literal here would have to be chased when the bill is retuned).</summary>
        private static int RecyclerBatch
        {
            get
            {
                Assert.That(ProductionDefs.TryGetBill(SimDefs.Default, DeviceKind.SalvageRecycler, out var bill),
                            Is.True, "precondition: the SalvageRecycler must still have a bill");
                return bill.Input(0).Count;
            }
        }

        /// <summary>Run <paramref name="ticks"/> ticks and report every distinct
        /// <see cref="JobKind"/> <paramref name="c"/> was seen holding at a tick boundary.</summary>
        private static HashSet<JobKind> KindsSeen(Simulation sim, Citizen c, int ticks)
        {
            var seen = new HashSet<JobKind> { c.JobKind };
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                seen.Add(c.JobKind);
            }
            return seen;
        }

        // ================================================================== the structural pins

        /// <summary>
        /// ⭐ <b>THE EXHAUSTIVENESS PIN.</b> <see cref="WorkTypeMap.TryOf"/>'s switch has no
        /// guessing <c>default:</c> — an unlisted <see cref="JobKind"/> comes back "not work", i.e.
        /// never vetoed. That is the safe direction and it is SILENT, so a lane adding a job kind
        /// would ship it ungated with every other test in this file green.
        ///
        /// <para>The expected table below is written out BY HAND and never derived from the map it
        /// checks — a table read out of the production switch cannot fail when the switch is
        /// wrong. Adding a <see cref="JobKind"/> reddens this test until someone decides, in the
        /// open, which work type owns it (or that it is not work).</para>
        /// </summary>
        [Test]
        public void EveryJobKind_IsClassified_AsWorkOrExplicitlyNotWork()
        {
            // BY HAND. The four nulls are the exclusions: no job, two needs, self-preservation.
            var expected = new Dictionary<JobKind, WorkType?>
            {
                { JobKind.None, null },
                { JobKind.Dig, WorkType.Mine },
                { JobKind.HaulPickup, WorkType.Haul },
                { JobKind.HaulDeliver, WorkType.Haul },
                { JobKind.Eat, null },
                { JobKind.Drink, null },
                { JobKind.Craft, WorkType.Craft },
                { JobKind.Maintain, WorkType.Repair },
                { JobKind.HaulToBuild, WorkType.Construct }, // A7: feeding a build site IS construction
                { JobKind.Build, WorkType.Construct },
                { JobKind.Flee, null },
                { JobKind.Deconstruct, WorkType.Deconstruct },
                // ⭐ M3-9 — SLEEP IS NOT WORK. rimworld-reference.md §3.5: rest is a job-SELECTION
                // filter evaluated between jobs, not a work type the player can rank or switch off.
                // The null here is load-bearing: it is what makes JobSystem.TryPreempt's survival
                // guard (`if (!WorkTypeMap.TryOf(...)) return false;`) refuse to take a sleeping crew
                // member off her rest for a band-1 job.
                { JobKind.Sleep, null },
            };

            var offenders = new List<string>();
            foreach (JobKind kind in Enum.GetValues(typeof(JobKind)))
            {
                if (!expected.TryGetValue(kind, out var want))
                {
                    offenders.Add($"{kind}: a NEW JobKind with no row in this test — decide whether it " +
                                  "is work (and whose) before it ships ungated");
                    continue;
                }
                bool isWork = WorkTypeMap.TryOf(kind, out var got);
                if (isWork != want.HasValue)
                    offenders.Add($"{kind}: WorkTypeMap says isWork={isWork}, this table says {want.HasValue}");
                else if (want.HasValue && got != want.Value)
                    offenders.Add($"{kind}: WorkTypeMap says {got}, this table says {want.Value}");
            }

            Assert.That(offenders, Is.Empty, string.Join("\n", offenders));
        }

        /// <summary>
        /// ⭐ <b>WHAT MAKES THE PER-SOURCE GATE EXACT.</b> G1 refuses whole
        /// <see cref="IJobSource"/>s, not individual kinds, because the dispatcher never sees a
        /// kind before the claim. That is exactly as precise as a per-kind gate only while every
        /// source spans ONE work type. This reads the mask the dispatcher actually cached
        /// (<see cref="JobSystem.WorkMaskOfSource"/>) rather than recomputing it with the
        /// production expression, which would agree with itself however wrong both were
        /// (CLAUDE.md trap 4).
        /// </summary>
        [Test]
        public void EverySource_SpansExactlyOneWorkType()
        {
            var jobs = new JobSystem();

            // NON-VACUITY FLOOR. Everything below is a loop over Sources, and a loop over nothing
            // reports no offenders — so a dispatcher registered with an empty source array would
            // pass this pin silently, which is the one state in which the per-source gate is
            // trivially "exact". Assert the population before assuming the loop ran.
            Assert.That(jobs.Sources, Is.Not.Empty,
                "the shipped dispatcher must register sources, or this pin is vacuous by construction");

            var offenders = new List<string>();
            for (int i = 0; i < jobs.Sources.Count; i++)
            {
                byte mask = jobs.WorkMaskOfSource(i);
                if (!WorkTypeMap.IsSingleWorkType(mask))
                    offenders.Add($"'{jobs.Sources[i].Name}' spans work-type mask 0x{mask:X2}");
            }

            Assert.That(offenders, Is.Empty,
                "A source spanning two work types (or none) is offered whenever EITHER is enabled and " +
                "could then claim the other, because JobSystem.TryAssign gates per SOURCE:\n" +
                string.Join("\n", offenders) +
                "\nSplit the source, or push the veto down into IJobSource.TryClaim.");
        }

        /// <summary>
        /// The default the whole package is built on, asserted through the predicate the five gates
        /// ask rather than through the storage M2-1 pinned. If <see cref="WorkPriority.Default"/>
        /// were ever anything but <see cref="WorkPriority.Off"/>, every veto leg here would still
        /// pass (they set their own grids) while the shipped game silently stopped booting idle.
        /// </summary>
        [Test]
        public void AFreshCitizen_CanTakeNoWorkTypeAtAll()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11, new ISimSystem[] { new JobSystem() });
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));

            var enabled = new List<WorkType>();
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                if (pawn.CanTakeWorkType((WorkType)t)) enabled.Add((WorkType)t);

            Assert.That(enabled, Is.Empty,
                "OD-H: work is opt-in, so a crew member who has never been given an order can take " +
                "no work type at all — got " + string.Join(", ", enabled));
            Assert.That(pawn.IsRecruitableForWork, Is.True,
                "and the veto must NOT be folded into recruitability: she is still a recruitable " +
                "person, she has simply been given no work to do (the two are different facts, and " +
                "M2-19 needs the second one intact)");
        }

        // ================================================== G1 — the dispatcher (mutation 1)

        /// <summary>
        /// ⭐ <b>MUTATION 1's LEG — G1, <c>JobSystem.TryAssign</c>.</b> One pawn, one designated
        /// debris tile two steps away, 600 ticks. With <c>Mine</c> off she must never hold a Dig;
        /// with <c>Mine</c> on — the SAME fixture, one byte different — she must take it inside a
        /// handful of ticks.
        ///
        /// <para>The control half is what stops this leg being satisfied by an inert dispatcher, a
        /// map with no debris on it, or a pawn nobody could ever have recruited.</para>
        /// </summary>
        [Test]
        public void G1_Dispatcher_MineOff_NeverTakesADig_AndMineOnDoes()
        {
            // --- the veto half ---
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            Debris(sim, new Int3(4, 2, 0));

            Assert.That(pawn.IsRecruitableForWork, Is.True, "control: she is idle and recruitable");
            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.False, "control: and Mine is off");

            var seen = KindsSeen(sim, pawn, 600);
            Assert.That(seen, Does.Not.Contain(JobKind.Dig),
                "a pawn with Mine switched off must never be assigned a Dig by the dispatcher");

            // --- the non-vacuity half: the same fixture, Mine ON ---
            var sim2 = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            var pawn2 = sim2.AddCitizen("Rell", new Int3(2, 2, 0));
            Debris(sim2, new Int3(4, 2, 0));
            pawn2.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);

            var seen2 = KindsSeen(sim2, pawn2, 600);
            Assert.That(seen2, Does.Contain(JobKind.Dig),
                "control: this dig really was assignable — with Mine ON the same pawn takes it, so " +
                "the refusal above is the veto and not an empty board");
        }

        /// <summary>
        /// The other half of G1, and it is a REGRESSION guard rather than a restatement: the veto
        /// must look to the dispatcher like "no work exists for her", not like "no source would
        /// have her". <see cref="JobSystem.TryAssign"/>'s <c>bestSource &lt; 0</c> branch calls
        /// <see cref="Citizen.ClearPath"/>, so a veto applied only inside the selection loop —
        /// leaving the vetoed source's candidates in the loop bound — would clear a fully-vetoed
        /// pawn's WANDER path on every tick and freeze her on the spot, killing exactly the idle
        /// behaviour OD-G says an unassigned pawn should show.
        /// </summary>
        [Test]
        public void G1_AFullyVetoedPawn_StillWanders()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            pawn.AutoWander = true;
            Debris(sim, new Int3(7, 2, 0)); // a full dig board she is not allowed to touch

            var start = pawn.Pos;
            bool moved = false;
            for (int t = 0; t < 2000 && !moved; t++)
            {
                sim.Tick();
                if (pawn.Pos != start) moved = true;
            }

            Assert.That(moved, Is.True,
                "an unassigned pawn must still wander: the veto has to read as 'there is no work for " +
                "her', because 'a source refused her' takes the dispatcher's ClearPath branch every " +
                "tick and pins her to one tile");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "and she is still on no job while doing it");
        }

        // ================================================== G3 — maintenance (mutation 2)

        /// <summary>
        /// ⭐ <b>MUTATION 2's LEG — G3, <c>MaintenanceSystem</c>'s recruit loop.</b> This is HALF OF
        /// OD-G: it is what stops maintenance taking the boot pawn at ~tick 201 and turning the
        /// game into a movie.
        ///
        /// <para>The machine is authored to WANT service (below its <c>maint</c> threshold, above
        /// the wreck threshold so the W2 rule is not what refuses it) with a reachable consumable
        /// aboard, and the pawn can walk to it. Every reason to refuse EXCEPT the veto is
        /// eliminated by a control assertion, so a Maintain count of zero means the recruiter
        /// refused and never "there was nothing to service".</para>
        /// </summary>
        [Test]
        public void G3_Maintenance_RepairOff_IsNeverRecruited_AndRepairOnIs()
        {
            // --- the veto half ---
            var sim = NewMaintenanceBench(out var machine, out var pawn);
            Assert.That(pawn.CanTakeWorkType(WorkType.Repair), Is.False, "control: Repair is off");

            var seen = KindsSeen(sim, pawn, 600);
            Assert.That(seen, Does.Not.Contain(JobKind.Maintain),
                "a pawn with Repair switched off must never be push-recruited for a Maintain service");

            // --- the non-vacuity half ---
            var sim2 = NewMaintenanceBench(out _, out var pawn2);
            pawn2.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            var seen2 = KindsSeen(sim2, pawn2, 600);
            Assert.That(seen2, Does.Contain(JobKind.Maintain),
                "control: this machine really did want service — with Repair ON the same pawn is " +
                "recruited, so the refusal above is the veto and not a quiet machine");
        }

        /// <summary>
        /// A machine below its maintain threshold, a consumable aboard, an idle pawn who can reach
        /// it. Deliberately NO <c>NeedsSystem</c> and no <c>PowerSystem</c>: the micro-map is
        /// unpressurised and these legs run for sim-minutes, and a device that browns out is a
        /// different reason for a pawn to sit still.
        /// </summary>
        private static Simulation NewMaintenanceBench(out Device machine, out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new MaintenanceSystem() });
            machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f; // below Scrubber's maint threshold (0.40), above wreck_threshold (0.25)
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0)); // M1-I: a service consumes Parts

            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: the machine really wants service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "control: and the WRECK rule is not what would refuse it");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.True,
                "control: and she can walk to it — an unreachable bench is M1-H's refusal, not this one");
            return sim;
        }

        // ================================================== G2 — crafting (mutation 3)

        /// <summary>
        /// ⭐ <b>MUTATION 3's LEG — G2, <c>CraftingSystem</c>'s recruit loop.</b>
        ///
        /// <para>⚠️ The charter RE-SPECIFIED this leg because its first criterion could not bite: it
        /// keyed on a tick-0 claim that M1-H's reachability probe had already removed, so the leg
        /// passed with the veto deleted. The fixture here is therefore a <b>reachable bench with a
        /// satisfiable bill</b> — a live SalvageRecycler with its full Regolith batch on the floor
        /// beside the pawn, in one open room — and the observable is the BATCH, not a claim count:
        /// with <c>Craft</c> on, scrap appears; with it off, no scrap and no Craft job ever.</para>
        /// </summary>
        [Test]
        public void G2_Crafting_CraftOff_IsNeverRecruited_AndCraftOnIs()
        {
            // --- the veto half ---
            var sim = NewCraftBench(out var pawn);
            Assert.That(pawn.CanTakeWorkType(WorkType.Craft), Is.False, "control: Craft is off");

            // 30 000 ticks (50 sim-minutes) because that is what a full SalvageRecycler batch
            // costs end to end — fetch, walk, work — and the control half below asserts the batch
            // COMPLETED. A shorter budget makes the control fail for want of time rather than for
            // want of a worker, which would be a false red.
            var seen = KindsSeen(sim, pawn, 30000);
            Assert.That(seen, Does.Not.Contain(JobKind.Craft),
                "a pawn with Craft switched off must never be push-recruited to a bench");
            Assert.That(ScrapUnits(sim), Is.Zero,
                "and no batch may complete: a refused recruit that still produces output would mean " +
                "the bench is working without a worker");

            // --- the non-vacuity half, and it is MANDATORY: the same bench with Craft ON ---
            var sim2 = NewCraftBench(out var pawn2);
            pawn2.SetWorkPriority(WorkType.Craft, WorkPriority.Highest);

            var seen2 = KindsSeen(sim2, pawn2, 30000);
            Assert.That(seen2, Does.Contain(JobKind.Craft),
                "control: this bill really was satisfiable — with Craft ON the same pawn is recruited");
            Assert.That(ScrapUnits(sim2), Is.GreaterThan(0),
                "and the batch completes, so the fixture is a working bench and not a dead one");
        }

        /// <summary>A live, REACHABLE, unwalled SalvageRecycler with its whole input batch on the
        /// floor two tiles from the pawn — the fixture the re-specified mutation 3 demands. No
        /// PowerSystem (so <c>Powered</c> stays true), no NeedsSystem, no MaintenanceSystem.</summary>
        private static Simulation NewCraftBench(out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new CraftingSystem() });
            var station = sim.AddDevice(DeviceKind.SalvageRecycler, StationPos, "recycler");
            Assert.That(station.Powered && station.IsOperational(sim.Defs), Is.True,
                "precondition: the bench must be live, or TickStation returns before anything under test");
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Regolith, RecyclerBatch, new Int3(2, 1, 0));

            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.True,
                "control: the bench IS reachable — M1-H's probe is not what refuses her");
            return sim;
        }

        private static int ScrapUnits(Simulation sim)
        {
            int scrap = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) scrap += it.Count;
            return scrap;
        }

        // ================================================== G4 — the LLM GRANT (mutation 4)

        /// <summary>
        /// ⭐ <b>MUTATION 4's LEG — G4, <c>EffectValidator.ApplyAgreeTask</c>.</b> The LLM effect
        /// pipeline is BOUNDED BY the work grid and never overrides it (integrator ruling): the
        /// whitelist exists so the model cannot exceed player-granted authority, and a work type
        /// the player switched off is the clearest statement of that authority there is.
        ///
        /// <para>⚠️ <b>BLINDED OF G5.</b> This drives <see cref="EffectValidator.TryApply"/>
        /// directly and never computes a capability manifest, so deleting the
        /// <c>CapabilityComputer</c> veto cannot redden it and deleting this one cannot be masked
        /// by the offer gate.</para>
        /// </summary>
        [Test]
        public void G4_LlmGrant_MineOff_AgreeTaskIsRefused_AndMineOnIsAccepted()
        {
            var sim = NewDigTargetSim(out var pawn, out var target);
            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var validator = new EffectValidator();

            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.False, "control: Mine is off");
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.False,
                "a crew member may not be granted work the player forbade, even by an LLM effect");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "and no job may have been written");

            // The control that makes the refusal meaningful: the SAME effect on the SAME tile with
            // Mine ON is accepted, so the target really was legal and the veto is what refused it.
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.True, "control: this exact target IS an acceptable dig agreement");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Dig), "and the grant really lands");
        }

        // ================================================== G5 — the LLM OFFER (mutation 4b)

        /// <summary>
        /// ⭐ <b>MUTATION 4b's LEG — G5, <c>CapabilityComputer</c>. THE OFFER GATE, and no revision
        /// of the charter before the third named it.</b>
        ///
        /// <para>⛔ Gating <c>EffectValidator</c> alone leaves the dig in the model's tool schema:
        /// the crew member is still OFFERED it, still AGREES IN DIALOGUE, and the sim then silently
        /// refuses. That is the exact defect the 2026-07-21 round fixed under "crew no longer
        /// promise physical work they cannot do", re-introduced by the package that gates the other
        /// half.</para>
        ///
        /// <para>⚠️ <b>BLINDED OF G4.</b> Nothing here touches <see cref="EffectValidator"/> — the
        /// manifest is computed directly and the assertion is on the capability BIT and the target
        /// list, so the two halves of the hand-mirrored pair are pinned independently. A test that
        /// passed with either present could not see a half-gated pair, which is the failure.</para>
        /// </summary>
        [Test]
        public void G5_LlmOffer_MineOff_TheDigIsNotEvenOffered_AndMineOnItIs()
        {
            var sim = NewDigTargetSim(out var pawn, out var target);
            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var computer = new CapabilityComputer();
            var manifest = new CapabilityManifest();

            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.False, "control: Mine is off");
            computer.Compute(sim, minds, facts, pawn.Id, manifest);
            Assert.That(manifest.LegalEffects.HasFlag(EffectKind.AgreeTask), Is.False,
                "AgreeTask must not be offered at all for work the player switched off — a crew " +
                "member who agrees in dialogue and then does nothing is the 2026-07-21 defect");
            Assert.That(manifest.AssignableDigTargets, Is.Empty,
                "and the enum domain handed to the model must be empty, not merely unflagged: a " +
                "populated target list is a menu the model can still read");

            // The control: the SAME world, the SAME tile, one byte different.
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            computer.Compute(sim, minds, facts, pawn.Id, manifest);
            Assert.That(manifest.LegalEffects.HasFlag(EffectKind.AgreeTask), Is.True,
                "control: this dig IS offerable — with Mine ON the capability appears, so the " +
                "absence above is the veto and not an empty world");
            Assert.That(manifest.AssignableDigTargets, Does.Contain(target));
        }

        /// <summary>A designated debris tile, one pawn, everything reachable: the shape both LLM
        /// gates ask about. No JobSystem — these two legs are about the effect pipeline, and a
        /// dispatcher racing them to the same tile would make the observable ambiguous.</summary>
        private static Simulation NewDigTargetSim(out Citizen pawn, out Int3 target)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem() });
            target = new Int3(5, 2, 0);
            Debris(sim, target);
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));

            Assert.That((sim.World.GetFlags(target) & TileFlags.Designated), Is.Not.EqualTo((TileFlags)0),
                "precondition: designated");
            Assert.That(sim.World.GetWall(target), Is.EqualTo(TileDefs.Debris), "precondition: debris");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "precondition: off-job");
            return sim;
        }

        // ============================================ mutation 7 — the mixed grid

        /// <summary>
        /// ⭐ <b>MUTATION 7's LEG — the one that bites the tempting shortcut.</b> Under OD-H a pawn
        /// with every type off is never recruitable, so a single <c>&amp;&amp; HasAnyWorkEnabled</c>
        /// on <see cref="Citizen.IsRecruitableForWork"/> looks like it closes G1–G3 in one line.
        /// It does not: the veto is a per-(citizen, work type) question, and folding it into a
        /// per-citizen property makes <c>Repair@1 / Haul@off</c> indistinguishable from all-off.
        ///
        /// <para>One pawn, both kinds of work in front of her at once — a machine that wants
        /// servicing AND a loose stack with a stockpile to put it in. She must do the first and
        /// never the second.</para>
        /// </summary>
        [Test]
        public void MixedGrid_RepairOnHaulOff_ServicesAndDoesNotHaul()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new MaintenanceSystem() });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));            // the service consumable
            sim.AddItem(ItemKind.Scrap, 1, new Int3(1, 3, 0));            // a haulable stack
            sim.World.SetFlag(new Int3(4, 3, 0), TileFlags.Stockpile, true); // ...with somewhere to go
            sim.JobsDirty = JobBoardDirty.All;

            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            Assert.That(pawn.CanTakeWorkType(WorkType.Haul), Is.False, "control: Haul stays off");

            var seen = KindsSeen(sim, pawn, 1200);

            Assert.That(seen, Does.Contain(JobKind.Maintain),
                "Repair@1 must still be done — a per-citizen fold would refuse her everything");
            Assert.That(seen, Does.Not.Contain(JobKind.HaulPickup),
                "and Haul@off must still be refused — the two must be DISTINGUISHABLE, which is " +
                "exactly what a fold into IsRecruitableForWork destroys");
        }

        /// <summary>
        /// The mixed grid's mirror, so the pair cannot both be satisfied by a veto that happens to
        /// like Repair: <c>Haul@1 / Repair@off</c> hauls and does not service, in the same fixture.
        /// Without this, a gate that only ever consulted <c>WorkType.Repair</c> would pass the leg
        /// above.
        /// </summary>
        [Test]
        public void MixedGrid_HaulOnRepairOff_HaulsAndDoesNotService()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new MaintenanceSystem() });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Parts, 4, new Int3(2, 1, 0));
            sim.AddItem(ItemKind.Scrap, 1, new Int3(1, 3, 0));
            sim.World.SetFlag(new Int3(4, 3, 0), TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;

            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            Assert.That(pawn.CanTakeWorkType(WorkType.Repair), Is.False, "control: Repair stays off");

            var seen = KindsSeen(sim, pawn, 1200);

            Assert.That(seen, Does.Contain(JobKind.HaulPickup), "Haul@1 must be done");
            Assert.That(seen, Does.Not.Contain(JobKind.Maintain), "and Repair@off refused");
        }

        // ============================ mutation 1b — the SELECTION half of G1, and why it exists

        /// <summary>
        /// ⭐ <b>THE LEG THE MUTATION TABLE DID NOT ASK FOR, ADDED BECAUSE ITS OWN MUTATION COULD
        /// NOT BITE WITHOUT IT.</b> G1 asks the veto TWICE inside <c>TryAssign</c> — once in the
        /// candidate SUM (so a fully-vetoed pawn looks like "no work exists" and keeps her wander
        /// path) and once in the SELECTION loop (so a source is never offered). Deleting the second
        /// reddened <b>nothing</b> in the first draft of this file: with every type off the sum is
        /// already zero and the method returns before <c>Select</c> is ever reached, so every leg
        /// here passed with half the gate gone. That is this repo's #1 defect shape — a guard whose
        /// named mutation cannot bite — and the missing case is a <b>MIXED grid on the DISPATCHER's
        /// own sources</b>, which no other leg had.
        ///
        /// <para>The fixture makes the vetoed job the NEARER one, so an ungated selection loop takes
        /// it: the dispatcher's argmin is global and strictly nearest-first. Its control half proves
        /// exactly that — with <c>Haul</c> on, the same pawn in the same room takes the haul.</para>
        /// </summary>
        [Test]
        public void MixedGrid_MineOnHaulOff_DigsThePerimeterAndStepsOverTheStack()
        {
            var sim = NewDigAndHaulRoom(out var pawn, vetoedIsNearer: true);
            pawn.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            Assert.That(pawn.CanTakeWorkType(WorkType.Haul), Is.False, "control: Haul stays off");

            var seen = KindsSeen(sim, pawn, 1200);
            Assert.That(seen, Does.Contain(JobKind.Dig),
                "Mine@1 must still be worked — the FARTHER of the two jobs, so this also proves the " +
                "dispatcher did not simply run out of things to offer");
            Assert.That(seen, Does.Not.Contain(JobKind.HaulPickup),
                "and the NEARER haul must be refused. The dispatcher's argmin is strictly " +
                "nearest-first, so an unguarded selection loop takes this stack every time.");
        }

        /// <summary>
        /// The mirror, so neither leg can be satisfied by a gate that happens to consult one work
        /// type: <c>Haul@1 / Mine@off</c> hauls and never touches the debris. ⚠️ <b>Its fixture
        /// FLIPS the distances</b>, and that is not symmetry for its own sake — the vetoed job has
        /// to be the NEARER one or the argmin refuses it for free and the leg cannot see a missing
        /// selection guard (measured: with the haul nearer this leg stayed green under mutation 1b).
        /// Together the two are also each other's control: each requires the job the other refuses.
        /// </summary>
        [Test]
        public void MixedGrid_HaulOnMineOff_HaulsTheStackAndLeavesTheDebris()
        {
            var sim = NewDigAndHaulRoom(out var pawn, vetoedIsNearer: false);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.False, "control: Mine stays off");

            var seen = KindsSeen(sim, pawn, 1200);
            Assert.That(seen, Does.Contain(JobKind.HaulPickup), "Haul@1 must be worked");
            Assert.That(seen, Does.Not.Contain(JobKind.Dig), "and Mine@off refused");
        }

        /// <summary>
        /// One pawn with BOTH dispatcher jobs in front of her — a loose stack with a stockpile to
        /// take it to, and a designated debris tile — where <paramref name="vetoedIsNearer"/> says
        /// which of the two sits closer.
        ///
        /// <para>⭐ <b>THE DISTANCE IS THE WHOLE FIXTURE.</b> The dispatcher's argmin is global and
        /// strictly nearest-first, so a job that is FARTHER is refused by arithmetic whether or not
        /// a veto exists — put the vetoed job second and the leg proves nothing. Asserted rather
        /// than assumed, because it is the one property that makes either leg able to fail.</para>
        /// </summary>
        private static Simulation NewDigAndHaulRoom(out Citizen pawn, bool vetoedIsNearer)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            // vetoedIsNearer == true  ⇒ Mine is ON, so HAUL is the vetoed one and it goes nearest.
            // vetoedIsNearer == false ⇒ Haul is ON, so the DIG is vetoed and it goes nearest.
            var stack = vetoedIsNearer ? new Int3(3, 2, 0) : new Int3(6, 2, 0);
            var debris = vetoedIsNearer ? new Int3(6, 2, 0) : new Int3(3, 2, 0);
            sim.AddItem(ItemKind.Scrap, 1, stack);
            sim.World.SetFlag(new Int3(1, 3, 0), TileFlags.Stockpile, true);
            Debris(sim, debris);

            int dHaul = Int3.Manhattan(pawn.Pos, stack), dDig = Int3.Manhattan(pawn.Pos, debris);
            Assert.That(vetoedIsNearer ? dHaul < dDig : dDig < dHaul, Is.True,
                $"fixture: the VETOED job must be strictly nearer (haul {dHaul}, dig {dDig}), or " +
                "'she did not take it' is the argmin's doing and not the veto's");
            return sim;
        }


        // ============================================ mutation 8 — the CLAIM-TIME ruling

        /// <summary>
        /// ⛔ ⭐ <b>MUTATION 8's LEG — A NEGATIVE LEG PINNING A RULING.</b>
        /// <c>HaulJobSource.cs</c>'s <c>HaulDeliver</c> write is an IN-JOB TRANSITION inside
        /// <c>Progress</c>, not a claim, and it is deliberately UNGATED.
        ///
        /// <para><b>The ruling (integrator): gate at CLAIM, never mid-job.</b> Under OD-H the
        /// player toggles constantly, so switching Haul off while a pawn is mid-carry is a gesture
        /// they will make on day one. A veto there would drop cargo on the floor as a side effect
        /// of a settings change — and dropping carried cargo is <c>Simulation.CancelJob</c>'s
        /// contract, a DELIBERATE verb, not a consequence of a checkbox. Pre-emption (M2-8) is how
        /// a player interrupts.</para>
        ///
        /// <para>⚠️ Without this leg, "we ruled not to gate here" and "we missed this site" are
        /// indistinguishable in a diff, and the next lane completing the set will gate it.</para>
        ///
        /// <para>⛔ <b>AND THE PHASE MATTERS, WHICH IS WHY THERE ARE TWO LEGS AND NOT ONE.</b> The
        /// ungated write lives in <c>HaulJobSource.ProgressPickup</c>, and that method reaches it
        /// exactly ONCE per haul — at the moment the pawn arrives at the stack. A leg that flips the
        /// switch when she is ALREADY in <c>HaulDeliver</c> has flipped it after the site under test
        /// has run, so a veto planted there could never redden it: the leg would be dead and would
        /// look exactly like a live one (CLAUDE.md, fifth trap shape). <b>THIS leg flips during
        /// <c>HaulPickup</c></b>, before the transition, and is the one mutation 8 must be refused
        /// by. Its sibling below covers the carrying phase.</para>
        /// </summary>
        [Test]
        public void MidHaul_SwitchedOffDuringPickup_TheHaulStillCompletes()
        {
            var sim = NewHaulRun(out var pawn, out var stack, out var dropOff);

            // Drive to the PICKUP phase and stop BEFORE the pickup -> deliver transition.
            for (int t = 0; t < 600 && pawn.JobKind != JobKind.HaulPickup; t++) sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.HaulPickup),
                "precondition: she has claimed the haul and is on her way to the stack");
            Assert.That(pawn.CarryingItemId, Is.EqualTo(0u),
                "precondition: and has NOT picked it up yet — this leg's whole point is that the " +
                "in-job transition in ProgressPickup has not run when the checkbox changes");

            // THE GESTURE: the player switches Haul off with the job already claimed.
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Off);
            Assert.That(pawn.CanTakeWorkType(WorkType.Haul), Is.False, "control: Haul really is off now");

            AssertHaulCompletes(sim, pawn, stack, dropOff);
        }

        /// <summary>
        /// The carrying half of the same ruling, and the charter's literal wording: a pawn
        /// <b>carrying a stack</b> when the checkbox changes still puts it down where it was going.
        /// A veto reached from <c>ProgressDeliver</c> — or a <c>CancelJob</c> fired off a settings
        /// change — drops the cargo where she stands, and this leg is what makes that visible.
        /// ⚠️ Blinded of its sibling: it flips the switch strictly AFTER the pickup transition, so
        /// the two cover disjoint sites and neither can mask the other.
        /// </summary>
        [Test]
        public void MidHaul_SwitchedOffWhileCarrying_TheDeliveryStillCompletes()
        {
            var sim = NewHaulRun(out var pawn, out var stack, out var dropOff);

            for (int t = 0; t < 600 && pawn.JobKind != JobKind.HaulDeliver; t++) sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.HaulDeliver),
                "precondition: she must actually be mid-haul, carrying");
            Assert.That(pawn.CarryingItemId, Is.EqualTo(stack.Id), "precondition: with the stack in hand");
            Assert.That(pawn.Pos, Is.Not.EqualTo(dropOff), "precondition: and not yet there");

            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Off);
            Assert.That(pawn.CanTakeWorkType(WorkType.Haul), Is.False, "control: Haul really is off now");

            AssertHaulCompletes(sim, pawn, stack, dropOff);
        }

        /// <summary>A pawn, one loose stack, one stockpile tile at the far end of the room, Haul
        /// switched ON — so by the time either leg touches the grid the haul is a CLAIMED, running
        /// job, which is the only state the ruling is about.</summary>
        private static Simulation NewHaulRun(out Citizen pawn, out ItemStack stack, out Int3 dropOff)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            stack = sim.AddItem(ItemKind.Scrap, 1, new Int3(4, 1, 0));
            dropOff = new Int3(8, 3, 0);
            sim.World.SetFlag(dropOff, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            return sim;
        }

        /// <summary>The ruling's observable, shared by both legs: the stack ends up ON THE
        /// STOCKPILE and nowhere else, and afterwards she takes no NEW haul.</summary>
        private static void AssertHaulCompletes(Simulation sim, Citizen pawn, ItemStack stack, Int3 dropOff)
        {
            for (int t = 0; t < 1200; t++)
            {
                sim.Tick();
                if (sim.Items.TryGet(stack.Id, out var s) && s.CarriedBy == 0 && s.Pos == dropOff) break;
            }

            Assert.That(sim.Items.TryGet(stack.Id, out var delivered), Is.True, "the stack still exists");
            Assert.That(delivered.CarriedBy, Is.EqualTo(0u), "and nobody is carrying it");
            Assert.That(delivered.Pos, Is.EqualTo(dropOff),
                "the stack must be ON THE STOCKPILE. A veto at the in-job transition leaves it on " +
                "the floor instead — dropping carried cargo is Simulation.CancelJob's contract, a " +
                "DELIBERATE verb, not a consequence of a checkbox. Pre-emption (M2-8) is how a " +
                "player interrupts a running job.");
            Assert.That(pawn.CarryingItemId, Is.EqualTo(0u), "she is empty-handed afterwards");

            // ...and the ruling's other half: a RUNNING job completes, a NEW one is refused.
            sim.AddItem(ItemKind.Scrap, 1, new Int3(2, 1, 0));
            sim.JobsDirty = JobBoardDirty.All;
            var seen = KindsSeen(sim, pawn, 600);
            Assert.That(seen, Does.Not.Contain(JobKind.HaulPickup),
                "a RUNNING job completes; a NEW one is refused — that is what 'gate at claim' means");
        }

        // ============================================ mutation 6 — THE OD-G LEG, on --ship wreck

        /// <summary>
        /// ⭐⭐ <b>MUTATION 6(i) — THE MILESTONE'S OPENING BEAT, DRIVEN ON <c>--ship wreck</c> FROM
        /// TICK 0.</b> The shipping game, the shipping stack, no fixture: the pawn the player meets
        /// must be idle and waiting, and stay that way until she is given an order.
        ///
        /// <para>⚠️ (i) ALONE IS SATISFIED BY A PACKAGE THAT GRANTS NOTHING AT ALL. Its non-vacuity
        /// half is the next test, and that one is not optional.</para>
        ///
        /// <para>What is asserted is that no crew member ever holds a WORK job kind — needs
        /// (<c>Eat</c>, <c>Drink</c>) and self-preservation (<c>Flee</c>) are excluded BY NAME and
        /// must remain reachable; asserting <c>JobKind == None</c> flat would make this leg go red
        /// the day the wreck's boot pawn gets hungry, which is the correct behaviour, not a
        /// regression. <c>WorkTypeMap</c> is the classifier, and its own exhaustiveness is pinned
        /// separately.</para>
        /// </summary>
        [Test]
        public void OdG_Wreck_EveryWorkTypeOff_NoCrewMemberEverTakesWork()
        {
            var sim = BootWreck();
            var offenders = new List<string>();

            foreach (var c in sim.Citizens.Items)
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                    if (c.CanTakeWorkType((WorkType)t))
                        offenders.Add($"precondition: {c.Name} boots with {(WorkType)t} enabled");
            Assert.That(offenders, Is.Empty, string.Join("\n", offenders));

            for (int t = 0; t < 5000; t++)
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items)
                {
                    if (!WorkTypeMap.TryOf(c.JobKind, out var work)) continue;
                    offenders.Add($"tick {sim.TickCount}: {c.Name} is on {c.JobKind} ({work} work) " +
                                  "with every work type switched off");
                }
                if (offenders.Count > 0) break; // one report is enough; the loop is 5 000 ticks long
            }

            Assert.That(offenders, Is.Empty,
                "OD-G: on --ship wreck the pawn boots idle and waiting. Any work taken here is the " +
                "game playing itself:\n" + string.Join("\n", offenders));
        }

        /// <summary>
        /// ⭐⭐ <b>MUTATION 6(ii) — THE NON-VACUITY HALF, AND IT IS NOT OPTIONAL.</b> Grant the
        /// wreck's awake crew member ONE work type and she must take THAT kind of work. Without
        /// this, a package that simply never grants any work at all passes (i) perfectly.
        ///
        /// <para><c>Repair</c> is the type chosen because it is the wreck's premise (OD-J ranks it
        /// first) and because <c>MaintenanceSystem</c> is the ship's live work path — this is
        /// literally step 2 of the charter's browser acceptance walk, driven.</para>
        /// </summary>
        [Test]
        public void OdG_Wreck_RepairSwitchedOn_ShePicksUpAServiceHerself()
        {
            var sim = BootWreck();

            Citizen awake = null;
            foreach (var c in sim.Citizens.Items) { awake = c; break; }
            Assert.That(awake, Is.Not.Null, "precondition: the wreck has an awake crew member");
            awake.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);

            var seen = new HashSet<JobKind>();
            for (int t = 0; t < 20000; t++)
            {
                sim.Tick();
                seen.Add(awake.JobKind);
                if (seen.Contains(JobKind.Maintain)) break;
            }

            Assert.That(seen, Does.Contain(JobKind.Maintain),
                "the opening beat: the player switches Repair on and the pawn goes and services the " +
                "neediest machine, on her own. If this is red the veto refuses work it was given.");

            var forbidden = new List<JobKind>();
            foreach (var k in seen)
                if (WorkTypeMap.TryOf(k, out var w) && w != WorkType.Repair) forbidden.Add(k);
            Assert.That(forbidden, Is.Empty,
                "and she takes THAT kind and no other — one switch grants one work type, not the " +
                "grid: " + string.Join(", ", forbidden));
        }

        private static Simulation BootWreck() =>
            ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(),
                                  SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

        // ============================================ N1–N3 — the three exclusions

        /// <summary>
        /// ⛔ <b>N1 — A STARVING PAWN WITH EVERY WORK TYPE OFF MUST STILL EAT.</b>
        ///
        /// <para>Under OD-H this is not a hostile fixture: it is the state of every pawn on every
        /// ship at boot, so a regression here starves the wreck's boot pawn in the first sim-hour
        /// of a new game. <c>SustenanceSystem</c> recruits on <see cref="Citizen.IsIdleForWork"/>,
        /// deliberately NOT <see cref="Citizen.IsRecruitableForWork"/>, and <c>Citizen.cs</c>
        /// states the rule: "an order the player gave must not be a way to starve someone." Eat and
        /// Drink are not work types and never will be.</para>
        ///
        /// <para>⚠️ The assertion is the OUTCOME (a job taken and the need actually falling), not
        /// the absence of a call. Blinded of N2 and N3 — this leg walks to floor food with
        /// <c>HoldPosition</c> false, which is a different door from either of theirs.</para>
        /// </summary>
        [Test]
        public void N1_EveryWorkTypeOff_AStarvingPawnStillWalksToFoodAndEats()
        {
            var sim = NewNeedsSim(out var pawn);
            pawn.Hunger = 0.95f;
            sim.AddItem(ItemKind.Potato, 4, new Int3(7, 2, 0)); // across the room — she must WALK
            float before = pawn.Hunger;

            var seen = KindsSeen(sim, pawn, 2000);

            Assert.That(seen, Does.Contain(JobKind.Eat),
                "eating is not work: a crew member with every work type off must still go and eat");
            Assert.That(pawn.Hunger, Is.LessThan(before),
                "and the need must actually be SERVED — a job kind she holds forever without the " +
                "meter moving is the same starvation wearing a different label");
        }

        /// <summary>
        /// ⛔ <b>N2 — THE SECOND DOOR, WHICH REVISION 0 OF THE CHARTER MISSED.</b>
        /// <c>SustenanceSystem</c> has a <i>second</i> entry:
        /// <c>else if (citizen.HoldPosition &amp;&amp; !citizen.Dead &amp;&amp; !citizen.HasPath)
        /// TryServeInPlace(...)</c>. A veto placed at the first door leaves this one completely
        /// ungated, so <see cref="N1_EveryWorkTypeOff_AStarvingPawnStillWalksToFoodAndEats"/> alone
        /// cannot see a regression here — and a future lane "completing the set" hits this line
        /// next.
        ///
        /// <para>⚠️ Blinded of N1: <c>HoldPosition</c> is true and the food is on her OWN tile, so
        /// the walking path is never taken and this leg can only pass through
        /// <c>TryServeInPlace</c>.</para>
        /// </summary>
        [Test]
        public void N2_EveryWorkTypeOff_AHeldStarvingPawnIsStillServedInPlace()
        {
            var sim = NewNeedsSim(out var pawn);
            pawn.HoldPosition = true;
            pawn.Hunger = 0.95f;
            sim.AddItem(ItemKind.Potato, 4, pawn.Pos); // her own tile — the in-place door
            float before = pawn.Hunger;
            var where = pawn.Pos;

            Assert.That(pawn.IsIdleForWork, Is.False,
                "control: HoldPosition closes the walking door, so only TryServeInPlace can serve her");

            for (int t = 0; t < 2000 && pawn.Hunger >= before; t++) sim.Tick();

            Assert.That(pawn.Hunger, Is.LessThan(before),
                "a HELD crew member with every work type off must still be fed where she stands");
            Assert.That(pawn.Pos, Is.EqualTo(where), "and she must not have moved to do it");
        }

        /// <summary>
        /// ⛔ <b>N3 — THE SAME SHAPE FOR THE SECOND NEED.</b> Thirst outranks hunger in
        /// <c>TryStartNeed</c> and takes a completely different route (a stocked
        /// <c>WaterTank</c> device, not a ground stack), so N1 says nothing about it.
        /// ⚠️ Blinded of N1: this pawn is not hungry at all and there is no food on the map.
        /// </summary>
        [Test]
        public void N3_EveryWorkTypeOff_AParchedPawnStillDrinks()
        {
            var sim = NewNeedsSim(out var pawn);
            pawn.Thirst = 0.95f;
            var tank = sim.AddDevice(DeviceKind.WaterTank, new Int3(7, 2, 0), "tank");
            tank.StoredLiters = 50f;
            float before = pawn.Thirst;

            Assert.That(pawn.Hunger, Is.LessThan(sim.Defs.Sustenance.NeedThreshold),
                "control: she is not hungry, so this leg cannot pass through the eat path");

            var seen = KindsSeen(sim, pawn, 2000);

            Assert.That(seen, Does.Contain(JobKind.Drink),
                "drinking is not work either: every work type off must not be a way to dehydrate");
            Assert.That(pawn.Thirst, Is.LessThan(before), "and the need must actually be served");
        }

        /// <summary>One pawn with the boot grid (everything off) in an open room, with
        /// <c>SustenanceSystem</c> and a full dig board she is not allowed to touch — so a needs
        /// leg that accidentally passed because the pawn had nothing else to do is impossible.
        /// No <c>NeedsSystem</c>: the legs set the meters themselves, and a ramp would make
        /// "the need fell" ambiguous.</summary>
        private static Simulation NewNeedsSim(out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new SustenanceSystem() });
            pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0));
            Debris(sim, new Int3(5, 3, 0));

            var enabled = new List<WorkType>();
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                if (pawn.CanTakeWorkType((WorkType)t)) enabled.Add((WorkType)t);
            Assert.That(enabled, Is.Empty,
                "precondition: EVERY work type is off — that is the boot state these legs are about");
            return sim;
        }
    }
}
