// THE FOURTEEN PAPER FIXTURES — the ship's ARCHITECTURE, redrawn in the owner's paper/ink/oxblood
// oblique. Doors, hatches, service runs, wall-hung fittings and the three luminaires.
//
// Owner-directed (2026-08-05): *"produce new svg materials to replace the old ones… full spectrum
// for release; ensure the dimensionalities are correct."* These fourteen are the last warm-set rows
// that a player meets in every corridor of `--ship wreck` and they were the pre-redesign steel-and-
// amber drawings of `client/src/items/fixtures.js` (+ `blast-door` from `objects.js`). The old
// builders are NOT deleted — see `items/index.js`, where their rows stay registered at `glyph: null`
// for the reason the capsules-and-cells package recorded: `MOCK_TWIN_IDS` must keep measuring
// exactly seventy, and that positional bijection is the whole of the evidence that the mock's other
// twins are transcribed correctly.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ A FILE OF ITS OWN, AND NOT FOURTEEN MORE ROWS IN `fittings.js` — the `cryo.js` precedent, with
// a second reason on top of it. `fittings.js` is a PORT: every one of its thirty pieces has a card in
// `design-import/Perilune Fittings.dc.html`, its comments cite that card's own broken geometry, and
// its tests hold it against the document. ⛔ THE OWNER'S CATALOGUE HAS NO CARD FOR ANY OF THE
// FOURTEEN BELOW. They are designed here, in the dialect, against real-world centimetres — so mixing
// them into that module would make "is this faithful to the card?" unanswerable for half its rows and
// would quietly relax the one test that keeps the port honest. Two modules, two authorities, one
// dialect; and this set reverts by deleting this file plus its registry rows.
//
// ⛔ AND THE DIALECT IS IMPORTED, NEVER RE-TYPED. `bx`, `quad`, `cyl`, `hoop`, `foot`, `wallStub`,
// `hatchPaint`, `CUT_DASH`, `ink`/`line`/`disc`/`path`/`curve` and the projection itself all come
// from `fittings.js` / `render/oblique.js`. `geometryFor(spec)` is the ONE derivation of the drawing
// scale in the tree and this module goes through it: a second copy of "how big is a centimetre in a
// fitting's tile" is exactly how the Overview and the Room Zoom came to skin one glyph two ways.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐ THE ONE THING THIS SET NEEDED THAT THE THIRTY DID NOT: AN UPRIGHT CIRCLE.
//
// The catalogue's rule is ANYTHING ROUND DRAWN LEVEL — "so a round fitting has no heading and can be
// set down any way about" — and `fittings.js`'s `disc()` is that rule, a level ellipse with
// `ry = 0.6·rx`. It is right for a barrel, a stool and a deck hatch. It is WRONG for an airlock, a
// porthole and an extractor fan, because those are circles in a BULKHEAD: a level ellipse there lays
// the door flat on the floor.
//
// In cabinet oblique a circle in the frontal (x–z) plane projects to a TRUE CIRCLE, displaced by
// `depth(y)` and not deformed at all — x is x and height is height, which is the whole content of
// the projection. So `faceDisc()` emits an `<circle>` and `tube()` builds a cylinder whose axis runs
// BACK into the picture out of two of them plus their two common tangents. Both are the construction
// `fittings.js` already uses for the workbench's pegboard holes (`s.circle` at depth 70), promoted to
// named vocabulary because this module leans on it fourteen times.
//
// ⇒ THE TWO ARE DISTINGUISHABLE BY ELEMENT NAME, ON PURPOSE, AND `paper-fixtures.test.js` PINS BOTH
// HALVES: every `<ellipse>` in this module is LEVEL (`ry = 0.6·rx` exactly, the catalogue's rule),
// and every `<circle>` is an upright face circle. A round thing drawn with the wrong one is then a
// test failure rather than a drawing nobody looks at twice.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// DIMENSIONALITY — the owner asked for it by name, so every number in `SPECS` is a real fitting.
//
// A ship's interior sliding door fills a 1 m opening 2.1–2.4 m high; a blast door is heavier and
// wider; a bulkhead vent grille is ~40 × 40 at duct height; a porthole is ∅50 of glass in a ∅78
// frame at sill height; a floodlight matters mostly for HOW HIGH IT IS MOUNTED. Twelve of the
// fourteen take no floor at all, and the design document's own footer states the convention for
// those: *"Wall-hung items … carry their mounting height in the dimension line, since they take no
// floor."* So each `SPECS` entry carries a `dim` — the dimension line the card would have printed,
// `W × D × H CM, HUNG N` — and each hung piece draws the hatched WALL STUB with dashed cut edges
// that makes the mounting height a fact about the picture rather than a caption (ruling E8 class 6).
//
// ⛔ `dim` IS A FIELD AND NOT A COMMENT, AND THAT IS THE WHOLE OF WHY IT EXISTS. It was a comment
// first, which meant the one surface that PRINTS a dimension line — `client/tools/paper-fixtures-
// sheet.mjs`, the sheet the owner judges this set on — could not read it and computed its caption
// from `w × d × h` and `z0` instead. Those two are the PICTURE: the box includes the wall stub, the
// frame and the light spill, and `z0` is the lowest z the drawing puts ink at, which for a hung
// piece is under the object (the sconce's rays, the conduit's drop). TEN OF THE ELEVEN ROWS THAT
// CARRY A `z0` therefore captioned a mounting height that was not the fitting's — counted off the
// captions themselves, before and after: a conduit tray hung at 220 cm read "HUNG 204", a sconce at
// 190 read 182, a flood lamp at 240 read 232. (The eleventh, `door-airlock`, printed the right
// number under the wrong word — SILL 20 as "HUNG 20" — beside a box that was still the picture's.)
// A field the tool reads is one source of truth; a hand-typed table in the tool would have been a
// second one, which is the defect one level up.
//
// ⚠️ `z0` IS THE LOWEST z THE PIECE DRAWS AT, and this set is where it earns its keep: a sconce whose
// box ran from the deck would sit in the top third of its tile with two thirds of blank paper under
// it. ⭐ `deck-hatch`'s `z0` IS NEGATIVE, which is a first in this repo and is not a trick: a deck
// hatch is a hole, and its ladder is drawn BELOW the deck line it is cut into. `extents()` handles it
// without a special case (the drawn band is `h − z0` either way) and the piece centres on the ink it
// actually puts down.
//
// ⚠️ AND THE STUB IS SIZED SO THE CENTRING IS HONEST. `extents()` assumes the topmost ink is at
// `(h, d)` and the lowest at `(z0, 0)`; where a piece's tallest part sits at a shallower depth the
// box grows a band of empty paper the drawing never fills. Measured and fixed at the place it
// occurred: `deck-hatch`'s grab stanchions were first authored at the NEAR rim (y = 16), which left
// `0.6 · (118 − 16) = 61` cm of dead box above the drawing — a fifth of the tile. They stand at the
// BACK rim (y = 112) now, beside the ladder, where a hand actually reaches for them.

import { item, INK, PAPER, ATTEND } from './helpers.js';
import {
  W, geometryFor, hatchPaint, bx, quad, cyl, wallStub, CUT_DASH,
  ink, line, disc, curve,
} from './fittings.js';
import { PAPER_FLAT, DEPTH_RATIO, n as nn } from '../render/oblique.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SPECS — every fixture's drawn box in centimetres, and its dimension line
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `w` across · `d` back · `h` up · `z0` the lowest z drawn — these four are the PICTURE, which
// includes the frame, the wall stub and the light spill. `dim` is the DIMENSION LINE — what the
// OBJECT is, and where it is fixed — and it is the string the catalogue sheet prints. The trailing
// comment on a hung row names what the box holds that the object does not.
//
// ⚠️ EVERY NUMBER IN `dim` IS READ OFF THE PAINTER BELOW, NOT OFF THE BOX. A hung piece's mounting
// height is the lowest z of the FITTING (the conduit tray's `bx` at 220, the screen bezel's at 126,
// the sconce bowl's mouth at 190) — never `z0`, which is where the drawing's lowest ink is.

export const SPECS = Object.freeze({
  // ── WAYS THROUGH (4) ──
  'door-sliding':    { w: 132, d: 18, h: 236,
    dim: 'opening 100 × 208 · leaf 2 × 50 × 6 · frame 132 × 18 × 236 CM' },
  'door-airlock':    { w: 124, d: 34, h: 158, z0: 20,
    dim: 'hatch ∅92 in a ∅112 coaming · 124 × 34 × 138 CM, SILL 20' },
  'door-blast':      { w: 156, d: 26, h: 254,
    dim: 'opening 120 × 212 · slab 120 × 14 × 212 · frame 156 × 26 × 254 CM' },
  'deck-hatch':      { w: 118, d: 118, h: 74, z0: -8, round: true,
    dim: 'opening ∅90 · coaming ∅118 × 14 CM · rail 60 · ladder drops 60+' },

  // ── SERVICES (3) ──
  'conduit-run':     { w: 264, d: 26, h: 248, z0: 204,          // + wall
    dim: 'tray 240 × 14 × 14 CM, HUNG 220' },
  'vent-grille':     { w: 54, d: 16, h: 262, z0: 190,           // + wall
    dim: 'grille 40 × 40 in a 54 × 12 × 54 frame, HUNG 200' },
  'extractor-fan':   { w: 76, d: 26, h: 266, z0: 190,           // + wall
    dim: 'housing 64 × 18 × 64 · impeller ∅52 CM, HUNG 194' },

  // ── WALL FURNITURE (4) ──
  'hull-port':       { w: 98, d: 18, h: 204, z0: 112,           // + hull
    dim: 'glass ∅58 · frame ∅78 × 14 CM, SILL 116' },
  'bulkhead-screen': { w: 108, d: 14, h: 202, z0: 112,          // + wall
    dim: 'screen 88 × 50 · bezel 100 × 10 × 62 CM, HUNG 126' },
  'arms-rack':       { w: 116, d: 32, h: 152, z0: 44,           // + wall
    dim: '110 × 28 × 96 CM, HUNG 44' },
  'deck-marker':     { w: 72, d: 16, h: 226, z0: 192,           // + wall
    dim: 'plate 64 × 8 × 28 on 4 cm lugs, HUNG 194' },

  // ── LIGHT (3) ──
  'lamp-sconce':     { w: 46, d: 22, h: 240, z0: 182,           // + wall + the spill
    dim: 'bowl ∅24 × 14 on a 24 × 24 × 8 plate, HUNG 190' },
  'grow-lamp':       { w: 96, d: 38, h: 224, z0: 178,           // + deckhead + the spill
    dim: 'fixture 90 × 30 × 20 CM, HUNG 190' },
  'flood-lamp':      { w: 78, d: 44, h: 286, z0: 232,           // + wall + the cone
    dim: 'head 40 × 26 × 30 on a knuckle bracket, HUNG 240' },
});

/** Every paper-fixture id, in this file's own order. */
export const FIXTURE_IDS = Object.freeze(Object.keys(SPECS));

/**
 * The pieces that carry a WALL STUB, and which plane it is: `'back'` (a bulkhead behind, at `y = d`)
 * or `'over'` (a deckhead above, at `z = h`). Exported because it is the SUBJECT of a test rather
 * than an implementation detail — "which of these hangs on something" is a fact about the set, and a
 * builder that quietly stopped drawing its wall should fail by name.
 *
 * ⛔ `deck-hatch` IS DELIBERATELY ABSENT AND IT IS THE ONLY ONE. It is cut into the DECK: the floor
 * line the whole dialect is built on is already its datum, so a stub would be a second, contradictory
 * answer to "what is this mounted to". It is also what keeps the dashed cut edge meaning ONE thing in
 * this module — `paper-fixtures.test.js` asserts thirteen carry it and this one does not.
 */
export const STUB_PLANE = Object.freeze({
  'door-sliding': 'back',
  'door-airlock': 'back',
  'door-blast': 'back',
  'conduit-run': 'back',
  'vent-grille': 'back',
  'extractor-fan': 'back',
  'hull-port': 'back',
  'bulkhead-screen': 'back',
  'arms-rack': 'back',
  'deck-marker': 'back',
  'lamp-sconce': 'back',
  'grow-lamp': 'over',
  'flood-lamp': 'back',
});

/** The registry `size` hint — the piece's own centimetres at `PX_PER_CM.catalogue`, DERIVED. */
export const SIZES = Object.freeze(FIXTURE_IDS.reduce((out, id) => {
  out[id] = geometryFor(SPECS[id]).size;
  return out;
}, {}));

/** The DRAWN extent, in the px the builder emits — `BOX` in the larger axis by construction. */
export const BOX_EXTENT = Object.freeze(FIXTURE_IDS.reduce((out, id) => {
  out[id] = geometryFor(SPECS[id]).extent;
  return out;
}, {}));

/** Fixture `id`'s own frame — `fittings.geometryFor`'s, so there is one derivation, not two. */
export function frameFor(id) {
  const g = geometryFor(SPECS[id]);
  return g === undefined ? undefined : g.frame;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The upright-circle vocabulary — the only geometry this module adds to the dialect
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The oblique's two ratios as MAGNITUDES, read from the kit. See `fittings.js` for the sign note. */
const DX = DEPTH_RATIO.x;
const DY = Math.abs(DEPTH_RATIO.y);

/**
 * A TRUE CIRCLE in the frontal plane at depth `y` — a porthole, a hatch dog, a fan hub, a status
 * lamp. Not `disc()`: that is the catalogue's LEVEL ellipse, which is the right drawing for a thing
 * lying on the floor and the wrong one for a thing set into a bulkhead.
 */
function faceDisc(s, F, x, y, z, rCm, o = {}) {
  const [cx, cy] = F.project(x, y, z);
  s.circle({
    cx,
    cy,
    r: F.s * rCm,
    fill: o.fill === undefined ? PAPER : o.fill,
    stroke: o.stroke == null ? INK : o.stroke,
    sw: o.sw == null ? W.fine : o.sw,
    opacity: o.opacity,
  });
}

/**
 * A CYLINDER LYING ALONG THE DEPTH AXIS — a coaming, a porthole spigot: two face circles at `y0` and
 * `y1` joined by their two common tangents.
 *
 * ⚠️ THE TANGENTS ARE PERPENDICULAR TO THE DEPTH VECTOR, WHICH IS NOT THE VERTICAL. A centimetre of
 * depth moves a point `(+DX, −DY)`; the silhouette of a tube swept along that direction is therefore
 * the pair of lines through the two centres offset by `±r` along `(DY, DX)/|(DX, DY)|`. Drawing them
 * vertically — the obvious mistake — leaves a visible gap at the top of the tube and an overlap at
 * the bottom, which reads as a badly-traced ring rather than as a thickness.
 *
 * Draw order is the kit's own for a cylinder: the far end first, then the tangents, then the near end
 * OPAQUE over both, so no back edge ever shows through the body.
 */
function tube(s, F, x, y0, y1, z, rCm, o = {}) {
  const [fx, fy] = F.project(x, y0, z);
  const [bx2, by2] = F.project(x, y1, z);
  const r = F.s * rCm;
  const m = Math.hypot(DX, DY);
  const [ux, uy] = [(DY / m) * r, (DX / m) * r];
  const sw = o.sw == null ? W.mid : o.sw;
  s.circle({ cx: bx2, cy: by2, r, fill: PAPER, stroke: INK, sw });
  for (const g of [1, -1]) {
    ink(s, `M${nn(fx + g * ux)} ${nn(fy + g * uy)} L${nn(bx2 + g * ux)} ${nn(by2 + g * uy)}`,
      { sw, cap: false });
  }
  s.circle({ cx: fx, cy: fy, r, fill: o.fill === undefined ? PAPER : o.fill, stroke: INK, sw });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The harness
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The painter's environment. ⚠️ `hatch` IS A GETTER for `fittings.js`'s stated reason — `deck-hatch`
 * has no hatched face at all and must not register a `<pattern>` it never references. ⛔ DO NOT
 * SPREAD THIS OBJECT: a spread evaluates getters.
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

/** An item fragment whose painter draws in the fixture's own centimetres. */
function fixture(id, opts, paint) {
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state)); });
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WAYS THROUGH — the four things a crew member walks (or climbs) past
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 01 DOOR, SLIDING · opening 100 × 208 · frame 132 × 18 × 236 · "Bi-parting. Power it or push it."
//
// The warm piece was a steel leaf with a lit amber strip DOWN THE CENTRE, which only makes sense on
// a bi-parting door — so it is drawn as one: two leaves meeting on a heavy seam, hung off a head
// track on two rollers. That seam is the silhouette at 22 px, and it is the identifying feature the
// item-set document's own caption is about. The state lamp on the near jamb is the piece's lit part.
const drawDoorSliding = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 18, 0, 132, 0, 236, hatch);
  bx(s, F, 0, 0, 0, 16, 216, 18, { hatch });                          // the near jamb
  bx(s, F, 116, 0, 0, 16, 216, 18, { hatch });                        // the far jamb
  bx(s, F, 0, 0, 216, 132, 20, 18, { hatch, sw: W.heavy });           // the lintel
  bx(s, F, 10, 0, 208, 112, 6, 6, { hatch, sw: W.fine });             // the head track
  bx(s, F, 16, 6, 0, 50, 200, 6, { hatch });                          // the near leaf
  bx(s, F, 66, 6, 0, 50, 200, 6, { hatch });                          // the far leaf
  for (const x of [34, 98]) {
    line(s, F, [[x, 4, 200], [x, 4, 208]], { sw: W.mid });            // the hanger …
    faceDisc(s, F, x, 4, 208, 3, { sw: W.fine });                     // … and its roller
  }
  line(s, F, [[66, 6, 0], [66, 6, 200]], { sw: W.mass });             // ⭐ the meeting seam
  for (const x of [58, 74]) line(s, F, [[x, 6, 96], [x, 6, 124]], { sw: W.heavy });
  for (const x of [16, 116]) {
    line(s, F, [[x, 6, 0], [x, 6, 200]], { sw: W.hair, opacity: 0.55, cap: false });
  }
  line(s, F, [[8, 2, 0], [124, 2, 0]], { sw: W.fine, opacity: 0.5, cap: false });   // the floor guide
  faceDisc(s, F, 124, 0, 108, 3.5, { fill: powered ? INK : PAPER, sw: W.fine });
};
export const doorSliding = (opts = {}) => fixture('door-sliding', opts, drawDoorSliding);

// 02 DOOR, AIRLOCK · hatch ∅92 in a ∅112 coaming, SILL 20 · "The last thing between you and none."
//
// ⭐ THE ONE ACCENT ON THIS PIECE IS THE POINT OF THE PIECE. The dialect has one colour and it means
// attention; an airlock is the only fitting on this ship where the attention is that the space on the
// other side may have no air in it. It is drawn the way `battery-bank` draws its bus-bar warning — a
// path triangle with a bang inside, never a font glyph (charter §1).
//
// The sill is 20 cm off the deck and the wall stub is cut there, dashed: a coaming really does stand
// on a lip, and the dash is this dialect's "the bulkhead continues below the drawing".
const drawDoorAirlock = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 34, 0, 124, 20, 158, hatch);
  bx(s, F, 24, 4, 20, 76, 16, 30, { hatch, sw: W.mid });              // the sill
  tube(s, F, 62, 8, 34, 92, 56, { sw: W.heavy });                     // the coaming
  faceDisc(s, F, 62, 6, 92, 46, { sw: W.heavy });                     // the hatch leaf
  faceDisc(s, F, 62, 6, 92, 41, { fill: 'none', sw: W.hair, opacity: 0.6 });
  for (let i = 0; i < 6; i += 1) {                                    // six dogs, on their arms
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    line(s, F, [[62 + dx * 20, 5, 92 + dz * 20], [62 + dx * 40, 5, 92 + dz * 40]],
      { sw: W.fine, opacity: 0.75 });
    faceDisc(s, F, 62 + dx * 43, 5, 92 + dz * 43, 3.2, { sw: W.fine });
  }
  faceDisc(s, F, 62, 4, 92, 15, { sw: W.mid });                       // the undogging wheel
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    line(s, F, [[62 + Math.cos(a) * 4, 4, 92 + Math.sin(a) * 4],
      [62 + Math.cos(a) * 14, 4, 92 + Math.sin(a) * 14]], { sw: W.fine });
  }
  faceDisc(s, F, 62, 4, 92, 4, { fill: powered ? INK : PAPER, sw: W.fine });
  line(s, F, [[55, 4, 56], [69, 4, 56], [62, 4, 68]],                 // ⭐ VACUUM BOUNDARY
    { sw: W.mid, stroke: ATTEND, close: true });
  line(s, F, [[62, 4, 58], [62, 4, 64]], { sw: W.hair, stroke: ATTEND });
};
export const doorAirlock = (opts = {}) => fixture('door-airlock', opts, drawDoorAirlock);

// 03 DOOR, BLAST · opening 120 × 212 · slab 120 × 14 × 212 · "Sealed. Do not pass."
//
// The identifying feature the item-set document gives this piece is TWO HAZARD BANDS, and they are
// the second and last accent in the set. ⚠️ A BAND IS DRAWN AS TAPE, NOT AS A FILL: eight short
// oxblood diagonals between two ink rules. A solid oxblood rectangle at this size is a third of the
// piece in the attention colour, which would spend the whole set's accent budget on one door and make
// every genuine alarm elsewhere on the screen quieter.
//
// ⚠️ AND THE DIAGONALS ARE SHORT ON PURPOSE — ruling E8 class 1. A long diagonal across a piece is
// this dialect's mark for "cancelled"; each stripe here is 20 cm on a 156 cm door, i.e. ~6% of the
// piece's own diagonal, and `paper-fixtures.test.js` holds the whole set to that rule with the
// catalogue's own strike-through as an inclusion control.
const drawDoorBlast = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 26, 0, 156, 0, 254, hatch);
  bx(s, F, 0, 0, 0, 18, 232, 26, { hatch });
  bx(s, F, 138, 0, 0, 18, 232, 26, { hatch });
  bx(s, F, 0, 0, 232, 156, 22, 26, { hatch, sw: W.heavy });           // the lintel
  bx(s, F, 12, 0, 220, 132, 8, 8, { hatch, sw: W.fine });             // the track
  bx(s, F, 18, 6, 0, 120, 212, 14, { hatch, sw: W.mass });            // ⭐ the slab
  for (const x of [45, 111]) {
    line(s, F, [[x, 4, 212], [x, 4, 220]], { sw: W.heavy });
    faceDisc(s, F, x, 4, 220, 4, { sw: W.fine });
  }
  for (const x of [42, 72, 102, 132]) {
    line(s, F, [[x, 6, 14], [x, 6, 198]], { sw: W.heavy, opacity: 0.5, cap: false });
  }
  for (const z of [34, 170]) {                                        // ⭐ the two hazard bands
    for (const zz of [z, z + 18]) {
      line(s, F, [[22, 6, zz], [134, 6, zz]], { sw: W.hair, cap: false });
    }
    for (let i = 0; i < 8; i += 1) {
      const x = 24 + i * 14;
      line(s, F, [[x, 6, z + 1], [x + 12, 6, z + 17]], { sw: W.fine, stroke: ATTEND });
    }
  }
  faceDisc(s, F, 78, 6, 112, 11, { sw: W.mid });                      // the centre dog
  faceDisc(s, F, 78, 6, 112, 3, { fill: powered ? INK : PAPER, sw: W.hair });
  line(s, F, [[78, 4, 112], [96, 4, 104]], { sw: W.heavy });          // its lever
};
export const doorBlast = (opts = {}) => fixture('door-blast', opts, drawDoorBlast);

// 04 DECK HATCH · opening ∅90 · coaming ∅118 × 14 · "Down to the deck below. Mind the rail."
//
// ⭐ THE ONLY PIECE IN THIS FILE THAT TAKES FLOOR, AND THE ONLY ONE THAT IS GENUINELY ROUND-AND-LEVEL:
// a hatch in a deck has no heading, so it is `disc()`/`cyl()` all the way down and it registers no
// hatch pattern at all. The silhouette is deliberately unlike anything else in the two catalogues — a
// bold level ring with a ladder hanging out of the bottom of it — because at 22 px on the Overview a
// deck hatch has to be readable as "you can leave this deck here" and nothing else in the set is a
// ring with a tail.
//
// ⚠️ THE LADDER IS DRAWN BELOW THE DECK LINE, which is what `z0: -8` is for. In cabinet oblique a
// ladder descending through a hole runs straight down the page and emerges under the opening ellipse
// — that IS the cutaway reading, and it is the same "the drawing stops, the thing does not" statement
// the wall stubs make with their dashed edges.
const drawDeckHatch = (s, { F }) => {
  cyl(s, F, 59, 59, 0, 14, 59, { sw: W.heavy });                      // the coaming
  disc(s, F, 59, 59, 14, 45, { fill: PAPER_FLAT, sw: W.mid });        // the well
  disc(s, F, 59, 59, 14, 40, { fill: 'none', sw: W.hair, opacity: 0.5 });
  for (const x of [43, 75]) line(s, F, [[x, 88, 14], [x, 88, -56]], { sw: W.heavy, cap: false });
  for (const z of [2, -20, -42]) line(s, F, [[43, 88, z], [75, 88, z]], { sw: W.mid });
  for (const x of [40, 78]) {
    disc(s, F, x, 112, 14, 5, { fill: 'none', sw: W.fine });          // the stanchion foot …
    line(s, F, [[x, 112, 14], [x, 112, 74]], { sw: W.mass });         // … and its post
  }
  // ⚠️ ONE RAIL, AND THE SECOND ONE WAS DELETED AFTER LOOKING AT THE RENDER: two rails between two
  // posts close into a rectangle and the piece read as a gate standing behind a ring rather than as a
  // handhold at the top of a ladder. A grab rail is one rail.
  line(s, F, [[40, 112, 74], [78, 112, 74]], { sw: W.heavy });        // the grab rail
};
export const deckHatch = (opts = {}) => fixture('deck-hatch', opts, drawDeckHatch);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SERVICES — the runs and the air
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 05 CONDUIT RUN · tray 240 × 14 × 14, HUNG 220 · "Three nodes. If they are dark, so is the deck."
//
// ⚠️ THIS PIECE KEEPS `glyph: null` AND THAT IS A DECISION WITH A NAME. `DeviceKind.Conduit` and
// `DeviceKind.Pipe` share `'~'` — an intentional collision in `Glyphs.cs` — and both are UTILITY-LENS
// overlay lines drawn by other layers, never furniture on a tile. `items/glyph-map.js` and
// `device-sprite-coverage.test.js` record that by name for the warm `power-conduit`; this drawing
// serves the surfaces that DO reach it (the catalogue sheet, the twins gallery, a room's own service
// run) and claims no char.
//
// The three nodes are the warm piece's identifying feature ("three glowing amber nodes") and they are
// the lit part: ink-filled when powered, empty when not.
const drawConduitRun = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 26, 0, 264, 204, 248, hatch);
  bx(s, F, 12, 0, 220, 240, 14, 14, { hatch });                       // the tray
  for (const x of [40, 132, 224]) line(s, F, [[x, 14, 234], [x, 26, 244]], { sw: W.mid });
  for (const [z, o] of [[224, 0.75], [228, 0.55], [232, 0.4]]) {
    line(s, F, [[16, 0, z], [248, 0, z]], { sw: W.fine, opacity: o, cap: false });
  }
  for (const x of [44, 132, 220]) {                                   // ⭐ the three nodes
    faceDisc(s, F, x, 0, 228, 5, { fill: powered ? INK : PAPER, sw: W.mid });
  }
  line(s, F, [[252, 4, 220], [252, 4, 208]], { sw: W.mid });          // the drop …
  line(s, F, [[252, 4, 208], [252, 4, 206]], { sw: W.mid, dash: CUT_DASH, cap: false });
};
export const conduitRun = (opts = {}) => fixture('conduit-run', opts, drawConduitRun);

// 06 VENT GRILLE · 40 × 40 in a 54 × 12 × 54 frame, HUNG 200 · "Where the air comes in, if it comes."
//
// Real louvres, not a stripe pattern: each blade is a QUAD that leaves the recess at `y = 4` and
// comes forward-down to `y = 0`, so the eye reads a tilted slat with a shadow line under it rather
// than five parallel rules. The recess behind them is hatched — it is a hole in a bulkhead, and a cut
// face is what the hatch means everywhere else in this dialect.
const drawVentGrille = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 16, 0, 54, 190, 262, hatch);
  bx(s, F, 0, 4, 200, 54, 54, 12, { hatch, sw: W.heavy });            // the frame
  quad(s, F, [[7, 6, 207], [47, 6, 207], [47, 6, 247], [7, 6, 247]], { fill: hatch, sw: W.fine });
  for (const z of [244, 236, 228, 220, 212]) {                        // ⭐ the louvre blades
    quad(s, F, [[7, 4, z], [47, 4, z], [47, 0, z - 4], [7, 0, z - 4]],
      { fill: PAPER_FLAT, sw: W.hair });
  }
  for (const [x, z] of [[4, 204], [50, 204], [4, 250], [50, 250]]) {
    faceDisc(s, F, x, 4, z, 2.2, { fill: 'none', sw: W.hair });
  }
  if (powered) {
    for (const x of [16, 27, 38]) {
      line(s, F, [[x, 0, 198], [x, 0, 192]], { sw: W.hair, opacity: 0.55 });
    }
  }
};
export const ventGrille = (opts = {}) => fixture('vent-grille', opts, drawVentGrille);

// 07 EXTRACTOR FAN · housing 64 × 18 × 64 · impeller ∅52, HUNG 194 · "Pulls the galley smoke out."
//
// ⚠️ FIVE CURVED BLADES, NOT FOUR QUARTER SECTORS — and the difference is the one `wrecked.js`'s
// header already argues about the warm fan's conic gradient. Four alternating quadrants make a disc
// with a cross in it, which at tile size averages back into a plain circle; five bowed blades leaving
// the hub keep a pinwheel silhouette down to 22 px. Each blade is a `curve()` at constant depth, so
// it is in the dialect and not a px-space flourish.
const drawExtractorFan = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 26, 0, 76, 190, 266, hatch);
  bx(s, F, 6, 8, 194, 64, 64, 18, { hatch, sw: W.heavy });            // the housing
  bx(s, F, 24, 18, 258, 28, 8, 8, { hatch, sw: W.fine });             // the discharge duct
  faceDisc(s, F, 38, 8, 226, 26, { sw: W.mid });
  faceDisc(s, F, 38, 8, 226, 24, { fill: 'none', sw: W.hair, opacity: 0.6 });
  for (let i = 0; i < 5; i += 1) {                                    // ⭐ the impeller
    const a = (i * 2 * Math.PI) / 5;
    const b = a + 0.85;
    curve(s, F,
      [38 + Math.cos(a) * 5, 6, 226 + Math.sin(a) * 5],
      [38 + Math.cos(a + 0.5) * 17, 6, 226 + Math.sin(a + 0.5) * 17],
      [38 + Math.cos(b) * 22, 6, 226 + Math.sin(b) * 22],
      { sw: W.mid });
  }
  faceDisc(s, F, 38, 5, 226, 5, { fill: powered ? INK : PAPER, sw: W.fine });
  for (const [x, z] of [[11, 199], [65, 199], [11, 253], [65, 253]]) {
    faceDisc(s, F, x, 8, z, 2.2, { fill: 'none', sw: W.hair });
  }
  line(s, F, [[38, 6, 194], [38, 6, 191]], { sw: W.hair, opacity: 0.6 });   // the condensate drip
};
export const extractorFan = (opts = {}) => fixture('extractor-fan', opts, drawExtractorFan);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WALL FURNITURE — the four pieces that hang on a bulkhead and do a job
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 08 HULL PORT · glass ∅58 in a ∅78 × 14 frame, SILL 116 · "The only window on this deck."
//
// ⭐ THE GLASS IS THE ONE INK-FILLED AREA IN THE SET, AND IT IS THE IDENTITY. Everything else in both
// catalogues is paper with ink edges; a porthole is a hole into the night, and a solid ink disc with
// five paper stars in it is the only drawing in the dialect that says so. It also survives the
// downscale better than any outline could: at 22 px the piece is a black dot in a ring, which is
// exactly right.
const drawHullPort = (s, { F, hatch }) => {
  wallStub(s, F, 'back', 18, 0, 98, 112, 204, hatch);
  tube(s, F, 49, 4, 18, 155, 39, { sw: W.heavy });                    // the spigot
  faceDisc(s, F, 49, 4, 155, 33, { fill: 'none', sw: W.fine, opacity: 0.7 });
  faceDisc(s, F, 49, 3, 155, 29, { fill: INK, sw: W.mid });           // ⭐ the night outside
  for (const [dx, dz, r] of [[-13, 9, 1.4], [7, 14, 1], [16, -6, 1.2], [-6, -12, 0.9], [12, 3, 0.8]]) {
    faceDisc(s, F, 49 + dx, 2, 155 + dz, r, { fill: PAPER, stroke: PAPER, sw: W.hair });
  }
  for (let i = 0; i < 6; i += 1) {                                    // the dogs round the rim
    const a = (i * Math.PI) / 3;
    faceDisc(s, F, 49 + Math.cos(a) * 36, 3, 155 + Math.sin(a) * 36, 2.6, { sw: W.fine });
  }
  line(s, F, [[16, 2, 113], [82, 2, 113]], { sw: W.fine, opacity: 0.6, cap: false });  // the drip rail
};
export const hullPort = (opts = {}) => fixture('hull-port', opts, drawHullPort);

// 09 BULKHEAD SCREEN · screen 88 × 50 in a 100 × 10 × 62 bezel, HUNG 126 · "A readout, if it is fed."
//
// The readout is DELIBERATELY ILLEGIBLE — four hairline rules and a three-bar chart, not text. That
// is `cryo.js`'s and `resources.js`'s standing decision for this set ("there is a readout here, and
// it is not legible at this size"), and it is the honest one: at the ~22 px the Overview draws a
// piece at, a glyph is a smudge that costs more than it tells. `state:'off'` empties the face
// entirely, which is what a dead screen looks like on paper.
const drawBulkheadScreen = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 14, 0, 108, 112, 202, hatch);
  for (const x of [12, 96]) line(s, F, [[x, 10, 184], [x, 14, 192]], { sw: W.fine });   // the mounts
  bx(s, F, 4, 4, 126, 100, 62, 10, { hatch, sw: W.heavy });           // the bezel
  quad(s, F, [[10, 4, 132], [98, 4, 132], [98, 4, 182], [10, 4, 182]],
    { fill: powered ? PAPER_FLAT : PAPER, sw: W.fine });
  if (powered) {
    for (const z of [140, 148, 156, 164]) {
      line(s, F, [[16, 4, z], [64, 4, z]], { sw: W.hair, opacity: 0.5, cap: false });
    }
    for (const [x, up] of [[72, 12], [80, 26], [88, 18]]) {
      line(s, F, [[x, 4, 138], [x, 4, 138 + up]], { sw: W.mid, opacity: 0.8 });
    }
    line(s, F, [[16, 4, 174], [50, 4, 174]], { sw: W.hair, opacity: 0.4, cap: false });
  }
  curve(s, F, [20, 6, 126], [14, 6, 118], [14, 4, 113], { sw: W.fine, opacity: 0.65 });
};
export const bulkheadScreen = (opts = {}) => fixture('bulkhead-screen', opts, drawBulkheadScreen);

// 10 ARMS RACK · 110 × 28 × 96, HUNG 44 · "Three arms and a crate. Two lengths, so it is not a fence."
//
// The warm piece's own redraw note is kept as the rule here: FOUR identical bars re-average into a
// stripe pattern at tile size, so this is three arms of two lengths, each with a stock resting on the
// butt shelf and a barrel standing against the top rail — an arm with a BUTT is what makes a rack a
// rack rather than a radiator.
const drawArmsRack = (s, { F, hatch }) => {
  // ⚠️ THE STUB STARTS AT 44, WHICH IS WHERE THE BUTT SHELF STARTS. It was drafted at 46 — so `z0`,
  // whose whole definition is "the lowest z the piece draws at", was 2 cm ABOVE the lowest z the piece
  // draws at, and the sheet caption computed from it read HUNG 46 for a rack that hangs at 44.
  //
  // ⛔ AND THE BOX PROBE COULD NOT HAVE CAUGHT IT — MEASURED, NOT ASSUMED, because the obvious story
  // ("it drew outside its box") is false and worth killing before someone repeats it. The shelf stands
  // 4 cm back from the near face, and 4 cm of depth lifts a point further up the page than 2 cm of
  // height drops it: through this piece's own frame the shelf's near-bottom corner (3, 4, 44) lands at
  // y 54.080 against a box bottom of 54.500 — INSIDE by 0.42 px, with `z0` wrong by 2 cm. A guard on
  // where the ink lands cannot see a datum that is wrong in the direction the projection forgives; the
  // only instrument for this one is reading the painter, which is what review did.
  // (At the corrected `z0` the same corner reads 53.210 against 55.500, and the drawn extent grows
  // 112×109 → 112×111 — so the piece really does redraw, slightly, and its shots are regenerated.)
  wallStub(s, F, 'back', 32, 0, 116, 44, 152, hatch);
  bx(s, F, 3, 22, 48, 110, 96, 10, { hatch });                        // the back panel
  bx(s, F, 3, 4, 44, 110, 10, 28, { hatch, sw: W.heavy });            // the butt shelf
  // ⚠️ THE ARMS LEAN, THEY DO NOT HANG, AND THE FIRST DRAFT HAD THEM HANGING. With the rail at 124
  // and the stocks at 52 the barrels were 70 cm of hairline between a box on a shelf and a bar near
  // the top of the card, and the piece read as three pendulums — found by rendering the sheet, not by
  // reasoning. The rail is now a RETAINING rail at chest height, the barrels are `mass` weight, and
  // each one stands PROUD of the rail with a muzzle tick, which is what a rack of arms looks like.
  // ⭐ THE TOPS ARE 128/128/118 AND THE NUMBERS WERE SET BY THE PAINT-ORDER PROBE, NOT BY EYE. Drafted
  // at 104 the short arm's muzzle sat BELOW the retaining rail at 106 and, once the rail was correctly
  // emitted after the arms, was covered entirely by that rail's opaque paper face — zero visible
  // pixels, on the piece's own identifying feature. Raising it to 116 did NOT fix it and that is the
  // instructive half: the rail's TOP face recedes, so it covers everything below `113 + 0.6·d`, which
  // at the arms' depth of 12 cm is up to 124 — a member "above" the rail in centimetres can still be
  // behind it in the picture. The rail is 14 cm deep now and both lengths clear 123.8.
  // Two lengths is the rule (four of one re-average into a stripe at tile size); both must clear.
  for (const [x, top] of [[14, 128], [44, 128], [74, 118]]) {
    bx(s, F, x, 10, 54, 15, 24, 16, { hatch, sw: W.fine });           // ⭐ the stock …
    line(s, F, [[x + 7, 12, 78], [x + 7, 12, top]], { sw: W.mass });  // … its barrel …
    line(s, F, [[x + 4, 12, top], [x + 10, 12, top]], { sw: W.mid }); // … and its muzzle
  }
  // ⛔ THE RAIL IS EMITTED AFTER THE ARMS, AND THAT IS WHAT "RETAINING" MEANS. Drawn before them it
  // is a shelf the barrels stand in front of, which is the opposite of the job it does.
  bx(s, F, 3, 4, 106, 110, 7, 14, { hatch, sw: W.heavy });            // the retaining rail
  bx(s, F, 94, 8, 54, 18, 26, 22, { hatch, sw: W.mid });              // the ammunition crate
  line(s, F, [[98, 8, 64], [108, 8, 64]], { sw: W.hair, opacity: 0.6 });
  // ⛔ THE BACK PANEL IS FLUSH TO THE WALL (`y = 22..32`, and `d` IS 32), so this piece has no
  // stand-off bracket to draw and inventing one would be a member joining two things that touch.
  // Its fixing is what a flush-mounted rack really has: bolts through the panel's own face, placed in
  // the band above the rail where that face is not behind anything.
  for (const x of [10, 106]) faceDisc(s, F, x, 22, 132, 2.6, { fill: 'none', sw: W.hair });
};
export const armsRack = (opts = {}) => fixture('arms-rack', opts, drawArmsRack);

// 11 DECK MARKER · plate 64 × 8 × 28, HUNG 194 · "Which deck, and which way out."
//
// The warm piece set `2 ▸` as 15-px text on a post. Both halves are replaced: the arrow is a PATH
// (charter §1 — a glyph outside the two shipped faces is drawn, never set) and the legend beside it
// is three hairline rules, the same illegible-readout decision the screen above makes. The post is
// gone because a wayfinding sign on a ship is on a bulkhead at head height, not on a stalk in the
// middle of a corridor — which is also why the mounting height is the number that matters here.
const drawDeckMarker = (s, { F, hatch }) => {
  wallStub(s, F, 'back', 16, 0, 72, 192, 226, hatch);
  // ⚠️ THE LUGS ARE EMITTED BEFORE THE PLATE, WHICH IS THE CATALOGUE'S OWN CONSTRUCTION FOR A
  // WALL-HUNG PIECE (`space-heater`'s brackets, `fittings.js`). A member that runs from a body's BACK
  // face to the wall behind it is partly inside that body's silhouette; drawing it after the plate
  // would paint it across the plate's own face, which is ruling E8 class 3 in the opposite direction.
  // Emitted first, only the part that clears the plate shows — which is the part that is really there.
  for (const x of [12, 60]) line(s, F, [[x, 12, 216], [x, 16, 222]], { sw: W.fine });
  bx(s, F, 4, 4, 194, 64, 28, 8, { hatch, sw: W.heavy });             // the plate
  quad(s, F, [[8, 4, 198], [64, 4, 198], [64, 4, 218], [8, 4, 218]], { sw: W.hair });
  line(s, F, [[38, 4, 208], [56, 4, 208]], { sw: W.mass });           // ⭐ the arrow shaft …
  line(s, F, [[48, 4, 216], [58, 4, 208], [48, 4, 200]], { sw: W.mass });   // … and its head
  for (const z of [204, 208, 212]) {                                  // the legend, deliberately mute
    line(s, F, [[13, 4, z], [31, 4, z]], { sw: W.hair, opacity: 0.55, cap: false });
  }
};
export const deckMarker = (opts = {}) => fixture('deck-marker', opts, drawDeckMarker);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LIGHT — three luminaires that must not be each other at tile size
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 12 LAMP, SCONCE · bowl ∅24 × 14 on a 24 × 24 × 8 plate, HUNG 190 · "Light down a wall, no more."
//
// ⚠️ THE THREE LAMPS ARE SEPARATED BY SILHOUETTE, NOT BY SIZE, and that is a decision made once for
// all three: `GLYPH_SUBSTITUTE['*']` puts DeviceKind.Light on this piece, so it is the one a player
// meets most and it has to be unmistakable beside the other two. SCONCE = a bowl on a wall plate with
// a short splay of rays. GROW LAMP = a wide bar under a deckhead with tubes across it. FLOOD LAMP = a
// box head on a knuckle bracket throwing a hard cone sideways. Different outline, different mounting,
// different spill.
//
// The bowl's mouth is a LEVEL ellipse and that is correct: it is a horizontal opening seen from
// slightly above, the same construction the catalogue's deck lamp uses for its shade.
//
// ⛔ THE DIMENSION LINE WAS THE THING THAT WAS WRONG HERE, NOT THE DRAWING, AND IT IS WORTH SAYING
// WHICH WAY ROUND. It read "bowl 30 × 16 × 14 on a 30 × 32 plate" — a first draft's intent, kept
// after the render moved the piece. Measured off the ink below: the plate is `bx(11, 14, 208, 24,
// 24, 8)`, i.e. 24 across × 24 up × 8 deep, flush to the wall at y = 22; and the bowl is a CONE, not
// a box — its mouth is `disc(…, r 12)`, ∅24, its throat `disc(…, r 4)` at z 204, and the two sit at
// a constant depth y = 6, so it has no third dimension to give. ∅24 × 14 is what it is. Prose loses
// to the ink whenever they disagree: the drawing was corrected by looking at the render, and the
// sentence never was.
const drawLampSconce = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 22, 0, 46, 182, 240, hatch);
  bx(s, F, 11, 14, 208, 24, 24, 8, { hatch, sw: W.mid });             // the wall plate
  // ⚠️ THE ARM LEAVES THE PLATE'S FRONT-BOTTOM EDGE AND THE SHADE HANGS CLEAR OF IT, which is the
  // second thing the render corrected. Drafted with the shade's top at z = 210 the whole arm lay
  // inside the plate's own front face and drew as a stray diagonal ACROSS it — the heater's supply
  // pipe again (`fittings.js`, ruling E8 class 3), in a piece where the arm is the only thing
  // connecting the lamp to the wall.
  line(s, F, [[23, 14, 208], [23, 6, 204]], { sw: W.mid });           // the arm
  for (const g of [-1, 1]) {                                          // the shade, a cone
    line(s, F, [[23 + g * 4, 6, 204], [23 + g * 12, 6, 190]], { sw: W.mid });
  }
  disc(s, F, 23, 6, 204, 4, { sw: W.fine });
  disc(s, F, 23, 6, 190, 12, { fill: 'none', sw: W.mid });            // ⭐ its mouth
  if (powered) {
    disc(s, F, 23, 6, 190, 6, { fill: INK, sw: W.hair });             // ⭐ the lit part
    for (const [a, b] of [[13, 10], [23, 23], [33, 36]]) {
      line(s, F, [[a, 4, 188], [b, 4, 182]], { sw: W.hair, opacity: 0.6 });
    }
  }
  line(s, F, [[14, 14, 228], [32, 14, 228]], { sw: W.hair, opacity: 0.5, cap: false });
};
export const lampSconce = (opts = {}) => fixture('lamp-sconce', opts, drawLampSconce);

// 13 GROW LAMP · fixture 90 × 30 × 20, HUNG 190 from the deckhead · "Over the beds. Runs hot."
//
// ⭐ THE ONLY PIECE IN EITHER CATALOGUE THAT HANGS FROM A CEILING, so its wall stub is an `'over'`
// plane rather than a `'back'` one — the same hatched fragment with the same dashed cut edges, at
// `z = h`. The catalogue's curtain rail is the precedent and this is the second instance.
//
// ⚠️ THE EMITTERS ARE ON THE FRONT FACE AND NOT UNDERNEATH, WHICH IS A FACT ABOUT THE PROJECTION
// RATHER THAN ABOUT THE LAMP. Cabinet oblique shows a box's TOP face and never its underside, so a
// downward-facing emitter drawn where it really is would be invisible. Three tubes across the front,
// dimmed by `state`, plus a splay of rays off the front-bottom edge, is how the catalogue's own deck
// lamp says "this is the lit part" — and it is the same answer, not a new one.
const drawGrowLamp = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'over', 224, 0, 96, 0, 38, hatch);
  bx(s, F, 3, 4, 190, 90, 20, 30, { hatch, sw: W.heavy });            // the fixture
  for (const z of [195, 200, 205]) {                                  // ⭐ the three emitters
    line(s, F, [[10, 4, z], [86, 4, z]], { sw: W.mid, opacity: powered ? 0.95 : 0.3, cap: false });
  }
  for (const x of [14, 82]) {
    for (const y of [8, 30]) line(s, F, [[x, y, 210], [x, y, 224]], { sw: W.mid });
  }
  if (powered) {
    for (const [a, b] of [[12, 4], [32, 28], [52, 52], [72, 76], [90, 94]]) {
      line(s, F, [[a, 4, 190], [b, 4, 178]], { sw: W.hair, opacity: 0.55 });
    }
  }
  curve(s, F, [48, 20, 210], [52, 30, 218], [48, 34, 224], { sw: W.fine, opacity: 0.65 });
};
export const growLamp = (opts = {}) => fixture('grow-lamp', opts, drawGrowLamp);

// 14 FLOOD LAMP · head 40 × 26 × 30 on a knuckle bracket, HUNG 240 · "Aim it at the work."
//
// ⚠️ THE BRACKET IS TWO MEMBERS AND NOT ONE, and the reason is ruling E8 class 1 rather than
// engineering: a single arm from the wall pad to the yoke is a 30-px diagonal on a 150-px piece —
// 23% of its own diagonal, close enough to the strike-through limit that the next reader would have
// to argue about it. A knuckle is what a real aimable floodlight has anyway, and each of its two
// members is attached at both ends.
const drawFloodLamp = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 44, 0, 78, 232, 286, hatch);
  bx(s, F, 50, 36, 262, 22, 18, 8, { hatch, sw: W.mid });             // the wall pad
  bx(s, F, 6, 4, 240, 40, 30, 26, { hatch, sw: W.heavy });            // ⭐ the head
  // ⚠️ THE YOKE LANDS ON THE HEAD'S TOP FACE AND NOT ON ITS SIDE, AND THAT IS THE PROJECTION TALKING.
  // A first draft ran the arm to a pivot on the head's right flank at (46, 16, 262); measured through
  // the frame, that point lies INSIDE the head's own side face, which is opaque paper drawn after it —
  // the shrine-shelf defect exactly, on the one member that holds this lamp up. Cabinet oblique shows
  // a box's TOP face, so a top-mounted yoke is both what an aimable floodlight really has and the only
  // attachment this drawing can prove. It is emitted AFTER the head for the same reason.
  // ⚠️ THE ARM LEAVES THE PAD'S FRONT-BOTTOM EDGE (56, 36, 262) AND NOT A POINT INSIDE IT. The first
  // draft started at (62, 40, 270), which is in the pad's interior — so the member was drawn straight
  // through the pad's own face and read as a line crossing a box rather than as an arm leaving it.
  line(s, F, [[56, 36, 262], [46, 30, 272]], { sw: W.heavy });        // the bracket …
  line(s, F, [[46, 30, 272], [30, 22, 270]], { sw: W.heavy });        // … and its knuckle
  disc(s, F, 30, 22, 270, 3.5, { sw: W.fine });                       // the pivot, on the top face
  quad(s, F, [[10, 4, 244], [42, 4, 244], [42, 4, 266], [10, 4, 266]],
    { fill: powered ? PAPER_FLAT : PAPER, sw: W.fine });
  if (powered) {
    for (const [z, b] of [[262, 246], [254, 238], [246, 232]]) {
      line(s, F, [[10, 4, z], [0, 4, b]], { sw: W.hair, opacity: 0.6 });
    }
  }
  line(s, F, [[14, 4, 268], [38, 4, 268]], { sw: W.hair, opacity: 0.5, cap: false });
};
export const floodLamp = (opts = {}) => fixture('flood-lamp', opts, drawFloodLamp);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The painter map + the door a twin comes through
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every fixture's PAINTER, keyed by itemId — the same function its exported builder runs. Each entry
 * is the named `draw…` const above, so a row cannot point at another row's painting; that shape is
 * what `wrecked.test.js` calls the SWAP, and it is invisible to every other guard in this repo.
 */
export const DRAW = Object.freeze({
  'door-sliding': drawDoorSliding,
  'door-airlock': drawDoorAirlock,
  'door-blast': drawDoorBlast,
  'deck-hatch': drawDeckHatch,
  'conduit-run': drawConduitRun,
  'vent-grille': drawVentGrille,
  'extractor-fan': drawExtractorFan,
  'hull-port': drawHullPort,
  'bulkhead-screen': drawBulkheadScreen,
  'arms-rack': drawArmsRack,
  'deck-marker': drawDeckMarker,
  'lamp-sconce': drawLampSconce,
  'grow-lamp': drawGrowLamp,
  'flood-lamp': drawFloodLamp,
});

/**
 * Paint fixture `id` INTO an existing scene, then hand the same scene and the same frame to `extra`,
 * so a caller can add marks in the piece's own centimetres rather than guessing at pixels. This is
 * how the fourteen post-raid twins are drawn — a damaged fixture is the SAME object with damage on
 * it, and re-running the pristine painter is the only construction under which that stays true when
 * the pristine drawing changes. Returns nothing; everything lands in `s`.
 */
export function paintPaperFixture(s, id, extra, state) {
  const draw = DRAW[id];
  if (!draw) return;
  const env = envFor(s, id, state);
  draw(s, env);
  if (typeof extra === 'function') extra(s, env);
}

/** The upright-circle half of the vocabulary, for a caller drawing on one of these pieces. */
export { faceDisc, tube };
