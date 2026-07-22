// Sprite pixel surgery — PURE, no DOM. Two passes run once per sprite at load time (browser glue
// in sprites.js; everything here is node-testable):
//
//   scrubMatte  — removes a white backdrop the spritegen key pass missed (the original defect).
//   gradePixels — the VALUE-RANGE RELIGHT. The shipped art is cohesive but pitched very low and
//                 very flat: the floor tile spans luma 54→65 (eleven levels) at a median of 56, so
//                 a lit interior had nowhere to sit on the value scale and the whole deck read as
//                 one mud. This is a colour problem, not an asset problem, so it is fixed by
//                 grading the decoded pixels rather than by regenerating art.
//   paintUnderglow — the CREW ACCENT. Prison Architect's legibility trick is a *small* saturated
//                 area on a desaturated field; our crew were desaturated grey-brown on desaturated
//                 purple. Each pawn gets a deterministic accent disc under its feet, drawn into
//                 the sprite's own transparent margin so it never fights the figure's art.
//
// Everything is a pure function of (pixels, spec) — same input, same output, no time, no RNG.

// A few generated sprite frames shipped with
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

// ── VALUE-RANGE RELIGHT ─────────────────────────────────────────────────────────────────────
//
// Per pixel: split it into luminance + chroma, re-map the luminance through a levels+gamma curve,
// scale the chroma, re-tint, recombine. Hue survives; only the value range and the amount of
// colour move. Alpha is never touched (so a figure's silhouette is exactly as generated).
//
//   inLo/inHi   the input luma window that carries this sprite class's real information
//   outLo/outHi where that window lands (this is the whole point: lift AND stretch)
//   gamma       curve inside the window (<1 opens the shadows)
//   sat         chroma multiplier — <1 desaturates the ENVIRONMENT, >1 saturates the CREW
//   tint        per-channel multiplier applied last (keeps the ship cool without a hue rotate)
//
/** @typedef {{inLo:number,inHi:number,outLo:number,outHi:number,gamma:number,sat:number,tint:number[]}} Grade */

/** @type {Record<string,Grade>} Grades by sprite class. */
export const GRADE = {
  // The deck plate: near-flat 46..72 art. It needs the biggest move — a ~3x stretch that both
  // lifts the median to a working ~113 AND pulls the latent plate seams out of the noise, which
  // is where the in-room value spread comes from. Desaturated hard: the deck is graphite, not lilac.
  floor: { inLo: 44, inHi: 74, outLo: 78, outHi: 172, gamma: 1.0, sat: 0.5, tint: [1.02, 1.0, 0.99] },
  // The ship's SHELL (walls, debris). Already carries range (wall spans 19..139), so it only
  // needs a lift with the shadows opened — plus a firm desaturation, because the wall art's
  // magenta conduit stripe runs along every corridor and at full chroma it out-shouts the crew.
  // The stripe survives as a line of colour; it just stops being the loudest thing on the deck.
  struct: { inLo: 8, inHi: 190, outLo: 18, outHi: 205, gamma: 0.78, sat: 0.6, tint: [1.0, 0.99, 0.99] },
  // Props + devices (furniture, doors, terminals, machines): same lift, chroma left alone — a lit
  // terminal face or a locked door's amber IS a live machine state, which the brief reserves
  // saturation for. There are few of them, so they read as accents rather than as wallpaper.
  prop: { inLo: 8, inHi: 190, outLo: 18, outHi: 205, gamma: 0.78, sat: 1.0, tint: [1.0, 0.99, 0.99] },
  // Crew: lifted clear of the deck's shadow AND saturated hard. People are the only thing on the
  // stage allowed this much chroma; against a 0.5-sat environment they read instantly.
  crew: { inLo: 6, inHi: 200, outLo: 20, outHi: 235, gamma: 0.8, sat: 1.8, tint: [1.0, 1.0, 1.0] },
};

/**
 * The grade a sprite key gets, or null for keys that must stay untouched. Animation-variant keys
 * ({role}#w0, {role}#broken) grade exactly like their base role, so a walk cycle never flickers.
 * @param {string} key @returns {Grade|null}
 */
export function gradeFor(key) {
  const base = baseKey(key);
  if (base === 'floor') return GRADE.floor;
  if (base === 'wall' || base === 'debris') return GRADE.struct;
  if (isCrewKey(base)) return GRADE.crew;
  return GRADE.prop;
}

/** The role part of a sprite key, dropping any `#variant` suffix. */
export function baseKey(key) {
  const i = String(key).indexOf('#');
  return i < 0 ? String(key) : String(key).slice(0, i);
}

/** Crew sprites (the pawn family) — the only class that gets saturated + accented. */
export function isCrewKey(base) {
  return /^pawn(_[a-z0-9]+)?$/.test(base);
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** 256-entry input-luma → output-luma table for a grade (pure; identical for identical specs). */
function levelsLut(g) {
  const lut = new Float64Array(256);
  const span = g.inHi - g.inLo || 1;
  for (let v = 0; v < 256; v++) {
    let t = (v - g.inLo) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (g.gamma !== 1) t = Math.pow(t, g.gamma);
    lut[v] = g.outLo + t * (g.outHi - g.outLo);
  }
  return lut;
}

/**
 * Apply a grade to an RGBA buffer in place. Fully transparent pixels are skipped (their RGB is
 * meaningless and grading them would only bleed colour into the atlas's bilinear edges).
 * @param {Uint8ClampedArray|Uint8Array} data RGBA, length w*h*4
 * @param {number} w @param {number} h
 * @param {Grade} g
 * @returns {number} pixels touched (0 ⇒ the buffer is unchanged)
 */
export function gradePixels(data, w, h, g) {
  if (!data || !g || w <= 0 || h <= 0 || data.length < w * h * 4) return 0;
  const lut = levelsLut(g);
  const [tr, tg, tb] = g.tint;
  let touched = 0;
  for (let o = 0; o < w * h * 4; o += 4) {
    if (data[o + 3] === 0) continue;
    const r = data[o], gr = data[o + 1], b = data[o + 2];
    const L = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    const L2 = lut[L < 0 ? 0 : L > 255 ? 255 : L | 0];
    data[o] = clamp255((L2 + (r - L) * g.sat) * tr);
    data[o + 1] = clamp255((L2 + (gr - L) * g.sat) * tg);
    data[o + 2] = clamp255((L2 + (b - L) * g.sat) * tb);
    touched++;
  }
  return touched;
}

// ── CREW ACCENT ─────────────────────────────────────────────────────────────────────────────

/**
 * The stage's crew accents. Deliberately the leading saturated entries of the console's own
 * per-crew avatar hue ring (docs/design/perilune-game-ui.visual-spec.md §"avatar hues":
 * #cf7a33, #5aa77f, #c25a3f, #e8934a, #b5652a, #8c8377) so a crew member's colour on the deck
 * speaks the same language as their colour in CREW WATCH. Grey (#8c8377) is excluded — an accent
 * that isn't saturated isn't an accent.
 */
export const CREW_ACCENTS = ['#e8934a', '#5aa77f', '#c25a3f'];

/** Pawn role keys in wire order — mirrors render/glyphs.js PAWN_ROLES (the `pv` variant index). */
const PAWN_ORDER = ['pawn', 'pawn_b', 'pawn_c'];

/**
 * The accent for a crew sprite. DETERMINISTIC: the three shipped pawn roles map to the three
 * accents by wire-variant order, and any future role falls back to a stable string hash — the
 * same key always yields the same colour, in every session, on every machine.
 * @param {string} key sprite key (variant suffixes are ignored)
 * @returns {string} '#rrggbb'
 */
export function crewAccent(key) {
  const base = baseKey(key);
  const i = PAWN_ORDER.indexOf(base);
  if (i >= 0) return CREW_ACCENTS[i % CREW_ACCENTS.length];
  let hash = 0;
  for (let n = 0; n < base.length; n++) hash = (hash * 31 + base.charCodeAt(n)) >>> 0;
  return CREW_ACCENTS[hash % CREW_ACCENTS.length];
}

/** '#rrggbb' → [r,g,b]. */
function hexRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paint a soft accent disc into the sprite's transparent margin, under the figure's feet, and
 * composite the existing pixels OVER it (dst-over-src) so nothing of the figure is covered.
 * The disc is placed and sized from the figure's own opaque bounding box, so it follows a walk
 * frame's bob instead of sitting at a fixed offset. No-op on a fully opaque or fully empty tile.
 * @param {Uint8ClampedArray|Uint8Array} data RGBA, length w*h*4
 * @param {number} w @param {number} h
 * @param {string} hex accent colour (see crewAccent)
 * @param {{peak?:number, falloff?:number}} [opts]
 * @returns {number} pixels touched (0 ⇒ the buffer is unchanged)
 */
export function paintUnderglow(data, w, h, hex, opts = {}) {
  if (!data || w <= 0 || h <= 0 || data.length < w * h * 4) return 0;
  const peak = opts.peak == null ? 0.62 : opts.peak;
  const falloff = opts.falloff == null ? 1.6 : opts.falloff;

  // Figure bounding box (alpha ≥ 16 ignores the anti-aliased fringe).
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxX - minX < 2 || maxY - minY < 2) return 0; // empty tile — nothing to stand on

  const cx = (minX + maxX) / 2;
  const cy = maxY - (maxY - minY) * 0.06;          // at the feet, not the centre of mass
  const rx = (maxX - minX) * 0.82 + w * 0.03;
  const ry = rx * 0.42;                             // squashed: it reads as a disc on the deck
  const [ar, ag, ab] = hexRgb(hex);

  let touched = 0;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, Math.ceil(cx + rx)); x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1) continue;
      const ga = peak * Math.pow(1 - d, falloff);
      if (ga <= 0.002) continue;
      const o = (y * w + x) * 4;
      const da = data[o + 3] / 255;
      if (da >= 0.996) continue;                    // fully covered by the figure — leave it
      const outA = da + ga * (1 - da);
      if (outA <= 0) continue;
      const k = (ga * (1 - da)) / outA, j = (da) / outA;
      data[o] = clamp255(data[o] * j + ar * k);
      data[o + 1] = clamp255(data[o + 1] * j + ag * k);
      data[o + 2] = clamp255(data[o + 2] * j + ab * k);
      data[o + 3] = clamp255(outA * 255);
      touched++;
    }
  }
  return touched;
}
