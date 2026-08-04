using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-17 — THE COMMISSIONING VERB, THE PLAYTEST BLOCKER.</b>
    ///
    /// <para><b>THE PLAYER SENTENCE THIS FILE DRIVES:</b> <i>at the MOSS console the player types
    /// <c>commission</c> and — with the terminal repaired and a ControllerModule aboard — the
    /// terminal becomes COMMISSIONED: programs and the POD BAY unlock; a refusal is a rendered
    /// sentence with a named reason and a number.</i></para>
    ///
    /// <para>⛔ <b>WHAT WAS ACTUALLY MISSING WAS A SENDER, AND THAT IS WHY THE OUTCOME LEG ENDS AT
    /// THE POD BAY.</b> <c>CommissionDeviceCommand</c> has worked since E0-6, <c>build.def</c> has
    /// priced it at 1 module, and <c>GameSession.HandleCommission</c> has bridged the wire command
    /// since the build palette — but <b>no client and no TUI surface ever emitted it</b>, so the
    /// opening arc dead-ended one step before the bay and the M3 milestone demo had to commission
    /// through a temporary defs overlay at <c>commission_cost = 0</c>. A test that only asserted
    /// "the sim commissions when commanded" would therefore have been GREEN on the broken tree.
    /// <see cref="TypingCommission_CommissionsTheConsole_AndTheseTwoUnlock"/> starts at the typed op
    /// and finishes by asking the ship for the POD BAY <b>at the real price</b>.</para>
    ///
    /// <para><b>THE MUTATIONS, each physically applied, watched go RED for the right reason and
    /// reverted from an in-memory copy — never <c>git checkout</c> (trap 2):</b></para>
    /// <list type="number">
    /// <item>delete the <c>case "commission"</c> arm from <c>HandleMoss</c> (it rejoins
    ///       <c>default: break;</c>, the silent swallow) ⇒ the outcome leg AND every refusal leg</item>
    /// <item>drop <c>'commission'</c> from <c>parseCommand</c>'s nav list ⇒
    ///       <c>moss-model.test.js</c> (a client fact — the verb would answer UNKNOWN COMMAND)</item>
    /// <item>enqueue the command only when the verdict is allowed (a second, host-side gate) ⇒
    ///       <see cref="TheHostDoesNotDecide_ARefusedAskStillReachesTheSim"/></item>
    /// <item>charge the price BEFORE the "already commissioned" check ⇒
    ///       <see cref="ARefusalNeverBills"/> (the already-commissioned leg spends a second module)</item>
    /// <item>drop the ship gate (term 1) from <c>EvaluateCommission</c> ⇒ the not-repaired leg, which
    ///       would answer a TARGET-side sentence from a computer that is off</item>
    /// </list>
    /// </summary>
    public class WebCommissionTests
    {
        private const string Console = "term_moss";
        private const string ConsoleTid = "@console";
        private const string Rung1Pod = "pod_lindqvist";

        /// <summary>A paused session on the SHIPPING ship (<c>./play.sh</c>'s default) — no sim
        /// thread, so every tick below is one a test asked for.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        /// <summary>OD-N's MIDDLE state: the console RUNS (it would open a door) and is still not
        /// commissioned. 0.60 is one bare-handed service (<c>wear.def:18-20,61</c>).</summary>
        private static void RepairConsole(Simulation sim)
        {
            var term = Dev(sim, Console);
            Assert.That(term, Is.Not.Null, "the wreck must carry " + Console);
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "PRECONDITION: the wreck boots DARK (term_moss at 0.14, below Terminal maint 0.20). "
                + "If this is ever false the not-repaired leg measures nothing.");
            term.Condition = 0.60f;
            Assert.That(MossGate.IsServerLive(sim), Is.True, "the fixture must actually light MOSS");
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: and it is still UN-commissioned — that is the state the verb acts on");
        }

        /// <summary>Put one <see cref="ItemKind.ControllerModule"/> on the console's own tile — what
        /// the player's crafting chain produces (Regolith → Scrap → Parts → ControllerModule) and
        /// what the M3 demo had to fake with a cost-0 overlay.</summary>
        private static void StockOneModule(Simulation sim)
        {
            Assert.That(CommissionDeviceCommand.Affordable(sim), Is.EqualTo(0),
                "PRECONDITION: the wreck boots with NO loose ControllerModule — if it ever ships one, "
                + "the no-module refusal leg below is measuring an impossible state");
            sim.AddItem(ItemKind.ControllerModule, 1, Dev(sim, Console).Pos);
            Assert.That(CommissionDeviceCommand.Affordable(sim), Is.EqualTo(1),
                "the fixture must actually put a spendable module aboard");
        }

        private static void SendCommission(GameSession gs, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "commission", tid: tid));

        private static void SendPods(GameSession gs, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "pods", tid: tid));

        /// <summary>Every console-transcript sentence the session emitted, stream and all. Parsed off
        /// the WIRE rather than read from a field, so a handler that computed a verdict and emitted
        /// nothing cannot pass any leg below.</summary>
        private static List<(int Stream, string Text)> Transcript(List<string> sent)
        {
            var outp = new List<(int, string)>();
            foreach (var m in sent)
            {
                if (!m.Contains("\"ev\":\"exec\"", StringComparison.Ordinal)) continue;
                for (int stream = 0; stream <= 2; stream++)
                {
                    string open = "[" + stream.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"";
                    int i = m.IndexOf(open, StringComparison.Ordinal);
                    while (i >= 0)
                    {
                        int start = i + open.Length;
                        int end = m.IndexOf('"', start);
                        if (end > start) outp.Add((stream, m.Substring(start, end - start)));
                        i = m.IndexOf(open, start, StringComparison.Ordinal);
                    }
                }
            }
            return outp;
        }

        private static bool Said(List<string> sent, int stream, string sentence)
            => Transcript(sent).Any(l => l.Stream == stream && l.Text == sentence);

        // ══════════════════════════════════════════════════ 1. THE OUTCOME

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST.</b> Repaired console + one module aboard + the typed op ⇒ the
        /// terminal becomes <c>Scriptable</c>, the module is GONE, the console says so in words, and
        /// <b>the two things commissioning is for actually open</b>: the POD BAY answers with twelve
        /// rows where a moment earlier it refused, and <c>MossGate.CanInstallProgram</c> flips.
        ///
        /// <para>Driven end to end through the SHIPPING seams — the wire op, the real
        /// <c>CommissionDeviceCommand</c>, the real <c>build.def commission_cost = 1</c>. No overlay,
        /// no direct write to <c>Device.Scriptable</c>.</para>
        /// </summary>
        [Test]
        public void TypingCommission_CommissionsTheConsole_AndTheseTwoUnlock()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);
            StockOneModule(sim);
            var term = Dev(sim, Console);

            // BEFORE: the bay refuses, and it refuses by NAMING the missing module.
            SendPods(gs);
            Assert.That(Said(sent, 2, MossGate.NotCommissionedRefusal(null)), Is.True,
                "PRECONDITION: a repaired-but-uncommissioned console must already refuse the bay — "
                + "otherwise the 'unlock' below is a claim about a door that was open. Saw: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
            Assert.That(MossGate.CanInstallProgram(sim, Console), Is.False,
                "PRECONDITION: …and programs are shut too");

            sent.Clear();
            SendCommission(gs);
            sim.Tick();   // the command drain runs between ticks

            // 1. THE SIM MOVED.
            Assert.That(term.Scriptable, Is.True,
                "the typed op did not commission the console. Transcript: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
            Assert.That(CommissionDeviceCommand.Affordable(sim), Is.EqualTo(0),
                "the module was not consumed — commissioning is a SINK, not a toggle");

            // 2. THE PLAYER WAS TOLD, on the output stream and not the error stream. The literal is
            //    pinned here — a sentence read back through the function that composed it is not a
            //    pin, it is a tautology.
            const string accepted =
                "COMMISSION ACCEPTED — TERM_MOSS — 1 CONTROLLER MODULE FITTED; "
                + "PROGRAMS AND THE POD BAY ARE OPEN";
            Assert.That(Said(sent, 1, accepted), Is.True,
                "the console said nothing a player can read. Expected '" + accepted + "', saw: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
            Assert.That(accepted, Does.Contain("PROGRAMS AND THE POD BAY ARE OPEN"),
                "the sentence must name the two things that just unlocked — a bare ACCEPTED leaves "
                + "the player where the demo was, with no idea what to type next");

            // 3. THE TWO UNLOCKS ARE REAL, asked of the ship rather than asserted about the bit.
            Assert.That(MossGate.CanInstallProgram(sim, Console), Is.True,
                "programs are still refused after a successful commission");
            sent.Clear();
            SendPods(gs);
            string bay = sent.Find(m => m.Contains("\"ev\":\"pods\"", StringComparison.Ordinal));
            Assert.That(bay, Is.Not.Null,
                "the POD BAY still does not answer: " + string.Join(" | ", sent));
            int rows = 0;
            for (int i = bay.IndexOf("\"pod_", StringComparison.Ordinal); i >= 0;
                 i = bay.IndexOf("\"pod_", i + 1, StringComparison.Ordinal)) rows++;
            Assert.That(rows, Is.EqualTo(12),
                "the bay answered, but not with the wreck's twelve capsules: " + bay);
        }

        // ══════════════════════════════════════════════════ 2. THE REFUSALS

        /// <summary>
        /// ⭐ <b>EVERY REFUSAL IS A SENTENCE WITH A NAMED REASON — and, where one exists, A NUMBER.</b>
        /// Three legs, one for each term, each asserting the EXACT sentence off the wire and each
        /// re-checking that the ship did not move.
        ///
        /// <para><b>BLINDED (fifth trap).</b> <c>Assert</c> throws, so a multi-leg test reports only
        /// its first failure and a dead later leg is indistinguishable from a live one. Every leg
        /// records into <c>problems</c>; there is ONE assertion, at the end, plus a non-vacuity count.</para>
        /// </summary>
        [Test]
        public void EveryRefusalIsARenderedSentence_WithAReasonAndANumber()
        {
            var problems = new List<string>();
            int legs = 0;

            // ── term 1: THE SHIP. A DARK terminal refuses, with the SHIP's own sentence — never a
            //    target-side one. (Dropping term 1 from EvaluateCommission reddens exactly here.)
            {
                legs++;
                var gs = WreckSession(out var host, out var sent);
                StockOneModule(host.Sim);   // a module IS aboard: the refusal is about the terminal
                var term = Dev(host.Sim, Console);
                if (MossGate.IsServerLive(host.Sim))
                    problems.Add("not-repaired: fixture failed — MOSS is live at boot");
                SendCommission(gs);
                host.Sim.Tick();
                string offline = MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship);
                if (!Said(sent, 2, offline))
                    problems.Add("not-repaired: expected '" + offline + "', saw: "
                                 + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
                if (term.Scriptable) problems.Add("not-repaired: a DARK terminal was commissioned anyway");
                if (CommissionDeviceCommand.Affordable(host.Sim) != 1)
                    problems.Add("not-repaired: the module was spent on a refusal");
            }

            // ── term 3: THE PRICE. Repaired, nothing to fit. The number is the whole point:
            //    "SHIP HAS 0" is what tells the player to go and craft one.
            {
                legs++;
                var gs = WreckSession(out var host, out var sent);
                RepairConsole(host.Sim);
                var term = Dev(host.Sim, Console);
                if (CommissionDeviceCommand.Affordable(host.Sim) != 0)
                    problems.Add("no-module: fixture failed — a module is aboard");
                SendCommission(gs);
                host.Sim.Tick();
                // ⭐ THE SOURCE CLAUSE IS PART OF THE PIN (2026-08-04). Without it the sentence
                //    states a shortfall and answers nothing: the player is told the ship has 0
                //    and never told where a 1 comes from. `Said` is EXACT equality, so this
                //    literal is the shipped sentence, whole.
                const string expect = "COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0"
                                    + "; A MACHINE SHOP MAKES THEM FROM 2 PARTS";
                if (!Said(sent, 2, expect))
                    problems.Add("no-module: expected '" + expect + "', saw: "
                                 + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
                if (term.Scriptable) problems.Add("no-module: commissioned for free");
            }

            // ── term 2: THE TARGET. Already fitted — and it must NOT charge a second module.
            {
                legs++;
                var gs = WreckSession(out var host, out var sent);
                RepairConsole(host.Sim);
                var term = Dev(host.Sim, Console);
                term.Scriptable = true;
                StockOneModule(host.Sim);
                SendCommission(gs);
                host.Sim.Tick();
                const string expect =
                    "ALREADY COMMISSIONED — PROGRAMS AND THE POD BAY ARE OPEN ON TERM_MOSS";
                if (!Said(sent, 2, expect))
                    problems.Add("already: expected '" + expect + "', saw: "
                                 + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
                if (CommissionDeviceCommand.Affordable(host.Sim) != 1)
                    problems.Add("already: a second module was spent on a console that was done");
            }

            Assert.That(legs, Is.EqualTo(3), "PRECONDITION: all three refusal terms were driven");
            Assert.That(problems, Is.Empty,
                "the commissioning verb refused without saying why, or moved the ship while doing it. "
                + string.Join(" | ", problems));
        }

        /// <summary>
        /// ⛔ <b>A REFUSAL NEVER BILLS</b> — M3-3's contract, restated for this verb and driven rather
        /// than argued. The ITEM STORE is compared before and after every refused ask; the price is
        /// charged LAST inside <c>CommissionDeviceCommand.Execute</c>, so every rejection above it
        /// leaves the ship's matter untouched.
        ///
        /// <para>Mutation 4 (move the <c>TryPay</c> above the <c>Scriptable</c> check) reddens the
        /// already-commissioned leg.</para>
        /// </summary>
        [Test]
        public void ARefusalNeverBills()
        {
            var problems = new List<string>();

            foreach (var (label, arrange) in RefusalFixtures())
            {
                var gs = WreckSession(out var host, out var sent);
                arrange(host.Sim);
                StockOneModule(host.Sim);
                string before = MatterCensus(host.Sim);
                SendCommission(gs);
                host.Sim.Tick();
                string after = MatterCensus(host.Sim);
                if (before != after) problems.Add(label + ": " + before + " → " + after);
                if (!Transcript(sent).Any(l => l.Stream == 2))
                    problems.Add(label + ": refused silently — no stream-2 sentence at all");
            }

            Assert.That(problems, Is.Empty,
                "a refused commission spent the ship's matter. " + string.Join(" | ", problems));
        }

        /// <summary>The two refusals a module CAN be aboard for. (The no-module refusal cannot appear
        /// in this file's list by construction — its fixture is "no module aboard".)</summary>
        private static IEnumerable<(string Label, Action<Simulation> Arrange)> RefusalFixtures()
        {
            yield return ("NoServer (dark terminal)", _ => { });
            yield return ("AlreadyCommissioned", sim =>
            {
                RepairConsole(sim);
                Dev(sim, Console).Scriptable = true;
            });
        }

        /// <summary>Every loose stack aboard, in the sim's own canonical order — the store
        /// <c>LooseMatter.TryPay</c> drains. A string so a difference PRINTS what moved.</summary>
        private static string MatterCensus(Simulation sim)
        {
            var sb = new System.Text.StringBuilder();
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
                sb.Append(items[i].Kind).Append('×')
                  .Append(items[i].Count.ToString(System.Globalization.CultureInfo.InvariantCulture))
                  .Append(';');
            return sb.ToString();
        }

        // ══════════════════════════════════════════════════ 3. THE SEAM

        /// <summary>
        /// ⛔ <b>THE HOST DECIDES NOTHING ABOUT THE TARGET TERMS.</b> The console reads the gate to
        /// RENDER the answer and enqueues <see cref="CommissionDeviceCommand"/> <b>regardless</b> —
        /// the thaw op's construction exactly. Both halves matter: reading the gate is what puts a
        /// sentence on screen in the same frame as the keystroke, and enqueueing unconditionally is
        /// what stops the host becoming a second gate that a load, a replay or the TUI would
        /// disagree with.
        ///
        /// <para><b>PINNED AT THE SEAM, AND THE INSTRUMENT IS A WINDOW THAT CANNOT OPEN IN
        /// PRODUCTION (trap 4 — pin HOW the API was called, never a text scan).</b> The op is sent
        /// while the ship cannot pay, so the console RENDERS the refusal; then a module is put
        /// aboard <b>before the tick drains</b>. If the host had gated the enqueue there would be
        /// nothing in the inbox and the console would stay dark for ever; because it enqueued blind,
        /// the command that drains one moment later finds the module and does the work. A host-side
        /// gate is the only way this assertion can fail.</para>
        ///
        /// <para>⚠️ <b>THAT WINDOW IS A TEST ARTEFACT AND SAYING SO IS THE POINT.</b> In the shipping
        /// host <c>Apply</c> runs INSIDE the command drain, between ticks, so no system can move the
        /// ship between the gate's read and the command's execute and the two can never disagree.
        /// The window is forced here because the property being pinned — <i>the host is not a second
        /// gate</i> — is otherwise invisible: the command is a no-op on every refusal, so a gated
        /// enqueue and a blind one produce identical ships.</para>
        /// </summary>
        [Test]
        public void TheHostDoesNotDecide_ARefusedAskStillReachesTheSim()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);
            var term = Dev(sim, Console);

            SendCommission(gs);                       // the host renders: nothing to fit
            Assert.That(Said(sent, 2, "COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0"
                                    + "; A MACHINE SHOP MAKES THEM FROM 2 PARTS"), Is.True,
                "PRECONDITION: this ask must be the no-module refusal, or the window below is not "
                + "the one being measured");
            Assert.That(term.Scriptable, Is.False, "PRECONDITION: nothing has drained yet");

            // …and the ship can pay before the inbox drains.
            sim.AddItem(ItemKind.ControllerModule, 1, term.Pos);
            sim.Tick();

            Assert.That(term.Scriptable, Is.True,
                "the ask the host refused never reached the sim — the host has become a second gate, "
                + "which is the defect a load, a replay and the TUI would all disagree about");
            Assert.That(CommissionDeviceCommand.Affordable(sim), Is.EqualTo(0),
                "…and the command that ran must have paid for what it fitted");
        }

        /// <summary>⛔ THE OTHER HALF, so "enqueued blind" is never read as "accepted blind": when the
        /// window does NOT open — the ordinary case, and the only one production can produce — a
        /// refused ask leaves the console exactly as it found it.</summary>
        [Test]
        public void ARefusedAskThatStaysRefused_ChangesNothing()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);
            var term = Dev(sim, Console);

            SendCommission(gs);
            sim.Tick();

            Assert.That(term.Scriptable, Is.False,
                "a commission with no module aboard fitted one anyway: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
        }

        /// <summary>
        /// ⭐ <b>WHICH TERMINAL THE PROMPT MEANS.</b> The MOSS prompt addresses <c>@console</c>, a
        /// free-text key with no device behind it, so the SIM resolves the subject
        /// (<see cref="MossGate.LiveServer"/>) — and the sentence names it, or the player is told
        /// something happened to a machine they cannot identify.
        ///
        /// <para>Also the NON-VACUITY of the resolver: with MOSS dark it resolves nothing, so a green
        /// "it named term_moss" cannot come from a finder that names the first Terminal it sees.</para>
        /// </summary>
        [Test]
        public void ThePromptsPseudoTerminalResolvesToTheLiveConsole_AndTheSentenceNamesIt()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;

            Assert.That(MossGate.LiveServer(sim), Is.Null,
                "NON-VACUITY: on the DARK boot ship the resolver must name nothing — a finder that "
                + "returns the first Terminal regardless would pass every other leg in this file");

            RepairConsole(sim);
            StockOneModule(sim);
            Assert.That(MossGate.LiveServer(sim)?.Name, Is.EqualTo(Console),
                "the repaired terminal must be the one the prompt resolves to");

            SendCommission(gs);   // tid == "@console" — no device carries that name
            sim.Tick();
            Assert.That(Dev(sim, Console).Scriptable, Is.True,
                "a commission sent through the prompt's pseudo-terminal reached no console");
            Assert.That(Transcript(sent).Any(l => l.Stream == 1 && l.Text.Contains("TERM_MOSS", StringComparison.Ordinal)),
                Is.True,
                "the accepted sentence does not name the console it fitted: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
        }

        /// <summary>
        /// ⭐ <b>AND THE VERB IS AT THE REPAIRED TIER, NOT THE COMMISSIONED ONE</b> — the split's own
        /// bootstrap. A console that needed to be commissioned before it could be commissioned would
        /// make the whole opening arc unreachable, which is the exact shape of the blocker this
        /// package closes.
        ///
        /// <para>Driven as the contrast that makes it a claim: in ONE state (repaired,
        /// uncommissioned) the program op refuses and the commission op works.</para>
        /// </summary>
        [Test]
        public void TheCommissionVerbSitsAtTheREPAIREDTier_NotBehindItself()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);
            StockOneModule(sim);

            // The commissioned tier is SHUT in this state — the control that gives the leg meaning.
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: Console, text: "every 1s: nop"));
            Assert.That(Said(sent, 2, MossGate.NotCommissionedRefusal(Console)), Is.True,
                "PRECONDITION: in this exact state a PROGRAM must still be refused — otherwise the "
                + "two tiers are not distinguishable here and this test proves nothing");

            sent.Clear();
            SendCommission(gs);
            sim.Tick();
            Assert.That(Dev(sim, Console).Scriptable, Is.True,
                "the commissioning verb refused in the one state it exists for — a repaired, "
                + "un-commissioned console. Saw: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));
        }

        // ════════════════════════════ THE REFUSAL SAYS WHERE A MODULE COMES FROM (2026-08-04)
        //
        // ⛔ THE OWNER'S REPORT, LIVE PLAY 2026-08-03: *"there is still no way to defreeze others."*
        // `COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0` is a complete statement of a
        // shortfall and a complete non-answer to the only question it raises. The fact is ONE SCREEN
        // AWAY — MOSS's own `sys` lists a FABRICATION system with the machine shop in it — and a
        // player who does not already know the crafting chain has no route from one to the other.

        /// <summary>
        /// ⭐⭐ <b>THE APPENDED CLAUSE IS PINNED AGAINST THE RECIPE DEF, NOT AGAINST ITS OWN WORDS.</b>
        /// <c>recipes.def</c> is the authority — <c>MachineShop Parts 2 ControllerModule 1</c> — and
        /// the sentence is asserted to agree with it FIELD BY FIELD. A test that only read back the
        /// literal would go green the day content re-prices the module and the sentence started
        /// lying, which is the <c>BLOCKED_ORDER_NAMES</c> defect exactly (a hand-kept mirror, right
        /// when written, silently wrong four packages later).
        /// </summary>
        [Test]
        public void TheNoModuleRefusalSaysWhereAModuleCOMESFrom_AndAgreesWithTheRecipeDef()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);

            // The def this sentence has to agree with, read from the SHIPPED table.
            var recipe = sim.Defs.Recipes[(int)DeviceKind.MachineShop];
            Assert.That(recipe.Defined, Is.True, "recipes.def no longer gives the MachineShop a row");
            Assert.That(recipe.Output, Is.EqualTo(ItemKind.ControllerModule),
                "the MachineShop no longer makes the module — re-point this test at whatever does, "
                + "and check the sentence moved with it");

            SendCommission(gs);
            string said = Transcript(sent).Where(l => l.Stream == 2).Select(l => l.Text)
                                          .FirstOrDefault(t => t.StartsWith("COMMISSIONING NEEDS", StringComparison.Ordinal));
            Assert.That(said, Is.Not.Null, "no price refusal came back at all: "
                + string.Join(" | ", Transcript(sent).Select(l => l.Stream + ":" + l.Text)));

            StringAssert.Contains("MACHINE SHOP", said,
                "the refusal never names the machine that makes the thing it is refusing over. The "
                + "player is told the ship has 0 and left to find out where a 1 comes from. Said: " + said);
            StringAssert.Contains(recipe.InputCount.ToString(System.Globalization.CultureInfo.InvariantCulture)
                                  + " " + ThawGate.ItemWords(recipe.Input), said,
                "the clause does not state the recipe's own input — a player pricing the detour "
                + "cannot. Said: " + said);
        }

        /// <summary>
        /// ⛔⭐ <b>THE NO-HARD-CODE LEG: RE-POINT THE RECIPE AND THE SENTENCE MUST FOLLOW.</b> A
        /// clause with <c>"MACHINE SHOP"</c> typed into it passes the test above on the shipped defs
        /// and lies the moment content moves the recipe. Driven by handing the session's own gate a
        /// defs table in which the <c>Fabricator</c> makes the module, and requiring the sentence to
        /// name the FABRICATOR and NOT the machine shop.
        ///
        /// <para>Driven on <see cref="MossGate.DescribeCommission"/> directly rather than through the
        /// wire, because a <see cref="GameSession"/> cannot be handed a second defs table without
        /// rebuilding the ship — and the seam under test is the composer, which is where a literal
        /// would have to live.</para>
        /// </summary>
        [Test]
        public void TheSourceClauseIsDERIVED_MovingTheRecipeMovesTheSentence()
        {
            var defs = SimDefs.CreateDefault();
            // Move the module's production to another station, and leave nothing behind: two
            // producers would make "first match wins" the thing under test instead of the search.
            defs.Recipes[(int)DeviceKind.MachineShop] = default;
            defs.Recipes[(int)DeviceKind.Fabricator] =
                new RecipeDef(ItemKind.Scrap, 7, ItemKind.ControllerModule, 1, 900);

            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 7,
                                     SystemStack.CreateDefault(new Perilune.Dsl.ScriptRuntime(new Perilune.Dsl.DeviceRegistry())),
                                     defs);

            string said = MossGate.DescribeCommission(sim,
                new MossGate.CommissionVerdict(MossGate.CommissionRefusal.NoModule, Console, default, 1, 0));

            StringAssert.Contains("FABRICATOR", said,
                "the clause is a LITERAL, not a derivation — it named a station this ship's recipe "
                + "table does not use. Said: " + said);
            Assert.That(said, Does.Not.Contain("MACHINE SHOP"),
                "the clause still names the machine shop on a ship where the machine shop makes "
                + "nothing. Said: " + said);
            StringAssert.Contains("7 SCRAP", said,
                "the input count and item are literals too. Said: " + said);
        }

        /// <summary>The other end of the same derivation: a defs table in which NOTHING produces the
        /// module must append NO clause at all. A composer that fell back to a default sentence would
        /// point the player at a machine their ship cannot use — the fabricated-noun defect that the
        /// offline sentence's own degenerate arm refuses for the same reason.</summary>
        [Test]
        public void NoProducerAboardMeansNoClause_RatherThanAFabricatedOne()
        {
            var defs = SimDefs.CreateDefault();
            for (int i = 0; i < defs.Recipes.Length; i++)
                if (defs.Recipes[i].Defined && defs.Recipes[i].Output == ItemKind.ControllerModule)
                    defs.Recipes[i] = default;

            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 7,
                                     SystemStack.CreateDefault(new Perilune.Dsl.ScriptRuntime(new Perilune.Dsl.DeviceRegistry())),
                                     defs);

            string said = MossGate.DescribeCommission(sim,
                new MossGate.CommissionVerdict(MossGate.CommissionRefusal.NoModule, Console, default, 1, 0));

            Assert.That(said, Is.EqualTo("COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0"),
                "a ship whose defs make the module NOWHERE was still told where to make it: " + said);
        }
    }
}
