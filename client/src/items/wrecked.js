// The 70 WRECKED builders — the POST-RAID twin of every static piece in the warm item set
// (docs/design/perilune-item-set.dc.html, section "Wrecked — post-raid state", imported 2026-07-28).
// Pure `(opts) -> string` SVG-`<g>`-fragment builders in the same centred mock-px space as
// objects.js / fixtures.js / resources.js / cryo.js; see helpers.js for the
// coordinate model.
//
// The mock's own premise, verbatim: *"Day 1: the raid left every system dead. Every item above has a
// broken twin here — scorched, cracked, breached, screens dark, wiring hanging loose — that the
// thawed crew must repair or rebuild. Each keeps one identifying feature so it still reads as the
// same object."*
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ NOT WIRED TO EITHER SURFACE. Deliberate, and it is the honest state of this package.
//
// Nothing on the wire tells a surface how damaged a device is — `Device.Condition` exists in the sim
// and is read by `DeconstructSystem` (E0-5 gave it its second consumer) but has NO wire channel, so
// no client code can choose between a piece and its twin. This module therefore ships the ART and
// the JOIN and stops there. The draw decision ("below what condition does a tile wear its wrecked
// twin?") is a later integration owned by neither this lane nor the `devices` channel lane.
//
// Registered surfaces are UNTOUCHED by this file: nothing in `client/src/ui/` imports it, and
// `index.js` does not know it exists. The dependency runs ONE WAY — `wrecked.js` imports `ITEMS`,
// never the reverse — so the whole set reverts by deleting this file and its test.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE JOIN IS BY itemId, NOT BY `kind`, AND THAT IS THE POINT (CLAUDE.md trap 6). The sixth trap
// shape is a predicate over "what a glyph resolves to", defeated by `GLYPH_SUBSTITUTE` — a device
// wearing ANOTHER piece's art, so the borrowed row's `kind` is not a fact about the tile. It shipped
// DEMOLISH dead on every lamp with the suite green before AND after the fix. A wrecked twin is
// therefore addressed by the PRISTINE itemId and nothing else: `WRECKED` is keyed by it, and its key
// set is asserted to be exactly `ITEM_IDS`, in order, with no reference to `kind` anywhere in the
// lookup path. A future substitution that makes a Light wear `wall-lamp`'s art still resolves to
// `wall-lamp`'s twin, which is the correct answer for "the art on this tile, wrecked".
//
// ⚠️ THE MOCK'S LABELS COLLIDE, AND THE RENAME IS NOT MECHANICAL. A label is unique only within a
// section, so 62 wrecked pieces reuse the pristine label VERBATIM (`REACTOR` is both). The 8 loose
// resources are renamed with a `· STATE` suffix — and `CONTROLLER · FRIED` also SHORTENS its stem
// from `CONTROLLER MODULE`. Any code that tried to derive one label from the other by string surgery
// would be right 69 times and wrong once, silently. `mockLabel` is therefore carried per row and
// cross-checked against the committed spec by `client/test/wrecked.test.js`, which parses the
// mock's own `brokenD` array — the labels are PROVEN against the source, not remembered.
//
// ⚠️ THE 70 WRECKED PIECES ARE NOT IN THE SPEC'S MARKUP. They exist only after JS execution: the
// `brokenD` array lives inside `<script type="text/x-dc" data-dc-script>` and renders through
// `<sc-for>`. An extractor that greps `class="lbl"` finds the 70 PRISTINE labels and the literal
// template text `{{b.name}}`, and silently misses every wrecked piece. Read the array.
//
// PURITY. Same contract as every other builder: "no DOM, no clock, no randomness — same input ⇒
// byte-identical output" (helpers.js:1-7). ⚠️ THAT MATTERS MORE HERE THAN ANYWHERE ELSE IN THE SET.
// Damage LOOKS like scatter, and a builder that derived its scorch marks or crack angles from
// `Math.random` would not present as an obvious bug — it would present as a golden-frame flake, a
// screenshot that differs from itself, blamed on the renderer for as long as it took to find. Every
// coordinate below is AUTHORED, transcribed from the mock's fixed numbers, and there is no scatter
// term anywhere in this file for anything to reach into.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TRANSLATION: CSS `.obj` DIVS → SVG.
//
// The mock draws each wrecked piece as a stack of absolutely-positioned divs, built from a shared
// helper vocabulary in `renderVals()`: `box` / `L(T(…) + css)` plus the seven damage marks
// `scorch` · `crack` · `spark` · `wire` · `rust` · `hole` · `dead`. Those helpers are mirrored
// one-for-one below, with `s` threaded as the first argument and the CSS tail replaced by named
// options, so a piece here reads line-for-line against the mock and a reviewer can diff them.
//
// Six CSS features needed a decision, each made once, here:
//
// 1. `transform: translate(-50%,-50%) translate(Xpx,Ypx) rotate(Ndeg)` → an SVG `<g transform>`.
//    ⚠️ The mock's `box(…, extra)` / `L(T(…) + css)` sometimes RE-DECLARES `transform` in the CSS
//    tail, and in CSS the LAST declaration wins — so the helper's own translate is silently
//    discarded and only the tail's counts. **THIRTEEN layers do this**, MEASURED off the shipped
//    array (`transform:` appearing twice in one style string), not counted by eye: REACTOR ·
//    BATTERY BANK ×2 · OXYGEN TANK · PASTE DISPENSER · DINING TABLE · BUNK BED · CHAIR ×2 ·
//    FUEL DRUM · SUPPLY BARREL · DECK SIGN · FLOODLIGHT. Rotation is an explicit `rot` option here,
//    so that override cannot exist and cannot be mis-read.
//    ⚠️ THE FIRST DRAFT OF THIS NOTE SAID "NINE" AND NAMED THE WRONG SET — it invented LOCKER
//    (whose rotation comes from `T`'s own third argument, not from an override) and missed five.
//    Kept as a correction rather than silently fixed: this is `CLAUDE.md`'s **re-count, never
//    compute** in miniature, and a wrong number in a comment is how the next reader learns a wrong
//    rule.
// 2. `box-shadow` splits three ways, exactly as resources.js found:
//      • `inset 0 0 0 Npx <c>`      → `inset: [N, c]`   — a hard inner ring (an SVG inset stroke)
//      • `0 0 0 Npx <c>`            → `outset: [N, c]`  — a hard OUTER ring (VIEWPORT's frame)
//      • `inset 0 0 Npx <c>` (blur) → `shade: [N, c]`   — a soft inner vignette, drawn as a RADIAL
//        FILL from transparent at the middle to the colour at the rim. SVG blur is a filter; filters
//        are not in this set's vocabulary and a filter on 501 layers would cost more than the effect
//        is worth. ⚠️ It WAS a wide low-opacity inner STROKE, and that was wrong on screen rather
//        than merely approximate — see `shadeFill`, which records what the gallery's mock-versus-SVG
//        column showed and why two constants in it are measured rather than chosen.
//      • `0 3px 8px rgba(0,0,0,.5)` (drop shadow) → DROPPED. The 70 pristine furniture pieces drop
//        theirs too; only `resources.js`'s loose piles keep a contact shadow, because a pile has no
//        outline of its own. Dropping it here keeps the two halves of the set consistent.
// 3. `repeating-linear-gradient` → `stripes()`, an SVG `<pattern>`. ⚠️ Diagonal (45deg) handedness
//    is NOT pinned: CSS measures the gradient AXIS anticlockwise from "up", SVG's `patternTransform`
//    rotates clockwise with y down. Every 45deg use in this file is hazard tape, which reads as
//    hazard tape either way, so the sign is chosen for looks and stated here rather than argued.
// 4. `background-image: linear-gradient(...)/radial-gradient(...)` + `background-size` → `grid()`
//    and `dots()`, both `<pattern>`s. `background-position` is a phase shift only and is DROPPED.
// 5. `clip-path: polygon(0 0,100% 0,50% 100%)` → `icicle()`, a drawn triangle. SVG needs no clip
//    for a triangle, and a `<clipPath>` per icicle would put four more ids in every fragment.
// 6. `conic-gradient` → the resources.js ruling, applied twice and DIFFERENTLY, because the two
//    uses mean different things:
//      • PARTS · SEIZED's cogs → REAL TEETH via `gearPath` (imported from resources.js, not
//        re-derived). At tile size a pie of grey wedges is a grey disc; the toothed silhouette is
//        the entire reason a cog reads as a cog. This is the pristine `parts` piece's own decision.
//      • VENT FAN's blades → four quarter SECTORS, which is what `fixtures.js`'s pristine `ventFan`
//        already does (`fixtures.js:179-180`). A fan IS a disc with alternating quadrants; teeth
//        would make it a cog. Two conic gradients, two answers, and the difference is deliberate.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { item, roundedRectPath, r3, INK } from './helpers.js';
import { gearPath } from './resources.js';
import { ITEMS, ITEM_IDS, placeholderItem } from './index.js';
import {
  paintFitting, line as fLine, disc as fDisc, curve as fCurve,
} from './fittings.js';

// ── the layer primitive ──────────────────────────────────────────────────────────────────────

/** CSS `border-radius` → the per-corner radii `roundedRectPath` wants. `'50%'` is handled by L. */
function corners(w, h, r) {
  if (r == null) return {};
  const one = (v) => (typeof v === 'string' && v.endsWith('%') ? (parseFloat(v) / 100) * w : v);
  const a = Array.isArray(r) ? r : [r, r, r, r];
  return { tl: one(a[0]), tr: one(a[1]), br: one(a[2]), bl: one(a[3]) };
}

/** Shrink a radius spec by `d` px, for an inner ring that follows the outer curve. */
function shrink(r, d) {
  if (r == null) return null;
  const one = (v) => (typeof v === 'string' ? v : Math.max(0, v - d));
  return Array.isArray(r) ? r.map(one) : one(r);
}

function ring(w, h, r, width, color, opacity) {
  const i = width / 2;
  const d = roundedRectPath(-w / 2 + i, -h / 2 + i, w - width, h - width, corners(w - width, h - width, shrink(r, i)));
  const op = opacity == null ? '' : ` opacity="${r3(opacity)}"`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r3(width)}"${op}/>`;
}

function eRing(w, h, width, color, opacity) {
  const i = width / 2;
  const op = opacity == null ? '' : ` opacity="${r3(opacity)}"`;
  return `<ellipse cx="0" cy="0" rx="${r3(w / 2 - i)}" ry="${r3(h / 2 - i)}" fill="none" stroke="${color}"`
    + ` stroke-width="${r3(width)}"${op}/>`;
}

/**
 * `shade: [N, colour]` — CSS `box-shadow: inset 0 0 Npx <colour>`, a BLURRED inner glow.
 *
 * ⚠️ THIS WAS A HARD INNER STROKE IN THE FIRST DRAFT AND IT WAS WRONG ON SCREEN, not merely
 * approximate. The gallery's mock-versus-SVG column showed it immediately: on HULL PLATING's breach
 * (`inset 0 0 14px rgba(90,140,180,.35)`) a 14px stroke drew a crisp pale-blue RING round the hole
 * where the mock has a soft cold bloom, and it read as a deliberate highlight rather than as damage.
 * A radial fill from transparent at the middle to the colour at the rim is the same optical effect
 * without a filter: no `<filter>` in this set's vocabulary, no per-layer blur cost.
 *
 * The ramp starts at `1 − 0.6·N/(min(w,h)/2)` — the blur radius as a fraction of the shape's own
 * half-extent, so the same `N` reads the same on a 44px breach and an 80px hatch, times 0.6.
 * ⚠️ THE 0.6 IS NOT A FUDGE, it is the difference between the two curves. A CSS inset blur is a
 * GAUSSIAN whose energy piles up against the rim and is essentially gone one radius in; a linear
 * SVG ramp over the same distance spreads the same darkness evenly and reads far heavier. Measured
 * on the worst case in the set — HATCH / LADDER's `inset 0 0 22px rgba(0,0,0,.9)` on an 80px disc,
 * where the full-width ramp swallowed the rungs the piece is identified by — against the mock in
 * the gallery's own middle column.
 */
/**
 * ⚠️ AND THE RAMP IS ALSO FLATTENED TO 0.7 OF ITS DECLARED ALPHA. An SVG radial gradient over a
 * NON-SQUARE box reaches its final stop at the midpoint of each side and then PADS to the corners,
 * so an elongated shape wears the terminal colour round most of its rim at full strength. On HULL
 * PLATING's breach (`rgba(90,140,180,.35)` over a 44×38 blob) that painted a crisp cyan ring — a
 * portal, not a hull breach. Measured against the mock in the gallery's middle column, twice.
 */
const SHADE_OPACITY = 0.7;

function shadeFill(s, w, h, width, color) {
  const half = Math.min(w, h) / 2;
  const inner = half > 0 ? Math.max(0, Math.min(0.95, 1 - (width * 0.6) / half)) : 0;
  return s.rad([['0', fade(color)], [String(r3(inner)), fade(color)], ['1', color]]);
}

/**
 * ONE LAYER — the mock's `L(T(x,y,rot) + 'width:Wpx;height:Hpx;…')`, drawn as a rounded rect (or an
 * ellipse when `r` is `'50%'`) centred on (x,y).
 *
 * @param {object} o { rot, r, fill, opacity, inset:[w,c], outset:[w,c], shade:[w,c] }
 */
function L(s, x, y, w, h, o = {}) {
  const parts = [];
  const fill = o.fill == null ? 'none' : o.fill;
  const op = o.opacity == null ? '' : ` opacity="${r3(o.opacity)}"`;
  if (o.r === '50%') {
    parts.push(`<ellipse cx="0" cy="0" rx="${r3(w / 2)}" ry="${r3(h / 2)}" fill="${fill}"${op}/>`);
    if (o.outset) parts.push(eRing(w + o.outset[0] * 2, h + o.outset[0] * 2, o.outset[0], o.outset[1]));
    if (o.inset) parts.push(eRing(w, h, o.inset[0], o.inset[1]));
    if (o.shade) {
      parts.push(`<ellipse cx="0" cy="0" rx="${r3(w / 2)}" ry="${r3(h / 2)}" fill="${shadeFill(s, w, h, o.shade[0], o.shade[1])}" opacity="${SHADE_OPACITY}"/>`);
    }
  } else {
    const d = roundedRectPath(-w / 2, -h / 2, w, h, corners(w, h, o.r));
    parts.push(`<path d="${d}" fill="${fill}"${op}/>`);
    if (o.outset) {
      const [ow, oc] = o.outset;
      parts.push(ring(w + ow * 2, h + ow * 2, shrink(o.r, -ow), ow, oc));
    }
    if (o.inset) parts.push(ring(w, h, o.r, o.inset[0], o.inset[1]));
    if (o.shade) parts.push(`<path d="${d}" fill="${shadeFill(s, w, h, o.shade[0], o.shade[1])}" opacity="${SHADE_OPACITY}"/>`);
  }
  const t = o.rot
    ? `translate(${r3(x)} ${r3(y)}) rotate(${r3(o.rot)})`
    : `translate(${r3(x)} ${r3(y)})`;
  s.raw(`<g transform="${t}">${parts.join('')}</g>`);
}

/** The mock's `box(x,y,w,h,bg,extra)` — an `L` whose default `border-radius` is 5px. */
const box = (s, x, y, w, h, fill, o = {}) => L(s, x, y, w, h, { r: 5, fill, ...o });

// ── paints ───────────────────────────────────────────────────────────────────────────────────

/** CSS `linear-gradient(a,b)` (or `90deg`/`135deg` via `dir`). */
const grad = (s, a, b, dir) => s.lin([['0', a], ['1', b]], dir);
/** CSS `linear-gradient(90deg, a, b 55%, c)` — the three-stop steel/tank bodies. */
const grad3 = (s, a, b, c, dir = 'h') => s.lin([['0', a], ['0.55', b], ['1', c]], dir);
/** CSS `radial-gradient(circle[ at cx% cy%], a, b)`. */
const rgrad = (s, a, b, cx = 0.5, cy = 0.5) => s.rad([['0', a], ['1', b]], { cx, cy });
/** CSS `radial-gradient(ellipse, c, transparent 70%)` — the puddles and pooled spills. */
const pool = (s, c, edge = 0.7) => s.rad([['0', c], [String(edge), fade(c)], ['1', fade(c)]]);

/** rgba(r,g,b,a) → the same colour at alpha 0. Named colours are returned unchanged. */
function fade(c) {
  const m = c.match(/^rgba?\(([^)]+)\)$/i);
  return m ? `rgba(${m[1].split(',').slice(0, 3).map((p) => p.trim()).join(',')},0)` : 'rgba(0,0,0,0)';
}

/**
 * CSS `repeating-linear-gradient(<deg>, a 0 <p>px, b <p>px <q>px)` as an SVG pattern paint.
 * Bands run along x in the pattern's own space; `patternTransform` turns that into the CSS angle.
 * See translation note 3 — the 45deg handedness is not pinned.
 */
function stripes(s, deg, a, p, b, q) {
  const inner = `<rect width="${r3(q)}" height="${r3(q)}" fill="${a}"/>`
    + `<rect x="${r3(p)}" width="${r3(q - p)}" height="${r3(q)}" fill="${b}"/>`;
  const rot = deg === 90 ? 0 : deg === 0 ? 90 : -deg;
  return s.pat(inner, { w: q, h: q, transform: rot ? `rotate(${r3(rot)})` : null });
}

/** CSS crossed `linear-gradient` hairlines at a `gw × gh` pitch — the tile / panel grids. */
const grid = (s, gw, gh, width, color) =>
  s.pat(
    `<rect width="${r3(gw)}" height="${r3(width)}" fill="${color}"/>`
    + `<rect width="${r3(width)}" height="${r3(gh)}" fill="${color}"/>`,
    { w: gw, h: gh },
  );

/** CSS `radial-gradient(<c> Rpx, transparent)` + `background-size` — a dot screen. */
const dots = (s, size, r, color) =>
  s.pat(`<circle cx="${r3(size / 2)}" cy="${r3(size / 2)}" r="${r3(r)}" fill="${color}"/>`, { w: size, h: size });

/** CSS `repeating-linear-gradient(0deg, c 0 2px, transparent 2px Npx)` — METAL GRATING's bars. */
const bars = (s, period, thick, color) =>
  s.pat(`<rect width="${r3(period)}" height="${r3(thick)}" fill="${color}"/>`, { w: period, h: period });

/** The three palette constants the mock's `renderVals()` declares. */
const STL = (s) => grad(s, '#414b55', '#2d353d');
const STLd = (s) => grad(s, '#39424c', '#262e35');
const WOOD = (s) => grad(s, '#5f4a30', '#463623');

// ── the damage vocabulary — one emitter per mock helper, same argument order ──────────────────

/** `scorch(x,y,r=34)` — a soot bloom. */
const scorch = (s, x, y, r = 34) =>
  s.circle({ cx: x, cy: y, r: r / 2, fill: pool(s, 'rgba(16,11,8,.85)') });

/**
 * `crack(x,y,len,rot)` — a dark split with the mock's 1px lifted highlight under it
 * (`box-shadow:0 1px 0 rgba(255,255,255,.1)`, zero blur, so it is a hard offset copy).
 *
 * ⚠️ Both bars live in ONE rotated group, and that is not a tidiness choice. A CSS box-shadow
 * offset is measured in the element's OWN box and then transformed with it, so the highlight sits
 * 1px "below" the crack ALONG THE CRACK, not 1px down the screen. Emitting the highlight as a
 * separate layer at `y + 1` would put it 1px down the screen instead, and on a crack rotated 60–74°
 * (there are several) the two bars would visibly separate.
 */
const crack = (s, x, y, len, rot) => {
  const t = rot ? `translate(${r3(x)} ${r3(y)}) rotate(${r3(rot)})` : `translate(${r3(x)} ${r3(y)})`;
  s.raw(
    `<g transform="${t}">`
    + `<rect x="${r3(-len / 2)}" y="0" width="${r3(len)}" height="2" fill="rgba(255,255,255,.1)"/>`
    + `<rect x="${r3(-len / 2)}" y="-1" width="${r3(len)}" height="2" fill="rgba(14,10,7,.92)"/>`
    + '</g>',
  );
};

/** `spark(x,y)` — a live amber arc: the glow first, then the dot. */
const spark = (s, x, y) => {
  s.glow(x, y, 11, 'rgba(242,181,99,.7)');
  s.circle({ cx: x, cy: y, r: 3, fill: '#f2b563' });
};

/** `wire(x,y,rot)` — a loose lead, dark at the root and copper at the torn end. */
const wire = (s, x, y, rot) =>
  L(s, x, y, 26, 3, { rot, r: 2, fill: grad(s, '#2b2018', '#c9772f', 'h') });

/** `rust(x,y,r=24)` — an oxide stain, wider than it is tall. */
const rust = (s, x, y, r = 24) =>
  s.ellipse({ cx: x, cy: y, rx: r / 2, ry: Math.round(r * 0.7) / 2, fill: pool(s, 'rgba(138,60,34,.7)') });

/**
 * `hole(x,y,r=20)` — a hull breach: a black blob with a hard inner lip and a warm scorched rim.
 * The mock's `border-radius:52% 42% 56% 44%` is what stops it being a circle; `roundedRectPath`
 * clamps each corner to half the short side, so the asymmetry survives partially and the shape
 * stays a blob rather than becoming a disc.
 */
const hole = (s, x, y, r = 20) => {
  const h = Math.round(r * 0.85);
  L(s, x, y, r, h, {
    r: ['52%', '42%', '56%', '44%'],
    fill: '#0a0d11',
    inset: [2, 'rgba(0,0,0,.85)'],
    outset: [1, 'rgba(120,90,60,.3)'],
  });
};

/** `dead(x,y,w,h)` — an unlit screen. The set's one honest way to say "no power reaches this". */
const dead = (s, x, y, w, h) =>
  L(s, x, y, w, h, { r: 3, fill: grad(s, '#1a1f24', '#11151a'), inset: [1, '#2b3742'] });

/** A downward icicle — the mock's `clip-path:polygon(0 0,100% 0,50% 100%)` on a w×h box. */
const icicle = (s, x, y, w, h, top, bot) =>
  s.path(`M${r3(x - w / 2)},${r3(y - h / 2)}L${r3(x + w / 2)},${r3(y - h / 2)}L${r3(x)},${r3(y + h / 2)}Z`,
    { fill: grad(s, top, bot) });

// ── the 70 builders, keyed below by the PRISTINE itemId ───────────────────────────────────────
// Order follows `ITEM_IDS` (objects → walls → floors → fixtures → resources → cryo), NOT the mock's
// own wrecked-section order, which is shuffled. Each body transcribes the mock's layer list in the
// mock's paint order.

const reactor = (s) => {
  box(s, 0, 0, 96, 88, STLd(s), { r: 8, inset: [3, '#232b33'] });
  box(s, -40, 0, 14, 64, grad(s, '#4a5560', '#2d353d', 'h'));
  box(s, 40, 6, 14, 46, grad(s, '#4a5560', '#2d353d', 'h'), { rot: 14 });
  L(s, 0, -4, 52, 52, { r: '50%', fill: rgrad(s, '#3a3129', '#1b1713', 0.5, 0.4), inset: [4, '#2b3742'] });
  crack(s, -2, -4, 44, 28); crack(s, 4, -10, 30, -46);
  scorch(s, 18, 14, 46); hole(s, -18, 22, 22); wire(s, 34, -26, 34); spark(s, -24, -22);
  dead(s, 0, 34, 66, 12);
};

const solarPanel = (s) => {
  box(s, 0, 0, 92, 56, grad(s, '#26424f', '#1d3541'), { r: 4, inset: [4, '#9e9074'] });
  L(s, 0, 0, 92, 56, { fill: grid(s, 22, 18, 2, 'rgba(0,0,0,.4)') });
  hole(s, -22, -6, 26); crack(s, 14, 6, 46, 24); crack(s, 20, -12, 34, -32);
  scorch(s, 30, 12, 34); rust(s, -34, 16);
};

const batteryBank = (s) => {
  box(s, -16, 0, 26, 56, STLd(s), { r: 4, inset: [2, '#1c242d'] });
  box(s, 17, 3, 26, 56, STLd(s), { r: 4, inset: [2, '#1c242d'], rot: 11 });
  box(s, -16, 8, 16, 30, '#2a3129', { r: 2, inset: [1, '#4a5560'] });
  box(s, 17, 12, 16, 22, '#2a3129', { r: 2, inset: [1, '#4a5560'], rot: 11 });
  scorch(s, 18, -18, 26); crack(s, -16, -14, 20, 18); wire(s, -4, -32, -22);
  spark(s, 22, -26); rust(s, -28, 24, 16);
};

const o2Scrubber = (s) => {
  box(s, 0, 0, 62, 66, STLd(s), { r: 6, inset: [2, '#2b3742'] });
  L(s, 0, -14, 46, 22, { r: 3, fill: stripes(s, 90, '#20272d', 5, '#4a545e', 9) });
  hole(s, 8, -14, 20); dead(s, 0, 14, 46, 13); crack(s, -14, 8, 26, -34);
  scorch(s, -20, -20, 32); wire(s, -36, -6, 12); rust(s, 24, 22, 22);
};

const oxygenTank = (s) => {
  box(s, -19, 2, 36, 72, grad3(s, '#4f7d95', '#2b4b5c', '#1f3946'), { r: 18, inset: [3, '#274f61'] });
  box(s, 20, 6, 36, 62, grad(s, '#48737f', '#26414f', 'h'), { r: 18, inset: [3, '#274f61'], rot: 18 });
  hole(s, -19, -6, 22); crack(s, 20, 4, 40, 74); scorch(s, -2, 26, 34);
  rust(s, -30, 26, 22); wire(s, -19, -40, -40);
};

const waterRecycler = (s) => {
  box(s, 0, 0, 64, 70, STLd(s), { r: 6, inset: [2, '#2b3742'] });
  box(s, 0, 6, 42, 34, grad(s, '#274a58', '#1b3540'), { r: 4 });
  L(s, 0, 16, 42, 12, { fill: 'rgba(120,170,190,.35)' });
  crack(s, 0, -2, 38, 16); hole(s, 20, -18, 18); scorch(s, -22, 20, 32);
  L(s, -16, 40, 30, 10, { r: '50%', fill: pool(s, 'rgba(120,170,190,.45)') });
  rust(s, 30, 4, 20);
};

const hydroponics = (s) => {
  box(s, 0, 0, 92, 48, '#3f3122');
  L(s, -6, -9, 60, 12, { r: 2, fill: stripes(s, 90, '#4a4530', 11, '#3a3626', 20) });
  L(s, 2, 9, 44, 12, { r: 2, fill: stripes(s, 90, '#54452a', 11, '#42361f', 20) });
  crack(s, 24, -9, 30, 8); hole(s, 34, 8, 18); scorch(s, -30, 10, 30); rust(s, 30, -18, 20);
};

const cooker = (s) => {
  box(s, 0, 0, 66, 52, grad(s, '#2f363e', '#22282e'), { r: 6, inset: [2, '#1c242d'] });
  L(s, -14, 0, 22, 22, { r: '50%', fill: rgrad(s, '#3a3129', '#1b1713') });
  L(s, 16, 0, 22, 22, { r: '50%', fill: rgrad(s, '#4a3a2a', '#221a12') });
  crack(s, 0, -16, 40, 12); scorch(s, 20, 16, 38); wire(s, -32, 18, 26); spark(s, -6, -18);
};

const cooler = (s) => {
  box(s, 0, 0, 56, 74, grad(s, '#a8b2b8', '#8b969f'), { r: 6, inset: [3, '#6f7c85'] });
  box(s, 0, -16, 40, 26, grad(s, '#3f4c54', '#2b353c'), { r: 3 });
  hole(s, 6, -16, 22);
  box(s, 0, 16, 40, 26, '#9aa6ae', { r: 3, inset: [2, '#6f7c85'] });
  crack(s, -4, 16, 30, -22); scorch(s, -22, 30, 30); rust(s, 24, 6, 22);
  L(s, 0, 44, 26, 8, { r: '50%', fill: pool(s, 'rgba(150,200,220,.4)') });
};

const pasteDispenser = (s) => {
  box(s, 0, 0, 58, 64, STLd(s), { r: 6, inset: [2, '#2b3742'] });
  dead(s, 0, -8, 30, 12);
  box(s, 0, 22, 40, 8, '#7d7156', { r: 2, rot: -8 });
  crack(s, 0, 6, 30, -18); hole(s, -20, 6, 14); scorch(s, 22, -22, 24); wire(s, 30, 14, -18);
};

const diningTable = (s) => {
  box(s, -4, 2, 74, 48, WOOD(s), { r: 8, rot: -7 });
  crack(s, -4, 0, 60, 8); crack(s, 6, 10, 30, -42); scorch(s, 24, -14, 30);
  L(s, -50, 6, 18, 18, { r: '50%', fill: '#33281b' });
  L(s, 48, 12, 18, 18, { r: '50%', fill: '#33281b', rot: 24 });
  rust(s, -30, 22, 18);
};

const bunkBed = (s) => {
  box(s, 0, 0, 56, 80, '#5f4a33', { r: 8 });
  L(s, -2, -4, 48, 52, { r: 5, fill: stripes(s, 90, '#6e3a2a', 11, '#5d3222', 22) });
  L(s, 2, -24, 34, 14, { r: 4, fill: '#a89b85', rot: -12 });
  crack(s, 0, 8, 40, 14); hole(s, -16, 24, 18); scorch(s, 18, 20, 30); rust(s, 20, -26, 18);
};

const desk = (s) => {
  box(s, 0, 4, 88, 44, WOOD(s));
  dead(s, 20, -16, 30, 18);
  crack(s, -4, 4, 46, 6); crack(s, -20, 14, 22, -34); scorch(s, -34, -10, 22);
  wire(s, 40, -8, 22); spark(s, 36, -22);
};

const chair = (s) => {
  box(s, 0, 4, 44, 44, '#3a2c1e', { r: 8, rot: -14 });
  box(s, 2, -20, 44, 14, '#4a3826', { r: 6, rot: -26 });
  crack(s, 0, 4, 30, 22); scorch(s, 16, 18, 26); rust(s, -18, -6, 18);
};

const locker = (s) => {
  box(s, 0, 0, 52, 80, grad(s, '#414b55', '#30383f', 'h'), { inset: [2, '#2b3742'] });
  L(s, 0, 0, 2, 80, { fill: 'rgba(0,0,0,.5)' });
  L(s, 20, -6, 24, 76, { r: 3, fill: grad(s, '#39424c', '#262e35', 'h'), inset: [2, '#2b3742'], rot: 14 });
  L(s, -16, 4, 5, 12, { r: 2, fill: '#8a7248' });
  hole(s, -8, 26, 14); crack(s, -14, -20, 22, 24); scorch(s, -22, 34, 22); rust(s, 24, 30, 16);
};

const rug = (s) => {
  L(s, 0, 0, 96, 64, { r: 8, fill: stripes(s, 90, '#6b3226', 14, '#5b2b1f', 28), inset: [5, '#8a775a'] });
  hole(s, -20, 6, 26); hole(s, 24, -12, 20); scorch(s, 18, 18, 34);
  L(s, 0, 26, 96, 8, { fill: stripes(s, 90, '#6b3226', 6, 'transparent', 12) });
};

const standingLamp = (s) => {
  L(s, -8, -20, 44, 44, { r: '50%', fill: rgrad(s, '#3a3129', '#1b1713'), inset: [2, '#2b241c'], rot: -34 });
  crack(s, -8, -20, 30, 18);
  L(s, 0, 20, 6, 44, { fill: '#3a2c1e' });
  L(s, 0, 42, 26, 6, { r: 3, fill: '#3a2c1e' });
  wire(s, 20, -6, 40); spark(s, 6, -34);
};

const pottedPlant = (s) => {
  L(s, 0, -12, 50, 44, { r: '50%', fill: rgrad(s, '#6b6440', '#40391f', 0.45, 0.4) });
  L(s, -14, -22, 22, 5, { r: 2, fill: '#5a5230', rot: -30 });
  L(s, 16, -6, 18, 4, { r: 2, fill: '#4a4326', rot: 40 });
  L(s, 4, 30, 34, 28, { r: [0, 0, 10, 10], fill: grad(s, '#5f3f26', '#452c19'), rot: 12 });
  crack(s, 4, 26, 22, -10);
  L(s, -22, 40, 26, 10, { r: '50%', fill: pool(s, 'rgba(90,70,45,.6)') });
};

const bookshelf = (s) => {
  box(s, 0, 0, 80, 66, '#3f3122', { inset: [3, '#322718'] });
  L(s, -14, -14, 34, 20, { fill: stripes(s, 90, '#5a3a2a', 8, '#3a2a1e', 11) });
  L(s, 18, 12, 26, 16, { fill: stripes(s, 90, '#4a4a32', 8, '#33301f', 11), rot: 16 });
  hole(s, 22, -16, 20); crack(s, 0, 0, 50, 6); scorch(s, -26, 20, 30);
};

const medBed = (s) => {
  box(s, 0, 0, 52, 78, '#8f7f5c', { r: 6, inset: [3, '#6f6144'] });
  L(s, 2, -26, 36, 14, { r: 4, fill: '#a89b85', rot: -14 });
  crack(s, 0, 6, 36, 12); hole(s, -14, 22, 18); scorch(s, 16, 24, 30);
  L(s, 0, 6, 22, 5, { fill: '#6e3a2a' });
  L(s, 0, 6, 5, 22, { fill: '#6e3a2a' });
  rust(s, 20, -20, 18);
};

const researchConsole = (s) => {
  box(s, 0, 0, 80, 52, grad(s, '#2b333b', '#1e242a'), { r: 6 });
  dead(s, 0, -8, 66, 26); crack(s, -6, -8, 46, 14); crack(s, 10, -16, 26, -40); hole(s, 24, -6, 16);
  L(s, 0, 18, 66, 8, { r: 2, fill: '#232b33' });
  wire(s, -38, 12, 24); spark(s, 28, -22);
};

const commsDish = (s) => {
  L(s, -6, -14, 64, 34, {
    r: ['50%', '50%', 8, 8], fill: grad(s, '#8f8266', '#5f5645'), inset: [2, '#6f6552'], rot: -28,
  });
  hole(s, -14, -18, 22); crack(s, 4, -10, 34, 16);
  L(s, 6, 20, 6, 44, { r: 3, fill: '#2d353d', rot: 18 });
  L(s, 2, 40, 28, 7, { r: 3, fill: '#2d353d' });
  wire(s, 24, 6, -32); spark(s, -20, -30);
};

const sensorArray = (s) => {
  // the mock's `border:2px solid` — an outline ring, not a fill
  L(s, 0, 0, 72, 72, { r: '50%', inset: [2, '#2d353d'] });
  L(s, 0, 0, 48, 48, { r: '50%', inset: [2, '#2d353d'] });
  L(s, 0, 0, 14, 14, { r: '50%', fill: '#1b1f24', inset: [2, '#2d353d'] });
  crack(s, -8, -6, 46, 34); crack(s, 14, 12, 30, -22); hole(s, 24, -18, 18);
  scorch(s, -24, 22, 30); spark(s, 18, 22);
};

const workbench = (s) => {
  box(s, 0, 6, 96, 44, WOOD(s), { r: 4 });
  box(s, 0, -24, 96, 14, '#33281b', { r: 3 });
  L(s, -30, -24, 6, 22, { fill: '#5f6b74' });
  L(s, 10, -26, 18, 6, { fill: '#7d7156', rot: 26 });
  crack(s, 0, 6, 56, 8); hole(s, 30, 8, 18); scorch(s, -30, 18, 28); wire(s, 38, -18, 30);
};

const fabricator = (s) => {
  box(s, 0, 0, 78, 72, STLd(s), { r: 6, inset: [3, '#2b3742'] });
  box(s, 0, -6, 58, 38, grad(s, '#141a20', '#0c1014'), { r: 3 });
  hole(s, -10, -8, 24); crack(s, 16, -4, 32, 26);
  L(s, 0, 24, 58, 9, { r: 2, fill: '#232b33' });
  scorch(s, 24, 20, 34); wire(s, -34, 16, 20); spark(s, 26, -26);
};

const storageCrate = (s) => {
  box(s, 0, 0, 64, 60, grad(s, '#5f4a30', '#42321f'), { inset: [2, '#322718'] });
  L(s, 0, 0, 64, 9, { fill: '#322718' });
  L(s, 0, 0, 9, 60, { fill: '#322718' });
  crack(s, -6, -16, 32, 10); hole(s, 20, 20, 14); scorch(s, -24, 22, 20); rust(s, -26, -20, 16);
};

const blastDoor = (s) => {
  box(s, 0, 0, 78, 70, STLd(s), { r: 4, inset: [3, '#2b3742'] });
  L(s, 6, 0, 8, 70, { fill: '#12171c', rot: 6 });
  L(s, 0, -24, 78, 10, { fill: stripes(s, 45, '#7a5a34', 8, '#241d17', 16) });
  hole(s, -16, 8, 24); crack(s, 20, -6, 34, 62); scorch(s, 22, 22, 32); rust(s, -24, -22, 20);
};

const turret = (s) => {
  box(s, 0, 18, 48, 26, STLd(s), { r: 8, inset: [2, '#2b3742'] });
  L(s, -2, -4, 30, 30, { r: '50%', fill: '#2d353d', inset: [3, '#1f262c'] });
  L(s, 14, -26, 9, 34, { r: 3, fill: '#232b33', rot: 52 });
  crack(s, -2, -4, 26, 18); scorch(s, -4, -30, 40); hole(s, 16, 10, 16);
  wire(s, -28, 6, -26); spark(s, 22, -34);
};

const cryopod = (s) => {
  box(s, 0, 0, 48, 82, grad(s, '#414b55', '#2d353d', 'h'), { r: 24, inset: [3, '#2b3742'] });
  L(s, 0, 0, 30, 62, { r: 15, fill: grad(s, '#3f5c68', '#26414f') });
  crack(s, 0, -8, 44, 76); hole(s, 6, 18, 18); scorch(s, -18, -26, 30);
  L(s, -6, 44, 26, 9, { r: '50%', fill: pool(s, 'rgba(150,200,220,.4)') });
};

const fuelDrum = (s) => {
  box(s, 2, 2, 48, 64, grad3(s, '#7a5a34', '#5c3f22', '#452e17'), { r: 8, inset: [2, '#33230f'], rot: 12 });
  L(s, 0, -8, 48, 12, { fill: stripes(s, 45, '#7a5a34', 7, '#241d17', 14), rot: 12 });
  hole(s, 8, 10, 20); crack(s, -6, -14, 26, 26); scorch(s, -22, 22, 30);
  L(s, -18, 38, 30, 10, { r: '50%', fill: pool(s, 'rgba(60,40,20,.7)') });
};

// ── WALLS ──
const steelBulkhead = (s) => {
  box(s, 0, 0, 106, 94, '#2f3d4a', { r: 6, inset: [2, '#232b33'] });
  L(s, 0, 0, 106, 94, { fill: dots(s, 20, 1.5, 'rgba(0,0,0,.4)') });
  hole(s, -14, 6, 40); crack(s, 26, -16, 44, 58); crack(s, -30, -24, 30, -24);
  scorch(s, 30, 24, 36); rust(s, -34, 30, 24);
};

const timberLinedWall = (s) => {
  box(s, 0, 0, 106, 94, stripes(s, 0, '#5f4227', 15, '#4c3520', 17), { r: 6, inset: [4, '#3a2717'] });
  hole(s, 12, 10, 34); crack(s, -24, -12, 40, 74); scorch(s, -6, -30, 40); rust(s, 34, 30, 22);
};

const blastWall = (s) => {
  box(s, 0, 0, 106, 94, grad(s, '#242c33', '#1c2329'), { r: 6, inset: [4, '#414b55'] });
  L(s, 0, 0, 106, 94, { fill: dots(s, 26, 2, 'rgba(0,0,0,.5)') });
  L(s, 0, -34, 106, 14, { fill: stripes(s, 45, '#7a5a34', 9, '#241d17', 18) });
  hole(s, -10, 12, 30); crack(s, 28, -8, 40, 62); scorch(s, 30, 28, 30); rust(s, -34, 32, 20);
};

const glassPartition = (s) => {
  box(s, 0, 0, 106, 94, grad(s, 'rgba(120,170,190,.2)', 'rgba(90,130,160,.08)', 'diag'),
    { r: 6, inset: [5, '#414b55'] });
  crack(s, -6, -4, 88, 16); crack(s, 14, 8, 62, -44); crack(s, -26, 18, 48, 58);
  hole(s, 24, -18, 24); hole(s, -18, 26, 18);
  L(s, -36, 34, 24, 6, { fill: 'rgba(190,225,240,.55)', rot: 22 });
  L(s, 30, 32, 18, 5, { fill: 'rgba(190,225,240,.45)', rot: -14 });
};

const insulatedWall = (s) => {
  box(s, 0, 0, 106, 94, '#3a434c', { r: 6, inset: [3, '#2a3138'] });
  L(s, 0, 0, 106, 94, { fill: grid(s, 24, 24, 2, 'rgba(0,0,0,.22)') });
  hole(s, 16, 8, 32);
  L(s, 16, 8, 22, 16, { r: 4, fill: '#8a7f62', inset: [1, '#6b6149'] });
  crack(s, -24, -14, 42, 68); scorch(s, -8, -30, 32); rust(s, 34, 32, 20);
};

const hullPlating = (s) => {
  box(s, 0, 0, 106, 94, '#232c36', { r: 6, inset: [2, '#1a212a'] });
  // two stacked background-images in the mock: seam lines every 35px, then a 20px rivet screen
  L(s, 0, 0, 106, 94, { fill: stripes(s, 90, 'rgba(0,0,0,.35)', 2, 'transparent', 35) });
  L(s, 0, 0, 106, 94, { fill: dots(s, 20, 1.5, 'rgba(0,0,0,.4)') });
  hole(s, -6, 2, 44);
  L(s, -6, 2, 44, 38, { r: ['52%', '42%', '56%', '44%'], shade: [14, 'rgba(90,140,180,.35)'] });
  crack(s, 30, -22, 38, 54); scorch(s, 28, 26, 32); rust(s, -34, 32, 22);
};

// ── FLOORS ──
const steelTanFloor = (s) => {
  box(s, 0, 0, 106, 94, '#6b5f45');
  L(s, 0, 0, 106, 94, { fill: grid(s, 22, 22, 1, 'rgba(0,0,0,.2)') });
  hole(s, -18, 14, 32); crack(s, 20, -14, 48, 22); crack(s, -6, 26, 34, -34); scorch(s, 26, 22, 34);
};

const woodPlankFloor = (s) => {
  box(s, 0, 0, 106, 94, stripes(s, 90, '#7d5730', 21, '#6c4b28', 23));
  hole(s, 16, -10, 30); crack(s, -22, 12, 44, 12); scorch(s, -8, 30, 36);
  L(s, 30, 26, 34, 9, { fill: '#5b3f21', rot: 14 });
};

const growMatting = (s) => {
  box(s, 0, 0, 106, 94, '#5e6440');
  L(s, 0, 0, 106, 94, { fill: dots(s, 15, 2, 'rgba(40,50,28,.6)') });
  hole(s, -16, -10, 30); scorch(s, 20, 14, 40); rust(s, 30, -24, 22);
  L(s, -24, 28, 36, 8, { fill: '#4a4a2c', rot: 18 });
};

const creamTileFloor = (s) => {
  box(s, 0, 0, 106, 94, '#9a8b6c');
  L(s, 0, 0, 106, 94, { fill: grid(s, 26, 26, 1, 'rgba(0,0,0,.16)') });
  crack(s, -10, -6, 60, 18); crack(s, 18, 18, 40, -30); hole(s, -26, 24, 24); scorch(s, 28, -22, 30);
};

const metalGrating = (s) => {
  box(s, 0, 0, 106, 94, '#443f34');
  L(s, 0, 0, 106, 94, { fill: bars(s, 9, 2, 'rgba(0,0,0,.4)') });
  L(s, 0, 0, 106, 94, { fill: dots(s, 18, 1.5, 'rgba(0,0,0,.45)') });
  hole(s, 18, 10, 34); crack(s, -24, -16, 40, 16);
  L(s, -16, 30, 40, 6, { fill: '#5f5a48', rot: 16 });
  scorch(s, -30, 24, 28); rust(s, 32, -26, 20);
};

const carpetFloor = (s) => {
  box(s, 0, 0, 106, 94, stripes(s, 90, '#6b3226', 11, '#5b2b1f', 22), { inset: [5, '#7d6c50'] });
  hole(s, -20, 8, 30); hole(s, 24, -16, 22); scorch(s, 20, 24, 36);
  L(s, 0, 34, 106, 9, { fill: stripes(s, 90, '#6b3226', 6, 'transparent', 13) });
};

// ── FIXTURES ──
const slidingDoor = (s) => {
  box(s, 0, 0, 96, 70, STLd(s), { inset: [3, '#2b3742'] });
  L(s, 10, 0, 6, 70, { fill: '#1a1f24', rot: 8 });
  hole(s, -22, 4, 22); crack(s, 24, -10, 34, 68); scorch(s, 26, 20, 30);
  wire(s, -38, -22, 18); spark(s, 14, -26);
};

const airlock = (s) => {
  L(s, 0, 0, 80, 80, { r: '50%', fill: grad(s, '#414b55', '#2d353d'), inset: [5, '#2b3742'] });
  L(s, 0, 0, 46, 46, { r: '50%', fill: '#0a0d11', inset: [3, '#1c242d'] });
  crack(s, 0, 0, 56, 22); crack(s, 4, -8, 40, -58); hole(s, -16, 18, 18);
  scorch(s, 22, -20, 34); wire(s, 30, 14, -24); spark(s, -22, -20);
};

const hatchLadder = (s) => {
  L(s, 0, 0, 80, 80, { r: '50%', fill: '#0f151a', inset: [6, '#414b55'], shade: [22, 'rgba(0,0,0,.9)'] });
  L(s, -22, 0, 5, 74, { r: 3, fill: grad(s, '#6f7c85', '#2d353d') });
  L(s, 24, 4, 5, 60, { r: 3, fill: grad(s, '#5f6b74', '#262e35'), rot: 14 });
  L(s, -2, -14, 44, 7, { r: 3, fill: grad(s, '#8f9aa2', '#5f6b74'), rot: -12 });
  L(s, 2, 14, 30, 7, { r: 3, fill: grad(s, '#6f7c85', '#414b55') });
  rust(s, 20, -24, 20); scorch(s, -20, 24, 28);
};

const powerConduit = (s) => {
  L(s, -18, 0, 56, 14, { r: 7, fill: '#232b33' });
  L(s, 30, 4, 34, 14, { r: 7, fill: '#232b33', rot: 16 });
  L(s, -30, 0, 12, 12, { r: '50%', fill: '#3a3129' });
  L(s, 0, 0, 12, 12, { r: '50%', fill: '#3a3129' });
  wire(s, 12, -2, 28); spark(s, 24, 8); scorch(s, 6, 12, 30);
};

const airVent = (s) => {
  box(s, 0, 0, 72, 56, STLd(s), { inset: [2, '#2b3742'] });
  L(s, 0, 0, 56, 40, { r: 3, fill: stripes(s, 0, '#20272d', 5, '#414b55', 9) });
  L(s, 12, -6, 34, 6, { fill: '#5f6b74', rot: 22 });
  hole(s, -16, 8, 18); scorch(s, 20, 16, 28); rust(s, -24, -16, 20);
};

const pipeRun = (s) => {
  L(s, -14, 0, 62, 16, { r: 8, fill: grad(s, '#4a5560', '#2a323a') });
  L(s, 34, 6, 34, 16, { r: 8, fill: grad(s, '#4a5560', '#2a323a'), rot: 18 });
  L(s, -28, 20, 16, 30, { r: 6, fill: grad(s, '#4a5560', '#2a323a', 'h') });
  crack(s, 6, 0, 24, 8); scorch(s, 12, 6, 28); rust(s, -30, -14, 22);
  L(s, 14, 26, 26, 9, { r: '50%', fill: pool(s, 'rgba(120,170,190,.4)') });
};

const wallLamp = (s) => {
  L(s, 0, 14, 22, 34, { r: 4, fill: '#39424c', inset: [2, '#2b3742'] });
  L(s, -4, -14, 52, 34, {
    r: [26, 26, 6, 6], fill: rgrad(s, '#3a3129', '#1b1713', 0.5, 0.8), inset: [2, '#2b241c'], rot: -18,
  });
  crack(s, -4, -14, 34, 14); wire(s, 20, -24, 34); spark(s, 14, -32); scorch(s, -20, 6, 26);
};

const viewport = (s) => {
  L(s, 0, 0, 90, 64, { r: 8, fill: '#07090d', outset: [6, '#414b55'], shade: [16, 'rgba(0,0,0,.9)'] });
  crack(s, -6, -2, 70, 14); crack(s, 10, 6, 46, -40); crack(s, -14, 10, 34, 62); hole(s, 26, -12, 18);
  L(s, -34, 22, 16, 5, { fill: 'rgba(190,225,240,.5)' });
  rust(s, 30, 22, 20);
};

const wallScreen = (s) => {
  box(s, 0, 0, 92, 60, '#1b2127', { inset: [3, '#2d353d'] });
  dead(s, 0, 0, 76, 44); crack(s, -6, 0, 62, 12); crack(s, 12, -8, 40, -38);
  hole(s, 26, 8, 16); scorch(s, -30, 16, 28); spark(s, -34, -20);
};

const spaceHeater = (s) => {
  box(s, 0, 0, 60, 64, STLd(s), { r: 6, inset: [2, '#2b3742'] });
  L(s, 0, -10, 40, 7, { r: 3, fill: '#3a3129' });
  L(s, 0, 2, 40, 7, { r: 3, fill: '#3a3129' });
  L(s, -4, 14, 34, 7, { r: 3, fill: '#2f2b24', rot: -8 });
  crack(s, 0, -22, 30, 12); scorch(s, 20, 22, 28); wire(s, -32, 18, 22); spark(s, 24, -24);
};

const ventFan = (s) => {
  box(s, 0, 0, 76, 76, '#2b333b', { r: 8, inset: [3, '#232b33'] });
  // the mock's 4-quadrant conic-gradient, as sectors — the same translation `fixtures.js`'s
  // pristine ventFan makes (translation note 6; teeth would turn a fan into a cog).
  L(s, 0, 0, 60, 60, { r: '50%', fill: '#2b333b' });
  s.path('M0,0 L0,-30 A30,30 0 0 1 30,0 Z', { fill: '#414b55' });
  s.path('M0,0 L0,30 A30,30 0 0 1 -30,0 Z', { fill: '#414b55' });
  L(s, 0, 0, 60, 60, { r: '50%', inset: [3, '#232b33'] });
  L(s, 0, 0, 12, 12, { r: '50%', fill: '#5f6b74' });
  crack(s, -4, 0, 46, 28); hole(s, 20, -16, 16); scorch(s, -18, 22, 28); wire(s, 30, 20, -20);
};

const shelfRack = (s) => {
  box(s, 0, 0, 88, 76, '#3a434c', { inset: [3, '#2a3138'] });
  L(s, -18, -18, 22, 16, { r: 2, fill: '#5f4a30' });
  L(s, 10, -20, 22, 16, { r: 2, fill: '#3f3122', rot: 14 });
  L(s, -6, 16, 22, 16, { r: 2, fill: '#4a4a32' });
  hole(s, 26, 12, 20); crack(s, -10, 0, 44, 8); scorch(s, -28, 24, 28); rust(s, 28, -26, 18);
};

const supplyBarrel = (s) => {
  box(s, 2, 4, 48, 64, grad3(s, '#3f6a80', '#27505f', '#1e3d49'), { r: 8, inset: [2, '#274f61'], rot: -14 });
  L(s, 0, -8, 48, 10, { fill: stripes(s, 45, '#8fa8b8', 7, '#22333c', 14), rot: -14 });
  hole(s, 10, 12, 20); crack(s, -8, -14, 24, -30); scorch(s, -20, 24, 28);
  L(s, -18, 38, 30, 10, { r: '50%', fill: pool(s, 'rgba(120,170,190,.4)') });
};

const weaponsRack = (s) => {
  box(s, 0, 0, 96, 74, '#2f373f', { inset: [3, '#232b33'] });
  L(s, 0, -30, 96, 8, { fill: '#232b33' });
  L(s, 0, 30, 96, 8, { fill: '#3f3122' });
  L(s, -28, 0, 9, 56, { r: 2, fill: grad(s, '#414b55', '#242c33') });
  L(s, -28, 16, 15, 20, { r: 3, fill: '#4a3520' });
  L(s, 4, 6, 9, 44, { r: 2, fill: grad(s, '#39424c', '#20272d'), rot: 22 });
  crack(s, 24, -8, 30, 40); hole(s, 30, 16, 18); scorch(s, -24, 26, 26); rust(s, 34, -26, 18);
};

const sunLamp = (s) => {
  L(s, -4, -18, 70, 40, {
    r: [8, 8, 4, 4], fill: grad(s, '#3a352c', '#1d1a15'), inset: [2, '#2b241c'], rot: -22,
  });
  crack(s, -4, -18, 46, 16); hole(s, 12, -22, 18);
  L(s, 0, 20, 8, 40, { fill: '#39424c' });
  wire(s, 26, -2, 34); spark(s, -26, -30); scorch(s, -18, 16, 26);
};

const herbPlanter = (s) => {
  L(s, 4, 18, 44, 30, { r: [0, 0, 8, 8], fill: grad(s, '#5f3f26', '#43290f'), rot: 14 });
  crack(s, 4, 14, 26, -12);
  L(s, -2, -14, 50, 42, { r: '50%', fill: rgrad(s, '#5f5b38', '#38341c', 0.45, 0.4) });
  L(s, -20, -22, 20, 5, { r: 2, fill: '#4f4a2c', rot: -34 });
  L(s, 18, -4, 16, 4, { r: 2, fill: '#443f24', rot: 38 });
  L(s, -24, 38, 28, 10, { r: '50%', fill: pool(s, 'rgba(80,62,38,.6)') });
};

const deckSign = (s) => {
  L(s, 0, 20, 6, 40, { fill: '#39424c', rot: 6 });
  L(s, -4, -8, 80, 34, { r: 5, fill: grad(s, '#2a2119', '#1c150f'), inset: [2, '#6b4526'], rot: -12 });
  crack(s, -4, -8, 44, -12); hole(s, 24, -12, 16); scorch(s, -26, 12, 24);
  L(s, -16, -10, 14, 12, { r: 2, fill: '#5a4426', rot: -12 });
  spark(s, 28, -26);
};

const floodlight = (s) => {
  box(s, 0, -16, 40, 30, '#39424c', { r: 6, inset: [2, '#2b3742'], rot: -16 });
  L(s, 24, -18, 30, 22, { r: 3, fill: grad(s, '#2f2b24', '#181510'), inset: [1, '#4a5560'], rot: -16 });
  crack(s, 20, -18, 24, -16);
  L(s, 0, 20, 8, 40, { fill: '#2a323a' });
  wire(s, -26, -4, 28); spark(s, -30, -18); scorch(s, 14, 12, 26);
};

// ── RESOURCES — the 8 that cannot be repaired, only written off (state `—`, not a percentage) ──
const regolith = (s) => {
  L(s, -16, 16, 22, 16, { r: [6, 8, 4, 7], fill: grad(s, '#5f5a4c', '#3f3b31') });
  L(s, 14, 18, 26, 18, { r: [8, 5, 8, 5], fill: grad(s, '#575345', '#39352c') });
  L(s, -2, 2, 30, 22, { r: [9, 6, 9, 7], fill: grad(s, '#68624f', '#443f34') });
  L(s, 18, -8, 16, 13, { r: [5, 7, 4, 6], fill: grad(s, '#5f5a4c', '#3f3b31') });
  scorch(s, 0, 6, 44);
  L(s, -20, -8, 12, 10, { r: [6, 4, 6, 4], fill: '#4a3226' });
  rust(s, 20, 20, 20);
};

const potato = (s) => {
  L(s, -16, 14, 30, 22, { r: '50%', fill: rgrad(s, '#6f6142', '#413720', 0.38, 0.32) });
  L(s, 16, 16, 28, 21, { r: '50%', fill: rgrad(s, '#5f5236', '#38301c', 0.38, 0.32) });
  L(s, 0, -4, 34, 25, { r: '50%', fill: rgrad(s, '#756645', '#463b22', 0.38, 0.32) });
  L(s, -6, -8, 10, 8, { r: '50%', fill: 'rgba(40,50,26,.85)' });
  L(s, 10, 2, 8, 7, { r: '50%', fill: 'rgba(40,50,26,.8)' });
  L(s, -14, 18, 9, 7, { r: '50%', fill: 'rgba(40,50,26,.75)' });
  L(s, 4, 26, 30, 9, { r: '50%', fill: pool(s, 'rgba(60,55,30,.65)') });
};

const scrap = (s) => {
  L(s, -14, 14, 40, 11, { r: 2, fill: grad(s, '#5f5a52', '#332f2a'), rot: -14 });
  L(s, 12, 8, 34, 9, { r: 2, fill: grad(s, '#57524a', '#2c2924'), rot: 22 });
  L(s, -4, -6, 30, 8, { r: 2, fill: grad(s, '#6b665c', '#3a3630'), rot: -40 });
  L(s, 16, -12, 20, 18, { r: 3, fill: grad(s, '#4a463f', '#292620'), rot: 8 });
  scorch(s, 0, 4, 46); rust(s, -22, -8, 22); rust(s, 20, 20, 18);
};

const parts = (s) => {
  // the mock's two 8-sector conic discs, as REAL TEETH — resources.js's own ruling for this piece
  s.path(gearPath(-16, 12, 14, 14 * 0.68, 7), { fill: '#5f5a52' });
  s.circle({ cx: -16, cy: 12, r: 14 * 0.68, fill: '#5f5a52' });
  L(s, -16, 12, 11, 11, { r: '50%', fill: '#1e2226' });
  s.path(gearPath(18, 16, 11, 11 * 0.68, 7), { fill: '#6b5f45' });
  s.circle({ cx: 18, cy: 16, r: 11 * 0.68, fill: '#6b5f45' });
  s.circle({ cx: 18, cy: 16, r: 4, fill: '#1e2226' });
  L(s, 2, -14, 34, 10, { r: 3, fill: grad(s, '#6b665c', '#3a3630'), rot: -18 });
  crack(s, -16, 12, 22, 34); rust(s, 18, -6, 22); rust(s, -24, 22, 18);
};

const controllerModule = (s) => {
  box(s, 0, 0, 60, 48, grad(s, '#20342b', '#14231c'), { r: 4, inset: [2, '#0d2019'] });
  L(s, 0, -4, 24, 20, { r: 2, fill: '#171b1f', inset: [1, '#3a434c'] });
  L(s, 0, 14, 44, 3, { fill: '#7a6b42' });
  L(s, -12, 7, 3, 18, { fill: '#7a6b42' });
  L(s, -34, 0, 12, 4, { fill: '#7a6b42' });
  L(s, 34, 0, 12, 4, { fill: '#5a4f31' });
  scorch(s, 16, -10, 30); crack(s, -8, 8, 26, -22); spark(s, 24, 14);
};

const seals = (s) => {
  L(s, -14, 12, 36, 36, { r: '50%', fill: '#22261f', inset: [7, '#3f4a36'] });
  crack(s, -14, 12, 30, 26);
  L(s, 16, 16, 30, 30, { r: '50%', fill: '#22261f', inset: [6, '#46523c'], rot: 14 });
  L(s, 4, -14, 40, 26, { r: 4, fill: '#6b6149', inset: [2, '#4f472f'], rot: -10 });
  L(s, 4, -14, 40, 26, { r: 4, fill: stripes(s, 90, 'transparent', 5, 'rgba(0,0,0,.3)', 7), rot: -10 });
  rust(s, 22, -22, 20); scorch(s, -22, 26, 24);
};

const ice = (s) => {
  L(s, -12, 18, 20, 15, {
    r: 4,
    fill: grad(s, 'rgba(190,230,245,.75)', 'rgba(120,175,205,.55)', 'diag'),
    inset: [2, 'rgba(255,255,255,.35)'],
  });
  L(s, 12, 20, 16, 12, { r: 4, fill: grad(s, 'rgba(175,220,240,.7)', 'rgba(105,160,192,.5)', 'diag'), rot: 16 });
  L(s, -2, 8, 24, 18, {
    r: 5,
    fill: grad(s, 'rgba(200,238,250,.8)', 'rgba(130,185,215,.55)', 'diag'),
    inset: [2, 'rgba(255,255,255,.4)'],
  });
  // the meltwater is drawn OVER the blocks, exactly as the mock stacks it: the ice is going, not gone
  L(s, 0, 26, 80, 22, { r: '50%', fill: pool(s, 'rgba(140,195,225,.42)', 0.72) });
  L(s, -26, 4, 14, 10, { r: '50%', fill: 'rgba(180,220,238,.45)' });
};

const corpse = (s) => {
  L(s, 0, 8, 52, 80, { r: [20, 20, 8, 8], fill: grad(s, '#5f5a52', '#403c36') });
  L(s, 0, -22, 30, 30, { r: [12, 12, 4, 4], fill: '#4a4238' });
  L(s, -6, -22, 5, 5, { fill: '#15120f' });
  L(s, 6, -22, 5, 5, { fill: '#15120f' });
  L(s, 0, 10, 36, 34, { r: 4, fill: '#6b6459' });
  L(s, 0, 10, 36, 34, { r: 4, fill: stripes(s, 90, 'transparent', 7, 'rgba(0,0,0,.22)', 9) });
  L(s, -9, 38, 12, 18, { r: 2, fill: '#2a241d' });
  L(s, 9, 38, 12, 18, { r: 2, fill: '#2a241d' });
  scorch(s, 18, 0, 30); rust(s, -20, 22, 20);
};

// ── CRYO ──
const cryoCapsuleOccupied = (s) => {
  box(s, 0, 0, 60, 104, grad3(s, '#414b55', '#2d353d', '#232b33'),
    { r: [26, 26, 8, 8], inset: [3, '#232b33'] });
  L(s, 0, -6, 44, 80, { r: [20, 20, 5, 5], fill: grad(s, '#182a34', '#0e1a22'), shade: [12, 'rgba(0,0,0,.8)'] });
  L(s, 0, 2, 32, 56, { r: [14, 14, 4, 4], fill: grad(s, '#33302a', '#22201c') });
  crack(s, 0, -12, 60, 74); crack(s, -6, 10, 34, -34); hole(s, 14, -30, 18); scorch(s, -18, 30, 32);
  icicle(s, -14, -42, 6, 16, 'rgba(200,232,242,.8)', 'rgba(120,175,205,.4)');
  icicle(s, 4, -44, 5, 12, 'rgba(200,232,242,.75)', 'rgba(120,175,205,.4)');
  dead(s, 0, 44, 44, 11);
};

const cryoCapsuleOpen = (s) => {
  box(s, 0, 0, 60, 104, grad3(s, '#3d4650', '#2a323a', '#20272e'),
    { r: [26, 26, 8, 8], inset: [3, '#232b33'] });
  L(s, 0, -6, 44, 80, { r: [20, 20, 5, 5], fill: grad(s, '#161d23', '#0d1216'), shade: [14, 'rgba(0,0,0,.85)'] });
  L(s, 0, 2, 32, 56, { r: [14, 14, 4, 4], fill: grad(s, '#33302a', '#22201c') });
  L(s, 42, -18, 26, 88, {
    r: [14, 14, 5, 5],
    fill: grad(s, 'rgba(150,190,205,.34)', 'rgba(90,135,160,.22)', 'h'),
    inset: [3, '#414b55'],
    rot: 38,
  });
  crack(s, 38, -18, 62, 38); hole(s, 4, -22, 16); scorch(s, -18, 28, 30);
  icicle(s, -14, -42, 6, 18, 'rgba(200,232,242,.8)', 'rgba(120,175,205,.4)');
  icicle(s, 4, -44, 5, 13, 'rgba(200,232,242,.75)', 'rgba(120,175,205,.4)');
  wire(s, -30, 34, 26); dead(s, 0, 44, 44, 11);
};

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE NINE FITTINGS (VR-P2) — post-raid twins for the rows the mock never had
//
// ⚠️ THESE ARE NOT THE MOCK'S, AND THE DIFFERENCE IS STRUCTURAL RATHER THAN COSMETIC. Every twin
// above is a transcription of a drawing in `docs/design/perilune-item-set.dc.html`, checked against
// that spec's own `brokenD` array label-for-label and badge-for-badge — that bijection is what proves
// the seventy are right. `design-import/Perilune Fittings.dc.html` ships THIRTY pristine fittings and
// ZERO wrecked ones, so there is nothing to transcribe for these nine and nothing to check against.
// They are repo-authored, ledgered as such in `NON_MOCK_TWIN` below, and excluded from the mock join
// so that it still measures exactly seventy.
//
// ⚠️ AND THEY ARE DRAWN IN THE PAPER IDIOM, NOT THIS FILE'S WARM ONE, because their PRISTINE pieces
// are: a `#EBE4D1`/`#14120F` bench under a steel-grey scorch bloom would read as two objects. Each
// twin RE-RUNS its own pristine painter through `fittings.paintFitting` and then adds ink damage on
// the same frame, in the same centimetres. That is not a shortcut — it is the only construction under
// which "the twin is the same object, damaged" survives a redraw of the object, and it keeps the
// mock's own stated premise for its seventy ("each keeps one identifying feature so it still reads
// as the same object") true here by force rather than by care.
//
// ⛔ THE TWENTY-ONE REPLACED ROWS KEEP THEIR WARM TWINS, and that is a KNOWN, FILED INCONSISTENCY
// rather than an oversight: `chair`, `locker`, `cooker` and eighteen more now draw a paper-ink
// pristine piece and a steel-grey wreck. Restyling those seventy is charter §3's package P2b. Until
// it lands, a wrecked galley mixes two palettes on screen.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** INK DAMAGE — the paper half of the vocabulary above, in a fitting's own centimetres.
 *  `crack`/`hole`/`scorch`/`wire`/`dead` are the mock's five marks; these are the same five ideas
 *  drawn as ink line rather than as steel and soot, because that is the register the pieces are in. */
const inkCrack = (s, F, pts) => fLine(s, F, pts, { sw: 1.7 });
const inkTear = (s, F, pts) => fLine(s, F, pts, { sw: 1.1, dash: '2 2', opacity: 0.85 });
const inkHole = (s, F, x, y, z, r) => fDisc(s, F, x, y, z, r, { fill: INK, sw: 1.4 });
// ⚠️ A SOOT BLOOM IS A FILL, NOT A RING, and the first draft got it the other way round — a wide
// low-opacity STROKE draws a grey hoop round clean paper, which on a barrel or a locker reads as a
// second hoop rather than as a burn. Seen, not reasoned out: `node client/tools/fittings-sheet.mjs`
// writes `fittings-twins.html`, every twin beside its pristine piece — re-run it and look. The shots
// themselves are NOT committed, so a path to one would be a citation nobody can follow.
const inkScorch = (s, F, x, y, z, r) => fDisc(s, F, x, y, z, r, { fill: INK, sw: 0.9, opacity: 0.16 });
const inkWire = (s, F, a, c, b) => fCurve(s, F, a, c, b, { sw: 1.3, opacity: 0.9 });
const inkDead = (s, F, pts) => fLine(s, F, pts, { close: true, fill: INK, sw: 1.1, opacity: 0.85 });

const bench = (s) => paintFitting(s, 'bench', (_s, { F }) => {
  inkCrack(s, F, [[62, 4, 45], [96, 30, 45]]);
  inkHole(s, F, 150, 17, 45, 7);
  inkScorch(s, F, 200, 12, 45, 17);
  inkCrack(s, F, [[236.5, 7, 26], [251, 7, 5]]);          // the near-right leg, kicked out
});

const stool = (s) => paintFitting(s, 'stool', (_s, { F }) => {
  inkCrack(s, F, [[6, 14, 45], [26, 21, 45]]);
  inkScorch(s, F, 17, 17, 45, 9);
  inkCrack(s, F, [[17, 3, 20], [24, 1, 2]]);              // the snapped front leg
});

const cot = (s) => paintFitting(s, 'cot', (_s, { F }) => {
  inkTear(s, F, [[52, 10, 40], [88, 46, 40], [124, 22, 40]]);
  inkHole(s, F, 150, 34, 40, 9);
  inkScorch(s, F, 30, 26, 40, 16);
  inkWire(s, F, [186, 6, 36], [192, 4, 24], [180, 2, 12]);
});

const footlocker = (s) => paintFitting(s, 'footlocker', (_s, { F }) => {
  inkCrack(s, F, [[14, 2, 45], [50, 26, 45]]);
  inkHole(s, F, 66, 2, 20, 7);
  inkScorch(s, F, 24, 2, 14, 14);
  inkTear(s, F, [[18, 0, 41], [18, 0, 34]]);              // the sprung latch
});

const sink = (s) => paintFitting(s, 'sink', (_s, { F }) => {
  inkCrack(s, F, [[80, 47, 112], [92, 30, 100]]);         // the tap, snapped at the collar
  inkHole(s, F, 49, 27, 96, 6);                           // …and the drain, gone
  inkScorch(s, F, 30, 0, 40, 18);
  inkDead(s, F, [[78, 0, 20], [92, 0, 20], [92, 0, 40], [78, 0, 40]]);
});

const compostBin = (s) => paintFitting(s, 'compost-bin', (_s, { F }) => {
  inkCrack(s, F, [[8, 0, 84], [34, 0, 62], [22, 0, 30]]);
  inkHole(s, F, 42, 0, 44, 7);
  inkScorch(s, F, 20, 0, 20, 15);
  inkCrack(s, F, [[64, 30, 52], [72, 30, 60]]);           // the crank, bent off its shaft
});

const vicePost = (s) => paintFitting(s, 'vice-post', (_s, { F }) => {
  inkCrack(s, F, [[13, 20, 8], [27, 20, 22]]);            // the post, split at the plinth
  inkHole(s, F, 29, 16, 114, 6);                          // the far jaw, punched out
  inkScorch(s, F, 20, 20, 3, 16);
  inkTear(s, F, [[38, 14, 113], [50, 14, 106]]);
});

const curtainRail = (s) => paintFitting(s, 'curtain-rail', (_s, { F }) => {
  inkTear(s, F, [[52, 14, 186], [58, 14, 140], [46, 14, 104]]);
  inkTear(s, F, [[92, 14, 180], [86, 14, 132]]);
  inkCrack(s, F, [[5, 12, 206], [14, 12, 196]]);          // the near bracket, torn from the deckhead
  inkScorch(s, F, 110, 14, 172, 14);
});

const shrineShelf = (s) => paintFitting(s, 'shrine-shelf', (_s, { F }) => {
  inkCrack(s, F, [[14, 12, 166], [26, 12, 146]]);         // across the frame
  inkHole(s, F, 46, 16, 150, 5);                          // the cup, holed
  inkScorch(s, F, 34, 28, 128, 15);
  // ⚠️ THIS MARK MOVED WITH THE PART IT IS ABOUT. It used to run (14,6,139) → (14,20,131), which was
  // the near bracket's own line when the bracket was flat and hidden inside the shelf plate; both
  // were invisible, so the twin lost a mark and nothing said so. The bracket now falls from the
  // plate's front-bottom edge to the wall, and the crack crosses it just under the shelf.
  inkCrack(s, F, [[11, 8, 133], [18, 10, 133]]);          // the near bracket, cracked at the mount
});

// ── the registry ─────────────────────────────────────────────────────────────────────────────

/**
 * `WRECKED[pristineItemId] = { paint, state, mockLabel }`.
 *
 *  paint      the pure painter — never called directly; `buildWrecked()` wraps it in the harness
 *  state      the mock's remaining-condition badge, VERBATIM: `'0%'`–`'35%'`, or `'—'` for the 8
 *             loose resources, which cannot be repaired at all
 *  mockLabel  the label the mock's WRECKED section uses. 62 reuse the pristine label verbatim;
 *             the 8 resources are renamed, non-mechanically. Cross-checked against the committed
 *             spec by client/test/wrecked.test.js — it is evidence, not decoration.
 *
 * Key order is `ITEM_IDS` order MINUS `NO_WRECKED_TWIN` (below), and the test asserts that by strict
 * deep-equality: a registry row added without a twin AND without a ledger entry, or a twin for a row
 * that does not exist, fails.
 */
export const WRECKED = Object.freeze({
  // ── OBJECTS (30) ──
  'reactor':          { paint: reactor,        state: '4%',  mockLabel: 'REACTOR' },
  'solar-panel':      { paint: solarPanel,     state: '11%', mockLabel: 'SOLAR PANEL' },
  'battery-bank':     { paint: batteryBank,    state: '0%',  mockLabel: 'BATTERY BANK' },
  'o2-scrubber':      { paint: o2Scrubber,     state: '17%', mockLabel: 'O₂ SCRUBBER' },
  'oxygen-tank':      { paint: oxygenTank,     state: '6%',  mockLabel: 'OXYGEN TANK' },
  'water-recycler':   { paint: waterRecycler,  state: '13%', mockLabel: 'WATER RECYCLER' },
  'hydroponics':      { paint: hydroponics,    state: '9%',  mockLabel: 'HYDROPONICS' },
  'cooker':           { paint: cooker,         state: '15%', mockLabel: 'COOKER' },
  'cooler':           { paint: cooler,         state: '8%',  mockLabel: 'COOLER' },
  'paste-dispenser':  { paint: pasteDispenser, state: '19%', mockLabel: 'PASTE DISPENSER' },
  'dining-table':     { paint: diningTable,    state: '22%', mockLabel: 'DINING TABLE' },
  'bunk-bed':         { paint: bunkBed,        state: '25%', mockLabel: 'BUNK BED' },
  'desk':             { paint: desk,           state: '28%', mockLabel: 'DESK' },
  'chair':            { paint: chair,          state: '31%', mockLabel: 'CHAIR' },
  'locker':           { paint: locker,         state: '20%', mockLabel: 'LOCKER' },
  'rug':              { paint: rug,            state: '12%', mockLabel: 'RUG' },
  'standing-lamp':    { paint: standingLamp,   state: '5%',  mockLabel: 'STANDING LAMP' },
  'potted-plant':     { paint: pottedPlant,    state: '0%',  mockLabel: 'POTTED PLANT' },
  'bookshelf':        { paint: bookshelf,      state: '24%', mockLabel: 'BOOKSHELF' },
  'med-bed':          { paint: medBed,         state: '18%', mockLabel: 'MED BED' },
  'research-console': { paint: researchConsole, state: '7%', mockLabel: 'RESEARCH CONSOLE' },
  'comms-dish':       { paint: commsDish,      state: '3%',  mockLabel: 'COMMS DISH' },
  'sensor-array':     { paint: sensorArray,    state: '10%', mockLabel: 'SENSOR ARRAY' },
  'workbench':        { paint: workbench,      state: '26%', mockLabel: 'WORKBENCH' },
  'fabricator':       { paint: fabricator,     state: '2%',  mockLabel: 'FABRICATOR' },
  'storage-crate':    { paint: storageCrate,   state: '30%', mockLabel: 'STORAGE CRATE' },
  'blast-door':       { paint: blastDoor,      state: '14%', mockLabel: 'BLAST DOOR' },
  'turret':           { paint: turret,         state: '0%',  mockLabel: 'TURRET' },
  'cryopod':          { paint: cryopod,        state: '16%', mockLabel: 'CRYOPOD' },
  'fuel-drum':        { paint: fuelDrum,       state: '21%', mockLabel: 'FUEL DRUM' },

  // ── WALLS (6) ──
  'steel-bulkhead':   { paint: steelBulkhead,  state: '8%',  mockLabel: 'STEEL BULKHEAD' },
  'timber-lined-wall': { paint: timberLinedWall, state: '17%', mockLabel: 'TIMBER-LINED WALL' },
  'blast-wall':       { paint: blastWall,      state: '12%', mockLabel: 'BLAST WALL' },
  'glass-partition':  { paint: glassPartition, state: '2%',  mockLabel: 'GLASS PARTITION' },
  'insulated-wall':   { paint: insulatedWall,  state: '21%', mockLabel: 'INSULATED WALL' },
  'hull-plating':     { paint: hullPlating,    state: '7%',  mockLabel: 'HULL PLATING' },

  // ── FLOORS (6) ──
  'steel-tan-floor':  { paint: steelTanFloor,  state: '35%', mockLabel: 'STEEL-TAN FLOOR' },
  'wood-plank-floor': { paint: woodPlankFloor, state: '29%', mockLabel: 'WOOD PLANK FLOOR' },
  'grow-matting':     { paint: growMatting,    state: '5%',  mockLabel: 'GROW MATTING' },
  'cream-tile-floor': { paint: creamTileFloor, state: '33%', mockLabel: 'CREAM TILE FLOOR' },
  'metal-grating':    { paint: metalGrating,   state: '26%', mockLabel: 'METAL GRATING' },
  'carpet-floor':     { paint: carpetFloor,    state: '15%', mockLabel: 'CARPET FLOOR' },

  // ── FIXTURES (18) ──
  'sliding-door':     { paint: slidingDoor,    state: '23%', mockLabel: 'SLIDING DOOR' },
  'airlock':          { paint: airlock,        state: '1%',  mockLabel: 'AIRLOCK' },
  'hatch-ladder':     { paint: hatchLadder,    state: '27%', mockLabel: 'HATCH / LADDER' },
  'power-conduit':    { paint: powerConduit,   state: '9%',  mockLabel: 'POWER CONDUIT' },
  'air-vent':         { paint: airVent,        state: '32%', mockLabel: 'AIR VENT' },
  'pipe-run':         { paint: pipeRun,        state: '10%', mockLabel: 'PIPE RUN' },
  'wall-lamp':        { paint: wallLamp,       state: '4%',  mockLabel: 'WALL LAMP' },
  'viewport':         { paint: viewport,       state: '6%',  mockLabel: 'VIEWPORT' },
  'wall-screen':      { paint: wallScreen,     state: '0%',  mockLabel: 'WALL SCREEN' },
  'space-heater':     { paint: spaceHeater,    state: '3%',  mockLabel: 'SPACE HEATER' },
  'vent-fan':         { paint: ventFan,        state: '11%', mockLabel: 'VENT FAN' },
  'shelf-rack':       { paint: shelfRack,      state: '24%', mockLabel: 'SHELF RACK' },
  'supply-barrel':    { paint: supplyBarrel,   state: '18%', mockLabel: 'SUPPLY BARREL' },
  'weapons-rack':     { paint: weaponsRack,    state: '14%', mockLabel: 'WEAPONS RACK' },
  'sun-lamp':         { paint: sunLamp,        state: '0%',  mockLabel: 'SUN LAMP' },
  'herb-planter':     { paint: herbPlanter,    state: '4%',  mockLabel: 'HERB PLANTER' },
  'deck-sign':        { paint: deckSign,       state: '16%', mockLabel: 'DECK SIGN' },
  'floodlight':       { paint: floodlight,     state: '6%',  mockLabel: 'FLOODLIGHT' },

  // ── RESOURCES (8) — RENAMED in the mock, and NOT by a mechanical suffix ──
  // `CONTROLLER · FRIED` also shortens its stem from `CONTROLLER MODULE`. Any code that derived one
  // label from the other by string surgery would be right 69 times and wrong once, silently.
  'regolith':         { paint: regolith,       state: '—', mockLabel: 'REGOLITH · CONTAMINATED' },
  'potato':           { paint: potato,         state: '—', mockLabel: 'POTATO · SPOILED' },
  'scrap':            { paint: scrap,          state: '—', mockLabel: 'SCRAP · SLAGGED' },
  'parts':            { paint: parts,          state: '—', mockLabel: 'PARTS · SEIZED' },
  'controller-module': { paint: controllerModule, state: '—', mockLabel: 'CONTROLLER · FRIED' },
  'seals':            { paint: seals,          state: '—', mockLabel: 'SEALS · PERISHED' },
  'ice':              { paint: ice,            state: '—', mockLabel: 'ICE · MELTED' },
  'corpse':           { paint: corpse,         state: '—', mockLabel: 'CORPSE · UNSHROUDED' },

  // ── CRYO (2) ──
  'cryo-capsule-occupied': { paint: cryoCapsuleOccupied, state: '13%', mockLabel: 'CRYO CAPSULE · OCCUPIED' },
  'cryo-capsule-open':     { paint: cryoCapsuleOpen,     state: '10%', mockLabel: 'CRYO CAPSULE · OPEN' },

  // ── FITTINGS (9, VR-P2) — REPO-AUTHORED, NOT FROM THE MOCK ──
  // `mockLabel: null` is the load-bearing field here, not the name: it is what takes these nine OUT
  // of the label/badge bijection above, which must keep measuring exactly the mock's seventy. The
  // catalogue entry each one comes from is carried in `catalogue` instead, so the row still names its
  // source. Their `state` badges are AUTHORED (the catalogue publishes no condition figures) and are
  // spread across the same 2–31% band the mock uses, so nothing on screen can tell a repo-authored
  // badge from a transcribed one — which is correct: a badge is a fact about a device, not about a
  // document.
  'bench':            { paint: bench,        state: '19%', mockLabel: null, catalogue: '01 BENCH' },
  'stool':            { paint: stool,        state: '6%',  mockLabel: null, catalogue: '05 STOOL' },
  'cot':              { paint: cot,          state: '23%', mockLabel: null, catalogue: '07 COT' },
  'footlocker':       { paint: footlocker,   state: '12%', mockLabel: null, catalogue: '09 FOOTLOCKER' },
  'sink':             { paint: sink,         state: '8%',  mockLabel: null, catalogue: '11 SINK' },
  'compost-bin':      { paint: compostBin,   state: '27%', mockLabel: null, catalogue: '21 COMPOST BIN' },
  'vice-post':        { paint: vicePost,     state: '15%', mockLabel: null, catalogue: '23 VICE POST' },
  'curtain-rail':     { paint: curtainRail,  state: '2%',  mockLabel: null, catalogue: '29 CURTAIN RAIL' },
  'shrine-shelf':     { paint: shrineShelf,  state: '31%', mockLabel: null, catalogue: '30 SHRINE SHELF' },
});

/**
 * REGISTRY ROWS THAT DELIBERATELY HAVE NO WRECKED TWIN — the same ledger idiom this repo keeps for
 * `NO_GROUND_ITEM_SPRITE` and `NO_DEVICE_GLYPH_ART`: a named entry with a reason, pinned by equality
 * in `client/test/wrecked.test.js`, so an omission has to be argued in a commit message rather than
 * accumulate as a default.
 *
 * ⚠️ IT WAS EMPTY UNTIL THE `swarf` PIECE, AND "empty" WAS AN IMPORT ARTEFACT, NOT AN INVARIANT. The
 * mock ships 70 pristine pieces and 70 twins, so every row had one for as long as the registry was
 * exactly the mock. The moment a piece is drawn for a sim fact the mock predates, the twin set no
 * longer covers it — and `wrecked.test.js` pins the twin↔mock join as a BIJECTION against the
 * committed spec, so inventing a 71st twin would break the thing that proves the other 70 are right.
 */
export const NO_WRECKED_TWIN = Object.freeze({
  swarf:
    'SWARF IS ALREADY THE WRECKED STATE. It is what a machine BECOMES when it is stripped below the '
    + 'Parts floor (`deconstruct.device_swarf`), so "wrecked swarf" names nothing the sim can reach: '
    + 'there is no second condition for a pile of turnings to be in, and W9\'s `Degraded` bit — the '
    + 'one mechanism that would ever give a RESOURCE two states — is unbuilt and, when it lands, '
    + 'covers the 8 spoilable resources and not this one. The mock, which is the authority for the '
    + 'twin set and the thing the bijection test measures against, has no SWARF piece at all.',
});

/**
 * TWINS THAT ARE NOT THE MOCK'S — the second ledger, and it exists because the first one cannot
 * express this case.
 *
 * `NO_WRECKED_TWIN` says "this row has no twin, and here is why". These nine rows DO have twins; what
 * they have no part in is the JOIN against `docs/design/perilune-item-set.dc.html`'s `brokenD` array.
 * That join is a BIJECTION — `client/test/wrecked.test.js` asserts every mock piece is claimed
 * exactly once, and walks the mock's 70 pristine labels POSITIONALLY against the twinned rows — so a
 * repo-authored twin left inside it does not merely fail; it destroys the evidence that the other
 * seventy are transcribed correctly, which is the whole reason that test reads the committed spec
 * instead of a remembered list.
 *
 * ⇒ THE INVARIANT IS: `WRECKED_IDS` is every registry row minus `NO_WRECKED_TWIN`, in registry order
 * (pinned); and the MOCK join runs over `WRECKED_IDS` minus THIS ledger, which must be exactly 70
 * (pinned). Both sides fail loudly, and neither can be satisfied by relaxing the other.
 *
 * Every entry here also carries `mockLabel: null` in `WRECKED` above, and the test pins the two facts
 * to each other: a ledgered row with a mock label, or an unledgered row without one, is a lie about
 * where a drawing came from.
 */
export const NON_MOCK_TWIN = Object.freeze({
  bench: '01 BENCH', stool: '05 STOOL', cot: '07 COT', footlocker: '09 FOOTLOCKER', sink: '11 SINK',
  'compost-bin': '21 COMPOST BIN', 'vice-post': '23 VICE POST', 'curtain-rail': '29 CURTAIN RAIL',
  'shrine-shelf': '30 SHRINE SHELF',
});

/** The pristine itemIds that have a wrecked twin, in registry order. */
export const WRECKED_IDS = Object.freeze(Object.keys(WRECKED));

/** The twinned rows that came FROM the mock — the population the label/badge bijection measures. */
export const MOCK_TWIN_IDS = Object.freeze(WRECKED_IDS.filter((id) => !(id in NON_MOCK_TWIN)));

/** The id prefix that namespaces a wrecked piece away from its pristine twin. */
export const WRECKED_PREFIX = 'wrecked:';

/**
 * The wrecked itemId for a pristine one — DERIVED, so there is no second table to fall out of step.
 * Returns `undefined` for anything with no twin, which is every non-registry string.
 */
export function wreckedItemId(pristineId) {
  return typeof pristineId === 'string' && WRECKED[pristineId] ? WRECKED_PREFIX + pristineId : undefined;
}

/** The inverse: `'wrecked:reactor'` → `'reactor'`, or `undefined`. PURE, tolerant. */
export function pristineItemId(wreckedId) {
  if (typeof wreckedId !== 'string' || !wreckedId.startsWith(WRECKED_PREFIX)) return undefined;
  const id = wreckedId.slice(WRECKED_PREFIX.length);
  return WRECKED[id] ? id : undefined;
}

/** True when `id` names a wrecked piece. PURE, tolerant. */
export function isWreckedItemId(id) {
  return pristineItemId(id) !== undefined;
}

/**
 * Build the WRECKED twin of a pristine itemId. Same contract as `buildItem`: pure, deterministic,
 * never throws, unknown id → the neutral placeholder.
 *
 * ⚠️ Keyed on the itemId ALONE. It never consults `ITEMS[id].kind`, and that is the trap-6
 * countermeasure spelled out in this file's header, not an accident of implementation.
 *
 * ⚠️ `state` IS NOT IN THIS LIST, AND ITS ABSENCE IS A FACT ABOUT THE ART, NOT AN OVERSIGHT. An
 * earlier draft of this line advertised `{ w, h, idPrefix, index, state }`, copied from `buildItem`.
 * The harness does forward `state` — but MEASURED, and RE-COUNTED rather than computed: **0 of the
 * 70 twins read it**, every one rendering byte-identically for `state:'on'` and `state:'off'`, while
 * **17 of the 70 PRISTINE rows do respond** (`reactor`, `o2-scrubber`, `water-recycler`, `cooker`,
 * `standing-lamp`, `workbench`, `fabricator`, `turret`, `sliding-door`, `airlock`, `power-conduit`,
 * `wall-lamp`, `space-heater`, `sun-lamp`, `floodlight`, `controller-module`,
 * `cryo-capsule-occupied`). So the contrast is real and it is 17-vs-0, not a rounding of two similar
 * numbers. A wrecked piece is dead by construction (that is what the mock's `dead()` mark means), so
 * there is no lit variant to ask for. Advertising an option that silently does nothing is how a call site gets written against
 * a guarantee that was never there. Deliberately NOT pinned by a test: "no twin responds to state"
 * is a property of today's 70 paintings, not a rule, and a future twin with a flickering emergency
 * strip would be a correct change that a pin would call a regression.
 *
 * @param {string} pristineId
 * @param {object} [opts] forwarded to the harness: `{ w, h, idPrefix, index }`
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function buildWrecked(pristineId, opts = {}) {
  const entry = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  if (!entry) return placeholderItem(opts);
  // `wrecked-<id>`, NOT `wrecked:<id>`: this string only seeds the DEFAULT `idPrefix`, and that
  // prefix ends up inside every `id="…"` / `url(#…)` in the fragment. A `:` is legal in an XML name
  // but reserved for namespace prefixes, and it is a combinator-adjacent character in CSS — cheap to
  // avoid, expensive to debug. The PUBLIC id keeps the colon (`wreckedItemId`), where nothing parses
  // it as markup.
  return item(`wrecked-${pristineId}`, opts, (s) => entry.paint(s));
}

/** The mock's remaining-condition badge for a twin (`'12%'` / `'—'`), or `undefined`. */
export function wreckedState(pristineId) {
  const e = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  return e ? e.state : undefined;
}

/**
 * The registry row a wrecked twin belongs to — footprint and classification come from the PRISTINE
 * entry, never re-transcribed here. A twin is the same object; only its condition differs.
 */
export function wreckedInfo(pristineId) {
  const e = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  if (!e) return undefined;
  const base = ITEMS[pristineId];
  return {
    pristineId,
    wreckedId: WRECKED_PREFIX + pristineId,
    state: e.state,
    mockLabel: e.mockLabel,
    size: base ? base.size : undefined,
    kind: base ? base.kind : undefined,
  };
}

/**
 * Every registry row that is MISSING a wrecked twin. `Object.keys(NO_WRECKED_TWIN)` is the invariant
 * — NOT `[]`, since the `swarf` piece — and the test pins the two lists equal, so an UNLEDGERED
 * omission still fails and a ledgered one names its reason.
 */
export function itemsWithoutWreckedTwin() {
  return ITEM_IDS.filter((id) => !WRECKED[id]);
}

/** Every wrecked twin with no registry row behind it. Empty is the invariant. */
export function orphanWreckedTwins() {
  return WRECKED_IDS.filter((id) => ITEMS[id] === undefined);
}
