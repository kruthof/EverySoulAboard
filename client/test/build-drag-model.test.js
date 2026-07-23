// Tests for the PURE build models: the drag-tiles model (client/src/ui/build-drag-model.js) and the
// material picker (client/src/ui/build-material-model.js). No DOM, no wire. Proves the RimWorld-style
// perimeter/fill/single tile sets, orientation hints, bounds clipping, the single-click degenerate
// case, and the material list ↔ sim-byte ↔ itemId mapping + the active-material reducer.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dragModeForTool, dragRect, buildDragTiles, dragCaption,
} from '../src/ui/build-drag-model.js';
import {
  WALL_MATERIALS, FLOOR_MATERIALS, materialsForTool, toolHasMaterial, materialItemId,
  defaultMaterials, activeMaterial, setMaterial,
} from '../src/ui/build-material-model.js';
import { decodeMaterials } from '../src/wire/messages.js';
import { ITEMS } from '../src/items/index.js';

const key = (t) => t.map((p) => p.x + ',' + p.y).sort().join(' ');

// ---- dragModeForTool ----

test('dragModeForTool maps wall→perimeter, floor→fill, else→single', () => {
  assert.equal(dragModeForTool('wall'), 'perimeter');
  assert.equal(dragModeForTool('floor'), 'fill');
  for (const t of ['door', 'bunk', 'demolish', null, undefined, 'rug']) {
    assert.equal(dragModeForTool(t), 'single');
  }
});

// ---- dragRect ----

test('dragRect normalises corners regardless of drag direction', () => {
  const a = dragRect({ x: 5, y: 9 }, { x: 2, y: 3 });
  assert.deepEqual(a, { x0: 2, y0: 3, x1: 5, y1: 9, w: 4, h: 7 });
  const one = dragRect({ x: 7, y: 7 }, { x: 7, y: 7 });
  assert.deepEqual(one, { x0: 7, y0: 7, x1: 7, y1: 7, w: 1, h: 1 });
});

// ---- single-click degenerate case (the critical "a click still builds one tile") ----

test('start==end yields exactly one tile for every mode', () => {
  for (const mode of ['perimeter', 'fill', 'single']) {
    const r = buildDragTiles({ x: 4, y: 6 }, { x: 4, y: 6 }, mode);
    assert.deepEqual(r.tiles, [{ x: 4, y: 6 }]);
    assert.equal(r.orientation, 'single');
  }
});

test("single mode ignores the start and takes only the end tile", () => {
  const r = buildDragTiles({ x: 1, y: 1 }, { x: 9, y: 3 }, 'single');
  assert.deepEqual(r.tiles, [{ x: 9, y: 3 }]);
});

// ---- perimeter (walls): straight runs + the enclosing ring ----

test('a 1-tall wall drag is a horizontal run in row-major order', () => {
  const r = buildDragTiles({ x: 2, y: 5 }, { x: 5, y: 5 }, 'perimeter');
  assert.deepEqual(r.tiles, [
    { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
  ]);
  assert.equal(r.orientation, 'h');
  assert.equal(dragCaption(r), 'HORIZONTAL RUN · 4 TILES');
});

test('a 1-wide wall drag is a vertical run', () => {
  const r = buildDragTiles({ x: 8, y: 2 }, { x: 8, y: 4 }, 'perimeter');
  assert.deepEqual(r.tiles, [{ x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }]);
  assert.equal(r.orientation, 'v');
});

test('a wide wall drag traces only the perimeter ring (interior stays open)', () => {
  const r = buildDragTiles({ x: 0, y: 0 }, { x: 2, y: 2 }, 'perimeter');
  // 3x3 box: 8 border tiles, the centre (1,1) excluded.
  assert.equal(r.tiles.length, 8);
  assert.ok(!r.tiles.some((p) => p.x === 1 && p.y === 1), 'centre must be open');
  assert.equal(key(r.tiles), key([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 0, y: 1 }, { x: 2, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ]));
  assert.equal(r.orientation, 'rect');
  assert.equal(dragCaption(r), '3×3 · 8 TILES');
});

// ---- fill (floors) ----

test('a floor drag fills the whole rectangle', () => {
  const r = buildDragTiles({ x: 0, y: 0 }, { x: 2, y: 1 }, 'fill');
  assert.equal(r.tiles.length, 6); // 3×2 box, interior included
  assert.equal(r.orientation, 'rect');
  const line = buildDragTiles({ x: 0, y: 0 }, { x: 2, y: 0 }, 'fill');
  assert.equal(line.tiles.length, 3);
  assert.equal(line.orientation, 'h'); // 1-tall fill
  const r2 = buildDragTiles({ x: 0, y: 0 }, { x: 2, y: 2 }, 'fill');
  assert.equal(r2.tiles.length, 9); // interior included
});

// ---- bounds clipping ----

test('bounds clip drops tiles outside the room rect', () => {
  const bounds = { x: 0, y: 0, w: 4, h: 4 };
  const r = buildDragTiles({ x: 2, y: 2 }, { x: 6, y: 6 }, 'fill', bounds);
  assert.ok(r.tiles.every((p) => p.x < 4 && p.y < 4), 'no tile past the bound');
  assert.ok(r.tiles.some((p) => p.x === 3 && p.y === 3), 'in-bounds tile kept');
});

// ---- material model ----

test('material lists have 6 entries each with contiguous 0..5 bytes and real itemIds', () => {
  for (const list of [WALL_MATERIALS, FLOOR_MATERIALS]) {
    assert.equal(list.length, 6);
    assert.deepEqual(list.map((m) => m.mat), [0, 1, 2, 3, 4, 5]);
    for (const m of list) assert.ok(ITEMS[m.id], 'itemId ' + m.id + ' must exist in the registry');
  }
});

test('materialsForTool + toolHasMaterial gate on wall/floor only', () => {
  assert.equal(materialsForTool('wall'), WALL_MATERIALS);
  assert.equal(materialsForTool('floor'), FLOOR_MATERIALS);
  assert.deepEqual(materialsForTool('door'), []);
  assert.equal(toolHasMaterial('wall'), true);
  assert.equal(toolHasMaterial('bunk'), false);
});

test('materialItemId resolves by byte and falls back to the default', () => {
  assert.equal(materialItemId('wall', 2), 'blast-wall');
  assert.equal(materialItemId('floor', 5), 'carpet-floor');
  assert.equal(materialItemId('wall', 99), 'steel-bulkhead'); // unknown → default
  assert.equal(materialItemId('door', 0), '');
});

test('decodeMaterials parses the sparse channel and drops malformed rows', () => {
  const msg = { type: 'materials', cells: [[3, 4, 0, 0, 2], [5, 6, 1, 1, 5], [1], 'x'] };
  assert.deepEqual(decodeMaterials(msg), [
    { x: 3, y: 4, deck: 0, kind: 0, mat: 2 },
    { x: 5, y: 6, deck: 1, kind: 1, mat: 5 },
  ]);
  assert.equal(decodeMaterials({ type: 'nope' }), null);
  assert.equal(decodeMaterials(null), null);
});

test('active-material reducer: set, no-op on bad input, immutability', () => {
  const s0 = defaultMaterials();
  assert.deepEqual(s0, { wall: 0, floor: 0 });
  const s1 = setMaterial(s0, 'wall', 3);
  assert.equal(activeMaterial(s1, 'wall'), 3);
  assert.equal(activeMaterial(s1, 'floor'), 0);
  assert.notEqual(s1, s0);                        // new reference on real change
  assert.equal(setMaterial(s1, 'wall', 3), s1);   // same value → same reference (inert)
  assert.equal(setMaterial(s1, 'door', 1), s1);   // no-material tool → no-op
  assert.equal(setMaterial(s1, 'wall', 42), s1);  // unknown byte → no-op
  assert.equal(activeMaterial(s1, 'door'), 0);
});
