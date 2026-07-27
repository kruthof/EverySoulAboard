using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>marks</c> CHANNEL — the debris/dig/stockpile/strip mark layer, fed from AUTHORITATIVE
    /// STATE instead of from the projected <c>cell[1]</c> foreground byte. A SIBLING PARTIAL of
    /// <see cref="WireFormat"/>, not an edit to it: <c>WireFormat</c> is a spine file (<c>CLAUDE.md</c>,
    /// integrator lane only) and WP-3 already paid the one-token <c>partial</c> cost for the
    /// <c>zones</c> channel, so this file is a PURE ADDITION and <c>WireFormat.cs</c> has no diff at
    /// all. <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// ⚠️ THE NAME. THIS IS THE CHANNEL <c>docs/HANDOVER.md</c> §4g/§4i/§4j AND THE START-HERE BLOCK
    /// ALL CALL "THE <c>designations</c> CHANNEL". A grep for <c>designations</c> should land here.
    /// It is called <c>marks</c> and it carries FOUR kinds, and both halves of that are deliberate:
    ///
    ///   • DEBRIS IS NOT A DESIGNATION. It is terrain — a collapsed tile nobody has ordered anything
    ///     about. Naming the channel <c>designations</c> would make the name a lie for a quarter of
    ///     its payload, and (worse) would invite a later reader to assume every cell on it represents
    ///     player intent, which is exactly the kind of assumption that turns into a bug.
    ///   • SPLITTING DEBRIS OFF INTO A SECOND CHANNEL would leave the client's mark layer with TWO
    ///     sources forever — one from a channel, one from <c>cell[1]</c> — and having two sources for
    ///     one layer IS THE DEFECT THIS PACKAGE EXISTS TO REMOVE. One layer, one source.
    ///
    /// The client's own vocabulary already calls all four of them "marks"
    /// (<c>client/src/ui/mark-overlay.js</c>, WP-2, shared by both surfaces), so the channel is named
    /// after the thing it feeds rather than after three quarters of it.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// WHAT WAS WRONG, PRECISELY. <c>GlyphMapper.Project</c> writes the mark colour into a tile's fg
    /// byte in PASS 1 and then OVERWRITES that byte in pass 3 (ground item stacks), pass 4
    /// (grid-resident devices) and pass 5 (living citizens). Both modern SVG surfaces derived their
    /// whole mark layer from that byte, so on <c>--ship grid</c>:
    ///
    ///   1. a crew member crossing a condemned tile made its ✕ BLINK OUT AND BACK (pass 5), and the
    ///      grid crew cluster in the hold at roughly x25-32 y15-16 — exactly where the dig
    ///      designations are;
    ///   2. an item stored on a stockpile tile ERASED that tile's tint (pass 3) — i.e. the normal
    ///      state of a WORKING stockpile;
    ///   3. a device standing on a dig or stockpile tile HID that mark (pass 4). Every device kind is
    ///      non-blocking (<c>content/core/SimDefs/machines.def</c>, <c>blocks = false</c> in all 26
    ///      rows), so device tiles are walkable and zonable.
    ///
    /// A narrow exception was added to pass 4 for the strip case only (<c>GlyphMapper.cs</c>, the
    /// <c>anyStrip</c> re-apply) after the owner reported the invisible device strip THREE times.
    /// This channel is the general fix that exception's own comment names as the known-better one:
    /// it does not ride the projection at all, so no later pass can reach it.
    ///
    /// SOURCES — ONE PER KIND, all authoritative, all read-only:
    ///   dig        <see cref="Perilune.Sim.TileFlags.Designated"/>
    ///   stockpile  <see cref="Perilune.Sim.TileFlags.Stockpile"/>
    ///   strip      <see cref="Perilune.Sim.DeconstructSystem"/>'s pending registry (NOT a tile flag)
    ///   debris     the terrain planes (<c>Wall</c>/<c>Floor</c> == <see cref="Perilune.Sim.TileDefs.Debris"/>)
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// ⚠️ PRECEDENCE — dig ▸ strip ▸ stockpile ▸ debris. AN ORDER OUTRANKS A ZONE.
    ///
    /// THE PARAGRAPH THAT STOOD HERE WAS FALSE IN BOTH ITS HALVES AND IS KEPT QUOTED, because it is
    /// the sentence that hid a live regression through implementation AND independent review:
    ///
    ///   *"PRECEDENCE IS `GlyphMapper` PASS 1'S, DELIBERATELY AND EXACTLY — dig ▸ stockpile ▸ strip ▸
    ///   debris. The first three cannot legally coexist on one tile (dig marks only a Debris wall,
    ///   stockpile only a walkable tile, strip only a standing wall or a device), so the ordering only
    ///   ever decides a corrupt-state tile; keeping it identical to the projection means this channel
    ///   cannot come to disagree with the frame about what a tile IS, only about whether a passer-by
    ///   is standing on it."*
    ///
    /// (1) "CANNOT LEGALLY COEXIST" IS FALSE, and trivially so. **STOCKPILE AND STRIP COEXIST**: every
    ///     device kind is non-blocking, so a device stands on a WALKABLE tile, which
    ///     <see cref="Perilune.Sim.DesignateStockpileCommand"/> will zone and
    ///     <see cref="Perilune.Sim.DeconstructSystem.CanDesignate"/> will condemn. Two ordinary player
    ///     clicks. Under the old ranking that tile shipped <c>stockpile</c>, the Room Zoom's mark layer
    ///     SKIPS the stockpile kind on purpose (the <c>zones</c> channel owns that tile) and the
    ///     Overview drew a slate tint — so the ✕ appeared NOWHERE. That is the invisible-condemned-
    ///     device bug that cost three owner reports, reintroduced. Measured live on <c>--ship grid</c>
    ///     at (21,1): channel <c>stockpile</c>, frame fg 26, <c>mk-strip</c> drawn: no.
    ///     (The other pairs really are unreachable, and that was checked rather than assumed: a dig
    ///     target is a Debris WALL — unwalkable, so it cannot be zoned, and <c>DigJobSource</c> clears
    ///     <c>Designated</c> when the dig completes so a dug-out floor cannot keep the flag.
    ///
    ///     ⚠️ THE DIG × STRIP HALF OF THIS ARGUMENT WAS CITED WRONG AND IS CORRECTED HERE
    ///     (<c>docs/HANDOVER.md</c> §4k, finding G3). It used to read *"<c>CanDesignate</c> refuses
    ///     any wall that is not <c>TileDefs.Wall</c>, so strip and dig cannot share a tile either"*.
    ///     That covers the <b>Wall</b> path ONLY. <see cref="Perilune.Sim.DeconstructSystem"/>'s
    ///     <b>Device</b> path returns before that check ever runs and asks NOTHING about the tile —
    ///     it asks only whether a device is present and is not a Door. So the conclusion is right and
    ///     the reason was incomplete: what actually closes dig × strip is that
    ///     <b>NO DEVICE CAN BE ON A RUBBLE TILE</b>.
    ///     <see cref="Perilune.Sim.PlaceDeviceCommand"/> — the only runtime device spawner a player
    ///     can reach — requires <c>TileFlags.Walkable</c> AND <c>GetWall(pos) == TileDefs.Void</c>,
    ///     and a Debris wall fails BOTH. MEASURED across all three authored ships (Perilune 48,
    ///     Grid 60, Slice 48 Debris-wall tiles): every one is non-walkable, none carries an authored
    ///     device, <c>CanDesignate(…, Device)</c> accepts 0 of them, and
    ///     <c>PlaceDeviceCommand</c> placed 0 of 146 attempts. Pinned by
    ///     <c>MarksChannelTests.No_Device_Can_Stand_On_A_Rubble_Tile_So_Dig_And_Strip_Cannot_Meet</c>,
    ///     which is a guard rather than a sentence — a prose guarantee is exactly what hid the
    ///     stockpile × strip regression above.)
    ///
    /// (2) "IDENTICAL TO PASS 1 ⇒ CANNOT DISAGREE WITH THE FRAME" IS A NON-SEQUITUR, and it is exactly
    ///     how (1) got in. PASS 1 IS NOT THE FRAME. <c>GlyphMapper</c> pass 4 re-applies
    ///     <c>GlyphColor.Deconstruct</c> over a condemned device UNCONDITIONALLY, after pass 1 has
    ///     ranked — so on the one tile where the ranking is reachable, pass 1 never gets the last word
    ///     and the frame's real behaviour is strip-over-stockpile. Copying pass 1 alone therefore
    ///     copied a rule the projection does not actually follow.
    ///
    /// THE RULE THAT REPLACES IT, and it is a rule rather than a mirror: dig and strip are ORDERS —
    /// queued work the player must be able to see they queued — and stockpile is a ZONE, a standing
    /// policy that the Room Zoom deliberately renders from <c>zones</c> instead. An order that a zone
    /// can hide is an order the player cannot verify. Debris stays last because it is terrain and any
    /// order sits on top of it. A tile that is both zoned and condemned now draws its ✕ on both
    /// surfaces, and on the Room Zoom it ALSO keeps its zone tint, because that tint comes from the
    /// independent <c>zones</c> channel — strictly more information than <c>main</c> showed.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// FOG-GATED, unlike <c>zones</c>. A tile with no <see cref="Perilune.Sim.TileFlags.Explored"/>
    /// emits nothing, mirroring pass 1's fog gate, which is FIRST. This is the one place the channel
    /// could have widened what the player knows and deliberately does not: debris is TERRAIN, and
    /// shipping unexplored terrain would turn a rendering fix into a fog-of-war change. (<c>zones</c>
    /// is ungated because a stockpile is the player's own logistics decision — the same rule as
    /// <c>roster</c>/<c>designs</c>. A designation is too, but debris rides the same channel and the
    /// gate has to be per-channel to stay one rule.)
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state that is already saved
    /// and hashed (the TILE chapter's flags, the terrain planes, the <c>'STRP'</c> registry). Nothing
    /// here mutates, allocates into the sim, mints a <see cref="Perilune.Glyph.GlyphColor"/> id
    /// (<c>GlyphColor</c> is a spine file and is untouched) or folds into any determinism hash.
    ///
    ///   marks {"type":"marks","cells":[[x,y,deck,kind],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo MarkIc = CultureInfo.InvariantCulture;

        // ── the kind enum, APPEND-ONLY ──
        //
        // Mirrored by `MARK_KIND_NAMES` in client/src/wire/messages.js, and the two are pinned equal
        // by client/test/marks-model.test.js, which PARSES THIS FILE (the house tripwire idiom:
        // zone-model.test.js parses WireFormat.Zones.cs, palette.test.js parses GlyphColor.cs,
        // stock-filter-model.test.js parses ItemStack.cs). There is no compiler across this seam.
        //
        // The wire carries a SMALL INT, not the name. A name would be self-describing on the socket
        // and would also be a second spelling of the client's own vocabulary — and the client already
        // has to hold a table anyway to know what to DRAW, so a string would buy nothing and cost
        // ~7 bytes per cell on a channel whose whole cost story is debris volume (see BuildMarks).

        /// <summary>Rubble. TERRAIN, not an order — the only kind here that is not player intent.</summary>
        public const int MarkDebris = 0;
        /// <summary>A dig/clear order: <see cref="Perilune.Sim.TileFlags.Designated"/>.</summary>
        public const int MarkDig = 1;
        /// <summary>A haul destination zone: <see cref="Perilune.Sim.TileFlags.Stockpile"/>.</summary>
        public const int MarkStockpile = 2;
        /// <summary>A condemned wall or device: the <see cref="Perilune.Sim.DeconstructSystem"/> registry.</summary>
        public const int MarkStrip = 3;

        /// <summary>
        /// One marked tile on the <c>marks</c> channel. Tuple <c>[x, y, deck, kind]</c>, append-only
        /// (a future field is a trailing element, exactly as <see cref="ZoneTile"/> documents).
        ///
        /// <para>EXACTLY ONE kind per tile, resolved host-side by the precedence in this file's header.
        /// The client never sees a tile twice and never has to arbitrate — which is what lets both
        /// surfaces keep drawing one mark per tile with no change to
        /// <c>mark-overlay.js</c>'s vocabulary.</para>
        /// </summary>
        public readonly struct MarkCell
        {
            public readonly int X, Y, Deck, Kind;

            public MarkCell(int x, int y, int deck, int kind)
            { X = x; Y = y; Deck = deck; Kind = kind; }
        }

        /// <summary>
        /// Serialize the sparse mark layer: one entry per marked tile, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S, AND IT MATTERS — same contract as <see cref="Zones"/>. This method
        /// sorts nothing; <c>GameSession.BuildMarks</c> walks the world <c>z, y, x</c> (the
        /// <c>IJobSource</c> rule-3 scan order, and the same walk <c>BuildMaterials</c> and
        /// <c>BuildZones</c> use), so the emission order is a function of world geometry alone. The
        /// one non-plane source consulted per tile — the deconstruct registry — is queried by KEY
        /// (<c>DeconstructSystem.TryGet</c>), never enumerated, so no container's internal layout can
        /// reach the socket.
        ///
        /// InvariantCulture on every number (its own <see cref="MarkIc"/>, so this file is readable in
        /// isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Marks(IReadOnlyList<MarkCell> cells)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"marks\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.X.ToString(MarkIc))
                      .Append(',').Append(c.Y.ToString(MarkIc))
                      .Append(',').Append(c.Deck.ToString(MarkIc))
                      .Append(',').Append(c.Kind.ToString(MarkIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
