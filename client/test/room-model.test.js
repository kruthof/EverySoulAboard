// Tests for the PURE Room-Zoom view-model (client/src/ui/room-model.js) + the shared deck-minimap
// (client/src/ui/deck-minimap.js). Proves: the focused-room tile-rect lookup, the
// fit transform + responsive click hit-testing (incl. letterbox-margin + out-of-room rejection),
// the in-room channel clamps (cells → items, crew, designs, decor), the palette tool → command-class
// map (exhaustive over all fifteen tools), the demolish classifier + its precedence over every layer,
// the armed-tool reducer, the local decor transforms, and the ESC rung.
//
// ⚠️ THE LAST SECTION IS DIFFERENT, and the "no DOM" line that used to open this file is no longer
// true of the whole of it. Console-retirement WP-4 put the two ORDER verbs (DIG / STRIP) on this
// surface, and the thing that can go wrong there is a LOWERING — which payload leaves the client —
// so that section instantiates the real `roomzoom-view.js` controller over `client/test/dom-lite.js`
// and asserts on the commands it sends. It sets `globalThis.document` / `globalThis.window` at the
// point of use, after every pure test above has been declared. Everything before it is unchanged and
// still pins no DOM id or class.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, paletteCommand, isStructuralTool, isOrderTool, isSweepTool, roomDragMode,
  roomMaterialTiles, nextRoomTool, roomTileRect, deckSlots, roomFit, tileFromCanvasXY,
  clampTileToRoom, roomCells, roomCrew, roomDesigns, roomDecor, itemForGlyph, demolishTarget,
  addDecor, removeDecor, escStackRung, roomMarkTiles, markLayerSvg,
} from '../src/ui/room-model.js';
import { dragModeForTool } from '../src/ui/build-drag-model.js';
import { ACCEPT_ALL, defaultStockFilter, STOCK_KINDS } from '../src/ui/stock-filter-model.js';
import { acceptsLabel, zoneMaskMismatch } from '../src/ui/zone-model.js';
import { APPLIES_NEXT_LABEL, mismatchLabel } from '../src/ui/accepts-row.js';
import { ZONE_FLAG_BACKED_OFF, MARK_KIND_NAMES, markKindName, decodeMarks } from '../src/wire/messages.js';
import { codeOnly } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { markVariant, markCellSvg } from '../src/ui/mark-overlay.js';
import { zoneLayerSvg } from '../src/ui/zone-overlay.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { deckPlanSvg, yahDotPos, deckMinimap } from '../src/ui/deck-minimap.js';

// A two-deck grid: deck 1 has a wood QUARTERS at slot 0 (tiles 4,6 12×8) + an empty hall; deck 2 has
// a HYDRO at slot 3. Byte-for-byte the host's `decks`/`rooms` shape (WireFormat.cs).
const DECKS_JSON =
  '{"type":"decks","decks":[' +
  '{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true],[1,34,6,12,8,"",0,false,true]]},' +
  '{"deck":2,"slots":[[3,10,4,10,6,"hydro",7,true,true]]}]}';
const ROOMS_JSON =
  '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96],["hydro",2,0.188,900,58.1,288.4,60]]}';

const view = decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON)));

// ---- roomTileRect / deckSlots ----

test('roomTileRect finds a room by anchor and reports its geometry + client-derived name', () => {
  const f = roomTileRect(view, 'quarters');
  assert.deepEqual(
    { anchor: f.anchor, deck: f.deck, slotIndex: f.slotIndex, rx: f.rx, ry: f.ry, rw: f.rw, rh: f.rh, name: f.displayName },
    { anchor: 'quarters', deck: 1, slotIndex: 0, rx: 4, ry: 6, rw: 12, rh: 8, name: 'QUARTERS' },
  );
  const h = roomTileRect(view, 'hydro');
  assert.equal(h.deck, 2);
  assert.equal(h.displayName, 'HYDROPONICS');
});

test('roomTileRect returns null for a vanished / blank / hall anchor (IX-Z-51)', () => {
  assert.equal(roomTileRect(view, 'gone'), null);
  assert.equal(roomTileRect(view, ''), null);
  assert.equal(roomTileRect(null, 'quarters'), null);
});

test('deckSlots returns a deck\'s slots (for the minimap) or []', () => {
  assert.equal(deckSlots(view, 1).length, 2);
  assert.equal(deckSlots(view, 2).length, 1);
  assert.deepEqual(deckSlots(view, 9), []);
});

// ---- fit transform + click hit-testing ----

const room = { rx: 4, ry: 6, rw: 12, rh: 8, deck: 1 }; // 12×8 tiles → 384×256 logical

test('roomFit scales the room to the interior and letterboxes the short axis', () => {
  // A 384×256-logical room in a 768×768 interior fits at s=2 (width-bound), letterboxed vertically.
  const fit = roomFit(room, 768, 768);
  assert.equal(fit.s, 2);
  assert.equal(fit.offX, 0);
  assert.equal(fit.offY, (768 - 256 * 2) / 2); // 128
});

test('tileFromCanvasXY inverts the fit to an absolute tile, respecting the origin', () => {
  const rect = { left: 0, top: 0, width: 768, height: 768 }; // s=2, offY=128
  // Click near the top-left interior corner of the room → tile (rx, ry).
  assert.deepEqual(tileFromCanvasXY(2, 130, rect, room), { x: 4, y: 6 });
  // Centre of the room's logical space (192,128 logical → px 384, 128*2+128=384) → mid tile.
  assert.deepEqual(tileFromCanvasXY(384, 384, rect, room), { x: 4 + 6, y: 6 + 4 });
});

test('tileFromCanvasXY rejects the letterbox margin and out-of-room clicks (IX-Z-11)', () => {
  const rect = { left: 0, top: 0, width: 768, height: 768 };
  assert.equal(tileFromCanvasXY(384, 10, rect, room), null);   // above the letterboxed room
  assert.equal(tileFromCanvasXY(384, 760, rect, room), null);  // below it
  assert.equal(tileFromCanvasXY(-5, 384, rect, room), null);   // left of the canvas
});

test('clampTileToRoom is the half-open rect test', () => {
  assert.equal(clampTileToRoom(4, 6, room), true);
  assert.equal(clampTileToRoom(15, 13, room), true);  // last in-room tile (4+12-1, 6+8-1)
  assert.equal(clampTileToRoom(16, 6, room), false);  // one past the right edge
  assert.equal(clampTileToRoom(3, 6, room), false);
});

// ---- palette command map (exhaustive) ----

test('paletteCommand maps every one of the fifteen tools to a class + verb', () => {
  const byTool = Object.fromEntries(ROOM_TOOLS.map((t) => [t, paletteCommand(t)]));
  assert.equal(ROOM_TOOLS.length, 15);
  assert.deepEqual(byTool.wall, { cls: 'structural', verb: 'build', kind: 'wall' });
  assert.deepEqual(byTool.floor, { cls: 'structural', verb: 'build', kind: 'floor' });
  assert.deepEqual(byTool.door, { cls: 'structural', verb: 'build', kind: 'door' });
  for (const [t, dk] of [['bunk', 'Bed'], ['desk', 'Desk'], ['chair', 'Chair'], ['locker', 'Locker'], ['plant', 'PlantPot'], ['lamp', 'Light']]) {
    assert.equal(byTool[t].cls, 'functional');
    assert.equal(byTool[t].verb, 'place');
    assert.equal(byTool[t].deviceKind, dk);
  }
  assert.deepEqual(byTool.rug, { cls: 'cosmetic', verb: 'decor', itemId: 'rug' });
  assert.deepEqual(byTool.shelf, { cls: 'cosmetic', verb: 'decor', itemId: 'bookshelf' });
  assert.deepEqual(byTool.demolish, { cls: 'demolish', verb: null });
  // The THREE ORDER verbs. `verb` is the WIRE verb name, not 'build': an order is a designation, and
  // routing it through Cmd.build would hand it to BuildSystem (controls.js:52-58). STOCKPILE joined
  // dig/strip when the altitude rule was corrected — its extent IS its capacity (one stack per zoned
  // tile), and this is the only surface that can drag an extent.
  assert.deepEqual(byTool.dig, { cls: 'order', verb: 'dig' });
  assert.deepEqual(byTool.stockpile, { cls: 'order', verb: 'stockpile' });
  assert.deepEqual(byTool.strip, { cls: 'order', verb: 'strip' });
  assert.ok(ROOM_TOOLS.includes('stockpile'),
    'ROOM_TOOLS lost STOCKPILE. It is not on the Overview either (overview-model.js ORDER_TOOLS), ' +
    'so the verb would be unreachable on the whole standard surface — surface-boundary.test.js ' +
    'would then need a KNOWN_GAPS entry, and the ledger is asserted EMPTY.');
  assert.deepEqual(paletteCommand('nope'), { cls: 'none', verb: null });
  // isStructuralTool: wall/floor/door drag-build; everything else false — INCLUDING the two order
  // tools, which sweep but carry no material and never reach the material strip.
  for (const t of ['wall', 'floor', 'door']) assert.equal(isStructuralTool(t), true);
  for (const t of ['bunk', 'rug', 'demolish', 'dig', 'stockpile', 'strip', null, 'nope']) assert.equal(isStructuralTool(t), false);
  // isOrderTool / isSweepTool: the two sibling sets the three gesture sites gate on.
  for (const t of ['dig', 'stockpile', 'strip']) assert.equal(isOrderTool(t), true);
  for (const t of ['wall', 'floor', 'door', 'bunk', 'rug', 'demolish', null, 'nope']) assert.equal(isOrderTool(t), false);
  for (const t of ['wall', 'floor', 'door', 'dig', 'stockpile', 'strip']) assert.equal(isSweepTool(t), true);
  for (const t of ['bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant', 'demolish', null, 'nope']) {
    assert.equal(isSweepTool(t), false);
  }
  // Every tool the palette renders has a label — a missing one paints an empty button.
  for (const t of ROOM_TOOLS) assert.ok(TOOL_LABEL[t], `no TOOL_LABEL for '${t}'`);
});

// MUTATION: `roomDragMode` returning `dragModeForTool(tool)` unconditionally ⇒ dig/strip sweep
// 'single' and a drag across a wreck designates ONE tile ⇒ the driven sweep tests below go red too.
test('WP-4: roomDragMode sweeps an ORDER tool as a FILLED region, and defers otherwise', () => {
  assert.equal(roomDragMode('dig'), 'fill');
  assert.equal(roomDragMode('strip'), 'fill');
  // For STOCKPILE `fill` is the MECHANIC, not a taste: `JobWork.IsFreeStockpileTile` is one stack per
  // zoned tile, so a 3×3 drag is 9 stacks and a `perimeter` sweep would silently deliver 8.
  assert.equal(roomDragMode('stockpile'), 'fill');
  // Every non-order tool is passed through to build-drag-model UNCHANGED — asserted against the real
  // function, not against re-typed literals, so a change to either side reddens.
  for (const t of [...ROOM_TOOLS.filter((x) => !isOrderTool(x)), null, 'nope', 'move']) {
    assert.equal(roomDragMode(t), dragModeForTool(t), `roomDragMode drifted from dragModeForTool for '${t}'`);
  }
  assert.equal(roomDragMode('wall'), 'perimeter');   // and the pass-through really is non-trivial
  assert.equal(roomDragMode('floor'), 'fill');
  assert.equal(roomDragMode('door'), 'single');
});

test('the armed-tool reducer arms and disarms the three order tools like any other', () => {
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'dig' }), 'dig');
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'dig' }), null);
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'stockpile' }), 'stockpile');
  assert.equal(nextRoomTool('stockpile', { t: 'toggle', tool: 'stockpile' }), null);
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'stockpile' }), 'stockpile');
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'strip' }), 'strip');
  assert.equal(nextRoomTool('strip', { t: 'toggle', tool: 'wall' }), 'wall');
  assert.equal(nextRoomTool('strip', { t: 'clear' }), null);
});

// ---- armed-tool reducer ----

test('nextRoomTool arms, toggles off, replaces, and clears (single slot)', () => {
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'wall' }), 'wall');
  assert.equal(nextRoomTool('wall', { t: 'toggle', tool: 'wall' }), null); // re-arm disarms
  assert.equal(nextRoomTool('wall', { t: 'toggle', tool: 'door' }), 'door'); // replace
  assert.equal(nextRoomTool('door', { t: 'clear' }), null);
  assert.equal(nextRoomTool('door', { t: 'toggle', tool: 'bogus' }), 'door'); // unknown ignored
});

// ---- channel clamps ----

function frameWith(placements, w = 24, h = 20, deck = 1) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = [46, 0, 0, 0]; // '.' floor
  for (const [x, y, ch] of placements) cells[y * w + x] = [ch.charCodeAt(0), 0, 0, 0];
  return { type: 'frame', deck, w, h, cells };
}

test('roomCells clamps to the room rect + deck and skins glyphs to items / unknown chips', () => {
  const frame = frameWith([[5, 7, 'b'], [6, 7, 'z'], [4, 6, '#'], [1, 1, 'b']]); // bed, unknown, wall, out-of-room bed
  const cells = roomCells(frame, room);
  const bed = cells.find((c) => c.tx === 5 && c.ty === 7);
  assert.equal(bed.itemId, 'bunk-bed');
  const unknown = cells.find((c) => c.tx === 6 && c.ty === 7);
  assert.equal(unknown.itemId, ''); // 'z' has no mapping → the dashed chip
  assert.ok(!cells.some((c) => c.tx === 4 && c.ty === 6)); // '#' is structure, not furniture
  assert.ok(!cells.some((c) => c.tx === 1 && c.ty === 1)); // outside the room rect
  // Wrong-deck frame yields nothing.
  assert.deepEqual(roomCells({ ...frame, deck: 9 }, room), []);
});

test('itemForGlyph maps device glyphs, skips floor/wall, and is empty for the unmapped', () => {
  assert.equal(itemForGlyph('D'.charCodeAt(0)), 'desk');
  assert.equal(itemForGlyph('P'.charCodeAt(0)), 'potted-plant');
  assert.equal(itemForGlyph('.'.charCodeAt(0)), '');
  assert.equal(itemForGlyph('#'.charCodeAt(0)), '');
  assert.equal(itemForGlyph('z'.charCodeAt(0)), '');
});

test('roomCrew keeps only crew on the room deck inside the rect', () => {
  const crew = [
    { cid: 1, x: 6, y: 7, deck: 1 }, // in
    { cid: 2, x: 1, y: 1, deck: 1 }, // out of rect
    { cid: 3, x: 6, y: 7, deck: 2 }, // wrong deck
  ];
  const inRoom = roomCrew(crew, room);
  assert.deepEqual(inRoom.map((c) => c.cid), [1]);
});

test('roomDesigns clamps design cells to the room + deck and decodes the ledger', () => {
  // element 6 = material (append-only); the 3rd design carries it, the others omit it → 0.
  const designs = { cells: [[5, 7, 1, 0, 0, 3, 2], [6, 8, 1, 1, 2, 2], [1, 1, 1, 0, 0, 1], [5, 7, 2, 0, 0, 1]] };
  const g = roomDesigns(designs, room);
  assert.equal(g.length, 2); // the out-of-rect and wrong-deck cells drop
  assert.deepEqual(g[0], { x: 5, y: 7, kind: 0, delivered: 0, required: 3, material: 2 });
  assert.deepEqual(g[1], { x: 6, y: 8, kind: 1, delivered: 2, required: 2, material: 0 });
});

test('roomMaterialTiles skins every in-room wall + only non-default floors', () => {
  // two walls inside the room (5,7)+(6,8), one wall out of the room (1,1); floor materials on (7,7).
  const frame = frameWith([[5, 7, '#'], [6, 8, '#'], [1, 1, '#']]);
  const materials = [
    { x: 5, y: 7, deck: 1, kind: 0, mat: 2 }, // wall gets material 2
    { x: 7, y: 7, deck: 1, kind: 1, mat: 4 }, // floor gets material 4
    { x: 9, y: 9, deck: 2, kind: 1, mat: 1 }, // wrong deck → ignored
  ];
  const tiles = roomMaterialTiles(frame, room, materials);
  const walls = tiles.filter((t) => t.kind === 'wall');
  const floors = tiles.filter((t) => t.kind === 'floor');
  assert.equal(walls.length, 2);                                     // both in-room walls, out-of-room dropped
  assert.deepEqual(walls.find((t) => t.tx === 5 && t.ty === 7), { tx: 5, ty: 7, kind: 'wall', mat: 2 });
  assert.deepEqual(walls.find((t) => t.tx === 6 && t.ty === 8), { tx: 6, ty: 8, kind: 'wall', mat: 0 }); // no channel entry → default
  assert.deepEqual(floors, [{ tx: 7, ty: 7, kind: 'floor', mat: 4 }]); // only the materialed floor
  assert.deepEqual(roomMaterialTiles(frame, { ...room, deck: 9 }, materials), []); // wrong deck → empty
});

test('roomDecor clamps decor to the room + deck', () => {
  const decor = [{ deck: 1, x: 6, y: 7, itemId: 'rug' }, { deck: 1, x: 0, y: 0, itemId: 'rug' }, { deck: 2, x: 6, y: 7, itemId: 'rug' }];
  assert.deepEqual(roomDecor(decor, room).map((d) => d.x), [6]);
});

// ---- demolish classifier + precedence ----

test('demolishTarget classifies each layer and its verb', () => {
  const frame = frameWith([[5, 7, 'b'], [4, 6, '#']]);
  const designs = [[8, 8, 1, 0, 0, 2]];
  const decor = [{ deck: 1, x: 9, y: 9, itemId: 'rug' }];
  assert.deepEqual(demolishTarget(8, 8, designs, decor, frame), { kind: 'pending', verb: 'cancel' });
  assert.deepEqual(demolishTarget(5, 7, designs, decor, frame), { kind: 'device', verb: 'remove' });
  assert.deepEqual(demolishTarget(9, 9, designs, decor, frame), { kind: 'decor', verb: 'decor-remove' });
  assert.deepEqual(demolishTarget(4, 6, designs, decor, frame), { kind: 'built-wall', verb: null });
  assert.deepEqual(demolishTarget(2, 2, designs, decor, frame), { kind: 'empty', verb: null });
});

test('demolishTarget precedence: pending > device > decor > built (IX-Z-25)', () => {
  const frame = frameWith([[7, 7, 'b']]);                 // a device
  const designs = [[7, 7, 1, 0, 0, 1]];                   // a pending ghost on the same tile
  const decor = [{ deck: 1, x: 7, y: 7, itemId: 'rug' }]; // a rug on the same tile
  assert.equal(demolishTarget(7, 7, designs, decor, frame).kind, 'pending'); // pending wins
  assert.equal(demolishTarget(7, 7, [], decor, frame).kind, 'device');       // then device
  assert.equal(demolishTarget(7, 7, [], decor, frameWith([])).kind, 'decor'); // then decor
});

// ---- local decor transforms ----

test('addDecor / removeDecor are pure and one-per-tile', () => {
  let d = addDecor([], 1, 6, 7, 'rug');
  assert.equal(d.length, 1);
  d = addDecor(d, 1, 6, 7, 'bookshelf'); // same tile replaces
  assert.equal(d.length, 1);
  assert.equal(d[0].itemId, 'bookshelf');
  d = addDecor(d, 1, 8, 9, 'rug');
  assert.equal(d.length, 2);
  const removed = removeDecor(d, 1, 6, 7);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].x, 8);
});

// ---- ESC rung ----

test('escStackRung: armed disarms; else an open room exits; else pass', () => {
  assert.equal(escStackRung({ armed: true, roomOpen: true }), 'disarm');
  assert.equal(escStackRung({ armed: false, dialogueOpen: true, roomOpen: true }), 'dialogue');
  assert.equal(escStackRung({ armed: false, roomOpen: true }), 'exit');
  assert.equal(escStackRung({ armed: false, roomOpen: false }), 'pass');
});

// ---- shared deck minimap ----

test('deckPlanSvg renders one slot per present room, ringing the focused one', () => {
  const slots = deckSlots(view, 1);
  const svg = deckPlanSvg(slots, 0);
  assert.match(svg, /data-anchor="quarters"/);
  assert.match(svg, /data-slot="0"/);
  assert.match(svg, /fill="#e8863c"/);   // focused slot is amber
  assert.match(svg, /stroke="#f2b563"/); // focused slot is ringed
  assert.ok(!/data-slot="7"/.test(svg)); // no empty placeholders for absent slots
});

test('yahDotPos centres the you-are-here dot over the focused slot, or null past the grid', () => {
  const p = yahDotPos(0);
  assert.ok(p && typeof p.left === 'number' && typeof p.top === 'number');
  assert.equal(yahDotPos(9), null);
  assert.match(deckMinimap(deckSlots(view, 1), 0), /class="rz-yah"/);
});

test('U is the 32-unit tile the mock grid is drawn against', () => {
  assert.equal(U, 32);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-2 — DEBRIS + DESIGNATION MARKS in the Level-2 Room Zoom (console-retirement plan §4.1 ii).
//
// The acceptance — "a designated tile renders differently from an undesignated one, asserted on the
// fg byte, driven from the real fixture" — is driven here from `frameDeck1` of the live capture
// client/test/fixtures/overview-grid.json: the mid-dig wreck, the only frame carrying fg 4 (Debris,
// undesignated) and fg 15 (Designate) together. All 33 of those cells share glyph code 37 (`'%'`),
// which is in this module's own `NON_FURNITURE` set — so before this package both kinds rendered as
// nothing, and `cell[1]` is the ONLY thing that can tell them apart. The tripwire below pins that.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;               // deck 1, 45×18, mid-dig
const DECK1 = 1;

/** A focus rect for a deck-1 slot, taken from the fixture's own geometry (never hand-written). */
function slotFocus(anchorOrIndex) {
  const s = deckSlots(fixView, DECK1).find((e) => (typeof anchorOrIndex === 'string'
    ? e.anchorName === anchorOrIndex : e.slotIndex === anchorOrIndex));
  assert.ok(s, `deck-1 slot ${anchorOrIndex} is missing from the fixture`);
  return { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
}
/** The whole deck as one focus rect — for the census tests, where clamping is not the subject. */
const WHOLE_DECK1 = { deck: DECK1, rx: 0, ry: 0, rw: wreck.w, rh: wreck.h };

/**
 * ⚠️ THE FIXTURE ADAPTER — read this before scoring anything below as evidence about the channel.
 *
 * `overview-grid.json` predates the `marks` channel: it carries a captured FRAME and no `marks`
 * message. Rather than throw away the WP-2 acceptance — which is about the wreck's REAL geometry, 30
 * debris and 3 dig cells at real coordinates inside real rooms — this rebuilds a `marks`-shaped
 * input from that frame's fg bytes, using the table `mark-overlay.js` used to export.
 *
 * WHAT IT IS: a way to keep driving the pure mark model (clamping, layer geometry, vocabulary) from
 * real captured wreck geometry.
 * WHAT IT IS NOT: evidence about the `marks` channel. It CANNOT be — it is derived from `cell[1]`,
 * the lossy byte the channel replaces, so every mark the projection erased is missing from it too.
 * The channel's own evidence is `client/test/fixtures/marks-grid.json`, a LIVE capture whose write
 * predicate REQUIRES at least one occluded mark, driven in `client/test/marks-model.test.js`.
 */
const FG_TO_KIND = { 4: 0, 15: 1, 16: 2, 26: 3 };
function marksFromFrame(frame) {
  const out = [];
  if (!frame || !Array.isArray(frame.cells)) return out;
  for (let ty = 0; ty < frame.h; ty += 1) {
    for (let tx = 0; tx < frame.w; tx += 1) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const kind = FG_TO_KIND[cell[1] | 0];
      if (kind === undefined) continue;
      out.push({ x: tx, y: ty, deck: frame.deck | 0, kind, mark: MARK_KIND_NAMES[kind] });
    }
  }
  return out;
}
const wreckMarks = marksFromFrame(wreck);
/** The same adapted marks as a WIRE MESSAGE, for the driven rigs (which read `Hud.getMarks()`). */
const WRECK_MARKS_MSG = { type: 'marks', cells: wreckMarks.map((m) => [m.x, m.y, m.deck, m.kind]) };

/** Every `<g class="mk mk-KIND">…</g>` in an SVG string, as `{kind, body}`. */
function marks(svg) {
  return [...svg.matchAll(/<g class="mk mk-([a-z]+)">([\s\S]*?)<\/g>/g)].map((m) => ({ kind: m[1], body: m[2] }));
}

test('WP-2: the fixture can actually DRIVE the designation acceptance (the anti-vacuity tripwire)', () => {
  // Read straight off the wire cells — independent of the code under test.
  const cens = new Map();
  for (const c of wreck.cells) {
    if (!Array.isArray(c)) continue;
    const e = cens.get(c[1]) || { count: 0, glyphs: new Set() };
    e.count += 1; e.glyphs.add(c[0]); cens.set(c[1], e);
  }
  assert.ok(cens.get(4) && cens.get(4).count >= 1,
    'frameDeck1 carries NO fg-4 (Debris) cell — every "undesignated tile" assertion below would then '
    + 'be a claim about the empty set. The frame must be re-captured from a live `--ship grid` host '
    + 'mid-dig, gated on the predicate "frameDeck1 carries fg 4 AND fg 15" (the fixture\'s own `note` '
    + 'describes the capture; note it names a scratchpad script that is NOT in the repo).');
  assert.ok(cens.get(15) && cens.get(15).count >= 1,
    'frameDeck1 carries NO fg-15 (Designate) cell, so "renders differently" is unfalsifiable here.');
  assert.equal(cens.get(4).count, 30);   // the measured census, pinned so a recapture fails LOUDLY
  assert.equal(cens.get(15).count, 3);
  // THE LOAD-BEARING FACT: identical glyph, different fg. `cell[0]` cannot separate these tiles.
  assert.deepEqual([...cens.get(4).glyphs], [37]);
  assert.deepEqual([...cens.get(15).glyphs], [37]);
  // …and 37 really is skipped by the furniture path, which is why a NEW layer was needed.
  assert.deepEqual(roomCells(wreck, WHOLE_DECK1).filter((c) => c.code === 37), []);
});

// ⚠️ RENAMED, and the old title is quoted because it named the SOURCE and the source moved:
// *"WP-2: roomMarkTiles reads cell[1] and reports every marked tile on the deck"*. It reads the
// decoded `marks` channel now; `fg` and `code` left the output with the frame they came from.
test('roomMarkTiles reports every marked tile on the deck, from the marks channel', () => {
  const all = roomMarkTiles(wreckMarks, WHOLE_DECK1);
  assert.equal(all.length, 33);
  assert.equal(all.filter((m) => m.mark === 'debris').length, 30);
  assert.equal(all.filter((m) => m.mark === 'dig').length, 3);
  // every reported tile carries the kind it claims, at the coordinates it claims, and the kind and
  // its name agree — a row whose numeric kind and name disagreed would draw one thing and be
  // censused as another.
  const byXy = new Map(wreckMarks.map((m) => [m.x + ',' + m.y, m]));
  for (const m of all) {
    const src = byXy.get(m.tx + ',' + m.ty);
    assert.ok(src, `roomMarkTiles invented a tile at ${m.tx},${m.ty} that is not on the channel`);
    assert.equal(src.mark, m.mark);
    assert.equal(markKindName(m.kind), m.mark);
  }
  // and nothing unmarked leaked in
  assert.equal(all.filter((m) => !MARK_KIND_NAMES.includes(m.mark)).length, 0);
  // NON-VACUITY: the adapter must actually have found the wreck, or every count above is a claim
  // about the empty set dressed as a census.
  assert.equal(wreckMarks.length, 33);
});

test('WP-2: marks are clamped to the focused room and its deck, like every other channel', () => {
  // The 3 designated tiles sit in the authored 'hold' (deck 1 slot 6, the live wreck room); the
  // debris lies in the halls either side of it. Both rects come from the fixture's own `decks`.
  const hold = roomMarkTiles(wreckMarks, slotFocus('hold'));
  assert.equal(hold.length, 3);
  assert.ok(hold.every((m) => m.mark === 'dig'));

  const halls = deckSlots(fixView, DECK1)
    .filter((s) => !s.anchorName)
    .map((s) => roomMarkTiles(wreckMarks, { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h }));
  const withDebris = halls.filter((h) => h.length);
  assert.equal(withDebris.length, 2, 'the wreck fills exactly two deck-1 halls in this capture');
  assert.deepEqual(withDebris.map((h) => h.length).sort((a, b) => a - b), [14, 16]);
  assert.ok(withDebris.every((h) => h.every((m) => m.mark === 'debris')));

  // off-deck frame → nothing (the deck gate), and a room off the wreck → nothing
  assert.deepEqual(roomMarkTiles(wreckMarks, { ...slotFocus('hold'), deck: 0 }), []);
  assert.deepEqual(roomMarkTiles(wreckMarks, slotFocus('command')), []);
  assert.deepEqual(roomMarkTiles(null, WHOLE_DECK1), []);
});

test('WP-2: a DESIGNATED tile renders differently from an UNDESIGNATED one in the Room Zoom', () => {
  const holdFocus = slotFocus('hold');
  const hallFocus = slotFocus(5); // the hall the wreck's debris fills
  const digSvg = markLayerSvg(roomMarkTiles(wreckMarks, holdFocus), holdFocus);
  const debSvg = markLayerSvg(roomMarkTiles(wreckMarks, hallFocus), hallFocus);

  const dig = marks(digSvg);
  const deb = marks(debSvg);
  assert.equal(dig.length, 3);
  assert.equal(deb.length, 16);
  assert.ok(dig.every((k) => k.kind === 'dig'));
  assert.ok(deb.every((k) => k.kind === 'debris'));

  // THE ACCEPTANCE, as a set difference over position-independent shapes (two rubble piles at
  // different tiles differ for a boring reason; a designated tile must differ for the real one).
  const shape = (k) => k.body.replace(/[-\d.]+/g, '#');
  const debShapes = new Set(deb.map(shape));
  for (const k of dig) {
    assert.ok(!debShapes.has(shape(k)),
      'a DESIGNATED tile emitted the same shape as an UNDESIGNATED one — the fg byte reached the '
      + 'layer and changed nothing, which is the whole of WP-2');
  }
  assert.ok(dig.every((k) => k.body.includes('mk-order-ring')));
  assert.ok(deb.every((k) => !k.body.includes('mk-order-ring')));
  // the rubble is still there under the order — a dig mark queues work, it does not clear the tile
  assert.ok(dig.every((k) => k.body.includes('<path d="M')));

  assert.match(digSvg, /^<g class="rz-marks" pointer-events="none">/);
  assert.ok(digSvg.endsWith('</g>'));
  // deterministic + empty-safe
  assert.equal(markLayerSvg(roomMarkTiles(wreckMarks, holdFocus), holdFocus), digSvg);
  assert.equal(markLayerSvg([], holdFocus), '');
  assert.equal(markLayerSvg(roomMarkTiles(wreckMarks, slotFocus('command')), slotFocus('command')), '');
});

// The geometry pin, READ OUT OF THE EMITTED STRING — the `zone-overlay.test.js:106-111` shape, and
// the assertion this file shipped WITHOUT on its first draft. What stood here instead recomputed the
// transform inside the test and never looked at `digSvg` at all, so it re-asserted `roomMarkTiles`'
// clamping (already covered three tests above) and left the layer's own placement math untested.
// THREE mutations survived the whole suite green, and the first of them is not cosmetic:
//   • drop the `- rx` / `- ry` room-local conversion  ⇒ marks land at 800–1024 in a 384-unit
//     viewBox, i.e. THE ROOM ZOOM'S MARK LAYER IS ENTIRELY INVISIBLE IN THE RUNNING GAME;
//   • emit every mark at a constant (0,0)            ⇒ all marks stacked in the top-left corner;
//   • halve the default `unit`                       ⇒ half-size marks at the wrong pitch.
// All three are now covered, `unit` included, because the expected numbers are DERIVED from U and
// from the fixture's own tile coordinates rather than copied out of the current output.
test('WP-2: the Room Zoom places each mark in ROOM-LOCAL space, one U per tile', () => {
  const holdFocus = slotFocus('hold');
  const tiles = roomMarkTiles(wreckMarks, holdFocus);
  const svg = markLayerSvg(tiles, holdFocus);
  assert.equal(tiles.length, 3);

  // Two independent rects per dig mark: the rubble bed (inset 12% of the tile, 76% wide) and the
  // order ring (inset 1). `<rect x=` only matches the bed — the ring carries `class` first.
  const beds = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]]);
  const rings = [...svg.matchAll(/<rect class="mk-order-ring" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]]);

  assert.deepEqual(beds, tiles.map((m) => [
    (m.tx - holdFocus.rx) * U + U * 0.12, (m.ty - holdFocus.ry) * U + U * 0.12, U * 0.76, U * 0.76,
  ]), 'a mark\'s rubble bed is not at its tile\'s room-local origin, at one U per tile');
  assert.deepEqual(rings, tiles.map((m) => [
    (m.tx - holdFocus.rx) * U + 1, (m.ty - holdFocus.ry) * U + 1, U - 2, U - 2,
  ]), 'the order ring is not on its own tile');

  // …and every emitted rect lies inside the room's logical viewBox, which is the property the
  // dropped-transform mutation actually violates (the layer would draw off-canvas).
  for (const [x, y, w, h] of beds.concat(rings)) {
    assert.ok(x >= 0 && y >= 0 && x + w <= holdFocus.rw * U && y + h <= holdFocus.rh * U,
      `a mark rect (${x},${y},${w},${h}) falls outside the ${holdFocus.rw * U}×${holdFocus.rh * U} `
      + 'room viewBox — the Room Zoom would draw the whole layer off-screen');
  }

  // `unit` is honoured rather than hard-coded: half the pitch halves every number.
  const half = [...markLayerSvg(tiles, holdFocus, U / 2)
    .matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  assert.deepEqual(half, tiles.map((m) => [
    (m.tx - holdFocus.rx) * (U / 2) + (U / 2) * 0.12, (m.ty - holdFocus.ry) * (U / 2) + (U / 2) * 0.12,
  ]));
});

// THE VARIANT ARGUMENT, the Room Zoom's half. See the long note in `overview-scene.test.js` for the
// measurement behind it: `markVariant(tx,ty) = (tx*7 + ty*13) % 3` and 7 ≡ 13 ≡ 1 (mod 3), so it is
// COMMUTATIVE and an argument-order swap is a true equivalent mutant that no test can kill. What is
// killable — and is killed here — is passing the wrong tile's coordinates at all. The Room Zoom's box
// is exact (`(tx-rx)*U, (ty-ry)*U, U, U`), so this is a byte-for-byte comparison against the shared
// builder with no geometry reconstructed in the test.
//
// MUTATION: `markVariant(m.tx, m.ty)` -> `markVariant(0, 0)` in room-model.js ⇒ RED.
test('the Room Zoom draws each mark with ITS OWN tile\'s variant', () => {
  const hallFocus = slotFocus(5);                   // the hall the wreck's debris fills
  const tiles = roomMarkTiles(wreckMarks, hallFocus);
  assert.ok(tiles.length >= 10, `only ${tiles.length} marks in the hall — the pin is thin`);
  const drawn = marks(markLayerSvg(tiles, hallFocus));
  const shown = tiles.filter((t) => t.mark !== 'stockpile');
  assert.equal(drawn.length, shown.length);

  const rx = hallFocus.rx | 0, ry = hallFocus.ry | 0;
  for (let i = 0; i < shown.length; i += 1) {
    const m = shown[i];
    const expect = markCellSvg(m.mark, (m.tx - rx) * U, (m.ty - ry) * U, U, U, markVariant(m.tx, m.ty));
    assert.equal('<g class="mk mk-' + drawn[i].kind + '">' + drawn[i].body + '</g>', expect,
      `the mark at ${m.tx},${m.ty} was not drawn by markCellSvg with its own tile's variant`);
  }
  // …and the variants really vary here, or a constant-variant mutation would pass the comparison.
  assert.equal(new Set(shown.map((m) => markVariant(m.tx, m.ty))).size, 3,
    'this room no longer spans all three rubble arrangements, so `markVariant(...) -> 0` would '
    + 'survive the comparison above');
});

// The mark colours, pinned. `zone-overlay.test.js` pins its equivalent, and without this the dialect
// the whole rendering argument rests on — AMBER DASHED MEANS "an order is queued on this tile",
// borrowed from the build ghosts — is unasserted: repainting the order ring rubble-grey survived the
// entire suite. The stockpile swatch is checked against the string `zone-overlay.js` actually emits,
// so "reused verbatim from WP-3" is a measured claim rather than a comment.
test('WP-2: amber means an order; rubble does not; the zone swatch is WP-3\'s own', () => {
  const AMBER = '#f2b563';
  const dig = markCellSvg('dig', 0, 0, 32, 32);
  const debris = markCellSvg('debris', 0, 0, 32, 32);
  const strip = markCellSvg('strip', 0, 0, 32, 32);

  assert.match(dig, new RegExp(`class="mk-order-ring"[^/]*stroke="${AMBER}"`),
    'the dig order ring is not amber — the "an order is queued here" dialect it shares with the '
    + 'build ghosts is what makes a designated tile legible as an ORDER rather than as more rubble');
  assert.match(strip, new RegExp(`class="mk-condemn"[^/]*stroke="${AMBER}"`));
  assert.ok(!debris.includes(AMBER),
    'an UNDESIGNATED debris tile carries the order colour — a player would read a queued order that '
    + 'does not exist');
  // the rubble itself is the warm grey, on both the plain and the designated tile
  assert.ok(debris.includes('fill="#8a7d6e"') && dig.includes('fill="#8a7d6e"'));

  // The stockpile swatch, compared against zoneLayerSvg's real output rather than a copied literal.
  const zoneSvg = zoneLayerSvg([{ tx: 0, ty: 0, restricted: false, backedOff: false, label: 'x' }],
    { rx: 0, ry: 0 });
  const attrs = (s) => (/fill="(rgba\([^"]+\))" stroke="(rgba\([^"]+\))"/.exec(s) || []).slice(1, 3);
  assert.deepEqual(attrs(markCellSvg('stockpile', 0, 0, 32, 32)), attrs(zoneSvg));
  assert.equal(attrs(zoneSvg).length, 2, 'the zone-overlay parse rotted — the comparison is vacuous');
});

// ── SYNTHETIC-CELL COVERAGE (clearly separated from the fixture-driven acceptance above) ──
// `Stockpile` (16) and `Deconstruct` (26) appear NOWHERE in the capture — no authored ship zones a
// stockpile (CLAUDE.md: a zone is the player's decision) and nothing in it is condemned. Their
// behaviour is therefore covered by hand-built single cells, and it is labelled as such: these tests
// prove the table and the builder, NOT that the shipped ship draws them.

// ⚠️ REPLACES *"WP-2 (synthetic): all four GlyphColor bytes map to their mark, and no other byte
// does"*, which asserted `MARK_FOR_FG`. That table is retired: a projected fg byte no longer names a
// mark anywhere in the client. The property that survives is the WIRE kind → name table, and it is
// pinned against the C# constants themselves in `client/test/marks-model.test.js`.
test('(synthetic): the four wire kinds map to their mark, and no other kind does', () => {
  assert.deepEqual([...MARK_KIND_NAMES], ['debris', 'dig', 'stockpile', 'strip']);
  for (let kind = -3; kind <= 40; kind += 1) {
    assert.equal(markKindName(kind), MARK_KIND_NAMES[kind] || '', `kind ${kind}`);
  }
  // an unknown mark name draws nothing rather than throwing
  assert.equal(markCellSvg('nonsense', 0, 0, 32, 32), '');
  assert.equal(markCellSvg('debris', 0, 0, 0, 32), ''); // a degenerate box draws nothing
});

test('the Room Zoom REPORTS a stockpile tile but leaves the drawing to WP-3', () => {
  const focus = { deck: 0, rx: 0, ry: 0, rw: 2, rh: 1 };
  const chan = [{ x: 0, y: 0, deck: 0, kind: 2, mark: 'stockpile' },
    { x: 1, y: 0, deck: 0, kind: 3, mark: 'strip' }];
  const tiles = roomMarkTiles(chan, focus);
  assert.deepEqual(tiles.map((t) => t.mark), ['stockpile', 'strip']);
  const svg = markLayerSvg(tiles, focus);
  // The strip mark draws; the stockpile one does not — zoneLayerSvg already paints that tile from
  // the `zones` channel, one line above this layer in roomzoom-view.js, and stacking two slate tints
  // on one tile is a visible artefact. Semantics are unchanged: a stockpile kind still means
  // "stockpile zone"; only the layer that draws it differs.
  assert.deepEqual(marks(svg).map((k) => k.kind), ['strip']);
  assert.ok(svg.includes('mk-condemn'), 'a condemned wall must carry the strip mark');
  // and a stockpile-only room emits no layer at all rather than an empty group
  assert.equal(markLayerSvg([{ tx: 0, ty: 0, mark: 'stockpile' }], focus), '');
});

// ⚠️ RETITLED from *"the two surfaces speak ONE vocabulary — same fg byte, same mark"*: the sweep is
// over WIRE KINDS now, not fg bytes. The property is unchanged and is the reason `mark-overlay.js`
// exists — one kind must not draw two different things on the two surfaces.
test('the two surfaces speak ONE vocabulary — same wire kind, same mark', () => {
  // Drives BOTH real composers over the same single-cell marks payload, kind by kind, so the two
  // surfaces cannot drift apart. The Overview draws all four kinds; the Room Zoom draws three by
  // design (above).
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[46, 2, 0, 0]] };
  let sawMark = 0;
  for (let kind = -2; kind <= 30; kind += 1) {
    const chan = decodeMarks({ type: 'marks', cells: [[0, 0, 0, kind]] });
    const ovKinds = marks(overviewScene({ deck: 0, decksView: fixView, frame, crew: [], marks: chan })).map((k) => k.kind);
    const rzKinds = roomMarkTiles(chan, focus).map((t) => t.mark);
    assert.deepEqual(ovKinds, rzKinds, `kind ${kind}: the Overview and the Room Zoom disagree about `
      + 'what this kind means. They share mark-overlay.js precisely so they cannot.');
    if (rzKinds.length) {
      sawMark += 1;
      // …and the drawn cell is byte-identical for the same box, so "different surface" can never
      // become "different meaning".
      assert.equal(markCellSvg(rzKinds[0], 0, 0, 10, 10, markVariant(0, 0)),
        markCellSvg(ovKinds[0], 0, 0, 10, 10, markVariant(0, 0)));
    }
  }
  assert.equal(sawMark, 4,
    'exactly four wire kinds carry a mark; the sweep found a different number. An out-of-range kind '
    + 'must be DROPPED by decodeMarks, not drawn as a blank.');
});

test('WP-2 (synthetic): markVariant is deterministic, in range, and actually varies', () => {
  const seen = new Set();
  for (let tx = 0; tx < 8; tx += 1) {
    for (let ty = 0; ty < 8; ty += 1) {
      const v = markVariant(tx, ty);
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 2);
      assert.equal(v, markVariant(tx, ty));
      seen.add(v);
    }
  }
  assert.equal(seen.size, 3, 'a single arrangement tiles a debris field into obvious wallpaper');
  assert.ok(markVariant(-1, -1) >= 0, 'a negative tile coordinate must not fall off the table');
  // …and all THREE really draw differently. Comparing only 0 vs 1 left `RUBBLE_SETS[2] :=
  // RUBBLE_SETS[0]` surviving the whole suite, i.e. the wallpaper property was unasserted for a
  // third of every debris field — the exact tiles the property exists to break up.
  assert.equal(new Set([0, 1, 2].map((v) => markCellSvg('debris', 0, 0, 32, 32, v))).size, 3,
    'two of the three rubble arrangements draw the same pile, so a debris field still tiles into '
    + 'visible wallpaper across a third of its tiles');
});

// ── THE WIRING SCAN, and why it is a source scan at all ──
// `roomzoom-view.js` is DOM glue with no DOM in this suite, so nothing above can prove the Room Zoom
// actually concatenates the layer: `markLayerSvg` could be perfect and never called, and every
// assertion here would stay green (exactly the hole `zone-overlay.js`'s header records WP-3 falling
// into). The scan therefore runs over COMMENT-STRIPPED source — `codeOnly` is IMPORTED from the
// shared `client/test/code-only.js` rather than re-derived, because a stripper that is not
// string-literal aware is blinded by a quoted `//` and silently passes everything after it. The two
// controls below test the shared stripper instead of trusting it.

/** ⚠️ THE LOCAL COPY OF `codeOnly` IS GONE FROM THIS FILE (2026-07-26). It carried a note saying
 *  "new consumers must IMPORT the shared module, not copy this", kept local "only to leave the WP-4
 *  test file's diff alone" — and a later package became a new consumer. Keeping one copy for the old
 *  scans and importing the shared one for the new is the exact shape CLAUDE.md trap 1 warns about: two
 *  strippers, one of which can silently rot. Both now come from `client/test/code-only.js`, whose
 *  behaviour is pinned in `surface-boundary.test.js` AND by the two controls immediately below,
 *  which are unchanged and now exercise the shared function.
 */

test('WP-2: the Room Zoom actually CONCATENATES the mark layer into its SVG body', () => {
  const src = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  // ⚠️ THE SCANNED SHAPE CHANGED WITH THE SOURCE. The old single expression
  // `body += markLayerSvg(roomMarkTiles(frame, _focus), _focus)` is now two statements — the marks
  // are decoded off the wire in `repaint()` into `_markTiles`, beside the zone tiles, and the layer
  // consumes that. BOTH halves are scanned: a derivation nobody consumes and a consumer of a value
  // nobody derives are two different ways to draw nothing.
  assert.match(src, /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/,
    'client/src/ui/roomzoom-view.js must derive its mark tiles from the decoded `marks` channel. '
    + 'Reading them back off `frame` is the defect the channel exists to remove: GlyphMapper passes '
    + '3/4/5 overwrite `cell[1]` for an item, a device and a standing crew member.');
  assert.match(src, /body\s*\+=\s*markLayerSvg\(\s*_markTiles/,
    'client/src/ui/roomzoom-view.js must concatenate markLayerSvg(_markTiles, …) into the layer '
    + 'body. A perfect builder nobody calls satisfies every other assertion in this file and draws '
    + 'nothing on screen — the exact failure zone-overlay.js was extracted to stop.');
  // ORDER: above the material layer (which paints an OPAQUE swatch over every built wall, so a strip
  // mark beneath it would be invisible) and above the zone layer whose tiles this one skips.
  const iMat = src.indexOf('materialLayerSvg(');
  const iZone = src.indexOf('zoneLayerSvg(');
  const iMark = src.indexOf('markLayerSvg(');
  const iPawn = src.indexOf('pawnSvg(roomCrew(');
  const iFurn = src.indexOf('furnitureSvg(roomCells(');
  assert.ok(iMat > 0 && iZone > 0 && iMark > iMat && iMark > iZone, 'the mark layer must draw last of the floor layers');
  assert.ok(iPawn > iMark, 'the mark layer must draw UNDER the pawns');
  // …and ABOVE the furniture, since the device-strip fix landed: a condemned DESK now carries fg 26,
  // and beneath its own opaque sprite the amber ✕ is invisible — the owner's exact reported symptom,
  // with the byte present and correct. Inert for debris/dig (glyph 37 is in NON_FURNITURE, so the
  // two layers never share a tile); the disjointness is MEASURED on the real capture further down.
  assert.ok(iFurn > 0, 'the furniture layer call is gone — this ordering assertion is vacuous');
  assert.ok(iMark > iFurn, 'the mark layer must draw OVER the furniture it condemns');
});

test('NEGATIVE CONTROL: the wiring scan does not fire on a commented-out call', () => {
  const prose = [
    '// body += markLayerSvg(_markTiles, _focus);  // reverted, see WP-6',
    '/* an older draft called _markTiles = roomMarkTiles(decodeMarks(m), r); here */',
    'const real = 1;',
  ].join('\n');
  assert.doesNotMatch(codeOnly(prose), /body\s*\+=\s*markLayerSvg\(\s*_markTiles/,
    'a COMMENTED-OUT call satisfied the wiring scan — the guard would then be green with the layer '
    + 'switched off, which is precisely the defect this repo has shipped four times in one day');
  assert.doesNotMatch(codeOnly(prose), /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/,
    'a COMMENTED-OUT derivation satisfied the other half of the wiring scan');
});

test('POSITIVE CONTROL: the wiring scan does fire on the real call, and codeOnly is quote-aware', () => {
  assert.match(codeOnly('  body += markLayerSvg(_markTiles, _focus);\n'),
    /body\s*\+=\s*markLayerSvg\(\s*_markTiles/, 'the scan missed a real call — it is vacuous');
  assert.match(codeOnly('  _markTiles = roomMarkTiles(decodeMarks(Hud.getMarks()), _focus);\n'),
    /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/, 'the scan missed a real derivation');
  // a quoted `//` must not swallow the rest of the file (the blinding failure mode)
  const src = 'const u = "http://x//y";\nbody += markLayerSvg(_markTiles, r);\n';
  assert.match(codeOnly(src), /body\s*\+=\s*markLayerSvg\(/,
    'a quoted "//" blinded the stripper, so every scan using it passes for the wrong reason');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-4 — DIG + STRIP on the Level-2 Room Zoom, DRIVEN through the real controller
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THESE ARE DRIVEN AND NOT SCANNED. The whole risk of this package is in the LOWERING: the Room
// Zoom does NOT use `paletteOrders` (that function is the console/canvas path, called only from
// `client/src/input/controls.js:172` and `:275`), so there are now TWO independent paths that must
// emit the same wire payload for the same verb. Nothing about that is visible to a source scan, and
// the two failure modes that matter — an order routed through `Cmd.build` (which reaches
// `BuildSystem`, a system that knows nothing about designations) and a sweep that escapes the room —
// are both behaviours, not tokens. So `roomzoom-view.js` is instantiated over `dom-lite` and the
// assertions read the payloads that come out of the injected `send`.
//
// PARITY IS PINNED BY IMPORT, NOT BY LITERAL. Every expectation below is compared against what
// `paletteOrders(verb, x, y)` ACTUALLY returns, imported from `controls.js` — so a drift on EITHER
// side reddens. A copied literal `{cmd:'dig',…}` could not do that, and the console's own lowering
// is the thing this package must not diverge from. One absolute wire-shape pin is kept alongside it
// (a `Cmd.dig` change moves BOTH paths together, so equality alone would stay green through it).
//
// THE DOM IS A STUB, and the limits are the same as `relations-view.test.js`'s: `dom-lite` does not
// parse markup, so the chrome nodes are registered by hand. ⚠️ ONE HALF OF THAT SENTENCE IS NOW
// FALSE AND IS QUOTED HERE RATHER THAN DELETED: it used to end *"and `querySelectorAll` returns
// nothing — which means `_el.toolBtns` is empty and the visual `.on` toggle is NOT proven here."*
// The palette-overflow package added a START-TAG SCANNER to `RzEl` (see its comment below), so
// `_el.toolBtns` now holds the fifteen buttons `buildChrome` really wrote and `paintPalette`'s body
// executes. What is STILL not proven here is anything about LAYOUT — whether those buttons are on
// the screen is a question only a layout engine can answer, and `client/tools/palette-shot.mjs` is
// where it is answered.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  // hud.js writes these unconditionally on a roster/status dispatch (see relations-view.test.js).
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];

/**
 * ⚠️ THE ELEMENT SCANNER — a harness upgrade, and it is the reason the paragraph above no longer
 * ends at *"`_el.toolBtns` is empty and the visual `.on` toggle is NOT proven here"*.
 *
 * `querySelectorAll` returning `[]` meant `paintPalette`'s whole body was UNREACHABLE in node: the
 * loop that lights the armed tool and (since the palette-overflow package) announces it with
 * `aria-pressed` ran zero times, so any mutation to it was invisible to this suite. That is
 * `CLAUDE.md` trap 1's cousin — not a guard satisfied by a comment, a guard that never executes the
 * line it names — and trap 4's corollary is the remedy: **if a harness cannot model the thing your
 * guard needs to see, fix the harness.**
 *
 * It is a TAG SCANNER, not an HTML parser, and the difference is deliberate. It lifts every
 * `<button …>`/`<span …>` START TAG out of an assigned `innerHTML` into a real element carrying that
 * tag's class list, `data-*` dataset and attributes — flat, ignoring nesting, ignoring text. That is
 * exactly enough for `_el.toolBtns` / `_el.placeLabel` / `_el.capName` and no more; anything it
 * cannot model (attribute selectors like `[data-rz="deck"]`) still resolves to `null`, which is what
 * it resolved to before, so the breadcrumb handles keep their existing null-guarded path.
 *
 * IT DOES NOT TOUCH `childNodes`. The scanned nodes live in a separate `_scanned` list, so
 * `textContent` — which every toast assertion in this file reads — keeps the exact behaviour it had
 * before this existed. A parser that populated `childNodes` would have quietly changed the meaning
 * of assertions written years apart from it.
 */
const TAG_RE = /<(button|span)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

/** dom-lite + the four extras roomzoom-view.js needs: innerHTML, querySelector(All), closest,
 *  getBoundingClientRect. Subclassed here so the shared helper keeps its narrow contract. */
class RzEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 };
    this._scanned = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = [];
    this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new RzEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;   // so a click on a scanned button bubbles the way the real one does
      this._scanned.push(el);
    }
  }
  /** Class selectors only, over the scanned start tags. Anything else → null/[] , as before. */
  querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    const cls = sel.slice(1);
    return this._scanned.filter((e) => e.classList.contains(cls));
  }
  getBoundingClientRect() { return this._rect; }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (n.dataset && n.dataset[key] !== undefined) return n;
      } else if (sel.startsWith('#')) {
        if (n._id === sel.slice(1)) return n;
      } else if (n.classList.contains(sel.replace(/^\./, ''))) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

/** A fresh document carrying every id the controller looks up. */
function makeRzDoc() {
  const d = new RzDoc();
  for (const id of RZ_IDS) { const e = new RzEl(d, 'div'); e._id = id; d.register(id, e); }
  return d;
}
/** A window stub that RECORDS its listeners — `mouseup` (a release that ends off-canvas still
 *  commits) and `keydown` are bound there, so a shared no-op stub would make half this section
 *  undrivable. Each mount gets its OWN bag: `initRoomZoom` adds listeners every call, and a second
 *  mount sharing one bag would double-fire every release and toggle every hotkey twice. */
function makeRzWindow(bag) {
  return { addEventListener(t, fn) { (bag[t] = bag[t] || []).push(fn); }, removeEventListener() {} };
}

const rzDoc = makeRzDoc();
globalThis.document = rzDoc;
const rzWinListeners = {};
globalThis.window = makeRzWindow(rzWinListeners);

// Resolved AFTER the globals above are in place — these modules touch `document` at init.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');
const { paletteOrders } = await import('../src/input/controls.js');

/** THE ROOM UNDER TEST is the fixture's own live wreck: deck-1 slot 6, anchor 'hold' (roomType 14),
 *  the room the capture's note calls "the LIVE WRECK". Its rect is read from the fixture, never
 *  hand-written, so a recapture that moves the room moves these tests with it. Derived BEFORE any
 *  mount because it is pure fixture geometry — the probe below needs it too. */
const HOLD = slotFocus('hold');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROBE FIRST, on a THROWAWAY document + window: what mask does a STOCKPILE sweep paint with when
// the player never touches a chip? WP-6 removed the injected getter — the palette owns `_stockFilter`
// and the chips are its only writer — so this is now the FRESH-MOUNT default rather than the
// un-injected one, and it is the leg that pins `let _stockFilter = defaultStockFilter()`. The
// mutation it hides is unchanged: default → 0, i.e. ACCEPT-NOTHING, a zone that silently refuses
// every item and looks precisely like one nothing has been hauled to yet. That exact hole survived a
// fully green suite on the Overview until WP-5's review found it.
//
// ⚠️ IT IS HALF OF A PAIR AND MUST NEVER BE READ ALONE (CLAUDE.md's "starts-in-the-asserted-state"
// trap). Deleting this whole package — chips, row, handler — leaves a palette that still paints
// ACCEPT-ALL, so this test passes just as well against no WP-6 at all. The leg that catches THAT is
// `the ACCEPTS chips CHANGE the mask the next sweep paints with`, below: it drives a chip and watches
// the emitted `Cmd.filter` move off the default.
//
// IT MUST BE ITS OWN DOCUMENT **AND** ITS OWN WINDOW. `initRoomZoom` binds mousedown/mousemove/click
// on the canvas, `mouseup` + capture-phase `keydown` on the window, and a delegated click on the
// root — every call, unconditionally. A second mount over the same nodes would double-commit every
// sweep and make every hotkey a no-op (arm twice = disarm). Nothing is dispatched to the probe's DOM
// after this block, and the real mount overwrites every module-level handle. The one residue is a
// second `Hud.onShipUpdate` subscription — the same closure body twice over the same module state,
// so a notification schedules one already-coalesced repaint. Idempotent, and worth naming.
const probeDoc = makeRzDoc();
const probeWinListeners = {};
globalThis.document = probeDoc;
globalThis.window = makeRzWindow(probeWinListeners);
const probeSent = [];
const probeApi = RoomZoom.initRoomZoom({ send: (o) => probeSent.push(o) });   // chips never touched
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
Hud.renderMarks(WRECK_MARKS_MSG);   // the mark layer is wire-fed now, not derived from the frame
probeApi.enter('hold');
probeDoc.getElementById('rz-layers')._rect = { left: 0, top: 0, width: HOLD.rw * U, height: HOLD.rh * U };
{
  const probeCanvas = probeDoc.getElementById('rz-canvas');
  const probeRoot = probeDoc.getElementById('roomzoom-view');
  const at = (tx, ty) => ({ clientX: (tx - HOLD.rx) * U + U / 2, clientY: (ty - HOLD.ry) * U + U / 2 });
  const btn = new RzEl(probeDoc, 'button');
  btn.dataset.rztool = 'stockpile';
  btn.setAttribute('data-rztool', 'stockpile');
  probeRoot.appendChild(btn);
  rzFire(btn, 'click', {});                                   // arm STOCKPILE the way a player does
  probeSent.length = 0;
  rzFire(probeCanvas, 'mousedown', { button: 0, ...at(24, 11) });
  rzFire(probeCanvas, 'mousemove', { button: 0, ...at(24, 11) });
  for (const fn of (probeWinListeners.mouseup || []).slice()) fn({ button: 0 });
}
/** What one un-injected STOCKPILE tile emitted (cursor chatter dropped). */
const PROBE_DEFAULT = probeSent.filter((o) => o.cmd !== 'cursor');

// ── the real harness ──
globalThis.document = rzDoc;
globalThis.window = makeRzWindow(rzWinListeners);
const rzSent = [];
// ⚠️ NO `getStockFilter` INJECTION ANY MORE (WP-6), and the note that stood here is quoted and
// negated: *"ONE INDIRECTION, and it is load-bearing rather than tidy … Routing through a swappable
// function lets one test install a getter whose value CHANGES on every call, which is the only way to
// make the per-tile mutation bite."* True, and it bought a mask NO PLAYER COULD SET: main.js wired
// that getter to `Hud.getStockFilter()`, whose only writer anywhere in the client is the `onclick` on
// the DEPRECATED console shell's chips. The palette owns the mask now and the chips on it are the
// only writer, so every test below drives the mask the way a player does — by clicking a chip — and
// what replaced the changing-getter trick is written out at that test.
const rzApi = RoomZoom.initRoomZoom({ send: (o) => rzSent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
// The SAME capture the pure assertions above run on — so the driven half sees the real wreck
// (`demolishTarget` and every SVG layer read the frame back out of the shared HUD cache, not out of
// a local). NO roster is dispatched: `renderRoster` builds the CONSOLE's CREW WATCH rows, which
// dom-lite cannot host, and the crew layer is not what this package changed.
Hud.renderFrame(wreck);
// …and the mark layer's own channel, which is NOT part of the frame. A rig that dispatched only the
// frame would draw no marks at all now, and every mark assertion below would pass vacuously if it
// were phrased as an absence.
Hud.renderMarks(WRECK_MARKS_MSG);

rzApi.enter('hold');                       // the Overview's own entry point, by anchorName
const rzLayers = rzDoc.getElementById('rz-layers');
const rzCanvas = rzDoc.getElementById('rz-canvas');
const rzRoot = rzDoc.getElementById('roomzoom-view');
const rzPalette = rzDoc.getElementById('rz-palette');
// One logical unit per CSS px (fit scale s = 1), so a tile's centre is trivially invertible.
rzLayers._rect = { left: 0, top: 0, width: HOLD.rw * U, height: HOLD.rh * U };
// `makeRzDoc` registers every chrome node by id and parents NONE of them, so a click on a real
// palette button would die at the palette instead of reaching the delegated handler on the root.
// Parenting it is what the shipped DOM already does (`#rz-palette` lives inside `.rz-palette-wrap`
// inside `#roomzoom-view`), and it is what lets the aria test below drive the SHIPPED button rather
// than a stand-in it built itself.
rzPalette.parentNode = rzRoot;

/** The client-space point at the centre of tile (tx,ty), under the rect above. */
const atTile = (tx, ty) => ({ clientX: (tx - HOLD.rx) * U + U / 2, clientY: (ty - HOLD.ry) * U + U / 2 });

function rzFire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}
/** `mouseup` is bound on WINDOW (a release that ends off-canvas still commits), so it is dispatched
 *  through the window stub rather than through the element tree. */
function rzMouseUp(button = 0) { for (const fn of (rzWinListeners.mouseup || []).slice()) fn({ button }); }
function rzKey(key) {
  const e = {
    key, target: undefined, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
  };
  for (const fn of (rzWinListeners.keydown || []).slice()) fn(e);
  return e;
}

/**
 * PER-TEST RESET, in a hook rather than inline at the end of each test.
 *
 * Every driven test below both arms and disarms, which is fine until one of them FAILS: the assert
 * throws, the trailing `rzArm` never runs, and the next test starts with a tool still armed and a
 * drag possibly still open. An independent reviewer hit exactly that — a preview failure cascaded
 * into the following test — which makes the failure COUNT in this section untrustworthy even though
 * each individual assertion is sound. One defect must produce one red test.
 *
 * The reset is AUTHORITATIVE rather than a mirror of what the tests think they armed: `exitRoom()`
 * clears `_armed`, `_drag` and `_focus` outright and `enterRoom()` re-resolves the room with
 * `_armed = null`, so it lands on a known state even when the controller is mid-gesture or when a
 * mutation has broken arming itself. `rzMouseUp()` first, so a drag left open by a failed test is
 * ended against the OLD room rather than the freshly re-entered one.
 */
afterEach(() => {
  if (!rzApi) return;                 // the driven section has not been reached yet
  rzMouseUp();
  rzApi.exit();
  rzApi.enter('hold');
  // The accept-mask is module state with NO setter — the chips are its only writer, which is the
  // whole point of the package — so the reset drives them, arming STOCKPILE first because the row is
  // hidden (and therefore unclickable) otherwise. `rzSetMask` reads the row back rather than
  // mirroring what it thinks it toggled, so a broken toggle shows up here as a hang-free failure in
  // the NEXT test rather than as a silently wrong starting mask.
  rzArm('stockpile');
  rzSetMask(ACCEPT_ALL);
  rzArm('stockpile');
  rzSent.length = 0;
});

/** Arm a tool the way a player does — a click on a palette button carrying `data-rztool`, dispatched
 *  through the surface root's real delegated handler. Clicking the armed tool again disarms it. */
const rzToolBtns = new Map();
function rzArm(tool) {
  let b = rzToolBtns.get(tool);
  if (!b) {
    b = new RzEl(rzDoc, 'button');
    b.dataset.rztool = tool;
    b.setAttribute('data-rztool', tool);
    rzRoot.appendChild(b);
    rzToolBtns.set(tool, b);
  }
  rzFire(b, 'click', {});
}

// ── WP-6: driving the ACCEPTS chips ────────────────────────────────────────────────────────────
// `dom-lite` parses no markup, so `_el.accepts`'s real chips (written as one `innerHTML` string) are
// not clickable nodes here — exactly as `_el.toolBtns` is empty and `rzArm` builds its own
// `data-rztool` node. The chips are resolved by the SAME delegated `closest('[data-rzaccept]')`
// handler the real ones go through, so what is driven is the shipped resolution path. That the row
// really EMITS those nodes is asserted separately, off the innerHTML string the builder wrote.

/** Click one ItemKind chip the way a player does, through the surface root's delegated handler. */
const rzAccChips = new Map();
function rzAccept(kind) {
  let b = rzAccChips.get(kind);
  if (!b) {
    b = new RzEl(rzDoc, 'button');
    b.dataset.rzaccept = String(kind);
    b.setAttribute('data-rzaccept', String(kind));
    rzRoot.appendChild(b);
    rzAccChips.set(kind, b);
  }
  rzFire(b, 'click', {});
}

/** The mask the ACCEPTS row is currently SHOWING, read back out of the markup it emitted.
 *  OBSERVATION, NOT A MIRROR: the test never tracks what it believes it toggled, so a toggle that
 *  flips the wrong bit cannot be hidden by a bookkeeping variable that flips the same wrong bit. */
function rzShownMask() {
  const html = rzDoc.getElementById('rz-accepts').innerHTML;
  let m = 0;
  for (const mt of html.matchAll(/data-rzaccept="(\d+)"[^>]*aria-pressed="(true|false)"/g)) {
    if (mt[2] === 'true') m |= 1 << Number(mt[1]);
  }
  return m;
}

/** Drive the chips until the row shows exactly `target`, and return what it then shows. STOCKPILE
 *  must be armed (the row is hidden otherwise) — which is how a player reaches them too. */
function rzSetMask(target) {
  for (const { kind } of STOCK_KINDS) {
    const want = ((target | 0) & (1 << kind)) !== 0;
    if (want !== ((rzShownMask() & (1 << kind)) !== 0)) rzAccept(kind);
  }
  return rzShownMask();
}

/** Press at `from`, drag to `to`, release. Returns everything `send` received, oldest first. */
function rzSweep(from, to) {
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(from.x, from.y) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(to.x, to.y) });
  rzMouseUp();
  return rzSent.slice();
}
/** Only the tool payloads — `Cmd.cursor` chatter from the drag is not the subject. */
const rzOrders = (sent) => sent.filter((o) => o.cmd !== 'cursor');
const xy = (o) => [o.x, o.y];

// The fixture's three ALREADY-DESIGNATED dig tiles (fg 15) — read out of the capture, not typed.
const FIX_DIG = roomMarkTiles(wreckMarks, { ...HOLD, deck: DECK1 }).filter((m) => m.mark === 'dig');

test('WP-4 fixture check: the room under test is the live wreck, with real designations in it', () => {
  assert.equal(HOLD.rw * HOLD.rh, 96, 'the hold should be the fixture\'s 12×8 slot');
  assert.equal(FIX_DIG.length, 3,
    'the fixture no longer carries exactly three fg-15 dig designations inside the hold; the sweep '
    + 'tests below are anchored on them, so re-derive their coordinates before adjusting anything');
  assert.deepEqual(FIX_DIG.map((m) => [m.tx, m.ty]), [[28, 16], [29, 16], [30, 16]]);
});

// The palette BAR itself, read out of the markup `buildChrome` actually wrote. Without this, every
// assertion below could be satisfied by a tool the player has no button for: the tests arm through a
// `data-rztool` node they construct themselves, so they would pass against an unrendered palette.
// (This reads the innerHTML string the builder wrote, not the scanned nodes — deliberately kept as
// a string assertion, because it is the MARKUP contract, and it predates the tag scanner.)
test('WP-4: the palette actually PAINTS a DIG and a STRIP button, labelled and armable', () => {
  const html = rzDoc.getElementById('rz-palette').innerHTML;
  assert.ok(html.length > 0, 'the palette painted nothing — this assertion would be vacuous');
  for (const [tool, label] of [['dig', '⛏ DIG'], ['strip', '⚒ STRIP'], ['wall', 'WALL']]) {
    assert.ok(html.includes('data-rztool="' + tool + '"'), `no palette button for '${tool}'`);
    assert.ok(html.includes('>' + label + '<'), `the '${tool}' button is missing its label '${label}'`);
  }
  // And the hint line names the two new hotkeys, since nothing else on the surface can.
  const hint = rzRoot.innerHTML;
  assert.match(hint, /DIG \[G\]/);
  assert.match(hint, /STRIP \[V\]/);
});

test('WP-4: DIG arms and disarms through the palette, and so does STRIP (one exclusive slot)', () => {
  rzArm('dig');
  assert.equal(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }).length, 1, 'DIG armed → a click designates');
  rzArm('dig');                                    // same button again → disarm
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), [], 'disarmed → nothing is sent');
  rzArm('strip');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'strip');
  rzArm('dig');                                    // a different tool REPLACES, never stacks
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig');
  rzArm('dig');
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), []);
});

// MUTATION: drop the `g`/`G` branch from onKey ⇒ the sweep after it sends nothing ⇒ RED.
test('WP-4: G arms DIG and V arms STRIP, the console\'s own two bindings (controls.js:262/267)', () => {
  const g = rzKey('G');
  assert.ok(g.defaultPrevented && g.propagationStopped, 'the Room Zoom must swallow its own hotkey');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig');
  rzKey('v');                                       // lowercase too — 'h' was silently dead once
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'strip');
  rzKey('V');                                       // toggles back off
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), []);
});

// MUTATIONS this one catches: `Cmd.build` in the order branch; `on: false`; a wrong verb; a
// `paletteOrders` drift on the controls.js side; `roomDragMode → 'single'` OR `→ 'perimeter'`.
//
// ⚠️ THE DRAG IS 3×3 AND THAT IS LOAD-BEARING. An earlier draft swept 3×2, where every tile is on
// the border — so `fill` and `perimeter` COINCIDE and this test could not tell them apart, while its
// own message claimed it was pinning the fill. Reverting `roomDragMode` to perimeter left it green.
// 3×3 is the smallest rectangle with an interior: fill = 9, perimeter = 8.
test('WP-4: a DIG sweep emits one Cmd.dig per tile — byte-identical to paletteOrders\' payload', () => {
  rzArm('dig');
  // Drag across the fixture's own three designated tiles plus the two rows above them.
  const sent = rzOrders(rzSweep({ x: 28, y: 14 }, { x: 30, y: 16 }));
  assert.deepEqual(sent.map(xy), [
    [28, 14], [29, 14], [30, 14],
    [28, 15], [29, 15], [30, 15],
    [28, 16], [29, 16], [30, 16]],
    'a DIG drag must sweep the FILLED rectangle in row-major order (roomDragMode → fill). The '
    + 'centre tile (29,15) is the one a `perimeter` sweep would drop, and it is why this drag is 3×3.');
  assert.ok(sent.some((o) => o.x === 29 && o.y === 15),
    'the INTERIOR tile is missing — the sweep traced an outline, not a region');
  // (a) PARITY BY IMPORT — the console's lowering is the contract, and it is asked, not restated.
  assert.deepEqual(sent, sent.map((o) => paletteOrders('dig', o.x, o.y)[0]),
    'the Room Zoom emitted a different payload than paletteOrders() does for the same verb + tile. '
    + 'Two independent lowering paths now exist for DIG; they must not drift.');
  // (b) THE ABSOLUTE WIRE SHAPE — a change to Cmd.dig itself moves BOTH paths together, so (a) would
  // stay green through it. This is the pin that catches that, and it is the host's own contract
  // (hosts/web/GameSession.cs WebCommand.Parse; client/src/wire/session.js:72).
  assert.deepEqual(sent[0], { cmd: 'dig', x: 28, y: 14, on: 1 });
  rzArm('dig');
});

// The SAME 3×3 drag the WALL control below uses, deliberately: one gesture, two classes, and the
// counts differ — 9 for an ORDER (fill) against 8 for WALL (perimeter). That contrast is the
// cheapest available proof that `roomDragMode` really does branch, in the running controller.
test('WP-4: a STRIP sweep does the same for the deconstruct verb', () => {
  rzArm('strip');
  const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.deepEqual(sent.map(xy), [
    [24, 11], [25, 11], [26, 11],
    [24, 12], [25, 12], [26, 12],
    [24, 13], [25, 13], [26, 13]]);
  assert.ok(sent.some((o) => o.x === 25 && o.y === 12), 'the interior tile of a STRIP region is missing');
  assert.deepEqual(sent, sent.map((o) => paletteOrders('strip', o.x, o.y)[0]));
  assert.deepEqual(sent[0], { cmd: 'strip', x: 24, y: 11, on: 1 });
  rzArm('strip');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// STOCKPILE ON THE ROOM ZOOM PALETTE — the verb that came down from the Overview
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY IT MOVED, in one line, because it is the only justification for the two tests below being
// different in shape from DIG's: `JobWork.IsFreeStockpileTile` is "Stockpile + Walkable + empty",
// ONE STACK PER TILE, so a zone's AREA is its CAPACITY. The extent is not incidental to the verb, it
// is the verb — and the Overview has no drag gesture at all (zero mousedown/mousemove/pointerdown in
// `overview-view.js`), so painting a 5×8 zone there was forty clicks.
//
// THE DRAG IS 3×3 AND THAT IS LOAD-BEARING, exactly as it is for DIG (WP-4's send-back): a 3×2 sweep
// has every tile on the border, so `fill` and `perimeter` COINCIDE and a test claiming to pin a fill
// cannot see it. 3×3 is the smallest rectangle with an interior — fill = 9, perimeter = 8 — and the
// interior tile is asserted by name.
//
// MUTATIONS this one catches: `roomDragMode → 'single'` or `→ 'perimeter'` for stockpile; the
// `Cmd.filter` half dropped from `orderPayloads`; the pair emitted in the WRONG ORDER; `Cmd.build`
// in the order branch; a mask read per-tile instead of once per sweep.
test('a STOCKPILE sweep zones the FILLED rectangle, and emits BOTH commands per tile', () => {
  rzArm('stockpile');
  const FOOD = 1 << 3;
  assert.equal(rzSetMask(FOOD), FOOD,               // FOOD only — NOT the accept-all default
    'the chips did not settle on FOOD-only; every mask assertion below would then be checking the ' +
    'wrong number against itself');
  const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.equal(sent.length, 18, 'a 3×3 stockpile sweep is NINE tiles × TWO commands. Anything else ' +
    'is a dropped filter, a perimeter sweep, or a single-tile click.');
  const zones = sent.filter((o) => o.cmd === 'stockpile');
  const filters = sent.filter((o) => o.cmd === 'filter');
  assert.deepEqual(zones.map(xy), [
    [24, 11], [25, 11], [26, 11],
    [24, 12], [25, 12], [26, 12],
    [24, 13], [25, 13], [26, 13]],
    'the zone must sweep the FILLED rectangle in row-major order (roomDragMode → fill). The centre ' +
    'tile (25,12) is the one a `perimeter` sweep drops — and dropping it means the zone the player ' +
    'painted holds 8 stacks instead of 9.');
  assert.ok(zones.some((o) => o.x === 25 && o.y === 12),
    'the INTERIOR tile is missing — the sweep traced an outline, so the zone is hollow');
  assert.deepEqual(filters.map(xy), zones.map(xy), 'a filter is missing (or misplaced) for some tile');
  // ORDER, PER TILE, not merely in aggregate: `DesignateStockpileCommand` OFF *clears* the filter, so
  // an interleaving that put `filter` first would break the day an OFF path is added.
  for (let i = 0; i < sent.length; i += 2) {
    assert.equal(sent[i].cmd, 'stockpile', `payload ${i} is not the zone — the pair is out of order`);
    assert.equal(sent[i + 1].cmd, 'filter', `payload ${i + 1} is not the filter`);
    assert.deepEqual([sent[i].x, sent[i].y], [sent[i + 1].x, sent[i + 1].y],
      'a zone and the filter beside it name different tiles');
  }
  // (a) PARITY BY IMPORT — the console's lowering is the contract, and it is asked, not restated.
  assert.deepEqual(sent, zones.flatMap((o) => paletteOrders('stockpile', o.x, o.y, FOOD)),
    'the Room Zoom emitted a different payload than paletteOrders() does for the same verb, tile '
    + 'and mask. Three independent lowering paths exist for these verbs; they must not drift.');
  // (b) THE ABSOLUTE WIRE SHAPE — a change to Cmd.stockpile/Cmd.filter moves BOTH paths together, so
  // (a) would stay green through it.
  assert.deepEqual(sent.slice(0, 2), [
    { cmd: 'stockpile', x: 24, y: 11, on: 1 },
    { cmd: 'filter', x: 24, y: 11, mask: 1 << 3 },
  ]);
  // The mask is genuinely READ, not defaulted: a non-default mask must survive to every tile.
  for (const f of filters) assert.notEqual(f.mask, ACCEPT_ALL, `tile (${f.x},${f.y}) lost the mask`);
  assert.equal(new Set(filters.map((f) => f.mask)).size, 1,
    'one sweep painted two different masks');
  rzArm('stockpile');
});

// ⚠️ THE MUTATION THIS TEST USED TO NAME IS GONE, AND SO IS THE HAZARD IT NAMED. Its predecessor
// installed a getter whose value CHANGED on every call, because a per-tile read and a per-sweep read
// of a CONSTANT getter are indistinguishable. WP-6 removed the getter: the mask is module state whose
// only writer is a DOM click handler, and `onCanvasUp`'s commit loop is synchronous, so no value can
// change between tile 1 and tile 9 and a per-tile read could not be observed to differ. That is
// stated in `roomzoom-view.js` beside the read, NOT tested, because there is no longer a mechanism by
// which it could fail. Pretending otherwise would be a test whose named mutation cannot bite.
//
// WHAT REPLACES IT IS A DIFFERENT AND STILL-REACHABLE PROPERTY: the mask is read at COMMIT, not at
// PRESS. A player who starts a drag, changes their mind about FOOD and releases gets the rectangle
// the chips are showing when they let go. MUTATION (applied, RED): stash the mask on `_drag` in
// `onCanvasDown` and read `drag.mask` in `onCanvasUp` — the plausible refactor — and all nine tiles
// come out wearing the pre-toggle filter.
test('the mask is read at COMMIT, not at press — a chip flipped mid-drag lands on the whole sweep', () => {
  rzArm('stockpile');
  const FOOD = 1 << 3;
  assert.equal(rzSetMask(FOOD), FOOD);
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(24, 11) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(26, 13) });
  // …mid-drag, the player also wants PARTS in this zone.
  rzAccept(5);
  const WANT = FOOD | (1 << 5);
  assert.equal(rzShownMask(), WANT, 'the chip click did not reach the row — the rest is vacuous');
  rzMouseUp();

  const filters = rzOrders(rzSent).filter((o) => o.cmd === 'filter');
  assert.equal(filters.length, 9, 'the sweep did not commit nine filters — this test would be vacuous');
  assert.equal(new Set(filters.map((f) => f.mask)).size, 1,
    'one dragged rectangle came out wearing several different filters');
  assert.equal(filters[0].mask, WANT,
    `the sweep painted ${filters[0].mask}, not ${WANT}. The accept-mask is being captured when the ` +
    'drag STARTS rather than when it is committed, so the rectangle wears a filter the chips stopped ' +
    'showing before the player released.');
  assert.notEqual(WANT, FOOD);            // non-vacuity: the two masks really differ
  assert.notEqual(WANT, ACCEPT_ALL);      // …and neither is the default
  rzArm('stockpile');
});

// MUTATION: `let _getStockFilter = () => 0;` (ACCEPT-NOTHING) ⇒ RED here and NOWHERE ELSE — that is
// the whole reason the probe mount exists, and the identical hole survived a green suite on the
// Overview until WP-5's review found it. Also caught: dropping the `Number.isFinite` fallback (the
// dangerous version of which is returning `[Cmd.stockpile(…)]` alone — silence, which lets a tile
// keep an earlier restrictive filter the player has just repainted as accept-all).
test('an UN-INJECTED palette zones ACCEPT-ALL — never silence, never accept-nothing', () => {
  // Captured at module scope from a throwaway mount with no `getStockFilter` (see the probe above).
  assert.deepEqual(PROBE_DEFAULT, paletteOrders('stockpile', 24, 11, defaultStockFilter()),
    'with nobody injecting a mask the Room Zoom no longer falls back to the SHARED ' +
    '`defaultStockFilter()`. Accept-nothing is the dangerous direction — a zone that silently ' +
    'refuses every item looks exactly like one nothing has been hauled to yet.');
  assert.equal(PROBE_DEFAULT.length, 2, 'the un-injected default sent no filter at all');
  assert.equal(PROBE_DEFAULT[1].mask, ACCEPT_ALL);
  assert.equal(defaultStockFilter(), ACCEPT_ALL);          // …and the shared default IS accept-all
  // Non-vacuity: the probe must have exercised the real lowering, not an empty array.
  assert.equal(PROBE_DEFAULT[0].cmd, 'stockpile');
  assert.deepEqual([PROBE_DEFAULT[0].x, PROBE_DEFAULT[0].y], [24, 11]);
});

// A JUNK CHIP CANNOT POISON THE MASK. The predecessor of this test fed garbage through the injected
// getter (`undefined`, `NaN`, `'nonsense'`) to prove `orderPayloads`' `Number.isFinite` fallback. With
// the getter gone, `_stockFilter` can only ever be what `toggleStockKind` returned, so that fallback
// is now UNREACHABLE FROM THE UI — kept as defence-in-depth (the wire contract still says a stockpile
// paint must assert a filter and never fall silent), and honestly no longer driven from here.
//
// The reachable hazard moved to the chip's own attribute, and it BIT THIS PACKAGE'S FIRST DRAFT.
// `onAcceptChip` parsed with `parseInt(raw, 10)`; `parseInt('nonsense', 10)` is `NaN`, `NaN | 0` is
// `0`, and `0` is a perfectly valid ItemKind — so a chip with a missing, blanked or corrupted
// attribute silently toggled REGOLITH on every click, a filter change the player never asked for and
// could not see the cause of. MUTATION: restore `parseInt` ⇒ RED on the first two rows below.
test('a chip with a junk kind attribute changes nothing — NaN must not read as REGOLITH', () => {
  rzArm('stockpile');
  // '9' is the first index PAST the last ItemKind: the wave merge made 7 (Seals, E0-6) and 8 (Ice,
  // E0-7) both real, so each in turn moved out of this list and into the real-kind case below.
  for (const junk of ['nonsense', '', '-1', '9', '32', '3.5']) {
    const before = rzShownMask();
    const b = new RzEl(rzDoc, 'button');
    b.dataset.rzaccept = junk;
    b.setAttribute('data-rzaccept', junk);
    rzRoot.appendChild(b);
    rzFire(b, 'click', {});
    b.remove();
    assert.equal(rzShownMask(), before,
      `a chip carrying data-rzaccept="${junk}" moved the mask from ${before} to ${rzShownMask()}`);
  }
  // Non-vacuity: the same machinery DOES move the mask for a real kind, so the six no-ops above are
  // not merely a handler that never runs.
  rzAccept(3);
  assert.notEqual(rzShownMask(), ACCEPT_ALL, 'a REAL chip click did not move the mask either');
  rzArm('stockpile');
});

// Silence is still the failure that matters — a zone repainted as accept-all that sends no filter
// keeps its old restriction — so the PAIR is pinned directly, at both ends of the mask range.
test('every zoned tile asserts a filter, accept-all and accept-nothing alike — never silence', () => {
  rzArm('stockpile');
  for (const target of [ACCEPT_ALL, 0, 1 << 6]) {
    assert.equal(rzSetMask(target), target, `the chips could not be driven to ${target}`);
    const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }));
    assert.equal(sent.length, 2, `mask=${target} sent ${sent.length} commands, not the pair — a ` +
      'stockpile paint that says nothing about its filter leaves the tile wearing the last one');
    assert.equal(sent[1].cmd, 'filter');
    assert.equal(sent[1].mask, target, `mask=${target} painted ${sent[1].mask} instead`);
  }
  rzArm('stockpile');
});

// The palette BAR itself, read out of the markup `buildChrome` actually wrote — the same reasoning as
// WP-4's palette test: every test above arms through a `data-rztool` node it constructs itself, so
// they would all pass against a palette the player has no STOCKPILE button on.
test('the palette PAINTS a STOCKPILE button, labelled, and the hint names its hotkey', () => {
  const html = rzDoc.getElementById('rz-palette').innerHTML;
  assert.ok(html.length > 0, 'the palette painted nothing — this assertion would be vacuous');
  assert.ok(html.includes('data-rztool="stockpile"'), 'no palette button for stockpile');
  assert.ok(html.includes('>' + TOOL_LABEL.stockpile + '<'),
    `the stockpile button is missing its label '${TOOL_LABEL.stockpile}'`);
  assert.match(rzRoot.innerHTML, /STOCKPILE \[Z\]/,
    'the palette hint does not name the Z hotkey — and nothing else on this surface can');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PALETTE-OVERFLOW PACKAGE — the armed tool, said in words.
//
// The package's subject is a LAYOUT defect (three tools clipped off the right edge below ~1250px,
// with the scrollbar deliberately hidden), and no assertion in node can see layout — that is what
// `client/tools/palette-shot.mjs` is for, and this file must not pretend otherwise. What IS testable
// here, and belongs to the same complaint from a different cause, is that the palette used to
// announce its armed tool with a COLOUR AND NOTHING ELSE: fifteen buttons, no `aria-pressed`, so a
// screen reader could read every label and not one word about which one is holding the cursor. The
// ACCEPTS chips three pixels above them have carried `aria-pressed` since WP-6 (§4j).
//
// These are driven through the SHIPPED buttons — `_el.toolBtns`, the nodes `buildChrome` wrote —
// and through the SHIPPED delegated click handler, not through a stand-in with the right dataset.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The scanned palette button for `tool`, or undefined. */
const rzToolBtn = (tool) => rzPalette.querySelectorAll('.rz-tool').find((b) => b.dataset.rztool === tool);
/** Every tool button's `aria-pressed`, keyed by tool — `null` where the attribute is absent. */
const rzPressed = () => Object.fromEntries(
  rzPalette.querySelectorAll('.rz-tool').map((b) => [b.dataset.rztool, b.getAttribute('aria-pressed')]));

// MUTATION: emit `type="submit"` (or drop the attribute) ⇒ RED on the type leg.
// MUTATION: drop `aria-pressed="false"` from the `buildChrome` markup ⇒ RED on the MARKUP leg.
//
// ⚠️ THE MARKUP LEG WAS ADDED BECAUSE THE NODE-VALUE LEG COULD NOT SEE THAT MUTATION — found by
// physically applying it and watching the suite stay green, not by reading the test. Dropping the
// attribute from the builder is invisible to a reader of the live nodes, because `paintPalette` runs
// on entry and writes `'false'` onto all fifteen before any assertion gets to look. The two legs are
// therefore about two different things and BOTH are needed: `html` is the string `buildChrome`
// wrote (this stub never re-serialises it from attributes, so it stays the BUILDER's output), and
// `rzPressed()` is what the PAINTER left on the nodes.
test('every palette tool is a real <button type="button"> that starts UNPRESSED', () => {
  const btns = rzPalette.querySelectorAll('.rz-tool');
  assert.equal(btns.length, ROOM_TOOLS.length,
    `the tag scanner found ${btns.length} tool buttons, not ${ROOM_TOOLS.length} — every assertion ` +
    'below would be vacuous, so this is checked first');
  const html = rzPalette.innerHTML;
  assert.equal((html.match(/<button type="button" class="rz-tool/g) || []).length, ROOM_TOOLS.length,
    'a palette tool is not a `<button type="button">`. Inside a form the default type is `submit`, ' +
    'and the ACCEPTS chips beside these already spell it out — one palette, one button vocabulary');
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, ROOM_TOOLS.length,
    'the palette MARKUP no longer declares `aria-pressed="false"` on every tool. The painter would ' +
    'still write it on entry, so nothing on screen changes — but a toggle button that is born ' +
    'without the attribute is a plain button until the first repaint, and the attribute is the ' +
    'builder\'s statement about what kind of control this is.');
  for (const [tool, v] of Object.entries(rzPressed()))
    assert.equal(v, 'false', `'${tool}' does not start at aria-pressed="false" (it reads ${v})`);
});

// MUTATION: delete the `setAttr(b, 'aria-pressed', …)` line from `paintPalette` ⇒ RED (nothing moves
//           off 'false' when a tool is armed).
// MUTATION: write `'true'` unconditionally ⇒ RED (fifteen pressed buttons, not one).
// MUTATION: write `on ? 'true' : null` — the realistic "just remove it when off" mistake ⇒ RED on
//           the disarm leg, which is why the disarm leg asserts 'false' rather than "not true".
test('arming a tool through its own button moves aria-pressed, and only ever onto ONE button', () => {
  const dig = rzToolBtn('dig');
  assert.ok(dig, 'no scanned DIG button — the rest of this test would be vacuous');

  rzFire(dig, 'click', {});                       // the real node, the real delegated handler
  const armed = rzPressed();
  assert.equal(armed.dig, 'true', 'DIG was clicked and does not say it is pressed');
  assert.equal(Object.values(armed).filter((v) => v === 'true').length, 1,
    'more than one tool claims aria-pressed="true" — the palette has ONE exclusive slot');
  // …and the attribute is not decoration: the same click really armed the verb.
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig',
    'the button that says it is pressed did not arm DIG — the aria state is lying');

  rzFire(rzToolBtn('strip'), 'click', {});        // a DIFFERENT tool replaces, never stacks
  const moved = rzPressed();
  assert.equal(moved.strip, 'true');
  assert.equal(moved.dig, 'false', 'the previously armed tool still claims to be pressed');
  assert.equal(Object.values(moved).filter((v) => v === 'true').length, 1);

  rzFire(rzToolBtn('strip'), 'click', {});        // same button again → disarm
  const off = rzPressed();
  assert.equal(off.strip, 'false', 'a disarmed tool must read "false", not lose the attribute — an ' +
    'absent aria-pressed turns a toggle back into a plain button');
  assert.equal(Object.values(off).filter((v) => v === 'true').length, 0);
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), [],
    'disarmed by its own button, yet a click still designated');
});

// D2 — THE SHARED HARNESS CAPABILITY ITSELF, and it is not navel-gazing. `removeAttribute` exists in
// `dom-lite.js` for exactly one reason: so that `if (on) setAttribute(…) else removeAttribute(…)` —
// the realistic form of the aria-pressed mistake — can be APPLIED as a mutation instead of dying on
// a `TypeError` and reddening the wrong thing. Replacing it with a no-op left the whole suite green,
// which is precisely how a shared stub silently stops working and turns the NEXT reviewer's mutation
// into a false green: the failure mode the method was added to prevent, reproduced by its absence of
// coverage. One assertion, in the file that uses the stub hardest.
//
// MUTATION: make `dom-lite`'s `removeAttribute` a no-op ⇒ RED.
test('the shared dom-lite stub can really REMOVE an attribute — the mutation depends on it', () => {
  const el = new RzEl(rzDoc, 'button');
  el.setAttribute('aria-pressed', 'true');
  assert.equal(el.getAttribute('aria-pressed'), 'true', 'setAttribute did not take — vacuous below');
  el.removeAttribute('aria-pressed');
  assert.equal(el.getAttribute('aria-pressed'), null,
    'dom-lite.removeAttribute did not remove the attribute. Every "the tool loses its aria-pressed" ' +
    'mutation now passes silently: the stub keeps reporting the old value, so the harness reports ' +
    'GREEN for a change that would strip the armed state in a real browser.');
  el.removeAttribute('never-set');   // total: removing an absent attribute is not an error
  assert.equal(el.getAttribute('never-set'), null);
});

// ⚠️ THE `<span>` HALF OF THE TAG SCANNER, added in review because NOTHING COVERED IT: narrowing
// `TAG_RE` to `button` alone reddened not one test, even though four chrome handles resolve through
// it and all four are written by shipping code on every repaint. That is the "cannot bite" shape
// pointed at the harness instead of at the subject — the scanner would have been free to rot back
// into the `querySelector() { return null }` stub it replaced, and the driven aria tests above would
// have gone on passing while `paintCaption`/`paintBreadcrumb`/`paintPalette` wrote into nulls.
//
// It is deliberately phrased against the TEXT THE PAINTERS WROTE rather than against the handles
// themselves: `setText` is null-guarded, so a null handle is silent, and the observable difference
// between "resolved and written" and "never resolved" is exactly this text.
//
// MUTATION: narrow `TAG_RE` to `/<(button)\b([^>]*)>/g` ⇒ RED (all four read '').
// MUTATION: drop the `.rz-place-label` span from `buildChrome`'s palette markup ⇒ RED.
// MUTATION: stop passing `class` through to `className` in the scanner ⇒ RED (nothing resolves).
test('the chrome SPANS resolve and the painters write through them — caption, crumb, palette label', () => {
  // Read out of the fixture through the SAME lookup the controller uses, never typed here — `HOLD`
  // is the test's own trimmed rect and deliberately carries no name.
  const name = roomTileRect(fixView, 'hold').displayName;
  assert.ok(name, 'the fixture room has no display name — every assertion below would be vacuous');
  const label = rzPalette.querySelector('.rz-place-label');
  assert.ok(label, 'the palette has no `.rz-place-label` handle');
  assert.equal(label.textContent, 'BUILD ▸ ' + name,
    'the palette\'s room label is not what `paintPalette` writes — either the span did not resolve ' +
    '(so `setText` no-opped on null) or the wording moved');

  const cap = rzDoc.getElementById('rz-caption');
  assert.equal(cap.querySelector('.rz-cap-name').textContent, name,
    'the caption\'s room name did not arrive — `_el.capName` resolved to null');
  assert.match(cap.querySelector('.rz-placed').textContent, /^\d+ PLACED$/,
    'the caption\'s placed-count did not arrive — `_el.capPlaced` resolved to null');

  const bc = rzDoc.getElementById('rz-breadcrumb');
  assert.equal(bc.querySelector('.rz-crumb-leaf').textContent, name,
    'the breadcrumb leaf did not arrive — `_el.crumbLeaf` resolved to null');
});

// The material swatches get `type="button"` for the same reason the tool buttons do — one palette,
// one button vocabulary — and DELIBERATELY NOT `aria-pressed`: `activeMaterial` guarantees exactly
// one is lit, which is a radio group (`role="radio"`/`aria-checked` + roving focus), not six
// independent toggles. Asserting the ABSENCE as well as the presence is what stops a later package
// reaching for the nearest attribute instead of the right one.
//
// MUTATION: emit the chips without `type="button"` ⇒ RED.
// MUTATION: add `aria-pressed` to a material chip ⇒ RED on the second leg.
test('the material swatches are typed buttons, and are NOT dressed as independent toggles', () => {
  rzArm('wall');                                  // the strip is populated on arm, not before
  const html = rzDoc.getElementById('rz-matstrip').innerHTML;
  const chips = (html.match(/class="rz-mat-chip/g) || []).length;
  assert.ok(chips >= 2, `the material strip painted ${chips} chips — this assertion would be vacuous`);
  assert.equal((html.match(/<button type="button" class="rz-mat-chip/g) || []).length, chips,
    'a material swatch is not a `<button type="button">` — inside a form its default type is ' +
    '`submit`, and the tool buttons and ACCEPTS chips on this same palette both spell it out');
  assert.doesNotMatch(html, /aria-pressed/,
    'a material swatch claims `aria-pressed`. Exactly one swatch is ever lit (`activeMaterial`), ' +
    'so these are a RADIO GROUP: the honest spelling is role="radio" + aria-checked inside a ' +
    'radiogroup with roving tab focus, which is a keyboard-interaction change and not an ' +
    'attribute. Announcing six independent toggles where the player has one choice is worse than ' +
    'announcing nothing.');
  rzArm('wall');                                  // disarm — afterEach normalises, but not silently
});

// MUTATION: drop the `z`/`Z` branch from onKey ⇒ the sweep after it sends nothing ⇒ RED.
test('Z arms STOCKPILE, the console\'s own binding, and swallows the key', () => {
  const z = rzKey('Z');
  assert.ok(z.defaultPrevented && z.propagationStopped, 'the Room Zoom must swallow its own hotkey');
  assert.equal(rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }))[0].cmd, 'stockpile');
  rzKey('z');                                       // lowercase too — 'h' was silently dead once
  assert.deepEqual(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }), [], 'the second Z did not disarm');
  // …and it is the ONE exclusive slot, shared with the other two order hotkeys.
  rzKey('z');
  rzKey('G');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig',
    'G did not replace the armed STOCKPILE — the slot is not exclusive');
  rzKey('G');
});

// THE SINGLE WORST THING THIS PACKAGE COULD DO (charter's "wrong if"): an order that reaches
// BuildSystem. MUTATION: `_send(Cmd.build(pc.kind, …))` for the order branch ⇒ RED here, and the
// WALL half below is what stops the assertion from being satisfiable by sending nothing at all.
test('WP-4: an ORDER never routes through Cmd.build — and WALL still does', () => {
  rzArm('dig');
  const dig = rzOrders(rzSweep({ x: 28, y: 14 }, { x: 30, y: 16 }));
  assert.ok(dig.length > 0, 'the order sweep sent nothing — this assertion would pass vacuously');
  assert.deepEqual(dig.filter((o) => o.cmd === 'build'), [],
    'a DIG order was lowered to `build`. Cmd.build reaches BuildSystem, which knows nothing about '
    + 'designations, so the order would be silently swallowed (client/src/input/controls.js:52-58).');
  assert.deepEqual([...new Set(dig.map((o) => o.cmd))], ['dig']);
  rzArm('dig');

  rzArm('strip');
  const strip = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.deepEqual([...new Set(strip.map((o) => o.cmd))], ['strip']);
  rzArm('strip');

  // CONTROL: the structural branch is untouched — WALL still emits Cmd.build carrying its material,
  // and it still sweeps the PERIMETER. Without this half, deleting the whole commit path would pass.
  rzArm('wall');
  const wall = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));   // THE IDENTICAL 3×3 DRAG
  assert.deepEqual([...new Set(wall.map((o) => o.cmd))], ['build']);
  assert.deepEqual(wall[0], { cmd: 'build', kind: 'wall', x: 24, y: 11, material: 0 });
  assert.equal(wall.length, 8, 'a 3×3 wall drag is the 8-tile perimeter, not the 9-tile fill');
  rzArm('wall');

  // THE CONTRAST, stated once: one and the same gesture over one and the same tiles, and the two
  // classes commit different SETS. This is what proves `roomDragMode` branches in the live
  // controller rather than only in its unit test.
  assert.equal(strip.length, 9);
  assert.ok(strip.length > wall.length,
    'an ORDER sweep must cover the region a WALL sweep only outlines — if these are equal, every '
    + 'assertion about `fill` above is being satisfied by a `perimeter` sweep');
  assert.ok(!wall.some((o) => o.x === 25 && o.y === 12), 'the wall perimeter must leave its interior open');
});

// THE WP-2 LESSON, APPLIED TO THIS PACKAGE: a sweep that commits correctly but shows the player
// nothing while they drag is a defect the wire assertions above cannot see. So this reads the SVG
// `previewSvg` ACTUALLY emitted mid-drag, and pins the emitted numbers rather than recomputing the
// transform in the test. An order tool carries no material, so the preview is the bare amber dashed
// ring — `materialItemId('dig', …)` is '' — which is exactly right for a designation.
// MUTATION: `previewSvg` returning '' for an order tool ⇒ RED, and no wire assertion would notice.
test('WP-4: an order sweep PREVIEWS, in room-local units, while the button is still down', async () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(28, 15) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });
  await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
  const svg = rzLayers.innerHTML;
  assert.match(svg, /class="rz-preview"/, 'nothing was drawn for a sweep in progress');
  const preview = svg.slice(svg.indexOf('class="rz-preview"'));
  const rects = [...preview.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)"/g)];
  assert.equal(rects.length, 6, 'one preview cell per swept tile (the 3×2 fill)');
  // Room-local: tile (28,15) in a room anchored at (22,10) sits at ((28-22)*U + .5, (15-10)*U + .5).
  assert.deepEqual(rects[0].slice(1, 4), ['192.5', '160.5', String(U - 1)]);
  assert.deepEqual(rects[5].slice(1, 3), ['256.5', '192.5']);     // the far corner, tile (30,16)
  assert.match(preview, /3×2 · 6 TILES/, 'the run caption must count the tiles the sweep will order');
  rzMouseUp();
  rzArm('dig');
});

// ⚠️ READ THIS BEFORE TRUSTING THE MUTATION THIS TEST USED TO NAME. An earlier version of this
// comment claimed that "replacing `isSweepTool` with `isStructuralTool` at the onCanvasClick bail
// ⇒ the trailing click double-fires ⇒ RED". It was applied exactly as written by an independent
// reviewer and the whole suite stayed GREEN. **That named mutation cannot bite, and the claim is
// withdrawn.** The mechanism, verified: past the bail, `onCanvasClick`'s tail is an if/else-if chain
// over `pc.cls` that handles ONLY `functional`, `cosmetic` and `demolish` (roomzoom-view.js:657-667).
// There is no `order` branch — and no `structural` branch either. With DIG armed, `pc.cls === 'order'`
// falls off the end of the chain and sends nothing, so THE BAIL CANNOT PREVENT A DOUBLE-FIRE BECAUSE
// THERE IS NO SECOND FIRE TO PREVENT. The bail is a DEFENSIVE SECOND guard; the first and effective
// guard is the absent branch. Both surfaces of that were confirmed against the real host: a drag
// emitted exactly the swept set and nothing extra.
//
// So what this test actually pins is narrower and still worth having: A RELEASE COMMITS THE SWEPT SET
// EXACTLY ONCE, trailing click included. The mutation that DOES bite it takes TWO edits, because it
// takes two to create the hazard — add an `order` branch to `onCanvasClick`'s chain AND drop the
// bail. Applied together: 18 payloads instead of 9, RED. That pair is in the package's mutation log.
test('WP-4: a release commits the swept set exactly once, trailing click included', () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(28, 14) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });
  rzMouseUp();
  rzFire(rzCanvas, 'click', { button: 0, ...atTile(30, 16) });  // the browser's trailing click
  assert.equal(rzOrders(rzSent).length, 9, 'the release committed 9 tiles; the trailing click added more');
  rzArm('dig');
});

// The room is the whole canvas at Level 2, so a pointer outside it cannot even NAME a tile
// (`tileFromCanvasXY` returns null on the letterbox / out-of-rect). The fixture makes this concrete:
// there is REAL undesignated debris at x34-40 y15-16, outside the hold, and a player sweeping toward
// it must not designate any of it.
//
// ⚠️ WHAT THIS DOES *NOT* PROVE: it is not a test of the `roomBounds()` clip. Measured — dropping
// that argument leaves this test GREEN, because the hit test has already refused the tile. The clip
// is the second guard and its only reachable failure case is the shrink test further down. Do not
// read a pass here as evidence the clip is wired.
test('WP-4: a sweep dragged at out-of-room debris designates none of it', () => {
  const debrisOutside = [];
  for (let y = 0; y < wreck.h; y++) {
    for (let x = 0; x < wreck.w; x++) {
      const c = wreck.cells[y * wreck.w + x];
      if (Array.isArray(c) && (c[1] | 0) === 4 && !clampTileToRoom(x, y, HOLD)) debrisOutside.push([x, y]);
    }
  }
  assert.ok(debrisOutside.length >= 10,
    'the fixture no longer has out-of-room debris to drag at — this test would be vacuous');
  const [tx, ty] = debrisOutside[debrisOutside.length - 1]; // the far-right stretch at x40
  rzArm('dig');
  const sent = rzOrders(rzSweep({ x: 30, y: 16 }, { x: tx, y: ty }));
  for (const o of sent) {
    assert.ok(clampTileToRoom(o.x, o.y, HOLD), `designated (${o.x},${o.y}) OUTSIDE the focused room`);
  }
  assert.deepEqual(sent.map(xy), [[30, 16]], 'the drag should not have grown past the room edge');
  rzArm('dig');
});

// MUTATION: drop the `roomBounds()` argument from `buildDragTiles` in onCanvasUp ⇒ 42 payloads
// instead of 12, twelve of them outside the room ⇒ RED.
//
// AND THIS IS THE ONLY TEST THAT MUTATION REDDENS — measured, and it is worth knowing why. The clip
// is UNREACHABLE from ordinary mouse input: `tileFromCanvasXY` already refuses any point outside the
// room, so both drag endpoints are always in-room and the bounding rectangle of two in-room tiles is
// in-room too. The out-of-room-debris test above therefore exercises the HIT TEST, not the clip, and
// stays green without it. What the clip is genuinely for is the case below: `repaint()` re-resolves
// the room rect on every frame ("a resized rect stays correct"), so the room can shrink under a
// sweep that is already in progress, and only then does the recorded start tile fall outside.
test('WP-4: a room that SHRINKS mid-sweep clips the committed order to its new rect', async () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(24, 11) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });   // a 7×6 = 42-tile sweep

  // try/finally, not a trailing restore: this test is the one piece of SHARED state in the section
  // (the HUD's decks cache), and a failed assertion must not leave the hold shrunk for the rest of
  // the file. The afterEach hook re-enters the room and would re-enter the shrunk one.
  try {
    const shrunk = JSON.parse(JSON.stringify(FIX.decks));
    const deck1 = shrunk.decks.find((d) => d.deck === 1);
    const slot = deck1.slots.find((s) => s[5] === 'hold');
    slot[3] = 6; slot[4] = 4;                                        // 12×8 → 6×4 (x22-27, y10-13)
    Hud.renderDecks(shrunk);
    await new Promise((r) => setTimeout(r, 40));                     // let the coalesced repaint land

    rzMouseUp();
    const sent = rzOrders(rzSent);
    assert.equal(sent.length, 12, 'the sweep must be clipped to the room\'s CURRENT rect, not its old one');
    for (const o of sent) {
      assert.ok(o.x >= 22 && o.x < 28 && o.y >= 10 && o.y < 14, `designated (${o.x},${o.y}) outside the shrunk room`);
    }
  } finally {
    Hud.renderDecks(FIX.decks);
    await new Promise((r) => setTimeout(r, 40));
  }
});

// The ACCEPTS caption. Its original justification — "the chips are still on the deprecated console,
// so the toast is the ONLY place on the standard surface that says which filter the sweep painted" —
// is SPENT as of WP-6, and the test is kept for the better reason: the chips state INTENT and the
// toast states what was COMMITTED, and a zone that silently refuses every item looks exactly like one
// nothing has been hauled to yet.
//
// MUTATION: drop the `accepts` concatenation ⇒ RED. It is worded through the SHARED `acceptsLabel`
// (zone-model.js), which is also what the zone key says, so the two cannot spell one mask two ways —
// asserted by calling that function rather than by re-typing 'FOOD' here.
test('a STOCKPILE sweep says which filter it painted, in the zone key\'s own words', () => {
  const FOOD = 1 << 3;
  rzArm('stockpile');
  assert.equal(rzSetMask(FOOD), FOOD);
  rzSweep({ x: 24, y: 11 }, { x: 25, y: 12 });
  const msg = rzDoc.getElementById('rz-toast').textContent;
  assert.match(msg, /STOCKPILE/, 'the toast does not name the verb');
  assert.ok(msg.endsWith(acceptsLabel(FOOD)),
    `the sweep toast (${JSON.stringify(msg)}) does not end with the shared accept-set wording ` +
    `${JSON.stringify(acceptsLabel(FOOD))}. Nothing else on this surface can tell the player which ` +
    'filter they just painted — the ACCEPTS chips are still on the console.');
  assert.notEqual(acceptsLabel(FOOD), acceptsLabel(ACCEPT_ALL));   // non-vacuity: the label varies
  rzArm('stockpile');

  // CONTROL: DIG carries no mask, so its toast must NOT claim an accept-set. Without this leg the
  // assertion above is satisfiable by appending the label to every sweep.
  rzArm('dig');
  rzSweep({ x: 28, y: 14 }, { x: 29, y: 15 });
  assert.ok(!/ACCEPTS/.test(rzDoc.getElementById('rz-toast').textContent),
    'a DIG sweep claims an accept-set it does not carry');
  rzArm('dig');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-6 — THE ACCEPTS CHIPS, on the palette that paints the zone
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A SOURCE-SCAN GUARD WAS DELETED HERE, DELIBERATELY, and the reason is worth reading before
// anyone puts it back. It asserted that `main.js` hands `initRoomZoom` a
// `getStockFilter: () => Hud.getStockFilter()`, with the message *"main.js no longer hands the Room
// Zoom the shared stockpile accept-mask, so every zone painted from the palette falls back to
// ACCEPT-ALL … (WP-6 replaces this getter with chips on this palette; it must not simply be
// removed.)"* WP-6 replaced it, as instructed. The hole it guarded — the composition root forgetting
// to wire the mask — no longer exists, because there is no wiring: the palette owns the mask and the
// chips beside it are its only writer. A structural scan for a line that must not exist would be a
// guard over air. What replaces it is strictly stronger and DRIVEN: click a chip, watch the emitted
// `Cmd.filter` move.
//
// (The mirror assertion in `overview-model.test.js` — "the Overview is handed NO mask" — survives,
// with its non-vacuity leg re-pointed at the two `installInput` blocks, which still carry the getter
// for the console's own canvas path.)

// THE TEST THIS WHOLE PACKAGE EXISTS FOR. Before it, the mask was per-tile in the sim, correct on the
// wire, and UNREACHABLE: the only writer of a stockpile accept-mask anywhere in the client was the
// `onclick` at `hud.js:312`, on the deprecated console shell. Every zone a player painted on the
// standard surface accepted everything, for ever.
//
// It is also the leg that makes the PROBE above mean something (CLAUDE.md's
// "starts-in-the-asserted-state" trap): "an untouched palette paints ACCEPT-ALL" is equally true of a
// client with no chips at all, so the pair is "…and a touched one does not".
//
// MUTATION: `onAcceptChip` returning early / never bound in `onHudClick` ⇒ RED here and green
// everywhere else in this file.
test('WP-6: the ACCEPTS chips CHANGE the mask the next sweep paints with', () => {
  rzArm('stockpile');
  // Baseline through the SAME path, so the contrast is between two driven sweeps and not between a
  // driven sweep and a remembered constant.
  const before = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(before.map((f) => f.mask), [ACCEPT_ALL], 'the untouched palette is not accept-all');

  rzAccept(3);                                       // the player does not want FOOD in this zone
  const want = ACCEPT_ALL & ~(1 << 3);
  assert.equal(rzShownMask(), want, 'the chip row does not show the kind as excluded');
  const after = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(after.map((f) => f.mask), [want],
    `the sweep still painted ${after.map((f) => f.mask)} after a chip was toggled. The ACCEPTS chips ` +
    'do not reach the brush, which is the exact defect this package exists to fix: a filter UI that ' +
    'is present, clickable, and inert.');

  // …and toggling back restores it, so the chip is a TOGGLE and not a one-way switch.
  rzAccept(3);
  const back = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(back.map((f) => f.mask), [ACCEPT_ALL]);
  rzArm('stockpile');
});

// The chips the PLAYER can actually click, read out of the markup `paintAccepts` wrote — the same
// reasoning as the palette-button test above. Every driven test in this section clicks a
// `data-rzaccept` node it constructs itself, so all of them would pass against a row that renders
// nothing at all. MUTATION: `acceptsRowHtml` returning '' ⇒ RED here and NOWHERE ELSE.
test('WP-6: the palette PAINTS one real, labelled, keyboard-reachable chip per ItemKind', () => {
  rzArm('stockpile');
  const html = rzDoc.getElementById('rz-accepts').innerHTML;
  assert.ok(html.length > 0, 'the ACCEPTS row painted nothing');
  for (const { kind, label } of STOCK_KINDS) {
    assert.ok(html.includes('data-rzaccept="' + kind + '"'), `no chip for ItemKind ${kind} (${label})`);
    assert.ok(html.includes('>' + label + '<'), `the chip for kind ${kind} is missing its label '${label}'`);
  }
  // Real <button>s, so they land in the tab order and Enter/Space activate them natively — the same
  // decision (and the same stated reason) as the console's own chips at hud.js:300-304. Bettered
  // here with an explicit type and a state a screen reader can read: `.on` is a CSS class, which is
  // invisible to assistive tech. MUTATION: drop `type="button"` or `aria-pressed` ⇒ RED.
  assert.equal((html.match(/<button type="button"/g) || []).length, STOCK_KINDS.length,
    'every chip must be an explicit type="button" — an implicit one SUBMITS inside a form');
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, STOCK_KINDS.length,
    'an untouched palette accepts every kind, so every chip must read as pressed');
  rzAccept(3);
  const off = rzDoc.getElementById('rz-accepts').innerHTML;
  assert.equal((off.match(/aria-pressed="false"/g) || []).length, 1,
    'toggling one kind off must flip exactly one chip\'s aria-pressed AND its class');
  assert.equal((off.match(/class="rz-acc-chip"/g) || []).length, 1,
    'exactly one chip must lose the `on` class');
  rzArm('stockpile');
});

// PLAN §5 GAP 2 — "chips affect only future paints, with nothing saying so". The wording is the fix;
// the COUNT is the honest part, because the sentence is a rule and the count is the player's actual
// situation. MUTATION: drop the `mismatch` argument from `acceptsRowHtml` (so it always renders the
// bare rule) ⇒ RED on the count legs; drop the whole `.rz-acc-note` ⇒ RED on the first.
test('WP-6: the row SAYS the chips apply to tiles painted next, and counts the ones that differ', async () => {
  const accepts = () => rzDoc.getElementById('rz-accepts').innerHTML;
  const settle = () => new Promise((r) => setTimeout(r, 40));   // the coalesced repaint
  rzArm('stockpile');
  assert.ok(accepts().includes(APPLIES_NEXT_LABEL),
    'the ACCEPTS row does not say that the chips apply to tiles painted NEXT — which is the whole ' +
    'of plan §5 gap 2, and was previously said only in a title= attribute nobody hovers');

  // ABSENT when nothing differs. Without this leg the count assertion below is satisfiable by always
  // rendering a count, including a wrong one.
  Hud.renderZones({ type: 'zones', cells: [] });
  await settle();
  assert.ok(!/KEEP A DIFFERENT FILTER/.test(accepts()),
    'the row claims already-painted tiles disagree when the room has no zones at all');

  // …and PRESENT, with the right number, when they do. Three zoned tiles in the hold: two carrying
  // FOOD-only, one carrying accept-all. With the chips at accept-all, exactly two differ.
  Hud.renderZones({ type: 'zones', cells: [
    [24, 11, DECK1, 1 << 3, 0], [25, 11, DECK1, 1 << 3, 0], [26, 11, DECK1, ACCEPT_ALL, 0],
    [4, 6, DECK1, 1 << 3, 0],   // OUTSIDE the focused room, same deck — must not be counted
  ] });
  await settle();
  const html = accepts();
  assert.ok(html.includes(mismatchLabel(2)),
    `the row does not carry ${JSON.stringify(mismatchLabel(2))}. It said ${JSON.stringify(html)}`);
  assert.match(mismatchLabel(2), /^2 ZONED TILES IN THIS ROOM/, 'the wording drifted');
  // The count is ROOM-scoped and the words say so: the fourth row above is a zoned tile on the same
  // deck outside the focused rect, and counting it would make the sentence a lie.
  assert.ok(!html.includes(mismatchLabel(3)), 'a zoned tile outside the focused room was counted');
  // …and it tracks the chips, not just the map: excluding FOOD makes the two FOOD tiles agree and
  // the accept-all one the odd tile out. It also moves WITHOUT a repaint, because a chip click is
  // the one thing on this surface that changes the answer with no wire traffic behind it.
  // MUTATION: recompute the count against a constant mask ⇒ RED.
  rzAccept(3);
  assert.ok(accepts().includes(mismatchLabel(3)),
    'the count did not move when the chips did — it is being computed against the wrong mask');
  Hud.renderZones({ type: 'zones', cells: [] });
  await settle();
  rzArm('stockpile');
});

// PLAN §5 GAPS 1 + 3 — the per-tile indicators. `zone-overlay.test.js` pins the BUILDER to the
// character; nothing anywhere pinned that its output reaches this surface's SVG, which is precisely
// the hole WP-3's own header records (a builder returning '' left 546/546 green). So this reads the
// layer the running controller actually mounted.
//
// MUTATION: drop `body += zoneLayerSvg(_zoneTiles, _focus);` from paintLayers ⇒ RED.
test('WP-6: a restricted tile and a backed-off tile are VISIBLY marked in the mounted layer', async () => {
  Hud.renderZones({ type: 'zones', cells: [
    [24, 11, DECK1, ACCEPT_ALL, 0],                       // plain zone
    [25, 11, DECK1, 1 << 3, 0],                           // RESTRICTED
    [26, 11, DECK1, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF],    // BACKED OFF
  ] });
  await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
  const svg = rzLayers.innerHTML;
  assert.match(svg, /class="rz-zones"/, 'the zone layer never reached the mounted SVG');
  assert.equal((svg.match(/class="rz-zone-wedge"/g) || []).length, 1,
    'exactly one tile is filtered, so exactly one corner badge must be drawn');
  assert.equal((svg.match(/class="rz-zone-hatch"/g) || []).length, 1, 'one hatched tile');
  // The DIM half of plan §5's "dim + hatch + a one-line reason" — WP-3 shipped the other two.
  assert.equal((svg.match(/class="rz-zone-dim"/g) || []).length, 1,
    'a backed-off tile must be DIMMED as well as hatched (plan §5 gap 3)');
  // THE ONE-LINE REASON, and it must be the HONEST wording. `_tileRetryAt` is a retry stamp wiped on
  // any tile-board rebuild (HaulJobSource.cs:453), so "UNREACHABLE" would be a claim the data cannot
  // support. MUTATION: strengthen BACKED_OFF_LABEL to 'UNREACHABLE' ⇒ RED.
  assert.match(svg, /NO HAULER REACHED THIS RECENTLY/,
    'the back-off reason is missing from the mounted layer');
  assert.ok(!/UNREACHABLE/.test(svg),
    'the back-off bit is being labelled as proof of permanent unreachability. It is a RETRY STAMP: ' +
    '`_tileRetryAt` is cleared wholesale on any tile-board rebuild and per-tile on proof of ' +
    'reachability, so the strongest honest wording is "no hauler has reached this recently".');
  // …and the key beside the floor says the same words without needing a hover.
  assert.match(rzDoc.getElementById('rz-zonekey').innerHTML, /NO HAULER REACHED THIS RECENTLY/);
  Hud.renderZones({ type: 'zones', cells: [] });
  await new Promise((r) => setTimeout(r, 40));
});

// The row is the ARMED TOOL's options, exactly like the material strip — so it must not be on screen
// while the player is building a wall. MUTATION: drop the `_armed !== 'stockpile'` branch ⇒ RED.
test('WP-6: the ACCEPTS row belongs to STOCKPILE — hidden for every other tool, and on disarm', () => {
  const row = rzDoc.getElementById('rz-accepts');
  assert.equal(row.hidden, true, 'the row is showing with nothing armed');
  rzArm('stockpile');
  assert.equal(row.hidden, false, 'arming STOCKPILE did not reveal the ACCEPTS row');
  rzArm('wall');                       // a different tool REPLACES the armed slot
  assert.equal(row.hidden, true, 'the ACCEPTS row survived arming WALL');
  assert.equal(row.innerHTML, '', 'a hidden row must also be emptied, or its buttons stay tabbable');
  rzArm('wall');
  rzArm('stockpile');
  assert.equal(row.hidden, false);
  rzArm('stockpile');                  // same button again → disarm
  assert.equal(row.hidden, true, 'disarming did not hide the ACCEPTS row');
  // …and the material strip is the mutually-exclusive sibling this row was placed beside, which is
  // what makes reveal-on-arm cost no net height.
  rzArm('stockpile');
  assert.equal(rzDoc.getElementById('rz-matstrip').hidden, true,
    'the material strip is showing for STOCKPILE — the two rows would then stack');
  rzArm('stockpile');
});

// MUTATION: leave the demolish toast at its pre-WP-4 wording ⇒ RED. A built wall used to be a dead
// end on this surface; STRIP is the verb that ends it, so the message has to name it.
test('WP-4: the built-wall dead end now points at STRIP', () => {
  const wallTile = { x: HOLD.rx, y: HOLD.ry };
  assert.equal(demolishTarget(wallTile.x, wallTile.y, null, null, wreck).kind, 'built-wall',
    'the hold\'s top-left tile is no longer a built wall in the fixture — pick another');
  rzArm('demolish');
  rzFire(rzCanvas, 'click', { button: 0, ...atTile(wallTile.x, wallTile.y) });
  assert.match(rzDoc.getElementById('rz-toast').textContent, /STRIP/,
    'DEMOLISH on a built wall must name the verb that CAN take it apart, now that STRIP exists here');
  rzArm('demolish');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE LIVE BUG (2026-07-26, reported by the owner three times): a condemned DEVICE was invisible.
//
// *"I can see the button, I can see the square when I hover over the furniture, but after clicking,
// the square disappears."* The square is the tool's hover preview, which correctly clears on
// release; what should replace it is the persistent condemned mark, and for a DEVICE that mark
// never reached the client at all — `GlyphMapper` pass 4 repainted the device's own colour over
// `GlyphColor.Deconstruct` (fixed in `sim/Sim.Glyph/GlyphMapper.cs`; pinned by
// `tests/Perilune.Tests/StripVerbTests.cs`).
//
// THE CLIENT HALF, which is what these two tests own. The mark layer draws ABOVE `furnitureSvg`; it
// used to be concatenated below it, so the condemned mark would have drawn its amber ✕ underneath
// the desk's own opaque sprite — the player condemns a desk, the sim agrees, the mark arrives, and
// he still sees nothing.
//
// ⚠️ THE SENTENCE THAT USED TO OPEN THIS PARAGRAPH IS FALSE AND IS QUOTED: *"Once fg 26 arrives on a
// FURNITURE tile the byte→mark table already handles it — `roomMarkTiles` keys on `cell[1]` and has
// never looked at the glyph."* There is no byte→mark table any more, and it is the DEVICE case that
// makes the point: pass 4 was patched in `GlyphMapper` to re-apply the strip colour over a condemned
// device, and that patch is the ONLY reason fg 26 ever reached a furniture tile. The `marks` channel
// needs no such patch — and the test below now drives the case that patch could never reach, a crew
// member STANDING on the condemned tile (pass 5), which no fg byte can survive.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('THE LIVE BUG (driven): a condemned DEVICE tile renders its strip mark in the real Room Zoom', () => {
  // A glyph code the Room Zoom actually skins as furniture — DERIVED from the shipped table, so this
  // cannot rot into a code that stopped being furniture (and the assert makes the scan non-vacuous).
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) if (itemForGlyph(c)) code = c;
  assert.ok(code, 'no glyph code maps to a furniture item — the derivation found nothing to test with');

  // A tile INSIDE the hold carrying FURNITURE in the frame and a STRIP mark on the channel — the two
  // now travel separately, which is the point. THE FRAME CELL IS DELIBERATELY LEFT AS AN ORDINARY
  // DEVICE (fg 8): under the old fg-byte path that is precisely the "invisible condemned device" the
  // owner reported three times, so if anything here still read `cell[1]` this test would go red.
  const tx = HOLD.rx + 1, ty = HOLD.ry + 1;
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [code, 8, 0, 0];
  const condemned = {
    type: 'marks',
    cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]),
  };

  try {
    // PRECONDITION, and it is the non-vacuity control for the whole test: with the SAME frame and
    // the SAME furniture but NO strip on the channel, no strip mark is drawn. Without this leg a
    // `rz-marks` group produced by some unrelated tile of the wreck would satisfy the assertion
    // below and prove nothing.
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
    assert.ok(!rzLayers.innerHTML.includes('mk-strip'),
      'precondition: an UNCONDEMNED furniture tile draws no strip mark');

    Hud.renderMarks(condemned);
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;

    assert.ok(html.includes('class="rz-marks"'), 'the mark layer must reach the DOM');
    assert.ok(html.includes('mk mk-strip'),
      'a condemned DEVICE must draw the strip mark. This is the owner-reported bug: the order '
      + 'registered and was serviced, and the player was never told.');
    assert.ok(html.includes('mk-condemn'), 'the strip mark must carry its ✕, not just the order ring');

    // AND IT MUST NOT BE BURIED. The furniture sprite for THIS tile carries `rz-f-<tx>-<ty>` in its
    // generated ids, so the two layers can be located independently and their order asserted rather
    // than assumed. Painted under the desk the mark is present in the DOM and invisible on screen —
    // which would reproduce the reported symptom exactly while every assertion above stayed green.
    const iFurn = html.indexOf('rz-f-' + tx + '-' + ty);
    const iMark = html.indexOf('mk mk-strip');
    assert.ok(iFurn > 0, 'the furniture sprite for the condemned tile is not in the DOM — '
      + 'the ordering assertion below would be vacuous');
    assert.ok(iMark > iFurn,
      'the strip mark is drawn BEFORE (i.e. underneath) the furniture sprite it condemns, so the '
      + 'player sees the desk and not the ✕ — the reported symptom, with the byte present');
  } finally {
    Hud.renderFrame(wreck);   // never leave a doctored frame in the shared HUD cache
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
  }
});

// ⚠️ ADDED AFTER A MUTATION SURVIVED. `renderMarks(m) { _marks = m; }` — the cache written, the
// surfaces never told — passed the whole suite green. It is not a theoretical hole: `marks` is
// deduped by `GameSession.Send`, so on a quiet ship it is sent ONCE, and a designation the player
// just placed would sit in the cache until some other channel happened to move. The test therefore
// dispatches ONLY the marks channel and lets the coalesced repaint land.
//
// MUTATION: drop `notifyShip()` from `renderMarks` in hud.js ⇒ RED.
test('a marks dispatch ALONE repaints the surfaces — the cache is not enough', async () => {
  const tx = HOLD.rx + 3, ty = HOLD.ry + 3;
  const condemned = { type: 'marks', cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]) };
  try {
    rzApi.exit(); rzApi.enter('hold');
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(!rzLayers.innerHTML.includes('mk-strip'), 'precondition: nothing is condemned yet');

    // NOTHING ELSE IS DISPATCHED. No frame, no decks, no rooms — only the channel under test.
    Hud.renderMarks(condemned);
    await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
    assert.ok(rzLayers.innerHTML.includes('mk mk-strip'),
      'a `marks` message reached the cache and the Room Zoom never repainted. The channel is '
      + 'deduped by GameSession.Send, so on a quiet ship it is sent ONCE — a designation the player '
      + 'just placed would then sit invisible until some unrelated channel moved.');
  } finally {
    Hud.renderMarks(WRECK_MARKS_MSG);
    await new Promise((r) => setTimeout(r, 40));
  }
});

// THE CASE THE PASS-4 PATCH COULD NEVER REACH, driven through the same real controller: a CREW
// MEMBER STANDING ON THE CONDEMNED TILE. `GlyphMapper` pass 5 paints the citizen's own colour over
// `cell[1]` unconditionally, so under the old source this tile's mark was gone for as long as anyone
// stood on it — and on `--ship grid` the crew cluster in the hold at x25-32 y15-16, exactly where the
// designations are, so it blinked out and back as people crossed. The channel does not ride the
// projection, so it cannot be overwritten.
//
// MUTATION: point `_markTiles` back at `roomMarkTiles(frame, _focus)` ⇒ this goes red (the frame
// cell says fg 5 = Crew, which was never a mark).
test('THE LIVE BUG, generalised (driven): a mark SURVIVES a crew member standing on the tile', () => {
  const tx = HOLD.rx + 2, ty = HOLD.ry + 2;
  const cells = wreck.cells.slice();
  // '@' at GlyphColor.Crew (5) — byte-for-byte what pass 5 writes over whatever was there.
  cells[ty * wreck.w + tx] = [64, 5, 0, 0];
  const condemned = { type: 'marks', cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]) };
  try {
    // NON-VACUITY: the doctored cell really does carry no mark byte, so a client still reading
    // `cell[1]` genuinely could not draw this mark. Without this the test proves nothing about the
    // source — it would just be "a mark on the channel draws".
    assert.equal(FG_TO_KIND[cells[ty * wreck.w + tx][1]], undefined,
      'the planted crew cell carries a mark fg byte after all — the old path would have drawn it '
      + 'too, so this test no longer distinguishes the two sources');

    Hud.renderFrame({ ...wreck, cells });
    Hud.renderMarks(condemned);
    rzApi.exit(); rzApi.enter('hold');
    assert.ok(rzLayers.innerHTML.includes('mk mk-strip'),
      'a condemned tile with a crew member standing on it drew NO mark — the mark layer is reading '
      + 'the projection again, and the designation blinks out whenever anyone walks over it');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('THE LIVE BUG (synthetic): both surfaces mark a condemned FURNITURE tile, and mark ABOVE it', () => {
  // A code BOTH surfaces skin as furniture, derived against BOTH rather than assumed shared — the
  // existence assert is what stops this test degrading into a vacuous pass if they ever diverge.
  // ⚠️ THE REASON WEAKENED 2026-07-26 and the old wording is quoted so the change is visible: *"The
  // two keep independent glyph→item tables (`itemForGlyph` here, `SPRITE_FOR_GLYPH`/`ROLE_TO_ITEM`
  // in overview-scene.js)"*. They no longer do — both call `itemIdForGlyphChar` off the one `ITEMS`
  // derivation (`client/src/items/glyph-map.js`), which is the whole of that package. Deriving
  // against both is now belt-and-braces rather than load-bearing, and it is kept precisely because a
  // future surface could stop reading the shared table without this test noticing otherwise.
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) {
    if (!itemForGlyph(c)) continue;
    const probe = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[c, 8, 0, 0]] };
    if (overviewScene({ deck: 0, decksView: fixView, frame: probe, crew: [], marks: [] }).includes('pl-furniture')) code = c;
  }
  assert.ok(code, 'no glyph code is furniture on BOTH surfaces — the ordering assertion would be vacuous');

  // The frame carries the FURNITURE at an ordinary device colour; the condemnation travels on the
  // `marks` channel beside it. (It used to be `[[code, 26, 0, 0]]` — one cell carrying both — and
  // that cell only existed because pass 4 was patched to produce it.)
  const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[code, 8, 0, 0]] };
  const chan = decodeMarks({ type: 'marks', cells: [[0, 0, 0, 3]] });

  // The Room Zoom's pure model reports it and its pure layer draws it…
  assert.deepEqual(roomMarkTiles(chan, focus).map((t) => t.mark), ['strip']);
  assert.ok(markLayerSvg(roomMarkTiles(chan, focus), focus).includes('mk-strip'));

  // …and the Overview's real composer agrees, byte for byte, on the same tile. The two surfaces
  // share `mark-overlay.js` precisely so a condemned desk cannot read one way in the schematic and
  // another in the room.
  const ov = overviewScene({ deck: 0, decksView: fixView, frame, crew: [], marks: chan });
  assert.deepEqual(marks(ov).map((k) => k.kind), ['strip']);

  // ORDER on the Overview, driven rather than scanned, and now unconditional.
  const iFurn = ov.indexOf('<g class="pl-furniture"');
  const iMark = ov.indexOf('mk mk-strip');
  assert.ok(iFurn > 0, 'the Overview drew no furniture for the condemned tile');
  assert.ok(iMark > iFurn,
    'the Overview draws the condemned mark UNDER its own furniture layer — same defect, other surface');
});

// MOVING THE MARK LAYER ABOVE THE FURNITURE LAYER IS INERT FOR EVERY PRE-EXISTING MARK, and this is
// the measurement rather than the argument. Debris (fg 4) and dig (fg 15) only ever ride glyph code
// 37 (`'%'`), which is in both surfaces' `NON_FURNITURE`, so no tile in the shipped capture carries
// a mark AND a furniture sprite — the two layers were disjoint and their order could not matter. If
// a future frame ever breaks that, this test says so instead of a screenshot doing it later.
test('THE LIVE BUG: the layer reorder changes NOTHING on the real capture (measured disjointness)', () => {
  let marked = 0, furnished = 0, both = 0;
  const markedXy = new Set(wreckMarks.map((m) => m.x + ',' + m.y));
  for (let ty = 0; ty < wreck.h; ty += 1) {
    for (let tx = 0; tx < wreck.w; tx += 1) {
      const cell = wreck.cells[ty * wreck.w + tx];
      if (!Array.isArray(cell)) continue;
      const isMark = markedXy.has(tx + ',' + ty);
      const isFurn = !!itemForGlyph(cell[0] | 0);
      if (isMark) marked += 1;
      if (isFurn) furnished += 1;
      if (isMark && isFurn) both += 1;
    }
  }
  assert.ok(marked > 0, 'the capture carries no marks at all — the disjointness claim is vacuous');
  assert.ok(furnished > 0, 'the capture carries no furniture at all — the disjointness claim is vacuous');
  assert.equal(both, 0,
    'a tile in the shipped capture carries BOTH a mark byte and a furniture glyph, so moving the '
    + 'mark layer above the furniture layer is NOT the inert reorder it was justified as');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE `items` CHANNEL, DRIVEN THROUGH THE REAL CONTROLLER.
//
// The pure model lives in `items-model.test.js`. What can only be shown HERE is that the layer
// reaches the DOM of the real `roomzoom-view.js` — and, specifically, the two things the projected
// glyph could not deliver:
//
//   • A COUNT AND A NAME instead of one raw ASCII letter in a dashed box. The letter chip is what
//     independent review photographed on `--ship grid` deck 0, room STORAGE: seven of them, `,` ×6
//     and `f` ×1, in the shipping game.
//   • A STACK ON A DEVICE'S TILE AT ALL. `GlyphMapper` pass 4 writes the device glyph over pass 3's
//     item unconditionally, so that stack reached the client nowhere. Drawing the plate UNDER the
//     device sprite would reproduce the erasure in the client after removing it from the wire, so
//     the layer order is asserted rather than assumed — the same trap the `marks` package hit.
//
// Every leg is a PAIR: the precondition half proves the fixture really is in the state being
// measured, so none of these can pass against a controller that draws nothing at all.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** An `items` payload from `[x, y, kind, count]` on deck 1 (the wreck's deck). */
const itemsMsg = (rows) => ({ type: 'items', cells: rows.map((r) => [r[0], r[1], DECK1, r[2], r[3]]) });
/** The empty payload — the state a room with nothing on its floor is really in. */
const NO_ITEMS = { type: 'items', cells: [] };

/**
 * The VS-Z-25 unknown chip's letter at ONE tile, or null when that tile draws no chip.
 *
 * ⚠️ PER-TILE, AND THE FIRST DRAFT WAS NOT — it asserted `!html.includes('>,</text>')` and went RED
 * on its own correct implementation, because the real wreck carries OTHER `,` tiles inside the hold
 * that are not the tile under test. A whole-document `includes` cannot say WHICH tile drew a chip,
 * which is the only thing these tests are about. The chip branch is the one place `furnitureSvg`
 * emits an INTEGER translate (every art branch uses `toFixed(1)`, so it carries a decimal point), and
 * `fill="#57503f" text-anchor` is unique to the chip's text node.
 */
function chipAt(html, tx, ty) {
  const key = '<g transform="translate(' + (tx - HOLD.rx) * U + ' ' + (ty - HOLD.ry) * U + ')">';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const m = /fill="#57503f" text-anchor="middle"[^>]*>([^<]*)</.exec(html.slice(i, i + 500));
  return m ? m[1] : null;
}

test('THE LETTER BOX IS REPLACED (driven): a ground stack draws its KIND AND COUNT, not a raw glyph', () => {
  // A tile inside the hold carrying the Regolith ground glyph `,` (code 44) in the frame — exactly
  // what the projection writes for a spoil pile, and exactly what the owner saw as a dashed chip.
  const tx = HOLD.rx + 1, ty = HOLD.ry + 1;
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [44, 6, 0, 0];   // ',' at GlyphColor.Item
  try {
    // PRECONDITION / NON-VACUITY: with the frame alone and no items channel, the surface really does
    // draw the VS-Z-25 unknown chip carrying the raw letter. Without this leg every assertion below
    // would be satisfied by a controller that had simply stopped drawing that tile.
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    const before = rzLayers.innerHTML;
    assert.equal(chipAt(before, tx, ty), ',',
      'precondition: THIS tile does not draw the unknown chip carrying the raw `,` glyph, so '
      + '"the letter box is replaced" is unmeasurable here — and it is the reported symptom');
    assert.ok(!before.includes('REGO'), 'precondition: no plate before the channel arrives');

    Hud.renderItems(itemsMsg([[tx, ty, 0, 40]]));
    rzApi.exit(); rzApi.enter('hold');
    const after = rzLayers.innerHTML;

    assert.ok(after.includes('class="rz-items"'), 'the item layer must reach the DOM');
    assert.ok(after.includes('REGO 40'),
      'the plate must name the KIND and the COUNT. The count is the fact no projection byte could '
      + 'ever have carried — a stack of 1 and a stack of 40 write the identical cell.');
    assert.equal(chipAt(after, tx, ty), null,
      'the raw-letter chip is STILL drawn under the plate on this tile. That letter is the lossy '
      + 'rendering this channel replaces; stacking the two puts `,` and `REGO 40` on one tile.');
    // …and the suppression is SURGICAL: another `,` tile elsewhere in the same room, which the
    // channel says nothing about, must keep its chip. Without this leg, "suppress every unknown
    // chip" would pass — and that would delete the honest signal on tiles with no stock data.
    const other = [...after.matchAll(/fill="#57503f" text-anchor="middle"[^>]*>([^<]*)</g)];
    assert.ok(other.length > 0,
      'every unknown chip in the room vanished. Only the PLATED tiles may lose theirs; the chip is '
      + 'still the honest thing to draw where the items channel reports nothing.');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('LOSS 2 (driven): two kinds on one tile are BOTH named — the projection could show only one', () => {
  const tx = HOLD.rx + 2, ty = HOLD.ry + 1;
  const cells = wreck.cells.slice();
  // The frame can only carry the LAST stack: pass 3 assigns the cell per item. Here that is Potato.
  cells[ty * wreck.w + tx] = [102, 6, 0, 0];   // 'f' = Glyphs.ForItem(Potato)
  try {
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    assert.equal(chipAt(rzLayers.innerHTML, tx, ty), 'f',
      'precondition: the frame carries only the topmost stack, as one letter, on THIS tile');

    Hud.renderItems(itemsMsg([[tx, ty, 0, 7], [tx, ty, 3, 2]]));
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;
    assert.ok(html.includes('REGO 7'), 'the stack the projection dropped must be named');
    assert.ok(html.includes('FOOD 2'), 'and so must the one it kept');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('LOSS 3 (driven): a stack on a DEVICE tile is drawn, and drawn ABOVE the device', () => {
  // A glyph code the Room Zoom actually skins as furniture — DERIVED from the shipped table, so this
  // cannot rot into a code that stopped being furniture (and the assert makes the scan non-vacuous).
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) if (itemForGlyph(c)) code = c;
  assert.ok(code, 'no glyph code maps to a furniture item — the derivation found nothing to test with');

  const tx = HOLD.rx + 1, ty = HOLD.ry + 2;
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [code, 8, 0, 0];   // an ordinary powered device — what pass 4 writes
  try {
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    const before = rzLayers.innerHTML;
    assert.ok(before.includes('rz-f-' + tx + '-' + ty),
      'precondition: the device sprite is not on this tile, so the burial test below is vacuous');
    assert.ok(!before.includes('PART'), 'precondition: no plate before the channel arrives');

    Hud.renderItems(itemsMsg([[tx, ty, 5, 12]]));
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;

    assert.ok(html.includes('PART 12'),
      'a stack stored on a device tile drew nothing. Under the projection it reached the client '
      + 'nowhere at all — pass 4 painted the device glyph over it — and that is loss 3.');
    assert.ok(html.includes('rz-f-' + tx + '-' + ty),
      'THE DEVICE SPRITE WAS SUPPRESSED. Only the unknown-letter FALLBACK may be replaced by a '
      + 'plate: real art says what is installed there, the plate says what is lying there, and both '
      + 'are true.');

    const iFurn = html.indexOf('rz-f-' + tx + '-' + ty);
    const iPlate = html.indexOf('PART 12');
    assert.ok(iPlate > iFurn,
      'the plate is drawn BEFORE (i.e. underneath) the device sprite, so the player sees the machine '
      + 'and not the stock — the wire loss removed and the same loss reintroduced in the client');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

// ⚠️ THE SAME MUTATION THAT SURVIVED ON `marks`. `renderItems(m) { _items = m; }` — the cache
// written, the surfaces never told — would pass every other test in this file, because they all
// re-enter the room (which repaints unconditionally). `items` is deduped by `GameSession.Send`, so on
// a quiet ship it is sent once; a haul that just landed would sit invisible until some unrelated
// channel moved. This test dispatches ONLY the items channel and lets the coalesced repaint land.
//
// MUTATION: drop `notifyShip()` from `renderItems` in hud.js ⇒ RED.
test('an items dispatch ALONE repaints the surfaces — the cache is not enough', async () => {
  const tx = HOLD.rx + 3, ty = HOLD.ry + 2;
  try {
    rzApi.exit(); rzApi.enter('hold');
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(!rzLayers.innerHTML.includes('ICE 9'), 'precondition: nothing is stocked yet');

    // NOTHING ELSE IS DISPATCHED. No frame, no decks, no rooms — only the channel under test.
    Hud.renderItems(itemsMsg([[tx, ty, 8, 9]]));
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(rzLayers.innerHTML.includes('ICE 9'),
      'an `items` message reached the cache and the Room Zoom never repainted. The channel is '
      + 'deduped by GameSession.Send, so on a quiet ship it is sent ONCE — a haul that just landed '
      + 'would then sit invisible until some unrelated channel moved.');
  } finally {
    Hud.renderItems(NO_ITEMS);
    await new Promise((r) => setTimeout(r, 40));
  }
});
