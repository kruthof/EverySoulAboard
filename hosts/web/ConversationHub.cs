using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Llm;
using Perilune.Sim;
using Perilune.Tui;   // SimHost

namespace Perilune.Web
{
    /// <summary>
    /// The talking half of the web host (L6): everything needed for a browser to hold a live
    /// conversation with a crew member, wired onto the SAME sim stack the rest of GameSession
    /// drives. It owns the <see cref="ConversationService"/> (dispatching accepted effects to
    /// the host's <see cref="PendingEffectBuffer"/>, drained by EffectPump at the next tick), a
    /// backend CHAIN that always ends in an offline <see cref="TemplateBackend"/>, and a
    /// <see cref="CostMeter"/> fed real host timestamps.
    ///
    /// THREAD AFFINITY (the invariant this class is built around). Only the sim thread ever
    /// reads sim state: <see cref="PrepareTurn"/> — the pure snapshot — runs on the sim thread,
    /// between ticks, inside GameSession's command drain. The immutable <see cref="TurnPlan"/> is
    /// the ONLY thing that crosses onto the background dialogue task; that task speaks to the
    /// backend using plan.Request alone, appends chat events to a thread-safe outbox, and, on an
    /// observed <see cref="TurnComplete"/>, calls <see cref="ConversationService.CompleteTurn"/>
    /// (which touches only the plan and the thread-safe effect buffer — never sim state). Two
    /// debug tripwires enforce this: sim reads assert they are on the sim thread; the dialogue
    /// driver asserts it is NOT. The sim never blocks on a backend; a backend never sees the sim.
    ///
    /// Because <see cref="LlmDispatcher.RunTurnAsync"/> re-runs PrepareTurn on ITS worker thread
    /// (which would read the sim off the sim thread), L6 drives turns through this purpose-built
    /// pump instead — reusing the same PrepareTurn/CompleteTurn split and backend-chain shape, but
    /// keeping the snapshot on the sim thread.
    ///
    /// RESILIENCE POLICY (honest, and deliberately simpler than <see cref="LlmDispatcher"/>'s
    /// breaker): per turn, the primary backend gets up to 1 + maxRetries attempts, each bounded by
    /// a per-request timeout (a timeout or a throw is a retryable failure); on exhaustion the turn
    /// falls through the chain to the offline template terminator, which never fails. A completion
    /// counts ONLY on an observed <see cref="TurnComplete"/> (a truncated stream dispatches
    /// nothing). "Degraded" means the last turn was answered by a fallback rather than the primary;
    /// while degraded the primary is re-probed once at the START of every new turn — there is NO
    /// time-based cooldown, backoff, or breaker window here (that is the LlmDispatcher's job). If a
    /// chain with no template terminator exhausts, the turn ends reason "error".
    /// </summary>
    internal sealed class ConversationHub
    {
        private sealed class Session
        {
            public int Sid;
            public uint Cid;
            public string Name = "";
            // The conversation so far: completed player↔citizen lines, oldest first — what the
            // backend sees as history on the next turn. WRITTEN only by the background driver
            // while InFlight is true; READ (snapshot-copied into the outgoing request) only on
            // the sim thread while InFlight is false. The driver's appends happen-before its
            // volatile InFlight=false write and Say/PumpPending gate dispatch on !InFlight, so
            // the two sides never touch the list concurrently. Bounded: the session ends at
            // ChatSession.MaxExchanges, so this never exceeds 2 * MaxExchanges lines.
            public readonly List<TranscriptLine> Transcript = new List<TranscriptLine>();
            public int Seq;                      // monotonic delta sequence for this session
            public volatile bool InFlight;       // a turn is streaming right now
            public volatile bool Ended;          // farewell / cap / error reached
            public int Exchanges;                // completed turns (sim/driver only)
            public readonly Queue<string> Pending = new Queue<string>(); // says queued behind an in-flight turn
        }

        private readonly SimHost _host;
        private readonly Simulation _sim;
        private readonly Action<string> _broadcast;
        private readonly ConversationService _service;
        private readonly IReadOnlyList<IChatBackend> _chain;   // primary first, TemplateBackend last
        private readonly CostMeter _cost;
        private readonly Func<DateTime> _clock;
        private readonly int _maxRetries;
        private readonly TimeSpan _requestTimeout;

        private readonly ConcurrentQueue<string> _outbox = new ConcurrentQueue<string>();
        private readonly Dictionary<int, Session> _sessions = new Dictionary<int, Session>();
        private readonly object _completeLock = new object();   // serialises CompleteTurn + _service.Backend swap
        // CostMeter is an unsynchronised List/decimal aggregate: Record runs on background dialogue
        // threads, CostPerHourUsd on the sim thread (StatusPayload). ALL access goes through this
        // lock so a background prune can never shrink the window mid-read on the sim thread.
        private readonly object _costLock = new object();

        private int _nextSid = 1;
        private int _inFlightCount;             // Interlocked
        private volatile bool _degraded;        // running on the fallback backend
        private volatile string _activeBackend;
        private int _simThreadId;               // 0 until captured

        public ConversationHub(SimHost host, Action<string> broadcast,
            IReadOnlyList<IChatBackend> chain, Func<DateTime> clock,
            decimal budgetPerHourUsd, IReadOnlyDictionary<string, ModelPrice> prices,
            int maxRetries = 2, TimeSpan? requestTimeout = null)
        {
            _host = host ?? throw new ArgumentNullException(nameof(host));
            _sim = host.Sim;
            _broadcast = broadcast ?? (_ => { });
            _chain = (chain != null && chain.Count > 0) ? chain : new IChatBackend[] { new TemplateBackend() };
            _service = new ConversationService(_sim, host.Minds, host.Facts, _chain[0], host.Effects);
            _clock = clock ?? (() => DateTime.UtcNow);
            _cost = new CostMeter(prices ?? new Dictionary<string, ModelPrice>(), budgetPerHourUsd);
            _activeBackend = _chain[0].Caps.Name;
            _maxRetries = maxRetries < 0 ? 0 : maxRetries;
            // Per-request wall budget: a live backend that never terminates would otherwise wedge
            // the session (InFlight stuck true, later says queued forever). A timeout is a retryable
            // failure that feeds the degrade chain like any other.
            _requestTimeout = requestTimeout ?? TimeSpan.FromSeconds(60);
        }

        /// <summary>Record the thread that owns the sim (called from GameSession's loop / test drive)
        /// so the affinity tripwires can fire. Idempotent.</summary>
        public void CaptureSimThread() => _simThreadId = Thread.CurrentThread.ManagedThreadId;

        private void AssertSimThread()
        {
            if (_simThreadId != 0)
                Debug.Assert(Thread.CurrentThread.ManagedThreadId == _simThreadId,
                    "sim-owned state was read off the sim thread — only the TurnPlan may cross");
        }

        private void AssertOffSimThread()
        {
            if (_simThreadId != 0)
                Debug.Assert(Thread.CurrentThread.ManagedThreadId != _simThreadId,
                    "the dialogue driver ran on the sim thread — it must own no sim reads");
        }

        // ------------------------------------------------------------------ sim-thread API

        /// <summary>Open a conversation with a crew member. Dead/unknown/mindless ⇒ a single chat
        /// end "unavailable" (no session). Otherwise: allocate a sid, snapshot the persona on the
        /// sim thread for the card + speaker name, and emit chat start. A fresh session starts
        /// with an EMPTY transcript — history never bleeds across talk sessions.</summary>
        public void Talk(uint cid)
        {
            AssertSimThread();
            bool conversable = _sim.Citizens.TryGet(cid, out var c) && !c.Dead
                && _host.Minds != null && _host.Minds.Minds.TryGet(cid, out _);
            if (!conversable)
            {
                Enqueue(WireFormat.ChatEnd(_nextSid++, "unavailable"));
                return;
            }

            int sid = _nextSid++;
            TurnPlan plan = _service.PrepareTurn(cid, string.Empty); // pure persona snapshot (sim thread)
            string name = plan.Request != null && !string.IsNullOrEmpty(plan.Request.CitizenName)
                ? plan.Request.CitizenName
                : (string.IsNullOrEmpty(c.Name) ? "#" + cid.ToString(CultureInfo.InvariantCulture) : c.Name);

            _sessions[sid] = new Session { Sid = sid, Cid = cid, Name = name };
            Enqueue(WireFormat.ChatStart(sid, cid, name));
        }

        /// <summary>One player utterance on a session. If a turn is already streaming, the text is
        /// QUEUED (no double dispatch); PumpPending drains it once the turn lands. Otherwise the
        /// snapshot is taken here (sim thread) and the turn is driven on a background task.</summary>
        public void Say(int sid, string text)
        {
            AssertSimThread();
            if (!_sessions.TryGetValue(sid, out var s) || s.Ended) return;
            if (s.InFlight) { s.Pending.Enqueue(text ?? string.Empty); return; }
            Dispatch(s, text ?? string.Empty);
        }

        /// <summary>End a session in the player's own words. Idempotent; ignores unknown sids.</summary>
        public void Bye(int sid)
        {
            AssertSimThread();
            if (!_sessions.TryGetValue(sid, out var s) || s.Ended) return;
            s.Ended = true;
            Enqueue(WireFormat.ChatEnd(sid, "done"));
        }

        /// <summary>Dispatch any say that was queued while a turn was in flight — one per session,
        /// only when the session is idle. Called each sim-loop iteration (and by tests).</summary>
        public void PumpPending()
        {
            AssertSimThread();
            foreach (var kv in _sessions)
            {
                var s = kv.Value;
                if (!s.InFlight && !s.Ended && s.Pending.Count > 0)
                    Dispatch(s, s.Pending.Dequeue());
            }
        }

        private void Dispatch(Session s, string text)
        {
            AssertSimThread();
            TurnPlan plan = _service.PrepareTurn(s.Cid, text); // snapshot between ticks (sim thread)
            // Deliver the conversation history to the backend: an immutable COPY taken here, on
            // the sim thread, while no turn is in flight — so the plan (the only thing that
            // crosses onto the background task) never shares a mutable list with the session.
            plan.Request.Transcript = new List<TranscriptLine>(s.Transcript);
            s.InFlight = true;
            Interlocked.Increment(ref _inFlightCount);
            _ = Task.Run(() => DriveTurnAsync(s, plan, text));
        }

        /// <summary>Broadcast every queued chat/status event (sim thread, from Render). Ordering is
        /// FIFO, so start precedes deltas precedes line/effect precedes end.</summary>
        public void Flush()
        {
            AssertSimThread();
            while (_outbox.TryDequeue(out var msg)) _broadcast(msg);
        }

        public bool HasPending => !_outbox.IsEmpty;

        /// <summary>The periodic llmstatus strip: active backend, degraded flag, rolling hourly
        /// cost (InvariantCulture), and queue depths (turns in flight + says waiting).</summary>
        public string StatusPayload()
        {
            AssertSimThread();
            int queued = 0;
            foreach (var kv in _sessions) queued += kv.Value.Pending.Count;
            decimal cph;
            lock (_costLock) cph = _cost.CostPerHourUsd(_clock());
            return WireFormat.LlmStatus(_activeBackend, _degraded, cph, Volatile.Read(ref _inFlightCount), queued);
        }

        /// <summary>The ship's log over the wire — Chronicle.Render of the host's HistorySystem.</summary>
        public string ChroniclePayload() => WireFormat.Chronicle(Chronicle.Render(_host.History));

        // ------------------------------------------------------------------ background driver

        private async Task DriveTurnAsync(Session s, TurnPlan plan, string text)
        {
            AssertOffSimThread();
            try
            {
                IChatBackend answering = null;
                Drain result = default;

                for (int bi = 0; bi < _chain.Count; bi++)
                {
                    IChatBackend backend = _chain[bi];
                    // The primary gets retries while healthy; a fallback (or a degraded primary probe)
                    // gets one shot — the template never fails, so the chain always terminates.
                    int attempts = (bi == 0 && !_degraded) ? 1 + _maxRetries : 1;
                    result = await DrainBackend(s, backend, plan, text, attempts).ConfigureAwait(false);
                    if (result.SawComplete) { answering = backend; _degraded = bi != 0; _activeBackend = backend.Caps.Name; break; }
                    _degraded = true; // this backend failed; we will fall through (or exhaust the chain)
                }

                if (answering == null)
                {
                    // Chain exhausted with no completion (only possible without a template terminator).
                    s.Ended = true;
                    Enqueue(WireFormat.ChatEnd(s.Sid, "error"));
                    return;
                }

                IReadOnlyList<CitizenEffect> dispatched;
                lock (_completeLock)
                {
                    _service.Backend = answering;                 // the cap CompleteTurn honours
                    dispatched = _service.CompleteTurn(plan, result.Effects); // → PendingEffectBuffer (tick-boundary)
                }
                lock (_costLock)
                    _cost.Record(result.Usage ?? new TurnUsage(0, 0, 0, 0, answering.Caps.Name), LlmPriority.Dialogue, _clock());

                // Record the completed exchange — the player's utterance and the authoritative
                // accumulated citizen line — as history for the NEXT turn. Written while InFlight
                // is still true: the sim thread cannot dispatch (and so cannot snapshot the list)
                // until the finally's volatile InFlight=false write publishes these appends.
                // Only a COMPLETED turn is recorded; a failed/errored turn leaves no history.
                s.Transcript.Add(new TranscriptLine(ChatSession.PlayerSpeaker, text));
                s.Transcript.Add(new TranscriptLine(s.Name, result.Text));

                Enqueue(WireFormat.ChatLine(s.Sid, "crew", result.Text)); // authoritative accumulated turn
                bool endByEffect = false;
                for (int i = 0; i < dispatched.Count; i++)
                {
                    if (dispatched[i] is EndConversation) { endByEffect = true; continue; }
                    string note = EffectNote(dispatched[i]);
                    if (note != null) Enqueue(WireFormat.ChatEffect(s.Sid, note));
                }

                s.Exchanges++;
                if (endByEffect || s.Exchanges >= ChatSession.MaxExchanges)
                {
                    s.Ended = true;
                    Enqueue(WireFormat.ChatEnd(s.Sid, "done"));
                }
            }
            finally
            {
                s.InFlight = false;
                Interlocked.Decrement(ref _inFlightCount);
            }
        }

        // Stream one backend up to maxAttempts times, emitting live text deltas to the outbox.
        // Only an OBSERVED TurnComplete counts as success (L1 hardening) — a truncated stream is a
        // retryable failure. Effects are collected but never dispatched here.
        private async Task<Drain> DrainBackend(Session s, IChatBackend backend, TurnPlan plan, string text, int maxAttempts)
        {
            Drain last = default;
            for (int attempt = 0; attempt < maxAttempts; attempt++)
            {
                var sb = new StringBuilder();
                var effects = new List<ProposedEffect>();
                bool complete = false;
                TurnUsage usage = null;
                using (var cts = new CancellationTokenSource())
                {
                    if (_requestTimeout > TimeSpan.Zero) cts.CancelAfter(_requestTimeout);
                    try
                    {
                        await foreach (ChatDelta d in backend.SendAsync(plan.Request, text, cts.Token)
                            .WithCancellation(cts.Token).ConfigureAwait(false))
                        {
                            switch (d)
                            {
                                case TextDelta td:
                                    sb.Append(td.Text);
                                    Enqueue(WireFormat.ChatDelta(s.Sid, s.Seq++, td.Text));
                                    break;
                                case EffectProposed ep:
                                    if (ep.Effect != null) effects.Add(ep.Effect);
                                    break;
                                case TurnComplete tc:
                                    complete = true; usage = tc.Usage;
                                    break;
                                case BackendError _:
                                    complete = false;
                                    break;
                            }
                        }
                    }
                    catch
                    {
                        // A per-request timeout (cts cancel) or a backend that throws on player text
                        // is a retryable failure — never propagated, so the driver's finally always
                        // clears InFlight and the degrade chain advances.
                        complete = false;
                    }
                }

                last = new Drain(sb.ToString(), effects, complete, usage);
                if (complete) return last;
            }
            return last;
        }

        private readonly struct Drain
        {
            public readonly string Text;
            public readonly List<ProposedEffect> Effects;
            public readonly bool SawComplete;
            public readonly TurnUsage Usage;
            public Drain(string text, List<ProposedEffect> effects, bool sawComplete, TurnUsage usage)
            { Text = text; Effects = effects; SawComplete = sawComplete; Usage = usage; }
        }

        /// <summary>A short human-readable note for an accepted (dispatched) effect — the chat
        /// "effect" line the client shows as a side-note. EndConversation has no note (the end
        /// event carries it).</summary>
        private static string EffectNote(CitizenEffect e)
        {
            switch (e)
            {
                case SetDisposition sd:
                    string sign = sd.DeltaAffinity >= 0f ? "+" : "";
                    return "affinity " + sign + sd.DeltaAffinity.ToString("0.#", CultureInfo.InvariantCulture);
                case RevealInfo _: return "revealed something";
                case AgreeTask _: return "agreed to a task";
                case FollowPlayer fp: return fp.Follow ? "will follow you" : "stopped following";
                case SetEmotionalState se: return se.Emotion;
                default: return null;
            }
        }

        // ------------------------------------------------------------------ test hooks

        /// <summary>Block until no turn is in flight (test drive; TemplateBackend completes fast).</summary>
        internal bool WaitIdle(int ms)
        {
            var sw = Stopwatch.StartNew();
            while (Volatile.Read(ref _inFlightCount) > 0)
            {
                if (sw.ElapsedMilliseconds > ms) return false;
                Thread.Sleep(2);
            }
            return true;
        }

        internal int InFlightCount => Volatile.Read(ref _inFlightCount);

        private void Enqueue(string msg) => _outbox.Enqueue(msg);
    }
}
