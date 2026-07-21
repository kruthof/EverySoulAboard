using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// S2 — the crew-relations lines <see cref="CitizenContext"/> weaves into a citizen's
    /// RelationshipSummary from the live <see cref="SocialSystem"/> opinion graph. Covers the
    /// four contract points: canonical edge-order rendering, dead-target exclusion, byte
    /// stability turn-over-turn while the graph is unchanged, and the end-to-end Build path
    /// (player standing first, crew relations appended). The existing prompt prefix-stability
    /// suite (PromptBuilderTests / ConversationDeterminismTests) is the regression oracle for
    /// the unchanged no-graph case.
    /// </summary>
    public class CrewRelationsTests
    {
        // A room-less scratch sim: RoomId stays 0 everywhere, so a SocialSystem.Tick classifies
        // the edges we nudge WITHOUT any co-location accrual perturbing the opinions.
        private static Simulation Scratch(out Citizen a, out Citizen b, out Citizen c)
        {
            var world = AsciiWorld.Build(new[]
            {
                "######",
                "#....#",
                "#....#",
                "######",
            });
            var sim = new Simulation(world, 42, System.Array.Empty<ISimSystem>());
            a = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            b = sim.AddCitizen("Reyes", new Int3(2, 1, 0));
            c = sim.AddCitizen("Vega", new Int3(3, 1, 0));
            return sim;
        }

        // Nudge a→b to a strong opinion then classify with one social pass (rooms are 0, so no
        // accrual/roll runs — the tier is a pure function of the value we set).
        private static SocialSystem GraphWith(Simulation sim, (uint from, uint to, float op)[] edges)
        {
            var social = new SocialSystem();
            var defs = sim.Defs.Social;
            for (int i = 0; i < edges.Length; i++)
                social.Nudge(edges[i].from, edges[i].to, edges[i].op, defs);
            social.Tick(sim); // classify None → tier
            return social;
        }

        [Test]
        public void CrewRelations_Render_In_Canonical_Edge_Order()
        {
            var sim = Scratch(out var a, out var b, out var c);
            // a rivals Reyes(b), close-friends Vega(c). Edges sort by (From,To): b before c,
            // so the string is ascending-target order regardless of tier.
            var social = GraphWith(sim, new[] { (a.Id, b.Id, -40f), (a.Id, c.Id, 70f) });

            Assert.AreEqual("rival of Reyes; close friend of Vega",
                CitizenContext.RenderCrewRelations(social, sim, a.Id));
        }

        [Test]
        public void CrewRelations_Cover_All_Four_Named_Tiers()
        {
            var sim = Scratch(out var a, out var b, out var c);
            var social = new SocialSystem();
            var defs = sim.Defs.Social;
            // Friend(+40) / CloseFriend(+70) / Rival(-40) / Enemy(-70) — one of each, then classify.
            var d = sim.AddCitizen("Kade", new Int3(4, 1, 0));
            var e = sim.AddCitizen("Sable", new Int3(1, 2, 0));
            social.Nudge(a.Id, b.Id, 40f, defs);
            social.Nudge(a.Id, c.Id, 70f, defs);
            social.Nudge(a.Id, d.Id, -40f, defs);
            social.Nudge(a.Id, e.Id, -70f, defs);
            social.Tick(sim);

            Assert.AreEqual(
                "friend of Reyes; close friend of Vega; rival of Kade; enemy of Sable",
                CitizenContext.RenderCrewRelations(social, sim, a.Id));
        }

        [Test]
        public void CrewRelations_Exclude_Dead_Targets()
        {
            var sim = Scratch(out var a, out var b, out var c);
            var social = GraphWith(sim, new[] { (a.Id, b.Id, 70f), (a.Id, c.Id, 70f) });

            b.Dead = true; // Reyes is gone — the dead do not appear on the roster
            Assert.AreEqual("close friend of Vega",
                CitizenContext.RenderCrewRelations(social, sim, a.Id));
        }

        [Test]
        public void CrewRelations_Only_Show_Outgoing_Named_Tiers()
        {
            var sim = Scratch(out var a, out var b, out var c);
            // b→a is an INCOMING edge for a and must not show; a→c is None-tier (weak) → hidden.
            var social = GraphWith(sim, new[] { (b.Id, a.Id, 70f), (a.Id, c.Id, 5f) });
            Assert.AreEqual("", CitizenContext.RenderCrewRelations(social, sim, a.Id));
        }

        [Test]
        public void CrewRelations_Are_Byte_Stable_Across_Unchanged_Passes()
        {
            var sim = Scratch(out var a, out var b, out var c);
            var social = GraphWith(sim, new[] { (a.Id, b.Id, -40f), (a.Id, c.Id, 70f) });

            string first = CitizenContext.RenderCrewRelations(social, sim, a.Id);
            // Several more social passes with no new interactions: opinions only relax slightly,
            // tiers hold (hysteresis) — the rendered string must not churn (prompt-cache friendly).
            for (int i = 0; i < 25; i++) social.Tick(sim);
            string later = CitizenContext.RenderCrewRelations(social, sim, a.Id);

            Assert.AreEqual(first, later, "unchanged edges must render byte-identically turn-over-turn");
        }

        [Test]
        public void CrewRelations_Empty_When_No_Social_System()
        {
            var sim = Scratch(out var a, out _, out _);
            Assert.AreEqual("", CitizenContext.RenderCrewRelations(null, sim, a.Id));
        }

        // ---------------------------------------------------------------- Build path

        [Test]
        public void Build_Appends_Crew_Relations_After_Player_Standing()
        {
            var fx = ConversationTestScenario.Build();
            // Okafor(id) close-friends Reyes(id) via the sim's own SocialSystem, then classify.
            SocialSystem social = FindSocial(fx.Sim);
            uint reyes = fx.Sim.Citizens.Items[1].Id;
            social.Nudge(fx.CitizenId, reyes, 70f, fx.Sim.Defs.Social);
            social.Tick(fx.Sim);

            var manifest = new CapabilityManifest();
            new CapabilityComputer().Compute(fx.Sim, fx.Minds, fx.Facts, fx.CitizenId, manifest);
            ConversationRequest req = CitizenContext.Build(fx.Sim, fx.Minds, fx.Facts, manifest, fx.CitizenId);

            // Player standing (affinity 0 ⇒ neutral) first, then the crew relation.
            Assert.AreEqual("neutral toward you; close friend of Reyes", req.RelationshipSummary);
        }

        [Test]
        public void Build_Unchanged_When_No_Edges()
        {
            var fx = ConversationTestScenario.Build();
            var manifest = new CapabilityManifest();
            new CapabilityComputer().Compute(fx.Sim, fx.Minds, fx.Facts, fx.CitizenId, manifest);
            ConversationRequest req = CitizenContext.Build(fx.Sim, fx.Minds, fx.Facts, manifest, fx.CitizenId);

            Assert.AreEqual("neutral toward you", req.RelationshipSummary,
                "no graph edges ⇒ the player-standing one-liner is unchanged");
        }

        private static SocialSystem FindSocial(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is SocialSystem s) return s;
            Assert.Fail("scenario sim has no SocialSystem");
            return null;
        }
    }
}
