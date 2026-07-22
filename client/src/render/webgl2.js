// WebGL2 executor — the GPU backend. Implements the SAME `.execute(list, ctx, opts)` contract as
// Canvas2DExecutor (see executor.js), so main.js swaps it in behind `?exec=webgl2` without the
// pure core knowing. It feeds the PURE `buildPasses` output (webgl/batch.js) through the PURE
// rasterization plan (rasterplan.js) into the thin GL layer (webgl/gl.js):
//
//   startup / on-demand : rasterize procedural painters (procedural.js) AND loaded sprite images
//                         (sprites.js) into ONE canvas-backed atlas at packAtlas placements, then
//                         upload it once. Rebuilds only when the atlas signature changes (sprite
//                         toggle, or a new glyph/colour scrolls into view).
//   per frame           : pass walk → interleaved quad batches. terrain (flat hull/void + textured
//                         base tiles), shadows (every sprite entity's own cell, black, squashed
//                         onto the ground and sheared down-light — WP-1, lightfield.js shadowQuad),
//                         entities (atlas sprite or baked proc cell,
//                         facing via UV rotation, dim via alpha, locked-door amber overlay), light
//                         (the WP-3 vertex-coloured multiply mesh, or the legacy flat per-tile
//                         overlay when no mesh is supplied), overlay (lens wash flat +
//                         cursor/reticle cells, reticle alpha from phase).
//
// Only construction + execute touch the DOM/GL; every DECISION lives in the pure modules, which
// are golden-/unit-tested. Context loss surfaces via `onContextLost` so main.js can fall back to
// Canvas2D mid-session without crashing the frame loop.

import { GLContext, VERTEX_STRIDE } from './webgl/gl.js';
import { buildPasses } from './webgl/batch.js';
import { packAtlas, ATLAS_BORDER } from './webgl/atlas.js';
import {
  CELL, collectCellKeys, atlasSignature, resolveTerrain, resolveEntity, resolveOverlay,
} from './rasterplan.js';
import { transform, tilePitch } from './camera.js';
import { C, FG, litOverlay } from './palette.js';
import { slideOffset, baseSpriteKey } from './motion.js';
import { shadowQuad, SHADOW_ALPHA, MESH_STRIDE } from './lightfield.js';
import { SPRITE_STATES, SPRITE_FRAMES } from '../../assets/sprites.g.js';
import * as P from './procedural.js';

/** '#rrggbb' or 'rgb[a](...)' → [r,g,b,a] in 0..1. */
function parseColor(str) {
  if (!str) return [0, 0, 0, 0];
  if (str[0] === '#') {
    const n = parseInt(str.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] == null ? 1 : p[3]];
  }
  return [0, 0, 0, 1];
}

/** [r,g,b,a] → premultiplied [r*a,g*a,b*a,a] (the blend + shaders expect premultiplied). */
function premul(c) { return [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]]; }

const CLEAR = premul(parseColor(FG[C.Unknown])); // deep-fog field behind everything (matches canvas2d)

// Quad corner order (position): TL, TR, BR, BL. Two triangles: TL,TR,BR + TL,BR,BL.
const TRI = [0, 1, 2, 0, 2, 3];
const BASE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]]; // per-corner (u,v) selectors into a UV rect

/** Push a flat (untextured) quad's 6 vertices into `arr`. rgba is premultiplied. */
function pushFlat(arr, x, y, d, rgba) {
  const corners = [[x, y], [x + d, y], [x + d, y + d], [x, y + d]];
  for (const i of TRI) {
    const c = corners[i];
    arr.push(c[0], c[1], 0, 0, rgba[0], rgba[1], rgba[2], rgba[3]);
  }
}

/**
 * Push a textured quad. `uv` is {u0,v0,u1,v1}; `turns` rotates the sampled cell by quarter-turns
 * CW (facing), matching sprites.rotated in the canvas skin; `alpha` fades it (premultiplied white).
 *
 * `tint` (optional, premultiplied rgba) replaces that white: the fragment shader computes
 * `texel * v_rgba`, so a tint of (0,0,0,a) yields (0,0,0, a*texelAlpha) — the sprite's exact alpha
 * shape rendered pure black at `a`. That is how WP-1 draws a grounding shadow with no new atlas
 * cell, no second texture and no extra pass shape.
 *
 * `quad` (optional, [x0,y0,x1,y1,x2,y2,x3,y3] in TL,TR,BR,BL order) replaces the axis-aligned
 * corners `x,y,d` would give. The grounding shadow is the only caller: its four corners come from
 * `lightfield.js shadowQuad`, so it is a squashed, sheared parallelogram rather than a box.
 *
 * `flip` mirrors the SAMPLED CELL horizontally by swapping u0↔u1 — the pawn-facing mirror
 * (motion.js "WHICH WAY A PAWN LOOKS"), and the canvas2d twin of `_sprImg`'s `scale(-1,1)`. It is
 * a UV swap inside the SAME cell rect, not a second atlas cell: nothing samples outside
 * [u0,u1]x[v0,v1], so WP-0's 4px replicated ATLAS_BORDER is untouched and the atlas signature does
 * not move. Applied to a shadow it mirrors the silhouette WITHIN the parallelogram and leaves the
 * corner POSITIONS — i.e. AD-3's down-right lean — exactly as `shadowQuad` produced them.
 */
const AA = new Float64Array(8); // axis-aligned corner scratch for pushTex
const SQ = new Float64Array(8); // grounding-shadow corner scratch (lightfield.js shadowQuad)
function pushTex(arr, x, y, d, uv, alpha, turns, tint, quad, flip) {
  if (!uv) return;
  let c = quad;
  if (!c) {
    AA[0] = x; AA[1] = y; AA[2] = x + d; AA[3] = y;
    AA[4] = x + d; AA[5] = y + d; AA[6] = x; AA[7] = y + d;
    c = AA;
  }
  // Rotate which UV each position corner samples. turns is CW image rotation → shift UV assignment.
  const uL = flip ? uv.u1 : uv.u0, uR = flip ? uv.u0 : uv.u1;
  const uvSel = [
    [uL, uv.v0], [uR, uv.v0], [uR, uv.v1], [uL, uv.v1],
  ];
  const t = ((turns % 4) + 4) % 4;
  const a = alpha == null ? 1 : alpha;
  const r = tint ? tint[0] : a, g = tint ? tint[1] : a, b = tint ? tint[2] : a, al = tint ? tint[3] : a;
  for (const i of TRI) {
    const sel = uvSel[(i + t) % 4]; // shift the UV that lands on this corner
    arr.push(c[i * 2], c[i * 2 + 1], sel[0], sel[1], r, g, b, al);
  }
}

/**
 * Write one light-mesh quad's 6 vertices straight into `out` at float offset `p`: a flat
 * (untextured) quad whose FOUR CORNERS each carry their own colour. The flat program already
 * interpolates `a_rgba` per vertex, so the gradient is free — this is the whole reason WP-3's
 * pools cost nothing extra on the GPU. Alpha is 1 so the DST_COLOR blend resolves to `dst * M`.
 *
 * This one writes into a REUSED Float32Array rather than pushing onto a JS array like its
 * siblings: the light pass covers every explored tile, so on an establishing shot it is ~2,600
 * quads = ~125k floats, and building that as a boxed JS array and copying it into a fresh
 * Float32Array 30 times a second was the only allocation in the frame path big enough to matter.
 * @returns {number} the next write offset
 */
const GX = new Float64Array(4), GY = new Float64Array(4); // writeGradient corner scratch (see below)
function writeGradient(out, p, x, y, d, data, base) {
  // Module-level corner scratch, not a fresh array per quad: this runs ~2,600 times per frame.
  GX[0] = x; GX[1] = x + d; GX[2] = x + d; GX[3] = x;
  GY[0] = y; GY[1] = y; GY[2] = y + d; GY[3] = y + d;
  for (let t = 0; t < 6; t++) {
    const i = TRI[t], o = base + i * 3;
    out[p] = GX[i]; out[p + 1] = GY[i]; out[p + 2] = 0; out[p + 3] = 0;
    out[p + 4] = data[o]; out[p + 5] = data[o + 1]; out[p + 6] = data[o + 2]; out[p + 7] = 1;
    p += 8;
  }
  return p;
}

export class WebGL2Executor {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new GLContext(canvas); // throws if WebGL2 is unavailable
    /** @type {(()=>void)|null} main.js wires this to its Canvas2D fallback. */
    this.onContextLost = null;
    this.gl.onLost = () => { if (this.onContextLost) this.onContextLost(); };
    this._sig = null;              // current atlas signature
    this._uv = {};                 // cell key → UV rect
    this._statsLoggedAt = 0;       // wall-clock throttle for the advisory [perilune-stats] line
    this._padWarned = false;       // one-shot: atlas gutter too narrow for the edge replication
    this._lightVerts = null;       // reused light-mesh vertex buffer (see writeGradient)
    this._atlasCanvas = document.createElement('canvas');
    console.info('[perilune] backend=webgl2 (WebGL2Executor active)');
  }

  /**
   * @param {import('./compose.js').DrawOp[]} list
   * @param {*} _ctx  unused (GL owns its own context); kept for the shared executor signature
   * @param {import('./executor.js').ExecuteOpts} opts
   */
  execute(list, _ctx, opts) {
    const gl = this.gl;
    if (gl.isLost()) return; // main.js handles the swap; never throw inside the frame loop
    const cam = opts.camera;
    const sprites = opts.sprites || null;
    const useSpr = sprites ? sprites.usable(opts.spriteMode) : false;
    const timeSec = opts.timeSec || 0;

    // Wall-clock that drives the continuous per-cid slide (null on the frozen/screenshot path).
    const nowMs = opts.nowMs == null ? null : opts.nowMs;
    // C7 animation inputs — motion (tile→entry), the art maps, timeSec (walk-cycle phase) and nowMs.
    // nowMs is threaded here so the ATLAS bake gate (collectCellKeys → isAnimWalking) and the SAMPLE
    // gate (resolveEntity → spriteVariant → isAnimWalking) agree on the slide-aware walk hold.
    const raster = {
      motion: opts.motion || null, timeSec, nowMs,
      states: useSpr ? SPRITE_STATES : null, frames: useSpr ? SPRITE_FRAMES : null,
    };

    const passes = buildPasses(list, { timeSec });
    this._ensureAtlas(passes, useSpr, sprites, raster);

    // Integer tile pitch + integer origin (camera.js): every quad corner below is
    // `tileIndex * PITCH + origin`, which lands exactly on a device pixel. The ONLY term that stays
    // fractional is the pawn's sub-tile slide, added to the tile index before the multiply.
    const { ox, oy } = transform(cam);
    const PITCH = tilePitch(cam);
    const W = cam.viewW, H = cam.viewH, D = PITCH;
    gl.beginFrame(W, H, CLEAR);

    const [terrain, entities, light, overlay] = passes;

    // Advisory render counters (art/spritegen/metrics.py sprite-coverage gate reads these off
    // window.__renderStats). Pure instrumentation — never influences a draw.
    const stats = {
      backend: 'webgl2', useSpr,
      terrainTex: 0, terrainFlat: 0,
      entities: 0, entitySprite: 0, entityProc: 0,
      lightQuads: 0, shadows: 0,
    };

    // ---- terrain: flat hull/void + textured base tiles ----
    {
      const flat = [], tex = [];
      for (const o of terrain.ops) {
        const spec = resolveTerrain(o);
        if (!spec) continue;
        const X = o.x * PITCH + ox, Y = o.y * PITCH + oy;
        if (spec.flat) { stats.terrainFlat++; pushFlat(flat, X, Y, D, premul(parseColor(spec.color))); }
        else { stats.terrainTex++; pushTex(tex, X, Y, D, this._uv[spec.cell], 1, 0); }
      }
      gl.drawFlat(new Float32Array(flat), W, H);
      gl.drawTextured(new Float32Array(tex), W, H);
    }

    // ---- entities: grounding shadow pass, then atlas sprite / baked proc cell + locked-door amber.
    //      The shadows are their own batch drawn BEFORE every entity, so a pawn's shadow can never
    //      fall across another pawn — it only ever lands on terrain. Same UVs, no new atlas cell:
    //      only the vertex tint (black @ SHADOW_ALPHA) and the corner POSITIONS differ, and those
    //      come from `shadowQuad` — the same four corners canvas2d turns into its draw matrix.
    //
    //      Entities go out in TWO textured batches: settled first, then whoever is mid-slide. A
    //      pawn mid-step is drawn one tile back from the tile it occupies, and the ops are still
    //      row-major, so on a westward/northward step the tile it just LEFT is drawn later and used
    //      to repaint it (measured on the real executors: up to 69% of the pawn). Same split, same
    //      reason, same result as canvas2d — see that file's header. ----
    {
      const shadow = [], tex = [], moving = [], lock = [];
      for (const o of entities.ops) {
        const spec = resolveEntity(o, useSpr, raster);
        stats.entities++;
        const isSprite = !!(spec.cell && spec.cell.startsWith('spr:'));
        if (isSprite) stats.entitySprite++; else stats.entityProc++;
        // Walking pawns glide continuously toward the current tile (self-gating sub-tile offset that
        // survives step-less frames — same model + gating as the canvas2d path, no divergence).
        // '@' is 64 — and on THIS side of the fence the field is `glyph`, not `g`: batch.js
        // rewrites every DisplayList op into its own shape. Only a pawn carries a motion entry,
        // and only a pawn is ever mirrored.
        const entry = o.glyph === 64 && raster.motion ? raster.motion[o.x + ',' + o.y] : null;
        const off = slideOffset(entry, nowMs);
        const flip = !!(entry && entry.flipX);
        const sliding = off.ox !== 0 || off.oy !== 0;
        const X = (o.x + off.ox) * PITCH + ox, Y = (o.y + off.oy) * PITCH + oy;
        // Bitmap art only. A procedural vector glyph's silhouette is a few thin strokes, and the
        // canvas2d path cannot silhouette one at all — shadowing it would be a pure divergence.
        if (isSprite) {
          pushTex(shadow, 0, 0, D, this._uv[spec.cell], spec.alpha, spec.turns,
            [0, 0, 0, SHADOW_ALPHA * spec.alpha], shadowQuad(X, Y, D, SQ), flip);
          stats.shadows++;
        }
        pushTex(sliding ? moving : tex, X, Y, D, this._uv[spec.cell], spec.alpha, spec.turns,
          null, null, flip);
        if (spec.overlay) pushFlat(lock, X, Y, D, premul(parseColor(spec.overlay)));
      }
      gl.drawTextured(new Float32Array(shadow), W, H);
      gl.drawTextured(new Float32Array(tex), W, H);
      gl.drawFlat(new Float32Array(lock), W, H); // amber lands on top of its door (same tile)
      gl.drawTextured(new Float32Array(moving), W, H); // sliding pawns, over everything they left
    }

    // ---- light: a multiply pass (dst *= M).
    //      WP-3: when the caller supplies a light MESH (lightfield.js), every explored tile becomes
    //      one quad with four independently-coloured corners, so the pools are continuous gradients
    //      across the grid — the flat program already carries per-vertex rgba, so this costs the
    //      same single draw call the flat overlay did.
    //      Fallback (no mesh — e.g. an executor driven directly by a test): the legacy per-tile
    //      flat overlay, byte-identical to before. The palette gives each LightState an over-blend
    //      rgba; M = (1-a) + C*a folds it into the DST_COLOR,ONE_MINUS_SRC_ALPHA blend. Powered/
    //      Unknown paint nothing there, so a fully-lit deck drew zero light quads. ----
    const mesh = opts.lightMesh;
    if (mesh && mesh.count) {
      const need = mesh.count * 6 * VERTEX_STRIDE;
      if (!this._lightVerts || this._lightVerts.length < need) this._lightVerts = new Float32Array(need);
      const out = this._lightVerts;
      let p = 0;
      for (let q = 0; q < mesh.count; q++) {
        const b = q * MESH_STRIDE;
        p = writeGradient(out, p, mesh.data[b] * PITCH + ox, mesh.data[b + 1] * PITCH + oy, D, mesh.data, b + 2);
        stats.lightQuads++;
      }
      gl.setBlendMultiply(true);
      gl.drawFlat(out.subarray(0, need), W, H); // a view, not a copy
      gl.setBlendMultiply(false);
    } else if (light.ops.length) {
      const mul = [];
      for (const o of light.ops) {
        const rgba = litOverlay(o.state);
        if (!rgba) continue;
        stats.lightQuads++;
        const c = parseColor(rgba), a = c[3];
        const X = o.x * PITCH + ox, Y = o.y * PITCH + oy;
        pushFlat(mul, X, Y, D, [(1 - a) + c[0] * a, (1 - a) + c[1] * a, (1 - a) + c[2] * a, 1]);
      }
      if (mul.length) {
        gl.setBlendMultiply(true);
        gl.drawFlat(new Float32Array(mul), W, H);
        gl.setBlendMultiply(false);
      }
    }

    // ---- overlay: lens wash (flat) then cursor/reticle (cells) ----
    {
      const flat = [], tex = [];
      for (const o of overlay.ops) {
        const spec = resolveOverlay(o);
        if (!spec) continue;
        const X = o.x * PITCH + ox, Y = o.y * PITCH + oy;
        if (spec.flat) { if (spec.color) pushFlat(flat, X, Y, D, premul(parseColor(spec.color))); }
        else pushTex(tex, X, Y, D, this._uv[spec.cell], spec.alpha, spec.turns);
      }
      gl.drawFlat(new Float32Array(flat), W, H);
      gl.drawTextured(new Float32Array(tex), W, H);
    }

    // Publish the frame's counters for the advisory screenshot-test harness (browser only).
    stats.spriteCoverage = stats.entities ? stats.entitySprite / stats.entities : 0;
    if (typeof window !== 'undefined') window.__renderStats = stats;
    // Also emit to the console (throttled, wall-clock) so a headless-Chrome shot harness can
    // scrape the last line off stderr — the same channel it reads the `backend=` line from
    // (window.* is not otherwise reachable without CDP). Costs one log line per ~500ms.
    const now = (typeof Date !== 'undefined') ? Date.now() : 0;
    if (now - this._statsLoggedAt >= 500 && typeof btoa !== 'undefined') {
      this._statsLoggedAt = now;
      // base64 so the JSON's quotes/braces survive headless-Chrome's console-line escaping intact.
      console.info('[perilune-stats] ' + btoa(JSON.stringify(stats)));
    }
  }

  // -------------------------------------------------------------- atlas (rebuilt on signature change)

  _ensureAtlas(passes, useSpr, sprites, raster = {}) {
    const sig = atlasSignature(passes, useSpr, raster);
    if (sig === this._sig) return;
    const keys = collectCellKeys(passes, useSpr, raster);
    const atlas = packAtlas(keys.map((k) => ({ name: k, w: CELL, h: CELL })));

    const cv = this._atlasCanvas;
    cv.width = atlas.width; cv.height = atlas.height;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    for (const key of keys) {
      const p = atlas.placements[key];
      g.save();
      g.beginPath(); g.rect(p.x, p.y, CELL, CELL); g.clip(); // contain glow/shadow within the cell
      this._paintCell(g, key, sprites, useSpr, p.x, p.y);
      g.restore();
    }
    for (const key of keys) this._replicateEdges(g, cv, atlas.placements[key], atlas.pad);

    this.gl.uploadAtlas(cv);
    this._uv = atlas.uv;
    this._sig = sig;
  }

  /**
   * Bleed one cell's outermost row/column of pixels up to ATLAS_BORDER px outward into its gutter.
   *
   * Why not just leave the gutter transparent: the atlas is premultiplied, so a transparent texel
   * is (0,0,0,0). LINEAR filtering at a sprite's edge averages the edge texel with whatever sits
   * beside it, and averaging with premultiplied zero pulls colour AND alpha down — every sprite
   * would gain a dark, semi-transparent rim, worst at the mip levels the far view uses. Replicating
   * the edge means that average is the edge colour itself, i.e. a no-op. It also gives generateMipmap
   * something honest to reduce: through mip 2 the gutter still separates neighbouring cells.
   *
   * `drawImage` with the canvas as its own source is well-defined (the source is snapshotted), and
   * imageSmoothingEnabled is already false, so stretching a 1px strip to ATLAS_BORDER px is an exact
   * copy rather than a gradient. Sides first, then top/bottom over the WIDENED span so the four
   * corners are covered too.
   *
   * GUARD: this writes ATLAS_BORDER px OUTWARD on every side, so it is only safe while the packer's
   * gutter is at least 2 * ATLAS_BORDER (each neighbour's border, side by side). That holds by
   * construction today — _ensureAtlas takes packAtlas's default ATLAS_PAD — but a future caller
   * passing a smaller `padding` would silently have cells overwrite each other's protection, which
   * looks like art corruption rather than a config error. So take the real gutter from the atlas
   * and clamp to what actually fits, warning once. Never throws: this runs inside the frame path.
   * @param {number} [pad] the packer's gutter, from packAtlas's returned `pad`
   */
  _replicateEdges(g, cv, p, pad) {
    if (!p) return;
    const room = pad == null ? ATLAS_BORDER : Math.floor(pad / 2);
    const P_ = Math.min(ATLAS_BORDER, room);
    if (P_ < ATLAS_BORDER && !this._padWarned) {
      this._padWarned = true;
      console.warn(`[perilune] atlas gutter ${pad} < 2*ATLAS_BORDER (${2 * ATLAS_BORDER}); ` +
        `edge replication narrowed to ${P_}px — expect mip bleed between cells`);
    }
    if (P_ <= 0) return;
    const { x, y, w, h } = p;
    // left / right edge columns
    g.drawImage(cv, x, y, 1, h, x - P_, y, P_, h);
    g.drawImage(cv, x + w - 1, y, 1, h, x + w, y, P_, h);
    // top / bottom edge rows, spanning the already-extended width (fills the corners)
    g.drawImage(cv, x - P_, y, w + 2 * P_, 1, x - P_, y - P_, w + 2 * P_, P_);
    g.drawImage(cv, x - P_, y + h - 1, w + 2 * P_, 1, x - P_, y + h, w + 2 * P_, P_);
  }

  /** Rasterize one atlas cell — the GL-side mirror of the canvas2d per-op branch. */
  _paintCell(g, key, sprites, useSpr, px, py) {
    const T = CELL;
    if (key.startsWith('spr:')) {
      // Variant art (walk frame / broken / off) may be absent or still decoding → fall back to the
      // base role image, matching canvas2d's absence-tolerance.
      const name = key.slice(4);
      const img = sprites && (sprites.decoded(name) || sprites.decoded(baseSpriteKey(name)));
      if (img) g.drawImage(img, px, py, T, T);
      return;
    }
    if (key.startsWith('proc:')) {
      const [, code, colorId] = key.split(':');
      this._paintProc(g, T, px, py, +code, +colorId);
      return;
    }
    if (key === 'overlay:cursor') { P.paintCursor(g, T, px, py); return; }
    if (key === 'overlay:reticle') { P.paintSelection(g, T, px, py, 0); return; } // baked at pulse mid
    switch (key) {
      case 'terrain:floor':
        if (useSpr && sprites && sprites.get('floor')) g.drawImage(sprites.get('floor'), px, py, T, T);
        else P.paintFloor(g, T, px, py);
        break;
      case 'terrain:wall':
        if (useSpr && sprites && sprites.get('wall')) g.drawImage(sprites.get('wall'), px, py, T, T);
        else P.paintWall(g, T, px, py);
        break;
      case 'terrain:wall_vert':
        // Sprite mode rotates the wall panel; procedural mode has no vertical variant (like canvas2d).
        if (useSpr && sprites && sprites.get('wall')) g.drawImage(sprites.wallVertical(), px, py, T, T);
        else P.paintWall(g, T, px, py);
        break;
      case 'terrain:debris':
        if (useSpr && sprites && sprites.get('debris')) g.drawImage(sprites.get('debris'), px, py, T, T);
        else P.paintDebris(g, T, px, py);
        break;
      default: break;
    }
  }

  /** Procedural entity glyph → its vector painter, colour-baked (mirror of canvas2d._entity). */
  _paintProc(g, T, px, py, code, colorId) {
    const col = FG[colorId];
    const cx = px + T / 2, cy = py + T / 2, r = T * 0.34;
    g.save();
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    const ch = String.fromCharCode(code);
    switch (ch) {
      case '@': P.paintPawn(g, cx, cy, r, col); break;
      case '&': P.paintCorpse(g, cx, cy, r); break;
      case '+': P.paintDoor(g, T, px, py, 'closed', col); break;
      case '/': P.paintDoor(g, T, px, py, 'open', col); break;
      case 'X': P.paintDoor(g, T, px, py, 'locked', col); break;
      case 'S': P.paintFan(g, cx, cy, r); break;
      case '"': P.paintGrowBed(g, T, px, py); break;
      case 'O': P.paintTank(g, cx, cy, r); break;
      case '=': P.paintRadiator(g, T, px, py, col); break;
      case 'T': P.paintTerminal(g, T, px, py, col); break;
      case 'G': P.paintSolar(g, T, px, py, col); break;
      case 'B': P.paintBattery(g, T, px, py, col); break;
      case '^': P.paintVent(g, cx, cy, r, col); break;
      case '*': P.paintLight(g, cx, cy, r); break;
      case 'H': P.paintLadder(g, T, px, py, col); break;
      case '~': P.paintConduit(g, T, px, py, col); break;
      case 'R': P.paintMachine(g, T, px, py, col, 'drop'); break;
      case 'F': P.paintMachine(g, T, px, py, col, 'gear'); break;
      case 'M': P.paintMachine(g, T, px, py, col, 'tools'); break;
      case 'Y': P.paintMachine(g, T, px, py, col, 'recycle'); break;
      default: P.paintItem(g, code, cx, cy, col); break;
    }
    g.restore();
  }
}

export { VERTEX_STRIDE };
