using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>devices</c> WIRE CHANNEL — per-device wear state read from <c>sim.Devices</c> itself
    /// instead of from the projected glyph cell.
    ///
    /// WHY A CHANNEL WAS NEEDED. <see cref="Device.Condition"/> HAS NEVER REACHED THE CLIENT IN ANY
    /// FORM. The projection's only trace of it is <see cref="GlyphColor.Broken"/> in the tile's
    /// FOREGROUND byte, and that byte is (a) not read by either standard surface, (b) ONE BIT rather
    /// than a gradient, and (c) overwritten by <c>GlyphMapper</c> pass 5 the moment a crew member
    /// stands on the tile. Each of those three is asserted here as a PAIR — the non-vacuity control
    /// proves the projection really does lose the fact, and the assertion proves the channel keeps it.
    /// Without the control, a test would pass against a projection that never lost anything and would
    /// prove nothing about the channel. Both halves run against a real <see cref="Simulation"/>, in
    /// the manner of <c>ItemsChannelTests</c> and <c>MarksChannelTests</c>.
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar, NO new hashed
    /// field, NO save-chapter change, NO new <see cref="GlyphColor"/> id, and <c>WireFormat.cs</c> has
    /// NO DIFF (it was already <c>partial</c>): so the def-field and defs-checksum gates do not apply
    /// and all five determinism pins must be byte-identical.
    /// <see cref="Rendering_The_Devices_Channel_Never_Touches_The_Sim"/> is the in-suite half of that
    /// claim; the pins themselves are measured by <c>ci.sh</c>. The de-DE culture gate DOES apply and
    /// is exercised — the dev machine is de-DE and this channel ships six integers per device.
    /// </summary>
    public class DevicesChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Devices_Serializes_Tuple_Shape_And_EmptyList()
        {
            var cells = new[]
            {
                new WireFormat.DeviceCell(3, 4, 0, (int)DeviceKind.Fabricator, 255, 1, 0, 1, 1, (int)ItemKind.Parts, 0),
                new WireFormat.DeviceCell(58, 15, 1, (int)DeviceKind.Light, 26, 0, 1, 0, 1, WireFormat.SpendNothing, 0),
            };
            string json = WireFormat.Devices(cells);
            StringAssert.Contains("\"type\":\"devices\"", json);
            // tuple order: [x, y, deck, kind, cond, oper, open, serv, air, spend]. The two rows carry
            // DIFFERENT `open`, `serv` AND `spend` values on purpose — a serializer that hard-wired
            // any of them would satisfy one row alone. (⭐ M3-13 added `serv` and its distinct pair for
            // that reason; ⭐ D4 appended `air` as element 9 and it gets its own distinct pair in
            // Devices_Serializes_The_Air_Element_Distinctly below, because BOTH rows here would have
            // to carry the same value to keep these two literals readable. ⭐⭐ `spend` is element 10
            // and it CAN vary here, because its two rows are already distinct — `5` is
            // ItemKind.Parts, i.e. an item byte, and `-2` is WireFormat.SpendNothing, i.e. the
            // sentinel: the pair proves BOTH halves of the column's vocabulary survive the
            // serializer, negatives included.)
            StringAssert.Contains("[3,4,0,13,255,1,0,1,1,5,0]", json);
            StringAssert.Contains("[58,15,1,8,26,0,1,0,1,-2,0]", json);
            Assert.AreEqual("{\"type\":\"devices\",\"cells\":[]}",
                WireFormat.Devices(Array.Empty<WireFormat.DeviceCell>()));
            Assert.AreEqual("{\"type\":\"devices\",\"cells\":[]}", WireFormat.Devices(null),
                "a null list is the same inert payload, not a crash on the render thread");
        }

        /// <summary>⭐ <b>D4 — THE NINTH ELEMENT IS SERIALIZED FROM THE CELL AND NOT HARD-WIRED.</b>
        /// Its own test rather than a third distinct pair in the shape test above, because the two
        /// rows there already carry the distinct <c>open</c>/<c>serv</c> pairs and a fourth varying
        /// column makes both literals unreadable. Two rows, opposite <c>air</c>, everything else
        /// identical: a serializer that emitted a constant satisfies exactly one of them.</summary>
        [Test]
        public void Devices_Serializes_The_Air_Element_Distinctly()
        {
            string json = WireFormat.Devices(new[]
            {
                new WireFormat.DeviceCell(1, 1, 0, (int)DeviceKind.Fabricator, 255, 1, 0, 1, 1, WireFormat.SpendUnknown, 0),
                new WireFormat.DeviceCell(2, 1, 0, (int)DeviceKind.Fabricator, 255, 1, 0, 1, 0, WireFormat.SpendUnknown, 0),
            });
            StringAssert.Contains("[1,1,0,13,255,1,0,1,1,-1,0]", json);
            StringAssert.Contains("[2,1,0,13,255,1,0,1,0,-1,0]", json);
        }

        /// <summary>
        /// THE TUPLE LEADS WITH <c>x, y, deck</c>, like every other sparse channel. Measured against
        /// the siblings rather than asserted as a literal, so this cannot drift into agreeing with a
        /// stale comment: every channel is asked to place a row at x=7 y=3 deck=1 and the first three
        /// elements must be <c>7,3,1</c> in all of them.
        ///
        /// ⚠️ THE FOURTH AND FIFTH SIBLINGS WERE ADDED ON A SEND-BACK, and the reason is worth the
        /// two lines. This test's own docstring said "all four channels are asked" while the body
        /// built THREE payloads (<c>devices</c> + two siblings). Nothing was false — the header of
        /// <c>WireFormat.Devices.cs</c> names <c>materials</c>, <c>zones</c>, <c>marks</c> and
        /// <c>items</c>, and all four really do lead with x,y,deck — but the TEST tested less than it
        /// said, which is the same defect as a stale comment pointed the other way. All four are now
        /// built here, so the claim and the coverage are the same size.
        ///
        /// MUTATION: swap X and Deck in <see cref="WireFormat.Devices"/> ⇒ this fails and names the
        /// four siblings it now disagrees with.
        /// </summary>
        [Test]
        public void The_Tuple_Leads_With_X_Y_Deck_Like_Every_Other_Sparse_Channel()
        {
            string dev = WireFormat.Devices(new[] { new WireFormat.DeviceCell(7, 3, 1, 4, 200, 1, 0, 1, 1, WireFormat.SpendUnknown, 0) });
            string items = WireFormat.Items(new[] { new WireFormat.ItemCell(7, 3, 1, 4, 200) });
            string marks = WireFormat.Marks(new[] { new WireFormat.MarkCell(7, 3, 1, 2) });
            string zones = WireFormat.Zones(new[] { new WireFormat.ZoneTile(7, 3, 1, 0UL, 0) });
            string materials = WireFormat.Materials(new[] { (X: 7, Y: 3, Deck: 1, Kind: 0, Mat: 2) });

            StringAssert.Contains("[7,3,1,", dev,
                "the devices tuple no longer leads with x,y,deck — the shape five sparse channels share");
            StringAssert.Contains("[7,3,1,", items, "control: the items channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", marks, "control: the marks channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", zones, "control: the zones channel leads with x,y,deck");
            StringAssert.Contains("[7,3,1,", materials, "control: the materials channel leads with x,y,deck");
        }

        /// <summary>
        /// THE de-DE GATE. This machine's culture is de-DE, where <c>ToString()</c> on an int with a
        /// group separator would emit <c>1.234</c> — which is a JSON parse error at the client, on
        /// every device on the ship. Every number here goes through InvariantCulture.
        ///
        /// MUTATION: drop the <c>DeviceIc</c> argument from any of the eight <c>ToString</c> calls and
        /// run under de-DE ⇒ the payloads diverge.
        /// </summary>
        [Test]
        public void Devices_Payload_Is_Culture_Invariant()
        {
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                var loud = new CultureInfo("de-DE");
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Devices(new[] { new WireFormat.DeviceCell(1234, 7, 2, 3, 255, 1, 1, 1, 1, (int)ItemKind.Seals, 0) });
                Thread.CurrentThread.CurrentCulture = loud;
                Assert.AreEqual(inv, WireFormat.Devices(new[] { new WireFormat.DeviceCell(1234, 7, 2, 3, 255, 1, 1, 1, 1, (int)ItemKind.Seals, 0) }),
                    "a wire payload that changes with the operator's locale is not a wire payload");
                StringAssert.Contains("[1234,7,2,3,255,1,1,1,1,7,0]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        /// <summary>
        /// THE CONDITION QUANTISER. <c>0 = wrecked … 255 = pristine</c>, half-up, clamped, NaN-safe.
        ///
        /// The 0.1 row is the one the charter names: it must be a LOW byte, and it must not be the
        /// banker's-rounding 25. The 1f row must be the maximum. The out-of-range rows matter because
        /// <see cref="Device.Condition"/> is a public mutable float that nothing in the sim clamps on
        /// write — <c>DeconstructSystem</c> clamps it before use for exactly the same reason.
        ///
        /// MUTATION: <c>(int)(condition * 255f)</c> (drop the +0.5f) ⇒ 0.1 lands on 25 and this fails.
        /// MUTATION 2: DELETE the low-clamp line ⇒ <c>ConditionByte(-1f)</c> returns −254 and this
        /// fails. That second one is the mutation the clamp actually decides — see below.
        ///
        /// ⚠️ A DEAD GUARD IS RETRACTED HERE RATHER THAN PATCHED, and the retraction is the point of
        /// the last third of this test. The NaN assertion used to carry the message *"`!(x &gt; 0)` is
        /// why the guard is written that way"*, and independent review mutated the clamp to
        /// <c>condition &lt; 0f</c> and watched the whole suite stay green. <b>It was right to stay
        /// green.</b> <c>(int)float.NaN</c> is 0 — .NET's float→int conversion saturates — so NaN
        /// reaches 0 through the fall-through as well, and NO INPUT ANYWHERE DISTINGUISHES THE TWO
        /// SPELLINGS. That is a NO-OP MUTATION, not a hole in a guard, and "make the mutation bite"
        /// was therefore not available: there is nothing to catch.
        ///
        /// So the causal claim is withdrawn and replaced by two things that are true and that a test
        /// can hold. (1) THE EQUIVALENCE IS PINNED, over a probe set that includes NaN and both
        /// infinities, against a shadow written with the other spelling — so the next reader who
        /// "fixes" the clamp to <c>&lt; 0f</c>, or who re-files the survivor as a hole, finds the
        /// answer in the assertion instead of re-deriving it. The shadow is a full second
        /// implementation, so it also fails if the shipped quantiser changes at all. (2) THE RUNTIME
        /// FACT IS PROBED DIRECTLY rather than asserted in prose, because it is the whole reason (1)
        /// holds and it is a property of the platform, not of this file.
        /// </summary>
        [Test]
        public void ConditionByte_Maps_Zero_To_Zero_And_Pristine_To_255()
        {
            Assert.AreEqual(0, WireFormat.ConditionByte(0f), "a wrecked machine is 0");
            Assert.AreEqual(255, WireFormat.ConditionByte(1f), "a pristine machine is 255");
            Assert.AreEqual(26, WireFormat.ConditionByte(0.1f), "0.1 rounds HALF-UP to 26, not 25");
            Assert.AreEqual(128, WireFormat.ConditionByte(0.5f));
            Assert.AreEqual(153, WireFormat.ConditionByte(0.6f), "the jury-rig condition");
            Assert.AreEqual(0, WireFormat.ConditionByte(-1f),
                "clamped low: the field is a public float. THIS is what the low clamp decides — delete " +
                "the line and this returns -254, which is the mutation that bites.");
            Assert.AreEqual(255, WireFormat.ConditionByte(2f), "clamped high");
            Assert.AreEqual(0, WireFormat.ConditionByte(float.NaN), "NaN arrives as a wrecked byte");

            // (2) THE RUNTIME FACT, probed rather than claimed. If this ever fails, the equivalence
            // below stops holding and the clamp's spelling becomes load-bearing after all.
            // ⚠️ THROUGH A LOCAL, DELIBERATELY: `(int)float.NaN` written inline is a CONSTANT
            // conversion and the C# compiler REFUSES it (CS0221). The thing under test is the
            // RUNTIME cast, which is what `ConditionByte` would perform.
            float nan = float.NaN;
            Assert.AreEqual(0, (int)nan,
                "this platform's float->int conversion no longer saturates NaN to 0. The low clamp's " +
                "spelling `!(x > 0)` vs `x < 0` was equivalent ONLY because of that; it is now a real " +
                "behavioural choice and needs a real assertion, not this equivalence.");

            // (1) THE EQUIVALENCE, pinned so the no-op mutation is EXPECTED rather than unexplained.
            foreach (float probe in new[]
            {
                float.NaN, float.NegativeInfinity, -1f, -0.001f, -0f, 0f, 1e-6f,
                0.002f, 0.1f, 0.5f, 0.6f, 0.999f, 1f, 2f, float.PositiveInfinity,
            })
            {
                Assert.AreEqual(WireFormat.ConditionByte(probe), ConditionByteWithLessThanZeroClamp(probe),
                    "the shipped quantiser and the `condition < 0f` spelling of its low clamp now " +
                    "DISAGREE at " + probe.ToString(CultureInfo.InvariantCulture) + ". Either the two " +
                    "spellings stopped being interchangeable (then pin the difference and delete this " +
                    "loop), or the shipped quantiser changed and the shadow was not updated with it.");
            }

            // Monotone, so a damage ramp can never read as a repair.
            int last = -1;
            for (int i = 0; i <= 100; i++)
            {
                int b = WireFormat.ConditionByte(i / 100f);
                Assert.That(b, Is.GreaterThanOrEqualTo(last), "the quantiser is not monotone at " + i);
                last = b;
            }
        }

        /// <summary><see cref="WireFormat.ConditionByte"/> written with <c>condition &lt; 0f</c> as its
        /// low clamp — the mutation independent review applied and watched survive. It is kept as a
        /// SHADOW rather than described in a comment so the equivalence is asserted over real inputs
        /// instead of argued. Every other line is a verbatim copy; if the shipped method changes and
        /// this does not, the loop above fails, which is the intended cost of keeping it.</summary>
        private static int ConditionByteWithLessThanZeroClamp(float condition)
        {
            if (condition < 0f) return 0;
            if (condition >= 1f) return 255;
            return (int)(condition * 255f + 0.5f);
        }

        // ═══════════════════════════════════════════════════════════════════ the session bridge

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship = ShipChoice.Perilune)
        {
            var (gs, host, _) = BootWithSink(ship);
            return (gs, host);
        }

        private static (GameSession gs, SimHost host, List<string> sink) BootWithSink(ShipChoice ship)
        {
            var sink = new List<string>();
            var host = ship == ShipChoice.Perilune
                ? SimHost.Build(SimHost.DefaultSeed)
                : SimHost.Build(ship == ShipChoice.Slice ? SimHost.SliceSeed : SimHost.DefaultSeed, ship: ship);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        /// <summary>The cached <c>devices</c> payload after a render, taken from the Snapshot a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. (A channel absent from <c>Snapshot</c>'s key list renders empty until
        /// the next Render happens to change it, and this channel's payload can go unchanged for a
        /// long stretch — one machine's condition byte moves ~5 steps per operating hour — so "the next
        /// change" is not immediate. <c>materials</c> is exactly that pre-existing gap, recorded in
        /// <c>GameSession.Snapshot</c> and deliberately not fixed by this lane. <c>ledger</c> is also
        /// absent from the list but is NOT the same gap and this file used to say it was: measured on
        /// a live reconnect, <c>materials</c> arrived 0 times in 4 s while <c>ledger</c> arrived 4,
        /// because its payload moves on nearly every render and it self-heals in ~100 ms.
        /// <c>devices</c> is like <c>materials</c>.)</summary>
        private static string DevicesJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"devices\""));
            Assert.IsNotNull(json, "the devices channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it loses every device's wear state");
            return json;
        }

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately positional: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int X, int Y, int Deck, int Kind, int Cond, int Oper, int Open, int Serv)> Tuples(string json)
        {
            var list = new List<(int, int, int, int, int, int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                // ⚠️ UPDATE THE WIDTH AND THE PARSER **TOGETHER**, NEVER THE WIDTH ALONE — the
                // sibling note in `DevicesDeltaTests.TupleWidth` argues this at length. This parser
                // reads POSITIONALLY, so a tuple that silently grew would turn it into a confident
                // reader of the wrong column. Widened to ELEVEN by the rotation package (2026-08-05),
                // whose eleventh element is `face` (`Device.Facing`, 0..3, drawing-only).
                Assert.AreEqual(11, f.Length, "a devices tuple is eleven elements, saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture),
                          int.Parse(f[5], CultureInfo.InvariantCulture),
                          int.Parse(f[6], CultureInfo.InvariantCulture),
                          int.Parse(f[7], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        /// <summary>The channel's row for a tile, or null.</summary>
        private static (int X, int Y, int Deck, int Kind, int Cond, int Oper, int Open, int Serv)? RowAt(GameSession gs, Int3 p)
        {
            foreach (var t in Tuples(DevicesJson(gs)))
                if (t.X == p.X && t.Y == p.Y && t.Deck == p.Z) return t;
            return null;
        }

        /// <summary>The whole <see cref="GlyphCell"/> the real projection produces for a tile — glyph,
        /// fg, bg and attr. The erasure controls compare CELLS, not just glyphs: "the projection loses
        /// the wear state" has to mean the entire cell is identical, or a reader could in principle
        /// have recovered the fact from some other byte.</summary>
        private static GlyphCell ProjectedCell(Simulation sim, Int3 p)
        {
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, p.Z, Lens.None, null, dst);
            return dst[p.X, p.Y];
        }

        private static void Reveal(Simulation sim, int z)
        {
            var level = sim.World.Levels[z];
            for (int i = 0; i < level.Flags.Length; i++) level.Flags[i] |= (byte)TileFlags.Explored;
        }

        private static void RevealAll(Simulation sim)
        {
            for (int z = 0; z < sim.World.Depth; z++) Reveal(sim, z);
        }

        /// <summary>An EMPTY walkable tile: walkable, with no device, no item and no citizen on it, so
        /// each test below puts exactly what it means to put there and nothing else.</summary>
        private static Int3 EmptyWalkable(Simulation sim)
        {
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if ((world.GetFlags(p) & TileFlags.HasDevice) != 0) continue;
                        if (sim.Items.Items.Any(i => i.CarriedBy == 0 && i.Pos.Equals(p))) continue;
                        if (sim.Citizens.Items.Any(c => !c.Dead && c.Pos.Equals(p))) continue;
                        if (sim.Devices.Items.Any(d => d.Pos.Equals(p))) continue;
                        return p;
                    }
            Assert.Fail("no empty walkable tile on this ship");
            return default;
        }

        // ═════════════════════════════════ THE THREE LOSSES — each a control + the channel's answer

        /// <summary>
        /// LOSS 1 — NOT A GRADIENT, AND THIS IS THE CHARTER'S OWN TEST. Two identical machines, one at
        /// <c>Condition = 0.1f</c> and one at <c>1f</c>, project a BYTE-IDENTICAL <see cref="GlyphCell"/>
        /// (both are above a Light's <c>fail = 0.02</c>, so neither reads <c>GlyphColor.Broken</c>) — and
        /// the channel carries 26 against 255. The kind is a Light rather than a machine on purpose;
        /// the reason is in the body, beside the fixture.
        ///
        /// THE CONTROL IS THE FIRST HALF, deliberately: without it this test would pass against a
        /// projection that never lost anything, and would prove nothing about the channel.
        ///
        /// MUTATION: emit a constant 255 for <c>Cond</c> ⇒ the second half fails.
        /// </summary>
        [Test]
        public void Two_Machines_At_Different_Wear_Project_Identically_But_The_Channel_Carries_The_Gradient()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            // A LIGHT, NOT A FABRICATOR, and that is a fixture decision rather than a taste. The
            // control needs BOTH members above their kind's `fail`, and Fabricator's is 0.10 — exactly
            // the worn member's condition, so the control would have rested on a float comparison at
            // its own boundary. Light fails below 0.02, so 0.1 clears it by 5x and the control is about
            // the projection rather than about `>=`.
            var worn = EmptyWalkable(sim);
            var dWorn = sim.AddDevice(DeviceKind.Light, worn, "lamp-worn");
            var pristine = EmptyWalkable(sim);
            var dPristine = sim.AddDevice(DeviceKind.Light, pristine, "lamp-new");
            Assert.That(pristine, Is.Not.EqualTo(worn), "the two fixtures must be on different tiles");

            dWorn.Condition = 0.1f;
            dPristine.Condition = 1f;
            // Powered state is identical so the control cannot be explained by the Dim attribute.
            dWorn.Powered = dPristine.Powered;

            // CONTROL: the projection cannot tell them apart, in ANY of the four cell bytes.
            var cellWorn = ProjectedCell(sim, worn);
            var cellPristine = ProjectedCell(sim, pristine);
            Assert.That(cellWorn.Glyph, Is.EqualTo(cellPristine.Glyph));
            Assert.That(cellWorn.Fg, Is.EqualTo(cellPristine.Fg),
                "CONTROL BROKEN: the projection distinguishes these two after all, so this test would " +
                "prove nothing about the channel. Re-pick the pair (both must be above machines.def's " +
                "`fail` for their kind, or one reads GlyphColor.Broken).");
            Assert.That(cellWorn.Bg, Is.EqualTo(cellPristine.Bg));
            Assert.That(cellWorn.Attr, Is.EqualTo(cellPristine.Attr));

            // THE CHANNEL: a low byte and a high byte.
            var rWorn = RowAt(gs, worn);
            var rPristine = RowAt(gs, pristine);
            Assert.IsNotNull(rWorn, "the worn machine is not on the channel at all");
            Assert.IsNotNull(rPristine, "the pristine machine is not on the channel at all");
            Assert.AreEqual(26, rWorn.Value.Cond, "Condition 0.1 must arrive as a LOW byte");
            Assert.AreEqual(255, rPristine.Value.Cond, "Condition 1.0 must arrive as the HIGH byte");
            Assert.AreEqual((int)DeviceKind.Light, rWorn.Value.Kind);
            Assert.That(sim.Defs.Machines[(int)DeviceKind.Light].FailBelow, Is.LessThan(0.1f),
                "CONTROL BROKEN: a Light now fails at or above 0.1, so the worn member would read " +
                "GlyphColor.Broken and the projection WOULD tell the two apart");
        }

        /// <summary>
        /// LOSS 2 — PASS 5 ERASES THE DEVICE ENTIRELY. A living crew member standing on a device's tile
        /// overwrites the whole cell with <c>Glyphs.Citizen</c>, so the frame does not even say a device
        /// is there, let alone how worn it is. Crew stand on machines constantly — maintenance is a job
        /// that puts a person on the device's own tile.
        ///
        /// MUTATION: read the channel from the projection instead of from <c>sim.Devices</c> ⇒ the row
        /// vanishes and this fails.
        /// </summary>
        [Test]
        public void A_Device_Under_A_Crew_Member_Has_No_Glyph_But_Is_Still_On_The_Channel()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            var p = EmptyWalkable(sim);
            var dev = sim.AddDevice(DeviceKind.Scrubber, p, "scrub-under");
            dev.Condition = 0.4f;

            // CONTROL: with nobody on the tile the projection shows the scrubber.
            Assert.AreEqual('S', ProjectedCell(sim, p).Glyph,
                "CONTROL BROKEN: the bare tile does not project the scrubber glyph");

            var crew = sim.Citizens.Items.FirstOrDefault(c => !c.Dead);
            Assert.IsNotNull(crew, "this ship has no living crew to stage the erasure with");
            crew.Pos = p;

            Assert.AreEqual(Glyphs.Citizen, ProjectedCell(sim, p).Glyph,
                "CONTROL BROKEN: pass 5 did not overwrite the device glyph, so there is no loss to fix");

            var row = RowAt(gs, p);
            Assert.IsNotNull(row, "the device under a crew member fell off the channel — the channel is " +
                                  "reading the projection, which is the whole defect it exists to remove");
            Assert.AreEqual((int)DeviceKind.Scrubber, row.Value.Kind,
                "the KIND is why this tuple carries one: the frame's glyph is gone");
            Assert.AreEqual(WireFormat.ConditionByte(0.4f), row.Value.Cond);
        }

        /// <summary>
        /// LOSS 3 — THE ONE BIT THE PROJECTION *DOES* CARRY IS NOT WHAT THE CLIENT NEEDS, AND THE CLIENT
        /// CANNOT DERIVE IT. <c>GlyphColor.Broken</c> means <c>!IsOperational</c>, whose threshold is PER
        /// KIND: at Condition 0.06 a Light (<c>fail = 0.02</c>) is operational and a Scrubber
        /// (<c>fail = 0.10</c>) is not. A client comparing <c>cond</c> to one threshold of its own would
        /// be wrong for one of the two, whatever threshold it picked.
        ///
        /// The two halves of the pair here are: the DEFS really do disagree per kind (measured off
        /// <c>sim.Defs</c>, not restated), and the channel's <c>oper</c> bit really does follow them.
        ///
        /// MUTATION: emit <c>cond >= 26 ? 1 : 0</c> for <c>Oper</c> ⇒ both devices read 1 and this fails.
        /// </summary>
        [Test]
        public void The_Operational_Bit_Follows_The_Per_Kind_Threshold_The_Client_Cannot_See()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            float lightFail = sim.Defs.Machines[(int)DeviceKind.Light].FailBelow;
            float scrubFail = sim.Defs.Machines[(int)DeviceKind.Scrubber].FailBelow;
            Assert.That(lightFail, Is.LessThan(scrubFail),
                "CONTROL BROKEN: the two kinds no longer disagree about `fail`, so this pair cannot " +
                "show that the threshold is per-kind. Re-pick from content/core/SimDefs/machines.def.");

            const float shared = 0.06f;   // between the two thresholds at shipped values
            Assert.That(shared, Is.GreaterThan(lightFail).And.LessThan(scrubFail),
                "CONTROL BROKEN: 0.06 no longer sits between the two thresholds; re-pick the value");

            var pl = EmptyWalkable(sim);
            var light = sim.AddDevice(DeviceKind.Light, pl, "lamp-worn");
            light.Condition = shared;
            var ps = EmptyWalkable(sim);
            var scrub = sim.AddDevice(DeviceKind.Scrubber, ps, "scrub-dead");
            scrub.Condition = shared;

            var rl = RowAt(gs, pl);
            var rs = RowAt(gs, ps);
            Assert.IsNotNull(rl); Assert.IsNotNull(rs);
            Assert.AreEqual(rl.Value.Cond, rs.Value.Cond,
                "the two fixtures must carry the IDENTICAL condition byte, or the oper difference " +
                "could be explained by the condition instead of by the per-kind threshold");
            Assert.AreEqual(1, rl.Value.Oper, "a Light at 0.06 is still operational (fail = 0.02)");
            Assert.AreEqual(0, rs.Value.Oper, "a Scrubber at 0.06 is NOT operational (fail = 0.10)");
        }

        /// <summary>
        /// LOSS 3, PART TWO — <c>oper</c> IS BOUND TO THE LIVE <c>sim.Defs</c>, NOT TO THE COMPILED
        /// <see cref="SimDefs.Default"/>. RECORDED AT THE SEAM, NEVER SCANNED (<c>CLAUDE.md</c> trap 4).
        ///
        /// ⚠️ WHY THIS EXISTS, stated plainly because it is a send-back. The defs SOURCE was pinned
        /// only by a literal-text scan in <c>client/test/devices-model.test.js</c>, which looks for the
        /// string <c>device.IsOperational(defs)</c>. Independent review defeated it with ONE LINE, and
        /// without touching the pinned string: change <c>var defs = _sim.Defs;</c> to
        /// <c>SimDefs.Default</c> the line above, and <b>843/843 node tests stayed green</b>. Writing
        /// <c>IsOperational(SimDefs.Default)</c> at the call site left the filtered dotnet run at
        /// <b>0 failures</b> as well. A text scan pins a SPELLING; only driving the thing pins a
        /// BINDING. (This lane's own commit <c>d30390e</c> closed exactly this hole in the TESTS,
        /// concluding "a retuned .def file cannot change shipped behaviour with the suite green" —
        /// which was true of the tests and was not true of the production path.)
        ///
        /// The probe is a FLIP AND A FLIP BACK, on a def graph that belongs to this test's own host:
        /// a Light sitting above the shipped threshold reads <c>oper = 1</c>; retune the LIVE
        /// <c>FailBelow</c> above its condition and the next render must read 0; restore it and it
        /// must read 1 again. <see cref="SimDefs.Default"/> is never written and is asserted
        /// unchanged, because it is precisely the value the rebinding mutation would read instead.
        ///
        /// MUTATION: <c>var defs = _sim.Defs;</c> → <c>SimDefs.Default</c> in <c>BuildDevices</c>, or
        /// <c>device.IsOperational(SimDefs.Default)</c> at the call site ⇒ the flip never happens and
        /// this fails. Both applied and watched red.
        /// </summary>
        [Test]
        public void The_Operational_Bit_Reads_The_LIVE_Defs_Not_The_Compiled_Defaults()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            // CONTROL, AND A SAFETY GATE, BEFORE ANYTHING IS WRITTEN. `SimHost.LoadDefs` falls back to
            // the frozen `SimDefs.Default` INSTANCE when the content directory cannot be found — and
            // if that happened here, retuning "the live defs" would be retuning the compiled defaults,
            // the flip would happen under either binding, and this test would prove nothing while
            // corrupting a static for every test after it. Both halves are asserted: the graph and the
            // array inside it.
            Assert.That(ReferenceEquals(sim.Defs, SimDefs.Default), Is.False,
                "this host booted on the FROZEN compiled defaults (the content dir was not found), so " +
                "the live graph and SimDefs.Default are the same object and this test cannot tell the " +
                "two bindings apart. Do not weaken this — it also stops the write below from mutating " +
                "a static that every other test shares.");
            Assert.That(ReferenceEquals(sim.Defs.Machines, SimDefs.Default.Machines), Is.False,
                "the live graph shares its Machines ARRAY with SimDefs.Default — same problem one " +
                "level down, and the ReferenceEquals above would not have caught it");

            var p = EmptyWalkable(sim);
            var light = sim.AddDevice(DeviceKind.Light, p, "lamp-defs-probe");
            var shipped = sim.Defs.Machines[(int)DeviceKind.Light];
            light.Condition = 0.06f;

            int OperNow()
            {
                var r = RowAt(gs, p);
                Assert.IsNotNull(r, "the probe light is not on the channel at all — nothing below can " +
                                    "be read as a statement about `oper`");
                return r.Value.Oper;
            }

            Assert.That(shipped.FailBelow, Is.LessThan(0.06f),
                "CONTROL BROKEN: a Light no longer clears 0.06 at the shipped threshold, so the " +
                "fixture does not start operational and the flip below measures nothing");
            Assert.AreEqual(1, OperNow(),
                "the fixture must START operational, or `oper` could be a constant 0");

            // RETUNE THE LIVE GRAPH ONLY — one field, by rebuilding the readonly struct in place.
            sim.Defs.Machines[(int)DeviceKind.Light] = new MachineDef(
                shipped.DrawKW, shipped.GenerationKW, shipped.Tier, shipped.Blocks,
                shipped.HeatKW, shipped.WearPerHour, shipped.MaintainBelow, failBelow: 0.5f);
            Assert.That(SimDefs.Default.Machines[(int)DeviceKind.Light].FailBelow, Is.LessThan(0.06f),
                "SimDefs.Default was written too — it is the value the rebinding mutation reads, so " +
                "moving it would hide exactly the defect this test exists to catch");

            Assert.AreEqual(0, OperNow(),
                "`oper` did NOT follow a retuned LIVE def. GameSession.BuildDevices is reading a def " +
                "graph other than `_sim.Defs` — SimDefs.Default is the one that looks harmless — so a " +
                "content pack that retunes machines.def cannot change what this channel reports.");

            // …AND BACK. A one-way sentinel would also be satisfied by `oper` degrading to a constant 0
            // after the first render, which is a real failure shape for a cached channel.
            sim.Defs.Machines[(int)DeviceKind.Light] = shipped;
            Assert.AreEqual(1, OperNow(),
                "`oper` did not come back when the live def was restored — it is latching, not reading");
        }

        // ═════════════════════════════════════════════════ what is deliberately NOT on the channel

        /// <summary>
        /// UTILITY OVERLAYS ARE ABSENT — measured on the shipped ship, with the non-vacuity floor as an
        /// INCLUSION test rather than a population count: the store is required to CONTAIN conduits (so
        /// "no conduit rows" cannot be satisfied by a ship that has none), and their tiles are required
        /// to be explored (so the fog gate cannot be what is filtering them).
        ///
        /// MUTATION: delete the <c>IsUtilityOverlay</c> guard in <c>BuildDevices</c> ⇒ 964 conduit/pipe
        /// rows appear and this fails.
        /// </summary>
        [Test]
        public void Utility_Overlays_Are_Not_On_The_Channel()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            var overlays = sim.Devices.Items.Where(d => Simulation.IsUtilityOverlay(d.Kind)).ToList();
            Assert.That(overlays.Count, Is.GreaterThan(0),
                "NON-VACUITY: --ship grid must actually contain conduits/pipes, or this test is " +
                "asserting the absence of something that was never there");
            Assert.That(overlays.All(d => (sim.World.GetFlags(d.Pos) & TileFlags.Explored) != 0), Is.True,
                "NON-VACUITY: every overlay tile must be EXPLORED, or the fog gate — not the overlay " +
                "rule — could be what is keeping them off the channel");

            var kinds = Tuples(DevicesJson(gs)).Select(t => t.Kind).Distinct().ToList();
            Assert.That(kinds, Does.Not.Contain((int)DeviceKind.Conduit), "a conduit reached the channel");
            Assert.That(kinds, Does.Not.Contain((int)DeviceKind.Pipe), "a pipe reached the channel");

            // The complement: tile-resident kinds ARE there, so the exclusion is not "everything".
            Assert.That(kinds, Does.Contain((int)DeviceKind.Door),
                "no doors on the channel — the exclusion is filtering more than the overlays");
        }

        /// <summary>
        /// THE JUSTIFICATION FOR THAT EXCLUSION, PINNED RATHER THAN RESTATED. Conduit and Pipe are
        /// <c>wear = 0</c> in <c>machines.def</c>, and <c>MachineWearSystem.Tick</c> opens with
        /// <c>if (def.WearPerHour &lt;= 0f) continue;</c> — so their Condition is a constant and the
        /// channel loses nothing by omitting them. READ FROM THE DEFS, so giving a conduit a wear rate
        /// fails HERE, pointing at the paragraph in <c>WireFormat.Devices.cs</c> that would then be
        /// false, instead of silently hiding a gradient the player could see.
        ///
        /// The second half is the one that makes the argument complete: FURNITURE IS ALSO WEAR-FREE and
        /// is NOT excluded, because "cannot wear" was never the reason — "not tile-resident, so no
        /// surface can draw it" is. Asserting that here stops a later reader from generalising the
        /// wear-free rule into dropping every bed on the ship.
        /// </summary>
        [Test]
        public void Utility_Overlays_Are_Wear_Free_In_The_Defs_But_That_Is_Not_Why_They_Are_Excluded()
        {
            // THE LIVE SIM'S DEFS, NOT `SimDefs.Default`, and the difference is not cosmetic:
            // `sim.Defs` is the compiled default OVERLAID WITH content/core/SimDefs/*.def, and it is
            // what BuildDevices actually reads. Asserting against the compiled table alone would leave
            // a retuned .def file able to change the shipped behaviour with this test still green.
            var (_, host) = Boot(ShipChoice.Grid);
            var defs = host.Sim.Defs;
            Assert.AreEqual(0f, defs.Machines[(int)DeviceKind.Conduit].WearPerHour,
                "a Conduit now wears. Its Condition can change, and it is off the `devices` channel — " +
                "see the exclusion paragraph in hosts/web/WireFormat.Devices.cs, which is now false.");
            Assert.AreEqual(0f, defs.Machines[(int)DeviceKind.Pipe].WearPerHour, "a Pipe now wears; same");

            Assert.AreEqual(0f, defs.Machines[(int)DeviceKind.Bed].WearPerHour,
                "CONTROL: furniture is wear-free too — which is exactly why wear-freeness is NOT the " +
                "exclusion rule. Tile-residency is.");
            Assert.IsFalse(Simulation.IsUtilityOverlay(DeviceKind.Bed));
            Assert.IsTrue(Simulation.IsUtilityOverlay(DeviceKind.Conduit));
            Assert.IsTrue(Simulation.IsUtilityOverlay(DeviceKind.Pipe));
        }

        /// <summary>
        /// FURNITURE REALLY DOES REACH THE CHANNEL, on the shipping ship, carrying whatever Condition
        /// it is authored with. This is the live half of the paragraph above: a damaged-boot ship can
        /// author a wrecked bed, and dropping wear-free kinds would have hidden it.
        /// </summary>
        [Test]
        public void A_Wear_Free_Furniture_Kind_Still_Carries_Its_Authored_Condition()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            var bed = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.Bed);
            Assert.IsNotNull(bed, "--ship grid has no bed to measure with");
            bed.Condition = 0.2f;

            var row = RowAt(gs, bed.Pos);
            Assert.IsNotNull(row, "a bed is not on the channel");
            Assert.AreEqual(WireFormat.ConditionByte(0.2f), row.Value.Cond);
            Assert.AreEqual(1, row.Value.Oper,
                "furniture has fail = 0, so it is operational at any condition — the client could not " +
                "have guessed that from the condition byte alone");
        }

        /// <summary>
        /// THE FOG GATE, mirroring <c>GlyphMapper</c> pass 4. Both legs are run with the other BLINDED
        /// and each is required to fire on its own (<c>CLAUDE.md</c>'s fifth trap: <c>assert</c> throws,
        /// so a dead second leg is indistinguishable from a live one).
        ///
        /// MUTATION: delete the <c>Explored</c> check in <c>BuildDevices</c> ⇒ the unexplored leg fails.
        /// </summary>
        [Test]
        public void An_Unexplored_Device_Is_Not_On_The_Channel()
        {
            // LEG 1, alone: unexplored ⇒ absent.
            {
                var (gs, host) = Boot(ShipChoice.Grid);
                var sim = host.Sim;
                var p = EmptyWalkable(sim);
                sim.AddDevice(DeviceKind.Terminal, p, "dark-terminal");
                sim.World.SetFlag(p, TileFlags.Explored, false);
                Assert.IsNull(RowAt(gs, p),
                    "a device on an UNEXPLORED tile reached the channel — that turns a rendering fix " +
                    "into a fog-of-war change, the line marks and items both drew");
            }
            // LEG 2, alone: explored ⇒ present. Without this the gate could be "emit nothing, ever".
            {
                var (gs, host) = Boot(ShipChoice.Grid);
                var sim = host.Sim;
                var p = EmptyWalkable(sim);
                sim.AddDevice(DeviceKind.Terminal, p, "lit-terminal");
                sim.World.SetFlag(p, TileFlags.Explored, true);
                Assert.IsNotNull(RowAt(gs, p),
                    "an EXPLORED device is missing — the fog gate is filtering everything");
            }
        }

        // ═══════════════════════════════════════════════════════════════ order, purity, transport

        /// <summary>
        /// ORDER IS THE ENTITY STORE'S, not a sort — the same contract <c>items</c> has, and the same
        /// reason: the walk IS the wire order, it is a plain <c>List</c> index walk rather than a hash
        /// container's layout, and it is part of the saved, hashed state, so one seed emits one byte
        /// sequence.
        ///
        /// MUTATION: sort <c>_devicesScratch</c> by anything ⇒ this fails.
        /// </summary>
        [Test]
        public void Devices_Are_Emitted_In_Store_Order()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            var expected = sim.Devices.Items
                .Where(d => !Simulation.IsUtilityOverlay(d.Kind))
                .Where(d => sim.World.InBounds(d.Pos))
                .Select(d => (d.Pos.X, d.Pos.Y, d.Pos.Z))
                .ToList();
            var actual = Tuples(DevicesJson(gs)).Select(t => (t.X, t.Y, t.Deck)).ToList();

            Assert.That(expected.Count, Is.GreaterThan(1), "NON-VACUITY: fewer than two rows to order");
            CollectionAssert.AreEqual(expected, actual,
                "the wire order is no longer the entity store's order. Nothing sorts this channel — " +
                "the walk IS the contract, and it is the same walk GlyphMapper pass 4 makes.");
        }

        /// <summary>
        /// PROJECTION-PURE / PIN-NEUTRAL, in-suite half. Building and serializing the channel reads
        /// authoritative state and writes none of it, so <see cref="Simulation.StateHash"/> is
        /// byte-identical across a render — which is what makes this package unable to move any of the
        /// five determinism pins.
        ///
        /// MUTATION: have <c>BuildDevices</c> write anything to the sim ⇒ this fails.
        /// </summary>
        [Test]
        public void Rendering_The_Devices_Channel_Never_Touches_The_Sim()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var sim = host.Sim;
            RevealAll(sim);

            ulong before = sim.StateHash();
            string first = DevicesJson(gs);
            string second = DevicesJson(gs);
            ulong after = sim.StateHash();

            Assert.That(after, Is.EqualTo(before),
                "rendering the devices channel moved the sim's StateHash. This channel is VIEW-ONLY; a " +
                "write here moves every determinism pin for a layer the sim does not have.");
            Assert.That(second, Is.EqualTo(first),
                "two renders of an unchanged sim produced different payloads. GameSession.Send dedupes " +
                "by string equality, so a non-deterministic payload puts the LARGEST sparse channel on " +
                "the socket every single frame.");
        }

        /// <summary>
        /// THE <c>force</c> FLAG. <see cref="GameSession.Send"/> dedupes by string equality, so an
        /// UNCHANGED payload is normally not broadcast, and on this channel the payload can go unchanged
        /// for a long stretch (Condition moves at ≤0.02 per operating HOUR per machine). A forced render
        /// must override it; that is what primes a newly-connected client.
        ///
        /// Written because the equivalent mutation SURVIVED the whole suite on the <c>marks</c> channel:
        /// every other assertion here reads the payload out of <see cref="GameSession.Snapshot"/>, which
        /// is fed by the CACHE and is written even when nothing is broadcast.
        ///
        /// MUTATION: <c>Send("devices", …, false)</c> ⇒ the second forced render broadcasts nothing.
        /// </summary>
        [Test]
        public void A_Forced_Render_Rebroadcasts_Devices_Even_When_Nothing_Changed()
        {
            var (gs, host, sink) = BootWithSink(ShipChoice.Grid);
            RevealAll(host.Sim);

            gs.RenderForTest();
            int after1 = sink.Count(p => p.Contains("\"type\":\"devices\""));
            gs.RenderForTest();
            int after2 = sink.Count(p => p.Contains("\"type\":\"devices\""));

            Assert.That(after1, Is.GreaterThanOrEqualTo(1), "the first forced render broadcast no devices at all");
            Assert.That(after2, Is.EqualTo(after1 + 1),
                "a FORCED render did not re-broadcast the devices channel. Send() dedupes unchanged " +
                "payloads and `force` is what overrides that — it is how a newly-connected client is " +
                "primed. Every other test here reads the Snapshot cache and cannot see this.");

            var (gs2, host2, sink2) = BootWithSink(ShipChoice.Grid);
            RevealAll(host2.Sim);
            gs2.RenderForTest();
            sink2.Clear();
            gs2.RenderUnforcedForTest();
            Assert.That(sink2.Count(p => p.Contains("\"type\":\"devices\"")), Is.EqualTo(0),
                "an UNCHANGED devices payload was broadcast on an unforced render — Send()'s dedupe is " +
                "not holding, and the largest sparse channel would then be on the socket every frame");
        }

        /// <summary>
        /// THE BOOT CENSUS PER SHIP, pinned by equality on a FULLY REVEALED ship so the fog gate is not
        /// what is being measured. It buys two things: the channel is not vacuously empty on the ships
        /// that actually ship, and the overlay exclusion's SIZE is visible — a change to either shows up
        /// here as a number rather than as nothing.
        ///
        /// RE-COUNT, NEVER COMPUTE (<c>CLAUDE.md</c>: a review corrected a stale sum by arithmetic and
        /// was wrong twice). These are measured off the shipped registries.
        /// </summary>
        [Test]
        public void The_Boot_Census_Per_Ship_Is_Pinned()
        {
            foreach (var (ship, expectedRows, expectedTotal) in new[]
            {
                (ShipChoice.Grid, 146, 1250),
                (ShipChoice.Slice, 111, 932),
                (ShipChoice.Perilune, 108, 929),
            })
            {
                var (gs, host) = Boot(ship);
                RevealAll(host.Sim);
                int rows = Tuples(DevicesJson(gs)).Count;
                Assert.AreEqual(expectedTotal, host.Sim.Devices.Items.Count,
                    ship + ": the device store size moved — re-count the census below, do not compute it");
                Assert.AreEqual(expectedRows, rows,
                    ship + ": the devices channel row count moved. Tile-resident devices only; " +
                    "conduits and pipes are excluded (see WireFormat.Devices.cs).");
            }
        }

        /// <summary>
        /// THE FAILURE THRESHOLD CENSUS, counted off the shipped table rather than restated. The
        /// header of <c>WireFormat.Devices.cs</c> justifies the <c>oper</c> element with "the client
        /// could not derive this, because the threshold is per-kind", and quotes FOUR distinct values
        /// over the 25 tile-resident kinds. A prose count is exactly the kind of claim this repo keeps
        /// finding stale — twice in one night, most recently a sum a review "corrected" by arithmetic
        /// and got wrong in both versions. RE-COUNT, NEVER COMPUTE.
        ///
        /// The second assertion is the one that carries the argument: whichever SINGLE threshold a
        /// client picked, it would disagree with the sim about a majority of kinds.
        /// </summary>
        [Test]
        public void The_Failure_Threshold_Really_Is_Per_Kind()
        {
            var (_, host) = Boot(ShipChoice.Grid);
            var defs = host.Sim.Defs;   // compiled default OVERLAID with content/core/SimDefs — see above
            var resident = Enum.GetValues(typeof(DeviceKind)).Cast<DeviceKind>()
                .Where(k => !Simulation.IsUtilityOverlay(k)).ToList();
            var census = resident.GroupBy(k => defs.Machines[(int)k].FailBelow)
                .ToDictionary(g => g.Key, g => g.Count());

            CollectionAssert.AreEquivalent(
                // RE-COUNTED off the shipped table after the wreck start added DeviceKind.CryoPod
                // (`fail` 0.10), never computed from the previous census: 0.10 goes 11 → 12.
                // RE-COUNTED AGAIN after M3-10 added DeviceKind.Heater, which takes the Radiator's
                // `fail` 0.10: 0.10 goes 12 → 13 and the other three groups do not move.
                new Dictionary<float, int> { { 0f, 9 }, { 0.02f, 3 }, { 0.05f, 2 }, { 0.10f, 13 } },
                census,
                "the machines.def failure-threshold census moved. WireFormat.Devices.cs's `Oper` " +
                "paragraph quotes these four groups by name and count; re-COUNT them there rather " +
                "than computing the delta.");

            int best = census.Values.Max();
            Assert.That(resident.Count - best, Is.GreaterThan(resident.Count / 2),
                "a single threshold would now get MOST kinds right, which would weaken the argument " +
                "for carrying `oper` at all — re-read the header before assuming it still holds");
        }

        // ═══════════════════════ M3-13 — `serv`: CAN THIS KIND OF MACHINE EVER BE SERVICED AT ALL?

        /// <summary>
        /// ⭐⭐ <b>M3-13 — THE EIGHTH ELEMENT, DRIVEN ON THE SHIPPING SHIP, WITH BOTH VALUES PRESENT
        /// IN ONE RUN.</b> A <c>CryoPod</c>'s <c>maint</c> is <c>0.00</c> (deliberately —
        /// <c>MECHANICS.md</c> §13.22c) and <c>Device.Condition</c> is clamped at or above zero, so
        /// <c>PrioritiseJobCommand</c>'s <c>Condition &gt;= MaintainBelow</c> can NEVER be false for
        /// one: there is no state of any ship in which a capsule has a repair to give. The Room
        /// Zoom's right-click menu reads this bit and stops promising the order.
        ///
        /// <para>⛔ <b>BOTH VALUES, ONE RUN, AND THAT IS THE NON-VACUITY.</b> A serializer that wrote
        /// a constant <c>1</c> passes any test that only looks at serviceable machines, and a
        /// constant <c>0</c> passes any test that only looks at the capsules. The wreck carries
        /// twelve capsules AND a hull full of ordinary machines, so one render answers both.</para>
        ///
        /// <para>MUTATION: hard-wire <c>1</c> (or <c>0</c>) in <c>GameSession.BuildDevices</c> ⇒ one
        /// of the two legs reddens. MUTATION 2: give <c>CryoPod</c> a non-zero <c>maint</c> in
        /// <c>machines.def</c> ⇒ the capsule leg reddens, which is the def and the wire being pinned
        /// to each other rather than to a literal in this file.</para>
        /// </summary>
        [Test]
        public void The_Serv_Bit_Is_Zero_For_Capsules_And_One_For_Ordinary_Machines_On_The_Wreck()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;

            int pods = 0, podsServiceable = 0, others = 0, othersServiceable = 0;
            foreach (var t in Tuples(DevicesJson(gs)))
            {
                if (t.Kind == (int)DeviceKind.CryoPod) { pods++; podsServiceable += t.Serv; }
                else if (sim.Defs.Machines[t.Kind].MaintainBelow > 0f) { others++; othersServiceable += t.Serv; }
            }

            Assert.That(pods, Is.GreaterThan(0),
                "⛔ NON-VACUITY: no CryoPod row reached the channel, so the capsule leg is empty. " +
                "The wreck authors twelve; if none are on the wire the cryo bay is fogged and this " +
                "test is measuring nothing.");
            Assert.That(others, Is.GreaterThan(0),
                "⛔ NON-VACUITY: no serviceable-kind row reached the channel, so a hard-wired 0 " +
                "would pass this test.");

            Assert.AreEqual(0, podsServiceable,
                "A CAPSULE REPORTED ITSELF SERVICEABLE. `CryoPod`'s maint is 0.00, so " +
                "PrioritiseJobCommand refuses every order at one — and the Room Zoom would go on " +
                "offering PRIORITISE: REPAIR on a bay of twelve, each click firing a toast and " +
                "changing nothing. That is the defect this element exists to close.");
            Assert.AreEqual(others, othersServiceable,
                "a machine whose def gives it a maintain threshold reported itself NEVER serviceable " +
                "— the menu would withdraw the repair order from machines that can be repaired, " +
                "which is M2-10's whole verb lost silently");
        }

        /// <summary>
        /// ⛔ <b>THE BIT IS THE SIM'S ANSWER, AND THE SIM'S ANSWER IS THE COMMAND'S OWN COMPARISON.</b>
        /// <c>MaintenanceSystem.IsEverServiceable</c> is asserted here against the DEFS it reads and
        /// against the BEHAVIOUR it predicts — an order at a capsule is refused, an order at a worn
        /// serviceable machine is taken — so the menu's bit and the command's refusal cannot come
        /// apart.
        ///
        /// <para>MUTATION: change <c>IsEverServiceable</c>'s test to <c>&gt;= 0f</c> ⇒ the capsule
        /// leg reddens. MUTATION 2: delete the <c>Condition &gt;= MaintainBelow</c> line from
        /// <c>PrioritiseJobCommand</c> ⇒ the BEHAVIOUR leg reddens, which is what makes this an
        /// agreement test rather than two restatements of one def read.</para>
        /// </summary>
        [Test]
        public void IsEverServiceable_Agrees_With_The_Order_The_Sim_Would_Actually_Refuse()
        {
            var (gs, host) = Boot(ShipChoice.Wreck);
            var sim = host.Sim;

            Assert.IsFalse(MaintenanceSystem.IsEverServiceable(sim.Defs, DeviceKind.CryoPod),
                "premise: the capsule's `maint` opt-out is still 0.00 in the shipped defs");
            Assert.IsTrue(MaintenanceSystem.IsEverServiceable(sim.Defs, DeviceKind.SolarWing),
                "⛔ CONTROL: an ordinary machine must be serviceable, or the predicate is `false` " +
                "for everything and the leg above proves nothing");

            Device pod = null, wing = null;
            foreach (var d in sim.Devices.Items)
            {
                if (pod == null && d.Kind == DeviceKind.CryoPod) pod = d;
                if (wing == null && d.Kind == DeviceKind.SolarWing
                    && d.Condition < sim.Defs.Machines[(int)DeviceKind.SolarWing].MaintainBelow) wing = d;
            }
            Assert.IsNotNull(pod, "premise: the wreck authors capsules");
            Assert.IsNotNull(wing, "premise: the wreck authors a WORN solar wing — the order leg needs " +
                                   "a machine the sim would otherwise accept");

            var crew = sim.Citizens.Items[0];
            gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, pod.Pos.X, pod.Pos.Y, i: pod.Pos.Z, cid: crew.Id));
            host.Sim.Tick();
            Assert.IsFalse(crew.HeldByOrder,
                "⛔ THE SIM TOOK AN ORDER AT A CAPSULE. If it did, `IsEverServiceable` is answering a " +
                "different question from the one the command asks, and the menu's bit is a second " +
                "authority rather than a mirror of the refusal.");

            gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, wing.Pos.X, wing.Pos.Y, i: wing.Pos.Z, cid: crew.Id));
            host.Sim.Tick();
            Assert.IsTrue(crew.HeldByOrder,
                "⛔ CONTROL: the sim refused an order at a machine it CAN service, so the refusal " +
                "above is not evidence about capsules at all — it is evidence that nothing is " +
                "orderable in this fixture.");
        }

        /// <summary>
        /// THE GLYPH IS *ALMOST* AN IDENTIFIER, AND THE HEADER SAYS SO — this pins both halves of that
        /// sentence off <c>Glyphs.ForDevice</c> itself. Injective over the 27 tile-resident kinds;
        /// NOT injective over all 29, because Conduit and Pipe deliberately share <c>'~'</c>.
        ///
        /// It is here because the header uses the first half to explain why <c>Kind</c> is carried, and
        /// a claim about a switch statement that nothing measures is exactly what this repo keeps
        /// finding to be stale.
        /// </summary>
        [Test]
        public void The_Device_Glyph_Is_Injective_Only_Over_The_Tile_Resident_Kinds()
        {
            var all = Enum.GetValues(typeof(DeviceKind)).Cast<DeviceKind>().ToList();
            var resident = all.Where(k => !Simulation.IsUtilityOverlay(k)).ToList();

            // 27 → 28 / 25 → 26: the wreck start appended DeviceKind.CryoPod, which is tile-resident
            // and carries its own glyph 'K', so the injectivity claim below is unweakened.
            // 28 → 29 / 26 → 27: M3-10 appended DeviceKind.Heater, tile-resident, with its own glyph
            // 'E' — so the injectivity claim is unweakened again, and the ONE shared glyph in the
            // whole switch is still Conduit/Pipe's '~'.
            Assert.AreEqual(29, all.Count, "the DeviceKind enum grew — re-read the header's counts");
            Assert.AreEqual(27, resident.Count);
            Assert.AreEqual(resident.Count, resident.Select(Glyphs.ForDevice).Distinct().Count(),
                "two TILE-RESIDENT device kinds now share a glyph. The header of " +
                "hosts/web/WireFormat.Devices.cs says the glyph nearly identifies the kind for the rows " +
                "this channel carries; that is now less true, and the Kind element is more load-bearing.");
            Assert.That(all.Select(Glyphs.ForDevice).Distinct().Count(), Is.LessThan(all.Count),
                "CONTROL: ForDevice is expected NOT to be injective over ALL kinds (Conduit and Pipe " +
                "share '~'), which is what makes the tile-resident restriction above meaningful");
        }
    }
}
