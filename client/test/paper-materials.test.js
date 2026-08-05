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
import { CM, WALL_H_CM, TILE_CM, SPECS, SIZES, MATERIAL_IDS, BUILD } from '../src/items/paper-materials.js';
import { ITEMS, ITEM_IDS, buildItem } from '../src/items/index.js';
import { INK, PAPER, ATTEND, TILE, r3 } from '../src/items/helpers.js';
import { W } from '../src/items/fittings.js';
import { PX_PER_CM } from '../src/render/oblique.js';
import {
  roomScene, scenePlacement, M_PER_TILE, ROOM_HEIGHT_M, ROOM_SCALE,
} from '../src/ui/room-model.js';
import { materialLayerSvg } from '../src/ui/roomzoom-view.js';
import { WALL_MATERIALS, FLOOR_MATERIALS, materialItemId } from '../src/ui/build-material-model.js';

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const WALLS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'wall');
const FLOORS = MATERIAL_IDS.filter((id) => SPECS[id].surface === 'floor');

/** The boxes the three shipping call sites really hand a skin (all three are pinned below). */
const WALL_BOX = { w: ROOM_SCALE * TILE_CM, h: ROOM_SCALE * ROOM_HEIGHT_M * 100 };
const FLOOR_BOX = { w: ROOM_SCALE * TILE_CM, h: ROOM_SCALE * TILE_CM };
const CHIP_BOX = { w: 26, h: 26 };

const boxFor = (id) => (SPECS[id].surface === 'wall' ? WALL_BOX : FLOOR_BOX);
const build = (id, box) => buildItem(id, { ...(box || boxFor(id)), idPrefix: 'pm-' + id });

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
