// THE LEVEL-1 SHIP PLATE — the paper-and-ink drawing of the whole ship. A PURE, DOM-free composer
// that turns one captured wire snapshot (frame + decks/rooms view + roster + designs + marks +
// device wear) into a single self-contained SVG string: the hull capsule, the COMPARTMENT GRID of
// live miniature room interiors, the debris/designation marks, the build ghosts, the MOSS terminal
// chips and the ink crew figures. No DOM, no clock, no randomness beyond the seeded starfield —
// same `state` yields a byte-identical string.
//
// Authority: `design-import/Perilune Game.dc.html` Screen 01 (THE SHIP) + the visual-redesign
// charter (`docs/design/perilune-visual-redesign.charter.md` §1 the dialect, §2 rulings E3/E4/E6,
// §3 package P4). THE .dc.html MARKUP IS THE SPEC: every literal below was measured off it and the
// element it came from is named inline, so the next reader re-measures instead of trusting a comment.
//
// ⚠️ WHAT REPLACED WHAT (the warm layer is gone from this file, and the replacements are not
// cosmetic renames):
//   · the void/nebula/cream-star backdrop  → PAPER. `starLayerSvg` still emits the persistent
//     drifting field, but in INK DOTS ON PAPER at three parallax depths (the design's `starsInk`).
//   · the navy hull silhouette + engine glow + nacelles → ONE CLOSED CAPSULE PATH, ink on paper,
//     with the raked bow hatch, the bow cone + ribs and three dashed exhaust plumes.
//   · the projected deck floor-plan (tile rects washed with material colours) → THE COMPARTMENT
//     GRID: one tile per compartment, each tile a LIVE MINIATURE of the Level-2 room cutaway with
//     the compartment's real fittings standing in it.
//   · amber glow pools (a room with an authored PURPOSE) → the tile's own SHELL TREATMENT: a
//     purposed compartment is drawn in solid ink, an unpurposed one in the dash dialect's UNBUILT
//     stroke (`#14120F` "6 5"). Same predicate (`roomType`), same set, one accent fewer. The tile
//     carries `data-purpose` so a test can read the predicate off the emitted string.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COORDINATE CONTRACT — AND IT IS PIECEWISE NOW, WHICH IS THE ONE THING TO READ BEFORE EDITING
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The warm scene mapped sim TILE space onto the hull's deck-floor envelope with ONE affine
// transform, because it drew a floor plan: tile (tx,ty) was at a fixed place on the deck. The plate
// draws a GRID OF COMPARTMENTS instead — cell 3 is compartment 3 wherever compartment 3 physically
// is — so a single affine map can no longer be both truthful about the drawing and invertible for a
// click. `makeTransform(slots, frame)` is therefore PIECEWISE:
//
//     project(tx,ty) → the slot whose rect contains (tx,ty) → that slot's GRID CELL, THROUGH THE
//                      MINIATURE'S OWN OBLIQUE FLOOR PLANE (`floorToMini` + `miniToScene`)
//     invert(sx,sy)  → the grid cell containing (sx,sy)      → the same two maps, inverted
//     …and a tile inside NO slot → the CORRIDOR STRIP (`corridorBand`), linearly, both ways.
//
// ⛔ THE OBLIQUE HALF IS NOT DECORATION — IT IS THE FIX FOR A MEASURED DEFECT. See the block above
// `floorToMini`: while the drawing used the oblique and the click map used an axis-aligned box, 57
// of 59 drawn fittings on the wreck's deck 0 clicked a different tile than the one they were drawn
// on. One projection, two directions, is the whole of the correction.
//
// The two are exact inverses FOR EVERY TILE ON THE DECK, which is the property `tileAt` (and
// therefore the order verbs' click→tile path, BUG-B's `getScreenCTM().inverse()` route) needs.
//
// ⚠️ **THE PARAGRAPH THAT STOOD HERE WAS FACTUALLY WRONG AND IS REPLACED, NOT EDITED.** It claimed
// *"a tile inside no compartment has no place on the plate … `invert` never returns it"*. Review
// measured the opposite on the running wreck: 672 sampled points in the gaps between cells DID
// invert to out-of-slot tiles, and the corridor tile round-tripped exactly — the fallback map was
// live, unowned and undrawn. And the half that was true was worse than the half that was wrong:
// **83 deck-0 floor tiles, two ground items and the HATCH LADDER at (22,8) — the visible
// deck-to-deck route — were on no surface at Level 1 at all.**
//
// So the deck's SPINE is now a drawn thing: `corridorBand` reserves the grid's own ROW GAP, every
// no-slot tile projects into that strip through the same transform, `corridorLayer` draws the
// corridor's items and the ladder in it, and the round trip there is exact. There is no tile on the
// deck the plate cannot address.
//
// ⛔ WHAT REMAINS A LIMIT, STATED HONESTLY: the strip is ~23 design px tall for a corridor that may
// be a dozen tiles deep, so two corridor tiles a row apart are a fraction of a pixel apart on
// screen. The mapping is exact; the RESOLUTION is coarse, and a player who wants to designate one
// particular spine tile should be in the Room Zoom. `overview-scene.test.js` pins the round trip in
// both regions, and pins that a corridor tile really lands in the strip.

import { buildItem } from '../items/index.js';
// THE WEAR JOIN — the ONLY door from a surface to the 70 post-raid twins. The threshold and its
// justification live in `client/src/items/wear.js`, once, for both surfaces: a second copy of
// "below what condition does a tile wear its twin?" is how the two SVG views would come to disagree
// about the same machine, each agreeing with itself and every test green.
import { buildTileItem } from '../items/wear.js';
import { pawnSprite } from '../render/pawn-svg.js';
// The ONE glyph → itemId derivation, straight out of the `ITEMS` registry and SHARED verbatim with
// the Level-2 Room Zoom (`room-model.js` itemForGlyph), so the two SVG surfaces cannot come to skin
// the same glyph differently.
import { itemIdForGlyphChar } from '../items/glyph-map.js';
// The work-tag classifier (console-model.js is misnamed, not console-only — see the retirement plan
// §1: `taskTag` is a PURE roster-label → tag mapping and is the SAME source the console's on-map
// WORK markers used, so the two surfaces cannot disagree about who is working).
import { taskTag } from './console-model.js';
// The debris/designation mark vocabulary. SHARED verbatim with the Level-2 Room Zoom so one mark
// kind cannot come to mean two different things on the two surfaces.
import { markVariant, markCellSvg } from './mark-overlay.js';
// The glyph codes that are NOT an item on a tile, OWNED by room-model.js and imported rather than
// re-declared — see the NON_FURNITURE note below for the bug the second copy hid.
import { NON_FURNITURE_CODES } from './room-model.js';
// THE OBLIQUE KIT (charter §1). The miniature interiors are built on it DIRECTLY — `roomFrame` for
// the projection, `boxFaces`/`poly` for geometry — rather than through `oblique.room()`, because a
// tile is drawn at ~1/7 scale and every stroke in it must carry `vector-effect="non-scaling-stroke"`
// (the design's own tiles do, on every path). `room()` emits no such attribute and it is shared
// with P3, so the weights and the vector-effect are applied here instead of widening the kit.
import { roomFrame, poly, INK, PAPER, PAPER_FLAT, ATTEND, FONT } from '../render/oblique.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The plate's design space.
//
// MEASURED off Screen 01: the hull sits in a 1028 × 320 box (`Perilune Game.dc.html:52`), and the
// compartment grid is absolutely positioned inside it at `left:236px top:100px width:616px`, four
// columns, `grid-template-rows: repeat(2, 56px)`, `column-gap:10px row-gap:18px` (`:63`). This module
// scales that box UNIFORMLY to 1300 wide (K = 1300/1028 = 1.2646), which is why every constant below
// is a design number times K and the hull path is emitted verbatim under one transform.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const VIEW_W = 1300;
/** 320 × K, rounded — the hull box's own aspect, kept so the capsule is never stretched. */
export const VIEW_H = 405;

/** The scale from the design document's hull box to this module's design space. */
const K = 1.2646;
/** The hull svg's own viewBox is 1028 × 300 inside a 320-tall box (`preserveAspectRatio="none"`), so
 *  its y scale is 320/300 × K. Emitted as ONE transform over the design's verbatim path data. */
const HULL_TRANSFORM = `scale(${n(K)} ${n(K * 320 / 300)})`;

/**
 * THE GRID BOX — where every compartment tile is laid out, in design px. `x`/`y`/`w` are the
 * design's own 236/100/616 × K; `h` is two 56px rows plus one 18px gap × K, i.e. the box the design
 * draws four-by-two into. A census with more rows keeps the SAME box and shrinks its rows (see
 * `gridLayout`), so the hull never has tiles hanging out of it.
 */
export const DECK = Object.freeze({ x: 298.4, y: 126.5, w: 779, h: 164.4 });

/** Gaps, × K. */
const COL_GAP = 12.6;
const ROW_GAP = 22.8;

/**
 * ⭐ RULING E6 — THE GRID IS DERIVED FROM THE ROOM CENSUS, never from the design's four-by-two.
 *
 * The design draws ONE authored ship and the charter files that it "does not generalise as drawn":
 * the wreck has three decks with different compartment counts, and `--ship grid` has eight per deck
 * on eight decks. So the rule is
 *
 *     cols = clamp(ceil(n / 2), 1, GRID_MAX_COLS)      rows = ceil(n / cols)
 *
 * which reproduces the design exactly at n = 8 (4 × 2 — the shipped shape on BOTH ships) and stays
 * legible as n grows: the cap is what stops a 20-room deck drawing 10 unreadable slivers, and the
 * extra rows are absorbed by shrinking the row height inside the FIXED box rather than by growing
 * the hull. `cells` is `cols * rows`, so a census that does not fill its last row leaves EMPTY
 * CELLS — drawn in the dash dialect's UNBUILT stroke, which is the design's own third tile.
 *
 * ⛔ THE ROW HEIGHT HAS A POSITIVE FLOOR, AND IT WAS ADDED BECAUSE THE ARITHMETIC WENT NEGATIVE.
 * Review measured it: with the box height fixed and the gaps constant, `tileH` crosses zero at
 * rows ≥ 9 (n ≥ 49) and goes NEGATIVE — which draws inverted rects, inverts the click map inside
 * them, and is trivially "inside the box" for any containment check. `MIN_TILE` clamps both axes;
 * when the clamp binds the grid is TALLER than `DECK.h` and says so through `overflows`, so a
 * caller (and the test) can see the degradation rather than infer it from a shape.
 *
 * ⚠️ AND THE HONEST NOTE ABOUT WHAT THE SHIPPED GAME ACTUALLY DOES: every authored ship in this repo
 * lays **8 compartments per deck** (`--ship wreck` and `--ship grid` alike — measured on the wire in
 * `overview-plate-shot.mjs`'s own instrument check, which dies if deck 0 is not 8). So the shape the
 * player sees is always the design's own 4 × 2. The degradation above 12 compartments a deck is
 * REAL and is stated rather than hidden: 3 rows draw 39.6 design-px miniatures (n 13–18), 4 rows 24
 * (n 19–24), and from FIVE rows up (n ≥ 25) the floor binds, the grid grows taller than its box and
 * `overflows` says so. Below `MIN_TILE.h` a miniature would be a silhouette rather than a drawing. That is a legibility limit of the
 * plate at Level 1, not a lost compartment — every one of them still draws, still carries its
 * `data-anchor`, still clicks into the Room Zoom, and is still named in the `compartments` column.
 *
 * PURE, and exported so the view (deck caption) and the tests read the same derivation the drawing
 * does — a second copy of this arithmetic is how the caption and the grid would come to disagree
 * about how many compartments a deck has.
 * @param {number} n how many compartments this deck has
 * @returns {{cols:number, rows:number, cells:number, tileW:number, tileH:number, overflows:boolean}}
 */
export function gridLayout(n) {
  const count = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const cols = Math.max(1, Math.min(GRID_MAX_COLS, Math.ceil(count / 2) || 1));
  const rows = Math.max(1, Math.ceil(count / cols) || 1);
  const fitW = (DECK.w - (cols - 1) * COL_GAP) / cols;
  const fitH = (DECK.h - (rows - 1) * ROW_GAP) / rows;
  const tileW = Math.max(MIN_TILE.w, fitW);
  const tileH = Math.max(MIN_TILE.h, fitH);
  return { cols, rows, cells: cols * rows, tileW, tileH, overflows: tileH > fitH || tileW > fitW };
}

/** The column cap. Six 118-px tiles is the narrowest a miniature interior still reads at (measured
 *  against the design's own 154-px tile: below ~110 px the fittings collapse into their strokes). */
export const GRID_MAX_COLS = 6;

/** The smallest tile the grid will draw. Below this a miniature is a silhouette, not a drawing —
 *  and, more importantly, the unclamped arithmetic goes NEGATIVE past rows 8 (see `gridLayout`). */
export const MIN_TILE = Object.freeze({ w: 40, h: 18 });

/** The design-px rect of grid cell `i` (row-major, left→right then top→bottom). PURE. */
function cellRect(i, lay) {
  const c = i % lay.cols, r = Math.floor(i / lay.cols);
  return {
    x: DECK.x + c * (lay.tileW + COL_GAP),
    y: DECK.y + r * (lay.tileH + ROW_GAP),
    w: lay.tileW, h: lay.tileH,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The miniature's own space — one tile's inner viewBox.
//
// MEASURED: every tile in Screen 01 is `viewBox="-10 -10 992 428" preserveAspectRatio="xMidYMid
// meet"` and its floor quad reads `M0 408 L860 408 L972 240 L112 240 Z`. That is EXACTLY
// `roomFrame(8.6, 2.8, 2.4, 1.0, {x:0, y:408})` — an 8.6 m × 2.8 m × 2.4 m room at the plate scale
// (PX_PER_CM.plate = 1.00), depth 280 cm displacing (+112, −168). Verified corner for corner:
//   back  M112 240 L972 240 L972 0 L112 0     left  M0 408 L112 240 L112 0 L0 168
// so the plate miniature and the Level-2 cutaway are the SAME drawing at two scales, which is the
// whole point of the shared oblique.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const MINI_VIEWBOX = '-10 -10 992 428';
const MINI = Object.freeze({ wM: 8.6, dM: 2.8, hM: 2.4, s: 1.0, x: 0, y: 408 });
/** cm across / cm back — the room the miniature draws, used to place fittings inside it. */
const MINI_W_CM = MINI.wM * 100;
const MINI_D_CM = MINI.dM * 100;
/** The box one fitting is normalised into, in miniature px. */
const MINI_ITEM = 128;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE ONE FLOOR PROJECTION — THE FIX FOR THE TWO-COORDINATE-SYSTEMS DEFECT.
//
// ⛔ WHAT WAS WRONG, MEASURED IN THE RUNNING GAME BY REVIEW. Inside a compartment tile the DRAWING
// and the CLICK MAP were two different mappings: fittings were placed through the oblique frame
// (`roomFrame(...).project`) while `makeTransform` mapped a tile linearly onto the axis-aligned CELL
// box. On `--ship wreck` deck 0 that made **57 of 59 drawn fittings click a DIFFERENT tile** (dy up
// to +7 tiles) and **49 of them had not one pixel of their own ink that clicked their own tile**;
// the crew figure drew standing inside the back wall while the pods beside her were oblique; and the
// debris band ran as an axis-aligned row across an oblique floor. Every one of those is the same
// bug: a surface that shows you one thing and orders another.
//
// THE FIX IS THAT THERE IS NOW ONE MAPPING AND IT IS DERIVED FROM THE KIT, NOT RE-TYPED. The room's
// FLOOR PLANE is an affine map of `(u, v)` — fraction across, fraction back — and its two basis
// vectors are read straight out of `MINI_FRAME.project`, so if the oblique's ratios ever move, the
// drawing and the click map move together by construction. The inverse is the plain 2×2 solve of
// the same basis, which is the closed form the Room Zoom uses for its own floor plane (P3's
// `room-model.js`; the MATH is replicated here rather than the file imported, because that module is
// another package's and importing it would couple the two surfaces' layouts).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The nested tile `<svg>`'s viewBox, as numbers (the design's own `-10 -10 992 428`). */
export const MINI_BOX = Object.freeze({ x: -10, y: -10, w: 992, h: 428 });

/** The miniature's projection frame — one per tile, but identical, so it is built once. */
const MINI_FRAME = roomFrame(MINI.wM, MINI.dM, MINI.hM, MINI.s, { x: MINI.x, y: MINI.y });

/** The floor plane's origin and its two basis vectors, in MINI viewBox px. READ OFF THE KIT. */
const F_O = MINI_FRAME.project(0, 0, 0);
const F_U = MINI_FRAME.project(MINI_W_CM, 0, 0);
const F_V = MINI_FRAME.project(0, MINI_D_CM, 0);
const BU = [F_U[0] - F_O[0], F_U[1] - F_O[1]];   // across  → (+860,    0) at s = 1
const BV = [F_V[0] - F_O[0], F_V[1] - F_O[1]];   // back    → (+112, −168) at s = 1
const B_DET = BU[0] * BV[1] - BU[1] * BV[0];

/**
 * `(u, v)` — fraction across the room, fraction back into it — → MINI viewBox px on the FLOOR.
 * THE ONLY PLACE ANYTHING IN A COMPARTMENT TILE IS POSITIONED: fittings, marks, ghosts, terminal
 * chips, crew figures, and the inverse the click map runs. PURE.
 */
export function floorToMini(u, v) {
  // ⛔ NOT ROUNDED. `n()` is for the STRING emitters; rounding here costs the round trip its
  // exactness — measured: 2 dp in mini units divided back through a ~0.18 `meet` factor is ~1.4e-4
  // of a tile, which fails the identity leg and, worse, would put a click one tile out near a tile
  // boundary. The emitters round their own output (`miniContents`' translate, `markCellSvg`'s box).
  return [F_O[0] + u * BU[0] + v * BV[0], F_O[1] + u * BU[1] + v * BV[1]];
}

/** The exact inverse of `floorToMini` — the 2×2 solve of the same basis. PURE. */
export function miniToFloor(mx, my) {
  const px = mx - F_O[0], py = my - F_O[1];
  if (!B_DET) return [0, 0];
  return [(px * BV[1] - py * BV[0]) / B_DET, (BU[0] * py - BU[1] * px) / B_DET];
}

/**
 * The `xMidYMid meet` fit of the mini viewBox inside one plate-space CELL — i.e. exactly what the
 * browser does with the nested `<svg x y width height viewBox preserveAspectRatio>` the tile emits.
 * Anything drawn at PLATE level that must line up with a tile's interior goes through this.
 */
export function miniFit(cell) {
  const k = Math.min(cell.w / MINI_BOX.w, cell.h / MINI_BOX.h);
  return {
    k,
    ox: cell.x + (cell.w - MINI_BOX.w * k) / 2 - MINI_BOX.x * k,
    oy: cell.y + (cell.h - MINI_BOX.h * k) / 2 - MINI_BOX.y * k,
  };
}

/** MINI viewBox px → plate design px, for a given cell. PURE. */
export function miniToScene(cell, mx, my) {
  const f = miniFit(cell);
  return [f.ox + mx * f.k, f.oy + my * f.k];
}

/** Plate design px → MINI viewBox px, for a given cell. The exact inverse. PURE. */
export function sceneToMini(cell, sx, sy) {
  const f = miniFit(cell);
  return [(sx - f.ox) / f.k, (sy - f.oy) / f.k];
}

/** Stroke weights inside a tile, measured off the design's tiles (1.1 shell / 0.7 detail). */
const MINI_WEIGHT = Object.freeze({ shell: 1.1, detail: 0.7, cutDash: '5 4', unbuiltDash: '6 5' });

// Glyph code points handled by the floor/wall/structure layers or otherwise not an item on a tile.
// ⚠️ IT IS NOT A HAND MIRROR — it is IMPORTED from `room-model.js`, which owns the list, so the two
// surfaces cannot come to disagree about what "not furniture" means. That mattered the day `'&'`
// (38, CORPSE) was removed from it: while it sat in BOTH sets it reached NEITHER furniture layer.
const NON_FURNITURE = new Set(NON_FURNITURE_CODES); // . # space % @ /

// ── tiny deterministic string helpers (no locale APIs, InvariantCulture-safe) ──
function n(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** VS-O-08 seeded RNG: frac(sin(s)*10000). Pure, machine-independent. */
function rnd(s) { const v = Math.sin(s) * 10000; return v - Math.floor(v); }

/** Last whitespace token, uppercased (the console's `surnameOf`). */
function surnameOf(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts[parts.length - 1] || '').toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The transform (the coordinate contract, above).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tile bounding box of a deck's slots; falls back to a frame's w/h, else a unit box. */
function tileExtent(slots, frame) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of (slots || [])) {
    const r = s.rect || s;
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (!isFinite(minX)) {
    if (frame && frame.w && frame.h) return { minX: 0, minY: 0, maxX: frame.w, maxY: frame.h };
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  // ⭐ UNIONED WITH THE FRAME, and that is what makes the CORRIDOR STRIP cover the whole deck. The
  // extent used to be the slots' bounding box alone, which is fine for the cells (they carry their
  // own rects) and wrong for the band: a spine tile beyond the last compartment's rect then
  // EXTRAPOLATED past the strip instead of landing in it. Measured on a synthetic one-room deck —
  // the ladder projected 10 px below the band and 480 px past its right edge.
  if (frame && frame.w > 0 && frame.h > 0) {
    minX = Math.min(minX, 0); minY = Math.min(minY, 0);
    maxX = Math.max(maxX, frame.w); maxY = Math.max(maxY, frame.h);
  }
  return { minX, minY, maxX, maxY };
}

/** True when tile (tx,ty) lies inside the slot's tile rect. */
function coversTile(rect, tx, ty) {
  return !!rect && rect.w > 0 && rect.h > 0
    && tx >= rect.x && tx < rect.x + rect.w && ty >= rect.y && ty < rect.y + rect.h;
}

/**
 * Build the shared TILE→PLATE transform for a deck. PIECEWISE — see the module header.
 *
 * `project(tx,ty)` → `[sx,sy]`; `rect({x,y,w,h})` → the projected pixel rect (scaled by the slot the
 * rect's origin falls in); `invert(sx,sy)` → the fractional tile the pixel fell in; `cellOf(slot)` →
 * that slot's grid cell; `tileSize` = the smallest px-per-tile any cell draws at, for art sizing.
 *
 * Exposed so the view can invert it for clicks (BUG-B's `getScreenCTM()` route) and can lay the lens
 * wash over the SAME cells the drawing uses.
 */
export function makeTransform(slots, frame) {
  const list = Array.isArray(slots) ? slots : [];
  const lay = gridLayout(list.length);
  const ext = tileExtent(list, frame);
  const spanX = Math.max(1e-6, ext.maxX - ext.minX);
  const spanY = Math.max(1e-6, ext.maxY - ext.minY);
  // The fallback map — the whole tile extent onto the whole grid box. It exists so a tile inside no
  // compartment still HAS a place rather than throwing or landing at NaN; `invert` never produces
  // such a tile (the known limit in the header).
  const FKX = DECK.w / spanX, FKY = DECK.h / spanY;

  const cells = list.map((s, i) => ({ slot: s, rect: s && s.rect, cell: cellRect(i, lay), index: i }));

  // THE CORRIDOR BAND — where every tile that is inside NO compartment is drawn and clicked.
  const band = corridorBand(lay);

  // Art sizing: the smallest a single tile draws at, ON THE FLOOR PLANE, in plate px. One tile is
  // `BU/rect.w` across and `BV/rect.h` back in mini units, scaled by the cell's own `meet` factor.
  let tileSize = Infinity;
  for (const c of cells) {
    if (!c.rect || !(c.rect.w > 0) || !(c.rect.h > 0)) continue;
    const k = miniFit(c.cell).k;
    tileSize = Math.min(tileSize, (BU[0] / c.rect.w) * k, (-BV[1] / c.rect.h) * k);
  }
  if (!isFinite(tileSize) || tileSize <= 0) tileSize = Math.min(FKX, FKY);
  tileSize = Math.max(3, tileSize);

  const findByTile = (tx, ty) => cells.find((c) => coversTile(c.rect, tx, ty)) || null;
  const findByPoint = (sx, sy) => cells.find((c) => c.rect && sx >= c.cell.x && sx <= c.cell.x + c.cell.w
    && sy >= c.cell.y && sy <= c.cell.y + c.cell.h) || null;

  /** A no-slot tile → the corridor strip, linearly. Injective over the deck's tile extent, so the
   *  round trip below is exact for a corridor tile too. */
  const bandProject = (tx, ty) => [
    DECK.x + ((tx - ext.minX) / spanX) * DECK.w,
    band.y + ((ty - ext.minY) / spanY) * band.h,
  ];
  const bandInvert = (sx, sy) => [
    ext.minX + ((sx - DECK.x) / DECK.w) * spanX,
    ext.minY + ((sy - band.y) / band.h) * spanY,
  ];

  const project = (tx, ty) => {
    const c = findByTile(Math.floor(tx), Math.floor(ty));
    if (!c) return bandProject(tx, ty);
    const u = (tx - c.rect.x) / c.rect.w;
    const v = (ty - c.rect.y) / c.rect.h;
    const [mx, my] = floorToMini(u, v);
    return miniToScene(c.cell, mx, my);
  };

  return {
    ext, lay, cells, tileSize, band,
    KX: FKX, KY: FKY,
    project,
    /** The grid cell a slot occupies, by identity first and slotIndex second. */
    cellOf(slot) {
      if (!slot) return null;
      const hit = cells.find((c) => c.slot === slot)
        || cells.find((c) => c.slot && c.slot.slotIndex === slot.slotIndex);
      return hit ? hit.cell : null;
    },
    /**
     * The pixel box of a TILE-SPACE rect. ⚠️ ON AN OBLIQUE FLOOR A TILE IS A PARALLELOGRAM, not an
     * axis rect, so this returns the BOUNDING BOX of the four projected corners. Its callers
     * (`markCellSvg`, the build ghosts) draw inside a box by contract; a box that contains the real
     * parallelogram keeps the mark on its own tile, which is the property that matters.
     */
    rect(r) {
      const pts = [project(r.x, r.y), project(r.x + r.w, r.y),
        project(r.x + r.w, r.y + r.h), project(r.x, r.y + r.h)];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    },
    /**
     * A plate point → the fractional TILE it addresses.
     *
     * ⭐ THE (u, v) CLAMP IS THE AFFORDANCE, not a rounding detail. A cell's BOX is bigger than the
     * floor PARALLELOGRAM drawn inside it — the back wall, the ceiling cut and the `meet` letterbox
     * are all cell and none of them are floor — so a press up in the back wall solves to `v > 1` and
     * would address a tile the compartment does not contain, i.e. `tileAt` would clamp it to `null`
     * and an armed DIG would silently do nothing over a third of every tile. Clamping to the floor
     * means EVERY PIXEL OF A COMPARTMENT TILE ADDRESSES A TILE IN THAT COMPARTMENT, including the
     * upper body of a fitting that stands up off its own floor point.
     * ⚠️ It does not weaken the identity: `project` only ever emits `u, v ∈ [0,1]`, so the clamp is
     * inert on the round trip and bites only on points that are not on the floor at all.
     */
    invert(sx, sy) {
      const c = findByPoint(sx, sy);
      if (!c) return bandInvert(sx, sy);
      const [mx, my] = sceneToMini(c.cell, sx, sy);
      const [u0, v0] = miniToFloor(mx, my);
      const u = Math.min(1, Math.max(0, u0));
      const v = Math.min(1, Math.max(0, v0));
      const EPS = 1e-9;
      return [
        Math.min(c.rect.x + c.rect.w - EPS, c.rect.x + u * c.rect.w),
        Math.min(c.rect.y + c.rect.h - EPS, c.rect.y + v * c.rect.h),
      ];
    },
  };
}

/**
 * THE CORRIDOR STRIP — the band of plate the deck's SPINE is drawn in.
 *
 * ⛔ IT EXISTS BECAUSE ITS ABSENCE DELETED THE DECK'S OWN ROUTE. Review measured it on `--ship
 * wreck`: **83 deck-0 floor tiles, two ground items and the HATCH LADDER at (22,8) — the visible
 * deck-to-deck route — lie inside no slot rect**, so with the grid alone they were on no surface at
 * Level 1 at all. A plate that draws every room and none of the corridor between them is a floor
 * plan with the doors painted out.
 *
 * It is the ROW GAP, which is space the grid already reserves: the corridor really is between the
 * two banks of compartments, so the strip is where a player expects it. With a single row (a deck of
 * one or two compartments) there is no gap, so it sits just under the grid box instead.
 */
function corridorBand(lay) {
  if (lay.rows >= 2) return { x: DECK.x, y: DECK.y + lay.tileH, w: DECK.w, h: ROW_GAP };
  return { x: DECK.x, y: DECK.y + lay.tileH + 4, w: DECK.w, h: 16 };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 0 — the INK STARFIELD (the design's `starsInk`, three parallax layers).
//
// It is NOT part of the per-repaint scene: it is injected ONCE into the skeleton's `.ov-space` (see
// overview-view.js) so its CSS drift survives the scene's `innerHTML` rebuilds. MEASURED off
// `Perilune Game.dc.html:493-499`: three radial-gradient dot layers at dot radius 0.9/1.5/2.3 px,
// opacity 0.5/0.34/0.2, drifting at dur × 1 / 1.8 / 3 (dur = 40 s at the default "Steady").
// ⚠️ THE DOTS ARE INK ON PAPER NOW. The warm field's five cream/blue star colours are gone — there
// is one ink in this dialect and the depth is carried by OPACITY and SPEED, not by hue.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The three parallax layers: dot radius, opacity, and the CSS class that carries its drift. */
const STAR_LAYERS = Object.freeze([
  Object.freeze({ r: 0.45, opacity: 0.5,  cls: 'ov-stars-a' }),
  Object.freeze({ r: 0.75, opacity: 0.34, cls: 'ov-stars-b' }),
  Object.freeze({ r: 1.15, opacity: 0.2,  cls: 'ov-stars-c' }),
]);

/** The 220 seeded stars (VS-O-08) as {x%,y%,s}. Pure + deterministic. No colour: one ink. */
export function starfield(count = 220) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const b = rnd(i + 0.7);
    const s = b > 0.94 ? 3 : b > 0.8 ? 2 : 1;
    out.push({ x: n(rnd(i) * 100), y: n(rnd(i + 0.5) * 100), s });
  }
  return out;
}

/** One parallax layer's circles, tiled twice so the CSS translate loops seamlessly. */
function starTile(layer, stars) {
  return stars
    .map((st) => `<circle cx="${n(st.x / 100 * VIEW_W)}" cy="${n(st.y / 100 * VIEW_H)}"`
      + ` r="${n(layer.r * (0.7 + st.s * 0.3))}"/>`)
    .join('');
}

/**
 * The drifting ink starfield as a STANDALONE, self-animating SVG layer, injected once into the
 * skeleton. Each of the three layers is tiled twice side by side (x=0 and x=VIEW_W); a −VIEW_W CSS
 * translate loops seamlessly because the two tiles are identical. `slice` makes the field cover the
 * full backdrop, letterbox bands included.
 */
export function starLayerSvg() {
  const stars = starfield();
  const layers = STAR_LAYERS.map((L) => {
    const field = starTile(L, stars);
    return `<g class="ov-stars-drift ${L.cls}" fill="${INK}" opacity="${n(L.opacity)}">`
      + `<g class="pl-stars">${field}</g>`
      + `<g class="pl-stars" transform="translate(${VIEW_W} 0)">${field}</g></g>`;
  }).join('');
  return `<svg class="ov-stars" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid slice"`
    + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${layers}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 1 — THE HULL CAPSULE.
//
// Emitted VERBATIM from `Perilune Game.dc.html:55-60` under one transform: one closed path (fill
// paper, stroke ink 2.2), the 0.7 inner repeat line, the raked bow hatch (six 0.6 strokes at 0.55),
// the bow cone + four ribs, and three dashed exhaust plumes ("9 7" at 0.45). It is STATIC ART — the
// grid is what carries the ship's state — and it is sized to the grid box rather than the other way
// round, which is why `gridLayout` shrinks rows inside `DECK` instead of growing the capsule.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function hullLayer() {
  return `<g class="pl-hull" pointer-events="none" transform="${HULL_TRANSFORM}">`
    + `<path d="M56 150 C56 80 205 32 425 26 L785 26 C905 32 981 84 1022 150 C981 216 905 264 785 272`
    +   ` L425 272 C205 266 56 220 56 150 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.2"/>`
    + `<path d="M72 150 C72 88 212 46 428 40 L782 40 C896 46 966 92 1004 150 C966 208 896 254 782 258`
    +   ` L428 258 C212 252 72 212 72 150 Z" fill="none" stroke="${INK}" stroke-width="0.7"/>`
    + `<path d="M74 108 L196 138 M74 122 L196 152 M74 136 L196 166 M74 150 L196 180 M74 164 L196 194`
    +   ` M74 178 L196 208" stroke="${INK}" stroke-width="0.6" opacity="0.55"/>`
    + `<path d="M846 150 L972 102 L972 198 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>`
    + `<path d="M862 130 L958 130 M862 142 L958 142 M862 154 L958 154 M862 166 L958 166"`
    +   ` stroke="${INK}" stroke-width="0.5" opacity="0.4"/>`
    + `<path d="M44 132 L4 126 M44 150 L0 150 M44 168 L4 174" stroke="${INK}" stroke-width="0.8"`
    +   ` opacity="0.45" stroke-dasharray="9 7"/>`
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 2 — THE COMPARTMENT GRID: tiles that are LIVE MINIATURE ROOM INTERIORS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every path inside a tile carries this: at ~1/7 scale a scaled stroke vanishes (the design's own
 *  tiles set it on every element, `Perilune Game.dc.html:65`). */
const NS = ' vector-effect="non-scaling-stroke"';

/** One `<path>` in the miniature: `d`, fill, and the ink/dash the tile's state selected. */
function miniPath(d, fill, stroke, width, dash) {
  return `<path d="${d}" fill="${fill}"`
    + (stroke ? ` stroke="${stroke}" stroke-width="${n(width)}"` : ' stroke="none"')
    + (dash ? ` stroke-dasharray="${dash}"` : '') + NS + '/>';
}

/**
 * THE MINIATURE ROOM SHELL — the Level-2 cutaway at plate scale: floor quad, back wall, hatch-free
 * flat left wall, the solid front floor edge, the two dashed cut edges that say the right wall and
 * the ceiling are CUT AWAY rather than missing, and the left-wall door plate every design tile has.
 *
 * ⚠️ THE LEFT WALL IS FLAT `#E1D9C5`, NOT THE `#fh` HATCH, and that is the design's own choice at
 * this scale (charter §1: "flat `#E1D9C5` at thumbnail scale"). A 7-px hatch period inside a tile
 * scaled to ~1/7 resolves to noise, and a `<pattern>` here would also put one def per tile into the
 * document — the id-collision shape `overview-scene.test.js` pins against.
 *
 * @param {'built'|'unbuilt'} state  `unbuilt` draws the whole shell in the dash dialect (UNBUILT =
 *        ink "6 5", charter §1) with no fills, which is the design's third tile.
 */
function miniShell(state) {
  const c = MINI_FRAME.corners;
  const unbuilt = state === 'unbuilt';
  const dash = unbuilt ? MINI_WEIGHT.unbuiltDash : null;
  const fill = unbuilt ? 'none' : PAPER;
  const floor = poly([c.frontLeft, c.frontRight, c.backRight, c.backLeft]);
  const back = poly([c.backLeft, c.backRight, c.backRightTop, c.backLeftTop]);
  const left = poly([c.frontLeft, c.backLeft, c.backLeftTop, c.frontLeftTop]);
  const frontEdge = poly([c.frontLeft, c.frontRight], false);
  const cutV = poly([c.frontRight, c.frontRightTop], false);
  const cutD = poly([c.frontRightTop, c.backRightTop], false);
  return ''
    + miniPath(floor, fill, unbuilt ? INK : null, MINI_WEIGHT.detail, dash)
    + miniPath(back, fill, INK, MINI_WEIGHT.shell, dash)
    + miniPath(left, unbuilt ? 'none' : PAPER_FLAT, INK, MINI_WEIGHT.shell, dash)
    + miniPath(frontEdge, 'none', INK, MINI_WEIGHT.shell, dash)
    + miniPath(cutV, 'none', INK, MINI_WEIGHT.detail, dash || MINI_WEIGHT.cutDash)
    + miniPath(cutD, 'none', INK, MINI_WEIGHT.detail, dash || MINI_WEIGHT.cutDash)
    // the spine door on the left wall — `Perilune Game.dc.html:65`, present in every tile
    + miniPath('M38.4 350.4 L78.4 290.4 L78.4 85.4 L38.4 145.4 Z', unbuilt ? 'none' : PAPER,
      INK, MINI_WEIGHT.detail, dash);
}

/**
 * The compartment's REAL CONTENTS, standing in the miniature: one fitting per frame cell inside this
 * slot's tile rect, drawn by the SAME builders the catalogue and the Room Zoom use (`buildTileItem`
 * → `buildItem`, plus the wear join that swaps a worn machine for its post-raid twin).
 *
 * ⛔ THE POSITION IS THE TILE'S OWN, NOT A DECORATIVE ARRANGEMENT. A cell at tile (tx,ty) inside a
 * rect lands at the same FRACTION across and back of the miniature room, projected through the
 * shared oblique frame — so the galley's cooker is on the side of the galley it is really on, and
 * two compartments with the same fittings in different places draw differently. Sorted BACK TO
 * FRONT so nearer pieces overlap further ones, which is what makes the oblique read as depth.
 *
 * ⚠️ NEEDS-ATTENTION FLIPS THE STROKE TO OXBLOOD (ruling E3): a piece whose tile carries a fault
 * mark (`condemn`) or whose device row is worn past the twin threshold is drawn in the accent. It is
 * applied as a `<g stroke>` override rather than by re-building the piece, because the builders own
 * their own weights and a second colour parameter through 30 fittings is the drift shape this
 * module's glyph-map note exists to prevent.
 */
function miniContents(slot, frame, deck, deviceCond, marks, idPrefix) {
  if (!frame || frame.deck !== deck || !Array.isArray(frame.cells)) return '';
  const rect = slot && slot.rect;
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return '';
  const cond = deviceCond instanceof Map ? deviceCond : new Map();
  const attention = marks instanceof Set ? marks : new Set();
  const pieces = [];
  const x1 = Math.min(frame.w, rect.x + rect.w);
  const y1 = Math.min(frame.h, rect.y + rect.h);
  for (let ty = Math.max(0, rect.y); ty < y1; ty++) {
    for (let tx = Math.max(0, rect.x); tx < x1; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0];
      if (NON_FURNITURE.has(code)) continue;
      const itemId = itemIdForGlyphChar(String.fromCharCode(code));
      if (!itemId) continue; // glyph nothing skins → graceful skip
      const u = (tx + 0.5 - rect.x) / rect.w;
      const v = (ty + 0.5 - rect.y) / rect.h;
      // ⭐ THE SAME FUNCTION THE CLICK MAP INVERTS. A piece stands on the floor point its own tile
      // centre projects to, so a press on its footprint designates the tile it is drawn on.
      const [px, py] = floorToMini(u, v);
      const row = cond.get(tx + ',' + ty);
      const g = buildTileItem(itemId, { w: MINI_ITEM, h: MINI_ITEM, idPrefix: `${idPrefix}-f${tx}-${ty}` },
        row ? row.cond : undefined);
      // ⛔ NEEDS-ATTENTION IS THE `marks` CHANNEL'S OWN WORD, NEVER A CONDITION COMPARED TO A NUMBER.
      // The first draft flipped the stroke when `row.cond` fell under a literal, and that is a SECOND
      // HOME FOR THE WEAR THRESHOLD — the exact defect `client/src/items/wear.js` exists to prevent
      // and `wear-join.test.js` pins by name ("no surface compares a condition to a number"). Wear is
      // already expressed here: `buildTileItem` swaps the piece for its post-raid twin, through that
      // one function. What the accent adds is the SIM'S OWN judgement — a tile the player or the ship
      // has CONDEMNED — which arrives as a mark kind and needs no threshold at all.
      const attend = attention.has(tx + ',' + ty);
      pieces.push({
        yCm: v * MINI_D_CM,
        // ⭐ `data-tile` IS THE PIN'S HANDLE, and it is emitted rather than inferred: it says which
        // tile this piece was DRAWN for, so a test can take the piece's own base point and require
        // the click map to hand back the same tile. Inferring it from the id namespace instead is
        // what the first version of that test did, and it mis-paired every piece whose builder
        // emits no `<defs>` id at all.
        // ⭐ `pointer-events="visiblePainted"` — a press on a fitting's own INK designates that
        // fitting's tile (`overview-view.js` `pointToTile` reads `data-tile` first). In an oblique
        // view a piece stands UP off its floor point, so most of a tall locker's body hangs over the
        // tiles BEHIND it; without this tier, pressing the part of the drawing a player is aiming at
        // orders a different tile, which is the same "shows one thing, orders another" defect as the
        // projection bug, one layer up. The gaps between pieces are unpainted and fall through to
        // the floor map, which is what makes the two tiers agree rather than fight.
        svg: `<g class="pl-fit" data-tile="${tx},${ty}" pointer-events="visiblePainted"`
          + ` transform="translate(${n(px - MINI_ITEM / 2)} ${n(py - MINI_ITEM)})"`
          + (attend ? ` stroke="${ATTEND}"` : '') + `>${g}</g>`,
      });
    }
  }
  if (!pieces.length) return '';
  pieces.sort((a, b) => b.yCm - a.yCm);
  return `<g class="pl-furniture" pointer-events="none">${pieces.map((p) => p.svg).join('')}</g>`;
}

/**
 * ONE COMPARTMENT TILE. The border is a real `<rect>` in plate space (an `<svg>` element cannot
 * carry a stroke) and the interior is a NESTED `<svg>` with the design's own viewBox, so the
 * miniature scales into whatever cell `gridLayout` gave it without any arithmetic here.
 *
 * THE THREE BORDER STATES ARE THE DIALECT, measured off Screen 01 and ruling E3:
 *   1.4 px ink       — a compartment (the design's ordinary tile)
 *   2.2 px ink       — SELECTED (the design's fourth tile)
 *   1.4 px oxblood + "8 5" — NEEDS ATTENTION: this compartment holds a crew member whose order the
 *                      ship cannot run (D5) or a condemned/faulted piece. ⭐ THIS IS D5's BADGE AND
 *                      THE BLOCKED-ORDER SCRIM RE-HOUSED (ruling E4): the warm surface drew a red
 *                      badge over a tile in the Room Zoom and a scrim here; the plate says the same
 *                      thing in the one accent plus the queued-order dash, and the SENTENCE that
 *                      goes with it is the oxblood serif line in the `compartments` column.
 *
 * `data-anchor` is what `overview-view.js`'s `hitTest` reads — unchanged, so a click still enters the
 * room. `data-purpose` is the predicate the amber glow pool used to carry (`roomType`), emitted so a
 * test can read it rather than counting gradients that no longer exist.
 */
function compartmentTile(slot, cell, opts) {
  const o = opts || {};
  const selected = !!o.selected;
  const attention = !!o.attention;
  const purposed = !!(slot && slot.roomType);
  // ⛔ THE STATE IS `roomType` AND NOTHING ELSE. It deliberately does NOT ask `slot.occupied`: M1-L
  // widened that flag to "this slot's walls enclose a real room", which is TRUE FOR EVERY SLOT ON
  // EVERY SHIPPED SHIP, so a reader of it is a constant dressed as a predicate — and
  // `no-add-room.test.js` census-pins that this module never reads it again.
  const state = purposed ? 'built' : 'unbuilt';
  const stroke = attention ? ATTEND : INK;
  const width = selected ? 2.2 : 1.4;
  const dash = attention ? ' stroke-dasharray="8 5"' : '';
  return `<g class="pl-room${selected ? ' pl-room-sel' : ''}${attention ? ' pl-room-attend' : ''}"`
    + ` data-slot="${slot.slotIndex}" data-anchor="${esc(slot.anchorName)}"`
    + ` data-purpose="${purposed ? 1 : 0}" data-state="${state}">`
    + `<rect x="${n(cell.x)}" y="${n(cell.y)}" width="${n(cell.w)}" height="${n(cell.h)}"`
    +   ` fill="${PAPER}" stroke="${stroke}" stroke-width="${n(width)}"${dash}/>`
    + `<svg x="${n(cell.x)}" y="${n(cell.y)}" width="${n(cell.w)}" height="${n(cell.h)}"`
    +   ` viewBox="${MINI_VIEWBOX}" preserveAspectRatio="xMidYMid meet" class="ov-mini">`
    +   miniShell(state) + (o.contents || '')
    + `</svg></g>`;
}

/** An EMPTY GRID CELL — the census did not fill the last row. The design's dashed third tile, with
 *  no border of its own: nothing has been built here, so nothing draws a line around it. */
function emptyTile(cell) {
  return `<g class="pl-room-empty" pointer-events="none">`
    + `<rect x="${n(cell.x)}" y="${n(cell.y)}" width="${n(cell.w)}" height="${n(cell.h)}"`
    +   ` fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="6 5" opacity="0.45"/>`
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 2b — THE SPINE. Everything on the deck that is inside no compartment: the corridor's own
// floor line, its ground items and — the one that mattered — the HATCH LADDER, which is the visible
// deck-to-deck route. Drawn in the corridor strip, through the SAME `t.project` the click map
// inverts, so a press on the ladder designates the ladder's tile.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function corridorLayer(frame, deck, t, slots, id) {
  const band = t.band;
  const rule = `<path d="M${n(band.x)} ${n(band.y + band.h / 2)} L${n(band.x + band.w)} ${n(band.y + band.h / 2)}"`
    + ` fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.4"/>`;
  if (!frame || frame.deck !== deck || !Array.isArray(frame.cells)) {
    return `<g class="pl-corridor" pointer-events="none">${rule}</g>`;
  }
  const list = Array.isArray(slots) ? slots : [];
  const side = Math.max(9, band.h * 0.82);
  const out = [];
  for (let ty = 0; ty < frame.h; ty++) {
    for (let tx = 0; tx < frame.w; tx++) {
      if (list.some((sl) => sl && coversTile(sl.rect, tx, ty))) continue;   // a compartment owns it
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0];
      if (NON_FURNITURE.has(code)) continue;
      const itemId = itemIdForGlyphChar(String.fromCharCode(code));
      if (!itemId) continue;
      const [cx, cy] = t.project(tx + 0.5, ty + 0.5);
      out.push(`<g transform="translate(${n(cx - side / 2)} ${n(cy - side / 2)})">`
        + `${buildItem(itemId, { w: side, h: side, idPrefix: `${id}-c${tx}-${ty}` })}</g>`);
    }
  }
  return `<g class="pl-corridor" pointer-events="none">${rule}${out.join('')}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 3 — DEBRIS + DESIGNATION MARKS, drawn at PLATE level through the piecewise transform, so a
// mark lands inside the cell of the compartment that really holds it.
//
// ⚠️ IT DOES NOT READ THE FRAME. `GlyphMapper` writes `cell[1]` in pass 1 and OVERWRITES it in
// passes 3/4/5, so a crew member walking over a designation made its mark blink out. The kinds come
// from the sim's own registries over the wire, decoded once by `overview-view.js` and handed in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function markLayer(marks, deck, t) {
  if (!Array.isArray(marks) || !marks.length) return '';
  const out = [];
  for (const m of marks) {
    if (!m || (m.deck | 0) !== (deck | 0)) continue;
    const r = t.rect({ x: m.x, y: m.y, w: 1, h: 1 });
    const g = markCellSvg(m.mark, r.x, r.y, r.w, r.h, markVariant(m.x, m.y));
    if (g) out.push(g);
  }
  return out.length ? `<g class="pl-marks" pointer-events="none">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Build ghosts — wire-backed placement markers on this deck. THE DASH DIALECT'S QUEUED ORDER:
// oxblood "8 5" (charter §1), replacing the warm amber dashed box.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function ghostLayer(designs, deck, t) {
  const cells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  const out = [];
  for (const c of cells) {
    if (!Array.isArray(c) || c[2] !== deck) continue;
    const r = t.rect({ x: c[0], y: c[1], w: 1, h: 1 });
    const glyph = c[3] === 1 ? '/' : '#'; // door / wall
    out.push(`<g class="pl-ghost">`
      + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="none"`
      +   ` stroke="${ATTEND}" stroke-width="1.2" stroke-dasharray="8 5"/>`
      + `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" font-size="${n(Math.max(6, r.h * 0.7))}"`
      +   ` fill="${ATTEND}" text-anchor="middle" dominant-baseline="central"`
      +   ` font-family="${FONT.mono}">${esc(glyph)}</text></g>`);
  }
  return out.length ? `<g class="pl-ghosts" pointer-events="none">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Terminals — clickable MOSS console chips, one per terminal device on the shown deck. Carries
// `data-tid` so the click routes straight to that terminal's MOSS program.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function terminalLayer(terminals, deck, t) {
  const list = Array.isArray(terminals) ? terminals : [];
  const out = [];
  for (const term of list) {
    if (!term || (term.deck | 0) !== deck) continue;
    const [cx, cy] = t.project(term.x + 0.5, term.y + 0.5);
    const w = Math.max(9, t.tileSize * 1.6), h = w * 0.72;
    const x = cx - w / 2, y = cy - h * 0.7;
    out.push(`<g class="pl-terminal" data-tid="${esc(term.tid)}">`
      + `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${n(w)}" height="${n(h)}" fill="transparent"/>`
      + `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${PAPER}"`
      +   ` stroke="${INK}" stroke-width="1"/>`
      + `<path d="M${n(x + w * 0.2)} ${n(y + h * 0.35)} L${n(x + w * 0.8)} ${n(y + h * 0.35)}`
      +   ` M${n(x + w * 0.2)} ${n(y + h * 0.62)} L${n(x + w * 0.62)} ${n(y + h * 0.62)}"`
      +   ` stroke="${INK}" stroke-width="0.7" opacity="0.7"/>`
      + `</g>`);
  }
  return out.length ? `<g class="pl-terminals">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 4 — THE INK CREW MARKERS: one two-pass figure per on-deck crew member, standing in the cell
// of the compartment they are in, each wearing its identity + WORK label.
//
// THE WORK MARKER (console-retirement plan §1(b) B4) SURVIVES THE REDESIGN UNCHANGED IN MEANING and
// changed only in ink: the tag half appears ONLY for a crew member doing a job AT A PLACE. Idle,
// merely walking and *en route* crew get no tag — `taskTag` returns null for all three, and the
// ABSENCE is the information. The de-clutter sweep below is what keeps eight pawns in one
// compartment from reading as `HALL(VE OKO NOV KAUR / SAT ITO YEMI`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** How far each de-clutter row lifts a label, in design px (a pill is 11 tall, so 12 leaves 1 of air). */
const LABEL_ROW_STEP = 12;
/**
 * Rows the sweep may stack before it gives up.
 *
 * ⚠️ IT WAS 8 — "one row per crew member in the densest room" — AND THE PLATE MADE THAT TOO FEW,
 * measured rather than guessed. On the old floor-plan projection the grid ship's eight-crew hold
 * spread across ~700 design px, so eight rows were plenty. A compartment TILE is ~190 × 70 px, so
 * those eight pawns now stand within one cell, and their pills alias: a pawn one tile further back
 * sits ~11.7 px lower while a row step is 12, so two labels a row apart in INDEX land within a
 * pixel of each other in SPACE and the sweep must skip a row to miss them. Eight rows therefore ran
 * out with eight pawns and the last-resort case fired — `8 servicing on alternating tile rows`
 * emitted a real 52.6 × 7.8 px overlap, caught by the emitted-rect acceptance.
 * 16 is 8 rows plus the aliasing headroom; the crowded case is still reachable (its own test drives
 * `LABEL_MAX_ROWS + 4` labels at one x) so nothing became unfalsifiable.
 */
export const LABEL_MAX_ROWS = 16;
/** Horizontal breathing room added to each side of a pill before testing it for overlap. */
const LABEL_GAP = 2;
/** The pill's own box, in design px. SHARED by the sweep and the renderer below so the geometry the
 *  sweep reasons about is literally the geometry that gets emitted — see `labelRect`. */
export const LABEL_PILL_H = 11;
/** How far the pill's TOP edge sits above the label's text baseline (`tagY`). */
export const LABEL_PILL_RISE = 8;

/** The pill rect `[x0,x1,y0,y1]` a label would occupy on `row`. The single place this geometry is
 *  written down: `pawnLayer` emits from it too, so the sweep cannot reason about a different box than
 *  the one on screen (which is exactly how a row-index-only sweep came to certify overlapping pills). */
function labelRect(l, row) {
  const base = Number.isFinite(l.baseY) ? l.baseY : 0;
  const tagY = base - row * LABEL_ROW_STEP;
  return [
    l.cx - l.w / 2 - LABEL_GAP, l.cx + l.w / 2 + LABEL_GAP,
    tagY - LABEL_PILL_RISE, tagY - LABEL_PILL_RISE + LABEL_PILL_H,
  ];
}

/**
 * Assign each pawn label a de-clutter ROW so that no two visible pills overlap. PURE.
 *
 * A greedy sweep in PRIORITY order — WORKING crew first, then by cid — takes the lowest row (closest
 * to the pawns) whose rect misses every rect already claimed. Priority is what makes the result
 * principled rather than arbitrary: the work tags are the honesty affordance, so they get the legible
 * rows, and anything that has to give way is an idle crew member's name, which the CREW WATCH dock
 * also carries.
 *
 * THE OCCUPANCY TEST IS 2-D, and it has to be. Each pill hangs off its OWN pawn's feet (`baseY`), so
 * two pawns a tile apart vertically are further apart than a row step — "same row" therefore neither
 * implies nor is implied by "same height", and a sweep that compared only horizontal spans within a
 * row index certified a genuinely overlapping pair as clean. It did: measured off the emitted rects,
 * the shipped `rosterDeck1` fixture produced ONE overlapping pair at ~91 % of a pill's height, and
 * eight crew on alternating rows produced four.
 *
 * When all `LABEL_MAX_ROWS` rows are taken the two cases are treated DIFFERENTLY, and this asymmetry
 * is the point: an IDLE label is marked `crowded` (the caller renders it transparent, revealed by
 * hovering its pawn), while a WORKING label is never marked — it draws on the top row and accepts the
 * overlap. A tag that is merely ugly is honest; a work tag that vanishes because the room is busy
 * would say "nobody here is working" at exactly the moment everybody is.
 *
 * Ordering avoids `localeCompare` deliberately: it is locale-sensitive and this repo's dev machine is
 * de-DE, so a locale-dependent sort would make the SVG non-deterministic across machines.
 *
 * @param {Array<{cid:*, cx:number, w:number, working:boolean, baseY?:number}>} labels
 * @returns {Map<string,{row:number, crowded:boolean}>} keyed by String(cid)
 */
export function layoutPawnLabels(labels) {
  const out = new Map();
  const list = Array.isArray(labels) ? labels.slice() : [];
  list.sort((a, b) => {
    if (!!a.working !== !!b.working) return a.working ? -1 : 1;
    const ka = String(a.cid), kb = String(b.cid);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const claimed = []; // every rect already taken, as [x0,x1,y0,y1]
  for (const l of list) {
    let row = -1;
    let rect = null;
    for (let r = 0; r < LABEL_MAX_ROWS; r += 1) {
      const cand = labelRect(l, r);
      if (!claimed.some((s) => cand[0] < s[1] && cand[1] > s[0] && cand[2] < s[3] && cand[3] > s[2])) {
        row = r; rect = cand; break;
      }
    }
    const full = row < 0;
    if (full) { row = LABEL_MAX_ROWS - 1; rect = labelRect(l, row); }
    claimed.push(rect);
    out.set(String(l.cid), { row, crowded: full && !l.working });
  }
  return out;
}

function pawnLayer(crew, deck, t, selectedCid, id) {
  const list = Array.isArray(crew) ? crew : [];
  // Pass 1 — every on-deck pawn's geometry + label text, so the de-clutter sweep sees them all at once.
  const pawns = [];
  for (const c of list) {
    if (!c || c.deck !== deck) continue; // off-deck / fogged crew simply do not render
    // ⭐ THE GLIDE. `fx`/`fy` are the wire's sub-tile walk position in the SAME coordinate space as
    // `x`/`y` (a tile coordinate, no centre offset — the convention is written down once, at
    // `WireFormat.RosterEntry.Fx`), so the `+ 0.5` that puts the feet on the tile CENTRE is applied
    // here exactly as it always was. An older host omits them and the integer tile is used, which is
    // also what a standing crew member serializes (`fx === x`), so the fallback is never a jump.
    // Membership (`c.deck !== deck` above), selection and click targets keep the INTEGER tile.
    const gx = Number.isFinite(c.fx) ? c.fx : c.x;
    const gy = Number.isFinite(c.fy) ? c.fy : c.y;
    const [fx, fy] = t.project(gx + 0.5, gy + 0.5); // feet on the tile centre
    const S = Math.max(0.5, t.tileSize * 2.2 / 24);   // pawn box ≈ 2.2 tiles tall (viewBox 24)
    const sur = surnameOf(c.name);
    const tag = taskTag(c.task);                      // null ⇒ idle / walking / en route (no tag)
    const text = tag ? sur + ' · ' + tag : sur;
    pawns.push({
      c, fx, fy, S, sur, tag,
      cid: c.cid, cx: fx, working: tag != null,
      // The pill's UNLIFTED text baseline, derived from this pawn's own feet — so it is part of what
      // the sweep must know: two pawns a tile apart vertically are further apart than a row step.
      baseY: fy - 24 * S - 4,
      w: Math.max(16, text.length * 5 + 8),           // same metric the surname pill always used
    });
  }
  const layout = layoutPawnLabels(pawns);

  const out = [];
  for (const p of pawns) {
    const { c, fx, fy, S } = p;
    const selected = selectedCid != null && String(c.cid) === String(selectedCid);
    const body = pawnSprite(
      { cid: c.cid, role: c.role },
      { idPrefix: `${id}-pw-${esc(c.cid)}`, className: 'pawn' },
    );
    let g = `<g class="pl-pawn" data-cid="${esc(c.cid)}">`;
    if (selected) {
      // ⚠️ SELECTION IS A RULE, NOT A GLOW. The warm surface put a radial amber gradient under the
      // selected pawn — a `<defs>` + `<radialGradient>` per selection, i.e. an id per repaint. In the
      // paper dialect selection is a solid ink underline through the figure's feet, which needs no
      // def at all, and the plate's OTHER selection cue (the 2.2 px tile border) says which
      // compartment she is in.
      g += `<path d="M${n(fx - S * 7)} ${n(fy + S * 1.5)} L${n(fx + S * 7)} ${n(fy + S * 1.5)}"`
        + ` stroke="${INK}" stroke-width="${n(Math.max(1, S * 1.2))}" fill="none"/>`;
    }
    // seat the pawn so its feet (local 8,23 in the 16×24 viewBox) land on (fx,fy)
    g += `<g transform="translate(${n(fx - 8 * S)} ${n(fy - 23 * S)}) scale(${n(S)})">${body}</g>`;
    // identity + WORK label above the head
    const lay = layout.get(String(c.cid)) || { row: 0, crowded: false };
    const baseY = p.baseY;
    const tagY = baseY - lay.row * LABEL_ROW_STEP;
    const cls = 'pl-tag' + (p.tag ? ' pl-tag-work' : '') + (lay.crowded ? ' pl-tag-crowded' : '');
    g += `<g class="${cls}">`
      // leader line: a lifted pill would otherwise be ambiguous about which pawn it belongs to
      + (lay.row > 0
        ? `<line x1="${n(fx)}" y1="${n(tagY + 3)}" x2="${n(fx)}" y2="${n(baseY + 3)}" stroke="${INK}" stroke-width="0.7" opacity="0.45"/>`
        : '')
      // The pill box comes from the SAME two constants the sweep reasoned about (LABEL_PILL_*), so a
      // change to either cannot silently make the sweep certify a box that is no longer emitted.
      + `<rect x="${n(fx - p.w / 2)}" y="${n(tagY - LABEL_PILL_RISE)}" width="${n(p.w)}" height="${LABEL_PILL_H}" fill="${PAPER}" stroke="${INK}" stroke-width="0.7"/>`
      + `<text x="${n(fx)}" y="${n(tagY - 2)}" font-size="7.5" letter-spacing=".5" fill="${INK}" text-anchor="middle" dominant-baseline="central" font-family="${FONT.mono}">`
      + `${esc(p.sur)}`
      + (p.tag ? `<tspan fill="${ATTEND}"> · ${esc(p.tag)}</tspan>` : '')
      + `</text></g>`;
    g += `</g>`;
    out.push(g);
  }
  return out.length ? `<g class="pl-pawns">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The composer.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The tiles that carry an ATTENTION treatment, as a Set of anchor names. PURE — derived from the
 *  same `blocked` rows the `compartments` column words, so the tile and the sentence cannot
 *  disagree about which compartment is in trouble (ruling E4). */
function attentionAnchors(state, slots) {
  const out = new Set();
  const anchors = Array.isArray(state.attentionAnchors) ? state.attentionAnchors : [];
  for (const a of anchors) if (a) out.add(String(a));
  // A compartment whose tile carries a condemned/faulted mark is in trouble too, and the mark layer
  // alone is 4 px of ✕ inside a 70 px cell — too small to find without the border saying so.
  const marks = Array.isArray(state.marks) ? state.marks : [];
  for (const m of marks) {
    if (!m || (m.deck | 0) !== (state.deck | 0) || m.mark !== 'condemn') continue;
    for (const s of slots) if (s && coversTile(s.rect, m.x, m.y)) out.add(String(s.anchorName));
  }
  return out;
}

/** The `"x,y"` keys of every tile carrying a fault mark on this deck — the fittings' oxblood flip. */
function attentionTiles(marks, deck) {
  const out = new Set();
  for (const m of (Array.isArray(marks) ? marks : [])) {
    if (!m || (m.deck | 0) !== (deck | 0)) continue;
    if (m.mark === 'condemn') out.add(m.x + ',' + m.y);
  }
  return out;
}

/**
 * Build the whole Level-1 ship plate as one self-contained SVG string. PURE — same `state` yields a
 * byte-identical result.
 *
 * @param {object} state
 * @param {number} state.deck            the deck to render.
 * @param {Array}  state.decksView       decksView(decks,rooms) output — [{deck, slots:[…]}].
 * @param {object} [state.frame]         the frame message (the miniatures' contents come from its cells).
 * @param {Array}  [state.crew]          roster crew [{cid,name,role,deck,x,y}].
 * @param {Array}  [state.designs]       build-ghost design cells (or a {cells} message).
 * @param {Array}  [state.terminals]     MOSS terminal directory [{tid,deck,x,y}] — clickable chips.
 * @param {Array}  [state.marks]         decoded `marks` cells — the debris / dig / stockpile / strip
 *                                       layer. NOT derived from `frame`.
 * @param {Map}    [state.deviceCond]    `deckDeviceConditions(...)` for THIS deck — per-tile device
 *                                       wear off the `devices` channel, which chooses a machine's
 *                                       post-raid twin.
 * @param {string[]} [state.attentionAnchors]  anchors whose compartment needs attention (D5's stuck
 *                                       orders, re-housed per ruling E4).
 * @param {*}      [state.selectedCid]   the selected crew cid.
 * @param {string} [state.selectedAnchor] the compartment drawn with the 2.2 px selected border.
 * @param {string} [state.lens]          the active lens (recorded on the root for the wash overlay).
 * @param {string} [state.idPrefix]      def-id namespace (default 'ov') so many scenes can coexist.
 * @returns {string} an `<svg>…</svg>` document string.
 */
export function overviewScene(state) {
  const st = state || {};
  const id = st.idPrefix || 'ov';
  const deck = st.deck | 0;
  const deckView = (Array.isArray(st.decksView) ? st.decksView : []).find((d) => d.deck === deck)
    || { deck, slots: [] };
  const slots = deckView.slots || [];
  const t = makeTransform(slots, st.frame);
  const lay = t.lay;

  const attend = attentionAnchors(st, slots);
  const faultTiles = attentionTiles(st.marks, deck);

  const tiles = [];
  for (let i = 0; i < lay.cells; i++) {
    const cell = cellRect(i, lay);
    const slot = slots[i];
    if (!slot) { tiles.push(emptyTile(cell)); continue; }
    tiles.push(compartmentTile(slot, cell, {
      selected: st.selectedAnchor != null && String(st.selectedAnchor) === String(slot.anchorName),
      attention: attend.has(String(slot.anchorName)),
      contents: miniContents(slot, st.frame, deck, st.deviceCond, faultTiles, `${id}-s${i}`),
    }));
  }

  // The paper ground + the drifting ink starfield are NOT drawn here: they live in the persistent
  // `.ov-space` skeleton layer (starLayerSvg + CSS) so the drift survives the scene's repaints.
  const body = ''
    + hullLayer()
    + `<g class="pl-rooms">${tiles.join('')}</g>`
    + corridorLayer(st.frame, deck, t, slots, id)
    // `markLayer` sits ABOVE the tiles (whose own `pl-furniture` is inside them) — the same order,
    // for the same reason, as the Room Zoom's: a condemned DEVICE carries fg 26, and beneath its own
    // fitting its ✕ would be invisible.
    + markLayer(st.marks, deck, t)
    + ghostLayer(st.designs, deck, t)
    + terminalLayer(st.terminals, deck, t)
    + pawnLayer(st.crew, deck, t, st.selectedCid, id);

  return `<svg class="pl-overview" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet"`
    + ` xmlns="http://www.w3.org/2000/svg" data-deck="${deck}" data-lens="${esc(st.lens || 'none')}">`
    + body + `</svg>`;
}

export default overviewScene;
