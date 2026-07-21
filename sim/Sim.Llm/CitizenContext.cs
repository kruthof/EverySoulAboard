using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Sim;

namespace Perilune.Llm
{
    /// <summary>
    /// Assembles the per-turn CitizenContext snapshot the backends speak against — a
    /// PURE sim-side read (LLM_CITIZENS.md §1: the LLM sees a snapshot, never the live
    /// sim). The produced <see cref="ConversationRequest"/> holds only copied plain data
    /// (strings, string lists, immutable <see cref="EffectOption"/>s): no Citizen,
    /// CitizenMind, or Simulation reference crosses into the Llm layer, so a backend —
    /// local today, a network adapter tomorrow — can never reach back into sim state.
    ///
    /// The capability summary is built straight from the sim-computed
    /// <see cref="CapabilityManifest"/>: it enumerates every legal (effect-kind, id)
    /// pair, which IS the enum-bounded id domain a strict tool schema would encode
    /// (fact ids for reveal_info; target indices for agree_task). The TemplateBackend
    /// consumes it exactly as a tool-using model consumes the enums — that is the
    /// contract this snapshot proves.
    /// </summary>
    public static class CitizenContext
    {
        /// <summary>
        /// Build the snapshot for one citizen. Reads persona, top-K memories, disposition
        /// and the supplied manifest; mutates nothing. Returns an empty request (no
        /// capabilities) for an unknown or mindless citizen — the backend then simply has
        /// nothing legal to propose.
        /// </summary>
        public static ConversationRequest Build(
            Simulation sim, MindState minds, FactRegistry facts,
            CapabilityManifest manifest, uint citizenId)
        {
            var req = new ConversationRequest();
            if (sim == null || minds == null || facts == null || manifest == null) return req;
            if (!sim.Citizens.TryGet(citizenId, out var citizen)) return req;
            if (!minds.Minds.TryGet(citizenId, out var mind)) return req;

            PersonaSheet persona = mind.Persona;
            req.CitizenName = persona != null && !string.IsNullOrEmpty(persona.Name) ? persona.Name : citizen.Name;
            req.PersonaBlock = RenderPersona(persona, req.CitizenName);
            req.Mood = mind.AffinityToPlayer;
            req.RelationshipSummary = RenderRelationship(mind);

            if (persona != null && persona.Traits != null)
            {
                for (int i = 0; i < persona.Traits.Length; i++)
                    req.Traits.Add(persona.Traits[i]);
            }

            // Top-K memories, most relevant first (importance x recency; decay needs the clock).
            var mems = new List<MemoryEntry>(8);
            mind.Memory.GetTop(sim.TickCount, null, mems, 8);
            for (int i = 0; i < mems.Count; i++)
                req.MemoryLines.Add(mems[i].Text);

            BuildCapabilitySummary(facts, manifest, req.CapabilitySummary);
            return req;
        }

        /// <summary>
        /// The manifest → capability-summary projection: one <see cref="EffectOption"/>
        /// per legal (kind, id). This is the exact enum domain a strict tool schema would
        /// carry — reveal_info's fact ids, agree_task's target indices — so a backend can
        /// only ever pick from what the sim already declared legal this turn.
        /// </summary>
        private static void BuildCapabilitySummary(FactRegistry facts, CapabilityManifest m, List<EffectOption> into)
        {
            if ((m.LegalEffects & Perilune.Sim.EffectKind.SetDisposition) != 0)
                into.Add(new EffectOption(EffectKind.SetDisposition, 0u, "your standing with them"));

            if ((m.LegalEffects & Perilune.Sim.EffectKind.RevealInfo) != 0)
            {
                for (int i = 0; i < m.KnownFactIds.Count; i++)
                {
                    uint id = m.KnownFactIds[i];
                    string label = facts.TryGet(id, out var fact) ? fact.Text : string.Empty;
                    into.Add(new EffectOption(EffectKind.RevealInfo, id, label));
                }
            }

            if ((m.LegalEffects & Perilune.Sim.EffectKind.AgreeTask) != 0)
            {
                for (int i = 0; i < m.AssignableDigTargets.Count; i++)
                {
                    Int3 t = m.AssignableDigTargets[i];
                    // TargetId = index into the manifest's dig-target domain; the runtime
                    // resolves it back to the concrete tile using the same manifest.
                    into.Add(new EffectOption(EffectKind.AgreeTask, (uint)i, DescribeDig(t)));
                }
            }

            if ((m.LegalEffects & Perilune.Sim.EffectKind.FollowPlayer) != 0)
                into.Add(new EffectOption(EffectKind.FollowPlayer, 0u, "walk with you"));

            if ((m.LegalEffects & Perilune.Sim.EffectKind.EndConversation) != 0)
                into.Add(new EffectOption(EffectKind.EndConversation, 0u, "end the conversation"));
        }

        private static string DescribeDig(Int3 t)
        {
            return "clear the debris at (" +
                t.X.ToString(CultureInfo.InvariantCulture) + "," +
                t.Y.ToString(CultureInfo.InvariantCulture) + ") on deck " +
                t.Z.ToString(CultureInfo.InvariantCulture);
        }

        private static string RenderPersona(PersonaSheet p, string name)
        {
            if (p == null) return name + " is a member of the Perilune's crew.";
            var sb = new StringBuilder();
            sb.Append(name);
            if (!string.IsNullOrEmpty(p.RolePreRaid))
                sb.Append(", once a ").Append(p.RolePreRaid).Append(" aboard the MSV Perilune");
            sb.Append('.');
            if (!string.IsNullOrEmpty(p.RaidBackstory))
                sb.Append(' ').Append(p.RaidBackstory);
            if (!string.IsNullOrEmpty(p.SpeechStyle))
                sb.Append(" Speech: ").Append(p.SpeechStyle).Append('.');
            if (p.Traits != null && p.Traits.Length > 0)
                sb.Append(" Traits: ").Append(string.Join(", ", p.Traits)).Append('.');
            return sb.ToString();
        }

        private static string RenderRelationship(CitizenMind mind)
        {
            float a = mind.AffinityToPlayer;
            // v0 one-liner; WS-SOCIAL enriches with reasons (owes you / resents you) later.
            if (a <= -40f) return "hostile toward you";
            if (a < -10f) return "wary of you";
            if (a < 15f) return "neutral toward you";
            if (a < 50f) return "warming to you";
            return "loyal to you";
        }
    }
}
