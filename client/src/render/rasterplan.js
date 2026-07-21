// Procedural-atlas rasterization PLAN — PURE. The WebGL2 executor draws every tile as a quad
// that samples one atlas cell (or fills a flat colour). This module decides, for each RenderPass
// op, WHICH cell it needs and how the quad is tinted / rotated — mirroring the per-op branches of
// canvas2d.js, but as data (no DOM, no GL, no Image). The executor turns a cell key into pixels
// (webgl2.js `_paintCell`) and packs them with atlas.js; keeping the *decision* here makes it
// unit-testable and keeps the atlas contents deterministic.
//
// A "cell key" is a stable string naming a rasterized atlas tile:
//   terrain:{floor|wall|wall_vert|debris}   base terrain (sprite image OR procedural painter)
//   spr:{name}                              a loaded sprite image (sprite mode)
//   proc:{glyphCode}:{colorId}              a procedural entity glyph baked at its effective colour
//   overlay:{cursor|reticle}                the vector hover cursor / selection reticle art
// hull/void terrain and the lens wash are flat fills — no cell, just a colour.
//
// Cell contents depend on `useSpr` (sprites requested AND loaded): in sprite mode terrain +
// entities sample sprite images; in procedural mode they sample baked vector cells. The executor
// keys its atlas on `atlasSignature(...)` so it rebuilds exactly when that set changes (mode
// toggle, or a new glyph/colour scrolls into view) — and not every frame.

import { C, FG, HULL, WASH } from './palette.js';

/** Atlas cell raster resolution (px). Matches the sprite tile so sprite cells are 1:1. */
export const CELL = 128;

/** Locked-door amber wash drawn over the door sprite (sprite mode) — mirrors canvas2d '_entity'. */
export const LOCK_TINT = 'rgba(255,176,46,.28)';

/**
 * Resolve a terrain op to a quad spec: either a flat colour fill or a sampled atlas cell.
 * @param {{kind:string,x:number,y:number}} op
 * @returns {{flat:true,color:string}|{cell:string}|null}
 */
export function resolveTerrain(op) {
  switch (op.kind) {
    case 'hull': return { flat: true, color: HULL };
    case 'void': return { flat: true, color: FG[C.Void] };
    case 'floor': return { cell: 'terrain:floor' };
    case 'debris': return { cell: 'terrain:debris' };
    case 'wall': return { cell: 'terrain:wall' };
    case 'wall_vert': return { cell: 'terrain:wall_vert' };
    default: return null;
  }
}

/**
 * Resolve an entity op (from batch.js) to a textured quad spec. In sprite mode a resolved sprite
 * key samples the sprite cell (with facing `turns` + a locked-door overlay); otherwise — no sprite
 * for this glyph, or sprites off/not loaded — it samples a procedural cell keyed by glyph+colour
 * (the effective colour already folds dim → DeviceDim, via batch.js `tint`). Alpha carries the
 * dim (0.7) fade so cells stay colour-baked but un-faded, exactly like canvas2d.
 * @param {{sprite:(string|null),turns?:number,tint:number,alpha?:number,glyph:number,overlay?:(string|null)}} op
 * @param {boolean} useSpr
 * @returns {{cell:string,alpha:number,turns:number,overlay:(string|null)}}
 */
export function resolveEntity(op, useSpr) {
  const alpha = op.alpha == null ? 1 : op.alpha;
  if (useSpr && op.sprite) {
    return {
      cell: 'spr:' + op.sprite,
      alpha,
      turns: op.turns || 0,
      overlay: op.overlay === 'lock-tint' ? LOCK_TINT : null,
    };
  }
  // Procedural: colour folded into the key (dim already reflected in op.tint); painters don't rotate.
  return { cell: 'proc:' + op.glyph + ':' + op.tint, alpha, turns: 0, overlay: null };
}

/**
 * Resolve an overlay op. Wash is a flat translucent lens fill; cursor + reticle are vector art
 * baked into atlas cells (the reticle's breathing pulse becomes a per-quad alpha from its phase,
 * since a baked cell can't animate — a documented approximation of the canvas gradient).
 * @param {{kind:string,x:number,y:number,bg?:number,phase?:number}} op
 * @returns {{flat:true,color:string}|{cell:string,alpha:number,turns:number}|null}
 */
export function resolveOverlay(op) {
  switch (op.kind) {
    case 'wash': return { flat: true, color: WASH[op.bg] };
    case 'cursor': return { cell: 'overlay:cursor', alpha: 1, turns: 0 };
    case 'reticle': return { cell: 'overlay:reticle', alpha: 0.55 + 0.45 * (op.phase == null ? 1 : op.phase), turns: 0 };
    default: return null;
  }
}

/**
 * The sorted, de-duplicated set of atlas cell keys a pass list needs (for the given sprite mode).
 * Flat ops (hull/void/wash) contribute nothing. Deterministic (sorted) so the atlas layout is
 * input-order-independent, matching packAtlas.
 * @param {{name:string,ops:any[]}[]} passes
 * @param {boolean} useSpr
 * @returns {string[]}
 */
export function collectCellKeys(passes, useSpr) {
  const keys = new Set();
  for (const p of passes) {
    for (const o of p.ops) {
      let spec = null;
      if (p.name === 'terrain') spec = resolveTerrain(o);
      else if (p.name === 'entities') spec = resolveEntity(o, useSpr);
      else if (p.name === 'overlay') spec = resolveOverlay(o);
      if (spec && spec.cell) keys.add(spec.cell);
    }
  }
  return [...keys].sort();
}

/**
 * A stable signature of the atlas an executor would need for these passes + mode. The executor
 * rebuilds (repack + rasterize + re-upload) exactly when this changes — a mode toggle flips the
 * leading tag, and a newly-visible glyph/colour extends the key list.
 * @param {{name:string,ops:any[]}[]} passes
 * @param {boolean} useSpr
 * @returns {string}
 */
export function atlasSignature(passes, useSpr) {
  return (useSpr ? 's' : 'p') + '|' + collectCellKeys(passes, useSpr).join(',');
}
