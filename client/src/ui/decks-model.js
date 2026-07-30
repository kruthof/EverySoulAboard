// DECKS view-model — PURE. Turns the decoded `decks` + `rooms` wire channels into a render-ready
// per-deck structure for the warm SVG Overview / Room-Zoom: each slot carries its rect, its warm
// material/floor/label colours (via roomMaterial), a display label (a roomType→UPPERCASE map with an
// anchor-name fallback), live occupancy/active flags, and the room's atmosphere looked up by anchor.
//
// No DOM, no wire access, no clock. Everything is deterministic and tolerant: unknown roomTypes fall
// back to the neutral material, a slot with no live room still gets a name, and a null/garbage input
// yields [].
//
// ⭐ M1-L — EVERY COMPARTMENT IS A ROOM, AND EVERY ROOM HAS A NAME. The naming rule below is TOTAL:
// there is no input for which `displayName` comes out blank. That is a requirement, not a courtesy —
// the Overview draws the label, the Room Zoom uses it as its caption and breadcrumb, and a blank one
// used to be the signal that made a compartment un-enterable.

import { roomMaterial, ROOM_TYPE } from '../theme/warm-tokens.js';

/**
 * RoomType id → UPPERCASE display label. Covers all 17 members of the enum (mirrors
 * sim/Sim.Core/Rooms/RoomType.cs). `None` (0) is deliberately blank — a compartment the ship never
 * gave a purpose falls through to `compartmentDesignation` instead (see `deckSlotView`).
 */
export const ROOM_LABEL_BY_ID = Object.freeze({
  0: '', 1: 'CORRIDOR', 2: 'BRIDGE', 3: 'COMMAND', 4: 'MEDBAY', 5: 'QUARTERS', 6: 'OBSERVATORY',
  7: 'HYDROPONICS', 8: 'MESS', 9: 'WORKSHOP', 10: 'COMMONS', 11: 'REACTOR', 12: 'ENGINEERING',
  13: 'FABRICATION', 14: 'STORAGE', 15: 'LIFE SUPPORT', 16: 'CRYO BAY',
});

/**
 * The UPPERCASE label for a RoomType (numeric byte or enum-name string). Unknown / None → '' (the
 * caller then falls back to the slot's anchor name). Never throws.
 * @param {number|string|null|undefined} roomType
 * @returns {string}
 */
export function roomLabel(roomType) {
  const id = typeof roomType === 'number'
    ? roomType
    : (typeof roomType === 'string' && ROOM_TYPE[roomType] != null ? ROOM_TYPE[roomType] : -1);
  return ROOM_LABEL_BY_ID[id] || '';
}

/** Compartments per row in the slot grid — `SlotGridPlanner`'s 2×4 arrangement (`Cols = 4`). */
export const SLOT_COLS = 4;

/**
 * ⭐ THE NEUTRAL DESIGNATION — a compartment's name when the ship gave it no purpose. `A0..A3` for
 * the top row, `B0..B3` for the bottom, matching the 2×4 grid `SlotGridPlanner.Carve` lays down.
 *
 * TOTAL BY CONSTRUCTION over every input, which is the property the naming rule rests on: any
 * non-integer or negative coerces to 0, and a row past `Z` falls back to the raw index (`S104`),
 * which cannot collide with a letter+digit form because it is longer. There is no argument for
 * which this returns `''`.
 *
 * (It replaces `overview-scene.js`'s private `slotDesignation`, deleted with `hallCompartment` in
 * M1-L. ONE spelling, because the Overview label, the Room-Zoom caption, the breadcrumb and the crew
 * dock must not be able to disagree about what a compartment is called.)
 * @param {number} slotIndex
 * @returns {string}
 */
export function compartmentDesignation(slotIndex) {
  const i = Number.isFinite(slotIndex) ? Math.max(0, Math.trunc(slotIndex)) : 0;
  const row = Math.floor(i / SLOT_COLS);
  if (row > 25) return 'S' + i;
  return String.fromCharCode(65 + row) + (i % SLOT_COLS);
}

/**
 * ⭐ THE NAMING RULE, in one place. A compartment's player-facing name is:
 *
 *   1. the ship's authored PURPOSE for it (`roomLabel(roomType)`) — CRYO BAY, REACTOR, LIFE SUPPORT;
 *   2. otherwise the neutral `ROOM <designation>` — ROOM A1.
 *
 * **It is TOTAL: every compartment gets a non-empty, UPPERCASE name, including an empty one.** A
 * rule with a hole shows an unnamed box, which is the defect M1-L exists to remove.
 *
 * ⭐ **WHY `ROOM` AND NOT `COMPARTMENT`, WHICH IS THE WORD THIS REPO USES EVERYWHERE ELSE. A
 * MEASUREMENT, NOT A PREFERENCE.** The Overview draws this label at the compartment's top-left, and
 * `overview-scene.js` draws the room group BELOW the furniture layer — so on every BOTTOM-ROW
 * compartment the spine door (which sits on the TOP wall, exactly where the label runs) paints over
 * the label's tail. Measured over CDP on a live `--ship wreck`: top-row labels **107 px of 107
 * visible**, bottom-row labels **88 px of 107 — the last ~2.5 characters gone, on all four bottom
 * slots of every deck**. The hidden tail was the DESIGNATION, i.e. the only part that distinguishes
 * one from another, so `COMPARTMENT B0/B1/B2/B3` all rendered as `COMPARTMENT` and a deck looked
 * like it had four identically-named rooms — a naming rule that is total in code and holed on
 * screen. **The budget is ~88 px ⇒ 11 characters.** `ROOM B0` is 7 and clears it with room to spare;
 * `COMPARTMENT B0` is 14 and does not.
 *
 * It is also the better word on its own merits: it is the OWNER'S own noun for these
 * (*"these are existing rooms"*), and a bare neutral "Room" is what RimWorld itself shows for a room
 * with no discernible role. ⚠️ That last observation is an INFERENCE from play, not a citation —
 * `rimworld-reference.md` documents room *stats*, not role labels (see the note below).
 *
 * ⚠️ **THE ALTERNATIVE WAS BUILT AND REVERTED, so nobody has to re-derive it.** Hoisting the labels
 * into their own layer ABOVE the furniture does fix the clip — and then paints 8.5 px text over the
 * cryo capsules, an unapproved visual change to every room on every ship in order to solve a problem
 * a shorter name solves at its source. Filed as a KNOWN LIMIT instead: **a room label longer than
 * ~11 characters is still clipped on a bottom-row slot.** `LIFE SUPPORT` measures 92 px and would
 * clip; no shipped ship puts it on a bottom-row slot, so the hazard is real and latent, and it is
 * pinned by `client/test/no-add-room.test.js` rather than left to be rediscovered.
 *
 * ⚠️ **THE ANCHOR-NAME FALLBACK IS GONE, DELIBERATELY.** The rule used to end `|| anchorName`, and
 * `wire-decks.test.js`'s WP-1 tripwire exists because that leaks an internal id (`hall_d1_s6`,
 * `hold`) into an UPPERCASE UI. That leak was held shut only by the ship-authoring convention "every
 * occupied slot is typed" — and M1-L retires that convention, because occupancy is now geometry.
 *
 * ⚠️ **THE SENTENCE THAT ENDED THIS PARAGRAPH WAS A FALSE ABSOLUTE NEGATIVE AND IS RETRACTED.** It
 * read *"there is no longer any path from an anchor id to a label"* — and when review went looking,
 * **THREE `|| anchorName` fallbacks were still standing in shipped client code**: `room-model.js`'s
 * `roomTileRect` (the Room-Zoom caption), its `crewRoomSlot` (the crew dock), and
 * `overview-model.js`'s `currentRoom` (the readout's CURRENT ROOM line). They were unreachable, but
 * only because `compartmentName` is total — **closed by a RETURN VALUE, not by construction** — and
 * `wire-decks.test.js`'s tripwire ranges over `deckSlotView` only, so it could not see any of them.
 * A reader told a path does not exist does not go looking for it; that is the whole cost of the
 * shape. **All three are now DELETED** (review, 2026-07-29) and pinned behaviourally by
 * `client/test/no-add-room.test.js`'s *"an anchor id can no longer become a caption"* leg, which
 * hands each of the three a slot the host cannot currently produce — blank `displayName`, live
 * `anchorName` — and requires the id not to come back out. **With the deletions in, the sentence is
 * now true of the code and not merely of its inputs.**
 *
 * ⚠️ **WHAT THIS RULE IS NOT: it does not infer a purpose from CONTENTS.** RimWorld does derive a
 * room's *role* from what is built in it, but `docs/design/rimworld-reference.md` — the authority
 * under the owner's standing directive — **does not document that mechanism**, and §10 ("Rooms are
 * derived, not authored") only supports the half this rule uses: rooms come from WALLS and *"the
 * player never names or allocates one"*. Building a contents-scoring classifier here would rest on
 * an uncited memory AND would be the first step toward giving room purpose a mechanical consequence,
 * which OD-A/B deferred. A compartment's machinery is shown by ENTERING it — which is exactly what
 * this package makes possible.
 * @param {number|string|null|undefined} roomType
 * @param {number} slotIndex
 * @returns {string} never ''
 */
export function compartmentName(roomType, slotIndex) {
  return roomLabel(roomType) || ('ROOM ' + compartmentDesignation(slotIndex));
}

/**
 * Index decoded `rooms` by anchorName → atmosphere. A row with a blank/missing anchor is skipped.
 * @param {Array|null} rooms  decoded rooms (from decodeRooms)
 * @returns {Map<string,{o2:number,co2ppm:number,pressureKPa:number,tempK:number,tileCount:number,deck:number}>}
 */
export function atmosByAnchor(rooms) {
  const map = new Map();
  for (const r of (Array.isArray(rooms) ? rooms : [])) {
    if (r && typeof r.anchorName === 'string' && r.anchorName) {
      map.set(r.anchorName, {
        o2: r.o2, co2ppm: r.co2ppm, pressureKPa: r.pressureKPa, tempK: r.tempK,
        tileCount: r.tileCount, deck: r.deck,
      });
    }
  }
  return map;
}

/**
 * One decoded slot → its render-ready view-model. `material`/`floor`/`line`/`labelColor` come from
 * roomMaterial(roomType) (unknown types fall back to the neutral steel-tan deck). `displayName` is
 * `compartmentName` — the authored purpose, else the neutral designation, NEVER blank and never the
 * anchor id. `atmos` is the room's atmosphere from the anchor lookup, or null when the room ships no
 * `rooms` row (an airless compartment has none, and that is the normal case since W4b).
 * @param {{slotIndex:number,x:number,y:number,w:number,h:number,anchorName:string,roomType:number,occupied:boolean,active:boolean}} slot
 * @param {Map} atmos  from atmosByAnchor
 */
export function deckSlotView(slot, atmos) {
  const s = slot || {};
  const mat = roomMaterial(s.roomType);
  const anchorName = typeof s.anchorName === 'string' ? s.anchorName : '';
  const a = (atmos && anchorName) ? (atmos.get(anchorName) || null) : null;
  return {
    slotIndex: s.slotIndex | 0,
    rect: { x: s.x | 0, y: s.y | 0, w: s.w | 0, h: s.h | 0 },
    roomType: s.roomType | 0,
    anchorName,
    material: mat.material,
    floor: mat.floor,
    line: mat.line,
    labelColor: mat.label,
    displayName: compartmentName(s.roomType, s.slotIndex),
    occupied: !!s.occupied,
    active: !!s.active,
    atmos: a ? { o2: a.o2, co2ppm: a.co2ppm, pressureKPa: a.pressureKPa, tempK: a.tempK } : null,
  };
}

/**
 * The full per-deck view-model: decoded `decks` + `rooms` → [{ deck, slots:[slotView] }]. Pure and
 * tolerant — null/garbage inputs yield []; slots keep their host order (never re-sorted here).
 * @param {Array|null} decks  decoded decks (from decodeDecks)
 * @param {Array|null} rooms  decoded rooms (from decodeRooms)
 * @returns {{deck:number, slots:ReturnType<typeof deckSlotView>[]}[]}
 */
export function decksView(decks, rooms) {
  const atmos = atmosByAnchor(rooms);
  const out = [];
  for (const d of (Array.isArray(decks) ? decks : [])) {
    if (!d || !Array.isArray(d.slots)) continue;
    out.push({ deck: d.deck | 0, slots: d.slots.map((s) => deckSlotView(s, atmos)) });
  }
  return out;
}
