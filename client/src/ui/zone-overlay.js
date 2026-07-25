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
//   BACKED OFF         an AMBER hatch + ring (the alarm colour)
// The wedge is deliberately NOT amber. It was, over an amber hatch and an amber ring, which made a
// restricted-AND-backed-off tile — the state a player most needs to tell apart — a single amber smear;
// and the label used to suppress the filter list on exactly those tiles, so the restriction was
// unreadable by any means at all. Different hue, different shape, and `zoneLabel` names both facts.

/** Logical units per tile in the Room Zoom's layer space (room-model.js `U`). Imported rather than
 *  re-declared so a change to the grid pitch cannot silently halve this layer. */
import { U } from './room-model.js';

/** XML/HTML text escape. Local rather than imported: both builders emit markup and must never depend
 *  on a caller having sanitised a label. The kind names are ASCII today, but a `<title>` and a key row
 *  both interpolate model text, and "it happens to be safe input" is not a contract. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ZONE_FILL = 'rgba(126,158,196,.16)';   // slate: the zone itself
const ZONE_EDGE = 'rgba(126,158,196,.55)';
const WEDGE = '#dbe6f2';                     // pale cool: RESTRICTED
const WEDGE_EDGE = 'rgba(16,22,32,.85)';
const ALARM = '#f2b563';                     // amber: BACKED OFF

/**
 * The SVG floor layer for one room's zoned tiles.
 *
 * POINTER EVENTS ARE ON, DELIBERATELY. Every other group in this stack carries
 * `pointer-events="none"`, and the first draft copied that — which silently disabled the `<title>`
 * tooltip that was then the only place the wording existed. The Room Zoom's build/drag/click handlers
 * are bound to the CONTAINER (`rz-canvas`) and resolve tiles from `e.clientX/clientY` against
 * `rz-layers`' bounding rect; they never read `e.target`, so an SVG child receiving the event and
 * letting it bubble changes nothing about them (verified by driving a real drag-build in Chrome).
 * `cursor="inherit"` keeps the armed-tool crosshair.
 *
 * @param {{tx:number, ty:number, restricted:boolean, backedOff:boolean, label:string}[]} tiles
 *   roomZoneTiles output
 * @param {{rx:number, ry:number}} focus the focused room rect's origin, for the local transform
 * @returns {string} SVG markup, or '' when the room has no zoned tile
 */
export function zoneLayerSvg(tiles, focus) {
  if (!Array.isArray(tiles) || !tiles.length || !focus) return '';
  // The hatch pattern is emitted ONLY when some tile needs it — an unused <defs> in every room is
  // dead markup, and (found by zone-overlay.test.js) it also makes "does this room draw a hatch?"
  // unanswerable by inspection, since the pattern's own id matches any scan for the class.
  const out = [];
  if (tiles.some((t) => t && t.backedOff)) {
    out.push('<defs><pattern id="rz-zone-hatch" width="6" height="6" patternUnits="userSpaceOnUse" ' +
      'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + ALARM +
      '" stroke-opacity="0.55" stroke-width="1.5"/></pattern></defs>');
  }
  for (const t of tiles) {
    const lx = (t.tx - focus.rx) * U;
    const ly = (t.ty - focus.ry) * U;
    let cell = '<rect x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' + (U - 1) +
      '" height="' + (U - 1) + '" rx="2" fill="' + ZONE_FILL + '" stroke="' + ZONE_EDGE +
      '" stroke-width="1" stroke-dasharray="2 2"/>';
    if (t.backedOff) {
      cell += '<rect class="rz-zone-hatch" x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' +
        (U - 1) + '" height="' + (U - 1) + '" rx="2" fill="url(#rz-zone-hatch)" stroke="' + ALARM +
        '" stroke-width="1.5"/>';
    }
    if (t.restricted) {
      cell += '<path class="rz-zone-wedge" d="M' + (lx + U - 10) + ' ' + (ly + 1) + 'h9v9z" fill="' +
        WEDGE + '" stroke="' + WEDGE_EDGE + '" stroke-width="0.75"/>';
    }
    out.push('<g class="rz-zone' + (t.restricted ? ' rz-zone-restricted' : '') +
      (t.backedOff ? ' rz-zone-backedoff' : '') + '"><title>' + esc(t.label) + '</title>' +
      cell + '</g>');
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
