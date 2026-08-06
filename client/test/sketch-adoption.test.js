// THE SKETCH ADOPTION — the owner's `strong` treatment, catalogue-wide, and the guards that say the
// dimensions and the perspectives survived it.
//
// ⭐ THE OWNER'S RULING IS TWO SENTENCES AND BOTH ARE PINNED HERE: *"i like the strong one — just
// ensure you are getting the dimension and perspectives right."* The first half is a LEVEL and it is
// pinned as one (`SKETCH_LEVEL === 'strong'`, at the one seam, on exactly four catalogues). The
// second half is this file's whole subject, and it is answered as a MEASUREMENT rather than as an
// argument about how the code is structured.
//
// ── WHY A SEPARATE FILE ───────────────────────────────────────────────────────────────────────
// The catalogue suites each keep asking their own questions of their own RAW fragments, which is
// where the geometry is. What none of them can state — because it is a relation BETWEEN the raw
// drawing and the shipped one — is the bridge: that the treated drawing is the raw drawing, moved by
// no more than a bound derived from the preset's knobs, per element, in both directions, on every
// piece of the four STANDING catalogues and on all forty-seven twins. That bridge is what makes the
// raw legs legitimate authority over what ships, and it lives here. (The twelve MATERIAL skins are
// treated too and are bridged in `paper-materials.test.js`: what has to survive on a tiling skin is
// an exact centimetre PITCH, not a member's position, so it is a different measurement.)
//
// ── THE BRIDGE IS THREE STATEMENTS, NOT ONE, AND THE THIRD WAS MISSING ────────────────────────
//   §2  the AMPLITUDE BOUND — bounded, both directions, every element. Blind by construction to any
//       systematic error smaller than itself (CLAUDE.md's 7th shape).
//   §2  COLLINEARITY — exact, for STRAIGHT runs: a treated run's chord lies on the segment's own
//       line. This is what sees a 2% scale, a rotation, a translation.
//   §2  THE ROUND MEMBERS — exact, per axis: the radius nudge recovered from x and from y separately
//       must each be within `lump` and must AGREE. ⛔ Added 2026-08-05 after review measured the
//       hole: the collinearity leg cannot speak about a closed curve, so it excluded ellipses and
//       circles — 234 of 1548 geometry rows pristine, 464 of 2719 with the twins, RE-MEASURED on
//       this tree — and with only the bound under them, scaling every
//       ellipse ×1.02…×1.06 ran the whole suite 148/148 GREEN, as did an ry-only ×1.05.
//
// ⛔ AND THE HONEST LIMIT, SAID FIRST. Nothing in this file can see whether `strong` LOOKS right.
// The pristine/twin pairs sheet (`client/tools/sketch-pairs-sheet.mjs`), the catalogue sheets and
// the live wreck-room shot are the instruments for that, and the owner's eye is the judge. A green
// file here is a necessary condition and has never been a sufficient one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as FT from '../src/items/fittings.js';
import * as MC from '../src/items/machines.js';
import * as PF from '../src/items/paper-fixtures.js';
import { FITTING_IDS, frameFor, W } from '../src/items/fittings.js';
import { MACHINE_IDS } from '../src/items/machines.js';
import { FIXTURE_IDS } from '../src/items/paper-fixtures.js';
import { PAPER_RESOURCE_IDS, BUILD as PR_BUILD } from '../src/items/paper-resources.js';
import { buildWrecked, WRECKED } from '../src/items/wrecked.js';
import { buildItem, ITEM_IDS } from '../src/items/index.js';
import { BUILD as MAT_BUILD, MATERIAL_IDS } from '../src/items/paper-materials.js';
import { INK, PAPER, ATTEND, SKETCH_LEVEL } from '../src/items/helpers.js';
import { PAPER_FLAT, n as nn } from '../src/render/oblique.js';
import {
  sketch, LEVELS, amplitudeBound, penSteps, DOUBLE_NUDGE, ROUND_EPS, GROUND_CLASS, DOUBLE_CLASS,
} from '../src/render/sketch.js';
import {
  measurePiece, blankArcs, arcRadii, farFrom, flatten, attrsOf, bodyExtent, shapePolys,
  buriedMembers, unbackedKnockouts,
} from './sketch-geom.js';
import { codeOnly } from './code-only.js';
import { materialLayerSvg } from '../src/ui/roomzoom-view.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** The four treated catalogues, each as `{name, ids, raw(id), ship(id)}`. */
const CATALOGUES = [
  {
    name: 'fittings',
    ids: FITTING_IDS,
    raw: (id) => FT[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}`, sketch: false }),
    ship: (id) => FT[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}` }),
  },
  {
    name: 'machines',
    ids: MACHINE_IDS,
    raw: (id) => MC[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}`, sketch: false }),
    ship: (id) => MC[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}` }),
  },
  {
    name: 'paper-fixtures',
    ids: FIXTURE_IDS,
    raw: (id) => PF[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}`, sketch: false }),
    ship: (id) => PF[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}` }),
  },
  {
    name: 'paper-resources',
    ids: PAPER_RESOURCE_IDS,
    raw: (id) => PR_BUILD[id]({ w: 240, h: 240, idPrefix: `a-${id}`, sketch: false }),
    ship: (id) => PR_BUILD[id]({ w: 240, h: 240, idPrefix: `a-${id}` }),
  },
];

const ALL_TREATED_IDS = CATALOGUES.flatMap((c) => c.ids);

/**
 * ⚠️ A TWIN IS TREATED ONLY IF ITS OWN PAINTING IS PAPER, AND THAT IS A FINDING RATHER THAN A
 * SUBTLETY. Twenty-one of the thirty-four fittings still carry their WARM MOCK twin — `dining-table`
 * ships the paper fitting pristine and the 2026-07-28 mock transcription damaged, in `#33281b`. The
 * treatment does not touch those: putting a freehand hand on warm art buys nothing and breaks the
 * palette closure (measured — `#3a2c1e` on the chair's twin is how this was found). FILED for the
 * owner; it is a pre-existing mismatch that the adoption makes MORE conspicuous, because the
 * pristine piece is now plainly hand-drawn beside a twin that is not.
 */
const PAPER_TWIN_IDS = ALL_TREATED_IDS.filter((id) => WRECKED[id] && WRECKED[id].mockLabel == null);
const AMP = amplitudeBound(SKETCH_LEVEL);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SEAM — one level, one door, four catalogues, and the ones deliberately left alone
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐ the adopted level is `strong`, the owner\'s, and it is ONE constant read by everything', () => {
  assert.equal(SKETCH_LEVEL, 'strong',
    'the shipped level is no longer the owner\'s ruling. `strong` was chosen off the experiment\'s\n'
    + 'screenshots against the experiment\'s own recommendation (`hand`); changing it is an owner\n'
    + 'decision, not a refactor.');
  assert.ok(LEVELS[SKETCH_LEVEL], '`SKETCH_LEVEL` names a level that does not exist');
  // ⛔ THE TWO MARKER CLASSES ARE PINNED AS LITERALS, NOT READ BACK. Every guard in this package
  // that names the ground rule or the doubled pass imports the constant, so renaming the constant
  // moves both sides of every one of them and NOTHING goes red — measured, by doing it. A literal
  // here is the only assertion a rename cannot satisfy, and the names are in emitted markup that a
  // stylesheet or a screenshot tool may also be reading.
  assert.equal(GROUND_CLASS, 'pl-sk-ground');
  assert.equal(DOUBLE_CLASS, 'pl-sk-2nd');
  // …and the knobs are the ones the amplitude bound and the ramp are derived FROM, so a silent edit
  // to any of them fails here rather than quietly widening every tolerance in the repo.
  assert.deepEqual(
    (({ overshoot, wave, waveMax, lump, ramp, silBoost, interior, haloWiden, haloScope, doubles }) => (
      { overshoot, wave, waveMax, lump, ramp, silBoost, interior, haloWiden, haloScope, doubles }))(LEVELS.strong),
    {
      overshoot: 3.6, wave: 0.024, waveMax: 5.5, lump: 0.075,
      ramp: 1.9, silBoost: 1.5, interior: 0.74, haloWiden: 1.9, haloScope: 'all', doubles: true,
    },
    'a `strong` knob moved. Every tolerance in this package is derived from these ten numbers, so\n'
    + 'moving one silently re-scales the amplitude bound, the ramp\'s closed set and the twin\n'
    + 'distinguishability floor at once.');
});

test('every piece of all four catalogues really is treated — and the treatment is not a no-op', () => {
  for (const cat of CATALOGUES) {
    assert.ok(cat.ids.length > 0, `${cat.name} has no ids`);
    for (const id of cat.ids) {
      const raw = cat.raw(id);
      const ship = cat.ship(id);
      assert.notEqual(ship, raw,
        `${cat.name}/${id} ships its RAW fragment — the harness is not passing sketched:true, or\n`
        + '`sketch()` refused the whole fragment. Either way the owner\'s ruling is not applied here.');
      // ⛔ AND IT IS THE SHIPPED TREATMENT, NOT A RE-DERIVATION. Everything this file measures is
      // computed by running `sketch()` itself; if the seam disagreed with that — a different level,
      // a different seed — every measurement below would be about a picture nobody sees.
      assert.equal(ship, sketch(raw, { level: SKETCH_LEVEL, seed: id }),
        `${cat.name}/${id}: the shipped fragment is not \`sketch(raw, {level: '${SKETCH_LEVEL}', `
        + 'seed: <the piece id>})`. The seam and this suite are measuring two different pictures.');
    }
  }
  assert.equal(ALL_TREATED_IDS.length, 34 + 13 + 14 + 9,
    'the treated population changed size — 34 fittings + 13 machines + 14 paper-fixtures + 9 paper-resources');
});

// ⚠️ THE POPULATION IS PINNED FROM BOTH SIDES, because "we forgot to wire it" and "we decided not
// to" are the same green otherwise.
//
// ⭐ MATERIALS JOINED ON 2026-08-05, MID-PACKAGE, ON THE OWNER'S WORDS: *"we need to update ALL with
// the sketch style we defined."* The brief this package started from had FILED them as an open
// question — a wall or floor skin is a tiled field over a full-bleed face, a different idiom from a
// drawn object, and nobody had seen one treated. The owner answered it. What the extension found is
// recorded in `paper-materials.test.js` and in `sketch.js`'s private `isKitHatch`: the hatch knob was
// rewriting EVERY `<pattern>`, which would have deleted four skins' identifying fields.
//
// The WARM set stays untreated and that is still a decision: it is the idiom the redesign replaces.
test('all five paper catalogues are treated and the WARM set is not — the population, both sides', () => {
  let skins = 0;
  for (const id of MATERIAL_IDS) {
    assert.notEqual(MAT_BUILD[id]({ w: 200, h: 200, idPrefix: 'mt' }),
      MAT_BUILD[id]({ w: 200, h: 200, idPrefix: 'mt', sketch: false }),
      `${id}: a MATERIAL ships RAW. The owner's 2026-08-05 extension covers all twelve skins.`);
    skins += 1;
  }
  assert.equal(skins, 12, 'the material set changed size — six walls and six floors');
  // …and the warm rows, named as the control rather than swept.
  const warm = ITEM_IDS.filter((id) => !ALL_TREATED_IDS.includes(id) && !MATERIAL_IDS.includes(id));
  assert.ok(warm.length >= 38, `only ${warm.length} untreated registry rows — the control is vacuous`);
  let checked = 0;
  for (const id of warm) {
    assert.equal(buildItem(id, { w: 120, h: 120, idPrefix: 'wm' }),
      buildItem(id, { w: 120, h: 120, idPrefix: 'wm', sketch: false }),
      `${id} is a pre-redesign WARM row and it ships treated`);
    checked += 1;
  }
  assert.equal(checked, warm.length);
  assert.ok(checked >= 38, 'no warm row was actually built — the loop is vacuous');
});

// ⭐ A TWIN IS TREATED IF AND ONLY IF ITS PRISTINE PIECE IS, and it shares its hand. Both halves
// matter: a treated piece beside an untreated twin is two drawings of one object, and a twin drawn
// by a DIFFERENT hand makes every stroke differ, which would drown the damage the player must read.
test('every twin of a treated piece is treated, shares its seed, and no warm twin is', () => {
  let treatedTwins = 0;
  let warmTwins = 0;
  for (const id of Object.keys(WRECKED)) {
    const a = buildWrecked(id, { w: 240, h: 240, idPrefix: `t-${id}` });
    const b = buildWrecked(id, { w: 240, h: 240, idPrefix: `t-${id}`, sketch: false });
    if (PAPER_TWIN_IDS.includes(id)) {
      assert.notEqual(a, b, `${id}'s twin ships RAW while its pristine piece ships treated`);
      assert.equal(a, sketch(b, { level: SKETCH_LEVEL, seed: id }),
        `${id}'s twin is not seeded with its PRISTINE id. Seeded any other way the shared prefix is\n`
        + 'drawn by a different hand and the difference between the pair stops being the damage.');
      treatedTwins += 1;
    } else {
      assert.equal(a, b,
        `${id}'s twin ships treated but its own painting is not paper — either it is a warm registry\n`
        + 'row, or it is a paper piece still wearing the 2026-07-28 mock twin (21 fittings are).');
      warmTwins += 1;
    }
  }
  assert.equal(treatedTwins, 47,
    'the treated-twin population changed — 12 fittings + 13 machines + 14 paper-fixtures + 8 paper-resources');
  assert.ok(warmTwins > 60, `only ${warmTwins} untreated twins — the control is vacuous`);
  // …and the 21 fittings still wearing a mock twin are named as a COUNT, so the day someone fixes
  // them this line reports it rather than a distant palette test failing.
  const mockedPaper = ALL_TREATED_IDS.filter((id) => WRECKED[id] && WRECKED[id].mockLabel != null);
  assert.equal(mockedPaper.length, 21,
    `${mockedPaper.length} paper pieces still carry a WARM mock twin (was 21 at adoption): `
    + `${mockedPaper.slice(0, 4).join(', ')}…  If this went DOWN, someone redrew them and the treated`
    + '-twin count above should have gone up by the same number.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐⭐ THE DISPLACEMENT PIN — the owner's caveat, measured
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE BOUND, DERIVED FROM THE KNOBS AND NOT CHOSEN:
//   max(overshoot, waveMax) + doubled-pass nudge + rounding
//   = max(3.6, 5.5) + 0.9·√2 + 0.01 = 6.783 local units, which is 6.1% of the 112-unit drawing box.
// (The perpendicular bow and the along-axis overshoot are orthogonal and never both maximal on one
// emitted point, so the bound takes the LARGER of the two rather than their hypotenuse — the
// derivation is in `sketch.js`'s own header, term by term.)
//
// Every element is classified by what the treatment did to it, and each class is pinned by the
// tightest statement available for it rather than all three by the loosest:
//   `geom`    re-drawn freehand → every treated point within the bound of the raw shape, AND every
//             raw point within the bound of the treated curve. BOTH directions: forwards alone
//             passes a treatment that drew a single dot in the middle of the piece.
//   `penOnly` a body the builder already drew as curves or arcs → the `d` is IDENTICAL except for
//             `A` radii, and those are within `lump`. Exact, not bounded.
//   `pass`    fill-only, no pen → byte-identical.

test('⭐⭐ the treatment moves no point further than the bound derived from its own knobs', () => {
  const L = LEVELS[SKETCH_LEVEL];
  assert.equal(AMP, Math.max(L.overshoot, L.waveMax) + DOUBLE_NUDGE * Math.SQRT2 + ROUND_EPS,
    'the amplitude bound is no longer the sum of its own named terms');
  const counts = { geom: 0, penOnly: 0, pass: 0 };
  let worst = 0;
  let worstWho = '';
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      for (const [what, frag] of [['pristine', cat.raw(id)],
        [PAPER_TWIN_IDS.includes(id) ? 'twin' : null,
          PAPER_TWIN_IDS.includes(id) ? buildWrecked(id, { w: 240, h: 240, idPrefix: `d-${id}`, sketch: false }) : null]]) {
        if (!what) continue;
        for (const r of measurePiece(frag, id).rows) {
          counts[r.kind] += 1;
          if (r.kind === 'geom') {
            const m = Math.max(r.fwd, r.rev);
            if (m / r.bound > worst) { worst = m / r.bound; worstWho = `${cat.name}/${what}/${id}/${r.nm}`; }
            assert.ok(r.fwd <= r.bound, `${cat.name}/${what}/${id}: a treated point is `
              + `${r.fwd.toFixed(2)} from the shape it replaced, past the ${r.bound.toFixed(2)} bound`);
            assert.ok(r.rev <= r.bound, `${cat.name}/${what}/${id}: a point of the RAW shape is `
              + `${r.rev.toFixed(2)} from the treated curve, past the ${r.bound.toFixed(2)} bound.\n`
              + 'Forwards alone is satisfied by a treatment that DELETED the member; this is the leg\n'
              + 'that says the drawing is still all there.');
          } else if (r.kind === 'penOnly') {
            // an arc-bearing or hand-curved body: the `d` survives except for the lumped radii
            for (const d of r.outDs) {
              assert.equal(blankArcs(d), blankArcs(r.srcD),
                `${cat.name}/${what}/${id}: a hand-drawn body's path data changed by more than its `
                + 'arc radii. The treatment spends the PEN on these, never the geometry.');
            }
            const want = arcRadii(r.srcD);
            for (const d of r.outDs) {
              const got = arcRadii(d);
              assert.equal(got.length, want.length, `${id}: an arc appeared or vanished`);
              got.forEach(([rx, ry], i) => {
                assert.ok(Math.abs(rx - want[i][0]) <= L.lump * want[i][0] + ROUND_EPS
                  && Math.abs(ry - want[i][1]) <= L.lump * want[i][1] + ROUND_EPS,
                `${cat.name}/${what}/${id}: an arc radius moved ${Math.abs(rx - want[i][0]).toFixed(3)} `
                + `against a lump of ${(L.lump * want[i][0]).toFixed(3)} — the treatment resized the object`);
              });
            }
          } else {
            assert.equal(r.out, r.src, `${cat.name}/${what}/${id}: a fill-only element was rewritten`);
          }
        }
      }
    }
  }
  // ⛔ THREE NON-VACUITY FLOORS. A pin over an empty population is the loudest green in this repo.
  assert.ok(counts.geom > 2000, `only ${counts.geom} freehand elements measured — the pin is vacuous`);
  assert.ok(counts.penOnly > 100, `only ${counts.penOnly} curve/arc bodies measured`);
  assert.ok(worst > 0.4, `the worst displacement is only ${(worst * 100).toFixed(0)}% of the bound — `
    + 'either the treatment is barely moving anything, or the bound is far larger than it needs to be '
    + 'and is no longer a statement about the drawing');
  assert.ok(worst < 1, `worst ${worst.toFixed(3)} at ${worstWho}`);
});

// ⭐⭐ AND THE EXACT LEG, WHICH IS THE STRONGEST THING THIS PACKAGE SAYS ABOUT THE OWNER'S CAVEAT.
//
// ⛔ SAY THE HOLE IN THE BOUND FIRST, BECAUSE IT IS REAL AND IT IS CLAUDE.md's 7th SHAPE. A
// displacement bound of 6.78 units admits ANY systematic error smaller than 6.78 units: scale every
// emitted point by 1.02 and the pin above stays green, because a 2% error on a 56-unit half-box is
// 1.1 units and the treatment is allowed to move a point that far. Measured, by applying it — a
// scale-invariant instrument cannot see a scale error, and neither can a coarse absolute one.
//
// THE LEG THAT CAN: `handRun` moves a run's ends ALONG the run's own axis (overshoot) and bows the
// curve ABOUT that axis (wave). So the CHORD from a treated run's first emitted point to its last
// lies on the ORIGINAL segment's own infinite line — exactly, to within 2 dp of rounding. Measured
// across all 34 fittings before this test was written: worst 0.0069 units. A 2% scale, a rotation
// or a translation moves that chord OFF the line by orders more than the rounding, on every segment
// that does not happen to pass through the origin.
//
// ⚠️ THE DOUBLED PASS IS THE ONE EXCEPTION AND IT IS EXCLUDED BY NAME, not by an opacity or a width
// heuristic: `shiftRun` nudges it off its own line ON PURPOSE (a hand goes back over a line and does
// not retrace it), so it carries `class="${DOUBLE_CLASS}"` for this guard to skip.
test('⭐⭐ every treated run is COLLINEAR with the segment it replaces — the exact leg', () => {
  const EPS = 0.05;                       // 2 dp on both sides, with room; measured worst 0.0069
  const perp = (p, a, b) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const L = Math.hypot(vx, vy);
    if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * vy - (p[1] - a[1]) * vx) / L;
  };
  let runs = 0;
  let worst = 0;
  let worstWho = '';
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      for (const r of measurePiece(cat.raw(id), id).rows) {
        if (r.kind !== 'geom' || r.nm === 'ellipse' || r.nm === 'circle') continue;
        const segs = [];
        for (const poly of shapePolys(r.src)) {
          for (let i = 0; i + 1 < poly.length; i += 1) segs.push([poly[i], poly[i + 1]]);
        }
        if (!segs.length) continue;
        for (const t of r.out.match(/<[^>]*>/g) || []) {
          const a = attrsOf(t);
          if (!a.d || a.fill !== 'none') continue;          // the fill path is not a run
          if (a.class === DOUBLE_CLASS) continue;           // the second pass, off its line on purpose
          const pts = flatten(a.d).flat();
          if (pts.length < 2) continue;
          runs += 1;
          const A = pts[0];
          const B = pts[pts.length - 1];
          const best = Math.min(...segs.map(([s0, s1]) => Math.max(perp(A, s0, s1), perp(B, s0, s1))));
          if (best > worst) { worst = best; worstWho = `${cat.name}/${id}/${a.d.slice(0, 40)}`; }
          assert.ok(best <= EPS,
            `${cat.name}/${id}: a treated run's chord lies ${best.toFixed(3)} units OFF the line of `
            + `every segment of the member it replaces (limit ${EPS}).\n`
            + 'Overshoot moves a run ALONG its own axis and the bow curves it ABOUT that axis — so a\n'
            + 'chord that has left the line is the treatment moving the DRAWING, which is the one\n'
            + 'thing the owner\'s caveat forbids and the one thing the amplitude bound cannot see.');
        }
      }
    }
  }
  assert.ok(runs > 3000, `only ${runs} runs measured — the exact leg is vacuous`);
  assert.ok(worst > 0, `worst collinearity is exactly 0 at ${worstWho} — nothing was measured`);
  assert.ok(worst < EPS / 2, `measured worst ${worst.toFixed(4)} at ${worstWho} — the headroom under `
    + 'the limit has gone, so re-derive it rather than widening it');
});

// ⭐⭐ THE SECOND EXACT LEG — THE ROUND MEMBERS, WHICH THE FIRST ONE CANNOT SEE.
//
// ⛔ SAY THE HOLE THAT PUT THIS HERE, IN ITS OWN WORDS AND WITH THE RECEIPT (2026-08-05, review).
// The collinearity leg above `continue`s on `r.nm === 'ellipse' || r.nm === 'circle'`, and it has to:
// `handEllipse` does not replace a SEGMENT, it replaces a whole closed curve, so "the chord lies on
// the original line" is not a sentence about it. That exclusion was 234 of the set's 1548 measured
// pristine geometry rows (464 of 2719 counting the twins; review reported 254/1700 on the PRE-MERGE
// tree, and main's rotation package moved the faced geometry — both are right about their own tree,
// which is why the rule is re-measure, never quote) — and every one of them fell back to the amplitude bound alone, which is exactly the
// instrument the leg above exists because it is not enough. MEASURED, by applying it: scale
// `handEllipse`'s sample radius by ×1.02 through ×1.06 and the whole sketch + catalogue suite runs
// 148/148 GREEN each time; scale ONLY `ry` by ×1.05 — a HEADING on a thing the catalogue's own rule
// says is drawn LEVEL — and it is green too. ×1.08 is the first value that reds, and it reds on the
// bound, by accident. The round-things ratio guards in the three standing catalogues cannot help:
// they compare `ry/rx`, so they are scale-INVARIANT (CLAUDE.md's 7th shape) and blind to ×1.02 in
// both axes; and an ry-only drift is exactly what a ratio CAN see, except that under the treatment
// there is no `rx` attribute left for them to read at all.
//
// ⇒ THE LEG, AND IT IS EXACT RATHER THAN BOUNDED. `handEllipse` samples twelve angles that this test
// knows independently — `t_i = (i/12)·2π` — and nudges only the RADIUS at each: the emitted on-curve
// point is `(cx + cos t_i · rx · k_i, cy + sin t_i · ry · k_i)` with `|k_i − 1| ≤ lump`. So `k_i` can
// be RECOVERED from each axis separately:
//
//     kx_i = (x_i − cx) / (rx · cos t_i)        ky_i = (y_i − cy) / (ry · sin t_i)
//
// and three things must hold, each of which kills a different error:
//   (a) |kx_i − 1| ≤ lump and |ky_i − 1| ≤ lump — a UNIFORM scale ≥ 1.02 breaks both;
//   (b) kx_i = ky_i, because there is ONE nudge per sample — an ry-only drift breaks this on every
//       qualifying sample at once, and it is the leg a per-axis magnitude alone would let past on
//       the low side;
//   (c) the twelve samples' MEAN is the centre, within `lump` of its own radius — a TRANSLATION
//       moves that and nothing else here would.
// Rounding is carried per sample rather than as one blanket number: both sides round to 2 dp, so a
// coordinate's slack in `k` is `ROUND_EPS / (r · |cos t|)`, which is small where the measurement is
// tight and honestly large on a 1-unit tick.
const ROUND_KINDS = new Set(['ellipse', 'circle']);

/** The ON-CURVE points of a treated round member's ink run — `M`'s pair, then each `C`'s third. */
function onCurve(d) {
  const out = [];
  const re = /([MC])([^MC]*)/g;
  let m = re.exec(d);
  while (m) {
    const a = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
    if (m[1] === 'M') { if (a.length >= 2) out.push([a[0], a[1]]); } else {
      for (let i = 0; i + 5 < a.length; i += 6) out.push([a[i + 4], a[i + 5]]);
    }
    m = re.exec(d);
  }
  return out;
}

/**
 * Every treated ROUND member of a fragment: the raw ellipse's own centre and radii, beside the
 * on-curve points of the freehand curve that replaced it.
 *
 * ⛔ THE INK RUN IS PICKED BY NAME, NOT BY POSITION. The treatment emits up to four paths per round
 * element — a fill path (its own colour), the paper HALO (inside a `<g stroke="paper">`, and it
 * carries no `fill` of its own), the ink run (`fill="none"`), and the doubled pass (`DOUBLE_CLASS`,
 * nudged OFF its own curve on purpose). Taking "the second path" would silently measure the halo the
 * day a knob changes.
 */
function roundMembers(rawFragment, seed) {
  const out = [];
  for (const r of measurePiece(rawFragment, seed).rows) {
    if (r.kind !== 'geom' || !ROUND_KINDS.has(r.nm)) continue;
    const a = attrsOf(r.src);
    const cx = +a.cx || 0, cy = +a.cy || 0;
    const rx = r.nm === 'circle' ? (+a.r || 0) : (+a.rx || 0);
    const ry = r.nm === 'circle' ? (+a.r || 0) : (a.ry == null ? rx : (+a.ry || 0));
    if (!(rx > 0 && ry > 0)) continue;
    const ink = (r.out.match(/<[^>]*>/g) || []).filter((t) => {
      const b = attrsOf(t);
      return /^<\s*path\b/.test(t) && b.d && b.fill === 'none' && b.class !== DOUBLE_CLASS;
    });
    assert.equal(ink.length, 1, 'a treated round member emitted no single ink run to measure');
    out.push({ cx, cy, rx, ry, pts: onCurve(attrsOf(ink[0]).d) });
  }
  return out;
}

/** The three deviations of one round member: per-axis, their disagreement, and the centre. */
function fitRound(m, lump) {
  let kx = 0, ky = 0, dis = 0, tight = 0;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < m.pts.length; i += 1) {
    const t = (i / 12) * Math.PI * 2;
    const c = Math.cos(t), sN = Math.sin(t);
    const [x, y] = m.pts[i];
    let a = null, b = null;
    if (Math.abs(c) >= 0.35) {
      const slack = ROUND_EPS / (m.rx * Math.abs(c));
      a = (x - m.cx) / (m.rx * c);
      kx = Math.max(kx, Math.abs(a - 1) - slack);
      if (slack <= 0.01) tight += 1;
    }
    if (Math.abs(sN) >= 0.35) {
      const slack = ROUND_EPS / (m.ry * Math.abs(sN));
      b = (y - m.cy) / (m.ry * sN);
      ky = Math.max(ky, Math.abs(b - 1) - slack);
      if (slack <= 0.01) tight += 1;
    }
    if (a != null && b != null) {
      const slack = ROUND_EPS / (m.rx * Math.abs(c)) + ROUND_EPS / (m.ry * Math.abs(sN));
      dis = Math.max(dis, Math.abs(a - b) - slack);
    }
    if (i < 12) { sx += x; sy += y; n += 1; }
  }
  // ⚠️ THE CENTRE IS THE MEAN OF THE TWELVE DISTINCT SAMPLES, and the bound is derived rather than
  // chosen: `Σ cos t_i = 0` over a full turn, so `mean_x − cx = (rx/12)·Σ cos t_i·(k_i − 1)`, which
  // is at most `rx · lump · (Σ|cos t_i|)/12`.
  // ⚠️ THAT SUM IS **0.6220** FOR TWELVE SAMPLES, NOT 2/π — the constant below is the CONTINUOUS
  // limit (`2/π = 0.63662`), which is the larger of the two and therefore a valid over-bound. Said
  // rather than quietly left, because a first draft's comment asserted the two were the same number.
  // Worst measured across the four catalogues: 0.265 of `r · lump`, so the choice buys nothing
  // either way and the honest constant is the one whose derivation is written down.
  const CMEAN = 2 / Math.PI;
  return {
    kx, ky, dis, tight,
    dcx: n ? Math.abs(sx / n - m.cx) - ROUND_EPS : 0,
    dcy: n ? Math.abs(sy / n - m.cy) - ROUND_EPS : 0,
    cbx: m.rx * lump * CMEAN,
    cby: m.ry * lump * CMEAN,
  };
}

test('⭐⭐ every treated ROUND member is the raw one, per axis and within `lump` — the exact leg', () => {
  const L = LEVELS[SKETCH_LEVEL];
  let members = 0, tight = 0;
  let wKx = 0, wKy = 0, wDis = 0, who = '';
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      const frags = [['pristine', cat.raw(id)]];
      if (PAPER_TWIN_IDS.includes(id)) {
        frags.push(['twin', buildWrecked(id, { w: 240, h: 240, idPrefix: `e-${id}`, sketch: false })]);
      }
      for (const [what, frag] of frags) {
        for (const m of roundMembers(frag, id)) {
          const f = fitRound(m, L.lump);
          members += 1;
          tight += f.tight;
          if (f.kx > wKx) { wKx = f.kx; who = `${cat.name}/${what}/${id}`; }
          if (f.ky > wKy) wKy = f.ky;
          if (f.dis > wDis) wDis = f.dis;
          assert.ok(f.kx <= L.lump, `${cat.name}/${what}/${id}: a treated round member's X radius is `
            + `${(1 + f.kx).toFixed(4)}× the raw \`rx\` at some sample, past the \`lump\` of ${L.lump}. `
            + 'The treatment nudges a RADIUS; it does not resize the object.');
          assert.ok(f.ky <= L.lump, `${cat.name}/${what}/${id}: a treated round member's Y radius is `
            + `${(1 + f.ky).toFixed(4)}× the raw \`ry\` at some sample, past the \`lump\` of ${L.lump}.\n`
            + 'Asserted SEPARATELY from X on purpose: an ry-only drift is a HEADING given to a thing\n'
            + 'the catalogue draws LEVEL, and no ratio guard can see it once the `rx` attribute is gone.');
          assert.ok(f.dis <= L.lump * 0.5, `${cat.name}/${what}/${id}: the radius nudge recovered from `
            + `X disagrees with the one recovered from Y by ${f.dis.toFixed(4)}.\n`
            + 'There is ONE nudge per sample, so the two axes must agree — a disagreement is the two\n'
            + 'axes scaled by different factors, which is an ellipse that has been given a heading.');
          assert.ok(f.dcx <= f.cbx && f.dcy <= f.cby,
            `${cat.name}/${what}/${id}: the treated round member's twelve samples average `
            + `(${f.dcx.toFixed(3)}, ${f.dcy.toFixed(3)}) from the raw centre, past `
            + `(${f.cbx.toFixed(3)}, ${f.cby.toFixed(3)}). The object MOVED.`);
          assert.ok(Math.max(f.dcx, f.dcy) <= amplitudeBound(SKETCH_LEVEL, Math.max(m.rx, m.ry)),
            `${cat.name}/${what}/${id}: the round member's centre left the displacement bound`);
        }
      }
    }
  }
  // ⛔ FOUR NON-VACUITY FLOORS, because a leg that measured no round member reads exactly as green.
  assert.ok(members > 300, `only ${members} round members measured — the exact round leg is vacuous`);
  assert.ok(tight > 2000, `only ${tight} samples were measured tightly (rounding slack ≤ 0.01) — the\n`
    + 'leg is all slack and would not see a 2% scale on any piece big enough to have one');
  assert.ok(wKx > L.lump * 0.7 && wKy > L.lump * 0.7,
    `the worst per-axis radius deviation is ${wKx.toFixed(4)}/${wKy.toFixed(4)} against a lump of `
    + `${L.lump} (${who}) — either the treatment stopped lumping round things, or this leg is\n`
    + 'reading something that is not the freehand curve');
  assert.ok(wDis < L.lump * 0.5, `axis disagreement ${wDis.toFixed(4)}`);
});

// ⭐ AND IT IS DRIVEN, WITH THE EXACT MUTATIONS THE HOLE WAS FOUND BY — applied to the measured
// points rather than to `sketch.js`, so nobody has to edit the shipped module to find out whether
// this leg can fail. The identity control runs FIRST, or the reds below prove nothing.
//
// THE WHOLE MATRIX, MEASURED ON THE MERGED TREE (118 round members across the 34 fittings):
//   identity          0 / 118    ← the control: unmutated, the leg is silent
//   ×1.02 both axes  89 / 118    ← the scale the WHOLE SUITE was green on before this leg existed
//   ×1.04 both axes 117 / 118
//   ×1.06 both axes 118 / 118
//   ry-only ×1.05   117 / 118    ← a HEADING on a thing drawn level
//   translate 1 unit 118 / 118
//
// ⛔ AND SAY WHAT THE 29 MISSES AT ×1.02 ARE, BECAUSE A FLOOR OF 75% LOOKS LIKE A TUNED NUMBER AND
// IS NOT ONE. They are the members whose smaller radius is 0.44 … 1.85 local units: 2% of 1.1 units
// is 0.022, and BOTH sides of this measurement round to 2 dp, so a 2% error on a tick that small is
// not a thing this instrument — or any instrument reading the emitted string — can resolve at all.
// That is a LIMIT and it is stated, not a HOLE and hidden: every member big enough to carry the
// error is caught, and the same mutation on the same members at ×1.04 is caught 117/118.
test('the round-member leg FAILS at ×1.02, ×1.06, ry-only ×1.05 and a translation — all driven', () => {
  const L = LEVELS[SKETCH_LEVEL];
  const scaled = (m, sx, sy) => ({
    ...m,
    pts: m.pts.map(([x, y]) => [m.cx + (x - m.cx) * sx, m.cy + (y - m.cy) * sy]),
  });
  const moved = (m, dx, dy) => ({ ...m, pts: m.pts.map(([x, y]) => [x + dx, y + dy]) });
  const bad = (m) => {
    const f = fitRound(m, L.lump);
    return f.kx > L.lump || f.ky > L.lump || f.dis > L.lump * 0.5 || f.dcx > f.cbx || f.dcy > f.cby;
  };
  let total = 0;
  const hit = { identity: 0, s102: 0, s104: 0, s106: 0, ry105: 0, shift: 0 };
  for (const id of FITTING_IDS) {
    const frag = FT[camel(id)]({ w: 240, h: 240, idPrefix: `y-${id}`, sketch: false });
    for (const m of roundMembers(frag, id)) {
      total += 1;
      if (bad(m)) hit.identity += 1;
      if (bad(scaled(m, 1.02, 1.02))) hit.s102 += 1;
      if (bad(scaled(m, 1.04, 1.04))) hit.s104 += 1;
      if (bad(scaled(m, 1.06, 1.06))) hit.s106 += 1;
      if (bad(scaled(m, 1, 1.05))) hit.ry105 += 1;
      if (bad(moved(m, 1, 0))) hit.shift += 1;
    }
  }
  assert.ok(total > 80, `only ${total} round members in the fittings — the control is vacuous`);
  assert.equal(hit.identity, 0,
    `${hit.identity} of ${total} round members fail the leg UNMUTATED. Every red below is then the\n`
    + 'instrument rather than the mutation, and the leg above is measuring its own bug.');
  assert.ok(hit.s102 >= total * 0.6,
    `a ×1.02 scale was caught on only ${hit.s102} of ${total} (measured 89) — the leg has stopped\n`
    + 'seeing the scale error it exists for, which is the one the amplitude bound admits.');
  assert.ok(hit.s104 >= total - 2, `×1.04 caught on ${hit.s104} of ${total} (measured 117)`);
  assert.equal(hit.s106, total, `×1.06 caught on ${hit.s106} of ${total} — measured 118/118`);
  assert.ok(hit.ry105 >= total - 2,
    `an ry-only ×1.05 was caught on ${hit.ry105} of ${total} (measured 117). This is the mutation a\n`
    + 'per-axis MAGNITUDE alone lets past on the low side; the axis-agreement leg is what catches it.');
  assert.equal(hit.shift, total,
    `a one-unit translation was caught on ${hit.shift} of ${total} — the centre leg is not working`);
});

// ⭐ AND THE CONTROL THAT SAYS THE BOUND IS A BOUND. Doubling the treatment's amplitude must break
// the pin — driven here rather than claimed, on a knob object, so nobody has to edit the shipped
// preset to find out whether this guard can fail.
test('the displacement pin FAILS when the amplitude is doubled — driven, not argued', () => {
  const L = LEVELS[SKETCH_LEVEL];
  const doubled = { ...L, overshoot: L.overshoot * 2, wave: L.wave * 2, waveMax: L.waveMax * 2 };
  let broke = 0;
  let total = 0;
  for (const id of FITTING_IDS) {
    const rawFrag = FT[camel(id)]({ w: 240, h: 240, idPrefix: `x-${id}`, sketch: false });
    for (const r of measurePiece(rawFrag, id, doubled).rows) {
      if (r.kind !== 'geom') continue;
      total += 1;
      // the bound the SHIPPED preset declares — the number the pin above is written against
      if (Math.max(r.fwd, r.rev) > amplitudeBound(SKETCH_LEVEL, r.radius)) broke += 1;
    }
  }
  assert.ok(total > 700, `the control measured only ${total} elements`);
  // MEASURED at adoption: 79 of 812. The floor is under that and well above zero — a pin that only
  // ever breaks on one element is a pin that a small knob change would slip past.
  assert.ok(broke >= 40, `doubling overshoot and bow broke the shipped bound on only ${broke} of `
    + `${total} elements — the pin cannot see an amplitude change and proves nothing`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. E8 ATTACHMENT, RESTATED: "attached" now means WITHIN THE AMPLITUDE OF TOUCHING
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ SAY THE CHANGE PLAINLY. Ruling E8's class 3 is FLOATING MEMBERS, and its guards ask for an
// exact projected coordinate shared by two members — that is what "meets something, at both ends"
// meant. Overshoot makes lines CROSS at a joint instead of ending on it: a run starts up to 3.6
// units before its first point and ends up to 3.6 past its last. So under the treatment the
// statement available is not "these two members share a point" but "these two members' ink both
// come within the amplitude of the junction", i.e. they touch or they cross, never gap.
//
//   OLD RULE: `hasPoint(svg, id, [x, y, z])` — the projected junction appears verbatim in the `d`.
//   NEW RULE: at least as many DISTINCT source members' treated ink pass within AMP of the
//             projected junction as pass through it exactly in the raw drawing — and that raw count
//             is ≥ 2, which is what makes the point a junction rather than a coordinate.
//
// The junctions are the ones the E8 suites already name, in the pieces they name them in.
const JUNCTIONS = [
  ['bunk-bed', [6.5, 6, 0], 'a bunk post on the deck'],
  ['bunk-bed', [193.5, 58, 0], 'the far bunk post on the deck'],
  ['hydroponics', [7, 40, 44], 'the drip line at the bottom tray'],
  ['hydroponics', [7, 40, 176], 'the drip line at the top tray'],
  ['compost-bin', [56, 30, 52], 'the crank on its own boss'],
  ['standing-lamp', [38, 22, 1], 'the cable leaving the lamp base'],
  ['space-heater', [20, 25, 110], 'a heater bracket on the panel'],
  ['space-heater', [20, 36, 122], 'a heater bracket at the wall'],
  ['battery-bank', [50, 4, 118], 'the hazard mark on the bus bar'],
  ['shrine-shelf', [14, 4, 140], 'a shrine bracket at the shelf'],
  ['shrine-shelf', [14, 30, 116], 'a shrine bracket at the wall'],
];

test('⭐ E8-3 restated: every named junction is still met, within the amplitude, by as many members', () => {
  for (const [id, cm, what] of JUNCTIONS) {
    const F = frameFor(id);
    const [px, py] = F.project(...cm);
    const rawFrag = FT[camel(id)]({ w: 240, h: 240, idPrefix: `j-${id}`, sketch: false });
    const rows = measurePiece(rawFrag, id).rows;
    // raw: how many source members pass exactly through the junction (the `hasPoint` question)
    const exact = `${nn(px)} ${nn(py)}`;
    const rawHits = rows.filter((r) => {
      const a = attrsOf(r.src);
      return (a.d && a.d.includes(exact))
        || (a.cx != null && `cx="${a.cx}" cy="${a.cy}"` === `cx="${nn(px)}" cy="${nn(py)}"`);
    }).length;
    assert.ok(rawHits >= 1, `${id}: ${what} is drawn through by NO raw member — the E8 guard this `
      + 'restates is asking about a point the piece does not draw, so both are about nothing');
    // treated: how many source members' ink comes within AMP of it
    const near = rows.filter((r) => {
      const polys = (r.outDs || []).flatMap((d) => flatten(d));
      return polys.length > 0 && farFrom(polys, [[px, py]], AMP).length === 0;
    }).length;
    assert.ok(near >= rawHits,
      `${id}: ${what} — ${rawHits} members meet it in the raw drawing but only ${near} come within `
      + `the amplitude (${AMP.toFixed(2)}) of it once treated. Overshoot makes lines CROSS at a `
      + 'joint; it must never make them GAP, which is ruling E8 class 3 coming back.');
  }
  // ⛔ NON-VACUITY, AS AN INCLUSION TEST: a point 20 cm off the piece must be met by NOBODY, or
  // "within the amplitude" is a filter that admits everything and the rule above is free.
  // ⚠️ THE CONTROL POINT IS OFF THE PIECE ENTIRELY, and the first draft's was not: 20 cm below the
  // bracket's wall end is still ON the bracket, and two members honestly met it. A control that
  // lands on the drawing measures nothing. This one is 30 cm outside the shelf's own 64 cm width.
  const F = frameFor('shrine-shelf');
  const [ox, oy] = F.project(-30, 30, 40);
  const rows = measurePiece(FT.shrineShelf({ w: 240, h: 240, idPrefix: 'j-shrine-shelf', sketch: false }),
    'shrine-shelf').rows;
  const stray = rows.filter((r) => {
    const polys = (r.outDs || []).flatMap((d) => flatten(d));
    return polys.length > 0 && farFrom(polys, [[ox, oy]], AMP).length === 0;
  }).length;
  assert.ok(stray < 2, `a point 20 cm below the shrine bracket's wall end is met by ${stray} members `
    + '— the proximity test admits anything and proves nothing');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. ⭐⭐ WRECKED vs PRISTINE — the functional half, and it is DRIVEN
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS IS NOT A VISUAL QUESTION. "Which pieces are broken" is FEEDBACK, and in this repo
// invisible feedback is broken feedback (binding, 2026-07-26). At `strong` the experiment reported
// pristine pieces beginning to read as wrecked — halo bites on legs and louvres — so the risk the
// owner's choice carries is precisely that a pristine piece and its twin stop being tellable apart.
// A byte comparison cannot answer that: two different wobbles of one identical drawing differ in
// every byte.
//
// THE METRIC, and it is honest because its threshold is the treatment's OWN bound: a point of the
// treated twin that is further than `AMP` from EVERY mark of the treated pristine piece cannot be a
// pristine mark drawn by a different hand — the displacement pin above says so, for every element,
// in both directions. Whatever is left is damage. So "the damage survives the treatment" is
// countable, and its control is that a treated piece measured against ITSELF yields zero.

/** Every `d` a fragment's body emits (defs stripped, the ground rule kept — it is drawn ink). */
const marksOf = (svg) => [...svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').matchAll(/ d="([^"]+)"/g)]
  .map((m) => m[1]);

/** The drawn LENGTH of a `d`, curves flattened — ink, not element count. */
const inkLength = (d) => flatten(d).reduce((acc, poly) => {
  let L = 0;
  for (let i = 0; i + 1 < poly.length; i += 1) L += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  return acc + L;
}, 0);

const sumLen = (ds) => ds.reduce((a, d) => a + inkLength(d), 0);

/** A fragment's body with def-id namespacing normalised away. */
const normBody = (svg) => {
  const n = svg.replace(/[A-Za-z0-9-]+__(\d+)/g, 'ID_$1');
  return n.slice(n.indexOf('scale('));
};

test('⭐⭐ every twin is tellable from its treated pristine piece by MORE than treatment noise', () => {
  assert.equal(PAPER_TWIN_IDS.length, 47, 'the treated-twin population changed');
  const weak = [];
  let addedTwins = 0;
  let redrawTwins = 0;
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      if (!PAPER_TWIN_IDS.includes(id)) continue;
      const pristine = cat.ship(id);
      const twin = buildWrecked(id, { w: 240, h: 240, idPrefix: `a-${id}` });
      assert.notEqual(twin, pristine, `${id}: the treated twin is byte-identical to the treated piece`);

      const A = new Set(marksOf(pristine));
      const B = new Set(marksOf(twin));
      const drift = sumLen([...A].filter((d) => !B.has(d)));   // pristine ink the twin did not reproduce
      const damage = sumLen([...B].filter((d) => !A.has(d)));  // ink only the twin draws
      const total = sumLen([...A]);

      // (a) THE CONTROL, ON THE SAME INSTRUMENT AND FIRST. The treatment is deterministic, so a
      //     treated fragment against ITSELF must have a symmetric difference of exactly zero. If it
      //     does not, every number below is noise and the guard is measuring the instrument.
      const self = new Set(marksOf(cat.ship(id)));
      assert.equal([...A].filter((d) => !self.has(d)).length, 0,
        `${id}: a treated piece differs from itself — the metric is broken`);

      // (b) THE PAIR IS TELLABLE APART, as a share of the piece's OWN ink so a big drawing is not
      //     graded more leniently than a small one. MEASURED at adoption: the weakest pair is
      //     `door-sliding` at 1.54% / 184 units; both floors sit just under that and far above zero.
      const share = (drift + damage) / total;
      assert.ok(share >= 0.012 && drift + damage >= 120,
        `${id}: the treated twin differs from the treated pristine piece by only `
        + `${(share * 100).toFixed(2)}% of its ink (${(drift + damage).toFixed(0)} units).\n`
        + 'At `strong` the knockout runs on every element and the experiment saw pristine pieces\n'
        + 'begin to read as wrecked — this is the guard for that. A pair this close is a pair the\n'
        + 'player cannot use to tell which machines are broken, and that is FUNCTIONAL feedback.');

      // (c) …AND FOR A DAMAGE-ADDED TWIN THE DIFFERENCE IS THE DAMAGE, NOT THE DRIFT. Classified by
      //     the property itself — the twin's RAW body starts with the pristine's — rather than by a
      //     list, so a twin that stops being an "add damage" twin re-classifies itself.
      const rawP = normBody(cat.raw(id));
      const rawT = normBody(buildWrecked(id, { w: 240, h: 240, idPrefix: `a-${id}`, sketch: false }));
      if (rawT.startsWith(rawP.slice(0, rawP.length - '</g></g>'.length))) {
        addedTwins += 1;
        assert.ok(damage > 1.5 * drift,
          `${id}: the twin ADDS damage to its own pristine drawing, yet only ${damage.toFixed(0)} `
          + `units of its ink are new against ${drift.toFixed(0)} units the treatment redrew.\n`
          + 'The difference between the pair is then mostly the hand, not the damage.');
      } else {
        // the one REDRAW twin: `cell-sound`'s twin is card 34 (CELL, SPENT), a different drawing
        // rather than the same one marked up — so "damage vs drift" is not its shape and (b) is.
        redrawTwins += 1;
        assert.ok(share > 0.05, `${id} is a REDRAW twin and differs by only ${(share * 100).toFixed(1)}%`);
      }
      weak.push({ id, share: +share.toFixed(4), damage: +damage.toFixed(0), drift: +drift.toFixed(0) });
    }
  }
  assert.equal(addedTwins, 46, 'the damage-added twin population changed');
  assert.equal(redrawTwins, 1, 'the redraw-twin population changed — `cell-sound` was the only one');
  const weakest = weak.sort((a, b) => a.share - b.share)[0];
  assert.ok(weakest.share >= 0.012, `${weakest.id} is the weakest pair at ${weakest.share}`);
});

test('the distinguishability check FAILS when a twin\'s damage is dropped — driven', () => {
  // ⛔ THE MUTATION IS APPLIED, NOT DESCRIBED. A twin whose damage pass is removed is exactly its
  // pristine piece re-painted, and measured through the same instrument it must read ZERO — so the
  // guard above would fail on it. Without this the share floor is a number nobody has seen fail.
  const id = 'door-blast';
  const pristine = PF[camel(id)]({ w: 240, h: 240, idPrefix: `a-${id}` });
  const damaged = buildWrecked(id, { w: 240, h: 240, idPrefix: `a-${id}` });
  const A = new Set(marksOf(pristine));
  const live = sumLen(marksOf(damaged).filter((d) => !A.has(d)));
  const stripped = sumLen(marksOf(pristine).filter((d) => !A.has(d)));
  assert.ok(live > 120, `the live twin adds only ${live.toFixed(0)} units — nothing to sit against`);
  assert.equal(stripped, 0,
    'a twin with its damage pass dropped still reads as damaged — the metric is measuring the\n'
    + 'treatment\'s wobble rather than the marks, and the guard above would pass a collapsed pair');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE TREATMENT BUYS NO COLOUR, AND IT REACHES EVERY MEMBER
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('palette closure holds on what SHIPS — four values across all four catalogues and the twins', () => {
  const allowed = new Set([INK, PAPER, ATTEND, PAPER_FLAT]);
  let seen = 0;
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      const frags = [cat.ship(id)];
      if (PAPER_TWIN_IDS.includes(id)) frags.push(buildWrecked(id, { w: 240, h: 240, idPrefix: `a-${id}` }));
      for (const svg of frags) {
        for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)) {
          assert.ok(allowed.has(m[1].toUpperCase()),
            `${cat.name}/${id} emits ${m[1]} under the treatment. There are THREE colours in this\n`
            + 'dialect plus one flat side tone, and a post-processor may not buy a grey to fake a pen.');
          seen += 1;
        }
      }
    }
  }
  assert.ok(seen > 5000, `only ${seen} colour references scanned — the closure is vacuous`);
});

// ⭐ THE INERT-ARM CATCH, PINNED SO IT CANNOT COME BACK. `drawShape` has always carried an arm for a
// body the builder drew as curves — and until this package that arm was UNREACHABLE, because pass 1
// only measured shapes `parsePath` accepted and `parsePath` bails on the first `Q`/`C`. 53 of the
// four catalogues' 1428 stroked path bodies shipped at their untreated weight. This is CLAUDE.md's
// "a verb can be present and INERT" and it was found by the stroke ramp, not by looking.
test('a hand-drawn curve body IS re-penned — the treatment reaches every stroked member', () => {
  const rampValues = new Set(Object.values(W));
  let curveBodies = 0;
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      for (const r of measurePiece(cat.raw(id), id).rows) {
        if (r.kind !== 'penOnly') continue;
        if (!/[QC]/.test(r.srcD)) continue;
        curveBodies += 1;
        const src = attrsOf(r.src);
        const emitted = (r.out.match(/stroke-width="([\d.]+)"/g) || [])
          .map((m) => +m.slice('stroke-width="'.length, -1));
        assert.ok(emitted.length > 0, `${cat.name}/${id}: a curve body emitted no stroke at all`);
        assert.ok(!emitted.includes(+src['stroke-width']),
          `${cat.name}/${id}: a hand-drawn curve body still ships at its RAW weight `
          + `${src['stroke-width']}. The treatment's curve arm is unreachable again — the piece is\n`
          + 'half re-penned, and the only tell is the ramp.');
      }
    }
  }
  assert.ok(curveBodies >= 40, `only ${curveBodies} curve bodies found — the guard is vacuous`);
  // …and the ramp's own witness: no raw rung survives into treated output anywhere.
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      const svg = cat.ship(id).replace(/<pattern[\s\S]*?<\/pattern>/g, '');
      for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) {
        assert.ok(!rampValues.has(+m[1]) || penSteps(SKETCH_LEVEL, Object.values(W)).includes(+m[1]),
          `${cat.name}/${id} still strokes at the raw rung ${m[1]}`);
      }
    }
  }
});

// ⭐⭐ THE INVISIBLE-INK PROBE, RE-RUN OVER ALL FOUR CATALOGUES AND ALL FORTY-SEVEN TWINS UNDER THE
// TREATMENT. This is the class of defect the owner's `strong` choice actually risks: `haloScope:
// 'all'` puts a paper stroke 1.9 units wider than its own ink under EVERY element, so each element
// lays a knockout over whatever was drawn before it — the "halo bites" the experiment saw on legs
// and louvres.
//
// ⚠️ A BITE IS NOT A DELETION, AND THE RULE SAYS SO DELIBERATELY. A halo crossing a leg takes a
// chunk out of it; the leg is still drawn and still visible either side. Nothing in a string can
// decide "how much of this member survived" — that judgement is the owner's, on the pairs sheet.
// What IS decidable is TOTAL ERASURE, in its two forms, and that is what this pins.
test('⭐⭐ no member of any treated piece or twin is erased — by a later face or by a knockout', () => {
  let members = 0;
  let knockouts = 0;
  const ledger = [];
  let unburied = 0;
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      const frags = [['pristine', cat.raw(id)]];
      if (PAPER_TWIN_IDS.includes(id)) {
        frags.push(['twin', buildWrecked(id, { w: 240, h: 240, idPrefix: `a-${id}`, sketch: false })]);
      }
      for (const [what, frag] of frags) {
        const { rows } = measurePiece(frag, id);
        // ⭐ BOTH WAYS, SO A HIT IS ATTRIBUTABLE. Nine members of this set are buried under a later
        // opaque face — and they are buried in the RAW drawing too, identically, so the treatment
        // neither causes them nor cures them. Asserting the two answers AGREE is the statement this
        // package can honestly make; the nine themselves are FILED (see the ledger below).
        const b = buriedMembers(rows);
        const rawB = buriedMembers(rows, { raw: true });
        const rawSet = new Set(rawB.buried);
        const newly = b.buried.filter((d) => !rawSet.has(d));
        assert.deepEqual(newly, [],
          `${cat.name}/${what}/${id}: the TREATMENT buried ${newly.length} member(s) that are visible\n`
          + `in the raw drawing:\n  ${newly.slice(0, 2).join('\n  ')}\n`
          + 'The treatment may bite a member with its knockout; it may not delete one.');
        // ⚠️ THE OTHER DIRECTION IS ALLOWED AND IS THE OVERSHOOT DOING ITS JOB, so it is recorded
        // rather than asserted away: capsule 31's 1-unit sill tick is buried in the raw drawing and
        // pokes out from under its own face once the run starts 3.6 units early. One member, on one
        // piece, measured — not a general licence, which is why the count is pinned below.
        if (rawB.buried.length > b.buried.length) unburied += rawB.buried.length - b.buried.length;
        if (rawB.buried.length) ledger.push(`${cat.name}/${what}/${id}:${rawB.buried.length}`);
        members += b.members;
        const k = unbackedKnockouts(rows, PAPER, [INK, ATTEND]);
        assert.deepEqual(k.bad, [],
          `${cat.name}/${what}/${id} draws ${k.bad.length} paper stroke(s) with no ink over them:\n`
          + `  ${k.bad.slice(0, 2).join('\n  ')}\n`
          + 'A knockout with nothing on top is paper on paper — a member that draws NOTHING, and\n'
          + 'every string assertion in this repo agrees with it.');
        knockouts += k.count;
      }
    }
  }
  // ⛔ BOTH NON-VACUITY FLOORS. A probe that inspected no members and a probe that found no
  // knockouts read exactly as green as a clean set.
  // ⛔ THE LEDGER OF PRE-EXISTING BURIED MEMBERS — FILED, NOT CHASED, AND PINNED SO A NEW ONE FAILS.
  // All nine are in the RAW art and were invisible until this probe was pointed at these two
  // catalogues (`paper-fixtures.test.js` has run its own since its lane; fittings and machines never
  // had one). They are a drawing question for their own package, not this one:
  //   bench ×2          — two of the four knee braces sit under the seat slab's own front face
  //   reactor-plant ×6  — the six control-strip rules lie inside the strip's paper panel
  //   deck-turret ×1    — the mount's rear half-arc is under the body it belongs to
  //   solar-wing ×1     — one panel cell line lies inside the panel's own face
  //   capsule-sealed ×2 / sink ×1 — TWIN-ONLY: the damage pass adds an opaque mark over a member
  //                        the pristine drawing leaves visible
  // The twins repeat their pristine piece's members, so a pristine count reappears on the twin.
  assert.deepEqual([...new Set(ledger)].sort(), [
    'fittings/pristine/bench:2',
    'fittings/twin/bench:2',
    'fittings/twin/capsule-sealed:2',
    'fittings/twin/sink:1',
    'machines/pristine/deck-turret:1',
    'machines/pristine/reactor-plant:6',
    'machines/pristine/solar-wing:1',
    'machines/twin/deck-turret:1',
    'machines/twin/reactor-plant:6',
    'machines/twin/solar-wing:1',
  ], 'the buried-member ledger moved. A NEW entry is a member that draws nothing; a MISSING one is\n'
    + 'a fix, and both deserve to be said out loud rather than absorbed.');
  assert.equal(unburied, 4,
    'the number of members the OVERSHOOT lifts out from under a face moved. Four is the measured\n'
    + 'figure at adoption (capsule 31\'s two sill ticks, the sink\'s one, the solar wing\'s one); a\n'
    + 'jump means runs are reaching much further past their corners than the bound says they can.');
  assert.ok(members > 1200, `only ${members} members inspected — the probe saw nothing`);
  assert.ok(knockouts > 2000, `only ${knockouts} knockout strokes found — at ${SKETCH_LEVEL} the `
    + 'halo runs on every element, so this near zero means the treatment is not applied');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. DETERMINISM — the invariant, on the SHIPPED path this time
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the shipped treated art is byte-stable, and the stability is not the stability of a no-op', () => {
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      assert.equal(cat.ship(id), cat.ship(id), `${cat.name}/${id} is not deterministic`);
      assert.notEqual(cat.ship(id), cat.raw(id), `${cat.name}/${id}: stable because it did nothing`);
    }
  }
  // …and two PLACEMENTS of one piece are the same drawing, which is what seeding by the piece id buys.
  const a = FT.diningTable({ w: 200, h: 200, idPrefix: 'p1', index: 0 });
  const b = FT.diningTable({ w: 200, h: 200, idPrefix: 'p1', index: 7 });
  assert.equal(a, b, 'two placements of one dining table are two different drawings — the seed is\n'
    + 'reading the placement, so a room full of one fitting reads as a room full of near-misses');
  // …while an explicit override really does change the hand, or the option is decoration.
  assert.notEqual(a, FT.diningTable({ w: 200, h: 200, idPrefix: 'p1', sketchSeed: 'other' }),
    '`sketchSeed` does not reach the treatment');
});

test('no clock, no RNG, no locale API on the shipped treatment path — with both controls', () => {
  const raw = readFileSync(join(HERE, '..', 'src', 'render', 'sketch.js'), 'utf8');
  const code = codeOnly(raw);
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'toLocaleString', 'Intl.']) {
    assert.equal(code.includes(banned), false, `sketch.js calls ${banned} in CODE — every fitting on\n`
      + 'every deck would then differ between two renders of one room');
  }
  assert.equal(raw.includes('Math.random'), true,
    'the header no longer mentions Math.random, so the comment strip proves nothing');
  assert.equal(`${code}\nMath.random();`.includes('Math.random'), true);
  // the seam itself: `helpers.item()` may not reach for one either
  const helpers = codeOnly(readFileSync(join(HERE, '..', 'src', 'items', 'helpers.js'), 'utf8'));
  for (const banned of ['Math.random', 'Date.now', 'new Date']) {
    assert.equal(helpers.includes(banned), false, `helpers.js calls ${banned}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE GROUND RULE — the treatment's one piece of NEW ink, on every treated piece
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every treated piece stands on a ground rule, inside its own scaling group', () => {
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      const svg = cat.ship(id);
      const marks = (svg.match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length;
      assert.equal(marks, 1, `${cat.name}/${id} draws ${marks} ground rules`);
      // ⛔ INSIDE THE SCALING GROUP, WHICH IS THE BUG THE EXPERIMENT'S ROOM SHOT FOUND: appended
      // outside it, the rule is authored in the piece's units and drawn in the room's px, hundreds
      // of units away, where a stray mark is indistinguishable from a fitting.
      const at = svg.indexOf(`class="${GROUND_CLASS}"`);
      const after = svg.slice(at);
      assert.ok(/^[^<]*\/>\s*<\/g>\s*<\/g>\s*$/.test(after.slice(after.indexOf('/>'))),
        `${cat.name}/${id}: the ground rule is not the last mark inside the piece's own scaling group`);
      // …and it lies UNDER the piece's own raw ink, which is where `sketch.js` measures it from.
      const rule = bodyExtent(svg).ground;
      assert.equal(rule.length, 1);
      const ys = [...attrsOf(rule[0]).d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[2]);
      assert.equal(new Set(ys).size, 1, `${cat.name}/${id}: the ground rule is not level`);
      assert.ok(ys[0] >= bodyExtent(cat.raw(id)).bb[3] - 0.01,
        `${cat.name}/${id}: the ground rule is drawn above the piece's own lowest raw ink — it is a `
        + 'stroke across the piece rather than the line it stands on');
    }
  }
});

// ⭐⭐ …AND NO MATERIAL SKIN DOES — AN ORCHESTRATOR RULING, 2026-08-05, OVERRIDABLE BY THE OWNER.
//
// THE RULE'S OWN SEMANTICS ARE WHAT DECIDED IT, not taste. The ground rule is the pawns' sixth tell
// (`pawn-svg.js`'s `M3.4 23.5 L12.6 23.5`): the faint line a thing STANDING on a deck is drawn
// resting on — "a figure on paper does not cast a shadow, it stands on a line". A material is not a
// standing thing. A wall or floor skin IS the deck, tiled; there is no floor under it for it to meet.
//
// MEASURED BEFORE THE KNOB EXISTED, which is why this is a ruling and not an opinion:
//   · all TWELVE skins emitted their rule 1.5–3.7 units OUTSIDE their own tile edge — `sketch()`
//     puts it at `maxY + max(0.6, 1.2% of the drawn height)`, and a full-bleed skin's `maxY` IS the
//     tile edge, so the mark lands in the next tile;
//   · one 12 × 8 room floor drew NINETY-SIX of them through `roomzoom-view.materialLayerSvg` — a
//     grid of ink ticks across the deck at the tiling pitch, which is precisely the artefact a floor
//     skin exists to avoid.
// Regenerated for the ruling so it can be vetoed from the PICTURE and not from this paragraph: the
// materials sheet and one live room-floor shot.
//
// ⛔ IT IS A NAMED PER-CATALOGUE KNOB (`item(..., { sketched: true, ground: false })`), NOT A SPECIAL
// CASE INSIDE `sketch()`. A treatment that asked "is this a material?" would be a second authority on
// the catalogue split, in the module furthest from it; a knob is a sentence the catalogue says about
// itself, and the day the owner overrules this it is one word.
test('⭐⭐ NO material skin stands on a ground rule, and every standing piece still does', () => {
  let skins = 0;
  for (const id of MATERIAL_IDS) {
    const svg = MAT_BUILD[id]({ w: 200, h: 200, idPrefix: 'mt' });
    assert.equal((svg.match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length, 0,
      `${id}: a MATERIAL skin draws a ground rule. A tiling field has no floor under it to meet, and\n`
      + 'one room floor draws ninety-six of these — a grid of ink ticks at the tiling pitch.');
    // …and it is ONLY the ground knob that is off: the skin is still treated in every other respect.
    assert.notEqual(svg, MAT_BUILD[id]({ w: 200, h: 200, idPrefix: 'mt', sketch: false }),
      `${id}: turning the ground rule off turned the whole treatment off`);
    skins += 1;
  }
  assert.equal(skins, 12, 'the material set changed size — six walls and six floors');

  // ⛔ THE INCLUSION CONTROL, BOTH WAYS, DRIVEN — a scan that finds nothing and a scan that CANNOT
  // find anything read exactly alike, and this is the shape that has bitten this repo repeatedly.
  //   (a) the same twelve skins, with the knob forced ON, must each draw exactly one;
  //   (b) a standing piece with the knob forced OFF must draw none.
  // Both go through the shipped `sketch()` rather than a re-derivation, so the knob is what is pinned.
  let forcedOn = 0;
  for (const id of MATERIAL_IDS) {
    const raw = MAT_BUILD[id]({ w: 200, h: 200, idPrefix: 'mt', sketch: false });
    const on = sketch(raw, { level: SKETCH_LEVEL, seed: id, ground: true });
    assert.equal((on.match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length, 1,
      `${id}: with the ground knob forced ON the skin still draws no rule — the guard above passes\n`
      + 'because nothing could ever be found, not because the knob is doing anything.');
    forcedOn += 1;
  }
  assert.equal(forcedOn, 12);
  const off = sketch(FT.diningTable({ w: 240, h: 240, idPrefix: 'g', sketch: false }),
    { level: SKETCH_LEVEL, seed: 'dining-table', ground: false });
  assert.equal((off.match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length, 0,
    'the ground knob does not turn OFF on a standing piece — it is not a knob, it is a catalogue test');

  // …and the four standing catalogues keep exactly one each, which the §7 sweep above already says
  // per piece; restated here as a TOTAL so the two halves of the ruling sit in one place.
  let standing = 0;
  for (const cat of CATALOGUES) {
    for (const id of cat.ids) {
      standing += (cat.ship(id).match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length;
    }
  }
  assert.equal(standing, ALL_TREATED_IDS.length,
    `${standing} ground rules across ${ALL_TREATED_IDS.length} standing pieces — it must be one each`);
});

// ⭐⭐ …AND THE RULING IS PINNED AT THE SURFACE THAT MEASURED IT, NOT ONLY AT THE BUILDER. The number
// that decided this is not "one rule per skin", it is NINETY-SIX RULES ON ONE FLOOR — and that number
// only exists where the skins are laid out, which is `roomzoom-view.materialLayerSvg`. A pin on the
// builder alone would stay green the day someone re-enables the knob one layer up.
test('⭐⭐ a room floor draws NO ground rules — the ninety-six, at the surface that counted them', () => {
  const tiles = [];
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) tiles.push({ kind: 'floor', mat: 1, tx: x, ty: y });
  const place = { cell: (x, y) => `translate(${x * 95} ${y * 95})`, front: (x, y) => [x * 95, y * 95] };
  const svg = materialLayerSvg(tiles, place, { rx: 0, ry: 0, rw: 12, rh: 8 });
  const marks = (svg.match(new RegExp(`class="${GROUND_CLASS}"`, 'g')) || []).length;
  assert.equal(marks, 0,
    `a 12 × 8 room floor draws ${marks} ground rules (it drew 96 before the ruling) — a grid of ink\n`
    + 'ticks across the deck at the tiling pitch, which is the artefact the ruling exists to remove.');
  // ⛔ NON-VACUITY, AS AN INCLUSION TEST: the layer really did lay ninety-six skins down. A layer
  // that emitted nothing at all would satisfy the line above and say nothing.
  const laid = (svg.match(/class="pl-item"/g) || []).length;
  assert.equal(laid, 96, `the floor laid ${laid} skins, not 96 — the count above is about nothing`);
  // …and the skins ARE treated on that floor: the doubled pass is a mark only the treatment writes.
  assert.ok((svg.match(new RegExp(DOUBLE_CLASS, "g")) || []).length > 0,
    'the room floor\'s skins are untreated — "no ground rule" is then just "no treatment"');
});
