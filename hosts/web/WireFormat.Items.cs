using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>items</c> CHANNEL — the ground item stacks, read from <see cref="Perilune.Sim.ItemStack"/>
    /// itself instead of from the projected glyph. A SIBLING PARTIAL of <see cref="WireFormat"/>, not
    /// an edit to it: <c>WireFormat</c> is a spine file (<c>CLAUDE.md</c>, integrator lane only), and
    /// the <c>zones</c> channel already paid the one-token <c>partial</c> cost, so this file is a PURE
    /// ADDITION and <c>WireFormat.cs</c> has NO DIFF AT ALL.
    /// <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// WHAT WAS WRONG, PRECISELY — AND IT IS THREE SEPARATE LOSSES, NOT ONE.
    ///
    /// A ground item stack reached both SVG surfaces as ONE CHARACTER: <c>GlyphMapper</c> pass 3
    /// (<c>sim/Sim.Glyph/GlyphMapper.cs</c>) writes <c>Glyphs.ForItem(item.Kind)</c> into the tile's
    /// glyph byte. That single byte cannot carry, and did not carry:
    ///
    ///   1. THE COUNT. <see cref="Perilune.Sim.ItemStack.Count"/> reaches the character not at all, so
    ///      a stack of 1 and a stack of 40 write the IDENTICAL cell. The client could not render stack
    ///      size because the number was never on the wire. (Measured in
    ///      <c>ItemsChannelTests.A_Stack_Of_One_And_A_Stack_Of_Forty_Project_Identically_But_The_Channel_Carries_The_Count</c>: the two
    ///      <c>GlyphCell</c>s compare equal on glyph, fg, bg and attr.)
    ///   2. EVERY STACK BUT THE LAST. Pass 3 assigns <c>dst[p.X, p.Y] = …</c> per item, so N stacks on
    ///      one tile collapse to whichever is last in store order — and stacks are NEVER MERGED
    ///      (<c>EntityStore.Items</c> is a plain <c>List</c>; nothing in the sim folds two stacks of one
    ///      kind together), so this is the ordinary state of any tile a hauler has filled twice.
    ///   3. ANYTHING SHARING A TILE WITH A DEVICE. Pass 4 writes the device glyph to the same cell
    ///      UNCONDITIONALLY, AFTER pass 3. Every device kind is non-blocking
    ///      (<c>content/core/SimDefs/machines.def</c>, <c>blocks = false</c> in all 26 rows), so a
    ///      device tile is walkable, haulable-to and zonable — and an item on one was simply invisible.
    ///
    /// This is the same class of defect the <c>marks</c> channel was built for, and the recorded lesson
    /// is the same: THE FIX IS A CHANNEL, NOT A BETTER READER. Nothing downstream of
    /// <c>GlyphMapper</c> can recover a number the projection never wrote.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// ⚠️ CARRIED STACKS ARE NOT ON THIS CHANNEL, and the reason is not "because pass 3 skips them".
    ///
    /// <see cref="Perilune.Sim.ItemStack.CarriedBy"/> non-zero means the stack rides a carrier, and
    /// <c>Pos</c> then MIRRORS THE CARRIER — it is not a place the item is, it is a place the person
    /// is. Emitting those rows would:
    ///   • draw a pile on top of a walking crew member and make it teleport across the deck each tick,
    ///     which is a claim about the world that is false;
    ///   • DOUBLE-COUNT during every haul. The channel is what a surface answers "what is stored here?"
    ///     with, and a hauler's load is in transit, not stored. A stockpile would appear to gain its
    ///     contents the moment a crew member picked them up somewhere else.
    /// A carried stack is a fact about a PERSON and belongs on a person-shaped channel (roster /
    /// the deferred Persona window), not on a tile layer. <c>GlyphMapper</c> pass 3 makes the same
    /// call for the same reason; this channel agrees with it deliberately rather than by inheritance,
    /// which is why the argument is written out. It is pinned by
    /// <c>ItemsChannelTests.A_Carried_Stack_Is_Not_On_The_Channel</c>.
    ///
    /// FOG-GATED, mirroring <c>GlyphMapper</c> pass 3 (whose gate is pass 1's, and is FIRST). An item
    /// on a tile with no <see cref="Perilune.Sim.TileFlags.Explored"/> emits nothing: a channel that
    /// shipped it would turn a rendering fix into a fog-of-war change, which is the same line
    /// <c>marks</c> drew and for the same reason.
    ///
    /// ONE ROW PER STACK, NOT PER TILE-AND-KIND. The host does NO arithmetic: it does not sum, merge
    /// or sort. Two stacks of Regolith on one tile ship as two rows. That is deliberate —
    /// summing host-side would put a number on the wire that exists nowhere in the sim, and the first
    /// consumer that wants stack granularity (a "what is reserved here" readout; anything reasoning
    /// about <see cref="Perilune.Sim.ItemStack.ReservedBy"/>) would have to add a second channel to get
    /// it back. Aggregation for DISPLAY is a display decision and is made in the client
    /// (<c>client/src/ui/room-model.js</c>, <c>roomItemTiles</c>).
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state that is already saved
    /// and hashed (the ITEM chapter's kind/count/pos/carrier, the TILE chapter's Explored flag).
    /// Nothing here mutates, allocates into the sim, mints a <see cref="Perilune.Glyph.GlyphColor"/> id
    /// (<c>GlyphColor</c> is a spine file and is untouched) or folds into any determinism hash.
    ///
    ///   items {"type":"items","cells":[[x,y,deck,kind,count],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo ItemIc = CultureInfo.InvariantCulture;

        /// <summary>
        /// One ground item stack on the <c>items</c> channel. Tuple <c>[x, y, deck, kind, count]</c>,
        /// append-only (a future field is a trailing element, exactly as <see cref="ZoneTile"/> and
        /// <see cref="MarkCell"/> document).
        ///
        /// <para>THE TUPLE LEADS WITH <c>x, y, deck</c> because every other sparse channel does
        /// (<c>materials</c>, <c>zones</c>, <c>marks</c>) and one decoder shape across four channels is
        /// worth more than matching any one description of the payload. The charter for this package
        /// wrote it "deck, x, y"; that is the same five facts in a different order, and agreeing with
        /// the three shipped siblings wins.</para>
        ///
        /// <para><see cref="Kind"/> is the raw <see cref="Perilune.Sim.ItemKind"/> byte. It is NOT
        /// re-declared here as a set of <c>const int</c>s the way <see cref="MarkDebris"/> and friends
        /// are, and that difference is deliberate: the mark kinds are a WIRE vocabulary invented by
        /// that channel, whereas these are the sim's own enum, which the client already mirrors ONCE
        /// in <c>client/src/ui/stock-filter-model.js</c> (<c>STOCK_KINDS</c>) — pinned member-for-member
        /// against <c>sim/Sim.Core/Entities/ItemStack.cs</c> by <c>stock-filter-model.test.js</c>. A
        /// second declaration here would be a hand mirror of a hand mirror, which is the exact shape
        /// the device-sprite package spent a lane removing.</para>
        ///
        /// <para><see cref="Count"/> is <see cref="Perilune.Sim.ItemStack.Count"/> verbatim. It is the
        /// one fact on this tuple that NO projection byte could ever have carried.</para>
        /// </summary>
        public readonly struct ItemCell
        {
            public readonly int X, Y, Deck, Kind, Count;

            public ItemCell(int x, int y, int deck, int kind, int count)
            { X = x; Y = y; Deck = deck; Kind = kind; Count = count; }
        }

        /// <summary>
        /// Serialize the sparse ground-item layer: one entry per stack, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS — same contract as <see cref="Zones"/> and
        /// <see cref="Marks"/>. This method sorts nothing. <c>GameSession.BuildItems</c> walks
        /// <c>sim.Items.Items</c> in STORE ORDER, which is the same order <c>GlyphMapper</c> pass 3
        /// walks and is a plain <c>List</c> — index order, never a hash container's layout — so no
        /// dictionary iteration can reach the socket. It is also part of the saved, hashed state, so
        /// two runs of one seed emit the same bytes.
        ///
        /// InvariantCulture on every number (its own <see cref="ItemIc"/>, so this file is readable in
        /// isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Items(IReadOnlyList<ItemCell> cells)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"items\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.X.ToString(ItemIc))
                      .Append(',').Append(c.Y.ToString(ItemIc))
                      .Append(',').Append(c.Deck.ToString(ItemIc))
                      .Append(',').Append(c.Kind.ToString(ItemIc))
                      .Append(',').Append(c.Count.ToString(ItemIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
