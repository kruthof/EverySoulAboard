// Camera math — the canvas is a viewport; zoom scales tiles, pan moves the view. Pure
// functions ported from hosts/web/Client.html (fitZoom / clampCam / draw cull / tileFromEvent
// / wheel / pan). Kept side-effect-free so the scene composer and the golden tests can share
// exactly the runtime's geometry.
//
// A "camera descriptor" is a plain object: { x, y, z, viewW, viewH, tile }
//   x, y  : tile coords at the viewport centre
//   z     : zoom factor applied to `tile` (device pixels per tile = tile * z)
//   viewW : canvas backing width  (device px)
//   viewH : canvas backing height (device px)
//   tile  : logical tile size in px (SPRITE_TILE in sprite mode, 26 procedural)

/** @typedef {{x:number,y:number,z:number,viewW:number,viewH:number,tile:number}} Camera */

/**
 * ── MAX ZOOM CEILING ────────────────────────────────────────────────────────────────────────────
 * The largest number of DEVICE pixels one tile may occupy. The source art is 128x128 and the atlas
 * bakes every cell at 128x128 (rasterplan CELL), so 128 device px/tile is exactly 1:1 — the point
 * past which zooming in can only invent detail the art does not have, and no sampling filter can
 * rescue it (NEAREST stair-steps, LINEAR smears).
 *
 * TO RELAX: raise this one number (e.g. `= 256` allows 2x upscale past the art, roughly the old
 * behaviour's headroom). Nothing else needs to change.
 */
export const MAX_TILE_DEVICE_PX = 128;

/** Largest zoom factor this camera may reach, given its logical tile size. */
export function maxZoom(cam) { return MAX_TILE_DEVICE_PX / cam.tile; }

/**
 * ── PIXEL GRID ──────────────────────────────────────────────────────────────────────────────────
 * Device pixels per tile, quantized to a whole number. Every drawn quad is placed at
 * `tileIndex * pitch + origin`, so an integer pitch and an integer origin put every tile seam
 * exactly on a device-pixel boundary. Fractional pitches were the third crispness bug: each seam
 * landed mid-pixel and the resampler smeared it differently per column, which reads as a soft,
 * shimmering grid.
 *
 * This snaps the CAMERA GRID ONLY. Sub-tile motion (the continuous pawn slide) is added in TILE
 * space before this multiply — `(x + slide) * pitch` — so it keeps full float precision and the
 * pawns still glide. Never round a pawn's position here.
 */
export function tilePitch(cam) { return Math.max(1, Math.round(cam.tile * cam.z)); }

/** Zoom that fits the whole map in the viewport. */
export function fitZoom(cam, frame) {
  if (!frame) return 1;
  return Math.min(cam.viewW / (frame.w * cam.tile), cam.viewH / (frame.h * cam.tile));
}

/** Clamp zoom and centre in place (mutates cam). Mirrors Client.html clampCam. */
export function clampCam(cam, frame) {
  if (!frame) return cam;
  cam.z = Math.max(Math.min(fitZoom(cam, frame), 0.5), Math.min(cam.z, maxZoom(cam)));
  const marg = 4; // keep at least a sliver of ship on screen
  cam.x = Math.max(-marg, Math.min(frame.w + marg, cam.x));
  cam.y = Math.max(-marg, Math.min(frame.h + marg, cam.y));
  return cam;
}

/**
 * Screen transform for a camera: setTransform(s,0,0,s,ox,oy) draws tile (tx,ty) at tx*tile.
 * `s` is derived from the QUANTIZED pitch (so tile*s is a whole number of device px) and the
 * origin is rounded, so the whole tile lattice sits on the device-pixel grid. Panning therefore
 * advances in whole device pixels — at Retina dpr that is a half CSS pixel, invisible, and it is
 * what stops the seams from crawling.
 */
export function transform(cam) {
  const pitch = tilePitch(cam);
  const s = pitch / cam.tile;
  const ox = Math.round(cam.viewW / 2 - cam.x * pitch);
  const oy = Math.round(cam.viewH / 2 - cam.y * pitch);
  return { s, ox, oy };
}

/** Visible tile range [x0,x1) × [y0,y1), culled exactly like Client.html draw(). */
export function cullRange(cam, frame) {
  const { ox, oy } = transform(cam);
  const p = tilePitch(cam); // == tile * s, exactly, with no float residue
  const x0 = Math.max(0, Math.floor(-ox / p));
  const x1 = Math.min(frame.w, Math.ceil((cam.viewW - ox) / p));
  const y0 = Math.max(0, Math.floor(-oy / p));
  const y1 = Math.min(frame.h, Math.ceil((cam.viewH - oy) / p));
  return { x0, x1, y0, y1 };
}

/** Device-pixel point -> tile coords (may be off-grid). Mirrors Client.html tileFromEvent. */
export function tileFromPoint(cam, px, py) {
  const { ox, oy } = transform(cam);
  const p = tilePitch(cam);
  return { x: Math.floor((px - ox) / p), y: Math.floor((py - oy) / p) };
}

/**
 * Zoom by a factor anchored on device-pixel point (px,py). Mutates + clamps cam.
 * Reads the anchor through the SAME quantized transform the frame was drawn with, so the tile
 * under the cursor is the tile the user actually sees there.
 */
export function zoomAt(cam, frame, px, py, factor) {
  const t0 = transform(cam), p0 = tilePitch(cam);
  const before = { x: (px - t0.ox) / p0, y: (py - t0.oy) / p0 };
  cam.z = cam.z * factor;
  clampCam(cam, frame);
  const p1 = tilePitch(cam);
  cam.x = before.x - (px - cam.viewW / 2) / p1;
  cam.y = before.y - (py - cam.viewH / 2) / p1;
  clampCam(cam, frame);
  return cam;
}

/** Pan by a device-pixel delta (drag). Mutates + clamps. */
export function panPixels(cam, frame, dxPx, dyPx) {
  const p = tilePitch(cam);
  cam.x -= dxPx / p;
  cam.y -= dyPx / p;
  return clampCam(cam, frame);
}

/** Pan by a fixed fraction of the viewport (keyboard WASD). Mutates + clamps. */
export function panByStep(cam, frame, dx, dy) {
  if (!frame) return cam;
  const p = tilePitch(cam);
  const stepX = Math.max(2, (cam.viewW / p) / 6);
  const stepY = Math.max(2, (cam.viewH / p) / 6);
  cam.x += dx * stepX;
  cam.y += dy * stepY;
  return clampCam(cam, frame);
}
