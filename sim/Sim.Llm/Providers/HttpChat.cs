using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Llm.Providers
{
    /// <summary>One outbound HTTP header (name/value). A value type so the header list
    /// an adapter builds is copy-safe and allocation-cheap.</summary>
    public readonly struct HttpHeader
    {
        public string Name { get; }
        public string Value { get; }

        public HttpHeader(string name, string value)
        {
            Name = name ?? string.Empty;
            Value = value ?? string.Empty;
        }
    }

    /// <summary>
    /// The thin HTTP substrate the vendor adapters (Anthropic / OpenAI-compat / Ollama)
    /// POST through (LLM_CITIZENS.md §8). Deliberately minimal: one streaming POST, an
    /// injectable <see cref="HttpMessageHandler"/> (so every test replays fixtures through
    /// a fake handler and asserts zero real network), a per-request timeout enforced with a
    /// linked <see cref="CancellationTokenSource"/>, and NO retry policy — the dispatcher
    /// (L5) owns retry/backoff. A timeout surfaces as <see cref="TimeoutException"/> and
    /// caller cancellation as <see cref="OperationCanceledException"/>, so the adapter can
    /// tell "retry me" from "the player closed the window".
    /// </summary>
    public sealed class HttpChat : IDisposable
    {
        private readonly HttpClient _client;

        /// <summary>
        /// Wrap an injected handler. The handler is NOT disposed by this class (tests keep a
        /// reference to count invocations); the internally-created <see cref="HttpClient"/> is.
        /// The client's own timeout is disabled — timeouts are per-request via a linked token,
        /// which keeps cancellation observable mid-stream.
        /// </summary>
        public HttpChat(HttpMessageHandler handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            _client = new HttpClient(handler, disposeHandler: false)
            {
                Timeout = Timeout.InfiniteTimeSpan,
            };
        }

        /// <summary>
        /// POST <paramref name="jsonBody"/> to <paramref name="url"/> with the given headers,
        /// reading response headers eagerly (<see cref="HttpCompletionOption.ResponseHeadersRead"/>)
        /// so the body can be streamed. The returned <see cref="HttpChatResponse"/> owns the
        /// response and the linked token source and MUST be disposed by the caller (disposing it
        /// aborts an in-flight stream). A per-request <paramref name="timeout"/> of zero or less
        /// means no timeout.
        /// </summary>
        public async Task<HttpChatResponse> PostAsync(
            string url, string jsonBody, IReadOnlyList<HttpHeader> headers, TimeSpan timeout, CancellationToken ct)
        {
            CancellationTokenSource linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
            if (timeout > TimeSpan.Zero) linked.CancelAfter(timeout);

            HttpResponseMessage resp = null;
            bool ok = false;
            try
            {
                using (var msg = new HttpRequestMessage(HttpMethod.Post, url))
                {
                    msg.Content = new StringContent(jsonBody ?? string.Empty, Encoding.UTF8, "application/json");
                    if (headers != null)
                        for (int i = 0; i < headers.Count; i++)
                            msg.Headers.TryAddWithoutValidation(headers[i].Name, headers[i].Value);

                    resp = await _client.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, linked.Token)
                        .ConfigureAwait(false);
                }

                var wrapped = new HttpChatResponse(resp, linked, ct);
                ok = true;
                return wrapped;
            }
            catch (OperationCanceledException) when (linked.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                // The linked token fired but the caller's token did not: this was our timeout,
                // not a caller cancellation. Reclassify so the adapter can retry.
                throw new TimeoutException("HTTP request timed out.");
            }
            finally
            {
                if (!ok)
                {
                    resp?.Dispose();
                    linked.Dispose();
                }
            }
        }

        public void Dispose() => _client.Dispose();
    }

    /// <summary>
    /// The response half of one <see cref="HttpChat.PostAsync"/> call. Owns the underlying
    /// <see cref="HttpResponseMessage"/> and the per-request linked token; disposing it aborts
    /// a mid-stream read (the "cancellation disposes the response" contract). Reads observe the
    /// linked token, so a per-request timeout that fires while the body is trickling surfaces as
    /// <see cref="TimeoutException"/>, while caller cancellation surfaces as
    /// <see cref="OperationCanceledException"/>.
    /// </summary>
    public sealed class HttpChatResponse : IDisposable
    {
        private readonly HttpResponseMessage _resp;
        private readonly CancellationTokenSource _linked;
        private readonly CancellationToken _outer;
        private Stream _stream;

        internal HttpChatResponse(HttpResponseMessage resp, CancellationTokenSource linked, CancellationToken outer)
        {
            _resp = resp;
            _linked = linked;
            _outer = outer;
            StatusCode = (int)resp.StatusCode;
            IsSuccess = resp.IsSuccessStatusCode;
        }

        /// <summary>HTTP status code as an int (e.g. 200, 429, 529).</summary>
        public int StatusCode { get; }

        /// <summary>True for 2xx.</summary>
        public bool IsSuccess { get; }

        /// <summary>The raw <c>Retry-After</c> header value (seconds or HTTP-date), or null.</summary>
        public string RetryAfter
        {
            get
            {
                if (_resp.Headers.TryGetValues("Retry-After", out IEnumerable<string> vals))
                    foreach (string v in vals) return v;
                return null;
            }
        }

        /// <summary>Read the full body as text — for non-streaming error bodies. Never throws.</summary>
        public async Task<string> ReadBodyTextAsync()
        {
            try
            {
                return await _resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            }
            catch
            {
                return string.Empty;
            }
        }

        /// <summary>
        /// Stream the response body as decoded UTF-8 text chunks, in arrival order. A multi-byte
        /// character split across a chunk boundary is reassembled by the shared decoder, and a
        /// per-request timeout that fires mid-read is reclassified as <see cref="TimeoutException"/>
        /// (caller cancellation propagates as <see cref="OperationCanceledException"/>). The SSE /
        /// NDJSON framing on top of these chunks is the reader's job, not this method's.
        /// </summary>
        public async IAsyncEnumerable<string> ReadChunksAsync(
            [EnumeratorCancellation] CancellationToken ct = default)
        {
            _stream = _stream ?? await _resp.Content.ReadAsStreamAsync().ConfigureAwait(false);
            var buffer = new byte[8192];
            var chars = new char[buffer.Length + 1];
            Decoder decoder = Encoding.UTF8.GetDecoder();

            while (true)
            {
                int n = await ReadOnceAsync(buffer, ct).ConfigureAwait(false);
                if (n <= 0) break;
                int cc = decoder.GetChars(buffer, 0, n, chars, 0, flush: false);
                if (cc > 0) yield return new string(chars, 0, cc);
            }
        }

        private async Task<int> ReadOnceAsync(byte[] buffer, CancellationToken ct)
        {
            // Read against the linked token captured at POST time: it was created from the caller's
            // token AND carries the per-request timeout (CancelAfter), so it fires on both. The
            // reclassification below tells caller-cancel from timeout. (The per-enumeration token
            // is the same caller token the backend already threaded into PostAsync.)
            _ = ct;
            try
            {
                return await _stream.ReadAsync(buffer, 0, buffer.Length, _linked.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (_linked.IsCancellationRequested && !_outer.IsCancellationRequested)
            {
                throw new TimeoutException("HTTP stream read timed out.");
            }
        }

        public void Dispose()
        {
            _stream?.Dispose();
            _resp.Dispose();
            _linked.Dispose();
        }
    }
}
