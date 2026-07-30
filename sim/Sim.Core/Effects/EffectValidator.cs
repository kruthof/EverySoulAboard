using System;

namespace Perilune.Sim
{
    /// <summary>
    /// Sim-side validation for every effect, no exceptions (LLM_CITIZENS.md §5):
    /// even enum-constrained tool calls are re-checked here against CURRENT state,
    /// because the sim may have moved on since the capability manifest was
    /// computed. Magnitudes are clamped, illegal effects are rejected silently
    /// (the pump publishes Accepted=false; the dialogue layer words the refusal).
    ///
    /// v0 clamp deviations from the doc, documented:
    /// - The |ΔAffinity| ≤ 15 budget is per sim-DAY (tick math), approximating the
    ///   doc's per-conversation budget until a conversation object exists (v1).
    /// - ΔTrust is clamped per effect (±15), with no daily budget.
    /// </summary>
    public sealed class EffectValidator
    {
        public const float MaxAffinityDeltaPerDay = 15f;
        public const float MaxTrustDeltaPerEffect = 15f;
        public const int MaxEmotionDurationTicks = (int)SimClockUtil.TicksPerDay;
        public const int MaxStringLength = 64; // emotion/mood strings are LLM-authored — bound them

        /// <summary>Validate against current state, clamp, and apply. True = accepted (possibly clamped).</summary>
        public bool TryApply(Simulation sim, MindState minds, FactRegistry facts, CitizenEffect effect)
        {
            if (sim == null || minds == null || facts == null || effect == null) return false;
            if (!sim.Citizens.TryGet(effect.CitizenId, out var citizen) || citizen.Dead) return false;
            if (!minds.Minds.TryGet(effect.CitizenId, out var mind)) return false;

            switch (effect)
            {
                case SetDisposition e: return ApplyDisposition(sim, mind, e);
                case SetEmotionalState e: return ApplyEmotion(sim, mind, e);
                case AgreeTask e: return ApplyAgreeTask(sim, citizen, mind, e);
                case RevealInfo e: return ApplyReveal(sim, facts, mind, e);
                case FollowPlayer e:
                    mind.FollowingPlayer = e.Follow;
                    return true;
                case EndConversation e: return ApplyEndConversation(sim, mind, e);
                default: return false; // unknown effect type — unrepresentable by construction
            }
        }

        /// <summary>Remaining |ΔAffinity| budget for today. Pure read — shared with CapabilityComputer.</summary>
        public static float RemainingAffinityBudget(CitizenMind mind, long tick)
        {
            long day = tick / SimClockUtil.TicksPerDay;
            if (mind.AffinityBudgetDay != day) return MaxAffinityDeltaPerDay; // fresh day, untouched budget
            float remaining = MaxAffinityDeltaPerDay - mind.AffinitySpentToday;
            return remaining > 0f ? remaining : 0f;
        }

        private static void RollBudgetDay(CitizenMind mind, long tick)
        {
            long day = tick / SimClockUtil.TicksPerDay;
            if (mind.AffinityBudgetDay == day) return;
            mind.AffinityBudgetDay = day;
            mind.AffinitySpentToday = 0f;
        }

        private static bool ApplyDisposition(Simulation sim, CitizenMind mind, SetDisposition e)
        {
            if (float.IsNaN(e.DeltaAffinity) || float.IsInfinity(e.DeltaAffinity)) return false;
            if (float.IsNaN(e.DeltaTrust) || float.IsInfinity(e.DeltaTrust)) return false;

            RollBudgetDay(mind, sim.TickCount);
            float remaining = MaxAffinityDeltaPerDay - mind.AffinitySpentToday;
            if (remaining <= 0f) return false; // budget exhausted — the conversation can't push further today

            float deltaAffinity = Math.Clamp(e.DeltaAffinity, -remaining, remaining);
            mind.AffinitySpentToday += Math.Abs(deltaAffinity);
            mind.AffinityToPlayer = Math.Clamp(mind.AffinityToPlayer + deltaAffinity, -100f, 100f);

            float deltaTrust = Math.Clamp(e.DeltaTrust, -MaxTrustDeltaPerEffect, MaxTrustDeltaPerEffect);
            mind.TrustToPlayer = Math.Clamp(mind.TrustToPlayer + deltaTrust, -100f, 100f);

            if (!string.IsNullOrEmpty(e.Reason))
            {
                mind.Memory.Add(new MemoryEntry
                {
                    Tick = sim.TickCount,
                    Text = e.Reason,
                    Importance = 0.3f + 0.4f * (Math.Abs(deltaAffinity) / MaxAffinityDeltaPerDay),
                    Tag = "player",
                });
            }
            return true;
        }

        private static bool ApplyEmotion(Simulation sim, CitizenMind mind, SetEmotionalState e)
        {
            if (string.IsNullOrEmpty(e.Emotion) || e.Emotion.Length > MaxStringLength) return false;
            if (e.DurationTicks <= 0) return false;
            int duration = Math.Min(e.DurationTicks, MaxEmotionDurationTicks);
            mind.Emotion = e.Emotion;
            mind.EmotionUntilTick = sim.TickCount + duration;
            return true;
        }

        /// <summary>
        /// v0 whitelist: Dig only, target must currently be a designated debris tile
        /// not worked by anyone else, citizen must be off-job (a wander path does not
        /// veto — agreeing mid-stroll is fine; a held job does), and an adjacent
        /// approach tile must be reachable (same +x,-x,+y,-y order as JobSystem).
        /// Sets JobsDirty so JobSystem rebuilds its assigned-dig set from citizen state.
        /// </summary>
        private static bool ApplyAgreeTask(Simulation sim, Citizen citizen, CitizenMind mind, AgreeTask e)
        {
            if (e.Job != JobKind.Dig) return false;
            // ⭐ M2-2 (G4) — THE WORK-TYPE VETO. The LLM effect pipeline is BOUNDED BY the work grid
            // and never overrides it: the CitizenEffect whitelist exists so the model cannot exceed
            // player-granted authority, and a work type the player switched off is the clearest
            // statement of that authority there is (integrator ruling, 2026-07-29; it follows from
            // the standing "LLM never touches sim state directly" invariant). Asked through
            // WorkTypeMap rather than as a literal WorkType.Mine so that widening the whitelist past
            // Dig cannot silently ship an ungated kind.
            if (!WorkTypeMap.TryOf(e.Job, out var work) || !citizen.CanTakeWorkType(work)) return false;
            if (citizen.JobKind != JobKind.None) return false;

            var target = e.Target;
            if (!sim.World.InBounds(target)) return false;
            if ((sim.World.GetFlags(target) & TileFlags.Designated) == 0 ||
                sim.World.GetWall(target) != TileDefs.Debris) return false;

            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var other = citizens[i];
                if (!other.Dead && other.JobKind == JobKind.Dig && other.JobTarget == target) return false;
            }

            citizen.ClearPath(); // drop any wander path before committing
            bool pathed = false;
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!sim.World.InBounds(n)) continue;
                if (!sim.IsWalkable(n)) continue;
                if (sim.Paths.FindPath(sim, citizen.Pos, n, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    pathed = true;
                    break;
                }
            }
            if (!pathed) return false;

            citizen.JobKind = JobKind.Dig;
            citizen.JobTarget = target;
            citizen.JobWorkTicks = JobSystem.DigWorkTicks;
            // A citizen took a dig with nothing else changing — the dig source must re-derive its
            // assigned set from citizen state so this site is not offered to anyone else.
            sim.JobsDirty |= JobBoardDirty.Citizens;

            mind.Memory.Add(new MemoryEntry
            {
                Tick = sim.TickCount,
                Text = $"Agreed to help the player clear the debris at ({target.X},{target.Y},{target.Z}).",
                Importance = 0.5f,
                Tag = "player",
            });
            return true;
        }

        private static bool ApplyReveal(Simulation sim, FactRegistry facts, CitizenMind mind, RevealInfo e)
        {
            if (!facts.TryGet(e.FactId, out var fact)) return false;
            if (fact.RevealedToCrewPlayer) return false;      // already out — nothing to reveal
            if (!mind.KnownFactIds.Contains(e.FactId)) return false; // can't reveal what you don't know

            fact.RevealedToCrewPlayer = true;

            var secrets = mind.Persona?.Secrets;
            if (secrets != null)
            {
                for (int i = 0; i < secrets.Length; i++)
                    if (secrets[i].FactId == e.FactId)
                        secrets[i].RevealedToPlayer = true;
            }

            mind.Memory.Add(new MemoryEntry
            {
                Tick = sim.TickCount,
                Text = "I told the player: " + fact.Text,
                Importance = 0.6f,
                Tag = "player",
            });
            return true;
        }

        private static bool ApplyEndConversation(Simulation sim, CitizenMind mind, EndConversation e)
        {
            string mood = string.IsNullOrEmpty(e.Mood) ? "neutral" : e.Mood;
            if (mood.Length > MaxStringLength) return false;
            mind.Memory.Add(new MemoryEntry
            {
                Tick = sim.TickCount,
                Text = "Talked with the player; parted " + mood + ".",
                Importance = 0.4f,
                Tag = "conversation",
            });
            return true;
        }
    }
}
