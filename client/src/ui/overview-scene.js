// The LEVEL-1 OVERVIEW SVG SCENE — the warm ship-deck schematic. A PURE, DOM-free composer that
// turns one captured wire snapshot (frame + decks/rooms view + roster + designs) into a single
// self-contained SVG string: full-bleed space, the hull silhouette, the 8-slot compartment grid
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
import { pawnSprite } from '../render/pawn-svg.js';
import { SPRITE_FOR_GLYPH } from '../render/glyphs.js';

/* eslint-disable no-multi-spaces */

// The scene design space (the mock's own viewBox) and the deck-floor envelope inside the hull.
export const VIEW_W = 1300;
export const VIEW_H = 561;
export const DECK = Object.freeze({ x: 205, y: 168, w: 705, h: 234 });

// SPRITE_FOR_GLYPH role → an itemId in the warm ITEM registry. A glyph absent from
// SPRITE_FOR_GLYPH, or a role with no mapped item, renders NO furniture (graceful skip).
const ROLE_TO_ITEM = Object.freeze({
  scrubber: 'o2-scrubber', watertank: 'oxygen-tank', radiator: 'space-heater',
  solar: 'solar-panel', battery: 'battery-bank', vent: 'air-vent', light: 'wall-lamp',
  ladder: 'hatch-ladder', reclaimer: 'water-recycler', recycler: 'water-recycler',
  fabricator: 'fabricator', machineshop: 'workbench',
  bed: 'bunk-bed', table: 'dining-table', chair: 'chair', medbed: 'med-bed',
  medcab: 'locker', locker: 'locker', desk: 'desk', plant: 'potted-plant',
});

// Glyph code points handled by the floor/wall/structure layers or otherwise not furniture.
const NON_FURNITURE = new Set([46, 35, 32, 37, 64, 47, 38]); // . # space % @ / &

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
// Layer 1 — space backdrop + deterministic starfield (VS-O-05 … VS-O-10).
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

function spaceLayer(id) {
  const stars = starfield()
    .map((st) => `<circle cx="${n(st.x / 100 * VIEW_W)}" cy="${n(st.y / 100 * VIEW_H)}" r="${n(st.s / 2)}" fill="${st.c}"/>`)
    .join('');
  return ''
    + `<defs>`
    +   `<radialGradient id="${id}-void" cx="60%" cy="30%" r="90%">`
    +     `<stop offset="0" stop-color="#141a2b"/><stop offset="0.5" stop-color="#0a0c16"/>`
    +     `<stop offset="1" stop-color="#05060c"/></radialGradient>`
    +   nebula(`${id}-neb1`, '90,70,150', 0.16) + nebula(`${id}-neb2`, '40,120,130', 0.12)
    +   nebula(`${id}-neb3`, '180,90,60', 0.09)
    + `</defs>`
    + `<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="url(#${id}-void)"/>`
    // three nebula washes (VS-O-06), positioned by mock proportion within the viewBox
    + `<ellipse cx="${n(0.20 * VIEW_W)}" cy="${n(0.50 * VIEW_H)}" rx="${n(0.30 * VIEW_W)}" ry="${n(0.55 * VIEW_H)}" fill="url(#${id}-neb1)"/>`
    + `<ellipse cx="${n(0.84 * VIEW_W)}" cy="${n(0.90 * VIEW_H)}" rx="${n(0.27 * VIEW_W)}" ry="${n(0.50 * VIEW_H)}" fill="url(#${id}-neb2)"/>`
    + `<ellipse cx="${n(0.62 * VIEW_W)}" cy="${n(0.10 * VIEW_H)}" rx="${n(0.24 * VIEW_W)}" ry="${n(0.38 * VIEW_H)}" fill="url(#${id}-neb3)"/>`
    + `<g class="pl-stars">${stars}</g>`;
}

function nebula(id, rgb, a) {
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">`
    + `<stop offset="0" stop-color="rgb(${rgb})" stop-opacity="${a}"/>`
    + `<stop offset="0.65" stop-color="rgb(${rgb})" stop-opacity="0"/></radialGradient>`;
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

/** A commissioned room compartment: floor + texture + trim-light + inner shadow + label. */
function roomCompartment(slot, r) {
  const label = slot.displayName
    ? `<text x="${n(r.x + 6)}" y="${n(r.y + 12)}" text-anchor="start" font-size="8.5" letter-spacing="1"`
      + ` font-family="'Space Mono', ui-monospace, monospace" fill="${slot.labelColor}">${esc(slot.displayName)}</text>`
    : '';
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

/** An unbound slot: a HALL — near-void volume with a dim designation + ＋ ADD ROOM chip (VS-O-35…37). */
function hallCompartment(slot, r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const desig = `HALL · ${slotDesignation(slot.slotIndex)}`;
  return `<g class="pl-hall" data-slot="${slot.slotIndex}">`
    + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="2" fill="rgba(12,10,8,.35)" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
    + `<text x="${n(r.x + 6)}" y="${n(r.y + 12)}" text-anchor="start" font-size="8.5" letter-spacing="1"`
    +   ` font-family="'Space Mono', ui-monospace, monospace" fill="rgba(140,131,119,.6)">${esc(desig)}</text>`
    // ＋ ADD ROOM affordance (dashed amber chip, centred)
    + `<g class="pl-addroom">`
    +   `<rect x="${n(cx - 34)}" y="${n(cy - 8)}" width="68" height="16" rx="2" fill="rgba(232,147,74,.22)" stroke="#f2b563" stroke-width="1.5" stroke-dasharray="3 2"/>`
    +   `<text x="${n(cx)}" y="${n(cy + 1)}" font-size="8.5" letter-spacing="1"`
    +     ` font-family="'Space Mono', ui-monospace, monospace" fill="#f2b563" text-anchor="middle" dominant-baseline="central">＋ ADD ROOM</text>`
    + `</g></g>`;
}

/** Grid-cell designation A0..A3 (top row) / B0..B3 (bottom) from the slot index (0..7). */
function slotDesignation(idx) {
  const row = idx < 4 ? 'A' : 'B';
  return row + (idx % 4);
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
    // CRITICAL (VS-O-31 / Phase-2b note): drive the glow from `occupied`, NOT `active` — `active`
    // is a deck-level flag and would light every empty hall.
    if (!slot.occupied) continue;
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
// Layer 5 — furniture: frame cells → SPRITE_FOR_GLYPH → itemId → buildItem (VS-O-30).
// ─────────────────────────────────────────────────────────────────────────────────────────────

function furnitureLayer(frame, deck, t, id) {
  if (!frame || frame.deck !== deck || !Array.isArray(frame.cells)) return '';
  const side = Math.max(10, t.tileSize * 1.7);
  const out = [];
  for (let ty = 0; ty < frame.h; ty++) {
    for (let tx = 0; tx < frame.w; tx++) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const code = cell[0];
      if (NON_FURNITURE.has(code)) continue;
      const role = SPRITE_FOR_GLYPH[String.fromCharCode(code)];
      const itemId = role && ROLE_TO_ITEM[role];
      if (!itemId) continue; // unknown glyph / unmapped role → graceful skip
      const [cx, cy] = t.project(tx + 0.5, ty + 0.5);
      const g = buildItem(itemId, { w: side, h: side, idPrefix: `${id}-f${tx}-${ty}` });
      out.push(`<g transform="translate(${n(cx - side / 2)} ${n(cy - side / 2)})">${g}</g>`);
    }
  }
  return out.length ? `<g class="pl-furniture" pointer-events="none">${out.join('')}</g>` : '';
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
// Layer 6 — pawns: front-facing crew figures for on-deck roster members (VS-O-39 … VS-O-48).
// ─────────────────────────────────────────────────────────────────────────────────────────────

function pawnLayer(crew, deck, t, selectedCid, id) {
  const list = Array.isArray(crew) ? crew : [];
  const out = [];
  for (const c of list) {
    if (!c || c.deck !== deck) continue; // off-deck / fogged crew simply do not render (VS-O-48)
    const [fx, fy] = t.project(c.x + 0.5, c.y + 0.5); // feet on the tile centre
    const S = Math.max(0.6, t.tileSize * 2.2 / 24);   // pawn box ≈ 2.2 tiles tall (viewBox 24)
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
    // surname tag above the head (VS-O-47)
    const tagC = selected ? '#f2b563' : 'rgba(220,210,195,.7)';
    const sur = surnameOf(c.name);
    const tagW = Math.max(16, sur.length * 5 + 8);
    const tagY = fy - 24 * S - 4;
    g += `<g class="pl-tag">`
      + `<rect x="${n(fx - tagW / 2)}" y="${n(tagY - 8)}" width="${n(tagW)}" height="11" rx="2" fill="rgba(12,10,8,.72)"/>`
      + `<text x="${n(fx)}" y="${n(tagY - 2)}" font-size="7.5" letter-spacing=".5" fill="${tagC}" text-anchor="middle" dominant-baseline="central" font-family="'Space Mono', ui-monospace, monospace">${esc(sur)}</text></g>`;
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

  const rooms = [];
  for (const slot of slots) {
    const r = t.rect(slot.rect);
    rooms.push(slot.occupied || slot.displayName ? roomCompartment(slot, r) : hallCompartment(slot, r));
  }

  const body = ''
    + spaceLayer(id)
    + hullLayer(id)
    + `<g class="pl-rooms">${rooms.join('')}</g>`
    + furnitureLayer(st.frame, deck, t, id)
    + glowPools(slots, t, id)
    + ghostLayer(st.designs, deck, t)
    + pawnLayer(st.crew, deck, t, st.selectedCid, id);

  return `<svg class="pl-overview" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet"`
    + ` xmlns="http://www.w3.org/2000/svg" data-deck="${deck}" data-lens="${esc(st.lens || 'none')}">`
    + body + `</svg>`;
}

export default overviewScene;
