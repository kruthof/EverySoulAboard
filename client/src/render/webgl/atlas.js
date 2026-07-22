// Sprite-atlas packing math — PURE. Given a set of named sprite sizes, compute where each lands
// in a single texture (placements) and its normalized sample rectangle (UV). The actual
// rasterization — drawing each sprite Image into a GPU texture at its placement — happens in the
// WebGL2 executor package later; NOTHING here touches an Image, a canvas, or GL. This module is
// just the geometry, so it is fully unit-testable and deterministic.
//
// Layout is a padded shelf (row) packer: sprites are placed left-to-right in name order, wrapping
// to a new shelf when the row would exceed maxWidth. Sorting by name makes the layout independent
// of input order (shuffled input → identical atlas), which is what "deterministic layout" means.
// The final texture dimensions are rounded up to powers of two (GPU-friendly); an ATLAS_PAD gutter
// between sprites prevents bilinear/mip bleed. Placements never overlap; every UV rect stays within
// [0,1).
//
// TWO anti-bleed measures live here, and they only work together:
//   1. ATLAS_BORDER = 4px of replicated edge pixels owned EXCLUSIVELY by each cell. A 1px gutter is
//      already half a texel by mip level 1, so neighbouring cells leak into each other the moment
//      the view minifies; 4px still leaves a full clean texel at mip 2, which is the level the
//      zoomed-out establishing view samples. Because the border is exclusive, the default gutter
//      BETWEEN two cells is 2 * ATLAS_BORDER — if neighbours shared one 4px gutter, each cell's
//      replication would overwrite the other's and the protection would be illusory.
//      The RASTERIZER must actually fill that border by REPLICATING each cell's edge pixels
//      outward (see webgl2.js _replicateEdges) — transparent padding would make LINEAR filtering
//      pull premultiplied zero in and ring every sprite with a dark halo.
//   2. UV_INSET_TEXELS — the half-texel guard, measured and deliberately set to 0. See the constant.

/** @typedef {{name:string, w:number, h:number}} SpriteSize */
/** @typedef {{x:number, y:number, w:number, h:number}} Placement */
/** @typedef {{u0:number, v0:number, u1:number, v1:number}} UVRect */
/** @typedef {{width:number, height:number, placements:Record<string,Placement>, uv:Record<string,UVRect>}} Atlas */

/**
 * Width (px) of the replicated edge border each cell owns on every side. Wide enough that a mip-2
 * fetch — the level the zoomed-out establishing view lands on — still finds a whole clean texel
 * outside the cell.
 */
export const ATLAS_BORDER = 4;

/** Default gutter between cells: each neighbour's border, side by side, never overlapping. */
export const ATLAS_PAD = 2 * ATLAS_BORDER;

/**
 * How far (in texels) each cell's sample rect stops SHORT of the cell's true edge.
 *
 * The textbook anti-bleed hack is half a texel. It is WRONG here, and measurably so. The correct
 * mapping for a w-texel cell drawn across `pitch` device pixels puts pixel i at texel
 * `p.x + (i + 0.5) * w / pitch`; at the new max zoom (pitch == w == 128) that is exactly texel
 * centre p.x + i + 0.5 — pixel-perfect, zero resampling. A half-texel inset instead maps 128 pixels
 * across 127 texels, so the tap drifts up to half a texel off centre and bilinear smears every
 * sample. Shot at 1:1 on the slice (2560x1440, ship stage only), inset vs none:
 *
 *     mean |grad luma|   1.552  vs  2.075   (-25%)
 *     Laplacian variance 140.8  vs  260.7   (-46%)
 *     HF energy > .25 Nyq 3.95% vs  6.08%   (-35%)
 *
 * i.e. the guard would have thrown away a third of the crispness this whole change exists to buy,
 * at precisely the zoom the player notices. It is unnecessary because ATLAS_BORDER already fills
 * the gutter with replicated edge pixels: at mip level L a tap strays at most 0.5 texel past the
 * edge while the border is 4 / 2^L texels wide, so the tap lands on a copy of the edge pixel for
 * every L <= 3 — and clampCam's minimum zoom keeps the ship well inside that.
 *
 * TO RE-ARM (e.g. if ATLAS_BORDER is ever reduced, or a much wider map pushes past mip 3): set
 * this to 0.5. Nothing else changes.
 */
export const UV_INSET_TEXELS = 0;

/**
 * Pack named sprite sizes into a single atlas.
 * @param {SpriteSize[]} sprites  list of {name,w,h}; order is irrelevant (sorted by name)
 * @param {{padding?:number, maxWidth?:number}} [opts]
 *   padding  gutter in px between sprites and at the atlas edge (default ATLAS_PAD)
 *   maxWidth shelf-wrap threshold in px before power-of-two rounding (default 512)
 * @returns {Atlas}
 */
export function packAtlas(sprites, opts = {}) {
  const pad = opts.padding == null ? ATLAS_PAD : opts.padding;
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

  // Cell EDGE mapping (see UV_INSET_TEXELS): u spans the cell's outer boundaries, so a quad drawn
  // `w` device px wide samples every texel centre exactly once. The inset is clamped to half the
  // cell so it can never invert the rect on a degenerate 1px cell.
  /** @type {Record<string,UVRect>} */
  const uv = {};
  for (const name of Object.keys(placements)) {
    const p = placements[name];
    const ix = Math.min(UV_INSET_TEXELS, p.w / 2), iy = Math.min(UV_INSET_TEXELS, p.h / 2);
    uv[name] = {
      u0: (p.x + ix) / width,
      v0: (p.y + iy) / height,
      u1: (p.x + p.w - ix) / width,
      v1: (p.y + p.h - iy) / height,
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
