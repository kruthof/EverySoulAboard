using System;
using System.Collections.Generic;
using System.Globalization;
using Perilune.Sim;
using Perilune.Tui;      // SimHost
using Perilune.Tui.Ui;   // StockFilterModel (the TUI's pure pending-mask helpers)
using Perilune.Web;      // GameSession, WebCommand, CmdKind
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-5 — the FILTER VERB, host side. WP-2 shipped
    /// <see cref="SetStockpileFilterCommand"/> and the haul enforcement behind it; this package
    /// ships the only two surfaces a player can reach it through: the web client's
    /// <c>{"cmd":"filter","x":..,"y":..,"mask":N}</c> message, and the TUI's two-key pending mask.
    ///
    /// The load-bearing assertions here are about what happens to the wire value BEFORE it becomes
    /// a command — because both failure modes are SILENT:
    ///   * a negative mask widened with <c>(ulong)cmd.I</c> becomes every bit set, which
    ///     <see cref="StockZoneSystem.Accepts"/> reads as ACCEPT EVERYTHING — the exact inverse of
    ///     the restriction the message asked for, and permissive rather than broken;
    ///   * a bit above the last <see cref="ItemKind"/> changes no behaviour at all but IS folded by
    ///     <see cref="StockZoneSystem.StateChecksum"/>, so it would give two byte-different sims
    ///     that behave identically.
    ///
    /// GATES THAT DO NOT APPLY, stated so a reviewer does not score against gates this package
    /// cannot fail (lane plan §10, §2.5): WP-5 adds NO def scalar and edits nothing under
    /// <c>sim/</c>, so the def-field / defs-checksum gates are N/A and all four determinism pins are
    /// untouchable by construction. CULTURE IS ALSO N/A and deliberately not gated: the mask is an
    /// integer end to end — <c>WebCommand.Int</c> is a hand-rolled digit scanner with no
    /// <c>Parse</c>/<c>NumberFormatInfo</c>, <c>JSON.stringify</c> of a JS integer is culture-free,
    /// and the TUI parses nothing. There is no float and no locale surface anywhere in this package.
    ///
    /// Each test's doc names the one-line mutation that makes it fail.
    /// </summary>
    public class StockpileFilterVerbTests
    {
        private static (GameSession gs, SimHost host) Boot()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            return (gs, host);
        }

        /// <summary>First walkable tile on deck <paramref name="z"/>, in scan order; (-1,-1,z) if none.</summary>
        private static Int3 FirstWalkable(Simulation sim, int z)
        {
            for (int y = 0; y < sim.World.Height; y++)
                for (int x = 0; x < sim.World.Width; x++)
                {
                    var p = new Int3(x, y, z);
                    if ((sim.World.GetFlags(p) & TileFlags.Walkable) != 0) return p;
                }
            return new Int3(-1, -1, z);
        }

        // ------------------------------------------------------------------ the wire message

        /// <summary>
        /// The `filter` line decodes to x / y / mask. MUTATION: read the mask from <c>"on"</c>
        /// instead of <c>"mask"</c> in <c>WebCommand.Parse</c> (the copy-paste from the dig /
        /// stockpile / strip cases sitting directly above it) ⇒ <c>I == 0</c>, i.e. every filter
        /// click would silently mean ACCEPT NOTHING.
        /// </summary>
        [Test]
        public void Parse_Reads_The_Filter_Message_X_Y_And_Mask()
        {
            var cmd = WebCommand.Parse("{\"cmd\":\"filter\",\"x\":3,\"y\":4,\"mask\":8}");
            Assert.AreEqual(CmdKind.Filter, cmd.Kind);
            Assert.AreEqual(3, cmd.X);
            Assert.AreEqual(4, cmd.Y);
            Assert.AreEqual(8, cmd.I, "the mask rides on I, read from the \"mask\" key");

            // A zero mask is a REAL value (accept nothing), not an omission — and it must not be
            // confused with the sibling verbs' `on` flag.
            Assert.AreEqual(0, WebCommand.Parse("{\"cmd\":\"filter\",\"x\":1,\"y\":1,\"mask\":0}").I);
            Assert.AreEqual(CmdKind.Stockpile,
                WebCommand.Parse("{\"cmd\":\"stockpile\",\"x\":1,\"y\":1,\"on\":1}").Kind,
                "the E0-3 verb is untouched by the new case");

            // ...which is exactly why an ABSENT or non-numeric mask must NOT decode to 0: it takes
            // the -1 sentinel and dies on HandleFilter's negative guard instead.
            Assert.AreEqual(-1, WebCommand.Parse("{\"cmd\":\"filter\",\"x\":1,\"y\":1}").I,
                "a missing mask is 'not stated', never 'accept nothing'");
            Assert.AreEqual(-1, WebCommand.Parse("{\"cmd\":\"filter\",\"x\":1,\"y\":1,\"mask\":\"x\"}").I);

            // The sentinel is opt-in: every other verb's reader is byte-identical to what it was.
            Assert.AreEqual(0, WebCommand.Parse("{\"cmd\":\"dig\",\"x\":1,\"y\":1}").I,
                "the two-argument Int still answers 0 for an absent key");
            Assert.AreEqual(0, WebCommand.Parse("{\"cmd\":\"deck\"}").I);
        }

        /// <summary>
        /// A <c>filter</c> line with NO mask writes nothing at all. Same principle as the negative:
        /// what the protocol cannot express is dropped, not guessed at. MUTATION: decode the mask
        /// with the two-argument <c>Int(json, "mask")</c> ⇒ a missing key becomes 0, the bridge
        /// stores an ACCEPT-NOTHING filter, and a malformed line has silently told a zone to refuse
        /// every item on the ship — the most destructive available reading of a typo.
        /// </summary>
        [Test]
        public void AFilterMessageWithNoMaskIsDropped_NotReadAsAcceptNothing()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(WebCommand.Parse(
                "{\"cmd\":\"filter\",\"x\":" + pos.X.ToString(CultureInfo.InvariantCulture)
                + ",\"y\":" + pos.Y.ToString(CultureInfo.InvariantCulture) + "}"));
            host.Sim.Tick();

            Assert.AreNotEqual(0, host.Sim.World.GetFlags(pos) & TileFlags.Stockpile);
            Assert.IsFalse(host.Sim.StockZones.TryGetFilter(pos, out _),
                "no entry — the tile stays accept-all by absence");
        }

        // ------------------------------------------------------------------ the bridge

        /// <summary>
        /// The bridge lands the filter on the CURRENT deck, not deck 0. MUTATION: build the position
        /// with a literal <c>0</c> instead of <c>_deck</c> in <c>HandleFilter</c> ⇒ the filter is
        /// written to deck 0 while the zone is on deck 1, so <c>TryGetFilter</c> at the zoned tile
        /// returns false. (This is the same wrong-deck class the lane already measured once.)
        /// </summary>
        [Test]
        public void TheFilterBridgeEnqueuesSetStockpileFilterAtTheCURRENTDeck()
        {
            var (gs, host) = Boot();
            // Rule 3 — prove the branch is REACHABLE before scoring it. A one-deck ship could not
            // tell "lands on the current deck" from "lands on deck 0".
            Assert.Greater(host.Sim.World.Depth, 1, "the default ship has more than one deck");
            Assert.IsNotNull(host.Sim.StockZones, "the shipping stack registers a StockZoneSystem");

            Assert.IsTrue(gs.ApplyForTest(new WebCommand(CmdKind.Deck, i: 1)), "deck 0 → 1");
            var pos = FirstWalkable(host.Sim, 1);
            Assert.GreaterOrEqual(pos.X, 0, "deck 1 has a walkable tile to zone");

            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 0b0001000)); // Potato only
            host.Sim.Tick();

            Assert.AreNotEqual(0, host.Sim.World.GetFlags(pos) & TileFlags.Stockpile,
                "the presence bit landed on the zoned tile");
            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(pos, out ulong mask),
                "the filter landed on the SAME tile the zone did");
            Assert.AreEqual(8UL, mask);
            Assert.IsFalse(host.Sim.StockZones.TryGetFilter(new Int3(pos.X, pos.Y, 0), out _),
                "and nothing was written to deck 0");
        }

        /// <summary>
        /// A NEGATIVE mask is refused outright — no command is enqueued and no entry appears, so the
        /// tile stays accept-all BY ABSENCE. <c>WebCommand.Int</c> has an explicit sign branch, so a
        /// hand-crafted socket line can deliver one. MUTATION: delete the <c>if (cmd.I &lt; 0)
        /// return;</c> line ⇒ an entry appears and this test fails. Both shapes of the underlying
        /// bug are covered: with the canonicalising mask still in place -1 becomes 0x7F (accept
        /// everything), and with the naive <c>(ulong)cmd.I</c> the spec warns about it becomes
        /// <c>ulong.MaxValue</c> (accept everything, plus phantom bits in the hash). Either way
        /// "restrict this zone" has silently become "accept absolutely everything" — the inversion
        /// this guard exists for, which is why a negative is DROPPED rather than clamped to 0 or to
        /// AcceptAllMask: both of those invent an intent the protocol cannot express.
        /// </summary>
        [Test]
        public void ANegativeMaskIsRefusedOutright_NotWidenedIntoAcceptEverything()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            Assert.GreaterOrEqual(pos.X, 0, "deck 0 has a walkable tile to zone");

            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: -1));
            host.Sim.Tick();

            Assert.AreNotEqual(0, host.Sim.World.GetFlags(pos) & TileFlags.Stockpile,
                "the zone itself was still designated — only the malformed filter was dropped");
            Assert.IsFalse(host.Sim.StockZones.TryGetFilter(pos, out ulong mask),
                "a negative mask writes NO entry at all (mask read back: 0x"
                + mask.ToString("X", CultureInfo.InvariantCulture) + ")");
        }

        /// <summary>
        /// Bits above the last <see cref="ItemKind"/> are canonicalised away. Not cosmetics:
        /// <c>StockZoneSystem.StateChecksum</c> folds <c>AcceptMask</c> verbatim, so an undefined
        /// high bit perturbs HASHED state while changing no behaviour whatsoever — two byte-different
        /// sims that play identically. MUTATION: drop <c>&amp; AcceptAllMask</c> in
        /// <c>HandleFilter</c> ⇒ the stored mask is 0x1FF.
        /// </summary>
        [Test]
        public void BitsAboveTheLastItemKindAreCanonicalisedAway()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 0x1FF));
            host.Sim.Tick();

            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(pos, out ulong mask));
            Assert.AreNotEqual(0x1FFUL, mask, "the over-wide mask was NOT stored verbatim");
            Assert.AreEqual(GameSession.AcceptAllMask, mask);
            Assert.AreEqual(0UL, mask >> Enum.GetValues(typeof(ItemKind)).Length,
                "no bit above the last ItemKind survives into hashed state");
            // ONE REPRESENTATION PER MEANING, asserted rather than merely claimed: the hashed state
            // after the over-wide wire message is byte-identical to the hashed state the sim reaches
            // when the canonical mask is set directly. Without the canonicalisation these two
            // checksums differ while the two sims play identically.
            ulong viaWire = host.Sim.StockZones.StateChecksum();
            host.Sim.StockZones.SetFilter(host.Sim, pos, GameSession.AcceptAllMask);
            Assert.AreEqual(host.Sim.StockZones.StateChecksum(), viaWire,
                "the canonicalised entry hashes exactly as the directly-set canonical mask does");
        }

        /// <summary>
        /// The accept-all mask covers EVERY <see cref="ItemKind"/> and nothing else — that is what
        /// makes it a derived value rather than a copied 0x7F. Driven end to end: an over-wide wire
        /// mask is canonicalised by the host, stored by the sim, and then queried through the real
        /// <see cref="StockZoneSystem.Accepts"/> for every enum member.
        ///
        /// MUTATION: hard-code <c>internal static readonly ulong AcceptAllMask = 0x3FUL;</c> in
        /// <c>GameSession</c> (exactly what "one fewer kind than there really are" looks like) ⇒
        /// <c>ControllerModule</c> is rejected by a zone the player set to accept everything. A
        /// second mutation that bites the same way: <c>1UL &lt;&lt; (Length - 1)</c>.
        /// </summary>
        [Test]
        public void AcceptAllMaskIsDerivedFromItemKind_NotALiteral_AndAcceptsEveryKind()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 0x7FFF));
            host.Sim.Tick();

            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(pos, out ulong stored));
            Assert.AreEqual(GameSession.AcceptAllMask, stored);

            int kinds = 0;
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
            {
                kinds++;
                Assert.IsTrue(host.Sim.StockZones.Accepts(pos, k),
                    "a zone set to ACCEPT ALL must accept ItemKind." + k);
            }
            // ...and it sets exactly one bit per kind — no phantom bit, no missing one.
            int bits = 0;
            for (ulong m = stored; m != 0; m >>= 1) bits += (int)(m & 1UL);
            Assert.AreEqual(kinds, bits, "AcceptAllMask has exactly one bit per ItemKind");
        }

        // ------------------------------------------------------------------ TUI parity

        /// <summary>
        /// The TUI's pending mask toggles one kind at a time and describes itself. Mirrors the
        /// client's <c>toggleStockKind</c>. MUTATION: <c>mask ^ (ulong)kind</c> instead of
        /// <c>mask ^ (1UL &lt;&lt; kind)</c> ⇒ toggling Potato (3) off ACCEPT_ALL yields 124, not 119.
        /// </summary>
        [Test]
        public void StockFilterModel_Toggles_One_Kind_And_Describes_The_Pending_Mask()
        {
            ulong all = StockFilterModel.AcceptAllMask;
            ulong noPotato = StockFilterModel.Toggle(all, (int)ItemKind.Potato);

            Assert.AreEqual(all & ~(1UL << (int)ItemKind.Potato), noPotato);
            Assert.IsFalse(StockFilterModel.Accepts(noPotato, (int)ItemKind.Potato));
            Assert.IsTrue(StockFilterModel.Accepts(noPotato, (int)ItemKind.Scrap),
                "exactly ONE bit moved — the neighbouring kind is untouched");
            Assert.AreEqual(all, StockFilterModel.Toggle(noPotato, (int)ItemKind.Potato),
                "toggling twice returns to the starting mask");

            Assert.AreEqual("ALL", StockFilterModel.Describe(all));
            Assert.AreEqual("NOTHING", StockFilterModel.Describe(0UL));
            // The PLAYER-FACING vocabulary, identical to the web palette's — not ItemKind.ToString().
            Assert.AreEqual("FOOD", StockFilterModel.Describe(1UL << (int)ItemKind.Potato));
            Assert.AreEqual("FOOD · PARTS",
                StockFilterModel.Describe((1UL << (int)ItemKind.Potato) | (1UL << (int)ItemKind.Parts)));
        }

        /// <summary>
        /// The mask helpers are TOTAL: a kind the sim does not have changes nothing and is accepted
        /// by nothing. The trailing <c>&amp; AcceptAllMask</c> is NOT sufficient on its own, and this
        /// test exists because an earlier revision claimed it was: <b>C# shift counts are reduced
        /// modulo the operand width</b> (<c>&amp; 63</c> for a ulong), so <c>1UL &lt;&lt; 64</c> is
        /// <c>1UL</c> and the "out-of-range" bit wraps back INSIDE the valid range, where the mask
        /// cannot remove it.
        ///
        /// MUTATION: delete the <c>InRange(kind) ?</c> guard from <c>Toggle</c> ⇒
        /// <c>Toggle(0x7F, 64)</c> returns 0x7E, silently rejecting Regolith. Same for the
        /// <c>InRange(kind) &amp;&amp;</c> in <c>Accepts</c> ⇒ <c>Accepts(0x01, 64)</c> is true.
        /// 64 is the value that bites; 9 and -1 are truncated either way, which is exactly how the
        /// false claim survived its first test.
        /// </summary>
        [Test]
        public void StockFilterModel_IsTotal_ForKindsTheSimDoesNotHave()
        {
            ulong all = StockFilterModel.AcceptAllMask;
            int sixtyFour = 64;   // not a constant, so the shift is the RUNTIME one, not folded
            Assert.AreEqual(1UL, 1UL << sixtyFour,
                "C# really does reduce the shift count modulo 64 — this is why the guard is needed");

            foreach (int bad in new[] { 64, 71, 128, -1, -64, StockFilterModel.KindCount })
            {
                Assert.AreEqual(all, StockFilterModel.Toggle(all, bad),
                    "Toggle is a no-op for kind " + bad);
                Assert.IsFalse(StockFilterModel.Accepts(all, bad),
                    "no mask accepts kind " + bad);
                Assert.AreEqual("?", StockFilterModel.KindName(bad),
                    "an unreal kind has no name (the unguarded form returned the raw number)");
            }
            // Labels stay in step with the enum, or KindName would read off the end of the table.
            Assert.AreEqual(StockFilterModel.KindCount, StockFilterModel.Labels.Length);
        }

        /// <summary>
        /// The kind cursor wraps at the LAST REAL <see cref="ItemKind"/>: stepping it exactly
        /// <c>KindCount</c> times returns to where it started, and every kind it visits is a defined
        /// enum member. MUTATION: wrap at a literal 8 (<c>(kind + 1) % 8</c>) ⇒ the cycle is 8 long
        /// so it does not return to 0 after 7 steps, and it offers the player a kind 7 the sim has no
        /// name for.
        /// </summary>
        [Test]
        public void StockFilterModel_KindCursor_Wraps_At_The_Last_Real_ItemKind()
        {
            var defined = new HashSet<int>();
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind))) defined.Add((int)k);
            Assert.AreEqual(defined.Count, StockFilterModel.KindCount);

            var visited = new HashSet<int>();
            int cur = 0;
            for (int i = 0; i < StockFilterModel.KindCount; i++)
            {
                Assert.IsTrue(defined.Contains(cur), "the cursor never lands on a kind ItemKind lacks: " + cur);
                visited.Add(cur);
                cur = StockFilterModel.NextKind(cur);
            }
            Assert.AreEqual(0, cur, "the cursor returns to the first kind after exactly KindCount steps");
            Assert.AreEqual(defined, visited, "the cursor reaches every ItemKind and no other value");
        }
    }
}
