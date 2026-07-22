using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W0-5 — the <c>[production]</c> conversion-graph node table, the container
    /// <c>SimDefs.Recipes</c> could never be (one row per DeviceKind, single-in/single-out,
    /// second bill overwrites the first).
    ///
    /// The load-bearing claim of this package is <b>additive</b>: the table ships EMPTY,
    /// so shipped crafting still runs the legacy <c>Recipes[]</c> row through
    /// <see cref="ProductionDefs.TryGetBill"/>'s fallback leg, and the defs checksum is
    /// byte-identical to pre-W0-5. Every test below is paired with a NAMED MUTATION in its
    /// doc comment that makes it fail (§5.2 rule 2) — each was applied, observed red, and
    /// reverted.
    ///
    /// The tests drive the REAL <see cref="CraftingSystem"/> against a real
    /// <see cref="Simulation"/> and assert observable sim state (items produced, items
    /// consumed, Device.Progress). Nothing here re-derives an expected value with the same
    /// expression the code uses (§5.2 rule 1).
    ///
    /// Row shape (W0-5 review, B4): <c>ID STATION WORK_S INPUTS OUTPUTS</c>. There is no
    /// yield column — conversion loss is the integer input:output ratio — so this table
    /// contains no float and no decimal text at all.
    /// </summary>
    public class DefsProductionTests
    {
        // ------------------------------------------------------------------ helpers

        private static SimDefs Parse(string text, out List<string> problems)
        {
            problems = new List<string>();
            return DefsParser.Parse(new[] { ("t.def", text) }, problems);
        }

        private static SimDefs ParseClean(string text)
        {
            var d = Parse(text, out var problems);
            Assert.That(problems, Is.Empty, "unexpected parse problems: " + string.Join(" | ", problems));
            return d;
        }

        /// <summary>A powered Fabricator with a citizen and whatever cargo the caller stages
        /// on the bench's +x neighbour. Same shape as DefsEquivalenceTests' craft scenario, so
        /// CraftingSystem really recruits, stages, consumes and spawns.
        ///
        /// Bench at (3,2,0). Its 4-neighbours are (4,2), (2,2) and the conduit row above;
        /// (5,2) and (1,2) are NOT adjacent, so cargo placed there must genuinely be FETCHED.</summary>
        private static Simulation BuildBenchScenario(SimDefs defs)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss), defs);

            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Fabricator, new Int3(3, 2, 0), "fab");

            sim.AddCitizen("Smith", new Int3(1, 2, 0)); // AutoWander false → recruitable

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>Ground-truth count of loose units of a kind (carried stacks excluded).</summary>
        private static int UnitsOnGround(Simulation sim, ItemKind kind)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Kind == kind && items[i].CarriedBy == 0) n += items[i].Count;
            return n;
        }

        private static int UnitsAnywhere(Simulation sim, ItemKind kind)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Kind == kind) n += items[i].Count;
            return n;
        }

        private static void Run(Simulation sim, int ticks)
        {
            for (int t = 0; t < ticks; t++) sim.Tick();
        }

        // ------------------------------------------------- default equivalence / checksum

        /// <summary>
        /// The container ships EMPTY, and an empty table is a checksum no-op — so W0-5 does
        /// not move the defs fingerprint (which is written into every save header,
        /// SaveWriter.cs:344) at all.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in SimDefs.CreateDefault, ship one node —
        /// <c>d.Production = new ProductionDefs { Nodes = new[] { new ProductionNode("x",
        /// DeviceKind.Fabricator, 30, new[] { new ProductionPort(ItemKind.Scrap, 2) },
        /// new[] { new ProductionPort(ItemKind.Parts, 1) }) } };</c> — the Nodes.Length
        /// assertion fails. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void CompiledDefault_ShipsAnEmptyTable()
        {
            Assert.That(SimDefs.Default.Production, Is.Not.Null);
            Assert.That(SimDefs.Default.Production.Nodes, Is.Not.Null);
            Assert.That(SimDefs.Default.Production.Nodes.Length, Is.EqualTo(0),
                "W0-5 ships the container, not content: shipped crafting still runs [recipes]");
            Assert.That(SimDefs.Default.Production.CountFor(DeviceKind.Fabricator), Is.EqualTo(0));
        }

        /// <summary>
        /// The shipped production.def is verbatim equal to the compiled default — it declares
        /// the section and no rows — so parsing it yields the same empty table AND the same
        /// checksum as CreateDefault. This is the def-field ritual's "shipped .def line equals
        /// the compiled default" step for a table whose default is empty.
        ///
        /// MUTATION THAT MAKES THIS FAIL: uncomment the <c>fab_parts</c> worked example in
        /// <c>content/core/SimDefs/production.def</c> — the parsed table gains a node and the
        /// checksum diverges from SimDefs.Default. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void ShippedProductionDef_IsEmpty_AndLeavesTheChecksumUnmoved()
        {
            string dir = FindSimDefsDir();
            Assert.That(dir, Is.Not.Null, "content/core/SimDefs must be discoverable");
            string path = System.IO.Path.Combine(dir, "production.def");
            Assert.That(System.IO.File.Exists(path), Is.True, "production.def must ship");

            var problems = new List<string>();
            var parsed = DefsParser.Parse(
                new[] { ("production.def", System.IO.File.ReadAllText(path)) }, problems);

            Assert.That(problems, Is.Empty,
                "the shipped production.def must parse with zero problems (a typo'd section name " +
                "would show up here as 'unknown section'): " + string.Join(" | ", problems));
            Assert.That(parsed.Production.Nodes.Length, Is.EqualTo(0));
            Assert.That(parsed.Checksum, Is.EqualTo(SimDefs.Default.Checksum),
                "an empty [production] table folds nothing — the shipped defs checksum is unmoved");
        }

        private static string FindSimDefsDir()
        {
            var dir = new System.IO.DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = System.IO.Path.Combine(dir.FullName, "content", "core", "SimDefs");
                if (System.IO.Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }

        /// <summary>
        /// The defs MUTATION PROBE for this section: a declared node changes the checksum, and
        /// so does its ORDER (this table is an ordered list, unlike [machines]/[recipes], and
        /// order decides which bill a station resolves).
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the Production fold block from
        /// <see cref="SimDefs.ComputeChecksum"/> — both assertions collapse to equality.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void DeclaredNodes_ChangeTheChecksum_AndSoDoesRowOrder()
        {
            var one = ParseClean("[production]\nfab_parts Fabricator 30 Scrap:2 Parts:1\n");
            Assert.That(one.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                "a declared production node must move the defs checksum");

            // Two stations, so no ordinal-0 warning fires and both graphs parse clean.
            var orderA = ParseClean(
                "[production]\n" +
                "fab_parts Fabricator 30 Scrap:2 Parts:1\n" +
                "rec_scrap SalvageRecycler 20 Regolith:1 Scrap:2\n");
            var orderB = ParseClean(
                "[production]\n" +
                "rec_scrap SalvageRecycler 20 Regolith:1 Scrap:2\n" +
                "fab_parts Fabricator 30 Scrap:2 Parts:1\n");
            Assert.That(orderB.Checksum, Is.Not.EqualTo(orderA.Checksum),
                "[production] row order is a VALUE (it decides ordinal-0 selection), not formatting");
        }

        // ------------------------------------------------------------------ the parser

        /// <summary>
        /// The shape a future E-PROD lane writes: many inputs, many outputs, integer loss
        /// ratios, and TWO nodes on ONE station coexisting in the data instead of overwriting
        /// — the single thing <c>[recipes]</c> cannot express.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>DefsParser.ApplyProductionRow</c>, key the
        /// table by station instead of id (replace the id comparison with
        /// <c>nodes[i].Station == station</c>) — the second Fabricator row overwrites the
        /// first and both the Nodes.Length and CountFor assertions fail.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void TwoNodesOnOneStation_Coexist_WithMultiPorts()
        {
            var d = Parse(
                "[production]\n" +
                "# id            station          work_s  inputs               outputs\n" +
                "fab_parts       Fabricator       30      Scrap:2              Parts:1\n" +
                "fab_composite   Fabricator       45      Scrap:3+Regolith:1   Parts:2+Scrap:1\n" +
                "scrap_corpse    SalvageRecycler  60      Corpse:1             none\n",
                out var problems);

            Assert.That(d.Production.Nodes.Length, Is.EqualTo(3));
            Assert.That(d.Production.CountFor(DeviceKind.Fabricator), Is.EqualTo(2),
                "two bills on one station must COEXIST — that is the whole point of the table");

            Assert.That(d.Production.TryGetNode(DeviceKind.Fabricator, 0, out var first), Is.True);
            Assert.That(first.Id, Is.EqualTo("fab_parts"));
            Assert.That(first.WorkSeconds, Is.EqualTo(30));

            Assert.That(d.Production.TryGetNode(DeviceKind.Fabricator, 1, out var second), Is.True);
            Assert.That(second.Id, Is.EqualTo("fab_composite"));
            Assert.That(second.Inputs.Length, Is.EqualTo(2));
            Assert.That(second.Inputs[0].Kind, Is.EqualTo(ItemKind.Scrap));
            Assert.That(second.Inputs[0].Count, Is.EqualTo(3));
            Assert.That(second.Inputs[1].Kind, Is.EqualTo(ItemKind.Regolith));
            Assert.That(second.Inputs[1].Count, Is.EqualTo(1));
            Assert.That(second.Outputs.Length, Is.EqualTo(2));
            Assert.That(second.Outputs[0].Kind, Is.EqualTo(ItemKind.Parts));
            Assert.That(second.Outputs[0].Count, Is.EqualTo(2));

            Assert.That(d.Production.TryGetNode(DeviceKind.SalvageRecycler, 0, out var sink), Is.True);
            Assert.That(sink.Outputs.Length, Is.EqualTo(0), "'none' outputs = a pure sink");

            // ...and coexisting-in-the-data is NOT the same as both running. See the next test.
            Assert.That(problems, Has.Some.Contains("2 nodes are declared on Fabricator"));
        }

        /// <summary>
        /// B3 — the ordinal-0 limitation must not be SILENT, by ANY route that reaches it.
        /// Declaring a second node on a station is legal, parses and folds into the checksum,
        /// but only the first is ever run; the author is told so, with the running node named,
        /// every shadowed node named, and a pointer to the §13 entry. (`production.def` teaches
        /// exactly this pair, so an author who copies the worked examples hits it immediately.)
        ///
        /// The THIRD case is the one a per-row check cannot see and the first version of this
        /// fix missed: an overlay row (same id) that RETARGETS the node onto a station which
        /// already has one. Retargeting is precisely what the overlay contract advertises, and
        /// the overlay branch returned before any per-row scan — measured, it installed a
        /// silent dead node with an empty problems list. The check is now one pass over the
        /// ASSEMBLED table, which has no such route.
        ///
        /// MUTATION THAT MAKES THIS FAIL: make <c>WarnOnShadowedNodes</c> a no-op (early
        /// <c>return</c>) — all three cases still parse, still fold, and say nothing.
        /// A SECOND mutation, which reintroduces exactly the reviewed bug: move the scan back
        /// into <c>ApplyProductionRow</c> after the overlay <c>return</c> — cases 1 and 2 stay
        /// green and only the retarget case fails, which is why it is here.
        /// (Both applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void SecondNodeOnAStation_Parses_ButWarnsThatOnlyTheFirstRuns()
        {
            // Case 1: two fresh declarations on one station.
            var d = Parse(
                "[production]\n" +
                "fab_parts Fabricator 30 Scrap:2 Parts:1\n" +
                "fab_seals Fabricator 15 Regolith:1 Parts:2\n",
                out var problems);

            Assert.That(d.Production.Nodes.Length, Is.EqualTo(2), "the row still lands");
            Assert.That(problems.Count, Is.EqualTo(1));
            Assert.That(problems[0], Does.Contain("2 nodes are declared on Fabricator"));
            Assert.That(problems[0], Does.Contain("'fab_parts' (the first in table order)"),
                "name the node that actually RUNS");
            Assert.That(problems[0], Does.Contain("shadowed: 'fab_seals'"), "name the dead one");
            Assert.That(problems[0], Does.Contain("13.12"), "point at the §13 entry that records it");

            // The warning is honest: ordinal 1 really is never selected.
            Assert.That(ProductionDefs.TryGetBill(d, DeviceKind.Fabricator, out var bill), Is.True);
            Assert.That(bill.Id, Is.EqualTo("fab_parts"));

            // Case 2: THE OVERLAY-RETARGET ROUTE. 'b' is declared on SalvageRecycler, then
            // re-declared (same id ⇒ overlay, in place) onto Fabricator, which already has a
            // node. Before the whole-table scan this produced nodes=2, CountFor(Fabricator)=2
            // and problems=[] — a silent dead node, by the exact contract production.def
            // advertises the overlay for.
            var e = Parse(
                "[production]\n" +
                "a Fabricator      30 Scrap:2    Parts:1\n" +
                "b SalvageRecycler 20 Regolith:1 Scrap:2\n" +
                "b Fabricator      40 Scrap:3    Parts:2\n",
                out var problems2);

            Assert.That(e.Production.Nodes.Length, Is.EqualTo(2), "the overlay replaces in place");
            Assert.That(e.Production.CountFor(DeviceKind.Fabricator), Is.EqualTo(2),
                "premise: the retarget really did put a second node on the Fabricator");
            Assert.That(e.Production.CountFor(DeviceKind.SalvageRecycler), Is.EqualTo(0),
                "premise: and really did leave the station it came from");
            Assert.That(problems2.Count, Is.EqualTo(1), "the retarget must NOT be silent");
            Assert.That(problems2[0], Does.Contain("2 nodes are declared on Fabricator"));
            Assert.That(problems2[0], Does.Contain("shadowed: 'b'"));

            // Case 3: three on one station — every shadowed node is named, once per station.
            var f = Parse(
                "[production]\n" +
                "n1 Fabricator 30 Scrap:2    Parts:1\n" +
                "n2 Fabricator 31 Scrap:3    Parts:1\n" +
                "n3 Fabricator 32 Regolith:1 Parts:1\n",
                out var problems3);
            Assert.That(f.Production.Nodes.Length, Is.EqualTo(3));
            Assert.That(problems3.Count, Is.EqualTo(1), "one problem per STATION, not per row");
            Assert.That(problems3[0], Does.Contain("3 nodes are declared on Fabricator"));
            Assert.That(problems3[0], Does.Contain("shadowed: 'n2', 'n3'"));
        }

        /// <summary>
        /// Item 2 — the no-repeated-kind invariant holds at the TYPE boundary, not only in the
        /// text parser. This container ships so a future lane can build nodes programmatically,
        /// and a node built in code with two ports of one kind makes the sim create matter
        /// (measured: 1 Scrap in, 1 Parts out on a 2-Scrap bill).
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the two <c>RequireNoRepeatedKind</c> calls
        /// from the <see cref="ProductionNode"/> constructor — both constructions succeed and
        /// no exception is thrown. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void ProductionNodeConstructor_RefusesARepeatedKind_OnEitherSide()
        {
            var scrap1 = new ProductionPort(ItemKind.Scrap, 1);
            var parts1 = new ProductionPort(ItemKind.Parts, 1);

            var onInputs = Assert.Throws<ArgumentException>(() => new ProductionNode(
                "dup", DeviceKind.Fabricator, 5,
                new[] { scrap1, scrap1 }, new[] { parts1 }));
            Assert.That(onInputs.Message, Does.Contain("inputs names Scrap twice"));
            Assert.That(onInputs.Message, Does.Contain("creates matter"));

            var onOutputs = Assert.Throws<ArgumentException>(() => new ProductionNode(
                "dup2", DeviceKind.Fabricator, 5,
                new[] { scrap1 }, new[] { parts1, parts1 }));
            Assert.That(onOutputs.Message, Does.Contain("outputs names Parts twice"));

            // The legitimate shape — one kind per side — still constructs.
            Assert.DoesNotThrow(() => new ProductionNode(
                "ok", DeviceKind.Fabricator, 5,
                new[] { scrap1, new ProductionPort(ItemKind.Regolith, 1) }, new[] { parts1 }));
        }

        /// <summary>
        /// Item 3 — the two static matter-creation guards on the row itself. A port count is
        /// bounded for the same reason <c>work_s</c> is: unit counts feed int accumulators, and
        /// <c>Parts:2000000000</c> reaches 6e9 units after three batches, which wraps to
        /// 1,705,032,704. And a SAME-KIND gain (<c>Scrap:1 → Scrap:5</c>) is unambiguous matter
        /// creation, unlike a cross-kind ratio, which is designer convention and stays unpoliced.
        ///
        /// MUTATION THAT MAKES THIS FAIL: drop the upper half of the count guard in
        /// <c>TryPorts</c> (back to <c>if (count &lt; 1)</c>) — the 2000000000 row lands.
        /// A SECOND mutation: delete the same-kind gain loop in <c>ApplyProductionRow</c> — the
        /// <c>Scrap:1 → Scrap:5</c> row lands. (Both applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void PortCounts_AreBounded_AndASameKindGainIsRefused()
        {
            var huge = Parse("[production]\nbig Fabricator 30 Scrap:1 Parts:2000000000\n", out var p1);
            Assert.That(huge.Production.Nodes.Length, Is.EqualTo(0));
            Assert.That(p1, Has.Some.Contains("count must be in [1, 10000]"));

            var mint = Parse("[production]\nmint Fabricator 30 Scrap:1 Scrap:5\n", out var p2);
            Assert.That(mint.Production.Nodes.Length, Is.EqualTo(0));
            Assert.That(p2, Has.Some.Contains("same-kind gain is unambiguous matter creation"));

            // Same kind on both sides is fine when it LOSES — that is what a lossy loop is.
            var lossy = ParseClean("[production]\nlossy SalvageRecycler 20 Scrap:20 Scrap:17\n");
            Assert.That(lossy.Production.Nodes.Length, Is.EqualTo(1));

            // ...and a CROSS-kind gain stays legal: Regolith:1 -> Seals:2 is ECONOMY.md §4's
            // own design, and units of different kinds are not comparable without a mass model.
            var cross = ParseClean("[production]\ncross Fabricator 30 Regolith:1 Parts:2\n");
            Assert.That(cross.Production.Nodes.Length, Is.EqualTo(1));
        }

        /// <summary>
        /// The .def overlay contract on an ORDERED table: a repeated id replaces in place, so a
        /// pack can retune a core node without changing table order (and therefore without
        /// changing which bill a station resolves) — and without tripping the second-node
        /// warning, because it is not a second node.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>ApplyProductionRow</c>, always
        /// <c>nodes.Add(node)</c> instead of replacing at <c>existing</c> — Nodes.Length
        /// becomes 3 and ordinal 0 stays the stale 30 s row. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void RepeatedNodeId_ReplacesInPlace_PreservingTableOrder()
        {
            var d = ParseClean(
                "[production]\n" +
                "fab_parts Fabricator 30 Scrap:2 Parts:1\n" +
                "rec_scrap SalvageRecycler 20 Regolith:1 Scrap:2\n" +
                "fab_parts Fabricator 99 Scrap:4 Parts:3\n");

            Assert.That(d.Production.Nodes.Length, Is.EqualTo(2), "the repeat overlays, it does not append");
            Assert.That(d.Production.Nodes[0].Id, Is.EqualTo("fab_parts"), "order preserved");
            Assert.That(d.Production.Nodes[0].WorkSeconds, Is.EqualTo(99), "the later row's values win");
            Assert.That(d.Production.Nodes[1].Id, Is.EqualTo("rec_scrap"));
        }

        /// <summary>
        /// B1 — a kind may not appear twice within one side, and the parser is where that is
        /// enforced. It is not a style rule: staging is checked per port against the AGGREGATE
        /// staged units of the port's kind, while consumption is per port with a restarted
        /// scan, so <c>Scrap:1+Scrap:1</c> lets ONE staged unit satisfy BOTH ports — port 0
        /// drains it, port 1 consumes nothing, and the batch runs anyway. Measured before the
        /// fix, driving the real system with one Scrap against a bill declaring two:
        /// <c>Scrap left=0, Parts made=1</c> — matter created out of the encoding.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the duplicate-kind loop in
        /// <c>DefsParser.TryPorts</c> — the row lands, Nodes.Length becomes 1, and the
        /// behavioural half below then really does create matter.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void DuplicateKindWithinOneSide_IsRejected_BecauseItWouldCreateMatter()
        {
            var d = Parse("[production]\ndup Fabricator 5 Scrap:1+Scrap:1 Parts:1\n", out var problems);
            Assert.That(d.Production.Nodes.Length, Is.EqualTo(0), "the row must not land");
            Assert.That(problems, Has.Some.Contains("names Scrap twice in inputs"));
            Assert.That(problems, Has.Some.Contains("create matter"));

            // Outputs too — same rule, same reason to keep the invariant one-sided-free.
            var e = Parse("[production]\ndup2 Fabricator 5 Scrap:2 Parts:1+Parts:1\n", out var problems2);
            Assert.That(e.Production.Nodes.Length, Is.EqualTo(0));
            Assert.That(problems2, Has.Some.Contains("names Parts twice in outputs"));

            // ...and the behavioural half: with the row refused, the bench falls back to the
            // legacy recipe, which needs 2 Scrap and cannot run on 1. Nothing is consumed and
            // nothing is created.
            var sim = BuildBenchScenario(d);
            sim.AddItem(ItemKind.Scrap, 1, new Int3(4, 2, 0));
            Run(sim, 2000);
            Assert.That(UnitsAnywhere(sim, ItemKind.Scrap), Is.EqualTo(1), "one Scrap cannot fund a 2-Scrap bill");
            Assert.That(UnitsAnywhere(sim, ItemKind.Parts), Is.EqualTo(0), "and no Parts may appear from nowhere");
        }

        /// <summary>
        /// Fail-soft, and strict exactly where a bad value would be UNSAFE rather than merely
        /// wrong: <c>work_s = 0</c> would make CraftingSystem divide by zero and
        /// <c>work_s = 300000000</c> overflows the derived tick count into a silent input
        /// shredder (N3); a node with no inputs is a matter SOURCE (ECONOMY.md §2.1). Each is
        /// warned about and the table keeps the good rows.
        ///
        /// MUTATION THAT MAKES THIS FAIL: widen the guard in <c>ApplyProductionRow</c> to
        /// <c>if (work &lt; 1)</c> only — the 300000000 row lands and Nodes.Length becomes 2.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void MalformedRows_AreWarnedAndSkipped_GoodRowsSurvive()
        {
            var d = Parse(
                "[production]\n" +
                "ok_row     Fabricator  30          Scrap:2       Parts:1\n" +
                "zero_work  Fabricator  0           Scrap:2       Parts:1\n" +
                "huge_work  Fabricator  300000000   Scrap:2       Parts:1\n" +
                "no_inputs  Fabricator  30          none          Parts:1\n" +
                "bad_port   Fabricator  30          Scrap         Parts:1\n" +
                "bad_kind   Fabricator  30          Unobtanium:1  Parts:1\n" +
                "stray_plus Fabricator  30          Scrap:2+      Parts:1\n" +
                "bad_count  Fabricator  30          Scrap:0x2     Parts:1\n" +
                "too_few    Fabricator  30          Scrap:2\n",
                out var problems);

            Assert.That(d.Production.Nodes.Length, Is.EqualTo(1), "only the good row lands: "
                + string.Join(" | ", problems));
            Assert.That(d.Production.Nodes[0].Id, Is.EqualTo("ok_row"));
            Assert.That(problems.Count, Is.EqualTo(8), "every bad row warns exactly once: "
                + string.Join(" | ", problems));
            Assert.That(problems, Has.Some.Contains("work_s must be in [1, 86400]"));
            Assert.That(problems, Has.Some.Contains("matter source"));
            Assert.That(problems, Has.Some.Contains("must be Kind:count"));
            Assert.That(problems, Has.Some.Contains("stray '+'"));
            Assert.That(problems, Has.Some.Contains("5 columns"));
            // N8: a bad port count reports the row as SKIPPED, never "keeping default" —
            // there is no default for a port to keep.
            Assert.That(problems, Has.Some.Contains("count expects an integer, got '0x2'"));
            Assert.That(problems, Has.None.Contains("keeping default"));
        }

        /// <summary>
        /// The de-DE guard for this table (ECONOMY-PLAN §4 trap 10). After B4 the row has no
        /// decimal column at all, so the honest thing to defend is not "0.85 survives" but
        /// "a locale's thousands/decimal punctuation is never silently swallowed": under
        /// de-DE, <c>Scrap:1.000</c> must be REFUSED, not read as 1000.
        ///
        /// A test asserting only that "20" parses as 20 under de-DE could not fail and would
        /// be exactly the tautology §5.2 forbids — this one can.
        ///
        /// WHAT IT ACTUALLY DEFENDS IS THE STYLE SET, not the culture argument. Verified by
        /// single-axis mutation: <c>InvariantCulture → CurrentCulture</c> alone stays GREEN,
        /// and <c>Integer → Integer|AllowThousands</c> alone stays GREEN; only the compound
        /// goes red, because <c>NumberStyles.Integer</c> is culture-inert for unsigned decimal
        /// text. The <c>InvariantCulture</c> argument is belt-and-braces here; the guarantee
        /// comes from refusing <c>AllowThousands</c>. Both parse sites in this table are
        /// covered — the port counts and <c>work_s</c>.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>DefsParser.TryPorts</c>, parse the count with
        /// <c>NumberStyles.Integer | NumberStyles.AllowThousands</c> and
        /// <c>CultureInfo.CurrentCulture</c> — under de-DE '.' is the group separator, so
        /// "1.000" parses as 1000, the row lands, and both assertions fail. The same compound
        /// mutation on <c>ApplyProductionRow</c>'s <c>work_s</c> parse reddens the second half.
        /// (Both applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void ProductionRow_UnderGermanLocale_RefusesLocalePunctuationInNumbers()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");

                var badCount = Parse("[production]\nlossy SalvageRecycler 20 Scrap:1.000 Regolith:17\n", out var problems);
                Assert.That(badCount.Production.Nodes.Length, Is.EqualTo(0),
                    "de-DE must not turn a port count '1.000' into 1000 — the row is refused");
                Assert.That(problems, Has.Some.Contains("count expects an integer, got '1.000'"));

                // The same guarantee on work_s, which had no culture/style coverage at all.
                var badWork = Parse("[production]\nslow SalvageRecycler 1.000 Scrap:20 Regolith:17\n", out var problems2);
                Assert.That(badWork.Production.Nodes.Length, Is.EqualTo(0),
                    "de-DE must not turn work_s '1.000' into 1000 — the row is refused");
                Assert.That(problems2, Has.Some.Contains("work_s expects an integer, got '1.000'"));

                // The plain row still parses identically under de-DE, values and all.
                var good = ParseClean("[production]\nlossy SalvageRecycler 20 Scrap:20 Regolith:17\n");
                Assert.That(good.Production.Nodes[0].Inputs[0].Count, Is.EqualTo(20));
                Assert.That(good.Production.Nodes[0].Outputs[0].Count, Is.EqualTo(17));
                Assert.That(good.Production.Nodes[0].WorkSeconds, Is.EqualTo(20));
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        // ------------------------------------------------------------------ the lookup

        /// <summary>
        /// The additive lookup's FALLBACK leg — the one shipped content actually takes. With
        /// an empty table the Fabricator resolves to its legacy Scrap→Parts recipe, one input
        /// port, one output port.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>ProductionDefs.TryGetBill</c>, return false
        /// instead of consulting <c>defs.Recipes</c> when no node matches — every assertion
        /// after the first fails. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void EmptyTable_TryGetBill_FallsBackToTheLegacyRecipeArray()
        {
            var defs = SimDefs.CreateDefault();

            Assert.That(ProductionDefs.TryGetBill(defs, DeviceKind.Fabricator, out var fab), Is.True);
            Assert.That(fab.IsGraphNode, Is.False, "shipped content declares no nodes — this must be the fallback");
            Assert.That(fab.WorkSeconds, Is.EqualTo(30));
            Assert.That(fab.InputPortCount, Is.EqualTo(1));
            Assert.That(fab.Input(0).Kind, Is.EqualTo(ItemKind.Scrap));
            Assert.That(fab.Input(0).Count, Is.EqualTo(2));
            Assert.That(fab.OutputPortCount, Is.EqualTo(1));
            Assert.That(fab.Output(0).Kind, Is.EqualTo(ItemKind.Parts));
            Assert.That(fab.Output(0).Count, Is.EqualTo(1));

            Assert.That(ProductionDefs.TryGetBill(defs, DeviceKind.Door, out var door), Is.False,
                "a non-crafting kind has neither a node nor a recipe");
            Assert.That(door.Defined, Is.False);
        }

        /// <summary>
        /// The additive lookup's PREFERENCE leg: declare a node on a station that ALSO has a
        /// legacy recipe, and the node wins — with its own ports, not the recipe's.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>TryGetBill</c>, check the legacy array first
        /// and only consult Production when the recipe is undefined — IsGraphNode is false and
        /// WorkSeconds reads 30. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void DeclaredNode_TryGetBill_PrefersItOverTheLegacyRecipe()
        {
            // Scrap out (1) must not exceed Scrap in (1) — a same-kind gain is refused now.
            var defs = ParseClean("[production]\nfab_alt Fabricator 7 Regolith:3+Scrap:1 Parts:4+Scrap:1\n");

            Assert.That(defs.Recipes[(int)DeviceKind.Fabricator].Defined, Is.True,
                "test premise: the Fabricator still has its legacy recipe to be preferred OVER");
            Assert.That(ProductionDefs.TryGetBill(defs, DeviceKind.Fabricator, out var bill), Is.True);
            Assert.That(bill.IsGraphNode, Is.True);
            Assert.That(bill.Id, Is.EqualTo("fab_alt"));
            Assert.That(bill.WorkSeconds, Is.EqualTo(7));
            Assert.That(bill.InputPortCount, Is.EqualTo(2));
            Assert.That(bill.OutputPortCount, Is.EqualTo(2));
        }

        // --------------------------------------------- the consumption tripwires (§13)

        /// <summary>
        /// CONSUMPTION TRIPWIRE #1 — a def field nothing reads is a lie. Drive the REAL
        /// CraftingSystem on a real Simulation with a declared node whose work time and output
        /// differ from the legacy recipe, and assert the sim produced the NODE's output.
        /// The path is asserted before the outcome (§5.2 rule 3): the staged Scrap must
        /// actually have been consumed, or the bench never ran and the item assertion would be
        /// vacuously about nothing.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>CraftingSystem.TryGetBill</c>, ignore the
        /// lookup and return <c>new ProductionBill(defs.Recipes[(int)kind])</c> directly — the
        /// bench produces 1 Parts (the legacy recipe) instead of 3 Regolith and the test fails.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void CraftingSystem_RunsADeclaredProductionNode_NotTheLegacyRecipe()
        {
            // A Fabricator node that is deliberately NOTHING like the shipped Scrap→Parts row.
            var defs = ParseClean("[production]\nfab_odd Fabricator 5 Scrap:2 Regolith:3\n");
            var sim = BuildBenchScenario(defs);
            sim.AddItem(ItemKind.Scrap, 2, new Int3(4, 2, 0)); // staged on the bench's +x neighbour

            Assert.That(UnitsAnywhere(sim, ItemKind.Regolith), Is.EqualTo(0), "premise: no Regolith aboard");

            Run(sim, 3000);

            // Path assertion first: the batch actually ran.
            Assert.That(UnitsAnywhere(sim, ItemKind.Scrap), Is.EqualTo(0),
                "the staged Scrap must have been CONSUMED — otherwise the bench never ran and "
                + "the output assertion below would prove nothing");
            // Outcome: the NODE's output, not the legacy recipe's.
            Assert.That(UnitsOnGround(sim, ItemKind.Regolith), Is.EqualTo(3),
                "the [production] node's output port must be what spawned");
            Assert.That(UnitsAnywhere(sim, ItemKind.Parts), Is.EqualTo(0),
                "the legacy Scrap→Parts recipe must NOT have run");
        }

        /// <summary>
        /// CONSUMPTION TRIPWIRE #2 — the multi-port machinery is real, not decorative: a node
        /// with TWO input ports consumes both kinds (fetching the one that is not staged) and
        /// a node with TWO output ports spawns both, in exact whole units.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>CraftingSystem</c>'s completion block, bound the
        /// output-port loop to <c>pIdx &lt; 1</c> — the second output port never spawns and the
        /// ControllerModule assertion fails. A second mutation that also breaks it: bound
        /// <c>AllInputsStaged</c>'s loop to <c>i &lt; 1</c>, and the batch starts on port 0 alone,
        /// consuming no Regolith and leaving 2 units on the floor. A third: bound
        /// <c>TryFirstShortPort</c> to port 0 and the fetch leg never goes for the Regolith.
        /// (All three applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void CraftingSystem_ConsumesEveryInputPort_AndSpawnsEveryOutputPort()
        {
            // 4 Scrap + 2 Regolith → 1 Parts + 2 ControllerModule. Deliberately lossy in the
            // RATIO (6 units in, 3 out) — that is what conversion loss looks like now.
            var defs = ParseClean(
                "[production]\nfab_multi Fabricator 5 Scrap:4+Regolith:2 Parts:1+ControllerModule:2\n");
            var sim = BuildBenchScenario(defs);
            sim.AddItem(ItemKind.Scrap, 4, new Int3(4, 2, 0)); // staged: (4,2) is a 4-neighbour of (3,2)
            // (5,2) is NOT a 4-neighbour of the bench, so port 1 genuinely has to be FETCHED.
            // Putting it on an adjacent tile instead would silently stage it and the multi-port
            // fetch leg would never run — the exact way this test could have been a tautology.
            sim.AddItem(ItemKind.Regolith, 2, new Int3(5, 2, 0));

            Run(sim, 6000);

            Assert.That(UnitsAnywhere(sim, ItemKind.Scrap), Is.EqualTo(0), "input port 0 consumed");
            Assert.That(UnitsAnywhere(sim, ItemKind.Regolith), Is.EqualTo(0),
                "input port 1 fetched and consumed — the multi-port fetch leg ran");
            Assert.That(UnitsOnGround(sim, ItemKind.Parts), Is.EqualTo(1), "output port 0");
            Assert.That(UnitsOnGround(sim, ItemKind.ControllerModule), Is.EqualTo(2),
                "output port 1 — a second output port really spawns");
        }

        /// <summary>
        /// The FALLBACK is what shipped content runs, proven on the real system rather than
        /// asserted about the lookup: with the shipped (empty) table, the same bench turns
        /// 2 Scrap into exactly 1 Parts — the legacy recipe, unchanged by W0-5.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>CraftingSystem</c>'s completion block, spawn
        /// <c>port.Count + 1</c> units — the shipped path produces 2 Parts.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void ShippedEmptyTable_TheBenchStillRunsTheLegacyRecipe()
        {
            var sim = BuildBenchScenario(SimDefs.CreateDefault());
            sim.AddItem(ItemKind.Scrap, 2, new Int3(4, 2, 0));

            Run(sim, 3000);

            Assert.That(UnitsAnywhere(sim, ItemKind.Scrap), Is.EqualTo(0), "the legacy batch consumed its input");
            Assert.That(UnitsOnGround(sim, ItemKind.Parts), Is.EqualTo(1),
                "shipped crafting is byte-for-byte what it was: Scrap:2 → Parts:1");
        }

        /// <summary>
        /// Determinism: an identical defs graph parsed twice must drive two sims to the same
        /// StateHash over a long run, and a DIFFERENT node must diverge them. The second half
        /// is the hash-level tripwire that CraftingSystem reads the table (the first half alone
        /// could pass with the table ignored entirely).
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>CraftingSystem.TryGetBill</c>, return the
        /// legacy recipe unconditionally — the two graphs stop differing observably and
        /// <c>diverged</c> stays false. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void ProductionNodes_AreDeterministic_AndAffectTheStateHash()
        {
            const string text = "[production]\nfab_a Fabricator 9 Scrap:2 Parts:1\n";
            var twinA = BuildBenchScenario(ParseClean(text));
            var twinB = BuildBenchScenario(ParseClean(text));
            twinA.AddItem(ItemKind.Scrap, 6, new Int3(4, 2, 0));
            twinB.AddItem(ItemKind.Scrap, 6, new Int3(4, 2, 0));

            for (int t = 1; t <= 3000; t++)
            {
                twinA.Tick();
                twinB.Tick();
                if (t % 500 == 0)
                    Assert.That(twinB.StateHash(), Is.EqualTo(twinA.StateHash()),
                        $"identical production tables must stay identical (tick {t})");
            }

            var slow = BuildBenchScenario(ParseClean("[production]\nfab_a Fabricator 90 Scrap:2 Parts:1\n"));
            var fast = BuildBenchScenario(ParseClean(text));
            slow.AddItem(ItemKind.Scrap, 6, new Int3(4, 2, 0));
            fast.AddItem(ItemKind.Scrap, 6, new Int3(4, 2, 0));
            Assert.That(slow.StateHash(), Is.EqualTo(fast.StateHash()), "defs are not in the hash — twins start equal");

            bool diverged = false;
            for (int t = 1; t <= 3000 && !diverged; t++)
            {
                slow.Tick();
                fast.Tick();
                if (slow.StateHash() != fast.StateHash()) diverged = true;
            }
            Assert.That(diverged, Is.True,
                "a node's work_s must reach Device.Progress — if not, CraftingSystem is ignoring the table");
        }

        // ------------------------------------------------------------------ zero-alloc

        /// <summary>
        /// ECONOMY-PLAN §3.5 / §5.1: the crafting tick path allocates nothing in steady state,
        /// and W0-5 rewrote that hot loop over ports, so the claim needs defending in CI rather
        /// than by inspection. Measured on BOTH legs of the additive lookup — the shipped legacy
        /// fallback and a two-input/two-output graph node — because <see cref="ProductionBill"/>
        /// exists precisely so the graph leg allocates nothing either.
        ///
        /// TWO windows per leg, because the two per-pass paths are different code:
        ///   (a) IDLE-SCANNING — a bill resolved, station powered, no inputs aboard: every pass
        ///       runs TryGetBill → staging tile → AllInputsStaged → AnyFetchCandidate and bails.
        ///       Precondition: nobody was recruited, so the scan really is what ran.
        ///   (b) WORKING — a worker at the bench driving Device.Progress under a long
        ///       <c>work_s</c>. Precondition: Progress actually advanced during the window.
        ///
        /// WHAT THIS DELIBERATELY DOES NOT COVER, and why: batch COMPLETION allocates, one
        /// <c>ItemStack</c> per output port through <c>sim.AddItem</c>. That is pre-existing
        /// entity-creation cost shared with every other spawner in the sim, not something the
        /// port rewrite introduced, and a window containing completions measures it instead of
        /// the loop under test (measured: 2080 bytes over a window with ~10 completions). The
        /// long <c>work_s</c> keeps completions out of the measured window on purpose.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>ProductionDefs.TryGetBill</c>, box the bill
        /// before returning (<c>object _ = bill;</c>) — one allocation per station per second,
        /// and both windows on both legs stop measuring 0. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void CraftingTick_AllocatesNothing_OnBothLookupLegs()
        {
            // Legacy leg: the shipped Scrap→Parts recipe, slowed so no batch completes in the
            // measured window. Still the FALLBACK leg — no [production] node exists.
            var legacy = SimDefs.CreateDefault();
            legacy.Recipes[(int)DeviceKind.Fabricator] =
                new RecipeDef(ItemKind.Scrap, 2, ItemKind.Parts, 1, 3600);
            Assert.That(ProductionDefs.TryGetBill(legacy, DeviceKind.Fabricator, out var legacyBill), Is.True);
            Assert.That(legacyBill.IsGraphNode, Is.False, "premise: this measures the fallback leg");

            var graph = ParseClean(
                "[production]\nfab_multi Fabricator 3600 Scrap:2+Regolith:1 Parts:1+Scrap:1\n");
            Assert.That(ProductionDefs.TryGetBill(graph, DeviceKind.Fabricator, out var graphBill), Is.True);
            Assert.That(graphBill.IsGraphNode, Is.True, "premise: this measures the graph-node leg");

            AssertIdleScanZeroAlloc(legacy, "legacy fallback leg");
            AssertIdleScanZeroAlloc(graph, "graph-node leg (2 in, 2 out)");
            AssertWorkingZeroAlloc(legacy, "legacy fallback leg");
            AssertWorkingZeroAlloc(graph, "graph-node leg (2 in, 2 out)");
        }

        /// <summary>Window (a): a powered station with a bill and NO inputs — the per-pass
        /// staging/fetch scans run every second and find nothing.</summary>
        private static void AssertIdleScanZeroAlloc(SimDefs defs, string what)
        {
            var sim = BuildBenchScenario(defs); // no items added at all
            Run(sim, 500);                      // burn-in

            Assert.That(sim.TryGetDeviceAt(new Int3(3, 2, 0), out var bench), Is.True);
            Assert.That(bench.Powered, Is.True,
                what + ": an unpowered station returns before the scans — nothing would be measured");

            long before = GC.GetAllocatedBytesForCurrentThread();
            Run(sim, 3000);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            // PRECONDITION: nobody was recruited, so the idle SCAN is what ran (300 passes).
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
                Assert.That(citizens[i].JobKind, Is.Not.EqualTo(JobKind.Craft),
                    what + ": a worker was recruited — this window no longer measures the idle scan");

            Assert.That(delta, Is.EqualTo(0L),
                what + " (idle scan): the per-pass staging/fetch scans must allocate nothing "
                + "(measured " + delta + " bytes)");
        }

        /// <summary>Window (b): a worker at the bench driving Progress under a 3600 s bill, so
        /// the work phase runs every pass and no batch completes inside the window.</summary>
        private static void AssertWorkingZeroAlloc(SimDefs defs, string what)
        {
            var sim = BuildBenchScenario(defs);
            sim.AddItem(ItemKind.Scrap, 8, new Int3(4, 2, 0));
            sim.AddItem(ItemKind.Regolith, 8, new Int3(2, 2, 0));

            Run(sim, 2000); // burn-in: recruit, stage, consume, settle into the work phase

            Assert.That(sim.TryGetDeviceAt(new Int3(3, 2, 0), out var bench), Is.True);
            float progressBefore = bench.Progress;
            long before = GC.GetAllocatedBytesForCurrentThread();
            Run(sim, 3000);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;
            float progressAfter = bench.Progress;

            // PRECONDITION: the WORK path really ran during the measured window.
            Assert.That(progressAfter, Is.GreaterThan(progressBefore),
                what + ": Device.Progress did not advance — the work phase was not reached, so a "
                + "zero-alloc result here would prove nothing about the rewrite");
            Assert.That(progressAfter, Is.LessThan(1f),
                what + ": a batch completed inside the window — completion allocates an ItemStack "
                + "per output port and this window is meant to exclude it");

            Assert.That(delta, Is.EqualTo(0L),
                what + " (working): the per-pass work path must allocate nothing "
                + "(measured " + delta + " bytes)");
        }
    }
}
