// PURE DERIVATION for the STOCKPILE-ZONE overlay (console-retirement WP-3). Turns the sparse `zones`
// wire channel into what a surface has to draw: which tiles inside the focused room are zoned, which
// of them are RESTRICTED (a filter is set), which are BACKED OFF (no hauler has reached them
// recently), the wording for each, and the KEY that tells the player what the marks mean. No DOM, no
// markup, no wire, no mutation — the same shape and the same reason as stock-filter-model.js /
// decks-model.js: every decision the overlay makes has to be node-testable without a browser. The
// markup itself is `zone-overlay.js` (also pure); `roomzoom-view.js` is one call to each.
//
// WHY THIS EXISTS. Before this channel a filtered stockpile tile was indistinguishable from an
// unfiltered one on every surface, and a zone no crew can reach never filled with nothing anywhere
// saying so (MECHANICS §13.17). Those are E0-4 feedback gaps 1 and 3. `controls.js` used to carry the
// sentence "there is no wire channel for a filter" — WP-3 is the package that made it false, and that
// comment (plus two others) was corrected in the same commit.
//
// TWO FACTS, BOTH LEGIBLE, NEITHER SUPPRESSING THE OTHER. A tile can be restricted AND backed off, and
// that is the state a player most needs to tell apart: "nothing is arriving" reads very differently
// when the zone is also refusing all but one of the kinds. So `label` carries BOTH, with the back-off
// first because it is the more urgent, and the two visual marks are deliberately different colours
// (zone-overlay.js). An earlier draft let the back-off wording REPLACE the filter list; on a both-tile
// the filter was then unreadable by any means.
//
// THE LABELS ARE DELIBERATELY WEAK. The kind list comes from `stockFilterLabel`, which is the ONE
// authority for naming a mask and already mirrors the sim's ItemKind enum member-for-member. And the
// back-off wording is "NO HAULER REACHED THIS RECENTLY", not "UNREACHABLE": the sim-side map is a rate
// limiter with three lifts, so the stronger word would be a claim the data cannot support. See
// ZONE_FLAG_BACKED_OFF in ../wire/messages.js.
//
// KNOWN, DISCLOSED: the 32-bit ceiling is only HALF honoured downstream. `decodeZones` keeps the mask
// exact (see its note), but `stockFilterLabel` reduces with `(mask | 0) & ACCEPT_ALL`, so a mask with a
// bit at 32+ would be mis-NAMED even though it arrived intact. Harmless while ItemKind has 8 members,
// and out of this package's file set (stock-filter-model.js is WP-6's); flagged here so the eventual
// widening fixes both halves. `zoneRestricted` below does NOT use `| 0`, so the BADGE stays correct
// even where the name would not be.

import { ZONE_FLAG_BACKED_OFF } from '../wire/messages.js';
import { clampTileToRoom } from './room-model.js';
import { ACCEPT_ALL, stockFilterLabel } from './stock-filter-model.js';

/** The wording for a backed-off tile. Weak on purpose — see the header. */
export const BACKED_OFF_LABEL = 'NO HAULER REACHED THIS RECENTLY';

/**
 * The ONE spelling of "this zone accepts <kinds>", shared by the per-tile `<title>` and the key.
 *
 * It exists because the two disagreed. The tooltip said `FOOD` where the key said `ACCEPTS FOOD`, and
 * on a multi-kind tile that also broke the SEPARATOR: `stockFilterLabel` joins kinds with the same
 * ` · ` the composed label uses, so a restricted-and-unreached tile read
 * `NO HAULER REACHED THIS RECENTLY · FOOD · PARTS` — three items at one level, where the first is a
 * status and the rest are a list. With the prefix, `· ACCEPTS FOOD · PARTS` reads as one clause whose
 * list belongs to ACCEPTS. Deriving both callers from this function is the point: a prefix that has to
 * be written twice is a prefix that will eventually be written two ways. PURE.
 * @param {number} mask
 * @returns {string}
 */
export function acceptsLabel(mask) { return 'ACCEPTS ' + stockFilterLabel(mask); }

/** The wording for a zoned tile with no filter on it — 'ACCEPTS ALL', DERIVED so it cannot drift from
 *  the restricted spelling (`stockFilterLabel(ACCEPT_ALL)` is 'ALL'). */
export const ACCEPTS_ALL_LABEL = acceptsLabel(ACCEPT_ALL);

/**
 * Is this tile's filter a real restriction? True iff the mask is not accept-all.
 *
 * The host ships accept-all (not 0, not a sentinel) for a tile with no filter entry, so this is the
 * whole test and there is no absence case. A junk/absent mask reads as accept-all — i.e. the
 * PERMISSIVE direction: an unreadable mask must not paint a restriction badge the player never set.
 * PURE.
 * @param {number} mask
 * @returns {boolean}
 */
export function zoneRestricted(mask) {
  if (typeof mask !== 'number' || !isFinite(mask)) return false;
  return mask !== ACCEPT_ALL;
}

/**
 * Does this tile carry a live haul back-off? Bit 0 of the tuple's `flags`. PURE.
 * @param {number} flags
 * @returns {boolean}
 */
export function zoneBackedOff(flags) {
  return ((flags | 0) & ZONE_FLAG_BACKED_OFF) !== 0;
}

/**
 * The one-line human reading of a tile's two facts. Back-off FIRST (the urgent one), then the accepted
 * kinds when the tile is restricted; `ACCEPTS ALL` when neither applies — never an empty string, so a
 * surface that shows this can always show something. PURE.
 * @param {number} mask @param {number} flags
 * @returns {string}
 */
export function zoneLabel(mask, flags) {
  const parts = [];
  if (zoneBackedOff(flags)) parts.push(BACKED_OFF_LABEL);
  // `acceptsLabel`, NOT a bare `stockFilterLabel` — the tooltip and the key must spell the same fact
  // the same way, and on a multi-kind tile the prefix is also what keeps ` · ACCEPTS FOOD · PARTS`
  // from reading as three peer items. See acceptsLabel's own doc.
  if (zoneRestricted(mask)) parts.push(acceptsLabel(mask));
  return parts.length ? parts.join(' · ') : ACCEPTS_ALL_LABEL;
}

/**
 * The decoded `zones` rows that fall inside a Room-Zoom focus rect, in the host's order, each
 * annotated with what the overlay draws.
 *
 * `focus` is the Room Zoom's focused slot: `{deck, rx, ry, rw, rh}` (tile-space rect, the same shape
 * `room-model.js`'s roomCells/roomDecor take). A row on another deck, or outside the rect, is
 * dropped — the Room Zoom is room-scoped and drawing a neighbour's zone would be a lie about which
 * room you are editing.
 *
 * Returns `[{tx, ty, mask, restricted, backedOff, label}]` where `tx`/`ty` are the ORIGINAL tile
 * coordinates (the caller owns the local transform, exactly as roomCells does).
 *
 * ORDER IS THE INPUT'S, UNCHANGED. The host emits canonical z,y,x and a client sort would be a second
 * authority on order. PURE — the input rows are never mutated and never aliased into the output; both
 * properties are pinned by fixtures built to distinguish them (zone-model.test.js), because the
 * obvious fixtures cannot: a set of ascending tiles is its own sorted order, which is exactly the
 * shape that let a loop-swap mutation survive on the host side of this package.
 * @param {{x:number,y:number,deck:number,mask:number,flags:number}[]|null} zones
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}|null} focus
 */
export function roomZoneTiles(zones, focus) {
  if (!Array.isArray(zones) || !focus) return [];
  const out = [];
  for (const z of zones) {
    if (!z || z.deck !== focus.deck) continue;
    // ⭐ THE **DRAWN FLOOR**, ASKED THROUGH `clampTileToRoom` RATHER THAN RE-STATED AS TWO INEQUALITIES
    // (2026-08-06, the scene inset). `focus` is the wire's WALL-INCLUSIVE window and the cutaway now
    // draws only its interior; a zone painted on the hull ring would be tinted onto a tile the scene
    // has no floor for. The hand-written rect test WAS that stale second authority — it agreed with
    // the clamp for a year and would have gone on agreeing with the OLD one after the inset moved it.
    if (!clampTileToRoom(z.x, z.y, focus)) continue;
    out.push({
      tx: z.x,
      ty: z.y,
      mask: z.mask,
      restricted: zoneRestricted(z.mask),
      backedOff: zoneBackedOff(z.flags),
      label: zoneLabel(z.mask, z.flags),
    });
  }
  return out;
}

/**
 * HOW MANY of these tiles carry a filter OTHER than `mask` (console-retirement WP-6, plan §5 gap 2).
 *
 * The chips on the Room Zoom's palette apply to tiles painted NEXT — they do not reach back and
 * re-filter a zone already on the floor. Saying that is half the fix; this is the other half, because
 * the sentence alone is a rule and the count is the player's actual situation. `accepts-row.js` turns
 * it into words.
 *
 * AN UNREADABLE MASK IS COUNTED AS MATCHING, i.e. it raises no alarm — the same permissive direction
 * `zoneRestricted` takes above and for the same reason: a mask the client cannot read must never make
 * the UI claim a discrepancy the player did not create. `roomZoneTiles` has already scoped the input
 * to the focused room, so this is room-scoped by construction and the wording says so. PURE.
 * @param {{mask:number}[]} tiles roomZoneTiles output
 * @param {number} mask the mask the chips currently show
 * @returns {number}
 */
export function zoneMaskMismatch(tiles, mask) {
  if (!Array.isArray(tiles)) return 0;
  const m = mask | 0;
  let n = 0;
  for (const t of tiles) {
    if (!t || typeof t.mask !== 'number' || !isFinite(t.mask)) continue;
    if ((t.mask | 0) !== m) n += 1;
  }
  return n;
}

/**
 * THE KEY — what the marks on the floor MEAN, in words, for the states actually present in this room.
 *
 * This is the fix for the thing that made the whole package nearly pointless. The first draft drew an
 * amber hatch and a corner wedge and put the only wording in an SVG `<title>`, inside a group carrying
 * `pointer-events="none"` — so no tooltip could ever fire and what shipped to a player was two
 * unexplained marks: very close to the silence (MECHANICS §13.17) this channel exists to end. A key
 * needs no hover, no pointer and no tooltip, so it cannot be switched off by an attribute.
 *
 * Returns `[{kind, label}]` with `kind` in `'zone' | 'restricted' | 'backedoff'`:
 *   'zone'        one row whenever the room has any zoned tile at all
 *   'restricted'  ONE ROW PER DISTINCT MASK present, ascending by mask, each naming its kinds — two
 *                 differently-filtered zones in one room are two different facts, and collapsing them
 *                 to a bare "RESTRICTED" would hide the one the player is looking for
 *   'backedoff'   one row when any tile is backed off
 * Order is fixed (zone, restricted…, backedoff) — a presentation decision, made HERE so it is
 * asserted rather than left to whichever surface renders it. Empty for a room with no zones, so the
 * key hides itself. PURE.
 * @param {{restricted:boolean, backedOff:boolean, mask:number}[]} tiles roomZoneTiles output
 * @returns {{kind:string, label:string}[]}
 */
export function zoneLegendRows(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) return [];
  const rows = [{ kind: 'zone', label: 'STOCKPILE' }];
  const masks = [];
  for (const t of tiles) {
    if (!t || !t.restricted) continue;
    if (masks.indexOf(t.mask) < 0) masks.push(t.mask);
  }
  masks.sort((a, b) => a - b);
  for (const m of masks) rows.push({ kind: 'restricted', label: acceptsLabel(m) });
  if (tiles.some((t) => t && t.backedOff)) rows.push({ kind: 'backedoff', label: BACKED_OFF_LABEL });
  return rows;
}
