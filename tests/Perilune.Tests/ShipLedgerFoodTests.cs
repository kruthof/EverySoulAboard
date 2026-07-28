using System;
using System.Globalization;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Gen;
using Perilune.Tools;
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-9 — THE FOOD GAP (`ECONOMY-PLAN.md` §1, the ⚑ carried row).
    ///
    /// <para><c>ShipMetrics.Food</c> is <c>min(1, potatoes/(crew*5))</c>: clamped, so a full larder
    /// and a nearly empty one both read 1.000, and it divides by the entity store's crew count, which
    /// includes the dead. It is read inside <c>DirectorSystem.Tick</c> and folded into
    /// <c>Simulation.StateHash</c>, so IT IS NOT TOUCHED HERE — correcting it is a pin move and a
    /// separate, deliberate package. What ships instead is an honest number BESIDE it, on the ledger,
    /// exactly as <c>ShipSystems.Compute</c> sits beside <c>ShipMetrics</c>.</para>
    ///
    /// <para><b>EVERY TEST BELOW IS DRIVEN.</b> Nothing greps a source file; the fixtures build real
    /// sims, tick them, and read what the ledger says. The load-bearing one is
    /// <see cref="DaysOfFood_PREDICTS_TheSim_TheLarderEmptiesWhenItSaysItWill"/>, which runs the
    /// clock and checks the larder empties when the number said it would — the anti-tautology rule at
    /// `ECONOMY-PLAN.md` §5.2.1, since a test that re-evaluates the implementation's own expression
    /// would assert only that a function equals itself.</para>
    /// </summary>
    [TestFixture]
    public class ShipLedgerFoodTests
    {
        private const long TicksPerDay = 864000L;   // Simulation.TicksPerSecond * 60 * 60 * 24

        /// <summary>
        /// A sim on the reference ship with a FRESH, tuned <see cref="SimDefs"/>.
        ///
        /// <para>⚠️ IT MUST NOT GO THROUGH <c>SimHost.Build</c>. That helper's <c>LoadDefs</c> returns
        /// the SHARED STATIC <see cref="SimDefs.Default"/> whenever the data directory is missing or
        /// unlistable (<c>hosts/tui/SimHost.cs:247,251</c>), so mutating <c>sim.Defs</c> on a sim it
        /// built would retune every other test in the process — silently, and only on the machines
        /// that take that branch. <see cref="SimDefs.CreateDefault"/> hands back a private instance;
        /// this is the only safe way to vary a def in a test.</para>
        /// </summary>
        private static Simulation TunedShip(Action<SimDefs> tune)
        {
            var defs = SimDefs.CreateDefault();
            tune(defs);
            var plan = AuthoredShips.Perilune();
            plan.Seed = 42;
            return GenSimHost.Build(plan, defs).Sim;
        }

        private static Simulation Stock() => TunedShip(_ => { });

        /// <summary>Empty the ship of items so a fixture's own stacks are the whole census.</summary>
        private static void ClearItems(Simulation sim)
        {
            var items = sim.Items.Items;
            for (int i = items.Count - 1; i >= 0; i--) sim.Items.Remove(items[i].Id);
        }

        /// <summary>Stop the growbeds. A hydroponics bay that keeps dropping potatoes into the
        /// fixture would mask consumption, and on `--ship grid` it genuinely out-produces the crew —
        /// which is a real property of the ship and the reason the FOOD row does not alarm.</summary>
        private static void RemoveGrowBeds(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = devices.Count - 1; i >= 0; i--)
                if (devices[i].Kind == DeviceKind.GrowBed) sim.Devices.Remove(devices[i].Id);
        }

        private static void Advance(Simulation sim, long ticks)
        {
            for (long t = 0; t < ticks; t++) sim.Tick();
        }

        private static int LivingCrew(Simulation sim)
        {
            int n = 0;
            var c = sim.Citizens.Items;
            for (int i = 0; i < c.Count; i++) if (!c[i].Dead) n++;
            return n;
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // THE ANCHOR — the number predicts the simulation
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// <b>DAYS OF FOOD PREDICTS THE SIM.</b> Stock the larder with exactly the ledger's stated
        /// runway, run the clock that far, and the larder is empty; run half of it and it is not.
        /// The assertion is about the SHIP's behaviour, never about the formula's arithmetic.
        ///
        /// <para>The defs are retuned to make the run cheap and the numbers round — hunger fills in
        /// 864 s instead of two sim-days, and one unit removes half a meter — so the whole prediction
        /// is 0.1 sim-day of ticks. The RATIO under test is untouched by that: the claim is "stock
        /// ÷ modelled consumption is the day the food runs out", and it is checked at the tuning the
        /// fixture declares.</para>
        ///
        /// <para>Tolerance is ONE SERVING PER CREW MEMBER, and that is a real property rather than
        /// slack: crew eat in lumps only once Hunger passes <c>need_threshold</c>, so the last
        /// serving's worth of hunger is sitting in the meters rather than in the larder. The rate is
        /// a long-run average and this test says so.</para>
        ///
        /// <para><b>⚠️ THIS LEG HAD A HOLE IN IT AND SHIPPED GREEN OVER A 2× ERROR.</b> Recorded here
        /// as what it was, because the first write-up got it wrong in the direction that stops people
        /// looking. That draft said a 2× mutation "only just bites, so the harness uses 4×" — filing a
        /// DEFECT IN THE GUARD as a preference about mutation choice. It was not. With the HALF leg
        /// asserting a bare <c>FoodUnits &gt; 0</c>, doubling <c>DaysOfFood</c> passed the WHOLE GATE
        /// — independent review applied <c>86400.0 → 43200.0</c> to
        /// <see cref="ShipLedger.FoodUnitsPerCrewPerDay"/> on a pristine copy and measured 1104 dotnet
        /// + 806 node, all green. A 2× error in the one quantity this package exists to correct, and
        /// the package's own anchor could not see it. The floor below closes it; the reasoning is at
        /// the assertion.</para>
        ///
        /// <para><b>AND THE FLOOR IS PROVEN LOAD-BEARING, by INCLUSION rather than by argument</b> —
        /// four cells, each run on this fixture: shipped tree GREEN · the 2× mutation alone RED (1/7)
        /// · <b>the 2× mutation WITH the floor regressed to <c>&gt; 0</c> GREEN</b> · the floor
        /// regressed alone GREEN. The third cell is the one that matters: it says nothing else in the
        /// suite can see a 2× over-statement, so this assertion is the whole guard and not a
        /// belt-and-braces addition. The fourth says the floor has real margin and is not a
        /// tripwire waiting to fire on correct code.</para>
        ///
        /// <para>BOTH LEGS PROVEN INDIVIDUALLY, which matters because <c>assert</c> throws and only
        /// the first failing leg ever reports:</para>
        /// MUTATION A (applied, RED n=1, reverted): <c>86400.0 → 43200.0</c> in
        /// <c>FoodUnitsPerCrewPerDay</c> — the 2× OVER-statement review found — ⇒ the HALF leg fires
        /// on an empty larder. This is the mutation the leg exists for.
        /// MUTATION A′ (applied, RED n=1, reverted): quarter <c>crewFoodPerDay</c> ⇒ the same leg,
        /// from further away.
        /// MUTATION B (applied, RED n=1, reverted): double <c>crewFoodPerDay</c> ⇒ the claim is half
        /// what it should be, the HALF leg passes untouched, and the FULL leg fires on a larder still
        /// stocked.
        /// </summary>
        [Test]
        public void DaysOfFood_PREDICTS_TheSim_TheLarderEmptiesWhenItSaysItWill()
        {
            // 1 hunger meter per 864 s ⇒ 100 meters per sim-day; one unit removes 0.5 ⇒ 200 units per
            // crew member per sim-day. `need_threshold` stays at its shipped 0.5, which is exactly one
            // serving, so a crew member eats the instant a serving's worth of hunger has accrued.
            var sim = TunedShip(d =>
            {
                d.Needs.HungerPerSecond = 1f / 864f;
                d.Sustenance.PotatoHungerValue = 0.5f;
            });
            ClearItems(sim);
            RemoveGrowBeds(sim);

            int crew = LivingCrew(sim);
            Assert.That(crew, Is.GreaterThan(0), "the reference ship must have crew, or this is vacuous");

            // Enough for exactly 0.1 sim-day at 200 units per crew per day.
            int stock = (int)Math.Round(200.0 * crew * 0.1);
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                citizens[i].Hunger = 0f;                       // known phase, so the lumps line up
                // Underfoot: these crew are HoldPosition, so they eat what is at hand.
                sim.AddItem(ShipLedger.FoodKind, stock / crew + (i == 0 ? stock % crew : 0), citizens[i].Pos);
            }

            var start = ShipLedger.Sample(sim);
            Assert.That(start.FoodUnits, Is.EqualTo(stock), "PRECONDITION: the larder is exactly the fixture's");
            Assert.That(start.DaysOfFood, Is.GreaterThan(0), "PRECONDITION: the ledger states a runway");

            // ⚠️ THE CLOCK IS DRIVEN OFF THE LEDGER'S OWN CLAIM, and an earlier draft's
            // `Assert(DaysOfFood == 0.1)` is deliberately GONE. That assertion re-evaluated the
            // implementation's expression (the anti-tautology rule) AND it made both legs below
            // unprovable: any mutation to the number tripped the precondition first, so a dead leg
            // would have looked exactly like a live one. Advancing by whatever the ledger claims
            // turns each leg into a real statement about the ship.
            long claimedTicks = (long)(TicksPerDay * start.DaysOfFood);
            Assert.That(claimedTicks, Is.GreaterThan(1000), "PRECONDITION: a runway long enough to halve");

            // HALF the claimed runway: MOST of the larder must remain, or the claim is too LONG.
            //
            // ⚠️ THE FLOOR IS PROPORTIONAL, AND `Is.GreaterThan(0)` — WHICH IS WHAT THIS LEG SAID
            // FIRST — LEFT A 2× OVER-STATEMENT OF `DaysOfFood` PASSING THE ENTIRE GATE. Found in
            // independent review, not here: the reviewer applied `86400.0 → 43200.0` to
            // `FoodUnitsPerCrewPerDay` on a pristine copy and ran everything — 1104 dotnet, 806 node,
            // all green. A 2× error in the exact quantity this package exists to correct.
            //
            // WHY A BARE `> 0` CANNOT CATCH IT, and why tightening the tolerance would not have
            // helped either. Halving the modelled rate doubles the claim, so HALF of the claim is
            // EXACTLY the true runway — the point at which the larder empties by construction. The
            // leg then survives on float epsilon rather than on evidence. Every other assertion in
            // this file is a RATIO (kill half the crew, double the runway; twice as hungry, half the
            // runway) and a ratio is scale-invariant, so this anchor is the package's only
            // absolute-scale pin and it was the one with the hole in it.
            //
            // THE FLOOR, DERIVED AND THEN MEASURED. Derived: at the fixture's declared tuning the
            // crew eat 200 u/crew/sim-day and hold 0.1 sim-day of food, so at HALF the correct claim
            // about half the larder is gone — ~50 %, rising toward 55 % once lump quantisation and
            // the `NeedsSystem` door-tile skip are counted, both of which push consumption DOWN and
            // so widen this margin rather than eat it. MEASURED, by raising the floor to 0.99 and
            // reading the leg's own failure message: **22 of 40 units, 55.0 %** — the top of the
            // derived range. Under the 2× mutation the larder is at 0 %. A 30 % floor therefore sits
            // 25 points below the true value and 30 points above the mutant's.
            Advance(sim, claimedTicks / 2);
            var half = ShipLedger.Sample(sim);
            int floor = (int)(stock * 0.30);
            Assert.That(half.FoodUnits, Is.GreaterThan(floor),
                "at half the claimed runway only " + half.FoodUnits + " of " + stock + " units are " +
                "left, under the " + floor + "-unit floor. DAYS OF FOOD OVER-STATES what the crew can " +
                "eat, so the row is promising food that is not there. A 2× over-statement lands here " +
                "at ZERO and is invisible to a bare `> 0`.");

            // The FULL claimed runway: the larder is empty but for the servings still in the meters.
            Advance(sim, claimedTicks - claimedTicks / 2);
            var end = ShipLedger.Sample(sim);
            Assert.That(end.FoodUnits, Is.LessThanOrEqualTo(crew),
                "after exactly the claimed runway the larder must be gone (bar at most one serving per " +
                "crew member still sitting in a Hunger meter). " + end.FoodUnits + " units of " + stock +
                " left means the crew eat SLOWER than DAYS OF FOOD claims and the row UNDER-STATES the " +
                "ship's runway — which is the 2× error E0-9 found in the scenario harness.");
        }

        /// <summary>
        /// <b>THE 2× BUG, PINNED.</b> The derivation must read the rate Hunger FILLS
        /// (<c>needs.def hunger_per_second</c>), not only the Hunger one unit removes. The shipped
        /// <c>LedgerHarness</c> read only the latter and justified it in a comment as "hunger fills
        /// once per sim-day"; it fills once per TWO sim-days, so that harness under-reported every
        /// food runway by exactly 2×.
        ///
        /// <para>Driven, and it discriminates: two sims identical but for
        /// <c>hunger_per_second</c>, same larder, same crew. A derivation that ignores the ramp gives
        /// them the SAME answer.</para>
        ///
        /// MUTATION (applied, RED, reverted): replace <c>hungerPerDay / perUnit</c> with
        /// <c>1.0 / perUnit</c> in <c>ShipLedger.FoodUnitsPerCrewPerDay</c> — i.e. restore the exact
        /// expression the harness shipped ⇒ both legs read the same and this fails.
        /// </summary>
        [Test]
        public void DaysOfFood_ReadsTheRateHungerFills_NotOnlyWhatOneUnitRemoves()
        {
            const int Stock = 600;

            var slow = TunedShip(d => d.Needs.HungerPerSecond = 1f / 172_800f);   // the shipped value
            var fast = TunedShip(d => d.Needs.HungerPerSecond = 1f / 86_400f);    // twice as hungry

            foreach (var sim in new[] { slow, fast })
            {
                ClearItems(sim);
                sim.AddItem(ShipLedger.FoodKind, Stock, sim.Citizens.Items[0].Pos);
            }

            double slowDays = ShipLedger.Sample(slow).DaysOfFood;
            double fastDays = ShipLedger.Sample(fast).DaysOfFood;

            Assert.That(slowDays, Is.GreaterThan(0), "PRECONDITION: the shipped tuning yields a runway");
            Assert.That(fastDays, Is.EqualTo(slowDays / 2.0).Within(1e-9),
                "a crew that gets hungry twice as fast eats twice as much, so the same larder must " +
                "last exactly half as long. Equal answers mean the derivation never looked at " +
                "needs.def hunger_per_second — the defect that made the scenario harness under-report " +
                "every food runway by 2× (211 potatoes on --ship grid read 9.5 days; the truth is 19.0).");

            // …and the shipped tuning really is the 2-day one, so the bug above was reachable and not
            // a hypothetical. (An INCLUSION check: without it, a future retune to a 1-day meter would
            // make the harness's old formula accidentally correct and this test's story stale.)
            Assert.That(SimDefs.Default.Needs.HungerPerSecond, Is.EqualTo(1f / 172_800f).Within(1e-12),
                "the shipped Hunger meter fills in TWO sim-days, which is what makes the naive " +
                "1/potato_hunger_value derivation wrong by 2×");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // The denominator, and what it refuses to answer
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// The runway divides by the LIVING crew and reports -1 — not 0, not ∞ — when nobody is left
        /// to eat. This is the <see cref="ShipMetrics"/> audit finding that Food divides by
        /// <c>Citizens.Items.Count</c> (which never drops, <c>NeedsSystem.cs:198</c>), not repeated.
        ///
        /// <para>THE TWO LEGS ARE BLINDED FROM EACH OTHER, because <c>assert</c> throws and a
        /// multi-leg test otherwise reports only its first failure — a dead second leg is
        /// indistinguishable from a live one. Each leg builds its own sim and each is proven to fire
        /// alone (see the MUTATION lines).</para>
        ///
        /// MUTATION A (applied, RED n=1, reverted): divide by <c>sim.Citizens.Items.Count</c> instead
        /// of the <c>!Dead</c> count ⇒ LEG 1 fires (the runway does not move when half the crew die).
        /// MUTATION A′ (applied, RED n=1, reverted): drop the crew multiplier altogether ⇒ LEG 1
        /// fires the same way, from a different direction.
        /// MUTATION B (applied, RED n=1, reverted): return <c>0</c> instead of <c>-1</c> when
        /// <c>crewFoodPerDay</c> is 0 ⇒ LEG 1 is untouched and passes; LEG 2 fires alone.
        /// </summary>
        [Test]
        public void DaysOfFood_DividesByLivingCrew_AndRefusesToAnswerWithNobodyAboard()
        {
            // ── leg 1: killing half the crew doubles the runway ──
            {
                var sim = Stock();
                ClearItems(sim);
                sim.AddItem(ShipLedger.FoodKind, 600, sim.Citizens.Items[0].Pos);
                int crew = LivingCrew(sim);
                Assert.That(crew, Is.GreaterThanOrEqualTo(2), "PRECONDITION: at least two crew to halve");

                double before = ShipLedger.Sample(sim).DaysOfFood;
                int toKill = crew / 2;
                for (int i = 0, killed = 0; i < sim.Citizens.Items.Count && killed < toKill; i++)
                    if (!sim.Citizens.Items[i].Dead) { sim.Citizens.Items[i].Dead = true; killed++; }

                var after = ShipLedger.Sample(sim);
                Assert.That(after.LivingCrew, Is.EqualTo(crew - toKill), "PRECONDITION: the crew really fell");
                Assert.That(after.DaysOfFood, Is.EqualTo(before * crew / (crew - toKill)).Within(1e-9),
                    "the same larder must feed fewer mouths for proportionally longer. Dividing by the " +
                    "entity store's count instead would leave this unchanged — the exact bug the audit " +
                    "names in ShipMetrics.Food.");
            }

            // ── leg 2: nobody alive ⇒ -1, the house "no meaningful value" sentinel ──
            {
                var sim = Stock();
                ClearItems(sim);
                sim.AddItem(ShipLedger.FoodKind, 600, sim.Citizens.Items[0].Pos);
                for (int i = 0; i < sim.Citizens.Items.Count; i++) sim.Citizens.Items[i].Dead = true;

                var sample = ShipLedger.Sample(sim);
                Assert.That(sample.LivingCrew, Is.EqualTo(0), "PRECONDITION: nobody alive");
                Assert.That(sample.FoodUnits, Is.EqualTo(600), "…and the food is still aboard");
                Assert.That(sample.DaysOfFood, Is.EqualTo(-1),
                    "with nobody to eat there is no denominator. 0 would read as 'the food runs out " +
                    "today' and any positive number would read as a forecast for a crew that does not " +
                    "exist; -1 is this ledger's 'no meaningful value'.");
            }
        }

        /// <summary>
        /// <c>FoodUnits</c> is the census of <see cref="ShipLedger.FoodKind"/> and nothing else, and
        /// it counts CARRIED stacks — which is why the row is an UPPER BOUND and the derivation note
        /// says so: <c>SustenanceSystem</c> skips <c>CarriedBy != 0</c>, so a potato in a hauler's
        /// hands is counted here and is not food a hungry crew member can reach.
        ///
        /// <para>Legs blinded from each other; each proven to fire alone.</para>
        ///
        /// MUTATION A (applied, RED, reverted): count <see cref="ItemKind.Scrap"/> into
        /// <c>foodUnits</c> ⇒ leg 1 fails.
        /// MUTATION B (applied, RED, reverted): skip <c>CarriedBy != 0</c> stacks in the item pass ⇒
        /// leg 2 fails.
        /// </summary>
        [Test]
        public void FoodUnits_IsTheFoodKindOnly_AndCountsCarriedStacksSoItIsAnUpperBound()
        {
            // ── leg 1: only the food kind ──
            {
                var sim = Stock();
                ClearItems(sim);
                var pos = sim.Citizens.Items[0].Pos;
                sim.AddItem(ShipLedger.FoodKind, 7, pos);
                sim.AddItem(ItemKind.Scrap, 500, pos);
                sim.AddItem(ItemKind.Regolith, 500, pos);

                var s = ShipLedger.Sample(sim);
                Assert.That(s.FoodUnits, Is.EqualTo(7),
                    "FoodUnits must be the census of ShipLedger.FoodKind alone — 1,000 units of scrap " +
                    "and regolith are not dinner");
                Assert.That(s.FoodUnits, Is.EqualTo(s.UnitsOf(ShipLedger.FoodKind)),
                    "…and it must be the same number the per-kind census reports for that kind");
            }

            // ── leg 2: a carried stack still counts, so the row over-states what is edible ──
            {
                var sim = Stock();
                ClearItems(sim);
                var pos = sim.Citizens.Items[0].Pos;
                sim.AddItem(ShipLedger.FoodKind, 10, pos);
                var carried = sim.AddItem(ShipLedger.FoodKind, 5, pos);
                carried.CarriedBy = 4242u;

                Assert.That(ShipLedger.Sample(sim).FoodUnits, Is.EqualTo(15),
                    "food in a hauler's hands has not left the ship, so the census counts it — which " +
                    "is precisely why the derivation note calls this row an UPPER BOUND on what a " +
                    "hungry crew member can actually reach");
            }
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // ONE derivation — the wire, the harness and the island all quote the same number
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// THE ANTI-TRANSCRIPTION GUARD. <c>LedgerHarness</c>'s honesty table used to compute its own
        /// food runway; E0-9 deleted that expression rather than moving it, and this pins that the
        /// harness now prints the LEDGER's number.
        ///
        /// <para><b>THE FIXTURE IS BUILT TO DISCRIMINATE.</b> With the shipped defs the retired
        /// expression (<c>1 / potato_hunger_value</c>) and the live one differ by exactly 2×, so a
        /// harness that quietly kept its own copy prints a visibly different figure. The assertion is
        /// on the harness's own rendered text, which is what a reader of that table actually reads.</para>
        ///
        /// MUTATION (applied, RED, reverted): restore <c>double foodDays = potatoes / (living *
        /// (1.0 / defs.Sustenance.PotatoHungerValue));</c> in <c>LedgerHarness.Audit</c> ⇒ the
        /// rendered figure halves and this fails.
        /// </summary>
        [Test]
        public void TheScenarioHarness_QuotesTheLedgersFoodNumber_AndNoLongerDerivesItsOwn()
        {
            var sim = Stock();
            ClearItems(sim);
            sim.AddItem(ShipLedger.FoodKind, 600, sim.Citizens.Items[0].Pos);

            var sample = ShipLedger.Sample(sim);
            Assert.That(sample.DaysOfFood, Is.GreaterThan(0), "PRECONDITION: a real runway to quote");

            string expected = sample.DaysOfFood.ToString("0.0", CultureInfo.InvariantCulture);
            string retired = (sample.FoodUnits /
                              (sample.LivingCrew * (1.0 / SimDefs.Default.Sustenance.PotatoHungerValue)))
                             .ToString("0.0", CultureInfo.InvariantCulture);
            Assert.That(retired, Is.Not.EqualTo(expected),
                "NON-VACUITY: the retired expression must give a DIFFERENT answer on this fixture, or " +
                "the assertion below would pass whichever derivation the harness used");

            string row = null;
            foreach (var a in LedgerHarness.Audit(sim)) if (a.Name == "Food") row = a.Truth;
            Assert.That(row, Is.Not.Null, "the honesty table must still carry a Food row");
            Assert.That(row, Does.Contain(expected + " days"),
                "the harness must print the ledger's own DaysOfFood. It read '" + row + "'; the ledger " +
                "says " + expected + " and the retired local derivation would say " + retired + ". Two " +
                "derivations of one number is how the 2× error survived in the first place.");
            Assert.That(row, Does.Contain(sample.FoodUnits.ToString(CultureInfo.InvariantCulture)));
        }

        /// <summary>
        /// THE CHANNEL. Both food members reach the wire, InvariantCulture, in the documented shape.
        /// The dev machine is de-DE, where a bare <c>ToString()</c> puts a comma inside a JSON number.
        ///
        /// <para>Legs blinded; each proven to fire alone.</para>
        ///
        /// MUTATION A (applied, RED, reverted): drop the <c>foodUnits</c> append ⇒ leg 1 fails.
        /// MUTATION B (applied, RED, reverted): drop the <c>daysOfFood</c> field ⇒ leg 2 fails.
        /// MUTATION C (applied, RED, reverted): serialize <c>daysOfFood</c> with a bare
        /// <c>ToString()</c> ⇒ leg 3 fails under de-DE.
        /// </summary>
        [Test]
        public void TheLedgerChannel_CarriesTheFoodPair_InInvariantCulture()
        {
            // ⚠️ 601, NOT 600, AND THE ODD NUMBER IS LOAD-BEARING. On this ship 600 units divide out
            // to EXACTLY 216 days, a whole number — which prints with no decimal separator at all, so
            // the culture leg below could not have told InvariantCulture from de-DE. It was written
            // with 600 first and the mutation "serialize daysOfFood with a bare ToString()" SURVIVED.
            // A culture guard needs a value with a fractional part.
            var sim = Stock();
            ClearItems(sim);
            sim.AddItem(ShipLedger.FoodKind, 601, sim.Citizens.Items[0].Pos);
            var report = ShipLedger.Report(ShipLedger.Sample(sim), default);
            string expected = report.Now.DaysOfFood.ToString("0.####", CultureInfo.InvariantCulture);
            Assert.That(expected, Does.Contain("."),
                "NON-VACUITY for leg 3: the fixture's runway must have a fractional part, or a " +
                "culture-sensitive serializer is indistinguishable from an invariant one");

            // ── leg 1: the stock ──
            {
                string json = WireFormat.Ledger(report);
                Assert.That(json, Does.Contain("\"foodUnits\":601"),
                    "the island renders the stock in its value slot; without it the row is a bare " +
                    "quotient with nothing to check it against");
            }

            // ── leg 2: the runway. Rendered UNDER InvariantCulture on purpose, so that leg 3 —
            // and only leg 3 — is the one that can see a culture-sensitive serializer. This dev
            // machine is de-DE, so without the pin leg 2 would swallow the culture mutation and
            // leg 3 could never be proven to bite. ──
            {
                var prior = System.Threading.Thread.CurrentThread.CurrentCulture;
                try
                {
                    System.Threading.Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                    Assert.That(WireFormat.Ledger(report), Does.Contain("\"daysOfFood\":" + expected));
                }
                finally { System.Threading.Thread.CurrentThread.CurrentCulture = prior; }
            }

            // ── leg 3: culture. Asserted on the FOOD member specifically, not on whole-payload
            // equality: a whole-payload compare passes as soon as ANY other field is invariant, which
            // is a right answer arriving from an unrelated code path. ──
            {
                var prior = System.Threading.Thread.CurrentThread.CurrentCulture;
                try
                {
                    System.Threading.Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                    string german = WireFormat.Ledger(report);
                    Assert.That(german, Does.Contain("\"daysOfFood\":" + expected),
                        "a de-DE decimal comma inside a JSON number is a payload no client can parse, " +
                        "and this dev machine IS de-DE");
                }
                finally { System.Threading.Thread.CurrentThread.CurrentCulture = prior; }
            }
        }

        /// <summary>
        /// The member carries its LIMITS with it (the DA-M3 rule): <c>days_of_food</c> is in
        /// <see cref="ShipLedger.Ids"/>, so the wire's <c>notes</c> block carries a derivation the
        /// island hangs on the row's hover — and the note states the three things that make the
        /// number misreadable if omitted.
        ///
        /// MUTATION (applied, RED, reverted): remove <c>IdDaysOfFood</c> from <c>Ids</c> ⇒ the note
        /// never reaches the wire and this fails.
        /// </summary>
        [Test]
        public void TheFoodMemberShipsItsLimitsBesideIt()
        {
            Assert.That(ShipLedger.Ids, Does.Contain(ShipLedger.IdDaysOfFood),
                "a member absent from Ids ships no note, and a bare 'FOOD 19.0 d' is read as a forecast");
            string note = ShipLedger.Derivation(ShipLedger.IdDaysOfFood);
            Assert.That(note, Is.Not.Empty);

            // The three limits that make this number misreadable if they travel separately from it.
            Assert.That(note, Does.Contain("MODELLED"),
                "it is not measured — it cannot see the growbeds refilling the larder");
            Assert.That(note, Does.Contain("upper bound"),
                "it counts carried and reserved stacks, which a hungry crew member cannot take");
            Assert.That(note, Does.Contain("ShipMetrics.Food"),
                "the player must be told this is NOT the clamped bar the Director reads");

            var sim = Stock();
            string json = WireFormat.Ledger(ShipLedger.Report(ShipLedger.Sample(sim), default));
            Assert.That(json, Does.Contain("\"days_of_food\""),
                "…and the note must actually reach the wire, not merely exist in the sim assembly");
        }
    }
}
