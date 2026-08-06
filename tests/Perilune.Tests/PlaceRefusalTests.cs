using System;
using System.Collections.Generic;
using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WireFormat, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>A REFUSED PLACEMENT SAYS WHY.</b> The player sentence: <i>when you put a table down and
    /// the ship will not build it, the game tells you what stopped it — the press never just
    /// evaporates.</i>
    ///
    /// <para><b>THE SIGHTING, AND IT IS THIS FILE'S REASON.</b> The owner, 2026-08-05: *"the ghost
    /// shows items are placeable in all open areas — how it should be — but the actual building only
    /// works in some, which makes no sense; something is broken."* Two causes. The first was a lost
    /// CLICK and is closed in the client (<c>roomzoom-view.js</c>'s BUG-B block). The second is here:
    /// <c>PlaceDeviceCommand.Execute</c> was a chain of bare <c>return;</c>s, and its own contract
    /// said so out loud — *"an illegal request is a silent no-op — the client only promises the
    /// attempt"*.</para>
    ///
    /// <para>⭐ <b>THE NUMBER THAT MADE IT A PACKAGE, MEASURED IN A REAL BROWSER</b>
    /// (<c>client/tools/place-census-shot.mjs</c>, shipped wreck, sim RUNNING, canvas measured
    /// tearing down 7×/s): with the click loss closed, <b>30 presses on clear floor, 30 commands on
    /// the wire, 1 device placed and 29 refusals — not one of them audible.</b> A refusal the player
    /// cannot hear is indistinguishable from a broken verb, which is <c>docs/TRAPS.md</c> Part C's
    /// "invisible feedback is FUNCTIONAL" — a rule this repo has paid for three times.</para>
    ///
    /// <para>⛔ <b>WHAT THIS FILE DOES NOT DO: RE-DERIVE LEGALITY.</b> Every leg drives
    /// <c>PlaceDeviceCommand</c> itself and reads the event it publishes. There is no second predicate
    /// anywhere — not here, not in the host, not in the client — because a second authority on what
    /// the sim accepts drifts from the first on the tick after it is written.</para>
    /// </summary>
    [TestFixture]
    public class PlaceRefusalTests
    {
        /// <summary>The shipping ship, a session over it, no sim thread — <c>DroppedOrderTests</c>'
        /// fixture, and for its reason: the OD-H boot state is the state a player is actually in.</summary>
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        /// <summary>Run one <see cref="PlaceDeviceCommand"/> through a tick and hand back every
        /// <see cref="PlaceRefusedEvent"/> it published.
        ///
        /// ⚠️ READ INSIDE THE SAME TICK, NEVER AFTER TWO. The event bus is double-buffered and swaps
        /// at the END of every tick, so a helper that ticked twice and then read would find nothing
        /// and every leg below would pass VACUOUSLY — the exact shape <c>GameSession.AdvanceTicks</c>'
        /// own header exists to warn about.</summary>
        private static PlaceRefusedEvent[] PlaceAndRead(Simulation sim, DeviceKind kind, Int3 pos, byte facing = 0)
        {
            sim.EnqueueCommand(new PlaceDeviceCommand(kind, pos, facing));
            sim.Tick();
            return sim.Events.Read<PlaceRefusedEvent>().ToArray();
        }

        /// <summary>A tile on the wreck that a placement really does succeed on, found by asking the
        /// command rather than by hand-writing a coordinate that a later ship edit would silently
        /// invalidate. Also the non-vacuity floor for every refusal leg: if NOTHING can be placed,
        /// "it refused" says nothing.</summary>
        private static bool TryFindPlaceableTile(Simulation sim, out Int3 found)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if (w.GetWall(p) != TileDefs.Void) continue;
                        if ((w.GetFlags(p) & TileFlags.HasDevice) != 0) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        found = p;
                        return true;
                    }
            found = default;
            return false;
        }

        /// <summary>Give the ship enough LOOSE Parts that the pay arm cannot be what refuses.
        /// Returns how many were added.</summary>
        private static void StockParts(Simulation sim, Int3 at, int units)
            => sim.AddItem(PlaceDeviceCommand.Currency, units, at);

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 1. THE OUTCOME: every arm names its own reason, and none of them is the sentinel.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S CENTRAL CLAIM.</b> Each of the six rejection clauses in
        /// <c>PlaceDeviceCommand.Execute</c> publishes exactly one event, carrying a NON-ZERO reason,
        /// and the six reasons are PAIRWISE DISTINCT.
        ///
        /// <para>⛔ <b>DISTINCTNESS IS THE LEG THAT BITES, NOT NON-ZERO-NESS.</b> A refusal channel on
        /// which two different causes print the same sentence is a channel that tells the player
        /// something false — and "all six are non-zero" is satisfied by six copies of the same byte.
        /// This is <c>ThawGate</c>'s pairwise-distinct pin (<c>ThawGateTests</c>) applied to the
        /// second refusal family in the game.</para>
        ///
        /// <para>⛔ <b>AND <see cref="PlaceRefusal.None"/> IS THE NO-DEFAULT RULE MADE OBSERVABLE.</b>
        /// A seventh clause added without its own enum member would ship as 0; this leg is what turns
        /// that into a red instead of into a sentence the player cannot act on.</para>
        ///
        /// <para>MUTATION: replace any one arm's <c>Refuse(sim, PlaceRefusal.X)</c> with a bare
        /// <c>return</c> ⇒ RED, naming that arm ("published 0 events"). MUTATION: give two arms the
        /// same member ⇒ RED on the distinctness leg.</para>
        /// </summary>
        [Test]
        public void EveryRefusalArmNamesItsOwnReason_Distinct_AndNeverTheSentinel()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            Assert.IsTrue(TryFindPlaceableTile(sim, out var clear),
                "the wreck has no tile a placement can succeed on at all — every refusal leg below "
                + "would be vacuously true, so the run stops rather than reporting findings about it");
            StockParts(sim, clear, 99);   // so CannotPay is never the accidental answer
            sim.Tick();

            var seen = new Dictionary<string, byte>();
            void Leg(string what, DeviceKind kind, Int3 pos, PlaceRefusal want)
            {
                var evs = PlaceAndRead(sim, kind, pos);
                Assert.AreEqual(1, evs.Length, what + ": published " + evs.Length + " events, expected exactly 1");
                Assert.AreNotEqual((byte)PlaceRefusal.None, evs[0].Reason,
                    what + ": published the NO-DEFAULT sentinel. A clause with no member of its own "
                    + "ships as 0, and 0 has no sentence — which is the silence this package removes.");
                Assert.AreEqual((byte)want, evs[0].Reason, what + ": named the wrong reason");
                Assert.AreEqual(pos, evs[0].Pos, what + ": named the wrong tile");
                Assert.AreEqual((byte)kind, evs[0].Kind, what + ": named the wrong kind");
                seen[what] = evs[0].Reason;
            }

            // (1) NOT PLACEABLE — a Door is a real DeviceKind and is deliberately off the whitelist.
            Leg("not-placeable", DeviceKind.Door, clear, PlaceRefusal.NotPlaceable);
            // (2) OUT OF BOUNDS.
            Leg("out-of-bounds", DeviceKind.Table, new Int3(-1, -1, 0), PlaceRefusal.OutOfBounds);
            // (3) NOT WALKABLE — found by asking the world, never hand-written. ⚠️ THE PREDICATE IS
            //     JUST "unwalkable", and the first draft's extra `&& GetWall == Void` term was wrong
            //     in a way worth recording: `Execute` tests Walkable BEFORE it tests the wall, so a
            //     rubble tile reaches the NotWalkable arm and never the Blocked one. The narrower
            //     predicate matched NOTHING on the wreck and the leg went red for the wrong reason.
            Assert.IsTrue(TryFindTile(sim, p => (sim.World.GetFlags(p) & TileFlags.Walkable) == 0, out var unwalkable),
                "no unwalkable tile on the wreck at all — the NotWalkable arm cannot be reached here");
            Leg("not-walkable", DeviceKind.Table, unwalkable, PlaceRefusal.NotWalkable);
            // (4) BLOCKED is NOT driven here, and the leg below says why with a census rather than
            //     with prose. See `TheBlockedArmIsABackstop_NotAPath`.
            // (5) OCCUPIED — an AUTHORED device's tile. ⚠️ THIS LEG USED TO PLACE ONE FIRST AND PRESS
            //     AGAIN, AND THE BLUEPRINT PACKAGE INVALIDATED THAT: a successful press now lays a
            //     SITE, not a device, so pressing the same tile twice is `AlreadyQueued`. The two
            //     causes are genuinely different and both are driven, separately, below.
            Assert.IsTrue(TryFindTile(sim, p => sim.TryGetDeviceAt(p, out _), out var occupied),
                "no device stands anywhere on the wreck — the Occupied arm cannot be reached here");
            Leg("occupied", DeviceKind.Table, occupied, PlaceRefusal.Occupied);

            //     …and the CONTROL that keeps every leg above non-vacuous: a legal, paid-for press
            //     really does succeed. It lays a BLUEPRINT (`BlueprintTests` owns that claim in
            //     full); here it only has to be silent and real.
            var okEvents = PlaceAndRead(sim, DeviceKind.Table, clear);
            Assert.AreEqual(0, okEvents.Length, "a legal, paid-for placement published a refusal");
            var build = sim.Systems.OfType<BuildSystem>().First();
            Assert.IsTrue(build.TryGet(clear, out _),
                "the control placement laid nothing at all, so every refusal leg above is measuring "
                + "a command that never works and the whole file is vacuous");

            // (7) ALREADY QUEUED — the same tile again, now that a blueprint stands on it.
            Leg("already-queued", DeviceKind.Table, clear, PlaceRefusal.AlreadyQueued);

            // (6) CANNOT PAY — on a fresh ship with nothing loose.
            var (_, host2) = BootWreck();
            var sim2 = host2.Sim;
            Assert.IsTrue(TryFindPlaceableTile(sim2, out var clear2));
            DrainLooseParts(sim2);
            sim2.Tick();
            var broke = PlaceAndRead(sim2, DeviceKind.Table, clear2);
            Assert.AreEqual(1, broke.Length, "a ship that cannot pay published " + broke.Length + " events");
            Assert.AreEqual((byte)PlaceRefusal.CannotPay, broke[0].Reason, "the pay arm named the wrong reason");
            Assert.AreEqual(sim2.Defs.Build.DevicePlaceCost, broke[0].Price, "the refusal did not carry the PRICE");
            Assert.AreEqual(0, broke[0].Affordable,
                "the refusal did not carry what was actually LOOSE. That number is the whole reason "
                + "this arm exists on the wire: the `ledger` channel totals every Part ABOARD, and "
                + "`TryPay` spends only loose, unreserved stacks — a ship whose Parts are in a "
                + "hauler's arms reads rich and refuses anyway.");
            seen["cannot-pay"] = broke[0].Reason;

            var byReason = seen.GroupBy(kv => kv.Value).Where(g => g.Count() > 1).ToArray();
            Assert.IsEmpty(byReason.Select(g => string.Join("+", g.Select(kv => kv.Key))),
                "two different causes ship the SAME reason byte, so the player is told the same thing "
                + "about two different problems: " + string.Join(", ",
                    byReason.Select(g => string.Join(" and ", g.Select(kv => kv.Key)) + " both = " + g.Key)));
            // SIX arms are driven HERE — not-placeable, out-of-bounds, not-walkable, occupied,
            // already-queued, cannot-pay. The enum has eight members: `None` is the sentinel that is
            // never published, `Blocked` is unreachable by construction
            // (`TheBlockedArmIsABackstop_NotAPath`) and `TooManyQueued` needs a full queue and has its
            // own test (`TheQueueCapNamesItself`). Every member is accounted for, in exactly one place.
            Assert.AreEqual(6, seen.Count, "not all six arms driven here were driven");
            GC.KeepAlive(gs);
        }

        /// <summary>
        /// ⛔ <b><see cref="PlaceRefusal.Blocked"/> IS A CORRUPT-STATE BACKSTOP, NOT A PATH A PLAYER
        /// CAN TAKE — and this is the census that says so rather than a comment.</b>
        ///
        /// <para><c>Execute</c> tests <c>Walkable</c> BEFORE it tests the wall, and the world's own
        /// invariant is that a walled tile is not walkable (<c>World.SetWall</c> recomputes flags —
        /// <c>BuildSystem.Complete</c>'s Wall arm names it: <i>"RecomputeFlags → BlocksGas, not
        /// walkable"</i>). So no tile can reach the wall clause, and the arm exists for the same
        /// reason <c>DeconstructSystem</c> keeps its own duplicate guards: a corrupt save.</para>
        ///
        /// <para>⭐ IT IS CENSUSED ACROSS ALL THREE AUTHORED SHIPS RATHER THAN ARGUED, so the day the
        /// invariant changes this goes red and somebody drives the arm properly instead of shipping
        /// an untested clause. That is the 4th trap shape's rule — non-vacuity by INCLUSION — pointed
        /// at an absence claim.</para>
        /// </summary>
        [Test]
        public void TheBlockedArmIsABackstop_NotAPath()
        {
            foreach (var ship in new[] { ShipChoice.Wreck, ShipChoice.Grid, ShipChoice.Slice })
            {
                var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
                var w = host.Sim.World;
                int walkableAndWalled = 0, unwalkable = 0;
                for (int z = 0; z < w.Depth; z++)
                    for (int y = 0; y < w.Height; y++)
                        for (int x = 0; x < w.Width; x++)
                        {
                            var p = new Int3(x, y, z);
                            bool walk = (w.GetFlags(p) & TileFlags.Walkable) != 0;
                            if (!walk) unwalkable++;
                            else if (w.GetWall(p) != TileDefs.Void) walkableAndWalled++;
                        }
                Assert.Greater(unwalkable, 0, ship + ": the scan found no unwalkable tile at all, so "
                    + "this census is not looking at a real world and its zero below means nothing");
                Assert.AreEqual(0, walkableAndWalled,
                    ship + ": " + walkableAndWalled + " tiles are WALKABLE and WALLED. The Blocked "
                    + "arm of PlaceDeviceCommand is now reachable by an ordinary press and must be "
                    + "DRIVEN in EveryRefusalArmNamesItsOwnReason rather than left as a backstop.");
            }
        }

        /// <summary>
        /// ⭐ THE QUEUE CAP SAYS SO BY NAME. `defs.Build.MaxStaged` (64) is a real wall a player can
        /// hit by laying furniture, and "too many queued" is a reason they can ACT on — which is why
        /// it is not folded into <see cref="PlaceRefusal.AlreadyQueued"/>: the two say "not here" and
        /// "not yet, anywhere".
        ///
        /// <para>MUTATION: return <c>AlreadyQueued</c> from the cap arm ⇒ RED (the player is told to
        /// try another tile, and every tile refuses).</para>
        /// </summary>
        [Test]
        public void TheQueueCapNamesItself()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            var build = sim.Systems.OfType<BuildSystem>().First();
            var spot = ClearTileFor(sim);
            StockParts(sim, spot, 9999);
            sim.Tick();

            // Fill the queue with WALL designations — cheaper to author than 64 placements, and the
            // cap is a property of the LIST, not of what is on it.
            //
            // ⛔ `spot` IS SKIPPED, AND IT IS A REAL DEFECT THIS FIXTURE CARRIED RATHER THAN A
            // TIDY-UP. `ClearTileFor` takes the FIRST placeable tile in (z, y, x) scan order and this
            // loop designates in the SAME order, so the two collide the moment `spot` lands inside
            // the first 64 designable tiles — and then the press below is refused `AlreadyQueued`
            // (7), not `TooManyQueued` (8), and the cap arm is never reached at all. It did not
            // collide only because the cryo bay's floor happened to be full of machinery; the
            // 2026-08-06 declutter ruling emptied that floor, `spot` became (1,1,0), and the test
            // went red for a reason that had nothing to do with the queue cap. A fixture whose
            // subject depends on another compartment's furniture is not measuring what it says.
            int cap = sim.Defs.Build.MaxStaged;
            int laid = 0;
            var w = sim.World;
            for (int z = 0; z < w.Depth && laid < cap; z++)
                for (int y = 0; y < w.Height && laid < cap; y++)
                    for (int x = 0; x < w.Width && laid < cap; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (p == spot) continue;
                        if (build.Designate(sim, p, BuildKind.Wall)) laid++;
                    }
            Assert.AreEqual(cap, laid,
                "the queue could not be filled (" + laid + "/" + cap + "), so the cap arm below is "
                + "not the thing being measured");

            var evs = PlaceAndRead(sim, DeviceKind.Table, spot);
            Assert.AreEqual(1, evs.Length, "a press against a full queue published " + evs.Length + " events");
            Assert.AreEqual((byte)PlaceRefusal.TooManyQueued, evs[0].Reason,
                "a full build queue refused for the wrong reason");
            Assert.AreEqual(cap, build.Pending.Count, "the refused press changed the queue");
        }

        /// <summary>`ClearTile`'s sibling that also avoids tiles already queued — used where the test
        /// itself fills the queue.</summary>
        private static Int3 ClearTileFor(Simulation sim)
        {
            TryFindPlaceableTile(sim, out var p);
            return p;
        }

        private static bool TryFindTile(Simulation sim, Func<Int3, bool> pred, out Int3 found)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (!pred(p)) continue;
                        found = p;
                        return true;
                    }
            found = default;
            return false;
        }

        /// <summary>Take every loose Parts stack off the floor, so <c>TryPay</c> has nothing to
        /// spend. Written as a drain rather than as "boot a ship with none" because the wreck's cabin
        /// stores put seven Parts crates in the cryo bay by design.</summary>
        private static void DrainLooseParts(Simulation sim)
        {
            var doomed = sim.Items.Items
                .Where(s => s.Kind == PlaceDeviceCommand.Currency && s.CarriedBy == 0 && s.ReservedBy == 0)
                .Select(s => s.Id).ToArray();
            foreach (var id in doomed) sim.Items.Remove(id);
            Assert.AreEqual(0, PlaceDeviceCommand.Affordable(sim),
                "the drain left Parts loose aboard, so the CannotPay leg would not be measuring the "
                + "pay arm at all");
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 2. THE CHAIN TO THE SHIPPING GAME — and it is TWO claims, not one.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐⭐ <b>THE SENTENCE REACHES THE SOCKET.</b> A refusal published by the sim leaves the host
        /// as a <c>placerefused</c> message on the broadcast sink — not into a cache, not into a
        /// state channel, not into <c>Snapshot()</c>.
        ///
        /// <para>⛔ <b>AND IT MUST NOT BE IN <c>Snapshot()</c>.</b> A reconnecting tab told, out of
        /// nowhere, why a placement it has forgotten was refused twenty minutes ago is noise; a
        /// refusal is the answer to a gesture and the gesture is gone. Asserted, because "we did not
        /// add it to the list" is not a fact about the shipped tree after a merge.</para>
        ///
        /// <para>MUTATION: delete <c>RelayRefusedPlacements()</c> from <c>AdvanceTicks</c> ⇒ RED here
        /// (nothing on the sink), while every leg in part 1 stays GREEN — which is exactly why the
        /// two claims are separate tests. <c>NoteDroppedOrders</c>' own header records the sibling
        /// scar: <c>Run</c> once advanced the sim with a bare tick loop, leaving <c>AdvanceTicks</c>
        /// intact and UNREACHABLE while the whole suite stayed green.</para>
        /// </summary>
        [Test]
        public void TheRefusalLeavesTheHostAsAOneShotMessage_AndIsNotInTheReconnectSnapshot()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;
            Assert.IsTrue(TryFindPlaceableTile(sim, out var clear));
            DrainLooseParts(sim);

            sink.Clear();
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, clear));
            gs.AdvanceTicks(1);   // ⭐ THROUGH THE RUN LOOP'S OWN METHOD, not through a bare Tick

            var msgs = sink.Where(s => s.Contains("\"type\":\"placerefused\"")).ToArray();
            Assert.AreEqual(1, msgs.Length,
                "the sim refused a placement and the host put " + msgs.Length + " messages on the "
                + "socket. The player hears nothing, which is the defect this package closes.");
            StringAssert.Contains("\"reason\":" + (int)PlaceRefusal.CannotPay, msgs[0]);
            StringAssert.Contains("\"x\":" + clear.X.ToString(System.Globalization.CultureInfo.InvariantCulture), msgs[0]);
            StringAssert.Contains("\"price\":" + sim.Defs.Build.DevicePlaceCost.ToString(System.Globalization.CultureInfo.InvariantCulture), msgs[0]);

            gs.RenderForTest();
            Assert.IsFalse(gs.Snapshot().Any(s => s.Contains("\"placerefused\"")),
                "a refusal is in the reconnect snapshot. It is the answer to ONE gesture and must not "
                + "be replayed to a tab that has forgotten making it.");
        }

        /// <summary>
        /// ⛔ <b>TWO IDENTICAL REFUSALS REACH THE PLAYER TWICE.</b> This is the whole reason the relay
        /// is an <c>Emit</c> and not a <c>Send</c>: <c>GameSession.Send</c> dedupes on the whole
        /// payload per channel, so a player pressing the same unaffordable tile twice would be told
        /// once and then met with the very silence the package removes.
        ///
        /// <para>MUTATION: route the relay through <c>Send("placerefused", …, force: false)</c> ⇒ RED
        /// (the second press is swallowed). This leg is what makes that mutation visible; the leg
        /// above passes either way.</para>
        /// </summary>
        [Test]
        public void TheSameRefusalTwiceIsSaidTwice_TheDedupeTrap()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;
            Assert.IsTrue(TryFindPlaceableTile(sim, out var clear));
            DrainLooseParts(sim);

            sink.Clear();
            for (int i = 0; i < 2; i++)
            {
                sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, clear));
                gs.AdvanceTicks(1);
            }
            Assert.AreEqual(2, sink.Count(s => s.Contains("\"type\":\"placerefused\"")),
                "the second identical refusal was swallowed. `Send` dedupes on the whole payload per "
                + "channel; `Emit` does not, and this message must go through `Emit`.");
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 3. THE COST INVARIANT — a refusal never spends.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// The all-or-nothing rule, re-asserted now that every arm has a publish beside it: a refused
        /// placement leaves the ship's matter EXACTLY where it was. The publish is the only thing the
        /// new code does on those paths, and a publish that had been written after a partial spend
        /// would be a matter leak with a sentence attached.
        /// </summary>
        [Test]
        public void ARefusalNeverSpends()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            Assert.IsTrue(TryFindPlaceableTile(sim, out var clear));
            StockParts(sim, clear, 30);
            sim.Tick();
            int before = PlaceDeviceCommand.Affordable(sim);
            Assert.Greater(before, sim.Defs.Build.DevicePlaceCost,
                "the ship cannot afford a placement at all, so 'a refusal did not spend' is vacuous");

            // A refusal that is NOT the pay arm — the ship is rich, the tile is illegal.
            PlaceAndRead(sim, DeviceKind.Door, clear);
            Assert.AreEqual(before, PlaceDeviceCommand.Affordable(sim),
                "a placement refused for an illegal KIND still spent the ship's Parts");
            PlaceAndRead(sim, DeviceKind.Table, new Int3(-1, -1, 0));
            Assert.AreEqual(before, PlaceDeviceCommand.Affordable(sim),
                "a placement refused for being off the map still spent the ship's Parts");
        }
    }
}
