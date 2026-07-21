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

/** Zoom that fits the whole map in the viewport. */
export function fitZoom(cam, frame) {
  if (!frame) return 1;
  return Math.min(cam.viewW / (frame.w * cam.tile), cam.viewH / (frame.h * cam.tile));
}

/** Clamp zoom and centre in place (mutates cam). Mirrors Client.html clampCam. */
export function clampCam(cam, frame) {
  if (!frame) return cam;
  cam.z = Math.max(Math.min(fitZoom(cam, frame), 0.5), Math.min(cam.z, 5));
  const marg = 4; // keep at least a sliver of ship on screen
  cam.x = Math.max(-marg, Math.min(frame.w + marg, cam.x));
  cam.y = Math.max(-marg, Math.min(frame.h + marg, cam.y));
  return cam;
}

/** Screen transform for a camera: setTransform(s,0,0,s,ox,oy) draws tile (tx,ty) at tx*tile. */
export function transform(cam) {
  const s = cam.z;
  const ox = cam.viewW / 2 - cam.x * cam.tile * s;
  const oy = cam.viewH / 2 - cam.y * cam.tile * s;
  return { s, ox, oy };
}

/** Visible tile range [x0,x1) × [y0,y1), culled exactly like Client.html draw(). */
export function cullRange(cam, frame) {
  const { s, ox, oy } = transform(cam);
  const T = cam.tile;
  const x0 = Math.max(0, Math.floor(-ox / (T * s)));
  const x1 = Math.min(frame.w, Math.ceil((cam.viewW - ox) / (T * s)));
  const y0 = Math.max(0, Math.floor(-oy / (T * s)));
  const y1 = Math.min(frame.h, Math.ceil((cam.viewH - oy) / (T * s)));
  return { x0, x1, y0, y1 };
}

/** Device-pixel point -> tile coords (may be off-grid). Mirrors Client.html tileFromEvent. */
export function tileFromPoint(cam, px, py) {
  const { s, ox, oy } = transform(cam);
  const T = cam.tile;
  return { x: Math.floor((px - ox) / (T * s)), y: Math.floor((py - oy) / (T * s)) };
}

/** Zoom by a factor anchored on device-pixel point (px,py). Mutates + clamps cam. */
export function zoomAt(cam, frame, px, py, factor) {
  const s0 = cam.z;
  const before = {
    x: (px - (cam.viewW / 2 - cam.x * cam.tile * s0)) / (cam.tile * s0),
    y: (py - (cam.viewH / 2 - cam.y * cam.tile * s0)) / (cam.tile * s0),
  };
  cam.z = s0 * factor;
  clampCam(cam, frame);
  const s1 = cam.z;
  cam.x = before.x - (px - cam.viewW / 2) / (cam.tile * s1);
  cam.y = before.y - (py - cam.viewH / 2) / (cam.tile * s1);
  clampCam(cam, frame);
  return cam;
}

/** Pan by a device-pixel delta (drag). Mutates + clamps. */
export function panPixels(cam, frame, dxPx, dyPx) {
  cam.x -= dxPx / (cam.tile * cam.z);
  cam.y -= dyPx / (cam.tile * cam.z);
  return clampCam(cam, frame);
}

/** Pan by a fixed fraction of the viewport (keyboard WASD). Mutates + clamps. */
export function panByStep(cam, frame, dx, dy) {
  if (!frame) return cam;
  const stepX = Math.max(2, (cam.viewW / (cam.tile * cam.z)) / 6);
  const stepY = Math.max(2, (cam.viewH / (cam.tile * cam.z)) / 6);
  cam.x += dx * stepX;
  cam.y += dy * stepY;
  return clampCam(cam, frame);
}
