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
        /// <summary>The provider's own configured model (<c>&lt;provider&gt;.model</c>), independent of any
        /// role route. Empty when unset. Appended for the local-first Ollama route: a host needs to know
        /// WHICH local model to probe for before it knows whether Ollama can be auto-selected at all.</summary>
        public string Model { get; }
        /// <summary>Ollama-only residency hints (<c>ollama.keep_alive</c> / <c>ollama.num_ctx</c>),
        /// null when unset so the adapter's own defaults apply. Carried here rather than invented at
        /// the host so someone who has tuned their local install can actually reach them.</summary>
        public string KeepAlive { get; }
        public int? NumCtx { get; }
        public bool HasKey => !string.IsNullOrEmpty(ApiKey);
        public ProviderConfig(string apiKey, string baseUrl, string model = null,
            string keepAlive = null, int? numCtx = null)
        {
            ApiKey = apiKey ?? string.Empty;
            BaseUrl = baseUrl ?? string.Empty;
            Model = model ?? string.Empty;
            KeepAlive = string.IsNullOrEmpty(keepAlive) ? null : keepAlive;
            NumCtx = numCtx;
        }
        public override string ToString()
            => "Provider { BaseUrl = " + BaseUrl + ", Model = " + Model
             + ", Key = " + (HasKey ? "<set>" : "<none>") + " }";
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

        /// <summary>The dialogue-lane model the local-first Ollama route asks for when nothing else is
        /// configured. A host probes for exactly this tag before Ollama may win the auto-route.</summary>
        public const string OllamaDefaultModel = "mistral";
        /// <summary>Dialogue-lane defaults for the key-bearing cloud providers (unchanged behaviour,
        /// named so hosts can resolve an empty model without re-inventing the literal).</summary>
        public const string AnthropicDefaultModel = "claude-haiku-4-5-20251001";
        public const string OpenAiDefaultModel = "gpt-4o-mini";

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
        /// <summary>What the caller told <see cref="Parse"/> about the local Ollama: true only when a
        /// server was verified to be serving the wanted model. Carried so a host can say out loud why
        /// it did or did not route locally instead of leaving the player to guess. Read it together
        /// with <see cref="DialogueBackendConfigured"/> — false there means "not probed", NOT "probed
        /// and absent", and a host must not report the two the same way.</summary>
        public bool OllamaReady { get; }
        /// <summary>Did some source set <c>dialogue.backend</c> explicitly? When true the auto-route
        /// never ran, so no readiness was measured and none was needed.</summary>
        public bool DialogueBackendConfigured { get; }

        private LlmSettings(RouteConfig dialogue, RouteConfig narration, RouteConfig bulk,
            IReadOnlyDictionary<string, ProviderConfig> providers, decimal budget,
            IReadOnlyDictionary<string, ModelPrice> prices, bool ollamaReady, bool dialogueConfigured)
        {
            OllamaReady = ollamaReady;
            DialogueBackendConfigured = dialogueConfigured;
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
        ///
        /// <paramref name="ollamaReady"/> is the caller's ANSWER to "is a local Ollama serving the model
        /// this config would ask it for?". It is a parameter, not a probe, precisely so this method stays
        /// pure and testable without a socket: the IO lives in <see cref="LoadFromEnvironment"/>. When
        /// true and no dialogue backend is configured, Ollama wins the auto-route ahead of the cloud
        /// providers (local-first: $0 and offline). Default false keeps the pure/offline callers — and
        /// every existing test — on the previous anthropic-then-openai order.
        /// </summary>
        public static LlmSettings Parse(
            IReadOnlyDictionary<string, string> envDict, string dotEnvText, string tomlText,
            bool ollamaReady = false)
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
                string providerModel = Get(flat, name + ".model");
                string keepAlive = null;
                int? numCtx = null;
                if (name == "ollama")
                {
                    if (string.IsNullOrEmpty(providerModel)) providerModel = OllamaDefaultModel;
                    keepAlive = Get(flat, "ollama.keep_alive");
                    string ctx = Get(flat, "ollama.num_ctx");
                    if (!string.IsNullOrEmpty(ctx)
                        && int.TryParse(ctx, NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsedCtx)
                        && parsedCtx > 0)
                        numCtx = parsedCtx;
                }
                providers[name] = new ProviderConfig(key, baseUrl, providerModel, keepAlive, numCtx);
            }

            dialogue = AutoRouteDialogue(dialogue, providers, flat, ollamaReady);

            decimal budget = 0.50m;
            string budgetStr = Get(flat, "budget.usd_per_hour");
            if (!string.IsNullOrEmpty(budgetStr)
                && decimal.TryParse(budgetStr, NumberStyles.Number, CultureInfo.InvariantCulture, out decimal parsed))
                budget = parsed < 0m ? 0m : parsed;

            IReadOnlyDictionary<string, ModelPrice> prices = ParsePrices(flat);

            return new LlmSettings(dialogue, narration, bulk, providers, budget, prices, ollamaReady,
                Get(flat, "dialogue.backend") != null);
        }

        /// <summary>
        /// The ONLY IO in this type: read the process environment and (optionally) a .env and a toml
        /// file, then hand the text to <see cref="Parse"/>. Hosts own file IO — this convenience is
        /// the thin, clearly-separated seam a host calls; the sim proper uses <see cref="Parse"/>.
        ///
        /// It also owns the ONE socket the local-first route needs. Set <paramref name="probeOllama"/>
        /// false to skip it entirely (CI, tests, a host that already knows).
        /// </summary>
        public static LlmSettings LoadFromEnvironment(string dotEnvPath = null, string tomlPath = null,
            bool probeOllama = true)
        {
            var env = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (DictionaryEntry e in Environment.GetEnvironmentVariables())
            {
                if (e.Key is string k) env[k] = e.Value as string ?? string.Empty;
            }
            string dotEnv = (dotEnvPath != null && File.Exists(dotEnvPath)) ? File.ReadAllText(dotEnvPath) : null;
            string toml = (tomlPath != null && File.Exists(tomlPath)) ? File.ReadAllText(tomlPath) : null;
            return Resolve(env, dotEnv, toml, probeOllama ? ProbeOllamaModel : (Func<string, string, bool>)null);
        }

        /// <summary>
        /// The local-first decision, with the socket lifted out as <paramref name="probe"/>
        /// (baseUrl, model) =&gt; is-it-serving-that. Null means "don't probe at all". Pure apart from
        /// whatever the delegate does, so a test can pin the DECISION — which is the safety-critical
        /// part — without a server: that this passes a MEASURED value rather than a constant, asks
        /// about the right model, and does not reach for the network when the answer cannot matter.
        ///
        /// The parse runs twice, both times pure. Pass 1 assumes readiness purely to learn WHICH local
        /// model this config would ask for; under that assumption the auto-route arm always yields the
        /// ollama route, so a pass-1 backend that is NOT ollama means the user named a different one
        /// explicitly. Either way an explicitly configured dialogue.backend short-circuits: explicit
        /// always wins, so a measurement could not change the outcome and buying one costs a boot
        /// stall (up to the probe timeout) for an answer nobody reads.
        /// </summary>
        internal static LlmSettings Resolve(IReadOnlyDictionary<string, string> env, string dotEnv, string toml,
            Func<string, string, bool> probe)
        {
            if (probe == null) return Parse(env, dotEnv, toml);

            LlmSettings candidate = Parse(env, dotEnv, toml, ollamaReady: true);
            if (candidate.DialogueBackendConfigured) return Parse(env, dotEnv, toml);
            if (!string.Equals(candidate.Dialogue.Backend, "ollama", StringComparison.Ordinal))
                return Parse(env, dotEnv, toml);

            ProviderConfig ollama = candidate.Providers["ollama"];
            string want = string.IsNullOrEmpty(candidate.Dialogue.Model) ? ollama.Model : candidate.Dialogue.Model;
            return Parse(env, dotEnv, toml, ollamaReady: probe(ollama.BaseUrl, want));
        }

        /// <summary>
        /// Is a local Ollama at <paramref name="baseUrl"/> serving <paramref name="model"/> right now?
        /// Asks <c>GET /api/tags</c> (cheap, loads nothing) and looks for the tag. Deliberately checks
        /// the MODEL, not just the port: a running server with nothing pulled answers 200 and would
        /// otherwise win the auto-route, then 404 on every single turn. Any fault — down, hung, garbage
        /// — is a plain false; this must never throw into a host's boot path or stall it, hence the
        /// short timeout. Ollama stores a bare tag as "name:latest", so both spellings match.
        ///
        /// The response is also bounded in SIZE, not just in time. `base_url` is user-settable, this
        /// runs on every host boot, and the timeout stops the clock but not the allocator: against a
        /// server that streams an endless /api/tags body, the default 2 GB buffer limit let the boot
        /// allocate ~3.9 GiB before giving up. A real tag list is a few KB; 1 MiB is generous.
        /// Exceeding the cap throws, which the catch below turns into an ordinary "not ready".
        /// </summary>
        private const int MaxTagsBodyBytes = 1 << 20;

        private static bool ProbeOllamaModel(string baseUrl, string model)
        {
            if (string.IsNullOrEmpty(baseUrl) || string.IsNullOrEmpty(model)) return false;
            try
            {
                using (var http = new System.Net.Http.HttpClient
                {
                    Timeout = TimeSpan.FromSeconds(2),
                    MaxResponseContentBufferSize = MaxTagsBodyBytes,
                })
                {
                    System.Net.Http.HttpResponseMessage r =
                        http.GetAsync(baseUrl.TrimEnd('/') + "/api/tags").GetAwaiter().GetResult();
                    if (!r.IsSuccessStatusCode) return false;
                    return TagsListContains(r.Content.ReadAsStringAsync().GetAwaiter().GetResult(), model);
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Pure: does an <c>/api/tags</c> body list <paramref name="model"/>? Split out from the
        /// socket so the matching rule (exact tag, or the implicit <c>:latest</c>) is unit-testable.</summary>
        internal static bool TagsListContains(string tagsJson, string model)
        {
            if (string.IsNullOrEmpty(tagsJson) || string.IsNullOrEmpty(model)) return false;
            string alt = model.IndexOf(':') < 0 ? model + ":latest" : null;
            try
            {
                using (System.Text.Json.JsonDocument doc = System.Text.Json.JsonDocument.Parse(tagsJson))
                {
                    if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) return false;
                    if (!doc.RootElement.TryGetProperty("models", out System.Text.Json.JsonElement models)
                        || models.ValueKind != System.Text.Json.JsonValueKind.Array) return false;
                    foreach (System.Text.Json.JsonElement m in models.EnumerateArray())
                    {
                        if (m.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                        if (!m.TryGetProperty("name", out System.Text.Json.JsonElement n)
                            || n.ValueKind != System.Text.Json.JsonValueKind.String) continue;
                        string name = n.GetString();
                        if (string.Equals(name, model, StringComparison.Ordinal)) return true;
                        if (alt != null && string.Equals(name, alt, StringComparison.Ordinal)) return true;
                    }
                }
            }
            catch (System.Text.Json.JsonException)
            {
                return false;
            }
            return false;
        }

        /// <summary>
        /// "It just works": when NO dialogue.backend is configured in any source, pick the best
        /// available live backend with its dialogue-lane default model. Order is LOCAL-FIRST —
        /// a ready Ollama beats a cloud key, because local dialogue is free, private and offline.
        /// Then a present anthropic key, then openai, else whatever was configured (template).
        ///
        /// Ollama is only reachable through this arm when the caller passed
        /// <paramref name="ollamaReady"/> = true, i.e. it verified a local server IS serving the
        /// model this config asks for. Settings alone can never assert that (no IO here), and
        /// auto-selecting a merely-configured Ollama would let a stopped server or an unpulled
        /// model steal the route from a working cloud key and degrade every turn to template.
        ///
        /// Explicit configuration always wins — set dialogue.backend = "template" (or
        /// PERILUNE_LLM_DIALOGUE_BACKEND=template) to force offline even with keys on disk, or
        /// dialogue.backend = "ollama" to route locally without any probe.
        /// </summary>
        private static RouteConfig AutoRouteDialogue(RouteConfig configured,
            IReadOnlyDictionary<string, ProviderConfig> providers, IReadOnlyDictionary<string, string> flat,
            bool ollamaReady)
        {
            if (Get(flat, "dialogue.backend") != null) return configured; // explicit wins, always
            string model = Get(flat, "dialogue.model");
            if (ollamaReady)
                return new RouteConfig("ollama", model ?? providers["ollama"].Model);
            if (providers["anthropic"].HasKey)
                return new RouteConfig("anthropic", model ?? AnthropicDefaultModel);
            if (providers["openai"].HasKey)
                return new RouteConfig("openai", model ?? OpenAiDefaultModel);
            return configured;
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
        // aliases below, so a plain `.env` with claude_key/openai_key/gemini_key just works.
        // Aliases map to the same canonical slot, so WITHIN one source the later line wins
        // regardless of spelling; ACROSS sources the usual env > .env > toml precedence decides
        // (gate-verified both ways).
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
                case "ollama_model":
                    return "ollama.model";
                case "ollama_keep_alive":
                    return "ollama.keep_alive";
                case "ollama_num_ctx":
                    return "ollama.num_ctx";
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
