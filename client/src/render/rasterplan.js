// Procedural-atlas rasterization PLAN — PURE. The WebGL2 executor draws every tile as a quad
// that samples one atlas cell (or fills a flat colour). This module decides, for each RenderPass
// op, WHICH cell it needs and how the quad is tinted / rotated — mirroring the per-op branches of
// canvas2d.js, but as data (no DOM, no GL, no Image). The executor turns a cell key into pixels
// (webgl2.js `_paintCell`) and packs them with atlas.js; keeping the *decision* here makes it
// unit-testable and keeps the atlas contents deterministic.
//
// A "cell key" is a stable string naming a rasterized atlas tile:
//   terrain:{floor|wall|wall_vert|debris}   base terrain (sprite image OR procedural painter)
//   spr:{name}                              a loaded sprite image (sprite mode); {name} may be a C7
//                                           animation variant: {role}#broken/#off, {pawn}#w{frame}
//   proc:{glyphCode}:{colorId}              a procedural entity glyph baked at its effective colour
//   overlay:{cursor|reticle}                the vector hover cursor / selection reticle art
// hull/void terrain and the lens wash are flat fills — no cell, just a colour.
//
// Cell contents depend on `useSpr` (sprites requested AND loaded): in sprite mode terrain +
// entities sample sprite images; in procedural mode they sample baked vector cells. The executor
// keys its atlas on `atlasSignature(...)` so it rebuilds exactly when that set changes (mode
// toggle, or a new glyph/colour scrolls into view) — and not every frame.

import { C, FG, HULL, WASH } from './palette.js';
import { deviceSpriteKey, pawnSpriteKey, pawnFrameKeys, isAnimWalking } from './motion.js';

const G_CITIZEN = 64; // '@'

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
 * The sprite key an entity samples in sprite mode, honouring C7 animation variants when the caller
 * supplies the art maps + motion: a walking pawn cycles its SPRITE_FRAMES (by `timeSec`), a device
 * picks its SPRITE_STATES broken/off variant from its colour/dim. Absent maps → the base key.
 * @param {{sprite:string, glyph:number, tint:number, alpha?:number, x?:number, y?:number}} op
 * @param {{motion?:Object, timeSec?:number, states?:Object, frames?:Object}} opts
 * @returns {string}
 */
function spriteVariant(op, opts) {
  const base = op.sprite;
  if (op.glyph === G_CITIZEN && opts.frames) {
    const entry = opts.motion && opts.motion[op.x + ',' + op.y];
    // isAnimWalking: hold the walk sprite for the whole slide (slide-aware) — no walking↔standing
    // flicker and no standing-pose ice-skate when a gliding pawn's frame hold expires mid-slide.
    return pawnSpriteKey(base, isAnimWalking(entry, opts.nowMs), opts.timeSec || 0, opts.frames);
  }
  if (opts.states) return deviceSpriteKey(base, op.tint, op.alpha != null && op.alpha < 1, opts.states);
  return base;
}

/**
 * Resolve an entity op (from batch.js) to a textured quad spec. In sprite mode a resolved sprite
 * key samples the sprite cell (with facing `turns` + a locked-door overlay); otherwise — no sprite
 * for this glyph, or sprites off/not loaded — it samples a procedural cell keyed by glyph+colour
 * (the effective colour already folds dim → DeviceDim, via batch.js `tint`). Alpha carries the
 * dim (0.7) fade so cells stay colour-baked but un-faded, exactly like canvas2d. `opts` (optional,
 * C7) threads the animation maps + motion so a walking pawn / broken device samples its variant.
 * @param {{sprite:(string|null),turns?:number,tint:number,alpha?:number,glyph:number,overlay?:(string|null),x?:number,y?:number}} op
 * @param {boolean} useSpr
 * @param {{motion?:Object, timeSec?:number, states?:Object, frames?:Object}} [opts]
 * @returns {{cell:string,alpha:number,turns:number,overlay:(string|null)}}
 */
export function resolveEntity(op, useSpr, opts = {}) {
  const alpha = op.alpha == null ? 1 : op.alpha;
  if (useSpr && op.sprite) {
    return {
      cell: 'spr:' + spriteVariant(op, opts),
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
export function collectCellKeys(passes, useSpr, opts = {}) {
  const keys = new Set();
  for (const p of passes) {
    for (const o of p.ops) {
      if (p.name === 'entities') {
        // A walking pawn bakes ALL its walk frames into the atlas so the atlas stays stable as
        // timeSec advances (only the SAMPLED frame changes per-frame, never the atlas contents).
        // Bake gate MUST match the sample gate (spriteVariant) — same slide-aware isAnimWalking with
        // the same nowMs — or a slide-held pawn would sample a walk frame the atlas never baked.
        if (useSpr && o.sprite && o.glyph === G_CITIZEN && opts.frames &&
            opts.motion && isAnimWalking(opts.motion[o.x + ',' + o.y], opts.nowMs)) {
          for (const k of pawnFrameKeys(o.sprite, opts.frames)) keys.add('spr:' + k);
          continue;
        }
        const spec = resolveEntity(o, useSpr, opts);
        if (spec.cell) keys.add(spec.cell);
        continue;
      }
      let spec = null;
      if (p.name === 'terrain') spec = resolveTerrain(o);
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
export function atlasSignature(passes, useSpr, opts = {}) {
  return (useSpr ? 's' : 'p') + '|' + collectCellKeys(passes, useSpr, opts).join(',');
}
