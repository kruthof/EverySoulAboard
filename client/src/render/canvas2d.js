// Canvas2D executor — the P1 thin backend. Walks a DisplayList (from composeScene) and draws
// it with pixel-identical conventions to hosts/web/Client.html: sprite table with procedural
// fallback, wall-face/hull-mass, crew variants, facing-aware rotation, lens wash, hover cursor,
// selection reticle. Implements the Executor shape in executor.js.
//
// It walks the list in PASS order (webgl/batch.js `passIndexOf`: terrain → shadows → entities →
// light → overlay), not raw row-major order. Raw order painted each tile's entity before its
// neighbours' floors, so anything an entity drew outside its own tile — a pawn mid-slide, a
// grounding shadow — was erased by the next tile's opaque floor sprite. That was the "pawns
// walking left appear out of nothing" bug (measured: 100% of the pawn quad covered at the start of
// a westward or northward step), and it made WP-1 shadows impossible here. Within a tile the
// relative order is unchanged, and tiles do not overlap, so nothing else moves.
//
// The pass order alone was not enough. INSIDE the entity pass the walk is still row-major, and a
// pawn mid-step is drawn one tile back from the tile it now occupies — so on a WESTWARD or
// NORTHWARD step the tile it just LEFT (which may hold a device, or another pawn, now that the
// citizen glyph no longer masks it) is drawn AFTER and repaints the sliding body. Measured on the
// real executor: up to 69% of the pawn covered by one growbed, 45% by a second pawn; E and S were
// clean in all 16 neighbour configurations, which is exactly why the playtest heard "up, down and
// left" and never "right". So sliding pawns are drawn as a SECOND sub-batch, after every settled
// entity — which makes all four directions behave the way E and S already did.

import { C, FG, WASH, HULL, litOverlay } from './palette.js';
import { transform } from './camera.js';
import { PAWN_ROLES } from './glyphs.js';
import { passIndexOf } from './webgl/batch.js';
import { deviceSpriteKey, pawnSpriteKey, slideOffset, isAnimWalking } from './motion.js';
import { shadowQuad, SHADOW_ALPHA, MESH_STRIDE, sampleQuad } from './lightfield.js';
import { SPRITE_STATES, SPRITE_FRAMES } from '../../assets/sprites.g.js';
import * as P from './procedural.js';

/** Sub-tile resolution of the Canvas2D light-pool approximation — see `_lightMesh`. */
const LIGHT_SUBDIV = 2;

/** Hard cap on `_styleCache`. ~10x a boot frame's distinct styles, so it never evicts in practice;
 *  it exists so a long session cannot grow the map without bound. */
const STYLE_CACHE_MAX = 2048;

export class Canvas2DExecutor {
  constructor() {
    /** Reusable pass buckets — the walk is re-ordered per frame without allocating. */
    this._buckets = [[], [], [], []];
    /** image → black silhouette canvas (or null when this environment has no DOM). */
    this._sil = new WeakMap();
    /** Injectable offscreen-canvas factory: returns null where `document` does not exist (node
     *  tests), which is also why Canvas2D casts no shadow under a procedural-only glyph. */
    this._makeCanvas = (w, h) => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    };
    this._rgb = [0, 0, 0];
    /** packed rgb → 'rgb(r,g,b)', so the light pass allocates no strings per frame. The key space
     *  is 24-bit, and while a boot frame only shows ~142 distinct styles, the set is MONOTONIC —
     *  panning and relighting keep adding to it — so it is capped and dropped wholesale rather
     *  than left to grow for the lifetime of the tab. A drop costs one frame of string building. */
    this._styleCache = new Map();
    /** Shadow-quad corner scratch: `shadowQuad` writes into this, once per shadowed entity. */
    this._sq = new Float64Array(8);
    /** Reusable "drawn last" bucket: the entity ops that are mid-slide this frame (see the header). */
    this._moving = [];
  }

  /**
   * @param {import('./compose.js').DrawOp[]} list
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./executor.js').ExecuteOpts} opts
   */
  execute(list, ctx, opts) {
    const cam = opts.camera;
    const T = cam.tile;
    const sprites = opts.sprites || null;
    const useSpr = sprites ? sprites.usable(opts.spriteMode) : false;
    const timeSec = opts.timeSec || 0;
    // C7 animation context: per-tile motion, walk-cycle time, and the wall-clock that drives the
    // continuous per-cid slide (null on the frozen/screenshot path → every pawn reads settled).
    const anim = { motion: opts.motion || null, timeSec, nowMs: opts.nowMs == null ? null : opts.nowMs };

    // full clear + deep-fog field behind everything
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.viewW, cam.viewH);
    ctx.fillStyle = FG[C.Unknown];
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // transform() hands back a QUANTIZED scale (tile * s is a whole number of device px) and an
    // integer origin, so `o.x * T` under this matrix lands on the pixel grid. Pawn slides are added
    // in the same pre-transform tile space (px + off.ox * T) and stay fractional — the glide is not
    // snapped, only the grid is.
    const { s, ox, oy } = transform(cam);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    // Smoothing ON: the art is painterly 128px renders, not pixel art. Nearest-neighbour MINIFY
    // dropped whole texel rows at every non-integer ratio and the artefacts crawled under pan.
    // This is the canvas2d twin of LINEAR_MIPMAP_LINEAR in webgl/gl.js. (It is a no-op at exactly
    // 1:1, which MAX_TILE_DEVICE_PX makes the maximum zoom — the win is on the minify side.)
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

    // ---- bucket the list into the four passes (shared authority: webgl/batch.js) ----
    const B = this._buckets;
    B[0].length = 0; B[1].length = 0; B[2].length = 0; B[3].length = 0;
    if (list) for (const o of list) { const p = passIndexOf(o); if (p >= 0) B[p].push(o); }

    // ---- 0. terrain ----
    for (const o of B[0]) {
      const px = o.x * T, py = o.y * T;
      switch (o.op) {
        case 'hull': ctx.fillStyle = HULL; ctx.fillRect(px, py, T, T); break;
        case 'void': ctx.fillStyle = FG[C.Void]; ctx.fillRect(px, py, T, T); break;
        case 'floor': this._floor(ctx, T, px, py, useSpr, sprites); break;
        case 'debris': this._debris(ctx, T, px, py, useSpr, sprites); break;
        case 'wall': this._wall(ctx, T, px, py, o, useSpr, sprites); break;
        default: break;
      }
    }

    // ---- 1a. grounding shadows: every entity's own art, black, squashed onto the ground and
    //          sheared down-light, under the WHOLE entity batch so one pawn's shadow can never
    //          fall across another pawn. ----
    if (useSpr) for (const o of B[1]) this._shadow(ctx, T, o, sprites, anim);

    // ---- 1b. entities: settled ones in list order, then the sliding pawns on top (header note).
    //          Two loops, one reused bucket — no per-frame allocation, and the relative order
    //          WITHIN each group is untouched, so a frame with nobody walking is byte-identical. ----
    const moving = this._moving;
    moving.length = 0;
    for (const o of B[1]) {
      if (this._sliding(o, anim)) { moving.push(o); continue; }
      this._entity(ctx, T, o.x * T, o.y * T, o, useSpr, sprites, anim);
    }
    for (const o of moving) this._entity(ctx, T, o.x * T, o.y * T, o, useSpr, sprites, anim);

    // ---- 2. light: the vertex-coloured pool mesh when the caller built one, else the legacy
    //         flat per-tile overlay (identical bytes to before for any caller that passes none). ----
    if (opts.lightMesh && opts.lightMesh.count) this._lightMesh(ctx, T, opts.lightMesh);
    else for (const o of B[2]) {
      const c = litOverlay(o.state);
      if (c) { ctx.fillStyle = c; ctx.fillRect(o.x * T, o.y * T, T, T); }
    }

    // ---- 3. overlay ----
    for (const o of B[3]) {
      const px = o.x * T, py = o.y * T;
      switch (o.op) {
        case 'wash': ctx.fillStyle = WASH[o.bg]; ctx.fillRect(px, py, T, T); break;
        case 'cursor': P.paintCursor(ctx, T, px, py); break;
        case 'reticle': P.paintSelection(ctx, T, px, py, timeSec); break;
        default: break;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- WP-3: the light pool mesh -------------------------------------------------------------
  /**
   * Paint the light field as `dst *= M` with globalCompositeOperation 'multiply' — algebraically
   * the SAME operation the GL path folds into its DST_COLOR blend, so the two skins now agree
   * exactly on lighting (the old translucent over-blend did not: it lifted a black tile toward the
   * overlay colour where the multiply left it black).
   *
   * Canvas2D has no per-vertex colour, so each quad is filled as LIGHT_SUBDIV² sub-rects sampled
   * at the sub-rect CENTRES. Because bilinear interpolation is linear in each axis, the centre
   * sample is exactly the sub-rect's area average — this is the box-filtered version of what the
   * GPU draws, not a different picture. Max deviation at 2×2 is a quarter of the corner spread.
   */
  _lightMesh(ctx, T, mesh) {
    const { data, count } = mesh;
    const n = LIGHT_SUBDIV, step = T / n, rgb = this._rgb, cache = this._styleCache;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';
    for (let q = 0; q < count; q++) {
      const px = data[q * MESH_STRIDE] * T, py = data[q * MESH_STRIDE + 1] * T;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          sampleQuad(data, q, (i + 0.5) / n, (j + 0.5) / n, rgb);
          // ROUND, do not truncate: `x*255|0` floors, which biases every tile up to 1/255 darker
          // than the GL path's own 8-bit quantization and would make the two backends disagree by
          // a whole level over most of the stage.
          const r = rgb[0] * 255 + 0.5 | 0, g = rgb[1] * 255 + 0.5 | 0, b = rgb[2] * 255 + 0.5 | 0;
          // An establishing shot is ~2,600 tiles = ~10k sub-rects; building 10k colour STRINGS
          // every frame was pure garbage, so the (already 8-bit-quantized) colour is memoized.
          const k = (r << 16) | (g << 8) | b;
          let style = cache.get(k);
          if (style === undefined) {
            if (cache.size >= STYLE_CACHE_MAX) cache.clear();
            style = 'rgb(' + r + ',' + g + ',' + b + ')';
            cache.set(k, style);
          }
          ctx.fillStyle = style;
          ctx.fillRect(px + i * step, py + j * step, step, step);
        }
      }
    }
    ctx.globalCompositeOperation = prev;
  }

  /** The motion entry driving this op's sub-tile slide, or null when the op is not an animated
   *  pawn. ONE lookup shared by the shadow, the entity draw and the draw-order split, so the three
   *  can never disagree about which quad is where. `o.g === 64` is '@'. */
  _entryFor(o, anim) {
    if (!o || o.g !== 64 || !anim || !anim.motion) return null;
    return anim.motion[o.x + ',' + o.y] || null;
  }

  /** Is this op a pawn that is mid-step right now? Those are drawn last (see the header): only a
   *  sliding pawn reaches outside its own tile, so only a sliding pawn can be repainted by a
   *  later, higher-row/column entity. */
  _sliding(o, anim) {
    const entry = this._entryFor(o, anim);
    if (!entry) return false;
    const off = slideOffset(entry, anim.nowMs);
    return off.ox !== 0 || off.oy !== 0;
  }

  // --- WP-1: grounding shadows ---------------------------------------------------------------
  /**
   * A black silhouette of `img`, cached per image object. Built once per sprite (including rotated
   * variants, which are themselves cached canvases) with 'source-in', so the shadow carries the
   * sprite's exact alpha shape — the same shape the GL path gets for free by tinting the atlas cell
   * black. Returns null where no offscreen canvas can be made (headless node), and callers then
   * draw nothing rather than guessing.
   */
  _silhouette(img) {
    if (!img) return null;
    if (this._sil.has(img)) return this._sil.get(img);
    let out = null;
    const w = img.width || 0, h = img.height || 0;
    const cv = w && h ? this._makeCanvas(w, h) : null;
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    if (g) {
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      out = cv;
    }
    this._sil.set(img, out);
    return out;
  }

  /**
   * Draw one entity's grounding shadow: its own silhouette, black, SQUASHED onto the ground plane
   * about the foot line and sheared down-light (`lightfield.js shadowQuad` — the same four corners
   * the GL path pushes, so the two backends draw the same parallelogram).
   *
   * `shadowQuad` returns TL,TR,BR,BL. The map from the silhouette's source rect [0,T]² onto those
   * corners is affine, so it is exactly the matrix (TR-TL)/T, (BL-TL)/T, TL — no approximation.
   *
   * Sprite-drawn entities only: a procedural vector glyph (open door, loose item, sprites-off mode)
   * has no bitmap to silhouette and casts none; the GL path makes the same choice, so the two
   * backends stay in step.
   *
   * ── A MIRRORED PAWN AND ITS SHADOW ────────────────────────────────────────────────────────────
   * When `flipX` mirrors the pawn, the SILHOUETTE must mirror with it (a westbound pawn's shadow is
   * a westbound pawn's shape) but the QUAD must not. The four corners encode AD-3's one light
   * direction — azimuth 315°, elevation 55°: light from the upper left, shadow laid down-RIGHT —
   * and mirroring them would swing every shadow to the lower left the moment a pawn turned around,
   * so the stage would appear to have two light sources. The mirror therefore goes INSIDE the cell
   * (source space), applied AFTER the cell→quad matrix: the parallelogram, its lean and its offset
   * are bit-identical to the unflipped case, and only which pixels land in it changes.
   */
  _shadow(ctx, T, o, sprites, anim) {
    const sil = this._silhouette(this._entityImage(o, sprites, anim));
    if (!sil) return;
    const entry = this._entryFor(o, anim);
    const off = entry ? slideOffset(entry, anim.nowMs) : { ox: 0, oy: 0 };
    const q = shadowQuad((o.x + off.ox) * T, (o.y + off.oy) * T, T, this._sq);
    ctx.save();
    ctx.globalAlpha = SHADOW_ALPHA * (o.dim ? 0.7 : 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.transform((q[2] - q[0]) / T, (q[3] - q[1]) / T,   // u axis: TL → TR
                  (q[6] - q[0]) / T, (q[7] - q[1]) / T,   // v axis: TL → BL
                  q[0], q[1]);                            // origin: TL
    if (entry && entry.flipX) { ctx.translate(T, 0); ctx.scale(-1, 1); } // source-space only
    ctx.drawImage(sil, 0, 0, T, T);
    ctx.restore();
  }

  /**
   * The bitmap `_entity` will draw for this op, or null when it will draw a procedural glyph.
   * Mirrors the sprite-selection branches of `_entity` exactly — the shadow must be the shape of
   * the thing that casts it, including the current walk frame and device on/off/broken variant.
   */
  _entityImage(o, sprites, anim) {
    if (!sprites) return null;
    const dim = o.dim;
    if (o.role && sprites.get(o.role)) {
      const key = deviceSpriteKey(o.role, o.fg, dim, SPRITE_STATES);
      const variant = key !== o.role ? sprites.decoded(key) : null;
      return variant || (o.turns ? sprites.rotated(o.role, o.turns) : sprites.get(o.role));
    }
    const ch = String.fromCharCode(o.g);
    if (ch === '@' && o.fg === C.Crew) {
      const v = o.pv || 0;
      const pr = (PAWN_ROLES[v] && sprites.get(PAWN_ROLES[v])) ? PAWN_ROLES[v] : 'pawn';
      const entry = anim.motion && anim.motion[o.x + ',' + o.y];
      const key = pawnSpriteKey(pr, isAnimWalking(entry, anim.nowMs), anim.timeSec || 0, SPRITE_FRAMES);
      return (key !== pr ? sprites.decoded(key) : null) || sprites.get(pr);
    }
    if (ch === '+' || ch === 'X') return sprites.get('door');
    if (ch === '"') return sprites.get('growbed');
    if (ch === 'T') {
      const key = deviceSpriteKey('terminal', o.fg, dim, SPRITE_STATES);
      return (key !== 'terminal' ? sprites.decoded(key) : null) || sprites.get('terminal');
    }
    return null;
  }

  // --- sprite draw helpers (mirror Client.html spr / sprTurned) ---
  _spr(ctx, sprites, T, name, px, py, alpha) {
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.get(name), px, py, T, T);
    ctx.restore();
  }

  /**
   * Draw an already-resolved image (used for animation variants). `flip` mirrors it horizontally
   * about the CELL centre — the pawn-facing mirror, and the only caller that passes it. Mirroring
   * about the cell (not the sprite's own bbox) is what makes the flip cost no position change:
   * every pawn image bbox-centres within half a pixel of the 128px cell's own centre.
   */
  _sprImg(ctx, T, img, px, py, alpha, flip) {
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate(px + T, py); ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, T, T);
    } else {
      ctx.drawImage(img, px, py, T, T);
    }
    ctx.restore();
  }

  _sprTurned(ctx, sprites, T, role, turns, px, py, alpha) {
    if (!turns) { this._spr(ctx, sprites, T, role, px, py, alpha); return; }
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.rotated(role, turns), px, py, T, T);
    ctx.restore();
  }

  _floor(ctx, T, px, py, useSpr, sprites) {
    if (useSpr) { this._spr(ctx, sprites, T, 'floor', px, py); return; }
    P.paintFloor(ctx, T, px, py);
  }

  _debris(ctx, T, px, py, useSpr, sprites) {
    if (useSpr && sprites.get('debris')) { this._spr(ctx, sprites, T, 'debris', px, py); return; }
    P.paintDebris(ctx, T, px, py);
  }

  _wall(ctx, T, px, py, o, useSpr, sprites) {
    // Deep solid hull (not a face) is a plain dark mass in BOTH skins.
    if (!o.face) { ctx.fillStyle = HULL; ctx.fillRect(px, py, T, T); return; }
    if (useSpr) {
      if (o.vert) {
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sprites.wallVertical(), px, py, T, T); ctx.restore();
      } else {
        this._spr(ctx, sprites, T, 'wall', px, py);
      }
      return;
    }
    P.paintWall(ctx, T, px, py);
  }

  _entity(ctx, T, px, py, o, useSpr, sprites, anim = {}) {
    const dim = o.dim;
    const col = dim ? FG[C.DeviceDim] : FG[o.fg];
    const cx = px + T / 2, cy = py + T / 2, r = T * 0.34;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.7;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ch = String.fromCharCode(o.g);
    const role = o.role;
    if (role && useSpr && sprites.get(role)) {
      // C7 device state: a broken/off variant when the art exists (else the base role sprite).
      const key = deviceSpriteKey(role, o.fg, dim, SPRITE_STATES);
      const variant = key !== role ? sprites.decoded(key) : null;
      if (variant) this._sprImg(ctx, T, variant, px, py, dim ? 0.7 : 1);
      else this._sprTurned(ctx, sprites, T, role, o.turns, px, py, dim ? 0.7 : 1);
      ctx.restore();
      return;
    }
    switch (ch) {
      case '@':
        if (useSpr && o.fg === C.Crew) {
          const v = o.pv || 0;
          const pr = (PAWN_ROLES[v] && sprites.get(PAWN_ROLES[v])) ? PAWN_ROLES[v] : 'pawn';
          // C7 walk: cycle SPRITE_FRAMES while walking + slide continuously toward the current tile.
          const entry = this._entryFor(o, anim);
          // Sprite choice holds "walking" for a couple of step-less frames (isAnimWalking) so
          // per-frame step gaps don't flicker walking↔standing; the SLIDE is time-driven and
          // self-gating (slideOffset survives step-less frames, so no snap when another crew steps).
          const key = pawnSpriteKey(pr, isAnimWalking(entry, anim.nowMs), anim.timeSec || 0, SPRITE_FRAMES);
          const frameImg = key !== pr ? sprites.decoded(key) : null;
          const off = slideOffset(entry, anim.nowMs);
          const dx = off.ox * T, dy = off.oy * T;
          // …and the sticky horizontal mirror (motion.js "WHICH WAY A PAWN LOOKS") — the art has
          // one east-facing profile, so a westbound pawn is drawn mirrored instead of moonwalking.
          // Pawn branch only: devices orient via `turns`, and nothing else here is ever mirrored.
          const flip = !!(entry && entry.flipX);
          const img = frameImg || sprites.get(pr);
          this._sprImg(ctx, T, img, px + dx, py + dy, dim ? 0.7 : 1, flip);
          break;
        }
        P.paintPawn(ctx, cx, cy, r, col); break;
      case '&': P.paintCorpse(ctx, cx, cy, r); break;
      case '+':
        if (useSpr) { this._spr(ctx, sprites, T, 'door', px, py, dim ? 0.7 : 1); break; }
        P.paintDoor(ctx, T, px, py, 'closed', col); break;
      case '/': P.paintDoor(ctx, T, px, py, 'open', col); break;
      case 'X':
        if (useSpr) {
          this._spr(ctx, sprites, T, 'door', px, py, dim ? 0.7 : 1);
          ctx.fillStyle = 'rgba(255,176,46,.28)'; ctx.fillRect(px, py, T, T); break;
        }
        P.paintDoor(ctx, T, px, py, 'locked', col); break;
      case 'S': P.paintFan(ctx, cx, cy, r); break;
      case '"':
        if (useSpr) { this._spr(ctx, sprites, T, 'growbed', px, py, dim ? 0.7 : 1); break; }
        P.paintGrowBed(ctx, T, px, py); break;
      case 'O': P.paintTank(ctx, cx, cy, r); break;
      case '=': P.paintRadiator(ctx, T, px, py, col); break;
      case 'T':
        if (useSpr) {
          const key = deviceSpriteKey('terminal', o.fg, dim, SPRITE_STATES);
          const variant = key !== 'terminal' ? sprites.decoded(key) : null;
          if (variant) this._sprImg(ctx, T, variant, px, py, dim ? 0.7 : 1);
          else this._spr(ctx, sprites, T, 'terminal', px, py, dim ? 0.7 : 1);
          break;
        }
        P.paintTerminal(ctx, T, px, py, col); break;
      case 'G': P.paintSolar(ctx, T, px, py, col); break;
      case 'B': P.paintBattery(ctx, T, px, py, col); break;
      case '^': P.paintVent(ctx, cx, cy, r, col); break;
      case '*': P.paintLight(ctx, cx, cy, r); break;
      case 'H': P.paintLadder(ctx, T, px, py, col); break;
      case '~': P.paintConduit(ctx, T, px, py, col); break;
      case 'R': P.paintMachine(ctx, T, px, py, col, 'drop'); break;
      case 'F': P.paintMachine(ctx, T, px, py, col, 'gear'); break;
      case 'M': P.paintMachine(ctx, T, px, py, col, 'tools'); break;
      case 'Y': P.paintMachine(ctx, T, px, py, col, 'recycle'); break;
      default: P.paintItem(ctx, o.g, cx, cy, col); break;
    }
    ctx.restore();
  }
}
