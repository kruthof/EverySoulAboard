using NUnit.Framework;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// <b><see cref="IJobSource.IsBackedOff"/> — THE SIM SIDE OF THE <c>blocked</c> CHANNEL'S THIRD
    /// QUESTION.</b> Until this contract member existed, only <see cref="HaulJobSource"/> would say
    /// whether its board had recently failed to get anybody started on a tile; dig, strip and build
    /// kept the same fact in a private dictionary, and <c>hosts/web/WireFormat.Blocked.cs</c> had to
    /// file *"⛔ OMITTED (2) — 'no crew can PATH here'"* as a permanent residual. This file pins the
    /// mirror.
    ///
    /// <b>⚠️ EVERY LEG IS BLINDED OF THE OTHERS, AND THAT IS THE POINT OF THE FILE — not an
    /// arrangement of convenience.</b> Four carriers stamp the same shape of fact
    /// (<c>DigJobSource._retryAt</c>, <c>DeconstructJobSource._retryAt</c>,
    /// <c>BuildJobSource._readyRetryAt</c>, <c>BuildJobSource._matRetryAt</c>) and the host asks ONE
    /// fanned-out question, so a suite that drove them together could lose any one of them and stay
    /// green — the fan-out would still answer true. Each test below therefore builds a sim in which
    /// EXACTLY ONE carrier can fire, requires that carrier to report the stamp, and requires <b>every
    /// other source to report FALSE for the same tile</b>. Mutating one carrier's clause to
    /// <c>return false</c> reddens exactly one test.
    ///
    /// <b>THE FIXTURE IS A SEALED POCKET, DRIVEN — NEVER A HAND-WRITTEN DICTIONARY.</b> The stamps
    /// are produced by the real dispatcher failing a real <c>JobWork.TryPathToAdjacent</c> against a
    /// citizen who genuinely cannot walk there, so these tests pin the seam the sim actually uses. A
    /// test that reached into a source and planted an entry would pin a fiction and would survive
    /// <see cref="IJobSource.TryClaim"/> losing its stamping obligation entirely.
    ///
    /// NO ATMOSPHERE HERE, deliberately: <c>WorksiteSafety.CanStageWorkerAt</c> is inert on a stack
    /// with no <c>SafetySystem</c>, so the only thing that can refuse a claim in this fixture is the
    /// PATH. That isolates the predicate under test from the air question, which is pinned on the
    /// host side (<c>BlockedChannelTests</c>) where the two have to be told apart.
    /// </summary>
    public class JobSourceBackoffTests
    {
        // Two compartments with no connection at all: the crew live on the left, every order is
        // planted on the right. `#` is wall-on-floor (so the interior block at x 9–11 is NOT a
        // pressure hull and can legally be condemned); the map has no void, no doors and no ladders,
        // so `FindPath` between the halves cannot succeed by any route.
        private static readonly string[] SplitMap =
        {
            "###############",
            "#.....#.......#",
            "#.....#..###..#",
            "#.....#..###..#",
            "#.....#.......#",
            "###############",
        };

        private const int Seed = 11;
        private static readonly Int3 CrewTile = new Int3(2, 2, 0);   // left half
        private static readonly Int3 Control = new Int3(3, 3, 0);   // left half, never ordered

        private static Simulation NewSplitSim(out JobSystem jobs, out BuildSystem build,
                                              out DeconstructSystem strip)
        {
            jobs = new JobSystem();
            build = new BuildSystem();
            strip = new DeconstructSystem();
            var sim = new Simulation(AsciiWorld.Build(SplitMap), Seed,
                new ISimSystem[] { jobs, build, strip });
            sim.AddCitizen("Solo", CrewTile);
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>A named source out of the running dispatcher. Keyed on
        /// <see cref="IJobSource.Name"/>, never on a registration index — the index is behaviour that
        /// other tests pin and this file must not become a second place that encodes it.</summary>
        private static IJobSource SourceNamed(JobSystem jobs, string name)
        {
            for (int i = 0; i < jobs.Sources.Count; i++)
                if (jobs.Sources[i].Name == name) return jobs.Sources[i];
            Assert.Fail("no job source named '" + name + "' is registered");
            return null;
        }

        /// <summary>Tick until <paramref name="pos"/> carries a live back-off, or fail loudly naming
        /// the premise. Bounded well past <c>UnreachableRetryTicks</c> so a stamp that lands, expires
        /// and re-lands is still caught; a silent timeout here would make every assertion after it
        /// vacuous.</summary>
        private static void DriveUntilBackedOff(Simulation sim, JobSystem jobs, Int3 pos, string what)
        {
            for (int t = 0; t < 400; t++)
            {
                sim.Tick();
                if (jobs.IsBackedOff(pos, sim.TickCount, out _)) return;
            }
            Assert.Fail("PREMISE FAILED: 400 ticks and no source ever backed off " + pos + " (" + what +
                        "). Either the order was never offered to the citizen, or TryClaim stopped " +
                        "recording its backoff — in which case every assertion below is vacuous, so " +
                        "this fails here rather than passing quietly.");
        }

        /// <summary>The blinding half, written once. Exactly one named source may claim
        /// <paramref name="pos"/>; the other three must report false for the SAME tile.</summary>
        private static void AssertOnly(JobSystem jobs, Simulation sim, Int3 pos, string owner)
        {
            long tick = sim.TickCount;
            foreach (string name in new[] { "Dig", "Haul", "Build", "Deconstruct" })
            {
                var src = SourceNamed(jobs, name);
                bool backed = src.IsBackedOff(pos, tick, out long until);
                if (name == owner)
                {
                    Assert.That(backed, Is.True,
                        "'" + owner + "' is the only source that can have stamped " + pos +
                        " in this fixture, and it reports NOT backed off. Its IsBackedOff is not " +
                        "reading the map its own TryClaim writes.");
                    Assert.That(until, Is.GreaterThan(tick),
                        "a live stamp must report an expiry in the FUTURE — untilTick is the tick at " +
                        "which the site may be attempted again, not a flag");
                }
                else
                {
                    Assert.That(backed, Is.False,
                        "source '" + name + "' claims a back-off on " + pos + " that only '" + owner +
                        "' can have stamped. The legs are no longer blinded, so a carrier could be " +
                        "deleted and this suite would stay green on another carrier's answer.");
                    Assert.That(until, Is.Zero, "a false answer must report untilTick 0, not scratch");
                }
            }

            Assert.That(jobs.IsBackedOff(pos, tick, out long fanOut), Is.True,
                "JobSystem.IsBackedOff — the fan-out the host asks — did not see a stamp its own " +
                "source is holding");
            Assert.That(fanOut, Is.GreaterThan(tick));

            // THE NEGATIVE, and it is required: a guard that only proves a stamp is FOUND is
            // satisfied by a fan-out that answers true for everything.
            Assert.That(jobs.IsBackedOff(Control, tick, out long none), Is.False,
                "the fan-out reports a back-off on a tile nobody ever ordered anything on");
            Assert.That(none, Is.Zero);
        }

        // ══════════════════════════════════════════════════════════ leg 1 — DIG, blinded

        /// <summary>MUTATION: <c>return false;</c> in <c>DigJobSource.IsBackedOff</c> ⇒ red here and
        /// GREEN in the other three legs.</summary>
        [Test]
        public void A_Dig_Site_No_Crew_Can_Walk_To_Is_Reported_By_DigJobSource_Alone()
        {
            var sim = NewSplitSim(out var jobs, out _, out _);
            var site = new Int3(13, 1, 0);                 // right half
            sim.World.SetWall(site, TileDefs.Debris);
            sim.World.SetFlag(site, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;

            Assert.That(sim.Paths.FindPath(sim, CrewTile, new Int3(12, 1, 0), new System.Collections.Generic.List<Int3>()),
                Is.False, "PREMISE FAILED: the halves are connected, so nothing here is unreachable");

            DriveUntilBackedOff(sim, jobs, site, "a designated debris tile in the sealed half");
            AssertOnly(jobs, sim, site, "Dig");
        }

        /// <summary>THE EXPIRY IS A COMPARISON AGAINST THE CALLER'S TICK, not a stored bool — the
        /// half of the predicate a "does it return true" test cannot see. Driven from the same stamp,
        /// then re-asked with a tick past the deadline.
        /// MUTATION: change <c>tick &lt; untilTick</c> to <c>true</c> in <c>DigJobSource</c> ⇒ red.</summary>
        [Test]
        public void A_Backoff_Is_Live_Only_Until_Its_Expiry_Tick()
        {
            var sim = NewSplitSim(out var jobs, out _, out _);
            var site = new Int3(13, 1, 0);
            sim.World.SetWall(site, TileDefs.Debris);
            sim.World.SetFlag(site, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;
            DriveUntilBackedOff(sim, jobs, site, "the dig expiry fixture");

            var dig = SourceNamed(jobs, "Dig");
            Assert.That(dig.IsBackedOff(site, sim.TickCount, out long until), Is.True);
            Assert.That(dig.IsBackedOff(site, until - 1, out _), Is.True, "still live one tick before expiry");
            Assert.That(dig.IsBackedOff(site, until, out long atExpiry), Is.False,
                "the stamp is [tick, until) — AT the expiry tick the site is attemptable again, which " +
                "is what makes this a rate limiter rather than a blacklist");
            Assert.That(atExpiry, Is.Zero, "an expired stamp must report untilTick 0, not its dead deadline");
            Assert.That(until, Is.LessThanOrEqualTo(sim.TickCount + JobWork.UnreachableRetryTicks),
                "a stamp cannot outlive JobWork.UnreachableRetryTicks from when it was taken");
        }

        // ══════════════════════════════════════════════════════════ leg 2 — STRIP, blinded

        /// <summary>MUTATION: <c>return false;</c> in <c>DeconstructJobSource.IsBackedOff</c> ⇒ red
        /// here and GREEN in the other three legs.</summary>
        [Test]
        public void A_Condemned_Wall_No_Crew_Can_Walk_To_Is_Reported_By_DeconstructJobSource_Alone()
        {
            var sim = NewSplitSim(out var jobs, out _, out var strip);
            var site = new Int3(9, 2, 0);                  // the interior block in the sealed half
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, site), Is.False,
                "PREMISE: the fixture's condemned wall must not be a pressure hull, or the designate " +
                "is refused and the leg is vacuous");

            sim.EnqueueCommand(new DesignateDeconstructCommand(site, DeconstructKind.Wall, true));
            sim.Tick();
            Assert.That(strip.TryGet(site, out _), Is.True, "PREMISE: the strip order was accepted");

            DriveUntilBackedOff(sim, jobs, site, "a condemned wall in the sealed half");
            AssertOnly(jobs, sim, site, "Deconstruct");
        }

        // ═══════════════════════════════════════════ leg 3 — BUILD, the READY carrier, blinded

        /// <summary>MUTATION: delete the <c>_readyRetryAt</c> clause from
        /// <c>BuildJobSource.IsBackedOff</c> ⇒ red here and GREEN in leg 4 (the material carrier),
        /// which is the whole reason the two legs are separate tests.</summary>
        [Test]
        public void A_Materialed_Build_No_Crew_Can_Walk_To_Is_Reported_By_The_Ready_Carrier()
        {
            var sim = NewSplitSim(out var jobs, out var build, out _);
            var site = new Int3(7, 4, 0);                  // floor, right half
            sim.EnqueueCommand(new DesignateBuildCommand(site, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site, out var pending), Is.True, "PREMISE: the build was accepted");

            // Stage the material AT the site rather than hauling it, so the only thing left that can
            // fail is the approach — that is what makes this the READY carrier's leg and not the
            // material carrier's.
            build.Deposit(sim, site, pending.Required);
            Assert.That(build.TryGet(site, out var ready) && BuildSystem.IsReady(ready), Is.True,
                "PREMISE: the site is materialed, so BuildJobSource routes it through _ready");

            DriveUntilBackedOff(sim, jobs, site, "a ready build in the sealed half");
            AssertOnly(jobs, sim, site, "Build");
        }

        // ════════════════════════════════════════ leg 4 — BUILD, the MATERIAL carrier, blinded

        /// <summary>
        /// ⭐ <b>THE CARRIER THE MEASURED 480 000-TICK STALL ACTUALLY TRIPS</b>, and the one whose
        /// meaning is NOT "the site is unreachable": <c>_matRetryAt</c> is stamped when
        /// <c>TryReserveMaterialFor</c> can find no free material stack the citizen can reach. Here
        /// the material sits in the sealed half with the site, so it exists (the
        /// <c>_freeMaterialUnits &gt; 0</c> gate opens and the site is offered) and no citizen can get
        /// to it.
        ///
        /// MUTATION: delete the <c>_matRetryAt</c> clause from <c>BuildJobSource.IsBackedOff</c> ⇒ red
        /// here and GREEN in leg 3.
        /// </summary>
        [Test]
        public void A_Build_Whose_Material_No_Crew_Can_Walk_To_Is_Reported_By_The_Material_Carrier()
        {
            var sim = NewSplitSim(out var jobs, out var build, out _);
            var site = new Int3(13, 4, 0);                 // floor, right half
            sim.EnqueueCommand(new DesignateBuildCommand(site, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site, out var pending), Is.True, "PREMISE: the build was accepted");
            Assert.That(BuildSystem.NeedsMaterial(pending), Is.True,
                "PREMISE: the site wants material, so it routes through _needMat and not _ready");

            sim.AddItem(BuildSystem.Material, pending.Required * 4, new Int3(12, 4, 0)); // sealed half
            sim.JobsDirty = JobBoardDirty.All;

            DriveUntilBackedOff(sim, jobs, site, "a build whose only material is in the sealed half");
            AssertOnly(jobs, sim, site, "Build");
        }

        // ═════════════════════════════════════════════════════ the fan-out's own contract

        /// <summary>
        /// THE FAN-OUT IS NOT A SHORT-CIRCUIT: <c>untilTick</c> is the LATEST live expiry across every
        /// source that answered, i.e. the tick at which the tile could next be attempted AT ALL.
        /// Driven through <see cref="BuildJobSource"/>, whose two carriers can both hold a stamp on
        /// one site — the material one first, then the ready one after the material is staged.
        ///
        /// MUTATION: make <c>JobSystem.IsBackedOff</c> return on its first true ⇒ this can still pass
        /// by luck of registration order, which is why the assertion is on the VALUE and the two
        /// stamps are given different deadlines by construction.
        /// </summary>
        [Test]
        public void The_FanOut_Reports_The_Latest_Live_Expiry_Not_The_First()
        {
            var sim = NewSplitSim(out var jobs, out var build, out _);
            var site = new Int3(13, 4, 0);
            sim.EnqueueCommand(new DesignateBuildCommand(site, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site, out var pending), Is.True);

            sim.AddItem(BuildSystem.Material, pending.Required * 4, new Int3(12, 4, 0));
            sim.JobsDirty = JobBoardDirty.All;
            DriveUntilBackedOff(sim, jobs, site, "the material carrier, stamped first");

            var buildSrc = SourceNamed(jobs, "Build");
            Assert.That(buildSrc.IsBackedOff(site, sim.TickCount, out long matUntil), Is.True);

            // Now stage the material so the site becomes READY, and drive again: the ready carrier
            // takes its own, strictly later, stamp while the material one may still be live.
            build.Deposit(sim, site, pending.Required);
            sim.JobsDirty = JobBoardDirty.All;
            DriveUntilBackedOff(sim, jobs, site, "the ready carrier, stamped second");

            Assert.That(jobs.IsBackedOff(site, sim.TickCount, out long fanOut), Is.True);
            Assert.That(fanOut, Is.GreaterThanOrEqualTo(matUntil),
                "the fan-out reported an expiry EARLIER than a stamp it can see. untilTick is 'when " +
                "may this be attempted again', so taking anything but the maximum understates it.");
        }

        /// <summary>
        /// A STACK WITH NO DISPATCHER, AND A TILE NOBODY EVER TRIED — the two shapes of honest
        /// silence, pinned so a later change cannot turn either into a fabricated answer. The second
        /// is limit (1) of the package charter: <see cref="IJobSource.IsBackedOff"/> under-claims by
        /// construction, and a surface built on it must say the weaker thing.
        /// </summary>
        [Test]
        public void An_Unattempted_Tile_Is_Not_BackedOff_And_That_Is_The_Documented_UnderClaim()
        {
            var sim = NewSplitSim(out var jobs, out _, out _);
            // A tile in the sealed half that no crew member could ever reach — and that nobody has
            // ordered anything on, so nobody has ever TRIED. The predicate must say false.
            var neverOrdered = new Int3(13, 2, 0);
            for (int t = 0; t < 60; t++) sim.Tick();
            Assert.That(jobs.IsBackedOff(neverOrdered, sim.TickCount, out long until), Is.False,
                "IsBackedOff answered TRUE for a tile no job source has ever attempted. It is a record " +
                "of attempts, not a reachability oracle — if it ever becomes the latter, " +
                "WireFormat.Blocked.cs's ReasonUnreachable doc and the client's wording are both wrong.");
            Assert.That(until, Is.Zero);
        }
    }
}
