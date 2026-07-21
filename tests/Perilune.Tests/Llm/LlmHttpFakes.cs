using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Shared HTTP test doubles for the provider adapters (packages L3/L4). Every provider test
    /// replays a fixture through <see cref="FakeHttpHandler"/> — the injected
    /// <see cref="HttpMessageHandler"/> — so no test ever opens a socket. The handler counts
    /// invocations and captures the outbound request, which is how the suite proves "zero real
    /// HTTP" and inspects the request body/headers.
    /// </summary>
    internal sealed class FakeHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

        public int CallCount { get; private set; }
        public HttpRequestMessage LastRequest { get; private set; }
        public string LastBody { get; private set; }

        public FakeHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            _responder = responder ?? throw new ArgumentNullException(nameof(responder));
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            if (request.Content != null)
                LastBody = await request.Content.ReadAsStringAsync().ConfigureAwait(false);
            return _responder(request);
        }

        // ---- response builders ----------------------------------------------------------

        /// <summary>A 200 streaming response over the given <see cref="ChunkStream"/> (the test keeps
        /// a reference to assert on chunk framing and disposal).</summary>
        public static HttpResponseMessage StreamingWith(ChunkStream stream)
            => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(stream) };

        /// <summary>A non-2xx response with an optional Retry-After header and body text.</summary>
        public static HttpResponseMessage Status(int status, string body = "", string retryAfter = null)
        {
            var resp = new HttpResponseMessage((HttpStatusCode)status)
            {
                Content = new StringContent(body ?? string.Empty, Encoding.UTF8, "application/json"),
            };
            if (retryAfter != null) resp.Headers.TryAddWithoutValidation("Retry-After", retryAfter);
            return resp;
        }
    }

    /// <summary>
    /// A read-only stream that hands back its pre-split byte chunks one per <c>ReadAsync</c> call,
    /// so a test can drive arbitrary network framing (whole-frame, 1-byte torture, CRLF splits).
    /// It honours the cancellation token before each chunk and records disposal, which is how the
    /// "cancellation disposes the response" contract is verified. An optional per-read hook lets a
    /// test cancel exactly between two chunks.
    /// </summary>
    internal sealed class ChunkStream : Stream
    {
        private readonly IReadOnlyList<byte[]> _chunks;
        private readonly Action<int> _onRead;
        private int _idx;
        private int _off;

        public bool Disposed { get; private set; }

        public ChunkStream(IReadOnlyList<byte[]> chunks, Action<int> onRead = null)
        {
            _chunks = chunks ?? Array.Empty<byte[]>();
            _onRead = onRead;
        }

        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            await Task.Yield();
            _onRead?.Invoke(_idx);
            cancellationToken.ThrowIfCancellationRequested();

            if (_idx >= _chunks.Count) return 0;
            byte[] cur = _chunks[_idx];
            int n = Math.Min(count, cur.Length - _off);
            Array.Copy(cur, _off, buffer, offset, n);
            _off += n;
            if (_off >= cur.Length) { _idx++; _off = 0; }
            return n;
        }

        public override int Read(byte[] buffer, int offset, int count)
            => ReadAsync(buffer, offset, count, CancellationToken.None).GetAwaiter().GetResult();

        protected override void Dispose(bool disposing)
        {
            Disposed = true;
            base.Dispose(disposing);
        }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    /// <summary>A stream whose read never completes until the token cancels — drives the
    /// per-request timeout path without any wall-clock dependence beyond the short timeout.</summary>
    internal sealed class HangingStream : Stream
    {
        public bool Disposed { get; private set; }

        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken).ConfigureAwait(false);
            return 0; // unreachable
        }

        public override int Read(byte[] buffer, int offset, int count) => 0;
        protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    /// <summary>Fixture loading + chunking helpers for the provider tests.</summary>
    internal static class LlmFixtures
    {
        /// <summary>Read a fixture from tests/Perilune.Tests/Llm/Fixtures, normalized to LF.</summary>
        public static string Load(string name, [CallerFilePath] string thisFile = "")
        {
            string dir = Path.Combine(Path.GetDirectoryName(thisFile) ?? ".", "Fixtures");
            return File.ReadAllText(Path.Combine(dir, name)).Replace("\r\n", "\n");
        }

        public static byte[] Utf8(string s) => Encoding.UTF8.GetBytes(s ?? string.Empty);

        /// <summary>The whole body as a single chunk.</summary>
        public static List<byte[]> Whole(string body) => new List<byte[]> { Utf8(body) };

        /// <summary>Split into fixed-size byte chunks (1 = per-byte torture).</summary>
        public static List<byte[]> Split(string body, int size)
        {
            byte[] data = Utf8(body);
            var chunks = new List<byte[]>();
            for (int i = 0; i < data.Length; i += size)
            {
                int n = Math.Min(size, data.Length - i);
                var c = new byte[n];
                Array.Copy(data, i, c, 0, n);
                chunks.Add(c);
            }
            if (chunks.Count == 0) chunks.Add(Array.Empty<byte>());
            return chunks;
        }
    }
}
