// C7 motion + animation tests — the PURE runtime (render/motion.js): per-cid tracking with the
// teleport/deck/fog/despawn reset matrix, deterministic walk-cycle frame selection and sub-tile
// interpolation, and the absence-tolerant sprite-variant selectors. No DOM, no clock; the executors
// (canvas2d/webgl2) and the sprite runtime are browser-only glue over these functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initMotion, trackMotion, motionByTile, walkFrameIndex, walkOffset,
  deviceSpriteKey, pawnSpriteKey, pawnFrameKeys, WALK_FPS,
} from '../src/render/motion.js';
import { C } from '../src/render/palette.js';

// crew tuple is [x, y, pv, cid]
const frame = (deck, crew) => ({ deck, crew });

// ---------------- per-cid tracking: the reset matrix ----------------

test('a contiguous one-tile step is a WALK with the right facing and origin', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));
  assert.equal(m.byCid[7].walking, false, 'first sighting is never a walk');
  // step east one tile
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]));
  const e = m.byCid[7];
  assert.equal(e.walking, true);
  assert.equal(e.facing, 'E');
  assert.deepEqual([e.fromX, e.fromY], [5, 5]);
  assert.deepEqual([e.x, e.y, e.dx, e.dy], [6, 5, 1, 0]);
});

test('reset matrix: teleport / deck change / fog reveal / despawn / standing all suppress walking', () => {
  // NORMAL step baseline (walk)
  let base = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));

  // TELEPORT: jump >1 tile → not a walk (reset to standing at the new tile)
  let tp = trackMotion(base, frame(0, [[9, 9, 0, 7]]));
  assert.equal(tp.byCid[7].walking, false, 'teleport is not a walk');
  assert.deepEqual([tp.byCid[7].x, tp.byCid[7].y], [9, 9]);

  // DECK CHANGE: same cid, one deck up, adjacent-looking tile → still not a walk
  let dk = trackMotion(base, frame(1, [[6, 5, 0, 7]]));
  assert.equal(dk.byCid[7].walking, false, 'a deck change resets, never walks');
  assert.equal(dk.deck, 1);

  // FOG REVEAL: a cid we never tracked appears next to where another stood → not a walk
  let fog = trackMotion(base, frame(0, [[5, 5, 0, 7], [6, 5, 1, 99]]));
  assert.equal(fog.byCid[99].walking, false, 'a newly-revealed cid is not walking');
  assert.equal(fog.byCid[7].walking, false, 'the standing cid stayed put');

  // DESPAWN: cid 7 gone from the crew → dropped from the tracker entirely
  let gone = trackMotion(base, frame(0, [[2, 2, 0, 8]]));
  assert.equal(gone.byCid[7], undefined, 'a despawned cid leaves the tracker');
  assert.equal(gone.byCid[8].walking, false);

  // STANDING: same tile twice → not a walk
  let stand = trackMotion(base, frame(0, [[5, 5, 0, 7]]));
  assert.equal(stand.byCid[7].walking, false, 'no movement is not a walk');
});

test('diagonal jumps count as teleports (only 4-neighbour steps walk)', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));
  m = trackMotion(m, frame(0, [[6, 6, 0, 7]])); // |dx|+|dy| = 2
  assert.equal(m.byCid[7].walking, false);
});

test('a cid-less crew tuple (older host frame) is skipped, never throws', () => {
  const m = trackMotion(initMotion(), frame(0, [[5, 5, 0]]));
  assert.deepEqual(m.byCid, {});
  assert.doesNotThrow(() => trackMotion(initMotion(), { deck: 0, crew: [null, 'x', [1, 2]] }));
});

test('trackMotion never mutates its inputs', () => {
  const prev = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));
  const snap = JSON.stringify(prev);
  const f = frame(0, [[6, 5, 0, 7]]);
  const fsnap = JSON.stringify(f);
  trackMotion(prev, f);
  assert.equal(JSON.stringify(prev), snap);
  assert.equal(JSON.stringify(f), fsnap);
});

test('motionByTile keys entries by their current tile', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7], [1, 2, 0, 8]]));
  m = trackMotion(m, frame(0, [[6, 5, 0, 7], [1, 2, 0, 8]]));
  const byTile = motionByTile(m);
  assert.equal(byTile['6,5'].walking, true);
  assert.equal(byTile['1,2'].walking, false);
  assert.equal(byTile['5,5'], undefined, 'the vacated tile is gone');
});

// ---------------- walk-cycle frame selection (deterministic from timeSec) ----------------

test('walkFrameIndex is a deterministic wrap of the time-driven cycle', () => {
  assert.equal(walkFrameIndex(0, 2), 0);
  assert.equal(walkFrameIndex(1 / WALK_FPS, 2), 1);          // one frame period → frame 1
  assert.equal(walkFrameIndex(2 / WALK_FPS, 2), 0);          // wraps back
  assert.equal(walkFrameIndex(0.5, 2), walkFrameIndex(0.5, 2)); // stable
  // single-frame or absent set collapses to 0; non-finite time is treated as 0
  assert.equal(walkFrameIndex(9.9, 1), 0);
  assert.equal(walkFrameIndex(9.9, 0), 0);
  assert.equal(walkFrameIndex(NaN, 2), 0);
  // a 3-frame cycle at a fixed time is exact
  assert.equal(walkFrameIndex(7 / WALK_FPS, 3), 1); // floor(7)=7, 7%3=1
});

// ---------------- interpolation determinism ----------------

test('walkOffset interpolates the remaining travel and is deterministic at fixed progress', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]])); // stepped east: from (5,5) to (6,5)
  const e = m.byCid[7];
  assert.deepEqual(walkOffset(e, 0), { ox: -1, oy: 0 }, 'progress 0 → still at the from-tile');
  assert.deepEqual(walkOffset(e, 1), { ox: 0, oy: 0 }, 'progress 1 → arrived at current tile');
  assert.deepEqual(walkOffset(e, 0.5), { ox: -0.5, oy: 0 });
  // clamps out-of-range progress; a non-walking entry never offsets
  assert.deepEqual(walkOffset(e, 2), { ox: 0, oy: 0 });
  assert.deepEqual(walkOffset(e, -1), { ox: -1, oy: 0 });
  assert.deepEqual(walkOffset({ walking: false }, 0.5), { ox: 0, oy: 0 });
});

// ---------------- sprite-variant selection (absence-tolerant) ----------------

test('deviceSpriteKey picks broken/off variants when present, base when absent', () => {
  const states = { scrubber: { off: 'x', broken: 'y' }, vent: { off: 'z' } };
  // broken colour → broken variant (wins even if also dim)
  assert.equal(deviceSpriteKey('scrubber', C.Broken, true, states), 'scrubber#broken');
  // unpowered (dim, or the folded DeviceDim tint) → off variant
  assert.equal(deviceSpriteKey('scrubber', C.Device, true, states), 'scrubber#off');
  assert.equal(deviceSpriteKey('scrubber', C.DeviceDim, false, states), 'scrubber#off');
  // powered + operational → base
  assert.equal(deviceSpriteKey('scrubber', C.Device, false, states), 'scrubber');
  // a role with only an `off` variant: broken falls back to base (no broken art)
  assert.equal(deviceSpriteKey('vent', C.Broken, false, states), 'vent');
  // a role missing from the states map entirely → always base (absence-tolerant)
  assert.equal(deviceSpriteKey('solar', C.Broken, true, states), 'solar');
  assert.equal(deviceSpriteKey('solar', C.Device, false, {}), 'solar');
});

test('pawnSpriteKey cycles frames while walking, base otherwise or when frames are absent', () => {
  const frames = { pawn: ['a', 'b'], pawn_b: ['c'] };
  assert.equal(pawnSpriteKey('pawn', true, 0, frames), 'pawn#w0');
  assert.equal(pawnSpriteKey('pawn', true, 1 / WALK_FPS, frames), 'pawn#w1');
  assert.equal(pawnSpriteKey('pawn', false, 0, frames), 'pawn', 'standing → base');
  assert.equal(pawnSpriteKey('pawn_b', true, 0, frames), 'pawn_b', 'single-frame set → base');
  assert.equal(pawnSpriteKey('pawn_c', true, 0, frames), 'pawn_c', 'no frame set → base');
  assert.equal(pawnSpriteKey('pawn', true, 0, {}), 'pawn', 'absent map → base');
});

test('pawnFrameKeys enumerates every walk frame for the atlas (empty when no multi-frame set)', () => {
  assert.deepEqual(pawnFrameKeys('pawn', { pawn: ['a', 'b'] }), ['pawn#w0', 'pawn#w1']);
  assert.deepEqual(pawnFrameKeys('pawn_b', { pawn_b: ['c'] }), []);
  assert.deepEqual(pawnFrameKeys('pawn', {}), []);
});
