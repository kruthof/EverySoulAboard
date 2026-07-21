using System;
using System.Collections.Generic;
using System.Text.Json;

namespace Perilune.Llm.Providers
{
    /// <summary>The visible reply text (with the effect envelope stripped) plus the effects it carried.</summary>
    public sealed class EnvelopeResult
    {
        public string VisibleText { get; }
        public IReadOnlyList<ProposedEffect> Effects { get; }

        public EnvelopeResult(string visibleText, IReadOnlyList<ProposedEffect> effects)
        {
            VisibleText = visibleText ?? string.Empty;
            Effects = effects ?? (IReadOnlyList<ProposedEffect>)Array.Empty<ProposedEffect>();
        }
    }

    /// <summary>
    /// The JSON-envelope fallback for backends without native tool calls (OpenAI-compat, Ollama —
    /// LLM_CITIZENS.md §5, §8). The model is instructed to append a fenced <c>```json</c> effects
    /// block to its reply; this extracts the last such block from the tail, cleans it out of the
    /// visible text, and turns each entry into a whitelisted <see cref="ProposedEffect"/>.
    ///
    /// It is deliberately lenient — the safety guarantee lives downstream. Well-formed entries whose
    /// (kind, target_index) are out of the manifest are passed through so
    /// <see cref="ConversationService"/>'s translation is the guard; only structurally invalid
    /// entries (bad shape, unknown kind, non-numeric index/magnitude) are dropped, and the count is
    /// capped at the backend's per-turn effect cap. Malformed or unterminated JSON never throws — it
    /// simply yields no effects and leaves the text untouched.
    /// </summary>
    public static class EffectEnvelopeParser
    {
        private const string Fence = "```";

        public static EnvelopeResult Parse(string reply, ConversationRequest req, int maxEffects)
        {
            if (string.IsNullOrEmpty(reply))
                return new EnvelopeResult(string.Empty, Array.Empty<ProposedEffect>());

            // Collect fence positions and pair them left-to-right; the effects block is expected at
            // the tail, so try the rightmost complete pair first and walk backwards.
            var fences = new List<int>();
            int idx = 0;
            while ((idx = reply.IndexOf(Fence, idx, StringComparison.Ordinal)) >= 0)
            {
                fences.Add(idx);
                idx += Fence.Length;
            }

            int pairs = fences.Count / 2;
            for (int p = pairs - 1; p >= 0; p--)
            {
                int open = fences[2 * p];
                int close = fences[2 * p + 1];
                int bodyStart = open + Fence.Length;
                string body = StripLangTag(reply.Substring(bodyStart, close - bodyStart));

                if (TryParseEffects(body, req, maxEffects, out List<ProposedEffect> effects))
                {
                    string before = reply.Substring(0, open);
                    string after = reply.Substring(close + Fence.Length);
                    return new EnvelopeResult((before + after).Trim(), effects);
                }
            }

            return new EnvelopeResult(reply.Trim(), Array.Empty<ProposedEffect>());
        }

        // Drop an optional leading language tag ("json") that follows the opening fence.
        private static string StripLangTag(string body)
        {
            string t = body.Trim();
            if (t.StartsWith("json", StringComparison.OrdinalIgnoreCase))
                t = t.Substring(4).Trim();
            return t;
        }

        // A valid envelope body is a JSON array of effect objects, or an object with an "effects"
        // array. Returns false (skip this fence) when the body is neither shape or is unparseable.
        private static bool TryParseEffects(string body, ConversationRequest req, int maxEffects, out List<ProposedEffect> effects)
        {
            effects = new List<ProposedEffect>();
            JsonDocument doc = ProviderJson.TryParse(body);
            if (doc == null) return false;
            using (doc)
            {
                JsonElement root = doc.RootElement;
                JsonElement array;
                if (root.ValueKind == JsonValueKind.Array)
                {
                    array = root;
                }
                else if (root.ValueKind == JsonValueKind.Object
                         && root.TryGetProperty("effects", out array)
                         && array.ValueKind == JsonValueKind.Array)
                {
                    // array bound above
                }
                else
                {
                    return false;
                }

                foreach (JsonElement e in array.EnumerateArray())
                {
                    if (maxEffects > 0 && effects.Count >= maxEffects) break; // cap per-turn effects
                    if (TryEntry(e, req, out ProposedEffect pe)) effects.Add(pe);
                }
                return true; // valid shape (an empty array is a clean "no effects")
            }
        }

        private static bool TryEntry(JsonElement e, ConversationRequest req, out ProposedEffect pe)
        {
            pe = null;
            if (e.ValueKind != JsonValueKind.Object) return false;

            if (!ProviderJson.TryParseKind(ProviderJson.GetString(e, "kind"), out EffectKind kind)) return false;
            if (!ProviderJson.TryGetInt(e, "target_index", out int index) || index < 0) return false;
            if (!e.TryGetProperty("magnitude", out JsonElement mag)
                || mag.ValueKind != JsonValueKind.Number
                || !mag.TryGetDouble(out double magnitude))
                return false;

            // Resolve the listed index to its real target id; an out-of-range index passes through
            // as the raw index so the downstream translator rejects it.
            List<EffectOption> caps = req != null ? req.CapabilitySummary : null;
            uint targetId = (caps != null && index < caps.Count && caps[index] != null)
                ? caps[index].TargetId
                : (uint)index;

            pe = new ProposedEffect(kind, targetId, (float)magnitude);
            return true;
        }
    }
}
