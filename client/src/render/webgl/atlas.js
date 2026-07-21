// Sprite-atlas packing math — PURE. Given a set of named sprite sizes, compute where each lands
// in a single texture (placements) and its normalized sample rectangle (UV). The actual
// rasterization — drawing each sprite Image into a GPU texture at its placement — happens in the
// WebGL2 executor package later; NOTHING here touches an Image, a canvas, or GL. This module is
// just the geometry, so it is fully unit-testable and deterministic.
//
// Layout is a padded shelf (row) packer: sprites are placed left-to-right in name order, wrapping
// to a new shelf when the row would exceed maxWidth. Sorting by name makes the layout independent
// of input order (shuffled input → identical atlas), which is what "deterministic layout" means.
// The final texture dimensions are rounded up to powers of two (GPU-friendly); a 1px gutter
// between sprites prevents bilinear bleed. Placements never overlap; every UV rect stays within
// [0,1).

/** @typedef {{name:string, w:number, h:number}} SpriteSize */
/** @typedef {{x:number, y:number, w:number, h:number}} Placement */
/** @typedef {{u0:number, v0:number, u1:number, v1:number}} UVRect */
/** @typedef {{width:number, height:number, placements:Record<string,Placement>, uv:Record<string,UVRect>}} Atlas */

/**
 * Pack named sprite sizes into a single atlas.
 * @param {SpriteSize[]} sprites  list of {name,w,h}; order is irrelevant (sorted by name)
 * @param {{padding?:number, maxWidth?:number}} [opts]
 *   padding  gutter in px between sprites and at the atlas edge (default 1)
 *   maxWidth shelf-wrap threshold in px before power-of-two rounding (default 512)
 * @returns {Atlas}
 */
export function packAtlas(sprites, opts = {}) {
  const pad = opts.padding == null ? 1 : opts.padding;
  const maxW = opts.maxWidth == null ? 512 : opts.maxWidth;

  const entries = [...sprites].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  /** @type {Record<string,Placement>} */
  const placements = {};

  if (entries.length === 0) return { width: 1, height: 1, placements, uv: {} };

  let x = pad, y = pad, shelfH = 0, usedW = pad;
  for (const s of entries) {
    // Wrap to a new shelf when this sprite would overflow the row (but never wrap an empty row,
    // so a single sprite wider than maxWidth still gets placed).
    if (x > pad && x + s.w + pad > maxW) {
      y += shelfH + pad;
      x = pad;
      shelfH = 0;
    }
    placements[s.name] = { x, y, w: s.w, h: s.h };
    x += s.w + pad;
    usedW = Math.max(usedW, x);
    shelfH = Math.max(shelfH, s.h);
  }

  const contentW = usedW;            // includes the trailing gutter
  const contentH = y + shelfH + pad; // bottom gutter
  const width = pow2(contentW);
  const height = pow2(contentH);

  /** @type {Record<string,UVRect>} */
  const uv = {};
  for (const name of Object.keys(placements)) {
    const p = placements[name];
    uv[name] = {
      u0: p.x / width,
      v0: p.y / height,
      u1: (p.x + p.w) / width,
      v1: (p.y + p.h) / height,
    };
  }

  return { width, height, placements, uv };
}

/** Smallest power of two >= n (>= 1). */
export function pow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
