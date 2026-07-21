using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W3: the MOSS terminal wire bridge — the moss serializers (source/diag/audit/rterror)
    /// and the GameSession op handling (open/set/audit + unknown-op, rterror transitions,
    /// set-applies-at-a-tick-boundary). Serializer shape is pinned on fixed data (independent
    /// of compiler wording); the real MossCompiler drives the multi-error and end-to-end paths.
    /// </summary>
    public class WebMossTests
    {
        private const string TermHydro = "term_hydro"; // the one authored terminal on the ship
        private const string ValidProgram = "every 5s:\n  open(door_storage)\n";

        // ---------------------------------------------------------------- serializer shape

        [Test]
        public void MossSource_Serializes_Text_And_Hash()
        {
            string s = WireFormat.MossSource("term_x", "every 1s:\n  open(d)\n");
            uint expected = (uint)ScriptRuntime.Fnv1a32("every 1s:\n  open(d)\n");
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"source\",\"tid\":\"term_x\"," +
                "\"text\":\"every 1s:\\n  open(d)\\n\",\"hash\":" + expected + "}",
                s);
        }

        [Test]
        public void MossSource_Hash_Matches_Runtime_SourceHash()
        {
            // The wire hash must equal the runtime's saved SourceHash so client and sim agree.
            string src = "# hi\nevery 2s:\n  close(door_a)\n";
            string s = WireFormat.MossSource("t", src);
            uint runtime = (uint)ScriptRuntime.Fnv1a32(src);
            StringAssert.Contains("\"hash\":" + runtime, s);
        }

        [Test]
        public void MossDiag_FixedDiags_Serialize_With_OneBased_Positions_And_Severity()
        {
            var diags = new List<Diagnostic>
            {
                new Diagnostic(2, 5, "unexpected token '('", DiagnosticSeverity.Error),
                new Diagnostic(4, 1, "unreachable statement", DiagnosticSeverity.Warning),
            };
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"diag\",\"tid\":\"t\",\"ok\":false,\"diags\":[" +
                "[2,5,\"error\",\"unexpected token '('\"]," +
                "[4,1,\"warning\",\"unreachable statement\"]]}",
                WireFormat.MossDiag("t", diags));
        }

        [Test]
        public void MossDiag_Empty_Is_Ok_True()
        {
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"diag\",\"tid\":\"t\",\"ok\":true,\"diags\":[]}",
                WireFormat.MossDiag("t", new List<Diagnostic>()));
        }

        [Test]
        public void MossDiag_RealCompiler_MultiError_Is_Ok_False_With_Multiple_Diags()
        {
            // Several independent syntax faults through the REAL compiler.
            var diags = MossCompiler.Compile("if 1 > :\nevery 5x:\n  open(\n").Diagnostics;
            Assert.GreaterOrEqual(diags.Count, 2, "a multi-fault source should surface multiple diagnostics");
            string json = WireFormat.MossDiag(TermHydro, diags);
            StringAssert.Contains("\"ok\":false", json);
            foreach (var d in diags)
            {
                Assert.GreaterOrEqual(d.Line, 1, "line is 1-based");
                Assert.GreaterOrEqual(d.Col, 1, "col is 1-based");
            }
            // sev strings only — never the raw enum.
            StringAssert.Contains("\"error\"", json);
        }

        [Test]
        public void MossAudit_Serializes_TickText_Pairs_With_Escaping()
        {
            var lines = new List<(long, string)>
            {
                (12L, "open door_storage"),
                (34L, "alarm \"low O2\"\n"),
            };
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"audit\",\"tid\":\"t\",\"lines\":[" +
                "[12,\"open door_storage\"],[34,\"alarm \\\"low O2\\\"\\n\"]]}",
                WireFormat.MossAudit("t", lines));
        }

        [Test]
        public void MossRuntimeError_Serializes_And_Escapes()
        {
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"rterror\",\"tid\":\"t\",\"text\":\"unknown device \\\"x\\\"\"}",
                WireFormat.MossRuntimeError("t", "unknown device \"x\""));
        }

        // ---------------------------------------------------------------- GameSession bridge

        private static GameSession NewSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(SimHost.DefaultSeed);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add); // NOT started ⇒ no sim thread, paused
        }

        [Test]
        public void Moss_Open_Replies_Source_Then_Diag_For_Authored_Terminal()
        {
            var gs = NewSession(out _, out var sent);
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "open", tid: TermHydro));

            string source = sent.Find(m => m.Contains("\"ev\":\"source\""));
            string diag = sent.Find(m => m.Contains("\"ev\":\"diag\""));
            Assert.IsNotNull(source, "open must reply a source message");
            Assert.IsNotNull(diag, "open must reply a diag message");
            StringAssert.Contains("\"tid\":\"" + TermHydro + "\"", source);
            StringAssert.Contains("\"hash\":", source);
            StringAssert.Contains("\"ok\":true", diag, "the authored program compiles clean");
        }

        [Test]
        public void Moss_Set_On_Paused_Session_Compiles_And_Installs_Without_Ticking()
        {
            var gs = NewSession(out var host, out var sent);
            long tick0 = host.Sim.TickCount;
            const string tid = "term_web1";

            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: tid, text: ValidProgram));

            // Installed + compiled NOW (a clean diag came back) with ZERO ticks advanced.
            Assert.AreEqual(tick0, host.Sim.TickCount, "set must not advance the sim");
            string diag = sent.Find(m => m.Contains("\"ev\":\"diag\""));
            Assert.IsNotNull(diag);
            StringAssert.Contains("\"ok\":true", diag);

            // The running program is live immediately — an `open` reflects the set text.
            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "open", tid: tid));
            string source = sent.Find(m => m.Contains("\"ev\":\"source\""));
            StringAssert.Contains("open(door_storage)", source, "open reflects the just-set program");
            Assert.AreEqual(tick0, host.Sim.TickCount, "open must not advance the sim either");

            // Canonical saved source (sim.Scripts) is deferred to the tick boundary: the
            // SetScriptCommand drains on the NEXT tick, never mid-tick.
            Assert.IsFalse(HasScript(host.Sim, tid), "canonical source not written until a tick drains the command");
            host.Sim.Tick();
            Assert.IsTrue(HasScript(host.Sim, tid), "canonical source syncs at the tick boundary");
        }

        [Test]
        public void Moss_UnknownOp_Emits_Nothing()
        {
            var gs = NewSession(out _, out var sent);
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "wobble", tid: TermHydro));
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "dryrun", tid: TermHydro)); // reserved, not implemented
            Assert.IsEmpty(sent, "an unknown/reserved moss op must be ignored");
        }

        [Test]
        public void Moss_Audit_Replies_Envelope_With_Recorded_Actions()
        {
            var gs = NewSession(out var host, out var sent);
            const string tid = "term_web_audit";
            // A program that fires an actuator command each second — the audit ring records them.
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: tid, text: "every 1s:\n  open(door_storage)\n"));
            for (int i = 0; i < 30; i++) host.Sim.Tick();

            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "audit", tid: tid));
            string audit = sent.Find(m => m.Contains("\"ev\":\"audit\""));
            Assert.IsNotNull(audit, "audit must reply an audit message");
            StringAssert.Contains("\"tid\":\"" + tid + "\"", audit);
            StringAssert.Contains("\"lines\":[[", audit, "the ring recorded at least one actuator command");
        }

        [Test]
        public void Moss_RuntimeError_Pushed_Once_On_Transition()
        {
            var gs = NewSession(out var host, out var sent);
            const string tid = "term_web_err";
            // A BARE statement (no every-guard) runs every tick and references a device that does
            // not exist ⇒ a runtime error that persists (re-fires each tick, never self-clears).
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: tid, text: "open(no_such_device)\n"));
            for (int i = 0; i < 5; i++) host.Sim.Tick();
            Assert.IsTrue(host.Moss.TryGetRuntimeError(tid, out _), "the bad program should be in error");

            sent.Clear();
            gs.PollRuntimeErrorsForTest();
            gs.PollRuntimeErrorsForTest(); // second poll, same error — must NOT re-push
            int pushes = sent.FindAll(m => m.Contains("\"ev\":\"rterror\"")).Count;
            Assert.AreEqual(1, pushes, "rterror is pushed once per transition, not every poll");
            StringAssert.Contains("\"tid\":\"" + tid + "\"", sent.Find(m => m.Contains("\"ev\":\"rterror\"")));
        }

        private static bool HasScript(Simulation sim, string tid)
        {
            for (int i = 0; i < sim.Scripts.Count; i++)
                if (sim.Scripts[i].TerminalId == tid) return true;
            return false;
        }
    }
}
