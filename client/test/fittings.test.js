// THE THIRTY FITTINGS (client/src/items/fittings.js) — the paper/ink port of the owner's
// `design-import/Perilune Fittings.dc.html`, drawn on the cabinet-oblique kit.
//
// WHAT THIS FILE IS FOR, in one sentence: to make it impossible for a fitting to slide back into the
// catalogue's own unfinished state without a test naming which one and which fault.
//
// ⚠️ THE HALF THIS FILE CANNOT DO, SAID FIRST. Every assertion here is about a STRING. A builder can
// satisfy all of them and still draw a chair whose proportions are wrong or whose ink is too fine to
// survive being scaled into a 48-px tile, and the emitted text is byte-identical in the working and
// the broken case. The set is therefore ALSO photographed — `client/tools/fittings-sheet.mjs` renders
// all thirty onto one page and again at 32/48/72 px, and the package report carries the shots. This
// repo's standing rule is that invisible feedback is broken feedback; a green suite here is a
// necessary condition and never a sufficient one.
//
// ⚠️ AND THE PART THAT IS WORTH TESTING IS NOT "does it draw". `items.test.js` already asserts that
// every registry row builds a balanced, deterministic, collision-free fragment, and it now covers
// these thirty as ordinary rows. What it CANNOT see is ruling E8: the charter names fourteen of the
// thirty catalogue drawings as visually unfinished, in six classes, and a verbatim port would pass
// every generic assertion in the repo while shipping every one of those faults. So the six classes
// are the subject here — each pinned by a representative fitting, each with the catalogue's OWN
// broken geometry available as a control, so a test that has stopped being able to see the fault
// fails rather than agreeing vacuously.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as FT from '../src/items/fittings.js';
import {
  FITTING_IDS, SPECS, SIZES, BOX_EXTENT, BOX, W, frameFor,
} from '../src/items/fittings.js';
import {
  HATCH, depth, n as nn, PAPER_FLAT, DEPTH_RATIO, PX_PER_CM,
} from '../src/render/oblique.js';
import { INK, PAPER, ATTEND } from '../src/items/helpers.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'items', 'fittings.js'), 'utf8');

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const build = (id, opts = { idPrefix: 'f' }) => FT[camel(id)](opts);

/** Every `M x y` / `L x y` / `Q x y` coordinate pair in a fragment, as `[x, y]`. */
function points(svg) {
  return [...svg.matchAll(/[MLQ](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
}

/** Every TWO-POINT stroked segment in a fragment, as `{ x1, y1, x2, y2 }`. */
function segments(svg) {
  return [...svg.matchAll(/ d="M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)"/g)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
}

/** Every `<ellipse>` in a fragment. */
function ellipses(svg) {
  return [...svg.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="([\d.]+)" ry="([\d.]+)"([^>]*)\/>/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], rx: +m[3], ry: +m[4], tail: m[5] }));
}

/**
 * ⭐ THE JOIN THIS FILE LEANS ON, AND WHY IT IS A SEAM RATHER THAN A TEXT SCAN (CLAUDE.md trap 4).
 * "Does this member reach the floor?" is a question about a POINT IN THE PIECE'S OWN CENTIMETRES, and
 * the only honest way to ask it of a string is to put the same centimetres through the same
 * projection the builder used and look for the answer it must have produced. `frameFor(id)` is
 * literally the builder's frame, so this compares a recorded argument at the seam, never a remembered
 * pixel — and it moves correctly if the drawing scale ever changes.
 */
// ⚠️ THE OBLIQUE'S TWO RATIOS ARE READ HERE, NOT TYPED — and the reason is the defect this file
// itself carried: `fittings.js` spelled `0.4`/`0.6` out at four sites and this suite spelled `0.6` out
// at two more, so six copies of one design decision agreed with each other by luck. `DEPTH_RATIO` is
// the single home (`oblique.depth()` is its only other reader), the charter §1 fixes its VALUES, and
// those two literals are therefore asserted ONCE below — everything else derives from the constant.
const RX = DEPTH_RATIO.x;
const RY = Math.abs(DEPTH_RATIO.y);          // the kit's y ratio is −0.6: in SVG, up is negative

function hasPoint(svg, id, [x, y, z], msg) {
  const [px, py] = frameFor(id).project(x, y, z);
  const asPath = `${nn(px)} ${nn(py)}`;
  const asEllipse = `cx="${nn(px)}" cy="${nn(py)}"`;   // r3 and n agree at ≤2 dp, which is all we emit
  assert.ok(svg.includes(asPath) || svg.includes(asEllipse),
    `${msg}\n  expected ${id} to draw through (${x}, ${y}, ${z}) cm ⇒ "${asPath}", and it does not.`);
}

/**
 * The ONE emitted member that runs through every one of `pts` (in the piece's centimetres), returned
 * as its projected `[x, y]` points.
 *
 * ⚠️ WHY IT INSISTS ON EXACTLY ONE, and why that is the whole difference from calling `hasPoint`
 * twice: two `hasPoint`s prove two coordinates are drawn SOMEWHERE, which two unrelated strokes
 * satisfy as happily as one member does. Requiring a single `d` that contains all of them is the
 * statement that they are the same run of ink — and it hands back that run's points, so a rule can
 * then be asked about the member rather than about the piece.
 */
function memberThrough(svg, id, pts, what) {
  const F = frameFor(id);
  const want = pts.map(([x, y, z]) => {
    const [px, py] = F.project(x, y, z);
    return `${nn(px)} ${nn(py)}`;
  });
  const ds = [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
    .filter((d) => want.every((w) => d.includes(w)));
  assert.equal(ds.length, 1,
    `${what}: expected exactly ONE member running through ${want.join(' → ')}, found ${ds.length}.\n`
    + 'Zero means it is gone or re-placed; more than one means the points are shared by other ink and\n'
    + 'this rule is about the wrong path.');
  return points(ds[0]);
}

/**
 * THE PROJECTION, INVERTED: the DEPTH in centimetres that a projected x implies for a point whose
 * centimetre x is known. `project` is affine — `px = x0 + s·x + RX·s·y` — so this is exact.
 *
 * ⚠️ WHY IT IS WORTH HAVING. "Does this member reach the wall?" asked as `hasPoint(…, [x, 36, z])`
 * needs the z too, which welds the question to the exact height the builder happens to use today;
 * re-place the member 2 cm up and the guard reports "gone" rather than "still reaches". Asked as a
 * DEPTH it is the question actually meant: whichever way the member is drawn, does an end of it land
 * on the plane the wall stub is on?
 */
function depthAt(F, xCm, px) { return (px - F.x0 - F.s * xCm) / (RX * F.s); }

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SET — thirty pieces, present, pure, namespaced
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the catalogue is thirty, every id has a builder, and every builder draws something', () => {
  assert.equal(FITTING_IDS.length, 30, 'the owner\'s catalogue is thirty pieces');
  assert.equal(Object.keys(SPECS).length, 30);
  for (const id of FITTING_IDS) {
    const fn = FT[camel(id)];
    assert.equal(typeof fn, 'function', `${id} has no exported builder`);
    assert.equal(fn.name, camel(id),
      `${id}'s builder is named ${fn.name} — the convention wrecked.test.js's painter floor pins`);
    const svg = build(id);
    assert.ok(svg.startsWith('<g') && svg.trimEnd().endsWith('</g>'), `${id} is a <g> fragment`);
    assert.ok(!svg.includes('<svg'), `${id} is a fragment, not a document`);
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${id} emitted NaN/undefined`);
    // NON-TRIVIALITY AS A SHAPE COUNT, not a string length: a fragment of pure comment would pass a
    // length floor. The lightest piece in the set (the rug) still draws more than four elements.
    const shapes = (svg.match(/<(path|ellipse|circle|rect)\b/g) || []).length;
    assert.ok(shapes >= 5, `${id} draws only ${shapes} shapes — that is a stub, not a fitting`);
  }
});

test('every builder is deterministic and every placement is id-collision free', () => {
  for (const id of FITTING_IDS) {
    assert.equal(build(id, { w: 100, h: 100, idPrefix: 'x' }), build(id, { w: 100, h: 100, idPrefix: 'x' }),
      `${id} is not deterministic`);
    const idsOf = (s) => new Set([...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const a = idsOf(build(id, { idPrefix: `${id}-a` }));
    const b = idsOf(build(id, { idPrefix: `${id}-b` }));
    for (const x of a) assert.ok(!b.has(x), `${id}: def id ${x} appears in two placements`);
    // …and the ids really are namespaced to the caller, not merely different from each other.
    for (const x of a) assert.match(x, new RegExp(`^${id}-a`), `${id}: def id ${x} ignores idPrefix`);
  }
});

test('the module reaches for no clock, no randomness and no DOM', () => {
  const code = codeOnly(SRC);
  assert.ok(code.length > 6000, 'non-vacuity: the comment stripper ate the module');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'document.', 'window.',
    'performance.now', 'toLocaleString', 'Intl.']) {
    assert.ok(!code.includes(banned), `fittings.js reaches for ${banned}`);
  }
});

// ⚠️ THE SEAM RULE, AND IT IS THE ONE THIS PACKAGE IS MOST LIKELY TO BREAK BY ACCIDENT. Thirty
// drawings ported from a document whose every value is a literal is thirty chances to paste
// `#14120F` in. The three colours have exactly one home each (`helpers.js` re-exports them for this
// tree, `oblique.js` for the kit), and a fourth spelling of black is how two modules come to disagree
// about ink after a retint.
test('no raw hex colour escapes the seam — the whole palette arrives by import', () => {
  const code = codeOnly(SRC);
  const hexes = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(hexes, [],
    `fittings.js names ${hexes.length} colour(s) literally: ${hexes.join(', ')}.\n`
    + 'Import INK / PAPER / ATTEND from ./helpers.js, or PAPER_FLAT / HATCH from ../render/oblique.js.');

  // ⚠️ TRAPS-1, BOTH HALVES, AND BOTH LIVE ON THE SHIPPED FILE RATHER THAN ON A FIXTURE.
  // (a) NEGATIVE CONTROL — the module's own prose really does quote the design's hex values (the
  //     hatch is documented as `#14120F` at 0.28 over `#EBE4D1`), so if `codeOnly` ever stopped
  //     stripping comments the scan above would fire on documentation and the "fix" would be to
  //     delete the explanation. That is worse than the bug, so the comment is asserted to exist.
  assert.match(SRC, /#EBE4D1/,
    'the header no longer quotes the design\'s own hex values, so the comment-stripping control\n'
    + 'above proves nothing. Either restore the explanation or delete this assertion — do not leave\n'
    + 'it green and vacuous.');
  assert.ok(!codeOnly(SRC).includes('#EBE4D1'), 'the stripper is not removing comments at all');
  // (b) POSITIVE CONTROL — the scan must actually catch a hex in CODE. A scan that matched nothing
  //     and a file that contained nothing are the same string.
  assert.ok(/#[0-9a-fA-F]{3,8}\b/.test(codeOnly("const c = '#7B2C22'; // ink\n")),
    'the hex scan cannot see a literal in code — it would pass over a whole retint');
});

test('the three colours this module draws in are the seam\'s, value for value', () => {
  // The builders use ATTEND on exactly two pieces (the cell rack's hazard mark and the shrine's
  // frame), so this is not a spelling check — it is the statement that the palette is closed.
  const used = new Set();
  for (const id of FITTING_IDS) {
    for (const m of build(id).matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)) used.add(m[1]);
  }
  const PALETTE = [INK, PAPER, PAPER_FLAT, ATTEND].filter((v, i, a) => a.indexOf(v) === i).sort();
  assert.deepEqual([...used].sort(), PALETTE,
    `the thirty fittings paint in ${[...used].join(', ')}. The dialect is ink, paper, the flat side\n`
    + 'tone and ONE accent; a fifth colour is a change to the design language, not to a fitting.');
  assert.equal(HATCH.ground, PAPER, 'the kit\'s hatch ground and the seam\'s paper have parted');
});

test('the two ratios the whole dialect turns on are ONE constant, and both readers read it', () => {
  // The values themselves — measured off the design documents, charter §1. This is the one place a
  // test file is allowed to say them out loud, because it is the place that is ABOUT them.
  assert.equal(DEPTH_RATIO.x, 0.4, 'the measured x ratio moved');
  assert.equal(DEPTH_RATIO.y, -0.6, 'the measured y ratio moved (negative: in SVG, up is −y)');

  // …and `fittings.js` really is reading it rather than carrying a fourth copy, asked at the SEAM:
  // the displacement a fitting's OWN frame produces for a metre of depth must be `depth()`'s.
  const F = frameFor('locker');
  const [ax, ay] = F.project(0, 0, 0);
  const [bx2, by2] = F.project(0, 100, 0);
  assert.deepEqual([nn(bx2 - ax), nn(by2 - ay)], depth(100, F.s),
    'a fitting\'s frame displaces depth differently from oblique.depth() — two projections again');

  // ⚠️ AND THE LITERAL MUST NOT COME BACK, because the four sites that carried it were correct on the
  // day they were written; that is precisely why an edit to one of them would go unnoticed. Scanned
  // on the CODE (the module's header quotes the ratios in prose on purpose — see the hex test's own
  // negative control for the same shape).
  const code = codeOnly(SRC);
  const strays = [...code.matchAll(/(?:0\.4|0\.6)\s*\*|\*\s*(?:0\.4|0\.6)\b/g)].map((m) => m[0]);
  assert.deepEqual(strays, [],
    `fittings.js multiplies by a projection ratio literally (${strays.join(', ')}). Import\n`
    + 'DEPTH_RATIO from ../render/oblique.js — one home, two readers, no third spelling. If the\n'
    + 'number genuinely is NOT the projection (the herb planter\'s stem bow is 0.6 and is a plant\'s\n'
    + 'proportion), give it a name and say so there: this scan is deliberately blunt, because a\n'
    + 'coincidence that reads as the ratio is exactly what the next reader will copy.');
  assert.ok(/(?:0\.4|0\.6)\s*\*/.test(codeOnly('const ry = 0.6 * s * rCm;\n')),
    'the stray-ratio scan cannot see its own subject — it would pass over a whole re-derivation');
});

// ⚠️ THIS TEST CHANGED SHAPE IN THE VR-P2 REVISION, AND THE OLD SHAPE IS WORTH RECORDING. It used to
// assert `max(SIZES[id].w, SIZES[id].h) === BOX` for all thirty — i.e. that every piece's registry
// `size` was normalised to 112 in its larger axis. That assertion was TRUE and the field it pinned
// was FALSE: a 260 cm bench claimed 112 × 27 and a ∅46 cm chair claimed 102 × 112, which are the two
// pieces' TILE proportions sold as a footprint. `SIZES` is now one shared scale for the set and
// `BOX_EXTENT` is the drawing, and the two are pinned separately because they answer two questions.
test('SIZES is an honest footprint at ONE shared scale; BOX_EXTENT is the drawn tile', () => {
  for (const id of FITTING_IDS) {
    const spec = SPECS[id];
    const z0 = spec.z0 == null ? 0 : spec.z0;
    const ex = spec.w + RX * spec.d;
    const ey = (spec.h - z0) + RY * spec.d;
    assert.deepEqual(SIZES[id],
      { w: Math.round(PX_PER_CM.catalogue * ex), h: Math.round(PX_PER_CM.catalogue * ey) },
      `${id}: the registry size hint is not this piece's centimetres at the catalogue's px/cm`);
    const k = BOX / Math.max(ex, ey);
    assert.deepEqual(BOX_EXTENT[id], { w: Math.round(k * ex), h: Math.round(k * ey) },
      `${id}: the drawn extent no longer matches the drawing it describes`);
    assert.equal(Math.max(BOX_EXTENT[id].w, BOX_EXTENT[id].h), BOX,
      `${id} does not fill its box in either axis`);
  }
  // The property the old field could not have: a bigger object has a bigger footprint. Stated on the
  // two pairs the review named, so a regression reports in the words the defect was found in.
  assert.ok(SIZES.bench.w > 3 * SIZES.chair.w,
    `a 260 cm bench (${SIZES.bench.w}) must not claim a footprint near a ∅46 cm chair's `
    + `(${SIZES.chair.w}) — that is the tile normalisation leaking back into the registry`);
  assert.ok(SIZES['bunk-bed'].h > 2 * SIZES.footlocker.h,
    'a 190 cm bunk stack must stand taller than a 50 cm footlocker');
  // …and the ORDERING is the centimetres' ordering, everywhere, which is what "one scale" means.
  for (const a of FITTING_IDS) {
    for (const b of FITTING_IDS) {
      const ea = SPECS[a].w + RX * SPECS[a].d;
      const eb = SPECS[b].w + RX * SPECS[b].d;
      if (ea > eb) {
        assert.ok(SIZES[a].w >= SIZES[b].w,
          `${a} is wider than ${b} in centimetres but not in its size hint`);
      }
    }
  }
});

// ⚠️ THIS IS THE ONE THAT CAUGHT A REAL DEFECT AND IT IS KEPT FOR THAT REASON. The harness centres a
// piece on its DECLARED box, so anything authored outside `0..w`, `0..d`, `0..h` is drawn but not
// counted — it simply hangs over the edge and is clipped by whatever the surface insets. Measured on
// the shipped tree at the time this was written: the stool's near foot, a level ellipse lying at
// depth 1 cm, reached 1.6 units below the frame's own floor line, because a disc on the floor hangs
// `0.6·s·r` beneath the point it stands on. The splay moved to 14 cm; the guard stayed.
test('nothing is drawn outside the box the piece is centred on', () => {
  for (const id of FITTING_IDS) {
    const svg = build(id);
    const over = [];
    for (const [x, y] of points(svg)) {
      if (Math.abs(x) > BOX / 2 + 0.05 || Math.abs(y) > BOX / 2 + 0.05) over.push(`(${x}, ${y})`);
    }
    for (const e of ellipses(svg)) {
      if (Math.abs(e.cx) + e.rx > BOX / 2 + 0.05 || Math.abs(e.cy) + e.ry > BOX / 2 + 0.05) {
        over.push(`ellipse ${e.cx},${e.cy} r ${e.rx},${e.ry}`);
      }
    }
    assert.deepEqual(over, [],
      `${id} draws outside its own ±${BOX / 2} box: ${over.slice(0, 3).join(' ')}.\n`
      + 'Geometry must stay inside 0..w / 0..d / 0..h — the centring counts the SPEC, not the paint.');
  }
});

test('the hatch is the kit\'s pattern, not a second one drawn from memory', () => {
  const svg = build('locker');
  assert.match(svg, new RegExp(`<pattern id="[^"]+" width="${HATCH.period}" height="${HATCH.period}"`));
  assert.ok(svg.includes(`patternTransform="rotate(${HATCH.angle})"`), 'the hatch angle is the kit\'s');
  assert.ok(svg.includes(`stroke-width="${HATCH.width}" opacity="${HATCH.opacity}"`),
    'the hatch weight/opacity are the kit\'s');
  assert.ok(svg.includes(`fill="${HATCH.ground}"`), 'the hatch ground is the kit\'s');
  // …and a piece with NO side face registers no pattern at all — an unused def in every round
  // fitting is the shape `wrecked.test.js` already treats as a defect.
  for (const round of ['chair', 'stool', 'supply-barrel', 'fuel-drum', 'standing-lamp']) {
    assert.ok(!build(round).includes('<pattern'),
      `${round} registers a hatch it never references`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. RULING E8 — the six defect classes, one representative pin each
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── CLASS 1: corner-to-corner grey braces that read as strike-throughs (01 bench, 06 larder) ──
//
// The catalogue's bench carries `M85.3 196.1 L248.5 211.4` at opacity .4 — a 164-px line across a
// 312-px card — and its larder carries a full-height X (`M139.2 195.6 L224.2 46` and its mirror). In
// this dialect a long diagonal over a piece is the mark for "cancelled", so both read as deletions.
//
// The pin is a LENGTH RULE on diagonal segments, not a count of them: braces are legitimate and the
// fix keeps them, shortened and attached. `storage-crate` is deliberately EXCLUDED and the exclusion
// is stated rather than silent — on a crate a corner-to-corner diagonal is bracing, which is why the
// charter's defect-1 list names 01 and 06 and not 14.
test('E8-1: no brace on the bench or the shelf rack crosses the piece', () => {
  // ⚠️ AGAINST `BOX_EXTENT`, NOT `SIZES`: the segments below are measured in the px the builder
  // EMITS, and `SIZES` is the registry footprint at the catalogue's own px/cm. Dividing a length in
  // one space by a diagonal in another is a ratio about nothing — and it would be a silently
  // permissive one here, since every fitting's footprint is the larger number.
  const LIMIT = 0.25;
  for (const id of ['bench', 'shelf-rack']) {
    const diag = Math.hypot(BOX_EXTENT[id].w, BOX_EXTENT[id].h);
    const long = segments(build(id))
      .map((s) => ({ dx: s.x2 - s.x1, dy: s.y2 - s.y1, s }))
      .filter((v) => Math.min(Math.abs(v.dx), Math.abs(v.dy)) >= 1.5)   // a real diagonal, not an axis
      .filter((v) => Math.hypot(v.dx, v.dy) / diag > LIMIT);
    assert.deepEqual(long.map((v) => `${v.s.x1},${v.s.y1} → ${v.s.x2},${v.s.y2}`), [],
      `${id} carries a diagonal longer than ${LIMIT * 100}% of its own diagonal. That is the\n`
      + 'catalogue\'s strike-through, back. A brace must be SHORT and must meet the members it braces.');
  }
  // NON-VACUITY, as an inclusion test: the rule must catch the catalogue's own geometry, scaled into
  // this box. A filter that excluded everything would agree with a perfect port and with a verbatim
  // one alike.
  const diag = Math.hypot(BOX_EXTENT.bench.w, BOX_EXTENT.bench.h);
  const catalogueBrace = { dx: (248.5 - 85.3) * (BOX_EXTENT.bench.w / 312), dy: (211.4 - 196.1) };
  assert.ok(Math.min(Math.abs(catalogueBrace.dx), Math.abs(catalogueBrace.dy)) >= 1.5
    && Math.hypot(catalogueBrace.dx, catalogueBrace.dy) / diag > LIMIT,
  'the length rule can no longer see the catalogue\'s own bench diagonal — it proves nothing');
});

// ── CLASS 2: full ellipses on cylinders, whose back halves show through (15 butt, 18 drum) ──
//
// The catalogue draws each rolling hoop as `<ellipse … fill="none">`, so the half of the hoop that is
// BEHIND the barrel is painted over the barrel's front. Both pieces read as wire cages.
test('E8-2: a rolling hoop is a front half-arc, and no see-through ellipse survives', () => {
  for (const id of ['supply-barrel', 'fuel-drum']) {
    const svg = build(id);
    const seeThrough = ellipses(svg).filter((e) => /fill="none"/.test(e.tail));
    assert.deepEqual(seeThrough.map((e) => `${e.cx},${e.cy}`), [],
      `${id} draws an unfilled full ellipse. On a cylinder that is a hoop whose BACK half shows\n`
      + 'through the body — the catalogue\'s own defect, ported verbatim.');
    // …and the hoops really are there, as single-arc paths (`M … A …`, no `L`), three of them.
    const hoops = [...svg.matchAll(/ d="M-?[\d.]+ -?[\d.]+ A[^"]*"/g)]
      .map((m) => m[0]).filter((d) => !d.includes('L') && (d.match(/A/g) || []).length === 1);
    assert.equal(hoops.length, 3,
      `${id} has ${hoops.length} half-arc hoops, expected 3. A count that fell to zero means the\n`
      + 'hoops were deleted rather than fixed, which the see-through check above cannot tell apart.');
  }
  // The cylinder BODY still closes with a back arc — that is correct and must not be "fixed" away:
  // it is hidden under the cap, and without it the body is an open shape with no fill.
  assert.ok((build('fuel-drum').match(/A/g) || []).length >= 5,
    'the drum lost its body arcs — a cylinder needs its own bottom and its (hidden) top');
});

// ── CLASS 3: floating / detached members (08, 20, 21, 25, 26, 27, 30) ──
//
// Seven pieces carry parts that begin or end in empty paper: posts that stop 4 cm above the floor, a
// ladder that starts 41 cm up it, a drip line attached at neither end, a crank beside the machine it
// turns, a warning triangle hovering over the rack it warns about. Each is pinned at the point it
// must now reach, through the builder's OWN frame.
test('E8-3: every member that was floating now meets something, at both ends', () => {
  const bunk = build('bunk-bed');
  for (const x of [6.5, 193.5]) {
    for (const y of [6, 58]) hasPoint(bunk, 'bunk-bed', [x, y, 0], 'a bunk post floats above the deck');
  }
  for (const x of [175, 190]) hasPoint(bunk, 'bunk-bed', [x, 1, 0], 'a ladder stile starts in mid-air');

  const rack = build('hydroponics');
  hasPoint(rack, 'hydroponics', [7, 40, 44], 'the drip line does not reach the bottom tray');
  hasPoint(rack, 'hydroponics', [7, 40, 176], 'the drip line does not reach the top tray');
  for (const x of [3, 97]) hasPoint(rack, 'hydroponics', [x, 4, 190], 'a post ends as a stub, uncapped');

  const bin = build('compost-bin');
  hasPoint(bin, 'compost-bin', [56, 30, 52], 'the crank does not start on the bin\'s own boss');

  const lamp = build('standing-lamp');
  hasPoint(lamp, 'standing-lamp', [38, 22, 1], 'the cable does not leave the lamp\'s base');

  const heater = build('space-heater');
  for (const x of [20, 60]) {
    hasPoint(heater, 'space-heater', [x, 25, 110], 'a bracket does not start on the panel');
    hasPoint(heater, 'space-heater', [x, 36, 122], 'a bracket does not reach the wall');
  }

  const cells = build('battery-bank');
  hasPoint(cells, 'battery-bank', [50, 4, 118], 'the hazard mark does not stand on the bus bar');

  const shrine = build('shrine-shelf');
  for (const x of [14, 50]) {
    hasPoint(shrine, 'shrine-shelf', [x, 4, 140], 'a bracket does not meet the shelf');
    hasPoint(shrine, 'shrine-shelf', [x, 30, 116], 'a bracket does not reach the wall');
  }
});

// ⭐⭐ CLASS 3, THE HARD HALF — AND IT IS SEPARATE FROM THE TEST ABOVE ON PURPOSE.
//
// `hasPoint` asks "is this centimetre drawn". Two members shipped in the first port that answered YES
// and were still exactly the defect class 3 names, because WHERE a point lands in this projection is
// not what a coordinate list looks like:
//
//   · the heater's supply pipe ran (8,12,60) → (3,34,60), leaving the panel's LEFT flank and running
//     backwards. A centimetre of depth moves a point 0.4 cm RIGHT, so both ends landed INSIDE the
//     panel's front face and — emitted last — it painted a floating diagonal across the fins;
//   · the shrine shelf's two brackets ran (x,6,139) → (x,29,126), where 23 cm of depth lifts almost
//     exactly as far as 13 cm of drop falls, so each came out horizontal, inside the shelf plate's
//     front face, and was then covered by that plate's opaque PAPER fill. Zero visible pixels.
//
// Both facts were found by RENDERING and deleting the member (`ImageChops.difference(...).getbbox()`
// → None for the brackets; 257 changed px, all of them on the panel, for the pipe) — a picture is
// still the only instrument that sees paint. What is decidable HERE is the geometry that made it
// possible, and that is what these legs pin: a member's projected points against the silhouette of
// the body it is supposed to hang off. Each has the FIRST PORT's own coordinates as an inclusion
// control, so a rule that stopped being able to see them fails instead of agreeing.
test('E8-3b: the two members that hid behind their own piece are OUTSIDE its silhouette', () => {
  const heater = build('space-heater');
  const Fh = frameFor('space-heater');
  const HEATER_WALL = SPECS['space-heater'].d;         // the wall stub's plane IS the box's back face

  // The panel is `bx(…, 8, 0, 40, 60, 70, 25)`, so its right-most ink in the picture is the back edge
  // of its side face — x = 8 + 60 cm at depth 25. Nothing of the pipe may reach left of that.
  const [bodyRight] = Fh.project(8 + 60, 25, 0);
  // ⚠️ ANCHORED ON THE PANEL ATTACHMENT ALONE — the corner the pipe leaves. The far end is
  // deliberately NOT an anchor: anchoring it at the wall made the depth assertion below a
  // tautology (memberThrough already required the point, so `.some()` could never report —
  // found by the revision verifier, mutation-proven). With one anchor, the silhouette loop
  // polices the route and the depth rule genuinely polices the free end.
  const pipe = memberThrough(heater, 'space-heater',
    [[68, 25, 50]], 'the heater\'s supply pipe');
  for (const [px, py] of pipe) {
    assert.ok(px >= bodyRight - 0.05,
      `the heater's supply pipe passes through (${px}, ${py}) — left of the panel's own right edge\n`
      + `at x = ${bodyRight}, i.e. ON the finned face. A pipe drawn over the piece it feeds is the\n`
      + 'catalogue\'s floating hairline again, in the opposite direction.');
  }
  // …and the far end is on the WALL PLANE, asked as a depth so the pipe may be re-drawn at any height.
  assert.ok(pipe.some(([px]) => Math.abs(depthAt(Fh, 69, px) - HEATER_WALL) < 0.05),
    'no end of the heater\'s supply pipe lands on the wall stub\'s plane — it stops in the air\n'
    + 'behind the panel, which is the catalogue\'s "runs off to nowhere" with a different bearing.');

  // INCLUSION CONTROL: the first port's own pipe must FAIL this rule, at both ends.
  const floated = [[8, 12, 60], [3, 34, 60]].map((p) => Fh.project(...p));
  assert.equal(floated.filter(([px]) => px < bodyRight - 0.05).length, 2,
    'the silhouette rule can no longer see the pipe that floated across the fins — it proves nothing');

  const shrine = build('shrine-shelf');
  const Fs = frameFor('shrine-shelf');
  const SHELF_WALL = SPECS['shrine-shelf'].d;
  // The plate is `bx(…, 4, 4, 140, 56, 4, 26)` and its underside RECEDES UPWARD, so the lowest ink
  // the shelf has anywhere is its front-bottom edge. "Visibly below the shelf" is therefore decidable
  // without knowing anything about paint order: a bracket must draw below this y.
  const [, plateBottom] = Fs.project(4, 4, 140);
  for (const x of [14, 50]) {
    // Anchored on the SHELF end alone — the plate's own front-bottom edge, which is a landmark of the
    // piece rather than a number this test would have to re-learn if the bracket were re-angled. The
    // far end is then asked for two things AT ONCE, which is the whole requirement: it must be on the
    // wall's plane, and it must be below the plate's lowest ink. Either alone is satisfiable by the
    // geometry that shipped and could not be seen.
    const bracket = memberThrough(shrine, 'shrine-shelf',
      [[x, 4, 140]], `the shrine shelf's bracket at x = ${x}`);
    assert.ok(bracket.some(([px, py]) => Math.abs(depthAt(Fs, x, px) - SHELF_WALL) < 0.05
      && py > plateBottom + 1),
    `the shrine shelf's bracket at x = ${x} has no end that both reaches the wall plane and draws\n`
      + `below the plate's own bottom edge (y = ${plateBottom}). It is this piece's ONLY support, and\n`
      + 'a bracket inside the plate\'s front face is painted over by that plate\'s opaque paper — the\n'
      + 'shelf then floats on nothing at all, which no assertion about strings can see.');
  }
  // INCLUSION CONTROL: the first port's brackets must FAIL it — every point at or above the edge.
  const covered = [[14, 6, 139], [14, 29, 126]].map((p) => Fs.project(...p));
  assert.ok(covered.every(([, py]) => py <= plateBottom + 1),
    'the below-the-plate rule can no longer see the brackets the plate covered — it proves nothing');
});

// ── CLASS 4: placeholder glyphs standing in for parts (11 tap, 12 dial, 14 handle, 19 plants) ──
//
// ⚠️ THE SINK IS THE ONE THE CHARTER NAMES TWICE, because the same placeholder tap leaks into Screen
// 02 of the game document: a bare vertical stroke with a kinked stub, and a second stroke floating
// beside it where a handle should be.
test('E8-4: the four placeholder parts are drawn parts', () => {
  const sink = build('sink');
  assert.ok(/ d="M[^"]*Q[^"]*"/.test(sink),
    'the sink\'s tap has no curve in it. A gooseneck is the part that makes a tap a tap; two straight\n'
    + 'strokes is the catalogue\'s placeholder.');
  hasPoint(sink, 'sink', [58, 30, 116], 'the spout does not turn down over the basin');
  hasPoint(sink, 'sink', [92, 47, 110], 'the lever is not attached to the riser');

  // THE DIAL: a bezel, a hub, a pointer and four index ticks — asked as GEOMETRY IN THE ANNULUS, so a
  // dial redrawn at a different size still passes and a dial deleted still fails.
  const cooler = build('cooler');
  const F = frameFor('cooler');
  const [dx, dy] = F.project(46, 0, 156);
  const near = points(cooler).filter(([x, y]) => {
    const r = Math.hypot(x - dx, y - dy);
    return r > F.s * 5 && r < F.s * 10;
  });
  assert.ok(near.length >= 8,
    `the cooler's dial has ${near.length} points on its rim, expected at least 8 (four ticks, two\n`
    + 'ends each). An empty ring with a dot in it says nothing about which way the dial is set.');
  hasPoint(cooler, 'cooler', [42, 0, 161], 'the dial has no pointer');

  // THE LID HANDLE: two posts standing on the lid and a bar across them.
  const crate = build('storage-crate');
  for (const x of [21, 39]) {
    hasPoint(crate, 'storage-crate', [x, 22, 45], 'a strap post does not stand on the lid');
    hasPoint(crate, 'storage-crate', [x, 22, 50], 'the strap bar does not meet its posts');
  }

  // THE PLANTS: real sprouts — a curved stem and closed leaves, not three Y marks.
  const planter = build('herb-planter');
  const leaves = [...planter.matchAll(/ d="M[^"]*Q[^"]*Q[^"]* Z"/g)].length;
  assert.ok(leaves >= 8,
    `the planter draws ${leaves} leaves, expected at least 8 (three plants, two or three each).\n`
    + 'A stem with two ticks on it is the catalogue\'s placeholder for a plant.');
  assert.ok((planter.match(/ d="M[^"]*Q[^"]*"/g) || []).length >= 3, 'the stems are not curved');
});

// ── CLASS 5: projection breaks — geometry not in the shared oblique (04 table, 17 duct, 22 bench) ──
//
// These are the ones a length or a count cannot see, so they are asked as RATIOS against
// `oblique.depth()` — the one function the whole dialect's two numbers live in. A member drawn at the
// wrong depth is a member whose offset is not `depth(d, s)`, and that is decidable.
test('E8-5: the three broken members are offsets of oblique.depth(), exactly', () => {
  // THE TABLE. The catalogue's back stretcher sits (+9.5, −12.6) from the front one — a ratio of
  // −1.33 where this oblique's is −1.5. Both stretchers are now the same call at two depths.
  const table = build('dining-table');
  const Ft = frameFor('dining-table');
  const [fx, fy] = Ft.project(13.5, 12, 22);
  const [bx2, by2] = Ft.project(13.5, 68, 22);
  hasPoint(table, 'dining-table', [13.5, 12, 22], 'the near stretcher is gone');
  hasPoint(table, 'dining-table', [13.5, 68, 22], 'the far stretcher is gone');
  const [ddx, ddy] = depth(56, Ft.s);
  assert.equal(nn(bx2 - fx), nn(ddx), 'the two stretchers are not one depth() apart in x');
  assert.equal(nn(by2 - fy), nn(ddy), 'the two stretchers are not one depth() apart in y');

  // THE PEGBOARD. The catalogue draws it at depth 0 — in front of a bench whose top runs 70 cm back,
  // for a board its own caption calls "behind". All four corners are now at depth 70.
  const wb = build('workbench');
  for (const [x, z] of [[6, 92], [174, 92], [174, 166], [6, 166]]) {
    hasPoint(wb, 'workbench', [x, 70, z], 'the pegboard is not on the bench\'s back edge');
  }

  // THE DUCT. The catalogue draws it as one flat rectangle in the picture plane. It is now the kit's
  // three-face extrusion, so its top face recedes by exactly depth(30).
  const duct = build('pipe-run');
  const Fd = frameFor('pipe-run');
  const [ax, ay] = Fd.project(15, 0, 178);
  const [cx2, cy2] = Fd.project(15, 30, 178);
  const [ddx2, ddy2] = depth(30, Fd.s);
  assert.equal(nn(cx2 - ax), nn(ddx2));
  assert.equal(nn(cy2 - ay), nn(ddy2));
  hasPoint(duct, 'pipe-run', [15, 0, 178], 'the duct has no front-top edge');
  hasPoint(duct, 'pipe-run', [15, 30, 178], 'the duct has no receding top face — it is flat again');
});

// ── CLASS 6: wall-hung items with no wall (17 duct, 26 heater, 29 rail, 30 shelf) ──
//
// "HUNG 150" is a number in a caption; a mounting height is a fact about a drawing only if something
// in the drawing is the thing it is mounted to. The stub is hatched like every other cut face and
// carries DASHED outer edges — the room cutaway's own way of saying "this continues past the picture".
test('E8-6: exactly the four hung fittings carry a wall stub, and it reads as a fragment', () => {
  const HUNG = ['pipe-run', 'space-heater', 'curtain-rail', 'shrine-shelf'];
  for (const id of FITTING_IDS) {
    const svg = build(id);
    const cut = (svg.match(/stroke-dasharray="3 2"/g) || []).length;
    if (HUNG.includes(id)) {
      assert.ok(cut >= 1, `${id} hangs on nothing — its wall stub is gone, and the mounting height\n`
        + 'goes back to being a caption');
      // …and the stub is a hatched FACE, not just a dashed outline: a dashed rectangle alone reads
      // as a planned object (the dialect's UNBUILT mark), which is the opposite of "structure".
      assert.match(svg, /fill="url\(#[^)]+\)"[^>]*stroke-dasharray|<path d="M[^"]*Z" fill="url\(#[^)]+\)"/,
        `${id}'s stub has no hatched face`);
    } else {
      assert.equal(cut, 0,
        `${id} carries the cut-edge dash but is not a wall-hung piece. The dash means "this surface\n`
        + 'continues past the drawing"; using it for anything else empties it of meaning.');
    }
  }
  // The stub is a DATUM and must stay one — drawn back, so it cannot become the picture.
  assert.match(build('space-heater'), /fill="url\(#[^)]+\)"[^>]*opacity="0.55"/,
    'the heater\'s wall stub is at full strength: at that weight the wall\'s hatch competes with the\n'
    + 'fitting\'s own hatched side faces and the eye reads two objects instead of one on a wall.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE STANDING RULES OF THE DIALECT
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the stroke ramp stays inside the charter\'s 0.9–2.2, by mass', () => {
  const seen = new Set();
  for (const id of FITTING_IDS) {
    for (const m of build(id).matchAll(/stroke-width="([\d.]+)"/g)) {
      const v = +m[1];
      if (v === HATCH.width) continue;                 // the pattern's own hairline, not a member
      assert.ok(v >= 0.9 && v <= 2.2, `${id} strokes at ${v} — the ramp is 0.9–2.2 (charter §1)`);
      seen.add(v);
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Object.values(W).sort((a, b) => a - b),
    'the set uses a weight that is not one of the five named steps. A ramp with unnamed rungs is a\n'
    + 'ramp nobody can keep, which is how a "heavier" line ends up lighter than a "fine" one.');
});

// ⚠️ THE ROUND-OBJECTS RULE, WHICH IS THE CATALOGUE'S OWN AND IS LOAD-BEARING FOR PLACEMENT: "anything
// round drawn level, so a round fitting has no heading and can be set down any way about". A round
// piece drawn with a heading would need a facing on the wire, and nothing carries one.
test('every round fitting draws level: ry is exactly DEPTH_RATIO·rx, no heading anywhere', () => {
  const round = FITTING_IDS.filter((id) => SPECS[id].round);
  assert.deepEqual(round, ['chair', 'stool', 'supply-barrel', 'fuel-drum', 'vice-post', 'standing-lamp'],
    'the set of round fittings changed — the catalogue marks six');
  for (const id of FITTING_IDS) {
    const svg = build(id);
    // ⚠️ THE PATTERN DEF IS STRIPPED FIRST, and saying so matters: the hatch's own
    // `patternTransform="rotate(45)"` is a 45° HATCH, not a heading, and a bare substring scan reads
    // the two as the same thing — a guard that fires on the fixture it is meant to allow.
    const drawing = svg.replace(/<pattern[\s\S]*?<\/pattern>/g, '');
    assert.ok(!drawing.includes('rotate('), `${id} rotates something — this dialect has no heading`);
    for (const e of ellipses(svg)) {
      assert.equal(nn(e.ry), nn(RY * e.rx),
        `${id}: an ellipse at ${e.cx},${e.cy} has ry/rx = ${(e.ry / e.rx).toFixed(3)}, not ${RY}.\n`
        + `A level circle in this oblique is exactly ${RY} — anything else is a circle drawn by hand.`);
    }
  }
});

test('the SPECS are the catalogue\'s dimensions, and every drawn box says where it grew', () => {
  // The dimension line describes the OBJECT; SPECS describes the PICTURE. Where they differ the spec
  // is bigger (a flue, a tap, a plant, a wall stub) and never smaller — a spec smaller than the
  // object is a piece drawn short.
  const FROM_CATALOGUE = {
    bench: [260, 34, 45], chair: [46, 46, 43], locker: [92, 42, 183], 'dining-table': [180, 80, 75],
    stool: [34, 34, 45], 'shelf-rack': [120, 40, 200], cot: [200, 70, 40], 'bunk-bed': [200, 70, 190],
    footlocker: [90, 45, 45], cooker: [90, 60, 88], sink: [100, 55, 88], cooler: [80, 60, 178],
    desk: [160, 60, 90], 'storage-crate': [60, 45, 45], 'supply-barrel': [70, 70, 120],
    'o2-scrubber': [70, 50, 178], 'fuel-drum': [55, 55, 85], 'herb-planter': [120, 45, 38],
    hydroponics: [100, 45, 190], 'compost-bin': [60, 60, 98], workbench: [180, 70, 92],
    'vice-post': [40, 40, 120], 'research-console': [60, 45, 132], 'battery-bank': [100, 45, 116],
    rug: [120, 80, 0],
  };
  for (const [id, [w, d, h]] of Object.entries(FROM_CATALOGUE)) {
    const s = SPECS[id];
    assert.ok(s.w >= w && s.d >= d && s.h >= h,
      `${id}: the drawn box ${s.w}×${s.d}×${s.h} is smaller than the catalogue's ${w}×${d}×${h}`);
  }
  // The five NOT listed are the wall-hung pieces plus the lamp, whose catalogue lines give a hung
  // height rather than a box; they are checked by their `z0` instead, which must be inside the box.
  for (const id of FITTING_IDS) {
    const s = SPECS[id];
    if (s.z0 == null) continue;
    assert.ok(s.z0 > 0 && s.z0 < s.h, `${id}: z0 ${s.z0} is not inside 0..${s.h}`);
  }
});
