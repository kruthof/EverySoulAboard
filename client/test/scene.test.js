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
import {
  buildLightMesh, shadowQuad, sampleQuad, SHADOW_ALPHA, SHADOW_SQUASH, MESH_STRIDE,
} from '../src/render/lightfield.js';
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

test('CULL INVARIANT: the window keeps a tile of slack, so a sliding pawn is never composed out', () => {
  // A pawn mid-step is DRAWN one tile back from the tile it occupies. A tile-EXACT window therefore
  // drops a pawn whose tile has just crossed the edge while up to a whole tile of its body is still
  // on screen — a one-tile-early disappearance at every edge, in every direction, and the only
  // mechanism that can blink a SOUTH-bound pawn (the entity-order defect is structurally W/N only).
  const boot = loadBootFrame();
  const cam = cameraOn(boot, 20, 9, 0.9);
  const { x0, x1, y0, y1 } = cullRange(cam, boot);
  const p = tilePitch(cam), { ox, oy } = transform(cam);
  // For each edge: the tile JUST outside it, whose slid body reaches back into the viewport.
  const edges = [
    ['right', x1 - 1, (x1 - 1) * p + ox, cam.viewW],
    ['left', x0, x0 * p + ox, cam.viewW],
    ['bottom', y1 - 1, (y1 - 1) * p + oy, cam.viewH],
    ['top', y0, y0 * p + oy, cam.viewH],
  ];
  for (const [name, tile, start, extent] of edges) {
    // the outermost COMPOSED tile must itself be off-screen: that is the slack, and it is what a
    // pawn sliding out of (or into) view needs in order to keep being drawn.
    assert.ok(start + p <= 0 || start >= extent,
      `${name}: the cull window must extend a full tile past the viewport (tile ${tile} spans ` +
      `${start}..${start + p} of 0..${extent})`);
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
  const blends = [];   // setBlendMultiply(on) calls, with the draw index they landed at
  const exec = Object.create(WebGL2Executor.prototype);
  exec.gl = {
    isLost: () => false,
    beginFrame() {}, uploadAtlas() {},
    setBlendMultiply(on) { blends.push({ on, at: calls.length }); },
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
  exec.blends = blends;
  exec.run = (list, opts) => {
    calls.length = 0; blends.length = 0;
    exec.execute(list, null, opts);
    return calls;
  };
  /** Left edge (device px) of the ENTITY quad this frame emitted. A grounding shadow uses the same
   *  cell and the same UVs and is told apart by its vertex tint: black (r=0) vs white (r=alpha). */
  exec.quadX = (list, opts) => {
    exec.run(list, opts);
    const tex = calls.filter((c) => c.fn === 'tex' && c.verts.length && c.verts[4] !== 0);
    assert.equal(tex.length, 1, 'expected exactly one non-shadow textured batch (the pawn)');
    return tex[0].verts[0]; // vertex 0 = the quad's top-left x
  };
  /** The black (shadow) textured batch, or null when none was emitted. */
  exec.shadowBatch = () => {
    const s = calls.filter((c) => c.fn === 'tex' && c.verts.length && c.verts[4] === 0);
    return s.length ? s[0].verts : null;
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
 * A Canvas2DExecutor driven against a ctx that records every draw (image + fill) in order, through
 * the live transform — including `transform()`, `save()`/`restore()`, the composite mode and the
 * alpha. The grounding shadow is drawn under a SHEARED matrix, so the recorder keeps the four
 * transformed corners (`c`) as well as the axis-aligned bounding rect the occlusion test needs.
 */
function canvasRecorder() {
  const drawn = [];
  /** m ∘ n (both [a,b,c,d,e,f]) — canvas `transform()` post-multiplies the current matrix. */
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const ctx = {
    _m: [1, 0, 0, 1, 0, 0],
    _stack: [],
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000',
    setTransform(a, b, c, d, e, f) { this._m = [a, b, c, d, e, f]; },
    transform(a, b, c, d, e, f) { this._m = mul(this._m, [a, b, c, d, e, f]); },
    // translate/scale are how the pawn mirror is expressed; they must compose like the real ctx or
    // the recorder would silently record an unmirrored draw.
    translate(x, y) { this._m = mul(this._m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { this._m = mul(this._m, [x, 0, 0, y, 0, 0]); },
    save() { this._stack.push([this._m.slice(), this.globalAlpha, this.globalCompositeOperation]); },
    restore() {
      const s = this._stack.pop();
      if (s) { [this._m, this.globalAlpha, this.globalCompositeOperation] = s; }
    },
    // Procedural (vector) painters draw with these; they cover no measurable rect, and the
    // occlusion/shadow tests only care about the bitmap draws, so they are recorded as no-ops.
    clearRect() {}, beginPath() {}, rect() {}, clip() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    stroke() {}, fill() {}, strokeRect() {}, createLinearGradient() {
      return { addColorStop() {} };
    },
    _rect(name, px, py, w, h) {
      const m = this._m;
      const pt = (u, v) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
      const c = [pt(px, py), pt(px + w, py), pt(px + w, py + h), pt(px, py + h)];
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      drawn.push({
        name, c, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y,
        alpha: this.globalAlpha, gco: this.globalCompositeOperation, style: this.fillStyle,
      });
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
    ctx,
    run,
    /** Left edge (device px) of the pawn's own sprite draw. */
    quadX(list, opts) {
      const d = run(list, opts).filter((r) => r.name === 'pawn');
      assert.equal(d.length, 1, 'expected exactly one pawn sprite draw');
      return d[0].x;
    },
  };
}

// A pawn that stepped from (fromX,fromY) into (x,y) at t=1000 over an estimated 400 ms interval.
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

/** A 9x3 corridor of floor with one crew pawn at (cx,1) — and optionally a '*' lamp, a PROCEDURAL
 *  (sprite-less) glyph, and a RING of growbeds on the pawn's four neighbours — composed for real.
 *  `lamp` places a Light device so the light field has a pool to build; `proc` places an open door
 *  '/', which both backends draw as vector strokes rather than a bitmap; `ring` puts a bitmap
 *  ENTITY on every tile a step can come from, which is what the second occlusion mechanism needs
 *  (a device only reappears on the tile a pawn has just vacated — while the pawn stood there the
 *  citizen glyph masked it). */
function corridorScene(cx, lamp = -1, proc = -1, ring = false) {
  const nb = ring
    ? new Set([(cx - 1) + ',1', (cx + 1) + ',1', cx + ',0', cx + ',2'])
    : new Set();
  const cells = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 9; x++) {
      if (y === 1 && x === cx) cells.push([64, C.Crew, C.Floor, 0]);          // '@'
      else if (nb.has(x + ',' + y)) cells.push([34, C.Device, C.Floor, 0]);   // '"' growbed
      else if (y === 0 && x === lamp) cells.push([42, C.Device, C.Floor, 0]); // '*'
      else if (y === 2 && x === proc) cells.push([47, C.Device, C.Floor, 0]); // '/' open door
      else cells.push([46, C.Floor, C.Floor, 0]);                            // '.'
    }
  }
  const frame = { w: 9, h: 3, lens: 'none', cells, crew: [[cx, 1, 0]] };
  const cam = { x: 4.5, y: 1.5, z: 1, viewW: 1280, viewH: 512, tile: 128 };
  return { frame, cam, list: composeScene(frame, cam, ASSETS) };
}

/** Axis-aligned overlap area of two recorded rects. */
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                          Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The UV rect of whichever pawn cell this frame baked ('spr:pawn', or a walk-frame variant of it
 *  when the walk hold is on). Identifying the pawn by its atlas cell keeps the assertions free of
 *  any re-derivation of the slide/mirror maths the executors own. */
function pawnUv(gl) {
  const key = Object.keys(gl._uv).find((k) => k.startsWith('spr:pawn'));
  assert.ok(key, 'the atlas must contain a pawn cell');
  return gl._uv[key];
}

/** Every TEXTURED quad the webgl2 recorder emitted, in DRAW order (batch order, then vertex order),
 *  as {x,y,w,h,u0}. Shadows (black tint, r === 0) are excluded — they are their own pass. Terrain
 *  is included: it is drawn first, so anything AFTER the pawn's index is an entity. */
function glTexQuads(calls) {
  const out = [];
  for (const c of calls) {
    if (c.fn !== 'tex' || !c.verts.length || c.verts[4] === 0) continue;
    for (let q = 0; q + 48 <= c.verts.length; q += 48) {
      // TRI = [0,1,2,0,2,3] → vertices 0 and 2 of each quad are TL and BR.
      const x0 = c.verts[q], y0 = c.verts[q + 1], x2 = c.verts[q + 16], y2 = c.verts[q + 17];
      out.push({ x: Math.min(x0, x2), y: Math.min(y0, y2), w: Math.abs(x2 - x0), h: Math.abs(y2 - y0), u0: c.verts[q + 2] });
    }
  }
  return out;
}

test('PAWN OCCLUSION INVARIANT: no later draw covers a sliding pawn, in any of the four directions', () => {
  // composeScene emits ops ROW-MAJOR PER TILE, and the entity PASS is still row-major inside itself.
  // A pawn mid-step is drawn one tile back from the tile it now occupies, so on a westward or
  // northward step the tile it came from is emitted LATER — first as the neighbour's opaque floor
  // (100% covered at step start, fixed by the pass split) and then, once a device or a second pawn
  // sits on that tile, as an ENTITY (measured on the real executors: 69% covered by one growbed,
  // 45% by a pawn; E and S were clean in all 16 neighbour configurations). Both executors must
  // therefore walk PASSES, and draw sliding pawns after every settled entity.
  //
  // `ring` is the load-bearing half: with it false this passes on the pass split alone.
  for (const ring of [false, true]) {
    for (const d of DIRS) {
      const cx = 4;
      const { list, cam } = corridorScene(cx, -1, -1, ring);
      const motion = { [cx + ',1']: stepEntry(cx, 1, d.dx, d.dy) };
      const cv = canvasRecorder();
      for (const ms of [1000, 1100, 1200, 1300]) {
        const tag = `${d.name}${ring ? '+ring' : ''} @${ms}ms`;
        const drawn = cv.run(list, { camera: cam, motion, nowMs: ms, timeSec: 0 });
        const pi = drawn.findIndex((r) => r.name === 'pawn');
        assert.ok(pi >= 0, `${tag}: the pawn must be drawn`);
        const p = drawn[pi];
        for (let i = pi + 1; i < drawn.length; i++) {
          const ov = overlap(p, drawn[i]);
          assert.equal(ov, 0,
            `${tag}: '${drawn[i].name}' drawn after the pawn covers ${(100 * ov / (p.w * p.h)).toFixed(0)}% of it`);
        }

        // …and the SAME invariant on the GL path, read off the vertex stream (batch order is draw
        // order). Without the moving sub-batch the pawn quad sits mid-array and the growbed quad
        // that follows it overlaps — the two backends would disagree about who is on top.
        const gl = webglRecorder();
        const quads = glTexQuads(gl.run(list, {
          camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', motion, nowMs: ms, timeSec: 0,
        }));
        // Find the pawn by the ATLAS CELL it samples (u0 of 'spr:pawn'), never by recomputing its
        // position — the slide formula lives in the executor and must not be mirrored into a test.
        const pu = pawnUv(gl);
        const gi = quads.findIndex((q) => q.u0 === pu.u0 || q.u0 === pu.u1);
        assert.ok(gi >= 0, `${tag}: webgl2 must emit a pawn quad`);
        for (let i = gi + 1; i < quads.length; i++) {
          assert.equal(overlap(quads[gi], quads[i]), 0,
            `${tag}: webgl2 draws a quad over the sliding pawn (index ${i} of ${quads.length})`);
        }
      }
    }
  }
});

test('FACING: both executors mirror a westbound pawn, and neither mirrors its shadow\'s lean', () => {
  // The art is one east-facing profile, so the mirror IS the facing. Two things must hold together:
  //   (a) the pawn and its grounding shadow both carry the mirror — a mirrored body over an
  //       unmirrored silhouette reads as two different people;
  //   (b) the shadow QUAD does not move. Its corners encode AD-3's single light direction (315°,
  //       55° → down-RIGHT); mirroring them would swing every shadow across the floor the moment a
  //       pawn turned, i.e. two light sources. So the flip is a source/UV operation only.
  const cx = 4;
  const { list, cam } = corridorScene(cx);
  // The SAME westward step twice, differing only in the mirror — so any position change measured
  // below is the flip's doing and not the slide's.
  const east = stepEntry(cx, 1, -1, 0);                      // flipX undefined → unmirrored
  const west = { ...east, flipX: true };
  const opts = (m) => ({
    camera: cam, sprites: STUB_SPRITES, spriteMode: 'on',
    motion: { [cx + ',1']: m }, nowMs: 1100, timeSec: 0,
  });

  // --- canvas2d: the recorder keeps the four TRANSFORMED corners, so a mirror shows up as a
  //     corner order that runs right-to-left, and as an unchanged bounding box.
  const cvE = withSilhouettes(canvasRecorder()).run(list, opts(east));
  const cvW = withSilhouettes(canvasRecorder()).run(list, opts(west));
  const pick = (d, name) => d.find((r) => r.name === name);
  const pE = pick(cvE, 'pawn'), pW = pick(cvW, 'pawn');
  assert.ok(pE.c[1][0] > pE.c[0][0], 'unmirrored: the cell\'s left corner draws on the left');
  assert.ok(pW.c[1][0] < pW.c[0][0], 'canvas2d must MIRROR a westbound pawn (it moonwalks otherwise)');
  assert.ok(Math.abs(pW.x - pE.x) < 1e-9 && Math.abs(pW.w - pE.w) < 1e-9,
    `a mirrored pawn must not jump: ${pW.x}/${pW.w} vs ${pE.x}/${pE.w}`);
  const sE = pick(cvE, 'sil'), sW = pick(cvW, 'sil');
  assert.ok(sW.c[1][0] < sW.c[0][0], 'the shadow silhouette must mirror WITH the pawn');
  // …but the parallelogram itself is untouched: same bbox, and its top edge still leans RIGHT.
  assert.ok(Math.abs(sW.x - sE.x) < 1e-9 && Math.abs(sW.w - sE.w) < 1e-9,
    'the shadow QUAD must not mirror — that would move the light source');
  // The parallelogram is the SAME four points either way — the flip only permutes which source
  // corner lands on which of them. Compare them as a set, and pin the unflipped one to shadowQuad.
  const key = (c) => c.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).sort().join(' ');
  assert.equal(key(sW.c), key(sE.c), 'a flipped pawn must cast the SAME parallelogram');
  const want = shadowQuad(pE.c[0][0], pE.c[0][1], pE.w);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(sE.c[i][0] - want[i * 2]) < 1e-6 && Math.abs(sE.c[i][1] - want[i * 2 + 1]) < 1e-6,
      `shadow corner ${i} must be shadowQuad's — the one authority on the light direction`);
  }
  // …and it still leans DOWN-RIGHT: the top edge is to the right of the bottom edge (AD-3).
  for (const [s, label] of [[sE, 'unflipped'], [sW, 'flipped']]) {
    const byY = s.c.slice().sort((a, b) => a[1] - b[1]);
    const topX = (byY[0][0] + byY[1][0]) / 2, botX = (byY[2][0] + byY[3][0]) / 2;
    assert.ok(topX - botX > 0.1 * pE.w,
      `${label}: the shadow must lean down-RIGHT whichever way the pawn faces (${topX - botX})`);
  }

  // --- webgl2: the mirror is a u0↔u1 swap inside the SAME cell rect (no new atlas cell), and the
  //     shadow quad's positions must still be shadowQuad's.
  const runGl = (m) => { const g = webglRecorder(); g.run(list, opts(m)); return g; };
  const gE = runGl(east), gW = runGl(west);
  const uv = pawnUv(gE);
  const pawnQuad = (g) => glTexQuads(g.calls).find((q) => q.u0 === uv.u0 || q.u0 === uv.u1);
  const qE = pawnQuad(gE), qW = pawnQuad(gW);
  assert.ok(qE && qW, 'both runs must emit a pawn quad');
  assert.equal(qE.u0, uv.u0, 'unmirrored: the quad starts at the cell\'s left edge');
  assert.equal(qW.u0, uv.u1, 'webgl2 must sample the cell right-to-left for a westbound pawn');
  assert.ok(Math.abs(qW.x - qE.x) < 1e-3 && Math.abs(qW.w - qE.w) < 1e-3,
    'a UV flip must not move the quad — it stays inside the same cell rect (ATLAS_BORDER intact)');
  const shE = gE.shadowBatch(), shW = gW.shadowBatch();
  assert.ok(shW[2] > shE[2], 'the shadow batch must carry the same UV flip');
  for (let v = 0; v < 6; v++) {
    assert.equal(shW[v * 8], shE[v * 8], `shadow vertex ${v} x must not move when the pawn flips`);
    assert.equal(shW[v * 8 + 1], shE[v * 8 + 1], `shadow vertex ${v} y must not move`);
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

// ---- WP-1: grounding drop shadows ----

/** Inject the offscreen-canvas factory the browser path uses (node has no DOM), so `_silhouette`
 *  can build a shadow bitmap. The stub records as name 'sil'. */
function withSilhouettes(cv) {
  cv.exec._makeCanvas = (w, h) => ({
    width: w, height: h, name: 'sil',
    getContext: () => ({
      clearRect() {}, drawImage() {}, fillRect() {},
      globalCompositeOperation: '', fillStyle: '',
    }),
  });
  return cv;
}

test('GROUNDING SHADOW: webgl2 pushes a black squashed+sheared copy BEFORE the entity batch', () => {
  const { list, cam } = corridorScene(4);
  const gl = webglRecorder();
  const calls = gl.run(list, { camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', timeSec: 0 });
  const shadow = gl.shadowBatch();
  assert.ok(shadow, 'expected a shadow batch');
  // ...pure black at SHADOW_ALPHA, with the sprite's own alpha shape carried by the texture.
  assert.deepEqual([shadow[4], shadow[5], shadow[6]], [0, 0, 0], 'a shadow is black, never tinted');
  assert.ok(Math.abs(shadow[7] - SHADOW_ALPHA) < 1e-6, `shadow alpha ${shadow[7]} != ${SHADOW_ALPHA}`);
  // Batch order is terrain(tex) → shadows(tex, black) → entities(tex) → overlay(empty).
  const texIdx = calls.map((c, i) => ({ c, i })).filter((e) => e.c.fn === 'tex' && e.c.verts.length);
  const sIdx = texIdx.find((e) => e.c.verts[4] === 0).i;
  const eIdx = texIdx.filter((e) => e.c.verts[4] !== 0).pop().i;
  assert.ok(sIdx < eIdx, 'shadows must be drawn under the whole entity batch');
  const entityVerts = calls[eIdx].verts;
  assert.equal(entityVerts.length, 6 * 8, 'one entity quad in this scene');
  // ...the shadow samples the SAME UVs as the entity (no new atlas cell)...
  assert.deepEqual([shadow[2], shadow[3]], [entityVerts[2], entityVerts[3]], 'same UVs, same cell');
  // ...and its four positions are exactly shadowQuad's, which is NOT an offset copy of the entity
  // quad: it is 45% as tall, anchored at the foot line, and leaning down-light. TRI = [0,1,2,0,2,3]
  // so vertices 0,1,2,5 of the batch are the quad's TL,TR,BR,BL.
  const D = entityVerts[8] - entityVerts[0]; // TR.x - TL.x of the entity quad = the cell side
  const want = shadowQuad(entityVerts[0], entityVerts[1], D);
  for (const [vi, ci, label] of [[0, 0, 'TL'], [1, 1, 'TR'], [2, 2, 'BR'], [5, 3, 'BL']]) {
    assert.ok(Math.abs(shadow[vi * 8] - want[ci * 2]) < 1e-2, `${label}.x`);
    assert.ok(Math.abs(shadow[vi * 8 + 1] - want[ci * 2 + 1]) < 1e-2, `${label}.y`);
  }
  const sq = { x0: shadow[0], y0: shadow[1], x1: shadow[8], y1: shadow[9], bx: shadow[40], by: shadow[41] };
  assert.ok(Math.abs((sq.by - sq.y0) / D - SHADOW_SQUASH) < 1e-6,
    `a shadow is squashed onto the ground: height ${(sq.by - sq.y0) / D} of a cell, want ${SHADOW_SQUASH}`);
  assert.ok((sq.x0 - sq.bx) / D > 0.1,
    'the top of the shadow must LEAN down-light — an unsheared copy reads as a second sprite');
});

test('GROUNDING SHADOW: canvas2d draws the SAME parallelogram webgl2 does, under the entity', () => {
  const { list, cam } = corridorScene(4);
  const cv = withSilhouettes(canvasRecorder());
  const drawn = cv.run(list, { camera: cam, motion: null, nowMs: null, timeSec: 0 });
  const sil = drawn.filter((r) => r.name === 'sil');
  const pawn = drawn.find((r) => r.name === 'pawn');
  assert.equal(sil.length, 1, 'exactly one grounding shadow for the one sprite entity');
  assert.ok(drawn.indexOf(sil[0]) < drawn.indexOf(pawn), 'the shadow goes under the entity');
  // The recorder composes ctx.transform(), so sil[0].c holds the four DEVICE-space corners the
  // sheared draw actually covered. They must equal shadowQuad over the pawn's own cell — the
  // single shared authority both backends derive from.
  const want = shadowQuad(pawn.c[0][0], pawn.c[0][1], pawn.w);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(sil[0].c[i][0] - want[i * 2]) < 1e-6, `corner ${i} x`);
    assert.ok(Math.abs(sil[0].c[i][1] - want[i * 2 + 1]) < 1e-6, `corner ${i} y`);
  }
  // ...and the shadow is genuinely SHORTER than the thing casting it (an offset full-size copy —
  // the artefact this replaced — would have sil[0].h === pawn.h).
  assert.ok(sil[0].h < pawn.h * (SHADOW_SQUASH + 0.01),
    `a shadow must be squashed onto the ground: ${sil[0].h} vs caster ${pawn.h}`);
  assert.ok(sil[0].w > pawn.w * 1.1, 'and sheared, so it is WIDER than the cell it stands in');
  assert.ok(Math.abs(sil[0].alpha - SHADOW_ALPHA) < 1e-9, 'drawn at SHADOW_ALPHA');
});

test('GROUNDING SHADOW: a procedural (sprite-less) glyph casts none, in EITHER backend', () => {
  // Canvas2D shadows a bitmap by silhouetting it; a procedural vector glyph (open door, loose
  // item, sprites-off mode) has no bitmap to silhouette, so it CANNOT cast one there. If the GL
  // path shadowed its baked proc cell anyway the two backends would disagree about what is in the
  // scene — and a few thin strokes silhouetted solid black is an ink blot, not a shadow.
  const { list, cam } = corridorScene(4, -1, 6);
  const procOps = list.filter((o) => o.op === 'entity' && o.g === 47);
  assert.equal(procOps.length, 1, 'the fixture must actually contain a procedural entity');

  const gl = webglRecorder();
  gl.run(list, { camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', timeSec: 0 });
  const shadow = gl.shadowBatch();
  assert.ok(shadow, 'the PAWN still casts one');
  assert.equal(shadow.length, 6 * 8,
    `expected exactly ONE shadow quad (the pawn), got ${shadow.length / (6 * 8)} — the ` +
    'procedural glyph cast one too, which canvas2d can never match');

  // …and canvas2d agrees: one silhouette draw, not two.
  const cv = withSilhouettes(canvasRecorder());
  const drawn = cv.run(list, { camera: cam, motion: null, nowMs: null, timeSec: 0 });
  assert.equal(drawn.filter((r) => r.name === 'sil').length, 1, 'canvas2d shadows only the pawn');
});

// ---- WP-3: the light mesh replaces the flat per-tile overlay in BOTH executors ----

test('LIGHT MESH: both executors consume the gradient mesh and skip the flat per-tile overlay', () => {
  // A corridor with a lamp at (2,0), so the field genuinely varies across and within tiles.
  const { frame, cam } = corridorScene(4, 2);
  const litList = composeScene(frame, cam, ASSETS, new Uint8Array(frame.w * frame.h).fill(4));
  const mesh = buildLightMesh(litList, frame);
  assert.ok(mesh.count > 0, 'expected a mesh over the corridor');

  // webgl2: ONE flat batch of 6 verts per quad, and its corners carry DIFFERENT colours — which
  // the legacy flat-overlay path (one colour per quad) cannot produce at any tile.
  const gl = webglRecorder();
  const withMesh = gl.run(litList,
    { camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', timeSec: 0, lightMesh: mesh });
  const meshBatch = withMesh.filter((c) => c.fn === 'flat' && c.verts.length === mesh.count * 6 * 8);
  assert.equal(meshBatch.length, 1, 'expected exactly one light-mesh batch');
  const v = meshBatch[0].verts;
  assert.ok(v[4] < 1, 'the light pass must actually darken');
  let varied = 0;
  for (let q = 0; q < mesh.count; q++) {
    // Vertices 0 and 1 of a quad are its TL and TR corners (TRI = 0,1,2,0,2,3).
    if (Math.abs(v[q * 48 + 4] - v[q * 48 + 12]) > 1e-6) varied++;
  }
  assert.ok(varied >= 3,
    `a gradient mesh must give a quad's corners different vertex colours; only ${varied} of ` +
    `${mesh.count} quads did — that is a FLAT per-tile overlay, not a pool`);

  // canvas2d: the mesh is filled with globalCompositeOperation 'multiply' as sub-tile rects, and
  // the legacy per-tile overlay is NOT also drawn.
  const dead = composeScene(frame, cam, ASSETS, new Uint8Array(frame.w * frame.h).fill(1));
  const cv = canvasRecorder();
  const legacy = cv.run(dead, { camera: cam, timeSec: 0 }).filter((r) => r.name === 'fill').length;
  const meshed = cv.run(dead, { camera: cam, timeSec: 0, lightMesh: buildLightMesh(dead, frame) })
    .filter((r) => r.name === 'fill').length;
  assert.ok(meshed > legacy, `the mesh path subdivides tiles (${meshed} fills vs ${legacy} legacy)`);
});

test('LIGHT BLEND PARITY: canvas2d multiplies and webgl2 multiplies — the same dst *= M', () => {
  // The whole reason the mesh carries a MULTIPLY factor rather than an over-blend colour is that
  // both backends composite it the same way. Canvas2D must set globalCompositeOperation
  // 'multiply' (with alpha 1) for the mesh fills and put it back afterwards; WebGL2 must wrap its
  // mesh draw in setBlendMultiply(true/false), which is DST_COLOR/ONE_MINUS_SRC_ALPHA — and with
  // alpha 1 that is dst*M in RGB and dst*1 in alpha, i.e. the identical operation.
  // Without this, 'multiply' → 'source-over' would REPLACE the stage with the multiply factors
  // (a near-black deck) and no other test in this suite would notice.
  const { frame, cam } = corridorScene(4, 2);
  const litList = composeScene(frame, cam, ASSETS, new Uint8Array(frame.w * frame.h).fill(4));
  const mesh = buildLightMesh(litList, frame);

  const cv = withSilhouettes(canvasRecorder());
  const drawn = cv.run(litList, { camera: cam, timeSec: 0, lightMesh: mesh });
  // The mesh sub-rects are exactly the fills whose colour is a light-mesh colour; identify them by
  // their draw order (they come after the entities and before any overlay) and count.
  const meshFills = drawn.filter((r) => r.name === 'fill' && r.gco === 'multiply');
  assert.equal(meshFills.length, mesh.count * 4, 'every mesh sub-rect must be a multiply fill');
  for (const f of meshFills) assert.equal(f.alpha, 1, 'a multiply factor is opaque, never faded');
  // ...the composite mode is RESTORED, so the overlay/next frame is not multiplied too.
  assert.equal(cv.ctx.globalCompositeOperation, 'source-over',
    'globalCompositeOperation must be restored after the light pass');
  // ...and each sub-rect carries the mesh colour sampled at its own CENTRE, 8-bit ROUNDED.
  // Two mutations hide here and both must fail this: sampling the sub-rect's CORNER instead of its
  // centre (the docstring claims the centre sample is exactly the sub-rect's area average, which
  // is only true at the centre), and truncating `x*255|0` instead of rounding (which would put
  // canvas2d a whole 8-bit level below the GL path over most of the stage).
  // Pick the quad with the largest corner spread, so centre and corner samples genuinely differ.
  let qBest = 0, spread = -1;
  for (let q = 0; q < mesh.count; q++) {
    const b = q * MESH_STRIDE + 2;
    const s2 = Math.abs(mesh.data[b] - mesh.data[b + 3]) + Math.abs(mesh.data[b] - mesh.data[b + 9]);
    if (s2 > spread) { spread = s2; qBest = q; }
  }
  assert.ok(spread > 2 / 255, `need a quad with a real gradient to tell centre from corner (${spread})`);
  const rgb = [0, 0, 0];
  const style = (u, v) => 'rgb(' +
    [...sampleQuad(mesh.data, qBest, u, v, rgb)].map((x) => (x * 255 + 0.5) | 0).join(',') + ')';
  // Sub-rects are emitted (i inner, j outer) at the centres of a 2x2 subdivision.
  const wantCentres = [style(0.25, 0.25), style(0.75, 0.25), style(0.25, 0.75), style(0.75, 0.75)];
  const got = meshFills.slice(qBest * 4, qBest * 4 + 4).map((f) => f.style);
  assert.deepEqual(got, wantCentres,
    'each sub-rect must be the mesh colour at its own centre, rounded to 8 bits');

  // webgl2: the mesh batch sits strictly between setBlendMultiply(true) and setBlendMultiply(false).
  const gl = webglRecorder();
  const calls = gl.run(litList,
    { camera: cam, sprites: STUB_SPRITES, spriteMode: 'on', timeSec: 0, lightMesh: mesh });
  const blends = gl.blends;
  assert.deepEqual(blends.map((b) => b.on), [true, false],
    'the GL light pass must turn the multiply blend on and back off exactly once');
  const meshAt = calls.findIndex((c) => c.fn === 'flat' && c.verts.length === mesh.count * 6 * 8);
  assert.ok(meshAt >= 0, 'expected the mesh batch');
  assert.ok(blends[0].at <= meshAt && meshAt < blends[1].at,
    'the mesh must be drawn INSIDE the multiply blend, not under the default over-blend');
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
