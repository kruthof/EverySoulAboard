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
  const calls = [];
  const exec = Object.create(WebGL2Executor.prototype);
  exec.gl = {
    isLost: () => false,
    beginFrame() {}, setBlendMultiply() {}, uploadAtlas() {},
    drawFlat(verts) { calls.push({ fn: 'flat', verts }); },
    drawTextured(verts) { calls.push({ fn: 'tex', verts }); },
  };
  exec._uv = {};
  exec._sig = null;
  exec._statsLoggedAt = Infinity; // suppress the throttled advisory console line
  // Stub ONLY the atlas BAKE (it needs a real 2D canvas). Real packing math, real UV keys.
  exec._ensureAtlas = (passes, useSpr, sprites, raster) => {
    const keys = collectCellKeys(passes, useSpr, raster);
    exec._uv = packAtlas(keys.map((k) => ({ name: k, w: CELL, h: CELL }))).uv;
  };
  exec.calls = calls;
  exec.run = (list, opts) => { calls.length = 0; exec.execute(list, null, opts); return calls; };
  /** Left edge (device px) of the single textured entity quad this frame emitted. */
  exec.quadX = (list, opts) => {
    exec.run(list, opts);
    const tex = calls.filter((c) => c.fn === 'tex' && c.verts.length);
    assert.equal(tex.length, 1, 'expected exactly one textured batch (the pawn)');
    return tex[0].verts[0]; // vertex 0 = the quad's top-left x
  };
  return exec;
}

const stubImg = (name) => ({ width: CELL, height: CELL, name });
const STUB_SPRITES = {
  _c: {},
  usable: () => true,
  get(n) { return this._c[n] || (this._c[n] = stubImg(n)); },
  decoded: () => null, // no walk-frame variants decoded → falls back to the base pawn image
  rotated(n) { return this.get(n); },
  wallVertical() { return this.get('wall'); },
};

/**
 * A Canvas2DExecutor driven against a ctx that records every draw (image + fill) in order, with the
 * rect it covered, through the live transform. Rects are what the occlusion test needs.
 */
function canvasRecorder() {
  const drawn = [];
  const ctx = {
    _m: [1, 0, 0, 1, 0, 0],
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000',
    setTransform(a, b, c, d, e, f) { this._m = [a, b, c, d, e, f]; },
    save() {}, restore() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {},
    _rect(name, px, py, w, h) {
      const s = this._m[0];
      drawn.push({ name, x: s * px + this._m[4], y: s * py + this._m[5], w: s * w, h: s * h });
    },
    fillRect(px, py, w, h) { this._rect('fill', px, py, w, h); },
    drawImage(img, px, py, w, h) { this._rect((img && img.name) || 'img', px, py, w, h); },
  };
  const exec = new Canvas2DExecutor();
  const run = (list, opts) => {
    drawn.length = 0;
    exec.execute(list, ctx, { sprites: STUB_SPRITES, spriteMode: 'on', ...opts });
    return drawn;
  };
  return {
    exec,
    run,
    /** Left edge (device px) of the pawn's own sprite draw. */
    quadX(list, opts) {
      const d = run(list, opts).filter((r) => r.name === 'pawn');
      assert.equal(d.length, 1, 'expected exactly one pawn sprite draw');
      return d[0].x;
    },
  };
}

// A pawn that stepped from (x-dx,y-dy) into (x,y) at t=1000 over an estimated 400 ms interval.
function stepEntry(x, y, dx, dy) {
  return {
    x, y, walking: true, facing: 'E', fromX: x - dx, fromY: y - dy, dx, dy,
    sinceStep: 0, stepMs: 1000, interval: 400, originX: x - dx, originY: y - dy,
  };
}
const DIRS = [
  { name: 'E', dx: 1, dy: 0 }, { name: 'W', dx: -1, dy: 0 },
  { name: 'S', dx: 0, dy: 1 }, { name: 'N', dx: 0, dy: -1 },
];

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
  const entry = stepEntry(20, 9, 1, 0);
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

// ---- pass ordering: nothing may paint over a sliding pawn (playtest: "pawns walking left
//      appear out of nothing") ----

/** A 9x3 corridor of floor with one crew pawn at (cx,1), composed for real. */
function corridorScene(cx) {
  const cells = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 9; x++) {
      if (y === 1 && x === cx) cells.push([64, C.Crew, C.Floor, 0]);   // '@'
      else cells.push([46, C.Floor, C.Floor, 0]);                      // '.'
    }
  }
  const frame = { w: 9, h: 3, lens: 'none', cells, crew: [[cx, 1, 0]] };
  const cam = { x: 4.5, y: 1.5, z: 1, viewW: 1280, viewH: 512, tile: 128 };
  return { frame, cam, list: composeScene(frame, cam, ASSETS) };
}

test('PAWN OCCLUSION INVARIANT: no later draw covers a sliding pawn, in any of the four directions', () => {
  // composeScene emits ops ROW-MAJOR PER TILE. A pawn mid-step is drawn one tile back from the tile
  // it now occupies, so on a westward or northward step the neighbouring tile's opaque floor is
  // emitted LATER and used to paint straight over it (measured: 100% covered at step start). The
  // executors must therefore walk PASSES (terrain, then entities), not the raw list.
  for (const d of DIRS) {
    const cx = 4;
    const { list, cam } = corridorScene(cx);
    const motion = { [cx + ',1']: stepEntry(cx, 1, d.dx, d.dy) };
    const cv = canvasRecorder();
    for (const ms of [1000, 1100, 1200, 1300]) {
      const drawn = cv.run(list, { camera: cam, motion, nowMs: ms, timeSec: 0 });
      const pi = drawn.findIndex((r) => r.name === 'pawn');
      assert.ok(pi >= 0, `${d.name}: the pawn must be drawn`);
      const p = drawn[pi];
      for (let i = pi + 1; i < drawn.length; i++) {
        const o = drawn[i];
        const ov = Math.max(0, Math.min(p.x + p.w, o.x + o.w) - Math.max(p.x, o.x)) *
                   Math.max(0, Math.min(p.y + p.h, o.y + o.h) - Math.max(p.y, o.y));
        assert.equal(ov, 0,
          `${d.name} @${ms}ms: '${o.name}' drawn after the pawn covers ${(100 * ov / (p.w * p.h)).toFixed(0)}% of it`);
      }
    }
  }
});

test('both executors draw ALL terrain before ANY entity (one shared pass order)', () => {
  const { list, cam } = corridorScene(4);
  // canvas2d: every floor draw precedes the pawn draw.
  const cv = canvasRecorder();
  const drawn = cv.run(list, { camera: cam, motion: null, nowMs: null, timeSec: 0 });
  const pawnAt = drawn.findIndex((r) => r.name === 'pawn');
  const lastFloor = drawn.map((r) => r.name).lastIndexOf('floor');
  assert.ok(lastFloor >= 0 && pawnAt > lastFloor, 'canvas2d must finish terrain before entities');
  // webgl2: the terrain batch is uploaded before the entity batch.
  const gl = webglRecorder();
  const calls = gl.run(list, { camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', timeSec: 0 });
  const tex = calls.filter((c) => c.fn === 'tex' && c.verts.length);
  assert.ok(tex.length >= 2, 'expected a terrain batch and an entity batch');
  assert.ok(tex[0].verts.length > tex[tex.length - 1].verts.length,
    'the first textured batch is the big terrain one');
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
