namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ <b>M3-7 — WHAT A SKILL LEVEL IS WORTH. THE ONE SEAM between a crew member's
    /// <see cref="Citizen.SkillsRaw"/> and every place work gets done.</b>
    ///
    /// <para><b>THE PLAYER SENTENCE.</b> Until this file existed, everyone aboard worked at the same
    /// rate at everything and a name was the only thing telling two crew apart. After it, WHO does a
    /// job changes how fast it is done — and choosing which soul to thaw finally means something.</para>
    ///
    /// ───────────────────────────────────────────────────────────────────────────────────────────
    /// <para><b>THE CURVE, AND ITS DEVIATION FROM THE ANALOGUE, STATED RATHER THAN HIDDEN.</b>
    /// <c>docs/design/rimworld-reference.md</c> §5.1 publishes every skill-driven stat in the form
    /// <c>base + bonus × level</c> with per-stat constants (Construction Speed <c>0.30 + 0.0875</c>,
    /// Mining Speed <c>0.04 + 0.12</c>) and warns in the same breath that <i>"a single 'skill → work
    /// speed' multiplier is not the RimWorld model"</i> — for Construction skill is speed AND failure,
    /// for Crafting it is quality ONLY, for Cooking it is unlock-then-speed.</para>
    ///
    /// <para>⇒ <b>v1 TAKES THE FORM AND ONE OF THE THREE EFFECTS.</b> Per-work-type
    /// <c>(base, bonus)</c> constants, exactly §5.1's shape — but <b>skill affects RATE ONLY. Quality
    /// and failure rolls are NOT modelled and are not pending.</b> <c>docs/TARGET.md</c> §2 forbids
    /// dice in outcomes, so <i>"no dice"</i> and <i>"skill affects quality"</i> cannot both hold;
    /// the owner has "no dice". ⛔ <b>DO NOT LET A LATER LANE "COMPLETE" THIS WITH A ROLL.</b> If
    /// quality is ever wanted it needs a deterministic mechanism (a graded output, a wear multiplier),
    /// not a d20 wearing a skill's clothes.</para>
    ///
    /// <para>⛔ <b>AND SKILL NEVER GATES WHETHER</b> (§5.2). Nothing in this file answers a yes/no
    /// question and nothing in <see cref="Citizen.CanTakeWorkType"/> calls it. A level-0 crew member
    /// takes the job and does it at exactly today's rate.</para>
    ///
    /// ───────────────────────────────────────────────────────────────────────────────────────────
    /// <para>⚠️ <b>THE CONSTANTS ARE LITERALS, NOT DEF FIELDS, AND THAT IS A DECISION.</b> M2-1's
    /// precedent: <i>a rule, not a tunable.</i> A skill curve is the same class of thing as
    /// <c>WorkPriority.Highest == 1</c> — changing it changes what the game IS, not how a particular
    /// ship is balanced, and every consumer would have to be re-reasoned. It is also what keeps the
    /// defs checksums <b>P4 and P5 out of this pin row</b> (measured, not assumed: this package moved
    /// P1/P2/P3 and both defs pins held).</para>
    ///
    /// <para><b>THE SPAN, AND THE DRIVE BEHIND IT.</b> RimWorld's own constants cannot be lifted
    /// directly: their <c>base</c> is near ZERO (Mining <c>0.04</c>), so a level-0 pawn works 25× to
    /// 60× slower than a level-20 one and every existing balance number in this game would move. Two
    /// constraints decided the literals below instead —
    /// <list type="number">
    ///   <item><b>base = 1.000 for every work type</b>, so an UNTRAINED crew member works at exactly
    ///     today's rate. This is not a balance convenience: the whole shipping fleet boots at level 0
    ///     (nothing in the sim writes a skill yet — M3-8's persona sheets are the expected first
    ///     author), so it is what makes this package's P1/P2/P3 move provably <b>fold-only</b>, and
    ///     what lets the integer scaling below be the EXACT identity at level 0 rather than
    ///     approximately it.</item>
    ///   <item><b>a maxed specialist is 2×–3×</b> an untrained one, with the per-type SPREAD keeping
    ///     §5.1's relative ordering: mining is the most skill-sensitive stat in the analogue and is
    ///     the most sensitive here; deconstruction, which is mostly swinging at something that is
    ///     already broken, is the least.</item>
    /// </list>
    /// Driven, not predicted — <c>SkillConsumerTests</c> measures the completion tick of each of the
    /// five consumers at level 0 and at level 20 and asserts the ABSOLUTE tick counts, because a
    /// ratio-only suite cannot see a 2× scale error (TRAPS, seventh shape).</para>
    ///
    /// <para>⚠️ <b><see cref="WorkType.Haul"/> IS 1.000 + 0.000 AND THAT IS HONEST, NOT AN
    /// OMISSION.</b> Hauling in this sim accrues no work at all — <c>HaulJobSource</c> is pure travel
    /// plus an instantaneous pickup and drop, with no <c>JobWorkTicks</c> countdown anywhere on the
    /// path. There is nothing for a rate to multiply, so a non-zero bonus here would be a number that
    /// looked like a mechanic and was not. A haul-speed term needs a carry-capacity or move-speed
    /// mechanism first; FILED, not built.</para>
    ///
    /// ───────────────────────────────────────────────────────────────────────────────────────────
    /// <para>⭐ <b>WHY THE SEAM TAKES A <see cref="Citizen"/> AND NOT A LEVEL.</b>
    /// <c>ArchitectureBoundaryTests.Economy_KnowsNothingAboutSoulsPresentationOrPhysiology</c> forbids
    /// the substring <c>Skill</c> in every ECONOMY file, and all five consumers are economy files
    /// (<c>Jobs/*</c>, <c>CraftingSystem</c>, <c>MachineWearSystem</c>). Its row for <c>Skill</c> says
    /// in as many words that <i>"E2/M3-7 crosses this via ONE seam"</i> and that deleting the row
    /// <i>"would silently permit exactly the coupling M3-7 has to make deliberate"</i>. ⇒ This file is
    /// that seam, it lives OUTSIDE the economy directories, and the consumers call it without ever
    /// naming a skill — so <b>the row needed no carve-out and still holds, measured</b>. It follows
    /// the <c>Director</c>/<c>WearPressure</c> shape the same test names as the precedent: one seam,
    /// not skill references scattered across five job sources.</para>
    ///
    /// <para><b>DETERMINISM.</b> Pure functions of state; no RNG, no allocation, no static mutable
    /// anything, and the tick-path arithmetic is INTEGER
    /// (<see cref="WorkTicksFor(Citizen,WorkType,int)"/>) so no rounding mode can differ between two
    /// runs of one seed. <see cref="RateFor"/> returns a <c>float</c> for the one accumulator that is
    /// already a float, and returns <b>exactly <c>1.0f</c></b> at level 0 (<c>1000 / 1000f</c> is an
    /// exact IEEE quotient), so multiplying by it is bit-identical to not multiplying at all — the
    /// <c>× 1f</c> IEEE-identity argument <c>MachineWearSystem.cs:36-37</c> already relies on.</para>
    /// </summary>
    public static class WorkRates
    {
        /// <summary>Fixed-point scale for the rate arithmetic: a rate of <c>1.000</c> is
        /// <c>1000</c>. Integer, so the tick-path maths has no rounding mode to disagree about.</summary>
        public const int Unit = 1000;

        /// <summary>
        /// ⭐ THE CURVE'S CONSTANTS, indexed by <see cref="WorkType"/>'s own value. <c>rate =
        /// (Base[t] + Bonus[t] × level) / Unit</c>.
        ///
        /// <para><b>base is 1.000 EVERYWHERE and that is load-bearing</b> (see the class doc): an
        /// untrained crew member works at exactly the pre-M3-7 rate, which is what makes this
        /// package's determinism move fold-only on a fleet that is entirely level 0.</para>
        /// </summary>
        private static readonly int[] BaseMilli = { Unit, Unit, Unit, Unit, Unit, Unit };

        /// <summary>
        /// ⭐ Milli-rate GAINED PER SKILL LEVEL, per work type — the only place the six work types
        /// differ, and the reason mutation 2 ("apply the curve to only one work type") is caught by a
        /// test PER CONSUMER rather than one per package.
        ///
        /// <para>At <see cref="SkillLevel.Max"/> (20) these read, in <see cref="WorkType"/> order:
        /// Repair <b>2.24×</b> · Construct <b>2.50×</b> · Craft <b>2.50×</b> · Deconstruct
        /// <b>2.00×</b> · Mine <b>3.00×</b> · Haul <b>1.00×</b> (no accrual exists to scale — see the
        /// class doc). ⚠️ Two types deliberately SHARE a value (Construct and Craft): they are not
        /// required to differ, and inventing a difference to make the table look varied would be a
        /// balance claim nobody made.</para>
        /// </summary>
        private static readonly int[] BonusMilli =
        {
            62,   // Repair       — 2.24× at 20. A service is diagnosis plus part-swapping; the wreck's
                  //                premise leans on it, so it is generous but not the top of the table.
            75,   // Construct    — 2.50× at 20. §5.1's Construction Speed is the analogue's mid-slope
                  //                stat and this is the mid-high value here.
            75,   // Craft        — 2.50× at 20. In RimWorld crafting skill buys QUALITY, which this
                  //                game cannot model without dice (class doc); the effect is spent on
                  //                rate instead, at Construct's slope, and the substitution is stated.
            50,   // Deconstruct  — 2.00× at 20. The least skill-sensitive: taking a thing apart is
                  //                mostly force, and §5.1 has no deconstruction stat at all.
            100,  // Mine         — 3.00× at 20. The most skill-sensitive, matching §5.1, where Mining
                  //                Speed has by far the steepest slope-to-base ratio of any work stat.
            0,    // Haul         — 1.00× at every level. ⚠️ NOT a placeholder: haul accrues no work
                  //                ticks anywhere in this sim, so there is nothing to multiply. FILED.
        };

        /// <summary>
        /// This crew member's work rate for <paramref name="type"/>, in <see cref="Unit"/>ths.
        /// <c>1000</c> = today's rate. Pure integer read; no allocation, safe on every tick path.
        /// </summary>
        public static int RateMilliFor(Citizen citizen, WorkType type)
        {
            int t = (int)type;
            return BaseMilli[t] + BonusMilli[t] * citizen.SkillsRaw[t];
        }

        /// <summary>
        /// This crew member's work rate for <paramref name="type"/> as a multiplier: <c>1f</c> is
        /// today's rate, <c>2f</c> is twice as fast.
        ///
        /// <para>⚠️ <b>EXACTLY <c>1.0f</c> AT LEVEL 0</b>, because <c>1000 / 1000f</c> is an exact IEEE
        /// quotient — so an accumulator that multiplies by this is bit-identical to one that does not
        /// while the fleet is untrained. That is not a nicety; it is what makes this package's pin move
        /// fold-only rather than a rate change nobody can account for.</para>
        /// </summary>
        public static float RateFor(Citizen citizen, WorkType type) => RateMilliFor(citizen, type) / (float)Unit;

        /// <summary>
        /// ⭐ <b>THE TICK-PATH SEAM.</b> How many work ticks <paramref name="citizen"/> must spend to
        /// finish a piece of <paramref name="type"/> work whose UNSKILLED cost is
        /// <paramref name="baseTicks"/> — i.e. <c>baseTicks / rate</c>, rounded half-up, floored at 1.
        ///
        /// <para><b>WHY THE RATE IS APPLIED WHEN THE WORK IS ASSIGNED RATHER THAN PER TICK.</b>
        /// <c>Citizen.JobWorkTicks</c> is an INTEGER countdown decremented by exactly one unit per
        /// pass. A per-tick multiplier on an integer counter can only be an integer, so every rate
        /// between 1× and 2× would floor to 1× and the whole middle of the curve would be silently
        /// inert; carrying a fractional remainder instead would mean a NEW saved, hashed field on
        /// every citizen. Scaling the assignment is the same arithmetic (<c>ticks = base / rate</c>)
        /// with full resolution and no new state.</para>
        ///
        /// <para>⚠️ AND IT IS EXACT RATHER THAN APPROXIMATE HERE, because <b>an abandoned job loses its
        /// countdown entirely</b> — <c>JobSystem.cs:271</c>, <i>"only her own JobWorkTicks countdown is
        /// lost"</i> — so a re-claim always restarts from the full unskilled cost and no partially-done
        /// work can ever be scaled twice. ⛔ IF THAT EVER CHANGES (a job that banks partial progress on
        /// the SITE and hands it to the next pawn), this function must move to the accrual instead;
        /// crafting already works that way and is handled by <see cref="RateFor"/>, not by this.</para>
        ///
        /// <para>At <see cref="SkillLevel.Min"/> the result is <paramref name="baseTicks"/> EXACTLY:
        /// <c>(b × 1000 + 500) / 1000 == b</c> for every non-negative <c>b</c>. Measured, not argued —
        /// <c>SkillConsumerTests</c> drives it.</para>
        /// </summary>
        public static int WorkTicksFor(Citizen citizen, WorkType type, int baseTicks)
        {
            if (baseTicks <= 0) return baseTicks;               // "no work" stays no work, never 1
            int rate = RateMilliFor(citizen, type);
            long scaled = ((long)baseTicks * Unit + rate / 2) / rate;   // round half-up, 64-bit: 2.1e9 × 1000 overflows int
            return scaled < 1 ? 1 : (int)scaled;                // a rate can shorten work, never erase it
        }
    }
}
