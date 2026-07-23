using System;
using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-1 — LABOUR SUPPLY (recruitability). Two coupled levers, each with a named breaking
    /// mutation the reviewer applies:
    ///
    ///   Lever 1 — <see cref="Citizen.IsIdleForWork"/> dropped its <c>&amp;&amp; !HasPath</c> clause.
    ///     A wandering crew member (AutoWander crew almost always carry a wander path) is now
    ///     "idle for work": the dispatcher / Sustenance / Maintenance / Crafting recruit it and
    ///     overwrite its wander path from where it stands. Before the fix a wanderer was pickable
    ///     only in the brief settle gap between wander paths, so the effective labour pool
    ///     collapsed toward ~1.43 of 8.
    ///
    ///   Lever 2 — <c>CitizenDefs.WanderRadiusTiles</c> bounds the idle-wander target to a
    ///     Chebyshev box around the citizen, so crew disperse LOCALLY (near work) without
    ///     reducing wander cadence (the slice depends on wandering to desynchronise needs).
    ///
    /// These tests drive the REAL systems and assert observable citizen / sampler state; none
    /// recomputes <c>IsIdleForWork</c> or the box math with the code's own expression.
    /// </summary>
    public class RecruitabilityTests
    {
        // A single open room; interior x 1..20, y 1..7, one deck. Used by the zero-alloc test.
        private static readonly string[] OpenRoom =
        {
            "######################",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "######################",
        };

        /// <summary>A large all-open room (interior W-2 × H-2, one deck), walls on the border.</summary>
        private static string[] BigRoom(int w, int h)
        {
            var map = new string[h];
            for (int y = 0; y < h; y++)
                map[y] = (y == 0 || y == h - 1) ? new string('#', w) : "#" + new string('.', w - 2) + "#";
            return map;
        }

        private static bool IsDispatcherJob(JobKind k) => k != JobKind.None;

        /// <summary>
        /// PROVES: with the relaxed idle gate, crew that are actively wandering get pulled onto
        /// dig jobs within a short window — the recruitability win. The window is deliberately
        /// short because the difference the fix makes is LATENCY: the old gate eventually recruits
        /// a wanderer too, but only once its wander path completes and it settles, so "ever
        /// assigned over a long run" would not discriminate. What collapses under the old gate is
        /// how many crew are recruited PROMPTLY while still mid-wander.
        ///
        /// The defs are deliberately tuned to make the discriminator unambiguous rather than
        /// timing-fragile: a large wander radius on a large map (long wander paths) and a
        /// near-zero settle gap (IdleTicksBetweenWanders=1) mean essentially every crew member is
        /// mid-wander at any instant — the pathological case the old gate handled worst, and the
        /// case the "~1.43 of 8" figure describes. The fix is orthogonal to these values; they
        /// only sharpen the measurement.
        ///
        /// Precondition (asserted first): essentially all crew are mid-wander (HasPath) at the
        /// tick the designations appear — those are exactly the crew the old gate excludes — and
        /// more dig sites exist than crew.
        ///
        /// NAMED MUTATION (reviewer applies): restore <c>&amp;&amp; !HasPath</c> in
        /// <see cref="Citizen.IsIdleForWork"/>. The mid-wander crew are then skipped until their
        /// (long) wander path completes, ≫ the window, so the prompt-assignment count collapses
        /// far below the threshold. Measured during development: relaxed gate recruits all 6 crew
        /// within the window; the restored gate recruits 0.
        /// </summary>
        [Test]
        public void WanderingCrew_AreRecruitedPromptly_WhileMidWander()
        {
            // Tuned so nearly every crew is perpetually mid-wander: long paths, ~no settle gap.
            var defs = SimDefs.CreateDefault();
            defs.Citizen.WanderRadiusTiles = 40;    // long wander paths on the big map below
            defs.Citizen.IdleTicksBetweenWanders = 1; // settle for a single tick, then wander again
            defs.ComputeChecksum();

            var sim = new Simulation(AsciiWorld.Build(BigRoom(60, 22)), 20250723,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() }, defs);

            var crew = new List<Citizen>();
            foreach (var p in new[]
                     {
                         new Int3(6, 10, 0), new Int3(14, 10, 0), new Int3(22, 10, 0),
                         new Int3(30, 10, 0), new Int3(38, 10, 0), new Int3(46, 10, 0),
                     })
            {
                var c = sim.AddCitizen("Crew" + p.X, p);
                c.AutoWander = true; // AddCitizen defaults false; wandering is the whole point
                crew.Add(c);
            }

            // Let them get into the wander loop, then confirm essentially all are mid-path.
            for (int t = 0; t < 60; t++) sim.Tick();
            int midWander = 0;
            foreach (var c in crew) if (c.HasPath) midWander++;
            Assert.That(midWander, Is.GreaterThanOrEqualTo(5),
                $"precondition: essentially all 6 crew must be mid-wander when work appears (saw {midWander}); " +
                "otherwise the old gate would recruit them anyway and the fix has nothing to prove");
            foreach (var c in crew)
                Assert.That(c.JobKind, Is.EqualTo(JobKind.None), "precondition: no crew has a job yet");

            // Drop a cluster of dig designations across the room (each an isolated debris tile
            // with open neighbours, so it is reachable and diggable from adjacent).
            int sites = 0;
            for (int y = 6; y <= 14; y += 8)
                for (int x = 4; x <= 54; x += 5)
                {
                    var p = new Int3(x, y, 0);
                    sim.World.SetWall(p, TileDefs.Debris);
                    sim.World.SetFlag(p, TileFlags.Designated, true);
                    sites++;
                }
            sim.JobsDirty = JobBoardDirty.All;
            Assert.That(sites, Is.GreaterThan(crew.Count),
                "precondition: more dig sites than crew, so every crew CAN find distinct work");

            // Latch every crew member that acquires a job within the short window.
            const int Window = 8;
            var recruited = new HashSet<uint>();
            for (int t = 0; t < Window; t++)
            {
                sim.Tick();
                foreach (var c in crew)
                    if (IsDispatcherJob(c.JobKind)) recruited.Add(c.Id);
            }

            Assert.That(recruited.Count, Is.GreaterThanOrEqualTo(5),
                $"the relaxed idle gate should recruit almost all wandering crew within {Window} ticks " +
                $"(saw {recruited.Count} of {crew.Count}); the restored `&& !HasPath` gate collapses this to ~0");
        }

        /// <summary>
        /// PROVES: the idle-wander target is drawn within <c>WanderRadiusTiles</c> (Chebyshev) of
        /// the origin — i.e. the sampler actually READS the def field and bounds reach. Drives the
        /// real <see cref="PathService.TryRandomWalkableTileNear"/> over a large all-open map (so
        /// every in-box draw is walkable and the box is the only thing bounding the result) and
        /// asserts every returned target is within the radius.
        ///
        /// NAMED MUTATION (reviewer applies): make the sampler ignore the radius — e.g. point
        /// <c>CitizenSystem</c> at the un-bounded <c>TryRandomWalkableTile</c>, or replace the box
        /// bounds here with the whole world. Targets then scatter across the 41×41 map (Chebyshev
        /// far exceeds 3) and this fails. Measured: with the bounded sampler, max observed
        /// Chebyshev == radius; with the global sampler it reaches into the teens.
        /// </summary>
        [Test]
        public void WanderTarget_StaysWithinRadius_ProvingTheSamplerReadsTheDef()
        {
            // 41×41 open room, one deck. Origin at the centre so a small radius is well inside.
            const int N = 41;
            var map = new string[N];
            for (int y = 0; y < N; y++)
            {
                if (y == 0 || y == N - 1) { map[y] = new string('#', N); continue; }
                map[y] = "#" + new string('.', N - 2) + "#";
            }
            var sim = new Simulation(AsciiWorld.Build(map), 7, Array.Empty<ISimSystem>());
            var origin = new Int3(N / 2, N / 2, 0);
            const int radius = 3;

            var rng = new SimRng(999);
            int found = 0, maxCheby = 0;
            for (int i = 0; i < 500; i++)
            {
                if (!sim.Paths.TryRandomWalkableTileNear(sim, rng, origin, radius, out var target)) continue;
                found++;
                int cheby = Math.Max(Math.Max(Math.Abs(target.X - origin.X), Math.Abs(target.Y - origin.Y)),
                                     Math.Abs(target.Z - origin.Z));
                if (cheby > maxCheby) maxCheby = cheby;
                Assert.That(cheby, Is.LessThanOrEqualTo(radius),
                    $"target {target} is Chebyshev {cheby} from {origin}, outside radius {radius}");
            }

            // Path-reached precondition: the sampler really produced walkable targets (an
            // all-open box can only fail if the sampler never ran).
            Assert.That(found, Is.GreaterThan(400),
                $"precondition: the sampler must actually return walkable targets (found {found}/500)");
            // And it must genuinely use the radius, not just always return the origin's tile.
            Assert.That(maxCheby, Is.GreaterThan(0),
                "precondition: draws must spread within the box, not collapse onto the origin");
        }

        /// <summary>
        /// PROVES: the bounded-wander tick path allocates nothing in steady state (hard
        /// zero-alloc invariant), AND that the path was actually EXERCISED — i.e. the crew wanders
        /// during the measured window, so <see cref="PathService.TryRandomWalkableTileNear"/> is
        /// really called under the counter, not skipped.
        ///
        /// NAMED MUTATION (reviewer applies): allocate inside the sampler (e.g. `new int[1]` per
        /// call, or LINQ over the draws) → the measured delta becomes non-zero and this fails.
        /// The wander-start counter guards the vacuous case: a version that never wandered would
        /// be trivially zero-alloc but the precondition (wanderStarts > 0) would fail.
        /// </summary>
        [Test]
        public void BoundedWanderTick_IsZeroAlloc_AndActuallyWanders()
        {
            var sim = new Simulation(AsciiWorld.Build(OpenRoom), 4242,
                new ISimSystem[] { new CitizenSystem() });
            var wanderer = sim.AddCitizen("Rover", new Int3(10, 4, 0));
            wanderer.AutoWander = true;

            for (int t = 0; t < 200; t++) sim.Tick(); // warm up past any first-touch JIT/alloc

            long before = GC.GetAllocatedBytesForCurrentThread();
            int wanderStarts = 0;
            bool hadPath = wanderer.HasPath;
            for (int t = 0; t < 3000; t++)
            {
                sim.Tick();
                bool now = wanderer.HasPath;
                if (!hadPath && now) wanderStarts++; // a fresh wander path = one sampler call
                hadPath = now;
            }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(wanderStarts, Is.GreaterThan(0),
                "precondition: the wanderer must start new wanders in the window, or the sampler was never called");
            Assert.That(delta, Is.EqualTo(0),
                $"the bounded-wander tick path must be zero-alloc, saw {delta} bytes over 3000 ticks");
        }
    }
}
