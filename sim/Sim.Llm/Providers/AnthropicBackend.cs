using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Llm.Providers
{
    /// <summary>
    /// Where and as whom the <see cref="AnthropicBackend"/> speaks. Host-owned config
    /// (LLM_CITIZENS.md §11) — the base URL is injectable so tests point it at a fake handler,
    /// never at the network. The key lives here only to be copied into the request header; it is
    /// redacted from <see cref="ToString"/> so a logged config never leaks it.
    /// </summary>
    public sealed record AnthropicConfig(string BaseUrl, string ApiKey, string Model)
    {
        public override string ToString() => "AnthropicConfig { BaseUrl = " + BaseUrl + ", Model = " + Model + " }";
    }

    /// <summary>
    /// The Anthropic Messages API adapter (LLM_CITIZENS.md §8, §11): POST <c>/v1/messages</c> with
    /// <c>stream:true</c>, render the pure <see cref="PromptBuilder"/> layout into the Messages
    /// shape (a strict <c>propose_effect</c> tool, two cache-annotated system blocks, the context
    /// and player turns as messages), and translate the SSE event stream back into the engine's
    /// <see cref="ChatDelta"/> spine.
    ///
    /// SAFETY. The api key rides ONLY the <c>x-api-key</c> header — never the request body. Player
    /// text is quarantined by the prompt builder before it ever reaches the wire. A malformed tool
    /// payload is dropped, never thrown; effects are dispatched by the runtime only after a
    /// <see cref="TurnComplete"/> is observed, so a truncated or faulted stream mutates nothing.
    ///
    /// ERRORS. 408 / 429 / 5xx, network faults, timeouts, and a mid-stream <c>overloaded_error</c>
    /// surface as <see cref="BackendError"/> with <c>Retryable = true</c> (honouring
    /// <c>Retry-After</c> as message metadata); other 4xx are non-retryable. Caller cancellation
    /// propagates as <see cref="OperationCanceledException"/> and disposes the response.
    /// </summary>
    public sealed class AnthropicBackend : IChatBackend
    {
        private const string BackendName = "anthropic";
        private const string AnthropicVersion = "2023-06-01";
        private const int MaxTokens = 1024;
        private const int PerTurnEffectCap = 4;

        private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

        private readonly HttpChat _http;
        private readonly AnthropicConfig _config;
        private readonly TimeSpan _timeout;
        private readonly string _url;

        public AnthropicBackend(HttpChat http, AnthropicConfig config, TimeSpan? timeout = null)
        {
            _http = http ?? throw new ArgumentNullException(nameof(http));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _timeout = timeout ?? DefaultTimeout;
            string baseUrl = (config.BaseUrl ?? string.Empty).TrimEnd('/');
            _url = baseUrl + "/v1/messages";
        }

        public BackendCapabilities Caps =>
            new BackendCapabilities(BackendName, supportsStreaming: true, supportsTools: true, maxEffects: PerTurnEffectCap);

        /// <inheritdoc/>
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

        /// <inheritdoc/>
        public async IAsyncEnumerable<ChatDelta> SendAsync(
            ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
        {
            string body = BuildRequestBody(req, utterance);
            var headers = new List<HttpHeader>
            {
                new HttpHeader("x-api-key", _config.ApiKey ?? string.Empty),
                new HttpHeader("anthropic-version", AnthropicVersion),
            };

            // ---- POST ----------------------------------------------------------------
            HttpChatResponse resp = null;
            ChatDelta postError = null;
            try
            {
                resp = await _http.PostAsync(_url, body, headers, _timeout, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (TimeoutException)
            {
                postError = Retryable("Anthropic request timed out.", null);
            }
            catch (HttpRequestException e)
            {
                postError = Retryable("Anthropic network error: " + e.Message, null);
            }
            if (postError != null)
            {
                yield return postError;
                yield break;
            }

            using (resp)
            {
                // ---- HTTP status errors ---------------------------------------------
                if (!resp.IsSuccess)
                {
                    string retryAfter = resp.RetryAfter;
                    string bodyText = await resp.ReadBodyTextAsync().ConfigureAwait(false);
                    bool retry = resp.StatusCode == 408 || resp.StatusCode == 429 || resp.StatusCode >= 500;
                    string msg = "Anthropic HTTP " + resp.StatusCode.ToString(CultureInfo.InvariantCulture)
                        + (retryAfter != null ? " (retry-after=" + retryAfter + ")" : string.Empty)
                        + (string.IsNullOrEmpty(bodyText) ? string.Empty : ": " + Truncate(bodyText, 300));
                    yield return new BackendError(msg, retry);
                    yield break;
                }

                // ---- Stream the SSE body --------------------------------------------
                var state = new StreamState { Model = _config.Model ?? string.Empty };
                var sse = new SseReader();
                bool terminated = false;

                IAsyncEnumerator<string> chunks = resp.ReadChunksAsync(ct).GetAsyncEnumerator(ct);
                try
                {
                    while (!terminated)
                    {
                        ReadStep step = await ReadNextAsync(chunks, ct).ConfigureAwait(false);
                        if (step.Error != null)
                        {
                            yield return step.Error;
                            yield break;
                        }
                        if (step.End) break;

                        foreach (SseEvent ev in sse.Push(step.Chunk))
                        {
                            List<ChatDelta> produced = HandleEvent(ev, state, req);
                            for (int i = 0; i < produced.Count; i++)
                            {
                                ChatDelta d = produced[i];
                                yield return d;
                                if (d is TurnComplete || d is BackendError) { terminated = true; break; }
                            }
                            if (terminated) break;
                        }
                    }

                    if (!terminated)
                    {
                        foreach (SseEvent ev in sse.Flush())
                        {
                            List<ChatDelta> produced = HandleEvent(ev, state, req);
                            for (int i = 0; i < produced.Count; i++)
                            {
                                ChatDelta d = produced[i];
                                yield return d;
                                if (d is TurnComplete || d is BackendError) { terminated = true; break; }
                            }
                            if (terminated) break;
                        }
                    }
                }
                finally
                {
                    await chunks.DisposeAsync().ConfigureAwait(false);
                }

                // The body ended without a message_stop: a truncated response. Never emit a
                // TurnComplete for it (nothing dispatches), but close the turn with a retryable
                // error so the dispatcher can try again.
                if (!terminated)
                    yield return Retryable("Anthropic stream ended before completion.", null);
            }
        }

        // ------------------------------------------------------------------
        // Reading (isolates the try/catch so the iterator can yield freely)
        // ------------------------------------------------------------------

        private static async Task<ReadStep> ReadNextAsync(IAsyncEnumerator<string> chunks, CancellationToken ct)
        {
            try
            {
                bool moved = await chunks.MoveNextAsync().ConfigureAwait(false);
                return moved ? ReadStep.OfChunk(chunks.Current) : ReadStep.OfEnd();
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (TimeoutException)
            {
                return ReadStep.OfError(Retryable("Anthropic stream timed out.", null));
            }
            catch (HttpRequestException e)
            {
                return ReadStep.OfError(Retryable("Anthropic stream error: " + e.Message, null));
            }
            catch (IOException e)
            {
                return ReadStep.OfError(Retryable("Anthropic stream io error: " + e.Message, null));
            }
        }

        private readonly struct ReadStep
        {
            public string Chunk { get; }
            public bool End { get; }
            public ChatDelta Error { get; }
            private ReadStep(string chunk, bool end, ChatDelta error) { Chunk = chunk; End = end; Error = error; }
            public static ReadStep OfChunk(string c) => new ReadStep(c, false, null);
            public static ReadStep OfEnd() => new ReadStep(null, true, null);
            public static ReadStep OfError(ChatDelta e) => new ReadStep(null, false, e);
        }

        private static BackendError Retryable(string message, string retryAfter)
            => new BackendError(retryAfter == null ? message : message + " (retry-after=" + retryAfter + ")", true);

        // ------------------------------------------------------------------
        // SSE event → ChatDelta translation
        // ------------------------------------------------------------------

        private sealed class ToolBlock
        {
            public readonly StringBuilder Json = new StringBuilder();
        }

        private sealed class StreamState
        {
            public readonly Dictionary<int, ToolBlock> Tools = new Dictionary<int, ToolBlock>();
            public int InputTokens;
            public int OutputTokens;
            public int CacheReadTokens;
            public int CacheWriteTokens;
            public string Model = string.Empty;
        }

        private List<ChatDelta> HandleEvent(SseEvent ev, StreamState st, ConversationRequest req)
        {
            var outp = new List<ChatDelta>();
            if (string.IsNullOrEmpty(ev.Data)) return outp;

            JsonDocument doc = TryParse(ev.Data);
            if (doc == null) return outp;
            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return outp;

                switch (GetString(root, "type"))
                {
                    case "message_start":
                        if (root.TryGetProperty("message", out JsonElement message)
                            && message.ValueKind == JsonValueKind.Object)
                        {
                            string m = GetString(message, "model");
                            if (!string.IsNullOrEmpty(m)) st.Model = m;
                            ReadUsage(message, st, isStart: true);
                        }
                        break;

                    case "content_block_start":
                        if (TryGetInt(root, "index", out int startIndex)
                            && root.TryGetProperty("content_block", out JsonElement cb)
                            && cb.ValueKind == JsonValueKind.Object
                            && GetString(cb, "type") == "tool_use")
                        {
                            st.Tools[startIndex] = new ToolBlock();
                        }
                        break;

                    case "content_block_delta":
                        if (TryGetInt(root, "index", out int deltaIndex)
                            && root.TryGetProperty("delta", out JsonElement delta)
                            && delta.ValueKind == JsonValueKind.Object)
                        {
                            string dt = GetString(delta, "type");
                            if (dt == "text_delta")
                            {
                                string text = GetString(delta, "text");
                                if (!string.IsNullOrEmpty(text)) outp.Add(new TextDelta(text));
                            }
                            else if (dt == "input_json_delta"
                                     && st.Tools.TryGetValue(deltaIndex, out ToolBlock tb))
                            {
                                string partial = GetString(delta, "partial_json");
                                if (partial != null) tb.Json.Append(partial);
                            }
                        }
                        break;

                    case "content_block_stop":
                        if (TryGetInt(root, "index", out int stopIndex)
                            && st.Tools.TryGetValue(stopIndex, out ToolBlock closing))
                        {
                            st.Tools.Remove(stopIndex);
                            if (TryResolveEffect(closing.Json.ToString(), req, out ProposedEffect eff))
                                outp.Add(new EffectProposed(eff));
                        }
                        break;

                    case "message_delta":
                        ReadUsage(root, st, isStart: false);
                        break;

                    case "message_stop":
                        outp.Add(new TurnComplete(new TurnUsage(
                            st.InputTokens, st.OutputTokens, st.CacheReadTokens, st.CacheWriteTokens,
                            string.IsNullOrEmpty(st.Model) ? BackendName : st.Model)));
                        break;

                    case "error":
                        outp.Add(BuildErrorEvent(root));
                        break;

                    // ping and any unknown event type: ignore.
                }
            }
            return outp;
        }

        private static BackendError BuildErrorEvent(JsonElement root)
        {
            string errType = null, errMsg = null;
            if (root.TryGetProperty("error", out JsonElement err) && err.ValueKind == JsonValueKind.Object)
            {
                errType = GetString(err, "type");
                errMsg = GetString(err, "message");
            }
            bool retry = IsRetryableErrorType(errType);
            string msg = "Anthropic stream error"
                + (errType != null ? " (" + errType + ")" : string.Empty)
                + (string.IsNullOrEmpty(errMsg) ? string.Empty : ": " + errMsg);
            return new BackendError(msg, retry);
        }

        private static bool IsRetryableErrorType(string errType)
        {
            switch (errType)
            {
                case "invalid_request_error":
                case "authentication_error":
                case "permission_error":
                case "not_found_error":
                case "request_too_large":
                    return false;
                default:
                    // overloaded_error, api_error, rate_limit_error, timeout, unknown → retryable.
                    return true;
            }
        }

        // Read the {input,output,cache_read,cache_creation}_input_tokens block. At message_start
        // the input + cache counts land; message_delta carries the final output_tokens.
        private static void ReadUsage(JsonElement holder, StreamState st, bool isStart)
        {
            if (!holder.TryGetProperty("usage", out JsonElement usage) || usage.ValueKind != JsonValueKind.Object)
                return;
            if (isStart)
            {
                if (TryGetInt(usage, "input_tokens", out int input)) st.InputTokens = input;
                if (TryGetInt(usage, "cache_read_input_tokens", out int cr)) st.CacheReadTokens = cr;
                if (TryGetInt(usage, "cache_creation_input_tokens", out int cw)) st.CacheWriteTokens = cw;
            }
            if (TryGetInt(usage, "output_tokens", out int output)) st.OutputTokens = output;
        }

        // Whitelist resolution: an accumulated tool payload {kind,target_index,magnitude} is
        // resolved through the capability manifest. target_index must index a listed option whose
        // kind matches; otherwise the effect is dropped (never thrown).
        private static bool TryResolveEffect(string json, ConversationRequest req, out ProposedEffect eff)
        {
            eff = null;
            if (string.IsNullOrEmpty(json)) return false;
            List<EffectOption> caps = req != null ? req.CapabilitySummary : null;
            if (caps == null || caps.Count == 0) return false;

            JsonDocument doc = TryParse(json);
            if (doc == null) return false;
            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return false;

                string kindStr = GetString(root, "kind");
                if (!TryParseKind(kindStr, out EffectKind kind)) return false;
                if (!TryGetInt(root, "target_index", out int index)) return false;
                if (index < 0 || index >= caps.Count) return false;

                EffectOption opt = caps[index];
                if (opt == null || opt.Kind != kind) return false;

                double magnitude = 0d;
                if (root.TryGetProperty("magnitude", out JsonElement mag) && mag.ValueKind == JsonValueKind.Number
                    && mag.TryGetDouble(out double m))
                    magnitude = m;

                eff = new ProposedEffect(opt.Kind, opt.TargetId, (float)magnitude);
                return true;
            }
        }

        private static bool TryParseKind(string s, out EffectKind kind)
        {
            switch (s)
            {
                case "SetDisposition": kind = EffectKind.SetDisposition; return true;
                case "RevealInfo": kind = EffectKind.RevealInfo; return true;
                case "AgreeTask": kind = EffectKind.AgreeTask; return true;
                case "FollowPlayer": kind = EffectKind.FollowPlayer; return true;
                case "EndConversation": kind = EffectKind.EndConversation; return true;
                default: kind = default; return false;
            }
        }

        // ------------------------------------------------------------------
        // Request body: PromptLayout → Messages API shape
        // ------------------------------------------------------------------

        internal string BuildRequestBody(ConversationRequest req, string utterance)
        {
            PromptLayout layout = PromptBuilder.Build(req, null, utterance);

            using var stream = new MemoryStream();
            using (var w = new Utf8JsonWriter(stream))
            {
                w.WriteStartObject();

                w.WriteString("model", _config.Model ?? string.Empty);
                w.WriteNumber("max_tokens", MaxTokens);
                w.WriteBoolean("stream", true);

                // tools: [ strict propose_effect ]
                w.WritePropertyName("tools");
                w.WriteStartArray();
                WriteProposeEffectTool(w);
                w.WriteEndArray();

                // system: [ block2 {cache_control}, block3 {cache_control} ]
                w.WritePropertyName("system");
                w.WriteStartArray();
                foreach (PromptBlock b in layout.Blocks)
                {
                    if (b.Role != PromptRole.System) continue;
                    if (b.Id == "tool_schema") continue; // block 1 becomes the tools array
                    w.WriteStartObject();
                    w.WriteString("type", "text");
                    w.WriteString("text", b.Text);
                    if (b.CacheBreakpoint)
                    {
                        w.WritePropertyName("cache_control");
                        w.WriteStartObject();
                        w.WriteString("type", "ephemeral");
                        w.WriteEndObject();
                    }
                    w.WriteEndObject();
                }
                w.WriteEndArray();

                // messages: context + transcript + latest utterance (all non-system blocks)
                w.WritePropertyName("messages");
                w.WriteStartArray();
                foreach (PromptBlock b in layout.Blocks)
                {
                    if (b.Role == PromptRole.System) continue;
                    w.WriteStartObject();
                    w.WriteString("role", b.Role == PromptRole.Assistant ? "assistant" : "user");
                    w.WriteString("content", b.Text);
                    w.WriteEndObject();
                }
                w.WriteEndArray();

                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(stream.ToArray());
        }

        private static void WriteProposeEffectTool(Utf8JsonWriter w)
        {
            w.WriteStartObject();
            w.WriteString("name", "propose_effect");
            w.WriteString("description", "Propose one in-fiction effect. Use only a target_index listed for this turn.");
            w.WriteBoolean("strict", true);

            w.WritePropertyName("input_schema");
            w.WriteStartObject();
            w.WriteString("type", "object");

            w.WritePropertyName("properties");
            w.WriteStartObject();

            w.WritePropertyName("kind");
            w.WriteStartObject();
            w.WriteString("type", "string");
            w.WritePropertyName("enum");
            w.WriteStartArray();
            w.WriteStringValue("SetDisposition");
            w.WriteStringValue("RevealInfo");
            w.WriteStringValue("AgreeTask");
            w.WriteStringValue("FollowPlayer");
            w.WriteStringValue("EndConversation");
            w.WriteEndArray();
            w.WriteEndObject();

            w.WritePropertyName("target_index");
            w.WriteStartObject();
            w.WriteString("type", "integer");
            w.WriteEndObject();

            w.WritePropertyName("magnitude");
            w.WriteStartObject();
            w.WriteString("type", "number");
            w.WriteEndObject();

            w.WriteEndObject(); // properties

            w.WritePropertyName("required");
            w.WriteStartArray();
            w.WriteStringValue("kind");
            w.WriteStringValue("target_index");
            w.WriteStringValue("magnitude");
            w.WriteEndArray();

            w.WriteBoolean("additionalProperties", false);
            w.WriteEndObject(); // input_schema
            w.WriteEndObject(); // tool
        }

        // ------------------------------------------------------------------
        // JSON helpers
        // ------------------------------------------------------------------

        private static JsonDocument TryParse(string json)
        {
            try { return JsonDocument.Parse(json); }
            catch { return null; }
        }

        private static string GetString(JsonElement obj, string prop)
            => obj.TryGetProperty(prop, out JsonElement e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;

        private static bool TryGetInt(JsonElement obj, string prop, out int val)
        {
            val = 0;
            if (obj.TryGetProperty(prop, out JsonElement e) && e.ValueKind == JsonValueKind.Number)
            {
                if (e.TryGetInt32(out val)) return true;
                if (e.TryGetDouble(out double d)) { val = (int)d; return true; }
            }
            return false;
        }

        private static string Truncate(string s, int max)
            => s.Length <= max ? s : s.Substring(0, max) + "…";
    }
}
