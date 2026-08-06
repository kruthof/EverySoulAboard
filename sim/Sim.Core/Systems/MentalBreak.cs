using System;

namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ <b>M4-9 — THE DETERMINISTIC BREAK LADDER'S RULE.</b> One per-person tunable, three derived
    /// tiers, a dwell instead of a rate, and not one runtime roll anywhere.
    ///
    /// <para><b>THE MECHANISM IS RIMWORLD'S AND IT IS NOT RE-LITIGABLE</b>
    /// (<c>docs/design/rimworld-reference.md</c> §4.2 <c>:1007-1012</c>, adopted by
    /// <c>docs/design/perilune-m4.packages.md</c> §11): <i>"Three tiers, one tunable. A lane copying
    /// this should copy the DERIVATION, not three numbers: RimWorld exposes one per-pawn stat and
    /// computes the other two."</i> major = <b>4/7</b> of minor, extreme = <b>1/7</b> of minor, the
    /// minor threshold <b>clamped to 1 %–50 %</b>.</para>
    ///
    /// <para>⛔ <b>WHAT IS DELIBERATELY NOT ADOPTED, AND IT IS THE ONE THING §4 IS BUILT ON: THE
    /// RATE.</b> RimWorld's ladder is a <i>mean time to break</i> — 10 d / 3 d / 0.7 d — which is a
    /// per-tick probability. <c>docs/TARGET.md:63-65</c> forbids exactly that (<i>"a computed
    /// consequence of a hashed mood/skill state, NEVER a runtime roll"</i>) and OD-R restates it. The
    /// replacement is <b>DWELL TIME</b>: a hard time where RimWorld has a mean time. It preserves the
    /// ORDERING (deeper tier ⇒ shorter dwell) and RimWorld's own 10 : 3 : 0.7 RATIO, which is why
    /// <see cref="DwellTicksMajor"/> and <see cref="DwellTicksExtreme"/> are derived from
    /// <see cref="DwellTicksMinor"/> rather than written out.</para>
    ///
    /// <para>⛔ <b>AND THE SELECTION DOES NOT ROLL EITHER.</b> RimWorld picks a break TYPE from a
    /// weighted roster per tier. Perilune has exactly ONE behaviour per tier and no selection at all
    /// — a weighted roster is a die. One tier, one consequence, no choice.</para>
    ///
    /// <para><b>EVERY CONSTANT IN THIS FILE IS A LITERAL, NOT A DEF FIELD</b> — M2-1's
    /// rule-not-tunable precedent, used again by M3-7 (the skill rate curve) and M3-2
    /// (<c>ThawSecondsPerCycle</c>). <i>A break ladder's shape is a rule about what this game is, not
    /// a dial.</i> ⭐ That is what keeps the defs checksums <b>P4/P5</b> out of this package's pin row.
    /// The PER-PERSON BASE is the exception and it is not a constant at all — it is
    /// <see cref="Citizen.BreakThresholdPct"/>, hashed per-citizen state (DESIGN QUESTION (g),
    /// option (ii)).</para>
    ///
    /// <para>⛔ <b>THE TRAIT SOURCE IS FORBIDDEN AND THE REFUSAL IS A DETERMINISM RULE, NOT A
    /// PREFERENCE.</b> RimWorld sets the per-pawn threshold from traits (§4.2 <c>:1020-1032</c>).
    /// Perilune's traits live on <c>PersonaSheet</c>, which is HOST-OWNED AND UNHASHED
    /// (<c>MECHANICS.md</c> §13.39's table) and which the TUI host does not attach at all. ⇒ <b>a
    /// hashed break decision may never read a trait</b>: two hosts would compute two different break
    /// ladders from one save. The per-person byte is authored the way <c>SleeperAptitudes</c> authors
    /// competence — sim-side, at the thaw, hashed.</para>
    /// </summary>
    public static class MentalBreak
    {
        // ═══════════════════════════════════════════════════════════════════════════════════════
        // THE SPAN — and it is the one place this ladder deviates from the analogue's ARITHMETIC
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐⭐ <b>THE DEPRIVATION FLOOR: the mood of a crew member whose every SLOW need is
        /// saturated.</b> <c>MoodBase − (hunger + thirst + fatigue) weights</c> — on shipped defs,
        /// <c>20 − 40 − 30 − 25 = −75</c>.
        ///
        /// <para><b>WHY A FLOOR AT ALL.</b> RimWorld's thresholds are percentages of a 0..100 bar
        /// whose zero is <i>"as unhappy as it is possible to be"</i>. Perilune's mood is not a
        /// percentage and is not centred on zero (<c>NeedsSystem.cs:196-198</c> says so itself), so
        /// the DERIVATION only carries if it is applied to a quantity measured UPWARD from a floor.
        /// ⛔ Applying ×4/7 to a mood VALUE is arithmetically backwards: 4/7 of −40 is −22.9, which is
        /// ABOVE minor, and the ladder would invert.</para>
        ///
        /// <para>⛔⛔ <b>SUFFOCATION IS EXCLUDED FROM THE SPAN, AND THE REASON IS A MEASUREMENT, NOT
        /// A TASTE.</b> The full mood floor including suffocation is −135. Measured on
        /// <c>--ship wreck</c> over 21 sim-days and on <c>--ship slice</c> over 3
        /// (<c>hosts/scenario -- mood</c>, table 5a): at EVERY rung of the RimWorld-shaped ladder
        /// over the full −135 span — 1 %, 2 %, 5 % … 50 % — <b>the crew spend 0.00 % of the run below
        /// the threshold</b>, and the deepest rung (50 % = −57.50) is reached only in excursions
        /// whose longest contiguous run is <b>1 330 ticks (2.2 sim-minutes)</b>. The cause is
        /// structural rather than a tuning accident: <c>Citizen.Suffocation</c> is a <b>90–240 second
        /// death timer</b> (<c>needs.def</c>'s two suffocation rates), so its contribution to mood
        /// cannot be DWELT IN — a crew member deep enough to reach those rungs is dead or recovering
        /// within four minutes. A dwell ladder needs a signal you can sit in. ⇒ <b>a ladder anchored
        /// to −135 is a mechanism that fires only on people who are already dying, which is exactly
        /// the D-3 shape</b> (<c>rimworld-reference.md:1830-1835</c>) approached from the
        /// never-true side.</para>
        ///
        /// <para>⚠️ <b>EXCLUDED FROM THE SPAN IS NOT EXCLUDED FROM THE LADDER.</b> The ladder reads
        /// <see cref="Citizen.Mood"/> whole, suffocation term and all — a crew member in thin air IS
        /// pushed toward a break. What suffocation does not get to do is DEFINE how far down the
        /// bottom is.</para>
        /// </summary>
        public static float DeprivationFloor(SimDefs defs)
        {
            var n = defs.Needs;
            return n.MoodBase - n.MoodHungerWeight - n.MoodThirstWeight - n.MoodFatigueWeight;
        }

        /// <summary>The span the per-person percentage is a fraction OF: ceiling
        /// (<c>MoodBase</c>, every need at 0) minus <see cref="DeprivationFloor"/>. 95 on shipped
        /// defs. ⚠️ Derived from the def weights rather than written as 95, so a lane that retunes a
        /// mood weight moves the ladder with it instead of silently un-anchoring it.</summary>
        public static float MoodSpan(SimDefs defs)
        {
            var n = defs.Needs;
            return n.MoodHungerWeight + n.MoodThirstWeight + n.MoodFatigueWeight;
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // THE PER-PERSON TUNABLE AND ITS CLAMP
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>RW§4.2's clamp, verbatim: <i>"the minor threshold is clamped to 1 %–50 %"</i>.</summary>
        public const byte ThresholdPctMin = 1;

        /// <summary>RW§4.2's clamp, verbatim. See <see cref="ThresholdPctMin"/>.</summary>
        public const byte ThresholdPctMax = 50;

        /// <summary>
        /// ⭐ <b>THE SHIPPED DEFAULT, AND IT IS A MEASUREMENT RATHER THAN A CHOICE</b> — the M4-1
        /// charter's MUST RE-MEASURE box makes it one (<i>"the break threshold's default … is not a
        /// decision — a MEASUREMENT"</i>, §10's honesty note).
        ///
        /// <para><b>THE MEASUREMENT, taken with <c>hosts/scenario -- mood</c> on this tree and
        /// recorded in <c>MECHANICS.md</c> §13.4:</b> a crew member on a ship that can still feed,
        /// water and bed her oscillates against a SERVICED FLOOR of
        /// <c>MoodBase − need_threshold·(Wh + Wt) − fatigue_rest_threshold·Wf</c> =
        /// <c>20 − 20 − 15 − 18.75 = −33.75</c>, because <c>SustenanceSystem</c> serves at
        /// <c>need_threshold</c> 0.5 and <c>RestSystem</c> beds her at
        /// <c>fatigue_rest_threshold</c> 0.75. ⭐ <b>The driven envelope confirms it to the
        /// digit</b>: the deepest mood any crew member reached on <c>--ship wreck</c> over 7 sim-days
        /// is <b>−33.50</b>, and on <c>--ship slice</c> over 3 it is <b>−32.92</b>.</para>
        ///
        /// <para>⇒ <b>THE MINOR THRESHOLD IS SET JUST BELOW THAT FLOOR.</b> 43 % of the 95-point span
        /// above −75 is <b>−34.15</b>. A ship that is coping therefore <b>never</b> reaches the first
        /// rung (measured: 0.00 % of 21 sim-days below −35 other than sub-4-minute suffocation
        /// spikes), and a ship that has stopped feeding somebody reaches it within hours (hunger
        /// alone at 1.0 is −40 from the base before thirst and fatigue are counted). ⛔ <b>Both
        /// failure modes the charter names are refused BY MEASUREMENT rather than by argument: a
        /// threshold too high fires for everyone forever, too low fires never, and both look like a
        /// shipped mechanism.</b></para>
        ///
        /// <para>⚠️ <b>SAY THE ASYMMETRY OUT LOUD.</b> 43 in a 1..50 band leaves 7 points of room to
        /// be MORE fragile and 42 to be tougher. RimWorld's 35-in-1..50 is asymmetric the same way
        /// and less so. That is a consequence of Perilune's crew sitting near the top of their own
        /// span for most of a run, and it is a fact about this game's needs curve, not a spare
        /// parameter — do not "centre" it without re-taking the envelope.</para>
        /// </summary>
        public const byte DefaultThresholdPct = 43;

        /// <summary>
        /// ⭐ CATHARSIS, ON THE THRESHOLD AXIS (DESIGN QUESTION (c) option 2). RimWorld's catharsis is
        /// <i>+40 mood for 2.5 days</i> — a THOUGHT, i.e. a timed entry on a stack. Perilune's mood is
        /// closed-form and memoryless (<c>NeedsSystem.cs:194-195</c>) and has no slot for a timed
        /// offset; putting one there breaks the memoryless contract the whole character architecture
        /// rests on (<c>perilune-character-simulation.plan.md</c> §1). ⇒ the reprieve moves RW§4.2's
        /// <b>OTHER axis</b> — the same §4.2 that separates <i>"how happy is this pawn"</i> from
        /// <i>"how much unhappiness can this pawn take"</i> and calls them independent.
        ///
        /// <para><b>THE MAGNITUDE IS CITED, NOT INVENTED:</b> 18 points is Iron-willed's offset, the
        /// strongest threshold trait in RW§4.2's table (<c>:1026</c>). For the reprieve window she is
        /// as hard to break as the analogue's most iron-willed pawn. ⚠️ <b>It is a real deviation from
        /// RimWorld, which puts catharsis on the MOOD axis, and it is stated rather than
        /// glossed.</b></para>
        /// </summary>
        public const byte ReprievePctDrop = 18;

        /// <summary>The reprieve's window: <b>2.5 sim-days</b>, RW§4.2's catharsis duration
        /// (<c>:1016</c>) carried across as a DURATION even though the mechanism it drives is a
        /// different axis. 2.5 × <c>SimClockUtil.TicksPerDay</c>.</summary>
        public const long ReprieveTicks = 2_160_000;

        /// <summary>
        /// This crew member's minor threshold as a PERCENTAGE of the span, clamped to RW§4.2's
        /// 1..50 band, with the catharsis reprieve applied. ⚠️ The clamp is applied AFTER the
        /// reprieve, exactly as RimWorld clamps after summing trait offsets — an unclamped
        /// intermediate is how an offset stack escapes its own band.
        /// </summary>
        public static int EffectiveThresholdPct(Citizen c, long tick)
        {
            int pct = c.BreakThresholdPct;
            if (tick < c.BreakReprieveUntilTick) pct -= ReprievePctDrop;
            if (pct < ThresholdPctMin) pct = ThresholdPctMin;
            if (pct > ThresholdPctMax) pct = ThresholdPctMax;
            return pct;
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // THE THREE TIERS — DERIVED, NEVER WRITTEN OUT
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>RW§4.2: major is <b>4/7</b> of minor. Numerator.</summary>
        public const int MajorNumerator = 4;
        /// <summary>RW§4.2: extreme is <b>1/7</b> of minor. Numerator.</summary>
        public const int ExtremeNumerator = 1;
        /// <summary>The shared denominator of both derived tiers (RW§4.2's 35 → 20 → 5).</summary>
        public const int TierDenominator = 7;

        /// <summary>
        /// The mood value at or below which <paramref name="tier"/> is satisfied, for this crew
        /// member, on these defs, at this tick. ⚠️ <b>The derivation is applied to the HEADROOM above
        /// the floor</b> (<c>floor + span·pct·ratio</c>), never to the mood value — see
        /// <see cref="DeprivationFloor"/> for why the other reading inverts the ladder.
        /// </summary>
        public static float ThresholdFor(Citizen c, SimDefs defs, long tick, BreakTier tier)
        {
            float floor = DeprivationFloor(defs);
            float headroom = MoodSpan(defs) * (EffectiveThresholdPct(c, tick) / 100f);
            switch (tier)
            {
                case BreakTier.Major: headroom = headroom * MajorNumerator / TierDenominator; break;
                case BreakTier.Extreme: headroom = headroom * ExtremeNumerator / TierDenominator; break;
            }
            return floor + headroom;
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // THE DWELL — RimWorld's ratio, Perilune's scale
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ <b>SIX SIM-HOURS</b> (216 000 ticks at 10 Hz) continuously at or below the minor
        /// threshold. RimWorld's <i>mean</i> time at minor is 10 days; a hard 10 days here would
        /// outlive the ship (<c>--ship wreck</c> left alone kills its whole crew on day 19,
        /// measured), so the SCALE is Perilune's and the RATIO is RimWorld's.
        ///
        /// <para><b>THE SCALE IS DRIVEN, NOT PICKED.</b> Measured sawtooth (§13.4): amplitude
        /// median <b>14.40</b> mood points (a drink) and up to <b>27.24</b> (a meal and a drink
        /// together), against a combined ramp of <c>Wh/172800 + Wt/86400 + Wf/57600 = 1.0127e-3</c>
        /// mood per second ⇒ <b>3.95–7.47 sim-hours to fall back to where a reset lifted her from</b>,
        /// on a reset PERIOD whose median is <b>369 710 ticks (10.27 sim-h)</b>. So a crew member
        /// oscillating across the threshold is below it for roughly 2.8–6.3 sim-hours between resets.
        /// ⇒ <b>a dwell of 6 sim-hours is longer than the below-window a coping ship can supply, and
        /// shorter than the hours a failing one supplies continuously</b> — which is the whole
        /// difference between a break that means something and one that fires on a meal.</para>
        /// </summary>
        public const long DwellTicksMinor = 216_000;

        /// <summary>RW§4.2's own ratio: 3 days against minor's 10 ⇒ <b>3/10</b> of
        /// <see cref="DwellTicksMinor"/> = 64 800 ticks (1.8 sim-h).</summary>
        public const long DwellTicksMajor = DwellTicksMinor * 3 / 10;

        /// <summary>RW§4.2's own ratio: 0.7 days against minor's 10 ⇒ <b>7/100</b> of
        /// <see cref="DwellTicksMinor"/> = 15 120 ticks (0.42 sim-h).</summary>
        public const long DwellTicksExtreme = DwellTicksMinor * 7 / 100;

        /// <summary>Dwell ticks for a tier. <see cref="BreakTier.None"/> has none and returns 0.</summary>
        public static long DwellTicksFor(BreakTier tier) => tier switch
        {
            BreakTier.Minor => DwellTicksMinor,
            BreakTier.Major => DwellTicksMajor,
            BreakTier.Extreme => DwellTicksExtreme,
            _ => 0,
        };

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // THE LEAKY INTEGRATOR — DESIGN QUESTION (h), decided by the measurement it named
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐⭐ <b>THE COUNTER RISES FOUR UNITS PER TICK BELOW THE THRESHOLD AND LEAKS ONE PER TICK
        /// ABOVE IT — A LEAKY INTEGRATOR, NOT A HARD RESET, AND THE MEASUREMENT DECIDED IT.</b>
        ///
        /// <para>DESIGN QUESTION (h) left three options open and made them <i>"decided by a
        /// measurement this charter did not take"</i>. The measurement (<c>MECHANICS.md</c> §13.4,
        /// this package's) says: the sawtooth's amplitude is 14.40–27.24 mood points and its period's
        /// median is 10.27 sim-hours, so <b>near the minor threshold every meal and every drink
        /// carries her back ABOVE it</b> — a hard reset would zero the counter in exactly the band
        /// where a minor break is brewing, and the below-window between resets (2.8–6.3 sim-h) is
        /// SHORTER than the 6-hour dwell. ⇒ <b>option 1 cannot fire at all in the borderline band.
        /// Refuted, measured, not argued.</b></para>
        ///
        /// <para>⚠️ <b>AND BE PRECISE ABOUT WHAT THIS SMOOTHS, because it is not RimWorld's
        /// signal.</b> RimWorld low-passes the mood and THEN thresholds it (the bar chases its target
        /// at +12/−8 per in-game hour, §4.2 <c>:982-985</c>); this thresholds and THEN low-passes,
        /// so the smoothing acts on the BOOLEAN. For a duty-cycle input — which a meal-driven
        /// sawtooth is — a leaky integrator converges on the duty cycle, so the two are
        /// behaviourally alike; they are not identical, and this comment is where the difference is
        /// recorded rather than glossed.</para>
        ///
        /// <para><b>WHY 4 : 1 AND NOT 1 : 1.</b> The counter must accumulate across a duty cycle whose
        /// below-fraction is roughly 27–61 % (the measured window above). A leak of <c>r</c> per unit
        /// of rise accumulates iff duty &gt; <c>r/(1+r)</c>; at 1 : 1 that is 50 %, which the shallow
        /// end of the measured band does not clear, and at 4 : 1 it is 20 %, which it does. ⚠️ Integer
        /// arithmetic on purpose — the counter is HASHED state and a float accumulator would make the
        /// determinism pin depend on rounding.</para>
        /// </summary>
        public const uint DwellRisePerTick = 4;

        /// <summary>The leak. See <see cref="DwellRisePerTick"/> for why the ratio is 4 : 1.</summary>
        public const uint DwellLeakPerTick = 1;

        /// <summary>The counter value that satisfies <paramref name="tier"/>'s dwell, in the
        /// counter's own units (ticks × <see cref="DwellRisePerTick"/>).</summary>
        public static uint DwellUnitsFor(BreakTier tier) =>
            (uint)(DwellTicksFor(tier) * DwellRisePerTick);

        /// <summary>The counter's ceiling — the minor tier's dwell, which is the deepest anything
        /// asks for. Clamping matters: without it a crew member who spent a week below the threshold
        /// would carry a counter that takes a week to leak away, and the break would outlive its
        /// cause by days.</summary>
        public static uint DwellUnitsMax => DwellUnitsFor(BreakTier.Minor);

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // HOW LONG A BREAK LASTS
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⚠️ <b>THIS NUMBER IS PERILUNE'S AND THE INVENTION IS DECLARED.</b>
        /// <c>rimworld-reference.md</c> §4 publishes the ladder, the thresholds, the trait offsets
        /// and the aftermath, and <b>no break DURATIONS at all</b> — §4 declares itself shallow by
        /// design (<c>:955-956</c>). So there is nothing to cite here and pretending otherwise would
        /// be worse than saying so. Two sim-hours at minor, doubling per tier, chosen so the ordering
        /// is monotone in severity (RimWorld's is, in every other respect) and so a break is long
        /// enough for a player to see it and act.
        /// </summary>
        public const long BreakTicksMinor = 72_000;

        /// <summary>4 sim-hours. See <see cref="BreakTicksMinor"/> — the doubling is declared, not cited.</summary>
        public const long BreakTicksMajor = BreakTicksMinor * 2;

        /// <summary>8 sim-hours. See <see cref="BreakTicksMinor"/> — the doubling is declared, not cited.</summary>
        public const long BreakTicksExtreme = BreakTicksMinor * 4;

        /// <summary>How long a break of <paramref name="tier"/> runs before it expires.</summary>
        public static long BreakTicksFor(BreakTier tier) => tier switch
        {
            BreakTier.Minor => BreakTicksMinor,
            BreakTier.Major => BreakTicksMajor,
            BreakTier.Extreme => BreakTicksExtreme,
            _ => 0,
        };
    }

    /// <summary>
    /// ⭐ THE LADDER'S THREE RUNGS, and the behaviours are OD-R's own three verbs — <i>refuse
    /// dangerous orders · stop working · withdraw</i> — mapped one per tier, monotone in severity.
    /// <c>rimworld-reference.md</c> §4 names TIERS and never a table of break TYPES; the verbs come
    /// from OD-R, which is the only source with standing.
    ///
    /// <para>⛔ <b>THE VALUES ARE SAVED AND HASHED (CITZ v10). APPEND ONLY, NEVER RENUMBER</b> — the
    /// byte is <see cref="Citizen.BreakTier"/> and a renumber would silently re-label every saved
    /// break, exactly as <see cref="JobKind"/>'s header says about its own.</para>
    /// </summary>
    public enum BreakTier : byte
    {
        /// <summary>Not broken. The boot value for every crew member on every ship.</summary>
        None = 0,

        /// <summary>⭐ <b>SHE REFUSES THE DANGEROUS ORDER.</b> She still works; she will not cross the
        /// pressure frontier. Mechanised as M3-14's rung 2 run BACKWARDS: a held order today waives
        /// the air question (<c>SafetySystem.cs:129-133</c> names who may pass the flag), and a minor
        /// break withdraws that waiver for that person — see
        /// <see cref="Citizen.OrderOverridesSafety"/>. One predicate, one existing field, no new job
        /// state.</summary>
        Minor = 1,

        /// <summary>⭐ <b>SHE STOPS WORKING.</b> Every work claim declines; needs (eat / drink /
        /// sleep) and flee still run — <see cref="Citizen.BreakRefusesWork"/>, asked BESIDE the work
        /// grid's veto at every gate that asks it, never folded into it.</summary>
        Major = 2,

        /// <summary>⭐ <b>SHE WITHDRAWS.</b> She lets go of the job and stays: refuses work AND
        /// refuses orders — <see cref="Citizen.BreakRefusesOrders"/>.</summary>
        Extreme = 3,
    }
}
