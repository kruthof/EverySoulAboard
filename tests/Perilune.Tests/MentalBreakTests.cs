using System;
using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M4-9 — THE FIRST MENTAL BREAK, AND THIS FILE IS THE MECHANISM'S ONLY INSTRUMENT.</b>
    ///
    /// <para>⛔ <b>SAY THE VACUITY OUT LOUD, BECAUSE THE CHARTER NAMED THIS PACKAGE AS THE MOST
    /// EXPOSED THING IN THE MILESTONE TO IT.</b> <c>perilune-m4.packages.md</c> §2's instrument table
    /// says, in advance, that <b>no determinism pin can see the tier derivation, the reset rule, or
    /// any of the three behaviours</b> — under OD-H every work type boots OFF, no pinned fixture
    /// enqueues a command, and on <c>--ship slice</c> and P1's hand-built <c>BuildScenario</c> the
    /// crew do essentially nothing. A held pin here is a VACUOUSLY held pin (M2-12's
    /// <i>"no pin sees the generation term"</i>, M3-7's <i>"no pin sees the rate term"</i>, D1/D6's
    /// <i>"the hold is VACUOUS ×4"</i> — the same finding in four costumes). ⇒ <b>everything the
    /// package claims about behaviour is claimed HERE and nowhere else.</b> The single exception the
    /// table names is the sleep pause, which M3-9 proved is reachable on P1's own fixture — and the
    /// measured answer for this tree is in the package's re-pin notes.</para>
    ///
    /// <para><b>ABSOLUTE, NOT RATIO.</b> Every threshold leg below asserts a NUMBER, on the 7th
    /// trap's lesson (<i>"ratio suites cannot see a 2× scale error; only a proportional floor pins
    /// scale"</i>). A suite that only checked <c>major &lt; minor</c> would survive the whole span
    /// being re-anchored.</para>
    ///
    /// <para><b>BLINDED LEGS.</b> The six claim gates and the three behaviours are one leg EACH
    /// (5th trap: <c>Assert</c> throws, so only a multi-leg test's first leg reports). A test that
    /// asked all six in one body would report gate 1 for ever and never gate 6.</para>
    /// </summary>
    [TestFixture]
    public class MentalBreakTests
    {
        // A hall wide enough to walk in, one deck, no atmosphere system — so mood is whatever the
        // test writes and nothing else moves it.
        private static readonly string[] HallMap =
        {
            "####################",
            "#..................#",
            "#..................#",
            "#..................#",
            "####################",
        };

        private static readonly Int3 PawnStart = new Int3(2, 2, 0);
        private static readonly Int3 CargoStart = new Int3(4, 2, 0);
        private static readonly Int3 Stockpile = new Int3(17, 1, 0);

        /// <summary>The break ladder alone: no <c>NeedsSystem</c>, so a mood written by a test is
        /// not overwritten a tick later, and the ladder is driven on the number the test chose.</summary>
        private static Simulation LadderOnly(SimDefs defs = null) =>
            new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new MentalBreakSystem(),
            }, defs);

        /// <summary>The ladder plus the work stack — for the behaviour legs, which need a dispatcher
        /// and a push recruiter to refuse her.</summary>
        private static Simulation WithWork(SimDefs defs = null) =>
            new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new CitizenSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                new MentalBreakSystem(),
            }, defs);

        private static Citizen Pawn(Simulation sim, string name = "Rell") =>
            sim.AddCitizen(name, PawnStart).GiveAllWork();

        /// <summary>Hold her mood at <paramref name="mood"/> for <paramref name="ticks"/> ticks. The
        /// write is re-applied every tick because nothing in this stack recomputes mood — which is
        /// the point: the ladder is driven on a KNOWN input.</summary>
        private static void Hold(Simulation sim, Citizen c, float mood, long ticks)
        {
            for (long t = 0; t < ticks; t++) { c.Mood = mood; sim.Tick(); }
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 1. THE DERIVATION — one tunable, three tiers, ABSOLUTE numbers
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ THE LADDER'S SHIPPED NUMBERS, WRITTEN OUT. On shipped defs the deprivation floor is
        /// <c>20 − 40 − 30 − 25 = −75</c> and the span is 95; at the default 43 % the headroom is
        /// 40.85, so minor is <b>−34.15</b>, major <b>4/7</b> of the headroom above the floor
        /// (<b>−51.66</b>) and extreme <b>1/7</b> (<b>−69.16</b>).
        /// ⛔ ABSOLUTE, deliberately (7th trap): a ratio-only assertion survives the span being
        /// re-anchored, which is the single change most likely to make this ladder vacuous.
        /// </summary>
        [Test]
        public void TheThreeTiers_AreDerivedFromOneTunable_AtAbsoluteValues()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            Assert.That(c.BreakThresholdPct, Is.EqualTo(MentalBreak.DefaultThresholdPct),
                "a fresh crew member boots at the measured default");

            Assert.That(MentalBreak.DeprivationFloor(sim.Defs), Is.EqualTo(-75f).Within(0.001f),
                "the floor is MoodBase minus the three SLOW need weights — suffocation is excluded");
            Assert.That(MentalBreak.MoodSpan(sim.Defs), Is.EqualTo(95f).Within(0.001f));

            Assert.That(MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor),
                Is.EqualTo(-34.15f).Within(0.01f), "minor");
            Assert.That(MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Major),
                Is.EqualTo(-51.657f).Within(0.01f), "major = 4/7 of the headroom above the floor");
            Assert.That(MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Extreme),
                Is.EqualTo(-69.164f).Within(0.01f), "extreme = 1/7 of the headroom above the floor");
        }

        /// <summary>
        /// ⛔ THE DERIVATION IS APPLIED TO THE HEADROOM, NOT TO THE MOOD — and this leg is what
        /// catches the arithmetic that reads naturally and inverts the ladder. 4/7 of a mood VALUE
        /// of −34.15 is −19.5, which is ABOVE minor; the ordering below is the property that
        /// mistake breaks.
        /// </summary>
        [Test]
        public void TheTiersAreOrdered_DeeperIsLower_AtEveryLegalTunable()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            for (byte pct = MentalBreak.ThresholdPctMin; pct <= MentalBreak.ThresholdPctMax; pct++)
            {
                c.BreakThresholdPct = pct;
                float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
                float major = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Major);
                float extreme = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Extreme);
                Assert.That(major, Is.LessThan(minor), "pct " + pct + ": major must be deeper than minor");
                Assert.That(extreme, Is.LessThan(major), "pct " + pct + ": extreme must be deeper than major");
            }
        }

        /// <summary>
        /// RW§4.2's clamp, verbatim: <i>"the minor threshold is clamped to 1 %–50 %"</i>. Driven from
        /// BOTH sides — a byte below the floor and a byte above the ceiling — because a clamp tested
        /// on one side is half a clamp.
        /// </summary>
        [Test]
        public void TheTunable_IsClampedToRimworldsOnePercentToFiftyBand()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);

            c.BreakThresholdPct = 0;                     // below the floor — a save reader can hand us one
            Assert.That(MentalBreak.EffectiveThresholdPct(c, 0), Is.EqualTo(MentalBreak.ThresholdPctMin));
            c.BreakThresholdPct = 250;                   // above the ceiling
            Assert.That(MentalBreak.EffectiveThresholdPct(c, 0), Is.EqualTo(MentalBreak.ThresholdPctMax));

            // …and the clamp is applied AFTER the reprieve, exactly as RimWorld clamps after summing
            // trait offsets. An unclamped intermediate is how an offset stack escapes its own band.
            c.BreakThresholdPct = 5;
            c.BreakReprieveUntilTick = 100;
            Assert.That(MentalBreak.EffectiveThresholdPct(c, 0), Is.EqualTo(MentalBreak.ThresholdPctMin),
                "5 − 18 is negative; the clamp catches it");
        }

        /// <summary>
        /// ⭐ TWO PEOPLE AT THE SAME MOOD ARE NOT AT THE SAME TIER — the per-person tunable's whole
        /// justification (§13.5's mitigation, which DESIGN QUESTION (g) option (i) would have had to
        /// withdraw). Driven: one mood, two bytes, two different answers.
        /// </summary>
        [Test]
        public void TwoPeopleAtTheSameMood_AreNotAtTheSameTier()
        {
            var sim = LadderOnly();
            var fragile = Pawn(sim, "Fragile");
            var stoic = Pawn(sim, "Stoic");
            fragile.BreakThresholdPct = 50;
            stoic.BreakThresholdPct = 10;

            const float mood = -34f;
            Assert.That(mood, Is.LessThanOrEqualTo(MentalBreak.ThresholdFor(fragile, sim.Defs, 0, BreakTier.Minor)),
                "the fragile one is below her minor threshold at this mood");
            Assert.That(mood, Is.GreaterThan(MentalBreak.ThresholdFor(stoic, sim.Defs, 0, BreakTier.Minor)),
                "the stoic one is not");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 2. THE DWELL — a hard time, and the leaky integrator that survives the sawtooth
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ THE HEADLINE: a mood below the minor threshold does NOT break her — a mood below the
        /// minor threshold FOR SIX SIM-HOURS does. Both arms are absolute tick counts.
        /// </summary>
        [Test]
        public void TheMinorBreak_NeedsTheWholeDwell_AndFiresExactlyWhenItIsServed()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);

            Hold(sim, c, minor - 0.1f, MentalBreak.DwellTicksMinor - 1);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None),
                "one tick short of the dwell she is still whole — " + MentalBreak.DwellTicksMinor
                + " ticks is 6 sim-hours and it is a HARD time, not a mean one");

            Hold(sim, c, minor - 0.1f, 1);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Minor), "and on the dwell's own tick she breaks");
        }

        /// <summary>
        /// ⛔⛔ <b>DESIGN QUESTION (h), DRIVEN — AND THIS LEG IS THE ONE THAT WOULD HAVE CAUGHT THE
        /// FIRST DRAFT'S HARD RESET.</b> The measured sawtooth (MECHANICS §13.4, this package's own
        /// measurement) is 14.40–27.24 mood points on a median period of 369 710 ticks, so near the
        /// threshold every meal carries her back ABOVE it and the below-window between resets is
        /// 2.8–6.3 sim-hours — SHORTER than the 6-hour dwell. A hard reset therefore never
        /// accumulates in the borderline band and the break NEVER FIRES.
        ///
        /// <para>Driven here as a square wave with a 50 % duty cycle and a period shorter than the
        /// dwell: with a leaky integrator she breaks; the leg asserts she does. ⭐ The control is the
        /// arithmetic itself — total time below is far more than the dwell, so a suite that only
        /// counted below-ticks could not tell the two rules apart, and what this leg pins is that
        /// the counter SURVIVED the crossings.</para>
        /// </summary>
        [Test]
        public void TheCounterLeaks_ItDoesNotReset_SoASawtoothStillReachesTheDwell()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            const long half = 36_000;   // one sim-hour below, one above — a 2-hour period

            long ticks = 0;
            bool below = true;
            while (c.BreakTier == BreakTier.None && ticks < 40 * half)
            {
                Hold(sim, c, below ? minor - 1f : minor + 10f, half);
                ticks += half;
                below = !below;
            }

            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Minor),
                "a 50 % duty cycle whose period (2 h) is far shorter than the dwell (6 h) still "
                + "reaches it — a HARD RESET would have zeroed the counter at every crossing and "
                + "this loop would have run out");
            // …and it took LONGER than the continuous case, which is the leak doing its job rather
            // than the counter simply ignoring the excursions.
            Assert.That(ticks, Is.GreaterThan(MentalBreak.DwellTicksMinor),
                "the leak is real: an interrupted descent costs more wall-clock than an unbroken one");
        }

        /// <summary>
        /// The other half of (h): a crew member who is above the threshold long enough LOSES the
        /// dwell she had banked. Without this the counter would be a ratchet and one bad afternoon
        /// would eventually break everybody.
        /// </summary>
        [Test]
        public void TheCounterDrainsToZero_WhenSheRecovers()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);

            Hold(sim, c, minor - 1f, 10_000);
            uint banked = c.BreakDwell;
            Assert.That(banked, Is.EqualTo(10_000 * MentalBreak.DwellRisePerTick),
                "four units per tick below — the rise half of the 4 : 1 ratio");

            Hold(sim, c, minor + 10f, (long)banked / MentalBreak.DwellLeakPerTick);
            Assert.That(c.BreakDwell, Is.EqualTo(0u),
                "one unit per tick above — so recovery costs four times as long as the descent, "
                + "which is what makes the integrator LEAKY rather than a reset");
        }

        /// <summary>
        /// ⭐ THE SLEEP PAUSE — RW§4.2's frozen bar, honestly translated. RimWorld freezes the mood
        /// BAR while a pawn sleeps; Perilune has no bar, and what the freeze actually buys is that a
        /// sleeping pawn's break risk does not accumulate. ⭐ This closes <c>TARGET.md:93</c>'s third
        /// T12 remainder (<i>"no mood freeze while asleep"</i>).
        /// ⚠️ PAIRED WITH A NON-SLEEPING CONTROL in one body on purpose — the claim is a DIFFERENCE,
        /// and a single arm cannot state one.
        /// </summary>
        [Test]
        public void TheDwellPauses_WhileSheIsAsleep_AndTheControlSaysItIsTheSleepThatDidIt()
        {
            var sim = LadderOnly();
            var sleeper = Pawn(sim, "Asleep");
            var awake = Pawn(sim, "Awake");
            sleeper.JobKind = JobKind.Sleep;
            float minor = MentalBreak.ThresholdFor(awake, sim.Defs, 0, BreakTier.Minor);

            for (int t = 0; t < 20_000; t++)
            {
                sleeper.Mood = minor - 5f;
                awake.Mood = minor - 5f;
                sim.Tick();
            }

            Assert.That(sleeper.BreakDwell, Is.EqualTo(0u), "a sleeping crew member accrues no break risk");
            Assert.That(awake.BreakDwell, Is.EqualTo(20_000 * MentalBreak.DwellRisePerTick),
                "control: at the SAME mood an awake crew member accrues the whole time");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 3. THE TIER SELECTION — deepest first, no roll anywhere
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// A mood deep enough for EXTREME fires extreme, and it fires after extreme's own (much
        /// shorter) dwell rather than after minor's. Absolute counts.
        /// </summary>
        [Test]
        public void AMoodDeepEnoughForExtreme_FiresExtreme_OnExtremesOwnDwell()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float extreme = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Extreme);

            Hold(sim, c, extreme - 1f, MentalBreak.DwellTicksExtreme - 1);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None));
            Hold(sim, c, extreme - 1f, 1);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Extreme));
        }

        /// <summary>A mood between major and minor cannot fire major however long she sits there —
        /// the tier is chosen by WHERE SHE IS, and the dwell only says WHETHER.</summary>
        [Test]
        public void AMoodBetweenTheTiers_CannotFireTheDeeperOne_HoweverLongSheSitsThere()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            float major = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Major);
            float between = (minor + major) / 2f;

            Hold(sim, c, between, MentalBreak.DwellTicksMinor + 1);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Minor),
                "she is below minor and above major, so minor is the only rung she can reach");
        }

        /// <summary>
        /// ⛔ NO DIE ANYWHERE. Two sims, identical inputs, identical outputs — and, more usefully,
        /// the break fires on the SAME TICK both times. A weighted roster or a per-tick probability
        /// would still be replay-deterministic through a forked <c>SimRng</c> and would still fail
        /// this leg's second half if the RNG were advanced differently, so the leg also asserts the
        /// RNG state never moved: the ladder does not draw at all.
        /// </summary>
        [Test]
        public void TheLadderDrawsNoRandomness_AtAll()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            var before = sim.Rng.State;
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            Hold(sim, c, minor - 1f, MentalBreak.DwellTicksMinor);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Minor), "precondition: something happened");
            Assert.That(sim.Rng.State, Is.EqualTo(before),
                "the ladder is a threshold over hashed state; SocialSystem.cs:150's _roll.NextFloat() "
                + "is the shape TARGET.md:63-65 forbids and this package does not copy");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 4. EXPIRY AND CATHARSIS
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// RW§4.2: <i>"the break ends by expiry"</i>. And on the way out she gets the reprieve —
        /// RimWorld's catharsis, moved to §4.2's OTHER axis because Perilune's mood has no slot for a
        /// timed offset.
        /// </summary>
        [Test]
        public void ABreakExpires_AndCatharsisMakesHerHarderToBreakForTwoAndAHalfDays()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            Hold(sim, c, minor - 1f, MentalBreak.DwellTicksMinor);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.Minor));
            // ⚠️ READ THE END TICK OFF THE STATE, never re-derived from `sim.TickCount` here: the
            // ladder runs INSIDE the tick, so the tick it fired on is one behind the counter the
            // loop has already advanced. An assertion built on the loop's clock is off by one and
            // says nothing about the rule.
            long endsAt = c.BreakEndsAtTick;
            Assert.That(endsAt - sim.TickCount, Is.EqualTo(MentalBreak.BreakTicksMinor - 1),
                "a MINOR break runs 2 sim-hours from the tick it fired on");

            // Ride it out at a mood that is FINE, so nothing re-arms while the break runs.
            Hold(sim, c, 0f, MentalBreak.BreakTicksMinor);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None), "it expired on its own clock");
            Assert.That(c.BreakDwell, Is.EqualTo(0u), "the dwell she served is SPENT, not carried forward");
            Assert.That(c.BreakReprieveUntilTick, Is.EqualTo(endsAt + MentalBreak.ReprieveTicks),
                "and catharsis starts where the break stopped, for 2.5 sim-days");

            // …and the reprieve is not decoration: the threshold has actually moved.
            float reprieved = MentalBreak.ThresholdFor(c, sim.Defs, sim.TickCount, BreakTier.Minor);
            Assert.That(reprieved, Is.LessThan(minor),
                "18 points of threshold — Iron-willed's own offset (RW§4.2:1026) — for 2.5 sim-days");
            Assert.That(MentalBreak.EffectiveThresholdPct(c, sim.TickCount),
                Is.EqualTo(MentalBreak.DefaultThresholdPct - MentalBreak.ReprievePctDrop));
            Assert.That(MentalBreak.EffectiveThresholdPct(c, c.BreakReprieveUntilTick),
                Is.EqualTo((int)MentalBreak.DefaultThresholdPct), "and it ends when it says it does");
        }

        /// <summary>
        /// ⭐ THE ANTI-DEATH-SPIRAL DEVICE, DRIVEN. Straight after a break, at the mood that caused
        /// it, she does NOT immediately break again — which is what RimWorld buys with catharsis and
        /// what DESIGN QUESTION (c) option 3 ("no catharsis at all") was refused for.
        /// </summary>
        [Test]
        public void StraightAfterABreak_TheSameMoodDoesNotBreakHerAgain()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            Hold(sim, c, minor - 1f, MentalBreak.DwellTicksMinor);
            Hold(sim, c, 0f, MentalBreak.BreakTicksMinor);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None), "precondition: the first break is over");

            Hold(sim, c, minor - 1f, MentalBreak.DwellTicksMinor * 2);
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None),
                "the reprieve holds: at the very mood that broke her, twice the dwell is not enough");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 5. THE THREE BEHAVIOURS — one leg per verb, blinded (5th trap)
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>MINOR — she still works. The leg that keeps the graduation from collapsing into
        /// "a break stops everything".</summary>
        [Test]
        public void Minor_SheStillWorks()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            c.BreakTier = BreakTier.Minor;
            Assert.That(c.BreakRefusesWork, Is.False);
            Assert.That(c.BreakRefusesOrders, Is.False);
        }

        /// <summary>⭐ MINOR — THE ORDER NO LONGER WAIVES THE AIR. M3-14's rung 2, run backwards, at
        /// the ONE place the flag is computed.</summary>
        [Test]
        public void Minor_HerOrderStopsWaivingTheAir()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            c.JobKind = JobKind.Maintain;
            c.HeldByOrder = true;
            Assert.That(c.OrderOverridesSafety, Is.True, "control: an unbroken held worker still waives it");

            c.BreakTier = BreakTier.Minor;
            Assert.That(c.OrderOverridesSafety, Is.False,
                "and a minor break withdraws the waiver — the order survives, the frontier does not");
        }

        /// <summary>MAJOR — she stops working, and the predicate says so.</summary>
        [Test]
        public void Major_SheRefusesWork_ButNotOrdersToWalk()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            c.BreakTier = BreakTier.Major;
            Assert.That(c.BreakRefusesWork, Is.True);
            Assert.That(c.BreakRefusesOrders, Is.False, "OD-S item 3 = A: an order to WALK still lands");
        }

        /// <summary>EXTREME — she refuses work AND orders.</summary>
        [Test]
        public void Extreme_SheRefusesWorkAndOrders()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            c.BreakTier = BreakTier.Extreme;
            Assert.That(c.BreakRefusesWork, Is.True);
            Assert.That(c.BreakRefusesOrders, Is.True);
        }

        /// <summary>
        /// ⭐⭐ THE MAJOR BREAK ACTUALLY STOPS THE DISPATCHER — driven end-to-end against a real job
        /// board, not asserted about a property. A control run with an unbroken crew member proves
        /// the board had work to give: <b>a search that finds nothing and a search that cannot find
        /// anything look identical otherwise.</b>
        /// </summary>
        [Test]
        public void Major_TheDispatcherStopsGivingHerWork_WithAWorkingControl()
        {
            // control — unbroken, and she takes the haul.
            // ⚠️ THE OBSERVABLE IS "DID SHE EVER TAKE A JOB", NOT "IS SHE ON ONE AT THE END", and
            // the difference is not pedantry: on this fixture the haul is CLAIMED AT TICK 0 and
            // COMPLETE long before the window closes, so an end-state assertion reads `None` for a
            // crew member who worked perfectly — a FALSE RED that would have been "fixed" by
            // weakening the arm below.
            var control = WithWork();
            Haulable(control);
            var whole = Pawn(control);
            bool controlWorked = false;
            for (int t = 0; t < 3000; t++) { control.Tick(); if (whole.JobKind != JobKind.None) controlWorked = true; }
            Assert.That(controlWorked, Is.True,
                "control: the board really had work — otherwise the arm below proves nothing");

            var sim = WithWork();
            Haulable(sim);
            var c = Pawn(sim);
            c.BreakTier = BreakTier.Major;
            c.BreakEndsAtTick = long.MaxValue;   // hold the break open for the window
            bool brokenWorked = false;
            for (int t = 0; t < 3000; t++) { sim.Tick(); if (c.JobKind != JobKind.None) brokenWorked = true; }
            Assert.That(brokenWorked, Is.False,
                "a crew member who has stopped working takes no job from the same board, at any "
                + "point in 3 000 ticks");
        }


        /// <summary>
        /// ⛔⛔ <b>A BREAK STOPS WORK. IT IS NOT A WAY TO STARVE SOMEONE.</b>
        /// <c>SustenanceSystem</c> and <c>RestSystem</c> both gate on
        /// <see cref="Citizen.IsIdleForWork"/> and neither asks
        /// <see cref="Citizen.BreakRefusesWork"/>, so a crew member in a MAJOR break still eats,
        /// still drinks and still sleeps. That is
        /// <see cref="Citizen.IsRecruitableForWork"/>'s own standing ruling — <i>"a move order
        /// suppresses WORK, never SURVIVAL … an order the player gave must not be a way to starve
        /// someone"</i> — applied unchanged to a break.
        ///
        /// <para>⛔⛔ <b>AND A CLAIM THAT STOOD HERE IS WITHDRAWN, BECAUSE THE MUTATION THAT WOULD
        /// HAVE PROVED IT DOES NOT GO RED.</b> It read: <i>"the pre-emption gate was written as a
        /// bare <c>if (BreakRefusesWork) continue;</c> … a broken crew member's Eat, Drink and Sleep
        /// jobs would have frozen where they stood … and this is the leg that says so."</i>
        /// Independent review reinstated that exact form and this leg stayed <b>GREEN</b>. The reason
        /// is structural: the dispatcher's citizen loop resolves an OWNER for the job kind BELOW the
        /// pre-emption call, and Eat / Drink / Sleep have <b>no <c>IJobSource</c> at all</b> — they
        /// fall out at <c>owner == null</c> — so the bare <c>continue</c> skips nothing, on this
        /// fixture or on any state the sim can author. <b>The defect is not reachable and this leg
        /// never pinned it.</b>
        /// <br/>⭐ <b>WHAT SURVIVES IS A CORRECTNESS ARGUMENT, LABELLED AS ONE.</b> The guarded form
        /// (<c>!BreakRefusesWork &amp;&amp; TryPreempt(...)</c>) says the thing that is actually true
        /// — <i>refuse the pre-emption, run the rest</i> — and stays correct the day a needs kind
        /// gains a source or a broken pawn can hold a dispatcher-driven job. The bare form is
        /// measured INERT today; it is not measured SAFE. The house rule is absolute: a named
        /// mutation goes red or the claim goes, and this claim went.
        /// <br/><b>WHAT THIS LEG DOES PIN — real, and the point all along:</b> needs are not gated on
        /// the break. Deleting a break check from the two need systems is not what it watches for;
        /// <b>ADDING</b> one is. A break that stopped her eating is the failure it stands against,
        /// and `Citizen.BreakRefusesWork`'s own header calls that out as
        /// <see cref="Citizen.IsRecruitableForWork"/>'s standing ruling applied unchanged.</para>
        /// </summary>
        [Test]
        public void ABrokenCrewMemberStillEatsDrinksAndSleeps()
        {
            var sim = FullNeeds();
            var c = Pawn(sim);
            Food(sim);
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, PawnStart));

            c.BreakTier = BreakTier.Major;
            c.BreakEndsAtTick = long.MaxValue;    // held open for the whole window
            c.Hunger = 0.9f; c.Thirst = 0.9f; c.Fatigue = 0.9f;

            bool ate = false, drank = false, slept = false;
            for (long t = 0; t < 900_000; t++)
            {
                sim.Tick();
                c.BreakTier = BreakTier.Major;    // the break does not expire out from under the claim
                if (c.JobKind == JobKind.Eat) ate = true;
                if (c.JobKind == JobKind.Drink) drank = true;
                if (c.JobKind == JobKind.Sleep) slept = true;
            }

            Assert.That(ate, Is.True, "a crew member who has stopped WORKING still eats");
            Assert.That(drank, Is.True, "…and still drinks");
            Assert.That(slept, Is.True, "…and still sleeps");
            Assert.That(c.Hunger, Is.LessThan(0.9f),
                "and the needs really came down — a job she merely HELD without progressing would "
                + "satisfy the three flags above and starve her anyway");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 5b. ⭐⭐ THE WHOLE ARC, DRIVEN ON A LIVE NEEDS STACK — no test writes a mood anywhere
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐⭐ <b>THE PLAYER'S OWN HAND IS THE PATH TO THE FIRST BREAK, AND THIS LEG IS THE PROOF.</b>
        /// Every leg above drives the ladder on a mood a test wrote. This one writes NO mood at all:
        /// it runs the real <c>NeedsSystem</c> + <c>SustenanceSystem</c> + <c>RestSystem</c> stack and
        /// lets the sim compute it.
        ///
        /// <para><b>THE MECHANISM, AND IT IS ALREADY SHIPPED — NOTHING HERE IS NEW BEHAVIOUR.</b>
        /// <c>SustenanceSystem</c> and <c>RestSystem</c> both gate on
        /// <see cref="Citizen.IsIdleForWork"/>, and <see cref="Citizen.HeldByOrder"/> cannot exist
        /// without a job ⇒ <b>a crew member held on a direct order does not eat, does not drink and
        /// does not sleep for as long as the hold lasts.</b> Her three slow needs therefore run to
        /// saturation and her mood falls to the deprivation floor — which is precisely the quantity
        /// <see cref="MentalBreak.DeprivationFloor"/> anchors the ladder to.
        ///
        /// <para>⭐ <b>SO THE TWoM SENTENCE THE PILLAR IS FOR IS A COMPUTED CONSEQUENCE, NOT A
        /// SCRIPTED ONE: you kept her on the job through the night, and she stopped.</b> No dice, no
        /// scripted dilemma, no Director — a state the sim reaches (OD-R clause i's own rule).</para>
        ///
        /// <para>⚠️ <b>THE CONTROL IS THE HALF THAT MATTERS.</b> The same fixture with the hold
        /// released never breaks: she eats, drinks and sleeps and her mood oscillates against the
        /// SERVICED floor. A single arm here would be satisfied by any build whose ladder fires on
        /// everybody.</para>
        /// </summary>
        [Test]
        public void HeldThroughTheNight_SheBreaks_AndTheReleasedControlNeverDoes()
        {
            const long Window = 2_000_000;   // ~55 sim-hours: the descent, then the dwell on top

            (BreakTier tier, float mood, long at) Drive(bool hold)
            {
                var sim = FullNeeds();
                var c = Pawn(sim);
                Food(sim);
                // ⚠️ AIR FIRST, AND THE FIRST DRAFT OF THIS LEG DID NOT DO IT: without a pressurised
                // room `NeedsSystem` reads the hall as hard vacuum, `Suffocation` saturates in ~90 s
                // and BOTH arms read an identical dead −39.42. Two arms agreeing to the digit is what
                // gave it away — a control that matches its subject exactly is measuring neither.
                sim.Rooms.RecomputeIfDirty(sim);
                RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, PawnStart));
                // A job she is holding. The KIND is irrelevant — what matters is that a hold implies
                // a job, and that both need systems gate on being jobless.
                c.JobKind = JobKind.Craft;
                c.HeldByOrder = hold;
                if (!hold) c.JobKind = JobKind.None;
                long at = -1;
                for (long t = 0; t < Window; t++)
                {
                    sim.Tick();
                    // The hold is re-asserted because a completing job would release it; the player's
                    // "stay on that" is the thing being modelled, not one job's length.
                    if (hold && c.JobKind != JobKind.Craft) { c.JobKind = JobKind.Craft; c.HeldByOrder = true; }
                    if (at < 0 && c.BreakTier != BreakTier.None) at = t;
                }
                return (c.BreakTier, c.Mood, at);
            }

            var held = Drive(hold: true);
            var free = Drive(hold: false);
            string M(float v) => v.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);

            // ── THE CONTROL: a ship that is still serving her does NOT break her ──────────────
            // MEASURED on this fixture: hunger 0.44 / thirst 0.50 / fatigue 0.75, mood -31.07,
            // dwell counter ZERO. That is the SERVICED FLOOR the envelope measurement derived twice
            // (MECHANICS §13.4: `20 - 0.5*40 - 0.5*30 - 0.75*25 = -33.75`), and it sits ABOVE the
            // -34.15 minor threshold on purpose.
            Assert.That(free.tier, Is.EqualTo(BreakTier.None),
                "CONTROL: a crew member the ship is still feeding, watering and bedding does NOT break "
                + "(her mood was " + M(free.mood) + " against a minor threshold of -34.15). If this arm "
                + "breaks, the threshold is SATURATED and the ladder is D-3 in a new coat.");
            Assert.That(free.mood, Is.GreaterThan(-34.15f),
                "and the control's mood really is on the safe side of the line — the arm above must "
                + "not pass because she happened to be mid-sawtooth");

            // ── THE SUBJECT: held through the night, she runs out of everything and stops ─────
            Assert.That(held.tier, Is.EqualTo(BreakTier.Extreme),
                "a crew member held on an order eats, drinks and sleeps NOTHING (both need systems "
                + "gate on IsIdleForWork), so all three slow needs saturate and her mood reaches the "
                + "DEPRIVATION FLOOR — which is the deepest rung. Measured: " + M(held.mood));
            Assert.That(held.mood, Is.EqualTo(-75f).Within(0.01f),
                "and it is the floor exactly: 20 - 40 - 30 - 25, the same number "
                + "MentalBreak.DeprivationFloor derives from the defs");
            Assert.That(held.at, Is.GreaterThan(600_000L).And.LessThan(900_000L),
                "and it takes about 20 sim-hours of being held — long enough that it is a CONSEQUENCE "
                + "of a player's standing order and not an event that ambushes them. Measured: tick "
                + held.at.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ 5c. THE SIX CLAIM GATES — ONE BLINDED LEG EACH, ON `WorkTypeVetoTests`' OWN PATTERN
        // ═══════════════════════════════════════════════════════════════════════════════════════
        //
        // ⛔⛔ WHAT STOOD HERE WAS A SINGLE ASSERT ON THE PREDICATE — `Assert.That(c.BreakRefusesWork,
        // Is.True)` — WITH A HEADER CLAIMING "one leg each" AND A CITATION IN `JobSystem.cs` SAYING
        // IT "drives each ALONE". IT EXERCISED NO GATE AT ALL. Independent review ran the battery
        // (each gate reverted to its pre-M4-9 form) and found FOUR of the six GREEN: pre-emption,
        // the crafting recruiter, the LLM grant and the LLM offer. That is the 4th trap exactly — a
        // guard whose scope excludes the violation — wearing a doc comment that says otherwise.
        //
        // ⭐ THE FIX IS THE REPO'S OWN PRECEDENT ONE FILE AWAY. `WorkTypeVetoTests` pins M2-2's veto
        // — the gate a break sits BESIDE at every one of these sites — with one BLINDED leg per gate
        // and a recorded mutation table. These legs are written against that pattern deliberately:
        // same fixtures, same non-vacuity discipline (every refusal half is paired with a control
        // that PROVES the world had work to give), same blinding (no leg can be reddened by another
        // gate's deletion, and no leg's deletion can be masked by another gate's presence).
        //
        // ⚠️ AND THE BREAK IS SET DIRECTLY (`BreakTier = Major`) RATHER THAN GROWN THROUGH THE
        // LADDER, ON PURPOSE. These legs are about the GATES, not about the trigger; driving 6
        // sim-hours of dwell into each of them would make every one of them a test of
        // `MentalBreakSystem` as well, so a ladder regression would redden nine legs and tell you
        // nothing about which. The trigger's own legs are section 2 and section 5b.

        /// <summary>⭐ <b>BREAK GATE 1 — THE DISPATCHER.</b> See
        /// <see cref="Major_TheDispatcherStopsGivingHerWork_WithAWorkingControl"/>, which is this
        /// gate's blinded leg: a live haul board, one arm broken and one not, and the observable is
        /// whether she ever took a job at all. Named here so the six-gate census reads as six.</summary>
        [Test]
        public void BreakGate1_IsCoveredByTheDispatcherLeg()
        {
            // A pointer, not a second assertion — but it is a REAL one: if the dispatcher leg is
            // ever renamed or deleted, this fails to compile and the census stops lying.
            var m = typeof(MentalBreakTests).GetMethod(
                nameof(Major_TheDispatcherStopsGivingHerWork_WithAWorkingControl));
            Assert.That(m, Is.Not.Null, "gate 1's leg must exist under that name");
        }

        /// <summary>
        /// ⭐ <b>BREAK GATE 2 — <c>JobSystem.TryPreempt</c>.</b> Pre-emption is a claim in the OTHER
        /// direction: it TAKES a pawn off one job and puts her on a better-banded one. A broken crew
        /// member must not be moved that way either.
        ///
        /// <para>⚠️ <b>BLINDED OF GATE 1.</b> She starts the window ALREADY HOLDING a job, so the
        /// dispatcher's claim gate is never entered for her (<c>JobKind != None</c> takes the other
        /// branch), and deleting gate 1 cannot redden this leg. The observable is whether the job
        /// she holds is SWAPPED — pre-emption's own signature — not whether she has one.</para>
        ///
        /// <para><b>THE CONTROL IS THE LOAD-BEARING HALF.</b> The identical fixture with the break
        /// removed IS pre-empted, so a "she kept her job" assertion cannot pass on a fixture where
        /// pre-emption was never going to fire.</para>
        /// </summary>
        [Test]
        public void BreakGate2_Preemption_ABrokenCrewMemberIsNotTakenOffTheJobSheHolds()
        {
            // ⚠️ THE OBSERVABLE IS THE JOB BEING **TAKEN AWAY**, NOT A NEW ONE ARRIVING, and the
            // difference is what the first draft of this leg got wrong. `TryPreempt` ends at
            // `sim.CancelJob(citizen)` — it FREES her and nothing more; the repair she is freed FOR
            // is then claimed by a recruiter on a later tick, through GATE 4. So a leg that watched
            // for `JobKind.Maintain` was measuring gate 4, and review's battery proved it: reverting
            // gate 4 reddened it and reverting gate 2 did not.
            bool StillHauling(bool broken)
            {
                var sim = PreemptBench(out var pawn, out var machine);
                // 60 ticks: she claims the haul at tick 0 and is carrying it by tick 10; the
                // delivery lands at tick 160 (traced). The window has to sit INSIDE that — a
                // precondition read after the haul finished is a false red, and a 200-tick first
                // draft of this leg produced exactly one.
                for (int t = 0; t < 60; t++) sim.Tick();           // she takes the low-banded haul
                Assert.That(IsHaul(pawn.JobKind), Is.True,
                    "precondition: she is ON the bottom-banded haul before the better work appears");

                if (broken) { pawn.BreakTier = BreakTier.Major; pawn.BreakEndsAtTick = long.MaxValue; }
                machine.Condition = 0.30f;                          // …and NOW the repair appears
                sim.JobsDirty = JobBoardDirty.All;
                // 40 more: pre-emption is evaluated every tick, so a fired swap shows immediately,
                // and the haul still has ~100 ticks of delivery left — so "not hauling" at the end
                // can only be the pre-emption and never the job completing under the measurement.
                for (int t = 0; t < 40; t++)
                {
                    sim.Tick();
                    if (broken) pawn.BreakTier = BreakTier.Major;
                }
                return IsHaul(pawn.JobKind);
            }

            Assert.That(StillHauling(broken: false), Is.False,
                "CONTROL: an unbroken hauler IS pre-empted when band-1 repair work appears — she is "
                + "taken OFF the haul. Without this arm the assertion below passes on a fixture "
                + "where pre-emption was never going to fire.");
            Assert.That(StillHauling(broken: true), Is.True,
                "a crew member who has stopped working is not pre-empted either: leaving TryPreempt "
                + "open takes her off the job she holds the moment a repair out-ranks it, and drops "
                + "her cargo on the floor for a swap that can never complete");
        }

        private static bool IsHaul(JobKind k) => k == JobKind.HaulPickup || k == JobKind.HaulDeliver;

        /// <summary>
        /// ⭐ <b>BREAK GATE 3 — <c>CraftingSystem.FindNearestReachableIdle</c>, a PUSH recruiter that
        /// bypasses the dispatcher entirely.</b> A gate in the dispatcher alone leaves this wide
        /// open — M2-2's own finding about the same two recruiters.
        ///
        /// <para>⚠️ <b>BLINDED OF GATES 1 AND 2.</b> The stack is `CitizenSystem + CraftingSystem`
        /// and carries NO <c>JobSystem</c> at all, so neither the dispatcher's claim gate nor
        /// pre-emption exists in this sim; the only thing that can put her on a bench is the
        /// recruiter under test. ⭐ That is what makes the leg attributable, and it is
        /// `WorkTypeVetoTests`' G2 fixture with the grid swapped for a break.</para>
        ///
        /// <para>The observable is the BATCH, not a claim count — `WorkTypeVetoTests` re-specified
        /// its own version of this leg for exactly that reason, after the first draft keyed on a
        /// tick-0 claim that M1-H's reachability probe had already removed.</para>
        /// </summary>
        [Test]
        public void BreakGate3_CraftingRecruiter_ABrokenCrewMemberIsNeverPushedToABench()
        {
            var sim = CraftBench(out var pawn);
            pawn.BreakTier = BreakTier.Major;
            pawn.BreakEndsAtTick = long.MaxValue;
            var seen = KindsSeen(sim, pawn, 30000);
            Assert.That(seen, Does.Not.Contain(JobKind.Craft),
                "a broken crew member must never be PUSH-recruited to a bench — this recruiter never "
                + "passes through the dispatcher, so gate 1 cannot cover it");
            Assert.That(ScrapUnits(sim), Is.Zero,
                "and no batch may complete: output without a worker would mean the bench is running "
                + "itself and the assertion above is about nothing");

            var sim2 = CraftBench(out _);
            Assert.That(KindsSeen(sim2, sim2.Citizens.Items[0], 30000), Does.Contain(JobKind.Craft),
                "CONTROL: the same bench with the same bill DOES recruit an unbroken crew member");
            Assert.That(ScrapUnits(sim2), Is.GreaterThan(0),
                "and the batch completes, so this is a working bench and not a dead one");
        }

        /// <summary>
        /// ⭐ <b>BREAK GATE 4 — <c>MachineWearSystem.FindNearestReachableIdle</c>, the second PUSH
        /// recruiter.</b> ⚠️ Review found the pre-M4-9 revert of this one red only INCIDENTALLY —
        /// through another leg, for another reason — which is a hole with a green light on it. This
        /// is its own leg.
        ///
        /// <para>⚠️ <b>BLINDED OF GATES 1, 2 AND 3.</b> `CitizenSystem + MaintenanceSystem` only: no
        /// dispatcher, no pre-emption, no bench.</para>
        /// </summary>
        [Test]
        public void BreakGate4_WearRecruiter_ABrokenCrewMemberIsNeverPushedToAMachine()
        {
            var sim = MaintenanceBench(out _, out var pawn);
            pawn.BreakTier = BreakTier.Major;
            pawn.BreakEndsAtTick = long.MaxValue;
            Assert.That(KindsSeen(sim, pawn, 600), Does.Not.Contain(JobKind.Maintain),
                "a broken crew member must never be push-recruited for a Maintain service");

            var sim2 = MaintenanceBench(out _, out var pawn2);
            Assert.That(KindsSeen(sim2, pawn2, 600), Does.Contain(JobKind.Maintain),
                "CONTROL: this machine really did want service — with the break removed the same "
                + "pawn is recruited, so the refusal above is the gate and not a quiet machine");
        }

        /// <summary>
        /// ⭐ <b>BREAK GATE 5 — <c>EffectValidator</c>, THE LLM GRANT.</b> The effect pipeline is
        /// BOUNDED BY the sim's own refusals and never overrides them: a crew member who has stopped
        /// working does not start again because a model asked nicely.
        ///
        /// <para>⚠️ <b>BLINDED OF GATE 6.</b> This drives <see cref="EffectValidator.TryApply"/>
        /// directly and never computes a capability manifest — `WorkTypeVetoTests`' G4/G5 pair makes
        /// the same split, and for the same reason: a test that passed with either half present
        /// could not see a half-gated pair.</para>
        /// </summary>
        [Test]
        public void BreakGate5_LlmGrant_ABrokenCrewMemberIsNotGrantedWork()
        {
            var sim = DigTargetSim(out var pawn, out var target);
            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var validator = new EffectValidator();

            pawn.BreakTier = BreakTier.Major;
            pawn.BreakEndsAtTick = long.MaxValue;
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.False, "a broken crew member may not be granted work by an LLM effect");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "and no job may have been written");

            // CONTROL — the SAME effect on the SAME tile with the break cleared IS accepted, so the
            // target really was legal and the break is what refused it.
            pawn.BreakTier = BreakTier.None;
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.True, "CONTROL: this exact target IS an acceptable dig agreement");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Dig), "and the grant really lands");
        }

        /// <summary>
        /// ⭐ <b>BREAK GATE 6 — <c>CapabilityComputer</c>, THE LLM OFFER, and it is the half that
        /// matters.</b> Gating the GRANT alone leaves the dig in the model's tool schema: the crew
        /// member is still OFFERED it, still AGREES IN DIALOGUE, and the sim then silently refuses.
        /// That is the 2026-07-21 defect ("crew no longer promise physical work they cannot do")
        /// re-introduced by whichever package gates only one side.
        ///
        /// <para>⚠️ <b>BLINDED OF GATE 5.</b> Nothing here touches <see cref="EffectValidator"/>.</para>
        /// </summary>
        [Test]
        public void BreakGate6_LlmOffer_ABrokenCrewMemberIsNotEvenOfferedWork()
        {
            var sim = DigTargetSim(out var pawn, out var target);
            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var computer = new CapabilityComputer();
            var manifest = new CapabilityManifest();

            pawn.BreakTier = BreakTier.Major;
            pawn.BreakEndsAtTick = long.MaxValue;
            computer.Compute(sim, minds, facts, pawn.Id, manifest);
            Assert.That(manifest.LegalEffects.HasFlag(EffectKind.AgreeTask), Is.False,
                "AgreeTask must not be OFFERED to a crew member who has stopped working");
            Assert.That(manifest.AssignableDigTargets, Is.Empty,
                "and the target list handed to the model must be EMPTY, not merely unflagged — a "
                + "populated list is a menu the model can still read");

            // CONTROL — the same world, one field different.
            pawn.BreakTier = BreakTier.None;
            computer.Compute(sim, minds, facts, pawn.Id, manifest);
            Assert.That(manifest.LegalEffects.HasFlag(EffectKind.AgreeTask), Is.True,
                "CONTROL: this dig IS offerable, so the absence above is the break and not an empty world");
            Assert.That(manifest.AssignableDigTargets, Does.Contain(target));
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ 5d. THE MINOR TIER, DRIVEN THROUGH THE REAL WORKSITE-SAFETY RULE
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐⭐ <b>THE MINOR BREAK'S WHOLE POINT, DRIVEN: SHE STILL WORKS, AND SHE WILL NOT CROSS THE
        /// PRESSURE FRONTIER FOR YOUR ORDER.</b> All three MINOR-tier sites were pinned by NOTHING
        /// before this leg — reverting `JobContext`'s `forced`, `MachineWearSystem`'s `forced` and
        /// `PrioritiseJobCommand`'s `waivesAir` all left the suite GREEN (review's battery).
        ///
        /// <para><b>THE FIXTURE IS M3-14's, RUN BACKWARDS.</b> A machine that wants service sits in
        /// UNBREATHABLE air. A <see cref="Citizen.HeldByOrder"/> worker waives the air question
        /// (rung 2) and is staged there; a MINOR-broken worker is not, and the job dies through
        /// `MaintenanceSystem`'s ordinary abandon path — which also releases the hold, because
        /// `JobKind.None` is the one mechanism every job-ending site shares.</para>
        ///
        /// <para>⚠️ <b>THE CONTROL IS THE ARM THAT MAKES IT MEAN ANYTHING.</b> The identical fixture
        /// with the break removed KEEPS the job: so "the job ended" is the waiver being withdrawn
        /// and not a walled-in machine, an empty larder or a missing consumable — an order overrides
        /// the AIR, never the GEOMETRY, and this fixture would refuse both arms if the geometry were
        /// what was wrong.</para>
        /// </summary>
        [Test]
        public void Minor_TheOrderNoLongerCrossesTheFrontier_Driven()
        {
            (bool kept, bool held) Run(bool minorBroken)
            {
                var sim = VacuumMaintenanceBench(out var machine, out var pawn);
                // The order: she is ON the job and HELD, exactly as PrioritiseJobCommand leaves her.
                pawn.JobKind = JobKind.Maintain;
                pawn.JobTarget = machine.Pos;
                pawn.HeldByOrder = true;
                if (minorBroken) { pawn.BreakTier = BreakTier.Minor; pawn.BreakEndsAtTick = long.MaxValue; }

                for (int t = 0; t < 400; t++)
                {
                    sim.Tick();
                    if (minorBroken) pawn.BreakTier = BreakTier.Minor;
                }
                return (pawn.JobKind == JobKind.Maintain, pawn.HeldByOrder);
            }

            var control = Run(minorBroken: false);
            Assert.That(control.kept, Is.True,
                "CONTROL: an unbroken HELD worker keeps the ordered job in unbreathable air — M3-14 "
                + "rung 2, the waiver this leg is about. If this arm fails the fixture is refusing "
                + "for the GEOMETRY and the arm below proves nothing.");
            Assert.That(control.held, Is.True, "…and the order is still on her");

            var subject = Run(minorBroken: true);
            Assert.That(subject.kept, Is.False,
                "a MINOR-broken worker does not cross the pressure frontier for an order: the waiver "
                + "is withdrawn, the ordinary air rule applies, and the job dies");
            Assert.That(subject.held, Is.False,
                "and the hold falls with the job — JobKind.None is the one release mechanism all "
                + "twenty job-ending sites share");
        }

        /// <summary>
        /// ⭐ <b>THE MINOR TIER'S SECOND SITE — <c>JobWork.TryPathToAdjacent</c>, THE JOB BOARD'S
        /// STAGING SEAM</b> (dig / build / deconstruct all choose their worker's tile through it).
        ///
        /// <para>⛔ <b>IT IS DRIVEN DIRECTLY, AND THE REASON IS A PRE-EXISTING FACT ABOUT THE TREE
        /// RATHER THAN A SHORTCUT.</b> `JobContext`'s own header says this seam is
        /// <i>"UNREACHABLE FROM THIS SEAM TODAY, DELIBERATELY WIRED ANYWAY, AND SAID OUT LOUD SO
        /// NOBODY TESTS IT INTO EXISTENCE"</i>: the only writer of <see cref="Citizen.HeldByOrder"/>
        /// is `PrioritiseJobCommand`, which issues <see cref="JobKind.Maintain"/>, and
        /// <see cref="Citizen.IsRecruitableForWork"/> excludes a held pawn — so no dig, build or
        /// deconstruct source can ever claim one. ⇒ <b>there is no end-to-end fixture to build, and
        /// building a scenario that reached it would be testing a state the sim cannot author.</b>
        /// The seam is public and static, so it is pinned where it lives.</para>
        ///
        /// <para>⚠️ <b>BLINDED OF THE OTHER TWO MINOR SITES.</b> Nothing here touches
        /// `MachineWearSystem` or `PrioritiseJobCommand`.</para>
        /// </summary>
        [Test]
        public void Minor_TheJobBoardStagingSeam_StopsWaivingTheAirToo()
        {
            var sim = VacuumMaintenanceBench(out var machine, out var pawn);
            pawn.JobKind = JobKind.Dig;          // any non-None kind: the hold cannot exist without one
            pawn.HeldByOrder = true;

            Assert.That(JobWork.TryPathToAdjacent(sim, pawn, machine.Pos), Is.True,
                "CONTROL: a HELD worker is staged beside a worksite in unbreathable air — M3-14 rung "
                + "2, read off this very seam. If this fails the fixture is refusing for the "
                + "GEOMETRY and the assertion below is about nothing.");

            pawn.ClearPath();
            pawn.BreakTier = BreakTier.Minor;
            Assert.That(JobWork.TryPathToAdjacent(sim, pawn, machine.Pos), Is.False,
                "and a MINOR-broken worker is not: the ORDER survives, the waiver does not");
        }

        /// <summary>
        /// ⭐ <b>THE MINOR TIER'S THIRD SITE — <c>PrioritiseJobCommand</c>'s ACCEPTANCE gate.</b> The
        /// order is refused AT THE CLICK when the machine it names stands in air she will no longer
        /// cross into — RimWorld's own answer to an impossible order (§2.2: a refusal at the point of
        /// the click), and the reason the player is not left watching a pawn who took the job and
        /// then did nothing.
        ///
        /// <para>⚠️ <b>THE CONTROL IS A DIFFERENT SHIP-STATE, NOT A DIFFERENT MACHINE</b> — same
        /// command, same device, same tile, one field on the citizen changed.</para>
        /// </summary>
        [Test]
        public void Minor_AnOrderIntoVacuumIsRefusedAtTheClick()
        {
            // ⚠️ ⛔ THE STACK CARRIES **NO** `MaintenanceSystem`, AND THAT IS THE BLINDING — the first
            // draft of this leg used the full bench and was GREEN with the waiver forced open,
            // because `DriveWorkers` (MINOR-b's site) abandoned the job inside the SAME tick the
            // command granted it. The leg was measuring the other site. With nothing able to take
            // the job away afterwards, the only thing that can refuse it is the command's own
            // acceptance gate — which is what this leg is about.
            JobKind Order(bool minorBroken)
            {
                var sim = VacuumBenchNoDrivers(out var machine, out var pawn);
                if (minorBroken) { pawn.BreakTier = BreakTier.Minor; pawn.BreakEndsAtTick = long.MaxValue; }
                sim.EnqueueCommand(new PrioritiseJobCommand((int)pawn.Id, (int)machine.Id));
                sim.Tick();
                return pawn.JobKind;
            }

            Assert.That(Order(minorBroken: false), Is.EqualTo(JobKind.Maintain),
                "CONTROL: the order across the frontier LANDS on an unbroken crew member — that is "
                + "M3-14 rung 2 and the whole phase-1 loop");
            Assert.That(Order(minorBroken: true), Is.EqualTo(JobKind.None),
                "and it is REFUSED on a minor-broken one, at the click rather than silently later");
        }

        /// <summary>⭐ THE OTHER HALF OF MINOR, AND IT IS WHAT KEEPS THE TIER DISTINGUISHABLE FROM
        /// MAJOR: a minor-broken crew member is still recruited for ORDINARY, BREATHABLE work. A
        /// minor break that stopped her working would collapse the ladder's first two rungs into
        /// one — which is exactly the shape §10 item 3's option B was priced as.</summary>
        [Test]
        public void Minor_SheIsStillRecruitedForOrdinaryWork()
        {
            var sim = MaintenanceBench(out _, out var pawn);
            pawn.BreakTier = BreakTier.Minor;
            pawn.BreakEndsAtTick = long.MaxValue;
            Assert.That(KindsSeen(sim, pawn, 600), Does.Contain(JobKind.Maintain),
                "MINOR takes the dangerous class away and nothing else — she still services a "
                + "machine standing in air she can breathe");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 6. THE GRADUATED OVERRIDE (OD-S item 3 = A)
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>MINOR — the work order still LANDS. The cell of item 3's table that keeps the
        /// direct-order game intact for the common case.</summary>
        [Test]
        public void GraduatedOverride_AtMinor_TheWorkOrderStillLands()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            var machine = WornMachine(sim);
            c.BreakTier = BreakTier.Minor;
            c.BreakEndsAtTick = long.MaxValue;

            sim.EnqueueCommand(new PrioritiseJobCommand((int)c.Id, (int)machine.Id));
            sim.Tick();
            Assert.That(c.JobKind, Is.EqualTo(JobKind.Maintain), "at MINOR the player's word still works");
            Assert.That(c.HeldByOrder, Is.True);
        }

        /// <summary>MAJOR — the work order is REFUSED.</summary>
        [Test]
        public void GraduatedOverride_AtMajor_TheWorkOrderIsRefused()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            var machine = WornMachine(sim);
            c.BreakTier = BreakTier.Major;
            c.BreakEndsAtTick = long.MaxValue;

            sim.EnqueueCommand(new PrioritiseJobCommand((int)c.Id, (int)machine.Id));
            sim.Tick();
            Assert.That(c.JobKind, Is.EqualTo(JobKind.None), "at MAJOR the order is refused");
            Assert.That(c.HeldByOrder, Is.False);
        }

        /// <summary>EXTREME — even a MOVE order is impossible. The last thing the ladder takes.</summary>
        [Test]
        public void GraduatedOverride_AtExtreme_EvenAMoveOrderIsImpossible()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            var target = new Int3(15, 3, 0);

            // control — at MAJOR the walk still happens, which is what makes EXTREME a step.
            c.BreakTier = BreakTier.Major;
            c.BreakEndsAtTick = long.MaxValue;
            sim.EnqueueCommand(new MoveCitizenCommand(c.Id, target));
            sim.Tick();
            Assert.That(c.OrderedMove, Is.True, "control: at MAJOR she still walks where she is told");

            var sim2 = WithWork();
            var d = Pawn(sim2);
            d.BreakTier = BreakTier.Extreme;
            d.BreakEndsAtTick = long.MaxValue;
            sim2.EnqueueCommand(new MoveCitizenCommand(d.Id, target));
            sim2.Tick();
            Assert.That(d.OrderedMove, Is.False, "at EXTREME the player's last verb is refused too");
            Assert.That(d.Pos, Is.EqualTo(PawnStart));
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 7. THE SHIP SAYS SO — the Chronicle line
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ INVISIBLE FEEDBACK IS FUNCTIONAL (binding, 2026-07-26). A break the player cannot see is
        /// a crew member who mysteriously stopped, so the ship's log carries a line — and the line
        /// names the BEHAVIOUR, not a feeling (<c>TARGET.md:66-69</c> forbids the misery meter and
        /// <c>:65</c> the cosmetic operator; "Rell is very sad" is both).
        /// </summary>
        [Test]
        public void ABreakWritesOneChronicleLine_AndItNamesTheBehaviour()
        {
            var history = new HistorySystem();
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new MentalBreakSystem(),
                history,
            });
            var c = Pawn(sim);
            float minor = MentalBreak.ThresholdFor(c, sim.Defs, 0, BreakTier.Minor);
            Hold(sim, c, minor - 1f, MentalBreak.DwellTicksMinor + 2);

            var lines = new List<HistoryEntry>();
            foreach (var e in history.Entries)
                if (e.Kind == (byte)HistoryKind.MentalBreak) lines.Add(e);

            Assert.That(lines.Count, Is.EqualTo(1), "one break, one line — not one per tick of one");
            Assert.That(lines[0].Text, Does.Contain("Rell"));
            Assert.That(lines[0].Text, Does.Contain("unbreathable air"),
                "the minor line says what she will not do, which is the thing a player can act on");
            Assert.That(lines[0].SubjectA, Is.EqualTo(c.Id),
                "the cid rides the entry, so M4-7's per-person Chronicle filter reaches it");
        }

        /// <summary>
        /// The severity slot, asserted as a PAIRING rather than a number, so a later renumber that
        /// preserves the ordering does not redden this and one that inverts it does. ⛔ A break must
        /// out-rank a brownout (D1's reasoning run backwards: the break is often WHY the repair the
        /// brownout was about never happened) and must NOT out-rank a death.
        /// </summary>
        [Test]
        public void ABreakOutranksABrownout_AndADeathStillOutranksABreak()
        {
            var day = new List<HistoryEntry>
            {
                new HistoryEntry(10, "the power flapped", (byte)HistoryKind.Brownout),
                new HistoryEntry(20, "Rell has stopped working.", (byte)HistoryKind.MentalBreak),
            };
            Assert.That(Chronicle.Render(day)[0].Headline, Does.Contain("stopped working"),
                "the break is the day's story, not the brownout");

            day.Add(new HistoryEntry(30, "somebody died", (byte)HistoryKind.Death));
            Assert.That(Chronicle.Render(day)[0].Headline, Does.Contain("died"),
                "and a death still outranks it — every pairing above tier 6 is owner-ruled");
        }

        /// <summary>
        /// ⛔⛔ <b>THE SCALE, PINNED AS LITERALS — AND THIS IS THE 7th SHAPE IN THE FILE THAT CITES
        /// IT.</b> The header above says "ABSOLUTE, NOT RATIO", and that was true of the THRESHOLDS
        /// and false of the DWELLS: every dwell leg reads <see cref="MentalBreak.DwellTicksMinor"/>
        /// back out of the constant it is testing, so <b>halving it left all 29 legs green</b>
        /// (review's battery). A suite that cannot see a 2× scale error is exactly the trap
        /// `scale-invariant tests cannot see a 2×` names, and only an absolute floor pins scale.
        ///
        /// <para>⚠️ These numbers are a RULE, not a dial (M2-1's rule-not-tunable precedent), so
        /// moving one is a deliberate act and this test is where it is declared. The RATIOS are
        /// RimWorld's 10 : 3 : 0.7 and are asserted beside the absolutes, because a lane retuning
        /// the scale must keep the ordering the analogue supplies.</para>
        /// </summary>
        [Test]
        public void TheDwellAndBreakDurations_ArePinnedAsAbsoluteLiterals()
        {
            Assert.That(MentalBreak.DwellTicksMinor, Is.EqualTo(216_000L), "6 sim-hours");
            Assert.That(MentalBreak.DwellTicksMajor, Is.EqualTo(64_800L), "1.8 sim-hours = 3/10 of minor");
            Assert.That(MentalBreak.DwellTicksExtreme, Is.EqualTo(15_120L), "0.42 sim-hours = 7/100 of minor");

            Assert.That(MentalBreak.BreakTicksMinor, Is.EqualTo(72_000L), "2 sim-hours");
            Assert.That(MentalBreak.BreakTicksMajor, Is.EqualTo(144_000L), "4 sim-hours");
            Assert.That(MentalBreak.BreakTicksExtreme, Is.EqualTo(288_000L), "8 sim-hours");

            Assert.That(MentalBreak.DwellRisePerTick, Is.EqualTo(4u));
            Assert.That(MentalBreak.DwellLeakPerTick, Is.EqualTo(1u));
            Assert.That(MentalBreak.ReprievePctDrop, Is.EqualTo((byte)18), "Iron-willed's own offset");
            Assert.That(MentalBreak.ReprieveTicks, Is.EqualTo(2_160_000L), "2.5 sim-days");
            Assert.That(MentalBreak.DefaultThresholdPct, Is.EqualTo((byte)43), "the MEASURED default");

            // RimWorld's ordering survives the re-scale — the half the absolutes cannot state.
            Assert.That(MentalBreak.DwellTicksExtreme, Is.LessThan(MentalBreak.DwellTicksMajor));
            Assert.That(MentalBreak.DwellTicksMajor, Is.LessThan(MentalBreak.DwellTicksMinor));
            Assert.That(MentalBreak.BreakTicksMinor, Is.LessThan(MentalBreak.BreakTicksMajor));
            Assert.That(MentalBreak.BreakTicksMajor, Is.LessThan(MentalBreak.BreakTicksExtreme));
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 8. THE STATE SURVIVES A SAVE
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ CITZ v10 — all five fields round-trip, with values that are DISTINCT from each other and
        /// from every default, so a reader that transposed two of them or dropped one is red.
        /// ⚠️ Five separate asserts rather than a state-hash compare: a hash equality proves the SET
        /// survived and cannot say WHICH field a transposition moved.
        /// </summary>
        [Test]
        public void AllFiveBreakFields_RoundTripThroughASave()
        {
            var sim = LadderOnly();
            var c = Pawn(sim);
            c.BreakDwell = 123_456;
            c.BreakThresholdPct = 29;
            c.BreakTier = BreakTier.Major;
            c.BreakEndsAtTick = 7_654_321;
            c.BreakReprieveUntilTick = 9_876_543;

            var blob = new System.IO.MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.Read(blob, new ISimSystem[] { new MentalBreakSystem() });

            Assert.That(loaded.Citizens.TryGet(c.Id, out var back), Is.True);
            Assert.That(back.BreakDwell, Is.EqualTo(123_456u));
            Assert.That(back.BreakThresholdPct, Is.EqualTo((byte)29));
            Assert.That(back.BreakTier, Is.EqualTo(BreakTier.Major));
            Assert.That(back.BreakEndsAtTick, Is.EqualTo(7_654_321L));
            Assert.That(back.BreakReprieveUntilTick, Is.EqualTo(9_876_543L));
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "and the fold agrees, which is the other half of the same-commit rule");
        }

        /// <summary>
        /// ⛔⛔ <b>A PRE-v10 SAVE LOADS WITH THE THRESHOLD AT ITS DEFAULT (43), NOT AT ZERO — AND
        /// THIS IS A DECISION, NOT AN OMISSION.</b> Zero is not a legal threshold at all: the clamp's
        /// floor is 1, so a reader that wrote one would hand a citizen a ladder her own class can
        /// never produce. The other four fields DO read as zero, and that is equally deliberate —
        /// nothing could BE broken before this chapter existed, so "not broken, nothing accumulated,
        /// no reprieve owed" is both the constructor default and the historically accurate read.
        /// (`DEVC` v6's case, not `DEVC` v5's, which had to read TRUE.)
        ///
        /// <para>⚠️ <b>BOTH REVIEWER MUTATIONS WERE GREEN BEFORE THIS LEG</b> — neither the default
        /// nor the version boundary was pinned by anything.</para>
        ///
        /// <para><b>ALIGNMENT CONTROLS FIRST</b>, on `WorkPriorityStateTests`' own discipline: a
        /// hand-built legacy stream that is subtly mis-laid would leave every default in place and
        /// pass this test for exactly the wrong reason. The v5/v6/v7 tail fields are seeded
        /// NON-default and must come back exactly, and the reader must consume the whole payload and
        /// nothing more.</para>
        /// </summary>
        [Test]
        public void APreV10Save_LeavesTheThresholdAtItsDefault_AndTheRestNotBroken()
        {
            var payload = new System.IO.MemoryStream();
            using (var w = new System.IO.BinaryWriter(payload, SaveFormat.Utf8, leaveOpen: true))
                WriteOneCitizenV9(w);

            payload.Position = 0;
            var sim = LadderOnly();
            using (var r = new System.IO.BinaryReader(payload, SaveFormat.Utf8, leaveOpen: true))
                SaveReader.ReadCitizens(sim, r, 9);

            var c = sim.Citizens.Items[0];
            Assert.That(c.HoldPosition, Is.True, "CONTROL: the v6 field is misaligned — this fixture "
                + "is not a valid v9 citizen and every default below proves nothing");
            Assert.That(c.OrderedMove, Is.True, "CONTROL: the v7 field is misaligned");
            Assert.That(c.Morale, Is.EqualTo(0.25f), "CONTROL: the v5 field is misaligned");
            Assert.That(c.HeldByOrder, Is.True, "CONTROL: the v9 tail is misaligned");
            Assert.That(payload.Position, Is.EqualTo(payload.Length),
                "CONTROL: the reader did not consume exactly the v9 payload — the layouts disagree");

            // THE CLAIM.
            Assert.That(c.BreakThresholdPct, Is.EqualTo(MentalBreak.DefaultThresholdPct),
                "a pre-v10 citizen keeps the CONSTRUCTOR default (43). Zero is below the clamp floor "
                + "and is not a threshold at all — a reader that wrote one would ship a person whose "
                + "ladder no code path could have produced.");
            Assert.That(c.BreakDwell, Is.EqualTo(0u));
            Assert.That(c.BreakTier, Is.EqualTo(BreakTier.None));
            Assert.That(c.BreakEndsAtTick, Is.EqualTo(0L));
            Assert.That(c.BreakReprieveUntilTick, Is.EqualTo(0L));

            // …and the same citizen written by THIS build round-trips the same byte, so the default
            // is not a value only the legacy path can produce.
            Assert.That(LadderOnly().AddCitizen("fresh", new Int3(2, 2, 0)).BreakThresholdPct,
                Is.EqualTo(MentalBreak.DefaultThresholdPct));
        }

        /// <summary>One CITZ record in the v9 layout, field-for-field against
        /// <c>SaveWriter.WriteCitizens</c>. ⚠️ Non-default values in the v5/v6/v7/v9 tail on purpose —
        /// they are the alignment controls the leg above reads back.</summary>
        private static void WriteOneCitizenV9(System.IO.BinaryWriter w)
        {
            w.Write(1);                    // count
            w.Write(77u);                  // Id
            w.Write("Legacy");             // Name
            WriteInt3(w, new Int3(2, 2, 0));   // Pos
            WriteInt3(w, new Int3(2, 2, 0));   // PrevPos
            w.Write(false);                // AutoWander
            w.Write(0);                    // Path.Count
            w.Write(0);                    // PathIndex
            w.Write(0);                    // MoveCooldown
            w.Write(0);                    // IdleCooldown
            w.Write(0f);                   // Suffocation
            w.Write(0f);                   // Hunger
            w.Write(0f);                   // Fatigue
            w.Write(0f);                   // Mood
            w.Write(false);                // Dead
            w.Write((byte)JobKind.Dig);    // JobKind (non-None: the v9 hold below needs one)
            WriteInt3(w, default(Int3));   // JobTarget
            w.Write(0u);                   // CarryingItemId
            w.Write(0);                    // JobWorkTicks
            w.Write(0f);                   // v2 Thirst
            w.Write(0u);                   // v3 ReservedItemId
            w.Write(true);                 // v4 RevealsFog
            w.Write((byte)0);              // v5 Faction
            w.Write(1f);                   // v5 Health
            w.Write(0.25f);                // v5 Morale        <- ALIGNMENT CONTROL
            w.Write((byte)0);              // v5 Archetype
            w.Write(true);                 // v6 HoldPosition  <- ALIGNMENT CONTROL
            w.Write(true);                 // v7 OrderedMove   <- ALIGNMENT CONTROL
            w.Write((byte)WorkPriority.WorkTypeCount);          // v8 grid width
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++) w.Write(WorkPriority.Off);
            w.Write((byte)0);              // v8 WorkIncapable
            w.Write((byte)WorkPriority.WorkTypeCount);          // v9 skill width
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++) w.Write((byte)0);
            w.Write(true);                 // v9 HeldByOrder   <- ALIGNMENT CONTROL
            // ⛔ and NOTHING after it — that absence IS the v9 payload, and the whole test.
        }

        private static void WriteInt3(System.IO.BinaryWriter w, Int3 p)
        {
            w.Write(p.X); w.Write(p.Y); w.Write(p.Z);
        }

        /// <summary>
        /// ⛔ EACH OF THE FIVE IS FOLDED — one leg, five arms, each moved ALONE off an otherwise
        /// identical sim. A field saved but not hashed is a field a determinism twin cannot see.
        /// </summary>
        [Test]
        public void EachBreakField_MovesTheStateHash_Alone()
        {
            ulong Baseline(Action<Citizen> mutate)
            {
                var sim = LadderOnly();
                var c = Pawn(sim);
                mutate(c);
                return sim.StateHash();
            }

            ulong plain = Baseline(_ => { });
            Assert.That(Baseline(c => c.BreakDwell = 7), Is.Not.EqualTo(plain), "BreakDwell");
            Assert.That(Baseline(c => c.BreakThresholdPct = 7), Is.Not.EqualTo(plain), "BreakThresholdPct");
            Assert.That(Baseline(c => c.BreakTier = BreakTier.Extreme), Is.Not.EqualTo(plain), "BreakTier");
            Assert.That(Baseline(c => c.BreakEndsAtTick = 7), Is.Not.EqualTo(plain), "BreakEndsAtTick");
            Assert.That(Baseline(c => c.BreakReprieveUntilTick = 7), Is.Not.EqualTo(plain), "BreakReprieveUntilTick");
        }

        /// <summary>
        /// ⚠️ THE TIER AND THE THRESHOLD SHARE ONE <c>Combine</c> (packed byte + byte &lt;&lt; 8), so
        /// this leg asks the question that packing makes askable at all: can a value of one alias a
        /// value of the other? Driven across the whole legal domain of both.
        /// </summary>
        [Test]
        public void ThePackedTierAndThresholdCannotAliasEachOther()
        {
            var seen = new Dictionary<ulong, string>();
            for (byte pct = 0; pct <= MentalBreak.ThresholdPctMax; pct++)
                foreach (BreakTier tier in Enum.GetValues(typeof(BreakTier)))
                {
                    var sim = LadderOnly();
                    var c = Pawn(sim);
                    c.BreakThresholdPct = pct;
                    c.BreakTier = tier;
                    ulong h = sim.StateHash();
                    string key = pct + "/" + tier;
                    Assert.That(seen.ContainsKey(h), Is.False,
                        "collision: " + key + " folds identically to " + (seen.TryGetValue(h, out var s) ? s : "?"));
                    seen[h] = key;
                }
        }

        // ---------------------------------------------------------------- fixture helpers

        private static void Haulable(Simulation sim)
        {
            sim.AddItem(ItemKind.Scrap, 1, CargoStart);
            sim.World.SetFlag(Stockpile, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
        }

        /// <summary>The FULL slow-needs stack — the ladder driven on a mood the SIM computes.
        /// ⚠️ `SustenanceSystem` and `RestSystem` are both present on purpose: leaving either out
        /// would let the control starve too, and the control is the load-bearing arm.</summary>
        private static Simulation FullNeeds() =>
            new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new CitizenSystem(),
                new RestSystem(),
                new JobSystem(),
                new SustenanceSystem(),
                new NeedsSystem(),
                new MentalBreakSystem(),
            });

        /// <summary>Food and water within reach, so the control is genuinely SERVED and its
        /// not-breaking is a statement about the ladder rather than about an empty larder.</summary>
        private static void Food(Simulation sim)
        {
            sim.AddItem(ItemKind.Potato, 200, new Int3(3, 2, 0));
            var tank = sim.AddDevice(DeviceKind.WaterTank, new Int3(5, 2, 0), "tank_a");
            tank.StoredLiters = 500f;
            tank.Powered = true;
            sim.JobsDirty = JobBoardDirty.All;
        }

        // ---- the gate fixtures. Deliberately MIRRORS `WorkTypeVetoTests`' shapes rather than
        // inventing new ones: the break sits BESIDE M2-2's veto at every one of these sites, so a
        // reviewer can diff the two files and see that the same world produces the same refusal for
        // a different reason. Each stack carries the ONE system whose gate is under test.

        private static readonly Int3 StationPos = new Int3(14, 2, 0);
        private static readonly Int3 StagingPos = new Int3(15, 2, 0);   // Neighbor4(+x) of the station

        /// <summary>Run <paramref name="ticks"/> ticks; report every distinct <see cref="JobKind"/>
        /// <paramref name="c"/> was seen holding at a tick boundary. `WorkTypeVetoTests`' helper,
        /// verbatim — an END-STATE read cannot see a job that started and finished inside the
        /// window, which is a false red this package has already paid for once.</summary>
        private static HashSet<JobKind> KindsSeen(Simulation sim, Citizen c, int ticks)
        {
            var seen = new HashSet<JobKind> { c.JobKind };
            for (int t = 0; t < ticks; t++) { sim.Tick(); seen.Add(c.JobKind); }
            return seen;
        }

        private static int ScrapUnits(Simulation sim)
        {
            int scrap = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) scrap += it.Count;
            return scrap;
        }

        /// <summary>GATE 3's stack: a live, reachable SalvageRecycler with its whole batch on the
        /// floor. ⛔ NO `JobSystem` — the recruiter under test is the only thing that can put her on
        /// the bench, which is what makes a refusal attributable to it.</summary>
        private static Simulation CraftBench(out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21,
                new ISimSystem[] { new CitizenSystem(), new CraftingSystem() });
            var station = sim.AddDevice(DeviceKind.SalvageRecycler, StationPos, "recycler");
            Assert.That(station.Powered && station.IsOperational(sim.Defs), Is.True,
                "precondition: the bench must be live, or TickStation returns before anything under test");
            pawn = Pawn(sim);
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.SalvageRecycler, out var bill),
                Is.True, "precondition: the SalvageRecycler must still have a bill");
            sim.AddItem(ItemKind.Regolith, bill.Input(0).Count, new Int3(3, 2, 0));
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>GATE 4's stack: a machine below its maintain threshold with a consumable aboard.
        /// ⛔ NO `JobSystem`, for GATE 3's reason.</summary>
        private static Simulation MaintenanceBench(out Device machine, out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21,
                new ISimSystem[] { new CitizenSystem(), new MaintenanceSystem() });
            machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;   // below Scrubber maint (0.40), above wreck_threshold (0.25)
            pawn = Pawn(sim);
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 2, 0));
            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: the machine really wants service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "control: and the WRECK rule is not what would refuse it");
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>GATE 2's stack: a hauler already carrying a LOW-banded job with better-banded
        /// repair work standing beside her — the state pre-emption exists for. ⛔ She starts the
        /// window ON a job, so the dispatcher's CLAIM gate is never entered for her and this fixture
        /// cannot be reddened by gate 1.</summary>
        private static Simulation PreemptBench(out Citizen pawn, out Device machine)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new CitizenSystem(), new JobSystem(), new MachineWearSystem(new DirectorSystem()),
                new MaintenanceSystem(),
            });
            // ⚠️ THE MACHINE BOOTS HEALTHY, AND THAT IS THE WHOLE FIXTURE. The first draft authored
            // it worn, and the pawn went straight to `Maintain` at TICK 0 without ever touching the
            // haul — so there was no job to pre-empt and the leg was green with the gate reverted.
            // Pre-emption is a question about a pawn who is ALREADY BUSY when better work appears,
            // so the better work has to appear SECOND. The leg wears the machine down mid-run.
            machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 1.0f;
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 2, 0));
            Haulable(sim);
            pawn = sim.AddCitizen("Rell", PawnStart);
            // REPAIR at the top band, HAUL at the bottom: the strict partition M2-5 arbitrates on.
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            pawn.SetWorkPriority(WorkType.Haul, WorkPriority.Lowest);
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>GATES 5 and 6's stack: a designated debris tile and one pawn. No dispatcher —
        /// these two are about the effect pipeline, and a dispatcher racing them to the same tile
        /// would make the observable ambiguous (`WorkTypeVetoTests`' own note).</summary>
        private static Simulation DigTargetSim(out Citizen pawn, out Int3 target)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21,
                new ISimSystem[] { new CitizenSystem() });
            target = new Int3(8, 2, 0);
            sim.World.SetWall(target, TileDefs.Debris);
            sim.World.SetFlag(target, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;
            pawn = Pawn(sim);
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "precondition: off-job");
            return sim;
        }

        /// <summary>THE MINOR TIER'S FIXTURE: `MaintenanceBench` with the AIR TAKEN OUT. The room is
        /// left unpressurised, so `WorksiteSafety.CanStageWorkerAt` refuses the staging tile to
        /// anyone who is not waiving the air question. ⚠️ `SafetySystem` is present because the
        /// abandon-then-rescue chain is what actually ends the job on the shipped stack, and a
        /// fixture without it would be measuring a different mechanism.</summary>
        private static Simulation VacuumMaintenanceBench(out Device machine, out Citizen pawn)
        {
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21, new ISimSystem[]
            {
                new CitizenSystem(), new MaintenanceSystem(), new NeedsSystem(), new SafetySystem(),
            });
            machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            pawn = Pawn(sim);
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            // ⛔ NO Pressurize call — that is the whole fixture. Asserted rather than assumed, because
            // a fixture that silently pressurised itself would make both arms of the minor leg pass.
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, StagingPos, forced: false), Is.False,
                "precondition: the worksite is UNBREATHABLE to an unforced stager");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, StagingPos, forced: true), Is.True,
                "precondition: …and an ORDER waives exactly that — otherwise the control arm is "
                + "refused for the geometry and the leg measures nothing");
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>`VacuumMaintenanceBench` with `MaintenanceSystem` REMOVED — the fixture for the
        /// acceptance gate alone. ⛔ Nothing in this stack drives or abandons a Maintain job, so a
        /// job that exists after the command ran was ACCEPTED by the command, full stop.</summary>
        private static Simulation VacuumBenchNoDrivers(out Device machine, out Citizen pawn)
        {
            // ⚠️ `SafetySystem` IS PRESENT AND `MaintenanceSystem` IS NOT, and both halves matter.
            // `WorksiteSafety.CanStageWorkerAt` is INERT on a stack without `SafetySystem` (the rule
            // says so itself — it is what keeps every atmosphere-free fixture byte-identical), so
            // dropping it would make the worksite breathable and the leg would measure nothing.
            // Dropping `MaintenanceSystem` is what stops MINOR-b's site abandoning the job in the
            // same tick and stealing this leg's observable.
            var sim = new Simulation(AsciiWorld.Build(HallMap), 21,
                new ISimSystem[] { new CitizenSystem(), new NeedsSystem(), new SafetySystem() });
            machine = sim.AddDevice(DeviceKind.Scrubber, StationPos, "scrubber");
            machine.Condition = 0.30f;
            pawn = Pawn(sim);
            sim.AddItem(ItemKind.Parts, 4, new Int3(3, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, StagingPos, forced: false), Is.False,
                "precondition: the worksite is UNBREATHABLE to an unforced stager");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, StagingPos, forced: true), Is.True,
                "precondition: …and an ORDER waives exactly that");
            sim.JobsDirty = JobBoardDirty.All;
            return sim;
        }

        /// <summary>A machine worn far enough below its maintain threshold that
        /// <c>PrioritiseJobCommand</c> has a job to give.</summary>
        private static Device WornMachine(Simulation sim)
        {
            var d = sim.AddDevice(DeviceKind.Scrubber, new Int3(10, 2, 0), "scrub_a");
            d.Condition = 0.1f;
            sim.AddItem(ItemKind.Parts, 8, new Int3(9, 2, 0));
            sim.JobsDirty = JobBoardDirty.All;
            return d;
        }
    }
}
