// PURE model for the STOCKPILE-ZONE overlay (console-retirement WP-3). Turns the sparse `zones`
// wire channel into what a surface has to draw: which tiles inside the focused room are zoned, which
// of them are RESTRICTED (a filter is set), which are BACKED OFF (no hauler has reached them
// recently), and a compact label for each. No DOM, no wire, no mutation — the same shape and the same
// reason as stock-filter-model.js / decks-model.js: every decision the overlay makes has to be
// node-testable without a browser.
//
// WHY THIS EXISTS AT ALL. Before this channel, a filtered stockpile tile was indistinguishable from
// an unfiltered one on every surface (`controls.js`: *"there is no wire channel for a filter"*), and a
// zone that no crew can reach never filled with nothing anywhere saying so (MECHANICS §13.17). Those
// are E0-4 feedback gaps 1 and 3.
//
// THE LABELS ARE DELIBERATELY WEAK. `RESTRICTED` says only *that* a filter is set — the kind list
// comes from `stockFilterLabel`, which is the ONE authority for naming a mask and already mirrors the
// sim's ItemKind enum member-for-member. And the back-off label is "NO HAULER REACHED THIS RECENTLY",
// not "UNREACHABLE": the sim-side map is a rate limiter with three lifts, so the stronger word would
// be a claim the data cannot support. See ZONE_FLAG_BACKED_OFF in ../wire/messages.js.

import { ZONE_FLAG_BACKED_OFF } from '../wire/messages.js';
import { ACCEPT_ALL, stockFilterLabel } from './stock-filter-model.js';

/** The wording for a backed-off tile. Weak on purpose — see the header. */
export const BACKED_OFF_LABEL = 'NO HAULER REACHED THIS RECENTLY';

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
 * The decoded `zones` rows that fall inside a Room-Zoom focus rect, in the host's order, each
 * annotated with what the overlay draws.
 *
 * `focus` is the Room Zoom's focused slot: `{deck, rx, ry, rw, rh}` (tile-space rect, the same shape
 * `room-model.js`'s roomCells/roomDecor take). A row on another deck, or outside the rect, is
 * dropped — the Room Zoom is room-scoped and drawing a neighbour's zone would be a lie about which
 * room you are editing.
 *
 * Returns `[{tx, ty, mask, restricted, backedOff, label}]` where `tx`/`ty` are the ORIGINAL tile
 * coordinates (the caller owns the local transform, exactly as roomCells does) and `label` is the
 * one-line human reading: the back-off wording wins when both apply, because a zone that nothing can
 * reach is the more urgent fact than what it would have accepted.
 *
 * Order is the input's, unchanged — the host emits canonical z,y,x and a client sort would be a
 * second authority on order. PURE; never mutates the input rows.
 * @param {{x:number,y:number,deck:number,mask:number,flags:number}[]|null} zones
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}|null} focus
 */
export function roomZoneTiles(zones, focus) {
  if (!Array.isArray(zones) || !focus) return [];
  const out = [];
  for (const z of zones) {
    if (!z || z.deck !== focus.deck) continue;
    if (z.x < focus.rx || z.x >= focus.rx + focus.rw) continue;
    if (z.y < focus.ry || z.y >= focus.ry + focus.rh) continue;
    const restricted = zoneRestricted(z.mask);
    const backedOff = zoneBackedOff(z.flags);
    out.push({
      tx: z.x,
      ty: z.y,
      mask: z.mask,
      restricted,
      backedOff,
      label: backedOff ? BACKED_OFF_LABEL : (restricted ? stockFilterLabel(z.mask) : 'ACCEPTS ALL'),
    });
  }
  return out;
}

/**
 * A one-deck tally for a readout line: how many stockpile tiles the deck has, how many are
 * restricted, how many are backed off. `deck === null` tallies the whole ship.
 *
 * This is the data behind plan §5 gap 2 ("I changed the filter and nothing happened") — the count of
 * already-painted tiles is the only thing that can say a filter change did not reach them. PURE.
 * @param {{x:number,y:number,deck:number,mask:number,flags:number}[]|null} zones
 * @param {number|null} [deck]
 * @returns {{tiles:number, restricted:number, backedOff:number}}
 */
export function zoneSummary(zones, deck = null) {
  const t = { tiles: 0, restricted: 0, backedOff: 0 };
  if (!Array.isArray(zones)) return t;
  for (const z of zones) {
    if (!z) continue;
    if (deck !== null && z.deck !== deck) continue;
    t.tiles += 1;
    if (zoneRestricted(z.mask)) t.restricted += 1;
    if (zoneBackedOff(z.flags)) t.backedOff += 1;
  }
  return t;
}
