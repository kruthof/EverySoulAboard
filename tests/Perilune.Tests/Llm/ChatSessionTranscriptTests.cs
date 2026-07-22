using System.Collections.Generic;
using NUnit.Framework;
using Perilune.Llm;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// The sync half of the transcript threading: <see cref="ChatSession.Ask"/> hands the
    /// backend the completed history via <see cref="ConversationRequest.Transcript"/> — the
    /// same shape the async ConversationHub delivers — as a per-turn snapshot copy, never the
    /// live list, and bounded by the session's own MaxExchanges cap (the session ends there,
    /// so the transcript cannot outgrow it).
    /// </summary>
    [TestFixture]
    public sealed class ChatSessionTranscriptTests
    {
        private sealed class CapturingSyncBackend : SyncChatBackend
        {
            private int _calls;
            public readonly List<List<TranscriptLine>> Seen = new List<List<TranscriptLine>>();

            public override BackendCapabilities Caps => new BackendCapabilities("capture", false, false, 4);

            public override ChatResult Respond(ConversationRequest request, string playerUtterance)
            {
                Seen.Add(new List<TranscriptLine>(request.Transcript)); // copy at call time
                _calls++;
                return new ChatResult("R" + _calls.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    new List<ProposedEffect>());
            }
        }

        private static ConversationRequest Request() => new ConversationRequest { CitizenName = "Okafor" };

        [Test]
        public void SecondAsk_SeesTheFirstExchange_InOrder()
        {
            var backend = new CapturingSyncBackend();
            var session = new ChatSession(backend, Request());

            session.Ask("A");
            session.Ask("B");

            Assert.That(backend.Seen.Count, Is.EqualTo(2));
            Assert.That(backend.Seen[0].Count, Is.EqualTo(0), "the first turn is history-less");

            List<TranscriptLine> t = backend.Seen[1];
            Assert.That(t.Count, Is.EqualTo(2), "the second turn carries the completed first exchange");
            Assert.That(t[0].IsPlayer, Is.True);
            Assert.That(t[0].Text, Is.EqualTo("A"));
            Assert.That(t[1].Speaker, Is.EqualTo("Okafor"));
            Assert.That(t[1].Text, Is.EqualTo("R1"));
        }

        [Test]
        public void Request_Carries_A_Snapshot_NotTheLiveList()
        {
            var backend = new CapturingSyncBackend();
            ConversationRequest req = Request();
            var session = new ChatSession(backend, req);

            session.Ask("A");
            List<TranscriptLine> handed = req.Transcript; // what the backend was handed on turn one
            session.Ask("B");

            Assert.That(handed.Count, Is.EqualTo(0),
                "the turn-one snapshot never grows — the session appends to its own list, not the request's");
            Assert.That(session.Transcript.Count, Is.EqualTo(4), "the session's live transcript has both exchanges");
        }
    }
}
