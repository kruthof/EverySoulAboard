// THE STOCKPILE ACCEPTS ROW'S MARKUP, PURE (console-retirement WP-6). One string builder — the chip
// strip that sets the accept-mask the Room Zoom's STOCKPILE tool paints with — plus the sentence that
// says what the chips actually do. No DOM, no wire, no state; `roomzoom-view.js` assigns the result
// and resolves a click through one delegated `closest('[data-rzaccept]')`.
//
// WHY THIS PACKAGE EXISTS AT ALL, in one paragraph, because the shape of the bug is the shape of the
// fix. The accept-mask has been per-tile in the sim since E0-4 and it works; every painted tile emits
// `Cmd.filter(x, y, mask)`. But the ONLY thing in the whole client that could ever change that mask
// was the `onclick` on the console shell's ACCEPTS chips (`hud.js`, `#stockfilter`) — a surface that
// is deprecated, closed to new work and scheduled for deletion. `overview-view.js` and
// `roomzoom-view.js` carried ZERO chips between them, so on the standard surface the mask was pinned
// at `defaultStockFilter()` forever: every zone accepted everything and the per-tile filtering the sim
// supports was unreachable. That is E0-4's original mistake — the filter UI built on the wrong
// surface — surviving one package past the guard that was written to catch it, because WP-0's verb
// parity assertion checks VERBS and `stockpile` was present. A verb can be present and inert.
//
// WHY A PURE STRING BUILDER AND NOT A FUNCTION INSIDE THE VIEW. Same reason `zone-overlay.js` was
// extracted, and its header records the measurement: with the builder inside `roomzoom-view.js` there
// is no DOM in this suite to see it, so the only available guard is a source scan proving the function
// is CALLED — and WP-3 measured that making its builder `return ''` unconditionally left 546/546
// tests passing. A package whose entire purpose is "the player can choose, and can read back what
// they chose" must not ship zero assertions that anything is drawn. Precedent is house style:
// `render/pawn-svg.js`, `ui/deck-minimap.js`, `ui/zone-overlay.js`, `items/index.js`.
//
// THE MODEL IS NOT FORKED. `STOCK_KINDS` / `stockKindAccepted` come from `stock-filter-model.js`,
// which mirrors the sim's `ItemKind` enum member-for-member and is tripwired against BOTH
// `sim/Sim.Core/Entities/ItemStack.cs` and `hosts/tui/Ui/StockFilterModel.cs`. A second table here
// would be a second vocabulary for the same seven bits, in a third language.

import { STOCK_KINDS, stockKindAccepted } from './stock-filter-model.js';

/**
 * THE SENTENCE THIS PACKAGE WAS ASKED FOR (plan §5, gap 2). The chips apply to tiles painted NEXT;
 * they do not reach back and re-filter a zone that is already on the floor. That was true of the
 * console's chips too, where it was said only in a `title=` attribute nobody hovers — "true, and
 * invisible", as the plan puts it. It is a visible line now.
 *
 * Exported so a test asserts the words the player reads rather than re-typing them, and so a future
 * surface cannot word the same fact a second way.
 */
export const APPLIES_NEXT_LABEL = 'APPLIES TO TILES YOU PAINT NEXT';

/** XML/HTML text escape. Local rather than imported, exactly as `zone-overlay.js` argues: a builder
 *  that emits markup must never depend on a caller having sanitised its input. The kind labels are
 *  ASCII from a frozen table today; "it happens to be safe input" is not a contract. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * THE HONEST HALF. How many tiles already zoned in THIS room carry a filter other than the one the
 * chips currently show, spelled out for the player.
 *
 * It is deliberately ROOM-SCOPED and says so in the words, because the surface is: `roomZoneTiles`
 * drops every row outside the focused rect on the stated grounds that drawing a neighbour's zone
 * would be a lie about which room you are editing, and a count that silently spanned the ship would
 * be the same lie in text. A player who changes the chips and sees "4 ZONED TILES IN THIS ROOM KEEP A
 * DIFFERENT FILTER" has been told the exact thing the old UI left them to discover by watching
 * haulers.
 *
 * Empty string for zero — the caller then shows only the APPLIES-NEXT line, so a room with no zones
 * (the overwhelmingly common case) reads clean. PURE.
 * @param {number} n count from `zoneMaskMismatch` (zone-model.js)
 * @returns {string}
 */
export function mismatchLabel(n) {
  const k = n | 0;
  if (k <= 0) return '';
  return k + ' ZONED TILE' + (k === 1 ? '' : 'S') + ' IN THIS ROOM KEEP' + (k === 1 ? 'S' : '') +
    ' A DIFFERENT FILTER';
}

/**
 * The chip strip: a header, one real `<button>` per ItemKind lit according to `mask`, and the
 * two-part caption under them.
 *
 * REAL BUTTONS, DELIBERATELY, and this is inherited rather than invented — the console's own chips
 * are `<button>`s and `hud.js:300-304` records why: they land in the natural tab order and
 * Enter/Space activate them natively, with no new global hotkey (the digits 1–7 are the LENS keys).
 * This betters it in two small ways the console did not do: an explicit `type="button"` (inside a
 * `<form>` an implicit button SUBMITS, and this row is one `innerHTML` assignment away from living
 * anywhere) and `aria-pressed`, so a screen reader reads the toggle STATE and not just the label —
 * `.on` is a class, and a class is invisible to assistive tech.
 *
 * @param {number} mask the current accept-mask
 * @param {number} [mismatch] count of already-zoned tiles in the room whose mask differs
 * @returns {string} HTML
 */
export function acceptsRowHtml(mask, mismatch) {
  const out = ['<div class="rz-acc-chips"><span class="rz-acc-label">ACCEPTS &#9656;</span>'];
  for (const { kind, label } of STOCK_KINDS) {
    const on = stockKindAccepted(mask, kind);
    out.push('<button type="button" class="rz-acc-chip' + (on ? ' on' : '') +
      '" data-rzaccept="' + esc(kind) + '" aria-pressed="' + (on ? 'true' : 'false') +
      '" title="' + esc(label) + ' &mdash; ' + (on ? 'accepted by' : 'kept out of') +
      ' stockpile tiles you paint next">' + esc(label) + '</button>');
  }
  out.push('</div>');
  const diff = mismatchLabel(mismatch);
  out.push('<div class="rz-acc-note">' + APPLIES_NEXT_LABEL +
    (diff ? '<span class="rz-acc-diff"> &middot; ' + esc(diff) + '</span>' : '') + '</div>');
  return out.join('');
}
