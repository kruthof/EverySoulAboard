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
import { ACCEPT_ALL, defaultStockFilter } from '../src/ui/stock-filter-model.js';
import { acceptsLabel } from '../src/ui/zone-model.js';
import { codeOnly, callBlocks } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { MARK_FOR_FG, markForFg, markVariant, markCellSvg } from '../src/ui/mark-overlay.js';
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

test('WP-2: roomMarkTiles reads cell[1] and reports every marked tile on the deck', () => {
  const all = roomMarkTiles(wreck, WHOLE_DECK1);
  assert.equal(all.length, 33);
  assert.equal(all.filter((m) => m.mark === 'debris').length, 30);
  assert.equal(all.filter((m) => m.mark === 'dig').length, 3);
  // every reported tile really carries the byte it claims, at the coordinates it claims
  for (const m of all) {
    const cell = wreck.cells[m.ty * wreck.w + m.tx];
    assert.equal(cell[1], m.fg);
    assert.equal(cell[0], m.code);
    assert.equal(markForFg(cell[1]), m.mark);
  }
  // and nothing unmarked leaked in
  assert.equal(all.filter((m) => m.fg !== 4 && m.fg !== 15).length, 0);
});

test('WP-2: marks are clamped to the focused room and its deck, like every other channel', () => {
  // The 3 designated tiles sit in the authored 'hold' (deck 1 slot 6, the live wreck room); the
  // debris lies in the halls either side of it. Both rects come from the fixture's own `decks`.
  const hold = roomMarkTiles(wreck, slotFocus('hold'));
  assert.equal(hold.length, 3);
  assert.ok(hold.every((m) => m.mark === 'dig'));

  const halls = deckSlots(fixView, DECK1)
    .filter((s) => !s.anchorName)
    .map((s) => roomMarkTiles(wreck, { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h }));
  const withDebris = halls.filter((h) => h.length);
  assert.equal(withDebris.length, 2, 'the wreck fills exactly two deck-1 halls in this capture');
  assert.deepEqual(withDebris.map((h) => h.length).sort((a, b) => a - b), [14, 16]);
  assert.ok(withDebris.every((h) => h.every((m) => m.mark === 'debris')));

  // off-deck frame → nothing (the deck gate), and a room off the wreck → nothing
  assert.deepEqual(roomMarkTiles(wreck, { ...slotFocus('hold'), deck: 0 }), []);
  assert.deepEqual(roomMarkTiles(wreck, slotFocus('command')), []);
  assert.deepEqual(roomMarkTiles(null, WHOLE_DECK1), []);
});

test('WP-2: a DESIGNATED tile renders differently from an UNDESIGNATED one in the Room Zoom', () => {
  const holdFocus = slotFocus('hold');
  const hallFocus = slotFocus(5); // the hall the wreck's debris fills
  const digSvg = markLayerSvg(roomMarkTiles(wreck, holdFocus), holdFocus);
  const debSvg = markLayerSvg(roomMarkTiles(wreck, hallFocus), hallFocus);

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
  assert.equal(markLayerSvg(roomMarkTiles(wreck, holdFocus), holdFocus), digSvg);
  assert.equal(markLayerSvg([], holdFocus), '');
  assert.equal(markLayerSvg(roomMarkTiles(wreck, slotFocus('command')), slotFocus('command')), '');
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
  const tiles = roomMarkTiles(wreck, holdFocus);
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

test('WP-2 (synthetic): all four GlyphColor bytes map to their mark, and no other byte does', () => {
  assert.deepEqual(MARK_FOR_FG, { 4: 'debris', 15: 'dig', 16: 'stockpile', 26: 'strip' });
  for (let fg = 0; fg <= 40; fg += 1) {
    const expect = { 4: 'debris', 15: 'dig', 16: 'stockpile', 26: 'strip' }[fg] || '';
    assert.equal(markForFg(fg), expect, `fg ${fg}`);
  }
  // an unknown mark name draws nothing rather than throwing
  assert.equal(markCellSvg('nonsense', 0, 0, 32, 32), '');
  assert.equal(markCellSvg('debris', 0, 0, 0, 32), ''); // a degenerate box draws nothing
});

test('WP-2 (synthetic): the Room Zoom REPORTS a stockpile tile but leaves the drawing to WP-3', () => {
  const focus = { deck: 0, rx: 0, ry: 0, rw: 2, rh: 1 };
  const frame = { deck: 0, w: 2, h: 1, lens: 'none', cells: [[46, 16, 0, 0], [35, 26, 0, 0]] };
  const tiles = roomMarkTiles(frame, focus);
  assert.deepEqual(tiles.map((t) => t.mark), ['stockpile', 'strip']);
  const svg = markLayerSvg(tiles, focus);
  // The strip mark draws; the stockpile one does not — zoneLayerSvg already paints that tile from
  // the `zones` channel, one line above this layer in roomzoom-view.js, and stacking two slate tints
  // on one tile is a visible artefact. Semantics are unchanged: fg 16 still means "stockpile zone".
  assert.deepEqual(marks(svg).map((k) => k.kind), ['strip']);
  assert.ok(svg.includes('mk-condemn'), 'a condemned wall must carry the strip mark');
  // and a stockpile-only room emits no layer at all rather than an empty group
  assert.equal(markLayerSvg([{ tx: 0, ty: 0, mark: 'stockpile' }], focus), '');
});

test('WP-2 (synthetic): the two surfaces speak ONE vocabulary — same fg byte, same mark', () => {
  // Drives BOTH real composers over the same single-cell frame, byte by byte, so the tables cannot
  // drift apart. The Overview draws all four kinds; the Room Zoom draws three by design (above).
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  let sawMark = 0;
  for (let fg = 0; fg <= 30; fg += 1) {
    const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[46, fg, 0, 0]] };
    const ovKinds = marks(overviewScene({ deck: 0, decksView: fixView, frame, crew: [] })).map((k) => k.kind);
    const rzKinds = roomMarkTiles(frame, focus).map((t) => t.mark);
    assert.deepEqual(ovKinds, rzKinds, `fg ${fg}: the Overview and the Room Zoom disagree about what `
      + 'this byte means. They share mark-overlay.js precisely so they cannot.');
    if (rzKinds.length) {
      sawMark += 1;
      // …and the drawn cell is byte-identical for the same box, so "different surface" can never
      // become "different meaning".
      assert.equal(markCellSvg(rzKinds[0], 0, 0, 10, 10, markVariant(0, 0)),
        markCellSvg(ovKinds[0], 0, 0, 10, 10, markVariant(0, 0)));
    }
  }
  assert.equal(sawMark, 4, 'exactly four bytes in 0..30 carry a mark; the sweep found a different number');
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
 *  test file's diff alone" — and this package is a new consumer (the `main.js` wiring guard below
 *  uses `callBlocks`, which is built on the same stripper). Keeping one copy for the old scans and
 *  importing the shared one for the new is the exact shape CLAUDE.md trap 1 warns about: two
 *  strippers, one of which can silently rot. Both now come from `client/test/code-only.js`, whose
 *  behaviour is pinned in `surface-boundary.test.js` AND by the two controls immediately below,
 *  which are unchanged and now exercise the shared function.
 */

test('WP-2: the Room Zoom actually CONCATENATES the mark layer into its SVG body', () => {
  const src = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  assert.match(src, /body\s*\+=\s*markLayerSvg\(\s*roomMarkTiles\(/,
    'client/src/ui/roomzoom-view.js must concatenate markLayerSvg(roomMarkTiles(...)) into the layer '
    + 'body. A perfect builder nobody calls satisfies every other assertion in this file and draws '
    + 'nothing on screen — the exact failure zone-overlay.js was extracted to stop.');
  // ORDER: above the material layer (which paints an OPAQUE swatch over every built wall, so a strip
  // mark beneath it would be invisible) and above the zone layer whose tiles this one skips.
  const iMat = src.indexOf('materialLayerSvg(');
  const iZone = src.indexOf('zoneLayerSvg(');
  const iMark = src.indexOf('markLayerSvg(');
  const iPawn = src.indexOf('pawnSvg(roomCrew(');
  assert.ok(iMat > 0 && iZone > 0 && iMark > iMat && iMark > iZone, 'the mark layer must draw last of the floor layers');
  assert.ok(iPawn > iMark, 'the mark layer must draw UNDER the pawns');
});

test('NEGATIVE CONTROL: the wiring scan does not fire on a commented-out call', () => {
  const prose = [
    '// body += markLayerSvg(roomMarkTiles(frame, _focus), _focus);  // reverted, see WP-6',
    '/* an older draft called body += markLayerSvg(roomMarkTiles(f, r), r); here */',
    'const real = 1;',
  ].join('\n');
  assert.doesNotMatch(codeOnly(prose), /body\s*\+=\s*markLayerSvg\(\s*roomMarkTiles\(/,
    'a COMMENTED-OUT call satisfied the wiring scan — the guard would then be green with the layer '
    + 'switched off, which is precisely the defect this repo has shipped four times in one day');
});

test('POSITIVE CONTROL: the wiring scan does fire on the real call, and codeOnly is quote-aware', () => {
  assert.match(codeOnly('  body += markLayerSvg(roomMarkTiles(frame, _focus), _focus);\n'),
    /body\s*\+=\s*markLayerSvg\(\s*roomMarkTiles\(/, 'the scan missed a real call — it is vacuous');
  // a quoted `//` must not swallow the rest of the file (the blinding failure mode)
  const src = 'const u = "http://x//y";\nbody += markLayerSvg(roomMarkTiles(f, r), r);\n';
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
// parse markup, so the chrome nodes are registered by hand and `querySelectorAll` returns nothing —
// which means `_el.toolBtns` is empty and the visual `.on` toggle is NOT proven here. What is proven
// is the state machine and the wire, which is where a designation can go wrong.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-minimap',
  // hud.js writes these unconditionally on a roster/status dispatch (see relations-view.test.js).
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];

/** dom-lite + the four extras roomzoom-view.js needs: innerHTML, querySelector(All), closest,
 *  getBoundingClientRect. Subclassed here so the shared helper keeps its narrow contract. */
class RzEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }            // no markup parser — chrome handles are null-guarded
  querySelectorAll() { return []; }
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
// NOBODY injects a getter? `initRoomZoom` only overrides `_getStockFilter` when handed a function,
// so the un-injected default is unreachable once the real harness below mounts — and the exact
// mutation that hole hides (default → 0, i.e. ACCEPT-NOTHING, a zone that silently refuses every
// item and looks precisely like one nothing has been hauled to yet) survived a fully green suite on
// the Overview until WP-5's review found it. The seam moved here with the verb; so did the probe.
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
const probeApi = RoomZoom.initRoomZoom({ send: (o) => probeSent.push(o) });   // NO getStockFilter
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
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
let rzMask = ACCEPT_ALL;     // the injected accept-mask, read once per committed sweep
// ONE INDIRECTION, and it is load-bearing rather than tidy: `_getStockFilter` is a GETTER, so
// "read once per sweep" and "read once per tile" are indistinguishable while the getter returns a
// constant. Routing through a swappable function lets one test install a getter whose value CHANGES
// on every call, which is the only way to make the per-tile mutation bite.
let rzMaskGet = () => rzMask;
const rzApi = RoomZoom.initRoomZoom({
  send: (o) => rzSent.push(o),
  getStockFilter: () => rzMaskGet(),
});
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
// The SAME capture the pure assertions above run on — so the driven half sees the real wreck
// (`demolishTarget` and every SVG layer read the frame back out of the shared HUD cache, not out of
// a local). NO roster is dispatched: `renderRoster` builds the CONSOLE's CREW WATCH rows, which
// dom-lite cannot host, and the crew layer is not what this package changed.
Hud.renderFrame(wreck);

rzApi.enter('hold');                       // the Overview's own entry point, by anchorName
const rzLayers = rzDoc.getElementById('rz-layers');
const rzCanvas = rzDoc.getElementById('rz-canvas');
const rzRoot = rzDoc.getElementById('roomzoom-view');
// One logical unit per CSS px (fit scale s = 1), so a tile's centre is trivially invertible.
rzLayers._rect = { left: 0, top: 0, width: HOLD.rw * U, height: HOLD.rh * U };

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
  rzSent.length = 0;
  rzMask = ACCEPT_ALL;
  rzMaskGet = () => rzMask;
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
const FIX_DIG = roomMarkTiles(wreck, { ...HOLD, deck: DECK1 }).filter((m) => m.mark === 'dig');

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
// (`querySelectorAll` is stubbed out here, so this reads the innerHTML string, not parsed nodes.)
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
  rzMask = 1 << 3;                                    // FOOD only — NOT the accept-all default
  rzArm('stockpile');
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
  assert.deepEqual(sent, zones.flatMap((o) => paletteOrders('stockpile', o.x, o.y, rzMask)),
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

// MUTATION: move the `const mask = _getStockFilter();` read from above the loop INTO it (i.e.
// `orderPayloads(pc.verb, t.x, t.y, _getStockFilter())`) ⇒ RED.
//
// ⚠️ THIS TEST EXISTS BECAUSE THE OBVIOUS VERSION CANNOT BITE. Asserting "all nine filters carry one
// mask" against a getter that returns a CONSTANT is satisfied by reading it once or nine times —
// they are indistinguishable. So this installs a getter whose value changes on every call. A sweep
// that reads once still paints one mask across the rectangle; a sweep that reads per tile paints
// nine different ones, which on a real client is a zone silently split into nine filters the moment
// anything (a WP-6 chip, a wire rebroadcast) moves the mask under a drag.
test('one sweep reads the mask ONCE — nine tiles cannot end up with nine filters', () => {
  let calls = 0;
  rzMaskGet = () => [1 << 0, 1 << 1, 1 << 2, 1 << 3][calls++ % 4];
  rzArm('stockpile');
  const filters = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 })).filter((o) => o.cmd === 'filter');
  assert.equal(filters.length, 9, 'the sweep did not commit nine filters — this test would be vacuous');
  assert.equal(new Set(filters.map((f) => f.mask)).size, 1,
    `one sweep painted ${new Set(filters.map((f) => f.mask)).size} different masks. The accept-mask ` +
    'getter is being read PER TILE instead of once per committed sweep, so one dragged rectangle can ' +
    'come out wearing several different filters.');
  assert.ok(calls >= 1, 'the getter was never called at all — the mask is not being read');
  assert.equal(calls, 1, `the getter was called ${calls} times for one sweep`);
  rzArm('stockpile');

  // …and a NON-order sweep must not read it at all. A WALL has no business consulting a stockpile
  // accept-filter, and once WP-6 points this getter at live chips an unconditional read is a
  // needless coupling between the build gesture and the zoning UI.
  calls = 0;
  rzArm('wall');
  rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 });
  assert.equal(calls, 0, `a WALL sweep read the stockpile accept-mask ${calls} time(s)`);
  rzArm('wall');
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

// A garbage mask is NOT the same hole as an un-injected one, and both are reachable: the probe covers
// "nobody wired a getter", this covers "the wired getter returned nonsense". Silence is the failure
// that matters — a zone repainted as accept-all that sends no filter keeps its old restriction.
test('a garbage mask still asserts ACCEPT-ALL — the repaint re-asserts the whole truth', () => {
  for (const junk of [undefined, null, NaN, 'nonsense']) {
    rzMask = junk;
    rzArm('stockpile');
    const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }));
    assert.equal(sent.length, 2, `mask=${String(junk)} sent ${sent.length} commands, not the pair — ` +
      'a stockpile paint that says nothing about its filter leaves the tile wearing the last one');
    assert.equal(sent[1].cmd, 'filter');
    assert.equal(sent[1].mask, ACCEPT_ALL, `mask=${String(junk)} painted something other than ACCEPT-ALL`);
    rzArm('stockpile');
  }
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

// The ACCEPTS caption. It is not decoration: the ACCEPTS chips are still on the deprecated console
// (WP-6 brings them to this palette), so the toast is the ONLY place on the standard surface that
// says which filter the sweep just painted — and a zone that silently refuses every item looks
// exactly like one nothing has been hauled to yet. WP-5 shipped this readback on the Overview's hint
// line; it must not simply evaporate because the verb moved.
//
// MUTATION: drop the `accepts` concatenation ⇒ RED. It is worded through the SHARED `acceptsLabel`
// (zone-model.js), which is also what the zone key says, so the two cannot spell one mask two ways —
// asserted by calling that function rather than by re-typing 'FOOD' here.
test('a STOCKPILE sweep says which filter it painted, in the zone key\'s own words', () => {
  const FOOD = 1 << 3;
  rzMask = FOOD;
  rzArm('stockpile');
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

// ── the wiring main.js owns (a declared STRUCTURAL guard, and why it has to be one) ──

// The driven tests above inject `getStockFilter` and prove the palette paints with WHATEVER mask it
// is given. What they cannot reach is the one line in `main.js` that decides what it is given — and
// on the Overview a mutation harness found exactly that hole: deleting `getStockFilter` from the
// `initOverview` call left the whole suite green while every zone silently accepted everything, on a
// client whose ACCEPTS chips are on another surface. The verb moved here, so the guard moved with it;
// `overview-model.test.js` holds the mirror assertion that the Overview is handed NO mask.
//
// It is STRUCTURAL and says so, exactly as `input.test.js` does for the two `installInput` blocks:
// main.js is the composition root, it takes no injection of its own, and importing it would boot a
// WebSocket. Trap 1 is handled — comments are stripped before matching, with a negative control
// below proving a commented-out wiring does NOT satisfy it.
test('main.js wires the Room Zoom palette to the SHARED accept-mask, not to the default', () => {
  const main = readFileSync(join(HERE, '../src/main.js'), 'utf8');
  const WIRE = /getStockFilter:\s*\(\)\s*=>\s*Hud\.getStockFilter\(\)/;
  // `callBlocks` (client/test/code-only.js) brace-matches the argument object over CODE ONLY — a
  // `{` in a comment or a `}` in a string derails a raw walk silently, which is CLAUDE.md trap 1.
  const calls = callBlocks(main, 'initRoomZoom');
  assert.equal(calls.length, 1, 'expected exactly one initRoomZoom({…}) call in main.js, found ' +
    calls.length + ' — this guard reads the first, so a second one would go unchecked');
  const call = calls[0];
  assert.ok(call.includes('send:'), `the initRoomZoom block did not parse (${call.length} chars)`);
  assert.match(call, WIRE,
    'main.js no longer hands the Room Zoom the shared stockpile accept-mask, so every zone painted ' +
    'from the palette falls back to ACCEPT-ALL and paints a filter the player did not choose — ' +
    'silently, because the ACCEPTS chips are on the deprecated console. (WP-6 replaces this getter ' +
    'with chips on this palette; it must not simply be removed.)');
  // NEGATIVE CONTROL — the same scan over a source whose wiring is COMMENTED OUT must FAIL.
  // …every occurrence: main.js wires the SAME getter into the two `installInput` blocks as well, and
  // blinding only the first would leave the initRoomZoom one standing and the control passing for
  // the wrong reason.
  const blinded = main.replace(/^(\s*)(getStockFilter: \(\) => Hud\.getStockFilter\(\),)/gm, '$1// $2');
  assert.notEqual(blinded, main, 'the negative control did not comment anything out — it proves nothing');
  const blindedCalls = callBlocks(blinded, 'initRoomZoom');
  assert.equal(blindedCalls.length, 1, 'the blinded source lost its initRoomZoom call entirely');
  assert.ok(!WIRE.test(blindedCalls[0]),
    'the scan passes on a source where the wiring is COMMENTED OUT, so it proves nothing at all — ' +
    'this is CLAUDE.md trap #1, which shipped in four packages on one day');
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
