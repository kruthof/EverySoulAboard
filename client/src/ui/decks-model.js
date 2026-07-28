// DECKS view-model — PURE. Turns the decoded `decks` + `rooms` wire channels into a render-ready
// per-deck structure for the warm SVG Overview / Room-Zoom: each slot carries its rect, its warm
// material/floor/label colours (via roomMaterial), a display label (a roomType→UPPERCASE map with an
// anchor-name fallback), live occupancy/active flags, and the room's atmosphere looked up by anchor.
//
// No DOM, no wire access, no clock. Everything is deterministic and tolerant: unknown roomTypes fall
// back to the neutral material + a blank label, an airless empty-hall slot (occupied:false,
// anchorName:"") yields a blank display name and null atmos, and a null/garbage input yields [].

import { roomMaterial, ROOM_TYPE } from '../theme/warm-tokens.js';

/**
 * RoomType id → UPPERCASE display label. Covers all 17 members of the enum (mirrors
 * sim/Sim.Core/Rooms/RoomType.cs). `None` (0) is deliberately blank — an unassigned slot / empty
 * hall shows no room label, only its anchor fallback (which is itself "" for an empty hall).
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
 * the roomType label, else the anchor name, else "". `atmos` is the room's atmosphere from the
 * anchor lookup, or null when the slot is unoccupied / the room ships no `rooms` row.
 * @param {{slotIndex:number,x:number,y:number,w:number,h:number,anchorName:string,roomType:number,occupied:boolean,active:boolean}} slot
 * @param {Map} atmos  from atmosByAnchor
 */
export function deckSlotView(slot, atmos) {
  const s = slot || {};
  const mat = roomMaterial(s.roomType);
  const label = roomLabel(s.roomType);
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
    displayName: label || anchorName || '',
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
