// WebGL2 executor's PURE halves: the rasterization plan (rasterplan.js) and the backend/time
// selection logic (exec-select.js). Both are data-in/data-out — no DOM, no GL — so they are unit-
// testable here. The GL layer (gl.js) and the executor's DOM/GPU glue (webgl2.js) are DOM-touching
// and deliberately thin; they are exercised by the manual parity harness (client/tools/shot.mjs),
// not node. We reuse the same boot fixture + cameras the DisplayList/RenderPass goldens use.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadBootFrame, cameras, ASSETS } from './helpers.js';
import { composeScene } from '../src/render/compose.js';
import { buildPasses } from '../src/render/webgl/batch.js';
import {
  resolveTerrain, resolveEntity, resolveOverlay, collectCellKeys, atlasSignature, CELL, LOCK_TINT,
} from '../src/render/rasterplan.js';
import { chooseBackend, parseFrozenTime } from '../src/render/exec-select.js';
import { C, FG, HULL } from '../src/render/palette.js';

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}
/** A minimal URLSearchParams-like reader for exec-select tests. */
const search = (obj) => ({ get: (k) => (k in obj ? obj[k] : null) });

// ---- exec-select: backend choice ----
test('chooseBackend honours ?exec=webgl2 only when WebGL2 is available', () => {
  assert.equal(chooseBackend(search({ exec: 'webgl2' }), { webgl2Available: true }), 'webgl2');
  assert.equal(chooseBackend(search({ exec: 'webgl2' }), { webgl2Available: false }), 'canvas2d');
  assert.equal(chooseBackend(search({ exec: 'webgl2' }), {}), 'canvas2d');
  assert.equal(chooseBackend(search({ exec: 'canvas2d' }), { webgl2Available: true }), 'canvas2d');
  assert.equal(chooseBackend(search({}), { webgl2Available: true }), 'canvas2d'); // default
  assert.equal(chooseBackend(search({ exec: 'nonsense' }), { webgl2Available: true }), 'canvas2d');
});

// ---- exec-select: time freeze ----
test('parseFrozenTime reads a finite ?t=, else null', () => {
  assert.equal(parseFrozenTime(search({ t: '0' })), 0);
  assert.equal(parseFrozenTime(search({ t: '1.5' })), 1.5);
  assert.equal(parseFrozenTime(search({ t: '-2' })), -2);
  assert.equal(parseFrozenTime(search({})), null);
  assert.equal(parseFrozenTime(search({ t: '' })), null);
  assert.equal(parseFrozenTime(search({ t: 'abc' })), null);
});

// ---- terrain resolution ----
test('resolveTerrain: hull/void are flat fills; base tiles are atlas cells', () => {
  assert.deepEqual(resolveTerrain({ kind: 'hull', x: 0, y: 0 }), { flat: true, color: HULL });
  assert.equal(resolveTerrain({ kind: 'void', x: 0, y: 0 }).flat, true);
  // The silhouette contract: hull mass must stay a MUCH higher value than the space it sits in,
  // or the ship dissolves into the void (see palette.js "The three dark states").
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  assert.ok(lum(HULL) - lum(FG[C.Void]) > 25, `hull ${HULL} must out-value space ${FG[C.Void]}`);
  assert.deepEqual(resolveTerrain({ kind: 'floor', x: 0, y: 0 }), { cell: 'terrain:floor' });
  assert.deepEqual(resolveTerrain({ kind: 'wall', x: 0, y: 0 }), { cell: 'terrain:wall' });
  assert.deepEqual(resolveTerrain({ kind: 'wall_vert', x: 0, y: 0 }), { cell: 'terrain:wall_vert' });
  assert.deepEqual(resolveTerrain({ kind: 'debris', x: 0, y: 0 }), { cell: 'terrain:debris' });
  assert.equal(resolveTerrain({ kind: 'mystery', x: 0, y: 0 }), null);
});

// ---- entity resolution: sprite mode vs procedural mode ----
test('resolveEntity in sprite mode picks the sprite cell, carries facing + dim + lock overlay', () => {
  const solar = { kind: 'entity', x: 1, y: 1, sprite: 'solar', turns: 2, tint: 9, alpha: 0.7, glyph: 71, overlay: null };
  assert.deepEqual(resolveEntity(solar, true), { cell: 'spr:solar', alpha: 0.7, turns: 2, overlay: null });
  const locked = { kind: 'entity', x: 3, y: 3, sprite: 'door', turns: 0, tint: 11, alpha: 1, glyph: 88, overlay: 'lock-tint' };
  assert.deepEqual(resolveEntity(locked, true), { cell: 'spr:door', alpha: 1, turns: 0, overlay: LOCK_TINT });
});

test('resolveEntity in procedural mode bakes glyph+colour into a proc cell (no facing, no overlay)', () => {
  // Same solar op, but sprites off/not-ready → procedural cell keyed by glyph+effective colour.
  const solar = { kind: 'entity', x: 1, y: 1, sprite: 'solar', turns: 2, tint: 8, alpha: 1, glyph: 71, overlay: null };
  assert.deepEqual(resolveEntity(solar, false), { cell: 'proc:71:8', alpha: 1, turns: 0, overlay: null });
  // A glyph with no sprite is procedural even in sprite mode; dim folds into tint(9)+alpha(0.7).
  const item = { kind: 'entity', x: 4, y: 4, sprite: null, turns: 0, tint: 9, alpha: 0.7, glyph: 44, overlay: null };
  assert.deepEqual(resolveEntity(item, true), { cell: 'proc:44:9', alpha: 0.7, turns: 0, overlay: null });
});

// ---- overlay resolution ----
test('resolveOverlay: wash is flat; cursor/reticle are cells; reticle alpha tracks phase', () => {
  assert.deepEqual(resolveOverlay({ kind: 'wash', x: 0, y: 0, bg: 19 }), { flat: true, color: 'rgba(255,176,46,.20)' });
  assert.deepEqual(resolveOverlay({ kind: 'cursor', x: 0, y: 0 }), { cell: 'overlay:cursor', alpha: 1, turns: 0 });
  const r0 = resolveOverlay({ kind: 'reticle', x: 0, y: 0, phase: 0 });
  const r1 = resolveOverlay({ kind: 'reticle', x: 0, y: 0, phase: 1 });
  assert.equal(r0.cell, 'overlay:reticle');
  assert.ok(r1.alpha > r0.alpha, 'brighter at pulse peak');
  assert.ok(r0.alpha >= 0 && r1.alpha <= 1, 'alpha stays in [0,1]');
});

// ---- cell collection over the real boot frame ----
test('collectCellKeys over the boot frame: sprite mode yields sprite+terrain cells, sorted', () => {
  const boot = loadBootFrame();
  const passes = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  const keys = collectCellKeys(passes, true);
  assert.ok(keys.length > 0);
  assert.deepEqual(keys, [...keys].sort(), 'keys are sorted (deterministic atlas layout)');
  assert.ok(keys.includes('terrain:floor'), 'expected a floor cell');
  assert.ok(keys.some((k) => k.startsWith('spr:')), 'sprite mode uses sprite cells');
  // Spriteless glyphs (loose items, an open door) legitimately stay procedural even in sprite
  // mode — exactly as canvas2d falls through to a vector painter for them.
  for (const k of keys.filter((x) => x.startsWith('proc:'))) {
    const ch = String.fromCharCode(+k.split(':')[1]);
    assert.ok(',fso/'.includes(ch), `unexpected proc glyph '${ch}' in sprite mode`);
  }
});

test('collectCellKeys in procedural mode yields proc + terrain cells, never sprite cells', () => {
  const boot = loadBootFrame();
  const passes = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  const keys = collectCellKeys(passes, false);
  assert.ok(!keys.some((k) => k.startsWith('spr:')), 'procedural mode never samples sprite cells');
  assert.ok(keys.some((k) => k.startsWith('proc:')), 'procedural entity cells present');
  assert.ok(keys.includes('terrain:floor'));
});

// ---- atlas signature: rebuild trigger ----
test('atlasSignature changes with sprite mode, is stable per input, and never mutates', () => {
  const boot = loadBootFrame();
  const passes = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  deepFreeze(passes);
  const s = atlasSignature(passes, true);
  const p = atlasSignature(passes, false);
  assert.notEqual(s, p, 'sprite vs procedural atlases differ');
  assert.equal(atlasSignature(passes, true), s, 'stable for identical input');
  assert.ok(s.startsWith('s|') && p.startsWith('p|'), 'mode is the leading tag');
});

test('CELL is the sprite tile resolution (1:1 sprite cells)', () => {
  assert.equal(CELL, 128);
});

// ---- C7 animation variants: walk frames + device states thread through rasterplan ----

const crewQuad = (x, y, sprite = 'pawn') => ({ kind: 'entity', x, y, sprite, glyph: 64, tint: 5, alpha: 1 });
const devQuad = (sprite, tint, alpha) => ({ kind: 'entity', x: 1, y: 1, sprite, glyph: 70, tint, alpha });

test('resolveEntity samples a walk-frame cell for a walking pawn (by timeSec), base otherwise', () => {
  const frames = { pawn: ['a', 'b'] };
  const motion = { '2,2': { walking: true } };
  assert.equal(resolveEntity(crewQuad(2, 2), true, { frames, motion, timeSec: 0 }).cell, 'spr:pawn#w0');
  assert.equal(resolveEntity(crewQuad(2, 2), true, { frames, motion, timeSec: 1 / 6 }).cell, 'spr:pawn#w1');
  // standing pawn (no motion entry) → base cell; and no opts at all → base (backward compat)
  assert.equal(resolveEntity(crewQuad(2, 2), true, { frames, motion: {}, timeSec: 0 }).cell, 'spr:pawn');
  assert.equal(resolveEntity(crewQuad(2, 2), true).cell, 'spr:pawn');
});

test('resolveEntity samples a device state variant from colour/dim when the art exists, else base', () => {
  const states = { scrubber: { broken: 'x', off: 'y' } };
  assert.equal(resolveEntity(devQuad('scrubber', C.Broken, 1), true, { states }).cell, 'spr:scrubber#broken');
  assert.equal(resolveEntity(devQuad('scrubber', C.DeviceDim, 0.7), true, { states }).cell, 'spr:scrubber#off');
  assert.equal(resolveEntity(devQuad('scrubber', C.Device, 1), true, { states }).cell, 'spr:scrubber');
  // a role absent from the states map → base (absence-tolerant)
  assert.equal(resolveEntity(devQuad('solar', C.Broken, 1), true, { states }).cell, 'spr:solar');
});

test('collectCellKeys bakes EVERY walk frame for a walking pawn so the atlas is timeSec-stable', () => {
  const frames = { pawn: ['a', 'b'] };
  const passes = buildPasses([{ op: 'entity', x: 2, y: 2, g: 64, fg: 5, dim: false, role: null, turns: 0, pv: 0 }], {});
  const walking = { frames, motion: { '2,2': { walking: true } }, timeSec: 0 };
  const keys = collectCellKeys(passes, true, walking);
  assert.ok(keys.includes('spr:pawn#w0') && keys.includes('spr:pawn#w1'), 'both frames baked');
  // the atlas signature is identical across timeSec (all frames present, only the sample changes)…
  assert.equal(atlasSignature(passes, true, { ...walking, timeSec: 0 }),
    atlasSignature(passes, true, { ...walking, timeSec: 5 }));
  // …but differs from the standing case (a different cell set → a rebuild when walking begins)
  assert.notEqual(atlasSignature(passes, true, walking), atlasSignature(passes, true, {}));
});

test('static scenes are unaffected: no motion/maps → the same cell set as before (goldens stable)', () => {
  const boot = loadBootFrame();
  const passes = buildPasses(composeScene(boot, cameras(boot).full, ASSETS), { timeSec: 0 });
  // collectCellKeys with empty C7 opts must equal the legacy two-arg call.
  assert.deepEqual(collectCellKeys(passes, true, {}), collectCellKeys(passes, true));
  assert.equal(atlasSignature(passes, true, {}), atlasSignature(passes, true));
});
