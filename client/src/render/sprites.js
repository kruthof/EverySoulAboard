// Sprite runtime — loads the generated anchor-sprite set into Image objects and provides the
// rotation / vertical-wall caches the executor draws from. Browser-only (uses Image / an
// offscreen canvas); the pure composer and the golden tests never touch this. Port of the
// SPR / rotatedSprite / wallVertical machinery in hosts/web/Client.html.

import {
  SPRITE_URIS, SPRITE_TILE, SPRITE_FACING, SPRITE_NO_ROTATE, SPRITE_STATES, SPRITE_FRAMES,
} from '../../assets/sprites.g.js';
import { VARIANT } from './motion.js';
import { scrubMatte, gradeFor, gradePixels, crewAccent, isCrewKey, baseKey, paintUnderglow } from './matte.js';

export { SPRITE_TILE, SPRITE_FACING, SPRITE_NO_ROTATE };

// Flatten the animation maps into the same {key → dataURI} shape as SPRITE_URIS, using the exact
// variant keys motion.js resolves ({role}#broken / {role}#off / {pawn}#w{frame}), so the runtime
// loads them alongside the base set and `get(key)` returns them with no special-casing.
function variantUris() {
  const out = {};
  for (const role in SPRITE_STATES) {
    const s = SPRITE_STATES[role];
    if (s.broken) out[role + VARIANT.BROKEN] = s.broken;
    if (s.off) out[role + VARIANT.OFF] = s.off;
  }
  for (const role in SPRITE_FRAMES) {
    const frames = SPRITE_FRAMES[role];
    for (let i = 0; i < frames.length; i++) out[role + VARIANT.FRAME + i] = frames[i];
  }
  return out;
}

/** Sprite metadata the pure composer needs (facing/no-rotate); no image data. */
export const spriteMeta = { facing: SPRITE_FACING, noRotate: SPRITE_NO_ROTATE };

export class SpriteAssets {
  /** @param {() => void} onReady called once every sprite image has decoded. */
  constructor(onReady) {
    /** @type {Record<string, HTMLImageElement>} */
    this.img = {};
    this._rotCache = {};
    this._wallV = null;
    // Base sprites + the C7 animation variants (broken/off states, pawn walk frames) share one map.
    const uris = { ...SPRITE_URIS, ...variantUris() };
    // Readiness gates on the BASE set only, so a partial/absent animation map never blocks sprite
    // mode (the variant keys resolve to base sprites until — if ever — their images decode).
    this._baseTotal = Object.keys(SPRITE_URIS).length;
    this._baseLoaded = 0;
    for (const k of Object.keys(uris)) {
      const image = new Image();
      const isBase = Object.prototype.hasOwnProperty.call(SPRITE_URIS, k);
      image.onload = () => {
        const fixed = this._process(image, k);
        if (fixed) this.img[k] = fixed;
        if (isBase && ++this._baseLoaded === this._baseTotal && onReady) onReady();
      };
      image.src = uris[k];
      this.img[k] = image;
    }
  }

  /**
   * The load-time pixel passes (all pure — see matte.js), run ONCE per decoded sprite:
   *   1. matte scrub — a generated frame whose white backdrop survived the pipeline's key pass
   *      gets it cleared. Scoped to the pawn sprites + their walk frames (the only art class that
   *      has exhibited the defect) so a light-toned full-bleed tile can never be gutted by the
   *      border flood. MUST run before the grade, which would otherwise darken the matte into
   *      something the near-white flood no longer recognises.
   *   2. value-range relight — lifts the shipped art off the floor of the value scale so a lit
   *      interior has somewhere to sit and an unlit one still reads (see matte.js GRADE).
   *   3. crew underglow — the deterministic per-crew accent disc, painted into the transparent
   *      margin AFTER the scrub has finished walking that margin.
   * @returns {HTMLCanvasElement|null} the corrected canvas, or null to keep the original Image.
   */
  _process(image, key) {
    try {
      const crew = isCrewKey(baseKey(key));
      const grade = gradeFor(key);
      if (!crew && !grade) return null;
      const c = document.createElement('canvas');
      c.width = image.naturalWidth; c.height = image.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(image, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height);
      let touched = 0;
      if (crew) touched += scrubMatte(id.data, c.width, c.height);
      if (grade) touched += gradePixels(id.data, c.width, c.height, grade);
      if (crew) touched += paintUnderglow(id.data, c.width, c.height, crewAccent(key));
      if (!touched) return null;
      g.putImageData(id, 0, 0);
      return c;
    } catch { return null; } // tainted/odd context — keep the original image
  }

  /** All BASE sprite images decoded? (animation variants load opportunistically alongside.) */
  get ready() { return this._baseLoaded === this._baseTotal; }

  /** Whether to draw sprites: requested mode AND everything loaded. */
  usable(spriteMode) { return spriteMode && this.ready; }

  /** Base sprite image by role (or a variant key). */
  get(name) { return this.img[name]; }

  /** The image for a key IF it has decoded, else null — animation variants may lag or be absent, so
   *  the executor falls back to the base sprite when a variant image isn't ready. A matte-scrubbed
   *  entry is a canvas (always ready); an Image gates on complete+naturalWidth as before. */
  decoded(name) {
    const im = this.img[name];
    if (!im) return null;
    if (typeof im.getContext === 'function') return im; // scrubbed canvas — ready by construction
    return im.complete && im.naturalWidth ? im : null;
  }

  /** Rotated (quarter-turns CW) copy of a role sprite, cached. */
  rotated(role, turns) {
    const key = role + '#' + turns;
    if (this._rotCache[key]) return this._rotCache[key];
    const src = this.img[role];
    const c = document.createElement('canvas');
    c.width = c.height = src.width;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(turns * Math.PI / 2);
    g.drawImage(src, -c.width / 2, -c.height / 2);
    return (this._rotCache[key] = c);
  }

  /** The wall sprite rotated 90° for a vertical run, cached. */
  wallVertical() {
    if (this._wallV) return this._wallV;
    const src = this.img.wall;
    const c = document.createElement('canvas'); c.width = c.height = src.width;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2);
    g.drawImage(src, -c.width / 2, -c.height / 2);
    return (this._wallV = c);
  }
}
