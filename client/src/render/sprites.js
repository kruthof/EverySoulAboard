// Sprite runtime — loads the generated anchor-sprite set into Image objects and provides the
// rotation / vertical-wall caches the executor draws from. Browser-only (uses Image / an
// offscreen canvas); the pure composer and the golden tests never touch this. Port of the
// SPR / rotatedSprite / wallVertical machinery in hosts/web/Client.html.

import { SPRITE_URIS, SPRITE_TILE, SPRITE_FACING, SPRITE_NO_ROTATE } from '../../assets/sprites.g.js';

export { SPRITE_TILE, SPRITE_FACING, SPRITE_NO_ROTATE };

/** Sprite metadata the pure composer needs (facing/no-rotate); no image data. */
export const spriteMeta = { facing: SPRITE_FACING, noRotate: SPRITE_NO_ROTATE };

export class SpriteAssets {
  /** @param {() => void} onReady called once every sprite image has decoded. */
  constructor(onReady) {
    /** @type {Record<string, HTMLImageElement>} */
    this.img = {};
    this._loaded = 0;
    this._total = Object.keys(SPRITE_URIS).length;
    this._rotCache = {};
    this._wallV = null;
    for (const k of Object.keys(SPRITE_URIS)) {
      const image = new Image();
      image.onload = () => { if (++this._loaded === this._total && onReady) onReady(); };
      image.src = SPRITE_URIS[k];
      this.img[k] = image;
    }
  }

  /** All sprite images decoded? */
  get ready() { return this._loaded === this._total; }

  /** Whether to draw sprites: requested mode AND everything loaded. */
  usable(spriteMode) { return spriteMode && this.ready; }

  /** Base sprite image by role. */
  get(name) { return this.img[name]; }

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
