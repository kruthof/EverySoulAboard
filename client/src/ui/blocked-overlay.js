// THE BLOCKED-ORDER VOCABULARY, PURE (the `blocked` channel). Two string builders — the SVG tile
// layer and the HTML key beside it — with no DOM, no wire, no state, no clock, no randomness: same
// arguments → byte-identical string.
//
// WHY IT IS ITS OWN MODULE AND NOT A FUNCTION INSIDE THE VIEW. The lesson is one package old and it
// is written into `zone-overlay.js`'s own header: with the builder living in `roomzoom-view.js`
// (untestable — there is no DOM in this suite) the only available guard is a source scan proving the
// function is CALLED, and making it return the empty string unconditionally left the whole suite
// green. A package whose entire purpose is "the player can be told" cannot be guarded by a scan for
// its own name. A pure string builder is node-testable to the character.
//
// WHAT IT SAYS, AND WHY IT IS THIS AND NOT MORE.
//
// `WorksiteSafety.CanStageWorkerAt` refuses to park a worker on a tile whose air would pull it off
// the job. That closed a real livelock and its own header records the price: the failure went from
// expensive-and-visible to CHEAP-AND-INVISIBLE — an order painted in an airless compartment simply
// never progresses, silently, with nothing on any surface saying why. This is the surface.
//
// TWO MARKS, ONE FAMILY, AND THEY ARE ADDITIVE — the tile keeps whatever it already draws:
//   scrim   a near-black wash over the whole tile — "nothing is happening here"
//   badge   a small dark plate with a warm-red ⚠ bar-and-dot, top-left — "and here is why"
//
// ⚠️ ADDITIVE IS LOAD-BEARING, NOT TIDINESS. A blocked DIG tile still shows its rubble and its amber
// order ring (`mark-overlay.js`); a blocked STRIP still shows its ✕. Replacing the mark would tell
// the player their order had vanished, which is a worse lie than the silence being fixed. The scrim
// is drawn UNDER the badge so the one thing that is shouting stays at full contrast — the same call
// `zone-overlay.js` makes for a backed-off zone, and the two are deliberately the same colour family
// so "dimmed + a warm mark" means one thing on this surface rather than two.
//
// ⚠️ THE BADGE IS NOT AMBER. Amber (#f2b563) already means "an order is queued here" on this surface
// — the ghost colour, the dig ring, the strip ✕, the backed-off hatch. A blocked order is a FAULT,
// not a queue, and painting it in the queue colour would make the mark that says "stuck" and the mark
// that says "ordered" the same smear. `#c25a3f` is `STATUS.bad` from `theme/warm-tokens.js`, the
// harmonic's fault colour, declared literally here for the same reason `mark-overlay.js` and
// `zone-overlay.js` declare theirs: this module imports geometry, not the theme.
//
// ⚠️ AND THE KEY IS NOT OPTIONAL. A `<title>` tooltip can be disabled by one attribute three layers
// up, needs a hover nobody knows to try, and does not exist on a touch device. `zone-overlay.js`
// learned this the same way and says so: the visible key is the surface that actually discharges
// "the player was never told". BOTH are built here; the view shows both.
//
// The wrapper classes (`rz-blocked`, `rz-blocked-<reason>`) are hooks for a test and for a future
// stylesheet. No CSS rule backs the SVG — every mark is self-coloured by attribute, so it survives a
// stylesheet that has never heard of it. The KEY's swatches do take CSS, exactly as the zone key's do.

/** Logical units per tile in the Room Zoom's layer space (room-model.js `U`). Imported rather than
 *  re-declared so a change to the grid pitch cannot silently halve this layer. */
import { U } from './room-model.js';

/** XML/HTML text escape. Local rather than imported: both builders emit markup and must never depend
 *  on a caller having sanitised a label. Reason text is ASCII today, but `<title>` and a key row both
 *  interpolate model text, and "it happens to be safe input" is not a contract. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SCRIM = 'rgba(9,12,18,.46)';   // the DIM half — byte-identical to zone-overlay.js's backed-off scrim
const FAULT = '#c25a3f';             // STATUS.bad (theme/warm-tokens.js §2.5) — fault, never queue-amber
const PLATE = 'rgba(10,13,20,.82)';  // the badge's own dark plate, so the mark reads over rubble

const BADGE = 11;                    // badge box side, logical units (tile is U = 32)
const BADGE_INSET = 1.5;             // margin from the tile's top-left corner

/** Round to 2dp with no `-0` — the `n()` discipline both surfaces already use (InvariantCulture-safe:
 *  arithmetic + ASCII concat only, no locale API, so a de-DE machine emits the same bytes). */
function n(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/**
 * The warning badge for one tile box: a dark plate carrying a bar-and-dot exclamation.
 *
 * DRAWN AS PATHS, NOT AS A TEXT NODE. The item layer's count badge legitimately uses `<text>` because
 * it renders DIGITS whose width it has to fit; a fixed glyph does not need a font, and a font is one
 * more thing that can be missing, substituted or hinted differently between the browser the owner
 * photographs in and the one a player runs. PURE.
 */
function badge(x, y) {
  const bx = x + BADGE_INSET, by = y + BADGE_INSET;
  const cx = bx + BADGE / 2;
  return '<g class="rz-blocked-badge">'
    + '<rect x="' + n(bx) + '" y="' + n(by) + '" width="' + BADGE + '" height="' + BADGE
    + '" rx="2.5" fill="' + PLATE + '" stroke="' + FAULT + '" stroke-width="1.2"/>'
    + '<path d="M' + n(cx) + ' ' + n(by + 2.4) + 'V' + n(by + 6.6)
    + '" stroke="' + FAULT + '" stroke-width="1.6" stroke-linecap="round"/>'
    + '<circle cx="' + n(cx) + '" cy="' + n(by + 8.6) + '" r="0.9" fill="' + FAULT + '"/>'
    + '</g>';
}

/**
 * One blocked tile as an SVG group filling the box (x,y,w,h) in the CALLER's units. PURE.
 *
 * `label` becomes the `<title>`. An empty/absent label still draws the marks — the tile really IS
 * stuck, and drawing nothing because this client could not name the reason would reproduce the
 * silence. (`decodeBlocked` deliberately KEEPS a row whose reason code came from a newer host, for
 * the same reason; the naming decision belongs here, and it is "say less", not "say nothing".)
 *
 * @param {string} reason  the reason vocabulary name ('air' | 'no_approach' | …), for the class hook
 * @param {string} label   the `<title>` text
 * @param {number} x @param {number} y @param {number} w @param {number} h  the tile box
 * @returns {string}
 */
export function blockedCellSvg(reason, label, x, y, w, h) {
  if (!(w > 0) || !(h > 0)) return '';
  const cls = 'rz-blocked' + (reason ? ' rz-blocked-' + reason : '');
  return '<g class="' + cls + '"><title>' + esc(label) + '</title>'
    + '<rect class="rz-blocked-scrim" x="' + n(x + 0.5) + '" y="' + n(y + 0.5)
    + '" width="' + n(Math.max(0, w - 1)) + '" height="' + n(Math.max(0, h - 1))
    + '" rx="2" fill="' + SCRIM + '"/>'
    + badge(x, y)
    + '</g>';
}

/**
 * The Room Zoom's blocked layer as one SVG string in room-local logical units, or ''.
 *
 * POINTER EVENTS ARE ON, DELIBERATELY — the `zone-overlay.js` finding, inherited rather than
 * rediscovered. Every other group in this stack carries `pointer-events="none"`, and copying that
 * silently disables the `<title>` tooltip. The Room Zoom's click/drag handlers are bound to the
 * CONTAINER and resolve tiles from `clientX/clientY` against the layer's bounding rect; they never
 * read `e.target`, so a child receiving the event and letting it bubble changes nothing.
 * `cursor="inherit"` keeps the armed-tool crosshair.
 *
 * @param {{tx:number, ty:number, reasonName:string, label:string}[]} tiles roomBlockedTiles output
 * @param {{rx:number, ry:number}} focus the focused room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function blockedLayerSvg(tiles, focus, unit = U) {
  if (!Array.isArray(tiles) || !tiles.length || !focus) return '';
  const rx = focus.rx | 0, ry = focus.ry | 0;
  const out = [];
  for (const t of tiles) {
    if (!t) continue;
    const cell = blockedCellSvg(t.reasonName, t.label,
      (t.tx - rx) * unit, (t.ty - ry) * unit, unit, unit);
    if (cell) out.push(cell);
  }
  return out.length
    ? '<g class="rz-blockeds" pointer-events="visiblePainted" cursor="inherit">' + out.join('') + '</g>'
    : '';
}

/**
 * The HTML key rows for the blocked tiles in this room: what the badges MEAN, in words, with no hover
 * required. Returns '' when nothing in the room is blocked, so the caller can hide an empty box.
 *
 * ONE ROW PER DISTINCT REASON, not per tile — twelve identical rows explain nothing and would push
 * the zone key off the bottom of the canvas. The first row carries the count, because "3 ORDERS
 * STUCK" is the fact that makes a player look, and it is a fact no tooltip aggregates.
 *
 * ⚠️ THE TITLE NAMES THE ORDER KINDS, and that is a send-back fix rather than decoration. The wire
 * tuple carries `order` for a reason argued at length in `WireFormat.Blocked.cs` — and until this
 * line existed, `order` reached the player ONLY through the `<title>` label, i.e. through the exact
 * channel this module's own header calls inadequate ("needs a hover nobody knows to try and does not
 * exist on a touch device"). Half the justification for the tuple element was being delivered by the
 * surface the file argues against. So: "10 DIG ORDERS STUCK", or "12 DIG/BUILD ORDERS STUCK" when
 * more than one kind is stuck, in FIRST-SEEN order (the host's emission order — dig, strip, build),
 * never sorted, so the words track the wire. A row whose order this client cannot name contributes
 * nothing to the prefix and the title falls back to the bare "N ORDERS STUCK".
 *
 * @param {{orderName:string, reasonName:string, label:string, reasonText:string}[]} tiles
 *        roomBlockedTiles output
 * @returns {string}
 */
export function blockedKeyHtml(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) return '';
  const seen = new Map();
  const orders = [];
  for (const t of tiles) {
    if (!t) continue;
    const key = t.reasonName || '?';
    if (!seen.has(key)) seen.set(key, t.reasonText || 'STUCK — REASON UNKNOWN TO THIS CLIENT');
    const o = t.orderName ? String(t.orderName).toUpperCase() : '';
    if (o && o !== 'ORDER' && !orders.includes(o)) orders.push(o);
  }
  const kinds = orders.length ? esc(orders.join('/')) + ' ' : '';
  const out = ['<span class="rz-key-title">' + tiles.length + ' ' + kinds + 'ORDER'
    + (tiles.length === 1 ? '' : 'S') + ' STUCK</span>'];
  for (const [kind, text] of seen) {
    out.push('<span class="rz-key-row"><i class="rz-key-sw rz-key-sw-blocked-' + esc(kind) +
      '"></i><span class="rz-key-text">' + esc(text) + '</span></span>');
  }
  return out.join('');
}
