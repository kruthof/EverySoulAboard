// SHARED DECK MINIMAP (VS-Z-40..44) — the 8-slot deck plan drawn as one self-contained SVG string,
// plus the pulsing you-are-here dot. Authored once to satisfy both surfaces: the Level-2 Room Zoom
// (top-right you-are-here HUD, current room ringed amber) and, in principle, the Overview navigator.
// PURE + DOM-free: same inputs → byte-identical string. Slot hues are CLIENT-DERIVED from each
// slot's roomType through the same material table as the floor tint (VS-Z-42) — never a wire colour.
//
// The mock lays the deck out as two rows of four (A0..A3 / B0..B3) at fixed grid positions; a deck
// with fewer than 8 rooms renders fewer slots (no empty placeholders). Each non-current slot carries
// `data-slot`/`data-anchor` so the view can wire a click back to that room (IX-Z-34).

import { roomMaterial } from '../theme/warm-tokens.js';

/* eslint-disable no-multi-spaces */

// The mock's grid geometry (viewBox 160×70, rendered 188×80): two rows of four 26×13 rx2 slots.
const SLOT_W = 26, SLOT_H = 13;
const COL_X = [24, 54, 84, 114];
const ROW_Y = [20, 37];
export const MINI_VIEW_W = 160, MINI_VIEW_H = 70;
export const MINI_PX_W = 188, MINI_PX_H = 80;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The mock grid rect for a slotIndex 0..7 (row = idx<4 top, col = idx%4), or null past 8. */
function slotBox(slotIndex) {
  const i = slotIndex | 0;
  if (i < 0 || i > 7) return null;
  return { x: COL_X[i % 4], y: ROW_Y[i < 4 ? 0 : 1], w: SLOT_W, h: SLOT_H };
}

/**
 * Build the deck-plan SVG (VS-Z-42/43): the corridor stub, the hull, and one rect per slot filled
 * by its roomType hue, with the focused slot ringed amber. Slots keep their host order (never
 * re-sorted). PURE.
 * @param {Array<{slotIndex:number, roomType:number, anchorName:string}>} slots
 * @param {number} focusSlotIndex
 * @returns {string} an `<svg>…</svg>` document string
 */
export function deckPlanSvg(slots, focusSlotIndex) {
  let body =
    `<rect x="2" y="24" width="8" height="16" rx="3" fill="#232d36"/>` +
    `<rect x="10" y="12" width="144" height="46" rx="16" fill="#28323d" stroke="#3f4e5c" stroke-width="2"/>`;
  for (const s of (Array.isArray(slots) ? slots : [])) {
    const box = slotBox(s && s.slotIndex);
    if (!box) continue;
    const focused = (s.slotIndex | 0) === (focusSlotIndex | 0);
    const fill = focused ? '#e8863c' : roomMaterial(s.roomType).floor;
    const ring = focused ? ' stroke="#f2b563" stroke-width="1.5"' : '';
    body += `<rect class="rz-mini-slot${focused ? ' cur' : ''}" data-slot="${s.slotIndex | 0}" ` +
      `data-anchor="${esc(s.anchorName)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ` +
      `rx="2" fill="${fill}"${ring}/>`;
  }
  return `<svg width="${MINI_PX_W}" height="${MINI_PX_H}" viewBox="0 0 ${MINI_VIEW_W} ${MINI_VIEW_H}" ` +
    `xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/**
 * The you-are-here dot's CSS px position (VS-Z-44), centred over the focused slot and offset by the
 * dot's 6px half-size. Returns null when the focused slot is absent. PURE.
 * @param {number} focusSlotIndex
 * @returns {{left:number, top:number}|null}
 */
export function yahDotPos(focusSlotIndex) {
  const box = slotBox(focusSlotIndex);
  if (!box) return null;
  const sx = MINI_PX_W / MINI_VIEW_W, sy = MINI_PX_H / MINI_VIEW_H;
  return {
    left: (box.x + box.w / 2) * sx - 6,
    top: (box.y + box.h / 2) * sy - 6,
  };
}

/**
 * The full minimap HUD inner HTML (VS-Z-41..44): the SVG plan + the pulsing dot. The caller wraps
 * it in the `.hud` glass island. PURE (string only).
 * @param {Array} slots @param {number} focusSlotIndex
 */
export function deckMinimap(slots, focusSlotIndex) {
  const dot = yahDotPos(focusSlotIndex);
  const dotHtml = dot
    ? `<div class="rz-yah" style="left:${dot.left.toFixed(1)}px;top:${dot.top.toFixed(1)}px"></div>` : '';
  return `<div class="rz-mini-plan">${deckPlanSvg(slots, focusSlotIndex)}${dotHtml}</div>`;
}
