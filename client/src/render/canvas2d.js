// Canvas2D executor — the P1 thin backend. Walks a DisplayList (from composeScene) and draws
// it with pixel-identical conventions to hosts/web/Client.html: sprite table with procedural
// fallback, wall-face/hull-mass, crew variants, facing-aware rotation, lens wash, hover cursor,
// selection reticle. Implements the Executor shape in executor.js.

import { C, FG, WASH, HULL, litOverlay } from './palette.js';
import { transform } from './camera.js';
import { PAWN_ROLES } from './glyphs.js';
import * as P from './procedural.js';

export class Canvas2DExecutor {
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

    // full clear + deep-fog field behind everything
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.viewW, cam.viewH);
    ctx.fillStyle = FG[C.Unknown];
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    const { s, ox, oy } = transform(cam);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = false;

    for (const o of list) {
      const px = o.x * T, py = o.y * T;
      switch (o.op) {
        case 'hull': ctx.fillStyle = HULL; ctx.fillRect(px, py, T, T); break;
        case 'void': ctx.fillStyle = FG[C.Void]; ctx.fillRect(px, py, T, T); break;
        case 'floor': this._floor(ctx, T, px, py, useSpr, sprites); break;
        case 'debris': this._debris(ctx, T, px, py, useSpr, sprites); break;
        case 'wall': this._wall(ctx, T, px, py, o, useSpr, sprites); break;
        case 'entity': this._entity(ctx, T, px, py, o, useSpr, sprites); break;
        case 'light': { const c = litOverlay(o.state); if (c) { ctx.fillStyle = c; ctx.fillRect(px, py, T, T); } break; }
        case 'wash': ctx.fillStyle = WASH[o.bg]; ctx.fillRect(px, py, T, T); break;
        case 'cursor': P.paintCursor(ctx, T, px, py); break;
        case 'reticle': P.paintSelection(ctx, T, px, py, timeSec); break;
        default: break;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- sprite draw helpers (mirror Client.html spr / sprTurned) ---
  _spr(ctx, sprites, T, name, px, py, alpha) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.get(name), px, py, T, T);
    ctx.restore();
  }

  _sprTurned(ctx, sprites, T, role, turns, px, py, alpha) {
    if (!turns) { this._spr(ctx, sprites, T, role, px, py, alpha); return; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
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
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprites.wallVertical(), px, py, T, T); ctx.restore();
      } else {
        this._spr(ctx, sprites, T, 'wall', px, py);
      }
      return;
    }
    P.paintWall(ctx, T, px, py);
  }

  _entity(ctx, T, px, py, o, useSpr, sprites) {
    const dim = o.dim;
    const col = dim ? FG[C.DeviceDim] : FG[o.fg];
    const cx = px + T / 2, cy = py + T / 2, r = T * 0.34;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.7;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ch = String.fromCharCode(o.g);
    const role = o.role;
    if (role && useSpr && sprites.get(role)) {
      this._sprTurned(ctx, sprites, T, role, o.turns, px, py, dim ? 0.7 : 1);
      ctx.restore();
      return;
    }
    switch (ch) {
      case '@':
        if (useSpr && o.fg === C.Crew) {
          const v = o.pv || 0;
          const pr = (PAWN_ROLES[v] && sprites.get(PAWN_ROLES[v])) ? PAWN_ROLES[v] : 'pawn';
          this._spr(ctx, sprites, T, pr, px, py, dim ? 0.7 : 1); break;
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
        if (useSpr) { this._spr(ctx, sprites, T, 'terminal', px, py, dim ? 0.7 : 1); break; }
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
