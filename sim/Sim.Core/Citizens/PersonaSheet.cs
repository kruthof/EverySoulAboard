using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>A secret backed by a real <see cref="ShipFact"/> — the LLM can only reveal facts that exist.</summary>
    public sealed class SecretRecord
    {
        public uint FactId;
        public string Text = "";
        public float RevealDifficulty; // 0..1, checked against trust by the dialogue layer
        public bool RevealedToPlayer;
    }

    /// <summary>
    /// Citizen identity (LLM_CITIZENS.md §2) — plain serializable data. Deviation:
    /// CitizenId is the sim's uint entity id (not a GUID string), and
    /// RelationshipNotes keys are citizen ids.
    /// TODO(persistence): serialize via a dedicated save chapter alongside minds.
    /// </summary>
    public sealed class PersonaSheet
    {
        public uint CitizenId;
        public string Name = "";
        public string RolePreRaid = "";      // "hydroponics engineer"
        public string RoleNow = "";          // v0: generic post-raid duty
        public string[] Traits = System.Array.Empty<string>();  // 3 from the trait pool
        public string[] Values = System.Array.Empty<string>();  // 2
        public string[] Fears = System.Array.Empty<string>();   // 2
        public SecretRecord[] Secrets = System.Array.Empty<SecretRecord>();
        public string RaidBackstory = "";    // 2-4 sentences: what they saw/lost in the Lien raid
        public string SpeechStyle = "";
        public Dictionary<uint, string> RelationshipNotes = new Dictionary<uint, string>(); // v1: filled by social sim

        /// <summary>The toward-cids whose relationship is CONCEALED — a dashed edge on the
        /// RELATIONS web. Host-owned mind state, parallel to <see cref="RelationshipNotes"/>:
        /// NOT hashed (excluded from the MEMS StateChecksum, exactly like the notes' prose) and
        /// never emitted to the portrait-pipeline persona dump. Populated for authored crew only.
        /// Surfacing this on the relations wire deliberately bypasses the dialogue
        /// RevealDifficulty gate — the relations view is the player's omniscient eye (the mock's
        /// dashed-edge legend). Personal <see cref="Secrets"/> stay off the wire.</summary>
        public HashSet<uint> RelationshipSecrets = new HashSet<uint>();
    }

    /// <summary>One authored secret (the P2 slice crew): the prose the citizen may reveal,
    /// plus the REAL <see cref="ShipFact"/> to register for it. Fact-first, exactly like
    /// <see cref="PersonaGenerator.CreateMind"/> — the reveal path only ever surfaces facts
    /// that exist in the <see cref="FactRegistry"/>, so an authored secret without a backing
    /// fact is unrepresentable.</summary>
    public sealed class AuthoredSecret
    {
        public string SecretText = "";     // what the citizen says when they reveal it
        public string FactText = "";       // the canonical ShipFact registered for it
        public Int3? FactMarker;           // optional world tile the fact points at (a cache, a hatch…)
        public float RevealDifficulty = 0.5f; // 0..1, checked against trust by the dialogue layer
    }

    /// <summary>One authored relationship edge: how this citizen feels about another, keyed by
    /// NAME (resolved to a citizen id at boot). Seeded deterministically into the
    /// <see cref="SocialSystem"/> before the first tick — no RNG, no co-location warm-up.</summary>
    public struct AuthoredRelationship
    {
        public string Toward;   // the other citizen's Name
        public float Opinion;   // seeded directed opinion (the SocialSystem clamp applies)
        public string Note;     // optional RelationshipNote prose (LLM prompt colour)
        public bool Secret;     // concealed bond → a dashed edge on the relations web (unhashed
                                // persona state; never touches Opinion, so the SOCL fold is unmoved)
    }

    /// <summary>A fully hand-authored persona (the P2 "Talking Ship" slice crew). Same shape
    /// <see cref="PersonaGenerator.CreateMind"/> produces from its pools, but every field is
    /// authored rather than rolled — so building it is RNG-free and reproducible, and the
    /// hosts can construct minds for authored crew with the same call pattern as the generator.</summary>
    public sealed class AuthoredPersona
    {
        public string Name = "";
        public string RolePreRaid = "";
        public string RoleNow = "general crew";
        public string[] Traits = System.Array.Empty<string>();       // 3
        public string[] Values = System.Array.Empty<string>();       // 2
        public string[] Fears = System.Array.Empty<string>();        // 2
        public string SpeechStyle = "";
        public string RaidBackstory = "";                            // 2-4 sentences
        public AuthoredSecret[] Secrets = System.Array.Empty<AuthoredSecret>();
        public AuthoredRelationship[] Relationships = System.Array.Empty<AuthoredRelationship>();
    }

    /// <summary>
    /// v0 deterministic persona pass (LLM_CITIZENS.md §2, §12): seeded template
    /// pools, one RNG stream forked per citizen id (Fork never advances sim.Rng,
    /// so worldgen order elsewhere is undisturbed). Same seed + same citizen ids →
    /// identical personas and identical fact registries. LLM enrichment (v1)
    /// rewrites prose only; the facts stay canonical.
    /// Call at worldgen/spawn time, before ticking — the fork derives from the
    /// current RNG state, so the call site must be deterministic.
    /// </summary>
    public static class PersonaGenerator
    {
        private const ulong PersonaStream = 0x5045524C554E45UL; // "PERLUNE"

        private static readonly string[] TraitPool =
        {
            "sardonic", "devout", "cowardly", "meticulous", "stoic",
            "superstitious", "garrulous", "haunted", "unbending", "wry",
            "restless", "gentle",
        };

        private static readonly string[] ValuePool =
        {
            "loyalty above rules", "never waste air", "the ship comes first",
            "truth even when it stings", "protect the young ones",
            "keep the ledger balanced", "finish what you seal",
            "no one eats alone",
        };

        private static readonly string[] FearPool =
        {
            "the dark between airlocks", "the Lien returning", "dying in vacuum",
            "the water running out", "being forgotten out here",
            "sealed hatches with someone behind them", "the reactor going quiet",
            "sleeping through an alarm",
        };

        private static readonly string[] SpeechStylePool =
        {
            "short sentences, technical jargon, avoids eye contact",
            "slow and formal, old freighter courtesies",
            "rapid-fire, jokes when nervous",
            "quiet, chooses words like spare parts",
            "clipped deck-slang, softens around food",
            "long pauses, then everything at once",
        };

        private static readonly string[] RolePreRaidPool =
        {
            "hydroponics engineer", "cargo master", "medtech", "navigator",
            "reactor technician", "deckhand", "comms officer", "quartermaster",
            "hull welder", "galley cook",
        };

        private static readonly string[] RaidScenePool =
        {
            "they were sealing the aft hatch on Deck C when the boarding clamps bit through the ring corridor",
            "they were mid-shift in the cargo spine when the lights went red and stayed red",
            "they hid in a service tray under Deck B while boots rang on the plating overhead",
            "they dragged two crates of seed stock through smoke on the hangar deck",
            "they held the galley door shut while the pressure warnings screamed",
            "they watched the escape pods leave without them from the observation blister",
        };

        private static readonly string[] RaidLossPool =
        {
            "Their bunkmate never made it out of the forward section.",
            "Everything they owned went out with the vented deck.",
            "They still keep the tool they were holding when it started.",
            "They have not spoken the names of the taken since.",
            "Half their shift roster is just gone.",
            "They came out of it owing a life they can't repay.",
        };

        private static readonly string[] WitnessFactPool =
        {
            "The Lien boarding captain came aboard in person during the raid and took only the navigation core.",
            "One of the Perilune's escape pods was launched empty during the raid.",
            "The manifest for cargo hold two was falsified before the Perilune ever left port.",
            "Someone unsealed the aft airlock from the inside during the raid.",
        };

        /// <summary>
        /// Generate the persona for one citizen, create its secret's backing fact in
        /// the registry, and store both on a (created-if-missing) mind. This is the
        /// host's one call per citizen at worldgen.
        /// </summary>
        public static CitizenMind CreateMind(Simulation sim, MindState minds, FactRegistry facts, Citizen citizen)
        {
            var mind = minds.Minds.GetOrCreate(citizen.Id);
            var rng = sim.Rng.Fork(PersonaStream + citizen.Id);

            var sheet = new PersonaSheet
            {
                CitizenId = citizen.Id,
                Name = citizen.Name,
                RoleNow = "general crew",
                RolePreRaid = RolePreRaidPool[rng.NextInt(RolePreRaidPool.Length)],
                Traits = PickDistinct(rng, TraitPool, 3),
                Values = PickDistinct(rng, ValuePool, 2),
                Fears = PickDistinct(rng, FearPool, 2),
                SpeechStyle = SpeechStylePool[rng.NextInt(SpeechStylePool.Length)],
            };

            string scene = RaidScenePool[rng.NextInt(RaidScenePool.Length)];
            string loss = RaidLossPool[rng.NextInt(RaidLossPool.Length)];
            sheet.RaidBackstory =
                $"{citizen.Name} served as {sheet.RolePreRaid} aboard the MSV Perilune. " +
                $"When the Lien boarded, {scene}. {loss}";

            // Secrets are sim facts first: the fact (and any marker tile) exists
            // in the registry whether or not it is ever spoken aloud.
            ShipFact fact;
            string secretText;
            if (rng.NextBool())
            {
                var world = sim.World;
                var cache = new Int3(rng.NextInt(world.Width), rng.NextInt(world.Height), rng.NextInt(world.Depth));
                fact = facts.Add(
                    $"A pre-raid supply cache is hidden near ({cache.X},{cache.Y}) on deck {cache.Z}.",
                    cache);
                secretText = "I stashed supplies off the manifest before the raid and never logged the spot.";
            }
            else
            {
                fact = facts.Add(WitnessFactPool[rng.NextInt(WitnessFactPool.Length)]);
                secretText = "I saw something during the raid that I have never reported.";
            }

            sheet.Secrets = new[]
            {
                new SecretRecord
                {
                    FactId = fact.Id,
                    Text = secretText,
                    RevealDifficulty = 0.3f + 0.6f * rng.NextFloat(),
                },
            };

            mind.Persona = sheet;
            mind.KnownFactIds.Add(fact.Id);
            return mind;
        }

        /// <summary>
        /// Build the mind for one AUTHORED citizen (the P2 slice) from an explicit
        /// <see cref="AuthoredPersona"/> — the authored counterpart to <see cref="CreateMind"/>,
        /// same call pattern and same fact-first contract, but RNG-FREE: it never forks or
        /// advances <c>sim.Rng</c>, so authored crew add nothing to the hashed sim trajectory
        /// and the call site need not be RNG-ordered. Each secret's backing <see cref="ShipFact"/>
        /// is registered in <paramref name="facts"/> and added to the mind's known-fact ids, so
        /// <see cref="CapabilityComputer"/> can later offer a <c>RevealInfo</c> for it. Relationship
        /// seeding is a separate boot step (it needs every citizen's id first).
        /// </summary>
        public static CitizenMind CreateAuthoredMind(Simulation sim, MindState minds, FactRegistry facts,
                                                     Citizen citizen, AuthoredPersona spec)
        {
            var mind = minds.Minds.GetOrCreate(citizen.Id);

            var sheet = new PersonaSheet
            {
                CitizenId = citizen.Id,
                Name = string.IsNullOrEmpty(spec.Name) ? citizen.Name : spec.Name,
                RolePreRaid = spec.RolePreRaid ?? "",
                RoleNow = string.IsNullOrEmpty(spec.RoleNow) ? "general crew" : spec.RoleNow,
                Traits = (string[])(spec.Traits ?? System.Array.Empty<string>()).Clone(),
                Values = (string[])(spec.Values ?? System.Array.Empty<string>()).Clone(),
                Fears = (string[])(spec.Fears ?? System.Array.Empty<string>()).Clone(),
                SpeechStyle = spec.SpeechStyle ?? "",
                RaidBackstory = spec.RaidBackstory ?? "",
            };

            // Secrets are sim facts first: register the backing fact, then wire the reveal record
            // and mark the mind as knowing it (the reveal_info enum domain).
            var authored = spec.Secrets ?? System.Array.Empty<AuthoredSecret>();
            var secrets = new SecretRecord[authored.Length];
            for (int i = 0; i < authored.Length; i++)
            {
                var a = authored[i];
                var fact = facts.Add(a.FactText, a.FactMarker);
                secrets[i] = new SecretRecord
                {
                    FactId = fact.Id,
                    Text = a.SecretText,
                    RevealDifficulty = a.RevealDifficulty,
                };
                mind.KnownFactIds.Add(fact.Id);
            }
            sheet.Secrets = secrets;

            mind.Persona = sheet;
            return mind;
        }

        private static string[] PickDistinct(SimRng rng, string[] pool, int count)
        {
            var picks = new string[count];
            for (int i = 0; i < count; i++)
            {
                while (true)
                {
                    string candidate = pool[rng.NextInt(pool.Length)];
                    bool duplicate = false;
                    for (int j = 0; j < i; j++)
                    {
                        if (picks[j] == candidate) { duplicate = true; break; }
                    }
                    if (!duplicate) { picks[i] = candidate; break; }
                }
            }
            return picks;
        }
    }
}
