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
    /// Package L4 — the OpenAI-compatible chat-completions adapter. Replays canned SSE through the
    /// fake handler (zero network): the golden turn (visible text cleaned of the effect envelope,
    /// effect resolved, usage), per-byte chunk torture, [DONE] handling with usage absent, a
    /// mid-stream error object, HTTP-status classification, and the request body (bearer auth, key
    /// only in the header, no tools array, stream_options.include_usage, envelope instruction).
    /// </summary>
    [TestFixture]
    public sealed class OpenAiCompatBackendTests
    {
        private const string Key = "sk-oai-SECRETKEY-xyz";
        private const string BaseUrl = "https://oai.fake";
        private const string Model = "gpt-4o-mini";

        private static ConversationRequest RevealRequest()
        {
            var req = new ConversationRequest { CitizenName = "Okafor", PersonaBlock = "clipped, stoic", RelationshipSummary = "wary" };
            req.CapabilitySummary.Add(new EffectOption(EffectKind.RevealInfo, 7u, "the cache in D-7"));
            return req;
        }

        private static (OpenAiCompatBackend backend, FakeHttpHandler handler) Make(
            Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            var handler = new FakeHttpHandler(responder);
            var backend = new OpenAiCompatBackend(new HttpChat(handler), new OpenAiCompatConfig(BaseUrl, Key, Model));
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
        public async Task Reveal_CleanText_ResolvedEffect_AndUsage()
        {
            string sse = LlmFixtures.Load("openai_reveal.sse");
            var (backend, handler) = Make(StreamOf(sse));

            var (text, effects, usage, errored) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default)));

            Assert.That(handler.CallCount, Is.EqualTo(1));
            Assert.That(errored, Is.False);
            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."), "the ```json envelope is stripped from the visible text");
            Assert.That(text, Does.Not.Contain("```"));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(effects[0].TargetId, Is.EqualTo(7u));
            Assert.That(usage, Is.Not.Null);
            Assert.That(usage.InputTokens, Is.EqualTo(1500));
            Assert.That(usage.OutputTokens, Is.EqualTo(40));
            Assert.That(usage.CacheReadTokens, Is.EqualTo(0));
        }

        [Test]
        public async Task Reveal_PerByteChunks_ReproduceTheSameTurn()
        {
            string sse = LlmFixtures.Load("openai_reveal.sse");
            var (backend, _) = Make(StreamOf(sse, chunk: 1));
            var (text, effects, usage, _) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(effects[0].TargetId, Is.EqualTo(7u));
            Assert.That(usage.OutputTokens, Is.EqualTo(40));
        }

        [Test]
        public async Task DoneWithoutUsageChunk_ZeroUsage_StillCompletes()
        {
            string sse =
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hey.\"}}]}\n\n" +
                "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n" +
                "data: [DONE]\n\n";
            var (backend, _) = Make(StreamOf(sse));
            var (text, effects, usage, errored) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(errored, Is.False);
            Assert.That(text, Is.EqualTo("Hey."));
            Assert.That(effects.Count, Is.EqualTo(0));
            Assert.That(usage, Is.Not.Null, "TurnComplete still emitted");
            Assert.That(usage.InputTokens, Is.EqualTo(0));
            Assert.That(usage.OutputTokens, Is.EqualTo(0), "usage-absent stream reports zero, not a failure");
        }

        [Test]
        public async Task MidStreamErrorObject_YieldsRetryableError_NoComplete()
        {
            string sse =
                "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n" +
                "data: {\"error\":{\"type\":\"server_error\",\"message\":\"boom\"}}\n\n";
            var (backend, _) = Make(StreamOf(sse));
            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            ChatDelta last = deltas[deltas.Count - 1];
            Assert.That(last, Is.InstanceOf<BackendError>());
            Assert.That(((BackendError)last).Retryable, Is.True);
            foreach (ChatDelta d in deltas) Assert.That(d, Is.Not.InstanceOf<TurnComplete>());
        }

        [TestCase(429, true)]
        [TestCase(500, true)]
        [TestCase(401, false)]
        public async Task HttpStatus_Classified(int status, bool retryable)
        {
            var (backend, _) = Make(_ => FakeHttpHandler.Status(status, "{\"error\":\"x\"}"));
            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));
            Assert.That(deltas.Count, Is.EqualTo(1));
            Assert.That(((BackendError)deltas[0]).Retryable, Is.EqualTo(retryable));
        }

        [Test]
        public async Task RequestBody_BearerAuth_NoTools_EnvelopeInstruction_KeyOnlyInHeader()
        {
            string sse = LlmFixtures.Load("openai_reveal.sse");
            var (backend, handler) = Make(StreamOf(sse));
            await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default));

            Assert.That(handler.LastRequest.RequestUri.ToString(), Is.EqualTo(BaseUrl + "/v1/chat/completions"));
            Assert.That(handler.LastRequest.Headers.Authorization, Is.Not.Null);
            Assert.That(handler.LastRequest.Headers.Authorization.Scheme, Is.EqualTo("Bearer"));
            Assert.That(handler.LastRequest.Headers.Authorization.Parameter, Is.EqualTo(Key));
            Assert.That(handler.LastBody, Does.Not.Contain("SECRETKEY"), "key never appears in the body");

            using JsonDocument doc = JsonDocument.Parse(handler.LastBody);
            JsonElement root = doc.RootElement;
            Assert.That(root.GetProperty("model").GetString(), Is.EqualTo(Model));
            Assert.That(root.GetProperty("stream").GetBoolean(), Is.True);
            Assert.That(root.GetProperty("stream_options").GetProperty("include_usage").GetBoolean(), Is.True);
            Assert.That(root.TryGetProperty("tools", out _), Is.False, "no native tools for the envelope backend");

            JsonElement messages = root.GetProperty("messages");
            Assert.That(messages[0].GetProperty("role").GetString(), Is.EqualTo("system"));
            Assert.That(messages[0].GetProperty("content").GetString(), Does.Contain("```json"),
                "the system message carries the JSON-envelope instruction");
            Assert.That(messages[messages.GetArrayLength() - 1].GetProperty("content").GetString(),
                Does.Contain("any secrets?"));
        }

        [Test]
        public async Task RequestBody_SecondTurn_CarriesTranscript_AssistantAndQuarantinedUser_BeforeLatest()
        {
            string sse = LlmFixtures.Load("openai_reveal.sse");
            var (backend, handler) = Make(StreamOf(sse));

            ConversationRequest req = RevealRequest();
            req.Transcript.Add(new TranscriptLine(ChatSession.PlayerSpeaker, "do you have any secrets?"));
            req.Transcript.Add(new TranscriptLine("Okafor", "Maybe. Earn it."));

            await Collect(backend.SendAsync(req, "I fixed your O2 line, remember?", default));

            using JsonDocument doc = JsonDocument.Parse(handler.LastBody);
            JsonElement messages = doc.RootElement.GetProperty("messages");

            // system + context + prior player + prior citizen + latest utterance.
            Assert.That(messages.GetArrayLength(), Is.EqualTo(5));
            Assert.That(messages[0].GetProperty("role").GetString(), Is.EqualTo("system"));

            Assert.That(messages[2].GetProperty("role").GetString(), Is.EqualTo("user"));
            Assert.That(messages[2].GetProperty("content").GetString(),
                Does.Contain("<player_speech>do you have any secrets?</player_speech>"),
                "the prior player line arrives quarantined");

            Assert.That(messages[3].GetProperty("role").GetString(), Is.EqualTo("assistant"),
                "the prior citizen line arrives as an assistant message");
            Assert.That(messages[3].GetProperty("content").GetString(), Does.Contain("Maybe. Earn it."));

            Assert.That(messages[4].GetProperty("role").GetString(), Is.EqualTo("user"));
            Assert.That(messages[4].GetProperty("content").GetString(),
                Does.Contain("<player_speech>I fixed your O2 line, remember?</player_speech>"),
                "the latest utterance is the FINAL message, after the history");
        }
    }
}
