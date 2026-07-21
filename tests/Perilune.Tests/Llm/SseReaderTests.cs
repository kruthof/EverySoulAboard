using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Llm.Providers;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// Package L3 — the incremental SSE parser in isolation: field parsing, blank-line dispatch,
    /// comments and unknown fields, multi-line data joining, and robustness to how a network splits
    /// a stream (frames across chunk boundaries; LF, CRLF, and bare-CR line endings, including a CRLF
    /// split across two chunks).
    /// </summary>
    [TestFixture]
    public sealed class SseReaderTests
    {
        private static List<SseEvent> PushAll(SseReader r, params string[] chunks)
        {
            var events = new List<SseEvent>();
            foreach (string c in chunks) events.AddRange(r.Push(c));
            events.AddRange(r.Flush());
            return events;
        }

        [Test]
        public void SingleEvent_EventAndDataFields()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Event, Is.EqualTo("message_stop"));
            Assert.That(ev[0].Data, Is.EqualTo("{\"type\":\"message_stop\"}"));
        }

        [Test]
        public void OneLeadingSpaceAfterColon_IsStripped_ButOnlyOne()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "data:  two-spaces\n\n"); // one stripped, one kept
            Assert.That(ev[0].Data, Is.EqualTo(" two-spaces"));
        }

        [Test]
        public void FrameSplitAcrossChunks_IsReassembled()
        {
            var r = new SseReader();
            // The data line and even the field name are split mid-token across chunk boundaries.
            List<SseEvent> ev = PushAll(r, "eve", "nt: ping\nda", "ta: {\"a\":", "1}\n\n");
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Event, Is.EqualTo("ping"));
            Assert.That(ev[0].Data, Is.EqualTo("{\"a\":1}"));
        }

        [Test]
        public void CrlfLineEndings_SplitAcrossChunks()
        {
            var r = new SseReader();
            // "\r" ends chunk 1, "\n" opens chunk 2 — the CRLF must not count as two line breaks.
            List<SseEvent> ev = PushAll(r, "data: hello\r", "\ndata: world\r\n\r\n");
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Data, Is.EqualTo("hello\nworld"), "two data lines join with a newline");
        }

        [Test]
        public void BareCr_IsALineBreak()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "event: a\rdata: b\r\r");
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Event, Is.EqualTo("a"));
            Assert.That(ev[0].Data, Is.EqualTo("b"));
        }

        [Test]
        public void CommentsAndUnknownFields_AreIgnored()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r,
                ": this is a comment\nid: 42\nretry: 1000\nevent: message_delta\ndata: {}\n\n");
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Event, Is.EqualTo("message_delta"));
            Assert.That(ev[0].Data, Is.EqualTo("{}"), "id/retry/comment do not shape the event");
        }

        [Test]
        public void BlankLineWithNoPendingFields_DispatchesNothing()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "\n\n\nevent: x\ndata: y\n\n");
            Assert.That(ev.Count, Is.EqualTo(1), "leading blank lines are inert");
            Assert.That(ev[0].Event, Is.EqualTo("x"));
        }

        [Test]
        public void TwoEventsBackToBack()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");
            Assert.That(ev.Count, Is.EqualTo(2));
            Assert.That(ev[0].Event, Is.EqualTo("a"));
            Assert.That(ev[0].Data, Is.EqualTo("1"));
            Assert.That(ev[1].Event, Is.EqualTo("b"));
            Assert.That(ev[1].Data, Is.EqualTo("2"));
        }

        [Test]
        public void Flush_DispatchesAPendingEventWithNoTrailingBlankLine()
        {
            var r = new SseReader();
            // A stream that stops right after the data line, no terminating blank line.
            List<SseEvent> ev = PushAll(r, "event: e\ndata: d");
            Assert.That(ev.Count, Is.EqualTo(1), "Flush() makes a mid-frame stop lossless");
            Assert.That(ev[0].Data, Is.EqualTo("d"));
        }

        [Test]
        public void DataOnlyEvent_HasEmptyEventType()
        {
            var r = new SseReader();
            List<SseEvent> ev = PushAll(r, "data: [DONE]\n\n"); // OpenAI-compatible shape
            Assert.That(ev.Count, Is.EqualTo(1));
            Assert.That(ev[0].Event, Is.EqualTo(string.Empty));
            Assert.That(ev[0].Data, Is.EqualTo("[DONE]"));
        }
    }
}
