// WebGL2 batcher + atlas tests. buildPasses() and packAtlas() are PURE (data in, data out), so
// they are golden- and invariant-testable with no GPU. We reuse the exact fixture cases the
// DisplayList goldens use (client/test/cases.js) and assert: the RenderPass goldens byte-for-byte,
// the fixed pass ordering + per-pass op vocabulary, determinism under deep-frozen inputs, the
// future light-pass slot, and the atlas packer's non-overlap / in-bounds / order-independence.
// Regenerate intended pass changes with: node client/tools/regen-pass-goldens.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { goldenCases } from './cases.js';
import {
  PASS_GOLDEN_DIR, composePassGolden, composePasses, loadBootFrame, cameras, ASSETS,
} from './helpers.js';
import { composeScene } from '../src/render/compose.js';
import { buildPasses, PASS_ORDER, reticlePhase } from '../src/render/webgl/batch.js';
import { packAtlas, pow2, ATLAS_BORDER, ATLAS_PAD, UV_INSET_TEXELS } from '../src/render/webgl/atlas.js';

const TERRAIN_KINDS = new Set(['hull', 'void', 'floor', 'debris', 'wall', 'wall_vert']);
const OVERLAY_KINDS = new Set(['wash', 'cursor', 'reticle']);

// Recursively freeze so any write attempt inside buildPasses throws (proves non-mutation).
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

// ---- RenderPass goldens (one per fixture case) ----
for (const c of goldenCases()) {
  test(`render-pass golden: ${c.name}`, () => {
    const produced = composePassGolden(c.frame, c.camera, c.lights);
    const goldenPath = join(PASS_GOLDEN_DIR, c.name + '.json');
    let golden;
    try {
      golden = readFileSync(goldenPath, 'utf8');
    } catch {
      assert.fail(`missing pass golden ${c.name}.json — run: node client/tools/regen-pass-goldens.mjs`);
    }
    assert.equal(
      produced, golden,
      `RenderPass list for '${c.name}' drifted from its golden. If intended, regenerate with ` +
      `node client/tools/regen-pass-goldens.mjs and explain the diff in the commit.`,
    );
  });
}

// ---- pass ordering + vocabulary invariants ----
test('buildPasses returns exactly the four passes in fixed order', () => {
  const boot = loadBootFrame();
  const passes = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  assert.deepEqual(passes.map((p) => p.name), PASS_ORDER);
  assert.deepEqual(PASS_ORDER, ['terrain', 'entities', 'light', 'overlay']);
});

test('each pass carries only its own op vocabulary', () => {
  const boot = loadBootFrame();
  const [terrain, entities, light, overlay] =
    buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  for (const o of terrain.ops) assert.ok(TERRAIN_KINDS.has(o.kind), `terrain got '${o.kind}'`);
  for (const o of entities.ops) assert.equal(o.kind, 'entity');
  for (const o of light.ops) assert.equal(o.kind, 'light');
  for (const o of overlay.ops) assert.ok(OVERLAY_KINDS.has(o.kind), `overlay got '${o.kind}'`);
  // The boot frame exercises terrain + entities; overlay may be empty (no lens/selection here).
  assert.ok(terrain.ops.length > 0 && entities.ops.length > 0, 'expected terrain + entity ops');
});

test('every batched op has integer tile coords', () => {
  const boot = loadBootFrame();
  for (const p of buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 })) {
    for (const o of p.ops) {
      assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y), `non-integer coords: ${JSON.stringify(o)}`);
    }
  }
});

test('wall face/vert maps to the right terrain kind; deep hull walls fold to hull', () => {
  // Synthetic: a horizontal wall run open to the south (face, not vertical) beside a floor,
  // plus a fully-enclosed interior '#' with no open neighbour (deep hull mass → 'hull').
  const boot = loadBootFrame();
  const list = composeScene(boot, cameras(boot).full, ASSETS);
  const terrain = buildPasses(list, { timeSec: 0 })[0].ops;
  // Cross-check against the source DisplayList wall ops: face→wall/wall_vert, !face→hull.
  const wallOps = list.filter((o) => o.op === 'wall');
  assert.ok(wallOps.length > 0, 'expected wall ops in the boot frame');
  for (const w of wallOps) {
    const t = terrain.find((o) => o.x === w.x && o.y === w.y);
    const expect = w.face ? (w.vert ? 'wall_vert' : 'wall') : 'hull';
    assert.equal(t.kind, expect, `wall (${w.x},${w.y}) face=${w.face} vert=${w.vert}`);
  }
});

// ---- light pass (C4) ----
test('op:light DrawOps flow into the light pass (empty until the frame carries lighting)', () => {
  const boot = loadBootFrame();
  // No lights plane → the light pass exists but is empty (backward compat with the no-lights path).
  const emptyLight = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 })[2];
  assert.deepEqual(emptyLight, { name: 'light', ops: [] });
  // A compose op:'light' carries its LightState byte; the batcher routes it, carrying state through.
  const withLight = buildPasses(
    [{ op: 'floor', x: 0, y: 0 }, { op: 'light', x: 1, y: 2, state: 3 }],
    { timeSec: 0 },
  );
  assert.equal(withLight[0].ops.length, 1, 'floor → terrain');
  assert.deepEqual(withLight[2].ops, [{ kind: 'light', x: 1, y: 2, state: 3 }]);
});

// ---- reticle phase is data derived from timeSec (not a clock read) ----
test('reticle phase is a pure function of timeSec', () => {
  assert.equal(reticlePhase(0), 0.5);                          // sin(0)=0 → 0.5
  assert.equal(reticlePhase(1), reticlePhase(1));              // stable
  assert.ok(reticlePhase(0.4) >= 0 && reticlePhase(0.4) <= 1); // bounded [0,1]
  const list = [{ op: 'reticle', x: 5, y: 5 }];
  assert.equal(buildPasses(list, { timeSec: 0 })[3].ops[0].phase, 0.5);
  assert.notEqual(buildPasses(list, { timeSec: 0.4 })[3].ops[0].phase, 0.5);
  // Different clock inputs → different data, but each call is itself deterministic.
});

// ---- determinism + input non-mutation ----
test('buildPasses is deterministic and never mutates its inputs', () => {
  const boot = loadBootFrame();
  const list = composeScene(boot, cameras(boot).full, ASSETS);
  const opts = { timeSec: 1.234 };
  deepFreeze(list);
  deepFreeze(opts);
  const a = JSON.stringify(buildPasses(list, opts)); // throws if it writes to a frozen input
  const b = JSON.stringify(buildPasses(list, opts));
  assert.equal(a, b);
});

test('buildPasses tolerates null/empty and unknown ops', () => {
  assert.deepEqual(buildPasses(null).map((p) => p.name), PASS_ORDER);
  assert.deepEqual(buildPasses([]).map((p) => [p.name, p.ops.length]),
    [['terrain', 0], ['entities', 0], ['light', 0], ['overlay', 0]]);
  // An unknown op is dropped, never thrown (forward-compat).
  const passes = buildPasses([{ op: 'floor', x: 0, y: 0 }, { op: 'mystery', x: 9, y: 9 }], {});
  assert.equal(passes[0].ops.length, 1);
});

// ---- entity sprite/tint/facing resolution ----
test('entity resolution mirrors the canvas skin (roles, crew variant, locked door, dim tint)', () => {
  // role passthrough + dim recolor:
  const roleOp = { op: 'entity', x: 1, y: 1, g: 71, fg: 8, dim: true, role: 'solar', turns: 2, pv: null };
  const e0 = buildPasses([roleOp], {})[1].ops[0];
  assert.equal(e0.sprite, 'solar');
  assert.equal(e0.turns, 2);
  assert.equal(e0.alpha, 0.7);
  assert.equal(e0.tint, 9); // C.DeviceDim — dim entities recolor, per canvas2d._entity
  // crew '@' with variant → pawn variant sprite:
  const crewOp = { op: 'entity', x: 2, y: 2, g: 64, fg: 5, dim: false, role: null, turns: 0, pv: 1 };
  assert.equal(buildPasses([crewOp], {})[1].ops[0].sprite, 'pawn_b');
  // locked door 'X' → door sprite + lock-tint overlay:
  const lockOp = { op: 'entity', x: 3, y: 3, g: 88, fg: 11, dim: false, role: null, turns: 0, pv: null };
  const lock = buildPasses([lockOp], {})[1].ops[0];
  assert.equal(lock.sprite, 'door');
  assert.equal(lock.overlay, 'lock-tint');
  // a plain item glyph with no sprite → procedural (sprite null):
  const itemOp = { op: 'entity', x: 4, y: 4, g: 44, fg: 7, dim: false, role: null, turns: 0, pv: null };
  assert.equal(buildPasses([itemOp], {})[1].ops[0].sprite, null);
});

// ---- atlas packer ----
test('packAtlas: placements never overlap and UVs stay within [0,1)', () => {
  const sprites = [
    { name: 'floor', w: 128, h: 128 }, { name: 'wall', w: 128, h: 128 },
    { name: 'door', w: 64, h: 96 }, { name: 'pawn', w: 100, h: 128 },
    { name: 'terminal', w: 128, h: 64 }, { name: 'growbed', w: 128, h: 128 },
  ];
  const atlas = packAtlas(sprites);
  const names = Object.keys(atlas.placements);
  assert.equal(names.length, sprites.length);
  // no overlap (axis-aligned rectangle intersection over every pair):
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = atlas.placements[names[i]], b = atlas.placements[names[j]];
      const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(disjoint, `sprites ${names[i]} and ${names[j]} overlap`);
    }
    // inside the texture bounds:
    const p = atlas.placements[names[i]];
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= atlas.width && p.y + p.h <= atlas.height);
  }
  for (const name of names) {
    const uv = atlas.uv[name];
    for (const c of [uv.u0, uv.v0, uv.u1, uv.v1]) assert.ok(c >= 0 && c < 1, `UV out of [0,1): ${c}`);
    assert.ok(uv.u1 > uv.u0 && uv.v1 > uv.v0, 'UV rect must be non-degenerate');
  }
  // power-of-two texture dims:
  assert.equal(atlas.width, pow2(atlas.width));
  assert.equal(atlas.height, pow2(atlas.height));
});

test('packAtlas is deterministic and order-independent (sorts by name)', () => {
  const a = [{ name: 'a', w: 32, h: 32 }, { name: 'b', w: 48, h: 16 }, { name: 'c', w: 64, h: 64 }];
  const shuffled = [a[2], a[0], a[1]];
  assert.equal(JSON.stringify(packAtlas(a)), JSON.stringify(packAtlas(shuffled)));
  assert.equal(JSON.stringify(packAtlas(a)), JSON.stringify(packAtlas([...a])));
});

test('packAtlas wraps to new shelves at maxWidth and handles the empty set', () => {
  const empty = packAtlas([]);
  assert.deepEqual(empty, { width: 1, height: 1, pad: ATLAS_PAD, placements: {}, uv: {} });
  // Three 100px sprites with maxWidth 220 → two per shelf, so the third drops to a new row.
  const atlas = packAtlas(
    [{ name: 'x', w: 100, h: 40 }, { name: 'y', w: 100, h: 40 }, { name: 'z', w: 100, h: 40 }],
    { padding: 1, maxWidth: 220 },
  );
  assert.equal(atlas.placements.z.y > atlas.placements.x.y, true, 'z should wrap below x');
  assert.equal(atlas.placements.x.y, atlas.placements.y.y, 'x and y share the first shelf');
});

// ---- WP-0: bleed protection (gutter + half-texel inset) ----
test('packAtlas gives every cell an EXCLUSIVE ATLAS_BORDER — replicated edges never collide', () => {
  const sprites = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => ({ name: n, w: 128, h: 128 }));
  const atlas = packAtlas(sprites);
  const names = Object.keys(atlas.placements);
  // The gutter is reported so the rasterizer can CHECK it (webgl2.js _replicateEdges) instead of
  // assuming the default, and the default must fit two exclusive borders side by side.
  assert.ok(atlas.pad >= 2 * ATLAS_BORDER, `default gutter ${atlas.pad} < 2 * ATLAS_BORDER`);
  assert.equal(packAtlas(sprites, { padding: 3 }).pad, 3, 'a custom gutter is reported, not hidden');
  // Grow every placement by its border; the grown rects must STILL be disjoint, otherwise one
  // cell's replicated edge would overwrite its neighbour's and the protection would be fiction.
  const grown = names.map((n) => {
    const p = atlas.placements[n];
    return { x: p.x - ATLAS_BORDER, y: p.y - ATLAS_BORDER, w: p.w + 2 * ATLAS_BORDER, h: p.h + 2 * ATLAS_BORDER };
  });
  for (let i = 0; i < grown.length; i++) {
    const a = grown[i];
    assert.ok(a.x >= 0 && a.y >= 0, 'a border must not run off the top/left of the texture');
    assert.ok(a.x + a.w <= atlas.width && a.y + a.h <= atlas.height, 'border off the texture');
    for (let j = i + 1; j < grown.length; j++) {
      const b = grown[j];
      const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(disjoint, `borders of ${names[i]} and ${names[j]} overlap`);
    }
  }
});

test('packAtlas UVs sample every texel CENTRE exactly once when drawn 1:1', () => {
  // This is the property max zoom depends on: at pitch == cell width, pixel i must land on texel
  // centre p.x + i + 0.5. A half-texel inset (UV_INSET_TEXELS = 0.5) breaks it — it maps 128 pixels
  // across 127 texels — and measurably throws away a third of the crispness. See atlas.js.
  assert.equal(UV_INSET_TEXELS, 0, 'the inset is deliberately disarmed; re-read atlas.js before changing');
  const W = 128;
  const atlas = packAtlas([{ name: 'floor', w: W, h: W }, { name: 'wall', w: W, h: W }]);
  for (const name of ['floor', 'wall']) {
    const p = atlas.placements[name], uv = atlas.uv[name];
    for (const i of [0, 1, 63, 126, 127]) {
      const texel = (uv.u0 + ((i + 0.5) / W) * (uv.u1 - uv.u0)) * atlas.width;
      assert.ok(Math.abs(texel - (p.x + i + 0.5)) < 1e-9,
        `pixel ${i} samples texel ${texel}, wanted centre ${p.x + i + 0.5}`);
    }
  }
  // A degenerate 1px cell still yields a usable, non-inverted rect.
  const tiny = packAtlas([{ name: 'x', w: 1, h: 1 }]);
  assert.ok(tiny.uv.x.u1 >= tiny.uv.x.u0);
  assert.ok(tiny.uv.x.u0 > 0 && tiny.uv.x.u1 < 1);
});

test('packAtlas does not mutate its input list', () => {
  const sprites = [{ name: 'b', w: 8, h: 8 }, { name: 'a', w: 8, h: 8 }];
  const before = JSON.stringify(sprites);
  packAtlas(sprites);
  assert.equal(JSON.stringify(sprites), before, 'input order preserved (packer sorts a copy)');
});

// ---- the DisplayList and RenderPass views agree on population ----
test('every entity/wash/cursor/reticle DrawOp appears once in its pass', () => {
  const boot = loadBootFrame();
  const cam = cameras(boot).full;
  const list = composeScene(boot, cam, ASSETS);
  const passes = composePasses(boot, cam);
  const count = (arr, op) => arr.filter((o) => o.op === op).length;
  const terrainSrc = count(list, 'hull') + count(list, 'void') + count(list, 'floor') +
    count(list, 'debris') + count(list, 'wall');
  assert.equal(passes[0].ops.length, terrainSrc, 'terrain quad count matches source terrain ops');
  assert.equal(passes[1].ops.length, count(list, 'entity'));
  assert.equal(passes[3].ops.length, count(list, 'wash') + count(list, 'cursor') + count(list, 'reticle'));
});
