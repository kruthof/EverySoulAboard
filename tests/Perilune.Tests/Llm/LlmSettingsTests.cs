using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Llm.Providers;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L5 — the PURE settings parser: TOML/​.env/env merge with precedence env &gt; .env &gt;
    /// toml, per-role routes, provider credentials + base URLs, the budget cap and price table, the
    /// key-absent ⇒ template-only fallback, InvariantCulture number parsing under a comma-decimal
    /// locale, and key redaction in ToString.
    /// </summary>
    [TestFixture]
    public sealed class LlmSettingsTests
    {
        private const string Toml =
            "[dialogue]\n" +
            "backend = \"anthropic\"\n" +
            "model = \"claude-opus-4-8\"\n" +
            "\n" +
            "[narration]\n" +
            "backend = \"openai\"\n" +
            "model = \"gpt-4o-mini\"\n" +
            "\n" +
            "[bulk]\n" +
            "backend = \"ollama\"\n" +
            "model = \"llama3.1\"\n" +
            "\n" +
            "[anthropic]\n" +
            "key = \"sk-ant-TOMLKEY\"\n" +
            "base_url = \"https://api.anthropic.com\"\n" +
            "\n" +
            "[budget]\n" +
            "usd_per_hour = 0.50\n" +
            "\n" +
            "[price.claude-opus-4-8]\n" +
            "input = 5.0\n" +
            "output = 25.0\n" +
            "cache_read = 0.5\n" +
            "cache_write = 6.25\n";

        [Test]
        public void Parse_Toml_ResolvesRoutesProvidersBudgetPrices()
        {
            LlmSettings s = LlmSettings.Parse(null, null, Toml);

            Assert.That(s.Dialogue.Backend, Is.EqualTo("anthropic"));
            Assert.That(s.Dialogue.Model, Is.EqualTo("claude-opus-4-8"));
            Assert.That(s.Narration.Backend, Is.EqualTo("openai"));
            Assert.That(s.Bulk.Backend, Is.EqualTo("ollama"));
            Assert.That(s.Bulk.Model, Is.EqualTo("llama3.1"));

            Assert.That(s.Providers["anthropic"].ApiKey, Is.EqualTo("sk-ant-TOMLKEY"));
            Assert.That(s.Providers["anthropic"].BaseUrl, Is.EqualTo("https://api.anthropic.com"));
            Assert.That(s.Providers["ollama"].BaseUrl, Is.EqualTo("http://localhost:11434"), "default base url when unset");

            Assert.That(s.BudgetPerHourUsd, Is.EqualTo(0.50m));

            Assert.That(s.Prices.ContainsKey("claude-opus-4-8"), Is.True);
            ModelPrice p = s.Prices["claude-opus-4-8"];
            Assert.That(p.InputPerMillion, Is.EqualTo(5.0m));
            Assert.That(p.OutputPerMillion, Is.EqualTo(25.0m));
            Assert.That(p.CacheReadPerMillion, Is.EqualTo(0.5m));
            Assert.That(p.CacheWritePerMillion, Is.EqualTo(6.25m));
        }

        [Test]
        public void Precedence_Env_Over_DotEnv_Over_Toml()
        {
            // All three set dialogue.model; env must win, then .env, then toml.
            string toml = "[dialogue]\nbackend = \"anthropic\"\nmodel = \"from-toml\"\n";
            string dotEnv = "PERILUNE_LLM_DIALOGUE_MODEL=from-dotenv\nPERILUNE_LLM_NARRATION_MODEL=narr-dotenv\n";
            var env = new Dictionary<string, string> { ["PERILUNE_LLM_DIALOGUE_MODEL"] = "from-env" };

            LlmSettings s = LlmSettings.Parse(env, dotEnv, toml);

            Assert.That(s.Dialogue.Model, Is.EqualTo("from-env"), "env beats .env beats toml");
            Assert.That(s.Narration.Model, Is.EqualTo("narr-dotenv"), ".env applies where env is silent");
            Assert.That(s.Dialogue.Backend, Is.EqualTo("anthropic"), "toml applies where the others are silent");
        }

        [Test]
        public void Env_ProviderKeyAndBaseUrl_Mapped()
        {
            var env = new Dictionary<string, string>
            {
                ["PERILUNE_LLM_ANTHROPIC_KEY"] = "sk-ant-ENVKEY",
                ["PERILUNE_LLM_ANTHROPIC_BASE_URL"] = "https://proxy.internal",
                ["PERILUNE_LLM_BUDGET_USD_PER_HOUR"] = "1.25",
            };
            LlmSettings s = LlmSettings.Parse(env, null, null);
            Assert.That(s.Providers["anthropic"].ApiKey, Is.EqualTo("sk-ant-ENVKEY"));
            Assert.That(s.Providers["anthropic"].BaseUrl, Is.EqualTo("https://proxy.internal"));
            Assert.That(s.BudgetPerHourUsd, Is.EqualTo(1.25m));
        }

        [Test]
        public void EffectiveBackend_KeyAbsent_FallsBackToTemplate()
        {
            // dialogue → anthropic but NO anthropic key anywhere ⇒ template-only mode.
            string toml = "[dialogue]\nbackend = \"anthropic\"\nmodel = \"claude-opus-4-8\"\n" +
                          "[bulk]\nbackend = \"ollama\"\nmodel = \"llama3.1\"\n";
            LlmSettings s = LlmSettings.Parse(null, null, toml);

            Assert.That(s.EffectiveBackend(s.Dialogue), Is.EqualTo("template"), "no key ⇒ template");
            Assert.That(s.EffectiveBackend(s.Bulk), Is.EqualTo("ollama"), "ollama needs no key");
        }

        [Test]
        public void EffectiveBackend_KeyPresent_UsesConfiguredBackend()
        {
            var env = new Dictionary<string, string> { ["PERILUNE_LLM_ANTHROPIC_KEY"] = "sk-ant-x" };
            LlmSettings s = LlmSettings.Parse(env, null, Toml);
            Assert.That(s.EffectiveBackend(s.Dialogue), Is.EqualTo("anthropic"));
        }

        [Test]
        public void Budget_ParsedInvariant_UnderTrTr()
        {
            CultureInfo original = CultureInfo.CurrentCulture;
            try
            {
                CultureInfo.CurrentCulture = new CultureInfo("tr-TR"); // comma is the decimal separator
                LlmSettings s = LlmSettings.Parse(null, null, "[budget]\nusd_per_hour = 0.50\n");
                Assert.That(s.BudgetPerHourUsd, Is.EqualTo(0.50m), "0.50 parses as one-half regardless of locale");
            }
            finally
            {
                CultureInfo.CurrentCulture = original;
            }
        }

        [Test]
        public void ToString_DoesNotLeakKeys()
        {
            var env = new Dictionary<string, string> { ["PERILUNE_LLM_ANTHROPIC_KEY"] = "sk-ant-SUPERSECRET" };
            LlmSettings s = LlmSettings.Parse(env, null, Toml);

            Assert.That(s.ToString(), Does.Not.Contain("SUPERSECRET"));
            Assert.That(s.ToString(), Does.Not.Contain("TOMLKEY"));
            Assert.That(s.Providers["anthropic"].ToString(), Does.Not.Contain("SUPERSECRET"));
            Assert.That(s.Providers["anthropic"].ToString(), Does.Contain("<set>"));
        }

        [Test]
        public void DotEnv_WellKnownKeyAliases_MapToProviderKeys()
        {
            // The repo-root .env convention: plain provider key names, no PERILUNE_LLM_ prefix.
            string dotEnv = "claude_key = sk-ant-ALIAS\nopenai_key = sk-oai-ALIAS\ngeminie_key = AQ.ALIAS\nollama_host = http://box:11434\n";
            LlmSettings s = LlmSettings.Parse(null, dotEnv, null);

            Assert.That(s.Providers["anthropic"].ApiKey, Is.EqualTo("sk-ant-ALIAS"));
            Assert.That(s.Providers["openai"].ApiKey, Is.EqualTo("sk-oai-ALIAS"));
            Assert.That(s.Providers["gemini"].ApiKey, Is.EqualTo("AQ.ALIAS"));
            Assert.That(s.Providers["ollama"].BaseUrl, Is.EqualTo("http://box:11434"));
        }

        [Test]
        public void KeyAliases_LoseToCanonicalNames_AcrossSources()
        {
            // A canonical env var must beat a .env alias (source precedence unchanged).
            var env = new Dictionary<string, string> { ["PERILUNE_LLM_ANTHROPIC_KEY"] = "sk-ant-CANON" };
            LlmSettings s = LlmSettings.Parse(env, "claude_key=sk-ant-ALIAS\n", null);
            Assert.That(s.Providers["anthropic"].ApiKey, Is.EqualTo("sk-ant-CANON"));
        }

        [Test]
        public void KeyAliases_TemplateFallbackStillHoldsWithoutThem()
        {
            LlmSettings s = LlmSettings.Parse(null, "unrelated_key=nope\n", "[dialogue]\nbackend = \"anthropic\"\n");
            Assert.That(s.EffectiveBackend(s.Dialogue), Is.EqualTo("template"), "unknown names stay ignored; key-absent => template");
        }

        // ------------------------------------------------------------ dialogue auto-route

        [Test]
        public void KeyAlone_AutoRoutesDialogueToAnthropic_WithHaikuDefault()
        {
            LlmSettings s = LlmSettings.Parse(null, "claude_key=sk-ant-x\n", null);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("anthropic"), "a bare key selects the live backend");
            Assert.That(s.Dialogue.Model, Is.EqualTo("claude-haiku-4-5-20251001"), "dialogue-lane default model");
            Assert.That(s.EffectiveBackend(s.Dialogue), Is.EqualTo("anthropic"));
        }

        [Test]
        public void OpenAiKeyAlone_AutoRoutesDialogue_AnthropicPreferredWhenBoth()
        {
            LlmSettings only = LlmSettings.Parse(null, "openai_key=sk-oai-x\n", null);
            Assert.That(only.Dialogue.Backend, Is.EqualTo("openai"));
            Assert.That(only.Dialogue.Model, Is.EqualTo("gpt-4o-mini"));

            LlmSettings both = LlmSettings.Parse(null, "openai_key=sk-oai-x\nclaude_key=sk-ant-x\n", null);
            Assert.That(both.Dialogue.Backend, Is.EqualTo("anthropic"), "anthropic preferred when both keys present");
        }

        [Test]
        public void ExplicitBackend_AlwaysBeatsAutoRoute()
        {
            LlmSettings forced = LlmSettings.Parse(null, "claude_key=sk-ant-x\nPERILUNE_LLM_DIALOGUE_BACKEND=template\n", null);
            Assert.That(forced.Dialogue.Backend, Is.EqualTo("template"), "explicit template wins over a present key");
            Assert.That(forced.EffectiveBackend(forced.Dialogue), Is.EqualTo("template"));
        }

        [Test]
        public void ConfiguredModel_SurvivesAutoRoute()
        {
            LlmSettings s = LlmSettings.Parse(null, "claude_key=sk-ant-x\nPERILUNE_LLM_DIALOGUE_MODEL=claude-opus-4-8\n", null);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("anthropic"));
            Assert.That(s.Dialogue.Model, Is.EqualTo("claude-opus-4-8"), "an explicit model rides the auto-routed backend");
        }

        [Test]
        public void NoKeysNoConfig_StaysTemplate()
        {
            LlmSettings s = LlmSettings.Parse(null, null, null);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("template"));
        }

        // ------------------------------------------------------ local-first ollama route
        // Parse stays PURE: "is a local Ollama serving the wanted model" arrives as a parameter, so
        // every case below is exercised without a socket. The probe itself lives in
        // LoadFromEnvironment; its one piece of judgement (tag matching) is TagsListContains, pinned
        // separately below.

        [Test]
        public void LocalOllamaReady_BeatsACloudKey_LocalFirst()
        {
            LlmSettings s = LlmSettings.Parse(null, "claude_key=sk-ant-x\nopenai_key=sk-oai-x\n", null, ollamaReady: true);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("ollama"), "a ready local model outranks both cloud keys");
            Assert.That(s.Dialogue.Model, Is.EqualTo("mistral"), "the shipped local dialogue model");
            Assert.That(s.EffectiveBackend(s.Dialogue), Is.EqualTo("ollama"));
            Assert.That(s.OllamaReady, Is.True);
        }

        [Test]
        public void LocalOllamaNotReady_LeavesTheCloudAutoRouteExactlyAsBefore()
        {
            // The regression guard for the whole feature: an absent local server must change nothing.
            LlmSettings s = LlmSettings.Parse(null, "claude_key=sk-ant-x\n", null, ollamaReady: false);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("anthropic"));
            Assert.That(s.Dialogue.Model, Is.EqualTo("claude-haiku-4-5-20251001"));
            Assert.That(s.OllamaReady, Is.False);

            LlmSettings dflt = LlmSettings.Parse(null, "claude_key=sk-ant-x\n", null);
            Assert.That(dflt.Dialogue.Backend, Is.EqualTo("anthropic"), "the ollamaReady default is false");
        }

        [Test]
        public void LocalOllamaReady_ButNoKeysAtAll_StillRoutesLocal()
        {
            LlmSettings s = LlmSettings.Parse(null, null, null, ollamaReady: true);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("ollama"), "offline play with a local model, no key needed");
            Assert.That(s.Dialogue.Model, Is.EqualTo("mistral"));
        }

        [Test]
        public void ExplicitBackend_StillBeatsTheLocalFirstRoute()
        {
            LlmSettings forced = LlmSettings.Parse(null,
                "claude_key=sk-ant-x\nPERILUNE_LLM_DIALOGUE_BACKEND=anthropic\n", null, ollamaReady: true);
            Assert.That(forced.Dialogue.Backend, Is.EqualTo("anthropic"), "explicit config outranks a ready local model");

            LlmSettings offline = LlmSettings.Parse(null,
                "PERILUNE_LLM_DIALOGUE_BACKEND=template\n", null, ollamaReady: true);
            Assert.That(offline.Dialogue.Backend, Is.EqualTo("template"), "forcing offline still works");
        }

        [Test]
        public void ConfiguredModel_RidesTheLocalFirstRoute()
        {
            LlmSettings s = LlmSettings.Parse(null,
                "PERILUNE_LLM_DIALOGUE_MODEL=mistral-nemo\n", null, ollamaReady: true);
            Assert.That(s.Dialogue.Backend, Is.EqualTo("ollama"));
            Assert.That(s.Dialogue.Model, Is.EqualTo("mistral-nemo"), "an explicit model rides the auto-routed backend");
        }

        [Test]
        public void OllamaProviderModel_DefaultsToMistral_AndIsOverridableByAlias()
        {
            Assert.That(LlmSettings.Parse(null, null, null).Providers["ollama"].Model, Is.EqualTo("mistral"));

            LlmSettings alias = LlmSettings.Parse(null, "ollama_model = mistral-nemo\n", null);
            Assert.That(alias.Providers["ollama"].Model, Is.EqualTo("mistral-nemo"), "the .env alias maps to ollama.model");

            LlmSettings canonical = LlmSettings.Parse(null, null, "[ollama]\nmodel = \"qwen3\"\n");
            Assert.That(canonical.Providers["ollama"].Model, Is.EqualTo("qwen3"));

            // The ollama-only default must not leak into providers that have no such notion.
            Assert.That(LlmSettings.Parse(null, null, null).Providers["anthropic"].Model, Is.Empty);
        }

        [Test]
        public void OllamaProviderModel_FeedsTheAutoRoutedModel()
        {
            LlmSettings s = LlmSettings.Parse(null, "ollama_model = mistral-nemo\n", null, ollamaReady: true);
            Assert.That(s.Dialogue.Model, Is.EqualTo("mistral-nemo"),
                "the provider-level model is what the local-first route asks for");
        }

        [Test]
        public void ProviderToString_ShowsTheModel_ButStillNeverTheKey()
        {
            LlmSettings s = LlmSettings.Parse(null, "claude_key=sk-ant-SUPERSECRET\nollama_model=mistral\n", null);
            Assert.That(s.Providers["ollama"].ToString(), Does.Contain("mistral"));
            Assert.That(s.Providers["anthropic"].ToString(), Does.Not.Contain("SUPERSECRET"));
            Assert.That(s.Providers["anthropic"].ToString(), Does.Contain("<set>"));
        }

        // ------------------------------------------------------ the local-first DECISION (Resolve)
        // Parse's own tests pin the pure arm, but they cannot catch the seam handing it a CONSTANT:
        // replacing LoadFromEnvironment's body with `ollamaReady: true` — which would route every
        // unconfigured user at a possibly-absent server and degrade all dialogue to template — left
        // the whole suite green. These pin the decision itself, with the socket injected.

        private sealed class ProbeSpy
        {
            public int Calls;
            public string LastBaseUrl, LastModel;
            public bool Answer;
            public Func<string, string, bool> Fn => (url, model) =>
            {
                Calls++; LastBaseUrl = url; LastModel = model; return Answer;
            };
        }

        [Test]
        public void Resolve_UsesTheMeasuredAnswer_NotAConstant()
        {
            var no = new ProbeSpy { Answer = false };
            LlmSettings absent = LlmSettings.Resolve(null, "claude_key=sk-ant-x\n", null, no.Fn);
            Assert.That(absent.Dialogue.Backend, Is.EqualTo("anthropic"), "a false probe must NOT route local");
            Assert.That(absent.OllamaReady, Is.False);

            var yes = new ProbeSpy { Answer = true };
            LlmSettings present = LlmSettings.Resolve(null, "claude_key=sk-ant-x\n", null, yes.Fn);
            Assert.That(present.Dialogue.Backend, Is.EqualTo("ollama"), "a true probe must route local");
            Assert.That(present.OllamaReady, Is.True);
        }

        [Test]
        public void Resolve_AsksAboutTheModelItWouldActuallyUse_ExactlyOnce()
        {
            var spy = new ProbeSpy { Answer = true };
            LlmSettings s = LlmSettings.Resolve(null, "ollama_model=mistral-nemo\nollama_host=http://box:11434\n", null, spy.Fn);

            Assert.That(spy.Calls, Is.EqualTo(1), "one socket per boot, not one per parse pass");
            Assert.That(spy.LastModel, Is.EqualTo("mistral-nemo"), "probing for the wrong tag would defeat the check");
            Assert.That(spy.LastBaseUrl, Is.EqualTo("http://box:11434"));
            Assert.That(s.Dialogue.Model, Is.EqualTo("mistral-nemo"));

            // An explicit dialogue.model is what the route will ask the server for, so it is what the
            // probe must ask about too.
            var spy2 = new ProbeSpy { Answer = true };
            LlmSettings.Resolve(null, "PERILUNE_LLM_DIALOGUE_MODEL=qwen3:8b\n", null, spy2.Fn);
            Assert.That(spy2.LastModel, Is.EqualTo("qwen3:8b"));
        }

        [Test]
        public void Resolve_NeverTouchesTheNetworkWhenTheAnswerCannotMatter()
        {
            // Explicit configuration always wins, so a measurement could not change the route — and
            // buying one costs a boot stall up to the probe timeout for an answer nobody reads.
            foreach (string backend in new[] { "anthropic", "template", "ollama", "openai" })
            {
                var spy = new ProbeSpy { Answer = true };
                LlmSettings s = LlmSettings.Resolve(null,
                    "claude_key=sk-ant-x\nPERILUNE_LLM_DIALOGUE_BACKEND=" + backend + "\n", null, spy.Fn);
                Assert.That(spy.Calls, Is.EqualTo(0), "explicit backend '" + backend + "' must not probe");
                Assert.That(s.Dialogue.Backend, Is.EqualTo(backend), "and the explicit route is honoured");
                Assert.That(s.DialogueBackendConfigured, Is.True);
            }

            // A null probe means "don't probe at all" — the offline/CI path.
            LlmSettings offline = LlmSettings.Resolve(null, "claude_key=sk-ant-x\n", null, null);
            Assert.That(offline.Dialogue.Backend, Is.EqualTo("anthropic"));
            Assert.That(offline.OllamaReady, Is.False);
        }

        [Test]
        public void DialogueBackendConfigured_SeparatesNotProbedFromProbedAndAbsent()
        {
            // The host prints "no local Ollama serving X" off OllamaReady. Without this flag that line
            // fires on an explicitly-cloud-routed boot too, claiming a server is missing when one is
            // sitting there running.
            Assert.That(LlmSettings.Parse(null, "claude_key=sk-ant-x\n", null).DialogueBackendConfigured, Is.False);
            Assert.That(LlmSettings.Parse(null, "PERILUNE_LLM_DIALOGUE_BACKEND=anthropic\n", null)
                .DialogueBackendConfigured, Is.True);
            Assert.That(LlmSettings.Parse(null, null, "[dialogue]\nbackend = \"template\"\n")
                .DialogueBackendConfigured, Is.True, "a toml-configured backend counts too");
        }

        // ------------------------------------------------------ ollama residency hints

        [Test]
        public void OllamaResidencyHints_ParseFromConfig_AndDefaultToNull()
        {
            ProviderConfig bare = LlmSettings.Parse(null, null, null).Providers["ollama"];
            Assert.That(bare.KeepAlive, Is.Null, "unset means the adapter's own default applies");
            Assert.That(bare.NumCtx, Is.Null);

            ProviderConfig tuned = LlmSettings.Parse(null, "ollama_keep_alive=-1\nollama_num_ctx=32768\n", null)
                .Providers["ollama"];
            Assert.That(tuned.KeepAlive, Is.EqualTo("-1"));
            Assert.That(tuned.NumCtx, Is.EqualTo(32768));

            // Junk and non-positive values fall back to the default rather than reaching the wire,
            // where num_ctx 0 would be read as a real (catastrophic) setting.
            foreach (string junk in new[] { "0", "-4", "viele", "8192.5", "" })
            {
                ProviderConfig bad = LlmSettings.Parse(null, "ollama_num_ctx=" + junk + "\n", null).Providers["ollama"];
                Assert.That(bad.NumCtx, Is.Null, "num_ctx '" + junk + "' must not reach the wire");
            }

            // de-DE is the dev machine: a comma-grouped number must not parse as 32768.
            Assert.That(LlmSettings.Parse(null, "ollama_num_ctx=32.768\n", null).Providers["ollama"].NumCtx,
                Is.Null, "InvariantCulture only");
        }

        // ------------------------------------------------------ /api/tags matching (pure)

        [Test]
        public void TagsList_MatchesExactTag_AndTheImplicitLatest()
        {
            const string body = "{\"models\":[{\"name\":\"mistral:latest\",\"size\":1},{\"name\":\"qwen3:8b\"}]}";
            Assert.That(LlmSettings.TagsListContains(body, "mistral"), Is.True, "a bare tag means :latest");
            Assert.That(LlmSettings.TagsListContains(body, "mistral:latest"), Is.True);
            Assert.That(LlmSettings.TagsListContains(body, "qwen3:8b"), Is.True);
        }

        [Test]
        public void TagsList_RejectsAbsentAndNearMissTags()
        {
            const string body = "{\"models\":[{\"name\":\"mistral:latest\"},{\"name\":\"qwen3:8b\"}]}";
            Assert.That(LlmSettings.TagsListContains(body, "llama3.2"), Is.False);
            Assert.That(LlmSettings.TagsListContains(body, "qwen3"), Is.False,
                "an explicit non-latest tag is NOT satisfied by qwen3:8b — pulling the wrong size must not pass");
            Assert.That(LlmSettings.TagsListContains(body, "mistral-nemo"), Is.False, "prefix is not a match");
            Assert.That(LlmSettings.TagsListContains(body, "MISTRAL"), Is.False, "ollama tags are case-sensitive");
        }

        [Test]
        public void TagsList_SurvivesEveryMalformedBody_WithoutThrowing()
        {
            // A running-but-weird server (a proxy, a different product on :11434) must read as "not
            // ready", never as an exception in a host's boot path.
            Assert.That(LlmSettings.TagsListContains("{\"models\":[]}", "mistral"), Is.False, "empty server");
            Assert.That(LlmSettings.TagsListContains("{}", "mistral"), Is.False, "no models key");
            Assert.That(LlmSettings.TagsListContains("{\"models\":\"nope\"}", "mistral"), Is.False, "models not an array");
            Assert.That(LlmSettings.TagsListContains("{\"models\":[42,null,{\"x\":1},{\"name\":7}]}", "mistral"), Is.False);
            Assert.That(LlmSettings.TagsListContains("[]", "mistral"), Is.False, "root not an object");
            Assert.That(LlmSettings.TagsListContains("not json at all", "mistral"), Is.False);
            Assert.That(LlmSettings.TagsListContains("", "mistral"), Is.False);
            Assert.That(LlmSettings.TagsListContains(null, "mistral"), Is.False);
            Assert.That(LlmSettings.TagsListContains("{\"models\":[{\"name\":\"mistral:latest\"}]}", null), Is.False);
            Assert.That(LlmSettings.TagsListContains("{\"models\":[{\"name\":\"mistral:latest\"}]}", ""), Is.False);
        }
    }
}
