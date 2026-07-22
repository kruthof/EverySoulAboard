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
            req.RelationshipSummary = RenderRelationship(mind, sim, citizenId);

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

            req.ShipState = RenderShipState(sim, citizen);

            BuildCapabilitySummary(facts, manifest, req.CapabilitySummary);
            return req;
        }

        // ------------------------------------------------------------------ ship grounding

        /// <summary>CO2 above this reads as a real problem the crew would talk about (ppm).</summary>
        private const double Co2Bad = 2000.0;
        /// <summary>CO2 above this is noticeably stale but not yet dangerous (ppm).</summary>
        private const double Co2Stale = 1000.0;
        /// <summary>A machine below this condition is "wearing out" even if still operational.</summary>
        private const float WornBelow = 0.5f;
        /// <summary>At most this many machines are named; the rest collapse into a count.</summary>
        private const int MaxMachinesNamed = 4;

        /// <summary>
        /// The compact ship snapshot behind the prompt's <c>[SHIP]</c> block: worst-room air, the
        /// machines that are failed or wearing out, and this crew member's own current task. Three
        /// short lines, plain text, no sim references — the LLM layer only ever sees copied data.
        ///
        /// <para>Why: <see cref="Build"/> used to hand the model persona, mood, memories and legal
        /// effects and NOTHING about the ship, so a live model asked "how are things?" invented a
        /// CO2 crisis out of the fiction and promised a repair it structurally cannot perform. The
        /// global system rules point at this block as the only true report of ship condition.</para>
        ///
        /// PURE + DETERMINISTIC: it reads the already-computed room list (never
        /// <c>RecomputeIfDirty</c>, which mutates), walks the device store in its canonical order,
        /// and formats every number with InvariantCulture. Same sim state ⇒ same bytes.
        /// </summary>
        internal static string RenderShipState(Simulation sim, Citizen self)
        {
            if (sim == null) return string.Empty;
            var sb = new StringBuilder(192);
            AppendAirLine(sb, sim);
            sb.Append('\n');
            AppendMachineLine(sb, sim);
            sb.Append('\n');
            AppendOwnJobLine(sb, sim, self);
            return sb.ToString();
        }

        /// <summary>"Air: worst room is the galley at 1450 ppm CO2 (stale)." — the single worst
        /// pressurised room, named by its anchor when one resolves to it. Room 0 is the vacuum
        /// sink and empty rooms have no atmosphere to judge, so both are skipped.</summary>
        private static void AppendAirLine(StringBuilder sb, Simulation sim)
        {
            sb.Append("Air: ");
            var rooms = sim.Rooms.Rooms;
            int worst = -1;
            double worstPpm = 0.0;
            for (int i = 1; i < rooms.Count; i++)   // 0 = vacuum sink, never a room the crew stand in
            {
                var r = rooms[i];
                if (r == null || r.TileCount <= 0 || r.TotalMoles <= 0) continue;
                double ppm = r.CO2Ppm;
                if (worst < 0 || ppm > worstPpm) { worst = i; worstPpm = ppm; }
            }
            if (worst < 0) { sb.Append("no sealed compartment aboard reports an atmosphere."); return; }

            sb.Append("worst compartment is ").Append(RoomName(sim, worst)).Append(" at ")
              .Append(((int)System.Math.Round(worstPpm, System.MidpointRounding.AwayFromZero))
                          .ToString(CultureInfo.InvariantCulture))
              .Append(" ppm CO2 (")
              .Append(worstPpm >= Co2Bad ? "bad" : worstPpm >= Co2Stale ? "stale" : "normal")
              .Append("). Everywhere else is better than that.");
        }

        /// <summary>The anchor name of a room id ("the galley"), else "an unnamed compartment".
        /// Anchors are walked in their canonical order, so the first match is deterministic.</summary>
        private static string RoomName(Simulation sim, int roomId)
        {
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                if (string.IsNullOrEmpty(anchors[i].Name)) continue;
                if (sim.Rooms.RoomIdAt(sim.World, anchors[i].Probe) == roomId) return "the " + anchors[i].Name;
            }
            return "an unnamed compartment";
        }

        /// <summary>"Machines: scrubber_ls has failed; pump_2 is wearing out." — only the machines
        /// that are actually in trouble, in device-store order, capped so the block stays compact.
        /// Furniture never wears, so it never appears here.</summary>
        private static void AppendMachineLine(StringBuilder sb, Simulation sim)
        {
            sb.Append("Machines: ");
            var devices = sim.Devices.Items;
            int named = 0, extra = 0;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d == null) continue;
                bool failed = !d.IsOperational(sim.Defs);
                bool worn = !failed && d.Condition < WornBelow;
                if (!failed && !worn) continue;
                if (named >= MaxMachinesNamed) { extra++; continue; }
                if (named > 0) sb.Append("; ");
                sb.Append(DeviceName(d)).Append(failed ? " has failed" : " is wearing out");
                named++;
            }
            if (named == 0) { sb.Append("every machine aboard is running."); return; }
            if (extra > 0)
                sb.Append("; and ").Append(extra.ToString(CultureInfo.InvariantCulture)).Append(" more in the same state");
            sb.Append('.');
        }

        /// <summary>A device's MOSS id when it has one, else its kind — never an empty hole.</summary>
        private static string DeviceName(Device d)
            => string.IsNullOrEmpty(d.Name) ? d.Kind.ToString().ToLowerInvariant() : d.Name;

        /// <summary>"Your job right now: servicing scrubber_ls." — the SAME job state the console's
        /// crew task label reads, phrased in the second person. A crew member with no job is told
        /// so explicitly, which is what stops "I'll get right on it" from sounding true.</summary>
        private static void AppendOwnJobLine(StringBuilder sb, Simulation sim, Citizen self)
        {
            sb.Append("Your job right now: ");
            if (self == null) { sb.Append("nothing assigned."); return; }
            switch (self.JobKind)
            {
                case JobKind.Dig: sb.Append("clearing debris at ").Append(Tile(self.JobTarget)).Append('.'); break;
                case JobKind.HaulPickup:
                case JobKind.HaulDeliver: sb.Append("hauling cargo across the ship."); break;
                case JobKind.Eat: sb.Append("getting something to eat."); break;
                case JobKind.Drink: sb.Append("getting water."); break;
                case JobKind.Craft: sb.Append("working at ").Append(DeviceAt(sim, self.JobTarget, "a workstation")).Append('.'); break;
                case JobKind.Maintain: sb.Append("servicing ").Append(DeviceAt(sim, self.JobTarget, "a machine")).Append('.'); break;
                case JobKind.HaulToBuild:
                case JobKind.Build: sb.Append("working the build site at ").Append(Tile(self.JobTarget)).Append('.'); break;
                default: sb.Append("nothing assigned — you are standing here, talking."); break;
            }
        }

        private static string DeviceAt(Simulation sim, Int3 pos, string fallback)
            => sim != null && sim.TryGetDeviceAt(pos, out var d) ? DeviceName(d) : fallback;

        private static string Tile(Int3 p)
            => p.X.ToString(CultureInfo.InvariantCulture) + "," + p.Y.ToString(CultureInfo.InvariantCulture) +
               " on deck " + p.Z.ToString(CultureInfo.InvariantCulture);

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

        /// <summary>
        /// The relationship line the prompt renders: the player-standing one-liner first,
        /// then the citizen's crew relations drawn from the live <see cref="SocialSystem"/>
        /// opinion graph ("wary of you; close friend of Reyes; rival of Vega"). Crew
        /// relations are a PURE read of the sim-canonical, (From,To)-sorted edge list, so
        /// the whole string is deterministic and — crucially for prompt-cache friendliness —
        /// byte-stable turn-over-turn while the edges do not change.
        /// </summary>
        private static string RenderRelationship(CitizenMind mind, Simulation sim, uint citizenId)
        {
            string standing = RenderPlayerStanding(mind);
            string crew = RenderCrewRelations(FindSocial(sim), sim, citizenId);
            return crew.Length == 0 ? standing : standing + "; " + crew;
        }

        private static string RenderPlayerStanding(CitizenMind mind)
        {
            float a = mind.AffinityToPlayer;
            // v0 one-liner; WS-SOCIAL enriches with reasons (owes you / resents you) later.
            if (a <= -40f) return "hostile toward you";
            if (a < -10f) return "wary of you";
            if (a < 15f) return "neutral toward you";
            if (a < 50f) return "warming to you";
            return "loyal to you";
        }

        /// <summary>
        /// Render this citizen's classified crew relations ("close friend of Okafor; rival
        /// of Reyes") from the <see cref="SocialSystem"/> edge list, or "" when there are
        /// none. Only OUTGOING edges (From == citizenId) that have settled into a named
        /// <see cref="RelationType"/> tier are shown, in the edge list's canonical
        /// (From,To)-sorted order — so the string is a deterministic function of the graph.
        /// A relation whose target is dead or unnamed is EXCLUDED: the dead do not appear on
        /// the roster, and an id with no name would render "friend of " with a hole in it.
        /// Internal so the ordering / dead-exclusion / stability contract can be asserted
        /// directly against a hand-built graph without a full conversation.
        /// </summary>
        internal static string RenderCrewRelations(SocialSystem social, Simulation sim, uint citizenId)
        {
            if (social == null || sim == null) return string.Empty;
            var sb = new StringBuilder();
            var edges = social.Edges;
            for (int i = 0; i < edges.Count; i++)
            {
                var edge = edges[i];
                if (edge.From != citizenId) continue;
                string tier = TierPhrase((RelationType)edge.Rel);
                if (tier == null) continue; // None / unclassified — not a spoken relation
                if (!sim.Citizens.TryGet(edge.To, out var other) || other.Dead) continue; // dead excluded
                if (string.IsNullOrEmpty(other.Name)) continue; // can't name them → skip
                if (sb.Length > 0) sb.Append("; ");
                sb.Append(tier).Append(' ').Append(other.Name);
            }
            return sb.ToString();
        }

        private static string TierPhrase(RelationType rel)
        {
            switch (rel)
            {
                case RelationType.CloseFriend: return "close friend of";
                case RelationType.Friend: return "friend of";
                case RelationType.Rival: return "rival of";
                case RelationType.Enemy: return "enemy of";
                default: return null;
            }
        }

        /// <summary>Locate the sim's <see cref="SocialSystem"/> (the opinion graph owner), or
        /// null if this sim was built without one. A pure read of the fixed system array.</summary>
        private static SocialSystem FindSocial(Simulation sim)
        {
            if (sim == null) return null;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is SocialSystem social) return social;
            return null;
        }
    }
}
