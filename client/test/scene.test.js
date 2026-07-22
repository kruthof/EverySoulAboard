// Scene-correctness tests that assert behaviour (not just golden bytes): the fog/hull invariant,
// wall face/vert logic, lens wash, selection reticle, and camera culling. These are the
// human-readable statements of intent behind the goldens.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeScene } from '../src/render/compose.js';
import {
  cullRange, tileFromPoint, transform, tilePitch, clampCam, zoomAt,
  MAX_TILE_DEVICE_PX,
} from '../src/render/camera.js';
import { C } from '../src/render/palette.js';
import { WebGL2Executor } from '../src/render/webgl2.js';
import { Canvas2DExecutor } from '../src/render/canvas2d.js';
import { collectCellKeys, CELL } from '../src/render/rasterplan.js';
import { packAtlas } from '../src/render/webgl/atlas.js';
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

// ---- pixel-grid alignment (WP-0) ----

test('camera: the tile lattice is quantized to whole device pixels', () => {
  const boot = loadBootFrame();
  // Sweep awkward zooms and off-grid centres — every one must still land on the pixel grid.
  for (const z of [0.5, 0.5625, 0.61, 0.777, 0.9, 1]) {
    for (const cx of [12, 12.5, 28.37, 33.9]) {
      const cam = cameraOn(boot, cx, 9.13, z);
      const p = tilePitch(cam);
      const { s, ox, oy } = transform(cam);
      assert.equal(p, Math.round(p), `pitch not integral at z=${z}`);
      assert.equal(cam.tile * s, p, 'tile * s must be exactly the integer pitch');
      assert.equal(ox, Math.round(ox), `origin x not integral at z=${z} cx=${cx}`);
      assert.equal(oy, Math.round(oy), `origin y not integral at z=${z} cx=${cx}`);
      // …and therefore every tile seam is on a device pixel, arbitrarily far from the centre.
      for (const t of [0, 1, 7, 63, 199]) {
        assert.ok(Number.isInteger(t * p + ox), `tile ${t} seam off-grid at z=${z}: ${t * p + ox}`);
      }
    }
  }
});

// The pawn-slide guard drives the REAL executors. Recomputing the formula in the test would pin
// nothing (a mutation inside webgl2.js/canvas2d.js would sail past it), so each backend is run
// with a recorder in place of its GPU/canvas sink and the emitted DEVICE positions are read back.

/** A WebGL2Executor with only its GPU sink replaced: the position math under test is untouched. */
function webglRecorder() {
  const batches = [];
  const exec = Object.create(WebGL2Executor.prototype);
  exec.gl = {
    isLost: () => false,
    beginFrame() {}, drawFlat() {}, setBlendMultiply() {}, uploadAtlas() {},
    drawTextured(verts) { batches.push(verts); },
  };
  exec._uv = {};
  exec._sig = null;
  exec._statsLoggedAt = Infinity; // suppress the throttled advisory console line
  // Stub ONLY the atlas BAKE (it needs a real 2D canvas). Real packing math, real UV keys.
  exec._ensureAtlas = (passes, useSpr, sprites, raster) => {
    const keys = collectCellKeys(passes, useSpr, raster);
    exec._uv = packAtlas(keys.map((k) => ({ name: k, w: CELL, h: CELL }))).uv;
  };
  /** Left edge (device px) of the single textured quad this frame emitted. */
  exec.quadX = (list, opts) => {
    batches.length = 0;
    exec.execute(list, null, opts);
    const tex = batches.find((b) => b.length);
    assert.ok(tex, 'expected the executor to emit a textured quad for the pawn');
    return tex[0]; // vertex 0 = the quad's top-left x
  };
  return exec;
}

const STUB_IMG = { width: CELL, height: CELL };
const STUB_SPRITES = {
  usable: () => true,
  get: () => STUB_IMG,
  decoded: () => null, // no walk-frame variants decoded → falls back to the base pawn image
  rotated: () => STUB_IMG,
  wallVertical: () => STUB_IMG,
};

/** A Canvas2DExecutor driven against a ctx that records drawImage through the live transform. */
function canvasRecorder() {
  const drawn = [];
  const ctx = {
    _m: [1, 0, 0, 1, 0, 0],
    setTransform(a, b, c, d, e, f) { this._m = [a, b, c, d, e, f]; },
    save() {}, restore() {}, clearRect() {}, fillRect() {}, beginPath() {}, rect() {}, clip() {},
    drawImage(_img, px, py) { drawn.push(this._m[0] * px + this._m[4]); },
  };
  const exec = new Canvas2DExecutor();
  return {
    quadX(list, opts) {
      drawn.length = 0;
      exec.execute(list, ctx, { ...opts, sprites: STUB_SPRITES, spriteMode: 'on' });
      assert.equal(drawn.length, 1, 'expected exactly one sprite draw for the pawn');
      return drawn[0];
    },
  };
}

test('PAWN SLIDE INVARIANT: both executors emit a continuous sub-pixel glide under the snapped grid', () => {
  // The grid snap must never reach the pawn. A pawn mid-step is DRAWN by the executors at
  // `(tileIndex + slide) * pitch + origin`: the slide is a float added BEFORE the pitch multiply,
  // so successive animation frames must land at distinct, strictly advancing, non-integral device
  // positions, and one step must cover a whole tile pitch. Rounding the pawn's own position, or
  // applying the slide AFTER the multiply, breaks one of those and fails here. This is the guard
  // on b770e88's continuous glide — keep it driving real executors, never a re-derived formula.
  const boot = loadBootFrame();
  const cam = cameraOn(boot, 20, 9, 0.9);
  const p = tilePitch(cam), { ox } = transform(cam);
  // A pawn that stepped 19→20 at t=1000 and glides over its estimated 400 ms interval.
  const entry = {
    x: 20, y: 9, walking: true, facing: 'E', fromX: 19, fromY: 9, dx: 1, dy: 0,
    sinceStep: 0, stepMs: 1000, interval: 400, originX: 19, originY: 9,
  };
  const motion = { '20,9': entry };
  const list = [{ op: 'entity', x: 20, y: 9, g: 64 /* '@' */, fg: C.Crew, role: null, turns: 0, pv: 0 }];
  const gl = webglRecorder(), cv = canvasRecorder();
  const frameOpts = (nowMs) => ({ camera: cam, motion, nowMs, timeSec: 0 });

  // Sample the step finely enough that ANY rounding to whole device pixels must stall the glide:
  // 2 ms apart is ~0.58 device px, so a rounded position would repeat instead of advance.
  const xs = [];
  for (let ms = 1000; ms < 1400; ms += 2) {
    const x = gl.quadX(list, frameOpts(ms));
    // 1e-3 not 0: the GL quad comes back through a Float32Array, so it carries float32 rounding
    // (~6e-5 at these magnitudes) that the canvas path's float64 arithmetic does not.
    assert.ok(Math.abs(cv.quadX(list, frameOpts(ms)) - x) < 1e-3,
      `canvas2d and webgl2 must place the pawn identically at t=${ms}`);
    xs.push(x);
  }
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] > xs[i - 1], `slide must advance every frame (frame ${i}: ${xs[i - 1]} → ${xs[i]})`);
  }
  assert.ok(xs.filter((v) => v % 1 !== 0).length > xs.length / 2,
    'a continuous slide is mostly sub-pixel; whole-pixel positions mean the pawn was snapped');
  // The step covers ~one whole tile pitch — the slide is in TILE units, multiplied by the pitch.
  const travel = xs[xs.length - 1] - xs[0];
  assert.ok(travel > 0.9 * p && travel < p, `one step should traverse ~one tile pitch, got ${travel}/${p}`);
  // …and arrival settles exactly on the (integral) tile lattice.
  const settled = gl.quadX(list, frameOpts(1400));
  assert.equal(settled, 20 * p + ox, 'arrival settles onto the tile');
  assert.equal(settled, Math.round(settled), 'a settled pawn sits on the device-pixel grid');
});

test('camera: zoom is capped at MAX_TILE_DEVICE_PX — never upscale past the source art', () => {
  const boot = loadBootFrame();
  for (const tile of [128, 26]) {
    const cam = { x: 20, y: 9, z: 99, viewW: 1664, viewH: 520, tile };
    clampCam(cam, boot);
    assert.ok(cam.tile * cam.z <= MAX_TILE_DEVICE_PX + 1e-9,
      `zoom ceiling breached: ${cam.tile * cam.z} device px/tile`);
    assert.equal(tilePitch(cam), MAX_TILE_DEVICE_PX, 'the cap is reachable, not merely a limit');
    // …and repeated zoom-in gestures cannot creep past it.
    for (let i = 0; i < 20; i++) zoomAt(cam, boot, 832, 260, 1.2);
    assert.ok(cam.tile * cam.z <= MAX_TILE_DEVICE_PX + 1e-9, 'zoomAt breached the ceiling');
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
