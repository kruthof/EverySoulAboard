using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-2 — the work-rate rebase (L1, ~10×) and the movement retune (ticks_per_tile 5→10),
    /// landed together. These three tripwires drive the REAL systems (CitizenSystem movement,
    /// DigJobSource, BuildSystem) on minimal stacks — no NeedsSystem, so nothing interrupts the
    /// work — and assert the OBSERVED duration a crew actually spends, tick by tick, rather than
    /// recomputing it from the constant under test. Each names the one-line mutation that breaks
    /// it; the reviewer applies them. The compiled-default VALUES themselves are pinned by
    /// <see cref="DefsDefaultTests"/>; these prove the values are CONSUMED at the shipped rate.
    /// </summary>
    public class WorkRateRetuneTests
    {
        // ------------------------------------------------------------ movement cadence

        /// <summary>
        /// A crew commanded five tiles down a straight corridor crosses ONE tile every
        /// <c>ticks_per_tile</c> ticks. Measured by the DELTA between successive tile arrivals,
        /// which isolates the per-tile cadence from any fixed command/first-step latency: every
        /// gap must be exactly 10, the E0-2 value.
        ///
        /// NAMED MUTATION: set <c>Citizen.TicksPerTile = 5</c> in
        /// <see cref="SimDefs.CreateDefault"/> (revert the retune) — the gaps become 5 and the
        /// "== 10" assertion fails. (The compiled const <c>CitizenSystem.TicksPerTile</c> and the
        /// shipped <c>citizen.def</c> line move with it; the def-equivalence gate then also fails.)
        /// </summary>
        [Test]
        public void MovementRetune_OneTilePerTenTicks_IsConsumedByCitizenSystem()
        {
            Assert.That(SimDefs.Default.Citizen.TicksPerTile, Is.EqualTo(10),
                "precondition: the shipped movement cadence is the E0-2 value");

            string[] map =
            {
                "########",
                "#......#",
                "########",
            };
            var sim = new Simulation(AsciiWorld.Build(map), 1,
                new ISimSystem[] { new CitizenSystem() });
            var mover = sim.AddCitizen("Mover", new Int3(1, 1, 0)).GiveAllWork(); // AutoWander false → no wander cadence
            sim.EnqueueCommand(new MoveCitizenCommand(mover.Id, new Int3(6, 1, 0))); // five tiles east

            // Record the tick each new column is reached; the gaps between them are the cadence.
            var arrivalTick = new System.Collections.Generic.List<long>();
            int lastX = mover.Pos.X;
            for (int t = 0; t < 200 && mover.Pos.X < 6; t++)
            {
                sim.Tick();
                if (mover.Pos.X != lastX) { arrivalTick.Add(sim.TickCount); lastX = mover.Pos.X; }
            }

            Assert.That(mover.Pos, Is.EqualTo(new Int3(6, 1, 0)), "precondition: the crew finished the walk");
            Assert.That(arrivalTick.Count, Is.EqualTo(5), "precondition: five discrete tile steps observed");
            for (int i = 1; i < arrivalTick.Count; i++)
                Assert.That(arrivalTick[i] - arrivalTick[i - 1], Is.EqualTo(10),
                    $"step {i} took {arrivalTick[i] - arrivalTick[i - 1]} ticks — one tile must cost ticks_per_tile (10)");
        }

        // ------------------------------------------------------------ dig work rate

        /// <summary>
        /// A crew placed adjacent to a designated debris tile digs it out in
        /// <see cref="DigJobSource.DigWorkTicks"/> ticks — the E0-2 value 6000, ~100× the old 60.
        /// The crew starts adjacent, so the measured span is the dig COUNTDOWN alone, not travel.
        ///
        /// NAMED MUTATION: set <c>DigJobSource.DigWorkTicks = 60</c> (revert the const) — the dig
        /// completes ~100× sooner and the "&gt; 5000" assertion fails.
        /// </summary>
        [Test]
        public void DigWorkRate_TakesSixThousandTicks_IsConsumedByDigJobSource()
        {
            Assert.That(DigJobSource.DigWorkTicks, Is.EqualTo(6000),
                "precondition: the shipped dig work rate is the E0-2 value");

            string[] map =
            {
                "#####",
                "#...#",
                "#...#",
                "#####",
            };
            var sim = new Simulation(AsciiWorld.Build(map), 1,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            var digger = sim.AddCitizen("Digger", new Int3(1, 1, 0)).GiveAllWork();

            var debris = new Int3(2, 1, 0); // orthogonally adjacent to the crew — no travel needed
            sim.World.SetWall(debris, TileDefs.Debris);
            sim.World.SetFlag(debris, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;

            // Advance to the first tick of the dig COUNTDOWN: crew on the Dig job, arrived
            // (no path). On that same tick the first work tick already fires, so the primed
            // countdown reads one below the full rate — capture it and assert the span matches.
            int startGuard = 0;
            while (startGuard++ < 400 && !(digger.JobKind == JobKind.Dig && !digger.HasPath &&
                                           Int3.IsAdjacent4(digger.Pos, debris)))
                sim.Tick();
            Assert.That(digger.JobKind, Is.EqualTo(JobKind.Dig), "precondition: the crew actually started the dig");
            long startJwt = digger.JobWorkTicks;
            Assert.That(startJwt, Is.GreaterThan(DigJobSource.DigWorkTicks - 30),
                $"precondition: the countdown is primed at the full work rate (~6000), saw {startJwt} — the old 60 would fail here");

            long startTick = sim.TickCount;
            for (int t = 0; t < 7000 && sim.World.GetWall(debris) == TileDefs.Debris; t++) sim.Tick();
            long digTicks = sim.TickCount - startTick;

            Assert.That(sim.World.GetWall(debris), Is.EqualTo((ushort)0), "the debris was dug out");
            Assert.That(digTicks, Is.EqualTo(startJwt),
                $"the dig ran the full primed countdown one tick per tick ({digTicks} vs {startJwt}) — DigWorkTicks (6000) is consumed, not the old 60");
        }

        // ------------------------------------------------------------ build work rate

        /// <summary>
        /// A fully-materialed wall with a crew standing adjacent is raised in
        /// <c>wall_construct_ticks</c> ticks — the E0-2 value 2400, 40× the old 60. The site is
        /// pre-staged (Delivered == Required) and the builder starts adjacent, so the measured
        /// span is the Build COUNTDOWN alone, not haul or travel.
        ///
        /// NAMED MUTATION: set <c>WallConstructTicks = 60</c> in <see cref="SimDefs.CreateDefault"/>
        /// (revert the retune; the shipped <c>build.def</c> line moves with it) — the wall finishes
        /// ~40× sooner and the "&gt; 2000" assertion fails.
        /// </summary>
        [Test]
        public void BuildWorkRate_WallTakesTwentyFourHundredTicks_IsConsumedByBuildSystem()
        {
            Assert.That(SimDefs.Default.Build.WallConstructTicks, Is.EqualTo(2400),
                "precondition: the shipped wall construct rate is the E0-2 value");

            string[] map =
            {
                "#######",
                "#.....#",
                "#######",
            };
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            BuildSystem build = null;
            foreach (var s in systems) if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "precondition: BuildSystem is registered");

            // Minimal stack: movement + jobs + build only, so no need ever interrupts the builder.
            var sim = new Simulation(AsciiWorld.Build(map), 1,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), build });
            var builder = sim.AddCitizen("Builder", new Int3(2, 1, 0)).GiveAllWork();

            var site = new Int3(3, 1, 0); // orthogonally adjacent to the crew
            Assert.That(build.Designate(sim, site, BuildKind.Wall), Is.True);
            Assert.That(build.Deposit(sim, site, sim.Defs.Build.WallMaterial),
                Is.EqualTo(sim.Defs.Build.WallMaterial), "precondition: the site is fully materialed up front");

            // Advance to the first tick of the Build COUNTDOWN: the builder has reached the site
            // (no path) and the first work tick has fired, so the primed countdown reads one below
            // the full construct rate. (The builder walks to the far side of the site first; the
            // countdown only runs once it is settled and adjacent.)
            int startGuard = 0;
            while (startGuard++ < 400 && !(builder.JobKind == JobKind.Build && !builder.HasPath))
                sim.Tick();
            Assert.That(builder.JobKind, Is.EqualTo(JobKind.Build), "precondition: the crew actually started building");
            long startJwt = builder.JobWorkTicks;
            Assert.That(startJwt, Is.GreaterThan(sim.Defs.Build.WallConstructTicks - 30),
                $"precondition: the countdown is primed at the full construct rate (~2400), saw {startJwt} — the old 60 would fail here");

            long startTick = sim.TickCount;
            for (int t = 0; t < 3000 && sim.World.GetWall(site) != TileDefs.Wall; t++) sim.Tick();
            long buildTicks = sim.TickCount - startTick;

            Assert.That(sim.World.GetWall(site), Is.EqualTo(TileDefs.Wall), "the wall was raised");
            Assert.That(buildTicks, Is.EqualTo(startJwt),
                $"the wall ran the full primed countdown one tick per tick ({buildTicks} vs {startJwt}) — wall_construct_ticks (2400) is consumed, not the old 60");
        }
    }
}
