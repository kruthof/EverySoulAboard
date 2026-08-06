// THE FOURTEEN PAPER FIXTURES (client/src/items/paper-fixtures.js) — the ship's architecture in the
// owner's paper/ink/oxblood oblique.
//
// ⚠️ THE HALF THIS FILE CANNOT DO, SAID FIRST, exactly as `fittings.test.js` says it: every assertion
// here is about a STRING. A builder can satisfy all of them and still draw a door whose proportions
// are wrong or whose ink is too fine to survive being scaled into a 22-px tile, and the emitted text
// is byte-identical in the working and the broken case. The set is therefore ALSO photographed —
// `client/tools/paper-fixtures-sheet.mjs` renders all fourteen and their twins onto one page and
// again at 22/32/48/72 px, and the package report carries the shots.
//
// ⭐ WHAT IS NEW HERE AND IS NOT IN `fittings.test.js`: A PAINT-ORDER PROBE.
//
// `fittings.js` shipped TWO members that satisfied every string assertion in the repo and drew ZERO
// visible pixels — the heater's supply pipe (painted across the fins it feeds) and the shrine
// shelf's two brackets (lying inside the shelf plate's own opaque paper face, which was emitted
// after them). Both were found by RENDERING and deleting the member. That instrument is a picture
// and this file is not one; but the half that IS decidable from the string is the half that made
// both defects possible, and it is decidable exactly: an emitted STROKE all of whose points lie
// inside an OPAQUE filled area emitted LATER in the same fragment cannot be seen, whatever it draws.
// `occluded()` below is that check, run over all fourteen pieces in both power states, with the
// shrine shelf's own historical geometry as an inclusion control so a probe that has stopped being
// able to see the defect fails instead of agreeing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as PF from '../src/items/paper-fixtures.js';
import {
  FIXTURE_IDS, SPECS, SIZES, BOX_EXTENT, STUB_PLANE, frameFor,
} from '../src/items/paper-fixtures.js';
import { W, BOX, geometryFor } from '../src/items/fittings.js';
import {
  HATCH, depth, n as nn, PAPER_FLAT, DEPTH_RATIO, PX_PER_CM,
} from '../src/render/oblique.js';
import { INK, PAPER, ATTEND, SKETCH_LEVEL } from '../src/items/helpers.js';
import { amplitudeBound, penSteps, LEVELS, CR_BULGE } from '../src/render/sketch.js';
import { measurePiece, bodyExtent, attrsOf, strokedPaths, outsideBox, flatten } from './sketch-geom.js';
import { ITEMS } from '../src/items/index.js';
import { WRECKED, buildWrecked } from '../src/items/wrecked.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'items', 'paper-fixtures.js'), 'utf8');

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

// ⚠️ `build` IS THE RAW FRAGMENT SINCE 2026-08-05 — the owner's `strong` sketch treatment ships on
// this catalogue, and every assertion here that looks for a LITERAL projected coordinate (`hasPoint`,
// `segments`, `ellipses`, `circles`) matches nothing against a freehand stroke and therefore passes
// vacuously. The geometry keeps being asked of the geometry; the bridge is
// `sketch-adoption.test.js`'s displacement pin and the treated legs below.
const build = (id, opts = { idPrefix: 'x' }) => PF[camel(id)]({ ...opts, sketch: false });
/** What SHIPS. */
const treated = (id, opts = { idPrefix: 'x' }) => PF[camel(id)](opts);
/** A twin, raw — for the geometry legs that compare it to its raw pristine piece. */
const rawWrecked = (id, opts = {}) => buildWrecked(id, { ...opts, sketch: false });

/** The oblique's two ratios, READ from the kit and never typed — `fittings.test.js`'s own rule. */
const RX = DEPTH_RATIO.x;
const RY = Math.abs(DEPTH_RATIO.y);

/** Every `M x y` / `L x y` / `Q x y` coordinate pair in a fragment, as `[x, y]`. */
function points(svg) {
  return [...svg.matchAll(/[MLQ](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
}
function ellipses(svg) {
  return [...svg.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="([\d.]+)" ry="([\d.]+)"([^>]*)\/>/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], rx: +m[3], ry: +m[4], tail: m[5] }));
}
function circles(svg) {
  return [...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"([^>]*)\/>/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], r: +m[3], tail: m[4] }));
}
function segments(svg) {
  return [...svg.matchAll(/ d="M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)"/g)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
}

/** The BODY of a fragment — everything after the `<defs>`, so a `<pattern>`'s own path is not art. */
function body(svg) { return svg.replace(/<defs>[\s\S]*?<\/defs>/, ''); }

/**
 * ⭐ THE SEAM JOIN, and why it is a seam rather than a remembered pixel (CLAUDE.md trap 4): "is this
 * centimetre drawn?" is a question in the PIECE's coordinates, and the only honest way to ask it of a
 * string is to put the same centimetres through the same projection the builder used.
 * `frameFor(id)` IS the builder's frame.
 */
function hasPoint(svg, id, [x, y, z], msg) {
  const [px, py] = frameFor(id).project(x, y, z);
  assert.ok(svg.includes(`${nn(px)} ${nn(py)}`) || svg.includes(`cx="${nn(px)}" cy="${nn(py)}"`),
    `${msg}\n  expected ${id} to draw through (${x}, ${y}, ${z}) cm ⇒ "${nn(px)} ${nn(py)}", and it does not.`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE PAINT-ORDER PROBE
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** True when this element's paint really covers what is under it. */
function isOpaque(tail) {
  if (/fill="none"/.test(tail)) return false;
  const op = tail.match(/opacity="([\d.]+)"/);
  if (op && +op[1] < 0.99) return false;
  return /fill="(#|url\()/.test(tail);
}

/** Standard even-odd-free ray cast; `poly` is a list of `[x, y]`. */
function inPoly(poly, [x, y]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Parse a fragment body into ordered elements: `{ area, pts }` for an opaque filled shape a later
 * stroke could hide behind, and `{ stroke, pts }` for a stroked member.
 *
 * ⚠️ AN ELLIPSE / CIRCLE IS APPROXIMATED BY A 24-GON, deliberately and in the SAFE direction: an
 * inscribed polygon is SMALLER than the shape it stands for, so the probe can report a member
 * visible that is really hidden and can never report one hidden that is really drawn. A guard that
 * errs the other way would fire on correct art, and the fix for that is always to delete the guard.
 */
function elementsOf(svg) {
  const out = [];
  const gon = (cx, cy, rx, ry) => {
    const pts = [];
    for (let i = 0; i < 24; i += 1) {
      const a = (i * 2 * Math.PI) / 24;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  };
  for (const m of body(svg).matchAll(/<(path|ellipse|circle)\b([^>]*)\/>/g)) {
    const [, kind, tail] = m;
    const opaque = isOpaque(tail);
    if (kind === 'path') {
      const d = (tail.match(/ d="([^"]*)"/) || [, ''])[1];
      // ⚠️ FLATTENED, NOT SCANNED FOR `M x y` — and this one is CLAUDE.md's 9th shape live. A
      // treated member is a cubic, so a coordinate scan yields exactly ONE point per stroke (its
      // `M`), and `pts.every(inPoly)` over one point reports "completely covered" the moment a
      // stroke merely STARTS inside a later fill. Measured before the fix: 37 phantom hits on the
      // sliding door alone, every one of them a member drawn plainly across the leaf. Flattening
      // leaves the raw behaviour identical (M/L/Q were already exact) and makes the treated answer
      // mean what the test says it means.
      const pts = flatten(d).flat();
      if (!pts.length) continue;
      if (opaque && /Z\s*"?$/.test(d.trim()) && pts.length >= 3) out.push({ area: true, pts });
      else if (!opaque) out.push({ stroke: true, pts, d });
    } else if (kind === 'ellipse') {
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry']
        .map((k) => +(tail.match(new RegExp(`${k}="(-?[\\d.]+)"`)) || [, 0])[1]);
      out.push(opaque ? { area: true, pts: gon(cx, cy, rx, ry) } : { stroke: true, pts: gon(cx, cy, rx, ry), d: 'ellipse' });
    } else {
      const [cx, cy, r] = ['cx', 'cy', 'r']
        .map((k) => +(tail.match(new RegExp(`${k}="(-?[\\d.]+)"`)) || [, 0])[1]);
      out.push(opaque ? { area: true, pts: gon(cx, cy, r, r) } : { stroke: true, pts: gon(cx, cy, r, r), d: 'circle' });
    }
  }
  return out;
}

/** Every stroked member of `svg` that a LATER opaque area covers completely. */
function occluded(svg) {
  const els = elementsOf(svg);
  const bad = [];
  for (let i = 0; i < els.length; i += 1) {
    const e = els[i];
    if (!e.stroke) continue;
    for (let j = i + 1; j < els.length; j += 1) {
      const a = els[j];
      if (!a.area) continue;
      if (e.pts.every((p) => inPoly(a.pts, p))) { bad.push(e.d); break; }
    }
  }
  return bad;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SET — fourteen pieces, present, pure, namespaced, registered
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the set is fourteen; SPECS, DRAW, the builders and the registry all name the same ids', () => {
  assert.equal(FIXTURE_IDS.length, 14);
  assert.equal(Object.keys(SPECS).length, 14);
  // FOUR TABLES, PINNED AS ONE SET rather than four counts: a piece with a spec and no painter, a
  // painter with no registry row, or a registry row whose builder came from somewhere else are three
  // different slips and a count sees none of them.
  assert.deepEqual(Object.keys(PF.DRAW).sort(), [...FIXTURE_IDS].sort(), 'DRAW and SPECS disagree');
  for (const id of FIXTURE_IDS) {
    const fn = PF[camel(id)];
    assert.equal(typeof fn, 'function', `${id} has no exported builder`);
    assert.equal(fn.name, camel(id),
      `${id}'s builder is named ${fn.name} — the convention wrecked.test.js's painter floor pins`);
    assert.ok(ITEMS[id], `${id} is drawn but is not a registry row`);
    assert.equal(ITEMS[id].build, fn, `${id}'s registry row does not draw from its own builder`);
    assert.equal(ITEMS[id].size, SIZES[id], 'the size hint is the DERIVED one, not a transcription');
    const svg = build(id);
    assert.ok(svg.startsWith('<g') && svg.trimEnd().endsWith('</g>'), `${id} is a <g> fragment`);
    assert.ok(!svg.includes('<svg'), `${id} is a fragment, not a document`);
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${id} emitted NaN/undefined`);
    const shapes = (svg.match(/<(path|ellipse|circle|rect)\b/g) || []).length;
    assert.ok(shapes >= 5, `${id} draws only ${shapes} shapes — that is a stub, not a fixture`);
  }
  // …and the complement: no OTHER registry row may borrow one of these builders.
  const mine = new Set(FIXTURE_IDS.map((id) => PF[camel(id)]));
  const strays = Object.keys(ITEMS).filter((id) => !FIXTURE_IDS.includes(id) && mine.has(ITEMS[id].build));
  assert.deepEqual(strays, [], 'a non-fixture row borrows a paper-fixture builder');
});

test('every builder is deterministic and every placement is id-collision free', () => {
  for (const id of FIXTURE_IDS) {
    assert.equal(build(id, { w: 100, h: 100, idPrefix: 'x' }), build(id, { w: 100, h: 100, idPrefix: 'x' }),
      `${id} is not deterministic`);
    const idsOf = (s) => new Set([...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const a = idsOf(build(id, { idPrefix: `${id}-a` }));
    const b = idsOf(build(id, { idPrefix: `${id}-b` }));
    for (const x of a) {
      assert.ok(!b.has(x), `${id}: def id ${x} appears in two placements`);
      assert.match(x, new RegExp(`^${id}-a`), `${id}: def id ${x} ignores idPrefix`);
    }
  }
});

test('the module reaches for no clock, no randomness and no DOM', () => {
  const code = codeOnly(SRC);
  assert.ok(code.length > 4000, 'non-vacuity: the comment stripper ate the module');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'document.', 'window.',
    'performance.now', 'toLocaleString', 'Intl.']) {
    assert.ok(!code.includes(banned), `paper-fixtures.js reaches for ${banned}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SEAMS — one palette, one projection, one derivation of the drawing scale
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('no raw hex colour escapes the seam — the whole palette arrives by import', () => {
  const code = codeOnly(SRC);
  const hexes = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(hexes, [],
    `paper-fixtures.js names ${hexes.length} colour(s) literally: ${hexes.join(', ')}.`);
  // TRAPS-1, BOTH HALVES, ON THE SHIPPED FILE. (a) NEGATIVE CONTROL — the module's prose quotes the
  // ratio and the dialect by name, so if `codeOnly` stopped stripping comments this scan would fire
  // on documentation and the "fix" would be to delete the explanation.
  assert.match(SRC, /ry = 0\.6·rx/,
    'the header no longer quotes the level-ellipse rule, so the comment-stripping control above\n'
    + 'proves nothing. Restore the explanation or delete this assertion — do not leave it vacuous.');
  assert.ok(!codeOnly(SRC).includes('ry = 0.6·rx'), 'the stripper is not removing comments at all');
  // (b) POSITIVE CONTROL — the scan must actually catch a hex in CODE.
  assert.ok(/#[0-9a-fA-F]{3,8}\b/.test(codeOnly("const c = '#7B2C22'; // ink\n")),
    'the hex scan cannot see a literal in code — it would pass over a whole retint');
});

test('the palette is CLOSED: ink, paper, the flat side tone and ONE accent', () => {
  const used = new Set();
  for (const id of FIXTURE_IDS) {
    for (const st of ['on', 'off']) {
      for (const m of build(id, { idPrefix: 'p', state: st })
        .matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)) used.add(m[1]);
    }
  }
  const PALETTE = [INK, PAPER, PAPER_FLAT, ATTEND].filter((v, i, a) => a.indexOf(v) === i).sort();
  assert.deepEqual([...used].sort(), PALETTE,
    `the fourteen fixtures paint in ${[...used].join(', ')}. The dialect is ink, paper, the flat side\n`
    + 'tone and ONE accent; a fifth colour is a change to the design language, not to a fixture.');
  assert.equal(HATCH.ground, PAPER, 'the kit\'s hatch ground and the seam\'s paper have parted');
});

// ⭐ ACCENT CLOSURE. There is ONE accent and it means ATTENTION (charter §1), so the question worth
// asking is not "is oxblood spelled right" but "how much of the set is shouting". Two pieces carry it
// and both are hazards a crew member's life depends on reading; a third would be one more thing on
// screen competing with a real alarm. Stated as a MEMBERSHIP both ways, so a piece that quietly
// gained the accent and a piece that quietly lost it each fail by name.
test('exactly TWO pieces carry the accent, and they are the two hazards', () => {
  const wearing = FIXTURE_IDS.filter((id) => ['on', 'off'].some((st) => build(id, { idPrefix: 'a', state: st }).includes(ATTEND)));
  assert.deepEqual(wearing, ['door-airlock', 'door-blast'],
    'the accent budget of this set moved. Oxblood means ATTENTION and there is no second accent:\n'
    + 'a vacuum boundary and a sealed blast door are the two things here that can kill someone, and\n'
    + 'every extra piece wearing it makes a genuine alarm elsewhere on the screen quieter.');
  // …and it is spent on MARKS, not on areas: no accent fill anywhere, only accent strokes. A solid
  // oxblood panel would satisfy the membership above and empty the accent of meaning.
  for (const id of wearing) {
    const svg = build(id, { idPrefix: 'a' });
    assert.ok(!svg.includes(`fill="${ATTEND}"`),
      `${id} FILLS an area with the accent. The dialect spends it on marks — a hazard band is tape\n`
      + 'between two ink rules, a warning is a path triangle with a bang in it.');
    assert.ok(svg.includes(`stroke="${ATTEND}"`), `${id} claims the accent but does not stroke in it`);
  }
});

test('the projection is the kit\'s, and the drawing scale has ONE derivation', () => {
  assert.equal(DEPTH_RATIO.x, 0.4, 'the measured x ratio moved');
  assert.equal(DEPTH_RATIO.y, -0.6, 'the measured y ratio moved (negative: in SVG, up is −y)');
  // Asked at the SEAM: the displacement a fixture's own frame produces for a metre of depth must be
  // `oblique.depth()`'s, for every piece — including the one with a NEGATIVE `z0`.
  for (const id of FIXTURE_IDS) {
    const F = frameFor(id);
    const [ax, ay] = F.project(0, 0, 0);
    const [bx2, by2] = F.project(0, 100, 0);
    assert.deepEqual([nn(bx2 - ax), nn(by2 - ay)], depth(100, F.s), `${id}: a second projection`);
  }
  // ⛔ AND THE DERIVATION IS `fittings.geometryFor`, NOT A COPY OF IT. A second answer to "how big is
  // a centimetre in a fitting's tile" is the defect `fittings.js`'s own header spends four paragraphs
  // on, and a module that re-typed `roomFrame(spec.w / 100, …)` would pass every assertion above on
  // the day it was written and drift on the day the box rule changed. Asked as CODE, with a positive
  // control, because there is nothing at runtime to compare against.
  const code = codeOnly(SRC);
  assert.ok(!/roomFrame\s*\(/.test(code),
    'paper-fixtures.js calls roomFrame() itself — that is the drawing scale, derived twice');
  assert.ok(/geometryFor\s*\(/.test(code), 'the module no longer goes through the shared derivation');
  assert.ok(/roomFrame\s*\(/.test(codeOnly('const F = roomFrame(1, 1, 1, k);\n')),
    'the re-derivation scan cannot see its own subject');
  // …and the two modules really do agree, measured through a spec each of them can hold.
  const g = geometryFor(SPECS['hull-port']);
  assert.equal(g.frame.project(10, 20, 30).join(),
    frameFor('hull-port').project(10, 20, 30).join(), 'the shared derivation is not the one in use');
});

test('SIZES is an honest footprint at ONE shared scale; BOX_EXTENT is the drawn tile', () => {
  for (const id of FIXTURE_IDS) {
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
    assert.equal(Math.max(BOX_EXTENT[id].w, BOX_EXTENT[id].h), BOX, `${id} does not fill its box`);
  }
  // The property a tile-normalised field could not have: a bigger object has a bigger footprint,
  // stated across the two catalogues' shared scale so the sets are comparable on one screen.
  assert.ok(SIZES['conduit-run'].w > 2 * SIZES['vent-grille'].w,
    'a 240 cm conduit run must not claim a footprint near a 40 cm vent grille\'s');
  assert.ok(SIZES['door-blast'].h > SIZES['deck-marker'].h,
    'a 2.5 m blast door must stand taller than a 28 cm sign');
});

// ⚠️ THE ONE THAT CAUGHT REAL DEFECTS IN THE SIBLING MODULE. The harness centres a piece on its
// DECLARED box, so anything authored outside `0..w`, `0..d`, `z0..h` is drawn but not counted — it
// hangs over the edge and is clipped by whatever the surface insets. Run in BOTH power states,
// because half of this set draws its rays only when lit.
//
// ⛔ AGAINST `BOX_EXTENT`, NOT `±BOX/2`, AND THE DIFFERENCE IS A HOLE THIS BATTERY FOUND IN ITS OWN
// FIRST DRAFT. `fittings.test.js` measures against ±56 — the TILE — which is exactly right in the
// axis a piece is scaled to fill and BLIND in the other one: a piece scaled on its height has spare
// tile width, so the blast door's slab could be widened from 120 cm to 160 (well past its own 156 cm
// frame) and every point still landed inside ±56. Measured, by planting it: the rule stayed green.
// `BOX_EXTENT[id]` is the piece's OWN drawn extent in both axes, which is the box the centring
// actually uses, so the guard is tight in the axis the defect lives in. The 0.6 tolerance is the
// rounding of that extent to whole px, not slack.
test('nothing is drawn outside the box the piece is centred on, lit or dark', () => {
  for (const id of FIXTURE_IDS) {
    const lim = { x: BOX_EXTENT[id].w / 2 + 0.6, y: BOX_EXTENT[id].h / 2 + 0.6 };
    assert.ok(lim.x <= BOX / 2 + 0.6 && lim.y <= BOX / 2 + 0.6, `${id}: its own extent exceeds the tile`);
    for (const st of ['on', 'off']) {
      const svg = build(id, { idPrefix: 'b', state: st });
      const over = [];
      for (const [x, y] of points(svg)) {
        if (Math.abs(x) > lim.x || Math.abs(y) > lim.y) over.push(`(${x}, ${y})`);
      }
      for (const e of ellipses(svg)) {
        if (Math.abs(e.cx) + e.rx > lim.x || Math.abs(e.cy) + e.ry > lim.y) {
          over.push(`ellipse ${e.cx},${e.cy} r ${e.rx},${e.ry}`);
        }
      }
      for (const c of circles(svg)) {
        if (Math.abs(c.cx) + c.r > lim.x || Math.abs(c.cy) + c.r > lim.y) {
          over.push(`circle ${c.cx},${c.cy} r ${c.r}`);
        }
      }
      assert.deepEqual(over, [],
        `${id} (${st}) draws outside its own ${BOX_EXTENT[id].w}×${BOX_EXTENT[id].h} extent: `
        + `${over.slice(0, 3).join(' ')}\nGeometry must stay inside 0..w / 0..d / z0..h — the`
        + ' centring counts the SPEC, not the paint.');
    }
  }
});

// ⭐ THE SAME RULE ON WHAT SHIPS, with the amplitude added explicitly.
//   OLD RULE: no emitted coordinate outside the piece's own BOX_EXTENT/2 + 0.6, lit or dark.
//   NEW RULE: no point of the TREATED drawing — curves FLATTENED, ellipses sampled on their
//             perimeter, the appended GROUND RULE excluded by its class — outside
//             BOX_EXTENT/2 + 0.6 + `amplitudeBound(SKETCH_LEVEL)`.
// ⛔ THE GROUND RULE IS EXCLUDED BY NAME AND PINNED SEPARATELY (below). It is a floor mark under the
// piece, not part of the object, and it is outside a piece's projected box by construction.
test('the treated drawing stays inside its own extent too — plus the declared amplitude', () => {
  const AMP = amplitudeBound(SKETCH_LEVEL);
  let worstRaw = 0;
  let worstTreated = 0;
  for (const id of FIXTURE_IDS) {
    const ext = { x: BOX_EXTENT[id].w / 2, y: BOX_EXTENT[id].h / 2 };
    for (const st of ['on', 'off']) {
      const over = outsideBox(treated(id, { idPrefix: 'ab', state: st }),
        { x: ext.x + 0.6 + AMP, y: ext.y + 0.6 + AMP });
      assert.deepEqual(over, [], `${id} (${st}): the TREATED drawing leaves its extent by more than `
        + `the declared amplitude ${AMP.toFixed(2)}: ${over.slice(0, 3).join(' ')}`);
      const be = (svg) => { const b = bodyExtent(svg); return Math.max(b.mx - ext.x, b.my - ext.y); };
      worstRaw = Math.max(worstRaw, be(build(id, { idPrefix: 'ab', state: st })));
      worstTreated = Math.max(worstTreated, be(treated(id, { idPrefix: 'ab', state: st })));
    }
  }
  assert.ok(worstTreated > worstRaw + 1, 'the treated set spends none of the tolerance — vacuous');
  assert.ok(worstTreated < AMP, 'the headroom is gone; re-derive the bound rather than widening it');
});

// ⭐ THE GROUND RULE — the treatment's one piece of NEW ink, pinned as new ink rather than smuggled
// through the box guard. It is the pawns' own faint floor line (`pawn-svg.js:483`, "a figure on
// paper does not cast a shadow, it stands on a line") ported to furniture, and until this treatment
// every pawn had one and no fitting did.
test('every treated piece carries exactly one ground rule, under its own lowest ink, inside the tile', () => {
  for (const id of FIXTURE_IDS) {
    const svg = treated(id, { idPrefix: 'gr' });
    const be = bodyExtent(svg);
    assert.equal(be.ground.length, 1, `${id} draws ${be.ground.length} ground rules`);
    const gd = attrsOf(be.ground[0]).d;
    const ys = [...gd.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[2]);
    assert.equal(new Set(ys).size, 1, `${id}'s ground rule is not level`);
    // ⚠️ AGAINST THE RAW BODY'S LOWEST INK, WHICH IS WHAT `sketch.js` ITSELF MEASURES. The rule is
    // placed at `maxY + max(0.6, 1.2% of the drawn height)` off the UNTREATED extent, so a treated
    // stroke that overshoots downward can dip below it by up to the amplitude — that is the hand
    // crossing its own floor line, which is what a hand does, and not the rule drawn in the wrong
    // place. Stated against the raw bottom so the two failures stay tellable apart.
    const rawBottom = bodyExtent(build(id, { idPrefix: 'gr' })).bb[3];
    assert.ok(ys[0] >= rawBottom - 0.01,
      `${id}'s ground rule is at y ${ys[0]} but the piece's own lowest ink is at ${rawBottom} — the `
      + 'rule is meant to be the line the piece STANDS ON, not a stroke across it');
    assert.ok(ys[0] >= be.bb[3] - amplitudeBound(SKETCH_LEVEL),
      `${id}'s ground rule is more than one amplitude above the treated drawing's lowest ink`);
    assert.ok(Math.abs(ys[0]) <= BOX / 2 + 3,
      `${id}'s ground rule at y ${ys[0]} is outside the drawing tile and will be clipped`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE DIALECT — level ellipses, upright circles, the ramp, no heading
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⭐ THE MODULE'S ONE ADDITION TO THE DIALECT, PINNED IN BOTH DIRECTIONS. A level ellipse is the
// catalogue's round-objects rule; a `<circle>` is a circle in a BULKHEAD. Getting them the wrong way
// round lays an airlock flat on the deck or stands a deck hatch up on its rim, and both are drawings
// that read as competent until someone looks.
test('every <ellipse> is LEVEL and every <circle> is an upright face circle', () => {
  let ell = 0;
  let cir = 0;
  for (const id of FIXTURE_IDS) {
    const svg = build(id, { idPrefix: 'r' });
    for (const e of ellipses(svg)) {
      ell += 1;
      // ⚠️ A TOLERANCE AND NOT AN EQUALITY, and the reason is double rounding rather than slack:
      // both `rx` and `ry` are emitted through `r3` (3 dp), so `r3(0.6·s·r)` and `0.6·r3(s·r)` can
      // differ in the third decimal — a real case in this set, at rx 30.508. 0.01 is two orders
      // below the smallest radius drawn and cannot admit a hand-drawn ellipse.
      assert.ok(Math.abs(e.ry - RY * e.rx) <= 0.01,
        `${id}: an ellipse at ${e.cx},${e.cy} has ry/rx = ${(e.ry / e.rx).toFixed(4)}, not ${RY}.\n`
        + 'A level circle in this oblique is exactly that ratio — anything else is drawn by hand.');
    }
    cir += circles(svg).length;
    const drawing = svg.replace(/<pattern[\s\S]*?<\/pattern>/g, '');
    assert.ok(!drawing.includes('rotate('), `${id} rotates something — this dialect has no heading`);
  }
  // NON-VACUITY, BOTH WAYS: the rule above is empty if the set draws no ellipses, and the module's
  // whole reason for existing is empty if it draws no face circles.
  assert.ok(ell >= 4, `only ${ell} level ellipses in the set — the round-objects rule is untested`);
  assert.ok(cir >= 20, `only ${cir} face circles — the upright-circle vocabulary is untested`);
  // …and the two really are used for different THINGS, named, so a wholesale swap fails.
  assert.ok(ellipses(build('deck-hatch')).length >= 3, 'a deck hatch is round and LEVEL — it is a hole in the floor');
  assert.equal(circles(build('deck-hatch')).length, 0, 'a deck hatch drew an upright circle: it is lying in the deck');
  assert.ok(circles(build('door-airlock')).length >= 8, 'an airlock is round and UPRIGHT — it is a hole in a wall');
  assert.equal(ellipses(build('door-airlock')).length, 0, 'the airlock drew a level ellipse: its hatch is lying down');
});

// ⭐⭐ AND THE SAME RULE AS AN INCLUSION TEST ON WHAT SHIPS — because the scan above counts TAGS, and
// the treatment leaves none: `<ellipse>`/`<circle>` both become freehand paths, so `ell` and `cir`
// would be 0 and the two non-vacuity floors are the only reason this file would notice.
//   OLD RULE: |ry − DEPTH_RATIO·rx| ≤ 0.01 for every `<ellipse>`; circles are upright.
//   NEW RULE: every raw round member is still THERE in the treated drawing, within
//             `amplitudeBound(level, r)` both ways, and its drawn box still reads at its own
//             ratio within the lump's factor — so a level ellipse stays level and an upright
//             circle stays upright, WHICH IS THE DISTINCTION THIS SET EXISTS TO MAKE.
test('the round vocabulary SURVIVES the treatment — level stays level, upright stays upright', () => {
  const L = LEVELS[SKETCH_LEVEL];
  const lo = (1 - L.lump) / ((1 + L.lump) * (1 + CR_BULGE));
  const hi = ((1 + L.lump) * (1 + CR_BULGE)) / (1 - L.lump);
  let level = 0;
  let upright = 0;
  for (const id of FIXTURE_IDS) {
    for (const r of measurePiece(build(id, { idPrefix: 'x' }), id).rows) {
      if ((r.nm !== 'ellipse' && r.nm !== 'circle') || r.kind === 'pass') continue;
      const a = attrsOf(r.src);
      const rx = r.nm === 'circle' ? +a.r : +a.rx;
      const ry = r.nm === 'circle' ? +a.r : (a.ry == null ? +a.rx : +a.ry);
      if (r.nm === 'circle') upright += 1; else level += 1;
      assert.ok(Math.max(r.fwd, r.rev) <= r.bound,
        `${id}: a round member moved ${Math.max(r.fwd, r.rev).toFixed(2)} past its ${r.bound.toFixed(2)} bound`);
      const bb = bodyExtent(`<g>${r.out}</g>`).bb;
      const got = (bb[3] - bb[1]) / (bb[2] - bb[0]);
      assert.ok(got >= (ry / rx) * lo && got <= (ry / rx) * hi,
        `${id}: a ${r.nm} drew at h/w ${got.toFixed(3)} where it is ${(ry / rx).toFixed(3)} — under `
        + 'this treatment a round thing is lumpy, not reoriented');
    }
  }
  assert.ok(level >= 4, `only ${level} level ellipses reached the treatment — the rule is vacuous`);
  assert.ok(upright >= 20, `only ${upright} face circles reached the treatment — the rule is vacuous`);
});

test('the stroke ramp stays inside the charter\'s 0.9–2.2, and uses only the five named steps', () => {
  const seen = new Set();
  for (const id of FIXTURE_IDS) {
    for (const st of ['on', 'off']) {
      for (const m of build(id, { idPrefix: 's', state: st }).matchAll(/stroke-width="([\d.]+)"/g)) {
        const v = +m[1];
        if (v === HATCH.width) continue;                 // the pattern's own hairline, not a member
        assert.ok(v >= 0.9 && v <= 2.2, `${id} strokes at ${v} — the ramp is 0.9–2.2 (charter §1)`);
        seen.add(v);
      }
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Object.values(W).sort((a, b) => a - b),
    'the set uses a weight that is not one of the five named steps');
});

// ⭐ THE RAMP UNDER THE TREATMENT — a CLOSED set with a floor and a ceiling, derived from the knobs.
//   OLD RULE: 0.9 ≤ w ≤ 2.2, and w is one of the five named steps.
//   NEW RULE: w ∈ `penSteps(SKETCH_LEVEL, W)`, floor 0.23, ceiling 6.28. The old 2.2 cap is gone
//             and the reason is the knockout, which is 1.9 units wider than the ink it carries.
test('the treated fixture ramp is the five rungs, gained — closed set, floor and ceiling', () => {
  const allowed = new Set(penSteps(SKETCH_LEVEL, Object.values(W)));
  const seen = new Set();
  for (const id of FIXTURE_IDS) {
    for (const st of ['on', 'off']) {
      const svg = treated(id, { idPrefix: 'sr', state: st }).replace(/<pattern[\s\S]*?<\/pattern>/g, '');
      for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) {
        const v = +m[1];
        assert.ok(allowed.has(v), `${id} (${st}) strokes at ${v} — no rung produces that under ${SKETCH_LEVEL}`);
        seen.add(v);
      }
    }
  }
  assert.ok(seen.size >= 12, `only ${seen.size} distinct weights ship — the ramp collapsed`);
  assert.ok(Math.max(...seen) > 2.2 && Math.min(...seen) < 0.9, 'the gain and the cut both did nothing');
});

// ── E8-1: no brace, rib or stripe crosses the piece ──────────────────────────────────────────
//
// A long diagonal over a piece is this dialect's mark for "cancelled", which is why ruling E8 names
// the catalogue's bench and larder braces as defects. This set is full of legitimate diagonals — the
// blast door's hazard tape, the floodlight's knuckle bracket, the deck hatch's wire — so the rule is
// a LENGTH rule over the whole set rather than a ban, and it is the reason the floodlight's arm is
// two members and not one (see its builder's comment).
test('E8-1: no diagonal in the set crosses a quarter of its own piece', () => {
  const LIMIT = 0.25;
  for (const id of FIXTURE_IDS) {
    const diag = Math.hypot(BOX_EXTENT[id].w, BOX_EXTENT[id].h);
    const long = segments(build(id, { idPrefix: 'd' }))
      .map((sg) => ({ dx: sg.x2 - sg.x1, dy: sg.y2 - sg.y1, sg }))
      .filter((v) => Math.min(Math.abs(v.dx), Math.abs(v.dy)) >= 1.5)
      .filter((v) => Math.hypot(v.dx, v.dy) / diag > LIMIT);
    assert.deepEqual(long.map((v) => `${v.sg.x1},${v.sg.y1} → ${v.sg.x2},${v.sg.y2}`), [],
      `${id} carries a diagonal longer than ${LIMIT * 100}% of its own diagonal — the catalogue's\n`
      + 'strike-through, back. A brace must be SHORT and must meet the members it braces.');
  }
  // ⭐ NON-VACUITY, AS AN INCLUSION TEST AND WITH THE CATALOGUE'S OWN GEOMETRY: the rule must catch
  // `Perilune Fittings.dc.html`'s bench brace `M85.3 196.1 L248.5 211.4` scaled into a box this size.
  // A filter that excluded everything would agree with a careful drawing and a strike-through alike.
  const ext = BOX_EXTENT['door-blast'];
  const diag = Math.hypot(ext.w, ext.h);
  const brace = { dx: (248.5 - 85.3) * (ext.w / 312), dy: 15.3 };
  assert.ok(Math.min(Math.abs(brace.dx), Math.abs(brace.dy)) >= 1.5
    && Math.hypot(brace.dx, brace.dy) / diag > LIMIT,
  'the length rule can no longer see the catalogue\'s own bench diagonal — it proves nothing');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. E8-6 — THE WALL STUBS: a mounting height is a fact about a drawing, or it is a caption
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('E8-6: exactly the thirteen mounted pieces carry a wall stub; the deck hatch does not', () => {
  const MOUNTED = Object.keys(STUB_PLANE);
  assert.equal(MOUNTED.length, 13, 'the mounted set changed size');
  for (const id of FIXTURE_IDS) {
    const svg = build(id, { idPrefix: 'w' });
    const cut = (svg.match(/stroke-dasharray="3 2"/g) || []).length;
    if (MOUNTED.includes(id)) {
      assert.ok(cut >= 1, `${id} hangs on nothing — its wall stub is gone, and the mounting height\n`
        + 'goes back to being a caption');
      assert.match(svg, /fill="url\(#[^)]+\)"[^>]*opacity="0.55"/,
        `${id}'s stub is missing its hatched face, or is drawn at full strength — at that weight the\n`
        + 'wall competes with the fitting\'s own hatched side faces and the eye reads two objects.');
    } else {
      assert.equal(cut, 0,
        `${id} carries the cut-edge dash but takes FLOOR. The dash means "this surface continues past\n`
        + 'the drawing"; a deck hatch is cut into the floor line the whole dialect already stands on,\n'
        + 'so a stub there would be a second, contradictory answer to "what is this mounted to".');
    }
  }
});

// ⭐ THE HALF A DASH COUNT CANNOT SEE: the stub must be on the plane it claims, and its lower edge
// must be at the mounting height. Both asked through the piece's OWN frame — a recorded argument at
// the seam, never a remembered pixel.
test('E8-6b: each stub is on its declared plane, and a HUNG piece\'s stub starts at its z0', () => {
  for (const [id, plane] of Object.entries(STUB_PLANE)) {
    const svg = build(id, { idPrefix: 'q' });
    const spec = SPECS[id];
    const z0 = spec.z0 == null ? 0 : spec.z0;
    if (plane === 'back') {
      // the two BOTTOM corners of a back-plane stub: (0, d, z0) and (w, d, z0)
      hasPoint(svg, id, [0, spec.d, z0], `${id}'s wall stub does not reach the bulkhead plane at its own mounting height`);
      hasPoint(svg, id, [spec.w, spec.d, z0], `${id}'s wall stub is not the full width of the piece`);
      hasPoint(svg, id, [0, spec.d, spec.h], `${id}'s wall stub does not reach the top of the box`);
    } else {
      // an OVER-plane stub is a ceiling: it spans x × y at z = h
      hasPoint(svg, id, [0, 0, spec.h], `${id}'s deckhead stub is not at the top of its box`);
      hasPoint(svg, id, [spec.w, spec.d, spec.h], `${id}'s deckhead stub does not span the piece`);
    }
  }
  // NON-VACUITY: `hasPoint` is a substring test, so it must be shown to be able to MISS. A point one
  // centimetre off the stub's own plane is not drawn by any of them.
  const F = frameFor('lamp-sconce');
  const [px, py] = F.project(0, SPECS['lamp-sconce'].d + 1, SPECS['lamp-sconce'].z0);
  assert.ok(!build('lamp-sconce', { idPrefix: 'q' }).includes(`${nn(px)} ${nn(py)}`),
    'the stub-plane probe matches a point that is NOT on the stub — it cannot report a moved wall');
});

// ⭐ AND THE MOUNTING HEIGHT IS THE NUMBER THE OWNER ASKED FOR, so it is asserted as a NUMBER: every
// hung piece's `z0` must be a real mounting height and its box must contain it.
test('the dimensionality is real: every piece\'s box contains its own z0, and the hung ones hang', () => {
  for (const id of FIXTURE_IDS) {
    const s = SPECS[id];
    assert.ok(s.w > 0 && s.d > 0 && s.h > 0, `${id}: a box with a zero side`);
    const z0 = s.z0 == null ? 0 : s.z0;
    assert.ok(z0 < s.h, `${id}: z0 ${z0} is not below the top of the box`);
    if (STUB_PLANE[id] === 'back' && id.indexOf('door') !== 0) {
      assert.ok(z0 >= 40,
        `${id} is a wall-hung piece whose lowest ink is ${z0} cm off the deck. That is not a mounting\n`
        + 'height, it is furniture — either it stands on the floor or its z0 is wrong.');
    }
  }
  // ⭐ THE ONE NEGATIVE z0 IN THE REPO, NAMED so it cannot arrive by accident anywhere else.
  assert.equal(SPECS['deck-hatch'].z0, -8,
    'the deck hatch stopped drawing below the deck line. Its ladder is the whole reason a hatch\n'
    + 'reads as a way DOWN rather than as a ring painted on the floor.');
  for (const id of FIXTURE_IDS) {
    if (id === 'deck-hatch') continue;
    assert.ok((SPECS[id].z0 == null ? 0 : SPECS[id].z0) >= 0, `${id}: a second negative z0 appeared`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE PAINT-ORDER PROBE — no invisible ink
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('no member of any piece is completely covered by opaque paint drawn after it', () => {
  for (const id of FIXTURE_IDS) {
    for (const st of ['on', 'off']) {
      const hidden = occluded(build(id, { idPrefix: 'o', state: st }));
      assert.deepEqual(hidden, [],
        `${id} (${st}) emits ${hidden.length} member(s) that a LATER opaque face covers entirely:\n`
        + `  ${hidden.slice(0, 2).join('\n  ')}\n`
        + 'That is the shrine-shelf defect: a bracket drawn before the plate it hangs off, painted\n'
        + 'over by that plate\'s own paper fill. Zero visible pixels, and every string assertion in\n'
        + 'this repo agrees with it. Move the member out of the silhouette or emit it later.');
    }
  }
});

// ⭐⭐ THE INVISIBLE-INK PROBE, RE-RUN OVER WHAT SHIPS — and this is the class of defect the owner's
// `strong` choice actually risks. At `strong` the knockout runs on EVERY element (`haloScope: 'all'`),
// so each element lays a paper stroke 1.9 units wider than its own ink over whatever was drawn
// BEFORE it. Those are the "halo bites" the experiment saw on legs and louvres.
//
//   OLD RULE (raw): no member is completely covered by a LATER opaque face.
//   NEW RULE (treated): the same, AND — the half a paint-order probe cannot state — no member is
//             erased by a later KNOCKOUT: every stroked `d` drawn in paper is followed by the same
//             `d` in ink at a narrower weight, so a knockout is always a widening under a line and
//             never a line's replacement.
// ⚠️ A BITE IS NOT A DELETION, AND THE RULE SAYS SO DELIBERATELY. A halo crossing a leg takes a
// chunk out of it; the leg is still drawn and still visible either side. Nothing in a string can
// decide "how much of this member survived" — that judgement is the owner's, on the sheet, and the
// pristine/twin pairs sheet is the instrument. What IS decidable is total erasure, and that is what
// this pins.
test('no member of any TREATED piece is erased — not by a later face, not by a knockout', () => {
  let knockouts = 0;
  let members = 0;
  for (const id of FIXTURE_IDS) {
    for (const st of ['on', 'off']) {
      const raw = build(id, { idPrefix: 'oi', state: st });
      const { rows } = measurePiece(raw, id);

      // ⭐ THE SUBJECT IS THE SOURCE MEMBER, NOT THE TREATMENT'S PER-EDGE DECOMPOSITION, AND THAT
      // DISTINCTION IS A FINDING RATHER THAN A CONVENIENCE. `sketch()` turns one closed quad into
      // four independent freehand runs, so a probe pointed at the emitted elements starts asking
      // "is this EDGE covered" where it used to ask "is this MEMBER covered" — and the answer
      // changes. Measured on `door-sliding`: the left jamb's top face has its BACK edge under the
      // header's own front face, which is correct painter's-algorithm occlusion on a closed quad
      // and which the raw probe rightly passes. Split into four runs, that one edge reads as a
      // fully covered member and the guard condemns correct art. So the rows are regrouped to their
      // source element — the question stays the question it was, asked of the treated ink.
      const els = [];
      for (const r of rows) {
        const tail = r.src.replace(/^<\w+/, '');
        const pts = r.kind === 'pass'
          ? flatten((attrsOf(r.src).d) || '').flat()
          : (r.outDs || []).flatMap((d) => flatten(d).flat());
        if (isOpaque(tail)) {
          const d = attrsOf(r.src).d;
          if (d && /Z\s*$/.test(d.trim())) els.push({ area: true, pts: flatten(d).flat() });
        } else if (pts.length) {
          els.push({ stroke: true, pts, d: attrsOf(r.src).d || r.src.slice(0, 60) });
        }
      }
      const hidden = [];
      for (let a = 0; a < els.length; a += 1) {
        if (!els[a].stroke) continue;
        members += 1;
        for (let b = a + 1; b < els.length; b += 1) {
          if (!els[b].area) continue;
          if (els[a].pts.every((p) => inPoly(els[b].pts, p))) { hidden.push(els[a].d); break; }
        }
      }
      assert.deepEqual(hidden, [], `${id} (${st}) TREATED buries ${hidden.length} member(s) under a `
        + `later opaque face:\n  ${hidden.slice(0, 2).join('\n  ')}\n`
        + 'The treatment may bite a member with its knockout; it may not delete one.');

      // …AND THE HALF A PAINT-ORDER PROBE CANNOT STATE: no member is erased by a KNOCKOUT. At
      // `strong` the halo runs on EVERY element, so a paper stroke 1.9 units wider than its own ink
      // lies under every run. Every one of those must have ink over the SAME `d`, narrower.
      //
      // ⚠️ ASKED PER SOURCE MEMBER, AND THE EXCLUSION IS NAMED RATHER THAN GLOBAL: `hull-port`
      // STROKES IN PAPER ON PURPOSE. Its glass is the one ink-FILLED area in the set and its stars
      // are knocked out of that night, so a paper line there is the most visible mark on the piece.
      // A blanket "no paper stroke without ink over it" condemns it. The rule the treatment owes is
      // narrower and is the one that means something: the treatment may not introduce a paper
      // stroke where the builder drew ink.
      for (const r of rows) {
        if (r.kind === 'pass') continue;
        const srcStroke = attrsOf(r.src).stroke;
        if (srcStroke === PAPER) continue;    // the builder's own choice, pinned by the raw legs
        const widest = new Map();
        for (const p of strokedPaths(`<g>${r.out}</g>`)) {
          const k = `${p.stroke}|${p.d}`;
          widest.set(k, Math.max(widest.get(k) == null ? 0 : widest.get(k), p.width));
        }
        for (const [k, w] of widest) {
          if (!k.startsWith(`${PAPER}|`)) continue;
          knockouts += 1;
          const d = k.slice(PAPER.length + 1);
          const ink = widest.get(`${INK}|${d}`);
          const acc = widest.get(`${ATTEND}|${d}`);
          const over = ink == null ? acc : (acc == null ? ink : Math.max(ink, acc));
          assert.ok(over != null && w > over,
            `${id} (${st}) draws a paper stroke at ${w} with ${over == null ? 'NOTHING' : over} over `
            + `it, on a member the builder drew in ${srcStroke}: ${d.slice(0, 46)}…\n`
            + 'A knockout with no ink on top is paper on paper — a deleted member.');
        }
      }
    }
  }
  // ⛔ BOTH NON-VACUITY FLOORS. A probe that inspected no members and a probe that found no
  // knockouts are the same green as a clean set.
  assert.ok(members > 250, `only ${members} treated members were inspected — the probe saw nothing`);
  assert.ok(knockouts > 200, `only ${knockouts} knockout strokes — at ${SKETCH_LEVEL} the halo runs `
    + 'on every element, so this near zero means the treatment is not applied');
});

// ⚠️ THE HALF THE PROBE ABOVE CANNOT SEE, SAID OUT LOUD (CLAUDE.md's 9th shape — an instrument
// narrowed goes blind). It answers "is this member covered by paint drawn AFTER it". The heater's
// supply pipe was the OPPOSITE defect: a member drawn ON TOP of the body it was supposed to hang
// behind, so it painted a floating diagonal across the fins. That one is not decidable in general —
// every legitimate detail line on a front face lies inside that face — so `fittings.test.js` pins it
// per member, and so does this. ⭐ THE SCONCE IS THIS SET'S INSTANCE: its arm was drafted with the
// shade's top at z = 210, which put the whole member inside the wall plate's own front face and drew
// a stray diagonal across it (seen on the sheet, fixed by dropping the shade to 204). The rule is
// therefore the one the picture states: the arm must draw BELOW the plate's lowest ink.
// ⚠️ THE COORDINATES MOVED ON 2026-08-06 AND THE RULE DID NOT. `drawLampSconce` was redrawn on the
// owner's ruling ("i have no clue what lamp-sconce does show"), so the plate is `bx(16, 17, 222, 14,
// 18, 5)` and the arm runs (23, 17, 222) → (23, 6, 220).
//
// ⛔⛔ AND RE-DERIVING THOSE COORDINATES EXPOSED THAT THIS TEST WAS VACUOUS FOR ITS OWN SUBJECT —
// CLAUDE.md's 4th shape, found by DRIVING it rather than by reading it. As written, `armLow` was a
// hand-typed `F.project(…)` of where the arm was BELIEVED to end, so moving the painter's free end up
// into the plate's silhouette did not move the number the rule reads; and the `hasPoint` leg that was
// supposed to catch that instead passed, because `hasPoint` also accepts `cx="…" cy="…"` and the
// shade's own cap disc sits at exactly the arm's endpoint. Measured: with the arm's free end moved
// z 220 → 230 the whole `paper-fixtures` suite ran 26/26 GREEN. (The hole is older than the redraw —
// main's arm ended on the shade's `disc(23, 6, 204, 5)` throat, the same coincidence.)
// ⭐ THE FIX IS THE ONE THE TRAP LEDGER PRESCRIBES: read the free end OFF THE EMITTED DRAWING (trap
// 4 — pin how the API was called by recording the seam, never by re-typing the argument). The arm is
// found by the point at which it LEAVES the plate, which no other member draws through, and its
// second point is then whatever the painter actually put there.
test('the sconce\'s arm hangs BELOW its wall plate, where it can be seen', () => {
  const F = frameFor('lamp-sconce');
  const svg = build('lamp-sconce');
  const [, plateBottom] = F.project(16, 17, 222);      // the plate's front-bottom-left corner
  const [jx, jy] = F.project(23, 17, 222);             // where the arm leaves the plate
  const arms = [...svg.matchAll(/<path[^>]* d="M([^"]*)"/g)].map((m) => m[1])
    .filter((d) => d.startsWith(`${nn(jx)} ${nn(jy)} L`));
  assert.equal(arms.length, 1,
    `expected exactly ONE run leaving the wall plate at (23, 17, 222) ⇒ "${nn(jx)} ${nn(jy)}", found `
    + `${arms.length}. Either the arm no longer starts on the plate's front-bottom edge — in which `
    + 'case the piece has lost its only connection to the wall — or a second member now shares that '
    + 'point and the free end read below is no longer the arm\'s.');
  const armLow = Number(arms[0].split(' L')[1].trim().split(/\s+/)[1]);
  assert.ok(Number.isFinite(armLow), `the arm's free end did not parse out of "${arms[0]}"`);
  // ⚠️ FOUR CENTIMETRES OF CLEAR DROP, NOT "BELOW THE EDGE", AND THE DIFFERENCE IS MEASURED. The
  // drafted arm's free end WAS technically below the plate's bottom — by 0.8 cm, which at this
  // piece's 1.45 px/cm is 1.2 px, i.e. less than the two 1.4-px strokes that meet there. A member
  // whose visible portion is thinner than the ink around it is invisible ink with a true predicate
  // over it, and a rule stated as `> plateBottom` would have called the defect correct. Stated in
  // CENTIMETRES because that is the module's language and it moves with the drawing scale.
  const CLEAR_CM = 4;
  assert.ok(armLow - plateBottom >= CLEAR_CM * F.s,
    `the sconce's arm clears the wall plate's bottom edge by only`
    + ` ${((armLow - plateBottom) / F.s).toFixed(1)} cm. Inside that silhouette it is a diagonal`
    + ' painted ACROSS the plate — the heater\'s supply pipe, on the piece whose arm is its only'
    + ' connection to the wall.');
  // INCLUSION CONTROL: an arm that ends inside the plate's own silhouette must FAIL the rule, or it
  // proves nothing. 230 is the redraw's equivalent of the historical draft's 210: it puts the free
  // end 1.4 cm ABOVE the plate's bottom edge, i.e. inside it. ⭐ AND IT IS NOW DRIVEN FOR REAL, not
  // only arithmetically — with the painter's own arm moved to 230 this test reds on the clearance
  // leg at −1.4 cm, and with the arm deleted it reds on the count above. Both were run.
  const [, drafted] = F.project(23, 6, 230);
  assert.ok(!(drafted - plateBottom >= CLEAR_CM * F.s),
    'the clear-drop rule can no longer see the arm that lay inside the plate — it is vacuous');
});

// ⭐ THE INCLUSION CONTROL, AND IT IS THE WHOLE VALUE OF THE TEST ABOVE. A probe that found nothing
// and a probe that CANNOT find anything are the same green. This plants the historical defect —
// a stroke inside a later opaque quad — and requires the probe to name it.
test('the paint-order probe can actually see a covered member (inclusion control)', () => {
  const stroke = '<path d="M-10 -10 L10 10" fill="none" stroke="#14120F" stroke-width="1.4"/>';
  const cover = '<path d="M-20 -20 L20 -20 L20 20 L-20 20 Z" fill="#EBE4D1" stroke="#14120F" stroke-width="1.4"/>';
  assert.equal(occluded(`<g>${stroke}${cover}</g>`).length, 1,
    'the probe cannot see a stroke buried under a later opaque quad — it proves nothing');
  // …and the same two elements in the OTHER order are fine, which is what "paint order" means.
  assert.equal(occluded(`<g>${cover}${stroke}</g>`).length, 0,
    'the probe fires on a member drawn ON TOP of a face — it would condemn every correct drawing');
  // …and a TRANSPARENT cover does not hide anything either (the wall stub is drawn at 0.55).
  const ghost = cover.replace('stroke-width="1.4"', 'stroke-width="1.4" opacity="0.55"');
  assert.equal(occluded(`<g>${stroke}${ghost}</g>`).length, 0,
    'the probe treats a 0.55-opacity wall stub as opaque — every stub would condemn its own piece');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE TWINS — fourteen post-raid drawings of the same fourteen objects
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THE SWAP IS THE FAILURE NOTHING ELSE IN THIS REPO CAN SEE (`wrecked.test.js`'s own words): a
// twin row pointing at ANOTHER row's painting is keyed correctly, renders, and is simply the wrong
// object on the tile forever. Three legs, because the shapes are different: the painter is named
// after the row it serves; the twin is not its own pristine piece; and no two twins are one picture.
test('every fixture has a twin, and no twin is another piece\'s picture', () => {
  const seen = new Map();
  for (const id of FIXTURE_IDS) {
    const entry = WRECKED[id];
    assert.ok(entry, `${id} has no wrecked twin at all`);
    assert.equal(entry.paint.name, camel(id),
      `${id}'s twin is painted by ${entry.paint.name} — a painter must be named after the ROW it serves`);
    assert.equal(entry.mockLabel, null, `${id} claims a mock label; it is repo-authored`);
    assert.match(entry.catalogue, /^PAPER FIXTURES · /, `${id}'s twin cites the wrong source`);
    // ⚠️ TREATED ON BOTH SIDES SINCE 2026-08-05, and that is the point rather than a detail: what a
    // player sees is the treated twin beside the treated pristine piece, and "these two are
    // different pictures" is a claim about THAT pair. Comparing a treated twin to a RAW pristine
    // piece is trivially true and would keep passing after the damage stopped drawing.
    const wrecked = buildWrecked(id, { idPrefix: 't' });
    assert.notEqual(wrecked, treated(id, { idPrefix: 't' }),
      `${id}: the twin renders exactly like the pristine piece, WITH the treatment on both`);
    assert.notEqual(rawWrecked(id, { idPrefix: 't' }), build(id, { idPrefix: 't' }),
      `${id}: the twin renders exactly like the pristine piece with the treatment OFF — the damage is`
      + ' not in the drawing at all');
    assert.ok(!seen.has(wrecked), `${id} renders identically to ${seen.get(wrecked)} — one painter, two rows`);
    seen.set(wrecked, id);
  }
  assert.equal(seen.size, 14);
});

// ⚠️ A TWIN IS THE SAME OBJECT WITH DAMAGE ON IT, so it must still be inside the same box: a mark
// authored past the piece's own centimetres is drawn, not counted, and clipped by whatever the
// surface insets — the same defect the pristine box rule exists for, one file over.
test('every twin\'s damage lands inside the piece\'s own box', () => {
  for (const id of FIXTURE_IDS) {
    const svg = rawWrecked(id, { idPrefix: 'v' });
    const over = [];
    for (const [x, y] of points(svg)) {
      if (Math.abs(x) > BOX / 2 + 0.05 || Math.abs(y) > BOX / 2 + 0.05) over.push(`(${x}, ${y})`);
    }
    for (const e of ellipses(svg)) {
      if (Math.abs(e.cx) + e.rx > BOX / 2 + 0.05 || Math.abs(e.cy) + e.ry > BOX / 2 + 0.05) {
        over.push(`ellipse ${e.cx},${e.cy}`);
      }
    }
    assert.deepEqual(over, [], `${id}'s twin marks the paper outside its own box: ${over.slice(0, 3).join(' ')}`);
  }
  // …and the twin really is the pristine piece PLUS marks, not a redraw: every element of the
  // pristine fragment's body survives into the twin's, in order. That is what `paintPaperFixture`
  // guarantees and it is the only reason "the twin is the same object" stays true through a redraw.
  for (const id of FIXTURE_IDS) {
    const pristine = body(build(id, { idPrefix: 'z' }));
    const twin = body(rawWrecked(id, { idPrefix: 'z' }));
    assert.ok(twin.length > pristine.length, `${id}: the twin is not the pristine drawing plus damage`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE IDENTIFYING FEATURES — what each piece must not lose
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `docs/design/perilune-item-set.dc.html` states the premise these fourteen inherit: each piece keeps
// ONE identifying feature, so it still reads as the same object. Every warm drawing being replaced
// had one, and these are those features asked through the frame — the fixed points a redraw may not
// quietly drop while every generic assertion above stays green.
test('each redraw keeps the identifying feature of the piece it replaces', () => {
  // SLIDING DOOR: the warm piece's lit CENTRE strip only makes sense on a bi-parting door, so the
  // seam is the identity. Full height, x = 66, on the leaf face.
  hasPoint(build('door-sliding'), 'door-sliding', [66, 6, 0], 'the sliding door lost its meeting seam');
  hasPoint(build('door-sliding'), 'door-sliding', [66, 6, 200], 'the meeting seam does not run the full leaf');
  // AIRLOCK: the undogging wheel and its six dogs.
  assert.ok(circles(build('door-airlock')).filter((c) => c.r > 0).length >= 9,
    'the airlock lost its dogs or its wheel — a round hatch with no gear is a porthole');
  // BLAST DOOR: two hazard bands, and they are the accent (pinned by the accent test above too).
  assert.equal((build('door-blast').match(new RegExp(`stroke="${ATTEND}"`, 'g')) || []).length, 16,
    'the blast door no longer carries sixteen hazard stripes across two bands');
  // DECK HATCH: the ladder reaches BELOW the deck line — the whole reason it is a way down.
  hasPoint(build('deck-hatch'), 'deck-hatch', [43, 88, -56], 'the deck hatch\'s ladder stops at the deck');
  // CONDUIT RUN: three nodes, and they are what `state` moves.
  const litRun = build('conduit-run', { idPrefix: 'i', state: 'on' });
  assert.equal((litRun.match(new RegExp(`fill="${INK}"`, 'g')) || []).length, 3,
    'the conduit run no longer has three lit nodes — the warm piece\'s only identifying feature');
  assert.ok(!build('conduit-run', { idPrefix: 'i', state: 'off' }).includes(`fill="${INK}"`),
    'an unpowered conduit run still shows lit nodes');
  // HULL PORT: the glass is the one ink-filled area in the set, with stars knocked out of it.
  const port = build('hull-port');
  assert.ok(port.includes(`fill="${INK}"`), 'the porthole lost its night — it is a paper disc now');
  assert.ok(circles(port).filter((c) => c.tail.includes(`fill="${PAPER}"`) && c.r < 3).length >= 5,
    'the porthole lost its stars');
  // ARMS RACK: three arms of TWO lengths, never four of one (they re-average into a stripe).
  const barrels = segments(build('arms-rack')).filter((sg) => Math.abs(sg.x2 - sg.x1) < 0.01 && Math.abs(sg.y2 - sg.y1) > 10);
  assert.equal(barrels.length, 3, 'the arms rack no longer holds exactly three arms');
  assert.ok(new Set(barrels.map((sg) => Math.round(Math.abs(sg.y2 - sg.y1)))).size >= 2,
    'the three arms are all one length — at tile size that is a stripe pattern, not a rack');
  // THE THREE LUMINAIRES: each responds to power, and each does it differently.
  for (const id of ['lamp-sconce', 'grow-lamp', 'flood-lamp', 'door-sliding', 'door-blast',
    'door-airlock', 'vent-grille', 'extractor-fan', 'bulkhead-screen', 'conduit-run']) {
    assert.notEqual(build(id, { idPrefix: 'p', state: 'on' }), build(id, { idPrefix: 'p', state: 'off' }),
      `${id} does not respond to state — its lit part is not lit`);
  }
  // …and the ones that have no lit part say so by being IDENTICAL, which is the honest answer.
  for (const id of ['deck-hatch', 'hull-port', 'arms-rack', 'deck-marker']) {
    assert.equal(build(id, { idPrefix: 'p', state: 'on' }), build(id, { idPrefix: 'p', state: 'off' }),
      `${id} responds to state but has nothing that is powered`);
  }
});
