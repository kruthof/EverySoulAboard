// THE TWELVE MATERIALS (client/src/items/paper-materials.js) — the paper/ink redraw of the six wall
// and six floor skins that stood in `client/src/items/structures.js`.
//
// WHAT THIS FILE IS FOR, in one sentence: a material is the most-worn art in the game (every wall
// slab and every floor tile of every room wears one) and the easiest to break invisibly, because a
// skin that has lost its scale, its ink or its identity emits a string that is exactly as
// well-formed as one that has not.
//
// ⚠️ THE HALF THIS FILE CANNOT DO, SAID FIRST — `fittings.test.js`'s rule, and it applies harder
// here. Every assertion below reads a STRING. A skin can satisfy all of them and still be
// unreadable once the floor plane has sheared it, or read as its neighbour, or drown a room in line
// work. The set is therefore ALSO photographed: `client/tools/paper-materials-sheet.mjs` draws all
// twelve flat, at palette-chip size, laid SHEARED through the shipping `place.cell`, and standing on
// the shipping oblique slab — and three of the twelve were changed because of what that page showed
// and nothing else (carpet's pile density, the grating's cross rods, hull-plating's weld bead; each
// is called out in its builder). A green suite here is necessary and never sufficient.
//
// ⚠️ AND WHAT IS WORTH TESTING IS NOT "DOES IT DRAW". `items.test.js` already asserts every registry
// row builds a balanced, deterministic, id-collision-free fragment, and it covers these twelve as
// ordinary rows. What it cannot see is the thing this package is FOR: DIMENSION. The warm swatches
// were 106 × 94 px cards with a 20-px dot pattern — the same size for a 2.4 m wall and a 1 m floor
// tile, at a pattern scale that meant nothing. So the subject here is the centimetre: that a plank
// is 20 cm, that a rivet pitch is 12.5, that a wall is 2.4 m of wall and a floor tile is one metre,
// and that the room's own seam still hands each skin the box that makes those true.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as PM from '../src/items/paper-materials.js';
import {
  CM, WALL_H_CM, TILE_CM, SPECS, SIZES, MATERIAL_IDS, BUILD, DRAW, paintMaterial, frameForSkin,
} from '../src/items/paper-materials.js';
import { ITEMS, ITEM_IDS, buildItem } from '../src/items/index.js';
import { INK, PAPER, ATTEND, TILE, r3, SKETCH_LEVEL, scene } from '../src/items/helpers.js';
import { amplitudeBound, penSteps } from '../src/render/sketch.js';
import { bodyExtent, outsideBox } from './sketch-geom.js';
import { W } from '../src/items/fittings.js';
import { PX_PER_CM, PAPER_FLAT } from '../src/render/oblique.js';
import {
  roomScene, scenePlacement, M_PER_TILE, ROOM_HEIGHT_M, ROOM_SCALE,
} from '../src/ui/room-model.js';
import { materialLayerSvg } from '../src/ui/roomzoom-view.js';
import { WALL_MATERIALS, FLOOR_MATERIALS, materialItemId } from '../src/ui/build-material-model.js';
// — lane/warm-purge — the twelve twins; every leg in section 7 drives `buildWrecked`.
import { buildWrecked } from '../src/items/wrecked.js';

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const WALLS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'wall');
const FLOORS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'floor');

/** The boxes the three shipping call sites really hand a skin (all three are pinned below). */
const WALL_BOX = { w: ROOM_SCALE * TILE_CM, h: ROOM_SCALE * ROOM_HEIGHT_M * 100 };
const FLOOR_BOX = { w: ROOM_SCALE * TILE_CM, h: ROOM_SCALE * TILE_CM };
const CHIP_BOX = { w: 26, h: 26 };

const boxFor = (id) => (SPECS[id].surface === 'wall' ? WALL_BOX : FLOOR_BOX);
// ⚠️ `build` IS THE RAW SKIN SINCE 2026-08-05 — the owner extended the `strong` sketch treatment to
// the materials ("we need to update ALL with the sketch style we defined"), and every measurement in
// this file reads emitted `<rect>`s and `M…L…` segments to recover a CENTIMETRE. A freehand stroke
// emits neither, so those readers return nothing and pass vacuously. The centimetres are asked of
// the geometry; the treated legs below restate the ones that are about what the player sees, and
// `sketch-adoption.test.js`'s displacement pin + collinearity leg bridge the two.
const build = (id, box) => buildItem(id, { ...(box || boxFor(id)), idPrefix: 'pm-' + id, sketch: false });
/** What SHIPS: the same skin with the treatment on it. */
const treated = (id, box) => buildItem(id, { ...(box || boxFor(id)), idPrefix: 'pm-' + id });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The geometry reader — everything below measures the EMITTED string, never a re-derivation
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `<defs>…</defs>` stripped: pattern interiors are not the body's own geometry. */
const bodyOf = (svg) => svg.replace(/<defs>[\s\S]*?<\/defs>/, '');

/** The `scale(k)` `helpers.item` wrapped the body in — the caller's box ÷ TILE. */
function scaleOf(svg) {
  const m = svg.match(/scale\((-?[\d.]+)\)/);
  assert.ok(m, 'the fragment carries no scale() — helpers.item did not wrap it');
  return +m[1];
}

/** Every `<rect>` as `{x,y,w,h,sw,ink}` in BODY px. */
function rects(svg) {
  return [...bodyOf(svg).matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"([^>]*)\/>/g)]
    .map((m) => ({
      x: +m[1], y: +m[2], w: +m[3], h: +m[4],
      sw: +(m[5].match(/stroke-width="([\d.]+)"/) || [0, 0])[1],
      ink: /stroke="#14120F"|fill="#14120F"/.test(m[5]),
      stroked: /stroke="#14120F"/.test(m[5]),
    }));
}

/** Every `<circle>` as `{cx,cy,r}` in BODY px. */
function circles(svg) {
  return [...bodyOf(svg).matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], r: +m[3] }));
}

/** Every straight `M x y L x y` run in a `<path>`, as `{x1,y1,x2,y2,sw}` in BODY px. */
function segments(svg) {
  const out = [];
  for (const p of bodyOf(svg).matchAll(/<path d="([^"]+)"([^>]*)\/>/g)) {
    const sw = +(p[2].match(/stroke-width="([\d.]+)"/) || [0, 0])[1];
    const nums = [...p[1].matchAll(/([MLC])((?:\s*-?[\d.]+)+)/g)];
    let cur = null;
    for (const cmd of nums) {
      const v = cmd[2].trim().split(/\s+/).map(Number);
      if (cmd[1] === 'M') { cur = [v[0], v[1]]; continue; }
      if (cmd[1] === 'C') { cur = [v[4], v[5]]; continue; }   // curves are not rules
      for (let i = 0; i + 1 < v.length; i += 2) {
        if (cur) out.push({ x1: cur[0], y1: cur[1], x2: v[i], y2: v[i + 1], sw });
        cur = [v[i], v[i + 1]];
      }
    }
  }
  return out;
}

/** The ink bounding box in BODY px — every rect, circle and segment together. */
function inkBox(svg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const put = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const r of rects(svg)) { put(r.x, r.y); put(r.x + r.w, r.y + r.h); }
  for (const c of circles(svg)) { put(c.cx - c.r, c.cy - c.r); put(c.cx + c.r, c.cy + c.r); }
  for (const s of segments(svg)) { put(s.x1, s.y1); put(s.x2, s.y2); }
  return { w: x1 - x0, h: y1 - y0, x0, y0 };
}

/**
 * The distinct positions of FULL-SPAN rules in a stroke-weight BAND, in cm. `axis` 'h' | 'v'.
 *
 * ⚠️ THE BAND IS NOT DECORATION AND IT WAS ADDED AFTER A WRONG READING. Measuring `hull-plating`
 * with a bare `sw >= W.mass` floor swept in the WELD BEAD as well as the strake seam — two families
 * 5.5 cm apart — and the modal gap came back 44.5 cm for a wall whose strakes are 50. A probe that
 * cannot say WHICH family it is measuring will agree with almost anything.
 */
function rulePositions(svg, axis, spanCm, minSw = W.fine, maxSw = Infinity) {
  const span = spanCm * CM;
  const vals = new Set();
  for (const s of segments(svg)) {
    if (s.sw < minSw - 0.01 || s.sw > maxSw + 0.01) continue;
    if (axis === 'h' && Math.abs(s.y1 - s.y2) < 0.01 && Math.abs(s.x2 - s.x1) >= span * 0.95) {
      vals.add(Math.round((s.y1 / CM) * 100) / 100);
    }
    if (axis === 'v' && Math.abs(s.x1 - s.x2) < 0.01 && Math.abs(s.y2 - s.y1) >= span * 0.95) {
      vals.add(Math.round((s.x1 / CM) * 100) / 100);
    }
  }
  return [...vals].sort((a, b) => a - b);
}

/** The MODAL gap between sorted positions, to 2 dp. */
/**
 * THE TREATED SKIN'S RULES, AS CHORDS.
 *
 * ⭐ THIS WORKS AT ALL BECAUSE OF A PROPERTY THE ADOPTION MEASURES AND PINS: `sketch()` moves a run's
 * ends ALONG its own axis and bows the curve ABOUT that axis, so the CHORD from a treated run's
 * first emitted point to its last lies on the ORIGINAL segment's line — worst case 0.0069 units
 * across the four standing catalogues (`sketch-adoption.test.js`, the collinearity leg). A rule at
 * y = Y therefore still reads y = Y after the treatment, and a PITCH — which is a difference of two
 * such positions — survives EXACTLY rather than within a tolerance. That is the honest restatement:
 * the amplitude tolerance the box guards needed is not needed here, and saying so is worth more than
 * adding one that would hide a real drift.
 *
 * ⚠️ WHAT DOES CHANGE IS THE WEIGHT FILTER. `rulePositions` selects a family by `stroke-width`, and
 * the treatment gains every weight through `pen()`. So the raw `[minSw, maxSw]` window is mapped
 * through `penSteps` and the treated window is the min/max of the images — restated, not widened.
 * The DOUBLED pass and the appended GROUND RULE are excluded by their own classes.
 */
function treatedChords(svg) {
  const out = [];
  for (const p of bodyOf(svg).matchAll(/<path ([^>]*)\/>/g)) {
    const tail = p[1];
    if (/class="pl-sk-2nd"|class="pl-sk-ground"/.test(tail)) continue;
    if (!/fill="none"/.test(tail)) continue;                  // the fill path is not a rule
    const d = (tail.match(/ ?d="([^"]+)"/) || [, ''])[1];
    const sw = +(tail.match(/stroke-width="([\d.]+)"/) || [0, 0])[1];
    const nums = [...d.matchAll(/-?[\d.]+/g)].map(Number);
    if (nums.length < 4) continue;
    out.push({
      x1: nums[0], y1: nums[1], x2: nums[nums.length - 2], y2: nums[nums.length - 1], sw,
    });
  }
  return out;
}

/**
 * `rulePositions`, asked of the treated chords, with the weight window mapped through the ramp.
 *
 * ⛔ AS A SET, NOT AS A RANGE, AND THE FIRST DRAFT GOT THIS WRONG IN THE PERMISSIVE DIRECTION. The
 * raw rule is "weights at or above `W.fine`"; mapping that to `[min(penSteps([1.1])), ∞)` gives a
 * floor of 0.34 — the DOUBLED pass over an interior hairline — which admits every stroke in the
 * skin, and the plank floor's 20 cm boards then measured 2.5 cm because the 2.5 cm butt marks were
 * in the population. Measured, by writing it. The window is therefore the exact IMAGE of the raw
 * skin's own rungs: take the weights the raw drawing actually uses, keep the ones inside the raw
 * window, and put them through `penSteps` — one closed set, no range to leak through.
 */
function treatedRulePositions(rawSvg, svg, axis, spanCm, minSw = W.fine, maxSw = Infinity) {
  const span = spanCm * CM;
  const rungs = [...new Set(segments(rawSvg).map((x) => x.sw))]
    .filter((r) => r >= minSw - 0.01 && r <= (maxSw === Infinity ? Infinity : maxSw + 0.01));
  const allowed = new Set(penSteps(SKETCH_LEVEL, rungs));
  const vals = new Set();
  for (const s of treatedChords(svg)) {
    if (!allowed.has(s.sw)) continue;
    if (axis === 'h' && Math.abs(s.y1 - s.y2) < 0.05 && Math.abs(s.x2 - s.x1) >= span * 0.9) {
      vals.add(Math.round((((s.y1 + s.y2) / 2) / CM) * 100) / 100);
    }
    if (axis === 'v' && Math.abs(s.x1 - s.x2) < 0.05 && Math.abs(s.y2 - s.y1) >= span * 0.9) {
      vals.add(Math.round((((s.x1 + s.x2) / 2) / CM) * 100) / 100);
    }
  }
  return [...vals].sort((a, b) => a - b);
}

function modalGap(vals) {
  const gaps = new Map();
  for (let i = 1; i < vals.length; i += 1) {
    const g = Math.round((vals[i] - vals[i - 1]) * 100) / 100;
    if (g <= 0.01) continue;
    gaps.set(g, (gaps.get(g) || 0) + 1);
  }
  let best = 0, n = 0;
  for (const [g, c] of gaps) if (c > n || (c === n && g > best)) { best = g; n = c; }
  return best;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE REGISTRY — twelve rows, replaced in place, nothing else touched
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * MEMBERSHIP, BOTH WAYS — `items.test.js`'s fittings shape, for the same reason: a material row that
 * quietly went back to a warm builder, and a NON-material row that quietly borrowed a skin, each
 * fail here and name themselves.
 *
 * ⭐ THIS IS ALSO THE PIN ON THE BUILD-REFERENCE STRATEGY. The package REPLACED the twelve rows in
 * place rather than adding twelve new ones, and the reason is in `wrecked.js`: every one of these
 * ids carries a wrecked twin and the twin set is a BIJECTION over the mock's seventy. Twelve new
 * rows would have to be ledgered out of that join and twelve old rows would keep drawing art the
 * game never reaches. The count assertions below are what make the claim checkable.
 */
test('exactly the twelve MATERIAL rows draw from items/paper-materials.js, and nothing else does', () => {
  const material = ITEM_IDS.filter((id) => ITEMS[id].kind === 'material');
  assert.deepEqual([...material].sort(), [...MATERIAL_IDS].sort(),
    'the registry\'s material class and this module\'s id list have diverged');
  assert.equal(MATERIAL_IDS.length, 12, 'six walls and six floors');
  for (const id of MATERIAL_IDS) {
    assert.equal(ITEMS[id].build, PM[camel(id)], `${id} does not draw from its own paper builder`);
    assert.equal(ITEMS[id].build, BUILD[id], `${id}'s BUILD map disagrees with its export`);
    assert.equal(ITEMS[id].size, SIZES[id], 'the size hint is the DERIVED one, not a transcription');
  }
  const builders = new Set(MATERIAL_IDS.map((id) => PM[camel(id)]));
  const strays = ITEM_IDS.filter((id) => !MATERIAL_IDS.includes(id) && builders.has(ITEMS[id].build));
  assert.deepEqual(strays, [], 'a non-material row borrows a material builder');
});

/**
 * THE SWAP — a row pointing at ANOTHER row's drawing. `wrecked.test.js` names this shape and records
 * that it is invisible to every other guard in this repo: the fragment is well-formed, deterministic
 * and correctly classified, and the player sees the wrong wall. `BUILD` is checked above; this is
 * the complement, that no two rows share a function at all.
 */
test('no two material rows share a builder', () => {
  const seen = new Map();
  for (const id of MATERIAL_IDS) {
    const f = ITEMS[id].build;
    assert.ok(!seen.has(f), `${id} and ${seen.get(f)} draw the same picture`);
    seen.set(f, id);
  }
  assert.equal(seen.size, 12);
});

/**
 * The picker's own two lists still resolve to real registry rows. `build-material-model.js` maps a
 * sim material BYTE to an itemId, and it is the only path from a player's click to a skin — a
 * replaced builder that changed an id would break the palette silently, because `materialItemId`
 * falls back to the tool's default rather than throwing.
 */
test('every wall/floor material BYTE still resolves to a paper skin', () => {
  for (const m of WALL_MATERIALS) {
    assert.equal(materialItemId('wall', m.mat), m.id);
    assert.equal(SPECS[m.id].surface, 'wall', `${m.id} is on the wall picker but is not a wall`);
  }
  for (const m of FLOOR_MATERIALS) {
    assert.equal(materialItemId('floor', m.mat), m.id);
    assert.equal(SPECS[m.id].surface, 'floor', `${m.id} is on the floor picker but is not a floor`);
  }
  assert.equal(WALL_MATERIALS.length + FLOOR_MATERIALS.length, 12);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE CENTIMETRE — the whole point of the package
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE DUPLICATED LITERALS, PINNED TO THEIR SOURCES. `items/*` may not import from `ui/*`, so
 * `WALL_H_CM` and `TILE_CM` are copies of `room-model.js`'s `ROOM_HEIGHT_M` and `M_PER_TILE`. A
 * duplicated literal nothing compares is how two modules come to disagree about a number —
 * `oblique.test.js` gives `INK`/`PAPER`/`ATTEND` exactly this treatment.
 *
 * MUTATION: `WALL_H_CM = 240 → 250` ⇒ RED here, and the wall would be drawn 10 cm taller than the
 * slab it is laid on.
 */
test('the ceiling, the tile and the centimetre are the SURFACE\'s numbers, not this module\'s', () => {
  assert.equal(WALL_H_CM, ROOM_HEIGHT_M * 100, 'the wall skins are drawn to a ceiling the room does not have');
  assert.equal(TILE_CM, M_PER_TILE * 100, 'a floor tile is one sim tile, which is one metre');
  assert.equal(CM, TILE / 100, 'one metre must be TILE across — the module\'s whole dimensional claim');
  assert.equal(CM * TILE_CM, TILE, 'and a floor tile therefore fills the normalisation box exactly');
});

/**
 * ⭐⭐ THE OUTCOME TEST: THE BOX ASPECT IS THE CALLER'S STATEMENT OF HOW MANY METRES IT WANTS.
 *
 * Three call sites, three answers, all read out of the emitted string rather than asserted about the
 * source. `helpers.item` scales the body by `min(w,h) / TILE`, so the DRAWN EXTENT IN CENTIMETRES is
 * `box / (scale · CM)` — and that is the number this package exists to make true:
 *   · the Room Zoom's wall slab  (95 × 228 px) ⇒ 100 × 240 cm
 *   · the Room Zoom's floor tile (95 ×  95 px) ⇒ 100 × 100 cm
 *   · the palette chip           (26 ×  26 px) ⇒ a 100 × 100 cm CROP, at the SAME cm rule
 *
 * MUTATION: `CM = TILE/100 → TILE/200` ⇒ RED on every leg (every skin claims 200 cm of run).
 * MUTATION: drop the aspect derivation and draw a fixed `TILE × TILE` body ⇒ RED on the wall leg
 * (a 2.4 m wall drawn as a square, which is the warm set's own defect).
 */
test('a skin draws the centimetres its BOX ASPECT asks for — wall 100×240, floor 100×100, chip a 100×100 crop', () => {
  for (const id of MATERIAL_IDS) {
    const sp = SPECS[id];
    const box = boxFor(id);
    const svg = build(id, box);
    const k = scaleOf(svg);
    // `scene.render` emits `r3(k)`, so the pin is against the ROUNDED value — read out of the
    // string, not recomputed — and the centimetre arithmetic below carries that 3-dp slack (0.1 cm
    // on a metre), which is two orders of magnitude finer than any error worth catching.
    assert.equal(k, r3(Math.min(box.w, box.h) / TILE), `${id}: helpers.item did not scale by min(w,h)/TILE`);
    const drawnW = box.w / (k * CM);
    const drawnH = box.h / (k * CM);
    assert.ok(Math.abs(drawnW - sp.w) < 0.5, `${id} draws ${drawnW.toFixed(2)} cm across, not ${sp.w}`);
    assert.ok(Math.abs(drawnH - sp.h) < 0.5, `${id} draws ${drawnH.toFixed(2)} cm up, not ${sp.h}`);
  }
  // and the chip is a SQUARE METRE at the same rule, for a wall as much as for a floor
  for (const id of MATERIAL_IDS) {
    const svg = build(id, CHIP_BOX);
    const k = scaleOf(svg);
    assert.ok(Math.abs(CHIP_BOX.w / (k * CM) - TILE_CM) < 0.5,
      `${id}'s palette chip is not a one-metre crop — it is ${(CHIP_BOX.w / (k * CM)).toFixed(1)} cm`);
  }
});

/**
 * ⭐ THE ABSOLUTE SCALE FLOOR — the SEVENTH TRAP SHAPE, applied on purpose. A suite of ratios cannot
 * see a 2× scale error: halve `CM` and every proportion in this file is still exactly right. So each
 * skin declares ONE feature pitch IN CENTIMETRES and the pitch is measured back out of the emitted
 * geometry, in cm, against an absolute number.
 *
 * ⚠️ EACH PROBE NAMES WHAT IT MEASURES, because "the modal gap between full-span rules" is not the
 * same question for a plank floor and a riveted bulkhead, and a probe that measured the wrong family
 * would agree with anything.
 *
 * MUTATION: `woodPlankFloor`'s `planks = round(hCm/20) → round(hCm/25)` ⇒ RED naming 25 ≠ 20.
 * MUTATION: `steelBulkhead`'s rivet step `12.5 → 10` ⇒ RED naming the rivet pitch.
 */
const PITCH = Object.freeze({
  'steel-bulkhead': { what: 'plate courses', probe: 'h', cm: 60, span: TILE_CM, sw: W.mid },
  'timber-lined-wall': { what: '20 cm boards', probe: 'h', cm: 20, span: TILE_CM },
  'blast-wall': { what: 'the hazard band rules', probe: 'h', cm: 25, span: TILE_CM, sw: W.heavy },
  'glass-partition': { what: 'the glazing module', probe: 'v', cm: TILE_CM / 3, span: WALL_H_CM, sw: W.mid },
  'insulated-wall': { what: '60 cm batt courses', probe: 'battRows', cm: 60 },
  'hull-plating': { what: '50 cm strakes', probe: 'v', cm: 50, span: WALL_H_CM, sw: W.mass, swMax: W.mass },
  'steel-tan-floor': { what: 'ONE 1 m deck plate', probe: 'plate', cm: TILE_CM },
  'wood-plank-floor': { what: '20 cm boards', probe: 'h', cm: 20, span: TILE_CM },
  'grow-matting': { what: 'the 25 cm weave cell', probe: 'pattern', cm: 25 },
  'cream-tile-floor': { what: '25 cm tiles', probe: 'h', cm: 25, span: TILE_CM },
  'metal-grating': { what: 'the 6.25 cm bar pitch', probe: 'pattern', cm: 6.25 },
  'carpet-floor': { what: 'the 12.5 cm pile cell', probe: 'pattern', cm: 12.5 },
});

test('every skin\'s feature pitch is the CENTIMETRES it claims — measured off the emitted geometry', () => {
  for (const id of MATERIAL_IDS) {
    const p = PITCH[id];
    const svg = build(id);
    let got;
    if (p.probe === 'h' || p.probe === 'v') {
      got = modalGap(rulePositions(svg, p.probe, p.span, p.sw, p.swMax));
    } else if (p.probe === 'pattern') {
      const m = svg.match(/<pattern id="[^"]+" width="([\d.]+)"/);
      assert.ok(m, `${id} declares a pattern pitch but emits no <pattern>`);
      got = Math.round((+m[1] / CM) * 100) / 100;
    } else if (p.probe === 'battRows') {
      const ys = [...new Set(rects(svg).filter((r) => r.w > 30 * CM && r.h > 30 * CM)
        .map((r) => Math.round((r.y / CM) * 100) / 100))].sort((a, b) => a - b);
      got = modalGap(ys);
    } else {                                    // 'plate' — a single deck plate, one to a tile
      assert.equal(circles(svg).length, 4, 'the deck plate has lost its four countersunk screws');
      const wide = rects(svg).map((r) => Math.round((r.w / CM) * 100) / 100);
      got = Math.max(...wide);
    }
    assert.ok(Math.abs(got - p.cm) < 0.05,
      `${id}: ${p.what} measure ${got} cm, and the piece claims ${p.cm} cm. `
      + 'A pattern whose pitch is a fraction of a swatch instead of a length is exactly what this '
      + 'package replaced.');
  }
});

// ⭐⭐ THE SAME PITCHES, MEASURED ON WHAT SHIPS — and the headline is that they survive EXACTLY.
//
//   OLD RULE: every ruled family's modal gap is the centimetres its row of `PITCH` claims, ±0.05.
//   NEW RULE: the same, measured off the TREATED chords, with the weight window mapped through
//             `penSteps` and the two treatment-only marks (the doubled pass, the ground rule)
//             excluded by their classes. STILL ±0.05, NOT the amplitude — because the treatment
//             moves a run along its own axis and bows it about that axis, so a rule at y = Y still
//             has its chord on y = Y. Widening this to the amplitude would have hidden a real drift
//             of up to 6.78 units (5.3 cm at the room's scale) in a measurement whose whole subject
//             is centimetres.
//
// ⛔ THE PATTERN-PITCH SKINS ARE THE OTHER HALF, AND THEY ARE THE DEFECT THIS EXTENSION FOUND. The
// treatment's `hatch` knob replaced the interior of EVERY `<pattern>` with three jittered rules and
// tripled its cell. Four material skins carry a pattern that is not a hatch — the matting's woven
// lattice, the grating's bar, the carpet's pile, the blast wall's hazard block — and all four would
// have lost their art AND their pitch. `sketch.js`'s module-private `isKitHatch` now recognises the
// kit's hatch by its own shape (a square cell, a ground rect, one `M0 0 L0 <period>` rule);
// everything else passes through. ⚠️ It is NOT exported and this suite does not call it — what is
// pinned is the behaviour on BOTH sides of it, which is the pair of legs below.
// This leg is what says so, in centimetres.
test('the treated skin keeps every pitch it claims — EXACTLY, not within the amplitude', () => {
  for (const id of MATERIAL_IDS) {
    const p = PITCH[id];
    const svg = treated(id);
    let got;
    if (p.probe === 'h' || p.probe === 'v') {
      got = modalGap(treatedRulePositions(build(id), svg, p.probe, p.span, p.sw, p.swMax));
    } else if (p.probe === 'pattern') {
      const m = svg.match(/<pattern id="[^"]+" width="([\d.]+)"/);
      assert.ok(m, `${id}: the treated skin emits no <pattern> — the treatment ate its field`);
      got = Math.round((+m[1] / CM) * 100) / 100;
    } else if (p.probe === 'battRows') {
      // ⭐ THE BATT COURSES ARE FILL-ONLY `<rect fill="url(#…)">`, AND THE TREATMENT LEAVES THEM
      // BYTE-IDENTICAL — `drawShape` returns null for an element with no pen, because there is no
      // stroke to make freehand. So the RAW reader is the correct reader here, and pointing it at
      // the treated fragment is the statement that they really did come through untouched.
      const ys = [...new Set(rects(svg).filter((r) => r.w > 30 * CM && r.h > 30 * CM)
        .map((r) => Math.round((r.y / CM) * 100) / 100))].sort((a, b) => a - b);
      got = modalGap(ys);
      assert.ok(ys.length >= 3, `${id}: the treated skin has ${ys.length} batt courses left`);
    } else {
      // 'plate' — ONE deck plate to the tile. Its border IS stroked, so it is treated: measured as
      // the widest chord, against the amplitude, because an overshot corner really does run past
      // the plate's own edge and that is the one place the tolerance belongs.
      const spans = treatedChords(svg).map((c) => Math.abs(c.x2 - c.x1) / CM);
      got = Math.max(...spans);
      assert.ok(Math.abs(got - p.cm) <= amplitudeBound(SKETCH_LEVEL) / CM + 0.05,
        `${id}: the treated deck plate spans ${got.toFixed(2)} cm against ${p.cm} cm`);
      got = p.cm;
    }
    assert.ok(Math.abs(got - p.cm) < 0.05,
      `${id}: ${p.what} measure ${got} cm on the TREATED skin against the ${p.cm} cm it claims.\n`
      + 'The treatment is a PEN. It may wobble a rule; it may not move it, and it may certainly not\n'
      + 'change how far apart two of them are — that is a centimetre, and centimetres are the whole\n'
      + 'reason this module exists.');
  }
});

/**
 * A FLOOR PITCH MUST DIVIDE THE METRE. Each floor tile is drawn independently, so a pitch that does
 * not divide 100 cm leaves a partial course at the tile edge and every seam in the room reads as a
 * defect. This is not a restatement of the table above: it is the RULE the table has to obey, and it
 * is the one a later lane editing a single pitch would break.
 */
test('every FLOOR pitch divides one metre exactly', () => {
  for (const id of FLOORS) {
    const p = PITCH[id].cm;
    const per = TILE_CM / p;
    assert.ok(Math.abs(per - Math.round(per)) < 1e-9,
      `${id}: ${p} cm does not divide 100 — the tile would break mid-course at its own edge`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · INK — a skin that draws nothing, or draws in paper, is broken in a way nothing else sees
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NO INVISIBLE INK, and no skin that sits in the middle of its tile.
 *
 * TWO HALVES, and the second is the one the warm set failed. Those swatches drew a 106 × 94 rounded
 * card inside a 128 box — so a floor skin covered 83 % of its tile across and 73 % up, and every
 * laid floor showed a grid of the room's own paper between the tiles. A skin is a SURFACE: it must
 * reach its own edges.
 *
 * MUTATION: draw the ground at `106 × 94` instead of the full box ⇒ RED on the coverage leg.
 * MUTATION: make a skin's stroke `PAPER` ⇒ RED on the ink leg (it emits shapes and shows nothing).
 */
test('every skin puts real INK on its tile, edge to edge', () => {
  for (const id of MATERIAL_IDS) {
    const svg = build(id);
    const sp = SPECS[id];
    const box = boxFor(id);
    const k = scaleOf(svg);
    const bw = box.w / k, bh = box.h / k;      // the body box, in body px

    assert.ok(svg.includes(INK), `${id} contains no ink at all`);
    assert.ok(!svg.includes(ATTEND),
      `${id} uses the OXBLOOD accent. It is attention, faults and queued orders; a wall is never an `
      + 'alert and a floor is never an order.');

    const ib = inkBox(svg);
    assert.ok(ib.w / bw >= 0.92 && ib.h / bh >= 0.92,
      `${id} covers ${(100 * ib.w / bw).toFixed(0)} × ${(100 * ib.h / bh).toFixed(0)} % of its tile. `
      + 'A skin that does not reach its own edges leaves the room\'s paper showing between tiles — '
      + 'which is what the 106 x 94 warm swatches did on every floor in the game.');

    // …and the drawing is more than the ground: at least one PATTERN or a dozen marks.
    const marks = rects(svg).length + circles(svg).length + segments(svg).length;
    const pats = (svg.match(/<pattern /g) || []).length;
    assert.ok(pats > 0 || marks >= 8,
      `${id} draws ${marks} marks and no pattern — that is a blank tile with a border on it`);
    assert.ok(sp.surface === 'wall' || sp.surface === 'floor');
  }
});

// ⭐ THE SAME TWO RULES ON WHAT SHIPS. A skin that stopped reaching its own edges under the
// treatment would show the room's paper between every pair of tiles — the exact defect the warm
// swatches had — and a skin that bought a colour would break the charter's closure silently.
//   OLD RULE: the ink box covers ≥ 92% of the body box; ink present; no oxblood.
//   NEW RULE: the same, on the treated skin, with the coverage floor UNCHANGED (the treatment can
//             only add reach — overshoot runs PAST an edge, never short of it) and the box ceiling
//             given the amplitude, since an overshot corner legitimately leaves the tile.
test('the treated skin still reaches its own edges, in the same three colours', () => {
  const AMP = amplitudeBound(SKETCH_LEVEL);
  for (const id of MATERIAL_IDS) {
    const box = boxFor(id);
    const svg = treated(id);
    const k = scaleOf(svg);
    const bw = box.w / k, bh = box.h / k;
    assert.ok(svg.includes(INK), `${id}: the treated skin contains no ink at all`);
    assert.ok(!svg.includes(ATTEND), `${id}: the treated skin spends the OXBLOOD accent`);
    const bb = bodyExtent(svg).bb;
    const cov = { w: (bb[2] - bb[0]) / bw, h: (bb[3] - bb[1]) / bh };
    assert.ok(cov.w >= 0.92 && cov.h >= 0.92,
      `${id}: the TREATED skin covers ${(100 * cov.w).toFixed(0)} × ${(100 * cov.h).toFixed(0)} % of `
      + 'its tile — the room\'s paper would show between tiles');
    const over = outsideBox(svg, { x: bw / 2 + AMP, y: bh / 2 + AMP });
    assert.deepEqual(over, [], `${id}: the treated skin leaves its own tile by more than the `
      + `declared amplitude ${AMP.toFixed(2)}: ${over.slice(0, 3).join(' ')}`);
  }
});

// ⭐⭐ THE FOUR NON-HATCH PATTERN FIELDS SURVIVE — the defect this extension found, pinned.
//
// `sketch()`'s `hatch` knob rewrote the interior of EVERY `<pattern>` it met: paper ground, three
// jittered rules, cell tripled. That is right for the kit's `#fh` and it would have DELETED the
// matting's woven lattice, the grating's bar and edge rule, the carpet's eighteen pile ticks and
// the blast wall's hazard block, replacing four identifying fields with one generic hatch at three
// times the spacing. `sketch.js`'s private `isKitHatch` recognises the kit's hatch by its own shape.
test('a material\'s own pattern field is NOT the kit hatch, and the treatment leaves it alone', () => {
  const FIELDS = ['blast-wall', 'grow-matting', 'metal-grating', 'carpet-floor'];
  for (const id of FIELDS) {
    const rawPat = /<pattern [\s\S]*?<\/pattern>/.exec(build(id));
    const trePat = /<pattern [\s\S]*?<\/pattern>/.exec(treated(id));
    assert.ok(rawPat && trePat, `${id} lost its pattern entirely`);
    assert.equal(trePat[0], rawPat[0],
      `${id}: the treatment rewrote a material's own pattern field. That field is the piece's\n`
      + 'identity and its pitch is a CENTIMETRE — see this module\'s PITCH table.');
  }
  // …and the one skin that DOES carry the kit's hatch is loosened, or the rule above is a ban.
  const insulRaw = /<pattern [\s\S]*?<\/pattern>/.exec(build('insulated-wall'))[0];
  const insulTre = /<pattern [\s\S]*?<\/pattern>/.exec(treated('insulated-wall'))[0];
  assert.notEqual(insulTre, insulRaw,
    'the insulated wall carries the KIT hatch (a square cell, a ground rect, one M0 0 L0 rule) and\n'
    + 'the treatment did not loosen it — `sketch.js`\'s `isKitHatch` has stopped recognising the thing it is for');
  // three periods wide, one period high — the loosened cell's own rule, at the skin's own scale
  const cell = /<pattern id="[^"]+" width="([\d.]+)" height="([\d.]+)"/.exec(insulTre);
  assert.ok(Math.abs(+cell[1] - 3 * +cell[2]) < 0.05,
    `the loosened kit cell is ${cell[1]} × ${cell[2]} — it must be three of its own periods wide and`
    + ' one high, or the hatch spacing has moved rather than its metronome being broken');
  assert.match(insulTre, /patternTransform="rotate\(45\)"/, 'the loosened hatch lost the kit angle');
});

/**
 * THE HARD PAIRS, STATED AS THE THING THAT SEPARATES THEM.
 *
 * `glass-partition` vs `insulated-wall`, and `grow-matting` vs `carpet-floor`, are the two pairs a
 * player is most likely to confuse: each pair is "a frame with panels" / "a woven textile". The
 * separation is STRUCTURAL and each half is checkable — glass shows the paper through its panes and
 * insulation shows the `fh` hatch; matting is an open lattice with no border and carpet is a closed
 * pile field inside one.
 *
 * ⚠️ HOLE-vs-LIMIT: each leg asserts the feature is present on ONE piece AND absent on the other.
 * "Insulation is hatched" alone is satisfiable by hatching everything.
 */
test('the two hard pairs are separated by a feature each half has and the other does not', () => {
  const glass = build('glass-partition');
  const insul = build('insulated-wall');
  assert.ok(!/<pattern /.test(glass),
    'glass-partition has grown a fill. Its whole tell is that you can SEE THROUGH it — a pane with a '
    + 'texture in it is insulated-wall wearing mullions.');
  assert.ok(/<pattern /.test(insul) && /rotate\(45\)/.test(insul),
    'insulated-wall has lost the fh hatch, which is the one mark that says "there is material in '
    + 'this panel" and the only thing that separates it from glass at a glance');
  assert.ok(/stroke-dasharray/.test(insul), 'insulated-wall has lost its stitched batt seam');
  assert.ok(!/stroke-dasharray/.test(glass), 'glass-partition has grown a dashed seam — that is the batt mark');

  const mat = build('grow-matting');
  const rug = build('carpet-floor');
  // the border: an INK-STROKED rect inset from the tile on every side and still most of it wide.
  // Carpet has two; matting must have none (its `edge()` is the tile's own perimeter, not a border).
  const bw = FLOOR_BOX.w / scaleOf(rug);
  const inset = (svg) => rects(svg).filter((r) => r.stroked
    && r.x > -0.48 * bw && r.w > 0.4 * bw && r.w < 0.96 * bw && r.h > 0.4 * bw && r.h < 0.96 * bw).length;
  assert.ok(inset(rug) >= 2,
    'carpet-floor has lost its border. The border is the half of the rug identity that survives a '
    + 'palette with no second colour, and it is what separates carpet from grow-matting.');
  assert.equal(inset(mat), 0,
    'grow-matting has grown a border and is now carpet with a coarser weave');
  assert.ok(/<pattern /.test(mat), 'grow-matting has lost its weave');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE SHEAR — a floor skin is laid through matrix(1 0 0.4 −0.6 …) and must survive it
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The shipping cell matrix for tile (0,0) of a room — from `scenePlacement`, never re-derived. */
function cellMatrix() {
  const focus = { deck: 0, rx: 0, ry: 0, rw: 3, rh: 3, anchor: 'x' };
  const scene = roomScene(focus);
  const unit = scene.s * 100 * M_PER_TILE;
  const m = scenePlacement(scene, focus, unit).cell(1, 1).match(/matrix\(([^)]+)\)/);
  const [a, b, c, d, e, f] = m[1].trim().split(/\s+/).map(Number);
  return { a, b, c, d, e, f, unit };
}

/** Apply `matrix(a b c d e f)` ∘ `translate(box/2) scale(k)` to a body point. */
const through = (M, k, box, [x, y]) => {
  const px = box.w / 2 + k * x;
  const py = box.h / 2 + k * y;
  return [M.a * px + M.c * py + M.e, M.b * px + M.d * py + M.f];
};

const len = ([x1, y1], [x2, y2]) => Math.hypot(x2 - x1, y2 - y1);

/**
 * ⭐⭐ SHEAR SURVIVAL, MEASURED THROUGH THE REAL MATRIX.
 *
 * `room-model.js`'s own header warns that a floor skin is laid through `place.cell` and that
 * anything drawn in it must survive an affine shear. Three claims, each of which a real change could
 * break while leaving every other assertion in this repo green:
 *
 *   1. NOTHING COLLAPSES. The matrix is non-singular (det −0.6), so this cannot fail by geometry —
 *      but it CAN fail by a skin whose marks are so short that 0.6 of them is sub-pixel. Every mark
 *      of ≥ 2 cm must still be ≥ 1 screen px after the transform.
 *   2. THE INK STILL COVERS THE TILE. The transformed ink box must reach the transformed tile box.
 *   3. A DIRECTIONAL SKIN STILL READS AS A DIRECTION. `wood-plank-floor` draws board courses one way
 *      and butt joints the other; a shear that put them on the same line would turn a laid floor
 *      into stripes. The two families are measured AFTER the transform and must stay ≥ 20° apart.
 *
 * MUTATION: draw the butt joints horizontally (along the courses) ⇒ RED on leg 3 at 0°.
 * MUTATION: shrink every floor mark below 2 cm ⇒ RED on leg 1.
 */
test('every FLOOR skin survives being laid through the room\'s own cell matrix', () => {
  const M = cellMatrix();
  const box = { w: M.unit, h: M.unit };
  assert.ok(Math.abs(M.a * M.d - M.b * M.c) > 0.1,
    'the cell matrix has gone singular — this whole test would pass vacuously');

  for (const id of FLOORS) {
    const svg = build(id, box);
    const k = scaleOf(svg);
    const segs = segments(svg);
    const pats = (svg.match(/<pattern /g) || []).length;
    assert.ok(segs.length + rects(svg).length >= 4 || pats > 0,
      `${id}: too little geometry to say anything`);

    // 1 — nothing of substance collapses
    for (const s of segs) {
      const l0 = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / CM;      // cm
      if (l0 < 2) continue;
      const l1 = len(through(M, k, box, [s.x1, s.y1]), through(M, k, box, [s.x2, s.y2]));
      assert.ok(l1 >= 1,
        `${id}: a ${l0.toFixed(1)} cm mark is ${l1.toFixed(2)} px long once the floor plane has `
        + 'sheared it — that is ink the player cannot see');
    }

    // 2 — the ink still reaches the tile
    const ib = inkBox(svg);
    const corners = [[ib.x0, ib.y0], [ib.x0 + ib.w, ib.y0], [ib.x0, ib.y0 + ib.h], [ib.x0 + ib.w, ib.y0 + ib.h]]
      .map((p) => through(M, k, box, p));
    const tile = [[-box.w / 2 / k, -box.h / 2 / k], [box.w / 2 / k, -box.h / 2 / k],
      [-box.w / 2 / k, box.h / 2 / k], [box.w / 2 / k, box.h / 2 / k]].map((p) => through(M, k, box, p));
    const span = (pts, i) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]));
    assert.ok(span(corners, 0) / span(tile, 0) >= 0.92 && span(corners, 1) / span(tile, 1) >= 0.92,
      `${id}: the sheared ink covers ${(100 * span(corners, 0) / span(tile, 0)).toFixed(0)} x `
      + `${(100 * span(corners, 1) / span(tile, 1)).toFixed(0)} % of the tile parallelogram`);
  }

  // 3 — the plank floor keeps two readable directions
  const svg = build('wood-plank-floor', box);
  const k = scaleOf(svg);
  const dir = (s) => {
    const a = through(M, k, box, [s.x1, s.y1]);
    const b = through(M, k, box, [s.x2, s.y2]);
    return ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 180) % 180;
  };
  // ⚠️ THE BUTT FILTER IS BY WEIGHT AND LENGTH, NOT BY DIRECTION, and that is the difference between
  // a leg that can see the collapse and one that only notices the butts disappearing. Selecting them
  // as "the vertical segments" makes the angle assertion unreachable: any mutation that turns a butt
  // horizontal removes it from the population and the NON-VACUITY guard fires instead — a red for the
  // right file and the wrong reason. `W.mid` is the plank floor's heaviest stroke and only the butts
  // carry it, so the family is picked out by what it IS.
  const courses = segments(svg).filter((s) => Math.abs(s.y1 - s.y2) < 0.01 && Math.abs(s.x2 - s.x1) > 0.9 * TILE_CM * CM);
  const butts = segments(svg).filter((s) => {
    const l = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / CM;
    return s.sw >= W.mid - 0.01 && l >= 8 && l <= 30;
  });
  assert.ok(courses.length >= 3 && butts.length >= 4,
    `the plank floor no longer draws both families (${courses.length} courses, ${butts.length} butts) `
    + '— this leg cannot see the collapse it exists for');
  const gap = Math.abs(dir(courses[0]) - dir(butts[0]));
  assert.ok(Math.min(gap, 180 - gap) >= 20,
    `the board courses and the butt joints land ${Math.min(gap, 180 - gap).toFixed(1)}° apart once `
    + 'sheared. Below 20° a laid floor reads as stripes and the boards stop being boards.');
});

// ⭐⭐ THE SHEAR IS THE MATERIALS' OWN RISK AND IT IS ANSWERED BY RENDERING, NOT BY REASONING.
//
// ⛔ WHERE THE TREATMENT APPLIES IN THE FLOOR PATH, SAID PRECISELY, because it is the question that
// decides whether this works at all. `materialLayerSvg` builds the skin through `buildItem` and THEN
// wraps it in `place.cell(tx, ty)` — an affine shear into the floor parallelogram. The treatment
// runs inside `item()`, so the jitter is authored in the SKIN'S OWN SPACE and the shear carries it
// along with everything else. That is the correct order and the only one that is correct: a hand
// applied after the shear would be drawn in SCREEN space, so a floor's wobble would run at the same
// angle everywhere in the room instead of lying on the floor plane, and it would not foreshorten
// with depth. Verified by rendering — `client/tools/sketch-materials-sheet.mjs` draws every skin
// flat AND through this same matrix, and that page is the receipt.
//
//   OLD RULE: no mark longer than 2 cm collapses below 1 px once sheared; the ink still covers 92%
//             of the parallelogram; the plank floor's two families stay ≥ 20° apart.
//   NEW RULE: the same three, measured on the TREATED chords. The angle floor is UNCHANGED — the
//             collinearity property means a treated chord runs along its raw segment, so shearing it
//             cannot move the two families relative to each other.
test('every FLOOR skin survives the shear WITH the treatment on it — measured after the matrix', () => {
  const M = cellMatrix();
  const box = { w: M.unit, h: M.unit };
  for (const id of FLOORS) {
    const svg = treated(id, box);
    const k = scaleOf(svg);
    const chords = treatedChords(svg);
    assert.ok(chords.length >= 4 || /<pattern /.test(svg), `${id}: too little treated geometry`);
    // 1 — nothing of substance collapses
    let collapsed = 0;
    for (const c of chords) {
      const l0 = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) / CM;
      if (l0 < 2) continue;
      const l1 = len(through(M, k, box, [c.x1, c.y1]), through(M, k, box, [c.x2, c.y2]));
      if (l1 < 1) collapsed += 1;
      assert.ok(l1 >= 1,
        `${id}: a ${l0.toFixed(1)} cm TREATED mark is ${l1.toFixed(2)} px long once the floor plane `
        + 'has sheared it — that is ink the player cannot see');
    }
    assert.equal(collapsed, 0);
    // 2 — the ink still reaches the tile after the shear
    const bb = bodyExtent(svg).bb;
    const corners = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]
      .map((p) => through(M, k, box, p));
    const tile = [[-box.w / 2 / k, -box.h / 2 / k], [box.w / 2 / k, -box.h / 2 / k],
      [-box.w / 2 / k, box.h / 2 / k], [box.w / 2 / k, box.h / 2 / k]].map((p) => through(M, k, box, p));
    const span = (pts, i) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]));
    assert.ok(span(corners, 0) / span(tile, 0) >= 0.92 && span(corners, 1) / span(tile, 1) >= 0.92,
      `${id}: the sheared TREATED ink covers ${(100 * span(corners, 0) / span(tile, 0)).toFixed(0)} × `
      + `${(100 * span(corners, 1) / span(tile, 1)).toFixed(0)} % of the tile parallelogram`);
  }
  // 3 — the plank floor still reads as boards rather than as stripes
  const svg = treated('wood-plank-floor', box);
  const k = scaleOf(svg);
  const dirOf = (c) => {
    const a = through(M, k, box, [c.x1, c.y1]);
    const b = through(M, k, box, [c.x2, c.y2]);
    return ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 180) % 180;
  };
  const rawRungs = [...new Set(segments(build('wood-plank-floor', box)).map((x) => x.sw))];
  const mid = new Set(penSteps(SKETCH_LEVEL, rawRungs.filter((r) => r >= W.mid - 0.01)));
  const chords = treatedChords(svg);
  const courses = chords.filter((c) => Math.abs(c.y1 - c.y2) < 0.05
    && Math.abs(c.x2 - c.x1) > 0.9 * TILE_CM * CM);
  const butts = chords.filter((c) => {
    const l = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) / CM;
    return mid.has(c.sw) && l >= 8 && l <= 30;
  });
  assert.ok(courses.length >= 3 && butts.length >= 4,
    `the TREATED plank floor no longer draws both families (${courses.length} courses, `
    + `${butts.length} butts) — this leg cannot see the collapse it exists for`);
  const g2 = Math.abs(dirOf(courses[0]) - dirOf(butts[0]));
  assert.ok(Math.min(g2, 180 - g2) >= 20,
    `TREATED: the board courses and the butt joints land ${Math.min(g2, 180 - g2).toFixed(1)}° apart `
    + 'once sheared. Below 20° a laid floor reads as stripes.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE SEAM — what the Room Zoom actually hands each skin
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FOCUS = Object.freeze({ deck: 0, rx: 0, ry: 0, rw: 5, rh: 3, anchor: 'r0' });

function layer(tiles) {
  const scene = roomScene(FOCUS);
  const unit = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, FOCUS, unit);
  return { svg: materialLayerSvg(tiles, place, FOCUS), place, scene, unit };
}

/**
 * ⭐⭐ THE WALL SKIN IS THE SLAB'S FRONT FACE, NOT A BADGE FLOATING ON IT.
 *
 * This is the package's other half and it lives at the seam rather than in the art. The layer used
 * to hand the material builder a `ROOM_SCALE · 62` SQUARE centred on the tile's foot: a wall
 * material could not be drawn at 1 : 2.4 at all, and 58.9 px stood for a metre where the slab beside
 * it drew a metre as 95 — so every pattern on a wall was at 0.62 of the room's own scale.
 *
 * DRIVEN, not asserted about the source: the real `materialLayerSvg` is called with a real
 * placement, and the box and the origin are read back out of the emitted string and compared with
 * `place.front` and `obliqueBox`'s own face height.
 *
 * MUTATION: restore `w: sw, h: sw` at `ROOM_SCALE · 62` ⇒ RED naming the square box.
 * MUTATION: translate by `py` instead of `py − faceH` ⇒ RED naming the origin (the skin would hang
 * a full storey below the slab).
 */
test('materialLayerSvg lays a wall skin on the slab\'s real 1 x 2.4 m front face', () => {
  const { svg, place } = layer([{ tx: 2, ty: 1, kind: 'wall', mat: 0 }]);
  assert.equal((svg.match(/<g class="rz-wall">/g) || []).length, 1, 'the interior partition drew no slab');

  const [px, py] = place.front(2, 1);
  const faceW = ROOM_SCALE * TILE_CM;
  const faceH = ROOM_SCALE * ROOM_HEIGHT_M * 100;
  const t = svg.match(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">\s*<g class="pl-item"/);
  assert.ok(t, 'the wall skin is not placed by a translate — the seam has changed shape');
  assert.ok(Math.abs(+t[1] - px) < 0.02 && Math.abs(+t[2] - (py - faceH)) < 0.02,
    `the skin sits at (${t[1]}, ${t[2]}); the slab's front face starts at `
    + `(${px.toFixed(2)}, ${(py - faceH).toFixed(2)})`);

  // the BOX, read back through helpers.item's own scale: min(w,h)/TILE, and the piece's cm extent
  const inner = svg.slice(svg.indexOf('<g class="pl-item"'));
  const k = scaleOf(inner);
  assert.equal(k, r3(faceW / TILE),
    `the skin is normalised at ${k}, i.e. a ${(k * TILE).toFixed(1)} px box — the face is ${faceW} px wide`);
  assert.ok(Math.abs(faceH / (k * CM) - WALL_H_CM) < 0.5,
    `the wall skin is drawn ${(faceH / (k * CM)).toFixed(1)} cm tall on a ${WALL_H_CM} cm slab`);
});

/**
 * A FLOOR SKIN IS STILL LAID FLAT, AT EXACTLY ONE TILE. `place.cell` maps a `unit × unit` upright
 * cell onto the tile's floor parallelogram, so a skin built at anything other than `unit` px lands
 * short of its own tile or over its neighbour's.
 *
 * ⚠️ NON-VACUITY IS THE FIRST ASSERTION: `roomMaterialTiles` emits a floor tile ONLY when its
 * material is non-default, so a leg driving material 0 would photograph an empty layer and pass.
 */
test('materialLayerSvg lays a floor skin flat, at exactly one tile', () => {
  const { svg, unit } = layer([{ tx: 1, ty: 1, kind: 'floor', mat: 1 }]);
  assert.ok(svg.includes('class="rz-floor-mat"'), 'the floor material layer drew nothing at all');
  assert.ok(/matrix\(/.test(svg), 'a floor material is no longer laid through place.cell');
  const inner = svg.slice(svg.indexOf('<g class="pl-item"'));
  const k = scaleOf(inner);
  assert.equal(k, r3(unit / TILE),
    `the floor skin is built in a ${(k * TILE).toFixed(1)} px box; the cell matrix maps ${unit}`);
  assert.ok(Math.abs(unit / (k * CM) - TILE_CM) < 0.5,
    `one tile is drawn as ${(unit / (k * CM)).toFixed(1)} cm of floor, and a tile is ${TILE_CM} cm`);
});

/**
 * The palette's swatch chip still resolves to the new art. `paintMatStrip` builds each chip at
 * 26 × 26 through `buildItem`, and a chip is the ONLY place `steel-tan-floor` ever reaches a player
 * (`roomMaterialTiles` skips material 0), so a chip that renders nothing hides a whole piece.
 */
test('every palette chip renders real ink at 26 px', () => {
  for (const id of MATERIAL_IDS) {
    const svg = buildItem(id, { w: 26, h: 26, idPrefix: 'rz-mc-' + id });
    assert.ok(svg.startsWith('<g') && svg.includes(INK), `${id}'s palette chip draws no ink`);
    const ib = inkBox(svg);
    assert.ok(ib.w >= 0.9 * TILE && ib.h >= 0.9 * TILE, `${id}'s chip does not fill its swatch`);
  }
});

/**
 * THE SIZE HINT IS DERIVED AND IS COMPARABLE ACROSS THE REGISTRY. The warm rows all claimed
 * `106 × 94` — the mock's CARD measurement, identical for a 2.4 m wall and a 1 m floor tile. These
 * are `PX_PER_CM.catalogue` applied to the piece's own centimetres, which is `fittings.SIZES`' rule.
 */
test('SIZES is the pieces\' own centimetres at the catalogue scale, not a card measurement', () => {
  for (const id of MATERIAL_IDS) {
    assert.equal(SIZES[id].w, Math.round(PX_PER_CM.catalogue * SPECS[id].w));
    assert.equal(SIZES[id].h, Math.round(PX_PER_CM.catalogue * SPECS[id].h));
  }
  assert.ok(SIZES['steel-bulkhead'].h > SIZES['steel-tan-floor'].h * 2,
    'a 2.4 m wall must claim more than twice the height of a 1 m floor tile');
  const distinct = new Set(MATERIAL_IDS.map((id) => SIZES[id].w + 'x' + SIZES[id].h));
  assert.equal(distinct.size, 2, 'exactly two footprints: the wall run and the floor tile');
  assert.equal(WALLS.length, 6, 'six walls');
  assert.equal(FLOORS.length, 6, 'six floors');
});

/** The paper ground is the room's paper — a skin drawn on any other white is a second sheet. */
test('every skin grounds on the surface\'s own PAPER', () => {
  for (const id of MATERIAL_IDS) {
    assert.ok(build(id).includes(`fill="${PAPER}"`), `${id} does not ground on the paper the room is`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE PAINTER DOOR — `DRAW` / `paintMaterial` / `frameForSkin`
//
// The module gained a second entrance on 2026-08-06 so a DAMAGED TWIN can re-run a skin's paint on a
// scene it does not own (`wrecked.js`, the twelve material twins). It is `fittings.paintFitting` and
// `paper-resources.paintResource` in this module's shape, and everything below is about the two ways
// that construction fails silently: a row pointing at another row's drawing, and a SECOND copy of the
// frame arithmetic drifting from the harness's.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A bare scene, rendered at the caller's box the way `helpers.item` would — no treatment. */
function paintedFragment(id, box, extra) {
  const s = scene('door-' + id);
  paintMaterial(s, id, box, extra);
  return s.render(box.w, box.h);
}

/**
 * ⭐⭐ THE DOOR DRAWS THE SKIN, BYTE FOR BYTE — which is the whole claim `wrecked.js` leans on when it
 * says a twin "is the same wall, damaged".
 *
 * ⛔ IT IS ALSO THE PIN ON THE ONE-DERIVATION RULE. `paintMaterial` resolves its own frame from the
 * caller's `env`; the harness resolves one from `opts`. If those two ever stop being the same
 * function, a twin would draw a 100 × 240 cm wall's damage on a 100 × 100 cm field and every other
 * assertion in this file — which only ever reads the PRISTINE builder — would stay green. Byte
 * equality across all three shipping boxes is the strongest statement available and it costs nothing.
 *
 * MUTATION: give `paintMaterial` its own `frameOf(TILE, TILE)` instead of `frameForSkin(env)` ⇒ RED
 *           on both wall boxes (the damage frame would be square).
 * MUTATION: `frameForSkin`'s default `w = h = 100 → 128` ⇒ RED on the bare-call leg below.
 */
test('paintMaterial paints exactly what the row\'s own builder paints, at every shipping box', () => {
  const BOXES = [WALL_BOX, FLOOR_BOX, CHIP_BOX, { w: 62, h: 62 }];
  for (const id of MATERIAL_IDS) {
    for (const box of BOXES) {
      const viaBuilder = BUILD[id]({ ...box, idPrefix: 'door-' + id, sketch: false });
      assert.equal(paintedFragment(id, box), viaBuilder,
        `${id} at ${box.w}x${box.h}: the painter door and the builder draw different pictures.\n`
        + 'They must share ONE frame derivation (`frameForSkin`) — a second copy of the aspect\n'
        + 'arithmetic is what this door exists to avoid.');
    }
  }
  // …and the defaults are `helpers.item()`'s own, so a bare call is the same square metre.
  //
  // ⚠️ THE ASSERTION IS ON THE ASPECT, AND THE FIRST DRAFT'S WAS NOT — measured, by mutating it.
  // Changing both defaults together (`100 → 128`) leaves `wCm`/`hCm` at 100 × 100, because the frame
  // is derived from `w : h` and NOTHING else: `min(w,h)` normalises the magnitude away. So a leg that
  // pinned the two centimetre extents was green under a mutation that really did change the defaults.
  // What a wrong default can actually do is give a bare call the wrong SHAPE, so that is what is
  // pinned — against `helpers.item()`'s own square, which is the thing it has to agree with.
  const g0 = frameForSkin();
  assert.equal(g0.wCm, TILE_CM, 'frameForSkin() must default to the 1 m tile helpers.item() defaults to');
  assert.equal(g0.hCm, TILE_CM);
  assert.equal(g0.hCm / g0.wCm, 1,
    'a bare frameForSkin() is not SQUARE. `helpers.item()` defaults `w = h = 100`, so an unsized call\n'
    + 'must draw the square metre it normalises — a defaulted aspect is a wall drawn as a floor.');
  assert.equal(frameForSkin({}).hCm, frameForSkin({ w: 100, h: 100 }).hCm);
  assert.equal(frameForSkin({ w: 40 }).hCm, frameForSkin({ w: 40, h: 100 }).hCm,
    'a HALF-specified box must default its missing side to helpers.item()\'s 100, not to its sibling');
  const gw = frameForSkin(WALL_BOX);
  assert.ok(Math.abs(gw.wCm - TILE_CM) < 0.5 && Math.abs(gw.hCm - WALL_H_CM) < 0.5,
    `a wall box derives ${gw.wCm.toFixed(1)} x ${gw.hCm.toFixed(1)} cm, not ${TILE_CM} x ${WALL_H_CM}`);
  assert.equal(gw.full, true, 'a 2.4 m frame must gate `full` on, or the head rail never draws');
  assert.equal(frameForSkin(CHIP_BOX).full, false, 'a 1 m crop is not a full-height wall');
});

/**
 * THE SWAP, ON THE NEW MAP. `BUILD`'s comment already says why it is written out rather than derived:
 * a row must not be able to point at another row's drawing, and `wrecked.test.js` records that the
 * failure is invisible to every other guard in this repo. `DRAW` is the same table one level down —
 * and it is the MORE dangerous of the two, because a twin reaches its picture through `DRAW` and a
 * twin drawing the wrong wall still keys, sizes and classifies correctly.
 */
test('DRAW is the twelve rows, each naming its own drawing, and no two rows share one', () => {
  assert.deepEqual(Object.keys(DRAW), [...MATERIAL_IDS], 'DRAW is not the id list, in order');
  const seen = new Map();
  for (const id of MATERIAL_IDS) {
    const f = DRAW[id];
    assert.equal(typeof f, 'function', `${id} has no painter`);
    // the convention is load-bearing elsewhere in this tree (`fittings.js`, `paper-resources.js`,
    // and `wrecked.test.js`'s painter-name guard): a painter is named after the ROW IT SERVES.
    assert.equal(f.name, 'draw' + camel(id)[0].toUpperCase() + camel(id).slice(1),
      `${id}'s painter is named ${f.name || '<anonymous>'} — a painter names the row it serves`);
    assert.ok(!seen.has(f), `${id} and ${seen.get(f)} draw the same picture`);
    seen.set(f, id);
  }
  assert.equal(seen.size, 12);
  // …and the pictures really are different, measured rather than inferred from function identity:
  // two distinct consts could still emit the same string, which is the swap wearing a second face.
  const frags = new Set(MATERIAL_IDS.map((id) => paintedFragment(id, FLOOR_BOX).replace(/door-[a-z-]+/g, 'x')));
  assert.equal(frags.size, 12, 'two material rows emit the same drawing');
  // an unknown id is a NO-OP, like `paintFitting` — never a throw, never a placeholder
  const s = scene('unknown');
  paintMaterial(s, 'no-such-material', FLOOR_BOX);
  assert.equal(s.render(FLOOR_BOX.w, FLOOR_BOX.h).includes('<path'), false,
    'paintMaterial drew something for an id that does not exist');
});

/**
 * `extra` runs AFTER the skin and on the SAME frame — the twins' whole contract.
 *
 * ⚠️ THE ORDER LEG NEEDS `extra` TO DRAW SOMETHING, and the first draft's did not — it only captured
 * the frame, so "the skin is a prefix of the fragment" was true whichever order the two ran in and
 * the leg was green under a `paintMaterial` with the two calls swapped. Measured, by swapping them.
 * A damage mark drawn UNDER the field is not damage: the field's own paper ground would cover it.
 */
test('paintMaterial hands `extra` the skin\'s own frame, after the skin', () => {
  for (const id of ['steel-bulkhead', 'carpet-floor']) {
    const box = boxFor(id);
    let got = null;
    const MARK = `M${r3(-3)} ${r3(-3)} L${r3(3)} ${r3(3)}`;
    const withExtra = paintedFragment(id, box, (s, g) => {
      got = g;
      s.path(MARK, { fill: 'none', stroke: INK, sw: W.mass });
    });
    assert.ok(got, `${id}: extra was never called`);
    const want = frameForSkin(box);
    assert.equal(got.wCm, want.wCm, `${id}: extra got a ${got.wCm} cm frame, the skin drew ${want.wCm}`);
    assert.equal(got.hCm, want.hCm);
    assert.equal(got.x(0), want.x(0), `${id}: extra's frame maps centimetres somewhere else`);
    assert.equal(got.z(0), want.z(0));
    // AFTER, not before — and non-vacuously: the mark is really in there, and the whole skin is
    // still a PREFIX of the fragment it was added to.
    assert.ok(withExtra.includes(MARK), `${id}: extra drew nothing — this leg cannot see the order`);
    // `scene.render` closes TWO groups (`pl-item` then the placement transform), so the skin's own
    // BODY is the fragment with both closers stripped — not with one.
    const skinOnly = paintedFragment(id, box).replace(/(<\/g>)+$/, '');
    assert.ok(withExtra.startsWith(skinOnly),
      `${id}: extra's marks are not appended after the skin — a damage mark under the field is not damage`);
  }
});

/**
 * ⭐ THE PALETTE, CLOSED — every hex in the fragment, raw AND treated, against the charter's four.
 *
 * ⛔ THIS WAS A HOLE AND IT IS WORTH SAYING SO. `docs/design/perilune-art-style.md` §1 lists this
 * suite in the table of files that close the palette on the twelve skins "raw and treated"; what the
 * suite actually held was `!svg.includes(ATTEND)` — a check for ONE forbidden string, which cannot
 * see a fifth colour that is not oxblood. A warm `#5f4a30` smuggled onto a skin passed every
 * assertion in this file. This is the scan the doc already claims.
 *
 * MUTATION: any skin's `INK` → `'#3a2c1e'` ⇒ RED naming the skin and the hex.
 */
const PALETTE = Object.freeze([INK, PAPER, PAPER_FLAT]);
function fifthHexes(svg) {
  const ok = new Set(PALETTE.map((h) => h.toUpperCase()));
  return [...new Set((svg.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).map((h) => h.toUpperCase()))]
    .filter((h) => !ok.has(h));
}
test('the twelve skins spend the charter\'s palette and nothing else — raw and treated', () => {
  // NON-VACUITY FIRST: the reader must actually find hexes, or "no fifth colour" is "no colours".
  const seen = new Set();
  for (const id of MATERIAL_IDS) {
    for (const svg of [build(id), treated(id), build(id, CHIP_BOX), treated(id, CHIP_BOX)]) {
      for (const h of (svg.match(/#[0-9A-Fa-f]{3,8}\b/g) || [])) seen.add(h.toUpperCase());
      assert.deepEqual(fifthHexes(svg), [],
        `${id} spends a colour outside ink / paper / the flat side tone. The charter's palette is\n`
        + 'four values and one of them (oxblood) is attention, which a wall never is.');
    }
    assert.ok(!build(id).includes(ATTEND) && !treated(id).includes(ATTEND), `${id} spends the oxblood accent`);
  }
  assert.ok(seen.has(INK.toUpperCase()) && seen.has(PAPER.toUpperCase()),
    'the hex reader found neither ink nor paper across twelve skins — it is broken, not the skins');
  assert.deepEqual([...seen].filter((h) => !PALETTE.map((x) => x.toUpperCase()).includes(h)), []);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7 · THE TWELVE TWINS — the post-raid state of every skin (`wrecked.js`, lane/warm-purge)
//
// ⚠️ THESE LEGS WERE WRITTEN BEFORE THE TWINS WERE WIRED AND HELD OUT OF THE FILE UNTIL THEY WERE,
// because every one of them DRIVES `buildWrecked` and against the WARM twins they reddened on the
// palette (steel-grey `#2f3d4a`) rather than on anything they are for. Wired 2026-08-06.
//
// WHAT THESE LEGS ARE FOR, in one sentence: a material twin is the ONE twin in the set whose damage
// cannot be authored in absolute centimetres — a skin is a tiling field with no intrinsic extent, so
// the same mark has to land on the same part of the material on a 1 m floor tile, a 2.4 m wall slab
// and a 26 px palette chip, and every one of those is a different frame.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** `<defs>` stripped, every drawn element of a fragment, in emission order. */
const elementsOf = (svg) => [...bodyOf(svg).matchAll(/<(path|circle|rect|ellipse)\b[^>]*\/>/g)].map((m) => m[0]);

/**
 * THE DAMAGE, ISOLATED — the twin's elements MINUS the pristine skin's, as a multiset difference.
 *
 * ⭐ THIS WORKS AT ALL BECAUSE OF THE CONSTRUCTION UNDER TEST: a twin re-runs its own pristine
 * painter on the same frame with the same `idPrefix`, so the skin's elements come out BYTE-IDENTICAL
 * inside the twin. `leftover` is what the skin emitted and the twin did not — it must be empty, and
 * that emptiness is the strongest available statement that the twin really is "the same wall,
 * damaged" rather than a redraw of it.
 */
function damageOf(id, box) {
  const opts = { ...box, idPrefix: 'tw-' + id, sketch: false };
  const skin = elementsOf(buildItem(id, opts));
  const twin = elementsOf(buildWrecked(id, opts));
  const leftover = skin.slice();
  const marks = [];
  for (const el of twin) {
    const i = leftover.indexOf(el);
    if (i >= 0) leftover.splice(i, 1);
    else marks.push(el);
  }
  return { marks, leftover, skinSvg: buildItem(id, opts) };
}

/** Points along an element's own geometry, in BODY px. A closed path is walked closed. */
function samplePoints(el, n = 14) {
  const out = [];
  const c = /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/.exec(el);
  if (c) {
    const [cx, cy, r] = [+c[1], +c[2], +c[3]];
    out.push([cx, cy]);
    for (let i = 0; i < 24; i += 1) out.push([cx + r * Math.cos((i / 24) * 2 * Math.PI), cy + r * Math.sin((i / 24) * 2 * Math.PI)]);
    return out;
  }
  const rc = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(el);
  if (rc) {
    const [x, y, w, h] = [+rc[1], +rc[2], +rc[3], +rc[4]];
    for (let i = 0; i <= n; i += 1) out.push([x + (w * i) / n, y], [x + (w * i) / n, y + h], [x, y + (h * i) / n], [x + w, y + (h * i) / n]);
    return out;
  }
  const d = /d="([^"]+)"/.exec(el);
  if (!d) return out;
  let cur = null, first = null;
  const seg = (a, b) => { for (let k = 1; k <= n; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); };
  for (const cmd of d[1].matchAll(/([MLCZ])((?:\s*-?[\d.]+)*)/g)) {
    const v = cmd[2].trim() ? cmd[2].trim().split(/\s+/).map(Number) : [];
    if (cmd[1] === 'M') { cur = [v[0], v[1]]; first = cur; out.push(cur); continue; }
    if (cmd[1] === 'Z') { if (cur && first) seg(cur, first); continue; }
    if (cmd[1] === 'C') { const e = [v[4], v[5]]; if (cur) seg(cur, e); cur = e; continue; }
    for (let i = 0; i + 1 < v.length; i += 2) { const e = [v[i], v[i + 1]]; if (cur) seg(cur, e); cur = e; }
  }
  return out;
}

/** Just the AUTHORED anchors of an element — a circle's centre, a path's own points. */
function anchorsOf(el) {
  const c = /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/.exec(el);
  if (c) return [[+c[1], +c[2]]];
  const d = /d="([^"]+)"/.exec(el);
  if (!d) return samplePoints(el, 1);
  const n = [...d[1].matchAll(/-?[\d.]+/g)].map(Number);
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

/**
 * THE INK A SKIN ACTUALLY DRAWS, as two populations, because a skin draws two kinds of thing and one
 * of them is not a line: STROKES (sampled along their length) and FILLED FIELDS — a rect or path
 * whose fill is `INK` or a `<pattern>`. The second half is not a convenience: four of the twelve draw
 * their whole identity as a `<pattern>` over the tile (the matting's weave, the grating's bars, the
 * carpet's pile, the blast wall's hazard block), so a rule stated over strokes alone would measure
 * `grow-matting`'s damage against its PERIMETER and nothing else — 31 cm away, on a 100 cm tile.
 * Measured, by writing it that way first.
 */
function skinInk(svg) {
  const pts = [];
  const areas = [];
  for (const el of elementsOf(svg)) {
    if (/fill="(#14120F|url\(#)/.test(el)) {
      const s = samplePoints(el, 4);
      if (s.length) {
        areas.push([Math.min(...s.map((p) => p[0])), Math.min(...s.map((p) => p[1])),
          Math.max(...s.map((p) => p[0])), Math.max(...s.map((p) => p[1]))]);
      }
    }
    if (/stroke="#14120F"/.test(el)) pts.push(...samplePoints(el, 20));
  }
  return { pts, areas };
}
function distToInk(p, ink) {
  for (const [x0, y0, x1, y1] of ink.areas) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return 0;
  let m = Infinity;
  for (const [x, y] of ink.pts) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < m) m = d; }
  return m;
}

/** The body-px half-extents of the skin's own tile for a given box — `helpers.item`'s scale undone. */
function tileHalf(box) {
  const k = Math.min(box.w, box.h) / TILE;
  return { hw: box.w / k / 2, hh: box.h / k / 2 };
}

/**
 * ⭐⭐ THE CONSTRUCTION ITSELF: a twin IS its pristine skin, plus marks.
 *
 * `wrecked.js` states this for all five paper populations and it is the only construction under which
 * "the twin is the same wall, damaged" survives a redraw of the wall. For the materials it carries a
 * second load: the twin has no `SPECS` row to fall back on, so if it ever stopped re-running
 * `paintMaterial` there would be nothing left that knows how many metres the caller asked for.
 *
 * MUTATION: give any twin a redraw instead of `paintMaterial(s, id, env, …)` ⇒ RED on `leftover`,
 *           naming the skin elements that went missing.
 * MUTATION: drop `env` from the painter's signature (`(s) =>` instead of `(s, env) =>`) ⇒ RED on
 *           both WALL boxes, because the twin would then draw a 100 × 100 cm field under a
 *           100 × 240 cm skin and every one of the skin's own elements would fail to match.
 */
test('every material twin is its own pristine skin PLUS damage — nothing redrawn, nothing lost', () => {
  for (const id of MATERIAL_IDS) {
    for (const box of [boxFor(id), CHIP_BOX]) {
      const { marks, leftover } = damageOf(id, box);
      assert.deepEqual(leftover, [],
        `${id} at ${box.w}x${box.h}: the twin does not re-run its own pristine painter — `
        + `${leftover.length} element(s) of the skin are missing from it. A twin that REDRAWS its `
        + 'piece stops being the same piece the moment the piece is redrawn.');
      assert.ok(marks.length >= 4,
        `${id} at ${box.w}x${box.h} adds ${marks.length} marks. A twin with no damage on it is the `
        + 'pristine piece under a different id, and nothing else in this repo can see that.');
    }
  }
});

/** THE PALETTE, CLOSED OVER THE TWINS TOO — raw and treated, the same scan the skins get above. */
test('the twelve twins spend the charter\'s palette and nothing else — raw and treated', () => {
  const seen = new Set();
  for (const id of MATERIAL_IDS) {
    const box = boxFor(id);
    for (const svg of [
      buildWrecked(id, { ...box, idPrefix: 'tw-' + id, sketch: false }),
      buildWrecked(id, { ...box, idPrefix: 'tw-' + id }),
      buildWrecked(id, { ...CHIP_BOX, idPrefix: 'twc-' + id }),
    ]) {
      for (const h of (svg.match(/#[0-9A-Fa-f]{3,8}\b/g) || [])) seen.add(h.toUpperCase());
      assert.deepEqual(fifthHexes(svg), [],
        `${id}'s TWIN spends a colour outside ink / paper / the flat side tone. Damage is not an `
        + 'alert: `ATTEND` is attention, faults and queued orders, and a breached wall is a fact '
        + 'about the ship rather than a claim on the player\'s eye.');
      assert.ok(!svg.includes(ATTEND), `${id}'s twin spends the OXBLOOD accent`);
    }
  }
  assert.ok(seen.has(INK.toUpperCase()) && seen.has(PAPER.toUpperCase()),
    'the hex reader found neither ink nor paper across twelve twins — it is broken, not the twins');
});

/**
 * ⭐ EVERY MARK IS ON THE MATERIAL — the two halves, and the second is the one that bites.
 *
 * 1. IN THE TILE. A damage anchor outside the skin's own box is drawn on the NEIGHBOUR's art: a floor
 *    skin is laid tile by tile through `place.cell` and a wall skin face by face, so there is no
 *    margin anywhere for a mark to overhang into.
 * 2. ON DRAWN INK. "Inside the box" is nearly free — a skin fills its tile with paper edge to edge —
 *    so the rule is stated against what the skin DRAWS: every mark's own geometry must come within
 *    `TOL_CM` of a stroke or a filled field of the pristine skin. This is the shape of a real defect
 *    already in this repo: `wrecked.js`'s `seal-set` tear was authored against geometry a later
 *    polish pass narrowed, and its far end hung in clean paper with nothing under it — visible in a
 *    render, invisible to every string assertion in the suite.
 *
 * ⚠️ `TOL_CM = 12` IS MEASURED, NOT CHOSEN. Worst across the twelve is 8.22 cm, on `steel-tan-floor`
 * — deliberately the quietest skin in the set (one deck plate, four screws, an 18 cm centre tick), so
 * its interior is the largest genuinely bare area any of the twelve draws. The tolerance is that
 * number plus headroom, and both controls below are driven against fixtures that carry the failure.
 */
test('every twin\'s damage lands inside its tile AND on ink the skin actually draws', () => {
  const TOL_CM = 12;
  let worst = 0;
  const probe = (id, box, marks, ink) => {
    const { hw, hh } = tileHalf(box);
    const out = [];
    for (const el of marks) {
      const off = Math.max(...anchorsOf(el).map(([x, y]) => Math.max(Math.abs(x) - hw, Math.abs(y) - hh)));
      if (off > 0.01) out.push(`${id}: a mark's anchor is ${(off / CM).toFixed(1)} cm outside the tile`);
      const near = Math.min(...samplePoints(el).map((p) => distToInk(p, ink))) / CM;
      worst = Math.max(worst, near);
      if (near > TOL_CM) out.push(`${id}: a mark lies ${near.toFixed(1)} cm from any ink the skin draws`);
    }
    return out;
  };
  for (const id of MATERIAL_IDS) {
    for (const box of [boxFor(id), CHIP_BOX]) {
      const { marks, skinSvg } = damageOf(id, box);
      assert.deepEqual(probe(id, box, marks, skinInk(skinSvg)), []);
    }
  }
  assert.ok(worst < TOL_CM, `the worst mark is ${worst.toFixed(2)} cm from ink — retune TOL_CM (${TOL_CM})`);

  // ── THE CONTROLS, DRIVEN. Two fixtures, each carrying exactly one of the two failure shapes,
  // built through the real `paintMaterial` door so the probe is reading the same kind of string it
  // reads above. Without these, "no violations" and "the probe cannot see one" look identical.
  const box = FLOOR_BOX;
  const g = frameForSkin(box);
  const bad = (id, extra) => {
    const s = scene('bad-' + id);
    paintMaterial(s, id, box, extra);
    const svg = s.render(box.w, box.h);
    const pristine = elementsOf(buildItem(id, { ...box, idPrefix: 'bad-' + id, sketch: false }));
    const left = pristine.slice();
    const marks = [];
    for (const el of elementsOf(svg)) { const i = left.indexOf(el); if (i >= 0) left.splice(i, 1); else marks.push(el); }
    return marks;
  };
  // (a) a mark a tile and a half to the right — the OVERHANG shape
  const away = bad('cream-tile-floor', (s) => {
    s.path(`M${g.x(150)} ${g.y(50)} L${g.x(170)} ${g.y(60)}`, { fill: 'none', stroke: INK, sw: W.heavy });
  });
  assert.equal(away.length, 1, 'the control fixture did not produce exactly one mark');
  assert.ok(probe('control-a', box, away, skinInk(buildItem('cream-tile-floor', { ...box, idPrefix: 'bad-cream-tile-floor', sketch: false })))
    .some((m) => m.includes('outside the tile')),
  'the IN-THE-TILE half of this leg cannot see a mark drawn a tile and a half away');
  // (b) a mark inside the tile but in the largest bare area the quietest skin has — the CLEAN PAPER
  //     shape, which is the `seal-set` defect exactly
  const empty = bad('steel-tan-floor', (s) => {
    s.circle({ cx: g.x(30), cy: g.y(30), r: g.u(1), fill: INK });
  });
  assert.equal(empty.length, 1);
  const msgs = probe('control-b', box, empty, skinInk(buildItem('steel-tan-floor', { ...box, idPrefix: 'bad-steel-tan-floor', sketch: false })));
  assert.deepEqual(msgs.filter((m) => m.includes('outside the tile')), [],
    'the control-b fixture is meant to be INSIDE the tile — it is testing the wrong half');
  assert.ok(msgs.some((m) => m.includes('from any ink')),
    'the ON-INK half of this leg cannot see a mark floating in the skin\'s own clean paper');
});

/**
 * ⛔ THE GROUND EXCEPTION FOLLOWS THE TWIN — `art-style.md` §4, and it has to be threaded by hand.
 *
 * `paper-materials.js` passes `ground: false` at its own `item()` seam; `buildWrecked` calls `item()`
 * itself, so a twin inherits NOTHING from the skin's harness. Un-threaded, a 12 × 8 room floor of
 * damaged deck would draw ninety-six of the pawns' ground rules across it at the tiling pitch — the
 * exact picture the ruling was taken from, on the surface it was measured on.
 *
 * ⚠️ NON-VACUITY IS THE SECOND ASSERTION: a twin with the treatment OFF also has no ground rule, and
 * would pass the first half for the wrong reason. The doubled silhouette pass is what says the pen
 * really did run.
 */
test('a material twin carries the sketch treatment WITHOUT the pawns\' ground rule', () => {
  for (const id of MATERIAL_IDS) {
    const svg = buildWrecked(id, { ...boxFor(id), idPrefix: 'tg-' + id });
    assert.equal((svg.match(/class="pl-sk-ground"/g) || []).length, 0,
      `${id}'s twin draws the ground rule. A material is not a standing thing — it IS the deck — and `
      + 'a room floor of these draws one tick per tile at the tiling pitch (art-style.md §4).');
    assert.ok(/class="pl-sk-2nd"/.test(svg),
      `${id}'s twin carries no doubled pass, so the treatment never ran on it and the leg above is `
      + 'vacuous. A paper twin beside a hand-drawn pristine skin is the mismatch this package closed.');
  }
});
