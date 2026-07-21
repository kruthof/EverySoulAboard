using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Llm.Providers;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L4 — the Ollama NDJSON adapter. Replays canned NDJSON through the fake handler (zero
    /// network): the golden turn (cleaned text, resolved effect, usage from prompt_eval_count /
    /// eval_count), NDJSON partial-line buffering under per-byte chunking, a done record without
    /// token counts (zero usage, still completes), a mid-stream error line, and the request body
    /// (/api/chat, no auth header, envelope instruction).
    /// </summary>
    [TestFixture]
    public sealed class OllamaBackendTests
    {
        private const string BaseUrl = "http://localhost:11434";
        private const string Model = "llama3.1";

        private static ConversationRequest RevealRequest()
        {
            var req = new ConversationRequest { CitizenName = "Okafor", PersonaBlock = "clipped", RelationshipSummary = "wary" };
            req.CapabilitySummary.Add(new EffectOption(EffectKind.RevealInfo, 7u, "the cache in D-7"));
            return req;
        }

        private static (OllamaBackend backend, FakeHttpHandler handler) Make(
            Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            var handler = new FakeHttpHandler(responder);
            var backend = new OllamaBackend(new HttpChat(handler), new OllamaConfig(BaseUrl, Model));
            return (backend, handler);
        }

        private static Func<HttpRequestMessage, HttpResponseMessage> StreamOf(string body, int chunk = 0)
        {
            List<byte[]> chunks = chunk <= 0 ? LlmFixtures.Whole(body) : LlmFixtures.Split(body, chunk);
            return _ => FakeHttpHandler.StreamingWith(new ChunkStream(chunks));
        }

        private static async Task<List<ChatDelta>> Collect(System.Collections.Generic.IAsyncEnumerable<ChatDelta> s)
        {
            var list = new List<ChatDelta>();
            await foreach (ChatDelta d in s) list.Add(d);
            return list;
        }

        private static (string text, List<ProposedEffect> effects, TurnUsage usage, bool errored) Reduce(List<ChatDelta> deltas)
        {
            var sb = new StringBuilder();
            var effs = new List<ProposedEffect>();
            TurnUsage usage = null;
            bool errored = false;
            foreach (ChatDelta d in deltas)
            {
                switch (d)
                {
                    case TextDelta t: sb.Append(t.Text); break;
                    case EffectProposed e: effs.Add(e.Effect); break;
                    case TurnComplete c: usage = c.Usage; break;
                    case BackendError _: errored = true; break;
                }
            }
            return (sb.ToString(), effs, usage, errored);
        }

        [Test]
        public async Task Reveal_CleanText_ResolvedEffect_AndUsageFromEvalCounts()
        {
            string body = LlmFixtures.Load("ollama_reveal.ndjson");
            var (backend, handler) = Make(StreamOf(body));

            var (text, effects, usage, errored) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default)));

            Assert.That(handler.CallCount, Is.EqualTo(1));
            Assert.That(errored, Is.False);
            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(text, Does.Not.Contain("```"));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(effects[0].TargetId, Is.EqualTo(7u));
            Assert.That(usage.InputTokens, Is.EqualTo(320), "prompt_eval_count → input");
            Assert.That(usage.OutputTokens, Is.EqualTo(58), "eval_count → output");
        }

        [Test]
        public async Task NdjsonPartialLineBuffering_PerByteChunks_ReproduceTheSameTurn()
        {
            string body = LlmFixtures.Load("ollama_reveal.ndjson");
            var (backend, _) = Make(StreamOf(body, chunk: 1)); // every line split across many reads
            var (text, effects, usage, _) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(usage.InputTokens, Is.EqualTo(320));
            Assert.That(usage.OutputTokens, Is.EqualTo(58));
        }

        [Test]
        public async Task DoneWithoutCounts_ZeroUsage_StillCompletes()
        {
            string body =
                "{\"model\":\"llama3.1\",\"message\":{\"role\":\"assistant\",\"content\":\"Hey.\"},\"done\":false}\n" +
                "{\"model\":\"llama3.1\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n";
            var (backend, _) = Make(StreamOf(body));
            var (text, effects, usage, errored) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(errored, Is.False);
            Assert.That(text, Is.EqualTo("Hey."));
            Assert.That(effects.Count, Is.EqualTo(0));
            Assert.That(usage, Is.Not.Null);
            Assert.That(usage.InputTokens, Is.EqualTo(0));
            Assert.That(usage.OutputTokens, Is.EqualTo(0));
        }

        [Test]
        public async Task MidStreamErrorLine_YieldsRetryableError_NoComplete()
        {
            string body =
                "{\"model\":\"llama3.1\",\"message\":{\"role\":\"assistant\",\"content\":\"partial\"},\"done\":false}\n" +
                "{\"error\":\"model runner crashed\"}\n";
            var (backend, _) = Make(StreamOf(body));
            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            ChatDelta last = deltas[deltas.Count - 1];
            Assert.That(last, Is.InstanceOf<BackendError>());
            Assert.That(((BackendError)last).Retryable, Is.True);
            Assert.That(((BackendError)last).Message, Does.Contain("model runner crashed"));
            foreach (ChatDelta d in deltas) Assert.That(d, Is.Not.InstanceOf<TurnComplete>());
        }

        [Test]
        public async Task RequestBody_ApiChat_NoAuth_EnvelopeInstruction()
        {
            string body = LlmFixtures.Load("ollama_reveal.ndjson");
            var (backend, handler) = Make(StreamOf(body));
            await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default));

            Assert.That(handler.LastRequest.RequestUri.ToString(), Is.EqualTo(BaseUrl + "/api/chat"));
            Assert.That(handler.LastRequest.Headers.Authorization, Is.Null, "local Ollama uses no auth header");

            using JsonDocument doc = JsonDocument.Parse(handler.LastBody);
            JsonElement root = doc.RootElement;
            Assert.That(root.GetProperty("model").GetString(), Is.EqualTo(Model));
            Assert.That(root.GetProperty("stream").GetBoolean(), Is.True);
            JsonElement messages = root.GetProperty("messages");
            Assert.That(messages[0].GetProperty("role").GetString(), Is.EqualTo("system"));
            Assert.That(messages[0].GetProperty("content").GetString(), Does.Contain("```json"));
        }
    }
}
