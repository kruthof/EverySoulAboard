using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Llm.Providers
{
    /// <summary>Where and as whom the <see cref="OpenAiCompatBackend"/> speaks. Key redacted from
    /// <see cref="ToString"/>.</summary>
    public sealed record OpenAiCompatConfig(string BaseUrl, string ApiKey, string Model)
    {
        public override string ToString() => "OpenAiCompatConfig { BaseUrl = " + BaseUrl + ", Model = " + Model + " }";
    }

    /// <summary>
    /// Adapter for any OpenAI-compatible chat-completions endpoint (LLM_CITIZENS.md §8, §11). POSTs
    /// <c>{base}/v1/chat/completions</c> with <c>stream:true</c> and <c>stream_options.include_usage</c>,
    /// authenticated with a bearer token. It has NO native tool-calling
    /// (<see cref="BackendCapabilities.SupportsTools"/> is false): the prompt carries the JSON-envelope
    /// instruction, and effects are recovered from the accumulated reply by
    /// <see cref="EffectEnvelopeParser"/>. Because the effect block sits at the tail of the reply, the
    /// full text is accumulated over the SSE stream and the cleaned turn is emitted at the end —
    /// visible text, then whitelisted effects (capped), then a <see cref="TurnComplete"/> carrying the
    /// server usage (zero when the stream omits it). HTTP/transport/timeout faults classify exactly as
    /// the Anthropic adapter.
    /// </summary>
    public sealed class OpenAiCompatBackend : IChatBackend
    {
        private const string BackendName = "openai-compat";
        private const int MaxTokensRequest = 1024;
        private const int PerTurnEffectCap = 4;
        private const string Done = "[DONE]";
        private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

        private readonly HttpChat _http;
        private readonly OpenAiCompatConfig _config;
        private readonly TimeSpan _timeout;
        private readonly string _url;

        public OpenAiCompatBackend(HttpChat http, OpenAiCompatConfig config, TimeSpan? timeout = null)
        {
            _http = http ?? throw new ArgumentNullException(nameof(http));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _timeout = timeout ?? DefaultTimeout;
            _url = (config.BaseUrl ?? string.Empty).TrimEnd('/') + "/v1/chat/completions";
        }

        public BackendCapabilities Caps =>
            new BackendCapabilities(BackendName, supportsStreaming: true, supportsTools: false, maxEffects: PerTurnEffectCap);

        public ChatResult Respond(ConversationRequest request, string playerUtterance)
            => RespondAsync(request, playerUtterance).GetAwaiter().GetResult();

        private async Task<ChatResult> RespondAsync(ConversationRequest request, string playerUtterance)
        {
            var text = new StringBuilder();
            var effects = new List<ProposedEffect>();
            await foreach (ChatDelta d in SendAsync(request, playerUtterance, CancellationToken.None).ConfigureAwait(false))
            {
                switch (d)
                {
                    case TextDelta t: text.Append(t.Text); break;
                    case EffectProposed e: if (e.Effect != null) effects.Add(e.Effect); break;
                }
            }
            return new ChatResult(text.ToString(), effects);
        }

        public async IAsyncEnumerable<ChatDelta> SendAsync(
            ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
        {
            string body = BuildRequestBody(req, utterance);
            var headers = new List<HttpHeader>();
            if (!string.IsNullOrEmpty(_config.ApiKey))
                headers.Add(new HttpHeader("Authorization", "Bearer " + _config.ApiKey));

            HttpChatResponse resp = null;
            ChatDelta postError = null;
            try
            {
                resp = await _http.PostAsync(_url, body, headers, _timeout, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (TimeoutException) { postError = ProviderStream.Retryable("OpenAI-compat request timed out."); }
            catch (HttpRequestException e) { postError = ProviderStream.Retryable("OpenAI-compat network error: " + e.Message); }
            if (postError != null) { yield return postError; yield break; }

            using (resp)
            {
                if (!resp.IsSuccess)
                {
                    yield return await ProviderStream.HttpStatusErrorAsync(resp, "OpenAI-compat").ConfigureAwait(false);
                    yield break;
                }

                var reply = new StringBuilder();
                var acc = new UsageAcc { Model = _config.Model ?? string.Empty };
                var sse = new SseReader();
                bool done = false;
                ChatDelta midError = null;

                IAsyncEnumerator<string> chunks = resp.ReadChunksAsync(ct).GetAsyncEnumerator(ct);
                try
                {
                    while (!done && midError == null)
                    {
                        ProviderStream.ReadStep step = await ProviderStream.ReadNextAsync(chunks, "OpenAI-compat", ct).ConfigureAwait(false);
                        if (step.Error != null) { yield return step.Error; yield break; }
                        if (step.End) break;

                        foreach (SseEvent ev in sse.Push(step.Chunk))
                        {
                            Consume(ev.Data, reply, acc, out bool isDone, out ChatDelta err);
                            if (err != null) { midError = err; break; }
                            if (isDone) { done = true; break; }
                        }
                    }
                    if (midError == null)
                        foreach (SseEvent ev in sse.Flush())
                            Consume(ev.Data, reply, acc, out _, out _);
                }
                finally
                {
                    await chunks.DisposeAsync().ConfigureAwait(false);
                }

                if (midError != null) { yield return midError; yield break; }

                EnvelopeResult env = EffectEnvelopeParser.Parse(reply.ToString(), req, Caps.MaxEffects);
                yield return new TextDelta(env.VisibleText);
                for (int i = 0; i < env.Effects.Count; i++) yield return new EffectProposed(env.Effects[i]);
                yield return new TurnComplete(acc.ToTurnUsage(BackendName));
            }
        }

        // Handle one SSE data payload: [DONE] terminator, an error object, or a streamed chunk.
        private static void Consume(string data, StringBuilder reply, UsageAcc acc, out bool isDone, out ChatDelta error)
        {
            isDone = false;
            error = null;
            if (string.IsNullOrEmpty(data)) return;
            if (data == Done) { isDone = true; return; }

            JsonDocument doc = ProviderJson.TryParse(data);
            if (doc == null) return;
            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return;

                if (root.TryGetProperty("error", out JsonElement errEl) && errEl.ValueKind != JsonValueKind.Null)
                {
                    string t = ProviderJson.GetString(errEl, "type");
                    string m = ProviderJson.GetString(errEl, "message");
                    error = new BackendError("OpenAI-compat stream error"
                        + (t != null ? " (" + t + ")" : string.Empty)
                        + (m != null ? ": " + m : string.Empty), true);
                    return;
                }

                string model = ProviderJson.GetString(root, "model");
                if (!string.IsNullOrEmpty(model)) acc.Model = model;

                if (root.TryGetProperty("choices", out JsonElement choices) && choices.ValueKind == JsonValueKind.Array)
                {
                    foreach (JsonElement choice in choices.EnumerateArray())
                    {
                        if (choice.TryGetProperty("delta", out JsonElement delta) && delta.ValueKind == JsonValueKind.Object)
                        {
                            string content = ProviderJson.GetString(delta, "content");
                            if (!string.IsNullOrEmpty(content)) reply.Append(content);
                        }
                    }
                }

                if (root.TryGetProperty("usage", out JsonElement usage) && usage.ValueKind == JsonValueKind.Object)
                {
                    if (ProviderJson.TryGetInt(usage, "prompt_tokens", out int input)) acc.Input = input;
                    if (ProviderJson.TryGetInt(usage, "completion_tokens", out int output)) acc.Output = output;
                }
            }
        }

        internal string BuildRequestBody(ConversationRequest req, string utterance)
        {
            List<ChatMessage> messages = ProviderPrompt.BuildMessages(req, utterance);
            using var stream = new MemoryStream();
            using (var w = new Utf8JsonWriter(stream))
            {
                w.WriteStartObject();
                w.WriteString("model", _config.Model ?? string.Empty);
                w.WriteNumber("max_tokens", MaxTokensRequest);
                w.WriteBoolean("stream", true);
                w.WritePropertyName("stream_options");
                w.WriteStartObject();
                w.WriteBoolean("include_usage", true);
                w.WriteEndObject();
                w.WritePropertyName("messages");
                w.WriteStartArray();
                foreach (ChatMessage m in messages)
                {
                    w.WriteStartObject();
                    w.WriteString("role", m.Role);
                    w.WriteString("content", m.Content);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(stream.ToArray());
        }

        private sealed class UsageAcc
        {
            public int Input;
            public int Output;
            public string Model = string.Empty;
            public TurnUsage ToTurnUsage(string fallback)
                => new TurnUsage(Input, Output, 0, 0, string.IsNullOrEmpty(Model) ? fallback : Model);
        }
    }
}
