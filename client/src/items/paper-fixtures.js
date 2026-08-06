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
// 190 read 182, a flood lamp at 240 read 232. (⚠️ THAT COUNT IS A HISTORICAL MEASUREMENT AND IS LEFT
// AT THE NUMBERS IT WAS TAKEN WITH: the sconce was redrawn on 2026-08-06 and now hangs at 206. The
// eleventh, `door-airlock`, printed the right
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
// `0.6 · (118 − 16) = 61` cm of dead box above the drawing — a fifth of the tile. They were pushed to
// the BACK rim (y = 112) for that reason.
//
// ⛔ AND THAT FIX HAS SINCE BEEN TRADED AWAY DELIBERATELY, WHICH IS WHY THE ARITHMETIC STAYS HERE.
// A pair of posts at y = 112 standing 24 cm behind a ladder at y = 88 is, at this projection, a few px
// of separation — the two fused into one thick pole and the piece read as a tripod-mounted instrument
// (a cold reader: "a telescope"). The rail and the ladder are ONE structure at y = 88 now, which
// leaves 18 cm of dead box rather than 3. It is a real cost, taken knowingly: the box arithmetic buys
// tile area, and what it was spending it on was making the piece unrecognisable.

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
    dim: 'bowl ∅24 × 14 on a 14 × 18 × 5 plate, HUNG 206' },
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

/**
 * Fixture `id`'s own frame — `fittings.geometryFor`'s, so there is one derivation, not two.
 *
 * ⭐ `facing` (0..3) IS FORWARDED, not interpreted here. It is the whole reason the merge resolution
 * threaded the argument through the SHARED door rather than around it: this catalogue reaches the
 * drawing scale only through `geometryFor`, so a facing that stopped at `fittings.frameFor` would
 * leave the fittings turnable and these fourteen fixtures permanently square-on — one rotation verb
 * that works on one catalogue and silently does nothing on the other. Absent/0 is the identity.
 */
export function frameFor(id, facing) {
  const g = geometryFor(SPECS[id], facing);
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

/**
 * A TRUNCATED CONE standing on the z axis — `fittings.js`'s `cyl()` with two radii instead of one.
 * The body is ONE closed path: the left side, the front half of the lower rim, the right side, and
 * the back half of the upper rim, exactly the winding `cyl` uses so the back edge never shows.
 *
 * ⛔ WHY A PRIMITIVE AND NOT THREE CALLS AT THE SITE, MEASURED RATHER THAN PREFERRED. The obvious
 * composition — a `quad` body with an opaque `disc` closing each rim — does not survive the sketch
 * treatment: at `strong` every element carries its own paper knockout (`haloScope: 'all'`, the style
 * guide's HALO EXCEPTION, the same effect that bites white out of the table's legs), so the two rim
 * discs eat the quad's side runs where they cross and a tapered shade comes back as two black bars
 * between two floating ellipses. One path has one knockout and closes into one silhouette, which is
 * the only thing that survives at 22 px.
 *
 * `rTop === rBot` reproduces `cyl`'s body exactly; the sconce is this module's first caller and the
 * grow-lamp family is where a second would come from.
 */
function cone(s, F, x, y, z0, z1, rBot, rTop, o = {}) {
  const [cx, yb] = F.project(x, y, z0);
  const [, yt] = F.project(x, y, z1);
  const rxB = F.s * rBot; const ryB = DY * F.s * rBot;
  const rxT = F.s * rTop; const ryT = DY * F.s * rTop;
  ink(s,
    `M${nn(cx - rxT)} ${nn(yt)} L${nn(cx - rxB)} ${nn(yb)}`
    + ` A${nn(rxB)} ${nn(ryB)} 0 0 0 ${nn(cx + rxB)} ${nn(yb)}`
    + ` L${nn(cx + rxT)} ${nn(yt)} A${nn(rxT)} ${nn(ryT)} 0 0 1 ${nn(cx - rxT)} ${nn(yt)} Z`,
    { fill: o.fill === undefined ? PAPER : o.fill, sw: o.sw == null ? W.mid : o.sw, cap: false });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The harness
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The painter's environment. ⚠️ `hatch` IS A GETTER for `fittings.js`'s stated reason — `deck-hatch`
 * has no hatched face at all and must not register a `<pattern>` it never references. ⛔ DO NOT
 * SPREAD THIS OBJECT: a spread evaluates getters.
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

/** An item fragment whose painter draws in the fixture's own centimetres.
 *  `sketched: true` — the owner's 2026-08-05 ruling; the seam is `helpers.item()`. */
function fixture(id, opts, paint) {
  // `env.facing` arrives from `helpers.item`, which forwards `opts.facing` — the same seam
  // `fittings.fitting` uses, so both catalogues turn through one mechanism.
  return item(id, opts, (s, env) => { paint(s, envFor(s, id, env.state, env.facing)); },
    { sketched: true });
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
  // ⚠️ THE WEIGHT BALANCE WAS BACKWARDS, AND A BLIND READ CALLED THIS PIECE "A LOCKER". Every piece
  // of sliding-door hardware was already here and every one of it was drawn light: the lintel was the
  // heaviest mark on the drawing (a wardrobe's crown trim), while the head track and its rollers — the
  // ONLY members a hinged locker door cannot have — were `fine` outlines that vanish first at the
  // 22 px the Overview draws at, where "only WEIGHT survives". Not one centimetre moves below; the
  // ramp is inverted so the rail carries the read and the frame board stops shouting.
  bx(s, F, 0, 0, 216, 132, 20, 18, { hatch, sw: W.mid });             // the lintel — a frame board
  bx(s, F, 6, 0, 0, 120, 3, 6, { hatch, sw: W.mid });                 // ⭐ the sill — a threshold
  bx(s, F, 10, 0, 208, 112, 6, 6, { hatch, sw: W.mass });             // ⭐ the head track — the rail
  bx(s, F, 16, 6, 0, 50, 200, 6, { hatch });                          // the near leaf
  bx(s, F, 66, 6, 0, 50, 200, 6, { hatch });                          // the far leaf
  for (const x of [34, 98]) {
    line(s, F, [[x, 4, 200], [x, 4, 208]], { sw: W.heavy });          // the hanger …
    faceDisc(s, F, x, 4, 208, 4.5, { fill: INK, sw: W.mid });         // … and its roller, ON the rail
  }
  line(s, F, [[66, 6, 0], [66, 6, 200]], { sw: W.mass });             // ⭐ the meeting seam
  for (const x of [58, 74]) line(s, F, [[x, 6, 96], [x, 6, 124]], { sw: W.heavy });
  for (const x of [16, 116]) {
    line(s, F, [[x, 6, 0], [x, 6, 200]], { sw: W.hair, opacity: 0.55, cap: false });
  }
  // ⛔ THE 0.5-OPACITY FLOOR HAIRLINE IS GONE AND THE SILL ABOVE REPLACES IT. A threshold is the
  // other half of "a person walks THROUGH this", and a hairline at half strength is the first mark the
  // downscale loses — so the piece was left standing on nothing at exactly the size it matters.
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
  // ⚠️ THE COAMING IS ONE FACE CIRCLE, NOT A `tube()`, AND THE RENDER IS WHY. `tube()` draws the far
  // face, the two tangents, then the near face over them — a construction that reads as a thickness
  // only while the near circle HIDES the far one. At this radius (56 cm, near the piece's whole width)
  // 26 cm of depth offsets the two circles by less than a third of a radius, so a crescent of the BACK
  // circle and both tangent stubs stayed visible outside the near face and read as ducting coiled
  // round the hatch — a cold reader called this piece "a ventilation manifold". `hull-port` gets away
  // with the same construction because its opaque INK glass covers the whole seam; this piece has
  // nothing to cover it with, its leaf being SMALLER than its coaming. So the coaming is the near
  // circle `tube()` already painted last, drawn once and on its own.
  faceDisc(s, F, 62, 8, 92, 56, { sw: W.heavy });                     // the coaming
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
  // ⭐ THE SLAB READS AS SOLID BECAUSE ITS FRONT FACE IS FILLED. On plain paper it was an outline the
  // eye sees straight through, so a 120 × 212 plate carried no mass at all — and a cold reader, primed
  // by this game's own vocabulary, called the piece a cryopod. `PAPER_FLAT` is already this file's
  // tone for a working surface set inside a frame (the deck hatch's well, the vent grille's recess,
  // the screen's face); it is a fill from the closed palette, not a fifth colour.
  bx(s, F, 18, 6, 0, 120, 212, 14, { hatch, sw: W.mass, front: PAPER_FLAT });   // ⭐ the slab
  for (const x of [45, 111]) {
    line(s, F, [[x, 4, 212], [x, 4, 220]], { sw: W.heavy });
    faceDisc(s, F, x, 4, 220, 4, { sw: W.fine });
  }
  // ⛔ TWO EDGE FLANGES, NOT FOUR SEAMS ACROSS THE FIELD — the `arms-rack` rule in this same file
  // ("four identical bars re-average into a stripe pattern at tile size") in a second costume. Four
  // evenly-spaced full-height seams at `heavy` ran straight through both hazard bands and re-averaged
  // into grey cage bars at every tile size. A slab this heavy really is doubled at its jambs; that is
  // where the structure goes, and it leaves the tape-and-wheel field clear.
  for (const x of [30, 126]) {
    line(s, F, [[x, 6, 14], [x, 6, 198]], { sw: W.fine, opacity: 0.4, cap: false });
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
  faceDisc(s, F, 78, 6, 112, 11, { sw: W.mid });                      // the centre dog …
  for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7]]) {        // … its spokes, so the ring
    line(s, F, [[78, 5, 112], [78 + dx, 5, 112 + dz]], { sw: W.hair, opacity: 0.7 });   // reads as a
  }                                                                                      // WHEEL …
  faceDisc(s, F, 78, 6, 112, 3, { fill: powered ? INK : PAPER, sw: W.hair });
  // ⚠️ … AND THE LEVER STARTS CLEAR OF THE RIM. Drawn from the wheel's own centre it ran back through
  // the ring for its first 11 cm, and under this treatment's doubled strokes the ring, the pin and the
  // lever fused into one blob — the piece's only operable-hardware cue, illegible. Started outside the
  // rim, a handle stays a handle.
  line(s, F, [[89, 4, 108], [101, 4, 99]], { sw: W.mid });            // its lever
  // the sill — `door-sliding`'s own device for grounding a leaf on the deck it runs along. Without it
  // nothing in the picture says "this is set into a floor", which is the other half of reading as a
  // door rather than as a free-standing box.
  line(s, F, [[8, 2, 0], [148, 2, 0]], { sw: W.fine, opacity: 0.5, cap: false });
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
  disc(s, F, 59, 59, 14, 45, { fill: PAPER_FLAT, sw: W.heavy });      // the well
  disc(s, F, 59, 59, 14, 40, { fill: 'none', sw: W.hair, opacity: 0.5 });
  // ⚠️ ONE LADDER, AT ONE DEPTH — and the piece had TWO. The rails stood at y = 88 and the grab
  // stanchions at y = 112, 24 cm behind them; at this projection that gap collapses to a few px and
  // the two structures fused into a single thick pole which, rising out of a round base with a
  // crossbar across its top, is a tripod-mounted instrument's own silhouette. A cold reader called
  // this piece "a telescope". There is one rail pair now, run continuously from the grab rail down
  // through the coaming to the ladder's own bottom, with the rung rhythm carried the WHOLE way — so
  // the eye reads a ladder's length rather than a crossbar on two legs.
  //
  // ⛔ AND IT UNIFIES AT y = 88, THE LADDER'S DEPTH, NOT AT THE STANCHIONS' — the polish as drafted
  // pulled everything back to y = 112 and stopped the descent at z0 = −8. That deletes the one thing
  // this piece exists to say: `hasPoint(deck-hatch, [43, 88, −56])` is pinned by name, because a hatch
  // reads as a way DOWN only while its ladder is drawn below the deck line it is cut into, and z0 is
  // the lowest ink AFTER the depth lift (−56 + 0.6·88 = −3.2), never the lowest z a member reaches.
  // ⚠️ THE COST IS PAID HERE AND SAID OUT LOUD: at y = 88 the topmost ink sits 18 cm below the box's
  // own top (the module header's dead-box arithmetic, which is why the stanchions were pushed to the
  // back rim in the first place). Eighteen centimetres of empty paper above a grab rail is air over a
  // hatch; a ladder that stops at the deck is a ring painted on the floor.
  for (const x of [43, 75]) line(s, F, [[x, 88, 74], [x, 88, -56]], { sw: W.heavy, cap: false });
  for (const z of [58, 40, 22, 2, -20, -42]) {
    line(s, F, [[43, 88, z], [75, 88, z]], { sw: W.mid });
  }
  for (const x of [43, 75]) {
    disc(s, F, x, 88, 14, 4, { fill: 'none', sw: W.fine });           // the rail's foot, at the coaming
  }
  // ⚠️ ONE RAIL, AND THE SECOND ONE WAS DELETED AFTER LOOKING AT THE RENDER: two rails between two
  // posts close into a rectangle and the piece read as a gate standing behind a ring rather than as a
  // handhold at the top of a ladder. A grab rail is one rail.
  line(s, F, [[43, 88, 74], [75, 88, 74]], { sw: W.heavy });          // the grab rail
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
  // ⚠️ THE STANDOFFS TIE OFF AT THE TRAY'S OWN HEIGHT, NOT TEN CENTIMETRES ABOVE IT. The old strap
  // ran from the tray's back-top edge up to z 244, near the top of the whole 44 cm wall band — three
  // long diagonals lying PARALLEL to the stub's own 45° hatch, which the eye pools with it into one
  // field of diagonals: a wire mesh panel over a low wheeled bed. A bracket that ties off at the same
  // z as the tray's top is also the true drawing of the real 12 cm gap between tray and bulkhead.
  for (const x of [40, 132, 224]) line(s, F, [[x, 14, 234], [x, 26, 234]], { sw: W.heavy });
  line(s, F, [[12, 0, 234], [252, 0, 234]], { sw: W.mid, cap: false });     // the lid seam
  for (const [z, o] of [[224, 0.75], [228, 0.55], [232, 0.4]]) {
    line(s, F, [[16, 0, z], [248, 0, z]], { sw: W.fine, opacity: o, cap: false });
  }
  // ⭐ THE THREE NODES — kept, and still what `state` moves, but SMALLER and set in the UPPER band of
  // the tray face. At r 5 centred they filled 71% of the tray's own 14 cm height and sat astride its
  // lowest edge: three same-size discs low on a long thin bar under a bracketed rail is a hand-cart's
  // wheels, and a blind read of the sheet came back "a cargo cart". An unbroken band of tray under
  // each disc makes them lamps let into the duct instead.
  for (const x of [44, 132, 220]) {
    faceDisc(s, F, x, 0, 230, 3, { fill: powered ? INK : PAPER, sw: W.mid });
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
    // ⭐ THE POWER LAMP — the one mark on this piece a grate can never carry, and the direct answer to
    // a blind read that came back "a ventilation grate". Same convention the extractor fan uses for
    // its own powered hub two builders up: a small ink-filled face circle. "A readout, IF IT IS FED"
    // is this piece's caption, and until now nothing in the drawing said fed.
    faceDisc(s, F, 91, 3, 128, 1.6, { fill: INK, sw: W.hair });
    // ⚠️ RAGGED ROWS OF UNEQUAL LENGTH AT UNEQUAL SPACING, NOT FOUR FULL-WIDTH RULES 8 CM APART. The
    // old readout reproduced `drawVentGrille`'s louvre rank almost stroke for stroke — same heavy
    // bezel, same hatched stub above, same rank of evenly-spaced horizontal bands inside — so the two
    // pieces were genuinely confusable at a glance. A text block starts at one margin and ends where
    // its line ends; a louvre stack does neither.
    for (const [x1, x2, z] of [[16, 60, 142], [16, 36, 153], [16, 50, 166]]) {
      line(s, F, [[x1, 4, z], [x2, 4, z]], { sw: W.hair, opacity: 0.5, cap: false });
    }
    for (const [x, up] of [[72, 12], [80, 26], [88, 18]]) {
      line(s, F, [[x, 4, 138], [x, 4, 138 + up]], { sw: W.mid, opacity: 0.8 });
    }
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
  // ⭐ AND THE ARM IS REDRAWN AS A WEAPON, because a blind read of the sheet came back "a hydroponic
  // grow bed" and the old numbers say why: a 15 × 24 × 16 stock is CUBE-proportioned — a tray, not a
  // buttstock — and a bare vertical hairline standing out of a squat box under a horizontal rail is a
  // plant stake. Three members answer it, and none of them has a horticultural reading: the stock is
  // narrowed and heightened into an actual buttstock, a trigger guard is drawn under it, and a slung
  // strap crosses the barrel on the diagonal at `heavy` — the one mark here guaranteed to survive to
  // silhouette-and-mass at tile size. The tops (128/128/118) and the depth (12) are UNTOUCHED, so the
  // paint-order clearance the probe won above still holds; only the stock's own proportion moves.
  //
  // ⛔ THE BARREL STAYS TRUE VERTICAL, AND THAT IS TWO GUARDS TALKING, MEASURED RATHER THAN ARGUED.
  // The polish as drafted raked it 6 cm off plumb ("a leaned rifle, not a stake"). Applied, `E8-1`
  // named both long arms — `-33.57,19.48 → -28.35,-24` and `-7.48,19.48 → -2.26,-24`, 28% of this
  // piece's own diagonal against a 25% limit, i.e. the catalogue's mark for "cancelled" laid twice
  // across a rack — and the identifying-feature pin read `three arms: 0`, because a raked barrel is no
  // longer one of the three near-vertical members that pin counts. A leaned rifle is a nice idea that
  // this drawing cannot spell; the stock, the guard and the strap say "weapon" without it.
  for (const [x, top] of [[14, 128], [44, 128], [74, 118]]) {
    bx(s, F, x, 10, 54, 9, 26, 14, { hatch, sw: W.fine });            // ⭐ the buttstock — narrow, tall
    curve(s, F, [x + 1, 10, 58], [x - 3, 10, 51], [x + 7, 10, 47], { sw: W.fine }); // its trigger guard
    line(s, F, [[x + 4, 12, 78], [x + 4, 12, top]], { sw: W.mass });  // … its barrel …
    line(s, F, [[x + 1, 12, top], [x + 7, 12, top]], { sw: W.mid });  // … and its muzzle
    line(s, F, [[x + 2, 8, 66], [x + 12, 8, 92]], { sw: W.heavy, opacity: 0.85 }); // the slung strap
  }
  // ⛔ THE RAIL IS EMITTED AFTER THE ARMS, AND THAT IS WHAT "RETAINING" MEANS. Drawn before them it
  // is a shelf the barrels stand in front of, which is the opposite of the job it does.
  bx(s, F, 3, 4, 106, 110, 7, 14, { hatch, sw: W.heavy });            // the retaining rail
  bx(s, F, 94, 8, 54, 18, 26, 22, { hatch, sw: W.mid });              // the ammunition crate
  line(s, F, [[98, 8, 64], [108, 8, 64]], { sw: W.hair, opacity: 0.6 });        // the lid seam
  for (const z of [58, 74]) {
    line(s, F, [[94, 8, z], [112, 8, z]], { sw: W.heavy, opacity: 0.7 });       // strap bands
  }
  curve(s, F, [100, 8, 80], [103, 3, 88], [106, 8, 80], { sw: W.mid });         // the carry handle
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
  // ⭐ THE SIGN FACE IS A RECESSED FLAT PANEL, one tone step down from the frame's paper — the same
  // reading a powered screen's face gets two builders up. Drawn as a bare hairline outline the inset
  // was invisible, so what remained was a hatched box carrying a directional stencil and three stray
  // stencil marks, and a blind read of the sheet came back "a cargo container". A plaque face inside a
  // paper frame reads as a mounted sign; a crate wall does not have one.
  quad(s, F, [[8, 4, 198], [64, 4, 198], [64, 4, 218], [8, 4, 218]], { fill: PAPER_FLAT });
  // … and the arrow is enlarged from ~36% of the panel to ~75%, so it is the sign's ONE glyph and is
  // read before the box silhouette is. (It was x 38–58 / z 200–216.)
  line(s, F, [[26, 4, 208], [56, 4, 208]], { sw: W.mass });           // ⭐ the arrow shaft …
  line(s, F, [[46, 4, 217], [60, 4, 208], [46, 4, 199]], { sw: W.mass });   // … and its head
  for (const z of [204, 208, 212]) {                                  // the legend, deliberately mute
    line(s, F, [[12, 4, z], [22, 4, z]], { sw: W.hair, opacity: 0.55, cap: false });
  }
};
export const deckMarker = (opts = {}) => fixture('deck-marker', opts, drawDeckMarker);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LIGHT — three luminaires that must not be each other at tile size
// ═════════════════════════════════════════════════════════════════════════════════════════════

// 12 LAMP, SCONCE · bowl ∅24 × 14 on a 14 × 18 × 5 plate, HUNG 206 · "Light down a wall, no more."
//
// ⚠️ THE THREE LAMPS ARE SEPARATED BY SILHOUETTE, NOT BY SIZE, and that is a decision made once for
// all three: `GLYPH_SUBSTITUTE['*']` puts DeviceKind.Light on this piece, so it is the one a player
// meets most and it has to be unmistakable beside the other two. SCONCE = a shade on a wall bracket
// with a bulb hanging out of it. GROW LAMP = a wide bar under a deckhead with tubes across it. FLOOD
// LAMP = a box head on a knuckle bracket throwing a hard cone sideways. Different outline, different
// mounting, different spill.
//
// Both of the shade's rims are LEVEL ellipse geometry and that is correct: they are horizontal
// openings seen from slightly above, the same construction the catalogue's deck lamp uses for its
// shade (the lower one is drawn as the front half of one, inside `cone`). ⚠️ THE BULB IS
// NOT — it is an upright `faceDisc`, because a sphere projects to a true circle here and a level
// ellipse would lay it on the floor.
//
// ⛔ THE DIMENSION LINE HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND BOTH ARE WORTH KEEPING.
// FIRST it was prose that had gone stale under a correct drawing: it read "bowl 30 × 16 × 14 on a
// 30 × 32 plate", a first draft's intent kept after the render moved the piece, and the fix was to
// re-read the numbers off the ink. SECOND (2026-08-06) the DRAWING moved under a correct caption —
// see the redraw note below — and the fix is the same direction of travel: prose loses to the ink
// whenever they disagree, so `HUNG 190` became `HUNG 206` and the plate's three numbers were
// re-read off `bx(16, 17, 222, 14, 18, 5)`.
// ⛔⛔ REDRAWN 2026-08-06, ON THE OWNER'S WORDS: *"i have no clue what lamp-sconce does show."* The
// drawing that produced that sentence is in git at 9e9ca46 and it was, member for member, a HOPPER —
// which is also what the blind cold reader of the polish sheet called it, so the two readings agree
// and the piece failed its own recognisability criterion twice. The three causes, read off that
// render rather than argued:
//
//   1. THE CONE POINTED THE WRONG WAY. The shade was NARROW AT THE TOP (a ∅10 throat under the arm)
//      and WIDE AT THE BOTTOM (a ∅24 mouth). That is a funnel. Every lampshade in the world — and
//      `fittings.js`'s own standing lamp (25), which a cold reader DOES read as a lamp — is the other
//      way round: wide where it meets the fitting, narrowing to the aperture it throws light out of.
//   2. THE WALL PLATE WAS THE BIGGEST MASS ON THE CARD. 24 × 24 × 8 at `mid` weight against a 24 cm
//      bowl: a hatched cube on the wall with a spout under it, i.e. the bin half of the hopper. The
//      plate is a bracket and should recede; it is 14 × 18 × 5 now — a third of the footprint — and
//      the SHADE is the mass.
//   3. NOTHING IN THE PIECE WAS BULB-SHAPED. "Lit" was carried entirely by an INK disc filling the
//      mouth — which at any distance is a dark HOLE, the single most hopper-ish mark available. The
//      set's other lights do not rely on that alone: the standing lamp puts its ink INSIDE a rim with
//      the shade around it, the flood lamp and the grow lamp draw a lens face plus a spill fan.
//
// ⭐ WHAT IT DRAWS NOW, AND EVERY CUE IS THE SET'S OWN, NOT A NEW INVENTION. A slim backplate, a
// bracket arm, a cone shade wide-at-top (the standing lamp's proportion), a fixing boss, and a BULB
// hanging below the shade's own bottom arc as an upright `faceDisc` — `door-sliding`'s own state-lamp
// convention,
// `fill: powered ? INK : PAPER` — and a five-ray spill fanning off it (the flood lamp's and the grow
// lamp's). A bulb protruding out of the bottom of the thing is what no hopper has.
//
// ⚠️ THE BOWL MOVED UP 16 cm AND THE DIMENSION LINE MOVED WITH IT — `HUNG 190` → `HUNG 206`. The
// spill needs vertical room and `z0 = 182` is a hard floor: the drawn extent is measured from it
// (`geometryFor`: `ey = (h − z0) + 0.6·d`), so ink below 182 leaves the box and the box guards say
// so. With the mouth at 190 there were eight centimetres under it for a bulb AND a fan, which is not
// enough for either. The bowl is still ∅24 × 14 and the plate is still flush to the wall at y = 22;
// what changed is where on the wall it is fixed. Per this module's own SPECS rule — "every number in
// `dim` is read off the painter, not off the box" — the caption was corrected, not preserved.
//
// ⚠️ THE ARM STILL HANGS CLEAR OF THE PLATE, and that rule is older than this redraw. Drafted with
// the shade's top inside the plate's own front face, the arm drew as a stray diagonal ACROSS it —
// the heater's supply pipe again (`fittings.js`, ruling E8 class 3), in a piece where the arm is the
// only thing connecting the lamp to the wall. `paper-fixtures.test.js` pins four centimetres of
// clear drop and it was re-derived onto the new coordinates rather than deleted.
const drawLampSconce = (s, { F, hatch, powered }) => {
  wallStub(s, F, 'back', 22, 0, 46, 182, 240, hatch);
  bx(s, F, 16, 17, 222, 14, 18, 5, { hatch, sw: W.mid });             // the backplate — a BRACKET
  line(s, F, [[23, 17, 222], [23, 6, 220]], { sw: W.heavy });         // the arm — the shade HANGS
  // ⭐ THE SHADE IS ONE SOLID TAPERED BODY, AND THE FOUR REJECTED DRAFTS ARE WORTH THEIR EIGHT LINES
  // because each failed for a different reason and the reasons are the design.
  //   · TWO `line`s, the standing lamp's construction — the treated render came back as two detached
  //     black bars with bare paper between them. Under `strong` every run carries its own paper
  //     knockout, so two heavy strokes ∅24 apart never close into a silhouette.
  //   · A `quad` ALONE — it closed, and read as a bucket: a straight bottom edge is not what a shade
  //     shows when you look slightly down into it.
  //   · `cyl`, the kit's own solid cylinder — the arc fixed the bottom edge and the piece then read
  //     as a COOKING POT, because an untapered drum under an opaque cap is one.
  //   · A `quad` with an opaque `disc` closing each rim — closed, tapered, and it came back SEGMENTED:
  //     the two rim discs' knockouts bit the quad's side runs away and left two black bars between
  //     two floating ellipses. That one is the halo exception, not a drawing mistake, and it is why
  //     `cone()` above exists.
  // What ships is `cone()` — ONE closed path — TAPERED: ∅24 where it meets the arm, ∅18 at the
  // aperture. A shade narrows toward the light; a funnel widens, and the drawing this replaces was
  // drawn as a funnel. The cap goes over it opaque, the kit's own order for a cylinder, which is also
  // what covers the arm's free end so the arm meets the shade instead of crossing it.
  cone(s, F, 23, 6, 206, 220, 9, 12, { sw: W.heavy });                // the shade, ∅24 → ∅18 × 14
  // ⚠️ THE CAP IS `fine` AND THE BODY IS `heavy`, WHICH IS THE OPPOSITE OF THE OBVIOUS CHOICE. Drawn
  // at the body's weight the top face is a wide blank oval with an outline as strong as the
  // silhouette's, and the piece reads as an OPEN POT; the thing that has to survive at 22 px is the
  // shade's outline, so the cap recedes to a top face like any other. The boss on it is what an open
  // pot does not have — the fixing the shade hangs from, and the reason the arm can stop there.
  disc(s, F, 23, 6, 220, 12, { sw: W.fine });                         // … and its top rim
  disc(s, F, 23, 6, 220, 3, { fill: 'none', sw: W.mid });             // … and the fixing boss
  // ⭐ THE BULB — an UPRIGHT circle, because a sphere is a true circle in this projection and
  // `faceDisc` is the module's vocabulary for one (a level ellipse would lay it on the floor). It is
  // centred so that 7.1 cm of it hangs BELOW the shade's own bottom arc (which dips to z 200.6 in
  // screen centimetres against the bulb's 193.5), which is the whole point:
  // the silhouette gains a ball under the shade, and no hopper, funnel or bucket has one. Drawn last,
  // so it is over the shade's paper rather than under it.
  faceDisc(s, F, 23, 6, 199, 5.5, { fill: powered ? INK : PAPER, sw: W.fine });
  if (powered) {
    // The spill, radial off the bulb's own rim — five ticks, the flood lamp's construction.
    // ⚠️ TWO NUMBERS ARE SET BY SOMETHING OTHER THAN TASTE. The reach stops at 17 cm because
    // `z0 = 182` is the drawn extent's floor and the straight-down ray ends exactly there.
    // ⛔ BUT THE SLACK IS THREE CENTIMETRES, NOT ONE — corrected against a measurement rather than
    // against a reading of the formula. `z0` is the box's floor ON THE FRONT FACE, and this fan is
    // drawn at y = 6, which the depth lift (0.6·y) raises 3.6 cm clear of it. Driven, reach 17 → 23
    // through `paper-fixtures.test.js`: 18, 19 and 20 are all green — at 20 the bottom ray sits at
    // y 55.06 against the 86 × 112 extent's own 56 — and the FIRST red is 21, "lamp-sconce (on)
    // draws outside its own 86×112 extent: (-3.14, 56.63)"; 22 reds at (-3.14, 58.21). The reach
    // stays 17 because `z0` is the honest datum, NOT because 18 would fail.
    // The length is then 10 cm, which at
    // `k = 1.573` px/cm is 15.7 px on an 86 × 112 piece whose diagonal is 141 px: 11%, well inside
    // ruling E8-1's 25%, at which a diagonal stops reading as a mark and starts reading as a
    // strike-through.
    // ⚠️ AND THE PEN IS `fine`, NOT `hair`, WHICH IS THIS PIECE'S OWN PRECEDENT AND NOT A NEW LICENCE:
    // the drawing this replaced spilled at `W.mid` / 0.75. At `hair` the fan measured as ink but did
    // not read against the bulb beside it, and the fan is half of what makes the piece a light.
    for (const [ux, uz] of [[-0.87, -0.5], [-0.5, -0.87], [0, -1], [0.5, -0.87], [0.87, -0.5]]) {
      line(s, F, [[23 + 7 * ux, 6, 199 + 7 * uz], [23 + 17 * ux, 6, 199 + 17 * uz]],
        { sw: W.fine, opacity: 0.8 });
    }
  }
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
  // ⛔ THE STUB STAYS THE FULL SPAN OF THE BOX, AND THAT IS A GUARD'S RULE RATHER THAN A PREFERENCE.
  // The designer's read of this piece was a four-poster bed — a hatched plane the size of the object,
  // on four corner posts — and the first half of that diagnosis is right about the POSTS, which are
  // gone below. The plane is not free to shrink: `E8-6b` asks a deckhead stub to draw through (0,0,h)
  // AND (w,d,h), because a stub that no longer spans its piece stops being the datum that makes a
  // mounting height a fact about the drawing and goes back to being a caption. What kills the bed
  // read is deleting the four uprights under it, not trimming the ceiling it hangs from.
  wallStub(s, F, 'over', 224, 0, 96, 0, 38, hatch);
  bx(s, F, 3, 4, 190, 90, 20, 30, { hatch, sw: W.heavy });            // the fixture
  for (const z of [195, 200, 205]) {                                  // ⭐ the three emitters
    line(s, F, [[10, 4, z], [86, 4, z]], { sw: W.mid, opacity: powered ? 0.95 : 0.3, cap: false });
  }
  for (const x of [42, 54]) line(s, F, [[x, 19, 210], [x, 19, 224]], { sw: W.mid });
  curve(s, F, [48, 20, 210], [52, 27, 217], [48, 33, 224], { sw: W.fine, opacity: 0.65 });
  // ⭐ THE LENS — a lit strip flush under the housing, and the glyph this piece had NONE of. The
  // sconce has its lit disc and the flood lamp its lens quad; this one carried nothing at all that
  // said "light" rather than "shelf", which is the other half of why it read as furniture. Same fill
  // convention as the flood lamp's own lens.
  quad(s, F, [[8, 4, 190], [88, 4, 190], [88, 4, 186], [8, 4, 186]],
    { fill: powered ? PAPER_FLAT : PAPER, sw: W.fine });
  if (powered) {
    // ⚠️ ONE POINT, FANNING — a light cone, where the old spill was five near-parallel, near-vertical
    // lines that read as ladder rungs under a bed. ⛔ AND THE SPREAD IS SET BY E8-1, MEASURED: the fan
    // as drawn reached x 18…82, whose outermost ray is 35.2 px on a 131.5 px piece — 27%, past the
    // ruling's 25% limit, i.e. the catalogue's own mark for "cancelled" laid across a lamp. At ±26 cm
    // the widest ray is 27.4 px (21%) and a cone is still a cone.
    for (const x of [22, 35, 48, 61, 74]) {
      line(s, F, [[48, 4, 186], [x, 4, 178]], { sw: W.hair, opacity: 0.5 });
    }
  }
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
