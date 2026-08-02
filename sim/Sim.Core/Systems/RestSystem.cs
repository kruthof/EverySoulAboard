using System;

namespace Perilune.Sim
{
    /// <summary>
    /// ⭐⭐ <b>M3-9 — CREW SLEEP. The reducer <see cref="Citizen.Fatigue"/> never had.</b>
    ///
    /// <para>Before this system every crew member on every ship in the repo was PERMANENTLY
    /// EXHAUSTED: <see cref="NeedsSystem"/> ramped <see cref="Citizen.Fatigue"/> to 1.0 over ~16 h
    /// (needs.def <c>fatigue_per_second</c>) and nothing anywhere took a single unit back off it.
    /// Now a tired crew member who is BETWEEN JOBS walks to a <see cref="DeviceKind.Bed"/>, sleeps,
    /// wakes rested, and goes back to work.</para>
    ///
    /// <para>⛔⛔ <b>THE ONE RULE THIS FILE EXISTS TO OBEY — <c>docs/design/rimworld-reference.md</c>
    /// §3.5's boxed rule, confirmed there twice independently:</b> <i>"Needs do NOT interrupt a job
    /// in progress. The need check is a job-SELECTION filter, evaluated between jobs."</i> A hungry
    /// RimWorld colonist finishes its wall before it eats. ⇒ <b>Rest is a CLAIMANT, never an
    /// interrupt.</b> The only branch that can start a sleep is the one guarded by
    /// <see cref="Citizen.IsIdleForWork"/> — <c>JobKind == None</c> — so this system is structurally
    /// incapable of taking a job away from anyone. That matters far beyond tidiness: an out-of-band
    /// rest claim would silently undo <b>M2-8's pre-emption contract</b> and <b>M2-19's sticky
    /// hold</b>, and BOTH are pinned by PROPERTY (<see cref="Citizen.IsRecruitableIgnoringJob"/>)
    /// rather than by call site, so neither suite would have reddened.</para>
    ///
    /// <para>⭐ <b>THE SEAM CHOICE, stated because the charter asked for it: REST IS NOT A WORK TYPE.
    /// It is a need satisfied between jobs, and it is registered as its own system exactly as
    /// <see cref="SustenanceSystem"/> is.</b> RimWorld's answer is the same one
    /// (<see cref="WorkType"/>'s own header already says <i>"Eat, Drink and Flee are NOT work types
    /// and never will be … you cannot switch off eating"</i>), and the M2-0 findings make it the only
    /// affordable one: the arbitration seam is <c>IWorkOfferSource</c>/<see cref="WorkArbiter"/>, whose
    /// entire vocabulary is <see cref="WorkType"/> and the player's 1..4 band. To enter rest THERE it
    /// would need a seventh work type — a hashed grid column the player could switch OFF, i.e. a
    /// checkbox for "this person may sleep" — which is the wrong game. What the arbitration does for
    /// rest instead is REFUSE to interfere with it: <see cref="WorkTypeMap.TryOf"/> classifies
    /// <see cref="JobKind.Sleep"/> as not-work, so <c>JobSystem.TryPreempt</c>'s survival guard (its
    /// FIRST line) declines a sleeping pawn, and <c>JobSystem</c>'s kind table has no owner for
    /// <c>Sleep</c>, so the dispatcher never advances her either.</para>
    ///
    /// <para>⭐ <b>REGISTRATION ORDER IS BEHAVIOUR: this system runs BEFORE <see cref="JobSystem"/>,
    /// and after <see cref="CitizenSystem"/>.</b> §3.5 measures RimWorld's need-check order as
    /// <b>Eat ▸ Sleep ▸ Meditate ▸ Recreate ▸ Work</b>: for a crew member who is idle when a tick
    /// BEGINS, this position decides which of the two is asked first. Registered here she chooses
    /// SLEEP with a full job board in front of her; registered after <see cref="JobSystem"/>, WORK
    /// wins the selection and she takes one more job while exhausted. PINNED by
    /// <c>RestSystemTests.RestIsRegisteredBeforeTheDispatcher_AndThatDecidesTheSELECTION</c>, which is
    /// the only thing in the repo that sees it.
    ///
    /// ⛔ <b>AND THE REASON THIS COMMENT GAVE IN M3-9's FIRST COMMIT WAS FALSE — quoted rather than
    /// quietly rewritten.</b> It said a claimant registered after the dispatcher <i>"would win only on
    /// the ticks the dispatcher happened to find nothing — which on a busy ship is never."</i>
    /// MEASURED: behind the dispatcher she still falls asleep on a full haul board, at <b>t = 121</b>
    /// rather than <b>t = 1</b>, because a COMPLETING job writes <see cref="JobKind.None"/> where a
    /// system registered later sees it inside the same tick. The order buys the SELECTION, not the
    /// possibility. An independent reviewer moved the system with every suite green and P1 unchanged.
    ///
    /// <see cref="IntervalTicks"/> is <b>1</b>, the dispatcher's own cadence, so that "rest is asked
    /// first" holds on every tick rather than one in ten; ⚠️ that half is reasoned from the loop
    /// structure and is DISCLOSED rather than pinned (the property is compile-time and has no seam to
    /// vary). The pass is a float compare per citizen until somebody is actually tired.
    /// ⚠️ <b>THE SAME IS NOT TRUE OF <see cref="SustenanceSystem"/>, which is registered AFTER
    /// <see cref="JobSystem"/></b> — so on this ship WORK still beats EATING while rest beats work.
    /// That asymmetry is PRE-EXISTING and is deliberately NOT fixed here (moving Sustenance is a
    /// behaviour change on a system this package does not own, and it would confound this row's pin
    /// story); it is FILED.</para>
    ///
    /// <para><b>THE BED, and what happens without one.</b> A claim looks for the nearest
    /// <see cref="DeviceKind.Bed"/> that no other crew member is already sleeping in or walking to,
    /// and paths to the bed's own tile (furniture is authored <c>blocks = false</c>, so a bunk is
    /// stood on, not stood beside). ⛔ <b>If there is no bed, or none is reachable, or all of them are
    /// taken, she sleeps WHERE SHE STANDS — worse, not never.</b> §4.4's rest-effectiveness table:
    /// ground 0.8, bed 1.0 (needs.def <c>rest_effectiveness_ground</c>). That is not a courtesy path:
    /// <c>--ship wreck</c>, the shipping default, calls <c>RoomDresser.Dress</c> deliberately NOT at
    /// all and therefore has NO BUNKS ABOARD, so the 0.8 branch is what the player actually watches
    /// until they place one.</para>
    ///
    /// <para><b>Effectiveness is decided by where she IS, not by what she claimed</b> — one
    /// <c>TryGetDeviceAt</c> on her own tile, every pass. So a bunk deconstructed out from under a
    /// sleeper silently degrades her to ground rate instead of stranding her on an orphaned target,
    /// and a pawn who never reached her bed is resting the whole time she is lying on the deck. There
    /// is no orphan-handling branch anywhere in this file because that read makes one unnecessary.</para>
    ///
    /// <para>⭐⭐ <b>AND <see cref="NeedsSystem"/>'S RAMP IS GATED ON BEING AWAKE, WHICH IS HALF OF
    /// THIS MECHANISM AND LIVES IN THE OTHER FILE.</b> §4.4's numbers describe a rest meter that
    /// falls only while awake, so an unconditional ramp would silently make the real recovery
    /// <c>(recovery × effectiveness − ramp)</c> — the same numbers wearing a different mechanism.
    /// MEASURED with the ramp ungated: a 0.9-tired crew member needed <b>27.7 sim-hours</b> off a
    /// bed and <b>63.6 sim-hours</b> on the deck. With the gate, on the SHIPPED stack from the 0.75
    /// trigger: <b>7.89 sim-h</b> in a bed, <b>9.80 sim-h</b> on the deck (9.48 h / 11.74 h from
    /// 0.90). ⛔ Do not re-derive <c>fatigue_recovery_per_second</c> to absorb a ramp instead.</para>
    ///
    /// <para><b>WAKING.</b> One condition: <see cref="Citizen.Fatigue"/> reaches 0 — RimWorld's own
    /// "wakes at rest 100 %" (§3.5, the Sleep row). There is no timer, no schedule grid (OD-M item 3
    /// defers the 24-slot instrument past the week-9 gate) and no partial-nap threshold.</para>
    ///
    /// <para>⚠️ <b>THE DUTY CYCLE THAT FALLS OUT, AND ITS DIVERGENCE FROM THE REFERENCE, STATED.</b>
    /// 12 sim-h awake (the 0.75 trigger at the unchanged <c>fatigue_per_second</c>) + 7.89 asleep is
    /// a 19.9 h cycle, i.e. <b>60 % awake</b> in a bed and 55 % on the deck, against §4.4's
    /// <b>70.6 %</b>. The gap is entirely the PRE-EXISTING rise ramp (16 h to saturation), not this
    /// package's rates — and it is left alone deliberately: retuning <c>fatigue_per_second</c> is a
    /// second, unrelated reason to move P1. FILED.</para> The OTHER
    /// ways a sleep ends are all pre-existing and none of them is coded here, which is the point of
    /// routing rest through <see cref="JobKind"/> at all: <c>SafetySystem</c> cancels the job and
    /// flees lethal air (a sleeper DOES wake for vacuum), <c>MoveCitizenCommand</c> and
    /// <c>PrioritiseJobCommand</c> both call <see cref="Simulation.CancelJob"/> first (a direct order
    /// wakes her), and <c>NeedsSystem.Kill</c> ends it the last way.</para>
    ///
    /// <para>⛔ <b>WHAT TIREDNESS DOES NOT DO, and it is a scope ruling rather than an omission:
    /// it is NOT a work-rate multiplier.</b> §4.4 measures RimWorld's rest need as affecting
    /// <b>mood and immunity only — no work or combat stat</b>. The work rate's one input is
    /// <c>WorkRates</c>/<see cref="Citizen.SkillsRaw"/> (M3-7's axis) and a second factor here would
    /// double-count it. What fatigue DOES reach is <see cref="Citizen.Mood"/>, through
    /// <see cref="NeedsSystem"/>'s existing <c>mood_fatigue_weight</c> term — and that is not
    /// decorative: mood is the one sanctioned path from a soul to the economy
    /// (<c>ShipMetrics.Morale</c> → <c>DirectorSystem</c> tension → <c>WearPressure</c> →
    /// <c>MachineWearSystem</c>), so removing the permanent fatigue deficit changes machine WEAR
    /// RATES on every ship in the repo. See docs/MECHANICS.md §13.40.</para>
    ///
    /// <para><b>Determinism / allocation.</b> Citizens and devices walked in store order, nearest by
    /// Manhattan with strict <c>&lt;</c> so ties fall to store order, generation-stamped candidate
    /// passes exactly as <see cref="JobSystem"/> and <see cref="SustenanceSystem"/> do, no RNG, no
    /// LINQ, no lambdas. The steady state (nobody tired, nobody asleep) is one field read and one
    /// float compare per citizen and allocates nothing. NOT an <see cref="IStatefulSystem"/>: the
    /// stamps are scratch scoped to a single selection pass and everything durable lives on the
    /// citizen, which <see cref="Simulation"/> already saves and hashes.</para>
    /// </summary>
    public sealed class RestSystem : ISimSystem
    {
        public string Name => "Rest";

        /// <summary>⭐ 10 Hz — <see cref="JobSystem"/>'s own cadence, and the reason is in the class
        /// header: a rest claimant polled more slowly than the dispatcher loses every race for an idle
        /// pawn and rest silently stops beating work.</summary>
        public int IntervalTicks => 1;

        /// <summary>Seconds per pass. Structural: paired with <see cref="IntervalTicks"/> at the 10 Hz
        /// base rate, so needs.def <c>fatigue_recovery_per_second</c> is genuinely per-second and is NOT
        /// re-derived if this cadence changes. (<see cref="NeedsSystem"/>'s <c>Dt</c> is 1 f because it
        /// polls at 1 Hz; the two must not be copied across.)</summary>
        private const float Dt = 0.1f;

        /// <summary>Rest effectiveness in an actual bunk. A RULE, not a tunable — it is the unit the
        /// def's ground multiplier is expressed AGAINST (§4.4: bed 1.0, ground 0.8), so shipping it as
        /// a second def scalar would let a designer author a ship on which a bed is worse than the
        /// floor and the ground multiplier stops meaning what its name says.</summary>
        private const float BedEffectiveness = 1f;

        // "Tried and failed during the current claim pass" stamps (the JobSystem/SustenanceSystem
        // pattern): one slot per device store position, a generation counter instead of clears. A slot
        // equal to _gen means "already rejected in THIS pass", which is what makes the retry loop
        // terminate — every iteration either commits to a bed or burns one candidate.
        private long[] _deviceTried = new long[64];
        private long _gen;

        public void Tick(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead) continue;

                switch (citizen.JobKind)
                {
                    case JobKind.None:
                        // ⛔ THE NO-INTERRUPT GUARD, AND IT IS THE ONLY ENTRY POINT. IsIdleForWork is
                        // `!Dead && !HoldPosition && JobKind == None`, so a crew member who is working —
                        // including one carrying M2-19's HeldByOrder hold, which cannot exist without a
                        // job — is unreachable from here. Fatigue can never take a job away.
                        if (citizen.IsIdleForWork) TryStartRest(sim, citizen);
                        // HoldPosition: strict player control. She never TRAVELS for a need
                        // (SustenanceSystem's rule, applied unchanged), but she is not left awake
                        // forever on top of the deck either — she sleeps in place, at ground rate.
                        else if (citizen.HoldPosition && !citizen.HasPath) TryRestInPlace(sim, citizen);
                        break;
                    case JobKind.Sleep:
                        ProgressSleep(sim, citizen);
                        break;
                }
            }
        }

        // ------------------------------------------------------------------ claim

        /// <summary>
        /// She is idle and tired enough: take a bunk if one can be had, otherwise lie down here.
        /// ⚠️ There is deliberately no "keep looking next tick" state — a claim either commits to a bed
        /// or commits to the deck, in ONE pass. A version that retried would re-scan every device on
        /// the ship ten times a second for as long as the ship had no free bed, which is the
        /// steady state of <c>--ship wreck</c>.
        /// </summary>
        private void TryStartRest(Simulation sim, Citizen citizen)
        {
            var needs = sim.Defs.Needs;
            if (citizen.Fatigue < needs.FatigueRestThreshold) return;

            // ⚠️ THE ORDERED-WALK FLAG IS CLEARED FIRST, AND IT IS NOT TIDINESS. Both branches below
            // OVERWRITE her path, so a player-ordered walk in progress ends here — exactly as
            // SafetySystem's flee (`:295`) and JobSystem.TryPreempt (`:321`) end one, and for the
            // reason Citizen.OrderedMove's own header gives: a flag left standing after an interrupt
            // that cleared the path is a SILENT, UNRECOVERABLE IDLE BUG waiting for the day the
            // `&& HasPath` half of the guard is refactored away.
            //
            // ⭐ THAT REST MAY INTERRUPT AN ORDERED *WALK* AT ALL IS DELIBERATE AND IS
            // SustenanceSystem's RULING, APPLIED UNCHANGED: "a move order suppresses WORK, never
            // SURVIVAL … an order the player gave must not be a way to starve someone"
            // (Citizen.IsRecruitableForWork). A walk is not a JOB, so RW §3.5 is untouched — she
            // holds JobKind.None either way, which is the only state this method can be reached in.
            citizen.OrderedMove = false;

            if (TryClaimBed(sim, citizen)) return;

            // No bunk aboard, none free, or none reachable — sleep where she stands (§4.4's 0.8).
            citizen.ClearPath();          // drop any wander path; she is lying down here
            citizen.JobTarget = citizen.Pos;
            citizen.JobKind = JobKind.Sleep;
        }

        /// <summary>HoldPosition crew: the same decision with the travel half removed.</summary>
        private static void TryRestInPlace(Simulation sim, Citizen citizen)
        {
            if (citizen.Fatigue < sim.Defs.Needs.FatigueRestThreshold) return;
            citizen.JobTarget = citizen.Pos;
            citizen.JobKind = JobKind.Sleep;
        }

        /// <summary>
        /// Nearest free <see cref="DeviceKind.Bed"/> (Manhattan; ties resolve to device store order)
        /// with a path to its own tile. Unreachable candidates are stamped and the next-nearest tried,
        /// so the loop always terminates.
        ///
        /// <para>⚠️ <b>OCCUPANCY IS DERIVED, NOT STORED</b>, and that is what keeps this package off the
        /// DEVC save chapter and out of the device fold. A bunk is taken iff some OTHER live crew member
        /// holds <see cref="JobKind.Sleep"/> with that tile as her <see cref="Citizen.JobTarget"/> — a
        /// fact already saved and already hashed on the citizen. A <c>Device.SleeperId</c> field would
        /// have been a chapter bump, a hash fold and a second source of truth that can disagree with the
        /// citizen after a save/load. Cost: O(beds × crew) per claim, on a ship with at most a dozen of
        /// each, and only on the pass a crew member crosses the threshold.</para>
        /// </summary>
        private bool TryClaimBed(Simulation sim, Citizen citizen)
        {
            var devices = sim.Devices.Items;
            EnsureSize(ref _deviceTried, devices.Count);
            _gen++;

            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < devices.Count; i++)
                {
                    if (_deviceTried[i] == _gen) continue;
                    var d = devices[i];
                    if (d.Kind != DeviceKind.Bed || IsBedTaken(sim, d.Pos, citizen.Id))
                    {
                        _deviceTried[i] = _gen;
                        continue;
                    }
                    int dist = Int3.Manhattan(citizen.Pos, d.Pos);
                    if (dist < bestDist)
                    {
                        bestDist = dist;
                        best = i;
                    }
                }
                if (best < 0) return false;

                var bed = devices[best];
                // The bunk's OWN tile: furniture is authored blocks=false, so it is walkable and she
                // lies on it. IsWalkable is asked first because FindPath to an unwalkable goal is the
                // expensive way to learn the same thing.
                if (sim.IsWalkable(bed.Pos) && sim.Paths.FindPath(sim, citizen.Pos, bed.Pos, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    citizen.JobTarget = bed.Pos;
                    citizen.JobKind = JobKind.Sleep;
                    return true;
                }
                _deviceTried[best] = _gen; // unreachable from here — try the next-nearest
            }
        }

        /// <summary>Is another live crew member sleeping in — or walking to — the bunk at
        /// <paramref name="pos"/>? Store order, allocation-free, and it excludes
        /// <paramref name="askerId"/> so a re-entering claim never refuses a pawn her own bed.</summary>
        private static bool IsBedTaken(Simulation sim, Int3 pos, uint askerId)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.Id == askerId) continue;
                if (c.JobKind == JobKind.Sleep && c.JobTarget == pos) return true;
            }
            return false;
        }

        // --------------------------------------------------------------- progress

        /// <summary>
        /// One pass of sleeping. Fatigue falls at needs.def <c>fatigue_recovery_per_second</c> scaled by
        /// where she actually lies, and at 0 she wakes and returns to normal autonomy — the
        /// <see cref="JobKind"/> setter releases everything else on the way past
        /// <see cref="JobKind.None"/>.
        /// </summary>
        private static void ProgressSleep(Simulation sim, Citizen citizen)
        {
            if (citizen.HasPath) return; // CitizenSystem is still walking her to the bunk

            var needs = sim.Defs.Needs;
            // WHERE SHE IS, not what she claimed — see the class header.
            float effectiveness = sim.TryGetDeviceAt(citizen.Pos, out var here) && here.Kind == DeviceKind.Bed
                ? BedEffectiveness
                : needs.RestEffectivenessGround;

            citizen.Fatigue = Math.Max(0f, citizen.Fatigue - needs.FatigueRecoveryPerSecond * effectiveness * Dt);
            if (citizen.Fatigue <= 0f) citizen.JobKind = JobKind.None; // rested — back to the grid
        }

        // ------------------------------------------------------------------ misc

        /// <summary>Grow-only stamp storage. Discarding the old contents (rather than copying them) is
        /// safe BECAUSE <see cref="_gen"/> is incremented before every claim pass and so is always
        /// &gt;= 1 when compared: the fresh zeros can never match it, and a grown array correctly reads
        /// as "nothing tried yet". <see cref="SustenanceSystem"/>'s helper, verbatim.</summary>
        private static void EnsureSize(ref long[] array, int needed)
        {
            if (array.Length >= needed) return;
            int size = array.Length * 2;
            if (size < needed) size = needed;
            array = new long[size]; // fresh zeros can never equal the current _gen (>= 1)
        }
    }
}
