using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>THE CHRONICLE TELLS THE STORY</b> — defects D6 + D1, owner-triaged 2026-08-02.
    ///
    /// <para><b>THE PLAYER SENTENCE THIS FILE DRIVES:</b> <i>the ship's log stops being a brownout
    /// ticker — repairs, commissioning and thaws each write a line the player can actually find,
    /// and power flapping no longer evicts them.</i></para>
    ///
    /// <para><b>THE DEFECT, MEASURED ON THE SHIPPED WRECK BEFORE THE FIX</b> (unmodified
    /// <c>AuthoredShips.PeriluneWreck</c> on the default stack, no work grid, no orders):
    /// <c>PowerSystem.Balance</c> published <b>22 562</b> <c>BrownoutChangedEvent</c>s on network 1
    /// in the first sim-day, and every one of them appended a history entry. At <b>tick 200 000</b>
    /// (sim-hour 5.56 — the T13 playtest was 5.47) the 200-entry ring held <b>200 Brownout entries
    /// and nothing else</b>: the three boot alarms and four boot notes were gone, and the surviving
    /// window spanned 8 510 ticks. At day 1 it was still 200/200, spanning 3 980 ticks.
    /// AFTER: 9 entries at tick 200 000 (3 Alarm + 4 Generic + 2 Brownout), 30 at day 1.</para>
    ///
    /// <para><b>EVERY TEST HERE IS DRIVEN.</b> The real <see cref="SystemStack"/> ticks; crew walk,
    /// fetch and service; the brownout stream is either the shipped ship's own or a hand-published
    /// event on the real bus. Nothing is scanned out of source text.</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED</b> (CLAUDE.md fifth shape): <c>Assert</c> throws, so
    /// multi-leg tests record into locals and assert inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class ChronicleSignalTests
    {
        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static HistorySystem History(Simulation sim)
        {
            for (int i = 0; i < sim.Systems.Length; i++)
                if (sim.Systems[i] is HistorySystem h) return h;
            return null;
        }

        private static int CountKind(HistorySystem h, HistoryKind k)
            => h.Entries.Count(e => e.Kind == (byte)k);

        // Publish-then-swap, exactly as HistorySystemTests does it: the bus serves the PREVIOUS
        // tick's buffer, so a swap moves a freshly-published event into readable position.
        private static void Deliver(Simulation sim, HistorySystem h)
        {
            sim.Events.SwapBuffers();
            h.Tick(sim);
        }

        // ══════════════════════════════════════════════════ 1. THE OUTCOME TEST (D6 + a landmark)

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST.</b> Drive the SHIPPED wreck — the ship <c>./play.sh</c> boots —
        /// with the work grid on, past the point where the battery sawtooth starts flapping, and
        /// assert the two things a player would notice:
        ///
        /// <list type="number">
        /// <item><b>the flap is bounded</b> — brownout entries are under an ABSOLUTE cap derived
        /// from <see cref="HistorySystem.BrownoutQuietTicks"/>, not merely "fewer than before"
        /// (CLAUDE.md seventh shape: a ratio cannot see a 2× scale error, only a bound can); and</item>
        /// <item><b>the landmark survives</b> — a repair the crew really performed in the first
        /// sim-hour is STILL in the ring at sim-hour 5.6, where before the fix every entry older
        /// than fourteen sim-minutes had been evicted.</item>
        /// </list>
        ///
        /// <para><b>NON-VACUITY IS ASSERTED BY INCLUSION, THREE WAYS:</b> the run must have produced
        /// at least one brownout entry (a ship that never browned out would pass the cap trivially),
        /// at least one repair line (an empty ring holds every landmark), and the ring must be
        /// smaller than <see cref="HistorySystem.MaxEntries"/> — i.e. nothing was evicted at all.</para>
        ///
        /// <para><b>MUTATION, APPLIED AND OBSERVED:</b> replacing <c>RecordBrownout</c>'s body with
        /// the pre-fix <c>Add(tick, FirstEdgeText(e), HistoryKind.Brownout)</c> gives 200 entries,
        /// all Brownout — every clause below fails.</para>
        ///
        /// <para>⚠️ <b>THE WINDOW'S SCALE IS NOT PINNED HERE, AND THAT IS DELIBERATE</b> (seventh
        /// shape). The cap below is derived FROM <see cref="HistorySystem.BrownoutQuietTicks"/>, so
        /// halving that constant would halve the cap too and this test would not notice.
        /// <see cref="TheEpisodeWindowIsBracketedFromBothSides"/> is the scale instrument: it
        /// brackets the constant to the digit. What THIS test pins is the absolute one that matters
        /// to a player — the ring is not full, and entries from tick 0 are still in it.</para>
        /// </summary>
        [Test]
        public void TheShipsLog_SurvivesTheFlap_AndStillHoldsTheRepairThatCameFirst()
        {
            // One sim-day. Long enough that the flap has been running for hours (measured: with the
            // work grid on, the crew's own repairs hold the brownout off until tick 571 241, and
            // 3 629 edges follow before the day is out).
            const int Ticks = 864000;

            // WORK ON, because the outcome is about a ship being played: OD-H boots every work type
            // off, and an unattended wreck completes no repair to lose. This is the WORK tab, which
            // is the first thing the T13 playtest does.
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack()).GiveAllCrewAllWork();
            var history = History(sim);
            Assert.That(history, Is.Not.Null, "precondition: the default stack carries a HistorySystem");
            int bootLines = history.Entries.Count(e => e.Tick == 0);
            Assert.That(bootLines, Is.GreaterThan(0),
                "precondition: this ship writes lines at tick 0 (the four breached capsules) — they " +
                "are the landmark, so they have to exist before the drive");

            for (int i = 0; i < Ticks; i++) sim.Tick();

            int brownouts = CountKind(history, HistoryKind.Brownout);
            int repairs = CountKind(history, HistoryKind.RepairCompleted);
            int total = history.Entries.Count;
            int survivingBootLines = history.Entries.Count(e => e.Tick == 0);
            long firstRepairTick = history.Entries
                .Where(e => e.Kind == (byte)HistoryKind.RepairCompleted)
                .Select(e => e.Tick).DefaultIfEmpty(-1).First();

            // THE ABSOLUTE BOUND, written out as a number rather than re-derived with the code's own
            // expression. An episode closes no sooner than BrownoutQuietTicks after it opened, so on
            // ONE network at most ceil(864 000 / 36 000) + 1 = 25 entries can exist in a sim-day.
            // Measured on this fixture: 9. Pre-fix: 200, which is the ring.
            const int MaxBrownoutEntriesInADay = 25;

            Assert.Multiple(() =>
            {
                Assert.That(brownouts, Is.GreaterThan(0),
                    "NON-VACUITY: this ship must actually brown out inside a day, or the cap below " +
                    "is satisfied by a ship with no power problem at all");
                Assert.That(brownouts, Is.LessThanOrEqualTo(MaxBrownoutEntriesInADay),
                    "the flap is not bounded: " + brownouts + " brownout entries in " + Ticks +
                    " ticks against a " + HistorySystem.BrownoutQuietTicks + "-tick episode window");
                Assert.That(repairs, Is.GreaterThan(0),
                    "NON-VACUITY: the crew must really have finished a service, or 'the repair line " +
                    "survived' is a claim about an empty set");
                Assert.That(firstRepairTick, Is.LessThan(HistorySystem.BrownoutQuietTicks),
                    "NON-VACUITY: the landmark must predate the flap by more than one episode " +
                    "window, or surviving it proves nothing (first repair at tick " + firstRepairTick + ")");
                Assert.That(total, Is.LessThan(HistorySystem.MaxEntries),
                    "the ring is FULL (" + total + " of " + HistorySystem.MaxEntries +
                    ") — something was evicted, which is the whole defect");
                Assert.That(survivingBootLines, Is.EqualTo(bootLines),
                    "THE LANDMARK: every tick-0 line must still be readable a sim-day later. Before " +
                    "the fix the ring's whole surviving window was ticks 860 011-863 991 — four " +
                    "sim-minutes — and the ship's own premise had been evicted from its own log");
                Assert.That(history.Entries.Any(e => e.Kind == (byte)HistoryKind.Alarm), Is.True,
                    "…and so must the machine-failure alarms in between");
            });
        }

        // ═══════════════════════════════════════════════ 2. the coalescer's contract, driven small

        /// <summary>A bare sim with one hand-driven <see cref="HistorySystem"/>: the brownout stream
        /// is published directly so the test controls the tick of every edge.</summary>
        private static Simulation BareSim()
            => new Simulation(AsciiWorld.Build(new[] { "#####", "#...#", "#####" }), 7, new ISimSystem[0]);

        private static void Flap(Simulation sim, HistorySystem h, ushort networkId, bool inBrownout, long atTick)
        {
            while (sim.TickCount < atTick) sim.Tick();
            sim.Events.Publish(new BrownoutChangedEvent { NetworkId = networkId, InBrownout = inBrownout });
            Deliver(sim, h);
        }

        /// <summary>
        /// The episode contract in one place: a network that flaps repeatedly inside the window owns
        /// exactly ONE entry, stamped when the episode BEGAN, whose text states how many changes
        /// there were and which way it currently sits.
        ///
        /// <para>⛔ <b>THE TWO LITERALS ARE ASSERTED ON PURPOSE.</b> "browned out" and "recovered"
        /// are not prose here — <c>ShipSystems.Fault</c> attributes the MOSS ledger's LAST FAULT
        /// column by sniffing exactly those substrings (<c>ShipSystems.cs:1098,1150</c>). A reword
        /// that drops either empties that column in silence, which is why this test names them.</para>
        /// </summary>
        [Test]
        public void AFlappingNetwork_OwnsOneEntry_ThatCountsTheChangesAndSaysHowItSitsNow()
        {
            var sim = BareSim();
            var h = new HistorySystem();

            Flap(sim, h, 1, inBrownout: true, atTick: 10);
            Assert.That(h.Entries.Count, Is.EqualTo(1), "the first edge always appends");
            Assert.That(h.Entries[0].Text, Does.Contain("browned out"));
            Assert.That(HistorySystem.BrownoutEdges(h.Entries[0].SubjectB), Is.EqualTo(1u),
                "one edge folded in so far");
            Assert.That(HistorySystem.BrownoutIsShedding(h.Entries[0].SubjectB), Is.True,
                "…and the episode word records WHICH WAY it sits, which is what makes a duplicate " +
                "edge detectable after a reload");

            Flap(sim, h, 1, inBrownout: false, atTick: 100);
            Flap(sim, h, 1, inBrownout: true, atTick: 200);
            Flap(sim, h, 1, inBrownout: false, atTick: 300);

            Assert.Multiple(() =>
            {
                Assert.That(h.Entries.Count, Is.EqualTo(1), "four edges inside one hour are ONE line");
                Assert.That(h.Entries[0].Tick, Is.EqualTo(10),
                    "the entry is stamped when the EPISODE began, not at its latest flap");
                Assert.That(h.Entries[0].SubjectA, Is.EqualTo(1u), "the network id is structural");
                Assert.That(HistorySystem.BrownoutEdges(h.Entries[0].SubjectB), Is.EqualTo(4u),
                    "all four edges are counted");
                Assert.That(HistorySystem.BrownoutIsShedding(h.Entries[0].SubjectB), Is.False,
                    "…and the word records that it ended RECOVERED");
                Assert.That(h.Entries[0].Text, Does.Contain("4 changes"), "and the count is SAID");
                Assert.That(h.Entries[0].Text, Does.Contain("recovered"),
                    "the line must state the CURRENT state — a swallowed recovery leaves the player " +
                    "looking at a fault that no longer exists");
                Assert.That(h.Entries[0].Text, Does.Contain("browned out"),
                    "…and it must STILL lead with the fault, or the MOSS ledger's LAST FAULT column " +
                    "loses the only record that this network ever shed");
                Assert.That(h.Entries[0].Kind, Is.EqualTo((byte)HistoryKind.Brownout));
            });
        }

        /// <summary>
        /// The window is a real boundary, bracketed from both sides: an edge one tick INSIDE
        /// <see cref="HistorySystem.BrownoutQuietTicks"/> folds in, an edge exactly ON it starts a
        /// new line. Two legs, because a suite that only tested "it folds" would survive a window of
        /// any size at all (seventh shape).
        /// </summary>
        [Test]
        public void TheEpisodeWindowIsBracketedFromBothSides()
        {
            long w = HistorySystem.BrownoutQuietTicks;

            var inside = BareSim(); var hi = new HistorySystem();
            Flap(inside, hi, 1, true, 10);
            Flap(inside, hi, 1, false, 10 + w - 1);
            int insideCount = hi.Entries.Count;

            var outside = BareSim(); var ho = new HistorySystem();
            Flap(outside, ho, 1, true, 10);
            Flap(outside, ho, 1, false, 10 + w);
            int outsideCount = ho.Entries.Count;

            Assert.Multiple(() =>
            {
                Assert.That(insideCount, Is.EqualTo(1), "one tick inside the window still folds");
                Assert.That(outsideCount, Is.EqualTo(2), "the window expired — a new episode begins");
                Assert.That(ho.Entries[1].Tick, Is.EqualTo(10 + w));
                Assert.That(HistorySystem.BrownoutEdges(ho.Entries[1].SubjectB), Is.EqualTo(1u),
                    "…and its count restarts at one");
            });
        }

        /// <summary>
        /// ⭐ <b>THE IDEMPOTENCY DROP IS NOT BOUNDED BY THE EPISODE WINDOW — and this leg exists
        /// because the mutation that says so SURVIVED THE FIRST TIME IT WAS RUN.</b>
        ///
        /// <para>`RecordBrownout`'s header claims the direction test deliberately sits ABOVE the
        /// window check, on the reasoning that an episode boundary does not break edge alternation.
        /// Moving that line below the <c>break</c> — i.e. de-duplicating only inside the window —
        /// reddened NOTHING in the whole suite. A claim in a doc comment with no instrument behind
        /// it is exactly what this repo's mutation discipline exists to catch, so it is caught here
        /// rather than believed.</para>
        ///
        /// <para>THE REAL CASE, not a hypothetical: a network sheds and then the ship is quiet for
        /// over an hour. <c>PowerSystem</c> publishes nothing while nothing changes, so the episode's
        /// window shuts with the network STILL SHEDDING. Reload now and <c>_wasBrownout</c> comes
        /// back false and re-publishes "shedding" — a duplicate arriving long after the window. With
        /// the test inside the window, that duplicate opens a phantom second episode and the reload
        /// diverges again, which is the same defect in a longer costume.</para>
        ///
        /// <para>The control leg is what stops this from being a blanket "ignore late edges": a REAL
        /// edge after the same expiry is the OPPOSITE direction, and it must open a new episode.</para>
        /// </summary>
        [Test]
        public void ADuplicateEdgeIsDropped_EvenAfterTheEpisodeWindowHasExpired()
        {
            long w = HistorySystem.BrownoutQuietTicks;
            const long Late = 5000; // comfortably past the window's edge

            var duplicate = BareSim(); var hd = new HistorySystem();
            Flap(duplicate, hd, 1, inBrownout: true, atTick: 10);
            Flap(duplicate, hd, 1, inBrownout: true, atTick: 10 + w + Late);   // the reload artefact

            var real = BareSim(); var hr = new HistorySystem();
            Flap(real, hr, 1, inBrownout: true, atTick: 10);
            Flap(real, hr, 1, inBrownout: false, atTick: 10 + w + Late);       // a genuine recovery

            Assert.Multiple(() =>
            {
                Assert.That(hd.Entries.Count, Is.EqualTo(1),
                    "a SAME-direction edge is a duplicate however late it arrives — the window bounds " +
                    "coalescing, not de-duplication");
                Assert.That(HistorySystem.BrownoutEdges(hd.Entries[0].SubjectB), Is.EqualTo(1u),
                    "…and it must not be counted either");
                Assert.That(hr.Entries.Count, Is.EqualTo(2),
                    "CONTROL: an OPPOSITE-direction edge after the same expiry is real and opens a " +
                    "new episode — without this leg the assertion above is satisfied by dropping " +
                    "every late edge");
                Assert.That(HistorySystem.BrownoutIsShedding(hr.Entries[1].SubjectB), Is.False);
            });
        }

        /// <summary>
        /// ⛔ <b>THE NAMED MUTATION THIS TEST EXISTS FOR:</b> delete <c>|| prior.SubjectA != net</c>
        /// from <c>RecordBrownout</c>'s scan (i.e. let any brownout entry match). Applied, observed,
        /// reverted — with it gone, network 2's edges fold into network 1's line and this test
        /// reports one entry where it demands two.
        ///
        /// <para>Two networks flapping at once is not hypothetical on a wreck: every severed hull
        /// section that keeps a conduit run becomes its own <c>NetworkId</c>.</para>
        /// </summary>
        [Test]
        public void TwoFlappingNetworks_KeepSeparateEpisodes()
        {
            var sim = BareSim();
            var h = new HistorySystem();

            Flap(sim, h, 1, true, 10);
            Flap(sim, h, 2, true, 20);
            Flap(sim, h, 1, false, 30);
            Flap(sim, h, 2, false, 40);

            var byNet = h.Entries.ToDictionary(e => e.SubjectA);
            Assert.Multiple(() =>
            {
                Assert.That(h.Entries.Count, Is.EqualTo(2),
                    "one episode per NETWORK — folding two networks into one line is a lie about which " +
                    "part of the ship is failing");
                Assert.That(byNet.ContainsKey(1u) && byNet.ContainsKey(2u), Is.True);
                Assert.That(HistorySystem.BrownoutEdges(byNet[1u].SubjectB), Is.EqualTo(2u));
                Assert.That(HistorySystem.BrownoutEdges(byNet[2u].SubjectB), Is.EqualTo(2u));
                Assert.That(byNet[1u].Text, Does.Contain("network 1"));
                Assert.That(byNet[2u].Text, Does.Contain("network 2"));
            });
        }

        /// <summary>
        /// The SYSS chapter round-trips the episode: capture mid-episode, restore into a FRESH
        /// <see cref="HistorySystem"/>, publish the next edge, and it folds into the SAME entry with
        /// the SAME start tick and an incremented count — identical to the uninterrupted twin.
        ///
        /// <para>⛔ <b>THIS TEST'S SCOPE IS THE CHAPTER, NOT THE SHIP, AND SAYING SO IS THE POINT.</b>
        /// It round-trips ONE system with no <c>PowerSystem</c> in the stack, so it CANNOT see the
        /// determinism defect independent review found — a reload re-publishes a duplicate
        /// <c>BrownoutChangedEvent</c> because <c>PowerSystem._wasBrownout</c> is unsaved, and that
        /// duplicate used to inflate the episode's hashed edge count. An earlier draft of this file
        /// offered this test as the evidence for "a save taken mid-episode replays", which was the
        /// wrong instrument for the claim. The right one is
        /// <see cref="TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode"/>, which
        /// drives the FULL stack on a ship that actually flaps.</para>
        ///
        /// <para>This is the reason the throttle is derived from the ring instead of from a private
        /// <c>_lastBrownoutTick</c>: the ring is already a save chapter, so there is nothing new to
        /// version. A field would have reproduced <c>PowerSystem._wasBrownout</c>'s disease — unsaved
        /// state that decides what gets written.</para>
        /// </summary>
        [Test]
        public void TheEpisodeSurvivesASaveAndReload_BecauseTheThrottleIsTheRingItself()
        {
            var sim = BareSim();
            var live = new HistorySystem();
            Flap(sim, live, 1, true, 10);
            Flap(sim, live, 1, false, 100);

            var buffer = new MemoryStream();
            using (var w = new BinaryWriter(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
                live.CaptureState(w);
            buffer.Position = 0;
            var restored = new HistorySystem();
            using (var r = new BinaryReader(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
                restored.RestoreState(r, live.StateVersion);

            // The next edge, delivered to BOTH — the uninterrupted twin and the reloaded one.
            var twinSim = BareSim();
            while (twinSim.TickCount < 200) twinSim.Tick();
            twinSim.Events.Publish(new BrownoutChangedEvent { NetworkId = 1, InBrownout = true });
            twinSim.Events.SwapBuffers();
            live.Tick(twinSim);
            restored.Tick(twinSim);

            Assert.Multiple(() =>
            {
                Assert.That(restored.Entries.Count, Is.EqualTo(live.Entries.Count).And.EqualTo(1),
                    "a reload must not start a second episode");
                Assert.That(restored.Entries[0].Tick, Is.EqualTo(live.Entries[0].Tick),
                    "…nor re-stamp the one it is in");
                Assert.That(restored.Entries[0].SubjectB, Is.EqualTo(live.Entries[0].SubjectB),
                    "…nor lose the episode word");
                Assert.That(HistorySystem.BrownoutEdges(restored.Entries[0].SubjectB), Is.EqualTo(3u),
                    "…which carries the edge count");
                Assert.That(restored.StateChecksum(), Is.EqualTo(live.StateChecksum()),
                    "and the folds agree, which is what a determinism pin would see");
            });
        }

        /// <summary>
        /// ⭐⭐ <b>THE DEFECT INDEPENDENT REVIEW MEASURED, AND THE INSTRUMENT THAT WOULD HAVE CAUGHT
        /// IT: a save taken MID-BROWNOUT must replay.</b> Full <see cref="SystemStack"/>, the
        /// shipped wreck, a real <c>SaveWriter</c>→<c>SaveReader</c> round trip, and 60 000 ticks of
        /// run-on against an uninterrupted twin.
        ///
        /// <para><b>WHAT WENT WRONG.</b> <c>PowerSystem</c> is deliberately not
        /// <see cref="IStatefulSystem"/>, so <c>_wasBrownout</c> restores false and re-publishes a
        /// <c>BrownoutChangedEvent</c> for a network that was already shedding. Before this package
        /// that duplicate was one more ring entry which evicted inside ~200 s — genuinely harmless,
        /// and <c>PowerSystem</c>'s header said so. Coalescing folded it into a HASHED, never-evicted
        /// episode word: HIST read <c>eff48a500b4e5117</c> on the reloaded sim against
        /// <c>eff48a500b403996</c> on the twin, one episode's edge count 1037 against 1036.</para>
        ///
        /// <para><b>THE TWIN IS MARKED DIRTY AFTER THE SAVE, and that is the DOCUMENTED §13.10
        /// PROTOCOL rather than a thumb on the scale.</b> <c>SaveReader</c> leaves the loaded sim's
        /// rooms dirty by design, and <c>RoomState.Recompute</c> is not gas-idempotent (MECHANICS
        /// §13.10) — so without a MATCHED recompute the two sims' atmospheres drift in the last bits
        /// for a reason that predates this lane by months. <c>SaveRestoreRunOnTests</c> and
        /// <c>P2ExitTests</c> both do exactly this. Measured here: without it, the two sims differ at
        /// BOTH save ticks including the one before any brownout exists; with it, both are
        /// bit-identical. Whole <see cref="Simulation.StateHash"/> is asserted, not just the fold.</para>
        ///
        /// <para>⛔ MUTATION: delete the <c>if (BrownoutIsShedding(prior.SubjectB) == e.InBrownout)
        /// return;</c> idempotency line from <c>HistorySystem.RecordBrownout</c> ⇒ the mid-episode
        /// leg fails with the two folds above.</para>
        ///
        /// <para>⛔⛔ <b>WHAT THIS TEST DOES NOT COVER, AND THE NAME SAYS SO: A SAVE TAKEN ON AN
        /// EPISODE'S OPENING TICK.</b> Those ticks do NOT replay and cannot be made to by any
        /// consumer-side rule — that is filed residual 2 (MECHANICS §13.43.2, and
        /// <c>RecordBrownout</c>'s header carries the numbers). Both save ticks below are
        /// deliberately chosen away from a boundary: 135 000 is mid-episode and 100 000 precedes
        /// the ship's first edge entirely. An earlier draft of this test was called
        /// <c>…WhenTheSaveIsTakenMidBrownout</c> and its prose claimed the property generally; that
        /// over-claimed, and independent review caught it. The boundary's own instrument is
        /// <see cref="EpisodeBoundarySaves_DoNotReplay_ThisIsFiledResidual2"/>.</para>
        /// </summary>
        [Test]
        public void TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode()
        {
            // 135 000 is INSIDE the wreck's first brownout episode (its first edge is at 128 361,
            // measured); 100 000 is before any edge at all and is the control.
            const int MidBrownout = 135000;
            const int BeforeAnyEdge = 100000;
            const int RunOn = 60000;

            (ulong Live, ulong Loaded, ulong HistLive, ulong HistLoaded, int Edges) Leg(int saveTick)
            {
                var live = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
                int edges = 0;
                while (live.TickCount < saveTick)
                {
                    live.Tick();
                    foreach (var b in live.Events.Read<BrownoutChangedEvent>()) edges++;
                }

                var buffer = new MemoryStream();
                SaveWriter.Write(live, buffer);
                buffer.Position = 0;
                var loaded = SaveReader.Read(buffer, Stack());
                live.Rooms.MarkDirty(); // §13.10's matched recompute — see the header

                for (int i = 0; i < RunOn; i++) { live.Tick(); loaded.Tick(); }
                return (live.StateHash(), loaded.StateHash(),
                        History(live).StateChecksum(), History(loaded).StateChecksum(), edges);
            }

            var control = Leg(BeforeAnyEdge);
            var subject = Leg(MidBrownout);

            Assert.Multiple(() =>
            {
                Assert.That(control.Edges, Is.EqualTo(0),
                    "NON-VACUITY: the control's save must be taken BEFORE any brownout edge, or it " +
                    "is not a control for anything");
                Assert.That(control.Loaded, Is.EqualTo(control.Live),
                    "the control leg must already replay — if it does not, this test is measuring " +
                    "something other than this package");
                Assert.That(subject.Edges, Is.GreaterThan(0),
                    "NON-VACUITY: the subject's save must be taken while the network is genuinely " +
                    "flapping, or a calm ship is answering a question about a flapping one");
                Assert.That(subject.HistLoaded, Is.EqualTo(subject.HistLive),
                    "the HIST fold diverged — a duplicate brownout edge was counted after the " +
                    "reload: live " + subject.HistLive.ToString("x16", CultureInfo.InvariantCulture) +
                    " vs loaded " + subject.HistLoaded.ToString("x16", CultureInfo.InvariantCulture));
                Assert.That(subject.Loaded, Is.EqualTo(subject.Live),
                    "a save taken mid-brownout does not replay: StateHash live " +
                    subject.Live.ToString("x16", CultureInfo.InvariantCulture) + " vs loaded " +
                    subject.Loaded.ToString("x16", CultureInfo.InvariantCulture));
            });
        }

        /// <summary>
        /// ⛔⛔ <b>THIS TEST ASSERTS A DEFECT, ON PURPOSE, AND IT IS NOT A PROPERTY ANYONE WANTS.</b>
        /// It is the instrument for <b>filed residual 2</b>: a save taken on the tick a brownout
        /// episode's opening entry is stamped does not replay, and cannot be made to from the
        /// consumer side (the idempotency rule drops duplicate edges; it cannot reconstruct an edge
        /// the loaded sim never published — see <c>HistorySystem.RecordBrownout</c> and
        /// <c>PowerSystem</c>'s header for the mechanism and MECHANICS §13.43.2 for the numbers).
        ///
        /// <para><b>WHY PIN A KNOWN DEFECT AT ALL</b> — normally PROCESS §3 forbids exactly this.
        /// The judgement here: the residual is permanent (a coalesced entry never evicts, so the
        /// perturbation compounds instead of healing), it is REACHABLE on the shipped ship, and the
        /// only other record of it is prose. Prose went stale twice in this lane already. This leg
        /// makes the residual's SHAPE executable, so a future change cannot move it silently:</para>
        ///
        /// <list type="bullet">
        /// <item>if someone CLOSES it — most likely by landing the filed stateful-<c>PowerSystem</c>
        /// package — this test goes red, and that red is GOOD NEWS. Delete the test, delete the
        /// residual from the three doc sites, and say so in the commit.</item>
        /// <item>if someone WIDENS it — a boundary window bigger than the one tick asserted clean
        /// below — this test also goes red, and that red is a regression.</item>
        /// </list>
        ///
        /// <para>⚠️ The two legs together are the point. Asserting only "the boundary diverges"
        /// would pass on a tree where EVERY save tick diverges, i.e. where D1 had been reverted
        /// wholesale; the clean-neighbour leg is what makes this a statement about a ONE-TICK
        /// window rather than about brokenness in general. Swept widths at three episodes were
        /// 1, 1 and 11 ticks (§13.43.2); 128 361 is one of the one-tick ones, which is why it is
        /// the fixture here.</para>
        /// </summary>
        [Test]
        public void EpisodeBoundarySaves_DoNotReplay_ThisIsFiledResidual2()
        {
            // The wreck's FIRST episode opens here — the entry is stamped 128361 (measured).
            const int EpisodeOpeningTick = 128361;
            const int RunOn = 1500; // the divergence appears as soon as the loaded sim re-derives

            (ulong Live, ulong Loaded) Leg(int saveTick)
            {
                var live = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
                while (live.TickCount < saveTick) live.Tick();
                var buffer = new MemoryStream();
                SaveWriter.Write(live, buffer);
                buffer.Position = 0;
                var loaded = SaveReader.Read(buffer, Stack());
                live.Rooms.MarkDirty(); // §13.10's matched recompute, as in the sibling test
                for (int i = 0; i < RunOn; i++) { live.Tick(); loaded.Tick(); }
                return (History(live).StateChecksum(), History(loaded).StateChecksum());
            }

            var onTheBoundary = Leg(EpisodeOpeningTick);
            var oneTickLater = Leg(EpisodeOpeningTick + 1);

            Assert.Multiple(() =>
            {
                Assert.That(onTheBoundary.Loaded, Is.Not.EqualTo(onTheBoundary.Live),
                    "RESIDUAL 2 APPEARS TO BE CLOSED — and that is good news, not a failure. A save " +
                    "on an episode's opening tick now replays. If you landed the stateful-PowerSystem " +
                    "package: delete this test, and strike residual 2 from RecordBrownout's header, " +
                    "PowerSystem's header and MECHANICS §13.43.2 in the same commit.");
                Assert.That(oneTickLater.Loaded, Is.EqualTo(oneTickLater.Live),
                    "RESIDUAL 2 HAS WIDENED past the single tick it was measured at. The window used " +
                    "to end on the entry's own stamp; a save one tick later replayed. Something has " +
                    "changed about when the episode's opening edge is derived.");
            });
        }

        /// <summary>
        /// ⭐⭐ <b>A RECOVERED EPISODE IS STILL THE LAST FAULT — the second defect review found.</b>
        /// Because a whole episode is ONE entry whose text is rewritten in place, a recovery
        /// overwrote the record of its own fault, and the column's "recovered" sniff then skipped
        /// the only evidence the network had ever shed. Measured on this exact fixture: 3 of 21
        /// episodes ended recovered, and the reactor row reported the tick-814 211 episode while the
        /// NEWER 850 221 one was skipped — the inversion of MOSS spec §5.1.
        ///
        /// <para>⛔ <b>THE FIRST LEG IS AUTHORED, NOT DRIVEN, AND THAT IS THE WHOLE LESSON OF THE
        /// SEND-BACK.</b> The pre-existing
        /// <c>ShipSystemsTests.Fault_Column_Is_The_Last_Thing_That_Went_Wrong_And_Never_A_Recovery</c>
        /// drives the slice for a day and was GREEN throughout the broken window — purely because
        /// that ship happens to be SHEDDING at its day-1 boundary. A test of "a RECOVERED episode
        /// still surfaces" whose fixture may or may not end recovered is a coin flip, not an
        /// instrument. Leg 1 authors the ring so the property is exercised on every run: the newest
        /// brownout entry is a RECOVERED episode, and behind it sits a single-edge PURE recovery
        /// which must still be skipped.</para>
        ///
        /// <para>Leg 2 keeps the shipped wreck in the picture — the column must name the newest
        /// episode there too, whichever way that one happens to end.</para>
        ///
        /// <para>⛔ MUTATIONS: (a) make <c>ShipSystems.IsNotAFault</c> fall through to the text sniff
        /// for brownouts ⇒ leg 1 fails, naming the older episode; (b) make <c>Fault</c> return
        /// <c>Summarize(e.Text)</c> for brownouts ⇒ both legs fail on "never prints the current
        /// state"; (c) delete the <c>Edges &gt;= 2</c> clause of
        /// <c>BrownoutEpisodeRecordsAFault</c> ⇒ leg 1 fails.</para>
        /// </summary>
        [Test]
        public void ARecoveredBrownoutEpisode_IsStillTheLastFault_AndTheColumnPrintsTheFault()
        {
            const long TPD = SimClockUtil.TicksPerDay;

            // ── LEG 1: authored ring, so the property is exercised deterministically ────────────
            var authored = BareSim();
            var ring = new HistorySystem();
            // ⛔ THE TEXT COMES FROM THE REAL RENDERER, never a placeholder. Shipped code produces an
            // entry's prose and its episode word from the same call, so a fixture that hand-writes
            // one beside the other is describing a state the sim cannot reach. The first draft of
            // this leg wrote "x" and failed against §5.1's `"browned out"` gate for the wrong reason.
            void Episode(long tick, uint edges, bool shedding)
            {
                uint word = HistorySystem.EpisodeWord(edges, shedding);
                ring.Record(tick, HistorySystem.BrownoutEpisodeLine(1, word), HistoryKind.Brownout, 1, word);
            }
            Episode(10, edges: 9, shedding: true);            // day 0: still shedding
            Episode(TPD + 10, edges: 6, shedding: false);     // day 1: NEWER, and it RECOVERED
            Episode(TPD + 20, edges: 1, shedding: false);     // day 1: a PURE recovery, still skipped
            var authoredRow = ShipSystems.Compute(authored, ring).Rows.First(r => r.Id == "reactor");

            // ── LEG 2: the shipped wreck, driven a full sim-day ────────────────────────────────
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack()).GiveAllCrewAllWork();
            var history = History(sim);
            for (int i = 0; i < 864000; i++) sim.Tick();
            var episodes = history.Entries.Where(e => e.Kind == (byte)HistoryKind.Brownout).ToList();
            var newest = episodes.Count > 0 ? episodes[episodes.Count - 1] : default;
            int recovered = episodes.Count(e => !HistorySystem.BrownoutIsShedding(e.SubjectB));
            var wreckRow = ShipSystems.Compute(sim, history).Rows.First(r => r.Id == "reactor");

            Assert.Multiple(() =>
            {
                // leg 1 — the deterministic one
                Assert.That(authoredRow.FaultDay, Is.EqualTo(1),
                    "LAST FAULT must name the DAY-1 recovered episode. While a recovered episode was " +
                    "skipped it named the day-0 one, which is the inversion of spec §5.1");
                Assert.That(authoredRow.FaultText, Does.Contain("BROWNED OUT"),
                    "…and it must read as a fault");
                Assert.That(authoredRow.FaultText, Does.Not.Contain("RECOVERED"),
                    "…never as the episode's CURRENT state: 'RECOVERED' under a column headed LAST " +
                    "FAULT is the misread spec §5.1 exists to stop");
                Assert.That(authoredRow.FaultText, Does.Not.Contain("CHANGES WITHIN THE HOUR"),
                    "…and the column renders the canonical fault sentence, not the developing " +
                    "episode line (which belongs in the FAULT LOG below it)");
                Assert.That(authoredRow.FaultText,
                    Is.EqualTo(HistorySystem.BrownoutFaultLine(1).ToUpperInvariant()),
                    "…which is HistorySystem's one copy of that sentence, uppercased");

                // leg 2 — the shipped ship
                Assert.That(episodes, Has.Count.GreaterThan(1),
                    "NON-VACUITY: the wreck must produce several episodes, or 'the NEWEST one' names nothing");
                Assert.That(recovered, Is.GreaterThan(0),
                    "NON-VACUITY: the wreck must produce at least one recovered episode, or leg 1's " +
                    "property is one the shipped game never reaches");
                Assert.That(wreckRow.FaultDay, Is.EqualTo(Chronicle.DayOf(newest.Tick)),
                    "on the shipped ship too, LAST FAULT names the newest episode");
                Assert.That(wreckRow.FaultText, Does.Contain("BROWNED OUT").And.Not.Contain("RECOVERED"));
            });
        }

        // ═══════════════════════════════════════════════════════════ 3. D1 — the three missing lines

        /// <summary>
        /// ⭐⭐ <b>D1(i): AN ORDINARY THAW WRITES A LINE.</b> Driven on the shipped wreck through the
        /// only path that opens a capsule. Before this package the fall-through arm of
        /// <c>CryoSystem.Open</c> recorded NOTHING — only the emergency arm did — so the single
        /// largest change a player can make to the crew roster left no trace.
        ///
        /// <para>NON-VACUITY: the capsule is asserted SHUT and the sleeper asserted absent before
        /// the drive, and the line is required to carry the NEW <see cref="HistoryKind.Thaw"/>
        /// rather than <see cref="HistoryKind.EmergencyThaw"/> — the two are different sentences and
        /// M5-1 builds the ending out of the second one.</para>
        /// </summary>
        [Test]
        public void AnOrdinaryThaw_LeavesAChronicleLine_NamingTheSleeper()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            var history = History(sim);
            var pod = sim.Devices.Items
                .Where(d => d.Kind == DeviceKind.CryoPod && !d.IsOpen && d.IsOperational(sim.Defs))
                .OrderBy(d => d.Id).First();
            string sleeper = CryoSystem.SleeperName(pod.Name);

            Assert.That(pod.IsOpen, Is.False, "precondition: the capsule starts SHUT");
            Assert.That(sim.Citizens.Items.Any(c => c.Name == sleeper), Is.False,
                "precondition: " + sleeper + " is not already aboard");
            int before = CountKind(history, HistoryKind.Thaw);
            Assert.That(before, Is.EqualTo(0), "precondition: no thaw line yet");

            pod.Progress = 0.99f;
            for (int t = 0; t < 100 && !pod.IsOpen; t++) sim.Tick();
            var person = sim.Citizens.Items.First(c => c.Name == sleeper);

            var lines = history.Entries.Where(e => e.Kind == (byte)HistoryKind.Thaw).ToList();
            Assert.Multiple(() =>
            {
                Assert.That(pod.IsOpen, Is.True, "precondition for the claim: the capsule opened");
                Assert.That(lines, Has.Count.EqualTo(1), "exactly one Chronicle line per ordinary thaw");
                Assert.That(lines[0].Text, Does.Contain(sleeper), "the line NAMES the soul who woke");
                Assert.That(lines[0].SubjectA, Is.EqualTo(person.Id), "…structurally, not only in prose");
                Assert.That(lines[0].SubjectB, Is.EqualTo(pod.Id), "…and the capsule rides SubjectB (deliberately not in the prose: every shipped pod is pod_<sleeper>)");
                Assert.That(CountKind(history, HistoryKind.EmergencyThaw), Is.EqualTo(0),
                    "an ORDERED wake is not the ship waking somebody because a crew member died");
            });
        }

        /// <summary>
        /// A powered, pressurised bay: <paramref name="units"/> one-unit stacks of
        /// <paramref name="stock"/> on the ground, one Scrubber at <paramref name="condition"/>, one
        /// crew member with the whole grid on. One-unit stacks and a real walk, for
        /// <c>RepairReserveTests.BuildBay</c>'s stated reasons (a carried stack is invisible to the
        /// reserve count; an adjacent fixture cannot tell "refused" from "instant").
        /// </summary>
        private static Simulation RepairBay(float condition, ItemKind? stock, int units)
        {
            string[] map =
            {
                "################",
                "#..............#",
                "#..............#",
                "#..............#",
                "################",
            };
            var sim = new Simulation(AsciiWorld.Build(map), 42, Stack());
            for (int x = 1; x <= 14; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), "c" + x);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            var subject = sim.AddDevice(DeviceKind.Scrubber, new Int3(2, 2, 0), "scrub_a");
            subject.Condition = condition;
            if (stock.HasValue)
                for (int u = 0; u < units; u++) sim.AddItem(stock.Value, 1, new Int3(1 + u, 3, 0));
            sim.AddCitizen("Okafor", new Int3(14, 3, 0)).GiveAllWork();
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>
        /// ⭐⭐ <b>D1(ii): EVERY COMPLETED REPAIR WRITES A LINE, AND THE LINE SAYS WHICH RUNG PAID
        /// FOR IT.</b> Four arms driven end to end through the real dispatcher — Parts (overhaul),
        /// Seals (service), Swarf (salvage patch) and nothing-in-hand (jury-rig) — because
        /// "the scrubber was serviced" and "the scrubber was patched with the shredded remains of
        /// another machine" are the difference between a ship that is recovering and one that is not.
        ///
        /// <para>Until this package NO completion event existed at all: the MOSS console carried a
        /// standing caveat saying recoveries could not be shown, and it was true.</para>
        ///
        /// <para>Stock is FIVE units against <c>MaintenanceSystem.AutonomousRepairReserve</c> (4, D3)
        /// so exactly one autonomous service is affordable. The two paid arms sit below the wreck
        /// floor, where a consumable is the only legal repair; the jury-rig arm sits inside
        /// [wreck_threshold, maint) with nothing aboard, where an empty-handed patch is the only one.</para>
        ///
        /// <para>⛔ MUTATION: delete the <c>sim.Events.Publish(new RepairCompletedEvent…)</c> from
        /// <c>MaintenanceSystem.DriveWorker</c> ⇒ all four legs fail. ⛔ MUTATION: hardcode
        /// <c>Tier = (byte)RepairTier.Overhaul</c> ⇒ three legs fail on their text.</para>
        /// </summary>
        [Test]
        public void EveryCompletedRepair_LeavesAChronicleLine_SayingWhichRungPaidForIt()
        {
            const int Ticks = 20000; // recruit + walk + fetch + a full 900 s service, with slack
            const float BelowTheWreckFloor = 0.05f;
            const float InTheJuryRigBand = 0.30f;

            // Every leg records into a local and NOTHING is asserted until the end (fifth shape:
            // Assert throws, so a leg after a failing one is indistinguishable from a dead one).
            var results = new List<(string Leg, string Expect, int Count, string Text,
                                    uint SubjectA, uint SubjectB, uint Worker, uint Device,
                                    float Before, float After)>();

            foreach (var (leg, condition, stock, expect) in new (string, float, ItemKind?, string)[]
            {
                ("overhaul",  BelowTheWreckFloor, ItemKind.Parts, "overhauled"),
                ("service",   BelowTheWreckFloor, ItemKind.Seals, "serviced"),
                ("salvage",   BelowTheWreckFloor, ItemKind.Swarf, "patched up"),
                ("jury-rig",  InTheJuryRigBand,   null,           "jury-rigged"),
            })
            {
                var sim = RepairBay(condition, stock, units: 5);
                var history = History(sim);
                var worker = sim.Citizens.Items.First();
                var subject = sim.Devices.Items.First(d => d.Name == "scrub_a");
                for (int i = 0; i < Ticks; i++) sim.Tick();

                var lines = history.Entries.Where(e => e.Kind == (byte)HistoryKind.RepairCompleted).ToList();
                results.Add((leg, expect, lines.Count,
                             lines.Count > 0 ? lines[0].Text : "<no line>",
                             lines.Count > 0 ? lines[0].SubjectA : 0u,
                             lines.Count > 0 ? lines[0].SubjectB : 0u,
                             worker.Id, subject.Id,
                             condition, subject.Condition));
            }

            Assert.Multiple(() =>
            {
                foreach (var r in results)
                {
                    Assert.That(r.After, Is.GreaterThan(r.Before),
                        "NON-VACUITY (" + r.Leg + "): the machine must really have been repaired, " +
                        "or a missing line would be the correct behaviour");
                    Assert.That(r.Count, Is.EqualTo(1), r.Leg + ": expected exactly one Chronicle line");
                    Assert.That(r.Text, Does.Contain(r.Expect), r.Leg + ": " + r.Text);
                    Assert.That(r.Text, Does.Contain("Okafor"), r.Leg + ": the line must name who did it");
                    Assert.That(r.Text, Does.Contain("scrub_a"), r.Leg + ": …and which machine");
                    Assert.That(r.SubjectA, Is.EqualTo(r.Worker), r.Leg + ": the worker, structurally");
                    Assert.That(r.SubjectB, Is.EqualTo(r.Device), r.Leg + ": the device, structurally");
                }
                // The four sentences must actually differ — a tier that renders the same as another
                // conveys nothing, which is the whole point of carrying RepairTier on the event.
                Assert.That(results.Select(r => r.Text).Distinct().Count(), Is.EqualTo(4),
                    "four rungs must read as four different sentences");
            });
        }

        /// <summary>
        /// ⭐⭐ <b>A REPAIR MUST NEVER SURFACE UNDER "LAST FAULT" — the regression this package would
        /// otherwise have shipped, caught and closed.</b>
        ///
        /// <para><c>ShipSystems.Fault</c> attributes a fault to a row by matching the row's DEVICE
        /// NAMES against a history line's text (spec §5.1's admitted weak join). D1's repair line is
        /// the first entry in the whole Chronicle to contain a device name — <i>"Okafor serviced the
        /// scrubber (scrub_a)."</i> — so without <c>IsNotAFault</c>'s kind clause the MOSS ledger
        /// would have reported the SERVICE as the failure. The older device-touching lines are safe
        /// only by accident: <c>StripText</c> names the device KIND, never its name.</para>
        ///
        /// <para>⛔ MUTATION: delete <c>|| e.Kind == (byte)HistoryKind.RepairCompleted</c> from
        /// <c>ShipSystems.IsNotAFault</c> ⇒ this fails with the repair line in the column.</para>
        ///
        /// <para>NON-VACUITY BY INCLUSION: the repair line is asserted PRESENT in the ring first. A
        /// run in which nothing was repaired would pass the empty-column claim while proving nothing.</para>
        /// </summary>
        [Test]
        public void ARepairLineNamingItsMachine_NeverReachesTheLastFaultColumn()
        {
            var sim = RepairBay(0.05f, ItemKind.Parts, units: 5);
            var history = History(sim);
            for (int i = 0; i < 20000; i++) sim.Tick();

            var repair = history.Entries.FirstOrDefault(e => e.Kind == (byte)HistoryKind.RepairCompleted);
            var report = ShipSystems.Compute(sim, history);
            var lifeSupport = report.Rows.First(r => r.Id == "life_support"); // the Scrubber's row

            Assert.Multiple(() =>
            {
                Assert.That(repair.Text, Is.Not.Null.And.Contains("scrub_a"),
                    "NON-VACUITY: the repair line must exist AND carry the device name, or the join " +
                    "below could not have matched it in the first place");
                Assert.That(lifeSupport.FaultText, Does.Not.Contain("scrub_a").IgnoreCase,
                    "a completed service is not a fault: LAST FAULT read '" + lifeSupport.FaultText + "'");
                Assert.That(lifeSupport.FaultText, Does.Not.Contain("serviced").IgnoreCase);
            });
        }

        /// <summary>
        /// The other half of the completion contract, in the shape <c>DeconstructSystemTests</c>
        /// established: a service that does NOT complete announces nothing. Here the ship holds
        /// nothing to repair with AND the machine is below the wreck floor, so
        /// <c>MaintenanceSystem.IsUnfixableWreck</c> refuses the job outright.
        /// </summary>
        [Test]
        public void AnUnfixableWreck_LeavesNoRepairLine()
        {
            var sim = RepairBay(0.05f, stock: null, units: 0);
            var history = History(sim);
            var subject = sim.Devices.Items.First(d => d.Name == "scrub_a");
            for (int i = 0; i < 20000; i++) sim.Tick();

            Assert.Multiple(() =>
            {
                Assert.That(subject.Condition, Is.LessThan(0.25f),
                    "PRECONDITION: nothing repaired it — otherwise the silence below is wrong");
                Assert.That(CountKind(history, HistoryKind.RepairCompleted), Is.EqualTo(0),
                    "nothing was fixed, so nothing may be remembered as fixed");
            });
        }

        /// <summary>
        /// ⭐ <b>D1(iii): COMMISSIONING WRITES A LINE, AND A REFUSAL DOES NOT.</b> Two cells on one
        /// fixture: the same command, the same tile, once with the module aboard and once without.
        /// A single positive leg would pass with a line written unconditionally at the top of
        /// <c>Execute</c>, which is precisely the bug <c>DeconstructSystem</c>'s
        /// validate-on-arrival contract exists to prevent.
        /// </summary>
        [Test]
        public void CommissioningADevice_LeavesAChronicleLine_AndARefusalLeavesNone()
        {
            int WithModules(int count)
            {
                var sim = RepairBay(1.0f, stock: null, units: 0);
                var history = History(sim);
                var subject = sim.Devices.Items.First(d => d.Name == "scrub_a");
                // `Device.Scriptable` DEFAULTS TO TRUE (`Entities/Device.cs:139`) — the wreck's plan
                // authors the false ones explicitly. A fixture that forgot this would assert a
                // commission that the command refuses at its `already fitted` guard.
                subject.Scriptable = false;
                if (count > 0) sim.AddItem(ItemKind.ControllerModule, count, new Int3(3, 3, 0));
                Assert.That(subject.Scriptable, Is.False, "precondition: not already commissioned");

                sim.EnqueueCommand(new CommissionDeviceCommand(subject.Pos));
                sim.Tick(); // the command executes and publishes
                sim.Tick(); // HistorySystem reads the previous tick's bus

                if (count > 0)
                {
                    Assert.That(subject.Scriptable, Is.True,
                        "PRECONDITION for the positive leg: the module was actually fitted");
                    var line = history.Entries.First(e => e.Kind == (byte)HistoryKind.DeviceCommissioned);
                    Assert.That(line.Text, Does.Contain("scrub_a"), "the line names the device");
                    Assert.That(line.Text, Does.Contain("MOSS"), "…and says what changed about it");
                    Assert.That(line.SubjectA, Is.EqualTo(subject.Id), "…structurally, not only in prose");
                }
                else
                {
                    Assert.That(subject.Scriptable, Is.False,
                        "PRECONDITION for the negative leg: the ship cannot pay, so nothing was fitted");
                }
                return CountKind(history, HistoryKind.DeviceCommissioned);
            }

            int paid = WithModules(4);   // build.commission_cost is 1 on the shipped defs; 4 is slack
            int broke = WithModules(0);

            Assert.Multiple(() =>
            {
                Assert.That(paid, Is.EqualTo(1), "one line per fitted module");
                Assert.That(broke, Is.EqualTo(0), "a refusal changed nothing and must announce nothing");
            });
        }
    }
}
