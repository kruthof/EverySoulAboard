using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Llm;
using Perilune.Llm.Providers;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// The LIVE-PROVIDER SMOKE lane (P2). Boots the authored "Talking Ship" slice with minds,
    /// builds a real vendor backend from <see cref="LlmSettings.LoadFromEnvironment"/> (repo-root
    /// <c>.env</c>), and drives ONE short scripted conversation (greeting → ask-about-secret →
    /// goodbye) against ONE citizen through <see cref="ConversationService"/>'s prepare/complete
    /// pair — streaming deltas to stdout as they arrive (typewriter proof) and printing, per turn:
    /// backend+model, delta count, the authoritative reply, accepted effects, <see cref="TurnUsage"/>
    /// (tokens incl. cache fields), and the running <see cref="CostMeter"/> total + $/hr projection.
    ///
    /// THE LAW: this verb is env-gated (it does real, paid network calls) and is NEVER referenced by
    /// ci.sh or the test suite. It exists to catch provider-shape drift the fixtures can't predict.
    ///
    /// KEY HYGIENE: every byte written to stdout is routed through <see cref="Scrub"/>, which replaces
    /// any provider key string with "***" — defense in depth on top of the adapters (which put the key
    /// only on the auth header, never the request body).
    ///
    ///   dotnet run --project hosts/scenario -- llm-smoke [--backend anthropic|openai|ollama|all] [--ship slice] [--env PATH]
    ///
    /// Exit code: 0 if at least one live backend completed a turn; 2 if all attempted backends failed.
    /// </summary>
    public static class LlmSmoke
    {
        private const string AnthropicDefaultModel = "claude-haiku-4-5-20251001"; // dialogue-lane default class
        private const string OpenAiDefaultModel = "gpt-4o-mini";
        private const string OllamaDefaultModel = "llama3.2";

        private static readonly List<string> Secrets = new List<string>();

        public static int Run(string[] args)
        {
            return RunAsync(args).GetAwaiter().GetResult();
        }

        private static async Task<int> RunAsync(string[] args)
        {
            string backendArg = (ArgString(args, "--backend", "all") ?? "all").ToLowerInvariant();
            string ship = (ArgString(args, "--ship", "slice") ?? "slice").ToLowerInvariant();
            string envArg = ArgString(args, "--env", null);

            L("== PERILUNE llm-smoke (P2 live-provider smoke) ==");
            L("date: " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss'Z'", CultureInfo.InvariantCulture));

            string envPath = ResolveEnvPath(envArg);
            L("env: " + (envPath != null ? envPath : "(none found — process environment only)"));

            LlmSettings settings = LlmSettings.LoadFromEnvironment(envPath);
            // Register every provider key for output scrubbing BEFORE anything can be printed.
            RegisterSecret(settings, "anthropic");
            RegisterSecret(settings, "openai");
            RegisterSecret(settings, "gemini");
            L("settings: " + settings.ToString()); // keys deliberately omitted by LlmSettings.ToString

            if (ship != "slice")
                L("note: --ship '" + ship + "' unrecognised; the smoke boots the authored slice regardless.");

            // ---- Boot the slice with minds -------------------------------------------------
            Simulation sim; MindState minds; FactRegistry facts;
            BuildSlice(out sim, out minds, out facts);
            Citizen speaker = PickCitizen(sim, minds);
            if (speaker == null)
            {
                L("FATAL: the slice booted no conversable citizen (no living crew with a mind).");
                return 2;
            }
            L("citizen: " + speaker.Name + " (id " + speaker.Id.ToString(CultureInfo.InvariantCulture) + ")");
            L("");

            // ---- Cost meter with the shipped price table -----------------------------------
            // Per 1M tokens (USD): from docs/legacy/LLM_CITIZENS.md §11 + the standard cache
            // multipliers (cache read ~0.1x input, cache write ~1.25x input for the 5-min TTL).
            var prices = new Dictionary<string, ModelPrice>(StringComparer.Ordinal)
            {
                ["claude-haiku-4-5"] = new ModelPrice(1m, 5m, 0.10m, 1.25m),
                ["claude-haiku-4-5-20251001"] = new ModelPrice(1m, 5m, 0.10m, 1.25m),
                ["claude-sonnet-5"] = new ModelPrice(3m, 15m, 0.30m, 3.75m),
                ["claude-opus-4-8"] = new ModelPrice(5m, 25m, 0.50m, 6.25m),
                ["gpt-4o-mini"] = new ModelPrice(0.15m, 0.60m, 0m, 0m),
            };
            var cost = new CostMeter(prices, settings.BudgetPerHourUsd);

            var order = ResolveBackendOrder(backendArg);
            int attempted = 0, completed = 0, failed = 0, skipped = 0;

            foreach (string name in order)
            {
                L("------------------------------------------------------------------");
                string skipReason;
                IChatBackend backend = BuildBackend(name, settings, out string model, out skipReason);
                if (backend == null)
                {
                    L("[" + name + "] SKIPPED — " + skipReason);
                    skipped++;
                    continue;
                }

                attempted++;
                bool ok = await RunBackendAsync(name, model, backend, sim, minds, facts, speaker, prices, cost)
                    .ConfigureAwait(false);
                if (ok) completed++; else failed++;
            }

            L("------------------------------------------------------------------");
            L("summary: " + completed + " completed, " + failed + " failed, " + skipped + " skipped (of " + order.Count + " requested)");
            L("cost meter: running total " + CostMeter.FormatUsd(cost.TotalUsd)
                + " / trailing-hour projection " + CostMeter.FormatUsd(cost.CostPerHourUsd(DateTime.UtcNow)) + "/hr"
                + "  [budget cap " + CostMeter.FormatUsd(settings.BudgetPerHourUsd) + "/hr]");
            L("key hygiene: OK — " + Secrets.Count + " provider key(s) held for scrubbing; all stdout routed through Scrub.");

            if (completed > 0) return 0;
            if (attempted > 0) return 2; // every attempted live backend failed
            return 0;                    // nothing attempted (all skipped) — not a failure
        }

        // ------------------------------------------------------------------ per-backend driver

        private static async Task<bool> RunBackendAsync(
            string name, string model, IChatBackend backend,
            Simulation sim, MindState minds, FactRegistry facts, Citizen speaker,
            IDictionary<string, ModelPrice> prices, CostMeter cost)
        {
            var svc = new ConversationService(sim, minds, facts, backend);
            string first = FirstName(speaker.Name);
            string[] turns =
            {
                "Hello — I'm the new hand aboard. How are you holding up since the raid?",
                first + ", between us: is there anything you've kept off the manifest? Anything hidden?",
                "Understood — I won't push. Thanks for your time; I'll let you get back to the loops.",
            };

            var sw = Stopwatch.StartNew();
            decimal backendCost = 0m;
            long lastCacheRead = -1;
            bool anyTurnCompleted = false;

            L("[" + name + "] backend=" + backend.Caps.Name + " model=" + model
                + " streaming=" + backend.Caps.SupportsStreaming + " tools=" + backend.Caps.SupportsTools
                + " maxEffects=" + backend.Caps.MaxEffects);

            for (int t = 0; t < turns.Length; t++)
            {
                L("");
                L("  --- turn " + (t + 1) + " ---");
                L("  player> " + turns[t]);

                TurnPlan plan = svc.PrepareTurn(speaker.Id, turns[t]);

                var reply = new StringBuilder();
                var proposed = new List<ProposedEffect>();
                TurnUsage usage = null;
                BackendError err = null;
                int deltaCount = 0, textDeltas = 0, effectDeltas = 0;

                W("  " + name + "> ");
                try
                {
                    await foreach (ChatDelta d in backend.SendAsync(plan.Request, turns[t], CancellationToken.None)
                        .ConfigureAwait(false))
                    {
                        deltaCount++;
                        switch (d)
                        {
                            case TextDelta td:
                                textDeltas++;
                                reply.Append(td.Text);
                                W(td.Text); // typewriter — arrives incrementally for a real streamed backend
                                break;
                            case EffectProposed ep:
                                effectDeltas++;
                                if (ep.Effect != null) proposed.Add(ep.Effect);
                                break;
                            case TurnComplete tc:
                                usage = tc.Usage;
                                break;
                            case BackendError be:
                                err = be;
                                break;
                        }
                    }
                }
                catch (Exception ex)
                {
                    err = new BackendError(name + " threw " + ex.GetType().Name + ": " + ex.Message, true);
                }
                L(""); // close the typewriter line

                if (err != null)
                {
                    L("  BackendError (sanitized): " + err.Message + "  [retryable=" + err.Retryable + "]");
                    L("  -> aborting remaining turns for this backend.");
                    return anyTurnCompleted; // a partially-successful backend still counts as completed
                }

                // Dispatch only whitelisted effects, capped — the same complete-half ConverseAsync runs.
                IReadOnlyList<CitizenEffect> dispatched = svc.CompleteTurn(plan, proposed);
                anyTurnCompleted = true;

                L("  reply: " + OneLine(reply.ToString()));
                L("  deltas: " + deltaCount + " total (" + textDeltas + " text, " + effectDeltas + " effect)"
                    + (textDeltas > 1 ? "  [incremental streaming confirmed]" : "  [single-shot text]"));
                L("  proposed effects: " + DescribeProposed(proposed, plan));
                L("  accepted effects (dispatched, manifest-bound): " + DescribeDispatched(dispatched));

                if (usage != null)
                {
                    ResolvePrice(prices, usage.Model);
                    decimal turnCost = cost.CostOf(usage);
                    backendCost += turnCost;
                    cost.Record(usage, LlmPriority.Dialogue, DateTime.UtcNow);

                    L("  usage: model=" + usage.Model
                        + " input=" + usage.InputTokens
                        + " output=" + usage.OutputTokens
                        + " cache_read=" + usage.CacheReadTokens
                        + " cache_write=" + usage.CacheWriteTokens
                        + (PriceKnown(prices, usage.Model) ? "" : "  [no price row — counted as $0]"));
                    L("  turn cost: " + CostMeter.FormatUsd(turnCost)
                        + "   running total: " + CostMeter.FormatUsd(cost.TotalUsd));

                    if (lastCacheRead >= 0)
                        L("  cache_read delta vs previous turn: "
                            + (usage.CacheReadTokens - lastCacheRead).ToString(CultureInfo.InvariantCulture)
                            + (usage.CacheReadTokens > lastCacheRead ? "  [prefix cache paying off]" : ""));
                    lastCacheRead = usage.CacheReadTokens;
                }
                else
                {
                    L("  usage: (none reported)");
                }
            }

            sw.Stop();
            double secs = sw.Elapsed.TotalSeconds;
            decimal extrapolated = secs > 0.001 ? backendCost / (decimal)secs * 3600m : 0m;
            L("");
            L("  [" + name + "] backend total: " + CostMeter.FormatUsd(backendCost)
                + " over " + secs.ToString("0.0", CultureInfo.InvariantCulture) + "s wall"
                + "  -> extrapolated " + CostMeter.FormatUsd(extrapolated) + "/hr at this pace");
            return anyTurnCompleted;
        }

        // ------------------------------------------------------------------ backend construction

        private static IChatBackend BuildBackend(string name, LlmSettings s, out string model, out string skipReason)
        {
            model = null; skipReason = null;
            switch (name)
            {
                case "anthropic":
                {
                    ProviderConfig p = s.Providers["anthropic"];
                    if (!p.HasKey) { skipReason = "no anthropic key in .env (claude_key / anthropic_api_key)"; return null; }
                    model = ResolveModel(s.Dialogue, "anthropic", AnthropicDefaultModel);
                    return new AnthropicBackend(new HttpChat(new HttpClientHandler()),
                        new AnthropicConfig(p.BaseUrl, p.ApiKey, model));
                }
                case "openai":
                {
                    ProviderConfig p = s.Providers["openai"];
                    if (!p.HasKey) { skipReason = "no openai key in .env (openai_key / openai_api_key)"; return null; }
                    model = ResolveModel(s.Dialogue, "openai", OpenAiDefaultModel);
                    return new OpenAiCompatBackend(new HttpChat(new HttpClientHandler()),
                        new OpenAiCompatConfig(p.BaseUrl, p.ApiKey, model));
                }
                case "ollama":
                {
                    ProviderConfig p = s.Providers["ollama"];
                    string baseUrl = string.IsNullOrEmpty(p.BaseUrl) ? "http://localhost:11434" : p.BaseUrl;
                    if (!ProbeOllama(baseUrl))
                    {
                        skipReason = "Ollama not reachable at " + baseUrl + " (server not running)";
                        return null;
                    }
                    model = ResolveModel(s.Dialogue, "ollama", OllamaDefaultModel);
                    return new OllamaBackend(new HttpChat(new HttpClientHandler()),
                        new OllamaConfig(baseUrl, model));
                }
                default:
                    skipReason = "unknown backend '" + name + "'";
                    return null;
            }
        }

        private static string ResolveModel(RouteConfig dialogue, string backend, string fallback)
        {
            if (dialogue != null && string.Equals(dialogue.Backend, backend, StringComparison.Ordinal)
                && !string.IsNullOrEmpty(dialogue.Model))
                return dialogue.Model;
            return fallback;
        }

        private static bool ProbeOllama(string baseUrl)
        {
            try
            {
                using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) })
                {
                    string url = baseUrl.TrimEnd('/') + "/api/tags";
                    HttpResponseMessage r = http.GetAsync(url).GetAwaiter().GetResult();
                    return r.IsSuccessStatusCode;
                }
            }
            catch
            {
                return false;
            }
        }

        private static List<string> ResolveBackendOrder(string backendArg)
        {
            if (backendArg == "all")
                return new List<string> { "anthropic", "openai", "ollama" };
            var list = new List<string>();
            foreach (string part in backendArg.Split(','))
            {
                string p = part.Trim();
                if (p.Length > 0) list.Add(p);
            }
            if (list.Count == 0) list.Add("anthropic");
            return list;
        }

        // ------------------------------------------------------------------ slice boot (minds)

        // Mirrors GenSimHost/SimHost's engine-free MakeSystems + PopulateSlice, inlined here so the
        // verb can capture the SocialSystem the slice's relationship web needs. Uses compiled defaults.
        private static void BuildSlice(out Simulation sim, out MindState minds, out FactRegistry facts)
        {
            SimDefs defs = SimDefs.Default;
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            minds = new MindState();
            facts = new FactRegistry();

            ShipPlan plan = AuthoredShips.PeriluneSlice();
            var effects = new PendingEffectBuffer();
            ISimSystem designerRules = RulesLoader.CreateSystem(defs, registry);
            ISimSystem[] stack = SystemStack.CreateDefault(moss, designerRules);

            SocialSystem social = null; HistorySystem history = null;
            for (int i = 0; i < stack.Length; i++)
            {
                if (stack[i] is SocialSystem s) social = s;
                if (stack[i] is HistorySystem h) history = h;
            }

            var systems = new ISimSystem[stack.Length + 3];
            systems[0] = new EffectPump(effects, minds, facts);
            for (int i = 0; i < stack.Length; i++) systems[i + 1] = stack[i];
            systems[systems.Length - 2] = new MemorySystem(minds, facts);
            systems[systems.Length - 1] = new EulogySystem(minds, social, history);

            sim = ShipPlanBuilder.Build(plan, systems, defs);
            FogReveal.RevealReachable(sim);
            AuthoredShips.PopulateSlice(sim, minds, facts, social); // authored minds + secrets + relationships
            MossBindings.RegisterAdapters(sim, registry);
            MossBindings.ApplyScripts(sim, moss);
        }

        private static Citizen PickCitizen(Simulation sim, MindState minds)
        {
            // Prefer Amara (first slice crew, real secret backed by a fact — the ask-about-secret target).
            Citizen fallback = null;
            var items = sim.Citizens.Items;
            for (int i = 0; i < items.Count; i++)
            {
                Citizen c = items[i];
                if (c.Dead) continue;
                if (!minds.Minds.TryGet(c.Id, out _)) continue;
                if (fallback == null) fallback = c;
                if (c.Name == "Amara Okonkwo") return c;
            }
            return fallback;
        }

        // ------------------------------------------------------------------ price resolution

        // The API often reports a dated snapshot id (e.g. gpt-4o-mini-2024-07-18). Map an unknown
        // reported model onto a base price row by prefix so the CostMeter can price it. Adds the exact
        // reported key to the (shared, mutable) price dict so CostMeter.CostOf finds it.
        private static void ResolvePrice(IDictionary<string, ModelPrice> prices, string model)
        {
            if (string.IsNullOrEmpty(model) || prices.ContainsKey(model)) return;
            foreach (var kv in new List<KeyValuePair<string, ModelPrice>>(prices))
            {
                if (model.StartsWith(kv.Key, StringComparison.Ordinal))
                {
                    prices[model] = kv.Value;
                    return;
                }
            }
        }

        private static bool PriceKnown(IDictionary<string, ModelPrice> prices, string model)
            => !string.IsNullOrEmpty(model) && prices.ContainsKey(model);

        // ------------------------------------------------------------------ describe helpers

        private static string DescribeProposed(List<ProposedEffect> effects, TurnPlan plan)
        {
            if (effects == null || effects.Count == 0) return "(none)";
            var sb = new StringBuilder();
            for (int i = 0; i < effects.Count; i++)
            {
                if (i > 0) sb.Append("; ");
                ProposedEffect e = effects[i];
                sb.Append(e.Kind.ToString())
                  .Append("(target=").Append(e.TargetId.ToString(CultureInfo.InvariantCulture))
                  .Append(", mag=").Append(e.Magnitude.ToString("0.##", CultureInfo.InvariantCulture)).Append(')');
            }
            return sb.ToString();
        }

        private static string DescribeDispatched(IReadOnlyList<CitizenEffect> effects)
        {
            if (effects == null || effects.Count == 0) return "(none)";
            var sb = new StringBuilder();
            for (int i = 0; i < effects.Count; i++)
            {
                if (i > 0) sb.Append("; ");
                CitizenEffect e = effects[i];
                switch (e)
                {
                    case SetDisposition sd: sb.Append("SetDisposition(affinity=")
                        .Append(sd.DeltaAffinity.ToString("0.##", CultureInfo.InvariantCulture)).Append(')'); break;
                    case RevealInfo ri: sb.Append("RevealInfo(fact=")
                        .Append(ri.FactId.ToString(CultureInfo.InvariantCulture)).Append(')'); break;
                    case AgreeTask at: sb.Append("AgreeTask(").Append(at.Job).Append(')'); break;
                    case FollowPlayer fp: sb.Append("FollowPlayer(").Append(fp.Follow).Append(')'); break;
                    case EndConversation _: sb.Append("EndConversation"); break;
                    default: sb.Append(e.GetType().Name); break;
                }
            }
            return sb.ToString();
        }

        // ------------------------------------------------------------------ small utilities

        private static string ResolveEnvPath(string envArg)
        {
            if (!string.IsNullOrEmpty(envArg)) return File.Exists(envArg) ? envArg : null;
            // Walk up from the running binary AND the cwd looking for a .env (the repo-root secret file).
            string fromBase = ProbeUp(AppContext.BaseDirectory);
            if (fromBase != null) return fromBase;
            return ProbeUp(Directory.GetCurrentDirectory());
        }

        private static string ProbeUp(string start)
        {
            try
            {
                var dir = new DirectoryInfo(start);
                while (dir != null)
                {
                    string candidate = Path.Combine(dir.FullName, ".env");
                    if (File.Exists(candidate)) return candidate;
                    dir = dir.Parent;
                }
            }
            catch { }
            return null;
        }

        private static void RegisterSecret(LlmSettings s, string provider)
        {
            if (s.Providers.TryGetValue(provider, out ProviderConfig p) && p.HasKey && !Secrets.Contains(p.ApiKey))
                Secrets.Add(p.ApiKey);
        }

        private static string Scrub(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            for (int i = 0; i < Secrets.Count; i++)
            {
                string k = Secrets[i];
                if (!string.IsNullOrEmpty(k)) s = s.Replace(k, "***");
            }
            return s;
        }

        private static void W(string s) => Console.Write(Scrub(s));
        private static void L(string s) => Console.WriteLine(Scrub(s));

        private static string OneLine(string s)
        {
            if (string.IsNullOrEmpty(s)) return "(empty)";
            return s.Replace("\r", " ").Replace("\n", " ").Trim();
        }

        private static string FirstName(string full)
        {
            if (string.IsNullOrEmpty(full)) return "friend";
            int sp = full.IndexOf(' ');
            return sp > 0 ? full.Substring(0, sp) : full;
        }

        private static string ArgString(string[] args, string name, string fallback)
        {
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return fallback;
        }
    }
}
