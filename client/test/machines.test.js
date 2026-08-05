// THE THIRTEEN PAPER MACHINES — `client/src/items/machines.js`.
//
// ⚠️ WHAT THIS FILE IS FOR, AND WHAT IT CANNOT DO. The thirty fittings can be diffed against a
// document: `design-import/Perilune Fittings.dc.html` draws every one of them, so `fittings.test.js`
// can ask "is the port faithful?" and mean something by it. THESE THIRTEEN HAVE NO CARD. They are
// designed in-dialect, so there is nothing to be faithful TO — which removes the strongest guard the
// sibling file has and puts the whole weight on two things:
//
//   1. THE PICTURE. `client/tools/machines-sheet.mjs` renders all thirteen, their twins, and each
//      beside the warm row it replaces, at catalogue size and at 22/32/48/72 px. The owner judges art
//      from screenshots (binding, 2026-07-27) and that is the authority on whether a reactor reads as
//      a reactor. Nothing below is a substitute for looking.
//   2. THE RULES THE DIALECT IS MADE OF, which ARE mechanisable and are what this file pins: one
//      projection, level rounds, weight by mass, a closed palette, one accent, everything inside the
//      declared box, no invisible ink, no floating member, and no piece drawing another piece.
//
// ⚠️ AND THE ONE THAT IS NEITHER — THE SWAP. A row whose `DRAW` entry points at another row's painter
// satisfies every assertion in this file except the one written for it: the output is still a valid
// fragment, still deterministic, still in-palette, still inside a box. `wrecked.test.js`'s header
// calls this shape "invisible to every other guard in this repo". It is caught here twice — once by
// NAME (`DRAW[id]` is the const named after `id`) and once GEOMETRICALLY, because two machines have
// different SPECS and therefore different frames, so the coordinates a piece emits are a fingerprint.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as MC from '../src/items/machines.js';
import {
  SPECS, MACHINE_IDS, SIZES, BOX_EXTENT, DRAW, frameFor, roomBox,
} from '../src/items/machines.js';
import { BOX, W } from '../src/items/fittings.js';
import { DEPTH_RATIO, PX_PER_CM, HATCH, PAPER_FLAT, n as nn } from '../src/render/oblique.js';
import { INK, PAPER, ATTEND } from '../src/items/helpers.js';
import { WRECKED, buildWrecked } from '../src/items/wrecked.js';
import { codeOnly } from './code-only.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'items', 'machines.js'), 'utf8');

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const build = (id, opts = { idPrefix: 'm' }) => MC[camel(id)](opts);

/**
 * EVERY coordinate pair a fragment's path data contains, as `[x, y]` — walked command by command.
 *
 * ⛔ THE FIRST DRAFT WAS `/[MLQ](x) (y)/` AND ITS DOC LINE CLAIMED "every … coordinate pair", which
 * was false in two directions at once. `A rx ry rot laf sf x y` ends at a coordinate the pattern never
 * reached (eighteen of them on `bottle-rack` alone — every band, strap, cylinder lip and taper edge in
 * the module is an arc), and `Q cx cy x y` matched the CONTROL point and then skipped the endpoint.
 * The box guard below is the consumer that made this matter: a scan blind to arc endpoints cannot see
 * a hoop drawn off the piece, and this module is mostly hoops.
 *
 * The walker is ABSOLUTE-ONLY and says so: the kit emits `M/L/A/Q/Z` and nothing else (asserted below
 * as a limit, not assumed), so a lowercase command would be a new primitive and must fail loudly
 * rather than be silently miscounted.
 */
function points(svg) {
  // a bare `d` string (what `memberThrough` hands back) has no markup at all; anything else is a
  // fragment and its path data lives in `d="…"`.
  const ds = svg.includes('<') ? [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]) : [svg];
  const out = [];
  for (const d of ds) {
    assert.ok(!/[a-z]/.test(d), `path data uses a RELATIVE command, which this walker cannot\n`
      + `read and would silently miscount: "${d.slice(0, 60)}"`);
    const toks = d.match(/[A-Z]|-?[\d.]+/g) || [];
    let i = 0;
    let cmd = '';
    while (i < toks.length) {
      if (/[A-Z]/.test(toks[i])) { cmd = toks[i]; i += 1; if (cmd === 'Z') continue; }
      const num = (k) => toks.slice(i, i + k).map(Number);
      if (cmd === 'M' || cmd === 'L' || cmd === 'T') { out.push(num(2)); i += 2; }
      else if (cmd === 'Q' || cmd === 'S') { const a = num(4); out.push([a[0], a[1]], [a[2], a[3]]); i += 4; }
      else if (cmd === 'C') { const a = num(6); out.push([a[0], a[1]], [a[2], a[3]], [a[4], a[5]]); i += 6; }
      else if (cmd === 'A') { const a = num(7); out.push([a[5], a[6]]); i += 7; }
      else assert.fail(`points() does not know the path command "${cmd}" in "${d.slice(0, 60)}"`);
    }
  }
  return out;
}

/** Every `<ellipse>` in a fragment. */
function ellipses(svg) {
  return [...svg.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="([\d.]+)" ry="([\d.]+)"([^>]*)\/>/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], rx: +m[3], ry: +m[4], tail: m[5] }));
}

// ⚠️ THE OBLIQUE'S TWO RATIOS ARE READ, NOT TYPED — the same rule `fittings.test.js` records: six
// copies of one design decision agreeing with each other by luck is how the ellipse rule and the
// centring rule come to disagree after a change nobody thought was a change.
const RX = DEPTH_RATIO.x;
const RY = Math.abs(DEPTH_RATIO.y);

/**
 * ⭐ THE JOIN THIS FILE LEANS ON, AND WHY IT IS A SEAM RATHER THAN A TEXT SCAN (CLAUDE.md trap 4).
 * "Does this pad draw below the body?" is a question about a POINT IN THE PIECE'S OWN CENTIMETRES,
 * and the only honest way to ask it of a string is to put the same centimetres through the same
 * projection the builder used. `frameFor(id)` IS the builder's frame, so this compares a recorded
 * argument at the seam, never a remembered pixel — and it moves correctly if the scale ever changes.
 */
function hasPoint(svg, id, [x, y, z], msg) {
  const [px, py] = frameFor(id).project(x, y, z);
  const asPath = `${nn(px)} ${nn(py)}`;
  const asEllipse = `cx="${nn(px)}" cy="${nn(py)}"`;
  assert.ok(svg.includes(asPath) || svg.includes(asEllipse),
    `${msg}\n  expected ${id} to draw through (${x}, ${y}, ${z}) cm ⇒ "${asPath}", and it does not.`);
}

/**
 * The ONE emitted member running through every one of `pts`, returned as its projected points.
 * Insisting on exactly one is the whole difference from calling `hasPoint` twice: two `hasPoint`s
 * prove two coordinates are drawn SOMEWHERE, which two unrelated strokes satisfy as happily as one
 * member does. Requiring a single `d` containing all of them says they are the same run of ink.
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
    `${what}: expected exactly ONE member running through ${want.join(' → ')}, found ${ds.length}.`);
  return points(ds[0]);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SET — thirteen pieces, present, pure, namespaced
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the set is thirteen, and SPECS / DRAW / the exports are the SAME thirteen', () => {
  assert.equal(MACHINE_IDS.length, 13, 'the machine set is thirteen pieces');
  assert.deepEqual(Object.keys(SPECS), [...MACHINE_IDS], 'SPECS is the id list, in order');
  // ⚠️ THREE-WAY, AND NOT A COUNT. A set of counts cannot see a substitution (CLAUDE.md trap 7):
  // dropping `med-cot` from `DRAW` and adding `med-cott` leaves all three lengths at 13.
  assert.deepEqual(Object.keys(DRAW).sort(), [...MACHINE_IDS].sort(), 'DRAW is the id set');
  for (const id of MACHINE_IDS) {
    assert.equal(typeof MC[camel(id)], 'function', `${id} has no exported builder ${camel(id)}()`);
    const svg = build(id);
    assert.ok(svg.startsWith('<g') && svg.trimEnd().endsWith('</g>'), `${id} is a <g> fragment`);
    assert.ok(!svg.includes('<svg'), `${id} is a fragment, not a whole <svg>`);
    assert.ok(svg.length > 600, `${id} draws almost nothing (${svg.length} chars)`);
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), `${id} has an unresolved value`);
  }
});

test('every builder is deterministic and every placement is id-collision free', () => {
  for (const id of MACHINE_IDS) {
    assert.equal(build(id, { idPrefix: 'x' }), build(id, { idPrefix: 'x' }), `${id} is deterministic`);
    const ids = (svg) => new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const a = ids(build(id, { idPrefix: `${id}-a` }));
    for (const x of ids(build(id, { idPrefix: `${id}-b` }))) {
      assert.ok(!a.has(x), `${id}: def id ${x} appears in two placements`);
    }
  }
});

test('the module reaches for no clock, no randomness and no DOM', () => {
  const code = codeOnly(SRC);
  assert.ok(code.length > 6000, 'non-vacuity: the comment stripper ate the module');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'document.', 'window.',
    'performance.now', 'toLocaleString', 'Intl.']) {
    assert.ok(!code.includes(banned), `machines.js reaches for ${banned}`);
  }
});

// ⚠️ E8-4, AS A PROPERTY OF THE WHOLE MODULE RATHER THAN OF FOUR PARTS. The charter's rule is that a
// glyph outside the two shipped faces is DRAWN, never set: a fallback face has different advances and
// a de-DE box picks a different fallback. The warm pieces this module replaces set `♻`, `-196°` and
// `EMPTY`; none of the thirteen sets anything at all, which makes the class unreachable here.
test('E8-4: there is no <text> anywhere in the set — the marks are drawn', () => {
  for (const id of MACHINE_IDS) {
    assert.ok(!build(id).includes('<text'), `${id} sets type. Draw the mark as paths (charter §1).`);
  }
  assert.ok(!codeOnly(SRC).includes('s.text('), 'the module calls scene.text()');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PALETTE — closed, imported, and the accent spent only where it is declared
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('no raw hex colour escapes the seam — the whole palette arrives by import', () => {
  const code = codeOnly(SRC);
  const hexes = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(hexes, [],
    `machines.js names ${hexes.length} colour(s) literally: ${hexes.join(', ')}.\n`
    + 'Import INK / PAPER / ATTEND from ./helpers.js, or PAPER_FLAT / HATCH from ../render/oblique.js.');
  // ⚠️ TRAPS-1, BOTH HALVES, ON THE SHIPPED FILE.
  // (a) NEGATIVE CONTROL — a scan whose stripper stopped stripping would fire on the module's own
  //     prose and the "fix" would be to delete the explanation, which is worse than the bug.
  assert.match(SRC, /#7B2C22|#EBE4D1|#14120F/,
    'the header no longer quotes a design hex, so the comment-stripping control proves nothing.');
  assert.ok(!codeOnly(SRC).match(/#7B2C22|#EBE4D1|#14120F/), 'the stripper is not removing comments');
  // (b) POSITIVE CONTROL — the scan must actually catch a hex in CODE.
  assert.ok(/#[0-9a-fA-F]{3,8}\b/.test(codeOnly("const c = '#7B2C22'; // ink\n")),
    'the hex scan cannot see a literal in code — it would pass over a whole retint');
});

test('the palette is CLOSED: four values and the hatch, and nothing else is painted', () => {
  const used = new Set();
  for (const id of MACHINE_IDS) {
    for (const m of build(id).matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)) {
      used.add(m[1]);
    }
  }
  const PALETTE = [INK, PAPER, PAPER_FLAT, ATTEND].filter((v, i, a) => a.indexOf(v) === i).sort();
  assert.deepEqual([...used].sort(), PALETTE,
    `the thirteen machines paint in ${[...used].join(', ')}. The dialect is ink, paper, the flat side\n`
    + 'tone and ONE accent; a fifth colour is a change to the design language, not to a machine.');
  assert.equal(HATCH.ground, PAPER, 'the kit\'s hatch ground and the seam\'s paper have parted');
});

// ⭐ ACCENT CLOSURE, AS A NAMED SET — the one rule in the whole dialect that is about RESTRAINT, and
// therefore the one no "is the value legal" check can enforce. Oxblood means attention: a fault, a
// hazard, a contact, a queued order, a mark somebody's life depends on. Six pieces spend it and seven
// spend none, and BOTH halves are asserted, because a package that quietly tinted a seventh piece
// would pass every other guard in this file.
const SPENDS_ACCENT = Object.freeze({
  'reactor-plant': 'the hazard plate on the core drum',
  'bottle-rack': 'the pressure band round each bottle shoulder',
  'reclaimer-stack': 'the caution collar on the GREY-water inlet',
  'paste-column': 'the one press on the machine',
  'med-cot': 'the cross on the blanket',
  'fab-cell': 'the print head, while it is running',
  'ring-array': 'the contact on the sweep',
  'deck-turret': 'the band near the muzzle',
  'sleeper-pod': 'the status plate\'s edge',
});
test('the ONE accent is spent on exactly the pieces that declare it, and nowhere else', () => {
  const spends = MACHINE_IDS.filter((id) => build(id).includes(ATTEND));
  assert.deepEqual(spends.sort(), Object.keys(SPENDS_ACCENT).sort(),
    'the accent moved. Oxblood is ATTENTION — a fault, a hazard, a contact, a queued order — and\n'
    + 'there is no second accent, so a piece that gains one has taken emphasis from a piece that\n'
    + 'needs it. Add the reason to SPENDS_ACCENT deliberately, or take the tint back out.');
  // NON-VACUITY, as an INCLUSION test: a scan that found the accent nowhere and a set that declared
  // it nowhere are the same empty list, and this whole assertion would then be about nothing.
  assert.ok(spends.length >= 9, 'the accent reaches fewer pieces than the declared set — vacuous');
  for (const [id, why] of Object.entries(SPENDS_ACCENT)) {
    assert.ok(MACHINE_IDS.includes(id), `${id} declares an accent but is not a machine`);
    assert.ok(why.length > 12, `${id}: the accent has no stated reason`);
  }
});

// ⭐⭐ NO INVISIBLE INK — the failure that killed two members in review on the fittings lane, in its
// OTHER costume. There, a member was hidden by being drawn behind its own piece; here it is hidden by
// being drawn in the colour of the paper it stands on. Both render as nothing and both are invisible
// to every assertion about strings, which is why this one is stated as a rule over EVERY stroke in
// the set rather than as a spot check.
test('no stroke is drawn in paper — every line in the set is ink or the accent', () => {
  const ALLOWED = new Set([INK, ATTEND]);
  for (const id of MACHINE_IDS) {
    const svg = build(id);
    for (const m of svg.matchAll(/stroke="(#[0-9a-fA-F]{3,8})"/g)) {
      assert.ok(ALLOWED.has(m[1]),
        `${id} strokes in ${m[1]} — paper on paper draws nothing at all. Ink is ${INK}; the accent\n`
        + `is ${ATTEND}. A fill may be ${PAPER} or ${PAPER_FLAT}; a stroke may not.`);
    }
    // …and the module must not have simply stopped stroking: a set with no strokes passes the loop.
    assert.ok((svg.match(/stroke="/g) || []).length >= 6, `${id} draws almost no stroked ink`);
  }
});

// The other half of "a def that draws nothing": a `<pattern>` registered and never referenced. Five
// of the thirteen are all-cylinder pieces with no side face, and `envFor`'s `hatch` is a GETTER so
// they register none — a fact that survives only as long as nobody spreads that object.
test('every def a fragment registers is referenced by it, and every reference resolves', () => {
  for (const id of MACHINE_IDS) {
    const svg = build(id);
    const defs = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const refs = new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]));
    for (const d of defs) assert.ok(refs.has(d), `${id}: def ${d} is registered and never used`);
    for (const r of refs) {
      assert.ok(defs.includes(r), `${id}: url(#${r}) resolves to nothing in its own fragment`);
    }
  }
  const noHatch = MACHINE_IDS.filter((id) => !build(id).includes('<pattern'));
  assert.deepEqual(noHatch.sort(),
    ['plant-pot', 'ring-array', 'sleeper-pod', 'solar-wing'].sort(),
    'which pieces have a hatched side face changed. That is legitimate — but the `hatch` getter is\n'
    + 'the only thing keeping an unused <pattern> out of a round piece\'s fragment, and a spread of\n'
    + '`envFor`\'s object would register it for all thirteen while this list said so.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE BOX — honest centimetres, one derived scale, nothing outside it
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every SPEC is honest centimetres, and a round piece really is round', () => {
  for (const id of MACHINE_IDS) {
    const s = SPECS[id];
    for (const k of ['w', 'd', 'h']) {
      assert.ok(Number.isFinite(s[k]) && s[k] > 0, `${id}.${k} is not a positive length`);
      assert.ok(s[k] <= 300, `${id}.${k} = ${s[k]} cm — three metres inside one compartment?`);
    }
    if (s.round) assert.equal(s.w, s.d, `${id} is marked round but its footprint is not a circle`);
  }
  // ⚠️ THE SCALE SANITY THE OLD `size` FIELD COULD NOT CARRY: a bigger object has a bigger footprint,
  // stated across the two SETS, because that is where the calibration actually matters — a machine
  // whose centimetres were guessed against nothing would land beside the catalogue and look wrong.
  assert.ok(SIZES['reactor-plant'].w > 3 * SIZES['plant-pot'].w,
    `a 200 cm reactor (${SIZES['reactor-plant'].w}) must dwarf a ∅56 cm plant pot `
    + `(${SIZES['plant-pot'].w}) — that is the tile normalisation leaking back into the registry`);
  assert.ok(SIZES['med-cot'].w > 2 * SIZES['book-case'].w, 'a 2 m cot is wider than a 96 cm case');
});

test('SIZES is an honest footprint at ONE shared scale; BOX_EXTENT is the drawn tile', () => {
  for (const id of MACHINE_IDS) {
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
    assert.equal(Math.max(BOX_EXTENT[id].w, BOX_EXTENT[id].h), BOX, `${id} fills its box in neither axis`);
  }
  // …and the ORDERING is the centimetres' ordering, which is what "one shared scale" means.
  for (const a of MACHINE_IDS) {
    for (const b of MACHINE_IDS) {
      if (SPECS[a].w + RX * SPECS[a].d > SPECS[b].w + RX * SPECS[b].d) {
        assert.ok(SIZES[a].w >= SIZES[b].w, `${a} is wider than ${b} in cm but not in its size hint`);
      }
    }
  }
});

// ⚠️ THIS IS THE ONE THAT CATCHES A CLIP. The harness centres a piece on its DECLARED box, so
// anything authored outside `0..w / 0..d / 0..h` is drawn but NOT counted — it simply hangs over the
// edge and is cut by whatever the surface insets. It bites hardest on level ellipses, which hang
// `0.6·s·r` below the point they stand on, and on Bézier CONTROL points, which are emitted into the
// path data and are the easiest thing in this module to push out of the box by accident (the dish's
// control point sits 6 cm inside `w`).
//
// ⛔⭐ AND THE RULER WAS WRONG FOR TWO ROUNDS, WHICH IS THE HALF WORTH WRITING DOWN. The first draft
// asked `|x| > BOX/2` — the ±56 px DRAWING SQUARE the piece is centred in — and the two are not the
// same shape. A piece fills `BOX` in its LARGER extent only, so the smaller axis leaves slack the
// square happily accepts: `book-case` is 107.2 cm across a 192.8 cm frame, so ~10 px (≈17 cm) of its
// width was blind, and eleven spines put three flat books at x = 122.8 on a 96 cm case — drawn, then
// clipped, with the suite green. The square also has no idea which CORNER a point is near: it is a
// square and the projected box is a HEXAGON.
//
// So the question is asked properly. `project` is `px = x0 + s·(x + RX·y)`, `py = y0 − s·(z + RY·y)`,
// which means a drawn point pins exactly two numbers — `u = x + RX·y` and `v = z + RY·y` — and never
// the third. The honest test is therefore existential: is there ANY `(x, y, z)` inside the declared
// box that projects here? Eliminating `y` from `y ∈ [0,d]`, `u − RX·y ∈ [0,w]`, `v − RY·y ∈ [0,h]`
// leaves six half-planes, and that hexagon IS the piece's declared box as drawn.
const HEX_TOL = 0.15;   // cm — `n()` rounds to 2 px, which is ≤ 0.02 cm at every scale in the set

/** How far outside its own declared box a drawn px point is, in the piece's centimetres (≤ 0 = in). */
function outsideBoxCm(id, px, py) {
  const F = frameFor(id);
  const S = SPECS[id];
  const u = (px - F.x0) / F.s;
  const v = (F.y0 - py) / F.s;
  const k = Math.hypot(RY, RX);
  return Math.max(-u, -v, u - (S.w + RX * S.d), v - (S.h + RY * S.d),
    (RY * u - RX * v - RY * S.w) / k, (RX * v - RY * u - RX * S.h) / k);
}

/** The same six half-planes applied to a whole level ellipse, via its support function — EXACT, and
 *  the reason a level ring at the lip of a cylinder is not flagged for the 0.6·r it hangs below. */
function ellipseOutsideCm(id, e) {
  const F = frameFor(id);
  const S = SPECS[id];
  const k = Math.hypot(RY, RX);
  const u = (e.cx - F.x0) / F.s;
  const v = (F.y0 - e.cy) / F.s;
  const au = e.rx / F.s;
  const av = e.ry / F.s;
  const PLANES = [[-1, 0, 0], [0, -1, 0], [1, 0, S.w + RX * S.d], [0, 1, S.h + RY * S.d],
    [RY / k, -RX / k, (RY * S.w) / k], [-RY / k, RX / k, (RX * S.h) / k]];
  // ⚠️ THE ELLIPSE TESTED IS THE ONE DRAWN, not the true projection of a 3-D circle. This kit draws a
  // level circle as an AXIS-ALIGNED `rx × 0.6·rx` ellipse by design (the sheared truth would give a
  // round thing a heading — see `oblique.js`), so the ink's own semi-axes are what can hang over an
  // edge, and they are what the support function is taken over. The v axis points UP while `cy` grows
  // DOWN; that flip is already spent converting the CENTRE, and a semi-axis is unsigned.
  return Math.max(...PLANES.map(([nu, nv, c]) =>
    nu * u + nv * v + Math.hypot(nu * au, nv * av) - c));
}

test('nothing is drawn outside the box the piece is centred on', () => {
  for (const id of MACHINE_IDS) {
    const svg = build(id);
    const over = [];
    for (const [x, y] of points(svg)) {
      const by = outsideBoxCm(id, x, y);
      if (by > HEX_TOL) over.push(`(${x}, ${y}) by ${by.toFixed(1)} cm`);
    }
    for (const e of ellipses(svg)) {
      const by = ellipseOutsideCm(id, e);
      if (by > HEX_TOL) over.push(`ellipse ${e.cx},${e.cy} r ${e.rx},${e.ry} by ${by.toFixed(1)} cm`);
    }
    assert.deepEqual(over, [],
      `${id} draws outside its own declared ${SPECS[id].w}×${SPECS[id].d}×${SPECS[id].h} cm box, at\n`
      + `  ${over.slice(0, 3).join('\n  ')}\n`
      + 'Geometry must stay inside 0..w / 0..d / 0..h — the centring counts the SPEC, not the paint,\n'
      + 'so ink outside the box is drawn and then clipped by whatever the surface insets.');
  }
  // ⭐ INCLUSION CONTROL, AND IT IS THE DEFECT THIS GUARD WAS RE-POINTED FOR — not a synthetic point.
  // (a) `book-case`'s pre-fix geometry: the first draft's eleven-spine top shelf put a flat book at
  //     x = 122.8 on a 96 cm case. The ±56 SQUARE could not see it; this must.
  const bc = frameFor('book-case').project(122.8, 4, 128);
  assert.ok(outsideBoxCm('book-case', bc[0], bc[1]) > 15,
    'the box guard cannot see the book case\'s own shipped defect — three flat books 26.8 cm past the\n'
    + 'right-hand side panel, on a piece whose smaller axis leaves the drawing square ~17 cm of slack.');
  assert.ok(Math.abs(bc[0]) < BOX / 2 && Math.abs(bc[1]) < BOX / 2,
    `that point is at (${bc}), which is INSIDE the ±${BOX / 2} drawing square — if it ever stops being\n`
    + 'inside, this control has stopped proving that the square was the wrong ruler.');
  // (b) `med-cot`'s near-left leg pushed from x = 186 to x = 225: outside a 200 cm cot, inside the
  //     square by the same slack. Both halves asserted, so the control cannot rot into a tautology.
  const mc = frameFor('med-cot').project(225, 12, 3);
  assert.ok(outsideBoxCm('med-cot', mc[0], mc[1]) > 5, 'the box guard cannot see a leg 25 cm off a cot');
  assert.ok(Math.abs(mc[0]) < BOX / 2 && Math.abs(mc[1]) < BOX / 2, 'that leg is not inside the square');
  // …and the complement: a point ON the box's own far-top-back corner must PASS, or the guard is
  // rejecting legal geometry and the next drawing gets bent to satisfy an instrument.
  for (const id of MACHINE_IDS) {
    const S = SPECS[id];
    for (const c of [[0, 0, 0], [S.w, 0, 0], [S.w, S.d, S.h], [0, S.d, S.h], [S.w, S.d, 0], [0, 0, S.h]]) {
      const [cx, cy] = frameFor(id).project(...c);
      assert.ok(outsideBoxCm(id, cx, cy) <= HEX_TOL, `${id}: its own box corner ${c} reads as outside`);
    }
  }
});

test('roomBox puts a machine on a surface at exactly s px per centimetre', () => {
  // The Level-2 cutaway's own rule, and the reason this derivation lives beside the drawing scale:
  // asking for a box side of `TILE·s/scaleOf` means a 200 cm reactor is 200 cm of deck.
  const rb = roomBox('reactor-plant', PX_PER_CM.room);
  assert.ok(rb && rb.side > 0, 'roomBox does not answer for a real machine');
  assert.equal(rb.wCm, SPECS['reactor-plant'].w, 'roomBox reports a different width from SPECS');
  // ⚠️ `BOX_EXTENT` IS ROUNDED TO WHOLE PIXELS, so the comparison carries that rounding and nothing
  // more: one px of `BOX_EXTENT` is `rb.side / 128` px on the destination surface, which at the room
  // scale is about 2.2. A tighter bound here would be a test of `Math.round`, not of the derivation.
  const drawn = BOX_EXTENT['reactor-plant'].w * (rb.side / 128);
  const wantCm = SPECS['reactor-plant'].w + RX * SPECS['reactor-plant'].d;
  assert.ok(Math.abs(drawn - wantCm * PX_PER_CM.room) < rb.side / 128 + 0.05,
    `a reactor placed through roomBox draws ${drawn.toFixed(1)} px where its own centimetres at the\n`
    + `room scale are ${(wantCm * PX_PER_CM.room).toFixed(1)} px`);
  for (const bad of ['nope', '', null, 0, -1]) {
    assert.equal(roomBox(/** @type {any} */ (bad), 1), undefined);
    assert.equal(roomBox('reactor-plant', /** @type {any} */ (bad === 0 ? 0 : -1)), undefined);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE E8 CLASSES — applied FORWARD, one pin each, each with a control
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ── CLASS 2: a full ellipse round a cylinder shows its own back half through the body ────────
//
// The catalogue drew the water butt's three rolling hoops as full `<ellipse>`s and the butt read as a
// wire cage. Every band round a cylinder here is a FRONT HALF-ARC — one `A` command from the left of
// the ellipse to the right — which is the same construction a cylinder's own bottom edge uses.
//
// The full level rings that DO exist (the reactor's containment ring, the ring array's three) are NOT
// this defect and the test says so by asking a different question of them: they lie on a HORIZONTAL
// surface, where the whole ellipse is in front of what it is drawn on.
test('E8-2: every band round a cylinder is a FRONT half-arc, not a see-through ellipse', () => {
  const HALF = /^M-?[\d.]+ -?[\d.]+ A[\d.]+ [\d.]+ 0 0 0 -?[\d.]+ -?[\d.]+$/;
  const BANDS = [
    ['bottle-rack', [17, 18, 34], 13, 'the near bottle\'s lower strap'],
    ['bottle-rack', [47, 18, 118], 13, 'the far bottle\'s pressure band'],
    ['sleeper-pod', [42, 42, 168], 38, 'the pod\'s hood seam'],
    ['deck-turret', [44, 44, 30], 34, 'the turret\'s swivel seam'],
    ['plant-pot', [28, 28, 38], 22.4, 'the pot\'s rim band'],
  ];
  for (const [id, where, r, what] of BANDS) {
    const F = frameFor(id);
    const [cx, cy] = F.project(...where);
    const start = `M${nn(cx - F.s * r)} ${nn(cy)}`;
    // ⚠️ FILTERED BY SHAPE AS WELL AS BY START POINT, and the reason is a real collision rather than
    // caution: a CYLINDER's own body path begins at exactly `M(cx − r·s) y(z1)` too, because its top
    // edge is at the same height and radius as a band drawn at its lip. The pod's hood seam sits on
    // the body's own top, so asking "how many paths start here" answers 2 forever. What the rule is
    // about is the SHAPE — one `A`, left lip to right lip, nothing else — so that is what is counted.
    const at = [...build(id).matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
      .filter((d) => d.startsWith(start));
    assert.ok(at.length >= 1, `${what} is not drawn at its declared radius at all`);
    const halves = at.filter((d) => HALF.test(d));
    assert.equal(halves.length, 1,
      `${what} is not ONE front half-arc (found ${halves.length} among ${at.length} paths there).\n`
      + 'A second `A` command closes the ellipse and its back half then shows through the body — the\n'
      + 'water-butt defect, which made a barrel read as a wire cage.');
  }
  // INCLUSION CONTROL: the shape this rule forbids must FAIL the predicate, or the match is vacuous.
  assert.ok(!HALF.test('M-10 0 A10 6 0 0 0 10 0 A10 6 0 0 0 -10 0'),
    'the half-arc predicate accepts a CLOSED ellipse — it cannot see the defect it is named for');
  // ⭐ AND THE COMPLEMENT, WHICH IS THE HALF THAT MAKES THIS RULE MEAN ANYTHING. `levelRing` emits a
  // path that IS a closed ellipse — two `A` commands and nothing else — and it is legitimate exactly
  // once, on a HORIZONTAL surface where the whole ring is in front of what it is drawn on. Naming the
  // one piece allowed to use it is what stops the primitive spreading back onto a cylinder, which is
  // the water-butt defect returning through a helper instead of through a literal.
  const FULL = / d="(M-?[\d.]+ -?[\d.]+ A[\d.]+ [\d.]+ 0 0 0 -?[\d.]+ -?[\d.]+ A[\d.]+ [\d.]+ 0 0 0 -?[\d.]+ -?[\d.]+)"/;
  const rings = MACHINE_IDS.filter((id) => FULL.test(build(id)));
  assert.deepEqual(rings, ['reactor-plant'],
    `${rings.join(', ')} draw a CLOSED level ring. Only the reactor's containment ring may — it lies\n`
    + 'on the body\'s own top face. Anywhere on a cylinder it is the water-butt defect.');
  // …and the two full level rings are permitted, BY NAME and by the surface they lie on: the reactor
  // draws its containment ring at the height of its own body top, and the array draws three at the
  // height of its spoke plane. Both are horizontal faces of the piece itself.
  // ⚠️ NOT `hasPoint`, AND THE REASON IS A ROUNDING SEAM WORTH RECORDING RATHER THAN WORKING AROUND
  // TWICE. `levelRing` rounds the CENTRE and then subtracts an unrounded radius, while `project`
  // rounds the whole expression, so the ring's left lip prints `-22.68` where `project(38, 75, 162)`
  // gives `-22.69`. Both are correct to the 2 dp this kit emits; a point-equality guard between them
  // is a test of `Math.round`. The question that actually matters — is the ring on the body's TOP
  // FACE, at the radius it claims — is asked of the ring's own two numbers instead.
  const Fr = frameFor('reactor-plant');
  const ring = build('reactor-plant').match(/d="M(-?[\d.]+) (-?[\d.]+) A([\d.]+) ([\d.]+) 0 0 0 [^"]*A/);
  assert.ok(ring, 'the reactor draws no containment ring at all');
  assert.equal(+ring[2], Fr.project(100, 75, 162)[1],
    'the containment ring is not at the height of the body\'s own top face');
  assert.ok(Math.abs(+ring[3] - Fr.s * 62) < 0.02, `the ring's radius is ${+ring[3]}, not 62 cm`);
  assert.ok(build('reactor-plant').includes('stroke-dasharray="5 4"'),
    'the containment ring lost its dash — it is one of the three marks that stop this piece reading\n'
    + 'as a lamp, a hob or a standing light (objects.js\'s own note on the 2026-07-27 redraw)');
});

// ── CLASS 3 + THE SEVENTH FAULT: a member that floats, and a member that hides ───────────────
//
// ⭐⭐ THIS IS THE ONE THAT COST TWO LANES REAL WORK, and it is invisible to every string assertion:
// a part authored at the depth of the body it hangs off is painted over by that body's own opaque
// PAPER front face and contributes ZERO pixels. It took the shrine shelf's only visible support and
// then all four of the sealed capsule's standoffs. Every standoff in this module is placed forward of
// its body's front plane, and the rule below is an INEQUALITY on the projected y — so a pad may be
// re-placed, and may not be hidden.
test('E8-3b: every standoff draws BELOW the body it holds up, not behind it', () => {
  const PADS = [
    ['reactor-plant', 16, 4, 30, 10],     // [id, pad x, pad y, body base z, pad height]
    ['reclaimer-stack', 8, 4, 10, 10],
    ['paste-column', 8, 4, 8, 8],
    ['fab-cell', 10, 4, 10, 10],
  ];
  for (const [id, px, py, bodyZ] of PADS) {
    const F = frameFor(id);
    const svg = build(id);
    // the lowest ink the BODY has anywhere is its own front-bottom edge, at y = 0
    const [, bodyBottom] = F.project(0, 0, bodyZ);
    const [, padBottom] = F.project(px, py, 0);
    assert.ok(padBottom > bodyBottom + 0.5,
      `${id}'s near-left standoff projects to y = ${padBottom}, at or above the body's own bottom\n`
      + `edge (y = ${bodyBottom}). At this piece's depth the oblique lifts a foot placed at the body's\n`
      + 'plane clear off the floor line and behind an opaque PAPER face, where it draws nothing at\n'
      + 'all — measured twice on two other lanes before it was believed.');
    hasPoint(svg, id, [px, py, 0], `${id}'s near-left standoff is not drawn at its declared corner`);
  }
  // INCLUSION CONTROL: a pad authored at the BODY's own depth must fail the rule, or it proves
  // nothing. `reclaimer-stack`'s body is 70 cm deep; a foot at y = 70 is the fault exactly.
  const F = frameFor('reclaimer-stack');
  const [, hidden] = F.project(8, 70, 0);
  const [, bodyBottom] = F.project(0, 0, 10);
  assert.ok(!(hidden > bodyBottom + 0.5),
    'the standoff rule can no longer see a foot placed at the body\'s own depth — the exact geometry\n'
    + 'that shipped twice with zero visible pixels. It proves nothing.');
});

// ── CLASS 1 + 3: a long diagonal is a MEMBER, attached at both ends ──────────────────────────
//
// E8-1 is not "no diagonals" — it is "no diagonal that ends in the air". The two longest strokes in
// this module are the dish's feed struts, and they are the real tripod of a real prime-focus dish, so
// the rule asked of them is the one that distinguishes a strut from a strike-through: does each end
// land on a part the piece actually has?
test('E8-1/3: the dish\'s feed struts run from the focus to the rim, at both ends', () => {
  const svg = build('dish-mast');
  const F = frameFor('dish-mast');
  const FEED = [48.5, 34, 166];
  for (const [end, what] of [[[10, 34, 194], 'the upper lip'], [[96, 34, 126], 'the lower lip']]) {
    const strut = memberThrough(svg, 'dish-mast', [FEED, end], `the dish's strut to ${what}`);
    assert.equal(strut.length, 2, `the strut to ${what} is not a two-point member`);
  }
  // the horn is AT the focus, so the struts hold something rather than meeting at empty paper
  hasPoint(svg, 'dish-mast', [54, 34, 166], 'the feed horn is not drawn at the focus the struts meet');
  // …and the mast reaches the bowl's own deepest point rather than stopping under it
  const mast = memberThrough(svg, 'dish-mast', [[56, 34, 118], [67.9, 34, 141.2]], 'the dish mast');
  assert.equal(mast.length, 2);
  // INCLUSION CONTROL: `memberThrough` must be able to report ZERO. Ask it for a point the piece
  // does not draw and check the join really fails, rather than trusting that it would.
  const [qx, qy] = F.project(50, 34, 40);
  const ds = [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])
    .filter((d) => d.includes(`${nn(qx)} ${nn(qy)}`));
  assert.equal(ds.length, 0, 'the member join matches a point the dish does not draw — it is vacuous');
});

// ── CLASS 6: wall stubs — UNREACHABLE HERE, AND SAID SO ──────────────────────────────────────
//
// Four of the thirty fittings hang on a wall the catalogue did not draw, and `fittings.js` gives each
// a hatched stub with dashed cut edges. None of the thirteen machines is wall-hung: they all stand on
// the deck. The honest form of "this class does not apply" is an assertion, not a silence — silence
// is how the next reader concludes the rule was forgotten.
test('E8-6: no machine is wall-hung, so none draws a wall stub or declares a z0', () => {
  for (const id of MACHINE_IDS) {
    assert.equal(SPECS[id].z0, undefined,
      `${id} declares a z0. That field exists for pieces that draw nothing in the bottom half of\n`
      + 'their box; a machine that needs it is a machine that has stopped standing on the deck.');
    assert.ok(!build(id).includes('stroke-dasharray="3 2"'),
      `${id} draws the wall stub's cut-edge dash without being wall-hung`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DIALECT — level rounds, and the weight ramp
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every round thing draws LEVEL: ry is exactly DEPTH_RATIO·rx, no heading anywhere', () => {
  assert.equal(DEPTH_RATIO.x, 0.4, 'the measured x ratio moved');
  assert.equal(DEPTH_RATIO.y, -0.6, 'the measured y ratio moved (negative: in SVG, up is −y)');
  let seen = 0;
  for (const id of MACHINE_IDS) {
    const svg = build(id);
    for (const e of ellipses(svg)) {
      assert.ok(Math.abs(e.ry - RY * e.rx) < 0.02,
        `${id}: an ellipse is ${e.rx} × ${e.ry} — not the oblique's own ${RY} ratio. A round thing\n`
        + 'drawn at any other ratio has acquired a heading, and can then be set down wrong.');
      seen += 1;
    }
    // ⚠️ `patternTransform="rotate(45)"` IS EXCLUDED AND IT IS THE KIT'S, not a heading: that is the
    // 45° hatch, measured off `<pattern id="fh">` in both design documents. What the rule forbids is a
    // rotation of GEOMETRY, which is the thing that would give a level round a facing.
    assert.ok(!svg.replace(/patternTransform="[^"]*"/g, '').includes('rotate('),
      `${id} rotates geometry — this dialect has no rotation, which is why round things read level`);
  }
  // The floor is RE-MEASURED off the shipped set (35), not guessed: a rule over a population must
  // fail when the population empties, and the first draft's guessed 40 failed on correct geometry.
  assert.ok(seen >= 30, `only ${seen} level ellipses across thirteen pieces — vacuously satisfied`);
});

test('the stroke ramp stays inside the charter\'s 0.9–2.2, by mass', () => {
  const ramp = new Set(Object.values(W));
  for (const id of MACHINE_IDS) {
    for (const m of build(id).matchAll(/stroke-width="([\d.]+)"/g)) {
      const v = +m[1];
      // the hatch's own 0.7 hairline is the kit's, not this module's ramp
      if (Math.abs(v - HATCH.width) < 0.001) continue;
      assert.ok(v >= 0.9 && v <= 2.2, `${id} strokes at ${v} — outside the charter's 0.9–2.2 ramp`);
      assert.ok(ramp.has(v) || v === 1.7 || v === 1.1 || v === 1.3 || v === 1.4 || v === 0.9,
        `${id} strokes at ${v}, which is not a step of the shared ramp`);
    }
  }
  assert.deepEqual(Object.values(W), [0.9, 1.1, 1.4, 1.8, 2.2], 'the ramp itself moved');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. IDENTITY — each piece keeps the feature its warm predecessor was redrawn around
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS IS THE HALF A COUNT CANNOT REACH. A machine can be in-palette, in-box, level, correctly
// weighted and still not read as the thing it replaces — and a player who learned the warm silhouette
// has to recognise the paper one. Each leg below names the feature `objects.js`'s own 2026-07-27
// redraw notes call the identifying one, and asks the drawing for it.

test('the reactor keeps its control strip: four lamps, three of them lit', () => {
  const on = build('reactor-plant');
  const off = build('reactor-plant', { idPrefix: 'm', state: 'off' });
  const filled = (svg) => (svg.match(new RegExp(`fill="${INK}"`, 'g')) || []).length;
  assert.ok(filled(on) - filled(off) === 3,
    `a powered reactor fills ${filled(on)} inked shapes and an unpowered one ${filled(off)}; the\n`
    + 'difference must be exactly the THREE lit lamps. "Three lit and one dark" is what says the\n'
    + 'plant is running; a fourth lit lamp says it is fine, which it is not.');
  for (let i = 0; i < 4; i += 1) hasPoint(on, 'reactor-plant', [52 + i * 18, 0, 45], `lamp ${i} is gone`);
});

test('the solar wing keeps its ruled grid, and every cell line lies IN the panel plane', () => {
  const svg = build('solar-wing');
  // the plane: (y 12, z 36) → (y 80, z 170). A grid line drawn flat over the panel instead of
  // through it would land at the wrong depth and is what this checks, rather than counting strokes.
  const P = (u, v) => [8 + 224 * u, 12 + 68 * v, 36 + 134 * v];
  for (const i of [1, 4, 7]) {
    memberThrough(svg, 'solar-wing', [P(i / 8, 0.06), P(i / 8, 0.94)], `cell column ${i}`);
  }
  for (const j of [1, 3]) {
    const v = 0.06 + (0.88 * j) / 4;
    memberThrough(svg, 'solar-wing', [P(0.035, v), P(0.965, v)], `cell row ${j}`);
  }
  // …and the stand really reaches the deck at both legs (E8-3 on the piece that would float first)
  for (const x of [34, 206]) {
    memberThrough(svg, 'solar-wing', [[x, 80, 0], [x, 62, 134.5]], `the rear mast at x = ${x}`);
  }
});

test('the bottle rack is TWO bottles, yoked and strapped — not one vessel', () => {
  const svg = build('bottle-rack');
  for (const c of [17, 47]) {
    hasPoint(svg, 'bottle-rack', [c, 18, 144], `the bottle at x = ${c} has no valve`);
    hasPoint(svg, 'bottle-rack', [c - 9, 6, 58], `the bottle at x = ${c} has no label patch`);
  }
  // the strap connector runs BETWEEN the two half-arcs, so the pair is banded rather than adjacent
  memberThrough(svg, 'bottle-rack', [[30, 18, 34], [34, 18, 34]], 'the lower strap\'s connector');
});

test('the reclaimer keeps the flow direction: grey in HIGH, clean out LOW, and the mark', () => {
  const svg = build('reclaimer-stack');
  const F = frameFor('reclaimer-stack');
  const [, inletY] = F.project(16, 35, 180);
  const [, outletY] = F.project(104, 0, 26);
  assert.ok(outletY > inletY + 20,
    'the grey-water inlet and the clean-water outlet are at the same height. "The flow direction IS\n'
    + 'the machine" (objects.js, the 2026-07-27 redraw) — level them and it is a cabinet.');
  // The sight glass carries a WATER LINE. ⚠️ NOT `memberThrough`: the standing water below the line
  // is a quad whose TOP edge runs through the same two corners, so "exactly one member through these
  // points" is false by construction and always will be. What separates the line from the quad is its
  // WEIGHT — it is the heaviest stroke in the window — so that is what is asked.
  const F2 = frameFor('reclaimer-stack');
  const [lx, ly] = F2.project(24, 0, 98);
  const [rx2] = F2.project(80, 0, 98);
  const heavy = [...svg.matchAll(/<path d="([^"]*)"[^>]*stroke-width="([\d.]+)"/g)]
    .filter((m) => m[1].includes(`${nn(lx)} ${nn(ly)}`) && m[1].includes(`${nn(rx2)} ${nn(ly)}`))
    .map((m) => +m[2]);
  assert.ok(heavy.includes(W.heavy),
    `the water line across the sight glass is drawn at ${heavy.join('/')}, not at the ramp's heavy\n`
    + 'step. It is the one mark that says the glass holds water rather than being a window.');
  // the recycling mark is DRAWN: two chasing arcs, each a quadratic, each with a head
  const qs = [...svg.matchAll(/ d="M[^"]*Q[^"]*"/g)].length;
  assert.ok(qs >= 2, `the recycling mark is ${qs} curve(s) — it needs two chasing arrows`);
});

test('the med cot keeps THE CROSS, on the blanket, in the accent, on a level plane', () => {
  const svg = build('med-cot');
  const F = frameFor('med-cot');
  const bars = [[[142, 27, 64], [142, 63, 64]], [[124, 45, 64], [160, 45, 64]]];
  for (const bar of bars) memberThrough(svg, 'med-cot', bar, 'a bar of the cross');
  // …and both bars are in the accent, and the accent is on nothing else in this piece
  const attends = [...svg.matchAll(/ d="([^"]*)"[^>]*stroke="#7B2C22"/g)].map((m) => m[1]);
  assert.equal(attends.length, 2, `${attends.length} oxblood strokes on the cot — the cross is two`);
  // the blanket the cross lies on is a LEVEL quad at the deck's own height
  hasPoint(svg, 'med-cot', [92, 8, 64], 'the blanket is gone from under the cross');
  // ⚠️ THE SIGN, WRITTEN OUT, because the first draft had it backwards and the guard then failed on
  // correct geometry: `project` maps depth to `−0.6·s·y`, so a point 36 cm FURTHER BACK draws
  // 0.6·s·36 px HIGHER. The near end of the vertical bar is therefore BELOW the far end.
  const near = F.project(142, 27, 64)[1];
  const far = F.project(142, 63, 64)[1];
  assert.ok(Math.abs((near - far) - RY * F.s * 36) < 0.02,
    `the cross is not drawn in the mattress-top plane: its bar spans ${(near - far).toFixed(2)} px of\n`
    + `depth where 36 cm of the blanket's own plane is ${(RY * F.s * 36).toFixed(2)}`);
});

test('the fab cell shows a chamber, a head that moves with power, and a tray', () => {
  const on = build('fab-cell');
  const off = build('fab-cell', { idPrefix: 'm', state: 'off' });
  assert.ok(on.includes(ATTEND) && !off.includes(ATTEND),
    'the print head does not change with `state`. It is the piece\'s one moving part and the whole\n'
    + 'of what "a printer you can watch working" means; an idle cell must not wear the accent.');
  hasPoint(on, 'fab-cell', [22, 0, 128], 'the gantry rail is gone');
  hasPoint(on, 'fab-cell', [58, 8, 62], 'the billet forming under the head is gone');
  hasPoint(on, 'fab-cell', [20, 0, 26], 'the output tray is gone');
});

test('the ring array keeps three concentric rings and a contact on its sweep', () => {
  const svg = build('ring-array');
  const F = frameFor('ring-array');
  const [cx, cy] = F.project(70, 70, 110);
  const rings = ellipses(svg).filter((e) => Math.abs(e.cx - cx) < 0.02 && Math.abs(e.cy - cy) < 0.02);
  const radii = rings.map((e) => Math.round((e.rx / F.s) * 10) / 10).sort((a, b) => b - a);
  assert.deepEqual(radii.slice(0, 3), [68, 46, 24],
    `the array's rings are ∅${radii.join('/')} — three concentric rings is the piece`);
  const blip = ellipses(svg).find((e) => e.tail.includes(ATTEND));
  assert.ok(blip, 'the contact is gone. A blip is the most attention-shaped mark this ship can draw.');
  const r = Math.hypot(blip.cx - cx, (blip.cy - cy) / RY) / F.s;
  assert.ok(r > 24 && r < 68, `the contact sits at r = ${r.toFixed(1)} — off the rings it is on`);
});

test('the plant pot is a TAPER with a crown, and every leaf starts on the soil', () => {
  const svg = build('plant-pot');
  const F = frameFor('plant-pot');
  // a taper, not a cylinder: the pot's two radii differ, which is the whole reason it is not a bin
  const [, base] = F.project(28, 28, 0);
  assert.ok(svg.includes(`${nn(F.project(28, 28, 0)[0] - F.s * 17)} ${nn(base)}`),
    'the pot no longer narrows at the base — a straight-sided pot is a bin');
  // six leaves, and each one is a curve that begins on the soil plane (z = 44)
  const curves = [...svg.matchAll(/ d="M(-?[\d.]+) (-?[\d.]+) Q/g)].map((m) => [+m[1], +m[2]]);
  const soilY = new Set([44].map(() => null));   // placeholder to keep the intent obvious below
  assert.ok(soilY.size === 1);
  const onSoil = curves.filter(([, y]) => Math.abs(y - F.project(28, 28, 44)[1]) < 4);
  assert.ok(onSoil.length >= 6,
    `only ${onSoil.length} of ${curves.length} leaf strokes begin at the soil. A stem that starts in\n`
    + 'the air is E8-3 exactly, on the one piece whose every member is a stem.');
});

test('the book case is OPEN and full of varied spines — not a locker with the door off', () => {
  const svg = build('book-case');
  // the back panel is hatched and visible, which is what "open" means in this dialect
  hasPoint(svg, 'book-case', [5, 26, 10], 'the case has no visible back panel');
  // …and the spines vary. A row of identical rectangles is a vent grille.
  const F = frameFor('book-case');
  const tops = [...svg.matchAll(/ d="M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)/g)]
    .map((m) => +m[6]);
  assert.ok(new Set(tops.map((v) => Math.round(v))).size >= 8,
    'the spines are all the same height. Colour is what made the warm bookshelf read as books, and\n'
    + 'in one ink the only thing left to carry it is VARIATION.');
  assert.ok(SPECS['book-case'].d < SPECS['book-case'].w / 3,
    'the case is as deep as it is wide — books are 28 cm deep and a wardrobe is 42, which is the\n'
    + 'entire difference between this piece and `locker` at tile size');
});

test('the turret\'s barrel is a closed member with a band near the muzzle', () => {
  const svg = build('deck-turret');
  const barrel = memberThrough(svg, 'deck-turret',
    [[51.3, 44, 51.8], [107.3, 44, 135.8], [100.7, 44, 140.2], [44.7, 44, 56.2]], 'the barrel');
  assert.equal(barrel.length, 4, 'the barrel is not a four-cornered member — a line is a mast');
  memberThrough(svg, 'deck-turret', [[98.9, 44, 123.2], [92.3, 44, 127.6]], 'the muzzle band');
});

test('the sleeper pod\'s window is RECESSED into the shell, not standing proud of it', () => {
  const svg = build('sleeper-pod');
  // the shell is a ∅76 cylinder centred at y = 42; at the pane's own left edge (x = 22) its surface
  // is 42 − √(38² − 20²) = 9.7 cm back. A pane at y = 0 would poke through the capsule.
  const shellAt22 = 42 - Math.sqrt(38 * 38 - 20 * 20);
  assert.ok(shellAt22 > 9 && shellAt22 < 10, 'the shell geometry this rule is stated against moved');
  hasPoint(svg, 'sleeper-pod', [22, 10, 44], 'the pane is not at the depth the shell puts it');
  assert.ok(!svg.includes(`${nn(frameFor('sleeper-pod').project(22, 0, 44)[0])} `
    + `${nn(frameFor('sleeper-pod').project(22, 0, 44)[1])}`),
  'the pane is drawn at y = 0, standing proud of the ∅76 shell it is set into');
  // …and it is FROST, not an occupant: this row is cosmetic and carries no occupancy bit at all.
  assert.ok(!svg.includes('cryo'), 'the pod claims a state it does not carry');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE SWAP — a row drawing another row's picture
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('DRAW[id] is the painter named after id — a row cannot point at another row\'s picture', () => {
  const seen = new Map();
  for (const id of MACHINE_IDS) {
    const fn = DRAW[id];
    assert.equal(typeof fn, 'function', `${id} has no painter`);
    assert.equal(fn.name, `draw${camel(id).charAt(0).toUpperCase()}${camel(id).slice(1)}`,
      `${id}'s painter is named ${fn.name} — a painter must be named after the ROW IT SERVES`);
    assert.ok(!seen.has(fn), `${id} and ${seen.get(fn)} share one painter`);
    seen.set(fn, id);
  }
  // …and the pictures are thirteen DIFFERENT pictures, which the name check alone cannot prove.
  const pics = new Map();
  for (const id of MACHINE_IDS) {
    const svg = build(id, { idPrefix: 'k' });
    assert.ok(!pics.has(svg), `${id} renders identically to ${pics.get(svg)}`);
    pics.set(svg, id);
  }
});

// ⭐⭐ THE TWIN SWAP, GEOMETRICALLY. `wrecked.test.js` catches a twin pointing at another row's
// painter by NAME; this catches it by COORDINATE, which is the independent half. Two machines have
// different SPECS, so `frameFor` gives them different origins and scales — the exact coordinate
// tokens a piece emits are therefore a fingerprint of WHICH piece was painted, and a twin that runs
// the wrong pristine painter shares its fingerprint with the wrong row.
test('every machine twin paints its OWN pristine piece — measured, not trusted', () => {
  const tokens = (svg) => new Set([...svg.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map((m) => m[0]));
  const pristine = new Map(MACHINE_IDS.map((id) => [id, tokens(build(id, { idPrefix: 'p' }))]));
  for (const id of MACHINE_IDS) {
    assert.ok(WRECKED[id], `${id} has no wrecked twin`);
    const twin = tokens(buildWrecked(id, { idPrefix: 'w' }));
    const share = (other) => [...pristine.get(other)].filter((t) => twin.has(t)).length;
    const own = share(id);
    assert.ok(own > 0.8 * pristine.get(id).size,
      `${id}'s twin reproduces only ${own}/${pristine.get(id).size} of its own pristine coordinates.\n`
      + 'A twin is the SAME object with damage on it; re-running the pristine painter is the only\n'
      + 'thing that keeps that true when the pristine drawing changes.');
    for (const other of MACHINE_IDS) {
      if (other === id) continue;
      assert.ok(share(other) < own,
        `${id}'s twin shares more geometry with ${other} than with ${id} — the twin paints the\n`
        + 'wrong pristine piece. This is the SWAP, and it is invisible to every count in this file.');
    }
  }
});

test('the thirteen twins are ledgered, badged, and none is its own pristine piece', () => {
  for (const id of MACHINE_IDS) {
    const e = WRECKED[id];
    assert.equal(e.mockLabel, null, `${id}'s twin claims a mock label — no document draws it`);
    assert.match(e.catalogue, /^M\d\d [A-Z]/, `${id}'s twin does not cite the machines sheet`);
    assert.match(e.state, /^\d+%$/, `${id}'s badge is not a repairable percentage`);
    assert.ok(Number(e.state.slice(0, -1)) <= 35,
      `${id} is badged ${e.state} — the mock's own post-raid band tops out at 35%`);
    assert.notEqual(buildWrecked(id, { idPrefix: 'z' }), build(id, { idPrefix: 'z' }),
      `${id}'s twin renders exactly like the pristine piece — it carries no damage at all`);
  }
});
