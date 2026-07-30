using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// M1-H — THE PUSH RECRUITERS' REFUSAL CONTRACT.
    ///
    /// <para><b>The defect.</b> <see cref="CraftingSystem"/> and <see cref="MaintenanceSystem"/>
    /// recruit crew OUTSIDE <see cref="JobSystem"/>, so neither was held to the contract every
    /// <see cref="IJobSource"/> has had since W0-4: a source that refuses a candidate stamps
    /// <see cref="JobWork.UnreachableRetryTicks"/> on it, and the dispatcher's own doc comment
    /// calls a source that refuses without stamping "a SILENT HANG" and throws naming it. The two
    /// push recruiters re-offered the same impossible job at 1 Hz, forever.</para>
    ///
    /// <para><b>Measured on <c>main</c> before this package</b>, <c>--ship wreck --days 1
    /// --no-repair</c> (the M2-0 spike's Repair-OFF condition, reproduced through the occupancy
    /// harness): <b>597 Craft job starts and 1 468 abandons</b>, 75.3 % of sim-hour 1 and 3.575 %
    /// of the whole day's crew-ticks, ALL of them at ONE site — the
    /// <c>best.Pos == worker.Pos</c> branch of <see cref="CraftingSystem.StepFetch"/> — ⚠️ the
    /// per-site split is ONE measurement from a throwaway instrumented build and was not
    /// independently re-derived; the TOTALS were, and nothing below rests on the split — where a
    /// crew member who has just walked the whole way to an input stack discovers it cannot carry
    /// it back to a bench it was never able to reach. After: <b>0 and 0</b>.</para>
    ///
    /// <para><b>What the legs below are for.</b> The driven thrash leg is the headline. The ten
    /// site-coverage legs exist because a single funnel is only trustworthy if every path INTO it
    /// is exercised — nine of ten could be dead and the suite green. Each leg asserts the
    /// site-specific observable AND the stamp's exact deadline, read at the seam
    /// (<see cref="PushRecruitBackoff.RetryAtFor"/>) rather than inferred from timing, because a
    /// timing assertion cannot tell a stamp from the site's own blocking condition still
    /// holding.</para>
    ///
    /// <para><b>Site 6 is STRUCTURALLY UNREACHABLE and is declared, not skipped</b> — see
    /// <see cref="Site6_EveryPortSatisfied_IsStructurallyUnreachable"/>.</para>
    /// </summary>
    [TestFixture]
    public class PushRecruitBackoffTests
    {
        // Two rooms with no door between them. Left room x=1..3, right room x=6..8, y=1..3.
        // Nothing connects them, so a crew member in one can never path into the other — the
        // shape the wreck presents (crew in the cryo bay, benches in a wing they cannot reach).
        private static readonly string[] SplitMap =
        {
            "##########",
            "#...##...#",
            "#...##...#",
            "#...##...#",
            "##########",
        };

        // One room, x=1..8, y=1..3 — for the legs that need worker and bench connected.
        private static readonly string[] OpenMap =
        {
            "##########",
            "#........#",
            "#........#",
            "#........#",
            "##########",
        };

        // As SplitMap, but with a long right-hand room — needed by the fall-through leg, where a
        // REACHABLE candidate must be able to stand FURTHER from the bench than an unreachable one.
        private static readonly string[] LongSplitMap =
        {
            "###############",
            "#...##........#",
            "#...##........#",
            "#...##........#",
            "###############",
        };

        private static readonly Int3 StationPos = new Int3(7, 2, 0);
        private static readonly Int3 StagingPos = new Int3(8, 2, 0); // Neighbor4(+x) of the station

        /// <summary>Units of Regolith one SalvageRecycler batch wants, read off the SHIPPED bill
        /// (E0-6 moved it 1 → 4; a literal here would have to be chased again).</summary>
        private static int Batch
        {
            get
            {
                Assert.That(ProductionDefs.TryGetBill(SimDefs.Default, DeviceKind.SalvageRecycler, out var bill),
                            Is.True, "precondition: the SalvageRecycler must still have a bill");
                return bill.Input(0).Count;
            }
        }

        /// <summary>
        /// A bench sim with NO PowerSystem (so <c>Device.Powered</c> stays true), no NeedsSystem
        /// (the micro-map is unpressurised and these legs run for sim-minutes) and no
        /// MaintenanceSystem — "Repair off", the condition under which the thrash is not masked.
        /// <paramref name="build"/> is the optional BuildSystem the site-5 leg needs.
        /// </summary>
        private static Simulation NewBench(string[] map, out CraftingSystem crafting, out Device station,
                                           BuildSystem build = null)
        {
            crafting = new CraftingSystem();
            var systems = new List<ISimSystem> { new CitizenSystem(), new JobSystem() };
            if (build != null) systems.Add(build);
            systems.Add(crafting);
            var sim = new Simulation(AsciiWorld.Build(map), 11, systems.ToArray());
            station = sim.AddDevice(DeviceKind.SalvageRecycler, StationPos, "recycler");
            Assert.That(station.Powered && station.IsOperational(sim.Defs), Is.True,
                "precondition: the bench must be live, or TickStation returns before anything under test");
            return sim;
        }

        /// <summary>Tick to the next tick on which the 1 Hz crafting pass will run, then return
        /// the tick that pass will see — the value <see cref="PushRecruitBackoff.Refuse"/> adds
        /// <see cref="JobWork.UnreachableRetryTicks"/> to.</summary>
        private static long AlignToPass(Simulation sim)
        {
            while (sim.TickCount % 10 != 0) sim.Tick();
            return sim.TickCount;
        }

        /// <summary>Bind a crew member to the station by hand, in the exact encoding
        /// <see cref="CraftingSystem"/>'s own recruit block writes (JobKind/JobTarget/JobWorkTicks/
        /// CarryingItemId). The sim reaches every one of these states on its own; setting them
        /// directly is how a leg gets to ONE abandon site without also depending on the recruit
        /// path, which several of the sites are unreachable through.</summary>
        private static void BindWorker(Citizen c, Device station, int workTicks = 0, uint carrying = 0)
        {
            c.JobKind = JobKind.Craft;
            c.JobTarget = station.Pos;
            c.JobWorkTicks = workTicks;
            c.CarryingItemId = carrying;
            c.ClearPath();
        }

        private static void AssertStamped(CraftingSystem crafting, Device station, long passTick, string site)
        {
            Assert.That(crafting.Backoff.RetryAtFor(station.Id),
                        Is.EqualTo(passTick + JobWork.UnreachableRetryTicks),
                        site + ": the abandon must stamp the STATION for exactly " +
                        "JobWork.UnreachableRetryTicks from the tick the pass ran");
        }

        // =================================================================== the headline leg

        /// <summary>
        /// ⭐ MUTATION 1's LEG. One pawn, Repair disabled, a bill it can never serve, 30 000 ticks.
        ///
        /// <para><b>It asserts the CLAIM COUNT, not idleness</b>, and that distinction is the whole
        /// point: on the thrash the pawn IS idle on most ticks (measured on the wreck, 96.4 % of a
        /// sim-day) because each cycle ends in an abandon, so an "is the pawn idle?" assertion
        /// passes on the broken sim as loudly as on the fixed one.</para>
        ///
        /// <para><b>Non-vacuity is by INCLUSION, not by population count</b> (CLAUDE.md trap 4).
        /// The six preconditions below establish that the station genuinely WANTS a worker on
        /// every pass — live bench, a staging tile, an idle recruitable crew member, an un-staged
        /// fetch candidate he CAN reach, and a bench he CANNOT — so a count of zero means "the
        /// recruiter refused", never "there was nothing to do".</para>
        ///
        /// <para><b>WHICH MUTATION THIS LEG ACTUALLY BITES, stated because the obvious answer is
        /// wrong.</b> Deleting the stamp from <c>CraftingSystem.Abandon</c> leaves this leg GREEN
        /// (measured — it reddens nine SITE legs instead). The refusal in this fixture happens at
        /// the recruit PROBE, before any claim is made, so no change to the abandon path can put
        /// the crew member back on a Craft job here. What reddens it is <b>removing the probe</b>:
        /// the crew member is then claimed, walked to the input and abandoned on arrival, and the
        /// <c>craftTicks</c> assertion below catches that even though the CLAIM count in this
        /// particular fixture stays low (once he is parked ON the stack every later refusal is
        /// intra-tick and invisible at a tick boundary — which is itself worth knowing: a claim
        /// counter alone under-reports this bug).</para>
        /// </summary>
        [Test]
        public void DrivenThrash_UnreachableBench_ClaimCountIsBounded()
        {
            var sim = NewBench(SplitMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();   // LEFT room
            var stock = sim.AddItem(ItemKind.Regolith, Batch, new Int3(1, 1, 0)); // LEFT room, with him

            // --- inclusion controls: the station really is asking for a worker, every pass ---
            Assert.That(pawn.IsRecruitableForWork, Is.True, "control: the pawn is idle and recruitable");
            Assert.That(sim.IsWalkable(StagingPos), Is.True, "control: the bench has a staging tile");
            Assert.That(stock.ReservedBy, Is.EqualTo(0u), "control: the input is free to fetch");
            Assert.That(Int3.IsAdjacent4(stock.Pos, StationPos), Is.False,
                "control: the input is UN-STAGED, so AnyFetchCandidate is true and the recruit gate opens");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, stock.Pos, new List<Int3>()), Is.True,
                "control: the pawn CAN reach the input — the old code walked him to it every cycle");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.False,
                "control: and CANNOT reach the bench — that is the impossibility under test");

            int claims = 0, craftTicks = 0;
            var prev = pawn.JobKind;
            for (int t = 0; t < 30000; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Craft)
                {
                    craftTicks++;
                    if (prev != JobKind.Craft) claims++;
                }
                prev = pawn.JobKind;
            }

            Assert.That(claims, Is.LessThan(10),
                $"an impossible bill must not re-claim the pawn every second: {claims} Craft claims " +
                "in 30 000 ticks");
            // The stronger of the two, and the one that matches the number the roadmap quotes:
            // the thrash's real cost is CREW-TICKS SPENT, not claims counted. Zero is the right
            // floor here and not an over-tight one — a bench nobody can reach must never put a
            // crew member on a Craft job for even one tick.
            Assert.That(craftTicks, Is.Zero,
                $"and it must not burn crew-ticks doing it: {craftTicks} ticks on a Craft job for a " +
                "bench that is walled off from the only crew member aboard");
            Assert.That(crafting.Backoff.RetryAtFor(station.Id), Is.GreaterThan(0L),
                "and the refusal must be RECORDED — a claim count of zero with no stamp anywhere " +
                "would mean the station simply stopped wanting a worker, which is a different bug");
        }

        /// <summary>
        /// The other half of mutation 1, and the reason the leg above cannot be satisfied by
        /// making the recruiter timid: a bench a crew member CAN reach must still be worked, at
        /// full rate. This is mutation 4's leg (apply the backoff to a satisfiable bill →
        /// throughput must be unchanged).
        /// </summary>
        [Test]
        public void SatisfiableBill_StillRunsToCompletion()
        {
            var sim = NewBench(OpenMap, out _, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(2, 1, 0));

            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.True,
                "control: this bench IS reachable — the fixture differs from the thrash leg only there");

            int scrap = 0;
            for (int t = 0; t < 30000; t++)
            {
                sim.Tick();
                scrap = 0;
                foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) scrap += it.Count;
                if (scrap > 0) break;
            }
            Assert.That(scrap, Is.GreaterThan(0),
                "a reachable bench with its input aboard must still complete a batch — the backoff " +
                "must never be able to starve work that is actually possible");
            Assert.That(station.Progress, Is.EqualTo(0f), "and the batch really finished (Progress reset)");
        }

        /// <summary>
        /// Mutation 3's leg: the stamp must EXPIRE. A station refused once, then made viable, must
        /// pick a worker up again — and no later than one pass after the window closes.
        /// </summary>
        [Test]
        public void Backoff_Expires_AndTheStationRecruitsAgain()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();

            // Refuse it once, by hand, through the real API — no input aboard yet, so the bill
            // cannot recruit; stamp it and then make the bill satisfiable on the same tick.
            long pass = AlignToPass(sim);
            crafting.Backoff.Refuse(sim, station.Id);
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(2, 1, 0));
            Assert.That(crafting.Backoff.RetryAtFor(station.Id), Is.EqualTo(pass + JobWork.UnreachableRetryTicks));

            for (int t = 0; t < JobWork.UnreachableRetryTicks; t++)
            {
                sim.Tick();
                Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.Craft),
                    $"inside the window (tick {sim.TickCount}) the station must not recruit");
            }
            // One pass beyond the deadline is enough — the recruiter runs at 1 Hz.
            for (int t = 0; t < 10 && pawn.JobKind != JobKind.Craft; t++) sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Craft),
                "a stamp that never expires is a stuck station, not a backoff");
        }

        /// <summary>
        /// The recruit-time probe: an idle crew member who cannot REACH the bench is never claimed
        /// at all — the pull sources' contract (DigJobSource.TryClaim proves the path before it
        /// writes JobKind). Distinct from the thrash leg above, which measures the consequence
        /// over 30 000 ticks; this measures the single tick.
        /// </summary>
        [Test]
        public void RecruitProbe_NeverClaimsACrewMemberWhoCannotReachTheBench()
        {
            var sim = NewBench(SplitMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(1, 1, 0));

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None),
                "the claim must never have been made — not made and then withdrawn");
            Assert.That(pawn.HasPath, Is.False,
                "and the probe must not leave a path on a crew member it declined (it uses its own scratch list)");
            AssertStamped(crafting, station, pass, "recruit probe");
        }

        /// <summary>
        /// The probe must NOT be a "nearest crew member decides for everyone" rule: a second,
        /// further-away crew member who CAN reach the bench is taken instead — exactly as
        /// JobSystem retries the next-nearest candidate when a source refuses.
        /// </summary>
        [Test]
        public void RecruitProbe_FallsThroughToTheNextNearestReachableCrewMember()
        {
            // Its own map and its own bench tile: the SplitMap's right room is too short for a
            // REACHABLE crew member to stand further from the bench than an UNREACHABLE one, and
            // without that the leg would prove nothing about fall-through.
            var crafting = new CraftingSystem();
            var sim = new Simulation(AsciiWorld.Build(LongSplitMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), crafting });
            var station = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(6, 2, 0), "recycler");
            var staging = new Int3(7, 2, 0); // Neighbor4(+x)
            var near = sim.AddCitizen("Near", new Int3(3, 2, 0)).GiveAllWork();   // LEFT room,  Manhattan 4
            var far = sim.AddCitizen("Far", new Int3(13, 1, 0)).GiveAllWork();    // RIGHT room, Manhattan 7
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(10, 3, 0)); // RIGHT room, un-staged
            Assert.That(station.Powered && station.IsOperational(sim.Defs), Is.True);
            Assert.That(sim.IsWalkable(staging), Is.True, "control: that IS the staging tile");

            // The control that makes this leg non-vacuous: `near` must really be the one the OLD
            // Manhattan-only scan would have picked, or the test proves nothing about fall-through.
            Assert.That(Int3.Manhattan(near.Pos, staging), Is.LessThan(Int3.Manhattan(far.Pos, staging)),
                "control: the UNREACHABLE candidate is the nearest by Manhattan distance, so the " +
                "pre-M1-H scan would have picked it and then abandoned it");
            Assert.That(sim.Paths.FindPath(sim, near.Pos, staging, new List<Int3>()), Is.False,
                "control: ...and he really cannot get there");

            for (int t = 0; t < 30; t++) sim.Tick();
            Assert.That(near.JobKind, Is.EqualTo(JobKind.None), "the walled-off crew member is never claimed");
            Assert.That(far.JobKind, Is.EqualTo(JobKind.Craft), "the reachable one is");
        }

        // =============================================== the ten site-coverage legs (mutation 2)

        [Test]
        public void Site0_BenchWalledInMidJob_Stamps()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(6, 2, 0)).GiveAllWork();
            BindWorker(pawn, station);

            // Wall in every 4-neighbour of the bench: TryFindStagingTile now fails.
            for (int i = 0; i < 4; i++) sim.World.SetWall(Int3.Neighbor4(StationPos, i), TileDefs.Wall);
            sim.Rooms.MarkDirty();
            Assert.That(sim.IsWalkable(StagingPos), Is.False, "control: the bench really has nowhere to stand");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "site 0: the walled-in bench frees its worker");
            AssertStamped(crafting, station, pass, "site 0 (bench walled in mid-job)");
        }

        [Test]
        public void Site1_WorkPhaseDisplaced_Stamps()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork(); // NOT adjacent to the bench
            BindWorker(pawn, station, workTicks: 100);            // ...but in the work phase

            Assert.That(Int3.IsAdjacent4(pawn.Pos, StationPos), Is.False,
                "control: the work-phase worker is not at the bench — the 'external interference' branch");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "site 1: a displaced worker drops the job");
            Assert.That(station.Progress, Is.EqualTo(0f), "and the batch's progress is untouched by the abandon");
            AssertStamped(crafting, station, pass, "site 1 (work phase, displaced)");
        }

        [Test]
        public void Site2_CarriedStackVanished_Stamps()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(6, 2, 0)).GiveAllWork();
            var doomed = sim.AddItem(ItemKind.Regolith, 1, pawn.Pos);
            doomed.CarriedBy = pawn.Id;
            BindWorker(pawn, station, carrying: doomed.Id);
            sim.Items.Remove(doomed.Id); // the stack is gone under him

            Assert.That(sim.Items.TryGet(doomed.Id, out _), Is.False, "control: the carried stack really is gone");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.CarryingItemId, Is.EqualTo(0u), "site 2: the phantom carry is cleared");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None));
            AssertStamped(crafting, station, pass, "site 2 (carried stack vanished)");
        }

        [Test]
        public void Site3_DroppedAwayFromTheBench_Stamps()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork(); // far from the bench, settled
            var carried = sim.AddItem(ItemKind.Regolith, 1, pawn.Pos);
            carried.CarriedBy = pawn.Id;
            BindWorker(pawn, station, carrying: carried.Id);

            Assert.That(Int3.IsAdjacent4(pawn.Pos, StationPos), Is.False,
                "control: he is nowhere near the bench, so the drop lands off-station");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(carried.CarriedBy, Is.EqualTo(0u), "site 3: the input is set down where he stands");
            Assert.That(carried.Pos, Is.EqualTo(new Int3(2, 2, 0)));
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None));
            AssertStamped(crafting, station, pass, "site 3 (route lost after the drop)");
        }

        [Test]
        public void Site4_CanStartButStagingUnreachable_Stamps()
        {
            var sim = NewBench(SplitMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();  // LEFT room
            var staged = sim.AddItem(ItemKind.Regolith, Batch, StagingPos); // the whole set, AT the bench
            staged.ReservedBy = station.Id;
            BindWorker(pawn, station);

            Assert.That(Int3.IsAdjacent4(staged.Pos, StationPos), Is.True,
                "control: the input set is staged, so canStart is TRUE and the walk-to-bench branch is taken");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.False,
                "control: and the bench is unreachable from where he stands");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "site 4: cannot walk to a bench he cannot reach");
            AssertStamped(crafting, station, pass, "site 4 (canStart, staging unreachable)");
        }

        [Test]
        public void Site5_BuildersHaveFirstCallOnTheMaterial_Stamps()
        {
            var build = new BuildSystem();
            var sim = NewBench(OpenMap, out var crafting, out var station, build);
            var pawn = sim.AddCitizen("Rell", new Int3(6, 2, 0)).GiveAllWork();
            // Free material a builder could actually put in a site, and a site that wants it.
            sim.AddItem(ItemKind.Regolith, sim.Defs.Build.WallMaterial * 2, new Int3(2, 1, 0));
            Assert.That(build.Designate(sim, new Int3(4, 1, 0), BuildKind.Wall), Is.True,
                "control: a standing build demand exists");
            Assert.That(BuildSystem.Material, Is.EqualTo(ItemKind.Regolith),
                "control: the build material IS the recycler's input — otherwise this branch cannot fire");
            BindWorker(pawn, station);

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None),
                "site 5: the bill yields the material to the builder and frees the crew member");
            AssertStamped(crafting, station, pass, "site 5 (builders outrank the bill)");
        }

        /// <summary>
        /// SITE 6 IS STRUCTURALLY UNREACHABLE — declared here rather than silently skipped, and
        /// with the reason, because the charter requires ten legs and this one cannot exist.
        ///
        /// <para><b>The argument.</b> <c>StepFetch</c> is called from exactly one place, the tail
        /// of <c>DriveWorker</c>, and only on the <c>!canStart</c> branch. <c>canStart</c> is
        /// <c>Progress &gt; 0 || AllInputsStaged(...)</c>, so reaching <c>StepFetch</c> implies
        /// <c>!AllInputsStaged</c>: at least one port has <c>StagedUnits &lt; port.Count</c>.
        /// <c>TryFirstShortPort</c> tests that IDENTICAL predicate over the same ports, and
        /// nothing between the two reads mutates an item, a position or a port — the only call in
        /// between is <c>FetchBlockedForBuilds</c>, which reads a bool and the port kinds. So
        /// <c>TryFirstShortPort</c> cannot return false there. With <c>InputPortCount == 0</c>,
        /// <c>AllInputsStaged</c> is vacuously true, <c>canStart</c> is true and
        /// <c>StepFetch</c> is never called at all.</para>
        ///
        /// <para><b>What keeps it that way</b> is the parser's refusal of a repeated input kind
        /// (W0-5 review, B1) — with duplicate ports the aggregate <c>StagedUnits</c> comparison
        /// and the per-port one could disagree. This test pins that refusal so the argument above
        /// cannot rot silently: if a future bill is ever allowed two ports of one kind, this goes
        /// red and site 6 must be re-examined.</para>
        /// </summary>
        [Test]
        public void Site6_EveryPortSatisfied_IsStructurallyUnreachable()
        {
            // The precondition, re-asserted here rather than assumed from
            // DefsProductionTests.DuplicateKindWithinOneSide_IsRejected_BecauseItWouldCreateMatter
            // — that test guards MATTER CONSERVATION and could legitimately be re-scoped without
            // anyone noticing that site 6's unreachability argument rode on it.
            var problems = new List<string>();
            var defs = DefsParser.Parse(
                new[] { ("dupe.def", "[production]\ndup Fabricator 5 Scrap:1+Scrap:1 Parts:1\n") }, problems);
            Assert.That(problems, Has.Some.Contains("names Scrap twice in inputs"),
                "site 6's unreachability rests on no bill having two ports of one kind — with " +
                "duplicates, AllInputsStaged (aggregate) and TryFirstShortPort (per port) could " +
                "disagree and the branch would become live. The parser must keep refusing that row.");
            var clean = DefsParser.Parse(new[] { ("empty.def", "[production]\n") }, new List<string>());
            Assert.That(defs.Production.Nodes.Length, Is.EqualTo(clean.Production.Nodes.Length),
                "and the row must not land — the node table must be exactly what an EMPTY " +
                "[production] section yields (measured, not typed: shipped content declares nodes " +
                "of its own and a literal here would rot the moment one is added)");
        }

        [Test]
        public void Site7_NothingLeftToFetch_Stamps()
        {
            var sim = NewBench(OpenMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(6, 2, 0)).GiveAllWork();
            BindWorker(pawn, station);

            int regolith = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Regolith) regolith += it.Count;
            Assert.That(regolith, Is.Zero, "control: there is nothing aboard to fetch");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "site 7: nothing to fetch frees the crew member");
            AssertStamped(crafting, station, pass, "site 7 (nothing to fetch)");
        }

        [Test]
        public void Site8_StandingOnTheStackWithNoWayBack_Stamps()
        {
            // ⭐ THE SITE THAT ACCOUNTS FOR ALL 1 468 MEASURED ABANDONS ON --ship wreck.
            var sim = NewBench(SplitMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(1, 1, 0)).GiveAllWork(); // LEFT room
            var stock = sim.AddItem(ItemKind.Regolith, Batch, pawn.Pos); // standing ON it
            BindWorker(pawn, station);

            Assert.That(stock.Pos, Is.EqualTo(pawn.Pos), "control: he is standing on the input");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.False,
                "control: and there is no way back to the bench");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.CarryingItemId, Is.EqualTo(0u),
                "site 8: he must NOT pick it up — the return leg is checked before the pickup, so a " +
                "failure leaves the stack untouched on the ground");
            Assert.That(stock.CarriedBy, Is.EqualTo(0u));
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None));
            AssertStamped(crafting, station, pass, "site 8 (standing on the stack, no way back)");
        }

        [Test]
        public void Site9_InputUnreachable_Stamps()
        {
            var sim = NewBench(SplitMap, out var crafting, out var station);
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();          // LEFT room
            var stock = sim.AddItem(ItemKind.Regolith, Batch, new Int3(6, 3, 0)); // RIGHT room
            BindWorker(pawn, station);

            Assert.That(Int3.IsAdjacent4(stock.Pos, StationPos), Is.False,
                "control: the stack is un-staged, so it is a fetch candidate");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, stock.Pos, new List<Int3>()), Is.False,
                "control: and he cannot get to it");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "site 9: an unreachable input frees the crew member");
            Assert.That(pawn.HasPath, Is.False, "and leaves no path behind");
            AssertStamped(crafting, station, pass, "site 9 (input unreachable)");
        }

        // ============================================================ the maintenance recruiter

        /// <summary>
        /// The SECOND push recruiter, given the same contract. Same shape: a needy machine on the
        /// far side of a wall from the only crew member is refused once and then left alone for
        /// the window, instead of re-offered every second.
        /// </summary>
        [Test]
        public void Maintenance_UnreachableMachine_IsRefusedOnceAndBackedOff()
        {
            var maint = new MaintenanceSystem();
            var sim = new Simulation(AsciiWorld.Build(SplitMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), maint });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f; // above wreck_threshold (0.25), below Scrubber's maint threshold (0.40)
            var pawn = sim.AddCitizen("Rell", new Int3(3, 3, 0)).GiveAllWork(); // LEFT room
            // A REACHABLE consumable, and it is load-bearing rather than decoration: without the
            // recruit probe the servicer is claimed and sent WALKING to this stack (the fetch leg
            // paths to the CONSUMABLE, never to the machine), which is the maintenance twin of the
            // crafting walk-thrash and the only thing that makes the probe's absence observable at
            // a tick boundary. With no consumable aboard the abandon is intra-tick and a claim
            // counter sees nothing — measured: this leg passed with the probe deleted until the
            // stack was added.
            sim.AddItem(ItemKind.Parts, 4, new Int3(1, 1, 0));

            Assert.That(machine.Condition, Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: the machine really wants service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "control: and it is not refused by the WRECK rule, which would be a different reason");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.False,
                "control: nobody can get to it");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "the crew member is never claimed");
            Assert.That(maint.Backoff.RetryAtFor(machine.Id),
                        Is.EqualTo(pass + JobWork.UnreachableRetryTicks),
                        "and the machine carries the stamp");

            int claims = 0, maintainTicks = 0;
            var prev = pawn.JobKind;
            for (int t = 0; t < 30000; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Maintain)
                {
                    maintainTicks++;
                    if (prev != JobKind.Maintain) claims++;
                }
                prev = pawn.JobKind;
            }
            Assert.That(claims, Is.Zero, "and it is never re-offered while it stays unreachable");
            Assert.That(maintainTicks, Is.Zero,
                $"nor may it burn crew-ticks: {maintainTicks} ticks on a Maintain job for a machine " +
                "walled off from the only crew member aboard");
        }

        /// <summary>
        /// The maintenance FUNNEL's stamp, pinned separately from the recruit probe's. Found by
        /// mutation: deleting <c>MaintenanceSystem.Abandon</c>'s stamp left every other leg green,
        /// because in the unreachable fixture the stamp that gets asserted is the PROBE's. A
        /// REACHABLE machine whose servicer is displaced mid-service is the case that reaches the
        /// funnel and only the funnel.
        /// </summary>
        [Test]
        public void Maintenance_WorkPhaseDisplaced_StampsThroughTheFunnel()
        {
            var maint = new MaintenanceSystem();
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), maint });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork(); // NOT adjacent to the machine
            pawn.JobKind = JobKind.Maintain;
            pawn.JobTarget = machine.Pos;
            pawn.JobWorkTicks = 100;                              // ...but mid-service
            pawn.ClearPath();

            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.True,
                "control: the machine IS reachable, so the recruit probe cannot be what stamps it");
            Assert.That(Int3.IsAdjacent4(pawn.Pos, machine.Pos), Is.False,
                "control: and he is not at the machine — the 'external interference' branch");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "the displaced servicer drops the job");
            Assert.That(maint.Backoff.RetryAtFor(machine.Id),
                        Is.EqualTo(pass + JobWork.UnreachableRetryTicks),
                        "and the abandon funnel stamps the machine for exactly UnreachableRetryTicks");
        }

        // ============================================ the recruit path is a TICK PATH (zero-alloc)

        /// <summary>
        /// A 70x5 corridor. It exists for one reason: a path from one end to the other is 66 steps,
        /// which is longer than <c>_probePath</c>'s initial capacity of 64, so a SUCCEEDING probe
        /// must grow that list. A guard measured only on short paths cannot see a list that
        /// reallocates.
        /// </summary>
        private static string[] LongMap()
        {
            var map = new string[5];
            map[0] = new string('#', 70);
            var row = new StringBuilder("#").Append('.', 68).Append('#').ToString();
            map[1] = row; map[2] = row; map[3] = row;
            map[4] = new string('#', 70);
            return map;
        }

        /// <summary>
        /// ⭐ THE GUARD HOLE THIS PACKAGE WOULD OTHERWISE HAVE LEFT. M1-H put an A* plus two
        /// collections on a 1 Hz tick path, against a named <c>CLAUDE.md</c> invariant ("zero alloc
        /// in tick paths"), and the suite's existing zero-alloc guard
        /// (<c>DefsProductionTests.CraftingTick_AllocatesNothing_OnBothLookupLegs</c>)
        /// <b>structurally cannot see it</b>: its idle leg ASSERTS that nobody was recruited, and
        /// its working leg runs a station that already has a worker, so neither window ever executes
        /// <c>FindNearestReachableIdle</c>.
        ///
        /// <para>This is CLAUDE.md's seventh-trap shape — a survival that was disclosed as a
        /// preference ("cost is not measured") rather than filed as a hole in the guard. The
        /// measurement is cheap and it belongs in the suite, not in a report.</para>
        ///
        /// <para><b>The inclusion control is the point</b> (trap 4: non-vacuity by INCLUSION, never
        /// by population count). Each leg proves the probe ran INSIDE the measured window — by the
        /// backoff deadline advancing repeatedly for the failing legs, and by counting claims for
        /// the succeeding one — so a zero can never mean "the code never ran".</para>
        /// </summary>
        [Test]
        public void RecruitPath_FailingProbe_Crafting_IsZeroAlloc()
        {
            var sim = NewBench(SplitMap, out var crafting, out var station);
            sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(1, 1, 0));

            for (int t = 0; t < 600; t++) sim.Tick();   // warm-up: grow every lazily-sized buffer
            long stampBefore = crafting.Backoff.RetryAtFor(station.Id);

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int t = 0; t < 6000; t++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            long stampAfter = crafting.Backoff.RetryAtFor(station.Id);
            Assert.That(stampAfter - stampBefore, Is.GreaterThan(4L * JobWork.UnreachableRetryTicks),
                "INCLUSION CONTROL: the deadline must have been re-stamped MANY times inside the " +
                "window, or the probe never ran and a zero measures nothing");
            Assert.That(delta, Is.EqualTo(0L),
                $"the failing recruit probe must allocate nothing on the tick path (saw {delta} bytes)");
        }

        [Test]
        public void RecruitPath_FailingProbe_Maintenance_IsZeroAlloc()
        {
            var maint = new MaintenanceSystem();
            var sim = new Simulation(AsciiWorld.Build(SplitMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), maint });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();

            for (int t = 0; t < 600; t++) sim.Tick();
            long stampBefore = maint.Backoff.RetryAtFor(machine.Id);

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int t = 0; t < 6000; t++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(maint.Backoff.RetryAtFor(machine.Id) - stampBefore,
                        Is.GreaterThan(4L * JobWork.UnreachableRetryTicks),
                "INCLUSION CONTROL: the machine must have been re-refused many times in the window");
            Assert.That(delta, Is.EqualTo(0L),
                $"the failing maintenance probe must allocate nothing on the tick path (saw {delta} bytes)");
        }

        /// <summary>
        /// The SUCCEEDING probe, on a path longer than <c>_probePath</c>'s initial capacity, so the
        /// reconstructed route really is written into that list and any per-call growth would show.
        ///
        /// <para>The crew member is forced back to his start tile and back to idle after every tick.
        /// That is deliberate and it is the only way to get hundreds of successful probes into one
        /// window: a probe that SUCCEEDS ends in a claim, and a claimed station never recruits
        /// again. It is not a synthetic state — "the crew member was taken off this job by something
        /// else" is the same external interference the work-phase abandon branch exists for.</para>
        /// </summary>
        [Test]
        public void RecruitPath_SucceedingProbe_LongPath_IsZeroAlloc()
        {
            var crafting = new CraftingSystem();
            var sim = new Simulation(AsciiWorld.Build(LongMap()), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), crafting });
            var station = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(66, 2, 0), "recycler");
            var staging = new Int3(67, 2, 0);
            var start = new Int3(1, 2, 0);
            var pawn = sim.AddCitizen("Rell", start).GiveAllWork();
            sim.AddItem(ItemKind.Regolith, Batch, new Int3(30, 1, 0)); // un-staged: the gate opens

            var route = new List<Int3>();
            Assert.That(sim.Paths.FindPath(sim, start, staging, route), Is.True);
            Assert.That(route.Count, Is.GreaterThan(64),
                $"PRECONDITION: the probe's path must exceed _probePath's initial capacity of 64 " +
                $"(measured {route.Count}), or this leg cannot see a list that reallocates");

            int claims = 0;
            for (int t = 0; t < 600; t++) { sim.Tick(); Reset(pawn, start); }   // warm-up

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int t = 0; t < 6000; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Craft) claims++;
                Reset(pawn, start);
            }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(claims, Is.GreaterThan(100),
                $"INCLUSION CONTROL: the window must contain hundreds of SUCCESSFUL probes " +
                $"(saw {claims}) — a zero from a window with none measures nothing");
            Assert.That(delta, Is.EqualTo(0L),
                $"the succeeding recruit probe must allocate nothing on the tick path, even when it " +
                $"writes a {route.Count}-step route into its scratch list (saw {delta} bytes)");
        }

        private static void Reset(Citizen c, Int3 home)
        {
            c.JobKind = JobKind.None;
            c.JobWorkTicks = 0;
            c.CarryingItemId = 0;
            c.ClearPath();
            c.Pos = home;
        }

        /// <summary>
        /// A quiet behaviour improvement that would otherwise ship untested: an unreachable machine
        /// now <c>continue</c>s the recruit loop instead of returning from it, so ANOTHER machine —
        /// reachable, and in this fixture needier by nothing but store order — is still serviced on
        /// the SAME pass. Before, one walled-off machine could end the pass for every machine
        /// behind it.
        /// </summary>
        [Test]
        public void Maintenance_AnUnreachableMachineDoesNotEndThePassForAReachableOne()
        {
            var maint = new MaintenanceSystem();
            var sim = new Simulation(AsciiWorld.Build(SplitMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), maint });
            // The NEEDIEST machine is the unreachable one, so it is picked first every pass.
            var walledOff = sim.AddDevice(DeviceKind.Scrubber, StationPos, "far");      // RIGHT room
            walledOff.Condition = 0.26f;
            var reachable = sim.AddDevice(DeviceKind.Scrubber, new Int3(2, 1, 0), "near"); // LEFT room
            reachable.Condition = 0.30f;
            var pawn = sim.AddCitizen("Rell", new Int3(3, 3, 0)).GiveAllWork();

            Assert.That(walledOff.Condition, Is.LessThan(reachable.Condition),
                "control: the UNREACHABLE machine is the neediest, so the loop reaches it first");
            Assert.That(sim.Paths.FindPath(sim, pawn.Pos, StagingPos, new List<Int3>()), Is.False,
                "control: and it really is unreachable");

            long pass = AlignToPass(sim);
            sim.Tick();
            Assert.That(maint.Backoff.RetryAtFor(walledOff.Id),
                        Is.EqualTo(pass + JobWork.UnreachableRetryTicks),
                        "the unreachable machine is refused and stamped");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Maintain),
                        "and the SAME pass still serviced the reachable one — a refusal must skip a " +
                        "machine, not end the pass");
            Assert.That(pawn.JobTarget, Is.EqualTo(reachable.Pos));
        }

        /// <summary>A REACHABLE needy machine is still serviced — the maintenance half of the
        /// no-regression leg. Without this the leg above is satisfied by a recruiter that simply
        /// stopped working.</summary>
        [Test]
        public void Maintenance_ReachableMachine_IsStillServiced()
        {
            var maint = new MaintenanceSystem();
            var sim = new Simulation(AsciiWorld.Build(OpenMap), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), maint });
            var machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();

            float before = machine.Condition;
            int serviceTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;
            for (int t = 0; t < serviceTicks * 3 && machine.Condition <= before; t++) sim.Tick();

            Assert.That(machine.Condition, Is.GreaterThan(before),
                "a reachable machine must still be serviced — Condition RISES, and nothing but a " +
                "service can raise it");
        }
    }
}
