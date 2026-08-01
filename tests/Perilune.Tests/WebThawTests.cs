using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Perilune.Gen;   // AuthoredShips
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-3, THE HOST HALF — the reason reaches the player, and the host never decides.</b>
    ///
    /// <para>The thaw is a MOSS <b>screen</b> verb: a new <c>moss</c> op beside
    /// <c>sys</c>/<c>exec</c>/<c>open</c>/<c>set</c>/<c>audit</c>, carrying the console's <c>tid</c>
    /// and the capsule's name, lowering to a <see cref="ThawCommand"/>. Two claims live here and
    /// they are different claims:</para>
    /// <list type="number">
    /// <item>⛔ <b>MUTATION 7, THE SILENCE LEG.</b> Every refusal reaches the player as a SENTENCE.
    /// A designation the player cannot see is indistinguishable from a broken verb, and the
    /// RimWorld analogue this gate is built on (<c>rimworld-reference.md</c> §2.2) refuses at the
    /// point of the click and STATES THE REASON. ⇒
    /// <see cref="EveryRefusalReachesThePlayerAsASentence"/>.</item>
    /// <item>⛔ <b>MUTATION 4, THE SINGLE-AUTHORITY LEG (host half).</b> The sentence the host emits
    /// must be the SIM'S OWN verdict, byte for byte — not a second opinion assembled in
    /// <c>GameSession</c>. ⇒ <see cref="TheHostEmitsTheSimsVerdictVerbatim_AndNeverItsOwn"/>, which
    /// records the answer at the seam rather than scanning the source for a spelling (trap 4). The
    /// other half of mutation 4 is <c>ThawGateTests</c>'
    /// <c>AThawFromAnUnCommissionedConsole_IsRefusedBySimAlone</c>, which has no host at all.</item>
    /// </list>
    ///
    /// <para>⚠️ <b>THERE IS NO CLIENT SENDER FOR THIS OP YET AND THAT IS DEFERRED BY NAME.</b> The
    /// POD BAY is M3-4's and the browser beat belongs to M3-4 (its acceptance step 5 drives this
    /// package's cycle refusal) and M3-13 (its steps 0 and 2 drive the reasons). Recorded in
    /// <c>docs/MECHANICS.md</c> §13.30 as wired-but-not-connected, not hidden.</para>
    /// </summary>
    public class WebThawTests
    {
        private const string Console = "term_moss";
        private const string Rung1Pod = "pod_lindqvist";

        /// <summary>A paused session on the SHIPPING ship — no sim thread, so every tick below is
        /// one this test asked for.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static string ThawReply(List<string> sent)
            => sent.Find(m => m.Contains("\"ev\":\"thaw\""));

        /// <summary>The <c>reason</c> field of a thaw reply, unescaped enough for these sentences
        /// (they carry no quote and no backslash — asserted, so a future sentence that does cannot
        /// pass this reader silently).</summary>
        private static string ReasonOf(string json)
        {
            const string key = "\"reason\":\"";
            int i = json.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "no reason field in: " + json);
            int start = i + key.Length;
            int end = json.IndexOf('"', start);
            Assert.That(end, Is.GreaterThan(start), "empty or unterminated reason in: " + json);
            string value = json.Substring(start, end - start);
            Assert.That(value, Does.Not.Contain("\\"),
                "this reader cannot see through an escape; the sentence changed shape: " + json);
            return value;
        }

        // ══════════════════════════════════════════════════════════════ 1. the silence leg

        /// <summary>
        /// ⭐⭐ <b>MUTATION 7 — EVERY REFUSAL REACHES THE PLAYER AS A SENTENCE.</b>
        ///
        /// <para>The <see cref="ISimCommand"/> house style is a bare <c>return;</c> on refusal, and
        /// for a designate command that is correct — there is nothing to say. Here the reason is
        /// the FEATURE: <i>"THAW REFUSED — scrubbing covers 3 of 4"</i> is what makes the gate a
        /// screen instead of a locked door. ⇒ replacing the reply in <c>GameSession.HandleMoss</c>'s
        /// <c>thaw</c> case with a bare <c>return;</c> reddens this test on every reason at once.</para>
        ///
        /// <para><b>ONE ASSERTION OVER MANY LEGS</b> (fifth trap shape): a per-reason
        /// <c>Assert</c> would throw on the first failure and leave the rest unexercised.</para>
        /// </summary>
        [Test]
        public void EveryRefusalReachesThePlayerAsASentence()
        {
            var problems = new List<string>();
            var codesSeen = new HashSet<int>();

            foreach (var (label, arrange, pod) in ThawGateTests.RefusalFixtures())
            {
                var gs = WreckSession(out var host, out var sent);
                arrange(host.Sim);

                var expected = ThawGate.Evaluate(host.Sim, Console, pod);
                if (expected.Allowed) { problems.Add(label + ": the fixture did not refuse"); continue; }

                gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "thaw", tid: Console, text: pod));

                string reply = ThawReply(sent);
                if (reply == null)
                {
                    problems.Add(label + ": the refusal was SILENT — no moss/thaw reply at all");
                    continue;
                }
                codesSeen.Add((int)expected.Reason);
                if (!reply.Contains("\"ok\":false")) problems.Add(label + ": a refusal replied ok:true — " + reply);
                if (!reply.Contains("\"why\":" + (int)expected.Reason))
                    problems.Add(label + ": the machine-readable reason code is missing or wrong — " + reply);
                string reason = ReasonOf(reply);
                if (reason.Length == 0) problems.Add(label + ": the reason is EMPTY — " + reply);
                if (!reply.Contains("\"pod\":\"" + pod + "\""))
                    problems.Add(label + ": the reply does not say which capsule it is about — " + reply);
            }

            // NON-VACUITY, by inclusion: distinct CODES, not a count of loop iterations. Eight
            // fixtures that all produced the same refusal would prove one sentence, not eight.
            Assert.That(codesSeen.Count, Is.GreaterThanOrEqualTo(6),
                "only " + codesSeen.Count + " DISTINCT refusal codes were exercised; the silence "
                + "claim is only as wide as the reasons behind it");
            Assert.That(problems, Is.Empty,
                "a refusal the player cannot see is indistinguishable from a broken verb. "
                + string.Join(" | ", problems));
        }

        // ═══════════════════════════════════════════════════════ 2. the single-authority leg

        /// <summary>
        /// ⭐⭐ <b>MUTATION 4 (host half) — THE HOST EMITS THE SIM'S VERDICT, VERBATIM.</b>
        ///
        /// <para>It would be very easy to check "is this terminal alive?" in
        /// <c>GameSession.HandleMoss</c>, where the device is already in hand. <b>Do not.</b> A
        /// host-side check is not replayed on load, not folded into the hash and not present in the
        /// TUI — so the same thaw would be legal on one surface and refused on another.</para>
        ///
        /// <para><b>RECORDED AT THE SEAM, NOT BY A TEXT SCAN</b> (trap 4). The verdict
        /// <see cref="ThawGate.Evaluate"/> returns for the same inputs is computed independently
        /// here and compared to the sentence and the code that came off the wire. Any second
        /// opinion in the host — a different message, an earlier return, a re-ordered term —
        /// separates the two.</para>
        ///
        /// <para><b>AND THE HOST MUST ENQUEUE THE COMMAND EITHER WAY.</b> The second half of the
        /// same claim: if the host declined to enqueue on a verdict it disliked, THAT would be the
        /// host deciding. The accepted leg proves the enqueue lands; the refused leg proves the
        /// command that landed refused on its own, in the sim, at the tick boundary.</para>
        /// </summary>
        [Test]
        public void TheHostEmitsTheSimsVerdictVerbatim_AndNeverItsOwn()
        {
            // ── the refused case: the SHIPPING ship, whose console boots un-commissioned ──────
            var gs = WreckSession(out var host, out var sent);
            var term = host.Sim.Devices.Items.First(d => d.Name == Console);
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: " + Console + " boots UN-commissioned — otherwise this measures nothing");
            // ⚠️ ADDED BY M3-4. The host now asks the SHIP gate (`MossGate.IsServerLive`) before it
            // evaluates anything — ship before target, M3-15's ordering — and the shipping wreck
            // boots DARK. Without this line the op refuses with the OFFLINE sentence and never
            // reaches term 2, so this test would be measuring the ship gate under a name that says
            // it is measuring the console term. The state below is OD-N's middle one: the console
            // RUNS and is still not commissioned.
            ThawGateTests.RepairConsole(host.Sim);

            var simVerdict = ThawGate.Evaluate(host.Sim, Console, Rung1Pod);
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "thaw", tid: Console, text: Rung1Pod));

            string reply = ThawReply(sent);
            Assert.That(reply, Is.Not.Null, "the thaw op emitted nothing at all");
            Assert.That(ReasonOf(reply), Is.EqualTo(ThawGate.Describe(simVerdict)),
                "the host said something the sim's own gate did not. There is exactly ONE "
                + "implementation of the six terms and it lives in Sim.Core.");
            Assert.That(reply, Does.Contain("\"why\":" + (int)simVerdict.Reason));
            Assert.That(reply, Does.Contain("\"tid\":\"" + Console + "\""));

            // The command landed even though the host's own read was a refusal: the sim decides.
            var pod = host.Sim.Devices.Items.First(d => d.Name == Rung1Pod);
            host.Sim.Tick();
            Assert.That(pod.Progress, Is.EqualTo(0f), "the sim accepted a thaw it had just refused");

            // ── the accepted case: same session, one ControllerModule later ──────────────────
            sent.Clear();
            term.Scriptable = true;
            var accepted = ThawGate.Evaluate(host.Sim, Console, Rung1Pod);
            Assert.That(accepted.Allowed, Is.True,
                "the armed wreck must accept its rung-1 thaw; it said: " + ThawGate.Describe(accepted));

            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "thaw", tid: Console, text: Rung1Pod));
            string ok = ThawReply(sent);
            Assert.That(ok, Is.Not.Null, "the accepted thaw emitted nothing at all");
            Assert.That(ok, Does.Contain("\"ok\":true"));
            Assert.That(ReasonOf(ok), Is.EqualTo(ThawGate.Describe(accepted)));

            host.Sim.Tick();
            Assert.That(pod.Progress, Is.GreaterThan(0f),
                "the host reported an accepted thaw and the capsule never started — the op is "
                + "enqueueing nothing, or enqueueing it somewhere the sim never drains");
        }

        /// <summary>
        /// The thaw op must not have become reachable from the MOSS command PROMPT. The prompt
        /// grants no authority the DSL adapters do not already have (IX-M40) and no adapter exists
        /// for a <c>CryoPod</c> — so a typed <c>thaw</c> line is an ordinary unknown verb.
        /// </summary>
        [Test]
        public void TheConsolePrompt_CannotThaw()
        {
            var gs = WreckSession(out var host, out var sent);
            host.Sim.Devices.Items.First(d => d.Name == Console).Scriptable = true;
            var pod = host.Sim.Devices.Items.First(d => d.Name == Rung1Pod);

            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "exec", tid: Console, text: "thaw " + Rung1Pod));
            host.Sim.Tick();

            Assert.That(pod.Progress, Is.EqualTo(0f),
                "a line typed at the MOSS prompt started a cryo cycle. The prompt inherits its "
                + "authority from the DSL adapters and there is no CryoPod adapter — a thaw verb "
                + "there would be the one verb granting authority the DSL withholds.");
            Assert.That(ThawReply(sent), Is.Null, "the prompt must not answer as the thaw screen");
        }
    }
}
