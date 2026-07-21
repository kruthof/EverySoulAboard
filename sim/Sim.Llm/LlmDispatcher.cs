using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Sim;

namespace Perilune.Llm
{
    /// <summary>Tunables for the <see cref="LlmDispatcher"/> resilience policy.</summary>
    public sealed class DispatcherOptions
    {
        /// <summary>Retries on the SAME backend after a retryable failure, before falling through.</summary>
        public int MaxRetries { get; set; } = 2;
        /// <summary>Per-attempt wall-clock budget; exceeding it is a retryable failure, not a caller cancel.</summary>
        public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(30);
        /// <summary>Failures within <see cref="BreakerWindow"/> on the active backend that trip the breaker.</summary>
        public int BreakerThreshold { get; set; } = 3;
        public TimeSpan BreakerWindow { get; set; } = TimeSpan.FromMinutes(1);
        /// <summary>How long the breaker stays open before a half-open probe of the primary is allowed.</summary>
        public TimeSpan BreakerCooldown { get; set; } = TimeSpan.FromSeconds(30);
        /// <summary>Base backoff; attempt N waits BaseBackoff * 2^N.</summary>
        public TimeSpan BaseBackoff { get; set; } = TimeSpan.FromMilliseconds(200);
    }

    /// <summary>A breaker state transition raised to the host's status callback.</summary>
    public sealed class DispatcherStatus
    {
        public string ActiveBackend { get; }
        public bool Degraded { get; }
        public string Reason { get; }
        public DispatcherStatus(string activeBackend, bool degraded, string reason)
        {
            ActiveBackend = activeBackend; Degraded = degraded; Reason = reason;
        }
        public override string ToString() => "Dispatcher[" + ActiveBackend + (Degraded ? " degraded" : " ok") + "] " + Reason;
    }

    /// <summary>The outcome of one dispatched turn.</summary>
    public sealed class DispatchResult
    {
        public string ReplyText { get; }
        public IReadOnlyList<CitizenEffect> DispatchedEffects { get; }
        public string BackendName { get; }
        public bool Degraded { get; }
        public int Attempts { get; }
        public DispatchResult(string reply, IReadOnlyList<CitizenEffect> effects, string backend, bool degraded, int attempts)
        {
            ReplyText = reply ?? string.Empty;
            DispatchedEffects = effects ?? (IReadOnlyList<CitizenEffect>)Array.Empty<CitizenEffect>();
            BackendName = backend ?? string.Empty;
            Degraded = degraded;
            Attempts = attempts;
        }
    }

    /// <summary>One completed queue item, tagged with the worker that ran it (for the priority contract).</summary>
    public sealed class DrainCompletion
    {
        public LlmRequest Request { get; }
        public bool Foreground { get; }
        public DispatchResult Result { get; }
        public DrainCompletion(LlmRequest request, bool foreground, DispatchResult result)
        {
            Request = request; Foreground = foreground; Result = result;
        }
    }

    /// <summary>
    /// The host-side driver for LLM turns (LLM_CITIZENS.md §10). It lives in Sim.Llm but the host
    /// owns the thread that pumps it. Three jobs:
    ///
    ///  • RESILIENCE. Each turn runs the active backend under a per-request timeout; a retryable
    ///    <see cref="BackendError"/> (or a timeout) is retried with exponential backoff, then falls
    ///    through a backend chain that MUST end in a template backend (which never fails). A circuit
    ///    breaker trips after N failures in a window — hot-swapping the active backend down the chain
    ///    and raising a status callback — with a half-open probe that restores the primary once it
    ///    recovers.
    ///  • HARDENING (L1 gate finding). Effects are dispatched to the sim ONLY after a
    ///    <see cref="TurnComplete"/> delta is actually observed — never merely because "no error was
    ///    seen". A truncated stream (deltas but no completion) dispatches nothing and is treated as a
    ///    retryable failure.
    ///  • SCHEDULING. <see cref="DrainAsync"/> runs the queue with concurrency 1 dialogue + 1
    ///    background: a foreground worker (Dialogue then Summary) and a background worker run in
    ///    parallel, so a flood of background jobs never delays a live dialogue turn.
    ///
    /// Turn execution never mutates sim state directly — effects go through
    /// <see cref="ConversationService.CompleteTurn"/> to the tick-boundary buffer.
    /// </summary>
    public sealed class LlmDispatcher
    {
        private readonly ConversationService _service;
        private readonly IReadOnlyList<IChatBackend> _chain;
        private readonly DispatcherOptions _options;
        private readonly Func<DateTime> _now;
        private readonly Func<TimeSpan, CancellationToken, Task> _delay;
        private readonly Action<DispatcherStatus> _onStatus;

        // Breaker state (guarded by _lock; no await is held inside the lock).
        private readonly object _lock = new object();
        private readonly List<DateTime> _failures = new List<DateTime>();
        private int _activeIndex;      // current backend in the chain (0 = primary)
        private bool _degraded;
        private DateTime _trippedAt;

        private readonly object _queueLock = new object();

        /// <param name="service">The prepare/complete conversation runtime whose Backend this drives.</param>
        /// <param name="backendChain">Primary first, fallbacks next, a template backend LAST (never fails).</param>
        /// <param name="clock">Injected wall clock — no DateTime.Now inside.</param>
        /// <param name="delay">Injected delay (default Task.Delay); tests pass a no-op.</param>
        /// <param name="onStatus">Breaker transition callback (may be null).</param>
        public LlmDispatcher(
            ConversationService service,
            IReadOnlyList<IChatBackend> backendChain,
            DispatcherOptions options = null,
            Func<DateTime> clock = null,
            Func<TimeSpan, CancellationToken, Task> delay = null,
            Action<DispatcherStatus> onStatus = null)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            if (backendChain == null || backendChain.Count == 0)
                throw new ArgumentException("backend chain must be non-empty (and end in a template)", nameof(backendChain));
            _chain = backendChain;
            _options = options ?? new DispatcherOptions();
            _now = clock ?? (() => DateTime.UtcNow);
            _delay = delay ?? ((d, c) => Task.Delay(d, c));
            _onStatus = onStatus;
        }

        /// <summary>The backend currently answering turns (the breaker's active slot).</summary>
        public string ActiveBackend { get { lock (_lock) return _chain[_activeIndex].Caps.Name; } }

        /// <summary>True while the breaker is open (running on a fallback).</summary>
        public bool IsDegraded { get { lock (_lock) return _degraded; } }

        // ------------------------------------------------------------------
        // One turn, with retry + breaker + observed-completion hardening
        // ------------------------------------------------------------------

        public async Task<DispatchResult> RunTurnAsync(uint citizenId, string playerText, CancellationToken ct)
        {
            TurnPlan plan = _service.PrepareTurn(citizenId, playerText);

            int i;
            bool probing;
            lock (_lock) { SelectStart(out i, out probing); }

            int attempts = 0;
            while (i < _chain.Count)
            {
                IChatBackend backend = _chain[i];
                bool advance = false;

                for (int attempt = 0; !advance; attempt++)
                {
                    attempts++;
                    TurnDrain drain = await DrainOnce(backend, plan, playerText, ct).ConfigureAwait(false);

                    if (drain.SawComplete)
                    {
                        lock (_lock) { OnSuccess(i, probing); }
                        IReadOnlyList<CitizenEffect> dispatched = _service.CompleteTurn(plan, drain.Effects);
                        bool degradedNow; lock (_lock) { degradedNow = _degraded; }
                        return new DispatchResult(drain.Text, dispatched, backend.Caps.Name, degradedNow, attempts);
                    }

                    // --- failure on backend i ---
                    if (probing)
                    {
                        // The half-open probe of the primary failed: stay degraded, reset cooldown,
                        // and resume this turn on the active fallback.
                        lock (_lock) { ProbeFailed(); }
                        probing = false;
                        lock (_lock) { i = _activeIndex; }
                        advance = true; // recomputed i; the while-loop picks up the fallback
                        continue;
                    }

                    lock (_lock) { RecordFailure(i); }

                    bool retryable = drain.Error == null || drain.Error.Retryable;
                    if (retryable && attempt < _options.MaxRetries)
                    {
                        await _delay(Backoff(attempt), ct).ConfigureAwait(false);
                        continue; // retry same backend
                    }

                    // give up on this backend → next in chain
                    i++;
                    advance = true;
                }
            }

            // The chain is exhausted without a completion. This should be unreachable when the last
            // entry is a template backend; surface a benign, effect-free turn rather than throw.
            return new DispatchResult(string.Empty, Array.Empty<CitizenEffect>(),
                _chain[_chain.Count - 1].Caps.Name, degraded: true, attempts: attempts);
        }

        // Accumulate one backend stream. A per-request timeout becomes a retryable failure; caller
        // cancellation propagates. Effects are collected but NOT dispatched here.
        private async Task<TurnDrain> DrainOnce(IChatBackend backend, TurnPlan plan, string text, CancellationToken outerCt)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
            if (_options.RequestTimeout > TimeSpan.Zero) linked.CancelAfter(_options.RequestTimeout);

            var sb = new StringBuilder();
            var effects = new List<ProposedEffect>();
            bool sawComplete = false;
            BackendError error = null;

            try
            {
                await foreach (ChatDelta d in backend.SendAsync(plan.Request, text, linked.Token).WithCancellation(linked.Token))
                {
                    switch (d)
                    {
                        case TextDelta td: sb.Append(td.Text); break;
                        case EffectProposed ep: if (ep.Effect != null) effects.Add(ep.Effect); break;
                        case TurnComplete _: sawComplete = true; break;
                        case BackendError be: error = be; break;
                    }
                }
            }
            catch (OperationCanceledException) when (outerCt.IsCancellationRequested)
            {
                throw; // the caller cancelled — propagate, do not treat as a backend failure
            }
            catch (OperationCanceledException)
            {
                error = new BackendError("dispatcher per-request timeout", true);
                sawComplete = false;
            }
            catch (Exception e)
            {
                // A backend must not throw on player text; if one does, quarantine it as retryable.
                error = new BackendError("backend threw: " + e.Message, true);
                sawComplete = false;
            }

            // Hardening: only an observed TurnComplete counts as a completed turn. A stream that ended
            // with deltas but no completion (and no error) is a truncation → retryable failure.
            return new TurnDrain(sb.ToString(), effects, sawComplete, error);
        }

        private readonly struct TurnDrain
        {
            public string Text { get; }
            public List<ProposedEffect> Effects { get; }
            public bool SawComplete { get; }
            public BackendError Error { get; }
            public TurnDrain(string text, List<ProposedEffect> effects, bool sawComplete, BackendError error)
            { Text = text; Effects = effects; SawComplete = sawComplete; Error = error; }
        }

        private TimeSpan Backoff(int attempt)
        {
            double ms = _options.BaseBackoff.TotalMilliseconds * Math.Pow(2, attempt);
            return TimeSpan.FromMilliseconds(ms);
        }

        // ------------------------------------------------------------------
        // Breaker state transitions (all called under _lock)
        // ------------------------------------------------------------------

        private void SelectStart(out int startIndex, out bool probing)
        {
            if (_degraded && (_now() - _trippedAt) >= _options.BreakerCooldown)
            {
                startIndex = 0;   // half-open: probe the primary
                probing = true;
            }
            else
            {
                startIndex = _activeIndex;
                probing = false;
            }
        }

        private void OnSuccess(int index, bool probing)
        {
            if (probing && index == 0)
            {
                // The primary recovered — close the breaker.
                _degraded = false;
                _activeIndex = 0;
                _failures.Clear();
                RaiseStatus("primary restored");
            }
            else if (!_degraded && index == 0)
            {
                _failures.Clear(); // healthy run clears the failure window
            }
            // Success on a fallback while degraded: keep running degraded until a probe restores.
        }

        private void RecordFailure(int failedIndex)
        {
            _failures.Add(_now());
            Prune();
            if (failedIndex == _activeIndex && _activeIndex < _chain.Count - 1 && _failures.Count >= _options.BreakerThreshold)
            {
                _activeIndex++;
                _degraded = true;
                _trippedAt = _now();
                _failures.Clear();
                RaiseStatus("degraded to " + _chain[_activeIndex].Caps.Name);
            }
        }

        private void ProbeFailed()
        {
            _trippedAt = _now(); // restart the cooldown before the next probe
            RaiseStatus("probe failed");
        }

        private void Prune()
        {
            DateTime cutoff = _now() - _options.BreakerWindow;
            _failures.RemoveAll(t => t < cutoff);
        }

        private void RaiseStatus(string reason)
        {
            _onStatus?.Invoke(new DispatcherStatus(_chain[_activeIndex].Caps.Name, _degraded, reason));
        }

        // ------------------------------------------------------------------
        // Queue draining: 1 foreground + 1 background worker
        // ------------------------------------------------------------------

        /// <summary>
        /// Drain the service's request queue to completion using two concurrent workers: a foreground
        /// worker (Dialogue before Summary) and a background worker. Each dequeues from its own lanes
        /// under a lock, so a background flood never sits in front of a dialogue turn. Returns when
        /// both lanes are empty. <paramref name="onComplete"/> observes each finished turn (with the
        /// worker that ran it) — used by callers and tests to verify the priority contract.
        /// </summary>
        public Task DrainAsync(CancellationToken ct, Action<DrainCompletion> onComplete = null)
        {
            Task fg = WorkerAsync(foreground: true, ct, onComplete);
            Task bg = WorkerAsync(foreground: false, ct, onComplete);
            return Task.WhenAll(fg, bg);
        }

        private async Task WorkerAsync(bool foreground, CancellationToken ct, Action<DrainCompletion> onComplete)
        {
            while (!ct.IsCancellationRequested)
            {
                LlmRequest req = Dequeue(foreground);
                if (req == null) break;
                DispatchResult r = await RunTurnAsync(req.CitizenId, req.PlayerText, ct).ConfigureAwait(false);
                onComplete?.Invoke(new DrainCompletion(req, foreground, r));
            }
        }

        private LlmRequest Dequeue(bool foreground)
        {
            lock (_queueLock)
            {
                LlmRequestQueue q = _service.Queue;
                LlmRequest req;
                bool ok = foreground ? q.TryDequeueForeground(out req) : q.TryDequeueBackground(out req);
                return ok ? req : null;
            }
        }
    }
}
