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
import { packAtlas } from './webgl/atlas.js';
import {
  CELL, collectCellKeys, atlasSignature, resolveTerrain, resolveEntity, resolveOverlay,
} from './rasterplan.js';
import { transform } from './camera.js';
import { C, FG } from './palette.js';
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
    const T = cam.tile;
    const sprites = opts.sprites || null;
    const useSpr = sprites ? sprites.usable(opts.spriteMode) : false;
    const timeSec = opts.timeSec || 0;

    const passes = buildPasses(list, { timeSec });
    this._ensureAtlas(passes, useSpr, sprites);

    const { s, ox, oy } = transform(cam);
    const W = cam.viewW, H = cam.viewH, D = T * s;
    gl.beginFrame(W, H, CLEAR);

    const [terrain, entities, light, overlay] = passes;

    // ---- terrain: flat hull/void + textured base tiles ----
    {
      const flat = [], tex = [];
      for (const o of terrain.ops) {
        const spec = resolveTerrain(o);
        if (!spec) continue;
        const X = o.x * T * s + ox, Y = o.y * T * s + oy;
        if (spec.flat) pushFlat(flat, X, Y, D, premul(parseColor(spec.color)));
        else pushTex(tex, X, Y, D, this._uv[spec.cell], 1, 0);
      }
      gl.drawFlat(new Float32Array(flat), W, H);
      gl.drawTextured(new Float32Array(tex), W, H);
    }

    // ---- entities: atlas sprite / baked proc cell + locked-door amber overlay ----
    {
      const tex = [], lock = [];
      for (const o of entities.ops) {
        const spec = resolveEntity(o, useSpr);
        const X = o.x * T * s + ox, Y = o.y * T * s + oy;
        pushTex(tex, X, Y, D, this._uv[spec.cell], spec.alpha, spec.turns);
        if (spec.overlay) pushFlat(lock, X, Y, D, premul(parseColor(spec.overlay)));
      }
      gl.drawTextured(new Float32Array(tex), W, H);
      gl.drawFlat(new Float32Array(lock), W, H); // amber lands on top of its door (same tile)
    }

    // ---- light: reserved. Empty today → nothing drawn, but the multiply slot is wired for C4. ----
    if (light.ops.length) {
      gl.setBlendMultiply(true);
      // C4: build + draw the light quads here.
      gl.setBlendMultiply(false);
    }

    // ---- overlay: lens wash (flat) then cursor/reticle (cells) ----
    {
      const flat = [], tex = [];
      for (const o of overlay.ops) {
        const spec = resolveOverlay(o);
        if (!spec) continue;
        const X = o.x * T * s + ox, Y = o.y * T * s + oy;
        if (spec.flat) { if (spec.color) pushFlat(flat, X, Y, D, premul(parseColor(spec.color))); }
        else pushTex(tex, X, Y, D, this._uv[spec.cell], spec.alpha, spec.turns);
      }
      gl.drawFlat(new Float32Array(flat), W, H);
      gl.drawTextured(new Float32Array(tex), W, H);
    }
  }

  // -------------------------------------------------------------- atlas (rebuilt on signature change)

  _ensureAtlas(passes, useSpr, sprites) {
    const sig = atlasSignature(passes, useSpr);
    if (sig === this._sig) return;
    const keys = collectCellKeys(passes, useSpr);
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

    this.gl.uploadAtlas(cv);
    this._uv = atlas.uv;
    this._sig = sig;
  }

  /** Rasterize one atlas cell — the GL-side mirror of the canvas2d per-op branch. */
  _paintCell(g, key, sprites, useSpr, px, py) {
    const T = CELL;
    if (key.startsWith('spr:')) {
      const img = sprites && sprites.get(key.slice(4));
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
