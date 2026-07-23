using System;
using System.Globalization;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // WireFormat
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The web skin's wire contract, asserted on the PURE serializer (WireFormat) — no sockets,
    /// no threads. A frame from the shipping boot sim must serialize byte-identically twice and
    /// under a comma-decimal culture (InvariantCulture discipline), the flat cells array must be
    /// exactly w*h long, and the metrics payload must carry every sidebar field. A small golden
    /// (deck 0, tick 0, no lens) pins the exact bytes the browser receives; UPDATE_GOLDEN=1
    /// rewrites it.
    /// </summary>
    public class WebProtocolTests
    {
        private static GlyphBuffer BootFrame(int deck, Lens lens, out int w, out int h)
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            w = host.Sim.World.Width; h = host.Sim.World.Height;
            var buf = new GlyphBuffer(w, h);
            GlyphMapper.Project(host.Sim, deck, lens, null, buf);
            return buf;
        }

        [Test]
        public void Frame_Serializes_ByteIdentically_Twice()
        {
            var a = BootFrame(0, Lens.None, out _, out _);
            var b = BootFrame(0, Lens.None, out _, out _);
            Assert.AreEqual(WireFormat.Frame(a, 0, "none", -1, -1), WireFormat.Frame(b, 0, "none", -1, -1),
                "the same boot frame must serialize to identical bytes");
        }

        [Test]
        public void Frame_CellCount_Equals_WidthTimesHeight()
        {
            var buf = BootFrame(0, Lens.None, out int w, out int h);
            string json = WireFormat.Frame(buf, 0, "none", -1, -1);
            // A frame has exactly one array literal per cell plus the outer "cells" array, and no
            // other '[' anywhere in the payload — so bracket count minus one is the cell count.
            int open = 0;
            for (int i = 0; i < json.Length; i++) if (json[i] == '[') open++;
            Assert.AreEqual(w * h, open - 1, "cells array length must be w*h");
            StringAssert.Contains("\"w\":" + w.ToString(CultureInfo.InvariantCulture), json);
            StringAssert.Contains("\"h\":" + h.ToString(CultureInfo.InvariantCulture), json);
        }

        [Test]
        public void Frame_CrewList_Serializes_And_AbsentWhenEmpty()
        {
            var buf = BootFrame(0, Lens.None, out _, out _);
            string without = WireFormat.Frame(buf, 0, "none", -1, -1);
            StringAssert.DoesNotContain("\"crew\":", without, "no crew field when the list is empty");
            string with = WireFormat.Frame(buf, 0, "none", -1, -1,
                new[] { (50, 4, 1, 7u), (12, 9, 2, 42u) });
            StringAssert.Contains("\"crew\":[[50,4,1,7],[12,9,2,42]]", with,
                "crew serializes as [x,y,pv,cid] tuples (cid appended, append-only)");
        }

        [Test]
        public void Metrics_Payload_Carries_Every_Field()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            string json = WireFormat.Metrics(ShipMetrics.Compute(host.Sim));
            foreach (var field in new[] { "day", "dayFrac", "power", "oxygen", "co2ppm",
                                          "water", "food", "heat", "structural", "morale", "regolith" })
                StringAssert.Contains("\"" + field + "\":", json);
            StringAssert.Contains("\"type\":\"metrics\"", json);
        }

        [Test]
        public void Metrics_Carries_Loose_Regolith_Stock()
        {
            // The STORES chip reads this: the loose (uncarried) build-material count, additive + view-only.
            var host = SimHost.Build(SimHost.DefaultSeed);
            string json = WireFormat.Metrics(ShipMetrics.Compute(host.Sim), 7);
            StringAssert.Contains("\"regolith\":7", json);
        }

        [Test]
        public void Serialization_Is_InvariantCulture()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var snap = ShipMetrics.Compute(host.Sim);

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                string invariant;
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                invariant = WireFormat.Metrics(snap);

                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE"); // comma decimal
                string german = WireFormat.Metrics(snap);

                Assert.AreEqual(invariant, german, "metrics must serialize identically under any culture");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        [Test]
        public void Status_And_Lines_Escape_Correctly()
        {
            string s = WireFormat.Status("quote \" and \\ slash", "1x", true);
            StringAssert.Contains("\\\"", s);
            StringAssert.Contains("\\\\", s);
            StringAssert.Contains("\"paused\":true", s);

            string log = WireFormat.Log(new[] { "line one", "with \"quotes\"" });
            StringAssert.Contains("\"type\":\"log\"", log);
            StringAssert.Contains("\\\"quotes\\\"", log);
        }

        [Test]
        public void Golden_WebFrame_Boot()
        {
            var buf = BootFrame(0, Lens.None, out _, out _);
            CheckGolden("web_frame_boot.json", WireFormat.Frame(buf, 0, "none", -1, -1));
        }

        /// <summary>Locks the append-only 4-element crew tuple [x,y,pv,cid] byte-for-byte on a
        /// real boot frame. (No pre-existing golden carried crew tuples, so W1's tuple-arity
        /// growth regenerated nothing; this new golden is the crew shape's coverage.)</summary>
        [Test]
        public void Golden_WebFrame_Boot_Crew()
        {
            var buf = BootFrame(0, Lens.None, out _, out _);
            var crew = new[] { (10, 3, 0, 1u), (11, 3, 1, 2u), (20, 7, 2, 3u) };
            CheckGolden("web_frame_boot_crew.json", WireFormat.Frame(buf, 0, "none", 10, 3, crew));
        }

        /// <summary>Golden for the light message (W2): a controlled two-room section, ticked so
        /// the right room's light powers up, then fully revealed — the RLE carries fog(0),
        /// Dead(1) and Powered(4) runs.</summary>
        [Test]
        public void Golden_WebLight_Scenario()
        {
            var sim = GlyphTestScenario.Build();
            for (int i = 0; i < 20; i++) sim.Tick();
            GlyphTestScenario.RevealLevel(sim, 0);
            var light = new byte[sim.World.Width * sim.World.Height];
            LightMapper.Project(sim, 0, light);
            CheckGolden("web_light_scenario.json",
                WireFormat.Light(0, sim.World.Width, sim.World.Height, light));
        }

        /// <summary>W2 must not perturb the frame channel: the boot frame still serializes to the
        /// committed W1 golden byte-for-byte (no frame-golden churn beyond W1's crew tuple).</summary>
        [Test]
        public void Light_Commit_Does_Not_Change_Frame_Bytes()
        {
            var buf = BootFrame(0, Lens.None, out _, out _);
            string frame = WireFormat.Frame(buf, 0, "none", -1, -1);
            string golden = System.IO.File.ReadAllText(
                System.IO.Path.Combine(GoldenDir(), "web_frame_boot.json")).Replace("\r\n", "\n");
            Assert.AreEqual(golden, frame, "frame bytes changed — W2 must only add the light channel");
        }

        // ------------------------------------------------------------------ harness
        // (mirrors PeriluneGoldenTests; the golden lives in the shared Golden/ dir)

        private static void CheckGolden(string fileName, string actual)
        {
            actual = actual.Replace("\r\n", "\n");
            string path = Path.Combine(GoldenDir(), fileName);

            if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") == "1")
            {
                Directory.CreateDirectory(GoldenDir());
                File.WriteAllText(path, actual);
                Assert.Pass($"golden rewritten: {fileName}");
                return;
            }

            if (!File.Exists(path))
                Assert.Fail($"missing golden '{fileName}' — run once with UPDATE_GOLDEN=1 to create it");

            string expected = File.ReadAllText(path).Replace("\r\n", "\n");
            Assert.AreEqual(expected, actual, $"golden mismatch for {fileName}");
        }

        private static string GoldenDir([CallerFilePath] string thisFile = "") =>
            Path.Combine(Path.GetDirectoryName(thisFile) ?? ".", "Golden");
    }
}
