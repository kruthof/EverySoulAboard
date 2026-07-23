using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // WireFormat, GameSession
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The MOSS terminal's wire + host bridge (`docs/design/perilune-moss-terminal.spec.md` §1):
    /// the cached `systems` channel, the `moss sys` detail reply, and the `moss exec` command
    /// prompt.
    ///
    /// The obligations discharged here (spec §6 row 1, host half):
    ///  * the `systems` payload is deterministic and InvariantCulture under a de-DE probe;
    ///  * `uptime` reaches the wire as a RAW tick count — never a preformatted duration;
    ///  * the exec path introduces NO new <c>ISimCommand</c>: every write arrives as the
    ///    <c>SetDoorStateCommand</c>/<c>SetDeviceStateCommand</c> the DSL adapters already enqueue;
    ///  * an abuse corpus (overlong, malformed, injection-shaped, `ship.*` and room write attempts)
    ///    yields typed errors and PROVABLY ZERO sim mutation.
    /// </summary>
    public class WebSystemsWireTests
    {
        private static (GameSession gs, SimHost host, List<string> sink) Boot()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        // ------------------------------------------------------------------ serializer

        [Test]
        public void Systems_Serializes_The_Frozen_Tuple_Shape()
        {
            var rows = new[]
            {
                new ShipSystemRow("reactor", "REACTOR", 61, ShipSystemState.Attend, 190, "SCRAM DRILL", "coolant warm"),
                new ShipSystemRow("nav_sensors", "NAV / SENSORS", -1, ShipSystemState.Offline, -1, "", ""),
            };
            string json = WireFormat.Systems("7741", new ShipSystemsReport(213, 5112074L, rows));
            Assert.AreEqual(
                "{\"type\":\"systems\",\"hull\":\"7741\",\"day\":213,\"uptime\":5112074,\"rows\":[" +
                "[\"reactor\",\"REACTOR\",61,1,190,\"SCRAM DRILL\",\"coolant warm\"]," +
                "[\"nav_sensors\",\"NAV / SENSORS\",-1,3,-1,\"\",\"\"]]}",
                json);
        }

        [Test]
        public void Systems_Escapes_Advisory_Prose_And_Handles_An_Empty_Row_Set()
        {
            var rows = new[]
            {
                new ShipSystemRow("thermal", "THERMAL", 0, ShipSystemState.Nominal, -1, "",
                                  "möchte \"warm\"\\kalt\nzwei"),
            };
            string json = WireFormat.Systems("0001", new ShipSystemsReport(0, 0, rows));
            StringAssert.Contains("\"möchte \\\"warm\\\"\\\\kalt\\nzwei\"", json);
            Assert.AreEqual("{\"type\":\"systems\",\"hull\":\"\",\"day\":0,\"uptime\":0,\"rows\":[]}",
                WireFormat.Systems(null, new ShipSystemsReport(0, 0, Array.Empty<ShipSystemRow>())));
        }

        [Test]
        public void Systems_Serialization_Is_InvariantCulture()
        {
            var (gs, host, _) = Boot();
            for (int i = 0; i < 300; i++) host.Sim.Tick();

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                gs.RenderForTest();
                string de = gs.Snapshot().First(s => s.Contains("\"type\":\"systems\""));
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                gs.RenderForTest();
                string inv = gs.Snapshot().First(s => s.Contains("\"type\":\"systems\""));
                Assert.AreEqual(inv, de, "the systems payload is culture-independent");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        [Test]
        public void Uptime_Reaches_The_Wire_As_A_Raw_Tick_Count_Never_A_Duration_String()
        {
            var (gs, host, _) = Boot();
            for (int i = 0; i < 137; i++) host.Sim.Tick();
            gs.RenderForTest();
            string sys = gs.Snapshot().First(s => s.Contains("\"type\":\"systems\""));
            StringAssert.Contains("\"uptime\":137", sys);
            StringAssert.DoesNotContain("\"uptime\":\"", sys, "the host never ships a formatted duration");
        }

        // ------------------------------------------------------------------ channel

        [Test]
        public void Systems_Channel_Is_Rendered_Cached_And_Carries_All_Eight_Rows()
        {
            var (gs, host, _) = Boot();
            gs.RenderForTest();
            string sys = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"systems\""));
            Assert.IsNotNull(sys, "the systems channel is cached for Snapshot catch-up");
            foreach (var id in ShipSystems.Ids) StringAssert.Contains("\"" + id + "\"", sys);
            StringAssert.Contains("\"hull\":\"" + ShipSystems.HullDesignation(host.Seed) + "\"", sys);
        }

        [Test]
        public void Rendering_The_Systems_Channel_Does_Not_Move_The_Determinism_Hash()
        {
            // Twin A is rendered (which builds the ledger every frame); twin B never is. The
            // channel is a pure derivation, so the hashes must MATCH — asserted as a twin
            // comparison, never against a literal, because other lanes move the reference pins.
            var sinkA = new List<string>();
            var a = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            var gs = new GameSession(a, sinkA.Add);
            var b = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);

            for (int i = 0; i < 200; i++)
            {
                a.Sim.Tick();
                b.Sim.Tick();
                if (i % 20 == 0) gs.RenderForTest();
            }
            Assert.AreEqual(b.Sim.StateHash(), a.Sim.StateHash(), "twin hashes MATCH");
        }

        // ------------------------------------------------------------------ moss sys

        [Test]
        public void MossSys_Serializes_Devices_And_The_Derivation_Note()
        {
            var devices = new[]
            {
                new ShipSystemDevice("scrubber_ls", DeviceKind.Scrubber, 87, true, 100, 1, 12, 5, ""),
                new ShipSystemDevice("vent_x", DeviceKind.AirVent, 9, false, 0, 0, 1, 2, "FAILED"),
            };
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"sys\",\"tid\":\"life_support\",\"derivation\":\"why\",\"devices\":[" +
                "[\"scrubber_ls\",2,87,1,100,1,12,5,\"\"]," +
                "[\"vent_x\",1,9,0,0,0,1,2,\"FAILED\"]]}",
                WireFormat.MossSys("life_support", devices, "why"));
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"sys\",\"tid\":\"x\",\"derivation\":\"\",\"devices\":[]}",
                WireFormat.MossSys("x", Array.Empty<ShipSystemDevice>(), null));
        }

        [Test]
        public void Moss_Sys_Op_Replies_With_That_Rows_Devices_And_Its_Derivation()
        {
            var (gs, host, sink) = Boot();
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "sys", tid: "life_support"));

            string reply = sink.Single(s => s.Contains("\"ev\":\"sys\""));
            StringAssert.Contains("\"tid\":\"life_support\"", reply);
            StringAssert.Contains("scrubber", reply, "the slice's scrubbers are in the breakdown");
            StringAssert.Contains("capacity is not the constraint", reply, "IX-M22: the derivation ships too");

            // An unknown row is an empty table, not an invented one.
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "sys", tid: "warp_core"));
            string bogus = sink.Single(s => s.Contains("\"ev\":\"sys\""));
            StringAssert.Contains("\"devices\":[]", bogus);
            StringAssert.Contains("\"derivation\":\"\"", bogus);
        }

        // ------------------------------------------------------------------ moss exec

        [Test]
        public void MossExec_Serializes_Streams_And_The_Ok_Flag()
        {
            var lines = new (int, string)[] { (0, "close door_x"), (2, "NO SUCH DEVICE 'DOOR_X'") };
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"exec\",\"tid\":\"@console\",\"ok\":false,\"lines\":[" +
                "[0,\"close door_x\"],[2,\"NO SUCH DEVICE 'DOOR_X'\"]]}",
                WireFormat.MossExec("@console", false, lines));
        }

        [Test]
        public void Exec_Writes_Go_Out_As_The_Existing_SimCommands_And_Land_At_A_Tick_Boundary()
        {
            // IX-M40: no new ISimCommand. The door really closes — via the same
            // SetDoorStateCommand DoorAdapter enqueues for a MOSS program.
            var (gs, host, _) = Boot();
            var door = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.Door && d.IsOpen);

            var (ok, lines) = gs.ExecConsoleForTest("close " + door.Name);
            Assert.IsTrue(ok, string.Join(" | ", lines.Select(l => l.Text)));
            Assert.IsTrue(door.IsOpen, "nothing mutated during the drain — writes land at a tick boundary");

            host.Sim.Tick();
            Assert.IsFalse(door.IsOpen, "…and it landed on the next tick");

            // Case- and space-tolerance (IX-M10).
            gs.ExecConsoleForTest("   OPEN    " + door.Name.ToUpperInvariant() + "   ");
            host.Sim.Tick();
            Assert.IsTrue(door.IsOpen);
        }

        [Test]
        public void Exec_Set_Rate_Accepts_Numbers_And_The_Max_Min_Keywords()
        {
            var (gs, host, _) = Boot();
            var vent = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.AirVent);

            Assert.IsTrue(gs.ExecConsoleForTest("set " + vent.Name + ".rate 0.5").Ok);
            host.Sim.Tick();
            Assert.AreEqual(0.5f, vent.Rate, 1e-6f);

            Assert.IsTrue(gs.ExecConsoleForTest("set " + vent.Name + " rate max").Ok, "space-tolerant form");
            host.Sim.Tick();
            Assert.AreEqual(1f, vent.Rate, 1e-6f);

            // de-DE decimal comma must NOT parse: the same keystrokes have to mean the same thing
            // on every machine.
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var (ok, lines) = gs.ExecConsoleForTest("set " + vent.Name + ".rate 0,5");
                Assert.IsFalse(ok);
                Assert.IsTrue(lines.Any(l => l.Stream == 2 && l.Text.Contains("NUMBER, MAX OR MIN")));
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
            host.Sim.Tick();
            Assert.AreEqual(1f, vent.Rate, 1e-6f, "the rejected line changed nothing");
        }

        [Test]
        public void Exec_Rejects_NonFinite_Set_Values_Because_Nothing_Downstream_Does()
        {
            // NumberStyles.Float parses "NaN"/"Infinity", and every guard past this point is
            // NaN-blind: UtilityDeviceAdapter's `rate < 0f` is false, and SetDeviceStateCommand's
            // clamp (Commands.cs:47) is `< 0 ? 0 : > 1 ? 1 : v` — both false — so NaN would be
            // written straight to Device.Rate and poison EffectiveRate and the atmosphere from there.
            var (gs, host, _) = Boot();
            var vent = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.AirVent);
            gs.ExecConsoleForTest("set " + vent.Name + ".rate 0.5");
            host.Sim.Tick();
            Assert.AreEqual(0.5f, vent.Rate, 1e-6f);

            foreach (string junk in new[] { "NaN", "nan", "Infinity", "-Infinity", "∞" })
            {
                var (ok, lines) = gs.ExecConsoleForTest("set " + vent.Name + ".rate " + junk);
                Assert.IsFalse(ok, "must refuse: " + junk);
                Assert.IsTrue(lines.Any(l => l.Stream == 2), "typed error: " + junk);
                host.Sim.Tick();
                Assert.AreEqual(0.5f, vent.Rate, 1e-6f, "rate untouched after: " + junk);
                Assert.IsTrue(float.IsFinite(vent.Rate), "and still finite after: " + junk);
            }
            Assert.AreEqual(1, gs.ConsoleAuditForTest().Count, "only the one legitimate write is audited");
        }

        [Test]
        public void Exec_Reads_Are_Free_And_Culture_Stable()
        {
            var (gs, host, _) = Boot();
            for (int i = 0; i < 20; i++) host.Sim.Tick();

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var (ok, lines) = gs.ExecConsoleForTest("ship.power");
                Assert.IsTrue(ok);
                string outLine = lines.First(l => l.Stream == 1).Text;
                StringAssert.StartsWith("SHIP.POWER = ", outLine);
                StringAssert.DoesNotContain(",", outLine, "no locale decimal comma reached the wire");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }

            Assert.IsFalse(gs.ExecConsoleForTest("ship.warpfactor").Ok);
            Assert.IsEmpty(gs.ConsoleAuditForTest(), "reads are never audited (IX-M41)");
        }

        [Test]
        public void Exec_Audits_Every_Write_And_Serves_The_Ring_Under_The_Console_Tid()
        {
            var (gs, host, sink) = Boot();
            var door = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.Door);

            gs.ExecConsoleForTest("close " + door.Name);
            gs.ExecConsoleForTest("nonsense " + door.Name);          // refused ⇒ not audited
            gs.ExecConsoleForTest(door.Name + ".open");              // a read ⇒ not audited

            var ring = gs.ConsoleAuditForTest();
            Assert.AreEqual(1, ring.Count, "only the accepted WRITE is audited");
            Assert.AreEqual("close(" + door.Name.ToLowerInvariant() + ")", ring[0].Text,
                "same text shape the interpreter records, so player and DSL lines read as peers");

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "audit", tid: "@console"));
            string audit = sink.Single(s => s.Contains("\"ev\":\"audit\""));
            StringAssert.Contains("\"tid\":\"@console\"", audit);
            StringAssert.Contains("close(" + door.Name.ToLowerInvariant() + ")", audit);
        }

        [Test]
        public void Exec_Op_Replies_Over_The_Wire_With_An_Echo_Line()
        {
            var (gs, host, sink) = Boot();
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "exec", tid: "@console", text: "help"));
            string reply = sink.Single(s => s.Contains("\"ev\":\"exec\""));
            StringAssert.Contains("\"ok\":true", reply);
            StringAssert.Contains("[0,\"help\"]", reply, "the console echoes what it received");
            StringAssert.Contains("READ-ONLY", reply);
        }

        // ------------------------------------------------------- end-to-end through the REAL Parse

        [Test]
        public void Sys_And_Exec_Reach_HandleMoss_Through_The_Real_Wire_Parse()
        {
            // A silently-dropped command is THE failure mode on this path, and it is invisible to a
            // test that constructs a WebCommand by hand. MOSS ops are keyed by "type": Parse reads
            // "cmd" first and, when it is non-null, switches and RETURNS without falling through to
            // the "type" switch (GameSession.cs:1249-1262). So {"cmd":"moss",...} would land in
            // Kind.Unknown and be ignored with no error anywhere. Drive the real bytes.
            var (gs, host, sink) = Boot();
            var door = host.Sim.Devices.Items.First(d => d.Kind == DeviceKind.Door && d.IsOpen);

            sink.Clear();
            var sys = WebCommand.Parse("{\"type\":\"moss\",\"op\":\"sys\",\"tid\":\"reactor\"}");
            Assert.AreEqual(CmdKind.Moss, sys.Kind, "the sys op parses as a MOSS command");
            Assert.AreEqual("sys", sys.Op);
            Assert.AreEqual("reactor", sys.Tid);
            gs.ApplyForTest(sys);
            string sysReply = sink.Single(s => s.Contains("\"ev\":\"sys\""));
            StringAssert.Contains("\"tid\":\"reactor\"", sysReply);
            StringAssert.Contains("\"derivation\":\"", sysReply);

            sink.Clear();
            var exec = WebCommand.Parse(
                "{\"type\":\"moss\",\"op\":\"exec\",\"tid\":\"@console\",\"text\":\"close " + door.Name + "\"}");
            Assert.AreEqual(CmdKind.Moss, exec.Kind, "the exec op parses as a MOSS command");
            Assert.AreEqual("exec", exec.Op);
            gs.ApplyForTest(exec);
            string execReply = sink.Single(s => s.Contains("\"ev\":\"exec\""));
            StringAssert.Contains("\"ok\":true", execReply);
            host.Sim.Tick();
            Assert.IsFalse(door.IsOpen, "the write really landed — the whole path is live end to end");

            // And the shape the survey wrote is the one that gets dropped. Pinned so nobody
            // "fixes" the client back to it.
            Assert.AreEqual(CmdKind.Unknown,
                WebCommand.Parse("{\"cmd\":\"moss\",\"op\":\"sys\",\"tid\":\"reactor\"}").Kind,
                "{\"cmd\":\"moss\"} is silently dropped — MOSS ops are keyed by \"type\"");
        }

        [Test]
        public void Exec_Text_Survives_JSON_Escaping_Through_Parse()
        {
            // The prompt is free text on a JSON wire: quotes, backslashes and newlines must arrive
            // as typed, and must still be refused as typed rather than mangled into something legal.
            var (gs, _, sink) = Boot();
            sink.Clear();
            var cmd = WebCommand.Parse(
                "{\"type\":\"moss\",\"op\":\"exec\",\"tid\":\"@console\",\"text\":\"close \\\"a\\\"\\nb\"}");
            Assert.AreEqual("close \"a\"\nb", cmd.Text, "escapes survive the reader intact");
            gs.ApplyForTest(cmd);
            string reply = sink.Single(s => s.Contains("\"ev\":\"exec\""));
            StringAssert.Contains("\"ok\":false", reply);
            StringAssert.Contains("\\n", reply, "the echo re-escapes the newline rather than breaking the line");
            Assert.IsEmpty(gs.ConsoleAuditForTest(), "and nothing was written");
        }

        // ------------------------------------------------------------------ the abuse corpus

        [Test]
        public void Abuse_Corpus_Yields_Typed_Errors_And_Provably_Zero_Sim_Mutation()
        {
            var (gs, host, _) = Boot();
            for (int i = 0; i < 50; i++) host.Sim.Tick();   // settle the ship

            // Anything that resolves must be READ-ONLY or refused, so the sim hash cannot move —
            // and the drain does not tick, so even an accepted write would not have landed yet.
            // Both twins tick identically afterwards to prove nothing was queued either.
            var twin = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            for (int i = 0; i < 50; i++) twin.Sim.Tick();
            Assert.AreEqual(twin.Sim.StateHash(), host.Sim.StateHash(), "twins start level");

            string room = host.Sim.Rooms.Anchors.First(a => !string.IsNullOrEmpty(a.Name)).Name;
            var corpus = new[]
            {
                new string('x', 500),                                  // overlong
                "close " + new string('y', 300),                       // overlong with a real verb
                "",                                                    // empty
                "   \t  ",                                             // whitespace only
                "close",                                               // missing target
                "close a b c",                                         // too many targets
                "set",                                                 // set with nothing
                "set door_aft",                                        // set with no property
                "set door_aft.rate",                                   // set with no value
                "set door_aft.rate potato",                            // set with a junk value
                "open ship",                                           // ship is READ-ONLY
                "close ship",
                "set ship.power 1",
                "open " + room,                                        // rooms are READ-ONLY
                "set " + room + ".co2 0",
                "lock " + room,
                "open nonexistent_device",
                "..",                                                  // degenerate dotted forms
                "a..b",
                ".rate",
                "rate.",
                "open(door_aft)",                                      // MOSS syntax is not prompt syntax
                "close door_aft; rm -rf /",                            // injection-shaped
                "close door_aft\nopen door_aft",                       // embedded newline
                "close door_aft && open door_aft",
                "${jndi:ldap://x/y}",
                "\"}]},{\"type\":\"moss\"",                            // JSON-injection-shaped
                "SELECT * FROM devices",
                "alarm(\"boom\")",                                     // a MOSS builtin is not a prompt verb
                "every 5s",
                "log(\"x\")",
            };

            foreach (string line in corpus)
            {
                var (ok, lines) = gs.ExecConsoleForTest(line);
                Assert.IsNotEmpty(lines, "every line gets at least an echo: " + line);
                Assert.AreEqual(0, lines[0].Stream, "the echo comes first: " + line);
                if (line.Trim().Length == 0)
                {
                    Assert.IsTrue(ok, "a blank line is a no-op, not an error");
                    continue;
                }
                Assert.IsFalse(ok, "must be refused: " + line);
                Assert.IsTrue(lines.Any(l => l.Stream == 2), "a TYPED error, never a silent no-op: " + line);
            }

            Assert.IsEmpty(gs.ConsoleAuditForTest(), "not one of these was a write");
            Assert.AreEqual(twin.Sim.StateHash(), host.Sim.StateHash(), "twin hashes MATCH — zero sim mutation");
            for (int i = 0; i < 50; i++) { host.Sim.Tick(); twin.Sim.Tick(); }
            Assert.AreEqual(twin.Sim.StateHash(), host.Sim.StateHash(),
                "twin hashes MATCH after ticking — nothing was queued on the inbox either");
        }

        [Test]
        public void Overlong_Input_Is_Capped_Host_Side_Not_Only_In_The_DOM()
        {
            var (gs, _, _) = Boot();
            var (ok, lines) = gs.ExecConsoleForTest(new string('z', 241));
            Assert.IsFalse(ok);
            Assert.AreEqual(240, lines[0].Text.Length, "the echo itself is bounded");
            Assert.IsTrue(lines.Any(l => l.Stream == 2 && l.Text.Contains("TOO LONG")));

            Assert.IsTrue(gs.ExecConsoleForTest(new string('z', 240)).Lines.Any(l => l.Stream == 2),
                "240 is accepted for length and then fails as an unknown command, not as a cap");
        }
    }
}
