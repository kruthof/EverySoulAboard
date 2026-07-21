// WebGL2 batcher — PURE. Takes the backend-agnostic DisplayList that composeScene() produces
// and groups it into ordered RenderPasses ready for a WebGL2 executor to upload as instanced
// quad batches. This is the GL-side analogue of the per-op switch in canvas2d.js: it makes the
// SAME draw decisions (atlas key selection, facing-as-transform, tint/alpha, reticle phase) but
// emits them as plain data instead of issuing canvas calls. No DOM, no GL, no Image — data in,
// data out, deterministic for fixed inputs (timeSec is an INPUT, never a clock read here).
//
// Four passes, always in this fixed order (the GL executor draws them back-to-front):
//   0 terrain  — one quad per base tile: hull/void/floor/debris/wall (+ wall_vert run)
//   1 entities — devices/crew/items/doors; facing carried as `turns` (UV/vertex transform data)
//   2 light    — reserved: consumes op:'light' DrawOps when the sim emits them; empty until then
//   3 overlay  — lens wash, hover cursor, and the animated selection reticle (phase from timeSec)
//
// A RenderPass is { name, ops }. Every op carries a `kind` discriminator plus integer x,y:
//   terrain  { kind:'hull'|'void'|'floor'|'debris'|'wall'|'wall_vert', x, y }
//   entity   { kind:'entity', x, y, sprite, turns, tint, alpha, glyph, pv, overlay }
//   light    { kind:'light', x, y, state }                      (LightState byte; multiply pass)
//   overlay  { kind:'wash', x, y, bg } | { kind:'cursor', x, y } | { kind:'reticle', x, y, phase }
//
// `sprite` is the atlas key the GL executor should sample, or null when the glyph is drawn
// procedurally (no sprite exists for it). `kind` on a terrain op doubles as its atlas/fill key.

import { C } from '../palette.js';
import { PAWN_ROLES } from '../glyphs.js';

/** @typedef {import('../compose.js').DrawOp} DrawOp */
/** @typedef {{kind:string,x:number,y:number,[k:string]:any}} BatchOp */
/** @typedef {{name:string, ops:BatchOp[]}} RenderPass */

/** The fixed pass order. Load-bearing: terrain < entities < light < overlay. */
export const PASS_ORDER = ['terrain', 'entities', 'light', 'overlay'];

/**
 * Group a DisplayList into ordered RenderPasses. Pure + deterministic; never mutates `list`
 * or `opts`. Within a pass, ops keep the DisplayList's order (which composeScene already emits
 * base → entity → wash → cursor per tile, reticle last), so the GL executor's overdraw matches
 * the canvas skin exactly.
 * @param {DrawOp[]} list
 * @param {{timeSec?:number}} [opts]
 * @returns {RenderPass[]}
 */
export function buildPasses(list, opts = {}) {
  const timeSec = opts.timeSec || 0;
  const terrain = [];
  const entities = [];
  const light = [];
  const overlay = [];

  if (list) {
    for (const o of list) {
      switch (o.op) {
        case 'hull': terrain.push({ kind: 'hull', x: o.x, y: o.y }); break;
        case 'void': terrain.push({ kind: 'void', x: o.x, y: o.y }); break;
        case 'floor': terrain.push({ kind: 'floor', x: o.x, y: o.y }); break;
        case 'debris': terrain.push({ kind: 'debris', x: o.x, y: o.y }); break;
        case 'wall':
          // Deep hull mass (no open face) is a plain dark fill in both skins; a face draws the
          // panel, rotated for a vertical run — mirrors canvas2d _wall().
          terrain.push({ kind: o.face ? (o.vert ? 'wall_vert' : 'wall') : 'hull', x: o.x, y: o.y });
          break;
        case 'entity': entities.push(entityQuad(o)); break;
        case 'light': light.push(lightQuad(o)); break; // future: sim-driven lighting DrawOps
        case 'wash': overlay.push({ kind: 'wash', x: o.x, y: o.y, bg: o.bg }); break;
        case 'cursor': overlay.push({ kind: 'cursor', x: o.x, y: o.y }); break;
        case 'reticle': overlay.push({ kind: 'reticle', x: o.x, y: o.y, phase: reticlePhase(timeSec) }); break;
        default: break; // unknown ops are dropped, never thrown (forward-compat with new ops)
      }
    }
  }

  return [
    { name: 'terrain', ops: terrain },
    { name: 'entities', ops: entities },
    { name: 'light', ops: light },
    { name: 'overlay', ops: overlay },
  ];
}

/**
 * Selection-reticle pulse phase in [0,1], derived purely from the supplied time. Mirrors the
 * `0.5 + 0.5*sin(t*3.2)` breathing pulse the canvas reticle uses (procedural.paintSelection),
 * so both skins pulse in lockstep. Data only — the GL executor turns this into alpha/scale.
 * @param {number} timeSec
 */
export function reticlePhase(timeSec) {
  return 0.5 + 0.5 * Math.sin(timeSec * 3.2);
}

/** @returns {BatchOp} an entity quad with atlas/tint/facing resolved. */
function entityQuad(o) {
  const { sprite, overlay } = entitySprite(o);
  return {
    kind: 'entity',
    x: o.x,
    y: o.y,
    sprite,                                   // atlas key to sample, or null → procedural glyph
    turns: o.turns || 0,                      // facing as a quarter-turn UV/vertex transform
    tint: o.dim ? C.DeviceDim : o.fg,         // GlyphColor id (dim entities recolor, per canvas2d)
    alpha: o.dim ? 0.7 : 1,
    glyph: o.g,
    pv: o.pv,
    overlay,                                  // 'lock-tint' for a locked door, else null
  };
}

/**
 * Resolve an entity op to its atlas sprite key (or null for a procedural-only glyph), mirroring
 * the sprite-selection branches of canvas2d._entity(). composeScene already resolved facing-aware
 * roles into o.role (SPRITE_FOR_GLYPH); the remaining char cases (crew variants, doors, growbed,
 * terminal) are decided here.
 * @param {DrawOp} o
 * @returns {{sprite:(string|null), overlay:(string|null)}}
 */
function entitySprite(o) {
  if (o.role) return { sprite: o.role, overlay: null };
  const ch = String.fromCharCode(o.g);
  switch (ch) {
    case '@':
      // Crew: stable per-citizen variant → a pawn sprite; non-crew '@' is procedural.
      if (o.fg === C.Crew) return { sprite: PAWN_ROLES[o.pv || 0] || 'pawn', overlay: null };
      return { sprite: null, overlay: null };
    case '+': return { sprite: 'door', overlay: null };
    case 'X': return { sprite: 'door', overlay: 'lock-tint' }; // locked: door sprite + amber wash
    case '"': return { sprite: 'growbed', overlay: null };
    case 'T': return { sprite: 'terminal', overlay: null };
    default: return { sprite: null, overlay: null };            // corpse-open-door/items → procedural
  }
}

/** An op:'light' DrawOp → the light pass. Carries the LightState byte; the executor maps it to a
 *  multiply overlay via the palette (webgl2 light pass). Pure passthrough — no clock, no colour. */
function lightQuad(o) {
  return { kind: 'light', x: o.x, y: o.y, state: o.state };
}
