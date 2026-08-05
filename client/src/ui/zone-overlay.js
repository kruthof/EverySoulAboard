// THE STOCKPILE-ZONE OVERLAY'S MARKUP, PURE (console-retirement WP-3). Two string builders — the SVG
// floor layer and the HTML key beside it — with no DOM, no wire and no state. `roomzoom-view.js` calls
// each once per repaint and assigns the result; that is the whole of the glue.
//
// WHY THIS IS ITS OWN MODULE AND NOT A FUNCTION INSIDE THE VIEW. Because it was, and the gate could not
// see it: with the builder living in `roomzoom-view.js` (untestable — there is no DOM in this suite)
// the ONLY guard was a source scan proving the function was CALLED. Making it return the empty string
// unconditionally, or drop every label, left 546/546 tests passing. A package whose entire purpose is
// "the player can be told" shipped zero assertions that anything is drawn. A pure string builder is
// node-testable to the character, and `zone-overlay.test.js` now reddens on both of those mutations.
// The precedent is house style: `render/pawn-svg.js` (pawnSprite), `items/index.js` (buildItem),
// `ui/deck-minimap.js` (deckMinimap) — every non-trivial SVG in the Room Zoom is already built this way.
//
// THREE STATES, THREE MARKS, TWO COLOUR FAMILIES.
//   every zoned tile   a slate tint + dotted boundary — the zone, invisible on this surface until now
//   RESTRICTED         a PALE corner wedge (cool, near-white)
//   BACKED OFF         a DIM SCRIM + an AMBER hatch + ring (the alarm colour)
//
// THE SCRIM IS WP-6's ONE ADDITION TO THIS LAYER, and the layer was deliberately EXTENDED rather than
// replaced. The plan (§5 gap 3) specifies a backed-off tile as "dim + hatch + a one-line reason"; WP-3
// shipped the hatch and the reason (the `<title>` plus the visible key) and not the dim, so that is
// the whole of the delta. Replacing a working, independently-reviewed, character-tested layer would
// have thrown away `zone-overlay.test.js` — the file that exists because WP-3's first draft passed
// 546/546 with the builder returning the empty string — and re-derived it, for preference.
// The wedge is deliberately NOT amber. It was, over an amber hatch and an amber ring, which made a
// restricted-AND-backed-off tile — the state a player most needs to tell apart — a single amber smear;
// and the label used to suppress the filter list on exactly those tiles, so the restriction was
// unreadable by any means at all. Different hue, different shape, and `zoneLabel` names both facts.

/** Logical units per tile in the Room Zoom's layer space (room-model.js `U`). Imported rather than
 *  re-declared so a change to the grid pitch cannot silently halve this layer. */
import { U } from './room-model.js';
// The weight the shared order ring is drawn at (`markCellSvg`'s dig/strip mark). Imported rather than
// restated, because the RELATION below — a zone must never be drawn heavier than an order — is the
// point, and a second copy of `1.5` is how the two come to disagree. `mark-overlay.js` imports
// nothing, so this cannot be cyclic.
import { ORDER_RING_WIDTH } from './mark-overlay.js';

/** XML/HTML text escape. Local rather than imported: both builders emit markup and must never depend
 *  on a caller having sanitised a label. The kind names are ASCII today, but a `<title>` and a key row
 *  both interpolate model text, and "it happens to be safe input" is not a contract. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── THE PAPER DIALECT (visual redesign, charter §1 ruling E3) ──
//
// ⚠️ THE THREE-HUE PALETTE IS RETIRED. It was slate for the zone, pale cool for RESTRICTED, amber
// for BACKED OFF; under E3 colour alone distinguishes nothing and there is ONE accent. What
// separates the three states now is SHAPE and DASH, which is what the header above already claimed
// was doing the work ("different hue, different shape") — the hue half has simply gone.
//
//   zone        the faintest INK tint + a `2 2` DOTTED ink boundary — a zone is not an order, so it
//               carries no accent and no queued-order `8 5` dash. It must read as quieter than the
//               dig ring painted on the tile beside it.
//   RESTRICTED  a paper corner wedge with a heavy ink edge — a cut corner, unmistakably a SHAPE
//   BACKED OFF  an INK 45° hatch + an OXBLOOD SOLID ring. Solid oxblood is the charter's
//               ATTENTION/FAULT spelling and a backed-off zone is exactly that: the haulers have
//               given up on it. It is deliberately NOT the `8 5` queued-order dash.
const ZONE_FILL = 'rgba(20,18,15,.10)';      // the zone itself: the faintest ink tint
const ZONE_EDGE = 'rgba(20,18,15,.55)';
const WEDGE = '#EBE4D1';                     // paper: RESTRICTED reads as a cut corner
const WEDGE_EDGE = '#14120F';
const ALARM = '#7B2C22';                     // THE ONE ACCENT, SOLID: attention/fault — BACKED OFF
const HATCH_INK = '#14120F';                 // the back-off hatch is INK, so the ring stays the shout
// The DIM half of "dim + hatched" (WP-6). ⚠️ IT IS A PAPER WASH NOW, NOT A NEAR-BLACK SCRIM: the
// ground under this layer is paper `#E7E0D2`, so a dark scrim would make an inert tile the LOUDEST
// thing in the room — the opposite of "reads as inert". Washing back TOWARDS the paper is the same
// statement in the new ground's terms.
const DIM = 'rgba(235,228,209,.55)';

/**
 * ⛔⛔ THE ZONE BOUNDARY IS QUIETER THAN AN ORDER, AND IT WAS LOUDER (VR-P3 review, MINOR 1).
 *
 * The boundary used to be drawn at `1 * k` where `k = unit / U` — a proportion, which on the
 * cutaway's ~95-px tile is **2.97 px**, against the 1.5 px the shared order ring is drawn at on the
 * tile beside it. So a STOCKPILE — a zone, which the header above says in so many words "must read as
 * quieter than the dig ring painted on the tile beside it" — out-shouted every queued order in the
 * room by 2×. Colour could not correct it either: under E3 the zone carries no accent at all, so the
 * only thing the player had to rank the two marks by was exactly the weight that was inverted.
 *
 * ⭐ THE FIX IS A RELATION, NOT A NUMBER: the boundary is drawn at a FIXED weight that is `<=` the
 * order ring's, and `zone-overlay.test.js` pins the inequality against the shipped `markCellSvg`
 * output rather than against a literal — so raising the order ring can never silently un-invert it.
 * The DASH stays proportional (`2 2` at 32 units is invisible at 95), because a dot pattern is
 * spacing rather than weight.
 *
 * ⚠️ THE BACKED-OFF RING IS DELIBERATELY LEFT AT THE ORDER RING'S OWN WEIGHT AND NOT BELOW IT. Solid
 * oxblood is the charter's ATTENTION/FAULT spelling: a zone the haulers have given up on is not a
 * quieter thing than a queued order, it is a louder one, and it is the only mark on this layer that
 * spends the accent.
 */
const ZONE_EDGE_W = 1;
const BACKOFF_RING_W = ORDER_RING_WIDTH;

/**
 * The SVG floor layer for one room's zoned tiles.
 *
 * POINTER EVENTS ARE ON, DELIBERATELY. Every other group in this stack carries
 * `pointer-events="none"`, and the first draft copied that — which silently disabled the `<title>`
 * tooltip that was then the only place the wording existed. The Room Zoom's build/drag/click handlers
 * are bound to the CONTAINER (`rz-canvas`), so an SVG child receiving the event and letting it bubble
 * changes nothing about them. `cursor="inherit"` keeps the armed-tool crosshair.
 *
 * ⚠️ AND ONE SENTENCE OF THIS HEADER IS NOW STALE AND IS CORRECTED RATHER THAN DELETED. It read
 * *"they never read `e.target`"*. Since VR-P3-a they do: `roomzoom-view.js`'s `tileAt` resolves
 * `e.target.closest('[data-tile]')` FIRST and falls back to the `clientX/clientY` inverse only on
 * bare floor. That is still harmless HERE, and for a reason worth writing down rather than assuming:
 * a zone cell is drawn with `place.cell` — SHEARED INTO THE FLOOR PLANE, on its own tile — and it
 * carries no `data-tile`, so a press on it falls through to the inverse, which is exactly right about
 * the floor plane. A future layer that STANDS UP off the floor and takes pointer events must emit
 * `data-tile` or it re-opens the defect for its own ink.
 *
 * @param {{tx:number, ty:number, restricted:boolean, backedOff:boolean, label:string}[]} tiles
 *   roomZoneTiles output
 * @param {{rx:number, ry:number}} focus the focused room rect's origin, for the local transform
 * @returns {string} SVG markup, or '' when the room has no zoned tile
 */
export function zoneLayerSvg(tiles, focus, place = null, unit = U) {
  if (!Array.isArray(tiles) || !tiles.length || !focus) return '';
  // The hatch pattern is emitted ONLY when some tile needs it — an unused <defs> in every room is
  // dead markup, and (found by zone-overlay.test.js) it also makes "does this room draw a hatch?"
  // unanswerable by inspection, since the pattern's own id matches any scan for the class.
  const out = [];
  if (tiles.some((t) => t && t.backedOff)) {
    // ⭐ THE `rotate(45)` SURVIVES THE CABINET SHEAR AT EXACTLY 45°, AND THAT IS MEASURED RATHER THAN
    // ASSUMED (VR-P3 review, MINOR 8 — the finding did NOT reproduce, and the measurement is why).
    // The pattern is `patternUnits="userSpaceOnUse"`, so it is painted in the user space of the
    // `<g>` this cell sits in — which `scenePlacement.cell` has sheared by `matrix(1 0 0.4 -0.6 e f)`.
    // The hatch LINE is vertical `(0,1)`; `rotate(45)` turns it to `(-1,1)/√2`; the cell matrix takes
    // `(-1,1)` to `(-1 + 0.4, -0.6) = (-0.6,-0.6)` — a 45° line on screen, to the digit.
    // ⚠️ IT IS A PROPERTY OF THE SHIPPED DEPTH RATIO, NOT A LAW: the composed angle is 45° because
    // `DEPTH_RATIO.x - 1 === DEPTH_RATIO.y` (0.4 − 1 = −0.6). Move either constant in
    // `render/oblique.js` and this hatch goes off 45° silently — which is why `zone-overlay.test.js`
    // composes the two transforms and asserts the ANGLE rather than the literal `rotate(45)`.
    // (The line SPACING is distorted by the same shear and is left alone: a hatch is a texture, and
    // the angle is the thing that reads as "this surface has been struck out".)
    out.push('<defs><pattern id="rz-zone-hatch" width="6" height="6" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + HATCH_INK +
      '" stroke-opacity="0.4" stroke-width="1.2"/></pattern></defs>');
  }
  for (const t of tiles) {
    // VR-P3 — A ZONE IS PAINT ON THE FLOOR, so the cell is built at the origin and mapped onto the
    // tile's projected floor parallelogram by `place.cell`. With no `place` it falls back to the
    // plan-view offset, which is what every isolated model test drives.
    const lx = place ? 0 : (t.tx - focus.rx) * unit;
    const ly = place ? 0 : (t.ty - focus.ry) * unit;
    // ⚠️ EVERY EXTENT BELOW IS IN `unit`, NOT IN `U`. The Room Zoom's tile is ~95 scene px on the
    // cutaway and 32 logical px in the plan view this replaced; a cell hard-coded to `U` inside a
    // 95-unit box paints the top-left THIRD of its tile — measured on the first render, where the
    // zones read as three small squares floating inside their own tiles.
    const k = unit / U;                       // the wedge and the dashes keep their proportions
    const side = unit - 1;
    let cell = '<rect class="rz-zone-edge" x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' + side +
      '" height="' + side + '" rx="2" fill="' + ZONE_FILL + '" stroke="' + ZONE_EDGE +
      '" stroke-width="' + ZONE_EDGE_W + '" stroke-dasharray="' + (2 * k) + ' ' + (2 * k) + '"/>';
    if (t.backedOff) {
      cell += '<rect class="rz-zone-dim" x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' +
        side + '" height="' + side + '" rx="2" fill="' + DIM + '"/>';
      cell += '<rect class="rz-zone-hatch" x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' +
        side + '" height="' + side + '" rx="2" fill="url(#rz-zone-hatch)" stroke="' + ALARM +
        '" stroke-width="' + BACKOFF_RING_W + '"/>';
    }
    if (t.restricted) {
      cell += '<path class="rz-zone-wedge" d="M' + (lx + unit - 10 * k) + ' ' + (ly + 1) + 'h'
        + (9 * k) + 'v' + (9 * k) + 'z" fill="'
        + WEDGE + '" stroke="' + WEDGE_EDGE + '" stroke-width="' + (0.75 * k) + '"/>';
    }
    out.push('<g class="rz-zone' + (t.restricted ? ' rz-zone-restricted' : '') +
      (t.backedOff ? ' rz-zone-backedoff' : '') + '"'
      + (place ? ' transform="' + place.cell(t.tx, t.ty) + '"' : '')
      + '><title>' + esc(t.label) + '</title>' + cell + '</g>');
  }
  return '<g class="rz-zones" pointer-events="visiblePainted" cursor="inherit">' + out.join('') + '</g>';
}

/**
 * The HTML key: what the marks mean, in words, with no hover required.
 *
 * A `<title>` can be disabled by one attribute three layers up; a visible key cannot. This is the
 * surface that actually closes MECHANICS §13.17 — "a zone painted where no crew can reach now simply
 * never fills, silently, with nothing anywhere to say so".
 *
 * @param {{kind:string, label:string}[]} rows zoneLegendRows output
 * @returns {string} HTML, or '' when there is nothing to explain (the caller then hides the box)
 */
export function zoneKeyHtml(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const out = ['<span class="rz-key-title">ZONES</span>'];
  for (const r of rows) {
    if (!r) continue;
    // The label gets its OWN element rather than sitting as a bare text node beside the swatch. As an
    // anonymous flex item its wrapped second line started back at the SWATCH column, so the four-row
    // key read as a ragged block; a real item wraps within its own edges and hangs under the text.
    out.push('<span class="rz-key-row"><i class="rz-key-sw rz-key-sw-' + esc(r.kind) +
      '"></i><span class="rz-key-text">' + esc(r.label) + '</span></span>');
  }
  return out.join('');
}
