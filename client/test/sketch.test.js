// THE SKETCH TREATMENT (src/render/sketch.js) — the MODULE's own suite.
//
// ⚠️ ADOPTED 2026-08-05, SO THE FRAMING CHANGED AND THE FILE DID NOT. This was the experiment's guard
// rail — "nothing in the shipping tree imports it, so there is no product behaviour to pin". Both
// halves of that are now false: `items/helpers.js` calls `sketch()` at the `item()` seam for all four
// paper catalogues and their 80 twins, at `LEVELS.strong`, on the owner's ruling. (47 until
// 2026-08-06, when lane/warm-purge re-authored the 21 mock-twinned fittings and the 12
// materials on paper and retired every warm registry row — re-measure at sketch-adoption.)
//
// The DIVISION OF LABOUR is what to read this file against. Here: the module in isolation — its
// determinism, its palette, its pass-through, and the ordering of the four levels. The ADOPTION —
// the seam, the amplitude bound, the box and ellipse and ramp restatements, the twin pairs, the
// invisible-ink probe — is `client/test/sketch-adoption.test.js`, and the four catalogue suites
// carry their own treated legs. Nothing here knows which catalogues are treated, and that is right:
// this file is about the post-processor, not about who calls it.
//
// ⛔ WHAT IT STILL DELIBERATELY DOES NOT CLAIM: any of this is a statement about how the treatment
// LOOKS. One class of quiet failure is worth naming at the top because it is the one an experiment
// can waste itself on and a product can ship: a treatment that silently did nothing.
//
// So every determinism assertion below carries its own NEGATIVE CONTROL. "Same input ⇒ same bytes" is
// satisfied perfectly by a function that returns its argument, which is exactly the outcome a broken
// parse produces (`parsePath` returns null ⇒ the element passes through untouched, on purpose). A pin
// that cannot tell "stable" from "inert" is the vacuous-guard shape this repo has paid for repeatedly,
// so each leg asserts BOTH that the bytes are stable AND that they moved.
//
// The visual judgement is NOT here and cannot be: `client/tools/sketch-sheet.mjs`,
// `client/tools/sketch-room-shot.mjs` and `client/tools/sketch-pairs-sheet.mjs` are the instruments
// for that, and the owner's eye is the judge.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as FT from '../src/items/fittings.js';
import { FITTING_IDS } from '../src/items/fittings.js';
import { sketch, LEVELS, LEVEL_IDS, hash32 } from '../src/render/sketch.js';

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
// ⚠️ THE RAW FRAGMENT — this file tests `sketch()` as a function, so it must feed it an UNTREATED
// input. Since the adoption the builders return a treated one by default, and passing that back in
// would be measuring the treatment applied twice.
const build = (id) => FT[camel(id)]({ w: 240, h: 240, idPrefix: `t-${id}`, sketch: false });
const SAMPLE = ['dining-table', 'bunk-bed', 'locker', 'capsule-sealed', 'cell-sound'];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. DETERMINISM — and the control that says it is not the determinism of a no-op
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐ same fragment + level + seed ⇒ byte-identical output, AND the output moved', () => {
  for (const id of SAMPLE) {
    const src = build(id);
    for (const lv of LEVEL_IDS) {
      const a = sketch(src, { level: lv, seed: id });
      const b = sketch(src, { level: lv, seed: id });
      assert.equal(a, b, `${id} @ ${lv}: two calls disagreed — something in the treatment is not a `
        + 'pure function of (fragment, level, seed)');
      // ⛔ THE CONTROL. Without this line the test above is passed byte-for-byte by `s => s`.
      assert.notEqual(a, src, `${id} @ ${lv}: the treatment returned the fragment UNCHANGED. That is `
        + 'what a failed parse looks like, and it is indistinguishable from a stable treatment.');
    }
  }
});

test('the seed is load-bearing: a different seed is a different hand, same geometry', () => {
  const src = build('locker');
  for (const lv of LEVEL_IDS) {
    const a = sketch(src, { level: lv, seed: 'locker' });
    const b = sketch(src, { level: lv, seed: 'locker@3,4' });
    assert.notEqual(a, b, `@ ${lv} two different seeds produced the same bytes — the wobble is not `
      + 'actually reading the seed, so two of a kind in one room are a stamp rather than a drawing');
    assert.equal(a.length > 0 && b.length > 0, true);
  }
});

test('no clock, no RNG, no locale API anywhere in the module — by source scan, with both controls', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, '../src/render/sketch.js'), 'utf8');
  // ⚠️ COMMENTS ARE STRIPPED FIRST (TRAPS-1). This file's own header talks about `Math.random` and
  // about clocks at length; a raw-text scan would be satisfied by that prose forever.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'toLocaleString', 'Intl.']) {
    assert.equal(code.includes(banned), false, `sketch.js calls ${banned} in CODE — the treatment `
      + 'would then differ between two renders of the same room, which is the one thing an '
      + 'experiment is still not allowed to do');
  }
  // (a) NEGATIVE CONTROL — the prose really does contain the banned strings, so the strip is doing work
  assert.equal(raw.includes('Math.random'), true,
    'the header no longer mentions Math.random, so the comment-stripping control above is vacuous');
  // (b) POSITIVE CONTROL — the scan must be able to see a call in code
  assert.equal((`${code}\nMath.random();`).includes('Math.random'), true);
});

test('hash32 is FNV-1a and is stable across the values the treatment actually asks for', () => {
  // The same three anchors `pawn-svg.test.js` pins its own copy against — two implementations of one
  // hash that nothing compares is how they come to disagree after a change nobody thought was one.
  assert.equal(hash32(''), 0x811c9dc5);
  assert.equal(hash32('a') >>> 0, hash32('a') >>> 0);
  assert.notEqual(hash32('locker|3|0|w1'), hash32('locker|3|0|w2'),
    'the CHANNEL does not change the hash — bow and overshoot would draw from one number, and every '
    + 'stroke would bow toward the end it grew past');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE TREATMENT DOES NOT INVENT COLOUR — measured over all 34, at every level
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ THIS IS THE ONE PRODUCT-ADJACENT PROPERTY WORTH PINNING EVEN IN AN EXPERIMENT, because it is the
// one the redesign's palette closure would otherwise have to re-derive: a post-processor that reached
// for a grey to fake a lighter stroke would break the charter's three-colour rule silently, and the
// sheet would look BETTER for it. Weight and knockout are the only ways this module is allowed to
// imply pressure.

test('⭐ no level introduces a colour the untreated set does not already emit', () => {
  const colours = (svg) => new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()));
  const base = new Set();
  for (const id of FITTING_IDS) for (const c of colours(build(id))) base.add(c);
  assert.deepEqual([...base].sort(), ['#14120F', '#7B2C22', '#E1D9C5', '#EBE4D1'],
    'the untreated set no longer emits exactly ink / oxblood / flat-side / paper — re-derive this list');
  for (const lv of LEVEL_IDS) {
    const after = new Set();
    for (const id of FITTING_IDS) for (const c of colours(sketch(build(id), { level: lv, seed: id }))) after.add(c);
    for (const c of after) {
      assert.equal(base.has(c), true, `${lv} emits ${c}, which the untreated set does not. There are `
        + 'THREE colours in this dialect and the treatment may not buy a fourth to fake a pen.');
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE UNKNOWN LEVEL IS A PASS-THROUGH, and that is what makes "original" a legal column
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('an unknown or absent level returns the fragment byte-identical', () => {
  const src = build('locker');
  for (const lv of [undefined, null, '', 'original', 'nope', 42]) {
    assert.equal(sketch(src, { level: lv, seed: 'locker' }), src,
      `level ${JSON.stringify(lv)} altered the fragment — the sheet's ORIGINAL column would then be `
      + 'showing a treated piece and every comparison on it would be against the wrong baseline');
  }
  assert.equal(sketch('', { level: 'hand' }), '');
  assert.equal(sketch(null, { level: 'hand' }), '');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE FOUR LEVELS ARE ORDERED, and `hand` is `medium` WITHOUT the knockout
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the levels are an ordered ramp, and `hand` is `medium` minus the knockout — plus ONE more', () => {
  const ids = ['subtle', 'medium', 'strong'];
  for (let i = 1; i < ids.length; i += 1) {
    const a = LEVELS[ids[i - 1]], b = LEVELS[ids[i]];
    assert.ok(b.overshoot > a.overshoot, `${ids[i]} does not overshoot more than ${ids[i - 1]}`);
    assert.ok(b.wave > a.wave, `${ids[i]} does not bow more than ${ids[i - 1]}`);
    assert.ok(b.ramp > a.ramp, `${ids[i]} does not open the ramp further than ${ids[i - 1]}`);
  }
  // ⭐ The recommendation IS an experimental result, so it is pinned as one — INCLUDING ITS ONE
  // CONFOUND, which the first draft of this comment claimed away. `hand` is `medium` with
  // `haloWiden`/`haloScope` taken out, AND `interior` lifted 0.85 → 0.88. That third term is small
  // and it is real: with the knockout gone nothing is eating the interior detail any more, so it is
  // drawn a shade heavier. ⛔ It means the pair is a knockout comparison WITH a confound rather than
  // a clean one, and the memo's "the knockout is the only thing wrong with medium" is an attribution
  // this pair cannot fully carry. Named here rather than absorbed; the `deepEqual` below is what
  // actually holds the line, and it has always listed `interior`.
  const diff = Object.keys(LEVELS.medium)
    .filter((k) => LEVELS.medium[k] !== LEVELS.hand[k]);
  assert.equal(LEVELS.hand.interiorOvershoot, LEVELS.medium.interiorOvershoot,
    'hand and medium disagree about the interior overshoot trim, so the pair is no longer a clean '
    + 'knockout-on / knockout-off control and the memo\'s attribution is no longer driven by them');
  assert.deepEqual(diff.sort(), ['haloScope', 'haloWiden', 'interior', 'label'].sort(),
    'hand and medium differ in more than the knockout, the label and the ONE named confound '
    + '(`interior`, 0.85 → 0.88), so the memo\'s attribution no longer describes this code');
  assert.equal(LEVELS.hand.interior, 0.88);
  assert.equal(LEVELS.medium.interior, 0.85);
  assert.equal(LEVELS.hand.haloWiden, 0);
  assert.equal(LEVELS.hand.haloScope, 'none');
});
