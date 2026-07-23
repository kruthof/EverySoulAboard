// ROOM-ZOOM view-model — PURE. Every derivation the Level-2 Room Zoom controller
// (client/src/ui/roomzoom-view.js) needs that is more than a straight DOM write lives here,
// node-tested, with no DOM and no wire access: the focused-room tile-rect lookup, the fit
// transform + click→tile hit-testing (the responsive generalisation of the mock's fixed 1488/32
// math), the channel clamps (cells → items, crew, designs, decor) to the room rect, the palette
// tool → command class map, the demolish classifier + its precedence, the armed-tool reducer, and
// the ESC rung. Authority: docs/design/perilune-roomzoom.{visual,interaction}-spec.md (VS-Z / IX-Z).
//
// InvariantCulture-safe throughout (round + ASCII string concat only; no locale APIs). Nothing here
// is hashed, touches the sim, or mutates its arguments.

import { SPRITE_FOR_GLYPH } from '../render/glyphs.js';

/* eslint-disable no-multi-spaces */

/** The logical tile unit (VS-Z-15): one grid cell = one tile = 32 logical units. */
export const U = 32;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Palette (VS-Z-46 / IX-Z-14). The eleven tools in visual order; each maps to exactly one command
// class + wire verb (IX-Z-15). `deviceKind` is the sim DeviceKind name for functional furniture
// (Device.cs); `itemId` is the item-set piece for cosmetic decor.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The palette tools, in the visual order the bar renders them (VS-Z-46). */
export const ROOM_TOOLS = Object.freeze([
  'wall', 'door', 'bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant', 'demolish',
]);

/** Tool → uppercase palette label (⌫ prefix on demolish, VS-Z-46). */
export const TOOL_LABEL = Object.freeze({
  wall: 'WALL', door: 'DOOR', bunk: 'BUNK', desk: 'DESK', chair: 'CHAIR', locker: 'LOCKER',
  shelf: 'SHELF', lamp: 'LAMP', rug: 'RUG', plant: 'PLANT', demolish: '⌫ DEMOLISH',
});

/** Ghost two-letter abbreviations (VS-Z-31). Cosmetic RUG/SHELF are NOT authoritative ghosts. */
export const GHOST_ABBR = Object.freeze({
  wall: 'WA', door: 'DO', bunk: 'BU', desk: 'DE', chair: 'CH', locker: 'LO', plant: 'PL', lamp: 'LA',
});

const PALETTE_CMD = Object.freeze({
  wall:  { cls: 'structural', verb: 'build',  kind: 'wall' },
  door:  { cls: 'structural', verb: 'build',  kind: 'door' },
  bunk:  { cls: 'functional', verb: 'place',  kind: 'bunk',   deviceKind: 'Bed' },
  desk:  { cls: 'functional', verb: 'place',  kind: 'desk',   deviceKind: 'Desk' },
  chair: { cls: 'functional', verb: 'place',  kind: 'chair',  deviceKind: 'Chair' },
  locker:{ cls: 'functional', verb: 'place',  kind: 'locker', deviceKind: 'Locker' },
  plant: { cls: 'functional', verb: 'place',  kind: 'plant',  deviceKind: 'PlantPot' },
  lamp:  { cls: 'functional', verb: 'place',  kind: 'lamp',   deviceKind: 'Light' },
  rug:   { cls: 'cosmetic',   verb: 'decor',  itemId: 'rug' },
  shelf: { cls: 'cosmetic',   verb: 'decor',  itemId: 'bookshelf' },
  demolish: { cls: 'demolish', verb: null },
});

/**
 * Classify a palette tool into its command class + wire verb (IX-Z-15). Unknown → 'none'. PURE.
 * @param {string|null} tool
 * @returns {{cls:'structural'|'functional'|'cosmetic'|'demolish'|'none', verb:string|null, kind?:string, deviceKind?:string, itemId?:string}}
 */
export function paletteCommand(tool) {
  const c = tool && PALETTE_CMD[tool];
  return c ? { ...c } : { cls: 'none', verb: null };
}

/**
 * The armed-tool reducer (IX-Z-14/16): a single mutually-exclusive slot. Clicking a tool arms it;
 * clicking the armed tool again disarms (toggle to null); any other tool replaces. Disconnect /
 * exit / deck-change disarm. PURE.
 * @param {string|null} current
 * @param {{t:'toggle'|'set'|'clear', tool?:string}} action
 * @returns {string|null}
 */
export function nextRoomTool(current, action) {
  const a = action || {};
  if (a.t === 'clear') return null;
  if (a.t === 'set') return (ROOM_TOOLS.indexOf(a.tool) >= 0) ? a.tool : current;
  if (a.t === 'toggle') {
    if (ROOM_TOOLS.indexOf(a.tool) < 0) return current;
    return current === a.tool ? null : a.tool;
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Focused-room tile-rect (VS-Z-14 / IX-Z). GEOMETRY lives on the `decks` slot — the tile-rect
// `[rx,ry,rw,rh]` + deck — never on `rooms`. The display name is the slot's CLIENT-DERIVED label.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Find the focused room's framing from a decksView, by anchorName (IX-Z entry) or slotIndex.
 * Returns `{anchor, deck, slotIndex, roomType, displayName, rx, ry, rw, rh}` or null when no slot
 * matches (a vanished room — IX-Z-51). A blank anchorName never matches. PURE.
 * @param {Array<{deck:number, slots:Array}>|null} dView  decksView(decks, rooms) output
 * @param {string} anchorName
 * @param {number} [slotIndex]  optional disambiguator when several decks share an anchor name
 * @returns {{anchor:string, deck:number, slotIndex:number, roomType:number, displayName:string, rx:number, ry:number, rw:number, rh:number}|null}
 */
export function roomTileRect(dView, anchorName, slotIndex) {
  if (!Array.isArray(dView) || !anchorName) return null;
  for (const d of dView) {
    if (!d || !Array.isArray(d.slots)) continue;
    for (const s of d.slots) {
      if (!s || s.anchorName !== anchorName) continue;
      if (slotIndex != null && s.slotIndex !== slotIndex) continue;
      const r = s.rect || {};
      return {
        anchor: anchorName, deck: d.deck | 0, slotIndex: s.slotIndex | 0,
        roomType: s.roomType | 0, displayName: s.displayName || anchorName || '',
        rx: r.x | 0, ry: r.y | 0, rw: r.w | 0, rh: r.h | 0,
      };
    }
  }
  return null;
}

/** The slots of one deck from a decksView, or [] (for the minimap). PURE. */
export function deckSlots(dView, deck) {
  const d = Array.isArray(dView) ? dView.find((e) => e && (e.deck | 0) === (deck | 0)) : null;
  return d && Array.isArray(d.slots) ? d.slots : [];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fit transform + click hit-testing (VS-Z-16 / IX-Z-10/11). The logical rw*U × rh*U space is scaled
// by ONE factor `s` to fit the canvas interior, centred (letterboxed on the short axis) — the same
// contract an SVG viewBox with preserveAspectRatio="xMidYMid meet" applies, so the rendered layers
// and the click math share one transform and never drift.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The fit descriptor for a room in an interior of `w`×`h` px. `s` scales logical→px; `offX/offY`
 * centre the room (letterbox). PURE.
 * @param {{rw:number, rh:number}} focusRoom
 * @param {number} w @param {number} h   the interior size in px
 * @param {number} [unit]                the logical tile unit (default U)
 * @returns {{s:number, offX:number, offY:number, logicalW:number, logicalH:number, unit:number}}
 */
export function roomFit(focusRoom, w, h, unit = U) {
  const rw = Math.max(1, focusRoom ? focusRoom.rw | 0 : 1);
  const rh = Math.max(1, focusRoom ? focusRoom.rh | 0 : 1);
  const logicalW = rw * unit;
  const logicalH = rh * unit;
  const s = Math.min(w / logicalW, h / logicalH) || 0;
  return {
    s, offX: (w - logicalW * s) / 2, offY: (h - logicalH * s) / 2, logicalW, logicalH, unit,
  };
}

/**
 * Resolve a client-space click to an absolute sim tile, or null when it falls on the letterbox
 * margin or outside the room (IX-Z-10/11). `rect` is the canvas element's bounding box
 * `{left, top, width, height}`; `focusRoom` supplies the rect origin + fit. This is the responsive
 * generalisation of the mock's fixed `floor((cx-left)*(1488/width)/32)*32` math. PURE.
 * @param {number} clientX @param {number} clientY
 * @param {{left:number, top:number, width:number, height:number}} rect
 * @param {{rx:number, ry:number, rw:number, rh:number}} focusRoom
 * @param {number} [unit]
 * @returns {{x:number, y:number}|null}
 */
export function tileFromCanvasXY(clientX, clientY, rect, focusRoom, unit = U) {
  if (!rect || !focusRoom || !rect.width || !rect.height) return null;
  const fit = roomFit(focusRoom, rect.width, rect.height, unit);
  if (!(fit.s > 0)) return null;
  const lx = (clientX - rect.left - fit.offX) / fit.s; // logical px within rw*U × rh*U
  const ly = (clientY - rect.top - fit.offY) / fit.s;
  if (lx < 0 || ly < 0 || lx >= fit.logicalW || ly >= fit.logicalH) return null; // letterbox margin
  const tx = Math.floor(lx / unit) + (focusRoom.rx | 0);
  const ty = Math.floor(ly / unit) + (focusRoom.ry | 0);
  return clampTileToRoom(tx, ty, focusRoom) ? { x: tx, y: ty } : null;
}

/** True when (tx,ty) is inside the room's tile-rect (IX-Z-11). PURE. */
export function clampTileToRoom(tx, ty, focusRoom) {
  if (!focusRoom) return false;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  return tx >= rx && tx < rx + (focusRoom.rw | 0) && ty >= ry && ty < ry + (focusRoom.rh | 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Channel clamps to the room rect (VS-Z-14 / IX-Z-28). A frame cell, crew member, design or decor
// renders only when it is inside `[rx,ry,rw,rh]` AND on the room's deck — the Level-2 "just this
// room" contract.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Glyph code points the floor / wall / structure layers own (never a furniture item) — mirrors
// overview-scene's NON_FURNITURE (. # space % @ / &).
const NON_FURNITURE = new Set([46, 35, 32, 37, 64, 47, 38]);

// SPRITE_FOR_GLYPH role → a warm ITEM id (mirrors overview-scene's ROLE_TO_ITEM so the two SVG
// views skin the same glyph identically). A role with no mapped item renders nothing.
const ROLE_TO_ITEM = Object.freeze({
  scrubber: 'o2-scrubber', watertank: 'oxygen-tank', radiator: 'space-heater',
  solar: 'solar-panel', battery: 'battery-bank', vent: 'air-vent', light: 'wall-lamp',
  ladder: 'hatch-ladder', reclaimer: 'water-recycler', recycler: 'water-recycler',
  fabricator: 'fabricator', machineshop: 'workbench',
  bed: 'bunk-bed', table: 'dining-table', chair: 'chair', medbed: 'med-bed',
  medcab: 'locker', locker: 'locker', desk: 'desk', plant: 'potted-plant',
});

/** The warm itemId a glyph code maps to, or '' (unmapped → the unknown chip, VS-Z-25). PURE. */
export function itemForGlyph(code) {
  if (NON_FURNITURE.has(code)) return '';
  const role = SPRITE_FOR_GLYPH[String.fromCharCode(code)];
  return (role && ROLE_TO_ITEM[role]) || '';
}

/**
 * The in-room furniture cells → item placements (VS-Z-19). Each non-floor/wall cell inside the room
 * rect on the room's deck becomes `{tx, ty, itemId, code}`; an unmapped glyph carries `itemId:''`
 * (the caller draws the unknown chip). Fog/blank cells are dropped. PURE.
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, itemId:string, code:number}[]}
 */
export function roomCells(frame, focusRoom) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (let ty = Math.max(0, ry); ty < Math.min(frame.h | 0, y1); ty++) {
    for (let tx = Math.max(0, rx); tx < Math.min(frame.w | 0, x1); tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      if (NON_FURNITURE.has(code)) continue;
      out.push({ tx, ty, itemId: itemForGlyph(code), code });
    }
  }
  return out;
}

/**
 * The crew standing in the room (VS-Z-27). Roster entries ({cid,role,name,deck,x,y}) on the room's
 * deck inside the rect. PURE.
 * @param {Array|null} crew  roster crew list
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 */
export function roomCrew(crew, focusRoom) {
  const out = [];
  if (!Array.isArray(crew) || !focusRoom) return out;
  for (const c of crew) {
    if (!c || (c.deck | 0) !== (focusRoom.deck | 0)) continue;
    if (clampTileToRoom(c.x | 0, c.y | 0, focusRoom)) out.push(c);
  }
  return out;
}

/**
 * The pending build designations inside the room (VS-Z-30). Design cells
 * `[x, y, deck, kind, delivered, required]` on the room's deck inside the rect → objects. PURE.
 * @param {Array|{cells:Array}|null} designs
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{x:number,y:number,kind:number,delivered:number,required:number}[]}
 */
export function roomDesigns(designs, focusRoom) {
  const cells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  const out = [];
  if (!focusRoom) return out;
  for (const c of cells) {
    if (!Array.isArray(c) || (c[2] | 0) !== (focusRoom.deck | 0)) continue;
    if (!clampTileToRoom(c[0] | 0, c[1] | 0, focusRoom)) continue;
    out.push({ x: c[0] | 0, y: c[1] | 0, kind: c[3] | 0, delivered: c[4] | 0, required: c[5] | 0 });
  }
  return out;
}

/**
 * The cosmetic decor pieces inside the room (VS-Z-34). Accepts both the wire shape
 * ({deck,x,y,itemId,…}) and the local view shape ({deck,x,y,itemId}); clamps to the rect + deck.
 * PURE.
 * @param {Array|null} decor
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 */
export function roomDecor(decor, focusRoom) {
  const out = [];
  if (!Array.isArray(decor) || !focusRoom) return out;
  for (const d of decor) {
    if (!d || (d.deck | 0) !== (focusRoom.deck | 0)) continue;
    if (clampTileToRoom(d.x | 0, d.y | 0, focusRoom)) out.push(d);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Demolish classification (IX-Z-24/25). A tile is classified into exactly one of
// {pending, device, decor, built-wall, empty} in a fixed precedence; the highest-precedence layer
// present is what one DEMOLISH click acts on.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Built structure glyphs (walls + doors) — demolishing these is v1-honest no-op (IX-Z-24).
const STRUCTURE_CODES = new Set([35, 43, 47, 88]); // # + / X

/** The glyph code at (tx,ty) in the frame, or -1 (off-grid / no frame). PURE. */
function codeAt(frame, tx, ty) {
  if (!frame || !Array.isArray(frame.cells)) return -1;
  const w = frame.w | 0, h = frame.h | 0;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
  const cell = frame.cells[ty * w + tx];
  return Array.isArray(cell) ? (cell[0] | 0) : -1;
}

/**
 * Classify a DEMOLISH target at (tx,ty) into exactly one layer + its wire verb, in the fixed
 * precedence pending → device → decor → built-wall → empty (IX-Z-24/25). PURE.
 *   pending     → verb 'cancel'       (Cmd.build('cancel') → BuildSystem.Cancel)
 *   device      → verb 'remove'       (Cmd.remove → RemoveDeviceCommand; sim lane, defensive)
 *   decor       → verb 'decor-remove' (view-only local removal)
 *   built-wall  → verb null           (honest no-op — cancel only revokes queued orders)
 *   empty       → verb null           (dropped no-op)
 * @param {number} tx @param {number} ty
 * @param {Array|{cells:Array}|null} designs
 * @param {Array|null} decor
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @returns {{kind:'pending'|'device'|'decor'|'built-wall'|'empty', verb:string|null}}
 */
export function demolishTarget(tx, ty, designs, decor, frame) {
  const dCells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  for (const c of dCells) {
    if (Array.isArray(c) && (c[0] | 0) === tx && (c[1] | 0) === ty) {
      return { kind: 'pending', verb: 'cancel' };
    }
  }
  const code = codeAt(frame, tx, ty);
  if (code >= 0 && !NON_FURNITURE.has(code) && !STRUCTURE_CODES.has(code) && itemForGlyph(code)) {
    return { kind: 'device', verb: 'remove' };
  }
  if (Array.isArray(decor)) {
    for (const d of decor) {
      if (d && (d.x | 0) === tx && (d.y | 0) === ty) return { kind: 'decor', verb: 'decor-remove' };
    }
  }
  if (STRUCTURE_CODES.has(code)) return { kind: 'built-wall', verb: null };
  return { kind: 'empty', verb: null };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Local cosmetic-decor store (IX-Z-23/29). View-only, session-only, NEVER a sim entity — placing /
// removing is instant + local. Pure list transforms (never mutate the argument).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Append a decor piece (one per tile; a new piece replaces any existing at that tile). PURE. */
export function addDecor(list, deck, x, y, itemId) {
  const base = Array.isArray(list) ? list.filter((d) => !(d.deck === deck && d.x === x && d.y === y)) : [];
  return base.concat([{ deck: deck | 0, x: x | 0, y: y | 0, itemId: String(itemId) }]);
}

/** Remove the decor piece at (deck,x,y). PURE. */
export function removeDecor(list, deck, x, y) {
  return Array.isArray(list) ? list.filter((d) => !(d.deck === deck && d.x === x && d.y === y)) : [];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ESC rung (IX-Z-40). The Room Zoom's own two-rung stack: a keypress either disarms the armed tool
// OR pops the room to the Overview, never both (IX-Z-41). A dialogue rung sits between so a panel
// closes first when one is open. PURE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{armed:boolean, dialogueOpen?:boolean, roomOpen:boolean}} s
 * @returns {'disarm'|'dialogue'|'exit'|'pass'}
 */
export function escStackRung(s) {
  if (s && s.armed) return 'disarm';
  if (s && s.dialogueOpen) return 'dialogue';
  if (s && s.roomOpen) return 'exit';
  return 'pass';
}
