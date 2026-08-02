using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>devices</c> CHANNEL'S DIRTY-VERSION GATE (<c>GameSession.SendDevices</c>) — the delta
    /// scheme <c>hosts/web/WireFormat.Devices.cs</c> made a WRITTEN CONDITION of that channel's merge,
    /// landing in the same package as the art that first draws it (W0b).
    ///
    /// ═══ WHY THIS FILE HAS TO USE A COUNTER, WHICH IS THE UNCOMFORTABLE PART ═══
    ///
    /// THE GATE IS INVISIBLE FROM OUTSIDE. <see cref="GameSession"/>'s <c>Send</c> already suppressed
    /// the BROADCAST of an unchanged payload, so skipping the serialization changes nothing a test can
    /// observe through the sink, through <c>Snapshot</c>, or on the socket. MEASURED, not assumed:
    /// deleting the whole gate leaves every behavioural assertion in <c>DevicesChannelTests</c> green.
    /// A performance change nothing can see is a performance change nothing protects — so
    /// <c>GameSession.DevicesSerializedForTest</c> exists, incremented on the line adjacent to the
    /// serialization it counts.
    ///
    /// ⚠️ AND A COUNTER IS NOT A SPEED-UP. This repo has the <c>HasIceChain</c> scar: 91 721 250
    /// device slots per sim-day became 1 250 and the whole thing was worth ~1 %, NOT separated from
    /// noise. The numbers this package measured are in its report, with n and conditions; what is
    /// asserted HERE is only that the gate is CORRECT — that it never skips a render whose payload
    /// would have differed. Correctness is what a test can hold; the saving is what a measurement can.
    ///
    /// ═══ WHAT MAKES THE CACHE KEY SUFFICIENT ═══
    ///
    /// The key is the ENTIRE CELL LIST, compared element-wise over all seven fields, and
    /// <see cref="WireFormat.Devices"/> is a pure function of that list. So "the skip was taken" and
    /// "the payload would have been byte-identical" are the same statement rather than a heuristic
    /// that usually holds. "Sufficient BY INSPECTION and pinned by NOTHING" is the failure mode this
    /// repo named after <c>HasIceChain</c>.
    ///
    /// ⛔ AND THE FIRST VERSION OF THIS FILE PINNED IT AT THE WRONG LEVEL. The struck sentence is kept
    /// because the mistake is the useful part: ~~"both halves are pinned: a per-FIELD inclusion table
    /// over <c>DeviceCell.SameAs</c> (each of the seven fields alone must be enough to deny a skip — the
    /// cheap keys, 'condition only' and 'count only', are among the things it catches), and THE FLIP,
    /// driven on a real ship."~~ **Count-only IS caught. CONDITION-ONLY WAS NOT.** Independent review
    /// replaced the gate's comparison with <c>_devicesSent[i].Cond != cells[i].Cond</c> and the FULL
    /// <c>dotnet test</c> was exit 0 — because the table asserts against
    /// <see cref="WireFormat.DeviceCell.SameAs"/>, <b>a method the mutated gate no longer calls</b>,
    /// and nothing else drove the gate through a change that moved a field OTHER than <c>Cond</c>
    /// without also moving the count. That is <c>CLAUDE.md</c> trap 4 exactly — a guard whose scope
    /// excludes the violation — sitting under a header that names the very lesson.
    ///
    /// ⚠️ IT IS REACHABLE, NOT THEORETICAL. On <c>--ship grid</c> every device boots at
    /// <c>Condition == 1f</c>, so every row reads <c>Cond 255</c>; a strip-plus-place landing between
    /// two 10 Hz renders reshuffles kinds and positions at equal count while a <c>Cond</c>-only key
    /// sees nothing, and the client then draws the old machine's picture on the new machine's tile
    /// until something else moves — because nothing re-broadcasts a state channel that never changes.
    ///
    /// ⇒ SO THE PIN IS NOW IN TWO LAYERS, and the second one is the load-bearing one:
    /// <see cref="The_Cache_Key_Reads_All_SEVEN_Fields"/> is a UNIT table over <c>SameAs</c> (useful,
    /// but only binding while the gate calls it), and
    /// <see cref="A_Swap_At_Equal_Count_And_Equal_Condition_Is_Not_A_Skip"/> drives
    /// <c>SendDevices</c> ITSELF through a change whose only moving fields are <c>Kind</c>/<c>X</c>/
    /// <c>Y</c>. Plus THE FLIP, driven on a real ship.
    ///
    /// GATES N/A: no def scalar, no hashed field, no save chapter, no <c>GlyphColor</c> id, and the
    /// wire FORMAT is untouched (this is the dirty-version half of the sketch, not the partial-row
    /// half — no client merge state, no new resync contract). All five determinism pins must be
    /// byte-identical; <see cref="The_Gate_Never_Touches_The_Sim"/> is the in-suite half of that claim.
    /// </summary>
    public class DevicesDeltaTests
    {
        private static (GameSession gs, SimHost host, List<string> sink) Boot(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = SimHost.Build(ship == ShipChoice.Slice ? SimHost.SliceSeed : SimHost.DefaultSeed, ship: ship);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            RevealAll(host.Sim);
            return (gs, host, sink);
        }

        private static void RevealAll(Simulation sim)
        {
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
            }
        }

        /// <summary>The cached payload a reconnecting client would be caught up from.</summary>
        private static string CachedDevices(GameSession gs) =>
            gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"devices\""));

        /// <summary>How many tuples the payload carries — the census the `Count` guard alone sees.</summary>
        private static int RowCount(string json)
        {
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            return json.Substring(open).Split('[').Length - 2;
        }

        /// <summary>Every row's <c>Cond</c> byte, SORTED — the projection a condition-only key would
        /// see. Sorted rather than positional on purpose: a swap reorders the store, and this control
        /// has to say "no condition CHANGED", not "no row moved".</summary>
        private static List<int> SortedConds(string json)
        {
            var conds = new List<int>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.AreEqual(9, f.Length, TupleWidth);
                conds.Add(int.Parse(f[4], CultureInfo.InvariantCulture));
            }
            conds.Sort();
            return conds;
        }

        /// <summary>An in-bounds, explored tile with NO tile-resident device on it — somewhere the
        /// swap's replacement can legally stand. Deliberately not <paramref name="avoid"/>, so the
        /// replacement cannot land back on the tile that was just vacated and leave `X`/`Y` still.</summary>
        private static Int3 FirstFreeExploredTile(Simulation sim, Int3 avoid)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (p.X == avoid.X && p.Y == avoid.Y && p.Z == avoid.Z) continue;
                        if ((w.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        return p;
                    }
            Assert.Fail("no free explored tile on this ship — the swap fixture cannot be built");
            return default;
        }

        /// <summary>A tile-resident device on a shipped ship, so the tests move something real.</summary>
        private static Device FirstTileResidentDevice(Simulation sim)
        {
            foreach (var d in sim.Devices.Items)
                if (!Simulation.IsUtilityOverlay(d.Kind)) return d;
            Assert.Fail("no tile-resident device on this ship — every test below would be vacuous");
            return null;
        }

        /// <summary>
        /// THE LAST device <c>BuildDevices</c> will emit — scanned BACKWARDS through store order for
        /// the last non-overlay, because every entry after it is skipped by the overlay filter and so
        /// contributes no row. On <c>--ship grid</c> that filter drops 1 104 of 1 250 devices, so
        /// "the last item in the store" and "the last row on the wire" are very different things and
        /// taking the first would silently probe the middle of the list.
        ///
        /// ⚠️ IT IS ALSO THE MOST RECENTLY PLACED MACHINE, which is what makes the bound this helper
        /// exists to close matter in play rather than in principle: <c>Simulation.AddDevice</c>
        /// APPENDS, so the last row is whatever the player just built — the one machine they are
        /// actually watching.
        /// </summary>
        private static Device LastTileResidentDevice(Simulation sim)
        {
            var items = sim.Devices.Items;
            for (int i = items.Count - 1; i >= 0; i--)
                if (!Simulation.IsUtilityOverlay(items[i].Kind)) return items[i];
            Assert.Fail("no tile-resident device on this ship — this test would be vacuous");
            return null;
        }

        /// <summary>The FINAL tuple of a payload, positionally. Used only as a non-vacuity control:
        /// a test that means to move "the last row" has to prove it moved the last row.</summary>
        /// <summary>The message both tuple-width guards share. ⚠️ THIS GUARD FIRED AT THE MERGE OF THE
        /// OPERATE VERB AND THE DELTA GATE, AND THAT IS WHY IT IS KEPT. Both parsers read fields
        /// POSITIONALLY, so a tuple that silently grows or shrinks turns them into confident readers of
        /// the wrong column — <c>SortedConds</c> would have gone on reporting field 4 as a condition
        /// whatever it had become. Two lanes merged with no conflict on the field list itself and this
        /// assertion is what refused the tree. Update the width and the parser TOGETHER, never the
        /// width alone.</summary>
        private const string TupleWidth = "a devices tuple is NINE elements (x,y,deck,kind,cond,oper,open,serv,air)";

        private static (int X, int Y, int Deck, int Kind, int Cond, int Oper, int Open, int Serv) LastTuple(string json)
        {
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            var parts = json.Substring(open).Split('[').Skip(2).ToList();
            Assert.That(parts.Count, Is.GreaterThan(0), "the payload carries no tuples at all");
            var f = parts[parts.Count - 1].Split(']')[0].Split(',');
            Assert.AreEqual(9, f.Length, TupleWidth);
            return (int.Parse(f[0], CultureInfo.InvariantCulture), int.Parse(f[1], CultureInfo.InvariantCulture),
                    int.Parse(f[2], CultureInfo.InvariantCulture), int.Parse(f[3], CultureInfo.InvariantCulture),
                    int.Parse(f[4], CultureInfo.InvariantCulture), int.Parse(f[5], CultureInfo.InvariantCulture),
                    int.Parse(f[6], CultureInfo.InvariantCulture), int.Parse(f[7], CultureInfo.InvariantCulture));
        }

        // ═══════════════════════════════════════════ 1. THE KEY, FIELD BY FIELD (inclusion, not count)

        /// <summary>
        /// EVERY ONE OF THE NINE FIELDS ALONE MUST DENY A SKIP. This is an INCLUSION TABLE and not a
        /// population count: CLAUDE.md's fourth trap is a guard whose scope filter excludes the
        /// violation, and "the comparison returned false for something" never proves it would return
        /// false for the thing.
        ///
        /// The two rows that matter most are the CHEAP KEYS somebody will eventually propose:
        /// comparing only <c>Cond</c> misses a device that was stripped and replaced at equal wear;
        /// comparing only the COUNT misses every in-place change there is. Both are listed by name.
        ///
        /// ⚠️ AND THIS TEST CANNOT ACTUALLY CATCH EITHER OF THEM IN THE GATE — said here rather than
        /// left for the next reader to discover, because the first version of this file claimed it
        /// could. It asserts against <see cref="WireFormat.DeviceCell.SameAs"/>, so it is binding only
        /// while <c>GameSession.SameAsLastDevices</c> CALLS that method; a gate rewritten to compare
        /// <c>Cond</c> inline leaves every row here green. What catches that is
        /// <see cref="A_Swap_At_Equal_Count_And_Equal_Condition_Is_Not_A_Skip"/>, which drives the
        /// gate. This test's remaining job is real but narrower: it is the per-field statement of
        /// WHICH fields a key must read, and it fails loudly if a field is dropped from the comparison
        /// the gate does use.
        ///
        /// MUTATION: drop any field from <see cref="WireFormat.DeviceCell.SameAs"/> ⇒ its row fails.
        /// </summary>
        [Test]
        public void The_Cache_Key_Reads_All_NINE_Fields()
        {
            var baseline = new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 1);
            Assert.IsTrue(baseline.SameAs(baseline), "a cell must equal itself, or every skip is denied");
            Assert.IsTrue(baseline.SameAs(new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 1)),
                "two identical cells compared unequal — the gate would never skip anything and the " +
                "scheme is inert rather than wrong, which is the harder failure to notice");

            foreach (var (field, other) in new (string, WireFormat.DeviceCell)[]
            {
                ("X — a device MOVED (or two devices swapped tiles at equal wear)",
                    new WireFormat.DeviceCell(5, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 1)),
                ("Y", new WireFormat.DeviceCell(4, 8, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 1)),
                ("Deck — the same tile on another deck",
                    new WireFormat.DeviceCell(4, 7, 2, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 1)),
                ("Kind — a device was STRIPPED and another placed on its tile at equal wear. This is " +
                 "the row the cheap key 'compare Cond only' fails, and the art would keep drawing the " +
                 "old machine's picture on the new machine's tile",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Fabricator, 200, 1, 0, 1, 1)),
                ("Cond — the wear byte itself, i.e. the whole point of the channel",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 199, 1, 0, 1, 1)),
                ("Oper — the sim's own IsOperational, which the client cannot derive",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 0, 0, 1, 1)),
                // ⭐ ADDED AT THE MERGE with the OPERATE verb, which appended this seventh element.
                // `SameAs`'s own doc mandates that a field added to the tuple is added here IN THE
                // SAME COMMIT — and the two lanes touched this struct from opposite sides, so the
                // field line auto-merged with NO conflict while this table kept six rows. That is
                // precisely "a clean auto-merge is not a clean merge". Without this row AND the
                // clause in SameAs, a door/vent toggle moves ONLY `Open`, the gate skips, and the
                // OPEN⇄SHUT chip stops updating with every suite green.
                ("Open — the door/vent OPEN⇄SHUT byte. THE MOST REACHABLE ROW IN THIS TABLE: a toggle " +
                 "is player-driven (unlike wear, which creeps), and AddDevice APPENDS, so a door the " +
                 "player just built is the LAST row — the one index the bound tests reach",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 1, 1, 1)),
                // ⭐ ADDED BY M3-13, WHICH APPENDED THIS EIGHTH ELEMENT — under the same rule the
                // row above records, and this time on purpose rather than at a merge. ⚠️ IT IS THE
                // LEAST REACHABLE ROW IN THIS TABLE AND THAT IS WHY IT IS THE MOST DANGEROUS ONE TO
                // OMIT: `Serv` is a per-KIND fact read out of the defs, so within one session it
                // never moves, and dropping it from `SameAs` could not be caught by ANY live
                // behaviour — the gate's sufficiency argument ("the compared value IS the
                // serializer's whole input") would be true only by accident, and it stops being
                // true the day a def is reloaded or a kind's `maint` is edited.
                ("Serv — CAN THIS KIND EVER BE SERVICED (M3-13). Read by the Room Zoom's right-click " +
                 "menu; a stale value either offers a repair the sim will never take or withdraws " +
                 "the verb from a machine that can be repaired",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 0, 1)),
                // ⭐⭐ ADDED BY D4, WHICH APPENDED THIS NINTH ELEMENT — same rule, same commit. ⚠️ AND
                // IT IS THE MOST REACHABLE ROW IN THIS TABLE, which is the OPPOSITE of `Serv` above:
                // `Air` is the ONLY element here that can move while every other element on the row
                // holds still. Vent the compartment a pristine, closed, serviceable scrubber stands in
                // — X, Y, Deck, Kind, Cond, Oper, Open and Serv are byte-identical, and this row is
                // the entire difference. Without it the gate skips the render and the PRIORITISE
                // menu keeps promising a repair with no death warning for as long as nothing else
                // aboard happens to wear out, which on a quiet ship is indefinitely.
                ("Air — CAN A WORKER STAND HERE WITHOUT THE PLAYER'S ORDER WAIVING THE AIR RULE (D4). " +
                 "Read by the Room Zoom's right-click menu for its hazard clause; a stale value " +
                 "either hides a lethal worksite or cries wolf over a repressurised one",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1, 0, 1, 0)),
            })
            {
                Assert.IsFalse(baseline.SameAs(other),
                    "THE CACHE KEY IGNORES " + field + ". A field the key does not read is a field " +
                    "whose change is silently never re-serialized: the client keeps the previous " +
                    "value forever, and the only symptom is wrong art on a tile.");
                Assert.AreNotEqual(WireFormat.Devices(new[] { baseline }), WireFormat.Devices(new[] { other }),
                    "NON-VACUITY for the row above: the serializer really does distinguish these two " +
                    "cells, so denying the skip is necessary rather than merely cautious.");
            }
        }

        /// <summary>
        /// THE LIST LENGTH IS PART OF THE KEY — a device placed or stripped changes the payload even
        /// when every surviving row is untouched. Separate from the per-field table because a
        /// field-wise comparison over a shared prefix is exactly what a `for (i &lt; min)` loop would
        /// give, and that loop passes the table above.
        /// </summary>
        [Test]
        public void A_Device_Added_Or_Removed_Is_Not_A_Skip()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            gs.RenderForTest();
            int before = gs.DevicesSerializedForTest;
            string cached = CachedDevices(gs);

            var doomed = FirstTileResidentDevice(host.Sim);
            var free = FirstFreeExploredTile(host.Sim, doomed.Pos);
            host.Sim.RemoveDevice(doomed.Id);

            gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 1),
                "a device was REMOVED and the gate skipped the render. A shorter list is a different " +
                "payload; a comparison that only walks the shared prefix would pass every other test " +
                "in this file.");
            string afterRemove = CachedDevices(gs);
            Assert.AreNotEqual(cached, afterRemove, "…and the cached payload really did change");

            // ⚠️ THE ADDITION HALF, ADDED ON A SEND-BACK. The test's NAME claimed both directions and
            // its body drove only the removal. That is a coverage-naming defect rather than a hole —
            // addition is symmetric through the same `Count` guard — but a name that promises more
            // than the body delivers is how the next reader stops checking.
            host.Sim.AddDevice(DeviceKind.Fabricator, free, "delta-add-probe");
            gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 2),
                "a device was ADDED and the gate skipped the render. A longer list is a different " +
                "payload, and a loop bounded by the PREVIOUS count would never look at the new row.");
            Assert.AreNotEqual(afterRemove, CachedDevices(gs), "…and the payload really did change again");
        }

        /// <summary>
        /// ⭐ THE SEND-BACK'S TEST, AND THE ONE THAT ACTUALLY BINDS THE GATE. It drives
        /// <c>SendDevices</c> — not <see cref="WireFormat.DeviceCell.SameAs"/> — through a change
        /// whose ONLY moving fields are <c>Kind</c>, <c>X</c> and <c>Y</c>: a device is REMOVED and a
        /// device OF A DIFFERENT KIND is added on a different tile, so the row COUNT is unchanged and
        /// every row's <c>Cond</c> byte is unchanged too. Both of those are ASSERTED here rather than
        /// assumed, because if either moved the test would pass for the wrong reason and would be one
        /// more guard that cannot see its own subject.
        ///
        /// MUTATION THAT MOTIVATED IT (independent review, C6): replace the gate's body with
        /// <c>if (_devicesSent[i].Cond != cells[i].Cond) return false;</c>. Before this test the FULL
        /// <c>dotnet test</c> was exit 0. It is now a semantic RED here.
        ///
        /// ⚠️ THE SCENARIO IS THE ONE THE PER-FIELD TABLE ALREADY DESCRIBES IN PROSE — "a device was
        /// STRIPPED and another placed on its tile at equal wear" — which is exactly the shape of
        /// defect this repo keeps finding: the right sentence written down, and nothing driving it.
        /// On <c>--ship grid</c> every device boots at <c>Condition == 1f</c>, so equal-condition is
        /// not a contrived fixture; it is the whole ship.
        /// </summary>
        [Test]
        public void A_Swap_At_Equal_Count_And_Equal_Condition_Is_Not_A_Skip()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            gs.RenderForTest();
            int before = gs.DevicesSerializedForTest;
            string cachedBefore = CachedDevices(gs);
            var condsBefore = SortedConds(cachedBefore);
            int rowsBefore = RowCount(cachedBefore);
            Assert.That(rowsBefore, Is.GreaterThan(1), "the ship emitted no devices — this is vacuous");

            var doomed = FirstTileResidentDevice(sim);
            var free = FirstFreeExploredTile(sim, doomed.Pos);
            // A DIFFERENT KIND, chosen against the doomed one so the swap really moves `Kind`.
            var newKind = doomed.Kind == DeviceKind.Fabricator ? DeviceKind.MachineShop : DeviceKind.Fabricator;
            sim.RemoveDevice(doomed.Id);
            var placed = sim.AddDevice(newKind, free, "delta-swap-probe");
            Assert.AreNotEqual(doomed.Kind, placed.Kind, "the swap did not change the kind");
            Assert.AreNotEqual(doomed.Pos, placed.Pos, "the swap did not change the position");

            gs.RenderUnforcedForTest();
            string cachedAfter = CachedDevices(gs);

            // THE TWO CONTROLS FIRST. Without them a `Cond`-only key could be "caught" by a count
            // change or by a condition change, and this test would prove nothing about Kind/X/Y.
            Assert.AreEqual(rowsBefore, RowCount(cachedAfter),
                "the row COUNT moved, so the `Count` guard alone would have denied this skip and this " +
                "test says nothing about the fields it exists to pin. Pick a replacement that keeps " +
                "the census identical.");
            CollectionAssert.AreEqual(condsBefore, SortedConds(cachedAfter),
                "some row's `Cond` byte moved, so a CONDITION-ONLY key would also have caught this. " +
                "The whole point of this fixture is that condition is constant across the swap.");

            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 1),
                "A DEVICE WAS REPLACED BY ONE OF ANOTHER KIND, ON ANOTHER TILE, AT EQUAL COUNT AND " +
                "EQUAL CONDITION — AND THE GATE SKIPPED THE RENDER. The client keeps the old machine's " +
                "row forever, so it draws the old machine's picture on the new machine's tile, and " +
                "nothing re-broadcasts a state channel that never changes. The cache key is reading " +
                "less than the serializer does.");
            Assert.AreNotEqual(cachedBefore, cachedAfter,
                "…and the payload really did differ, so the assertion above is about a real change");
        }

        // ═══════════════════════════════════════════ 2. THE FLIP, DRIVEN ON A REAL SHIP

        /// <summary>
        /// THE FLIP, which is what a cache test is for: unchanged ⇒ skipped, changed ⇒ re-serialized,
        /// and unchanged again ⇒ skipped again (so the gate is not a one-shot that arms and never
        /// re-arms). Driven on <c>--ship grid</c> through the real render path.
        ///
        /// MUTATION: delete the <c>SameAsLastDevices</c> guard ⇒ leg 1 fails; make it return <c>true</c>
        /// unconditionally ⇒ leg 2 fails and the channel is frozen at boot for the rest of the session.
        /// </summary>
        [Test]
        public void Unchanged_Skips_Changed_Re_Serializes_And_It_Re_Arms()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            gs.RenderForTest();                       // prime (forced ⇒ always serializes)
            int primed = gs.DevicesSerializedForTest;
            Assert.That(primed, Is.GreaterThanOrEqualTo(1), "the prime did not serialize at all");

            // LEG 1 — nothing moved. Several renders, so a gate that skips exactly one is caught.
            for (int i = 0; i < 5; i++) gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(primed),
                "the devices payload was re-serialized on a sim where NOTHING about any device moved. " +
                "That is the ~2/3-of-the-channel serialization cost this gate exists to remove, being " +
                "paid ten times a second for a byte-identical string.");

            // LEG 2 — one machine wears. One device, one byte: the smallest change there is.
            var d = FirstTileResidentDevice(host.Sim);
            d.Condition = 0.10f;
            gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(primed + 1),
                "ONE device's condition moved and the gate skipped it. The client would keep drawing " +
                "the machine intact — silently, forever, since nothing re-broadcasts a state channel " +
                "that never changes.");

            // LEG 3 — it re-arms on the NEW state rather than latching.
            for (int i = 0; i < 3; i++) gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(primed + 1),
                "the gate did not re-arm after a change: it is now serializing every render forever, " +
                "which is the un-optimised behaviour wearing a passing test");
        }

        /// <summary>
        /// A FORCED RENDER ALWAYS RE-EMITS — the prime for a newly-connected client, and the resync
        /// path any delta scheme needs. It existed already (<c>Send</c>'s <c>force</c>), and the gate
        /// must not shadow it: a reconnecting tab caught out by a cache that agrees with itself would
        /// see no devices at all until the next machine happened to wear.
        ///
        /// MUTATION: consult the gate before checking <c>force</c> ⇒ this fails.
        /// </summary>
        [Test]
        public void A_Forced_Render_Bypasses_The_Gate_Entirely()
        {
            var (gs, host, sink) = Boot(ShipChoice.Grid);
            gs.RenderForTest();
            int after1 = gs.DevicesSerializedForTest;
            sink.Clear();

            gs.RenderForTest();   // forced again, nothing changed
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(after1 + 1),
                "a FORCED render was swallowed by the dirty-version gate. Force is the reconnect " +
                "path: a tab that reconnects while every machine is steady would never be told the " +
                "wear state of anything.");
            Assert.That(sink.Count(p => p.Contains("\"type\":\"devices\"")), Is.EqualTo(1),
                "…and it must actually reach the socket, not merely be rebuilt");
        }

        /// <summary>
        /// ⭐ THE SECOND SEND-BACK'S TEST — R1 ON THE OTHER AXIS. R1 closed WHICH FIELDS the cache key
        /// reads; this closes WHICH ROWS it reads them from. The two are independent, and fixing the
        /// first left the second wide open:
        ///
        /// <code>for (int i = 0; i &lt; cells.Count - 1; i++)</code>
        ///
        /// — the gate never inspects the LAST row. Filtered <c>~Devices</c> green, full
        /// <c>dotnet test</c> exit 0, verified on this tree before this test existed.
        ///
        /// ⚠️ IT IS REACHABLE ON A WORSE TARGET THAN THE CASE R1 FIXED. <c>BuildDevices</c> walks
        /// <c>sim.Devices.Items</c> in store order and <see cref="Simulation.AddDevice"/> APPENDS, so
        /// the last emitted row is always the MOST RECENTLY PLACED machine. Build a Fabricator: the
        /// count moves, the payload is re-serialized, the cache is updated. It then wears: the count
        /// is unchanged and only the last row's <c>Cond</c> moves, so a <c>Count - 1</c> bound skips —
        /// and that machine's wear NEVER reaches the client again, because nothing re-broadcasts a
        /// state channel that never changes. The newest machine is the one the player is watching.
        ///
        /// ⚠️ WHY NOTHING SAW IT, which is the part worth keeping: every driven leg in this file moved
        /// <see cref="FirstTileResidentDevice"/> — the flip test's legs 2 and 3, the equivalence
        /// test's four wear steps and its fog step, and the swap test's <c>doomed</c>. The swap
        /// removes at the FRONT and appends, so rows before the last shift and a <c>Count - 1</c> walk
        /// still catches it; <see cref="A_Device_Added_Or_Removed_Is_Not_A_Skip"/> moves the count and
        /// is caught by the <c>Count</c> guard. That guard is precisely what makes a <c>min(count)</c>
        /// PREFIX walk visible and a <c>Count - 1</c> walk AT EQUAL LENGTH invisible — and
        /// <c>A_Device_Added_Or_Removed</c>'s own failure message already reasons about "a comparison
        /// that only walks the shared prefix", which is the near-miss.
        ///
        /// ⇒ With the first row covered by the flip test and the last row covered here, the bound is
        /// closed at BOTH ends.
        /// </summary>
        [Test]
        public void The_LAST_Row_Is_Inspected_Too_So_The_Index_Bound_Is_Closed_At_Both_Ends()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            gs.RenderForTest();
            int before = gs.DevicesSerializedForTest;
            string cached = CachedDevices(gs);
            int rows = RowCount(cached);
            Assert.That(rows, Is.GreaterThan(1), "a one-row payload cannot distinguish first from last");

            var last = LastTileResidentDevice(sim);

            // NON-VACUITY, AND IT IS THE WHOLE POINT OF THE TEST. "The last device in the store" is
            // not "the last row on the wire" — the overlay filter drops 1 104 of grid's 1 250 — so if
            // this assertion is ever removed the test silently degrades into another first/middle-row
            // probe, which is the exact thing that let the bound survive.
            var tail = LastTuple(cached);
            Assert.AreEqual((last.Pos.X, last.Pos.Y, last.Pos.Z), (tail.X, tail.Y, tail.Deck),
                "the device this test is about is not the FINAL tuple of the payload, so moving it " +
                "would not exercise the index bound at all. Re-derive `LastTileResidentDevice` " +
                "against whatever `BuildDevices` now skips.");

            last.Condition = 0.10f;
            gs.RenderUnforcedForTest();

            // CONTROL FIRST: the census must not move, or the `Count` guard alone denies the skip and
            // this test says nothing about the loop's upper bound.
            Assert.AreEqual(rows, RowCount(CachedDevices(gs)),
                "the row count moved, so the Count guard would have caught this regardless — the " +
                "fixture is not exercising the bound");

            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 1),
                "THE LAST ROW'S CONDITION MOVED AND THE GATE SKIPPED THE RENDER. The comparison loop " +
                "is not walking the whole list. `AddDevice` appends, so the last row is the machine " +
                "the player just built — its wear would never reach the client again, and nothing " +
                "re-broadcasts a state channel that never changes.");
            Assert.AreNotEqual(cached, CachedDevices(gs), "…and the payload really did differ");
        }

        /// <summary>
        /// ⭐ THE SAME BOUND, MOVING <c>Open</c> INSTEAD OF <c>Cond</c> — ADDED AT THE MERGE with the
        /// OPERATE verb, and it closes the one cell of the matrix neither lane covered.
        ///
        /// <para>The gate is pinned on two axes: WHICH FIELDS the key reads
        /// (<see cref="The_Cache_Key_Reads_All_SEVEN_Fields"/> plus
        /// <see cref="A_Swap_At_Equal_Count_And_Equal_Condition_Is_Not_A_Skip"/>) and WHICH ROWS it
        /// reads them from (this test and the flip). For the gate as written — one <c>SameAs</c> call
        /// per row over the full range — those two axes COMPOSE, because visiting a row compares every
        /// field of it. What escapes both is narrower: a gate that stops calling <c>SameAs</c> once per
        /// row, comparing most fields over the full range and <c>Open</c> in a separate, wrongly
        /// bounded loop. The unit table still passes (it tests <c>SameAs</c> in isolation, by then dead
        /// code for the gate); the <c>Cond</c> bound tests still pass; and the OPERATE verb's own
        /// tripwire still passes, because it toggles ONE authored device and never asserts which row
        /// that device is — so even if it were the final tuple today it would stop being one the moment
        /// any device is added, silently.</para>
        ///
        /// <para>⚠️ THAT IS THIS PACKAGE'S ORIGINAL SEND-BACK RECURRING BY ITS EXACT MECHANISM — the
        /// gate not calling the method the table tests — which already happened once here. And the play
        /// weight is on its side: <c>Open</c> is a TOGGLE, driven by the player and changing far more
        /// often than wear, while <c>AddDevice</c> APPENDS — so a door the player just built IS the
        /// last row, and toggling it is a first-minute action on the wreck.</para>
        ///
        /// MUTATION: any bound that misses the last row, OR an <c>Open</c> comparison hoisted out of
        /// the per-row <c>SameAs</c> call into a shorter loop ⇒ this test fails and the others do not.
        /// </summary>
        [Test]
        public void The_LAST_Rows_OPEN_BYTE_Is_Inspected_Too_The_Most_Reachable_Cell_Of_The_Matrix()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            gs.RenderForTest();
            int before = gs.DevicesSerializedForTest;
            string cached = CachedDevices(gs);
            int rows = RowCount(cached);
            Assert.That(rows, Is.GreaterThan(1), "a one-row payload cannot distinguish first from last");

            var last = LastTileResidentDevice(sim);

            // Same non-vacuity leg as the Cond version, and for the same reason: without it this
            // degrades into another interior-row probe and stops testing the bound at all.
            var tail = LastTuple(cached);
            Assert.AreEqual((last.Pos.X, last.Pos.Y, last.Pos.Z), (tail.X, tail.Y, tail.Deck),
                "the device this test is about is not the FINAL tuple of the payload, so toggling it " +
                "would not exercise the index bound at all.");

            bool openBefore = last.IsOpen;
            last.IsOpen = !openBefore;
            gs.RenderUnforcedForTest();

            // CONTROL: neither the count nor any CONDITION moved, so a Count guard and a Cond-only
            // key are both denied — the ONLY thing that changed on the wire is the seventh element.
            Assert.AreEqual(rows, RowCount(CachedDevices(gs)),
                "the row count moved, so the Count guard would have caught this regardless");
            Assert.AreEqual(SortedConds(cached), SortedConds(CachedDevices(gs)),
                "a condition byte moved, so a Cond-only key would have caught this — the fixture is " +
                "not isolating `Open`");

            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 1),
                "THE LAST ROW'S OPEN BYTE MOVED AND THE GATE SKIPPED THE RENDER. A door or vent the " +
                "player just built and then toggled would never update on either surface again — the " +
                "OPEN⇄SHUT chip would freeze, silently, and nothing re-broadcasts a state channel " +
                "that never changes. Add `Open` to DeviceCell.SameAs, and compare it in the SAME " +
                "per-row call as every other field.");
            Assert.AreNotEqual(cached, CachedDevices(gs), "…and the payload really did differ");
        }

        // ═══════════════════════════════ 2b. THE CROSS-LANGUAGE SEAM (the `cond` ENCODING)

        /// <summary>
        /// ⭐ THE ONLY TEST IN THE REPO THAT SPANS BOTH LANGUAGES ON THE <c>cond</c> ENCODING, and it
        /// exists because the client's mirror of it was JS-against-JS. <c>client/src/items/wear.js</c>
        /// compares a wire byte to <c>WRECK_COND_BYTE</c>; that constant is derived in JS from
        /// <c>WRECK_THRESHOLD * 255</c>, and <c>wear-join.test.js</c> used to "check" it with a local
        /// JS restatement of the same arithmetic — <see cref="WireFormat.ConditionByte"/> was nowhere
        /// in the loop. That is the SEVENTH trap's self-derivation shape
        /// (<c>swarf_service_condition</c>: "its only assertion was <c>Is.EqualTo(the field under
        /// test)</c>"), and it is the more pointed for sitting next to a threshold check that goes to
        /// real trouble to read <c>wear.def</c> off disk.
        ///
        /// ⚠️ THE EXISTING <c>ConditionByte</c> TESTS DO NOT CLOSE THIS. <c>DevicesChannelTests</c>
        /// pins that method at 0 / 26 / 128 / 153 / 255 and <b>nothing at the wreck floor</b>. A change
        /// to the encoding that also updated those pins — a different scale, a reserved 0, banker's
        /// rounding — would move the REAL cliff while the client's 64 sat still, both suites green and
        /// the art silently detached from the def.
        ///
        /// ⇒ SO NOTHING HERE IS TRANSCRIBED. The threshold comes from <see cref="SimDefs"/>, the
        /// encoder is the host's own, and BOTH the client's threshold and its derivation are PARSED
        /// OUT OF <c>client/src/items/wear.js</c>. The literal <c>64</c> appears nowhere in this test.
        ///
        /// ⚠️ THE MUTATION THAT PROVES THIS TEST EARNS ITS PLACE IS **NOT** THE OBVIOUS ONE, and the
        /// first write-up of this test claimed the wrong evidence for it. Rescaling
        /// <c>ConditionByte</c> to 0..100, or rounding down instead of half-up, DOES redden here —
        /// but it also reddens <c>DevicesChannelTests</c>'s shadow-equivalence loop, which is a
        /// verbatim copy of the shipped method and therefore fires on ANY arithmetic change. On that
        /// evidence alone a future reader could delete this test as redundant, and they would be
        /// deleting the only thing standing between the client and a silent detachment.
        ///
        /// ⇒ THE DECISIVE CASE, built by independent review and recorded here so it is not lost —
        /// <b>C13, a PIECEWISE encoder</b>:
        /// <code>if (condition &gt; 0.24f &amp;&amp; condition &lt; 0.26f) return 63;</code>
        /// It preserves EVERY pre-existing pin — the five explicit values, all fifteen
        /// shadow-equivalence probes, the 0..100 monotonicity sweep — while moving the byte at
        /// exactly the wreck floor. <b>Measured: RED on this test and on nothing else in the suite.</b>
        /// A general-purpose encoder test cannot see a hole cut at one specific value; only a test
        /// that asks about THAT value can.
        ///
        /// OTHER MUTATIONS, all RED here: rescale <c>ConditionByte</c> to 0..100 · round down instead
        /// of half-up · change <c>wear.js</c>'s <c>* 255</c> to <c>* 100</c> (that last one is RED on
        /// this test alone <i>within the C# suite</i> — it also reddens node's own derivation scan in
        /// <c>wear-join.test.js</c>, which is the other side of the same seam, not a second copy).
        /// </summary>
        [Test]
        public void The_Wreck_Floor_Quantises_To_The_Byte_The_Client_Compares()
        {
            string wearJs = ReadClientFile("src/items/wear.js");
            // The client's own two statements, read rather than remembered.
            var mThr = Regex.Match(wearJs, @"export const WRECK_THRESHOLD\s*=\s*([0-9.]+)\s*;");
            Assert.IsTrue(mThr.Success, "WRECK_THRESHOLD is gone from client/src/items/wear.js — this " +
                                        "reader is broken, or the client stopped naming its threshold");
            var mByte = Regex.Match(wearJs,
                @"export const WRECK_COND_BYTE\s*=\s*Math\.round\(\s*WRECK_THRESHOLD\s*\*\s*([0-9]+)\s*\)\s*;");
            Assert.IsTrue(mByte.Success, "WRECK_COND_BYTE is no longer `Math.round(WRECK_THRESHOLD * N)` " +
                                         "in client/src/items/wear.js. If the client changed HOW it " +
                                         "encodes, this test must follow it — do not delete it.");
            float clientThreshold = float.Parse(mThr.Groups[1].Value, CultureInfo.InvariantCulture);
            int clientScale = int.Parse(mByte.Groups[1].Value, CultureInfo.InvariantCulture);
            int clientByte = (int)Math.Round(clientThreshold * clientScale, MidpointRounding.AwayFromZero);

            float defThreshold = SimDefs.Default.Wear.WreckThreshold;
            Assert.That(clientThreshold, Is.EqualTo(defThreshold).Within(1e-6f),
                "the client's WRECK_THRESHOLD and wear.wreck_threshold disagree. (client/test/" +
                "wear-join.test.js reads the .def and asserts the same thing from the other side; this " +
                "leg is here so the C# half of the seam cannot pass while the JS half is stale.)");

            int hostByte = WireFormat.ConditionByte(defThreshold);
            Assert.AreEqual(hostByte, clientByte,
                $"THE CLIENT COMPARES BYTE {clientByte} AND THE HOST ENCODES THE WRECK FLOOR AS " +
                $"{hostByte}. The `cond` encoding is a two-language contract: WireFormat.ConditionByte " +
                "writes the byte and client/src/items/wear.js compares it. Change one and the art " +
                "detaches from the def silently — the machine that the sim refuses to jury-rig keeps " +
                "its clean picture, or a healthy one starts wearing a wreck's. Fix whichever side " +
                "moved; do not adjust this number.");

            // …and the DIRECTION, which equality alone does not pin: the def value itself must be
            // INTACT (the rule is "below"), and one byte under it must be wrecked.
            Assert.That(hostByte, Is.GreaterThan(0).And.LessThan(255), "a degenerate byte");
            Assert.IsFalse(WireFormat.ConditionByte(defThreshold) < clientByte,
                "a device sitting exactly AT wear.wreck_threshold would be drawn wrecked. The def says " +
                "BELOW, and MachineWearSystem agrees; the art must not be stricter than the rule.");
            Assert.IsTrue(WireFormat.ConditionByte(defThreshold - 0.01f) < clientByte,
                "a device a full percent below the floor is NOT drawn wrecked — the comparison is " +
                "inverted, or the encoding is no longer monotone");
        }

        /// <summary>Read a file out of <c>client/</c> from the test binary's location. The test
        /// assembly runs from <c>tests/Perilune.Tests/bin/Debug/net8.0</c>, so the repo root is five
        /// levels up; asserted rather than assumed, because a silently-missing file would make the
        /// regexes above fail with a confusing message instead of a clear one.</summary>
        private static string ReadClientFile(string relative)
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < 8 && dir != null; i++, dir = dir.Parent)
            {
                string candidate = Path.Combine(dir.FullName, "client", relative.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(candidate)) return File.ReadAllText(candidate);
            }
            Assert.Fail("could not find client/" + relative + " above " + AppContext.BaseDirectory +
                        " — this test spans two languages and needs the client source on disk");
            return null;
        }

        // ═══════════════════════════════════════════ 3. THE EQUIVALENCE — the gate changes NO OUTPUT

        /// <summary>
        /// WHAT THE CLIENT SEES IS ALWAYS WHAT A GATE-LESS HOST WOULD HAVE SENT. The gate is an
        /// optimisation, so the only thing that could make it wrong is a divergence — and that is
        /// asserted directly, over a sequence of real mutations (wear one machine, wear it back, strip
        /// one, hide one in fog), by comparing the cached payload against a payload built from the
        /// live sim on every step.
        ///
        /// ⚠️ THE REFERENCE IS BUILT FROM <c>Snapshot</c> AFTER A FORCED RENDER, not from a
        /// re-implementation of <c>BuildDevices</c> in this file. A second builder here would be a
        /// hand mirror of the thing under test and would agree with itself while both were wrong.
        /// </summary>
        [Test]
        public void The_Cached_Payload_Never_Diverges_From_A_Freshly_Built_One()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            var d = FirstTileResidentDevice(sim);
            var pos = d.Pos;

            gs.RenderForTest();

            void Step(string what)
            {
                gs.RenderUnforcedForTest();                 // the GATED path — may or may not skip
                string gated = CachedDevices(gs);
                // …and the same state through the ungated path, on a second session over the same sim.
                var probe = new GameSession(host, _ => { });
                probe.RenderForTest();
                string ungated = CachedDevices(probe);
                Assert.AreEqual(ungated, gated,
                    "AFTER " + what + " the gated cache disagrees with a freshly primed session. The " +
                    "dirty-version gate has skipped a render whose payload would have differed, and " +
                    "the client is now looking at stale wear for as long as the sim stays quiet.");
            }

            Step("boot");
            d.Condition = 0.9f;   Step("a machine wearing a little");
            d.Condition = 0.1f;   Step("the same machine dropping below the wreck floor");
            d.Condition = 0.9f;   Step("it being repaired again");

            // Fog: a device that stops being Explored leaves the channel. The gate must see that too —
            // it is a change in the LIST, not in any device.
            var level = sim.World.Levels[pos.Z];
            int idx = pos.Y * sim.World.Width + pos.X;
            level.Flags[idx] &= unchecked((byte)~(byte)TileFlags.Explored);
            Step("the tile falling back into fog");
        }

        /// <summary>
        /// PIN-NEUTRAL AND PROJECTION-PURE, the in-suite half. The gate reads the device store and a
        /// flag plane and writes nothing; the five determinism pins are measured by <c>ci.sh</c>.
        /// </summary>
        [Test]
        public void The_Gate_Never_Touches_The_Sim()
        {
            var (gs, host, _) = Boot(ShipChoice.Grid);
            ulong before = host.Sim.StateHash();
            gs.RenderForTest();
            for (int i = 0; i < 10; i++) gs.RenderUnforcedForTest();
            Assert.That(host.Sim.StateHash(), Is.EqualTo(before),
                "the dirty-version gate moved the sim's StateHash. This channel is VIEW-ONLY; a write " +
                "here moves every determinism pin for a layer the sim does not have.");
        }

        /// <summary>
        /// THE CULTURE GATE. The dev machine is de-DE, this channel ships six integers per device, and
        /// the gate now decides whether they are re-emitted at all — so a culture bug here would look
        /// like a caching bug. Asserted over a real payload rather than a synthetic one.
        /// </summary>
        [Test]
        public void The_Gated_Payload_Is_Culture_Invariant()
        {
            var prev = System.Threading.Thread.CurrentThread.CurrentCulture;
            string deDe;
            try
            {
                System.Threading.Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var (gs, host, _) = Boot(ShipChoice.Grid);
                gs.RenderForTest();
                deDe = CachedDevices(gs);
                Assert.IsNotNull(deDe, "no devices payload at all under de-DE");
            }
            finally
            {
                System.Threading.Thread.CurrentThread.CurrentCulture = prev;
            }

            // …and the SAME ship under the ambient culture must produce the SAME bytes. Comparing the
            // two payloads is stronger than hunting for a `;` or a `,`: every value here is an integer,
            // so the failure a culture bug would actually produce is a different separator or a
            // different digit grouping, and equality catches any of them without naming one.
            var (gs2, host2, _) = Boot(ShipChoice.Grid);
            gs2.RenderForTest();
            Assert.AreEqual(CachedDevices(gs2), deDe,
                "the devices payload differs between de-DE and the ambient culture. This machine is " +
                "de-DE and the gate decides whether these integers are re-emitted at all, so a culture " +
                "bug here presents as a caching bug.");
        }
    }
}
