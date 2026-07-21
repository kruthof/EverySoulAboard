// Entry point — wires the wire session, the pure composer + Canvas2D executor, the HUD, and
// the input map into the running client. The runtime glue (canvas sizing, first-frame camera
// placement, sprite toggle, the paused-but-breathing selection reticle loop) is ported from
// hosts/web/Client.html; all the drawing decisions live in the pure core (composeScene).

import { composeScene } from './render/compose.js';
import { Canvas2DExecutor } from './render/canvas2d.js';
import { WebGL2Executor } from './render/webgl2.js';
import { chooseBackend, parseFrozenTime } from './render/exec-select.js';
import { clampCam } from './render/camera.js';
import { initMotion, trackMotion, motionByTile } from './render/motion.js';
import { SpriteAssets, spriteMeta, SPRITE_TILE } from './render/sprites.js';
import { WireSession, Cmd } from './wire/session.js';
import { decodeLightPlane } from './wire/messages.js';
import { installInput } from './input/controls.js';
import * as Hud from './ui/hud.js';

const PROC_TILE = 26;
const params = new URLSearchParams(location.search);
// `?t=<sec>` freezes the reticle pulse (and any future time effect) so screenshots are byte-stable
// across executors; null → live wall clock. Used by the parity harness (client/tools/shot.mjs).
const FROZEN_T = parseFrozenTime(params);

let canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
let ctx = null;            // 2D context — set only on the Canvas2D path (a canvas is one context type)
let executor = makeExecutor(canvas);
let inputDispose = null;   // teardown for the current input listeners (see installInput)

// Pick + build the render backend from `?exec=canvas2d|webgl2`. WebGL2 is genuinely selected when
// requested AND supported; construction can still fail (no GL, driver quirk) → we catch and fall
// back to Canvas2D silently. Both backends implement the executor.js shape and consume the same
// DisplayList + ExecuteOpts, so main's draw loop is backend-agnostic. A mid-session context loss
// calls onContextLost → fallbackToCanvas2D(), swapping the executor without crashing the loop.
function makeExecutor(cnv) {
  const available = typeof WebGL2RenderingContext !== 'undefined';
  if (chooseBackend(params, { webgl2Available: available }) === 'webgl2') {
    try {
      const ex = new WebGL2Executor(cnv);
      ex.onContextLost = () => fallbackToCanvas2D();
      ctx = null;
      return ex;
    } catch (e) {
      console.info('[perilune] backend=canvas2d (webgl2 init failed: ' + (e && e.message) + ')');
    }
  }
  ctx = cnv.getContext('2d');
  console.info('[perilune] backend=canvas2d');
  return new Canvas2DExecutor();
}

// Silent mid-session fallback: a lost WebGL2 context can't hand its canvas back as 2D (a canvas is
// bound to one context type), so we replace the canvas element with a fresh clone, take a 2D
// context on it, rebind input, and redraw. The frame loop keeps running throughout.
let swapping = false;
function fallbackToCanvas2D() {
  if (swapping || executor instanceof Canvas2DExecutor) return;
  swapping = true;
  console.info('[perilune] webgl2 context lost — falling back to canvas2d');
  if (inputDispose) inputDispose();
  const fresh = /** @type {HTMLCanvasElement} */ (canvas.cloneNode(false));
  canvas.replaceWith(fresh);
  canvas = fresh;
  ctx = canvas.getContext('2d');
  executor = new Canvas2DExecutor();
  camera.placed = false;
  inputDispose = installInput({
    canvas, camera, session, getFrame: () => frame, draw, toggleSprites,
    onEscape: () => Hud.closeActiveDialogue(),
  });
  swapping = false;
  layout(); draw();
}

let frame = null;
let spriteMode = true;
// Latest decoded lighting plane per deck (light messages arrive out-of-band from frames). The
// current deck's plane is fed to composeScene; a deck we haven't received lighting for composes
// with none (byte-identical to the no-lights path).
const lightPlanes = new Map();
const currentLights = () => (frame ? lightPlanes.get(frame.deck) || null : null);

// C7 motion: per-cid tracking across frames → walking/facing/interpolation, fed to the executors as
// data (compose stays time-free). WALK_MS is how long a one-tile slide takes; the walk-progress is
// derived from wall time since the latest frame landed (frozen to 1 for deterministic screenshots).
const WALK_MS = 130;
let motion = initMotion();
let lastFrameMs = 0;
function walkProgress() {
  if (FROZEN_T != null) return 1;
  const now = (typeof performance !== 'undefined' ? performance.now() : 0);
  return Math.max(0, Math.min(1, (now - lastFrameMs) / WALK_MS));
}
function anyWalking() {
  if (FROZEN_T != null || !motion) return false;
  const now = (typeof performance !== 'undefined' ? performance.now() : 0);
  if (now - lastFrameMs >= WALK_MS) return false; // the slide finished; nothing to animate
  for (const cid in motion.byCid) if (motion.byCid[cid].walking) return true;
  return false;
}
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
  const list = composeScene(frame, camera, spriteMeta, currentLights());
  executor.execute(list, ctx, {
    camera, sprites, spriteMode,
    timeSec: FROZEN_T != null ? FROZEN_T : (typeof performance !== 'undefined' ? performance.now() : 0) / 1000,
    motion: motionByTile(motion),
    walkProgress: walkProgress(),
  });
}

// ---- animation loop: redraw ~30fps while a crew is selected (the reticle breathes even on pause)
//      OR while a crew is mid-walk (the pawn slides + its walk cycle advances). The loop stops
//      itself the moment neither is true. Frozen time (?t=) never animates (deterministic frames). ----
let anim = 0, lastAnim = 0;
function animActive() { return FROZEN_T == null && ((frame && frame.sel) || anyWalking()); }
function startAnim() { if (animActive() && !anim) anim = requestAnimationFrame(animLoop); }
function animLoop(ts) {
  if (!animActive()) { anim = 0; return; }
  if (ts - lastAnim >= 33) { lastAnim = ts; draw(); }
  anim = requestAnimationFrame(animLoop);
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
      motion = trackMotion(motion, m);
      lastFrameMs = (typeof performance !== 'undefined' ? performance.now() : 0);
      frame = m;
      startAnim();
      layout(); draw();
      Hud.setChip('s-deck', m.deck); Hud.setChip('s-lens', m.lens);
      Hud.reflectLens(m.lens);
      break;
    case 'light': {
      const plane = decodeLightPlane(m);
      if (plane) { lightPlanes.set(m.deck, plane); if (frame && frame.deck === m.deck) draw(); }
      break;
    }
    case 'metrics': Hud.renderMetrics(m); break;
    case 'log': Hud.renderLog(m.lines); break;
    case 'legend': Hud.renderLegend(m.lines); break;
    case 'inspect': Hud.renderInspect(m.lines); break;
    case 'status': Hud.renderStatus(m); break;
    // P2 panels (C5 live): dialogue / citizen / terminal / LLM status.
    case 'chat': Hud.renderChat(m); break;
    case 'citizen': Hud.renderCitizen(m); break;
    case 'device': Hud.renderDevice(m); break;
    case 'moss': Hud.renderMoss(m); break;
    case 'llmstatus': Hud.renderLlmStatus(m); break;
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

// P2 conversation wiring: the dialogue input box sends `say`, closing (× / Esc) sends `bye`.
Hud.onDialogueSend((sid, text) => session.send(Cmd.say(sid, text)));
Hud.onDialogueClose((sid) => session.send(Cmd.bye(sid)));
// P2 MOSS terminal wiring: the drawer's open/install/refresh gestures send `moss {op,tid,text?}`.
Hud.onTerminalOp((op, tid, text) => session.send(Cmd.moss(op, tid, text)));

inputDispose = installInput({
  canvas, camera, session, getFrame: () => frame, draw, toggleSprites,
  onEscape: () => Hud.closeActiveDialogue(),
});
window.addEventListener('resize', () => { layout(); draw(); });

session.connect();
