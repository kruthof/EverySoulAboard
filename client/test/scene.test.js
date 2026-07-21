// Scene-correctness tests that assert behaviour (not just golden bytes): the fog/hull invariant,
// wall face/vert logic, lens wash, selection reticle, and camera culling. These are the
// human-readable statements of intent behind the goldens.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeScene } from '../src/render/compose.js';
import { cullRange, tileFromPoint, transform } from '../src/render/camera.js';
import { C } from '../src/render/palette.js';
import {
  loadBootFrame, cameras, deriveLensFrame, deriveSelectionFrame, firstFloorTile, cameraOn, ASSETS,
} from './helpers.js';

const isFog = (cell) => cell[0] === 32 && cell[1] === C.Unknown;

test('FOG INVARIANT: no draw op lands on an unexplored tile with anything but HULL', () => {
  const boot = loadBootFrame();
  const ops = composeScene(boot, cameras(boot).full, ASSETS);
  let fogOps = 0;
  for (const o of ops) {
    const cell = boot.cells[o.y * boot.w + o.x];
    if (cell && isFog(cell)) {
      assert.equal(o.op, 'hull', `fog tile (${o.x},${o.y}) got a non-hull op '${o.op}'`);
      fogOps++;
    }
  }
  assert.ok(fogOps > 0, 'expected the boot frame to contain unexplored (fog) tiles');
});

test('FOG INVARIANT: every visible fog tile emits exactly one hull op and nothing else', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).full;
  const ops = composeScene(boot, cam, ASSETS);
  const { x0, x1, y0, y1 } = cullRange(cam, boot);
  const opsByTile = new Map();
  for (const o of ops) {
    const k = o.x + ',' + o.y;
    (opsByTile.get(k) || opsByTile.set(k, []).get(k)).push(o.op);
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!isFog(boot.cells[y * boot.w + x])) continue;
      const got = opsByTile.get(x + ',' + y) || [];
      assert.deepEqual(got, ['hull'], `fog tile (${x},${y}) ops = ${JSON.stringify(got)}`);
    }
  }
});

test('wall tiles emit wall ops with face/vert flags; interior walls report a face', () => {
  const boot = loadBootFrame();
  const ops = composeScene(boot, cameras(boot).full, ASSETS);
  const walls = ops.filter((o) => o.op === 'wall');
  assert.ok(walls.length > 0, 'expected wall ops');
  for (const w of walls) {
    assert.equal(typeof w.face, 'boolean');
    assert.equal(typeof w.vert, 'boolean');
    assert.equal(boot.cells[w.y * boot.w + w.x][0], 35, 'wall op must sit on a # cell');
  }
  assert.ok(walls.some((w) => w.face), 'expected at least one wall drawn as a panel face');
});

test('lens active produces wash ops over explored tiles only', () => {
  const boot = loadBootFrame();
  const lens = deriveLensFrame(boot);
  const ops = composeScene(lens, cameras(boot).zoomed, ASSETS);
  const washes = ops.filter((o) => o.op === 'wash');
  assert.ok(washes.length > 0, 'expected wash ops with a lens active');
  for (const wsh of washes) {
    assert.equal(wsh.bg, C.LensWarn);
    assert.ok(!isFog(lens.cells[wsh.y * lens.w + wsh.x]), 'wash must never land on a fog tile');
  }
});

test('lens none produces no wash ops (boot fixture carries no lens bg)', () => {
  const boot = loadBootFrame();
  const ops = composeScene(boot, cameras(boot).full, ASSETS);
  assert.equal(ops.filter((o) => o.op === 'wash').length, 0);
});

test('selection emits exactly one trailing reticle op at the selected tile', () => {
  const boot = loadBootFrame();
  const sel = deriveSelectionFrame(boot);
  const t = firstFloorTile(sel);
  const ops = composeScene(sel, cameraOn(sel, t.x, t.y, 1.5), ASSETS);
  const reticles = ops.filter((o) => o.op === 'reticle');
  assert.equal(reticles.length, 1);
  assert.deepEqual([reticles[0].x, reticles[0].y], [t.x, t.y]);
  assert.equal(ops[ops.length - 1].op, 'reticle', 'reticle must be the last (top) op');
});

test('selection reticle is omitted when the selected tile is off-screen', () => {
  const boot = loadBootFrame();
  const sel = deriveSelectionFrame(boot);
  sel.sel = [999, 999]; // far outside the map/cull window
  const ops = composeScene(sel, cameras(boot).zoomed, ASSETS);
  assert.equal(ops.filter((o) => o.op === 'reticle').length, 0);
});

test('camera culling: zoomed emits fewer ops than full and only in-window tiles', () => {
  const boot = loadBootFrame();
  const full = composeScene(boot, cameras(boot).full, ASSETS);
  const camZ = cameras(boot).zoomed;
  const zoomed = composeScene(boot, camZ, ASSETS);
  assert.ok(zoomed.length < full.length, 'zoom should cull');
  const { x0, x1, y0, y1 } = cullRange(camZ, boot);
  for (const o of zoomed) {
    assert.ok(o.x >= x0 && o.x < x1 && o.y >= y0 && o.y < y1, `op outside cull window: ${JSON.stringify(o)}`);
  }
});

test('camera: tileFromPoint inverts the draw transform at the viewport centre', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).zoomed;
  const t = tileFromPoint(cam, cam.viewW / 2, cam.viewH / 2);
  assert.deepEqual([t.x, t.y], [Math.floor(cam.x), Math.floor(cam.y)]);
  const { s } = transform(cam);
  assert.ok(s > 0);
});

test('facing: a chair next to a table turns to serve it (pure turns calc)', () => {
  // Minimal synthetic frame: chair 'h' (104) at (1,0) with a table 't' (116) to its east.
  const frame = {
    w: 3, h: 1, lens: 'none',
    cells: [
      [35, C.Wall, C.Void, 0],   // wall
      [104, C.Item, C.Void, 0],  // chair
      [116, C.Item, C.Void, 0],  // table
    ],
  };
  const cam = { x: 1.5, y: 0.5, z: 1, viewW: 1664, viewH: 520, tile: 128 };
  const ops = composeScene(frame, cam, ASSETS);
  const chair = ops.find((o) => o.op === 'entity' && o.g === 104);
  assert.ok(chair, 'expected a chair entity op');
  assert.equal(chair.role, 'chair');
  // SPRITE_FACING.chair = 'E'; the table is already east, so no turn is needed.
  assert.equal(chair.turns, 0);
});
