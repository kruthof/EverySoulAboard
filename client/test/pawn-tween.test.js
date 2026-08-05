// pawn-tween.test.js — THE CLIENT-SIDE INTERPOLATION OF THE PAWN GLIDE.
//
// TWO MODULES, TWO KINDS OF EVIDENCE, AND THE SPLIT IS THE POINT.
//   · `pawn-tween-model.js` is PURE MATH — no DOM, no wire, no surface — so every one of its five
//     rules is a function call with an answer, and each rule below is driven rather than read.
//   · `pawn-layer.js` is NODE LIFECYCLE and nothing else, so it is drivable against a fifteen-line
//     recording element: node identity across a repaint, content rewritten only on change, and a
//     settled figure writing NOTHING are all observable without a browser.
// What neither can show is that a real crew member on a real ship moves smoothly. That is
// `client/tools/pawn-tween-shot.mjs`, which samples a walking pawn's screen rect at 60 Hz in Chrome.
//
// ⛔ THE MUTATION SECTION AT THE BOTTOM IS THE LOAD-BEARING HALF. Every rule here is a rule because
// its ABSENCE is a specific visible defect — a figure passing the newest sample the host approved, a
// re-path sliding a person across the ship, a paused ship whose crew keep creeping, an idle ship
// burning a frame every 16 ms. Each is applied to a REAL COPY of the shipped source, imported, and
// required to go red for the right reason. Nothing is edited in place (TRAPS §2): the mutant is
// written beside the original under a temp name and unlinked in a `finally`, so a crashed run cannot
// leave a mutated module behind for the next lane.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makePawnTween, makePausableClock, TWEEN } from '../src/ui/pawn-tween-model.js';
import { makePawnLayer, prefersReducedMotion } from '../src/ui/pawn-layer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '../src/ui');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0. The recording element — the smallest thing `makePawnLayer` can mount into.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Counts its own mutations, so "an idle frame writes nothing" is a number rather than a vibe. */
function recEl() {
  const e = {
    attributes: {}, dataset: {}, children: [], _html: '', htmlWrites: 0, attrWrites: 0,
    removed: false, ownerDocument: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.htmlWrites += 1; },
    setAttribute(k, v) { this.attributes[k] = String(v); this.attrWrites += 1; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    remove() { this.removed = true; },
  };
  e.ownerDocument = { createElementNS: () => recEl() };
  return e;
}

const part = (cid, x, y, html) => ({ cid, x, y, html: html || `<g class="art-${cid}"/>` });
const posMap = (pairs) => new Map(pairs.map(([k, x, y]) => [String(k), { x, y }]));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE INTERPOLATOR — the five rules, one leg each.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a fresh cid is placed EXACTLY at its sample and is settled (rule 4: no cold tween)', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 7, x: 4, y: 9, deck: 0 }], 1000);
  const p = tw.positions(1000).get('7');
  assert.deepEqual({ x: p.x, y: p.y }, { x: 4, y: 9 });
  assert.equal(p.moving, false, 'one sample is not a segment — there is nothing to interpolate');
  assert.equal(tw.settled(1000), true, 'a cold cid must not start an animation loop');
  // …and it stays there for as long as nothing else arrives. This is the FREEZE half of rule 3: an
  // idle ship sends no roster at all, so "no samples" is the normal state of a quiet ship.
  const later = tw.positions(1e6).get('7');
  assert.deepEqual({ x: later.x, y: later.y }, { x: 4, y: 9 }, 'a settled figure drifted');
});

test('two samples make a segment, and the tween walks it LINEARLY in measured time', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 4, y: 5, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: 4.5, y: 5, deck: 0 }], 100);   // measured interval: 100 ms
  const at = (t) => tw.positions(t).get('1');
  assert.equal(at(100).x, 4, 'the segment starts where the figure already was');
  assert.ok(Math.abs(at(150).x - 4.25) < 1e-9, `half way is half way (got ${at(150).x})`);
  assert.ok(Math.abs(at(175).x - 4.375) < 1e-9, 'three quarters is three quarters');
  assert.equal(at(200).x, 4.5, 'the tween arrives at the newest sample');
  assert.equal(at(100).moving, true);
  assert.equal(at(200).moving, false, 'arrival is settlement');
});

test('⛔ NO EXTRAPOLATION: the tween NEVER passes the newest sample, however late the next one is', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);
  for (const t of [200, 260, 500, 5000, 1e9]) {
    const p = tw.positions(t).get('1');
    assert.equal(p.x, 1, `at t=${t} the figure is at ${p.x}, past the last position the host approved`);
    assert.equal(p.u, 1);
  }
  // WHY IT MATTERS, stated as the contract it would break: room membership, the `N HERE` caption and
  // the Room Zoom's pawn hit test are all decided from the DRAWN tile at message cadence, against
  // this sample. A figure drawn past it stands on a tile nothing ever admitted her to.
  assert.equal(tw.settled(1e9), true);
});

test('⛔ SNAP, never tween, when the step is longer than SNAP_TILES (rule 2)', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: 30, y: 12, deck: 0 }], 100);   // a re-path / thaw / teleport
  const p = tw.positions(100).get('1');
  assert.deepEqual({ x: p.x, y: p.y }, { x: 30, y: 12 }, 'the figure slid across the ship instead of cutting');
  assert.equal(tw.settled(100), true, 'a snap is instantaneous — it must not arm a frame loop');

  // …and the threshold really is a threshold: just under it TWEENS, just over it SNAPS.
  const near = makePawnTween();
  near.sample([{ cid: 2, x: 0, y: 0, deck: 0 }], 0);
  near.sample([{ cid: 2, x: TWEEN.SNAP_TILES - 0.01, y: 0, deck: 0 }], 100);
  assert.equal(near.positions(100).get('2').x, 0, 'a long-but-legal walk step must still tween');
  const far = makePawnTween();
  far.sample([{ cid: 3, x: 0, y: 0, deck: 0 }], 0);
  far.sample([{ cid: 3, x: TWEEN.SNAP_TILES + 0.01, y: 0, deck: 0 }], 100);
  assert.equal(far.positions(100).get('3').x, TWEEN.SNAP_TILES + 0.01, 'one hair over the line must snap');
});

test('⛔ A DECK CHANGE SNAPS, whatever the tile distance says (rule 2, second trigger)', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 5, y: 5, deck: 0 }], 0);
  // A ladder step keeps X/Y — `PathService.GetNeighbors` emits it at the same tile — so the DISTANCE
  // test sees zero and would happily "tween" a person who is now a deck away. The deck is the only
  // thing that moved, and there is no fractional deck on the wire.
  tw.sample([{ cid: 1, x: 5, y: 5, deck: 1 }], 100);
  tw.sample([{ cid: 1, x: 5.4, y: 5, deck: 1 }], 200);
  const p = tw.positions(200).get('1');
  assert.equal(p.x, 5, 'the post-ladder segment must start from the ladder tile, not from a stale one');
  assert.equal(tw.positions(300).get('1').x, 5.4);
});

test('THE SEGMENT STARTS AT THE CURRENT DRAWN POINT — an early sample never jumps BACKWARDS (rule 5)', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);     // segment 0 → 1 over 100 ms
  const midX = tw.positions(140).get('1').x;             // 40 % across
  assert.ok(midX > 0.35 && midX < 0.45, `precondition: mid-flight at ${midX}`);
  tw.sample([{ cid: 1, x: 2, y: 0, deck: 0 }], 140);     // …and the next sample lands EARLY
  const after = tw.positions(140).get('1').x;
  assert.ok(Math.abs(after - midX) < 1e-9,
    `the figure teleported from ${midX} to ${after} the instant a sample arrived. Taking the PREVIOUS `
    + 'SAMPLE as the segment start snaps her back to where she already was — visible as a stutter, and '
    + 'as backwards motion in the 60 Hz witness.');
  // …and from there she goes FORWARD only.
  let prev = after;
  for (let t = 141; t <= 300; t += 1) {
    const x = tw.positions(t).get('1').x;
    assert.ok(x >= prev - 1e-12, `backwards motion at t=${t}: ${prev} → ${x}`);
    prev = x;
  }
  assert.equal(prev, 2, 'and she arrives');
});

test('THE INTERVAL IS MEASURED, so a game-speed change needs no special case', () => {
  // Same code, two cadences: 130 ms apart (1x) and 43 ms apart (3x — the render rate is FIXED at
  // 10 Hz, `GameSession.RenderSeconds`, so a faster ship makes each sample a bigger step, not a
  // more frequent one). Both must be exactly half way across at half the measured gap.
  for (const [gap, step] of [[130, 0.13], [43, 0.4], [100, 0.25]]) {
    const tw = makePawnTween();
    tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
    tw.sample([{ cid: 1, x: step, y: 0, deck: 0 }], gap);
    const half = tw.positions(gap + gap / 2).get('1').x;
    assert.ok(Math.abs(half - step / 2) < 1e-9, `gap ${gap}: half way is ${half}, wanted ${step / 2}`);
  }
});

test('the measured interval is CLAMPED, so a long gap cannot make the next step crawl', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  // She stood still for ten seconds (no roster is sent while nobody moves), then took a step.
  tw.sample([{ cid: 1, x: 0.2, y: 0, deck: 0 }], 10000);
  assert.equal(tw.settled(10000 + TWEEN.MAX_INTERVAL_MS), true,
    `a ${TWEEN.MAX_INTERVAL_MS} ms ceiling is what stops a ten-second gap from producing a `
    + 'ten-second crawl. The figure arrives early and FREEZES — bounded, and never extrapolation.');
  assert.equal(tw.positions(10000 + TWEEN.MAX_INTERVAL_MS).get('1').x, 0.2);
  // …and the floor stops a divide-by-zero and a same-millisecond double-send from being a teleport.
  const fast = makePawnTween();
  fast.sample([{ cid: 2, x: 0, y: 0, deck: 0 }], 0);
  fast.sample([{ cid: 2, x: 0.1, y: 0, deck: 0 }], 0);
  assert.ok(fast.positions(0).get('2').x < 0.1, 'a zero gap must not resolve instantly to the sample');
  assert.equal(fast.positions(TWEEN.MIN_INTERVAL_MS).get('2').x, 0.1);
});

test('a RESEND at the same position does not restart the segment', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);
  const before = tw.positions(150).get('1').x;
  tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 150);   // the same fx/fy arriving again
  assert.equal(tw.positions(150).get('1').x, before, 'a resend restarted the tween in place');
  assert.equal(tw.positions(200).get('1').x, 1, 'and the original segment still completes on time');
});

test('a cid that leaves the surface is FORGOTTEN, and returning is a cold start', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }, { cid: 2, x: 9, y: 9, deck: 0 }], 0);
  assert.equal(tw.size(), 2);
  tw.sample([{ cid: 1, x: 0.3, y: 0, deck: 0 }], 100);      // cid 2 left the room / the deck
  assert.equal(tw.size(), 1, 'a departed crew member is still buffered — she would glide back in from '
    + 'wherever she was when this surface last drew her');
  tw.sample([{ cid: 1, x: 0.6, y: 0, deck: 0 }, { cid: 2, x: 20, y: 3, deck: 0 }], 200);
  const back = tw.positions(200).get('2');
  assert.deepEqual({ x: back.x, y: back.y }, { x: 20, y: 3 },
    'she re-entered by SLIDING from her old position — the whole point of forgetting her is that '
    + 'membership has approved a new one and nothing approved the path between');
});

test('junk in a sample is ignored, never drawn at (0,0)', () => {
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 4, y: 4, deck: 0 }], 0);
  tw.sample([{ cid: 1, x: NaN, y: 4, deck: 0 }, null, { cid: 2, x: undefined, y: 1, deck: 0 }], 100);
  const p = tw.positions(100).get('1');
  assert.deepEqual({ x: p.x, y: p.y }, { x: 4, y: 4 }, 'a NaN sample moved the figure');
  assert.equal(tw.positions(100).has('2'), false, 'a cid whose only sample was junk was tracked anyway');
});

test('settled() is the loop\'s stop condition, and it flips both ways', () => {
  const tw = makePawnTween();
  assert.equal(tw.settled(0), true, 'an empty tween must never arm a frame');
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
  assert.equal(tw.settled(0), true);
  tw.sample([{ cid: 1, x: 0.5, y: 0, deck: 0 }], 100);
  assert.equal(tw.settled(100), false, 'a live segment must keep the loop alive');
  assert.equal(tw.settled(199), false);
  assert.equal(tw.settled(200), true, 'and the loop must stop the frame the segment is spent');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PAUSABLE CLOCK — freeze within one frame, and no creep.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the clock STOPS while the ship is held, and resumes the same segment', () => {
  let wall = 0;
  const clk = makePausableClock(() => wall);
  wall = 100; assert.equal(clk.tick(false), 100);
  wall = 200; assert.equal(clk.tick(true), 200, 'the hold begins NOW — the time before it still counts');
  wall = 5000; assert.equal(clk.tick(true), 200, 'the clock ran while the world was stopped');
  wall = 5100; assert.equal(clk.tick(false), 200, 'the resume frame still bills the paused interval');
  wall = 5200; assert.equal(clk.tick(false), 300, 'and time runs again from where it stopped');
});

test('DRIVEN: a pause mid-glide freezes the figure and it does NOT creep', () => {
  let wall = 0;
  const clk = makePausableClock(() => wall);
  const tw = makePawnTween();
  tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], clk.tick(false));
  wall = 100; tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], clk.tick(false));
  wall = 140; const running = tw.positions(clk.tick(false)).get('1').x;
  assert.ok(running > 0.3 && running < 0.5, `precondition: mid-glide at ${running}`);
  // THE HOLD, DECLARED ON A FRAME. `tick(true)` bills the 10 ms that really elapsed BEFORE the hold
  // was noticed — that is not creep, it is the last unpaused frame — and stops the clock from there.
  // "Freezes within one frame" is measured from that frame onwards, which is what a player sees.
  wall = 150; const atPause = tw.positions(clk.tick(true)).get('1').x;
  assert.ok(atPause >= running, 'the pause frame moved her backwards');
  // From here the wall clock runs for two seconds and the sim sends nothing.
  for (const w of [200, 400, 900, 2140]) {
    wall = w;
    const x = tw.positions(clk.tick(true)).get('1').x;
    assert.ok(Math.abs(x - atPause) < 1e-9,
      `the figure crept from ${atPause} to ${x} after the ship was held. A wall-clock tween runs out `
      + 'its segment — about 0.15 of a tile over ~130 ms — after the world has visibly stopped.');
  }
  // …and RESUME continues the same segment rather than snapping to its end.
  wall = 2200; const resumed = tw.positions(clk.tick(false)).get('1').x;
  assert.ok(Math.abs(resumed - atPause) < 1e-9, 'the resume frame itself jumped');
  wall = 2260; assert.ok(tw.positions(clk.tick(false)).get('1').x > atPause, 'she never started again');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE PERSISTENT LAYER — node identity, guarded writes, and the zero-work property.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('DRIVEN: a pawn node SURVIVES a re-sync — same object, not a look-alike', () => {
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass: 'pl-pawn' });
  layer.sync([part(1, 10, 20), part(2, 30, 40)]);
  const a = layer.node(1);
  const b = layer.node(2);
  assert.ok(a && b && a !== b);
  assert.equal(host.children.length, 2);
  // A REPAINT'S WORTH OF RE-SYNCS. If any of these replaced the node, an in-flight tween would be
  // lost — which is the entire reason this layer exists rather than the scene string.
  for (let i = 0; i < 10; i += 1) layer.sync([part(1, 10 + i, 20), part(2, 30, 40)]);
  assert.equal(layer.node(1), a, 'the node was replaced — node identity is the whole feature');
  assert.equal(layer.node(2), b);
  assert.equal(host.children.length, 2, 'the layer grew duplicates');
  assert.equal(a.getAttribute('data-cid'), '1', 'the hit test reads `data-cid`; it must survive too');
  assert.equal(a.dataset.cid, '1', '…and `dataset.cid`, which is the form `hitTest` actually reads');
  assert.equal(a.getAttribute('class'), 'pl-pawn', 'the class IS the hit test\'s selector');
});

test('DRIVEN: content is rewritten ONLY when the art changes', () => {
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass: 'pl-pawn' });
  layer.sync([part(1, 0, 0, '<g>IDLE</g>')]);
  const node = layer.node(1);
  assert.equal(node.htmlWrites, 1);
  for (let i = 0; i < 20; i += 1) layer.sync([part(1, i, i, '<g>IDLE</g>')]);
  assert.equal(node.htmlWrites, 1,
    'the figure\'s markup was rebuilt on every message. Twenty repaints a walk is twenty tear-downs '
    + 'of the sprite the tween is trying to move.');
  layer.sync([part(1, 0, 0, '<g>DIG</g>')]);   // she started a job: the work tag appeared
  assert.equal(node.htmlWrites, 2, 'a real content change must land');
  assert.match(node.innerHTML, /DIG/);
});

test('DRIVEN: place() moves the group, and a SETTLED pawn writes NOTHING', () => {
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass: 'pl-pawn' });
  layer.sync([part(1, 0, 0), part(2, 0, 0)]);
  const n1 = layer.node(1);
  assert.equal(layer.place(posMap([[1, 12.345, 67.891], [2, 5, 5]])), 2, 'both figures should have moved');
  assert.equal(n1.getAttribute('transform'), 'translate(12.35 67.89)');
  const attrsAfterPlace = n1.attrWrites;
  // ⛔ THE ZERO-WORK PROPERTY. An idle ship must not repaint pawns at all, and this is the half that
  // is a PROPERTY rather than a decision: even if a caller keeps calling, nothing is written.
  for (let i = 0; i < 60; i += 1) {
    assert.equal(layer.place(posMap([[1, 12.345, 67.891], [2, 5, 5]])), 0,
      'a settled figure was re-written — sixty of these a second is the cost this package exists to avoid');
  }
  assert.equal(n1.attrWrites, attrsAfterPlace, 'the settled node was touched');
  // …and a sub-pixel move DOES land, or the tween would be invisible.
  assert.equal(layer.place(posMap([[1, 12.35, 67.9], [2, 5, 5]])), 1);
  assert.equal(n1.getAttribute('transform'), 'translate(12.35 67.90)');
});

test('DRIVEN: a departed cid\'s node is REMOVED, and the map does not leak', () => {
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass: 'pl-pawn' });
  layer.sync([part(1, 0, 0), part(2, 0, 0), part(3, 0, 0)]);
  const gone = layer.node(2);
  layer.sync([part(1, 0, 0), part(3, 0, 0)]);
  assert.equal(layer.size(), 2, 'the layer still tracks a crew member this surface stopped drawing');
  assert.equal(layer.node(2), null);
  assert.equal(gone.removed, true, 'her node is still in the document — a ghost that never moves again');
  layer.clear();
  assert.equal(layer.size(), 0);
});

test('the reduced-motion query answers FALSE when it cannot be asked', () => {
  // The tween is the default and the opt-out is the exception: a node harness (no `matchMedia`) must
  // not silently disable the feature, or a suite would be pinning a fallback nobody ships.
  assert.equal(typeof globalThis.matchMedia, 'undefined', 'precondition: this harness has no matchMedia');
  assert.equal(prefersReducedMotion(), false);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. ⛔⛔ THE MUTATIONS — applied to a real copy of the shipped source, imported, required to fail.
//
// TRAPS §2: the original is NEVER edited. The mutant is written under a temp name beside it, the
// module is imported from that path, and the file is unlinked in a `finally` — so an assertion that
// throws mid-way cannot leave a mutated module on disk for the next lane. (Neither module imports
// anything, which is why writing the copy beside the original resolves identically.)
// ═════════════════════════════════════════════════════════════════════════════════════════════

let mutantSeq = 0;

/**
 * Copy `file`, apply `from` → `to`, import the copy, hand it to `fn`, delete it.
 * Asserts the replacement REALLY HAPPENED — a mutation whose pattern has rotted applies nothing and
 * the "red" that never comes reads as a passing guard (the vacuity this repo has paid for repeatedly).
 */
async function withMutant(file, from, to, fn) {
  const src = readFileSync(join(SRC, file), 'utf8');
  assert.ok(src.includes(from), `MUTATION PATTERN ROTTED in ${file}: ${JSON.stringify(from.slice(0, 60))} `
    + 'is not in the shipped source, so this mutation applies NOTHING and its test proves NOTHING.');
  const mutated = src.replace(from, to);
  assert.notEqual(mutated, src, 'the mutation changed no bytes');
  const name = `.mutant-${process.pid}-${mutantSeq += 1}-${file}`;
  const path = join(SRC, name);
  writeFileSync(path, mutated);
  try {
    return await fn(await import('../src/ui/' + name));
  } finally {
    try { unlinkSync(path); } catch { /* already gone */ }
  }
}

/** Run `body` against a mutant and require it to throw. Returns the message, for a reason check. */
async function mustGoRed(what, file, from, to, body) {
  let threw = null;
  await withMutant(file, from, to, (mod) => {
    try { body(mod); } catch (e) { threw = e; }
  });
  assert.ok(threw, `MUTATION SURVIVED — ${what}. The guard that should have caught it is not `
    + 'measuring what its name claims.');
  return String(threw && threw.message);
}

test('MUTATION 1: extrapolation enabled ⇒ the tween passes the newest sample ⇒ RED', async () => {
  const msg = await mustGoRed(
    'the tween ran past the last position the host approved and nothing noticed',
    'pawn-tween-model.js',
    'const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);',
    'const clamp01 = (v) => (v < 0 ? 0 : v);',
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
      tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);
      assert.equal(tw.positions(400).get('1').x, 1, 'extrapolated past the sample');
    },
  );
  assert.match(msg, /extrapolated/, 'red for the WRONG reason — this must be the clamp, not a crash');
});

test('MUTATION 2: the snap threshold dropped ⇒ a re-path tweens across the ship ⇒ RED', async () => {
  const msg = await mustGoRed(
    'a teleport was interpolated — a figure sliding through the hull at speed',
    'pawn-tween-model.js',
    'SNAP_TILES: 1.5,',
    'SNAP_TILES: 1e9,',
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
      tw.sample([{ cid: 1, x: 30, y: 12, deck: 0 }], 100);
      const p = tw.positions(100).get('1');
      assert.deepEqual({ x: p.x, y: p.y }, { x: 30, y: 12 }, 'the teleport was tweened');
      assert.equal(tw.settled(100), true, 'a snap armed a frame loop');
    },
  );
  assert.match(msg, /tweened|frame loop/, 'red for the wrong reason');
});

test('MUTATION 3: the deck-change snap removed ⇒ a ladder step tweens ⇒ RED', async () => {
  await mustGoRed(
    'a crew member climbing a ladder kept a segment from the deck she left',
    'pawn-tween-model.js',
    'if (deck !== prev.deck || step > snapTiles) {',
    'if (step > snapTiles) {',
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 5, y: 5, deck: 0 }], 0);
      tw.sample([{ cid: 1, x: 5.4, y: 5, deck: 0 }], 100);   // walking on deck 0
      tw.sample([{ cid: 1, x: 5.4, y: 5, deck: 1 }], 140);   // …then a ladder, mid-step
      assert.equal(tw.settled(140), true, 'the deck change left an unspent segment behind');
    },
  );
});

test('MUTATION 4: a cold cid tweens ⇒ a figure slides in from nowhere ⇒ RED', async () => {
  await mustGoRed(
    'the first sighting of a crew member started a segment, so she glides in from her cold start',
    'pawn-tween-model.js',
    'recs.set(key, { ax: x, ay: y, bx: x, by: y, t0: now, dur: 0, deck, arr: now });',
    'recs.set(key, { ax: 0, ay: 0, bx: x, by: y, t0: now, dur: 130, deck, arr: now });',
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 7, y: 9, deck: 0 }], 1000);
      const p = tw.positions(1000).get('1');
      assert.deepEqual({ x: p.x, y: p.y }, { x: 7, y: 9 }, 'a cold cid was not placed at its sample');
      assert.equal(tw.settled(1000), true, 'a cold cid armed a frame loop');
    },
  );
});

test('MUTATION 5: settled() always false ⇒ the idle loop never stops ⇒ RED', async () => {
  await mustGoRed(
    'an idle ship would keep a rAF alive forever, redrawing a stationary drawing 60 times a second',
    'pawn-tween-model.js',
    "for (const r of recs) if (r[1].dur > 0 && now - r[1].t0 < r[1].dur) return false;\n    return true;",
    "for (const r of recs) if (r[1].dur >= 0) return false;\n    return true;",
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 4, y: 4, deck: 0 }], 0);
      assert.equal(tw.settled(0), true, 'a ship where nobody is walking reports itself as animating');
      tw.sample([{ cid: 1, x: 4.3, y: 4, deck: 0 }], 100);
      assert.equal(tw.settled(400), true, 'a finished walk never releases the loop');
    },
  );
});

test('MUTATION 6: the segment starts at the previous SAMPLE ⇒ backwards motion ⇒ RED', async () => {
  await mustGoRed(
    'an early sample snapped the figure back to where she already was',
    'pawn-tween-model.js',
    'const cur = at(prev, now);                               // rule 5 — start from what is DRAWN',
    'const cur = { x: prev.bx, y: prev.by };',
    (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
      tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);
      const mid = tw.positions(140).get('1').x;
      tw.sample([{ cid: 1, x: 2, y: 0, deck: 0 }], 140);
      assert.ok(Math.abs(tw.positions(140).get('1').x - mid) < 1e-9, 'the figure jumped on a sample');
    },
  );
});

test('MUTATION 7: the pausable clock ignores the hold ⇒ the figure creeps after the world stops ⇒ RED', async () => {
  await mustGoRed(
    'a held ship kept advancing the tween — the crew creep for another ~130 ms after everything stops',
    'pawn-tween-model.js',
    'if (!paused) clock += Math.max(0, w - wall);',
    'clock += Math.max(0, w - wall);',
    (mod) => {
      let wall = 0;
      const clk = mod.makePausableClock(() => wall);
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], clk.tick(false));
      wall = 100; tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], clk.tick(false));
      wall = 140; const atPause = tw.positions(clk.tick(false)).get('1').x;
      wall = 150; clk.tick(true);
      wall = 900;
      assert.ok(Math.abs(tw.positions(clk.tick(true)).get('1').x - atPause) < 1e-9, 'she crept while held');
    },
  );
});

test('MUTATION 8: the place() guard removed ⇒ a settled pawn is written every frame ⇒ RED', async () => {
  await mustGoRed(
    'a stationary figure had its transform rewritten 60 times a second',
    'pawn-layer.js',
    'if (rec.tx === tx && rec.ty === ty) continue;',
    'if (false) continue;',
    (mod) => {
      const host = recEl();
      const layer = mod.makePawnLayer(host, { groupClass: 'pl-pawn' });
      layer.sync([part(1, 0, 0)]);
      layer.place(posMap([[1, 3, 4]]));
      assert.equal(layer.place(posMap([[1, 3, 4]])), 0, 'a settled figure was re-written');
    },
  );
});

test('MUTATION 9: the sync() content guard removed ⇒ the sprite is torn down every message ⇒ RED', async () => {
  await mustGoRed(
    'the figure\'s markup was rebuilt on every roster message, destroying what the tween is moving',
    'pawn-layer.js',
    'if (rec.html !== p.html) { rec.el.innerHTML = p.html; rec.html = p.html; }',
    'rec.el.innerHTML = p.html; rec.html = p.html;',
    (mod) => {
      const host = recEl();
      const layer = mod.makePawnLayer(host, { groupClass: 'pl-pawn' });
      layer.sync([part(1, 0, 0, '<g>IDLE</g>')]);
      for (let i = 0; i < 5; i += 1) layer.sync([part(1, i, 0, '<g>IDLE</g>')]);
      assert.equal(layer.node(1).htmlWrites, 1, 'unchanged art was re-written');
    },
  );
});

test('MUTATION 10: sync() keeps departed cids ⇒ a ghost that never moves again ⇒ RED', async () => {
  await mustGoRed(
    'a crew member who left the room stayed drawn where this surface last saw her',
    'pawn-layer.js',
    "for (const [k, rec] of Array.from(recs)) {\n      if (!seen.has(k)) { rec.el.remove(); recs.delete(k); }\n    }",
    '/* removal disabled */',
    (mod) => {
      const host = recEl();
      const layer = mod.makePawnLayer(host, { groupClass: 'pl-pawn' });
      layer.sync([part(1, 0, 0), part(2, 0, 0)]);
      layer.sync([part(1, 0, 0)]);
      assert.equal(layer.size(), 1, 'a departed crew member is still drawn');
    },
  );
});

// ── the mutation harness's OWN controls ──────────────────────────────────────────────────────
//
// A rig that reports "RED" for a mutation it never applied, or that would report red for ANY edit,
// is worse than no rig. Both directions, driven.

test('CONTROL: an inert edit to the same file does NOT go red', async () => {
  // A comment-only change is a real replacement in a real copy — if the harness reddens on this, its
  // reds above say nothing about the mutations they name.
  await withMutant('pawn-tween-model.js', 'export const TWEEN = Object.freeze({',
    '/* inert */\nexport const TWEEN = Object.freeze({', (mod) => {
      const tw = mod.makePawnTween();
      tw.sample([{ cid: 1, x: 0, y: 0, deck: 0 }], 0);
      tw.sample([{ cid: 1, x: 1, y: 0, deck: 0 }], 100);
      assert.equal(tw.positions(150).get('1').x, 0.5, 'the unmutated behaviour changed');
      assert.equal(tw.settled(200), true);
    });
});

test('CONTROL: a mutation whose pattern has rotted FAILS LOUDLY instead of passing', async () => {
  await assert.rejects(
    () => withMutant('pawn-tween-model.js', 'a string that is definitely not in the source', 'x', () => {}),
    /MUTATION PATTERN ROTTED/,
    'a pattern that matches nothing must stop the run, not silently apply nothing and pass');
});
