// Tests for THE INK FIGURES (src/render/pawn-svg.js). No DOM, no GPU, no jsdom — the builders are
// pure string functions of crew data.
//
// ── WHAT MOVED, AND WHY IT MOVED RATHER THAN VANISHING ────────────────────────────────────────
// This suite used to pin the warm skin's two non-negotiables: the amber rim-light
// (`fill="rgba(242,181,99,.4)"`) and the black ground-shadow ellipse (`fill="rgba(0,0,0,.35)"`).
// Neither colour exists in the paper dialect, so both pins are TRANSLATED here, in the same commit
// that changed the art (charter §1 / ruling E3 — "never weakened, translated"):
//
//   amber rim-light  →  THE PAPER KNOCKOUT PASS. Its job was the same job: separate the figure from
//                       whatever it stands on. The new spelling is stronger, because the knockout is
//                       structural rather than a colour — the test below pins that the halo pass
//                       exists, that it comes FIRST, that it carries EVERY element of the ink pass,
//                       and that each of its strokes is exactly `widen` wider. A one-sided rim could
//                       never be checked that way.
//   ground shadow    →  THE INK GROUND LINE. The design's own (`M110 284 L206 284`,
//                       `stroke-width 0.7 opacity 0.35`, `Perilune Game.dc.html` line 420). A figure
//                       on paper does not cast a shadow; it stands on a rule.
//
// Also translated: `resolvePawnLook` no longer returns a per-role uniform hue and per-soul skin/hair
// (colour stopped distinguishing people at ruling E3). It returns the FIGURE — build · topper · mark
// · prop · stature — and the tests that asserted "the role's hue reaches the fragment" now assert
// "the role's PROP reaches the fragment", which is the same contract in the new dialect.
//
// NEW pins, each one earned by a defect this package actually shipped and then measured away:
//   · the chip's clip and its transform must be on DIFFERENT elements (they were on one; every chip
//     rendered as an empty ellipse and no string assertion could see it);
//   · a prop and the keepsake mug must be clear of the body's widest half-width (they straddled the
//     coat line on all three builds);
//   · the stature must survive the emitted rounding (a 2-dp round collapses two of the three).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  pawnSprite, pawnChip, resolvePawnLook, figurePaths, inkFigure, roleProp,
  BUILDS, BUILD_IDS, TOPPERS, MARKS, PROPS, ROLE_PROP, STATURES, MOCK_CREW,
} from '../src/render/pawn-svg.js';
import { ghost, GHOST, INK, PAPER, ATTEND } from '../src/render/oblique.js';
import { ROLE_HUE, ROLE_FALLBACK, roleHue } from '../src/theme/paper-tokens.js';
import { codeOnly } from './code-only.js';

const HEX = /^#[0-9a-f]{6}$/i;
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'render', 'pawn-svg.js'), 'utf8');

/** Every `id="…"` in a fragment (the collision surface). */
function idsIn(svg) {
  return [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
}

/** Every drawable element in a fragment, in document order, as `{ tag, attrs }`. */
function elementsIn(svg) {
  return [...svg.matchAll(/<(path|ellipse|rect|circle)\b([^>]*)\/>/g)].map((m) => ({
    tag: m[1],
    attrs: Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  }));
}

/**
 * Split a two-pass FIGURE (not a whole sprite) into [haloElements, inkElements].
 * ⚠️ Hand it `inkFigure(...)`, never `pawnSprite(...)`: the sprite also carries the ground line,
 * which belongs to neither pass and made the first version of this helper report 15 vs 16.
 */
function passes(figure) {
  const i = figure.indexOf('<g stroke-linejoin="round" stroke-linecap="round">');
  assert.ok(i >= 0, 'no knockout <g> — the halo pass is gone');
  const j = figure.indexOf('</g>', i);
  return [elementsIn(figure.slice(i, j)), elementsIn(figure.slice(j))];
}

/** The sprite's own pen weight. Pinned here because the sprite must EMBED exactly this figure. */
const SPRITE_WEIGHT = 1.9;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. Both forms build real anatomy, and the ROLE reaches the figure
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('pawnSprite + pawnChip build non-empty SVG for every ROLE_HUE role', () => {
  for (const role of Object.keys(ROLE_HUE)) {
    for (const build of [pawnSprite, pawnChip]) {
      const svg = build({ role, cid: role });
      assert.equal(typeof svg, 'string');
      assert.ok(svg.startsWith('<g'), `${build.name}(${role}) is a <g> fragment`);
      assert.ok(svg.trimEnd().endsWith('</g>'), `${build.name}(${role}) closes its <g>`);
      // real anatomy, not an empty shell: the thinnest build is 10 body paths + a prop
      assert.ok(elementsIn(svg).length >= 10, `${build.name}(${role}) has a body`);
    }
  }
});

// MUTATION: return 'none' from `roleProp` ⇒ every leg below goes red (the prop shapes vanish).
test("the ROLE reaches the figure as its PROP — the hue pin, translated", () => {
  // Every ROLE_HUE id has a prop, and the table is pinned key-for-key so a new role cannot land
  // propless by accident.
  assert.deepEqual(Object.keys(ROLE_PROP).sort(), Object.keys(ROLE_HUE).sort(),
    'ROLE_PROP and ROLE_HUE must cover the same roles');
  for (const id of Object.keys(ROLE_HUE)) {
    assert.ok(PROPS.includes(ROLE_PROP[id]), `${id} → ${ROLE_PROP[id]} is not a prop`);
    assert.notEqual(ROLE_PROP[id], 'none', `${id} carries nothing`);
    // the free `RoleNow` phrase matcher lands on the same prop as the bare id
    assert.equal(roleProp(id), ROLE_PROP[id], `${id} did not resolve through roleHue()`);
  }
  // …and the prop is what actually differs in the emitted bytes: one soul, eight roles, eight figures
  const byRole = new Set(Object.keys(ROLE_HUE).map((r) => pawnSprite({ cid: 'one-soul', role: r })));
  assert.equal(byRole.size, Object.keys(ROLE_HUE).length,
    'the role no longer changes the drawing — "which pawn can do what" went invisible');
});

test('the mock crew resolve through the FREE role phrases, not just the bare ids', () => {
  // MOCK_CREW roles are `RoleNow` phrases ("reactor watch", "ship's medic") on purpose: the matcher
  // is exercised end-to-end here or nowhere.
  assert.equal(resolvePawnLook(MOCK_CREW[2]).prop, ROLE_PROP.reactor, 'reactor watch → reactor');
  assert.equal(resolvePawnLook(MOCK_CREW[4]).prop, ROLE_PROP.medic, "ship's medic → medic");
  assert.equal(resolvePawnLook(MOCK_CREW[6]).prop, ROLE_PROP.stores, 'stores & logistics → stores');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐ THE TWO-PASS STRUCTURE — the rim-light pin, translated (charter §1, ruling E10)
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION 1: `ghost(..., { halo: false })` in `inkFigure` ⇒ no knockout <g> ⇒ RED at `passes()`.
// MUTATION 2: emit `ink + halo` instead of `halo + ink` ⇒ RED on the ordering leg.
// MUTATION 3: drop `widen` (pass 0) ⇒ RED on the width leg.
test('⭐ the in-world pawn is TWO PASSES: paper knockout FIRST, then ink', () => {
  for (const c of MOCK_CREW) {
    const figure = inkFigure(c, { weight: SPRITE_WEIGHT });
    // the sprite is that figure, seated — not a second drawing of it
    assert.ok(pawnSprite(c).includes(figure), `${c.cid}: the sprite does not embed inkFigure()`);
    const [halo, ink] = passes(figure);

    // (a) the halo carries EVERY element of the ink pass — a knockout that misses a limb leaves that
    //     limb sitting raw on the hatch, which is the failure a one-sided rim-light could not even
    //     express.
    assert.equal(halo.length, ink.length, `${c.cid}: the two passes do not carry the same elements`);
    for (let i = 0; i < halo.length; i++) {
      assert.equal(halo[i].tag, ink[i].tag, `${c.cid}: pass shapes diverge at element ${i}`);
      for (const k of ['d', 'cx', 'cy', 'rx', 'ry', 'x', 'y', 'width', 'height']) {
        assert.equal(halo[i].attrs[k], ink[i].attrs[k],
          `${c.cid}: element ${i} has different ${k} in the two passes — TWO path lists, not one`);
      }
    }

    // (b) the knockout is PAPER, filled as well as stroked (that is what carves the silhouette out)
    for (const e of halo) {
      assert.equal(e.attrs.stroke, PAPER, `${c.cid}: knockout stroke is not paper`);
      assert.equal(e.attrs.fill, PAPER, `${c.cid}: knockout is not filled — it outlines, it knocks nothing out`);
    }

    // (c) and it is WIDER by exactly the widen term, at the sprite's own pen weight
    for (let i = 0; i < halo.length; i++) {
      const w = Number(halo[i].attrs['stroke-width']), k = Number(ink[i].attrs['stroke-width']);
      assert.ok(w > k, `${c.cid}: knockout ${w} is not wider than the ink ${k}`);
      assert.ok(Math.abs((w - k) - GHOST.widen * SPRITE_WEIGHT) < 0.02,
        `${c.cid}: knockout is ${w - k} wider; the design's rule is widen × the pen weight`);
    }
  }
});

test('⭐ ONE path list feeds both passes — figurePaths is the single source', () => {
  const desc = MOCK_CREW[3];
  const paths = figurePaths(desc, SPRITE_WEIGHT);
  const [halo, ink] = passes(inkFigure(desc, { weight: SPRITE_WEIGHT }));
  assert.equal(paths.length, halo.length, 'the emitted halo is not the resolved path list');
  assert.equal(paths.length, ink.length, 'the emitted ink is not the resolved path list');
  // and the seam is reusable at any scale — the portrait scale the design draws at, unchanged
  const portrait = inkFigure(desc, { weight: 1 });
  assert.ok(portrait.includes(paths[0].d ? paths[0].d : ''), 'the portrait scale re-authors geometry');
});

test('inkFigure({halo:false}) is a SINGLE pass — the design\'s own crew-dock treatment', () => {
  const one = inkFigure(MOCK_CREW[0], { weight: 1, halo: false });
  assert.equal(one.includes('<g stroke-linejoin'), false, 'a knockout pass survived halo:false');
  assert.equal(one.includes(`stroke="${PAPER}"`), false, 'paper strokes survived halo:false');
  assert.ok(elementsIn(one).length >= 10, 'the ink pass itself went missing');
  // …and the option is honoured by `ghost` itself, not faked downstream of it
  assert.equal(ghost([{ d: 'M0 0 L1 1', sw: 1 }], { halo: false }).includes('<g '), false);
  assert.ok(ghost([{ d: 'M0 0 L1 1', sw: 1 }]).includes('<g '), 'the default must still be two passes');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE GROUND — the shadow-ellipse pin, translated
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: delete the ground-line path from `pawnSprite` ⇒ RED.
test('the in-world pawn stands on the design\'s INK GROUND LINE (was: the shadow ellipse)', () => {
  const p = pawnSprite(MOCK_CREW[0]);
  const line = elementsIn(p).find((e) => e.attrs.opacity === '0.35' && e.tag === 'path'
    && /^M[\d.]+ 23\.5 L[\d.]+ 23\.5$/.test(e.attrs.d || ''));
  assert.ok(line, 'no ground line under the pawn');
  assert.equal(line.attrs.stroke, INK, 'the ground line is not ink');
  assert.equal(line.attrs.fill, 'none', 'the ground line is filled');
  // it is BELOW the feet (23) and INSIDE the 24-unit box — a rule the figure stands on, not one it
  // stands in front of.
  const [, y] = /L[\d.]+ ([\d.]+)$/.exec(line.attrs.d);
  assert.ok(Number(y) > 23 && Number(y) < 24, `ground line at y=${y} is not just under the feet`);
  // the CHIP has no ground line — it is a bust in a well, not a person on a floor (design line 261)
  assert.equal(/ 23\.5 L/.test(pawnChip(MOCK_CREW[0])), false, 'the chip grew a ground line');
});

// MUTATION: change `translate(8 23)` to any other pair ⇒ RED. Both standard surfaces seat the pawn
// with `translate(fx − 8·S, fy − 23·S)`; this anchor is a CONTRACT, not a detail.
test('⭐ the sprite\'s FEET ANCHOR is (8,23) — the contract both surfaces seat pawns by', () => {
  for (const c of MOCK_CREW) {
    assert.match(pawnSprite(c), /<g transform="translate\(8 23\) scale\(/,
      `${c.cid}: the feet moved out from under overview-scene.js:635 / roomzoom-view.js:907`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. Deterministic per (cid, role), distinct across the crew
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('resolvePawnLook is deterministic per (cid, role)', () => {
  for (const c of MOCK_CREW) {
    const a = resolvePawnLook(c);
    const b = resolvePawnLook({ cid: c.cid, role: c.role });
    assert.deepEqual(a, b, `${c.cid} resolves identically across calls`);
    // and the whole rendered fragment is byte-identical for the same soul — no cache, no clock, no RNG
    assert.equal(pawnSprite(c), pawnSprite({ cid: c.cid, role: c.role }));
    assert.equal(pawnChip(c), pawnChip({ cid: c.cid, role: c.role }));
  }
  // ⚠️ THE LEGS ABOVE COMPARE TWO CALLS IN ONE PROCESS, AND THAT IS NOT ALL OF DETERMINISM.
  // Measured by mutation: seeding a `Math.random()` into a path literal in the frozen BUILDS table
  // SURVIVED every assertion in this file, because a module-scope literal is evaluated ONCE at import
  // — every figure in the process then shares the same wrong coordinate and the comparisons above all
  // agree. Nothing else in the client suite hashes an SVG, so a load-time RNG (or clock, or locale
  // call) would ship silently. The source scan is the only instrument that can see it, and it reads
  // CODE, not prose (TRAPS 1). The same scan bars a MEMO TABLE, which would make the two-call legs
  // above vacuous rather than true — the cheap answer to E10 that must not be taken quietly.
  const code = codeOnly(SRC);
  const FORBIDDEN = ['Math.random', 'Date.', 'new Date', 'performance.', 'toLocaleString', 'Intl.',
    'new Map(', 'new WeakMap(', 'cache'];
  for (const forbidden of FORBIDDEN) {
    assert.equal(code.includes(forbidden), false,
      `pawn-svg.js grew a "${forbidden}" — the figure is no longer a pure function of (cid, role)`);
  }
  // NEGATIVE CONTROL, both directions: the scan can see one, and a commented-out one does not
  // satisfy it (TRAPS 1 — the guard that is green because the violation is in a comment).
  assert.ok(codeOnly('const a = Math.random();').includes('Math.random'), 'the scan is vacuous');
  assert.equal(codeOnly('// const a = Math.random();').includes('Math.random'), false,
    'codeOnly did not strip the comment — the scan above could be green with a live RNG');
  assert.ok(SRC.includes('no memo table'), 'the no-cache rule lost its stated reason');
});

test('resolvePawnLook fills every slot from the frozen tables', () => {
  for (const c of MOCK_CREW) {
    const look = resolvePawnLook(c);
    for (const key of ['ink', 'halo', 'accent']) {
      assert.ok(HEX.test(look[key]), `${c.cid}.${key} = ${look[key]} is a hex`);
    }
    assert.ok(BUILD_IDS.includes(look.build), `${c.cid} build ${look.build}`);
    assert.ok(TOPPERS.includes(look.topper), `${c.cid} topper ${look.topper}`);
    assert.ok(MARKS.includes(look.mark), `${c.cid} mark ${look.mark}`);
    assert.ok(PROPS.includes(look.prop), `${c.cid} prop ${look.prop}`);
    assert.ok(STATURES.includes(look.stature), `${c.cid} stature ${look.stature}`);
  }
});

test('the eight mock crew resolve to eight distinct figures', () => {
  const looks = MOCK_CREW.map((c) => JSON.stringify(resolvePawnLook(c)));
  assert.equal(new Set(looks).size, MOCK_CREW.length, 'all eight souls read distinct');
  assert.equal(new Set(MOCK_CREW.map((c) => pawnSprite(c))).size, MOCK_CREW.length,
    'all eight in-world pawns render distinct');
  assert.equal(new Set(MOCK_CREW.map((c) => pawnChip(c))).size, MOCK_CREW.length,
    'all eight chips render distinct');
});

// ⭐ THE DISCRIMINATING LEG. The eight mock crew hold eight different roles, so the test above is
// satisfied by the PROP alone and cannot see whether the cid axis works at all. Same role, eight
// cids: everything that differs here is build · topper · mark · stature.
// MUTATION: make `pick()` ignore its shift (always index 0) ⇒ RED here, GREEN above.
test('⭐ eight souls in ONE role still read distinct — the cid axis, on its own', () => {
  const same = MOCK_CREW.map((c) => pawnSprite({ cid: c.cid, role: 'reactor' }));
  assert.equal(new Set(same).size, MOCK_CREW.length, 'the cid no longer changes the figure');
  // and all three builds are actually in play across the crew — a hash rotation that put everyone on
  // one body would satisfy "distinct" and still look like eight copies of one person at board scale.
  const builds = new Set(MOCK_CREW.map((c) => resolvePawnLook(c).build));
  assert.equal(builds.size, BUILD_IDS.length, `only ${[...builds]} in use across the crew`);
});

// MUTATION: emit the group scale through a 2-dp round ⇒ 0.95 and 0.90 both print 0.14 ⇒ RED.
test('⭐ the STATURE survives into the emitted transform', () => {
  const scales = new Set();
  for (const s of STATURES) scales.add(/scale\(([\d.]+)\)/.exec(pawnSprite({ cid: 'x', stature: s }))[1]);
  assert.equal(scales.size, STATURES.length,
    `three statures printed ${scales.size} distinct scales — a rounding step ate the axis`);
  // a taller stature is a taller figure, not just a different string
  const tallest = Number(/scale\(([\d.]+)\)/.exec(pawnSprite({ cid: 'x', stature: 1 }))[1]);
  const shortest = Number(/scale\(([\d.]+)\)/.exec(pawnSprite({ cid: 'x', stature: 0.9 }))[1]);
  assert.ok(tallest > shortest, 'stature does not order the figures by height');
});

test('explicit desc fields override the resolved figure', () => {
  const look = resolvePawnLook({
    role: 'reactor', cid: 'volkov',
    build: 'broad', topper: 'bun', mark: 'torn', prop: 'ladle', stature: 0.5, ink: '#123456',
  });
  assert.equal(look.build, 'broad');
  assert.equal(look.topper, 'bun');
  assert.equal(look.mark, 'torn');
  assert.equal(look.prop, 'ladle');   // the explicit prop beats the role's
  assert.equal(look.stature, 0.5);
  assert.equal(look.ink, '#123456');
  assert.ok(pawnSprite({ cid: 'volkov', ink: '#123456' }).includes('#123456'), 'the override reaches the SVG');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. Degenerate input never throws
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('an unknown role carries NOTHING and never throws (was: the neutral warm-grey)', () => {
  for (const bad of [undefined, null, '', 'wizard', 42, {}, []]) {
    let look;
    assert.doesNotThrow(() => { look = resolvePawnLook({ role: bad, cid: 'x' }); });
    assert.equal(look.prop, 'none', `an unknown role invented a prop for ${JSON.stringify(bad)}`);
    assert.doesNotThrow(() => pawnSprite({ role: bad, cid: 'x' }));
    assert.doesNotThrow(() => pawnChip({ role: bad, cid: 'x' }));
  }
  // the fallback row is genuinely not a ROLE_HUE member — that is WHY `roleProp` returns 'none'
  assert.equal(Object.values(ROLE_HUE).includes(ROLE_FALLBACK), false);
  assert.equal(roleHue('wizard'), ROLE_FALLBACK);
});

test('a wholly empty / absent descriptor never throws', () => {
  for (const bad of [undefined, null, {}]) {
    assert.doesNotThrow(() => pawnSprite(bad));
    assert.doesNotThrow(() => pawnChip(bad));
    assert.doesNotThrow(() => resolvePawnLook(bad));
    assert.doesNotThrow(() => figurePaths(bad));
  }
  // a nonsense build/topper/mark/prop falls back rather than emitting `undefined` into a path
  const junk = pawnSprite({ cid: 'j', build: 'dragon', topper: 'crown', mark: 'tattoo', prop: 'sword' });
  assert.equal(junk.includes('undefined'), false, 'an unknown modifier leaked into the SVG');
  assert.equal(junk.includes('NaN'), false, 'a NaN leaked into a path attribute');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. The chip's well, and id-collision freedom
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the chip is the design\'s INK WELL: an ellipse, a clip, and a SINGLE-pass figure', () => {
  const c = pawnChip(MOCK_CREW[0]);
  assert.ok(c.includes('<clipPath'), 'the well clip is gone');
  assert.match(c, /<ellipse cx="8" cy="10" rx="[\d.]+" ry="[\d.]+" fill="none" stroke="#14120F"/,
    'the ink well ellipse is gone');
  assert.equal(c.includes('<radialGradient'), false, 'a warm-skin gradient survived in the chip');
  assert.equal(c.includes('<g stroke-linejoin="round" stroke-linecap="round">'), false,
    'the chip grew a knockout pass — the design draws it single-pass on bare paper (line 261)');
  assert.ok(c.includes(`<rect x="0" y="0" width="16" height="20" fill="${PAPER}"/>`),
    'the chip is not self-contained — it would show whatever the surrounding CSS well is painted');
});

// ⭐ MEASURED DEFECT, PINNED. The first draft put `clip-path` and `transform` on the SAME <g>. A
// clip resolves in the user space AFTER that element's transform, so a scale(0.11) shrank the well
// to a tenth of its size and clipped the whole figure away: eight empty ellipses, and not one string
// assertion in this file could see it. Only the screenshot could.
// MUTATION: merge the two groups back into one ⇒ RED.
test('⭐ the chip\'s CLIP and its TRANSFORM sit on two different elements', () => {
  const c = pawnChip(MOCK_CREW[0]);
  const m = /<g clip-path="url\(#[^)]+\)"><g transform="translate\(8 [\d.]+\) scale\([\d.]+\)">/.exec(c);
  assert.ok(m, 'the clip and the transform share an element — the figure will be clipped away');
  // and the figure really is inside: the clipped group carries the whole body
  assert.ok(elementsIn(c.slice(c.indexOf(m[0]))).length >= 10, 'the well contains no figure');
});

test('two chips for different souls have disjoint ids', () => {
  const a = pawnChip(MOCK_CREW[0]);
  const b = pawnChip(MOCK_CREW[1]);
  const ai = idsIn(a), bi = idsIn(b);
  assert.ok(ai.length >= 1 && bi.length >= 1, 'each chip declares its well id');
  for (const id of ai) assert.ok(!bi.includes(id), `id ${id} must not collide across souls`);
});

test('idPrefix namespaces the ids explicitly', () => {
  const a = pawnChip({ role: 'reactor', cid: 'shared' }, { idPrefix: 'A1' });
  const b = pawnChip({ role: 'reactor', cid: 'shared' }, { idPrefix: 'B2' });
  // same soul, but the caller-supplied prefix keeps them collision-free on one canvas
  assert.ok(a.includes('id="A1-well"') && a.includes('url(#A1-well)'), 'prefix A1 applied + referenced');
  assert.ok(b.includes('id="B2-well"') && b.includes('url(#B2-well)'), 'prefix B2 applied + referenced');
  for (const id of idsIn(a)) assert.ok(!idsIn(b).includes(id), 'prefixed ids are disjoint');
});

test('pawnSprite declares no ids (trivially collision-free)', () => {
  assert.equal(idsIn(pawnSprite(MOCK_CREW[0])).length, 0);
});

test('className rides through to both forms', () => {
  assert.ok(pawnSprite(MOCK_CREW[0], { className: 'pawn' }).startsWith('<g class="pawn"'));
  assert.ok(pawnChip(MOCK_CREW[0], { className: 'bust' }).startsWith('<g class="bust"'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. ⭐ THE PAPER DIALECT — no colour survives except the three the charter names
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: give a prop an amber stroke ⇒ RED. This is an INCLUSION test on the emitted output, not
// a scan for known-bad strings: a hue nobody thought to blacklist is exactly how the old palette
// would leak back in.
test('⭐ every colour a figure emits is INK, PAPER or the ONE accent', () => {
  const allowed = new Set([INK, PAPER, ATTEND, 'none'].map((s) => s.toLowerCase()));
  for (const c of MOCK_CREW) {
    for (const svg of [pawnSprite(c), pawnChip(c)]) {
      const used = new Set();
      for (const m of svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)) used.add(m[1].toLowerCase());
      for (const v of used) {
        if (v.startsWith('url(')) continue;
        assert.ok(allowed.has(v), `${c.cid} emits ${v} — not ink, paper or the accent`);
      }
      assert.ok(used.size >= 2, `${c.cid} emitted almost no paint — this leg is reading nothing`);
    }
  }
});

test('the ONE accent is spent on the keepsake and nothing else', () => {
  const withMug = pawnSprite({ cid: 'k', mark: 'keepsake' });
  const without = pawnSprite({ cid: 'k', mark: 'collar' });
  assert.ok(withMug.includes(ATTEND), 'the keepsake mug lost its oxblood — the design draws it in it');
  assert.equal(without.includes(ATTEND), false, 'oxblood appears on a figure with no keepsake');
  // exactly ONE element carries it (the mug body; its handle is ink, as the design draws it)
  const n = [...withMug.matchAll(new RegExp(`stroke="${ATTEND}"`, 'g'))].length;
  assert.equal(n, 1, `${n} elements carry the accent — the charter spends it once`);
});

// TRAPS 1: the source scan reads CODE, and it has a negative control, or a commented-out literal
// satisfies it.
test('pawn-svg.js declares no raw colour literal outside the three tokens', () => {
  const code = codeOnly(SRC);
  const hexes = [...code.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
  assert.deepEqual(hexes, [], `raw hex literals in the source: ${hexes.join(', ')}`);
  // NEGATIVE CONTROL — the scan must be able to find one when there is one
  assert.deepEqual([...codeOnly('const X = "#ff00aa";').matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]),
    ['#ff00aa'], 'the hex scan cannot see a hex — it is vacuous');
  // …and it must NOT be satisfied by one that is commented out
  assert.deepEqual([...codeOnly('// const X = "#ff00aa";').matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]),
    [], 'codeOnly did not strip a comment; the scan above could be green with a live literal');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8. ⭐ MEASURED DEFECT: props and keepsakes must be CLEAR of the body
// ═════════════════════════════════════════════════════════════════════════════════════════════

// The doc's arm paths END TUCKED AGAINST THE COAT on all three builds, so anchoring a prop on one
// draws it straddling the body outline — scribble at board scale. Every prop now starts outside
// `wide` and a grip stub joins it back to the hand.
// MUTATION: anchor `propPaths` on `b.hand` again ⇒ RED for every build.
test('⭐ every prop and every keepsake is drawn CLEAR of the body silhouette', () => {
  const xs = (d) => [...String(d).matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)|C\s*(-?[\d.]+)/g)]
    .map((m) => Number(m[1] !== undefined ? m[1] : m[3])).filter(Number.isFinite);
  for (const build of BUILD_IDS) {
    const b = BUILDS[build];
    for (const prop of PROPS.filter((p) => p !== 'none')) {
      const body = figurePaths({ cid: 'z', build, prop: 'none', mark: 'none', topper: 'plain' });
      const withProp = figurePaths({ cid: 'z', build, prop, mark: 'none', topper: 'plain' });
      const added = withProp.slice(body.length);
      assert.ok(added.length >= 2, `${build}/${prop}: no prop was added (grip stub + shape)`);
      // the SHAPE (everything after the grip stub) lives outside the body's widest half-width
      for (const p of added.slice(1)) {
        const pts = p.d ? xs(p.d) : [p.ellipse ? p.ellipse[0] - p.ellipse[2] : p.rect[0]];
        for (const x of pts) {
          assert.ok(x >= b.wide, `${build}/${prop}: a prop point at x=${x} is inside the body (wide=${b.wide})`);
        }
      }
    }
    // the keepsake mug, on the other side
    const mug = figurePaths({ cid: 'z', build, prop: 'none', mark: 'keepsake', topper: 'plain' })
      .filter((p) => p.stroke === ATTEND || (p.rect && p.rect[0] < 0));
    assert.ok(mug.length >= 1, `${build}: no keepsake was drawn`);
    for (const p of mug) {
      const right = p.rect ? p.rect[0] + p.rect[2] : Math.max(...xs(p.d));
      assert.ok(right <= -b.wide, `${build}: the mug reaches x=${right}, inside the body (wide=${b.wide})`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 9. Non-mutation
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the builders never mutate their descriptor argument', () => {
  const desc = { role: 'helm', cid: 'ferreira' };
  const before = JSON.stringify(desc);
  pawnSprite(desc); pawnChip(desc); resolvePawnLook(desc); figurePaths(desc); inkFigure(desc);
  assert.equal(JSON.stringify(desc), before, 'descriptor is untouched');
  // …nor the frozen build tables (`figurePaths` re-weights every stroke; a mutating map would poison
  // every later figure, and the second call would differ from the first)
  const a = pawnSprite(MOCK_CREW[0]);
  for (const c of MOCK_CREW) pawnSprite(c);
  assert.equal(pawnSprite(MOCK_CREW[0]), a, 'a shared table was mutated between renders');
});
