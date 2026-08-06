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
    /// The roster channel + the build/refit wire bridge (P2.1 UI groundwork). Pure-serializer
    /// assertions on WireFormat.Roster (shape, culture), parse assertions on the new
    /// {"cmd":"build"} message, and GameSession-level proofs that (a) a build command lands as
    /// a BuildSystem designation at the next tick boundary, (b) the roster channel is rendered,
    /// cached for Snapshot catch-up, and lists every living crew member, and (c) the authored
    /// slice crew get gender-consistent pawn variants (frame pv joined to roster names).
    /// </summary>
    public class WebRosterBuildTests
    {
        // ------------------------------------------------------------------ serializer

        [Test]
        public void Roster_Serializes_EveryField_And_EmptyList()
        {
            var rows = new[]
            {
                new WireFormat.RosterEntry(7u, "Ada", "welder", "grief", "hauling", "pk_00000001", 0.75f, 0, 3, 4,
                    new[] { "steady", "wry" }, null, null,
                    "Exhausted and hungry. She has stopped working. She will still eat, drink and sleep."),
                new WireFormat.RosterEntry(9u, "Bo", "", "", "idle", "", 1f, 1, 10, 2),
            };
            string json = WireFormat.Roster(rows);
            StringAssert.Contains("\"type\":\"roster\"", json);
            // The traits array, then fx/fy, then `state` (M4-9) are APPEND-ONLY trailing on each row.
            // A caller that supplies no glide (row 2 does not) serializes fx/fy AT the integer tile —
            // never a silently wrong (0,0) — which is also exactly what a crew member standing still
            // sends. ⭐ `state` IS THE HOW SHE IS BAND'S WHOLE PAYLOAD, and the assertion below is
            // deliberately the FULL sentence: what makes the band honest is its SECOND clause (what
            // she will refuse), and a truncated expectation would pass on a host that shipped only
            // the adjective — which is the cosmetic operator M4-1 DESIGN QUESTION (e) forbids.
            StringAssert.Contains("{\"cid\":7,\"name\":\"Ada\",\"role\":\"welder\",\"mood\":\"grief\"," +
                "\"morale\":0.75,\"task\":\"hauling\",\"portrait\":\"pk_00000001\",\"deck\":0,\"x\":3,\"y\":4," +
                "\"traits\":[\"steady\",\"wry\"],\"fx\":3,\"fy\":4," +
                "\"state\":\"Exhausted and hungry. She has stopped working. She will still eat, drink and sleep.\"}",
                json);
            // A row with no traits (null) still emits the stable empty array — and a row with no
            // state emits the stable empty STRING. ⛔ Empty means "nothing to say", never "unknown":
            // the client hides the band on absence and must never be handed a null to guess at.
            StringAssert.Contains("\"cid\":9", json);
            StringAssert.Contains("\"y\":2,\"traits\":[],\"fx\":10,\"fy\":2,\"state\":\"\"}", json);
            Assert.AreEqual("{\"type\":\"roster\",\"crew\":[]}", WireFormat.Roster(Array.Empty<WireFormat.RosterEntry>()));
        }

        [Test]
        public void Roster_Serialization_Is_InvariantCulture()
        {
            // fx/fy are FRACTIONAL on purpose here: they are the only per-frame floats on this
            // channel, and a locale comma in one would make the whole message invalid JSON.
            var rows = new[] { new WireFormat.RosterEntry(1u, "X", "", "", "", "", 0.5f, 0, 0, 0, null, 3.4f, 7.9f) };
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                string de = WireFormat.Roster(rows);
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Roster(rows);
                Assert.AreEqual(inv, de, "roster bytes are culture-independent");
                StringAssert.Contains("\"morale\":0.5", de, "decimal dot, never a locale comma");
                StringAssert.Contains("\"fx\":3.4,\"fy\":7.9", de, "the glide floats too");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ parse

        [Test]
        public void Parse_Build_Command_Carries_Kind_And_Tile()
        {
            var wall = WebCommand.Parse("{\"cmd\":\"build\",\"kind\":\"wall\",\"x\":5,\"y\":9}");
            Assert.AreEqual(CmdKind.Build, wall.Kind);
            Assert.AreEqual("wall", wall.Name);
            Assert.AreEqual(5, wall.X);
            Assert.AreEqual(9, wall.Y);

            var cancel = WebCommand.Parse("{\"cmd\":\"build\",\"kind\":\"cancel\",\"x\":1,\"y\":2}");
            Assert.AreEqual(CmdKind.Build, cancel.Kind);
            Assert.AreEqual("cancel", cancel.Name);
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

        private static BuildSystem FindBuild(Simulation sim)
        {
            foreach (var s in sim.Systems) if (s is BuildSystem b) return b;
            return null;
        }

        [Test]
        public void Build_Command_Designates_At_Next_Tick_Boundary()
        {
            var (gs, host, _) = Boot();
            var build = FindBuild(host.Sim);
            Assert.IsNotNull(build, "the shipping stack registers a BuildSystem");

            // Find a legal designation tile on deck 0 (the session boots on deck 0).
            Int3? target = null;
            for (int y = 0; y < host.Sim.World.Height && target == null; y++)
                for (int x = 0; x < host.Sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    if (build.CanDesignate(host.Sim, p, BuildKind.Wall)) { target = p; break; }
                }
            Assert.IsNotNull(target, "the boot ship has at least one designatable tile");

            gs.ApplyForTest(new WebCommand(CmdKind.Build, target.Value.X, target.Value.Y, name: "wall"));
            Assert.IsFalse(build.TryGet(target.Value, out _), "the designation waits for the tick boundary");
            host.Sim.Tick(); // the enqueued DesignateBuildCommand drains here
            Assert.IsTrue(build.TryGet(target.Value, out var pending), "the build command designated the tile");
            Assert.AreEqual(BuildKind.Wall, pending.Kind);

            gs.ApplyForTest(new WebCommand(CmdKind.Build, target.Value.X, target.Value.Y, name: "cancel"));
            host.Sim.Tick();
            Assert.IsFalse(build.TryGet(target.Value, out _), "cancel removed the designation");
        }

        [Test]
        public void Roster_Channel_Is_Rendered_Cached_And_Lists_Living_Crew()
        {
            var (gs, host, _) = Boot();
            gs.RenderForTest();
            string roster = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"roster\""));
            Assert.IsNotNull(roster, "the roster channel is cached for Snapshot catch-up");
            int living = host.Sim.Citizens.Items.Count(c => !c.Dead);
            Assert.AreEqual(living, CountOccurrences(roster, "\"cid\":"), "one row per living crew member");
            foreach (var c in host.Sim.Citizens.Items.Where(c => !c.Dead))
                StringAssert.Contains("\"name\":\"" + c.Name + "\"", roster);
            StringAssert.Contains("\"task\":", roster);
            StringAssert.Contains("\"morale\":", roster);
        }

        [Test]
        public void Slice_Crew_Get_GenderConsistent_Pawn_Variants()
        {
            var (gs, host, _) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            var snapshot = gs.Snapshot();
            string roster = snapshot.First(s => s.Contains("\"type\":\"roster\""));
            string frame = snapshot.First(s => s.Contains("\"type\":\"frame\""));

            // Join frame pv to names through the shared cid.
            var pvByCid = ParseFrameCrewPv(frame);
            Assert.IsNotEmpty(pvByCid, "the slice boot frame shows crew");
            var expected = new Dictionary<string, int>
            {
                ["Amara Okonkwo"] = 2, ["Priya Raghavan"] = 2, ["Nadia Hassan"] = 2, ["Grace Oyelaran"] = 2,
                ["Dmitri Volkov"] = 1, ["Salif Camara"] = 1, ["Tomas Ferreira"] = 1, ["Wei Chen"] = 0,
            };
            int checkedCount = 0;
            foreach (var c in host.Sim.Citizens.Items.Where(c => !c.Dead))
            {
                if (!expected.TryGetValue(c.Name, out int want)) continue;
                if (!pvByCid.TryGetValue(c.Id, out int got)) continue; // not visible on deck 0 — fine
                Assert.AreEqual(want, got, c.Name + " must use the gender-matching pawn variant");
                checkedCount++;
            }
            Assert.That(checkedCount, Is.GreaterThan(0), "at least one authored crew member was visible to check");
            StringAssert.Contains("Amara Okonkwo", roster, "the roster names the authored crew");
        }

        /// <summary>Parse the frame's crew tuples [x,y,pv,cid] → cid → pv (tolerant, test-only).</summary>
        private static Dictionary<uint, int> ParseFrameCrewPv(string frameJson)
        {
            var result = new Dictionary<uint, int>();
            int i = frameJson.IndexOf("\"crew\":[", StringComparison.Ordinal);
            if (i < 0) return result;
            i += "\"crew\":[".Length;
            while (i < frameJson.Length && frameJson[i] == '[')
            {
                int end = frameJson.IndexOf(']', i);
                var parts = frameJson.Substring(i + 1, end - i - 1).Split(',');
                if (parts.Length >= 4)
                    result[uint.Parse(parts[3], CultureInfo.InvariantCulture)] =
                        int.Parse(parts[2], CultureInfo.InvariantCulture);
                i = end + 1;
                if (i < frameJson.Length && frameJson[i] == ',') i++;
            }
            return result;
        }

        private static int CountOccurrences(string s, string token)
        {
            int n = 0, i = 0;
            while ((i = s.IndexOf(token, i, StringComparison.Ordinal)) >= 0) { n++; i += token.Length; }
            return n;
        }
    }
}
