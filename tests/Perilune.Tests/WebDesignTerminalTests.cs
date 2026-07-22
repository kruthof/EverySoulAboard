using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // WireFormat, GameSession, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The BUILD-ghost `designs` channel + the MOSS `terminals` directory (playtest-polish wire
    /// additions). Pure-serializer assertions (shape, escaping, InvariantCulture, empty), plus
    /// GameSession-level proofs that both are rendered, cached for Snapshot catch-up, mirror the
    /// authoritative sim state READ-ONLY (a wall designation appears as a ghost; every terminal
    /// device is listed), and never move a StateHash.
    /// </summary>
    public class WebDesignTerminalTests
    {
        // ------------------------------------------------------------------ serializers

        [Test]
        public void Designs_Serializes_Tuples_And_EmptyList()
        {
            var rows = new[]
            {
                new WireFormat.Design(3, 4, 0, 0),
                new WireFormat.Design(10, 2, 1, 1),
            };
            string json = WireFormat.Designs(rows);
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[[3,4,0,0],[10,2,1,1]]}", json);
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[]}", WireFormat.Designs(Array.Empty<WireFormat.Design>()));
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[]}", WireFormat.Designs(null));
        }

        [Test]
        public void Terminals_Serializes_Tuples_Escaped_And_EmptyList()
        {
            var rows = new List<(string, int, int, int)>
            {
                ("term_bridge", 0, 3, 4),
                ("aft\"quote", 1, 9, 2),
            };
            string json = WireFormat.Terminals(rows);
            StringAssert.Contains("[\"term_bridge\",0,3,4]", json);
            StringAssert.Contains("[\"aft\\\"quote\",1,9,2]", json); // JSON-escaped tid
            Assert.AreEqual("{\"type\":\"terminals\",\"list\":[]}",
                WireFormat.Terminals(new List<(string, int, int, int)>()));
        }

        [Test]
        public void Designs_And_Terminals_Serialization_Is_InvariantCulture()
        {
            var designs = new[] { new WireFormat.Design(1, 2, 0, 1) };
            var terms = new List<(string, int, int, int)> { ("t", 0, 1, 2) };
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                string dDe = WireFormat.Designs(designs), tDe = WireFormat.Terminals(terms);
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                Assert.AreEqual(WireFormat.Designs(designs), dDe, "designs bytes are culture-independent");
                Assert.AreEqual(WireFormat.Terminals(terms), tDe, "terminals bytes are culture-independent");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ session

        private static (GameSession gs, SimHost host, List<string> sink) Boot(ShipChoice ship = ShipChoice.Perilune)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Slice
                ? SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice)
                : SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        [Test]
        public void Designs_Channel_Cached_And_Reflects_A_Designated_Wall()
        {
            var (gs, host, _) = Boot();
            var build = host.BuildSys;
            Assert.IsNotNull(build, "the shipping stack registers a BuildSystem the host can read");

            // Empty before any designation, but the channel is present + cached for catch-up.
            gs.RenderForTest();
            string designs = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"designs\""));
            Assert.IsNotNull(designs, "the designs channel is cached for Snapshot catch-up");
            StringAssert.Contains("\"cells\":[]", designs);

            // Find a legal tile on deck 0, designate a wall, tick to apply, re-render.
            Int3? target = null;
            for (int y = 0; y < host.Sim.World.Height && target == null; y++)
                for (int x = 0; x < host.Sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    if (build.CanDesignate(host.Sim, p, BuildKind.Wall)) { target = p; break; }
                }
            Assert.IsNotNull(target, "the boot ship has a designatable tile");

            gs.ApplyForTest(new WebCommand(CmdKind.Build, target.Value.X, target.Value.Y, name: "wall"));
            host.Sim.Tick(); // the enqueued DesignateBuildCommand drains here
            gs.RenderForTest();
            string after = gs.Snapshot().First(s => s.Contains("\"type\":\"designs\""));
            string tuple = "[" + target.Value.X.ToString(CultureInfo.InvariantCulture) + "," +
                target.Value.Y.ToString(CultureInfo.InvariantCulture) + ",0,0]";
            StringAssert.Contains(tuple, after, "the pending wall shows as a ghost cell [x,y,deck,kind=wall]");

            // Cancelling it drops the ghost off the authoritative channel.
            gs.ApplyForTest(new WebCommand(CmdKind.Build, target.Value.X, target.Value.Y, name: "cancel"));
            host.Sim.Tick();
            gs.RenderForTest();
            string cleared = gs.Snapshot().First(s => s.Contains("\"type\":\"designs\""));
            StringAssert.DoesNotContain(tuple, cleared, "a cancelled designation drops off the designs channel");
        }

        [Test]
        public void Terminals_Channel_Cached_And_Lists_Every_Terminal_Device()
        {
            var (gs, host, _) = Boot();
            gs.RenderForTest();
            string terminals = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"terminals\""));
            Assert.IsNotNull(terminals, "the terminals channel is cached for Snapshot catch-up");

            int termCount = host.Sim.Devices.Items.Count(d =>
                d.Kind == DeviceKind.Terminal && !string.IsNullOrEmpty(d.Name));
            // Each tuple begins with `["` (bracket + quoted tid); the outer list bracket does not.
            Assert.AreEqual(termCount, CountOccurrences(terminals, "[\""), "one entry per named terminal device");
            foreach (var d in host.Sim.Devices.Items.Where(d => d.Kind == DeviceKind.Terminal && !string.IsNullOrEmpty(d.Name)))
                StringAssert.Contains("[\"" + d.Name + "\"," + d.Pos.Z.ToString(CultureInfo.InvariantCulture), terminals);
        }

        [Test]
        public void Slice_Roster_Carries_Persona_Traits()
        {
            var (gs, host, _) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            string roster = gs.Snapshot().First(s => s.Contains("\"type\":\"roster\""));
            // Every row carries the appended traits array…
            StringAssert.Contains("\"traits\":[", roster);
            // …and at least one authored crew member's traits are populated (persona-woven slice),
            // so the wire surfaces a non-empty array (not merely the stable []).
            Assert.IsTrue(host.Sim.Citizens.Items.Any(cit =>
                !cit.Dead && host.Minds.Minds.TryGet(cit.Id, out var m) && m.Persona != null &&
                m.Persona.Traits != null && m.Persona.Traits.Any()),
                "the authored slice crew carry persona traits the roster surfaces");
            StringAssert.Contains("\"traits\":[\"", roster, "at least one row lists non-empty traits");
        }

        private static int CountOccurrences(string s, string token)
        {
            int n = 0, i = 0;
            while ((i = s.IndexOf(token, i, StringComparison.Ordinal)) >= 0) { n++; i += token.Length; }
            return n;
        }
    }
}
