// Input map — camera-aware mouse + keyboard, a faithful port of the handlers in
// hosts/web/Client.html. Mouse: wheel zoom (anchored on the cursor tile), drag pan, click
// select/toggle, shift-click move, hover cursor. Keyboard: WASD pan, arrows/hjkl cursor,
// R/F deck, 1–7 lens, space pause, +/− speed, m move, Enter click, P sprite toggle. P2 (C5):
// T (or Enter on a selected crew) opens a talk with them; Esc closes the active dialogue (bye).

import { tileFromPoint, zoomAt, panPixels, panByStep } from '../render/camera.js';
import { Cmd } from '../wire/session.js';
import { selectedCrewCid } from '../wire/messages.js';
import { LENSES } from '../ui/hud.js';

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   camera: import('../render/camera.js').Camera,
 *   session: import('../wire/session.js').WireSession,
 *   getFrame: () => any,
 *   draw: () => void,
 *   toggleSprites: () => void,
 *   onEscape?: () => void,
 * }} opts
 */
export function installInput(opts) {
  const { canvas, camera, session, getFrame, draw, toggleSprites } = opts;
  const onEscape = opts.onEscape || (() => {});

  // Open a conversation with the currently selected crew (T, or Enter when a crew is selected).
  // Resolves the cid from the selected tile; a non-crew selection (or a cid-less older frame) is
  // a no-op, so the key never sends a malformed talk.
  function talkSelected() {
    const cid = selectedCrewCid(getFrame());
    if (cid != null) { session.send(Cmd.talk(cid)); return true; }
    return false;
  }
  // All listeners are bound to this controller's signal so a single dispose() (returned below)
  // removes every one at once — canvas AND window. main.js calls it before swapping the canvas
  // element on a WebGL→Canvas2D fallback, so the fresh canvas gets a clean set of handlers with
  // no duplicate window listeners.
  const ac = new AbortController();
  const signal = ac.signal;
  let cursorTile = { x: -1, y: -1 };
  const cur = { x: 32, y: 10 };  // arrow-key inspection cursor

  const T = () => camera.tile;

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { px: (e.clientX - r.left) * canvas.width / r.width, py: (e.clientY - r.top) * canvas.height / r.height };
  }

  // --- wheel zoom, anchored on the tile under the mouse ---
  canvas.addEventListener('wheel', (e) => {
    const frame = getFrame(); if (!frame) return; e.preventDefault();
    const { px, py } = canvasPoint(e);
    zoomAt(camera, frame, px, py, e.deltaY < 0 ? 1.25 : 0.8);
    draw();
  }, { passive: false, signal });

  // --- drag = pan; a press that never travels is a click (select / shift-move) ---
  let press = null;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) press = { x: e.clientX, y: e.clientY, moved: false }; }, { signal });
  window.addEventListener('mouseup', (e) => {
    const frame = getFrame();
    if (press && !press.moved && frame) {
      const { px, py } = canvasPoint(e);
      const t = tileFromPoint(camera, px, py);
      if (t.x >= 0 && t.y >= 0 && t.x < frame.w && t.y < frame.h) {
        if (e.shiftKey) { session.send(Cmd.cursor(t.x, t.y)); session.send(Cmd.move()); }
        else session.send(Cmd.click(t.x, t.y));
      }
    }
    press = null; canvas.parentElement.classList.remove('panning');
  }, { signal });
  canvas.addEventListener('mousemove', (e) => {
    const frame = getFrame();
    if (press) {
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (press.moved || Math.abs(dx) + Math.abs(dy) > 4) {
        press.moved = true; canvas.parentElement.classList.add('panning');
        const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
        panPixels(camera, frame, dx * k, dy * k);
        press.x = e.clientX; press.y = e.clientY;
        draw();
      }
      return;
    }
    if (!frame) return;
    const { px, py } = canvasPoint(e);
    const t = tileFromPoint(camera, px, py);
    if (t.x < 0 || t.y < 0 || t.x >= frame.w || t.y >= frame.h) return;
    if (t.x !== cursorTile.x || t.y !== cursorTile.y) { cursorTile = t; session.send(Cmd.cursor(t.x, t.y)); }
  }, { signal });

  // --- keyboard ---
  function moveCur(dx, dy) {
    const frame = getFrame();
    if (frame) { cur.x = Math.max(0, Math.min(frame.w - 1, cur.x + dx)); cur.y = Math.max(0, Math.min(frame.h - 1, cur.y + dy)); }
    session.send(Cmd.cursor(cur.x, cur.y));
  }
  function pan(dx, dy) { const frame = getFrame(); if (frame) { panByStep(camera, frame, dx, dy); draw(); } }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    // Typing isolation: while focus is in any text-entry element (the dialogue say box,
    // the MOSS terminal textarea, ...), game shortcuts must not fire and must not
    // preventDefault the character away. Escape is the one deliberate exception — it
    // closes the focused panel even mid-typing (and inserts nothing anyway).
    if (isTextEntryTarget(e.target)) {
      if (k === 'Escape') onEscape();
      return;
    }
    if (k === 'P' || k === 'p') { toggleSprites(); return; }
    if (k === 'Escape') { onEscape(); }
    else if (k === 't' || k === 'T') { talkSelected(); }
    else if (k === 'w' || k === 'W') pan(0, -1);
    else if (k === 's' || k === 'S') pan(0, 1);
    else if (k === 'a' || k === 'A') pan(-1, 0);
    else if (k === 'd' || k === 'D') pan(1, 0);
    else if (k === 'ArrowUp' || k === 'k') moveCur(0, -1);
    else if (k === 'ArrowDown' || k === 'j') moveCur(0, 1);
    else if (k === 'ArrowLeft' || k === 'h') moveCur(-1, 0);
    else if (k === 'ArrowRight' || k === 'l') moveCur(1, 0);
    else if (k === 'r' || k === 'R' || k === '>') session.send(Cmd.deck(1));
    else if (k === 'f' || k === 'F' || k === '<') session.send(Cmd.deck(-1));
    else if (k >= '1' && k <= '7') session.send(Cmd.lens(LENSES[+k - 1]));
    else if (k === ' ') { e.preventDefault(); session.send(Cmd.pause()); }
    else if (k === '+' || k === '=') session.send(Cmd.speed(1));
    else if (k === '-' || k === '_') session.send(Cmd.speed(-1));
    else if (k === 'm' || k === 'M') session.send(Cmd.move());
    // Enter opens a talk when a crew is already selected (click-selected + Enter), else it acts
    // as a keyboard "click" at the inspection cursor (device toggle / select).
    else if (k === 'Enter') { if (!talkSelected()) session.send(Cmd.click(cur.x, cur.y)); }
    else return;
    e.preventDefault();
  }, { signal });

  // Remove every listener installed above (canvas + window) in one call.
  return () => ac.abort();
}

/**
 * True when a keydown's target is a text-entry surface — game shortcuts must stand
 * down. Pure and duck-typed (tagName/isContentEditable) so it is node-testable
 * without a DOM. Exported for tests.
 * @param {any} target
 */
export function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}
