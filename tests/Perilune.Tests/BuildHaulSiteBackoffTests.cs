using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M2-21 — THE SILENT BUILD HAUL. The original 480 000-tick livelock, and the fourth
    /// costume of one structural asymmetry: a path that refuses without recording the refusal.</b>
    ///
    /// <b>THE DEFECT, PRECISELY.</b> <see cref="BuildJobSource.TryClaim"/> reaches a hungry build
    /// site through <c>TryReserveMaterialFor</c>, which pathfinds citizen → <b>MATERIAL</b> and never
    /// citizen → <b>SITE</b>. So on a ship where the material is reachable and the site is not, the
    /// claim SUCCEEDS — and its success path <c>Remove</c>s any stamp the site was carrying — and the
    /// refusal lands one hop later, in <c>ProgressBuildHaul</c>'s phase A, which released the
    /// reservation, abandoned the job and <b>stamped nothing at all</b>. The site was therefore
    /// re-offered on the very next tick, at the board's full rate, forever, with no back-off, no
    /// <c>blocked</c> row and nothing on any surface. Measured by M1-D's review on a build order
    /// behind a shut door: <b>3 000 ticks / 2 999 abandons / 0 stamps</b>.
    ///
    /// <b>⚠️ STAMPING AT THE CLAIM IS NOT STAMPING IN PROGRESS, and that distinction is the whole
    /// package.</b> The file already stamped correctly twice, at both claim exits
    /// (<c>_readyRetryAt</c>, <c>_matRetryAt</c>), which is the proof this was an oversight rather
    /// than a design choice — and it is exactly why a reader auditing "does BuildJobSource have a
    /// backoff?" answered yes and moved on. The fix reuses <c>_matRetryAt</c> and
    /// <see cref="JobWork.UnreachableRetryTicks"/>: no new mechanism, no def field, and no second
    /// definition of "backed off" (<c>IsBackedOff</c>, mirrored onto this source by M1-D, stays the
    /// one query the <c>blocked</c> channel fans out).
    ///
    /// <b>⛔ WHY THE HEADLINE LEG ASSERTS A COUNT AND NOT A STATE.</b> M1-H's lesson, verbatim: the
    /// pawn is idle on almost every tick of this livelock, so <i>"assert the pawn is idle"</i> and
    /// <i>"assert the site made no progress"</i> both PASS ON THE BUG. The only observable that
    /// separates the two worlds is how often the board manufactures the claim — measured here, in
    /// this fixture, at <b>1 500 claims before / 59 after over 3 000 ticks</b>.
    ///
    /// <b>THE FIXTURE IS DRIVEN AND MINIMAL — never a hand-planted dictionary entry.</b> Two
    /// compartments joined by one door; the door is shut. The crew member and the material are on the
    /// near side, the build site on the far side. That arrangement is the defect's precondition
    /// stated as geometry: <b>the material is reachable and the site is not</b>, so
    /// <c>TryReserveMaterialFor</c> cannot fail and neither claim-site stamp can ever fire. That is
    /// what BLINDS this file from the two shipped stamps — charter mutation 2 (stamp in
    /// <c>TryReserveMaterialFor</c> but not in <c>ProgressBuildHaul</c>) reproduces the shipped bug
    /// exactly, and <see cref="A_Build_Behind_A_Shut_Door_Stops_Churning_The_Board"/> reddens on it.
    /// <see cref="The_Material_Is_Reachable_And_The_Site_Is_Not_And_The_Claim_Succeeds"/> pins that
    /// blinding as a premise instead of leaving it to be assumed.
    ///
    /// NO ATMOSPHERE AND NO NEEDS in this stack, deliberately: <c>WorksiteSafety.CanStageWorkerAt</c>
    /// is inert without a <c>SafetySystem</c>, so the ONLY thing that can refuse an approach here is
    /// the shut door. That isolates this package's question from the air question, which the
    /// <c>blocked</c> channel's own suite tells apart on the host side.
    ///
    /// <b>THE VISIBILITY LEG LIVES IN <c>BlockedChannelTests</c></b>
    /// (<c>A_Build_Whose_Material_Is_Reachable_And_Whose_Site_Is_Not_Reaches_The_Channel</c>), with
    /// the rest of the reach-reason legs and on the real ship, because what it asserts is that
    /// M1-D's channel can now SEE this stamp — a host fact, on a host fixture, using that file's
    /// pocket-cutting helpers rather than a second copy of them.
    ///
    /// <b>THE NAMED MUTATIONS</b> (charter table; each physically applied to the source, run,
    /// observed RED for the right reason, and reverted from an in-memory copy — never
    /// <c>git checkout</c> in the loop, trap 2):
    ///   1 delete the phase-A stamp                            → the headline leg + recovery
    ///   2 stamp in <c>TryReserveMaterialFor</c>, not in phase A → the headline leg (blinded)
    ///   3 stamp but never expire                              → the recovery leg
    ///   4 emit no <c>blocked</c> row for the backed-off site   → the visibility leg (host file)
    ///   5 stamp a REACHABLE site too                          → the no-regression leg
    ///   6 add a def field for the interval                    → <c>DefsChecksumTests</c> (P4/P5)
    /// </summary>
    public class BuildHaulSiteBackoffTests
    {
        /// <summary>Two compartments joined by exactly one doorway at <see cref="DoorTile"/>. Every
        /// interior tile is plain floor, so the ONLY thing that can separate the halves is the door
        /// device — which is what makes the recovery leg (open it) a one-line world change.</summary>
        private static readonly string[] DoorMap =
        {
            "#############",
            "#.....#.....#",
            "#...........#",
            "#.....#.....#",
            "#############",
        };

        private const ulong Seed = 21;
        private static readonly Int3 DoorTile = new Int3(6, 2, 0);
        private static readonly Int3 CrewTile = new Int3(2, 2, 0);   // near side
        private static readonly Int3 MaterialTile = CrewTile;        // underfoot: zero travel, see below
        private static readonly Int3 FarSite = new Int3(10, 2, 0);   // far side, behind the door
        private static readonly Int3 NearSite = new Int3(4, 1, 0);   // near side — the no-regression control

        /// <summary>
        /// The fixture, built once and used by every leg. The material is planted UNDERFOOT on
        /// purpose and it is not a convenience: it removes travel time from the measurement, so the
        /// claim/abandon period is the pure board period and the recovery leg's
        /// <c>UnreachableRetryTicks + 1</c> bound is a statement about the back-off rather than about
        /// how fast a pawn walks. <c>AutoWander</c> is left at its default false and asserted, so the
        /// pawn cannot drift off the stack between re-probes and quietly widen that bound.
        /// </summary>
        private static Simulation NewDoorSim(out JobSystem jobs, out BuildSystem build, out Device door)
        {
            jobs = new JobSystem();
            build = new BuildSystem();
            var sim = new Simulation(AsciiWorld.Build(DoorMap), Seed,
                new ISimSystem[] { new CitizenSystem(), jobs, build });

            door = sim.AddDevice(DeviceKind.Door, DoorTile, "door_bulkhead");
            door.IsOpen = false;

            var citizen = sim.AddCitizen("Solo", CrewTile);
            Assert.That(citizen.AutoWander, Is.False,
                "PREMISE: the pawn must not wander, or a re-probe can find him away from the material " +
                "and the recovery bound would be measuring travel instead of the back-off");
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>Designate a wall at <paramref name="site"/> and stock enough material for it
        /// beside the crew. Returns the site's <c>Required</c> count.</summary>
        private static int OrderWall(Simulation sim, BuildSystem build, Int3 site)
        {
            sim.EnqueueCommand(new DesignateBuildCommand(site, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site, out var pending), Is.True,
                "PREMISE: the build order at " + site + " was refused, so nothing below is measuring a build");
            Assert.That(BuildSystem.NeedsMaterial(pending), Is.True,
                "PREMISE: the site must WANT material, so it is offered through _needMat (which reads " +
                "_matRetryAt) and not through _ready (which reads _readyRetryAt). The two boards are " +
                "gated on different maps and this package writes only the first.");
            sim.AddItem(BuildSystem.Material, pending.Required, MaterialTile);
            sim.JobsDirty = JobBoardDirty.All;
            return pending.Required;
        }

        /// <summary>How often the board manufactured the doomed haul, and whether the back-off branch
        /// was ever entered at all. <c>Claims</c> counts transitions INTO
        /// <see cref="JobKind.HaulToBuild"/> — one per claim, and in this fixture one per abandon.</summary>
        private struct Counts
        {
            public int Claims, Abandons, StampTicks;
            public bool EverStamped;
        }

        private static Counts Run(Simulation sim, JobSystem jobs, Int3 site, int ticks)
        {
            var c = new Counts();
            var crew = sim.Citizens.Items[0];
            bool wasHauling = crew.JobKind == JobKind.HaulToBuild;
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                bool hauling = crew.JobKind == JobKind.HaulToBuild;
                if (hauling && !wasHauling) c.Claims++;
                if (!hauling && wasHauling) c.Abandons++;
                wasHauling = hauling;
                if (jobs.IsBackedOff(site, sim.TickCount, out _)) { c.StampTicks++; c.EverStamped = true; }
            }
            return c;
        }

        // ═══════════════════════════════════════════════════════════════════════ the premise

        /// <summary>
        /// ⭐ <b>THE BLINDING, PINNED AS A PREMISE.</b> Three facts, and if any of them stops holding
        /// then every other leg in this file starts measuring one of the two SHIPPED stamps instead
        /// of this package's:
        ///
        /// (1) no crew member can reach the far site — so phase A's approach must fail;
        /// (2) the material IS reachable — so <c>TryReserveMaterialFor</c> cannot fail and
        ///     <c>TryClaim</c>'s <c>_matRetryAt</c> stamp is unreachable code in this fixture;
        /// (3) the claim actually SUCCEEDS and the pawn really does enter <c>HaulToBuild</c> — the
        ///     dispatcher commits him to a site he can never reach, which is the defect's shape.
        ///
        /// Without (2) and (3) the headline leg would be satisfiable by charter mutation 2 — stamping
        /// in <c>TryReserveMaterialFor</c> and nowhere else, i.e. reproducing the shipped bug while
        /// looking like a fix.
        /// </summary>
        [Test]
        public void The_Material_Is_Reachable_And_The_Site_Is_Not_And_The_Claim_Succeeds()
        {
            var sim = NewDoorSim(out var jobs, out var build, out _);
            OrderWall(sim, build, FarSite);
            var path = new List<Int3>(64);

            Assert.That(sim.IsWalkable(DoorTile), Is.False,
                "PREMISE: a shut door is what separates the halves — if it is walkable there is no " +
                "unreachable site and this whole file is vacuous");
            foreach (var n in new[] { new Int3(9, 2, 0), new Int3(10, 1, 0), new Int3(10, 3, 0), new Int3(11, 2, 0) })
                Assert.That(sim.Paths.FindPath(sim, CrewTile, n, path), Is.False,
                    "PREMISE: no crew member may reach the far site's neighbour " + n);
            Assert.That(sim.Paths.FindPath(sim, CrewTile, MaterialTile, path), Is.True,
                "PREMISE: the MATERIAL must be reachable. This is the blinding: with unreachable " +
                "material TryReserveMaterialFor would fail and TryClaim's own _matRetryAt stamp — a " +
                "line this package did not write — would satisfy every assertion below.");

            // Drive until the dispatcher commits the pawn. It must, and quickly: the site is on
            // _needMat, the material count covers the remainder, and the material is reachable.
            bool claimed = false;
            for (int t = 0; t < 60 && !claimed; t++)
            {
                sim.Tick();
                claimed = sim.Citizens.Items[0].JobKind == JobKind.HaulToBuild;
            }
            Assert.That(claimed, Is.True,
                "PREMISE FAILED: the dispatcher never committed the pawn to the unreachable site. The " +
                "defect is that the CLAIM succeeds on a reachable material while the SITE is " +
                "unreachable; if the claim never happens, nothing here exercises phase A.");
            Assert.That(sim.Citizens.Items[0].JobTarget, Is.EqualTo(FarSite),
                "the committed job's target is the SITE, not the material — which is why the site is " +
                "the key both stamps and IsBackedOff are keyed on");
        }

        // ══════════════════════════════════════════════════════════════════════ the headline

        /// <summary>
        /// ⭐ <b>THE HEADLINE LEG — A COUNT, NOT A STATE.</b> A build order behind a shut door with
        /// reachable material, driven 3 000 ticks. The board must stop manufacturing a claim it
        /// cannot honour.
        ///
        /// MEASURED IN THIS FIXTURE, both directions, in this session:
        ///   shipped bug (no phase-A stamp) : 1 500 claims / 1 500 abandons / 0 backed-off ticks
        ///   fixed                          :    59 claims /    59 abandons / 2 942 backed-off ticks
        /// The fixed ceiling is arithmetic, not a tuning constant: one re-probe per
        /// <see cref="JobWork.UnreachableRetryTicks"/>, so ⌈3000/51⌉ ≈ 59. ⚠️ <b>The charter's
        /// estimate of "single digits" assumed a board that goes to sleep — <c>BuildJobSource</c> has
        /// no such sleep, and needs none: <c>JobSystem.TryAssign</c> runs for an idle pawn on every
        /// tick from the retained board, so the back-off's expiry is the ONLY rate limiter and 59 is
        /// the honest number.</b> The bound below is written as that arithmetic, so it fails if the
        /// re-probe period ever silently changes.
        ///
        /// THE TWO NON-VACUITY GUARDS ARE LOAD-BEARING. <c>EverStamped</c> proves the new branch was
        /// actually entered — without it a quiet board would satisfy the ceiling for any number of
        /// unrelated reasons (no material, a dead pawn, a board that never offered the site) and the
        /// test would assert nothing about this package. <c>Claims &gt; 0</c> proves the doomed claim
        /// still HAPPENS: a "fix" that stopped offering hungry sites altogether would be the
        /// RimWorld grey-out bug and must not pass here.
        ///
        /// NAMED MUTATIONS caught here: 1 (delete the phase-A stamp) and 2 (stamp in
        /// <c>TryReserveMaterialFor</c> instead — the actual shipped bug).
        /// </summary>
        [Test]
        public void A_Build_Behind_A_Shut_Door_Stops_Churning_The_Board()
        {
            var sim = NewDoorSim(out var jobs, out var build, out _);
            OrderWall(sim, build, FarSite);

            const int Ticks = 3000;
            var c = Run(sim, jobs, FarSite, Ticks);

            Assert.That(c.EverStamped, Is.True,
                "the phase-A back-off branch was NEVER entered in " + Ticks + " ticks. IsBackedOff " +
                "never saw a stamp on " + FarSite + ", so the quiet board below (if it is quiet) is " +
                "quiet for some other reason and this test would be asserting nothing about M2-21.");
            Assert.That(c.Claims, Is.GreaterThan(0),
                "the board must still OFFER the hungry site and the pawn must still try it — a source " +
                "that stopped offering builds altogether would satisfy a churn ceiling by greying out " +
                "the verb, which is worse than the livelock");

            int ceiling = 2 * (Ticks / (JobWork.UnreachableRetryTicks + 1));
            Assert.That(c.Claims, Is.LessThan(ceiling),
                "THE LIVELOCK IS BACK: " + c.Claims + " claims in " + Ticks + " ticks on a site no " +
                "crew member can reach. The board's ceiling is one re-probe per " +
                "UnreachableRetryTicks+1 ticks (≈" + (Ticks / (JobWork.UnreachableRetryTicks + 1)) +
                "), and the shipped bug measured 1 500 here — one claim every second tick, forever, " +
                "with nothing on any surface saying so.");
            Assert.That(c.Abandons, Is.LessThan(ceiling),
                "every one of those claims is abandoned one tick later; the abandon count is the same " +
                "signature read from the other end and is asserted so a claim that silently stopped " +
                "abandoning (i.e. started succeeding) would be visible here rather than inferred");
        }

        // ══════════════════════════════════════════════════════════════════════ the recovery

        /// <summary>
        /// ⭐ <b>A BACK-OFF IS A RATE LIMITER, NOT A BLACKLIST.</b> Let the site be stamped, then open
        /// the door — exactly what a player, a crew member or a MOSS script does — and require the
        /// haul to start within <see cref="JobWork.UnreachableRetryTicks"/><c> + 1</c> ticks.
        ///
        /// THE BOUND IS DERIVED, NOT CHOSEN. A stamp taken at tick T expires at T+50, so a door
        /// opened anywhere in [T, T+50] is followed by a re-claim no later than T+50 and by phase A
        /// succeeding on the tick after that. Hence 51, and hence the material planted underfoot
        /// (travel time would make this a measurement of walking speed).
        ///
        /// ⚠️ NOTHING WAKES THE BOARD HERE AND NOTHING HAS TO. <c>SetDoorStateCommand</c> sets no
        /// <c>JobsDirty</c>, and <c>BuildJobSource</c> — unlike <c>HaulJobSource</c> — has no
        /// <c>BeginTick</c> expiry wake and clears no map on a tile-board change. <c>TryAssign</c>
        /// simply runs for an idle pawn on every tick against the retained board, so the expiry
        /// comparison inside <c>Select</c> is the whole liveness mechanism. That is why THIS is the
        /// leg that catches a stamp which never expires.
        ///
        /// NAMED MUTATIONS caught here: 3 (stamp but never expire — e.g. drop
        /// <c>sim.TickCount &lt; r</c> from <c>Select</c>'s <c>_needMat</c> gate, or stamp
        /// <c>long.MaxValue</c>) and 1 (no stamp at all fails the premise, loudly).
        /// </summary>
        [Test]
        public void Opening_The_Door_Restarts_The_Haul_Within_One_Backoff_Period()
        {
            var sim = NewDoorSim(out var jobs, out var build, out var door);
            OrderWall(sim, build, FarSite);

            int guard = 0;
            while (!jobs.IsBackedOff(FarSite, sim.TickCount, out _) && guard++ < 400) sim.Tick();
            Assert.That(jobs.IsBackedOff(FarSite, sim.TickCount, out _), Is.True,
                "PREMISE FAILED: 400 ticks and the site was never backed off, so there is no stamp for " +
                "this leg to watch lift and the assertion below would pass on the shipped bug");
            Assert.That(sim.Citizens.Items[0].CarryingItemId, Is.Zero,
                "PREMISE: nothing has been picked up while the door was shut");

            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, open: true));
            long opened = sim.TickCount;

            int bound = JobWork.UnreachableRetryTicks + 1;
            long startedAt = -1;
            for (int t = 0; t < 4 * bound && startedAt < 0; t++)
            {
                sim.Tick();
                if (sim.Citizens.Items[0].CarryingItemId != 0) startedAt = sim.TickCount;
            }

            Assert.That(startedAt, Is.GreaterThan(0),
                "the haul never restarted after the door opened. The back-off has become a permanent " +
                "blacklist — a fix strictly worse than the livelock it replaced, because the order is " +
                "now silently dead rather than merely noisy.");
            Assert.That(startedAt - opened, Is.LessThanOrEqualTo(bound),
                "the haul restarted " + (startedAt - opened) + " ticks after the door opened; the bound " +
                "is UnreachableRetryTicks + 1 = " + bound + ". A stamp that outlives its deadline turns " +
                "a 5 s rate limiter into an unbounded stall the player cannot distinguish from the bug.");
        }

        // ═════════════════════════════════════════════════════════════════ the no-regression

        /// <summary>
        /// ⭐ <b>THE NO-REGRESSION LEG: A REACHABLE SITE IS NEVER STAMPED AND ITS BUILD IS UNCHANGED.</b>
        /// The same fixture, the same door still shut, but the order is placed on the NEAR side with
        /// the crew. The wall must be hauled to, built and completed, and <c>IsBackedOff</c> must
        /// answer false on <b>every single tick</b> of the run.
        ///
        /// The per-tick assertion is the point. A count-based version ("stamped at most twice") would
        /// pass charter mutation 5 — a stamp applied unconditionally at the phase-A exit, which on a
        /// reachable site would fire only on the rare tick the approach genuinely failed. Zero
        /// stamp-ticks out of the whole run is the only form that pins "the fix touches nothing that
        /// works", and it is also what refuses the RimWorld grey-out shape: a back-off that fires on
        /// healthy work silently disables the verb everywhere.
        ///
        /// NAMED MUTATION caught here: 5 (apply the back-off to a reachable site — e.g. hoist the
        /// stamp above the <c>if</c>).
        /// </summary>
        [Test]
        public void A_Reachable_Build_Is_Never_Stamped_And_Still_Completes()
        {
            var sim = NewDoorSim(out var jobs, out var build, out _);
            OrderWall(sim, build, NearSite);
            var path = new List<Int3>(64);
            Assert.That(sim.Paths.FindPath(sim, CrewTile, new Int3(4, 2, 0), path), Is.True,
                "PREMISE: the near site's approach tile must be reachable, or this control measures " +
                "the same failure as the headline leg");

            int builtTicks = 0, stampTicks = 0;
            for (int t = 0; t < 6000 && build.Pending.Count > 0; t++)
            {
                sim.Tick();
                if (jobs.IsBackedOff(NearSite, sim.TickCount, out _)) stampTicks++;
                if (sim.Citizens.Items[0].JobKind == JobKind.Build) builtTicks++;
            }

            Assert.That(stampTicks, Is.Zero,
                "a REACHABLE build site was backed off on " + stampTicks + " ticks. The phase-A stamp " +
                "must fire only where the approach genuinely fails; a back-off on healthy work greys " +
                "out the verb ship-wide and would be a worse bug than the one this package closes.");
            Assert.That(build.Pending, Is.Empty,
                "the reachable wall must still be hauled to, built and completed — the whole point of " +
                "a rate limiter is that it costs working throughput nothing");
            Assert.That(sim.World.GetWall(NearSite), Is.EqualTo(TileDefs.Wall),
                "and the world must actually carry the finished wall, not merely an emptied registry");
            Assert.That(builtTicks, Is.GreaterThan(0),
                "non-vacuity: the pawn must have spent real ticks in JobKind.Build, so the run above " +
                "measured a completed build rather than a cancelled order");
        }
    }
}
