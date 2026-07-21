using Perilune.Content;
using Perilune.Gen;
using Perilune.Llm;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE P1 exit test (PLAN.md): one headless scenario exercising every P1 lane's
    /// contract together. A GENERATED ship boots (WS-SHIPGEN); its crew share the
    /// corridor and form opinions (WS-SOCIAL); a bolted-on telescope resolves a comet
    /// by honest SNR (WS-NAV); an identical template-backend conversation in both
    /// twins applies a validated effect through the ordinary command inbox (WS-LLM);
    /// and the twin runs stay hash-identical throughout (the spine). WS-CLIENT's
    /// contract (the wire) is covered by its own golden display-list tests;
    /// WS-CONTENT's by ContentPackTests — both run in the same suite.
    /// </summary>
    public class P1ExitTests
    {
        private const ulong Seed = 4242;
        private const int Ticks = 1200; // two sim-minutes: power settles, social accrues

        private sealed class Twin
        {
            public GenSimHost Host;
            public NavSystem Nav;
            public SocialSystem Social;
            public uint CometId;
            public uint CrewA, CrewB;
            public uint FactId;
            public ConversationService Conversation;
        }

        private static Twin BuildTwin()
        {
            var t = new Twin();
            t.Host = GenSimHost.Build(ProceduralShips.Generate(ShipRecipe.FromSeed(Seed)));
            var sim = t.Host.Sim;

            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (systems[i] is NavSystem nav) t.Nav = nav;
                if (systems[i] is SocialSystem social) t.Social = social;
            }
            Assert.That(t.Nav, Is.Not.Null);
            Assert.That(t.Social, Is.Not.Null);

            var citizens = sim.Citizens.Items;
            Assert.That(citizens.Count, Is.GreaterThanOrEqualTo(2), "recipe ships 2 crew");
            t.CrewA = citizens[0].Id;
            t.CrewB = citizens[1].Id;

            // Bolt a telescope onto the first crew tile: generated ships run conduits
            // under every carved tile, so it joins the reactor-fed network and powers.
            sim.AddDevice(DeviceKind.Telescope, citizens[0].Pos, "scope_p1");

            // One comet, in range for a unit emission (snr = (400/300)^2 ≈ 1.78 ≥ 1).
            t.CometId = t.Nav.AddContact(ContactKind.Comet, 300, 0, 0, 0, 1f);

            t.Conversation = new ConversationService(sim, t.Host.Minds, t.Host.Facts, new TemplateBackend());

            // Seed crew A's mind the way a persona pass will: identity + one real,
            // sim-registered secret, so the conversation can reveal an actual fact.
            CitizenMind mind = t.Host.Minds.Minds.GetOrCreate(t.CrewA);
            mind.Persona = new PersonaSheet
            {
                CitizenId = t.CrewA,
                Name = citizens[0].Name,
                RolePreRaid = "survey astronomer",
                Traits = new[] { "stoic" },
            };
            ShipFact fact = t.Host.Facts.Add("There is a sensor calibration log in the observatory locker.");
            mind.KnownFactIds.Add(fact.Id);
            mind.Persona.Secrets = new[]
            {
                new SecretRecord { FactId = fact.Id, Text = "I kept the calibration log.", RevealDifficulty = 0.4f },
            };
            t.FactId = fact.Id;
            return t;
        }

        [Test]
        public void GeneratedShip_Social_Nav_Conversation_ComposeDeterministically()
        {
            var a = BuildTwin();
            var b = BuildTwin();

            // Same conversation, same tick, both twins — identical command logs.
            var turnA = a.Conversation.Converse(a.CrewA, "Do you have any secrets for me?");
            var turnB = b.Conversation.Converse(b.CrewA, "Do you have any secrets for me?");
            Assert.That(turnA.DispatchedEffects.Count, Is.GreaterThan(0),
                "the secret question must dispatch whitelisted effects (RevealInfo + warmth)");
            Assert.That(turnA.DispatchedEffects.Count, Is.EqualTo(turnB.DispatchedEffects.Count));

            for (int i = 0; i < Ticks; i++) { a.Host.Sim.Tick(); b.Host.Sim.Tick(); }

            // WS-NAV: the powered telescope resolved the comet by SNR.
            Assert.That(a.Nav.TryGetContact(a.CometId, out var comet), Is.True);
            Assert.That(comet.Detected, Is.True,
                "a powered telescope on a generated ship must resolve the in-range comet");

            // WS-SOCIAL: corridor-mates formed a mutual opinion.
            Assert.That(a.Social.GetOpinion(a.CrewA, a.CrewB), Is.GreaterThan(0f),
                "crew sharing the recirculated corridor must familiarize");
            Assert.That(a.Social.GetOpinion(a.CrewB, a.CrewA),
                Is.EqualTo(a.Social.GetOpinion(a.CrewA, a.CrewB)));

            // WS-LLM: the validated effects landed at a tick boundary — the REAL fact
            // is now revealed and the reveal's warmth reached the mind.
            Assert.That(a.Host.Facts.TryGet(a.FactId, out ShipFact revealed), Is.True);
            Assert.That(revealed.RevealedToCrewPlayer, Is.True,
                "the RevealInfo effect must have applied through the inbox");
            Assert.That(a.Host.Minds.Minds.TryGet(a.CrewA, out CitizenMind mind), Is.True);
            Assert.That(mind.AffinityToPlayer, Is.GreaterThan(0f),
                "the reveal's SetDisposition must have applied through the inbox");

            // The spine: identical seeds + identical command logs ⇒ identical hashes.
            Assert.That(a.Host.Sim.StateHash(), Is.EqualTo(b.Host.Sim.StateHash()),
                "twin generated ships with twin conversations must stay hash-identical");
        }

        [Test]
        public void GeneratedShipDefsCanComeFromContentPacks()
        {
            // WS-CONTENT composes with WS-SHIPGEN: a generated ship built with
            // pack-loaded defs (core pack, verbatim) hashes identically to one built
            // with the compiled defaults — the pack channel is behavior-neutral.
            var problems = new System.Collections.Generic.List<string>();
            var corePack = new PackSource
            {
                Manifest = PackManifest.Parse("id = \"core\"\n", "core/pack.toml", problems)
            };
            var viaPacks = ContentSet.BuildDefs(new[] { corePack }, problems);
            Assert.That(problems, Is.Empty);

            var withDefaults = GenSimHost.Build(ProceduralShips.Generate(ShipRecipe.FromSeed(Seed)));
            var withPacks = GenSimHost.Build(ProceduralShips.Generate(ShipRecipe.FromSeed(Seed)), viaPacks);
            for (int i = 0; i < 300; i++) { withDefaults.Sim.Tick(); withPacks.Sim.Tick(); }
            Assert.That(withPacks.Sim.StateHash(), Is.EqualTo(withDefaults.Sim.StateHash()));
        }
    }
}
