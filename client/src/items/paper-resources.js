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

/** The harness: an item fragment whose painter draws in the piece's own centimetres.
 *  `sketched: true` — the owner's 2026-08-05 ruling; the seam is `helpers.item()`. */
function resource(id, opts, paint) {
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state, env.facing)); },
    { sketched: true });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 01 SPOIL HEAP · Regolith · ∅80 × 34 cm
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// The one smooth silhouette in the set. Construction: the footprint is a real circle on the floor,
// so it draws LEVEL (the catalogue's own round-objects rule) and its BACK half stays visible above
// the mound — that arc is what says "this is round on the deck" rather than "this is a lump". The
// mound itself closes the FRONT half of that same ellipse with crest curves, so the heap and its
// footprint cannot disagree about where the pile meets the floor.
//
// The away flank is hatched, exactly as every fitting's side face is; it is bounded ABOVE by the
// crest and BELOW by a return that stays inside the mound at every x it spans, so the hatch can
// never leak past the silhouette.
//
// ⛔ REDRAWN 2026-08-05 — A BLIND READ OF THE ORIGINAL CAME BACK "a cryopod", AND IT WAS RIGHT TO:
// the old construction stroked the base circle's own far arc TWICE — once as the footprint's
// hairline, once again at bold weight as the crest path's own leading `A` command — which put a
// hard, perfectly geometric rim over the crown. Paired with a wide hatched wedge whose return leg
// was one long near-straight chord (an access panel, not a shaded slope), the piece read as a
// manufactured capsule. Neither defect was about "not enough style"; both were the dialect's own
// SOLID-OBJECT grammar (a crisp rim, a panel) applied to loose dumped matter by construction.
//
// The footprint is still a real circle on the floor, and the pile is still one continuous filled
// silhouette — that identity is kept. What changed:
//   1. THE FAR ARC IS HAIRLINE-ONLY NOW. The crest's bold stroke is an OPEN path covering just the
//      near, visible slope; the footprint `disc()`'s own hairline is the only line standing for the
//      back of the pile, exactly as it already does for the "this is round, not a lump" cue — it is
//      no longer doubled into a rim.
//   2. THE PROFILE IS AN ASYMMETRIC TAPER, not a symmetric dome — a long, low, fanned tail on the
//      right rising to a rounded crown off-centre on the left. This is what `SPECS`'s own comment
//      already claims ("angle of repose ~40° for dry basaltic fines") and a centred dome never drew:
//      a shovelled heap piles high near the drop point and trails off; a manufactured shell does not.
//      ⛔ THE CROWN IS ROUNDED ON PURPOSE, MEASURED RATHER THAN GUESSED: a draft using three sharp
//      peaks with deep saddles between them rendered as a crown of spikes (ears on an animal). The
//      fix places one control point ABOVE both of the crown's neighbouring points, which bows the
//      curve over the top instead of cusping it.
//   3. THE HATCH BAND HUGS THE CREST'S OWN CURVE (reusing its exact segments as the outer edge)
//      instead of cutting a wide wedge with a long inner chord, so it shades a receding slope rather
//      than reading as an inset panel.
//   4. FIVE SPILLED GRAINS, not three — more scatter along the front lip reads as "this is spilling"
//      where one or two dots read as fasteners on a base ring.
const drawSpoilHeap = (s, { F, hatch }) => {
  const R = 38;
  const rx = F.s * R;
  const ry = DY * F.s * R;
  /** a point on the heap's own section plane (the frame's mid-depth), in cm */
  const P = (x, z) => F.project(x, 40, z);
  const seg = ([x, z], [cxk, czk]) => ` Q${nn(P(cxk, czk)[0])} ${nn(P(cxk, czk)[1])} ${nn(P(x, z)[0])} ${nn(P(x, z)[1])}`;
  const L = P(2, 0);
  const Rt = P(78, 0);
  disc(s, F, 40, 40, 0, R, { fill: PAPER, sw: W.hair });
  // THE CREST — right base, along a long low tail, up to a rounded off-centre crown, down to left
  // base. Asymmetric on purpose: material dumped at one point piles high there and fans out, which a
  // centred single-shoulder dome never showed.
  const crest =
    seg([68, 6], [74, 2]) + seg([55, 9], [62, 5]) + seg([34, 28], [46, 15])
    + seg([22, 31], [28, 33]) + seg([12, 19], [17, 26]) + seg([2, 0], [6, 10]);
  // THE BODY'S FILL ONLY — no stroke of its own, so the far edge does not get re-inked bold.
  // ⛔ `sw: 0` AND NOT JUST `stroke: 'none'`, and a guard is why: `ink` falls back to `W.fine` when
  // no weight is given, so a strokeless path still EMITS `stroke-width="1.1"` — a raw ramp rung in
  // the shipped fragment, which `sketch-adoption.test.js` reads as a member the treatment failed to
  // re-pen. A rung the pen never touched and a rung it MISSED are the same string.
  ink(s,
    `M${nn(L[0])} ${nn(L[1])} A${nn(rx)} ${nn(ry)} 0 0 0 ${nn(Rt[0])} ${nn(Rt[1])}${crest} Z`,
    { fill: PAPER, stroke: 'none', sw: 0, cap: false });
  // the near slope, bold and OPEN — the back arc is left to the footprint disc's own hairline
  ink(s, `M${nn(Rt[0])} ${nn(Rt[1])}${crest}`, { sw: W.mid, cap: false });
  // THE AWAY FLANK, hatched like every other turned-away face in the dialect: a band that hugs the
  // crest's own edge (reusing its segments) rather than a wedge with a long straight-reading chord.
  // ⛔ NOT A WEDGE DOWN TO THE MIDDLE OF THE MOUND — an early render drew exactly that and it came
  // out as a pie slice cut into a dome, which is a diagram of a heap rather than a heap.
  ink(s,
    `M${nn(Rt[0])} ${nn(Rt[1])}${seg([68, 6], [74, 2])}${seg([55, 9], [62, 5])}${seg([34, 28], [46, 15])}`
    + `${seg([40, 22], [36, 26])}${seg([54, 5], [44, 14])}${seg([78, 0], [66, 2])} Z`,
    { fill: hatch, sw: W.hair, cap: false });
  // ⛔ NOTHING IS DRAWN ON THE CROWN. Two creases were, and at 230 px the heap had a face — two
  // grains for eyes and a crease for a mouth. Pareidolia is not a matter of taste at this scale: a
  // smooth closed body with marks near its middle reads as a face, and once seen it cannot be
  // unseen — measured twice now, not just argued once: a later draft's two symmetric "settling"
  // hairlines, placed centrally, read as closed eyes the moment they were rendered. Everything that
  // is not the silhouette sits BELOW the front arc, on the deck.
  // Spilled grains, level, because they lie on the floor — five, scattered along the front lip.
  disc(s, F, 6, 6, 0, 3, { sw: W.fine });
  disc(s, F, 18, 3, 0, 1.8, { sw: W.fine });
  disc(s, F, 33, 2, 0, 2.2, { sw: W.fine });
  disc(s, F, 58, 5, 0, 1.8, { sw: W.fine });
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
  // ⭐ CORNER POSTS PROUD OF THE RIM. A field crate's stakes rise clear of the load so a rope can go
  // over the top; nothing sealed does that. At review a cold read of the old silhouette — flush
  // posts, three even domes in a row, slatted face — came back "a three-berth cryo-sleep unit", and
  // a flush-topped box with round crowns level with its own rim IS that reading. The stakes standing
  // above the heap are the one mark a sealed housing never carries.
  line(s, F, [[17, 0, 0], [17, 0, 26]], { sw: W.fine });
  line(s, F, [[57, 0, 0], [57, 0, 26]], { sw: W.fine });
  // the heap: FIVE tubers standing proud of the top face (z = 20), drawn as FRONT-plane silhouettes
  // — still ellipses (`frontOval`, this piece's own reserved silhouette in the header's table), but
  // no longer three EQUAL ones evenly spaced in a single row. That reading was measured, not assumed
  // — a cold read of the old three-in-a-row over a slatted, flush-topped box came back "a
  // three-berth cryo-sleep unit". A heap is uneven: sizes vary, one tuber tucks partly BEHIND its
  // neighbours (drawn first, painted over), and none of the five sits on the same centre line as
  // another. The eyes stay off-centre, never a symmetric pair, so they read as blemishes and not as
  // a fascia's paired indicator lights.
  const tuber = (x, y, z, rx, ry, eyes) => {
    frontOval(s, F, x, y, z, rx, ry, { sw: W.fine });
    // the eyes — front-plane, because they sit on the tuber's own silhouette and not on the deck
    for (const [ex, ez] of eyes) frontOval(s, F, x + ex, y, z + ez, 0.8, 0.7, { fill: INK, sw: 0 });
  };
  // the small one, tucked in the saddle between the two big ones — drawn FIRST so the big pair's
  // opaque paper fill overlaps it, which is what makes it read as squeezed into the gap rather than
  // as a fourth equal window.
  tuber(34, 8, 30, 5, 4, [[-1, 0.8]]);
  tuber(24, 12, 24, 9, 6.5, [[-3, 1.5], [2, -1.5]]);
  tuber(44, 10, 26, 7, 5.5, [[2.5, 1], [-2, -1.8]]);
  tuber(52, 15, 21.5, 5, 4, [[-1, 1]]);
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
  // THE STANDING SHEET — the piece's one vertical, leaning back off the heap, with a TORN top edge
  // rather than a straight one. A cold read of the earlier render (clean near-rectangle, straight
  // top edge retraced heavier) called this piece a fabricator/3D printer: a crisp hatched panel with
  // a horizontal bar across the top reads as an enclosure, not as torn plate, and it also broke this
  // module's own rule that no edge is parallel to its neighbour. The fix states the SAME fact the
  // rest of the pile already states — every edge here is a tear — including the top one. Hatched,
  // because a sheet seen on edge is showing its cut face.
  quad(s, F,
    [[6, 30, 0], [9, 37, 23], [16, 35, 18], [22, 36, 24], [30, 34, 21], [26, 26, 0]],
    { fill: hatch, sw: W.mid });
  // a folded bracket — welded angle, thrown LOW across the pile. It used to rise to its own near
  // vertical post on the right (z 9→20), pairing with the standing sheet's post on the left into a
  // twin-tower gantry with the flat plates read as the bed between them — the other half of the
  // fabricator misread. A debris bracket is thrown, not erected: it now kinks once, low, well under
  // the standing sheet's own height, and does not stand.
  line(s, F, [[44, 20, 3], [56, 24, 5], [50, 30, 12]], { sw: W.heavy });
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
  // rather than as a stroked line, and now at W.mid rather than W.fine — a blind-recognizability
  // pass read the two gears alone as "a fan" (medium confidence), and the fine-stroke spanner
  // photographed as a stray shadow line under them rather than as a tool with a body. Its points
  // are unchanged, so the wrecked twin's bent-shaft tear still runs along the same shaft.
  quad(s, F, [
    [2, 1, 0.5], [6, 0, 0.5], [9, 3, 0.5], [6.5, 4.5, 0.5], [32, 6.5, 0.5], [34, 3.5, 0.5],
    [38, 6, 0.5], [35, 9.5, 0.5], [31, 8, 0.5], [5.5, 6, 0.5],
  ], { sw: W.mid });
  // a HEX nut, level on the deck, clear of both gears — same footprint and centre as the ring it
  // replaces, but six flats read as a FASTENER at a glance, where a bare ring photographed as a
  // third bore next to the two gears' own hub holes. No twin references this point.
  quad(s, F, [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i;
    return [40 + 3.4 * Math.cos(a), 30 + 3.4 * Math.sin(a), 0];
  }), { sw: W.fine });
  // ⛔ THE BORE KEEPS ITS CHAMFER RING, AND THAT IS A GUARD TALKING, NOT A FLOURISH. The hex flats
  // were proposed as a straight swap for the nut's outer ring, and that swap deleted the ONLY
  // concentric ellipse pair on this piece — which `paper-resources.test.js` pins by name, because
  // the bore test asks seal-set for TWO pairs precisely so gear-set's ONE stays legal. A real nut is
  // a ring with a bore whatever its outside is: the chamfer that circles the hole is that ring, so
  // the piece states the same fact the guard was pinning, in the geometry the fix wanted.
  disc(s, F, 40, 30, 0, 2.5, { sw: W.fine });
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
  // THE EDGE COMB — five DEEP pins, filled ink, hanging in the sliver of open deck the upper card's
  // forward offset leaves in front of the lower one (y 0..2). ⛔ IT WAS SEVEN HAIRLINES ACROSS THE
  // TOP FACE, RUNNING INTO THE DEPTH — which is the SAME direction the dialect's 45° hatch runs (a
  // line varying only in y projects along `(DX, −DY)`, the hatch's own diagonal), so at every size
  // the "pins" folded into the hatch texture instead of reading as a shape apart from it. A flat
  // part-hatched plate with rows across it is a planter bed, and that is exactly what a cold reader
  // called this piece. Filled, FEW, and in the FRONTAL plane — constant y, no depth diagonal in them
  // at all — so they break the outline rather than joining the hatch's grain, and survive the
  // downscale as ink MASS the way `gear-set`'s deep-and-few teeth do rather than as a line that
  // thins to nothing.
  for (let i = 0; i < 5; i += 1) {
    const x = 10 + i * 4.5;
    quad(s, F, [[x - 1.1, 0, 4], [x + 1.1, 0, 4], [x + 1.1, 0, 0.6], [x - 1.1, 0, 0.6]],
      { fill: INK, sw: 0 });
  }
  // ONE trace, run ACROSS the width and not into the depth — the depth direction is spoken for by
  // the hatch, and a second interior line drawn that way folded back into it instead of adding
  // anything. Then the chip.
  line(s, F, [[6, 8, 8], [32, 8, 8]], { sw: W.hair, opacity: 0.7 });
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
// ⛔ RECUT AGAINST A BLIND READ OF "magnetic boots", AND THE STRAP IN THAT READING WAS REAL. The
// gasket card's footprint used to reach from behind the near ring TOWARD the far one (its x range
// overlapped the second ring's), so its oblique rise crossed both silhouettes at once — two rounded
// pads with a band rising between them is a boot with laces. Worse, the card carried the 45° hatch
// across a face only ~19 cm wide, about two periods of it, which is far too few to read as the
// shading it means everywhere else in the dialect: it read as WOVEN LATTICE and paid for the laces.
// Two fixes, neither touching `SPECS`: the card now leans on the NEAR ring alone and never reaches
// toward the second, and its face is `PAPER_FLAT` rather than the kit hatch — still marked as turned
// away, no longer a weave. The bore is opened wider as well (inner radius ~0.4× the outer, from
// ~0.65×), because the identifying feature was too subtle to do its job: a narrow annulus in the
// same paper as its own disc is a circle, and a circle in this set is not a seal.
//
// A ring is drawn as two level ellipses, the bore filled in PAPER rather than left `none`. On a paper
// ground those render identically, and a filled bore keeps the ring opaque over whatever it is laid
// on — which matters the moment a pile is drawn over a floor grid line.
const drawSealSet = (s, { F }) => {
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
  ring(13, 13, 13, 5.5);
  ring(34, 21, 9, 3.8);
  // the gasket card — leaning against the NEAR ring ONLY (see the header: reaching toward the second
  // one is what drew a strap between two pads), and in the flat tone rather than the hatch
  quad(s, F, [[3, 29, 0], [15, 30, 0], [17, 34, 12], [5, 33, 13]], { fill: PAPER_FLAT, sw: W.mid });
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
  // ⛔ LEGIBILITY FIX (blind-read regression): the previous vertices held every face of the main
  // chunk 8-13 cm off the box's own front plane and skewed them hard enough that the silhouette
  // read as a thin diagonal sail rather than a solid hunk of matter on the deck -- a blind viewer
  // reading the set called it a cryo pod. The chunk now sits IN the front plane (y near 0) and
  // fills most of its own w×d×h box, which is what makes it read as a heavy, grounded solid at
  // tile size. Every other rule the original comments won stays: NO TWO EDGES PARALLEL (the crate
  // collision), no hatch on any face (ice is the one non-opaque material — `PAPER_FLAT` stands in
  // for the hatch on the turned-away face), no arc anywhere (melting is the twin's mark, not this
  // one's — an arc here would blur the line with the spoil heap).
  const front = [[3, 3, 0], [33, 0, 0], [38, 4, 25], [7, 6, 20]];
  const right = [[33, 0, 0], [38, 4, 25], [45, 22, 18], [40, 26, 0]];
  const top = [[7, 6, 20], [38, 4, 25], [45, 22, 18], [14, 30, 10]];
  quad(s, F, right, { fill: PAPER_FLAT, sw: W.mid });
  quad(s, F, top, { fill: PAPER, sw: W.mid });
  quad(s, F, front, { fill: PAPER, sw: W.mid });
  // internal cleavage — straight hairlines only, same reasoning as before: a facet inside the body
  // is not an outline, and an arc anywhere in this piece would start it reading as the heap
  line(s, F, [[14, 4, 2], [19, 2, 13], [11, 5, 17]], { sw: W.hair, opacity: 0.85 });
  line(s, F, [[27, 1, 1], [31, 1, 15]], { sw: W.hair, opacity: 0.7 });
  line(s, F, [[16, 10, 19], [34, 15, 22]], { sw: W.hair, opacity: 0.7 });
  // a second shard, cleaved off, sitting in front and touching the main chunk's near-left corner —
  // nearer in y, so drawing it LAST is the correct occlusion rather than a hope
  quad(s, F, [[0, 1, 0], [12, 0, 0], [15, 1, 9], [2, 2, 12]], { fill: PAPER, sw: W.fine });
  quad(s, F, [[2, 2, 12], [15, 1, 9], [18, 6, 7], [5, 7, 10]], { fill: PAPER_FLAT, sw: W.fine });
  // chips on the deck — flat angular flakes, in front of everything and clear of both bodies
  quad(s, F, [[21, 1, 0], [27, 0, 0], [26, 5, 0], [22, 4, 0]], { sw: W.fine });
  quad(s, F, [[36, 32, 0], [42, 33, 0], [41, 37, 0], [35, 36, 0]], { sw: W.fine });
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
  /**
   * THE BAG'S PROFILE in (x, z), from the foot end to the head end — a body under cloth, not a loaf.
   *
   * ⛔ IT WAS A FLAT-TOPPED LOAF, and a cold reader called the piece a cryo pod for three reasons
   * that were all in this array and the two loops under it: an 80 cm near-flat plateau across the
   * whole torso, five folds at a PERFECTLY even 34 cm pitch (a machined ridge, and the code even
   * called them "welded" ribs — a hull word), and a hard rectangular end wall. Together that is the
   * vocabulary of a moulded capsule. The profile now rises and falls with the shape wrapped inside
   * it — ankle, knee, hip, waist, chest, shoulder, head — so the two straps visibly CINCH the fabric
   * (the silhouette dips exactly under each of them) instead of running as inert bands over an
   * unbroken dome, and the chest is the tallest point in the piece, which is what `SPECS` claimed
   * all along ("30 cm at the chest") and the plateau never drew.
   */
  const PROFILE = [
    [6, 4], [26, 11], [46, 15], [66, 22], [86, 15],
    [110, 29], [134, 19], [152, 25], [170, 17], [184, 6],
  ];
  const at = (y) => PROFILE.map(([x, z]) => [x, y, z]);
  // 1. the away surface — the whole upper skin, between the near profile and the far one
  quad(s, F, [...at(0), ...at(D).reverse()], { fill: hatch, sw: W.mid });
  // 2. the head-end cap — closed at the profile's OWN height there, derived rather than typed, so it
  //    stays a tied-off end instead of drifting back into an independently authored bulkhead
  const zHead = PROFILE[PROFILE.length - 1][1];
  quad(s, F, [[184, 0, 0], [184, 0, zHead], [184, D, zHead], [184, D, 0]],
    { fill: PAPER_FLAT, sw: W.fine });
  // 3. the near face, drawn last so it closes the form
  quad(s, F, [[6, 0, 0], [184, 0, 0], ...at(0).reverse()], { fill: PAPER, sw: W.mid });
  /** the profile height at `x` — so a fold or a strap really lands on the skin instead of near it */
  const zAt = (x) => {
    for (let i = 1; i < PROFILE.length; i += 1) {
      const [x0, z0] = PROFILE[i - 1];
      const [x1, z1] = PROFILE[i];
      if (x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
    return PROFILE[PROFILE.length - 1][1];
  };
  // THREE GATHERED FOLDS, one over each bump — light, because a fold is a crease and not a seam,
  // and deliberately NOT evenly spaced: an even pitch is what read as a machined ridge. (They were
  // five "welded ribs", which is a hull word for a thing made of cloth.)
  for (const x of [46, 110, 150]) {
    line(s, F, [[x, 0, 0], [x, 0, zAt(x)], [x, D, zAt(x)]], { sw: W.hair, opacity: 0.6 });
  }
  // TWO STRAPS, cinched at the bag's own waist and shoulder — the ramp's mid weight, and the reason
  // the silhouette dips exactly there rather than running past underneath them
  for (const x of [86, 134]) {
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
  //
  // ⚠️ THE THREE BIGGEST CURLS NO LONGER TOUCH — measured, not felt. A blind read of the shipped
  // draft (whose big three curls' bounding circles overlapped into one continuous loop) came back
  // "a coiled rope": a single coiled OBJECT, not a scattered PILE of loose swarf. Recentring and
  // lightly shrinking the dominant curl and sliding the right-hand curl clear of it removes that
  // fused silhouette while leaving every curl's own radius/weight/sweep character close to what it
  // shipped with, and the dominant curl still reaches z≈16.8 so the piece keeps filling the box at
  // tile size (a scatter of many small curls was tried and tested worse: it left the top of the box
  // empty and read weaker at 22 px, which is the one thing this catalogue cannot afford to trade
  // away). This does not claim to fully resolve "rope" — within a three-colour, silhouette-only
  // dialect with no material cue available, that residual is filed, not solved.
  curl(8, 22, 6, 1.8, 6.0, -0.4, 4.6, W.mid);
  curl(31, 24, 5, 1.6, 4.8, 2.4, -4.2, W.mid);
  curl(30, 7, 7, 1.4, 4.6, 0.5, 3.8, W.fine);
  curl(13, 5, 5, 1.7, 5.4, 1.6, -3.4, W.fine);
  curl(19, 11, 11, 2.0, 5.8, -1.0, 5.2, W.heavy);
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
