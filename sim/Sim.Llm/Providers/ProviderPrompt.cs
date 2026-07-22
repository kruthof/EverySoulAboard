using System.Collections.Generic;
using System.Text;

namespace Perilune.Llm.Providers
{
    /// <summary>One chat message (role + content) in the shape both text-envelope adapters
    /// (OpenAI-compat, Ollama) serialize onto the wire.</summary>
    internal readonly struct ChatMessage
    {
        public string Role { get; }
        public string Content { get; }
        public ChatMessage(string role, string content) { Role = role ?? "user"; Content = content ?? string.Empty; }
    }

    /// <summary>
    /// Renders <see cref="PromptBuilder"/>'s provider-neutral layout into role/content chat messages
    /// for backends WITHOUT native tools. The strict tool schema (block 1) is not sent; in its place
    /// the system message carries the JSON-envelope instruction, so the model expresses effects as a
    /// fenced <c>```json</c> block that <see cref="EffectEnvelopeParser"/> reads. Player text stays
    /// quarantined exactly as the builder rendered it.
    /// </summary>
    internal static class ProviderPrompt
    {
        internal const string EnvelopeInstruction =
            "TOOL USE: you have no function-calling API. When — and only when — you decide to act, " +
            "append EXACTLY ONE fenced code block at the very END of your reply and nothing after it:\n" +
            "```json\n" +
            "[{\"kind\": \"<SetDisposition|RevealInfo|AgreeTask|FollowPlayer|EndConversation>\", " +
            "\"target_index\": <an index from the Available effect targets list>, \"magnitude\": <number>}]\n" +
            "```\n" +
            "Use only a target_index listed for this turn. If you take no action, omit the block entirely.";

        public static List<ChatMessage> BuildMessages(ConversationRequest req, string utterance)
        {
            // The request carries the completed history (an immutable per-turn snapshot,
            // possibly empty); the builder renders it as the growing message suffix.
            PromptLayout layout = PromptBuilder.Build(req, req != null ? req.Transcript : null, utterance);
            var messages = new List<ChatMessage>();

            var sys = new StringBuilder();
            foreach (PromptBlock b in layout.Blocks)
            {
                if (b.Role != PromptRole.System) continue;
                if (b.Id == "tool_schema") continue; // replaced by the envelope instruction below
                if (sys.Length > 0) sys.Append("\n\n");
                sys.Append(b.Text);
            }
            if (sys.Length > 0) sys.Append("\n\n");
            sys.Append(EnvelopeInstruction);
            messages.Add(new ChatMessage("system", sys.ToString()));

            foreach (PromptBlock b in layout.Blocks)
            {
                if (b.Role == PromptRole.System) continue;
                string role = b.Role == PromptRole.Assistant ? "assistant" : "user";
                messages.Add(new ChatMessage(role, b.Text));
            }

            return messages;
        }
    }
}
