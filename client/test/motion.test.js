// C7 motion + animation tests — the PURE runtime (render/motion.js): per-cid tracking with the
// teleport/deck/fog/despawn reset matrix, deterministic walk-cycle frame selection and sub-tile
// interpolation, and the absence-tolerant sprite-variant selectors. No DOM, no clock; the executors
// (canvas2d/webgl2) and the sprite runtime are browser-only glue over these functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initMotion, trackMotion, motionByTile, walkFrameIndex, slideOffset, slideActive,
  deviceSpriteKey, pawnSpriteKey, pawnFrameKeys, WALK_FPS, WALK_HOLD_FRAMES, isAnimWalking,
  DEFAULT_STEP_MS, MIN_STEP_MS, MAX_STEP_MS,
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

// ---------------- continuous slide: step-anchored interpolation (nowMs flows in as data) ----------------

test('slideOffset glides origin→tile over the estimated interval and is deterministic at fixed nowMs', () => {
  // First sighting at t=0, then a step east at t=1000. Only ONE prior step exists → the interval is
  // the DEFAULT (no gap to measure yet), and the origin is the from-tile (5,5).
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 1000);
  const e = m.byCid[7];
  assert.equal(e.stepMs, 1000);
  assert.equal(e.interval, DEFAULT_STEP_MS);
  // at the step instant → still at the from-tile; half an interval later → half way; a full interval → arrived.
  assert.deepEqual(slideOffset(e, 1000), { ox: -1, oy: 0 }, 'progress 0 → at the from-tile');
  assert.deepEqual(slideOffset(e, 1000 + DEFAULT_STEP_MS / 2), { ox: -0.5, oy: 0 });
  assert.deepEqual(slideOffset(e, 1000 + DEFAULT_STEP_MS), { ox: 0, oy: 0 }, 'arrived → settled on the tile');
  // past the interval clamps to arrived; before it never over-shoots; a settled/untimed entry offsets 0.
  assert.deepEqual(slideOffset(e, 9999), { ox: 0, oy: 0 });
  assert.deepEqual(slideOffset(e, null), { ox: 0, oy: 0 });
  assert.deepEqual(slideOffset({ stepMs: null, x: 6, y: 5 }, 1000), { ox: 0, oy: 0 });
});

test('untimed frames (frozen screenshots) record no slide → every pawn reads settled', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));   // nowMs omitted
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]));                  // a real step, but untimed
  const e = m.byCid[7];
  assert.equal(e.walking, true, 'still a walk for the sprite cycle');
  assert.equal(e.stepMs, null, 'but no slide anchored');
  assert.deepEqual(slideOffset(e, 1234), { ox: 0, oy: 0 }, 'untimed → no glide');
  assert.equal(slideActive(e, 1234), false);
});

test('the per-cid interval is measured from the gap between two real steps (auto-adapts to sim speed)', () => {
  // step 1 at t=0, step 2 at t=200 → a 200 ms gap, EMA-smoothed toward from the 500 ms default.
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);      // first step: interval = default
  assert.equal(m.byCid[7].interval, DEFAULT_STEP_MS);
  m = trackMotion(m, frame(0, [[7, 5, 0, 7]]), 200);    // second step: gap 200 measured
  const iv = m.byCid[7].interval;
  assert.ok(iv > MIN_STEP_MS && iv < DEFAULT_STEP_MS, 'EMA pulled below the default toward 200 ms');
  assert.equal(iv, DEFAULT_STEP_MS + 0.5 * (200 - DEFAULT_STEP_MS), 'EMA weight 0.5');
});

test('interval estimate is clamped to a sane range (a huge gap cannot make the slide crawl forever)', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[7, 5, 0, 7]]), 1e9);   // absurd gap → clamped to MAX before smoothing
  const iv = m.byCid[7].interval;
  assert.equal(iv, DEFAULT_STEP_MS + 0.5 * (MAX_STEP_MS - DEFAULT_STEP_MS));
  assert.ok(iv <= MAX_STEP_MS);
});

test('a mid-slide re-step starts the new slide from the CURRENT interpolated position (no backward jump)', () => {
  // step to (6,5) anchored at t=0 with default interval; re-step to (7,5) at t=250 (half way there).
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[7, 5, 0, 7]]), DEFAULT_STEP_MS / 2); // pawn is visually at x≈5.5
  const e = m.byCid[7];
  assert.equal(e.x, 7);
  assert.ok(Math.abs(e.originX - 5.5) < 1e-9, 'origin is the mid-slide position, not the old tile');
  // at the re-step instant the drawn position is the origin (5.5), i.e. offset = 5.5 - 7 = -1.5 — a
  // forward continuation, never a snap back to 6.
  const off = slideOffset(e, DEFAULT_STEP_MS / 2);
  assert.ok(Math.abs(off.ox - (5.5 - 7)) < 1e-9, 'continues forward from where it was');
});

test('a step-less frame does NOT snap the pawn: the in-flight slide is carried across it', () => {
  // step anchored at t=0; another crew member steps at t=100 forcing a re-send where THIS pawn stood.
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);      // real step, slide anchored
  const stepless = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 100); // pawn stood; another crew stepped
  const e = stepless.byCid[7];
  assert.equal(e.walking, false, 'no new step');
  assert.equal(e.stepMs, 0, 'but the slide anchor is carried, not cleared');
  assert.ok(Math.abs(e.originX - 5) < 1e-9 && Math.abs(e.originY - 5) < 1e-9, 'origin carried');
  // the offset still interpolates from the carried anchor — no snap to the tile.
  const off = slideOffset(e, 100);
  assert.ok(off.ox < 0 && off.ox > -1, 'still gliding, not snapped to 0');
  assert.equal(slideActive(e, 100), true, 'slide still in flight → render loop stays alive');
});

test('a real stop settles the pawn onto its tile once the in-flight slide finishes', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);      // last step, anchored at t=0
  const e = m.byCid[7];
  assert.equal(slideActive(e, DEFAULT_STEP_MS - 1), true, 'still arriving just before the interval');
  assert.equal(slideActive(e, DEFAULT_STEP_MS), false, 'settled at the interval → loop idles');
  assert.deepEqual(slideOffset(e, DEFAULT_STEP_MS + 500), { ox: 0, oy: 0 }, 'sits on the tile');
});

test('teleport / deck change / fog reveal reset the slide (hard cut, never a glide)', () => {
  let base = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  base = trackMotion(base, frame(0, [[6, 5, 0, 7]]), 0);   // a real slide is in flight

  const tp = trackMotion(base, frame(0, [[9, 9, 0, 7]]), 100);
  assert.equal(tp.byCid[7].stepMs, null, 'teleport clears the slide');
  assert.deepEqual(slideOffset(tp.byCid[7], 100), { ox: 0, oy: 0 });
  assert.equal(slideActive(tp.byCid[7], 100), false);

  const dk = trackMotion(base, frame(1, [[6, 5, 0, 7]]), 100);
  assert.equal(dk.byCid[7].stepMs, null, 'a deck change clears the slide');

  const fog = trackMotion(base, frame(0, [[6, 5, 0, 7], [7, 5, 1, 99]]), 100);
  assert.equal(fog.byCid[99].stepMs, null, 'a freshly-revealed cid has no slide');
});

test('slideActive / slideOffset are null-tolerant (no entry, no clock)', () => {
  assert.equal(slideActive(null, 100), false);
  assert.equal(slideActive(undefined, 100), false);
  assert.deepEqual(slideOffset(null, 100), { ox: 0, oy: 0 });
  assert.deepEqual(slideOffset(undefined, 100), { ox: 0, oy: 0 });
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

// ---------------- walk-sprite hysteresis (WALK_HOLD_FRAMES) ----------------

test('sinceStep counts step-less frames and isAnimWalking holds the walk sprite across gaps', () => {
  const step = trackMotion(
    trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]])),
    frame(0, [[6, 5, 0, 7]]));
  assert.equal(step.byCid[7].walking, true);
  assert.equal(step.byCid[7].sinceStep, 0);
  assert.equal(isAnimWalking(step.byCid[7]), true);

  // One step-less frame: no longer "walking" (no slide) but the SPRITE stays on the walk cycle.
  const held1 = trackMotion(step, frame(0, [[6, 5, 0, 7]]));
  assert.equal(held1.byCid[7].walking, false, 'no slide without a real step');
  assert.equal(held1.byCid[7].sinceStep, 1);
  assert.equal(isAnimWalking(held1.byCid[7]), true, 'held within WALK_HOLD_FRAMES');
  assert.equal(held1.byCid[7].facing, 'E', 'facing survives the hold');

  // Beyond the hold the pawn settles to standing.
  let m = held1;
  for (let i = 0; i < WALK_HOLD_FRAMES; i++) m = trackMotion(m, frame(0, [[6, 5, 0, 7]]));
  assert.equal(m.byCid[7].sinceStep, 1 + WALK_HOLD_FRAMES);
  assert.equal(isAnimWalking(m.byCid[7]), false, 'a genuinely stopped pawn stands');
});

test('spawn / teleport / deck change never count as recently-walked', () => {
  const fresh = trackMotion(initMotion(), frame(0, [[3, 3, 0, 9]]));
  assert.equal(isAnimWalking(fresh.byCid[9]), false, 'first sighting stands');

  const walked = trackMotion(fresh, frame(0, [[4, 3, 0, 9]]));
  const tele = trackMotion(walked, frame(0, [[9, 9, 0, 9]]));
  assert.equal(isAnimWalking(tele.byCid[9]), false, 'a teleport resets the recency');

  const deck = trackMotion(walked, frame(1, [[4, 3, 0, 9]]));
  assert.equal(isAnimWalking(deck.byCid[9]), false, 'a deck change resets the recency');
  assert.equal(isAnimWalking(null), false);
  assert.equal(isAnimWalking(undefined), false);
});

// ---------------- slide-aware walk-sprite hold (busy scene: no standing ice-skate) ----------------

test('busy scene: the walk sprite is held for the WHOLE slide even when step-less frames outrun WALK_HOLD_FRAMES', () => {
  // A step anchored at t=0 with the default 500 ms interval, then a burst of step-less frames
  // (other crew stepping fast → the wire re-sends) every 50 ms: sinceStep climbs past the 2-frame
  // hold while the slide is still translating the body — the exact multi-walker case this guards.
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);
  for (let i = 1; i <= 6; i++) m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), i * 50); // t=50..300
  const e = m.byCid[7];
  assert.ok(e.sinceStep > WALK_HOLD_FRAMES, 'the fixed frame-count hold has expired');
  assert.equal(slideActive(e, 300), true, 'but the slide is still in flight');
  assert.equal(isAnimWalking(e, 300), true, 'so the walk sprite is HELD — no standing pose ice-skating');
});

test('the slide-held walk sprite settles to standing once the slide finishes', () => {
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]), 0);
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), 0);
  // age the frame-count hold out too, so only the slide clause could hold the sprite.
  for (let i = 1; i <= 6; i++) m = trackMotion(m, frame(0, [[6, 5, 0, 7]]), i * 50);
  const e = m.byCid[7];
  assert.equal(isAnimWalking(e, DEFAULT_STEP_MS - 1), true, 'still walking a hair before the interval');
  assert.equal(slideActive(e, DEFAULT_STEP_MS), false, 'slide settled at the interval');
  assert.equal(isAnimWalking(e, DEFAULT_STEP_MS), false, 'settled → standing sprite (frame hold also expired)');
});

test('frozen/untimed path: isAnimWalking falls back to the fixed frame-count hold (?t= snapshots unchanged)', () => {
  // Untimed frames record no slide (stepMs null → slideActive always false), so the classic 2-frame
  // hold governs exactly as before — nowMs=null must not regress deterministic screenshots.
  let m = trackMotion(initMotion(), frame(0, [[5, 5, 0, 7]]));
  m = trackMotion(m, frame(0, [[6, 5, 0, 7]]));               // walk (untimed)
  assert.equal(isAnimWalking(m.byCid[7], null), true, 'the step itself is walking');
  let held = trackMotion(m, frame(0, [[6, 5, 0, 7]]));        // sinceStep 1 ≤ hold
  assert.equal(isAnimWalking(held.byCid[7], null), true, 'held within WALK_HOLD_FRAMES');
  for (let i = 0; i < WALK_HOLD_FRAMES; i++) held = trackMotion(held, frame(0, [[6, 5, 0, 7]]));
  assert.equal(isAnimWalking(held.byCid[7], null), false, 'beyond the hold → standing, unchanged');
});
