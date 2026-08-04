using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice — the boot that LOADS content/core/SimDefs/rules

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>RING SATURATION — a standing klaxon stops eating the ship's log.</b>
    ///
    /// <para><b>THE PLAYER SENTENCE THIS FILE DRIVES:</b> <i>a sustained thermal alarm reads as one
    /// line that stays current, not two hundred copies — and the log's real story (repairs, thaws,
    /// commissions, faults) survives a day at speed.</i></para>
    ///
    /// <para><b>THE DEFECT, MEASURED ON THE SHIPPED WRECK BEFORE THE FIX.</b> <c>--ship wreck</c> is
    /// what <c>./play.sh</c> boots and no pin covers it. Driven UNATTENDED — the OD-H default, work
    /// grid OFF, which is exactly the ship a playtester is looking at before they open the WORK tab
    /// — <c>content/core/SimDefs/rules/overheat_guard.moss</c> starts firing at tick <b>1 085 400</b>
    /// (day 1.26) and repeats every 600 ticks forever, because the wreck gets cold and nothing warms
    /// it (MECHANICS §13.2). At tick 1 300 000 the 200-entry ring held <b>197 copies of one sentence
    /// plus 3 brownout episodes and nothing else</b>: all four tick-0 boot lines and all six
    /// machine-failure alarms were gone, and the surviving window spanned ticks 1 182 000–1 299 600.
    /// AFTER: 49 entries — 4 Generic + 12 Alarm (6 machine failures + 6 hourly klaxon lines) + 33
    /// Brownout, spanning ticks 0–1 282 471. Both the Chronicle and the MOSS fault log read this one
    /// ring, so both drowned at once and both are fixed at once.</para>
    ///
    /// <para>⚠️ <b>WORK ON, THE DEFECT DOES NOT REPRODUCE — measured, and it is why these fixtures
    /// are unattended.</b> With <c>GiveAllCrewAllWork()</c> the crew keep patching the radiators,
    /// <c>ship.heat</c> never falls under 0.5 and <c>overheat_guard</c> fires ZERO times in three
    /// sim-days. That is the opposite of <see cref="ChronicleSignalTests"/>' D6 fixture, which needs
    /// the work grid on to produce a repair to lose.</para>
    ///
    /// <para><b>EVERY TEST HERE IS DRIVEN</b>, and the two that need the shipped MOSS rule boot
    /// through <see cref="SimHost"/> rather than <c>ShipPlanBuilder</c>: a bare stack carries no
    /// <c>DesignerRuleSystem</c> at all, so it reports zero alarms and would answer this package's
    /// question vacuously (MECHANICS §13.21's verification note records the same trap).</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED</b> (CLAUDE.md fifth shape): <c>Assert</c> throws, so multi-leg
    /// tests record into locals and assert inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class RingSaturationTests
    {
        private static HistorySystem History(Simulation sim)
        {
            for (int i = 0; i < sim.Systems.Length; i++)
                if (sim.Systems[i] is HistorySystem h) return h;
            return null;
        }

        private static int CountKind(HistorySystem h, HistoryKind k)
            => h.Entries.Count(e => e.Kind == (byte)k);

        // ═════════════════════════════════════════════════════════ 1. THE OUTCOME TEST, on the wreck

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST.</b> Boot the SHIPPED wreck the way a player does — through
        /// <see cref="SimHost"/>, so the real <c>overheat_guard</c> rule is loaded — leave it
        /// unattended past the point where the klaxon used to fill the ring, and assert the three
        /// things a player would notice:
        ///
        /// <list type="number">
        /// <item><b>the klaxon is bounded</b> — alarm entries are under an ABSOLUTE cap derived from
        /// <see cref="HistorySystem.AlarmQuietTicks"/>, not merely "fewer than before" (CLAUDE.md
        /// seventh shape: a ratio cannot see a 2× scale error, only a bound can);</item>
        /// <item><b>the ship's own premise survives</b> — every tick-0 boot line is still readable,
        /// where before the fix the ring's whole window was the last 3.3 sim-hours; and</item>
        /// <item><b>the real faults survive</b> — the machine-failure alarms, which are the SAME
        /// KIND as the flood and were therefore evicted by it, are all still there.</item>
        /// </list>
        ///
        /// <para><b>NON-VACUITY IS ASSERTED BY INCLUSION, THREE WAYS:</b> the run must have produced
        /// a genuinely REPEATING alarm (an alarm that fires once satisfies the cap trivially), it
        /// must have produced machine failures (an empty set survives anything), and the ring must
        /// be under <see cref="HistorySystem.MaxEntries"/> — nothing evicted at all, which is the
        /// whole defect.</para>
        ///
        /// <para><b>MUTATION, APPLIED AND OBSERVED:</b> reverting <c>RecordAlarm</c> to the pre-fix
        /// <c>Add(tick, line, HistoryKind.Alarm)</c> gives 200 entries — 197 identical alarm lines +
        /// 3 brownouts, 0 boot lines, 0 machine failures — and every clause below fails.</para>
        ///
        /// <para>⚠️ <b>THIS TEST DOES NOT PIN <see cref="HistorySystem.AlarmQuietTicks"/>' VALUE, AND
        /// AN EARLIER VERSION OF THIS PARAGRAPH CLAIMED THE OPPOSITE OF WHY.</b> It said the cap
        /// below was "derived FROM AlarmQuietTicks", so halving the constant would halve the cap.
        /// Both halves were false: the cap is the LITERAL 60 at the bottom of this test, and it has
        /// so much headroom that the constant can move a long way without tripping it. Measured, both
        /// directions, by applying the change: at <c>AlarmQuietTicks = 18000</c> and at
        /// <c>72000</c> this whole file is <b>4/4 GREEN</b>. The value is pinned by exactly one
        /// assertion, the literal in
        /// <see cref="AnAlarmRun_IsOneEntry_AndTheQuietHourIsBracketedFromBothSides"/>, and by
        /// nothing else in the repo. What THIS test pins is the absolute thing a player sees: the
        /// ring is not full and the ship's own premise is still in it.</para>
        /// </summary>
        [Test]
        public void TheShipsLog_SurvivesAStandingKlaxon_AndStillHoldsTheFaultsThatCameFirst()
        {
            // 1 300 000 ticks = day 1.50. The klaxon's first firing is at 1 085 400 (measured) and
            // pre-fix the ring was 200/200 by roughly 1 205 400 — so this window is past saturation
            // with margin, and short enough to keep the gate honest about its cost.
            const int Ticks = 1300000;

            // NO GiveAllCrewAllWork: OD-H boots every work type OFF, and the defect is measured on
            // exactly that ship (see the class header — work ON, the ship stays warm and the rule
            // never fires at all).
            var sim = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck).Sim;
            var history = History(sim);
            Assert.That(history, Is.Not.Null, "precondition: the default stack carries a HistorySystem");
            int bootLines = history.Entries.Count(e => e.Tick == 0);
            Assert.That(bootLines, Is.GreaterThan(0),
                "precondition: this ship writes lines at tick 0 (the four breached capsules) — they " +
                "are the landmark, so they have to exist before the drive");

            for (int i = 0; i < Ticks; i++) sim.Tick();

            int alarms = CountKind(history, HistoryKind.Alarm);
            int total = history.Entries.Count;
            int survivingBootLines = history.Entries.Count(e => e.Tick == 0);
            int machineFailures = history.Entries.Count(
                e => e.Kind == (byte)HistoryKind.Alarm && e.Text != null && e.Text.Contains("MACHINE FAILURE"));
            uint mostFolded = history.Entries
                .Where(e => e.Kind == (byte)HistoryKind.Alarm)
                .Select(e => HistorySystem.AlarmFirings(e.SubjectB))
                .DefaultIfEmpty(0u).Max();

            // THE ABSOLUTE BOUND, written as a number rather than re-derived with the code's own
            // expression. A run closes no sooner than AlarmQuietTicks after it opened, so ONE
            // repeating alarm can own at most ceil(1 300 000 / 36 000) + 1 = 38 entries; the wreck
            // also raises one one-shot MACHINE FAILURE per device it owns (13 in three sim-days).
            // Measured on this fixture: 12. Pre-fix: 197, which is the ring.
            const int MaxAlarmEntriesInThisWindow = 60;

            Assert.Multiple(() =>
            {
                Assert.That(mostFolded, Is.GreaterThan(1u),
                    "NON-VACUITY: some alarm must genuinely have REPEATED, or the cap below is " +
                    "satisfied by a ship whose klaxon never sounded twice");
                Assert.That(alarms, Is.LessThanOrEqualTo(MaxAlarmEntriesInThisWindow),
                    "the klaxon is not bounded: " + alarms.ToString(CultureInfo.InvariantCulture) +
                    " alarm entries in " + Ticks.ToString(CultureInfo.InvariantCulture) +
                    " ticks against a " + HistorySystem.AlarmQuietTicks.ToString(CultureInfo.InvariantCulture) +
                    "-tick run window");
                Assert.That(machineFailures, Is.GreaterThan(0),
                    "NON-VACUITY: the ship must really have raised machine-failure alarms, or " +
                    "'the real faults survived' is a claim about an empty set");
                Assert.That(total, Is.LessThan(HistorySystem.MaxEntries),
                    "the ring is FULL (" + total.ToString(CultureInfo.InvariantCulture) + " of " +
                    HistorySystem.MaxEntries.ToString(CultureInfo.InvariantCulture) +
                    ") — something was evicted, which is the whole defect");
                Assert.That(survivingBootLines, Is.EqualTo(bootLines),
                    "THE LANDMARK: every tick-0 line must still be readable at day 1.5. Before the " +
                    "fix the ring's whole surviving window was ticks 1 182 000-1 299 600 — 3.3 " +
                    "sim-hours — and the ship's own premise had been evicted from its own log");
            });
        }

        // ═══════════════════════════════════════════════ 2. the coalescer's contract, driven small

        /// <summary>A bare sim with one hand-driven <see cref="HistorySystem"/>: the alarm stream is
        /// published directly so the test controls the tick of every firing.</summary>
        private static Simulation BareSim()
            => new Simulation(AsciiWorld.Build(new[] { "#####", "#...#", "#####" }), 7, new ISimSystem[0]);

        // Publish-then-swap, exactly as HistorySystemTests does it: the bus serves the PREVIOUS
        // tick's buffer, so a swap moves a freshly-published event into readable position.
        private static void Raise(Simulation sim, HistorySystem h, string source, string message, long atTick)
        {
            while (sim.TickCount < atTick) sim.Tick();
            sim.Events.Publish(new AlarmRaisedEvent { SourceId = source, Message = message });
            sim.Events.SwapBuffers();
            h.Tick(sim);
        }

        /// <summary>
        /// The run contract in one place: an alarm that repeats inside the window owns exactly ONE
        /// entry, stamped when the run BEGAN, whose text says how many times it sounded — while a
        /// DIFFERENT alarm interleaved with it keeps its own line, and a return after a quiet hour
        /// opens a new one.
        ///
        /// <para>⭐ <b>THE WINDOW IS BRACKETED FROM BOTH SIDES — BUT RELATIVE TO THE CONSTANT, WHICH
        /// IS NOT THE SAME THING AS PINNING IT</b> (seventh shape, and this file walked into it). The
        /// two boundary legs derive their firing ticks FROM
        /// <see cref="HistorySystem.AlarmQuietTicks"/>, so they scale with it: one tick inside folds,
        /// one exactly ON the boundary does not, at 36 000 and equally at 18 000 or 72 000. Measured
        /// by applying both changes — <b>4/4 green either way</b>. So the SHAPE is pinned here and the
        /// VALUE is pinned by the single literal assertion at the top of the block below, which is the
        /// only thing in the repo that holds it. That assertion carries the sizing claim the constant
        /// exists for; if the number is ever retuned, that claim is what has to be re-argued.</para>
        ///
        /// <para>⭐ <b>AND THE FIRST-FIRING BIT-IDENTITY IS ASSERTED HERE, because the package's whole
        /// pin argument rests on it:</b> an alarm that fires once stores <c>SubjectB = 0</c> and its
        /// bare line, exactly as the pre-coalescing <c>Add</c> did, so it folds into
        /// <see cref="HistorySystem.StateChecksum"/> identically. Only a SECOND firing moves a hash.</para>
        /// </summary>
        [Test]
        public void AnAlarmRun_IsOneEntry_AndTheQuietHourIsBracketedFromBothSides()
        {
            const long Window = HistorySystem.AlarmQuietTicks;

            // ── LEG 1: five firings of one alarm inside the window, with a DIFFERENT alarm woven in
            var sim = BareSim();
            var h = new HistorySystem();
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", 100);
            var afterOne = h.Entries[0];
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", 700);
            Raise(sim, h, "scrub_a", "FLOW FAULT", 1000);           // an unrelated alarm, in between
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", 1300);
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", 1900);
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", Window - 1 + 100); // one tick inside

            int entriesInRun = h.Entries.Count;
            var klaxon = h.Entries[0];
            // ⚠️ READ THE SECOND ENTRY DEFENSIVELY, AND THAT IS TRAPS 3 EARNED IN THIS FILE. The
            // "identity is the rendered line" mutation (delete the string.Equals guard in
            // RecordAlarm) folds the unrelated scrub_a alarm INTO the klaxon's entry, so there is no
            // Entries[1] at all — and a bare index threw ArgumentOutOfRangeException, which is a
            // CRASH-red rather than a semantic one: the assertion that names the defect never ran.
            // The sentinels below cannot be satisfied by an absent entry.
            string otherText = h.Entries.Count > 1 ? h.Entries[1].Text : "(THE SECOND ALARM WAS FOLDED AWAY)";
            uint otherWord = h.Entries.Count > 1 ? h.Entries[1].SubjectB : uint.MaxValue;

            // ── LEG 2: the boundary. A firing exactly AlarmQuietTicks after the run opened is a new
            // entry — the run has timed out.
            Raise(sim, h, "overheat_guard", "THERMAL LOAD HIGH", Window + 100);
            int entriesAfterTimeout = h.Entries.Count;
            var reopened = h.Entries[h.Entries.Count - 1];

            Assert.Multiple(() =>
            {
                // ⭐ THE VALUE PIN. Everything else in this file derives its ticks FROM the constant
                // and so cannot see its value move (measured: 18 000 and 72 000 are both 4/4 green).
                // This literal is the only thing in the repo that holds it, and it holds it for a
                // REASON rather than for tidiness: one sim-hour is what bounds a permanently-sounding
                // alarm to ≤ 25 entries per sim-day against a 200-entry ring — the sizing claim the
                // constant exists to make. Move the number and that claim has to be re-argued.
                Assert.That(HistorySystem.AlarmQuietTicks, Is.EqualTo(36000L),
                    "AlarmQuietTicks is one sim-hour (36 000 ticks at 10 Hz). That value is what " +
                    "bounds a standing klaxon to <= 25 ring entries per sim-day against MaxEntries " +
                    "= 200; nothing else in the repo pins it, and every other assertion here scales " +
                    "with it. If you are retuning it, re-derive that budget in the same commit");

                // the bit-identity the pin argument rests on
                Assert.That(afterOne.SubjectB, Is.EqualTo(0u),
                    "A SINGLE FIRING MUST STORE SubjectB = 0 — the pre-coalescing writer's exact " +
                    "bytes. Every pinned fixture's alarms are single firings, so this is what " +
                    "makes their holds structural rather than lucky");
                Assert.That(afterOne.Text, Is.EqualTo("overheat_guard: THERMAL LOAD HIGH"),
                    "…and its bare line, unadorned");

                Assert.That(entriesInRun, Is.EqualTo(2),
                    "five firings of one alarm plus one of another must be TWO entries, not six");
                Assert.That(klaxon.Tick, Is.EqualTo(100),
                    "the surviving entry is stamped when the run BEGAN, not when it last sounded");
                Assert.That(HistorySystem.AlarmFirings(klaxon.SubjectB), Is.EqualTo(5u),
                    "…and counts every firing folded into it");
                Assert.That(klaxon.Text, Is.EqualTo("overheat_guard: THERMAL LOAD HIGH; 5 times within the hour."),
                    "…and says so, with the BASE LINE STILL A PREFIX — ShipSystems.Fault searches " +
                    "this text for a device name and truncates it at 56 characters");
                Assert.That(otherText, Is.EqualTo("scrub_a: FLOW FAULT"),
                    "A DIFFERENT ALARM IS NOT THE SAME ALARM: identity is the rendered line, so an " +
                    "unrelated fault raised mid-run keeps its own entry and is never folded away");
                Assert.That(otherWord, Is.EqualTo(0u), "…untouched by the run beside it");

                Assert.That(entriesAfterTimeout, Is.EqualTo(3),
                    "THE WINDOW, FROM THE FAR SIDE: a firing exactly AlarmQuietTicks after the run " +
                    "opened must open a NEW entry — an alarm that returns after a quiet hour is " +
                    "news, not a footnote to an hour-old line");
                Assert.That(reopened.Tick, Is.EqualTo(Window + 100), "…stamped now");
                Assert.That(reopened.SubjectB, Is.EqualTo(0u), "…and starting its own count at one");
            });
        }

        // ═══════════════════════════════════════════════════════ 3. the save contract, two scopes

        /// <summary>
        /// The HIST chapter carries a coalesced run through <see cref="HistorySystem.CaptureState"/>
        /// → <see cref="HistorySystem.RestoreState"/> unchanged, fold included — the round-trip the
        /// hashed-field invariant demands in the same commit as the field's new content.
        ///
        /// <para>⚠️ <b>READ THIS TEST'S SCOPE LITERALLY, BECAUSE §13.43.2 RECORDS IT BEING MISREAD.</b>
        /// There is no system stack here and therefore no alarm PUBLISHER. It proves the chapter is
        /// lossless; it CANNOT see a publisher that re-fires after a reload, which is the shape that
        /// actually broke D6.
        /// <see cref="TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidAlarmRun"/> is the
        /// instrument for that, and it is the one to cite for any determinism claim.</para>
        ///
        /// <para><see cref="HistorySystem.StateVersion"/> stays at <b>2</b>: <c>SubjectB</c> was
        /// already written and already folded, so no save format changed.</para>
        /// </summary>
        [Test]
        public void ACoalescedRun_SurvivesTheChapterRoundTrip_FoldIncluded()
        {
            var sim = BareSim();
            var live = new HistorySystem();
            for (long t = 100; t <= 2500; t += 600)
                Raise(sim, live, "overheat_guard", "THERMAL LOAD HIGH", t);
            Assert.That(HistorySystem.AlarmFirings(live.Entries[0].SubjectB), Is.EqualTo(5u),
                "precondition: the entry under test must actually be a coalesced run");

            var buffer = new MemoryStream();
            using (var w = new BinaryWriter(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
                live.CaptureState(w);
            buffer.Position = 0;
            var restored = new HistorySystem();
            using (var r = new BinaryReader(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
                restored.RestoreState(r, live.StateVersion);

            Assert.Multiple(() =>
            {
                Assert.That(live.StateVersion, Is.EqualTo((ushort)2),
                    "no save format changed: SubjectB was already captured and already folded");
                Assert.That(restored.Entries.Count, Is.EqualTo(live.Entries.Count));
                Assert.That(restored.Entries[0].Tick, Is.EqualTo(live.Entries[0].Tick),
                    "the run must not lose the tick it began at");
                Assert.That(restored.Entries[0].SubjectB, Is.EqualTo(live.Entries[0].SubjectB),
                    "…nor its firing count");
                Assert.That(restored.Entries[0].Text, Is.EqualTo(live.Entries[0].Text));
                Assert.That(restored.StateChecksum(), Is.EqualTo(live.StateChecksum()),
                    "and the folds agree, which is what a determinism pin would see");
            });
        }

        /// <summary>
        /// ⭐⭐ <b>THE DETERMINISM PROOF, ON THE SHIPPED WRECK: a save taken MID-ALARM-RUN replays
        /// the alarm run bit-identically.</b> Full <see cref="SystemStack"/> including the real
        /// <c>DesignerRuleSystem</c>, the real <c>overheat_guard</c> rule off disk, a real
        /// <c>SaveWriter</c>→<c>SaveReader</c> round trip, and run-on against an uninterrupted twin.
        ///
        /// <para><b>WHY THIS TEST EXISTS AT THIS SCOPE.</b> D6's coalescer shipped a determinism
        /// REGRESSION of exactly this shape (§13.43.2): <c>PowerSystem</c> is not
        /// <see cref="IStatefulSystem"/>, so it re-published a brownout edge after a reload, and
        /// coalescing folded that duplicate into a HASHED, never-evicted field. Before coalescing the
        /// duplicate was one more ring entry that evicted harmlessly. Every alarm publisher was
        /// checked against that shape and none of them carries unsaved state
        /// (<c>HistorySystem.RecordAlarm</c>'s header lists them, with the reason for each), which is
        /// why this package adds no idempotency rule — but "checked" is an argument and this is the
        /// measurement.</para>
        ///
        /// <para><b>THE TWIN IS MARKED DIRTY AFTER THE SAVE, and that is the DOCUMENTED §13.10
        /// PROTOCOL rather than a thumb on the scale.</b> <c>SaveReader</c> leaves the loaded sim's
        /// rooms dirty by design and <c>RoomState.Recompute</c> is not gas-idempotent, so without a
        /// MATCHED recompute the two atmospheres drift in the last bits for a reason that predates
        /// this lane by months. <c>SaveRestoreRunOnTests</c>, <c>P2ExitTests</c> and
        /// <c>ChronicleSignalTests</c> all do exactly this.</para>
        ///
        /// <para><b>THE CONTROL CARRIES THE WHOLE-<see cref="Simulation.StateHash"/> CLAIM, and it is
        /// not decoration:</b> a save at tick 100 000 — before this ship's first alarm and before its
        /// first brownout edge — replays BIT-IDENTICALLY, whole hash, every system. Without it,
        /// "the alarm entries agree" would also pass on a tree where nothing replays at all.</para>
        ///
        /// <para>⛔⛔ <b>THE SUBJECT LEG ASSERTS THE ALARM ENTRIES, NOT THE WHOLE HASH, AND THE REASON
        /// IS MEASURED RATHER THAN CONVENIENT.</b> At save tick 1 100 000 the whole-hash comparison is
        /// ALREADY contaminated by a defect this package does not own. Exactly ONE ring entry differs,
        /// and it is a <see cref="HistoryKind.Brownout"/> one: live <c>t=1066381 net=1 word=2225</c>
        /// (1112 edges) against loaded <c>word=2221</c> (1110) — same tick, two fewer edges published
        /// by the reloaded sim over the run-on, i.e. §13.10's last-bit atmosphere drift amplified
        /// through <c>PowerSystem</c>'s shedding threshold. <b>The control for that claim was DRIVEN:
        /// with <c>RecordAlarm</c>'s coalescer reverted to the pre-fix writer, the same leg produces
        /// the same divergence at the same index with the same two numbers</b> (2225 vs 2221) — so it
        /// predates this lane and is D6's filed residual family, not a regression here. Asserting the
        /// whole hash on this leg would therefore fail for somebody else's reason and teach the next
        /// lane nothing. What IS asserted is total for what this package writes: every
        /// <see cref="HistoryKind.Alarm"/> entry's tick, subjects and rendered text agree exactly, on
        /// both sides of the reload and after the run-on.</para>
        ///
        /// <para>⛔⛔ <b>WHAT THIS TEST CANNOT SEE, SAID AS A BLIND SPOT RATHER THAN AS A SCOPE
        /// CHOICE — READ ITS SAVE TICKS LITERALLY.</b> Both are ticks on which NO alarm fires.
        /// <b>A save taken on a tick an alarm DOES fire does not replay, and this test would stay
        /// green through every one of them.</b> The event bus is not a save chapter, so the in-flight
        /// <c>AlarmRaisedEvent</c> is lost and the loaded sim publishes one FEWER firing than its
        /// twin; because the coalescer folds firings into an entry that survives the whole run, the
        /// difference is permanent and compounds into every later run. Measured on the shipped wreck
        /// with 200 000 ticks of run-on: save@1 085 400 gives live <c>1085400/b60</c> against loaded
        /// <c>1086000/b60</c> and the offset is inherited by all five later runs (trailing counts 34
        /// vs 33); save@1 086 000 diverges on the count alone; save@1 085 700 — a non-firing tick, and
        /// the shape this test does sample — is clean on the alarm entries AND on the whole
        /// <see cref="Simulation.StateHash"/>. Width 1 tick in 600 (0.17 %), continuously, for as
        /// long as the klaxon sounds. <b>FILED, MECHANICS §13.44.5</b>, with the reverted-coalescer
        /// control that shows the same perturbation self-healing without this package.</para>
        ///
        /// <para>⚠️ <b>WHY NOT SIMPLY MOVE THE SUBJECT ONTO A FIRING TICK.</b> Because that would
        /// assert a defect nobody has agreed to close, and the integrator ruled it FILED rather than
        /// fixed (D6 residual-2 precedent). If a future package closes it — the closer is
        /// save-boundary event delivery, the same family as D6's residual 2 — the honest move is to
        /// add a firing-tick leg here and delete this paragraph, not to widen the existing legs.</para>
        ///
        /// <para>⛔ MUTATION: replacing <c>RecordAlarm</c>'s in-place rewrite with an <c>Add</c> of
        /// the folded entry does NOT redden this test (it is a ring-shape defect, not a replay one)
        /// — that mutation is caught by the outcome test and by the contract test above. What DOES
        /// redden this one is a coalescer that reads unsaved state.</para>
        /// </summary>
        [Test]
        public void TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidAlarmRun()
        {
            // The klaxon's first firing is at 1 085 400 and the run it opens stays open until
            // 1 121 400 (AlarmQuietTicks later), so 1 100 000 is squarely mid-run. ⛔ BOTH TICKS ARE
            // DELIBERATELY NON-FIRING ONES (firings land on 1 085 400 + 600k): a save ON a firing
            // tick does NOT replay — filed residual, MECHANICS §13.44.5, and the header says so out
            // loud because a reader who does not know that will over-read this test's green.
            // 100 000 precedes any alarm at all and is the control.
            const int MidRun = 1100000;
            const int BeforeAnyAlarm = 100000;
            const int RunOn = 6000;   // ten more firings — a divergence shows on the first fold

            // The alarm entries as the fold and the player see them: structure + rendered text.
            static List<string> Alarms(Simulation s)
                => History(s).Entries
                    .Where(e => e.Kind == (byte)HistoryKind.Alarm)
                    .Select(e => e.Tick.ToString(CultureInfo.InvariantCulture) + "/" +
                                 e.SubjectA.ToString(CultureInfo.InvariantCulture) + "/" +
                                 e.SubjectB.ToString(CultureInfo.InvariantCulture) + "/" + e.Text)
                    .ToList();

            (ulong Live, ulong Loaded, List<string> AlarmsLive, List<string> AlarmsLoaded, uint Folded) Leg(int saveTick)
            {
                var live = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck).Sim;
                while (live.TickCount < saveTick) live.Tick();

                uint folded = History(live).Entries
                    .Where(e => e.Kind == (byte)HistoryKind.Alarm)
                    .Select(e => HistorySystem.AlarmFirings(e.SubjectB))
                    .DefaultIfEmpty(0u).Max();

                var buffer = new MemoryStream();
                SaveWriter.Write(live, buffer);
                buffer.Position = 0;

                // ⚠️ THE LOADED TWIN'S SYSTEM ARRAY MUST BE THE ONE THE HOST BUILDS, NOT
                // SystemStack.CreateDefault. SimHost brackets the authoritative stack with three host
                // wrappers (EffectPump first, Memory + Eulogy last), so a hand-rolled array is OFF BY
                // ONE against the save's chapters and the twin is not a twin. Measured: with a
                // hand-rolled stack even the CONTROL leg — a save before any alarm exists — failed to
                // replay, which would have been read as this package's defect. A second SimHost.Build
                // is a fresh, never-ticked, correctly-shaped stack; its adapters are then re-bound to
                // the loaded sim's devices, exactly as SimHost.Build does for its own.
                var twin = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
                var loaded = SaveReader.Read(buffer, twin.Sim.Systems, live.Defs);
                MossBindings.RegisterAdapters(loaded, twin.Registry);
                MossBindings.ApplyScripts(loaded, twin.Moss);
                live.Rooms.MarkDirty(); // §13.10's matched recompute — see the header

                for (int i = 0; i < RunOn; i++) { live.Tick(); loaded.Tick(); }
                return (live.StateHash(), loaded.StateHash(), Alarms(live), Alarms(loaded), folded);
            }

            var control = Leg(BeforeAnyAlarm);
            var subject = Leg(MidRun);

            Assert.Multiple(() =>
            {
                Assert.That(control.Folded, Is.LessThanOrEqualTo(1u),
                    "NON-VACUITY: the control's save must be taken before any alarm has COALESCED " +
                    "(the ship's one-shot machine-failure alarms are fine — they are single " +
                    "firings), or it is not a control for anything");
                Assert.That(control.Loaded, Is.EqualTo(control.Live),
                    "the control leg must already replay — if it does not, this test is measuring " +
                    "something other than this package");
                Assert.That(control.AlarmsLoaded, Is.EqualTo(control.AlarmsLive),
                    "…including its alarm entries");
                Assert.That(subject.Folded, Is.GreaterThan(1u),
                    "NON-VACUITY: the subject's save must be taken while an alarm run is genuinely " +
                    "COALESCED, or a quiet ship is answering a question about a sounding one");
                Assert.That(subject.AlarmsLive.Count, Is.GreaterThan(0),
                    "NON-VACUITY: there must BE alarm entries to compare");
                Assert.That(subject.AlarmsLoaded, Is.EqualTo(subject.AlarmsLive),
                    "a save taken mid-alarm-run does not replay the RUN: an alarm entry's tick, " +
                    "subjects or text differ across the reload. (The whole StateHash is deliberately " +
                    "NOT asserted on this leg — see the header: one brownout entry diverges here for " +
                    "a reason measured to predate this lane.)");
            });
        }
    }
}
