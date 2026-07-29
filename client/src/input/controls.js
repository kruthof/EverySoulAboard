// Input map — camera-aware mouse + keyboard, a faithful port of the handlers in
// hosts/web/Client.html. Mouse: wheel zoom (anchored on the cursor tile), drag pan, click
// select/toggle, shift-click move, hover cursor. Keyboard: WASD pan, arrows/hjkl cursor,
// R/F deck, 1–7 lens, space pause, +/− speed, m move, Enter click, P sprite toggle. P2 (C5):
// T (or Enter on a selected crew) opens a talk with them; Esc closes the active dialogue (bye).

import { tileFromPoint, zoomAt, panPixels, panByStep, transform } from '../render/camera.js';
import { Cmd } from '../wire/session.js';
import { selectedCrewCid } from '../wire/messages.js';
import { LENSES } from '../ui/hud.js';
import { isBuildTool } from '../ui/console-model.js';
import { ACCEPT_ALL } from '../ui/stock-filter-model.js';

/**
 * Click assist — PURE. Crew walk constantly and slide between tiles, so a click that "looks"
 * on a pawn often lands on a neighbouring tile and selects nothing. Given the frame's crew
 * tuples, the motion tracker (to include the tile a walker is sliding FROM), the camera and a
 * canvas-pixel click point, return the CURRENT tile of the nearest crew member whose drawn
 * body plausibly covers the click (within ~0.7 tile of either slide endpoint), or null when
 * the click isn't near anyone — the caller then falls through to the plain tile click.
 * @param {{crew?:number[][]}|null} frame
 * @param {Object<string,{fromX:number,fromY:number,walking:boolean}>|null} motion  by-tile map
 * @param {import('../render/camera.js').Camera} camera
 * @param {number} px @param {number} py  click point in canvas pixels
 * @returns {{x:number,y:number}|null}
 */
export function crewTileNear(frame, motion, camera, px, py) {
  if (!frame || !Array.isArray(frame.crew) || frame.crew.length === 0) return null;
  const T = camera.tile;
  const { s, ox, oy } = transform(camera);
  const radius = 0.7 * T * s;
  let best = null, bestD = radius;
  for (const c of frame.crew) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const entry = motion ? motion[c[0] + ',' + c[1]] : null;
    // Candidate body centres: the current tile, plus the slide-from tile while mid-walk.
    const cands = entry && entry.walking ? [[c[0], c[1]], [entry.fromX, entry.fromY]] : [[c[0], c[1]]];
    for (const [tx, ty] of cands) {
      const dx = (tx + 0.5) * T * s + ox - px;
      const dy = (ty + 0.5) * T * s + oy - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = { x: c[0], y: c[1] }; }
    }
  }
  return best;
}

/**
 * Lower an armed PALETTE tool + tile to the wire orders it means — an array of 0..2 payloads, empty
 * when the tool is not a palette tool (MOVE / nothing armed — those have their own branches at the
 * call site). PURE.
 *
 * Build kinds go out as `Cmd.build`; the order kinds go out as `Cmd.dig`/`Cmd.stockpile`/`Cmd.strip`.
 * Same gesture, different verb — routing an order tool through `Cmd.build` would hand it to
 * BuildSystem, which knows nothing about designations. This is one exported function rather than a
 * branch inlined at each call site so the mouse-click and Enter-key paths cannot drift apart (they
 * previously shared a forked copy of console-model's `isBuildTool`), and so the routing itself is
 * node-testable without a DOM.
 *
 * IT RETURNS A LIST, NOT ONE PAYLOAD (E0-4 WP-5). Painting a filtered stockpile needs BOTH presence
 * and filter, and inlining the second `session.send` at one of the two call sites is precisely the
 * drift this function exists to prevent. Widening the seam keeps "which verbs does this tool send"
 * in one testable place; the alternative puts it in two, one of which nobody remembers.
 *
 * @param {null|string} tool @param {number} x @param {number} y
 * @param {number} [mask] the stockpile accept-mask; ignored by every other tool
 * @returns {object[]} 0..2 Cmd payloads, in send order
 */
export function paletteOrders(tool, x, y, mask) {
  if (isBuildTool(tool)) return [Cmd.build(tool, x, y)];
  if (tool === 'dig') return [Cmd.dig(x, y, true)];
  if (tool === 'strip') return [Cmd.strip(x, y, true)];
  if (tool === 'stockpile') {
    // ALWAYS both, ALWAYS in this order: zone the tile, THEN assert its complete accept-set.
    // Both land in the same command drain before any system runs, so the intermediate state is
    // unobservable — but `DesignateStockpileCommand` OFF *clears* the filter, so the reverse order
    // would break the day an OFF path is added here. Pinned by test now, while it is free.
    //
    // A missing/garbage mask defaults to ACCEPT-ALL and NEVER to silence: sending nothing would let
    // a tile keep an earlier restrictive filter that the player has just repainted as accept-all.
    // Every repaint re-asserts the whole truth.
    //
    // CORRECTED (console-retirement WP-3): this comment used to end "with no tint, badge or readout
    // anywhere that could tell them (there is no wire channel for a filter, see MECHANICS §13)".
    // There is one now — the sparse `zones` channel carries every stockpile tile's accept mask, and
    // the Room Zoom draws a restricted tile with a wedge plus a named key (ui/zone-overlay.js). The
    // re-assert-everything rule above still stands on its own merits; it just is not the last line of
    // defence any more.
    const m = Number.isFinite(mask) ? mask : ACCEPT_ALL;
    return [Cmd.stockpile(x, y, true), Cmd.filter(x, y, m)];
  }
  return [];
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   camera: import('../render/camera.js').Camera,
 *   session: import('../wire/session.js').WireSession,
 *   getFrame: () => any,
 *   draw: () => void,
 *   toggleSprites: () => void,
 *   onEscape?: () => void,
 *   getArmedTool?: () => (null|'wall'|'door'|'cancel'|'dig'|'stockpile'|'strip'|'erase'|'move'),
 *   getStockFilter?: () => number,
 *   onBuildKey?: (kind: 'build'|'cancel'|'dig'|'stockpile'|'strip'|'erase') => void,
 *   onToolUsed?: (tool: string, x: number, y: number) => void,
 * }} opts
 */
export function installInput(opts) {
  const { canvas, camera, session, getFrame, draw, toggleSprites } = opts;
  const onEscape = opts.onEscape || (() => {});
  const getMotion = opts.getMotion || (() => null);
  // Armed-tool seam (IX-34): the UI owns the single armedTool slot; the click/Enter handlers
  // branch on it. onBuildKey routes B/X to the UI (controls.js stays free of UI imports beyond
  // LENSES); onToolUsed lets the UI acknowledge a placement (pulse) / disarm the move order.
  const getArmedTool = opts.getArmedTool || (() => null);
  // E0-4 WP-5: the stockpile accept-mask, read at click time from the UI's palette. It arrives as a
  // GETTER parameter rather than being read out of hud.js here (controls.js already imports from
  // hud.js, so that would compile) because a module-state read would make paletteOrders impure and
  // untestable — the whole reason the seam exists.
  const getStockFilter = opts.getStockFilter || (() => ACCEPT_ALL);
  const onBuildKey = opts.onBuildKey || (() => {});
  const onToolUsed = opts.onToolUsed || (() => {});
  // Fires on every plain/shift canvas click (mouse or Enter) — a NEWER selection intent, so the
  // UI can drop a pending cross-deck row click (IX-42 supersession). Armed-tool clicks report
  // through onToolUsed instead.
  const onCanvasClick = opts.onCanvasClick || (() => {});

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
        const tool = getArmedTool();
        const orders = paletteOrders(tool, t.x, t.y, getStockFilter());
        if (orders.length) {
          // IX-32: while a palette tool is armed a non-drag click sends that tool's orders and
          // nothing else — no selection, no device toggle, no crew snap, shift suppressed (IX-33).
          for (const o of orders) session.send(o);
          onToolUsed(tool, t.x, t.y);
        } else if (tool === 'move') {
          // IX-52 guided move order: one click, one order, then the UI disarms via onToolUsed.
          session.send(Cmd.cursor(t.x, t.y)); session.send(Cmd.move());
          onToolUsed('move', t.x, t.y);
        } else if (e.shiftKey) {
          session.send(Cmd.cursor(t.x, t.y)); session.send(Cmd.move());
          onCanvasClick(t.x, t.y);
        } else {
          // Click assist: snap to a nearby (possibly mid-slide) crew member's tile so moving
          // pawns are actually clickable; a click near no one stays a plain tile click.
          const snap = crewTileNear(frame, getMotion(), camera, px, py);
          const c = snap || t;
          session.send(Cmd.click(c.x, c.y));
          onCanvasClick(c.x, c.y);
        }
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
    // Space on a focused BUTTON belongs to the button's native activation (same yield as
    // Enter below) — a keyboard user activating a crew row must not pause the sim instead.
    else if (k === ' ' && e.target && e.target.tagName === 'BUTTON') return;
    else if (k === ' ') { e.preventDefault(); session.send(Cmd.pause()); }
    else if (k === '+' || k === '=') session.send(Cmd.speed(1));
    else if (k === '-' || k === '_') session.send(Cmd.speed(-1));
    else if (k === 'm' || k === 'M') session.send(Cmd.move());
    // B/X (IX-10/IX-11): build / cancel-order toggles, routed to the UI's armed-tool slot.
    else if (k === 'b' || k === 'B') onBuildKey('build');
    else if (k === 'x' || k === 'X') onBuildKey('cancel');
    // G/Z (E0-3): dig / stockpile-zone order toggles, through the same armed-tool seam. The
    // mnemonic keys are taken: D and S are WASD panning, and H is vim cursor-left above — binding
    // H here would have been silently dead for lowercase h, which is why stockpile is Z for ZONE.
    else if (k === 'g' || k === 'G') onBuildKey('dig');
    else if (k === 'z' || k === 'Z') onBuildKey('stockpile');
    // V (E0-5): strip / deconstruct order toggle. X — the plan's first choice — is already the
    // CANCEL toggle above, and no letter of "strip" is free (S/T/R panning+talk+deck, P sprites,
    // I is vim-adjacent), so V for salVage (the sim's own term: WallSalvage/DeviceSalvage).
    else if (k === 'v' || k === 'V') onBuildKey('strip');
    // C (M1-C): the ERASE / un-designate toggle — C for Cancel. X, the obvious letter, has been the
    // console's own cancel-a-build toggle since IX-11 and the Room Zoom's DEMOLISH since WP-2, so it
    // is taken twice over; C is free on both keymaps. This key serves the LEVEL-1 OVERVIEW (the Room
    // Zoom has its own capture-phase handler and binds C itself); on the deprecated console it arms
    // a tool the console's palette does not draw and `paletteOrders` does not lower, so a click
    // there is inert — which is the right way round for a surface closed to new work.
    else if (k === 'c' || k === 'C') onBuildKey('erase');
    // Enter on a focused BUTTON (crew-watch row, chip, tab) belongs to the button's native
    // activation (IX-46) — the game key stands down so a row Enter doesn't also click the cursor.
    else if (k === 'Enter' && e.target && e.target.tagName === 'BUTTON') return;
    // Enter (armed build tool): keyboard placement parity — build at the inspection cursor (IX-33).
    // Otherwise: talk when a crew is selected, else a keyboard "click" at the inspection cursor.
    else if (k === 'Enter') {
      const tool = getArmedTool();
      const orders = paletteOrders(tool, cur.x, cur.y, getStockFilter());
      if (orders.length) { for (const o of orders) session.send(o); onToolUsed(tool, cur.x, cur.y); }
      else if (!talkSelected()) { session.send(Cmd.click(cur.x, cur.y)); onCanvasClick(cur.x, cur.y); }
    }
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
