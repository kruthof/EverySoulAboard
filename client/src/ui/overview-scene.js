// THE LEVEL-1 SHIP PLATE — the paper-and-ink SIDE-ELEVATION CUTAWAY of the whole ship. A PURE,
// DOM-free composer that turns one captured wire snapshot (decks/rooms view + devices + items +
// roster + designs + marks + terminals) into a single self-contained SVG string.
//
// Authority: `design-import/Perilune Ship - Drawn.html` — the owner's drawing, imported verbatim in
// this package's commit. It is a JS-bundled page, so it was RENDERED HEADLESS and its markup read
// out of the live DOM; every literal below is a number off that markup and names the element it came
// from (`data-dc-tpl="…"`) so the next reader re-measures instead of trusting a comment.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️⚠️ WHAT REPLACED WHAT. THIS IS A REPLACEMENT OF VR-P4's PLATE, NOT AN EDIT OF IT.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//   · the top-down hull capsule + one deck's 4×2 COMPARTMENT GRID  →  a SIDE ELEVATION of the whole
//     ship with BOTH DECKS drawn at once, as one continuous cutaway inside the hull.
//   · four bordered tiles floating on the capsule                  →  compartments that TILE one
//     continuous deck floor, separated by shared PARTITION WALLS standing on that floor. There is no
//     tile border left to draw, because there is no tile.
//   · the CORRIDOR STRIP (a reserved row-gap with its own linear map) →  the WALKWAY: the front
//     third of each deck's own floor plane, addressed by the SAME projection as everything else.
//     The piecewise-band special case is gone; so is its stated resolution limit's worst half.
//   · the FRAME as the source of what stands in a compartment      →  the `devices` + `items`
//     channels (`ship-fittings.js`), which carry EVERY DECK. That substitution is the finding that
//     made a two-deck drawing possible without a host change, and it is measured tile-for-tile —
//     read that file's header before changing where a fitting comes from.
//   · `makeTransform(slots, frame)` (one deck, piecewise over 8 grid cells) → `makeShipTransform(
//     decksView, frame)` (every deck, ONE affine floor plane each). `ship-elevation.js` owns it and
//     its header owns the coordinate contract INCLUDING ITS ONE HONESTY LIMIT — read it.
//
// ⭐ THE SKETCH HAND. The ship's architecture — hull, fins, engine block, bow window, deck slabs,
// partition walls — is drawn as clean geometry and then run through `render/sketch.js`'s `strong`
// preset, which is the treatment the owner adopted and the third of the three complaints this
// package answers ("it should look sketchier"). It is applied ONLY to strokes authored HERE; the
// FITTINGS are another lane's (`lane/sketch-adoption`) and are drawn by their own builders,
// untouched, so the two packages cannot fight over the same ink.
//
// PURITY: no DOM, no clock, no randomness beyond the seeded starfield and `sketch()`'s own seeded
// noise — same `state` yields a byte-identical string. The static ship art is sketched ONCE at module
// load and cached, so a repaint costs nothing for it.

import { buildItem } from '../items/index.js';
// THE WEAR JOIN — the ONLY door from a surface to the 70 post-raid twins. The threshold and its
// justification live in `client/src/items/wear.js`, once, for both surfaces.
import { buildTileItem } from '../items/wear.js';
import { pawnSprite } from '../render/pawn-svg.js';
// The work-tag classifier (console-model.js is misnamed, not console-only — `taskTag` is a PURE
// roster-label → tag mapping and is the SAME source the console's on-map WORK markers used).
import { taskTag } from './console-model.js';
// The debris/designation mark vocabulary. SHARED verbatim with the Level-2 Room Zoom so one mark
// kind cannot come to mean two different things on the two surfaces.
import { markVariant, markCellSvg } from './mark-overlay.js';
// ⭐ THE ALL-DECK FITTING SOURCE. See its header for the measurement that replaced the frame.
import { deckFittings, fogTiles, slotUnsurveyed, surveyedDecks } from './ship-fittings.js';
// ⭐ THE OUTBOARD LEDGER — which `DeviceKind`s are drawn on the HULL rather than in a room, and
// which piece each hangs. One table, with its reason, in the module that already owns "what art
// does this device wear". See `outboardLayer`.
import { OUTBOARD_ITEM_FOR_KIND } from '../items/glyph-map.js';
// The client's ONE mirror of `DeviceKind`, pinned member-for-member against `Device.cs` by
// `prioritise-menu.test.js`. The outboard ledger is keyed by member NAME, so this is the join.
import { DEVICE_KIND_NAMES } from './room-model.js';
// ⭐⭐ THE PROJECTION. One file, one contract, one inverse.
import {
  VIEW_W, VIEW_H, K, SHIP_XF, BAY, V_SPINE,
  makeShipTransform, floorPoint,
  INK, PAPER, PAPER_FLAT, ATTEND, FONT, poly, n,
} from './ship-elevation.js';
import { sketch } from '../render/sketch.js';

/* eslint-disable no-multi-spaces */

export { VIEW_W, VIEW_H, BAY, K, makeShipTransform };

// ── tiny deterministic string helpers (no locale APIs, InvariantCulture-safe) ──
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
// Layer 0 — the INK STARFIELD (the design's `starsInk`, three parallax layers).
//
// UNCHANGED BY THIS PACKAGE. It is NOT part of the per-repaint scene: it is injected ONCE into the
// skeleton's `.ov-space` (see overview-view.js) so its CSS drift survives the scene's `innerHTML`
// rebuilds. Three radial-dot layers at radius 0.9/1.5/2.3 px, opacity 0.5/0.34/0.2, drifting at
// dur × 1 / 1.8 / 3. Ink on paper: one ink in this dialect, depth carried by OPACITY and SPEED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

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

function starTile(layer, stars) {
  return stars
    .map((st) => `<circle cx="${n(st.x / 100 * VIEW_W)}" cy="${n(st.y / 100 * VIEW_H)}"`
      + ` r="${n(layer.r * (0.7 + st.s * 0.3))}"/>`)
    .join('');
}

/** The drifting ink starfield as a STANDALONE, self-animating SVG layer, injected once into the
 *  skeleton. Each layer is tiled twice so a −VIEW_W CSS translate loops seamlessly. */
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
// Layer 1 — THE SHIP: the hull profile, the four fins, the engine block with its three nozzles, and
// the bow window. STATIC ART — the decks inside are what carry the ship's state.
//
// ⭐ THE GEOMETRY IS THE DESIGN'S, THE HAND IS `sketch.js`'s. The owner's file draws each of these
// outlines two-to-four times with hand-wobbled `Q` curves at falling opacity — i.e. the sketch
// treatment already baked in, as fixed paths. Embedding those verbatim would give a hull that can
// never change; embedding the STRAIGHT geometry and running it through `sketch(…, 'strong')` gives
// the same look from a seed, which is what makes the treatment a dial rather than a decision.
//
// MEASURED off the rendered design (`data-dc-tpl` in brackets):
//   hull      [463] `M1046 177.4 L992 104 L932 90 L116 86 L86 100 L86 254.7 L116 268.7 L932 264.7
//                    L992 250.7 Z`, filled `#D2C8B2` at 0.85 — bow to the RIGHT, stern block LEFT.
//   fins      [455/457/459/461] four trapezoids, two above the hull line and two below.
//   engine    [468] the block x 41.9..85.6, y 112.6..239.4; [470/472/474] three hex nozzles.
//   bow win.  [476] `M935.9 143.9 L994.9 154.8 L993.1 200.1 L935.5 209.6 Z` + three mullions
//             [478/480/482].
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The ship's silhouette, in the design's own coordinates. One closed path. */
const HULL_D = 'M1046 177.4 L992 104 L932 90 L116 86 L86 100 L86 254.7 L116 268.7 L932 264.7 '
  + 'L992 250.7 Z';

/** The four fins, bow-right. Each is the design's own trapezoid, straightened. */
const FIN_D = Object.freeze([
  'M269.1 86.4 L370.8 84.5 L341.8 65.5 L284.8 63.4 Z',
  'M634.5 87.2 L740.3 87.4 L711.7 62.9 L652.8 65 Z',
  'M301.4 268.9 L404.9 267.2 L373.8 291.5 L315.2 291.8 Z',
  'M666.3 270.2 L770.4 269.2 L743.5 289.2 L683.4 291.4 Z',
]);

/** One hexagonal engine nozzle around (cx,cy). The design's own three, at r ≈ 9.3. */
function nozzle(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts);
}

/**
 * The ship's static art, BEFORE the hand. Emitted as one fragment so `sketch()` can measure the
 * whole body (its silhouette/interior split and its ground band are relative to the fragment's own
 * bounding box — see that module's header).
 */
function shipGeometry() {
  // ⚠️ THE AUTHORED WIDTHS ARE BELOW THE DESIGN'S, ON PURPOSE AND BY MEASUREMENT. The design's own
  // hull outline is `stroke-width="1.8"` — but it is a FINISHED drawing, already hand-multiplied,
  // whereas these paths are fed to `sketch('strong')`, whose `ramp: 1.9` / `silBoost: 1.5` widen a
  // silhouette run by up to 2.85× and then draw it twice (`doubles: true`). Authoring 1.8 here
  // photographed as a 5 px black rope around the ship. 0.62 × the design's widths puts the printed
  // weight back where the design has it; the whole ship is drawn at ~0.8 scale by `SHIP_XF`'s
  // K = 1.23 as well, which is why the numbers are not simply halved.
  const fins = FIN_D.map((d) => `<path d="${d}" fill="${PAPER}" stroke="${INK}" stroke-width="0.85"/>`).join('');
  const noz = [[35.4, 148.4], [35.9, 176.5], [35.4, 206.8]]
    .map(([cx, cy]) => `<path d="${nozzle(cx, cy, 9.3)}" fill="${PAPER}" stroke="${INK}" stroke-width="0.7"/>`)
    .join('');
  return ''
    + fins
    // the hull body: a wash face under everything, then the outline the hand redraws
    + `<path d="${HULL_D}" fill="#D2C8B2" stroke="none" opacity="0.85"/>`
    + `<path d="${HULL_D}" fill="none" stroke="${INK}" stroke-width="0.95"/>`
    // the engine block + its nozzles (stern, left)
    + `<path d="M41.9 112.6 L85.6 112.5 L85.2 239.4 L42.3 239.1 Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.8"/>`
    + noz
    // the bow window + its three mullions
    + `<path d="M935.9 143.9 L994.9 154.8 L993.1 200.1 L935.5 209.6 Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.8"/>`
    + `<path d="M948.6 143.5 L950 213.4" fill="none" stroke="${INK}" stroke-width="0.7" opacity="0.5"/>`
    + `<path d="M964.9 144.9 L962.2 208.8" fill="none" stroke="${INK}" stroke-width="0.7" opacity="0.5"/>`
    + `<path d="M979.8 147.8 L977.2 205.6" fill="none" stroke="${INK}" stroke-width="0.7" opacity="0.5"/>`;
}

/**
 * ⭐ SKETCHED ONCE, AT MODULE LOAD. The ship never changes shape, `sketch()` is a pure function of
 * (fragment, level, seed), and a repaint runs ~10×/s — so computing it per call would spend the
 * treatment's whole cost on a constant. The cache is a `const`, not a memo table: there is no key,
 * no eviction and no mutable module state to make the composer non-deterministic.
 */
const SHIP_INK = sketch(shipGeometry(), { level: 'strong', seed: 'perilune-hull' });

function hullLayer() {
  return `<g class="pl-hull" pointer-events="none" transform="${SHIP_XF}">${SHIP_INK}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 2 — THE DECKS: for each band, one continuous floor, the walkway at its front, the back wall
// behind it, and the partition walls that divide it into compartments.
//
// ⭐ THE ARCHITECTURE IS SKETCHED, THE CONTENTS ARE NOT. Every stroke in `deckArchitecture` goes
// through `sketch()`; the fittings and the pawns are drawn by their own builders and are appended
// afterwards. That boundary is the reason this package and `lane/sketch-adoption` can both land: it
// owns the ITEM catalogues' hand, this owns the SHIP's.
//
// ⚠️ THE ARCHITECTURE IS SKETCHED PER DECK AND PER SLOT-SHAPE, NOT PER REPAINT. Its geometry depends
// only on the band and the compartment spans, both of which are functions of the `decks` channel —
// which the host sends once and then dedupes. The seed is the deck index, so two decks get two
// different hands (a ship drawn with one traced wall repeated is the thing the sketch treatment is
// against) and the same deck gets the same hand every frame.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Stroke weights, measured off the design's deck lines: outer 1.5, partition 1.4, slab 1.1. */
// ⚠️ AUTHORED BELOW THE DESIGN'S PRINTED WEIGHTS, for the reason `shipGeometry` states at length:
// these strokes are fed to `sketch('strong')`, which widens a silhouette run and then draws it twice.
const W = Object.freeze({ outer: 0.9, wall: 0.75, slab: 0.6, rule: 0.45, detail: 0.4, cut: '5 4', door: '3 2.5' });

/** A line between two projected points. */
function seg(a, b, stroke, width, dash, opacity) {
  return `<path d="M${n(a[0])} ${n(a[1])} L${n(b[0])} ${n(b[1])}" fill="none" stroke="${stroke}"`
    + ` stroke-width="${n(width)}"` + (dash ? ` stroke-dasharray="${dash}"` : '')
    + (opacity != null ? ` opacity="${n(opacity)}"` : '') + '/>';
}

/** A point lifted off the floor by the deck's own wall height — the oblique's vertical. */
function up(p, h) { return [p[0], p[1] - h]; }

/**
 * ONE DECK'S ARCHITECTURE — the strokes that make the band read as a cutaway rather than a strip.
 *
 * Draw order is a painter's algorithm back to front, which is what makes the oblique read as depth:
 *   1. the BACK WALL face (paper), so everything else sits in front of it
 *   2. the deck FLOOR (paper) with the WALKWAY's near strip in `PAPER_FLAT`
 *   3. the floor's back and front edges, and the ceiling cut line
 *   4. the PARTITION WALLS, each with its DASHED DOORWAY
 *
 * ⭐ THE PARTITIONS ARE SHARED, WHICH IS THE OWNER'S SECOND COMPLAINT FIXED AT THE ROOT. Compartment
 * `i`'s right-hand wall IS compartment `i+1`'s left-hand wall: one stroke, drawn once, at the span
 * boundary. VR-P4 drew four borders per compartment and the owner read the result as "rooms weirdly
 * separated in boxes" — which was exactly what it was.
 */
function deckArchitecture(info) {
  const P = (u, v) => floorPoint(info.plane, u, v);
  const wall = info.plane.wall;
  const out = [];
  // 1. the back wall — one face across the whole deck, paper, with its top edge in ink
  const bl = P(0, 1), br = P(1, 1);
  out.push(`<path d="${poly([bl, br, up(br, wall), up(bl, wall)])}" fill="${PAPER}" stroke="none"/>`);
  out.push(seg(up(bl, wall), up(br, wall), INK, W.slab));
  // 2. the floor: the compartments' half in paper, the walkway's near strip in the flat tone
  const fl = P(0, 0), fr = P(1, 0), sl = P(0, V_SPINE), sr = P(1, V_SPINE);
  out.push(`<path d="${poly([sl, sr, br, bl])}" fill="${PAPER}" stroke="none"/>`);
  out.push(`<path d="${poly([fl, fr, sr, sl])}" fill="${PAPER_FLAT}" stroke="none"/>`);
  // 3. the edges: the front floor line is the deck's own solid edge; the walkway's back line is
  //    where the compartments begin; the two ends are DASHED CUTS (the hull is cut away there).
  out.push(seg(fl, fr, INK, W.outer));
  out.push(seg(sl, sr, INK, W.rule, null, 0.55));
  out.push(seg(bl, br, INK, W.slab, null, 0.85));
  out.push(seg(fl, up(bl, wall), INK, W.detail, W.cut, 0.7));
  out.push(seg(fr, up(br, wall), INK, W.detail, W.cut, 0.7));
  // 4. the partitions — one per interior span boundary, plus the two deck ends
  const edges = [];
  for (let i = 0; i < info.spans.length; i++) {
    if (i === 0) edges.push(info.spans[i].u0);
    edges.push(info.spans[i].u1);
  }
  for (const u of edges) {
    const a = P(u, V_SPINE), b = P(u, 1);
    // ⭐ THE WALL IS A FACE, NOT TWO LINES, and that is the compartment's whole depth cue. The
    // design gives every room a flat `#E1D9C5` LEFT WALL (`data-dc-tpl="14"`, and one per room in
    // every symbol) — at thumbnail scale it is a solid tone rather than the `#fh` hatch, because a
    // 7 px hatch period inside a 113 px room resolves to noise. Drawn as lines only, a partition
    // reads as a hairline between two flat strips and the band goes back to looking like a plan.
    out.push(`<path d="${poly([a, b, up(b, wall), up(a, wall)])}" fill="${PAPER_FLAT}"`
      + ` stroke="${INK}" stroke-width="${n(W.wall)}" stroke-linejoin="round" opacity="0.92"/>`);
    // ⭐ THE DASHED DOORWAY — the design's own "openings where doors join rooms". It is drawn on the
    // wall's FRONT edge, the part that meets the walkway, because that is where a compartment really
    // opens onto the spine on every authored ship (`--ship wreck`'s halls all door onto it).
    out.push(seg(a, up(a, wall * 0.62), PAPER, W.wall * 1.6, null, 1));
    out.push(seg(a, up(a, wall * 0.62), INK, W.detail, W.door, 0.65));
  }
  return out.join('');
}

/** The walkway's plank ticks and its centre rule — the design's own [533..566], at this scale. */
function walkwayDetail(info) {
  const P = (u, v) => floorPoint(info.plane, u, v);
  const out = [seg(P(0, V_SPINE * 0.55), P(1, V_SPINE * 0.55), INK, 0.5, null, 0.4)];
  const ticks = 17;
  for (let i = 1; i < ticks; i++) {
    const u = i / ticks;
    out.push(seg(P(u, 0), P(u, V_SPINE), INK, 0.4, null, 0.22));
  }
  return out.join('');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 3 — WHAT IS IN A COMPARTMENT: the real fittings, in miniature oblique, standing on the
// deck's own floor plane at the point their own tile projects to.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The attribute every stroke inside a fitting must carry. The design sets it on EVERY element of
 *  every compartment symbol (`Perilune Ship - Drawn.html`, e.g. `data-dc-tpl="12"`). */
const NS = ' vector-effect="non-scaling-stroke"';

/** The shape elements a stroke can live on. */
const SHAPE_TAG = /<(path|rect|circle|ellipse|line|polygon|polyline)\b(?![^>]*vector-effect)/g;

/**
 * ⭐⭐ MAKE A FITTING'S STROKES NON-SCALING. Injected into the builder's own emitted markup rather
 * than authored by the builders, because the builders are the ITEM CATALOGUES' — shared with the
 * catalogue sheets and the Room Zoom, where the pieces are drawn at full size and must NOT have it.
 *
 * ⛔ IT IS NOT COSMETIC, AND THE NUMBER IS THE ARGUMENT. `buildTileItem(id, {w: size, h: size})`
 * emits its geometry under `scale(size/128)`; at the plate's ~20.8 px piece that is `scale(0.163)`,
 * and the builders' authored widths of 0.7–1.8 land at **0.11–0.29 px on screen**. That is a stroke
 * the browser antialiases to a grey suggestion, and it is exactly the failure the live rig's
 * `vector-effect` check was written for.
 *
 * ⚠️⚠️ AND IT WAS ALREADY BROKEN ON VR-P4's PLATE — THE CHECK COULD NOT SEE IT. That rig probed
 * `.ov-mini path` and passed if ANY of them resolved to `non-scaling-stroke`; the compartment
 * SHELL's paths carried it and the FITTINGS' never did, so a guard whose scope included both was
 * satisfied by the half that was fine. (CLAUDE.md's 4th shape: a guard whose scope filter excludes
 * the violation.) The rig now probes `.pl-fit path` alone, which is what surfaced this.
 *
 * PURE and string-local: it only touches shape tags that do not already carry the attribute, so it
 * is idempotent and cannot fight a builder that starts emitting its own.
 */
function nonScaling(fragment) {
  return String(fragment).replace(SHAPE_TAG, (m, tag) => `<${tag}${NS}`);
}

/**
 * THE DECK'S FITTINGS, sorted BACK TO FRONT so nearer pieces overlap further ones.
 *
 * ⛔ THE POSITION IS THE TILE'S OWN, THROUGH THE SAME FUNCTION THE CLICK MAP INVERTS. A piece stands
 * on the floor point its own tile centre projects to, so a press on its footprint designates the
 * tile it is drawn on. VR-P4's send-back was exactly this and its measurement stands as the reason:
 * while the drawing used the oblique and the click map used an axis-aligned box, 57 of 59 drawn
 * fittings clicked a different tile than the one they were drawn on.
 *
 * ⭐ NEEDS-ATTENTION FLIPS THE STROKE TO OXBLOOD (ruling E3), and the predicate is the `marks`
 * channel's own word — a CONDEMNED tile — never a condition compared to a number. Wear is already
 * expressed: `buildTileItem` swaps the piece for its post-raid twin through the one wear join
 * (`items/wear.js`), which is where that threshold lives for both surfaces.
 */
function fittingLayer(info, deck, fittings, attention, size, idPrefix) {
  if (!(fittings instanceof Map) || !fittings.size) return '';
  const pieces = [];
  for (const [key, f] of fittings) {
    const c = key.indexOf(',');
    const tx = +key.slice(0, c), ty = +key.slice(c + 1);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
    // ⭐⭐ EVERY PIECE CARRIES THE COMPARTMENT IT STANDS IN, AND THAT IS A DEFECT THIS PACKAGE
    // CREATED AND CLOSES. VR-P4 drew each compartment's fittings INSIDE its `<g class="pl-room">`
    // (they lived in the tile's own nested `<svg>`), so `target.closest('.pl-room')` found the room
    // from any pixel of any piece. The elevation draws ONE fitting layer per BAND, above the
    // compartments, because the pieces must sort back-to-front across the whole deck floor for the
    // oblique to read — which made every fitting a SIBLING of the rooms and `closest` return null.
    //
    // ⛔ MEASURED IN THE RUNNING GAME, not reasoned: `elementFromPoint` at 50% and 75% of a
    // compartment's height — where its contents stand — returned a fitting path whose
    // `closest('.pl-room')` was null, and only at 90% (bare floor) did it find the room. So a press
    // on a compartment's CONTENTS did not enter it and a hover over them did not wash it, which is
    // most of the compartment's area. `data-anchor` restores the join without moving the drawing;
    // `overview-view.js`'s `roomAnchorOf` is the one reader, shared by the hover and the click.
    //
    // A WALKWAY piece falls in no compartment and carries no anchor — correct, there is no room to
    // enter — and the attribute is simply omitted rather than emitted empty, so a reader cannot
    // mistake '' for a room called ''.
    const span = info.spans.find((sp) => covers(sp.rect, tx, ty));
    const uv = info.uv(tx + 0.5, ty + 0.5);
    if (!uv) continue;
    const [px, py] = floorPoint(info.plane, uv[0], uv[1]);
    // ⭐⭐ THE FACING, CARRIED ON THE FITTING ROW ITSELF (merge with `lane/build-ghost`, 2026-08-05).
    // A device the player turned with [E] must wear ONE picture on both surfaces: the Room Zoom's
    // `standItem` already passes `facing` to `buildTileItem`, so the plate must too, or one machine
    // draws turned in the room and unturned on the plate — the exact divergence `wear-join.test.js`'s
    // shape-parity leg exists to catch. The value comes off `deckFittings`' row (`ship-fittings.js`,
    // which reads the `devices` channel's `face` byte), NOT off a second join here: this layer is
    // sourced from `devices`+`items` rather than from the frame, so there is no `deckDeviceConditions`
    // map left to look a row up in. A ground stack has no facing and carries 0 — what it drew before.
    //
    // ⛔⛔ AND `sketch: false` — THE PLATE'S MINIATURES ARE RAW, AND IT IS A MEASURED DECISION, NOT A
    // TASTE ONE (merge with `lane/sketch-adoption`, 2026-08-05).
    //
    // The adoption applies the `strong` treatment at the `helpers.item()` seam, catalogue-wide, and
    // priced it on the ROOM ZOOM: 7 fittings, 296 → 1102 elements (×3.72), +2.9 ms — "comfortably
    // inside the 16 ms interactive budget", which it is. THIS SURFACE IS A DIFFERENT ORDER OF
    // MAGNITUDE: the elevation draws **86 fittings across two bands** (`--ship wreck`, measured off
    // the live wire: 62 on deck 0, 24 on deck 1) and rebuilds the whole plate on every wire frame at
    // 10 Hz. Measured here, A/B, on the running game — the same plate with this one flag flipped:
    //
    //                           raw          treated       ratio
    //     shape elements        2 953        13 787        ×4.67
    //     DOM nodes (live)      3 776        16 278        ×4.31
    //     bytes                 499 KB       2.91 MB       ×5.83
    //     build ms (node)       6.96         45.37         ×6.52
    //     parse+layout ms       12.1         56.7          ×4.69   (Chrome, median of 12)
    //     ── total per repaint  ~19 ms       ~102 ms       ×5.4
    //
    // ⇒ TREATED, THE PLATE DOES NOT FIT IN ITS OWN WIRE FRAME. 102 ms against a 100 ms 10 Hz budget
    // and a 16 ms interactive one; raw it lands at ~19 ms with five-fold headroom. That is the whole
    // argument.
    //
    // ⭐ AND WHAT IS SPENT BUYS NOTHING HERE, BY THE ADOPTION'S OWN FINDING: `perilune-art-style.md`
    // §4 — *"at 22 px only WEIGHT survives, so a piece must read by silhouette and mass, never by
    // detail"*. This layer's box is `Math.max(10, tileSize * 2.2)` = **20.82 px** on the wreck,
    // BELOW that line. We were paying ×5.4 for wobble nobody can resolve.
    //
    // ⛔⛔ THIS DOES **NOT** MAKE THE PLATE UN-SKETCHY, and the distinction is the reason the flag is
    // narrow. The ARCHITECTURE — hull, deck floor planes, partition walls — is sketched by the
    // COMPOSER's own `sketch()` call further down (the `strong` preset, seeded per deck), not by the
    // catalogue, and it is untouched. Measured: with fittings raw the plate still carries 13 doubled
    // silhouette passes and 0 catalogue ground rules, so the owner's *"it should look sketchier"*
    // (the reason `ship-elevation.js` exists) is kept exactly where it reads and dropped exactly
    // where it is sub-pixel.
    //
    // ⚠️ THE GROUND-RULE QUESTION RIDES FREE, AND IT RIDES FREE BY CONSTRUCTION rather than by
    // agreement. `helpers.item()` is `if (!cfg.sketched || opts.sketch === false) return frag;` — it
    // returns BEFORE `sketch()` is called, so `cfg.ground` is never read at plate scale and the
    // materials' `ground: false` exception has no bearing here either way. (Had the treatment stayed,
    // the knob would have wanted deciding: a plate miniature IS a standing thing, so the pawns' sixth
    // tell applies in principle — but at 20.82 px a rule 2 % of the box is sub-pixel ink laid on top
    // of the band floor the plate already draws under it.) ⛔ A LATER LANE THAT RE-ENABLES THE
    // TREATMENT HERE INHERITS THAT DECISION UNMADE — `overview-scene.test.js` pins both halves.
    const g = nonScaling(
      buildTileItem(f.itemId, { w: size, h: size, idPrefix: `${idPrefix}-f${tx}-${ty}`,
        facing: f.face || 0, sketch: false }, f.cond),
    );
    const attend = attention.has(key);
    pieces.push({
      v: uv[1],
      // ⭐ `data-tile` IS THE PIN'S HANDLE, emitted rather than inferred: it says which tile this
      // piece was DRAWN for, so a test — and the live rig's press census — can take the piece's own
      // base point and require the click map to hand back the same tile.
      // ⭐ `pointer-events="visiblePainted"` — a press on a fitting's own INK designates that
      // fitting's tile (`overview-view.js` `pointToTile` reads `data-tile` first). In an oblique
      // view a piece stands UP off its floor point, so most of a tall locker's body hangs over the
      // tiles BEHIND it; the unpainted gaps fall through to the floor map, which is what makes the
      // two tiers agree rather than fight.
      svg: `<g class="pl-fit" data-tile="${tx},${ty}" data-deck="${deck}"`
        + (span ? ` data-anchor="${esc(span.slot.anchorName)}"` : '')
        + ` pointer-events="visiblePainted"`
        + ` transform="translate(${n(px - size / 2)} ${n(py - size)})"`
        + (attend ? ` stroke="${ATTEND}"` : '') + `>${g}</g>`,
    });
  }
  if (!pieces.length) return '';
  pieces.sort((a, b) => b.v - a.v);
  return `<g class="pl-furniture" pointer-events="none">${pieces.map((p) => p.svg).join('')}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 3b — WHAT IS BOLTED TO THE OUTSIDE: the hull-mounted plant. Owner ruling, 2026-08-06.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The `DeviceKind` byte of every kind in the outboard ledger, DERIVED from the pinned enum mirror
 *  rather than typed.
 *
 *  ⛔ A LEDGER KEY THAT NAMES NO `DeviceKind` IS SILENTLY DROPPED HERE — `indexOf` answers -1 and the
 *  `filter` removes it — so the piece simply never draws, for ever, with nothing red. This comment
 *  used to say that was *"caught by `device-sprite-coverage.test.js`, which asserts every key is a
 *  real member"*, and **that leg did not exist when the sentence was written** (the sibling
 *  `GLYPH_SUBSTITUTE` ledger's does, which is why it read true). It exists now:
 *  `OUTBOARD_ITEM_FOR_KIND: every KEY is a real DeviceKind and every VALUE is real art`, driven RED
 *  by a bogus key. The silent drop is kept deliberately — a composer must not throw on a wire it
 *  does not recognise — and the guard is what makes it safe. */
const OUTBOARD_KIND_BYTES = new Map(
  Object.keys(OUTBOARD_ITEM_FOR_KIND)
    .map((name) => [DEVICE_KIND_NAMES.indexOf(name), OUTBOARD_ITEM_FOR_KIND[name]])
    .filter(([k]) => k >= 0),
);

/** How far an outboard piece's pylon stands the panel off the plating, as a fraction of the piece's
 *  own box. Small on purpose: at the plate's ~21 px piece this is ~3 px of stem, which is enough for
 *  the eye to read "bolted on" and not enough to float the panel in space. */
const OUTBOARD_STEM = 0.16;

/**
 * ⭐⭐ THE HULL-MOUNTED PLANT. *"Solars inside a ship make not a lot of sense"* (owner, 2026-08-06).
 *
 * ⛔ NOTHING IN THE SIM MOVED, AND THAT IS THE WHOLE DISCIPLINE OF THIS LAYER. `--ship wreck` still
 * authors three `SolarWing`s on three reactor-bay tiles, each still generating 6 kW × EffectiveRate
 * that the ship's power budget depends on. A device's TILE is its address — where its feed enters
 * the ship — and a solar panel's address is inboard while the panel itself is not. So this layer
 * ADDS a picture on the hull; it takes nothing away. The kind → art join is still a function of the
 * honest wire bits (`devices` row `kind` → `OUTBOARD_ITEM_FOR_KIND`), the wear join is still the one
 * in `items/wear.js`, and the tile keeps its own drawing on both surfaces (`conduit-run`, the feed).
 *
 * ⚠️ SO THE PLATE DRAWS TWO PIECES FOR ONE DEVICE, DELIBERATELY, and they are not the same picture
 * twice: the tray on the floor is the FEED and the panel on the plating is the WING. They share a
 * `data-tile`, so a press on either enters the same compartment and designates the same tile — which
 * is what makes "two drawings" a description of one machine rather than a duplicate of it.
 *
 * ⭐ THE PIECE CARRIES `data-tile` AND `data-anchor` LIKE ANY OTHER FITTING, so a press on a wing
 * designates the wing's own tile and enters the compartment it is wired to. That is not decoration:
 * the plate's live press census (`client/tools/overview-plate-shot.mjs`) is exhaustive over every
 * drawn `.pl-fit`, and an outboard piece that did not answer for its tile would be a hole in it.
 * The class is `pl-fit` for exactly that reason — one census, one contract, two mounting points.
 *
 * ⚠️ IT DRAWS OUTSIDE `BAY`, WHICH IS OUTSIDE EVERY BAND'S BOX, so `makeShipTransform`'s `hits`
 * refuses these pixels and a press on the paper beside a wing still designates nothing. The wing's
 * own INK is pressable (`visiblePainted`, same as an in-room fitting); the gap around it is not.
 * ⇒ a wing is reachable by clicking the WING, never by clicking near it.
 *
 * @param {object} t the ship transform (needs `outboardPoint`)
 * @param {number} deck
 * @param {Map} fittings the deck's fitting map — outboard rows are REMOVED from it by the caller
 * @param {Map} outboard the rows pulled out, same shape as `fittings`
 * @param {Set} attention condemned tiles ("x,y")
 * @param {Array} spans the deck's slot spans, for `data-anchor`
 */
function outboardLayer(t, deck, outboard, attention, spans, size, idPrefix) {
  if (!(outboard instanceof Map) || !outboard.size) return '';
  const pieces = [];
  for (const [key, f] of outboard) {
    const c = key.indexOf(',');
    const tx = +key.slice(0, c), ty = +key.slice(c + 1);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
    const mount = t.outboardPoint(tx + 0.5, ty + 0.5, deck);
    if (!mount) continue;
    const span = spans.find((sp) => covers(sp.rect, tx, ty));
    const stem = size * OUTBOARD_STEM;
    // ABOVE the skin the piece hangs upward, so its own base point is the top of the stem; BELOW it
    // hangs down, so its base point is the plating and the drawing runs off it. `buildTileItem`
    // emits a piece standing ON its origin's baseline (translate y = base − size), which is why the
    // two arms differ by a whole `size` and not by a sign.
    const y = mount.above ? mount.y - stem : mount.y + stem + size;
    const g = nonScaling(
      buildTileItem(f.itemId, { w: size, h: size, idPrefix: `${idPrefix}-o${tx}-${ty}`,
        facing: f.face || 0, sketch: false }, f.cond),
    );
    const attend = attention.has(key);
    // The pylon: one short stroke from the plating to the piece's own edge, so the panel is bolted
    // to the ship rather than floating beside it. Authored here rather than in the catalogue because
    // it is a fact about MOUNTING, not about the machine — the same piece drawn on a catalogue sheet
    // has no hull to stand off.
    const py0 = mount.y;
    const py1 = mount.above ? mount.y - stem : mount.y + stem;
    pieces.push(`<g class="pl-fit pl-outboard" data-tile="${tx},${ty}" data-deck="${deck}"`
      + (span ? ` data-anchor="${esc(span.slot.anchorName)}"` : '')
      + ` pointer-events="visiblePainted"`
      + (attend ? ` stroke="${ATTEND}"` : '') + '>'
      + `<path d="M${n(mount.x)} ${n(py0)} L${n(mount.x)} ${n(py1)}" fill="none"`
      + ` stroke="${attend ? ATTEND : INK}" stroke-width="1.1" vector-effect="non-scaling-stroke"/>`
      + `<g transform="translate(${n(mount.x - size / 2)} ${n(y - size)})">${g}</g>`
      + `</g>`);
  }
  if (!pieces.length) return '';
  return `<g class="pl-outboard-layer" pointer-events="none">${pieces.join('')}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The compartment as a CLICKABLE REGION + its state treatments.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The 45° oxblood hatch the design fills an unsurveyed compartment with (`#dmgb`, [8]). One def per
 *  document, id-prefixed so two scenes in one page cannot collide. */
function hatchDef(id) {
  return `<defs><pattern id="${id}-dmgb" width="7" height="7" patternUnits="userSpaceOnUse"`
    + ` patternTransform="rotate(45)"><rect width="7" height="7" fill="${PAPER}"/>`
    + `<path d="M0 0 L0 7" stroke="${ATTEND}" stroke-width="1.1" opacity="0.5"/></pattern></defs>`;
}

/**
 * ONE COMPARTMENT — the pressable region, its state treatment and its caption handle.
 *
 * `data-anchor` is what `overview-view.js`'s `hitTest` reads (unchanged, so a click still enters the
 * room); `data-deck` is NEW and is what lets a press on the deck the host is not projecting say so
 * (see `overview-view.js`'s `onScenePointerUp` — a compartment on the other deck moves the ORDER
 * DECK rather than silently ordering on the wrong one). `data-purpose` is the predicate the amber
 * glow pool used to carry (`roomType`).
 *
 * THE STATE TREATMENTS, and they are the dash dialect, not new vocabulary:
 *   purposed     — the compartment's floor is solid paper; its partitions are solid ink.
 *   unpurposed   — the UNBUILT dash (`"6 5"`), the design's third tile.
 *   attention    — OXBLOOD `"8 5"` around the whole region: this compartment holds a crew member
 *                  whose order the ship cannot run (D5) or a condemned piece. ⭐ THIS IS D5's BADGE
 *                  AND THE BLOCKED-ORDER SCRIM RE-HOUSED (ruling E4).
 *   selected     — a 2.2 px ink outline of the same region.
 *   unsurveyed   — the design's hatched CROSS-BOX: the `#dmgb` fill plus its two diagonals.
 *   hovered      — `pl-room-hover`, which the stylesheet washes the floor with.
 *
 * ⛔⛔ HOVER IS A COMPOSER INPUT, NOT A CSS `:hover`, AND THAT IS AN OWNER-REPORTED DEFECT CLOSED
 * RATHER THAN A PREFERENCE. The owner: *"when I am on the ship level and hover my mouse for 2-3
 * seconds above one of the rooms, that room starts flickering."* The mechanism, measured on the live
 * host: `paintScene` assigns the whole plate to `_stage.innerHTML` on every wire repaint, and the
 * `frame` channel lands every ~1 s even on a QUIET ship (20 messages in 20 s, median gap 1000 ms,
 * p90 1098 ms — measured 2026-08-05 on `--ship wreck`). So the hovered element is DESTROYED under a
 * stationary cursor about a second after the hover begins; Chrome re-evaluates `:hover` from pointer
 * MOVEMENT, so across a rebuild the state drops and does not come back until the mouse moves. The
 * highlight then oscillates at repaint cadence. The 2–3 s onset the owner reports is the first
 * repaint after the hover plus the eye noticing the second one.
 *
 * ⭐ THE FIX IS THAT THE STATE LIVES WHERE IT SURVIVES THE REBUILD. `overview-view.js` tracks the
 * hovered anchor from `pointerover`/`pointerout` and hands it in here exactly like `selectedAnchor`;
 * every repaint re-emits the class from that state, so a stationary hover is bit-identical across
 * arbitrarily many repaints and CANNOT blink. It is also the only shape that keeps the composer pure
 * and node-testable — a class re-applied to the DOM after `innerHTML` would be a second writer.
 *
 * ⚠️ AND THE `:hover` RULE HAD ALREADY STOPPED MATCHING IN THIS LANE, SILENTLY. It read
 * `.pl-room:hover rect:first-child` — VR-P4's compartment opened with a `<rect>` border. The
 * elevation's opens with `<path class="pl-cfloor">`, so the selector matched NOTHING and the plate
 * had no hover affordance at all. Two defects, one fix; the stylesheet now keys on the CLASS and on
 * `.pl-cfloor`, both of which the composer emits and a test can read.
 *
 * ⛔ THE PURPOSE STATE IS `roomType` AND NOTHING ELSE. It deliberately does NOT ask `slot.occupied`:
 * M1-L widened that flag to "this slot's walls enclose a real room", which is TRUE FOR EVERY SLOT ON
 * EVERY SHIPPED SHIP, so a reader of it is a constant dressed as a predicate — and
 * `no-add-room.test.js` census-pins that this module never reads it again.
 */
function compartment(info, span, deck, opts, id) {
  const o = opts || {};
  const hovered = !!o.hovered;
  const slot = span.slot;
  const purposed = !!(slot && slot.roomType);
  const state = purposed ? 'built' : 'unbuilt';
  const P = (u, v) => floorPoint(info.plane, u, v);
  const wall = info.plane.wall;
  // The pressable VOLUME: the compartment's floor parallelogram plus the wall standing behind it.
  const region = poly([P(span.u0, V_SPINE), P(span.u1, V_SPINE), P(span.u1, 1), P(span.u0, 1)]);
  const volume = poly([
    P(span.u0, V_SPINE), P(span.u1, V_SPINE), P(span.u1, 1),
    up(P(span.u1, 1), wall), up(P(span.u0, 1), wall), P(span.u0, 1),
  ]);
  let g = '';
  // The floor face. An UNPURPOSED compartment gets no fill and a dashed outline — the design's own
  // third tile — so a deck the ship never gave a purpose to reads as drawn-but-empty rather than as
  // a room whose contents are missing.
  g += `<path class="pl-cfloor" d="${region}" fill="${purposed ? PAPER : 'none'}"`
    + ` stroke="${INK}" stroke-width="${purposed ? 0.7 : 1}"`
    + (purposed ? '' : ' stroke-dasharray="6 5" opacity="0.55"') + `${NS}/>`;
  if (o.unsurveyed) {
    // THE HATCHED CROSS-BOX. The contents are NOT drawn under it (the caller skips them), because a
    // hatch over a drawing says "damaged" and this says "nobody has been in here".
    const dl = P(span.u0, V_SPINE), dr = P(span.u1, 1);
    const dl2 = P(span.u0, 1), dr2 = P(span.u1, V_SPINE);
    g += `<path d="${volume}" fill="url(#${id}-dmgb)" stroke="none" opacity="0.85"/>`
      + seg(dl, dr, INK, 1, null, 0.5) + seg(dl2, dr2, INK, 1, null, 0.5);
  }
  if (o.attention) g += `<path d="${volume}" fill="none" stroke="${ATTEND}" stroke-width="1.4" stroke-dasharray="8 5"${NS}/>`;
  if (o.selected) g += `<path d="${volume}" fill="none" stroke="${INK}" stroke-width="2.2"${NS}/>`;
  // The hit surface, last so it takes the pointer: transparent, exactly the drawn volume.
  g += `<path class="pl-chit" d="${volume}" fill="transparent" stroke="none"/>`;
  return `<g class="pl-room${o.selected ? ' pl-room-sel' : ''}${o.attention ? ' pl-room-attend' : ''}`
    + `${o.unsurveyed ? ' pl-room-dark' : ''}${hovered ? ' pl-room-hover' : ''}" data-slot="${slot.slotIndex}"`
    + ` data-anchor="${esc(slot.anchorName)}" data-deck="${deck}"`
    + ` data-purpose="${purposed ? 1 : 0}" data-state="${state}">${g}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 4 — DEBRIS + DESIGNATION MARKS, drawn through the SAME projection so a mark lands on the
// tile that really holds it.
//
// ⚠️ IT DOES NOT READ THE FRAME. `GlyphMapper` writes `cell[1]` in pass 1 and OVERWRITES it in
// passes 3/4/5, so a crew member walking over a designation made its mark blink out. The kinds come
// from the sim's own registries over the wire, decoded once by `overview-view.js` and handed in.
// ⭐ AND NOW EVERY DECK: the `marks` channel has always carried `deck`, and with both decks drawn a
// designation on the other one is finally visible.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function markLayer(marks, t) {
  if (!Array.isArray(marks) || !marks.length) return '';
  const out = [];
  for (const m of marks) {
    if (!m) continue;
    const deck = m.deck | 0;
    if (!t.deckInfo(deck)) continue;
    const r = t.rect({ x: m.x, y: m.y, w: 1, h: 1 }, deck);
    const g = markCellSvg(m.mark, r.x, r.y, r.w, r.h, markVariant(m.x, m.y));
    if (g) out.push(g);
  }
  return out.length ? `<g class="pl-marks" pointer-events="none">${out.join('')}</g>` : '';
}

/** Build ghosts — wire-backed placement markers, on any deck. THE DASH DIALECT'S QUEUED ORDER:
 *  oxblood "8 5" (charter §1). */
function ghostLayer(designs, t) {
  const cells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  const out = [];
  for (const c of cells) {
    if (!Array.isArray(c)) continue;
    const deck = c[2] | 0;
    if (!t.deckInfo(deck)) continue;
    const r = t.rect({ x: c[0], y: c[1], w: 1, h: 1 }, deck);
    const glyph = c[3] === 1 ? '/' : '#'; // door / wall
    out.push(`<g class="pl-ghost">`
      + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="none"`
      +   ` stroke="${ATTEND}" stroke-width="1.2" stroke-dasharray="8 5"/>`
      + `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" font-size="${n(Math.max(5, r.h * 0.7))}"`
      +   ` fill="${ATTEND}" text-anchor="middle" dominant-baseline="central"`
      +   ` font-family="${FONT.mono}">${esc(glyph)}</text></g>`);
  }
  return out.length ? `<g class="pl-ghosts" pointer-events="none">${out.join('')}</g>` : '';
}

/** Terminals — clickable MOSS console chips, one per terminal device, on EVERY drawn deck. Carries
 *  `data-tid` so the click routes straight to that terminal's MOSS program. */
function terminalLayer(terminals, t) {
  const list = Array.isArray(terminals) ? terminals : [];
  const out = [];
  for (const term of list) {
    if (!term) continue;
    const deck = term.deck | 0;
    if (!t.deckInfo(deck)) continue;
    const [cx, cy] = t.project(term.x + 0.5, term.y + 0.5, deck);
    if (!Number.isFinite(cx)) continue;
    const w = Math.max(9, t.tileSize * 1.8), h = w * 0.72;
    const x = cx - w / 2, y = cy - h * 0.7;
    out.push(`<g class="pl-terminal" data-tid="${esc(term.tid)}" data-deck="${deck}">`
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
// Layer 5 — THE INK CREW MARKERS: one two-pass figure per crew member, standing in the compartment
// she is in, on WHICHEVER DECK that is, each wearing her identity + WORK label.
//
// THE WORK MARKER (console-retirement plan §1(b) B4) SURVIVES UNCHANGED IN MEANING: the tag half
// appears ONLY for a crew member doing a job AT A PLACE. Idle, merely walking and *en route* crew get
// no tag — `taskTag` returns null for all three, and the ABSENCE is the information.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** How far each de-clutter row lifts a label, in design px (a pill is 11 tall, so 12 leaves 1 of air). */
const LABEL_ROW_STEP = 12;
/**
 * Rows the sweep may stack before it gives up.
 *
 * ⚠️ IT WAS 8 — "one row per crew member in the densest room" — and VR-P4's plate made that too few,
 * measured rather than guessed: eight pawns in one ~190 × 70 px tile alias against a 12 px row step,
 * so the sweep must skip rows to miss them and ran out. 16 is 8 rows plus the aliasing headroom.
 * ⚠️ THE ELEVATION MAKES A COMPARTMENT NARROWER AND SHALLOWER STILL (the wreck's are ~93 × 52 px
 * against the grid's ~190 × 70), so the crowding this constant answers got WORSE, not better; the
 * crowded case is still reachable (its own test drives `LABEL_MAX_ROWS + 4` labels at one x).
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
 *  written down: `pawnLayerParts` emits from it too, so the sweep cannot reason about a different
 *  box than the one on screen. */
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
 * A greedy sweep in PRIORITY order — WORKING crew first, then by cid — takes the lowest row whose
 * rect misses every rect already claimed. Priority is what makes the result principled: the work tags
 * are the honesty affordance, so they get the legible rows, and anything that has to give way is an
 * idle crew member's name, which the CREW WATCH dock also carries.
 *
 * THE OCCUPANCY TEST IS 2-D, and it has to be: each pill hangs off its OWN pawn's feet (`baseY`), so
 * "same row" neither implies nor is implied by "same height", and a sweep that compared only
 * horizontal spans within a row index certified a genuinely overlapping pair as clean. It did —
 * measured off the emitted rects.
 *
 * ⭐ AND WITH BOTH DECKS DRAWN IT NOW SWEEPS ACROSS DECKS TOO, which is correct and is the reason the
 * sweep was never keyed by deck: two pawns on two decks are two marks on ONE sheet of paper, and the
 * bands are ~26 px apart while a lifted pill is 11 px tall — so a label lifted off a lower-deck pawn
 * really can collide with an upper-deck one, and a per-deck sweep would certify that pair as clean.
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

/**
 * ⭐⭐ THE PLATE'S PAWNS, AS FOOT-RELATIVE PARTS — one entry per drawn crew member, each carrying the
 * projected foot point and the markup drawn AROUND (0,0). PURE.
 *
 * ⛔ IT RETURNS PARTS, NOT A STRING, and `overviewScene` emits none of it: `paintScene` assigns the
 * whole scene to `innerHTML` ~10×/s, so no pawn node inside it would survive long enough to move
 * between two roster messages. The nodes live in the surface's persistent overlay instead
 * (`pawn-layer.js`). This function is the ONE builder of that art; `overview-scene.test.js` guards
 * that `overviewScene` emits no `pl-pawn` at all.
 *
 * ⭐⭐⭐ THE DECK FILTER IS GONE, AND THAT IS THE PACKAGE'S BIGGEST BEHAVIOURAL CHANGE TO THIS LAYER.
 * VR-P4 dropped every crew member whose `deck` was not the shown one, and its own comment recorded
 * why that was safe: *"no figure ever glides between decks, which on a plate that draws one deck at
 * a time would be a slide across the whole ship."* **Both premises are now false.** The plate draws
 * every deck, so a crew member on the other one is standing in a compartment the player can SEE, and
 * omitting her would be the "invisible feedback is functional" defect — the ship would report N
 * souls aboard and draw fewer.
 *
 * ⚠️ AND THE LADDER STEP IS STILL NOT A GLIDE, because the tween already refuses it: rule 2 of
 * `pawn-tween-model.js` SNAPS on a change of deck, by name, and that rule predates this package. So a
 * crew member climbing between decks appears at her new band rather than sliding diagonally across
 * the hull. The membership contract in `WireFormat.RosterEntry.Fx` is unchanged and still binds: a
 * deck cannot go fractional (a ladder step keeps X/Y), the ORDER TARGET keeps the integer tile, and
 * everything DRAWN follows the glide.
 *
 * @param {Array} crew the roster — EVERY deck; the transform decides who can be placed.
 * @param {object} t `makeShipTransform` output.
 * @returns {Array<{cid:*, x:number, y:number, deck:number, html:string}>} in roster order.
 */
export function pawnLayerParts(crew, t, selectedCid, id) {
  const list = Array.isArray(crew) ? crew : [];
  const pawns = [];
  for (const c of list) {
    if (!c) continue;
    const deck = c.deck | 0;
    // A crew member on a deck this transform does not draw simply does not render. That is a real
    // case (a ship whose `decks` channel has not landed yet), not a deck filter.
    if (!t.deckInfo(deck)) continue;
    // ⭐ THE GLIDE. `fx`/`fy` are the wire's sub-tile walk position in the SAME coordinate space as
    // `x`/`y` (a tile coordinate, no centre offset — `WireFormat.RosterEntry.Fx` writes the
    // convention down once), so the `+ 0.5` that puts the feet on the tile CENTRE is applied here
    // exactly as it always was. An older host omits them and the integer tile is used, which is also
    // what a standing crew member serializes (`fx === x`), so the fallback is never a jump.
    const gx = Number.isFinite(c.fx) ? c.fx : c.x;
    const gy = Number.isFinite(c.fy) ? c.fy : c.y;
    const [fx, fy] = t.project(gx + 0.5, gy + 0.5, deck);
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue;
    const S = Math.max(0.5, t.tileSize * 2.6 / 24);   // pawn box ≈ 2.6 tiles tall (viewBox 24)
    const sur = surnameOf(c.name);
    const tag = taskTag(c.task);                      // null ⇒ idle / walking / en route (no tag)
    const text = tag ? sur + ' · ' + tag : sur;
    pawns.push({
      c, fx, fy, S, sur, tag, deck,
      cid: c.cid, cx: fx, working: tag != null,
      baseY: fy - 24 * S - 4,
      w: Math.max(16, text.length * 5 + 8),
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
    // FOOT-RELATIVE FROM HERE DOWN: the feet are the origin, and the group's own `translate` (set by
    // `pawn-layer.js`, 60×/s) carries the pair below into place. The two zeros are the old `fx`/`fy`.
    const bx = 0, by = 0;
    let g = '';
    if (selected) {
      // ⚠️ SELECTION IS A RULE, NOT A GLOW — a solid ink underline through the figure's feet, which
      // needs no `<defs>` at all, and the compartment's own 2.2 px outline says which room she is in.
      g += `<path d="M${n(bx - S * 7)} ${n(by + S * 1.5)} L${n(bx + S * 7)} ${n(by + S * 1.5)}"`
        + ` stroke="${INK}" stroke-width="${n(Math.max(1, S * 1.2))}" fill="none"/>`;
    }
    // seat the pawn so its feet (local 8,23 in the 16×24 viewBox) land on the group's origin
    g += `<g transform="translate(${n(bx - 8 * S)} ${n(by - 23 * S)}) scale(${n(S)})">${body}</g>`;
    const lay = layout.get(String(c.cid)) || { row: 0, crowded: false };
    // The sweep's `baseY` is ABSOLUTE (it had to be — see `layoutPawnLabels`); the emission is the
    // same quantity measured from this pawn's own feet, which is exactly `baseY - fy`.
    const baseY = p.baseY - fy;
    const tagY = baseY - lay.row * LABEL_ROW_STEP;
    const cls = 'pl-tag' + (p.tag ? ' pl-tag-work' : '') + (lay.crowded ? ' pl-tag-crowded' : '');
    g += `<g class="${cls}">`
      + (lay.row > 0
        ? `<line x1="${n(bx)}" y1="${n(tagY + 3)}" x2="${n(bx)}" y2="${n(baseY + 3)}" stroke="${INK}" stroke-width="0.7" opacity="0.45"/>`
        : '')
      + `<rect x="${n(bx - p.w / 2)}" y="${n(tagY - LABEL_PILL_RISE)}" width="${n(p.w)}" height="${LABEL_PILL_H}" fill="${PAPER}" stroke="${INK}" stroke-width="0.7"/>`
      + `<text x="${n(bx)}" y="${n(tagY - 2)}" font-size="7.5" letter-spacing=".5" fill="${INK}" text-anchor="middle" dominant-baseline="central" font-family="${FONT.mono}">`
      + `${esc(p.sur)}`
      + (p.tag ? `<tspan fill="${ATTEND}"> · ${esc(p.tag)}</tspan>` : '')
      + `</text></g>`;
    out.push({ cid: c.cid, x: fx, y: fy, deck: p.deck, html: g });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The composer.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The tiles carrying a fault mark, as `"x,y"` keys per deck — the fittings' oxblood flip. */
function attentionTiles(marks, deck) {
  const out = new Set();
  for (const m of (Array.isArray(marks) ? marks : [])) {
    if (!m || (m.deck | 0) !== (deck | 0)) continue;
    if (m.mark === 'condemn') out.add(m.x + ',' + m.y);
  }
  return out;
}

/** True when tile (tx,ty) lies inside the rect. */
function covers(rect, tx, ty) {
  return !!rect && rect.w > 0 && rect.h > 0
    && tx >= rect.x && tx < rect.x + rect.w && ty >= rect.y && ty < rect.y + rect.h;
}

/**
 * The anchors that carry an ATTENTION treatment. PURE — derived from the same `blocked` rows the
 * `compartments` column words, so the compartment and the sentence cannot disagree (ruling E4).
 *
 * ⛔ THE SECOND SOURCE IS THE `marks` CHANNEL, AND DROPPING IT WAS A REGRESSION THIS PACKAGE
 * BRIEFLY SHIPPED. A compartment holding a CONDEMNED tile is in trouble too, and its only other
 * signal is the mark itself — which at plate scale is a few px of ✕ inside a ~93 px compartment,
 * too small to find without the outline saying so. VR-P4 derived it here; the elevation's first cut
 * lost it in the rewrite and `overview-scene.test.js`'s own D5 leg caught it.
 *
 * ⭐ AND THE TWO ARMS HAVE DIFFERENT DECK SCOPES ON PURPOSE. It is worth spelling out, because with
 * both decks drawn the asymmetry is visible and would otherwise look like a bug:
 *
 *   · THE CONDEMN ARM IS ALL-DECK. A condemned tile's ✕ is DRAWN on whichever band it is on, so the
 *     outline is pointing at something the player can already see; it is telling them where to look,
 *     not making a claim they cannot check. The mark is matched against the slot rects of ITS OWN
 *     deck, so a condemned piece on the lower band accents the lower band's compartment rather than
 *     a same-coordinates compartment on the active one.
 *   · THE STUCK-ORDER ARM (`attentionAnchors`, D5) FOLLOWS THE ORDER DECK, because it arrives from
 *     `compartmentLines(dView, activeDeck, …)` — the SAME derivation that words the oxblood sentence
 *     in the `compartments` column. That pairing is the point of ruling E4: the outline and the
 *     sentence are one row rendered twice. Widening the outline to both decks without widening the
 *     column would put a warning on the plate that NOTHING anywhere explains, which is D5's own
 *     defect inverted — the package existed to make the ship say WHY an order is stuck.
 *
 * ⚠️ SO THE LIMIT, STATED RATHER THAN HIDDEN: a stuck order on the band that is not the order deck
 * shows no outline until the player steps to that deck. FILED for the owner — closing it means
 * deciding whether the `compartments` column becomes ship-wide, which is a design question about a
 * prose column's length, not a bug in this layer.
 */
function attentionAnchors(state, t) {
  const out = new Set();
  for (const a of (Array.isArray(state.attentionAnchors) ? state.attentionAnchors : [])) {
    if (a) out.add(String(a));
  }
  for (const m of (Array.isArray(state.marks) ? state.marks : [])) {
    if (!m || m.mark !== 'condemn') continue;
    const info = t.deckInfo(m.deck | 0);
    if (!info) continue;
    for (const sp of info.spans) if (covers(sp.rect, m.x, m.y)) out.add(String(sp.slot.anchorName));
  }
  return out;
}

/**
 * Build the whole Level-1 ship plate as one self-contained SVG string. PURE — same `state` yields a
 * byte-identical result.
 *
 * @param {object} state
 * @param {number} state.deck        the ACTIVE deck — the one orders land on. It no longer decides
 *                                   what is DRAWN (every deck is), only what is marked active.
 * @param {Array}  state.decksView   `decksView(decks, rooms)` output — [{deck, slots:[…]}], all decks.
 * @param {object} [state.frame]     the frame message. ⚠️ ITS CELLS ARE NO LONGER THE FITTING SOURCE
 *                                   (see `ship-fittings.js`); only its `w`/`h` (the walkway's extent)
 *                                   and its FOG are read, and fog is available for its own deck only.
 * @param {Array}  [state.devices]   `decodeDevices` output — ALL decks. THE fitting source.
 * @param {Array}  [state.items]     `decodeItems` output — ALL decks. The ground-stack half of it.
 * @param {Array}  [state.designs]   build-ghost design cells (or a {cells} message).
 * @param {Array}  [state.terminals] MOSS terminal directory [{tid,deck,x,y}] — clickable chips.
 * @param {Array}  [state.marks]     decoded `marks` cells. NOT derived from `frame`.
 * @param {string[]} [state.attentionAnchors] anchors whose compartment needs attention (D5, E4).
 * @param {*}      [state.selectedCid]    the selected crew cid.
 * @param {string} [state.selectedAnchor] the compartment drawn with the selected outline.
 * @param {string} [state.hoverAnchor]    the compartment the pointer is over. ⛔ IT IS AN INPUT AND
 *                                   NOT A CSS `:hover` — see `compartment`'s header for the
 *                                   owner-reported flicker that makes this load-bearing.
 * @param {string} [state.lens]      the active lens (recorded on the root for the wash overlay).
 * @param {string} [state.idPrefix]  def-id namespace (default 'ov') so many scenes can coexist.
 * @returns {string} an `<svg>…</svg>` document string.
 */
export function overviewScene(state) {
  const st = state || {};
  const id = st.idPrefix || 'ov';
  const active = st.deck | 0;
  const views = Array.isArray(st.decksView) ? st.decksView : [];
  const t = makeShipTransform(views, st.frame);
  const attend = attentionAnchors(st, t);
  const surveyed = surveyedDecks(st.frame);

  const decks = [];
  for (const deck of t.deckOrder) {
    const raw = t.deckInfo(deck);
    if (!raw) continue;
    // A per-deck view of the transform: `uv` is the SAME `tileUV` the projection and its inverse use.
    const info = {
      plane: raw.plane, band: raw.band, spans: raw.spans,
      uv: (tx, ty) => t.tileUV(tx, ty, deck),
    };
    const fog = fogTiles(st.frame, deck);
    const faults = attentionTiles(st.marks, deck);
    const fittings = deckFittings(st.devices, st.items, deck);
    // ⭐⭐ THE OUTBOARD SPLIT, AND IT HAPPENS HERE SO IT HAPPENS ONCE.
    //
    // ⛔⛔ IT IS A **COPY, NOT A MOVE**, AND THE FIRST CUT OF THIS PACKAGE GOT THAT WRONG. Deleting
    // the row from `fittings` looked right — one machine, one drawing — and it made the plate the
    // ONE surface on which a SolarWing tile drew nothing at all. Two guards caught it and both were
    // right to: `device-sprite-coverage.test.js`'s *"a piece with real art is filtered out before it
    // can be drawn"* named `conduit-run`, and *"the Overview COMPOSER draws furniture for every
    // covered kind"* named `SolarWing (kind 5)`.
    //
    // ⇒ THE TWO DRAWINGS ARE TWO DIFFERENT THINGS AND BOTH ARE TRUE. The TILE carries the wing's
    // FEED — the conduit run its cable comes into the ship through, which is what the sim's position
    // actually addresses — and the HULL carries the panel. The owner's sentence is *"solars inside a
    // ship make not a lot of sense"*; a cable tray inside a ship makes complete sense, and the tile
    // must stay occupied, pressable and honest on BOTH surfaces (that is the ruling's own second
    // clause, and it is the property `wear-join.test.js`'s shape-parity leg protects).
    //
    // `f.ground` guards the pull: a ground STACK has no `DeviceKind` — its `kind` byte is an
    // `ItemKind` — so without it a stack whose `ItemKind` happens to equal `DeviceKind.SolarWing`
    // (5) would be flung onto the hull.
    const outboard = new Map();
    if (OUTBOARD_KIND_BYTES.size) {
      for (const [key, f] of fittings) {
        if (f.ground) continue;
        const itemId = OUTBOARD_KIND_BYTES.get(f.kind | 0);
        if (!itemId) continue;
        outboard.set(key, { ...f, itemId });
      }
    }
    // A compartment nobody has ever entered draws no contents — see `slotUnsurveyed`. Its tiles are
    // dropped from the fitting map so the hatch is not laid over a drawing.
    const dark = new Set();
    for (const sp of raw.spans) {
      if (slotUnsurveyed(fog, sp.rect)) dark.add(sp.index);
    }
    if (dark.size) {
      // ⚠️ BOTH MAPS, and it is the same rule for the same reason: a compartment nobody has entered
      // draws no contents, and a wing bolted to the hull outside an unentered compartment is that
      // compartment's contents. Sweeping only `fittings` would have left the plate announcing the
      // ship's generators through a hatch that says nothing is known about the room.
      for (const map of [fittings, outboard]) {
        for (const key of Array.from(map.keys())) {
          const c = key.indexOf(',');
          const tx = +key.slice(0, c), ty = +key.slice(c + 1);
          if (raw.spans.some((sp) => dark.has(sp.index) && covers(sp.rect, tx, ty))) map.delete(key);
        }
      }
    }
    const rooms = raw.spans.map((sp) => compartment(info, sp, deck, {
      selected: st.selectedAnchor != null && String(st.selectedAnchor) === String(sp.slot.anchorName),
      // ⭐ THE HOVER SURVIVES THE REBUILD because it arrives as STATE, exactly like the selection.
      // See `compartment`'s header for the owner-reported flicker this closes.
      hovered: st.hoverAnchor != null && String(st.hoverAnchor) === String(sp.slot.anchorName),
      attention: attend.has(String(sp.slot.anchorName)),
      unsurveyed: dark.has(sp.index),
    }, id)).join('');
    const art = sketch(deckArchitecture(info) + walkwayDetail(info),
      { level: 'strong', seed: `perilune-deck-${deck}` });
    decks.push(`<g class="pl-deck" data-deck="${deck}" data-active="${deck === active ? 1 : 0}"`
      + ` data-survey="${surveyed.indexOf(deck) >= 0 ? 1 : 0}">`
      + `<g class="pl-arch" pointer-events="none">${art}</g>`
      + `<g class="pl-rooms">${rooms}</g>`
      // ⭐ 2.2 TILES, which is the design's own ~20 px piece in a 126 px room. See `tileSize`'s
      // header in `ship-elevation.js` for why that number is the ACROSS span and not the min of the
      // two axes — taking the min drew every compartment empty.
      + fittingLayer(info, deck, fittings, faults, Math.max(10, t.tileSize * 2.2), `${id}-d${deck}`)
      // ⭐ THE HULL-MOUNTED PLANT, at the SAME piece size as everything else on the plate. Sized
      // larger it would overlap: the wreck's three wings sit two tiles apart on a 12-tile bay, which
      // is 18.9 plate px between mounts against a 20.8 px box. One size keeps the ship's own scale
      // honest and keeps three panels legible as three.
      + outboardLayer(t, deck, outboard, faults, raw.spans,
        Math.max(10, t.tileSize * 2.2), `${id}-d${deck}`)
      + `</g>`);
  }

  // The paper ground + the drifting ink starfield are NOT drawn here: they live in the persistent
  // `.ov-space` skeleton layer (starLayerSvg + CSS) so the drift survives the scene's repaints.
  const body = ''
    + hatchDef(id)
    + hullLayer()
    + decks.join('')
    // `markLayer` sits ABOVE the compartments (whose own `pl-furniture` is inside them) — the same
    // order, for the same reason, as the Room Zoom's: a condemned DEVICE carries fg 26, and beneath
    // its own fitting its ✕ would be invisible.
    + markLayer(st.marks, t)
    + ghostLayer(st.designs, t)
    + terminalLayer(st.terminals, t);
  // ⛔ NO PAWN LAYER HERE, AND ITS ABSENCE IS THE POINT. The figures are built by `pawnLayerParts`
  // and mounted into a PERSISTENT overlay `<svg>` this string is never assigned into — because
  // `paintScene` does `innerHTML = svg` ~10×/s and a node destroyed ten times a second cannot be
  // interpolated between two roster samples. The old layer-order guarantee ("a crew member is never
  // hidden by a mark, a ghost or a wash") did not weaken: the overlay is a LATER SIBLING of the scene
  // mount, so it is above every layer in this document unconditionally.

  return `<svg class="pl-overview" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet"`
    + ` xmlns="http://www.w3.org/2000/svg" data-deck="${active}" data-decks="${t.deckOrder.join(' ')}"`
    + ` data-lens="${esc(st.lens || 'none')}">`
    + body + `</svg>`;
}

export default overviewScene;
