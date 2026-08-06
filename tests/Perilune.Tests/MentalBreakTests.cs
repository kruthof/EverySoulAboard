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
        /// ⭐ THE SIX CLAIM GATES, ONE LEG, ONE ASSERT EACH — the enrolment ledger for a break.
        /// M2-2's veto is asked at five gates and the pre-emption path is the sixth; a break must be
        /// refused at every one of them, and this leg is what a later lane's new claim path has to
        /// be added to. ⚠️ The gates are asked through the PREDICATE rather than by scanning text
        /// (4th trap: pin how an API was called, never a text scan) — the behavioural legs above and
        /// below are what pin the call sites themselves.
        /// </summary>
        [Test]
        public void EveryClaimGateRefusesABrokenCrewMember()
        {
            var sim = WithWork();
            var c = Pawn(sim);
            c.BreakTier = BreakTier.Major;
            Assert.That(c.BreakRefusesWork, Is.True,
                "the ONE predicate all six gates ask. The six: JobSystem's dispatcher gate, "
                + "JobSystem.TryPreempt, CraftingSystem.FindNearestReachableIdle, "
                + "MachineWearSystem.FindNearestReachableIdle, EffectValidator (the LLM grant) and "
                + "CapabilityComputer (the LLM offer).");
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
        /// <para>⭐ <b>THIS LEG EXISTS BECAUSE THE FIRST DRAFT BROKE IT AND NOTHING ELSE NOTICED.</b>
        /// The pre-emption gate was written as a bare <c>if (BreakRefusesWork) continue;</c> in
        /// <c>JobSystem</c>'s citizen loop, which skips not only <c>TryPreempt</c> but the whole rest
        /// of the body — the owner lookup and the job driving under it. A broken crew member's Eat,
        /// Drink and Sleep jobs would have frozen where they stood. The gate now guards the CALL
        /// (<c>!BreakRefusesWork &amp;&amp; TryPreempt(...)</c>), and this is the leg that says so.</para>
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
