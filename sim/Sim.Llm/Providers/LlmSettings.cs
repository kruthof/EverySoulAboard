using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace Perilune.Llm.Providers
{
    /// <summary>One conversation role's route: which backend answers, and with which model.</summary>
    public sealed class RouteConfig
    {
        public string Backend { get; }
        public string Model { get; }
        public RouteConfig(string backend, string model)
        {
            Backend = string.IsNullOrEmpty(backend) ? "template" : backend;
            Model = model ?? string.Empty;
        }
        public override string ToString() => "Route { Backend = " + Backend + ", Model = " + Model + " }";
    }

    /// <summary>A provider's connection info. The api key is redacted from <see cref="ToString"/> so a
    /// logged settings object never leaks it.</summary>
    public sealed class ProviderConfig
    {
        public string ApiKey { get; }
        public string BaseUrl { get; }
        public bool HasKey => !string.IsNullOrEmpty(ApiKey);
        public ProviderConfig(string apiKey, string baseUrl)
        {
            ApiKey = apiKey ?? string.Empty;
            BaseUrl = baseUrl ?? string.Empty;
        }
        public override string ToString()
            => "Provider { BaseUrl = " + BaseUrl + ", Key = " + (HasKey ? "<set>" : "<none>") + " }";
    }

    /// <summary>
    /// Resolved LLM configuration (LLM_CITIZENS.md §11) — per-role backend routes, provider
    /// credentials, the hourly budget cap, and the model price table. Assembled by the PURE
    /// <see cref="Parse"/> from three text sources with precedence env &gt; .env &gt; toml; the only
    /// IO lives in the thin <see cref="LoadFromEnvironment"/> wrapper, cleanly separated so the sim
    /// stays testable without touching the filesystem or process environment. Keys are never logged
    /// and never appear in <see cref="ToString"/>.
    /// </summary>
    public sealed class LlmSettings
    {
        private static readonly string[] KnownProviders = { "anthropic", "openai", "ollama", "gemini" };

        private static readonly Dictionary<string, string> DefaultBaseUrls = new Dictionary<string, string>
        {
            ["anthropic"] = "https://api.anthropic.com",
            ["openai"] = "https://api.openai.com",
            ["ollama"] = "http://localhost:11434",
            // Settings-level slot only for now: the GeminiBackend is future work, but the key is
            // already carried in the repo .env (the art pipeline uses it) — parse it, hold it,
            // never route to it (EffectiveBackend's default arm keeps gemini => template).
            ["gemini"] = "https://generativelanguage.googleapis.com",
        };

        public RouteConfig Dialogue { get; }
        public RouteConfig Narration { get; }
        public RouteConfig Bulk { get; }
        public IReadOnlyDictionary<string, ProviderConfig> Providers { get; }
        public decimal BudgetPerHourUsd { get; }
        public IReadOnlyDictionary<string, ModelPrice> Prices { get; }

        private LlmSettings(RouteConfig dialogue, RouteConfig narration, RouteConfig bulk,
            IReadOnlyDictionary<string, ProviderConfig> providers, decimal budget,
            IReadOnlyDictionary<string, ModelPrice> prices)
        {
            Dialogue = dialogue;
            Narration = narration;
            Bulk = bulk;
            Providers = providers;
            BudgetPerHourUsd = budget;
            Prices = prices;
        }

        /// <summary>
        /// The backend that will actually answer <paramref name="role"/> right now: the configured
        /// backend, DOWNGRADED to "template" when it needs a key the settings don't provide. This is
        /// the "key-absent ⇒ template-only" fallback — the game stays fully playable offline.
        /// </summary>
        public string EffectiveBackend(RouteConfig role)
        {
            string backend = role != null ? role.Backend : "template";
            switch (backend)
            {
                case "anthropic":
                case "openai":
                    return (Providers.TryGetValue(backend, out ProviderConfig p) && p.HasKey) ? backend : "template";
                case "ollama":
                case "template":
                    return backend;
                default:
                    return "template";
            }
        }

        public override string ToString()
        {
            var sb = new System.Text.StringBuilder();
            sb.Append("LlmSettings { dialogue=").Append(Dialogue.Backend)
              .Append('/').Append(Dialogue.Model)
              .Append(", narration=").Append(Narration.Backend).Append('/').Append(Narration.Model)
              .Append(", bulk=").Append(Bulk.Backend).Append('/').Append(Bulk.Model)
              .Append(", budget=").Append(CostMeter.FormatUsd(BudgetPerHourUsd)).Append("/hr")
              .Append(", prices=").Append(Prices.Count)
              .Append(" }");
            return sb.ToString(); // keys deliberately omitted
        }

        // ------------------------------------------------------------------
        // PURE parse: env > .env > toml
        // ------------------------------------------------------------------

        /// <summary>
        /// Merge three configuration sources into resolved settings. Precedence, highest first:
        /// <paramref name="envDict"/> (process env), <paramref name="dotEnvText"/> (a .env file body),
        /// <paramref name="tomlText"/> (a toml file body). Every argument is optional. Pure — no IO.
        /// </summary>
        public static LlmSettings Parse(
            IReadOnlyDictionary<string, string> envDict, string dotEnvText, string tomlText)
        {
            var flat = new Dictionary<string, string>(StringComparer.Ordinal);
            MergeInto(flat, FromToml(tomlText));       // lowest precedence
            MergeInto(flat, FromDotEnv(dotEnvText));   // middle
            MergeInto(flat, FromEnv(envDict));         // highest

            var dialogue = Route(flat, "dialogue");
            var narration = Route(flat, "narration");
            var bulk = Route(flat, "bulk");

            var providers = new Dictionary<string, ProviderConfig>(StringComparer.Ordinal);
            foreach (string name in KnownProviders)
            {
                string key = Get(flat, name + ".key");
                string baseUrl = Get(flat, name + ".base_url");
                if (string.IsNullOrEmpty(baseUrl)) DefaultBaseUrls.TryGetValue(name, out baseUrl);
                providers[name] = new ProviderConfig(key, baseUrl);
            }

            decimal budget = 0.50m;
            string budgetStr = Get(flat, "budget.usd_per_hour");
            if (!string.IsNullOrEmpty(budgetStr)
                && decimal.TryParse(budgetStr, NumberStyles.Number, CultureInfo.InvariantCulture, out decimal parsed))
                budget = parsed < 0m ? 0m : parsed;

            IReadOnlyDictionary<string, ModelPrice> prices = ParsePrices(flat);

            return new LlmSettings(dialogue, narration, bulk, providers, budget, prices);
        }

        /// <summary>
        /// The ONLY IO in this type: read the process environment and (optionally) a .env and a toml
        /// file, then hand the text to <see cref="Parse"/>. Hosts own file IO — this convenience is
        /// the thin, clearly-separated seam a host calls; the sim proper uses <see cref="Parse"/>.
        /// </summary>
        public static LlmSettings LoadFromEnvironment(string dotEnvPath = null, string tomlPath = null)
        {
            var env = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (DictionaryEntry e in Environment.GetEnvironmentVariables())
            {
                if (e.Key is string k) env[k] = e.Value as string ?? string.Empty;
            }
            string dotEnv = (dotEnvPath != null && File.Exists(dotEnvPath)) ? File.ReadAllText(dotEnvPath) : null;
            string toml = (tomlPath != null && File.Exists(tomlPath)) ? File.ReadAllText(tomlPath) : null;
            return Parse(env, dotEnv, toml);
        }

        // ------------------------------------------------------------------
        // Source loaders → flat canonical dictionaries (lowercase dotted keys)
        // ------------------------------------------------------------------

        private static RouteConfig Route(IReadOnlyDictionary<string, string> flat, string role)
            => new RouteConfig(Get(flat, role + ".backend"), Get(flat, role + ".model"));

        private static string Get(IReadOnlyDictionary<string, string> flat, string key)
            => flat.TryGetValue(key, out string v) ? v : null;

        private static void MergeInto(Dictionary<string, string> dst, Dictionary<string, string> src)
        {
            foreach (KeyValuePair<string, string> kv in src) dst[kv.Key] = kv.Value; // src overwrites (higher precedence)
        }

        // Minimal TOML: [section] headers (dotted names kept verbatim) + key = value lines; strings
        // may be double-quoted; comments start with '#'. Sufficient for the flat llm config schema.
        private static Dictionary<string, string> FromToml(string toml)
        {
            var flat = new Dictionary<string, string>(StringComparer.Ordinal);
            if (string.IsNullOrEmpty(toml)) return flat;

            string section = string.Empty;
            foreach (string raw in toml.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
            {
                string line = StripComment(raw).Trim();
                if (line.Length == 0) continue;

                if (line[0] == '[' && line[line.Length - 1] == ']')
                {
                    section = line.Substring(1, line.Length - 2).Trim();
                    continue;
                }

                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string key = line.Substring(0, eq).Trim();
                string value = Unquote(line.Substring(eq + 1).Trim());
                string canonical = (section.Length == 0 ? key : section + "." + key).ToLowerInvariant();
                flat[canonical] = value;
            }
            return flat;
        }

        // .env: KEY=VALUE lines; comments start with '#'. Keys use the PERILUNE_LLM_ scheme.
        private static Dictionary<string, string> FromDotEnv(string dotEnv)
        {
            var flat = new Dictionary<string, string>(StringComparer.Ordinal);
            if (string.IsNullOrEmpty(dotEnv)) return flat;

            foreach (string raw in dotEnv.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
            {
                string line = StripComment(raw).Trim();
                if (line.Length == 0) continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string canonical = EnvKeyToCanonical(line.Substring(0, eq).Trim());
                if (canonical == null) continue;
                flat[canonical] = Unquote(line.Substring(eq + 1).Trim());
            }
            return flat;
        }

        private static Dictionary<string, string> FromEnv(IReadOnlyDictionary<string, string> env)
        {
            var flat = new Dictionary<string, string>(StringComparer.Ordinal);
            if (env == null) return flat;
            foreach (KeyValuePair<string, string> kv in env)
            {
                string canonical = EnvKeyToCanonical(kv.Key);
                if (canonical != null) flat[canonical] = kv.Value ?? string.Empty;
            }
            return flat;
        }

        // PERILUNE_LLM_ANTHROPIC_BASE_URL → anthropic.base_url ; DIALOGUE_BACKEND → dialogue.backend ;
        // BUDGET_USD_PER_HOUR → budget.usd_per_hour. Only the first underscore after the prefix maps
        // to the section separator. Unprefixed keys are ignored — EXCEPT the well-known key-name
        // aliases below, so a plain `.env` with claude_key/openai_key/gemini_key just works. A
        // canonical PERILUNE_LLM_ name still wins over an alias in the same source (aliases map to
        // the same canonical slot; last writer within a source is the file's later line, and source
        // precedence is unchanged).
        private static string EnvKeyToCanonical(string key)
        {
            const string prefix = "PERILUNE_LLM_";
            if (string.IsNullOrEmpty(key)) return null;
            switch (key.Trim().ToLowerInvariant())
            {
                case "claude_key":
                case "anthropic_api_key":
                    return "anthropic.key";
                case "openai_key":
                case "openai_api_key":
                    return "openai.key";
                case "gemini_key":
                case "geminie_key": // the historic repo-root .env spelling
                case "gemini_api_key":
                    return "gemini.key";
                case "ollama_host":
                    return "ollama.base_url";
            }
            if (!key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
            string rest = key.Substring(prefix.Length).ToLowerInvariant();
            int us = rest.IndexOf('_');
            return us < 0 ? rest : rest.Substring(0, us) + "." + rest.Substring(us + 1);
        }

        // price.<model>.<field> → ModelPrice. Model names contain no dots, so the field is the last
        // dotted segment. Fields: input, output, cache_read, cache_write.
        private static IReadOnlyDictionary<string, ModelPrice> ParsePrices(IReadOnlyDictionary<string, string> flat)
        {
            var raw = new Dictionary<string, decimal[]>(StringComparer.Ordinal); // model → [in,out,cr,cw]
            foreach (KeyValuePair<string, string> kv in flat)
            {
                if (!kv.Key.StartsWith("price.", StringComparison.Ordinal)) continue;
                string rest = kv.Key.Substring("price.".Length);
                int lastDot = rest.LastIndexOf('.');
                if (lastDot <= 0) continue;
                string model = rest.Substring(0, lastDot);
                string field = rest.Substring(lastDot + 1);
                if (!decimal.TryParse(kv.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out decimal val)) continue;

                if (!raw.TryGetValue(model, out decimal[] slots)) { slots = new decimal[4]; raw[model] = slots; }
                switch (field)
                {
                    case "input": slots[0] = val; break;
                    case "output": slots[1] = val; break;
                    case "cache_read": slots[2] = val; break;
                    case "cache_write": slots[3] = val; break;
                }
            }

            var prices = new Dictionary<string, ModelPrice>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, decimal[]> kv in raw)
                prices[kv.Key] = new ModelPrice(kv.Value[0], kv.Value[1], kv.Value[2], kv.Value[3]);
            return prices;
        }

        private static string StripComment(string line)
        {
            int h = line.IndexOf('#');
            return h < 0 ? line : line.Substring(0, h);
        }

        private static string Unquote(string s)
        {
            if (s.Length >= 2 && ((s[0] == '"' && s[s.Length - 1] == '"') || (s[0] == '\'' && s[s.Length - 1] == '\'')))
                return s.Substring(1, s.Length - 2);
            return s;
        }
    }
}
