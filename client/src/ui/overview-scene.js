// The LEVEL-1 OVERVIEW SVG SCENE — the warm ship-deck schematic. A PURE, DOM-free composer that
// turns one captured wire snapshot (frame + decks/rooms view + roster + designs) into a single
// self-contained SVG string: the hull silhouette, the 8-slot compartment grid
// with material floors + amber trim-light + glow-pools, the deck's furniture, and the front-facing
// crew pawns. No DOM, no clock, no randomness beyond the spec's seeded starfield — same `state`
// yields a byte-identical string.
//
// Authority: docs/design/perilune-overview.visual-spec.md (VS-O-*) + the warm mock
// (docs/design/perilune-game-ui-warm.dc.html). This module owns ONLY the Level-1 SVG scene; the
// floating HUD islands, click wiring, and Level-2 room-zoom are OTHER lanes and are not built here.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COORDINATE CONTRACT (one transform, shared by slots + furniture + pawns + click-mapping)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sim/frame TILE space (the space SlotDescriptor rects, frame.crew x/y, and frame cells all live
// in) maps to the scene's 1300×561 design viewBox by an AXIS-INDEPENDENT affine transform onto the
// hull's deck-floor envelope (VS-O-25's slot-template bounds):
//
//     sx = DECK.x + (tx - ext.minX) * KX ,   KX = DECK.w / (ext.maxX - ext.minX)
//     sy = DECK.y + (ty - ext.minY) * KY ,   KY = DECK.h / (ext.maxY - ext.minY)
//
// where DECK = {x:205, y:168, w:705, h:234} (the union of the fixed A0..B3 template rects), and
// `ext` is the tile bounding box of the rendered deck's slots (normally 0,0 → frame.w,frame.h).
// Slots, furniture, pawns and (for the later integration lane) click hit-testing ALL go through
// `t.project(tx,ty)`; the inverse `t.invert(sx,sy)` recovers the tile the pixel fell in. The scale
// is deliberately non-uniform (a schematic, not a perspective view); item + pawn art is sized off
// min(KX,KY) so pieces stay square while their POSITION uses the full transform.

import { buildItem } from '../items/index.js';
// THE WEAR JOIN — the ONLY door from a surface to the 70 post-raid twins. The threshold and its
// justification live in `client/src/items/wear.js`, once, for both surfaces: a second copy of
// "below what condition does a tile wear its twin?" is how the two SVG views would come to disagree
// about the same machine, each agreeing with itself and every test green.
import { buildTileItem } from '../items/wear.js';
import { pawnSprite } from '../render/pawn-svg.js';
// The ONE glyph → itemId derivation, straight out of the `ITEMS` registry and SHARED verbatim with
// the Level-2 Room Zoom (`room-model.js` itemForGlyph), so the two SVG surfaces cannot come to skin
// the same glyph differently. (It used to be `SPRITE_FOR_GLYPH` plus a local hand mirror.)
import { itemIdForGlyphChar } from '../items/glyph-map.js';
// The work-tag classifier (console-model.js is misnamed, not console-only — see the retirement plan
// §1: `taskTag` is a PURE roster-label → tag mapping and is the SAME source the console's on-map
// WORK markers used, so the two surfaces cannot disagree about who is working).
import { taskTag } from './console-model.js';
// The debris/designation mark vocabulary (console-retirement WP-2). SHARED verbatim with the Level-2
// Room Zoom (`room-model.js` markLayerSvg) so one mark kind cannot come to mean two different
// things on the two surfaces — see mark-overlay.js's header for why it is its own module.
// ⚠️ `markForFg` is GONE (the `marks` channel): the kind now arrives on the wire, decoded once by the
// view and handed in. The vocabulary — which mark looks like what — is unchanged.
import { markVariant, markCellSvg } from './mark-overlay.js';
// The glyph codes that are NOT an item on a tile, OWNED by room-model.js and imported rather than
// re-declared — see the NON_FURNITURE note below for the bug the second copy hid.
import { NON_FURNITURE_CODES } from './room-model.js';

/* eslint-disable no-multi-spaces */

// The scene design space (the mock's own viewBox) and the deck-floor envelope inside the hull.
export const VIEW_W = 1300;
export const VIEW_H = 561;
export const DECK = Object.freeze({ x: 205, y: 168, w: 705, h: 234 });

// ⚠️ `ROLE_TO_ITEM` IS GONE FROM THIS FILE (2026-07-26), quoted so a grep lands on the reason: it was
// a hand-written role → itemId object headed *"SPRITE_FOR_GLYPH role → an itemId in the warm ITEM
// registry"*, and `room-model.js` carried the mirror-image copy. Two hand mirrors of a mapping the
// `ITEMS` registry already states once, reached through a third table. The chain had a hole —
// `GrowBed` `"`, `Terminal` `T`, `Telescope` `x` mapped to no role at all — which on the Room Zoom
// shipped as dashed unknown chips and HERE was silently inert (`if (!itemId) continue`: hydroponics
// and the MOSS terminal simply were not on the schematic). See `items/glyph-map.js`.

// Glyph code points handled by the floor/wall/structure layers or otherwise not an item on a tile.
//
// ⚠️ IT IS NO LONGER A HAND MIRROR. It used to be a literal `new Set([46,35,32,37,64,47,38])` with a
// comment saying it mirrored `room-model.js`'s copy — two literals, one meaning, exactly the shape
// `ROLE_TO_ITEM` was deleted for. It is now IMPORTED from `room-model.js`, which owns the list, so
// the two surfaces cannot come to disagree about what "not furniture" means. That mattered the day
// `'&'` (38, CORPSE) was removed: a corpse is an `ItemKind` lying on a tile, not floor/wall/
// structure, and while it sat in BOTH sets it reached NEITHER furniture layer and drew nothing at
// all. Editing one copy would have fixed one surface. `NON_FURNITURE_CODES` carries the reasoning.
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
  return { minX, minY, maxX, maxY };
}

/**
 * Build the shared TILE→SVG transform for a deck. Exposed so the integration lane can invert it
 * for clicks. `project(tx,ty)` → [sx,sy]; `rect({x,y,w,h})` → the projected pixel rect;
 * `invert(sx,sy)` → the fractional tile the pixel fell in; `tileSize` = min(KX,KY) for art sizing.
 */
export function makeTransform(slots, frame) {
  const ext = tileExtent(slots, frame);
  const spanX = Math.max(1e-6, ext.maxX - ext.minX);
  const spanY = Math.max(1e-6, ext.maxY - ext.minY);
  const KX = DECK.w / spanX;
  const KY = DECK.h / spanY;
  const project = (tx, ty) => [DECK.x + (tx - ext.minX) * KX, DECK.y + (ty - ext.minY) * KY];
  return {
    ext, KX, KY, tileSize: Math.min(KX, KY),
    project,
    rect(r) {
      const [x, y] = project(r.x, r.y);
      return { x, y, w: r.w * KX, h: r.h * KY };
    },
    invert(sx, sy) {
      return [ext.minX + (sx - DECK.x) / KX, ext.minY + (sy - DECK.y) / KY];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 1 — the deterministic starfield (VS-O-05 … VS-O-10). The void + nebula backdrop it drifts
// over is the persistent CSS `.ov-space`/`.ov-neb` skeleton layer, not this SVG.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const STAR_COLS = ['#fff', '#ffe9cf', '#cfe0ff', '#f2d9b0', '#ffffff'];

/** The 220 seeded stars (VS-O-08) as {x%,y%,s,c}. Pure + deterministic. */
export function starfield(count = 220) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const b = rnd(i + 0.7);
    const s = b > 0.94 ? 3 : b > 0.8 ? 2 : 1;
    const c = STAR_COLS[Math.floor(rnd(i + 0.3) * STAR_COLS.length)];
    out.push({ x: n(rnd(i) * 100), y: n(rnd(i + 0.5) * 100), s, c });
  }
  return out;
}

/** The starfield as ONE circle-per-star SVG fragment (no wrapper), mapped into design space. */
function starCircles() {
  return starfield()
    .map((st) => `<circle cx="${n(st.x / 100 * VIEW_W)}" cy="${n(st.y / 100 * VIEW_H)}" r="${n(st.s / 2)}" fill="${st.c}"/>`)
    .join('');
}

/**
 * The drifting parallax starfield as a STANDALONE, self-animating SVG layer. This is NOT part of the
 * per-repaint scene — it is injected ONCE into the skeleton's `.ov-space` (see overview-view.js) so
 * the CSS drift survives the scene's `innerHTML` rebuilds. The seeded 220-star field is tiled twice
 * side by side (at x=0 and x=VIEW_W); a −VIEW_W CSS translate on `.ov-stars-drift` (styles.css) loops
 * seamlessly because the two tiles are identical. `slice` makes the field cover the full backdrop,
 * letterbox bands included. The void + nebula washes it drifts over live in the persistent CSS
 * `.ov-space`/`.ov-neb` backdrop, which is byte-identical to the old in-SVG `spaceLayer`.
 */
export function starLayerSvg() {
  const field = starCircles();
  return `<svg class="ov-stars" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid slice"`
    + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<g class="ov-stars-drift">`
    +   `<g class="pl-stars">${field}</g>`
    +   `<g class="pl-stars" transform="translate(${VIEW_W} 0)">${field}</g>`
    + `</g></svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 2 — the hull silhouette (VS-O-13 … VS-O-24). A static SVG layer in design space.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function hullLayer(id) {
  return `<g class="pl-hull" pointer-events="none">`
    // engine glow (VS-O-14)
    + `<ellipse cx="70" cy="230" rx="72" ry="34" fill="rgba(232,134,60,.5)"/>`
    + `<ellipse cx="70" cy="330" rx="72" ry="34" fill="rgba(232,134,60,.5)"/>`
    // nacelle triangles (VS-O-15)
    + `<path d="M540 150 L660 74 L860 150 Z" fill="#1f2830" stroke="#33414d" stroke-width="2"/>`
    + `<path d="M540 411 L660 487 L860 411 Z" fill="#1f2830" stroke="#33414d" stroke-width="2"/>`
    // nacelle struts (VS-O-16)
    + `<g stroke="rgba(232,147,74,.3)" stroke-width="1.5">`
    +   `<line x1="600" y1="132" x2="700" y2="96"/><line x1="660" y1="140" x2="740" y2="108"/>`
    +   `<line x1="600" y1="429" x2="700" y2="465"/><line x1="660" y1="421" x2="740" y2="453"/></g>`
    // engine housings (VS-O-17)
    + `<rect x="24" y="196" width="86" height="68" rx="10" fill="#232d36" stroke="#39424c" stroke-width="2"/>`
    + `<rect x="24" y="296" width="86" height="68" rx="10" fill="#232d36" stroke="#39424c" stroke-width="2"/>`
    // engine cores (VS-O-18)
    + `<circle cx="34" cy="230" r="20" fill="#e8863c"/><circle cx="34" cy="230" r="10" fill="#ffe6b0"/>`
    + `<circle cx="34" cy="330" r="20" fill="#e8863c"/><circle cx="34" cy="330" r="10" fill="#ffe6b0"/>`
    // hull body (VS-O-19)
    + `<path d="M150 168 C 420 132 860 132 1070 158 Q 1180 172 1274 280 Q 1180 389 1070 403 C 860 429 420 429 150 393 Q 96 384 92 344 L 92 217 Q 96 177 150 168 Z" fill="#28323d" stroke="#3f4e5c" stroke-width="3"/>`
    // interior structure lines (VS-O-20)
    + `<g stroke="rgba(0,0,0,.28)" stroke-width="2" fill="none">`
    +   `<line x1="150" y1="262" x2="1120" y2="262"/><line x1="150" y1="300" x2="1120" y2="300"/>`
    +   `<line x1="340" y1="150" x2="340" y2="410"/><line x1="700" y1="146" x2="700" y2="414"/></g>`
    // amber deck accent + portholes (VS-O-21/22)
    + `<path d="M160 172 C 420 138 860 138 1065 163" fill="none" stroke="rgba(242,181,99,.4)" stroke-width="2"/>`
    + `<circle cx="300" cy="141" r="2.6" fill="#f2b563"/><circle cx="520" cy="135" r="2.6" fill="#f2b563"/>`
    + `<circle cx="760" cy="137" r="2.6" fill="#f2b563"/><circle cx="980" cy="147" r="2.6" fill="#f2b563"/>`
    // bridge nub (VS-O-23) — the one cool accent
    + `<path d="M1090 210 Q 1210 250 1250 280 Q 1210 310 1090 350 Z" fill="#1a222b" stroke="#3f4e5c" stroke-width="2"/>`
    + `<path d="M1110 232 Q 1195 258 1222 280 Q 1195 302 1110 328 Z" fill="#12202e" stroke="rgba(122,180,220,.35)" stroke-width="1.5"/>`
    + `<circle cx="1150" cy="270" r="1.4" fill="#cfe0ff"/><circle cx="1175" cy="288" r="1.2" fill="#cfe0ff"/>`
    + `<text x="1120" y="284" fill="rgba(122,180,220,.5)" font-size="9" letter-spacing="1" font-family="'Space Mono', ui-monospace, monospace">BRIDGE</text>`
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 3 — the room grid: compartments, material floors, trim-light, labels, halls (VS-O-25…38).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Per-material floor texture inside the projected rect r (deterministic; drawn within bounds). */
function floorTexture(material, line, r) {
  const parts = [];
  if (material === 'wood') {
    const step = Math.max(10, r.w / 4);
    for (let x = r.x + step; x < r.x + r.w - 1; x += step) {
      parts.push(`<rect x="${n(x)}" y="${n(r.y)}" width="1.4" height="${n(r.h)}" fill="${line}"/>`);
    }
  } else if (material === 'grow') {
    const g = 12;
    for (let y = r.y + g / 2; y < r.y + r.h; y += g) {
      for (let x = r.x + g / 2; x < r.x + r.w; x += g) {
        parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="1.3" fill="${line}"/>`);
      }
    }
  } else { // grid — steel-tan / cream
    const g = material === 'cream' ? 12 : 14;
    for (let x = r.x + g; x < r.x + r.w - 1; x += g) parts.push(`<rect x="${n(x)}" y="${n(r.y)}" width="1" height="${n(r.h)}" fill="${line}"/>`);
    for (let y = r.y + g; y < r.y + r.h - 1; y += g) parts.push(`<rect x="${n(r.x)}" y="${n(y)}" width="${n(r.w)}" height="1" fill="${line}"/>`);
  }
  return parts.join('');
}

/**
 * A compartment: floor + texture + trim-light + inner shadow + label.
 *
 * ⭐ M1-L — THIS IS THE ONLY COMPARTMENT PAINTER. Its sibling `hallCompartment` — a near-void volume
 * carrying a dim `HALL · A1` designation and the dashed amber `＋ ADD ROOM` chip (VS-O-35…37) — is
 * DELETED, together with the private `slotDesignation` helper it was the only caller of (that helper
 * lives on as `decks-model.js`'s exported `compartmentDesignation`, which the naming rule uses).
 *
 * Owner ruling, 2026-07-29: *"we do not need 'add room' that makes no sense on a ship where rooms are
 * already existing."* Every slot the host emits is a compartment the ship CARVED — floor, perimeter
 * walls, a door onto the spine — so there was never a second kind of thing to draw. MEASURED on the
 * merged tree, not assumed: with `GameSession.ResolveSlot`'s type gate removed, **all 16 wreck slots
 * and all 64 grid slots report `occupied:true` with a non-blank anchor**, so `hallCompartment` had no
 * remaining input on any shipped ship.
 *
 * The label is unconditional because `deckSlotView`'s naming rule is TOTAL (`compartmentName` never
 * returns ''). The old `slot.displayName ? … : ''` guard is gone with it — keeping it would have left
 * a branch no input can reach, which reads as "a compartment can be nameless", exactly the defect
 * this package removes.
 *
 * ⚠️ THE LABEL STAYS IN THIS GROUP, DRAWN BELOW THE FURNITURE — a decision, taken after building the
 * alternative and photographing it. See the note above `compartmentName` in `decks-model.js`: the
 * neutral name is short BECAUSE this layer is under the furniture, and hoisting the labels into
 * their own layer above it was tried, measured and REVERTED (it fixed the clip and then painted
 * 8.5 px text over the cryo capsules — an unapproved visual change to every room, to solve a problem
 * a shorter name solves at its source). The residual hazard is filed, not fixed.
 */
function roomCompartment(slot, r) {
  const label = `<text x="${n(r.x + 6)}" y="${n(r.y + 12)}" text-anchor="start" font-size="8.5" letter-spacing="1"`
    + ` font-family="'Space Mono', ui-monospace, monospace" fill="${slot.labelColor}">${esc(slot.displayName)}</text>`;
  return `<g class="pl-room" data-slot="${slot.slotIndex}" data-anchor="${esc(slot.anchorName)}">`
    // material floor
    + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="2" fill="${slot.floor}"/>`
    + floorTexture(slot.material, slot.line, r)
    // inner shadow (inset dark border) + hard 1px edge (VS-O-27)
    + `<rect x="${n(r.x + 1)}" y="${n(r.y + 1)}" width="${n(r.w - 2)}" height="${n(r.h - 2)}" rx="2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/>`
    // amber top trim-light (inset 0 4px 0 {trim}) — the room's signature (VS-O-27)
    + `<rect x="${n(r.x + 1)}" y="${n(r.y + 1)}" width="${n(r.w - 2)}" height="3" fill="${slot.trim || 'rgba(232,147,74,.5)'}"/>`
    + label
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 4 — glow-pools: one amber radial per OCCUPIED slot (VS-O-31). NOT `active` (deck-level).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Pool colour PURE from the room (VS-O-31). */
function glowColor(slot) {
  if (slot.anchorName === 'reactor') return 'rgba(232,134,60,.22)';
  if (slot.material === 'grow') return 'rgba(120,150,70,.16)';
  if (slot.material === 'cream') return 'rgba(90,159,212,.12)';
  return 'rgba(242,147,74,.14)';
}

function glowPools(slots, t, id) {
  const defs = [];
  const body = [];
  let i = 0;
  for (const slot of slots) {
    // ⚠️ ⭐ M1-L CHANGED WHAT THIS LINE HAD TO ASK, and the original wording is kept below because the
    // hazard it names is still live in the other direction.
    //
    // WAS: `if (!slot.occupied) continue;` — "CRITICAL (VS-O-31 / Phase-2b note): drive the glow from
    // `occupied`, NOT `active` — `active` is a deck-level flag and would light every empty hall."
    // That is still true of `active`. But `occupied` now means "this slot's walls enclose a real
    // room", which is TRUE FOR EVERY SLOT ON EVERY SHIPPED SHIP — so it would light every hall too,
    // by the other road. MEASURED on `--ship wreck`: glow pools would go 3 → 8 on deck 0 and
    // **0 → 8 on the DEAD DECK**, putting an amber light pool in eight unpowered, airless, sealed
    // compartments on the ship `./play.sh` opens.
    //
    // So the glow keeps the exact SET it always had, by asking the thing that set always was: does
    // this compartment have an authored PURPOSE? Zero visual change to this layer — which is the
    // point. Widening `occupied` must not silently repurpose a player-facing signal, and a pool of
    // warm light is a claim about the ship's state, not about its floor plan.
    //
    // ⚠️ THIS IS DELIBERATELY NOT `slot.atmos`, though that reads like the better question. It would
    // drop LIFE SUPPORT's pool on the wreck (typed, but airless behind its own shut door), i.e. it
    // would be a THIRD behaviour rather than a preserved one. Whether a glow should track air, power
    // or purpose is a design question for the lens work, and it is filed, not answered here.
    if (!slot.roomType) continue;
    const r = t.rect(slot.rect);
    const c = glowColor(slot);
    const gid = `${id}-glow-${slot.slotIndex}`;
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    const rgb = m ? m[1].split(',').slice(0, 3).map((s) => s.trim()).join(',') : '242,147,74';
    defs.push(`<radialGradient id="${gid}" cx="50%" cy="50%" r="50%">`
      + `<stop offset="0" stop-color="${c}"/>`
      + `<stop offset="0.7" stop-color="rgba(${rgb},0)"/></radialGradient>`);
    // geometry per VS-O-31: left+2, top-6, width+6, height+30 (in tile space, projected)
    const gx = r.x + 2, gy = r.y - 6 * t.KY / 8, gw = r.w + 6, gh = r.h + 30 * t.KY / 8;
    body.push(`<ellipse cx="${n(gx + gw / 2)}" cy="${n(gy + gh / 2)}" rx="${n(gw / 2)}" ry="${n(gh / 2)}" fill="url(#${gid})"/>`);
    i++;
  }
  if (!body.length) return '';
  return `<g class="pl-glow" style="mix-blend-mode:screen" pointer-events="none"><defs>${defs.join('')}</defs>${body.join('')}</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 5 — furniture: frame cells → itemIdForGlyphChar → buildItem (VS-O-30). (Was a three-hop
// glyph → role → itemId walk through `SPRITE_FOR_GLYPH` + a local hand mirror; see line 54.)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {Map<string,{cond:number}>|null} [deviceCond]  this deck's `devices`-channel rows keyed
 *        `"x,y"` (`deckDeviceConditions`). Absent / no row for a tile ⇒ the intact piece, which is
 *        what this surface drew before the wear join existed.
 */
function furnitureLayer(frame, deck, t, id, deviceCond) {
  if (!frame || frame.deck !== deck || !Array.isArray(frame.cells)) return '';
  const side = Math.max(10, t.tileSize * 1.7);
  const cond = deviceCond instanceof Map ? deviceCond : new Map();
  const out = [];
  for (let ty = 0; ty < frame.h; ty++) {
    for (let tx = 0; tx < frame.w; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0];
      if (NON_FURNITURE.has(code)) continue;
      const itemId = itemIdForGlyphChar(String.fromCharCode(code));
      if (!itemId) continue; // glyph nothing skins → graceful skip
      const [cx, cy] = t.project(tx + 0.5, ty + 0.5);
      // THE WEAR JOIN, identical in both surfaces because it is ONE function: the tile's row from
      // the `devices` channel, or `undefined` where nothing tile-resident stands there.
      const row = cond.get(tx + ',' + ty);
      const g = buildTileItem(itemId, { w: side, h: side, idPrefix: `${id}-f${tx}-${ty}` },
                              row ? row.cond : undefined);
      out.push(`<g transform="translate(${n(cx - side / 2)} ${n(cy - side / 2)})">${g}</g>`);
    }
  }
  return out.length ? `<g class="pl-furniture" pointer-events="none">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 5b — DEBRIS + DESIGNATION MARKS (console-retirement WP-2; re-sourced by the `marks` channel).
//
// ⚠️ IT NO LONGER READS THE FRAME AT ALL. The paragraph that used to head this block is quoted and
// negated, because it was true when written and describing a source that is now the wrong one:
// *"The only layer in this file that reads `cell[1]`, the projected `GlyphColor` foreground byte,
// instead of `cell[0]`."* — FALSE SINCE THE `marks` CHANNEL. `GlyphMapper` writes that byte in pass 1
// and OVERWRITES it in pass 3 (ground items), pass 4 (devices) and pass 5 (citizens), so on
// `--ship grid` a crew member walking over a designation made its mark blink out and back, an item
// stored on a stockpile tile erased the tint, and a device on a dig tile hid the order. The kinds now
// come from the sim's own registries over the wire, decoded once by `overview-view.js` and handed in.
// See `hosts/web/WireFormat.Marks.cs`.
//
// It is still a layer of its own rather than a change to `furnitureLayer`, and that reason has NOT
// changed with the source: every debris and dig cell rides glyph 37 (`'%'`), which is in
// `NON_FURNITURE` above and must stay there. Removing it would push debris through
// `itemIdForGlyphChar` (then: `SPRITE_FOR_GLYPH`/`ROLE_TO_ITEM`) — which has no mapping for `'%'`,
// so `furnitureLayer`'s
// `if (!itemId) continue` would still draw nothing — while changing what "furniture" means for the
// Room Zoom's mirrored copy of that set. ⚠️ THAT LAST STEP IS WHERE THE TWO SURFACES PART, and it is
// worth knowing before copying this paragraph back the other way: the Room Zoom has NO `continue`
// there. `furnitureSvg` falls through to a VS-Z-25 dashed "unknown" chip, so the same loosening that
// is merely inert here would draw 33 junk chips over the wreck in the Room Zoom — measured, not
// reasoned. See `room-model.js`'s copy of this note.
//
// Stockpile marks ARE drawn here, unlike in the Room Zoom, because this surface has no `zones`
// overlay of its own.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{x:number,y:number,deck:number,mark:string}[]|null} marks  decodeMarks() output
 */
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
// Build ghosts (VS-O-72) — wire-backed dashed placement markers on this deck.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function ghostLayer(designs, deck, t) {
  const cells = Array.isArray(designs) ? designs : (designs && designs.cells) || [];
  const out = [];
  for (const c of cells) {
    if (!Array.isArray(c) || c[2] !== deck) continue;
    const r = t.rect({ x: c[0], y: c[1], w: 1, h: 1 });
    const glyph = c[3] === 1 ? '/' : '#'; // door / wall
    out.push(`<g class="pl-ghost">`
      + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="rgba(232,147,74,.22)" stroke="#f2b563" stroke-width="1.5" stroke-dasharray="3 2"/>`
      + `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" font-size="${n(t.tileSize * 0.7)}" fill="#f2b563" text-anchor="middle" dominant-baseline="central" font-family="'Space Mono', ui-monospace, monospace">${esc(glyph)}</text></g>`);
  }
  return out.length ? `<g class="pl-ghosts" pointer-events="none">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Terminals — clickable MOSS console markers, one per terminal device on the shown deck. Drawn
// BELOW the pawns (a crew member standing on a console still selects as a pawn) but above the room
// so the marker is hittable. Carries `data-tid` so the click routes straight to that terminal's
// MOSS program (overview-view's hitTest → 'terminal' action). The `terminals` wire channel
// ([tid,deck,x,y]) is the source; an empty/absent channel draws nothing (graceful).
// ─────────────────────────────────────────────────────────────────────────────────────────────

function terminalLayer(terminals, deck, t, id) {
  const list = Array.isArray(terminals) ? terminals : [];
  const out = [];
  for (const term of list) {
    if (!term || (term.deck | 0) !== deck) continue;
    const [cx, cy] = t.project(term.x + 0.5, term.y + 0.5);
    const s = Math.max(8, t.tileSize * 1.0);
    const w = s, h = s * 0.78;
    const x = cx - w / 2, y = cy - h * 0.7;
    out.push(`<g class="pl-terminal" data-tid="${esc(term.tid)}">`
      // hit target (transparent, generous) so the whole cell is clickable
      + `<rect x="${n(cx - t.KX / 2)}" y="${n(cy - t.KY / 2)}" width="${n(t.KX)}" height="${n(t.KY)}" fill="transparent"/>`
      // console body + amber phosphor screen + stand
      + `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="1.6" fill="rgba(18,14,10,.92)" stroke="#f2b563" stroke-width="1"/>`
      + `<rect x="${n(x + 1.4)}" y="${n(y + 1.4)}" width="${n(w - 2.8)}" height="${n(h - 2.8)}" rx="1" fill="rgba(242,181,99,.3)"/>`
      + `<rect x="${n(cx - w * 0.18)}" y="${n(y + h)}" width="${n(w * 0.36)}" height="${n(h * 0.22)}" fill="#cf7a33"/>`
      + `</g>`);
  }
  return out.length ? `<g class="pl-terminals">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Layer 6 — pawns: front-facing crew figures for on-deck roster members (VS-O-39 … VS-O-48), each
// wearing its identity + WORK label (IX-103, ported off the console at WP-8).
//
// THE WORK MARKER (console-retirement plan §1(b) B4). The console answered "is this person actually
// working?" on the map, with a tag over every crew member holding a real job (`hud.js paintWorkMarks`
// over `console-model.workMarkers`). The Overview tagged pawns with a SURNAME only, so the map could
// not answer it at all. The tag now reads `SURNAME · DIG`, and the honesty rule the console's marker
// existed for is preserved exactly: the tag half appears ONLY for a crew member doing a job at a
// place. Idle, merely walking, and *en route* crew get no tag — `taskTag` returns null for all three,
// and the ABSENCE is the information.
//
// THE LEGIBILITY PROBLEM, and what was done about it. Eight pawns fit inside one 10×6 compartment
// (the grid ship's hold), where a tile is ~15 design px and a name pill is ~50 — so the pre-existing
// surname tags already overlapped into `HALL(VE OKO NOV KAUR / SAT ITO YEMI`, and adding task text
// would have made an already-unreadable label worse. So the labels are DE-CLUTTERED: overlapping
// pills lift onto stacked rows with a leader line back to their pawn (`layoutPawnLabels`, below).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** How far each de-clutter row lifts a label, in design px (a pill is 11 tall, so 12 leaves 1 of air). */
const LABEL_ROW_STEP = 12;
/** Rows the sweep may stack before it gives up. 8 = one row per crew member in the densest room. */
export const LABEL_MAX_ROWS = 8;
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
 * two pawns a tile apart vertically are ~15 design px apart while `LABEL_ROW_STEP` is 12 — "same row"
 * therefore neither implies nor is implied by "same height", and a sweep that compared only horizontal
 * spans within a row index certified a genuinely overlapping pair as clean. It did: measured off the
 * emitted rects, the shipped `rosterDeck1` fixture (crew at tile y=15 AND y=16) produced ONE
 * overlapping pair, `OKONJO · DIG` × `NOVAK · DIG` at 18.5 × 10 px — ~91 % of a pill's height — and
 * eight crew on alternating rows produced four. Comparing whole rects instead costs nothing and makes
 * the property the code claims ("no two visible pills overlap") the property it actually enforces.
 * A `baseY` is optional: absent, every label shares baseline 0 and the sweep degenerates to the
 * horizontal one, which is the right answer for a caller that has no vertical spread to describe.
 *
 * When all `LABEL_MAX_ROWS` rows are taken the two cases are treated DIFFERENTLY, and this asymmetry
 * is the point: an IDLE label is marked `crowded` (the caller renders it transparent, revealed by
 * hovering its pawn), while a WORKING label is never marked — it draws on the top row and accepts the
 * overlap. A tag that is merely ugly is honest; a work tag that vanishes because the room is busy
 * would say "nobody here is working" at exactly the moment everybody is, which is the lie B4 exists
 * to prevent.
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
    if (!c || c.deck !== deck) continue; // off-deck / fogged crew simply do not render (VS-O-48)
    const [fx, fy] = t.project(c.x + 0.5, c.y + 0.5); // feet on the tile centre
    const S = Math.max(0.6, t.tileSize * 2.2 / 24);   // pawn box ≈ 2.2 tiles tall (viewBox 24)
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
      const sgid = `${id}-sel-${esc(c.cid)}`;
      g += `<defs><radialGradient id="${sgid}" cx="50%" cy="50%" r="50%">`
        + `<stop offset="0" stop-color="rgba(242,181,99,.65)"/>`
        + `<stop offset="0.7" stop-color="rgba(242,181,99,0)"/></radialGradient></defs>`
        + `<ellipse cx="${n(fx)}" cy="${n(fy - 2)}" rx="${n(S * 9)}" ry="${n(S * 9)}" fill="url(#${sgid})"/>`;
    }
    // seat the pawn so its feet (local 8,23 in the 16×24 viewBox) land on (fx,fy)
    g += `<g transform="translate(${n(fx - 8 * S)} ${n(fy - 23 * S)}) scale(${n(S)})">${body}</g>`;
    // identity + WORK label above the head (VS-O-47 + IX-103)
    const lay = layout.get(String(c.cid)) || { row: 0, crowded: false };
    const baseY = p.baseY;
    const tagY = baseY - lay.row * LABEL_ROW_STEP;
    const tagC = selected ? '#f2b563' : 'rgba(220,210,195,.7)';
    const cls = 'pl-tag' + (p.tag ? ' pl-tag-work' : '') + (lay.crowded ? ' pl-tag-crowded' : '');
    g += `<g class="${cls}">`
      // leader line: a lifted pill would otherwise be ambiguous about which pawn it belongs to
      + (lay.row > 0
        ? `<line x1="${n(fx)}" y1="${n(tagY + 3)}" x2="${n(fx)}" y2="${n(baseY + 3)}" stroke="rgba(220,210,195,.3)" stroke-width="1"/>`
        : '')
      // The pill box comes from the SAME two constants the sweep reasoned about (LABEL_PILL_*), so a
      // change to either cannot silently make the sweep certify a box that is no longer emitted.
      + `<rect x="${n(fx - p.w / 2)}" y="${n(tagY - LABEL_PILL_RISE)}" width="${n(p.w)}" height="${LABEL_PILL_H}" rx="2" fill="rgba(12,10,8,${p.tag ? '.86' : '.72'})"/>`
      + `<text x="${n(fx)}" y="${n(tagY - 2)}" font-size="7.5" letter-spacing=".5" fill="${tagC}" text-anchor="middle" dominant-baseline="central" font-family="'Space Mono', ui-monospace, monospace">`
      + `${esc(p.sur)}`
      + (p.tag ? `<tspan fill="#f2b563"> · ${esc(p.tag)}</tspan>` : '')
      + `</text></g>`;
    g += `</g>`;
    out.push(g);
  }
  return out.length ? `<g class="pl-pawns">${out.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The composer.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the whole Level-1 overview scene as one self-contained SVG string. PURE — same `state`
 * yields a byte-identical result.
 *
 * @param {object} state
 * @param {number} state.deck            the deck to render.
 * @param {Array}  state.decksView       decksView(decks,rooms) output — [{deck, slots:[…]}].
 * @param {object} [state.frame]         the frame message (furniture comes from its cells).
 * @param {Array}  [state.crew]          roster crew [{cid,name,role,deck,x,y}].
 * @param {Array}  [state.designs]       build-ghost design cells (or a {cells} message).
 * @param {Array}  [state.terminals]     MOSS terminal directory [{tid,deck,x,y}] — clickable markers.
 * @param {Array}  [state.marks]         decoded `marks` cells [{x,y,deck,kind,mark}] — the debris /
 *                                       dig / stockpile / strip layer. NOT derived from `frame`.
 * @param {Map}    [state.deviceCond]    `deckDeviceConditions(...)` for THIS deck — per-tile device
 *                                       wear off the `devices` channel, which chooses a machine's
 *                                       post-raid twin. NOT derived from `frame`, for the same
 *                                       reason `marks` is not: the projection carries one bit of
 *                                       condition at most and later passes overwrite it.
 * @param {*}      [state.selectedCid]   the selected crew cid (selection glow + amber tag).
 * @param {string} [state.lens]          the active lens (accepted; resting look only for now).
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

  // M1-L: ONE painter. The `occupied || displayName` branch is gone with `hallCompartment` — see its
  // header. `occupied` is still meaningful and still read, one layer down: it drives the glow pool
  // (`glowPools`) and the lens wash, where it answers "does this compartment enclose a live room?".
  // What it no longer decides is whether the player can SEE and ENTER the compartment at all.
  const rooms = [];
  for (const slot of slots) rooms.push(roomCompartment(slot, t.rect(slot.rect)));

  // The space backdrop (void + nebula + drifting stars) is NOT drawn here: it lives in the
  // persistent `.ov-space` skeleton layer (starLayerSvg + CSS) so its drift survives repaints.
  const body = ''
    + hullLayer(id)
    + `<g class="pl-rooms">${rooms.join('')}</g>`
    // `markLayer` sits ABOVE `furnitureLayer` — the same order, for the same reason, as the Room
    // Zoom's `markLayerSvg` (roomzoom-view.js, which carries the full argument): a condemned DEVICE
    // now carries fg 26, and beneath its own furniture sprite its amber ✕ would be invisible. Inert
    // for debris/dig, whose glyph code 37 is in `NON_FURNITURE` so `furnitureLayer`'s
    // `if (!itemId) continue` never draws on a marked tile; stockpile is drawn by neither.
    + furnitureLayer(st.frame, deck, t, id, st.deviceCond)
    + markLayer(st.marks, deck, t)
    + glowPools(slots, t, id)
    + ghostLayer(st.designs, deck, t)
    + terminalLayer(st.terminals, deck, t, id)
    + pawnLayer(st.crew, deck, t, st.selectedCid, id);

  return `<svg class="pl-overview" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet"`
    + ` xmlns="http://www.w3.org/2000/svg" data-deck="${deck}" data-lens="${esc(st.lens || 'none')}">`
    + body + `</svg>`;
}

export default overviewScene;
