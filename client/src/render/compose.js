// composeScene — THE pure core of the renderer. Given a decoded frame, a camera descriptor,
// and sprite metadata, it returns a DisplayList: a flat, deterministically-ordered array of
// typed draw ops with integer tile coordinates. It NEVER touches the DOM/canvas and never
// reads wall-clock time, so it is fully golden-testable. A thin executor (canvas2d.js today,
// WebGL2 tomorrow) turns the list into pixels.
//
// This is a faithful restructuring of the per-cell logic in hosts/web/Client.html draw() /
// paintCell(): fog gate first, wall face/vert flags, lens wash, cursor, and a single trailing
// selection reticle. The op vocabulary:
//
//   { op:'hull',    x, y }                              deep hull OR unexplored fog: one dark mass
//   { op:'void',    x, y }                              known-empty space inside the hull
//   { op:'floor',   x, y }                              floor base tile
//   { op:'debris',  x, y }                              rubble base tile
//   { op:'wall',    x, y, vert, face }                  wall: panel when face, else hull mass
//   { op:'entity',  x, y, g, fg, dim, role, turns, pv } device/citizen/item/door on a floor base
//   { op:'wash',    x, y, bg }                          translucent lens tint (bg = lens color id)
//   { op:'cursor',  x, y }                              hover cursor (ATTR_INVERSE)
//   { op:'reticle', x, y }                              selected-crew reticle (drawn last, animated)
//
// Ordering: tiles are emitted row-major within the camera cull window; each tile emits its
// ops as [base, entity?, wash?, cursor?]; the single reticle (if the selected tile is visible)
// is appended last. This reproduces Client.html's draw order exactly.

import { C, ATTR_INVERSE, ATTR_DIM, hasWash } from './palette.js';
import { cullRange } from './camera.js';
import {
  SPRITE_FOR_GLYPH, spriteTurns, wallVertFace,
  G_FOG_SPACE, G_WALL, G_DEBRIS, G_FLOOR, G_CITIZEN,
} from './glyphs.js';

/** @typedef {import('./camera.js').Camera} Camera */
/** @typedef {{op:string,x:number,y:number,[k:string]:any}} DrawOp */

/**
 * @param {{w:number,h:number,cells:number[][],sel?:number[],crew?:number[][]}} frame
 * @param {Camera} camera
 * @param {{facing?:object,noRotate?:string[]}} [assets] sprite facing metadata (from sprites.g.js)
 * @returns {DrawOp[]}
 */
export function composeScene(frame, camera, assets = {}) {
  /** @type {DrawOp[]} */
  const ops = [];
  if (!frame) return ops;
  const { w, cells } = frame;
  const facing = assets.facing || {};
  const noRotate = assets.noRotate || [];

  // Stable per-citizen sprite variant, keyed by tile — only tiles the projection shows as '@'
  // (the wire is fog-gated upstream, so this never leaks an unexplored position).
  const crewVariant = new Map();
  if (frame.crew) for (const c of frame.crew) crewVariant.set(c[0] + ',' + c[1], c[2]);

  const { x0, x1, y0, y1 } = cullRange(camera, frame);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cell = cells[y * w + x];
      const g = cell[0], fg = cell[1], bg = cell[2], attr = cell[3];

      // --- fog gate FIRST: an unexplored tile renders ONLY the hull mass (no wash, no
      //     cursor) — the load-bearing invariant. Known-void is the second early-out. ---
      if (g === G_FOG_SPACE && fg === C.Unknown) { ops.push({ op: 'hull', x, y }); continue; }
      if (g === G_FOG_SPACE && fg === C.Void) { ops.push({ op: 'void', x, y }); continue; }

      // --- base terrain / entity ---
      if (g === G_WALL) {
        const { vert, face } = wallVertFace(frame, x, y);
        ops.push({ op: 'wall', x, y, vert, face });
      } else if (g === G_DEBRIS) {
        ops.push({ op: 'debris', x, y });
      } else if (g === G_FLOOR) {
        ops.push({ op: 'floor', x, y });
      } else {
        ops.push({ op: 'floor', x, y }); // device/citizen/item/door sit on a floor base
        ops.push(entityOp(frame, x, y, g, fg, attr, crewVariant, facing, noRotate));
      }

      // --- lens wash then cursor (both skipped by the fog/void early-outs above) ---
      if (hasWash(bg)) ops.push({ op: 'wash', x, y, bg });
      if ((attr & ATTR_INVERSE) !== 0) ops.push({ op: 'cursor', x, y });
    }
  }

  // Selected-crew reticle, drawn on top, only when its tile is within the cull window.
  if (frame.sel) {
    const sx = frame.sel[0], sy = frame.sel[1];
    if (sx >= x0 && sx < x1 && sy >= y0 && sy < y1) ops.push({ op: 'reticle', x: sx, y: sy });
  }
  return ops;
}

/** @returns {DrawOp} */
function entityOp(frame, x, y, g, fg, attr, crewVariant, facing, noRotate) {
  const dim = (attr & ATTR_DIM) !== 0;
  const ch = String.fromCharCode(g);
  const role = SPRITE_FOR_GLYPH[ch] || null;
  const turns = role ? spriteTurns(role, x, y, frame, facing, noRotate) : 0;
  const pv = g === G_CITIZEN ? (crewVariant.get(x + ',' + y) || 0) : null;
  return { op: 'entity', x, y, g, fg, dim, role, turns, pv };
}
