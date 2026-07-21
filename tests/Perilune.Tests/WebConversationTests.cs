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
        {
            host = SimHost.Build(SimHost.DefaultSeed);
            var captured = new List<string>();
            sent = captured;
            hub = new ConversationHub(host, captured.Add, chain, () => Now, 0m, null);
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
            string line = sent.Find(m => m.Contains("\"ev\":\"line\""));
            Assert.IsNotNull(line, "an authoritative crew line lands");
            StringAssert.Contains("\"who\":\"crew\"", line);
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

            string line = sent.Find(m => m.Contains("\"ev\":\"line\""));
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
            Assert.IsNotNull(sent.Find(m => m.Contains("\"ev\":\"line\"")), "the offline turn produced a line");
            StringAssert.Contains("\"backend\":\"template\"", gs.ConvStatusPayload());
            StringAssert.Contains("\"degraded\":false", gs.ConvStatusPayload());
        }

        // ---------------------------------------------------------------- helpers / fakes

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
