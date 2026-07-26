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
import { decodeDecks, decodeRooms, decodeDecor, decodeMaterials, decodeZones } from '../wire/messages.js';
import { roomZoneTiles, zoneLegendRows, acceptsLabel } from './zone-model.js';
import { ACCEPT_ALL, defaultStockFilter } from './stock-filter-model.js';
import { zoneLayerSvg, zoneKeyHtml } from './zone-overlay.js';
import { decksView } from './decks-model.js';
import { buildItem } from '../items/index.js';
import { pawnSprite } from '../render/pawn-svg.js';
import { isTextEntryTarget } from '../input/controls.js';
import { roomMaterial } from '../theme/warm-tokens.js';
import { deckMinimap } from './deck-minimap.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, GHOST_ABBR, paletteCommand, isSweepTool, roomDragMode,
  nextRoomTool, roomTileRect,
  deckSlots, roomFit, tileFromCanvasXY, roomCells, roomCrew, roomDesigns, roomDecor, roomMaterialTiles,
  roomMarkTiles, markLayerSvg, demolishTarget, addDecor, removeDecor, escStackRung,
} from './room-model.js';
import { buildDragTiles, dragCaption } from './build-drag-model.js';
import { taskTag } from './console-model.js';
import { makeNudge } from './paused-nudge.js';
import {
  materialsForTool, materialItemId, activeMaterial, setMaterial, toolHasMaterial, defaultMaterials,
} from './build-material-model.js';

/* eslint-disable no-multi-spaces */

const ITEM_SIDE = U * 1.6;      // furniture box (logical) — reads a touch larger than its tile
const MAT_SIDE = U * 1.2;       // material swatch box (logical) — fills the tile edge-to-edge
const PAWN_H = U * 2.0;         // pawn height (logical); viewBox is 16×24
const HINT = 'PICK A TOOL · WALL/FLOOR: CHOOSE A MATERIAL, DRAG TO SWEEP A RUN · CLICK TO PLACE · ' +
  'DIG [G] / STOCKPILE [Z] / STRIP [V]: DRAG A REGION TO ORDER THE CREW · DEMOLISH REMOVES A GHOST';

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
let _zoneKey = null;      // .rz-zonekey (WP-3: what the zone marks MEAN, in words)
let _zoneKeySig = '';     // last-rendered key HTML — re-set only on change (the minimap pattern)
let _toast = null;
let _toastTimer = 0;
let _raf = 0;
let _nudge = null;        // the paused-ship nudge controller (paused-nudge.js), bound to #rz-nudge
let _wasPaused = false;   // previous run state — the edge that dismisses the nudge on resume

let _open = false;
let _focus = null;        // roomTileRect result {anchor, deck, slotIndex, roomType, displayName, rx,ry,rw,rh}
let _armed = null;        // the ONE Level-2 input slot (15 tools + null)
let _decor = [];          // session-local cosmetic decor (never hashed, never wired)
let _drag = null;         // active drag-build session {start:{x,y}, end:{x,y}, tool, mode} or null
let _materials = defaultMaterials(); // per-tool active material byte (wall/floor); default {wall:0,floor:0}
let _zoneTiles = [];      // WP-3: this room's zoned tiles, derived once per repaint (floor layer + key)
// The STOCKPILE accept-mask, read at COMMIT time (one read per sweep, not one per tile).
//
// A GETTER, injected, exactly as `client/src/input/controls.js:118-122` takes it and for the same
// stated reason: reading module state would make the lowering impure and untestable. It arrived here
// with the verb — WP-5 wired it into `initOverview`, and when `stockpile` came down to this palette
// the mask had to come with it, because a zone command that does not assert its filter leaves the
// tile wearing whatever filter it wore before. `main.js` wires it to `Hud.getStockFilter()`, the one
// slot beside the one armed tool, so while the console still exists both surfaces paint with ONE
// mask rather than two that drift. Default is the shared `defaultStockFilter()` (ACCEPT-ALL), never
// a literal — see stock-filter-model.js.
//
// WP-6 OWNS THE CHIPS, AND ITS TARGET MOVED WITH THIS PACKAGE: the ACCEPTS row it was to add to the
// Overview's ORDERS bar belongs on THIS palette now. That is still a one-line change here, because
// this getter is the only reader.
let _getStockFilter = () => defaultStockFilter();

// ── keyed in-place reconciliation state (ROOM-ZOOM stability fix) ─────────────────────────────
// The chrome (palette buttons, breadcrumb links, minimap, caption) used to rebuild wholesale
// (`innerHTML =`) on EVERY coalesced wire repaint (~5–10×/s). That tore down the button under the
// pointer (so the armed/hover state was lost and a placement flickered) and, worse, tore down the
// breadcrumb ‹ back link mid-click, so the click to leave the room was swallowed and the user was
// stuck. Now the interactive chrome is built ONCE (buildChrome) and the paint helpers MUTATE nodes
// in place; the palette's `.on` toggles, the caption/breadcrumb text is guard-written, and the
// minimap SVG is re-set only when its signature changes. Mirrors overview-view.js's keyed pattern.
// The SVG canvas layer (paintLayers) is still rebuilt as one string — it holds no interactive focus
// (its clicks resolve synchronously against geometry, not against a DOM node).
const _el = {};           // cached chrome node references (built once)
let _miniSig = '';        // last-rendered minimap innerHTML — re-set only on change

/** Guarded text write — no DOM mutation when the value is unchanged (idle repaints stay inert). */
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }
/** Guarded class toggle (no attribute churn when already in the wanted state). */
function setCls(node, cls, on) { if (node && node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on); }

/** Mount the Room Zoom surface. Call once from main.js. Returns the { enter, exit } control API. */
export function initRoomZoom(opts) {
  _send = (opts && opts.send) || (() => {});
  _onExit = (opts && opts.onExit) || (() => {});
  if (opts && typeof opts.getStockFilter === 'function') _getStockFilter = opts.getStockFilter;
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
      // WP-3 — THE ZONE KEY. Hidden until the room actually has a zoned tile, so it costs an empty
      // ship nothing. It exists because the marks alone are unreadable: the wording used to live only
      // in an SVG <title> inside a `pointer-events="none"` group, i.e. nowhere a player could reach.
      '<div class="rz-zonekey" id="rz-zonekey" hidden></div>' +
      '<div class="rz-pulse" id="rz-pulse"></div>' +
    '</div>' +
    '<div class="hud rz-breadcrumb" id="rz-breadcrumb"></div>' +
    '<div class="hud rz-minimap" id="rz-minimap"></div>' +
    '<div class="rz-palette-wrap">' +
      '<div class="hud rz-matstrip" id="rz-matstrip" hidden></div>' +
      '<div class="hud rz-palette" id="rz-palette"></div>' +
      '<div class="rz-hint">' + HINT + '</div>' +
    '</div>' +
    '<div class="rz-toast" id="rz-toast" hidden></div>' +
    // The paused-ship nudge (B6, ported off the console's `#s-nudge` at WP-8). This surface needs its
    // own: building is ZOOM-ONLY, so "I placed a wall and nothing happened" happens HERE. A BUTTON
    // that resumes on click, for the reason spelled out on the Overview's twin: the tool button the
    // player just clicked holds focus, and `input/controls.js` yields SPACE to it, so "PRESS SPACE"
    // alone is a dead end on the very path that raises this chip.
    '<button type="button" class="rz-nudge" id="rz-nudge" data-rz-nudge hidden ' +
      'title="The ship is on HOLD — click to resume">‖ HOLD — CLICK OR PRESS SPACE TO RUN THE SHIP</button>';
  _canvas = $('rz-canvas');
  _layers = $('rz-layers');
  _pulseLayer = $('rz-pulse');
  _zoneKey = $('rz-zonekey');
  _toast = $('rz-toast');
  _nudge = makeNudge({ el: () => $('rz-nudge') });
  buildChrome();
  // Structural tools (WALL/FLOOR/DOOR) and the three ORDER tools (DIG/STOCKPILE/STRIP) use a press-drag-release
  // gesture (RimWorld sweep) — the `isSweepTool` sibling set; a plain click is the degenerate 1-tile
  // drag. Every other tool stays on the click handler.
  _canvas.addEventListener('mousedown', onCanvasDown);
  _canvas.addEventListener('mousemove', onCanvasMove);
  window.addEventListener('mouseup', onCanvasUp); // window: catch a release that ends off-canvas
  _canvas.addEventListener('click', onCanvasClick);
  _root.addEventListener('click', onHudClick);
}

/** Build the interactive chrome's DOM ONCE and cache node references. From here on the paint helpers
 *  mutate these nodes in place (guarded text / class toggles); the FIXED palette + breadcrumb nodes
 *  are never torn down, so a hovered/armed tool and the ‹ back link survive every repaint + click. */
function buildChrome() {
  // caption — "NAME · BUILD DETAIL · N PLACED"; only the name + count change.
  const cap = $('rz-caption');
  cap.innerHTML = '<span class="rz-cap-name"></span> · BUILD DETAIL · <span class="rz-placed"></span>';
  _el.capName = cap.querySelector('.rz-cap-name');
  _el.capPlaced = cap.querySelector('.rz-placed');

  // breadcrumb — FIXED links (home / deck / leaf); only the deck number + leaf name change. The
  // `data-rz` targets are stable nodes, so the ‹ click always lands (the "can't go back" fix).
  const bc = $('rz-breadcrumb');
  bc.innerHTML =
    '<span class="rz-crumb-link" data-rz="home">‹ PERILUNE</span>' +
    '<span class="rz-crumb-sep">▸</span>' +
    '<span class="rz-crumb-link" data-rz="deck"></span>' +
    '<span class="rz-crumb-sep">▸</span>' +
    '<span class="rz-crumb-leaf"></span>';
  _el.crumbDeck = bc.querySelector('[data-rz="deck"]');
  _el.crumbLeaf = bc.querySelector('.rz-crumb-leaf');

  // palette — a FIXED label + one FIXED button per ROOM_TOOLS entry (membership never changes, so the
  // set is built once from the table rather than counted here); repaint only toggles
  // the `.on` armed class, so the button under the cursor is never rebuilt.
  const pal = $('rz-palette');
  let btns = '<span class="rz-place-label"></span>';
  for (const tool of ROOM_TOOLS) {
    const demo = tool === 'demolish' ? ' demo' : '';
    btns += '<button class="rz-tool' + demo + '" data-rztool="' + tool + '">' + esc(TOOL_LABEL[tool]) + '</button>';
  }
  pal.innerHTML = btns;
  _el.placeLabel = pal.querySelector('.rz-place-label');
  _el.toolBtns = Array.from(pal.querySelectorAll('.rz-tool'));
  _el.matStrip = $('rz-matstrip'); // material swatch row — populated on arm(wall|floor)
  _matSig = '';
  _miniSig = ''; // force the first minimap paint to render
}

// The material strip's last-rendered signature (tool + active byte) — re-set only on change.
let _matSig = '';

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
  _drag = null;   // a sweep in progress is abandoned on exit (guards onCanvasUp against a null _focus)
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

/** Whether the sim is on HOLD right now, from the shared status cache (the only source of truth). */
function isPaused() {
  const s = Hud.getStatus();
  return !!(s && s.paused);
}

/** A player intent the paused sim will not act on: surface the nudge (B6). Deliberately NOT called
 *  for cosmetic decor — that is a view-only layer which really does apply while the ship is stopped,
 *  so nudging there would be the same dishonesty in the opposite direction. */
function nudgeOnIntent() {
  if (_nudge) _nudge.trigger(isPaused());
}

/** Hand SPACE back to the game after a POINTER activation of `btn`. Chrome focuses the button you
 *  click and `input/controls.js` yields SPACE to a focused button's native activation — so a player
 *  who clicks WALL, reads "PRESS SPACE" and presses it just re-clicks WALL. Pointer only:
 *  `e.detail === 0` is a keyboard activation, whose focus must survive. */
function releaseSpace(btn, e) {
  if (!btn || typeof btn.blur !== 'function') return;
  if (e && e.detail === 0) return;
  btn.blur();
}

function repaint() {
  if (!_open || !_root || !_focus) return;
  const nowPaused = isPaused();
  if (_wasPaused && !nowPaused && _nudge) _nudge.unpause(); // resumed → the nudge has done its job
  _wasPaused = nowPaused;
  // Re-resolve geometry from the live decks channel (rect may move; room may vanish).
  const f = roomTileRect(currentDeckView(), _focus.anchor, _focus.slotIndex);
  if (!f) { toast('ROOM NO LONGER EXISTS'); exitRoom(); return; }
  _focus = f;

  const frame = Hud.getFrame();
  const roster = Hud.getRoster();
  const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const designs = Hud.getDesigns();
  const decor = allDecor();
  // WP-3: derived ONCE per repaint and shared by the floor layer and the key beside it, so the marks
  // on the floor and the words explaining them can never disagree about what is in the room.
  _zoneTiles = roomZoneTiles(decodeZones(Hud.getZones()), _focus);

  paintCanvas(frame);
  paintLayers(frame, crew, designs, decor);
  paintZoneKey();
  paintCaption(frame, designs);
  paintBreadcrumb();
  paintMinimap();
  paintPalette();
  paintMatStrip();
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
  body += materialLayerSvg(roomMaterialTiles(frame, _focus, decodeMaterials(Hud.getMaterials())));
  // Zones sit ABOVE the material layer. The first draft put them under it "so a stored crate still
  // reads as sitting ON the zone" — which was wrong twice over: the Room Zoom draws no loose item
  // stacks at all (roomCells is furniture + devices), and materialLayerSvg paints an OPAQUE item at
  // U * 1.2 — LARGER than the tile — for every floor whose material byte is non-zero. So the moment a
  // player builds a floor with a chosen material, that skin would completely occlude the zone tint
  // underneath it. Authored floors are material 0 and are skipped, which is the only reason the
  // original order looked correct in a screenshot.
  body += zoneLayerSvg(_zoneTiles, _focus);
  body += decorSvg(roomDecor(decor, _focus));
  body += furnitureSvg(roomCells(frame, _focus));
  // WP-2 — debris + dig/strip marks, read off the frame's `cell[1]`. ABOVE the material layer, which
  // paints an opaque U*1.2 swatch over any built wall (so a strip mark under it would be invisible),
  // and above the zone layer, whose tiles this one deliberately skips (room-model.js markLayerSvg).
  //
  // MOVED ABOVE `furnitureSvg` (and `decorSvg`) when the device-strip emitter landed, and the move is
  // load-bearing, not tidying: a condemned DESK now carries fg 26, and drawn underneath its own
  // furniture sprite the amber ✕ sits behind an opaque item — the player would have condemned it and
  // still seen nothing, which is the very bug being fixed. THE REORDER IS PROVABLY INERT FOR EVERY
  // PRE-EXISTING MARK: debris (fg 4) and dig (fg 15) only ever ride glyph code 37 (`'%'`), which is
  // in `NON_FURNITURE`, so `roomCells` never emits a furniture item on a marked tile and the two
  // layers were disjoint; stockpile is skipped by `markLayerSvg` outright. `room-model.test.js` pins
  // that disjointness on the real capture rather than leaving it as an argument.
  //
  // STILL BELOW `pawnSvg`, deliberately: a crew member must never be hidden by a mark. (The converse
  // — a mark hidden UNDER a crew member — is not a layer problem and cannot be fixed here: pass 5 of
  // `GlyphMapper` overwrites the fg byte, so the mark never reaches the client at all. That one needs
  // the `strips`/`designations` channel, HANDOVER §4g.)
  body += markLayerSvg(roomMarkTiles(frame, _focus), _focus);
  body += pawnSvg(roomCrew(crew, _focus));
  body += ghostSvg(roomDesigns(designs, _focus));
  body += previewSvg();
  _layers.innerHTML = body;
}

/** The live drag-build preview (VS-Z spirit of the ghost, but pre-commit): the tiles the current
 *  sweep WOULD designate, each skinned with the chosen material at low opacity + an amber dashed
 *  ring, plus a run caption near the drag end. Recomputed each repaint from the pure drag model. */
function previewSvg() {
  if (!_drag) return '';
  const res = buildDragTiles(_drag.start, _drag.end, _drag.mode, roomBounds());
  if (!res.tiles.length) return '';
  const tool = _drag.tool;
  const itemId = materialItemId(tool, activeMaterial(_materials, tool)); // '' for door (no material)
  const out = [];
  for (const t of res.tiles) {
    const [lx, ly] = localXY(t.x, t.y);
    if (itemId) {
      const g = buildItem(itemId, { w: MAT_SIDE, h: MAT_SIDE, idPrefix: 'rz-pv-' + t.x + '-' + t.y });
      out.push('<g opacity="0.6" transform="translate(' + (lx + U / 2 - MAT_SIDE / 2).toFixed(1) +
        ' ' + (ly + U / 2 - MAT_SIDE / 2).toFixed(1) + ')">' + g + '</g>');
    }
    out.push('<rect x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' + (U - 1) + '" height="' +
      (U - 1) + '" rx="2" fill="' + (itemId ? 'none' : 'rgba(232,147,74,.20)') +
      '" stroke="#f2b563" stroke-width="1.5" stroke-dasharray="3 2"/>');
  }
  const [ex, ey] = localXY(_drag.end.x, _drag.end.y);
  out.push('<text x="' + (ex + U / 2).toFixed(1) + '" y="' + (ey - 5).toFixed(1) +
    '" font-size="9" text-anchor="middle" dominant-baseline="middle" ' +
    'font-family="\'Space Mono\', ui-monospace, monospace" stroke="rgba(10,13,20,.9)" stroke-width="2.5" ' +
    'paint-order="stroke" fill="#f2b563">' + esc(dragCaption(res)) + '</text>');
  return '<g class="rz-preview" pointer-events="none">' + out.join('') + '</g>';
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

/** Built walls + non-default floors → their item-set material skins (C4). A wall '#' inside the room
 *  is a player-built partition — rendered with its wall material (default steel when the sparse
 *  `materials` channel has no entry); a floor tile is skinned only when it carries a chosen material.
 *  Drawn under decor/furniture so items sit on top. */
function materialLayerSvg(tiles) {
  const floors = [], walls = [];
  for (const t of tiles) {
    const id = materialItemId(t.kind, t.mat);
    if (!id) continue;
    const [lx, ly] = localXY(t.tx, t.ty);
    const g = buildItem(id, { w: MAT_SIDE, h: MAT_SIDE, idPrefix: 'rz-mt-' + t.tx + '-' + t.ty });
    const wrap = '<g transform="translate(' + (lx + U / 2 - MAT_SIDE / 2).toFixed(1) + ' ' +
      (ly + U / 2 - MAT_SIDE / 2).toFixed(1) + ')">' + g + '</g>';
    (t.kind === 'wall' ? walls : floors).push(wrap);
  }
  return (floors.length ? '<g class="rz-floor-mat" pointer-events="none">' + floors.join('') + '</g>' : '') +
    (walls.length ? '<g class="rz-walls" pointer-events="none">' + walls.join('') + '</g>' : '');
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

/**
 * Occupant pawns (VS-Z-27..29): front-facing, feet on the tile, above furniture — each carrying the
 * WORK marker (IX-103, ported off the console at WP-8) when it holds a real job.
 *
 * This is the surface where a player watches individual people work, so the console's honesty rule
 * belongs here too: a tag ONLY for a crew member doing a job at a place, nothing for idle, walking or
 * en-route crew (`taskTag` returns null for all three). Unlike the Overview's pawns these carry NO
 * name — the room view is already scoped to a handful of people and clicking one names it in the
 * readout, so adding a second line of text to a 32-unit tile would cost more than it tells. A room
 * tile is wide enough for a 3–5 character tag, so no de-clutter sweep is needed here; two crew
 * standing on the SAME tile do overlap, exactly as their sprites already do.
 *
 * EXPORTED, and `focus` is injectable, purely so the honesty rule is testable. While this was a
 * private function the mutation that matters most — `taskTag(c.task) || 'IDLE'`, which tags idle crew
 * and destroys the rule on this surface — passed the whole node suite, because the only instrument
 * pointed at it was a source scan for the token `taskTag`. `focus` defaults to the live `_focus`, so
 * every in-app call site is unchanged; a test passes `{rx,ry}` and gets the same string.
 *
 * @param {Array<{cid:*, role:*, x:number, y:number, task:string}>} list
 * @param {{rx:number, ry:number}} [focus] the room's tile origin (defaults to the open room)
 */
export function pawnSvg(list, focus) {
  const out = [];
  const S = PAWN_H / 24;
  const org = focus || _focus;
  for (const c of list) {
    const [lx, ly] = [(c.x - org.rx) * U, (c.y - org.ry) * U];
    const fx = lx + U / 2, fy = ly + U; // feet on the tile bottom-centre
    const body = pawnSprite({ cid: c.cid, role: c.role }, { idPrefix: 'rz-pw-' + esc(c.cid), className: 'pawn' });
    out.push('<g class="rz-pawn" transform="translate(' + (fx - 8 * S).toFixed(1) + ' ' +
      (fy - 23 * S).toFixed(1) + ') scale(' + S.toFixed(3) + ')">' + body + '</g>');
    const tag = taskTag(c.task);
    if (tag) {
      const w = Math.max(16, tag.length * 5.6 + 8);
      const ty = fy - PAWN_H - 3;                     // just above the head, never over the face
      out.push('<g class="rz-worktag">' +
        '<rect x="' + (fx - w / 2).toFixed(1) + '" y="' + (ty - 9).toFixed(1) + '" width="' + w.toFixed(1) +
          '" height="11" rx="2" fill="rgba(12,10,8,.86)" stroke="rgba(232,147,74,.5)" stroke-width="0.75"/>' +
        '<text x="' + fx.toFixed(1) + '" y="' + (ty - 3.5).toFixed(1) + '" font-size="8" letter-spacing=".6" ' +
          'fill="#f2b563" text-anchor="middle" dominant-baseline="central" ' +
          'font-family="\'Space Mono\', ui-monospace, monospace">' + esc(tag) + '</text></g>');
    }
  }
  return out.length ? '<g class="rz-pawns" pointer-events="none">' + out.join('') + '</g>' : '';
}

/** Authoritative build ghosts (VS-Z-30..32) with the supply-ledger look. */
function ghostSvg(list) {
  const out = [];
  for (const g of list) {
    const [lx, ly] = localXY(g.x, g.y);
    const abbr = g.kind === 1 ? GHOST_ABBR.door : g.kind === 2 ? GHOST_ABBR.floor : GHOST_ABBR.wall;
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
  setText(_el.capName, _focus.displayName);      // textContent → intrinsically escaped
  setText(_el.capPlaced, (nDesigns + nDevices) + ' PLACED');
}

/** WP-3 — paint the zone key from the PURE row list, hiding the box when the room has no zones.
 *  Guarded by a signature like the minimap: an idle repaint (5–10×/s) touches no DOM, so a player
 *  reading the key is not fighting a node that is being torn down under them. */
function paintZoneKey() {
  if (!_zoneKey) return;
  const html = zoneKeyHtml(zoneLegendRows(_zoneTiles));
  if (html !== _zoneKeySig) { _zoneKeySig = html; _zoneKey.innerHTML = html; }
  _zoneKey.hidden = !html;
}

function paintBreadcrumb() {
  setText(_el.crumbDeck, 'DECK ' + (_focus.deck | 0));
  setText(_el.crumbLeaf, _focus.displayName);
}

// The minimap's interactive slots come from the PURE deckMinimap SVG string (deck-minimap.js). It
// changes only on a room/deck swap (a "set change"), so we compare its full HTML and re-set only then
// — idle repaints (and hovering a slot / holding a palette tool) leave every slot node untouched.
function paintMinimap() {
  const slots = deckSlots(currentDeckView(), _focus.deck);
  const html =
    '<div class="rz-mini-head">' +
      '<span class="rz-mini-ship">SHIP · DECK ' + (_focus.deck | 0) + '</span>' +
      '<span class="rz-mini-room">' + esc(_focus.displayName) + '</span>' +
    '</div>' + deckMinimap(slots, _focus.slotIndex);
  if (html !== _miniSig) { $('rz-minimap').innerHTML = html; _miniSig = html; }
}

function paintPalette() {
  setText(_el.placeLabel, 'BUILD ▸ ' + _focus.displayName);
  for (const b of _el.toolBtns) setCls(b, 'on', _armed === b.dataset.rztool);
}

/** The material swatch row: shown only when WALL or FLOOR is armed, listing that surface's 6
 *  materials as clickable item-set swatches with the active one lit. Re-rendered only when the
 *  (tool, active-byte) signature changes, so idle repaints and hovers leave the chips untouched. */
function paintMatStrip() {
  if (!_el.matStrip) return;
  const tool = _armed;
  if (!toolHasMaterial(tool)) {
    if (_matSig !== 'off') { _el.matStrip.hidden = true; _el.matStrip.innerHTML = ''; _matSig = 'off'; }
    return;
  }
  const active = activeMaterial(_materials, tool);
  const sig = tool + ':' + active;
  if (sig === _matSig) return;
  let html = '<span class="rz-mat-label">' + esc(TOOL_LABEL[tool]) + ' ▸</span>';
  for (const m of materialsForTool(tool)) {
    const swatch = buildItem(m.id, { w: 26, h: 26, idPrefix: 'rz-mc-' + tool + '-' + m.mat });
    html += '<button class="rz-mat-chip' + (m.mat === active ? ' on' : '') + '" data-rzmat="' + m.mat +
      '" title="' + esc(m.label) + '">' +
      '<svg class="rz-mat-sw" viewBox="0 0 26 26" width="26" height="26" xmlns="http://www.w3.org/2000/svg">' +
      swatch + '</svg><span class="rz-mat-name">' + esc(m.label) + '</span></button>';
  }
  _el.matStrip.innerHTML = html;
  _el.matStrip.hidden = false;
  _matSig = sig;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function arm(tool) {
  _armed = nextRoomTool(_armed, { t: 'toggle', tool });
  _drag = null; // arming/disarming cancels any in-progress sweep
  paintPalette();
  paintMatStrip();
  paintCanvas();
  if (_armed != null) nudgeOnIntent(); // arming (not disarming) is the intent worth nudging about
}

function onHudClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#rz-canvas')) return; // the canvas has its own handler
  // The nudge IS its own fix: it complains the ship is stopped, so clicking it starts it.
  if (t.closest('[data-rz-nudge]')) { _send(Cmd.pause()); return; }
  const tool = t.closest('[data-rztool]');
  if (tool) { arm(tool.getAttribute('data-rztool')); releaseSpace(tool, e); return; }
  const mat = t.closest('[data-rzmat]');
  if (mat) { onMatChip(mat); return; }
  const crumb = t.closest('[data-rz]');
  if (crumb) { exitRoom(); return; } // ‹ PERILUNE / DECK n both pop to the Overview (IX-Z-32/33)
  const slot = t.closest('.rz-mini-slot');
  if (slot) { onMinimapSlot(slot); return; }
}

/** Choose a wall/floor material from the strip; re-skins the strip + any live preview. */
function onMatChip(el) {
  const tool = _armed;
  if (!toolHasMaterial(tool)) return;
  const next = setMaterial(_materials, tool, parseInt(el.getAttribute('data-rzmat'), 10) | 0);
  if (next !== _materials) { _materials = next; paintMatStrip(); scheduleRepaint(); }
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
  _drag = null; // a room swap abandons any in-progress sweep
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

  // Every SWEPT tool (WALL/FLOOR/DOOR + DIG/STOCKPILE/STRIP) is committed by the press-drag-release gesture
  // (onCanvasDown/Move/Up), so the browser's trailing click after a release must not commit again.
  //
  // THIS IS THE SECOND GUARD, NOT THE FIRST, and saying so is worth three lines because a test
  // comment once claimed otherwise and an independent reviewer proved it wrong: the `pc.cls` chain
  // below handles only `functional`/`cosmetic`/`demolish`, so a swept class already falls off the end
  // of it and sends nothing. Removing this line changes no behaviour today. It is kept — and kept
  // ahead of the chain — because the day someone adds an `order` or `structural` branch below for a
  // single-click affordance, this is the line that stops every sweep from committing twice.
  if (isSweepTool(_armed)) return;

  const pc = paletteCommand(_armed);
  const deck = _focus.deck;
  if (pc.cls === 'functional') {
    // IX-Z-21/53 — Cmd.place lands with the sim build pass; call it DEFENSIVELY.
    if (typeof Cmd.place === 'function') { _send(Cmd.place(pc.deviceKind, tile.x, tile.y, deck)); pulse(tile, false); nudgeOnIntent(); }
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
    case 'pending': _send(Cmd.build('cancel', tile.x, tile.y)); pulse(tile, true); nudgeOnIntent(); break; // IX-Z-24
    case 'decor': _decor = removeDecor(_decor, deck, tile.x, tile.y); pulse(tile, true); repaint(); break;
    case 'device':
      if (typeof Cmd.remove === 'function') { _send(Cmd.remove(tile.x, tile.y, deck)); pulse(tile, true); nudgeOnIntent(); }
      else { toast('REMOVE — LANDS WITH THE SIM BUILD PASS'); pulse(tile, true); }
      break;
    case 'built-wall':
      // WP-4 made this dead end reachable: DEMOLISH still only revokes a QUEUED order, but STRIP now
      // exists on this palette and is the verb that takes a built wall apart, so the message names it
      // instead of leaving the player at a wall with no next move.
      toast('CANNOT DEMOLISH BUILT STRUCTURE — CANCEL ONLY REVOKES QUEUED ORDERS · USE ⚒ STRIP [V]');
      break;
    default: break; // empty → dropped no-op (IX-Z-24)
  }
}

/** The room-tile rect for clipping a drag (never designate outside the focused room). */
function roomBounds() {
  return { x: _focus.rx | 0, y: _focus.ry | 0, w: _focus.rw | 0, h: _focus.rh | 0 };
}

/** Resolve a mouse event to an absolute sim tile (or null on the letterbox / outside the room). */
function tileAt(e) {
  return tileFromCanvasXY(e.clientX, e.clientY, _layers.getBoundingClientRect(), _focus);
}

/** Begin a sweep. WALL/FLOOR/DOOR + DIG/STOCKPILE/STRIP; a plain click is the degenerate 1-tile drag. */
function onCanvasDown(e) {
  if (e.button !== 0 || !isSweepTool(_armed)) return; // non-swept tool → the click handler
  const tile = tileAt(e);
  if (!tile) return;
  _drag = { start: tile, end: tile, tool: _armed, mode: roomDragMode(_armed) };
  scheduleRepaint();
  e.preventDefault(); // suppress text/drag selection during the sweep
}

/** Extend the sweep (drag) or emit the hover reticle (no drag) while a tool is armed (IX-Z-13). */
function onCanvasMove(e) {
  if (_drag) {
    const tile = tileAt(e);
    if (tile && (tile.x !== _drag.end.x || tile.y !== _drag.end.y)) {
      _drag.end = tile;
      _send(Cmd.cursor(tile.x, tile.y));
      scheduleRepaint();
    }
    return;
  }
  if (_armed == null) return;
  const tile = tileAt(e);
  if (tile) _send(Cmd.cursor(tile.x, tile.y));
}

/**
 * Lower an ORDER-class tool + tile to its wire payloads — a LIST, 1 or 2 long. THE ONE PLACE this
 * surface turns a designation into a message, and deliberately NOT `Cmd.build`: an order goes to the
 * designation boards (`DigJobSource` / `StockZoneSystem` / `DeconstructSystem`), whereas `Cmd.build`
 * goes to `BuildSystem`, which knows nothing about designations and would silently swallow it.
 *
 * It must stay byte-identical to what the console's `paletteOrders`
 * (`client/src/input/controls.js:69`) already emits for the same verb — independent lowering paths
 * exist for these verbs, and the day they disagree is the day one surface starts sending a message
 * the host understands differently. `client/test/room-model.test.js` pins that by IMPORTING
 * `paletteOrders` and comparing, so a drift on EITHER side reddens; a copied literal here could not
 * do that. It deliberately does NOT call `paletteOrders`: if it did, a drift there would move both
 * sides together and the comparison would stay green through it.
 *
 * STOCKPILE EMITS TWO, ALWAYS IN THIS ORDER: zone the tile, THEN assert its complete accept-set.
 * Both land in the same command drain before any system runs, so the intermediate state is
 * unobservable — but `DesignateStockpileCommand` OFF *clears* the filter, so the reverse order would
 * break the day an OFF path is added. A missing/garbage mask defaults to ACCEPT-ALL and NEVER to
 * silence: sending nothing would let a tile keep an earlier restrictive filter that the player has
 * just repainted as accept-all. Every repaint re-asserts the whole truth
 * (`client/src/input/controls.js:74-90`).
 *
 * ⚠️ IT RETURNS A LIST AND THE CALLER SPREADS IT — the single most likely regression here is a
 * caller that goes back to `_send(orderPayloads(...))` and sends an ARRAY down the wire, or one that
 * sends only `[0]` and silently drops every filter. A sweep must emit a correct PAIR PER TILE.
 *
 * `on` is always true: the Room Zoom paints intent and never erases it. UN-designating is a KNOWN GAP
 * — the wire carries it (`Cmd.dig(x, y, false)`) and no surface in the client sends it, the console
 * included, so this ports the capability the game actually has rather than inventing a verb here.
 *
 * @param {string} verb  the PALETTE_CMD wire verb name ('dig' | 'stockpile' | 'strip')
 * @param {number} x @param {number} y
 * @param {number} [mask] the stockpile accept-mask; ignored by every other verb
 * @returns {object[]} 1..2 Cmd payloads, in send order
 */
function orderPayloads(verb, x, y, mask) {
  if (verb === 'strip') return [Cmd.strip(x, y, true)];
  if (verb === 'stockpile') {
    const m = Number.isFinite(mask) ? mask : ACCEPT_ALL;
    return [Cmd.stockpile(x, y, true), Cmd.filter(x, y, m)];
  }
  return [Cmd.dig(x, y, true)];
}

/** Commit the sweep on release: one payload per previewed tile — `Cmd.build` (carrying the active
 *  material) for a structural tool, `Cmd.dig`/`Cmd.strip` (and `Cmd.stockpile` + `Cmd.filter`, a
 *  pair) for an ORDER tool.
 *  Bound on window so a release that ends off-canvas still commits (IX-Z spirit). */
function onCanvasUp(e) {
  if (!_drag || e.button !== 0) return;
  const drag = _drag; _drag = null;
  if (!_open || !_focus) return; // the room vanished / was left mid-sweep — abandon (no null _focus deref)
  const res = buildDragTiles(drag.start, drag.end, drag.mode, roomBounds());
  const pc = paletteCommand(drag.tool);
  const material = activeMaterial(_materials, drag.tool);
  // ONE mask read for the whole sweep, and only for an ORDER — a getter called per tile could
  // observe a mask change mid-commit and paint one rectangle with two different filters, and a WALL
  // sweep has no business reading a stockpile filter at all.
  const mask = pc.cls === 'order' ? _getStockFilter() : 0;
  // sim decides legality per tile, for both classes — an illegal order is a silent no-op, never a ghost
  if (pc.cls === 'order') {
    for (const t of res.tiles) for (const o of orderPayloads(pc.verb, t.x, t.y, mask)) _send(o);
  } else for (const t of res.tiles) _send(Cmd.build(pc.kind, t.x, t.y, material));
  if (res.tiles.length) {
    pulse(res.tiles[res.tiles.length - 1], false);
    // STOCKPILE's caption names the mask it just painted, because nothing else on this surface can:
    // the ACCEPTS chips are still on the console (WP-6 brings them here), and a zone that silently
    // refuses every item looks exactly like one nothing has been hauled to yet. `acceptsLabel` is
    // the SHARED spelling the zone key uses, so the toast and the key cannot word it differently.
    const accepts = pc.verb === 'stockpile' ? ' · ' + acceptsLabel(mask) : '';
    toast(TOOL_LABEL[drag.tool] + ' ▸ ' + dragCaption(res) + accepts);
    nudgeOnIntent(); // designations placed on a stopped ship — nobody will come and build them
  }
  scheduleRepaint();
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
  } else if (k === 'g' || k === 'G') {         // WP-4: G toggles DIG — the console's own binding
    arm('dig'); e.stopPropagation(); e.preventDefault();
  } else if (k === 'z' || k === 'Z') {         // Z toggles STOCKPILE — the console's own binding
    arm('stockpile'); e.stopPropagation(); e.preventDefault();
  } else if (k === 'v' || k === 'V') {         // WP-4: V toggles STRIP (salVage; see controls.js:264)
    arm('strip'); e.stopPropagation(); e.preventDefault();
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
