// WP-3 light pools + WP-1 light direction — the PURE surface (render/lightfield.js).
//
// Every test here is written to FAIL if its feature is removed, not merely to describe it:
//   - the fog gate is probed from BOTH sides (never paint on fog; never trace a ray through fog)
//   - "gradient, not stepped" is measured (distinct levels along a ray, intra-quad spread,
//     exact corner sharing across tile seams) rather than asserted
//   - the three-dark-states ladder in palette.js is re-checked against the new ambient rungs
// The executors' thin glue (GL vertex colours / canvas sub-rects) lives in scene.test.js, which
// drives the real executors.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeScene } from '../src/render/compose.js';
import {
  buildLightMesh, createLightScratch, stateAmbient, falloff, sampleQuad,
  MESH_STRIDE, LIGHT_RADIUS, POOL_CORE, AMBIENT_LIT, AMBIENT_LUMA_FLOOR, SPILL_MAX,
  LIGHT_DIR, SHADOW_OFFSET, SHADOW_ALPHA, SHADOW_LENGTH, SHADOW_SQUASH, SHADOW_SHEAR,
  shadowQuad, visibility, PENUMBRA, LIGHT_ELEVATION_DEG,
} from '../src/render/lightfield.js';
import { C, ATTR_DIM, HULL, FG, litOverlay } from '../src/render/palette.js';
import { ASSETS, loadBootFrame, cameras, deriveLightPlane } from './helpers.js';

// ---- a tiny ASCII map builder ------------------------------------------------------------
// '.' floor · '#' wall · '*' powered lamp · 'x' UNPOWERED lamp · '+' door · ' ' fog · 'o' void
const CELL_OF = {
  '.': () => [46, C.Floor, C.Floor, 0],
  '#': () => [35, C.Wall, C.Void, 0],
  '*': () => [42, C.Device, C.Floor, 0],
  '+': () => [43, C.Device, C.Floor, 0],
  x: () => [42, C.DeviceDim, C.Floor, ATTR_DIM],
  ' ': () => [32, C.Unknown, C.Unknown, 0],
  o: () => [32, C.Void, C.Void, 0],
};

function mapFrame(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = [];
  for (const row of rows) {
    assert.equal(row.length, w, 'ragged test map');
    for (const ch of row) {
      const make = CELL_OF[ch];
      assert.ok(make, `unknown map char '${ch}'`);
      cells.push(make());
    }
  }
  return { w, h, lens: 'none', cells };
}
const bigCam = (f) => ({ x: f.w / 2, y: f.h / 2, z: 1, viewW: 4000, viewH: 4000, tile: 128 });

/** Every tile Dead(1) except where `powered` says otherwise — the plane compose fog-gates. */
function plane(frame, poweredPredicate) {
  const p = new Uint8Array(frame.w * frame.h);
  for (let i = 0; i < p.length; i++) {
    const x = i % frame.w, y = (i / frame.w) | 0;
    p[i] = poweredPredicate(x, y) ? 4 : 1;
  }
  return p;
}

function meshFor(frame, lights = null, cam = null) {
  const camera = cam || bigCam(frame);
  return buildLightMesh(composeScene(frame, camera, ASSETS, lights), frame);
}
function quadAt(mesh, x, y) {
  for (let q = 0; q < mesh.count; q++) {
    if (mesh.data[q * MESH_STRIDE] === x && mesh.data[q * MESH_STRIDE + 1] === y) return q;
  }
  return -1;
}
/** The four corner rgb triples of quad q, in TL,TR,BR,BL order. */
function corners(mesh, q) {
  const b = q * MESH_STRIDE + 2, out = [];
  for (let i = 0; i < 4; i++) out.push([mesh.data[b + i * 3], mesh.data[b + i * 3 + 1], mesh.data[b + i * 3 + 2]]);
  return out;
}
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Warm/cool of a multiply: red survival over blue survival. > 1 is warm, < 1 is cool. */
const warmth = (c) => c[0] / c[2];
/**
 * The pool's whole luma budget in a POWERED room: everything between "no pool reaches here" and
 * "standing on the lamp". Thresholds below are written as fractions of THIS rather than as bare
 * numbers, because a multiply can only darken and so the budget is set by how deep AMBIENT_LIT is
 * allowed to be (see lightfield.js's header) — a bare 0.03 would silently become "no pool at all"
 * or "impossible" the moment that trade is re-made.
 */
const POOL_DEPTH = luma(POOL_CORE) - luma(AMBIENT_LIT);
/** Mean multiply luma over a whole tile (the tile's average darkening). */
function tileLuma(mesh, x, y) {
  const q = quadAt(mesh, x, y);
  assert.ok(q >= 0, `no light quad at (${x},${y})`);
  return corners(mesh, q).reduce((s, c) => s + luma(c), 0) / 4;
}
/** Mean warmth over a whole tile. */
function tileWarmth(mesh, x, y) {
  const q = quadAt(mesh, x, y);
  assert.ok(q >= 0, `no light quad at (${x},${y})`);
  return corners(mesh, q).reduce((s, c) => s + warmth(c), 0) / 4;
}

// ── the fog gate, side A: a light quad NEVER lands on fog or void ─────────────────────────────
test('FOG GATE: the mesh covers explored terrain only — never a fog or void tile', () => {
  const f = mapFrame([
    '  ####  ',
    ' #....# ',
    ' #.*..# ',
    ' #....# ',
    '  ####oo',
  ]);
  const mesh = meshFor(f, plane(f, () => true));
  assert.ok(mesh.count > 0);
  for (let q = 0; q < mesh.count; q++) {
    const x = mesh.data[q * MESH_STRIDE], y = mesh.data[q * MESH_STRIDE + 1];
    const cell = f.cells[y * f.w + x];
    const fog = cell[0] === 32 && cell[1] === C.Unknown;
    const empty = cell[0] === 32 && cell[1] === C.Void;
    assert.ok(!fog, `light quad leaked onto fog tile (${x},${y})`);
    assert.ok(!empty, `light quad leaked onto known-void tile (${x},${y})`);
  }
});

test('FOG GATE holds over the real boot frame + an adversarial plane that CLAIMS light on fog', () => {
  const boot = loadBootFrame();
  const mesh = meshFor(boot, deriveLightPlane(boot), cameras(boot).full);
  assert.ok(mesh.count > 100, 'expected a real mesh over the boot frame');
  for (let q = 0; q < mesh.count; q++) {
    const x = mesh.data[q * MESH_STRIDE], y = mesh.data[q * MESH_STRIDE + 1];
    const cell = boot.cells[y * boot.w + x];
    assert.ok(!(cell[0] === 32 && cell[1] === C.Unknown), `light quad on fog tile (${x},${y})`);
  }
});

// ── the fog gate, side B: fog is OPAQUE — no ray is traced through the unknown ────────────────
test('FOG GATE: an emitter behind the fog line cannot lay a lit wedge on explored floor', () => {
  // Row 1: lamp, then a fog tile, then floor. Nothing beyond the fog may brighten.
  const withFog = mapFrame([
    '#######',
    '#* ...#',
    '#######',
  ]);
  const noFog = mapFrame([
    '#######',
    '#*....#',
    '#######',
  ]);
  const litAll = (f) => plane(f, () => true);
  const blocked = tileLuma(meshFor(withFog, litAll(withFog)), 4, 1);
  const open = tileLuma(meshFor(noFog, litAll(noFog)), 4, 1);
  assert.ok(Math.abs(blocked - luma(AMBIENT_LIT)) < 1e-6,
    `floor past a fog tile must sit at plain ambient, got ${blocked.toFixed(4)}`);
  // …and the identical map with the fog replaced by floor DOES light it, so the assertion above is
  // about opacity and not about the lamp being too far away.
  assert.ok(open > blocked + 0.3 * POOL_DEPTH,
    `open line of sight must be brighter (${open} vs ${blocked}, budget ${POOL_DEPTH.toFixed(3)})`);
});

// ── pools are gradients, not steps ───────────────────────────────────────────────────────────
test('POOLS ARE GRADIENT: many distinct levels along a ray, and they fall off monotonically', () => {
  const f = mapFrame(['#' + '.'.repeat(18) + '#', '#*' + '.'.repeat(17) + '#', '#' + '.'.repeat(18) + '#']);
  const mesh = meshFor(f, plane(f, () => true));
  const profile = [];
  for (let x = 1; x < 19; x++) profile.push(tileLuma(mesh, x, 1));
  // Strictly falling away from the lamp until the pool runs out, then flat at ambient.
  for (let i = 1; i < profile.length; i++) {
    assert.ok(profile[i] <= profile[i - 1] + 1e-9, `profile rose at x=${i + 1}: ${profile}`);
  }
  const distinct = new Set(profile.map((v) => v.toFixed(4)));
  assert.ok(distinct.size >= 8,
    `a gradient needs many levels; got ${distinct.size} distinct values along the ray — ` +
    'a per-tile flat overlay would give 1-3');
  assert.ok(profile[0] > luma(AMBIENT_LIT) + 0.5 * POOL_DEPTH,
    `the lamp tile must take most of the pool budget (${profile[0].toFixed(4)} vs ambient ` +
    `${luma(AMBIENT_LIT).toFixed(4)} + half of ${POOL_DEPTH.toFixed(4)})`);
  assert.ok(Math.abs(profile[profile.length - 1] - luma(AMBIENT_LIT)) < 1e-6,
    'past LIGHT_RADIUS the field is exactly ambient');
});

test('POOLS ARE GRADIENT: neighbouring quads share their corner values EXACTLY (no seam)', () => {
  const f = mapFrame(['#' + '.'.repeat(14) + '#', '#' + '.'.repeat(6) + '*' + '.'.repeat(7) + '#',
    '#' + '.'.repeat(14) + '#']);
  const mesh = meshFor(f, plane(f, () => true));
  let spread = 0;
  for (let x = 1; x < 14; x++) {
    const a = corners(mesh, quadAt(mesh, x, 1));      // TL,TR,BR,BL
    const b = corners(mesh, quadAt(mesh, x + 1, 1));
    assert.deepEqual(a[1], b[0], `TR of (${x},1) must equal TL of (${x + 1},1)`);
    assert.deepEqual(a[2], b[3], `BR of (${x},1) must equal BL of (${x + 1},1)`);
    // …and inside a quad the corners genuinely differ where the pool is falling off.
    if (Math.abs(luma(a[0]) - luma(a[1])) > 1e-4) spread++;
  }
  assert.ok(spread >= 6, `expected the pool edge to vary WITHIN tiles; only ${spread} quads did`);
});

test('falloff is 1 at the lamp, 0 at LIGHT_RADIUS, and lands softly (zero tangent at the rim)', () => {
  assert.equal(falloff(0), 1);
  assert.equal(falloff(LIGHT_RADIUS), 0);
  assert.equal(falloff(LIGHT_RADIUS + 3), 0);
  const nearRim = falloff(LIGHT_RADIUS - 0.25);
  assert.ok(nearRim > 0 && nearRim < 0.02, `no hard pool rim (got ${nearRim})`);
});

// ── occlusion ────────────────────────────────────────────────────────────────────────────────
test('WALL OCCLUSION: a wall casts a real shadow — floor behind it stays at ambient', () => {
  //         x: 0123456789
  const f = mapFrame([
    '##########',
    '#*..#....#',   // lamp at (1,1); a wall pillar at (4,1) shadows (5..8, 1)
    '#........#',   // the same distances with NO pillar in the way
    '##########',
  ]);
  const mesh = meshFor(f, plane(f, () => true));
  const shadowed = tileLuma(mesh, 6, 1);
  const openSame = tileLuma(mesh, 6, 2);
  assert.ok(openSame > shadowed + 0.2 * POOL_DEPTH,
    `the wall must darken what is behind it (behind ${shadowed.toFixed(3)} vs open ${openSame.toFixed(3)})`);
  // …and it must cool it RELATIVE to the pool. Under a multiply-only light pass most of the pool's
  // contrast is carried in chroma rather than luma (lightfield.js header), so "in shadow" reads as
  // "back to the room's plain warm ambient" (not cold — the ship is never cold indoors, design
  // decision 2026-07-22) as much as it reads as "darker": the lamp is the warm PEAK, the shadow is
  // the merely-warm room.
  assert.ok(tileWarmth(mesh, 6, 2) > tileWarmth(mesh, 6, 1) + 0.02,
    `the lit tile must be WARMER than the shadowed one (${tileWarmth(mesh, 6, 2).toFixed(3)} vs ` +
    `${tileWarmth(mesh, 6, 1).toFixed(3)})`);
  assert.ok(tileLuma(mesh, 2, 1) > openSame, 'the tile beside the lamp is the brightest');
});

// ── emitter selection ────────────────────────────────────────────────────────────────────────
test('an UNPOWERED (Dim) lamp is not an emitter — a shed lamp is dark, not a light source', () => {
  const lit = mapFrame(['#####', '#*..#', '#####']);
  const shed = mapFrame(['#####', '#x..#', '#####']);
  const a = tileLuma(meshFor(lit, plane(lit, () => true)), 3, 1);
  const b = tileLuma(meshFor(shed, plane(shed, () => true)), 3, 1);
  assert.ok(a > b, 'the powered lamp lights the room');
  assert.ok(Math.abs(b - luma(AMBIENT_LIT)) < 1e-6, 'the shed lamp contributes nothing');
});

test('emitters are found OUTSIDE the viewport — rooms must not darken when you pan', () => {
  // A 30-wide corridor with the lamp at x=2; frame a window that starts well past it.
  const f = mapFrame(['#' + '.'.repeat(28) + '#', '#.*' + '.'.repeat(26) + '#', '#' + '.'.repeat(28) + '#']);
  const lights = plane(f, () => true);
  const wide = meshFor(f, lights);
  // A camera whose cull window excludes the lamp entirely.
  const narrow = { x: 12, y: 1.5, z: 1, viewW: 1024, viewH: 1024, tile: 128 };
  const cropped = meshFor(f, lights, narrow);
  assert.equal(quadAt(cropped, 2, 1), -1, 'the lamp tile is genuinely outside this window');
  const x = 8; // inside the narrow window AND inside the lamp's reach
  assert.ok(quadAt(cropped, x, 1) >= 0, 'test tile must be in the cropped window');
  assert.ok(Math.abs(tileLuma(cropped, x, 1) - tileLuma(wide, x, 1)) < 1e-6,
    'a tile must be lit identically whether or not its lamp is on screen');
  assert.ok(tileLuma(cropped, x, 1) > luma(AMBIENT_LIT) + 0.01, 'and it must actually be lit');
});

// ── ambient rungs: the three-dark-states ladder must survive ──────────────────────────────────
test('LADDER: Dead keeps its exact palette value; powered ambient sits clearly above it', () => {
  const paletteM = (rgba) => {
    const m = /rgba?\((\d+),(\d+),(\d+),([.\d]+)\)/.exec(rgba);
    const a = Number(m[4]);
    return [1, 2, 3].map((i) => (1 - a) + (Number(m[i]) / 255) * a);
  };
  // Dead/Emergency are already the "unlit" rungs — the pool ambient must not darken them again.
  assert.deepEqual(stateAmbient(1), paletteM(litOverlay(1)));
  assert.deepEqual(stateAmbient(2), paletteM(litOverlay(2)));
  assert.deepEqual(stateAmbient(4), AMBIENT_LIT);

  // Now the ladder itself, in rendered luma on the shipped art values (palette.js records the
  // measured lit-floor value as ~113 and the hull mass as ~39).
  const LIT_FLOOR = 113, hullLuma = 0.2126 * 0x28 + 0.7152 * 0x25 + 0.0722 * 0x31;
  const rung = (m) => LIT_FLOOR * luma(m);
  const dead = rung(stateAmbient(1)), amb = rung(stateAmbient(4)), core = rung(POOL_CORE);
  assert.ok(hullLuma < dead - 15, `hull ${hullLuma.toFixed(0)} must stay below unlit floor ${dead.toFixed(0)}`);
  assert.ok(amb > dead + 15, `powered ambient ${amb.toFixed(0)} must clear unlit floor ${dead.toFixed(0)}`);
  assert.ok(core > amb, `pool core ${core.toFixed(1)} must clear powered ambient ${amb.toFixed(1)}`);
  assert.ok(core > 100, 'the lit value range must survive the relight (WP-0/stage relight)');
  void FG; void HULL;
});

test('AMBIENT FLOOR: the light pass may recess a powered room, not re-dim the whole ship', () => {
  // THE regression guard for this package. A multiply-only light pass buys its pool contrast by
  // darkening everything the pool does not reach — and with 5 lamps at LIGHT_RADIUS 9 that is most
  // of a powered deck. The first cut of AMBIENT_LIT sat at luma 0.700 and measurably spent back
  // the stage relight (slice hero frame p90 112.7 -> 84.0, p95 115.9 -> 96.7, p99 124.9 -> 110.9,
  // std -20%, lit:unlit separation ~1.9x -> ~1.4x). This test fails at that value.
  const ambLuma = luma(stateAmbient(4));
  assert.ok(ambLuma >= AMBIENT_LUMA_FLOOR,
    `a powered room with no lamp in reach keeps only ${(100 * ambLuma).toFixed(1)}% of its value; ` +
    `the floor is ${(100 * AMBIENT_LUMA_FLOOR).toFixed(0)}%. Do not buy pool contrast with the deck.`);
  // …and the floor itself must stay a floor: high enough that the relight survives it.
  assert.ok(AMBIENT_LUMA_FLOOR >= 0.85, 'the floor may not be lowered to make a deep ambient pass');
  // The pool must still be a pool: a real luma lift on top of a real warm/cool swing.
  assert.ok(POOL_DEPTH > 0.06,
    `the pool must lift a powered tile by a real amount, got ${POOL_DEPTH.toFixed(4)}`);
});

test('POOL_CORE is the WARM peak of a warm gradient — the lamp is warmer than the warm room', () => {
  // A behavioural probe, because the constant alone can be neutralised without any other test
  // noticing: with POOL_CORE = [1,1,1] the pool still "brightens" and the ladder still holds — but
  // the ship loses the warmth GRADIENT that replaced the old cold-ship contract (design decision
  // 2026-07-22, "the ship does not need to be cold"). The room is warm; the lamp is warmer; the
  // dead room (palette.js LIGHT[1]) is warm-DIM. Cold is reserved for hull/vacuum, never a room.
  const f = mapFrame(['#' + '.'.repeat(14) + '#', '#*' + '.'.repeat(13) + '#', '#' + '.'.repeat(14) + '#']);
  const mesh = meshFor(f, plane(f, () => true));
  const atLamp = tileWarmth(mesh, 1, 1);
  const far = tileWarmth(mesh, 14, 1);
  assert.ok(atLamp > 1.05, `the pool core must render WARM (r/b ${atLamp.toFixed(3)} must exceed 1)`);
  assert.ok(far > 1.02, `the surround is ALSO warm now — a lit room is never cold (r/b ${far.toFixed(3)})`);
  assert.ok(atLamp > far + 0.05, `the lamp must be the WARMEST point (${atLamp.toFixed(3)} vs room ${far.toFixed(3)})`);
  // …and the same statement on the constants, so the gradient cannot be faked by the ambient alone.
  assert.ok(POOL_CORE[2] < POOL_CORE[0] - 0.05,
    'POOL_CORE must pull BLUE down against red — a neutral [1,1,1] core is not a warm pool');
  assert.ok(AMBIENT_LIT[0] > AMBIENT_LIT[2], 'the surround is WARM too now (red survives blue) — no cold rooms');
});

test('PENUMBRA: a shadow edge is soft — corners take the intermediate visibilities', () => {
  // `visibility` fires THREE rays, the outer two offset perpendicular by PENUMBRA, and returns
  // clear/3. With PENUMBRA at 0 all three coincide and it collapses to a hard {0,1} step, which no
  // other test can see (the field still falls off, walls still occlude, the ladder still holds).
  // So probe it directly: grazing a wall corner MUST produce a 1/3 or 2/3.
  const f = mapFrame([
    '##########',
    '#*..#....#',
    '#........#',
    '##########',
  ]);
  const seen = new Set();
  for (let cx = 5; cx <= 9; cx++) {
    for (let cy = 1; cy <= 3; cy++) seen.add(visibility(f, 1.5, 1.5, cx, cy));
  }
  const soft = [...seen].filter((v) => v > 0 && v < 1);
  assert.ok(soft.length > 0,
    `every corner along the wall edge is fully lit or fully black (${[...seen].join(', ')}) — ` +
    'that is a hard shadow, PENUMBRA is doing nothing');
  for (const v of soft) {
    assert.ok(Math.abs(v - 1 / 3) < 1e-9 || Math.abs(v - 2 / 3) < 1e-9,
      `a soft visibility must be one of the three-ray steps, got ${v}`);
  }
  assert.ok(PENUMBRA > 0, 'PENUMBRA is the perpendicular ray offset that produces those steps');
});

// ── spill through a doorway is a hint, not illumination ──────────────────────────────────────
test('SPILL CAP: light through a door lifts a Dead room but never to a lit room\'s value', () => {
  //         x: 01234567
  const f = mapFrame([
    '########',
    '#*.+...#',   // lamp at (1,1); a DOOR at (3,1) — an entity on a floor base, so it does not block
    '########',
  ]);
  const lights = plane(f, (x) => x <= 2); // the hall is Powered; the cabin at x>=3 is Dead
  const mesh = meshFor(f, lights);
  // (4,1) is one tile past the door and 3 tiles from the lamp: uncapped its field value would be
  // ~0.79, so the cap is what is being measured here and not merely distance.
  const cabin = tileLuma(mesh, 4, 1);
  const deadAmbient = luma(stateAmbient(1));
  const ceiling = luma(stateAmbient(1).map((a, i) => a + (POOL_CORE[i] - a) * SPILL_MAX));
  assert.ok(cabin > deadAmbient + 0.02, 'light really does come through the doorway');
  assert.ok(cabin <= ceiling + 1e-6,
    `borrowed light must stay under the SPILL_MAX ceiling (${cabin.toFixed(3)} > ${ceiling.toFixed(3)})`);
  assert.ok(cabin < luma(AMBIENT_LIT), 'a Dead room lit only by spill still reads darker than a lit one');
  // …and the neighbouring POWERED tile at the same distance is NOT capped, which is the whole
  // difference the cap makes (if the cap were removed both would read the same).
  assert.ok(tileLuma(mesh, 2, 1) > cabin + 0.15, 'a powered tile takes the full pool');
});

// ── determinism / allocation reuse ───────────────────────────────────────────────────────────
test('buildLightMesh is deterministic, never mutates its inputs, and reuses scratch safely', () => {
  const a = mapFrame(['#####', '#*..#', '#####']);
  const b = mapFrame(['########', '#..*...#', '#..#...#', '########']);
  const la = plane(a, () => true), lb = plane(b, () => true);
  const listA = composeScene(a, bigCam(a), ASSETS, la);
  const listB = composeScene(b, bigCam(b), ASSETS, lb);
  const before = JSON.stringify(listA);

  const fresh = buildLightMesh(listA, a);
  const scratch = createLightScratch();
  // Drive a DIFFERENT, larger scene through the scratch first: a stale-buffer bug would leak here.
  buildLightMesh(listB, b, scratch);
  const reused = buildLightMesh(listA, a, scratch);
  assert.equal(reused.count, fresh.count);
  for (let i = 0; i < fresh.count * MESH_STRIDE; i++) {
    assert.equal(reused.data[i], fresh.data[i], `scratch reuse diverged at float ${i}`);
  }
  assert.equal(JSON.stringify(listA), before, 'the DisplayList must not be touched');
  // Twice in a row through the same scratch is also stable.
  const again = buildLightMesh(listA, a, scratch);
  for (let i = 0; i < fresh.count * MESH_STRIDE; i++) assert.equal(again.data[i], fresh.data[i]);
});

test('buildLightMesh tolerates empty/absent input', () => {
  assert.equal(buildLightMesh(null, null).count, 0);
  assert.equal(buildLightMesh([], { w: 1, h: 1, cells: [[46, 2, 2, 0]] }).count, 0);
  // A list with nothing but fog produces no quads at all (and no crash).
  const f = mapFrame(['   ', '   ']);
  assert.equal(meshFor(f).count, 0);
});

test('sampleQuad bilinearly interpolates the corners (the Canvas2D sub-tile sampler)', () => {
  const data = new Float32Array(MESH_STRIDE);
  data[0] = 0; data[1] = 0;
  const set = (i, v) => { data[2 + i * 3] = v; data[3 + i * 3] = v; data[4 + i * 3] = v; };
  set(0, 0); set(1, 1); set(2, 1); set(3, 0);       // TL 0, TR 1, BR 1, BL 0 → a pure horizontal ramp
  const out = [0, 0, 0];
  assert.equal(sampleQuad(data, 0, 0, 0, out)[0], 0);
  assert.equal(sampleQuad(data, 0, 1, 0, out)[0], 1);
  assert.equal(sampleQuad(data, 0, 0.25, 0.9, out)[0], 0.25);
  assert.equal(sampleQuad(data, 0, 0.5, 0.5, out)[0], 0.5);
});

// ── WP-1: ONE light direction ────────────────────────────────────────────────────────────────
test('LIGHT DIRECTION: shadows are thrown straight down-light, from a single unit vector', () => {
  assert.ok(LIGHT_DIR.x < 0 && LIGHT_DIR.y < 0, 'the key light comes from up-LEFT (the PA reference)');
  assert.ok(Math.abs(Math.hypot(LIGHT_DIR.x, LIGHT_DIR.y) - 1) < 1e-9, 'LIGHT_DIR must be a unit vector');
  // docs/design/perilune-art-direction.md AD-3 rules the key light at azimuth 315° in plan and
  // elevation 55°, and AD-5 hands shadows to the renderer — so this file must agree with the light
  // every sprite is PAINTED under, or a form's baked shade step and its cast shadow point
  // different ways. 315° is the exact up-left diagonal: |x| === |y|, not merely "up and left".
  assert.ok(Math.abs(Math.abs(LIGHT_DIR.x) - Math.abs(LIGHT_DIR.y)) < 1e-9,
    `AD-3 azimuth 315° means |x| === |y|; LIGHT_DIR is (${LIGHT_DIR.x}, ${LIGHT_DIR.y}) = ` +
    `${(Math.atan2(-LIGHT_DIR.x, -LIGHT_DIR.y) * 180 / Math.PI).toFixed(1)}° off vertical`);
  assert.equal(LIGHT_ELEVATION_DEG, 55, 'AD-3 fixes the elevation at 55°');
  // …and the shadow's reach is that elevation, not a free parameter: h/tan(55°) = 0.700h, split
  // between squash and shear by the azimuth, which at 315° makes them equal.
  const reach = 1 / Math.tan((LIGHT_ELEVATION_DEG * Math.PI) / 180);
  assert.ok(Math.abs(SHADOW_SQUASH - reach * -LIGHT_DIR.y) < 1e-12, 'squash is the reach y-component');
  assert.ok(Math.abs(SHADOW_SHEAR - SHADOW_SQUASH) < 1e-12, 'at azimuth 315° shear equals squash');
  // The offset is DERIVED from the direction — there is no second, independent light in the scene.
  assert.ok(Math.abs(SHADOW_OFFSET.x - -LIGHT_DIR.x * SHADOW_LENGTH) < 1e-12);
  assert.ok(Math.abs(SHADOW_OFFSET.y - -LIGHT_DIR.y * SHADOW_LENGTH) < 1e-12);
  assert.ok(SHADOW_OFFSET.x > 0 && SHADOW_OFFSET.y > 0, 'shadows fall down-and-right');
  assert.ok(Math.hypot(SHADOW_OFFSET.x, SHADOW_OFFSET.y) >= 0.1, 'a shadow you cannot see is not a shadow');
  assert.ok(SHADOW_ALPHA > 0.2 && SHADOW_ALPHA < 0.6, 'grounding, not a black hole');
});

test('SHADOW SHAPE: a shadow lies on the GROUND — squashed at the foot line and leaning down-light', () => {
  // The first cut of WP-1 drew an unsheared, unscaled, full-size offset copy of the sprite. On a
  // round lamp that reads fine; on a pawn it reads as a second dark pawn, and on the square
  // terminal (a solid 0.55x0.71-tile box) it reads as a hard-edged black rectangle most of a tile
  // across. Every assertion here fails on that shape.
  const q = shadowQuad(10, 20, 100);          // cell at (10,20), 100 units on a side
  const [tlx, tly, trx, , brx, bry, blx, bly] = q;

  // 1. SHORT: the shadow's height is SHADOW_SQUASH of the cell, not the whole cell.
  assert.ok(Math.abs((bly - tly) / 100 - SHADOW_SQUASH) < 1e-12,
    `shadow height ${(bly - tly) / 100} of a cell; a full-size copy would be 1`);
  assert.ok(SHADOW_SQUASH < 0.6, 'a ground shadow seen at this camera angle is squat');

  // 2. ANCHORED AT THE FOOT LINE: its bottom edge sits at the caster's foot (plus the small
  //    contact nudge), NOT floating a fixed offset down from the caster's head.
  assert.ok(Math.abs(bly - (20 + 100 + SHADOW_OFFSET.y * 100)) < 1e-9, 'bottom edge is the foot line');
  assert.ok(bly - tly < 100, 'the shadow may not be as tall as the thing casting it');

  // 3. SHEARED: the top edge leads the bottom edge down-light. A rectangle has zero lean.
  const lean = (tlx - blx) / 100;
  assert.ok(Math.abs(lean - SHADOW_SHEAR) < 1e-12, `lean ${lean} != SHADOW_SHEAR ${SHADOW_SHEAR}`);
  assert.ok(lean > 0.1, 'an unsheared shadow is an offset copy, not a projection');
  assert.ok(lean > 0 === (LIGHT_DIR.x < 0), 'the lean must go AWAY from the key light');

  // 4. Still a parallelogram: opposite edges parallel and equal (so a texture maps affinely onto
  //    it, which is what lets canvas2d rebuild it as one matrix).
  assert.ok(Math.abs((trx - tlx) - (brx - blx)) < 1e-9, 'top and bottom edges are equal length');
  assert.ok(Math.abs((trx - tlx) - 100) < 1e-9, 'and one cell wide');
  assert.ok(Math.abs(tly - q[3]) < 1e-9 && Math.abs(bly - bry) < 1e-9, 'top/bottom edges are level');

  // 5. It scales with the cell — this is tile-space geometry, not a pixel constant.
  const half = shadowQuad(0, 0, 50);
  for (let i = 0; i < 8; i++) {
    assert.ok(Math.abs(half[i] - (shadowQuad(0, 0, 100)[i] / 2)) < 1e-9, `corner ${i} must scale`);
  }
});
