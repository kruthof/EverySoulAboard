// Entry point — wires the wire session, the pure composer + Canvas2D executor, the HUD, and
// the input map into the running client. The runtime glue (canvas sizing, first-frame camera
// placement, sprite toggle, the paused-but-breathing selection reticle loop) is ported from
// hosts/web/Client.html; all the drawing decisions live in the pure core (composeScene).

import { composeScene } from './render/compose.js';
import { Canvas2DExecutor } from './render/canvas2d.js';
import { clampCam } from './render/camera.js';
import { SpriteAssets, spriteMeta, SPRITE_TILE } from './render/sprites.js';
import { WireSession, Cmd } from './wire/session.js';
import { installInput } from './input/controls.js';
import * as Hud from './ui/hud.js';

const PROC_TILE = 26;
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const ctx = canvas.getContext('2d');
const executor = new Canvas2DExecutor();

let frame = null;
let spriteMode = true;
const sprites = new SpriteAssets(() => { camera.placed = false; layout(); draw(); });

// Camera descriptor (see render/camera.js). tile follows the active skin's tile size.
const camera = { x: 32, y: 10, z: 2, viewW: canvas.width, viewH: canvas.height, tile: PROC_TILE, placed: false };
const currentTile = () => (sprites.usable(spriteMode) ? SPRITE_TILE : PROC_TILE);

// ---- canvas sizing + first-frame camera placement (port of layoutCanvas) ----
function layout() {
  if (!frame) return;
  camera.tile = currentTile();
  const stage = canvas.parentElement, dpr = window.devicePixelRatio || 1;
  const w = Math.max(64, Math.round((stage.clientWidth - 28) * dpr));
  const h = Math.max(64, Math.round((stage.clientHeight - 28) * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  camera.viewW = canvas.width; camera.viewH = canvas.height;
  if (!camera.placed) {
    let cx = frame.w / 2, cy = frame.h / 2;
    for (let i = 0; i < frame.cells.length; i++) {
      if (frame.cells[i][0] === 64) { cx = (i % frame.w) + 0.5; cy = ((i / frame.w) | 0) + 0.5; break; }
    }
    const q = new URLSearchParams(location.search);
    if (q.has('cx')) cx = parseFloat(q.get('cx'));
    if (q.has('cy')) cy = parseFloat(q.get('cy'));
    const tilepx = q.has('zoom') ? parseFloat(q.get('zoom')) : 72;
    camera.x = cx; camera.y = cy; camera.z = tilepx * dpr / camera.tile; camera.placed = true;
  }
  clampCam(camera, frame);
}

// ---- render: pure compose → thin execute ----
function draw() {
  if (!frame) return;
  const list = composeScene(frame, camera, spriteMeta);
  executor.execute(list, ctx, {
    camera, sprites, spriteMode,
    timeSec: (typeof performance !== 'undefined' ? performance.now() : 0) / 1000,
  });
}

// ---- selection reticle: redraw ~30fps ONLY while a crew is selected, so the pulse breathes
//      even on pause; the loop stops itself when nothing is selected. ----
let selAnim = 0, lastSel = 0;
function startSelAnim() { if (frame && frame.sel && !selAnim) selAnim = requestAnimationFrame(selLoop); }
function selLoop(ts) {
  if (!frame || !frame.sel) { selAnim = 0; return; }
  if (ts - lastSel >= 33) { lastSel = ts; draw(); }
  selAnim = requestAnimationFrame(selLoop);
}

// ---- sprite toggle (P): keep the on-screen scale steady across the tile-size change ----
function toggleSprites() {
  const t0 = camera.tile;
  spriteMode = !spriteMode;
  const t1 = currentTile();
  camera.z *= t0 / t1;
  camera.tile = t1;
  layout(); draw();
}

// ---- wire message dispatch ----
const session = new WireSession(onMessage, (connected) => {
  document.getElementById('disc').style.display = connected ? 'none' : 'flex';
});

function onMessage(m) {
  switch (m.type) {
    case 'frame':
      frame = m;
      startSelAnim();
      layout(); draw();
      Hud.setChip('s-deck', m.deck); Hud.setChip('s-lens', m.lens);
      Hud.reflectLens(m.lens);
      break;
    case 'metrics': Hud.renderMetrics(m); break;
    case 'log': Hud.renderLog(m.lines); break;
    case 'legend': Hud.renderLegend(m.lines); break;
    case 'inspect': Hud.renderInspect(m.lines); break;
    case 'status': Hud.renderStatus(m); break;
    default: break;
  }
}

// ---- HUD controls + input ----
Hud.buildLensButtons((name) => session.send(Cmd.lens(name)));
document.getElementById('b-pause').onclick = () => session.send(Cmd.pause());
document.getElementById('b-faster').onclick = () => session.send(Cmd.speed(1));
document.getElementById('b-slower').onclick = () => session.send(Cmd.speed(-1));
document.getElementById('b-deckup').onclick = () => session.send(Cmd.deck(1));
document.getElementById('b-deckdown').onclick = () => session.send(Cmd.deck(-1));
document.getElementById('b-move').onclick = () => session.send(Cmd.move());

installInput({ canvas, camera, session, getFrame: () => frame, draw, toggleSprites });
window.addEventListener('resize', () => { layout(); draw(); });

session.connect();
