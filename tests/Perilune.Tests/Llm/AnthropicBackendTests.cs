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
    /// Package L3 — the Anthropic Messages API adapter over the injectable HTTP substrate. Every
    /// test replays a canned SSE fixture through <see cref="FakeHttpHandler"/>: no socket is ever
    /// opened, and the handler's call count proves it. Covers the exact delta sequence, chunk-split
    /// and CRLF torture, a truncated tool payload (dropped effect), a mid-stream overloaded error
    /// (retryable), usage/cache extraction, HTTP-status classification, cancellation disposing the
    /// response, the per-request timeout, and the request-body shape (cache_control placement, key
    /// only in the header).
    /// </summary>
    [TestFixture]
    public sealed class AnthropicBackendTests
    {
        private const string Key = "sk-test-SECRETKEY-abc";
        private const string BaseUrl = "https://fake.local";
        private const string Model = "claude-opus-4-8";

        private static ConversationRequest RevealRequest()
        {
            var req = new ConversationRequest
            {
                CitizenName = "Okafor",
                PersonaBlock = "Okafor, once a reactor tech. Clipped, stoic.",
                RelationshipSummary = "wary of you",
                Mood = 5f,
            };
            req.MemoryLines.Add("owes you for the O2 fix");
            req.CapabilitySummary.Add(new EffectOption(EffectKind.RevealInfo, 7u, "the cache in D-7"));
            return req;
        }

        private static (AnthropicBackend backend, FakeHttpHandler handler) Make(
            Func<HttpRequestMessage, HttpResponseMessage> responder, TimeSpan? timeout = null)
        {
            var handler = new FakeHttpHandler(responder);
            var http = new HttpChat(handler);
            var backend = new AnthropicBackend(http, new AnthropicConfig(BaseUrl, Key, Model), timeout);
            return (backend, handler);
        }

        private static Func<HttpRequestMessage, HttpResponseMessage> StreamOf(ChunkStream s)
            => _ => FakeHttpHandler.StreamingWith(s);

        private static async Task<List<ChatDelta>> Collect(
            System.Collections.Generic.IAsyncEnumerable<ChatDelta> stream)
        {
            var list = new List<ChatDelta>();
            await foreach (ChatDelta d in stream) list.Add(d);
            return list;
        }

        // ----------------------------------------------------------------------------
        // Golden delta sequence + usage extraction
        // ----------------------------------------------------------------------------

        [Test]
        public async Task Reveal_GoldenDeltaSequence_AndUsageWithCacheFields()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Whole(body));
            var (backend, handler) = Make(StreamOf(stream));

            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default));

            Assert.That(handler.CallCount, Is.EqualTo(1), "exactly one HTTP call, through the fake handler");
            Assert.That(deltas.Count, Is.EqualTo(4));
            Assert.That(deltas[0], Is.InstanceOf<TextDelta>());
            Assert.That(((TextDelta)deltas[0]).Text, Is.EqualTo("Maybe. "));
            Assert.That(((TextDelta)deltas[1]).Text, Is.EqualTo("There's a cache in D-7."));

            Assert.That(deltas[2], Is.InstanceOf<EffectProposed>());
            ProposedEffect eff = ((EffectProposed)deltas[2]).Effect;
            Assert.That(eff.Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(eff.TargetId, Is.EqualTo(7u), "target_index 0 resolved through the manifest to fact id 7");
            Assert.That(eff.Magnitude, Is.EqualTo(0f));

            Assert.That(deltas[3], Is.InstanceOf<TurnComplete>());
            TurnUsage u = ((TurnComplete)deltas[3]).Usage;
            Assert.That(u.InputTokens, Is.EqualTo(1200));
            Assert.That(u.OutputTokens, Is.EqualTo(42), "final output_tokens comes from message_delta");
            Assert.That(u.CacheReadTokens, Is.EqualTo(1024));
            Assert.That(u.CacheWriteTokens, Is.EqualTo(64));
            Assert.That(u.Model, Is.EqualTo(Model));
        }

        // ----------------------------------------------------------------------------
        // Chunk-split / CRLF torture: same result regardless of framing
        // ----------------------------------------------------------------------------

        private static (string text, List<ProposedEffect> effects, bool complete) Reduce(List<ChatDelta> deltas)
        {
            var sb = new StringBuilder();
            var effs = new List<ProposedEffect>();
            bool complete = false;
            foreach (ChatDelta d in deltas)
            {
                switch (d)
                {
                    case TextDelta t: sb.Append(t.Text); break;
                    case EffectProposed e: effs.Add(e.Effect); break;
                    case TurnComplete _: complete = true; break;
                }
            }
            return (sb.ToString(), effs, complete);
        }

        [Test]
        public async Task Reveal_PerByteChunks_ReproduceTheSameTurn()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Split(body, 1)); // one byte per read
            var (backend, _) = Make(StreamOf(stream));

            var (text, effects, complete) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(effects[0].Kind, Is.EqualTo(EffectKind.RevealInfo));
            Assert.That(effects[0].TargetId, Is.EqualTo(7u));
            Assert.That(complete, Is.True);
        }

        [Test]
        public async Task Reveal_CrlfLineEndings_SplitAcrossChunks_ReproduceTheSameTurn()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse").Replace("\n", "\r\n");
            var stream = new ChunkStream(LlmFixtures.Split(body, 1)); // splits every CR from its LF
            var (backend, _) = Make(StreamOf(stream));

            var (text, effects, complete) = Reduce(await Collect(backend.SendAsync(RevealRequest(), "x", default)));

            Assert.That(text, Is.EqualTo("Maybe. There's a cache in D-7."));
            Assert.That(effects.Count, Is.EqualTo(1));
            Assert.That(effects[0].TargetId, Is.EqualTo(7u));
            Assert.That(complete, Is.True);
        }

        // ----------------------------------------------------------------------------
        // Truncated tool JSON → dropped effect, turn still completes
        // ----------------------------------------------------------------------------

        [Test]
        public async Task TruncatedInputJson_DropsEffect_ButStillCompletes()
        {
            string body = LlmFixtures.Load("anthropic_truncated_tool.sse");
            var stream = new ChunkStream(LlmFixtures.Split(body, 7));
            var (backend, _) = Make(StreamOf(stream));

            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));
            var (text, effects, complete) = Reduce(deltas);

            Assert.That(text, Is.EqualTo("Hm. Let me think."));
            Assert.That(effects.Count, Is.EqualTo(0), "a malformed tool payload is dropped, never thrown");
            Assert.That(complete, Is.True, "the turn still reaches TurnComplete");
            foreach (ChatDelta d in deltas) Assert.That(d, Is.Not.InstanceOf<BackendError>());
        }

        // ----------------------------------------------------------------------------
        // overloaded_error mid-stream → retryable BackendError, no TurnComplete
        // ----------------------------------------------------------------------------

        [Test]
        public async Task OverloadedMidStream_YieldsRetryableError_AndNoTurnComplete()
        {
            string body = LlmFixtures.Load("anthropic_overloaded.sse");
            var stream = new ChunkStream(LlmFixtures.Whole(body));
            var (backend, _) = Make(StreamOf(stream));

            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            Assert.That(deltas[0], Is.InstanceOf<TextDelta>());
            ChatDelta last = deltas[deltas.Count - 1];
            Assert.That(last, Is.InstanceOf<BackendError>());
            Assert.That(((BackendError)last).Retryable, Is.True);
            Assert.That(((BackendError)last).Message, Does.Contain("overloaded_error"));
            foreach (ChatDelta d in deltas) Assert.That(d, Is.Not.InstanceOf<TurnComplete>(),
                "a faulted turn never emits TurnComplete, so nothing dispatches");
        }

        // ----------------------------------------------------------------------------
        // HTTP status classification
        // ----------------------------------------------------------------------------

        [TestCase(408, true)]
        [TestCase(429, true)]
        [TestCase(500, true)]
        [TestCase(529, true)]
        [TestCase(400, false)]
        [TestCase(401, false)]
        [TestCase(403, false)]
        public async Task HttpStatus_ClassifiedAsRetryableOrNot(int status, bool retryable)
        {
            var (backend, handler) = Make(_ => FakeHttpHandler.Status(status, "{\"error\":\"x\"}"));
            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            Assert.That(handler.CallCount, Is.EqualTo(1));
            Assert.That(deltas.Count, Is.EqualTo(1));
            Assert.That(deltas[0], Is.InstanceOf<BackendError>());
            Assert.That(((BackendError)deltas[0]).Retryable, Is.EqualTo(retryable));
        }

        [Test]
        public async Task Http429_HonorsRetryAfterAsMetadata()
        {
            var (backend, _) = Make(_ => FakeHttpHandler.Status(429, "{\"error\":\"rate\"}", retryAfter: "5"));
            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            var err = (BackendError)deltas[0];
            Assert.That(err.Retryable, Is.True);
            Assert.That(err.Message, Does.Contain("retry-after=5"));
        }

        // ----------------------------------------------------------------------------
        // Cancellation mid-stream: throws + disposes the response
        // ----------------------------------------------------------------------------

        [Test]
        public void Cancellation_MidStream_ThrowsAndDisposesResponse()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Split(body, 1));
            var (backend, handler) = Make(StreamOf(stream));

            using var cts = new CancellationTokenSource();

            Assert.That(async () =>
            {
                System.Collections.Generic.IAsyncEnumerator<ChatDelta> en =
                    backend.SendAsync(RevealRequest(), "x", cts.Token).GetAsyncEnumerator(cts.Token);
                try
                {
                    bool got = await en.MoveNextAsync();
                    Assert.That(got, Is.True);
                    Assert.That(en.Current, Is.InstanceOf<TextDelta>(), "streamed some text first");
                    cts.Cancel();
                    while (await en.MoveNextAsync()) { }
                }
                finally
                {
                    await en.DisposeAsync();
                }
            }, Throws.InstanceOf<OperationCanceledException>());

            Assert.That(stream.Disposed, Is.True, "cancelling mid-stream disposed the response stream");
            Assert.That(handler.CallCount, Is.EqualTo(1));
        }

        // ----------------------------------------------------------------------------
        // Per-request timeout → retryable BackendError (no wall-clock waiting on a socket)
        // ----------------------------------------------------------------------------

        [Test]
        public async Task Timeout_MidStream_YieldsRetryableError()
        {
            var hang = new HangingStream();
            var (backend, _) = Make(
                _ => new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StreamContent(hang) },
                timeout: TimeSpan.FromMilliseconds(80));

            List<ChatDelta> deltas = await Collect(backend.SendAsync(RevealRequest(), "x", default));

            Assert.That(deltas.Count, Is.EqualTo(1));
            Assert.That(deltas[0], Is.InstanceOf<BackendError>());
            Assert.That(((BackendError)deltas[0]).Retryable, Is.True);
            Assert.That(((BackendError)deltas[0]).Message, Does.Contain("timed out"));
        }

        // ----------------------------------------------------------------------------
        // Request body: cache_control placement, tools, messages — and key ONLY in header
        // ----------------------------------------------------------------------------

        [Test]
        public async Task RequestBody_ShapeAndCacheControl_KeyOnlyInHeader()
        {
            string sse = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Whole(sse));
            var (backend, handler) = Make(StreamOf(stream));

            await Collect(backend.SendAsync(RevealRequest(), "any secrets?", default));

            // The key rides ONLY the x-api-key header — never the body.
            Assert.That(handler.LastRequest.Headers.TryGetValues("x-api-key", out System.Collections.Generic.IEnumerable<string> keyVals), Is.True);
            string sentKey = null; foreach (string v in keyVals) sentKey = v;
            Assert.That(sentKey, Is.EqualTo(Key));
            Assert.That(handler.LastRequest.Headers.TryGetValues("anthropic-version", out System.Collections.Generic.IEnumerable<string> verVals), Is.True);
            string ver = null; foreach (string v in verVals) ver = v;
            Assert.That(ver, Is.EqualTo("2023-06-01"));

            Assert.That(handler.LastBody, Does.Not.Contain("SECRETKEY"), "the api key never appears in the request body");
            Assert.That(handler.LastRequest.RequestUri.ToString(), Is.EqualTo(BaseUrl + "/v1/messages"));

            using JsonDocument doc = JsonDocument.Parse(handler.LastBody);
            JsonElement root = doc.RootElement;

            Assert.That(root.GetProperty("model").GetString(), Is.EqualTo(Model));
            Assert.That(root.GetProperty("stream").GetBoolean(), Is.True);
            Assert.That(root.TryGetProperty("api_key", out _), Is.False);
            Assert.That(root.TryGetProperty("x-api-key", out _), Is.False);

            // tools = [ strict propose_effect ]
            JsonElement tools = root.GetProperty("tools");
            Assert.That(tools.GetArrayLength(), Is.EqualTo(1));
            JsonElement tool = tools[0];
            Assert.That(tool.GetProperty("name").GetString(), Is.EqualTo("propose_effect"));
            Assert.That(tool.GetProperty("strict").GetBoolean(), Is.True);
            Assert.That(tool.GetProperty("input_schema").GetProperty("additionalProperties").GetBoolean(), Is.False);

            // system = two cache-annotated blocks (global + persona), NO tool_schema
            JsonElement system = root.GetProperty("system");
            Assert.That(system.GetArrayLength(), Is.EqualTo(2), "global_system + persona_system");
            foreach (JsonElement blk in system.EnumerateArray())
            {
                Assert.That(blk.GetProperty("type").GetString(), Is.EqualTo("text"));
                Assert.That(blk.GetProperty("cache_control").GetProperty("type").GetString(), Is.EqualTo("ephemeral"),
                    "each system block carries an ephemeral cache breakpoint");
            }

            // messages = context + latest utterance, all user role here (no transcript)
            JsonElement messages = root.GetProperty("messages");
            Assert.That(messages.GetArrayLength(), Is.EqualTo(2));
            foreach (JsonElement m in messages.EnumerateArray())
                Assert.That(m.GetProperty("role").GetString(), Is.EqualTo("user"));
            Assert.That(messages[messages.GetArrayLength() - 1].GetProperty("content").GetString(),
                Does.Contain("any secrets?"), "the latest utterance is the final message");
        }

        // ----------------------------------------------------------------------------
        // Second turn: the transcript rides the request body (the playtest
        // "no conversation memory" defect — the adapter must send the history)
        // ----------------------------------------------------------------------------

        [Test]
        public async Task RequestBody_SecondTurn_CarriesTranscript_AssistantAndQuarantinedUser_BeforeLatest()
        {
            string sse = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Whole(sse));
            var (backend, handler) = Make(StreamOf(stream));

            ConversationRequest req = RevealRequest();
            req.Transcript.Add(new TranscriptLine(ChatSession.PlayerSpeaker, "do you have any secrets?"));
            req.Transcript.Add(new TranscriptLine("Okafor", "Maybe. Earn it."));

            await Collect(backend.SendAsync(req, "I fixed your O2 line, remember?", default));

            using JsonDocument doc = JsonDocument.Parse(handler.LastBody);
            JsonElement messages = doc.RootElement.GetProperty("messages");

            // context + prior player + prior citizen + latest utterance.
            Assert.That(messages.GetArrayLength(), Is.EqualTo(4));

            JsonElement priorPlayer = messages[1];
            Assert.That(priorPlayer.GetProperty("role").GetString(), Is.EqualTo("user"));
            Assert.That(priorPlayer.GetProperty("content").GetString(),
                Does.Contain("<player_speech>do you have any secrets?</player_speech>"),
                "the prior player line arrives quarantined");

            JsonElement priorCitizen = messages[2];
            Assert.That(priorCitizen.GetProperty("role").GetString(), Is.EqualTo("assistant"),
                "the prior citizen line arrives as an assistant message");
            Assert.That(priorCitizen.GetProperty("content").GetString(), Does.Contain("Maybe. Earn it."));

            JsonElement latest = messages[3];
            Assert.That(latest.GetProperty("role").GetString(), Is.EqualTo("user"));
            Assert.That(latest.GetProperty("content").GetString(),
                Does.Contain("<player_speech>I fixed your O2 line, remember?</player_speech>"),
                "the latest utterance is the FINAL message, after the history");

            // The cacheable prefix did not shift: still exactly two cache-annotated system blocks.
            JsonElement system = doc.RootElement.GetProperty("system");
            Assert.That(system.GetArrayLength(), Is.EqualTo(2));
        }

        // ----------------------------------------------------------------------------
        // Whitelist: an out-of-manifest target_index drops the effect
        // ----------------------------------------------------------------------------

        [Test]
        public async Task ToolTargetIndex_OutOfManifest_DropsEffect()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse");
            var stream = new ChunkStream(LlmFixtures.Whole(body));
            var (backend, _) = Make(StreamOf(stream));

            // Empty capability summary: target_index 0 has nothing to resolve to.
            var req = new ConversationRequest { CitizenName = "Okafor" };
            var (_, effects, complete) = Reduce(await Collect(backend.SendAsync(req, "x", default)));

            Assert.That(effects.Count, Is.EqualTo(0), "no listed target ⇒ the whitelist rejects the effect");
            Assert.That(complete, Is.True);
        }

        [Test]
        public async Task ToolKind_MismatchesListedTarget_DropsEffect()
        {
            string body = LlmFixtures.Load("anthropic_reveal.sse"); // tool says RevealInfo, index 0
            var stream = new ChunkStream(LlmFixtures.Whole(body));
            var (backend, _) = Make(StreamOf(stream));

            // Index 0 is a SetDisposition target, but the tool call names RevealInfo → mismatch.
            var req = new ConversationRequest { CitizenName = "Okafor" };
            req.CapabilitySummary.Add(new EffectOption(EffectKind.SetDisposition, 0u, "your standing"));
            var (_, effects, _) = Reduce(await Collect(backend.SendAsync(req, "x", default)));

            Assert.That(effects.Count, Is.EqualTo(0), "kind must match the listed target's kind");
        }
    }
}
