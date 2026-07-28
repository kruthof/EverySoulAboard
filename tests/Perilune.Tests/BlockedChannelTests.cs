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
            StringAssert.Contains("[7,3,1,", WireFormat.Devices(new[] { new WireFormat.DeviceCell(7, 3, 1, 4, 200, 1) }),
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
        /// ⚠️ THE PLAYER-FACING CONSEQUENCE IS REPORTED HERE, NOT SOLVED HERE: on the one standard
        /// ship, the hold shows ten "no way to stand next to it" badges from the first frame the crew
        /// light it. They are HONEST (nothing is happening on those tiles) and self-resolving in
        /// principle (the outer row is designated too), but ten fault badges on a new player's first
        /// screen is a crying-wolf risk. The two candidate remedies — suppress <c>no_approach</c> when
        /// a 4-neighbour carries the same order, or drop <c>no_approach</c> for dig entirely — both
        /// hide a real permanent failure in the isolated-tile case, so they are owner decisions rather
        /// than something this lane resolves on its own.
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
        /// MUTATION: have <c>BuildBlocked</c> write anything to the sim (set a flag, clear a
        /// designation) ⇒ red.
        /// </summary>
        [Test]
        public void Rendering_The_Blocked_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = BootGrid();
            var sim = host.Sim;
            var (airless, _) = FindAirlessSite(sim);
            sim.World.SetFlag(airless, TileFlags.Designated, true);

            ulong before = sim.StateHash();
            for (int i = 0; i < 3; i++) gs.RenderForTest();
            Assert.AreEqual(before, sim.StateHash(),
                "rendering the blocked channel moved the determinism hash. This channel is view-only: " +
                "it reads tile flags, two registries and a pure predicate, and every one of those is " +
                "hashed state it must not write.");
        }
    }
}
