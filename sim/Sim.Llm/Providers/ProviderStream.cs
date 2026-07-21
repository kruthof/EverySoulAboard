using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Perilune.Llm.Providers
{
    /// <summary>
    /// Shared streaming plumbing for the HTTP adapters. <see cref="ReadNextAsync"/> isolates the
    /// try/catch that a C# async iterator cannot wrap around its <c>yield</c>s: it pulls one decoded
    /// chunk, reclassifies a per-request timeout or transport fault into a retryable
    /// <see cref="BackendError"/>, and rethrows caller cancellation so the adapter can propagate it.
    /// </summary>
    internal static class ProviderStream
    {
        public readonly struct ReadStep
        {
            public string Chunk { get; }
            public bool End { get; }
            public ChatDelta Error { get; }
            private ReadStep(string chunk, bool end, ChatDelta error) { Chunk = chunk; End = end; Error = error; }
            public static ReadStep OfChunk(string c) => new ReadStep(c, false, null);
            public static ReadStep OfEnd() => new ReadStep(null, true, null);
            public static ReadStep OfError(ChatDelta e) => new ReadStep(null, false, e);
        }

        public static async Task<ReadStep> ReadNextAsync(IAsyncEnumerator<string> chunks, string who, CancellationToken ct)
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
                return ReadStep.OfError(Retryable(who + " stream timed out."));
            }
            catch (HttpRequestException e)
            {
                return ReadStep.OfError(Retryable(who + " stream error: " + e.Message));
            }
            catch (IOException e)
            {
                return ReadStep.OfError(Retryable(who + " stream io error: " + e.Message));
            }
        }

        public static BackendError Retryable(string message, string retryAfter = null)
            => new BackendError(retryAfter == null ? message : message + " (retry-after=" + retryAfter + ")", true);

        /// <summary>408/429/5xx are transient; other 4xx are permanent.</summary>
        public static bool IsRetryableStatus(int status)
            => status == 408 || status == 429 || status >= 500;

        /// <summary>Build the terminal <see cref="BackendError"/> for a non-2xx response — classifying
        /// retryability and folding in the Retry-After header and (truncated) error body.</summary>
        public static async Task<BackendError> HttpStatusErrorAsync(HttpChatResponse resp, string who)
        {
            string retryAfter = resp.RetryAfter;
            string body = await resp.ReadBodyTextAsync().ConfigureAwait(false);
            bool retry = IsRetryableStatus(resp.StatusCode);
            string msg = who + " HTTP " + resp.StatusCode.ToString(System.Globalization.CultureInfo.InvariantCulture)
                + (retryAfter != null ? " (retry-after=" + retryAfter + ")" : string.Empty)
                + (string.IsNullOrEmpty(body) ? string.Empty : ": " + Truncate(body, 300));
            return new BackendError(msg, retry);
        }

        private static string Truncate(string s, int max)
            => s.Length <= max ? s : s.Substring(0, max) + "…";
    }
}
