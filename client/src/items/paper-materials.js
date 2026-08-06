// THE TWELVE MATERIALS — six walls and six floors, redrawn in the paper/ink idiom of the visual
// redesign, on the same centimetre discipline `client/src/items/fittings.js` gives the thirty
// fittings. They replace the warm swatches that stood in `client/src/items/structures.js`.
//
// Every builder is a pure `(opts) -> string` SVG-`<g>`-fragment builder with exactly the contract
// the rest of `client/src/items/*` holds (`helpers.js:1-16`): no DOM, no clock, no randomness, same
// input ⇒ byte-identical output, def ids namespaced by `idPrefix`. `index.js` registers them;
// nothing here imports `index.js`, so the dependency runs one way.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐ A SKIN IS NOT A PIECE, AND THAT IS THE WHOLE DIFFERENCE FROM `fittings.js`.
//
// A fitting is an OBJECT: it has a footprint, it stands somewhere, it is drawn as a three-face
// oblique box. A material is a SURFACE — every wall slab and every floor tile of every room wears
// one, edge to edge, and the drawing is a FLAT SWATCH of a repeating field. So there is no
// `roomFrame`, no depth term and no `box()` here. What there IS, and what the warm set did not
// have, is HONEST DIMENSION.
//
// ── THE CENTIMETRE RULE ──────────────────────────────────────────────────────────────────────
// `CM` px of body space is one centimetre, fixed at `TILE / 100` — so ONE METRE IS `TILE` (128)
// ACROSS, always, at every call size. That single constant is what makes a plank 18 cm wide on
// screen instead of "about a fifth of the swatch": the pattern pitches below are stated in
// centimetres and multiplied by it, and nothing in this file scales a pattern to fit a box.
//
// ⭐⭐ THE BOX ASPECT IS THE CALLER'S STATEMENT OF HOW MANY METRES IT WANTS, and that is the one
// idea a reader has to hold. `helpers.item()` normalises a builder's body into the caller's
// `w × h` box by `scale(min(w,h) / TILE)` — a UNIFORM scale — so a body of `Bw × Bh` where
// `Bw : Bh == w : h` lands exactly on the box with no distortion at all. This module therefore
// derives its drawing extent FROM the box:
//
//     k  = min(w, h) / TILE            (helpers.item's own scale factor)
//     Bw = w / k,  Bh = h / k          ⇒ min(Bw, Bh) === TILE, and Bw : Bh === w : h
//     wCm = Bw / CM,  hCm = Bh / CM    ⇒ the drawn extent IN CENTIMETRES
//
// and the consequences are the three call sites, each of which gets an honest picture:
//
//   · THE ROOM ZOOM'S FLOOR (`materialLayerSvg`, `w = h = 95`) — 100 × 100 cm, laid into the tile's
//     own floor parallelogram through `place.cell`. One tile is one metre (`room-model.js`
//     `M_PER_TILE`) and the cutaway draws at 0.95 px/cm, so 95 px IS a metre and the skin fills the
//     tile exactly, edge to edge, with no gap for a neighbour's art to show through.
//   · THE ROOM ZOOM'S WALL SLAB (`w = 95, h = 228`) — 100 × 240 cm, i.e. a one-metre wall run at the
//     compartment's real 2.4 m ceiling (`room-model.js` `ROOM_HEIGHT_M`), laid on the front face of
//     the slab `oblique.box()` has just extruded.
//   · THE PALETTE SWATCH CHIP (`paintMatStrip`, `w = h = 26`) — a SQUARE box, so a 100 × 100 cm
//     CROP at the same pattern scale. A wall's crop is its bottom metre (see below); a floor's is
//     the whole tile. It is a thumbnail of the real material, never a squashed whole wall — a
//     squashed picture would be the one thing this module exists to stop.
//
// ⚠️ WALL BODIES ARE ANCHORED AT THE FLOOR, NOT CENTRED ON THEIR FIELD. `g.z(cm)` measures UP from
// the bottom edge, so a square box shows the bottom metre of the wall and the 2.4 m box shows all of
// it. Every wall's identifying feature is therefore put either in the REPEATING field or inside the
// bottom metre — a tell that only appears above 100 cm is a tell the palette chip cannot show.
// `full` (`hCm >= 200`) gates the head rail, which is the one thing that genuinely belongs at 2.4 m.
//
// ── WHY THE PATTERN PITCHES ARE WHAT THEY ARE ────────────────────────────────────────────────
// Two rules, and both are about tiling rather than taste:
//   1. A FLOOR PITCH DIVIDES 100 cm. Each floor tile is drawn independently, so a pitch that does
//      not divide the metre leaves a partial course at the tile edge and the seam between two tiles
//      reads as a defect. 20 cm planks (5 to a tile), 25 cm tiles (4), 12.5 cm weave and pile cells
//      (8), 6.25 cm grating bars (16) — all exact.
//   2. A WALL PITCH DIVIDES 100 cm TOO, for the same reason across a wall RUN, and the courses that
//      matter (60 cm plate courses, 20 cm boards) also divide 240.
//
// ── SHEAR ────────────────────────────────────────────────────────────────────────────────────
// A floor skin is laid through `room-model.js` `scenePlacement().cell()`, which is
// `matrix(1 0 0.4 -0.6 …)` at the shipped scale: the unit cell's y axis is FLIPPED, compressed to
// 0.6 and sheared 0.4 to the right. Everything below survives it because it is line work and
// pattern fills — an affine map of a non-degenerate matrix (det −0.6) cannot collapse a stroke —
// but two consequences are real and are drawn for:
//   · A HORIZONTAL RULE LOSES 40 % OF ITS WEIGHT (its thickness is measured along y, which is the
//     compressed axis). So no floor rule that must be seen is thinner than `W.fine`.
//   · A CIRCLE BECOMES AN ELLIPSE. There are no circles on the floor skins; the wall skins' rivets
//     are on an upright plane and are never sheared.
// ⛔ AND NO TEXT, ANYWHERE — `scenePlacement`'s own header states the rule: sheared, mirrored type
// is unreadable, which is why `cell` is not where labels go.
//
// ── THE DIALECT ──────────────────────────────────────────────────────────────────────────────
// Paper ground, ink linework, the `fh` micro-hatch for anything that means "there is material
// inside", and the catalogue's five-step weight ramp (`fittings.W`). ⛔ NO OXBLOOD: `ATTEND` is
// attention, faults and queued orders, and a wall is never an alert. ⛔ NO LARGE SOLID FILLS: the
// darkest ink area in the set is the grating's open slots, which are 32 % of the tile at opacity
// 0.30 — a mean darkening of under a tenth — because a skin that fills a tile with tone fights the
// room's own paper and every fitting standing on it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { item, r3, TILE, INK, PAPER } from './helpers.js';
import { HATCH, PX_PER_CM } from '../render/oblique.js';
import { W } from './fittings.js';

/** Body px per centimetre. ONE METRE IS `TILE` ACROSS — the whole dimensional claim, in one line. */
export const CM = TILE / 100;

/**
 * The compartment ceiling these wall skins are drawn to, in centimetres.
 *
 * ⚠️ A DUPLICATED LITERAL, DELIBERATELY, AND IT IS PINNED TO ITS SOURCE. The authority is
 * `client/src/ui/room-model.js` `ROOM_HEIGHT_M` (2.4 m, measured off the design's own dimension
 * arrow), but `items/*` must not import from `ui/*` — the tree's dependency rule is that a builder
 * knows nothing about a surface. `client/test/paper-materials.test.js` asserts the two copies equal
 * each other, which is the same treatment `oblique.test.js` gives `INK`/`PAPER`/`ATTEND`: a
 * duplicated literal nothing compares is how two modules come to disagree about a number.
 */
export const WALL_H_CM = 240;

/** A floor tile is one metre square — `room-model.js` `M_PER_TILE`, pinned the same way. */
export const TILE_CM = 100;

/**
 * The `fh` hatch's period IN BODY PX, chosen so the hatch lands at the design's own 7 px ON SCREEN
 * at the Room Zoom's scale. DERIVED, never typed: `helpers.item` scales a floor skin by
 * `95 / TILE`, so a body period of `7 · TILE / 95` arrives as 7. The alternative — taking
 * `HATCH.period` literally — would draw a hatch a quarter finer than the room's own left wall, on
 * the one surface where the two are side by side.
 */
const HATCH_P = r3((HATCH.period * TILE) / (PX_PER_CM.room * 100));

/**
 * The drawing frame for one skin: the extent in centimetres, and the three mappers everything below
 * is authored through.
 *
 *   `x(cm)` across, from the LEFT edge
 *   `y(cm)` down,   from the TOP edge     — floors
 *   `z(cm)` up,     from the BOTTOM edge  — walls
 *   `u(cm)` a bare LENGTH in body px
 */
function frameOf(wCm, hCm) {
  const halfW = (wCm * CM) / 2;
  const halfH = (hCm * CM) / 2;
  return Object.freeze({
    wCm,
    hCm,
    full: hCm >= 200,
    x: (cm) => r3(-halfW + cm * CM),
    y: (cm) => r3(-halfH + cm * CM),
    z: (cm) => r3(halfH - cm * CM),
    u: (cm) => r3(cm * CM),
    left: r3(-halfW),
    top: r3(-halfH),
  });
}

/**
 * The builder harness. Resolves the caller's box, derives the drawn extent in centimetres from its
 * ASPECT (see the header), and runs the painter against that frame.
 *
 * ⚠️ IT MIRRORS `helpers.item()`'s OWN DEFAULTS (`w = h = 100`) rather than inventing its own, so a
 * bare `buildItem('wood-plank-floor')` draws the same square metre `item()` would normalise.
 */
function skin(itemId, opts, paint) {
  const w = opts.w == null ? 100 : opts.w;
  const h = opts.h == null ? 100 : opts.h;
  const k = Math.min(w, h) || 1;
  const g = frameOf((TILE * (w / k)) / CM, (TILE * (h / k)) / CM);
  // ⛔ `ground: false` — AN ORCHESTRATOR RULING, 2026-08-05, AND IT IS OVERRIDABLE BY THE OWNER FROM
  // THE SHEET. The sketch treatment's ground rule is the pawns' sixth tell: the faint line a thing
  // STANDING on a deck is drawn resting on. A material is not a standing thing — it is the deck —
  // and the rule's own semantics have nowhere to land on a tiling skin. Measured before this
  // argument existed: every one of the twelve skins drew its rule 1.5–3.7 units OUTSIDE its own tile
  // edge, and a 12 × 8 room floor drew NINETY-SIX of them through `materialLayerSvg` — a grid of ink
  // ticks at the tiling pitch, across the floor. The picture the veto is taken from is a CONTROLLED
  // A/B — `client/tools/sketch-ground-ruling-shot.mjs`: same scene, same camera, same pawn at the
  // same tile, unselected in both, with this argument as the only variable, and the AFTER column
  // asserted byte-identical to `materialLayerSvg`. It photographs all SIX floor skins, because the
  // ruling does NOT read equally on them: on `metal-grating` the rule lands on the tile edge the
  // skin already draws and 96-vs-0 photographs the same. That is stated, not hidden.
  // ⚠️ IT IS THE ONLY KNOB THE MATERIALS TURN OFF. Everything else about the treatment applies —
  // the pen, the caps, the wobble, the halo, the doubled pass, the `#fh` loosening.
  return item(itemId, opts, (s) => paint(s, g), { sketched: true, ground: false });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The primitives — everything is drawn through these, in centimetres
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A stroked segment. `s.line()` carries no opacity and no dash, so every rule here is a `path`. */
function seg(s, x1, y1, x2, y2, o = {}) {
  s.path(`M${x1} ${y1} L${x2} ${y2}`, {
    stroke: o.stroke == null ? INK : o.stroke,
    sw: o.sw == null ? W.fine : o.sw,
    opacity: o.opacity,
    dash: o.dash,
  });
}

/** A rule ACROSS the whole skin at height `zCm` (walls) — the full width, always. */
const rail = (s, g, zCm, o) => seg(s, g.x(0), g.z(zCm), g.x(g.wCm), g.z(zCm), o);

/** A rule ACROSS the whole skin at depth `yCm` (floors). */
const course = (s, g, yCm, o) => seg(s, g.x(0), g.y(yCm), g.x(g.wCm), g.y(yCm), o);

/** A rule UP the whole skin at `xCm`. */
const post = (s, g, xCm, o) => seg(s, g.x(xCm), g.y(0), g.x(xCm), g.y(g.hCm), o);

/** A rectangle in centimetres: `x,y` from the top-left, `w,h` extents. */
function boxCm(s, g, xCm, yCm, wCm, hCm, o = {}) {
  s.rect({
    x: g.x(xCm),
    y: g.y(yCm),
    w: g.u(wCm),
    h: g.u(hCm),
    fill: o.fill == null ? 'none' : o.fill,
    stroke: o.stroke,
    sw: o.sw,
    opacity: o.opacity,
  });
}

/** The paper ground every skin sits on. */
const ground = (s, g) => boxCm(s, g, 0, 0, g.wCm, g.hCm, { fill: PAPER });

/** The skin's own perimeter — what seats the tile against its neighbours. */
const edge = (s, g, sw, opacity) =>
  boxCm(s, g, 0, 0, g.wCm, g.hCm, { fill: 'none', stroke: INK, sw, opacity });

/**
 * The 45° micro-hatch, as THIS fragment's own `<pattern>`.
 *
 * ⚠️ NOT `oblique.fhDef()/fhRef()`, for `fittings.js`'s reason verbatim: those mint a FIXED id per
 * surface root, and `items.test.js` pins that two placements of one piece share NO def id and that
 * every `url(#…)` resolves INSIDE the fragment. `scene.pat()` numbers its defs off `idPrefix`, which
 * is exactly that guarantee. The geometry is the kit's — every number comes from `HATCH`.
 */
function hatchPaint(s, opacity) {
  const op = opacity == null ? HATCH.opacity : opacity;
  return s.pat(
    `<rect width="${HATCH_P}" height="${HATCH_P}" fill="${HATCH.ground}"/>` +
      `<path d="M0 0 L0 ${HATCH_P}" stroke="${HATCH.ink}" stroke-width="${r3(HATCH.width)}"` +
      ` opacity="${r3(op)}"/>`,
    { w: HATCH_P, h: HATCH_P, transform: `rotate(${r3(HATCH.angle)})` },
  );
}

/** A raw `<rect>` string for pattern interiors, in pattern-local px. */
const pr = (x, y, w, h, fill, stroke, sw) =>
  `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(w)}" height="${r3(h)}" fill="${fill}"` +
  (stroke ? ` stroke="${stroke}" stroke-width="${r3(sw)}"` : '') +
  '/>';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WALLS — 100 cm across × 240 cm up
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 31 STEEL BULKHEAD — the default wall. IDENTIFYING FEATURE: **RIVETS**, in rows along every plate
 * seam. It is the only piece in the set with round fasteners, and the only wall whose courses run
 * HORIZONTALLY (`hull-plating`'s run up, which is the pair that had to be pulled apart).
 *
 * SCALE: 60 cm plate courses (four to a 2.4 m wall, and the pitch divides a metre too), rivets at a
 * 12.5 cm pitch — eight to the metre, which is a real riveted-plate spacing and the finest thing in
 * this file that still resolves at Room-Zoom size. Two stiffener ribs at the quarter lines.
 *
 * The warm swatch's identity was "navy body, amber top trim, rivet dots". The rivets are kept and
 * promoted to the tell; the amber trim becomes the doubled INK HEAD RAIL — oxblood is the only
 * accent the dialect has and a wall is never an alert.
 */
export const steelBulkhead = (opts = {}) =>
  skin('steel-bulkhead', opts, (s, g) => {
    ground(s, g);
    const rivetRows = [6];
    for (let z = 60; z <= g.hCm - 12; z += 60) rivetRows.push(z);
    for (let z = 60; z <= g.hCm - 12; z += 60) {
      rail(s, g, z, { sw: W.mid });
      rail(s, g, z - 3, { sw: W.hair, opacity: 0.32 });
    }
    for (const xc of [25, 75]) {
      seg(s, g.x(xc), g.z(0), g.x(xc), g.z(g.hCm), { sw: W.fine, opacity: 0.75 });
      seg(s, g.x(xc + 2.5), g.z(0), g.x(xc + 2.5), g.z(g.hCm), { sw: W.hair, opacity: 0.3 });
    }
    for (const z of rivetRows) {
      for (let x = 6.25; x < g.wCm; x += 12.5) {
        s.circle({ cx: g.x(x), cy: g.z(z), r: g.u(1.6), fill: 'none', stroke: INK, sw: W.hair });
      }
    }
    if (g.full) {
      rail(s, g, g.hCm - 8, { sw: W.mid });
      rail(s, g, g.hCm - 11.5, { sw: W.hair, opacity: 0.45 });
    }
    edge(s, g, W.mid);
  });

/**
 * 32 TIMBER-LINED WALL — IDENTIFYING FEATURE: **HORIZONTAL BOARDS WITH STAGGERED BUTT JOINTS**. It
 * is the warm swatch's own identity ("horizontal warm-wood planks") carried over intact; what the
 * paper version adds is that a board is now a BOARD — 20 cm, twelve courses to the ceiling — rather
 * than a stripe whose width was a swatch fraction.
 *
 * SCALE: 20 cm boards (divides both 100 and 240), butts alternating at the 34 % and 66 % lines so no
 * two adjacent courses break in the same place, a 9 cm skirting at the deck and a head rail at 2.4 m.
 * The grain is one shallow curve per course, at alternating bow — enough to say "wood" at silhouette
 * weight, quiet enough that twelve courses do not turn into noise.
 *
 * ⚠️ THE BUTT IS A 7 cm TICK, NOT A FULL-HEIGHT BAR. Drawn the height of the board and stacked
 * twelve courses deep, the joint family silhouetted as a grid of cubbies and a cold reader called
 * the piece "a storage rack" — the vertical mass out-competed the horizontal board rhythm that is
 * supposed to carry the wood identity.
 */
export const timberLinedWall = (opts = {}) =>
  skin('timber-lined-wall', opts, (s, g) => {
    ground(s, g);
    const boards = Math.ceil(g.hCm / 20);
    for (let i = 0; i < boards; i += 1) {
      const z0 = i * 20;
      const z1 = Math.min(g.hCm, z0 + 20);
      if (z1 > z0 + 1 && z1 < g.hCm) {
        rail(s, g, z1, { sw: W.fine });
        rail(s, g, z1 - 2.5, { sw: W.hair, opacity: 0.28 });
      }
      // The butt joint is a SEAM MARK where one board ends and the next begins along the run —
      // a short tick centred in the board's height, never a bar spanning the whole 20 cm course.
      // A full-height vertical there reads, at silhouette weight, as a shelf/rack divider instead
      // of a plank joint — that was the piece's actual defect (blind read: "a storage rack").
      const bx = i % 2 === 0 ? 34 : 66;
      const jz = z0 + 10;
      seg(s, g.x(bx), g.z(jz + 3.5), g.x(bx), g.z(jz - 3.5), { sw: W.hair, opacity: 0.85 });
      // Grain on every board (was one in three) so the horizontal-board read carries a wood tell
      // at silhouette weight too, not just on close inspection. Still quiet: hair weight, low
      // opacity, one shallow curve, alternating amplitude so twelve of them don't stack into noise.
      const bow = i % 2 === 0 ? 3 : -2.5;
      s.path(
        `M${g.x(4)} ${g.z(jz)} C${g.x(30)} ${g.z(jz + bow)} ${g.x(62)} ${g.z(jz - bow)}` +
          ` ${g.x(g.wCm - 4)} ${g.z(jz + bow * 0.4)}`,
        { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.3 },
      );
    }
    rail(s, g, 9, { sw: W.mid });
    rail(s, g, 6.5, { sw: W.hair, opacity: 0.4 });
    if (g.full) rail(s, g, g.hCm - 10, { sw: W.mid });
    edge(s, g, W.mid);
  });

/**
 * 33 BLAST WALL — IDENTIFYING FEATURE: **A DIAGONAL HAZARD BAND AT CHEST HEIGHT, INSIDE A DOUBLE
 * FRAME, WITH CORNER GUSSETS**. The warm swatch's identity was "dark reinforced body, big dots,
 * amber hazard band"; the band survives as the tell, the reinforcement becomes the heaviest ink in
 * the set (`W.mass` perimeter over an inset frame line), and the amber becomes INK diagonals —
 * oxblood is not available to a wall.
 *
 * SCALE: the band runs 70–95 cm, which is chest height on a 1.66 m crew member and — the reason it
 * is not at the mock's mid-height — INSIDE the bottom metre, so the palette chip can show it. The
 * chevron pitch is 12 cm, which is the hazard-stripe pitch the fittings catalogue uses. Gussets are
 * 18 cm on the leg.
 *
 * ⚠️ A blind read of the catalogue and tile renders called this piece "a floor vent": the chevron
 * field is fine-pitched detail that aliases to nothing at the 22–32 px tile sizes (it only survives
 * at 48 px), and below it ~70 cm of bare paper between the frame and the edges reads as an OPENING,
 * not a reinforced slab. Two additions fix this, both mass rather than detail, and neither touches
 * the identifying pattern (kept — it is one of the four protected structural-field patterns): a flat
 * ink wash under the chevron bar so the band survives as a silhouette at every size, and one plate
 * seam in the open body below the band so the panel reads as continuous armour down to the floor
 * instead of a frame around empty paper.
 */
export const blastWall = (opts = {}) =>
  skin('blast-wall', opts, (s, g) => {
    ground(s, g);
    const bar = s.pat(
      pr(0, 0, g.u(12), g.u(12), PAPER) +
        `<rect x="0" y="0" width="${g.u(6)}" height="${g.u(12)}" fill="${INK}" opacity="0.45"/>`,
      { w: g.u(12), h: g.u(12), transform: 'rotate(-45)' },
    );
    boxCm(s, g, 6, 6, g.wCm - 12, g.hCm - 12, { fill: 'none', stroke: INK, sw: W.fine, opacity: 0.5 });
    // A plate seam in the open body below the band — the slab is reinforced its whole height, not
    // just where the hazard band sits, so the field carries weight instead of reading as an empty
    // frame (the 'floor vent' misread's likely source). Guarded for degenerate tiny call sizes.
    if (g.hCm > 50) rail(s, g, 35, { sw: W.mid, opacity: 0.5 });
    // The hazard band: a flat tone first, so the band survives as a MASS at every tile size even
    // where the fine chevron pattern aliases away; the chevron field (the identifying pattern) is
    // then drawn over it, unchanged.
    boxCm(s, g, 0, g.hCm - 95, g.wCm, 25, { fill: INK, opacity: 0.28 });
    boxCm(s, g, 0, g.hCm - 95, g.wCm, 25, { fill: bar });
    rail(s, g, 95, { sw: W.heavy });
    rail(s, g, 70, { sw: W.heavy });
    // The gussets are TRIANGLES, not chamfers: the diagonal plus the two legs it braces. The first
    // draft drew the diagonal alone and every corner read as a cut-off corner of the slab itself.
    for (const [xc, dir] of [[0, 1], [g.wCm, -1]]) {
      for (const z of [0, g.hCm]) {
        const up = z === 0 ? 1 : -1;
        s.path(
          `M${g.x(xc + dir * 18)} ${g.z(z)} L${g.x(xc)} ${g.z(z + up * 18)}` +
            ` L${g.x(xc + dir * 18)} ${g.z(z)} L${g.x(xc + dir * 18)} ${g.z(z + up * 5)}` +
            ` M${g.x(xc)} ${g.z(z + up * 18)} L${g.x(xc + dir * 5)} ${g.z(z + up * 18)}`,
          { fill: 'none', stroke: INK, sw: W.fine },
        );
        s.path(
          `M${g.x(xc + dir * 12)} ${g.z(z)} L${g.x(xc)} ${g.z(z + up * 12)}`,
          { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.45 },
        );
      }
    }
    // BOLTS, and they are SQUARE — `steel-bulkhead`'s fasteners are round, so the two walls never
    // share a mark. 20 cm pitch up both stiles, which is what makes this one read as heavy.
    for (let z = 20; z < g.hCm - 10; z += 20) {
      for (const xc of [6, g.wCm - 6]) {
        boxCm(s, g, xc - 1.8, g.hCm - z - 1.8, 3.6, 3.6, { fill: INK, opacity: 0.72 });
      }
    }
    edge(s, g, W.mass);
  });

/**
 * 34 GLASS PARTITION — IDENTIFYING FEATURE: **EMPTY PANES**. It is the only piece in the set whose
 * field is BARE PAPER: you can see through it, which is what glass is, and it is the one thing
 * `insulated-wall` — the hard pair — can never look like, because that one's panels are HATCHED.
 * The second half of the tell is the diagonal sheen, two thin strokes across every pane, drawn at
 * the same angle in every pane so the whole partition reads as one sheet of glazing.
 *
 * SCALE: a 33.3 cm glazing module (three lights across a metre — a real partition mullion spacing),
 * transoms at 80 and 160 cm so the 2.4 m wall is a 3 × 3 grid and the bottom-metre crop still shows
 * a complete light. An 8 cm sill.
 */
export const glassPartition = (opts = {}) =>
  skin('glass-partition', opts, (s, g) => {
    ground(s, g);
    const mull = [g.wCm / 3, (2 * g.wCm) / 3];
    const trans = [80, 160].filter((z) => z < g.hCm - 4);
    const xs = [0, ...mull, g.wCm];
    const zs = [8, ...trans, g.hCm];
    // ⚠️ THE SASH IS NO LONGER THE HEAVIEST INK ON ANY WALL, and that was the actual defect: the
    // perimeter ran at `W.heavy`, heavier than the DEFAULT solid `steel-bulkhead`'s `W.mid` edge and
    // equal to `hull-plating`/`blast-wall`, the two walls whose headers claim the heaviest ink in the
    // set. A glazed opening out-weighing a steel bulkhead is what gave the piece its closed,
    // appliance-like silhouette (a cold read called it "a refrigerator"). The frame comes down to
    // `W.mid` — the same edge the default wall wears, no heavier — and the weight that is no longer
    // spent on the border is spent on the panes' own tell instead.
    // ⛔ THE MULLIONS AND TRANSOMS STAY AT `W.mid` AND THAT IS LOAD-BEARING, not taste:
    // `paper-materials.test.js`'s PITCH row for this piece names the glazing module as the full-span
    // vertical family AT OR ABOVE `W.mid`. Drawing the sash a rung lighter does not move the 33.3 cm
    // module — it deletes the family that states it, and the probe then measures 0 cm. Measured, by
    // writing it.
    for (const xc of mull) {
      seg(s, g.x(xc), g.z(8), g.x(xc), g.z(g.hCm), { sw: W.mid });
      seg(s, g.x(xc - 2), g.z(8), g.x(xc - 2), g.z(g.hCm), { sw: W.hair, opacity: 0.35 });
    }
    for (const z of trans) {
      rail(s, g, z, { sw: W.mid });
      rail(s, g, z - 2, { sw: W.hair, opacity: 0.35 });
    }
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < zs.length - 1; j += 1) {
        const x0 = xs[i] + 6;
        const x1 = xs[i + 1] - 6;
        const z0 = zs[j] + 6;
        const z1 = zs[j + 1] - 6;
        if (x1 - x0 < 6 || z1 - z0 < 6) continue;
        // The pane's tell: a corner-to-corner glint, the length a real sheet of glazing actually
        // shows a reflection along. The earlier mark stopped at 70% of the pane's shorter side and
        // read, at tile size, as a stray scratch rather than a sheet of glass — a blind read of the
        // whole skin called the piece a refrigerator. Two near-parallel streaks running the FULL
        // pane, corner to corner, is the glazier's mark; still hairline weight so it never competes
        // with the frame, just now long enough to survive the shrink.
        for (const off of [0, 6]) {
          s.path(
            `M${g.x(x0 + off)} ${g.z(z0)} L${g.x(x1)} ${g.z(z1 - off)}`,
            { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.4 },
          );
        }
      }
    }
    rail(s, g, 8, { sw: W.mid });
    edge(s, g, W.mid);
  });

/**
 * 35 INSULATED WALL — IDENTIFYING FEATURE: **HATCHED BATTS, DASH-STITCHED, WITH TUFT STITCHES**. This
 * is the answer to the set's hardest pair. `glass-partition` and this one are both "a frame with
 * panels in it", and at a glance the only thing that can separate them is what is INSIDE a panel:
 * glass shows the paper through, insulation shows the `fh` hatch — the kit's own "there is material
 * here" mark, the same one a fitting's side face wears — plus a dashed seam that says the panel is
 * a soft thing sewn in rather than a hard thing glazed in.
 *
 * SCALE: 50 × 60 cm batts (two across a metre, four courses to the ceiling), 3 cm reveal to the
 * framing, tufts at every batt corner and centre. The stud line at mid-span is what the batts are
 * fixed to.
 */
export const insulatedWall = (opts = {}) =>
  skin('insulated-wall', opts, (s, g) => {
    ground(s, g);
    const hatch = hatchPaint(s, 0.24);
    const cols = Math.max(1, Math.round(g.wCm / 50));
    const bw = g.wCm / cols;
    const rows = Math.ceil(g.hCm / 60);
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const z0 = r * 60;
        const z1 = Math.min(g.hCm, z0 + 60);
        if (z1 - z0 < 8) continue;
        const x = c * bw + 3;
        const w = bw - 6;
        const h = z1 - z0 - 6;
        boxCm(s, g, x, g.hCm - z1 + 3, w, h, { fill: hatch });
        s.path(
          `M${g.x(x)} ${g.z(z1 - 3)} L${g.x(x + w)} ${g.z(z1 - 3)} L${g.x(x + w)} ${g.z(z0 + 3)}` +
            ` L${g.x(x)} ${g.z(z0 + 3)} Z`,
          { fill: 'none', stroke: INK, sw: W.fine, dash: '5 4' },
        );
        // TUFT STITCH — an X-cross at each batt corner and its centre, not a dot. A filled circle
        // there is the same glyph family as `steel-bulkhead`'s rivets (open circle) and
        // `blast-wall`'s bolts (filled square): a grid of dark panels with corner dots reads as
        // riveted PLATE, which is what let a cold reader mistake this piece for a cargo container
        // or a storage locker. A crossed stitch is the technical-illustration mark for "sewn here"
        // and no fastener anywhere else in the set draws one — it keeps the same five positions and
        // the same footprint the dot had, but it says PADDING, not PLATE.
        for (const [tx, tz] of [
          [x + w / 2, z0 + (z1 - z0) / 2],
          [x + 6, z0 + 8],
          [x + w - 6, z0 + 8],
          [x + 6, z1 - 8],
          [x + w - 6, z1 - 8],
        ]) {
          const tr = 1.4;
          seg(s, g.x(tx - tr), g.z(tz - tr), g.x(tx + tr), g.z(tz + tr), { sw: W.fine, opacity: 0.78 });
          seg(s, g.x(tx + tr), g.z(tz - tr), g.x(tx - tr), g.z(tz + tr), { sw: W.fine, opacity: 0.78 });
        }
      }
    }
    for (let c = 1; c < cols; c += 1) {
      seg(s, g.x(c * bw), g.z(0), g.x(c * bw), g.z(g.hCm), { sw: W.mid, opacity: 0.65 });
    }
    edge(s, g, W.mid);
  });

/**
 * 36 HULL PLATING — IDENTIFYING FEATURE: **VERTICAL LAPPED STRAKES WITH WELD BEADS**, in the
 * heaviest ink in the set. The warm swatch's identity was "darkest steel, vertical seams + rivet
 * dots" and the VERTICAL SEAM is what is kept; the rivets are given up on purpose, because they are
 * `steel-bulkhead`'s tell and two walls sharing one fastener is two walls a player cannot tell
 * apart. A hull is WELDED — a lap line with a stitched bead beside it — which is both the honest
 * construction for pressure plating and a mark nothing else in the set carries.
 *
 * SCALE: 50 cm strakes (two to a metre) with a 3 cm lap, butt straps at 80 and 160 cm, a 6 cm bead
 * stitch. `W.mass` throughout: this is the one wall that is also the ship.
 *
 * ⚠️ THE BEAD IS A CONTINUOUS ZIGZAG STITCH, NOT A HEAVY DASH — and the header above has said
 * "stitch" since the piece was written while the drawing said something else. A round-capped dash
 * renders as a chain of SEPARATED PILLS at catalogue and Room-Zoom size, which is indistinguishable
 * from a fastener row; a fastener row is `steel-bulkhead`'s tell, so the two walls this piece exists
 * to be distinct from were sharing a mark. A cold reader called the result "a storage locker" (high
 * confidence) — the top bead band read as a vent grille / hardware strip. A zigzag is ONE ink run
 * with no gaps, so it cannot read as discrete hardware, and a chevron stitch is the more honest mark
 * for a WELD in any case.
 */
export const hullPlating = (opts = {}) =>
  skin('hull-plating', opts, (s, g) => {
    ground(s, g);
    // The bead, as one continuous run. ⛔ IT IS DRAWN AT `g.u(1.3)`, NOT `g.u(2.2)`: a zigzag lays
    // down roughly twice the ink length of a 2.5-on-4.5 dash over the same span, so keeping the old
    // weight would have made the bead the heaviest thing on a wall whose STRAKE is supposed to be
    // (`paper-materials.test.js`'s PITCH row pins this piece's vertical family at `W.mass` and caps
    // it there).
    const zig = (pts, o) =>
      s.path(
        pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' '),
        { fill: 'none', stroke: INK, sw: o.sw, opacity: o.opacity },
      );
    const vBead = (xc, z0, z1) => {
      const pts = [];
      let side = 1;
      for (let z = z0; z <= z1; z += 6) { pts.push([g.x(xc + side * 2.2), g.z(z)]); side = -side; }
      zig(pts, { sw: g.u(1.3), opacity: 0.62 });
    };
    const hBead = (zc, x0, x1) => {
      const pts = [];
      let side = 1;
      for (let x = x0; x <= x1; x += 6) { pts.push([g.x(x), g.z(zc + side * 2.2)]); side = -side; }
      zig(pts, { sw: g.u(1.3), opacity: 0.62 });
    };
    // Each strake seam is a LAP: the plate edge, a 3 cm shadow band where the next plate lies over
    // it, and a weld stitch beside it.
    for (let x = 0; x <= g.wCm; x += 50) {
      const lap = Math.min(3, g.wCm - x);
      if (lap > 0) boxCm(s, g, x, 0, lap, g.hCm, { fill: INK, opacity: 0.1 });
      seg(s, g.x(x), g.z(0), g.x(x), g.z(g.hCm), { sw: W.mass });
      if (x + 3 <= g.wCm) {
        seg(s, g.x(x + 3), g.z(0), g.x(x + 3), g.z(g.hCm), { sw: W.hair, opacity: 0.55 });
        vBead(x + 5.5, 1, g.hCm - 1);
      }
    }
    for (const z of [80, 160]) {
      if (z + 10 > g.hCm) continue;
      boxCm(s, g, 0, g.hCm - z - 10, g.wCm, 10, { fill: INK, opacity: 0.07 });
      rail(s, g, z, { sw: W.fine });
      rail(s, g, z + 10, { sw: W.fine });
      hBead(z + 5, 1, g.wCm - 1);
    }
    // TACK SQUARES at every plate corner — the mark that says a plate was set and held before it was
    // run. Square, like `blast-wall`'s bolts and unlike `steel-bulkhead`'s round rivets, but at a
    // corner rather than in a row.
    for (let x = 0; x <= g.wCm; x += 50) {
      for (const z of [6, ...(g.full ? [80, 90, 160, 170, g.hCm - 6] : [])]) {
        if (x + 4 > g.wCm) continue;
        boxCm(s, g, x + 5, g.hCm - z - 2, 4, 4, { fill: INK, opacity: 0.6 });
      }
    }
    edge(s, g, W.mass);
  });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FLOORS — 100 × 100 cm, laid SHEARED into the tile's floor parallelogram
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 37 STEEL-TAN FLOOR — the authored deck, material byte 0. IDENTIFYING FEATURE: **ONE PLATE, FOUR
 * COUNTERSUNK SCREWS**. It is deliberately the QUIETEST skin in the set: it is what the whole ship
 * is already made of, so anything the player builds must read as a change against it.
 *
 * ⚠️ IT IS NOT DRAWN IN THE ROOM. `room-model.js` `roomMaterialTiles` emits a floor tile only when
 * its material is NON-default, so this piece reaches the player through the palette swatch and
 * nowhere else on the shipping surface — which is exactly why it must still be a real drawing.
 *
 * SCALE: a 1 m deck plate with a 4 cm chamfer, screws 12 cm in from each corner, and the warm
 * swatch's "fine dark grid" kept as a faint 18 cm scribe crosshair at the centroid — the plate's own
 * centre marks. ⚠️ IT IS A TICK, NOT A CROSS: drawn edge to edge it quartered the tile into four
 * bare equal cells and a cold reader called the piece "a crew bunk bed (2×2 sleeping compartments)".
 */
export const steelTanFloor = (opts = {}) =>
  skin('steel-tan-floor', opts, (s, g) => {
    ground(s, g);
    boxCm(s, g, 4, 4, g.wCm - 8, g.hCm - 8, { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.4 });
    // Centre marks as a SHORT crosshair rather than a full edge-to-edge cross: a plate's own
    // alignment tick, not a seam. A full-length cross split the tile into four bare equal
    // quadrants — the one shape on this piece a reader without context read as a partitioned
    // object (a bunk frame) rather than as a single deck plate. A short tick at the centroid keeps
    // the same documented mark ("the plate's own centre marks") without manufacturing a false seam.
    const cx = g.wCm / 2;
    const cy = g.hCm / 2;
    seg(s, g.x(cx - 9), g.y(cy), g.x(cx + 9), g.y(cy), { sw: W.hair, opacity: 0.24 });
    seg(s, g.x(cx), g.y(cy - 9), g.x(cx), g.y(cy + 9), { sw: W.hair, opacity: 0.24 });
    for (const [sx, sy] of [[12, 12], [g.wCm - 12, 12], [12, g.hCm - 12], [g.wCm - 12, g.hCm - 12]]) {
      s.circle({ cx: g.x(sx), cy: g.y(sy), r: g.u(2.2), fill: 'none', stroke: INK, sw: W.hair });
      seg(s, g.x(sx - 1.5), g.y(sy - 1.5), g.x(sx + 1.5), g.y(sy + 1.5), { sw: W.hair, opacity: 0.8 });
    }
    edge(s, g, W.fine);
  });

/**
 * 38 WOOD PLANK FLOOR — IDENTIFYING FEATURE: **20 cm BOARDS WITH STAGGERED BUTTS AND GRAIN**. The
 * warm swatch ran its planks VERTICALLY at a 21 px band; these run ACROSS, which is the direction
 * that survives the shear as a clean set of parallel rules rather than as a fan.
 *
 * SCALE: 20 cm boards, five to a tile so the courses line up across a whole floor; the butt joints
 * alternate at 38 % and 62 % and carry two nail ticks each, which is the mark that says "laid" and
 * not "printed". One grain curve per board, at 0.35 opacity.
 */
export const woodPlankFloor = (opts = {}) =>
  skin('wood-plank-floor', opts, (s, g) => {
    ground(s, g);
    const planks = Math.round(g.hCm / 20);
    const bh = g.hCm / planks;
    for (let i = 0; i < planks; i += 1) {
      const y0 = i * bh;
      if (i > 0) {
        course(s, g, y0, { sw: W.fine });
        course(s, g, y0 + 2, { sw: W.hair, opacity: 0.28 });
      }
      const bx = i % 2 === 0 ? 38 : 62;
      const ym = y0 + bh / 2;
      // The staggered butt seam — a SHORT mark centred on the joint, floating clear of both course
      // lines above and below it, so the family reads as "where two boards meet" rather than as a
      // full-height shelf divider (a cold read of the tile called it "a storage shelf"). `W.mid` and
      // the [8,30] cm length window are load-bearing for the shear-direction legs in
      // `paper-materials.test.js` — only the SPAN (was ~18.8 cm, now 10 cm) and the opacity (new)
      // changed from the first draft.
      seg(s, g.x(bx), g.y(ym - 5), g.x(bx), g.y(ym + 5), { sw: W.mid, opacity: 0.6 });
      // Two nail ticks, offset rather than mirrored, so the mark reads as fastening along a seam and
      // not as a pair of shelf-pin sockets flanking a post.
      s.circle({ cx: g.x(bx - 3.5), cy: g.y(ym - 2.2), r: g.u(0.6), fill: INK, opacity: 0.5 });
      s.circle({ cx: g.x(bx + 3.5), cy: g.y(ym + 2.2), r: g.u(0.6), fill: INK, opacity: 0.5 });
      // Grain: two unequal sweeps per board — the long shallow one that was already here, plus a
      // shorter second run — so the field reads as WOOD and outweighs the now-quieter joint mark.
      s.path(
        `M${g.x(2)} ${g.y(ym - 1.2)} C${g.x(26)} ${g.y(ym - 3.6)} ${g.x(64)} ${g.y(ym + 3.2)}` +
          ` ${g.x(g.wCm - 2)} ${g.y(ym - 0.8)}`,
        { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.4 },
      );
      s.path(
        `M${g.x(10)} ${g.y(ym + 4.4)} C${g.x(30)} ${g.y(ym + 6)} ${g.x(52)} ${g.y(ym + 3.6)}` +
          ` ${g.x(74)} ${g.y(ym + 5.4)}`,
        { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.22 },
      );
    }
    edge(s, g, W.fine, 0.7);
  });

/**
 * 39 GROW MATTING — IDENTIFYING FEATURE: **AN OPEN OVER-UNDER BASKET WEAVE**. This is the other hard
 * pair (`carpet-floor`), and the separation is structural rather than tonal: matting is a LATTICE
 * with real gaps you can see the deck through, drawn as straps that pass alternately over and under;
 * carpet is a closed pile field inside a border. Neither can be mistaken for the other at any size
 * where either is legible.
 *
 * SCALE: a 12.5 cm weave period — eight straps to the metre, 9 cm strap over a 3.5 cm gap, which is
 * a real coir/strap matting sett. Built as ONE `<pattern>` on a 25 cm cell (the 2 × 2 weave unit)
 * rather than as ~130 rects per tile: the same drawing, two orders of magnitude less string, and the
 * phase is per-element so every tile in a room agrees.
 */
export const growMatting = (opts = {}) =>
  skin('grow-matting', opts, (s, g) => {
    ground(s, g);
    const P = g.u(25);
    const A = g.u(9);
    const B = g.u(12.5);
    const GAP = r3(B - A);
    const FAR = g.u(21.5); // the far gap's near edge (B + A in real cm), kept as its own honest cm call
    // The four TRUE gaps — the tell the header promises ("real gaps you can see the deck through").
    // The six strap rects below cover only the crossing bands; they leave these four 3.5 x 3.5 cm
    // squares per weave cell untouched, so undrawn they show the SAME paper as every strap and the
    // whole field reads as a flat grid of ruled panels (a shelf, not a lattice) rather than an open
    // weave. Drawn dark, at low coverage (≈7.8 % of the cell) so the mean darkening stays well under
    // the dialect's no-large-solid-fills ceiling (metal-grating's 32 %@0.30 ≈ 9.6 % mean; this is
    // ≈3.5 % mean). Placed LAST in the pattern so they always show through regardless of any strap
    // edge that lands on their border.
    const gapMark = (x, y) =>
      `<rect x="${r3(x)}" y="${r3(y)}" width="${GAP}" height="${GAP}" fill="${INK}" opacity="0.45"/>`;
    const weave = s.pat(
      // vertical straps, full height (their end caps fall outside the cell and are clipped away)
      pr(0, 0, A, P, PAPER, INK, W.hair) +
        pr(B, 0, A, P, PAPER, INK, W.hair) +
        // horizontal straps over them
        pr(0, 0, P, A, PAPER, INK, W.hair) +
        pr(0, B, P, A, PAPER, INK, W.hair) +
        // …and the two crossings where the vertical strap is the one on top
        pr(0, 0, A, A, PAPER, INK, W.hair) +
        pr(B, B, A, A, PAPER, INK, W.hair) +
        // the four gaps, drawn over everything
        gapMark(A, A) + gapMark(A, FAR) + gapMark(FAR, A) + gapMark(FAR, FAR),
      { w: P, h: P },
    );
    boxCm(s, g, 0, 0, g.wCm, g.hCm, { fill: weave });
    edge(s, g, W.hair, 0.45);
  });

/**
 * 40 CREAM TILE FLOOR — IDENTIFYING FEATURE: **A 4 × 4 GRID OF 25 cm SQUARE TILES WITH GROUT**. The
 * warm swatch's "faint tile grid" made honest: the grid is now a real tile size rather than a 26 px
 * cell, and each tile carries its own bevel so the surface reads as laid units and not as ruling.
 *
 * SCALE: 25 cm tiles, four to the metre — the medbay/galley module. Grout at `W.fine` with a
 * chamfer highlight 1.5 cm off it; a 2 cm bevel inside every tile at 0.18.
 */
export const creamTileFloor = (opts = {}) =>
  skin('cream-tile-floor', opts, (s, g) => {
    ground(s, g);
    const n = 4;
    const p = g.wCm / n;
    const q = g.hCm / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        boxCm(s, g, i * p + 2, j * q + 2, p - 4, q - 4, {
          fill: 'none', stroke: INK, sw: W.hair, opacity: 0.18,
        });
      }
    }
    for (let i = 1; i < n; i += 1) {
      post(s, g, i * p, { sw: W.fine, opacity: 0.7 });
      seg(s, g.x(i * p + 1.5), g.y(0), g.x(i * p + 1.5), g.y(g.hCm), { sw: W.hair, opacity: 0.3 });
      course(s, g, i * q, { sw: W.fine, opacity: 0.7 });
      course(s, g, i * q + 1.5, { sw: W.hair, opacity: 0.3 });
    }
    edge(s, g, W.fine);
  });

/**
 * 41 METAL GRATING — IDENTIFYING FEATURE: **OPEN SLOTS**. It is the only skin in the set with any
 * dark area at all, and that is the point: a grating is a floor with holes in it, and the holes are
 * the one thing a player must be able to read at a glance (they are also why a dropped part is gone).
 *
 * SCALE: 6.25 cm bearing-bar pitch — sixteen bars to the metre, a heavy-duty walkway sett — with a
 * 2 cm slot, and cross rods every 10 cm drawn OVER the slots so the bars are visibly interrupted
 * rather than merely striped. Ink coverage is 32 % of the tile at opacity 0.30, i.e. under a tenth
 * of a tone mean: dark slots, not a dark tile (the dialect's no-large-solid-fills rule).
 *
 * ⚠️ THE CROSS-ROD CADENCE WAS 25 cm AND IT DREW A LADDER. Four equal full-width rails over long
 * vertical slats is the bed-frame/ladder silhouette, and a cold reader called this floor "a bunk
 * bed" — a furniture read on a piece whose whole job is to read as a SURFACE. At 10 cm each open
 * bar is a 2 × 10 cm cell rather than a 2 × 25 cm slat and the field reads as dense perforated mesh.
 * ⛔ 10 STILL DIVIDES THE METRE, so the floor-pitch rule (a pitch that does not divide 100 cm leaves
 * a partial course at the tile edge, and the seam between two tiles then reads as a defect) holds.
 * ⛔ AND THE 6.25 cm BAR PITCH — the one this piece's PITCH row actually pins — IS UNTOUCHED.
 */
export const metalGrating = (opts = {}) =>
  skin('metal-grating', opts, (s, g) => {
    ground(s, g);
    const P = g.u(6.25);
    const bars = s.pat(
      pr(0, 0, P, P, PAPER) +
        `<rect x="0" y="0" width="${g.u(2)}" height="${P}" fill="${INK}" opacity="0.3"/>` +
        `<path d="M${g.u(2)} 0 L${g.u(2)} ${P}" stroke="${INK}" stroke-width="${r3(W.hair)}"` +
        ' opacity="0.4"/>',
      { w: P, h: P },
    );
    boxCm(s, g, 0, 0, g.wCm, g.hCm, { fill: bars });
    // The cross rods pass OVER the bearing bars, so they are PAPER bands that interrupt the slots —
    // which is what makes the field read as a grating rather than as stripes. 3 cm at `W.fine`: the
    // first draft's 2.5 cm hairline was eaten by the floor plane's 0.6 vertical compression.
    // TEN to the metre, a real crimped cross-rod pitch — see the header for why 25 cm drew a ladder.
    for (let y = 10; y < g.hCm; y += 10) {
      boxCm(s, g, 0, y - 1.5, g.wCm, 3, { fill: PAPER, stroke: INK, sw: W.fine, opacity: 0.9 });
    }
    // A floor butts its neighbour edge to edge and must not read as a bordered panel. `W.fine`
    // matches every other floor in the set — this was the one floor still carrying a wall-grade
    // `W.mid` perimeter, which is the second half of the frame the blind guess caught.
    edge(s, g, W.fine);
  });

/**
 * 42 CARPET FLOOR — IDENTIFYING FEATURE: **A DENSE EVEN PILE INSIDE A DOUBLE-RULED BORDER**. The
 * warm swatch was "a red woven field with a cream border (= the rug field)"; the BORDER is the piece
 * of that identity that survives into a palette with no second colour, and it is also what separates
 * carpet from `grow-matting` — closed field and a frame, against an open lattice and none.
 *
 * SCALE: a 12.5 cm pile cell carrying six tufts, so the field is ~380 marks to the square metre and
 * reads as texture rather than as pattern; the border sits 8 cm in with a stitched band between its
 * two rules. Each tile carries its own border, which is what a carpet TILE is — and it is the honest
 * drawing for a material the player lays one square metre at a time.
 */
export const carpetFloor = (opts = {}) =>
  skin('carpet-floor', opts, (s, g) => {
    ground(s, g);
    const P = g.u(12.5);
    // ⚠️ THE PILE IS DENSER AND DARKER THAN THE FIRST DRAFT, and the reason is the SHEAR rather than
    // taste: six tufts at 0.38 read as texture on the flat swatch and as an empty tile once the
    // floor plane compressed the field to 0.6 of its height. Seen on the sheet, not reasoned out.
    //
    // ⭐ EVERY TUFT RAN THE SAME DIAGONAL, and a field of uniform, evenly-pitched, parallel dashes
    // inside a crisp double-ruled frame reads as a slotted grille cover, not a pile fabric — a cold
    // read confirmed it ("ventilation grate", medium confidence). The fix keeps the exact same
    // twelve anchor points, the same density, weight and opacity, and only ALTERNATES the tuft's
    // lean: six keep the original down-right slope, six mirror to down-left about their own
    // centre (`(x1,y1)-(x2,y2)` becomes `(x2,y1)-(x1,y2)`, so the bounding box and length are
    // untouched). Crossed strokes read as a nap catching light from two directions; a single lean
    // reads as a cut.
    const tuft = (x1, y1, x2, y2) =>
      `<path d="M${g.u(x1)} ${g.u(y1)} L${g.u(x2)} ${g.u(y2)}" stroke="${INK}"` +
      ` stroke-width="${r3(W.hair)}" opacity="0.55" fill="none" stroke-linecap="round"/>`;
    const pile = s.pat(
      pr(0, 0, P, P, PAPER) +
        tuft(1.4, 2.2, 2.5, 3.9) + tuft(5.9, 0.8, 4.6, 2.0) +
        tuft(8.0, 2.4, 8.9, 4.1) + tuft(12.1, 0.9, 11.0, 2.4) +
        tuft(2.6, 5.4, 4.0, 6.4) + tuft(7.1, 4.9, 6.2, 6.7) +
        tuft(9.6, 6.0, 11.0, 7.0) + tuft(1.8, 8.1, 0.7, 9.7) +
        tuft(4.1, 8.8, 5.5, 9.8) + tuft(8.4, 8.2, 7.4, 9.9) +
        tuft(10.6, 9.4, 12.0, 10.4) + tuft(3.4, 11.2, 2.2, 12.3),
      { w: P, h: P },
    );
    boxCm(s, g, 0, 0, g.wCm, g.hCm, { fill: pile });
    boxCm(s, g, 8, 8, g.wCm - 16, g.hCm - 16, { fill: 'none', stroke: INK, sw: W.mid });
    boxCm(s, g, 12, 12, g.wCm - 24, g.hCm - 24, { fill: 'none', stroke: INK, sw: W.fine, opacity: 0.6 });
    s.path(
      `M${g.x(10)} ${g.y(10)} L${g.x(g.wCm - 10)} ${g.y(10)} L${g.x(g.wCm - 10)} ${g.y(g.hCm - 10)}` +
        ` L${g.x(10)} ${g.y(g.hCm - 10)} Z`,
      { fill: 'none', stroke: INK, sw: W.hair, opacity: 0.5, dash: `${g.u(2)} ${g.u(3)}` },
    );
    edge(s, g, W.fine);
  });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The specs, the sizes and the painter map
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every skin's DRAWN extent in centimetres — `w` across, `h` up (a wall) or back (a floor).
 *
 * These are not decoration: they are what `SIZES` is derived from and what
 * `client/test/paper-materials.test.js` measures the emitted geometry against. A wall is one metre
 * of run at the compartment's own ceiling; a floor is one sim tile, which is one metre
 * (`room-model.js` `M_PER_TILE`).
 */
export const SPECS = Object.freeze({
  'steel-bulkhead': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'timber-lined-wall': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'blast-wall': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'glass-partition': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'insulated-wall': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'hull-plating': { w: TILE_CM, h: WALL_H_CM, surface: 'wall' },
  'steel-tan-floor': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
  'wood-plank-floor': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
  'grow-matting': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
  'cream-tile-floor': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
  'metal-grating': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
  'carpet-floor': { w: TILE_CM, h: TILE_CM, surface: 'floor' },
});

/** The twelve ids, walls then floors, in the picker's own order. */
export const MATERIAL_IDS = Object.freeze(Object.keys(SPECS));

/**
 * The registry `size` hint — the piece's drawn footprint in the mock-px space every other `ITEMS`
 * row states its size in. DERIVED from `SPECS` at `PX_PER_CM.catalogue`, which is `fittings.SIZES`'
 * rule verbatim and for its reason: one shared centimetre scale is what makes the numbers comparable
 * ACROSS the registry, so a 2.4 m wall reads bigger than a 1 m floor tile and both read against a
 * 183 cm locker. The warm rows all claimed `106 × 94` — the mock's CARD size, identical for all
 * twelve, which said nothing about anything.
 */
export const SIZES = Object.freeze(
  MATERIAL_IDS.reduce((out, id) => {
    const k = PX_PER_CM.catalogue;
    out[id] = Object.freeze({
      w: Math.max(1, Math.round(k * SPECS[id].w)),
      h: Math.max(1, Math.round(k * SPECS[id].h)),
    });
    return out;
  }, {}),
);

/**
 * Every skin's BUILDER, keyed by itemId — the same function its exported const is.
 *
 * Not derived: each entry names its own const, so a row cannot point at another row's drawing.
 * `wrecked.test.js` calls that shape the SWAP and it is invisible to every other guard in this repo;
 * `fittings.js` keeps a `DRAW` map for the same reason.
 */
export const BUILD = Object.freeze({
  'steel-bulkhead': steelBulkhead,
  'timber-lined-wall': timberLinedWall,
  'blast-wall': blastWall,
  'glass-partition': glassPartition,
  'insulated-wall': insulatedWall,
  'hull-plating': hullPlating,
  'steel-tan-floor': steelTanFloor,
  'wood-plank-floor': woodPlankFloor,
  'grow-matting': growMatting,
  'cream-tile-floor': creamTileFloor,
  'metal-grating': metalGrating,
  'carpet-floor': carpetFloor,
});
