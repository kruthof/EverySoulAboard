namespace Perilune.Llm
{
    /// <summary>
    /// Static description of what a conversation backend can do (LLM_CITIZENS.md §8),
    /// so the runtime can shape a request without knowing the vendor: native strict
    /// tool-calls with enum-bounded ids vs. the JSON-envelope fallback, SSE streaming
    /// vs. one-shot, and the per-turn effect cap the sim's rate limiter mirrors
    /// (doc §5 defense layer 4). The future Anthropic / OpenAI-compat / Gemini / Ollama
    /// adapters each return their own <see cref="BackendCapabilities"/> without any
    /// change to <see cref="IChatBackend"/> — that stability is the point of hoisting
    /// the flags into a value type.
    /// </summary>
    public readonly struct BackendCapabilities
    {
        /// <summary>Backend id for the status chip / logs ("template", "anthropic", "ollama").</summary>
        public string Name { get; }

        /// <summary>SSE token streaming (P2). The v0 template backend is one-shot.</summary>
        public bool SupportsStreaming { get; }

        /// <summary>
        /// Native strict tool-calls with enum-constrained id parameters. False means the
        /// backend consumes the capability manifest as a JSON envelope instead — the
        /// sim-side validator path is identical either way, which is why safety never
        /// depends on this flag.
        /// </summary>
        public bool SupportsTools { get; }

        /// <summary>Hard cap on proposed effects the runtime will dispatch per turn (0 = uncapped).</summary>
        public int MaxEffects { get; }

        public BackendCapabilities(string name, bool supportsStreaming, bool supportsTools, int maxEffects)
        {
            Name = name ?? string.Empty;
            SupportsStreaming = supportsStreaming;
            SupportsTools = supportsTools;
            MaxEffects = maxEffects < 0 ? 0 : maxEffects;
        }
    }
}
