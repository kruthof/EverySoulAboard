using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Deterministic conversation fixture: the shared two-room GlyphTestScenario ship
    /// plus a host-owned <see cref="MindState"/>/<see cref="FactRegistry"/> wired the way
    /// a real host wires the effect spine. The primary citizen (Okafor) gets a persona
    /// and — optionally — a known secret backed by a real fact, so RevealInfo has
    /// something to reveal. Nothing here ticks the sim or touches its hashed state.
    /// </summary>
    internal static class ConversationTestScenario
    {
        internal sealed class Fixture
        {
            public Simulation Sim;
            public MindState Minds;
            public FactRegistry Facts;
            public uint CitizenId;
            public uint FactId;       // 0 when built without a secret
            public Int3 DigTarget;    // valid only when built withDig
        }

        public static Fixture Build(string[] traits = null, bool withSecret = true, bool withDig = false)
        {
            var sim = GlyphTestScenario.Build(42);
            var minds = new MindState();
            var facts = new FactRegistry();

            Citizen okafor = sim.Citizens.Items[0]; // Okafor @ (2,2,0)
            CitizenMind mind = minds.Minds.GetOrCreate(okafor.Id);
            mind.Persona = new PersonaSheet
            {
                CitizenId = okafor.Id,
                Name = okafor.Name,
                RolePreRaid = "reactor technician",
                SpeechStyle = "clipped deck-slang",
                Traits = traits ?? new[] { "stoic" },
            };

            var fx = new Fixture { Sim = sim, Minds = minds, Facts = facts, CitizenId = okafor.Id };

            if (withSecret)
            {
                ShipFact fact = facts.Add("A supply cache is hidden behind the aft bulkhead on deck 0.");
                mind.KnownFactIds.Add(fact.Id);
                mind.Persona.Secrets = new[]
                {
                    new SecretRecord { FactId = fact.Id, Text = "I stashed supplies before the raid.", RevealDifficulty = 0.4f },
                };
                fx.FactId = fact.Id;
            }

            if (withDig)
            {
                // Turn a left-room floor tile into a designated debris block (as the 'R'
                // map char would): SetWall clears Walkable; the adjacent (3,2,0) floor
                // stays a reachable approach tile for Okafor at (2,2,0).
                var target = new Int3(3, 1, 0);
                sim.World.SetWall(target, TileDefs.Debris);
                sim.World.SetFlag(target, TileFlags.Designated, true);
                fx.DigTarget = target;
                // ⭐ M2-2 (OD-H): the LLM effect pipeline is BOUNDED BY the work grid at both ends —
                // CapabilityComputer will not OFFER a dig, and EffectValidator will not GRANT one,
                // to a crew member whose Mine is off, which is every crew member at boot. A fixture
                // built `withDig` is asking for a dig to be offerable, so it gives Okafor the work
                // the player gives on the WORK tab. ⚠️ Deliberately scoped to this branch: a fixture
                // built WITHOUT a dig must keep the shipped grid, or the two LLM gates would be
                // silently untested everywhere except WorkTypeVetoTests.
                okafor.GiveAllWork();
            }

            return fx;
        }
    }
}
