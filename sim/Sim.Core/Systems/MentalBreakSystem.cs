using System;

namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ <b>M4-9 — THE FIRST MENTAL BREAK.</b> Every tick, for every living crew member: advance the
    /// dwell counter against her own derived thresholds, fire the deepest tier whose dwell she has
    /// served, expire a break that has run its course, and hand her the catharsis reprieve on the way
    /// out. The rule itself — the span, the derivation, the clamp, the dwell, the leak — is
    /// <see cref="MentalBreak"/>'s; this file is only its clock.
    ///
    /// <para><b>NO RNG, NO ALLOCATION, NO ROLL.</b> <c>docs/TARGET.md:63-65</c> forbids a die in an
    /// outcome and OD-R restates it. Nothing here draws from <c>SimRng</c>, and it is worth naming the
    /// shape it refuses to copy: <c>SocialSystem.cs:150</c>'s <c>_roll.NextFloat()</c> is a runtime
    /// roll in a behavioural outcome — deterministic in the REPLAY sense and a die in the DESIGN
    /// sense — and it is FILED (the M4-1 charter, §5(e)) rather than ruled on here. The break ladder
    /// copies neither of that line's two defects: no roll, and no saturated threshold (the threshold's
    /// default is a MEASUREMENT — see <see cref="MentalBreak.DefaultThresholdPct"/> — where D-3's
    /// <c>argument_mood_threshold = 0</c> was a number nobody drove).</para>
    ///
    /// <para><b>NOT AN <see cref="IStatefulSystem"/>, and that is a design statement.</b> Every bit of
    /// this mechanism's state lives on the <see cref="Citizen"/> — where <c>RestSystem</c>'s does, and
    /// for the same reason <c>RestSystem</c> gives for deriving bed occupancy from the sleeper rather
    /// than storing it on the bed: a second home for one fact is a second thing that can disagree with
    /// the first after a save/load. So this system adds no SYSS chapter and no checksum seed; the pin
    /// moves through the CITZ fold and through BEHAVIOUR, and nowhere else.</para>
    ///
    /// <para><b>REGISTERED AFTER <c>NeedsSystem</c> AND AFTER <c>SafetySystem</c>, and both halves are
    /// load-bearing.</b> After Needs because the ladder is a pure function of the <see cref="Citizen.Mood"/>
    /// Needs just wrote — the same argument <c>SafetySystem</c>'s own registration comment makes about
    /// <c>Suffocation</c>. After Safety because a crew member who crossed <c>flee_suffocation</c> this
    /// tick has ALREADY dropped her job and started running, so a break can never fire on somebody the
    /// ship is in the middle of rescuing, and an EXTREME break can never cancel a flee.
    /// ⚠️ Registration order is load-bearing for the SYSS fold order of every system after it — see
    /// <c>SystemStack</c>'s own standing note.</para>
    ///
    /// <para>⛔ <b>WHAT THIS SYSTEM DOES NOT DO: IT DOES NOT GATE ANY BEHAVIOUR ITSELF.</b> The three
    /// behaviours are three predicates on <see cref="Citizen"/> — <see cref="Citizen.OrderOverridesSafety"/>,
    /// <see cref="Citizen.BreakRefusesWork"/>, <see cref="Citizen.BreakRefusesOrders"/> — asked at the
    /// gates that already ask the work grid's veto and the worksite-safety rule. That is
    /// <i>priority-cannot-live-in-the-dispatcher</i> applied in advance: a break enforced from inside
    /// this Tick would have to find every claim path itself, and this repo has paid four packages for
    /// exactly that mistake.</para>
    /// </summary>
    public sealed class MentalBreakSystem : ISimSystem
    {
        public string Name => "MentalBreak";

        /// <summary>Every tick. ⚠️ NOT a 1 Hz sampler like <c>NeedsSystem</c>: the dwell counter is
        /// denominated in TICKS (<see cref="MentalBreak.DwellRisePerTick"/> units per tick), and a
        /// 10-tick cadence would either count ten times slow or need a multiplier that turns the
        /// cadence into part of the rule. One tick, one unit of rise; the arithmetic stays legible
        /// and the cost is one float compare and one integer add per living crew member.</summary>
        public int IntervalTicks => 1;

        public void Tick(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            long tick = sim.TickCount;
            var defs = sim.Defs;

            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;

                // ── 1. AN ACTIVE BREAK EXPIRES FIRST ──────────────────────────────────────────
                // Before the counter moves, so a break that ends this tick cannot also re-fire on
                // the same tick's counter: the reprieve it sets is applied to the thresholds
                // computed below, which is what makes catharsis actually protect her.
                if (c.BreakTier != BreakTier.None && tick >= c.BreakEndsAtTick)
                {
                    c.BreakTier = BreakTier.None;
                    c.BreakEndsAtTick = 0;
                    // The counter is spent. Not decayed — SPENT: the dwell she served bought this
                    // break and does not also buy the next one. Together with the reprieve this is
                    // the anti-death-spiral device RW§4.2 calls catharsis, on the threshold axis.
                    c.BreakDwell = 0;
                    c.BreakReprieveUntilTick = tick + MentalBreak.ReprieveTicks;
                }

                // ── 2. THE AWAKE PRECONDITION ────────────────────────────────────────────────
                // RW§4.2 (`:1017-1018`): "to break at all, a pawn must be awake and able to move",
                // and (`:986`) "while a pawn is asleep the bar is frozen and break risk is paused".
                //
                // ⭐ THE AWAKE HALF IS SHIPPED AND IS ASKED HERE. The predicate is JobKind.Sleep and
                // nothing else — M3-9's own choice, for the reason its comment gives: it is the one
                // fact about sleeping that is already saved, already hashed, and already the thing
                // RestSystem writes, so two systems cannot disagree about who is asleep.
                //
                // ⛔ THE "ABLE TO MOVE" HALF HAS NO ANALOGUE ON THIS TREE AND THE PRECONDITION SHIPS
                // AS *AWAKE ONLY*, SAID OUT LOUD RATHER THAN IMPLIED. It is TARGET.md:95's T14
                // exactly ("Health: capacity-gated work (downed != disabled) — missing"), and
                // Citizen.Health is measured NEVER WRITTEN (MECHANICS §13.4: 1.00 after three days
                // of CO2 poisoning). OD-S item 2 keeps the field REAL, and M4-4 is the package that
                // gives it a writer; the day it has one, this is the line that grows its second half.
                if (c.JobKind == JobKind.Sleep) continue;

                // ── 3. THE THREE THRESHOLDS, DERIVED FROM HER ONE BYTE ───────────────────────
                float minor = MentalBreak.ThresholdFor(c, defs, tick, BreakTier.Minor);

                // ── 4. THE LEAKY INTEGRATOR ──────────────────────────────────────────────────
                // Below the SHALLOWEST rung is what arms the counter; which rung FIRES is decided
                // at step 5 by where the mood actually is. One counter, three tiers — and because
                // the dwells are ordered extreme < major < minor, a counter deep enough for minor
                // is deep enough for the others by construction.
                if (c.Mood <= minor)
                {
                    uint next = c.BreakDwell + MentalBreak.DwellRisePerTick;
                    uint max = MentalBreak.DwellUnitsMax;
                    c.BreakDwell = next > max ? max : next;   // clamp: see DwellUnitsMax
                }
                else
                {
                    c.BreakDwell = c.BreakDwell > MentalBreak.DwellLeakPerTick
                        ? c.BreakDwell - MentalBreak.DwellLeakPerTick
                        : 0;
                }

                // ── 5. DOES SHE BREAK? DEEPEST TIER FIRST ────────────────────────────────────
                // A break already running is not re-fired or upgraded mid-flight: RW§4.2's break
                // ends by EXPIRY, and a ladder that promoted her tier every time the mood slipped
                // another point would be a meter with extra steps.
                if (c.BreakTier != BreakTier.None) continue;

                BreakTier fired = BreakTier.None;
                if (c.Mood <= MentalBreak.ThresholdFor(c, defs, tick, BreakTier.Extreme)
                    && c.BreakDwell >= MentalBreak.DwellUnitsFor(BreakTier.Extreme))
                    fired = BreakTier.Extreme;
                else if (c.Mood <= MentalBreak.ThresholdFor(c, defs, tick, BreakTier.Major)
                    && c.BreakDwell >= MentalBreak.DwellUnitsFor(BreakTier.Major))
                    fired = BreakTier.Major;
                else if (c.Mood <= minor
                    && c.BreakDwell >= MentalBreak.DwellUnitsFor(BreakTier.Minor))
                    fired = BreakTier.Minor;

                if (fired == BreakTier.None) continue;

                Fire(sim, c, fired, tick);
            }
        }

        /// <summary>
        /// She breaks. The state is written, the job is let go if the tier says so, and the ship's
        /// log is told — because <b>invisible feedback is functional</b> (binding, 2026-07-26) and a
        /// break the player cannot see is a crew member who mysteriously stopped.
        /// </summary>
        private static void Fire(Simulation sim, Citizen c, BreakTier tier, long tick)
        {
            c.BreakTier = tier;
            c.BreakEndsAtTick = tick + MentalBreak.BreakTicksFor(tier);

            // ⭐ EXTREME — SHE WITHDRAWS. CancelJob drops whatever she carries, releases every
            // reservation and (through the JobKind setter) releases any order's hold on the way past
            // None, which is the one mechanism all twenty job-ending sites share.
            //
            // ⚠️ "WALKS SOMEWHERE AND STAYS" IS REDUCED TO "STAYS", AND THE REDUCTION IS MEASURED
            // RATHER THAN LAZY: `Citizen.AutoWander` boots FALSE on every ship this game ships
            // (Citizen.cs:15 — "an institution's crew stands at their station when idle"), so there
            // is no idle-movement channel to withdraw ALONG. Giving her a destination would mean
            // inventing one, which is a different package with a different question ("where does a
            // person go to be alone on a wreck?"). She lets go and stands.
            if (tier == BreakTier.Extreme)
            {
                sim.CancelJob(c);
                c.ClearPath();
                c.OrderedMove = false;
                sim.JobsDirty |= JobBoardDirty.Citizens;
            }
            // ⭐ MAJOR — she stops working, so the job in her hands ends too. Without this she would
            // keep the job she already holds for ever: BreakRefusesWork is asked at the CLAIM gates,
            // and a claim gate cannot take back a claim already made. (Minor is different by design:
            // she still works, so her job is hers to keep.)
            else if (tier == BreakTier.Major)
            {
                sim.CancelJob(c);
                c.ClearPath();
                sim.JobsDirty |= JobBoardDirty.Citizens;
            }

            sim.Events.Publish(new MentalBreakEvent
            {
                CitizenId = c.Id,
                Name = c.Name,
                Tier = (byte)tier,
                Mood = c.Mood,
            });
        }
    }
}
