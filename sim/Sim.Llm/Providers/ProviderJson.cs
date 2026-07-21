using System.Text.Json;

namespace Perilune.Llm.Providers
{
    /// <summary>
    /// Small defensive JSON helpers shared by the text-envelope adapters (OpenAI-compat, Ollama)
    /// and <see cref="EffectEnvelopeParser"/>. Every accessor tolerates missing/mistyped fields and
    /// never throws — vendor payloads are untrusted at parse time.
    /// </summary>
    internal static class ProviderJson
    {
        public static JsonDocument TryParse(string json)
        {
            try { return JsonDocument.Parse(json); }
            catch { return null; }
        }

        public static string GetString(JsonElement obj, string prop)
            => obj.ValueKind == JsonValueKind.Object
               && obj.TryGetProperty(prop, out JsonElement e)
               && e.ValueKind == JsonValueKind.String
                ? e.GetString()
                : null;

        public static bool TryGetInt(JsonElement obj, string prop, out int val)
        {
            val = 0;
            if (obj.ValueKind == JsonValueKind.Object
                && obj.TryGetProperty(prop, out JsonElement e)
                && e.ValueKind == JsonValueKind.Number)
            {
                if (e.TryGetInt32(out val)) return true;
                if (e.TryGetDouble(out double d)) { val = (int)d; return true; }
            }
            return false;
        }

        /// <summary>Parse one of the five effect-kind names exactly (no numeric/aliased forms).</summary>
        public static bool TryParseKind(string s, out EffectKind kind)
        {
            switch (s)
            {
                case "SetDisposition": kind = EffectKind.SetDisposition; return true;
                case "RevealInfo": kind = EffectKind.RevealInfo; return true;
                case "AgreeTask": kind = EffectKind.AgreeTask; return true;
                case "FollowPlayer": kind = EffectKind.FollowPlayer; return true;
                case "EndConversation": kind = EffectKind.EndConversation; return true;
                default: kind = default; return false;
            }
        }
    }
}
