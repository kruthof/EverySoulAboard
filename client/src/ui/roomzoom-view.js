// THE LEVEL-2 ROOM ZOOM SURFACE CONTROLLER — the warm single-room build/decorate view, a sibling
// takeover like the Overview / MOSS (`#roomzoom-view` + `body.roomzoom-open`). Entered by clicking
// an occupied room in the Level-1 Overview (its injectable `onEnterRoom(anchor)` hook); ESC / the
// breadcrumb / the minimap pop back. Authority: docs/design/perilune-roomzoom.{visual,interaction}
// -spec.md (VS-Z / IX-Z) + the mock docs/design/perilune-room-zoom.dc.html.
//
// It owns NO wire state: everything authoritative (frame cells, decks/rooms geometry, designs, the
// roster) is read back from the shared HUD caches; every sim action LOWERS to an existing Cmd or is
// declared DEFENSIVELY (Cmd.place/Cmd.remove land with a parallel sim lane — until then the tool
// pulses + reports an honest deferral, never a dead button). Cosmetic decor (RUG/SHELF) is a
// VIEW-ONLY, session-local layer that never touches the sim. All non-trivial derivations are the
// PURE room-model.js (node-tested); this file is DOM glue.

import * as Hud from './hud.js';
import { Cmd } from '../wire/session.js';
import { decodeDecks, decodeRooms, decodeDecor } from '../wire/messages.js';
import { decksView } from './decks-model.js';
import { buildItem } from '../items/index.js';
import { pawnSprite } from '../render/pawn-svg.js';
import { isTextEntryTarget } from '../input/controls.js';
import { roomMaterial } from '../theme/warm-tokens.js';
import { deckMinimap } from './deck-minimap.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, GHOST_ABBR, paletteCommand, nextRoomTool, roomTileRect, deckSlots,
  roomFit, tileFromCanvasXY, roomCells, roomCrew, roomDesigns, roomDecor, demolishTarget,
  addDecor, removeDecor, escStackRung,
} from './room-model.js';

/* eslint-disable no-multi-spaces */

const ITEM_SIDE = U * 1.6;      // furniture box (logical) — reads a touch larger than its tile
const PAWN_H = U * 2.0;         // pawn height (logical); viewBox is 16×24
const HINT = 'SELECT AN ITEM · CLICK THE FLOOR TO PLACE · CLICK A GHOST WITH DEMOLISH TO REMOVE';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _send = () => {};
let _onExit = () => {};
let _root = null;         // #roomzoom-view
let _canvas = null;       // .rz-canvas (the framed floor)
let _layers = null;       // <svg> furniture/pawn/ghost layer
let _pulseLayer = null;   // transient input pulses
let _toast = null;
let _toastTimer = 0;
let _raf = 0;

let _open = false;
let _focus = null;        // roomTileRect result {anchor, deck, slotIndex, roomType, displayName, rx,ry,rw,rh}
let _armed = null;        // the ONE Level-2 input slot (11 tools + null)
let _decor = [];          // session-local cosmetic decor (never hashed, never wired)

/** Mount the Room Zoom surface. Call once from main.js. Returns the { enter, exit } control API. */
export function initRoomZoom(opts) {
  _send = (opts && opts.send) || (() => {});
  _onExit = (opts && opts.onExit) || (() => {});
  _root = document.getElementById('roomzoom-view');
  if (!_root) return { enter: () => {}, exit: () => {}, isOpen: () => false };
  buildSkeleton();
  Hud.onShipUpdate(() => { if (_open) scheduleRepaint(); });
  // ESC / B / X in capture phase so the Room Zoom's own stack pre-empts the console's while it is
  // open (the console/canvas are display:none behind us). Other keys pass through untouched.
  window.addEventListener('keydown', onKey, true);
  return { enter: enterRoom, exit: exitRoom, isOpen: () => _open };
}

function buildSkeleton() {
  _root.hidden = false; // the `body.roomzoom-open` CSS switch drives visibility from here on
  _root.innerHTML =
    '<div class="rz-space"></div>' +
    '<div class="rz-canvas" id="rz-canvas">' +
      '<svg class="rz-layers" id="rz-layers" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="rz-caption" id="rz-caption"></div>' +
      '<div class="rz-pulse" id="rz-pulse"></div>' +
    '</div>' +
    '<div class="hud rz-breadcrumb" id="rz-breadcrumb"></div>' +
    '<div class="hud rz-minimap" id="rz-minimap"></div>' +
    '<div class="rz-palette-wrap">' +
      '<div class="hud rz-palette" id="rz-palette"></div>' +
      '<div class="rz-hint">' + HINT + '</div>' +
    '</div>' +
    '<div class="rz-toast" id="rz-toast" hidden></div>';
  _canvas = $('rz-canvas');
  _layers = $('rz-layers');
  _pulseLayer = $('rz-pulse');
  _toast = $('rz-toast');
  _canvas.addEventListener('click', onCanvasClick);
  _canvas.addEventListener('mousemove', onCanvasHover);
  _root.addEventListener('click', onHudClick);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Enter / exit.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Open the Room Zoom for a room (by its `decks` anchorName), from the Overview click. */
export function enterRoom(anchor) {
  const f = roomTileRect(currentDeckView(), anchor);
  if (!f) { toast('ROOM ZOOM UNAVAILABLE — ' + esc(anchor)); return; }
  _focus = f;
  _armed = null;
  _open = true;
  document.body.classList.add('roomzoom-open');
  repaint();
}

/** Pop back to the Overview (ESC rung 4 / breadcrumb / minimap). Disarms on the way out. */
export function exitRoom() {
  if (!_open) return;
  _open = false;
  _armed = null;
  _focus = null;
  document.body.classList.remove('roomzoom-open');
  _onExit();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Repaint (coalesced). Re-resolves the focus room each time so a vanished room pops (IX-Z-51) and a
// resized rect stays correct.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function scheduleRepaint() {
  if (_raf) return;
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  _raf = raf(() => { _raf = 0; repaint(); });
}

function currentDeckView() {
  return decksView(decodeDecks(Hud.getDecks()), decodeRooms(Hud.getRooms()));
}

/** All decor visible in the room: any wire decor plus the session-local pieces. */
function allDecor() {
  const wire = decodeDecor(Hud.getDecor()) || [];
  return wire.concat(_decor);
}

function repaint() {
  if (!_open || !_root || !_focus) return;
  // Re-resolve geometry from the live decks channel (rect may move; room may vanish).
  const f = roomTileRect(currentDeckView(), _focus.anchor, _focus.slotIndex);
  if (!f) { toast('ROOM NO LONGER EXISTS'); exitRoom(); return; }
  _focus = f;

  const frame = Hud.getFrame();
  const roster = Hud.getRoster();
  const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const designs = Hud.getDesigns();
  const decor = allDecor();

  paintCanvas(frame);
  paintLayers(frame, crew, designs, decor);
  paintCaption(frame, designs);
  paintBreadcrumb();
  paintMinimap();
  paintPalette();
}

// ── the framed floor (VS-Z-06..09) ──

function paintCanvas() {
  _canvas.style.background = floorBackground(_focus.roomType);
  _canvas.style.cursor = _armed ? 'crosshair' : 'default';
}

/** Per-material floor fill (VS-Z-06): wood is the mock's warm plank; the rest a flat material hue. */
function floorBackground(roomType) {
  const mat = roomMaterial(roomType);
  if (mat.material === 'wood') {
    return 'repeating-linear-gradient(90deg,#bd9066 0 54px,#b0865a 54px 58px)';
  }
  return 'linear-gradient(0deg,' + mat.floor + ',' + mat.floor + ')';
}

// ── the SVG layer stack (VS-Z-13): grid → glow → decor → furniture → pawns → ghosts ──

function paintLayers(frame, crew, designs, decor) {
  const rw = _focus.rw, rh = _focus.rh;
  const logicalW = rw * U, logicalH = rh * U;
  _layers.setAttribute('viewBox', '0 0 ' + logicalW + ' ' + logicalH);
  _layers.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let body = gridSvg(rw, rh, logicalW, logicalH);
  body += glowSvg(logicalW, logicalH);
  body += decorSvg(roomDecor(decor, _focus));
  body += furnitureSvg(roomCells(frame, _focus));
  body += pawnSvg(roomCrew(crew, _focus));
  body += ghostSvg(roomDesigns(designs, _focus));
  _layers.innerHTML = body;
}

/** The faint 32-unit build grid (VS-Z-10), drawn in logical space so a cell == a tile at any fit. */
function gridSvg(rw, rh, logicalW, logicalH) {
  let lines = '';
  for (let x = U; x < logicalW; x += U) {
    lines += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + logicalH + '" stroke="rgba(255,255,255,.05)" stroke-width="1"/>';
  }
  for (let y = U; y < logicalH; y += U) {
    lines += '<line x1="0" y1="' + y + '" x2="' + logicalW + '" y2="' + y + '" stroke="rgba(255,255,255,.05)" stroke-width="1"/>';
  }
  return '<g class="rz-grid-lines" pointer-events="none">' + lines + '</g>';
}

/** The single ambient warmth glow-pool (VS-Z-11): one radial, behind all item layers. */
function glowSvg(logicalW, logicalH) {
  const cx = logicalW / 2, cy = logicalH / 2;
  return '<defs><radialGradient id="rz-glow-grad" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0" stop-color="rgba(242,181,99,.16)"/>' +
    '<stop offset="0.7" stop-color="rgba(242,181,99,0)"/></radialGradient></defs>' +
    '<ellipse class="rz-glow" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' +
    (logicalW * 0.5).toFixed(1) + '" ry="' + (logicalH * 0.55).toFixed(1) +
    '" fill="url(#rz-glow-grad)" pointer-events="none"/>';
}

function localXY(tx, ty) {
  return [(tx - _focus.rx) * U, (ty - _focus.ry) * U];
}

/** Cosmetic decor pieces (VS-Z-34), under the furniture layer. */
function decorSvg(list) {
  const out = [];
  for (const d of list) {
    const [lx, ly] = localXY(d.x, d.y);
    const cx = lx + U / 2, cy = ly + U / 2;
    const g = buildItem(d.itemId, { w: ITEM_SIDE, h: ITEM_SIDE, idPrefix: 'rz-dc-' + d.x + '-' + d.y });
    out.push('<g transform="translate(' + (cx - ITEM_SIDE / 2).toFixed(1) + ' ' + (cy - ITEM_SIDE / 2).toFixed(1) + ')">' + g + '</g>');
  }
  return out.length ? '<g class="rz-decor" pointer-events="none">' + out.join('') + '</g>' : '';
}

/** The sim's own furniture cells → warm SVG items (VS-Z-19); unmapped glyph → the dashed chip. */
function furnitureSvg(cells) {
  const out = [];
  for (const c of cells) {
    const [lx, ly] = localXY(c.tx, c.ty);
    const cx = lx + U / 2, cy = ly + U / 2;
    if (c.itemId) {
      const g = buildItem(c.itemId, { w: ITEM_SIDE, h: ITEM_SIDE, idPrefix: 'rz-f-' + c.tx + '-' + c.ty });
      out.push('<g transform="translate(' + (cx - ITEM_SIDE / 2).toFixed(1) + ' ' + (cy - ITEM_SIDE / 2).toFixed(1) + ')">' + g + '</g>');
    } else {
      // VS-Z-25 unknown chip — legible "something here we don't skin yet", never faked.
      out.push('<g transform="translate(' + lx + ' ' + ly + ')">' +
        '<rect x="1" y="1" width="' + (U - 2) + '" height="' + (U - 2) + '" rx="2" fill="none" ' +
        'stroke="#57503f" stroke-width="1.5" stroke-dasharray="3 2"/>' +
        '<text x="' + (U / 2) + '" y="' + (U / 2) + '" font-size="9" fill="#57503f" text-anchor="middle" ' +
        'dominant-baseline="central" font-family="\'Space Mono\', ui-monospace, monospace">' +
        esc(String.fromCharCode(c.code)) + '</text></g>');
    }
  }
  return out.length ? '<g class="rz-furniture" pointer-events="none">' + out.join('') + '</g>' : '';
}

/** Occupant pawns (VS-Z-27..29): front-facing, feet on the tile, above furniture. */
function pawnSvg(list) {
  const out = [];
  const S = PAWN_H / 24;
  for (const c of list) {
    const [lx, ly] = localXY(c.x, c.y);
    const fx = lx + U / 2, fy = ly + U; // feet on the tile bottom-centre
    const body = pawnSprite({ cid: c.cid, role: c.role }, { idPrefix: 'rz-pw-' + esc(c.cid), className: 'pawn' });
    out.push('<g class="rz-pawn" transform="translate(' + (fx - 8 * S).toFixed(1) + ' ' +
      (fy - 23 * S).toFixed(1) + ') scale(' + S.toFixed(3) + ')">' + body + '</g>');
  }
  return out.length ? '<g class="rz-pawns" pointer-events="none">' + out.join('') + '</g>' : '';
}

/** Authoritative build ghosts (VS-Z-30..32) with the supply-ledger look. */
function ghostSvg(list) {
  const out = [];
  for (const g of list) {
    const [lx, ly] = localXY(g.x, g.y);
    const abbr = g.kind === 1 ? GHOST_ABBR.door : GHOST_ABBR.wall;
    const starved = g.required > 0 && g.delivered <= 0;
    const ready = g.required > 0 && g.delivered >= g.required;
    let stroke = '#f2b563', dash = ' stroke-dasharray="3 2"', fill = 'rgba(232,147,74,.22)', op = '1';
    if (starved) { stroke = '#c25a3f'; fill = 'rgba(194,90,63,.08)'; op = '.45'; }
    else if (ready) { stroke = '#5aa77f'; dash = ''; fill = 'rgba(90,167,127,.14)'; }
    let cell = '<g class="rz-ghost" transform="translate(' + lx + ' ' + ly + ')">' +
      '<rect x="1" y="1" width="' + (U - 2) + '" height="' + (U - 2) + '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"' + dash + '/>' +
      '<text x="' + (U / 2) + '" y="' + (U / 2) + '" font-size="9" fill="#f2b563" opacity="' + op + '" text-anchor="middle" ' +
      'dominant-baseline="central" font-family="\'Space Mono\', ui-monospace, monospace">' + abbr + '</text>';
    if (g.required > 0) {
      const cc = starved ? '#e07a5f' : ready ? '#5aa77f' : '#8c8377';
      cell += '<text x="' + (U - 3) + '" y="' + (U - 4) + '" font-size="7" fill="' + cc + '" text-anchor="end" ' +
        'font-family="\'Space Mono\', ui-monospace, monospace">' + g.delivered + '/' + g.required + '</text>';
    }
    out.push(cell + '</g>');
  }
  return out.length ? '<g class="rz-ghosts" pointer-events="none">' + out.join('') + '</g>' : '';
}

// ── chrome ──

function paintCaption(frame, designs) {
  const nDesigns = roomDesigns(designs, _focus).length;
  const nDevices = roomCells(frame, _focus).filter((c) => c.itemId).length;
  const n = nDesigns + nDevices;
  $('rz-caption').innerHTML = esc(_focus.displayName) + ' · BUILD DETAIL · <span class="rz-placed">' + n + ' PLACED</span>';
}

function paintBreadcrumb() {
  $('rz-breadcrumb').innerHTML =
    '<span class="rz-crumb-link" data-rz="home">‹ PERILUNE</span>' +
    '<span class="rz-crumb-sep">▸</span>' +
    '<span class="rz-crumb-link" data-rz="deck">DECK ' + (_focus.deck | 0) + '</span>' +
    '<span class="rz-crumb-sep">▸</span>' +
    '<span class="rz-crumb-leaf">' + esc(_focus.displayName) + '</span>';
}

function paintMinimap() {
  const slots = deckSlots(currentDeckView(), _focus.deck);
  $('rz-minimap').innerHTML =
    '<div class="rz-mini-head">' +
      '<span class="rz-mini-ship">SHIP · DECK ' + (_focus.deck | 0) + '</span>' +
      '<span class="rz-mini-room">' + esc(_focus.displayName) + '</span>' +
    '</div>' + deckMinimap(slots, _focus.slotIndex);
}

function paintPalette() {
  let btns = '<span class="rz-place-label">BUILD ▸ ' + esc(_focus.displayName) + '</span>';
  for (const tool of ROOM_TOOLS) {
    const on = _armed === tool ? ' on' : '';
    const demo = tool === 'demolish' ? ' demo' : '';
    btns += '<button class="rz-tool' + demo + on + '" data-rztool="' + tool + '">' + esc(TOOL_LABEL[tool]) + '</button>';
  }
  $('rz-palette').innerHTML = btns;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function arm(tool) {
  _armed = nextRoomTool(_armed, { t: 'toggle', tool });
  paintPalette();
  paintCanvas();
}

function onHudClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#rz-canvas')) return; // the canvas has its own handler
  const tool = t.closest('[data-rztool]');
  if (tool) { arm(tool.getAttribute('data-rztool')); return; }
  const crumb = t.closest('[data-rz]');
  if (crumb) { exitRoom(); return; } // ‹ PERILUNE / DECK n both pop to the Overview (IX-Z-32/33)
  const slot = t.closest('.rz-mini-slot');
  if (slot) { onMinimapSlot(slot); return; }
}

/** Lateral / cross-deck room swap from the minimap (IX-Z-34/35). */
function onMinimapSlot(slotEl) {
  const anchor = slotEl.getAttribute('data-anchor');
  if (!anchor) return; // an empty hall slot is not a room
  const target = roomTileRect(currentDeckView(), anchor);
  if (!target) return;
  if (target.slotIndex === _focus.slotIndex && target.deck === _focus.deck) return; // current → no-op
  if (target.deck !== _focus.deck) _send(Cmd.deck(target.deck - _focus.deck)); // cross-deck (IX-Z-35)
  _focus = target;
  _armed = null;
  repaint();
}

function onCanvasClick(e) {
  const rect = _layers.getBoundingClientRect();
  const tile = tileFromCanvasXY(e.clientX, e.clientY, rect, _focus);
  if (!tile) return; // letterbox margin / outside the room (IX-Z-11)

  if (_armed == null) {
    // Pawn click = select, only when no tool is armed (IX-Z-30). Resolve crew from the tile.
    const roster = Hud.getRoster();
    const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
    const hit = roomCrew(crew, _focus).find((c) => (c.x | 0) === tile.x && (c.y | 0) === tile.y);
    if (hit) Hud.selectCrewByCid(hit.cid);
    return;
  }

  const pc = paletteCommand(_armed);
  const deck = _focus.deck;
  if (pc.cls === 'structural') {
    _send(Cmd.build(pc.kind, tile.x, tile.y)); // IX-Z-20 — the shipped build path
    pulse(tile, false);
  } else if (pc.cls === 'functional') {
    // IX-Z-21/53 — Cmd.place lands with the sim build pass; call it DEFENSIVELY.
    if (typeof Cmd.place === 'function') { _send(Cmd.place(pc.deviceKind, tile.x, tile.y, deck)); pulse(tile, false); }
    else { toast(TOOL_LABEL[_armed] + ' — PLACEMENT LANDS WITH THE SIM BUILD PASS'); pulse(tile, false); }
  } else if (pc.cls === 'cosmetic') {
    _decor = addDecor(_decor, deck, tile.x, tile.y, pc.itemId); // IX-Z-23 view-only, local
    pulse(tile, false);
    repaint();
  } else if (pc.cls === 'demolish') {
    doDemolish(tile, deck);
  }
}

function doDemolish(tile, deck) {
  const frame = Hud.getFrame();
  const designs = Hud.getDesigns();
  const dt = demolishTarget(tile.x, tile.y, designs && designs.cells, allDecor(), frame);
  switch (dt.kind) {
    case 'pending': _send(Cmd.build('cancel', tile.x, tile.y)); pulse(tile, true); break; // IX-Z-24
    case 'decor': _decor = removeDecor(_decor, deck, tile.x, tile.y); pulse(tile, true); repaint(); break;
    case 'device':
      if (typeof Cmd.remove === 'function') { _send(Cmd.remove(tile.x, tile.y, deck)); pulse(tile, true); }
      else { toast('REMOVE — LANDS WITH THE SIM BUILD PASS'); pulse(tile, true); }
      break;
    case 'built-wall':
      toast('CANNOT DEMOLISH BUILT STRUCTURE — CANCEL ONLY REVOKES QUEUED ORDERS');
      break;
    default: break; // empty → dropped no-op (IX-Z-24)
  }
}

/** Hover reticle while a tool is armed (IX-Z-13): the host reticle doubles as the preview. */
function onCanvasHover(e) {
  if (_armed == null) return;
  const rect = _layers.getBoundingClientRect();
  const tile = tileFromCanvasXY(e.clientX, e.clientY, rect, _focus);
  if (tile) _send(Cmd.cursor(tile.x, tile.y));
}

/** The one transient (IX-Z-27): a ≤150ms fading tile outline at the clicked tile. */
function pulse(tile, isDemolish) {
  const rect = _layers.getBoundingClientRect();
  if (!rect.width) return;
  const fit = roomFit(_focus, rect.width, rect.height);
  const side = U * fit.s;
  const left = fit.offX + (tile.x - _focus.rx) * U * fit.s;
  const top = fit.offY + (tile.y - _focus.ry) * U * fit.s;
  const d = document.createElement('div');
  d.className = 'rz-pulse-tile' + (isDemolish ? ' red' : '');
  d.style.left = left.toFixed(1) + 'px';
  d.style.top = top.toFixed(1) + 'px';
  d.style.width = d.style.height = side.toFixed(1) + 'px';
  _pulseLayer.appendChild(d);
  setTimeout(() => d.remove(), 160);
}

function onKey(e) {
  if (!_open) return;
  const k = e.key;
  if (isTextEntryTarget(e.target) && k !== 'Escape') return; // never arm while typing (IX-Z-17)
  if (k === 'Escape') {
    const rung = escStackRung({ armed: _armed != null, dialogueOpen: false, roomOpen: true });
    if (rung === 'disarm') arm(_armed);       // toggle the armed tool off
    else if (rung === 'exit') exitRoom();
    e.stopPropagation(); e.preventDefault();
  } else if (k === 'b' || k === 'B') {         // IX-Z-17: B toggles WALL
    arm('wall'); e.stopPropagation(); e.preventDefault();
  } else if (k === 'x' || k === 'X') {         // IX-Z-17: X toggles DEMOLISH
    arm('demolish'); e.stopPropagation(); e.preventDefault();
  }
}

// ── transient toast ──

function toast(msg) {
  if (!_toast) return;
  _toast.textContent = msg;
  _toast.hidden = false;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toast.hidden = true; }, 2600);
}

const $ = (id) => document.getElementById(id);
