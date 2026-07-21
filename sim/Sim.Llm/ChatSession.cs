using System;
using System.Collections.Generic;

namespace Perilune.Llm
{
    /// <summary>
    /// One line of a conversation transcript — a role/text pair the
    /// <see cref="Providers.PromptBuilder"/> renders. Role is carried by
    /// <see cref="Speaker"/>: <see cref="ChatSession.PlayerSpeaker"/> marks the player
    /// (untrusted, quarantined when rendered), any other value is the speaking citizen.
    /// </summary>
    public readonly struct TranscriptLine
    {
        /// <summary>ChatSession.PlayerSpeaker for the player, else the citizen's name.</summary>
        public string Speaker { get; }
        public string Text { get; }

        public TranscriptLine(string speaker, string text)
        {
            Speaker = speaker ?? string.Empty;
            Text = text ?? string.Empty;
        }

        /// <summary>True iff this is a player turn (rendered inside the quarantine delimiters).</summary>
        public bool IsPlayer => Speaker == ChatSession.PlayerSpeaker;
    }

    /// <summary>
    /// Conversation state machine the dialogue UI drives (LLM_CITIZENS.md §4).
    /// Holds the per-conversation request (persona, memories, capability manifest —
    /// computed once at conversation start) and the running transcript. The UI calls
    /// Ask() per player message; the session appends both sides, watches for
    /// EndConversation, and hard-caps at MaxExchanges with an in-character exit
    /// line. Proposed effects in the returned ChatResult are the caller's to hand
    /// to the integration shim (validate, then PendingEffectBuffer); the session
    /// itself never touches sim state.
    /// </summary>
    public sealed class ChatSession
    {
        /// <summary>Hard cap per conversation (§4); the citizen then ends it in character.</summary>
        public const int MaxExchanges = 20;

        public const string PlayerSpeaker = "Player";

        private const string ClosingLine = "Anyway — I need to get back to the scrubbers. We'll talk another time.";
        private const string EndedLine = "(The conversation has ended.)";

        private readonly IChatBackend _backend;
        private readonly List<TranscriptLine> _transcript = new List<TranscriptLine>();

        public ConversationRequest Request { get; }
        public IReadOnlyList<TranscriptLine> Transcript => _transcript;

        /// <summary>Completed player↔citizen exchanges so far.</summary>
        public int ExchangeCount { get; private set; }

        /// <summary>True once the citizen has ended the conversation (farewell or cap).</summary>
        public bool IsEnded { get; private set; }

        public ChatSession(IChatBackend backend, ConversationRequest request)
        {
            _backend = backend ?? throw new ArgumentNullException(nameof(backend));
            Request = request ?? throw new ArgumentNullException(nameof(request));
        }

        /// <summary>
        /// Submit one player utterance. Appends both sides to the transcript and
        /// returns the citizen's turn (reply + proposed effects). After the session
        /// has ended, returns a neutral closed-session result without touching the
        /// transcript or the backend.
        /// </summary>
        public ChatResult Ask(string utterance)
        {
            if (IsEnded)
            {
                return new ChatResult(EndedLine, new List<ProposedEffect>());
            }

            ChatResult result = _backend.Respond(Request, utterance);

            _transcript.Add(new TranscriptLine(PlayerSpeaker, utterance ?? string.Empty));
            _transcript.Add(new TranscriptLine(Request.CitizenName, result.ReplyText));
            ExchangeCount++;

            if (ContainsEnd(result.Effects))
            {
                IsEnded = true;
                return result;
            }

            if (ExchangeCount >= MaxExchanges)
            {
                result = AppendAutoEnd(result);
                IsEnded = true;
            }
            return result;
        }

        /// <summary>
        /// Cap reached: append the in-character exit line as its own transcript
        /// entry and fold it (plus an EndConversation effect, if whitelisted) into
        /// the returned result.
        /// </summary>
        private ChatResult AppendAutoEnd(ChatResult result)
        {
            _transcript.Add(new TranscriptLine(Request.CitizenName, ClosingLine));

            var effects = new List<ProposedEffect>(result.Effects);
            List<EffectOption> caps = Request.CapabilitySummary;
            if (caps != null)
            {
                for (int i = 0; i < caps.Count; i++)
                {
                    EffectOption option = caps[i];
                    if (option != null && option.Kind == EffectKind.EndConversation)
                    {
                        effects.Add(new ProposedEffect(EffectKind.EndConversation, option.TargetId, 0f));
                        break;
                    }
                }
            }
            return new ChatResult(result.ReplyText + "\n" + ClosingLine, effects);
        }

        private static bool ContainsEnd(List<ProposedEffect> effects)
        {
            for (int i = 0; i < effects.Count; i++)
            {
                if (effects[i].Kind == EffectKind.EndConversation) return true;
            }
            return false;
        }
    }
}
