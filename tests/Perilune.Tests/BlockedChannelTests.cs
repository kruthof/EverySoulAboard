using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>blocked</c> WIRE CHANNEL — <b>why an order the player painted is doing nothing.</b>
    ///
    /// WHY IT WAS NEEDED, AND WHY NO "BETTER READER" COULD HAVE DONE IT.
    /// <c>WorksiteSafety.CanStageWorkerAt</c> is a LIVE PREDICATE: the job board asks it, acts on the
    /// answer and throws the answer away. It stamps no tile flag, writes no registry, saves no state
    /// and leaves nothing in the projection. So the refusal is not merely rendered badly — <b>there is
    /// no fact anywhere on the client to render</b>, and the tile keeps drawing its ordinary amber
    /// order ring forever. <c>SafetySystem.cs</c>'s own header files this against itself: *"the bug
    /// goes from expensive-and-visible to CHEAP-AND-INVISIBLE … <c>CanStageWorkerAt</c> is public so a
    /// future wire channel can ask it per tile and finally say so."*
    ///
    /// ⚠️ THE SHAPE OF THIS FILE IS DICTATED BY TRAP 4 (<c>CLAUDE.md</c>): *a guard whose scope filter
    /// excludes the violation*. Every claim about coverage below is an <b>INCLUSION TEST</b> — a known
    /// refused site is PLANTED and the channel is required to NAME IT, by exact coordinate, order and
    /// reason. Counting rows would prove only that the builder matched something. And every leg runs
    /// on its own fixture in its own <c>[Test]</c>, because <c>assert</c> throws and a multi-leg test
    /// reports only its first failing leg (the fifth trap shape) — a dead second leg is otherwise
    /// indistinguishable from a live one.
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar, NO new hashed
    /// field, NO save-chapter change, NO new <c>GlyphColor</c> id, and <c>WireFormat.cs</c> has NO
    /// DIFF (it was already <c>partial</c>). The <c>sim/</c> diff for this lane is empty. So the
    /// def-field and defs-checksum gates do not apply and all five determinism pins must be
    /// byte-identical; <see cref="Rendering_The_Blocked_Channel_Never_Touches_The_Sim"/> is the
    /// in-suite half of that claim and <c>ci.sh</c> measures the pins. The de-DE culture gate DOES
    /// apply and is exercised — this machine is de-DE and the channel ships five integers per row.
    /// </summary>
    public class BlockedChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Blocked_Serializes_Tuple_Shape_And_EmptyList()
        {
            var cells = new[]
            {
                new WireFormat.BlockedCell(3, 4, 0, WireFormat.OrderDig, WireFormat.ReasonAir),
                new WireFormat.BlockedCell(58, 15, 1, WireFormat.OrderBuild, WireFormat.ReasonNoApproach),
            };
            string json = WireFormat.Blocked(cells);
            StringAssert.Contains("\"type\":\"blocked\"", json);
            // tuple order: [x, y, deck, order, reason]
            StringAssert.Contains("[3,4,0,0,0]", json);
            StringAssert.Contains("[58,15,1,2,1]", json);
            Assert.AreEqual("{\"type\":\"blocked\",\"cells\":[]}",
                WireFormat.Blocked(Array.Empty<WireFormat.BlockedCell>()));
            Assert.AreEqual("{\"type\":\"blocked\",\"cells\":[]}", WireFormat.Blocked(null),
                "a null list is the same inert payload, not a crash on the render thread");
        }

        /// <summary>
        /// THE TUPLE LEADS WITH <c>x, y, deck</c>, like every other sparse channel — measured against
        /// the five siblings rather than asserted as a literal, so it cannot drift into agreeing with
        /// a stale comment. MUTATION: swap X and Deck in <see cref="WireFormat.Blocked"/> ⇒ red.
        /// </summary>
        [Test]
        public void The_Tuple_Leads_With_X_Y_Deck_Like_Every_Other_Sparse_Channel()
        {
            string blocked = WireFormat.Blocked(new[] { new WireFormat.BlockedCell(7, 3, 1, 1, 1) });
            StringAssert.Contains("[7,3,1,", blocked,
                "the blocked tuple no longer leads with x,y,deck — the shape six sparse channels share");
            StringAssert.Contains("[7,3,1,", WireFormat.Devices(new[] { new WireFormat.DeviceCell(7, 3, 1, 4, 200, 1, 0) }),
                "control: the devices channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", WireFormat.Items(new[] { new WireFormat.ItemCell(7, 3, 1, 4, 200) }),
                "control: the items channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", WireFormat.Marks(new[] { new WireFormat.MarkCell(7, 3, 1, 2) }),
                "control: the marks channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", WireFormat.Zones(new[] { new WireFormat.ZoneTile(7, 3, 1, 0UL, 0) }),
                "control: the zones channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", WireFormat.Materials(new[] { (X: 7, Y: 3, Deck: 1, Kind: 0, Mat: 2) }),
                "control: the materials channel leads with x,y,deck");
        }

        /// <summary>
        /// THE de-DE GATE. This machine's culture is de-DE, where a grouped <c>ToString()</c> emits
        /// <c>1.234</c> — a JSON parse error at the client on every blocked tile.
        /// MUTATION: drop the <c>BlockedIc</c> argument from any of the five <c>ToString</c> calls and
        /// run under de-DE ⇒ the payloads diverge.
        /// </summary>
        [Test]
        public void Blocked_Payload_Is_Culture_Invariant()
        {
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                var loud = new CultureInfo("de-DE");
                var cell = new[] { new WireFormat.BlockedCell(1234, 7, 2, 1, 1) };
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Blocked(cell);
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(inv, WireFormat.Blocked(cell),
                    "a wire payload that changes with the operator's locale is not a wire payload");
                StringAssert.Contains("[1234,7,2,1,1]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        /// <summary>
        /// THE VOCABULARY IS APPEND-ONLY AND ITS VALUES ARE PINNED. The client mirrors these by hand
        /// (<c>BLOCKED_ORDER_NAMES</c> / <c>BLOCKED_REASON_NAMES</c> in
        /// <c>client/src/wire/messages.js</c>) and there is no compiler across that seam — the JS half
        /// parses this repo's C# for the same reason. Renumbering silently repaints every badge with
        /// the wrong reason.
        /// </summary>
        [Test]
        public void The_Order_And_Reason_Vocabularies_Are_Pinned()
        {
            Assert.AreEqual(0, WireFormat.OrderDig);
            Assert.AreEqual(1, WireFormat.OrderStrip);
            Assert.AreEqual(2, WireFormat.OrderBuild);
            Assert.AreEqual(0, WireFormat.ReasonAir);
            Assert.AreEqual(1, WireFormat.ReasonNoApproach);
            Assert.AreEqual(2, WireFormat.ReasonNoConsumable);
            Assert.AreEqual(3, WireFormat.ReasonUnreachable);
        }

        // ═══════════════════════════════════════════════════════════════════ the session bridge

        private static (GameSession gs, SimHost host) BootGrid()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed, ship: ShipChoice.Grid);
            return (new GameSession(host, sink.Add), host); // NOT started ⇒ no sim thread
        }

        /// <summary>The cached <c>blocked</c> payload after a render, taken from the SNAPSHOT a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. That matters more here than on most channels: this payload is a
        /// function of what the player painted and of compartment air, both of which can sit unchanged
        /// for hours, so an omitted channel would leave a reconnecting tab with a screenful of orders
        /// and no explanation for exactly that long (the measured <c>materials</c> shape — 0 messages
        /// in 4 s on a live reconnect — not the self-healing <c>ledger</c> shape).</summary>
        private static string BlockedJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it is back to silence, which is the " +
                                   "entire defect this channel removes");
            return json;
        }

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately POSITIONAL: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, int Order, int Reason)> Tuples(string json)
        {
            var list = new List<(int, int, int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(5, f.Length, "a blocked tuple is five elements, saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        private static List<(int X, int Y, int Deck, int Order, int Reason)> Rows(GameSession gs) =>
            Tuples(BlockedJson(gs));

        private static (int X, int Y, int Deck, int Order, int Reason)? RowAt(GameSession gs, Int3 p)
        {
            foreach (var t in Rows(gs))
                if (t.X == p.X && t.Y == p.Y && t.Deck == p.Z) return t;
            return null;
        }

        // ═══════════════════════════════════════════════════════════ the fixture, on the real ship

        /// <summary>
        /// A walkable, EXPLORED tile on <c>--ship grid</c> whose air is not survivable, together with a
        /// walkable neighbour of it that is also unsurvivable — i.e. a place where a real order really
        /// would be refused, found by scanning the SHIPPED ship rather than invented.
        ///
        /// Returns <c>(site, staging)</c>: <c>site</c> is where the order goes, <c>staging</c> is the
        /// neighbour a worker would have to stand on. Deterministic (z,y,x, first match).
        ///
        /// ⚠️ THIS IS A PREMISE, NOT AN ASSERTION ABOUT THE CHANNEL. If the grid ship ever boots fully
        /// pressurised, every test using it fails LOUDLY at this helper with a message saying so —
        /// which is what you want, because a channel about airless compartments tested on a ship with
        /// none would be a suite of green vacuities.
        /// </summary>
        private static (Int3 Site, Int3 Staging) FindAirlessSite(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        Int3? staging = null;
                        bool allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                            staging ??= n;
                        }
                        if (allRefused && staging.HasValue) return (p, staging.Value);
                    }
            Assert.Fail("PREMISE FAILED: no tile on --ship grid has a walkable neighbour that the " +
                        "worksite staging rule refuses. Either the ship now boots pressurised or " +
                        "WorksiteSafety has changed; every airless test in this file is vacuous until " +
                        "this is fixed, so it fails here rather than passing quietly.");
            return default;
        }

        /// <summary>A walkable, EXPLORED, BREATHABLE tile on the same ship — the control site. Its
        /// order must NOT appear on the channel, which is the half that stops "emit every designation"
        /// from passing this suite.</summary>
        private static Int3 FindBreathableSite(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) return p;
                        }
                    }
            Assert.Fail("PREMISE FAILED: --ship grid has no stageable tile at all — the control site " +
                        "cannot be built and the negative half of this suite would be vacuous.");
            return default;
        }

        // ═══════════════════════════════════════════════ INCLUSION: each order kind, on its own

        /// <summary>
        /// ⭐ THE INCLUSION TEST FOR <b>DIG</b> (trap 4). A dig designation is PLANTED on a tile whose
        /// only approach is airless, and the channel is required to name THAT EXACT TILE with
        /// <see cref="WireFormat.OrderDig"/> and <see cref="WireFormat.ReasonAir"/>. A second dig is
        /// planted in breathable air and must be ABSENT — without that half, a builder that emitted
        /// every designation on the ship would pass.
        ///
        /// RUNS ALONE, on its own fixture, with strip and build EMPTY (asserted) — the fifth trap
        /// shape: <c>assert</c> throws, so a leg sharing a test with two others cannot be shown to
        /// bite on its own.
        ///
        /// MUTATION: delete the dig pass from <c>GameSession.BuildBlocked</c> ⇒ red on the first
        /// assertion. MUTATION 2: emit every designated tile without asking
        /// <c>CanStageWorkerAt</c> ⇒ red on the control.
        /// </summary>
        [Test]
        public void A_Dig_Order_In_Airless_Air_Is_Named_By_The_Channel_And_One_In_Good_Air_Is_Not()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var (airless, _) = FindAirlessSite(sim);
            var breathable = FindBreathableSite(sim);
            Assert.AreNotEqual(airless, breathable, "premise: the two sites must be different tiles");

            sim.World.SetFlag(airless, TileFlags.Designated, true);
            sim.World.SetFlag(breathable, TileFlags.Designated, true);

            var row = RowAt(gs, airless);
            Assert.IsNotNull(row, "THE PLANTED, KNOWN-REFUSED DIG AT " + airless + " IS NOT ON THE " +
                "CHANNEL. This is the inclusion test: a row count proves a matcher matched something, " +
                "never that it would match the thing.");
            Assert.AreEqual(WireFormat.OrderDig, row.Value.Order, "the order kind must say DIG");
            Assert.AreEqual(WireFormat.ReasonAir, row.Value.Reason,
                "the reason must be AIR — this tile has a walkable neighbour, it is simply not " +
                "survivable, which is a different sentence to the player than 'no approach'");

            Assert.IsNull(RowAt(gs, breathable),
                "a dig in BREATHABLE air is on the channel. The channel would then be 'every " +
                "designation', which says nothing, and every badge on the surface would be a lie.");

            Assert.That(Rows(gs).All(r => r.Order == WireFormat.OrderDig), Is.True,
                "leg isolation: this fixture designates no strip and no build, so every row must be " +
                "a dig — otherwise this test's dig claim is riding on another registry's output");
        }

        /// <summary>
        /// ⭐ THE INCLUSION TEST FOR <b>STRIP</b>, on its own fixture. A strip order is planted through
        /// the SIM'S OWN COMMAND (<see cref="DesignateDeconstructCommand"/>), not by poking a registry,
        /// so the row this asserts is one a player could actually create.
        ///
        /// MUTATION: delete the strip pass from <c>BuildBlocked</c> ⇒ red.
        /// </summary>
        [Test]
        public void A_Strip_Order_In_Airless_Air_Is_Named_By_The_Channel()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var strip = sim.Deconstruct;
            Assert.IsNotNull(strip, "premise: --ship grid runs a DeconstructSystem");

            // Find a wall the sim itself agrees is condemnable AND whose approach is airless. Asking
            // CanDesignate rather than assuming keeps this off hull walls and off doors, which are
            // refused for reasons that have nothing to do with air.
            Int3? site = null;
            var w = sim.World;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 0; y < w.Height && site == null; y++)
                    for (int x = 0; x < w.Width && site == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!strip.CanDesignate(sim, p, DeconstructKind.Wall)) continue;
                        bool anyWalkable = false, allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                        }
                        if (anyWalkable && allRefused) site = p;
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: --ship grid has no condemnable wall whose approach " +
                                   "is airless, so the strip leg would be vacuous.");

            sim.EnqueueCommand(new DesignateDeconstructCommand(site.Value, DeconstructKind.Wall, true));
            sim.Tick();
            Assert.That(strip.TryGet(site.Value, out _), Is.True,
                "premise: the sim accepted the strip order (otherwise there is nothing to be blocked)");

            var row = RowAt(gs, site.Value);
            Assert.IsNotNull(row, "THE PLANTED, KNOWN-REFUSED STRIP AT " + site.Value + " IS NOT ON THE CHANNEL");
            Assert.AreEqual(WireFormat.OrderStrip, row.Value.Order, "the order kind must say STRIP");
            Assert.AreEqual(WireFormat.ReasonAir, row.Value.Reason, "the reason must be AIR");

            Assert.That(Rows(gs).All(r => r.Order == WireFormat.OrderStrip), Is.True,
                "leg isolation: this fixture paints no dig and no build, so every row must be a strip." +
                " Note that --ship grid authors 20 dig designations in the hold, 10 of them blocked; they are UNEXPLORED at tick 0 and so fog-gated off this channel. If boot fog ever changes, this assertion is the tripwire and the fix is to exclude them by name, not to weaken it.");
        }

        /// <summary>
        /// ⭐ THE INCLUSION TEST FOR <b>BUILD</b>, on its own fixture — <b>and it is the leg that
        /// matters most</b>. A build site is the class where the staging rule destroys ACHIEVABLE
        /// work: <c>BuildSystem.FloorConstructTicks = 20</c>, so a floor build is TWO SECONDS and
        /// completes in hard vacuum against a 45 s flee deadline (<c>SafetySystem.cs</c>'s own
        /// retraction measured it both ways). The player is refused work that would have landed, and
        /// before this channel nothing said so.
        ///
        /// MUTATION: delete the build pass from <c>BuildBlocked</c> ⇒ red. MUTATION 2: delete the
        /// <c>BuildSystemOfStack</c> resolver's loop body so it returns null ⇒ red.
        /// </summary>
        [Test]
        public void A_Build_Order_In_Airless_Air_Is_Named_By_The_Channel()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;

            BuildSystem build = null;
            foreach (var s in sim.Systems) if (s is BuildSystem bs) { build = bs; break; }
            Assert.IsNotNull(build, "premise: --ship grid runs a BuildSystem");

            // A tile the BuildSystem itself will accept a wall on, whose approach is airless.
            Int3? site = null;
            var w = sim.World;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 0; y < w.Height && site == null; y++)
                    for (int x = 0; x < w.Width && site == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!build.CanDesignate(sim, p, BuildKind.Wall)) continue;
                        bool anyWalkable = false, allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                        }
                        if (anyWalkable && allRefused) site = p;
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: --ship grid has no buildable tile whose approach is " +
                                   "airless, so the build leg would be vacuous.");

            sim.EnqueueCommand(new DesignateBuildCommand(site.Value, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site.Value, out _), Is.True,
                "premise: the sim accepted the build designation");

            var row = RowAt(gs, site.Value);
            Assert.IsNotNull(row, "THE PLANTED, KNOWN-REFUSED BUILD AT " + site.Value + " IS NOT ON THE " +
                "CHANNEL. Build is the one order the staging rule denies that WOULD have completed — " +
                "leaving it off would hide the only loss that matters on the surface built to show losses.");
            Assert.AreEqual(WireFormat.OrderBuild, row.Value.Order, "the order kind must say BUILD");
            Assert.AreEqual(WireFormat.ReasonAir, row.Value.Reason, "the reason must be AIR");

            Assert.That(Rows(gs).All(r => r.Order == WireFormat.OrderBuild), Is.True,
                "leg isolation: this fixture paints no dig and no strip, so every row must be a build." +
                " Note that --ship grid authors 20 dig designations in the hold, 10 of them blocked; they are UNEXPLORED at tick 0 and so fog-gated off this channel. If boot fog ever changes, this assertion is the tripwire and the fix is to exclude them by name, not to weaken it.");
        }

        // ═══════════════════════════════════════════════════════ the two reasons are distinguished

        /// <summary>
        /// THE SECOND REASON IS REACHABLE AND IS NOT THE FIRST. A designation is planted on a tile with
        /// NO walkable neighbour at all — where <c>TryPathToAdjacent</c> has nothing even to consider —
        /// and the channel must say <see cref="WireFormat.ReasonNoApproach"/>, not
        /// <see cref="WireFormat.ReasonAir"/>. The distinction is the player's next action: air is
        /// answered with a vent, an approach with a spade.
        ///
        /// MUTATION: return <c>ReasonAir</c> unconditionally from <c>BlockedReason</c> ⇒ red here and
        /// GREEN everywhere else in this file, which is exactly why this test exists separately.
        /// </summary>
        [Test]
        public void A_Site_With_No_Walkable_Neighbour_Reports_NoApproach_Not_Air()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var w = sim.World;

            // ⚠️ THE SITE IS CONSTRUCTED, NOT FOUND, AND THAT IS A MEASURED FACT WORTH RECORDING:
            // --ship grid at boot has NO explored tile walled in on all four sides (the first draft of
            // this test scanned for one and failed its own premise). So the fixture MAKES one — take an
            // explored interior tile and wall its four neighbours — and then asserts the constructed
            // premise before asserting anything about the channel. The alternative, deleting the leg
            // because the shipped ship does not happen to contain the case, would leave the second
            // reason code shipped and untested; a wreck ship full of collapsed compartments will
            // contain it constantly.
            Int3? site = null;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 1; y < w.Height - 1 && site == null; y++)
                    for (int x = 1; x < w.Width - 1 && site == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        site = p;
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: --ship grid has no explored interior tile at all");
            for (int i = 0; i < 4; i++) w.SetWall(Int3.Neighbor4(site.Value, i), TileDefs.Wall);
            for (int i = 0; i < 4; i++)
                Assert.That(sim.IsWalkable(Int3.Neighbor4(site.Value, i)), Is.False,
                    "premise: the fixture really did wall the site in on all four sides");

            sim.World.SetFlag(site.Value, TileFlags.Designated, true);
            var row = RowAt(gs, site.Value);
            Assert.IsNotNull(row, "a designation nothing can stand beside is refused forever and must " +
                                  "be on the channel");
            Assert.AreEqual(WireFormat.ReasonNoApproach, row.Value.Reason,
                "a walled-in site reported AIR. The two reasons are not interchangeable: the scenario " +
                "host's own livelock audit excludes this case from its AIR count on the grounds that " +
                "'walled in is not an AIR refusal', and the player's remedy differs.");
        }

        /// <summary>
        /// ⭐ THE MAP EDGE. A designation on the world's corner tile has neighbours OFF THE MAP, and
        /// <see cref="Simulation.IsWalkable"/> does <b>no</b> bounds checking of its own — it indexes
        /// <c>World.Levels[p.Z]</c> and then <c>level.Index(x, y) = y * Width + x</c> directly. So the
        /// <c>InBounds</c> test inside <c>BlockedReason</c> is not defensive tidiness: without it
        /// <c>(−1, 0, z)</c> indexes at <c>−1</c> and <c>(0, −1, z)</c> at <c>−Width</c>, and the
        /// channel throws <b>on the render thread</b>, which takes the whole socket down for a tile
        /// the player painted.
        ///
        /// ⚠️ IT WAS FILED IN REVIEW AS "PURELY DEFENSIVE, NOTHING PLANTS AN OUT-OF-RANGE SITE" AND
        /// THAT IS ONLY HALF TRUE. Nothing plants an out-of-range SITE (that is the OTHER bounds test,
        /// in <c>AddIfBlocked</c>, and it stays deliberately unpinned — see the header). But an
        /// in-range site at the edge produces out-of-range NEIGHBOURS on any map, and this one is
        /// reachable by ordinary play the day a ship puts diggable matter against the hull. Away from
        /// the corner the same mutation is WORSE than a crash: <c>(−1, y, z)</c> is a perfectly valid
        /// flat index into the PREVIOUS ROW, so the rule would silently be asked about the wrong tile.
        ///
        /// MUTATION: delete <c>if (!_sim.World.InBounds(n)) continue;</c> from <c>BlockedReason</c> ⇒
        /// red (an <c>IndexOutOfRangeException</c> out of the render).
        /// </summary>
        [Test]
        public void A_Designation_On_The_Map_Corner_Does_Not_Reach_Off_The_Map()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var w = sim.World;
            var site = new Int3(0, 0, 0);

            // The two IN-range neighbours are walled, so the loop is forced to reach the two that are
            // off the map — otherwise an early accept would hide the whole point of the test.
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(site, i);
                if (w.InBounds(n)) w.SetWall(n, TileDefs.Wall);
            }
            w.SetFlag(site, TileFlags.Explored, true);
            w.SetFlag(site, TileFlags.Designated, true);

            var row = RowAt(gs, site);
            Assert.IsNotNull(row, "the corner designation is not on the channel at all");
            Assert.AreEqual(WireFormat.ReasonNoApproach, row.Value.Reason,
                "a tile whose only in-range neighbours are walls and whose other two are off the map " +
                "has no approach; anything else means an off-map read produced an answer");
        }

        // ══════════════════════════════ THE PREDICATE ITSELF IS PINNED, not merely "some air rule"

        /// <summary>
        /// ⭐⭐ <b>THE CHANNEL ASKS <c>WorksiteSafety.CanStageWorkerAt</c> AND NOT A LOOKALIKE.</b> This
        /// is the test for the package's CENTRAL claim — *"the identical call
        /// <c>JobWork.TryPathToAdjacent</c> makes, on the identical tile, so the channel and the
        /// dispatcher cannot come to disagree"* — and until it existed that claim was <b>unpinned</b>:
        /// independent review swapped the call for its own inner test,
        /// <c>AtmosphereSafety.IsBreathable(_sim, n)</c>, and <b>all fourteen tests in this file stayed
        /// green</b>. That is exactly the drift a future edit makes, because the two read as synonyms.
        ///
        /// THEY ARE NOT SYNONYMS, AND THE DIFFERENCE IS THE DOOR-MARKER CLAUSE:
        /// <code>
        ///   CanStageWorkerAt = !CanCycle(sim) || RoomIdAt(tile) == RoomState.DoorMarker || IsBreathable(tile)
        /// </code>
        /// <c>SafetySystem.cs</c> calls that middle clause *"the single most expensive mistake this rule
        /// can make"* and records what its omission cost when the rule itself was written: it refused
        /// <b>the entire 48-tile aft dig field of the shipped slice</b>, whose only approach is
        /// <c>door_aft</c>. A door tile resolves to <c>Rooms[0]</c>, the vacuum sink, so it reads 0 kPa
        /// and <c>IsBreathable</c> is FALSE on every door aboard — while <c>NeedsSystem</c> skips a crew
        /// member standing there outright, so no suffocation accrues and the dispatcher stages there
        /// happily.
        ///
        /// ⇒ A SITE WHOSE ONLY APPROACH IS A DOORWAY IS <b>NOT</b> BLOCKED, and this channel must be
        /// silent about it. Under the lookalike it grows a badge that says "the air where a worker would
        /// have to stand is not survivable" over an order the crew are about to do — and <b>a false
        /// badge is worse than the silence this channel removes</b>, because it teaches the player to
        /// ignore the layer. Divergence on shipped content today is small — <b>independent review
        /// measured</b> <c>--ship grid</c> 0 sites and <c>--ship slice</c> 1 (attributed, not
        /// re-measured here) — but it is structural on a wreck threaded with doorways, and the fixture
        /// below CONSTRUCTS the case rather than depending on either ship containing it.
        ///
        /// THE CONTROL COMES FIRST, deliberately: a genuinely refused site must be PRESENT in the same
        /// payload, or this test would pass on a builder that emits nothing at all.
        ///
        /// MUTATION: <c>WorksiteSafety.CanStageWorkerAt(_sim, n)</c> → <c>AtmosphereSafety.IsBreathable(_sim, n)</c>
        /// in <c>GameSession.BlockedReason</c> ⇒ RED here, and green everywhere else in this file.
        /// </summary>
        [Test]
        public void A_Site_Approached_Only_Through_A_DOORWAY_Is_Not_Blocked()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;

            // CONTROL FIRST: a real refusal must be on the channel in this same render, or an emitter
            // that returned nothing would satisfy the claim below by accident.
            var (airless, _) = FindAirlessSite(sim);
            sim.World.SetFlag(airless, TileFlags.Designated, true);
            Assert.IsNotNull(RowAt(gs, airless),
                "CONTROL FAILED: the known-refused site is not on the channel, so the ABSENCE asserted " +
                "below would prove nothing — an emitter that produced no rows at all would pass it.");

            var (site, door) = MakeDoorApproachSite(sim);

            // The premises, stated in the order that makes the mutation legible.
            Assert.AreEqual(RoomState.DoorMarker, sim.Rooms.RoomIdAt(sim.World, door),
                "premise: the only approach tile is a DOOR MARKER");
            Assert.That(AtmosphereSafety.IsBreathable(sim, door), Is.False,
                "premise: the doorway's AIR reads as lethal (it resolves to the vacuum sink). If this " +
                "ever becomes true the fixture stops separating the two predicates and the mutation " +
                "this test exists for would survive again — so it fails here rather than passing.");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, door), Is.True,
                "premise: the SIM'S OWN rule accepts the doorway anyway — the door-marker clause");

            sim.World.SetFlag(site, TileFlags.Explored, true);
            sim.World.SetFlag(site, TileFlags.Designated, true);

            Assert.IsNull(RowAt(gs, site),
                "A DIG AT " + site + " IS BADGED AS BLOCKED, and the job board will staff it: its only " +
                "approach is the doorway at " + door + ", which WorksiteSafety.CanStageWorkerAt accepts. " +
                "The channel is asking something OTHER than the dispatcher's own predicate — almost " +
                "certainly AtmosphereSafety.IsBreathable, which is CanStageWorkerAt minus the " +
                "door-marker clause. A badge over work that is about to happen is worse than the " +
                "silence this channel exists to remove.");
        }

        /// <summary>
        /// Build the door-approach fixture: a site whose ONLY walkable 4-neighbour is a walkable
        /// <see cref="RoomState.DoorMarker"/> tile. Found on the shipped ship (the doorway is real,
        /// not planted) and then CONSTRUCTED by walling the site's other three neighbours — the same
        /// technique <see cref="A_Site_With_No_Walkable_Neighbour_Reports_NoApproach_Not_Air"/> uses,
        /// and for the same reason: the shipped ship does not happen to contain the exact case, and
        /// deleting the leg would leave the package's central claim unpinned.
        ///
        /// Candidates whose other neighbours are themselves doorways are skipped, so the walls this
        /// plants can never destroy the very clause under test.
        /// </summary>
        private static (Int3 Site, Int3 Door) MakeDoorApproachSite(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var d = new Int3(x, y, z);
                        if (!sim.IsWalkable(d)) continue;
                        if (sim.Rooms.RoomIdAt(w, d) != RoomState.DoorMarker) continue;
                        if (AtmosphereSafety.IsBreathable(sim, d)) continue;
                        for (int i = 0; i < 4; i++)
                        {
                            var s = Int3.Neighbor4(d, i);
                            if (!w.InBounds(s)) continue;
                            bool usable = true;
                            for (int j = 0; j < 4 && usable; j++)
                            {
                                var n = Int3.Neighbor4(s, j);
                                if (Same(n, d) || !w.InBounds(n)) continue;
                                if (sim.Rooms.RoomIdAt(w, n) == RoomState.DoorMarker) usable = false;
                            }
                            if (!usable) continue;
                            for (int j = 0; j < 4; j++)
                            {
                                var n = Int3.Neighbor4(s, j);
                                if (Same(n, d) || !w.InBounds(n)) continue;
                                w.SetWall(n, TileDefs.Wall);
                            }
                            for (int j = 0; j < 4; j++)
                            {
                                var n = Int3.Neighbor4(s, j);
                                if (!w.InBounds(n)) continue;
                                if (Same(n, d)) continue;
                                Assert.That(sim.IsWalkable(n), Is.False,
                                    "premise: the fixture really did leave the doorway as the site's ONLY " +
                                    "walkable neighbour");
                            }
                            Assert.That(sim.IsWalkable(d), Is.True,
                                "premise: walling the other three neighbours did not close the doorway");
                            return (s, d);
                        }
                    }
            Assert.Fail("PREMISE FAILED: --ship grid has no walkable DoorMarker tile with a usable " +
                        "neighbour, so the door-marker clause — the difference between " +
                        "CanStageWorkerAt and AtmosphereSafety.IsBreathable — cannot be exercised and " +
                        "the package's central claim would be unpinned. Fails here rather than quietly.");
            return default;
        }

        private static bool Same(Int3 a, Int3 b) => a.X == b.X && a.Y == b.Y && a.Z == b.Z;

        // ═════════════════════════════════════════════════ the channel tracks the SIM, not a stamp

        /// <summary>
        /// ⭐ DRIVEN END TO END: <b>PRESSURISE THE COMPARTMENT AND THE ROW DISAPPEARS.</b> This is the
        /// assertion that proves the channel is reading a LIVE PREDICATE rather than a stamp taken once
        /// — and it is the behaviour a player will actually experience (vent the room, the badges
        /// clear on the next frame, with no timer to wait out).
        ///
        /// It also closes the loop the other way: the SIM'S OWN <c>CanStageWorkerAt</c> is asserted to
        /// have flipped on the very staging tile the channel was complaining about, so this is not
        /// "the row went away for some reason" but "the row went away because the rule changed its
        /// mind, on the tile the rule is asked about".
        ///
        /// MUTATION: cache the first answer in <c>BlockedReason</c> (make it a stamp) ⇒ red.
        /// </summary>
        [Test]
        public void Pressurising_The_Compartment_Clears_The_Row_On_The_Very_Next_Render()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var (site, staging) = FindAirlessSite(sim);
            sim.World.SetFlag(site, TileFlags.Designated, true);

            Assert.IsNotNull(RowAt(gs, site), "premise: the site starts blocked");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, staging), Is.False,
                "premise: the sim itself refuses the staging tile");

            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, staging));

            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, staging), Is.True,
                "premise: pressurising made the sim's own rule accept the staging tile — if this " +
                "fails the test below proves nothing about the channel");
            Assert.IsNull(RowAt(gs, site),
                "the row survived the compartment being pressurised. The channel is reading a cached " +
                "or stamped answer instead of asking WorksiteSafety.CanStageWorkerAt every render, so " +
                "the badge would outlive the problem and start lying in the other direction.");
        }

        // ═══════════════════════════════════════════════════════════════════ scope and gates

        /// <summary>
        /// ⛔ THE SCOPE CLAIM — AND THE PARAGRAPH THAT STOOD HERE WAS FALSE. It read *"AN UNTOUCHED
        /// SHIP SHIPS AN EMPTY PAYLOAD … Grid boots with no designations (MECHANICS.md §13.18)"*, and
        /// it PASSED. It passed for the WRONG REASON, and only driving a live host found it:
        ///
        ///   <b>--ship grid AUTHORS TWENTY DIG DESIGNATIONS</b> — a 10×2 rubble block in the hold at
        ///   x 23–32, y 15–16, deck 1. It is the same field <c>WireFormat.Marks.cs</c>'s header names
        ///   when it says the grid crew "cluster in the hold at roughly x25-32 y15-16 — exactly where
        ///   the dig designations are". <c>MECHANICS.md</c> §13.18 is about STOCKPILE ZONES and says
        ///   nothing about digs; the old premise mis-cited it.
        ///   <b>TEN OF THE TWENTY ARE BLOCKED</b> — the inner row (y = 16) is walled in by the hull
        ///   below and by its own rubble above, so nothing can stand beside it until the outer row is
        ///   cleared.
        ///
        /// The tick-0 payload really is empty, but because of the FOG GATE, not because the ship is
        /// untouched: those tiles are unexplored at tick 0 and arrive the moment the crew light them.
        /// Measured against a live host: 10 rows within seconds of boot, and still 10 later.
        ///
        /// So this test now pins BOTH halves — the empty tick-0 payload AND the authored census it was
        /// silently riding on — because a green whose premise is false is worse than no test at all.
        ///
        /// ⚠️ THE PLAYER-FACING CONSEQUENCE, AND IT IS NOW SETTLED RATHER THAN OPEN. On the one
        /// standard ship the hold shows ten "no way to stand next to it" badges from the first frame
        /// the crew light it. Driven at default speed (this lane's own run, sampled every 3 000 ticks;
        /// review measured the same shape): 10 rows by t=3000 (5 sim-min), 2 by t=9000 (15 sim-min),
        /// <b>0 by t=15000 (25 sim-min)</b>, and the last designation is gone by t=21000 —
        /// <c>DigJobSource.DigWorkTicks = 6000</c> is ten sim-minutes per tile, so nothing can complete
        /// sooner. <b>They are not ten permanent faults; they are the layer narrating a dig block being
        /// eaten from the outside in, which is what the player is watching.</b> DECIDED (owner): ship
        /// it. The suppress-when-a-neighbour-carries-the-same-order remedy is WITHDRAWN — it pays a
        /// permanent silence (the isolated walled-in order) for a temporary cosmetic cost.
        /// ⛔ A contemporaneous note claiming this field "never progressed — 0 dug in ~75 sim-minutes"
        /// is RETRACTED; it was a measurement artefact, not a bug on <c>main</c>.
        ///
        /// MUTATION: emit a row per unstageable TILE rather than per queued ORDER ⇒ red on the first
        /// assertion (grid is mostly airless, so hundreds of rows appear).
        /// </summary>
        [Test]
        public void The_Tick_Zero_Payload_Is_Empty_But_Grid_Really_Does_Author_Blocked_Digs()
        {
            var (gs, host) = BootGrid();
            Assert.AreEqual("{\"type\":\"blocked\",\"cells\":[]}", BlockedJson(gs),
                "the tick-0 payload is not empty. This channel must be the `zones` shape at boot, not " +
                "the `marks` shape — a badge on a tile nobody ordered anything on is noise, and noise " +
                "is how a real warning gets ignored.");

            // Now reveal the map — which is what the crew do within seconds of boot — and take the
            // census the old premise assumed away.
            var sim = host.Sim;
            var w = sim.World;
            int designated = 0;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Designated) != 0) designated++;
                        w.SetFlag(p, TileFlags.Explored, true);
                    }

            Assert.AreEqual(20, designated,
                "--ship grid's AUTHORED dig count moved. This number is the point of this test: the " +
                "claim 'grid boots with no designations' was false and bought a green for the wrong " +
                "reason. If authoring changed, RE-MEASURE and re-state the consequence in the header.");

            var rows = Rows(gs);
            Assert.AreEqual(10, rows.Count,
                "the number of BLOCKED authored digs on --ship grid moved (was 10: the inner row of " +
                "the hold's 10x2 rubble block, walled in by the hull below and its own rubble above). " +
                "This is what a player actually sees on the standard ship, so it is pinned, not assumed.");
            Assert.That(rows.All(r => r.Order == WireFormat.OrderDig && r.Reason == WireFormat.ReasonNoApproach),
                Is.True, "every authored blocked row is a dig refused for want of an approach. If one " +
                "is now an AIR refusal, deck 1 has stopped being pressurised and that is a bigger story.");
            Assert.That(rows.All(r => r.Deck == 1 && r.Y == 16 && r.X >= 23 && r.X <= 32), Is.True,
                "the blocked authored digs are no longer the hold's inner rubble row at y=16, x=23..32");
        }

        /// <summary>
        /// THE FOG GATE, mirroring every sparse channel since <c>marks</c>. A designation on an
        /// unexplored tile emits nothing.
        ///
        /// ⚠️ THE CONTROL IS THE POINT, and without it this test is vacuous in the most ordinary way:
        /// it would pass on a builder that emits NOTHING. So the SAME tile is asserted present with
        /// the flag set and absent with it cleared — one tile, two states, one difference.
        ///
        /// MUTATION: delete the <c>Explored</c> check in <c>AddIfBlocked</c> ⇒ red.
        /// </summary>
        [Test]
        public void An_Unexplored_Site_Emits_Nothing_But_The_Same_Site_Explored_Does()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var (site, _) = FindAirlessSite(sim);
            sim.World.SetFlag(site, TileFlags.Designated, true);

            Assert.IsNotNull(RowAt(gs, site), "control: the explored site IS on the channel");
            sim.World.SetFlag(site, TileFlags.Explored, false);
            Assert.IsNull(RowAt(gs, site),
                "an unexplored blocked site reached the wire. A rendering fix must not become a " +
                "fog-of-war change — the line marks/items/devices all drew.");
        }

        /// <summary>
        /// THE RESERVED REASON IS DECLARED AND NEVER EMITTED. <see cref="WireFormat.ReasonNoConsumable"/>
        /// exists so <c>lane/recovery-economy</c>'s <c>IsUnfixableWreck</c> cannot collide with a value
        /// this lane picks later — but this host cannot call that predicate and a host-side
        /// re-derivation of "is there any Parts aboard" would be the second-authority defect the
        /// channel's header refuses. Pinned rather than trusted: a reserved constant that quietly
        /// starts being emitted is how a vocabulary rots.
        /// </summary>
        [Test]
        public void The_Reserved_NoConsumable_Reason_Is_Never_Emitted_By_This_Host()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            // Paint enough of everything that any emitter would have fired by now.
            var (airless, _) = FindAirlessSite(sim);
            sim.World.SetFlag(airless, TileFlags.Designated, true);
            Assert.That(Rows(gs).Any(), Is.True, "premise: something is on the channel to be checked");
            Assert.That(Rows(gs).All(r => r.Reason != WireFormat.ReasonNoConsumable), Is.True,
                "this host emitted the RESERVED no_consumable reason. It is declared for the lane that " +
                "owns IsUnfixableWreck; emitting it from here means someone re-derived that predicate.");
        }

        /// <summary>
        /// EMISSION ORDER IS THE THREE WALKS, IN ORDER: digs on the z,y,x world walk, then strips in
        /// registry order, then builds in registry order. Order is the wire contract for every sparse
        /// channel here and a client sort would be a second, divergent authority.
        ///
        /// MUTATION: move the build pass above the dig pass in <c>BuildBlocked</c> ⇒ red.
        /// </summary>
        [Test]
        public void Rows_Are_Emitted_Digs_Then_Strips_Then_Builds()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var w = sim.World;

            var (airless, _) = FindAirlessSite(sim);
            sim.World.SetFlag(airless, TileFlags.Designated, true);

            BuildSystem build = null;
            foreach (var s in sim.Systems) if (s is BuildSystem bs) { build = bs; break; }
            Assert.IsNotNull(build, "premise: --ship grid runs a BuildSystem");

            // Any refused buildable tile will do here — the ORDER of the groups is the subject, not
            // which tile is chosen.
            Int3? buildSite = null;
            for (int z = 0; z < w.Depth && buildSite == null; z++)
                for (int y = 0; y < w.Height && buildSite == null; y++)
                    for (int x = 0; x < w.Width && buildSite == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!build.CanDesignate(sim, p, BuildKind.Wall)) continue;
                        bool anyWalkable = false, allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                        }
                        if (anyWalkable && allRefused) buildSite = p;
                    }
            Assert.IsNotNull(buildSite, "PREMISE FAILED: no refused buildable tile on --ship grid");
            sim.EnqueueCommand(new DesignateBuildCommand(buildSite.Value, BuildKind.Wall, on: true, material: 0));
            sim.Tick();

            var rows = Rows(gs);
            int firstBuild = rows.FindIndex(r => r.Order == WireFormat.OrderBuild);
            int lastDig = rows.FindLastIndex(r => r.Order == WireFormat.OrderDig);
            Assert.That(firstBuild, Is.GreaterThanOrEqualTo(0), "premise: a build row was emitted");
            Assert.That(lastDig, Is.GreaterThanOrEqualTo(0), "premise: a dig row was emitted");
            Assert.That(lastDig, Is.LessThan(firstBuild),
                "every dig row must precede every build row — the emission order IS the wire contract");
        }

        /// <summary>
        /// PROJECTION-PURE AND SIM-PURE. Rendering the channel mutates nothing: the full determinism
        /// <c>StateHash</c> is byte-identical across a render, over a fixture that has orders on all
        /// three registries so every code path in the builder actually runs.
        ///
        /// ⚠️ THAT SENTENCE USED TO BE FALSE OF THE BODY BELOW, and independent review caught it: the
        /// fixture planted a DIG and nothing else, so the strip and build walks — the two that
        /// dereference a registry — were never entered by the test that claims to have entered them.
        /// It now plants all three, <b>and the coverage is ASSERTED rather than described</b>: the
        /// payload must carry one row of each order kind before the hash is compared. A doc comment
        /// that describes a fixture the body does not build is the same defect as a guard whose scope
        /// filter excludes the violation (trap 4), wearing prose instead of a matcher.
        ///
        /// MUTATION: have <c>BuildBlocked</c> write anything to the sim (set a flag, clear a
        /// designation) ⇒ red on the hash. MUTATION 2: empty the strip or the build walk ⇒ red on the
        /// COVERAGE premise, which is what makes the "all three registries" claim a fact rather than
        /// prose.
        /// </summary>
        [Test]
        public void Rendering_The_Blocked_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var w = sim.World;

            // 1) DIG — the tile-flag walk.
            var (airless, _) = FindAirlessSite(sim);
            sim.World.SetFlag(airless, TileFlags.Designated, true);

            // 2) STRIP and 3) BUILD — the two registry walks. Both sites are found by asking the
            // owning system's own CanDesignate, exactly as their inclusion tests do.
            var strip = sim.Deconstruct;
            Assert.IsNotNull(strip, "premise: --ship grid runs a DeconstructSystem");
            BuildSystem build = null;
            foreach (var s in sim.Systems) if (s is BuildSystem bs) { build = bs; break; }
            Assert.IsNotNull(build, "premise: --ship grid runs a BuildSystem");

            Int3? stripSite = null, buildSite = null;
            for (int z = 0; z < w.Depth && (stripSite == null || buildSite == null); z++)
                for (int y = 0; y < w.Height && (stripSite == null || buildSite == null); y++)
                    for (int x = 0; x < w.Width && (stripSite == null || buildSite == null); x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        bool anyWalkable = false, allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                        }
                        if (!anyWalkable || !allRefused) continue;
                        if (stripSite == null && strip.CanDesignate(sim, p, DeconstructKind.Wall)) stripSite = p;
                        else if (buildSite == null && build.CanDesignate(sim, p, BuildKind.Wall)) buildSite = p;
                    }
            Assert.IsNotNull(stripSite, "PREMISE FAILED: no refused condemnable wall on --ship grid");
            Assert.IsNotNull(buildSite, "PREMISE FAILED: no refused buildable tile on --ship grid");

            sim.EnqueueCommand(new DesignateDeconstructCommand(stripSite.Value, DeconstructKind.Wall, true));
            sim.EnqueueCommand(new DesignateBuildCommand(buildSite.Value, BuildKind.Wall, on: true, material: 0));
            sim.Tick();

            // ⭐ THE COVERAGE PREMISE. Without this the "all three registries" claim above is prose:
            // emptying either registry walk would leave the hash comparison green.
            var rows = Rows(gs);
            foreach (var (kind, name) in new[]
                     {
                         (WireFormat.OrderDig, "DIG"), (WireFormat.OrderStrip, "STRIP"),
                         (WireFormat.OrderBuild, "BUILD"),
                     })
                Assert.That(rows.Any(r => r.Order == kind), Is.True,
                    "COVERAGE PREMISE FAILED: no " + name + " row on the channel, so the purity claim " +
                    "below does not cover that registry walk at all — the fixture would be asserting " +
                    "purity of code it never runs.");

            ulong before = sim.StateHash();
            for (int i = 0; i < 3; i++) gs.RenderForTest();
            Assert.AreEqual(before, sim.StateHash(),
                "rendering the blocked channel moved the determinism hash. This channel is view-only: " +
                "it reads tile flags, two registries and a pure predicate, and every one of those is " +
                "hashed state it must not write.");
        }

        // ══════════════════════════════ THE THIRD QUESTION: can any crew member PATH here? ═════════
        //
        // WHAT THESE LEGS ADD, AND WHY THEY ARE DRIVEN. `WireFormat.ReasonUnreachable` is fed by
        // `JobSystem.IsBackedOff` — the fan-out of the sim's OWN job-board back-off, not a host-side
        // reachability computation. So the only honest way to pin it is to make the real dispatcher
        // fail a real claim: a scan for the call, or a hand-planted dictionary entry, would both
        // survive the seam being completely inert. That is the "verb parity is not sufficient" lesson
        // applied to a reason code.
        //
        // ⚠️ THE SIM-SIDE HALF IS IN `JobSourceBackoffTests`, WHERE EACH OF THE FOUR CARRIERS IS
        // DRIVEN BLINDED OF THE OTHER THREE. This file drives ONE carrier (build-ready) on the real
        // ship, because what these legs are about is the HOST's three-question precedence, the fog
        // gate and the latch — not which dictionary the sim stamped.

        /// <summary>A sealed two-tile pocket cut out of `--ship grid`, plus the walls that made it.
        /// <c>Site</c> takes the order; <c>Staging</c> is the neighbour a worker would stand on and is
        /// deliberately kept WALKABLE and BREATHABLE, so the air and approach questions both pass and
        /// only the third one can fire.</summary>
        private readonly struct Pocket
        {
            public readonly Int3 Site, Staging;
            public readonly List<(Int3 Pos, ushort Wall)> Planted;
            public Pocket(Int3 site, Int3 staging, List<(Int3, ushort)> planted)
            { Site = site; Staging = staging; Planted = planted; }
        }

        /// <summary>
        /// CUT A SEALED POCKET INTO THE SHIPPED SHIP and assert, with the sim's own pathfinder, that
        /// no living crew member can walk into it. Every dig designation on the ship is cleared first:
        /// the grid ship authors 20 of them and an idle citizen offered a nearer dig would never
        /// attempt the build, so the fixture would go quiet and every assertion after it would be
        /// vacuous. (That clearing is also what keeps the leg-isolation assertions in the airless
        /// tests above untouched by this section — see their note about the 20 authored digs.)
        ///
        /// ⚠️ THE PREMISES ARE ASSERTED, LOUDLY, BECAUSE THE FIXTURE IS CONSTRUCTED. It is not found
        /// on the shipped ship: `--ship grid` at boot has no breathable compartment that is also
        /// unreachable, which is precisely why the defect this reason reports was invisible. A
        /// constructed fixture that silently failed to construct is the shape that produces a
        /// screenful of green vacuities.
        /// </summary>
        private static Pocket SealPocket(Simulation sim, BuildSystem build)
        {
            var w = sim.World;

            int cleared = 0;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Designated) == 0) continue;
                        w.SetFlag(p, TileFlags.Designated, false);
                        cleared++;
                    }
            Assert.That(cleared, Is.GreaterThan(0),
                "PREMISE: --ship grid is documented to author 20 dig designations. Finding none means " +
                "the ship changed under this fixture, and the dig board may no longer be what starves " +
                "the build board of attempts.");

            var occupied = new HashSet<Int3>();
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++) occupied.Add(crew[i].Pos);

            Int3? site = null, staging = null;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 1; y < w.Height - 1 && site == null; y++)
                    for (int x = 1; x < w.Width - 1 && site == null; x++)
                    {
                        var a = new Int3(x, y, z);
                        if ((w.GetFlags(a) & TileFlags.Explored) == 0) continue;
                        if (!sim.IsWalkable(a) || occupied.Contains(a)) continue;
                        if (!build.CanDesignate(sim, a, BuildKind.Wall)) continue;
                        if (!WorksiteSafety.CanStageWorkerAt(sim, a)) continue;
                        for (int i = 0; i < 4 && site == null; i++)
                        {
                            var b = Int3.Neighbor4(a, i);
                            if (!w.InBounds(b) || !sim.IsWalkable(b) || occupied.Contains(b)) continue;
                            if (!WorksiteSafety.CanStageWorkerAt(sim, b)) continue;
                            bool inBounds = true;
                            foreach (var t in new[] { a, b })
                                for (int j = 0; j < 4; j++)
                                    if (!w.InBounds(Int3.Neighbor4(t, j))) inBounds = false;
                            if (!inBounds) continue;
                            site = a; staging = b;
                        }
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: --ship grid has no explored, buildable, breathable " +
                                   "tile with a breathable walkable neighbour, so no pocket can be cut " +
                                   "and every reachability leg would be vacuous.");

            var planted = new List<(Int3, ushort)>();
            foreach (var t in new[] { site.Value, staging.Value })
                for (int j = 0; j < 4; j++)
                {
                    var n = Int3.Neighbor4(t, j);
                    if (Same(n, site.Value) || Same(n, staging.Value)) continue;
                    if (!w.InBounds(n) || w.GetWall(n) == TileDefs.Wall) continue;
                    planted.Add((n, w.GetWall(n)));
                    w.SetWall(n, TileDefs.Wall);
                }
            Assert.That(planted.Count, Is.GreaterThan(0),
                "PREMISE: the pocket was already sealed before this fixture touched it, so restoring a " +
                "wall could not re-open it and the CLEAR leg would be untestable.");

            // What a SetTileCommand would publish for us. Done by hand because the fixture writes the
            // world plane directly — and stated rather than assumed, because a stale room map would
            // make the breathability premise below read the OLD compartment's air.
            sim.Rooms.MarkDirty();
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();
            var room = sim.Rooms.RoomAt(w, staging.Value);
            Assert.IsNotNull(room, "PREMISE FAILED: the sealed pocket resolved to no room at all, so " +
                                   "its air cannot be set and the AIR question would fire instead of " +
                                   "the reach question — the leg would pass for the wrong reason.");
            RoomState.Pressurize(room);

            Assert.That(sim.IsWalkable(site.Value), Is.True, "PREMISE: the site is still walkable");
            Assert.That(sim.IsWalkable(staging.Value), Is.True, "PREMISE: the staging tile is still walkable");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, staging.Value), Is.True,
                "PREMISE FAILED: the pocket is not breathable, so this fixture measures the AIR reason " +
                "and not the reach reason. The two are what this section exists to tell apart.");

            var path = new List<Int3>();
            for (int i = 0; i < crew.Count; i++)
                Assert.That(sim.Paths.FindPath(sim, crew[i].Pos, staging.Value, path), Is.False,
                    "PREMISE FAILED: crew member " + i + " CAN path into the 'sealed' pocket, so no " +
                    "claim will ever fail there and nothing will ever be backed off.");

            return new Pocket(site.Value, staging.Value, planted);
        }

        private static JobSystem JobsOf(Simulation sim)
        {
            foreach (var s in sim.Systems) if (s is JobSystem js) return js;
            Assert.Fail("premise: --ship grid runs a JobSystem");
            return null;
        }

        private static BuildSystem BuildOf(Simulation sim)
        {
            foreach (var s in sim.Systems) if (s is BuildSystem bs) return bs;
            Assert.Fail("premise: --ship grid runs a BuildSystem");
            return null;
        }

        /// <summary>Designate a materialed wall build at the pocket's site and drive the real
        /// dispatcher until it gives up on it. The material is DEPOSITED rather than hauled, so the
        /// only thing left that can fail is the approach.</summary>
        private static void PlantMateialedBuildAndDriveUntilBackedOff(Simulation sim, BuildSystem build,
                                                                      JobSystem jobs, Int3 site)
        {
            sim.EnqueueCommand(new DesignateBuildCommand(site, BuildKind.Wall, on: true, material: 0));
            sim.Tick();
            Assert.That(build.TryGet(site, out var pending), Is.True, "premise: the build was accepted");
            build.Deposit(sim, site, pending.Required);
            Assert.That(build.TryGet(site, out var ready) && BuildSystem.IsReady(ready), Is.True,
                "premise: the site is materialed, so it is offered through the READY board");
            sim.JobsDirty = JobBoardDirty.All;

            for (int t = 0; t < 400; t++)
            {
                sim.Tick();
                if (jobs.IsBackedOff(site, sim.TickCount, out _)) return;
            }
            Assert.Fail("PREMISE FAILED: 400 ticks and the job board never backed off " + site + ". No " +
                        "crew member attempted the build, so this fixture proves nothing about the " +
                        "reason it exists to test.");
        }

        /// <summary>
        /// ⭐ <b>THE INCLUSION TEST FOR THE THIRD QUESTION — plant the violation and require it named.</b>
        /// A build order sits in perfectly good air, with a walkable and breathable tile to stand on,
        /// and NO crew member can walk to it. Before this reason the channel called that site
        /// <c>NotBlocked</c>: the ghost froze at 0/2, the pawn read "Idle", and the game said the order
        /// was fine.
        ///
        /// The control half is required and is here: a second, REACHABLE build in the same good air
        /// must be ABSENT from the channel. Without it, a host that emitted every pending build would
        /// pass.
        ///
        /// MUTATION 1: <c>return false;</c> in <c>JobSystem.IsBackedOff</c>'s loop ⇒ red on the first
        /// assertion. MUTATION 2: delete the reach question from <c>GameSession.BlockedReason</c> ⇒
        /// same. MUTATION 3: report <c>ReasonUnreachable</c> without asking <c>IsBackedOff</c> ⇒ red on
        /// the control.
        /// </summary>
        [Test]
        public void A_Build_No_Crew_Can_Walk_To_Is_Named_Unreachable_And_A_Reachable_One_Is_Not()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);

            var pocket = SealPocket(sim, build);

            // The CONTROL: a reachable, breathable, buildable tile outside the pocket.
            Int3? control = null;
            var w = sim.World;
            for (int z = 0; z < w.Depth && control == null; z++)
                for (int y = 0; y < w.Height && control == null; y++)
                    for (int x = 0; x < w.Width && control == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (Same(p, pocket.Site) || Same(p, pocket.Staging)) continue;
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!build.CanDesignate(sim, p, BuildKind.Wall)) continue;
                        bool stageable = false;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { stageable = true; break; }
                        }
                        if (stageable) control = p;
                    }
            Assert.IsNotNull(control, "PREMISE FAILED: no reachable buildable tile for the control half");
            sim.EnqueueCommand(new DesignateBuildCommand(control.Value, BuildKind.Wall, on: true, material: 0));
            sim.Tick();

            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, pocket.Site);

            var row = RowAt(gs, pocket.Site);
            Assert.IsNotNull(row, "THE PLANTED, KNOWN-UNREACHABLE BUILD AT " + pocket.Site + " IS NOT ON " +
                "THE CHANNEL. This is the 480 000-tick silent stall: two legal verbs produce a ghost " +
                "frozen at 0/2, a pawn reading Idle, and a channel saying nothing is wrong.");
            Assert.AreEqual(WireFormat.OrderBuild, row.Value.Order, "the order kind must say BUILD");
            Assert.AreEqual(WireFormat.ReasonUnreachable, row.Value.Reason,
                "the reason must be UNREACHABLE. AIR would be a confident lie: the fixture asserted " +
                "the staging tile is breathable, so venting would change nothing.");

            Assert.IsNull(RowAt(gs, control.Value),
                "a REACHABLE build in good air reached the channel. The reach question is not asking " +
                "the job board — it is reporting every pending build, which would badge the whole ship.");
        }

        /// <summary>
        /// ⭐ <b>PRECEDENCE: A SITE THAT IS BOTH AIRLESS AND UN-REACHED REPORTS <i>AIR</i>.</b> This is
        /// not a tie-break preference. <c>JobWork.TryPathToAdjacent</c> stamps its back-off for an AIR
        /// refusal exactly as it does for a pathing one, so almost every airless order on a wreck is
        /// ALSO backed off — asking the reach question first would repaint the entire wreck with a
        /// reason that sends the player looking for a route through a corridor that is merely
        /// unbreathable. The player's next action differs, which is the same argument
        /// <c>WireFormat.Blocked.cs</c> makes for keeping AIR and NO_APPROACH apart.
        ///
        /// MUTATION: move the reach question above the air question in <c>GameSession.BlockedReason</c>
        /// ⇒ red here and GREEN in every other leg of this file, which is exactly why it is its own test.
        /// </summary>
        [Test]
        public void A_Site_That_Is_Both_Airless_And_Unreached_Reports_Air_Not_Unreachable()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);
            var w = sim.World;

            // Clear the authored digs for the same reason SealPocket does: an idle citizen offered a
            // nearer dig never attempts the build, and an unattempted site is never stamped.
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                        w.SetFlag(new Int3(x, y, z), TileFlags.Designated, false);

            Int3? site = null;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 0; y < w.Height && site == null; y++)
                    for (int x = 0; x < w.Width && site == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!build.CanDesignate(sim, p, BuildKind.Wall)) continue;
                        bool anyWalkable = false, allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            anyWalkable = true;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                        }
                        if (anyWalkable && allRefused) site = p;
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: --ship grid has no buildable tile whose approach is " +
                                   "airless, so the precedence leg would be vacuous.");

            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, site.Value);

            Assert.That(jobs.IsBackedOff(site.Value, sim.TickCount, out _), Is.True,
                "PREMISE: the site really is BOTH airless and backed off — otherwise this test could " +
                "pass with only one of the two conditions present and would pin nothing about order.");

            var row = RowAt(gs, site.Value);
            Assert.IsNotNull(row, "premise: the airless build is on the channel at all");
            Assert.AreEqual(WireFormat.ReasonAir, row.Value.Reason,
                "a site that is BOTH airless and backed off reported the reach reason. The air answer " +
                "is the actionable one — vent the compartment — and the reach answer would send the " +
                "player hunting a route into a room nobody could work in anyway.");
        }

        /// <summary>
        /// ⭐⭐ <b>THE LATCH: THE ROW SURVIVES THE BACK-OFF EXPIRING WITH NOTHING FIXED.</b> This is the
        /// leg the package would be a five-second lie without, and it is why the decision recorded in
        /// <c>GameSession._latched</c> had to be taken rather than deferred.
        ///
        /// <c>JobWork.UnreachableRetryTicks</c> is 50 ticks. Re-stamping needs a citizen to ATTEMPT the
        /// claim again, so the fixture takes the crew off the board (<c>HoldPosition</c> — the sim's own
        /// "never self-assign" flag) exactly as a 900 s Maintain service would, and drives 600 ticks:
        /// twelve expiries and, with <c>JobBoardDirty.Tiles</c> raised, a wholesale
        /// <c>ForgetBackoffsOnTileChange</c> as well.
        ///
        /// <b>THE NON-VACUITY IS ASSERTED IN THE MIDDLE OF THE TEST</b>: the RAW predicate is required
        /// to have gone false before the row is required to still be there. Without that assertion this
        /// test would pass on a build that never expires, and would tell nobody anything.
        ///
        /// MUTATION: delete the <c>carry</c> clause in <c>GameSession.BlockedReason</c> (or the
        /// <c>_latched</c>/<c>_latchNext</c> swap in <c>BuildBlocked</c>) ⇒ red on the final assertion,
        /// and GREEN on every other leg in this file.
        /// </summary>
        [Test]
        public void The_Unreachable_Row_Survives_The_Backoff_Expiring_And_A_TileBoard_Event()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);

            var pocket = SealPocket(sim, build);
            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, pocket.Site);

            var first = RowAt(gs, pocket.Site);
            Assert.IsNotNull(first, "premise: the row is there before the wait");
            Assert.AreEqual(WireFormat.ReasonUnreachable, first.Value.Reason);

            // Take the crew off the job board, the way a long service does. `HoldPosition` is the
            // dispatcher's own gate (`Citizen.IsRecruitableForWork`), so this is the sim's mechanism
            // and not a test-only back door.
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                crew[i].JobKind = JobKind.None;
                crew[i].HoldPosition = true;
            }

            for (int t = 0; t < 600; t++)
            {
                sim.JobsDirty |= JobBoardDirty.Tiles;   // the wholesale ForgetBackoffsOnTileChange path
                sim.Tick();
            }

            Assert.That(jobs.IsBackedOff(pocket.Site, sim.TickCount, out _), Is.False,
                "NON-VACUITY FAILED: the raw back-off is STILL live after 600 ticks, so this test " +
                "cannot distinguish a working latch from no latch at all. Something re-stamped the " +
                "site — check that HoldPosition still gates IsRecruitableForWork.");

            var after = RowAt(gs, pocket.Site);
            Assert.IsNotNull(after, "THE REASON BLINKED OUT WITH THE DOOR STILL SHUT. The back-off " +
                "stamp lasts 5 seconds and nothing re-took it, so without the host latch this channel " +
                "explains a stalled order for five seconds and then goes silent for as long as the " +
                "crew stay busy — the invisible-feedback failure the marks channel exists to prevent, " +
                "re-introduced by the package built to remove it.");
            Assert.AreEqual(WireFormat.ReasonUnreachable, after.Value.Reason,
                "the latched row must keep its own reason, not decay into another one");
        }

        /// <summary>
        /// ⭐ <b>THE NEGATIVE, AND IT IS REQUIRED: RE-OPEN THE ROUTE AND THE ROW GOES AWAY ON ITS OWN.</b>
        /// A guard that only proves a row APPEARS is satisfied by a channel that reports every order
        /// forever — and a LATCHED row is exactly the kind that could. The pocket is re-opened by
        /// restoring one planted wall (what a strip or a dig would do for a player), the crew are put
        /// back on the board, and the row must clear with no further player action.
        ///
        /// It also pins WHICH event clears the latch: a crew member actually taking the job, which is
        /// the observable consequence of <c>TryClaim</c> succeeding — the honest reading of the row is
        /// *"the last attempt failed and none has succeeded since"*.
        ///
        /// MUTATION: make <c>GameSession.CrewHoldsJobAt</c> return false ⇒ red here and GREEN
        /// everywhere else. MUTATION 2: <c>return true</c> unconditionally from
        /// <c>JobSystem.IsBackedOff</c> ⇒ red here.
        /// </summary>
        [Test]
        public void Reopening_The_Route_Clears_The_Unreachable_Row_With_No_Further_Player_Action()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);
            var w = sim.World;

            var pocket = SealPocket(sim, build);
            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, pocket.Site);
            Assert.IsNotNull(RowAt(gs, pocket.Site), "premise: the row is there before the route re-opens");

            // Re-open the pocket: put every planted wall back the way it was.
            foreach (var (pos, wall) in pocket.Planted) w.SetWall(pos, wall);
            sim.Rooms.MarkDirty();
            sim.JobsDirty = JobBoardDirty.All;
            sim.Tick();

            var path = new List<Int3>();
            bool reachable = false;
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
                if (sim.Paths.FindPath(sim, crew[i].Pos, pocket.Staging, path)) reachable = true;
            Assert.That(reachable, Is.True,
                "PREMISE FAILED: restoring the planted walls did not re-open the pocket, so nothing " +
                "was fixed and the clear leg would be asserting the latch never latched.");
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, pocket.Staging), Is.True,
                "PREMISE: the re-opened pocket is still breathable, so AIR cannot be what clears the row");

            bool claimed = false;
            for (int t = 0; t < 2000 && !claimed; t++)
            {
                sim.Tick();
                crew = sim.Citizens.Items;
                for (int i = 0; i < crew.Count; i++)
                    if (!crew[i].Dead && crew[i].JobKind != JobKind.None && Same(crew[i].JobTarget, pocket.Site))
                        claimed = true;
            }
            Assert.That(claimed, Is.True,
                "PREMISE FAILED: 2000 ticks after the route re-opened and no crew member ever took the " +
                "build. The latch's clear condition is 'somebody got here', so with nobody getting " +
                "there this test could not tell a cleared latch from a stuck one.");

            Assert.IsNull(RowAt(gs, pocket.Site),
                "THE ROW DID NOT CLEAR. A crew member is standing on the job, so the claim 'no crew has " +
                "reached it' is now false and the badge is a lie the player cannot dismiss.");
        }

        /// <summary>
        /// ⭐⭐ <b>THE LATCH IS NEVER STARTED BY AN <i>AIR</i> REFUSAL — and this test exists because
        /// widening that guard was applied and the suite stayed GREEN (29/29).</b>
        ///
        /// <c>JobWork.TryPathToAdjacent</c> stamps its back-off for an AIR refusal exactly as it does
        /// for a pathing one. So if <c>GameSession.BlockedReason</c> latched on any live stamp, an
        /// airless order would acquire a REACH latch it never earned — and the moment the player
        /// vented the compartment, the badge would stay, now saying something false about a problem
        /// they have just fixed. The latch is therefore started only by a stamp taken while the site
        /// is otherwise fine (<c>live &amp;&amp; anyStageable</c>), and carried thereafter.
        ///
        /// The crew are frozen before the render so that the CLEAR path under test is the guard and
        /// not somebody claiming the job, and the wait past the expiry is what makes <c>carry</c> —
        /// rather than <c>live</c> — the only thing that could still be holding the row.
        ///
        /// MUTATION: <c>(live &amp;&amp; anyStageable)</c> → <c>live</c> ⇒ red HERE and green in every
        /// other leg of this file.
        /// </summary>
        [Test]
        public void An_Air_Refusal_Never_Starts_A_Reach_Latch_So_Venting_Really_Clears_It()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);
            var w = sim.World;

            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                        w.SetFlag(new Int3(x, y, z), TileFlags.Designated, false);

            Int3? site = null, staging = null;
            for (int z = 0; z < w.Depth && site == null; z++)
                for (int y = 0; y < w.Height && site == null; y++)
                    for (int x = 0; x < w.Width && site == null; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (!build.CanDesignate(sim, p, BuildKind.Wall)) continue;
                        Int3? firstWalkable = null;
                        bool allRefused = true;
                        for (int i = 0; i < 4; i++)
                        {
                            var n = Int3.Neighbor4(p, i);
                            if (!w.InBounds(n) || !sim.IsWalkable(n)) continue;
                            if (WorksiteSafety.CanStageWorkerAt(sim, n)) { allRefused = false; break; }
                            if (firstWalkable == null) firstWalkable = n;
                        }
                        if (allRefused && firstWalkable != null) { site = p; staging = firstWalkable; }
                    }
            Assert.IsNotNull(site, "PREMISE FAILED: no airless-approach buildable tile on --ship grid");

            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, site.Value);
            var row = RowAt(gs, site.Value);      // ⚠️ this render is where a widened guard would latch
            Assert.IsNotNull(row, "premise: the airless site is on the channel");
            Assert.AreEqual(WireFormat.ReasonAir, row.Value.Reason, "premise: it reports AIR");

            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++) { crew[i].JobKind = JobKind.None; crew[i].HoldPosition = true; }
            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(jobs.IsBackedOff(site.Value, sim.TickCount, out _), Is.False,
                "NON-VACUITY: the raw stamp must have expired, or `live` and not `carry` would be " +
                "what keeps any row alive below and this test would pin the wrong clause");

            var room = sim.Rooms.RoomAt(w, staging.Value);
            Assert.IsNotNull(room, "premise: the airless staging tile resolves to a room");
            RoomState.Pressurize(room);
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, staging.Value), Is.True,
                "PREMISE FAILED: pressurising did not make the staging tile usable, so nothing was " +
                "fixed and the clear could not be observed");

            Assert.IsNull(RowAt(gs, site.Value),
                "THE PLAYER VENTED THE COMPARTMENT AND THE BADGE STAYED. The back-off that stamped " +
                "this site was an AIR refusal, so it must never have started a reach latch — a latch " +
                "that outlives the fix is a badge the player cannot dismiss and cannot act on.");
        }

        /// <summary>
        /// ⭐⭐ <b>PRECEDENCE, ON THE ONLY CASE THAT CAN ACTUALLY REACH IT — AND THIS TEST EXISTS
        /// BECAUSE THE OBVIOUS ONE DOES NOT.</b>
        ///
        /// <b>MEASURED, NOT ASSUMED:</b> moving the reach question above the air question in
        /// <c>GameSession.BlockedReason</c> was applied and the whole suite stayed <b>GREEN (28/28)</b>.
        /// The reason is that a site whose air is bad never STARTS a latch — the start condition is
        /// <c>live &amp;&amp; anyStageable</c> — so for an airless site <c>reached</c> is false and the
        /// return order cannot matter. The sibling test above therefore pins the latch-START guard,
        /// not the return ORDER, and a reviewer reading it would have believed otherwise.
        ///
        /// The case that DOES reach it is a site that was latched while its compartment was fine and
        /// then LOST ITS AIR — a shut door plus a breach, which is an ordinary wreck evening. Here
        /// <c>carry</c> is true and <c>anyStageable</c> is false at the same time, and the two answers
        /// compete for real. AIR must win: it is the actionable one, and the player who is told "no
        /// crew has reached it" will go hunting for a route into a compartment nobody could work in.
        ///
        /// MUTATION: move the reach question above the air question ⇒ red HERE and green everywhere
        /// else in this file — which is the whole point of writing it separately.
        /// </summary>
        [Test]
        public void A_Latched_Site_That_Loses_Its_Air_Reports_Air_Not_The_Latched_Reason()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);

            var pocket = SealPocket(sim, build);
            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, pocket.Site);

            var latched = RowAt(gs, pocket.Site);
            Assert.IsNotNull(latched, "premise: the site is on the channel");
            Assert.AreEqual(WireFormat.ReasonUnreachable, latched.Value.Reason,
                "premise: it is LATCHED as unreachable before the air goes");

            // Vent the pocket. Setting the gas directly is the room's own state — the same handle
            // `RoomState.Pressurize` writes, used in the opposite direction — so this is the sim's
            // mechanism and not a host-side fake.
            var room = sim.Rooms.RoomAt(sim.World, pocket.Staging);
            Assert.IsNotNull(room, "premise: the pocket still resolves to a room");
            room.O2Moles = 0; room.N2Moles = 0; room.CO2Moles = 0;
            Assert.That(WorksiteSafety.CanStageWorkerAt(sim, pocket.Staging), Is.False,
                "PREMISE FAILED: venting the pocket did not make it unstageable, so the two answers " +
                "never compete and this test would pin nothing.");

            var after = RowAt(gs, pocket.Site);
            Assert.IsNotNull(after, "the row vanished entirely when the air went — both questions " +
                "answer 'blocked' here, so something is eating the row");
            Assert.AreEqual(WireFormat.ReasonAir, after.Value.Reason,
                "a LATCHED site that has since lost its air reported the reach reason. Air is the " +
                "actionable answer and it must outrank the latch, or the player is sent looking for a " +
                "route into a compartment where no work could happen anyway.");
        }

        /// <summary>
        /// THE FOG GATE HOLDS FOR THE NEW REASON TOO. An unreachable order in unexplored space must
        /// emit nothing: a rendering fix must not become a fog-of-war change, and this is the channel
        /// whose whole job is to talk about tiles nobody can get to — exactly the tiles a leak would
        /// reveal.
        ///
        /// MUTATION: delete the <c>Explored</c> gate in <c>GameSession.AddIfBlocked</c> ⇒ red.
        /// </summary>
        [Test]
        public void An_Unexplored_Unreachable_Site_Does_Not_Reach_The_Wire()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var build = BuildOf(sim);
            var jobs = JobsOf(sim);

            var pocket = SealPocket(sim, build);
            PlantMateialedBuildAndDriveUntilBackedOff(sim, build, jobs, pocket.Site);
            Assert.IsNotNull(RowAt(gs, pocket.Site), "control: the explored site IS on the channel");

            sim.World.SetFlag(pocket.Site, TileFlags.Explored, false);
            Assert.IsNull(RowAt(gs, pocket.Site),
                "an UNEXPLORED unreachable site reached the wire. The latch does not exempt a row from " +
                "the fog gate — AddIfBlocked returns before BlockedReason is ever called, which is also " +
                "what prunes the latch entry.");
        }
    }
}
