using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// The playtest "no conversation memory" defect, proven fixed at the hub level: the
    /// ConversationHub maintains a per-session transcript (player utterance + authoritative
    /// citizen line appended when a turn COMPLETES) and delivers an immutable snapshot of it
    /// to the backend on every subsequent turn via ConversationRequest.Transcript. Covers the
    /// plain second turn, a say queued behind an in-flight turn, session isolation
    /// (bye → new talk starts clean), and that a failed turn leaves no history. Same harness
    /// as WebConversationTests: no sockets, no sim thread, capturing in-process backends.
    /// </summary>
    public class WebTranscriptTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 21, 0, 0, 0, DateTimeKind.Utc);

        private static GameSession NewGame(IChatBackend[] chain, out SimHost host, out ConversationHub hub)
            => NewGame(chain, out host, out _, out hub);

        private static GameSession NewGame(IChatBackend[] chain, out SimHost host, out List<string> sent, out ConversationHub hub)
        {
            host = SimHost.Build(SimHost.DefaultSeed);
            var captured = new List<string>();
            sent = captured;
            hub = new ConversationHub(host, captured.Add, chain, () => Now, 0m, null, 0, TimeSpan.FromSeconds(60));
            return new GameSession(host, captured.Add, hub); // NOT started ⇒ no sim thread
        }

        private static uint FirstCitizen(SimHost host) => host.Sim.Citizens.Items[0].Id;

        private static bool SpinUntil(Func<bool> cond, int ms)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            while (!cond()) { if (sw.ElapsedMilliseconds > ms) return false; Thread.Sleep(2); }
            return true;
        }

        // ---------------------------------------------------------------- second turn sees turn one

        [Test]
        public void Second_Say_Delivers_Turn_One_Exchange_To_The_Backend()
        {
            var cap = new CapturingBackend();
            var gs = NewGame(new IChatBackend[] { cap }, out var host, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "A"));
            Assert.IsTrue(hub.WaitIdle(4000), "turn one completes");
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "B"));
            Assert.IsTrue(hub.WaitIdle(4000), "turn two completes");

            Assert.AreEqual(2, cap.Calls.Count);

            // Turn one: no history yet.
            Assert.AreEqual("A", cap.Calls[0].Utterance);
            Assert.AreEqual(0, cap.Calls[0].Transcript.Count, "the first turn starts with an empty transcript");

            // Turn two: BOTH turn-one lines, in order — player first (quarantine-marked via
            // the speaker), then the authoritative citizen reply the hub broadcast.
            Assert.AreEqual("B", cap.Calls[1].Utterance);
            var t = cap.Calls[1].Transcript;
            Assert.AreEqual(2, t.Count, "the completed exchange is history on the second turn");
            Assert.IsTrue(t[0].IsPlayer, "the player line carries the player speaker");
            Assert.AreEqual("A", t[0].Text);
            Assert.IsFalse(t[1].IsPlayer, "the citizen line carries the citizen's name");
            Assert.AreEqual("R1", t[1].Text, "the citizen history line is the turn's authoritative accumulated text");
        }

        // ---------------------------------------------------------------- queued say-in-flight

        [Test]
        public void Transcript_Survives_A_Say_Queued_Behind_An_InFlight_Turn()
        {
            var cap = new CapturingBackend(gated: true);
            var gs = NewGame(new IChatBackend[] { cap }, out var host, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "A"));
            Assert.IsTrue(SpinUntil(() => hub.InFlightCount == 1, 2000), "first turn in flight");

            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "B")); // queues behind A
            cap.Release();
            Assert.IsTrue(hub.WaitIdle(4000), "first turn drains");

            gs.ConvPumpPending(); // dispatches the queued B — its snapshot must include turn one
            Assert.IsTrue(SpinUntil(() => hub.InFlightCount == 1, 2000), "queued turn dispatched");
            cap.Release();
            Assert.IsTrue(hub.WaitIdle(4000), "second turn drains");

            Assert.AreEqual(2, cap.Calls.Count);
            var t = cap.Calls[1].Transcript;
            Assert.AreEqual("B", cap.Calls[1].Utterance);
            Assert.AreEqual(2, t.Count, "the queued say still sees the completed turn-one exchange");
            Assert.IsTrue(t[0].IsPlayer);
            Assert.AreEqual("A", t[0].Text);
            Assert.AreEqual("R1", t[1].Text);
        }

        // ---------------------------------------------------------------- session isolation

        [Test]
        public void Bye_Then_New_Talk_Starts_With_A_Clean_Transcript()
        {
            var cap = new CapturingBackend();
            var gs = NewGame(new IChatBackend[] { cap }, out var host, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));            // sid 1
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "A"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ApplyForTest(new WebCommand(CmdKind.Bye, sid: 1));

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));            // sid 2, fresh session
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 2, text: "C"));
            Assert.IsTrue(hub.WaitIdle(4000));

            Assert.AreEqual(2, cap.Calls.Count);
            Assert.AreEqual("C", cap.Calls[1].Utterance);
            Assert.AreEqual(0, cap.Calls[1].Transcript.Count,
                "a new talk session never inherits the previous session's history");
        }

        // ---------------------------------------------------------------- failed drains leave no history

        [Test]
        public void Failed_Primary_Drain_Contributes_Nothing_Only_The_Answering_Backends_Exchange_Is_History()
        {
            // The primary streams partial text then errors (no completion); the TemplateBackend
            // terminator answers, so the turn COMPLETES via degrade and the session stays alive.
            // The next turn re-probes the degraded primary first, handing it the transcript
            // snapshot — which must hold EXACTLY the template exchange: the failed primary
            // attempt (its partial "P-partial" text) contributed nothing. This is the observable
            // form of the error-path rule; a hub that appends per failed drain fails here.
            var primary = new FailingCapturingPrimary();
            var gs = NewGame(new IChatBackend[] { primary, new TemplateBackend() }, out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "A"));
            Assert.IsTrue(hub.WaitIdle(4000), "turn one completes via the template fallback");
            gs.ConvFlush();

            // The authoritative citizen line the hub broadcast — what history must hold.
            string line = sent.Find(m => m.Contains("\"ev\":\"line\""));
            Assert.IsNotNull(line, "the template answered turn one");
            string templateReply;
            using (var doc = System.Text.Json.JsonDocument.Parse(line))
                templateReply = doc.RootElement.GetProperty("text").GetString();
            Assert.IsFalse(string.IsNullOrEmpty(templateReply));

            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "B"));
            Assert.IsTrue(hub.WaitIdle(4000), "turn two completes (session stayed alive)");

            Assert.AreEqual(2, primary.Calls.Count, "the degraded primary was re-probed on turn two");
            var t = primary.Calls[1].Transcript;
            Assert.AreEqual(2, t.Count, "EXACTLY the completed template exchange — the failed drain appended nothing");
            Assert.IsTrue(t[0].IsPlayer);
            Assert.AreEqual("A", t[0].Text);
            Assert.IsFalse(t[1].IsPlayer);
            Assert.AreEqual(templateReply, t[1].Text, "the citizen history line is the ANSWERING backend's authoritative text");
            foreach (var lineT in t)
                StringAssert.DoesNotContain("P-partial", lineT.Text, "the failed primary's partial text never becomes history");
        }

        // ---------------------------------------------------------------- the capturing fake

        private sealed class Call
        {
            public string Utterance;
            public List<TranscriptLine> Transcript; // defensive copy captured at SendAsync entry
        }

        /// <summary>
        /// Streams "R{n}" + TurnComplete, recording each call's utterance and a copy of
        /// req.Transcript. Optionally gated (blocks until Release).
        /// </summary>
        private sealed class CapturingBackend : IChatBackend
        {
            private readonly System.Collections.Concurrent.BlockingCollection<bool> _gate;
            private int _calls;
            public readonly List<Call> Calls = new List<Call>();
            private readonly object _lock = new object();

            public CapturingBackend(bool gated = false)
            {
                _gate = gated ? new System.Collections.Concurrent.BlockingCollection<bool>() : null;
            }

            public void Release() => _gate.Add(true);

            public BackendCapabilities Caps => new BackendCapabilities("capture", true, false, 4);

            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("sync", new List<ProposedEffect>());

            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                int n;
                lock (_lock)
                {
                    n = ++_calls;
                    Calls.Add(new Call
                    {
                        Utterance = utterance,
                        Transcript = new List<TranscriptLine>(req.Transcript ?? new List<TranscriptLine>()),
                    });
                }
                if (_gate != null)
                    await Task.Run(() => _gate.Take(ct), ct).ConfigureAwait(false);
                else
                    await Task.CompletedTask.ConfigureAwait(false);

                yield return new TextDelta("R" + n.ToString(System.Globalization.CultureInfo.InvariantCulture));
                yield return new TurnComplete(new TurnUsage(0, 0, 0, 0, "capture"));
            }
        }

        /// <summary>
        /// A primary that records each call's transcript snapshot, streams partial text
        /// ("P-partial") and then errors WITHOUT completing — so it always fails the drain and
        /// the chain falls through to the next backend, while its captures show exactly what
        /// history each turn delivered.
        /// </summary>
        private sealed class FailingCapturingPrimary : IChatBackend
        {
            public readonly List<Call> Calls = new List<Call>();
            private readonly object _lock = new object();

            public BackendCapabilities Caps => new BackendCapabilities("failing-primary", true, false, 4);

            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("", new List<ProposedEffect>());

            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                lock (_lock)
                {
                    Calls.Add(new Call
                    {
                        Utterance = utterance,
                        Transcript = new List<TranscriptLine>(req.Transcript ?? new List<TranscriptLine>()),
                    });
                }
                await Task.CompletedTask.ConfigureAwait(false);
                yield return new TextDelta("P-partial ");
                yield return new BackendError("scripted primary failure", true); // no TurnComplete ⇒ failed drain
            }
        }
    }
}
