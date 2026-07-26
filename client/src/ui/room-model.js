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
import { markForFg, markVariant, markCellSvg } from './mark-overlay.js';
import { dragModeForTool } from './build-drag-model.js';

/* eslint-disable no-multi-spaces */

/** The logical tile unit (VS-Z-15): one grid cell = one tile = 32 logical units. */
export const U = 32;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Palette (VS-Z-46 / IX-Z-14). The fourteen tools in visual order; each maps to exactly one command
// class + wire verb (IX-Z-15). `deviceKind` is the sim DeviceKind name for functional furniture
// (Device.cs); `itemId` is the item-set piece for cosmetic decor.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The palette tools, in the visual order the bar renders them (VS-Z-46). WALL + FLOOR carry a
 *  material picker and drag-build; DOOR is a single structural placement; DIG + STRIP are the two
 *  ORDER verbs (console-retirement WP-4), grouped at the destructive end beside DEMOLISH. */
export const ROOM_TOOLS = Object.freeze([
  'wall', 'floor', 'door', 'bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant',
  'dig', 'strip', 'demolish',
]);

/** Tool → uppercase palette label (⌫ prefix on demolish, VS-Z-46). */
export const TOOL_LABEL = Object.freeze({
  wall: 'WALL', floor: 'FLOOR', door: 'DOOR', bunk: 'BUNK', desk: 'DESK', chair: 'CHAIR',
  locker: 'LOCKER', shelf: 'SHELF', lamp: 'LAMP', rug: 'RUG', plant: 'PLANT',
  dig: '⛏ DIG', strip: '⚒ STRIP', demolish: '⌫ DEMOLISH',
});

/** Ghost two-letter abbreviations (VS-Z-31). Cosmetic RUG/SHELF are NOT authoritative ghosts. */
export const GHOST_ABBR = Object.freeze({
  wall: 'WA', floor: 'FL', door: 'DO', bunk: 'BU', desk: 'DE', chair: 'CH', locker: 'LO',
  plant: 'PL', lamp: 'LA',
});

const PALETTE_CMD = Object.freeze({
  wall:  { cls: 'structural', verb: 'build',  kind: 'wall' },
  floor: { cls: 'structural', verb: 'build',  kind: 'floor' },
  door:  { cls: 'structural', verb: 'build',  kind: 'door' },
  bunk:  { cls: 'functional', verb: 'place',  kind: 'bunk',   deviceKind: 'Bed' },
  desk:  { cls: 'functional', verb: 'place',  kind: 'desk',   deviceKind: 'Desk' },
  chair: { cls: 'functional', verb: 'place',  kind: 'chair',  deviceKind: 'Chair' },
  locker:{ cls: 'functional', verb: 'place',  kind: 'locker', deviceKind: 'Locker' },
  plant: { cls: 'functional', verb: 'place',  kind: 'plant',  deviceKind: 'PlantPot' },
  lamp:  { cls: 'functional', verb: 'place',  kind: 'lamp',   deviceKind: 'Light' },
  rug:   { cls: 'cosmetic',   verb: 'decor',  itemId: 'rug' },
  shelf: { cls: 'cosmetic',   verb: 'decor',  itemId: 'bookshelf' },
  // ORDER class (console-retirement WP-4) — a DESIGNATION, not a build. It consumes no material and
  // changes no geometry: it marks a tile as intent and the sim's job board picks it up. `verb` is the
  // wire verb NAME (`dig`/`strip`), which is what makes it emphatically NOT a build: routing an order
  // through `Cmd.build` would hand it to `BuildSystem`, which knows nothing about designations
  // (`client/src/input/controls.js:52-58` spells this out for the console's own lowering).
  dig:   { cls: 'order',      verb: 'dig' },
  strip: { cls: 'order',      verb: 'strip' },
  demolish: { cls: 'demolish', verb: null },
});

/**
 * Classify a palette tool into its command class + wire verb (IX-Z-15). Unknown → 'none'. PURE.
 * @param {string|null} tool
 * @returns {{cls:'structural'|'functional'|'cosmetic'|'order'|'demolish'|'none', verb:string|null, kind?:string, deviceKind?:string, itemId?:string}}
 */
export function paletteCommand(tool) {
  const c = tool && PALETTE_CMD[tool];
  return c ? { ...c } : { cls: 'none', verb: null };
}

/** True for the drag-build structural tools (wall / floor / door). Wall + floor also carry a
 *  material picker; door is single-tile. PURE. */
export function isStructuralTool(tool) {
  return paletteCommand(tool).cls === 'structural';
}

/** True for the ORDER tools (dig / strip) — designations, never builds (WP-4). PURE. */
export function isOrderTool(tool) {
  return paletteCommand(tool).cls === 'order';
}

/**
 * True for every tool committed by the press-drag-release SWEEP gesture rather than by a plain
 * click: the structural trio plus the two order verbs. This is the sibling set the Room Zoom's
 * `onCanvasDown`/`onCanvasUp` gate on, and it is a FUNCTION rather than a literal list precisely so
 * that adding a tool to `PALETTE_CMD` with a swept class cannot leave one of the three gesture sites
 * behind — that drift is what `paletteOrders` was extracted to prevent on the console. PURE.
 */
export function isSweepTool(tool) {
  return isStructuralTool(tool) || isOrderTool(tool);
}

/**
 * The drag mode a Room-Zoom tool sweeps with (build-drag-model.js vocabulary). ORDER tools sweep a
 * FILLED rectangle — a dig or a strip is a region of intent (RimWorld's mine/deconstruct gesture),
 * not an outline; the wall tool's `perimeter` would leave the middle of a swept wreck untouched,
 * which is the opposite of what a player dragging across rubble asks for. Every other tool defers to
 * `dragModeForTool` unchanged. The sim re-validates every tile and silently no-ops an illegal one
 * (`Cmd.dig`'s contract, `client/src/wire/session.js:67-77`), so a fill that crosses clean floor
 * costs nothing. PURE.
 */
export function roomDragMode(tool) {
  return isOrderTool(tool) ? 'fill' : dragModeForTool(tool);
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
    // element 6 (material) is APPEND-ONLY — absent on old hosts → 0 (default skin).
    out.push({ x: c[0] | 0, y: c[1] | 0, kind: c[3] | 0, delivered: c[4] | 0, required: c[5] | 0, material: c[6] | 0 });
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

/**
 * The in-room wall/floor MATERIAL tiles to skin (C4). Every wall glyph ('#') inside the room rect
 * becomes a `{tx,ty,kind:'wall',mat}` (so built partitions render with their material — default 0
 * when absent from the sparse `materials` channel); a floor glyph ('.') is emitted ONLY when it
 * carries a non-default material. `materials` is the decoded sparse channel [{x,y,deck,kind,mat}].
 * PURE — never mutates its arguments.
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @param {Array<{x:number,y:number,deck:number,kind:number,mat:number}>|null} materials
 * @returns {{tx:number,ty:number,kind:'wall'|'floor',mat:number}[]}
 */
export function roomMaterialTiles(frame, focusRoom, materials) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const matAt = new Map();
  if (Array.isArray(materials)) {
    for (const m of materials) {
      if (m && (m.deck | 0) === (focusRoom.deck | 0)) matAt.set((m.x | 0) + ',' + (m.y | 0), m.mat | 0);
    }
  }
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (let ty = Math.max(0, ry); ty < Math.min(frame.h | 0, y1); ty++) {
    for (let tx = Math.max(0, rx); tx < Math.min(frame.w | 0, x1); tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0] | 0;
      const mat = matAt.get(tx + ',' + ty) || 0;
      if (code === 35) out.push({ tx, ty, kind: 'wall', mat });          // '#' wall → always skinned
      else if (code === 46 && mat) out.push({ tx, ty, kind: 'floor', mat }); // '.' floor → only if non-default
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DEBRIS + DESIGNATION MARKS (console-retirement WP-2). The one place in this file that reads
// `cell[1]` — the projected `GlyphColor` foreground byte — rather than `cell[0]`.
//
// WHY IT IS A LAYER OF ITS OWN and not a fix to `roomCells`. Every debris and dig-designation cell
// in the shipped capture carries glyph code 37 (`'%'`), which is in `NON_FURNITURE` above, so
// `roomCells` skips it — and it must keep skipping it.
//
// ⚠️ THE FIRST DRAFT OF THIS COMMENT GAVE THE WRONG REASON, and it is quoted here rather than
// deleted so that anyone who grepped the old wording lands on the correction. It said removing 37
// from `NON_FURNITURE` would *"push debris through `SPRITE_FOR_GLYPH`/`ROLE_TO_ITEM` (which have no
// mapping for it, so it would still draw nothing) while silently reclassifying the tile for
// `roomCells`' two other readers, `itemForGlyph` and `demolishTarget`'s device branch."* **All three
// clauses are false, measured by physically removing 37 from the set** (independent review):
//   • it does NOT "still draw nothing" — it draws THIRTY-THREE pieces of junk. `roomCells` then
//     emits 33 cells at code 37 with `itemId:''`, and `furnitureSvg`'s else-branch
//     (`roomzoom-view.js:429-438`) renders the VS-Z-25 dashed "unknown" chip for each, carrying a
//     literal `%` glyph. That is the OPPOSITE of the claim, in the very file the claim was in.
//   • `itemForGlyph(37)` returns `''` either way — there is no `'%'` key in `SPRITE_FOR_GLYPH`
//     (`render/glyphs.js:13-19`), so it is UNCHANGED, not reclassified.
//   • `demolishTarget` at such a tile returns `{kind:'empty', verb:null}` either way — its device
//     branch (below) requires a truthy `itemForGlyph(code)`, and 37 is not in `STRUCTURE_CODES`.
//     Also UNCHANGED.
// THE TRUE REASON IS STRONGER: loosening the set does not merely fail to draw debris, it fills the
// wreck with 33 dashed unknown-glyph chips — a worse lie than invisibility, because a chip claims
// "something here we do not skin yet" about a tile whose meaning the client knows perfectly well.
// The mark layer instead keys on the fg byte alone and never on the glyph, which is also what makes
// it work for a strip mark on a WALL (code 35, likewise `NON_FURNITURE`) — a case no amount of
// furniture reclassification could reach.
//
// NOTE THE TWO SURFACES DIFFER HERE, and the mirrored comment in `overview-scene.js` is correct for
// its own file: `furnitureLayer` does `if (!itemId) continue`, so on the Overview an unmapped glyph
// really does draw nothing. The Room Zoom has an unknown-chip fallback and the Overview does not.
//
// The mark vocabulary itself — which byte means what, and what each mark looks like — is
// `mark-overlay.js`, shared verbatim with the Level-1 Overview so one fg byte cannot come to mean two
// different things on the two surfaces. See that file's header for the honest limits of `cell[1]`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The debris / designation marks inside the room (WP-2). Every in-rect, on-deck cell whose fg byte
 * carries a mark becomes `{tx, ty, mark, fg, code}`; everything else is dropped. PURE.
 *
 * IT REPORTS ALL FOUR KINDS, INCLUDING STOCKPILE, even though `markLayerSvg` draws only three. The
 * reason is not "WP-4 will want it" — that argument covers debris and nothing else. It is that this
 * function's job is to say what the FRAME contains, and a derivation that silently omits one of the
 * four bytes is a derivation whose output cannot be trusted as a census: a caller asking "is this
 * tile already spoken for?" (WP-4's DIG and STRIP sweeps both must, and so must anything that comes
 * to explain a tile in the readout) would get "no" for a zoned tile. The drawing decision belongs to
 * the layer that draws, and it is made there, once, with its reason attached.
 * @param {{deck:number,w:number,h:number,cells:Array}|null} frame
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, mark:string, fg:number, code:number}[]}
 */
export function roomMarkTiles(frame, focusRoom) {
  const out = [];
  if (!frame || !focusRoom || !Array.isArray(frame.cells)) return out;
  if ((frame.deck | 0) !== (focusRoom.deck | 0)) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (let ty = Math.max(0, ry); ty < Math.min(frame.h | 0, y1); ty++) {
    for (let tx = Math.max(0, rx); tx < Math.min(frame.w | 0, x1); tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const fg = cell[1] | 0;
      const mark = markForFg(fg);
      if (!mark) continue;
      out.push({ tx, ty, mark, fg, code: cell[0] | 0 });
    }
  }
  return out;
}

/**
 * The Room Zoom's mark layer as one SVG string in room-local logical units (`U` per tile), or ''.
 * PURE — a string builder, no DOM, so the gate can see it draw (the `zone-overlay.js` lesson: a
 * builder that lives inside the view can be made to return '' with the whole suite still green).
 *
 * STOCKPILE MARKS ARE DELIBERATELY NOT DRAWN HERE, and this is the one place the two surfaces
 * differ in output. WP-3 already paints this room's stockpile tiles from the `zones` wire channel
 * (`zone-overlay.js` `zoneLayerSvg`, called one line above this layer in `roomzoom-view.js`), and
 * that source is strictly better: it survives an item being stored on the tile (which overwrites
 * `cell[1]` — see `mark-overlay.js`) and it carries the RESTRICTED and BACKED-OFF states this byte
 * cannot express. Drawing both would stack two slate tints on the same tile. The semantics are
 * unchanged — fg 16 still means "stockpile zone" on both surfaces; the Room Zoom just gets it from
 * the better channel. `roomMarkTiles` still REPORTS the mark, so nothing is hidden from a caller.
 * (If WP-6 replaces the zone layer wholesale, delete this filter with it.)
 *
 * @param {{tx:number, ty:number, mark:string}[]} marks  roomMarkTiles output
 * @param {{rx:number, ry:number}} focusRoom  the room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function markLayerSvg(marks, focusRoom, unit = U) {
  if (!Array.isArray(marks) || !marks.length || !focusRoom) return '';
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const out = [];
  for (const m of marks) {
    if (!m || m.mark === 'stockpile') continue; // WP-3's zoneLayerSvg owns this tile — see above
    const cell = markCellSvg(m.mark, (m.tx - rx) * unit, (m.ty - ry) * unit, unit, unit,
      markVariant(m.tx, m.ty));
    if (cell) out.push(cell);
  }
  return out.length ? '<g class="rz-marks" pointer-events="none">' + out.join('') + '</g>' : '';
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
