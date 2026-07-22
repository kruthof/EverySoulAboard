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
//                         base tiles), entities (atlas sprite or baked proc cell, facing via UV
//                         rotation, dim via alpha, locked-door amber overlay), light (reserved —
//                         renders nothing when empty, but the multiply-blend slot is wired for C4),
//                         overlay (lens wash flat + cursor/reticle cells, reticle alpha from phase).
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
 */
function pushTex(arr, x, y, d, uv, alpha, turns) {
  if (!uv) return;
  const corners = [[x, y], [x + d, y], [x + d, y + d], [x, y + d]];
  // Rotate which UV each position corner samples. turns is CW image rotation → shift UV assignment.
  const uvSel = [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ];
  const t = ((turns % 4) + 4) % 4;
  const a = alpha == null ? 1 : alpha;
  for (const i of TRI) {
    const c = corners[i];
    const sel = uvSel[(i + t) % 4]; // shift the UV that lands on this corner
    arr.push(c[0], c[1], sel[0], sel[1], a, a, a, a);
  }
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
      lightQuads: 0,
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

    // ---- entities: atlas sprite / baked proc cell + locked-door amber overlay ----
    {
      const tex = [], lock = [];
      for (const o of entities.ops) {
        const spec = resolveEntity(o, useSpr, raster);
        stats.entities++;
        if (spec.cell && spec.cell.startsWith('spr:')) stats.entitySprite++; else stats.entityProc++;
        // Walking pawns glide continuously toward the current tile (self-gating sub-tile offset that
        // survives step-less frames — same model + gating as the canvas2d path, no divergence).
        const entry = raster.motion && raster.motion[o.x + ',' + o.y];
        const off = slideOffset(entry, nowMs);
        const X = (o.x + off.ox) * PITCH + ox, Y = (o.y + off.oy) * PITCH + oy;
        pushTex(tex, X, Y, D, this._uv[spec.cell], spec.alpha, spec.turns);
        if (spec.overlay) pushFlat(lock, X, Y, D, premul(parseColor(spec.overlay)));
      }
      gl.drawTextured(new Float32Array(tex), W, H);
      gl.drawFlat(new Float32Array(lock), W, H); // amber lands on top of its door (same tile)
    }

    // ---- light: per-tile overlay folded into a multiply (dst *= M). The palette gives each
    //      LightState an over-blend rgba (canvas skin); here we convert (C over dst @ alpha) into
    //      the equivalent multiply factor M = (1-a) + C*a, pushed as a flat quad with alpha 1 so
    //      the DST_COLOR,ONE_MINUS_SRC_ALPHA blend resolves to dst*M. Powered/Unknown paint
    //      nothing (no palette entry), so a fully-lit deck draws zero light quads. ----
    if (light.ops.length) {
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
    for (const key of keys) this._replicateEdges(g, cv, atlas.placements[key]);

    this.gl.uploadAtlas(cv);
    this._uv = atlas.uv;
    this._sig = sig;
  }

  /**
   * Bleed one cell's outermost row/column of pixels ATLAS_BORDER px outward into its gutter.
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
   * corners are covered too. The packer leaves 2 * ATLAS_BORDER between cells, so this never writes
   * into a neighbour's border.
   */
  _replicateEdges(g, cv, p) {
    if (!p) return;
    const P_ = ATLAS_BORDER, { x, y, w, h } = p;
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
