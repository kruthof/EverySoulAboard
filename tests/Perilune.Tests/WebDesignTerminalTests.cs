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
                new WireFormat.Design(3, 4, 0, 0, 1, 2),
                new WireFormat.Design(10, 2, 1, 1, 0, 3),
            };
            string json = WireFormat.Designs(rows);
            // element 7 = material variant (default 0), APPEND-ONLY after the delivered/required ledger.
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[[3,4,0,0,1,2,0],[10,2,1,1,0,3,0]]}", json);
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[]}", WireFormat.Designs(Array.Empty<WireFormat.Design>()));
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[]}", WireFormat.Designs(null));
        }

        /// <summary>
        /// The designs tuple grows only by APPEND: the first four elements keep their meaning and
        /// position, delivered/required trail them, and the material variant trails those (element 7).
        /// A Design built the old four-argument way still serializes a well-formed tuple with the
        /// trailing fields defaulted to 0. WireFormat is a spine file — this is the test that says so.
        /// </summary>
        [Test]
        public void Designs_Ledger_Is_AppendOnly_On_The_Tuple()
        {
            string legacy = WireFormat.Designs(new[] { new WireFormat.Design(3, 4, 0, 0) });
            Assert.AreEqual("{\"type\":\"designs\",\"cells\":[[3,4,0,0,0,0,0]]}", legacy,
                "the four-argument ctor still works; the ledger + material default to 0");

            string ledger = WireFormat.Designs(new[] { new WireFormat.Design(3, 4, 0, 0, 1, 2) });
            StringAssert.StartsWith("{\"type\":\"designs\",\"cells\":[[3,4,0,0,", ledger,
                "x,y,deck,kind keep their positions — a reader that knows only the first four is unaffected");
            StringAssert.EndsWith(",1,2,0]]}", ledger, "delivered, required, then material (0) trailing");

            // The material variant rides as the 7th element (append-only after the ledger).
            string mat = WireFormat.Designs(new[] { new WireFormat.Design(3, 4, 0, 0, 1, 2, 5) });
            StringAssert.EndsWith(",1,2,5]]}", mat, "material variant 5 trails delivered/required");

            // A starved site (nothing delivered) and a ready one are distinguishable on the wire.
            StringAssert.Contains("[9,9,0,1,0,2,0]", WireFormat.Designs(new[] { new WireFormat.Design(9, 9, 0, 1, 0, 2) }));
            StringAssert.Contains("[9,9,0,1,2,2,0]", WireFormat.Designs(new[] { new WireFormat.Design(9, 9, 0, 1, 2, 2) }));
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

        /// <summary>
        /// THE INVARIANTCULTURE GUARD, MADE TO BITE.
        ///
        /// ⚠️ THE VERSION THAT SHIPPED FIRST COULD NOT FAIL, and it is the same defect as
        /// <c>ZonesChannelTests</c>'s and <c>MarksChannelTests</c>'s (<c>docs/HANDOVER.md</c> §4k).
        /// It set <c>CurrentCulture</c> to plain de-DE and compared against the invariant render of a
        /// fixture whose every field was a NON-NEGATIVE integer. <b>Those are byte-identical no matter
        /// what the emitter does</b>: <c>int.ToString()</c> uses the "G" format, which never emits a
        /// group separator, and .NET renders Latin digits for every built-in culture (measured: of
        /// every culture installed on this machine, ZERO render <c>1234567</c> as anything else). The
        /// only <see cref="NumberFormatInfo"/> knob that reaches a bare "G" integer is
        /// <see cref="NumberFormatInfo.NegativeSign"/>. VERIFIED by physically applying the mutation:
        /// dropping <c>Ic</c> from the four <c>Designs</c> calls, and from <c>Terminals</c>'s
        /// <c>t.Deck</c>, left this test GREEN.
        ///
        /// The fix is the house one: a CLONED de-DE carrying a loud negative sign, a fixture with
        /// negative values, and a NON-VACUITY leg proving the culture really does perturb a bare
        /// <c>ToString()</c> — without which this rots straight back into the version it replaced.
        ///
        /// ⚠️ <c>Design.Kind</c> AND <c>Design.Material</c> ARE <c>byte</c>: they cannot be negative,
        /// so no fixture can make their <c>ToString(Ic)</c> differ from <c>ToString()</c>. Dropping
        /// <c>Ic</c> from those two is an EQUIVALENT MUTANT — provably unkillable, not untested code.
        /// The claim below is scoped to the SIGNED fields deliberately; do not widen it.
        ///
        /// MUTATION: drop <c>Ic</c> from <c>Designs</c>'s <c>d.X</c>, <c>d.Y</c>, <c>d.Deck</c>,
        /// <c>d.Delivered</c> or <c>d.Required</c>, or from any of <c>Terminals</c>'s three
        /// <c>ToString</c> calls ⇒ this fails.
        /// </summary>
        [Test]
        public void Designs_And_Terminals_Serialization_Is_InvariantCulture()
        {
            var loud = (CultureInfo)CultureInfo.GetCultureInfo("de-DE").Clone();
            loud.NumberFormat.NegativeSign = "MINUS";

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = loud;

                // NON-VACUITY, FIRST: the culture must actually change what a bare ToString() emits,
                // or everything below is the test that could not fail, again.
                Assert.AreEqual("MINUS3", (-3).ToString(),
                    "the ambient culture does not perturb a bare int.ToString(), so this guard is " +
                    "decoration. Pick a culture knob that DOES reach an integer before trusting it.");

                // Negative on every SIGNED field of both tuples — a shape the sim never produces,
                // chosen because it is the only shape that makes the property observable.
                var loudDesigns = new[] { new WireFormat.Design(-1, -2, -3, 1, -4, -5) };
                StringAssert.Contains("[-1,-2,-3,1,-4,-5,0]", WireFormat.Designs(loudDesigns),
                    "the designs emitter picked up the ambient culture's negative sign. Every number " +
                    "on this channel must go through InvariantCulture — the dev machine is de-DE, and " +
                    "a wire payload that changes with the operator's locale is not a wire payload.");

                var loudTerms = new List<(string, int, int, int)> { ("t", -1, -2, -3) };
                StringAssert.Contains("[\"t\",-1,-2,-3]", WireFormat.Terminals(loudTerms),
                    "the terminals emitter picked up the ambient culture's negative sign");

                // …and the ordinary, non-negative case is unchanged under the same loud culture, which
                // is the honest statement of today's position: the values the sim actually produces
                // cannot express the difference, and the discipline protects the one that will.
                var designs = new[] { new WireFormat.Design(1, 2, 0, 1) };
                var terms = new List<(string, int, int, int)> { ("t", 0, 1, 2) };
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string dInv = WireFormat.Designs(designs), tInv = WireFormat.Terminals(terms);
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(dInv, WireFormat.Designs(designs), "designs bytes are culture-independent");
                Assert.AreEqual(tInv, WireFormat.Terminals(terms), "terminals bytes are culture-independent");
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
                target.Value.Y.ToString(CultureInfo.InvariantCulture) + ",0,0,";
            StringAssert.Contains(tuple, after,
                "the pending wall shows as a ghost cell [x,y,deck,kind=wall,delivered,required]");
            // A freshly designated site has delivered 0 of the def's required material — the
            // STARVED state the client now renders distinctly.
            Assert.IsTrue(build.TryGet(target.Value, out var pending));
            StringAssert.Contains(tuple + "0," + pending.Required.ToString(CultureInfo.InvariantCulture) + ",0]", after,
                "the ledger reports 0 delivered of the site's requirement; material 0 (default) trails");

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
