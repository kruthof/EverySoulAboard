// THE DEBRIS / DESIGNATION MARK VOCABULARY, PURE (console-retirement WP-2). One fg-byte table and
// one rect-parameterised SVG cell builder, shared verbatim by BOTH modern surfaces — the Level-1
// Overview (`overview-scene.js`) and the Level-2 Room Zoom (`room-model.js` → `roomzoom-view.js`).
// No DOM, no wire, no state, no clock, no randomness: same arguments → byte-identical string.
//
// WHAT THIS FIXES. `GlyphMapper.Project` recolours the terrain a player designation sits on
// (`sim/Sim.Glyph/GlyphMapper.cs:83-86` — the flags read plus all three writes. NOTE the
// console-retirement plan §4.1 ii cites `:82-85`, which is off by one and, worse, ENDS BEFORE the
// Deconstruct line the same sentence names; this file's range is the measured one):
// `TileFlags.Designated` → `GlyphColor.Designate` (15),
// `TileFlags.Stockpile` → `Stockpile` (16), the deconstruct registry → `Deconstruct` (26); plain
// rubble stays `Debris` (4). Those bytes ride every frame as `cell[1]`
// (`client/src/wire/messages.js`) and BOTH SVG surfaces threw them away, reading only `cell[0]`.
// Worse, the glyph they ride on — `'%'`, code 37 — is in each surface's `NON_FURNITURE` set, so
// debris and dig designations rendered as *nothing at all*. Measured on the real capture
// `client/test/fixtures/overview-grid.json` frame `frameDeck1`: 30 cells carry fg 4 and 3 carry
// fg 15, and ALL 33 share glyph code 37. **The fg byte is the only thing that tells a designated
// tile from an undesignated one**, which is why this module keys on it and never on the glyph.
//
// WHY A THIRD MODULE, when the plan's WP-2 file set named only `room-model.js` +
// `overview-scene.js`. The binding constraint on WP-2 is *"the same fg byte must not mean two
// different things in the Overview and the Room Zoom"*. Those two files mirror each other by hand
// today (`NON_FURNITURE`, `ROLE_TO_ITEM`, each carrying a "mirrors the other" comment), and a hand
// mirror keeps that constraint only for as long as someone remembers it. Sharing one table and one
// shape builder makes the constraint hold BY CONSTRUCTION rather than by a guard that has to be
// written and maintained. The precedent is house style and one package old: WP-3 extracted
// `zone-overlay.js` out of the view for exactly the neighbouring reason (a builder that cannot be
// node-tested is a builder whose emptiness the gate cannot see). This module is imported by both
// surfaces and imports nothing — in particular it does NOT import `U` from `room-model.js`, which
// would make the pair cyclic; the caller passes the tile box it wants filled.
//
// THE FOUR MARKS, and the two-colour language they speak.
//   debris     (fg 4)   warm rubble chunks           — a thing in the world. NO order on it.
//   dig        (fg 15)  rubble chunks + AMBER ring   — the same rubble, with an order queued.
//   stockpile  (fg 16)  slate tint + dotted boundary — a zone, not an order (different family).
//   strip      (fg 26)  AMBER ring + amber ✕        — a condemned wall/device.
// Amber dashed = "an order is queued here" is not a new dialect: it is exactly what the build
// ghosts already say (`overview-scene.js` ghostLayer, `roomzoom-view.js` ghostSvg). Slate is
// WP-3's zone colour (`zone-overlay.js` ZONE_FILL/ZONE_EDGE), reused byte-for-byte so a stockpile
// tile reads the same on both surfaces even though the Room Zoom draws it from a richer source.
//
// HONEST LIMIT OF READING `cell[1]`, and it is worth knowing before trusting a mark's absence.
// `GlyphMapper` writes the designation colour in pass 1 and then passes 3/4/5 OVERWRITE the cell's
// fg for ground item stacks, grid-resident devices and living citizens. So: a crew member standing
// on a designated tile hides its mark; a stored item on a stockpile tile hides that tile's zone
// tint; and a device standing on a DIG or STOCKPILE tile hides that tile's mark too — EVERY device
// kind is non-blocking (`MachineDefs`, `blocks = false` in all 26 rows), so a device tile is
// walkable and `DesignateStockpileCommand` will happily zone it. The marks are therefore an honest
// view of the frame, not a complete census of the designation registries. The `zones` channel
// (WP-3) is the complete source for stockpiles.
//
// ⚠️ PASS 4 NOW HAS EXACTLY ONE EXCEPTION, and the correction matters because this comment was the
// place the defect sat recorded-and-unfixed. It used to read: *"a strip mark on a DEVICE never
// reaches the wire at all, because pass 4 repaints the device's own colour over it"*. THAT IS NO
// LONGER TRUE OF THE STRIP MARK — and note the exception is narrow: pass 4 still overwrites a dig
// or stockpile designation on a device tile (above), because only the DECONSTRUCT case was fixed. `GlyphMapper` pass 4 now re-applies `GlyphColor.Deconstruct` over a condemned
// device's own colour while keeping its glyph, so a condemned desk/bed/locker/lamp/plant ships fg 26
// and draws the `strip` mark below exactly as a condemned wall always did. The owner reported the
// invisible device strip THREE times before it was fixed (`docs/HANDOVER.md` §4g), and every one of
// those reports was against a codebase where this paragraph already described the cause — which is
// why it is corrected here in place rather than quietly deleted. Both surfaces draw the mark layer
// ABOVE their furniture layer so the recovered byte is not then hidden by the desk's own sprite.

/* eslint-disable no-multi-spaces */

/**
 * Projected `GlyphColor` foreground byte → mark kind. THE table; both surfaces import it rather
 * than mirroring it. Indices are the enum's own, which are append-only and therefore stable
 * (`sim/Sim.Glyph/GlyphColor.cs`): Debris 4, Designate 15, Stockpile 16, Deconstruct 26.
 * Every other byte is terrain/crew/device colour and means "no mark".
 */
export const MARK_FOR_FG = Object.freeze({
  4: 'debris',      // GlyphColor.Debris     — rubble, no order
  15: 'dig',        // GlyphColor.Designate  — TileFlags.Designated
  16: 'stockpile',  // GlyphColor.Stockpile  — TileFlags.Stockpile
  26: 'strip',      // GlyphColor.Deconstruct — E0-5 condemned wall / device
});

/** The mark kind a projected fg byte carries, or '' when it carries none. PURE. */
export function markForFg(fg) {
  return MARK_FOR_FG[fg | 0] || '';
}

/**
 * Which of the three rubble arrangements a tile uses, from the tile's OWN coordinates. Deliberately
 * arithmetic and not seeded: `Math.random` would break both surfaces' byte-identical-output
 * contract, and a single fixed arrangement tiles a debris field into an obvious repeating wallpaper.
 * PURE.
 */
export function markVariant(tx, ty) {
  const v = ((tx | 0) * 7 + (ty | 0) * 13) % 3;
  return v < 0 ? v + 3 : v;
}

// ── colours ──
const RUBBLE = '#8a7d6e';                    // warm mid-grey: the rubble itself
const RUBBLE_EDGE = 'rgba(12,10,8,.7)';
const RUBBLE_BED = 'rgba(12,10,8,.28)';      // the dark bed the chunks sit in, so a pile reads as a pile
const ORDER = '#f2b563';                     // amber: "an order is queued here" (the ghost colour)
const ZONE_FILL = 'rgba(126,158,196,.16)';   // slate: WP-3's zone colours, reused verbatim
const ZONE_EDGE = 'rgba(126,158,196,.55)';

// Three rubble arrangements as [cx, cy, r] in TILE FRACTIONS, so they scale to any tile box (the
// Overview's tile is a non-uniform ~15×13 design-px squeeze; the Room Zoom's is a square 32).
const RUBBLE_SETS = Object.freeze([
  Object.freeze([[0.32, 0.62, 0.20], [0.62, 0.40, 0.16], [0.70, 0.71, 0.12]]),
  Object.freeze([[0.38, 0.38, 0.18], [0.66, 0.62, 0.19], [0.29, 0.71, 0.11]]),
  Object.freeze([[0.50, 0.50, 0.21], [0.27, 0.33, 0.13], [0.73, 0.69, 0.14]]),
]);

/** Round to 2dp with no `-0` — the `n()` discipline both surfaces already use (InvariantCulture-safe:
 *  arithmetic + ASCII concat only, no locale API). */
function n(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/** One irregular rubble chunk as a closed path, centred (cx,cy) with radius r (all in px). */
function chunk(cx, cy, r) {
  return '<path d="M' + n(cx - r) + ' ' + n(cy + r * 0.35)
    + 'L' + n(cx - r * 0.45) + ' ' + n(cy - r)
    + 'L' + n(cx + r) + ' ' + n(cy - r * 0.3)
    + 'L' + n(cx + r * 0.35) + ' ' + n(cy + r)
    + 'Z" fill="' + RUBBLE + '" stroke="' + RUBBLE_EDGE + '" stroke-width="0.6"/>';
}

/** The rubble pile for a tile box, in one of the three arrangements. */
function rubble(x, y, w, h, variant) {
  const set = RUBBLE_SETS[((variant | 0) % 3 + 3) % 3];
  const r0 = Math.min(w, h);
  let out = '<rect x="' + n(x + w * 0.12) + '" y="' + n(y + h * 0.12) + '" width="' + n(w * 0.76)
    + '" height="' + n(h * 0.76) + '" rx="' + n(r0 * 0.18) + '" fill="' + RUBBLE_BED + '"/>';
  for (const c of set) out += chunk(x + w * c[0], y + h * c[1], r0 * c[2]);
  return out;
}

/** The amber dashed order ring — the shared "an order is queued on this tile" mark. */
function orderRing(x, y, w, h) {
  const i = Math.min(1, Math.min(w, h) * 0.06); // inset, so the ring never spills onto a neighbour
  return '<rect class="mk-order-ring" x="' + n(x + i) + '" y="' + n(y + i) + '" width="' + n(w - i * 2)
    + '" height="' + n(h - i * 2) + '" rx="1.5" fill="none" stroke="' + ORDER
    + '" stroke-width="1.2" stroke-dasharray="3 2"/>';
}

/**
 * One tile's mark as an SVG group, filling the box (x,y,w,h) in the CALLER's units — design px on
 * the Overview, room-local logical units in the Room Zoom. Unknown mark → ''. PURE.
 *
 * The wrapper class is surface-neutral (`mk mk-<kind>`) on purpose: the two surfaces render the same
 * vocabulary and a shared class is the honest name for it. No CSS rule backs these — the marks are
 * fully self-coloured by attribute, so they survive a stylesheet that has never heard of them.
 *
 * @param {string} mark  'debris' | 'dig' | 'stockpile' | 'strip'
 * @param {number} x @param {number} y @param {number} w @param {number} h  the tile box
 * @param {number} [variant]  0..2, from `markVariant(tx,ty)`; ignored by the ring-only marks
 * @returns {string}
 */
export function markCellSvg(mark, x, y, w, h, variant = 0) {
  if (!(w > 0) || !(h > 0)) return '';
  let body = '';
  if (mark === 'debris') {
    body = rubble(x, y, w, h, variant);
  } else if (mark === 'dig') {
    // The SAME rubble as an undesignated tile, plus the order ring. That is the whole semantic:
    // a dig designation does not change what is there, it says a crew member has been told to clear it.
    body = rubble(x, y, w, h, variant) + orderRing(x, y, w, h);
  } else if (mark === 'stockpile') {
    body = '<rect x="' + n(x + 0.5) + '" y="' + n(y + 0.5) + '" width="' + n(Math.max(0, w - 1))
      + '" height="' + n(Math.max(0, h - 1)) + '" rx="2" fill="' + ZONE_FILL + '" stroke="' + ZONE_EDGE
      + '" stroke-width="1" stroke-dasharray="2 2"/>';
  } else if (mark === 'strip') {
    const ix = x + w * 0.28, iy = y + h * 0.28, ax = x + w * 0.72, ay = y + h * 0.72;
    body = orderRing(x, y, w, h)
      + '<path class="mk-condemn" d="M' + n(ix) + ' ' + n(iy) + 'L' + n(ax) + ' ' + n(ay)
      + 'M' + n(ax) + ' ' + n(iy) + 'L' + n(ix) + ' ' + n(ay)
      + '" stroke="' + ORDER + '" stroke-width="1.4" fill="none"/>';
  } else {
    return '';
  }
  return '<g class="mk mk-' + mark + '">' + body + '</g>';
}
