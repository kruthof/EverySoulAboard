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

// The ONE glyph → itemId derivation, straight out of the `ITEMS` registry and SHARED verbatim with
// the Level-1 Overview, so the two SVG surfaces cannot come to skin the same glyph differently.
// (It used to be `SPRITE_FOR_GLYPH` from `../render/glyphs.js` plus a local hand mirror — see below.)
import { itemIdForGlyphChar } from '../items/glyph-map.js';
// ⚠️ `markForFg` is GONE (the `marks` channel): the kind arrives on the wire, decoded once by
// `roomzoom-view.js` and handed to `roomMarkTiles`. The vocabulary itself is unchanged.
import { markVariant, markCellSvg } from './mark-overlay.js';
import { dragModeForTool } from './build-drag-model.js';
// The client's ONE mirror of the sim's `ItemKind` enum (pinned against ItemStack.cs by
// stock-filter-model.test.js). Imported for its labels rather than re-declared — a second table here
// would be a hand mirror of a hand mirror, which is the defect `items/glyph-map.js` removed.
import { STOCK_KINDS } from './stock-filter-model.js';

/* eslint-disable no-multi-spaces */

/** The logical tile unit (VS-Z-15): one grid cell = one tile = 32 logical units. */
export const U = 32;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Palette (VS-Z-46 / IX-Z-14). The fifteen tools in visual order; each maps to exactly one command
// class + wire verb (IX-Z-15). `deviceKind` is the sim DeviceKind name for functional furniture
// (Device.cs); `itemId` is the item-set piece for cosmetic decor.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The palette tools, in the visual order the bar renders them (VS-Z-46). WALL + FLOOR carry a
 *  material picker and drag-build; DOOR is a single structural placement; DIG, STOCKPILE and STRIP
 *  are the three ORDER verbs (WP-4 brought dig/strip; stockpile came down from the Overview when
 *  the altitude rule was corrected — `overview-model.js`'s header holds the argument), kept in the
 *  console's own `ORDER_KINDS` order and grouped at the destructive end beside DEMOLISH. */
export const ROOM_TOOLS = Object.freeze([
  'wall', 'floor', 'door', 'bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant',
  'dig', 'stockpile', 'strip', 'demolish',
]);

/** Tool → uppercase palette label (⌫ prefix on demolish, VS-Z-46). The ▦ is the same glyph the
 *  Overview's bar used and the console's hint uses, so the verb reads identically wherever it is
 *  named; the hotkey is NOT in the label here (the palette states hotkeys in its hint line). */
export const TOOL_LABEL = Object.freeze({
  wall: 'WALL', floor: 'FLOOR', door: 'DOOR', bunk: 'BUNK', desk: 'DESK', chair: 'CHAIR',
  locker: 'LOCKER', shelf: 'SHELF', lamp: 'LAMP', rug: 'RUG', plant: 'PLANT',
  dig: '⛏ DIG', stockpile: '▦ STOCKPILE', strip: '⚒ STRIP', demolish: '⌫ DEMOLISH',
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
  // wire verb NAME (`dig`/`stockpile`/`strip`), which is what makes it emphatically NOT a build:
  // routing an order through `Cmd.build` would hand it to `BuildSystem`, which knows nothing about
  // designations (`client/src/input/controls.js:52-58` spells this out for the console's own
  // lowering).
  //
  // ⚠️ STOCKPILE IS THE ONE ORDER THAT LOWERS TO **TWO** WIRE COMMANDS — `Cmd.stockpile` then
  // `Cmd.filter`, always both, always that order. Its `cls` is what routes it through the sweep, and
  // `roomzoom-view.js`'s `orderPayloads` is what knows about the pair; this table deliberately does
  // not, so that "which class sweeps" and "what does one tile emit" stay separable.
  dig:   { cls: 'order',      verb: 'dig' },
  stockpile: { cls: 'order',  verb: 'stockpile' },
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

/** True for the ORDER tools (dig / stockpile / strip) — designations, never builds. PURE. */
export function isOrderTool(tool) {
  return paletteCommand(tool).cls === 'order';
}

/**
 * True for every tool committed by the press-drag-release SWEEP gesture rather than by a plain
 * click: the structural trio plus the three order verbs. This is the sibling set the Room Zoom's
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
 * costs nothing.
 *
 * FOR STOCKPILE `fill` IS NOT A PREFERENCE, IT IS THE MECHANIC. `JobWork.IsFreeStockpileTile` asks
 * "Stockpile + Walkable + empty" — ONE STACK PER TILE — so the swept AREA is the zone's capacity:
 * a 5×8 drag is 40 stacks. A `perimeter` sweep would silently deliver a hollow zone of 22, and a
 * `single` sweep would make the verb's only real parameter a matter of clicking forty times. PURE.
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

// ⚠️ `ROLE_TO_ITEM` IS GONE FROM THIS FILE (2026-07-26), quoted here so a grep for it lands on the
// reason: it was a hand-written `{scrubber:'o2-scrubber', watertank:'oxygen-tank', …}` object with a
// comment saying it *"mirrors overview-scene's ROLE_TO_ITEM so the two SVG views skin the same glyph
// identically"* — and the Overview carried the mirror-image copy with the mirror-image comment. Two
// hand mirrors of a table `ITEMS` already states once, reached through a THIRD table
// (`SPRITE_FOR_GLYPH`, glyph → sprite role). The chain had a hole in it — `GrowBed` `"`, `Terminal`
// `T` and `Telescope` `x` reached no role, so hydroponics and the MOSS terminal drew the VS-Z-25
// dashed unknown chip in the shipping game (HANDOVER §4l). The derivation lives in
// `items/glyph-map.js` and both surfaces now call the same function.

/** The warm itemId a glyph code maps to, or '' (unmapped → the unknown chip, VS-Z-25). PURE. */
export function itemForGlyph(code) {
  if (NON_FURNITURE.has(code)) return '';
  return itemIdForGlyphChar(String.fromCharCode(code));
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
// DEBRIS + DESIGNATION MARKS (console-retirement WP-2; re-sourced by the `marks` channel).
//
// ⚠️ THE HEADING SENTENCE IS NOW FALSE AND IS KEPT QUOTED: *"The one place in this file that reads
// `cell[1]` — the projected `GlyphColor` foreground byte — rather than `cell[0]`."* This file reads
// NO byte for marks any more. `GlyphMapper` writes the mark colour into `cell[1]` in pass 1 and then
// overwrites it in pass 3 (ground items), pass 4 (devices) and pass 5 (citizens), so the mark layer
// was an honest view of the FRAME and a lossy view of the SIM. The kinds now arrive on the `marks`
// wire channel, read from `TileFlags.Designated` / `TileFlags.Stockpile` / the `DeconstructSystem`
// registry / the terrain planes. See `hosts/web/WireFormat.Marks.cs`.
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
//   • `itemForGlyph(37)` returns `''` either way — no item claims the glyph `'%'` (then: there was
//     no `'%'` key in `SPRITE_FOR_GLYPH`, `render/glyphs.js:13-19`), so it is UNCHANGED, not
//     reclassified.
//   • `demolishTarget` at such a tile returns `{kind:'empty', verb:null}` either way — its device
//     branch (below) requires a truthy `itemForGlyph(code)`, and 37 is not in `STRUCTURE_CODES`.
//     Also UNCHANGED.
// THE TRUE REASON IS STRONGER: loosening the set does not merely fail to draw debris, it fills the
// wreck with 33 dashed unknown-glyph chips — a worse lie than invisibility, because a chip claims
// "something here we do not skin yet" about a tile whose meaning the client knows perfectly well.
// The mark layer instead keys on nothing in the frame at all, which is also what makes it work for a
// strip mark on a WALL (code 35, likewise `NON_FURNITURE`) — a case no amount of furniture
// reclassification could reach. (That clause used to read *"keys on the fg byte alone and never on
// the glyph"*; the conclusion survived the re-sourcing, the mechanism did not.)
//
// NOTE THE TWO SURFACES DIFFER HERE, and the mirrored comment in `overview-scene.js` is correct for
// its own file: `furnitureLayer` does `if (!itemId) continue`, so on the Overview an unmapped glyph
// really does draw nothing. The Room Zoom has an unknown-chip fallback and the Overview does not.
//
// The mark vocabulary itself — what each mark looks like — is `mark-overlay.js`, shared verbatim
// with the Level-1 Overview so one mark kind cannot come to mean two different things on the two
// surfaces. The wire kind → name table is `wire/messages.js` (`MARK_KIND_NAMES`), mirroring
// `hosts/web/WireFormat.Marks.cs`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The debris / designation marks inside the room (WP-2). Every in-rect, on-deck cell of the decoded
 * `marks` channel becomes `{tx, ty, mark, kind}`; everything else is dropped. PURE.
 *
 * ⚠️ IT NO LONGER READS THE FRAME. The old contract is quoted and negated so a grep for it lands
 * here: *"Every in-rect, on-deck cell whose fg byte carries a mark becomes `{tx, ty, mark, fg,
 * code}`"* and *"this function's job is to say what the FRAME contains"*. Both are FALSE since the
 * `marks` channel. `fg` and `code` are gone from the output with the source they came from — they
 * were the projected `cell[1]`/`cell[0]` bytes, and `cell[1]` is exactly the lossy byte this channel
 * replaces (`GlyphMapper` passes 3/4/5 overwrite it for a ground item, a device and a standing crew
 * member). Nothing outside the tests ever read them.
 *
 * IT REPORTS ALL FOUR KINDS, INCLUDING STOCKPILE, even though `markLayerSvg` draws only three — and
 * this reason is UNCHANGED and now stronger. The function's job is to say what the SIM contains, and
 * a derivation that silently omits one of the four kinds is a derivation whose output cannot be
 * trusted as a census: a caller asking "is this tile already spoken for?" (WP-4's DIG and STRIP
 * sweeps both must, and so must anything that comes to explain a tile in the readout) would get "no"
 * for a zoned tile. The drawing decision belongs to the layer that draws, and it is made there.
 * @param {{x:number,y:number,deck:number,kind:number,mark:string}[]|null} marks  decodeMarks() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, mark:string, kind:number}[]}
 */
export function roomMarkTiles(marks, focusRoom) {
  const out = [];
  if (!Array.isArray(marks) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  for (const m of marks) {
    if (!m || (m.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = m.x | 0, ty = m.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    out.push({ tx, ty, mark: m.mark, kind: m.kind | 0 });
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
 * drawing both would stack two slate tints on the same tile.
 *
 * ⚠️ HALF THE OLD REASON HAS EXPIRED, and it is quoted rather than deleted because it is the exact
 * claim the `marks` channel falsifies: *"that source is strictly better: it survives an item being
 * stored on the tile (which overwrites `cell[1]`) and it carries the RESTRICTED and BACKED-OFF
 * states this byte cannot express."* The first half is NO LONGER A DIFFERENCE — a `marks` stockpile
 * cell survives a stored item, a device and a standing crew member exactly as `zones` does, because
 * neither rides the projection now. The second half stands and is the whole surviving reason:
 * `zones` carries the per-tile accept mask and the haul back-off bit, and this layer's vocabulary has
 * no way to say either. `roomMarkTiles` still REPORTS the mark, so nothing is hidden from a caller.
 * (If a later package replaces the zone layer wholesale, delete this filter with it.)
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
// THE GROUND ITEM LAYER (the `items` channel).
//
// WHAT IT REPLACES. A ground stack used to reach this surface as ONE CHARACTER, via the frame's
// glyph byte, and `roomCells` → `furnitureSvg` rendered it as the VS-Z-25 dashed "unknown" chip
// carrying that raw letter — `,` for Regolith, `f` for Potato, and seven more. Independent review
// photographed exactly that on `--ship grid` deck 0, room STORAGE: seven dashed boxes with ASCII in
// them, in the shipping game (`client/test/device-sprite-coverage.test.js`, NO_GROUND_ITEM_SPRITE).
//
// THE LETTER BOX WAS NOT MERELY UGLY, IT WAS LOSSY THREE WAYS, and none of the three could have been
// fixed by drawing better art:
//   1. NO COUNT. `GlyphMapper` pass 3 never writes `ItemStack.Count`, so a stack of 1 and a stack of
//      40 are the byte-identical cell. The number was not on the wire to render.
//   2. TOPMOST ONLY. Pass 3 ASSIGNS the cell per item, and the sim never merges stacks, so N stacks
//      on one tile collapse to whichever is last in store order.
//   3. DEVICES ERASE ITEMS. Pass 4 writes the device glyph to the same cell unconditionally,
//      AFTERWARDS, and every device kind is non-blocking — so a stack on a machine's tile was drawn
//      nowhere at all.
// The fix is the channel, not a better reader (`hosts/web/WireFormat.Items.cs`), which is the same
// lesson the `marks` channel recorded one package earlier.
//
// ⚠️ THIS IS NOT THE GROUND-ITEM ART PACKAGE, and the distinction is worth keeping sharp. There is
// still no ground-pile piece in the warm 60-piece set, so what this layer draws is a LABEL PLATE —
// kind and count in words and digits — not a sprite. That is deliberately in the same family as the
// unknown chip it replaces ("we are telling you what is here, honestly, without art"), and it is
// strictly more information than the letter it replaces. NO_GROUND_ITEM_SPRITE still counts the ART
// gap and is untouched by this package.
//
// VERIFIED IN A BROWSER, NOT ONLY IN ASSERTIONS (`client/tools/items-shot.mjs`, committed — the
// `marks-shot.mjs` rule: a perfectly formed SVG string paints nothing if its box is empty or its text
// is scaled to nothing, and the emitted bytes are identical either way). MEASURED on a live
// `--ship grid` host, deck 0, room STORAGE — the exact room independent review photographed with
// seven dashed chips carrying `,` ×6 and `f` ×1: **7 plates reading REGO 4 ×6 and FOOD 8, ZERO
// unknown-glyph chips left in the room**, the layer box 497×114 CSS px and visible, the first plate's
// text rendering **25 px tall** from an authored font-size of 6.5 viewBox units, and the item layer
// after the furniture layer in DOM order. The one thing the picture could NOT settle is loss 3 in a
// browser — there is no wire verb that spawns a stack, so a stack on a device tile is pinned by the
// driven test in `room-model.test.js` and not by a photograph.
//
// ⚠️ THE LEVEL-1 OVERVIEW IS DELIBERATELY NOT CHANGED, and this is a KNOWN LIMIT rather than an
// oversight, so it is written down instead of discovered later. `overview-scene.js`'s furniture layer
// does `if (!itemId) continue`, so a ground stack has always drawn NOTHING there — not a wrong thing,
// nothing — and the channel does not change that. At the Overview's ~15×13 design-px tile a plate
// carrying four characters and a number is not legible, so porting this layer would need a different
// vocabulary (a density dot, a per-room total in the room card), which is a design question and not
// this package's. The Overview's `main.js` dispatch feeds `Hud.getItems()` all the same, so whoever
// takes that decision has the data waiting.
//
// IT SPEAKS A THIRD VISUAL LANGUAGE ON PURPOSE. Amber dashed = "an order is queued here"
// (`mark-overlay.js`, the build ghosts); slate = "a zone" (`zone-overlay.js`). Stock is neither an
// order nor a zone — it is a thing lying on the floor — so it gets its own plate: a dark panel with a
// warm rubble-grey edge, the same grey the debris chunks use, because that is what loose matter looks
// like on both surfaces already.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Round to 2dp with no `-0` — the `n()` discipline both surfaces use (InvariantCulture-safe:
 *  arithmetic + ASCII concat only, no locale API). Local rather than imported from mark-overlay.js,
 *  which does not export it. */
function n2(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/**
 * Kind byte → the SHORT plate label. Derived from `STOCK_KINDS` — the client's ONE mirror of the sim's
 * `ItemKind` enum, pinned member-for-member against `sim/Sim.Core/Entities/ItemStack.cs` by
 * `stock-filter-model.test.js` — so this file adds no second spelling of the enum.
 *
 * FOUR CHARACTERS, because a 32-unit tile cannot hold `CONTROLLERMODULE` and because at four the nine
 * labels are still all DISTINCT (REGO ORE CORP FOOD SCRA PART CTRL SEAL ICE). At three they are not
 * unique in spirit — `SEA`/`SCR` — and the distinctness is not an accident to be trusted silently:
 * `items-model.test.js` asserts it, so a tenth `ItemKind` whose label collides fails a test instead of
 * quietly making two piles look like one.
 */
const ITEM_LABEL = Object.freeze(Object.fromEntries(
  STOCK_KINDS.map((e) => [e.kind, e.label.replace(/\s+/g, '').slice(0, 4)]),
));

/** The plate label for a kind byte, or '?' for a kind this client has never heard of. PURE.
 *  `?` rather than dropping the row: an unknown kind is still a real, located, counted pile, and
 *  drawing an empty tile over a full one is the exact invisibility this channel removes. */
export function itemKindLabel(kind) {
  const l = ITEM_LABEL[kind | 0];
  return l === undefined ? '?' : l;
}

/**
 * The ground item stacks inside the room, AGGREGATED PER TILE AND KIND. Every in-rect, on-deck entry
 * of the decoded `items` channel is folded into its tile; within a tile, stacks of one kind are
 * SUMMED. PURE.
 *
 * WHY THE CLIENT AGGREGATES AND THE HOST DOES NOT. The wire is one row per `ItemStack`, verbatim, so
 * the channel stays a faithful census — a summed number exists nowhere in the sim, and a later
 * consumer that needs stack granularity (anything reasoning about `ItemStack.ReservedBy`) would have
 * to add a channel to get it back. Aggregation is a DISPLAY decision — a player reading a floor wants
 * "40 REGOLITH", not "7 + 20 + 13" — so it is made here, in the display layer, where it is visible and
 * node-testable.
 *
 * ORDER IS FIRST-APPEARANCE, tiles and kinds alike, inherited from the host's store order. Nothing
 * here sorts: a client sort would be a second, silently divergent authority over what "topmost" means,
 * and the host's order is the same one `GlyphMapper` pass 3 draws in.
 *
 * @param {{x:number,y:number,deck:number,kind:number,count:number}[]|null} items  decodeItems() output
 * @param {{deck:number,rx:number,ry:number,rw:number,rh:number}} focusRoom
 * @returns {{tx:number, ty:number, stacks:{kind:number,count:number}[], total:number}[]}
 */
export function roomItemTiles(items, focusRoom) {
  const out = [];
  if (!Array.isArray(items) || !focusRoom) return out;
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const x1 = rx + (focusRoom.rw | 0), y1 = ry + (focusRoom.rh | 0);
  const byTile = new Map();
  for (const it of items) {
    if (!it || (it.deck | 0) !== (focusRoom.deck | 0)) continue;
    const tx = it.x | 0, ty = it.y | 0;
    if (tx < rx || tx >= x1 || ty < ry || ty >= y1) continue;
    const key = tx + ',' + ty;
    let tile = byTile.get(key);
    if (!tile) { tile = { tx, ty, stacks: [], total: 0 }; byTile.set(key, tile); out.push(tile); }
    const kind = it.kind | 0, count = it.count | 0;
    const seen = tile.stacks.find((s) => s.kind === kind);
    if (seen) seen.count += count; else tile.stacks.push({ kind, count });
    tile.total += count;
  }
  return out;
}

// Plate geometry, in tile-fraction-free logical units (the tile is `unit` on a side and the caller's
// viewBox scales the whole layer, so small numbers here are large on screen).
const PLATE_ROW_H = 8;      // one text row
const PLATE_PAD = 1.5;
const PLATE_INSET = 2;      // left/right/bottom margin inside the tile
const PLATE_MAX_ROWS = 2;   // beyond this the second row summarises — three rows fills a 32-unit tile
const PLATE_FILL = 'rgba(10,13,20,.72)';
const PLATE_EDGE = '#8a7d6e';   // the rubble grey from mark-overlay.js: loose matter, not an order
const PLATE_TEXT = '#d8cbb4';

/** The rows of text one tile's plate shows. Up to `PLATE_MAX_ROWS`; a tile with more kinds than that
 *  spends its last row saying how many are hidden rather than picking arbitrary winners. PURE. */
export function itemPlateRows(stacks) {
  const list = Array.isArray(stacks) ? stacks : [];
  if (!list.length) return [];
  if (list.length <= PLATE_MAX_ROWS) {
    return list.map((s) => itemKindLabel(s.kind) + ' ' + (s.count | 0));
  }
  const head = list.slice(0, PLATE_MAX_ROWS - 1)
    .map((s) => itemKindLabel(s.kind) + ' ' + (s.count | 0));
  head.push('+' + (list.length - (PLATE_MAX_ROWS - 1)) + ' KINDS');
  return head;
}

/**
 * The Room Zoom's ground-item layer as one SVG string in room-local logical units (`unit` per tile),
 * or ''. PURE — a string builder, no DOM, so the gate can see it draw. (That is the `zone-overlay.js`
 * lesson: a builder that lives inside the view can be made to return '' with the whole suite green.)
 *
 * THE FONT SIZE IS COMPUTED, NOT CHOSEN, and that is load-bearing rather than fussy. A fixed size
 * overflows the plate the moment a count reaches three digits — and the slice fixture boots with
 * stacks in the hundreds — so the row would spill across neighbouring tiles and misattribute stock to
 * a tile that has none. Fitting the size to the longest row means the plate can never lie about which
 * tile it belongs to, at the cost of small text on a busy tile. `0.62em` is the advance width of the
 * monospace stack this surface uses.
 *
 * @param {{tx:number,ty:number,stacks:{kind:number,count:number}[]}[]} tiles  roomItemTiles output
 * @param {{rx:number, ry:number}} focusRoom  the room rect's origin, for the local transform
 * @param {number} [unit]
 * @returns {string}
 */
export function itemPlateSvg(tiles, focusRoom, unit = U) {
  if (!Array.isArray(tiles) || !tiles.length || !focusRoom || !(unit > 0)) return '';
  const rx = focusRoom.rx | 0, ry = focusRoom.ry | 0;
  const out = [];
  for (const t of tiles) {
    const rows = itemPlateRows(t && t.stacks);
    if (!rows.length) continue;
    const lx = ((t.tx | 0) - rx) * unit, ly = ((t.ty | 0) - ry) * unit;
    const boxW = unit - PLATE_INSET * 2;
    const boxH = rows.length * PLATE_ROW_H + PLATE_PAD * 2;
    const boxX = lx + PLATE_INSET;
    const boxY = ly + unit - PLATE_INSET - boxH;
    const longest = rows.reduce((m, r) => (r.length > m ? r.length : m), 1);
    const fs = Math.min(6.5, (boxW - 3) / (0.62 * longest));
    let body = '<rect x="' + n2(boxX) + '" y="' + n2(boxY) + '" width="' + n2(boxW)
      + '" height="' + n2(boxH) + '" rx="2" fill="' + PLATE_FILL + '" stroke="' + PLATE_EDGE
      + '" stroke-width="1"/>';
    for (let i = 0; i < rows.length; i++) {
      const cy = boxY + PLATE_PAD + i * PLATE_ROW_H + PLATE_ROW_H / 2;
      body += '<text x="' + n2(lx + unit / 2) + '" y="' + n2(cy) + '" font-size="' + n2(fs)
        + '" fill="' + PLATE_TEXT + '" text-anchor="middle" dominant-baseline="central" '
        + 'font-family="\'Space Mono\', ui-monospace, monospace">' + rows[i] + '</text>';
    }
    // No escaping: every character here comes from ITEM_LABEL (our own ASCII table) or from `| 0`
    // arithmetic. Nothing on this layer is player- or host-authored text.
    out.push('<g class="rz-item">' + body + '</g>');
  }
  return out.length ? '<g class="rz-items" pointer-events="none">' + out.join('') + '</g>' : '';
}

/** The `"tx,ty"` keys of every tile the item layer draws a plate on — what `furnitureSvg` uses to
 *  drop the VS-Z-25 unknown chip it would otherwise stack underneath one. PURE. */
export function itemPlateTileKeys(tiles) {
  const keys = new Set();
  if (!Array.isArray(tiles)) return keys;
  for (const t of tiles) {
    if (t && itemPlateRows(t.stacks).length) keys.add((t.tx | 0) + ',' + (t.ty | 0));
  }
  return keys;
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
