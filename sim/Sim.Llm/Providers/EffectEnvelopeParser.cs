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

        /// <summary>
        /// Kinds for which an omitted <c>magnitude</c> is forgiven. Two conditions, both required.
        ///
        /// <para>1. <see cref="ConversationService"/> never reads the number for that kind, so nothing
        /// is being guessed: RevealInfo resolves a fact id, AgreeTask a dig target. (SetDisposition's
        /// magnitude is the entire warmer/colder decision and FollowPlayer's is the follow/stop bit —
        /// there an absence is missing information and the entry is dropped.)</para>
        ///
        /// <para>2. A FALSE POSITIVE for that kind is survivable. This is a risk judgement, not a
        /// semantic one, and it is why <c>EndConversation</c> is deliberately NOT here even though it
        /// satisfies (1): <c>ConversationHub</c> treats a dispatched EndConversation as authoritative
        /// and terminates the session, so a spurious one has the crew member hang up on a player who
        /// only said hello. Measured live on mistral (n=24/turn, real prompt bytes): forgiving it
        /// fired on 11/24 turns where the player ASKED FOR WORK and on 11/96 no-op turns, against
        /// essentially no legitimate use — it took the no-op false-positive rate from 7.3% to 18.8%
        /// while adding nothing. A missed goodbye costs the player one click; a false one ends the
        /// conversation they were having.</para>
        /// </summary>
        private static bool MagnitudeIsInert(EffectKind kind)
            => kind == EffectKind.RevealInfo || kind == EffectKind.AgreeTask;

        private static bool TryEntry(JsonElement e, ConversationRequest req, out ProposedEffect pe)
        {
            pe = null;
            if (e.ValueKind != JsonValueKind.Object) return false;

            if (!ProviderJson.TryParseKind(ProviderJson.GetString(e, "kind"), out EffectKind kind)) return false;
            if (!ProviderJson.TryGetInt(e, "target_index", out int index) || index < 0) return false;

            // Magnitude: an OMITTED one is forgiven for the inert kinds; a PRESENT but non-numeric one
            // is still fatal for every kind. The distinction is deliberate — an absent field is the
            // model declining to fill in a number it was never going to use, whereas "magnitude":"lots"
            // is a malformed entry and malformed entries stay invalid.
            //
            // Where the number IS the payload (SetDisposition's warmer/colder decision, FollowPlayer's
            // follow/stop bit) absence is genuinely missing information, so the entry is dropped rather
            // than guessed — defaulting to 0 would silently mean "no warmth change" / "stop following".
            // For the other three, demanding it threw away real, well-formed effects: local models
            // routinely emit {"kind":"RevealInfo","target_index":0} and the reveal was lost. Measured
            // live against mistral on a reveal turn (n=64, the real ProviderPrompt bytes): 1/64 usable
            // before, 29/64 after — this rule is the whole of that gain.
            // The tool path is unaffected: Anthropic's strict schema keeps magnitude in `required`
            // (AnthropicBackend.cs:540-545), so a tool call cannot reach here missing one.
            double magnitude = 0d;
            if (e.TryGetProperty("magnitude", out JsonElement mag))
            {
                if (mag.ValueKind != JsonValueKind.Number || !mag.TryGetDouble(out magnitude)) return false;
            }
            else if (!MagnitudeIsInert(kind))
            {
                return false;
            }

            // Resolve the listed index to its real target id; an out-of-range index passes through
            // as the raw index so the downstream translator rejects it.
            List<EffectOption> caps = req != null ? req.CapabilitySummary : null;
            bool listed = caps != null && index < caps.Count && caps[index] != null;

            // The row must actually BE the kind the model claimed. The tool path has always enforced
            // this (AnthropicBackend.cs:412 rejects on `opt.Kind != kind`); the envelope path never
            // did, and relaxing the magnitude rule above turned that from theory into a live hole:
            // {"kind":"AgreeTask","target_index":0} aimed at a SetDisposition row resolves to
            // TargetId 0, and TryTranslate's AgreeTask arm only bounds-checks the id — so it would
            // put the crew member to work on dig target 0 off a line about warmth. Dropping a
            // mismatched pair also costs nothing legitimate: the index and the kind come from the
            // same manifest row, so disagreeing about it is always the model's error.
            if (listed && caps[index].Kind != kind) return false;

            uint targetId = listed ? caps[index].TargetId : (uint)index;

            pe = new ProposedEffect(kind, targetId, (float)magnitude);
            return true;
        }
    }
}
