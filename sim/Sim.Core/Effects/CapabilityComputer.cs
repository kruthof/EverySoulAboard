using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// What one citizen can legally do right now (LLM_CITIZENS.md §5). The dialogue
    /// layer renders this both as strict tool schemas (enum-bounded ids) and as a
    /// prose paragraph in the prompt. Reused object: lists are cleared, never
    /// reallocated, so recomputing per conversation turn is allocation-free.
    /// </summary>
    public sealed class CapabilityManifest
    {
        public const int MaxDigTargets = 8;

        public uint CitizenId;
        public EffectKind LegalEffects;

        /// <summary>Facts this citizen knows AND has not yet revealed — the reveal_info enum domain.</summary>
        public readonly List<uint> KnownFactIds = new List<uint>(8);

        /// <summary>Up to 8 nearest designated, unworked debris tiles — the agree_task target domain.</summary>
        public readonly List<Int3> AssignableDigTargets = new List<Int3>(MaxDigTargets);

        /// <summary>Remaining |ΔAffinity| budget today (EffectValidator clamp).</summary>
        public float MaxAffinityDeltaRemaining;

        public void Clear()
        {
            CitizenId = 0;
            LegalEffects = EffectKind.None;
            KnownFactIds.Clear();
            AssignableDigTargets.Clear();
            MaxAffinityDeltaRemaining = 0f;
        }
    }

    /// <summary>
    /// Computes the capability manifest deterministically from (sim, minds, facts):
    /// world scanned in z,y,x order, known facts in mind insertion order, no RNG,
    /// no LINQ, no allocation beyond the caller-provided manifest's lists.
    /// A dead or mindless citizen yields an empty manifest (LegalEffects = None).
    /// </summary>
    public sealed class CapabilityComputer
    {
        public void Compute(Simulation sim, MindState minds, FactRegistry facts, uint citizenId, CapabilityManifest into)
        {
            if (into == null) return;
            into.Clear();
            into.CitizenId = citizenId;
            if (sim == null || minds == null || facts == null) return;
            if (!sim.Citizens.TryGet(citizenId, out var citizen) || citizen.Dead) return;
            if (!minds.Minds.TryGet(citizenId, out var mind)) return;

            into.LegalEffects = EffectKind.SetEmotionalState | EffectKind.FollowPlayer | EffectKind.EndConversation;

            into.MaxAffinityDeltaRemaining = EffectValidator.RemainingAffinityBudget(mind, sim.TickCount);
            if (into.MaxAffinityDeltaRemaining > 0f)
                into.LegalEffects |= EffectKind.SetDisposition;

            var known = mind.KnownFactIds;
            for (int i = 0; i < known.Count; i++)
            {
                if (facts.TryGet(known[i], out var fact) && !fact.RevealedToCrewPlayer)
                    into.KnownFactIds.Add(known[i]);
            }
            if (into.KnownFactIds.Count > 0)
                into.LegalEffects |= EffectKind.RevealInfo;

            if (citizen.JobKind == JobKind.None) // mirrors the EffectValidator gate (wander path doesn't veto)
            {
                FillDigTargets(sim, citizen, into.AssignableDigTargets);
                if (into.AssignableDigTargets.Count > 0)
                    into.LegalEffects |= EffectKind.AgreeTask;
            }
        }

        /// <summary>
        /// Up to 8 nearest (Manhattan; ties: z,y,x scan order) designated debris
        /// tiles not currently worked by any living citizen. Same designation rule
        /// as JobSystem's board scan; reachability is left to apply-time validation.
        /// </summary>
        private static void FillDigTargets(Simulation sim, Citizen citizen, List<Int3> into)
        {
            Span<int> dist = stackalloc int[CapabilityManifest.MaxDigTargets];
            int count = 0;

            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < world.Height; y++)
                {
                    int row = y * world.Width;
                    for (int x = 0; x < world.Width; x++)
                    {
                        if ((level.Flags[row + x] & (byte)TileFlags.Designated) == 0 ||
                            level.Wall[row + x] != TileDefs.Debris) continue;

                        var p = new Int3(x, y, z);
                        if (IsDigAssigned(sim, p)) continue;

                        int d = Int3.Manhattan(citizen.Pos, p);
                        if (count == dist.Length && d >= dist[count - 1]) continue; // ties keep the earlier scan hit

                        int pos;
                        if (count < dist.Length)
                        {
                            into.Add(p); // placeholder slot; shifted into place below
                            pos = count++;
                        }
                        else
                        {
                            pos = count - 1; // displace the current farthest
                        }
                        while (pos > 0 && dist[pos - 1] > d)
                        {
                            dist[pos] = dist[pos - 1];
                            into[pos] = into[pos - 1];
                            pos--;
                        }
                        dist[pos] = d;
                        into[pos] = p;
                    }
                }
            }
        }

        private static bool IsDigAssigned(Simulation sim, Int3 target)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.Dead && c.JobKind == JobKind.Dig && c.JobTarget == target) return true;
            }
            return false;
        }
    }
}
