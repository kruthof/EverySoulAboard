using System.Collections.Generic;
using System.Text;

namespace Perilune.Llm.Providers
{
    /// <summary>One dispatched Server-Sent Event: its <c>event:</c> type (may be empty when the
    /// stream omits it, as OpenAI-compatible endpoints do) and its accumulated <c>data:</c> payload
    /// with the trailing newline stripped.</summary>
    public readonly struct SseEvent
    {
        public string Event { get; }
        public string Data { get; }

        public SseEvent(string ev, string data)
        {
            Event = ev ?? string.Empty;
            Data = data ?? string.Empty;
        }
    }

    /// <summary>
    /// Incremental Server-Sent Events parser (LLM_CITIZENS.md §8) — the framing layer under the
    /// Anthropic and OpenAI-compatible streaming adapters. Fed arbitrary text chunks via
    /// <see cref="Push"/>, it accumulates fields until a blank line dispatches an event, and it is
    /// robust to the ways a network splits a stream:
    ///
    ///   • FRAME SPLITS. A field, a line, or even a line ending may arrive across two chunks; the
    ///     residual line and the pending event are carried between <see cref="Push"/> calls.
    ///   • LINE ENDINGS. LF, CRLF, and bare CR are all treated as line breaks, including a CRLF
    ///     split so that <c>\r</c> ends one chunk and <c>\n</c> opens the next.
    ///   • UNKNOWN FIELDS &amp; COMMENTS. Lines beginning with <c>:</c> are comments and ignored;
    ///     fields other than <c>event</c> and <c>data</c> (e.g. <c>id</c>, <c>retry</c>) are parsed
    ///     but do not contribute to the dispatched event.
    ///
    /// Per the SSE spec, one leading space after a field's colon is stripped, multiple <c>data</c>
    /// lines are joined with newlines, and a blank line with no preceding fields dispatches nothing.
    /// The parser holds no network state and never throws.
    /// </summary>
    public sealed class SseReader
    {
        private readonly StringBuilder _line = new StringBuilder();
        private readonly StringBuilder _data = new StringBuilder();
        private string _eventType = string.Empty;
        private bool _pending;   // at least one field seen since the last dispatch
        private bool _sawData;   // at least one data field seen for the pending event
        private bool _sawCr;     // previous char was CR (to swallow a following LF)

        /// <summary>
        /// Feed one text chunk; yields every event whose blank-line terminator lands within it.
        /// Incomplete trailing content is buffered for the next call.
        /// </summary>
        public IEnumerable<SseEvent> Push(string chunk)
        {
            if (string.IsNullOrEmpty(chunk)) yield break;

            for (int i = 0; i < chunk.Length; i++)
            {
                char c = chunk[i];
                if (c == '\r')
                {
                    if (TryProcessLine(out SseEvent ev)) yield return ev;
                    _sawCr = true;
                }
                else if (c == '\n')
                {
                    if (_sawCr)
                    {
                        // Second half of a CRLF (possibly split across chunks): already handled.
                        _sawCr = false;
                    }
                    else if (TryProcessLine(out SseEvent ev))
                    {
                        yield return ev;
                    }
                }
                else
                {
                    _sawCr = false;
                    _line.Append(c);
                }
            }
        }

        /// <summary>
        /// Flush at end of stream: process any residual (un-terminated) line and, if fields are
        /// still pending, dispatch a final event. Most well-formed streams end on a blank line so
        /// this yields nothing, but it makes a stream that stops mid-frame lossless.
        /// </summary>
        public IEnumerable<SseEvent> Flush()
        {
            if (_line.Length > 0)
            {
                if (TryProcessLine(out SseEvent ev)) yield return ev;
            }
            if (_pending)
            {
                yield return Dispatch();
            }
        }

        // Consume the buffered line. Returns true (with an event) only when the line is the blank
        // terminator that dispatches a pending event.
        private bool TryProcessLine(out SseEvent ev)
        {
            string line = _line.ToString();
            _line.Clear();
            ev = default;

            if (line.Length == 0)
            {
                if (!_pending) return false;
                ev = Dispatch();
                return true;
            }

            if (line[0] == ':') return false; // comment

            int colon = line.IndexOf(':');
            string field, value;
            if (colon < 0)
            {
                field = line;
                value = string.Empty;
            }
            else
            {
                field = line.Substring(0, colon);
                value = line.Substring(colon + 1);
                if (value.Length > 0 && value[0] == ' ') value = value.Substring(1); // one leading space
            }

            if (field == "event")
            {
                _eventType = value;
                _pending = true;
            }
            else if (field == "data")
            {
                if (_sawData) _data.Append('\n');
                _data.Append(value);
                _sawData = true;
                _pending = true;
            }
            // Any other field (id, retry, unknown) is accepted but does not shape the event.

            return false;
        }

        private SseEvent Dispatch()
        {
            var ev = new SseEvent(_eventType, _data.ToString());
            _eventType = string.Empty;
            _data.Clear();
            _pending = false;
            _sawData = false;
            return ev;
        }
    }
}
