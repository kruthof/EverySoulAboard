using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tools;
using Perilune.Tui;
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-8 — THE LEDGER. Every test here DRIVES A REAL SIMULATION: it places real stacks, drains a
    /// real tank and ticks a real clock, then asserts the number the ledger publishes.
    ///
    /// <para><b>NOTHING HERE RE-DERIVES THE SUBJECT.</b> That is the specific trap this package was
    /// warned about (`ECONOMY-PLAN.md` §5.2.1): a metric test that recomputes the metric with the
    /// implementation's own expression asserts that a function equals itself. So the expected values
    /// below are LITERALS chosen by picking round inputs — 10 Parts over half a sim-day is 20.0/day,
    /// 75 L draining at 50 L/day is 1.5 days — and the item-kind coverage is driven from
    /// <see cref="Enum.GetValues(Type)"/>, which is the enum itself and not the ledger's copy of it.</para>
    ///
    /// <para>Each test names the mutation that makes it fail, in its own comment. Every one of them
    /// was physically applied, watched go red, and reverted.</para>
    /// </summary>
    public class ShipLedgerTests
    {
        private const long TicksPerDay = 864000L;   // Simulation.TicksPerSecond * 60 * 60 * 24

        private static Simulation Fresh() => SimHost.Build(SimHost.DefaultSeed).Sim;

        /// <summary>Advance the clock by exactly <paramref name="ticks"/> ticks.</summary>
        private static void Advance(Simulation sim, long ticks)
        {
            for (long t = 0; t < ticks; t++) sim.Tick();
        }

        private static Int3 SomeFloor(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Walkable) != 0) return p;
                    }
            Assert.Fail("the reference ship must contain at least one walkable tile to place items on");
            return default;
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The matter census
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// EVERY DECLARED <see cref="ItemKind"/> IS COUNTED — the guard that makes the two live
        /// sibling lanes (E0-6 `Seals`, E0-7 `Ice`) safe. It is driven from the ENUM, so a kind added
        /// tomorrow is covered by this test the moment it is declared, with no edit here.
        ///
        /// MUTATION (applied, RED, reverted): make <c>ShipLedger.ComputeKindCount</c> return
        /// <c>max</c> instead of <c>max + 1</c> ⇒ the last declared kind falls off the array, lands in
        /// <c>UnknownUnits</c>, and this fails naming it.
        /// MUTATION 2 (applied, RED, reverted): drop <c>total += count</c> from the item pass ⇒ the
        /// roll-up stops matching the per-kind sum.
        /// </summary>
        [Test]
        public void EveryDeclaredItemKindIsCountedByName_AndTheRollUpEqualsTheirSum()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);
            var kinds = (ItemKind[])Enum.GetValues(typeof(ItemKind));
            Assert.That(kinds.Length, Is.GreaterThan(1), "the ItemKind enum must be non-trivial, or this test is vacuous");

            // A distinct, non-zero count per kind, so a slot swapped with its neighbour is visible.
            var placed = new Dictionary<ItemKind, int>();
            var before = ShipLedger.Sample(sim);
            for (int i = 0; i < kinds.Length; i++)
            {
                int n = 3 + i * 7;
                sim.AddItem(kinds[i], n, pos);
                placed[kinds[i]] = n;
            }

            var after = ShipLedger.Sample(sim);

            long expectedAdded = 0;
            foreach (var kv in placed)
            {
                Assert.That(after.UnitsOf(kv.Key) - before.UnitsOf(kv.Key), Is.EqualTo(kv.Value),
                    "ItemKind." + kv.Key + " (ordinal " + (int)kv.Key + ") is declared in the enum but the " +
                    "ledger did not count the " + kv.Value + " units placed on the ship.\n" +
                    "\n" +
                    "THE BOUNDARY: the census array is sized off the ENUM (ShipLedger.KindCount), never " +
                    "off a literal, so that a kind added by another lane cannot silently vanish from the " +
                    "ledger. A ledger that quietly stops counting a resource is the lying metric E0-8 " +
                    "was chartered to end.");
                expectedAdded += kv.Value;
            }

            Assert.That(after.TotalUnits - before.TotalUnits, Is.EqualTo(expectedAdded),
                "the roll-up must equal the sum of the per-kind counts — E4's Appraisal lever sums it " +
                "(ECONOMY.md §13.3) and would otherwise be summing something else");
            Assert.That(after.UnknownUnits, Is.EqualTo(0),
                "a declared ItemKind landed in the UNKNOWN bucket, which means KindCount is too small");
            Assert.That(after.Units.Length, Is.EqualTo(ShipLedger.KindCount));
        }

        /// <summary>
        /// The census counts a stack a crew member is CARRYING and a stack RESERVED for a job. This
        /// is a deliberate design decision, not an accident: matter in transit has not left the ship,
        /// and a census that dropped it would make the total dip every time somebody picked something
        /// up.
        ///
        /// MUTATION (applied, RED, reverted): add <c>if (it.CarriedBy != 0) continue;</c> to the item
        /// pass ⇒ the carried stack disappears and this fails.
        /// </summary>
        [Test]
        public void CarriedAndReservedStacksAreStillAboard_AndAreCounted()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);
            var baseline = ShipLedger.Sample(sim);

            var carried = sim.AddItem(ItemKind.Scrap, 5, pos);
            carried.CarriedBy = 12345u;                 // in somebody's hands
            var reserved = sim.AddItem(ItemKind.Scrap, 4, pos);
            reserved.ReservedBy = 999u;                 // claimed by a job

            var after = ShipLedger.Sample(sim);
            Assert.That(after.UnitsOf(ItemKind.Scrap) - baseline.UnitsOf(ItemKind.Scrap), Is.EqualTo(9),
                "matter in a crew member's hands, or claimed by a job, has not left the ship");
        }

        /// <summary>
        /// LIVING crew, not the store's Count. Dead crew are never removed from the entity store
        /// (<c>NeedsSystem.cs:198</c> sets a flag and nothing removes), so <c>Citizens.Items.Count</c>
        /// is "souls who ever boarded". This is the audit finding that <see cref="ShipMetrics"/>'s
        /// Food and Morale both divide by that number; the ledger does not repeat it.
        ///
        /// MUTATION (applied, RED, reverted): drop the <c>if (!citizens[i].Dead)</c> guard from the
        /// citizen pass ⇒ LivingCrew tracks the store's Count and this fails.
        /// </summary>
        [Test]
        public void LivingCrewExcludesTheDead_UnlikeTheEntityStoresCount()
        {
            var sim = Fresh();
            var citizens = sim.Citizens.Items;
            Assert.That(citizens.Count, Is.GreaterThan(0), "the reference ship must have crew, or this is vacuous");

            int storeCount = citizens.Count;
            Assert.That(ShipLedger.Sample(sim).LivingCrew, Is.EqualTo(storeCount),
                "with nobody dead the two agree — which is why the bug is invisible on a healthy ship");

            citizens[0].Dead = true;

            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(storeCount),
                "PRECONDITION: the store still holds the dead crew member. If a future change starts " +
                "removing the dead, this test stops proving anything and should be retired, not weakened.");
            Assert.That(ShipLedger.Sample(sim).LivingCrew, Is.EqualTo(storeCount - 1),
                "the ledger's crew count must be the LIVING crew");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The rate members
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// PARTS/DAY over a KNOWN delta and a KNOWN window. 10 units gained over half a sim-day is
        /// 20.0 per day — a literal, arrived at by choosing round inputs rather than by re-running
        /// the implementation's own division.
        ///
        /// MUTATION (applied, RED, reverted): divide by <c>window</c> ticks instead of by
        /// <c>window / TicksPerDay</c> in <c>ShipLedger.Report</c> ⇒ the answer is off by a factor of
        /// 432,000 and this fails.
        /// </summary>
        [Test]
        public void PartsPerDay_IsTheNetChangeScaledToASimDay()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);

            var then = ShipLedger.Sample(sim);
            sim.AddItem(ItemKind.Parts, 10, pos);
            Advance(sim, TicksPerDay / 2);
            var now = ShipLedger.Sample(sim);

            var report = ShipLedger.Report(now, then);
            Assert.That(report.WindowTicks, Is.EqualTo(TicksPerDay / 2));
            Assert.That(report.PartsPerDay, Is.EqualTo(20.0).Within(1e-9),
                "10 Parts gained over half a sim-day is 20 per day");
        }

        /// <summary>
        /// PARTS/DAY GOES NEGATIVE when the ship spends Parts, and that is a reading rather than an
        /// error. The member is deliberately NET — gross production is not derivable without a
        /// lifetime counter, which is saved state, which is hashed state, which moves a pin.
        ///
        /// MUTATION (applied, RED, reverted): clamp the rate with <c>Math.Max(0, …)</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void PartsPerDay_IsNet_AndSaysSoByGoingNegative()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);
            var stack = sim.AddItem(ItemKind.Parts, 10, pos);

            var then = ShipLedger.Sample(sim);
            stack.Count = 4;                       // six spent
            Advance(sim, TicksPerDay / 2);
            var report = ShipLedger.Report(ShipLedger.Sample(sim), then);

            Assert.That(report.PartsPerDay, Is.EqualTo(-12.0).Within(1e-9),
                "6 Parts spent over half a sim-day is -12 per day; a clamped-at-zero rate would hide " +
                "a ship eating its own stock");
        }

        /// <summary>
        /// DAYS OF WATER over a KNOWN drain. 75 L left, falling 25 L per half-day (= 50 L/day), is a
        /// 1.5-day runway. Again a literal from round inputs.
        ///
        /// MUTATION (applied, RED, reverted): invert the subtraction in <c>ShipLedger.Runway</c>
        /// (<c>stockNow - stockThen</c>) ⇒ a draining tank reads "not depleting" and this fails.
        /// </summary>
        [Test]
        public void DaysOfWater_IsTheTankStockOverTheMeasuredDrain()
        {
            var sim = Fresh();
            var tank = FirstTank(sim);
            SetOnlyTank(sim, tank, 100f);

            var then = ShipLedger.Sample(sim);
            Assert.That(then.TankLiters, Is.EqualTo(100f).Within(1e-3),
                "PRECONDITION: the ledger must be reading the tank we just set, or the drain below " +
                "measures nothing");

            Advance(sim, TicksPerDay / 2);
            SetOnlyTank(sim, tank, 75f);
            var report = ShipLedger.Report(ShipLedger.Sample(sim), then);

            Assert.That(report.DaysOfWater, Is.EqualTo(1.5).Within(1e-4),
                "75 L draining at 50 L/day is a 1.5-day runway");
        }

        /// <summary>
        /// A STOCK THAT IS NOT FALLING HAS NO RUNWAY, and reports -1 rather than 0. Zero would read as
        /// "runs out today" — a false alarm on a healthy ship, which is exactly as bad as a false
        /// all-clear.
        ///
        /// MUTATION (applied, RED, reverted): change <c>if (!(lossPerDay &gt; 0)) return -1;</c> to
        /// <c>return 0;</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void ARisingOrSteadyStockReportsNotDepleting_NeverZero()
        {
            var sim = Fresh();
            var tank = FirstTank(sim);
            SetOnlyTank(sim, tank, 100f);

            var then = ShipLedger.Sample(sim);
            Advance(sim, TicksPerDay / 2);
            SetOnlyTank(sim, tank, 140f);            // rising
            var rising = ShipLedger.Report(ShipLedger.Sample(sim), then);
            Assert.That(rising.DaysOfWater, Is.EqualTo(-1),
                "a rising tank has no runway; -1 is the house 'no meaningful value' sentinel");

            var then2 = ShipLedger.Sample(sim);
            Advance(sim, TicksPerDay / 2);
            SetOnlyTank(sim, tank, 140f);            // steady
            var steady = ShipLedger.Report(ShipLedger.Sample(sim), then2);
            Assert.That(steady.DaysOfWater, Is.EqualTo(-1), "a steady tank has no runway either");
        }

        /// <summary>
        /// A RUNWAY BEYOND THE HORIZON IS NOT A NUMBER. At 999+ days the measured delta is float
        /// noise in a tank level, so the digits would be manufactured — and nobody can act on them.
        ///
        /// MUTATION (applied, RED, reverted): delete the
        /// <c>runway &gt; MaxMeaningfulDays ? -1 : runway</c> clamp ⇒ this fails with a five-figure
        /// day count.
        /// </summary>
        [Test]
        public void ARunwayBeyondTheHorizonIsReportedAsNotDepleting()
        {
            var sim = Fresh();
            var tank = FirstTank(sim);
            SetOnlyTank(sim, tank, 1000f);

            var then = ShipLedger.Sample(sim);
            Advance(sim, TicksPerDay);
            SetOnlyTank(sim, tank, 999.9f);          // 0.1 L/day ⇒ ~9,999 days
            var report = ShipLedger.Report(ShipLedger.Sample(sim), then);

            Assert.That(report.DaysOfWater, Is.EqualTo(-1),
                "a ~10,000-day runway is float noise with a decimal point on it, not a forecast");
        }

        /// <summary>
        /// WITH NO EARLIER SAMPLE THERE IS NO RATE — <c>WindowTicks == 0</c>, and every surface must
        /// render "measuring" off that. PartsPerDay is 0 here and 0 is NOT its sentinel (it is a
        /// signed rate whose zero is a real reading), which is exactly why the window field exists.
        ///
        /// MUTATION (applied, RED, reverted): return <c>new ShipLedgerReport(now, 1, …)</c> for the
        /// windowless case ⇒ this fails.
        /// </summary>
        [Test]
        public void WithNoEarlierSample_TheWindowIsZeroAndNoRateMeansAnything()
        {
            var sim = Fresh();
            var report = ShipLedger.Report(ShipLedger.Sample(sim), default);

            Assert.That(report.WindowTicks, Is.EqualTo(0));
            Assert.That(report.DaysOfWater, Is.EqualTo(-1));
            Assert.That(report.DaysOfAir, Is.EqualTo(-1));
            Assert.That(report.Now.Valid, Is.True, "the STOCK half is available immediately — only the rates wait");
            Assert.That(report.Now.TotalUnits, Is.GreaterThanOrEqualTo(0));
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The host-side window
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// The tracker publishes NOTHING until its minimum window has elapsed in SIM time, then
        /// publishes a real one. This is the honest cost of keeping the accumulation out of the sim.
        ///
        /// MUTATION (applied, RED, reverted): drop the <c>span &gt;= _minWindow</c> gate in
        /// <c>Observe</c> ⇒ a rate is published off a one-tick window and the first assertion fails.
        /// </summary>
        [Test]
        public void TheTrackerWithholdsARateUntilItHasWatchedLongEnough()
        {
            var sim = Fresh();
            var tracker = new ShipLedgerTracker(minWindowTicks: 1000, rollWindowTicks: 100000);

            Assert.That(tracker.Observe(sim).WindowTicks, Is.EqualTo(0), "nothing measured yet");
            Advance(sim, 999);
            Assert.That(tracker.Observe(sim).WindowTicks, Is.EqualTo(0), "999 < the 1000-tick minimum");
            Advance(sim, 1);
            Assert.That(tracker.Observe(sim).WindowTicks, Is.EqualTo(1000), "the window opens exactly at the minimum");
        }

        /// <summary>
        /// THE BASELINE ROLLS, so the window stays bounded and a leak that starts today is not
        /// averaged against a healthy yesterday.
        ///
        /// MUTATION (applied, RED, reverted): delete the roll branch (<c>_baseline = _pending</c>) ⇒
        /// the window grows without bound and this fails.
        /// </summary>
        [Test]
        public void TheTrackersWindowIsBounded_TheBaselineRollsForward()
        {
            var sim = Fresh();
            var tracker = new ShipLedgerTracker(minWindowTicks: 10, rollWindowTicks: 100);

            long widest = 0;
            for (int i = 0; i < 20; i++)
            {
                Advance(sim, 50);
                long w = tracker.Observe(sim).WindowTicks;
                if (w > widest) widest = w;
            }
            Assert.That(widest, Is.LessThan(200),
                "the window must stay inside [roll, 2*roll); an unbounded one turns every rate into a " +
                "session average that can never react to anything");
            Assert.That(widest, Is.GreaterThanOrEqualTo(100), "…and it must actually reach the roll width");
        }

        /// <summary>
        /// A REWOUND CLOCK RESTARTS THE WINDOW — and the ledger is measuring again ONE MINIMUM WINDOW
        /// LATER, not whenever the old baseline happens to be overtaken.
        ///
        /// <para>⚠️ THE LAST ASSERTION IS THE WHOLE TEST, AND THE FIRST DRAFT DID NOT HAVE IT. That
        /// draft asserted only that the window is 0 immediately after the rewind — and the mutation it
        /// named SURVIVED, because <c>span &gt;= _minWindow</c> already rejects every negative span on
        /// its own. What the guard actually buys is RECOVERY: without it the stale baseline sits 5,000
        /// ticks in the future and the tracker publishes NOTHING for 5,000 ticks after the load,
        /// silently. Found by running the mutation instead of reasoning about it.</para>
        ///
        /// MUTATION (applied, RED, reverted): delete the <c>now.Tick &lt; _baseline.Tick</c> guard in
        /// <c>Observe</c> ⇒ the window never reopens on the rewound sim and the last assertion fails.
        /// </summary>
        [Test]
        public void ARewoundClockRestartsTheWindow_AndMeasuresAgainOneWindowLater()
        {
            var tracker = new ShipLedgerTracker(minWindowTicks: 10, rollWindowTicks: 100000);
            var older = Fresh();
            var newer = Fresh();
            Advance(newer, 5000);

            Assert.That(tracker.Observe(newer).WindowTicks, Is.EqualTo(0));
            Advance(newer, 5000);
            Assert.That(tracker.Observe(newer).WindowTicks, Is.EqualTo(5000), "PRECONDITION: a window really opened");

            var afterRewind = tracker.Observe(older);   // tick 0 — an older save
            Assert.That(afterRewind.WindowTicks, Is.EqualTo(0),
                "a rewound clock must restart the window, never publish a negative one");

            Advance(older, 10);                        // exactly the minimum window
            Assert.That(tracker.Observe(older).WindowTicks, Is.EqualTo(10),
                "…and it must be MEASURING AGAIN one minimum window later. Without the rewind guard " +
                "the stale baseline sits 5,000 ticks ahead of the loaded sim and the ledger goes " +
                "quiet for 5,000 ticks with nothing on screen saying why.");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // Pin neutrality — the charter's binding constraint
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// READING THE LEDGER CANNOT MOVE A DETERMINISM PIN. Two twins are built from one seed; one
        /// of them is censused on every single tick, the other is never touched. Their
        /// <see cref="Simulation.StateHash"/> must remain identical.
        ///
        /// <para>⚠️ NO LITERAL HASH IS ASSERTED, deliberately (`ECONOMY-PLAN.md` §2.1 rule 4): two
        /// sibling economy lanes are about to move those values, and a literal here would be stale
        /// before this branch merges. The assertion is that the twins MATCH.</para>
        ///
        /// MUTATION (applied, RED, reverted): add <c>sim.WastewaterLiters += 0.001f;</c> to
        /// <c>ShipLedger.Sample</c> ⇒ the twins diverge and this fails.
        /// </summary>
        [Test]
        public void ObservingTheLedgerEveryTickLeavesTheDeterminismTwinsIdentical()
        {
            var watched = SimHost.Build(SimHost.DefaultSeed).Sim;
            var untouched = SimHost.Build(SimHost.DefaultSeed).Sim;
            Assert.That(watched.StateHash(), Is.EqualTo(untouched.StateHash()),
                "PRECONDITION: two sims from one seed start identical, or this test proves nothing");

            var tracker = new ShipLedgerTracker(minWindowTicks: 10, rollWindowTicks: 100);
            for (int t = 0; t < 3000; t++)
            {
                watched.Tick();
                untouched.Tick();
                var r = tracker.Observe(watched);           // the whole report path, every tick
                _ = WireFormat.Ledger(r);                   // …including its serializer
                _ = ShipMetrics.Compute(watched);           // (the neighbour it sits beside)
            }

            Assert.That(watched.StateHash(), Is.EqualTo(untouched.StateHash()),
                "READING THE LEDGER MUTATED THE SIM.\n" +
                "\n" +
                "THE BOUNDARY: E0-8 is chartered PIN-NEUTRAL — the ledger is a report, modelled on " +
                "ShipSystems.Compute, and it must add no hashed state, no saved field and no def row. " +
                "If this fails, something in ShipLedger, ShipLedgerTracker or WireFormat.Ledger is " +
                "writing to sim state, drawing from the RNG, or publishing an event.");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The wire
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// The channel carries item-kind NAMES, sparsely, in enum order — so a kind added by another
        /// lane reaches the player's screen with no client change and no client-side table to fall
        /// off the end of.
        ///
        /// MUTATION (applied, RED, reverted): emit <c>k</c> (the ordinal) instead of
        /// <c>ShipLedger.KindName(k)</c> ⇒ this fails.
        /// MUTATION 2 (applied, RED, reverted): drop the <c>if (units[k] == 0) continue;</c> sparsity
        /// gate ⇒ the absent-kind assertion fails.
        /// </summary>
        [Test]
        public void TheLedgerChannelCarriesKindNames_Sparsely_InEnumOrder()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);
            // The reference ship boots with authored stock (Regolith/Corpse/Potato/Scrap), so the
            // counts below are set rather than assumed: this test is about the wire's SHAPE, and a
            // baseline that drifts with the ship would make it fail for a reason it does not name.
            ZeroExistingStacks(sim);
            sim.AddItem(ItemKind.Scrap, 4, pos);
            sim.AddItem(ItemKind.ControllerModule, 2, pos);

            string json = WireFormat.Ledger(ShipLedger.Report(ShipLedger.Sample(sim), default));

            StringAssert.Contains("\"type\":\"ledger\"", json);
            StringAssert.Contains("[\"Scrap\",4]", json);
            StringAssert.Contains("[\"ControllerModule\",2]", json);
            StringAssert.DoesNotContain("\"MetalOre\"", json,
                "a kind with nothing aboard is omitted — the list is sparse, and 'absent' is not news");

            // Enum order, not insertion order and not a container's layout: Scrap (4) precedes
            // ControllerModule (6) even though ControllerModule has more of the ship's attention.
            Assert.That(json.IndexOf("\"Scrap\"", StringComparison.Ordinal),
                        Is.LessThan(json.IndexOf("\"ControllerModule\"", StringComparison.Ordinal)),
                "the matter list walks the ItemKind ordinals ascending, so a new kind lands at the end");

            // The limits travel with the numbers (DA-M3) — a bare "DAYS OF AIR" is read as an oxygen
            // supply this ship does not have.
            StringAssert.Contains("\"notes\":[", json);
            StringAssert.Contains("THIS SHIP HAS NO AIR RESERVE", json);
        }

        /// <summary>
        /// Culture-proof. The dev machine is de-DE, where a culture-sensitive format puts a COMMA
        /// inside a JSON number and every client's parse dies.
        ///
        /// <para>⚠️ WHAT THIS TEST CAN AND CANNOT DISCRIMINATE — stated because the first draft named
        /// a mutation that CANNOT BITE and it survived. The draft said "replace
        /// <c>ToString(LedgerIc)</c> with <c>ToString()</c> for the unit counts". Applied, that was a
        /// NO-OP: <c>int</c>/<c>long</c> <c>ToString()</c> emits no separator in any culture, so the
        /// explicit <see cref="CultureInfo"/> on the integer fields of
        /// <c>WireFormat.Ledger</c> is a CONVENTION (and future-proofing), not a guard this test
        /// enforces. The real culture exposure is the FRACTIONAL fields, which go through
        /// <c>WireFormat.Field</c>/<c>Num</c>, and that is what the assertions below actually pin.</para>
        ///
        /// MUTATION (applied, RED, reverted): drop the InvariantCulture argument from
        /// <c>WireFormat.Num</c> (<c>value.ToString("0.####")</c>) ⇒ under de-DE <c>tankL</c> becomes
        /// <c>123,456</c>, the two payloads differ, and this fails. `ECONOMY-PLAN.md` §4.10 warns that
        /// an integer-only culture test is a tautology; this one carries a fraction on purpose.
        /// </summary>
        [Test]
        public void TheLedgerChannelSerializesIdenticallyUnderAnyCulture()
        {
            var sim = Fresh();
            var pos = SomeFloor(sim);
            sim.AddItem(ItemKind.Parts, 7, pos);

            var then = ShipLedger.Sample(sim);
            Advance(sim, TicksPerDay / 4);
            SetOnlyTank(sim, FirstTank(sim), 123.456f);
            var report = ShipLedger.Report(ShipLedger.Sample(sim), then);

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string invariant = WireFormat.Ledger(report);
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");   // comma decimal
                string german = WireFormat.Ledger(report);

                Assert.That(german, Is.EqualTo(invariant),
                    "the ledger must serialize identically under any culture");
                StringAssert.DoesNotContain(",\"tankL\":123,", german,
                    "a de-DE decimal comma reached the payload — the number is now two JSON values");
                StringAssert.Contains("123.456", invariant,
                    "PRECONDITION: the payload must actually carry a fractional number, or the culture " +
                    "check above is a tautology over integers");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The ShipMetrics honesty audit — the instrument, checked against a known lie
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// THE AUDIT INSTRUMENT MUST BE ABLE TO FIRE. `ECONOMY-PLAN.md` §4's shell trap generalises:
        /// a matcher that has never been seen to match something is not evidence that it matched
        /// nothing. So a real, known lie is INDUCED — one crew member dies — and the audit is required
        /// to name it.
        ///
        /// <para>What is induced is the real finding: <see cref="ShipMetrics"/> divides Food and
        /// Morale by <c>Citizens.Items.Count</c>, and dead crew are never removed from that store
        /// (<c>NeedsSystem.cs:198</c> sets a flag). On a healthy ship the two agree, which is exactly
        /// why nobody has noticed.</para>
        ///
        /// MUTATION (applied, RED, reverted): make <c>LedgerHarness.Audit</c>'s Morale row count the
        /// dead as living (<c>living++</c> unconditionally) ⇒ the audit reports "agrees" about a ship
        /// where it does not, and this fails.
        /// </summary>
        [Test]
        public void TheMetricsAuditNamesTheDeadCrewDivisor_OnAShipWhereSomebodyHasDied()
        {
            var sim = Fresh();
            int storeCount = sim.Citizens.Items.Count;
            Assert.That(storeCount, Is.GreaterThan(1), "the audit needs at least two crew to have a survivor");

            var healthy = FindRow(LedgerHarness.Audit(sim), "Morale");
            StringAssert.Contains("agrees", healthy.Verdict,
                "PRECONDITION: with nobody dead the audit must report agreement — a row that always " +
                "cries foul is not an instrument");

            sim.Citizens.Items[0].Dead = true;

            var audited = LedgerHarness.Audit(sim);
            StringAssert.Contains("DIVIDES BY THE DEAD", FindRow(audited, "Morale").Verdict,
                "the audit must name ShipMetrics.Morale's dead-crew divisor once somebody has died");
            StringAssert.Contains((storeCount - 1).ToString(CultureInfo.InvariantCulture),
                FindRow(audited, "Morale").Truth,
                "…and state the LIVING crew count it derived independently");
            StringAssert.Contains("is " + storeCount + ", not " + (storeCount - 1),
                FindRow(audited, "(crew count)").Verdict,
                "the crew-count row must name both numbers, so the reader can see which divisor is used");
        }

        /// <summary>
        /// EVERY <see cref="ShipMetricsSnapshot"/> MEMBER IS AUDITED. The audit's value is its
        /// completeness — a member quietly missing from the table is a metric nobody is checking, and
        /// this is the guard that stops one being dropped in a later edit.
        ///
        /// MUTATION (applied, RED, reverted): delete the "Heat" row from
        /// <c>LedgerHarness.Audit</c>'s returned array ⇒ this fails naming it.
        /// </summary>
        [Test]
        public void TheMetricsAuditCoversEveryShipMetricsMember()
        {
            var rows = LedgerHarness.Audit(Fresh());
            // Driven from the STRUCT, not from a copy of the audit's own list: a member added to
            // ShipMetricsSnapshot tomorrow makes this fail until somebody audits it.
            foreach (var field in typeof(ShipMetricsSnapshot).GetFields())
            {
                if (field.Name == "Day" || field.Name == "DayFraction") continue;   // the clock, not a gauge
                bool found = false;
                for (int i = 0; i < rows.Length; i++) if (rows[i].Name == field.Name) found = true;
                Assert.That(found, Is.True,
                    "ShipMetricsSnapshot." + field.Name + " has no row in LedgerHarness.Audit.\n" +
                    "\n" +
                    "THE BOUNDARY: E0-8 was chartered because 'the metrics must stop lying before " +
                    "anything else is tuned against them' (ECONOMY-PLAN.md §1). A member with no row " +
                    "in the honesty table is a metric nobody has checked. Add the row — with an " +
                    "INDEPENDENT derivation, never the metric's own expression — in the same commit.");
            }
        }

        private static LedgerHarness.MetricAudit FindRow(LedgerHarness.MetricAudit[] rows, string name)
        {
            for (int i = 0; i < rows.Length; i++) if (rows[i].Name == name) return rows[i];
            Assert.Fail("the audit has no '" + name + "' row");
            return default;
        }

        // ---------------------------------------------------------------- helpers

        /// <summary>Empty every stack the ship booted with, so a test can state exact unit counts.
        /// The stacks stay in the store (a zero-count kind is simply omitted from the sparse wire
        /// list), which is why this is enough.</summary>
        private static void ZeroExistingStacks(Simulation sim)
        {
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) items[i].Count = 0;
        }

        private static Device FirstTank(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.WaterTank) return devices[i];
            Assert.Fail("the reference ship must carry a WaterTank for the water-runway tests");
            return null;
        }

        /// <summary>Put <paramref name="liters"/> in <paramref name="tank"/> and EMPTY every other
        /// tank, so the ship-wide total the ledger reports is the number this test set. Without the
        /// second half a second tank's contents ride along and the runway arithmetic is measured
        /// against a stock the test does not control.</summary>
        private static void SetOnlyTank(Simulation sim, Device tank, float liters)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.WaterTank) devices[i].StoredLiters = 0f;
            tank.StoredLiters = liters;
        }
    }
}
