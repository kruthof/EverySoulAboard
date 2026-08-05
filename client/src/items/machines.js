// THE THIRTEEN PAPER MACHINES — the warm set's remaining MACHINERY, redrawn in the owner's
// paper/ink/oxblood idiom on the cabinet-oblique kit (`client/src/render/oblique.js`).
//
// ⭐ WHY THIS FILE EXISTS, in one sentence: `design-import/Perilune Fittings.dc.html` is the owner's
// catalogue of things a crew BUILDS — benches, lockers, cots — and it draws none of the SHIP's own
// plant. Reactor, solar wing, gas bottles, reclaimer, paste column, med cot, fab cell, ring array,
// dish, plant pot, book case, turret and sleeper pod were still wearing `client/src/items/objects.js`'s
// steel-and-glow mock art after VR-P2, which is charter §4's filed P2b in its most conspicuous form:
// on `--ship wreck` the SolarWing, the Reclaimer, the Fabricator, the MedBed, the Telescope and the
// PlantPot are all glyphs the sim really projects, so six warm pieces were drawn straight beside the
// thirty paper ones on one screen. This module is the paper half of that pairing.
//
// ⚠️ THESE THIRTEEN HAVE NO CATALOGUE CARD. Everything below is DESIGNED in-dialect rather than
// ported from a drawing, and that difference is the reason the header is long: with no card to diff
// against, the only defence against drift is that every rule the catalogue holds is written down here
// and mechanised in `client/test/machines.test.js`. The rules, all of them the catalogue's own:
//
//   · ONE PROJECTION. Every part is placed through `oblique.roomFrame(...).project(xCm, yCm, zCm)` —
//     x across, y BACK into the picture, z up — at the piece's own derived scale. Nothing in this
//     file computes a pixel.
//   · ROUND THINGS DRAW LEVEL. A horizontal circle is an ellipse with `ry = 0.6·rx` (the oblique's
//     own y ratio), and that rule lives in `disc`/`hoop`/`cyl`/`taper`, which are imported from or
//     built on `fittings.js` rather than re-derived. A round FEATURE on a vertical face is drawn
//     level too — the catalogue's deliberate choice, recorded in `fittings.js`'s header, kept here so
//     the two halves of the set read as one dialect.
//   · WEIGHT BY MASS. `fittings.W` (0.9 hair … 2.2 mass), imported, never re-typed.
//   · FOUR VALUES OF INK — `INK` #14120F, `PAPER` #EBE4D1, `PAPER_FLAT` #E1D9C5 and the hatch — plus
//     `ATTEND` #7B2C22, the ONE accent, for attention and nothing else. Nine of the thirteen spend it;
//     four spend none. ⛔ THOSE FIVE HEX VALUES ARE QUOTED HERE AND NOWHERE ELSE IN THIS FILE: they
//     arrive by import, and `machines.test.js` scans the COMMENT-STRIPPED source for a literal, with
//     this paragraph as its negative control (a stripper that stopped stripping would fire on the
//     documentation, and the "fix" would be to delete the explanation).
//   · THE BOX IS THE PICTURE. All geometry inside `0..w / 0..d / 0..h`, because the harness centres a
//     piece on its DECLARED box and anything outside it is drawn but not counted, i.e. clipped.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE E8 DEFECT CLASSES, APPLIED FORWARD RATHER THAN BACKWARD.
//
// `fittings.js` FIXED six classes of fault it found in the catalogue's own drawings. This module has
// no catalogue to fix, so each class is instead a rule it is authored AGAINST, and each is pinned:
//
//   1. NO CORNER-TO-CORNER BRACE that reads as a strike-through. Every diagonal here is a structural
//      member attached at BOTH ends (the dish's two feed struts are the longest, and they are the
//      real tripod of a real dish seen edge-on).
//   2. NO FULL ELLIPSE ON A CYLINDER. Bands round the gas bottles, the pod's hood seam and the
//      turret's swivel are FRONT HALF-ARCS (`hoop`), the same construction a cylinder's own bottom
//      edge uses. The full level rings that DO appear — the reactor's containment ring, the ring
//      array's three rings — lie on HORIZONTAL surfaces, where the whole ellipse is genuinely visible
//      and half of one would be a hole in the drawing.
//   3. NOTHING FLOATS. Every stem, strut, rail, spoke, feed line and cable ends on something.
//   4. NO PLACEHOLDER GLYPHS. The recycling mark is two drawn chasing arrows; the monitor's trace is
//      a drawn ECG; the medical cross is two drawn bars. There is no `<text>` in this file at all.
//   5. NO SECOND PROJECTION. Everything goes through the shared frame — the class is unreachable
//      here rather than merely absent.
//   6. WALL STUBS — UNREACHABLE, AND SAID OUT LOUD. None of the thirteen is wall-hung: they all stand
//      on the deck. `machines.test.js` asserts that no machine draws a stub, which is the honest form
//      of "this class does not apply" (the alternative, silence, is how the next reader concludes the
//      rule was forgotten).
//
// ⭐ AND THE SEVENTH FAULT, THE ONE THAT IS NOT IN THE CHARTER'S LIST because it was found by LOOKING
// at a render rather than by reading a document: a part authored at the depth of the body it hangs
// off sits BEHIND that body's own opaque PAPER front face and contributes zero pixels. It cost the
// shrine shelf its only visible support and the sealed capsule all four of its standoffs, on two
// separate lanes. Every standoff in this file is therefore placed FORWARD of its body's front plane
// (y = 4, against a body at y = 0 whose face is drawn over everything behind it) and BELOW its
// bottom edge, and the guard is an INEQUALITY on the projected y so re-placing a pad is allowed and
// hiding one is not.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// IDENTITY. Each piece keeps the IDENTIFYING FEATURE its warm predecessor was redrawn around in
// 2026-07-27 (`docs/design/perilune-item-set.dc.html` and `objects.js`'s own comments), because the
// point of a replacement is that a player who learned the old silhouette still reads the new one:
//
//   reactor-plant   ← reactor          the dashed CONTAINMENT RING round the core, coolant stacks
//                                      down each flank, a control strip of four lamps, three lit
//   solar-wing      ← solar-panel      the ruled PHOTOVOLTAIC GRID in a heavy frame
//   bottle-rack     ← oxygen-tank      TWO BOTTLES yoked at the neck and strapped at the base
//   reclaimer-stack ← water-recycler   the SIGHT GLASS with a water line, grey in high / clean out
//                                      low (the flow direction IS the machine), the recycling mark
//   paste-column    ← paste-dispenser  the SCREEN and the SPOUT over a serving alcove
//   med-cot         ← med-bed          the pillow and THE CROSS
//   fab-cell        ← fabricator       a chamber you look INTO, a print head crossing it, a billet
//                                      forming under it, an output tray at the lip
//   ring-array      ← sensor-array     CONCENTRIC RINGS and a SWEEP with a contact on it
//   dish-mast       ← comms-dish       the PARABOLA on a mast, feed at the focus
//   plant-pot       ← potted-plant     a leafy crown over a tapered pot
//   book-case       ← bookshelf        rows of SPINES, varied, in an open case
//   deck-turret     ← turret           swivel base, head, BARREL
//   sleeper-pod     ← cryopod          a capsule whose FROSTED WINDOW is the whole interface
//
// ⚠️ THE OLD ROWS ARE NOT DELETED. `client/src/items/index.js` keeps every one of them registered at
// `glyph: null`, for the reason that file records: the warm rows are half of the 70-piece twin
// bijection that is the whole of the evidence the other twins are transcribed correctly. See the
// `— lane/paper-machines —` block there.
//
// PURITY. Same contract as every other builder (`helpers.js:1-16`): pure `(opts) -> string` SVG-`<g>`
// fragments, no DOM, no clock, no randomness, def ids namespaced by `idPrefix`. Nothing here imports
// `index.js`, so the dependency runs one way and the set reverts by reverting this file plus its
// registry rows.

import { item, r3, TILE, INK, PAPER, ATTEND } from './helpers.js';
import {
  box as obox, roomFrame, HATCH, PAPER_FLAT, n as nn, DEPTH_RATIO, PX_PER_CM,
} from '../render/oblique.js';
import { BOX, W, ink, line, disc, path, curve } from './fittings.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The two ratios, as magnitudes — read from the kit, never re-typed
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A centimetre of depth moves a point `DX` cm right; `DEPTH_RATIO` is the one home for it. */
const DX = DEPTH_RATIO.x;
/** …and `DY` cm UP. `DEPTH_RATIO.y` is −0.6 because SVG's y grows downward; everything in this
 *  module wants the magnitude (an extent grows upward by `DY·d`, a level circle's `ry` is `DY·rx`),
 *  so the sign is taken off ONCE, here, with the reason written down. */
const DY = Math.abs(DEPTH_RATIO.y);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SPECS — every machine's drawn box in centimetres, and where the number comes from
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `w` across · `d` back · `h` up. ONE TILE IS ONE METRE, so these are the numbers that decide whether
// a reactor dominates its compartment and a plant pot does not. Each is derived from what the OBJECT
// is and then sanity-checked against the catalogue's own entries, which is the only calibration
// available with no card to measure: a 200 cm med cot is the 200 cm `cot`; a 96 cm book case stands
// beside the 92 cm `locker` and the 120 cm `shelf-rack`; a 110 cm reclaimer is a rack, not furniture.
//
// ⚠️ `round: true` MEANS `w = d = ∅` AND NO HEADING — it is a note for the reader (the level-ellipse
// rule lives in the builders). Two of the thirteen are round in that strict sense. The SLEEPER POD is
// deliberately NOT marked round although `w = d`: it has a window, so it has a front, and setting it
// down "any way about" would put the one thing a player needs to see against a wall.

export const SPECS = Object.freeze({
  // M01 · a shielded plant with two coolant stacks. Room-dominating on purpose: 2.0 m × 1.6 m of deck
  // is two tiles by nearly two, which is what a reactor costs a wreck this size.
  'reactor-plant':   { w: 200, d: 160, h: 220 },
  // M02 · one WING of the array: a 2.4 m panel leaning back on a stand. Compare the 2.6 m `bench` —
  // the two longest things in the set, and the only two that read as spans rather than as boxes.
  'solar-wing':      { w: 240, d: 88,  h: 170 },
  // M03 · two ∅26 cm industrial bottles yoked in a cradle. The DRAWN bottle is 136 cm — body 8→122,
  // shoulder 122→134, valve cap 134→144 — standing on an 8 cm base, and the box's 150 is that plus the
  // clearance the yoke needs. (The first draft's comment said "140 cm tall, the real thing"; it was
  // describing a bottle nobody had drawn.)
  'bottle-rack':     { w: 64,  d: 36,  h: 150 },
  // M04 · an ISS-class reclamation rack: 110 × 70 of deck, 1.8 m to the top cover, inlet riser above.
  'reclaimer-stack': { w: 110, d: 70,  h: 180 },
  // M05 · a dispensing column at counter proportions, with the serving alcove at 44–96 cm — hand
  // height for someone standing, which is what makes it read as a machine you queue at.
  'paste-column':    { w: 70,  d: 55,  h: 165 },
  // M06 · a cot's own 200 × 90 (wider than the 70 cm `cot`, because a clinical bed is approached from
  // both sides), deck at 64 cm; the box's 128 is the MONITOR at the head — see the comment on `h`
  // above: the dimension line describes the object, the box describes the picture.
  'med-cot':         { w: 200, d: 90,  h: 128 },
  // M07 · a printer cell, benchtop proportions on its own legs: 150 × 90, chamber window at eye line.
  'fab-cell':        { w: 150, d: 90,  h: 175 },
  // M08 · ∅140 of rings on a 1.1 m mast. Round in the strict sense: an antenna array has no front.
  // ⚠️ THE MAST WAS 1.5 m AND WAS SHORTENED BY LOOKING AT THE RENDER, not by reasoning. A round piece
  // is scaled to fill `BOX` in its LARGER extent, and every centimetre of mast goes into the vertical
  // one — so the taller the mast, the smaller the rings, which are the entire identity of the piece.
  // At 184 the array drew 28 px across a 112 box; at 140 it draws 34, and nothing else moved.
  'ring-array':      { w: 140, d: 140, h: 140, round: true },
  // M09 · a ∅110 dish on a mast, mouth up and to port. NOT round: it points somewhere, and that is
  // the whole of what a dish is. `d` is 68 because the drawn depth is the base and the dish PLANE —
  // a box deeper than the ink would centre the piece on empty paper (the `z0` lesson, sideways).
  'dish-mast':       { w: 110, d: 68,  h: 200 },
  // M10 · a ∅56 floor pot, 46 cm of vessel and a crown to 112. Beside the 120 cm box `herb-planter`
  // this is unmistakably the other thing: one pot, one plant, somebody's.
  'plant-pot':       { w: 56,  d: 56,  h: 112, round: true },
  // M11 · 96 × 28 × 176 — SHALLOW, which is the whole difference from the 92 × 42 `locker`: books are
  // 28 cm deep and a wardrobe is 42, and an open case at locker depth reads as a locker with no door.
  'book-case':       { w: 96,  d: 28,  h: 176 },
  // M12 · a deck-bolted mount: ∅84 of ring and drum, head at 64, barrel out to 1.4 m.
  'deck-turret':     { w: 110, d: 88,  h: 146 },
  // M13 · a standing single berth: ∅84 × 194. Upright rather than lying, which is what separates it
  // from a bunk at tile size — nothing else in the set is a tall capsule with a hood.
  'sleeper-pod':     { w: 84,  d: 84,  h: 194 },
});

/** Every machine id, in sheet order (M01 → M13). */
export const MACHINE_IDS = Object.freeze(Object.keys(SPECS));

/** A machine's extents in centimetres: `[across, up]`, the oblique's own two ratios applied.
 *  `z0` is supported for symmetry with `fittings.extents` — no machine uses it (none is wall-hung),
 *  and `machines.test.js` asserts that, so the branch is honest rather than speculative. */
function extents(spec) {
  const z0 = spec.z0 == null ? 0 : spec.z0;
  return [spec.w + DX * spec.d, (spec.h - z0) + DY * spec.d];
}

/** The derived px-per-cm for a machine: whatever makes its larger extent fill `BOX`. */
function scaleOf(spec) {
  const [ex, ey] = extents(spec);
  const m = Math.max(ex, ey);
  return m > 0 ? BOX / m : 1;
}

/**
 * The registry `size` hint — the piece's drawn footprint in the mock-px space every `ITEMS` row
 * states its size in, at `PX_PER_CM.catalogue`, which is the SAME shared scale `fittings.SIZES` uses.
 * That is the point: a 200 cm reactor and a 46 cm chair have to be comparable in this column, and the
 * per-piece DRAWING scale (which normalises every piece to 112) makes them the opposite of that.
 * ⛔ NOT the drawn tile extent — that is `BOX_EXTENT`, and a rule about ink LENGTH must use that one.
 */
export const SIZES = Object.freeze(MACHINE_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = PX_PER_CM.catalogue;
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

/** A machine's DRAWN extent, in the px the builder actually emits — `BOX` in the larger axis. */
export const BOX_EXTENT = Object.freeze(MACHINE_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = scaleOf(SPECS[id]);
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The primitives — everything below is drawn through these, in centimetres
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ `ink` / `line` / `disc` / `path` / `curve` ARE IMPORTED FROM `fittings.js`, NOT COPIED. They are
// that module's exported drawing vocabulary and they carry the round-cap rule, the level-ellipse
// ratio and the weight defaults; a second spelling of them here would be a second dialect wearing the
// same palette. What this module DOES define is the four constructions `fittings.js` keeps private
// (`bx`, `cyl`, `hoop`, `quad`) plus two it has no use for (`taper`, `levelRing`) — and every one of
// them is a thin wrapper over `oblique.box()` or over the imported `ink`/`disc`, so NO GEOMETRY IS
// RE-DERIVED: the winding, the face order and the depth vector stay the kit's alone.

/**
 * The 45° side-face hatch, registered as this fragment's own `<pattern>`.
 * ⚠️ NOT `oblique.fhDef()/fhRef()`: those mint a FIXED id per surface root, and an item builder may be
 * called many times into ONE document — `items.test.js` pins that two placements share no def id.
 * `scene.pat()` numbers its defs off the caller's `idPrefix`, which is exactly that guarantee. Every
 * NUMBER below comes from `oblique.HATCH`, so this pattern and the room cutaway's cannot drift.
 */
function hatchPaint(s) {
  return s.pat(
    `<rect width="${r3(HATCH.period)}" height="${r3(HATCH.period)}" fill="${HATCH.ground}"/>`
    + `<path d="M0 0 L0 ${r3(HATCH.period)}" stroke="${HATCH.ink}" stroke-width="${r3(HATCH.width)}"`
    + ` opacity="${r3(HATCH.opacity)}"/>`,
    { w: HATCH.period, h: HATCH.period, transform: `rotate(${r3(HATCH.angle)})` },
  );
}

/** A filled+stroked quad through cm points (a window, a back panel, a blanket, a soil bed). */
function quad(s, F, pts, o = {}) {
  ink(s, path(F, pts, true), { fill: o.fill == null ? PAPER : o.fill, sw: W.fine, cap: false, ...o });
}

/**
 * A machine's BODY: the three visible faces of a box standing at `(x, y)` with its base at `z`.
 * Straight through `oblique.box()`, so the winding, the face order and the depth vector are the kit's.
 */
function bx(s, F, x, y, z, w, h, d, o = {}) {
  const [px, py] = F.project(x, y, z);
  s.raw(obox(px, py, w, h, d, F.s, {
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

/**
 * THE FRONT HALF of a level ellipse — a band round a cylinder, a seam, a strap.
 * The back half is behind the body, so drawing it makes a barrel read as a wire cage; this is
 * `fittings.hoop` verbatim in construction (it is private there) and the same `A rx ry 0 0 0` sweep a
 * cylinder's own bottom edge already uses.
 */
function hoop(s, F, x, y, z, rCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  const rx = F.s * rCm;
  const ry = DY * F.s * rCm;
  ink(s, `M${nn(cx - rx)} ${nn(cy)} A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(cx + rx)} ${nn(cy)}`, o);
}

/**
 * A FULL level ring, as two half-arcs, so it can carry a dash.
 *
 * ⚠️ IT IS NOT THE THING E8-2 FORBIDS, and the difference is the surface it lies on. A full ellipse
 * drawn round a CYLINDER shows its own back half through the body — that is the water-butt defect.
 * A full ellipse lying on a HORIZONTAL face (the reactor's body top, the ring array's spoke plane) is
 * entirely in front of that face: every millimetre of it is genuinely visible, and drawing only the
 * front half would put a gap in a ring that has none. `disc(fill:'none')` says the same thing but
 * cannot dash, and the reactor's containment ring is DASHED in the piece it replaces — which is one
 * of the three marks that made that piece read as a reactor rather than as a lamp.
 */
function levelRing(s, F, x, y, z, rCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  const rx = F.s * rCm;
  const ry = DY * F.s * rCm;
  ink(s,
    `M${nn(cx - rx)} ${nn(cy)} A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(cx + rx)} ${nn(cy)}`
    + ` A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(cx - rx)} ${nn(cy)}`, { cap: false, ...o });
}

/**
 * A vertical CYLINDER: the body (two sides, a visible front bottom arc, a hidden back top arc) and
 * its top cap. `fittings.cyl` verbatim in construction — the back arc exists only so the body closes,
 * and the cap covers it, which is why no back half ever shows.
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

/**
 * A TRUNCATED CONE — the same construction as `cyl` with two radii. It is the one shape this dialect
 * needed and did not have: a flower pot, a reactor's shoulder, a turret head and a capsule's hood are
 * all the same solid, and drawing any of them as a stack of cylinders reads as a stack of tins.
 */
function taper(s, F, x, y, z0, z1, r0, r1, o = {}) {
  const [cx, yb] = F.project(x, y, z0);
  const [, yt] = F.project(x, y, z1);
  const rx0 = F.s * r0;
  const ry0 = DY * F.s * r0;
  const rx1 = F.s * r1;
  const ry1 = DY * F.s * r1;
  const sw = o.sw == null ? W.mid : o.sw;
  ink(s,
    `M${nn(cx - rx1)} ${nn(yt)} L${nn(cx - rx0)} ${nn(yb)}`
    + ` A${nn(rx0)} ${nn(ry0)} 0 0 0 ${nn(cx + rx0)} ${nn(yb)}`
    + ` L${nn(cx + rx1)} ${nn(yt)} A${nn(rx1)} ${nn(ry1)} 0 0 1 ${nn(cx - rx1)} ${nn(yt)} Z`,
    { fill: o.fill === undefined ? PAPER : o.fill, sw, cap: false });
  if (o.cap !== false) disc(s, F, x, y, z1, r1, { sw });
}

/**
 * A STANDOFF PAD under a machine's body.
 *
 * ⚠️ THE `y` DEFAULT IS 4 AND IT IS LOAD-BEARING, not tidiness. A pad authored at the depth of the
 * body it holds up is drawn BEHIND that body's own opaque PAPER front face and contributes zero
 * pixels — the shrine-shelf fault, and then the sealed capsule's, on two lanes. Four centimetres
 * forward of the body plane puts the pad's own front face in front of the body's, where a foot
 * belongs. `machines.test.js` asks the INEQUALITY (a pad must draw below the body's bottom edge), so
 * a pad may be re-placed and may not be hidden.
 */
function pad(s, F, x, y, w, h, d, hatch) { bx(s, F, x, y, 0, w, h, d, { hatch, sw: W.fine }); }

/**
 * Machine `id`'s own frame. The origin is placed so the piece's DRAWN band is CENTRED on (0,0) — the
 * coordinate model every builder in this directory shares (`helpers.js:9-15`) — and `project` is
 * `oblique.roomFrame`'s, unmodified. ONE derivation, used by the builders, by the harness, by
 * `wrecked.js`'s twins and by any caller that wants to draw ON a machine.
 */
export function frameFor(id) {
  const spec = SPECS[id];
  if (!spec) return undefined;
  const [ex, ey] = extents(spec);
  const k = scaleOf(spec);
  return roomFrame(spec.w / 100, spec.d / 100, spec.h / 100, k,
    { x: -(k * ex) / 2, y: k * (ey / 2 + (spec.z0 == null ? 0 : spec.z0)) });
}

/**
 * HOW A MACHINE DROPS INTO A ROOM AT TRUE SIZE — `fittings.roomBox`'s twin, for the same reason it
 * lives beside the drawing scale it depends on: a second derivation is how a caller and the harness
 * come to disagree about how big a reactor is. Asking for a box side of `128·s/scaleOf` puts the piece
 * on screen at EXACTLY `s` px per centimetre, so a 200 cm reactor is 200 cm of deck.
 * @param {string} id a machine id
 * @param {number} s  px per cm of the destination surface (PX_PER_CM.room for the cutaway)
 */
export function roomBox(id, s) {
  const spec = SPECS[id];
  if (!spec || !(s > 0)) return undefined;
  const [ex, ey] = extents(spec);
  const k = scaleOf(spec);
  if (!(k > 0)) return undefined;
  const side = (TILE * s) / k;
  const z0 = spec.z0 == null ? 0 : spec.z0;
  return {
    side,
    dx: -side / 2 + (s * ex) / 2,
    dy: -side / 2 - s * (ey / 2 + z0),
    wCm: spec.w, dCm: spec.d, hCm: spec.h,
  };
}

/**
 * The painter's environment: the frame, the spec, the power state and the hatch.
 * ⚠️ `hatch` IS A GETTER. Five of the thirteen are all-cylinder pieces with no side face at all, and
 * registering a `<pattern>` they never reference would put an unused def in every one of their
 * fragments — `machines.test.js` treats that as a defect, both ways. ⛔ DO NOT SPREAD THIS OBJECT:
 * a spread EVALUATES getters and would register the pattern for all thirteen.
 */
function envFor(s, id, state) {
  let hp = null;
  return {
    F: frameFor(id),
    spec: SPECS[id],
    state,
    powered: state !== 'off' && state !== 'unpowered',
    get hatch() { if (hp === null) hp = hatchPaint(s); return hp; },
  };
}

/** The harness: an item fragment whose painter draws in the machine's own centimetres. */
function machine(id, opts, paint) {
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state)); });
}

/** Points along a LEVEL arc, in cm — for a sector or a curved rail on a horizontal plane. */
function arcPts(cx, cy, z, r, a0, a1, steps) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// POWER — M01, M02, M03
// ═════════════════════════════════════════════════════════════════════════════════════════════

// M01 REACTOR PLANT · 200 × 160 × 220 · "Shielded core, a stack down each flank. Do not approach the drum."
//
// The warm piece was redrawn in 2026-07-27 because "a bare glowing disc is indistinguishable from a
// lamp, a hob or a standing light at tile size", and what fixed it was everything AROUND the core: an
// armoured housing, coolant fins, a DASHED containment ring, a control strip reading three lit and one
// dark. All four survive here, and the ring survives as a ring rather than as a halo — the core is a
// TOP-LOADED drum, which is what a shielded vessel is, so the containment ring lies on the body's top
// face where the level rule draws it whole and correct.
//
// ⛔ THE ONE THING THAT COULD NOT COME ACROSS IS THE GLOW, and dropping it is a decision rather than
// an omission: this palette has four values and none of them is light. `state:'off'` moves the lamp
// bank instead, which is the same fact told in ink — a running plant has three lamps filled.
const drawReactorPlant = (s, { F, hatch, powered }) => {
  for (const x of [16, 158]) { pad(s, F, x, 4, 26, 10, 16, hatch); pad(s, F, x, 128, 26, 10, 16, hatch); }
  // the two coolant stacks, drawn FIRST so the body's own front face closes over their inner edge
  for (const x of [0, 170]) {
    bx(s, F, x, 24, 10, 30, 180, 110, { hatch, sw: W.heavy });
    for (let i = 0; i < 9; i += 1) {
      const z = 26 + i * 18;
      line(s, F, [[x + 3, 24, z], [x + 27, 24, z]], { sw: W.hair, opacity: 0.7 });
    }
  }
  bx(s, F, 30, 0, 10, 140, 152, 150, { hatch, sw: W.mass });
  // the containment ring, on the body's top face, round the drum's foot — dashed, as it was
  levelRing(s, F, 100, 75, 162, 62, { sw: W.mid, dash: '5 4', opacity: 0.9 });
  cyl(s, F, 100, 75, 162, 200, 44, { sw: W.mass, cap: false });
  taper(s, F, 100, 75, 200, 216, 44, 26, { sw: W.heavy });
  hoop(s, F, 100, 75, 180, 44, { sw: W.hair, opacity: 0.55 });
  // the hazard plate, on the drum's own front — the ONE accent, spent where the accent belongs.
  // Drawn as PATHS (a triangle and a bang), never as a font glyph: charter §1, and `battery-bank`'s
  // own precedent for exactly this mark.
  line(s, F, [[92, 32, 170], [108, 32, 170], [100, 32, 186]],
    { sw: W.mid, stroke: ATTEND, close: true });
  line(s, F, [[100, 32, 174], [100, 32, 181]], { sw: W.hair, stroke: ATTEND });
  // the inspection door and its handle
  line(s, F, [[44, 0, 76], [156, 0, 76], [156, 0, 146], [44, 0, 146]],
    { sw: W.fine, close: true, cap: false });
  line(s, F, [[100, 0, 76], [100, 0, 146]], { sw: W.hair, opacity: 0.6, cap: false });
  line(s, F, [[92, 0, 108], [92, 0, 120]], { sw: W.heavy });
  // the control strip: four lamps, three of them lit — the piece's own tell
  line(s, F, [[46, 0, 38], [124, 0, 38], [124, 0, 62], [46, 0, 62]],
    { sw: W.fine, close: true, cap: false });
  for (let i = 0; i < 4; i += 1) {
    const x = 52 + i * 18;
    const lit = powered && i < 3;
    line(s, F, [[x, 0, 45], [x + 12, 0, 45], [x + 12, 0, 56], [x, 0, 56]],
      { sw: W.hair, close: true, cap: false, fill: lit ? INK : 'none' });
  }
  line(s, F, [[36, 0, 16], [164, 0, 16]], { sw: W.hair, opacity: 0.4, cap: false });
};
export const reactorPlant = (opts = {}) => machine('reactor-plant', opts, drawReactorPlant);

// M02 SOLAR WING · 240 × 88 × 170 · "One wing of the array. It folds against the hull in a storm."
//
// The identifying feature is the RULED GRID in a heavy frame, and it survives exactly: the panel is
// one plane, and because cabinet oblique is affine, every cell line is a straight line THROUGH THAT
// PLANE rather than a decoration drawn flat on top of it. `P(u, v)` is that plane, parameterised once
// so the frame, the grid and the two legs all land on the same surface by construction.
const P_WING = (u, v) => [8 + 224 * u, 12 + 68 * v, 36 + 134 * v];
const drawSolarWing = (s, { F }) => {
  for (const x of [34, 206]) {
    line(s, F, [[x, 4, 0], [x, 80, 0]], { sw: W.heavy });                    // the deck rail
    line(s, F, [[x, 4, 0], [x, 12, 36]], { sw: W.mass });                    // the front strut
    line(s, F, [[x, 80, 0], [x, 62, 134.5]], { sw: W.mass });                // the rear mast
  }
  quad(s, F, [P_WING(0, 0), P_WING(1, 0), P_WING(1, 1), P_WING(0, 1)], { fill: PAPER, sw: W.mass });
  line(s, F, [P_WING(0.035, 0.06), P_WING(0.965, 0.06), P_WING(0.965, 0.94), P_WING(0.035, 0.94)],
    { sw: W.fine, close: true, cap: false });
  for (let i = 1; i < 8; i += 1) {
    line(s, F, [P_WING(i / 8, 0.06), P_WING(i / 8, 0.94)], { sw: W.hair, opacity: 0.75, cap: false });
  }
  for (let j = 1; j < 4; j += 1) {
    const v = 0.06 + (0.88 * j) / 4;
    line(s, F, [P_WING(0.035, v), P_WING(0.965, v)], { sw: W.hair, opacity: 0.75, cap: false });
  }
  // the feeder, from the panel's own bottom edge down to the deck. Attached at both ends: the point
  // it leaves is ON the plane (`P_WING(0.5, 0)`), the point it lands on is the deck between the legs.
  curve(s, F, P_WING(0.5, 0), [120, 22, 14], [120, 44, 0], { sw: W.mid });
};
export const solarWing = (opts = {}) => machine('solar-wing', opts, drawSolarWing);

// M03 BOTTLE RACK · 64 × 36 × 150 · "Two bottles, yoked and strapped. What you breathe when the room will not."
//
// The warm piece was redrawn in 2026-07-27 for the same reason as the reactor: "one capsule with a nub
// on top was a cryopod, a barrel or a battery", and the fix was the TWIN BOTTLE SET — two cylinders
// yoked at the neck, strapped at the base, valve caps, label patches. Every one of those five parts is
// here. The straps are FRONT HALF-ARCS with a connector between them (E8-2), so the pair reads as
// banded rather than as a wire cage.
const BOTTLES = [17, 47];
const drawBottleRack = (s, { F, hatch }) => {
  bx(s, F, 0, 4, 0, 64, 8, 28, { hatch, sw: W.heavy });
  for (const c of BOTTLES) {
    cyl(s, F, c, 18, 8, 122, 13, { sw: W.heavy, cap: false });
    taper(s, F, c, 18, 122, 134, 13, 6, { sw: W.mid, cap: false });
    cyl(s, F, c, 18, 134, 144, 6, { sw: W.mid });
    // the pressure band at the shoulder — the ONE accent, and it means what the accent means: this is
    // a vessel under pressure, and the raid is the reason anyone is reading it.
    hoop(s, F, c, 18, 118, 13, { sw: W.mid, stroke: ATTEND });
    quad(s, F, [[c - 9, 6, 58], [c + 9, 6, 58], [c + 9, 6, 82], [c - 9, 6, 82]],
      { fill: PAPER_FLAT, sw: W.fine });
    for (const z of [66, 74]) line(s, F, [[c - 6, 6, z], [c + 6, 6, z]], { sw: W.hair, opacity: 0.5 });
  }
  bx(s, F, 11, 14, 136, 42, 5, 8, { hatch, sw: W.mid });                     // the yoke, across both necks
  line(s, F, [[17, 12, 141], [26, 12, 144]], { sw: W.mid });                 // the valve lever
  for (const z of [34, 96]) {                                                // the two straps
    for (const c of BOTTLES) hoop(s, F, c, 18, z, 13, { sw: W.mid });
    line(s, F, [[30, 18, z], [34, 18, z]], { sw: W.mid });
  }
  line(s, F, [[29, 18, 32], [35, 18, 32], [35, 18, 37], [29, 18, 37]],
    { sw: W.hair, close: true, cap: false });                                // the buckle
};
export const bottleRack = (opts = {}) => machine('bottle-rack', opts, drawBottleRack);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WATER, FOOD, CARE — M04, M05, M06
// ═════════════════════════════════════════════════════════════════════════════════════════════

// M04 RECLAIMER STACK · 110 × 70 × 180 · "Grey in at the top, clean out at the bottom. The direction is the machine."
//
// The 2026-07-27 redraw gave this piece three things and named them: a filled SIGHT GLASS with a water
// LINE across it, a dirty inlet HIGH on one side and a clean outlet LOW on the other ("the flow
// direction IS the machine"), and the recycling mark. All three are here, and the mark is DRAWN — two
// chasing arrows with real heads, never a `♻` glyph, because a font this document does not ship is a
// smudge at tile size and a different smudge on a de-DE box (charter §1).
const drawReclaimerStack = (s, { F, hatch }) => {
  for (const x of [8, 82]) { pad(s, F, x, 4, 20, 10, 14, hatch); pad(s, F, x, 52, 20, 10, 14, hatch); }
  bx(s, F, 0, 0, 10, 110, 152, 70, { hatch, sw: W.mass });
  bx(s, F, 2, 2, 162, 106, 8, 66, { hatch, sw: W.heavy });
  // the sight glass, and the water standing in it
  quad(s, F, [[24, 0, 62], [80, 0, 62], [80, 0, 132], [24, 0, 132]], { fill: PAPER_FLAT, sw: W.mid });
  quad(s, F, [[24, 0, 62], [80, 0, 62], [80, 0, 98], [24, 0, 98]], { fill: hatch, sw: W.hair });
  line(s, F, [[24, 0, 98], [80, 0, 98]], { sw: W.heavy });
  // GREY IN — the riser, high, with a caution collar. The accent says "not this one".
  cyl(s, F, 16, 35, 170, 180, 7, { sw: W.mid });
  disc(s, F, 16, 35, 170, 10, { fill: 'none', sw: W.mid, stroke: ATTEND });
  // CLEAN OUT — the spigot, low, on the other flank
  disc(s, F, 92, 0, 40, 5, { fill: 'none', sw: W.fine });
  line(s, F, [[92, 0, 40], [104, 0, 40], [104, 0, 26]], { sw: W.mass });
  // the mark: two arrows chasing each other
  curve(s, F, [42, 0, 152], [55, 0, 164], [68, 0, 152], { sw: W.mid });
  line(s, F, [[63, 0, 156], [68, 0, 152], [64, 0, 147]], { sw: W.fine });
  curve(s, F, [68, 0, 144], [55, 0, 132], [42, 0, 144], { sw: W.mid });
  line(s, F, [[47, 0, 140], [42, 0, 144], [46, 0, 149]], { sw: W.fine });
  // the access door
  line(s, F, [[14, 0, 20], [96, 0, 20], [96, 0, 54], [14, 0, 54]],
    { sw: W.fine, close: true, cap: false });
  line(s, F, [[80, 0, 32], [80, 0, 42]], { sw: W.heavy });
  for (const y of [14, 34, 54]) line(s, F, [[6, y, 170], [104, y, 170]], { sw: W.hair, opacity: 0.5 });
};
export const reclaimerStack = (opts = {}) => machine('reclaimer-stack', opts, drawReclaimerStack);

// M05 PASTE COLUMN · 70 × 55 × 165 · "It will feed you. You will not enjoy it."
//
// Steel column, screen, spout — the warm piece's three parts. What is ADDED is the thing that makes it
// legible as a machine you queue at rather than as a cabinet: the SERVING ALCOVE, a real recess with a
// hatched back, a grated floor and the spout hanging in it. A spout drawn on a flat front face is a
// stub on a wall; a spout inside a recess is a place you put a bowl.
const drawPasteColumn = (s, { F, hatch }) => {
  for (const x of [8, 48]) { pad(s, F, x, 4, 16, 8, 12, hatch); pad(s, F, x, 40, 16, 8, 12, hatch); }
  bx(s, F, 0, 0, 8, 70, 150, 55, { hatch, sw: W.mass });
  bx(s, F, 8, 6, 158, 54, 7, 44, { hatch, sw: W.heavy });                    // the hopper
  // the alcove: a hatched back, a flat serving floor, and the opening cut in the front face
  quad(s, F, [[10, 30, 44], [60, 30, 44], [60, 30, 96], [10, 30, 96]], { fill: hatch, sw: W.fine });
  quad(s, F, [[10, 0, 44], [60, 0, 44], [60, 30, 44], [10, 30, 44]], { fill: PAPER_FLAT, sw: W.fine });
  line(s, F, [[10, 0, 44], [60, 0, 44], [60, 0, 96], [10, 0, 96]],
    { sw: W.mid, close: true, cap: false });
  for (const y of [10, 17, 24]) line(s, F, [[16, y, 44], [54, y, 44]], { sw: W.hair, opacity: 0.6 });
  disc(s, F, 35, 18, 96, 6, { sw: W.fine });                                 // the spout's collar …
  cyl(s, F, 35, 18, 84, 96, 4, { sw: W.mid, cap: false });                   // … and the spout
  // the screen — a readout, deliberately unreadable at the size a tile draws (the `cryo.js` ruling)
  quad(s, F, [[12, 0, 112], [58, 0, 112], [58, 0, 140], [12, 0, 140]], { fill: PAPER_FLAT, sw: W.mid });
  for (const z of [120, 128]) line(s, F, [[17, 0, z], [45, 0, z]], { sw: W.hair, opacity: 0.55 });
  // the one press on the whole machine — the ONE accent
  disc(s, F, 63, 0, 104, 4, { fill: ATTEND, stroke: ATTEND, sw: W.hair });
};
export const pasteColumn = (opts = {}) => machine('paste-column', opts, drawPasteColumn);

// M06 MED COT · 200 × 90 × 128 · "One bed, one screen, one bracket. Everything else is you."
//
// The warm piece was a cream bed, a pillow and A RED CROSS. In a palette with one accent, the cross IS
// the accent — a medical mark is attention, which is exactly what oxblood is for — and it is drawn on
// the folded blanket, on a LEVEL surface, where the round-things-level rule's sibling holds: a mark on
// a horizontal face is drawn in that face's own plane. That is what keeps it reading as a cross laid
// on a bed rather than as a sticker floating over one.
//
// The ECG trace on the monitor is DRAWN (charter §1: no font glyph outside the two shipped faces) and
// is what stops the screen reading as a locker door at 22 px.
const drawMedCot = (s, { F, hatch }) => {
  for (const [x, y] of [[14, 12], [14, 76], [186, 12], [186, 76]]) {
    line(s, F, [[x, y, 3], [x, y, 52]], { sw: W.mass });
    disc(s, F, x, y, 3, 5, { fill: 'none', sw: W.fine });                    // the castor
  }
  for (const x of [14, 186]) line(s, F, [[x, 12, 16], [x, 76, 16]], { sw: W.mid });
  line(s, F, [[14, 12, 16], [186, 12, 16]], { sw: W.mid });
  bx(s, F, 4, 4, 52, 192, 12, 82, { hatch, sw: W.heavy });                   // the deck
  bx(s, F, 0, 6, 52, 8, 40, 78, { hatch, sw: W.heavy });                     // the head board
  bx(s, F, 14, 14, 64, 54, 9, 62, { sideFill: 'flat', sw: W.mid });          // the pillow
  quad(s, F, [[92, 8, 64], [192, 8, 64], [192, 82, 64], [92, 82, 64]],
    { fill: PAPER_FLAT, sw: W.fine });                                       // the blanket
  line(s, F, [[92, 8, 64], [92, 82, 64]], { sw: W.mid });
  line(s, F, [[142, 27, 64], [142, 63, 64]], { sw: W.mass, stroke: ATTEND }); // THE CROSS
  line(s, F, [[124, 45, 64], [160, 45, 64]], { sw: W.mass, stroke: ATTEND });
  for (const x of [70, 128]) line(s, F, [[x, 4, 64], [x, 4, 84]], { sw: W.mid });
  line(s, F, [[70, 4, 84], [128, 4, 84]], { sw: W.heavy });                  // the side rail
  line(s, F, [[6, 80, 64], [6, 80, 106]], { sw: W.heavy });                  // the monitor mast
  bx(s, F, 0, 72, 106, 34, 20, 16, { sideFill: 'flat', sw: W.mid });
  line(s, F, [[4, 72, 114], [10, 72, 114], [13, 72, 122], [16, 72, 108], [19, 72, 116], [30, 72, 116]],
    { sw: W.hair, opacity: 0.85 });                                          // the trace
};
export const medCot = (opts = {}) => machine('med-cot', opts, drawMedCot);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// MAKE, LOOK, LISTEN — M07, M08, M09
// ═════════════════════════════════════════════════════════════════════════════════════════════

// M07 FAB CELL · 150 × 90 × 175 · "Watch the head cross and something exists that did not."
//
// The 2026-07-27 redraw made this "a printer you can watch WORKING": a dark chamber you look into, a
// print head sweeping the top of it, a billet forming underneath, an output tray at the lip, a ready
// lamp. The dark chamber becomes a PAPER_FLAT window here (this palette has no dark), and the head is
// the piece's one moving part, so it is the head that `state:'off'` moves — and the head is where the
// accent goes, because a machine mid-job is exactly what "attention" means on a wreck.
const drawFabCell = (s, { F, hatch, powered }) => {
  for (const x of [10, 122]) { pad(s, F, x, 4, 18, 10, 14, hatch); pad(s, F, x, 72, 18, 10, 14, hatch); }
  bx(s, F, 0, 0, 10, 150, 150, 90, { hatch, sw: W.mass });
  bx(s, F, 4, 4, 160, 142, 8, 82, { hatch, sw: W.heavy });
  cyl(s, F, 128, 45, 168, 175, 6, { sw: W.mid });                            // the extract
  disc(s, F, 20, 30, 168, 6, { fill: powered ? INK : PAPER, sw: W.fine });   // the ready lamp
  // the chamber
  quad(s, F, [[16, 0, 60], [134, 0, 60], [134, 0, 140], [16, 0, 140]], { fill: PAPER_FLAT, sw: W.mid });
  line(s, F, [[21, 0, 65], [129, 0, 65], [129, 0, 135], [21, 0, 135]],
    { sw: W.hair, close: true, cap: false, opacity: 0.6 });
  line(s, F, [[22, 0, 128], [128, 0, 128]], { sw: W.mid });                  // the gantry rail
  bx(s, F, 58, 8, 62, 34, 26, 24, { sideFill: 'flat', sw: W.mid });          // the billet, forming
  line(s, F, [[64, 0, 114], [86, 0, 114], [86, 0, 126], [64, 0, 126]], {
    sw: W.mid, close: true, cap: false, fill: powered ? ATTEND : PAPER, stroke: powered ? ATTEND : INK,
  });                                                                        // the print head
  line(s, F, [[75, 0, 114], [75, 0, 106]], { sw: W.mid, stroke: powered ? ATTEND : INK });
  line(s, F, [[75, 0, 106], [75, 8, 88]], { sw: W.hair, dash: '2 2', opacity: 0.7 });
  // the output tray, and the slot it comes out of
  quad(s, F, [[20, 0, 26], [130, 0, 26], [130, 0, 44], [20, 0, 44]], { fill: PAPER_FLAT, sw: W.mid });
  bx(s, F, 18, 0, 20, 114, 6, 22, { sideFill: 'flat', sw: W.fine });
};
export const fabCell = (opts = {}) => machine('fab-cell', opts, drawFabCell);

// M08 RING ARRAY · ∅140 × 184 · "Three rings, one arm. It listens outward, and it has heard something."
//
// CONCENTRIC RINGS and a SWEEP with a contact on it — the warm piece's whole identity, and the one
// piece in this file where the catalogue's round rule is not a compromise but the correct drawing: an
// antenna array laid level HAS no front, so it can be set down any way about. The three rings are full
// level ellipses and E8-2 does not touch them — they lie on the spoke plane, not round a cylinder, so
// every millimetre of each is genuinely in front of what it is drawn on.
//
// The contact is the accent. A blip is the single most attention-shaped mark this ship can draw.
const RING_Z = 110;
const drawRingArray = (s, { F }) => {
  cyl(s, F, 70, 70, 0, 14, 32, { sw: W.heavy });
  for (const a of [0.6, 2.7, 4.6]) {
    disc(s, F, 70 + 24 * Math.cos(a), 70 + 24 * Math.sin(a), 14, 3, { fill: 'none', sw: W.hair });
  }
  cyl(s, F, 70, 70, 14, RING_Z, 9, { sw: W.mass, cap: false });
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 6 + (i * Math.PI) / 2;
    line(s, F, [[70 + 12 * Math.cos(a), 70 + 12 * Math.sin(a), RING_Z],
      [70 + 68 * Math.cos(a), 70 + 68 * Math.sin(a), RING_Z]], { sw: W.mid });
  }
  // the sweep: a sector on the spoke plane, its leading edge heavier than its trailing wash
  const A0 = -1.2;
  const A1 = -0.45;
  line(s, F, [[70, 70, RING_Z], ...arcPts(70, 70, RING_Z, 62, A0, A1, 8)],
    { sw: W.hair, close: true, cap: false, fill: PAPER_FLAT, opacity: 0.8 });
  for (const t of [0.35, 0.7]) {
    const a = A0 + (A1 - A0) * t;
    line(s, F, [[70 + 20 * Math.cos(a), 70 + 20 * Math.sin(a), RING_Z],
      [70 + 58 * Math.cos(a), 70 + 58 * Math.sin(a), RING_Z]], { sw: W.hair, opacity: 0.45 });
  }
  line(s, F, [[70, 70, RING_Z], [70 + 62 * Math.cos(A0), 70 + 62 * Math.sin(A0), RING_Z]],
    { sw: W.heavy });
  for (const r of [68, 46, 24]) disc(s, F, 70, 70, RING_Z, r, { fill: 'none', sw: W.fine });
  disc(s, F, 70, 70, RING_Z, 12, { sw: W.mid });
  // the contact
  disc(s, F, 70 + 52 * Math.cos(-0.75), 70 + 52 * Math.sin(-0.75), RING_Z, 5,
    { fill: ATTEND, stroke: ATTEND, sw: W.hair });
  cyl(s, F, 70, 70, RING_Z, 132, 4, { sw: W.mid, cap: false });              // the feed spike
  disc(s, F, 70, 70, 126, 8, { fill: 'none', sw: W.hair });
  disc(s, F, 70, 70, 132, 4, { sw: W.fine });
};
export const ringArray = (opts = {}) => machine('ring-array', opts, drawRingArray);

// M09 DISH MAST · ∅110 × 202 · "It has been pointed at the same empty place for a long time."
//
// A PARABOLA on a mast, a feed at the focus — the warm piece's own parts, and the only piece here that
// is drawn as a PROFILE: a dish has a heading, so it is not level, and its bowl lives in one plane at
// y = 34 that the mast, the brace and all three feed struts terminate on.
//
// ⚠️ THE TWO LONG STRUTS ARE NOT AN E8-1 STRIKE-THROUGH, and the distinction is exactly the one the
// charter draws: E8-1 is about a grey diagonal that ends in the air. These end on the RIM, at both
// ends, and they are the tripod that holds a real feed at a real focus. Delete them and the horn
// floats — which is the defect, not the fix.
// ⚠️ THE BOWL IS A FILLED SHAPE, AND THE FIRST DRAFT'S WAS TWO STROKES. Changed by looking at the
// render, not by reasoning. A prime-focus dish really IS shallow — for an aperture D and a depth d the
// focal length is `D²/16d`, so an f/D near 0.3 puts d at about D/5, which is the "thin blade" the
// first draft drew honestly and which read as a flag on a pole at every size below the card. The fix
// is not to lie about the depth: it is to CLOSE the bowl (curve out, mouth chord back, `Z`) and fill
// it, so the eye is given a surface instead of a lens. The numbers below are then all derived from
// one aperture and one sag: a quadratic Bézier's own midpoint is `mid + sag·n` when the control is at
// `mid + 2·sag·n`, and the focus is the parabola's `D²/16d` out along the mouth's normal.
const DISH_A = [10, 34, 194];        // the rim, one lip …
const DISH_B = [96, 34, 126];        // … and the other (aperture 109.6 cm)
const DISH_C = [82.8, 34, 122.3];    // the control: mid + 2·24·(0.620, −0.785)
const DISH_VTX = [67.9, 34, 141.2];  // the bowl's deepest point — where the mast lands
const DISH_FEED = [48.5, 34, 166];   // the focus, D²/16d = 31 cm out along the mouth's normal
const drawDishMast = (s, { F, hatch }) => {
  bx(s, F, 28, 6, 0, 56, 14, 54, { hatch, sw: W.heavy });
  cyl(s, F, 56, 34, 14, 118, 7, { sw: W.mass, cap: false });
  line(s, F, [[56, 34, 118], DISH_VTX], { sw: W.mass });                     // mast → bowl
  line(s, F, [[56, 34, 92], [94, 34, 128]], { sw: W.mid });                  // the brace
  const [ax, ay] = F.project(...DISH_A);
  const [cx, cy] = F.project(...DISH_C);
  const [bx2, by2] = F.project(...DISH_B);
  ink(s, `M${nn(ax)} ${nn(ay)} Q${nn(cx)} ${nn(cy)} ${nn(bx2)} ${nn(by2)} Z`,
    { fill: PAPER_FLAT, sw: W.mass, cap: false });                           // the bowl
  curve(s, F, [16, 34, 189], [80, 34, 126], [92, 34, 129], { sw: W.hair, opacity: 0.6 });
  for (const end of [DISH_A, DISH_B, DISH_VTX]) {
    line(s, F, [DISH_FEED, end], { sw: W.fine });                            // the tripod
  }
  line(s, F, [[43, 34, 160], [54, 34, 166], [51, 34, 175], [40, 34, 169]],
    { sw: W.mid, close: true, cap: false, fill: PAPER });                    // the horn
};
export const dishMast = (opts = {}) => machine('dish-mast', opts, drawDishMast);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LIVE WITH — M10, M11, M12, M13
// ═════════════════════════════════════════════════════════════════════════════════════════════

// M10 PLANT POT · ∅56 × 112 · "Somebody carried a seed through the raid."
//
// A leafy crown over a TAPERED pot — and the taper is the point, which is why this module has a
// `taper` primitive at all: a plant pot drawn as a cylinder is a bin. Round, so level: the rim, the
// band and the soil are all level ellipses and the piece has no heading.
//
// Every leaf STARTS ON THE SOIL. There is no stem in this drawing that begins in the air, which is
// E8-3 stated as a property of the piece rather than as a fix to one.
const LEAVES = [
  { a: [26, 28, 44], c: [20, 26, 78], t: [6, 22, 96], blade: [30, 22, 74] },
  { a: [30, 28, 44], c: [40, 29, 76], t: [50, 30, 92], blade: null },
  { a: [28, 27, 44], c: [30, 18, 82], t: [28, 8, 110], blade: [38, 20, 84] },
  { a: [27, 30, 44], c: [18, 38, 68], t: [14, 44, 84], blade: null },
  { a: [29, 27, 44], c: [38, 20, 74], t: [44, 12, 100], blade: [32, 14, 78] },
  { a: [26, 29, 44], c: [16, 33, 56], t: [10, 36, 66], blade: null },
];
const drawPlantPot = (s, { F }) => {
  taper(s, F, 28, 28, 0, 44, 17, 23, { sw: W.heavy, cap: false });
  hoop(s, F, 28, 28, 38, 22.4, { sw: W.fine });
  disc(s, F, 28, 28, 44, 23, { sw: W.mid });
  disc(s, F, 28, 28, 43, 19, { fill: PAPER_FLAT, sw: W.hair });              // the soil
  for (const [dx, dy] of [[-9, 3], [4, -7], [10, 6], [-3, 9]]) {
    line(s, F, [[28 + dx, 28 + dy, 43], [29 + dx, 28 + dy + 1, 43]], { sw: W.hair, opacity: 0.5 });
  }
  for (const L of LEAVES) {
    curve(s, F, L.a, L.c, L.t, { sw: W.mid });
    if (L.blade) curve(s, F, L.a, L.blade, L.t, { sw: W.fine, opacity: 0.9 });
  }
};
export const plantPot = (opts = {}) => machine('plant-pot', opts, drawPlantPot);

// M11 BOOK CASE · 96 × 28 × 176 · "Paper, kept. Nobody has read them since."
//
// SPINES are the identity — the warm piece's two rows of colours. In one ink the colour goes, so what
// carries the reading is VARIATION: widths from 5 to 9 cm, heights from 24 to 34, one leaner and one
// flat stack per SHELF. That is also why the case is drawn OPEN — four members and a hatched back panel
// rather than a box with a face — because a closed body's opaque PAPER front would paint over every
// book in it, which is the seventh fault in this module's header, arriving by a different road.
//
// ⛔⭐ THE SHELF RUN IS A BUDGET, AND THE FIRST DRAFT SPENT 26.8 cm IT DID NOT HAVE. The spine loop
// walks `x` forward and the leaner and the flat stack are laid down AFTER it, at `x…x+13` and
// `x+15…x+31` — so eleven spines put the top shelf's stack at x = 122.8 against a case 96 cm wide, i.e.
// three books hanging in mid-air past the right-hand side panel. Nothing floats (E8-3), and the harness
// centres the piece on its DECLARED box, so every one of those centimetres was drawn and then clipped.
// The budget, written down so the next person adding a book has to do the arithmetic:
//
//     x_end = 8 + Σw + 0.8·n   must satisfy   x_end + 31 ≤ 91
//
// 91 is the near edge of the right side panel (91..96), whose opaque front face at y = 0 would paint
// over a book at y = 4 anyway — the seventh fault again, one panel along. That caps a shelf at six or
// seven spines, which is what the rows below carry. ⚠️ It was NOT caught by review's own box guard for
// two rounds, because that guard measured the ±56 DRAWING SQUARE rather than this piece's projected
// box; `machines.test.js` now measures the box, and this geometry is its inclusion control.
const SHELF_Z = [10, 52, 90, 128];
const SPINES = [
  [[7, 30], [5, 34], [8, 27], [6, 32], [9, 29], [5, 26], [5, 34]],
  [[6, 32], [8, 28], [5, 30], [7, 34], [6, 26], [9, 31]],
  [[9, 27], [5, 31], [7, 34], [6, 28], [8, 30], [5, 26], [5, 32]],
  [[5, 29], [7, 33], [6, 27], [8, 31], [5, 34], [9, 28]],
];
const drawBookCase = (s, { F, hatch }) => {
  quad(s, F, [[5, 26, 10], [91, 26, 10], [91, 26, 170], [5, 26, 170]], { fill: hatch, sw: W.fine });
  bx(s, F, 0, 0, 0, 96, 10, 28, { hatch, sw: W.heavy });                     // the plinth
  bx(s, F, 0, 0, 0, 5, 176, 28, { hatch, sw: W.heavy });                     // the two sides …
  bx(s, F, 91, 0, 0, 5, 176, 28, { hatch, sw: W.heavy });
  bx(s, F, 0, 0, 170, 96, 6, 28, { hatch, sw: W.heavy });                    // … and the top
  SHELF_Z.forEach((z0, tier) => {
    if (tier > 0) bx(s, F, 5, 0, z0 - 4, 86, 4, 26, { sideFill: 'flat', sw: W.fine });
    let x = 8;
    for (const [w, h] of SPINES[tier]) {
      line(s, F, [[x, 4, z0], [x + w, 4, z0], [x + w, 4, z0 + h], [x, 4, z0 + h]],
        { sw: W.hair, close: true, cap: false });
      x += w + 0.8;
    }
    // one leaner and one flat stack per shelf — what a shelf looks like when someone used it.
    // ⚠️ THESE TWO ARE THE END OF THE RUN AND THEY COST 31 cm: the leaner reaches `x + 13` and the
    // widest flat book `x + 31`. That is the whole of the budget in the comment above — a spine added
    // to `SPINES` pushes both of them right, and past 91 they are drawn behind the side panel or off
    // the case entirely.
    line(s, F, [[x, 4, z0], [x + 7, 4, z0], [x + 13, 4, z0 + 26], [x + 6, 4, z0 + 28]],
      { sw: W.hair, close: true, cap: false });
    for (let i = 0; i < 3; i += 1) {
      const z = z0 + i * 4.5;
      line(s, F, [[x + 15, 4, z], [x + 15 + 16 - i * 2, 4, z], [x + 15 + 16 - i * 2, 4, z + 4],
        [x + 15, 4, z + 4]], { sw: W.hair, close: true, cap: false });
    }
  });
};
export const bookCase = (opts = {}) => machine('book-case', opts, drawBookCase);

// M12 DECK TURRET · 110 × 88 × 146 · "Bolted to the deck plate. It remembers the raid."
//
// Swivel base, head, BARREL — and the barrel is drawn as a closed member with two rails and a breech
// and a muzzle cross, not as a line, because a line is a mast and a turret is not a mast. The band
// near the muzzle is the accent, in the same register the reactor's hazard plate uses it: this is the
// end of the thing that kills.
const BARREL_P0 = [48, 44, 54];
const BARREL_P1 = [104, 44, 138];
const drawDeckTurret = (s, { F, hatch }) => {
  cyl(s, F, 44, 44, 0, 10, 42, { sw: W.heavy });
  for (const a of [0.4, 1.9, 3.5, 5.1]) {
    disc(s, F, 44 + 33 * Math.cos(a), 44 + 33 * Math.sin(a), 10, 3.4, { fill: 'none', sw: W.hair });
  }
  cyl(s, F, 44, 44, 10, 30, 34, { sw: W.mass, cap: false });
  hoop(s, F, 44, 44, 30, 34, { sw: W.fine });                                // the swivel seam
  taper(s, F, 44, 44, 30, 64, 32, 16, { sw: W.mass });                       // the head
  bx(s, F, 0, 26, 22, 22, 34, 34, { hatch, sw: W.mid });                     // the feed box
  curve(s, F, [22, 40, 50], [34, 42, 54], [44, 44, 54], { sw: W.mid });      // …and its belt
  bx(s, F, 30, 28, 60, 14, 8, 12, { sideFill: 'flat', sw: W.fine });         // the optic
  // the barrel: two rails 6.6 cm apart in the x–z plane, closed at the breech and at the muzzle
  line(s, F, [[51.3, 44, 51.8], [107.3, 44, 135.8], [100.7, 44, 140.2], [44.7, 44, 56.2]],
    { sw: W.mass, close: true, cap: false, fill: PAPER });
  line(s, F, [[98.9, 44, 123.2], [92.3, 44, 127.6]], { sw: W.mid, stroke: ATTEND });
};
export const deckTurret = (opts = {}) => machine('deck-turret', opts, drawDeckTurret);

// M13 SLEEPER POD · ∅84 × 194 · "Upright, single berth. The window is the whole of the interface."
//
// A capsule whose FROSTED WINDOW is the identity — the warm piece was "a steel capsule with a frosted
// cyan window", and everything a player learned from it is the pane. It is drawn EMPTY: this row is
// COSMETIC and carries no occupant bit, so a figure behind the glass would be the drawing claiming a
// fact the piece does not hold (`cryo.js`'s two capsules are the pieces that DO say which of two
// things is true of a tile, and they say it with two rows).
//
// ⚠️ THE PANE SITS AT y = 10, NOT AT y = 0, and that is geometry rather than taste: the shell is a
// ∅76 cylinder, so at the pane's own left edge (x = 22) the shell's surface is already 9.7 cm back
// from the box's front plane. A pane at y = 0 would stand PROUD of the capsule it is set into.
const drawSleeperPod = (s, { F }) => {
  cyl(s, F, 42, 42, 0, 12, 40, { sw: W.heavy });
  cyl(s, F, 42, 42, 12, 168, 38, { sw: W.mass, cap: false });
  hoop(s, F, 42, 42, 168, 38, { sw: W.mid });                                // the hood seam
  taper(s, F, 42, 42, 168, 190, 38, 14, { sw: W.mass });
  quad(s, F, [[22, 10, 44], [62, 10, 44], [62, 10, 150], [22, 10, 150]],
    { fill: PAPER_FLAT, sw: W.mid });
  line(s, F, [[26, 10, 48], [58, 10, 48], [58, 10, 146], [26, 10, 146]],
    { sw: W.hair, close: true, cap: false, opacity: 0.6 });
  for (const [x, z] of [[31, 54], [42, 62], [52, 52], [37, 72]]) {           // frost
    line(s, F, [[x - 4, 10, z], [x, 10, z + 5], [x + 4, 10, z]], { sw: W.hair, opacity: 0.5 });
  }
  line(s, F, [[30, 10, 134], [42, 10, 112]], { sw: W.hair, opacity: 0.45 }); // the one specular
  // the status plate — there IS a readout here, and it is not legible at the size a tile draws
  quad(s, F, [[30, 10, 24], [54, 10, 24], [54, 10, 38], [30, 10, 38]],
    { fill: PAPER_FLAT, sw: W.mid, stroke: ATTEND });
  for (const z of [29, 33]) line(s, F, [[34, 10, z], [46, 10, z]], { sw: W.hair, opacity: 0.5 });
  for (const z of [20, 26, 32]) line(s, F, [[16, 6, z], [30, 6, z]], { sw: W.hair, opacity: 0.45 });
};
export const sleeperPod = (opts = {}) => machine('sleeper-pod', opts, drawSleeperPod);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The painter map + the frame, for a caller that wants to draw ON a machine
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every machine's PAINTER, keyed by itemId — the same function its exported builder runs.
 * DERIVED nowhere: each entry is the named `draw…` const above, so a row cannot point at another
 * row's painting. That is the SWAP, and `wrecked.test.js` is the only guard in this repo that can see
 * it: every other assertion here is satisfied just as happily by a piece drawing the wrong picture.
 */
export const DRAW = Object.freeze({
  'reactor-plant': drawReactorPlant,
  'solar-wing': drawSolarWing,
  'bottle-rack': drawBottleRack,
  'reclaimer-stack': drawReclaimerStack,
  'paste-column': drawPasteColumn,
  'med-cot': drawMedCot,
  'fab-cell': drawFabCell,
  'ring-array': drawRingArray,
  'dish-mast': drawDishMast,
  'plant-pot': drawPlantPot,
  'book-case': drawBookCase,
  'deck-turret': drawDeckTurret,
  'sleeper-pod': drawSleeperPod,
});

/**
 * Paint machine `id` INTO an existing scene, then hand the same scene and the same frame to `extra`,
 * so a caller can add marks in the piece's own centimetres rather than guessing at pixels.
 *
 * This is how the thirteen post-raid twins are drawn (`client/src/items/wrecked.js`): a damaged
 * machine is the SAME machine with damage on it, and re-running the pristine painter is the only way
 * to guarantee that stays true when the pristine drawing changes. It is `fittings.paintFitting`'s
 * exact contract, on this module's own frame and specs.
 */
export function paintMachine(s, id, extra, state) {
  const draw = DRAW[id];
  if (!draw) return;
  const env = envFor(s, id, state);
  draw(s, env);
  if (typeof extra === 'function') extra(s, env);
}
