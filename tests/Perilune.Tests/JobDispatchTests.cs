using System;
using System.Collections.Generic;
using System.Text;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The JOB DISPATCH ORDER — the arbitration W0-4 split out of one 842-line
    /// <see cref="JobSystem"/> into a dispatcher over pluggable <see cref="IJobSource"/>
    /// providers. Nothing here asserts a hash; the pins already do that and a pin is blind to
    /// *which* job a citizen took as long as the outcome is the same shape. These tests pin the
    /// thing a hash cannot see and a reviewer cannot eyeball: WHICH candidate wins, in what
    /// order, when several are equally near.
    ///
    /// Every expectation below was RECORDED FROM THE PRE-REFACTOR BUILD (JobSystem's inline
    /// four-kind <c>TryAssign</c>, at f473d17) and is asserted unchanged against the dispatcher.
    /// They are therefore a behaviour pin on assignment, not a restatement of the new code.
    ///
    /// The rules being pinned, all of which are load-bearing and none of which is checked
    /// anywhere else:
    ///   • one global nearest-job argmin by <see cref="Int3.Manhattan"/> across ALL sources,
    ///     with strict <c>&lt;</c> everywhere;
    ///   • so an exact distance tie resolves to SOURCE REGISTRATION ORDER: Dig, Haul, Build
    ///     (and inside Build: ready-to-build before needs-material);
    ///   • and inside one source, to that source's own board order (tiles z,y,x; items in
    ///     entity store order).
    /// </summary>
    public class JobDispatchTests
    {
        // ------------------------------------------------------------------ helpers

        /// <summary>The dispatcher's kinds only — Eat/Drink/Craft/Maintain are assigned by
        /// Sustenance/Crafting/Maintenance and are none of this test's business.</summary>
        private static bool IsDispatcherKind(JobKind k) =>
            k == JobKind.Dig || k == JobKind.HaulPickup || k == JobKind.HaulDeliver ||
            k == JobKind.HaulToBuild || k == JobKind.Build;

        /// <summary>Every None → job transition, in tick order, as a stable one-line record.</summary>
        private static List<string> RecordAssignments(Simulation sim, int ticks, int max)
        {
            var log = new List<string>();
            var prev = new Dictionary<uint, JobKind>();
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++) prev[crew[i].Id] = crew[i].JobKind;

            for (int t = 0; t < ticks && log.Count < max; t++)
            {
                sim.Tick();
                crew = sim.Citizens.Items;
                for (int i = 0; i < crew.Count && log.Count < max; i++)
                {
                    var c = crew[i];
                    prev.TryGetValue(c.Id, out var was);
                    if (was == JobKind.None && IsDispatcherKind(c.JobKind))
                        log.Add(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                            "t{0} c{1} {2} {3},{4},{5}",
                            sim.TickCount, c.Id, c.JobKind, c.JobTarget.X, c.JobTarget.Y, c.JobTarget.Z));
                    prev[c.Id] = c.JobKind;
                }
            }
            return log;
        }

        private static void AssertSequence(IReadOnlyList<string> expected, List<string> actual)
        {
            if (expected.Count == actual.Count)
            {
                bool same = true;
                for (int i = 0; i < expected.Count; i++) if (expected[i] != actual[i]) { same = false; break; }
                if (same) return;
            }
            var sb = new StringBuilder();
            sb.AppendLine("assignment sequence changed — RECORDED:");
            for (int i = 0; i < actual.Count; i++) sb.Append("                \"").Append(actual[i]).AppendLine("\",");
            Assert.Fail(sb.ToString());
        }

        // A 3-wide corridor with a debris seam, so a citizen can stand exactly equidistant
        // from a dig site and a loose item. '%' is placed as Debris after the build.
        private static readonly string[] TieMap =
        {
            "###########",
            "#.........#",
            "#.........#",
            "#.........#",
            "###########",
        };

        private static Simulation NewTieShip(out BuildSystem build)
        {
            build = new BuildSystem();
            return new Simulation(AsciiWorld.Build(TieMap), 11,
                new ISimSystem[] { new JobSystem(), build });
        }

        /// <summary>As <see cref="NewTieShip(out BuildSystem)"/> but with the E0-5
        /// <see cref="DeconstructSystem"/> registered too, so the fourth job source resolves and
        /// its board can be populated. Separate rather than folded into the shared builder: every
        /// OTHER test here pins an assignment sequence, and those must keep measuring the
        /// three-source stack they were recorded against.</summary>
        private static Simulation NewTieShipWithDeconstruct(out BuildSystem build, out DeconstructSystem strip)
        {
            build = new BuildSystem();
            strip = new DeconstructSystem();
            return new Simulation(AsciiWorld.Build(TieMap), 11,
                new ISimSystem[] { new JobSystem(), build, strip });
        }

        /// <summary>A named source's raw board size — preconditions key on the source's identity,
        /// never its registration index.</summary>
        private static int CountFor(JobSystem jobs, string name)
        {
            for (int i = 0; i < jobs.Sources.Count; i++)
                if (jobs.Sources[i].Name == name) return jobs.Sources[i].CandidateCount;
            Assert.Fail($"no job source named '{name}' is registered");
            return -1;
        }

        private static void Debris(Simulation sim, Int3 p)
        {
            sim.World.SetWall(p, TileDefs.Debris);
            sim.World.SetFlag(p, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;
        }

        // ------------------------------------------------- the recorded assignment sequence

        /// <summary>
        /// EVERY job assignment the eight-crew slice ever makes, with a wall designated at boot and
        /// three corridor tiles zoned — all 59 of them, verbatim. This is the reordering canary: it exercises all four shipped
        /// job kinds through the REAL dispatcher and asserts the observable (tick, citizen, kind,
        /// target) sequence rather than recomputing it.
        ///
        /// RE-RECORDED FOR E0-2 (work-rate rebase + movement retune), and the shift is the whole
        /// point of that lane. Under the E0-1 recording this was 73 assignments that OPENED at t1
        /// with all eight crew and SATURATED by t3922 — a boot-window flurry over in ~6 sim-min.
        /// E0-2 slows the game down by design: a dig is 6 000 work ticks (was 60) and a tile is
        /// 10 movement ticks (was 5), so the same 48-tile aft field is now worked out over the
        /// span of a real shift. The opening is unchanged in shape — all eight crew still take
        /// work at **t1** off the relaxed <see cref="Citizen.IsIdleForWork"/> gate — but the digs
        /// now land in slow waves (t303, t6553, t12823, …) and the last one is assigned at
        /// **t61493**, after which ~28 000 further ticks produce nothing (true saturation, not a
        /// truncated prefix; measured against a 150 000-tick window before the window below was
        /// tightened). Every tick below moved with the retune; the assignment ORDER and targets
        /// are otherwise a re-timing of the same argmin dispatch, not a new RNG stream (durations
        /// changed, no draw counts did). Recorded from the post-E0-2 build.
        ///
        /// RE-RECORDED FOR E0-4 WP-4 (the "don't haul what a bench wants" rule), and the shrink is
        /// the whole point of that rule. The test zones three corridor stockpile tiles (below), so
        /// the haul source fires on the slice — and WP-4 now CEDES every crafting intermediate
        /// (Regolith / Scrap / Parts — the input kinds of the slice's SalvageRecycler / Fabricator /
        /// MachineShop) to the crafting chain instead of hauling it to a stockpile. So the opening
        /// HaulPickups that used to drag fab-bay intermediates to the zone (targets 31,6 / 32,6 —
        /// Scrap/Parts) VANISH, and the sequence drops **73 → 59** assignments (14 HaulPickups → 8).
        /// What survives is exactly the terminal / non-bench haul: Potato pickups at 29,6 and the
        /// lower-deck (z=1) food stacks still board (HaulPickup coverage still holds), plus the
        /// unchanged dig/build work, now re-timed. Last assignment lands at **t54681**. The four
        /// determinism pins are UNMOVED by WP-4 — this is not one of them: no AUTHORED ship zones a
        /// stockpile, so the bench rule is inert on the scenario / tick-3000 / slice-golden runs;
        /// this test zones one by hand precisely to exercise the path the rule governs.
        ///
        /// The window (90 000 ticks, cap 400) is deliberately far past saturation (last assignment
        /// t54681), so a change that only ADDS assignments fails on the count instead of passing on
        /// a prefix.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): flip <c>DigJobSource.Select</c>'s
        /// argmin from <c>&lt;</c> to <c>&lt;=</c> — the sequence diverges inside the aft dig field,
        /// where equidistant sites are common.
        ///
        /// MEASURED LIMIT, stated because it matters: swapping the Dig and Haul REGISTRATIONS does
        /// NOT move this sequence. Nowhere in the recorded sequence is a dig site exactly as far from a
        /// citizen as a haul item, so the cross-source tie never arises on the slice. That mutation
        /// is caught by <see cref="EqualDistance_DigBeatsHaul"/> instead. A recorded sequence is a
        /// good canary and a bad proof; the constructed ties below are the proof.
        ///
        /// RE-RECORDED FOR E0-7 (ice -> melter -> water), and the reason is stated so a reader can
        /// check it rather than trust it. E0-7 authors ONE new device (the ice melter, on the hydro
        /// loop) and 200 new ItemSpecs (the forward hold's ice) onto the slice. Three consequences,
        /// all visible in the diff:
        ///   * every citizen id moves up by ONE (c932..c939 -> c933..c940): entity ids are handed
        ///     out in plan order and citizens come after devices, so a single DeviceSpec shifts the
        ///     whole crew. This is the same shift that rebinds the portrait keys — see
        ///     SlicePortraitKeysTests.
        ///   * the melter is a CRAFTING STATION, so it competes for idle crew from tick 1. The dig
        ///     and build work is unchanged in kind but RE-TIMED, because CraftingSystem recruits the
        ///     nearest idle citizen and there is now one more bench asking.
        ///   * the count moves 59 -> 58, last assignment at t66402.
        /// The melter's own recruitments do NOT appear here: this fixture records the JOB BOARD's
        /// assignments, and CraftingSystem stamps JobKind.Craft itself rather than going through the
        /// dispatcher (see its class comment). So what this sequence shows is the melter's SHADOW on
        /// the other sources, which is exactly the property worth pinning.
        ///
        /// This is a BEHAVIOUR PIN, like a golden: any lane that deliberately changes labour
        /// assignment (E0-2 work rates, a new job source) will move it, and must re-record it in
        /// the same commit and say why. It must never be re-recorded to make a red build green.
        ///
        /// RE-RECORDED BY E0-6 (conversion loss). The justification below is the MEASURED DIFF,
        /// and it replaces a first draft that was wrong on every specific — it claimed 73 → 57,
        /// blamed the Dig column, and asserted the aft dig field no longer finishes. Independent
        /// review checked all three and none survived. Recorded here because a moved behaviour pin
        /// defended by a story nobody diffed is exactly what the pin exists to prevent.
        ///
        /// THE ACTUAL DIFF, counted off both arrays:
        ///
        ///   * <b>59 → 57 assignments.</b> The "73" was inherited from this method's own stale
        ///     name on main (<c>AllSeventyThreeJobs…</c>) and was never re-derived; main's array
        ///     is 59 entries.
        ///   * <b>Dig is 48 → 48.</b> Every one of the 48 dig targets is still assigned, in both
        ///     runs, inside the same 90 000-tick window. Nothing stops being dug.
        ///   * <b>The whole loss is HaulPickup, 8 → 6.</b> Three deck-1 re-pickups that main
        ///     issued together at t12012 (tiles 24,14,1 · 22,14,1 · 20,14,1) are replaced by ONE
        ///     earlier deck-0 pickup at t9202 (23,6,0).
        ///   * Dig TIMINGS shift by roughly +2…+2000 ticks from t12261 onward and the crew ids
        ///     holding them reshuffle; the last assignment moves t54681 → t54763, i.e. +82.
        ///
        /// The only bill change upstream of any of this is the SalvageRecycler's batch size
        /// (<c>Regolith:1</c> → <c>Regolith:4</c>, at 4× the work time), which changes WHEN the
        /// bench's fetcher is occupied — <c>JobKind.Craft</c> is not a dispatcher kind and never
        /// appears in this log, but a crew member inside it is not available to the dispatcher.
        /// That is as far as the evidence goes: the diff is small, benign, and confined to haul
        /// timing. It is deliberately NOT dressed up as a mechanism for a 16-assignment drop that
        /// never happened.
        ///
        /// ═══ RE-RECORDED BY THE E0-6 × E0-7 WAVE MERGE, and the array below is NEITHER PARENT'S.
        /// Both blocks above describe a BRANCH; this one describes the tree that shipped. Every
        /// figure here was counted off the three arrays with a script, not inferred.
        ///
        ///   * <b>57 assignments</b> — the same COUNT as E0-6's, one fewer than E0-7's 58. A count
        ///     that matches a parent is NOT evidence that the sequence does: only <b>16 of the 57
        ///     rows are identical to E0-6's</b> (after normalising the id shift below) and <b>13 of
        ///     57 to E0-7's</b>. Neither parent's array would pass here.
        ///   * <b>Every citizen id is +1 against main</b> (c932..c939 → c933..c940). E0-7's, not the
        ///     merge's: entity ids are handed out in plan order, citizens come after devices, and
        ///     E0-7 authors one new DeviceSpec (the ice melter). It is the same shift that rebinds
        ///     the portrait keys — see SlicePortraitKeysTests.
        ///   * <b>The KIND MIX is E0-6's exactly: 48 Dig · 6 HaulPickup · 2 HaulToBuild · 1 Build.</b>
        ///     E0-7's branch recorded 7 HaulPickups; the merged tree records 6. The haul ROWS are
        ///     E0-6's row-for-row (two at t1 on 29,6,0; three at t6002 on deck 1; one at t9202 on
        ///     23,6,0), where E0-7's branch instead re-picked two deck-1 stacks at t12012. E0-6's
        ///     conversion-loss bills are what decide when a bench's fetcher is busy, so the haul
        ///     shape follows E0-6 and not E0-7.
        ///   * <b>Dig is 48 → 48 → 48, and the 48 TARGETS are the same SET in all three runs.</b>
        ///     Nothing stops being dug; the aft field still finishes inside the window.
        ///   * <b>What the melter does is RE-TIME the dig column.</b> First divergence from E0-6 is
        ///     at index 11 (Dig 57,10,0 moves t6251 → t6462 and changes hands), and the per-row tick
        ///     delta against E0-6 runs min −50 / median +10 / max +5950. The last assignment moves
        ///     t54763 → <b>t55113</b> (+350), well inside the 90 000-tick window.
        ///   * The melter's own recruitments still do NOT appear here — CraftingSystem stamps
        ///     JobKind.Craft itself rather than going through the dispatcher. What this sequence
        ///     shows is the melter's SHADOW on the other sources, on top of E0-6's bill timings.
        ///
        /// ⚠️ RE-RECORDED 2026-07-28 by the WORKSITE STAGING RULE (docs/HANDOVER.md §5 item 2,
        /// MECHANICS §13.21). The KIND MIX AND THE 48 DIG TARGETS ARE UNCHANGED — same 57 rows,
        /// same set of tiles, the aft field still finishes inside the window — and the first NINE
        /// rows are byte-identical (row 10, t6251 → t6301, is the first divergence), which is why
        /// the slice tick-3000 golden HELD.
        ///
        /// WHAT MOVED, and the mechanism: from t6251 the dig column is RE-TIMED and re-handed. A
        /// freshly dug tile opens a pocket of the aft field that has not yet filled with air
        /// through `door_aft`, and the rule will not park a worker in it — so the next tile waits
        /// on the atmosphere instead of on the worker. The first divergence is exactly +50 ticks,
        /// which is JobWork.UnreachableRetryTicks: one refused claim, one backoff, one retry. The
        /// last assignment moves t55113 → t61073 (+5960, ~11 % slower to saturate), still well
        /// inside the 90 000-tick window, and slice `occupancy --days 1` clears all 48 debris tiles
        /// either way.
        ///
        /// This is a BEHAVIOUR pin and re-recording it is the ritual; it is not one of the five
        /// determinism pins, all of which held.
        ///
        /// NOT a determinism pin, and it is not one of the five: no authored ship zones a stockpile,
        /// so this fixture zones three corridor tiles by hand. The five pins moved for their own
        /// reasons and the integrator re-pins them.
        /// </summary>
        private static readonly string[] SliceAssignments =
        {
            "t1 c933 HaulToBuild 30,10,0",
            "t1 c934 HaulPickup 29,6,0",
            "t1 c935 HaulPickup 29,6,0",
            "t1 c936 Dig 57,9,0",
            "t252 c933 HaulToBuild 30,10,0",
            "t373 c933 Build 30,10,0",
            "t6002 c933 HaulPickup 24,14,1",
            "t6002 c934 HaulPickup 22,14,1",
            "t6002 c935 HaulPickup 20,14,1",
            "t6301 c936 Dig 57,8,0",
            "t6301 c937 Dig 58,9,0",
            "t6462 c938 Dig 57,10,0",
            "t9202 c933 HaulPickup 23,6,0",
            "t12363 c933 Dig 57,7,0",
            "t12363 c935 Dig 58,8,0",
            "t12563 c936 Dig 59,9,0",
            "t12563 c937 Dig 58,10,0",
            "t12913 c938 Dig 57,11,0",
            "t18663 c933 Dig 57,6,0",
            "t18663 c935 Dig 58,7,0",
            "t18663 c936 Dig 59,8,0",
            "t18663 c937 Dig 60,9,0",
            "t18663 c939 Dig 59,10,0",
            "t18923 c938 Dig 58,11,0",
            "t19222 c934 Dig 57,12,0",
            "t24723 c935 Dig 58,6,0",
            "t24723 c936 Dig 59,7,0",
            "t24723 c937 Dig 60,8,0",
            "t24933 c938 Dig 59,11,0",
            "t25163 c939 Dig 60,10,0",
            "t28142 c933 Dig 57,13,0",
            "t30733 c935 Dig 59,6,0",
            "t30733 c936 Dig 60,7,0",
            "t30733 c937 Dig 61,8,0",
            "t30943 c938 Dig 58,12,0",
            "t31173 c939 Dig 61,10,0",
            "t34762 c940 Dig 61,9,0",
            "t36743 c935 Dig 60,6,0",
            "t36743 c936 Dig 61,7,0",
            "t36743 c937 Dig 62,8,0",
            "t36963 c938 Dig 59,12,0",
            "t37183 c939 Dig 60,11,0",
            "t38082 c933 Dig 58,13,0",
            "t42753 c935 Dig 61,6,0",
            "t42753 c936 Dig 62,7,0",
            "t42753 c937 Dig 62,9,0",
            "t42973 c938 Dig 60,12,0",
            "t43203 c939 Dig 61,11,0",
            "t48242 c933 Dig 59,13,0",
            "t48763 c935 Dig 62,6,0",
            "t48763 c936 Dig 62,10,0",
            "t48983 c938 Dig 61,12,0",
            "t49213 c939 Dig 62,11,0",
            "t52252 c937 Dig 60,13,0",
            "t55023 c936 Dig 62,12,0",
            "t55023 c938 Dig 61,13,0",
            "t61073 c936 Dig 62,13,0",
        };

        [Test]
        public void SliceAssignmentSequence_AllFiftySevenJobsToSaturation_IsStableAfterTheE0_6xE0_7Wave()
        {
            // M2-2 (OD-H): the recorded assignment sequence is a sequence of jobs a WORKING crew
            // takes; with the shipped boot grid it is empty. Enrolled so the pin keeps measuring
            // arbitration rather than the default.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim.GiveAllCrewAllWork();
            BuildSystem build = null;
            foreach (var s in sim.Systems) if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "precondition: the slice stack registers a BuildSystem");
            Assert.That(build.Designate(sim, new Int3(30, 10, 0), BuildKind.Wall), Is.True,
                "precondition: a wall is designated, so the build sources have demand");
            // The authored slice ships NO stockpile zone, so the haul source can never fire on it
            // as authored (grep Stockpile in AuthoredShips.cs — no writer). Zone three corridor
            // tiles so all four kinds are exercised.
            foreach (var p in new[] { new Int3(32, 10, 0), new Int3(33, 10, 0), new Int3(34, 10, 0) })
            {
                Assert.That(sim.IsWalkable(p), Is.True, $"precondition: {p} is an open corridor tile");
                sim.World.SetFlag(p, TileFlags.Stockpile, true);
            }
            sim.JobsDirty = JobBoardDirty.All;

            // 400 is a cap the scenario must not reach: hitting it would mean the run had not
            // saturated and the sequence-count claim in the doc comment is a lie. E0-2 slows every
            // job and E0-4 WP-4 cedes bench inputs from haul, so the window is 90 000 ticks (last
            // assignment lands at t54681; verified nothing more assigns out to a 150 000-tick probe).
            var log = RecordAssignments(sim, 90000, 400);
            Assert.That(log.Count, Is.LessThan(400), "precondition: the run saturated inside the window");

            // The coverage assertions below prove every source's path was REACHED. They run AFTER
            // AssertSequence on purpose: when something changes, the sequence diff is the useful
            // failure message and "the haul source fired" is not. A green AssertSequence already
            // implies coverage; these guard the case where someone re-records a degraded sequence.
            var kinds = new HashSet<string>();
            foreach (var line in log) kinds.Add(line.Split(' ')[2]);
            AssertSequence(SliceAssignments, log);
            Assert.That(kinds.Contains("Dig"), Is.True, "the dig source fired");
            Assert.That(kinds.Contains("HaulPickup"), Is.True, "the haul source fired");
            Assert.That(kinds.Contains("HaulToBuild"), Is.True, "the build-material source fired");
            Assert.That(kinds.Contains("Build"), Is.True, "the build source fired");
        }

        // ------------------------------------------------------------- the tie-break matrix

        /// <summary>
        /// A dig site and a haul item exactly as far from the worker: DIG wins, because the dig
        /// source is registered first and every argmin is strict <c>&lt;</c>.
        /// NAMED MUTATION: register Haul before Dig — the citizen takes HaulPickup and this fails.
        ///
        /// It used to be TWO mutations: flipping <c>HaulJobSource</c>'s own argmin to <c>&lt;=</c>
        /// also reddened this test. It no longer does, and that is a PROPERTY worth knowing rather
        /// than a hole. The dispatcher's <c>d &gt;= bestDist</c> guard means a source with a
        /// non-strict internal argmin now returns a candidate at exactly the running best and is
        /// DECLINED, so a sloppy source can no longer steal a cross-source tie from a source
        /// registered ahead of it — the dispatcher absorbs that whole bug class on behalf of three
        /// lanes that have not written their sources yet. What a non-strict argmin still breaks is
        /// the tie WITHIN one source's own board, which is
        /// <see cref="EqualDistance_TwoHaulItems_ResolveToEntityStoreOrder"/>'s job and which that
        /// test still catches (measured: the <c>&lt;=</c> flip reddens it alone, 1 of 620).
        /// </summary>
        [Test]
        public void EqualDistance_DigBeatsHaul()
        {
            var sim = NewTieShip(out _);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            Debris(sim, new Int3(3, 2, 0));                          // 2 tiles west
            sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));       // 2 tiles east
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true); // haul has a destination

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.Not.EqualTo(JobKind.None), "precondition: he took SOMETHING");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Dig));
            Assert.That(worker.JobTarget, Is.EqualTo(new Int3(3, 2, 0)));
        }

        /// <summary>
        /// A haul item and a ready-to-build site exactly as far: HAUL wins (Haul is registered
        /// before Build).
        /// NAMED MUTATION: register Build before Haul — the citizen takes Build and this fails.
        /// </summary>
        [Test]
        public void EqualDistance_HaulBeatsBuild()
        {
            var sim = NewTieShip(out var build);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 2, 0));       // 2 west
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true);
            Assert.That(build.Designate(sim, new Int3(7, 2, 0), BuildKind.Wall), Is.True); // 2 east
            // Fund the site fully so it boards as READY (no material haul in the way).
            Assert.That(build.TryGet(new Int3(7, 2, 0), out var site), Is.True);
            Assert.That(build.Deposit(sim, new Int3(7, 2, 0), site.Required), Is.EqualTo(site.Required));
            sim.JobsDirty = JobBoardDirty.All;

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.Not.EqualTo(JobKind.None), "precondition: he took SOMETHING");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.HaulPickup));
            Assert.That(worker.JobTarget, Is.EqualTo(new Int3(3, 2, 0)));
        }

        /// <summary>
        /// A ready-to-build site and a needs-material site exactly as far: READY wins. Inside the
        /// build source the ready board is scanned before the needs-material board, and both feed
        /// the same strict-&lt; argmin.
        /// NAMED MUTATION: scan the needs-material board first inside BuildJobSource.Select —
        /// the citizen takes HaulToBuild and this fails.
        /// </summary>
        [Test]
        public void EqualDistance_ReadyBuildBeatsNeedyBuild()
        {
            var sim = NewTieShip(out var build);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            var ready = new Int3(7, 2, 0);
            var needy = new Int3(3, 2, 0);
            Assert.That(build.Designate(sim, ready, BuildKind.Wall), Is.True);
            Assert.That(build.Designate(sim, needy, BuildKind.Wall), Is.True);
            Assert.That(build.TryGet(ready, out var r), Is.True);
            Assert.That(build.Deposit(sim, ready, r.Required), Is.EqualTo(r.Required));
            sim.AddItem(ItemKind.Regolith, r.Required, new Int3(5, 3, 0)); // funds the needy site too
            sim.JobsDirty = JobBoardDirty.All;

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.Not.EqualTo(JobKind.None), "precondition: he took SOMETHING");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Build));
            Assert.That(worker.JobTarget, Is.EqualTo(ready));
        }

        /// <summary>
        /// Two dig sites the same distance away: the one earlier in the board's z,y,x scan order
        /// wins — here the lower Y, even though the higher Y was designated first.
        /// NAMED MUTATION: flip the dig argmin to <c>&lt;=</c>, or reverse the y loop in the
        /// dispatcher's tile pass — the citizen digs (5,3,0) and this fails.
        /// </summary>
        [Test]
        public void EqualDistance_TwoDigSites_ResolveToTileScanOrder()
        {
            var sim = NewTieShip(out _);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            Debris(sim, new Int3(5, 3, 0)); // designated FIRST, but scanned second (higher y)
            Debris(sim, new Int3(5, 1, 0));

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Dig), "precondition: he took a dig");
            Assert.That(worker.JobTarget, Is.EqualTo(new Int3(5, 1, 0)));
        }

        /// <summary>
        /// Two haul items the same distance away: the one earlier in ENTITY STORE order wins.
        /// Store order is insertion order (never a swap-remove — ECONOMY-PLAN §4.1), so this is
        /// also a tripwire on anyone "optimising" <c>EntityStore.Remove</c>.
        /// NAMED MUTATION: flip the haul argmin to <c>&lt;=</c> — the citizen fetches the
        /// second-inserted stack and this fails.
        /// </summary>
        [Test]
        public void EqualDistance_TwoHaulItems_ResolveToEntityStoreOrder()
        {
            var sim = NewTieShip(out _);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            sim.World.SetFlag(new Int3(5, 3, 0), TileFlags.Stockpile, true);
            var first = sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));
            var second = sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 2, 0));
            Assert.That(first.Id, Is.LessThan(second.Id), "precondition: insertion order is id order");

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.EqualTo(JobKind.HaulPickup), "precondition: he took a haul");
            Assert.That(worker.ReservedItemId, Is.EqualTo(first.Id));
        }

        // ----------------------------------------------------- the W0-3 win: the tile pass is gated

        /// <summary>An inert source that also opts into the dispatcher's world pass, purely to COUNT
        /// how often each stage runs. <see cref="TileScanCount"/> is the number of full O(W·H·D)
        /// world passes; <see cref="RescanCount"/> is the number of board rescans (any dirty axis).
        /// Offers no work (CandidateCount 0, no handled kinds) so it never perturbs assignment.</summary>
        private sealed class CountingTileScanner : IJobSource, IJobTileScanner
        {
            public int TileScanCount;   // BeginTileScan calls == full-world passes
            public int VisitCount;      // VisitTile calls
            public int RescanCount;     // IJobSource.Rescan calls == board rescans
            private static readonly JobKind[] Kinds = System.Array.Empty<JobKind>();
            public string Name => "Counter";
            public JobKind[] HandledKinds => Kinds;
            public int CandidateCount => 0;
            public void BeginTick(Simulation sim) { }
            public void BeginTileScan(Simulation sim) => TileScanCount++;
            public void VisitTile(Simulation sim, Int3 pos, byte flags, ushort wall, ushort floor) => VisitCount++;
            public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what) => RescanCount++;
            public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
            { dist = bestDist; return -1; }
            public bool TryClaim(Simulation sim, Citizen citizen, int c, long gen, JobContext ctx) => false;
            public void Progress(Simulation sim, Citizen citizen, JobContext ctx) { }
            public void OnGroundItemReserved(Simulation sim, ItemStack item) { }
            // A test double keeps no backoff map: it never stamps one, so it can never be inside
            // one. Written out per double rather than defaulted on the interface — a source that
            // silently answered "never backed off" would put a hole in the `blocked` channel, and
            // the compiler asking the question is the point (IJobSource.IsBackedOff).
            public bool IsBackedOff(Int3 pos, long tick, out long untilTick) { untilTick = 0; return false; }
        }

        /// <summary>
        /// THE W0-3 WIN, proven positively — not "the hash is unmoved" (that proves the split is
        /// SAFE, not that it FIRED) but "an item change no longer walks the world". The defect: every
        /// <see cref="Simulation.AddItem"/> forced the dispatcher's single O(W·H·D) tile pass, so a
        /// production ship emitting items dozens per second re-scanned every tile on every drop.
        ///
        /// The counting scanner records both stages, so this asserts the PATH WAS REACHED before the
        /// outcome: an item-only change still triggers a board rescan (RescanCount climbs — the board
        /// is not silently stale), but that rescan does NOT re-walk the tile pass (TileScanCount held).
        /// A real tile change (a dig designation) still does, proving the pass was gated, not removed.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): in <c>JobSystem.Rescan</c>, change
        /// the tile-pass guard from <c>(what &amp; JobBoardDirty.Tiles) != 0</c> back to the pre-W0-3
        /// <c>what != JobBoardDirty.None</c> — the item-only leg then re-walks the world and
        /// TileScanCount reaches 2 after the AddItem, failing "the item-only rescan did NOT re-walk".
        /// </summary>
        [Test]
        public void AnItemOnlyChange_DoesNotWalkTheWorldTilePass_ButATileChangeStillDoes()
        {
            var counter = new CountingTileScanner();
            var sim = new Simulation(AsciiWorld.Build(TieMap), 7,
                new ISimSystem[] { new JobSystem(new IJobSource[] { counter }) });
            sim.World.SetWall(new Int3(3, 2, 0), TileDefs.Debris); // a diggable tile for the tile leg

            // Boot: JobsDirty defaults to All, so the first tick runs the world pass exactly once.
            sim.Tick();
            Assert.That(counter.TileScanCount, Is.EqualTo(1), "precondition: boot ran the world tile pass once");
            Assert.That(counter.VisitCount, Is.EqualTo(55), "precondition: one pass visited all 11×5×1 tiles");
            int rescansAfterBoot = counter.RescanCount;

            // A steady tick with nothing dirty rescans nothing — neither the board nor the world.
            sim.Tick();
            Assert.That(counter.RescanCount, Is.EqualTo(rescansAfterBoot), "precondition: steady state does not rescan");
            Assert.That(counter.TileScanCount, Is.EqualTo(1), "precondition: …so the world pass does not run");

            // THE WIN: a loose stack appears (Items only). The board DID rescan (path reached) …
            sim.AddItem(ItemKind.Scrap, 1, new Int3(5, 2, 0));
            sim.Tick();
            Assert.That(counter.RescanCount, Is.EqualTo(rescansAfterBoot + 1),
                "the item change DID trigger a board rescan — the board is not left stale");
            // … but that rescan did NOT re-walk the O(W·H·D) world pass. This is the whole package.
            Assert.That(counter.TileScanCount, Is.EqualTo(1),
                "the item-only rescan did NOT re-walk the world tile pass — the W0-3 win");
            Assert.That(counter.VisitCount, Is.EqualTo(55), "no extra tile visits either");

            // CONTROL: a real tile change (a dig designation) still walks the world, so the pass was
            // gated on TilesDirty, not deleted.
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(3, 2, 0), true));
            sim.Tick();
            Assert.That(counter.TileScanCount, Is.EqualTo(2),
                "a tile change still re-walks the world — the pass is gated on Tiles, not removed");
        }

        /// <summary>
        /// THE POSITIVE HALF of the win (F1): an item-only rescan must not merely SKIP the tile pass,
        /// it must still let a REAL source rebuild its board and hand out the job the new stack
        /// created. The optimisation test above proves the skip with an inert zero-candidate scanner;
        /// this proves the item sub-pass still fires through the shipped <see cref="HaulJobSource"/>.
        ///
        /// It closes the missed-rescan blind spot the reviewer measured: because the pinned scenario
        /// makes ZERO haul assignments and the slice reaches dig only, pin + goldens + the
        /// 66-sequence are necessary-but-not-sufficient here — mutating <see cref="Simulation.AddItem"/>
        /// to set the WRONG flag (a genuine "dropped stacks never board for haul" bug) leaves all of
        /// them byte-identical. Only a positive assignment assertion catches it.
        ///
        /// The stack is added AFTER the board reaches steady state (JobsDirty None asserted), so the
        /// AddItem is the ONLY thing that can board it — no boot rescan, no unrelated dirty flag.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): in <c>Simulation.AddItem</c>, set
        /// <c>JobBoardDirty.Citizens</c> instead of <c>JobBoardDirty.Items</c>. Haul's item derivation
        /// is gated on <c>Items | Tiles</c>, so a Citizens-only rescan never re-boards the stack, the
        /// idle citizen is offered nothing, and the HaulPickup assertion fails.
        /// </summary>
        [Test]
        public void AnItemOnlyAddItem_BoardsTheStackAndYieldsARealHaulAssignment()
        {
            var sim = NewTieShip(out _);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true); // a haul destination exists

            // Settle to steady state: no items, no dig/build, so the idle citizen takes nothing and
            // the board goes clean. This is the precondition that makes the AddItem the sole trigger.
            for (int t = 0; t < 5; t++) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "precondition: nothing to do yet, citizen idle");
            Assert.That(sim.JobsDirty, Is.EqualTo(JobBoardDirty.None),
                "precondition: the board is clean — the AddItem below is the ONLY thing that can dirty it");

            // The one item-only change under test: a haulable stack drops within reach. Deliberately
            // NOT asserting which flag AddItem set — that would recompute the subject and let a flag
            // typo die on an equality check instead of on the behaviour it corrupts. The mutation
            // (AddItem sets Citizens) must be caught by the ASSIGNMENT below, not by a flag readout.
            var stack = sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            // Path reached: the shipped Haul source rebuilt its board across the partial rescan and
            // produced a real pickup of exactly the stack that dropped. THIS is the canary — under
            // the wrong-flag mutation the stack never boards and the citizen stays idle here.
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.HaulPickup),
                "an item-only AddItem must still board the stack and yield a haul — the missed-rescan canary");
            Assert.That(worker.ReservedItemId, Is.EqualTo(stack.Id),
                "…and the job targets the exact stack the AddItem created");
        }

        // ------------------------------------------------------------------ zero-alloc

        /// <summary>
        /// A FULL RESCAN every tick, on a board where EVERY source has candidates, must not
        /// allocate. The existing zero-alloc tests all measure a steady state where nothing is
        /// dirty, so none of them walks the dispatcher's shared world pass or any source's board
        /// rebuild — which is exactly the code W0-4 moved.
        ///
        /// The setup is deliberate so the measured window really REACHES it: the citizen holds
        /// position (so no assignment, no FindPath, and none of pathing's own allocation is in
        /// the window), JobsDirty is re-set after every tick, and EVERY board is asserted
        /// non-empty through <see cref="IJobSource.CandidateCount"/> before the counter starts.
        /// The count is read from <c>Sources.Count</c> rather than hard-coded, and the per-board
        /// loop is what makes a newly registered source join this guarantee automatically — E0-5
        /// added the fourth (Deconstruct) and had to populate its board to keep the precondition
        /// true, which is the intended friction.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): in <c>DigJobSource</c>, drop the
        /// <c>readonly</c> from the <c>_sites</c> field — it will not compile otherwise (CS0191) —
        /// and allocate a fresh list per rescan in <c>BeginTileScan</c>
        /// (<c>_sites = new List&lt;Int3&gt;(64)</c> instead of <c>_sites.Clear()</c>). Measured:
        /// 2 472 000 bytes over the window.
        /// </summary>
        [Test]
        public void FullRescanEveryTick_WithEveryBoardPopulated_IsZeroAlloc()
        {
            var sim = NewTieShipWithDeconstruct(out var build, out var strip);
            var idle = sim.AddCitizen("Held", new Int3(5, 2, 0)).GiveAllWork();
            idle.HoldPosition = true; // never self-assigns: the rescan is the only path measured

            Debris(sim, new Int3(3, 2, 0));                                    // dig board
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true);   // haul destination
            sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));                 // haul candidate
            Assert.That(build.Designate(sim, new Int3(7, 1, 0), BuildKind.Wall), Is.True); // build board
            sim.AddItem(ItemKind.Regolith, 4, new Int3(6, 3, 0));              // free material to count
            // Deconstruct board: an interior wall raised mid-map, so it is not the (hull) map edge.
            sim.World.SetWall(new Int3(2, 3, 0), TileDefs.Wall);
            Assert.That(strip.Designate(sim, new Int3(2, 3, 0), DeconstructKind.Wall), Is.True);

            JobSystem jobs = null;
            foreach (var s in sim.Systems) if (s is JobSystem j) { jobs = j; break; }
            Assert.That(jobs, Is.Not.Null);

            for (int i = 0; i < 50; i++) { sim.JobsDirty = JobBoardDirty.All; sim.Tick(); } // warm up every collection

            Assert.That(jobs.Sources.Count, Is.EqualTo(4), "precondition: every shipped source is registered");
            for (int i = 0; i < jobs.Sources.Count; i++)
                Assert.That(jobs.Sources[i].CandidateCount, Is.GreaterThan(0),
                    $"precondition: the {jobs.Sources[i].Name} board is populated, so its rescan does real work");
            Assert.That(idle.JobKind, Is.EqualTo(JobKind.None), "precondition: the held citizen never took a job");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) { sim.JobsDirty = JobBoardDirty.All; sim.Tick(); }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"a dirty-every-tick job board must rescan without allocating, saw {delta} bytes");
        }

        /// <summary>
        /// The SELECTION side: the cross-source argmin and a refused claim, every tick, allocation
        /// free. The rescan test above holds citizens back so it never reaches
        /// <see cref="IJobSource.Select"/> or <see cref="IJobSource.TryClaim"/>, and no
        /// pre-existing zero-alloc test reaches them either — so without this the interface
        /// dispatch W0-4 introduced is simply unmeasured. (It is fine: measured 0 bytes. The point
        /// is that nothing was holding it there.)
        ///
        /// Reaching a REFUSED claim without allocating needs an unreachable candidate that costs
        /// no pathfinding, so the second dig site is walled in on all four sides: no walkable
        /// 4-neighbour means <c>TryPathToAdjacent</c> declines before it ever calls FindPath.
        /// The refusal then backs the site off for 50 ticks, so the window holds ~60 real
        /// <c>TryClaim</c> calls and 3000 full three-source selection passes.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): in <c>JobSystem.TryAssign</c>,
        /// build the source loop over <c>Sources</c> (the <c>IReadOnlyList</c>) with
        /// <c>foreach</c> instead of indexing the <c>IJobSource[]</c> — the interface enumerator
        /// is a heap allocation per pass.
        /// </summary>
        [Test]
        public void CrossSourceSelectionAndARefusedClaim_AreZeroAlloc()
        {
            // Row 5 is solid hull, so a debris tile in it has no walkable neighbour at all.
            var walledIn = new[]
            {
                "###########",
                "#.........#",
                "#.........#",
                "#.........#",
                "###########",
                "###########",
            };
            var build = new BuildSystem();
            var sim = new Simulation(AsciiWorld.Build(walledIn), 41,
                new ISimSystem[] { new JobSystem(), build });

            // A digger who never finishes: he is assigned, then never walks (no CitizenSystem in
            // this stack), so he holds the reachable site in the assigned set forever.
            var pinned = sim.AddCitizen("Pinned", new Int3(5, 2, 0)).GiveAllWork();
            Debris(sim, new Int3(6, 2, 0));
            // …and an idle second citizen who is offered the unreachable one every tick.
            var seeker = sim.AddCitizen("Seeker", new Int3(4, 2, 0)).GiveAllWork();
            Debris(sim, new Int3(5, 5, 0));
            // A needy site with no free material keeps the build board populated but gated shut.
            Assert.That(build.Designate(sim, new Int3(8, 1, 0), BuildKind.Wall), Is.True);

            JobSystem jobs = null;
            foreach (var s in sim.Systems) if (s is JobSystem j) { jobs = j; break; }

            for (int i = 0; i < 200; i++) sim.Tick(); // warm up: assignment, dictionaries, stamps

            Assert.That(pinned.JobKind, Is.EqualTo(JobKind.Dig), "precondition: the digger is pinned on a job");
            Assert.That(pinned.HasPath, Is.True, "precondition: …and never arrives, so he holds it");
            Assert.That(seeker.JobKind, Is.EqualTo(JobKind.None), "precondition: the seeker never gets work");
            // Keyed by name, not position: a registration REORDER is not this test's business, and
            // asserting Sources[0]/Sources[2] would redden it with an allocation-flavoured message
            // for a tie-break change. Sources[i].Name keeps the failure honest.
            Assert.That(CountFor(jobs, "Dig"), Is.EqualTo(2), "precondition: two dig candidates");
            Assert.That(CountFor(jobs, "Build"), Is.EqualTo(1), "precondition: a build candidate too");
            Assert.That(sim.JobsDirty, Is.EqualTo(JobBoardDirty.None), "precondition: steady state — the rescan is NOT in this window");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"the cross-source argmin and a refused claim must not allocate, saw {delta} bytes");
        }

        // --------------------------------------------------------------- the registration

        /// <summary>
        /// The registration order, stated once where a reviewer can see it. Documentation-grade
        /// on its own — it restates <c>JobSystem.DefaultSources()</c> — but it turns a silent
        /// reorder into a named failure right beside the behavioural tests that explain WHY the
        /// order matters, and it pins that the shipped three do not overlap on a
        /// <see cref="JobKind"/>. It does NOT pin the constructor's duplicate-claim throw; that is
        /// <see cref="TwoSourcesClaimingTheSameJobKind_AreRejectedAtRegistration"/>'s job.
        /// NAMED MUTATION: any reorder of <c>DefaultSources()</c>.
        ///
        /// E0-5 APPENDED Deconstruct LAST, which is the safe default this file's header describes:
        /// at an exact distance tie it loses to dig, haul and build, so no recorded assignment
        /// sequence above could move.
        /// </summary>
        [Test]
        public void ShippedSourceRegistration_IsDigThenHaulThenBuildThenDeconstruct_AndCoversEveryDispatchedKind()
        {
            var jobs = new JobSystem();
            var names = new List<string>();
            for (int i = 0; i < jobs.Sources.Count; i++) names.Add(jobs.Sources[i].Name);
            Assert.That(names, Is.EqualTo(new[] { "Dig", "Haul", "Build", "Deconstruct" }));

            var claimed = new List<JobKind>();
            for (int i = 0; i < jobs.Sources.Count; i++) claimed.AddRange(jobs.Sources[i].HandledKinds);
            Assert.That(claimed, Is.EquivalentTo(new[]
            {
                JobKind.Dig, JobKind.HaulPickup, JobKind.HaulDeliver, JobKind.HaulToBuild, JobKind.Build,
                JobKind.Deconstruct,
            }), "every kind the dispatcher drives has exactly one owner");
        }

        /// <summary>
        /// Two sources claiming one <see cref="JobKind"/> is rejected at construction, naming both.
        /// Silently keeping the last registration would give that kind's citizens a progress
        /// handler that never assigned them and boards that never see their reservations — a
        /// deadlock that looks like idle crew. The dispatcher's kind→source table is the only
        /// place this is detectable, and it is exactly the mistake a lane adding a fourth source
        /// makes when it copies an existing provider.
        /// NAMED MUTATION (applied, observed failing, reverted): delete the duplicate check in the
        /// <c>JobSystem(IJobSource[])</c> constructor — this test then passes silently.
        /// </summary>
        [Test]
        public void TwoSourcesClaimingTheSameJobKind_AreRejectedAtRegistration()
        {
            Assert.That(new JobSystem(new IJobSource[] { new DigJobSource() }).Sources.Count,
                Is.EqualTo(1), "precondition: a single-source stack registers fine");

            var ex = Assert.Throws<InvalidOperationException>(
                () => new JobSystem(new IJobSource[] { new DigJobSource(), new DigJobSource() }));
            Assert.That(ex.Message, Does.Contain("Dig"), "the message names the contested kind");
        }

        // ------------------------------------------------- the cross-source reservation channel

        // A long bay: the material and the stockpile at one end, the build site at the other, so
        // one citizen's nearest job is a stockpile haul and another's is the site.
        private static readonly string[] ReservationMap =
        {
            "##############",
            "#............#",
            "#............#",
            "#............#",
            "##############",
        };

        private static readonly Int3 FarSite = new Int3(11, 1, 0);

        /// <summary>
        /// Builds the reservation scenario: a wall site at the far end needing exactly the two
        /// units aboard, both loose at the near end, a stockpile zone so stockpile hauling is a
        /// live alternative, and a citizen placed at each end.
        /// </summary>
        private static Simulation NewReservationShip(out BuildSystem build, bool withNearHauler)
        {
            build = new BuildSystem();
            var sim = new Simulation(AsciiWorld.Build(ReservationMap), 23,
                new ISimSystem[] { new JobSystem(), build });
            // Store order is insertion order, and the dispatcher offers work in store order, so
            // the near hauler MUST be added first — he is the one who takes a unit mid-pass.
            if (withNearHauler) sim.AddCitizen("Near", new Int3(2, 2, 0)).GiveAllWork();
            sim.AddCitizen("Far", new Int3(10, 2, 0)).GiveAllWork();
            sim.World.SetFlag(new Int3(1, 3, 0), TileFlags.Stockpile, true);
            Assert.That(build.Designate(sim, FarSite, BuildKind.Wall), Is.True);
            sim.AddItem(ItemKind.Regolith, 1, new Int3(2, 1, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(3, 1, 0));
            return sim;
        }

        /// <summary>
        /// THE CROSS-SOURCE RESERVATION CHANNEL, which is the one piece of coupling W0-4 promoted
        /// from an inline field write into a public interface method
        /// (<see cref="JobContext.ReserveGroundItem"/> → <see cref="IJobSource.OnGroundItemReserved"/>).
        ///
        /// The scenario is the only one that can see it: TWO citizens assigned in ONE board pass.
        /// The board is rebuilt on <see cref="Simulation.JobsDirty"/>, never between citizens, so
        /// the build source's free-material count is only correct for the second citizen if the
        /// first citizen's stockpile haul told it a unit had gone. The site needs both units
        /// aboard; once one is spoken for it must NOT be offered, because
        /// <see cref="BuildSystem.Deposit"/> has no inverse and a half-materialed site is dead.
        ///
        /// The control leg is what makes this non-tautological: with the near hauler absent the
        /// far citizen DOES take <see cref="JobKind.HaulToBuild"/> from the identical board, so a
        /// failure of the main leg cannot be blamed on the site being unreachable, unfunded or
        /// out-ranked.
        ///
        /// NAMED MUTATIONS (both applied, both observed failing, both reverted) — either one
        /// disables the channel completely, and before this test both passed the entire suite:
        ///   (a) make <c>BuildJobSource.OnGroundItemReserved</c> a no-op;
        ///   (b) in <c>HaulJobSource.TryClaim</c>, replace <c>ctx.ReserveGroundItem(sim, citizen, item)</c>
        ///       with a direct <c>item.ReservedBy = citizen.Id</c>, skipping the fan-out.
        /// </summary>
        [Test]
        public void AStockpileHaulTakenMidPass_RemovesTheUnitsFromTheBuildSourcesFreePool()
        {
            // --- control: nobody competes for the material, so the site IS offerable ---
            var control = NewReservationShip(out var controlBuild, withNearHauler: false);
            Assert.That(controlBuild.TryGet(FarSite, out var site), Is.True);
            Assert.That(site.Required, Is.EqualTo(2), "precondition: the wall wants both units aboard");
            var loneFar = control.Citizens.Items[0];
            for (int t = 0; t < 5 && loneFar.JobKind == JobKind.None; t++) control.Tick();
            Assert.That(loneFar.JobKind, Is.EqualTo(JobKind.HaulToBuild),
                "control: with the whole pool free, the site is offered");
            Assert.That(loneFar.JobTarget, Is.EqualTo(FarSite));

            // --- the real case: a nearer citizen takes one unit for the stockpile FIRST ---
            var sim = NewReservationShip(out _, withNearHauler: true);
            var near = sim.Citizens.Items[0];
            var far = sim.Citizens.Items[1];

            for (int t = 0; t < 5 && near.JobKind == JobKind.None; t++) sim.Tick();

            // Assert the path was REACHED: the near citizen really did take a stockpile haul of a
            // build-material stack, in the same pass the far citizen was considered.
            Assert.That(near.JobKind, Is.EqualTo(JobKind.HaulPickup),
                "precondition: the near citizen took a stockpile haul, not something else");
            Assert.That(sim.Items.TryGet(near.ReservedItemId, out var taken), Is.True);
            Assert.That(taken.Kind, Is.EqualTo(BuildSystem.Material),
                "precondition: what he took is build material, so the pool really shrank");

            // Positive, not `Is.Not.EqualTo(HaulToBuild)`: a negative would also pass if Far simply
            // went idle, which is a plausible future regression and the opposite of the point. The
            // fixture deterministically leaves him the far stack to fetch for the stockpile.
            Assert.That(far.JobKind, Is.EqualTo(JobKind.HaulPickup),
                "the site must not be promised units a hauler already took in the same pass — " +
                "nothing un-deposits, so a half-materialed site is dead forever; Far takes the " +
                "remaining stack for the stockpile instead");
        }

        // ------------------------------------------------- the dispatcher defends the argmin

        /// <summary>A source that reports a distance it did not beat — the running minimum is
        /// threaded THROUGH the providers, so this is a source raising the bar for everyone
        /// registered after it. Claims <see cref="JobKind.Maintain"/> so a win is unmistakable.</summary>
        private sealed class LiesAboutDistanceJobSource : IJobSource
        {
            private static readonly JobKind[] Kinds = { JobKind.Maintain };
            public string Name => "Liar";
            public JobKind[] HandledKinds => Kinds;
            public int CandidateCount => 1;
            public void BeginTick(Simulation sim) { }
            public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what) { }
            public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
            {
                dist = bestDist;  // EQUAL, never strictly better — the contract forbids returning this
                return 0;
            }
            public bool TryClaim(Simulation sim, Citizen citizen, int c, long gen, JobContext ctx)
            {
                citizen.JobKind = JobKind.Maintain;
                return true;
            }
            public void Progress(Simulation sim, Citizen citizen, JobContext ctx) { }
            public void OnGroundItemReserved(Simulation sim, ItemStack item) { }
            // A test double keeps no backoff map: it never stamps one, so it can never be inside
            // one. Written out per double rather than defaulted on the interface — a source that
            // silently answered "never backed off" would put a hole in the `blocked` channel, and
            // the compiler asking the question is the point (IJobSource.IsBackedOff).
            public bool IsBackedOff(Int3 pos, long tick, out long untilTick) { untilTick = 0; return false; }
        }

        /// <summary>
        /// The dispatcher ENFORCES the argmin rather than trusting a source to honour it. A source
        /// returning a distance that is not strictly better must be declined, not allowed to
        /// overwrite the running best — otherwise it both steals the job and corrupts the
        /// filtering handed to every source after it.
        ///
        /// This is a different layer from the tie-break tests above: those check that the shipped
        /// sources use strict <c>&lt;</c> internally; this checks what happens when one does not.
        /// It matters because three lanes are about to write sources the integrator will not read
        /// line by line, and an equal-distance return is the natural off-by-one.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): delete <c>|| d >= bestDist</c>
        /// from <c>JobSystem.TryAssign</c> — the liar wins and the citizen ends up on
        /// <see cref="JobKind.Maintain"/>.
        /// </summary>
        [Test]
        public void ASourceReportingANonImprovingDistance_IsDeclinedByTheDispatcher()
        {
            var sim = new Simulation(AsciiWorld.Build(TieMap), 37,
                new ISimSystem[]
                {
                    new JobSystem(new IJobSource[] { new DigJobSource(), new LiesAboutDistanceJobSource() }),
                });
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            Debris(sim, new Int3(3, 2, 0));

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.Not.EqualTo(JobKind.None), "precondition: he took SOMETHING");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Dig),
                "the honest source's strictly-nearer candidate must win over an equal-distance claim");
            Assert.That(worker.JobTarget, Is.EqualTo(new Int3(3, 2, 0)));
        }

        // ----------------------------------------------------------- the provider hang guard

        /// <summary>A deliberately broken source: it always offers candidate 0 and always refuses
        /// it, stamping nothing and backing off nothing — the exact mistake
        /// <see cref="IJobSource.TryClaim"/> warns about. Un-guarded, this spins forever inside one
        /// <c>Tick</c> with no exception and no log; measured on the pre-guard build, the test host
        /// ran past 120 s and had to be killed.</summary>
        private sealed class NeverStampsJobSource : IJobSource
        {
            private static readonly JobKind[] Kinds = { JobKind.Dig };
            public string Name => "NeverStamps";
            public JobKind[] HandledKinds => Kinds;
            public int CandidateCount => 1;
            public void BeginTick(Simulation sim) { }
            public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what) { }
            public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
            {
                dist = 1;
                return bestDist > 1 ? 0 : -1;
            }
            public bool TryClaim(Simulation sim, Citizen citizen, int c, long gen, JobContext ctx) => false;
            public void Progress(Simulation sim, Citizen citizen, JobContext ctx) { }
            public void OnGroundItemReserved(Simulation sim, ItemStack item) { }
            // A test double keeps no backoff map: it never stamps one, so it can never be inside
            // one. Written out per double rather than defaulted on the interface — a source that
            // silently answered "never backed off" would put a hole in the `blocked` channel, and
            // the compiler asking the question is the point (IJobSource.IsBackedOff).
            public bool IsBackedOff(Int3 pos, long tick, out long untilTick) { untilTick = 0; return false; }
        }

        /// <summary>
        /// A source that refuses a candidate without stamping it must make the dispatcher THROW,
        /// naming it — not hang. The bound is the total candidate count plus one, which every
        /// conforming source stays under because each refusal consumes a candidate.
        ///
        /// This is the guard that protects the integrator-owned file from a provider three lanes
        /// are about to write, and it is the only failure mode in this package that is worse than
        /// a wrong answer: a hung tick loop produces no exception, no log line and no frame.
        ///
        /// NAMED MUTATION (applied, observed, reverted): restore the unbounded <c>while (true)</c>
        /// in <c>JobSystem.TryAssign</c> — this test then never returns and the test host has to be
        /// killed rather than reporting a failure.
        /// </summary>
        [Test]
        [Timeout(20000)]
        public void ASourceThatRefusesWithoutStamping_ThrowsNamingItself_InsteadOfHanging()
        {
            var sim = new Simulation(AsciiWorld.Build(TieMap), 31,
                new ISimSystem[] { new JobSystem(new IJobSource[] { new NeverStampsJobSource() }) });
            sim.AddCitizen("Worker", new Int3(5, 2, 0)).GiveAllWork();
            sim.JobsDirty = JobBoardDirty.All;

            var ex = Assert.Throws<InvalidOperationException>(() => sim.Tick());
            Assert.That(ex.Message, Does.Contain("NeverStamps"), "the message names the offending source");
            Assert.That(ex.Message, Does.Contain("stamping"), "and says what it failed to do");
            Assert.That(ex.Message, Does.Contain("CandidateCount"), "and offers the other diagnosis");
        }
    }
}
