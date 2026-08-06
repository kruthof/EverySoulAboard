// THE NINE PAPER RESOURCES — the ground stacks of the `items` wire channel, redrawn in the owner's
// paper/ink dialect on the cabinet-oblique kit (`client/src/render/oblique.js`).
//
// Every builder is a pure `(opts) -> string` SVG-`<g>`-fragment builder with exactly the contract the
// rest of `client/src/items/*` holds (helpers.js:1-16): no DOM, no clock, no randomness, same input
// ⇒ byte-identical output, def ids namespaced by `idPrefix`. `index.js` registers them; nothing here
// imports `index.js`, so the dependency runs one way and the set reverts by reverting one file plus
// its registry rows.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY A FILE OF ITS OWN AND NOT NINE MORE `fittings.js` BUILDERS. A fitting is a thing a player
// BUILDS: it has a catalogue card, a dimension line the owner drew, and a `SPECS` row transcribed
// from it. A resource is loose matter LYING on a floor tile — nothing places it, the sim's haul board
// moves it, its COUNT is real information, and the owner's catalogue has no card for any of the nine.
// So every centimetre below is REPO-AUTHORED against the object rather than transcribed, and saying
// that in a separate module is cheaper than saying it nine times inside one that means the opposite.
// It also keeps the parallel redraw lanes off each other's files.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SPACE. Identical to `fittings.js`'s and DERIVED FROM THE SAME KIT, not re-invented: each piece
// declares its footprint in `SPECS` (`w × d × h` centimetres) and places every part through
// `oblique.roomFrame(...).project(xCm, yCm, zCm)` — x across, y BACK into the picture, z up. The
// per-piece scale is derived exactly as a fitting's is: a piece occupies `w + 0.4·d` cm across and
// `h + 0.6·d` cm up (the oblique's own two ratios), and the scale is whatever makes the larger of
// those fill `BOX`. ⚠️ GEOMETRY MUST THEREFORE STAY INSIDE `0..w`, `0..d`, `0..h` — a part authored
// outside the box is still drawn but is not counted when the piece is centred, so it clips.
//
// ⚠️ THE DERIVATION IS DUPLICATED HERE AND THAT IS DELIBERATE, WITH THE COST PAID BY A TEST.
// `fittings.frameFor(id)` takes an ID and reads `fittings.SPECS`, so it cannot be handed a resource;
// `extents`/`scaleOf` are private there. Copying four lines was chosen over exporting three more
// names from a file four parallel lanes are appending to — an added export that two lanes both add
// is a merge conflict that resolves into a duplicate binding and a module that will not load (the
// "merge collision on the same exported name" scar). What stops the copy DRIFTING is
// `client/test/paper-resources.test.js`: it builds a frame from a spec whose `w/d/h` are a real
// fitting's and asserts the projections agree with `fittings.frameFor` to the digit. If the drawing
// rule ever changes on one side, that test is red.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// LEGIBILITY IS BY SILHOUETTE, AND AT TILE SIZE IT IS THE ONLY THING LEFT. These nine are the pieces
// a player sees MOST — every hauled pile on every deck — and they are drawn at ~22–48 px in the Room
// Zoom's ground layer and smaller again on the ship plate. In the paper dialect hue cannot separate
// anything at all: there are three colours in the whole language and two of them are paper and ink.
// So the nine are separated by SHAPE, and each one owns a shape none of the others may use:
//
//   SPOIL HEAP     one smooth DOME over a level footprint ellipse (nothing straight in it)
//   TUBER CRATE    an oblique BOX with round crowns heaped over its top face
//   PLATE OFFCUT   flat JAGGED polygons crossed at angles + one standing on edge (all straight)
//   GEAR SET       radial TEETH — one gear level on the floor, one standing true-circle
//   CONTROL CARD   two thin orthogonal PLATES with a comb of pins (the only stacked flats)
//   SEAL SET       level ANNULI — the only rings with a bore through them
//   ICE BLOCK      an IRREGULAR faceted body — no parallel edges, no arcs, no hatch on a FACE
//   BODY BAG       one long LOW form, 190 cm end to end — nothing else is a third that long
//   TURNINGS       open stroked CURLS — the only piece with no filled body at all
//
// That list is not decoration: `client/test/paper-resources.test.js` measures a pairwise
// shape-vocabulary distance across all nine and fails if any two collapse onto the same profile.
// (CLAUDE.md's sixth trap is a kind predicate defeated by art that reads as something else; a set
// whose members cannot be told apart at the size they are shown is the same defect one layer down.)
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ NO OXBLOOD. NOT ONE PIECE, NOT ONE TWIN. The charter gives the dialect exactly one accent and
// exactly one job for it — "attention, faults, queued orders, emotional beats" — and a pile of
// regolith on a floor is none of those. It is a thing lying there. Spending the accent on the most
// numerous objects in the game would leave nothing for the marks that are ABOUT them: a queued haul,
// a blocked order, a fault. ⇒ The rule is stated positively so it can be measured: the tile under a
// pile carries oxblood only when something is WRONG or ORDERED there, and then it is the only
// oxblood in the picture. `paper-resources.test.js` scans all nine pieces and all eight twins for
// `ATTEND` and fails on any hit, with a live non-vacuity control (`battery-bank` really does emit it).
//
// ⭐ AND THE PIECE THAT SETTLED IT IS THE CORPSE. A dead crew member is the strongest emotional beat
// this game has, which is exactly the argument for the accent and exactly why it is refused: death
// is not an ALERT. It is not a fault to be cleared, not an order to be filled, not a state that
// wants the eye pulled to it. The bag is drawn the way the rest of the paper is drawn — ink line on
// paper — and its ID tag is left BLANK, which is `resources.js:314-322`'s own identity decision kept
// verbatim: this builder is a pure function of `opts` and knows nothing about who died, so any name
// it drew would be the same name for every corpse on the ship. "There is a name on this, and it is
// not mine to write."
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { item, TILE, INK, PAPER } from './helpers.js';
import {
  box as obox, roomFrame, HATCH, PAPER_FLAT, n as nn, DEPTH_RATIO, PX_PER_CM,
} from '../render/oblique.js';
import { W, BOX, ink, line, disc, path, curve, geometryFor } from './fittings.js';

/** The oblique's two ratios as MAGNITUDES — read from the kit, never re-typed. `DEPTH_RATIO.y` is
 *  −0.6 because SVG's "up" is negative; every use here wants the size of the step, not its sign. */
const DX = DEPTH_RATIO.x;
const DY = Math.abs(DEPTH_RATIO.y);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SPECS — every pile's drawn box in centimetres, and why it is that size
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ ONE TILE IS ONE METRE (`roomzoom-view.js`'s `M_PER_TILE`), so these numbers are claims about
// how much floor a pile covers and they are meant to be argued with. Each row's comment carries the
// physical object the number came from. Where the DRAWING is bigger than the object (a heap of
// tubers standing proud of its crate, a tag hanging off a bag) the box is the DRAWING's, because
// only the picture is centred — the comment then names both.
//
// ⛔ AND THE HONEST LIMIT, SAID OUT LOUD: the ground-item layer does NOT draw these at true size
// today. `room-model.js`'s `itemStackSvg` gives every stack the same box (`SPRITE_SIDE_1` × the
// tile), so a 190 cm bag and a 36 cm nest of turnings are drawn the same width and only their
// PROPORTIONS differ. That is the shape the layer already had, and changing it is a decision about
// count badges and tile overflow that this package does not own. What the centimetres DO buy today
// is (a) each piece's internal proportion — a crate really is 46 wide by 20 high — and (b) an honest
// `size` hint in the registry, derived below at one shared scale exactly as `fittings.SIZES` is, so
// the eighty-nine rows are comparable with each other. FILED, not chased.
export const SPECS = Object.freeze({
  // A shovelled heap of spoil at its angle of repose (~40° for dry basaltic fines): an 80 cm base
  // circle carries a 34 cm crown and no more. Round footprint ⇒ it has no heading, so it draws level.
  'spoil-heap':    { w: 80, d: 80, h: 34, round: true },
  // A shallow field crate, 46 × 34 × 20 cm — the two-hand carry — heaped with tubers to 34 cm.
  // The box is 60 wide because one tuber has rolled onto the deck to the crate's left; the OBJECT is
  // the 46, the PICTURE is the 60, and only the picture is centred.
  'tuber-crate':   { w: 60, d: 34, h: 34 },
  // Torn hull-plate offcuts. The longest plate is 74 cm, which is what one person carries flat;
  // the heap is three of them crossed, plus one stood on edge, and stands 24 cm.
  'plate-offcut':  { w: 74, d: 56, h: 24 },
  // A ∅30 cm actuator gear lying flat, a ∅22 cm gear standing against it, a 34 cm spanner across.
  // ∅30 is the ring gear a ship's door actuator carries; it is the largest part one crew can lift.
  'gear-set':      { w: 44, d: 40, h: 26 },
  // A rack controller card, 30 × 22 × 4 cm (a half-width 3U board). Two stacked with the upper one
  // offset 4 cm, its chip standing 3 cm proud: 34 × 24 × 12 over the pair.
  'control-card':  { w: 34, d: 24, h: 12 },
  // A hatch O-ring at ∅28 cm (the seal on a 60 cm inspection hatch) and a ∅20 spare, both lying
  // flat, with a 16 cm gasket card leaning against them at 14 cm.
  'seal-set':      { w: 44, d: 36, h: 14 },
  // Hull ice hacked out in one block — a 46 × 40 cm face 26 cm deep is about 30 kg, one crew
  // member's carry, which is what makes it a unit at all.
  'ice-block':     { w: 46, d: 40, h: 26 },
  // A human body bag: 190 cm end to end, 56 cm across, 30 cm at the chest.
  'body-bag':      { w: 190, d: 56, h: 30 },
  // The swarf off one stripped device (`deconstruct.device_swarf` pays 1), as a loose nest of
  // curls about 36 cm across and 18 cm high — a two-hand scoop, which is how it is hauled.
  'turnings':      { w: 36, d: 30, h: 18 },
});

/** Every paper-resource id, in the order the sim's `ItemKind` enum names them. */
export const PAPER_RESOURCE_IDS = Object.freeze(Object.keys(SPECS));

/** `[across, up]` in centimetres — the oblique's two ratios applied. No piece here hangs on a wall,
 *  so there is no `z0` term: a pile starts on the floor by definition. */
function extents(spec) {
  return [spec.w + DX * spec.d, spec.h + DY * spec.d];
}

/** The derived px-per-cm for a piece: whatever makes its larger extent fill `BOX`. */
function scaleOf(spec) {
  const [ex, ey] = extents(spec);
  const m = Math.max(ex, ey);
  return m > 0 ? BOX / m : 1;
}

/**
 * A frame for an ARBITRARY spec — the one derivation, exported so the drift test can drive it with a
 * fitting's dimensions and compare against `fittings.frameFor`. The origin is placed so the piece's
 * drawn band is CENTRED on (0,0), which is the coordinate model every builder in this directory
 * shares (helpers.js:9-15).
 */
export function frameForSpec(spec, facing) {
  if (!spec || !(spec.w >= 0) || !(spec.d >= 0) || !(spec.h >= 0)) return undefined;
  // ⛔ THROUGH `fittings.geometryFor`, NOT THE PRIVATE COPY BELOW (the merge lane/build-ghost ×
  // lane/paper-resources, 2026-08-05). This module declared its own `extents`/`scaleOf` and built a
  // facing-less `roomFrame` — the FOURTH such copy, and the same asymmetry mutation J11 caught on
  // the second catalogue: a rotation verb that works on some pieces and silently does nothing on
  // these. ⭐ THE TWO ORIGINS ARE THE SAME NUMBER HERE, verified rather than assumed: this module's
  // origin was `y: (k·ey)/2` and `geometryFor`'s is `y: k·(ey/2 + z0)`, and NO spec in this file
  // carries a `z0` at all ("a pile starts on the floor by definition", the SPECS header), so
  // `z0 === 0` and the two expressions are identical. Byte-compared across every piece.
  const g = geometryFor(spec, facing);
  return g === undefined ? undefined : g.frame;
}

/** Piece `id`'s own frame. `facing` (0..3) is forwarded; absent/0 is the identity. */
export function frameFor(id, facing) {
  const spec = SPECS[id];
  return spec ? frameForSpec(spec, facing) : undefined;
}

/**
 * The registry `size` hint — the piece's drawn footprint in the mock-px space every other `ITEMS`
 * row states its size in. DERIVED from `SPECS` at ONE SHARED SCALE (`PX_PER_CM.catalogue`, the same
 * rule `fittings.SIZES` uses), never transcribed, so the numbers are comparable across the whole
 * registry rather than being each piece's tile proportion.
 */
export const SIZES = Object.freeze(PAPER_RESOURCE_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = PX_PER_CM.catalogue;
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

/**
 * A piece's DRAWN extent in the px the builder really emits — `BOX` in the larger axis by
 * construction. Exported for the same reason `fittings.BOX_EXTENT` is: a rule about ink LENGTH
 * inside a tile must be stated against the drawing scale, and a caller re-deriving `scaleOf` from
 * `SPECS` and `BOX` is a second authority on it.
 */
export const BOX_EXTENT = Object.freeze(PAPER_RESOURCE_IDS.reduce((out, id) => {
  const [ex, ey] = extents(SPECS[id]);
  const k = scaleOf(SPECS[id]);
  out[id] = Object.freeze({ w: Math.max(1, Math.round(k * ex)), h: Math.max(1, Math.round(k * ey)) });
  return out;
}, {}));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The primitives — everything below draws in centimetres, through the frame
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `ink` / `line` / `disc` / `path` / `curve` come from `fittings.js`, which exports them for exactly
// this ("the drawing vocabulary, for the same caller"). The four below are the ones it keeps private;
// they are LOCAL and unexported here, so two lanes adding the same helper cannot collide on a name.

/**
 * The 45° side-face hatch as this fragment's own `<pattern>`. Geometry from `oblique.HATCH` only —
 * a literal here would be a second spelling of the dialect. `s.pat` numbers the def off the caller's
 * `idPrefix`, which is what keeps two placements of one piece from sharing a def id.
 */
function hatchPaint(s) {
  return s.pat(
    `<rect width="${nn(HATCH.period)}" height="${nn(HATCH.period)}" fill="${HATCH.ground}"/>`
    + `<path d="M0 0 L0 ${nn(HATCH.period)}" stroke="${HATCH.ink}" stroke-width="${nn(HATCH.width)}"`
    + ` opacity="${nn(HATCH.opacity)}"/>`,
    { w: HATCH.period, h: HATCH.period, transform: `rotate(${nn(HATCH.angle)})` },
  );
}

/** A filled + stroked polygon through cm points — a facet, a plate, a card. */
function quad(s, F, pts, o = {}) {
  ink(s, path(F, pts, true), { fill: o.fill == null ? PAPER : o.fill, sw: W.fine, cap: false, ...o });
}

/**
 * A box standing at `(x, y)` with its base at `z` — straight through `oblique.box()`, so the
 * winding, the face order and the depth vector are the kit's and are never re-derived here.
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
    opacity: o.opacity,
  }));
}

/**
 * An ELLIPSE IN THE FRONTAL PLANE (x–z at depth `y`). In cabinet oblique the picture plane is
 * undistorted, so this is drawn exactly as authored — which is the whole reason it is a different
 * primitive from `disc`. `disc` is for a round thing lying on the FLOOR (it draws level, `ry` =
 * 0.6·`rx`); this is for a round thing standing UP, like a tuber's silhouette or a gear on edge.
 * Confusing the two is how a piece comes to look squashed for no reason a string could show.
 */
function frontOval(s, F, x, y, z, rxCm, ryCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  s.ellipse({
    cx, cy, rx: F.s * rxCm, ry: F.s * ryCm,
    fill: o.fill === undefined ? PAPER : o.fill,
    stroke: o.stroke == null ? INK : o.stroke,
    sw: o.sw == null ? W.fine : o.sw,
    opacity: o.opacity,
  });
}

/**
 * A TOOTHED RING, swept about an axis. `plane` is `'level'` (the ring lies on the floor: the teeth
 * sweep in x–y and the frame projects them into the oblique ellipse) or `'front'` (the ring stands
 * up: the teeth sweep in x–z and project to a TRUE circle, undistorted).
 *
 * DEEP teeth and FEW of them, which is `resources.js`'s own measured finding kept: at the ~22 px a
 * stack is finally drawn at, a shallow many-toothed rim averages back into a plain circle, and a
 * plain circle in this set is a seal. The 0.16/0.34/0.5 fractions are the tooth profile — tip
 * narrower than root — so the rim reads as teeth rather than as a star.
 */
function gearPath(F, plane, cx, cy, cz, rOut, rIn, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    for (const [rad, frac] of [[rIn, 0], [rOut, 0.16], [rOut, 0.34], [rIn, 0.5]]) {
      const t = a + step * frac;
      const u = rad * Math.cos(t);
      const v = rad * Math.sin(t);
      const [px, py] = plane === 'front'
        ? F.project(cx + u, cy, cz + v)
        : F.project(cx + u, cy + v, cz);
      pts.push(`${pts.length ? 'L' : 'M'}${nn(px)} ${nn(py)}`);
    }
  }
  return `${pts.join(' ')} Z`;
}

/**
 * An OPEN spiral in the FRONTAL plane — the swarf ribbon's centreline, as a polyline.
 *
 * `M…L…` and NEVER closed with `Z`: a closed path is a ring, a ring is the SEAL SET, and the whole
 * separation of TURNINGS from every other piece here is that its curls are open — paper shows
 * through the gap. 20 segments per revolution is chosen against the downscale: coarser than that and
 * the outermost turn shows its corners and the ribbon reads as a bent bar, i.e. as an offcut.
 */
function curlPath(F, cx, cy, cz, r0, r1, a0, sweep) {
  const steps = Math.max(8, Math.round((Math.abs(sweep) / (Math.PI * 2)) * 20));
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = a0 + sweep * t;
    const r = r0 + (r1 - r0) * t;
    const [px, py] = F.project(cx + r * Math.cos(a), cy, cz + r * Math.sin(a));
    pts.push(`${i ? 'L' : 'M'}${nn(px)} ${nn(py)}`);
  }
  return pts.join(' ');
}

/**
 * The painter's environment: the frame, the spec and the hatch.
 *
 * ⚠️ `hatch` IS A GETTER, for `fittings.envFor`'s measured reason: three of the nine never touch a
 * hatched face, and registering a `<pattern>` they never reference would leave an unused def in every
 * one of their fragments (which the twin suite already treats as a defect). ⛔ DO NOT SPREAD THIS
 * OBJECT — a spread EVALUATES getters and would register the pattern for all nine.
 */
function envFor(s, id, state, facing) {
  let hp = null;
  return {
    F: frameFor(id, facing),
    spec: SPECS[id],
    state,
    get hatch() { if (hp === null) hp = hatchPaint(s); return hp; },
  };
}

/** The harness: an item fragment whose painter draws in the piece's own centimetres. */
function resource(id, opts, paint) {
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state, env.facing)); });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 01 SPOIL HEAP · Regolith · ∅80 × 34 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// The one smooth silhouette in the set. Construction: the footprint is a real circle on the floor,
// so it draws LEVEL (the catalogue's own round-objects rule) and its BACK half stays visible above
// the mound — that arc is what says "this is round on the deck" rather than "this is a lump". The
// mound itself closes the FRONT half of that same ellipse with two crest curves, so the heap and its
// footprint cannot disagree about where the pile meets the floor.
//
// The away flank is hatched, exactly as every fitting's side face is; it is bounded ABOVE by the
// crest and BELOW by a line at the ellipse's own centre row, which is inside the mound at every x it
// spans, so the hatch can never leak past the silhouette.
const drawSpoilHeap = (s, { F, hatch }) => {
  const R = 38;
  const [cx, cy] = F.project(40, 40, 0);
  const rx = F.s * R;
  const ry = DY * F.s * R;
  /** a point on the heap's own section plane (the frame's mid-depth), in cm */
  const P = (x, z) => F.project(x, 40, z);
  const seg = ([x, z], [cxk, czk]) => ` Q${nn(P(cxk, czk)[0])} ${nn(P(cxk, czk)[1])} ${nn(P(x, z)[0])} ${nn(P(x, z)[1])}`;
  const L = P(2, 0);
  const Rt = P(78, 0);
  disc(s, F, 40, 40, 0, R, { fill: PAPER, sw: W.hair });
  // THE CREST, right base → apex → left base. Four segments and NOT two: a two-curve dome is a
  // perfect lens and reads as a stone, and a heap of tipped spoil always carries a shoulder where
  // the last load ran out. The shoulder is on the right, which is also the flank the hatch falls on.
  const crest =
    seg([58, 21], [71, 12]) + seg([38, 34], [48, 32]) + seg([15, 19], [26, 32]) + seg([2, 0], [7, 10]);
  ink(s,
    `M${nn(L[0])} ${nn(L[1])} A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(Rt[0])} ${nn(Rt[1])}${crest} Z`,
    { fill: PAPER, sw: W.mid, cap: false });
  // THE AWAY FLANK, hatched like every other turned-away face in the dialect: the CRESCENT between
  // the crest's own right half and the chord that closes it. ⛔ NOT A WEDGE DOWN TO THE MIDDLE OF
  // THE MOUND — the first render drew exactly that and it came out as a pie slice cut into a dome,
  // which is a diagram of a heap rather than a heap. A crescent hugging the upper-right edge is what
  // a turned-away face on a curved body looks like.
  ink(s,
    `M${nn(Rt[0])} ${nn(Rt[1])}${seg([58, 21], [71, 12])}${seg([38, 34], [48, 32])}`
    + `${seg([52, 12], [46, 26])}${seg([78, 0], [66, 4])} Z`,
    { fill: hatch, sw: W.hair, cap: false });
  // ⛔ NOTHING IS DRAWN ON THE CROWN. Two creases were, and at 230 px the heap had a face — two
  // grains for eyes and a crease for a mouth. Pareidolia is not a matter of taste at this scale: a
  // smooth closed body with marks near its middle reads as a face, and once seen it cannot be
  // unseen. Everything that is not the silhouette now sits BELOW the front arc, on the deck.
  // Spilled grains, level, because they lie on the floor.
  disc(s, F, 6, 6, 0, 3, { sw: W.fine });
  disc(s, F, 31, 2, 0, 2.2, { sw: W.fine });
  disc(s, F, 74, 10, 0, 2.6, { sw: W.fine });
};

export const spoilHeap = (opts = {}) => resource('spoil-heap', opts, drawSpoilHeap);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 02 TUBER CRATE · Potato · 46 × 34 × 20 cm crate, heaped to 34
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE CRATE IS THE PIECE, NOT THE POTATOES. Loose tubers on a floor are three tan ovals, and in a
// two-colour dialect three ovals are indistinguishable from three spoil lumps at 22 px — the warm set
// could lean on hue for this piece and this one cannot. A shallow field crate gives it a hard
// orthogonal base no other resource has, and the round crowns standing proud of the top face are the
// contrast that says FOOD rather than PARTS. It is also honest: this is how a hold moves potatoes.
const drawTuberCrate = (s, { F, hatch }) => {
  bx(s, F, 14, 0, 0, 46, 20, 34, { hatch, sw: W.mid });
  // two slat gaps across the front face — a crate, not a box
  line(s, F, [[14, 0, 7], [60, 0, 7]], { sw: W.hair, opacity: 0.7 });
  line(s, F, [[14, 0, 14], [60, 0, 14]], { sw: W.hair, opacity: 0.7 });
  // corner posts
  line(s, F, [[17, 0, 0], [17, 0, 20]], { sw: W.fine });
  line(s, F, [[57, 0, 0], [57, 0, 20]], { sw: W.fine });
  // the heap: four tubers standing proud of the top face (z = 20), drawn as FRONT-plane silhouettes
  const tuber = (x, y, z, rx, ry, eyes) => {
    frontOval(s, F, x, y, z, rx, ry, { sw: W.fine });
    // the eyes — front-plane, because they sit on the tuber's own silhouette and not on the deck
    for (const [ex, ez] of eyes) frontOval(s, F, x + ex, y, z + ez, 0.9, 0.9, { fill: INK, sw: 0 });
  };
  tuber(26, 12, 25, 8, 6, [[-2, 1.5], [2.5, -1]]);
  tuber(40, 9, 27, 9, 6.5, [[-3, 1], [2, 2]]);
  tuber(51, 14, 25, 7.5, 5.5, [[-1.5, 1.5]]);
  // ⛔ ONE THAT ROLLED OFF, AND IT SITS TO THE **LEFT**, WHICH IS THE ONLY CLEAR DECK THERE IS.
  // The first draft put it in front of the crate at (40, 3, 4.5) and it drew straight over the front
  // face — a tuber-shaped hole in the crate, which is exactly what it looked like. Nothing at x < 12
  // can collide: the oblique only ever displaces a part UP and to the RIGHT, so the deck to the left
  // of a floor-standing box is the one region no face of it can reach.
  tuber(5, 3, 4.5, 4.5, 3.8, [[-1.5, 1]]);
};

export const tuberCrate = (opts = {}) => resource('tuber-crate', opts, drawTuberCrate);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 03 PLATE OFFCUT · Scrap · 74 × 56 × 24 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// EVERY EDGE IS STRAIGHT AND NO EDGE IS PARALLEL TO ITS NEIGHBOUR. That is the entire separation
// from the heap beside it: an offcut pile is torn plate, and torn plate is polygons. Three lie flat
// at three heights (so the pile has thickness without needing a stack), one stands on edge — which
// is what gives the silhouette its one vertical, and what stops the piece reading as a floor decal.
const drawPlateOffcut = (s, { F, hatch }) => {
  /**
   * ⭐ A PLATE IS A SLAB, NOT AN OUTLINE, and the first render of this piece is why the helper
   * exists. Three paper polygons lying on paper drew CRUMPLED PAPER — the one material an offcut
   * heap must not be. Each plate is therefore drawn twice, `t` cm apart: the lower copy in the flat
   * tone, the upper in paper, and the sliver between them is the plate's own THICKNESS. Two
   * outlines, one object, and the read at 22 px goes from "torn sheet" to "cut steel".
   */
  const slab = (pts, z, t, o = {}) => {
    quad(s, F, pts.map(([x, y]) => [x, y, z]), { fill: PAPER_FLAT, sw: W.fine, ...o });
    quad(s, F, pts.map(([x, y]) => [x, y, z + t]), { fill: PAPER, sw: o.sw == null ? W.mid : o.sw });
  };
  // TWO flats, not three: they cross at one angle, so the pile has a shape rather than a texture.
  slab([[2, 4], [22, 3], [26, 8], [30, 2], [42, 2], [54, 16], [36, 30], [8, 22]], 0, 2);
  slab([[26, 22], [46, 18], [49, 24], [53, 16], [64, 14], [72, 32], [50, 44], [30, 40]], 6, 2.5);
  // THE STANDING SHEET — the piece's one vertical, leaning back off the heap. Hatched, because a
  // sheet seen on edge is showing its cut face and that is what a hatched face means here.
  quad(s, F, [[6, 30, 0], [10, 38, 24], [30, 34, 22], [26, 26, 0]], { fill: hatch, sw: W.mid });
  line(s, F, [[10, 38, 24], [30, 34, 22]], { sw: W.mid });
  // a folded bracket — welded angle, thrown on top
  line(s, F, [[44, 22, 9], [58, 26, 9], [58, 26, 20]], { sw: W.heavy });
  // and one small offcut, still square, on the deck at the front
  slab([[46, 46], [60, 48], [58, 54], [44, 52]], 0, 1.5, { sw: W.fine });
};

export const plateOffcut = (opts = {}) => resource('plate-offcut', opts, drawPlateOffcut);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 04 GEAR SET · Parts · 44 × 40 × 26 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ TWO GEARS IN TWO PLANES, AND THE PAIR IS THE POINT. One lies flat on the deck, so it draws
// LEVEL — the catalogue's round-objects rule, and the frame turns its teeth into the correct oblique
// ellipse with no special case. The other STANDS, leaning, so it draws as a TRUE circle: cabinet
// oblique leaves the picture plane undistorted. Together they say "these things are round in two
// different ways", which is a fact about the objects and reads at any size; a single flat gear reads
// as a seal with a serrated edge.
const drawGearSet = (s, { F }) => {
  ink(s, gearPath(F, 'level', 17, 20, 0, 15, 10.2, 9), { fill: PAPER, sw: W.mid, cap: false });
  disc(s, F, 17, 20, 0, 4.5, { sw: W.fine });
  // the standing gear, leaning on the first — a true circle, teeth and all
  ink(s, gearPath(F, 'front', 32, 12, 11, 11, 7.5, 8), { fill: PAPER, sw: W.mid, cap: false });
  frontOval(s, F, 32, 12, 11, 3.2, 3.2, { sw: W.fine });
  // THE SPANNER, lying flat: a 34 cm shaft with an open jaw at each end. Drawn as a closed OUTLINE
  // rather than as a stroked line — a single stroke at this scale is a stray mark, which is what the
  // first render of it was, and a tool with a body is the thing that says "these are parts".
  quad(s, F, [
    [2, 1, 0.5], [6, 0, 0.5], [9, 3, 0.5], [6.5, 4.5, 0.5], [32, 6.5, 0.5], [34, 3.5, 0.5],
    [38, 6, 0.5], [35, 9.5, 0.5], [31, 8, 0.5], [5.5, 6, 0.5],
  ], { sw: W.fine });
  // a loose nut, level on the deck, clear of both gears
  disc(s, F, 40, 30, 0, 3.4, { sw: W.fine });
  disc(s, F, 40, 30, 0, 1.8, { sw: W.hair });
};

export const gearSet = (opts = {}) => resource('gear-set', opts, drawGearSet);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 05 CONTROL CARD · ControllerModule · 34 × 24 × 12 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// The only stacked FLATS in the set: two thin orthogonal plates, offset, with the comb of edge pins
// along the front of the upper one. The comb is what makes a rectangle a BOARD and not a lid — it is
// the same decision the warm piece made and it survives the redraw because it is a silhouette fact
// rather than a colour one. The chip stands 3 cm proud so the top face has something on it at size.
const drawControlCard = (s, { F, hatch }) => {
  bx(s, F, 0, 2, 0, 30, 4, 22, { hatch, sw: W.fine });
  bx(s, F, 4, 0, 4, 30, 4, 22, { hatch, sw: W.fine });
  // the edge comb — seven pins along the upper card's front edge, on its top face
  for (let i = 0; i < 7; i += 1) {
    const x = 6 + i * 3.6;
    line(s, F, [[x, 0, 8], [x, 5, 8]], { sw: W.hair });
  }
  // two traces and the chip
  line(s, F, [[6, 8, 8], [32, 8, 8]], { sw: W.hair, opacity: 0.7 });
  line(s, F, [[10, 8, 8], [10, 20, 8]], { sw: W.hair, opacity: 0.7 });
  bx(s, F, 14, 9, 8, 13, 3, 8, { flat: PAPER_FLAT, sw: W.fine });
  // the notch that keys the card into its slot — the one asymmetry, so the board has a near end
  line(s, F, [[4, 0, 6], [8, 0, 6], [8, 0, 4]], { sw: W.fine });
};

export const controlCard = (opts = {}) => resource('control-card', opts, drawControlCard);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 06 SEAL SET · Seals · 44 × 36 × 14 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE BORE IS THE SILHOUETTE. These are the only pieces in the set you can see the floor through,
// and the warm set moved its gasket card clear of the rings for exactly that reason — at tile size a
// card laid across the tops hides the holes, and the holes ARE the piece. Kept: the rings come first
// and stay uncovered; the card leans clear, behind and left.
//
// A ring is drawn as two level ellipses, the bore filled in PAPER rather than left `none`. On a paper
// ground those render identically, and a filled bore keeps the ring opaque over whatever it is laid
// on — which matters the moment a pile is drawn over a floor grid line.
const drawSealSet = (s, { F, hatch }) => {
  const ring = (x, y, rOut, rIn) => {
    disc(s, F, x, y, 0, rOut, { fill: PAPER, sw: W.mid });
    disc(s, F, x, y, 0, rIn, { fill: PAPER, sw: W.fine });
    // the section's own inner shoulder — a front half-arc, so the ring has thickness rather than
    // reading as a drawn washer
    const [cx, cy] = F.project(x, y, 0);
    const rx = F.s * (rIn + (rOut - rIn) * 0.45);
    ink(s, `M${nn(cx - rx)} ${nn(cy)} A${nn(rx)} ${nn(DY * rx)} 0 0 0 ${nn(cx + rx)} ${nn(cy)}`,
      { sw: W.hair, opacity: 0.7 });
  };
  ring(16, 14, 14, 9);
  ring(31, 25, 10, 6.5);
  // the gasket card, leaning clear of both bores
  quad(s, F, [[4, 30, 0], [20, 30, 0], [23, 34, 13], [7, 34, 14]], { fill: hatch, sw: W.mid });
  for (const t of [0.28, 0.52, 0.76]) {
    line(s, F, [[4 + 16 * t, 30, 0], [7 + 16 * t, 34, 13.5]], { sw: W.hair, opacity: 0.6 });
  }
};

export const sealSet = (opts = {}) => resource('seal-set', opts, drawSealSet);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 07 ICE BLOCK · Ice · 46 × 40 × 26 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE ONLY PIECE WITH A BODY AND NO HATCH ON IT, AND IT IS A DIALECT DECISION RATHER THAN AN
// OMISSION. In this language a hatched face means A CUT THROUGH AN OPAQUE SOLID — that is what it
// means on every wall, every wall stub and every fitting's side. Ice is the one material here that is
// not opaque, so its turned-away facet is drawn FLAT (`PAPER_FLAT`, the kit's own thumbnail tone)
// instead: the face still turns away, and nothing claims the block is solid stone. It also buys the
// set its separation from PLATE OFFCUT, the piece it is closest to in silhouette — offcuts are
// hatched flats, ice is an unhatched chunk.
//
// ⚠️ "THE ONLY PIECE WITH NO HATCH ANYWHERE" IS WHAT THIS NOTE FIRST SAID AND IT WAS FALSE, measured
// on the shipped fragments: `gear-set` and `turnings` reference no hatch either, because neither has
// a face to put one on — a ring and a curl are not solids. The true claim is narrower and is the one
// that does the work: ice is the only piece that HAS faces and declines to hatch them.
//
// The chunk is IRREGULAR on purpose: no two edges parallel, no right angles. A rectangular ice box
// and a crate are the same drawing.
const drawIceBlock = (s, { F }) => {
  // ⛔ NO TWO EDGES PARALLEL, MEASURED RATHER THAN INTENDED — the first draft's facets were near
  // enough to a box that the piece read as a CRATE, which is the one collision this silhouette
  // cannot have (`tuber-crate` is a box). Every vertex below is off its neighbour's line.
  const front = [[9, 12, 0], [33, 8, 0], [38, 9, 21], [12, 13, 15]];
  const right = [[33, 8, 0], [38, 9, 21], [45, 28, 14], [41, 29, 0]];
  const top = [[12, 13, 15], [38, 9, 21], [45, 28, 14], [16, 32, 9]];
  quad(s, F, right, { fill: PAPER_FLAT, sw: W.mid });
  quad(s, F, top, { fill: PAPER, sw: W.mid });
  quad(s, F, front, { fill: PAPER, sw: W.mid });
  // internal cleavage — straight hairlines, because a facet inside the body is not an outline, and
  // because an ARC anywhere in this piece would start it reading as the heap
  line(s, F, [[18, 11, 0], [22, 10, 12], [15, 12.5, 15]], { sw: W.hair, opacity: 0.85 });
  line(s, F, [[27, 9.5, 0], [30, 9, 14]], { sw: W.hair, opacity: 0.7 });
  line(s, F, [[20, 20, 12.5], [34, 14, 18]], { sw: W.hair, opacity: 0.7 });
  // A SECOND SHARD, CLEAVED OFF, AND IT SITS IN FRONT — nearer in y, so drawing it LAST is the
  // correct occlusion rather than a hope. The first draft put it BEHIND the block, where the oblique
  // lifted it straight into the top face and it read as a flap hanging off the chunk.
  quad(s, F, [[1, 1, 0], [13, 0, 0], [15, 1, 8], [3, 2, 11]], { fill: PAPER, sw: W.fine });
  quad(s, F, [[3, 2, 11], [15, 1, 8], [17, 7, 6], [4, 8, 9]], { fill: PAPER_FLAT, sw: W.fine });
  // chips on the deck — flat angular flakes, in front of everything and clear of both bodies
  quad(s, F, [[22, 2, 0], [28, 1, 0], [27, 6, 0], [23, 5, 0]], { sw: W.fine });
  quad(s, F, [[32, 34, 0], [38, 35, 0], [37, 39, 0], [32, 38, 0]], { sw: W.fine });
};

export const iceBlock = (opts = {}) => resource('ice-block', opts, drawIceBlock);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 08 BODY BAG · Corpse · 190 × 56 × 30 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE OWNER'S PIECE. The authored body bags were deleted from `--ship wreck` this morning, but a
// crew member who dies at RUNTIME still drops one (`NeedsSystem`), so this WILL be seen at release —
// and when it is, it will be the worst moment the player has had. It is drawn accordingly: a long
// low form, ink line on paper, nothing dramatic and nothing coy. NO OXBLOOD (see the header): death
// is not an alert.
//
// ⛔ IT LIES DOWN, AND THE WARM PIECE STOOD UP. `resources.js`'s corpse is a tall vertical capsule —
// a bag on its end, which is not a thing that happens and which read as a cocoon. The 190 cm is the
// whole of this piece's silhouette argument: nothing else in the set is a third that long, so it is
// unmistakable at any size, from any angle, in a set where hue can say nothing at all.
//
// THE PROFILE IS A POLYLINE, NOT A CURVE. A bag over a body has SEAMS; polygonal is what it looks
// like and it is also what survives the downscale — a smooth ogee at 22 px is a grey lozenge, which
// is the spoil heap.
//
// THE TAG IS BLANK. `resources.js:314-322`'s identity decision, kept verbatim: a name would be a
// fabrication, and it would be the SAME name on every corpse on the ship. One faint rule inside the
// plate says a name belongs there; nothing says what it is.
const drawBodyBag = (s, { F, hatch }) => {
  const D = 56;
  /** the bag's profile in (x, z), from the foot end to the head end */
  const PROFILE = [[6, 8], [26, 24], [60, 29], [140, 30], [168, 22], [184, 6]];
  const at = (y) => PROFILE.map(([x, z]) => [x, y, z]);
  // 1. the away surface — the whole upper skin, between the near profile and the far one
  quad(s, F, [...at(0), ...at(D).reverse()], { fill: hatch, sw: W.mid });
  // 2. the head-end cap
  quad(s, F, [[184, 0, 0], [184, 0, 6], [184, D, 6], [184, D, 0]], { fill: PAPER_FLAT, sw: W.fine });
  // 3. the near face, drawn last so it closes the form
  quad(s, F, [[6, 0, 0], [184, 0, 0], ...at(0).reverse()], { fill: PAPER, sw: W.mid });
  /** the profile height at `x` — so a rib really lands on the skin instead of near it */
  const zAt = (x) => {
    for (let i = 1; i < PROFILE.length; i += 1) {
      const [x0, z0] = PROFILE[i - 1];
      const [x1, z1] = PROFILE[i];
      if (x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
    return PROFILE[PROFILE.length - 1][1];
  };
  // the welded ribs: up the near face, then back over the crown
  for (const x of [34, 68, 102, 136, 166]) {
    line(s, F, [[x, 0, 0], [x, 0, zAt(x)], [x, D, zAt(x)]], { sw: W.hair, opacity: 0.7 });
  }
  // two straps, the same wrap at the ramp's weight
  for (const x of [52, 132]) {
    line(s, F, [[x, 0, 0], [x, 0, zAt(x)], [x, D, zAt(x)]], { sw: W.mid });
  }
  // the ID tag, on the near face at the head end — and BLANK
  quad(s, F, [[152, 0, 8], [168, 0, 8], [168, 0, 17], [152, 0, 17]], { sw: W.fine });
  line(s, F, [[155, 0, 12], [165, 0, 12]], { sw: W.hair, opacity: 0.45 });
  line(s, F, [[164, 0, 17], [170, 0, zAt(170)]], { sw: W.hair });
};

export const bodyBag = (opts = {}) => resource('body-bag', opts, drawBodyBag);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 09 TURNINGS · Swarf · 36 × 30 × 18 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// DRAWN IN STROKE, WITH NO FILLED BODY AT ALL — the only piece in the set that is, and it is the last
// unused silhouette. Every other shape here is a solid: a dome, a box, plates, discs, rings, a chunk,
// a body. An open curl whose middle is PAPER is the one thing none of them can be mistaken for, and
// a stroke keeps its width when the fill it would have had collapses to nothing at tile size.
//
// ⛔ THE WARM PIECE'S DOUBLE-STROKE IS DROPPED, AND THE REASON IS THE GROUND IT IS DRAWN ON.
// `resources.js` draws every ribbon TWICE — a wide dark rim under a bright core — because a pale curl
// over the warm set's pale steel-tan floor lost its edge entirely. Here the curl is INK and the floor
// is PAPER: the contrast is already the maximum this dialect has, and a second stroke under an ink
// line would only thicken it. One pass, on the ramp.
//
// ⛔ AND THERE IS NO SCATTER TERM. Every curl below is authored, so the "a pile that reads as
// scattered must derive its scatter from `opts`, never from RNG" constraint is met by construction:
// there is nothing here that could reach for `Math.random`.
const drawTurnings = (s, { F }) => {
  const curl = (cx, cy, cz, r0, r1, a0, sweep, sw) =>
    ink(s, curlPath(F, cx, cy, cz, r0, r1, a0, sweep), { sw });
  // ⚠️ THE WEIGHTS ARE ONE STEP UP THE RAMP FROM EVERY OTHER PIECE HERE, and it is measured rather
  // than felt: a piece made only of strokes has no filled body to carry it, so at the 22 px tile the
  // first draft's hairline nest was a grey haze. A filled piece can be outlined at `fine`; this one
  // cannot.
  curl(8, 22, 6, 1.8, 6.0, -0.4, 4.6, W.mid);
  curl(28, 24, 5, 1.6, 5.2, 2.4, -4.2, W.mid);
  curl(30, 7, 7, 1.4, 4.6, 0.5, 3.8, W.fine);
  curl(13, 5, 5, 1.7, 5.4, 1.6, -3.4, W.fine);
  curl(19, 15, 10, 2.2, 7.6, -1.0, 5.4, W.heavy);
  // two cut stubs — the only straight edges in the piece, and deliberately short: enough to say
  // "this came off a tool", never enough to start reading as an offcut
  line(s, F, [[2, 12, 2], [10, 10, 5]], { sw: W.mid });
  line(s, F, [[27, 18, 2], [34, 20, 4]], { sw: W.fine });
};

export const turnings = (opts = {}) => resource('turnings', opts, drawTurnings);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The painter table + the door a damaged twin comes through
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every painter, by id. Exported so a damage pass can re-run the pristine drawing rather than
 *  keeping a second copy of it in step by hand. */
export const DRAW = Object.freeze({
  'spoil-heap': drawSpoilHeap,
  'tuber-crate': drawTuberCrate,
  'plate-offcut': drawPlateOffcut,
  'gear-set': drawGearSet,
  'control-card': drawControlCard,
  'seal-set': drawSealSet,
  'ice-block': drawIceBlock,
  'body-bag': drawBodyBag,
  'turnings': drawTurnings,
});

/** The builder for each id — what `index.js` registers. */
export const BUILD = Object.freeze({
  'spoil-heap': spoilHeap,
  'tuber-crate': tuberCrate,
  'plate-offcut': plateOffcut,
  'gear-set': gearSet,
  'control-card': controlCard,
  'seal-set': sealSet,
  'ice-block': iceBlock,
  'body-bag': bodyBag,
  'turnings': turnings,
});

/**
 * Paint piece `id` INTO an existing scene, then hand the same scene and the same frame to `extra`,
 * so a caller can add marks in the piece's own centimetres rather than guessing at pixels.
 *
 * This is how a damaged twin is drawn: a damaged pile is the SAME pile with damage on it, and
 * re-running the pristine painter is the only construction under which that stays true when the
 * pristine drawing changes. Returns nothing; everything lands in `s`.
 */
export function paintResource(s, id, extra, state) {
  const draw = DRAW[id];
  if (!draw) return;
  const env = envFor(s, id, state);
  draw(s, env);
  if (typeof extra === 'function') extra(s, env);
}

/** The drawing vocabulary, for the same caller: cm-space strokes, level ellipses, front ovals and
 *  the closed polygon. `ink`/`line`/`disc`/`path`/`curve` come from `fittings.js`; these are the
 *  three this module adds. */
export { quad, frontOval, hatchPaint };

/** The tile-normalisation constant every builder here is scaled against — re-exported so a tool can
 *  size a page without importing two modules to learn one number. */
export { TILE };
