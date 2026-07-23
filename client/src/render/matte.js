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
//
// ── WHAT THE RELIGHT ACTUALLY BOUGHT (measured, and stated honestly) ─────────────────────────
// The first write-up of this work quoted "full-frame luma p50 17 → 19". That number is close to
// meaningless: the 2560x1440 slice frame is ~57 % dark console chrome, and averaging the deck in
// with the HUD understates the deck by ~20x. Re-measured on the CANVAS ONLY (x264-2236,
// y60-1256 of art/screenshot-test's near hero frame, pawn tiles excluded from both sides):
//
//                       p05      p50      p95
//   before             5.9     16.9     56.7
//   after              4.6     41.2    116.0     (re-measured here: 4.6 / 42.9 / 116.4)
//   Prison Architect  37.1    122.5    196.8
//
// So the deck's median went 17 → 41, not 17 → 19. It is still a long way under PA, and the shape
// of the gap is worth keeping in view: PA's floor never goes near-black (p05 37), ours does
// (p05 4.6 — that is space and unlit cabins in frame), and the LIT floor tiles here span only
// 13 luma p50→p95 (112.7 → 125.9), far flatter than PA's lit ground. The relight fixed the RANGE
// of the deck; it did not fix the flatness of a single lit room, and that is still an art problem,
// not a colour-maths one. The chroma ceilings below move colour only — they leave all of these
// value numbers unchanged.

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
// scale the chroma (with an optional ceiling), re-tint, recombine. Hue survives; only the value
// range and the amount of colour move. Alpha is never touched (so a figure's silhouette is
// exactly as generated).
//
//   inLo/inHi   the input luma window that carries this sprite class's real information
//   outLo/outHi where that window lands (this is the whole point: lift AND stretch)
//   gamma       curve inside the window (<1 opens the shadows)
//   sat         chroma multiplier — <1 desaturates the ENVIRONMENT, >1 saturates the CREW
//   chromaMax   HARD CEILING on the output chroma (max−min), or absent for "no ceiling"
//   tint        per-channel multiplier applied last (keeps the ship cool without a hue rotate)
//
// WHY A CEILING AND NOT JUST A MULTIPLIER (measured, not asserted). The relight's luma lift
// (outLo/outHi 18→205 at gamma 0.78) roughly TRIPLES the value of already-saturated dark art, so
// the few screaming pixels in the environment sprites — the wall's magenta conduit stripe, the
// ladder's magenta frame, the terminal/solar trim — crossed the visibility threshold and the deck
// started out-shouting the crew ~26:1. A pure `sat` cut fixes that only by flattening the whole
// class: struct.sat 0.6→0.30 takes the wall's MEAN chroma 13.7→6.8, i.e. it pays for three noisy
// percent by making the other ninety-seven monochrome. A ceiling is surgical — at struct 45 it
// clamps 6.6 % of wall pixels and leaves the warm/cool variation in the rest bit-identical, while
// the stripe survives as a calm line of colour instead of the loudest thing on the deck.
//
// Loud-pixel census on the near hero frame (chroma > 60 AND luma > 60, canvas only, attributed to
// the sprite that painted each pixel):   35 854 loud px, 2.0 % crew / 98.0 % environment
//                                    →    1 815 loud px, 39.7 % crew / 60.3 % environment.
// The wall conduit stripe (31 832 px, 88.8 % of the old total) and the ladder frame (875 px) both
// go to ZERO. What the ceilings CANNOT reach, and what the remainder now is: open doors painted
// procedurally from the semantic palette rather than from sprite art (680 px — procedural.js
// paintDoor, no open-door sprite exists), and props under the chroma-adding Dead light (315 px).
//
/** @typedef {{inLo:number,inHi:number,outLo:number,outHi:number,gamma:number,sat:number,chromaMax?:number,tint:number[]}} Grade */

/** @type {Record<string,Grade>} Grades by sprite class. */
export const GRADE = {
  // The deck plate: near-flat 46..72 art. It needs the biggest move — a ~3x stretch that both
  // lifts the median to a working ~113 AND pulls the latent plate seams out of the noise, which
  // is where the in-room value spread comes from. Desaturated hard: the deck is graphite, not lilac.
  // No ceiling: at sat 0.5 the graded plate tops out at chroma 14.7, nowhere near needing one.
  floor: { inLo: 44, inHi: 74, outLo: 78, outHi: 172, gamma: 1.0, sat: 0.5, tint: [1.02, 1.0, 0.99] },
  // The ship's SHELL (walls, debris) and anything unrecognised. Already carries range (wall spans
  // 19..139), so it only needs a lift with the shadows opened — plus the 45 ceiling, set at the
  // MEAN chroma of a graded crew sprite (pawn 45.4): no structural pixel may out-colour the
  // average pixel of a person. Measured effect on the wall: mean 13.7→12.3, p99 86.6→46.5.
  // NOTE: `tint` is applied AFTER the chromaMax clamp (see the Grade doc), so a warm tint here
  // would re-inflate a just-clamped pixel back over the ceiling and let a wall out-colour a crew
  // member — which defeats the ceiling's whole purpose. Wall WARMTH is therefore carried by the
  // light layer (lightfield.js AMBIENT_LIT + palette.js LIGHT[1], both warm), never by this tint.
  // Keep this near-neutral: it may nudge hue but must not add chroma the ceiling then can't hold.
  struct: { inLo: 8, inHi: 190, outLo: 18, outHi: 205, gamma: 0.78, sat: 0.6, chromaMax: 45, tint: [1.0, 0.99, 0.99] },
  // Props + devices (furniture, doors, terminals, machines). They are allowed MORE colour than the
  // shell — a lit terminal face or a locked door's amber IS a live machine state, which the brief
  // reserves saturation for — but not more than a crew member: sat 0.70 with a 50 ceiling puts the
  // loudest prop (solar, mean 62.9) at mean 37.6, i.e. the crew family (mean 67.5) reads 1.79x
  // louder than the loudest thing they walk past. There are 53 sprite entities to 8 crew on the
  // slice deck, so an un-capped prop class beats the crew on sheer count no matter how hot the
  // crew grade is — the ratio, not the crew's own saturation, is what makes people findable.
  //
  // Why 50 and not 55: props also have to survive the Dead light, which ADDS chroma rather than
  // just darkening (palette.js LIGHT[1]: a cool-leaning pixel comes out at 0.42*(B−R) + 51). No
  // sprite-side ceiling can fully calm an unlit cabin against a +51 term — that is the light, not
  // the art — but the extra headroom measurably helps at the margin: on the slice near shot the
  // unlit-cabin bed residue fell 403 → 315 loud pixels going from a 55 ceiling to a 50 one.
  prop: { inLo: 8, inHi: 190, outLo: 18, outHi: 205, gamma: 0.78, sat: 0.70, chromaMax: 50, tint: [1.0, 0.99, 0.99] },
  // Crew: lifted clear of the deck's shadow AND saturated hard, with NO ceiling — people are the
  // only thing on the stage allowed to run to full chroma (pawn_c reaches 218), and against a
  // capped environment they read instantly.
  crew: { inLo: 6, inHi: 200, outLo: 20, outHi: 235, gamma: 0.8, sat: 1.8, tint: [1.0, 1.0, 1.0] },
};

/**
 * Sprite keys that are furniture / fittings / machines. Explicit, because the DEFAULT has to be
 * the calm grade: an unrecognised key (a new sprite, a typo, a role the wire invents) must fail
 * SAFE into `struct` rather than silently join the loudest class on the deck.
 * @type {Set<string>}
 */
export const PROP_KEYS = new Set([
  'door', 'growbed', 'terminal', 'scrubber', 'watertank', 'radiator', 'solar', 'battery', 'vent',
  'light', 'ladder', 'reclaimer', 'fabricator', 'machineshop', 'recycler', 'bed', 'table', 'chair',
  'medbed', 'medcab', 'locker', 'desk', 'plant', 'corpse',
]);

/**
 * The grade a sprite key gets. Animation-variant keys ({role}#w0, {role}#broken) grade exactly
 * like their base role, so a walk cycle never flickers. Unknown keys get `struct` (see PROP_KEYS).
 * @param {string} key @returns {Grade}
 */
export function gradeFor(key) {
  const base = baseKey(key);
  if (base === 'floor') return GRADE.floor;
  if (isCrewKey(base)) return GRADE.crew;
  if (PROP_KEYS.has(base)) return GRADE.prop;
  return GRADE.struct;
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
 *
 * The chroma ceiling is a per-pixel cap, not a second multiplier: the effective saturation is
 * `min(sat, chromaMax / inputChroma)`, so a pixel whose graded chroma would land under the
 * ceiling passes through the plain `sat` path bit-for-bit and only the offenders are pulled back
 * to exactly `chromaMax`. Hue and luma are untouched by the cap.
 *
 * @param {Uint8ClampedArray|Uint8Array} data RGBA, length w*h*4
 * @param {number} w @param {number} h
 * @param {Grade} g
 * @returns {number} pixels touched (0 ⇒ the buffer is unchanged)
 */
export function gradePixels(data, w, h, g) {
  if (!data || !g || w <= 0 || h <= 0 || data.length < w * h * 4) return 0;
  const lut = levelsLut(g);
  const [tr, tg, tb] = g.tint;
  const cmax = g.chromaMax > 0 ? g.chromaMax : 0;
  let touched = 0;
  for (let o = 0; o < w * h * 4; o += 4) {
    if (data[o + 3] === 0) continue;
    const r = data[o], gr = data[o + 1], b = data[o + 2];
    const L = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    const L2 = lut[L < 0 ? 0 : L > 255 ? 255 : L | 0];
    let sat = g.sat;
    if (cmax) {
      const mx = r > gr ? (r > b ? r : b) : (gr > b ? gr : b);
      const mn = r < gr ? (r < b ? r : b) : (gr < b ? gr : b);
      const chroma = mx - mn;
      if (chroma * sat > cmax) sat = cmax / chroma; // chroma > 0 whenever the product exceeds cmax
    }
    data[o] = clamp255((L2 + (r - L) * sat) * tr);
    data[o + 1] = clamp255((L2 + (gr - L) * sat) * tg);
    data[o + 2] = clamp255((L2 + (b - L) * sat) * tb);
    touched++;
  }
  return touched;
}

// ── CREW ACCENT ─────────────────────────────────────────────────────────────────────────────

/**
 * The stage's crew accents: three saturated entries drawn from the console's own per-crew avatar
 * hue ring (ui/console-model.js CREW_HUES — #cf7a33, #5aa77f, #c25a3f, #e8934a, #b5652a, #8c8377;
 * grey is excluded, an accent that isn't saturated isn't an accent), so an accent on the deck is
 * at least drawn from the same box of pencils as CREW WATCH.
 *
 * NOT PARITY WITH CREW WATCH, and cannot be here. CREW WATCH picks one of SIX hues by an FNV-1a
 * hash of the CID, so its eight souls are eight (near-)distinct swatches. This accent is baked
 * into the sprite bitmap at load time (see paintUnderglow, called from sprites.js `_process`), so
 * the finest thing it can key off is the SPRITE KEY — i.e. `pv`, the pawn's wire variant, of
 * which there are three. Eight crew therefore share three deck accents, and a crew member's disc
 * will often be a different colour from their CREW WATCH avatar.
 *
 * Making it per-cid means moving the disc from load time to draw time (or minting per-cid atlas
 * cells), which is per-entity work inside canvas2d.js / render/webgl — a different lane's files.
 * Left as a known gap on purpose rather than half-claimed: see the crewAccent doc below.
 */
export const CREW_ACCENTS = ['#e8934a', '#5aa77f', '#c25a3f'];

/** Pawn role keys in wire order — mirrors render/glyphs.js PAWN_ROLES (the `pv` variant index). */
const PAWN_ORDER = ['pawn', 'pawn_b', 'pawn_c'];

/**
 * The accent for a crew sprite. DETERMINISTIC: the three shipped pawn roles map to the three
 * accents by wire-variant order, and any future role falls back to a stable string hash — the
 * same key always yields the same colour, in every session, on every machine.
 *
 * Keyed by SPRITE KEY (`pv`), not by `cid`: this runs once per decoded sprite, before any crew
 * member is attached to it. So it separates the pawn ROLES on the deck (three of them), not the
 * eight individual souls — the disc says "a person is standing here", not "Okonkwo is standing
 * here". Per-soul accents are a draw-time job for the executors; see CREW_ACCENTS above.
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
