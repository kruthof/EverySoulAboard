using System;
using System.Collections.Generic;
using System.Globalization;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M2-12 — GENERATION RIDES <see cref="Device.EffectiveRate"/>.</b> Before this package
    /// <c>PowerSystem.Balance</c> summed the flat <c>machines.def</c> <c>gen</c> and said so in its
    /// own comment — <i>"a wrecked SolarWing still supplies its full kW"</i> — so a wing at
    /// Condition 0.06 fed the ship exactly what a wing at 1.00 did and <b>repairing a generator
    /// changed the power ledger by precisely zero</b>. That deleted the owner's own first sentence
    /// about this game: <i>order a repair, the lights come back.</i>
    ///
    /// <para><b>THE RULE.</b> Wear is expressed where a device's output is produced. For a scrubber,
    /// a vent, a radiator or a reclaimer that is the consuming system (all four already multiply by
    /// <see cref="Device.EffectiveRate"/>). <b>For a device whose output IS power, that place is the
    /// power ledger itself</b> — a generator has no downstream system in which its wear could
    /// otherwise be expressed.</para>
    ///
    /// <para>⛔ <b>TWO RULINGS ARE PINNED HERE AS NEGATIVE LEGS, and they are the reason half this
    /// file exists.</b> (8b) <c>IsOperational</c> STAYS OUT of the generation term — its floor is a
    /// CLIFF (a wing below <c>fail</c> would contribute literally nothing) where
    /// <c>EffectiveRate</c>'s floor of 0.5 is a GRADIENT the player can climb one repair at a time;
    /// <see cref="TheCliff_AWingBelowFail_StillContributes_AndTheShipStillBreathes"/> is what makes
    /// "we decided against it" different from "we forgot it" in a diff. (8c) DEMAND STAYS FLAT — a
    /// worn scrubber pays full price for reduced output — pinned by
    /// <see cref="DemandStaysFlat_TheWornShipPaysTheFullBill"/>.</para>
    ///
    /// <para>⚠️ <b>EVERY kW BELOW IS READ AT THE SEAM</b> (<c>PowerSystem.LastGenerationKW</c> /
    /// <c>LastDemandKW</c>), never re-summed from <c>machines.def</c> in the test. A test that
    /// re-derives the tally is a second implementation of the loop under test: it agrees with
    /// whatever it was written against, and a constant factor slipped into
    /// <c>PowerSystem.cs</c>'s generation line would leave it green (CLAUDE.md trap 4).</para>
    ///
    /// <para>⚠️ <b>AND EVERY ASSERTION ON A kW IS A TWO-SIDED ABSOLUTE BAND, NEVER A RATIO AND
    /// NEVER A FLOOR</b> — the seventh trap. A one-sided <c>&gt;= 10.0 kW</c> floor is survived by
    /// a uniform ×1.25 over-statement (10.65 → 13.31) and a ratio suite cannot see a scale error at
    /// all; E0-9's whole gate went green with <c>DaysOfFood</c> 2× wrong. The bands below are
    /// ±0.05 kW around figures measured on THIS tree.</para>
    ///
    /// <para>⭐ <b>THE MUTATION TABLE, PHYSICALLY APPLIED TO <c>PowerSystem.cs</c> AND RECORDED
    /// (2026-07-30).</b> Each row was edited into the shipped tree, this fixture plus
    /// <c>WreckPowerNetworkTests</c> (11 legs) was run, and the tree was restored from an in-memory
    /// copy — never <c>git checkout</c> (TRAPS 2). "RED" is what the run reported, with the figure
    /// the failure message actually carried:</para>
    /// <list type="table">
    ///   <item><b>1</b> revert the <c>EffectiveRate</c> factor ⇒ RED, 7 of 11 — the curve reads
    ///     18.00 kW at boot against the pinned 10.65</item>
    ///   <item><b>2</b> ADD <c>IsOperational</c> to the term ⇒ RED, 6 of 11 — the CLIFF guard
    ///     reports <b>0.00 kW</b> from three inoperative wings and LIFE SUPPORT SHED at sim-hours
    ///     20, 22 and 24; boot falls to 7.47 kW. This is the negative leg, and it fired</item>
    ///   <item><b>3</b> apply <c>EffectiveRate</c> to <c>draw</c> as well ⇒ RED, 3 of 11 —
    ///     LifeSupport demand 4.00 kW (pinned 5.70), Industry 3.61 (6.50), and the benches RUN on a
    ///     wreck with a flat bank</item>
    ///   <item><b>4</b> floor set to <c>Condition</c> instead of <c>0.5 + 0.5·Condition</c> ⇒ RED,
    ///     7 of 11 — three wings at Condition 0.00 feed 0.00 kW where the map says 9.00</item>
    ///   <item><b>5</b> scale generation by 0.8 ⇒ RED, 5 of 11 — 8.52 / 10.78 / 13.92 against
    ///     10.65 / 13.47 / 17.40</item>
    ///   <item><b>5b</b> scale generation by 1.25 ⇒ RED, 7 of 11 — 13.31 / 16.84 / 21.75. <b>Run
    ///     with 5 reverted</b>, and it is the row that decides the shape of the assertion</item>
    /// </list>
    /// <para>⭐ <b>THE FOUR-CELL INCLUSION TABLE for row 5b, on
    /// <see cref="TheAuthoredCurve_Boot_Step_And_TheReachableCeiling"/> alone:</b> (mutation +
    /// band → RED) · (no mutation + band → GREEN) · (mutation + assertion deleted → GREEN) ·
    /// <b>(mutation + band REGRESSED to a one-sided <c>&gt;= 10.0 kW</c> floor → GREEN)</b>. The
    /// last cell is the decisive one: ×1.25 takes 10.65 kW to 13.31, which clears a floor of 10.0
    /// comfortably, so the regressed guard ships a 25 %-over-stated ship green. Run the OTHER way,
    /// the same floor DOES catch ×0.8 (8.52 &lt; 10.0) — a one-sided guard is blind in exactly one
    /// direction and cannot tell you which one. Hence ±0.05, both sides, on every figure.</para>
    ///
    /// <para>⭐ <b>WHY P2 AND P3 DID NOT MOVE, MEASURED — the charter predicted both would.</b>
    /// <c>--ship perilune</c> and <c>--ship slice</c> are <b>bit-identical</b> to the pre-change
    /// tree at tick 3000, where both goldens are taken. Their SolarWings sit at Condition 0.999660
    /// after 300 sim-seconds, so the per-balance-pass energy difference is about 5.7e-7 kWh —
    /// roughly 0.15 ulp of a 34.5 kWh float32 battery accumulator — and every single addition
    /// rounds to the same float. Hash compared at EVERY tick from 3000 to 8000 on both trees:
    /// <b>perilune first diverges at tick 3261</b> (261 ticks = 26.1 sim-s past its golden) and
    /// <b>slice at tick 7011</b> (4011 ticks = 401.1 sim-s past its golden).</para>
    /// <para>⛔ <b>SO P2's MARGIN IS 26 SIM-SECONDS OF FLOAT ROUNDING, NOT A DESIGN.</b> Any lane
    /// that moves the tick-3000 horizon, the battery capacity, or the wings' authored Condition on
    /// those two ships should expect the goldens to move, and should re-measure rather than assume
    /// this package's result carries over. ⚠️ The M2-12 commit message (cf0b990) reported "tick
    /// 3275 / 275 ticks / 27.5 sim-seconds" — a 25-tick-granularity UPPER BOUND quoted as an exact
    /// figure, and it also gave perilune's number as though it covered both ships. Corrected here
    /// from a per-tick sweep; independent review measured 3261 too.</para>
    /// <para>Charter: <c>docs/design/perilune-roadmap-q3.packages.md</c> § "M2-12".</para>
    /// </summary>
    public class GenerationWearTests
    {
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        // ---------------------------------------------------------------- the measured figures
        //
        // All hand-written, all measured on THIS tree by driving the ship. They ARE the pin — none
        // of them is read back out of AuthoredShips or machines.def, so an authoring change that
        // moves the curve fails here instead of silently redefining the target.

        /// <summary>Boot generation on <c>--ship wreck</c>: three SolarWings at 6 kW nameplate and
        /// Condition 0.31 / 0.18 / 0.06, i.e. 6(0.655) + 6(0.59) + 6(0.53).</summary>
        private const float BootKW = 10.65f;
        /// <summary>After the wreck's single Parts overhauls <c>wing_c</c> to 1.00: 3.93 + 3.54 + 6.00.
        /// This is the step the benches are bought with.</summary>
        private const float AfterWingCKW = 13.47f;
        /// <summary>THE CEILING REACHABLE ON BOOT STOCK, WITHOUT CRAFTING, and it is 17.40 —
        /// NOT 18.00. The wreck carries exactly one Parts, so out of the hold exactly ONE wing
        /// reaches Condition 1.00 and the ladder's next rung (Seals → 0.90) takes the other two.
        /// 6.00 + 5.70 + 5.70.
        /// <para>⚠️ "ON BOOT STOCK" IS THE WHOLE QUALIFIER AND AN EARLIER DRAFT OMITTED IT, saying
        /// one wing could EVER reach 1.00. That is false: Parts are producible (`recipes.def:21`,
        /// Fabricator 2 Scrap → 1 Parts; `deconstruct.def:19-21`, floor(2 × Condition) Parts per
        /// strip). 18.00 kW sits behind the matter economy, not behind a wall. This constant pins
        /// the 1.00 / 0.90 / 0.90 STATE, which is what the opening can reach — and that is
        /// unaffected either way.</para></summary>
        private const float CeilingKW = 17.40f;
        /// <summary>Three wings at Condition 0.00 — the floor of the affine map, 3 × 6 × 0.5.</summary>
        private const float FloorKW = 9.00f;
        /// <summary>Three wings at Condition 1.00. Out of reach on boot stock (one Parts aboard) but
        /// craftable later; it is here as the map's OTHER endpoint, because two points pin a slope
        /// and one point cannot.</summary>
        private const float PristineKW = 18.00f;
        /// <summary>Three wings at 0.06 — every one of them below machines.def `fail` (0.10).
        /// 3 × 6 × 0.53. Under an <c>IsOperational</c> gate this figure is 0.00.</summary>
        private const float AllBelowFailKW = 9.54f;

        /// <summary>Flat demand, unchanged by this package: Comfort 1.20 · Industry 6.50 ·
        /// Defense 0.90 · LifeSupport 5.70.</summary>
        private const float DemandLifeSupportKW = 5.70f;
        private const float DemandIndustryKW = 6.50f;
        private const float DemandDefenseKW = 0.90f;
        private const float DemandComfortKW = 1.20f;

        private const float Band = 0.05f;   // the two-sided band on a measured kW

        // ------------------------------------------------------------------------- the fixture

        /// <summary>The ship plus the live <see cref="PowerSystem"/> instance out of its own stack —
        /// the seam every kW below is read from.</summary>
        private sealed class Rig
        {
            public Simulation Sim;
            public PowerSystem Power;
            public ushort Net;   // deck 0's single conduit network (M2-11: deck 1 is off-grid)

            public float Gen => Power.LastGenerationKW(Net);
            public float Demand(PowerTier t) => Power.LastDemandKW(Net, t);
        }

        private static Rig Boot()
        {
            var stack = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            PowerSystem power = null;
            for (int i = 0; i < stack.Length; i++) if (stack[i] is PowerSystem p) power = p;
            Assert.That(power, Is.Not.Null, "the default system stack no longer contains a PowerSystem");

            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), stack);
            // TWO SECONDS OF SETTLE, ALWAYS. RebuildNetworks runs on the first tick, so before it
            // every NetworkId is 0 and the ledger is empty — a fixture that reads at tick 0 reads
            // nothing at all (it did, on the first run of this file).
            for (int t = 0; t < 20; t++) sim.Tick();

            ushort net = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.SolarWing && devices[i].NetworkId != 0)
                { net = devices[i].NetworkId; break; }
            Assert.That(net, Is.Not.Zero, "no SolarWing is on a network — the fixture cannot see the ledger");
            return new Rig { Sim = sim, Power = power, Net = net };
        }

        private static void SetWings(Simulation sim, float a, float b, float c)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Name == "wing_a") d.Condition = a;
                else if (d.Name == "wing_b") d.Condition = b;
                else if (d.Name == "wing_c") d.Condition = c;
            }
        }

        /// <summary>One balance pass (PowerSystem runs at 1 Hz = every 10 ticks).</summary>
        private static void Pass(Simulation sim) { for (int t = 0; t < 10; t++) sim.Tick(); }

        /// <summary>Flatten the bank. A ship in a persistent deficit reaches this state on its own
        /// (measured: the wreck's 15.00 kWh is gone by sim-hour 4), and it is the ONLY state in
        /// which the tier walk is a statement about generation: a battery bursts its whole stored
        /// energy inside one balance second, so any charge at all bridges any load.</summary>
        private static void EmptyTheBank(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Battery) devices[i].StoredKWh = 0f;
        }

        private static void Band2(List<string> offenders, string what, float measured, float expected)
        {
            if (Math.Abs(measured - expected) > Band)
                offenders.Add($"{what}: the ledger says {measured.ToString("F2", Inv)} kW, this file pins " +
                              $"{expected.ToString("F2", Inv)} ± {Band.ToString("F2", Inv)} kW");
        }

        /// <summary>Is a tier served? Read off the OBSERVABLE — <see cref="Device.Powered"/> on a
        /// wanting, wired, drawing device of that tier — not off any internal flag.</summary>
        private static bool TierServed(Simulation sim, PowerTier tier)
        {
            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) continue;
                var def = machines[(int)d.Kind];
                if (def.Tier != tier || def.DrawKW <= 0f) continue;
                if (d.Kind == DeviceKind.AirVent && !d.IsOpen) continue;   // PowerSystem.IsWanting
                return d.Powered;
            }
            return false;
        }

        private static int Deck0LampsLit(Simulation sim)
        {
            int lit = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Light && devices[i].Pos.Z == 0 && devices[i].Powered) lit++;
            return lit;
        }

        private static float Stored(Simulation sim)
        {
            float s = 0f;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Battery) s += devices[i].StoredKWh;
            return s;
        }

        // ============================================================ 1. THE CURVE, IN ABSOLUTE kW

        /// <summary>
        /// ⭐ <b>THE SCALE GUARD.</b> Three points on the authored curve, each a two-sided absolute
        /// band on the figure <c>PowerSystem</c> itself tallied. This is the owner's sentence as
        /// arithmetic: <b>10.65 kW at boot → 13.47 after the Parts overhauls <c>wing_c</c> → 17.40
        /// once both Seals have gone into the other two wings.</b>
        /// <para>⚠️ 17.40 AND NOT 18.00 IS THE POINT OF THE THIRD LEG: the wreck carries one Parts,
        /// so on boot stock only one wing reaches 1.00 and the other two stop at the Seals rung
        /// (0.90). A package that pinned 18.00 would pin a state the OPENING cannot reach — later,
        /// once the player is crafting Parts, it is reachable, which is why the qualifier is
        /// "on boot stock" and not "ever".</para>
        /// <para>⚠️ ONE ASSERT, EVERY LEG IN IT — <c>Assert</c> throws, and a per-leg assertion
        /// would let the boot figure hide both later ones (the fifth trap shape).</para>
        /// </summary>
        [Test]
        public void TheAuthoredCurve_Boot_Step_And_TheReachableCeiling()
        {
            var rig = Boot();
            var offenders = new List<string>();

            Band2(offenders, "boot (wings 0.31 / 0.18 / 0.06)", rig.Gen, BootKW);

            SetWings(rig.Sim, 0.31f, 0.18f, 1.00f); Pass(rig.Sim);
            Band2(offenders, "after the Parts overhaul of wing_c (0.31 / 0.18 / 1.00)", rig.Gen, AfterWingCKW);

            SetWings(rig.Sim, 0.90f, 0.90f, 1.00f); Pass(rig.Sim);
            Band2(offenders, "the REACHABLE ceiling — one Parts, two Seals (0.90 / 0.90 / 1.00)", rig.Gen, CeilingKW);

            Assert.That(offenders, Is.Empty,
                "repairing a wing no longer moves the ledger the way this package measured:\n  " +
                string.Join("\n  ", offenders));
        }

        /// <summary>
        /// <b>THE FLOOR IS A HALF SHARE, NOT ZERO — asserted as ARITHMETIC, not as a ratio.</b>
        /// <c>EffectiveRate</c> is <c>Rate × (0.5 + 0.5 × Condition)</c>, an affine map, and two
        /// points pin it where one cannot: Condition 0.00 must give exactly HALF the nameplate
        /// (9.00 kW of 18.00) and Condition 1.00 must give all of it. A floor of <c>Condition</c>
        /// alone passes the second leg and fails the first — which is the whole reason the first
        /// leg is here.
        /// </summary>
        [Test]
        public void TheFloorIsAHalfShare_TwoPointsPinTheMap()
        {
            var rig = Boot();
            var offenders = new List<string>();

            SetWings(rig.Sim, 0f, 0f, 0f); Pass(rig.Sim);
            Band2(offenders, "three wings at Condition 0.00 (the floor: HALF of nameplate)", rig.Gen, FloorKW);

            SetWings(rig.Sim, 1f, 1f, 1f); Pass(rig.Sim);
            Band2(offenders, "three wings at Condition 1.00 (the whole nameplate)", rig.Gen, PristineKW);

            Assert.That(offenders, Is.Empty,
                "the condition→generation map is no longer 0.5 + 0.5·Condition:\n  " +
                string.Join("\n  ", offenders));
        }

        // ================================================== 2. THE CLIFF THAT WAS RULED OUT (8b)

        /// <summary>
        /// ⛔ <b>THE NEGATIVE LEG. <c>IsOperational</c> MUST STAY OUT OF THE GENERATION TERM.</b>
        /// Every SolarWing here is at Condition 0.06 — below <c>machines.def</c>'s <c>fail</c>
        /// (0.10), so every one of them is inoperative — and the ship must still be fed
        /// <b>9.54 kW</b>, three half-shares, not 0.00.
        /// <para><b>Why this is a ruling and not an oversight.</b> With the gate, boot generation on
        /// the wreck is 7.47 kW and <c>wing_c</c> contributes literally nothing, so the first repair
        /// a player makes buys them a cliff instead of a step. Without it, wear is a gradient. The
        /// second leg is the consequence that matters: even three failed wings keep LIFE SUPPORT
        /// (5.70 kW) and the doors (0.90) served, so a wrecked ship is recoverable rather than
        /// asphyxiating. Under the gate this fixture reads 0.00 kW and life support is SHED.</para>
        /// <para>The bank is flattened first, deliberately: a battery bursts its whole charge inside
        /// one balance second, so with any charge at all the tier walk says nothing about
        /// generation. The wreck reaches this state unaided by sim-hour 4.</para>
        /// </summary>
        [Test]
        public void TheCliff_AWingBelowFail_StillContributes_AndTheShipStillBreathes()
        {
            var rig = Boot();
            var offenders = new List<string>();

            SetWings(rig.Sim, 0.06f, 0.06f, 0.06f);
            EmptyTheBank(rig.Sim);
            Pass(rig.Sim);

            // Non-vacuity: the fixture only means anything if these wings really are inoperative.
            var devices = rig.Sim.Devices.Items;
            int belowFail = 0;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.SolarWing && !devices[i].IsOperational(rig.Sim.Defs)) belowFail++;
            if (belowFail != 3)
                offenders.Add($"{belowFail} of the ship's SolarWings are below machines.def `fail`, not 3 — " +
                              "the fixture is not testing the cliff at all");

            Band2(offenders, "three INOPERATIVE wings (0.06 each) still feed the ship", rig.Gen, AllBelowFailKW);
            if (rig.Gen <= 0f)
                offenders.Add("a wrecked wing contributes ZERO — an IsOperational gate has been added to the " +
                              "generation term. EffectiveRate's floor is a gradient ON PURPOSE (M2-12, 8b)");
            if (!TierServed(rig.Sim, PowerTier.LifeSupport))
                offenders.Add("LIFE SUPPORT IS SHED on a ship whose only fault is three worn wings and a flat " +
                              "bank — the gradient is what keeps a wreck recoverable");
            if (!TierServed(rig.Sim, PowerTier.Defense))
                offenders.Add("the doors are shed at 9.54 kW against 5.70 + 0.90 kW of demand above them");

            Assert.That(offenders, Is.Empty,
                "the repair cliff (8b) is back:\n  " + string.Join("\n  ", offenders));
        }

        // ======================================================= 3. DEMAND STAYS FLAT (8c)

        /// <summary>
        /// ⛔ <b>THE OTHER RULING: A WORN SCRUBBER PAYS FULL PRICE FOR REDUCED OUTPUT.</b> Only the
        /// generation side rides <c>EffectiveRate</c>. Scaling <c>draw</c> too would hand a wrecked
        /// ship a smaller bill — the wreck's own devices are worn enough that its 14.30 kW would
        /// fall to roughly 8.6 and NOTHING would ever be shed.
        /// <para>⚠️ THE INCLUSION HALF IS IN THE SAME METHOD (trap 4, fourth shape): the tier
        /// figures are only evidence if the ship booking them is actually worn, so the first leg
        /// requires drawing devices below Condition 0.5 to exist. A fixture of pristine machines
        /// would satisfy every band below while proving nothing.</para>
        /// <para>The behavioural half is the third leg: with a flat bill and an empty bank, Industry
        /// is SHED at 10.65 kW of supply. Scale the draw and the benches run on a wreck.</para>
        /// </summary>
        [Test]
        public void DemandStaysFlat_TheWornShipPaysTheFullBill()
        {
            var rig = Boot();
            var offenders = new List<string>();

            var devices = rig.Sim.Devices.Items;
            var machines = rig.Sim.Defs.Machines;
            int wornDrawers = 0;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.NetworkId == 0) continue;
                if (machines[(int)d.Kind].DrawKW > 0f && d.Condition < 0.5f) wornDrawers++;
            }
            if (wornDrawers < 5)
                offenders.Add($"only {wornDrawers} wired, drawing devices are below Condition 0.5 — this ship is " +
                              "not worn enough for a flat-vs-scaled bill to differ, so the bands below prove nothing");

            Band2(offenders, "LifeSupport demand", rig.Demand(PowerTier.LifeSupport), DemandLifeSupportKW);
            Band2(offenders, "Industry demand", rig.Demand(PowerTier.Industry), DemandIndustryKW);
            Band2(offenders, "Defense demand", rig.Demand(PowerTier.Defense), DemandDefenseKW);
            Band2(offenders, "Comfort demand", rig.Demand(PowerTier.Comfort), DemandComfortKW);

            // The behavioural half: 10.65 kW of supply against a FLAT 14.30 kW bill sheds Industry
            // and Comfort. On a scaled bill (~8.6 kW) every tier is served and the wreck is free.
            EmptyTheBank(rig.Sim);
            Pass(rig.Sim);
            if (TierServed(rig.Sim, PowerTier.Industry))
                offenders.Add("the benches RUN on a wreck with a flat bank and 10.65 kW of generation — " +
                              "the demand side has been given an EffectiveRate factor (8c)");
            if (!TierServed(rig.Sim, PowerTier.LifeSupport))
                offenders.Add("life support is shed at 10.65 kW against 5.70 kW — the shed order has inverted");

            Assert.That(offenders, Is.Empty,
                "the power bill is no longer flat:\n  " + string.Join("\n  ", offenders));
        }

        // ============================================ 4. THE PLAYER-VISIBLE OUTCOME, DRIVEN

        /// <summary>
        /// ⭐ <b>THE OUTCOME TEST — "ORDER A REPAIR, THE LIGHTS COME BACK", DRIVEN END TO END.</b>
        /// No Condition is set by hand here: the crew's <c>Repair</c> work type is switched on (the
        /// player's act under OD-H, where every work type boots OFF) and the sim is left to run.
        /// The standing maintenance rule recruits neediest-first, walks the wreck's single Parts to
        /// <c>wing_c</c> and overhauls it — and <b>the ledger moves</b>, which before M2-12 it could
        /// not do at all.
        /// <para>Measured on this tree: the service completes at sim-hour 0.26 and generation steps
        /// from 10.65 kW to 13.47 (13.38 at h2 after the other two wings have rotted a little
        /// further — which is why the band on the second leg is a floor of +2.5 kW over boot and
        /// not a point).</para>
        /// </summary>
        [Test]
        public void OrderARepair_AndTheShipsGenerationSteps()
        {
            var rig = Boot();
            float before = rig.Gen;
            var offenders = new List<string>();
            Band2(offenders, "generation at boot, before any order", before, BootKW);

            var citizens = rig.Sim.Citizens.Items;
            int granted = 0;
            for (int i = 0; i < citizens.Count; i++)
            {
                citizens[i].SetWorkPriority(WorkType.Repair, WorkPriority.Highest);
                granted++;
            }
            if (granted == 0) offenders.Add("no crew aboard to give the order to");

            for (int t = 0; t < 2 * 36_000; t++) rig.Sim.Tick();   // two sim-hours

            float after = rig.Gen;
            Device wingC = null;
            var devices = rig.Sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == "wing_c") wingC = devices[i];

            if (wingC == null) offenders.Add("wing_c is not on the ship");
            else if (wingC.Condition < 0.99f)
                offenders.Add($"wing_c is at Condition {wingC.Condition.ToString("F2", Inv)} after two sim-hours of " +
                              "granted Repair — the ship's Parts did not reach the wing this test is about");
            if (after - before < 2.5f)
                offenders.Add($"generation went {before.ToString("F2", Inv)} -> {after.ToString("F2", Inv)} kW " +
                              "across the overhaul. A Parts service on a SolarWing must be worth ~2.8 kW; " +
                              "before M2-12 it was worth EXACTLY ZERO, which is the defect this package closed");

            Assert.That(offenders, Is.Empty,
                "the repair the player ordered did not reach the power ledger:\n  " + string.Join("\n  ", offenders));
        }

        /// <summary>
        /// ⭐ <b>AND THE LIGHTS COME ON.</b> The second half of the same sentence, and the one a
        /// player actually sees. Run the wreck seven sim-hours unattended — the bank is flat and
        /// deck 0's lamps are shedding — then bring the wings to the REACHABLE ceiling (one Parts
        /// and two Seals: 1.00 / 0.90 / 0.90) and hold the ship there for 120 balance seconds.
        /// <para>⚠️ <b>120 PASSES, NOT ONE, AND THE "BEFORE" HALF IS SAMPLED THE SAME WAY.</b> A
        /// ship in persistent deficit with a flat bank does not settle dark — it FLICKERS at 0.5 Hz
        /// (measured: lit, dark, lit, dark, for ever), because a battery bursts any charge inside
        /// one balance second and the surplus from a shed tier re-charges it. A single-instant lamp
        /// count is therefore a coin toss on the sampling phase; the assertion is over a WINDOW:
        /// dark in at least one pass before, lit in EVERY pass after.</para>
        /// </summary>
        [Test]
        public void RepairTheWings_AndADarkRoomsLightsComeOn()
        {
            var rig = Boot();
            for (int t = 0; t < 7 * 36_000; t++) rig.Sim.Tick();   // seven sim-hours, unattended

            const int Window = 120;
            int darkPasses = 0;
            for (int s = 0; s < Window; s++) { Pass(rig.Sim); if (Deck0LampsLit(rig.Sim) == 0) darkPasses++; }

            var offenders = new List<string>();
            if (darkPasses == 0)
                offenders.Add("deck 0's lamps never went out in 120 balance seconds at sim-hour 7 on the " +
                              "AUTHORED wings — the 'before' half of this test is vacuous and the 'after' " +
                              "half proves nothing");

            SetWings(rig.Sim, 0.90f, 0.90f, 1.00f);
            float storedAtRepair = Stored(rig.Sim);
            int litEvery = 0, industryEvery = 0;
            for (int s = 0; s < Window; s++)
            {
                Pass(rig.Sim);
                if (Deck0LampsLit(rig.Sim) == 8) litEvery++;
                if (TierServed(rig.Sim, PowerTier.Industry)) industryEvery++;
            }

            if (litEvery != Window)
                offenders.Add($"deck 0's eight lamps were lit in {litEvery} of {Window} balance seconds after the " +
                              "wings were repaired to the reachable ceiling — at 17.40 kW against 14.30 kW of " +
                              "demand they must be lit in every one of them");
            if (industryEvery != Window)
                offenders.Add($"the benches ran in {industryEvery} of {Window} passes after the repair, not all of them");
            if (Stored(rig.Sim) <= storedAtRepair)
                offenders.Add($"the bank did not recover: {storedAtRepair.ToString("F2", Inv)} -> " +
                              $"{Stored(rig.Sim).ToString("F2", Inv)} kWh across 120 s at a 3.10 kW surplus");

            Assert.That(offenders, Is.Empty,
                "repairing the wings did not bring the lights back:\n  " + string.Join("\n  ", offenders));
        }

        // ================================================== 5. THE WINNABILITY CHECK (8d/R)

        /// <summary>
        /// ⛔ <b>THE DRIVEN WINNABILITY CHECK.</b> M2-12 drops boot generation from a flat 18.00 kW
        /// to 10.65 against 14.30 kW of flat demand, so the ship now runs a permanent 3.65 kW
        /// deficit on its authored wings. The charter requires this to be measured, in the running
        /// game, over time, per tier — not argued from a total.
        /// <para><b>MEASURED, hour by hour for 24 sim-hours, unattended (OD-H: nothing enabled):</b>
        /// LifeSupport SERVED at every hour and Defense SERVED at every hour; the 15.00 kWh bank
        /// drains to 0.00 by sim-hour 5; Industry and Comfort shed from there on, so deck 0's eight
        /// lamps and all three benches go out. <b>The crew keep breathing and the doors keep
        /// working</b> — the wreck is a ship you must repair, not a ship that kills you while you
        /// watch. Repairing the wings to 17.40 kW turns everything back on
        /// (<see cref="RepairTheWings_AndADarkRoomsLightsComeOn"/>).</para>
        /// <para>⚠️ ONE ASSERT AT THE END WITH EVERY HOUR IN IT — a per-hour assertion would report
        /// hour 5 and hide hours 6..24 (the fifth trap shape).</para>
        /// </summary>
        [Test]
        public void Winnability_LifeSupportIsServedEveryHourOfTheFirstDay()
        {
            var rig = Boot();   // h0 is read two seconds in, once the topology exists
            var offenders = new List<string>();
            var table = new List<string>();

            for (int h = 0; h <= 24; h++)
            {
                if (h > 0) for (int t = 0; t < 36_000; t++) rig.Sim.Tick();

                bool ls = TierServed(rig.Sim, PowerTier.LifeSupport);
                bool def = TierServed(rig.Sim, PowerTier.Defense);
                table.Add($"h{h.ToString("00", Inv)} gen={rig.Gen.ToString("F2", Inv)} " +
                          $"bank={Stored(rig.Sim).ToString("F2", Inv)} LS={(ls ? "SERVED" : "SHED")} " +
                          $"Def={(def ? "SERVED" : "SHED")} lamps={Deck0LampsLit(rig.Sim)}/8");
                if (!ls) offenders.Add($"LIFE SUPPORT IS SHED at sim-hour {h.ToString(Inv)} — the opening is unwinnable");
                if (!def) offenders.Add($"the doors are shed at sim-hour {h.ToString(Inv)}");
            }

            Assert.That(offenders, Is.Empty,
                "the wreck cannot keep its crew alive on condition-scaled generation:\n  " +
                string.Join("\n  ", offenders) + "\n\nthe table:\n  " + string.Join("\n  ", table));
        }
    }
}
