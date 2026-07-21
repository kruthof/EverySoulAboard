using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Tick-boundary re-validation and clamps: even an effect a backend "proposed" from
    /// a valid manifest is checked again against CURRENT state, and magnitudes are
    /// bounded. These drive the effect-apply command directly (the exact path the
    /// conversation runtime enqueues onto).
    /// </summary>
    [TestFixture]
    public sealed class EffectValidationTests
    {
        private static List<CitizenEffectAppliedEvent> AppliedEvents(Simulation sim)
        {
            var list = new List<CitizenEffectAppliedEvent>();
            var span = sim.Events.Read<CitizenEffectAppliedEvent>();
            for (int i = 0; i < span.Length; i++) list.Add(span[i]);
            return list;
        }

        [Test]
        public void StaleManifest_FactAlreadyOut_RejectsReveal_IsError()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            fx.Sim.EnqueueCommand(new ApplyCitizenEffectCommand(
                new RevealInfo(fx.CitizenId, fx.FactId), fx.Minds, fx.Facts));

            // The world moves on between manifest and apply: the fact leaks first.
            Assert.That(fx.Facts.TryGet(fx.FactId, out ShipFact fact), Is.True);
            fact.RevealedToCrewPlayer = true;

            fx.Sim.Tick();

            bool rejected = false;
            foreach (CitizenEffectAppliedEvent ev in AppliedEvents(fx.Sim))
                if (ev.Kind == EffectKind.RevealInfo && !ev.Accepted) rejected = true;
            Assert.That(rejected, Is.True, "a stale RevealInfo must be rejected (is_error path)");
        }

        [Test]
        public void SetDisposition_ClampsAffinityAndTrust()
        {
            var fx = ConversationTestScenario.Build(withSecret: false);
            fx.Sim.EnqueueCommand(new ApplyCitizenEffectCommand(
                new SetDisposition(fx.CitizenId, 999f, 999f, "over the moon"), fx.Minds, fx.Facts));

            fx.Sim.Tick();

            Assert.That(fx.Minds.Minds.TryGet(fx.CitizenId, out CitizenMind mind), Is.True);
            Assert.That(mind.AffinityToPlayer, Is.EqualTo(EffectValidator.MaxAffinityDeltaPerDay),
                "|ΔAffinity| is capped by the per-day budget");
            Assert.That(mind.TrustToPlayer, Is.EqualTo(EffectValidator.MaxTrustDeltaPerEffect),
                "ΔTrust is capped per effect");
        }

        [Test]
        public void SetDisposition_DailyBudget_ExhaustsAndRejectsSecondPush()
        {
            var fx = ConversationTestScenario.Build(withSecret: false);

            fx.Sim.EnqueueCommand(new ApplyCitizenEffectCommand(
                new SetDisposition(fx.CitizenId, 999f, 0f, "day's warmth"), fx.Minds, fx.Facts));
            fx.Sim.Tick();

            fx.Sim.EnqueueCommand(new ApplyCitizenEffectCommand(
                new SetDisposition(fx.CitizenId, 50f, 0f, "more"), fx.Minds, fx.Facts));
            fx.Sim.Tick();

            Assert.That(fx.Minds.Minds.TryGet(fx.CitizenId, out CitizenMind mind), Is.True);
            Assert.That(mind.AffinityToPlayer, Is.EqualTo(EffectValidator.MaxAffinityDeltaPerDay),
                "budget exhausted: the second push cannot move affinity further today");

            bool secondRejected = false;
            foreach (CitizenEffectAppliedEvent ev in AppliedEvents(fx.Sim))
                if (ev.Kind == EffectKind.SetDisposition && !ev.Accepted) secondRejected = true;
            Assert.That(secondRejected, Is.True, "the over-budget push is rejected");
        }

        [Test]
        public void DeadCitizen_EffectRejected()
        {
            var fx = ConversationTestScenario.Build(withSecret: false);
            Assert.That(fx.Sim.Citizens.TryGet(fx.CitizenId, out Citizen c), Is.True);
            c.Dead = true;

            fx.Sim.EnqueueCommand(new ApplyCitizenEffectCommand(
                new SetDisposition(fx.CitizenId, 5f, 5f, "hello?"), fx.Minds, fx.Facts));
            fx.Sim.Tick();

            bool rejected = false;
            foreach (CitizenEffectAppliedEvent ev in AppliedEvents(fx.Sim))
                if (!ev.Accepted) rejected = true;
            Assert.That(rejected, Is.True, "no effect applies to a dead citizen");
        }
    }
}
