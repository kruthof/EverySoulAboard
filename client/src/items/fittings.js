// THE THIRTY FITTINGS — the buildable set of `design-import/Perilune Fittings.dc.html`, redrawn in
// the paper/ink/oxblood idiom on the cabinet-oblique kit (`client/src/render/oblique.js`).
//
// Every builder is a pure `(opts) -> string` SVG-`<g>`-fragment builder with exactly the contract the
// rest of `client/src/items/*` holds (helpers.js:1-16): no DOM, no clock, no randomness, same input
// ⇒ byte-identical output, def ids namespaced by `idPrefix`. `index.js` registers them; nothing here
// imports `index.js`, so the dependency runs one way and the set reverts by reverting one file plus
// its registry rows.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SPACE. The catalogue authors every piece against ONE rule: a floor line, a centimetre scale up
// the left, boxes in the galley plate's oblique, and ANYTHING ROUND DRAWN LEVEL — "so a round fitting
// has no heading and can be set down any way about" (the catalogue's own opening paragraph). This
// module keeps all three, but expresses them in CENTIMETRES rather than in the catalogue's card
// pixels: each builder declares its footprint in `SPECS` (`w × d × h`, the cm on the catalogue's own
// dimension line) and places every part through `oblique.roomFrame(...).project(xCm, yCm, zCm)` —
// x across, y BACK into the picture, z up. That is the single placement door the kit asks callers to
// use, and it is why a fitting drawn here lands in P3's room cutaway and P4's plate miniatures at a
// different `s` and still lines up.
//
// The per-piece scale is DERIVED, never authored: a fitting occupies `w + 0.4·d` cm across and
// `h + 0.6·d` cm up (the oblique's own two ratios), and the scale is whatever makes the larger of
// those two fill `BOX`. So the catalogue's proportions survive exactly and the tile normalisation in
// `helpers.js` does the rest. ⚠️ IT ALSO MEANS GEOMETRY MUST STAY INSIDE `0..w`, `0..d`, `0..h`: a
// part authored outside that range is still drawn, but it is not counted when the piece is centred,
// so it will clip. Wall stubs, flues, taps and plants are inside their piece's declared box for
// exactly this reason, and `SPECS` says where the box is bigger than the dimension line.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ RULING E8 — FIXED WHILE PORTING, NOT TRANSCRIBED. The charter
// (`docs/design/perilune-visual-redesign.charter.md` §4) names fourteen of the thirty catalogue
// drawings as visually unfinished and groups the faults into six classes. This module fixes each one
// AT THE PLACE IT OCCURS, and every fix is called out in its builder's own comment so a reviewer can
// diff the result against the document and see which differences are deliberate:
//
//   1. CORNER-TO-CORNER GREY BRACES that read as strike-throughs — bench (01), larder (06).
//      Replaced by SHORT braces attached at both ends.
//   2. FULL ELLIPSES ON CYLINDERS, whose back halves show through the body — water butt (15),
//      drum (18). Replaced by FRONT half-arcs (`hoop()`), which is the same construction the
//      catalogue already uses for a cylinder's own bottom edge.
//   3. FLOATING / DETACHED MEMBERS — bunk stack (08) posts and ladder, grow rack (20) drip line,
//      compost bin (21) crank, deck lamp (25) base chevron, heater (26) brackets/knob/pipe, cell
//      rack (27) hazard mark, shrine shelf (30) brackets. Each is now attached at both ends.
//   4. PLACEHOLDER GLYPHS FOR PARTS — sink (11) tap, cold locker (12) dial, crate (14) lid handle,
//      planter (19) plants. Each redrawn as the real part.
//   5. PROJECTION BREAKS — table (04) back stretcher, duct run (17) flatness, workbench (22)
//      pegboard. All three are re-projected through the shared frame, so the class of fault is
//      unreachable here rather than merely absent.
//   6. WALL-HUNG ITEMS WITH NO WALL — duct run (17), heater (26), curtain rail (29), shrine
//      shelf (30). Each now carries a minimal hatched WALL STUB with dashed cut edges (the room
//      cutaway's own "this is cut away" dialect), so the mounting height reads.
//
// Everything else is faithful: the same proportions, the same 3-face extrusion, the same hatched
// side faces, the same round-objects-level rule, and the same stroke-weight ramp by mass.
//
// ⚠️ ONE DIALECT CHOICE IS THE CATALOGUE'S AND IS KEPT DELIBERATELY: a round FEATURE on a vertical
// face (a dial, a knob, an intake port, a hob seen on a top face) is drawn as a LEVEL ellipse. On a
// top face that is simply correct. On a FRONT face it is not — a circle there projects to a circle in
// cabinet oblique — but the catalogue draws every one of them level (12's dial, 16's intake, 21's
// crank knob, 26's knob), it reads as a recessed round port rather than as a sticker, and it is
// consistent across all thirty. Changing it would be a redraw of the dialect rather than a fix to a
// defect, so it is recorded here instead of made.
//
// ⚠️ AND ONE DEVIATION IS BIGGER THAN A FIX: the STOOL (05). The catalogue draws it as a pedestal —
// base disc, column, seat — and then three strokes that begin halfway up the column and end in the
// air at three different heights, one of them a stub. Its caption says "Three legs. Stows under the
// table." A pedestal, a floor disc AND three legs is three answers to one question, so the pedestal
// and the disc are dropped and the piece is a genuine tripod: the seat is the catalogue's, to the
// centimetre; the legs splay from under it to three feet on the floor. Recorded loudly because it is
// the one place this module changes WHAT a fitting is rather than how well it is drawn — and because
// it also buys the set a silhouette: chair = pedestal disc, stool = tripod, at any tile size.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { item, r3, TILE, INK, PAPER, ATTEND } from './helpers.js';
import {
  box as obox, roomFrame, HATCH, PAPER_FLAT, n as nn, DEPTH_RATIO, PX_PER_CM,
} from '../render/oblique.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The drawing box, the weight ramp, the cut dash
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The extent a fitting is scaled to fill, inside `helpers.TILE` (128). The margin is the warm set's
 *  own: no piece there uses the full tile either, and a fitting drawn edge-to-edge loses its
 *  outermost ink wherever a surface insets the tile. */
export const BOX = 112;

/**
 * The stroke-weight ramp, BY MASS (charter §1: 0.9–2.2). The catalogue's own weights are the same
 * five steps: hairlines and seams at the bottom, a fitting's principal body at `mid`, welded frame
 * members and the heaviest posts at the top.
 */
export const W = Object.freeze({ hair: 0.9, fine: 1.1, mid: 1.4, heavy: 1.8, mass: 2.2 });

/**
 * THE OBLIQUE'S TWO RATIOS, AS MAGNITUDES — read from the kit, never re-typed.
 *
 * A centimetre of depth moves a point `DX` cm right and `DY` cm up; `oblique.DEPTH_RATIO` is the one
 * home for both, and `depth()` is the only thing that reads it in SVG-y (where "up" is NEGATIVE, so
 * `DEPTH_RATIO.y` is −0.6). Everything in THIS module wants the magnitude: an extent grows upward by
 * `DY·d`, and a level circle's `ry` is `DY·rx`. Taking `Math.abs` here — once, with the sign
 * explained — is what keeps four call sites from each carrying their own `0.6`, which is how the
 * ellipse rule and the centring rule come to disagree after a change nobody thought was a change.
 */
const DX = DEPTH_RATIO.x;
const DY = Math.abs(DEPTH_RATIO.y);

/** The room cutaway's "this edge is cut away" dash, at fitting scale. `ROOM_WEIGHT.cutDash` is
 *  `'7 5'` in a 900-px plate; the same rhythm in a 112-unit box is this. Used ONLY on wall stubs,
 *  where it is the whole point: the wall is a fragment, not a wall. */
const CUT_DASH = '3 2';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SPECS — every fitting's drawn box in centimetres
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `w` across · `d` back · `h` up, in the catalogue's order (01 → 30). Where the DRAWING is taller or
// wider than the dimension line (a flue, a tap, a plant, a wall stub, a curtain), the box is the
// DRAWING's and the comment carries the dimension line — the dimension line describes the object,
// this describes the picture, and only the picture is centred. Round pieces set `w = d = ∅` and are
// marked `round`, which is a note for the reader: the level-ellipse rule lives in the builders.

export const SPECS = Object.freeze({
  'bench':            { w: 260, d: 34, h: 45 },                  // 01 · 260 × 34 × 45
  'chair':            { w: 46, d: 46, h: 43, round: true },      // 02 · ∅46 × 43
  'locker':           { w: 92, d: 42, h: 183 },                  // 03 · 92 × 42 × 183
  'dining-table':     { w: 180, d: 80, h: 75 },                  // 04 · 180 × 80 × 75
  'stool':            { w: 34, d: 34, h: 45, round: true },      // 05 · ∅34 × 45
  'shelf-rack':       { w: 120, d: 40, h: 200 },                 // 06 · 120 × 40 × 200 (larder)
  'cot':              { w: 200, d: 70, h: 58 },                  // 07 · 200 × 70 × 40 + raised end
  'bunk-bed':         { w: 200, d: 70, h: 190 },                 // 08 · 200 × 70 × 190
  'footlocker':       { w: 90, d: 45, h: 50 },                   // 09 · 90 × 45 × 45 + lid
  'cooker':           { w: 90, d: 60, h: 172 },                  // 10 · 90 × 60 × 88 + flue
  'sink':             { w: 100, d: 55, h: 130 },                 // 11 · 100 × 55 × 88 + tap
  'cooler':           { w: 80, d: 60, h: 178 },                  // 12 · 80 × 60 × 178
  'desk':             { w: 160, d: 60, h: 90 },                  // 13 · 160 × 60 × 90 (worktop)
  'storage-crate':    { w: 60, d: 45, h: 52 },                   // 14 · 60 × 45 × 45 + lid handle
  'supply-barrel':    { w: 70, d: 70, h: 120, round: true },     // 15 · ∅70 × 120 (water butt)
  'o2-scrubber':      { w: 70, d: 50, h: 178 },                  // 16 · 70 × 50 × 178
  'pipe-run':         { w: 270, d: 30, h: 205, z0: 128 },        // 17 · 240 × 28 hung 150 + walls
  'fuel-drum':        { w: 55, d: 55, h: 85, round: true },      // 18 · ∅55 × 85 (drum)
  'herb-planter':     { w: 120, d: 45, h: 74 },                  // 19 · 120 × 45 × 38 + plants
  'hydroponics':      { w: 100, d: 45, h: 190 },                 // 20 · 100 × 45 × 190 (grow rack)
  'compost-bin':      { w: 76, d: 60, h: 98 },                   // 21 · 60 × 60 × 98 + crank
  'workbench':        { w: 180, d: 70, h: 168 },                 // 22 · 180 × 70 × 92 + pegboard
  'vice-post':        { w: 58, d: 40, h: 120, round: true },     // 23 · ∅40 × 120 + jaw handle
  'research-console': { w: 60, d: 45, h: 132 },                  // 24 · 60 × 45 × 132 (terminal)
  'standing-lamp':    { w: 44, d: 44, h: 178, round: true },     // 25 · ∅32 × 178, shade ∅44
  'space-heater':     { w: 76, d: 36, h: 128, z0: 20 },          // 26 · 60 × 25 × 70 hung 40 + wall
  'battery-bank':     { w: 100, d: 45, h: 132 },                 // 27 · 100 × 45 × 116 + hazard plate
  'rug':              { w: 126, d: 86, h: 0 },                   // 28 · 120 × 80 + fringe (mat)
  'curtain-rail':     { w: 120, d: 24, h: 206, z0: 74 },         // 29 · 120 hung 190 + ceiling
  'shrine-shelf':     { w: 64, d: 30, h: 172, z0: 100 },         // 30 · 50 × 20 hung 140 + wall
});

/** Every fitting id, in catalogue order (01 → 30). */
export const FITTING_IDS = Object.freeze(Object.keys(SPECS));

/**
 * ⭐⭐ THE PIECE'S FOOTPRINT AT A FACING — `w` and `d` SWAPPED on an odd quarter-turn, and nothing
 * else touched.
 *
 * ⛔ EVERYTHING DOWNSTREAM MUST TAKE THE SAME ANSWER OR THE PIECE CHANGES SIZE WHEN IT TURNS.
 * `extents` decides how much room the drawing needs, `scaleOf` decides the px/cm that makes it fill
 * `BOX`, and `roomBox` inverts that scale to put the piece on a surface at true centimetres. Feed
 * two of the three the unturned spec and the third the turned one and a rotated bench is drawn at a
 * different metre — which is `CLAUDE.md`'s 7th trap shape (a ratio suite cannot see a scale error)
 * waiting to happen. So there is ONE function, and `frameFor` and `roomBox` both call it.
 *
 * `h` and `z0` never move: a quarter-turn in PLAN cannot change how tall a thing is.
 */
function facedSpec(spec, facing) {
  const f = Number.isFinite(facing) ? ((facing | 0) & 3) : 0;
  return (f & 1) ? { ...spec, w: spec.d, d: spec.w } : spec;
}

/**
 * A fitting's extents in centimetres: `[across, up]`, the oblique's own two ratios applied.
 *
 * ⚠️ `z0` IS NOT DECORATION, AND IT WAS ADDED AFTER LOOKING AT THE RENDER. A wall-hung piece's box
 * runs from the floor to its top, and the four hung fittings draw NOTHING in the bottom half of it —
 * so a piece centred on its declared box sat in the top of its tile with a tile-height of empty
 * paper under it, which at Room-Zoom size is a fitting that has drifted off its own anchor. `z0` is
 * the lowest z the piece actually draws at, so the DRAWN band is what gets centred. It never moves a
 * floor-standing piece: its default is 0, which is where they all start.
 */
function extents(spec) {
  const z0 = spec.z0 == null ? 0 : spec.z0;
  return [spec.w + DX * spec.d, (spec.h - z0) + DY * spec.d];
}

/** The derived px-per-cm for a fitting: whatever makes its larger extent fill `BOX`. */
function scaleOf(spec) {
  const [ex, ey] = extents(spec);
  const m = Math.max(ex, ey);
  return m > 0 ? BOX / m : 1;
}

/**
 * The registry `size` hint for a fitting — its drawn footprint in the mock-px space every other
 * `ITEMS` row states its size in. DERIVED from `SPECS`, never transcribed: a fitting cannot disagree
 * with its own drawing about how big it is, which is the shape of defect the wrecked join was built
 * around (`wrecked.js` borrows `size` from the pristine row rather than carrying a second column).
 *
 * ⚠️ ONE SHARED SCALE, AND THE FIRST DRAFT GOT THIS WRONG IN A WAY WORTH RECORDING. It used the
 * PER-PIECE drawing scale — whatever makes each piece fill `BOX` — so every one of the thirty came
 * out normalised to 112 in its larger axis and a 260 cm bench claimed 112 × 27 while a ∅46 cm chair
 * claimed 102 × 112. Those are the two pieces' TILE proportions; as a footprint they say the chair is
 * four times the bench, which is false about the objects and false about the drawings. The scale is
 * therefore `PX_PER_CM.catalogue` — the catalogue's own centimetre rule, the one the thirty were
 * measured at, imported rather than typed — so the numbers are comparable ACROSS the set and against
 * the warm-set rows beside them (a 40 cm oxygen tank is 38 × 70 there, ≈ 1 px/cm; these are 0.85).
 * The extents are the projected ones, depth term included, because `size` describes the picture.
 *
 * ⛔ THIS IS NOT THE DRAWING SCALE — see `BOX_EXTENT` below, which is, and which is what a rule about
 * ink LENGTH inside a tile must be stated against.
 */
export const SIZES = Object.freeze(FITTING_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = PX_PER_CM.catalogue;
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

/**
 * A fitting's DRAWN extent, in the px the builder actually emits — `BOX` in the larger axis, by
 * construction, and the piece's own proportion in the other.
 *
 * Exported because the alternative is a caller re-deriving `scaleOf` from `SPECS` and `BOX`, and a
 * second derivation of the drawing scale is the same defect `frameFor` exists to prevent. The E8-1
 * length rule is stated against this and NOT against `SIZES`: a diagonal in the emitted path data is
 * measured in these px, and dividing it by a footprint at a different scale is a ratio about nothing.
 */
export const BOX_EXTENT = Object.freeze(FITTING_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = scaleOf(SPECS[id]);
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The primitives — everything below is drawn through these, in centimetres
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The 45° side-face hatch, registered as this fragment's own `<pattern>`.
 *
 * ⚠️ NOT `oblique.fhDef()/fhRef()`, AND THE REASON IS THE REGISTRY CONTRACT rather than taste. Those
 * two mint a FIXED id per surface root (`<prefix>-fh`), which is right for P3's one room document and
 * wrong here: an item builder may be called many times into ONE document, and `items.test.js` pins
 * that two placements of the same piece share NO def id. `scene.pat()` numbers its defs off the
 * caller's `idPrefix`, which is exactly that guarantee. The GEOMETRY is the kit's — every number
 * below comes from `oblique.HATCH`, so the two cannot drift, and `fittings.test.js` asserts it: the
 * design's own `<pattern id="fh">` is a 7-px period at 45°, `#14120F` at 0.28 over `#EBE4D1`, and
 * those four values reach this function only through `HATCH`, never as literals.
 */
function hatchPaint(s) {
  return s.pat(
    `<rect width="${r3(HATCH.period)}" height="${r3(HATCH.period)}" fill="${HATCH.ground}"/>`
    + `<path d="M0 0 L0 ${r3(HATCH.period)}" stroke="${HATCH.ink}" stroke-width="${r3(HATCH.width)}"`
    + ` opacity="${r3(HATCH.opacity)}"/>`,
    { w: HATCH.period, h: HATCH.period, transform: `rotate(${r3(HATCH.angle)})` },
  );
}

/**
 * One stroked path. Written straight rather than through `scene.path()` because a fitting's members
 * are ROUND-CAPPED — the catalogue's welded tube reads as tube only with `stroke-linecap="round"`,
 * and the shared helper carries no cap term.
 */
function ink(s, d, o = {}) {
  s.raw(
    `<path d="${d}" fill="${o.fill == null ? 'none' : o.fill}"`
    + ` stroke="${o.stroke == null ? INK : o.stroke}" stroke-width="${r3(o.sw == null ? W.fine : o.sw)}"`
    + (o.cap === false ? '' : ' stroke-linecap="round"')
    + (o.dash ? ` stroke-dasharray="${o.dash}"` : '')
    + (o.opacity == null ? '' : ` opacity="${r3(o.opacity)}"`)
    + '/>',
  );
}

/** `M…L…` through a list of `[xCm, yCm, zCm]` points, projected. `close` appends `Z`. */
function path(F, pts, close = false) {
  return pts.map(([x, y, z], i) => {
    const [px, py] = F.project(x, y, z);
    return `${i === 0 ? 'M' : 'L'}${nn(px)} ${nn(py)}`;
  }).join(' ') + (close ? ' Z' : '');
}

/** A stroked polyline through cm points. */
function line(s, F, pts, o = {}) { ink(s, path(F, pts, o.close === true), o); }

/** A quadratic curve from cm point `a` to cm point `b`, bending through cm control `c`. */
function curve(s, F, a, c, b, o = {}) {
  const [ax, ay] = F.project(a[0], a[1], a[2]);
  const [cx, cy] = F.project(c[0], c[1], c[2]);
  const [bx2, by2] = F.project(b[0], b[1], b[2]);
  ink(s, `M${nn(ax)} ${nn(ay)} Q${nn(cx)} ${nn(cy)} ${nn(bx2)} ${nn(by2)}`, o);
}

/** A filled+stroked quad through four cm points (a shelf top, a wall stub, a soil bed, a pegboard). */
function quad(s, F, pts, o = {}) {
  ink(s, path(F, pts, true), { fill: o.fill == null ? PAPER : o.fill, sw: W.fine, cap: false, ...o });
}

/**
 * A fitting's BODY: the three visible faces of a box standing at `(x, y)` with its base at `z`.
 * Straight through `oblique.box()`, so the winding, the face order and the depth vector are the kit's
 * and are never re-derived here.
 */
function bx(s, F, x, y, z, w, h, d, o = {}) {
  // ⛔ THROUGH `F.boxAt`, NOT `F.project`, AND THIS IS THE ONE PLACE THE FACING COULD HAVE BEEN
  // MISSED. `oblique.box()` draws an AXIS-ALIGNED extrusion from a projected origin plus RAW cm
  // extents — the extents never pass through the plan map — so a projected-only origin would put a
  // turned bench in exactly the right place with exactly the wrong footprint: the whole piece
  // correct except that it still runs the old way. `boxAt` maps the box's plan rect and swaps its
  // extents on an odd facing, and at facing 0 it returns `project`'s own answer to the digit.
  const b = F.boxAt(x, y, z, w, d);
  const px = b.x, py = b.y;
  s.raw(obox(px, py, b.w, h, b.d, F.s, {
    strokeWidth: o.sw == null ? W.mid : o.sw,
    sideFill: o.sideFill || (o.hatch ? 'hatch' : 'flat'),
    hatch: o.hatch,
    flat: o.flat == null ? PAPER_FLAT : o.flat,
    front: o.front,
    top: o.top,
    stroke: o.stroke,
    dash: o.dash,
    opacity: o.opacity,
  }));
}

/** A LEVEL ellipse — the catalogue's round-objects rule, `ry = 0.6·rx` straight off the oblique. */
function disc(s, F, x, y, z, rCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  s.ellipse({
    cx, cy, rx: F.s * rCm, ry: DY * F.s * rCm,
    fill: o.fill === undefined ? PAPER : o.fill,
    stroke: o.stroke == null ? INK : o.stroke,
    sw: o.sw == null ? W.fine : o.sw,
    opacity: o.opacity,
  });
}

/**
 * THE FRONT HALF of a level ellipse — the fix for defect class 2.
 *
 * A rolling hoop round a barrel is a horizontal circle. Half of it is behind the barrel, and the
 * catalogue draws the WHOLE ellipse (`<ellipse … fill="none">` ×3 on both 15 and 18), so the back
 * half shows straight through the body and the drum reads as a wire cage. The visible half is the
 * LOWER half of the projected ellipse, which is the same `A rx ry 0 0 0` sweep the catalogue already
 * uses for a cylinder's own bottom edge.
 */
function hoop(s, F, x, y, z, rCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  const rx = F.s * rCm;
  const ry = DY * F.s * rCm;
  ink(s, `M${nn(cx - rx)} ${nn(cy)} A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(cx + rx)} ${nn(cy)}`, o);
}

/**
 * A vertical CYLINDER: the body (two sides, a visible front bottom arc, a hidden back top arc) and
 * its top cap. The construction is the catalogue's own, verbatim in shape — the back arc exists only
 * so the body closes, and the cap covers it, which is why NO back half ever shows here.
 */
function cyl(s, F, x, y, z0, z1, rCm, o = {}) {
  const [cx, yb] = F.project(x, y, z0);
  const [, yt] = F.project(x, y, z1);
  const rx = F.s * rCm;
  const ry = DY * F.s * rCm;
  const sw = o.sw == null ? W.mid : o.sw;
  ink(s,
    `M${nn(cx - rx)} ${nn(yt)} L${nn(cx - rx)} ${nn(yb)}`
    + ` A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(cx + rx)} ${nn(yb)}`
    + ` L${nn(cx + rx)} ${nn(yt)} A${nn(rx)} ${nn(ry)} 0 0 1 ${nn(cx - rx)} ${nn(yt)} Z`,
    { fill: o.fill === undefined ? PAPER : o.fill, sw, cap: false });
  if (o.cap !== false) disc(s, F, x, y, z1, rCm, { sw });
}

/** A standoff FOOT on the deck grid — the catalogue's shared vocabulary, 7 × 4 × 6 cm. */
function foot(s, F, x, y, hatch) { bx(s, F, x, y, 0, 7, 4, 6, { hatch, sw: W.fine }); }

/**
 * A WALL STUB — the fix for defect class 6.
 *
 * Four of the thirty hang on something the catalogue does not draw, so the mounting height reads as
 * an accident of layout rather than as a fact about the fitting. A stub is a FRAGMENT of that
 * surface: hatched like every other cut face in this dialect, with DASHED outer edges, which is the
 * room cutaway's own way of saying "this continues past the drawing" (`ROOM_WEIGHT.cutDash`). It is
 * deliberately small — enough to give the eye a datum, never enough to become the picture.
 *
 * `plane` is `'back'` (a wall behind, spanning x × z at depth `at`), `'end'` (a wall across the run,
 * spanning y × z at x = `at`) or `'over'` (a ceiling above, spanning x × y at z = `at`).
 */
function wallStub(s, F, plane, at, a0, a1, b0, b1, hatch) {
  const corners = plane === 'back'
    ? [[a0, at, b0], [a1, at, b0], [a1, at, b1], [a0, at, b1]]
    : plane === 'end'
      ? [[at, a0, b0], [at, a1, b0], [at, a1, b1], [at, a0, b1]]
      : [[a0, b0, at], [a1, b0, at], [a1, b1, at], [a0, b1, at]];
  // The stub is drawn BACK, on purpose: at full strength the wall's hatch competes with the fitting's
  // own hatched side faces and the eye reads two objects. 0.55 keeps it a datum.
  quad(s, F, corners, { fill: hatch, sw: W.fine, opacity: 0.55 });
  ink(s, path(F, corners, true), { sw: W.fine, dash: CUT_DASH, cap: false, opacity: 0.6 });
}

/**
 * Fitting `id`'s own frame. The origin is placed so the piece's DRAWN band is CENTRED on (0,0) — the
 * coordinate model every builder in this directory shares (helpers.js:9-15) — and `project` is
 * `oblique.roomFrame`'s, unmodified. ONE derivation, used by the harness and by any caller that wants
 * to draw on a fitting: two derivations of one projection is how the Overview and the Room Zoom came
 * to skin the same glyph two different ways (`oblique.js`'s own header records that scar).
 */
export function frameFor(id, facing) {
  const spec = SPECS[id];
  if (!spec) return undefined;
  // ⭐ THE CENTRING AND THE SCALE ARE THE **FACED** BOX'S — a bench turned end-on is 34 cm across
  // and 260 cm deep, so it fills `BOX` differently and its origin sits somewhere else. THE PLAN MAP
  // IS THE FRAME'S, so `roomFrame` is handed the AUTHORED `w`/`d` (it has to know the box the map
  // turns inside) plus the facing, and every builder keeps writing its own unturned centimetres.
  const fs = facedSpec(spec, facing);
  const [ex, ey] = extents(fs);
  const k = scaleOf(fs);
  return roomFrame(spec.w / 100, spec.d / 100, spec.h / 100, k,
    { x: -(k * ex) / 2, y: k * (ey / 2 + (spec.z0 == null ? 0 : spec.z0)), facing });
}

/**
 * ⭐ VR-P3 — HOW A FITTING DROPS INTO A ROOM AT TRUE SIZE. The ONE derivation of that, here, beside
 * the drawing scale it depends on.
 *
 * `buildItem(id, {w, h})` normalises through `helpers.render`: the art is centred in the w×h box at
 * `min(w,h)/TILE`, so a piece drawn at `scaleOf(spec)` px/cm ends up at `scaleOf · min(w,h)/128`.
 * Asking for a box side of `128·s/scaleOf` therefore puts the piece on screen at EXACTLY `s` px per
 * centimetre — the room cutaway's own rule — and a 260 cm bench is 260 cm of floor.
 *
 * The returned `dx`/`dy` are what a caller adds to the piece's cm ORIGIN (its near-left floor corner,
 * projected) to get the box's top-left: `frameFor`'s origin sits at `(-(k·ex)/2, k·(ey/2 + z0))`
 * inside a box centred on `(side/2, side/2)`, and scaling by `side/128 = s/k` turns those into the
 * offsets below.
 *
 * ⛔ IT LIVES IN THIS FILE AND NOT IN THE ROOM ZOOM, for `frameFor`'s stated reason: a second
 * derivation of the drawing scale is how the harness and the caller come to disagree about how big a
 * bench is. A caller gets `{side, dx, dy}` and never sees `BOX`, `scaleOf` or `extents`.
 *
 * @param {string} id a fitting id
 * @param {number} s  px per cm of the destination surface (PX_PER_CM.room for the cutaway)
 * @returns {{side:number, dx:number, dy:number, wCm:number, dCm:number, hCm:number}|undefined}
 */
export function roomBox(id, s, facing) {
  const spec = SPECS[id];
  if (!spec || !(s > 0)) return undefined;
  // The SAME faced spec `frameFor` uses — see `facedSpec`. `side = TILE·s/k` inverts exactly the
  // scale the builder will draw at, so the piece lands at `s` px per centimetre AT EVERY FACING:
  // a 200 cm cot covers 2 tiles across at facing 0 and 2 tiles back at facing 1, never 1.4 of either.
  const fs = facedSpec(spec, facing);
  const [ex, ey] = extents(fs);
  const k = scaleOf(fs);
  if (!(k > 0)) return undefined;
  const side = (TILE * s) / k;
  const z0 = spec.z0 == null ? 0 : spec.z0;
  return {
    side,
    dx: -side / 2 + (s * ex) / 2,
    dy: -side / 2 - s * (ey / 2 + z0),
    // The FACED footprint, because a caller asking "how much floor does this cover" is asking about
    // the drawing it is about to place, not about the catalogue entry.
    wCm: fs.w, dCm: fs.d, hCm: spec.h,
  };
}

/**
 * The painter's environment: the frame, the spec, the power state and the hatch.
 *
 * ⚠️ `hatch` IS A GETTER, and that is not a flourish: six of the thirty are round pieces with no side
 * face at all, and registering a `<pattern>` they never reference would put an unused def in every one
 * of their fragments. `wrecked.test.js` already treats "a fragment with defs must use them" as a
 * defect for the twins; the same rule is worth holding here, and a getter is the only way to keep the
 * call sites reading `{ F, hatch }`. ⛔ DO NOT SPREAD THIS OBJECT — a spread EVALUATES getters, which
 * would register the pattern for all thirty and quietly undo the whole point.
 */
function envFor(s, id, state, facing) {
  let hp = null;
  return {
    F: frameFor(id, facing),
    spec: SPECS[id],
    state,
    powered: state !== 'off' && state !== 'unpowered',
    get hatch() { if (hp === null) hp = hatchPaint(s); return hp; },
  };
}

/** The harness: an item fragment whose painter draws in the fitting's own centimetres. */
function fitting(id, opts, paint) {
  // ⭐ `env.facing` reaches here from `helpers.item`, which reads `opts.facing` — so a caller says
  // `buildItem(id, { w, h, facing })` and thirty builders turn without one of them mentioning
  // rotation. A builder that has no cm frame at all (the warm set) simply never sees the option.
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state, env.facing)); });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SIT, EAT, KEEP — 01–06
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 01 BENCH · 260 × 34 × 45 · "Bolts to the deck. Seats two, rated for three."
// ⛔ DEFECT 1 FIXED. The catalogue runs ONE grey diagonal from the near-left leg to the far-right
// foot (`M85.3 196.1 L248.5 211.4`, opacity .4). At bench length that is a 175-px line across the
// whole piece and it reads as a strike-through — the mark this dialect uses for "cancelled". It is
// replaced by KNEE BRACES, two per leg pair, each attached to its leg at one end and to the seat
// underside at the other, which is what the line was drawing badly.
const drawBench = (s, { F, hatch }) => {
  for (const x of [25, 233]) { foot(s, F, x, 4, hatch); foot(s, F, x, 24, hatch); }
  for (const x of [28.5, 236.5]) {
    for (const y of [7, 27]) line(s, F, [[x, y, 4], [x, y, 40]], { sw: W.mass });
    line(s, F, [[x, 7, 22], [x, 27, 34]], { sw: W.heavy });
  }
  line(s, F, [[28.5, 7, 22], [236.5, 7, 22]], { sw: W.heavy });
  for (const [x, dx] of [[28.5, 20], [236.5, -20]]) {
    line(s, F, [[x, 7, 34], [x + dx, 7, 40]], { sw: W.fine, opacity: 0.85 });
    line(s, F, [[x, 27, 34], [x + dx, 27, 40]], { sw: W.fine, opacity: 0.85 });
  }
  bx(s, F, 0, 0, 40, 260, 5, 34, { hatch });
  line(s, F, [[0, 0, 42.5], [260, 0, 42.5]], { sw: W.hair, opacity: 0.45, cap: false });
  for (let i = 0; i < 8; i += 1) {
    const x = 18 + i * 30;
    line(s, F, [[x, 4, 45], [x + 16, 4, 45], [x + 16, 30, 45], [x, 30, 45]],
      { sw: W.hair, opacity: 0.8, close: true, cap: false });
  }
};
export const bench = (opts = {}) => fitting('bench', opts, drawBench);

// 02 CHAIR · ∅46 × 43 · "Round, so it cannot be set down facing the wrong way."
// The catalogue's pedestal to the centimetre: a ∅40 base puck with three deck bolts, a ∅14 column, a
// ∅46 seat with an inset ring. Round ⇒ level ellipses, no heading.
const drawChair = (s, { F }) => {
  const c = 23;
  cyl(s, F, c, c, 0, 3, 20, { sw: W.fine });
  for (const [dx, dy] of [[10, -6], [-10, -4], [0, 8]]) {
    disc(s, F, c + dx, c + dy, 3, 1.9, { fill: 'none', sw: W.hair });
  }
  cyl(s, F, c, c, 3, 38, 7, { sw: W.mid });
  cyl(s, F, c, c, 38, 43, 23, { sw: W.heavy });
  disc(s, F, c, c, 43, 16, { fill: 'none', sw: W.hair, opacity: 0.5 });
};
export const chair = (opts = {}) => fitting('chair', opts, drawChair);

// 03 LOCKER · 92 × 42 × 183 · "Vented, latched, tied down at the top."
const drawLocker = (s, { F, hatch }) => {
  for (const x of [4, 70]) { foot(s, F, x, 4, hatch); foot(s, F, x, 28, hatch); }
  bx(s, F, 0, 0, 11, 92, 164, 42, { hatch });
  bx(s, F, 3, 2, 175, 86, 8, 38, { hatch, sw: W.fine });
  for (const [x, y] of [[21, 6], [81, 6], [21, 34], [81, 34]]) {
    disc(s, F, x, y, 183, 5.3, { fill: 'none', sw: W.fine });
  }
  line(s, F, [[46, 0, 13], [46, 0, 173]], { sw: W.fine, cap: false });
  for (const x of [4, 50]) {
    line(s, F, [[x, 0, 16], [x + 38, 0, 16], [x + 38, 0, 170], [x, 0, 170]],
      { sw: W.hair, close: true, cap: false, opacity: 0.85 });
    for (const z of [151, 143, 135]) line(s, F, [[x + 6, 0, z], [x + 32, 0, z]], { sw: W.heavy });
  }
  bx(s, F, 40, 0, 86, 12, 26, 0, { sideFill: 'none', sw: W.fine });
  line(s, F, [[46, 0, 100], [43, 0, 96]], { sw: W.mass });
  line(s, F, [[10, 0, 55], [36, 0, 55], [36, 0, 69], [10, 0, 69]],
    { sw: W.fine, close: true, cap: false });
  line(s, F, [[13, 0, 63], [33, 0, 63]], { sw: W.hair, opacity: 0.6 });
  line(s, F, [[13, 0, 59], [29, 0, 59]], { sw: W.hair, opacity: 0.6 });
  for (const x of [0, 92]) {
    for (const z of [11, 164]) line(s, F, [[x, 0, z], [x, 0, z + 10]], { sw: W.heavy, opacity: 0.55 });
  }
};
export const locker = (opts = {}) => fitting('locker', opts, drawLocker);

// 04 TABLE → DINING-TABLE · 180 × 80 × 75 · "Fiddle rail all round, so nothing slides off."
// ⛔ DEFECT 5 FIXED. The catalogue's BACK stretcher is offset from the front one by (+9.5, −12.6) px,
// a ratio of −1.33 where this oblique's is −1.5 — so the far rail sits at a depth the rest of the
// drawing does not agree with. Every member here is placed through `project()`: the legs stand at
// depth 12 and 68 and the two stretchers are the SAME call at the two depths, which makes the class
// of fault unreachable rather than merely absent.
const drawDiningTable = (s, { F, hatch }) => {
  for (const x of [10, 156]) for (const y of [9, 65]) foot(s, F, x, y, hatch);
  for (const x of [13.5, 159.5]) {
    for (const y of [12, 68]) line(s, F, [[x, y, 4], [x, y, 74]], { sw: W.mass });
  }
  for (const y of [12, 68]) line(s, F, [[13.5, y, 22], [159.5, y, 22]], { sw: W.heavy });
  bx(s, F, 0, 0, 70, 180, 5, 80, { hatch });
  line(s, F, [[6, 5, 75], [174, 5, 75], [174, 75, 75], [6, 75, 75]],
    { sw: W.hair, opacity: 0.6, close: true, cap: false });
};
export const diningTable = (opts = {}) => fitting('dining-table', opts, drawDiningTable);

// 05 STOOL · ∅34 × 45 · "Three legs. Stows under the table."
// ⚠️ THE ONE STRUCTURAL DEVIATION IN THE SET — see this file's header. Seat proportions are the
// catalogue's exactly (∅34, 4 cm, inset ring at 0.65 r); the pedestal and its floor disc are dropped
// and the three strokes that ended in mid-air become three real legs, splayed 120° apart, each
// standing on the floor and each meeting the seat.
const drawStool = (s, { F }) => {
  const c = 17;
  const LEGS = [[0, -1], [0.87, 0.5], [-0.87, 0.5]];
  for (const [ux, uy] of LEGS) {
    line(s, F, [[c + ux * 5, c + uy * 5, 41], [c + ux * 14, c + uy * 14, 0]], { sw: W.heavy });
    // ⚠️ THE SPLAY IS 14 cm AND NOT 16, AND THE LIMIT IS THE PROJECTION RATHER THAN THE FURNITURE. A
    // foot is a level ellipse lying ON the floor, so it hangs `0.6·s·r` BELOW the floor line — a disc
    // at depth 1 cm reaches further down the page than the frame's own bottom edge, and the piece
    // then clips its own tile. 14 cm puts the near foot at depth 3, which clears its own radius.
    disc(s, F, c + ux * 14, c + uy * 14, 0, 2.6, { fill: 'none', sw: W.fine });
  }
  for (let i = 0; i < 3; i += 1) {
    const a = LEGS[i];
    const b = LEGS[(i + 1) % 3];
    line(s, F, [[c + a[0] * 10, c + a[1] * 10, 16], [c + b[0] * 10, c + b[1] * 10, 16]],
      { sw: W.fine, opacity: 0.85 });
  }
  cyl(s, F, c, c, 41, 45, 17, { sw: W.heavy });
  disc(s, F, c, c, 45, 11, { fill: 'none', sw: W.hair, opacity: 0.5 });
};
export const stool = (opts = {}) => fitting('stool', opts, drawStool);

// 06 LARDER → SHELF-RACK · 120 × 40 × 200 · "Five open shelves. You can see what is left."
// ⛔ DEFECT 1 FIXED. The catalogue crosses the whole rack with two full-height grey diagonals
// (`M139.2 195.6 L224.2 46` and its mirror) — an X over the piece, which in this dialect means
// "gone". Replaced by four SHORT corner gussets, each attached to an upright at one end and to a
// shelf at the other. The same idea, drawn as a joint rather than as a mark.
const drawShelfRack = (s, { F, hatch }) => {
  for (const x of [0, 110]) bx(s, F, x, 0, 0, 10, 200, 40, { hatch });
  for (const z of [30, 72, 114, 156, 195]) {
    bx(s, F, 10, 0, z, 100, 4, 40, { hatch, sw: W.fine });
    line(s, F, [[10, 0, z], [110, 0, z]], { sw: W.hair, opacity: 0.5, cap: false });
  }
  for (const [x, dx] of [[10, 15], [110, -15]]) {
    for (const [z, dz] of [[34, 15], [195, -15]]) {
      line(s, F, [[x, 3, z], [x + dx, 3, z + dz]], { sw: W.fine, opacity: 0.75 });
    }
  }
};
export const shelfRack = (opts = {}) => fitting('shelf-rack', opts, drawShelfRack);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLEEP — 07–09
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 07 COT · 200 × 70 × 40 · "Punched deck, strap points, one end raised." — NEW ROW
const drawCot = (s, { F, hatch }) => {
  for (const x of [10, 182]) { foot(s, F, x, 6, hatch); foot(s, F, x, 50, hatch); }
  for (const x of [13.5, 185.5]) {
    for (const y of [9, 53]) line(s, F, [[x, y, 4], [x, y, 36]], { sw: W.heavy });
  }
  bx(s, F, 0, 0, 36, 200, 4, 70, { hatch });
  for (let i = 0; i < 8; i += 1) {                                    // the punched deck
    const x = 14 + i * 23;
    line(s, F, [[x, 6, 40], [x, 64, 40]], { sw: W.hair, opacity: 0.35, cap: false });
  }
  for (const x of [42, 158]) line(s, F, [[x, 4, 40], [x, 66, 40]], { sw: W.mid, opacity: 0.6 });
  bx(s, F, 0, 0, 40, 12, 18, 70, { hatch, sw: W.mid });               // the raised end
  line(s, F, [[12, 0, 40], [12, 0, 47], [200, 0, 47], [200, 0, 40]], { sw: W.mid, cap: false });
};
export const cot = (opts = {}) => fitting('cot', opts, drawCot);

// 08 BUNK STACK → BUNK-BED · 200 × 70 × 190 · "Two berths and a ladder in one welded frame."
// ⛔ DEFECT 3 FIXED, TWICE. In the catalogue the four posts stop 4 cm above the floor line and the
// ladder begins 41 cm up it, so a welded frame hangs in the air and its ladder hangs off that. The
// posts now stand ON the floor and the ladder's stiles run from the floor to the top berth.
const drawBunkBed = (s, { F, hatch }) => {
  for (const x of [6.5, 193.5]) {
    for (const y of [6, 58]) line(s, F, [[x, y, 0], [x, y, 190]], { sw: W.mass });
  }
  for (const z of [40, 120]) {
    bx(s, F, 0, 0, z, 200, 5, 70, { hatch });
    for (let i = 0; i < 8; i += 1) {
      const x = 14 + i * 23;
      line(s, F, [[x, 6, z + 5], [x, 64, z + 5]], { sw: W.hair, opacity: 0.3, cap: false });
    }
    line(s, F, [[0, 0, z + 5], [0, 0, z + 12], [200, 0, z + 12], [200, 0, z + 5]],
      { sw: W.fine, cap: false });
  }
  for (const x of [175, 190]) line(s, F, [[x, 1, 0], [x, 1, 186]], { sw: W.heavy });
  for (const z of [22, 52, 82, 112, 142, 172]) line(s, F, [[175, 1, z], [190, 1, z]], { sw: W.mid });
};
export const bunkBed = (opts = {}) => fitting('bunk-bed', opts, drawBunkBed);

// 09 FOOTLOCKER · 90 × 45 × 45 · "Double latched. Fits under a cot." — NEW ROW
const drawFootlocker = (s, { F, hatch }) => {
  bx(s, F, 3, 2, 0, 84, 38, 41, { hatch });
  bx(s, F, 0, 0, 38, 90, 7, 45, { hatch, sw: W.heavy });
  for (const x of [18, 68]) line(s, F, [[x, 0, 35], [x, 0, 41]], { sw: W.heavy, cap: false });
  line(s, F, [[8, 2, 5], [82, 2, 5]], { sw: W.hair, opacity: 0.45, cap: false });
  line(s, F, [[26, 2, 12], [58, 2, 12], [58, 2, 26], [26, 2, 26]],
    { sw: W.fine, close: true, cap: false });
  disc(s, F, 52, 22, 45, 5.5, { fill: 'none', sw: W.fine });
};
export const footlocker = (opts = {}) => fitting('footlocker', opts, drawFootlocker);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// COOK, KEEP COLD — 10–13
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 10 STOVE → COOKER · 90 × 60 × 88 · "Four rings, one oven, flue to the trunk."
// The four rings are the piece's only lit part, so they are what `state:'off'` moves: an ink-filled
// ring is a hot one. No second colour — this dialect has one accent and it means attention, not heat.
const drawCooker = (s, { F, hatch, powered }) => {
  for (const x of [6, 76]) { foot(s, F, x, 6, hatch); foot(s, F, x, 46, hatch); }
  bx(s, F, 0, 0, 8, 90, 88, 60, { hatch });
  for (const x of [24, 66]) {
    for (const y of [16, 42]) {
      disc(s, F, x, y, 96, 10, { sw: W.mid, fill: powered ? INK : PAPER });
      disc(s, F, x, y, 96, 5.5, { fill: 'none', sw: W.hair, stroke: powered ? PAPER : INK });
    }
  }
  line(s, F, [[10, 0, 20], [80, 0, 20], [80, 0, 72], [10, 0, 72]],
    { sw: W.fine, close: true, cap: false });
  s.circle({ cx: F.project(45, 0, 46)[0], cy: F.project(45, 0, 46)[1], r: F.s * 13, fill: 'none', stroke: INK, sw: W.fine });
  line(s, F, [[70, 0, 62], [70, 0, 72]], { sw: W.heavy });
  cyl(s, F, 72, 44, 96, 160, 7, { sw: W.mid, cap: false });
  disc(s, F, 72, 44, 160, 9, { sw: W.mid });
};
export const cooker = (opts = {}) => fitting('cooker', opts, drawCooker);

// 11 SINK · 100 × 55 × 88 · "One basin, one tap, a cupboard for the pail." — NEW ROW
// ⛔ DEFECT 4 FIXED, AND THIS IS THE ONE THE CHARTER NAMES TWICE: the catalogue's tap is a bare
// vertical stroke with a kinked stub and a second stroke floating beside it, and the SAME placeholder
// leaks into Screen 02 of the game document. It is redrawn as a real fitting: a base flange on the
// counter, a riser, a GOOSENECK that arcs over the basin and turns down into a spout, and a lever
// handle attached to the riser's collar.
const drawSink = (s, { F, hatch }) => {
  for (const x of [6, 86]) { foot(s, F, x, 6, hatch); foot(s, F, x, 42, hatch); }
  bx(s, F, 0, 0, 8, 100, 88, 55, { hatch });
  quad(s, F, [[22, 10, 96], [76, 10, 96], [76, 44, 96], [22, 44, 96]],
    { fill: PAPER_FLAT, sw: W.mid });
  disc(s, F, 49, 27, 96, 4, { fill: 'none', sw: W.fine });
  disc(s, F, 80, 47, 96, 4.5, { sw: W.fine });                        // ⭐ the tap's base flange
  cyl(s, F, 80, 47, 96, 118, 2.2, { sw: W.mid, cap: false });
  curve(s, F, [80, 47, 118], [80, 47, 132], [58, 30, 126], { sw: W.mid });  // ⭐ the gooseneck
  line(s, F, [[58, 30, 126], [58, 30, 116]], { sw: W.mid });          // ⭐ the spout
  line(s, F, [[80, 47, 112], [92, 47, 110]], { sw: W.mid });          // ⭐ the lever, on its collar
  disc(s, F, 80, 47, 112, 3.2, { fill: 'none', sw: W.hair });
  line(s, F, [[76, 0, 14], [94, 0, 14], [94, 0, 70], [76, 0, 70]],
    { sw: W.fine, close: true, cap: false });
  line(s, F, [[80, 0, 42], [90, 0, 42]], { sw: W.heavy });
  line(s, F, [[6, 0, 70], [70, 0, 70]], { sw: W.hair, opacity: 0.4, cap: false });
};
export const sink = (opts = {}) => fitting('sink', opts, drawSink);

// 12 COLD LOCKER → COOLER · 80 × 60 × 178 · "Gasketed door, dial on the front, condenser aft."
// ⛔ DEFECT 4 FIXED. The catalogue's "dial" is an empty ellipse with a dot in it — a placeholder that
// says nothing about which way it is set. It is now an instrument: a bezel, four index ticks and a
// POINTER, which is the part a dial is for. The cold mark beside it is drawn as three crossed strokes
// (a snowflake as PATHS, never a font glyph — charter §1).
const drawCooler = (s, { F, hatch }) => {
  for (const x of [5, 65]) { foot(s, F, x, 6, hatch); foot(s, F, x, 46, hatch); }
  bx(s, F, 0, 0, 10, 80, 168, 60, { hatch });
  line(s, F, [[5, 0, 16], [75, 0, 16], [75, 0, 140], [5, 0, 140]],
    { sw: W.mid, close: true, cap: false });
  line(s, F, [[9, 0, 20], [71, 0, 20], [71, 0, 136], [9, 0, 136]],
    { sw: W.hair, close: true, cap: false, opacity: 0.7 });
  line(s, F, [[68, 0, 60], [68, 0, 90]], { sw: W.heavy });
  disc(s, F, 46, 0, 156, 9, { sw: W.mid });                           // ⭐ the dial: bezel …
  for (let i = 0; i < 4; i += 1) {                                    // … four index ticks …
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    line(s, F, [[46 + Math.cos(a) * 6.6, 0, 156 + Math.sin(a) * 6.6],
      [46 + Math.cos(a) * 8.4, 0, 156 + Math.sin(a) * 8.4]], { sw: W.hair, opacity: 0.7 });
  }
  line(s, F, [[46, 0, 156], [42, 0, 161]], { sw: W.mid });            // … and the pointer
  disc(s, F, 46, 0, 156, 1.4, { fill: INK, sw: W.hair });
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {              // the cold mark, drawn as paths
    line(s, F, [[20 - Math.cos(a) * 7, 0, 156 - Math.sin(a) * 7],
      [20 + Math.cos(a) * 7, 0, 156 + Math.sin(a) * 7]], { sw: W.hair, opacity: 0.6 });
  }
  for (const y of [14, 30, 46]) line(s, F, [[6, y, 178], [74, y, 178]], { sw: W.fine, opacity: 0.6 });
};
export const cooler = (opts = {}) => fitting('cooler', opts, drawCooler);

// 13 WORKTOP → DESK · 160 × 60 × 90 · "Two drawers, one open bay, rail along the top."
const drawDesk = (s, { F, hatch }) => {
  for (const x of [5, 145]) { foot(s, F, x, 6, hatch); foot(s, F, x, 46, hatch); }
  bx(s, F, 0, 0, 8, 160, 77, 60, { hatch });
  bx(s, F, 0, 0, 85, 160, 5, 60, { hatch, sw: W.heavy });
  line(s, F, [[6, 0, 82], [154, 0, 82]], { sw: W.hair, opacity: 0.45, cap: false });
  for (const z of [26, 54]) {
    line(s, F, [[8, 0, z], [70, 0, z], [70, 0, z + 24], [8, 0, z + 24]],
      { sw: W.fine, close: true, cap: false });
    line(s, F, [[30, 0, z + 12], [48, 0, z + 12]], { sw: W.heavy });
  }
  quad(s, F, [[78, 0, 12], [152, 0, 12], [152, 0, 80], [78, 0, 80]], { fill: hatch, sw: W.fine });
  line(s, F, [[78, 0, 46], [152, 0, 46]], { sw: W.mid });
};
export const desk = (opts = {}) => fitting('desk', opts, drawDesk);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// STOW, HOLD, CLEAN — 14–18
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 14 CRATE → STORAGE-CRATE · 60 × 45 × 45 · "Braced, stencilled, stacks three high."
// ⛔ DEFECT 4 FIXED. The catalogue's lid handle is a bare trapezoid outline on the top face — the
// shape of a handle, not a handle. It is now a strap: two posts standing on the lid and a bar across
// them, so the eye can see what a hand would take hold of. The crate's front X-brace is KEPT: on a
// crate a corner-to-corner diagonal is bracing, which is why the charter's defect-1 list names 01 and
// 06 and not this piece.
const drawStorageCrate = (s, { F, hatch }) => {
  bx(s, F, 0, 0, 0, 60, 45, 45, { hatch });
  line(s, F, [[0, 0, 0], [60, 0, 45]], { sw: W.hair, opacity: 0.5, cap: false });
  line(s, F, [[60, 0, 0], [0, 0, 45]], { sw: W.hair, opacity: 0.5, cap: false });
  line(s, F, [[18, 0, 26], [42, 0, 26], [42, 0, 38], [18, 0, 38]],
    { sw: W.fine, close: true, cap: false });
  for (const x of [0, 60]) {
    for (const z of [4, 33]) line(s, F, [[x, 0, z], [x, 0, z + 8]], { sw: W.heavy, opacity: 0.6 });
  }
  for (const x of [21, 39]) line(s, F, [[x, 22, 45], [x, 22, 50]], { sw: W.mid });  // ⭐ the strap
  line(s, F, [[21, 22, 50], [39, 22, 50]], { sw: W.mid });
};
export const storageCrate = (opts = {}) => fitting('storage-crate', opts, drawStorageCrate);

// 15 WATER BUTT → SUPPLY-BARREL · ∅70 × 120 · "Tap at the bottom, sight gauge up the side."
// ⛔ DEFECT 2 FIXED. The catalogue's three rolling hoops are FULL ellipses drawn over the body, so
// the back half of every one shows through and the butt reads as a wire frame. Each is now the front
// half-arc only. The tap is redrawn as a bib tap standing off the wall of the body rather than as a
// polyline starting inside it.
const drawSupplyBarrel = (s, { F }) => {
  const c = 35;
  cyl(s, F, c, c, 0, 4, 37, { sw: W.fine });                          // the plinth, drawn UNDER
  cyl(s, F, c, c, 4, 114, 35, { sw: W.heavy });
  disc(s, F, c, c, 118, 30, { sw: W.mid });
  for (const z of [32, 63, 94]) hoop(s, F, c, c, z, 35.4, { sw: W.heavy, opacity: 0.75, cap: false });
  line(s, F, [[c, 6, 16], [c, 0, 14], [c, 0, 7]], { sw: W.heavy });   // ⭐ the bib tap
  line(s, F, [[c - 4, 0, 17], [c + 4, 0, 17]], { sw: W.mid });        // … and its handle
  line(s, F, [[c + 16, 6, 16], [c + 16, 6, 104]], { sw: W.hair, opacity: 0.5, cap: false });
  for (const z of [16, 45, 74, 104]) {
    line(s, F, [[c + 16, 6, z], [c + 22, 6, z]], { sw: W.hair, opacity: 0.5, cap: false });
  }
};
export const supplyBarrel = (opts = {}) => fitting('supply-barrel', opts, drawSupplyBarrel);

// 16 SCRUBBER → O2-SCRUBBER · 70 × 50 × 178 · "Draws through the round intake, filter drawer below."
const drawO2Scrubber = (s, { F, hatch }) => {
  for (const x of [4, 59]) { foot(s, F, x, 6, hatch); foot(s, F, x, 36, hatch); }
  bx(s, F, 0, 0, 10, 70, 140, 50, { hatch });
  disc(s, F, 35, 0, 96, 20, { sw: W.mid });
  disc(s, F, 35, 0, 96, 13, { fill: 'none', sw: W.hair });
  disc(s, F, 35, 0, 96, 4, { fill: INK, sw: W.hair });
  for (const z of [30, 38, 46, 54, 62]) {
    line(s, F, [[12, 0, z], [58, 0, z]], { sw: W.mid, opacity: 0.75, cap: false });
  }
  line(s, F, [[10, 0, 122], [60, 0, 122], [60, 0, 144], [10, 0, 144]],
    { sw: W.fine, close: true, cap: false });
  line(s, F, [[26, 0, 133], [44, 0, 133]], { sw: W.heavy });
  cyl(s, F, 44, 26, 150, 178, 9, { sw: W.mid });
};
export const o2Scrubber = (opts = {}) => fitting('o2-scrubber', opts, drawO2Scrubber);

// 17 DUCT RUN → PIPE-RUN · 240 × 28, HUNG 150 · "Two brackets, one damper. Runs wall to wall."
// ⛔ DEFECTS 5 AND 6 FIXED TOGETHER. The catalogue draws the duct as ONE flat rectangle in the picture
// plane — no oblique at all, which is why it reads as a stripe rather than as ducting — and hangs it
// from nothing, so "HUNG 150" is a number in the caption and not a fact in the drawing. It is now a
// three-face extrusion through the shared frame, running INTO a hatched wall stub at each end, with
// its two hangers reaching a ceiling stub above.
const drawPipeRun = (s, { F, hatch }) => {
  // ⚠️ THE STUB IS A *BACK* WALL, NOT THE TWO END WALLS THE CAPTION DESCRIBES, AND THE REASON IS THE
  // PROJECTION ITSELF: a plane at constant x is nearly edge-on in cabinet oblique — measured, a
  // 30 cm-deep end wall projects to a 5-px sliver, which is a smaller mark than the duct's own seam
  // lines and tells the eye nothing. A wall BEHIND the run carries the same fact ("this is mounted,
  // at this height") in a shape the projection can actually show.
  wallStub(s, F, 'back', 30, 0, 270, 128, 205, hatch);
  wallStub(s, F, 'over', 205, 0, 270, 0, 30, hatch);
  bx(s, F, 15, 0, 150, 240, 28, 30, { hatch });
  for (const x of [80, 135, 190]) {
    line(s, F, [[x, 0, 150], [x, 0, 178], [x, 30, 178]], { sw: W.mid, opacity: 0.7, cap: false });
  }
  for (const x of [65, 205]) {
    line(s, F, [[x, 14, 178], [x, 14, 200]], { sw: W.mid });
    bx(s, F, x - 9, 10, 200, 18, 5, 9, { hatch, sw: W.fine });
  }
  line(s, F, [[135, 0, 150], [135, 0, 138]], { sw: W.heavy });        // the damper
  disc(s, F, 135, 0, 134, 4, { sw: W.fine });
};
export const pipeRun = (opts = {}) => fitting('pipe-run', opts, drawPipeRun);

// 18 DRUM → FUEL-DRUM · ∅55 × 85 · "Rolling hoops, bung on top. Whatever needs holding."
// ⛔ DEFECT 2 FIXED — the same three see-through hoops as 15, the same front half-arc fix.
const drawFuelDrum = (s, { F }) => {
  const c = 27.5;
  cyl(s, F, c, c, 0, 80, 27.5, { sw: W.heavy });
  disc(s, F, c, c, 85, 27.5, { sw: W.mid });
  for (const z of [20, 45, 70]) hoop(s, F, c, c, z, 28, { sw: W.heavy, opacity: 0.75, cap: false });
  disc(s, F, c + 8, c - 6, 85, 5, { sw: W.fine });
  for (const z of [30, 55]) {
    line(s, F, [[c - 20, 4, z], [c + 12, 4, z]], { sw: W.hair, opacity: 0.35, cap: false });
  }
};
export const fuelDrum = (opts = {}) => fitting('fuel-drum', opts, drawFuelDrum);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// GROW, MAKE — 19–24
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** One leaf: a closed teardrop off a stem, drawn in the projected plane. Used only by 19. */
function leaf(s, F, x, y, z, dx, dz) {
  const [ax, ay] = F.project(x, y, z);
  const [bx2, by2] = F.project(x + dx, y, z + dz);
  const mx = (ax + bx2) / 2;
  const my = (ay + by2) / 2;
  const px = (by2 - ay) * 0.32;
  const py = -(bx2 - ax) * 0.32;
  s.raw(
    `<path d="M${nn(ax)} ${nn(ay)} Q${nn(mx + px)} ${nn(my + py)} ${nn(bx2)} ${nn(by2)}`
    + ` Q${nn(mx - px)} ${nn(my - py)} ${nn(ax)} ${nn(ay)} Z"`
    + ` fill="${PAPER}" stroke="${INK}" stroke-width="${r3(W.hair)}"/>`,
  );
}

// 19 PLANTER → HERB-PLANTER · 120 × 45 × 38 · "Soil to the line. Three plants, four if pressed."
// ⛔ DEFECT 4 FIXED. The catalogue's "plants" are three identical Y marks — one vertical stroke and
// two ticks — which at tile size is a scribble and at card size is a placeholder. They are now
// SPROUTS: a curved stem out of the soil with two or three leaves off it, each plant a different
// height, which is what makes a trough read as growing rather than as empty.
const drawHerbPlanter = (s, { F, hatch }) => {
  for (const x of [4, 105]) { foot(s, F, x, 4, hatch); foot(s, F, x, 32, hatch); }
  bx(s, F, 0, 0, 6, 120, 32, 45, { hatch });
  quad(s, F, [[6, 6, 38], [114, 6, 38], [114, 39, 38], [6, 39, 38]], { fill: hatch, sw: W.fine });
  const PLANTS = [[26, 18, 30], [60, 22, 36], [94, 20, 26]];
  // Fractions OF THE PLANT'S OWN HEIGHT, named because they are a plant's proportions and nothing
  // else. ⚠️ `BOW` is 0.6 and is NOT the oblique's up-ratio, however much it looks like it — a stem's
  // bend has no relation to the projection, and `fittings.test.js` bans a bare `0.6 *` in this file
  // precisely so a coincidence like this one cannot be mistaken for a fifth copy of the ratio.
  const BOW = 0.6;
  const LEAF_LOW = 0.45, LEAF_MID = 0.7, LEAF_TOP = 0.92;
  for (const [x, y, hgt] of PLANTS) {
    curve(s, F, [x, y, 38], [x + 2, y, 38 + hgt * BOW], [x - 2, y, 38 + hgt], { sw: W.fine });
    leaf(s, F, x + 0.5, y, 38 + hgt * LEAF_LOW, -8, 5);
    leaf(s, F, x + 0.8, y, 38 + hgt * LEAF_MID, 8, 4);
    if (hgt > 28) leaf(s, F, x - 1, y, 38 + hgt * LEAF_TOP, -6, 4);
  }
};
export const herbPlanter = (opts = {}) => fitting('herb-planter', opts, drawHerbPlanter);

// 20 GROW RACK → HYDROPONICS · 100 × 45 × 190 · "Four trays, a lamp bar under each, drip line at the
// side." ⛔ DEFECT 3 FIXED. The catalogue's drip line (`M139 62 L139 196.3`) starts above the top of
// the posts and ends in mid-air between two trays — a 134-px stroke attached to nothing at either
// end. It now runs from the top tray to the bottom one with a tee at every tray it feeds, and the
// posts are capped by a top rail so none of them ends as a stub.
const drawHydroponics = (s, { F, hatch, powered }) => {
  for (const x of [3, 97]) for (const y of [4, 41]) line(s, F, [[x, y, 0], [x, y, 190]], { sw: W.mass });
  for (const y of [4, 41]) line(s, F, [[3, y, 190], [97, y, 190]], { sw: W.heavy });
  const TRAYS = [42, 86, 130, 174];
  for (const z of TRAYS) {
    bx(s, F, 3, 2, z, 94, 6, 41, { hatch, sw: W.fine });
    line(s, F, [[8, 0, z - 3], [92, 0, z - 3]], { sw: W.heavy, opacity: powered ? 0.9 : 0.35 });
    for (const x of [22, 50, 78]) line(s, F, [[x, 0, z - 3], [x, 0, z - 7]], { sw: W.hair, opacity: 0.5 });
  }
  line(s, F, [[7, 40, TRAYS[0] + 2], [7, 40, TRAYS[3] + 2]], { sw: W.mid, opacity: 0.7 });
  for (const z of TRAYS) line(s, F, [[7, 40, z + 2], [12, 40, z + 2]], { sw: W.fine, opacity: 0.7 });
};
export const hydroponics = (opts = {}) => fitting('hydroponics', opts, drawHydroponics);

// 21 COMPOST BIN · 60 × 60 × 98 · "Hopper lid, crank on the side, vents at the front." — NEW ROW
// ⛔ DEFECT 3 FIXED. The catalogue's crank is a horizontal stroke that begins in empty paper beside
// the bin and ends in a knob — nothing joins it to the machine it turns. It now leaves a BOSS on the
// bin's own side face, bends at the shaft's end, and carries the knob on the bent arm.
const drawCompostBin = (s, { F, hatch }) => {
  for (const x of [4, 44]) { foot(s, F, x, 6, hatch); foot(s, F, x, 46, hatch); }
  bx(s, F, 0, 0, 8, 56, 62, 60, { hatch });
  quad(s, F, [[0, 0, 70], [56, 0, 70], [48, 0, 86], [8, 0, 86]], { sw: W.mid });
  quad(s, F, [[8, 0, 86], [48, 0, 86], [48, 60, 86], [8, 60, 86]], { fill: hatch, sw: W.fine });
  line(s, F, [[20, 0, 78], [36, 0, 78]], { sw: W.heavy });
  for (const z of [22, 34, 46]) line(s, F, [[8, 0, z], [48, 0, z]], { sw: W.mid, opacity: 0.7 });
  disc(s, F, 56, 30, 52, 5, { sw: W.fine });                          // ⭐ the boss, on the body
  line(s, F, [[56, 30, 52], [72, 30, 52], [72, 30, 43]], { sw: W.heavy });
  disc(s, F, 72, 30, 41, 4, { sw: W.fine });
};
export const compostBin = (opts = {}) => fitting('compost-bin', opts, drawCompostBin);

// 22 WORKBENCH · 180 × 70 × 92 · "Vice at the near corner, pegboard behind, shelf under."
// ⛔ DEFECT 5 FIXED. The catalogue's pegboard is a flat rectangle in the PICTURE plane — depth 0 —
// standing in front of a bench whose top runs 70 cm back, so a board that the caption says is
// "behind" is drawn in front of everything. It is now projected at depth 70, on the bench's own back
// edge, holes and all.
const drawWorkbench = (s, { F, hatch, powered }) => {
  quad(s, F, [[6, 70, 92], [174, 70, 92], [174, 70, 166], [6, 70, 166]], { sw: W.mid });
  for (let r = 0; r < 5; r += 1) {
    for (let c2 = 0; c2 < 9; c2 += 1) {
      const [cx, cy] = F.project(18 + c2 * 19, 70, 102 + r * 14);
      s.circle({ cx, cy, r: F.s * 2, fill: 'none', stroke: INK, sw: W.hair, opacity: 0.55 });
    }
  }
  for (const x of [5, 165]) { foot(s, F, x, 6, hatch); foot(s, F, x, 56, hatch); }
  bx(s, F, 0, 0, 8, 180, 78, 70, { hatch });
  bx(s, F, 0, 0, 86, 180, 6, 70, { hatch, sw: W.heavy });
  quad(s, F, [[12, 0, 14], [80, 0, 14], [80, 0, 76], [12, 0, 76]], { fill: hatch, sw: W.fine });
  line(s, F, [[12, 0, 46], [80, 0, 46]], { sw: W.mid });
  bx(s, F, 96, 6, 36, 74, 5, 50, { hatch, sw: W.fine });
  bx(s, F, 6, 0, 92, 30, 12, 22, { hatch, sw: W.mid, front: powered ? PAPER_FLAT : PAPER });
  line(s, F, [[20, 4, 104], [14, 4, 92]], { sw: W.heavy });
  disc(s, F, 13, 4, 90, 4, { sw: W.fine });
};
export const workbench = (opts = {}) => fitting('workbench', opts, drawWorkbench);

// 23 VICE POST · ∅40 × 120 · "Bolted down. Turns anything into a workshop." — NEW ROW
const drawVicePost = (s, { F, hatch }) => {
  const c = 20;
  cyl(s, F, c, c, 0, 3, 20, { sw: W.mid });
  for (const [dx, dy] of [[10, -6], [-10, -4], [0, 8]]) {
    disc(s, F, c + dx, c + dy, 3, 1.9, { fill: 'none', sw: W.hair });
  }
  cyl(s, F, c, c, 3, 98, 7, { sw: W.mid });
  bx(s, F, 2, 8, 98, 36, 8, 26, { hatch, sw: W.mid });
  bx(s, F, 4, 10, 106, 10, 14, 22, { hatch, sw: W.mid });
  bx(s, F, 24, 10, 106, 10, 14, 22, { hatch, sw: W.mid });
  line(s, F, [[38, 14, 113], [54, 14, 113]], { sw: W.heavy });
  line(s, F, [[54, 14, 116], [54, 14, 110]], { sw: W.mid });
};
export const vicePost = (opts = {}) => fitting('vice-post', opts, drawVicePost);

// 24 TERMINAL → RESEARCH-CONSOLE · 60 × 45 × 132 · "Where MOSS can be argued with in person."
const drawResearchConsole = (s, { F, hatch, powered }) => {
  bx(s, F, 6, 6, 0, 48, 10, 30, { hatch });
  bx(s, F, 20, 12, 10, 20, 78, 20, { hatch });
  bx(s, F, 0, 0, 88, 60, 8, 45, { hatch, sw: W.heavy });
  bx(s, F, 4, 4, 96, 52, 36, 14, { hatch });
  quad(s, F, [[9, 4, 100], [51, 4, 100], [51, 4, 128], [9, 4, 128]],
    { fill: powered ? PAPER_FLAT : PAPER, sw: W.hair });
  for (const z of [106, 113, 120]) {
    line(s, F, [[13, 4, z], [40, 4, z]], { sw: W.hair, opacity: 0.55, cap: false });
  }
  line(s, F, [[6, 2, 92], [54, 2, 92]], { sw: W.hair, opacity: 0.6, cap: false });
  curve(s, F, [40, 8, 2], [52, 20, 0], [58, 34, 0], { sw: W.fine, opacity: 0.6 });
};
export const researchConsole = (opts = {}) => fitting('research-console', opts, drawResearchConsole);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LIGHT, HEAT, POWER — 25–27
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 25 DECK LAMP → STANDING-LAMP · ∅32 × 178 · "Stands anywhere there is a socket."
// ⛔ DEFECT 3 FIXED. The catalogue leaves a small chevron floating beside the base at opacity .6 —
// a cable, drawn detached from the lamp. It now leaves the base rim and runs away across the deck.
// The shade gains its two rims so it is a cone rather than a trapezoid, and it is the piece's lit
// part: `state:'off'` empties it.
const drawStandingLamp = (s, { F, powered }) => {
  const c = 22;
  cyl(s, F, c, c, 0, 3, 16, { sw: W.mid });
  cyl(s, F, c, c, 3, 148, 5, { sw: W.mid, cap: false });
  disc(s, F, c, c, 148, 7, { sw: W.fine });
  line(s, F, [[c - 14, c, 150], [c - 22, c, 178]], { sw: W.mid });
  line(s, F, [[c + 14, c, 150], [c + 22, c, 178]], { sw: W.mid });
  disc(s, F, c, c, 178, 22, { sw: W.mid });
  disc(s, F, c, c, 150, 14, { fill: 'none', sw: W.fine, opacity: 0.8 });
  if (powered) {
    disc(s, F, c, c, 150, 10, { fill: INK, sw: W.hair });
    for (const dx of [-16, 0, 16]) line(s, F, [[c + dx, c, 144], [c + dx * 1.3, c, 136]], { sw: W.hair, opacity: 0.7 });
  }
  curve(s, F, [c + 16, c, 1], [c + 22, 10, 0], [44, 4, 0], { sw: W.fine, opacity: 0.6 });
};
export const standingLamp = (opts = {}) => fitting('standing-lamp', opts, drawStandingLamp);

// 26 HEATER → SPACE-HEATER · 60 × 25 × 70, HUNG 40 · "Finned panel, one knob, wall mounted."
// ⛔ DEFECTS 3 AND 6 FIXED. In the catalogue this piece has THREE detached parts — two bracket
// strokes rising off the top of the panel into nothing, a knob floating below the panel's bottom
// edge, and a hairline running off to the left with no source — and the wall it is "wall mounted" to
// is not drawn at all. There is now a wall stub behind it; the brackets run from the panel's top-back
// edge to that wall; the knob sits ON the front face with a boss; and the hairline is a supply pipe
// from the panel's flank into the wall. The panel itself becomes a three-face box, so it has depth.
//
// ⛔ AND THE PIPE WAS FIXED TWICE, WHICH IS THE PART WORTH READING. The first port ran it
// `(8,12,60) → (3,34,60)` — out of the panel's LEFT flank and back, which is where the catalogue's
// own stub points. In THIS projection that is not a pipe at all: a centimetre of depth moves a point
// 0.4 cm RIGHT, so a member that leaves the left flank and runs backwards travels INTO the picture's
// centre, and both its projected ends land inside the panel's own front face (x −32.1…19.7,
// y −21.8…38.7). Emitted last, it painted a floating grey diagonal across the fins — the very defect
// class 3 names, re-created by the fix for it. Measured, not argued: deleting it moved 257 px in a
// 480-px render, all of them ON the panel. The wall is only visible where the depth vector uncovers
// it — a strip to the RIGHT of the body and a band above it — so the pipe now leaves the panel's
// back-right corner, reaches the wall plane at y = 36, and drops down the stub to its dashed cut
// edge at z = 20, which is this dialect's way of saying the run continues past the drawing. Every
// point of it is at or beyond the body's right-most silhouette x, and `fittings.test.js` asserts
// exactly that rather than merely that the endpoints are drawn.
const drawSpaceHeater = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 36, 2, 74, 20, 128, hatch);
  for (const x of [20, 60]) line(s, F, [[x, 25, 110], [x, 36, 122]], { sw: W.mid });
  bx(s, F, 8, 0, 40, 60, 70, 25, { hatch, sw: W.heavy });
  for (let i = 0; i < 8; i += 1) {
    const x = 12 + i * 7.4;
    line(s, F, [[x, 0, 45], [x, 0, 105]], { sw: W.mid, opacity: powered ? 0.9 : 0.5, cap: false });
  }
  if (powered) line(s, F, [[12, 0, 42], [64, 0, 42]], { sw: W.heavy });
  line(s, F, [[11, 0, 44], [65, 0, 44]], { sw: W.hair, opacity: 0.6, cap: false });
  disc(s, F, 62, 0, 52, 4.5, { sw: W.mid });
  disc(s, F, 62, 0, 52, 1.4, { fill: INK, sw: W.hair });
  line(s, F, [[62, 0, 52], [59, 0, 55]], { sw: W.hair });
  line(s, F, [[68, 25, 50], [69, 36, 50], [69, 36, 20]], { sw: W.fine, opacity: 0.65 });
};
export const spaceHeater = (opts = {}) => fitting('space-heater', opts, drawSpaceHeater);

// 27 CELL RACK → BATTERY-BANK · 100 × 45 × 116 · "Six cells on bus bars. Do not touch the top rail."
// ⛔ DEFECT 3 FIXED. The catalogue's warning triangle floats 10 px clear of the rack it warns about,
// so it reads as page furniture rather than as a plate bolted to the thing that will kill you. It now
// stands ON the top rail, on its own stem, with a bang stroke inside it — drawn as PATHS, never as a
// font glyph (charter §1), and in the one accent, which is what the accent is for.
const drawBatteryBank = (s, { F, hatch }) => {
  for (const x of [3, 97]) for (const y of [4, 41]) line(s, F, [[x, y, 0], [x, y, 118]], { sw: W.mass });
  for (const z of [20, 62]) {
    bx(s, F, 3, 2, z, 94, 4, 41, { hatch, sw: W.fine });
    for (const x of [6, 38, 70]) {
      bx(s, F, x, 6, z + 4, 26, 34, 32, { hatch, sw: W.fine });
      for (const dx of [5, 21]) line(s, F, [[x + dx, 6, z + 38], [x + dx, 6, z + 42]], { sw: W.mid });
    }
  }
  line(s, F, [[3, 4, 118], [97, 4, 118]], { sw: W.heavy, opacity: 0.85 });
  line(s, F, [[50, 4, 118], [50, 4, 122]], { sw: W.mid, stroke: ATTEND });
  line(s, F, [[43, 4, 122], [57, 4, 122], [50, 4, 132]], { sw: W.mid, stroke: ATTEND, close: true });
  line(s, F, [[50, 4, 124], [50, 4, 128]], { sw: W.hair, stroke: ATTEND });
};
export const batteryBank = (opts = {}) => fitting('battery-bank', opts, drawBatteryBank);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SOFTEN — 28–30
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 28 MAT → RUG · 120 × 80 · "Woven from something that used to be cargo net."
const drawRug = (s, { F, hatch }) => {
  quad(s, F, [[3, 3, 0], [123, 3, 0], [123, 83, 0], [3, 83, 0]], { fill: hatch, sw: W.mid });
  line(s, F, [[12, 9, 0], [114, 9, 0], [114, 77, 0], [12, 77, 0]],
    { sw: W.hair, close: true, cap: false, opacity: 0.85 });
  for (let i = 0; i < 12; i += 1) {
    const x = 8 + i * 10;
    line(s, F, [[x, 3, 0], [x, 0, 0]], { sw: W.hair, opacity: 0.5 });
  }
  for (let i = 0; i < 8; i += 1) {
    const y = 9 + i * 9;
    line(s, F, [[3, y, 0], [0, y, 0]], { sw: W.hair, opacity: 0.4 });
  }
};
export const rug = (opts = {}) => fitting('rug', opts, drawRug);

// 29 CURTAIN RAIL · 120 CM, HUNG 190 · "Makes a corner into a room with a door." — NEW ROW
// ⛔ DEFECT 6 FIXED. The catalogue's two end brackets point straight up and stop, so a rail "hung
// 190" hangs off the top of the card. There is now a ceiling stub for them to reach.
const drawCurtainRail = (s, { F, hatch }) => {
  wallStub(s, F, 'over', 206, 0, 120, 0, 24, hatch);
  for (const x of [5, 115]) line(s, F, [[x, 12, 206], [x, 12, 196]], { sw: W.mid });
  bx(s, F, 0, 8, 192, 120, 4, 10, { hatch, sw: W.mid });
  const RINGS = [12, 32, 52, 72, 92, 112];
  for (const x of RINGS) disc(s, F, x, 13, 190, 4, { fill: 'none', sw: W.fine });
  for (const x of RINGS) {
    line(s, F, [[x, 14, 187], [x + 1.5, 14, 152], [x - 1.5, 14, 116], [x + 1, 14, 84]],
      { sw: W.fine, opacity: 0.6 });
  }
  line(s, F, [[10, 14, 84], [30, 14, 78], [50, 14, 84], [70, 14, 78], [90, 14, 84], [112, 14, 80]],
    { sw: W.fine, opacity: 0.7 });
};
export const curtainRail = (opts = {}) => fitting('curtain-rail', opts, drawCurtainRail);

// 30 SHRINE SHELF · 50 × 20, HUNG 140 · "A frame, a cup, and room for one more of each." — NEW ROW
// ⛔ DEFECTS 3 AND 6 FIXED. The catalogue's two brackets are short diagonals under the shelf that end
// in mid-air, and the wall the shelf is hung on is absent. The brackets now run from the shelf
// underside back INTO a wall stub, which is the only reading that makes "HUNG 140" mean anything.
// The frame keeps the accent: it is the one object on this ship that is nobody's equipment.
//
// ⛔ AND THE BRACKETS TOO WERE FIXED TWICE. The first port ran them `(x,6,139) → (x,29,126)` and
// emitted them BEFORE the plate. Both halves are wrong and the second hides the first: over 23 cm of
// depth the projection lifts a point 0.6·23 cm while the 13 cm of drop lowers it by 13, so the two
// terms very nearly cancel and each "bracket" came out as an almost-horizontal stroke lying inside
// the plate's own front face (x −40.3…29.4, y −1.7…3.2) — then the plate's opaque PAPER front face
// was painted straight over it. Zero visible pixels, measured: deleting either bracket from a 480-px
// render changed nothing at all (`ImageChops.difference(...).getbbox()` → None), on the piece whose
// ONLY drawn support they are. They now start on the plate's FRONT-BOTTOM edge (z = 140, y = 4) —
// the lowest ink the shelf has — and fall away to the wall plane at y = 30, z = 116, so the drop is
// 24 cm against 26 cm of depth and the stroke leaves the plate downward instead of sliding under it.
// They are emitted AFTER the plate as well — and that half is BELT, not braces, measured rather than
// claimed: with the geometry fixed, swapping the two lines back changes the render by nothing at all
// (deleting a bracket moves the same 395 px and the same bbox either way), because the brackets no
// longer lie inside anything that could cover them. It stays because geometry that has to be first in
// the paint order to be seen is geometry that will be lost again the next time a part is added — and
// because a test cannot see paint order, which is exactly why the picture had to be the instrument.
const drawShrineShelf = (s, { F, hatch }) => {
  wallStub(s, F, 'back', 30, 0, 64, 100, 172, hatch);
  bx(s, F, 4, 4, 140, 56, 4, 26, { hatch, sw: W.heavy });
  for (const x of [14, 50]) line(s, F, [[x, 4, 140], [x, 30, 116]], { sw: W.mid });
  line(s, F, [[4, 4, 143], [60, 4, 143]], { sw: W.hair, opacity: 0.5, cap: false });
  bx(s, F, 12, 12, 144, 18, 22, 6, { hatch, sw: W.mid, stroke: ATTEND });
  line(s, F, [[16, 12, 152], [26, 12, 152]], { sw: W.hair, stroke: ATTEND, opacity: 0.6 });
  cyl(s, F, 46, 16, 144, 152, 5, { sw: W.mid });
  curve(s, F, [51, 16, 150], [56, 16, 149], [50, 16, 145], { sw: W.fine });
};
export const shrineShelf = (opts = {}) => fitting('shrine-shelf', opts, drawShrineShelf);


// ─────────────────────────────────────────────────────────────────────────────────────────────
// The painter map + the frame, for a caller that wants to draw ON a fitting
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every fitting's PAINTER, keyed by itemId — the same function its exported builder runs.
 * DERIVED nowhere: each entry is the named `draw…` const above, so a row cannot point at another
 * row's painting (`wrecked.test.js` calls that shape the SWAP, and it is invisible to every other
 * guard in this repo).
 */
export const DRAW = Object.freeze({
  'bench': drawBench,
  'chair': drawChair,
  'locker': drawLocker,
  'dining-table': drawDiningTable,
  'stool': drawStool,
  'shelf-rack': drawShelfRack,
  'cot': drawCot,
  'bunk-bed': drawBunkBed,
  'footlocker': drawFootlocker,
  'cooker': drawCooker,
  'sink': drawSink,
  'cooler': drawCooler,
  'desk': drawDesk,
  'storage-crate': drawStorageCrate,
  'supply-barrel': drawSupplyBarrel,
  'o2-scrubber': drawO2Scrubber,
  'pipe-run': drawPipeRun,
  'fuel-drum': drawFuelDrum,
  'herb-planter': drawHerbPlanter,
  'hydroponics': drawHydroponics,
  'compost-bin': drawCompostBin,
  'workbench': drawWorkbench,
  'vice-post': drawVicePost,
  'research-console': drawResearchConsole,
  'standing-lamp': drawStandingLamp,
  'space-heater': drawSpaceHeater,
  'battery-bank': drawBatteryBank,
  'rug': drawRug,
  'curtain-rail': drawCurtainRail,
  'shrine-shelf': drawShrineShelf,
});

/**
 * Paint fitting `id` INTO an existing scene, then hand the same scene and the same frame to
 * `extra`, so a caller can add marks in the piece's own centimetres rather than guessing at pixels.
 *
 * This is how the post-raid twins of the nine NEW rows are drawn: a damaged fitting is the SAME
 * object with damage on it, and re-running the pristine painter is the only way to guarantee that
 * stays true when the pristine drawing changes. (The mock's own premise for its seventy twins is
 * "each keeps one identifying feature so it still reads as the same object" — this keeps all of
 * them.) Returns nothing; everything lands in `s`.
 */
export function paintFitting(s, id, extra, state) {
  const draw = DRAW[id];
  if (!draw) return;
  const env = envFor(s, id, state);
  draw(s, env);
  if (typeof extra === 'function') extra(s, env);
}

/** The drawing vocabulary, for the same caller: cm-space strokes, level ellipses and the ramp. */
export { ink, line, disc, path, curve };
