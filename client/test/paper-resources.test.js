// THE NINE PAPER GROUND STACKS — the package's own guards.
//
// WHAT THIS FILE IS FOR, and what it deliberately leaves to its siblings. `items.test.js` already
// holds every registry row to purity, determinism, id-namespacing and fragment hygiene, and
// `wrecked.test.js` already holds every twin to the same plus the painter-name and ledger joins. Nine
// more rows inherit all of that by existing, and repeating it here would be nine more copies of an
// assertion that already fires. What is NOT covered by any of them is the only thing this package is
// actually about:
//
//   1. THE JOIN MOVED. Nine `ItemKind`s and nine `Glyphs.ForItem` chars must now land on the PAPER
//      rows and not on the warm ones they displaced — through BOTH derivations, driven.
//   2. THE PIECES ARE TELLABLE APART AT THE SIZE THEY ARE SHOWN. A stack is drawn at ~22 px; in a
//      two-colour dialect that is a silhouette test and nothing else.
//   3. NOTHING IS INVISIBLE OR CLIPPED. A part authored outside its own declared box still emits
//      perfectly valid SVG and is simply not there on screen — the exact defect class the fittings
//      lane found twice by looking at a render rather than at a string.
//   4. NO OXBLOOD. The one accent is spent on attention, never on matter.
//   5. THE DUPLICATED DRAWING RULE DID NOT DRIFT from the one in `fittings.js` it was copied from.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './code-only.js';

import * as PR from '../src/items/paper-resources.js';
import { SPECS, PAPER_RESOURCE_IDS, SIZES, BOX_EXTENT, BUILD, frameForSpec } from '../src/items/paper-resources.js';
import { SPECS as FIT_SPECS, frameFor as fitFrameFor, BOX } from '../src/items/fittings.js';
import { ITEMS, buildItem, RESOURCE_ITEM_BY_KIND_NAME, placeholderItem } from '../src/items/index.js';
import { itemIdForGlyphChar } from '../src/items/glyph-map.js';
import { itemIdForStockKind } from '../src/ui/room-model.js';
import { STOCK_KINDS } from '../src/ui/stock-filter-model.js';
import { buildWrecked, WRECKED } from '../src/items/wrecked.js';
import { ATTEND, PAPER, INK, SKETCH_LEVEL } from '../src/items/helpers.js';
import { amplitudeBound, penSteps, LEVELS, CR_BULGE } from '../src/render/sketch.js';
import {
  measurePiece, bodyExtent, attrsOf, outsideBox,
  // — lane/warm-purge — the twin-damage instrument, shared with `wrecked.test.js` since 2026-08-06
  damageMarks, offPieceAnchors, damageAnchors, isContainmentRing, DMG_TOL,
} from './sketch-geom.js';
import { PAPER_FLAT } from '../src/render/oblique.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'items', 'paper-resources.js'), 'utf8');

/** The nine, and the sim `ItemKind` each one is the art for. The RIGHT-HAND column is the claim this
 *  file drives; nothing derives it from the registry, or the join test would be a tautology. */
const KIND_OF = Object.freeze({
  'spoil-heap': 'Regolith',
  'tuber-crate': 'Potato',
  'plate-offcut': 'Scrap',
  'gear-set': 'Parts',
  'control-card': 'ControllerModule',
  'seal-set': 'Seals',
  'ice-block': 'Ice',
  'body-bag': 'Corpse',
  'turnings': 'Swarf',
});

/** …and the warm row each one took the join FROM. Also written down rather than derived. */
const DISPLACED = Object.freeze({
  'spoil-heap': 'regolith',
  'tuber-crate': 'potato',
  'plate-offcut': 'scrap',
  'gear-set': 'parts',
  'control-card': 'controller-module',
  'seal-set': 'seals',
  'ice-block': 'ice',
  'body-bag': 'corpse',
  'turnings': 'swarf',
});

// ⚠️ `build` IS THE RAW FRAGMENT SINCE 2026-08-05 — the owner's `strong` sketch treatment ships on
// these nine, and every silhouette / vocabulary assertion here reads emitted coordinates and tag
// names, neither of which a freehand stroke leaves behind. The geometry keeps being asked of the
// geometry; the bridge is `sketch-adoption.test.js`'s displacement pin plus the treated legs below.
const build = (id, extra) => BUILD[id]({ w: 400, h: 400, idPrefix: 'pr-' + id, sketch: false, ...extra });
/** What SHIPS. */
const treated = (id, extra) => BUILD[id]({ w: 400, h: 400, idPrefix: 'pr-' + id, ...extra });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0. NON-VACUITY. Every scan below runs over a parsed set; a parser that quietly returned nothing
//    would make this whole file agree with itself about an empty world. This runs first, by name.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the set is nine pieces, each with a spec, a builder and a registry row', () => {
  assert.equal(PAPER_RESOURCE_IDS.length, 9);
  assert.deepEqual([...PAPER_RESOURCE_IDS].sort(), Object.keys(KIND_OF).sort());
  for (const id of PAPER_RESOURCE_IDS) {
    assert.ok(SPECS[id] && SPECS[id].w > 0 && SPECS[id].d > 0 && SPECS[id].h > 0, `${id}: a real box`);
    assert.equal(typeof BUILD[id], 'function', `${id}: a builder`);
    assert.equal(typeof PR.DRAW[id], 'function', `${id}: a painter`);
    assert.ok(ITEMS[id], `${id}: a registry row`);
    // the `size` hint is the DERIVED object, not a transcription — a piece cannot disagree with its
    // own drawing about how big it is (the rule `fittings.SIZES` already holds)
    assert.equal(ITEMS[id].size, SIZES[id], `${id}: size is PR.SIZES[id], the same object`);
  }
  // …and the module never reaches for a clock, a die or a DOM. ⚠️ COMMENT-STRIPPED (CLAUDE.md trap
  // 1), through the SHARED stripper and never a re-derived one: the module's own header explains why
  // there is no scatter term in it and therefore contains the literal string `Math.random`. A raw
  // scan fires on that prose, and the way to satisfy a raw scan is to delete the explanation, which
  // is worse than the bug it was looking for.
  const code = codeOnly(SRC);
  assert.ok(code.length > 4000, 'non-vacuity: the stripper ate the module');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'document.', 'window.']) {
    assert.ok(!code.includes(banned), `paper-resources.js reaches for ${banned}`);
  }
  // THE NEGATIVE CONTROL, and it is LIVE on the shipped file rather than on a fixture: the header
  // really does name `Math.random`, so if this line ever fails the stripper is the only thing that
  // can have changed — and the ban above has quietly become a scan over nothing.
  assert.ok(SRC.includes('Math.random') && !code.includes('Math.random'),
    'the header no longer explains the no-scatter rule, so the stripper is untested here and the\n'
    + 'ban above proves nothing. Restore the explanation or delete this control — do not leave it\n'
    + 'green and vacuous.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE JOINS — the point of the package, driven through both derivations
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ TWO JOINS, AND THEY ARE NOT THE SAME JOIN. A ground stack reaches a surface two ways: the
// `items` wire channel carries a kind BYTE, which `room-model.js` sends through `STOCK_KINDS` →
// `RESOURCE_ITEM_BY_KIND_NAME`; and the frame carries a GLYPH, which `glyph-map.js` sends through
// `deriveGlyphToItem`. One keys on `itemKind`, the other on `glyph`. A redraw that moved only one of
// them would draw the paper pile from the items channel and the warm pile from the frame — on the
// same tile, in the same room, at the same moment.
test('the ItemKind BYTE join lands on the paper row, for all nine (driven through room-model)', () => {
  const byName = new Map(STOCK_KINDS.map((e) => [e.name, e.kind]));
  assert.ok(byName.size >= 9, 'non-vacuity: STOCK_KINDS parsed to nothing');
  const wrong = [];
  for (const [id, kindName] of Object.entries(KIND_OF)) {
    const byte = byName.get(kindName);
    if (byte === undefined) { wrong.push(`${kindName}: no such ItemKind in STOCK_KINDS`); continue; }
    const got = itemIdForStockKind(byte);
    if (got !== id) wrong.push(`ItemKind.${kindName} (byte ${byte}) → "${got}", expected "${id}"`);
  }
  assert.deepEqual(wrong, [],
    'THE ITEMS CHANNEL STILL DRAWS THE WARM PILES: ' + wrong.join('; ') + '\n'
    + '`RESOURCE_ITEM_BY_KIND_NAME` takes the FIRST registry row that claims a kind NAME, and the\n'
    + 'warm rows sit above the paper ones in `ITEMS`. A displaced row that kept its `itemKind` keeps\n'
    + 'the join, silently, forever.');
});

test('the GLYPH join lands on the same nine rows (driven through glyph-map)', () => {
  const wrong = [];
  for (const [id, kindName] of Object.entries(KIND_OF)) {
    const glyph = ITEMS[id].glyph;
    if (typeof glyph !== 'string') { wrong.push(`${id} claims no glyph`); continue; }
    const got = itemIdForGlyphChar(glyph);
    if (got !== id) wrong.push(`${JSON.stringify(glyph)} → "${got}", expected "${id}" (${kindName})`);
  }
  assert.deepEqual(wrong, [],
    'A PROJECTED GLYPH STILL RESOLVES TO WARM ART: ' + wrong.join('; ') + '\n'
    + '`deriveGlyphToItem` is first-wins over `ITEMS` too, so this is the same defect as the kind\n'
    + 'join through a different door — and it is the door the FRAME comes through, which means the\n'
    + 'same tile could draw one pile from the projection and another from the items channel.');
});

// ⛔ THIS LEG CHANGED ITS SUBJECT ON 2026-08-06 AND IS STRICTLY STRONGER FOR IT. It read
// `the nine WARM rows they displaced are unreached, and still build their own art`, and it held each
// warm row to a HALF-MADE demotion being impossible: `kind: 'resource'`, `itemKind: null`,
// `glyph: null`, `supersededBy: <the paper row>`, plus *"AND IT STILL DRAWS. 'Unreached' must mean
// 'nothing routes to it', never 'it is broken'."* lane/warm-purge retired all nine rows, so the
// demotion is now closed the only way that cannot be half-made: THE ROW IS NOT THERE.
// ⇒ THE ASSERTION IS THE SAME ONE, TAKEN TO ITS END. `buildItem` is TOLERANT — an unknown id returns
// the `?` placeholder rather than throwing — so a warm row silently re-added tomorrow would still
// render; this compares against the placeholder BUILT WITH THE SAME OPTS, which is byte-for-byte what
// a missed lookup returns, and that is the only form that can tell "absent" from "present".
test('the nine WARM rows they displaced are GONE from the registry, not merely demoted', () => {
  for (const [paperId, warmId] of Object.entries(DISPLACED)) {
    assert.equal(ITEMS[warmId], undefined,
      `${warmId} is back in the registry. Its glyph and its ItemKind were handed to ${paperId} on\n`
      + '2026-08-05 and the row itself was retired on 2026-08-06; a warm pile re-registered above a\n'
      + 'paper one wins BOTH first-wins joins, which is the defect this file exists to watch.');
    assert.equal(buildItem(warmId, { idPrefix: 'warm' }), placeholderItem({ idPrefix: 'warm' }),
      `${warmId} still BUILDS something. \`buildItem\` is tolerant, so the registry check above is\n`
      + 'about the table and this one is about the art: an id that renders is an id some call site\n'
      + 'can still put on a tile.');
    // …and the paper row that took its place must still draw, or "gone" would be satisfied by a
    // registry with nothing in it at all.
    assert.notEqual(buildItem(paperId, { idPrefix: 'warm' }), placeholderItem({ idPrefix: 'warm' }),
      `${paperId} does not build — the row that took ${warmId}'s joins draws the placeholder`);
  }
});

test('RESOURCE_ITEM_BY_KIND_NAME is exactly the nine paper rows, and no warm one is in it', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(KIND_OF).map(([id, k]) => [k, id])),
    { ...RESOURCE_ITEM_BY_KIND_NAME },
    'the kind-name join is not the nine paper rows exactly',
  );
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE GEOMETRY — a real path reader, then the two things a string cannot otherwise say
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Every point a fragment's geometry actually reaches, in the builder's own design space.
 *
 * ⚠️ IT PARSES THE PATH GRAMMAR RATHER THAN SCRAPING NUMBERS, and the difference is not pedantry:
 * an `A` command is `rx ry rot large-arc sweep x y`, so a naive pair-wise scrape reads the two flags
 * as a coordinate and reports ink at (0, 0) that no arc ever touches. Only `M L Q A Z` are emitted
 * by this module; anything else throws rather than being silently skipped, because a command this
 * reader does not know is a part it cannot see.
 */
function pointsIn(fragment) {
  const body = fragment.slice(fragment.indexOf('scale('));
  const pts = [];
  for (const m of body.matchAll(/ d="([^"]+)"/g)) {
    const toks = m[1].match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
    let i = 0;
    while (i < toks.length) {
      const c = toks[i++];
      if (c === 'Z' || c === 'z') continue;
      const num = () => Number(toks[i++]);
      if (c === 'M' || c === 'L') { const x = num(); pts.push([x, num()]); } else if (c === 'Q') {
        const cx = num(); const cy = num(); pts.push([cx, cy]); const x = num(); pts.push([x, num()]);
      } else if (c === 'A') {
        num(); num(); num(); num(); num(); const x = num(); pts.push([x, num()]);
      } else {
        throw new Error(`unknown path command ${JSON.stringify(c)} — this reader cannot see that part`);
      }
    }
  }
  for (const m of body.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="(-?[\d.]+)" ry="(-?[\d.]+)"/g)) {
    const [cx, cy, rx, ry] = [+m[1], +m[2], +m[3], +m[4]];
    pts.push([cx - rx, cy - ry], [cx + rx, cy + ry]);
  }
  for (const m of body.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    pts.push([+m[1], +m[2]], [+m[1] + +m[3], +m[2] + +m[4]]);
  }
  return pts;
}

function inkBox(fragment) {
  const pts = pointsIn(fragment);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    n: pts.length,
    x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
  };
}

// ⚠️ THE SMALL CLIP ALLOWANCE IS MEASURED, NOT CHOSEN. `helpers.render` centres the body on (0,0)
// and scales it to the tile, so an in-box part lands inside ±extent/2. A stroke is drawn ASTRIDE its
// path, so half a stroke width (≤ 1.1 design units at the heaviest ramp step) sits outside the
// geometric extent by construction and is not a fault. 2 units is that, doubled.
const CLIP_SLACK = 2;

test('nothing is authored outside its own declared box — the part that clips is still valid SVG', () => {
  const over = [];
  for (const id of PAPER_RESOURCE_IDS) {
    const b = inkBox(build(id));
    const e = BOX_EXTENT[id];
    assert.ok(b.n > 12, `${id}: the path reader found only ${b.n} points — it is not seeing the piece`);
    if (b.x0 < -e.w / 2 - CLIP_SLACK) over.push(`${id}: left  ${b.x0.toFixed(1)} < ${(-e.w / 2).toFixed(1)}`);
    if (b.x1 > e.w / 2 + CLIP_SLACK) over.push(`${id}: right ${b.x1.toFixed(1)} > ${(e.w / 2).toFixed(1)}`);
    if (b.y0 < -e.h / 2 - CLIP_SLACK) over.push(`${id}: top   ${b.y0.toFixed(1)} < ${(-e.h / 2).toFixed(1)}`);
    if (b.y1 > e.h / 2 + CLIP_SLACK) over.push(`${id}: below ${b.y1.toFixed(1)} > ${(e.h / 2).toFixed(1)}`);
  }
  assert.deepEqual(over, [],
    'A PART IS AUTHORED OUTSIDE ITS PIECE\'S OWN BOX: ' + over.join('; ') + '\n'
    + 'The centring in `helpers.render` counts the DECLARED box (`SPECS`), so ink beyond it is drawn\n'
    + 'and then cropped by whatever surface insets the tile. It emits perfectly valid SVG and it is\n'
    + 'simply not on screen — which is why only a geometric guard can see it. Either move the part\n'
    + 'inside `0..w / 0..d / 0..h`, or grow the spec and say in its comment why the picture is bigger\n'
    + 'than the object.');
});

// ⭐ THE SAME RULE ON WHAT SHIPS — the amplitude added EXPLICITLY, the ground rule excluded by name.
//   OLD RULE: the ink box of the RAW drawing is inside the declared extent + CLIP_SLACK.
//   NEW RULE: the TREATED drawing's marks — curves flattened, ellipses sampled on their perimeter —
//             are inside the declared extent + CLIP_SLACK + `amplitudeBound(SKETCH_LEVEL)`.
// The bound is derived from the preset's own knobs (overshoot 3.6, bow ≤ 5.5, the doubled pass'
// ±0.9 per axis, 2 dp of rounding), so a knob that moves moves the tolerance and nobody can widen
// a literal to make a piece fit.
test('the treated pile stays inside its declared box too — plus the amplitude, and no more', () => {
  const AMP = amplitudeBound(SKETCH_LEVEL);
  let worstRaw = 0;
  let worstTreated = 0;
  for (const id of PAPER_RESOURCE_IDS) {
    const e = BOX_EXTENT[id];
    const lim = { x: e.w / 2 + CLIP_SLACK + AMP, y: e.h / 2 + CLIP_SLACK + AMP };
    const over = outsideBox(treated(id), lim);
    assert.deepEqual(over, [], `${id}: the TREATED pile leaves its ${e.w}×${e.h} extent by more than `
      + `the declared amplitude ${AMP.toFixed(2)}: ${over.slice(0, 3).join(' ')}`);
    const be = (svg) => { const b = bodyExtent(svg); return Math.max(b.mx - e.w / 2, b.my - e.h / 2); };
    worstRaw = Math.max(worstRaw, be(build(id)));
    worstTreated = Math.max(worstTreated, be(treated(id)));
  }
  assert.ok(worstTreated > worstRaw + 1, 'the treated set spends none of the tolerance — vacuous');
  assert.ok(worstTreated < CLIP_SLACK + AMP, 'the headroom is gone; re-derive rather than widen');
});

// ⚠️ THE FLOOR IS THE MEASURED MINIMUM, ROUNDED DOWN, AND IT IS HONEST ABOUT WHAT IT CATCHES.
// A piece's box runs from its front-bottom-near corner to its back-top-far one, and almost nothing
// occupies BOTH extremes — a nest of curls has no ink at the back-top of its own 30 cm of depth. So
// this is not a tightness check and must not be read as one. What it catches is a piece that
// COLLAPSED: a builder wired to the wrong frame, a spec that grew by a factor, geometry that stopped
// being emitted. Measured on the shipped nine: the tightest fill is `body-bag` at 0.95 across and
// `turnings` at 0.64 up.
const FILL_FLOOR = 0.55;

test('every piece really fills its own tile — no builder collapsed into a corner', () => {
  const thin = [];
  for (const id of PAPER_RESOURCE_IDS) {
    const b = inkBox(build(id));
    const e = BOX_EXTENT[id];
    if (b.w / e.w < FILL_FLOOR) thin.push(`${id}: ${(b.w / e.w).toFixed(2)} across`);
    if (b.h / e.h < FILL_FLOOR) thin.push(`${id}: ${(b.h / e.h).toFixed(2)} up`);
  }
  assert.deepEqual(thin, [], 'A PIECE DRAWS ALMOST NOTHING OF ITS OWN BOX: ' + thin.join('; '));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. SILHOUETTE — the claim the header makes, measured
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A piece's SHAPE VOCABULARY, counted off the emitted geometry.
 *
 * ⚠️ CALLED A VOCABULARY AND NOT A SILHOUETTE, DELIBERATELY. A node test cannot rasterise; what it
 * can do is count the KINDS of mark a piece is made of, which is what a reader's eye resolves first
 * at 22 px — is this thing round, boxy, jagged, toothed, hollow, or nothing but line? Two pieces with
 * the same vocabulary in the same proportions will read as each other at tile size no matter how
 * different their coordinates are, and that is exactly the collision this measures.
 */
function vocab(id) {
  const frag = build(id);
  const body = frag.slice(frag.indexOf('scale('));
  const paths = [...body.matchAll(/<path d="([^"]+)"([^/]*)\/>/g)].map((m) => ({ d: m[1], a: m[2] }));
  const ellipses = [...body.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="(-?[\d.]+)" ry="(-?[\d.]+)"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], rx: +m[3], ry: +m[4] }));
  const filled = paths.filter((p) => !/fill="none"/.test(p.a));
  const e = BOX_EXTENT[id];
  return {
    /** round things lying flat (`ry/rx` = the oblique's 0.6) vs standing up (a true circle/oval) */
    levelEllipses: ellipses.filter((o) => Math.abs(o.ry / o.rx - 0.6) < 0.02).length,
    frontEllipses: ellipses.filter((o) => Math.abs(o.ry / o.rx - 0.6) >= 0.02).length,
    /** concentric pairs — an annulus is a ring with a bore, the one see-through silhouette */
    concentric: ellipses.filter((o, i) => ellipses.some((q, j) => j !== i
      && Math.abs(q.cx - o.cx) < 0.01 && Math.abs(q.cy - o.cy) < 0.01 && q.rx < o.rx)).length,
    filledStraight: filled.filter((p) => !/[QA]/.test(p.d)).length,
    filledCurved: filled.filter((p) => /[QA]/.test(p.d)).length,
    strokeOnly: paths.length - filled.length,
    hatched: (body.match(/url\(#/g) || []).length,
    /** the longest single outline, in vertices */
    maxVertices: Math.max(0, ...paths.map((p) => (p.d.match(/[MLQA]/g) || []).length)),
    /**
     * TOOTHED RIMS — a closed outline of 24+ vertices whose radius CROSSES its own mean at least
     * eight times going round.
     *
     * ⛔ THREE WEAKER VERSIONS WERE DEFEATED BY MUTATION BEFORE THIS ONE HELD, and every one of them
     * looked obviously sufficient when it was written. Recorded because the shape of the failure —
     * a guard measuring an artefact of the drawing rather than the property — is the recurring one:
     *   1. "24+ vertices". Flattening the tooth profile (`rOut` → `rIn`) deletes every tooth and
     *      leaves a plain rim drawn with 36 points. GREEN over a piece that has become a seal.
     *   2. "…and the radius swings by 25%". A LEVEL ring is an oblique ellipse, so its projected
     *      radius already swings by 1/0.6 = 1.67 with no teeth at all. The flattened rim measured
     *      1.67 and sailed through: the PROJECTION was doing the guard's work for it.
     *   3. "…and the radius TURNS 8+ times". A flattened rim is a constant radius rounded to 2 dp,
     *      and the rounding wobble alone turns at every third point — 36 spurious turns. Gating the
     *      turn on amplitude then broke the honest case instead, because a real tooth's radius sits
     *      on a PLATEAU across its tip (rOut, rOut) and the turn happens exactly there.
     * ⇒ MEAN CROSSINGS survive all three: they are scale-free, projection-tolerant and immune to
     *   both plateaus and rounding (a 3% dead band drops the wobble). Measured on the shipped piece:
     *   12 (the level gear) and 16 (the standing one). Flattened they read 4 and 0.
     * (The same run found the other half: dropping the LEVEL gear from 9 teeth to 5 does NOT fire,
     * correctly — the standing gear still has its rim, so the piece still owns the silhouette, which
     * is exactly what the assertion claims.)
     */
    toothedRims: paths.filter((p) => {
      const v = [...p.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
      if (v.length < 24) return false;
      const cx = v.reduce((a, q) => a + q[0], 0) / v.length;
      const cy = v.reduce((a, q) => a + q[1], 0) / v.length;
      const r = v.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
      const mean = r.reduce((a, x) => a + x, 0) / r.length;
      const eps = mean * 0.03;
      const sign = r.filter((x) => Math.abs(x - mean) > eps).map((x) => Math.sign(x - mean));
      let crossings = 0;
      for (let i = 0; i < sign.length; i += 1) if (sign[i] !== sign[(i + 1) % sign.length]) crossings += 1;
      return crossings >= 8;
    }).length,
    /** how letterboxed the piece is — a body bag is nothing like a crate at any size */
    aspect: Math.round((e.w / e.h) * 100) / 100,
  };
}

// ⚠️ THE FLOOR IS THE MEASURED MINIMUM OVER THE SHIPPED SET, and it is stated as an L1 distance over
// the counts above rather than as a set of hand-picked "unique features", because a unique-feature
// table is satisfied by nine pieces that each own one mark and are otherwise identical. Measured
// pairwise minimum on the shipped nine: 5 (`plate-offcut` vs `ice-block`, which are the two closest
// in the set by construction — both are straight-edged faceted flats, and it is `ice-block`'s refusal
// of the hatch and its extra facets that separate them).
const VOCAB_FLOOR = 4;

test('no two pieces share a shape vocabulary — the set is tellable apart at tile size', () => {
  const V = Object.fromEntries(PAPER_RESOURCE_IDS.map((id) => [id, vocab(id)]));
  const keys = Object.keys(V['spoil-heap']).filter((k) => k !== 'aspect');
  const close = [];
  for (let i = 0; i < PAPER_RESOURCE_IDS.length; i += 1) {
    for (let j = i + 1; j < PAPER_RESOURCE_IDS.length; j += 1) {
      const a = V[PAPER_RESOURCE_IDS[i]];
      const b = V[PAPER_RESOURCE_IDS[j]];
      // aspect counts double and in units of tenths: two pieces of very different proportion are
      // told apart by shape alone before a single mark is read.
      const d = keys.reduce((acc, k) => acc + Math.abs(a[k] - b[k]), 0)
        + Math.round(Math.abs(a.aspect - b.aspect) * 10);
      if (d < VOCAB_FLOOR) {
        close.push(`${PAPER_RESOURCE_IDS[i]} vs ${PAPER_RESOURCE_IDS[j]}: ${d}`);
      }
    }
  }
  assert.deepEqual(close, [],
    'TWO GROUND STACKS NOW READ AS ONE PIECE: ' + close.join('; ') + '\n'
    + 'These nine are the objects a player sees most, drawn at ~22 px in a dialect with no hue to\n'
    + 'spare. Two of them sharing a shape vocabulary means a hold floor stops saying what is on it.\n'
    + 'Give the redrawn one a mark class none of the others uses — see the header\'s own table.');
});

// …and the five properties the header claims BY NAME, each held to exactly one owner. The distance
// above cannot see these: it would be perfectly happy with a set whose members all lost their teeth
// together. Each leg is an EXCLUSION test — the owner has it, and nobody else may.
test('the five named silhouettes are owned by exactly one piece each', () => {
  const V = Object.fromEntries(PAPER_RESOURCE_IDS.map((id) => [id, vocab(id)]));
  const owns = (label, pred, owner) => {
    const hits = PAPER_RESOURCE_IDS.filter((id) => pred(V[id]));
    assert.deepEqual(hits, [owner], `${label}: owned by ${JSON.stringify(hits)}, expected ${owner}`);
  };
  owns('a toothed rim (a long outline whose radius swings)', (v) => v.toothedRims >= 1, 'gear-set');
  owns('a bore (2+ rings with a smaller ring inside them)', (v) => v.concentric >= 2, 'seal-set');
  owns('no filled body at all', (v) => v.filledStraight + v.filledCurved + v.levelEllipses
    + v.frontEllipses === 0, 'turnings');
  owns('an arc-bounded silhouette', (v) => v.filledCurved >= 2, 'spoil-heap');
  owns('a form more than 3× as wide as it is tall', (v) => v.aspect >= 3, 'body-bag');
  // …AND THE NEAR-MISS, RECORDED RATHER THAN LEFT TO BE REDISCOVERED. `gear-set` has ONE concentric
  // pair — the loose nut, which really is a ring with a bore — so the bore test asks for TWO and not
  // for one, and this line is what stops that threshold looking arbitrary. If the nut ever goes, the
  // owner test above still passes and this fails, naming the reason the number is 2.
  assert.equal(V['gear-set'].concentric, 1, 'the gear-set nut stopped being a concentric pair');
});

// ⚠️ AND THE ONE PROPERTY THE VOCABULARY COUNT CANNOT SEE, because a closed stroke and an open one
// are both `fill="none"` and both one `<path>`: whether the curl is OPEN. The whole separation of
// TURNINGS from SEAL SET is that paper shows through the middle of a turning; close the path and the
// piece becomes a nest of rings, at which point two of the nine are the same drawing and every count
// in this file is still perfectly happy.
test('every turning is an OPEN curl — a closed one is a ring, and a ring is the SEAL SET', () => {
  const frag = build('turnings');
  const body = frag.slice(frag.indexOf('scale('));
  const curls = [...body.matchAll(/<path d="(M[^"]+)"/g)].map((m) => m[1]);
  assert.ok(curls.length >= 5, `only ${curls.length} strokes in the pile — it is not being read`);
  for (const d of curls) {
    assert.ok(!/[Zz]/.test(d),
      'A TURNING CLOSED. `Z` makes the curl a ring, the paper stops showing through the middle, and\n'
      + 'the piece becomes the SEAL SET at tile size — the exact collision the silhouette rule is for.');
    const pts = d.slice(1).trim().split(/\s*L\s*/);
    if (pts.length < 6) continue;                    // the two straight stubs are not curls
    assert.notEqual(pts[0], pts[pts.length - 1],
      'a curl returns to its own start — that is a ring drawn the long way round');
    assert.ok(pts.length >= 12,
      `a curl is only ${pts.length} segments; at 22 px a coarse spiral shows its corners and reads `
      + 'as a bent bar, i.e. as PLATE OFFCUT');
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE ACCENT — spent on attention, never on matter
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('not one ground stack and not one damaged twin spends the oxblood', () => {
  // NON-VACUITY FIRST, AND IT IS LIVE RATHER THAN A FIXTURE: a shipped piece that really does emit
  // the accent, so the scan is proven able to find it on the same kind of string it is searching.
  assert.ok(buildItem('battery-bank', { idPrefix: 'ctl' }).includes(ATTEND),
    'the control piece stopped emitting the accent — this scan now proves nothing. Pick another\n'
    + 'piece that does, or delete the leg; do not leave it green and vacuous.');
  const spent = [];
  for (const id of PAPER_RESOURCE_IDS) {
    if (build(id).includes(ATTEND)) spent.push(id);
    if (WRECKED[id] && buildWrecked(id, { idPrefix: 'w-' + id }).includes(ATTEND)) spent.push(id + ' (twin)');
  }
  assert.deepEqual(spent, [],
    'A GROUND STACK SPENDS THE ONE ACCENT: ' + spent.join(', ') + '\n'
    + 'The charter gives the dialect one accent and one job for it — attention, faults, queued\n'
    + 'orders, emotional beats. A pile is none of those; it is a thing lying on a floor. Spending it\n'
    + 'on the most numerous objects in the game leaves nothing for the marks that are ABOUT them.\n'
    + 'The corpse is the piece that most wants it and the piece that most clearly must not have it:\n'
    + 'death is not an alert.');
  // …and the corpse's other identity decision, kept from the warm piece it replaces: the ID tag is
  // a plate with nothing written on it. A builder is a pure function of `opts` and knows nothing
  // about who died, so any name it drew would be the same name for every corpse on the ship.
  const bag = build('body-bag');
  assert.ok(!/<text/.test(bag),
    'THE BODY BAG CARRIES TEXT. Whatever it says, it says it about every corpse on the ship — this\n'
    + 'builder is a pure function of `opts` and cannot know who died. The tag stays blank.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE TWINS — a damaged pile is the same pile, plus marks
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A fragment with its def-id namespace normalised away, so two placements of the same geometry
 *  compare equal. `<prefix>__7` → `#7`, everywhere it appears (defs and `url(#…)` alike). */
const normalise = (svg) => svg.replace(/[A-Za-z0-9-]+__(\d+)/g, 'ID_$1');

test('every twin is its own pristine piece with damage ADDED — never a redraw, never a swap', () => {
  const twinned = PAPER_RESOURCE_IDS.filter((id) => WRECKED[id]);
  assert.equal(twinned.length, 8, '`turnings` is ledgered as having no twin; the other eight have one');
  for (const id of twinned) {
    // ⚠️ RAW ON BOTH SIDES, AND THE REASON IS THAT PREFIX-NESS IS A PROPERTY OF THE PAINTERS, NOT
    // OF THE PICTURE. `sketch()` is a whole-fragment transform: it measures the body to find the
    // ground band and the largest face, and a twin's extra damage elements move both. So the
    // treated twin is not a literal prefix of the treated pristine piece even when the painter
    // relationship is exactly right, and asking here would turn a structural guarantee into a
    // treatment artefact. The TREATED pair is pinned by its own rule — that the two are still
    // tellable apart by more than treatment noise — in `sketch-adoption.test.js`.
    const pristine = normalise(BUILD[id]({ w: 400, h: 400, sketch: false }));
    const twin = normalise(buildWrecked(id, { w: 400, h: 400, sketch: false }));
    const inner = (s) => s.slice(s.indexOf('scale('));
    // ⭐ THE PRISTINE BODY IS A LITERAL PREFIX OF THE TWIN'S, and that is the whole guarantee:
    // `paintResource` runs the pristine painter FIRST and the damage after it, so a twin that had
    // been redrawn by hand — or wired to another row's painter — cannot satisfy this no matter how
    // similar it looks. It is the SWAP guard that the id lists, the badge census and the
    // 87-different-pictures check are all blind to.
    assert.ok(inner(twin).startsWith(inner(pristine).slice(0, inner(pristine).length - '</g></g>'.length)),
      `${id}: the twin does not begin with its own pristine drawing. Either it was redrawn by hand\n`
      + 'or it is painting another row\'s piece — both draw the wrong object on the tile, forever.');
    assert.ok(twin.length > pristine.length + 100, `${id}: the twin added no damage worth seeing`);
  }
});

test('each twin expresses its OWN state — the eight are not one damage pass eight times', () => {
  // The marks are what differ; the pristine prefix is what does not. Strip the shared prefix and the
  // remainder must be unique per piece — a copied damage block would collide here and nowhere else.
  const seen = new Map();
  for (const id of PAPER_RESOURCE_IDS.filter((x) => WRECKED[x])) {
    const pristine = normalise(BUILD[id]({ w: 400, h: 400, sketch: false }));
    const twin = normalise(buildWrecked(id, { w: 400, h: 400, sketch: false }));
    const marks = twin.slice(pristine.length - '</g></g>'.length);
    assert.ok(marks.length > 80, `${id}: the damage pass is too small to be a state`);
    assert.ok(!seen.has(marks), `${id} carries the same damage as ${seen.get(marks)}`);
    seen.set(marks, id);
  }
  assert.equal(seen.size, 8);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE COPIED DRAWING RULE — pinned against the one it was copied from
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THIS IS THE COST OF THE DUPLICATION THE MODULE HEADER DECLARES. `extents`/`scaleOf` are private
// in `fittings.js` and `frameFor` there takes an ID, so a resource cannot be handed to it. The four
// copied lines are therefore pinned by BEHAVIOUR: build a frame from a spec whose `w/d/h` are a real
// fitting's, and every projected point must agree with that fitting's own frame to the digit.
// A change to `BOX`, to the depth ratios, or to the centring rule on either side reddens this.
test('the copied frame derivation agrees with fittings.frameFor, point for point', () => {
  const probes = ['chair', 'locker', 'dining-table', 'storage-crate', 'workbench'];
  for (const fid of probes) {
    const spec = FIT_SPECS[fid];
    assert.ok(spec, `${fid} is no longer a fitting — pick another probe`);
    assert.equal(spec.z0, undefined,
      `${fid} grew a z0. A hung fitting's frame is offset by it and a pile's never is — this probe\n`
      + 'would then be comparing two rules on purpose, which proves nothing. Pick a floor-standing one.');
    const mine = frameForSpec({ w: spec.w, d: spec.d, h: spec.h });
    const theirs = fitFrameFor(fid);
    assert.equal(mine.s, theirs.s, `${fid}: the derived px-per-cm differs`);
    for (const p of [[0, 0, 0], [spec.w, 0, 0], [0, spec.d, 0], [0, 0, spec.h],
      [spec.w, spec.d, spec.h], [spec.w / 3, spec.d / 2, spec.h / 4]]) {
      assert.deepEqual(mine.project(...p), theirs.project(...p),
        `${fid}: the two derivations of one projection disagree at ${JSON.stringify(p)}`);
    }
  }
  // …and the constant really came from the kit rather than being re-typed at 112.
  assert.ok(BOX > 0 && BOX < 128, 'non-vacuity: BOX did not import');
});

test('SIZES is derived at ONE shared scale, so the nine are comparable with every other row', () => {
  // The rule `fittings.SIZES` states and this module copies: `size` is the piece's own centimetres at
  // `PX_PER_CM.catalogue`, NOT its tile proportion. The tell is that a 190 cm bag must be several
  // times the `w` of a 36 cm nest of turnings — under a per-piece scale both would read 112.
  assert.ok(SIZES['body-bag'].w > 3 * SIZES.turnings.w,
    'SIZES went back to the per-piece drawing scale: a body bag and a handful of swarf now claim\n'
    + 'the same footprint, which is false about the objects and false about the drawings.');
  for (const id of PAPER_RESOURCE_IDS) {
    assert.ok(SIZES[id].w > 0 && SIZES[id].h > 0, `${id}: a positive size`);
    assert.equal(BOX_EXTENT[id].w, BOX, `${id}: the drawing scale fills BOX in the larger axis`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE PALETTE — three colours, and no fourth arrives by accident
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the nine paint in ink, paper, the flat tone and the hatch — and nothing else', () => {
  const allowed = new Set([INK, PAPER, PAPER_FLAT, 'none']);
  const strays = [];
  // ⚠️ BOTH SIDES, SINCE 2026-08-05. The treatment BUYS NO COLOUR — it implies pressure with weight
  // and with a paper knockout, never with a grey — so the closure must hold on what ships, and a
  // treated-only leak (a faked lighter stroke) would otherwise be invisible here.
  for (const id of PAPER_RESOURCE_IDS) {
    for (const frag of [build(id), treated(id), treated(id, { state: 'off' })]) {
      for (const m of frag.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"/g)) {
        if (!allowed.has(m[1])) strays.push(`${id}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual([...new Set(strays)], [],
    'A FOURTH COLOUR REACHED A GROUND STACK: ' + strays.join(', ') + '\n'
    + 'The dialect is ink, paper, one flat tone for a turned-away face, and one accent that these\n'
    + 'pieces may not spend. A hex literal here is a colour nobody decided.');
  // NON-VACUITY: the scan must really be reading hex out of these fragments.
  assert.ok(build('body-bag').includes(INK) && build('body-bag').includes(PAPER),
    'the colour scan found no ink and no paper in a piece made of both — it is reading nothing');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE TWIN'S DAMAGE LANDS ON THE PIECE IT DAMAGES
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐⭐ A GUARD CLASS THIS REPO DID NOT HAVE, and the defect it is named for shipped. The only
// neighbouring rule is `paper-fixtures.test.js`'s "every twin's damage lands inside the piece's own
// BOX" — and a box is 240 × 240 of mostly empty paper, so a mark can pass it while floating clear of
// everything drawn. That is exactly what happened: the designer-polish pass narrowed `seal-set`'s
// gasket card to x 3…17, `wrecked.js` anchors its damage in ABSOLUTE centimetres, and the card's
// tear went on running to x = 23 — a dashed curl hanging in clean paper, inside the box, past the
// object. Filed as a residual by 98d2b3e, closed by the repair round, and pinned here so the next
// piece that moves under its own twin fails instead of shipping.
//
// THE RULE: every anchor of every damage mark lies ON the pristine drawing — inside one of its drawn
// areas, or within `TOL` of one of its strokes.
//
// ⛔ THE ONE EXCEPTION IS BY MARK-KIND, NOT BY PIECE, which is what keeps it from becoming a place to
// hide a defect. `inkArea` is the dashed containment ring, and its whole meaning is THE DECK AROUND
// THE OBJECT — `spoil-heap`'s "the deck around it, marked off" and `ice-block`'s meltwater spreading.
// A containment ring that landed on the piece would be the wrong drawing. Every OTHER mark — crack,
// tear, wire, hole, scorch, slit — damages the object and must touch it. Measured: with `inkArea`
// excluded, the whole eight-twin set has exactly ZERO off-piece anchors, so the exception is doing no
// work beyond its own two rings and the floor below is not being met vacuously.
//
// ⚠️ A SCORCH AND A HOLE ARE ANCHORED AT THEIR CENTRE, NOT THEIR RIM. They are REGIONS: a burn that
// laps over the edge of the thing it burned is correct, and asking the rim to be contained would
// condemn it. Every other mark is a run, and a run is anchored at every vertex it turns on.
// ⭐ THE FOUR HELPERS BELOW WERE PRIVATE TO THIS FILE AND ARE NOW SHARED — lifted verbatim into
// `client/test/sketch-geom.js` on 2026-08-06 so `wrecked.test.js` can ask the same two questions of
// all EIGHTY twins instead of these eight. ⛔ THEY ARE IMPORTED RATHER THAN RE-DECLARED: two copies
// of one guard is two answers to "did this mark land on its piece", and the copy nobody is looking at
// is the one that drifts. `DMG_TOL` in particular is now read by two files, and `wrecked.test.js`
// asserts its value out loud so a re-tune here cannot silently loosen a guard over there.
//
// ⚠️ NOTHING LOCAL STAYED. `inPoly2` went too — `sketch-geom.js` already carried the identical
// point-in-polygon under its own name (`inPolygon`), and the lift uses that one rather than shipping
// a third copy of a ray cast.

test('⭐⭐ every twin\'s damage lands ON the piece it damages, not merely inside its box', () => {
  let marksSeen = 0;
  let anchorsSeen = 0;
  const bad = [];
  for (const id of PAPER_RESOURCE_IDS) {
    if (!WRECKED[id]) continue;   // `turnings` is ledgered as having no second condition at all
    const pristine = buildItem(id, { w: 240, h: 240, idPrefix: 'z', sketch: false });
    const twin = buildWrecked(id, { w: 240, h: 240, idPrefix: 'z', sketch: false });
    const marks = damageMarks(id, pristine, twin).filter((t) => !isContainmentRing(t));
    marksSeen += marks.length;
    anchorsSeen += marks.flatMap(damageAnchors).length;
    for (const m of marks) {
      const off = offPieceAnchors(pristine, [m]);
      if (off.length) {
        bad.push(`${id}: ${off.length} anchor(s) off the drawing — `
          + `${off.slice(0, 2).map((q) => `(${q[0].toFixed(1)}, ${q[1].toFixed(1)})`).join(' ')} `
          + `on ${(attrsOf(m).d || m).slice(0, 48)}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    'A TWIN MARKS PAPER THE PRISTINE PIECE DOES NOT OCCUPY:\n  ' + bad.join('\n  ') + '\n'
    + 'The damage is authored in absolute centimetres against the pristine geometry, so a redraw of\n'
    + 'the piece silently strands it. Re-anchor the mark onto the feature it damages — do NOT widen\n'
    + 'the tolerance, which is the one edit that makes this guard stop meaning anything.');
  // ⛔ NON-VACUITY, AS AN INCLUSION FLOOR. A probe that found no marks and a set with no defects read
  // identically green, and the mark-splitter is exactly the part that could silently return [].
  assert.ok(marksSeen >= 25, `only ${marksSeen} damage marks inspected — the splitter found nothing`);
  assert.ok(anchorsSeen >= 100, `only ${anchorsSeen} anchors inspected — the probe is reading nothing`);
});

test('the anchoring guard FAILS on the defect it is named for — driven, both directions', () => {
  const pristine = buildItem('seal-set', { w: 240, h: 240, idPrefix: 'z', sketch: false });
  const twin = buildWrecked('seal-set', { w: 240, h: 240, idPrefix: 'z', sketch: false });
  const marks = damageMarks('seal-set', pristine, twin).filter((t) => !isContainmentRing(t));
  // (a) AS SHIPPED: the re-anchored tear is on the card.
  assert.deepEqual(offPieceAnchors(pristine, marks), [],
    'the shipped seal-set twin already has an off-piece anchor — fix that before reading (b)');
  // (b) THE PRE-FIX GEOMETRY, PLANTED: the tear as it shipped before 2026-08-06, running to x = 23
  // while the card ends at x = 17. Built through the SAME frame the painter uses, so this is the
  // real mark and not a hand-typed pixel, and the guard must name it.
  const F = frameForSpec(SPECS['seal-set'], 240, 240);
  const old = [[7, 34, 14], [15, 33, 11], [23, 34, 13]].map((p) => F.project(...p));
  const planted = `<path d="M${old.map((q) => q.map((v) => Math.round(v * 100) / 100).join(' ')).join(' L')}"`
    + ' fill="none" stroke="#2B2B2B" stroke-width="1.1" stroke-dasharray="2 2"/>';
  const caught = offPieceAnchors(pristine, [planted]);
  assert.ok(caught.length >= 1,
    'the guard PASSES the exact geometry that shipped broken — it cannot see its own subject.\n'
    + `planted: ${planted}`);
  // …and the leg that would hide it: the box rule this guard exists to strengthen says nothing.
  const inBox = old.every(([x, y]) => Math.abs(x) <= 120.05 && Math.abs(y) <= 120.05);
  assert.ok(inBox,
    'the planted mark is outside the 240 box, so `paper-fixtures`\' box rule WOULD have caught it\n'
    + 'and this guard adds nothing. The whole point is that the stranded tear is inside the box.');
});
