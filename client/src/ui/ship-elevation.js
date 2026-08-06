// THE SIDE-ELEVATION PROJECTION — the Level-1 plate's ONE coordinate contract, pure and DOM-free.
//
// Authority: `design-import/Perilune Ship - Drawn.html` (the owner's drawing, 2026-08-05). Every
// literal below was MEASURED off that file's rendered SVG — the page is a JS bundle, so it was
// rendered headless and its markup read out of the live DOM — and the element it came from is named
// inline so the next reader re-measures instead of trusting a comment.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS REPLACED, AND WHY IT IS A REPLACEMENT RATHER THAN AN EDIT
// ─────────────────────────────────────────────────────────────────────────────────────────────
// VR-P4's plate drew ONE deck as a GRID OF COMPARTMENT TILES over a top-down hull capsule. The owner
// named three complaints about it, and this projection is the fix for all three at once:
//
//   1. "the top-down plate does not match the oblique fittings" → THERE IS NO TOP-DOWN VIEW LEFT.
//      The hull is a side ELEVATION and every compartment is the same oblique cutaway the fittings
//      are drawn in, so the plate and its contents are one projection.
//   2. "the rooms are weirdly separated in boxes" → COMPARTMENTS ARE NO LONGER BOXES. A deck is ONE
//      continuous oblique floor plane; the compartments TILE it contiguously and the lines between
//      them are shared PARTITION WALLS standing on that floor, not four borders each.
//   3. "it should look sketchier" → the architecture strokes go through `render/sketch.js`'s
//      `strong` preset (applied by the composer, not here — this file is arithmetic only).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE MAPPING, IN FULL — and read the LIMIT paragraph before editing anything.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// A tile is `(tx, ty, deck)`. The sim's per-deck tile grid is a TOP-DOWN PLAN: `tx` runs along the
// ship, `ty` runs across its beam, and the SPINE corridor is the band of `ty` between the two banks
// of compartments (measured on `--ship wreck`: 8 slots a deck, four at `ty 0..8` and four at
// `ty 10..18`, spine at `ty 8..10`, frame 45 × 18).
//
//   deck    → a horizontal BAND of the hull's interior bay. Highest deck index on top, which is
//             `deckPips`' own order (`overview-model.js`), so the rail and the drawing cannot come
//             to disagree about which way is up.
//   (tx,ty) → a point on that band's ONE oblique floor plane, through `(u, v)`:
//               u ∈ [0,1]  along the band
//               v ∈ [0,1]  back into the band  (the oblique's own depth axis)
//             and `floorPoint(band, u, v) = O + u·BU + v·BV`, whose basis is READ OFF `roomFrame`
//             so the drawing and the click map move together if the kit's ratios ever move.
//
// The `(tx,ty) → (u,v)` half is where the ship's own geometry enters, and it has TWO REGIONS:
//
//   A COMPARTMENT.  Slot `i` owns the contiguous u-interval `[uStart_i, uStart_i + uSpan_i)`, with
//                   `uSpan_i` PROPORTIONAL TO ITS TILE-X SPAN (`rect.w`) — that is the dimensional
//                   honesty rule, satisfied by construction rather than by arrangement. Inside it,
//                   `u` is the fraction across the slot's own `rect.w` and `v` is the fraction back
//                   through its `rect.h`, remapped into `[V_SPINE, 1]`.
//   THE SPINE.      Every tile inside NO slot maps into `v ∈ [0, V_SPINE)` — the WALKWAY drawn at
//                   the FRONT of the deck floor, nearest the viewer, running the band's whole
//                   length — with `u` the tile's honest position along the deck's x extent.
//
// The two regions are separated by `v`, which is what makes `invert` a total function with an exact
// inverse: a point with `v < V_SPINE` is on the walkway, everything else is in the compartment whose
// u-interval contains `u`. No point on a band is unaddressable and no tile is undrawable.
//
// ⛔⛔ THE ONE HONESTY LIMIT, STATED BECAUSE IT IS REAL AND CANNOT BE DESIGNED AWAY.
// **`u` IS POSITION ALONG THE DECK'S WALK, NOT POSITION ALONG THE HULL.** A deck's compartments are
// laid out in SLOT ORDER — which is the sim's own row-major order over its slot grid, i.e. the near
// bank bow-to-stern and then the far bank — so the wreck's `cryobay` (tiles x 0..12, y 0..8) and
// `reactor` (tiles x 0..12, y 10..18) sit at the SAME place along the hull and are drawn side by
// side. The band is the deck UNROLLED.
//
// ⛔ AND THE ALTERNATIVE WAS MEASURED AND REJECTED, not waved away. Mapping `ty` to the band's own
// depth axis — the literally-true cutaway, where the far bank stands behind the near one — makes the
// far bank INVISIBLE, and the arithmetic says so exactly: with a shared deck volume the far bank's
// floor clears the near bank's wall tops only when `0.111·DEPTH_Y > WALL`, i.e. when the deck's depth
// rise exceeds NINE TIMES its own wall height. At the design's own ratios (`DEPTH_Y = 168s`,
// `WALL = 240s`) it is off by a factor of ~13. A projection in which half the ship's rooms cannot be
// seen or pressed is not more honest than one that says out loud that it is unrolled; the caption
// says it (`overview-model.js` `deckCaptionLine`) and `ship-elevation.test.js` pins it.
//
// ⚠️ Consequences a later lane must not re-derive: two compartments at the same hull position are
// drawn apart, so the plate is NOT a navigational aid for "what is above what".
//
// ⛔⛔ AND THE WALKWAY'S SECOND CONSEQUENCE IS BIGGER THAN THE SENTENCE THAT USED TO STAND HERE.
// That sentence said *"the wreck's 90 spine tiles share a ~7 px-deep strip … the round trip there is
// exact"*, and both halves were misleading:
//
//   (a) THE STRIP DOES NOT CARRY 90 TILES' WORTH OF `ty`, IT CARRIES THE DECK'S WHOLE RANGE.
//       `tileExtent` UNIONS the slots' bounding box with the FRAME (deliberately — see its header),
//       so `ext.minY..maxY` is `0..h` of the whole 45 × 18 = 810-tile deck grid, and the walkway's
//       inverse spreads `v ∈ [0, V_SPINE)` linearly across ALL of it. MEASURED on the census fixture
//       (which is the wreck's shape: two banks of four 12 × 8 compartments, spine at ty 8..9): the
//       strip is **7.84 px deep and addresses all 18 `ty` rows**, of which only 2 (the 90 spine
//       tiles) are actually walkway. So sixteen of every eighteen answers a press in the strip gives
//       name a row that is drawn as a COMPARTMENT somewhere else on the band.
//   (b) "THE ROUND TRIP IS EXACT" IS TRUE OF THE WRONG COMPOSITION. What the census pins is
//       `invert ∘ project` — tile → point → tile — and that is exact (1620/1620). A PRESS is
//       `project ∘ invert`, pixel → tile → where that tile draws, and 18 rows sharing 7.84 px cannot
//       be exact in that direction: whole bands of pixels collapse onto one row and the row they
//       land on is mostly not drawn there.
//
// ⚠️ IT IS INHERITED, NOT CREATED HERE, AND IT IS IMPROVED IN AREA. VR-P4's plate had the same
// two-region shape in `overview-scene.js`'s `bandInvert` (still on `main`) with the same frame-union
// extent; independent review measured its press round trip at 87.9 % same-structure. The elevation
// does not fix the class — closing it needs the spine to own its own `ty` axis, which is a design
// question about what a corridor IS on this plate — but it gives the strip a real, pressable depth
// instead of a hairline. FILED for the owner in `docs/HANDOVER.md`; a player who wants one
// particular spine tile should be in the Room Zoom, which has no such compression.

import { roomFrame, poly, INK, PAPER, PAPER_FLAT, ATTEND, FONT, n } from '../render/oblique.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The plate's design space.
//
// MEASURED: the owner's drawing is a single `<svg width="1180" viewBox="4 18 1058 334">`. This module
// scales that box UNIFORMLY to 1300 wide, so every constant below is a design number and the ship's
// static art is emitted VERBATIM under one transform (`SHIP_XF`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The owner's own viewBox. Nothing here may drift from it without re-rendering the design file. */
export const SRC = Object.freeze({ x: 4, y: 18, w: 1058, h: 334 });

export const VIEW_W = 1300;
/** `SRC.h × K`, rounded — the drawing's own aspect, kept so the ship is never stretched. */
export const VIEW_H = 410;

/** Design px → plate px. */
export const K = VIEW_W / SRC.w;

/** The one transform every design-verbatim path is emitted under. */
export const SHIP_XF = `scale(${n(K)}) translate(${n(-SRC.x)} ${n(-SRC.y)})`;

/**
 * THE INTERIOR BAY — the rectangle the decks are stacked in.
 *
 * MEASURED off the drawing, in DESIGN px: the upper deck row is
 * `M150 110 L906 110 L906 164.4 L150 164.4 Z` (`data-dc-tpl="485"` and its five siblings) and the
 * lower one runs to `y 244.7` (`data-dc-tpl="524"`). So the bay is x 150..906, y 110..244.7.
 *
 * ⛔⛔ IT IS EXPORTED IN **PLATE** PX, NOT DESIGN PX, AND THE CONVERSION IS THE WHOLE REASON THIS
 * COMMENT IS LONG. The static ship art is emitted inside a `<g transform="SHIP_XF">`, so IT may be
 * written in the design's own numbers. The DECKS may not: the click path is
 * `getScreenCTM().inverse()` into the SVG's ROOT viewBox (BUG-B's route, and it must stay so), so
 * `invert` is handed ROOT coordinates and every projection this file computes has to be in them.
 *
 * ⚠️ A PROJECTION LEFT IN DESIGN SPACE PASSES ITS OWN ROUND TRIP AND IS STILL WRONG, which is why
 * this is written down rather than assumed. The first cut of this package did exactly that: the
 * tile→point→tile identity read 1620/1620 (a map inverts its own space perfectly, whatever space
 * that is) while the decks were drawn 33 px left and 100 px high of the hull they belong inside. The
 * round trip is NOT the instrument for this class of error — the live rig's press census and a
 * photograph are.
 */
export const BAY_D = Object.freeze({ x: 150, y: 110, w: 756, h: 134.7 });
export const BAY = Object.freeze({
  x: (BAY_D.x - SRC.x) * K, y: (BAY_D.y - SRC.y) * K,
  w: BAY_D.w * K, h: BAY_D.h * K,
});

/**
 * The vertical gap between two deck bands, in PLATE px — the drawing's own inter-deck slab
 * (design y 164.4 → 190.4, `data-dc-tpl="531"`, i.e. 26 design px). Shrunk proportionally on a ship
 * with more decks; see `bandLayout`.
 */
export const BAND_GAP = 26 * K;

/**
 * The mini viewBox height the design's own compartment symbols use (`-10 -10 992 428`), which is
 * `408` of drawing plus a `10` margin top and bottom. It is the DIVISOR that turns a band height
 * into the oblique's px-per-cm, and using it is what makes a band reproduce the design exactly at
 * two decks: `s = BH / 428` gives `s = 0.127` at `BH = 54.35`, and the drawing's own `<use>` scales
 * its 992-wide symbol into a 126-wide cell at `126/992 = 0.127`.
 */
export const MINI_H = 428;

/**
 * The deck's own dimensions, in METRES, taken from the design's compartment symbol —
 * `roomFrame(8.6, 2.8, 2.4, 1.0, {x:0,y:408})` reproduces its floor quad
 * `M0 408 L860 408 L972 240 L112 240 Z` corner for corner. The DEPTH and the HEIGHT are facts about
 * the ship (its beam and its deck height) and are shared by every band; the WIDTH is not used —
 * a band's across-span is derived from the bay instead, because the ship's length is the one
 * dimension that has to stretch to hold however many compartments a deck has.
 */
export const DECK_M = Object.freeze({ d: 2.8, h: 2.4 });

/**
 * ⭐ THE WALKWAY'S SHARE OF A BAND'S DEPTH. The corridor is drawn at the FRONT of the deck floor
 * (nearest the viewer) and the compartments stand behind it, so `v ∈ [0, V_SPINE)` is spine and
 * `v ∈ [V_SPINE, 1]` is compartment. 0.3 is the design's own proportion, measured: its inter-deck
 * slab is 26 px of an 80.4 px deck pitch, and the drawn walkway inside it (the `#E1D9C5` face from
 * y 175.3 to y 190.4, `data-dc-tpl="532"`) is 15.1 of that.
 *
 * ⛔ IT IS ALSO THE SEPARATOR THAT MAKES `invert` EXACT. Compartments and the spine share a band's
 * `u` axis but never its `v`, so a point's region is decided by one compare before any interval
 * search. Moving this constant moves both the drawing and the click map, together, by construction.
 */
export const V_SPINE = 0.3;

/** The smallest band this module will draw. Below it a compartment interior is a silhouette rather
 *  than a drawing, and — as with VR-P4's `MIN_TILE` — the unclamped arithmetic goes NEGATIVE: at
 *  `BAY.h = 134.7` and `BAND_GAP` shrinking with the deck count, `(BAY.h - (D-1)*gap)/D` crosses
 *  zero and a negative band inverts every rect drawn in it and is trivially "inside" any
 *  containment test. PLATE px, like everything else this file projects into. */
export const MIN_BAND_H = 26 * K;

/**
 * THE DECK STACK. Which deck gets which horizontal band, in design px.
 *
 * ⭐ THE ORDER IS `deckPips`' ORDER — HIGHEST DECK INDEX ON TOP — and it is deliberately the same
 * expression (`sort((a,b) => b - a)`) rather than a second one that happens to agree today. The deck
 * rail is a vertical column of pips painted in that order, so a plate that stacked the other way
 * would put the rail's top pip against the drawing's bottom band and nothing would catch it.
 *
 * ⚠️ A DECK COUNT ABOVE TWO DEGRADES, AND SAYS SO. The gap shrinks with the count and the band
 * height has a positive floor; when the floor binds, the stack is TALLER than `BAY.h` and
 * `overflows` is true, so a caller (and the test) can see the degradation rather than infer it from
 * a shape. Measured, in PLATE px: `--ship wreck` (2 decks) → 66.8 px bands in a 165.5 px bay and no
 * overflow; `--ship grid` (8 decks) → the floor binds at 31.9 px and the stack is 478 px in that
 * same 165.5 px bay. The grid ship is
 * an economy fixture that is never offered to a player (CLAUDE.md), and this is stated rather than
 * hidden.
 *
 * @param {number[]|null} decks the deck indices present on the wire (any order, duplicates fine)
 * @returns {{bands:{deck:number,y:number,h:number}[], gap:number, h:number, overflows:boolean}}
 */
export function bandLayout(decks) {
  const uniq = Array.from(new Set((Array.isArray(decks) ? decks : []).map((d) => d | 0)))
    .sort((a, b) => b - a);
  const list = uniq.length ? uniq : [0];
  const D = list.length;
  // The gap never eats more than 40% of the bay, so a deep ship spends its height on DECKS rather
  // than on the air between them; at two decks the cap is inert and the design's own 26 px stands.
  const g = D > 1 ? Math.min(BAND_GAP, (BAY.h * 0.4) / (D - 1)) : 0;
  const fit = (BAY.h - (D - 1) * g) / D;
  const h = Math.max(MIN_BAND_H, fit);
  const bands = list.map((deck, i) => ({ deck, y: BAY.y + i * (h + g), h }));
  return { bands, gap: g, h, overflows: h > fit };
}

/**
 * ONE BAND'S OBLIQUE FLOOR PLANE, in design px.
 *
 * ⭐⭐ THE BASIS IS READ OFF THE KIT, NEVER RE-TYPED. `roomFrame(...).project` is asked for the floor
 * origin and for the two unit corners, and the basis vectors are their differences — so if
 * `DEPTH_RATIO` ever moves, this projection, its inverse, the partition walls, the fittings and the
 * pawns all move together. That is the same discipline VR-P4's `floorToMini` established after
 * review measured 57 of 59 drawn fittings clicking a different tile than the one they were drawn on;
 * it is kept because the defect it closes is a property of having TWO derivations, not of having a
 * grid.
 *
 * @param {{y:number,h:number}} band a `bandLayout` entry
 * @returns {{O:number[], BU:number[], BV:number[], det:number, s:number, wall:number,
 *            depthX:number, depthY:number, across:number}}
 */
export function deckPlane(band) {
  const h = Math.max(MIN_BAND_H, (band && band.h) || MIN_BAND_H);
  const yTop = (band && band.y) || 0;
  // The design's own scale: a band is one mini viewBox tall.
  const s = h / MINI_H;
  const dCm = DECK_M.d * 100;
  // ⚠️ THE MARGIN IS THE DESIGN'S OWN 10 UNITS at this scale, top and bottom — the symbol's viewBox
  // is `-10 -10 992 428` and the drawing inside it starts at 0. Without it the band's front floor
  // edge sits exactly on the next band's ceiling line and the two decks read as one box.
  const m = 10 * s;
  const f = roomFrame(1, DECK_M.d, DECK_M.h, s, { x: BAY.x + m, y: yTop + h - m });
  const O = f.project(0, 0, 0);
  const back = f.project(0, dCm, 0);
  const depthX = back[0] - O[0];
  const depthY = O[1] - back[1];
  const across = BAY.w - depthX - 2 * m;
  const BU = [across, 0];
  const BV = [depthX, -depthY];
  return {
    O, BU, BV,
    det: BU[0] * BV[1] - BU[1] * BV[0],
    s, across, depthX, depthY,
    /** The deck's own height, in design px — how tall a partition wall stands off the floor. */
    wall: s * DECK_M.h * 100,
  };
}

/** `(u, v)` on a band's floor → design px. PURE. ⛔ NOT ROUNDED — rounding here costs the round trip
 *  its exactness, and the emitters round their own output. */
export function floorPoint(plane, u, v) {
  return [plane.O[0] + u * plane.BU[0] + v * plane.BV[0],
    plane.O[1] + u * plane.BU[1] + v * plane.BV[1]];
}

/** The exact inverse of `floorPoint` — the 2×2 solve of the same basis. PURE. */
export function floorSolve(plane, px, py) {
  const dx = px - plane.O[0], dy = py - plane.O[1];
  if (!plane.det) return [0, 0];
  return [(dx * plane.BV[1] - dy * plane.BV[0]) / plane.det,
    (plane.BU[0] * dy - plane.BU[1] * dx) / plane.det];
}

/**
 * THE COMPARTMENT SPANS on one deck — each slot's contiguous share of the band's `u` axis,
 * PROPORTIONAL TO ITS TILE-X SPAN. PURE, and exported because the composer draws partition walls at
 * the span boundaries and the tests read the same derivation the drawing does.
 *
 * A slot with a non-positive rect gets a zero span and is skipped by both the drawing and the map —
 * it is a slot the wire described as having no geometry, and inventing a width for it would put a
 * pressable compartment on the plate that the ship does not have.
 *
 * @param {Array} slots one deck's `decksView` slots
 * @returns {{slot:object, index:number, u0:number, u1:number, rect:object}[]}
 */
export function slotSpans(slots) {
  const list = Array.isArray(slots) ? slots : [];
  const usable = list.map((s) => {
    const r = s && s.rect;
    return (r && r.w > 0 && r.h > 0) ? r.w : 0;
  });
  const total = usable.reduce((a, b) => a + b, 0);
  const out = [];
  if (!(total > 0)) return out;
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    if (!usable[i]) continue;
    const u0 = acc / total;
    acc += usable[i];
    out.push({ slot: list[i], index: i, u0, u1: acc / total, rect: list[i].rect });
  }
  return out;
}

/** True when tile (tx,ty) lies inside the slot's tile rect. */
function coversTile(rect, tx, ty) {
  return !!rect && rect.w > 0 && rect.h > 0
    && tx >= rect.x && tx < rect.x + rect.w && ty >= rect.y && ty < rect.y + rect.h;
}

/** The tile bounding box of a deck's slots, UNIONED WITH THE FRAME so the walkway covers the whole
 *  deck rather than only the part the compartments happen to reach. (VR-P4's `tileExtent`, kept for
 *  the same measured reason: a spine tile beyond the last compartment's rect otherwise
 *  EXTRAPOLATES past the strip instead of landing in it.) */
function tileExtent(slots, frame) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of (slots || [])) {
    const r = s && s.rect;
    if (!r) continue;
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (frame && frame.w > 0 && frame.h > 0) {
    minX = Math.min(isFinite(minX) ? minX : 0, 0);
    minY = Math.min(isFinite(minY) ? minY : 0, 0);
    maxX = Math.max(isFinite(maxX) ? maxX : 0, frame.w);
    maxY = Math.max(isFinite(maxY) ? maxY : 0, frame.h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * ⭐⭐ THE SHIP TRANSFORM — the ONE projection the whole plate draws through and the ONE the click
 * map inverts. Build it once per repaint and hand it to everything.
 *
 * @param {Array} decksView `decksView(decks, rooms)` output — `[{deck, slots:[…]}]`, EVERY deck.
 * @param {{w:number,h:number}|null} frame any deck's frame; only its `w`/`h` are read, and they are
 *   the same for every deck (one `World`), so the walkway's extent does not depend on which deck the
 *   host happens to be projecting.
 * @returns {object} see the members below.
 */
export function makeShipTransform(decksView, frame) {
  const views = Array.isArray(decksView) ? decksView : [];
  const lay = bandLayout(views.map((d) => d.deck));
  const decks = new Map();
  for (const band of lay.bands) {
    const view = views.find((d) => (d.deck | 0) === band.deck) || { deck: band.deck, slots: [] };
    const slots = view.slots || [];
    decks.set(band.deck, {
      band,
      plane: deckPlane(band),
      slots,
      spans: slotSpans(slots),
      ext: tileExtent(slots, frame),
    });
  }

  /** The `(u,v)` a tile occupies on its deck's band, or null when the deck is not drawn. */
  function tileUV(tx, ty, deck) {
    const d = decks.get(deck | 0);
    if (!d) return null;
    const fx = Math.floor(tx), fy = Math.floor(ty);
    for (const sp of d.spans) {
      if (!coversTile(sp.rect, fx, fy)) continue;
      const su = (tx - sp.rect.x) / sp.rect.w;
      const sv = (ty - sp.rect.y) / sp.rect.h;
      return [sp.u0 + su * (sp.u1 - sp.u0), V_SPINE + sv * (1 - V_SPINE)];
    }
    // THE WALKWAY. `u` is the tile's honest position along the deck's x extent; `v` is its position
    // across the beam, compressed into the strip. Linear in both ⇒ the round trip is exact here too.
    const spanX = Math.max(1e-6, d.ext.maxX - d.ext.minX);
    const spanY = Math.max(1e-6, d.ext.maxY - d.ext.minY);
    return [(tx - d.ext.minX) / spanX, ((ty - d.ext.minY) / spanY) * V_SPINE];
  }

  function project(tx, ty, deck) {
    const d = decks.get(deck | 0);
    if (!d) return [NaN, NaN];
    const uv = tileUV(tx, ty, deck);
    return floorPoint(d.plane, uv[0], uv[1]);
  }

  /**
   * ⭐⭐ IS THIS POINT ON A DRAWN DECK AT ALL? — the guard that keeps the paper margin un-orderable.
   *
   * ⛔ IT IS NOT DEFENSIVE PROGRAMMING; ITS ABSENCE IS A LIVE DEFECT, and this package briefly
   * shipped it. `invert` CLAMPS `(u,v)` to the floor on purpose — a press in a compartment's back
   * wall or its ceiling cut must still address a tile in that compartment, which is the affordance
   * VR-P4's review established. But a clamp that makes every point inside a band addressable also
   * makes every point OUTSIDE one addressable, because `deckAt` takes the nearest band: with the
   * clamp alone, a press on the empty paper beside the hull resolved to tile (44,10) on deck 0 and an
   * armed DIG would have designated it. `overview-model.test.js`'s *"a click outside the drawn plate
   * designates NOTHING"* is the assertion that caught it.
   *
   * THE CONTAINER IS THE BAND'S OWN BOX, and it is the right one rather than a convenient one: the
   * whole of a band's drawing — floor, walkway, back wall, partition tops — lies inside
   * `[band.y + m, band.y + h - m]` by construction (the margin is `10 × s`, the design's own), so the
   * box contains every pixel the band paints and nothing else.
   *
   * ⚠️ `invert` STAYS TOTAL. It is the round trip's inverse and must answer for every input; the
   * bound is reported separately so `tileAt` can refuse and the identity leg cannot.
   */
  function hits(sx, sy) {
    for (const [, d] of decks) {
      if (sx >= BAY.x && sx <= BAY.x + BAY.w
        && sy >= d.band.y && sy <= d.band.y + d.band.h) return true;
    }
    return false;
  }

  /** Which band a plate point falls in — the ONE piecewise step, and it is over DECKS (two on the
   *  wreck), not over compartments. A point above the top band or below the bottom one takes the
   *  nearest, so `invert` is total. */
  function deckAt(sy) {
    let best = null, bestD = Infinity;
    for (const [deck, d] of decks) {
      const top = d.band.y, bot = d.band.y + d.band.h;
      const dist = sy < top ? top - sy : sy > bot ? sy - bot : 0;
      if (dist < bestD) { bestD = dist; best = deck; }
      if (dist === 0) break;
    }
    return best == null ? 0 : best;
  }

  /**
   * A plate point → the fractional TILE it addresses, and the DECK it is on.
   *
   * ⭐ THE `(u,v)` CLAMP IS THE AFFORDANCE, not a rounding detail (VR-P4's finding, kept verbatim in
   * spirit): a band's BOX is bigger than the floor PARALLELOGRAM drawn on it — the back wall, the
   * ceiling cut and the margin are all band and none of them are floor — so a press up in the back
   * wall solves to `v > 1` and would address a tile the compartment does not contain. Clamping to
   * the floor means EVERY PIXEL OF A BAND ADDRESSES A TILE ON THAT DECK, including the upper body of
   * a fitting that stands up off its own floor point.
   * ⚠️ It does not weaken the identity: `project` only ever emits `u, v ∈ [0,1]`, so the clamp is
   * inert on the round trip and bites only on points that are not on a floor at all.
   *
   * @returns {[number, number, number]} `[tx, ty, deck]`
   */
  function invert(sx, sy) {
    const deck = deckAt(sy);
    const d = decks.get(deck);
    if (!d) return [0, 0, deck];
    const [u0, v0] = floorSolve(d.plane, sx, sy);
    const u = Math.min(1, Math.max(0, u0));
    const v = Math.min(1, Math.max(0, v0));
    const EPS = 1e-9;
    // ⛔ THE REGION BOUNDARY IS BIASED TOWARDS THE COMPARTMENT, AND IT IS A MEASURED FIX RATHER THAN
    // a defensive epsilon. A compartment tile on its rect's FRONT edge projects to exactly
    // `v = V_SPINE`; the floating-point round trip lands it at `0.29999999999999993` about as often
    // as at `0.3`, and on the low side this test sent it to the WALKWAY branch, which re-mapped it
    // over the deck's whole `ty` extent — tile (0,0) came back as (0, 18). The bias is safe in the
    // other direction: no real walkway tile can reach `V_SPINE` — the topmost one maps to
    // `((maxY-1-minY)/spanY)·V_SPINE`, strictly below it.
    //
    // ⛔⛔ AND WHICH INSTRUMENT ACTUALLY SEES IT HAS BEEN RE-MEASURED, because the claim that used to
    // stand here — *"the full-census round trip is what caught it (32 of 6480 tiles)"* — is wrong in
    // BOTH numbers and, worse, names an instrument that is now blind to it. The census is
    // **1620 tiles**, not 6480 (`2 decks × 45 × 18`; `ship-elevation.test.js` asserts
    // `checked === 2 * FRAME.w * FRAME.h`). And with this `- EPS` deleted the census still reads
    // **0 of 1620** — driven, not argued — because it projects tile CENTRES (`tx + 0.5`) and a centre
    // never lands on `v = V_SPINE`; only a tile's front-edge CORNER does.
    //
    // ⇒ THE ONE INSTRUMENT IS `THE REGION BOUNDARY: a compartment's FRONT EDGE tile stays in its
    // compartment`, which projects `(tx, rect.y)` and goes red the moment the bias is removed
    // (measured both ways). This is TRAPS' 9th shape in miniature — the census was made exhaustive
    // over centres, which is the right census, and in becoming it, it stopped being able to see the
    // defect it is credited with catching. Do not let a later lane read "the census is green" as
    // "the region boundary is covered".
    if (v >= V_SPINE - EPS && d.spans.length) {
      const sv = (v - V_SPINE) / (1 - V_SPINE);
      // The compartment whose u-interval contains u. The last span owns u = 1 exactly.
      let sp = d.spans[d.spans.length - 1];
      for (const cand of d.spans) if (u < cand.u1) { sp = cand; break; }
      const su = (sp.u1 > sp.u0) ? Math.min(1, Math.max(0, (u - sp.u0) / (sp.u1 - sp.u0))) : 0;
      return [
        Math.min(sp.rect.x + sp.rect.w - EPS, sp.rect.x + su * sp.rect.w),
        Math.min(sp.rect.y + sp.rect.h - EPS, sp.rect.y + sv * sp.rect.h),
        deck,
      ];
    }
    const spanX = Math.max(1e-6, d.ext.maxX - d.ext.minX);
    const spanY = Math.max(1e-6, d.ext.maxY - d.ext.minY);
    return [d.ext.minX + u * spanX, d.ext.minY + (v / V_SPINE) * spanY, deck];
  }

  /**
   * How big one tile draws, in plate px — the number every piece of art on the plate is scaled by.
   *
   * ⛔ IT IS THE **ACROSS** SPAN, NOT `min(across, depth)`, AND THE DIFFERENCE IS 4×. On an oblique
   * floor the two axes are deliberately unequal: a wreck compartment is 12 tiles across ~113 px
   * (9.4 px a tile) and 8 tiles deep through ~18 px of DEPTH RISE (2.3 px a tile), because depth is
   * COMPRESSED — that is what makes the drawing read as a cutaway rather than a plan. Taking the
   * minimum sizes every fitting by the compressed axis, and the first cut of this package did:
   * every piece clamped to the 9 px floor and the compartments photographed as empty rooms, which
   * is the one thing the redesign exists to prevent. The design's own rooms draw a fitting at ~20 px
   * in a 126 px room, i.e. ~2 tiles across — which is what `across` × the caller's factor gives.
   */
  let tileSize = Infinity;
  for (const [, d] of decks) {
    for (const sp of d.spans) {
      tileSize = Math.min(tileSize, (sp.u1 - sp.u0) * d.plane.across / sp.rect.w);
    }
  }
  if (!isFinite(tileSize) || tileSize <= 0) tileSize = 4;
  tileSize = Math.max(2.5, tileSize);

  return {
    lay, decks, tileSize,
    /** The deck indices this transform draws, top band first. */
    deckOrder: lay.bands.map((b) => b.deck),
    project, invert, deckAt, tileUV, hits,
    /** One deck's record (band + plane + spans), or null. */
    deckInfo: (deck) => decks.get(deck | 0) || null,
    /**
     * The pixel box of a TILE-SPACE rect on a deck. ⚠️ ON AN OBLIQUE FLOOR A TILE IS A
     * PARALLELOGRAM, not an axis rect, so this returns the BOUNDING BOX of the four projected
     * corners — its callers (`markCellSvg`, the build ghosts) draw inside a box by contract, and a
     * box that contains the real parallelogram keeps the mark on its own tile.
     */
    rect(r, deck) {
      const pts = [project(r.x, r.y, deck), project(r.x + r.w, r.y, deck),
        project(r.x + r.w, r.y + r.h, deck), project(r.x, r.y + r.h, deck)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    },
    /**
     * A compartment's own drawn REGION as a plate-space box — what the lens wash lays over and what
     * a selection border traces. Derived from the SAME spans the drawing uses, so a wash can never
     * land beside the compartment it is grading.
     */
    cellOf(slot, deck) {
      if (!slot) return null;
      for (const [dk, d] of decks) {
        if (deck != null && (deck | 0) !== dk) continue;
        const sp = d.spans.find((c) => c.slot === slot)
          || d.spans.find((c) => c.slot && c.slot.anchorName === slot.anchorName);
        if (!sp) continue;
        return spanBox(d, sp);
      }
      return null;
    },
  };
}

/**
 * The plate-space bounding box of one compartment's drawn volume — its floor parallelogram plus the
 * wall standing on it. SHARED by the composer (the compartment group's hit rect and its selection
 * border) and by the lens wash, so the three cannot disagree about where a compartment is.
 */
export function spanBox(deckInfo, span) {
  const p = deckInfo.plane;
  const c = [
    floorPoint(p, span.u0, V_SPINE), floorPoint(p, span.u1, V_SPINE),
    floorPoint(p, span.u1, 1), floorPoint(p, span.u0, 1),
  ];
  const xs = c.map((q) => q[0]);
  const ys = c.map((q) => q[1]).concat(c.map((q) => q[1] - p.wall));
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export { INK, PAPER, PAPER_FLAT, ATTEND, FONT, poly, n };
