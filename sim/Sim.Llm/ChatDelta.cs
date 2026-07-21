namespace Perilune.Llm
{
    /// <summary>
    /// Token/usage accounting for one completed backend turn (LLM_CITIZENS.md §6, §11:
    /// the cost meter). All counts are per-turn, never cumulative — the caller sums them.
    /// Cache read/write are split so the debug meter can prove caching is working
    /// (doc §6: "verify with usage.cache_read_input_tokens"). The synchronous backends
    /// (TemplateBackend via <see cref="SyncChatBackend"/>) report an all-zero usage with
    /// their backend name in <see cref="Model"/> — offline work has no token cost.
    /// </summary>
    public sealed record TurnUsage(
        int InputTokens,
        int OutputTokens,
        int CacheReadTokens,
        int CacheWriteTokens,
        string Model);

    /// <summary>
    /// One streamed step of a conversation turn (LLM_CITIZENS.md §8, §10 — the async
    /// spine the vendor adapters stream over). A backend yields a sequence of these:
    /// zero or more <see cref="TextDelta"/> (typewriter reply text), zero or more
    /// <see cref="EffectProposed"/> (whitelisted tool calls, held until the tool block
    /// closes), then exactly one terminal delta — <see cref="TurnComplete"/> on success
    /// or <see cref="BackendError"/> on failure.
    ///
    /// The variant set is closed to this assembly (the base constructor is
    /// <c>private protected</c>), so exhaustive switch handling is safe and no external
    /// adapter can mint a new delta kind. The runtime accumulates text and effects across
    /// the stream and only dispatches effects to the sim once, after the turn completes
    /// (<see cref="ConversationService.CompleteTurn"/>): a partial or cancelled stream
    /// mutates no sim state.
    /// </summary>
    public abstract record ChatDelta
    {
        private protected ChatDelta() { }
    }

    /// <summary>A chunk of reply text, in order. Concatenating every TextDelta yields the full reply.</summary>
    public sealed record TextDelta(string Text) : ChatDelta;

    /// <summary>One whitelisted effect the backend proposes this turn (a completed tool_use block).</summary>
    public sealed record EffectProposed(ProposedEffect Effect) : ChatDelta;

    /// <summary>Terminal success: the turn finished cleanly; <see cref="Usage"/> carries the token accounting.</summary>
    public sealed record TurnComplete(TurnUsage Usage) : ChatDelta;

    /// <summary>
    /// Terminal failure: the backend could not complete the turn.
    /// <see cref="Retryable"/> distinguishes transient faults (429/5xx/timeout — the
    /// runtime may retry then degrade, doc §10) from permanent ones (bad key, 400).
    /// </summary>
    public sealed record BackendError(string Message, bool Retryable) : ChatDelta;
}
