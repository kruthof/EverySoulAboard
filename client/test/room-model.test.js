// Tests for the PURE Room-Zoom view-model (client/src/ui/room-model.js) + the shared deck-minimap
// (client/src/ui/deck-minimap.js). No DOM, no GPU. Proves: the focused-room tile-rect lookup, the
// fit transform + responsive click hit-testing (incl. letterbox-margin + out-of-room rejection),
// the in-room channel clamps (cells → items, crew, designs, decor), the palette tool → command-class
// map (exhaustive over all eleven tools), the demolish classifier + its precedence over every layer,
// the armed-tool reducer, the local decor transforms, and the ESC rung. No test pins a DOM id/class.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  U, ROOM_TOOLS, paletteCommand, isStructuralTool, roomMaterialTiles, nextRoomTool, roomTileRect, deckSlots, roomFit, tileFromCanvasXY,
  clampTileToRoom, roomCells, roomCrew, roomDesigns, roomDecor, itemForGlyph, demolishTarget,
  addDecor, removeDecor, escStackRung, roomMarkTiles, markLayerSvg,
} from '../src/ui/room-model.js';
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

test('paletteCommand maps every one of the twelve tools to a class + verb', () => {
  const byTool = Object.fromEntries(ROOM_TOOLS.map((t) => [t, paletteCommand(t)]));
  assert.equal(ROOM_TOOLS.length, 12);
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
  assert.deepEqual(paletteCommand('nope'), { cls: 'none', verb: null });
  // isStructuralTool: wall/floor/door drag-build; everything else false.
  for (const t of ['wall', 'floor', 'door']) assert.equal(isStructuralTool(t), true);
  for (const t of ['bunk', 'rug', 'demolish', null, 'nope']) assert.equal(isStructuralTool(t), false);
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
// into). The scan therefore runs over COMMENT-STRIPPED source — `codeOnly` is copied verbatim from
// client/test/surface-boundary.test.js:205 rather than re-derived, because a stripper that is not
// string-literal aware is blinded by a quoted `//` and silently passes everything after it. The two
// controls below test the stripper instead of trusting it.

/** Strip JS comments, STRING-LITERAL AWARE. Copied verbatim from surface-boundary.test.js:205 —
 *  see the note there for what each branch is defending against. */
function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;          // drop to EOL, keep the \n
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
    } else if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        const done = src[i] === q || (q !== '`' && src[i] === '\n');
        i += 1;
        if (done) break;
      }
    } else {
      out += c; i += 1;
    }
  }
  return out;
}

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
