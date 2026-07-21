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
    /// <summary>Where and as whom the <see cref="OllamaBackend"/> speaks. Ollama is a local server,
    /// so there is no key.</summary>
    public sealed record OllamaConfig(string BaseUrl, string Model);

    /// <summary>
    /// Adapter for a local Ollama server (LLM_CITIZENS.md §8 — the offline-capable live backend).
    /// POSTs <c>{base}/api/chat</c> with <c>stream:true</c> and reads the NDJSON response: one JSON
    /// object per line, each carrying a <c>message.content</c> token, until a final <c>done:true</c>
    /// line with <c>prompt_eval_count</c> / <c>eval_count</c> token totals. Like the OpenAI-compat
    /// adapter it has no native tools — the prompt carries the JSON-envelope instruction and effects
    /// are recovered from the accumulated reply by <see cref="EffectEnvelopeParser"/>, with the
    /// cleaned turn emitted at the end. A partial line split across chunks is buffered by
    /// <see cref="LineReader"/>. HTTP/transport/timeout faults classify as retryable
    /// <see cref="BackendError"/>.
    /// </summary>
    public sealed class OllamaBackend : IChatBackend
    {
        private const string BackendName = "ollama";
        private const int PerTurnEffectCap = 4;
        private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(120);

        private readonly HttpChat _http;
        private readonly OllamaConfig _config;
        private readonly TimeSpan _timeout;
        private readonly string _url;

        public OllamaBackend(HttpChat http, OllamaConfig config, TimeSpan? timeout = null)
        {
            _http = http ?? throw new ArgumentNullException(nameof(http));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _timeout = timeout ?? DefaultTimeout;
            _url = (config.BaseUrl ?? string.Empty).TrimEnd('/') + "/api/chat";
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

            HttpChatResponse resp = null;
            ChatDelta postError = null;
            try
            {
                resp = await _http.PostAsync(_url, body, headers, _timeout, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (TimeoutException) { postError = ProviderStream.Retryable("Ollama request timed out."); }
            catch (HttpRequestException e) { postError = ProviderStream.Retryable("Ollama network error: " + e.Message); }
            if (postError != null) { yield return postError; yield break; }

            using (resp)
            {
                if (!resp.IsSuccess)
                {
                    yield return await ProviderStream.HttpStatusErrorAsync(resp, "Ollama").ConfigureAwait(false);
                    yield break;
                }

                var reply = new StringBuilder();
                var acc = new UsageAcc { Model = _config.Model ?? string.Empty };
                var lines = new LineReader();
                bool done = false;
                ChatDelta midError = null;

                IAsyncEnumerator<string> chunks = resp.ReadChunksAsync(ct).GetAsyncEnumerator(ct);
                try
                {
                    while (!done && midError == null)
                    {
                        ProviderStream.ReadStep step = await ProviderStream.ReadNextAsync(chunks, "Ollama", ct).ConfigureAwait(false);
                        if (step.Error != null) { yield return step.Error; yield break; }
                        if (step.End) break;

                        foreach (string line in lines.Push(step.Chunk))
                        {
                            Consume(line, reply, acc, out bool isDone, out ChatDelta err);
                            if (err != null) { midError = err; break; }
                            if (isDone) { done = true; break; }
                        }
                    }
                    if (midError == null)
                        foreach (string line in lines.Flush())
                            Consume(line, reply, acc, out _, out _);
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

        // Handle one NDJSON line: an error object, a streamed token, or the final done record.
        private static void Consume(string line, StringBuilder reply, UsageAcc acc, out bool isDone, out ChatDelta error)
        {
            isDone = false;
            error = null;
            if (string.IsNullOrEmpty(line)) return;

            JsonDocument doc = ProviderJson.TryParse(line);
            if (doc == null) return;
            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return;

                string err = ProviderJson.GetString(root, "error");
                if (err != null)
                {
                    error = new BackendError("Ollama stream error: " + err, true);
                    return;
                }

                string model = ProviderJson.GetString(root, "model");
                if (!string.IsNullOrEmpty(model)) acc.Model = model;

                if (root.TryGetProperty("message", out JsonElement message) && message.ValueKind == JsonValueKind.Object)
                {
                    string content = ProviderJson.GetString(message, "content");
                    if (!string.IsNullOrEmpty(content)) reply.Append(content);
                }

                if (root.TryGetProperty("done", out JsonElement doneEl)
                    && (doneEl.ValueKind == JsonValueKind.True))
                {
                    isDone = true;
                    if (ProviderJson.TryGetInt(root, "prompt_eval_count", out int input)) acc.Input = input;
                    if (ProviderJson.TryGetInt(root, "eval_count", out int output)) acc.Output = output;
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
                w.WriteBoolean("stream", true);
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
