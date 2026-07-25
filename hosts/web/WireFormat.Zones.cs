using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>zones</c> CHANNEL — the two per-stockpile-tile facts that were genuinely absent from the
    /// wire (console-retirement plan §4.1 ii). A SIBLING PARTIAL of <see cref="WireFormat"/>, not an
    /// edit to it: <c>WireFormat</c> is a spine file (<c>CLAUDE.md</c>, integrator lane only) and
    /// WP-4 adds a method to it too, so the whole of this channel lands in a file no other lane
    /// touches and <c>WireFormat.cs</c>'s diff is the single token <c>partial</c>.
    /// <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.
    ///
    /// WHAT WAS MISSING, AND WHAT WAS NOT. Stockpile PRESENCE already rides every frame:
    /// <c>GlyphMapper.cs:82-85</c> recolours a designated / stockpiled / strip-marked tile into
    /// <c>GlyphColor.Designate</c>(15) / <c>.Stockpile</c>(16) / <c>.Deconstruct</c>(26) and those
    /// bytes travel as <c>cell[1]</c> of the <c>frame</c> channel. Both SVG surfaces currently discard
    /// the byte (that is WP-2's job, not this channel's), so nothing here duplicates it and NO new
    /// <see cref="Perilune.Glyph.GlyphColor"/> id is minted — <c>GlyphColor</c> is a spine file and is
    /// deliberately left alone (plan §5 gap 1). What a colour byte cannot carry, and this channel
    /// does, is:
    ///
    ///   1. THE PER-TILE ACCEPT MASK (E0-4 feedback gap 1). <c>controls.js:80-82</c> said it outright
    ///      — *"there is no wire channel for a filter"* — so a filtered stockpile tile was
    ///      indistinguishable from an unfiltered one on every surface, and a player who set "FOOD
    ///      only" had nowhere to see it.
    ///   2. THE UNREACHABLE BACK-OFF BIT (E0-4 feedback gap 3). E0-4 WP-7 fixed a haul livelock and,
    ///      as its own author recorded, traded expensive-and-visible for cheap-and-invisible: a zone
    ///      painted where no crew can reach now never fills, silently (<c>MECHANICS.md</c> §13.17).
    ///
    /// ONE channel, not two, because both facts are per-stockpile-tile and both feed the same badge.
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from authoritative state —
    /// <see cref="Perilune.Sim.TileFlags.Stockpile"/> (saved+hashed in the TILE chapter),
    /// <see cref="Perilune.Sim.StockZoneSystem"/> (SYSS-saved, 'ZONE'-folded) and
    /// <c>HaulJobSource</c>'s transient backoff scratch (never saved, never hashed). Nothing here
    /// mutates, allocates into the sim, or folds into any determinism hash, and on a ship that never
    /// zoned a stockpile the payload is <c>{"type":"zones","cells":[]}</c> — deduped by
    /// <c>GameSession.Send</c>, so it ships once and never again.
    ///
    ///   zones {"type":"zones","cells":[[x,y,deck,mask,flags],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo ZoneIc = CultureInfo.InvariantCulture;

        /// <summary><c>flags</c> bit 0 — a LIVE haul back-off sits on this stockpile tile: no hauler
        /// has managed to path to it recently (<c>HaulJobSource.IsBackedOff</c>).
        ///
        /// READ THE SEMANTICS HONESTLY. This is NOT "provably unreachable". The underlying map is a
        /// rate limiter with three lifts — a ≤5 s expiry, an outright removal on the first successful
        /// path, and a wholesale clear on ANY tile-board change — so the bit means *"recently, nobody
        /// got here"*, and it can drop the tick after a door opens or a wall comes down. A surface
        /// that renders it as a permanent verdict is over-claiming; the alternative (a real
        /// reachability query per tile per render) is a sim change and out of scope. The client
        /// mirrors this constant as <c>ZONE_FLAG_BACKED_OFF</c> in <c>client/src/wire/messages.js</c>,
        /// and <c>client/test/zone-model.test.js</c> parses THIS file to pin that the two agree.</summary>
        public const int ZoneFlagBackedOff = 1;

        /// <summary>
        /// One stockpile tile on the <c>zones</c> channel. Tuple
        /// <c>[x, y, deck, mask, flags]</c>, append-only (a future field is a trailing element).
        ///
        /// <para><see cref="AcceptMask"/> is the EFFECTIVE mask: bit <c>k</c> set ⇒ the tile accepts
        /// <see cref="Perilune.Sim.ItemKind"/> <c>k</c>. A tile with no
        /// <see cref="Perilune.Sim.StockZoneSystem"/> entry is accept-all and ships
        /// <see cref="Perilune.Sim.StockZoneSystem.AcceptAllMask"/> rather than 0 or a sentinel — the
        /// client then decides "restricted" by comparing against its own derived accept-all constant,
        /// with no special case for absence and no second spelling of "everything".</para>
        ///
        /// <para><see cref="Flags"/> is a bitfield; today only <see cref="ZoneFlagBackedOff"/> is
        /// defined. A bitfield rather than a bool because gap 3 is the first of several per-tile
        /// diagnostics the surface will want, and a widened int costs nothing.</para>
        /// </summary>
        public readonly struct ZoneTile
        {
            public readonly int X, Y, Deck;
            public readonly ulong AcceptMask;
            public readonly int Flags;

            public ZoneTile(int x, int y, int deck, ulong acceptMask, int flags)
            { X = x; Y = y; Deck = deck; AcceptMask = acceptMask; Flags = flags; }
        }

        /// <summary>
        /// Serialize the sparse stockpile-zone layer: one entry per tile carrying
        /// <see cref="Perilune.Sim.TileFlags.Stockpile"/>, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS. This method sorts nothing — <c>GameSession</c>
        /// walks the world <c>z, y, x</c> (the <c>IJobSource</c> rule-3 scan order, and the
        /// same walk <c>BuildMaterials</c> uses) so the emission order is a function of world geometry
        /// alone. Neither of the two sources consulted per tile is ever ENUMERATED: the filter comes
        /// from a keyed <c>TryGetFilter</c> and the back-off bit from a keyed
        /// <c>HaulJobSource.IsBackedOff</c>, so no <c>Dictionary</c>/<c>HashSet</c> layout can leak
        /// into the bytes on the socket. That is the whole reason the exposure is a lookup and not an
        /// <c>IEnumerable</c>.
        ///
        /// <see cref="ZoneTile.AcceptMask"/> is written as a JSON number. HONEST LIMIT, pinned by
        /// <c>ZonesChannelTests.AcceptMask_StaysInsideTheJsonSafeIntegerRange</c>: JavaScript numbers
        /// are exact only to 2^53−1, so a mask with a bit at 53 or above would lose precision in the
        /// browser. <see cref="Perilune.Sim.StockZoneSystem.SetFilter"/> masks every stored value down
        /// to <c>AcceptAllMask</c>, which covers only DECLARED <see cref="Perilune.Sim.ItemKind"/>s
        /// (7 today ⇒ 0x7F), so this is safe until the enum passes 53 members — at which point the
        /// tuple needs a string or a hi/lo pair, and the pinned test is what will say so.
        ///
        /// InvariantCulture on every number (its own <see cref="ZoneIc"/>, so this file is readable in
        /// isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Zones(IReadOnlyList<ZoneTile> cells)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"zones\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.X.ToString(ZoneIc))
                      .Append(',').Append(c.Y.ToString(ZoneIc))
                      .Append(',').Append(c.Deck.ToString(ZoneIc))
                      .Append(',').Append(c.AcceptMask.ToString(ZoneIc))
                      .Append(',').Append(c.Flags.ToString(ZoneIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
