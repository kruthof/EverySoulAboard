// THE SKETCH TREATMENT — an EXPERIMENT (lane/sketch-experiment, unmerged).
//
// ⛔ THIS FILE SHIPS NOTHING. No registry row reads it, no builder calls it, no surface imports it.
// It exists to answer ONE question the owner asked: "the furniture looks good, but is a bit in a
// different style to the pawns… let's make it a little more into that sketchy direction." The
// answer wanted is a PICTURE plus a price, not a merge.
//
// ── WHAT IT IS ────────────────────────────────────────────────────────────────────────────────
// A pure POST-PROCESSOR over an emitted SVG fragment. `sketch(fragment, {level, seed})` parses the
// elements a fitting builder wrote, re-draws every straight run as a freehand stroke, and writes the
// fragment back out. Nothing is redrawn by hand; the 34 builders are untouched. That choice is the
// experiment's own hypothesis — that the gap between the pawns and the fittings is a PEN gap, not a
// geometry gap — and the sheet is what tests it.
//
// ── WHY A POST-PROCESSOR AND NOT 34 HAND-SKETCHED BUILDERS ────────────────────────────────────
// Redrawing is the honest way and it costs 34 builders × review. A post-processor costs one file and
// is REVERSIBLE — the treatment is a parameter, so "how sketchy" becomes a dial the owner turns while
// looking at the render, instead of a decision baked into 1500 lines. If the dial cannot reach the
// look, that is itself the finding, and it is cheap to discover this way.
//
// ── DETERMINISM (an invariant, in an experiment too) ──────────────────────────────────────────
// Every wobble, every overshoot, every lump comes from `hash32(seed | element index | segment index |
// channel)`. No `Math.random`, no clock, no locale API, no memo table, no mutable module state. Same
// (fragment, level, seed) ⇒ byte-identical output — `client/test/sketch.test.js` drives that, and
// drives a NEGATIVE control (a different seed must move the bytes) so the pin cannot pass vacuously
// on a treatment that silently did nothing.
//
// ── WHAT THE PAWNS ACTUALLY DO (measured off `render/pawn-svg.js`, not remembered) ────────────
// 1. TWO PASSES: `oblique.ghost()` emits the whole path list in paper at `ink + 3.0` px, then the ink
//    pass. A figure carves its own silhouette out of whatever it stands on.
// 2. ROUND EVERYTHING: `cap: 'round'` on every ink element, `stroke-linejoin="round"` on the halo.
// 3. FREEHAND CURVES: of the 33 path strings in the three BUILDS, the load-bearing ones are `C`/`Q`.
//    The coat is `M-16 -116 C-23 -98 -21 -60 -18 -40 …` — no ruled line carries a silhouette.
// 4. IMPLIED PRESSURE: `sw` per path runs 1.0 (a mouth) → 1.5 (folded arms). The RANGE is 1.5×, and
//    it is spent on WHAT MATTERS, not on how far away the part is.
// 5. NO RULER: nothing in a build is axis-aligned except the feet, and even those are two strokes
//    with a gap rather than one line.
//
// The fittings do the opposite of all five: `oblique.box()` writes ruled polygons with sharp joins
// and no cap term, the `W` ramp is five FIXED steps by mass, and every silhouette is a straight line.
// This module moves each of the five, one knob at a time, so the sheet can say which one did the work.
//
// ── THE FIVE KNOBS ────────────────────────────────────────────────────────────────────────────
//   halo       paper knockout under the ink   (pawn tell 1)  — `haloWiden`, `haloScope`
//   hand       round caps + corner OVERSHOOT  (pawn tell 2/5) — `overshoot`
//   wave       ruled runs become freehand     (pawn tell 3)  — `wave`, `waveMax`, `lump`
//   pressure   break the uniform ramp         (pawn tell 4)  — `ramp`, `silBoost`, `interior`
//   hatch      loosen the mechanical `#fh`                   — `hatch`
//
// ⛔ ONE STRUCTURAL RULE THE PAWNS DO NOT NEED AND THE FURNITURE DOES. `ghost()` emits ALL halos then
// ALL ink, because a figure is one connected thing that never occludes itself. A fitting DOES occlude
// itself — a dining table's paper top face is what hides the legs standing behind it, and the whole
// draw order in `fittings.js` is a painter's algorithm. Hoisting every halo to the front of the
// fragment would put the table's knockout UNDER its own legs and the piece would come apart. So the
// two passes here are PER ELEMENT: fill, then that element's halos, then that element's ink. That is
// the single most important thing this file learned, and it is the reason a naive "just call ghost()
// on the fittings" does not work.

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Deterministic noise
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** FNV-1a over a string → unsigned 32-bit. `pawn-svg.js`'s hash, verbatim, for the same reason. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * A stable value in [-1, 1] for a (seed, element, segment, channel) coordinate.
 * ⛔ THE CHANNEL ARGUMENT IS NOT DECORATION: without it the bow of a segment and the overshoot of its
 * near end would be the SAME number, so every stroke would bow toward the end it grew past — a
 * visible, systematic tell that reads as a rendering artefact rather than as a hand.
 */
function noise(seed, el, seg, channel) {
  return (hash32(`${seed}|${el}|${seg}|${channel}`) / 0x7fffffff) - 1;
}

/** Round to 2 dp, −0 normalised — `oblique.n()`'s rule, so this module's output rounds like the kit's. */
function n2(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The three intensities
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `overshoot` / `waveMax` are in the fragment's LOCAL units (the `helpers.TILE` = 128 space every
// builder authors in), NOT screen px — so the treatment scales with the drawing exactly as the pawn's
// own stroke weights do when a 152-unit figure is drawn at 37 px. That is deliberate and it is what
// the tile strip is for: a hand that scales down with the object is a hand that may vanish at 22 px.

/** @type {Readonly<Object<string, object>>} */
export const LEVELS = Object.freeze({
  // Nothing wobbles. The corners cross and the pen presses. The smallest change that is still a change.
  subtle: Object.freeze({
    label: 'subtle',
    overshoot: 0.9,     // local units a stroke runs past its corner
    wave: 0.006,        // bow amplitude as a fraction of the run's length
    waveMax: 1.6,       // …clamped, so a 100-unit run does not become an arc
    lump: 0.02,         // per-sample radius wobble on an ellipse
    ramp: 1.25,         // gain on the existing W ramp about its midpoint
    silBoost: 1.12,     // extra weight on a silhouette / ground-contact run
    interior: 0.94,     // multiplier on everything else
    haloWiden: 0,       // 0 ⇒ no knockout pass
    haloScope: 'none',  // 'none' | 'sil' | 'all'
    doubles: false,     // draw the silhouette twice, the second pass light
    hatch: false,       // loosen the `#fh` pattern
    ground: false,      // the pawn's own faint floor rule, under the piece
  }),
  // The knockout arrives, on the silhouette only. Runs bow. The ramp opens up.
  medium: Object.freeze({
    label: 'medium',
    overshoot: 2.0, wave: 0.013, waveMax: 3.2, lump: 0.045,
    ramp: 1.55, silBoost: 1.28, interior: 0.85,
    haloWiden: 1.1, haloScope: 'sil', doubles: false, hatch: true, ground: true,
  }),
  // Everything on. This is the level that answers "is there such a thing as too far".
  strong: Object.freeze({
    label: 'strong',
    overshoot: 3.6, wave: 0.024, waveMax: 5.5, lump: 0.075,
    ramp: 1.9, silBoost: 1.5, interior: 0.74,
    haloWiden: 1.9, haloScope: 'all', doubles: true, hatch: true, ground: true,
  }),
  // ⭐ THE RECOMMENDATION, and it is `medium` WITH THE KNOCKOUT TAKEN OUT — which is the finding the
  // knob sheet produced rather than a taste I arrived with. See the file header's structural rule:
  // a fitting's PAPER-FILLED FACES ALREADY ARE the knockout. `oblique.box()` fills the front and the
  // top with `#EBE4D1`, which is exactly what `ghost()`'s first pass does for a pawn — so the halo
  // knob adds a SECOND knockout to art that already has one, and the only thing the second one can
  // still reach is the ink of the elements drawn BEFORE it. It does not carve the piece out of the
  // floor; it eats the piece's own legs, louvres and slats. Measured on the knob sheet: the table's
  // four legs come away with white bites where the top face's halo crosses them, and the locker's
  // six louvre runs break into dashes. The pawns can afford `widen: 3.0` because a figure is one
  // connected outline that never has to survive a sibling's halo; furniture is a painter's stack.
  hand: Object.freeze({
    label: 'hand',
    overshoot: 2.0, wave: 0.013, waveMax: 3.2, lump: 0.045,
    ramp: 1.55, silBoost: 1.28, interior: 0.88,
    haloWiden: 0, haloScope: 'none', doubles: false, hatch: true, ground: true,
  }),
});

/** The level ids, in increasing intensity. */
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** The paper the knockout pass is drawn in — `items/helpers.js`'s `PAPER`, as a literal (this module
 *  is dependency-free at its seam, like `oblique.js` and `helpers.js` both are). */
const PAPER = '#EBE4D1';
/** The midpoint of the fittings' `W` ramp (`W.mid`) — the pivot the pressure gain turns about. */
const RAMP_MID = 1.4;
/** The ground rule's weight — 2.05% of the drawing box, the ratio the pawn's own rule carries. */
const GROUND_SW = 2.3;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A very small SVG tokeniser
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The input is MACHINE-GENERATED by `items/helpers.js`'s `scene`: self-closing elements with
// double-quoted attribute values, no `>` inside any value (colours, numbers, `url(#…)`, path data and
// two font stacks — checked, none carry one). A DOM parser would be the correct tool for arbitrary
// SVG; for this input a tokeniser is enough and keeps the module runnable in bare node.

const TAG = /<[^>]*>/g;

function attrs(tag) {
  const out = {};
  const re = /([-\w:]+)="([^"]*)"/g;
  let m = re.exec(tag);
  while (m) { out[m[1]] = m[2]; m = re.exec(tag); }
  return out;
}

function tagName(tag) {
  const m = /^<\s*\/?\s*([-\w:]+)/.exec(tag);
  return m ? m[1] : '';
}

/** ` name="value"` for a map, in insertion order, skipping null/undefined. */
function attrStr(map) {
  return Object.keys(map)
    .filter((k) => map[k] != null)
    .map((k) => ` ${k}="${map[k]}"`)
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Path data
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The builders emit ABSOLUTE commands only: `M`, `L`, `A`, `Q`, `Z` from `fittings.js`, plus `H`/`V`
// from `helpers.roundedRectPath` (the warm set). Relative commands are passed through untouched
// rather than mis-parsed — a silently wrong parse of a curve is a piece that draws garbage, and this
// is an experiment, not a renderer.

const CMD = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;

function nums(s) {
  return (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
}

/**
 * Parse a `d` into subpaths. Returns `null` when anything relative or unsupported appears, which is
 * the caller's signal to pass the element through UNTREATED rather than to guess.
 * @returns {{subs: Array<{pts: number[][], arcs: object[], closed: boolean, poly: boolean}>}|null}
 */
function parsePath(d) {
  const subs = [];
  let cur = null;
  let x = 0, y = 0;
  let m = null;
  CMD.lastIndex = 0;
  m = CMD.exec(d);
  if (!m) return null;
  while (m) {
    const c = m[1];
    const a = nums(m[2]);
    if (c === 'M') {
      if (a.length < 2) return null;
      [x, y] = a;
      cur = { pts: [[x, y]], arcs: [], closed: false, poly: true };
      subs.push(cur);
      // an `M` with extra pairs is an implicit `L` run
      for (let i = 2; i + 1 < a.length; i += 2) { x = a[i]; y = a[i + 1]; cur.pts.push([x, y]); }
    } else if (!cur) {
      return null;
    } else if (c === 'L') {
      for (let i = 0; i + 1 < a.length; i += 2) { x = a[i]; y = a[i + 1]; cur.pts.push([x, y]); }
    } else if (c === 'H') {
      for (let i = 0; i < a.length; i += 1) { x = a[i]; cur.pts.push([x, y]); }
    } else if (c === 'V') {
      for (let i = 0; i < a.length; i += 1) { y = a[i]; cur.pts.push([x, y]); }
    } else if (c === 'A') {
      if (a.length < 7) return null;
      cur.poly = false;
      cur.arcs.push({ at: cur.pts.length, rx: a[0], ry: a[1], rot: a[2], laf: a[3], sf: a[4] });
      x = a[5]; y = a[6];
      cur.pts.push([x, y]);
    } else if (c === 'Q' || c === 'C') {
      // A curve the builder already drew by hand — keep the whole subpath verbatim.
      return null;
    } else if (c === 'Z' || c === 'z') {
      cur.closed = true;
    } else {
      return null;
    }
    m = CMD.exec(d);
  }
  return subs.length ? { subs } : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The hand
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ONE FREEHAND RUN from `p0` to `p1`, as a cubic.
 *
 * ⭐ THE BOW IS A CUBIC WITH TWO PERPENDICULAR CONTROL OFFSETS, and their SIGNS are the whole
 * character: same sign = a bow (a line drawn in one confident sweep, which is what a short member
 * looks like); opposite signs = an S (a long run the hand corrected halfway, which is what a 2.6 m
 * bench edge looks like). Picking between them by length rather than by a coin is what stops the set
 * reading as noise: short parts are confident, long parts waver, exactly as a real drawing does.
 *
 * ⚠️ OVERSHOOT IS CLAMPED TO A QUARTER OF THE RUN. Without the clamp, the 3.7-unit foot boxes every
 * fitting stands on (`foot()` is 7 × 4 × 6 cm) would grow past themselves at `strong` and the standoff
 * would read as a scribble instead of a foot — measured on the first render, which is what put the
 * clamp here.
 */
function handRun(p0, p1, L, seed, el, seg) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.001)) return null;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;              // the perpendicular

  const o0 = Math.min(L.overshoot * (0.6 + 0.4 * Math.abs(noise(seed, el, seg, 'o0'))), len * 0.25);
  const o1 = Math.min(L.overshoot * (0.6 + 0.4 * Math.abs(noise(seed, el, seg, 'o1'))), len * 0.25);
  const ax = x0 - ux * o0, ay = y0 - uy * o0;
  const bx = x1 + ux * o1, by = y1 + uy * o1;
  const eLen = len + o0 + o1;

  const amp = Math.min(L.wave * eLen, L.waveMax);
  const s1 = noise(seed, el, seg, 'w1');
  // long runs waver (S), short runs bow — the threshold is one waveMax's worth of arc over the run
  const sShape = eLen > 40 ? -1 : 1;
  const s2 = sShape * s1 * (0.55 + 0.45 * Math.abs(noise(seed, el, seg, 'w2')));

  const c1x = ax + ux * eLen * 0.33 + px * amp * s1;
  const c1y = ay + uy * eLen * 0.33 + py * amp * s1;
  const c2x = ax + ux * eLen * 0.67 + px * amp * s2;
  const c2y = ay + uy * eLen * 0.67 + py * amp * s2;

  return `M${n2(ax)} ${n2(ay)} C${n2(c1x)} ${n2(c1y)} ${n2(c2x)} ${n2(c2y)} ${n2(bx)} ${n2(by)}`;
}

/**
 * A FREEHAND ELLIPSE — the pawn's own lumpy skull, generalised.
 *
 * Twelve samples, each radius nudged by `lump`, joined with a Catmull-Rom → cubic conversion so the
 * result is smooth rather than a dodecagon. The INK path runs 1.12 turns and the FILL path closes at
 * 1.0, which is the hand-drawn circle's tell: the pen comes back round and past where it started.
 * Two paths, one sample list — the same "never two hand-kept lists" rule `ghost()` exists for.
 */
function handEllipse(cx, cy, rx, ry, L, seed, el, close) {
  const N = 12;
  const turns = close ? 1 : 1.12;
  const steps = Math.round(N * turns);
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / N) * Math.PI * 2;
    const k = 1 + L.lump * noise(seed, el, i % N, 'e');
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C${n2(p1[0] + (p2[0] - p0[0]) / 6)} ${n2(p1[1] + (p2[1] - p0[1]) / 6)}`
      + ` ${n2(p2[0] - (p3[0] - p1[0]) / 6)} ${n2(p2[1] - (p3[1] - p1[1]) / 6)}`
      + ` ${n2(p2[0])} ${n2(p2[1])}`;
  }
  return close ? `${d} Z` : d;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Pressure
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE PEN, per run.
 *
 * The fittings already encode mass in `W` (0.9 hair → 2.2 mass) and then apply it FLATLY: every
 * member of a class is the same weight wherever it sits. The pawns do not — a coat outline is 1.35
 * and the mouth inside it is 1.0, and the difference is about IMPORTANCE, not about class. So:
 *   1. the existing ramp is GAINED about its midpoint (`ramp`), which pulls the five steps apart;
 *   2. a run that is on the SILHOUETTE or touching the GROUND is boosted (`silBoost`);
 *   3. everything else is cut (`interior`).
 * A floor is applied because a stroke below ~0.4 local units disappears the moment the piece is drawn
 * in a 22-px tile, and an invisible interior detail is a deleted one.
 */
function pen(sw, L, sil) {
  const gained = RAMP_MID + (sw - RAMP_MID) * L.ramp;
  return Math.max(0.42, gained * (sil ? L.silBoost : L.interior));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The hatch
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LOOSEN `#fh`.
 *
 * ⛔ AND SAY THE LIMIT OUT LOUD, because it is the honest half of this knob: a `<pattern>` TILES, so
 * every "irregularity" inside one repeats exactly at the period, and at a 7-unit period the eye reads
 * the repeat as a texture rather than as a hand. Widening the cell to 3× and putting three lines in it
 * at jittered offsets, angles and weights breaks the metronome as far as a pattern can be broken — but
 * a genuinely hand-hatched face means abandoning `<pattern>` and drawing real clipped lines per face,
 * which is a different and much more expensive package (see the memo). This is the cheap 80%.
 */
function loosenHatch(tag, seed) {
  const a = attrs(tag);
  const p = Number(a.width) || 7;
  const w = p * 3;
  let inner = `<rect width="${n2(w)}" height="${n2(p)}" fill="${PAPER}"/>`;
  for (let i = 0; i < 3; i += 1) {
    const jx = p * i + p * 0.5 + p * 0.22 * noise(seed, 'fh', i, 'x');
    const tilt = p * 0.16 * noise(seed, 'fh', i, 't');
    const sw = 0.7 * (1 + 0.28 * noise(seed, 'fh', i, 'w'));
    const op = 0.28 * (1 + 0.22 * noise(seed, 'fh', i, 'o'));
    inner += `<path d="M${n2(jx - tilt)} 0 C${n2(jx + tilt)} ${n2(p * 0.35)} `
      + `${n2(jx - tilt)} ${n2(p * 0.65)} ${n2(jx + tilt)} ${n2(p)}" `
      + `stroke="#14120F" fill="none" stroke-width="${n2(sw)}" stroke-linecap="round" opacity="${n2(op)}"/>`;
  }
  return { open: tag.replace(/width="[^"]*"/, `width="${n2(w)}"`), inner };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// sketch() — the one entry point
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Restyle an emitted SVG fragment as a freehand drawing.
 *
 * @param {string} fragment an `items/*` builder's output (a `<g class="pl-item">…</g>` string)
 * @param {{level?: string|object, seed?: string}} [opts]
 *   level — a LEVELS id ('subtle'|'medium'|'strong') or a knob object; an unknown id returns the
 *           fragment UNCHANGED, which is what makes 'original' a legal column on the sheet.
 *   seed  — the stable identity the wobble hangs off. USE THE PIECE ID: two dining tables in one room
 *           should be the same drawing, and a table should be the same drawing next frame.
 * @returns {string} the restyled fragment
 */
export function sketch(fragment, opts = {}) {
  const src = typeof fragment === 'string' ? fragment : '';
  if (!src) return '';
  const o = opts || {};
  const L = typeof o.level === 'object' && o.level ? o.level
    : (LEVELS[o.level] || null);
  if (!L) return src;
  const seed = String(o.seed == null ? 'sk' : o.seed);

  // ── pass 1: tokenise, and measure the whole body so "silhouette" and "ground" mean something ──
  const toks = src.match(TAG) || [];
  let inDefs = false;
  const shapes = [];        // index into toks → measured shape
  let maxY = -Infinity, minY = Infinity, minX = Infinity, maxX = -Infinity, maxArea = 0;
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    const nm = tagName(t);
    if (nm === 'defs') inDefs = !/^<\s*\//.test(t);
    if (t === '</defs>') { inDefs = false; continue; }
    if (inDefs || t.startsWith('</')) continue;
    if (nm !== 'path' && nm !== 'rect' && nm !== 'ellipse' && nm !== 'circle' && nm !== 'line') continue;
    const a = attrs(t);
    let pts = null;
    if (nm === 'path' && a.d) { const p = parsePath(a.d); if (p) pts = p.subs.flatMap((s) => s.pts); }
    else if (nm === 'rect') {
      const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
      pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    } else if (nm === 'ellipse' || nm === 'circle') {
      const cx = +a.cx || 0, cy = +a.cy || 0;
      const rx = nm === 'circle' ? (+a.r || 0) : (+a.rx || 0);
      const ry = nm === 'circle' ? (+a.r || 0) : (a.ry == null ? rx : +a.ry);
      pts = [[cx - rx, cy - ry], [cx + rx, cy + ry]];
    } else if (nm === 'line') {
      pts = [[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]];
    }
    if (!pts || !pts.length) continue;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const area = (bb[2] - bb[0]) * (bb[3] - bb[1]);
    if (bb[3] > maxY) maxY = bb[3];
    if (bb[1] < minY) minY = bb[1];
    if (bb[0] < minX) minX = bb[0];
    if (bb[2] > maxX) maxX = bb[2];
    if (area > maxArea) maxArea = area;
    shapes[i] = { nm, a, bb, area };
  }
  // THE GROUND BAND: a run whose BOTH ends sit inside it is touching the deck, and gets the extra
  // pressure a real drawing spends where an object meets the floor.
  //
  // ⚠️ IT IS 2% OF THE PIECE'S OWN DRAWN HEIGHT, NOT AN ABSOLUTE — and the first cut used an absolute
  // and got caught by the standoff FEET. A `foot()` is 6 cm tall, which at fitting scale is about 2
  // local units, so a fixed 2.24-unit band swallowed the WHOLE foot and gave its top edge and its
  // back edge the same ground pressure as the edge actually resting on the deck. Proportional, the
  // band is a thin strip at the bottom of whatever is drawn, which is what "ground contact" means.
  const gBand = (Number.isFinite(maxY) && Number.isFinite(minY) && maxY > minY)
    ? maxY - 0.02 * (maxY - minY) : -Infinity;

  // ── pass 2: rewrite ──
  const out = [];
  inDefs = false;
  let pendingHatch = null;
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    const nm = tagName(t);

    if (nm === 'defs') { inDefs = !/^<\s*\//.test(t); out.push(t); continue; }
    if (inDefs) {
      if (L.hatch && nm === 'pattern' && !t.startsWith('</')) {
        pendingHatch = loosenHatch(t, seed);
        out.push(pendingHatch.open, pendingHatch.inner);
        continue;
      }
      if (pendingHatch) { if (t === '</pattern>') { pendingHatch = null; out.push(t); } continue; }
      out.push(t);
      continue;
    }

    const sh = shapes[i];
    if (!sh) { out.push(t); continue; }
    const drawn = drawShape(sh, L, seed, i, gBand, maxArea);
    out.push(drawn == null ? t : drawn);
  }

  // ⭐ THE GROUND RULE — the pawns' sixth tell, and the one this experiment did not set out to find.
  //
  // `pawnSprite` ends with `M3.4 23.5 L12.6 23.5`, `stroke-width 0.45`, `opacity 0.35`: the design's
  // own faint rule under the feet, which is what replaced the warm skin's shadow ellipse ("a figure
  // on paper does not cast a shadow, it stands on a line", pawn-svg.js:483). EVERY PAWN HAS ONE AND
  // NO FITTING DOES — so a pawn and a chair standing on the same deck are drawn by two different
  // conventions about what the floor is, and that reads before any stroke weight does.
  //
  // Ported by RATIO, not by number: the doc's rule spans 57% of the figure's box width at 1.3× the
  // body's own stroke. Here it spans the piece's drawn footprint at 1.3 × `W.mid`.
  //
  // ⛔ IT IS APPENDED, NEVER INTERLEAVED, and it goes at the very END so it lies over the deck grid
  // rather than under the piece — which is where the pawn's own rule sits relative to the figure.
  //
  // ⚠️ IT MUST GO INSIDE THE `<g transform="translate(…) scale(…)">` `helpers.scene.render` writes,
  // NOT AFTER IT. The rule is authored in the PIECE's coordinates; appended outside that group it is
  // in the box's px space, where those numbers mean nothing, and it drew a line off the bottom-right
  // corner of every card until this was found by looking.
  //
  // ⛔ AND "THE SECOND-TO-LAST `</g>`" IS NOT GOOD ENOUGH, which the ROOM SHOT proved and the
  // catalogue sheet could not: `roomzoom-view.standItem` wraps the whole fragment in ANOTHER
  // `<g transform="translate(x y)">` to place the piece on the floor, so counting closers from the
  // end lands one group too far out — and the rule then draws in room px, hundreds of units away, on
  // a surface where a stray mark is indistinguishable from a fitting. The group is therefore FOUND by
  // its own transform (the last opening `<g>` whose transform carries a `scale(`) and MATCHED by
  // walking the depth, which is right however many wrappers a caller adds.
  //
  // ⚠️ AND THE WEIGHT IS A CONSTANT IN THE DRAWING BOX, not a per-piece derivation. The pawn's rule is
  // 0.45 of a 24-unit box against a body 22 units tall — 2.05%. `BOX` is 112, so 2.3. That makes the
  // rule behave in a room exactly as `W.mid` already does: constant in local units, therefore varying
  // in centimetres with each piece's own drawing scale. Inheriting the set's existing behaviour is the
  // point; a rule with its own scaling law would be a second convention, which is the disease.
  if (L.ground && Number.isFinite(maxY) && Number.isFinite(minX) && maxX > minX) {
    const pad = (maxX - minX) * 0.03;
    const y = maxY + Math.max(0.6, (maxY - minY) * 0.012);
    const closer = scaleGroupCloser(out);
    const rule = `<path d="M${n2(minX + pad)} ${n2(y)} L${n2(maxX - pad)} ${n2(y)}" fill="none"`
      + ` stroke="#14120F" stroke-width="${GROUND_SW}" stroke-linecap="round" opacity="0.35"/>`;
    if (closer >= 0) out.splice(closer, 0, rule);
  }
  return out.join('');
}

/**
 * One measured shape → its freehand replacement, or `null` to pass it through.
 *
 * THE PER-ELEMENT TWO PASSES ARE HERE AND THE ORDER IS THE POINT (see the file header): the FILL
 * first (so the element still occludes what the builder drew behind it), then this element's halos,
 * then this element's ink. Hoisting the halos any further would break the painter's algorithm the
 * whole `fittings.js` draw order is built on.
 */
function drawShape(sh, L, seed, el, gBand, maxArea) {
  const { nm, a, bb, area } = sh;
  const fill = a.fill == null ? 'none' : a.fill;
  const stroke = a.stroke;
  if (!stroke || stroke === 'none') {
    // A fill-only element (a glow, a stripe). There is no pen to make freehand; leave it.
    return null;
  }
  const sw = a['stroke-width'] == null ? 1 : Number(a['stroke-width']);
  if (!Number.isFinite(sw)) return null;

  // ⭐ THE SILHOUETTE TEST, AND IT IS A HEURISTIC — stated as one so nobody later reads it as a fact
  // about the geometry. A run is treated as silhouette if the element it belongs to is one of the
  // piece's BIG faces (≥ 18% of the largest element's box, i.e. a body panel rather than a latch), or
  // if the element already carries the top of the `W` ramp (≥ 1.8: `W.heavy`/`W.mass`, which is the
  // builders' own statement that this member is structural). Ground contact is added per RUN below.
  const bigFace = maxArea > 0 && area >= maxArea * 0.18;
  const heavy = sw >= 1.8 - 1e-9;
  const elSil = bigFace || heavy;

  const opacity = a.opacity;
  const dash = a['stroke-dasharray'];

  /** Runs to draw: `{d, sil}`. */
  const runs = [];
  let fillPath = null;

  if (nm === 'ellipse' || nm === 'circle') {
    const cx = +a.cx || 0, cy = +a.cy || 0;
    const rx = nm === 'circle' ? (+a.r || 0) : (+a.rx || 0);
    const ry = nm === 'circle' ? (+a.r || 0) : (a.ry == null ? rx : +a.ry);
    if (!(rx > 0 && ry > 0)) return null;
    fillPath = handEllipse(cx, cy, rx, ry, L, seed, el, true);
    runs.push({ d: handEllipse(cx, cy, rx, ry, L, seed, el, false), sil: elSil || cy + ry >= gBand });
  } else {
    let subs = null;
    if (nm === 'path' && a.d) {
      const p = parsePath(a.d);
      if (!p) {
        // A hand-drawn curve (`Q`/`C`) or an arc-bearing body the parser will not risk. It still gets
        // the PEN and the CAPS — the two knobs that need no geometry — which is why a cylinder does
        // not sit in the sheet at its original weight while everything round it moves.
        return repaint(a.d, pen(sw, L, elSil), stroke, fill, opacity, dash, L, elSil);
      }
      subs = p.subs;
    } else if (nm === 'rect') {
      const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
      if (!(w > 0 && h > 0)) return null;
      subs = [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, poly: true, arcs: [] }];
    } else if (nm === 'line') {
      subs = [{ pts: [[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]], closed: false, poly: true, arcs: [] }];
    }
    if (!subs) return null;
    // Any subpath carrying an arc is kept whole (its radii lumped) rather than decomposed.
    const anyArc = subs.some((s) => s.arcs.length);
    if (anyArc) {
      return repaint(lumpArcs(a.d, L, seed, el), pen(sw, L, elSil), stroke, fill, opacity, dash, L, elSil);
    }
    if (fill !== 'none') {
      fillPath = subs.map((s) => s.pts.map(([x, y], k) => `${k ? 'L' : 'M'}${n2(x)} ${n2(y)}`).join(' ')
        + (s.closed ? ' Z' : '')).join(' ');
    }
    let seg = 0;
    for (const s of subs) {
      const P = s.pts;
      const last = s.closed ? P.length : P.length - 1;
      for (let k = 0; k < last; k += 1) {
        const p0 = P[k], p1 = P[(k + 1) % P.length];
        const d = handRun(p0, p1, L, seed, el, seg);
        seg += 1;
        if (!d) continue;
        const onGround = p0[1] >= gBand && p1[1] >= gBand;
        runs.push({ d, sil: elSil || onGround });
      }
    }
  }

  if (!runs.length) return null;

  const parts = [];
  if (fillPath && fill !== 'none') {
    parts.push(`<path d="${fillPath}" fill="${fill}" stroke="none"${opacity ? ` opacity="${opacity}"` : ''}/>`);
  }
  // halos first, THEN ink — per element (file header)
  if (L.haloWiden > 0 && L.haloScope !== 'none') {
    const halo = runs.filter((r) => (L.haloScope === 'all' ? true : r.sil));
    if (halo.length) {
      parts.push(`<g fill="none" stroke="${PAPER}" stroke-linecap="round" stroke-linejoin="round">${
        halo.map((r) => `<path d="${r.d}" stroke-width="${n2(pen(sw, L, r.sil) + L.haloWiden)}"/>`).join('')}</g>`);
    }
  }
  for (const r of runs) {
    const w = pen(sw, L, r.sil);
    parts.push(`<path d="${r.d}" fill="none" stroke="${stroke}" stroke-width="${n2(w)}"`
      + ' stroke-linecap="round" stroke-linejoin="round"'
      + (dash ? ` stroke-dasharray="${dash}"` : '')
      + (opacity ? ` opacity="${opacity}"` : '') + '/>');
    // THE SECOND PASS OVER A SILHOUETTE — a hand goes back over the line that matters. Offset by a
    // different noise channel so the two do not lie on top of each other; light, so it reads as
    // pressure rather than as a doubled edge.
    if (L.doubles && r.sil) {
      const d2 = shiftRun(r.d, noise(seed, el, r.d.length, 'd1') * 0.9, noise(seed, el, r.d.length, 'd2') * 0.9);
      parts.push(`<path d="${d2}" fill="none" stroke="${stroke}" stroke-width="${n2(w * 0.55)}"`
        + ' stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>');
    }
  }
  return parts.join('');
}

/**
 * The index of the `</g>` that closes the LAST scaling group in a token list, or −1.
 * Found by transform and matched by depth — see the ground rule's own comment for why counting
 * closers from the end of the list is wrong the moment a caller wraps the fragment.
 */
function scaleGroupCloser(toks) {
  let open = -1;
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (t.startsWith('</')) continue;
    if (tagName(t) === 'g' && /transform="[^"]*scale\(/.test(t)) open = i;
  }
  if (open < 0) return -1;
  let depth = 0;
  for (let i = open; i < toks.length; i += 1) {
    const t = toks[i];
    if (tagName(t) !== 'g') continue;
    if (t.startsWith('</')) { depth -= 1; if (depth === 0) return i; } else if (!t.endsWith('/>')) depth += 1;
  }
  return -1;
}

/** Re-emit an element with a new `d` (or its old one), the new pen, round caps, and its own halo. */
function repaint(d, w, stroke, fill, opacity, dash, L, sil) {
  if (d == null) return null;
  const halo = (L.haloWiden > 0 && (L.haloScope === 'all' || (L.haloScope === 'sil' && sil)))
    ? `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${n2(w + L.haloWiden)}"`
      + ' stroke-linecap="round" stroke-linejoin="round"/>'
    : '';
  return halo + `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${n2(w)}"`
    + ' stroke-linecap="round" stroke-linejoin="round"'
    + (dash ? ` stroke-dasharray="${dash}"` : '')
    + (opacity ? ` opacity="${opacity}"` : '') + '/>';
}

/** Nudge every coordinate pair in a `d` by (dx, dy) — the second pass of a doubled silhouette. */
function shiftRun(d, dx, dy) {
  let k = 0;
  return d.replace(/-?\d*\.?\d+/g, (s) => {
    const v = Number(s) + (k % 2 === 0 ? dx : dy);
    k += 1;
    return String(n2(v));
  });
}

/**
 * LUMP AN ARC'S RADII. A cylinder's body and a hoop are `A rx ry …`, and a perfectly circular arc is
 * the most mechanical mark in the set — so the radii are nudged, deterministically, by `lump`. The
 * sweep flags and the end point are untouched: moving those moves the geometry, and this treatment is
 * about the pen, not about where the object is.
 */
function lumpArcs(d, L, seed, el) {
  if (!d) return null;
  let idx = 0;
  return d.replace(/A\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g, (_m, rx, ry) => {
    const k1 = 1 + L.lump * noise(seed, el, idx, 'ax');
    const k2 = 1 + L.lump * noise(seed, el, idx, 'ay');
    idx += 1;
    return `A${n2(Number(rx) * k1)} ${n2(Number(ry) * k2)}`;
  });
}
