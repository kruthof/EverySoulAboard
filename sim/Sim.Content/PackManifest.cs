using System.Collections.Generic;

namespace Perilune.Content
{
    /// <summary>
    /// One content pack's identity, parsed from its <c>pack.toml</c> (ARCHITECTURE
    /// "The content-pack system"). Sim.Content is PURE — text in, POCOs out; hosts
    /// own all file IO and hand in (name, text) pairs, same contract as DefsParser.
    ///
    /// Supported pack.toml subset (repo culture: hand-rolled, zero packages, fail-soft):
    /// <c>#</c> comments, <c>key = value</c> with quoted or bare scalar values, and
    /// <c>dependencies = ["a", "b"]</c> string arrays. Unknown keys warn and are
    /// ignored (forward compatibility: newer packs on older engines degrade soft).
    /// </summary>
    public sealed class PackManifest
    {
        public string Id;
        public string Name = "";
        public string Version = "";
        public readonly List<string> Dependencies = new List<string>();

        /// <summary>Parse one pack.toml. Returns null (with a problem line) only when
        /// the required <c>id</c> is missing — everything else fails soft.</summary>
        public static PackManifest Parse(string tomlText, string sourceName, List<string> problems)
        {
            var m = new PackManifest();
            string[] lines = (tomlText ?? "").Split('\n');
            for (int i = 0; i < lines.Length; i++)
            {
                string line = StripComment(lines[i]).Trim();
                if (line.Length == 0) continue;
                string loc = sourceName + ":" + (i + 1);

                int eq = line.IndexOf('=');
                if (eq < 0) { problems.Add(loc + ": expected 'key = value' — ignored"); continue; }
                string key = line.Substring(0, eq).Trim().ToLowerInvariant();
                string val = line.Substring(eq + 1).Trim();

                switch (key)
                {
                    case "id": m.Id = Unquote(val); break;
                    case "name": m.Name = Unquote(val); break;
                    case "version": m.Version = Unquote(val); break;
                    case "dependencies": ParseStringArray(val, m.Dependencies, loc, problems); break;
                    default: problems.Add(loc + ": unknown key '" + key + "' — ignored"); break;
                }
            }

            if (string.IsNullOrEmpty(m.Id))
            {
                problems.Add(sourceName + ": pack.toml has no 'id' — pack skipped");
                return null;
            }
            return m;
        }

        private static void ParseStringArray(string val, List<string> into, string loc, List<string> problems)
        {
            if (val.Length >= 2 && val[0] == '[' && val[val.Length - 1] == ']')
            {
                string inner = val.Substring(1, val.Length - 2);
                string[] parts = inner.Split(',');
                for (int i = 0; i < parts.Length; i++)
                {
                    string s = Unquote(parts[i].Trim());
                    if (s.Length > 0) into.Add(s);
                }
                return;
            }
            string single = Unquote(val);
            if (single.Length > 0) into.Add(single);
            else problems.Add(loc + ": empty dependencies value — ignored");
        }

        private static string Unquote(string s)
        {
            s = s.Trim();
            if (s.Length >= 2 && (s[0] == '"' && s[s.Length - 1] == '"' ||
                                  s[0] == '\'' && s[s.Length - 1] == '\''))
                return s.Substring(1, s.Length - 2);
            return s;
        }

        private static string StripComment(string line)
        {
            int h = line.IndexOf('#');
            return h < 0 ? line : line.Substring(0, h);
        }
    }
}
