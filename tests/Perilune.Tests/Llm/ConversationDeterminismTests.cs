using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Same (persona, sim state, player text) twice ⇒ identical proposed effects and an
    /// identical StateHash trajectory. Proves the conversation path is a pure read: it
    /// does not advance the sim's RNG or perturb its hash, and its mind mutations are
    /// reproducible.
    /// </summary>
    [TestFixture]
    public sealed class ConversationDeterminismTests
    {
        private static readonly string[] Script =
        {
            "Hello there.",
            "What happened during the raid?",
            "Do you have any secrets?",
            "You've been useless, honestly.",
            "Thanks for your help.",
        };

        [Test]
        public void TwinRun_IdenticalEffects_And_IdenticalHashTrajectory()
        {
            var a = Run();
            var b = Run();

            Assert.That(b.Hashes, Is.EqualTo(a.Hashes), "StateHash trajectory must match tick-for-tick");
            Assert.That(b.EffectSignature, Is.EqualTo(a.EffectSignature), "dispatched effects must be identical");
            Assert.That(b.FinalAffinity, Is.EqualTo(a.FinalAffinity), "mind mutations must be reproducible");
            Assert.That(b.FinalTrust, Is.EqualTo(a.FinalTrust));

            // The trajectory is non-trivial: the sim actually advanced.
            Assert.That(a.Hashes[a.Hashes.Count - 1], Is.Not.EqualTo(a.Hashes[0]));
        }

        private sealed class Result
        {
            public List<ulong> Hashes = new List<ulong>();
            public string EffectSignature;
            public float FinalAffinity;
            public float FinalTrust;
        }

        private static Result Run()
        {
            var fx = ConversationTestScenario.Build(traits: new[] { "sardonic" }, withSecret: true);
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend());
            var r = new Result();
            var sig = new System.Text.StringBuilder();

            r.Hashes.Add(fx.Sim.StateHash());
            foreach (string line in Script)
            {
                ConversationTurn turn = service.Converse(fx.CitizenId, line);
                foreach (CitizenEffect e in turn.DispatchedEffects)
                    sig.Append(e.Kind).Append('|');
                sig.Append(';');
                for (int t = 0; t < 3; t++)
                {
                    fx.Sim.Tick();
                    r.Hashes.Add(fx.Sim.StateHash());
                }
            }

            fx.Minds.Minds.TryGet(fx.CitizenId, out CitizenMind mind);
            r.EffectSignature = sig.ToString();
            r.FinalAffinity = mind.AffinityToPlayer;
            r.FinalTrust = mind.TrustToPlayer;
            return r;
        }
    }
}
