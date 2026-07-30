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
    /// ⭐ <b>M2-6 — THE <c>why</c> LINE: the task row finally says why THAT job and not another.</b>
    ///
    /// <para><b>WHAT THE PLAYER WAS MISLED ABOUT.</b> The roster's task label named the job and
    /// nothing else, so a crew member who walked past a fresh strip order to go service a scrubber
    /// looked exactly like a crew member ignoring the player. <i>"She is disobeying me"</i> and
    /// <i>"she ranked it lower"</i> were the same sentence on screen. After this package the line
    /// carries the number that chose the job: <i>"Servicing scrubber_ls — Repair is priority 1"</i>.</para>
    ///
    /// <para>⛔ <b>THE VOCABULARY IS M2-20'S AND THIS PACKAGE ADDS NO WORD TO IT.</b> M2-20 owns the
    /// two words for doing nothing — <b>"Awaiting orders"</b> (the player has switched nothing on)
    /// and <b>"Idle"</b> (she is enabled and has nothing reachable to do) — and M2-6 is their SECOND
    /// consumer. Two packages writing prose about the same pawn on the same wire field is how a repo
    /// acquires two names for one predicate, so every leg below that touches a job-less state
    /// asserts M2-20's exact string with nothing appended.</para>
    ///
    /// <para><b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30).</b> Each row was
    /// edited into the shipped tree, <c>WhyLineTests</c> + <c>AwaitingOrdersTests</c> +
    /// <c>WebTaskLabelTests</c> were run together (BASELINE: 32 green), and the tree was restored
    /// from an in-memory copy — never <c>git checkout</c> (TRAPS 2). The run's own report:</para>
    /// <list type="table">
    ///   <item><b>1</b> drop <c>AppendRankingClause</c>'s <c>CountWorkEnabled(c) &lt; 2</c> refusal ⇒
    ///     <b>RED 1 of 32</b>: <see cref="ExactlyOneWorkTypeEnabled_TheLineSaysNothingAboutRanking"/>.
    ///     ⭐ Every other leg stayed green, which is the blinding working.</item>
    ///   <item><b>1b</b> the GUARDLESS clause — all three refusals deleted, <c>TryOf</c>'s return
    ///     value discarded (the ignored-<c>out</c> spelling) ⇒ <b>RED 21 of 32</b>, among them
    ///     <see cref="NoWorkTypeEnabled_AndNoJob_ReadsTheUnassignedWordAndNothingElse"/> reading
    ///     <i>"Awaiting orders — Repair is priority 0"</i>, and M2-20's own
    ///     <c>NoWorkEnabled_ReadsTheAwaitingSentence</c>. ⚠️ It takes all three because EACH refusal
    ///     independently blocks an unassigned pawn — the belt-and-braces the charter asked for, and
    ///     the reason the two rows below exist to pin them one at a time.</item>
    ///   <item><b>1b (the reachable half)</b> drop the <c>CanTakeWorkType</c> refusal ⇒ <b>RED 1 of
    ///     32</b>: <see cref="MidJob_OnAWorkTypeSinceSwitchedOff_TheLineClaimsNoRanking"/>
    ///     (<i>"Hauling … — Haul is priority 0"</i>). ⛔ <b>THIS ROW WAS MEASURED GREEN ONCE</b>,
    ///     against a first draft whose pawn had every work type off — the one-candidate refusal was
    ///     quietly doing the work and the leg could not see which guard it was pinning. See that
    ///     test.</item>
    ///   <item><b>2</b> name a constant work type (<c>WorkTypeWords[(int)WorkType.Repair]</c>) ⇒
    ///     <b>RED 3 of 32</b>: <see cref="Stripping_TheClauseNamesDeconstructAtItsOwnBand"/>, plus
    ///     the two legs whose preconditions read an exact clause. ⭐
    ///     <see cref="Servicing_TheClauseNamesRepairAtItsOwnBand"/> STAYED GREEN — which is exactly
    ///     why the mapping is driven from BOTH ends on the SAME grid.</item>
    ///   <item><b>3</b> allocate per call — <c>type.ToString()</c> in place of the
    ///     <c>WorkTypeWords</c> lookup ⇒ <b>RED 1 of 32</b>:
    ///     <see cref="TaskLabel_AddsNoPerCallAllocation_WhenTheClauseIsEmitted"/> (136 B measured
    ///     against a 120 B budget). ⛔ The FIRST spelling of this row
    ///     (<c>band.ToString(InvariantCulture)</c>) was measured at <b>0 B</b> and could never have
    ///     gone red — see that test.</item>
    ///   <item><b>4</b> read the priority from a HOST-SIDE copy — a <c>Dictionary&lt;uint,byte&gt;</c>
    ///     band cache filled on first call ⇒ <b>RED 3 of 32</b>, led by
    ///     <see cref="FlippingThePriority_TheNextFramesClauseFollows"/>.</item>
    ///   <item><b>5</b> emit M2-20's UNASSIGNED word from the <c>else</c> arm (the enabled,
    ///     nothing-to-do pawn) ⇒ <b>RED 3 of 32</b>:
    ///     <see cref="TwoWorkTypesEnabled_NothingToDo_ReadsIdle_WithNoClause"/> together with
    ///     M2-20's <c>WorkEnabled_AndNothingToDo_ReadsIdle</c> and
    ///     <c>WebTaskLabelTests.NoJob_Tells_Idle_Holding_And_Aimless_Walking_Apart</c> — which is
    ///     the point of the row: all three consumers of the vocabulary say the same thing.</item>
    /// </list>
    ///
    /// <para><b>EVERY EXPECTED STRING IS A LITERAL</b>, never <see cref="GameSession"/>'s own
    /// constant or table — <c>Perilune.Tests.csproj</c> compiles <c>GameSession.cs</c> into this
    /// assembly, so asserting against <c>WorkTypeWords</c> would be <c>Is.EqualTo(the thing under
    /// test)</c>. The ONE deliberate exception is
    /// <see cref="EveryWorkType_HasTheSimsOwnWordInTheHostsTable"/>, whose whole subject is that the
    /// host's table and the SIM's enum have not drifted apart.</para>
    ///
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-6". Owner decisions:
    /// OD-G, OD-H (the grid boots off, so a two-work-type fixture must grant both EXPLICITLY or the
    /// leg is vacuous).</para>
    /// </summary>
    [TestFixture]
    public class WhyLineTests
    {
        // ------------------------------------------------------------------ fixtures

        /// <summary>The SHIPPING game — <c>--ship wreck</c> is what <c>./play.sh</c> opens
        /// (<c>WebHostDefaultShipTests</c>), and the charter's acceptance is read on it. NOT started
        /// ⇒ no sim thread; these legs set job state by hand and render.</summary>
        private static (GameSession Gs, SimHost Host) Wreck()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, _ => { });
            return (gs, host);
        }

        /// <summary>The wreck's one awake crew member, parked: no job, no path, not held. Every leg
        /// starts here so a difference between two legs is the WORK GRID and the job, and nothing
        /// else. ⚠️ Her grid is left at OD-H's all-off boot value — each leg grants what it needs.</summary>
        private static Citizen Parked(SimHost host)
        {
            var c = host.Sim.Citizens.Items.First(x => !x.Dead);
            c.ClearPath();
            c.JobKind = JobKind.None;
            c.HoldPosition = false;
            c.CarryingItemId = 0;
            c.ReservedItemId = 0;
            return c;
        }

        /// <summary>A device the SIM's own tile lookup resolves back to, so the label names it (a
        /// tile can carry a machine and a conduit at once). Named, so <c>DeviceLabel</c> returns the
        /// existing string rather than allocating a lower-cased enum name — which the allocation leg
        /// depends on.</summary>
        private static Device SelfResolvingNamed(SimHost host)
            => host.Sim.Devices.Items.FirstOrDefault(d =>
                !string.IsNullOrEmpty(d.Name) &&
                host.Sim.TryGetDeviceAt(d.Pos, out var r) && r.Id == d.Id);

        /// <summary>A tile on this crew member's own deck that carries NO device — a wall strip
        /// site, so the label takes the "Stripping the wall at x,y" arm and no device name enters
        /// the expected string. Same deck ⇒ no " on deck N" suffix.</summary>
        private static Int3 BareTileOn(SimHost host, Citizen c)
        {
            for (int y = 0; y < 40; y++)
                for (int x = 0; x < 40; x++)
                {
                    var p = new Int3(x, y, c.Pos.Z);
                    if (!host.Sim.TryGetDeviceAt(p, out _)) return p;
                }
            throw new InvalidOperationException("no device-free tile on this deck — the fixture cannot build a wall strip");
        }

        private static string Tile(Int3 p) =>
            p.X.ToString(CultureInfo.InvariantCulture) + "," + p.Y.ToString(CultureInfo.InvariantCulture);

        /// <summary>Read this crew member's <c>task</c> out of the RENDERED roster channel — the
        /// bytes the client is actually sent, not a direct call to the labeller. Both standard
        /// surfaces read this field, so this is where the claim belongs.</summary>
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

        /// <summary>⭐ THE GRID EVERY MAPPING LEG SHARES: Repair 1, Deconstruct 4 — two work types,
        /// two DIFFERENT bands, BOTH GRANTED EXPLICITLY. Under OD-H nothing is on at boot, so a
        /// fixture that forgot this would be measuring the one-candidate refusal and passing for the
        /// wrong reason; and two types at the SAME band could not tell a wrong-work-type clause from
        /// a right one. This is the player state the charter's acceptance step 1 describes.</summary>
        private static Citizen RepairOneStripFour(Citizen c)
        {
            c.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);        // 1
            c.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Lowest);    // 4
            Assert.That(GameSession.CountWorkEnabled(c), Is.EqualTo(2),
                "precondition: EXACTLY two work types are on, so the clause's own refusals are not " +
                "what this leg is measuring");
            return c;
        }

        // ═══════════════════════════════════════ MUTATION 2 — the clause names the RIGHT work type
        // Two legs, one grid, opposite ends of the mapping, and neither mentions the other's string.
        // A clause hard-wired to one work type passes exactly one of them.

        /// <summary>
        /// ⭐ <b>THE HEADLINE, AND IT IS THE CHARTER'S OWN SENTENCE.</b> She is stripping; the line
        /// says so AND says that Deconstruct is the priority-4 work she is doing it under. The
        /// player can now read the row against the WORK tab and see the ranking, instead of guessing
        /// whether their order was refused.
        ///
        /// <para>MUTATION 2: name a constant work type in the clause ⇒ RED here (and in the two
        /// legs whose PRECONDITIONS read an exact clause), while
        /// <see cref="Servicing_TheClauseNamesRepairAtItsOwnBand"/> stays green — the constant it
        /// happens to name.</para>
        /// </summary>
        [Test]
        public void Stripping_TheClauseNamesDeconstructAtItsOwnBand()
        {
            var (gs, host) = Wreck();
            var c = RepairOneStripFour(Parked(host));
            var site = BareTileOn(host, c);
            c.JobKind = JobKind.Deconstruct;
            c.JobTarget = site;

            Assert.That(TaskOnTheWire(gs, c.Id),
                Is.EqualTo("Stripping the wall at " + Tile(site) + " — Deconstruct is priority 4"),
                "the row must name the work type the CURRENT job belongs to and the priority that " +
                "chose it. Naming Repair here would be the plausible-prose-over-the-wrong-state " +
                "failure: it is the other cell in the same grid and it reads perfectly.");
        }

        /// <summary>
        /// The mirror, on the SAME grid: the job changes, and so must the clause. Separate
        /// <c>[Test]</c> deliberately — <c>Assert</c> throws (CLAUDE.md fifth trap), and "the
        /// mapping is a mapping" is precisely the claim one leg cannot make.
        /// </summary>
        [Test]
        public void Servicing_TheClauseNamesRepairAtItsOwnBand()
        {
            var (gs, host) = Wreck();
            var device = SelfResolvingNamed(host);
            Assert.That(device, Is.Not.Null, "the wreck has a named device the sim resolves by tile");
            var c = RepairOneStripFour(Parked(host));
            c.JobKind = JobKind.Maintain;
            c.JobTarget = device.Pos;

            Assert.That(TaskOnTheWire(gs, c.Id),
                Is.EqualTo("Servicing " + device.Name + " — Repair is priority 1"),
                "same crew member, same grid, different job ⇒ a DIFFERENT clause. A label that " +
                "reports the grid's top row rather than the job in hand would pass the other leg " +
                "and fail here.");
        }

        // ═════════════════════════════ MUTATION 1 — say nothing when there is nothing to say

        /// <summary>
        /// ⭐ <b>ONE CANDIDATE IS NOT A CHOICE.</b> With Repair the only work type switched on,
        /// <i>"Servicing scrubber_ls — Repair is priority 1"</i> explains nothing: there was no
        /// other job she could have taken. Under OD-H that is the state of nearly every crew member
        /// for the player's whole first hour, so noise here is not a rare cosmetic cost — it is what
        /// the line looks like almost all of the time.
        ///
        /// <para>MUTATION 1: delete the <c>CountWorkEnabled(c) &lt; 2</c> refusal ⇒ RED here, and
        /// only here.</para>
        /// </summary>
        [Test]
        public void ExactlyOneWorkTypeEnabled_TheLineSaysNothingAboutRanking()
        {
            var (gs, host) = Wreck();
            var device = SelfResolvingNamed(host);
            Assert.That(device, Is.Not.Null, "the wreck has a named device the sim resolves by tile");
            var c = Parked(host);
            c.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            Assert.That(GameSession.CountWorkEnabled(c), Is.EqualTo(1),
                "precondition: exactly ONE work type is on — the state this leg is about");
            c.JobKind = JobKind.Maintain;
            c.JobTarget = device.Pos;

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Servicing " + device.Name),
                "with one work type enabled the ranking clause answers a question nobody can ask. " +
                "The line must read exactly as it did before this package.");
        }

        // ═════════════ MUTATION 1b — an UNASSIGNED crew member is not ranking anything (REFUSED)

        /// <summary>
        /// ⛔ <b>NO CLAUSE MAY EVER TOUCH M2-20's UNASSIGNED SENTENCE.</b> A crew member the player
        /// has given no work is not doing job X in preference to job Y — she is waiting, and that is
        /// the whole content of the row. This is the boot state of every crew member on every new
        /// game (OD-G/OD-H), so it is the sentence the player reads first and longest.
        ///
        /// <para>MUTATION 1b: the GUARDLESS clause — discard <see cref="WorkTypeMap.TryOf"/>'s
        /// return value and delete the other two refusals with it ⇒ the enum's natural zero is
        /// appended as a work type and the row reads <i>"Awaiting orders — Repair is priority 0"</i>
        /// ⇒ RED here. It takes all three because each of them independently refuses an unassigned
        /// pawn, which is the belt-and-braces the charter asked for. Exact equality is what makes
        /// this leg able to see it: <c>StartsWith</c> could not.</para>
        /// </summary>
        [Test]
        public void NoWorkTypeEnabled_AndNoJob_ReadsTheUnassignedWordAndNothingElse()
        {
            var (gs, host) = Wreck();
            var c = Parked(host);
            Assert.That(GameSession.CountWorkEnabled(c), Is.EqualTo(0),
                "precondition: OD-H boots every work type off, and this leg is about that state");

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Awaiting orders"),
                "M2-20's word, alone. A ranking clause here is plausible prose over a state it does " +
                "not describe — she ranked nothing, because she was given nothing to rank.");
        }

        /// <summary>
        /// The half of mutation 1b that is REACHABLE WITH A JOB IN HAND, and it is not theoretical:
        /// the haul veto is asked at the CLAIM only, so a crew member finishes a delivery whose work
        /// type the player switched off mid-carry (<c>WorkTypeVetoTests.MidHaul_HaulSwitchedOff_DeliveryStillCompletes</c>
        /// pins that ruling). Her Haul cell is now BLANK, so <i>"Haul is priority 0"</i> would be a
        /// lie about the grid the player is looking at.
        ///
        /// <para>⛔ <b>AND THE OTHER TWO WORK TYPES STAY ON, WHICH IS THE WHOLE DIFFICULTY.</b> The
        /// first draft of this leg switched EVERYTHING off — and the mutation loop reported it GREEN
        /// under its own mutation, because an all-off pawn is refused by the one-candidate rule as
        /// well and the leg could not see which guard was doing the work (TRAPS, 4th shape: a scope
        /// filter that excludes the violation). With Repair and Deconstruct on, the count refusal is
        /// satisfied and <see cref="Citizen.CanTakeWorkType"/> is the ONLY thing standing between
        /// the player and <i>"Haul is priority 0"</i>.</para>
        ///
        /// <para><b>THE FIRST HALF IS THIS LEG'S OWN NON-VACUITY CONTROL</b> — the identical fixture
        /// with Haul switched ON must PRODUCE a clause. Without it, <c>Does.Not.Contain</c> would
        /// pass on a package that had simply stopped emitting clauses at all.</para>
        ///
        /// <para>MUTATION 1b (reachable half): drop the <c>CanTakeWorkType</c> refusal ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void MidJob_OnAWorkTypeSinceSwitchedOff_TheLineClaimsNoRanking()
        {
            var (gs, host) = Wreck();
            var c = RepairOneStripFour(Parked(host));
            c.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            c.JobKind = JobKind.HaulDeliver;
            c.JobTarget = BareTileOn(host, c);

            // CONTROL: while Haul IS on, this very fixture does emit a clause.
            Assert.That(TaskOnTheWire(gs, c.Id), Does.EndWith(" — Haul is priority 4"),
                "non-vacuity: with Haul enabled this fixture must reach the clause, or the assertion " +
                "below is satisfied by a package that emits no clauses at all");

            c.SetWorkPriority(WorkType.Haul, WorkPriority.Off);   // the player blanks the cell mid-carry
            Assert.That(c.CanTakeWorkType(WorkType.Haul), Is.False,
                "precondition: she is finishing a delivery for work she is no longer assigned");
            Assert.That(GameSession.CountWorkEnabled(c), Is.EqualTo(2),
                "precondition: two OTHER work types are still on, so the one-candidate refusal is " +
                "NOT what this leg is measuring");

            Assert.That(TaskOnTheWire(gs, c.Id), Does.Not.Contain(" is priority "),
                "a blank grid cell has no priority to report. Printing the stored zero would put a " +
                "number on screen that the WORK tab shows as empty — two answers to one question.");
        }

        // ═══════════════ MUTATION 5 — the single-vocabulary leg: idle is NOT unassigned

        /// <summary>
        /// ⭐ <b>M2-6 IS M2-20's SECOND CONSUMER, AND THIS IS WHERE THEY ARE MADE TO AGREE.</b> A
        /// crew member with TWO work types on and nothing reachable to do is <c>"Idle"</c> — the
        /// player has already given the order and there is nothing to do with it. She is NOT
        /// awaiting orders, and she gets no ranking clause either: she is not doing anything, so
        /// there is no chosen job to explain.
        ///
        /// <para><b>WHAT THIS ADDS TO <c>AwaitingOrdersTests.WorkEnabled_AndNothingToDo_ReadsIdle</c>,
        /// which is cited and not duplicated.</b> That leg drives ONE work type — the state in which
        /// this package's clause is refused anyway. This one drives TWO, which is the only state in
        /// which the clause CAN fire, and requires that it still does not.</para>
        ///
        /// <para>MUTATION 5: emit the unassigned word from the <c>else</c> arm ⇒ RED here.</para>
        /// </summary>
        [Test]
        public void TwoWorkTypesEnabled_NothingToDo_ReadsIdle_WithNoClause()
        {
            var (gs, host) = Wreck();
            var c = RepairOneStripFour(Parked(host));
            Assert.That(c.JobKind, Is.EqualTo(JobKind.None),
                "precondition: she holds no job while we read the label");

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo("Idle"),
                "'enabled with nothing to do' and 'given nothing to do' are different facts and " +
                "this package must not collapse them — nor decorate the first with a ranking for a " +
                "job that does not exist.");
        }

        // ═══════════════════════ MUTATION 4 — the number is read FRESH from the citizen

        /// <summary>
        /// ⭐ <b>THE PLAYER'S OWN GESTURE, DRIVEN: flip the cell, watch the line.</b> The charter's
        /// acceptance step 1 ends "…and watch the clause change". A band cached beside the roster
        /// would make the WORK tab look inert at the exact moment it is being used, and the row would
        /// keep asserting a ranking the player has just overruled.
        ///
        /// <para>MUTATION 4: cache the band on first call and reuse it ⇒ RED here (the second read
        /// still says 4).</para>
        /// </summary>
        [Test]
        public void FlippingThePriority_TheNextFramesClauseFollows()
        {
            var (gs, host) = Wreck();
            var c = RepairOneStripFour(Parked(host));
            var site = BareTileOn(host, c);
            c.JobKind = JobKind.Deconstruct;
            c.JobTarget = site;
            string prefix = "Stripping the wall at " + Tile(site);

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo(prefix + " — Deconstruct is priority 4"),
                "precondition: the first frame reports the band she was given");

            c.SetWorkPriority(WorkType.Deconstruct, WorkPriority.Highest);   // the player's click

            Assert.That(TaskOnTheWire(gs, c.Id), Is.EqualTo(prefix + " — Deconstruct is priority 1"),
                "the clause is a claim about the grid as it is NOW. It must be re-read from the " +
                "Citizen every frame, never copied host-side when the roster row was built.");
        }

        // ═══════════════════════ MUTATION 3 — the label path may not start allocating

        /// <summary>
        /// The clause costs NOTHING beyond the string the label already returns. It is built into
        /// <c>GameSession._task</c>, the reused scratch builder, and it runs once per crew member
        /// per render on every ship.
        ///
        /// <para><b>THE BRANCH IS CHOSEN SO THE MEASUREMENT IS OF THIS PACKAGE.</b> <c>Maintain</c>
        /// on a NAMED device returns an existing string from <c>DeviceLabel</c> and never calls
        /// <c>AppendTile</c> — which allocates two coordinate strings of its own, pre-existing and
        /// not this package's to fix. So the whole per-call cost here is the returned label.</para>
        ///
        /// <para>MUTATION 3: write <c>type.ToString()</c> in place of the <c>WorkTypeWords</c>
        /// lookup — the spelling the table exists to prevent ⇒ RED.</para>
        ///
        /// <para>⛔ <b>AND THE BUDGET IS SIZED BY ITS OWN NON-VACUITY LEG, NOT BY A NUMBER WRITTEN
        /// HERE — WHICH IS WHAT CAUGHT THE FIRST DRAFT OF THIS TEST.</b> Mutation 3 was first
        /// written as <c>band.ToString(CultureInfo.InvariantCulture)</c> instead of the clause's
        /// <c>char</c>, and the non-vacuity leg reported <b>0 B per call</b>: .NET 8 returns a
        /// CACHED string for a byte under 300, so that mutation could never have gone red and the
        /// whole allocation guard would have shipped believing it had a subject. The named mutation
        /// is now the one the shipped code is actually defending against — the enum name — measured
        /// at 24 B/call. (M2-20's twin budget was caught too loose TWICE for the same family of
        /// reason, and its byte figures did not transfer between machines: 32 B here, ~208 B on the
        /// reviewer's. Hence the runtime self-sizing rather than any number in this prose.)</para>
        /// </summary>
        [Test]
        public void TaskLabel_AddsNoPerCallAllocation_WhenTheClauseIsEmitted()
        {
            var (gs, host) = Wreck();
            var device = SelfResolvingNamed(host);
            Assert.That(device, Is.Not.Null, "the wreck has a named device the sim resolves by tile");
            var c = RepairOneStripFour(Parked(host));
            c.JobKind = JobKind.Maintain;
            c.JobTarget = device.Pos;
            const int N = 20_000;

            string label = gs.TaskLabel(c);
            Assert.That(label, Is.EqualTo("Servicing " + device.Name + " — Repair is priority 1"),
                "precondition: the branch under measurement is the one that emits the clause");
            // The budget is ONE returned string of this length. 24 B of object header + 2 B per
            // char, rounded up to the allocator's 8-byte granularity, plus 8 B of slack.
            int budget = ((24 + 2 * label.Length + 7) / 8) * 8 + 8;

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < N; i++) { var s = gs.TaskLabel(c); if (s == null) throw new InvalidOperationException(); }
            long perCall = (GC.GetAllocatedBytesForCurrentThread() - before) / N;

            Assert.That(perCall, Is.LessThanOrEqualTo(budget),
                "the clause branch allocates " + perCall + " B per call against a budget of " +
                budget + " B (the one returned string). The StringBuilder is REUSED scratch and the " +
                "work-type word is a table lookup precisely so nothing else is on this path.");

            // NON-VACUITY, AND IT SIZES THE BUDGET. Measure mutation 3's own cheapest spelling on
            // the same instrument and require that adding it would break the assertion above. A
            // bare "this allocates" control does not answer that question.
            var type = WorkType.Repair;
            long b2 = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < N; i++)
            { var s = type.ToString(); if (s == null) throw new InvalidOperationException(); }
            long perCallAlloc = (GC.GetAllocatedBytesForCurrentThread() - b2) / N;

            Assert.That(perCallAlloc, Is.GreaterThan(0),
                "the allocation instrument reports ZERO bytes for a per-call Enum.ToString(), so " +
                "the budget assertion above is vacuous on this runtime and WorkTypeWords is " +
                "defending against nothing measurable");
            Assert.That(perCall + perCallAlloc, Is.GreaterThan(budget),
                "THE BUDGET IS TOO LOOSE TO CATCH ITS OWN MUTATION: the branch costs " + perCall +
                " B, mutation 3's Enum.ToString() costs " + perCallAlloc + " B, and " +
                (perCall + perCallAlloc) + " B still fits inside the " + budget + " B budget.");
        }

        // ═════════════════════════════════ contracts the two tables owe the enums they mirror

        /// <summary>
        /// ⛔ <b>THE HOST'S WORD TABLE IS A HAND-MIRRORED PAIR AND IS PINNED TO WHAT IT MIRRORS.</b>
        /// <c>GameSession.WorkTypeWords</c> exists only because <c>Enum.ToString()</c> allocates on a
        /// render path; it must therefore SAY what the enum says. Without this leg, declaring a
        /// seventh <see cref="WorkType"/> would throw an <c>IndexOutOfRangeException</c> out of a
        /// render the first time anyone did that work — and re-ordering the enum would silently
        /// re-address every word, which no test would see because every word is still a valid word.
        ///
        /// <para>This is the one leg allowed to read the host's own table: its subject IS the pair.</para>
        /// </summary>
        [Test]
        public void EveryWorkType_HasTheSimsOwnWordInTheHostsTable()
        {
            string[] words = GameSession.WorkTypeWords;
            Assert.That(words.Length, Is.EqualTo(WorkPriority.WorkTypeCount),
                "the table has " + words.Length + " words for " + WorkPriority.WorkTypeCount +
                " work types — a clause for the missing one would throw out of a render");

            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                Assert.That(words[t], Is.EqualTo(((WorkType)t).ToString()),
                    "slot " + t + " reads '" + words[t] + "' where the sim's own vocabulary says '" +
                    ((WorkType)t) + "'. The table is a zero-alloc cache of the enum, not a second " +
                    "opinion about what the work is called.");
        }

        /// <summary>
        /// The clause writes the priority as <c>(char)('0' + band)</c>, which is culture-free and
        /// allocation-free BY DOMAIN: a manual priority is 1..<see cref="WorkPriority.Lowest"/> and
        /// <see cref="Citizen.SetWorkPriority"/> throws outside it. ⚠️ Widen that domain past 9 and
        /// the same line silently emits punctuation (<c>':'</c> for 10) instead of a number — a
        /// wrong answer that still renders. This is the leg that makes that impossible to do
        /// quietly.
        /// </summary>
        [Test]
        public void AManualPriorityIsAlwaysASingleDigit()
        {
            Assert.That(WorkPriority.Lowest, Is.LessThanOrEqualTo(9),
                "the lowest manual priority is " + WorkPriority.Lowest + ", so a priority no longer " +
                "fits in one character and the why-line's char arithmetic must become a real format");
        }
    }
}
