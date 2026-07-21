using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;
using LlmEffectKind = Perilune.Llm.EffectKind;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L5 — the host-side dispatcher: retry + circuit breaker + fallback chain, the observed-
    /// TurnComplete hardening, the per-request timeout, and the 1-dialogue + 1-background scheduler.
    /// Backends are scripted fakes; the clock and backoff delay are injected, so degradation
    /// transitions are exact and no test waits on a wall clock or a socket.
    /// </summary>
    [TestFixture]
    public sealed class LlmDispatcherTests
    {
        private static Func<TimeSpan, CancellationToken, Task> NoDelay => (d, c) => Task.CompletedTask;

        private static ProposedEffect Disp(float m) => new ProposedEffect(LlmEffectKind.SetDisposition, 0u, m);

        private static (ConversationService service, PendingEffectBuffer buffer, ConversationTestScenario.Fixture fx) NewService()
        {
            var fx = ConversationTestScenario.Build(withSecret: true);
            var buffer = new PendingEffectBuffer();
            // The dispatcher sets Backend per turn via the chain; a placeholder template is fine here.
            var service = new ConversationService(fx.Sim, fx.Minds, fx.Facts, new TemplateBackend(), buffer);
            return (service, buffer, fx);
        }

        private static int DrainCount(PendingEffectBuffer buffer)
        {
            int n = 0;
            while (buffer.TryDequeue(out _)) n++;
            return n;
        }

        // ----------------------------------------------------------------------------
        // Success + observed-completion hardening
        // ----------------------------------------------------------------------------

        [Test]
        public async Task Success_OnPrimary_DispatchesEffects()
        {
            var (service, buffer, fx) = NewService();
            var primary = new ScriptedBackend("anthropic", _ => ScriptedBackend.Success("Sure.", Disp(4f)));
            var chain = new IChatBackend[] { primary, new TemplateBackend() };
            var d = new LlmDispatcher(service, chain, new DispatcherOptions(), delay: NoDelay);

            DispatchResult r = await d.RunTurnAsync(fx.CitizenId, "hi", default);

            Assert.That(r.BackendName, Is.EqualTo("anthropic"));
            Assert.That(r.Degraded, Is.False);
            Assert.That(r.DispatchedEffects.Count, Is.EqualTo(1));
            Assert.That(DrainCount(buffer), Is.EqualTo(1), "the completed turn's effect reached the buffer");
        }

        [Test]
        public async Task NoTurnComplete_DispatchesNothing_FallsThrough()
        {
            var (service, buffer, fx) = NewService();
            // Primary streams text + an effect but never completes → must NOT dispatch.
            var primary = new ScriptedBackend("anthropic", _ => ScriptedBackend.NoComplete("partial", Disp(9f)));
            // Terminal completes cleanly with no effects.
            var terminal = new ScriptedBackend("template", _ => ScriptedBackend.Success(string.Empty));
            var d = new LlmDispatcher(service, new IChatBackend[] { primary, terminal },
                new DispatcherOptions { MaxRetries = 0 }, delay: NoDelay);

            DispatchResult r = await d.RunTurnAsync(fx.CitizenId, "hi", default);

            Assert.That(r.BackendName, Is.EqualTo("template"), "the un-completed primary fell through to the terminal");
            Assert.That(DrainCount(buffer), Is.EqualTo(0),
                "effects from a stream that never emitted TurnComplete are never dispatched");
        }

        // ----------------------------------------------------------------------------
        // Per-request timeout → retryable failure → fallback
        // ----------------------------------------------------------------------------

        [Test]
        public async Task Timeout_CancelsInFlightSendAsync_AndFallsThrough()
        {
            var (service, buffer, fx) = NewService();
            var chain = new IChatBackend[] { new HangingBackend(), new TemplateBackend() };
            var d = new LlmDispatcher(service, chain,
                new DispatcherOptions { MaxRetries = 0, RequestTimeout = TimeSpan.FromMilliseconds(60) },
                delay: NoDelay);

            DispatchResult r = await d.RunTurnAsync(fx.CitizenId, "hi", default);

            Assert.That(r.BackendName, Is.EqualTo("template"), "the hung backend timed out and fell through");
            Assert.That(d.IsDegraded, Is.False, "a single timeout does not trip the breaker");
        }

        // ----------------------------------------------------------------------------
        // Circuit breaker: trip after threshold, then half-open probe restores
        // ----------------------------------------------------------------------------

        [Test]
        public async Task CircuitBreaker_TripsThenHalfOpenRestores()
        {
            var (service, buffer, fx) = NewService();
            var clock = new FakeClock(new DateTime(2026, 7, 21, 0, 0, 0, DateTimeKind.Utc));

            // flaky fails for its first three calls, then recovers.
            var flaky = new ScriptedBackend("anthropic",
                idx => idx < 3 ? ScriptedBackend.Fail(true) : ScriptedBackend.Success("back online", Disp(1f)));
            var terminal = new ScriptedBackend("template", _ => ScriptedBackend.Success(string.Empty));

            var statuses = new List<DispatcherStatus>();
            var opts = new DispatcherOptions
            {
                MaxRetries = 0,
                BreakerThreshold = 3,
                BreakerWindow = TimeSpan.FromMinutes(5),
                BreakerCooldown = TimeSpan.FromSeconds(30),
            };
            var d = new LlmDispatcher(service, new IChatBackend[] { flaky, terminal },
                opts, clock: clock.Func, delay: NoDelay, onStatus: s => statuses.Add(s));

            // Turns 1-2: flaky fails but breaker not yet tripped (falls through to terminal).
            var r1 = await d.RunTurnAsync(fx.CitizenId, "1", default);
            var r2 = await d.RunTurnAsync(fx.CitizenId, "2", default);
            Assert.That(d.IsDegraded, Is.False);
            Assert.That(r1.BackendName, Is.EqualTo("template"));
            Assert.That(r2.BackendName, Is.EqualTo("template"));

            // Turn 3: the third flaky failure trips the breaker → degraded onto the terminal.
            var r3 = await d.RunTurnAsync(fx.CitizenId, "3", default);
            Assert.That(d.IsDegraded, Is.True);
            Assert.That(d.ActiveBackend, Is.EqualTo("template"));
            Assert.That(statuses.Count, Is.EqualTo(1));
            Assert.That(statuses[0].Degraded, Is.True);

            // Turn 4: still within cooldown → served by the terminal WITHOUT probing flaky.
            int callsBefore = flaky.Calls;
            var r4 = await d.RunTurnAsync(fx.CitizenId, "4", default);
            Assert.That(flaky.Calls, Is.EqualTo(callsBefore), "no probe before cooldown elapses");
            Assert.That(r4.BackendName, Is.EqualTo("template"));

            // Advance past cooldown → the next turn half-open probes flaky, which now succeeds → restore.
            clock.Advance(TimeSpan.FromSeconds(31));
            var r5 = await d.RunTurnAsync(fx.CitizenId, "5", default);
            Assert.That(r5.BackendName, Is.EqualTo("anthropic"), "the recovered primary served the probe turn");
            Assert.That(d.IsDegraded, Is.False);
            Assert.That(d.ActiveBackend, Is.EqualTo("anthropic"));
            Assert.That(statuses[statuses.Count - 1].Degraded, Is.False, "final transition is a restore");
        }

        [Test]
        public async Task RetryOnRetryableError_ThenSucceedsOnSameBackend()
        {
            var (service, buffer, fx) = NewService();
            // Fail once (retryable), then succeed on the retry — never falls through.
            var primary = new ScriptedBackend("anthropic",
                idx => idx == 0 ? ScriptedBackend.Fail(true) : ScriptedBackend.Success("ok", Disp(2f)));
            var d = new LlmDispatcher(service, new IChatBackend[] { primary, new TemplateBackend() },
                new DispatcherOptions { MaxRetries = 2 }, delay: NoDelay);

            DispatchResult r = await d.RunTurnAsync(fx.CitizenId, "hi", default);

            Assert.That(r.BackendName, Is.EqualTo("anthropic"));
            Assert.That(r.Attempts, Is.EqualTo(2), "one failed attempt + one successful retry");
            Assert.That(DrainCount(buffer), Is.EqualTo(1));
        }

        [Test]
        public async Task NonRetryableError_DoesNotRetry_FallsThrough()
        {
            var (service, buffer, fx) = NewService();
            var primary = new ScriptedBackend("anthropic", _ => ScriptedBackend.Fail(false)); // permanent
            var terminal = new ScriptedBackend("template", _ => ScriptedBackend.Success("hi"));
            var d = new LlmDispatcher(service, new IChatBackend[] { primary, terminal },
                new DispatcherOptions { MaxRetries = 3 }, delay: NoDelay);

            DispatchResult r = await d.RunTurnAsync(fx.CitizenId, "hi", default);

            Assert.That(primary.Calls, Is.EqualTo(1), "a non-retryable error is not retried");
            Assert.That(r.BackendName, Is.EqualTo("template"));
        }

        // ----------------------------------------------------------------------------
        // Scheduler: background flood never delays dialogue
        // ----------------------------------------------------------------------------

        [Test]
        public async Task FloodingBackground_NeverDelaysDialogue()
        {
            var (service, buffer, fx) = NewService();
            var ok = new ScriptedBackend("anthropic", _ => ScriptedBackend.Success("ok", Disp(1f)));
            var d = new LlmDispatcher(service, new IChatBackend[] { ok, new TemplateBackend() },
                new DispatcherOptions(), delay: NoDelay);

            for (int i = 0; i < 200; i++) service.Enqueue(fx.CitizenId, "bg" + i, LlmPriority.Background);
            service.Enqueue(fx.CitizenId, "talk to me", LlmPriority.Dialogue);

            var completions = new ConcurrentQueue<DrainCompletion>();
            await d.DrainAsync(default, completions.Enqueue);

            var all = new List<DrainCompletion>(completions);
            var foreground = all.FindAll(c => c.Foreground);
            var background = all.FindAll(c => !c.Foreground);

            Assert.That(all.Count, Is.EqualTo(201), "every queued turn ran");
            Assert.That(foreground.Count, Is.EqualTo(1));
            Assert.That(foreground[0].Request.Priority, Is.EqualTo(LlmPriority.Dialogue),
                "the foreground worker handled the dialogue turn — not queued behind 200 background jobs");
            Assert.That(background.Count, Is.EqualTo(200));
            foreach (DrainCompletion c in background)
                Assert.That(c.Request.Priority, Is.EqualTo(LlmPriority.Background));
        }

        // ----------------------------------------------------------------------------
        // 100 parallel completions respect the 64/tick pump cap
        // ----------------------------------------------------------------------------

        [Test]
        public async Task HundredParallelCompletions_RespectThe64PerTickPumpCap()
        {
            var (service, buffer, fx) = NewService();
            var ok = new ScriptedBackend("anthropic", _ => ScriptedBackend.Success("ok", Disp(1f)));
            var d = new LlmDispatcher(service, new IChatBackend[] { ok, new TemplateBackend() },
                new DispatcherOptions(), delay: NoDelay);

            var tasks = new Task<DispatchResult>[100];
            for (int i = 0; i < tasks.Length; i++) tasks[i] = d.RunTurnAsync(fx.CitizenId, "turn" + i, default);
            DispatchResult[] results = await Task.WhenAll(tasks);

            int dispatched = 0;
            foreach (DispatchResult r in results) dispatched += r.DispatchedEffects.Count;
            Assert.That(dispatched, Is.EqualTo(100), "all 100 concurrent turns dispatched their effect thread-safely");

            var pump = new EffectPump(buffer, fx.Minds, fx.Facts);
            pump.Tick(fx.Sim); // drains at most 64
            int remaining = DrainCount(buffer);
            Assert.That(remaining, Is.EqualTo(100 - EffectPump.MaxEffectsPerTick),
                "the pump applied exactly 64 this tick; the rest stayed queued");
        }
    }
}
