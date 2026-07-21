using System.Globalization;
using System.Text;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// Pure persona → JSON renderer behind the <c>dump-personas</c> verb (the W4 contract for
    /// the portrait pipeline, art/spritegen). Compiled into the test project like WireFormat so
    /// the byte-determinism contract is pinned without any process spawning; Program.cs owns
    /// the file IO. Deterministic: same seed + same sim ⇒ byte-identical output. Secrets are
    /// deliberately NOT emitted — art fixtures must never leak spoiler text.
    /// </summary>
    public static class PersonaDump
    {
        /// <summary>Stable portrait key: FNV-1a-32 over the ship seed then the citizen id.
        /// This is the filename identity for client/assets/portraits/&lt;key&gt;.png.</summary>
        public static string PersonaKey(ulong seed, uint citizenId)
        {
            uint h = 2166136261u;
            for (int i = 0; i < 8; i++) { h ^= (byte)(seed >> (i * 8)); h *= 16777619u; }
            for (int i = 0; i < 4; i++) { h ^= (byte)(citizenId >> (i * 8)); h *= 16777619u; }
            return "pk_" + h.ToString("x8", CultureInfo.InvariantCulture);
        }

        /// <summary>Render every citizen's persona (creating minds via the host's one-per-citizen
        /// worldgen call if absent) as a JSON array ordered by citizen id.</summary>
        public static string Render(ulong seed, Simulation sim, MindState minds, FactRegistry facts)
        {
            var sb = new StringBuilder(4096);
            sb.Append("[\n");
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (!minds.Minds.TryGet(citizen.Id, out var mind) || mind.Persona == null)
                    mind = PersonaGenerator.CreateMind(sim, minds, facts, citizen);
                var p = mind.Persona;

                sb.Append("  {");
                Field(sb, "key", PersonaKey(seed, citizen.Id)); sb.Append(", ");
                Field(sb, "name", p.Name); sb.Append(", ");
                Field(sb, "rolePreRaid", p.RolePreRaid); sb.Append(", ");
                Array(sb, "traits", p.Traits); sb.Append(", ");
                Array(sb, "values", p.Values); sb.Append(", ");
                Array(sb, "fears", p.Fears); sb.Append(", ");
                Field(sb, "speechStyle", p.SpeechStyle); sb.Append(", ");
                Field(sb, "backstoryHint", p.RaidBackstory);
                sb.Append(i == citizens.Count - 1 ? "}\n" : "},\n");
            }
            sb.Append("]\n");
            return sb.ToString();
        }

        private static void Field(StringBuilder sb, string key, string value)
        {
            sb.Append('"').Append(key).Append("\": ");
            Quote(sb, value);
        }

        private static void Array(StringBuilder sb, string key, string[] values)
        {
            sb.Append('"').Append(key).Append("\": [");
            for (int i = 0; i < values.Length; i++)
            {
                if (i > 0) sb.Append(", ");
                Quote(sb, values[i]);
            }
            sb.Append(']');
        }

        private static void Quote(StringBuilder sb, string value)
        {
            sb.Append('"');
            foreach (char c in value ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
