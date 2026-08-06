// THE SKETCH TREATMENT — ADOPTED 2026-08-05 at `strong`, catalogue-wide.
//
// ⭐ THE OWNER'S RULING, VERBATIM, off the experiment's screenshots: *"i like the strong one — just
// ensure you are getting the dimension and perspectives right."* Both halves are load-bearing. The
// first picks `LEVELS.strong` over the experiment's own recommendation (`hand`), which is recorded
// below as a superseded finding rather than deleted. The second is the package's spine and it is
// answered STRUCTURALLY, not by promise — see "GEOMETRY AUTHORITY" three paragraphs down.
//
// ── THE STYLE REFERENCE ───────────────────────────────────────────────────────────────────────
// `docs/design/perilune-art-style.md` is the one place the whole visual language is stated
// together — palette, projection, the pawns' hand, this treatment's knobs and its two exceptions,
// and the checklist for adding a piece. It cites; this file derives. Read it before drawing, and
// re-measure any count it quotes rather than trusting the number (TRAPS 8th).
//
// ── WHO CALLS IT ──────────────────────────────────────────────────────────────────────────────
// `items/helpers.js`'s `item()` — the one door every builder already goes through — with
// `{ sketched: true }` from the four PAPER catalogues' harnesses and from `wrecked.buildWrecked`
// for their twins. That is 34 fittings + 13 machines + 14 paper-fixtures + 9 paper-resources, plus
// the 47 twins of those pieces. MATERIALS (`paper-materials.js`) are NOT treated: a wall or floor
// skin is a tiled `<pattern>` over a full-bleed face, a different idiom from a drawn object, and
// the owner has not seen one treated. FILED, not decided. The pre-redesign WARM set is not treated
// either — it is the idiom being replaced.
//
// ── GEOMETRY AUTHORITY — the owner's caveat, as a structure ───────────────────────────────────
// This module's INPUT is a string and its OUTPUT is a string. The oblique projection, every `SPECS`
// centimetre, `roomFrame`/`frameFor`, the per-piece drawing scale and every placement transform
// have already run when it is called, and it can reach none of them: it can only move an EMITTED
// PATH POINT, and by how much is bounded by `amplitudeBound()` below and measured — every piece of
// all four catalogues, both directions, per element — by `client/test/sketch-adoption.test.js`.
// The catalogues' own projection guards therefore keep asking their questions of the RAW fragment
// (`item(..., { sketch: false })`), which is the geometry, and each carries a treated leg with the
// amplitude tolerance stated EXPLICITLY. The displacement pin is the bridge between the two.
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
    interiorOvershoot: 1, // …scaled DOWN on interior detail; see the note under `handRun`
  }),
  // The knockout arrives, on the silhouette only. Runs bow. The ramp opens up.
  medium: Object.freeze({
    label: 'medium',
    overshoot: 2.0, wave: 0.013, waveMax: 3.2, lump: 0.045,
    ramp: 1.55, silBoost: 1.28, interior: 0.85,
    haloWiden: 1.1, haloScope: 'sil', doubles: false, hatch: true, ground: true,
    interiorOvershoot: 0.45,
  }),
  // Everything on. This is the level that answers "is there such a thing as too far".
  strong: Object.freeze({
    label: 'strong',
    overshoot: 3.6, wave: 0.024, waveMax: 5.5, lump: 0.075,
    ramp: 1.9, silBoost: 1.5, interior: 0.74,
    haloWiden: 1.9, haloScope: 'all', doubles: true, hatch: true, ground: true,
    interiorOvershoot: 0.45,
  }),
  // ⚠️ SUPERSEDED BY THE OWNER, 2026-08-05 — kept, not deleted, because the finding is still true and
  // the level is still the control the adoption's halo comparison is driven against. `hand` is what
  // the experiment recommended; `strong` is what the owner picked after seeing both. The measured
  // cost of that choice is in the adoption's report: at `strong` the knockout runs on EVERY element
  // (`haloScope: 'all'`), so a piece's own top face bites the legs standing behind it.
  //
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
    interiorOvershoot: 0.45,
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
/** The class the appended ground rule carries, so a guard can name it instead of guessing at it. */
export const GROUND_CLASS = 'pl-sk-ground';
/**
 * The class the DOUBLED silhouette pass carries.
 *
 * ⛔ IT EXISTS FOR A GUARD, AND THE GUARD IS THE STRONGEST STATEMENT IN THIS PACKAGE. Every primary
 * run this module emits is COLLINEAR with the segment it replaces — `handRun` moves its ends ALONG
 * the run's own axis and bows the curve about it, so the chord from first point to last lies on the
 * original line to within rounding (measured across the 34 fittings: 0.0069 units, worst case). That
 * makes "the treatment did not move the drawing" an EXACT test rather than a bounded one, and it
 * catches what the amplitude bound cannot: a systematic error SMALLER than the amplitude — a 2%
 * scale, a translation, a rotation. The doubled pass is the one exception (`shiftRun` nudges it off
 * its own line on purpose), so it has to be identifiable, and a class is how a guard names a thing
 * instead of inferring it from an opacity that a builder is also allowed to set.
 */
export const DOUBLE_CLASS = 'pl-sk-2nd';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE AMPLITUDE BOUND — the owner's caveat, as a number
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⭐ DERIVED FROM THE KNOBS, TERM BY TERM, so a knob that moves moves the bound with it and the pin
// cannot be satisfied by widening a literal. Every emitted coordinate of a treated element lies
// within `amplitudeBound(level, radius)` of the UNTREATED shape it replaces, and every point of the
// untreated shape lies within the same distance of the treated curve. In the fittings' own 128-unit
// drawing space; at `strong`, radius 0, that is 6.78 units — 6.1% of the 112-unit drawing box.
//
//   1. OVERSHOOT (`L.overshoot`) — `handRun` starts a run `o0` BEFORE its first point and ends it
//      `o1` after its last, with `o0, o1 ≤ L.overshoot` (and ≤ ¼ of the run, which only ever makes
//      the term smaller). Purely along the run's own axis, so it is a displacement of exactly that.
//   2. BOW (`L.waveMax`) — the two cubic control points sit at 0.33 and 0.67 of the EXTENDED run
//      with a perpendicular offset of at most `min(L.wave·eLen, L.waveMax)`. Their positions ALONG
//      the axis fall strictly inside the original segment (0.33·eLen − o0 ≥ 0.165·len and
//      0.67·eLen − o0 ≤ 0.84·len, using o ≤ 0.25·len), so their whole displacement from the segment
//      is the perpendicular one. A cubic lies inside its control hull, so no drawn point exceeds it.
//      Terms 1 and 2 are perpendicular to each other and never both maximal on one point, so the
//      bound takes the LARGER rather than their sum — `max(overshoot, waveMax)`, not the hypotenuse.
//   3. LUMP (`L.lump`, round things only) — `handEllipse` samples at radius `r·(1 ± lump)`, and the
//      Catmull-Rom control it hangs off each sample stands `√(1 + (1/6)²) − 1` further out again
//      (the 12-sample chord is `2·sin(15°)·r`, its control offset a sixth of the neighbour span).
//      PROPORTIONAL to the radius, which is why the bound takes one.
//   4. THE DOUBLED SILHOUETTE (`L.doubles`) — `shiftRun` nudges the second pass by up to
//      ±DOUBLE_NUDGE on EACH axis, on top of a run that already carries terms 1 and 2. Additive.
//   5. ROUNDING — `n2` on this side, `oblique.n`/`r3` on the other, both 2 dp.
//
// ⛔ WHAT THE BOUND DOES NOT COVER, SAID HERE RATHER THAN DISCOVERED LATER: (a) an `A` command's
// RADII, which `lumpArcs` scales by `1 ± L.lump` while leaving every emitted point alone — pinned
// separately and exactly, as "the treated `d` is the untreated `d` with only the arc radii moved,
// each within `lump`"; (b) the appended GROUND RULE, which is new ink by design and carries
// `class="${GROUND_CLASS}"` so a guard excludes it by name.

/** `shiftRun`'s per-axis nudge for the second pass over a silhouette. */
export const DOUBLE_NUDGE = 0.9;
/** How far a 12-sample Catmull-Rom control stands outside the sample radius it hangs off. */
export const CR_BULGE = Math.sqrt(1 + (1 / 6) ** 2) - 1;
/** Both sides round to 2 dp (`n2` here, `oblique.n` / `helpers.r3` there). */
export const ROUND_EPS = 0.01;

/**
 * The maximum distance a treated point may sit from the untreated shape it came from.
 * @param {string|object} level a LEVELS id or a knob object
 * @param {number} [radius] the shape's largest radius, for a round thing; 0 for a straight run
 * @returns {number} local drawing units (the builders' 128-unit space), 0 for an unknown level
 */
export function amplitudeBound(level, radius = 0) {
  const L = typeof level === 'object' && level ? level : LEVELS[level];
  if (!L) return 0;
  const straight = Math.max(L.overshoot, L.waveMax);
  const round = radius > 0 ? radius * ((1 + L.lump) * (1 + CR_BULGE) - 1) : 0;
  const doubled = L.doubles ? DOUBLE_NUDGE * Math.SQRT2 : 0;
  return Math.max(straight, round) + doubled + ROUND_EPS;
}

/**
 * THE PEN'S RANGE UNDER A LEVEL — every `stroke-width` the treatment can emit for an untreated ramp
 * spanning `[swMin, swMax]`, INCLUDING the paper knockout (which is `pen + haloWiden`) and the
 * doubled silhouette's light second pass (`pen × 0.55`).
 *
 * (`penSteps`, just above, is the same statement CLOSED rather than bounded: the exact set of
 * widths a ramp of `steps` can produce under a level. A catalogue whose raw ramp is five named
 * rungs has a treated ramp that is a computable set, and "one of these values" is a far stronger
 * rule than "between these values" — it catches a weight invented inside the range.)
 *
 * ⛔ THIS IS WHAT REPLACES A FIXED CEILING, AND THE FLOOR IS THE HALF THAT MATTERS. A ramp guard
 * that only caps weights is satisfied by a treatment that draws every line at 0.42; the ramp exists
 * to say that a hairline and a mass member are DIFFERENT, so the range has two ends and both move
 * with the knobs.
 */
export function penSteps(level, steps) {
  const L = typeof level === 'object' && level ? level : LEVELS[level];
  if (!L) return [...steps].map(n2).sort((a, b) => a - b);
  const out = new Set();
  for (const sw of steps) {
    for (const sil of [false, true]) {
      const w = pen(sw, L, sil);
      out.add(n2(w));
      if (L.haloWiden > 0 && L.haloScope !== 'none') out.add(n2(w + L.haloWiden));
      if (L.doubles) out.add(n2(w * 0.55));
    }
  }
  if (L.ground) out.add(GROUND_SW);
  return [...out].sort((a, b) => a - b);
}

export function penRange(level, swMin, swMax) {
  const L = typeof level === 'object' && level ? level : LEVELS[level];
  if (!L) return { min: swMin, max: swMax };
  const w = [pen(swMin, L, false), pen(swMin, L, true), pen(swMax, L, false), pen(swMax, L, true)];
  const lo = Math.min(...w) * (L.doubles ? 0.55 : 1);
  const hi = Math.max(...w) + (L.haloWiden > 0 && L.haloScope !== 'none' ? L.haloWiden : 0);
  return { min: n2(lo), max: n2(hi) };
}

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

/**
 * EVERY COORDINATE PAIR IN A `d` THE STRICT PARSER REFUSED — endpoints and control points, with an
 * `A`'s radii / rotation / flags correctly skipped. Absolute commands only; anything relative or
 * unknown returns `null`, which keeps the caller passing the element through rather than guessing.
 *
 * ⛔ THIS EXISTS BECAUSE THE TREATMENT WAS INERT ON A WHOLE CLASS OF MEMBER AND NOBODY COULD SEE IT
 * (2026-08-05, the adoption; CLAUDE.md's "a verb can be present and INERT"). `drawShape` has always
 * carried an arm for a body the builder already drew as curves — "it still gets the PEN and the
 * CAPS, which is why a cylinder does not sit in the sheet at its original weight while everything
 * round it moves" — and that arm was UNREACHABLE: pass 1 measured a shape only if `parsePath`
 * succeeded, `parsePath` bails on the first `Q`/`C`, so a curve-bearing path never entered
 * `shapes[]` and pass 2 emitted it verbatim. Measured on the four catalogues at adoption: 53 of
 * 1428 stroked path bodies — the sink's tap, every one of the herb planter's leaves, the whole
 * two-pass occupant figure inside capsule 31 — shipped at their untreated weight with the rest of
 * their own piece re-penned. The tell was in the stroke ramp: five raw ramp values survived into
 * treated output, on exactly those elements.
 */
function curvePoints(d) {
  const out = [];
  CMD.lastIndex = 0;
  let m = CMD.exec(d);
  if (!m) return null;
  while (m) {
    const c = m[1];
    const a = nums(m[2]);
    if (c === 'M' || c === 'L' || c === 'T') {
      for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]);
    } else if (c === 'C') {
      for (let i = 0; i + 5 < a.length; i += 6) out.push([a[i], a[i + 1]], [a[i + 2], a[i + 3]], [a[i + 4], a[i + 5]]);
    } else if (c === 'Q' || c === 'S') {
      for (let i = 0; i + 3 < a.length; i += 4) out.push([a[i], a[i + 1]], [a[i + 2], a[i + 3]]);
    } else if (c === 'A') {
      for (let i = 0; i + 6 < a.length; i += 7) out.push([a[i + 5], a[i + 6]]);
    } else if (c === 'H' || c === 'V' || c === 'Z') {
      // an axis run or a close carries no NEW extreme this measurement needs; the pen does not care
    } else {
      return null;   // relative, or something this module has never seen
    }
    m = CMD.exec(d);
  }
  return out.length ? out : null;
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
 * ⭐ OVERSHOOT IS SCALED DOWN ON INTERIOR DETAIL (`oScale`), AND THAT CAME OFF THE KNOB SHEET RATHER
 * THAN OUT OF A THEORY. Applied flat, the locker's six louvre runs and its two vent panels grow past
 * the door edges they belong to, and a piece whose whole readability is small parallel detail turns
 * untidy — while the SAME amplitude on the same piece's corner posts is exactly the architect's tell
 * the experiment is after. An architect's pencil runs past a corner it is establishing; it does not
 * run past a louvre. So the amplitude follows the same silhouette/interior split the pen does.
 *
 * ⚠️ OVERSHOOT IS CLAMPED TO A QUARTER OF THE RUN. Without the clamp, the 3.7-unit foot boxes every
 * fitting stands on (`foot()` is 7 × 4 × 6 cm) would grow past themselves at `strong` and the standoff
 * would read as a scribble instead of a foot — measured on the first render, which is what put the
 * clamp here.
 */
function handRun(p0, p1, L, seed, el, seg, oScale = 1) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.001)) return null;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;              // the perpendicular

  const over = L.overshoot * (oScale > 0 ? oScale : 0);
  const o0 = Math.min(over * (0.6 + 0.4 * Math.abs(noise(seed, el, seg, 'o0'))), len * 0.25);
  const o1 = Math.min(over * (0.6 + 0.4 * Math.abs(noise(seed, el, seg, 'o1'))), len * 0.25);
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
/**
 * IS THIS PATTERN THE KIT'S `#fh` HATCH, or somebody's structural field?
 *
 * ⛔ THE ANSWER USED TO BE "EVERY PATTERN IS THE HATCH", AND THAT WAS A LATENT DEFECT THE MATERIALS
 * EXTENSION FOUND (2026-08-05). `loosenHatch` REPLACES a pattern's whole interior with three
 * jittered rules on a paper ground and widens its cell to 3×. Applied to the kit's hatch that is
 * exactly right — it is one mechanical line and the point is to break the metronome. Applied to
 * `paper-materials.js` it would have DELETED four skins' identifying art and tripled their pitch:
 * the grow matting's woven lattice (four crossing bands in a 32-unit cell), the grating's bar and
 * its edge rule, the carpet's eighteen pile ticks, and the blast wall's own half-cell hazard block.
 * Every one of those is a MATERIAL, measured in centimetres by `paper-materials.test.js`, and the
 * treatment would have turned it into generic hatch at three times the spacing.
 *
 * So the kit's hatch is recognised by its own SHAPE rather than by being a pattern: a SQUARE cell
 * carrying exactly two marks — a ground rect that fills the cell, and one straight rule from
 * `M0 0` to `L0 <period>`. That is `oblique.fhDef` and every catalogue's `hatchPaint`, verbatim and
 * at any scale (`insulated-wall` draws it at a 9.432 period and is correctly loosened). Anything
 * else is a field somebody drew on purpose and is passed through untouched.
 */
function isKitHatch(openTag, inner) {
  const a = attrs(openTag);
  const w = Number(a.width);
  const h = Number(a.height);
  if (!(w > 0) || Math.abs(w - h) > 1e-6) return false;
  const marks = inner.filter((t) => ['rect', 'path', 'line', 'circle', 'ellipse'].includes(tagName(t)));
  if (marks.length !== 2) return false;
  const g = attrs(marks[0]);
  if (tagName(marks[0]) !== 'rect' || Math.abs(Number(g.width) - w) > 1e-6
    || Math.abs(Number(g.height) - h) > 1e-6 || !g.fill || g.fill === 'none') return false;
  if (tagName(marks[1]) !== 'path') return false;
  return new RegExp(`^M0 0 L0 ${w.toString().replace('.', '\\.')}$`).test(String(attrs(marks[1]).d));
}

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
 *   trace — an ARRAY to record `{src, out, nm, radius}` into, one row per shape the treatment saw.
 *           ⭐ THIS IS THE MEASUREMENT SEAM AND IT EXISTS FOR TRAPS-4. "Did the treatment move this
 *           element's geometry, and by how much" is a question about a PAIRING between an input
 *           element and the several output elements that replaced it, and that pairing cannot be
 *           recovered from the output string by any text scan — a guard that tried would be
 *           re-deriving the tokeniser and would agree with itself when both were wrong. Recording
 *           the argument AT THE SEAM is the repo's own remedy. It costs one array push per shape and
 *           is inert when absent; `sketch()` reads nothing back out of it.
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
  const trace = Array.isArray(o.trace) ? o.trace : null;

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
    if (nm === 'path' && a.d) {
      const p = parsePath(a.d);
      // ⛔ THE `else` IS NOT A FALLBACK, IT IS THE FIX: without it a curve-bearing body never enters
      // `shapes[]`, never reaches `drawShape`, and ships untreated. See `curvePoints`.
      pts = p ? p.subs.flatMap((s) => s.pts) : curvePoints(a.d);
    }
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
        // LOOK AHEAD to the cell's own contents before deciding — `isKitHatch` is a question about
        // what is INSIDE the pattern, and a decision taken on the open tag alone is the decision
        // that rewrote four material skins.
        const inner = [];
        let j = i + 1;
        while (j < toks.length && toks[j] !== '</pattern>') { inner.push(toks[j]); j += 1; }
        if (isKitHatch(t, inner)) {
          pendingHatch = loosenHatch(t, seed);
          out.push(pendingHatch.open, pendingHatch.inner);
          continue;
        }
      }
      if (pendingHatch) { if (t === '</pattern>') { pendingHatch = null; out.push(t); } continue; }
      out.push(t);
      continue;
    }

    const sh = shapes[i];
    if (!sh) { out.push(t); continue; }
    const drawn = drawShape(sh, L, seed, i, gBand, maxArea);
    if (trace) {
      const a = sh.a;
      const rr = sh.nm === 'circle' ? (+a.r || 0)
        : (sh.nm === 'ellipse' ? Math.max(+a.rx || 0, a.ry == null ? (+a.rx || 0) : (+a.ry || 0)) : 0);
      trace.push({ src: t, out: drawn, nm: sh.nm, radius: rr });
    }
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
    const rule = `<path class="${GROUND_CLASS}" d="M${n2(minX + pad)} ${n2(y)} L${n2(maxX - pad)} ${n2(y)}" fill="none"`
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
        // the run's class is decided BEFORE it is drawn, because the amplitude reads it too
        const sil = elSil || (p0[1] >= gBand && p1[1] >= gBand);
        const io = L.interiorOvershoot == null ? 1 : L.interiorOvershoot;
        const d = handRun(p0, p1, L, seed, el, seg, sil ? 1 : io);
        seg += 1;
        if (d) runs.push({ d, sil });
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
      const d2 = shiftRun(r.d, noise(seed, el, r.d.length, 'd1') * DOUBLE_NUDGE,
        noise(seed, el, r.d.length, 'd2') * DOUBLE_NUDGE);
      parts.push(`<path class="${DOUBLE_CLASS}" d="${d2}" fill="none" stroke="${stroke}" stroke-width="${n2(w * 0.55)}"`
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
