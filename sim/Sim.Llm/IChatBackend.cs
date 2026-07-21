using System.Collections.Generic;

namespace Perilune.Llm
{
    /// <summary>
    /// The effect kinds a conversation backend may propose (v0 subset of the
    /// Sim.Core CitizenEffect family, per LLM_CITIZENS.md §5/§12). This is a thin
    /// DTO layer deliberately decoupled from Sim.Core's concrete effect records:
    /// an integration shim maps ProposedEffect → CitizenEffect and feeds it through
    /// EffectValidator / PendingEffectBuffer. The Llm assembly never mutates sim
    /// state directly.
    /// </summary>
    public enum EffectKind
    {
        /// <summary>Adjust affinity/trust toward the player. Magnitude = affinity delta.</summary>
        SetDisposition,
        /// <summary>Reveal a known fact. TargetId = fact id the citizen actually knows.</summary>
        RevealInfo,
        /// <summary>Agree to take a job. TargetId = job id currently assignable.</summary>
        AgreeTask,
        /// <summary>Start following the player. Magnitude &gt; 0 = follow, 0 = stop.</summary>
        FollowPlayer,
        /// <summary>Close the conversation in character.</summary>
        EndConversation,
    }

    /// <summary>
    /// One legal (kind, target) pair from the sim-computed capability manifest
    /// (LLM_CITIZENS.md §5). The backend may ONLY emit effects whose kind+target
    /// appear here — the whitelist contract. Label is human-readable flavor
    /// ("the hidden cache in D-7", "repair scrubber 3") usable in reply text.
    /// </summary>
    public sealed class EffectOption
    {
        public EffectKind Kind { get; }
        public uint TargetId { get; }
        public string Label { get; }

        public EffectOption(EffectKind kind, uint targetId, string label)
        {
            Kind = kind;
            TargetId = targetId;
            Label = label ?? string.Empty;
        }
    }

    /// <summary>
    /// Everything a backend needs to speak as one citizen for one conversation.
    /// Plain data, assembled by the integration shim from PersonaSheet,
    /// CitizenMemory, the relationship graph, and CapabilityComputer output.
    /// PersonaBlock is an opaque prose block (backends must not parse it);
    /// machine-readable conditioning arrives via Mood and Traits.
    /// </summary>
    public sealed class ConversationRequest
    {
        public string CitizenName { get; set; } = string.Empty;

        /// <summary>Rendered persona prose (identity, backstory, speech style). Opaque to backends.</summary>
        public string PersonaBlock { get; set; } = string.Empty;

        /// <summary>Top-K retrieved memory lines, most relevant first.</summary>
        public List<string> MemoryLines { get; set; } = new List<string>();

        /// <summary>One-line summary of the citizen↔player relationship ("wary; owes you for the O2 fix").</summary>
        public string RelationshipSummary { get; set; } = string.Empty;

        /// <summary>The capability manifest: every effect the citizen may legally emit right now.</summary>
        public List<EffectOption> CapabilitySummary { get; set; } = new List<EffectOption>();

        /// <summary>Current mood scalar, roughly [-100, 100]. Below -20 the template backend turns curt.</summary>
        public float Mood { get; set; }

        /// <summary>Persona trait ids, lowercase ("sardonic", "cowardly", "devout").</summary>
        public List<string> Traits { get; set; } = new List<string>();
    }

    /// <summary>
    /// An effect the backend proposes in response to a player utterance. Advisory
    /// only: the sim re-validates against current state at tick boundaries and may
    /// reject or clamp (LLM_CITIZENS.md §5, §10).
    /// </summary>
    public sealed class ProposedEffect
    {
        public EffectKind Kind { get; }
        public uint TargetId { get; }
        public float Magnitude { get; }

        public ProposedEffect(EffectKind kind, uint targetId, float magnitude)
        {
            Kind = kind;
            TargetId = targetId;
            Magnitude = magnitude;
        }
    }

    /// <summary>One complete citizen turn: reply text plus zero or more proposed effects.</summary>
    public sealed class ChatResult
    {
        public string ReplyText { get; }
        public List<ProposedEffect> Effects { get; }

        public ChatResult(string replyText, List<ProposedEffect> effects)
        {
            ReplyText = replyText ?? string.Empty;
            Effects = effects ?? new List<ProposedEffect>();
        }
    }

    /// <summary>
    /// One conversation backend: template (offline), Ollama, or Anthropic. Game
    /// logic is 100% backend-blind — every backend speaks in ChatResult and the
    /// same whitelisted ProposedEffects.
    ///
    /// v0 is synchronous because the only backend is the in-process template
    /// matcher. The planned upgrade path (LLM_CITIZENS.md §8) is:
    ///
    ///     IAsyncEnumerable&lt;ChatDelta&gt; SendAsync(ConversationRequest req, string utterance, CancellationToken ct);
    ///     BackendCapabilities Caps { get; }   // MaxEffects, SupportsStreaming, SupportsTools...
    ///     // ChatDelta = TextDelta | EffectProposed(ProposedEffect) | TurnComplete(usage) | BackendError
    ///
    /// When SendAsync lands, Respond becomes trivially wrappable: a sync backend
    /// yields one TextDelta with the full reply, one EffectProposed per effect,
    /// then TurnComplete. Callers should therefore treat ChatResult as "the fully
    /// accumulated turn" and not depend on Respond being cheap or local.
    /// </summary>
    public interface IChatBackend
    {
        /// <summary>
        /// Produce the citizen's reply to one player utterance. Must be
        /// deterministic for identical (request, utterance) inputs, must never
        /// throw on arbitrary player text, and must only propose effects whose
        /// kind+target appear in request.CapabilitySummary.
        /// </summary>
        ChatResult Respond(ConversationRequest request, string playerUtterance);
    }
}
