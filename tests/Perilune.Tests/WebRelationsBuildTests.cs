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
    /// The RELATIONS wire channel + the GameSession.BuildRelations bridge (the RELATIONS-tab
    /// feature). Pure-serializer assertions on WireFormat.Relations (tuple shape, JSON escaping,
    /// InvariantCulture), and GameSession-level proofs that (a) the relations channel is rendered,
    /// cached for Snapshot catch-up, and lists directed opinion edges; (b) the authored slice's
    /// concealed Nadia↔Salif bond surfaces with the secret flag + its note; (c) a note-less
    /// emergent edge degrades to empty note / secret=false; (d) dead/unnamed citizens are excluded.
    /// Mirrors WebRosterBuildTests patterns.
    /// </summary>
    public class WebRelationsBuildTests
    {
        // ------------------------------------------------------------------ serializer

        [Test]
        public void Relations_Serializes_Tuple_Shape_And_EmptyList()
        {
            var edges = new[]
            {
                new WireFormat.RelationEdge(7u, 9u, 40, (byte)RelationType.Friend, "trusts them", false),
                new WireFormat.RelationEdge(9u, 7u, -12, (byte)RelationType.Rival, "", true),
            };
            string json = WireFormat.Relations(edges);
            StringAssert.Contains("\"type\":\"relations\"", json);
            // tuple order: [from, to, opinion, tier, note, secret]
            StringAssert.Contains("[7,9,40,1,\"trusts them\",false]", json);
            StringAssert.Contains("[9,7,-12,3,\"\",true]", json);
            Assert.AreEqual("{\"type\":\"relations\",\"edges\":[]}",
                WireFormat.Relations(Array.Empty<WireFormat.RelationEdge>()));
        }

        [Test]
        public void Relations_Escapes_Notes_With_Umlauts_And_Quotes()
        {
            // de-DE dev machine: notes may carry umlauts; a quote/backslash must escape cleanly.
            var edges = new[]
            {
                new WireFormat.RelationEdge(1u, 2u, 5, 0, "möchte \"reden\"\\weg", false),
            };
            string json = WireFormat.Relations(edges);
            StringAssert.Contains("\"möchte \\\"reden\\\"\\\\weg\"", json);
        }

        /// <summary>
        /// THE INVARIANTCULTURE GUARD, MADE TO BITE — and this one got CLOSER than its siblings,
        /// which is exactly why it is worth writing down.
        ///
        /// ⚠️ THE VERSION THAT SHIPPED FIRST COULD NOT FAIL. Its author reached for the right lever:
        /// the fixture already carries a NEGATIVE opinion (<c>-40</c>), and
        /// <see cref="NumberFormatInfo.NegativeSign"/> really is the one knob that reaches a bare
        /// "G"-formatted integer (<c>int.ToString()</c> never groups, and .NET renders Latin digits
        /// for every built-in culture). But the culture was <c>new CultureInfo("de-DE")</c>
        /// UNMODIFIED — and de-DE's negative sign is U+002D HYPHEN-MINUS, byte-identical to the
        /// invariant one. So the lever was there and nothing was pulling it. VERIFIED by physically
        /// applying the mutation: dropping <c>Ic</c> from <c>e.Opinion.ToString(Ic)</c> left this test
        /// GREEN. <b>A negative fixture is necessary and not sufficient; the culture has to differ on
        /// the sign as well.</b> One line — cloning the culture and bending
        /// <c>NegativeSign</c> — is the whole fix.
        ///
        /// ⚠️ <c>RelationEdge.From</c>/<c>.To</c> ARE <c>uint</c> AND <c>.Tier</c> IS <c>byte</c>:
        /// none can be negative, so no fixture makes their <c>ToString(Ic)</c> differ from
        /// <c>ToString()</c>. Dropping <c>Ic</c> from those three is an EQUIVALENT MUTANT — provably
        /// unkillable, not untested code. The claim below is scoped to <c>Opinion</c> deliberately.
        ///
        /// MUTATION: drop <c>Ic</c> from <c>e.Opinion.ToString(Ic)</c> in
        /// <see cref="WireFormat.Relations"/> ⇒ this fails.
        /// </summary>
        [Test]
        public void Relations_Serialization_Is_InvariantCulture()
        {
            var edges = new[] { new WireFormat.RelationEdge(1u, 2u, -40, 4, "", false) };
            var loud = (CultureInfo)CultureInfo.GetCultureInfo("de-DE").Clone();
            loud.NumberFormat.NegativeSign = "MINUS";   // plain de-DE's is '-', same as invariant

            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = loud;

                // NON-VACUITY, FIRST: the culture must actually change what a bare ToString() emits,
                // or everything below is the test that could not fail, again.
                Assert.AreEqual("MINUS3", (-3).ToString(),
                    "the ambient culture does not perturb a bare int.ToString(), so this guard is " +
                    "decoration. Pick a culture knob that DOES reach an integer before trusting it.");

                string de = WireFormat.Relations(edges);
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Relations(edges);
                Assert.AreEqual(inv, de, "relations bytes are culture-independent");
                StringAssert.Contains("[1,2,-40,4,\"\",false]", de, "integers stay ASCII, sign kept");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        // ------------------------------------------------------------------ session

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Slice
                ? SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice)
                : SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host);
        }

        [Test]
        public void Relations_Channel_Is_Rendered_And_Cached_For_Snapshot()
        {
            var (gs, _) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            string rel = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"relations\""));
            Assert.IsNotNull(rel, "the relations channel is cached for Snapshot catch-up");
            StringAssert.Contains("\"edges\":[", rel);
        }

        [Test]
        public void Relations_Surfaces_The_Concealed_Nadia_Salif_Bond_With_Note()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            string rel = gs.Snapshot().First(s => s.Contains("\"type\":\"relations\""));

            uint nadia = CidByName(host, "Nadia Hassan");
            uint salif = CidByName(host, "Salif Camara");

            // Both directed edges of the pair are marked secret and carry their authored notes.
            var nToS = FindEdge(rel, nadia, salif);
            var sToN = FindEdge(rel, salif, nadia);
            Assert.IsNotNull(nToS, "Nadia→Salif edge is on the wire");
            Assert.IsNotNull(sToN, "Salif→Nadia edge is on the wire");
            Assert.IsTrue(nToS.Value.secret, "the concealed bond ships secret=true (Nadia→Salif)");
            Assert.IsTrue(sToN.Value.secret, "the concealed bond ships secret=true (Salif→Nadia)");
            StringAssert.Contains("fond of him", nToS.Value.note);
            StringAssert.Contains("owes her", sToN.Value.note);
            Assert.AreEqual(32, nToS.Value.opinion, "Nadia's authored opinion of Salif (unmoved at boot)");
            Assert.AreEqual(25, sToN.Value.opinion, "Salif's authored opinion of Nadia (unmoved at boot)");
        }

        [Test]
        public void Relations_NonSecret_Edge_Has_Secret_False_And_Its_Note()
        {
            var (gs, host) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            string rel = gs.Snapshot().First(s => s.Contains("\"type\":\"relations\""));

            uint dmitri = CidByName(host, "Dmitri Volkov");
            uint salif = CidByName(host, "Salif Camara");
            var dToS = FindEdge(rel, dmitri, salif);
            Assert.IsNotNull(dToS, "Dmitri→Salif (the reactor feud) edge is on the wire");
            Assert.IsFalse(dToS.Value.secret, "an ordinary bond is not secret");
            Assert.AreEqual(-40, dToS.Value.opinion, "the authored hostile opinion (unmoved at boot)");
            StringAssert.Contains("blames Salif's welds", dToS.Value.note);
        }

        [Test]
        public void Relations_Emergent_NoteLess_Edge_Degrades_Gracefully()
        {
            // An emergent edge (proximity accrual / social events) has no authored note or secret —
            // the UI must degrade: no tag box; the tier word is the readout fallback. Seed one
            // deterministically between two slice crew with NO authored relationship (Amara↔Wei),
            // exactly as the SocialSystem would on co-location, then render.
            var (gs, host) = Boot(ShipChoice.Slice);
            uint amara = CidByName(host, "Amara Okonkwo");
            uint wei = CidByName(host, "Wei Chen");
            host.Social.Nudge(amara, wei, 15f, host.Sim.Defs.Social);
            gs.RenderForTest();
            string rel = gs.Snapshot().First(s => s.Contains("\"type\":\"relations\""));

            var edge = FindEdge(rel, amara, wei);
            Assert.IsNotNull(edge, "the seeded emergent edge reaches the wire");
            Assert.AreEqual("", edge.Value.note, "an emergent edge carries no authored note");
            Assert.IsFalse(edge.Value.secret, "an emergent edge is never secret");
            Assert.AreEqual(15, edge.Value.opinion, "the emergent opinion rounds through as-is");
        }

        [Test]
        public void Relations_Excludes_Edges_Touching_Unnamed_Citizens()
        {
            // Every edge on the wire must resolve to two LIVING, NAMED citizens (mirrors the
            // roster's living-only contract and CitizenContext.RenderCrewRelations dead-exclusion).
            var (gs, host) = Boot(ShipChoice.Slice);
            gs.RenderForTest();
            string rel = gs.Snapshot().First(s => s.Contains("\"type\":\"relations\""));

            var named = new HashSet<uint>();
            foreach (var c in host.Sim.Citizens.Items)
                if (!c.Dead && !string.IsNullOrEmpty(c.Name)) named.Add(c.Id);

            foreach (var e in ParseEdges(rel))
            {
                Assert.IsTrue(named.Contains(e.from), "edge From is a living, named crew id");
                Assert.IsTrue(named.Contains(e.to), "edge To is a living, named crew id");
            }
        }

        // ------------------------------------------------------------------ tiny parsers (test-only)

        private static uint CidByName(SimHost host, string name)
        {
            foreach (var c in host.Sim.Citizens.Items) if (c.Name == name) return c.Id;
            throw new AssertionException("no citizen named " + name);
        }

        private struct Edge { public uint from, to; public int opinion; public int tier; public string note; public bool secret; }

        /// <summary>Parse the relations payload's edge tuples [from,to,opinion,tier,"note",secret].</summary>
        private static List<Edge> ParseEdges(string json)
        {
            var result = new List<Edge>();
            int i = json.IndexOf("\"edges\":[", StringComparison.Ordinal);
            if (i < 0) return result;
            i += "\"edges\":[".Length;
            while (i < json.Length && json[i] == '[')
            {
                int end = json.IndexOf(']', i);
                // find the note string boundaries (the 5th field, quoted) so commas inside it don't split
                int q1 = json.IndexOf('"', i);
                int q2 = json.IndexOf('"', q1 + 1);
                while (q2 > 0 && json[q2 - 1] == '\\') q2 = json.IndexOf('"', q2 + 1);
                string head = json.Substring(i + 1, q1 - (i + 1)); // "from,to,opinion,tier,"
                var nums = head.TrimEnd(',').Split(',');
                string tail = json.Substring(q2 + 1, end - (q2 + 1)); // ",secret"
                var e = new Edge
                {
                    from = uint.Parse(nums[0], CultureInfo.InvariantCulture),
                    to = uint.Parse(nums[1], CultureInfo.InvariantCulture),
                    opinion = int.Parse(nums[2], CultureInfo.InvariantCulture),
                    tier = int.Parse(nums[3], CultureInfo.InvariantCulture),
                    note = Unescape(json.Substring(q1 + 1, q2 - (q1 + 1))),
                    secret = tail.Contains("true"),
                };
                result.Add(e);
                i = end + 1;
                if (i < json.Length && json[i] == ',') i++;
            }
            return result;
        }

        private static Edge? FindEdge(string json, uint from, uint to)
        {
            foreach (var e in ParseEdges(json)) if (e.from == from && e.to == to) return e;
            return null;
        }

        private static string Unescape(string s) =>
            s.Replace("\\\"", "\"").Replace("\\\\", "\\");
    }
}
