// Pure glyph/geometry helpers shared by the scene composer. Direct ports of the neighbour
// and facing logic in hosts/web/Client.html. Everything here is a pure function of the
// decoded frame (never touches the DOM/canvas), so it is unit-testable and drives the
// deterministic display list.

import { C } from './palette.js';

/**
 * Glyph char (single char) -> facing-aware sprite role. Skin logic (NOT spritegen data):
 * maps a semantic glyph to the anchor-sprite role the executor draws for it. Glyphs absent
 * here (doors, pawns, corpse, terminal, growbed) are handled directly in the executor switch.
 */
export const SPRITE_FOR_GLYPH = {
  S: 'scrubber', O: 'watertank', '=': 'radiator', G: 'solar', B: 'battery',
  '^': 'vent', '*': 'light', H: 'ladder', R: 'reclaimer', F: 'fabricator',
  M: 'machineshop', Y: 'recycler', '&': 'corpse',
  b: 'bed', t: 'table', h: 'chair', d: 'medbed', C: 'medcab',
  L: 'locker', D: 'desk', P: 'plant',
};

export const PAWN_ROLES = ['pawn', 'pawn_b', 'pawn_c'];

export const DIR = { N: 0, E: 1, S: 2, W: 3 };
export const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W

// Glyph code points referenced by the logic below (kept named for readability).
export const G_FOG_SPACE = 32; // ' '
export const G_WALL = 35;      // '#'
export const G_DEBRIS = 37;    // '%'
export const G_FLOOR = 46;     // '.'
export const G_CITIZEN = 64;   // '@'
export const G_TABLE = 116;    // 't'
export const G_BED = 98;       // 'b'
export const G_MEDBED = 100;   // 'd'

/** Glyph code at a tile; OFF-GRID reads as WALL (35) — matches Client.html glyphCodeAt. */
export function glyphCodeAt(frame, tx, ty) {
  if (!frame || tx < 0 || ty < 0 || tx >= frame.w || ty >= frame.h) return G_WALL;
  return frame.cells[ty * frame.w + tx][0];
}

/** First direction (from `order`) whose neighbour glyph is in `codes`, else -1. */
export function neighborDir(frame, tx, ty, codes, order) {
  const dirs = order || [DIR.N, DIR.E, DIR.S, DIR.W];
  for (const d of dirs) {
    const c = glyphCodeAt(frame, tx + DIRV[d][0], ty + DIRV[d][1]);
    if (codes.indexOf(c) >= 0) return d;
  }
  return -1;
}

/**
 * Quarter-turns (CW, 0..3) for a directional sprite role on tile (tx,ty). 0 when the role
 * has no facing or is on the no-rotate list. Verbatim port of Client.html spriteTurns.
 * @param {string} role
 * @param {{N?:string,E?:string,S?:string,W?:string}} facing SPRITE_FACING
 * @param {string[]} noRotate SPRITE_NO_ROTATE
 */
export function spriteTurns(role, tx, ty, frame, facing, noRotate) {
  if (noRotate && noRotate.indexOf(role) >= 0) return 0;
  const face = facing && facing[role];
  if (!face) return 0;
  const canonical = DIR[face];
  if (role === 'chair') {
    // Serve the adjacent table first, then a bed; otherwise open away from the wall.
    let target = neighborDir(frame, tx, ty, [G_TABLE]);
    if (target < 0) target = neighborDir(frame, tx, ty, [G_BED, G_MEDBED]);
    if (target < 0) {
      const wall = neighborDir(frame, tx, ty, [G_WALL]);
      if (wall >= 0) target = (wall + 2) % 4; // face away from the wall
    }
    if (target < 0) return 0;
    return (target - canonical + 4) % 4;
  }
  if (role === 'locker' || role === 'desk') {
    const wall = neighborDir(frame, tx, ty, [G_WALL]);
    if (wall < 0) return 0;
    return (((wall + 2) % 4) - canonical + 4) % 4;
  }
  // Beds / med-beds: head end toward the nearest wall (N/S preferred).
  const wall = neighborDir(frame, tx, ty, [G_WALL], [DIR.N, DIR.S, DIR.W, DIR.E]);
  if (wall < 0) return 0;
  return (wall - canonical + 4) % 4;
}

/**
 * A neighbour counts as "open" (so an adjacent wall shows its panel face) when it is not
 * solid wall and not fog. OFF-GRID reads as open space, keeping the hull silhouette crisp
 * against the void. Verbatim port of Client.html openAt.
 */
export function openAt(frame, nx, ny) {
  const { w, h, cells } = frame;
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
  const n = cells[ny * w + nx];
  if (n[0] === G_WALL) return false;                       // wall = solid
  if (n[0] === G_FOG_SPACE && n[1] === C.Unknown) return false; // fog = unknown, treat as solid
  return true;
}

/**
 * Wall panel presentation flags for a '#' tile. `vert` = vertical run (rotated panel);
 * `face` = touches open space (draws the panel; otherwise it is deep hull mass). Verbatim
 * port of the wall branch in Client.html draw().
 */
export function wallVertFace(frame, x, y) {
  const { w, h, cells } = frame;
  const wl = x > 0 && cells[y * w + x - 1][0] === G_WALL;
  const wr = x < w - 1 && cells[y * w + x + 1][0] === G_WALL;
  const wu = y > 0 && cells[(y - 1) * w + x][0] === G_WALL;
  const wd = y < h - 1 && cells[(y + 1) * w + x][0] === G_WALL;
  const vert = (wu || wd) && !(wl || wr);
  const face =
    openAt(frame, x - 1, y) || openAt(frame, x + 1, y) ||
    openAt(frame, x, y - 1) || openAt(frame, x, y + 1);
  return { vert, face };
}
