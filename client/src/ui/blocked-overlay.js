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
import { U, roomInterior } from './room-model.js';

/** XML/HTML text escape. Local rather than imported: both builders emit markup and must never depend
 *  on a caller having sanitised a label. Reason text is ASCII today, but `<title>` and a key row both
 *  interpolate model text, and "it happens to be safe input" is not a contract. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── THE PAPER DIALECT (visual redesign, charter §1, rulings E3 + E4) ──
//
// ⚠️ THE TWO OLD COLOURS ARE RETIRED AND THE ARGUMENT THAT PICKED THEM SURVIVES INTACT. The badge
// was `#c25a3f` *"deliberately not the queue-amber"*, over a near-black scrim. Under E3 there is ONE
// accent, so "fault, not queue" can no longer be said in hue — it is said in DASH: a queued order
// wears oxblood `8 5`, and a REFUSED one wears the same oxblood in the FAULT spelling. Here that is
// the dashed outline plus a SOLID oxblood leader and label, which is the design's own annotation
// idiom (`Perilune Game.dc.html` Screen 02: an oxblood leader line to an oxblood mono label).
//
// ⚠️ AND THE SCRIM IS A PAPER WASH NOW, FOR `zone-overlay.js`'s reason: the ground under this layer
// is paper, so a near-black scrim would make the inert tile the LOUDEST thing in the room. Washing
// back TOWARDS the paper is "nothing is happening here" in the new ground's terms.
const SCRIM = 'rgba(235,228,209,.55)';  // the DIM half — byte-identical to zone-overlay.js's
const FAULT = '#7B2C22';                // THE ONE ACCENT (charter §1) — attention/fault
const PLATE = '#EBE4D1';                // paper, so the badge reads over hatch, rubble and grid
const ORDER_DASH = '8 5';               // charter §1 — the queued-order dash the refusal outlines

/** Round to 2dp with no `-0` — the `n()` discipline both surfaces already use (InvariantCulture-safe:
 *  arithmetic + ASCII concat only, no locale API, so a de-DE machine emits the same bytes). */
function n(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/** The shipped mono stack, byte-identical to `oblique.FONT.mono` — declared literally here for the
 *  reason every colour in this module is: it imports geometry, not the theme. The ⚠ itself is never
 *  set in it (it is drawn as paths, below); only the reason SENTENCE is, and that is ASCII. */
const MONO = "'Space Mono', ui-monospace, 'SF Mono', Menlo, monospace";

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
    // ⭐ VR-P3 — THE DASHED OUTLINE IS THE SECOND MARK NOW, IN PLACE OF THE IN-CELL BADGE. It rides
    // the FLOOR PLANE with the scrim (it is paint on the tile), and the ⚠ plate that used to sit in
    // the tile's top-left has moved OUT of the cell into `blockedBadgeSvg`, upright, with a leader —
    // because a ⚠ sheared into a cabinet-oblique parallelogram is a smear, and because the design's
    // own way of pointing at a thing is a leader line to a label beside the drawing.
    + '<rect class="rz-blocked-ring" x="' + n(x + 0.5) + '" y="' + n(y + 0.5)
    + '" width="' + n(Math.max(0, w - 1)) + '" height="' + n(Math.max(0, h - 1))
    + '" rx="2" fill="none" stroke="' + FAULT + '" stroke-width="1.5" stroke-dasharray="'
    + ORDER_DASH + '"/>'
    + '</g>';
}

/**
 * THE UPRIGHT BADGE + LEADER + LABEL — E4's "blocked/D5 badge → oxblood dashed outline + leader
 * label (bench-ghost idiom)", drawn in a `unit × unit` box whose BOTTOM CENTRE stands on the tile.
 *
 * The ⚠ is still a DRAWN PATH and never a font glyph (charter §1: a fallback face has different
 * advances and this box is width-pinned nowhere, but the rule is the repo's and it is cheap to keep).
 * The label is the reason SENTENCE — the words D5 exists to put on screen ("NO WAY TO WALK TO IT") —
 * haloed so it survives the hatch, the grid and whatever is standing on the tile.
 *
 * @param {string} reason the reason vocabulary name, for the class hook
 * @param {string} text   the player-facing sentence
 * @param {number} unit   the box side (the cell unit)
 */
export function blockedBadgeSvg(reason, text, unit) {
  if (!(unit > 0)) return '';
  const cx = unit / 2;
  const topY = -unit * 0.55;            // the label sits ABOVE the tile, clear of what stands on it
  const cls = 'rz-blocked-badge' + (reason ? ' rz-blocked-badge-' + reason : '');
  // ⛔ THE BADGE TAKES NO POINTER EVENTS — A CAPTION IS NOT A TARGET. It is drawn with `place.stand`,
  // UPRIGHT and floating ABOVE its tile at `-0.55·unit`, inside a layer that is `visiblePainted` for
  // the CELL outlines' `<title>`; so its ink looked pressable and a press on it designated a tile the
  // player was not pointing at (independent review, 2026-08-05: `strip x:34,y:5` while the room's
  // blocked tiles were 35,2 / 38,2 / 41,2 / 35,6).
  //
  // ⚠️⚠️ AND SAY THE HARD HALF: THIS ATTRIBUTE IS **MEASURED INERT ON THE SHIPPED WRECK**, so it is a
  // RULE rather than a fix, and the reported press is UNCHANGED by it. Driven on the life-support
  // room after four refused STRIPs: a 576-point grid over the badge found 72 points of its own ink,
  // and under ALL 72 lies a bare cutaway floor path — not one `data-tile` element anywhere beneath
  // it. So `tileAt` falls to the floor-plane inverse either way and still answers `strip x:34,y:5`,
  // which IS the honest floor tile for that screen point. What the attribute buys is that the caption
  // can never SHADOW a real piece that happens to stand under it; what it does not buy is a press on
  // a label meaning anything better than "the floor behind the label".
  // ⛔ A `data-tile` WOULD BE WORSE, not better: `said` below de-duplicates by SENTENCE, so one badge
  // captions a GROUP of tiles and any single tile it named would be a guess dressed as an answer.
  // The residual — an upright label's ink reads as pressable and designates the floor under it — is
  // FILED in `docs/HANDOVER.md`'s open list, not closed here.
  // It costs no tooltip: the `<title>` lives on `blockedCellSvg`'s cell, not here.
  // ⚠️ THE PLATE AND THE TYPE ARE IN THE **DOCUMENT'S** SCALE, NOT THE TILE'S, and both directions of
  // that were measured on a render rather than reasoned about. Fixed at the plan view's 12 units the
  // plate is a speck inside a ~95-unit cutaway tile; scaled by `unit/32` the sentence comes out at
  // 22 px and shouts down the room it is explaining. A LABEL BELONGS TO THE PAGE: the scene sets its
  // type once (serif 24 title, mono 9 stat line, mono 8.5 leader labels) and this is one of those
  // labels. Only the LEADER is in cell units, because the leader is geometry — it has to reach the
  // tile. `k` is therefore a gentle floor, not the cell ratio: it lets a small-tile caller keep the
  // plate proportionate without letting a large-tile one inflate the words.
  const k = Math.min(1.6, Math.max(1, unit / 32));
  const bh = 12 * k, bw = 12 * k;
  const bx = cx - bw / 2, by = topY - bh;
  return '<g class="' + cls + '" pointer-events="none">'
    // the leader: from the tile's floor centre up to the plate
    + '<path class="rz-blocked-leader" d="M' + n(cx) + ' ' + n(unit) + ' L' + n(cx) + ' ' + n(topY)
    + '" fill="none" stroke="' + FAULT + '" stroke-width="' + n(0.9 * k) + '" opacity="0.75"/>'
    + '<rect x="' + n(bx) + '" y="' + n(by) + '" width="' + n(bw) + '" height="' + n(bh)
    + '" rx="' + n(2.5 * k) + '" fill="' + PLATE + '" stroke="' + FAULT + '" stroke-width="' + n(1.2 * k) + '"/>'
    + '<path d="M' + n(cx) + ' ' + n(by + 2.6 * k) + 'V' + n(by + 7.2 * k)
    + '" stroke="' + FAULT + '" stroke-width="' + n(1.6 * k) + '" stroke-linecap="round"/>'
    + '<circle cx="' + n(cx) + '" cy="' + n(by + 9.4 * k) + '" r="' + n(0.9 * k) + '" fill="' + FAULT + '"/>'
    + (text
      ? '<text class="rz-blocked-say" x="' + n(cx + bw) + '" y="' + n(by + bh - 2.5 * k)
        + '" text-anchor="start" font-family="' + MONO + '" font-size="' + n(7.5 * k)
        + '" letter-spacing="' + n(0.9 * k) + '"'
        + ' fill="' + FAULT + '" stroke="' + PLATE + '" stroke-width="' + n(3.4 * k) + '" paint-order="stroke">'
        + esc(text) + '</text>'
      : '')
    + '</g>';
}

/**
 * The Room Zoom's blocked layer as one SVG string in room-local logical units, or ''.
 *
 * POINTER EVENTS ARE ON, DELIBERATELY — the `zone-overlay.js` finding, inherited rather than
 * rediscovered. Every other group in this stack carries `pointer-events="none"`, and copying that
 * silently disables the `<title>` tooltip. The Room Zoom's click/drag handlers are bound to the
 * CONTAINER, so a child receiving the event and letting it bubble changes nothing.
 * `cursor="inherit"` keeps the armed-tool crosshair.
 *
 * ⚠️ THE INHERITED SENTENCE *"they never read `e.target`"* IS STALE AND IS CORRECTED HERE TOO — since
 * VR-P3-a `tileAt` resolves `e.target.closest('[data-tile]')` first. The dashed CELL outlines below
 * are `place.cell` — sheared into the floor plane on their own tile — so they fall through to the
 * floor inverse and answer correctly, and they keep their pointer events for the `<title>`.
 *
 * ⛔ THE LEADER BADGE IS `pointer-events="none"` — see `blockedBadgeSvg` for the measurement, and for
 * the honest limit: on the shipped wreck the attribute changes NOTHING (72 of 72 ink points have no
 * `data-tile` under them, so the floor inverse answers either way). It is the rule that a caption is
 * not a target, and insurance against the badge ever shadowing a piece; the press itself still means
 * "the floor behind the label", which is FILED rather than closed.
 *
 * ⚠️ AND THE ONE STRUCTURAL FACT WORTH WRITING DOWN: `rz-blockeds` is the ONLY layer painted ABOVE
 * the `data-tile` tier that takes pointer events at all. Today it shadows nothing — its cells lie in
 * the floor plane and its badge is now inert — but that is GEOMETRY, not a guarantee. A future shape
 * on this layer with real ink over a fitting would sit between the player and that fitting's own
 * answer, and would have to carry the tile itself.
 *
 * @param {{tx:number, ty:number, reasonName:string, label:string}[]} tiles roomBlockedTiles output
 * @param {{rx:number, ry:number}} focus the focused room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function blockedLayerSvg(tiles, focus, unit = U, place = null) {
  if (!Array.isArray(tiles) || !tiles.length || !focus) return '';
  // THE INTERIOR'S ORIGIN, for the `place`-less plan fallback only (2026-08-06, the scene inset).
  // `roomBlockedTiles` is clamped to the interior, so the fallback offsets have to address the same
  // rect — one origin, asked for, rather than two that agreed until the drawn rect moved.
  const { rx, ry } = roomInterior(focus) || { rx: 0, ry: 0 };
  const out = [];
  // ⭐ ONE LEADER LABEL PER DISTINCT SENTENCE, and every tile keeps its outline. Twelve leaders
  // saying NO AIR over twelve adjacent tiles is a wall of type that hides the room it is explaining;
  // twelve dashed outlines and ONE sentence is the same information and is readable. It is the
  // `blockedKeyHtml` rule (one row per distinct sentence) applied to the floor, so the badge on the
  // tile and the words beside it are chosen by the same predicate and cannot disagree.
  const said = new Set();
  for (const t of tiles) {
    if (!t) continue;
    const at = place ? [0, 0] : [(t.tx - rx) * unit, (t.ty - ry) * unit];
    const cell = blockedCellSvg(t.reasonName, t.label, at[0], at[1], unit, unit);
    if (!cell) continue;
    out.push(place ? '<g transform="' + place.cell(t.tx, t.ty) + '">' + cell + '</g>' : cell);
    const say = t.reasonText || '';
    const key = (t.reasonName || '?') + ' ' + say;
    if (said.has(key)) continue;
    said.add(key);
    const badge = blockedBadgeSvg(t.reasonName, say, unit);
    if (badge) out.push(place ? '<g transform="' + place.stand(t.tx, t.ty) + '">' + badge + '</g>' : badge);
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
 * ⭐ M3-13 — "DISTINCT" IS NOW DISTINCT *SENTENCE*, NOT DISTINCT REASON CODE, and the change is not
 * cosmetic. A row's `detail` can change its words (`no_consumable` names the item it wants), so two
 * tiles waiting on two different items share a reason code and say two different true things. Keyed
 * on the code alone, the key box would print the FIRST one and silently swallow the second — the
 * badge on the floor and the words beside it disagreeing about the same room, which is precisely
 * what deriving both from one `roomBlockedTiles` call is supposed to make impossible. The SWATCH
 * class still comes from the reason code (there is one colour per reason, not per sentence).
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
    const reason = t.reasonName || '?';
    const text = t.reasonText || 'STUCK — REASON UNKNOWN TO THIS CLIENT';
    // The key is (reason, sentence) — see the header. The value keeps the reason on its own so the
    // swatch class stays per-COLOUR while the row stays per-SENTENCE.
    const key = reason + ' ' + text;
    if (!seen.has(key)) seen.set(key, { reason, text });
    const o = t.orderName ? String(t.orderName).toUpperCase() : '';
    if (o && o !== 'ORDER' && !orders.includes(o)) orders.push(o);
  }
  const kinds = orders.length ? esc(orders.join('/')) + ' ' : '';
  const out = ['<span class="rz-key-title">' + tiles.length + ' ' + kinds + 'ORDER'
    + (tiles.length === 1 ? '' : 'S') + ' STUCK</span>'];
  for (const row of seen.values()) {
    out.push('<span class="rz-key-row"><i class="rz-key-sw rz-key-sw-blocked-' + esc(row.reason) +
      '"></i><span class="rz-key-text">' + esc(row.text) + '</span></span>');
  }
  return out.join('');
}
