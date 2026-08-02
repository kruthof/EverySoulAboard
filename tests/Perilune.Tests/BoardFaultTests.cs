using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WebCommand, CmdKind
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-16 (OD-O) — THE MALFUNCTIONING BOARD: A PUZZLE INSIDE MOSS.</b>
    ///
    /// <para><b>THE PLAYER'S SENTENCE.</b> Today MOSS is a remote control: every device answers one
    /// verb and the language is decoration. After this ONE machine on the ship does not answer its
    /// switch, and the only way to get the upper deck breathing is to write a two-line MOSS
    /// program.</para>
    ///
    /// <para><b>THE OWNER'S DECISION, cited (OD-O, <c>ROADMAP.md</c> §5, 2026-07-31):</b>
    /// <i>"Let's make that a 'game' within MOSS, so the user has to do some simple programming to
    /// activate the vent — storyline could be that the easy turn-off switch does not work as the
    /// controller module is malfunctioning so we have to do a workaround."</i> Scoped by three
    /// follow-ups: the vent is re-authored mechanically FINE with its board dead and needs no crewed
    /// repair · the path is PROGRAM-ONLY (no spend-a-module-to-replace-the-board alternative) ·
    /// ⛔ <b>it is NOT a general pattern</b> — <i>"an idea we can apply sometimes as a game
    /// element"</i>. The last of those is the census leg below, and it is a test rather than a
    /// convention.</para>
    ///
    /// <para>⛔ <b>THE THREE MOVES, AND THE MIDDLE ONE IS THE WHOLE DESIGN.</b>
    /// <c>open vent_d1</c> → <c>CONTROLLER FAULT — BOARD UNRESPONSIVE</c> ·
    /// <c>set vent_d1.rate max</c> → ACCEPTED, the hall's pressure ticks up 0.197 kPa and STALLS ·
    /// <c>every 1s: set(vent_d1.rate, max)</c> installed on the commissioned terminal → the hall
    /// pressurises past breathable and stays there. The puff in move 2 is a DIAGNOSIS, not a
    /// failure: without it the refusal and the program are two unrelated facts, and the puzzle
    /// becomes a walkthrough. ⚠️ <b>The natural wrong answer — <c>when …:</c> — is part of the
    /// design and must not be "fixed"</b>: <c>when</c> is an edge and fires ONCE (a property of the
    /// shipped interpreter, <c>Interpreter.cs:50-51</c>), so the hall stalls again. <i>`when` is an
    /// edge, `every` is a heartbeat</i> is the one thing this puzzle teaches.</para>
    ///
    /// <para>⛔ <b>THERE IS NO CALLER PRIVILEGE.</b> <c>open</c>/<c>close</c> refuse for EVERY
    /// caller; <c>set(rate, …)</c> is accepted by every caller and does not HOLD. See
    /// <see cref="DeviceFault"/>'s remarks — a fault that let a program call <c>open()</c> while the
    /// console could not would be a permission invented from nothing, and the workaround is a
    /// different control driven in a loop rather than the same control with better credentials.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS ITS OWN <c>[Test]</c></b> (the fifth trap shape: <c>Assert</c>
    /// throws, so a dead second leg is indistinguishable from a live one) — most sharply for the two
    /// reporting surfaces, which are deliberately two tests and not two assertions.</para>
    ///
    /// <para>⚠️ <b>EVERY PRESSURE FLOOR IS ABSOLUTE kPa, NEVER A RATIO</b> (the seventh trap: a
    /// suite built from ratios is blind to a scale error). 80 kPa is M3-11's own floor, restated by
    /// hand here rather than imported, so the two files pin the same number independently.</para>
    ///
    /// <para><b>M3-11's own claims — the vent's power, the dead deck at boot, an AirVent filling its
    /// own room — stay in <c>Deck1VentTests</c>, which this package re-cut. Nothing here duplicates
    /// them.</b></para>
    /// </summary>
    public class BoardFaultTests
    {
        private const string VentName = "vent_d1";
        private const string CryoVentName = "vent_cryo";
        private const string Console = "term_moss";
        private const string ConsoleTid = "@console";
        private const string HallAnchor = "hall_d1_s0";

        /// <summary>What a bare-hands service leaves on a terminal — enough to clear
        /// <c>Terminal.maint</c> (0.20) and light <see cref="MossGate.IsServerLive"/>.</summary>
        private const float BareHandsService = 0.60f;

        /// <summary>The workaround, exactly as a player types it into the PROGRAM screen.</summary>
        private const string LoopProgram = "every 1s:\n  set(vent_d1.rate, max)\n";
        /// <summary>The natural wrong answer. <c>when</c> is an edge latch, so this fires once.</summary>
        private const string WhenProgram = "when hall_d1_s0.pressure < 80:\n  set(vent_d1.rate, max)\n";

        /// <summary>A floor tile inside <c>hall_d1_s0</c>, clear of the device row. Written out, not
        /// derived — the same literal <c>Deck1VentTests</c> pins.</summary>
        private static readonly Int3 HallFloor = new Int3(5, 3, 1);

        /// <summary>⭐ AN ABSOLUTE kPa FLOOR, NEVER A RATIO (seventh trap). M3-11's own number,
        /// restated by hand so the two files agree by measurement and not by import.</summary>
        private const double BreathableFloorKPa = 80.0;
        /// <summary>"Still 0.000 kPa" with a hair of slack.</summary>
        private const double DeadDeckCeilingKPa = 0.001;
        /// <summary>M3-11's window: 3 000 ticks = 300 sim-seconds at 10 Hz.</summary>
        private const int OneWindow = 3000;
        /// <summary>⛔ TWO of M3-11's windows — the charter's own ceiling for the loop, and the
        /// number the bleed constant was tuned against. MEASURED: the loop crosses 80 kPa at tick
        /// 4 063 on the shipping ship.</summary>
        private const int TwoWindows = 6000;

        /// <summary>⭐ THE PUFF'S BAND, and BOTH ends are the assertion. MEASURED at 0.197 kPa: one
        /// prompt line spends 1 + 0.75 + 0.5 + 0.25 = 2.5 passes of injection before the bleed
        /// reaches zero. The lower bound says the line was ACCEPTED and visible on the gauge; the
        /// upper says it is nowhere near a fix. A bleed retuned at either end breaks one of them.
        /// </summary>
        private const double PuffFloorKPa = 0.05;
        private const double PuffCeilingKPa = 5.0;

        // ------------------------------------------------------------------------ fixtures

        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation BootWreck()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();   // two power balance passes: topology + Powered
            return sim;
        }

        /// <summary>A wreck plus the MOSS registry the DSL resolves names through — the shape the
        /// program legs need, and the one the console legs get from <c>SimHost</c> for free.</summary>
        private static (Simulation Sim, ScriptRuntime Moss, DeviceRegistry Registry) BootWreckWithMoss()
        {
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), SystemStack.CreateDefault(moss));
            for (int i = 0; i < 20; i++) sim.Tick();
            MossBindings.RegisterAdapters(sim, registry);
            return (sim, moss, registry);
        }

        private static Device Named(Simulation sim, string name)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Name == name);
            Assert.IsNotNull(d, "--ship wreck no longer authors a device called '" + name + "'");
            return d;
        }

        /// <summary>Light MOSS. ⛔ EVERY LEG BELOW THAT DRIVES A COMMAND MUST CALL THIS FIRST: OD-N
        /// gates <see cref="SetDeviceStateCommand"/> on <see cref="MossGate.IsServerLive"/>, so on
        /// the boot ship nothing moves for a reason that has nothing to do with a dead board, and a
        /// leg that skipped it would be measuring the SHIP gate under this package's name.</summary>
        private static void RepairConsole(Simulation sim)
        {
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "PRECONDITION: the wreck boots DARK");
            Named(sim, Console).Condition = BareHandsService;
            Assert.That(MossGate.IsServerLive(sim), Is.True,
                "the fixture must actually light MOSS, or every refusal below is OD-N's and not OD-O's");
        }

        /// <summary>Repair AND commission — exactly what a <c>CommissionDeviceCommand</c> does for
        /// one <c>ControllerModule</c>, done directly so a fixture failure can never be mistaken for
        /// a puzzle failure.</summary>
        private static void CommissionConsole(Simulation sim)
        {
            RepairConsole(sim);
            var term = Named(sim, Console);
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: " + Console + " must boot UN-commissioned — that is the term the "
                + "sequencing leg exists to switch off");
            term.Scriptable = true;
        }

        private static double PressureAt(Simulation sim, Int3 tile) =>
            sim.Rooms.RoomAt(sim.World, tile).PressureKPa;

        private static string F(double v) => v.ToString("F3", CultureInfo.InvariantCulture);

        // ══════════════════════════════════════════════ 0. the fixture says what it is

        /// <summary>
        /// The premises every leg below rests on. ⚠️ Each is a way this file could be quiet for the
        /// wrong reason: a vent that is not faulted, not operational, not at rate 0, or not
        /// MOSS-addressable at all would make some leg pass without measuring anything.
        /// </summary>
        [Test]
        public void TheFixtureIsTheShipThisFileDescribes()
        {
            var (sim, _, registry) = BootWreckWithMoss();
            var vent = Named(sim, VentName);
            var offenders = new List<string>();

            if (!vent.Faulted) offenders.Add(VentName + " does not carry the OD-O fault");
            if (vent.Rate != 0f) offenders.Add($"{VentName} boots at Rate {F(vent.Rate)}, not 0");
            if (!vent.IsOperational(sim.Defs))
                offenders.Add($"{VentName} is not operational (Condition {F(vent.Condition)}) — the beat is " +
                              "'the machine is fine, the board is dead', and half of that is missing");
            if (!vent.IsOpen) offenders.Add(VentName + " boots SHUT");
            if (!vent.Powered) offenders.Add(VentName + " boots UNPOWERED");
            if (!registry.TryResolve(VentName, out _))
                offenders.Add(VentName + " is not in the MOSS registry, so no program and no typed line " +
                              "can reach it and the puzzle is unsolvable rather than hard");
            if (Named(sim, CryoVentName).Faulted)
                offenders.Add(CryoVentName + " is ALSO faulted — it is this file's control for " +
                              "'a healthy device still answers', and a faulted control proves nothing");

            Assert.That(offenders, Is.Empty,
                "--ship wreck is not the ship this file describes:\n  " + string.Join("\n  ", offenders));
        }

        // ══════════════════════════════════════ 1. MUTATION 1 — the switch is dead, AT THE COMMAND

        /// <summary>
        /// ⛔⭐ <b>MUTATION 1 — THE DIRECT VERB IGNORES THE FAULT ⇒ THIS REDDENS.</b> The shutter
        /// does not move for <see cref="SetDeviceStateCommand"/> itself.
        ///
        /// <para>⚠️ <b>DRIVEN AT THE COMMAND, WITH NO HOST IN THE PICTURE</b> (M3-15 mutation 1's
        /// shape). A leg that went through the console could not tell a sim gate from a host gate,
        /// and the whole reason the predicate lives in the command is that the TUI, the scenario
        /// host, the deprecated cursor and MOSS itself all arrive here.</para>
        ///
        /// <para>⚠️ <b>BOTH DIRECTIONS, AND A NON-VACUITY CONTROL.</b> <c>close</c> on the vent as it
        /// ships, and <c>open</c> on the same vent after the AUTHORING path has shut it (a field
        /// write, which is not a command and must stay ungated — the <c>SetDoorStateCommand</c>
        /// precedent). The control is <c>vent_cryo</c>, a healthy vent on the same ship taking the
        /// same command in the same tick: without it a green here would also be produced by a
        /// command that stopped working, by a dark MOSS server, or by a device store that no longer
        /// resolves ids.</para>
        /// </summary>
        [Test]
        public void TheDirectCommandWillNotMoveAFaultedShutter_AndSTILLMovesAHealthyOne()
        {
            var sim = BootWreck();
            RepairConsole(sim);
            var vent = Named(sim, VentName);
            var control = Named(sim, CryoVentName);
            var offenders = new List<string>();

            Assert.That(vent.IsOpen, Is.True, "PRECONDITION: the faulted vent ships OPEN, so `close` is a " +
                                              "gesture that would visibly change something");
            Assert.That(control.IsOpen, Is.True, "PRECONDITION: the control vent is open too");

            // --- close, on the faulted machine and on the healthy one, in the same tick.
            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, open: false));
            sim.EnqueueCommand(new SetDeviceStateCommand(control.Id, open: false));
            sim.Tick();
            if (!vent.IsOpen)
                offenders.Add(VentName + " CLOSED on a direct SetDeviceStateCommand. Its controller board " +
                              "is dead: the switch must do nothing for any caller");
            if (control.IsOpen)
                offenders.Add("CONTROL FAILED: " + CryoVentName + " did not close either, so this leg proves " +
                              "nothing about the fault — the command, the ship gate or the device store is " +
                              "what is broken");

            // --- open, on a faulted machine the AUTHORING path has shut. The field write must land
            //     (authoring is not a command) and the command must still refuse to undo it.
            vent.IsOpen = false;
            Assert.That(vent.IsOpen, Is.False,
                "PRECONDITION: a FIELD write must still shut a faulted vent — the fault gates the " +
                "COMMAND, and gating the field would re-author every ship that ever loads a save");
            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, open: true));
            sim.Tick();
            if (vent.IsOpen)
                offenders.Add(VentName + " OPENED on a direct SetDeviceStateCommand — the refusal covers " +
                              "`close` but not `open`, so half the switch still works");

            Assert.That(offenders, Is.Empty,
                "the dead board answered its switch:\n  " + string.Join("\n  ", offenders));
        }

        // ══════════════════════════════════ 2. MUTATION 3 — TWO SURFACES, TWO BLINDED [Test]s

        /// <summary>
        /// ⛔⭐ <b>MUTATION 3, SURFACE 1 of 2 — REFUSE WITH A BARE <c>return;</c>, OR LET THE ADAPTER
        /// ANSWER <c>true</c> AND DO NOTHING ⇒ THIS REDDENS.</b> The console's stream-2 error line
        /// carries the SENTENCE, not merely a <c>false</c>.
        ///
        /// <para>⚠️ Its own <c>[Test]</c>, blinded from surface 2 (the fifth trap): <c>Assert</c>
        /// throws, so a dead second surface inside one test would be invisible.</para>
        ///
        /// <para>⚠️ The assertion is on the RENDERED TEXT, and it also asserts what the reply is NOT:
        /// a <c>QUEUED OPEN(VENT_D1)</c> over a shutter that never moved is the
        /// invisible-feedback defect wearing a green hat, and it is the exact failure an adapter
        /// that returned <c>true</c> would produce.</para>
        /// </summary>
        [Test]
        public void Surface1_TheConsoleSaysWhyTheBoardWillNotAnswer()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);      // NOT started ⇒ no sim thread
            RepairConsole(host.Sim);

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "exec", tid: ConsoleTid, text: "open " + VentName));
            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));

            Assert.IsNotNull(reply, "the console answered NOTHING to `open " + VentName + "`. Silence is " +
                                    "indistinguishable from a broken prompt.");
            StringAssert.Contains(DeviceFault.Refusal, reply,
                "the console refused WITHOUT SAYING WHY, or said something else. The player is looking at a " +
                "machine that is powered, open and undamaged; the sentence is the only thing that tells " +
                "them the board is what is wrong. Reply was: " + reply);
            StringAssert.Contains("[2,", reply, "the refusal must ride the ERROR stream, not output");
            Assert.That(reply, Does.Not.Contain("QUEUED"),
                "the console reported the line as QUEUED. An adapter that answers true and enqueues " +
                "nothing is the invisible-feedback defect with a green hat: the player is told the " +
                "shutter moved and it did not.");
            Assert.That(reply, Does.Not.Contain(MossGate.OfflineRefusal),
                "the SHIP gate answered instead of the board. MOSS is repaired here; sending the player " +
                "to fix a terminal that is already fine is the wrong machine on the wrong deck.");
        }

        /// <summary>
        /// ⛔⭐ <b>MUTATION 3, SURFACE 2 of 2 — the same refusal inside a PROGRAM raises an
        /// <c>AlarmRaisedEvent</c> carrying the sentence.</b> An installed program has no transcript
        /// to read; the alarm is the only thing a player sees, and <c>ScriptRuntime</c> publishes it
        /// only because <c>TryInvoke</c> returned <c>false</c> with an error string.
        ///
        /// <para>⚠️ Its own <c>[Test]</c>, blinded from surface 1.</para>
        /// </summary>
        [Test]
        public void Surface2_AProgramsRefusedOpenRaisesAnAlarmCarryingTheSentence()
        {
            var (sim, moss, _) = BootWreckWithMoss();
            CommissionConsole(sim);

            var diags = moss.SetProgram(Console, "every 1s:\n  open(" + VentName + ")\n");
            Assert.That(diags.Count, Is.EqualTo(0),
                "fixture: the program must COMPILE, or the alarm below would be a compile failure " +
                "wearing the fault's name: " + string.Join(" | ", diags.Select(d => d.Message)));

            string alarm = null;
            for (int t = 0; t < 40 && alarm == null; t++)
            {
                sim.Tick();
                foreach (var a in sim.Events.Read<AlarmRaisedEvent>())
                    if (a.Message != null && a.Message.Contains("CONTROLLER FAULT")) { alarm = a.Message; break; }
            }

            Assert.IsNotNull(alarm,
                "a program's refused open() raised NO alarm naming the fault. Inside a program there is no " +
                "transcript: a bare `return;` in the command, or an adapter that answers true, leaves the " +
                "player with a script that runs forever and changes nothing.");
            StringAssert.Contains(DeviceFault.Refusal, alarm,
                "the alarm does not carry the shipped sentence");
            Assert.That(Named(sim, VentName).IsOpen, Is.True,
                "…and the vent must be exactly as it was: it ships open, and nothing here should have " +
                "moved it either way");
        }

        // ══════════════════════════════════════ 3. THE SPLIT — set(rate) is accepted by everybody

        /// <summary>
        /// ⭐⭐ <b>THE SPLIT'S OWN LEG AT THE ADAPTER: <c>set(rate, …)</c> IS ACCEPTED ON A FAULTED
        /// DEVICE.</b> ⛔ <b>MUTATION 2 (charter) — make the fault block programs too ⇒ this
        /// reddens, and so does every leg below it.</b>
        ///
        /// <para>This is the package's whole claim in one assertion: the switch is dead for
        /// everybody, the RATE is writable by everybody, and the difference between them is what
        /// turns a permission into a puzzle. Gating <c>set</c> here would delete the workaround and
        /// leave the vent simply unusable.</para>
        ///
        /// <para>⛔ <b>MUTATION 8 (review send-back) — NARROW THE ADAPTER'S GATE TO ONE VERB
        /// (<c>verb == "open" &amp;&amp; …</c>) ⇒ THIS REDDENS, naming <c>close</c>.</b> Nothing in the
        /// suite saw that before: <c>open</c> and <c>close</c> share one <c>case</c> fallthrough, and
        /// every leg above drove only <c>open</c>.</para>
        /// </summary>
        [Test]
        public void TheFaultRefusesTheSwitchButNotTheRate_AtTheAdapter()
        {
            var (sim, _, registry) = BootWreckWithMoss();
            RepairConsole(sim);
            Assert.That(registry.TryResolve(VentName, out var scriptable), Is.True);

            // ⛔⭐ BOTH HALVES OF THE SWITCH, AND EACH REPORTS FOR ITSELF. `open` and `close` reach
            // the gate through one `case` fallthrough, so a check narrowed to a single verb
            // (`verb == "open" && …`) leaves the other one answering TRUE and enqueueing a command
            // the sim then refuses: the console prints `QUEUED CLOSE(VENT_D1)` over a shutter that
            // never moved. That is the invisible-feedback defect on the very verb OD-O's sentence
            // names — "the easy turn-off switch does not work" — and the vent ships OPEN, so `close`
            // is the gesture a player reaches for FIRST. Driving only `open` here left that mutation
            // green across the whole suite.
            // ⚠️ COLLECTED, NOT CHAINED (the fifth trap): `Assert` throws, so a `close` leg written
            // after the `open` assertions would be invisible whenever the `open` leg fails.
            var switchOffenders = new List<string>();
            foreach (string verb in new[] { "open", "close" })
            {
                if (scriptable.TryInvoke(verb, Array.Empty<DslValue>(), 0, out string verbError))
                    switchOffenders.Add("`" + verb + "` was ACCEPTED on a faulted device. The adapter " +
                                        "answers true and enqueues a command the sim refuses, so the " +
                                        "caller is TOLD the shutter moved and it did not");
                else if (verbError != DeviceFault.Refusal)
                    switchOffenders.Add("`" + verb + "` was refused with \"" + verbError + "\" rather than " +
                                        "the SHIPPED sentence \"" + DeviceFault.Refusal + "\"");
            }
            Assert.That(switchOffenders, Is.Empty,
                "the dead board answered part of its switch:\n  " + string.Join("\n  ", switchOffenders));

            var args = new[] { DslValue.Text("rate"), DslValue.Text("max") };
            Assert.That(scriptable.TryInvoke("set", args, 2, out string setError), Is.True,
                "the adapter REFUSED `set(rate, max)` on a faulted device: " + setError + ". That deletes " +
                "the workaround — OD-O's fault is a dead switch, not a dead device.");

            // ⚠️ THE EFFECT IS MEASURED AS INJECTED GAS, NOT AS A SURVIVING `Rate`, AND THAT IS A
            // CORRECTION THE MUTATION HARNESS FORCED. Reading `vent.Rate > 0` after a tick couples
            // this leg to `FaultedRateBleedPerPass`: at a one-pass bleed the write lands, is SPENT,
            // and reads 0 again — so retuning the bleed reddened a test that is not about tuning.
            // The hall's pressure moving off 0.000 proves the write reached the device for ANY
            // bleed, and the constant is owned by its own two legs.
            double before = PressureAt(sim, HallFloor);
            sim.Tick(); sim.Tick();   // AtmosphereSystem's IntervalTicks is 2
            Assert.That(PressureAt(sim, HallFloor), Is.GreaterThan(before),
                "the rate write did not land at all — the hall took no gas, so `accepted` meant nothing");
        }

        // ══════════════════════════ 4. MUTATION 7a — the loop fills the hall (and MUTATION 2's floor)

        /// <summary>
        /// ⭐⭐ <b>THE PUZZLE IS SOLVABLE, AND THE SOLUTION IS THE TWO-LINE PROGRAM.</b> Install
        /// <c>every 1s: set(vent_d1.rate, max)</c> on a commissioned <c>term_moss</c> through the
        /// REAL player path (the host's <c>moss/set</c> op), tick, and <c>hall_d1_s0</c> crosses an
        /// ABSOLUTE 80 kPa floor inside two of M3-11's 3 000-tick windows and stays there.
        ///
        /// <para>⛔ <b>MUTATION 2 — the fault blocks programs too ⇒ RED HERE</b>, and this is the
        /// leg that makes that mutation a failure rather than a design choice.
        /// ⛔ <b>MUTATION 7, FIRST HALF — bleed to zero in ONE pass</b> ⇒ the loop becomes a 10 %
        /// duty cycle, the fill takes ~20 000 ticks and this window fails.</para>
        ///
        /// <para>⚠️ <b>DRIVEN THROUGH <c>GameSession</c>, NOT <c>ScriptRuntime.SetProgram</c>.</b>
        /// The player's install goes through the host op that consults
        /// <see cref="MossGate.CanInstallProgram"/>, compiles, installs AND enqueues the canonical
        /// <see cref="SetScriptCommand"/>; driving the runtime directly would skip the two gates
        /// that the sequencing leg below is about and would prove the puzzle solvable on a ship
        /// where it is not.</para>
        ///
        /// <para>⚠️ <b>AN ABSOLUTE kPa FLOOR, NEVER A RATIO</b> (seventh trap), and the crossing tick
        /// is reported in the failure text so a retune of the bleed is diagnosable rather than
        /// merely red.</para>
        /// </summary>
        [Test]
        public void TheTwoLineProgramFillsTheHallPastTheBreathableFloor()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;
            for (int i = 0; i < 20; i++) sim.Tick();
            CommissionConsole(sim);

            double before = PressureAt(sim, HallFloor);
            Assert.That(before, Is.LessThanOrEqualTo(DeadDeckCeilingKPa),
                "control: " + HallAnchor + " must start at 0.000 kPa, or this leg measures nothing");

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: Console, text: LoopProgram));
            Assert.That(sink.Any(m => m.Contains("\"ev\":\"diag\"")), Is.True,
                "the host answered no diagnostics, so the program was never compiled — the install was " +
                "refused and what follows would be about a ship with no program on it");
            Assert.That(sink.Any(m => m.Contains(MossGate.NotCommissionedRefusal(Console))), Is.False,
                "the install was refused as un-commissioned; the fixture failed, not the puzzle");

            int crossed = -1;
            for (int t = 0; t < TwoWindows; t++)
            {
                sim.Tick();
                if (crossed < 0 && PressureAt(sim, HallFloor) >= BreathableFloorKPa) crossed = t + 1;
            }
            double after = PressureAt(sim, HallFloor);

            Assert.That(crossed, Is.GreaterThan(0),
                $"{HallAnchor} reached only {F(after)} kPa in {TwoWindows} ticks with the two-line program " +
                $"installed, under the floor of {F(BreathableFloorKPa)} kPa. Either the fault is refusing " +
                "`set(rate, …)` as well as the switch — which deletes the workaround and makes the puzzle " +
                "unsolvable — or the bleed has been retuned so hard that an `every 1s` loop cannot keep up.");
            Assert.That(after, Is.GreaterThanOrEqualTo(BreathableFloorKPa),
                $"{HallAnchor} crossed at tick {crossed} and fell back to {F(after)} kPa. The program is a " +
                "HEARTBEAT: it must hold the compartment, not merely touch the floor once.");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, HallFloor), Is.True,
                "the hall has air and is still not WORKABLE — the player solved the puzzle and got a gauge " +
                "rather than a place");
        }

        // ══════════════════════════════════ 5. MUTATION 7b — one typed line is a puff, and no more

        /// <summary>
        /// ⭐⭐ <b>MOVE 2, THE TEACHING MOMENT: ONE TYPED LINE IS A VISIBLE PUFF AND THEN NOTHING.</b>
        /// <c>set vent_d1.rate max</c> is ACCEPTED, the hall's pressure ticks up 0.197 kPa, and 3 000
        /// ticks later it has not moved again.
        ///
        /// <para>⛔ <b>MUTATION 7, SECOND HALF — a bleed gentle enough that the one-shot suffices</b>
        /// ⇒ the ceiling below reddens. ⛔ <b>And a bleed that zeroes the rate BEFORE the injection
        /// pass</b> ⇒ the floor reddens, because there would be no puff at all. <b>Both ends are
        /// failures and only a driven number distinguishes them</b>, which is why this is a BAND and
        /// not a <c>&gt; 0</c>.</para>
        ///
        /// <para>⛔ <b>THIS LEG IS THE ONE A REVIEWER WILL WANT TO DELETE AS REDUNDANT.</b> Without
        /// the puff, the refusal and the program are two unrelated facts and the player is following
        /// a walkthrough instead of making an inference: the puff is the evidence that the board
        /// does not HOLD its setting, and the loop is the obvious answer to that sentence. The
        /// charter forbids deleting it.</para>
        ///
        /// <para>⚠️ Its own <c>[Test]</c>, blinded from the loop leg above: the two halves of the
        /// tuning mutation must be able to fail separately, or a bleed retuned in one direction
        /// would be reported as the other.</para>
        /// </summary>
        [Test]
        public void OneTypedLineIsAVisiblePuff_AndThenTheBoardLetsItGo()
        {
            var sim = BootWreck();
            RepairConsole(sim);
            var vent = Named(sim, VentName);

            Assert.That(PressureAt(sim, HallFloor), Is.LessThanOrEqualTo(DeadDeckCeilingKPa),
                "control: the hall must start at 0.000 kPa");

            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, rate: 1f));
            for (int t = 0; t < OneWindow; t++) sim.Tick();
            double puff = PressureAt(sim, HallFloor);

            Assert.That(puff, Is.GreaterThan(PuffFloorKPa),
                $"{HallAnchor} holds {F(puff)} kPa after one `set rate max` and {OneWindow} ticks. The line " +
                "must be ACCEPTED and must visibly move the gauge before the board lets the setting go — a " +
                "line that changes nothing at all reads as a second refusal, and the player learns nothing " +
                "from it.");
            Assert.That(puff, Is.LessThan(PuffCeilingKPa),
                $"{HallAnchor} holds {F(puff)} kPa from ONE typed line. The bleed is too gentle: the single " +
                "line is becoming the fix, and the two-line program the beat exists to teach is optional.");
            Assert.That(vent.Rate, Is.EqualTo(0f),
                $"{VentName} still holds Rate {F(vent.Rate)} after {OneWindow} ticks — a dead board that " +
                "keeps its setting is not a dead board");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, HallFloor), Is.False,
                "a worker may be staged in the hall after one typed line — the puff opened the frontier and " +
                "the puzzle is decorative");
        }

        /// <summary>
        /// ⭐ <b>THE NATURAL WRONG ANSWER IS PART OF THE DESIGN, AND IT MUST KEEP FAILING.</b>
        /// <c>when hall_d1_s0.pressure &lt; 80: set(vent_d1.rate, max)</c> is what a first-time
        /// programmer reaches for. <c>when</c> is EDGE-LATCHED (<c>Interpreter.cs:50-51</c>), so it
        /// fires ONCE and the latch never re-arms while the condition stays true — the hall stalls
        /// at the same 0.197 kPa puff. <i>`when` is an edge, `every` is a heartbeat</i> is the one
        /// thing this puzzle teaches, and it is teachable in two attempts.
        ///
        /// <para>⛔ <b>DO NOT "FIX" THIS.</b> It is a property of the shipped interpreter, not
        /// something M3-16 built; a lane that made <c>when</c> re-fire would delete the lesson and
        /// would move every installed program in the repo. This test exists so that change cannot
        /// happen quietly.</para>
        /// </summary>
        [Test]
        public void TheWhenVariantFiresOnce_AndTheHallStallsAgain()
        {
            var (sim, moss, _) = BootWreckWithMoss();
            CommissionConsole(sim);

            var diags = moss.SetProgram(Console, WhenProgram);
            Assert.That(diags.Count, Is.EqualTo(0),
                "fixture: the `when` variant must COMPILE — a lesson nobody can type is not a lesson: " +
                string.Join(" | ", diags.Select(d => d.Message)));

            for (int t = 0; t < TwoWindows; t++) sim.Tick();
            double after = PressureAt(sim, HallFloor);

            Assert.That(after, Is.GreaterThan(PuffFloorKPa),
                $"the `when` program never fired at all ({F(after)} kPa) — the lesson is that it fires ONCE, " +
                "not that it is rejected, and a rule that never runs teaches nothing about edges");
            Assert.That(after, Is.LessThan(PuffCeilingKPa),
                $"{HallAnchor} holds {F(after)} kPa under the `when` variant, so the edge latch is re-arming " +
                "and the wrong answer now works. That deletes the one thing this puzzle teaches, and it " +
                "moves the behaviour of every `when` block in every installed program in the repo.");
        }

        // ══════════════════════════════════ 6. MUTATION 5 — OD-N sequencing: not solvable early

        /// <summary>
        /// ⛔⭐ <b>MUTATION 5 — THE PUZZLE IS SOLVABLE PRE-COMMISSION ⇒ THIS REDDENS.</b> OD-N's
        /// split gate: a REPAIRED <c>term_moss</c> opens doors one typed line at a time, but
        /// installing a PROGRAM costs a <c>ControllerModule</c>. Until it is fitted the workaround
        /// cannot be installed, and the upper deck stays at 0.000 kPa.
        ///
        /// <para>⚠️ <b><c>Scriptable == false</c> IS ASSERTED FIRST, OR THE LEG IS VACUOUS</b> — a
        /// terminal that booted commissioned would make "the hall stayed dead" a statement about
        /// some other failure entirely.</para>
        ///
        /// <para>⚠️ And the SHIP gate is opened first, so what refuses here is demonstrably the
        /// COMMISSION tier and not <see cref="MossGate.OfflineRefusal"/> — the evaluation-order
        /// contract, from the other side.</para>
        /// </summary>
        [Test]
        public void ThePuzzleIsNotSolvableBeforeTheTerminalIsCommissioned()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;
            for (int i = 0; i < 20; i++) sim.Tick();
            RepairConsole(sim);   // ⇒ the SHIP gate is OPEN; only the commission tier is left

            Assert.That(Named(sim, Console).Scriptable, Is.False,
                "PRECONDITION: " + Console + " must boot UN-commissioned, or this leg is vacuous");
            int scriptsBefore = sim.Scripts.Count;

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: Console, text: LoopProgram));

            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(reply, "the install answered NOTHING — E0-6's silent `return;` reached the player");
            StringAssert.Contains(MossGate.NotCommissionedRefusal(Console), reply,
                "the refusal does not name the CONTROLLER MODULE the player has to go and make");
            Assert.That(reply, Does.Not.Contain(DeviceFault.Refusal),
                "the console blamed the VENT's board for a refusal that is about the TERMINAL — the player " +
                "would go and stare at a machine on the dead deck");

            for (int t = 0; t < TwoWindows; t++) sim.Tick();

            Assert.That(sim.Scripts.Count, Is.EqualTo(scriptsBefore),
                "a program was installed on an un-commissioned terminal");
            Assert.That(PressureAt(sim, HallFloor), Is.LessThanOrEqualTo(DeadDeckCeilingKPa),
                $"{HallAnchor} holds {F(PressureAt(sim, HallFloor))} kPa after {TwoWindows} ticks with no " +
                "program installed. The puzzle solved itself before the player earned the tool, and OD-N's " +
                "sequencing — repair opens the console, commission opens programs — is gone.");
        }

        // ══════════════════════════════════════ 7. MUTATION 4 — EXACTLY ONE, and the census sees

        /// <summary>THE MATCHER. Both the census and its inclusion control call this ONE function,
        /// so "the census would catch a second fault" is proved about the code the census runs.</summary>
        private static List<string> FaultedDevices(Simulation sim, string ship)
        {
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Faulted)
                    offenders.Add($"{ship}: {devices[i].Name} ({devices[i].Kind})");
            return offenders;
        }

        /// <summary>
        /// ⛔⭐ <b>MUTATION 4 — A SECOND DEVICE GROWS A FAULT "WHILE WE'RE HERE" ⇒ THIS REDDENS.</b>
        /// OD-O item (iii) is the whole point: <i>"not a pattern for all devices — it's an idea we
        /// can apply sometimes as a game element."</i> M3 ships EXACTLY ONE faulted device, on
        /// <c>--ship wreck</c>, and ZERO on perilune / slice / grid.
        ///
        /// <para>⚠️ <b>ONE ASSERT OVER ALL FOUR SHIPS</b>, so a second fault on <c>slice</c> cannot
        /// hide behind one on <c>grid</c>, and every offender is NAMED rather than counted.</para>
        ///
        /// <para>⚠️ The three pinned ships are asserted separately from the wreck for a reason that
        /// is not tidiness: a fault on any of them would move P1/P2/P3, so a green here is also the
        /// standing evidence that the new hashed bit is fold-neutral on every pinned ship.</para>
        /// </summary>
        [Test]
        public void ExactlyOneFaultedDeviceInTheGame_AndItIsTheDeckOneVent()
        {
            var offenders = new List<string>();
            var census = new List<string>();

            var wreck = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            var onWreck = FaultedDevices(wreck, "wreck");
            census.Add($"wreck: {wreck.Devices.Items.Count} devices, {onWreck.Count} faulted");
            if (onWreck.Count != 1)
                offenders.Add($"--ship wreck carries {onWreck.Count} faulted devices, not exactly 1: " +
                              string.Join(", ", onWreck));
            else if (onWreck[0] != "wreck: " + VentName + " (AirVent)")
                offenders.Add($"the wreck's one faulted device is {onWreck[0]}, not {VentName} (AirVent)");

            foreach (var (name, plan) in new (string, ShipPlan)[]
                     {
                         ("grid", AuthoredShips.PeriluneGrid()),
                         ("slice", AuthoredShips.PeriluneSlice()),
                         ("perilune", AuthoredShips.Perilune()),
                     })
            {
                var sim = ShipPlanBuilder.Build(plan, Stack());
                Assert.That(sim.Devices.Items.Count, Is.GreaterThan(0),
                    $"fixture: --ship {name} boots with no devices, so the census says nothing about it");
                var found = FaultedDevices(sim, name);
                census.Add($"{name}: {sim.Devices.Items.Count} devices, {found.Count} faulted");
                offenders.AddRange(found.Select(f => f + " — this ship is behind a determinism pin"));
            }

            Assert.That(offenders, Is.Empty,
                "OD-O ships ONE authored fault and it is not a pattern (item iii). A second instance is " +
                "this package failing, not this package generalising — and on grid/slice/perilune it is " +
                "also a re-pin of P1/P2/P3.\ncensus: " + string.Join(" · ", census) +
                "\noffenders:\n  " + string.Join("\n  ", offenders));
        }

        /// <summary>
        /// ⭐ <b>THE CENSUS' NON-VACUITY, AS AN INCLUSION TEST</b> (the fourth trap shape, and
        /// <c>AuthoredDamageTests</c>' own precedent). Plant a second fault in a real plan and
        /// require the SAME matcher to NAME it. "The matcher walked 1250 devices and found one"
        /// proves it ran; only planting the violation proves it would see it.
        /// </summary>
        [Test]
        public void TheFaultCensus_Catches_APlantedSecondFault()
        {
            var plan = AuthoredShips.PeriluneWreck();
            int at = plan.Devices.Count / 2;
            var spec = plan.Devices[at];
            string name = spec.Name;
            Assert.That(spec.Faulted.HasValue, Is.False,
                "fixture: the planted device must not already author a fault, or nothing was planted");
            spec.Faulted = true;
            plan.Devices[at] = spec;   // struct: write it back or the mutation evaporates

            var found = FaultedDevices(ShipPlanBuilder.Build(plan, Stack()), "wreck");
            Assert.That(found.Count, Is.EqualTo(2),
                "the census must return the shipped fault AND the planted one: " + string.Join(", ", found));
            Assert.That(found.Any(f => f.Contains(name)), Is.True,
                "…and it must NAME the device it caught: " + string.Join(", ", found));
        }

        // ══════════════════════════════════════ 8. the hashed bit, and the save chapter

        /// <summary>A one-room bench with one device, so the hash legs cannot pass because some
        /// other device on a big ship happened to agree.</summary>
        private static Simulation Bench()
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 42UL,
                                     SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.AirVent, new Int3(3, 2, 0), "bench");
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>
        /// ⛔⭐ <b>THE PIN ARGUMENT, DRIVEN RATHER THAN ARGUED — AND THE NON-VACUITY CONTROL IS THE
        /// HALF THAT MATTERS.</b> <c>| (d.Faulted ? 1UL &lt;&lt; 12 : 0)</c> is byte-identical to
        /// the pre-M3-16 word while the bit is false, which is why P1/P2/P3 do not move. That claim
        /// is worthless on its own: a term that was never folded at all would satisfy it too.
        ///
        /// <para>⇒ THREE legs, in this order: two identical builds agree · setting the bit on ONE
        /// device MOVES the hash (the control — the bit is really folded) · CLEARING it returns the
        /// hash EXACTLY (the neutrality — false costs nothing, to the bit).</para>
        ///
        /// <para>⛔ <b>MUTATION: delete the <c>1UL &lt;&lt; 12</c> term</b> ⇒ the middle leg reddens
        /// and the determinism canary goes blind to a field the save carries.</para>
        /// </summary>
        [Test]
        public void TheFaultBitIsFoldNeutralWhileFalse_AndMovesTheHashWhenSet()
        {
            var a = Bench();
            var b = Bench();
            ulong baseline = a.StateHash();
            Assert.That(b.StateHash(), Is.EqualTo(baseline), "premise: the twins start identical");

            var d = b.Devices.Items.First(x => x.Name == "bench");
            Assert.That(d.Faulted, Is.False, "premise: a device with no authored fault boots unfaulted");

            d.Faulted = true;
            Assert.That(b.StateHash(), Is.Not.EqualTo(baseline),
                "NON-VACUITY: setting Faulted did not move StateHash, so bit 12 is not folded at all. A " +
                "saved field the hash cannot see makes the determinism canary blind to it — and 'P1/P2/P3 " +
                "did not move' would then be true for the wrong reason.");

            d.Faulted = false;
            Assert.That(b.StateHash(), Is.EqualTo(baseline),
                "NEUTRALITY: clearing Faulted must return the hash to the digit. If it does not, the term " +
                "is not byte-identical while false and every ship in the repo is a re-pin.");
        }

        /// <summary>
        /// <c>Faulted</c> must not ALIAS a neighbour in the packed state word. The single-field probe
        /// above catches an alias onto a bit that is SET (<c>Scriptable</c>, true on a fresh device;
        /// <c>Powered</c>, true on a live bench) because the flag then becomes invisible. It cannot
        /// catch an alias onto a bit that is CLEAR — the flag still moves a bit, just the wrong one —
        /// so this leg adds CONSTRUCTED COLLISION PAIRS whose two states are bit-identical under the
        /// named alias and differ at HEAD.
        ///
        /// <para>NAMED MUTATIONS: change the shift to <c>11</c> (the Scriptable pair reddens); change
        /// it to <c>9</c> (the IsLocked pair reddens).</para>
        /// </summary>
        [Test]
        public void TheFaultBitDoesNotAliasItsNeighbours()
        {
            // PAIR 1 — against IsLocked (bit 9, CLEAR on a fresh device). Under a 12→9 alias both
            // states read "bit 9 set, nothing else moved".
            var p = Bench(); var q = Bench();
            var pd = p.Devices.Items.First(x => x.Name == "bench");
            var qd = q.Devices.Items.First(x => x.Name == "bench");
            pd.IsLocked = true;  pd.Faulted = false;
            qd.IsLocked = false; qd.Faulted = true;
            Assert.That(p.StateHash(), Is.Not.EqualTo(q.StateHash()),
                "COLLISION: 'locked with a live board' and 'unlocked with a dead board' are different " +
                "ships. If they hash equal, Faulted is sharing IsLocked's bit.");

            // PAIR 2 — against Scriptable (bit 11, SET on a fresh device).
            var r = Bench(); var t = Bench();
            var rd = r.Devices.Items.First(x => x.Name == "bench");
            var td = t.Devices.Items.First(x => x.Name == "bench");
            rd.Scriptable = true;  rd.Faulted = false;
            td.Scriptable = false; td.Faulted = true;
            Assert.That(r.StateHash(), Is.Not.EqualTo(t.StateHash()),
                "COLLISION: 'commissioned with a live board' and 'un-commissioned with a dead board' " +
                "must not hash equal");
        }

        /// <summary>
        /// DEVC v6 round-trip, and the harder half: save → load → tick 1000 → compare. A restore that
        /// dropped the flag would hash equal at load only if the flag were unhashed — it is hashed,
        /// so the failure is immediate and by name. The run-on leg is kept because a chapter that
        /// desynchronises the stream can produce a load that looks fine and diverges later.
        ///
        /// <para>NAMED MUTATION: delete <c>w.Write(d.Faulted);</c> from <c>SaveWriter.WriteDevices</c>
        /// ⇒ the reader desynchronises the DEVC stream and the load throws or hashes differently
        /// immediately.</para>
        /// </summary>
        [Test]
        public void TheFaultSurvivesASaveRoundTrip_AndAThousandTicksAfterIt()
        {
            var sim = Bench();
            sim.Devices.Items.First(x => x.Name == "bench").Faulted = true;
            for (int t = 0; t < 50; t++) sim.Tick();

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.Read(blob, SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

            Assert.That(loaded.Devices.Items.First(x => x.Name == "bench").Faulted, Is.True,
                "the fault came back off the disk as FALSE — a saved game would silently repair the one " +
                "machine the beat is about, and the player's program would become unnecessary mid-session");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "twin hashes MATCH at load");

            // A load leaves RoomState dirty, so the loaded sim takes a room recompute on its first
            // tick that the uninterrupted twin does not, and RemapGas perturbs gas at ULP scale (a
            // pre-existing defect, HANDOVER "Save-reload thermal ULP drift"). Both sims are made to
            // take the identical recompute so the run-on is about the RESTORE.
            sim.Rooms.MarkDirty();
            for (int t = 0; t < 1000; t++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "twin hashes MATCH a thousand ticks later — no derived state was dropped");
        }

        /// <summary>
        /// A PRE-v6 DEVC chapter loads with every device UNFAULTED. Unlike v5's asymmetry this is
        /// both the behaviour-preserving read and the historically accurate one: nothing could author
        /// a fault before M3-16, so no pre-v6 save can contain one. Driven against a hand-built v5
        /// buffer, because no writer in the tree can emit v5 any more and a compat branch nothing can
        /// reach is a branch nothing can test.
        ///
        /// <para>NAMED MUTATION: drop the <c>version &gt;= 6</c> guard in <c>SaveReader.ReadDevices</c>
        /// ⇒ the reader consumes a byte that is not there and the read throws.</para>
        /// </summary>
        [Test]
        public void APreV6DeviceChapter_LoadsEveryDeviceUnfaulted()
        {
            var buffer = new MemoryStream();
            using (var w = new BinaryWriter(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);                          // count
                w.Write(9_100u);                     // id, high so it cannot collide with the bench's
                w.Write((byte)DeviceKind.GrowBed);
                w.Write(2); w.Write(2); w.Write(0);  // pos
                w.Write("legacy_bed");
                w.Write(false); w.Write(false); w.Write(true); // IsOpen / IsLocked / Powered
                w.Write(1f);                         // Rate
                w.Write(0f);                         // StoredKWh
                w.Write((ushort)0);                  // NetworkId
                w.Write(0f); w.Write(0f); w.Write((ushort)0); // v2
                w.Write(1f);                         // v3 Condition
                w.Write((byte)0);                    // v4 LockOwner
                w.Write(true);                       // v5 Scriptable
                // ...and NOTHING for v6. This is the whole point.
            }
            buffer.Position = 0;

            var sim = Bench();
            using (var r = new BinaryReader(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
                SaveReader.ReadDevices(sim, r, version: 5);

            var legacy = sim.Devices.Items.First(x => x.Name == "legacy_bed");
            Assert.That(legacy.Faulted, Is.False,
                "a pre-v6 device loaded FAULTED. No save written before M3-16 can contain a fault, so " +
                "reading one is inventing a dead board on a machine that never had one.");
        }

        // ══════════════════════════════════════════════════ 9. the sentence, as shipped

        /// <summary>
        /// The refusal's WORDS, pinned where they are produced. <c>ThawGateTests
        /// .TheConsoleSentences_ArePairwiseDistinct</c> pins that this sentence does not read like
        /// the other three the console can print; this pins that the sentence is the one the charter
        /// and the owner's fiction agreed on, and that it names the BOARD rather than the machine.
        /// </summary>
        [Test]
        public void TheRefusalNamesTheBoard_AndIsTheShippedWording()
        {
            Assert.That(DeviceFault.Refusal, Is.EqualTo("CONTROLLER FAULT — BOARD UNRESPONSIVE"),
                "the refusal's wording is pinned in three places (here, ThawGateTests' family test and " +
                "MossGate's own remarks); move it in all three or in none");
            Assert.That(DeviceFault.Refusal, Is.EqualTo(DeviceFault.Refusal.ToUpperInvariant()),
                "the console upper-cases every stream-2 line, so a mixed-case constant would be one " +
                "string in the source and another on the screen");
            StringAssert.Contains("BOARD", DeviceFault.Refusal,
                "the sentence must name the BOARD. The machine is powered, open and undamaged; a refusal " +
                "that only says 'no' sends the player to repair a vent that has nothing wrong with it.");
        }
    }
}
