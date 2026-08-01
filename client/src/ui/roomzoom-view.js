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
import {
  decodeDecks, decodeRooms, decodeDecor, decodeMaterials, decodeZones, decodeMarks, decodeItems,
  decodeDevices, decodeBlocked,
  // M1-K — THE SELECTION. It is not a piece of client state anywhere: the host owns it
  // (`GameSession._selected`), re-derives `frame.sel` every render, and this pure reader intersects
  // that tile with `frame.crew` to name the cid. The Room Zoom read NEITHER before this package, so
  // a crew member selected on the Overview simply vanished on room entry — indistinguishable, to a
  // player, from being deselected. Imported from `wire/messages.js` and NOT reached through
  // `hud.js`: the frame already arrives via `Hud.getFrame()`, which is on `SHIP_STATE_REACH`, so
  // this adds no symbol to that pinned list.
  selectedCrewCid,
} from '../wire/messages.js';
import { roomZoneTiles, zoneLegendRows, acceptsLabel, zoneMaskMismatch } from './zone-model.js';
import { ACCEPT_ALL, defaultStockFilter, toggleStockKind } from './stock-filter-model.js';
import { zoneLayerSvg, zoneKeyHtml } from './zone-overlay.js';
import { blockedLayerSvg, blockedKeyHtml } from './blocked-overlay.js';
import { acceptsRowHtml } from './accepts-row.js';
import { decksView } from './decks-model.js';
import { buildItem, isResourceItem } from '../items/index.js';
// THE WEAR JOIN, and the ONLY door from a surface to the wrecked twins (client/src/items/wear.js
// carries the threshold and its justification; `client/test/wrecked.test.js` pins that this file
// never imports `wrecked.js` itself).
import { buildTileItem } from '../items/wear.js';
// `pawnSprite` draws the occupant on the floor; `pawnChip` is the crew-dock bust — the SAME piece
// the Overview's CREW WATCH rows use, so one person wears one face on both docks.
import { pawnSprite, pawnChip } from '../render/pawn-svg.js';
import { isTextEntryTarget } from '../input/controls.js';
import { roomMaterial } from '../theme/warm-tokens.js';
import { deckMinimap } from './deck-minimap.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, GHOST_ABBR, paletteCommand, isSweepTool, roomDragMode,
  nextRoomTool, roomTileRect,
  deckSlots, roomFit, tileFromCanvasXY, roomCells, roomCrew, roomDesigns, roomDecor, roomMaterialTiles,
  roomMarkTiles, markLayerSvg, roomItemTiles, itemStackSvg, itemStackTileKeys, roomDeviceConditions,
  roomBlockedTiles,
  demolishTarget, addDecor, removeDecor, escStackRung,
  eraseTarget, tileOrders, roomMarkNameAt, roomTileZoned,
  shipCrewRows,
} from './room-model.js';
import { buildDragTiles, dragCaption } from './build-drag-model.js';
// ⭐ M2-10 — the PURE half of the right-click PRIORITISE menu: may it open on this tile, who would the
// order be given to, and what does the one row say. See its header for the fog rule and the one-crew
// interim; this file only opens and closes a box.
import { prioritiseOffer } from './prioritise-model.js';
// `surnameOf` + `watchTask` are the Overview CREW WATCH's own two derivations, imported rather than
// re-stated so the dock in a room and the dock on the ship cannot word one roster row two ways.
import { taskTag, surnameOf, watchTask } from './console-model.js';
import { makeNudge } from './paused-nudge.js';
import {
  materialsForTool, materialItemId, activeMaterial, setMaterial, toolHasMaterial, defaultMaterials,
} from './build-material-model.js';

/* eslint-disable no-multi-spaces */

const CTX_GAP = 6;              // clearance the right-click menu keeps from body-level chrome (openCtx)
const ITEM_SIDE = U * 1.6;      // furniture box (logical) — reads a touch larger than its tile
const MAT_SIDE = U * 1.2;       // material swatch box (logical) — fills the tile edge-to-edge
const PAWN_H = U * 2.0;         // pawn height (logical); viewBox is 16×24
const HINT = 'PICK A TOOL · WALL/FLOOR: CHOOSE A MATERIAL, DRAG TO SWEEP A RUN · CLICK TO PLACE · ' +
  'DIG [G] / STOCKPILE [Z] / STRIP [V]: DRAG A REGION TO ORDER THE CREW · ' +
  'ERASE [C]: DRAG OVER PAINTED ORDERS TO TAKE THEM BACK · ' +
  'MOVE [M]: PICK A CREW MEMBER, THEN CLICK WHERE THEY SHOULD GO · DEMOLISH REMOVES A GHOST';

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
let _armed = null;        // the ONE Level-2 input slot (17 tools + null)
let _decor = [];          // session-local cosmetic decor (never hashed, never wired)
let _drag = null;         // active drag-build session {start:{x,y}, end:{x,y}, tool, mode} or null
let _materials = defaultMaterials(); // per-tool active material byte (wall/floor); default {wall:0,floor:0}
let _zoneTiles = [];      // WP-3: this room's zoned tiles, derived once per repaint (floor layer + key)
let _markTiles = [];      // this room's debris/dig/strip marks, from the `marks` channel (NOT the frame)
let _itemTiles = [];      // this room's ground stacks, from the `items` channel (NOT the frame's glyph)
let _deviceCond = new Map(); // this room's per-device wear, from the `devices` channel — SEE deviceConditionAt
let _blockedTiles = [];   // this room's REFUSED orders + why, from the `blocked` channel
// ⭐ M2-10 — the open right-click menu's target, or null when no menu is up: `{tile, deck, cid, name}`.
// It is captured AT OPEN TIME and never re-derived on the item click, deliberately: the frame keeps
// arriving while the box is on screen, and an order must go to the machine the player right-clicked,
// not to whatever the channel says about that tile a second later.
let _ctx = null;
// THE STOCKPILE ACCEPT-MASK — this surface's own state now (WP-6), read at COMMIT time.
//
// ⚠️ QUOTED AND NEGATED, because the sentence that stood here was true when it was written and is
// false now: *"A GETTER, injected … `main.js` wires it to `Hud.getStockFilter()`, the one slot beside
// the one armed tool, so while the console still exists both surfaces paint with ONE mask rather than
// two that drift."* The injection is GONE and the shared slot with it. What that wiring bought was a
// mask no player could change: `hud.js:312` — the `onclick` on the console shell's `#stockfilter`
// chips — was the ONLY writer of `_stockFilter` anywhere in the client, and the console is deprecated,
// unreachable in normal play and scheduled for deletion. So on the standard surface the "shared" mask
// was permanently `defaultStockFilter()`, every zone accepted everything, and the per-tile filtering
// the sim has supported since E0-4 could not be reached at all. Sharing an inert value is not sharing.
//
// THE COST, STATED: the console's chips and this palette's chips are now TWO independent masks. That
// is deliberate and it is the honest arrangement — each surface's chips describe what THAT surface
// paints with, and a chip row that silently drove another surface's brush would be worse. They cannot
// be reached in one session anyway (`body.roomzoom-open` hides the console entirely; §4f records the
// only window in which the console is live as a boot artifact), and WP-9 deletes the console half.
// Merging them the other way is not available: writing `hud.js`'s `_stockFilter` needs an exported
// setter, and `SHIP_STATE_REACH` (surface-boundary.test.js) pins the exact set of `hud.js` symbols a
// modern surface may reach — adding one to drive a dying surface's state is the wrong direction.
//
// Default is the shared `defaultStockFilter()` (ACCEPT-ALL), never a literal — see
// stock-filter-model.js. A player who never touches the chips gets exactly E0-3 behaviour.
let _stockFilter = defaultStockFilter();
let _accSig = '';         // last-rendered ACCEPTS row signature (mask + mismatch count), or 'off'

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
// M1-K — the crew dock's rows, keyed by cid and MUTATED IN PLACE. The row nodes are rebuilt only
// when the cid SET changes (a thaw, a death), never on the ~2/s roster rebroadcast: a row rebuilt
// between mousedown and mouseup produces no `click` at all in Chrome, which is §4h exactly, and this
// dock's whole job is to be clicked.
const _crewRows = new Map(); // cid key → {el, nameEl, taskEl, whereEl}
let _crewSig = '';           // the cid-set signature the current row nodes were built for

/** Guarded text write — no DOM mutation when the value is unchanged (idle repaints stay inert). */
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }
/** Guarded class toggle (no attribute churn when already in the wanted state). */
function setCls(node, cls, on) { if (node && node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on); }
/** Guarded attribute write — same contract as `setText`, so an idle repaint mutates nothing. */
function setAttr(node, name, v) { if (node && node.getAttribute(name) !== v) node.setAttribute(name, v); }

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
      // WP-3 — THE ZONE KEY. Hidden until the room actually has a zoned tile, so it costs an empty
      // ship nothing. It exists because the marks alone are unreadable: the wording used to live only
      // in an SVG <title> inside a `pointer-events="none"` group, i.e. nowhere a player could reach.
      '<div class="rz-zonekey" id="rz-zonekey" hidden></div>' +
      '<div class="rz-pulse" id="rz-pulse"></div>' +
    '</div>' +
    '<div class="hud rz-breadcrumb" id="rz-breadcrumb"></div>' +
    '<div class="hud rz-minimap" id="rz-minimap"></div>' +
    // M1-K — THE CREW DOCK. Left edge, under the breadcrumb, in the same blur-glass `.hud` island
    // the Overview's CREW WATCH uses and in the same corner of the screen, because it is THE SAME
    // LIST the player was reading one gesture ago: continuity is the point. It floats OVER the
    // canvas rather than shrinking it — the canvas letterboxes its room (`preserveAspectRatio`
    // meet), so the left margin is usually empty, and shrinking `.rz-canvas` would silently rescale
    // every room in the game to make room for a dock. THE COST IS STATED: on a room wide enough to
    // fill the canvas the dock covers the leftmost ~2 tiles. That is the same trade the Overview
    // already makes with the identical island on the identical edge.
    '<div class="hud rz-crewdock" id="rz-crewdock"></div>' +
    '<div class="rz-palette-wrap">' +
      '<div class="hud rz-matstrip" id="rz-matstrip" hidden></div>' +
      // WP-6 — THE ACCEPTS ROW, shown only while STOCKPILE is armed.
      //
      // ⚠️ THE DESIGN CALL, ARGUED, because always-visible was the live alternative. It is a SIBLING
      // OF `#rz-matstrip` in every sense: same wrapper, same place in the stack, same reveal rule,
      // and the same job — the options belonging to the ARMED tool. That idiom already exists on this
      // exact surface for WALL/FLOOR materials, so reveal-on-arm costs the player no new concept,
      // and the console it replaces reveals its own row the same way (`hud.js` `reflectArmed`
      // toggling `#stockfilter-row`). Three further reasons, in order of weight:
      //   1. The two rows are MUTUALLY EXCLUSIVE — `toolHasMaterial` is wall/floor, this is stockpile
      //      — so the reveal costs ZERO net height. An always-visible ACCEPTS row would be a third
      //      permanent band under a palette that already clips below ~1140 px (a known-open defect,
      //      not this package's to fix, but emphatically this package's not to worsen).
      //   2. A permanently-visible seven-chip filter next to seventeen tools reads as seventeen more
      //      tools. Arming STOCKPILE is what makes "which kinds?" a question the player is asking.
      //   3. The cost of hiding it — discoverability — is paid off elsewhere and cheaply: the hint
      //      line names STOCKPILE [Z], and the sweep toast already ends with the accept-set in the
      //      zone key's own words, so a player who never opens the row still reads back what they
      //      painted. A hidden control whose EFFECT is visible is not a hidden decision.
      '<div class="hud rz-accepts" id="rz-accepts" hidden></div>' +
      '<div class="hud rz-palette" id="rz-palette"></div>' +
      '<div class="rz-hint">' + HINT + '</div>' +
    '</div>' +
    // ⭐ M2-10 — THE RIGHT-CLICK MENU. A sibling of the toast and the nudge: a small `.hud` island
    // positioned at the pointer, `hidden` until a right-click lands on a machine. It is OUTSIDE
    // `.rz-canvas` on purpose — `onHudClick` returns early for anything inside `#rz-canvas` (the
    // canvas owns its own click handler), so a menu parented there could never have its row clicked
    // through the surface's delegated chain.
    '<div class="hud rz-ctx" id="rz-ctx" hidden></div>' +
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
  // ⭐ M2-10 — RIGHT-CLICK, AND THE PHASE IS LOAD-BEARING (BUG-B's exact shape). Registered on the
  // element in the BUBBLE phase — no third argument — like the four canvas gestures above it, and
  // NOT `{capture: true}`. `overview-model.test.js` measured what a capture registration does to a
  // gesture on this codebase: it runs ahead of the handlers below it, kills the interaction, and
  // leaves the whole suite green. `client/test/prioritise-menu.test.js` records the phase argument at
  // registration and asserts it BY NAME, because a text scan for the third argument is defeated by a
  // comment, by whitespace, and decisively by the `{capture:true}` options spelling.
  _canvas.addEventListener('contextmenu', onCanvasContext);
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
  //
  // `type="button"` + `aria-pressed`, matching the ACCEPTS chips standing three pixels above them
  // (WP-6 / §4j) rather than leaving two different button vocabularies on one palette. Until now the
  // armed tool was announced by the `.on` class ALONE, i.e. by colour: a screen reader could read all
  // fifteen labels (as it then was; seventeen today) and not one word about which of them is
  // holding the cursor. That is the same
  // complaint the clipping bug produced from a different cause — the control is present, and what it
  // is doing is not on the surface — so it is fixed here rather than filed.
  const pal = $('rz-palette');
  let btns = '<span class="rz-place-label"></span>';
  for (const tool of ROOM_TOOLS) {
    const demo = tool === 'demolish' ? ' demo' : '';
    btns += '<button type="button" class="rz-tool' + demo + '" data-rztool="' + tool +
      '" aria-pressed="false">' + esc(TOOL_LABEL[tool]) + '</button>';
  }
  pal.innerHTML = btns;
  _el.placeLabel = pal.querySelector('.rz-place-label');
  _el.toolBtns = Array.from(pal.querySelectorAll('.rz-tool'));
  _el.matStrip = $('rz-matstrip'); // material swatch row — populated on arm(wall|floor)
  _el.accepts = $('rz-accepts');   // ACCEPTS chip row — populated on arm(stockpile)

  // crew dock — a FIXED header plus a list container whose rows are keyed by cid (see `_crewRows`).
  // Built with real nodes rather than one `innerHTML` string so the row under the pointer survives
  // every repaint; the header is a guarded text write like the caption's.
  const dock = $('rz-crewdock');
  if (dock) {
    // BUILT WITH `createElement`, NOT `innerHTML`, and that is not a style preference: every other
    // chrome node in this file is looked up with `querySelector` after an `innerHTML` write, which is
    // exactly why `_el.toolBtns` is an empty array in three of this repo's node harnesses (they model
    // `innerHTML` as a string and implement no selector matching). A dock whose rows cannot be
    // reached in node is a dock whose click cannot be DRIVEN in a test, and the click is the feature.
    dock.innerHTML = '';
    _el.crewHdr = dock.appendChild(mkEl('div', 'rz-crewhdr'));
    _el.crewList = dock.appendChild(mkEl('div', 'rz-crewlist'));
  }
  // ⭐ M2-10 — the right-click menu's ONE row, built once with real nodes (the crew dock's rule: a row
  // that only exists as an `innerHTML` string cannot be clicked in a node harness, and the click IS
  // the feature). `setAttribute`, not `dataset.rzctx =`, for the same reason `data-rzcrew` uses it:
  // `onHudClick` reads the attribute, and in the node harnesses `dataset` is a plain object with no
  // reflection. The LABEL is written per-open — it names the machine under the cursor.
  const ctx = $('rz-ctx');
  if (ctx) {
    ctx.innerHTML = '';
    const item = mkEl('button', 'rz-ctx-item');
    item.setAttribute('type', 'button');
    item.setAttribute('data-rzctx', 'prioritise');
    ctx.appendChild(item);
    _el.ctx = ctx;
    _el.ctxItem = item;
  }

  _matSig = '';
  _accSig = '';
  _crewSig = '';
  _crewRows.clear();
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
  closeCtx();     // …and so is an open right-click menu: its target tile belongs to a room we are leaving
  _focus = null;
  document.body.classList.remove('roomzoom-open');
  _onExit();
}

/**
 * THE WEAR SEAM. The `devices` channel's row for a room-local tile —
 * `{tx, ty, kind, cond, oper, open}` — or `null` when no tile-resident device stands there. `cond` is
 * `Device.Condition` quantised to a byte, `0 = wrecked … 255 = pristine`; `oper` is the sim's own
 * `IsOperational`, which the client cannot derive (the failure threshold is per-kind and lives in
 * `machines.def`); `open` is `Device.IsOpen`, appended with the OPERATE verb — a verb M3-15 (OD-N)
 * DELETED from this surface, so `open` now has no reader in the client at all. It stays on the
 * channel because the channel is the sim's honest report of a device, not a list of what one UI
 * happens to draw.
 *
 * ⚠️ THE SENTENCE THAT STOOD HERE IS RETRACTED AND QUOTED, because its BOUNDARY survives and only its
 * WORDING was too broad: *"IT HAS NO CALLER IN THIS PACKAGE, AND THAT IS THE POINT. The wrecked-art
 * join — 'select the damaged piece when `cond` is low' — belongs to the parallel lane that owns
 * `client/src/items/`, and doing it here would be a merge collision with that lane."* That is still
 * true of `cond` and `oper`, WHICH NOTHING IN THIS FILE READS.
 *
 * ⚠️ THE PARAGRAPH THAT STOOD HERE IS QUOTED AND SUPERSEDED (W0b, 2026-07-28). It read: *"IT HAS NO
 * CALLER IN THIS PACKAGE, AND THAT IS THE POINT. The wrecked-art join … belongs to the parallel lane
 * that owns `client/src/items/`."* That lane is this one and the join has landed: `furnitureSvg`
 * reads `_deviceCond` directly and hands each tile's `cond` to `buildTileItem`.
 *
 * THIS ACCESSOR IS KEPT ANYWAY. It is the tested seam other code (a tooltip, a future inspector)
 * reads a tile's wear through without importing the channel decode, and
 * `client/test/surface-boundary.test.js` names it. Read from `_deviceCond`, which `repaint()`
 * refreshes once per frame from the live channel.
 *
 * ⚠️ CORRECTED AT THE MERGE (W0b) AND CORRECTED BACK BY M3-15, and the round trip is worth three
 * lines. W0b wrote *"and not because it is used internally — it is not."*; the merge with the OPERATE
 * verb made that FALSE, because `doOperate` called this accessor to answer a click on a bare floor
 * without a round trip. OD-N deleted `doOperate`, so the original sentence is true again — but it is
 * true for a THIRD reason, not the first one. Three lanes described this seam accurately for the tree
 * each could see; the file's truth was never the one any of them computed.
 */
export function deviceConditionAt(tx, ty) {
  return _deviceCond.get((tx | 0) + ',' + (ty | 0)) || null;
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
  // The mark layer, from the `marks` channel rather than the frame's `cell[1]` byte. Derived here
  // beside the zone tiles for the same reason: one decode per repaint, one truth for the layer.
  _markTiles = roomMarkTiles(decodeMarks(Hud.getMarks()), _focus);
  // The ground stacks, from the `items` channel — kind AND count, one row per stack, aggregated per
  // tile here. Derived beside the other two for the same reason: one decode per repaint, one truth.
  _itemTiles = roomItemTiles(decodeItems(Hud.getItems()), _focus);
  // The per-device WEAR STATE, from the `devices` channel — the only place `Device.Condition` reaches
  // this client at all. Derived here beside the other three for the same reason: one decode per
  // repaint, one truth for the room.
  // ⚠️ IT IS DRAWN NOW (W0b). The two ⚠️ notes that stood here — *"DELIBERATELY NOT DRAWN BY THIS
  // PACKAGE"* and *"PAID FOR ON EVERY REPAINT, FOR ZERO CONSUMERS TODAY"* — are both discharged:
  // `furnitureSvg` below takes `_deviceCond` and a machine at or below `wear.wreck_threshold` wears
  // its post-raid twin. The ~2.62 µs per repaint (146 rows, `--ship grid`, median n = 5) is now
  // spent on something the player sees, and the host's ~29.4 µs half is bounded by the dirty-version
  // scheme that shipped with this join (see `GameSession.BuildDevices`).
  _deviceCond = roomDeviceConditions(decodeDevices(Hud.getDevices()), _focus);
  // The REFUSED orders, from the `blocked` channel — which dig/strip/build sites in this room the sim
  // will not staff, and why. Derived here with the other four for the same reason: one decode per
  // repaint, one truth for the room, so the badges on the floor and the words in the key beside them
  // can never disagree about what is stuck.
  _blockedTiles = roomBlockedTiles(decodeBlocked(Hud.getBlocked()), _focus);

  // THE SELECTION, derived ONCE per repaint from the live frame and shared by the pawn layer and the
  // crew dock — for the same reason the four channel decodes above are: the glow on the floor and
  // the lit row in the dock must never be able to disagree about who is selected.
  const selCid = selectedCrewCid(frame);

  paintCanvas(frame);
  paintLayers(frame, crew, designs, decor, selCid);
  paintCrewDock(shipCrewRows(crew, currentDeckView(), _focus, selCid));
  paintZoneKey();
  paintCaption(frame, designs);
  paintBreadcrumb();
  paintMinimap();
  paintPalette();
  paintMatStrip();
  // AFTER `_zoneTiles` is derived, and that ordering is the whole point of calling it from here at
  // all: the row's second line counts the already-zoned tiles in this room whose filter differs from
  // the chips, so it has to be recomputed whenever the `zones` channel moves — a hauler filling the
  // last free tile, or the player painting more of the room, both change it without touching a chip.
  paintAccepts();
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

function paintLayers(frame, crew, designs, decor, selCid) {
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
  // The tiles the item layer draws on. Handed to `furnitureSvg` so the frame-derived rendering of the
  // same pile — the VS-Z-25 unknown chip, and, since the ground-item art landed, the RESOURCE PIECE
  // itself — is not stacked underneath the authoritative one. Real furniture art is never suppressed,
  // so a stack on a device tile keeps the device's sprite and gains its pile above it.
  // `_deviceCond` — the `devices` channel's per-tile wear, derived in `repaint()` — is handed in so
  // a machine at or below the wreck floor wears its post-raid twin. It is a THIRD argument rather
  // than a module-level read so `furnitureSvg` stays a pure function of what it is given.
  body += furnitureSvg(roomCells(frame, _focus), itemStackTileKeys(_itemTiles), _deviceCond);
  // WP-2 — debris + dig/strip marks. ⚠️ The old lead *"read off the frame's `cell[1]`"* is FALSE: the
  // kinds come from the `marks` channel now, decoded in `repaint()` into `_markTiles`. ABOVE the
  // material layer, which paints an opaque U*1.2 swatch over any built wall (so a strip mark under it
  // would be invisible), and above the zone layer, whose tiles this one deliberately skips
  // (room-model.js markLayerSvg).
  //
  // MOVED ABOVE `furnitureSvg` (and `decorSvg`) when the device-strip emitter landed, and the move is
  // load-bearing, not tidying: a condemned DESK carries a strip mark, and drawn underneath its own
  // furniture sprite the amber ✕ sits behind an opaque item — the player would have condemned it and
  // still seen nothing, which is the very bug being fixed. THE REORDER IS PROVABLY INERT FOR EVERY
  // PRE-EXISTING MARK: debris and dig tiles only ever ride glyph code 37 (`'%'`), which is in
  // `NON_FURNITURE`, so `roomCells` never emits a furniture item on a marked tile and the two layers
  // were disjoint; stockpile is skipped by `markLayerSvg` outright. `room-model.test.js` pins that
  // disjointness on the real capture rather than leaving it as an argument.
  //
  // STILL BELOW `pawnSvg`, deliberately: a crew member must never be hidden by a mark.
  // ⚠️ AND THE PARENTHESIS THAT FOLLOWED IS NOW OBSOLETE — quoted, because it named the fix this
  // package is: *"(The converse — a mark hidden UNDER a crew member — is not a layer problem and
  // cannot be fixed here: pass 5 of `GlyphMapper` overwrites the fg byte, so the mark never reaches
  // the client at all. That one needs the `strips`/`designations` channel, HANDOVER §4g.)"* That
  // channel is built, it is called `marks`, and a mark under a crew member now reaches the client and
  // is drawn under the pawn — visible around them, which is what "the pawn is on a condemned tile"
  // should look like.
  body += markLayerSvg(_markTiles, _focus);
  // The ground-item stacks — the warm resource pieces plus their count badges. ABOVE the furniture
  // layer, and that is the whole of loss 3 being fixed: `GlyphMapper` pass 4 paints the device glyph
  // over pass 3's item, so a stack on a machine's tile reached the client nowhere at all — drawing it
  // UNDER the device sprite would reproduce the erasure in the client after removing it from the
  // wire. The badge is bottom-anchored and inset, so the count reads without covering what stands on
  // the tile.
  // STILL BELOW `pawnSvg`, for the same reason the marks are: a crew member is never hidden.
  body += itemStackSvg(_itemTiles, _focus);
  // The REFUSED-ORDER layer: a scrim + a fault badge on every tile the sim will not staff.
  //
  // ABOVE the mark and item layers, and that ordering is load-bearing rather than incidental. The
  // scrim's whole job is to make an ORDER read as inert, and the order it is dimming is drawn by
  // `markLayerSvg` twelve lines up — under the scrim it is dimmed (correct), over it the amber ring
  // would sit at full brightness on a tile that is going nowhere, which is the misreading the layer
  // exists to prevent. It is ADDITIVE, never a replacement: the rubble, the ring and the ✕ all
  // survive, because telling the player their order VANISHED is a worse lie than the silence.
  //
  // STILL BELOW `pawnSvg`, for exactly the reason the marks and the stacks are: a crew member is
  // never hidden by a layer that is explaining the floor.
  //
  // ⚠️ BOTH HALVES OF THAT SANDWICH ARE PINNED NOW, and the upper half was a send-back: moving this
  // line below `pawnSvg` left all 27 node tests green while a near-black scrim washed over every
  // pawn standing on a blocked tile — which they do, constantly, since the grid crew work the hold's
  // dig field. `client/test/blocked-model.test.js` → "the blocked layer is ADDITIVE — over the mark,
  // under the pawns" drives a roster into the room and asserts the index order both ways.
  body += blockedLayerSvg(_blockedTiles, _focus);
  body += pawnSvg(roomCrew(crew, _focus), _focus, selCid);
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
  // ERASE PREVIEWS IN A DIFFERENT COLOUR, and that is not decoration. Every other sweep on this
  // surface ADDS something and the amber preview reads as "this is what you are about to put here";
  // a drag that is about to take four orders OFF the floor, previewed in the identical amber, reads
  // as painting a fifth. Slate — the same cool family the zone tint uses for "already spoken for".
  const isErase = paletteCommand(tool).cls === 'erase';
  const ring = isErase ? '#9fb4cc' : '#f2b563';
  const wash = isErase ? 'rgba(159,180,204,.18)' : 'rgba(232,147,74,.20)';
  const out = [];
  for (const t of res.tiles) {
    const [lx, ly] = localXY(t.x, t.y);
    if (itemId) {
      const g = buildItem(itemId, { w: MAT_SIDE, h: MAT_SIDE, idPrefix: 'rz-pv-' + t.x + '-' + t.y });
      out.push('<g opacity="0.6" transform="translate(' + (lx + U / 2 - MAT_SIDE / 2).toFixed(1) +
        ' ' + (ly + U / 2 - MAT_SIDE / 2).toFixed(1) + ')">' + g + '</g>');
    }
    out.push('<rect x="' + (lx + 0.5) + '" y="' + (ly + 0.5) + '" width="' + (U - 1) + '" height="' +
      (U - 1) + '" rx="2" fill="' + (itemId ? 'none' : wash) +
      '" stroke="' + ring + '" stroke-width="1.5" stroke-dasharray="3 2"/>');
  }
  const [ex, ey] = localXY(_drag.end.x, _drag.end.y);
  out.push('<text x="' + (ex + U / 2).toFixed(1) + '" y="' + (ey - 5).toFixed(1) +
    '" font-size="9" text-anchor="middle" dominant-baseline="middle" ' +
    'font-family="\'Space Mono\', ui-monospace, monospace" stroke="rgba(10,13,20,.9)" stroke-width="2.5" ' +
    'paint-order="stroke" fill="' + ring + '">' + esc(dragCaption(res)) + '</text>');
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

/** The sim's own furniture cells → warm SVG items (VS-Z-19); unmapped glyph → the dashed chip.
 *
 *  `stocked` is the set of `"tx,ty"` keys the `items` layer draws on. On those tiles TWO branches are
 *  skipped, and the second one is new with the ground-item art:
 *    • the unknown-glyph CHIP — its raw letter is the lossy rendering the channel replaces, and
 *      stacking the two would put a `,` and a pile of Regolith on one tile;
 *    • a RESOURCE piece — because `itemForGlyph(',')` now resolves to real art, the frame would draw
 *      the pile a SECOND time from a source that has no count, keeps only the topmost stack and is
 *      erased by any device on the tile. The `items` channel is the authority for what is lying on a
 *      floor; the projection is not.
 *  REAL FURNITURE ART IS NEVER SUPPRESSED: a device on a stocked tile still draws its sprite, because
 *  the pile is about what is LYING there and the sprite about what is INSTALLED there, and both are
 *  true. */
function furnitureSvg(cells, stocked, deviceCond) {
  const out = [];
  const skip = stocked instanceof Set ? stocked : new Set();
  const cond = deviceCond instanceof Map ? deviceCond : new Map();
  for (const c of cells) {
    const [lx, ly] = localXY(c.tx, c.ty);
    const cx = lx + U / 2, cy = ly + U / 2;
    if ((!c.itemId || isResourceItem(c.itemId)) && skip.has(c.tx + ',' + c.ty)) continue;
    if (c.itemId) {
      // THE WEAR JOIN. `row` is the `devices` channel's entry for this exact tile — one device per
      // tile by construction — or `undefined` where nothing tile-resident stands. `buildTileItem`
      // treats "no row" as "not wrecked", so a ground stack, a decor piece and a frame that arrived
      // before the channel did all render exactly as they did before this join existed.
      const row = cond.get(c.tx + ',' + c.ty);
      const g = buildTileItem(c.itemId, { w: ITEM_SIDE, h: ITEM_SIDE, idPrefix: 'rz-f-' + c.tx + '-' + c.ty },
                             row ? row.cond : undefined);
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
 * WORK marker (IX-103, ported off the console at WP-8) when it holds a real job, its SURNAME on a
 * pill at its feet, and — for the selected crew member — the Overview's own selection glow.
 *
 * This is the surface where a player watches individual people work, so the console's honesty rule
 * belongs here too: a tag ONLY for a crew member doing a job at a place, nothing for idle, walking or
 * en-route crew (`taskTag` returns null for all three).
 *
 * ⚠️ THE "NO NAME TAG" RULE (VS-Z-29) IS RETRACTED HERE, AND ITS JUSTIFICATION WAS FALSE THE DAY IT
 * WAS WRITTEN. The sentence that stood in this header was: *"Unlike the Overview's pawns these carry
 * NO name — the room view is already scoped to a handful of people and clicking one names it in the
 * readout, so adding a second line of text to a 32-unit tile would cost more than it tells."* THERE
 * IS NO READOUT ON THIS SURFACE. The readout the spec means (`perilune-roomzoom.interaction-spec.md`
 * IX-Z-30) lives in `.app`/`#panels`, and `client/styles.css` sets `#panels{display:none}` for
 * `body.roomzoom-open` — so the clause that paid for the missing name has never once executed. The
 * owner's report (*"in zoom mode we have no control over the pawn"*) is what that costs in play.
 * `docs/design/perilune-roomzoom.visual-spec.md` VS-Z-29 is amended in the same commit; a code
 * comment quietly disagreeing with a spec is how a surface ends up with two contracts.
 *
 * ⇒ THE RIMWORLD RULE BEING MIRRORED: RimWorld draws a colonist's name on a small label at the
 * pawn's FEET, for every colonist on the map, all the time (it is a settings toggle whose default
 * is on). So the pill is at the feet, on every pawn in the room, not on hover and not on selection
 * only — a name that appears only when you click is no help at all in answering "which of these is
 * she?", which is the question. ⚠️ FLAGGED AS AN INFERENCE: I am confident RimWorld labels colonists
 * by name at their feet and that it is defaulted on; I am NOT confident of the exact default of the
 * three-way "show pawn names" setting across versions, and `docs/design/rimworld-reference.md`
 * should be checked against this paragraph rather than the other way round.
 *
 * SELECTION IS THE OVERVIEW'S VOCABULARY, COPIED NOT INVENTED: the same amber radial-gradient pool
 * under the feet that `overview-scene.js`'s `pawnLayer` draws, at the same `S * 9` radius, plus the
 * same rule that the selected pawn's label reads amber and everyone else's reads dim. RimWorld's own
 * indicator is a set of white corner brackets; that was NOT copied, because the player has just come
 * from the Overview where the glow means "this one", and teaching two indicators for one state on
 * two halves of one surface is worse than diverging from RimWorld's shape.
 *
 * ⛔ KNOWN LIMIT, MEASURED IN A BROWSER AND STATED RATHER THAN BURIED — and the first version of this
 * paragraph got it wrong, which is why it is quoted: *"A room tile is wide enough for a 3–5 character
 * tag, so no de-clutter sweep is needed here … a room holds a handful."* **A pill is WIDER THAN ITS
 * TILE for any surname past ~4 characters** (`len * 5.2 + 8` against `U = 32`), so ADJACENT pawns —
 * not merely pawns sharing a tile — overlap. Photographed on `--ship grid` deck 1: eight crew line up
 * shoulder to shoulder on one dig row and the pills read `VEGA HALLOR( OKONJO NOVAK KAUR`
 * (`docs/design/shots/m1-k-grid-11-grid-second-pawn.png`). "A room holds a handful" is false on the
 * economy baseline.
 *
 * IT IS ACCEPTED, NOT PATCHED, and the argument is about what the label is FOR. On the shipping game
 * (`--ship wreck`) there is exactly ONE crew member, so the crowd case is not the case the owner
 * reported; where a crowd does occur, the CREW DOCK disambiguates by name, task and selection, which
 * a truncated pill would not do better. The two available fixes both cost more than they buy right
 * now: truncating the surname trades a crowd problem for a permanent one, and porting the Overview's
 * `layoutPawnLabels` de-clutter sweep is a real feature (leader lines, row assignment, a crowded
 * state) that belongs in its own package rather than bolted onto a selection fix.
 *
 * EXPORTED, and `focus` is injectable, purely so the honesty rule is testable. While this was a
 * private function the mutation that matters most — `taskTag(c.task) || 'IDLE'`, which tags idle crew
 * and destroys the rule on this surface — passed the whole node suite, because the only instrument
 * pointed at it was a source scan for the token `taskTag`. `focus` defaults to the live `_focus`, so
 * every in-app call site is unchanged; a test passes `{rx,ry}` and gets the same string.
 *
 * @param {Array<{cid:*, role:*, name:*, x:number, y:number, task:string}>} list
 * @param {{rx:number, ry:number}} [focus] the room's tile origin (defaults to the open room)
 * @param {number|null} [selCid] the selected crew id — glow + amber label for exactly this one
 */
export function pawnSvg(list, focus, selCid) {
  const out = [];
  const S = PAWN_H / 24;
  const org = focus || _focus;
  const sel = selCid == null ? null : String(selCid);
  for (const c of list) {
    const [lx, ly] = [(c.x - org.rx) * U, (c.y - org.ry) * U];
    const fx = lx + U / 2, fy = ly + U; // feet on the tile bottom-centre
    const selected = sel !== null && String(c.cid) === sel;
    if (selected) {
      // The Overview's selection pool, formula for formula (`overview-scene.js` pawnLayer): a radial
      // gradient from 65% amber at the centre to nothing at 70% of the radius, centred two units
      // above the feet, radius `S * 9`. UNDER the pawn — it is a pool the person stands in, and
      // drawing it over them would put a wash across the face that identifies them.
      const sgid = 'rz-sel-' + esc(c.cid);
      out.push('<defs><radialGradient id="' + sgid + '" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="rgba(242,181,99,.65)"/>' +
        '<stop offset="0.7" stop-color="rgba(242,181,99,0)"/></radialGradient></defs>' +
        '<ellipse class="rz-sel-pool" cx="' + fx.toFixed(1) + '" cy="' + (fy - 2).toFixed(1) +
        '" rx="' + (S * 9).toFixed(1) + '" ry="' + (S * 9).toFixed(1) + '" fill="url(#' + sgid + ')"/>');
    }
    const body = pawnSprite({ cid: c.cid, role: c.role }, { idPrefix: 'rz-pw-' + esc(c.cid), className: 'pawn' });
    out.push('<g class="rz-pawn" transform="translate(' + (fx - 8 * S).toFixed(1) + ' ' +
      (fy - 23 * S).toFixed(1) + ') scale(' + S.toFixed(3) + ')">' + body + '</g>');
    // THE NAME PILL, at the feet and INSIDE the tile. `fy` is the tile's bottom edge, so the pill
    // spans `fy-8 … fy+1` — over the pawn's shins, one unit past the tile line, never into the row
    // below. Hanging it BELOW the feet (the first draft) reads better on a sparse room and is wrong
    // on a full one: the layer's viewBox ends at the room's last row, so the bottom row's names
    // would be pushed outside it and clipped away exactly where the player needs them most.
    const sur = surnameOf(c.name);
    if (sur) {
      const nw = Math.max(16, sur.length * 5.2 + 8);
      out.push('<g class="rz-nametag' + (selected ? ' sel' : '') + '">' +
        '<rect x="' + (fx - nw / 2).toFixed(1) + '" y="' + (fy - 8).toFixed(1) + '" width="' + nw.toFixed(1) +
          '" height="9" rx="2" fill="rgba(12,10,8,.78)"/>' +
        '<text x="' + fx.toFixed(1) + '" y="' + (fy - 3.5).toFixed(1) + '" font-size="7.5" letter-spacing=".5" ' +
          'fill="' + (selected ? '#f2b563' : 'rgba(220,210,195,.72)') + '" text-anchor="middle" ' +
          'dominant-baseline="central" ' +
          'font-family="\'Space Mono\', ui-monospace, monospace">' + esc(sur) + '</text></g>');
    }
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

/** WP-3 — paint the key box from the PURE row lists, hiding it when the room has nothing to explain.
 *  Guarded by a signature like the minimap: an idle repaint (5–10×/s) touches no DOM, so a player
 *  reading the key is not fighting a node that is being torn down under them.
 *
 *  ⚠️ IT CARRIES TWO LEGENDS NOW — zones first, then the BLOCKED orders — and the header sentence
 *  above was corrected with it: the box is hidden when BOTH halves are empty, not "when the room has
 *  no zones". That difference is the whole feature on most rooms. Nearly no room has a stockpile, so
 *  the old condition would have taken the blocked legend down with it everywhere, and the legend is
 *  the half that actually discharges the invisibility — a `<title>` needs a hover nobody knows to
 *  try, can be suppressed by one attribute three layers up, and does not exist on a touch device
 *  (the finding `zone-overlay.js`'s own header records). One box rather than two because they explain
 *  the same floor and a second floating panel would fight the first for the same corner. */
function paintZoneKey() {
  if (!_zoneKey) return;
  const html = zoneKeyHtml(zoneLegendRows(_zoneTiles)) + blockedKeyHtml(_blockedTiles);
  if (html !== _zoneKeySig) { _zoneKeySig = html; _zoneKey.innerHTML = html; }
  _zoneKey.hidden = !html;
}

/** A detached element with a class — the crew dock builds real nodes rather than an HTML string. */
function mkEl(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/**
 * THE CREW DOCK (M1-K) — one row per soul aboard: bust, surname, live task, and where they are.
 * `rows` is `shipCrewRows(...)`, which decides membership and carries the HERE / SELECTED facts.
 *
 * ⚠️ THE ROW NODES ARE REBUILT ONLY WHEN THE CID SET CHANGES. Everything else — the task line, the
 * WHERE line, the `.sel` class — is a guarded in-place write. That is §4h's lesson, not tidiness: the
 * roster rebroadcasts on every crew tile-step (~2/s at 1×, faster at speed), and a node torn down
 * between mousedown and mouseup fires no `click` in Chrome at all. A dock you have to click twice is
 * indistinguishable from a dock that does not work, and this dock exists because the owner reported
 * having no way to reach a pawn.
 *
 * ⚠️ EVERY ROW IS A `<button type="button">`, including the one for the crew member already selected.
 * `type` because inside a form the default is `submit`; a button rather than a div because the dock
 * must be reachable by Tab and activated by Enter/Space, which is the same argument the palette's
 * tools carry three functions up — and because `aria-pressed` then says WHICH one is selected in
 * words rather than only in the border colour.
 */
function paintCrewDock(rows) {
  if (!_el.crewList || !_el.crewHdr) return;
  const sig = rows.map((r) => String(r.cid)).join(',');
  if (sig !== _crewSig) {
    _crewSig = sig;
    for (const rec of _crewRows.values()) rec.el.remove();
    _crewRows.clear();
    for (const r of rows) {
      const el = mkEl('button', 'rz-crew');
      el.setAttribute('type', 'button');
      // `setAttribute`, not `el.dataset.rzcrew =`. In Chrome the two are equivalent (dataset writes
      // reflect onto the attribute), and the handler below reads the ATTRIBUTE — so writing it
      // directly is the spelling that is true in the node harnesses too, where `dataset` is a plain
      // object with no reflection. A row whose id is invisible to `getAttribute` is a row whose click
      // cannot be driven in a test.
      el.setAttribute('data-rzcrew', String(r.cid));
      // The bust is written as markup because it IS markup (an inline SVG from the shared registry),
      // and it never changes for a given cid — so it is set once here and never touched again.
      const bust = mkEl('span', 'rz-bust');
      bust.innerHTML = '<svg viewBox="0 0 16 20">' + pawnChip({ cid: r.cid, role: r.entry.role }) + '</svg>';
      el.appendChild(bust);
      const col = mkEl('span', 'rz-crewcol');
      const nameEl = col.appendChild(mkEl('span', 'rz-crewname'));
      const taskEl = col.appendChild(mkEl('span', 'rz-crewtask'));
      const whereEl = col.appendChild(mkEl('span', 'rz-crewwhere'));
      el.appendChild(col);
      _crewRows.set(String(r.cid), { el, nameEl, taskEl, whereEl });
      _el.crewList.appendChild(el);
    }
  }
  for (const r of rows) {
    const rec = _crewRows.get(String(r.cid));
    if (!rec) continue;
    setText(rec.nameEl, surnameOf(r.entry.name) || String(r.cid));
    // The SAME derivation the Overview's CREW WATCH runs, imported rather than restated: only real
    // work reads bright, so a dock of dim rows is a TRUE signal that nothing is happening.
    // ⭐ M2-20: and the THIRD state rides the same derivation onto this surface in the same commit.
    // "The two surfaces cannot disagree" was an unpinned claim in the Overview's own comment until
    // this package; a word that reached CREW WATCH and not this dock would make the room the place
    // where the game stops telling you it is waiting on you. `AwaitingOrdersTests` pins both.
    // ⭐ M2-6 fix-back — `t.what`, NOT `t.text`, for the same reason as the Overview's dock and
    // more so: this one is 120 px ≈ 23 characters. See `console-model.js`'s `watchTask`.
    // ⚠️ THIS SURFACE HAS NO SELECTED READOUT, so the ranking clause is not reachable here at all.
    // That is a KNOWN GAP filed as an M4 Persona question, not a silent one — and it is still
    // strictly better than a row that shows the first two letters of the answer.
    const t = watchTask(r.entry);
    setText(rec.taskEl, t.what);
    setCls(rec.taskEl, 'working', t.working);
    setCls(rec.taskEl, 'waiting', t.waiting);
    // WHERE: 'HERE' when they are standing in the room on screen, else the room they are in, else
    // the deck. The deck fallback is not a shrug — a crew member in a hall is genuinely not in any
    // room, and saying 'DECK 1' is the honest answer to "where do I go to find her".
    setText(rec.whereEl, r.here ? 'HERE' : (r.roomName || ('DECK ' + r.deck)).toUpperCase());
    setCls(rec.whereEl, 'here', r.here);
    setCls(rec.el, 'sel', r.selected);
    setAttr(rec.el, 'aria-pressed', r.selected ? 'true' : 'false');
  }
  setText(_el.crewHdr, 'CREW — ' + rows.length + ' ABOARD');
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
  for (const b of _el.toolBtns) {
    const on = _armed === b.dataset.rztool;
    setCls(b, 'on', on);
    // The armed state, said in words as well as in colour. One exclusive slot, so exactly one button
    // may read `true` — which is why this writes 'false' rather than removing the attribute: an
    // absent `aria-pressed` turns a toggle back into a plain button, and sixteen plain buttons
    // beside one pressed one is a different (and wrong) statement about the control set.
    setAttr(b, 'aria-pressed', on ? 'true' : 'false');
  }
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
    // `type="button"` and DELIBERATELY NOT `aria-pressed`. The type is the same argument as the tool
    // buttons' — one palette, one button vocabulary, and inside a form the default is `submit`. The
    // pressed state is a different question and is left open on purpose: `activeMaterial` guarantees
    // exactly ONE swatch is `on`, which is a radio group, not six independent toggles. The right
    // spelling is `role="radio"`/`aria-checked` inside a `radiogroup` with roving tab focus, and
    // that is a keyboard-interaction change (arrow keys move the selection) rather than an attribute
    // — too much to bolt onto a layout fix, and guessing `aria-pressed` here would announce six
    // toggles where the player has one choice.
    html += '<button type="button" class="rz-mat-chip' + (m.mat === active ? ' on' : '') + '" data-rzmat="' + m.mat +
      '" title="' + esc(m.label) + '">' +
      '<svg class="rz-mat-sw" viewBox="0 0 26 26" width="26" height="26" xmlns="http://www.w3.org/2000/svg">' +
      swatch + '</svg><span class="rz-mat-name">' + esc(m.label) + '</span></button>';
  }
  _el.matStrip.innerHTML = html;
  _el.matStrip.hidden = false;
  _matSig = sig;
}

/**
 * The ACCEPTS chip row (WP-6): shown only when STOCKPILE is armed, listing every ItemKind with
 * the accepted ones lit, plus the line saying the chips apply to tiles painted NEXT and how many
 * already-zoned tiles in this room disagree.
 *
 * Re-rendered only when its (mask, mismatch) signature changes, so idle repaints at the wire's 10 Hz
 * never tear down the chip under the pointer. That is not tidiness here, it is the bug §4h was: this
 * surface rebuilt its chrome wholesale on every repaint and the node under the press was detached
 * between mousedown and mouseup, so Chrome fired no `click` at all. A chip you have to click twice is
 * that bug wearing a filter.
 */
function paintAccepts() {
  if (!_el.accepts) return;
  if (_armed !== 'stockpile') {
    if (_accSig !== 'off') { _el.accepts.hidden = true; _el.accepts.innerHTML = ''; _accSig = 'off'; }
    return;
  }
  const mismatch = zoneMaskMismatch(_zoneTiles, _stockFilter);
  const sig = _stockFilter + ':' + mismatch;
  if (sig === _accSig) return;
  _el.accepts.innerHTML = acceptsRowHtml(_stockFilter, mismatch);
  _el.accepts.hidden = false;
  _accSig = sig;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function arm(tool) {
  // ⭐ M3-15 / OD-N — THE `wasOperate` CROSSING IS GONE WITH THE VERB. It existed because the OPERATE
  // ring/plate chips lived in the SVG canvas layer, which this function does not otherwise touch, so
  // arming or disarming that ONE tool had to redraw the floor. No surviving tool paints into the
  // canvas layer on arm, so the crossing has nothing left to detect. Do not "restore" it for a new
  // tool without also restoring a layer for it to reveal.
  _armed = nextRoomTool(_armed, { t: 'toggle', tool });
  _drag = null; // arming/disarming cancels any in-progress sweep
  paintPalette();
  paintMatStrip();
  paintAccepts();
  paintCanvas();
  if (_armed != null) nudgeOnIntent(); // arming (not disarming) is the intent worth nudging about
}

function onHudClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#rz-canvas')) return; // the canvas has its own handler
  // ⭐ M2-10 — the right-click menu's own row first; then ANY other chrome click DISMISSES the menu.
  // A box that outlives the next click is a box the player has to learn to close, and every other
  // transient on this surface (toast, pulse, nudge) already gets out of the way by itself.
  const ctxItem = t.closest('[data-rzctx]');
  if (ctxItem) { doPrioritise(); releaseSpace(ctxItem, e); return; }
  closeCtx();
  // The nudge IS its own fix: it complains the ship is stopped, so clicking it starts it.
  if (t.closest('[data-rz-nudge]')) { _send(Cmd.pause()); return; }
  const tool = t.closest('[data-rztool]');
  if (tool) { arm(tool.getAttribute('data-rztool')); releaseSpace(tool, e); return; }
  const mat = t.closest('[data-rzmat]');
  if (mat) { onMatChip(mat); return; }
  const acc = t.closest('[data-rzaccept]');
  if (acc) { onAcceptChip(acc); releaseSpace(acc, e); return; }
  const row = t.closest('[data-rzcrew]');
  if (row) { onCrewRow(row.getAttribute('data-rzcrew')); releaseSpace(row, e); return; }
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

/**
 * Toggle ONE ItemKind in the accept-mask the next sweep will paint with (WP-6).
 *
 * The mutation goes through `toggleStockKind`, the shared pure reducer, which is TOTAL for a NUMBER:
 * an out-of-range kind returns the mask unchanged rather than wrapping a bit back inside the valid
 * range (JS reduces shift counts modulo 32, so `1 << 32` is 1 — that hole was measured and closed in
 * stock-filter-model.js).
 *
 * ⚠️ IT IS NOT TOTAL FOR `NaN`, AND THAT IS WHY THE PARSE IS A DIGIT TEST RATHER THAN `parseInt`.
 * `parseInt('', 10)` and `parseInt('nonsense', 10)` are both `NaN`, `NaN | 0` is `0`, and `0` is a
 * perfectly valid kind — so a chip whose attribute was missing, blanked or corrupted would silently
 * toggle REGOLITH, the first kind in the enum, every time it was clicked. Measured on the first draft
 * of this function, which used `parseInt`. `-1` is the deliberate out-of-range sentinel, which the
 * reducer then refuses.
 *
 * IT DOES NOT REPAINT THE FLOOR, deliberately: nothing about the zone tiles already on the map has
 * changed, and this row is the one thing on screen that has. What it DOES change is the row's second
 * line — flip a chip and the "N ZONED TILES IN THIS ROOM KEEP A DIFFERENT FILTER" count moves with
 * it, which is the fastest honest answer to "did that do anything to what I already painted?".
 */
function onAcceptChip(el) {
  const raw = el.getAttribute('data-rzaccept');
  const kind = /^\d+$/.test(String(raw)) ? Number(raw) : -1;
  const next = toggleStockKind(_stockFilter, kind);
  if (next === _stockFilter) return;
  _stockFilter = next;
  paintAccepts();
}

/**
 * A CREW DOCK ROW CLICK (M1-K) — select that crew member, and go to where they are.
 *
 * ⭐ THE RIMWORLD RULE BEING MIRRORED is the colonist bar: clicking a colonist selects them AND
 * moves the camera to them, wherever on the map they are. Both halves, in that order:
 *
 *   1. SELECT — `Hud.selectCrewByCid`, the one shared selection flow both modern surfaces already
 *      use (it is on `SHIP_STATE_REACH`; this adds no symbol to that pinned list, and it is NOT a
 *      crew-interaction seam — selecting a pawn is not reaching a person, so §1.5.4's Persona census
 *      is untouched). It already handles the cross-deck case by sending `Cmd.deck` and deferring the
 *      click until that deck's frame arrives, which is why this function never sends a deck command
 *      of its own: two `Cmd.deck` for one click would move the player two decks.
 *   2. GO THERE — if they are standing in a bound room that is not the one on screen, re-focus the
 *      Room Zoom on it, exactly as a minimap slot click does (`onMinimapSlot`), and disarm, because
 *      a tool armed for one room should not stay armed over another.
 *
 * A crew member in a HALL has no room to enter. That is not a dead row: the selection still lands
 * (which is the thing the player wants — they can now give the order), and the toast says where they
 * are rather than leaving the click looking swallowed. Silence there would be `invisible-feedback-
 * is-FUNCTIONAL` in miniature.
 */
function onCrewRow(rawCid) {
  const cid = /^\d+$/.test(String(rawCid)) ? Number(rawCid) : null;
  if (cid == null) return; // a blanked/corrupt attribute must never select crew member 0
  const roster = Hud.getRoster();
  const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const row = shipCrewRows(crew, currentDeckView(), _focus, null).find((r) => Number(r.cid) === cid);
  Hud.selectCrewByCid(cid);
  if (!row) return; // selected anyway — an unknown cid is the roster's problem, not a reason to stop
  const who = surnameOf(row.entry.name) || String(cid);
  if (row.here) return;                       // already on screen: the glow is the whole feedback
  if (!row.anchor) { toast(who + ' IS NOT IN A ROOM — DECK ' + row.deck); return; }
  const target = roomTileRect(currentDeckView(), row.anchor, row.slotIndex);
  // NO `esc()` HERE, and it was in the first draft. `toast` writes `textContent`, which is
  // intrinsically escaped — running the name through `esc` first would show a player the literal
  // string `&amp;` where the room is called `R&D`. Escaping is for the `innerHTML` paths above.
  if (!target) { toast(who + ' IS IN ' + (row.roomName || row.anchor) + ' — CANNOT OPEN IT'); return; }
  _focus = target;
  _armed = null;
  _drag = null;
  repaint();
  toast('▸ ' + who + ' · ' + target.displayName);
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
  closeCtx(); // ⭐ M2-10: a left click anywhere on the floor dismisses an open right-click menu
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
  } else if (pc.cls === 'move') {
    doMove(tile, deck);
  } else if (pc.cls === 'demolish') {
    doDemolish(tile, deck);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐ M2-10 — PRIORITISE: REPAIR X. The right-click menu on a machine.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** ⚠️ THE FRAME IS NOT READ HERE AT ALL, and the helper that read it is DELETED. The first draft
 *  resolved the tile's glyph to a registry piece and named the menu row from that; the `devices`
 *  channel's own `kind` byte is the sim's identity for the machine and `GLYPH_SUBSTITUTE` makes the
 *  art disagree with it on six live kinds (see `prioritise-model.js`'s retracted paragraph). One row
 *  from one channel answers both "is anything here?" and "what is it?", so there is no second source
 *  to drift. */

/** Take the menu down and forget its target. Idempotent — every close path calls it unconditionally. */
function closeCtx() {
  _ctx = null;
  if (_el.ctx) _el.ctx.hidden = true;
}

/**
 * THE RIGHT-CLICK. Open *Prioritise: repair X* over the machine under the pointer.
 *
 * ⚠️ `preventDefault()` IS UNCONDITIONAL AND IT IS FIRST. The browser's own context menu over the
 * game floor is never wanted — not on a machine, not on bare floor, not on the letterbox margin — and
 * suppressing it only where the game answers would make the gesture's behaviour depend on what is
 * under the cursor, which is exactly the inconsistency that teaches a player the right button is
 * unreliable. Every early return below has therefore already suppressed it.
 *
 * ⚠️ THE THREE OUTCOMES ARE `prioritiseOffer`'s, NOT THIS FUNCTION'S, and two of them are silences.
 * A tile with no `devices` row is not a target and says nothing (a stray right-click is not an intent
 * aimed at anything); a tile that IS a target with nobody to order says so in words, because that is
 * the `doMove` shape — an order that looks identical whether it worked or not. See the model's header.
 *
 * ⚠️ NO ARMED TOOL IS REQUIRED AND NONE IS CONSUMED. Right-click is ambient on this surface, the way
 * RimWorld's is: the player does not arm PRIORITISE, they point at a machine. It deliberately does
 * not disarm whatever tool is held either — the box appears over the room and the palette is where it
 * was when it closes.
 */
function onCanvasContext(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  closeCtx();
  if (!_open || !_focus) return;
  const tile = tileFromCanvasXY(e.clientX, e.clientY, _layers.getBoundingClientRect(), _focus);
  if (!tile) return; // letterbox margin / outside the room (IX-Z-11), same rule as the left click
  const roster = Hud.getRoster();
  const offer = prioritiseOffer({
    dev: deviceConditionAt(tile.x, tile.y),
    selCid: selectedCrewCid(Hud.getFrame()),
    crew: roster && Array.isArray(roster.crew) ? roster.crew : [],
  });
  if (!offer.ok) {
    if (!offer.silent) toast(offer.reason);
    return;
  }
  openCtx(e, tile, offer);
}

/**
 * ⭐ THE GLOBAL-CHROME RECT THE MENU MUST NOT OPEN UNDER — `.onb-help`, the `?` circle — or null.
 *
 * ⚠️ IT IS READ OFF THE ELEMENT, NEVER RESTATED FROM ITS CSS. `.onb-help` is
 * `position:fixed; right:30px; top:66px; width:32px` today; copying those four numbers here would be
 * a second encoding of a fact that lives in one stylesheet, and the day the circle moves the menu
 * would dodge empty air. `document.querySelector` is null in the node harnesses, so the clamp is
 * inert there rather than throwing — the driven leg supplies a stub rect to make it bite.
 */
function chromeAvoidRect() {
  const el = (typeof document !== 'undefined' && typeof document.querySelector === 'function')
    ? document.querySelector('.onb-help') : null;
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  return (r && r.width > 0 && r.height > 0) ? r : null;
}

/**
 * Show the one-row menu at the pointer, and remember what it is about.
 *
 * ⚠️ IT IS UNHIDDEN BEFORE IT IS PLACED, AND THAT ORDER IS THE WHOLE POINT of the clamps: a `hidden`
 * element measures 0×0, so reading its box first would clamp against nothing. `clientX/Y` and a
 * `position:fixed` island share one coordinate space, so the box lands under the pointer without any
 * further transform.
 *
 * TWO CLAMPS, IN THIS ORDER, AND BOTH ARE GEOMETRY:
 *   1. THE VIEWPORT. The row measures 254×40 in Chrome, so a right-click near the right or bottom
 *      edge would put the ONLY control in this menu partly off-screen — an order the player can see
 *      and cannot click, which is `invisible-feedback-is-FUNCTIONAL` in its most literal form.
 *   2. ⭐ THE `?` CIRCLE, AND THIS ONE IS A SEND-BACK FIX THAT REPLACES A z-index THAT COULD NOT WORK.
 *      The first draft raised `.rz-ctx` to `z-index:130` to sit above `.onb-help` (120) and it was
 *      INERT: `#roomzoom-view` is `position:fixed; z-index:20` (`styles.css:1199`), i.e. a STACKING
 *      CONTEXT, and `.onb-help` is appended to `document.body` (`onboarding.js:325`). A descendant's
 *      z-index orders it only INSIDE its own context, so no value on this box — 26, 130, 9999 — can
 *      ever beat a body-level sibling context. Measured in headless Chrome by independent review:
 *      with 130 shipped, `elementFromPoint` over a ~240×24 px strip at the top-right still answered
 *      `onb-help`, so a click there opened the onboarding card instead of ordering the repair.
 *      ⇒ THE REMEDY IS THE ONE THIS REPO ALREADY CHOSE FOR THE IDENTICAL COLLISION: `.ov-nudge` moved
 *      ITSELF (`right:74px`, NOT `26px`, `styles.css:1146-1148`) rather than trying to out-stack the
 *      circle. Geometry crosses stacking contexts; z-index does not. Raising `#roomzoom-view`'s own
 *      z-index would work and is refused: it would lift the whole surface over body-level chrome and
 *      trade this occlusion for another.
 *      Sideways FIRST (the nudge's own direction, and it keeps the row on the pointer's line), under
 *      the circle only when there is no room to the left. The viewport clamp then runs AGAIN, because
 *      the downward branch can push the box past the bottom edge.
 *
 * Node-safe by construction: the harnesses' `getBoundingClientRect` returns zeros, their window stub
 * has no `innerWidth` and their `querySelector` returns null, so every clamp is inert unless a leg
 * deliberately supplies the geometry.
 */
function openCtx(e, tile, offer) {
  _ctx = { tile, deck: _focus.deck, cid: offer.cid, name: offer.name };
  if (!_el.ctx || !_el.ctxItem) return;
  setText(_el.ctxItem, offer.label);
  _el.ctx.hidden = false;
  let left = (e && e.clientX) | 0, top = (e && e.clientY) | 0;
  const box = typeof _el.ctx.getBoundingClientRect === 'function'
    ? _el.ctx.getBoundingClientRect() : null;
  const w = (box && box.width) || 0, h = (box && box.height) || 0;
  const vw = (typeof window !== 'undefined' && window.innerWidth) | 0;
  const vh = (typeof window !== 'undefined' && window.innerHeight) | 0;
  const toViewport = () => {
    if (vw && w && left + w > vw) left = Math.max(0, vw - w);
    if (vh && h && top + h > vh) top = Math.max(0, vh - h);
  };
  toViewport();
  const avoid = chromeAvoidRect();
  if (avoid && w && h
      && left < avoid.right + CTX_GAP && left + w > avoid.left - CTX_GAP
      && top < avoid.bottom + CTX_GAP && top + h > avoid.top - CTX_GAP) {
    const leftOfIt = avoid.left - CTX_GAP - w;
    if (leftOfIt >= 0) left = leftOfIt;
    else top = avoid.bottom + CTX_GAP;
    toViewport();
  }
  _el.ctx.style.left = left.toFixed(0) + 'px';
  _el.ctx.style.top = top.toFixed(0) + 'px';
}

/**
 * THE ORDER. One `Cmd.prioritise` naming the person AND the tile, and nothing else.
 *
 * ⚠️ NO OPTIMISTIC ECHO, the rule every verb on this surface states: the toast names what was SENT.
 * She walks to the machine and repairs it over real sim seconds, and whether the sim accepts the
 * order at all is the host's call at the command drain (`M2-9`) — a tile that lost its device between
 * the render and the click is refused there, and the client must not have claimed otherwise.
 *
 * ⚠️ IT READS `_ctx`, NOT THE LIVE CHANNEL, for the reason `_ctx`'s declaration gives: the frame keeps
 * arriving while the box is on screen.
 */
function doPrioritise() {
  if (!_ctx) return;
  const { tile, deck, cid, name } = _ctx;
  closeCtx();
  _send(Cmd.prioritise(cid, tile.x, tile.y, deck));
  pulse(tile, false);
  const roster = Hud.getRoster();
  const list = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const who = surnameOf((list.find((c) => c && c.cid === cid) || {}).name) || ('CREW ' + cid);
  toast('★ ' + who + ' ▸ REPAIR ' + name);
  // A direct order on a stopped ship is the purest "I did something and nothing happened": the
  // command sits in `Simulation._inbox` until a tick drains it, and at `tps == 0` there is none.
  nudgeOnIntent();
}

/**
 * THE MOVE VERB (M1-K) — send the SELECTED crew member to the clicked tile. The Room Zoom's answer
 * to *"in zoom mode we have no control over the pawn"*.
 *
 * ⚠️ IT LOWERS TO THE SAME TWO MESSAGES THE OVERVIEW SENDS, IN THE SAME ORDER, and it must:
 * `MoveCitizenCommand` is constructed from `GameSession._cursor` (`GameSession.cs:1418`), not from a
 * payload, so `Cmd.cursor` is not a hint — it IS the destination, and reversing the pair would move
 * the crew member to wherever the mouse last hovered.
 *
 * ⚠️ THE DECK COMMAND IS CONDITIONAL AND IT IS NOT DEFENSIVE PADDING. `SetCursor` stamps the HOST's
 * `_deck` onto the cursor's Z (`GameSession.cs:1341`) and ignores the client's idea of a deck
 * entirely. `_focus.deck` normally equals `frame.deck` — entry comes from the Overview showing that
 * deck, and `onMinimapSlot` sends `Cmd.deck` on a cross-deck swap — but "normally" is the word that
 * makes this worth three lines: after a cross-deck crew-row click the focus moves the instant the
 * click is sent, while the deck frame is still in flight, so a MOVE issued in that window would send
 * the crew member to the same X/Y on the deck the player just left. Ordering is safe because
 * `DrainCommands` processes the queue sequentially: deck, then cursor, then move.
 *
 * ⚠️ THE SELECTION CHECK IS LOCAL, AND IT IS THE ONE THING THIS FUNCTION DECIDES. The host already
 * refuses (`if (_selected == 0) { _status = "no crew selected"; return; }`) — but that refusal lands
 * in `_status`, which this surface does not render anywhere, so without the local check a click with
 * nothing selected is completely silent. That is the `invisible-feedback-is-FUNCTIONAL` shape: an
 * order that looks identical whether it worked or not. The client is NOT duplicating a verdict it
 * could get better from the host (the OPERATE lesson, now deleted) — it is answering a question
 * the host's answer never reaches the player for.
 *
 * NO OPTIMISTIC ECHO: the toast names what was SENT, never that the crew member has arrived. They
 * walk; `MoveCitizenCommand` sets a path and the sim spends real seconds on it.
 */
function doMove(tile, deck) {
  const frame = Hud.getFrame();
  const cid = selectedCrewCid(frame);
  if (cid == null) {
    toast('NO CREW SELECTED — CLICK A PAWN OR A CREW ROW, THEN CLICK WHERE THEY SHOULD GO');
    pulse(tile, false);
    return;
  }
  const roster = Hud.getRoster();
  const list = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const who = surnameOf((list.find((c) => c && c.cid === cid) || {}).name) || ('CREW ' + cid);
  const shown = frame && Number.isFinite(frame.deck) ? frame.deck | 0 : deck;
  if (shown !== deck) _send(Cmd.deck(deck - shown));
  _send(Cmd.cursor(tile.x, tile.y));
  _send(Cmd.move());
  pulse(tile, false);
  toast('➤ ' + who + ' → ' + tile.x + ',' + tile.y);
  // A move order on a stopped ship is the purest form of "I did something and nothing happened":
  // the command sits in `Simulation._inbox` until a tick drains it, and at `tps == 0` there is none.
  nudgeOnIntent();
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
      //
      // ⚠️ OPEN DEFECT "DOOR-NO-REMOVAL" (found in review of the door package, 2026-07-27, and left
      // UNFIXED deliberately). `built-wall` is reached by walls AND by all three door glyphs, and
      // this one message is honest for only the first. **STRIP EXPLICITLY REFUSES DOORS** —
      // `sim/Sim.Core/Systems/DeconstructSystem.cs:345` is `return device.Kind != DeviceKind.Door;`,
      // and a live host answers `"cannot strip door"` where a wall answers `"designate strip"`. So a
      // player who clicks DEMOLISH on a door is sent to a verb that will refuse it.
      //
      // WHY IT IS NOT FIXED HERE. Behind the wrong signpost is a real gap in the SIM's verb set: a
      // BUILT door has NO removal verb at all. DEMOLISH refuses it (`STRUCTURE_CODES`), STRIP
      // refuses it (above), `Cmd.remove` would be dropped by `RemoveDeviceCommand`'s
      // `IsPlaceableFurniture` gate (`Commands.cs:566`), and build-cancel only revokes a PENDING
      // order — after `BuildSystem.Complete` spawns the device there is nothing left to cancel. The
      // DOOR tool is on this palette, so a player can build a door and never remove it. The honest
      // copy ("this door cannot be removed") therefore advertises that gap, which is an owner call
      // and a sim change, not a string edit. Recorded here so the next reader of this line does not
      // have to rediscover why it says STRIP.
      //
      // The wall case IS pinned (`room-model.test.js`, 'WP-4: the built-wall dead end now points at
      // STRIP'). The door case is deliberately NOT pinned — asserting this text on a door would put
      // the misdirection in the gate.
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
 * `on` is always true HERE, and since M1-C that is a statement about THIS FUNCTION and not about the
 * client: `erasePayloads` below sends the OFF half. The sentence it replaces was the gap — *"the Room
 * Zoom paints intent and never erases it. UN-designating is a KNOWN GAP — the wire carries it
 * (`Cmd.dig(x, y, false)`) and no surface in the client sends it, the console included"* — and it is
 * quoted rather than deleted so a grep for it lands on the verb that closed it.
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

/**
 * Lower an ERASE target + tile to its wire payloads (M1-C) — the OFF half of `orderPayloads`, and a
 * separate function because its input is not a VERB but a TARGET: which order this particular tile
 * carries, decided by `eraseTarget` from what the surface can see there. A null target is an empty
 * list, never a message.
 *
 * ⚠️ STOCKPILE OFF IS **ONE** COMMAND, NOT THE PAIR ABOVE. A stockpile PAINT always sends
 * `Cmd.stockpile` then `Cmd.filter` so that every repaint re-asserts the whole truth — but
 * `DesignateStockpileCommand` with `on:false` clears the accept-filter itself
 * (`sim/Sim.Core/Commands/Commands.cs:186`), so a trailing `Cmd.filter` here would write a mask onto
 * a tile that is no longer a zone: an orphan in the ZONE hash, which is precisely what the OFF path
 * exists to avoid. Making the two paths "symmetrical" is the most likely regression in this file.
 *
 * IT MUST STAY BYTE-IDENTICAL TO `overview-view.js`'s copy, for the same reason `orderPayloads` must
 * stay byte-identical to `paletteOrders`.
 *
 * ⚠️ IT IS NOT PINNED THE SAME WAY, AND SAYING SO WAS AN OVERSTATEMENT — corrected in review
 * (2026-07-29). `orderPayloads` has a real cross-surface pin because `paletteOrders` is a THIRD,
 * shared producer both copies can be compared against by import; the OFF path has no such producer,
 * and the two suites live in separate files with separate DOM globals, so nothing compares one
 * emission to the other. What IS pinned is (a) the shared `eraseTarget`/`tileOrders` both surfaces
 * run, by import, and (b) the ABSOLUTE wire shape `{cmd,x,y,on:0}` asserted independently in each
 * file — so a drift on either side reddens against the host's contract even though the two are never
 * compared to each other. That is weaker than the ON path and is stated rather than implied.
 *
 * @param {'dig'|'strip'|'stockpile'|null} target  `eraseTarget` output
 * @param {number} x @param {number} y
 * @returns {object[]} 0..1 Cmd payloads
 */
function erasePayloads(target, x, y) {
  if (target === 'dig') return [Cmd.dig(x, y, false)];
  if (target === 'strip') return [Cmd.strip(x, y, false)];
  if (target === 'stockpile') return [Cmd.stockpile(x, y, false)];
  return [];
}

/** What an ERASE click on this room tile would take off, or null — the Room Zoom's half of the
 *  lookup. It reads BOTH channels: `_markTiles` (dig / strip, and stockpile where the host ranked it
 *  topmost) and `_zoneTiles` (this surface's stockpile source, from the `zones` channel).
 *
 *  ⚠️ THE SECOND READ IS A FOG DEFENCE, NOT A ZONE DEFENCE — corrected in review (2026-07-29). On an
 *  EXPLORED tile a zone reaches `marks` as well, so `_zoneTiles` adds nothing there; what it adds is
 *  the FOGGED zone, because `BuildZones` has no fog gate and `BuildMarks` does
 *  (`GameSession.cs:1974-1999` against `:2053`) and `DesignateStockpileCommand` needs only `Walkable`
 *  (`Commands.cs:173`). So this surface can take back a zone the Overview cannot even see. That
 *  asymmetry is a recorded limit, not a feature; `room-model.js`'s ERASE header carries it. */
function eraseTargetAt(x, y) {
  return eraseTarget(tileOrders(roomMarkNameAt(_markTiles, x, y), roomTileZoned(_zoneTiles, x, y)));
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
  // ONE mask read for the whole sweep, taken at COMMIT and only for an ORDER — a WALL sweep has no
  // business reading a stockpile filter at all.
  //
  // AT COMMIT, NOT AT PRESS, and that is the observable half of this line: a player who presses,
  // drags, then flips a chip before releasing gets the rectangle they can SEE the chips describing.
  // Stashing the mask on `_drag` in `onCanvasDown` is the plausible refactor and it silently paints
  // the older filter; `room-model.test.js` toggles a chip mid-drag to make that mutation bite.
  // (The per-tile-read hazard the injected getter used to guard is now structurally absent: the mask
  // is module state whose only writer is a DOM handler, and this loop is synchronous, so a per-tile
  // read could not observe a different value. Stated rather than tested, because there is no longer
  // a mechanism by which it could differ.)
  const mask = pc.cls === 'order' ? _stockFilter : 0;
  // sim decides legality per tile, for both classes — an illegal order is a silent no-op, never a ghost
  // ERASE is counted as it goes, and the count is the ONLY honest thing to say afterwards: the tiles
  // in the rectangle are what the player dragged over, while the number of orders actually taken back
  // is what happened. A sweep across a room to clear four dig marks touches thirty tiles.
  let erased = 0;
  if (pc.cls === 'order') {
    for (const t of res.tiles) for (const o of orderPayloads(pc.verb, t.x, t.y, mask)) _send(o);
  } else if (pc.cls === 'erase') {
    for (const t of res.tiles) {
      const target = eraseTargetAt(t.x, t.y);
      if (target) erased++;
      for (const o of erasePayloads(target, t.x, t.y)) _send(o);
    }
  } else for (const t of res.tiles) _send(Cmd.build(pc.kind, t.x, t.y, material));
  if (res.tiles.length) {
    pulse(res.tiles[res.tiles.length - 1], false);
    // STOCKPILE's caption names the mask it just painted. The reason recorded here — "because nothing
    // else on this surface can: the ACCEPTS chips are still on the console" — is SPENT as of WP-6;
    // the chips are two rows above. It is kept because the reason it survives is a different and
    // better one: the chips state INTENT and the toast states what was actually committed, and a zone
    // that silently refuses every item looks exactly like one nothing has been hauled to yet.
    // `acceptsLabel` is the SHARED spelling the zone key uses, so the chips, the toast and the key
    // cannot word one mask three ways.
    const accepts = pc.verb === 'stockpile' ? ' · ' + acceptsLabel(mask) : '';
    // ERASE REPORTS ITS COUNT, AND SAYS SO WHEN THE COUNT IS ZERO. `dragCaption` describes the
    // RECTANGLE, which for every other tool is what was committed and for this one is not: a sweep
    // that finds nothing to take back sends no command at all, and silence there is
    // indistinguishable from a broken tool (§4g, the reason the Overview grew a toast).
    if (pc.cls === 'erase') {
      toast(TOOL_LABEL[drag.tool] + ' ▸ ' + (erased ? erased + ' ORDER' + (erased === 1 ? '' : 'S') +
        ' TAKEN BACK' : 'NOTHING TO ERASE HERE'));
    } else toast(TOOL_LABEL[drag.tool] + ' ▸ ' + dragCaption(res) + accepts);
    // The nudge applies to ERASE TOO, and that is not symmetry for its own sake: a command only
    // reaches the sim on a TICK, so on a paused ship the mark the player just cancelled stays on the
    // floor until they start it again — the same "nothing happened" the nudge exists for. An erase
    // that found nothing to take back sent nothing, so it nudges about nothing.
    if (pc.cls !== 'erase' || erased) nudgeOnIntent();
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
  if (k === 'Escape' && _ctx) {
    // ⭐ M2-10 — AN ESC RUNG ABOVE THE TOOL, and handled HERE rather than inside `escStackRung`. The
    // shared model decides the disarm/exit ladder for BOTH standard surfaces and neither of them has
    // a right-click menu; adding a rung there would widen a shared derivation for one surface's
    // transient. The rule is the one every stacked UI uses: ESC takes down the topmost thing first,
    // so the box closes and the armed tool survives.
    closeCtx();
    e.stopPropagation(); e.preventDefault();
    return;
  }
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
  } else if (k === 'c' || k === 'C') {         // M1-C: C toggles ERASE (Cancel) — the console's own
    // binding too (`controls.js`), so the key means the same thing on both standard surfaces. X, the
    // obvious letter for "cancel", is DEMOLISH three lines up and the console's cancel-a-build
    // toggle; C is free on both keymaps.
    arm('erase'); e.stopPropagation(); e.preventDefault();
  } else if (k === 'm' || k === 'M') {         // M1-K: M toggles MOVE — the console's own letter
    // ⚠️ THIS KEY WAS NOT FREE — IT WAS WORSE THAN TAKEN, AND CLAIMING IT IS HALF OF A BUG FIX.
    // `input/controls.js:225` installs a BUBBLE-phase window keydown for the deprecated console at
    // boot, and this surface's capture handler `stopPropagation`s only the keys it names. So while a
    // room was open, `M` reached the console and sent a real `Cmd.move()` — moving the selected crew
    // member to the console's INVISIBLE inspection cursor, hardcoded at `controls.js:145` to
    // `{x:32,y:10}`, with no cursor drawn, no toast and no way to predict where they would go. The
    // same leak sent `T` into a dialogue inside `#panels` (`display:none`) and `Enter` into one or
    // the other. That is the `HANDOVER.md:314-319` shape — a verb wired to an invisible cursor —
    // and it is closed in this package by `installInput`'s `isSuspended` seam, which stands the
    // console's whole keymap down (except the time keys) while a Level-2 takeover is open.
    // ⇒ WHY THE FIX IS NOT SIMPLY THIS LINE. Adding `M` here with `stopPropagation()` really would
    //   suppress the console's `M` on its own — window is both the first capture object and the last
    //   bubble object in the path, so stopping in capture means the bubble listener is never reached.
    //   That fixes ONE key. `T` (a talk into a hidden dialogue), `Enter` (either of the two), and the
    //   arrow/hjkl keys that MOVE the invisible cursor are all still live, and none of them wants a
    //   Room-Zoom binding — the only honest answer for a key this surface has no use for is that the
    //   deprecated surface underneath does not get to act on it. Hence the stand-down, and hence `M`
    //   is unambiguously free here rather than merely being shouted over.
    arm('move'); e.stopPropagation(); e.preventDefault();
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
