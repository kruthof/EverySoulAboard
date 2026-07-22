// lightfield — PURE. The stage's ONE light model, shared by both executors.
//
// It answers two questions with one set of constants, so the ship reads as a single coherently
// lit place rather than a set of independent effects:
//
//   1. WP-3 LIGHT POOLS. Where is it bright? Emitter tiles ('*' Light devices, powered) throw a
//      radial pool with wall occlusion. The result is a scalar field sampled at TILE CORNERS, so
//      neighbouring tiles share their corner values and the pool is a continuous gradient across
//      the grid instead of the flat per-tile step the light overlay used to be.
//   2. WP-1 GROUNDING SHADOWS. Which way does the light come from? ONE fixed direction
//      (LIGHT_DIR), from which the whole shadow projection is derived — every pawn, device and
//      prop is pushed once more, black, SQUASHED onto the ground plane and sheared down-light,
//      before the entity batch. One direction, one look. See `shadowQuad`.
//
// ── WHY A MULTIPLY, AND WHAT THAT COSTS ────────────────────────────────────────────────────────
// The light pass composites as `dst *= M`. A multiply can only DARKEN, so "warm pool" cannot mean
// "add light at the lamp" — it means "take less away near the lamp". Hence two anchors:
//   POOL_CORE   the multiply at an emitter: essentially untouched, and WARM (blue pulled down)
//   AMBIENT_LIT the multiply in a powered room the pool does not reach: COOL (red pulled down)
// and the per-corner value is `lerp(ambient(tileState), POOL_CORE, E)`. The target look is the
// agreed one — "a cold ship with warm rooms in it".
//
// ── HOW DEEP THE AMBIENT MAY BE — the constraint that sets AMBIENT_LIT ────────────────────────
// Because a multiply can only darken, every luma of pool CONTRAST inside a powered room has to be
// paid for by darkening the whole room. The first cut of this file bought its contrast with
// AMBIENT_LIT at luma 0.700 on EVERY powered tile — and with 5 lamps ship-wide at LIGHT_RADIUS 9,
// most of a powered deck is "no pool reaches it", so that was not a pool, it was a second dimming
// pass over the ship. Measured on the slice hero frame it cost the bright end 11-25% (p90
// 112.7 -> 84.0, p95 115.9 -> 96.7, p99 124.9 -> 110.9, std -20%) and cut the lit:unlit separation
// ~1.9x -> ~1.4x — spending back most of the stage relight, which had raised the deck's p50 from
// 17 to 41 for exactly this reason. Widening LIGHT_RADIUS until the metric recovered would have
// been cheating: it hides the ambient rather than fixing it.
//
// So the ambient is shallow and the contrast is bought mostly in CHROMA, where it is nearly free:
// the cool cast is spent in RED (luma weight 0.2126) and the warm core in BLUE (0.0722), the two
// cheapest channels, leaving GREEN (0.7152 — most of luma) close to untouched in both. The result:
//
//   AMBIENT_LIT  luma 0.883   r:b 0.72     a 12% recess in a lit room's far corner
//   POOL_CORE    luma 0.986   r:b 1.18     the core reads 11.6% brighter AND 1.63x warmer
//
// A 12% recess is what an ambient pass SHOULD cost a lit room; 30% was a relight regression.
// And where the pool buys real brightness it costs nothing at all: an unlit cabin taking spill
// through a doorway starts from the Dead palette multiply (0.529) and SPILL_MAX lifts it toward
// POOL_CORE — a lift of 0.16, half again the whole powered-room budget. Pools read hardest exactly
// where the ship is dark, which is where they should.
//
// ── THE FOG GATE ───────────────────────────────────────────────────────────────────────────────
// Two independent guarantees, both load-bearing:
//   (a) A light quad is emitted ONLY for a tile the DISPLAY LIST already shows as explored terrain
//       (floor / debris / wall). `hull` (which composeScene emits for every unexplored tile) and
//       `void` are never touched, so the fog mass keeps its exact HULL colour and no gradient can
//       ever trace structure the player has not earned.
//   (b) A FOG TILE IS OPAQUE. `blocks()` treats unexplored space exactly like a wall, so no ray
//       is ever traced THROUGH the unknown — an emitter behind the fog line cannot pull a lit
//       wedge onto explored floor and hint at what is back there.
// Emitters themselves come from the frame's own glyphs, and a fog cell is ' '/Unknown, never '*'.
//
// Pure + deterministic: same (list, frame) in, byte-identical mesh out. `scratch` is an optional
// caller-owned buffer bag that keeps the big window-sized buffers off the allocator; it never
// carries state between calls (every used region is rewritten before it is read).
//
// ALLOCATION, honestly: a build allocates nothing per tile and nothing per emitter (the window
// buffers come from `scratch`; the emitter list and the corner indices are module-level, bounded
// by MAX_EMITTERS and 4). What it DOES still allocate is `stateAmbient`'s small rgb arrays — at
// most one per distinct LightState in the window, so ≤ 4 per build, not per tile. And the build
// itself is off the 30 Hz path anyway: main.js memoizes it on (frame, camera), so it runs once per
// wire frame while the reticle/slide loop redraws from the same mesh.

import { C, ATTR_DIM, litOverlay } from './palette.js';
import { G_WALL, G_FOG_SPACE } from './glyphs.js';

/** Glyph code of a Light device — the emitter. (Glyphs.cs: DeviceKind.Light => '*'.) */
export const G_LIGHT = 42;

/** Pool reach in tiles. Beyond this an emitter contributes exactly 0 (finite support = bounded cost). */
export const LIGHT_RADIUS = 9;

/** Hard cap on emitters considered per frame (row-major order). Bounds the worst-case ray cost on a
 *  lamp-dense procedural ship; the authored slice ships 5 lights ship-wide, so it never binds. */
export const MAX_EMITTERS = 24;

/**
 * The multiply at the heart of a pool: full red, near-full green, blue pulled down — WARM, at a
 * luma cost of 1.4%. Blue is the cheapest channel to spend (luma weight 0.0722), which is why the
 * warmth is spent there and nowhere else.
 */
export const POOL_CORE = [1.00, 0.995, 0.85];

/**
 * The multiply in a POWERED room no pool reaches. COOL — red pulled down 28%, green 8%, blue
 * untouched. Luma 0.8833: a 12% recess against the un-lit-pass baseline of 1.0, which is what a
 * "far corner of a lit room" should cost. The previous 0.700 was not a recess, it was a second
 * dimming pass over the whole ship (see the header).
 */
export const AMBIENT_LIT = [0.72, 0.92, 1.00];

/**
 * The floor a powered room must keep: `luma(stateAmbient(4)) >= AMBIENT_LUMA_FLOOR`. A lit room's
 * far corner may be recessed, but the stage relight raised the deck's p50 from 17 to 41 and this
 * pass must not spend that back. Test-enforced (lightfield.test.js "AMBIENT FLOOR"), not
 * decorative — the 0.700 first cut fails it by a wide margin.
 */
export const AMBIENT_LUMA_FLOOR = 0.85;

/**
 * Spill ceiling for a tile whose OWN light state is not Powered. Light really does come through a
 * doorway, and the wedge it lays on a dark cabin floor is most of why this is worth doing — but a
 * Dead room must still read as Dead, so borrowed light is capped well short of a lit room's value.
 */
export const SPILL_MAX = 0.35;

/** Ray-march step (tiles) and the perpendicular offset of the two extra rays that soften shadow edges. */
export const RAY_STEP = 0.75;
export const PENUMBRA = 0.38;

// ── The one light direction — the art bible's AD-3, verbatim ──────────────────────────────────
// docs/design/perilune-art-direction.md AD-3: "One key light, from the upper left: azimuth 315°
// in plan, elevation 55°." AD-5 then rules that shadows are RENDERER, always — the art contains
// none — so this file owns the shadow, and it must agree with the light the sprites are painted
// under, or every form's baked shade step would point one way and its cast shadow another.

/** Key-light elevation above the deck, degrees (AD-3). Sets how far a shadow reaches. */
export const LIGHT_ELEVATION_DEG = 55;

/** Ground reach per unit of caster height: a form of height h throws its top's shadow
 *  h/tan(elevation) away along the plan. At 55° that is 0.700h. */
const SHADOW_REACH = 1 / Math.tan((LIGHT_ELEVATION_DEG * Math.PI) / 180);

/** Unit vector pointing TOWARD the key light: azimuth 315° in plan (AD-3) — the exact up-left
 *  diagonal, not an approximation of one. Everything directional in the renderer is derived from
 *  this and nothing else. */
export const LIGHT_DIR = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

/** How far the shadow's CONTACT point sits from the caster's own foot, in tiles. Small on purpose:
 *  it is the nudge that keeps a wide sprite from hiding its own shadow completely, not the
 *  shadow's length — the length is the squash + shear below. */
export const SHADOW_LENGTH = 0.12;

/** The grounding-shadow contact offset in TILE units: straight down-light. Added in tile space
 *  (before the pitch multiply) so it scales with zoom and never fights the integer pixel grid. */
export const SHADOW_OFFSET = {
  x: -LIGHT_DIR.x * SHADOW_LENGTH,
  y: -LIGHT_DIR.y * SHADOW_LENGTH,
};

/**
 * Vertical extent of a shadow, as a fraction of the caster's cell, anchored at its FOOT LINE.
 *
 * This is the whole difference between a grounding shadow and an artefact. The first cut of WP-1
 * drew an unsheared, unscaled, FULL-SIZE offset copy of the sprite; on a round lamp that reads
 * fine, but on a pawn it reads as a second dark pawn walking alongside, and on the square terminal
 * (a solid 0.55x0.71-tile box) it reads as a hard-edged black rectangle most of a tile across.
 * Squashed and sheared, that same terminal shadow is 0.65 x 0.32 of a tile, confined to the foot.
 *
 * The number is DERIVED, not tuned: the top of a cell-tall form reaches SHADOW_REACH along the
 * plan, of which `-LIGHT_DIR.y` is the part that runs down-screen. AD-1 draws the ground plane
 * dead top-down, so a plan distance in y is drawn 1:1 in y — no extra camera term. 0.700 * 0.7071.
 *
 * DELIBERATE STYLIZATION, stated plainly: the band is laid BACK from the foot line (up into the
 * caster's own cell) rather than forward from it. A forward projection is what physics says, but
 * it puts the whole shadow in clear floor, and a hard-edged silhouette in clear floor is exactly
 * the slab this package exists to remove. Laid back, the caster covers most of its own shadow and
 * only the down-light margin shows — which is what "grounding" means.
 */
export const SHADOW_SQUASH = SHADOW_REACH * -LIGHT_DIR.y;

/**
 * Horizontal lean, in tile widths per tile of caster height: the other component of the same
 * reach. At azimuth 315° the x and y components are equal, so shear == squash — the shadow of a
 * form's top lands on the exact down-light diagonal, which is the only reading of AD-3 that keeps
 * the renderer's shadow and the art's baked shade step pointing the same way.
 */
export const SHADOW_SHEAR = SHADOW_REACH * -LIGHT_DIR.x;

/** Opacity of a grounding shadow at an entity's own opacity. Black, never a tinted smear. */
export const SHADOW_ALPHA = 0.35;

/**
 * The four corners of the grounding shadow of a cell drawn at (x,y) with side `d`, in TL,TR,BR,BL
 * order — the executors' quad winding, and the same order `pushTex` builds its corners in.
 *
 * ONE function so the two backends cannot drift: WebGL2 pushes these four positions straight into
 * its vertex array; Canvas2D turns them back into the affine matrix that maps the silhouette's
 * source rect onto them (TL is the origin, TR-TL the u axis, BL-TL the v axis — exact, because the
 * map is affine). Units are whatever `d` is in: tile-space for canvas2d, device px for GL.
 *
 * @param {number} x left of the caster's cell
 * @param {number} y top of the caster's cell
 * @param {number} d cell side
 * @param {Float64Array} [out] length-8 destination (written in place)
 * @returns {Float64Array} [x0,y0, x1,y1, x2,y2, x3,y3]
 */
export function shadowQuad(x, y, d, out = new Float64Array(8)) {
  const lean = SHADOW_SHEAR * d;                       // the top edge's down-light lead
  const left = x + SHADOW_OFFSET.x * d;
  const top = y + d * (1 - SHADOW_SQUASH) + SHADOW_OFFSET.y * d;
  const bot = y + d + SHADOW_OFFSET.y * d;
  out[0] = left + lean; out[1] = top;      // TL
  out[2] = left + lean + d; out[3] = top;  // TR
  out[4] = left + d; out[5] = bot;         // BR
  out[6] = left; out[7] = bot;             // BL
  return out;
}

/** Floats per mesh quad: x, y, then TL,TR,BR,BL as rgb triples. */
export const MESH_STRIDE = 14;

const EMPTY_F32 = new Float32Array(0);

// Per-build scratch that is BOUNDED by a constant (unlike the per-frame buffers, which scale with
// the window and therefore live in the caller's `scratch` bag). buildLightMesh is synchronous and
// never re-entered, and every slot is written before it is read.
const EX = new Float64Array(MAX_EMITTERS), EY = new Float64Array(MAX_EMITTERS);
const CORNERS = new Int32Array(4);
const EMPTY_MESH = { count: 0, data: EMPTY_F32, stride: MESH_STRIDE };

/** DisplayList ops that name an explored terrain tile — exactly the tiles a light quad may cover. */
const LIT_OPS = { floor: 1, debris: 1, wall: 1 };

/** `rgba(r,g,b,a)` (the palette's over-blend form) → the equivalent multiply M = (1-a) + C*a. */
function paletteMultiply(rgba) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([.\d]+)\s*)?\)/.exec(rgba);
  if (!m) return [1, 1, 1];
  const a = m[4] == null ? 1 : Number(m[4]);
  return [1, 2, 3].map((i) => (1 - a) + (Number(m[i]) / 255) * a);
}

/**
 * The ambient multiply for a tile with the given LightState byte — what the tile looks like where
 * no pool reaches it.
 *   Powered(4) / absent : AMBIENT_LIT — the room has a working lamp, this is just the far corner.
 *   Brownout(3)         : the palette's amber, further dimmed by AMBIENT_LIT (a shed room is a lit
 *                         room running on fumes; its own lamp is Dim and is not an emitter).
 *   Dead(1)/Emergency(2): the palette value UNCHANGED. These are already the unlit rungs of the
 *                         three-dark-states ladder (palette.js) — darkening them again would walk
 *                         an unlit room down into the hull mass and the ladder would collapse.
 * @param {number} state LightState byte
 * @returns {number[]} rgb multiply
 */
export function stateAmbient(state) {
  const rgba = litOverlay(state);
  if (!rgba) return AMBIENT_LIT.slice();
  const m = paletteMultiply(rgba);
  if (state === 3) return [m[0] * AMBIENT_LIT[0], m[1] * AMBIENT_LIT[1], m[2] * AMBIENT_LIT[2]];
  return m;
}

/** Radial falloff, 1 at the lamp and 0 with a flat tangent at LIGHT_RADIUS (no visible pool rim). */
export function falloff(d) {
  if (d >= LIGHT_RADIUS) return 0;
  const t = 1 - (d * d) / (LIGHT_RADIUS * LIGHT_RADIUS);
  return t * t;
}

/** True when tile (tx,ty) stops light. Walls stop it; so does FOG — see the fog gate note above.
 *  Off-grid reads as a blocker, matching glyphs.js `glyphCodeAt`. */
function blocks(frame, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= frame.w || ty >= frame.h) return true;
  const c = frame.cells[ty * frame.w + tx];
  if (!c) return true;
  if (c[0] === G_WALL) return true;
  if (c[0] === G_FOG_SPACE && c[1] === C.Unknown) return true;
  return false;
}

/** True when nothing blocks the open segment (ax,ay)→(bx,by). Endpoints are excluded so a lamp's
 *  own tile and the target corner's own tiles never self-occlude. */
function rayClear(frame, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(d / RAY_STEP));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocks(frame, Math.floor(ax + dx * t), Math.floor(ay + dy * t))) return false;
  }
  return true;
}

/**
 * Visibility of a corner from an emitter in {0, 1/3, 2/3, 1}: three rays, the outer two offset
 * perpendicular to the line of sight by PENUMBRA, so a shadow edge steps rather than snaps. With
 * PENUMBRA at 0 all three rays coincide and this collapses to a hard {0,1} step — which is why the
 * intermediate values are asserted directly in lightfield.test.js ("PENUMBRA"), and why this is
 * exported rather than private.
 */
export function visibility(frame, ex, ey, cx, cy) {
  const dx = cx - ex, dy = cy - ey;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return 1;
  const px = -dy / d, py = dx / d;
  let clear = 0;
  for (let k = -1; k <= 1; k++) {
    if (rayClear(frame, ex + px * PENUMBRA * k, ey + py * PENUMBRA * k, cx, cy)) clear++;
  }
  return clear / 3;
}

/** A reusable buffer bag for buildLightMesh. Optional — omit it and every call allocates fresh. */
export function createLightScratch() {
  return { lit: null, state: null, E: null, data: null };
}

function u8(scratch, key, n) {
  if (!scratch) return new Uint8Array(n);
  if (!scratch[key] || scratch[key].length < n) scratch[key] = new Uint8Array(n);
  else scratch[key].fill(0, 0, n);
  return scratch[key];
}

function f32(scratch, key, n) {
  if (!scratch) return new Float32Array(n);
  if (!scratch[key] || scratch[key].length < n) scratch[key] = new Float32Array(n);
  else scratch[key].fill(0, 0, n);
  return scratch[key];
}

/**
 * Build the light pass as a vertex-coloured multiply mesh.
 *
 * @param {import('./compose.js').DrawOp[]} list the composed DisplayList — the fog-gated authority
 *   on which tiles exist and what LightState each carries.
 * @param {{w:number,h:number,cells:number[][]}} frame the decoded frame. Read ONLY for emitters and
 *   occluders, and deliberately NOT culled to the viewport: a lamp just off-screen must still light
 *   the floor that is on-screen, or rooms would darken as you pan.
 * @param {ReturnType<createLightScratch>} [scratch] optional reusable buffers (frame-path allocation).
 * @returns {{count:number, data:Float32Array, stride:number}} `count` quads, each MESH_STRIDE floats:
 *   [tileX, tileY, r,g,b (TL), r,g,b (TR), r,g,b (BR), r,g,b (BL)] — corner order matching the
 *   executors' quad winding (TL, TR, BR, BL).
 */
export function buildLightMesh(list, frame, scratch = null) {
  if (!list || !list.length || !frame || !frame.cells) return EMPTY_MESH;

  // ---- 1. the lit window: bounds over the terrain ops the display list actually carries ----
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of list) {
    if (!LIT_OPS[o.op]) continue;
    if (o.x < x0) x0 = o.x;
    if (o.x > x1) x1 = o.x;
    if (o.y < y0) y0 = o.y;
    if (o.y > y1) y1 = o.y;
  }
  if (x1 < x0) return EMPTY_MESH;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;

  const lit = u8(scratch, 'lit', W * H);
  const state = u8(scratch, 'state', W * H);
  state.fill(4, 0, W * H); // Powered is the default: composeScene emits no light op for it
  let quads = 0;
  for (const o of list) {
    if (LIT_OPS[o.op]) {
      const i = (o.y - y0) * W + (o.x - x0);
      if (!lit[i]) { lit[i] = 1; quads++; }
    } else if (o.op === 'light') {
      if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) state[(o.y - y0) * W + (o.x - x0)] = o.state;
    }
  }
  if (!quads) return EMPTY_MESH;

  // ---- 2. emitters: powered '*' glyphs within reach of the lit window (frame-wide, not culled) ----
  // EX/EY are module-level and MAX_EMITTERS long — the emitter scan must not allocate.
  const ex = EX, ey = EY;
  let en = 0;
  const sx0 = Math.max(0, x0 - LIGHT_RADIUS), sx1 = Math.min(frame.w - 1, x1 + LIGHT_RADIUS);
  const sy0 = Math.max(0, y0 - LIGHT_RADIUS), sy1 = Math.min(frame.h - 1, y1 + LIGHT_RADIUS);
  for (let y = sy0; y <= sy1 && en < MAX_EMITTERS; y++) {
    for (let x = sx0; x <= sx1 && en < MAX_EMITTERS; x++) {
      const c = frame.cells[y * frame.w + x];
      if (!c || c[0] !== G_LIGHT) continue;
      if ((c[3] & ATTR_DIM) !== 0) continue; // unpowered / shed lamp: dark, not an emitter
      if (c[1] === C.Broken) continue;       // broken lamp: dark
      ex[en] = x + 0.5; ey[en] = y + 0.5; en++;
    }
  }

  // ---- 3. the corner field ----
  const CW = W + 1, CH = H + 1;
  const E = f32(scratch, 'E', CW * CH);
  for (let e = 0; e < en; e++) {
    const lx = ex[e], ly = ey[e];
    // Only corners inside the lamp's finite support can change; clamp that circle to the window.
    const ci0 = Math.max(0, Math.floor(lx - LIGHT_RADIUS) - x0);
    const ci1 = Math.min(CW - 1, Math.ceil(lx + LIGHT_RADIUS) - x0);
    const cj0 = Math.max(0, Math.floor(ly - LIGHT_RADIUS) - y0);
    const cj1 = Math.min(CH - 1, Math.ceil(ly + LIGHT_RADIUS) - y0);
    for (let j = cj0; j <= cj1; j++) {
      const cy = y0 + j;
      for (let i = ci0; i <= ci1; i++) {
        const cx = x0 + i;
        const dx = cx - lx, dy = cy - ly;
        const f = falloff(Math.sqrt(dx * dx + dy * dy));
        if (f <= 0) continue;
        const v = visibility(frame, lx, ly, cx, cy);
        if (v <= 0) continue;
        const k = j * CW + i;
        E[k] = 1 - (1 - E[k]) * (1 - f * v); // soft union: overlapping lamps saturate, never clip
      }
    }
  }

  // ---- 4. one quad per lit tile, four corner colours ----
  const need = quads * MESH_STRIDE;
  let data;
  if (scratch) {
    if (!scratch.data || scratch.data.length < need) scratch.data = new Float32Array(need);
    data = scratch.data;
  } else {
    data = new Float32Array(need);
  }
  let p = 0;
  const amb = [0, 0, 0];
  let ambState = -1;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!lit[j * W + i]) continue;
      const st = state[j * W + i];
      if (st !== ambState) {
        const a = stateAmbient(st);
        amb[0] = a[0]; amb[1] = a[1]; amb[2] = a[2];
        ambState = st;
      }
      const cap = st === 4 ? 1 : SPILL_MAX;
      data[p++] = x0 + i;
      data[p++] = y0 + j;
      // TL, TR, BR, BL — the executors' quad winding. Indexed off a 4-long module-level array
      // rather than a fresh `[k, k+1, ...]` per tile: this loop runs once per lit tile (~2,600 on
      // an establishing shot) and used to be the last per-tile allocation in the build.
      const k = j * CW + i;
      CORNERS[0] = k; CORNERS[1] = k + 1; CORNERS[2] = k + CW + 1; CORNERS[3] = k + CW;
      for (let q = 0; q < 4; q++) {
        const t = Math.min(E[CORNERS[q]], cap);
        data[p++] = amb[0] + (POOL_CORE[0] - amb[0]) * t;
        data[p++] = amb[1] + (POOL_CORE[1] - amb[1]) * t;
        data[p++] = amb[2] + (POOL_CORE[2] - amb[2]) * t;
      }
    }
  }
  return { count: quads, data, stride: MESH_STRIDE };
}

/**
 * Bilinear sample of a mesh quad's four corner colours at (u,v) in [0,1]² — the executors' shared
 * definition of "what colour is it inside the tile". WebGL2 gets this for free from vertex
 * interpolation; Canvas2D, which has no per-vertex colour, calls this at sub-tile centres.
 * @param {Float32Array} data mesh data
 * @param {number} q quad index
 * @param {number} u
 * @param {number} v
 * @param {number[]} out length-3 destination (written in place)
 */
export function sampleQuad(data, q, u, v, out) {
  const b = q * MESH_STRIDE + 2;
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
  for (let c = 0; c < 3; c++) {
    out[c] = data[b + c] * w0 + data[b + 3 + c] * w1 + data[b + 6 + c] * w2 + data[b + 9 + c] * w3;
  }
  return out;
}
