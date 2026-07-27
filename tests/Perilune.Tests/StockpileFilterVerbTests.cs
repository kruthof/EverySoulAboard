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
        /// sims that play identically.
        ///
        /// WHY THE WIRE VALUE IS 0x1F3 AND NOT 0x1FF — the wp5 × wp6 interaction. As written on the
        /// WP-5 branch this test sent <c>0x1FF</c>, whose canonical form is <c>0x7F</c>, i.e. exactly
        /// <see cref="StockZoneSystem.AcceptAllMask"/>. WP-6 then made an accept-EVERYTHING mask store
        /// NO entry (<c>SetFilter</c> collapses it to <c>ClearFilter</c>, so that
        /// <c>HaulJobSource</c>'s <c>Zones.Count &gt; 0</c> fast path stays reachable on a ship that
        /// restricts nothing), and the "an entry is stored" assertion started failing. Nothing is
        /// wrong with either package: the canonicalisation this test names still happens, it is just
        /// no longer OBSERVABLE through a mask whose canonical form is accept-all, because that mask's
        /// correct resting state is now absence. So the wire value moved to <c>0x1F3</c> — high bits
        /// 7 and 8 set, and a canonical form of <c>0x73</c> (Regolith · MetalOre · Scrap · Parts ·
        /// ControllerModule; Corpse and Potato refused) which is a REAL restriction and therefore a
        /// real stored entry. The second row below pins the collapse case that used to be row one.
        ///
        /// THE THREE ROWS AND THE MUTATION EACH ONE ANSWERS FOR. Measured full-suite, not asserted:
        ///
        ///  1. VIA THE WIRE (0x1F3 ⇒ stored 0x73). Bitten by NO single-site deletion of the
        ///     canonicalisation, and this is stated because an earlier revision of this comment
        ///     claimed otherwise four lines above its own refutation. Deleting
        ///     <c>mask &amp;= AcceptAllMask</c> from <see cref="StockZoneSystem.SetFilter"/> leaves this
        ///     row GREEN, because <c>HandleFilter</c> already masked; deleting <c>HandleFilter</c>'s
        ///     leaves it green too, because <c>SetFilter</c> masks. Row 1 pins the end-to-end outcome
        ///     the player gets, and rows 2–3 are what make the individual doors answerable.
        ///  2. DIRECT TO THE SIM DOOR (<c>SetFilter(0x1F3)</c> on a second host, bypassing the bridge
        ///     entirely) ⇒ stored 0x73, and the SAME hashed state as row 1 reached through the wire.
        ///     MUTATION: delete <c>mask &amp;= AcceptAllMask;</c> from <see cref="StockZoneSystem.SetFilter"/>
        ///     ⇒ this row stores 0x1F3, and the checksum equality — one representation per meaning,
        ///     whichever door the mask arrives through — breaks. This is the row that makes the file
        ///     bite the sim door on its own.
        ///  3. THE COLLAPSE (a real restriction, then an accept-all repaint over it). Two mutations,
        ///     and the second is the one that matters: replace the collapse body with a bare
        ///     <c>return;</c> ⇒ the stale restriction SURVIVES the accept-all repaint, which is the
        ///     live player-facing bug (a zone restricted once and re-painted unrestricted silently
        ///     keeps refusing, with no UI anywhere that could reveal it). Delete the collapse line
        ///     outright ⇒ an entry appears where absence is required. A row that only painted
        ///     accept-all onto a tile with no prior entry would catch the second and NOT the first,
        ///     because <c>ClearFilter</c> on an entry-less tile is a no-op — indistinguishable from
        ///     "never stored" and from "never arrived". Hence the restriction is painted first and
        ///     asserted to have landed.
        ///
        /// HONEST LIMIT on <c>GameSession.HandleFilter</c>'s own <c>&amp; AcceptAllMask</c>: it is
        /// redundant for stored state, and therefore un-bitable there, **while the two derivations
        /// agree** — <c>GameSession.AcceptAllMask</c> is count-based
        /// (<c>(1UL &lt;&lt; Enum.GetValues(typeof(ItemKind)).Length) - 1</c>) and
        /// <see cref="StockZoneSystem.AcceptAllMask"/> is per-enum-VALUE, so they coincide only while
        /// <see cref="ItemKind"/> is contiguous from 0. Add a kind 9 with 7 and 8 undefined and they
        /// diverge, at which point the host mask is load-bearing again and its deletion is observable.
        /// That divergence condition is itself pinned, by
        /// <c>StockZoneSystemTests.AcceptAllMask_MatchesTheHostsCountBasedDerivation_WhichNeedsItemKindContiguous</c>.
        /// The real resolution is to make every site consume
        /// <see cref="StockZoneSystem.AcceptAllMask"/>, after which the host line is provably the same
        /// operation and can simply be deleted — LOGGED, not done here (it touches three host files
        /// and is outside this fix's remit).
        /// </summary>
        [Test]
        public void BitsAboveTheLastItemKindAreCanonicalisedAway()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 0x1F3));
            host.Sim.Tick();

            // 0x17F, not 0x7F: ItemKind gained Ice = 8 and left a hole at 7 (E0-7). Still spelled as
            // the operation rather than as its result, so the expectation cannot silently absorb a
            // change in what the sim considers canonical.
            const ulong canonical = 0x1F3UL & 0x17FUL;
            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(pos, out ulong mask),
                "a real restriction stores a real entry");
            Assert.AreNotEqual(0x1F3UL, mask, "the over-wide mask was NOT stored verbatim");
            Assert.AreEqual(canonical, mask);
            // Per-BIT, not a single shift: with a hole in the enum "above the last kind" is no longer
            // the same thing as "not a declared kind", and the shift form would have let bit 7 — a
            // kind that does not exist — through unnoticed.
            ulong declared = 0;
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind))) declared |= 1UL << (int)k;
            Assert.AreEqual(0UL, mask & ~declared,
                "no bit belonging to an undeclared ItemKind survives into hashed state");
            Assert.AreNotEqual(0UL, mask & (1UL << (int)ItemKind.Ice),
                "...and a bit belonging to a REAL kind above the member count is KEPT");
            Assert.IsFalse(host.Sim.StockZones.Accepts(pos, ItemKind.Potato),
                "and the restriction the player asked for is really in force — the canonicalisation " +
                "removed only the undefined bits, not a meaningful one");

            // ROW 2 — THE SIM DOOR, ON ITS OWN. The same over-wide value handed straight to
            // StockZoneSystem.SetFilter on a fresh host, with GameSession's bridge (and its own mask)
            // out of the picture entirely, so this row is answerable by the sim's canonicalisation and
            // nothing else. ONE REPRESENTATION PER MEANING is then a real comparison rather than a
            // tautology: two sims that were told the same thing through DIFFERENT doors must reach
            // byte-identical hashed state. (The previous revision of this row re-set the entry on the
            // SAME host to the value the assertion above had just pinned, which could not fail.)
            var (_, direct) = Boot();
            direct.Sim.StockZones.SetFilter(direct.Sim, pos, 0x1F3UL);
            Assert.IsTrue(direct.Sim.StockZones.TryGetFilter(pos, out ulong straight),
                "the sim door stores the entry");
            Assert.AreEqual(canonical, straight,
                "StockZoneSystem.SetFilter canonicalises on its own — with no host in front of it");
            Assert.AreEqual(direct.Sim.StockZones.StateChecksum(), host.Sim.StockZones.StateChecksum(),
                "0x1F3 through the wire bridge and 0x1F3 through the sim door must land in the SAME "
                + "hashed state — one representation per meaning, whichever door it arrives through");

            // ROW 3 — THE COLLAPSE, OVER A LIVE RESTRICTION. A real filter is painted and asserted to
            // have landed FIRST, so the accept-all repaint below has something to remove: that is what
            // separates "collapsed" from "never stored" and makes a `return;`-instead-of-ClearFilter
            // mutation observable. This is also the player's actual sequence — restrict a zone, then
            // change your mind — and the case in which a surviving stale mask is a silent bug.
            var second = FirstWalkable(host.Sim, 1);
            Assert.GreaterOrEqual(second.X, 0, "deck 1 has a walkable tile to zone");
            Assert.IsTrue(gs.ApplyForTest(new WebCommand(CmdKind.Deck, i: 1)), "deck 0 → 1");
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, second.X, second.Y, i: 1));
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, second.X, second.Y,
                i: 1 << (int)ItemKind.Potato));
            host.Sim.Tick();

            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(second, out ulong restricted),
                "precondition: a REAL restriction is live on the tile before the accept-all repaint — "
                + "without it ClearFilter is a no-op and this row could not tell a collapse from a "
                + "tile that never had an entry");
            Assert.AreEqual(1UL << (int)ItemKind.Potato, restricted);
            Assert.IsFalse(host.Sim.StockZones.Accepts(second, ItemKind.Scrap),
                "precondition: and the restriction really refuses a kind");

            gs.ApplyForTest(new WebCommand(CmdKind.Filter, second.X, second.Y, i: 0x1FF));
            host.Sim.Tick();

            Assert.IsFalse(host.Sim.StockZones.TryGetFilter(second, out ulong wide),
                "0x1FF canonicalises to AcceptAllMask, and an accept-all paint REMOVES the entry — a "
                + "collapse that merely returned would leave the stale restriction in place "
                + "(mask read back: 0x" + wide.ToString("X", CultureInfo.InvariantCulture) + ")");
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
                Assert.IsTrue(host.Sim.StockZones.Accepts(second, k),
                    "and absence means accept-all, so the zone now takes ItemKind." + k);
        }

        /// <summary>
        /// The accept-all mask covers EVERY <see cref="ItemKind"/> and nothing else — that is what
        /// makes it a derived value rather than a copied 0x7F. Driven end to end: an over-wide wire
        /// mask is canonicalised by the host, taken by the sim, and then queried through the real
        /// <see cref="StockZoneSystem.Accepts"/> for every enum member.
        ///
        /// WHAT "ACCEPTED BY THE SIM" MEANS SINCE WP-6 — the wp5 × wp6 interaction. This test was
        /// written on the WP-5 branch and asserted that the paint left a STORED entry equal to
        /// <see cref="GameSession.AcceptAllMask"/>. WP-6 then made accept-everything the ABSENT entry
        /// (<c>SetFilter</c> collapses it, keeping <c>HaulJobSource</c>'s <c>Zones.Count &gt; 0</c>
        /// fast path off on a ship that restricts nothing), so the entry assertion started failing
        /// while the property this test is actually named for — every kind is accepted — went on
        /// holding, by absence instead of by a stored mask. The player-facing promise is unchanged and
        /// it is still asserted end to end through <see cref="StockZoneSystem.Accepts"/>; only the
        /// representation assertion moved, and it is now asserted in WP-6's terms (no entry at all).
        ///
        /// THE RESTRICTION IS PAINTED FIRST, DELIBERATELY. An accept-all paint onto a tile that never
        /// had an entry is satisfied by the feature doing nothing at all: <c>ClearFilter</c> on an
        /// entry-less tile is a no-op, so "no entry afterwards" would be equally true of a collapse, of
        /// a paint that never arrived, and of a collapse that merely <c>return</c>s. Painting a real
        /// restriction first and asserting it landed turns the row into a statement about REMOVAL, and
        /// removal is the thing the player depends on (restrict a zone, change your mind, and the old
        /// restriction must not quietly survive).
        ///
        /// MUTATIONS, each measured full-suite:
        ///   * hard-code <c>internal static readonly ulong AcceptAllMask = 0x3FUL;</c> in
        ///     <c>GameSession</c> (what "one fewer kind than there really are" looks like) ⇒ the paint
        ///     stores a real 0x3F entry so the removal row fails, <c>ControllerModule</c> is rejected by
        ///     a zone the player set to accept everything, and the bit count is 6 against 7 kinds.
        ///     <c>1UL &lt;&lt; (Length - 1)</c> bites all three the same way.
        ///   * replace <see cref="StockZoneSystem.SetFilter"/>'s collapse body with a bare
        ///     <c>return;</c> ⇒ the Potato restriction survives the accept-all repaint: the removal row
        ///     fails and the accept-every-kind loop fails on the first refused kind. This is the
        ///     mutation the previous revision of this test could NOT catch.
        /// </summary>
        [Test]
        public void AcceptAllMaskIsDerivedFromItemKind_NotALiteral_AndAcceptsEveryKind()
        {
            var (gs, host) = Boot();
            var pos = FirstWalkable(host.Sim, 0);
            gs.ApplyForTest(new WebCommand(CmdKind.Stockpile, pos.X, pos.Y, i: 1));

            // A REAL RESTRICTION FIRST, so the accept-all paint below has something to remove. Without
            // it the collapse is a no-op on an entry-less tile and the "no entry" assertion cannot tell
            // a collapse from a paint that never arrived — nor catch a collapse that merely `return`s
            // and leaves the player's old restriction silently in force.
            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 1 << (int)ItemKind.Potato));
            host.Sim.Tick();
            Assert.IsTrue(host.Sim.StockZones.TryGetFilter(pos, out ulong before),
                "precondition: a restriction is live on the tile");
            Assert.AreEqual(1UL << (int)ItemKind.Potato, before);
            Assert.IsFalse(host.Sim.StockZones.Accepts(pos, ItemKind.ControllerModule),
                "precondition: and it really refuses the kind the accept-all paint must restore");

            gs.ApplyForTest(new WebCommand(CmdKind.Filter, pos.X, pos.Y, i: 0x7FFF));
            host.Sim.Tick();

            // WP-6: accept-everything is the absent entry. A mask that is one bit SHORT of accept-all
            // is a restriction and would be stored — which is exactly how the mutations named above
            // announce themselves here.
            Assert.IsFalse(host.Sim.StockZones.TryGetFilter(pos, out ulong stored),
                "a paint that accepts every ItemKind REMOVES the entry (mask read back: 0x"
                + stored.ToString("X", CultureInfo.InvariantCulture) + ")");

            int kinds = 0;
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
            {
                kinds++;
                Assert.IsTrue(host.Sim.StockZones.Accepts(pos, k),
                    "a zone set to ACCEPT ALL must accept ItemKind." + k);
            }
            // ...and the host's derived mask sets exactly one bit per kind — no phantom bit, no
            // missing one. Read off GameSession.AcceptAllMask itself, since the sim now stores nothing.
            int bits = 0;
            for (ulong m = GameSession.AcceptAllMask; m != 0; m >>= 1) bits += (int)(m & 1UL);
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

            // 7 is the interesting one after E0-7: it is BELOW the member count and still does not
            // exist (the slot is reserved for E0-6's Seals), so a guard written as "kind < KindCount"
            // would wave it through. KindCount itself is no longer a safe stand-in for "unreal" —
            // ItemKind.Ice IS 8 — which is why it is asserted reachable in the positive control below.
            foreach (int bad in new[] { 7, 64, 71, 128, -1, -64, 9 })
            {
                Assert.AreEqual(all, StockFilterModel.Toggle(all, bad),
                    "Toggle is a no-op for kind " + bad);
                Assert.IsFalse(StockFilterModel.Accepts(all, bad),
                    "no mask accepts kind " + bad);
                Assert.AreEqual("?", StockFilterModel.KindName(bad),
                    "an unreal kind has no name (the unguarded form returned the raw number)");
            }
            // POSITIVE CONTROL: every DECLARED kind is reachable, named and toggleable. Without it the
            // loop above is satisfied by a model that rejects everything.
            foreach (ItemKind k in Enum.GetValues(typeof(ItemKind)))
            {
                Assert.IsTrue(StockFilterModel.Accepts(all, (int)k), "accept-all accepts " + k);
                Assert.AreNotEqual("?", StockFilterModel.KindName((int)k), k + " has a player-facing name");
                Assert.AreNotEqual(all, StockFilterModel.Toggle(all, (int)k), "Toggle really flips " + k);
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
