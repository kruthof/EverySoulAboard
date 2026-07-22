using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// L6 — the talking host. Drives real conversations through the real GameSession +
    /// ConversationHub over the offline TemplateBackend (and small in-process fakes), with a
    /// fake clock: talk → say → deltas → authoritative line → accepted effect applied at the
    /// next tick → bye. Also covers say-while-in-flight queuing, JSON escaping of reply text,
    /// the llmstatus / chronicle payloads, the now-persona-bearing citizen card, and the
    /// zero-network guarantee. No sockets, no sim thread: ApplyForTest is the command drain and
    /// ConvFlush is the Render() outbox drain.
    /// </summary>
    public class WebConversationTests
    {
        private static readonly DateTime Now = new DateTime(2026, 7, 21, 0, 0, 0, DateTimeKind.Utc);

        private static GameSession NewGame(IChatBackend[] chain, out SimHost host, out List<string> sent, out ConversationHub hub)
            => NewGame(chain, 2, TimeSpan.FromSeconds(60), out host, out sent, out hub);

        private static GameSession NewGame(IChatBackend[] chain, int maxRetries, TimeSpan timeout,
            out SimHost host, out List<string> sent, out ConversationHub hub)
        {
            host = SimHost.Build(SimHost.DefaultSeed);
            var captured = new List<string>();
            sent = captured;
            hub = new ConversationHub(host, captured.Add, chain, () => Now, 0m, null, maxRetries, timeout);
            return new GameSession(host, captured.Add, hub); // NOT started ⇒ no sim thread
        }

        private static uint FirstCitizen(SimHost host) => host.Sim.Citizens.Items[0].Id;

        // ---------------------------------------------------------------- end-to-end

        [Test]
        public void Talk_Say_Deltas_Line_Effect_Applied_NextTick_Bye()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            Assert.IsTrue(host.Minds.Minds.TryGet(cid, out var mind), "boot generated a persona/mind for the citizen");
            Assert.AreEqual(0f, mind.AffinityToPlayer, "precondition: affinity starts neutral");

            // talk → chat start (sid 1) with the citizen's persona name.
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ConvFlush();
            string start = sent.Find(m => m.Contains("\"ev\":\"start\""));
            Assert.IsNotNull(start, "talk emits chat start");
            StringAssert.Contains("\"cid\":" + cid, start);

            // say → the turn runs on a background task; wait for it, then drain the outbox.
            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "do you have any secrets?"));
            Assert.IsTrue(hub.WaitIdle(4000), "the offline turn completes");
            gs.ConvFlush();

            Assert.IsNotNull(sent.Find(m => m.Contains("\"ev\":\"delta\"")), "streamed at least one text delta");
            // B1: the player's own utterance is echoed as an authoritative line, before the crew reply.
            string playerLine = sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"you\""));
            Assert.IsNotNull(playerLine, "the player's own line is echoed (B1)");
            StringAssert.Contains("do you have any secrets?", playerLine);
            string line = sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"crew\""));
            Assert.IsNotNull(line, "an authoritative crew line lands");
            Assert.Less(sent.IndexOf(playerLine), sent.IndexOf(line), "player line precedes the crew reply (B1 ordering)");
            Assert.IsNotNull(sent.Find(m => m.Contains("\"ev\":\"effect\"")), "an accepted effect note is emitted");

            // The effect is dispatched to the buffer, not yet applied: it lands on the NEXT tick.
            Assert.AreEqual(0f, mind.AffinityToPlayer, "effect not applied until a tick drains the buffer");
            host.Sim.Tick();
            Assert.Greater(mind.AffinityToPlayer, 0f, "EffectPump applied the disposition effect on the next tick");

            // bye → chat end done.
            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Bye, sid: 1));
            gs.ConvFlush();
            StringAssert.Contains("\"ev\":\"end\"", sent.Find(m => m.Contains("\"ev\":\"end\"")) ?? "");
            StringAssert.Contains("\"reason\":\"done\"", sent.Find(m => m.Contains("\"ev\":\"end\"")) ?? "");
        }

        [Test]
        public void Talk_To_Dead_Or_Unknown_Cid_Ends_Unavailable()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out var sent, out _);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: 999999u)); // no such citizen
            gs.ConvFlush();
            string end = sent.Find(m => m.Contains("\"ev\":\"end\""));
            Assert.IsNotNull(end);
            StringAssert.Contains("\"reason\":\"unavailable\"", end);
        }

        // ---------------------------------------------------------------- say-in-flight

        [Test]
        public void Say_While_InFlight_Queues_Without_Double_Dispatch()
        {
            var gate = new GatedBackend();
            var gs = NewGame(new IChatBackend[] { gate }, out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "first"));
            // The backend is blocked, so exactly one turn is in flight.
            Assert.IsTrue(SpinUntil(() => hub.InFlightCount == 1, 2000), "first turn is in flight");

            // A second say while in flight must NOT dispatch a second turn — it queues.
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "second"));
            Thread.Sleep(30);
            Assert.AreEqual(1, hub.InFlightCount, "no double dispatch — the second say queued");

            // Release the first; pumping pending then dispatches the queued second turn.
            gate.Release();
            Assert.IsTrue(hub.WaitIdle(4000), "first turn drains");
            gs.ConvPumpPending();
            Assert.IsTrue(SpinUntil(() => hub.InFlightCount == 1, 2000), "queued second turn dispatched after the first");
            gate.Release();
            Assert.IsTrue(hub.WaitIdle(4000), "second turn drains");
        }

        // ---------------------------------------------------------------- escaping

        [Test]
        public void Reply_Text_Is_JSON_Escaped_In_Line()
        {
            var gs = NewGame(new IChatBackend[] { new EchoBackend("He said \"hi\"\nthen left") },
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "hello"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ConvFlush();

            string line = sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"crew\""));
            Assert.IsNotNull(line);
            StringAssert.Contains("\\\"hi\\\"", line, "quotes escaped");
            StringAssert.Contains("\\n", line, "newline escaped");
            StringAssert.DoesNotContain("\n", line.Replace("\\n", ""), "no raw newline breaks the JSON line");
        }

        // ---------------------------------------------------------------- llmstatus / chronicle

        [Test]
        public void LlmStatus_Offline_Golden()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out _, out _, out _);
            Assert.AreEqual(
                "{\"type\":\"llmstatus\",\"backend\":\"template\",\"degraded\":false,\"costPerHour\":0,\"inflight\":0,\"queued\":0}",
                gs.ConvStatusPayload());
        }

        [Test]
        public void Chronicle_Boot_Is_Empty_Day_List()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out _, out _, out _);
            Assert.AreEqual("{\"type\":\"chron\",\"days\":[]}", gs.ConvChroniclePayload());
        }

        [Test]
        public void Chronicle_Command_Emits_Payload()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out _, out var sent, out _);
            gs.ApplyForTest(new WebCommand(CmdKind.Chron));
            Assert.IsNotNull(sent.Find(m => m.Contains("\"type\":\"chron\"")), "the chron command broadcasts the log");
        }

        // ---------------------------------------------------------------- citizen card (was name-only)

        [Test]
        public void Citizen_Card_Now_Carries_Persona_Fields()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out var sent, out _);
            // Select a live crew member by navigating to its deck and clicking its tile —
            // ContextAction emits the identity card.
            Citizen c = null;
            foreach (var it in host.Sim.Citizens.Items) if (!it.Dead) { c = it; break; }
            Assert.IsNotNull(c, "the authored ship has a live crew member");

            gs.ApplyForTest(new WebCommand(CmdKind.Deck, i: c.Pos.Z)); // 0 → citizen's deck
            gs.ApplyForTest(new WebCommand(CmdKind.Cursor, c.Pos.X, c.Pos.Y));
            gs.ApplyForTest(new WebCommand(CmdKind.Click, c.Pos.X, c.Pos.Y));

            string card = sent.Find(m => m.Contains("\"type\":\"citizen\""));
            Assert.IsNotNull(card, "clicking a citizen emits its identity card");
            StringAssert.DoesNotContain("\"role\":\"\"", card, "role is now filled from the persona");
            StringAssert.DoesNotContain("\"traits\":[]", card, "traits are now filled from the persona");
            StringAssert.Contains("\"portrait\":\"pk_", card, "portrait is the ship+citizen persona key");
        }

        // ---------------------------------------------------------------- degrade / timeout / hardening

        [Test]
        public void Primary_Failure_Falls_Through_To_Template_And_Turn_Completes()
        {
            var gs = NewGame(new IChatBackend[] { new AlwaysErrorBackend(), new TemplateBackend() },
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "hello"));
            Assert.IsTrue(hub.WaitIdle(4000), "the turn completes via the template fallback");
            gs.ConvFlush();

            Assert.IsNotNull(sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"crew\"")), "the template answered after the primary failed");
            string status = gs.ConvStatusPayload();
            StringAssert.Contains("\"backend\":\"template\"", status, "degraded onto the fallback");
            StringAssert.Contains("\"degraded\":true", status);
        }

        [Test]
        public void Truncated_Stream_Dispatches_Nothing_And_Session_Recovers()
        {
            // A primary that streams text but never sends TurnComplete, with NO template terminator:
            // the observed-completion hardening must dispatch nothing and end the turn "error".
            var gs = NewGame(new IChatBackend[] { new TruncatingBackend() }, 0, TimeSpan.FromSeconds(60),
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            host.Minds.Minds.TryGet(cid, out var mind);

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "you are useless")); // would be a SetDisposition
            Assert.IsTrue(hub.WaitIdle(4000), "the truncated turn resolves (no completion)");
            gs.ConvFlush();

            StringAssert.Contains("\"reason\":\"error\"", sent.Find(m => m.Contains("\"ev\":\"end\"")) ?? "");
            host.Sim.Tick();
            Assert.AreEqual(0f, mind.AffinityToPlayer, "no effect was dispatched from the truncated stream");
            Assert.AreEqual(0, hub.InFlightCount, "InFlight cleared — the session is not wedged");
        }

        [Test]
        public void Hanging_Backend_Times_Out_Clears_InFlight_And_Next_Say_Works()
        {
            // A backend that never terminates, bounded by a short per-request timeout, no retries.
            var gs = NewGame(new IChatBackend[] { new HangingBackend() }, 0, TimeSpan.FromMilliseconds(200),
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));

            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "first"));
            Assert.IsTrue(hub.WaitIdle(4000), "the timeout fires and the turn resolves");
            Assert.AreEqual(0, hub.InFlightCount, "InFlight cleared after the timeout — no wedge");
            gs.ConvFlush();
            StringAssert.Contains("\"reason\":\"error\"", sent.Find(m => m.Contains("\"ev\":\"end\"")) ?? "");

            // The session is NOT ended by a timeout error? It is (reason error) — but a fresh talk
            // must work. Prove the runtime itself recovered: a new conversation dispatches again.
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 2, text: "second"));
            Assert.IsTrue(SpinUntil(() => hub.InFlightCount == 1, 2000), "a subsequent turn dispatches (runtime recovered)");
            Assert.IsTrue(hub.WaitIdle(4000), "and drains");
        }

        // ---------------------------------------------------------------- zero network

        [Test]
        public void Offline_Conversation_Never_Leaves_The_Template_Backend()
        {
            // The whole conversation runs against the in-process TemplateBackend — no HttpChat, no
            // socket, no provider. The status backend is "template" throughout: the game is fully
            // playable offline.
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "hello there"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ConvFlush();
            Assert.IsNotNull(sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"crew\"")), "the offline turn produced a crew line");
            StringAssert.Contains("\"backend\":\"template\"", gs.ConvStatusPayload());
            StringAssert.Contains("\"degraded\":false", gs.ConvStatusPayload());
        }

        // ---------------------------------------------------------------- B1: player line survives a failed turn

        [Test]
        public void Player_Line_Shows_Even_When_The_Turn_Fails()
        {
            // A truncating primary with NO template terminator: the turn ends "error" and no crew line
            // lands — but the player's own line was emitted at DISPATCH, so it still shows (they spoke).
            var gs = NewGame(new IChatBackend[] { new TruncatingBackend() }, 0, TimeSpan.FromSeconds(60),
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "are you there?"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ConvFlush();

            string playerLine = sent.Find(m => m.Contains("\"ev\":\"line\"") && m.Contains("\"who\":\"you\""));
            Assert.IsNotNull(playerLine, "the player line is emitted at dispatch, independent of the failed turn");
            StringAssert.Contains("are you there?", playerLine);
            Assert.IsNull(sent.Find(m => m.Contains("\"who\":\"crew\"")), "no crew line — the turn produced no completion");
        }

        // ---------------------------------------------------------------- B3: conversation log on the card

        [Test]
        public void Fresh_Citizen_Card_Has_An_Empty_Conversation_Log()
        {
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out var sent, out _);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Bio, cid: cid));
            string card = sent.Find(m => m.Contains("\"type\":\"citizen\""));
            Assert.IsNotNull(card, "the bio command re-emits the citizen card");
            StringAssert.Contains("\"log\":[]", card, "no conversations yet ⇒ empty log");
        }

        [Test]
        public void Conversation_Log_Accumulates_Completed_Exchanges_And_Rides_The_Card()
        {
            var gs = NewGame(new IChatBackend[] { new EchoBackend("The pumps hold.") },
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "status?"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ConvFlush();

            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Bio, cid: cid));
            string card = sent.Find(m => m.Contains("\"type\":\"citizen\""));
            Assert.IsNotNull(card, "bio re-requests the citizen card with the log");
            StringAssert.Contains("\"log\":[[\"you\",\"status?\"],[\"crew\",\"The pumps hold.\"]]", card);
        }

        // ---------------------------------------------------------------- B3 stretch: durable MEMS summary

        [Test]
        public void Ended_Conversation_Writes_One_Durable_Mems_Summary_On_The_Sim_Thread()
        {
            var gs = NewGame(new IChatBackend[] { new EchoBackend("Understood.") },
                out var host, out var sent, out var hub);
            uint cid = FirstCitizen(host);
            Assert.AreEqual(0, CountConversationMemories(host, cid), "no conversation memory before talking");

            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Say, sid: 1, text: "report"));
            Assert.IsTrue(hub.WaitIdle(4000));
            gs.ApplyForTest(new WebCommand(CmdKind.Bye, sid: 1)); // end the session (sim thread)
            gs.ConvPumpEndedSummaries();                          // the loop's sim-thread summary pump

            Assert.AreEqual(1, CountConversationMemories(host, cid), "one durable conversation memory at end");
            gs.ConvPumpEndedSummaries();
            Assert.AreEqual(1, CountConversationMemories(host, cid), "written exactly once (idempotent)");
        }

        [Test]
        public void Ended_Conversation_With_No_Exchange_Writes_No_Summary()
        {
            // talk → bye with nothing said: mirrors "failed turns leave no history".
            var gs = NewGame(new IChatBackend[] { new TemplateBackend() }, out var host, out _, out _);
            uint cid = FirstCitizen(host);
            gs.ApplyForTest(new WebCommand(CmdKind.Talk, cid: cid));
            gs.ApplyForTest(new WebCommand(CmdKind.Bye, sid: 1));
            gs.ConvPumpEndedSummaries();
            Assert.AreEqual(0, CountConversationMemories(host, cid), "an empty conversation records nothing");
        }

        // ---------------------------------------------------------------- helpers / fakes

        private static int CountConversationMemories(SimHost host, uint cid)
        {
            var into = new List<MemoryEntry>();
            host.Minds.GetTopMemories(cid, host.Sim.TickCount, "conversation", into, 64);
            return into.Count;
        }

        private static bool SpinUntil(Func<bool> cond, int ms)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            while (!cond()) { if (sw.ElapsedMilliseconds > ms) return false; Thread.Sleep(2); }
            return true;
        }

        /// <summary>A streaming backend that returns a fixed reply and no effects — for escaping.</summary>
        private sealed class EchoBackend : SyncChatBackend
        {
            private readonly string _reply;
            public EchoBackend(string reply) { _reply = reply; }
            public override BackendCapabilities Caps => new BackendCapabilities("echo", false, false, 4);
            public override ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult(_reply, new List<ProposedEffect>());
        }

        /// <summary>Streams a BackendError and never completes — a retryable primary failure.</summary>
        private sealed class AlwaysErrorBackend : IChatBackend
        {
            public BackendCapabilities Caps => new BackendCapabilities("boom", true, false, 4);
            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("", new List<ProposedEffect>());
#pragma warning disable CS1998
            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                ct.ThrowIfCancellationRequested();
                yield return new BackendError("boom", true); // no TurnComplete ⇒ failure
            }
#pragma warning restore CS1998
        }

        /// <summary>Streams text but never sends TurnComplete — the truncation the hardening rejects.</summary>
        private sealed class TruncatingBackend : IChatBackend
        {
            public BackendCapabilities Caps => new BackendCapabilities("trunc", true, false, 4);
            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("partial", new List<ProposedEffect>());
#pragma warning disable CS1998
            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                yield return new TextDelta("partial ");
                // deliberately no TurnComplete and no BackendError — a truncated stream
            }
#pragma warning restore CS1998
        }

        /// <summary>Never terminates until cancelled — exercises the per-request timeout.</summary>
        private sealed class HangingBackend : IChatBackend
        {
            public BackendCapabilities Caps => new BackendCapabilities("hang", true, false, 4);
            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("", new List<ProposedEffect>());
            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false); // cancelled by the hub's timeout
                yield break; // unreachable
            }
        }

        /// <summary>A backend whose stream blocks until Release() — for the in-flight/queue test.</summary>
        private sealed class GatedBackend : IChatBackend
        {
            private readonly System.Collections.Concurrent.BlockingCollection<bool> _gate
                = new System.Collections.Concurrent.BlockingCollection<bool>();
            public void Release() => _gate.Add(true);
            public BackendCapabilities Caps => new BackendCapabilities("gated", true, false, 4);
            public ChatResult Respond(ConversationRequest request, string playerUtterance)
                => new ChatResult("gated", new List<ProposedEffect>());

            public async IAsyncEnumerable<ChatDelta> SendAsync(
                ConversationRequest req, string utterance, [EnumeratorCancellation] CancellationToken ct)
            {
                await Task.Run(() => _gate.Take(ct), ct).ConfigureAwait(false);
                yield return new TextDelta("ok");
                yield return new TurnComplete(new TurnUsage(0, 0, 0, 0, "gated"));
            }
        }
    }
}
