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
        /// <summary>A sealed compartment below this pressure is losing (or has lost) its air, kPa.
        /// Nominal is <see cref="RoomState.NominalPressureKPa"/> (101.3); 80 kPa is the point a
        /// crew member would notice their ears and start looking for the leak.</summary>
        private const double LowPressureKPa = 80.0;
        /// <summary>A machine below this condition is "wearing out" even if still operational.</summary>
        private const float WornBelow = 0.5f;
        /// <summary>At most this many machines are named; the rest collapse into a count.</summary>
        private const int MaxMachinesNamed = 4;
        /// <summary>At most this many compartments are named on the hull line.</summary>
        private const int MaxRoomsNamed = 3;

        /// <summary>
        /// The compact ship snapshot behind the prompt's <c>[SHIP]</c> block: worst-room air
        /// (CO2 + pressure + oxygen), the compartments that have lost pressure or opened to
        /// vacuum, the machines that are failed / unpowered / wearing out, the ship's water and
        /// food stock, and this crew member's own current task. Five short lines, plain text, no
        /// sim references — the LLM layer only ever sees copied data.
        ///
        /// <para>Why: <see cref="Build"/> used to hand the model persona, mood, memories and legal
        /// effects and NOTHING about the ship, so a live model asked "how are things?" invented a
        /// CO2 crisis out of the fiction and promised a repair it structurally cannot perform.</para>
        ///
        /// <para>It is deliberately NOT a complete report, and the global system rules say so: a
        /// crew member may speak from these facts but must not read an omission as proof that
        /// nothing is wrong. The failure mode of the first cut was exactly that — it reported only
        /// CO2 and <c>Condition</c>, so a shed scrubber (<see cref="Device.Powered"/> false,
        /// <see cref="Device.Condition"/> still 1) and a breached compartment (whose tiles join the
        /// vacuum sink and so vanish from the room list) both read as "every machine aboard is
        /// running", and the model was instructed to DENY the fault the player could see.</para>
        ///
        /// PURE + DETERMINISTIC: it reads the already-computed room list (never
        /// <c>RecomputeIfDirty</c>, which mutates), walks the device/item stores in their canonical
        /// order, and formats every number with InvariantCulture. Same sim state ⇒ same bytes.
        /// </summary>
        internal static string RenderShipState(Simulation sim, Citizen self)
        {
            if (sim == null) return string.Empty;
            var sb = new StringBuilder(384);
            AppendAirLine(sb, sim);
            sb.Append('\n');
            AppendHullLine(sb, sim);
            sb.Append('\n');
            AppendMachineLine(sb, sim);
            sb.Append('\n');
            AppendStoresLine(sb, sim);
            sb.Append('\n');
            AppendOwnJobLine(sb, sim, self);
            return sb.ToString();
        }

        /// <summary>"Air: worst compartment is the galley at 1450 ppm CO2 (stale), 101 kPa, 21%
        /// oxygen." — the single worst pressurised room by CO2, named by its anchor when one
        /// resolves to it, reported on all three readings a crew member can feel. Room 0 is the
        /// vacuum sink and gasless rooms have no mix to judge, so both are left to the hull line —
        /// which is why the closing claim is bounded to CO2 and nothing else.</summary>
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
            if (worst < 0) { sb.Append("no sealed compartment aboard holds an atmosphere at all."); return; }

            Room bad = rooms[worst];
            sb.Append("worst compartment is ").Append(RoomName(sim, worst)).Append(" at ")
              .Append(Whole(worstPpm))
              .Append(" ppm CO2 (")
              .Append(worstPpm >= Co2Bad ? "bad" : worstPpm >= Co2Stale ? "stale" : "normal")
              .Append("), ").Append(Whole(bad.PressureKPa)).Append(" kPa, ")
              .Append(Whole(bad.O2Fraction * 100.0)).Append("% oxygen. ")
              .Append("No other compartment has more CO2 than that.");
        }

        /// <summary>"Hull: the cargo bay is open to vacuum; the galley is down to 42 kPa." — the
        /// compartments the air line CANNOT see. A breached compartment's tiles are flooded into
        /// room 0 by <see cref="RoomState"/>, so it leaves the room list entirely: the only trace
        /// is its ANCHOR, whose probe tile now resolves to the vacuum sink. Sealed-but-emptying
        /// rooms are caught separately by pressure. Anchors then rooms, both in canonical order.</summary>
        private static void AppendHullLine(StringBuilder sb, Simulation sim)
        {
            sb.Append("Hull: ");
            int named = 0, extra = 0;
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                if (string.IsNullOrEmpty(anchors[i].Name)) continue;
                if (sim.Rooms.RoomIdAt(sim.World, anchors[i].Probe) != 0) continue; // still sealed
                if (named >= MaxRoomsNamed) { extra++; continue; }
                if (named > 0) sb.Append("; ");
                sb.Append("the ").Append(anchors[i].Name).Append(" is open to vacuum");
                named++;
            }

            var rooms = sim.Rooms.Rooms;
            for (int i = 1; i < rooms.Count; i++)
            {
                var r = rooms[i];
                if (r == null || r.TileCount <= 0) continue;
                double kpa = r.PressureKPa;
                if (kpa >= LowPressureKPa) continue;
                if (named >= MaxRoomsNamed) { extra++; continue; }
                if (named > 0) sb.Append("; ");
                sb.Append(RoomName(sim, i));
                if (r.TotalMoles <= 0) sb.Append(" has no air left in it");
                else sb.Append(" is down to ").Append(Whole(kpa)).Append(" kPa");
                named++;
            }

            if (named == 0) { sb.Append("every sealed compartment is holding pressure."); return; }
            // The cap must never silently swallow a compartment: a truncated list that LOOKS
            // complete is the same class of lie the whole block exists to stop.
            if (extra > 0)
                sb.Append("; and ").Append(extra.ToString(CultureInfo.InvariantCulture))
                  .Append(" more compartment").Append(extra == 1 ? "" : "s").Append(" in trouble");
            sb.Append('.');
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

        /// <summary>The three ways a machine can be out of action, worst first. A device gets
        /// exactly ONE of these, so nothing is reported twice.</summary>
        private enum MachineFault { None = 0, Failed = 1, Unpowered = 2, Worn = 3 }

        /// <summary>
        /// Classify one device. BROKEN and DEAD are different facts and must read differently:
        /// <see cref="Device.IsOperational"/> only sees <see cref="Device.Condition"/>, so a
        /// scrubber shed by a brownout or switched off by MOSS is pristine-but-dead — it was the
        /// case that made the block claim "every machine aboard is running" while CO2 climbed.
        /// Only power CONSUMERS (DrawKW &gt; 0) can be unpowered: furniture, conduits and tanks
        /// draw nothing and sit off the network by design, so <see cref="Device.Powered"/> is
        /// meaningless for them.
        /// </summary>
        private static MachineFault Classify(Simulation sim, Device d)
        {
            if (!d.IsOperational(sim.Defs)) return MachineFault.Failed;
            if (sim.Defs.Machines[(int)d.Kind].DrawKW > 0f && !d.Powered) return MachineFault.Unpowered;
            if (d.Condition < WornBelow) return MachineFault.Worn;
            return MachineFault.None;
        }

        /// <summary>"Machines: scrubber_ls has failed; vent_2 has no power; pump_2 is wearing out."
        /// — only the machines that are actually in trouble, worst category first and within a
        /// category in device-store order, capped so the block stays compact. Furniture never
        /// wears and never draws, so it never appears here.</summary>
        private static void AppendMachineLine(StringBuilder sb, Simulation sim)
        {
            sb.Append("Machines: ");
            var devices = sim.Devices.Items;
            int named = 0, extra = 0;
            for (var fault = MachineFault.Failed; fault <= MachineFault.Worn; fault++)
            {
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (d == null || Classify(sim, d) != fault) continue;
                    if (named >= MaxMachinesNamed) { extra++; continue; }
                    if (named > 0) sb.Append("; ");
                    sb.Append(DeviceName(d)).Append(FaultPhrase(fault));
                    named++;
                }
            }
            if (named == 0) { sb.Append("no machine is broken, unpowered or badly worn."); return; }
            if (extra > 0)
                sb.Append("; and ").Append(extra.ToString(CultureInfo.InvariantCulture)).Append(" more in trouble");
            sb.Append('.');
        }

        private static string FaultPhrase(MachineFault fault)
        {
            switch (fault)
            {
                case MachineFault.Failed: return " has broken down";
                case MachineFault.Unpowered: return " has no power (shed or switched off) — it is not running";
                default: return " is wearing out";
            }
        }

        /// <summary>"Stores: 250 L of water in the tanks, 3 units of food aboard." — the two stocks
        /// the crew ask about, summed over the canonical device/item stores. Carried stacks count:
        /// food in someone's hands is still food aboard.</summary>
        private static void AppendStoresLine(StringBuilder sb, Simulation sim)
        {
            double liters = 0.0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d != null && d.Kind == DeviceKind.WaterTank) liters += d.StoredLiters;
            }

            int food = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it != null && it.Kind == ItemKind.Potato) food += it.Count;
            }

            sb.Append("Stores: ");
            if (liters <= 0.0) sb.Append("no water left in the tanks");
            else sb.Append(Whole(liters)).Append(" L of water in the tanks");
            sb.Append(", ");
            if (food <= 0) sb.Append("no food left aboard");
            else sb.Append(food.ToString(CultureInfo.InvariantCulture)).Append(" units of food aboard");
            sb.Append('.');
        }

        /// <summary>A reading rounded to a whole number, InvariantCulture — the block never shows a
        /// decimal, so it never shows a locale comma either.</summary>
        private static string Whole(double v)
            => ((long)System.Math.Round(v, System.MidpointRounding.AwayFromZero)).ToString(CultureInfo.InvariantCulture);

        /// <summary>A device's MOSS id when it has one, else its kind — never an empty hole.</summary>
        private static string DeviceName(Device d)
            => string.IsNullOrEmpty(d.Name) ? d.Kind.ToString().ToLowerInvariant() : d.Name;

        /// <summary>"Your job right now: servicing scrubber_ls." — the SAME job state the console's
        /// crew task label reads, phrased in the second person. A crew member with no job is told
        /// so explicitly, which is what stops "I'll get right on it" from sounding true. A crew
        /// member still WALKING to the job is told that too ("on your way to service scrubber_ls"),
        /// for the same reason the console stopped tagging a walking pawn as working.</summary>
        private static void AppendOwnJobLine(StringBuilder sb, Simulation sim, Citizen self)
        {
            sb.Append("Your job right now: ");
            if (self == null) { sb.Append("nothing assigned."); return; }
            bool enRoute = self.HasPath;
            switch (self.JobKind)
            {
                case JobKind.Dig:
                    sb.Append(enRoute ? "on your way to clear debris at " : "clearing debris at ")
                      .Append(Tile(self.JobTarget)).Append('.');
                    break;
                case JobKind.HaulPickup:
                case JobKind.HaulDeliver: sb.Append("hauling cargo across the ship."); break;
                case JobKind.Eat: sb.Append("getting something to eat."); break;
                case JobKind.Drink: sb.Append("getting water."); break;
                case JobKind.Craft:
                    sb.Append(enRoute ? "on your way to work at " : "working at ")
                      .Append(DeviceAt(sim, self.JobTarget, "a workstation")).Append('.');
                    break;
                case JobKind.Maintain:
                    sb.Append(enRoute ? "on your way to service " : "servicing ")
                      .Append(DeviceAt(sim, self.JobTarget, "a machine")).Append('.');
                    break;
                case JobKind.HaulToBuild:
                case JobKind.Build:
                    sb.Append(enRoute ? "on your way to the build site at " : "working the build site at ")
                      .Append(Tile(self.JobTarget)).Append('.');
                    break;
                case JobKind.Deconstruct:
                    // E0-5 WP-2: one JobKind, two targets. A crew member who says "the wall" while
                    // pulling the scrubber apart is lying to the player, and this prose is the
                    // only thing the model knows about what its hands are doing.
                    if (sim != null && sim.TryGetDeviceAt(self.JobTarget, out var stripped))
                        sb.Append(enRoute ? "on your way to strip out " : "stripping out ")
                          .Append(DeviceName(stripped)).Append(" at ")
                          .Append(Tile(self.JobTarget)).Append('.');
                    else
                        sb.Append(enRoute ? "on your way to strip the wall at " : "stripping the wall at ")
                          .Append(Tile(self.JobTarget)).Append('.');
                    break;
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
