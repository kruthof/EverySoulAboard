// Tests for the PURE Room-Zoom view-model (client/src/ui/room-model.js) + the shared deck-minimap
// (client/src/ui/deck-minimap.js). No DOM, no GPU. Proves: the focused-room tile-rect lookup, the
// fit transform + responsive click hit-testing (incl. letterbox-margin + out-of-room rejection),
// the in-room channel clamps (cells → items, crew, designs, decor), the palette tool → command-class
// map (exhaustive over all eleven tools), the demolish classifier + its precedence over every layer,
// the armed-tool reducer, the local decor transforms, and the ESC rung. No test pins a DOM id/class.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  U, ROOM_TOOLS, paletteCommand, nextRoomTool, roomTileRect, deckSlots, roomFit, tileFromCanvasXY,
  clampTileToRoom, roomCells, roomCrew, roomDesigns, roomDecor, itemForGlyph, demolishTarget,
  addDecor, removeDecor, escStackRung,
} from '../src/ui/room-model.js';
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

test('paletteCommand maps every one of the eleven tools to a class + verb', () => {
  const byTool = Object.fromEntries(ROOM_TOOLS.map((t) => [t, paletteCommand(t)]));
  assert.equal(ROOM_TOOLS.length, 11);
  assert.deepEqual(byTool.wall, { cls: 'structural', verb: 'build', kind: 'wall' });
  assert.deepEqual(byTool.door, { cls: 'structural', verb: 'build', kind: 'door' });
  for (const [t, dk] of [['bunk', 'Bed'], ['desk', 'Desk'], ['chair', 'Chair'], ['locker', 'Locker'], ['plant', 'PlantPot'], ['lamp', 'Light']]) {
    assert.equal(byTool[t].cls, 'functional');
    assert.equal(byTool[t].verb, 'place');
    assert.equal(byTool[t].deviceKind, dk);
  }
  assert.deepEqual(byTool.rug, { cls: 'cosmetic', verb: 'decor', itemId: 'rug' });
  assert.deepEqual(byTool.shelf, { cls: 'cosmetic', verb: 'decor', itemId: 'bookshelf' });
  assert.deepEqual(byTool.demolish, { cls: 'demolish', verb: null });
  assert.deepEqual(paletteCommand('nope'), { cls: 'none', verb: null });
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
  const designs = { cells: [[5, 7, 1, 0, 0, 3], [6, 8, 1, 1, 2, 2], [1, 1, 1, 0, 0, 1], [5, 7, 2, 0, 0, 1]] };
  const g = roomDesigns(designs, room);
  assert.equal(g.length, 2); // the out-of-rect and wrong-deck cells drop
  assert.deepEqual(g[0], { x: 5, y: 7, kind: 0, delivered: 0, required: 3 });
  assert.deepEqual(g[1], { x: 6, y: 8, kind: 1, delivered: 2, required: 2 });
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
