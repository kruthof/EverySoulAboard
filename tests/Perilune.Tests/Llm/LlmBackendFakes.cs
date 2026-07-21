using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Llm;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// A programmable <see cref="IChatBackend"/> for dispatcher tests: each call emits the delta
    /// sequence the script returns for that call index, so a test can stage retryable failures,
    /// truncated (no-completion) streams, and eventual recovery deterministically. Cancellation is
    /// honoured before each yield.
    /// </summary>
    internal sealed class ScriptedBackend : IChatBackend
    {
        private readonly string _name;
        private readonly Func<int, IEnumerable<ChatDelta>> _script;
        private int _calls;

        public int Calls => Volatile.Read(ref _calls);

        public ScriptedBackend(string name, Func<int, IEnumerable<ChatDelta>> script)
        {
            _name = name;
            _script = script;
        }

        public BackendCapabilities Caps => new BackendCapabilities(_name, true, true, 4);

        public ChatResult Respond(ConversationRequest request, string playerUtterance)
        {
            var text = new System.Text.StringBuilder();
            var effs = new List<ProposedEffect>();
            foreach (ChatDelta d in _script(0))
            {
                if (d is TextDelta t) text.Append(t.Text);
                else if (d is EffectProposed e && e.Effect != null) effs.Add(e.Effect);
            }
            return new ChatResult(text.ToString(), effs);
        }

        public async IAsyncEnumerable<ChatDelta> SendAsync(
            ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
        {
            int idx = Interlocked.Increment(ref _calls) - 1;
            foreach (ChatDelta d in _script(idx))
            {
                ct.ThrowIfCancellationRequested();
                yield return d;
                await Task.Yield();
            }
        }

        // ---- delta-sequence builders -------------------------------------------------

        public static IEnumerable<ChatDelta> Success(string text, params ProposedEffect[] effects)
        {
            yield return new TextDelta(text ?? string.Empty);
            if (effects != null)
                foreach (ProposedEffect e in effects) yield return new EffectProposed(e);
            yield return new TurnComplete(new TurnUsage(0, 0, 0, 0, "scripted"));
        }

        public static IEnumerable<ChatDelta> Fail(bool retryable)
        {
            yield return new BackendError(retryable ? "transient" : "permanent", retryable);
        }

        /// <summary>Deltas without a terminal TurnComplete — a truncated stream.</summary>
        public static IEnumerable<ChatDelta> NoComplete(string text, params ProposedEffect[] effects)
        {
            yield return new TextDelta(text ?? string.Empty);
            if (effects != null)
                foreach (ProposedEffect e in effects) yield return new EffectProposed(e);
            // deliberately no TurnComplete
        }
    }

    /// <summary>A backend whose stream never completes until the token cancels — for timeout tests.</summary>
    internal sealed class HangingBackend : IChatBackend
    {
        public BackendCapabilities Caps => new BackendCapabilities("hanging", true, true, 4);
        public ChatResult Respond(ConversationRequest request, string playerUtterance)
            => new ChatResult(string.Empty, new List<ProposedEffect>());

        public async IAsyncEnumerable<ChatDelta> SendAsync(
            ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
        {
            await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false);
            yield break; // unreachable
        }
    }

    /// <summary>A mutable clock the test advances by hand — the dispatcher/cost-meter never read the
    /// wall clock themselves.</summary>
    internal sealed class FakeClock
    {
        private DateTime _now;
        public FakeClock(DateTime start) { _now = start; }
        public DateTime Now => _now;
        public void Advance(TimeSpan by) => _now += by;
        public Func<DateTime> Func => () => _now;
    }
}
