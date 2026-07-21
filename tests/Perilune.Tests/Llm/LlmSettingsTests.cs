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
    }
}
