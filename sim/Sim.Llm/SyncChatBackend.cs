using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Llm
{
    /// <summary>
    /// Base for a synchronous, in-process backend (the template matcher today; any future
    /// deterministic offline backend). Subclasses implement the one abstract sync method
    /// <see cref="Respond"/> and get the async streaming shape (<see cref="SendAsync"/>)
    /// for free, with a fixed, deterministic delta order:
    ///
    ///     TextDelta(reply)  →  EffectProposed(e)*  (in Respond's order)  →  TurnComplete(zero-usage)
    ///
    /// The stream completes synchronously (the only await is over an already-completed
    /// task) — no thread hops, no wall clock — so replays and tests are stable and the
    /// delta sequence is byte-for-byte a function of (request, utterance). Cancellation is
    /// honoured before any observable work and before each yielded delta, so a cancelled
    /// enumeration produces no TurnComplete and lets the runtime abandon the turn cleanly.
    ///
    /// TurnComplete carries an all-zero <see cref="TurnUsage"/> tagged with the backend
    /// name: offline turns have no token cost, but the cost meter still sees which backend
    /// answered.
    /// </summary>
    public abstract class SyncChatBackend : IChatBackend
    {
        /// <inheritdoc/>
        public abstract BackendCapabilities Caps { get; }

        /// <inheritdoc/>
        public abstract ChatResult Respond(ConversationRequest request, string playerUtterance);

        /// <inheritdoc/>
        public async IAsyncEnumerable<ChatDelta> SendAsync(
            ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
        {
            // Complete synchronously: the awaited task is already finished, so the
            // continuation runs inline. This keeps the sync backends deterministic while
            // satisfying the async-iterator signature (no CS1998).
            await Task.CompletedTask.ConfigureAwait(false);

            ct.ThrowIfCancellationRequested();
            ChatResult result = Respond(req, utterance ?? string.Empty);

            ct.ThrowIfCancellationRequested();
            yield return new TextDelta(result.ReplyText);

            IReadOnlyList<ProposedEffect> effects = result.Effects;
            if (effects != null)
            {
                for (int i = 0; i < effects.Count; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    yield return new EffectProposed(effects[i]);
                }
            }

            ct.ThrowIfCancellationRequested();
            yield return new TurnComplete(new TurnUsage(0, 0, 0, 0, Caps.Name));
        }
    }
}
