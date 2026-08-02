using System;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-9 — REST. Before this package every crew member on every ship in the repo was
    /// PERMANENTLY EXHAUSTED</b>: <c>NeedsSystem</c> ramped <see cref="Citizen.Fatigue"/> to 1.0 over
    /// ~16 h and nothing anywhere took a unit back off it, while <c>Citizen.cs:50</c> claimed
    /// <i>"1 = exhausted (slows work)"</i> — false in both halves. Now crew sleep.
    ///
    /// <para>⛔ <b>THE RULE EVERY LEG HERE DEFENDS</b> — <c>docs/design/rimworld-reference.md</c>
    /// §3.5's boxed rule: <i>"Needs do NOT interrupt a job in progress. The need check is a
    /// job-SELECTION filter, evaluated between jobs."</i> An out-of-band rest claim would silently
    /// undo <b>M2-8's pre-emption contract</b> and <b>M2-19's sticky hold</b>, both of which are
    /// pinned by PROPERTY (<see cref="Citizen.IsRecruitableIgnoringJob"/>) rather than by call site —
    /// so neither of those suites would have reddened. <see cref="MidHaul_FatigueDoesNotTakeTheJob"/>
    /// and <see cref="AHeldOrder_IsNotStolenByFatigue"/> are the legs that would.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-08-02).</b> Each row was
    /// edited into the tree, this whole fixture was run, and the tree was restored from an in-memory
    /// copy taken before the first row — never <c>git checkout</c> (TRAPS 2). <b>"RED" is what the run
    /// reported</b>; the charter's own table is M3-9's six rows.</para>
    /// <list type="table">
    ///   <item><b>1 — fatigue still never falls</b> (delete the subtraction in
    ///     <c>RestSystem.ProgressSleep</c>) ⇒ <b>RED 4/13</b>:
    ///     <see cref="ABunk_TakesHerFromExhaustedToRested_AndSheWakes"/>,
    ///     <see cref="NoBunkAboard_SheRestsOnTheDeck_WorseButNotNever"/>,
    ///     <see cref="OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery"/> and
    ///     <see cref="TheRecoveryRateAndTheGroundMultiplier_AreBothDefFields"/>.
    ///     ⚠️ <b>AND NOT <see cref="TheWearPath_ACTUALLY_Moves_WhenFatigueFalls"/>, WHICH STAYS
    ///     GREEN — the reason is the ramp gate and it is worth knowing.</b> With the ramp gated on
    ///     <see cref="JobKind.Sleep"/>, deleting the recovery leaves a sleeper's fatigue FROZEN
    ///     rather than rising; the wear leg's two runs (sleeps vs never-sleeps) therefore still
    ///     diverge — frozen at 0.9 against climbing to 1.0 — so its inequality still holds. Before
    ///     the gate this mutation made a sleeper's fatigue rise like everybody else's, the two runs
    ///     collapsed together and the leg DID redden. ⇒ <b>The wear leg is pinned by mutation 6, not
    ///     by this one</b>, and a reader must not take its green here as evidence about recovery.</item>
    ///   <item><b>2 — rest INTERRUPTS a job in progress</b> (an out-of-band claim: every non-sleeping
    ///     crew member is offered rest, bypassing the <c>IsIdleForWork</c> branch) ⇒ <b>RED 3/13</b>:
    ///     <see cref="MidHaul_FatigueDoesNotTakeTheJob"/>,
    ///     <see cref="AHeldOrder_IsNotStolenByFatigue"/> and
    ///     <see cref="RestIsRegisteredBeforeTheDispatcher_AndThatDecidesTheSELECTION"/>.</item>
    ///   <item><b>3 — rest bypasses the HELD ORDER</b> (claim when <c>HeldByOrder</c>, keeping every
    ///     other guard) ⇒ <b>RED 1/13</b>: <see cref="AHeldOrder_IsNotStolenByFatigue"/>.</item>
    ///   <item>⛔⛔ <b>AND THE FINDING THAT JUSTIFIES THIS FILE EXISTING AT ALL, measured on rows 2
    ///     AND 3: <c>StickyClaimTests</c> + <c>PreemptionTests</c> stay GREEN 0/22 under BOTH.</b>
    ///     The charter predicted exactly this — M2-8's pre-emption contract and M2-19's sticky hold
    ///     are pinned by the PROPERTY <see cref="Citizen.IsRecruitableIgnoringJob"/>, and an
    ///     out-of-band rest claim never asks that property, so it undoes both contracts without
    ///     reddening one line of either suite. The two legs above are the ONLY thing in the repo that
    ///     sees it.</item>
    ///   <item><b>4 — no bed on the ship ⇒ she does not rest at all</b> (an early <c>return</c> in
    ///     place of the bedless fall-through) ⇒ <b>RED 3/13</b>:
    ///     <see cref="NoBunkAboard_SheRestsOnTheDeck_WorseButNotNever"/>,
    ///     <see cref="OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery"/> and
    ///     <see cref="TheRecoveryRateAndTheGroundMultiplier_AreBothDefFields"/> — the three legs with
    ///     a DECK arm. <see cref="ABunk_TakesHerFromExhaustedToRested_AndSheWakes"/> stays green,
    ///     correctly: this row says nothing about the bed path.
    ///     ⚠️ <b>THE FIRST FORMULATION OF THIS ROW WAS A RED FOR THE WRONG REASON (TRAPS 3), AND IT
    ///     IS RECORDED RATHER THAN SILENTLY REPLACED.</b> It inverted the claim —
    ///     <c>if (!TryClaimBed(…)) return;</c> — which ALSO corrupts the bed path, because a
    ///     SUCCESSFUL claim then falls through to the ground branch and overwrites
    ///     <c>JobTarget</c> with her own tile. It read <b>RED 4/13</b> with <c>ABunk</c> among them,
    ///     and that fourth red was the mutation breaking something the row does not name. The
    ///     formulation above leaves the bed path byte-identical and kills only the fall-through.</item>
    ///   <item><b>5 — fatigue MULTIPLIES work rate</b> (a <c>(1 − Fatigue/2)</c> factor in
    ///     <c>WorkRates.RateMilliFor</c>) ⇒ <b>RED 1/13</b>:
    ///     <see cref="Fatigue_IsNotAWorkRateInput_AndTheWholePinStoryAssumesThat"/>.</item>
    ///   <item><b>6 — cut the fatigue → mood → wear chain</b> (zero the <c>mood_fatigue_weight</c>
    ///     term in <c>NeedsSystem</c>) ⇒ <b>RED 1/13</b>:
    ///     <see cref="TheWearPath_ACTUALLY_Moves_WhenFatigueFalls"/> — the Director leg, i.e. PIN
    ///     M3-c's third and easiest-to-miss cause, asserted rather than assumed.</item>
    ///   <item>⭐ <b>7 — UN-GATE <c>NeedsSystem</c>'s FATIGUE RAMP</b> (this package's own shipped
    ///     defect, re-armed as a mutation) ⇒ <b>RED 1/13</b>:
    ///     <see cref="OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery"/>. ⛔ <b>Against the FIRST
    ///     commit's suite this mutation was GREEN 0/11</b> — every fixture omitted
    ///     <c>NeedsSystem</c>, so nothing in the repo could see a deck sleep run for two and a half
    ///     sim-days. That leg is the blind spot's only cover.</item>
    ///   <item>⭐ <b>8 — REGISTER <see cref="RestSystem"/> AFTER <see cref="JobSystem"/></b> ⇒ ⛔
    ///     <b>GREEN across the whole repo, with P1 unchanged</b>, which is how an independent
    ///     reviewer found the claim unpinned.
    ///     <see cref="RestIsRegisteredBeforeTheDispatcher_AndThatDecidesTheSELECTION"/> now applies
    ///     that mutation IN-PROCESS — it builds both orders and requires them to differ — so it is
    ///     the one leg that reddens. Read its header: the REASON the first commit gave for the order
    ///     was measured and is FALSE.</item>
    /// </list>
    ///
    /// <para><b>Every leg is DRIVEN.</b> Under OD-H every work type boots OFF, so every fixture that
    /// wants work GRANTS it explicitly — a fixture that forgot would exercise nothing and read as a
    /// perfect pass.</para>
    /// </summary>
    [TestFixture]
    public class RestSystemTests
    {
        // ------------------------------------------------------------------ fixture

        private static readonly string[] HallMap =
        {
            "####################",
            "#..................#",
            "#..................#",
            "#..................#",
            "####################",
        };

        private static readonly Int3 PawnStart = new Int3(2, 2, 0);
        private static readonly Int3 BunkTile = new Int3(17, 2, 0);
        private static readonly Int3 CargoStart = new Int3(4, 2, 0);
        private static readonly Int3 Stockpile = new Int3(17, 1, 0);
        private static readonly Int3 MachineTile = new Int3(15, 3, 0);
        private static readonly Int3 PartsTile = new Int3(3, 1, 0);

        /// <summary>
        /// The shipped stack's relative order for the systems these legs use, and the ORDER IS THE
        /// SUBJECT: <see cref="RestSystem"/> before <see cref="JobSystem"/> is RW §3.5's need-check
        /// order (Eat ▸ Sleep ▸ … ▸ Work), and the push recruiters after both is shipped behaviour.
        /// ⚠️ <c>NeedsSystem</c> is deliberately ABSENT — it is the only thing that RAISES fatigue, so
        /// leaving it out means every fatigue number below is exactly what this fixture wrote minus
        /// exactly what <see cref="RestSystem"/> removed. A leg that wants the ramp says so
        /// (<see cref="TheWearPath_ACTUALLY_Moves_WhenFatigueFalls"/> runs the whole shipped stack).
        /// </summary>
        private static Simulation NewSim(SimDefs defs = null) =>
            new Simulation(AsciiWorld.Build(HallMap), 11, new ISimSystem[]
            {
                new CitizenSystem(),
                new RestSystem(),
                new JobSystem(),
                new CraftingSystem(),
                new MaintenanceSystem(),
                new DeconstructSystem(),
            }, defs);

        private static Device Bunk(Simulation sim) => sim.AddDevice(DeviceKind.Bed, BunkTile, "bunk_a");

        /// <summary>A crew member who is idle, capable of everything, and TIRED — the state the
        /// claimant is supposed to answer.</summary>
        private static Citizen TiredPawn(Simulation sim, float fatigue = 0.9f)
        {
            var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();
            pawn.Fatigue = fatigue;
            return pawn;
        }

        /// <summary>Tick until <paramref name="pawn"/> is genuinely asleep AND has stopped walking,
        /// so a measurement window starts at the first tick that actually rests her.</summary>
        private static int DriveToAsleep(Simulation sim, Citizen pawn, int budget = 4000)
        {
            for (int t = 1; t <= budget; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Sleep && !pawn.HasPath) return t;
            }
            Assert.Fail("fixture: the pawn never fell asleep within " + budget +
                        " ticks — JobKind was " + pawn.JobKind);
            return -1;
        }

        /// <summary>One loose stack and somewhere to put it, far apart (StickyClaimTests' shape).</summary>
        private static ItemStack Haulable(Simulation sim)
        {
            var cargo = sim.AddItem(ItemKind.Scrap, 1, CargoStart);
            sim.World.SetFlag(Stockpile, TileFlags.Stockpile, true);
            sim.JobsDirty = JobBoardDirty.All;
            return cargo;
        }

        private static ItemStack DriveToMidHaul(Simulation sim, Citizen pawn, uint cargoId, int ticks)
        {
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.HaulDeliver && pawn.CarryingItemId == cargoId)
                {
                    Assert.That(sim.Items.TryGet(cargoId, out var carried), Is.True);
                    return carried;
                }
            }
            Assert.Fail("fixture: the pawn never picked the haul up, so there is no job to protect");
            return null;
        }

        // ==================================================== 1. the headline: fatigue FALLS

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S SENTENCE, DRIVEN END TO END: a tired crew member walks to a bunk,
        /// sleeps, and wakes rested.</b> Charter mutation 1's own acceptance ("a pawn with a bed
        /// reaches <c>Fatigue &lt; 0.1</c>") is asserted literally, and then the leg goes further —
        /// she reaches 0 and WAKES, which is the half a fatigue-only assertion would miss.
        ///
        /// <para><b>The controls are what make this more than "a number went down":</b> she must be
        /// ON the bunk tile when she sleeps (so the bed was really sought and reached, not ignored),
        /// and the tick count is asserted ABSOLUTELY against needs.def's rate rather than as
        /// "eventually" — a suite of "it decreases" assertions cannot see a 2× scale error (TRAPS,
        /// seventh shape).</para>
        /// </summary>
        [Test]
        public void ABunk_TakesHerFromExhaustedToRested_AndSheWakes()
        {
            var sim = NewSim();
            Bunk(sim);
            var pawn = TiredPawn(sim, 1.0f);

            int asleepAt = DriveToAsleep(sim, pawn);
            Assert.That(pawn.Pos, Is.EqualTo(BunkTile),
                "she must sleep IN the bunk — a leg that passed with her asleep on the floor beside " +
                "it would pin the ground path and call it the bed path");

            int wokeAt = -1;
            bool sawUnderTenth = false;
            for (int t = asleepAt + 1; t <= 500_000 && wokeAt < 0; t++)
            {
                sim.Tick();
                if (pawn.Fatigue < 0.1f) sawUnderTenth = true;
                if (pawn.JobKind == JobKind.None) wokeAt = t;
            }

            Assert.That(sawUnderTenth, Is.True,
                "charter mutation 1: a pawn with a bed must reach Fatigue < 0.1");
            Assert.That(wokeAt, Is.GreaterThan(0), "she must WAKE, not sleep for ever");
            Assert.That(pawn.Fatigue, Is.EqualTo(0f).Within(1e-6f),
                "waking is `Fatigue reached 0` (RW §3.5's 'wakes at rest 100%'), not a timer");

            // ⭐ ABSOLUTE, NOT A RATIO — the scale floor. 1.0 of Fatigue at 1/37800 per second,
            // 0.1 s per tick, in a bed (effectiveness 1.0) is 378 000 sleeping ticks in exact
            // arithmetic. MEASURED: 379 289, i.e. +0.34 %, and the cause is FLOAT ACCUMULATION —
            // 378 000 subtractions of 2.6455e-06 from a float near 1.0, where one ULP is 6.0e-08 and
            // each step therefore rounds by up to ~1 % of itself. The band below is ±1.1 %, which is
            // wide enough for that drift and 45× too narrow for the error it exists to catch: a 2×
            // rate mistake lands at 189 000 or 756 000 ticks.
            int slept = wokeAt - asleepAt;
            Assert.That(slept, Is.InRange(374_000, 382_000),
                "needs.def fatigue_recovery_per_second is 1/37800 per second, so 1.0 -> 0 in a bed is " +
                "~378 000 ticks. Measured " + slept.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ". A ratio-only suite cannot see a scale error here — that is what this bound is for.");
        }

        // ==================================================== 2. the graceful leg (mutation 4)

        /// <summary>
        /// ⛔ <b>CHARTER MUTATION 4 — NO BUNK ABOARD MEANS SHE RESTS <i>WORSE</i>, NEVER
        /// <i>NEVER</i>.</b> §4.4's rest-effectiveness table: ground/sleeping spot <b>0.8</b>,
        /// bed <b>1.0</b>. This is not a courtesy branch — <c>--ship wreck</c>, the shipping default,
        /// calls <c>RoomDresser.Dress</c> deliberately not at all, so the deck IS the shipped path
        /// until the player places a bunk.
        ///
        /// <para><b>THREE assertions, and the first two are what stop this being a ratio suite.</b>
        /// The bed drop and the deck drop are each asserted ABSOLUTELY against needs.def over the
        /// same fixed window; the ratio is asserted as well. A suite built only from the ratio would
        /// stay green with both numbers doubled (TRAPS, seventh shape), and a suite built only from
        /// "the deck value is smaller" would stay green with the ground multiplier at 0.01.</para>
        /// </summary>
        [Test]
        public void NoBunkAboard_SheRestsOnTheDeck_WorseButNotNever()
        {
            const int Window = 20_000;

            var withBed = NewSim();
            Bunk(withBed);
            var inBunk = TiredPawn(withBed, 0.9f);
            DriveToAsleep(withBed, inBunk);
            Assert.That(inBunk.Pos, Is.EqualTo(BunkTile), "control: the bedded pawn really reached the bunk");

            var bedless = NewSim();
            var onDeck = TiredPawn(bedless, 0.9f);
            DriveToAsleep(bedless, onDeck);
            Assert.That(onDeck.Pos, Is.EqualTo(PawnStart),
                "with no bunk she lies down where she stands rather than walking anywhere");
            Assert.That(bedless.TryGetDeviceAt(onDeck.Pos, out _), Is.False,
                "control: there is genuinely no device under her — this is the DECK branch");

            float bedBefore = inBunk.Fatigue, deckBefore = onDeck.Fatigue;
            for (int t = 0; t < Window; t++) { withBed.Tick(); bedless.Tick(); }
            float bedDrop = bedBefore - inBunk.Fatigue;
            float deckDrop = deckBefore - onDeck.Fatigue;

            // ⭐ ABSOLUTE — the scale floor. 20 000 ticks x 0.1 s x (1/37800) = 0.05291005 in exact
            // arithmetic; MEASURED 0.05245209 (−0.87 %), which is the same float-accumulation drift
            // the headline leg records. The ±1e-3 band is ~2 % — 50× narrower than the 100 % error a
            // doubled rate would produce, and the reason this leg is not written as a ratio alone.
            const float ExpectedBed = 20_000 * 0.1f / 37_800f;
            Assert.That(bedDrop, Is.EqualTo(ExpectedBed).Within(1e-3f),
                "a bunk rests at effectiveness 1.0, so " + Window + " ticks must remove ~" +
                ExpectedBed.ToString(System.Globalization.CultureInfo.InvariantCulture) + ", measured " +
                bedDrop.ToString(System.Globalization.CultureInfo.InvariantCulture));
            Assert.That(deckDrop, Is.EqualTo(ExpectedBed * 0.8f).Within(1e-3f),
                "the deck rests at needs.def rest_effectiveness_ground = 0.8 of that, measured " +
                deckDrop.ToString(System.Globalization.CultureInfo.InvariantCulture));

            // THE FLOOR — "worse, not never". Asserted separately from the number above, because a
            // future retune of the multiplier must not be able to make this leg vacuous.
            Assert.That(deckDrop, Is.GreaterThan(0f),
                "charter mutation 4: with no bunk aboard she must still rest");
            // ⚠️ THE RATIO'S BAND IS ±0.03 AND THE REASON IS ARITHMETIC, NOT SLOPPINESS. Measured
            // 0.8182. Around Fatigue 0.9 one float ULP is 5.96e-08, so the BED's per-tick step
            // (2.6455e-06) is 44.4 ULPs and rounds DOWN to 44 (−0.9 %) while the DECK's
            // (2.1164e-06) is 35.5 and rounds UP to 36 (+1.4 %) — a deterministic quantisation that
            // pushes the ratio to 0.818 and would still be there with the arithmetic exactly right.
            // A WRONG multiplier is nowhere near: 0.5 is 37 % away and 1.0 is 25 %.
            Assert.That(deckDrop / bedDrop, Is.EqualTo(0.8f).Within(0.03f),
                "the ratio is RW §4.4's, 0.8 against the bed's 1.0 — measured " +
                (deckDrop / bedDrop).ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        // ==================================================== 3. the M2 contracts (mutations 2, 3)

        /// <summary>
        /// ⛔⛔ <b>CHARTER MUTATION 2 — RW §3.5's LEG: a crew member mid-job FINISHES IT, then
        /// rests.</b> <i>A hungry RimWorld colonist finishes its wall before it eats.</i>
        ///
        /// <para>She is driven until she is genuinely CARRYING the crate, and only THEN made
        /// exhausted — <c>Fatigue = 1.0</c>, far above needs.def's 0.75 trigger. The delivery must
        /// complete with the crate on the stockpile tile, and she must never have held
        /// <see cref="JobKind.Sleep"/> before it did. <b>Then</b> she sleeps, which is the other half:
        /// a leg that only asserted "she did not sleep" would pass on a build where rest is broken
        /// entirely.</para>
        /// </summary>
        [Test]
        public void MidHaul_FatigueDoesNotTakeTheJob()
        {
            var sim = NewSim();
            Bunk(sim);
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(cargo.Pos, Is.Not.EqualTo(Stockpile), "fixture: she must still be EN ROUTE");
            pawn.Fatigue = 1.0f; // exhausted, mid-job
            Assert.That(pawn.Fatigue, Is.GreaterThan(sim.Defs.Needs.FatigueRestThreshold),
                "control: she really is over the sleep trigger for the whole window below");

            bool sleptEarly = false, delivered = false;
            for (int t = 0; t < 4000 && !delivered; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Sleep && !delivered) sleptEarly = true;
                if (sim.Items.TryGet(cargo.Id, out var st) && st.CarriedBy == 0 && st.Pos == Stockpile)
                    delivered = true;
            }

            Assert.That(delivered, Is.True,
                "RW §3.5: needs do not interrupt a job in progress — the crate must reach the " +
                "stockpile even though she is at Fatigue 1.0 the whole way");
            Assert.That(sleptEarly, Is.False,
                "and she must not have fallen asleep carrying it");

            // ...and NOW she rests. Without this the leg passes on a build where rest never fires.
            bool sleptAfter = false;
            for (int t = 0; t < 4000 && !sleptAfter; t++)
            {
                sim.Tick();
                if (pawn.JobKind == JobKind.Sleep) sleptAfter = true;
            }
            Assert.That(sleptAfter, Is.True,
                "the need check is a SELECTION filter: having finished, she must now choose sleep");
        }

        /// <summary>
        /// ⛔⛔ <b>CHARTER MUTATION 3 — THE M2-19 LEG: a HELD ORDER is not stolen by fatigue.</b>
        /// <i>"That machine, NOW"</i> outranks the grid, and it must outrank a need's claim too —
        /// otherwise the sticky hold silently acquires an expiry condition nobody documented.
        ///
        /// <para>The hold is staged the way <c>PrioritiseJobCommand</c> must: the job FIRST, the bool
        /// SECOND (<see cref="Citizen.HeldByOrder"/>'s writer contract). ⚠️ <b>The structural reason
        /// this holds is worth stating, because it is what makes the guard un-missable:</b>
        /// <c>HeldByOrder ⇒ JobKind != None</c>, and <see cref="RestSystem"/>'s only claim path is
        /// gated on <see cref="Citizen.IsIdleForWork"/>, which requires <c>JobKind == None</c>. There
        /// is deliberately no second, belt-and-braces <c>HeldByOrder</c> check inside
        /// <c>RestSystem</c> — two guards for one rule means neither can be shown to bite
        /// (<c>JobSystem.TryPreempt</c>'s own reasoning, applied here).</para>
        ///
        /// <para>NON-VACUITY: the identical fixture with the hold removed and the job finished DOES
        /// sleep — <see cref="MidHaul_FatigueDoesNotTakeTheJob"/> is that control.</para>
        /// </summary>
        [Test]
        public void AHeldOrder_IsNotStolenByFatigue()
        {
            var sim = NewSim();
            Bunk(sim);
            var cargo = Haulable(sim);
            var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();

            DriveToMidHaul(sim, pawn, cargo.Id, 600);
            Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.None),
                "fixture: the hold is placed on a JOB (RW §2.2's curJob.playerForced)");
            pawn.HeldByOrder = true;
            pawn.Fatigue = 1.0f;

            for (int t = 0; t < 3000; t++)
            {
                sim.Tick();
                Assert.That(pawn.JobKind, Is.Not.EqualTo(JobKind.Sleep),
                    "fatigue took a DIRECTLY ORDERED crew member off her order at tick " +
                    t.ToString(System.Globalization.CultureInfo.InvariantCulture));
                if (pawn.JobKind == JobKind.None) break; // the order completed; the hold is released
            }
            Assert.That(pawn.Fatigue, Is.GreaterThanOrEqualTo(sim.Defs.Needs.FatigueRestThreshold),
                "control: she was over the sleep trigger for the whole window, so the refusal above " +
                "is the guard and not an untired pawn");
        }

        /// <summary>
        /// The same rule from the OTHER side: a SLEEPING crew member is not pre-empted by work,
        /// however the player ranks it. <c>JobSystem.TryPreempt</c>'s FIRST line is
        /// <c>WorkTypeMap.TryOf</c>, and <see cref="JobKind.Sleep"/> is classified as not-work — so
        /// the survival guard that protects Eat/Drink/Flee protects sleep, with no new code.
        /// ⚠️ Pinned HERE as behaviour rather than only in <c>WorkTypeVetoTests</c>' table, because a
        /// table row is a claim about a switch and this is a claim about a pawn.
        /// </summary>
        [Test]
        public void ASleepingPawn_IsNotPreemptedByBandOneWork()
        {
            var sim = NewSim();
            Bunk(sim);
            var pawn = TiredPawn(sim, 0.9f);
            DriveToAsleep(sim, pawn);

            // The strongest possible offer: a machine crying out for service, Parts aboard, Repair
            // at band 1 — the exact pressure PreemptionTests uses to take a busy pawn off a haul.
            var machine = sim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrubber");
            machine.Condition = 0.30f;
            Assert.That(machine.Condition,
                Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "control: the machine really wants service, so the offer is real");
            sim.AddItem(ItemKind.Parts, 4, PartsTile);
            pawn.SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
            sim.JobsDirty = JobBoardDirty.All;

            for (int t = 0; t < 2000; t++)
            {
                sim.Tick();
                Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Sleep),
                    "a sleeping crew member was pre-empted at tick " +
                    t.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                    " — JobKind.Sleep must be classified as NOT WORK (WorkTypeMap), which is what " +
                    "makes TryPreempt's survival guard refuse her");
            }
        }

        /// <summary>
        /// ⚠️ A player-ordered WALK is interrupted by rest, and the flag that guards it does NOT get
        /// left standing. Two facts, and the second is the one that would rot silently:
        /// <list type="number">
        ///   <item>rest may take an ordered WALK — <c>SustenanceSystem</c>'s ruling applied unchanged
        ///     (<i>"a move order suppresses WORK, never SURVIVAL"</i>), and a walk is not a JOB, so
        ///     RW §3.5 is untouched;</item>
        ///   <item><see cref="Citizen.OrderedMove"/> is CLEARED when it happens. Its own header calls a
        ///     flag left standing after a path-clearing interrupt <i>"a silent, unrecoverable idle
        ///     bug"</i>; it is survivable today only because the live guard is
        ///     <c>OrderedMove &amp;&amp; HasPath</c>. This leg pins the clear so that stops being
        ///     load-bearing.</item>
        /// </list>
        /// </summary>
        [Test]
        public void AnOrderedWalk_YieldsToRest_AndLeavesNoStaleOrderFlag()
        {
            var sim = NewSim();
            Bunk(sim);
            var pawn = TiredPawn(sim, 0.9f);
            new MoveCitizenCommand(pawn.Id, new Int3(10, 1, 0)).Execute(sim);
            Assert.That(pawn.OrderedMove, Is.True, "fixture: the move order really started");
            Assert.That(pawn.HasPath, Is.True, "fixture: and the walk is in progress");

            DriveToAsleep(sim, pawn);
            Assert.That(pawn.OrderedMove, Is.False,
                "the ordered-walk flag must not survive an interrupt that cleared her path — see " +
                "Citizen.OrderedMove's header, and SafetySystem/JobSystem.TryPreempt, which both " +
                "clear it for exactly this reason");
        }

        // ==================================================== 4. the scope ruling (mutation 5)

        /// <summary>
        /// ⛔ <b>CHARTER MUTATION 5 — TIREDNESS IS NOT A WORK-RATE MULTIPLIER IN v1, AND THE WHOLE
        /// PIN STORY ASSUMES IT.</b> §4.4 measures RimWorld's rest need as affecting <b>mood and
        /// immunity only — no work or combat stat</b>. The work rate's one input is
        /// <c>WorkRates</c>/<c>Citizen.SkillsRaw</c> (M3-7's axis) and a second factor here would
        /// double-count it.
        ///
        /// <para>Driven as a 2×2 in the only currency that matters: <b>the tick on which the job
        /// completes</b>. Two identical sims, one crew member rested (0.0) and one nearly exhausted
        /// (0.74 — deliberately a hair BELOW needs.def's 0.75 trigger, so the tired one does not go to
        /// sleep and confound the measurement). The strip must finish on exactly the same tick.</para>
        /// </summary>
        [Test]
        public void Fatigue_IsNotAWorkRateInput_AndTheWholePinStoryAssumesThat()
        {
            int Strip(float fatigue)
            {
                var sim = NewSim();
                var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();
                pawn.Fatigue = fatigue;
                Assert.That(fatigue, Is.LessThan(sim.Defs.Needs.FatigueRestThreshold),
                    "fixture: BOTH legs must stay below the sleep trigger, or one of them sleeps " +
                    "instead of working and this measures the wrong thing");

                var device = sim.AddDevice(DeviceKind.Light, MachineTile, "lamp");
                DeconstructSystem strip = null;
                foreach (var s in sim.Systems) if (s is DeconstructSystem d) { strip = d; break; }
                Assert.That(strip, Is.Not.Null, "fixture: NewSim registers a DeconstructSystem");
                Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True,
                    "fixture: the lamp must really be designated for stripping");
                sim.JobsDirty = JobBoardDirty.All;

                for (int t = 1; t <= 20_000; t++)
                {
                    sim.Tick();
                    if (!sim.Devices.TryGet(device.Id, out _)) return t;
                }
                Assert.Fail("fixture: the strip never completed at Fatigue " +
                            fatigue.ToString(System.Globalization.CultureInfo.InvariantCulture));
                return -1;
            }

            int rested = Strip(0.0f);
            int tired = Strip(0.74f);
            Assert.That(tired, Is.EqualTo(rested),
                "v1 does NOT make tiredness a work-rate multiplier (RW §4.4). Rested finished at " +
                rested.ToString(System.Globalization.CultureInfo.InvariantCulture) + ", tired at " +
                tired.ToString(System.Globalization.CultureInfo.InvariantCulture) + ". If a lane " +
                "wants this axis it belongs beside M3-7's skill curve, as ONE term, not two.");
        }

        // ==================================================== 5. the def scalars (behavioural consumers)

        /// <summary>
        /// needs.def <c>fatigue_rest_threshold</c> has a BEHAVIOURAL consumer, not just a checksum
        /// fold: a pawn a hair below it does not sleep, one a hair above it does. ⚠️ Both legs run on
        /// the SAME fixture with only the fatigue changed, so the assertion is about the threshold and
        /// not about the fixture.
        /// </summary>
        [Test]
        public void TheSleepTrigger_IsTheDefField_AndIsAskedOnBothSides()
        {
            bool Sleeps(float fatigue, SimDefs defs)
            {
                var sim = NewSim(defs);
                Bunk(sim);
                var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();
                pawn.Fatigue = fatigue;
                for (int t = 0; t < 3000; t++)
                {
                    sim.Tick();
                    if (pawn.JobKind == JobKind.Sleep) return true;
                }
                return false;
            }

            Assert.That(Sleeps(0.74f, null), Is.False, "below needs.def's 0.75 trigger she keeps working");
            Assert.That(Sleeps(0.76f, null), Is.True, "above it she goes to bed");

            // ...and the number really comes from the def rather than from a literal: retuned to 0.5,
            // the SAME 0.6 pawn who would not have slept now does.
            var retuned = SimDefs.CreateDefault();
            retuned.Needs.FatigueRestThreshold = 0.5f;
            retuned.ComputeChecksum();
            Assert.That(Sleeps(0.6f, null), Is.False, "control: 0.6 is below the shipped trigger");
            Assert.That(Sleeps(0.6f, retuned), Is.True,
                "RestSystem must read sim.Defs.Needs.FatigueRestThreshold, not a compiled literal");
        }

        /// <summary>
        /// needs.def <c>fatigue_recovery_per_second</c> and <c>rest_effectiveness_ground</c> have
        /// behavioural consumers too, measured as ABSOLUTE drops over a fixed window rather than as
        /// "it got faster" — the ratio alone cannot see a scale error.
        /// </summary>
        [Test]
        public void TheRecoveryRateAndTheGroundMultiplier_AreBothDefFields()
        {
            const int Window = 20_000;

            float Drop(SimDefs defs, bool withBunk)
            {
                var sim = NewSim(defs);
                if (withBunk) Bunk(sim);
                var pawn = TiredPawn(sim, 0.9f);
                DriveToAsleep(sim, pawn);
                float before = pawn.Fatigue;
                for (int t = 0; t < Window; t++) sim.Tick();
                return before - pawn.Fatigue;
            }

            var fast = SimDefs.CreateDefault();
            fast.Needs.FatigueRecoveryPerSecond *= 10f;
            fast.ComputeChecksum();
            Assert.That(Drop(fast, withBunk: true), Is.EqualTo(10f * Window * 0.1f / 37_800f).Within(1e-3f),
                "x10 fatigue_recovery_per_second must remove ~ten times as much (the tolerance is " +
                "float-accumulation drift; measured 0.5292892 against 0.5291005 exact)");

            var flatGround = SimDefs.CreateDefault();
            flatGround.Needs.RestEffectivenessGround = 1.0f;
            flatGround.ComputeChecksum();
            Assert.That(Drop(flatGround, withBunk: false), Is.EqualTo(Window * 0.1f / 37_800f).Within(1e-3f),
                "rest_effectiveness_ground = 1.0 must make the deck exactly as good as a bunk — " +
                "so the shipped 0.8 really is the def and not a hard-coded penalty");
        }

        // ================================ 5b. THE SHIPPED STACK — the fixture blind spot's cover

        /// <summary>
        /// ⛔⛔ <b>THE LEG THAT WOULD HAVE CAUGHT THIS PACKAGE'S ONE REAL DEFECT, AND IT EXISTS
        /// BECAUSE OF THE NINTH TRAP.</b> Every other leg in this file runs on <see cref="NewSim"/>,
        /// which deliberately OMITS <c>NeedsSystem</c> so that fatigue is exactly what the fixture
        /// wrote minus exactly what <see cref="RestSystem"/> removed. That narrowing is correct and it
        /// created a blind spot nothing else closed: <c>NeedsSystem</c>'s ramp was UNCONDITIONAL, so
        /// on the real stack the net recovery was <c>(recovery × effectiveness − ramp)</c> and a
        /// 0.9-tired crew member needed <b>27.7 sim-hours</b> off a bed and <b>63.6 sim-hours — two
        /// and a half sim-DAYS — on the deck</b>, which is the shipped path. Not one test was red.
        ///
        /// <para>This leg runs the WHOLE SHIPPED STACK (<c>SystemStack.CreateDefault</c>, ramp
        /// present) and asserts a COMPLETED sleep against an ABSOLUTE duration in ticks. It is the
        /// only leg in the file that can see the two systems compose.</para>
        ///
        /// <para>⭐ The expected numbers are the def's own arithmetic and nothing else, which is the
        /// point: <c>0.75 / (1/37800) = 28 350 s = 283 500 ticks</c> in a bed and <c>÷ 0.8 =
        /// 354 375</c> on the deck. MEASURED: <b>284 002</b> and <b>352 854</b> — the small spread is
        /// the float-accumulation drift the other legs record, plus the walk to the bunk. With the
        /// ramp ungated these read 997 000 and 2 290 000; the ±3 % bands below are ~100× too narrow
        /// for that.</para>
        /// </summary>
        [Test]
        public void OnTheSHIPPEDStack_TheRampDoesNotFightTheRecovery()
        {
            long SleepTicks(bool withBunk, out float hungerGained, out float thirstGained)
            {
                var moss = new ScriptRuntime(new DeviceRegistry());
                var sim = new Simulation(AsciiWorld.Build(HallMap), 7, SystemStack.CreateDefault(moss));
                if (withBunk) sim.AddDevice(DeviceKind.Bed, BunkTile, "bunk_a");
                sim.Rooms.SetAnchor("hall", PawnStart);
                sim.Rooms.RecomputeIfDirty(sim);
                RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, PawnStart));
                var pawn = sim.AddCitizen("Rell", PawnStart);
                pawn.Fatigue = 0.7501f;   // a hair over the shipped trigger: the state real play reaches

                long asleepAt = -1, wokeAt = -1;
                float hungerAtSleep = 0f, thirstAtSleep = 0f;
                for (long t = 1; t <= 3_000_000 && wokeAt < 0; t++)
                {
                    sim.Tick();
                    if (asleepAt < 0 && pawn.JobKind == JobKind.Sleep && !pawn.HasPath)
                    {
                        asleepAt = t; hungerAtSleep = pawn.Hunger; thirstAtSleep = pawn.Thirst;
                    }
                    else if (asleepAt > 0 && pawn.JobKind != JobKind.Sleep) wokeAt = t;
                }
                Assert.That(asleepAt, Is.GreaterThan(0), "fixture: she must fall asleep at all");
                Assert.That(wokeAt, Is.GreaterThan(0),
                    "SHE MUST WAKE. On the shipped stack with an ungated ramp this is where a deck " +
                    "sleep ran for two and a half sim-days.");
                Assert.That(pawn.Dead, Is.False, "control: she is alive, so the durations are hers");
                hungerGained = pawn.Hunger - hungerAtSleep;
                thirstGained = pawn.Thirst - thirstAtSleep;
                return wokeAt - asleepAt;
            }

            long bed = SleepTicks(true, out float bedHunger, out float bedThirst);
            long deck = SleepTicks(false, out float deckHunger, out float deckThirst);

            Assert.That(bed, Is.InRange(275_000, 292_000),
                "0.75 of Fatigue at 1/37800 per second in a bed is 283 500 ticks (7.875 sim-h). " +
                "Measured " + bed.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ". If this reads ~997 000, NeedsSystem's ramp is fighting RestSystem's recovery again.");
            Assert.That(deck, Is.InRange(344_000, 365_000),
                "and on the deck it is 283 500 / 0.8 = 354 375 ticks (9.84 sim-h). Measured " +
                deck.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ". If this reads ~2 290 000, the ramp is ungated.");

            // ⚠️ THE KNOCK-ON, PINNED AS A BOUND RATHER THAN LEFT IMPLICIT. A sleeping crew member is
            // skipped by SustenanceSystem (its JobKind.None gate), so she cannot eat or drink while
            // asleep — which is fine at RimWorld durations and was NOT fine at 63.6 h. Thirst is the
            // binding one (1/86400 per second): a bed sleep costs 0.329 of it, a deck sleep 0.409.
            Assert.That(deckThirst, Is.LessThan(0.45f),
                "a sleep must not cost half the thirst meter — she cannot drink while asleep. " +
                "bed=" + bedThirst.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                " deck=" + deckThirst.ToString(System.Globalization.CultureInfo.InvariantCulture));
            Assert.That(bedThirst, Is.EqualTo(0.329f).Within(0.02f), "bed sleep costs ~0.329 thirst");
            Assert.That(bedHunger, Is.EqualTo(0.164f).Within(0.02f), "and ~0.164 hunger");
            Assert.That(deckHunger, Is.LessThan(0.25f), "the deck sleep's hunger cost stays bounded too");
        }

        // ================================ 5c. the registration order (the claim, corrected and pinned)

        /// <summary>
        /// ⭐⭐ <b>"REGISTRATION ORDER IS BEHAVIOUR" — PINNED HERE, AND THE REASON GIVEN FOR IT IN
        /// THIS PACKAGE'S FIRST COMMIT WAS WRONG. Both halves are recorded.</b>
        ///
        /// <para>⛔ <b>WHAT THE FIRST COMMIT CLAIMED, IN THREE PLACES, AND WHAT MEASURING IT SHOWED.</b>
        /// It said: <i>"JobSystem claims an idle pawn on the very tick she goes idle, so a rest
        /// claimant registered AFTER it would win only on the ticks the dispatcher found nothing —
        /// which on a busy ship is never."</i> <b>That is false</b>, and the fixture below is what
        /// says so: with <see cref="RestSystem"/> behind <see cref="JobSystem"/> a crew member on a
        /// full haul board still falls asleep — at <b>t = 121</b> instead of <b>t = 1</b> — because
        /// the dispatcher writes <c>JobKind.None</c> when a job COMPLETES and the later system sees
        /// that inside the same tick. An independent reviewer moved the system with every suite green
        /// and P1 unchanged; the claim was undisclosed and unpinned. Recorded rather than quietly
        /// rewritten.</para>
        ///
        /// <para>⭐ <b>WHAT THE ORDER ACTUALLY BUYS, WHICH IS THE ANALOGUE'S OWN SENTENCE.</b> §3.5's
        /// need-check order is <b>Eat ▸ SLEEP ▸ … ▸ WORK</b>: for a crew member who is idle when a
        /// tick begins, the question is <i>which of the two is asked first</i>. Registered FIRST, rest
        /// wins that selection and an exhausted crew member is never handed another job. Registered
        /// second, WORK wins it and she takes one more job before resting — measurably a different
        /// game, and the wrong one against the reference.</para>
        ///
        /// <para>⚠️ <b>AND THE 10 Hz CADENCE IS DISCLOSED RATHER THAN PINNED.</b>
        /// <see cref="RestSystem.IntervalTicks"/> is 1 so that "rest is asked first" holds on EVERY
        /// tick rather than on one in ten; at 1 Hz the dispatcher would claim a freshly-idle crew
        /// member on nine ticks out of ten and the ordering above would be mostly decorative. That
        /// follows from the loop structure and is NOT separately measured here — <c>IntervalTicks</c>
        /// is a compile-time property with no seam to vary. Said out loud because this test's own
        /// subject is a claim that read plausibly and was wrong.</para>
        /// </summary>
        [Test]
        public void RestIsRegisteredBeforeTheDispatcher_AndThatDecidesTheSELECTION()
        {
            (JobKind first, int sleepTick, int hauls) Drive(bool restFirst)
            {
                var order = restFirst
                    ? new ISimSystem[] { new CitizenSystem(), new RestSystem(), new JobSystem() }
                    : new ISimSystem[] { new CitizenSystem(), new JobSystem(), new RestSystem() };
                var sim = new Simulation(AsciiWorld.Build(HallMap), 11, order);
                sim.AddDevice(DeviceKind.Bed, BunkTile, "bunk_a");
                // A FULL BOARD: eight loose stacks and a stockpile ROW (a one-tile zone holds one
                // stack, so the board would empty after the first delivery and the fixture would stop
                // being about anything — measured, it read "1 haul").
                for (int i = 0; i < 8; i++) sim.AddItem(ItemKind.Scrap, 1, new Int3(2 + i, 3, 0));
                for (int x = 11; x <= 18; x++) sim.World.SetFlag(new Int3(x, 1, 0), TileFlags.Stockpile, true);
                sim.JobsDirty = JobBoardDirty.All;
                var pawn = sim.AddCitizen("Rell", PawnStart).GiveAllWork();
                pawn.Fatigue = 0.9f;   // idle AND past the trigger when the first tick begins

                JobKind first = JobKind.None;
                int sleepTick = -1, hauls = 0;
                var was = JobKind.None;
                for (int t = 1; t <= 30_000; t++)
                {
                    sim.Tick();
                    if (first == JobKind.None && pawn.JobKind != JobKind.None) first = pawn.JobKind;
                    if (pawn.JobKind == JobKind.HaulPickup && was != JobKind.HaulPickup) hauls++;
                    if (sleepTick < 0 && pawn.JobKind == JobKind.Sleep) sleepTick = t;
                    was = pawn.JobKind;
                }
                return (first, sleepTick, hauls);
            }

            var shipped = Drive(restFirst: true);
            var reversed = Drive(restFirst: false);

            Assert.That(reversed.hauls, Is.GreaterThan(0),
                "control: with the dispatcher first she really is OFFERED work, so the difference " +
                "below is the selection and not an empty board");

            Assert.That(shipped.first, Is.EqualTo(JobKind.Sleep),
                "SHIPPED ORDER (RW §3.5, Eat ▸ SLEEP ▸ … ▸ WORK): an exhausted crew member who is idle " +
                "when the tick begins chooses SLEEP, with a full haul board in front of her");
            Assert.That(shipped.hauls, Is.Zero,
                "and she is never handed a job first");
            Assert.That(reversed.first, Is.EqualTo(JobKind.HaulPickup),
                "REVERSED: work wins the selection instead — she takes a haul while exhausted. This is " +
                "the behaviour the registration order exists to prevent, and it is the ONLY thing in " +
                "the repo that sees it.");
            Assert.That(reversed.sleepTick, Is.GreaterThan(shipped.sleepTick),
                "⚠️ she DOES still sleep behind the dispatcher — later, once the job she was given " +
                "completes and the dispatcher writes JobKind.None inside the same tick. Measured " +
                "t=" + reversed.sleepTick.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                " against t=" + shipped.sleepTick.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ". The first commit claimed she would never sleep at all; she does.");

            // ...and the SHIPPED stack really is that order — otherwise the above is a fact about a
            // local array, not about the game.
            var moss = new ScriptRuntime(new DeviceRegistry());
            var stack = SystemStack.CreateDefault(moss);
            int rest = -1, jobs = -1;
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] is RestSystem) rest = i;
                if (stack[i] is JobSystem) jobs = i;
            }
            Assert.That(rest, Is.GreaterThanOrEqualTo(0), "the shipped stack registers a RestSystem");
            Assert.That(jobs, Is.GreaterThan(rest),
                "and it registers it BEFORE JobSystem — RW §3.5's Eat ▸ Sleep ▸ … ▸ Work");
        }

        // ==================================================== 6. the Director leg (mutation 6)

        /// <summary>
        /// ⚠️⚠️ <b>CHARTER MUTATION 6 — THE THIRD PIN CAUSE, AND THE ONE THAT IS EASY TO MISS.</b>
        /// Removing the permanent fatigue deficit raises <see cref="Citizen.Mood"/>, which raises
        /// <c>ShipMetrics.Morale</c>, which lowers <c>DirectorSystem</c>'s tension, which moves
        /// <c>WearPressure</c>, which scales <c>MachineWearSystem</c> — so
        /// <b>MACHINE WEAR RATES CHANGE ON EVERY SHIP IN THE REPO.</b> This leg asserts that
        /// out loud so that nobody "discovers" it later as an unexplained pin move.
        ///
        /// <para>Driven on the WHOLE SHIPPED STACK (<c>SystemStack.CreateDefault</c>) against a defs
        /// graph whose only difference is a sleep trigger placed out of reach — i.e. the pre-M3-9
        /// world, expressed as data. The observable is a <c>Device.Condition</c>, the far end of the
        /// chain, not the Director's own field: an assertion on <c>WearPressure</c> alone would pass
        /// on a build where the lever moved and nothing consumed it.</para>
        ///
        /// <para>⚠️ <b>THE DIRECTION READS BACKWARDS AND IS CORRECT.</b> Rested crew are HAPPIER, so
        /// tension is LOWER, and <c>DirectorSystem</c>'s lever <i>"below target (quiet) BUILDS toward
        /// the max"</i> — so a well-rested ship wears its machines FASTER. That is the Director's
        /// shipped design (a quiet ship gets more trouble), not a sign inversion here.</para>
        /// </summary>
        [Test]
        public void TheWearPath_ACTUALLY_Moves_WhenFatigueFalls()
        {
            const int Window = 20_000; // ~33 sim-minutes; 200 Director periods

            (float condition, float tension, ulong director, float fatigue) Run(SimDefs defs)
            {
                var moss = new ScriptRuntime(new DeviceRegistry());
                var sim = new Simulation(AsciiWorld.Build(HallMap), 11,
                                         SystemStack.CreateDefault(moss), defs);

                // ⚠️ THE MACHINE MUST BE POWERED OR IT DOES NOT WEAR AT ALL — MachineWearSystem only
                // charges an OPERATING device, and the first draft of this leg measured Condition
                // 1.0 in BOTH runs and would have "proved" pin-neutrality on a machine that was
                // never running. Solar + a conduit run, DefsEquivalenceTests' pattern.
                for (int x = 12; x <= 16; x++)
                    sim.AddDevice(DeviceKind.Conduit, new Int3(x, 3, 0), "c" +
                        x.ToString(System.Globalization.CultureInfo.InvariantCulture));
                sim.AddDevice(DeviceKind.SolarWing, new Int3(12, 2, 0), "solar");
                var machine = sim.AddDevice(DeviceKind.Scrubber, new Int3(16, 2, 0), "scrubber");
                sim.AddDevice(DeviceKind.Bed, BunkTile, "bunk_a");

                // ⚠️⚠️ AND THE OTHER THREE DEFICITS MUST BE SATISFIED. DirectorSystem's tension is
                // 0.4·(1−Morale) + 0.2·(1−Water) + 0.2·(1−Food) + 0.2·(1−Power); with no tank, no
                // potatoes and an unpowered ship those three terms alone sum to 0.6, past
                // LeverTargetTension (0.35), so the lever RELEASES and clamps at its 1.0 floor in
                // both runs — a leg that would have reported "the wear path did not move" while the
                // path was merely saturated. MEASURED: that was this leg's first draft.
                sim.AddDevice(DeviceKind.WaterTank, new Int3(6, 1, 0), "tank").StoredLiters =
                    sim.Defs.Water.TankCapacityLiters;
                sim.AddItem(ItemKind.Potato, 5, new Int3(6, 2, 0));

                sim.Rooms.SetAnchor("hall", PawnStart);
                sim.Rooms.RecomputeIfDirty(sim);
                RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, PawnStart)); // keep her alive
                // TIRED AT BOOT so this leg does not wait out the 12-hour ramp. Work stays OFF
                // (OD-H's default): the ONLY difference between the runs is whether she may sleep.
                var pawn = sim.AddCitizen("Rell", PawnStart);
                pawn.Fatigue = 0.9f;

                for (int t = 0; t < Window; t++) sim.Tick();

                DirectorSystem director = null;
                foreach (var system in sim.Systems)
                    if (system is DirectorSystem d) { director = d; break; }
                Assert.That(director, Is.Not.Null, "fixture: the shipped stack registers a Director");
                Assert.That(machine.Powered, Is.True,
                    "control: the scrubber is on a live network, so MachineWearSystem charges it");
                Assert.That(machine.Condition, Is.LessThan(1f),
                    "control: the machine really wore — an unworn machine cannot show a RATE change");
                return (machine.Condition, director.Tension, director.StateChecksum(), pawn.Fatigue);
            }

            SimDefs NeverSleeps(SimDefs defs)
            {
                defs.Needs.FatigueRestThreshold = 2f; // unreachable: Fatigue clamps at 1
                defs.ComputeChecksum();
                return defs;
            }

            var shipped = Run(SimDefs.CreateDefault());
            var preM39 = Run(NeverSleeps(SimDefs.CreateDefault()));

            Assert.That(shipped.fatigue, Is.LessThan(preM39.fatigue),
                "control: the shipped run's crew member really slept (" +
                shipped.fatigue.ToString(System.Globalization.CultureInfo.InvariantCulture) + " vs " +
                preM39.fatigue.ToString(System.Globalization.CultureInfo.InvariantCulture) + ")");

            // ---- (a) THE CHAIN IS LIVE, AND THE DIRECTOR'S OWN HASHED STATE IS WHERE IT SHOWS.
            // Tension is recomputed from ShipMetrics every cadenced pass and is one of the four
            // floats DirectorSystem.CaptureState writes — i.e. it folds into Simulation.StateHash
            // through IStatefulSystem. This is a DIRECT observation of one of PIN M3-c's causes.
            Assert.That(shipped.tension, Is.Not.EqualTo(preM39.tension),
                "crew who sleep are less miserable, so ShipMetrics.Morale rises and the Director's " +
                "tension falls. shipped=" +
                shipped.tension.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                " pre-M3-9=" + preM39.tension.ToString(System.Globalization.CultureInfo.InvariantCulture));
            Assert.That(shipped.director, Is.Not.EqualTo(preM39.director),
                "and it reaches the HASH: DirectorSystem is an IStatefulSystem, so its checksum is " +
                "folded into Simulation.StateHash on every ship — this is P1 moving, in miniature");

            // ---- (b) AND IT REACHES THE MACHINES. ⚠️ ON THE SHIPPED DEFS IT DOES NOT SHOW HERE, AND
            // THAT IS A REAL FINDING RATHER THAN A WEAKER ASSERTION: MEASURED, both runs' WearPressure
            // sits at director.def's MaxWearPressure of 1.35 — a quiet ship (tension ~0.207 against a
            // 0.35 target) drives the lever onto its stop within ~2 500 ticks, so the morale term
            // stops reaching wear the moment the lever saturates. The ceiling is raised in BOTH defs
            // graphs — DISCLOSED, and equally on both sides — purely so the accumulating difference is
            // observable at all. ⛔ Do not read this as "wear does not change in the shipped game":
            // the lever is off its stop on any ship that is not quiet, and P1's own 2×2 moved.
            SimDefs Unclamped(SimDefs defs)
            {
                defs.Director.MaxWearPressure = 10f;
                defs.ComputeChecksum();
                return defs;
            }

            var shippedFree = Run(Unclamped(SimDefs.CreateDefault()));
            var preM39Free = Run(Unclamped(NeverSleeps(SimDefs.CreateDefault())));
            Assert.That(shippedFree.condition, Is.Not.EqualTo(preM39Free.condition),
                "PIN M3-c's THIRD CAUSE, AT THE FAR END: WearPressure scales MachineWearSystem, so " +
                "with the lever off its stop a ship whose crew sleep wears its machines at a " +
                "different rate. shipped=" +
                shippedFree.condition.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                " pre-M3-9=" + preM39Free.condition.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ". If this goes green as an equality the mood->economy chain has been cut and " +
                "MECHANICS §13.40 is wrong.");
        }

        // ==================================================== 7. save

        /// <summary>
        /// <see cref="JobKind.Sleep"/> is a new value of an ALREADY saved, ALREADY hashed byte — no
        /// chapter bump, no fold change. Driven anyway, because "it is just an enum value" is exactly
        /// the claim that hides a reader clamping an unknown kind: a sleeping crew member must come
        /// back off disk still asleep, and the restored sim must hash equal.
        /// </summary>
        [Test]
        public void ASleepingCrewMember_SurvivesASaveRoundTrip()
        {
            var sim = NewSim();
            Bunk(sim);
            var pawn = TiredPawn(sim, 0.9f);
            DriveToAsleep(sim, pawn);
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Sleep));

            using var buffer = new System.IO.MemoryStream();
            SaveWriter.Write(sim, buffer);
            buffer.Position = 0;
            var restored = SaveReader.Read(buffer, new ISimSystem[]
            {
                new CitizenSystem(), new RestSystem(), new JobSystem(),
                new CraftingSystem(), new MaintenanceSystem(), new DeconstructSystem(),
            });

            var back = restored.Citizens.Items[0];
            Assert.That(back.JobKind, Is.EqualTo(JobKind.Sleep), "she must come back off disk asleep");
            Assert.That(back.Fatigue, Is.EqualTo(pawn.Fatigue),
                "and at exactly the tiredness she went to sleep with");
            Assert.That(restored.StateHash(), Is.EqualTo(sim.StateHash()),
                "a load must hash equal — JobKind rides the CITZ chapter and the citizen fold already");
        }
    }
}
