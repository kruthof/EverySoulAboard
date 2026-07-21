// Matte scrub — PURE pixel-buffer surgery, no DOM. A few generated sprite frames shipped with
// an opaque white matte behind the figure (the spritegen key pass keys GREEN; when the image
// model ignores the requested backdrop and paints white, the key misses and the white square
// survives — e.g. the pawn walk frames that "blink white" in play). This module removes such
// mattes at load time: a flood fill from the image border that walks across transparent AND
// near-white low-chroma pixels, clearing the near-white ones to transparent. The figure's own
// white highlights survive because they are enclosed by non-white outline pixels the fill
// cannot cross; a frame with a proper transparent background is a no-op (the fill only visits
// already-transparent margin). Browser glue (canvas in/out) lives in sprites.js; this file is
// node-testable.

/** A background-matte pixel: bright, low-chroma (white → light grey). */
function isMatte(r, g, b) {
  const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
  return min >= 190 && (max - min) <= 40;
}

/**
 * Flood from every border pixel across background pixels (alpha 0, or opaque near-white) and
 * clear the near-white ones to fully transparent. Mutates `data` in place.
 * @param {Uint8ClampedArray|Uint8Array} data RGBA, length w*h*4
 * @param {number} w @param {number} h
 * @returns {number} how many pixels were cleared (0 ⇒ the buffer is unchanged)
 */
export function scrubMatte(data, w, h) {
  if (!data || w <= 0 || h <= 0 || data.length < w * h * 4) return 0;
  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (visited[i]) return;
    visited[i] = 1;
    const o = i * 4;
    const a = data[o + 3];
    if (a !== 0 && !isMatte(data[o], data[o + 1], data[o + 2])) return; // figure pixel — wall
    stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const i = stack.pop();
    const o = i * 4;
    if (data[o + 3] !== 0) { data[o + 3] = 0; cleared++; }
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return cleared;
}
