using NUnit.Framework;
using Perilune.Llm;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Priority-queue scaffolding (LLM_CITIZENS.md §10): P0 dialogue drains before P1
    /// summaries before P2 background, FIFO within a class, and background only when no
    /// foreground work is queued.
    /// </summary>
    [TestFixture]
    public sealed class LlmRequestQueueTests
    {
        [Test]
        public void DrainsInStrictPriorityOrder_FifoWithinClass()
        {
            var q = new LlmRequestQueue();
            // Enqueue out of priority order, with two dialogue turns to check FIFO.
            q.Enqueue(new LlmRequest(1, "bg", LlmPriority.Background));
            q.Enqueue(new LlmRequest(2, "sum", LlmPriority.Summary));
            q.Enqueue(new LlmRequest(3, "d1", LlmPriority.Dialogue));
            q.Enqueue(new LlmRequest(4, "d2", LlmPriority.Dialogue));

            Assert.That(q.Count, Is.EqualTo(4));

            Assert.That(Next(q), Is.EqualTo("d1"));  // dialogue, arrival order
            Assert.That(Next(q), Is.EqualTo("d2"));
            Assert.That(Next(q), Is.EqualTo("sum")); // then summary
            Assert.That(Next(q), Is.EqualTo("bg"));  // then background

            Assert.That(q.TryDequeue(out _), Is.False);
            Assert.That(q.Count, Is.EqualTo(0));
        }

        [Test]
        public void HasForegroundWork_TracksDialogueAndSummaryOnly()
        {
            var q = new LlmRequestQueue();
            q.Enqueue(new LlmRequest(1, "bg", LlmPriority.Background));
            Assert.That(q.HasForegroundWork, Is.False, "background alone is not foreground work");

            q.Enqueue(new LlmRequest(2, "d", LlmPriority.Dialogue));
            Assert.That(q.HasForegroundWork, Is.True);
        }

        [Test]
        public void Service_PumpOnce_RunsHighestPriorityQueuedTurn()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend());

            service.Enqueue(fx.CitizenId, "just background chatter", LlmPriority.Background);
            service.Enqueue(fx.CitizenId, "do you have any secrets?", LlmPriority.Dialogue);

            bool ran = service.PumpOnce(out ConversationTurn turn);
            Assert.That(ran, Is.True);
            // Dialogue drained first: the secrets turn proposes a RevealInfo.
            bool hasReveal = false;
            foreach (var e in turn.DispatchedEffects)
                if (e is Perilune.Sim.RevealInfo) hasReveal = true;
            Assert.That(hasReveal, Is.True, "the P0 dialogue turn ran before the P2 background turn");
            Assert.That(service.Queue.Count, Is.EqualTo(1), "the background turn is still queued");
        }

        private static string Next(LlmRequestQueue q)
        {
            Assert.That(q.TryDequeue(out LlmRequest r), Is.True);
            return r.PlayerText;
        }
    }
}
