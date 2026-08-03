using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WireFormat

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>D4 — YOU CAN SEE THE VACUUM.</b>
    ///
    /// <para><b>WHAT WAS WRONG, MEASURED IN THE M3 MILESTONE DEMO (finding D4, 2026-08-02).</b> A
    /// direct prioritise-repair order into a hall that was still depressurising was accepted — by
    /// design, M3-14 rung 2 — the pawn walked in, her task line went on reading <i>"Servicing
    /// fabricator_1 — Repair is priority 1"</i>, and she died. Nothing anywhere said the word AIR.
    /// The order is not the bug and it is NOT changed here (<c>SafetySystem.cs</c>'s rung-4
    /// <i>DO NOT SOFTEN</i> clause is untouched): what was missing was every RENDER of the hazard.
    /// Three holes, all render-side, and this file drives all three.</para>
    ///
    /// <list type="number">
    ///   <item><b>THE ATMOSPHERE WIRE DROPPED LETHAL ROOMS.</b> <c>GameSession.BuildRooms</c> skipped
    ///     <c>room.TotalMoles &lt;= 0</c>, so an airless compartment shipped NO <c>rooms</c> row —
    ///     which the client cannot tell from "the channel has not arrived". Consequence on the
    ///     shipped surface: <c>lensGrade(lens, null)</c> returns null, so the PRESSURE LENS painted
    ///     NOTHING over a vacuum, and the readout's atmosphere box hid itself for a crew member
    ///     standing in one.</item>
    ///   <item><b>THE TASK LABEL LIED.</b> <c>TaskLabel</c>'s only air-aware arm is
    ///     <see cref="JobKind.Flee"/> — <i>"Heading to safe air"</i> — which is exactly the state a
    ///     held pawn CANNOT enter, because rung 4 suppresses her self-rescue.</item>
    ///   <item><b>THE PRIORITISE MENU PROMISED A REPAIR AND SAID NOTHING ABOUT THE VACUUM.</b> Fixed
    ///     client-side off a new <c>devices</c> element, whose host half is driven here.</item>
    /// </list>
    ///
    /// <para><b>THE LEGS ARE BLINDED</b> (TRAPS, fifth shape): <c>Assert</c> throws, so a multi-leg
    /// test reports only its first failure and a dead second leg is indistinguishable from a live
    /// one. Every multi-leg test below collects into a failure list and asserts once at the end, so
    /// each leg reports independently.</para>
    ///
    /// <para><b>MUTATIONS, PHYSICALLY APPLIED, RED FOR THE RIGHT REASON, REVERTED</b> — the table is
    /// in the package report; each test names its own row.</para>
    /// </summary>
    [TestFixture]
    public class VacuumIsVisibleTests
    {
        // ───────────────────────────────────────────────────────────────────────────── fixtures

        private static (GameSession Gs, SimHost Host) Boot(ShipChoice ship)
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
            var gs = new GameSession(host, _ => { });   // NOT started ⇒ no sim thread
            return (gs, host);
        }

        private static void RevealAll(Simulation sim)
        {
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
            }
        }

        /// <summary>One decoded <c>rooms</c> row. The channel's tuple is
        /// <c>[anchorName, deck, o2, co2ppm, pressureKPa, tempK, tileCount]</c>.</summary>
        private readonly struct RoomRow
        {
            public readonly string Anchor;
            public readonly int Deck, TileCount;
            public readonly double O2, Co2Ppm, PressureKPa, TempK;
            public RoomRow(string a, int deck, double o2, double co2, double kPa, double k, int tiles)
            { Anchor = a; Deck = deck; O2 = o2; Co2Ppm = co2; PressureKPa = kPa; TempK = k; TileCount = tiles; }
        }

        /// <summary>The <c>rooms</c> payload the client is actually sent, parsed. Read off
        /// <see cref="GameSession.Snapshot"/> — the bytes on the wire, not a call to the builder.</summary>
        private static List<RoomRow> RoomsOnTheWire(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"rooms\"", StringComparison.Ordinal));
            Assert.That(json, Is.Not.Null, "no rooms payload on the wire at all");
            int open = json.IndexOf("\"rooms\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no rooms array: " + json);
            var rows = new List<RoomRow>();
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(7, f.Length, "a rooms tuple is SEVEN elements, saw: [" + body + "]");
                rows.Add(new RoomRow(
                    f[0].Trim('"'),
                    int.Parse(f[1], CultureInfo.InvariantCulture),
                    double.Parse(f[2], CultureInfo.InvariantCulture),
                    double.Parse(f[3], CultureInfo.InvariantCulture),
                    double.Parse(f[4], CultureInfo.InvariantCulture),
                    double.Parse(f[5], CultureInfo.InvariantCulture),
                    int.Parse(f[6], CultureInfo.InvariantCulture)));
            }
            return rows;
        }

        /// <summary>An anchor whose room holds gas (breathable), and one whose room holds none.</summary>
        private static RoomAnchor AnchorWhere(Simulation sim, bool wantGas)
        {
            foreach (var a in sim.Rooms.Anchors)
            {
                var r = sim.Rooms.RoomAt(sim.World, a.Probe);
                if (r == sim.Rooms.Rooms[0]) continue;
                if ((r.TotalMoles > 0) == wantGas) return a;
            }
            throw new InvalidOperationException("the wreck no longer carries a " + (wantGas ? "live" : "airless")
                + " compartment — this fixture is measuring the wrong ship");
        }

        /// <summary>A tile that resolves to the VACUUM SINK (<c>Rooms[0]</c>) and is not a door
        /// marker — open void outside the pressure hull.</summary>
        private static Int3 OpenVoidTile(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (sim.Rooms.RoomIdAt(w, p) == 0) return p;
                    }
            throw new InvalidOperationException("no void tile on this map — the sink control cannot be built");
        }

        // ═══════════════════════════════════════════════════ HOLE 1 — the wire drops lethal rooms

        /// <summary>
        /// ⭐ <b>THE PACKAGE'S CORE OUTCOME, DRIVEN ON THE SHIPPING SHIP.</b> An airless compartment
        /// is ON the <c>rooms</c> channel, with its true 0 kPa, and the VACUUM SINK still is not.
        ///
        /// <para><b>WHY BOTH HALVES ARE HERE.</b> "Emit more rows" is trivially satisfiable by
        /// deleting the whole skip, which would put <c>Rooms[0]</c>'s numbers — the space OUTSIDE the
        /// hull, one shared node — under every anchor that fell into it. The two legs are the
        /// inclusion and the exclusion of one change.</para>
        ///
        /// <para><b>THE SINK LEG IS DRIVEN, because no shipped ship supplies the case.</b> Measured
        /// on this tree: wreck 18 anchors / 0 sink, grid 72 / 0, slice 20 / 0 — so an assertion that
        /// merely walked the shipped anchors would be VACUOUS and would look identical to a live one
        /// (TRAPS, 4th shape). This test therefore ADDS a synthetic anchor over open void and
        /// requires it not to come back out, beside a second synthetic anchor over a REAL airless
        /// compartment that must. Same mechanism, opposite answers.</para>
        ///
        /// <para>MUTATIONS: (a) restore <c>|| room.TotalMoles &lt;= 0</c> in <c>BuildRooms</c> ⇒ the
        /// airless legs redden; (b) drop <c>room == rs.Rooms[0]</c> ⇒ the sink leg reddens.</para>
        /// </summary>
        [Test]
        public void AnAirlessCompartmentIsOnTheWire_AndTheVacuumSinkIsNot()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;

            // Two synthetic anchors, added by hand because the shipped ship has no sink anchor:
            // one over open void (must NOT emit), one over a real airless compartment (MUST emit).
            var airless = AnchorWhere(sim, wantGas: false);
            sim.Rooms.Anchors.Add(new RoomAnchor("probe_void", OpenVoidTile(sim)));
            sim.Rooms.Anchors.Add(new RoomAnchor("probe_airless", airless.Probe));

            var rows = RoomsOnTheWire(gs);
            var byAnchor = rows.GroupBy(r => r.Anchor).ToDictionary(g => g.Key, g => g.First());
            var fail = new List<string>();

            // ── leg 1: the real airless compartment ships a row, with its true numbers.
            if (!byAnchor.TryGetValue("probe_airless", out var vac))
                fail.Add("leg 1: a SEALED AIRLESS compartment (" + airless.Name + ") ships no `rooms` row at all — "
                    + "the pressure lens paints nothing over it and the readout's atmos box hides itself, "
                    + "which is exactly hole 1 of finding D4");
            else
            {
                if (vac.PressureKPa != 0.0)
                    fail.Add("leg 1b: the airless row reads " + vac.PressureKPa.ToString("R", CultureInfo.InvariantCulture)
                        + " kPa, not 0 — the row is present but is not describing a vacuum");
                if (vac.O2 != 0.0)
                    fail.Add("leg 1c: the airless row reads O₂ " + vac.O2.ToString("R", CultureInfo.InvariantCulture));
                if (vac.TileCount <= 0)
                    fail.Add("leg 1d: the airless row carries no tiles — it is not a real compartment");
            }

            // ── leg 2: the VACUUM SINK is still skipped. Rooms[0] is the space outside the hull.
            if (byAnchor.ContainsKey("probe_void"))
                fail.Add("leg 2: an anchor over OPEN VOID emitted a row. Rooms[0] is the vacuum SINK, not a "
                    + "compartment: every region touching space is merged into it, so its one node's tile "
                    + "count and temperature would be published under every breached anchor on every deck");

            // ── leg 3: the wreck's whole airless interior arrived, not just the one probed anchor.
            int airlessRows = rows.Count(r => r.PressureKPa == 0.0);
            if (airlessRows < 2)
                fail.Add("leg 3: only " + airlessRows + " row(s) on the whole wreck read 0 kPa. The ship boots "
                    + "with 15 airless compartments of 18; a single one is a special case, not the fix");

            // ── leg 4 (NON-VACUITY, an INCLUSION test): the channel still carries the LIVE rooms.
            //    A "fix" that emitted only the airless ones would pass legs 1-3 and blind every lens.
            if (!rows.Any(r => r.PressureKPa > 50.0))
                fail.Add("leg 4: no PRESSURISED room is on the channel any more — the airless rows have "
                    + "replaced the live ones rather than joined them");

            Assert.That(fail, Is.Empty, string.Join("\n", fail));
        }

        /// <summary>
        /// The census, stated as a NUMBER so the change is visible rather than merely asserted: every
        /// anchor that resolves to a real compartment gets exactly one row, and nothing else does.
        ///
        /// <para>Re-derived from the sim on every run rather than pinned to a literal — the wreck's
        /// anchor count is authoring, and a literal here would redden for a re-authored ship instead
        /// of for a broken channel. What IS pinned is the RELATION.</para>
        /// </summary>
        [Test]
        public void EveryRealCompartmentGetsExactlyOneRow_OnBothShippedShips()
        {
            var fail = new List<string>();
            foreach (var ship in new[] { ShipChoice.Wreck, ShipChoice.Grid })
            {
                var (gs, host) = Boot(ship);
                var sim = host.Sim;
                int expected = sim.Rooms.Anchors.Count(a => sim.Rooms.RoomAt(sim.World, a.Probe) != sim.Rooms.Rooms[0]);
                var rows = RoomsOnTheWire(gs);
                if (rows.Count != expected)
                    fail.Add(ship + ": " + rows.Count + " rooms rows for " + expected + " real compartments");
                int airlessAnchors = sim.Rooms.Anchors.Count(a =>
                {
                    var r = sim.Rooms.RoomAt(sim.World, a.Probe);
                    return r != sim.Rooms.Rooms[0] && r.TotalMoles <= 0;
                });
                // NON-VACUITY: the relation above is only interesting on a ship that HAS airless rooms.
                if (airlessAnchors == 0)
                    fail.Add(ship + ": no airless compartment aboard — this leg cannot see the change it pins");
            }
            Assert.That(fail, Is.Empty, string.Join("\n", fail));
        }

        // ═══════════════════════════════════════════════════════════ HOLE 2 — the label stops lying

        /// <summary>Put this crew member on <paramref name="tile"/>, holding a player-ordered service
        /// on <paramref name="held"/>. The <c>HeldByOrder ⇒ JobKind != None</c> invariant is honoured
        /// by setting the kind first (its setter clears the hold on the way past None).</summary>
        private static Citizen Servicing(Citizen c, Int3 tile, bool held)
        {
            c.ClearPath();
            c.Pos = tile;
            c.JobKind = JobKind.Maintain;
            c.HeldByOrder = held;
            return c;
        }

        private static string TaskOnTheWire(GameSession gs, uint cid)
        {
            gs.RenderForTest();
            string roster = gs.Snapshot().First(s => s.Contains("\"type\":\"roster\"", StringComparison.Ordinal));
            string key = "\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) + ",";
            int i = roster.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "the roster carries cid " + cid);
            int t = roster.IndexOf("\"task\":\"", i, StringComparison.Ordinal) + "\"task\":\"".Length;
            int end = roster.IndexOf('"', t);
            return roster.Substring(t, end - t);
        }

        /// <summary>
        /// ⭐ <b>THE HELD PAWN'S LABEL SAYS <c>NO AIR</c>, AND NOBODY ELSE'S DOES.</b> Four cells,
        /// driven on the shipping ship, blinded so each reports alone:
        /// <list type="bullet">
        ///   <item>HELD + airless room ⇒ the words are there. This is the demo's own case.</item>
        ///   <item>HELD + breathable room ⇒ silence. A warning that is always on is not a warning.</item>
        ///   <item>NOT held + airless room ⇒ silence, and the silence is CORRECT: <c>SafetySystem</c>
        ///     pulls her off the job and the existing <i>"Heading to safe air"</i> arm speaks for
        ///     her. Rung 4 suppresses exactly that rescue for the held pawn, which is why she is the
        ///     one worker the vocabulary had no word for.</item>
        ///   <item>The base label is UNTOUCHED — the clause is a suffix, so <c>taskTag</c>'s
        ///     first-word classification and M2-6's <c>" — "</c> split are both unaffected.</item>
        /// </list>
        /// MUTATION: drop the <c>IsBreathable</c> term from <c>AppendAirWarning</c> (warn whenever
        /// held) ⇒ cell 2 reddens. Drop the <c>HeldByOrder</c> gate ⇒ cell 3 reddens.
        /// </summary>
        [Test]
        public void AHeldWorkerInAVacuumIsToldSo_AndNobodyElseIs()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;
            var dead = AnchorWhere(sim, wantGas: false).Probe;
            var live = AnchorWhere(sim, wantGas: true).Probe;
            var c = sim.Citizens.Items.First(x => !x.Dead);
            var fail = new List<string>();

            // PRECONDITIONS, so a green run cannot rest on a fixture that lost its vacuum.
            if (AtmosphereSafety.IsBreathable(sim, dead))
                fail.Add("precondition: the 'airless' tile is breathable — the fixture has no vacuum in it");
            if (!AtmosphereSafety.IsBreathable(sim, live))
                fail.Add("precondition: the 'live' tile is NOT breathable — the fixture has no control cell");

            string heldInVacuum = TaskOnTheWire(gs, Servicing(c, dead, held: true).Id);
            if (!heldInVacuum.Contains("NO AIR", StringComparison.Ordinal))
                fail.Add("cell 1: a crew member the player ORDERED into a vacuum reads \"" + heldInVacuum
                    + "\". This is finding D4 verbatim: she suffocates while the line describes her errand");

            string heldInAir = TaskOnTheWire(gs, Servicing(c, live, held: true).Id);
            if (heldInAir.Contains("NO AIR", StringComparison.Ordinal))
                fail.Add("cell 2: a held worker in BREATHABLE air reads \"" + heldInAir
                    + "\" — the warning is unconditional, so it says nothing about anything");

            string looseInVacuum = TaskOnTheWire(gs, Servicing(c, dead, held: false).Id);
            if (looseInVacuum.Contains("NO AIR", StringComparison.Ordinal))
                fail.Add("cell 3: an UNHELD worker reads \"" + looseInVacuum + "\". SafetySystem rescues her "
                    + "and the Flee arm already says \"Heading to safe air\"; two vocabularies for one state "
                    + "is how a repo acquires two names for one predicate");

            // The clause is a SUFFIX and the base label is intact — M2-6's separator contract.
            if (!heldInVacuum.StartsWith("Servicing", StringComparison.Ordinal)
                && !heldInVacuum.StartsWith("Heading to service", StringComparison.Ordinal))
                fail.Add("cell 4: the base label was rewritten, not suffixed: \"" + heldInVacuum
                    + "\". The client's on-map work marker classifies on the FIRST word");

            Assert.That(fail, Is.Empty, string.Join("\n", fail));
        }

        /// <summary>
        /// ⚠️ <b>A DOORWAY IS NOT A VACUUM.</b> A door tile is a room EDGE, so
        /// <c>RoomState.RoomAt</c> resolves it to <c>Rooms[0]</c> and it reads 0 kPa — but
        /// <c>NeedsSystem</c> skips a crew member standing on a door marker outright, so no
        /// suffocation ever accrues there. Without the marker test the warning would BLINK ON for one
        /// tile every time a held worker walked through any door on the ship, which is the mistake
        /// <c>WorksiteSafety</c>'s own header records costing the slice its entire 48-tile dig field.
        ///
        /// <para>MUTATION: delete the <c>DoorMarker</c> line from <c>AppendAirWarning</c> ⇒ RED.</para>
        /// </summary>
        [Test]
        public void AHeldWorkerStandingInADoorwayIsNotWarned()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;
            Int3? door = null;
            foreach (var d in sim.Devices.Items)
                if (d.Kind == DeviceKind.Door && sim.Rooms.RoomIdAt(sim.World, d.Pos) == RoomState.DoorMarker)
                { door = d.Pos; break; }
            Assert.That(door, Is.Not.Null, "the wreck carries no door tile the room plane marks as an edge — "
                + "this leg cannot see the case it exists for");

            var c = sim.Citizens.Items.First(x => !x.Dead);
            string label = TaskOnTheWire(gs, Servicing(c, door.Value, held: true).Id);
            Assert.That(label.Contains("NO AIR", StringComparison.Ordinal), Is.False,
                "a held worker crossing a DOORWAY is warned she has no air: \"" + label + "\". The room plane "
                + "resolves a door tile to the vacuum sink, but NeedsSystem never accrues suffocation there — "
                + "so this warning fires on every doorway on the ship and the player learns to ignore it");
        }

        // ══════════════════════════════════════════════════════════ HOLE 3 — the offer names the hazard

        /// <summary>Every <c>devices</c> row's <c>air</c> element, keyed by tile.</summary>
        private static Dictionary<string, int> AirBitsOnTheWire(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().First(s => s.Contains("\"type\":\"devices\"", StringComparison.Ordinal));
            var map = new Dictionary<string, int>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.AreEqual(10, f.Length, "a devices tuple is TEN elements since the price landed");
                map[f[0] + "," + f[1] + "," + f[2]] = int.Parse(f[8], CultureInfo.InvariantCulture);
            }
            return map;
        }

        private static string Key(Int3 p) => p.X.ToString(CultureInfo.InvariantCulture) + ","
            + p.Y.ToString(CultureInfo.InvariantCulture) + "," + p.Z.ToString(CultureInfo.InvariantCulture);

        /// <summary>
        /// ⭐ <b>THE NINTH ELEMENT FOLLOWS THE AIR AT THE WORKSITE, AND IT DOES NOT BLAME THE AIR FOR
        /// THE GEOMETRY.</b> Driven on the shipping ship, three cells, blinded:
        /// <list type="number">
        ///   <item>A machine in a PRESSURISED compartment reads <c>air = 1</c>.</item>
        ///   <item>VENT that compartment (moles zeroed by hand — a state injection, so the derivation
        ///     is isolated from everything an in-game vent would also do) and the SAME machine reads
        ///     <c>air = 0</c>. Nothing else about the device moved, which is also why <c>SameAs</c>
        ///     must compare this element (<c>DevicesDeltaTests</c>' own row).</item>
        ///   <item>WALL THE MACHINE IN and it reads <c>1</c> again even in the vacuum: "nowhere to
        ///     stand" is a different refusal with different words, and a bit that folded it in would
        ///     send the player hunting for a leak that is not there. ⭐ This cell is what the SECOND
        ///     <c>TryFindStagingTile</c> call buys — with only the unforced call it would read 0.</item>
        /// </list>
        /// MUTATION: delete the <c>forced: true</c> re-ask in <c>StagingAirBit</c> (return 0 whenever
        /// the unforced search fails) ⇒ cell 3 reddens and cells 1-2 stay green.
        /// </summary>
        [Test]
        public void TheAirBitFollowsTheWorksitesAir_AndNotItsGeometry()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;
            RevealAll(sim);
            var fail = new List<string>();

            // A machine standing in a room that HOLDS GAS and has somewhere survivable to stand.
            Device machine = null;
            Room room = null;
            foreach (var d in sim.Devices.Items)
            {
                if (Simulation.IsUtilityOverlay(d.Kind)) continue;
                var r = sim.Rooms.RoomAt(sim.World, d.Pos);
                if (r == sim.Rooms.Rooms[0] || r.TotalMoles <= 0) continue;
                if (!MaintenanceSystem.TryFindStagingTile(sim, d.Pos, out _)) continue;
                machine = d; room = r; break;
            }
            Assert.That(machine, Is.Not.Null, "no machine on the wreck stands in a pressurised compartment with "
                + "a survivable staging tile — this fixture cannot see the bit it pins");

            string key = Key(machine.Pos);
            if (AirBitsOnTheWire(gs).TryGetValue(key, out int bit0) ? bit0 != 1 : true)
                fail.Add("cell 1: a machine in a PRESSURISED compartment does not read air = 1 at " + key);

            room.O2Moles = 0; room.CO2Moles = 0; room.N2Moles = 0;   // vent it
            if (AirBitsOnTheWire(gs).TryGetValue(key, out int bit1) ? bit1 != 0 : true)
                fail.Add("cell 2: the compartment was vented and the machine still reads air = 1. The menu goes "
                    + "on offering a repair with no death warning — finding D4's third hole, unmoved");

            // Wall it in: clear the Walkable flag on all four neighbours. Now there is nowhere to
            // stand for ANY reason, and the air is no longer the difference.
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(machine.Pos, i);
                if (!sim.World.InBounds(n)) continue;
                var level = sim.World.Levels[n.Z];
                level.Flags[level.Index(n.X, n.Y)] &= unchecked((byte)~(byte)TileFlags.Walkable);
            }
            if (AirBitsOnTheWire(gs).TryGetValue(key, out int bit2) ? bit2 != 1 : true)
                fail.Add("cell 3: a WALLED-IN machine reads air = 0. The bit is blaming the air for the "
                    + "geometry: the menu would tell the player their crew member will suffocate at a "
                    + "worksite nobody can reach at all");

            Assert.That(fail, Is.Empty, string.Join("\n", fail));
        }
    }
}
