using System;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M2-20 — THE SHIP IS WAITING ON YOU.</b> Two words for the two job-less states OD-H
    /// created, and the guards that keep them two.
    ///
    /// <para><b>WHY THIS FIXTURE EXISTS.</b> Under OD-H (2026-07-29) every work type boots OFF, so
    /// on every new game the crew member is doing nothing — deliberately, waiting for the player's
    /// first order (OD-G). Before this package the Overview said <c>"Idle"</c>, which is the word
    /// for <i>she is enabled and has nothing reachable to do</i>. Those are different facts, and
    /// the shipped comment at <c>overview-view.js</c> was right that conflating them is a lie — it
    /// simply chose the other side of that lie, for a world in which only one of the two states
    /// existed. ⇒ <b>Two states, two words, and neither test below may know the other's string.</b></para>
    ///
    /// <para>⛔ <b>LEGS 1 AND 2 ARE BLINDED OF EACH OTHER AND EACH FIRES ALONE.</b> <c>Assert</c>
    /// throws (CLAUDE.md fifth trap), and <i>"two words"</i> is precisely the claim a single-leg
    /// test cannot make: a package that simply RENAMES "Idle" to the awaiting sentence satisfies
    /// leg 1 perfectly and is caught only by leg 2. Neither method mentions the other's expected
    /// string, so neither can be repaired by copying it.</para>
    ///
    /// <para><b>EVERY EXPECTED STRING IS A LITERAL, never <see cref="GameSession"/>'s own constant.</b>
    /// <c>Perilune.Tests.csproj</c> compiles <c>GameSession.cs</c> into this assembly, so the
    /// constant IS reachable here — and asserting against it would be
    /// <c>Is.EqualTo(the field under test)</c>, the self-derivation shape this repo has shipped
    /// before. Changing the words is therefore a two-file edit, deliberately: the strings are
    /// REVERSIBLE (owner batch item 11) and a reversal should have to look at what it breaks.</para>
    ///
    /// <para><b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row was
    /// edited into the shipped tree, this fixture was run, and the tree was restored from an
    /// in-memory copy — never <c>git checkout</c> (TRAPS 2). "RED" is what the run reported:</para>
    /// <list type="table">
    ///   <item><b>1</b> emit the awaiting sentence for an ENABLED, job-less pawn (delete the
    ///     <c>else if (awaiting)</c> / <c>else "Idle"</c> split) ⇒ RED 2 of 22:
    ///     <c>WorkEnabled_AndNothingToDo_ReadsIdle</c> +
    ///     <c>WebTaskLabelTests.NoJob_Tells_Idle_Holding_And_Aimless_Walking_Apart</c>.
    ///     ⭐ <b>LEG 1 STAYED GREEN</b>, which is the blinding working.</item>
    ///   <item><b>2</b> emit <c>"Idle"</c> for an all-off pawn (delete the <c>awaiting</c> arm) ⇒
    ///     RED 4 of 22: <c>NoWorkEnabled_ReadsTheAwaitingSentence</c>,
    ///     <c>NoWorkEnabled_WhileWalking_StillReadsAwaiting</c>,
    ///     <c>WreckBootPawn_ReadsAwaiting_WhileSheWanders</c>, and the allocation leg's
    ///     precondition. ⭐ <b>LEG 2 STAYED GREEN.</b></item>
    ///   <item><b>2b</b> let the walking prefix win (ask <c>HasPath</c> first) ⇒ RED 2 of 22: the
    ///     two composition legs, and nothing else — which is why they are separate tests</item>
    ///   <item><b>5</b> <c>foreach (WorkType t in Enum.GetValues(typeof(WorkType)))</c> inside
    ///     <c>HasAnyWorkEnabled</c> ⇒ RED 2 of 22: both allocation legs (measured: 32 B per call,
    ///     which the FIRST draft's 96 B budget would have absorbed — see that test)</item>
    /// </list>
    /// <para>(Rows 3, 4, 6 and 7 are client-side and live in <c>client/test/awaiting-orders.test.js</c>
    /// and <c>client/test/onboarding.test.js</c>, with their own measured table.)</para>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-20". Owner decisions:
    /// OD-G (the pawn boots idle and waiting) and OD-H (the grid boots off).</para>
    /// </summary>
    [TestFixture]
    public class AwaitingOrdersTests
    {
        // ------------------------------------------------------------------ fixtures

        /// <summary>The SHIPPING game: <c>--ship wreck</c> is what <c>./play.sh</c> opens
        /// (<c>WebHostDefaultShipTests</c>), and OD-G is a claim about its first ten seconds. NOT
        /// started ⇒ no sim thread; the tests tick by hand.</summary>
        private static (GameSession Gs, SimHost Host) Wreck()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, _ => { });
            return (gs, host);
        }

        /// <summary>The wreck's one awake crew member — the pawn the player meets.</summary>
        private static Citizen Awake(SimHost host)
        {
            var c = host.Sim.Citizens.Items.First(x => !x.Dead);
            return c;
        }

        /// <summary>Park a crew member: no job, no path, not held. The baseline every job-less leg
        /// starts from, so a difference between two legs is the WORK GRID and nothing else.</summary>
        private static Citizen Parked(Citizen c)
        {
            c.ClearPath();
            c.JobKind = JobKind.None;
            c.HoldPosition = false;
            c.CarryingItemId = 0;
            c.ReservedItemId = 0;
            return c;
        }

        /// <summary>Read this crew member's <c>task</c> out of the RENDERED roster channel — the
        /// bytes the client is actually sent, not a direct call to the labeller. The wire is the
        /// seam the two surfaces read, so the wire is what these legs assert on.</summary>
        private static string TaskOnTheWire(GameSession gs, uint cid)
        {
            gs.RenderForTest();
            string roster = gs.Snapshot().First(s => s.Contains("\"type\":\"roster\"", StringComparison.Ordinal));
            string key = "\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) + ",";
            int i = roster.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "the roster carries cid " + cid);
            int t = roster.IndexOf("\"task\":\"", i, StringComparison.Ordinal);
            Assert.That(t, Is.GreaterThanOrEqualTo(0), "the row has a task field");
            t += "\"task\":\"".Length;
            int end = roster.IndexOf('"', t);
            return roster.Substring(t, end - t);
        }

        // ══════════════════════════════════════════════════ LEG 1 — the unassigned word (mutation 2)

        /// <summary>
        /// ⭐ <b>THE HEADLINE.</b> A crew member the player has given NO work type reads as
        /// AWAITING ORDERS, not as Idle. This is the boot state of every crew member on every new game.
        ///
        /// <para>⛔ <b>THIS LEG DELIBERATELY KNOWS NOTHING ABOUT THE IDLE CASE.</b> On its own it is
        /// satisfied by a package that renames "Idle" to this sentence — which is why
        /// <see cref="WorkEnabled_AndNothingToDo_ReadsIdle"/> exists and is a separate
        /// <c>[Test]</c>. Read them as a pair; run them as two.</para>
        ///
        /// <para>MUTATION 2: delete the <c>else if (awaiting)</c> arm from
        /// <c>GameSession.TaskLabel</c>'s <c>default:</c> branch ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void NoWorkEnabled_ReadsTheAwaitingSentence()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));

            // PRECONDITION, asked of the SIM's own predicate: this pawn really is switched off
            // everywhere. Without it, a fixture that had somehow been given work would still pass
            // the moment the label was wrong in the other direction.
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                Assert.That(c.CanTakeWorkType((WorkType)t), Is.False,
                    "precondition: OD-H boots " + (WorkType)t + " off, and this leg is about that state");

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Awaiting orders"),
                "a crew member the player has given no work at all must SAY she is waiting on an " +
                "order. This is the first ten seconds of every new game (OD-G), and 'Idle' claims " +
                "the ship has nothing for her — which is the opposite of true at boot.");
        }

        // ══════════════════════════════════════════════════════════ LEG 2 — the idle word (mutation 1)

        /// <summary>
        /// ⭐ <b>THE MIRROR, AND THE ONE A RENAME CANNOT SURVIVE.</b> A crew member who IS enabled
        /// and simply has nothing reachable to do still reads <c>"Idle"</c>. That state is real —
        /// it is what the retired <c>overview-view.js</c> comment was written about — and it is a
        /// different fact from "the player has enabled nothing".
        ///
        /// <para><b>ONE work type, not all six.</b> <c>Haul</c> is switched on and the pawn is
        /// PARKED with no job, so the label's <c>default:</c> branch is reached with
        /// <c>HasAnyWorkEnabled</c> TRUE — which is exactly the discrimination under test. An
        /// all-on grid would test the same bit less honestly (no new game is ever in that state)
        /// and would drag five more work types' job boards into the fixture.</para>
        ///
        /// <para>MUTATION 1: drop the <c>!awaiting</c> / <c>awaiting</c> guard so the awaiting
        /// sentence is emitted for any job-less pawn ⇒ RED here, and ONLY here.</para>
        /// </summary>
        [Test]
        public void WorkEnabled_AndNothingToDo_ReadsIdle()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));
            c.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);

            Assert.That(c.CanTakeWorkType(WorkType.Haul), Is.True,
                "precondition: this leg's whole subject is a pawn who IS enabled for something");
            Assert.That(c.JobKind, Is.EqualTo(JobKind.None),
                "precondition: …and who is holding no job while we read the label");

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Idle"),
                "a crew member who is switched ON and has nothing reachable to do is IDLE. Saying " +
                "she is waiting for orders would be the old comment's lie in the other direction: " +
                "the player has already given the order, and there is nothing to do with it.");
        }

        // ═══════════════════════════════════════════ the composition rules (stated, then pinned)

        /// <summary>
        /// ⭐ <b>A WANDERING UNASSIGNED PAWN STILL READS AWAITING ORDERS.</b> Idle wander sets a PATH and
        /// never a <see cref="JobKind"/>, so without this rule the awaiting sentence would be
        /// replaced by <c>"Walking to x,y (no task)"</c> for most of the first ten seconds — the
        /// exact window OD-G is about — and the destination coordinates would change on every tile
        /// step. The wander is what she DOES while waiting; it is not a different answer to "why is
        /// nothing happening".
        ///
        /// <para>MUTATION: reorder the <c>default:</c> branch so <c>HasPath</c> is asked first ⇒
        /// RED here (and green everywhere else, which is what makes this leg worth having).</para>
        /// </summary>
        [Test]
        public void NoWorkEnabled_WhileWalking_StillReadsAwaiting()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));
            c.Path.Add(c.Pos);
            c.Path.Add(new Int3(c.Pos.X + 1, c.Pos.Y, c.Pos.Z));
            c.PathIndex = 0;
            Assert.That(c.HasPath, Is.True, "precondition: she is mid-walk");

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Awaiting orders"),
                "the wander is not a task and must not read as one — nor may it overwrite the one " +
                "sentence telling the player the ship is waiting on them");
        }

        /// <summary>
        /// The OTHER half, and it is a REGRESSION guard: an ENABLED pawn walking with no job still
        /// says so out loud. That branch is untouched by this package and is the fix for the old
        /// catch-all that reported "walking" for 99.9% of all labels; a package that let *unassigned*
        /// swallow it would be re-introducing a different silence.
        /// </summary>
        [Test]
        public void WorkEnabled_WalkingWithNoJob_StillSaysNoTask()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));
            c.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);
            c.Path.Add(c.Pos);
            c.Path.Add(new Int3(7, 11, c.Pos.Z));
            c.PathIndex = 0;

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Walking to 7,11 (no task)"),
                "an ENABLED crew member walking to nowhere in particular reads exactly as before");
        }

        /// <summary>
        /// <c>HoldPosition</c> outranks BOTH words, and the ordering is a decision rather than an
        /// accident. A held crew member is parked by an explicit per-citizen order (authored today —
        /// <c>AuthoredShips.cs:170-171</c> — with no runtime writer), and holding BY ITSELF stops
        /// her taking work (<c>Citizen.IsIdleForWork</c>). So it is the more specific answer to
        /// "why is she not working", and it is the one state of the four that the player can undo
        /// without opening the WORK tab at all.
        /// </summary>
        [Test]
        public void HoldPosition_OutranksBothWords()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));
            c.HoldPosition = true;

            Assert.That(GameSession.HasAnyWorkEnabled(c), Is.False,
                "precondition: she is ALSO unassigned, so this leg really is about the precedence");
            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Holding position"));
        }

        // ═════════════════════════ DELIVERABLE 2 — she is alive on screen, on the SHIPPING ship

        /// <summary>
        /// ⭐ <b>"IF SHE IS STANDING STILL, STOP" — the charter's acceptance step 2, driven.</b> A
        /// waiting pawn and a hung game look identical, and the ONLY thing separating them on the
        /// wreck is that she wanders while she waits.
        ///
        /// <para><b>WHAT THIS ADDS TO <c>WorkTypeVetoTests.G1_AFullyVetoedPawn_StillWanders</c>,
        /// which is cited and NOT duplicated.</b> G1 builds a synthetic two-system sim and sets
        /// <c>AutoWander = true</c> BY HAND to pin that the veto does not take the dispatcher's
        /// <c>ClearPath</c> branch. It cannot see the authoring: on this ship the flag is a fact
        /// about <c>AuthoredShips.cs:1993</c>, and "it is authored true today" is a statement about
        /// a tree. This leg boots the SHIPPING wreck through the SHIPPING system stack, gives her
        /// nothing, and requires her to move. Delete the <c>AutoWander = true</c> from the wreck's
        /// <c>CitizenSpec</c> and G1 stays green while the game becomes a still photograph.</para>
        /// </summary>
        [Test]
        public void WreckBootPawn_WithNoWorkEnabled_StillMoves()
        {
            var (_, host) = Wreck();
            var c = Awake(host);
            Assert.That(GameSession.HasAnyWorkEnabled(c), Is.False,
                "precondition: OD-H — she boots with nothing switched on");

            var start = c.Pos;
            bool moved = false;
            for (int t = 0; t < 3000 && !moved; t++)
            {
                host.Sim.Tick();
                if (c.Pos != start) moved = true;
            }

            Assert.That(moved, Is.True,
                "the wreck's boot pawn stands still with no work enabled. 'Waiting' and 'hung' have " +
                "just become the same picture, and the words this package ships cannot fix that.");
            Assert.That(c.JobKind, Is.EqualTo(JobKind.None),
                "…and she did it while holding no job: the movement is the wander, not work she " +
                "was never given (which would be an OD-G regression wearing this leg's green)");
        }

        /// <summary>
        /// The join the player actually sees: while she is wandering on the shipping ship, her
        /// roster row still reads the awaiting sentence. Separate from the motion leg deliberately —
        /// <c>Assert</c> throws, and "she moves" and "the row says why" are the two halves that
        /// have to be true AT THE SAME TIME for the opening to read as a game.
        /// </summary>
        [Test]
        public void WreckBootPawn_ReadsAwaiting_WhileSheWanders()
        {
            var (gs, host) = Wreck();
            var c = Awake(host);

            var start = c.Pos;
            string labelWhileMoving = null;
            for (int t = 0; t < 3000 && labelWhileMoving == null; t++)
            {
                host.Sim.Tick();
                if (c.Pos != start) labelWhileMoving = TaskOnTheWire(gs, c.Id);
            }

            Assert.That(labelWhileMoving, Is.Not.Null, "precondition: she never moved — see the motion leg");
            Assert.That(labelWhileMoving, Is.EqualTo("Awaiting orders"),
                "she is alive on screen AND the row says why nothing is happening. Either one alone " +
                "is a movie: a moving pawn with no explanation, or an explanation over a still frame.");
        }

        // ═════════════════════════════════════ MUTATION 5 — the label path may not start allocating

        /// <summary>
        /// <see cref="GameSession.HasAnyWorkEnabled"/> allocates NOTHING. It runs once per crew
        /// member per render (≤10 Hz) and the obvious spellings of it do not: <c>Enum.GetValues</c>
        /// hands back a fresh array on every call, and any LINQ form boxes.
        ///
        /// <para>MUTATION 5: replace the counted loop with
        /// <c>foreach (WorkType t in Enum.GetValues(typeof(WorkType)))</c> ⇒ RED (measured: ~72
        /// bytes per call against a budget of zero).</para>
        /// </summary>
        [Test]
        public void HasAnyWorkEnabled_IsZeroAlloc()
        {
            var (_, host) = Wreck();
            var c = Awake(host);
            bool sink = GameSession.HasAnyWorkEnabled(c);   // warm the path

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 200_000; i++) sink ^= GameSession.HasAnyWorkEnabled(c);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(sink, Is.False, "the sink is read so the loop cannot be optimised away");
            Assert.That(delta, Is.EqualTo(0),
                "the work-grid query behind the label allocated " + delta + " bytes over 200 000 " +
                "calls. It is on a render path; the counted for-loop over WorkTypeCount exists " +
                "precisely so this is zero.");
        }

        /// <summary>
        /// And the whole label: the AWAITING branch costs exactly ONE string per call — the return
        /// value — and nothing else. This is the leg that would catch an allocation introduced
        /// anywhere in the new branch rather than only inside the predicate.
        ///
        /// <para>⛔ <b>ITS BUDGET HAS BEEN CAUGHT TOO LOOSE TWICE, BY THE LEG AT THE BOTTOM OF
        /// THIS TEST, AND BOTH TIMES BEFORE ANYTHING WAS BELIEVED.</b> A budget assertion is the
        /// easiest guard in this repo to ship dead: it passes on a correct tree AND on the tree its
        /// own mutation row describes.
        /// <list type="number">
        ///   <item>First draft: budget <b>96 B</b> against a branch costing <b>80 B</b> (the
        ///     28-character first-draft string) and an <c>Enum.GetValues</c> costing only
        ///     <b>32 B</b> — 80 + 32 = 112 &gt; 96, so it would in fact have bitten; but it was
        ///     written from "96 is about one string", not from either measurement.</item>
        ///   <item>After the label was shortened to 15 characters the branch cost fell to
        ///     <b>56 B</b> and 56 + 32 = <b>88</b> — EXACTLY the then-budget, so mutation 5 would
        ///     have shipped green by one byte. The last assertion here reported that, in those
        ///     words, and the budget came down to 64 B.</item>
        /// </list>
        /// ⇒ ⚠️ <b>IF THE OWNER REVERSES THE STRING (batch item 11), THIS BUDGET MOVES WITH IT.</b>
        /// It is <c>measured cost + 8</c> and nothing else; the leg below will say so if it is
        /// not.</para>
        /// <para>⚠️ The byte figures above are THIS machine's calibration-time measurements and do
        /// not transfer: the independent review measured <c>Enum.GetValues</c> at ~208 B/call on
        /// the same tree. That is why the non-vacuity leg SELF-SIZES at runtime instead of
        /// trusting any number written here — the prose is history, the leg is the guard.</para>
        /// </summary>
        [Test]
        public void TaskLabel_AddsNoPerCallAllocation_ForTheUnassignedBranch()
        {
            var (gs, host) = Wreck();
            var c = Parked(Awake(host));
            const int N = 20_000;
            const int Budget = 64;   // measured 56 B (the returned 15-char string) + 8 B slack

            Assert.That(gs.TaskLabel(c), Is.EqualTo("Awaiting orders"),
                "precondition: the branch under measurement is the one that is being measured");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < N; i++) { var s = gs.TaskLabel(c); if (s == null) throw new InvalidOperationException(); }
            long perCall = (GC.GetAllocatedBytesForCurrentThread() - before) / N;

            Assert.That(perCall, Is.LessThanOrEqualTo(Budget),
                "the awaiting branch allocates " + perCall + " B per call against a budget of " +
                Budget + " B (one returned string). The StringBuilder is REUSED scratch; anything " +
                "that grows this is a per-render cost on every crew member of every ship.");

            // NON-VACUITY, AND IT IS THE LEG THAT SIZES THE BUDGET. Measure the cheapest allocation
            // mutation 5 could introduce, on the same instrument, and require that ADDING it to the
            // measured cost would break the budget. A bare "this allocates a lot" control does not
            // do that job: what matters is whether the budget can still see the regression.
            long b2 = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < N; i++) { var a = Enum.GetValues(typeof(WorkType)); if (a == null) throw new InvalidOperationException(); }
            long perCallAlloc = (GC.GetAllocatedBytesForCurrentThread() - b2) / N;

            Assert.That(perCallAlloc, Is.GreaterThan(0),
                "the allocation instrument reports ZERO bytes for a per-call array allocation, so " +
                "the budget assertion above is vacuous on this runtime");
            Assert.That(perCall + perCallAlloc, Is.GreaterThan(Budget),
                "THE BUDGET IS TOO LOOSE TO CATCH ITS OWN MUTATION: the branch costs " + perCall +
                " B, mutation 5's Enum.GetValues costs " + perCallAlloc + " B, and " +
                (perCall + perCallAlloc) + " B still fits inside the " + Budget + " B budget. " +
                "Tighten the budget rather than trusting the assertion above.");
        }
    }
}
