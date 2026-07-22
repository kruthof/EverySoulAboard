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

        private static void Debris(Simulation sim, Int3 p)
        {
            sim.World.SetWall(p, TileDefs.Debris);
            sim.World.SetFlag(p, TileFlags.Designated, true);
            sim.JobsDirty = true;
        }

        // ------------------------------------------------- the recorded assignment sequence

        /// <summary>
        /// The first 40 job assignments on the eight-crew slice with a wall designated at boot,
        /// verbatim. This is the reordering canary: it exercises all four shipped job kinds
        /// through the REAL dispatcher and asserts the observable (tick, citizen, kind, target)
        /// sequence rather than recomputing it.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): flip <c>DigJobSource.Select</c>'s
        /// argmin from <c>&lt;</c> to <c>&lt;=</c> — the sequence diverges (measured: it does,
        /// inside the aft dig field, where equidistant sites are common).
        ///
        /// MEASURED LIMIT, stated because it matters: swapping the Dig and Haul REGISTRATIONS
        /// does NOT move this sequence. Nowhere in these first forty assignments is a dig site
        /// exactly as far from a citizen as a haul item, so the cross-source tie never arises on
        /// the slice. That mutation is caught by <see cref="EqualDistance_DigBeatsHaul"/> instead.
        /// A recorded sequence is a good canary and a bad proof; the constructed ties below are
        /// the proof.
        ///
        /// This is a BEHAVIOUR PIN, like a golden: any lane that deliberately changes labour
        /// assignment (E0-1 recruitability, E0-2 work rates, a new job source) will move it,
        /// and must re-record it in the same commit and say why. It must never be re-recorded
        /// to make a red build green.
        /// </summary>
        private static readonly string[] SliceAssignments =
        {
            "t31 c939 HaulPickup 29,6,0",
            "t68 c939 HaulToBuild 30,10,0",
            "t81 c932 HaulPickup 19,13,0",
            "t91 c933 HaulPickup 29,6,0",
            "t101 c936 Dig 57,9,0",
            "t144 c939 HaulToBuild 30,10,0",
            "t146 c934 HaulPickup 31,6,0",
            "t151 c935 HaulPickup 32,6,0",
            "t176 c936 HaulPickup 57,9,0",
            "t186 c938 Dig 58,9,0",
            "t205 c939 Build 30,10,0",
            "t226 c937 HaulPickup 32,6,0",
            "t257 c932 HaulPickup 32,6,0",
            "t266 c939 HaulPickup 31,6,0",
            "t267 c933 HaulPickup 31,6,0",
            "t353 c932 Dig 57,10,0",
            "t353 c933 Dig 57,8,0",
            "t403 c935 Dig 58,10,0",
            "t427 c937 Dig 58,8,0",
            "t533 c932 Dig 57,7,0",
            "t533 c933 Dig 59,9,0",
            "t550 c938 Dig 57,11,0",
            "t616 c932 Dig 57,6,0",
            "t616 c933 Dig 58,7,0",
            "t616 c935 Dig 59,8,0",
            "t632 c936 Dig 60,9,0",
            "t681 c932 Dig 59,10,0",
            "t681 c935 Dig 58,11,0",
            "t691 c933 Dig 58,6,0",
            "t722 c939 Dig 59,7,0",
            "t726 c934 Dig 60,8,0",
            "t751 c935 Dig 59,11,0",
            "t756 c933 Dig 58,12,0",
            "t816 c935 Dig 60,11,0",
            "t846 c933 Dig 57,12,0",
            "t881 c935 Dig 59,12,0",
            "t911 c933 Dig 58,13,0",
            "t937 c936 Dig 61,9,0",
            "t951 c935 Dig 60,12,0",
            "t972 c933 Dig 57,13,0",
        };

        [Test]
        public void SliceAssignmentSequence_FirstFortyJobs_IsUnchangedByTheDispatcherSplit()
        {
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;
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
            sim.JobsDirty = true;

            var log = RecordAssignments(sim, 4000, 40);

            // Assert the paths were REACHED before asserting the order.
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
        /// NAMED MUTATION: register Haul before Dig, or flip the haul scan to <c>&lt;=</c> —
        /// the citizen takes HaulPickup and this fails.
        /// </summary>
        [Test]
        public void EqualDistance_DigBeatsHaul()
        {
            var sim = NewTieShip(out _);
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0));
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
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0));
            sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 2, 0));       // 2 west
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true);
            Assert.That(build.Designate(sim, new Int3(7, 2, 0), BuildKind.Wall), Is.True); // 2 east
            // Fund the site fully so it boards as READY (no material haul in the way).
            Assert.That(build.TryGet(new Int3(7, 2, 0), out var site), Is.True);
            Assert.That(build.Deposit(sim, new Int3(7, 2, 0), site.Required), Is.EqualTo(site.Required));
            sim.JobsDirty = true;

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
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0));
            var ready = new Int3(7, 2, 0);
            var needy = new Int3(3, 2, 0);
            Assert.That(build.Designate(sim, ready, BuildKind.Wall), Is.True);
            Assert.That(build.Designate(sim, needy, BuildKind.Wall), Is.True);
            Assert.That(build.TryGet(ready, out var r), Is.True);
            Assert.That(build.Deposit(sim, ready, r.Required), Is.EqualTo(r.Required));
            sim.AddItem(ItemKind.Regolith, r.Required, new Int3(5, 3, 0)); // funds the needy site too
            sim.JobsDirty = true;

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
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0));
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
            var worker = sim.AddCitizen("Worker", new Int3(5, 2, 0));
            sim.World.SetFlag(new Int3(5, 3, 0), TileFlags.Stockpile, true);
            var first = sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));
            var second = sim.AddItem(ItemKind.Scrap, 1, new Int3(3, 2, 0));
            Assert.That(first.Id, Is.LessThan(second.Id), "precondition: insertion order is id order");

            for (int t = 0; t < 5 && worker.JobKind == JobKind.None; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.EqualTo(JobKind.HaulPickup), "precondition: he took a haul");
            Assert.That(worker.ReservedItemId, Is.EqualTo(first.Id));
        }

        // ------------------------------------------------------------------ zero-alloc

        /// <summary>
        /// A FULL RESCAN every tick, on a board where all three sources have candidates, must not
        /// allocate. The existing zero-alloc tests all measure a steady state where nothing is
        /// dirty, so none of them walks the dispatcher's shared world pass or any source's board
        /// rebuild — which is exactly the code W0-4 moved.
        ///
        /// The setup is deliberate so the measured window really REACHES it: the citizen holds
        /// position (so no assignment, no FindPath, and none of pathing's own allocation is in
        /// the window), JobsDirty is re-set after every tick, and all three boards are asserted
        /// non-empty through <see cref="IJobSource.HasCandidates"/> before the counter starts.
        ///
        /// NAMED MUTATION (applied, observed failing, reverted): allocate a fresh list per rescan
        /// in <c>DigJobSource.BeginTileScan</c> (<c>_sites = new List&lt;Int3&gt;()</c> instead of
        /// <c>_sites.Clear()</c>) — 3000 rescans then show ~100 KB.
        /// </summary>
        [Test]
        public void FullRescanEveryTick_WithAllThreeBoardsPopulated_IsZeroAlloc()
        {
            var sim = NewTieShip(out var build);
            var idle = sim.AddCitizen("Held", new Int3(5, 2, 0));
            idle.HoldPosition = true; // never self-assigns: the rescan is the only path measured

            Debris(sim, new Int3(3, 2, 0));                                    // dig board
            sim.World.SetFlag(new Int3(5, 1, 0), TileFlags.Stockpile, true);   // haul destination
            sim.AddItem(ItemKind.Scrap, 1, new Int3(7, 2, 0));                 // haul candidate
            Assert.That(build.Designate(sim, new Int3(7, 1, 0), BuildKind.Wall), Is.True); // build board
            sim.AddItem(ItemKind.Regolith, 4, new Int3(6, 3, 0));              // free material to count

            JobSystem jobs = null;
            foreach (var s in sim.Systems) if (s is JobSystem j) { jobs = j; break; }
            Assert.That(jobs, Is.Not.Null);

            for (int i = 0; i < 50; i++) { sim.JobsDirty = true; sim.Tick(); } // warm up every collection

            Assert.That(jobs.Sources.Count, Is.EqualTo(3), "precondition: the shipped three sources");
            for (int i = 0; i < jobs.Sources.Count; i++)
                Assert.That(jobs.Sources[i].HasCandidates, Is.True,
                    $"precondition: the {jobs.Sources[i].Name} board is populated, so its rescan does real work");
            Assert.That(idle.JobKind, Is.EqualTo(JobKind.None), "precondition: the held citizen never took a job");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) { sim.JobsDirty = true; sim.Tick(); }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"a dirty-every-tick job board must rescan without allocating, saw {delta} bytes");
        }

        // --------------------------------------------------------------- the registration

        /// <summary>
        /// The registration order, stated once where a reviewer can see it. Documentation-grade
        /// on its own — it restates <c>JobSystem.DefaultSources()</c> — but it turns a silent
        /// reorder into a named failure right beside the behavioural tests that explain WHY the
        /// order matters, and it pins that no two sources claim the same
        /// <see cref="JobKind"/> (the constructor throws) and that every shipped kind has an
        /// owner.
        /// </summary>
        [Test]
        public void ShippedSourceRegistration_IsDigThenHaulThenBuild_AndCoversEveryDispatchedKind()
        {
            var jobs = new JobSystem();
            var names = new List<string>();
            for (int i = 0; i < jobs.Sources.Count; i++) names.Add(jobs.Sources[i].Name);
            Assert.That(names, Is.EqualTo(new[] { "Dig", "Haul", "Build" }));

            var claimed = new List<JobKind>();
            for (int i = 0; i < jobs.Sources.Count; i++) claimed.AddRange(jobs.Sources[i].HandledKinds);
            Assert.That(claimed, Is.EquivalentTo(new[]
            {
                JobKind.Dig, JobKind.HaulPickup, JobKind.HaulDeliver, JobKind.HaulToBuild, JobKind.Build,
            }), "every kind the dispatcher drives has exactly one owner");
        }
    }
}
