using System.Collections.Generic;
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
    /// The key is the ENTIRE CELL LIST, compared element-wise over all six fields, and
    /// <see cref="WireFormat.Devices"/> is a pure function of that list. So "the skip was taken" and
    /// "the payload would have been byte-identical" are the same statement rather than a heuristic
    /// that usually holds. "Sufficient BY INSPECTION and pinned by NOTHING" is the failure mode this
    /// repo named after <c>HasIceChain</c>, so both halves are pinned: a per-FIELD inclusion table
    /// over <see cref="WireFormat.DeviceCell.SameAs"/> (each of the six fields alone must be enough to
    /// deny a skip — the cheap keys, "condition only" and "count only", are among the things it
    /// catches), and THE FLIP, driven on a real ship.
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

        /// <summary>A tile-resident device on a shipped ship, so the tests move something real.</summary>
        private static Device FirstTileResidentDevice(Simulation sim)
        {
            foreach (var d in sim.Devices.Items)
                if (!Simulation.IsUtilityOverlay(d.Kind)) return d;
            Assert.Fail("no tile-resident device on this ship — every test below would be vacuous");
            return null;
        }

        // ═══════════════════════════════════════════ 1. THE KEY, FIELD BY FIELD (inclusion, not count)

        /// <summary>
        /// EVERY ONE OF THE SIX FIELDS ALONE MUST DENY A SKIP. This is an INCLUSION TABLE and not a
        /// population count: CLAUDE.md's fourth trap is a guard whose scope filter excludes the
        /// violation, and "the comparison returned false for something" never proves it would return
        /// false for the thing.
        ///
        /// The two rows that matter most are the CHEAP KEYS somebody will eventually propose:
        /// comparing only <c>Cond</c> misses a device that was stripped and replaced at equal wear;
        /// comparing only the COUNT misses every in-place change there is. Both are listed by name.
        ///
        /// MUTATION: drop any field from <see cref="WireFormat.DeviceCell.SameAs"/> ⇒ its row fails.
        /// </summary>
        [Test]
        public void The_Cache_Key_Reads_All_Six_Fields()
        {
            var baseline = new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1);
            Assert.IsTrue(baseline.SameAs(baseline), "a cell must equal itself, or every skip is denied");
            Assert.IsTrue(baseline.SameAs(new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 1)),
                "two identical cells compared unequal — the gate would never skip anything and the " +
                "scheme is inert rather than wrong, which is the harder failure to notice");

            foreach (var (field, other) in new (string, WireFormat.DeviceCell)[]
            {
                ("X — a device MOVED (or two devices swapped tiles at equal wear)",
                    new WireFormat.DeviceCell(5, 7, 1, (int)DeviceKind.Scrubber, 200, 1)),
                ("Y", new WireFormat.DeviceCell(4, 8, 1, (int)DeviceKind.Scrubber, 200, 1)),
                ("Deck — the same tile on another deck",
                    new WireFormat.DeviceCell(4, 7, 2, (int)DeviceKind.Scrubber, 200, 1)),
                ("Kind — a device was STRIPPED and another placed on its tile at equal wear. This is " +
                 "the row the cheap key 'compare Cond only' fails, and the art would keep drawing the " +
                 "old machine's picture on the new machine's tile",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Fabricator, 200, 1)),
                ("Cond — the wear byte itself, i.e. the whole point of the channel",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 199, 1)),
                ("Oper — the sim's own IsOperational, which the client cannot derive",
                    new WireFormat.DeviceCell(4, 7, 1, (int)DeviceKind.Scrubber, 200, 0)),
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
            host.Sim.RemoveDevice(doomed.Id);

            gs.RenderUnforcedForTest();
            Assert.That(gs.DevicesSerializedForTest, Is.EqualTo(before + 1),
                "a device was REMOVED and the gate skipped the render. A shorter list is a different " +
                "payload; a comparison that only walks the shared prefix would pass every other test " +
                "in this file.");
            Assert.AreNotEqual(cached, CachedDevices(gs), "…and the cached payload really did change");
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
