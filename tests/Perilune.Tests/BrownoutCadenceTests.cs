using System.Globalization;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice — the boot a player gets

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>THE BROWNOUT CADENCE — D6's own ledger, settled.</b>
    ///
    /// <para><b>THE PLAYER SENTENCE THIS FILE DRIVES:</b> <i>at day 4+ the ship's log still tells the
    /// whole story — the boot lines and the real faults survive, and a power grid that flaps all day
    /// reads as episodes rather than as a ticker.</i></para>
    ///
    /// <para><b>THE DEFECT, MEASURED ON THE UNATTENDED SHIPPED WRECK BEFORE THIS PACKAGE</b> (the
    /// OD-H default, work grid OFF, booted through <see cref="SimHost"/> so the real MOSS rules
    /// load). D6 bounded a flapping network to one entry per sim-HOUR, and on a network that never
    /// stops flapping that is still a ticker: <b>23–24 <see cref="HistoryKind.Brownout"/> entries a
    /// sim-day, the ring's single dominant producer</b>. Driven, four marks, BEFORE re-derived on
    /// this tree with <c>RecordBrownout</c>'s backoff reverted in place (TRAPS 2 — patched, run,
    /// restored from an in-memory copy with the mtime moved FORWARD):</para>
    ///
    /// <code>
    ///                       day 1.50      day 3.00      day 4.50      day 6.00
    ///   ring    BEFORE      49            128           200 FULL      200 FULL
    ///           AFTER       23            70            113           155
    ///   boot    BEFORE      4             4             2             0
    ///           AFTER       4             4             4             4
    ///   Brownout BEFORE     33            69            105           97
    ///           AFTER       7             11            16            20
    ///   oldest  BEFORE      t=0           t=0           t=0           t=1 714 581
    ///           AFTER       t=0           t=0           t=0           t=0
    /// </code>
    ///
    /// <para>⚠️ <b>WORK ON, THE DEFECT DOES NOT REPRODUCE THE SAME WAY, so these fixtures are
    /// UNATTENDED</b> — <see cref="RingSaturationTests"/>' header records the measurement for the
    /// klaxon half and the reason is shared: a crewed ship is a different ship.</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED</b> (CLAUDE.md fifth shape): <c>Assert</c> throws, so multi-leg
    /// tests record into locals and assert inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class BrownoutCadenceTests
    {
        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static HistorySystem History(Simulation sim)
        {
            for (int i = 0; i < sim.Systems.Length; i++)
                if (sim.Systems[i] is HistorySystem h) return h;
            return null;
        }

        private static Simulation BareSim()
            => new Simulation(AsciiWorld.Build(new[] { "#####", "#...#", "#####" }), 7, new ISimSystem[0]);

        // Publish-then-swap, exactly as ChronicleSignalTests and HistorySystemTests do it: the bus
        // serves the PREVIOUS tick's buffer, so a swap moves a freshly-published event into place.
        private static void Flap(Simulation sim, HistorySystem h, ushort networkId, bool inBrownout, long atTick)
        {
            while (sim.TickCount < atTick) sim.Tick();
            sim.Events.Publish(new BrownoutChangedEvent { NetworkId = networkId, InBrownout = inBrownout });
            sim.Events.SwapBuffers();
            h.Tick(sim);
        }

        // ═════════════════════════════════════════════════════════ 1. THE OUTCOME TEST, on the wreck

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST, AT THE MARK WHERE THE DEFECT BITES.</b> Boot the SHIPPED wreck
        /// the way a player does, leave it unattended to <b>day 4.50</b> — the mark at which the ring
        /// measured 200/200 with two of its four boot lines already evicted — and assert the three
        /// things a player would notice:
        ///
        /// <list type="number">
        /// <item><b>the flapping grid is bounded ABSOLUTELY</b>, not merely "fewer than before"
        /// (CLAUDE.md seventh shape: a ratio cannot see a 2× scale error);</item>
        /// <item><b>the ship's own premise survives</b> — every tick-0 boot line is still readable;
        /// and</item>
        /// <item><b>nothing is evicted at all</b> — the ring is under
        /// <see cref="HistorySystem.MaxEntries"/>, which is the whole defect.</item>
        /// </list>
        ///
        /// <para><b>NON-VACUITY IS ASSERTED BY INCLUSION, TWO WAYS, and the second one is the one
        /// that matters.</b> The run must have produced a genuinely CHRONIC network — an episode
        /// that folded thousands of edges — and at least one episode must have reached
        /// <see cref="HistorySystem.BrownoutMaxRunStep"/>. Without that second clause the cap below
        /// is satisfied by a ship whose grid browned out four times and went quiet, i.e. by a fixture
        /// that never exercises the backoff this package is.</para>
        ///
        /// <para><b>MUTATION, APPLIED AND OBSERVED:</b> with the backoff reverted in place (the
        /// window fixed at <see cref="HistorySystem.BrownoutQuietTicks"/> and no run step) this mark
        /// reads 200 entries / 105 Brownout / 2 boot lines, and three of the four clauses below
        /// fail.</para>
        ///
        /// <para>⚠️ <b>COST:</b> 3 888 000 ticks, ~90 s. It is the cheapest horizon that can see the
        /// defect at all — at day 3.00 the pre-fix ring is 128 entries and every boot line still
        /// survives, so a shorter run answers a different question.</para>
        /// </summary>
        [Test]
        public void TheShipsLog_SurvivesAChronicallyFlappingGrid_AtDayFourAndAHalf()
        {
            // day 4.50 = 4.5 × 864 000.
            const int Ticks = 3888000;

            // NO GiveAllCrewAllWork: OD-H boots every work type OFF, and this is the ship a
            // playtester is looking at before they open the WORK tab.
            var sim = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck).Sim;
            var history = History(sim);
            Assert.That(history, Is.Not.Null, "precondition: the default stack carries a HistorySystem");
            int bootLines = history.Entries.Count(e => e.Tick == 0);
            Assert.That(bootLines, Is.GreaterThan(0),
                "precondition: this ship writes lines at tick 0 (the four breached capsules) — they " +
                "are the landmark, so they have to exist before the drive");

            for (int i = 0; i < Ticks; i++) sim.Tick();

            var episodes = history.Entries.Where(e => e.Kind == (byte)HistoryKind.Brownout).ToList();
            int brownouts = episodes.Count;
            int total = history.Entries.Count;
            int survivingBootLines = history.Entries.Count(e => e.Tick == 0);
            uint biggestEpisode = episodes.Select(e => HistorySystem.BrownoutEdges(e.SubjectB))
                                          .DefaultIfEmpty(0u).Max();
            uint deepestStep = episodes.Select(e => HistorySystem.BrownoutRunStep(e.SubjectB))
                                       .DefaultIfEmpty(0u).Max();

            // THE ABSOLUTE BOUND, derived and then written as a number rather than re-derived with
            // the code's own expression. A run climbs to the ceiling in at most
            // BrownoutMaxRunStep + 1 = 4 episodes, after which each further episode costs a full
            // ceiling window of 288 000 ticks — so ONE network can own at most
            // 4 + ceil(3 888 000 / 288 000) + 1 = 18 entries in this window. Measured on this
            // fixture: 16. Pre-fix at the same mark: 105.
            const int MaxBrownoutEntriesInThisWindow = 20;

            Assert.Multiple(() =>
            {
                Assert.That(biggestEpisode, Is.GreaterThan(1000u),
                    "NON-VACUITY: some episode must have folded a real flap (thousands of edges), " +
                    "or the cap below is satisfied by a ship with no power problem at all");
                Assert.That(deepestStep, Is.EqualTo(HistorySystem.BrownoutMaxRunStep),
                    "NON-VACUITY BY INCLUSION: the run must have reached the backoff CEILING, or " +
                    "this fixture never exercises the mechanism under test and the cap below is met " +
                    "by a grid that browned out a handful of times and went quiet");
                Assert.That(brownouts, Is.LessThanOrEqualTo(MaxBrownoutEntriesInThisWindow),
                    "the flap is not bounded: " + brownouts.ToString(CultureInfo.InvariantCulture) +
                    " brownout entries in " + Ticks.ToString(CultureInfo.InvariantCulture) +
                    " ticks against a " +
                    HistorySystem.BrownoutEpisodeWindow(HistorySystem.BrownoutMaxRunStep)
                                 .ToString(CultureInfo.InvariantCulture) + "-tick ceiling window");
                Assert.That(total, Is.LessThan(HistorySystem.MaxEntries),
                    "the ring is FULL (" + total.ToString(CultureInfo.InvariantCulture) + " of " +
                    HistorySystem.MaxEntries.ToString(CultureInfo.InvariantCulture) +
                    ") — something was evicted, which is the whole defect");
                Assert.That(survivingBootLines, Is.EqualTo(bootLines),
                    "THE LANDMARK: every tick-0 line must still be readable at day 4.50. Before " +
                    "this package the ring was 200/200 here with two of the four already gone, and " +
                    "by day 6.00 the ship's own premise had been evicted from its own log entirely");
            });
        }

        // ═══════════════════════════════════════ 2. the backoff's contract, driven small + the VALUE

        /// <summary>
        /// ⭐ <b>THE BACKOFF'S CONTRACT AND ITS CONSTANT, IN ONE PLACE.</b> A network that never goes
        /// quiet climbs one step per expired window until it hits
        /// <see cref="HistorySystem.BrownoutMaxRunStep"/> and stays there; a network that DOES go
        /// quiet for a whole window starts over at the ordinary sim-hour.
        ///
        /// <para>⭐ <b>THE CONTINUATION TEST IS BRACKETED FROM BOTH SIDES</b>, because a suite that
        /// only tested "it climbs" would survive a rule that never resets — which is the failure
        /// that makes a rare fault invisible. Leg A drives four consecutive expiries and reads the
        /// step off every entry; leg B lets the same network go quiet for two full windows and
        /// requires the next episode back at step 0.</para>
        ///
        /// <para>⚠️ <b>AND THE VALUE IS PINNED BY A LITERAL, BECAUSE EVERYTHING ELSE HERE SCALES
        /// WITH IT</b> (CLAUDE.md seventh shape, and <see cref="RingSaturationTests"/> walked into
        /// exactly this). Every tick below is derived FROM the constants, so this file is green at a
        /// ceiling of 2 or 5 as readily as at 3. The two literal assertions at the top of the block
        /// are the only thing in the repo that holds the number, and they carry the sizing claim the
        /// constant exists to make.</para>
        ///
        /// <para>⛔ <b>THE NAMED MUTATIONS, APPLIED AND OBSERVED:</b> (a) <c>gap &lt; window * 2</c>
        /// → <c>gap &lt; window</c> (the run can never continue — the pre-package behaviour) leaves
        /// every entry at step 0 and leg A fails on the first climb; (b) → an unconditional
        /// continuation (drop the reset arm) leaves leg B at step 1 where it demands 0; (c) measuring
        /// the window from the WRONG END — <c>BrownoutEpisodeWindow(step)</c> replaced by
        /// <c>BrownoutQuietTicks</c> in the fold test — collapses leg A's later episodes into extra
        /// entries and its count clause fails.</para>
        /// </summary>
        [Test]
        public void AChronicRunBacksOff_AndAWholeQuietWindowResetsIt()
        {
            const long Base = HistorySystem.BrownoutQuietTicks;

            // ── LEG A: a network that never goes quiet. Each edge lands just past the previous
            // episode's window, so every expiry is a CONTINUATION and the step must climb 0→1→2→3
            // and then stay at the ceiling.
            var chronic = BareSim();
            var hc = new HistorySystem();
            long t = 10;
            bool shedding = true;
            Flap(chronic, hc, 1, shedding, t);
            for (int i = 0; i < 5; i++)
            {
                uint step = HistorySystem.BrownoutRunStep(hc.Entries[hc.Entries.Count - 1].SubjectB);
                t += HistorySystem.BrownoutEpisodeWindow(step);   // exactly ON the boundary — expired
                shedding = !shedding;                              // a REAL edge alternates
                Flap(chronic, hc, 1, shedding, t);
            }
            var climb = hc.Entries.Select(e => HistorySystem.BrownoutRunStep(e.SubjectB)).ToArray();
            int chronicEntries = hc.Entries.Count;

            // ── LEG B: the same network, but the last edge arrives TWO ceiling windows late — a
            // full window in which nothing was recorded, so the run is over.
            long ceiling = HistorySystem.BrownoutEpisodeWindow(HistorySystem.BrownoutMaxRunStep);
            long quietAt = t + ceiling * 2;
            Flap(chronic, hc, 1, !shedding, quietAt);
            uint stepAfterQuiet = HistorySystem.BrownoutRunStep(hc.Entries[hc.Entries.Count - 1].SubjectB);

            Assert.Multiple(() =>
            {
                // ⭐ THE VALUE PIN — the two literals. Nothing else in the repo holds them.
                Assert.That(HistorySystem.BrownoutMaxRunStep, Is.EqualTo(3u),
                    "BrownoutMaxRunStep is 3 doublings of the sim-hour base — an 8-sim-hour ceiling " +
                    "window, i.e. AT MOST 3 ring entries per sim-day from a permanently browned-out " +
                    "network. That budget is the reason for the number: against MaxEntries = 200 and " +
                    "the klaxon's own <= 25/day (AlarmQuietTicks), it puts the ring's turnover " +
                    "horizon past a sim-WEEK instead of at day ~4.2, where it measured 200/200 with " +
                    "the ship's boot lines already evicted. If you are retuning it, re-derive that " +
                    "budget in the same commit");
                Assert.That(HistorySystem.BrownoutEpisodeWindow(HistorySystem.BrownoutMaxRunStep),
                    Is.EqualTo(288000L),
                    "…and the ceiling window it implies is 288 000 ticks = 8 sim-hours at 10 Hz");
                Assert.That(HistorySystem.BrownoutEpisodeWindow(0), Is.EqualTo(Base),
                    "STEP 0 IS THE OLD WINDOW EXACTLY: a one-off brownout on a healthy grid must be " +
                    "unchanged by this package — only a fault that has already failed to go quiet " +
                    "for a whole window earns a longer one");

                Assert.That(climb, Is.EqualTo(new uint[] { 0u, 1u, 2u, 3u, 3u, 3u }),
                    "a run that never goes quiet climbs one step per expired window and then HOLDS " +
                    "at the ceiling — got [" + string.Join(",", climb) + "]");
                Assert.That(chronicEntries, Is.EqualTo(6),
                    "…one entry per expiry and not one more: six edges past six windows");

                Assert.That(stepAfterQuiet, Is.EqualTo(0u),
                    "A WHOLE WINDOW OF SILENCE ENDS THE RUN. Without this reset a network that " +
                    "failed once a week would inherit a chronic grid's 8-hour window forever, and a " +
                    "rare real fault would be folded into a stale entry instead of announcing itself");
                Assert.That(hc.Entries[hc.Entries.Count - 1].Tick, Is.EqualTo(quietAt),
                    "…and the fresh episode is stamped when it began");
            });
        }

        // ══════════════════════════════════════════════════════ 3. the backoff is PER NETWORK

        /// <summary>
        /// ⛔ <b>THE NAMED MUTATION THIS TEST EXISTS FOR:</b> delete <c>|| prior.SubjectA != net</c>
        /// from <c>RecordBrownout</c>'s scan, so the backoff reads whatever network flapped last.
        /// Applied, observed, reverted — network 1's chronic step then leaks onto network 2's FIRST
        /// EVER brownout, and this test reports a step where it demands 0.
        ///
        /// <para><see cref="ChronicleSignalTests.TwoFlappingNetworks_KeepSeparateEpisodes"/> pins the
        /// same predicate for the EDGE COUNT. It cannot see this one: its two networks are both fresh,
        /// so every step is 0 and the mutation is invisible to it. Two networks in different states is
        /// the case a wreck actually produces — a severed hull section that keeps a conduit run
        /// becomes its own <c>NetworkId</c>, and the chronic one is the one that was severed.</para>
        /// </summary>
        [Test]
        public void TheBackoffIsPerNetwork_AChronicGridDoesNotAgeAHealthyOnesFirstFault()
        {
            var sim = BareSim();
            var h = new HistorySystem();

            // Network 1 goes chronic: climb it to the ceiling.
            long t = 10;
            bool shedding = true;
            Flap(sim, h, 1, shedding, t);
            for (int i = 0; i < 4; i++)
            {
                uint step = HistorySystem.BrownoutRunStep(
                    h.Entries.Last(e => e.SubjectA == 1u).SubjectB);
                t += HistorySystem.BrownoutEpisodeWindow(step);
                shedding = !shedding;
                Flap(sim, h, 1, shedding, t);
            }
            uint chronicStep = HistorySystem.BrownoutRunStep(h.Entries.Last(e => e.SubjectA == 1u).SubjectB);

            // Network 2 now sheds for the very first time, one tick later.
            Flap(sim, h, 2, true, t + 1);

            // ⚠️ READ NETWORK 2's ENTRY DEFENSIVELY, AND THAT IS TRAPS 3 EARNED IN THIS FILE. Under
            // the named mutation there IS no entry for network 2 — its edge folds into network 1's
            // — so `Last(e => e.SubjectA == 2u)` threw `InvalidOperationException`. That is a
            // CRASH-red rather than a semantic one: the assertion that names the defect never ran.
            // The sentinels below cannot be satisfied by an absent entry.
            bool network2HasItsOwnEntry = h.Entries.Any(e => e.SubjectA == 2u);
            var fresh = h.Entries.LastOrDefault(e => e.SubjectA == 2u);
            uint freshStep = network2HasItsOwnEntry
                ? HistorySystem.BrownoutRunStep(fresh.SubjectB)
                : uint.MaxValue;
            string freshText = network2HasItsOwnEntry ? fresh.Text : "(NETWORK 2 WAS FOLDED INTO NETWORK 1)";

            Assert.Multiple(() =>
            {
                Assert.That(chronicStep, Is.EqualTo(HistorySystem.BrownoutMaxRunStep),
                    "NON-VACUITY: network 1 must really be at the ceiling, or the claim below is " +
                    "about two identical networks");
                Assert.That(network2HasItsOwnEntry, Is.True,
                    "network 2's first brownout must be its OWN entry — folding two networks into " +
                    "one line is a lie about which part of the ship is failing");
                Assert.That(freshStep, Is.EqualTo(0u),
                    "a network's FIRST brownout opens at step 0 however long its neighbour has been " +
                    "failing — the backoff is a statement about THIS network's fault, and inheriting " +
                    "one is how a new failure gets announced eight hours late");
                Assert.That(freshText, Does.Contain("network 2"));
            });
        }

        // ═════════════════════════════ 4. THE IDEMPOTENCY CONTRACT, at the windows this package adds

        /// <summary>
        /// ⭐⭐ <b>THE CENTRAL HAZARD, DRIVEN: A SAVE TAKEN INSIDE A BACKED-OFF WINDOW STILL REPLAYS
        /// BIT-IDENTICALLY.</b>
        ///
        /// <para><b>WHY THIS TEST HAD TO EXIST BEFORE THE PACKAGE COULD SHIP.</b>
        /// <c>PowerSystem</c> is deliberately not <see cref="IStatefulSystem"/>, so a reload
        /// re-publishes a <c>BrownoutChangedEvent</c> for a network that was already shedding.
        /// <c>RecordBrownout</c>'s idempotency rule drops it, and that rule derives its truth FROM
        /// THE RING: <i>an edge whose direction the ring already records for this network cannot be a
        /// real transition</i> (MECHANICS §13.43.2 — closing that was a determinism REGRESSION fix,
        /// not tidiness). This package changes how long an entry keeps folding and adds a step to the
        /// hashed word, so the rule's answer has to stay exact at the NEW window widths as well as
        /// the old one. <see cref="ChronicleSignalTests.TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode"/>
        /// covers the sim-hour window at tick 135 000 and is unchanged; these legs cover the widened
        /// ones, which did not exist before.</para>
        ///
        /// <para><b>THE SAVE TICKS ARE MEASURED, NOT GUESSED.</b> On this fixture the wreck's
        /// episodes open at 128 361 (step 0), 164 361 (step 1), 236 391 (step 2), 380 851 (step 3)
        /// and 668 851 (step 3). <b>211 000</b> sits inside the step-1 window <i>and past where the
        /// pre-package sim-hour window would have shut</i> (200 361); <b>501 000</b> sits deep inside
        /// the 288 000-tick ceiling window, four sim-hours from either boundary — a save tick that
        /// simply could not be "mid-episode" before this package. Both are away from a boundary on
        /// purpose: boundary ticks are filed residual 2 and do NOT replay
        /// (<see cref="ChronicleSignalTests.EpisodeBoundarySaves_DoNotReplay_ThisIsFiledResidual2"/>).</para>
        ///
        /// <para>⛔⛔ <b>AND HALF OF ALL SAVE TICKS ON A FLAPPING NETWORK ANSWER NOTHING — THIS TEST'S
        /// FIRST DRAFT USED TWO OF THEM AND SURVIVED THE MUTATION.</b> <c>PowerSystem.Balance</c>
        /// publishes only on a CHANGE, so after a reload with <c>_wasBrownout</c> reset it emits a
        /// duplicate <b>only if the network is SHEDDING at the moment of the save</b>; on a recovered
        /// tick there is no duplicate, the idempotency rule is never reached, and the leg is green
        /// with that rule <i>deleted</i>. The wreck flaps at roughly 1 Hz, so a save tick picked for
        /// its position in the window is a coin flip. Measured: 210 000 and 500 000 are both
        /// RECOVERED ticks (0 duplicate edges from the loaded sim) and 211 000 and 501 000 are both
        /// SHEDDING (1 each). The ticks moved and the <c>Shedding</c> clause below is now asserted by
        /// INCLUSION — CLAUDE.md's fourth shape, caught by running the mutation rather than by
        /// reading the test. ⚠️ <b>FILED:</b> the sibling in <c>ChronicleSignalTests</c> has no such
        /// clause; its 135 000 is a shedding tick by luck, exactly as §13.43.2 records
        /// <c>ShipSystemsTests</c>' fault-column leg being green by luck.</para>
        ///
        /// <para><b>THE TWIN IS MARKED DIRTY AFTER THE SAVE — §13.10's DOCUMENTED MATCHED RECOMPUTE</b>,
        /// not a thumb on the scale: <c>SaveReader</c> leaves the loaded sim's rooms dirty and
        /// <c>RoomState.Recompute</c> is not gas-idempotent, so without it the two atmospheres drift
        /// in the last bits for a reason that predates this lane by months.
        /// <c>SaveRestoreRunOnTests</c> and <c>P2ExitTests</c> use the same protocol. The whole
        /// <see cref="Simulation.StateHash"/> is asserted, not just the HIST fold.</para>
        ///
        /// <para>⛔ <b>THE NAMED MUTATION, APPLIED AND OBSERVED:</b> delete the
        /// <c>if (BrownoutIsShedding(prior.SubjectB) == e.InBrownout) return;</c> line — or move it
        /// BELOW the fold branch, which is the subtler way this package could have broken it — and
        /// both subject legs fail with the reloaded sim's episode carrying one extra edge.</para>
        /// </summary>
        [Test]
        public void TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenInsideABackedOffWindow()
        {
            const int InsideStep1 = 211000;      // inside [164 361, 236 361) — past the old 1 h window
            const int InsideTheCeiling = 501000; // inside [380 851, 668 851) — an 8 h window
            const int BeforeAnyEdge = 100000;    // the control
            const int RunOn = 20000;

            (ulong Live, ulong Loaded, ulong HistLive, ulong HistLoaded, int Edges, uint Step, bool Shedding) Leg(int saveTick)
            {
                var live = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
                int edges = 0;
                while (live.TickCount < saveTick)
                {
                    live.Tick();
                    foreach (var b in live.Events.Read<BrownoutChangedEvent>()) edges++;
                }
                uint word = History(live).Entries
                    .Where(e => e.Kind == (byte)HistoryKind.Brownout)
                    .Select(e => e.SubjectB)
                    .DefaultIfEmpty(0u).Last();
                uint step = HistorySystem.BrownoutRunStep(word);
                bool shedding = HistorySystem.BrownoutIsShedding(word);

                var buffer = new MemoryStream();
                SaveWriter.Write(live, buffer);
                buffer.Position = 0;
                var loaded = SaveReader.Read(buffer, Stack());
                live.Rooms.MarkDirty(); // §13.10's matched recompute — see the header

                for (int i = 0; i < RunOn; i++) { live.Tick(); loaded.Tick(); }
                return (live.StateHash(), loaded.StateHash(),
                        History(live).StateChecksum(), History(loaded).StateChecksum(), edges, step, shedding);
            }

            var control = Leg(BeforeAnyEdge);
            var step1 = Leg(InsideStep1);
            var ceiling = Leg(InsideTheCeiling);

            Assert.Multiple(() =>
            {
                Assert.That(control.Edges, Is.EqualTo(0),
                    "NON-VACUITY: the control's save must be taken BEFORE any brownout edge, or it " +
                    "is not a control for anything");
                Assert.That(control.Loaded, Is.EqualTo(control.Live),
                    "the control leg must already replay — if it does not, this test is measuring " +
                    "something other than this package");

                Assert.That(step1.Shedding, Is.True,
                    "NON-VACUITY, AND THIS CLAUSE IS THE WHOLE TEST — see the header: on a NON-shedding " +
                    "save tick the reloaded sim publishes no duplicate at all and the idempotency rule " +
                    "is never reached, so the leg passes with the rule DELETED");
                Assert.That(step1.Step, Is.GreaterThan(0u),
                    "NON-VACUITY: tick " + InsideStep1.ToString(CultureInfo.InvariantCulture) +
                    " must really sit inside a BACKED-OFF episode, or this leg is a duplicate of " +
                    "the sim-hour one ChronicleSignalTests already drives");
                Assert.That(step1.HistLoaded, Is.EqualTo(step1.HistLive),
                    "the HIST fold diverged inside a step-1 window — a duplicate brownout edge was " +
                    "counted after the reload: live " +
                    step1.HistLive.ToString("x16", CultureInfo.InvariantCulture) + " vs loaded " +
                    step1.HistLoaded.ToString("x16", CultureInfo.InvariantCulture));
                Assert.That(step1.Loaded, Is.EqualTo(step1.Live),
                    "a save taken inside a step-1 window does not replay: StateHash live " +
                    step1.Live.ToString("x16", CultureInfo.InvariantCulture) + " vs loaded " +
                    step1.Loaded.ToString("x16", CultureInfo.InvariantCulture));

                Assert.That(ceiling.Shedding, Is.True,
                    "NON-VACUITY: the network must be SHEDDING when the save is taken, or the " +
                    "reloaded sim has no duplicate to drop and this leg answers nothing");
                Assert.That(ceiling.Step, Is.EqualTo(HistorySystem.BrownoutMaxRunStep),
                    "NON-VACUITY: tick " + InsideTheCeiling.ToString(CultureInfo.InvariantCulture) +
                    " must sit inside a CEILING window — the widest one this package can produce, " +
                    "and the one no pre-package save tick could ever have been inside");
                Assert.That(ceiling.HistLoaded, Is.EqualTo(ceiling.HistLive),
                    "the HIST fold diverged inside the ceiling window: live " +
                    ceiling.HistLive.ToString("x16", CultureInfo.InvariantCulture) + " vs loaded " +
                    ceiling.HistLoaded.ToString("x16", CultureInfo.InvariantCulture));
                Assert.That(ceiling.Loaded, Is.EqualTo(ceiling.Live),
                    "a save taken inside an 8-sim-hour episode does not replay: StateHash live " +
                    ceiling.Live.ToString("x16", CultureInfo.InvariantCulture) + " vs loaded " +
                    ceiling.Loaded.ToString("x16", CultureInfo.InvariantCulture));
            });
        }
    }
}
