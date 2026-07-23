// THE LEVEL-1 OVERVIEW SURFACE CONTROLLER — the warm deck schematic + its floating HUD, made the
// default SHIP surface whenever the wire carries a compartment grid (the `decks` channel). It mounts
// the PURE `overviewScene` SVG (client/src/ui/overview-scene.js) over the parked WebGL canvas and
// wraps it in blur-glass `.hud` islands (top status · left CREW WATCH · right SELECTED readout ·
// bottom-left LENS · bottom-centre command bar · bottom-right SENSOR LOG · left-centre deck rail).
//
// It owns NO wire state and NO second selection model: everything authoritative is read back from
// the console HUD (hud.js caches + getters) and every action LOWERS to an existing `Cmd` or an
// existing hud seam (armed-tool slot, tab machinery, the shared crew-selection flow). All non-trivial
// derivations are the PURE overview-model.js (node-tested). This file is DOM glue.
//
// Default-view switch (IX-O-07): when `decks` is populated AND the active tab is a ship tab
// (BUILD/CREW) the Overview takes over (`body.overview-open` hides the console `.app`, the canvas
// keeps running behind it). RELATIONS / MOSS / CHRONICLE lower to the console's proven surfaces
// (v1 delegation — see the tab handler); an empty `decks` (e.g. --ship slice) never shows the
// Overview at all, so the legacy tile view is unchanged.

import * as Hud from './hud.js';
import { Cmd } from '../wire/session.js';
import { selectedCrewCid, decodeDecks, decodeRooms } from '../wire/messages.js';
import { decksView } from './decks-model.js';
import { overviewScene, makeTransform } from './overview-scene.js';
import { pawnChip } from '../render/pawn-svg.js';
import {
  clockHHMM, cautionState, moraleColor, surnameOf, speedLabel, logLineParts, logTail,
  selectedRosterEntry, crewClickTarget,
} from './console-model.js';
import {
  tileAt, overviewClickAction, lensSlotTint, currentRoom, deckPips, deckDelta,
  fmtO2, fmtCo2, fmtTemp, powerLabel,
} from './overview-model.js';

/* eslint-disable no-multi-spaces */

const LENSES = ['none', 'pressure', 'oxygen', 'co2', 'temperature', 'power', 'water'];
const LENS_SHORT = ['∅', 'PRES', 'O₂', 'CO₂', 'TEMP', 'PWR', 'H₂O'];
// ＋ADD ROOM picker: the commissionable room types (lowercase wire string → UPPERCASE label). Mirrors
// GameSession.ParseRoomType's whitelist; sending an unlisted type is a host no-op, so keep in step.
const ROOM_TYPE_CHOICES = [
  ['quarters', 'QUARTERS'], ['mess', 'MESS'], ['medbay', 'MEDBAY'], ['hydro', 'HYDROPONICS'],
  ['workshop', 'WORKSHOP'], ['storage', 'STORAGE'], ['commons', 'COMMONS'], ['engineering', 'ENGINEERING'],
  ['fabrication', 'FABRICATION'], ['reactor', 'REACTOR'], ['lifesupport', 'LIFE SUPPORT'],
  ['command', 'COMMAND'], ['observatory', 'OBSERVATORY'],
];
// Ship tabs the Overview owns; the rest lower to the console (v1 delegation).
const OV_TABS = [['build', 'BUILD'], ['crew', 'CREW'], ['relations', 'RELATIONS'], ['moss', 'MOSS'], ['chron', 'CHRONICLE']];
const SHIP_TABS = new Set(['build', 'crew']);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _send = () => {};
let _root = null;            // #overview-view
let _stage = null;           // the scene mount (over the parked canvas)
let _toast = null;           // transient status toast
let _toastTimer = 0;
let _raf = 0;                // coalesce many wire messages into one repaint
let _ctx = { transform: null, frame: null }; // last projection, for click→tile
// Level-2 room-zoom hooks (owned by a later lane). For now: select/centre + an honest toast.
let _onEnterRoom = (anchor) => { toast('ROOM ZOOM — coming soon (' + anchor + ')'); };
// ＋ADD ROOM: open the room-type picker for the clicked hall; a choice lowers to Cmd.addRoom and the
// slot commissions (glow-pool + label) once the next `decks` frame confirms it. Overridable for tests.
let _onAddRoom = (deck, slot) => showRoomPicker(deck, slot);
let _pickDeck = 0;
let _pickSlot = 0;

/** Mount the Overview surface + subscribe to the shared HUD state. Call once from main.js. */
export function initOverview(opts) {
  _send = (opts && opts.send) || (() => {});
  _root = document.getElementById('overview-view');
  if (!_root) return;
  buildSkeleton();
  Hud.onShipUpdate(scheduleRepaint);
  // Optional injection point for the room-zoom lane.
  if (opts && typeof opts.onEnterRoom === 'function') _onEnterRoom = opts.onEnterRoom;
  if (opts && typeof opts.onAddRoom === 'function') _onAddRoom = opts.onAddRoom;
  repaint();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Static skeleton: the islands are created once; their dynamic content is re-rendered on repaint.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function buildSkeleton() {
  _root.classList.add('ov');
  // Visibility is now the `body.overview-open` CSS switch, not the boot `hidden` attribute (which
  // only prevents a flash-of-unstyled-content before this module runs).
  _root.hidden = false;
  _root.innerHTML =
    '<div class="ov-space">' +
      '<div class="ov-neb ov-neb1"></div><div class="ov-neb ov-neb2"></div><div class="ov-neb ov-neb3"></div>' +
      '<div class="ov-stage" id="ov-stage"></div>' +
    '</div>' +
    '<div class="hud ov-topbar" id="ov-topbar"></div>' +
    '<div class="hud ov-deckrail" id="ov-deckrail"></div>' +
    '<aside class="hud ov-crewwatch" id="ov-crewwatch"></aside>' +
    '<aside class="hud ov-readout" id="ov-readout"></aside>' +
    '<div class="hud ov-lens" id="ov-lens"></div>' +
    '<div class="ov-cmd" id="ov-cmd"></div>' +
    '<div class="hud ov-sensor" id="ov-sensor"></div>' +
    '<div class="ov-toast" id="ov-toast" hidden></div>' +
    // ＋ADD ROOM room-type picker (a centred modal over the scene; styles inlined so it works
    // without a stylesheet). Populated on demand by showRoomPicker; clicks route via onHudClick.
    '<div class="ov-picker" id="ov-picker" hidden style="position:fixed;inset:0;z-index:60;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(6,10,16,.55)"></div>';
  _stage = document.getElementById('ov-stage');
  _toast = document.getElementById('ov-toast');

  // Map clicks: project + classify (IX-O-11..19). Only the scene surface routes here.
  _stage.addEventListener('click', onSceneClick);
  // HUD buttons: one delegated handler, ignoring the scene (which has its own above).
  _root.addEventListener('click', onHudClick);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Repaint (coalesced to one animation frame). Reads authoritative state from the HUD caches.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function scheduleRepaint() {
  if (_raf) return;
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  _raf = raf(() => { _raf = 0; repaint(); });
}

/** Whether the Overview should be the shown surface right now (IX-O-07 default-view switch). */
function shouldShow() {
  const decks = Hud.getDecks();
  const populated = !!(decks && Array.isArray(decks.decks) && decks.decks.length);
  return populated && SHIP_TABS.has(Hud.getTab()) && !Hud.isMossActive();
}

function repaint() {
  if (!_root) return;
  const show = shouldShow();
  document.body.classList.toggle('overview-open', show);
  if (!show) return; // hidden → skip the heavy scene rebuild until it matters again

  const frame = Hud.getFrame();
  const rosterMsg = Hud.getRoster();
  const crew = rosterMsg && Array.isArray(rosterMsg.crew) ? rosterMsg.crew : [];
  const activeDeck = frame ? (frame.deck | 0) : 0;
  const dView = decksView(decodeDecks(Hud.getDecks()), decodeRooms(Hud.getRooms()));
  const designsMsg = Hud.getDesigns();
  const lens = frame ? (frame.lens || 'none') : 'none';
  const selCid = selectedCrewCid(frame);

  paintScene(frame, dView, crew, designsMsg, activeDeck, lens, selCid);
  paintTopbar(activeDeck, dView);
  paintDeckRail(dView, activeDeck);
  paintCrewWatch(crew, selCid);
  paintReadout(frame, rosterMsg, dView, activeDeck);
  paintLens(lens);
  paintCommand();
  paintSensor();
}

// ── the scene (schematic) + the lens wash overlay ──

function paintScene(frame, dView, crew, designsMsg, deck, lens, selCid) {
  const state = {
    deck, decksView: dView, frame, crew,
    designs: designsMsg && Array.isArray(designsMsg.cells) ? designsMsg.cells : [],
    selectedCid: selCid, lens,
  };
  let svg = overviewScene(state);
  const overlay = lensOverlaySvg(dView, deck, frame, lens);
  if (overlay) svg = svg.replace(/<\/svg>\s*$/, overlay + '</svg>');
  _stage.innerHTML = svg;

  // Cache the projection for click→tile (IX-O-19).
  const entry = (dView || []).find((d) => d.deck === deck);
  _ctx = { transform: makeTransform(entry ? entry.slots : [], frame), frame };
}

/** The lens wash: a translucent grade rect over each occupied room (IX-O-30). PURE-derived tint. */
function lensOverlaySvg(dView, deck, frame, lens) {
  if (!lens || lens === 'none') return '';
  const entry = (dView || []).find((d) => d.deck === deck);
  if (!entry) return '';
  const t = makeTransform(entry.slots, frame);
  let out = '';
  for (const s of entry.slots) {
    if (!s.occupied) continue;
    const tint = lensSlotTint(lens, s);
    if (!tint) continue;
    const r = t.rect(s.rect);
    out += `<rect x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" rx="2" fill="${tint}"/>`;
  }
  return out ? `<g class="pl-lens" style="mix-blend-mode:hard-light" pointer-events="none">${out}</g>` : '';
}

// ── top status bar ──

function paintTopbar(activeDeck, dView) {
  const metrics = Hud.getMetrics();
  const status = Hud.getStatus();
  const total = Array.isArray(dView) ? dView.length : 0;
  const day = metrics ? metrics.day : '–';
  const clock = metrics ? clockHHMM(metrics.dayFrac || 0) : '--:--';
  const paused = status ? !!status.paused : false;
  const c = cautionState(metrics || {});
  const speed = status ? speedLabel(status.speed) : '1×';
  const deckCtx = 'DECK ' + activeDeck + (total ? ' OF ' + total : '');
  $('ov-topbar').innerHTML =
    '<span class="ov-ship">MSV PERILUNE</span>' +
    '<span class="ov-deckctx">' + esc(deckCtx) + '</span>' +
    '<span class="ov-clock">DAY ' + esc(day) + ' · ' + esc(clock) + '</span>' +
    '<span class="ov-spacer"></span>' +
    '<button class="ov-chip ov-pause" data-ov-pause>' + (paused ? '► RUN' : '‖ HOLD') + '</button>' +
    '<span class="ov-chip ov-speed">' + esc(speed) + '</span>' +
    '<span class="ov-chip ov-caution ' + c.level + '">' + esc(c.label) + '</span>';
}

// ── deck rail ──

function paintDeckRail(dView, activeDeck) {
  const pips = deckPips(dView, activeDeck);
  $('ov-deckrail').innerHTML = pips.map((p) =>
    '<button class="ov-pip' + (p.active ? ' on' : '') + '" data-ov-deck="' + p.deck + '">' + p.deck + '</button>',
  ).join('');
}

// ── left CREW WATCH dock ──

function paintCrewWatch(crew, selCid) {
  const header = 'CREW WATCH — ' + crew.length + ' SOUL' + (crew.length === 1 ? '' : 'S');
  let rows = '';
  if (!crew.length) {
    rows = '<div class="ov-empty">No souls aboard.</div>';
  } else {
    for (const e of crew) {
      const sel = selCid != null && e.cid === selCid;
      const mv = Math.max(0, Math.min(1, e.morale || 0));
      rows +=
        '<button class="ov-crew' + (sel ? ' sel' : '') + '" data-ov-crew="' + esc(e.cid) + '">' +
          '<span class="ov-bust"><svg viewBox="0 0 16 20">' + pawnChip({ cid: e.cid, role: e.role }) + '</svg></span>' +
          '<span class="ov-crewcol">' +
            '<span class="ov-crewname">' + esc(surnameOf(e.name)) + '</span>' +
            '<span class="ov-crewrole">' + esc(e.role || '') + '</span>' +
            '<span class="ov-morale"><span class="ov-morale-fill" style="width:' + Math.round(mv * 100) +
              '%;background:' + moraleColor(mv) + '"></span></span>' +
          '</span>' +
        '</button>';
    }
  }
  $('ov-crewwatch').innerHTML = '<div class="ov-hdr">' + esc(header) + '</div>' + rows;
}

// ── right SELECTED readout ──

function paintReadout(frame, rosterMsg, dView, activeDeck) {
  const sel = selectedRosterEntry(frame, rosterMsg);
  const el = $('ov-readout');
  const head = '<div class="ov-hdr">SELECTED</div>';
  if (!sel) {
    el.innerHTML = head +
      '<div class="ov-empty">NO CREW SELECTED</div>' +
      '<div class="ov-guide">Click a pawn or a CREW WATCH row.</div>' +
      readoutActions(false);
    return;
  }
  const tile = crewClickTarget(frame, sel);
  const entry = (dView || []).find((d) => d.deck === activeDeck);
  const room = (sel.deck === activeDeck && entry) ? currentRoom(tile, entry.slots) : null;
  const roomName = room ? room.displayName : '—';
  const traits = Array.isArray(sel.traits) ? sel.traits : [];
  const traitChips = traits.length
    ? '<div class="ov-traits">' + traits.map((t) => '<span class="ov-trait">' + esc(t) + '</span>').join('') + '</div>' : '';
  let atmosBox = '';
  if (room && room.atmos) {
    const a = room.atmos;
    atmosBox =
      '<div class="ov-atmos">' +
        '<div class="ov-atmos-lbl">CURRENT ROOM · ' + esc(roomName) + '</div>' +
        '<div class="ov-atmos-row"><span>ATMOS</span><span class="ov-atmos-v good">' +
          fmtO2(a.o2) + ' O₂ · ' + fmtCo2(a.co2ppm) + ' CO₂</span></div>' +
        '<div class="ov-atmos-row"><span>TEMP · POWER</span><span class="ov-atmos-v amber">' +
          fmtTemp(a.tempK) + ' · ' + powerLabel(room.active) + '</span></div>' +
      '</div>';
  }
  el.innerHTML = head +
    '<div class="ov-selrow">' +
      '<span class="ov-selbust"><svg viewBox="0 0 16 20">' + pawnChip({ cid: sel.cid, role: sel.role }) + '</svg></span>' +
      '<span class="ov-selname"><span class="ov-selN">' + esc(sel.name || '') + '</span>' +
        '<span class="ov-selR">' + esc([sel.role, roomName].filter(Boolean).join(' · ')) + '</span></span>' +
    '</div>' +
    traitChips +
    '<div class="ov-task">&gt; ' + esc(sel.task || '') + '</div>' +
    atmosBox +
    readoutActions(true);
}

function readoutActions(enabled) {
  const d = enabled ? '' : ' disabled';
  return '<div class="ov-actions">' +
    '<button class="ov-act ov-talk" data-ov-talk' + d + '>[T] OPEN CHANNEL — TALK</button>' +
    '<div class="ov-act-row">' +
      '<button class="ov-act" data-ov-move' + d + '>[M] MOVE</button>' +
      '<button class="ov-act" data-ov-bio' + d + '>[B] BIO</button>' +
    '</div></div>';
}

// ── bottom-left LENS ──

function paintLens(activeLens) {
  const btns = LENSES.map((name, i) =>
    '<button class="ov-lensbtn' + (name === activeLens ? ' on' : '') + '" data-ov-lens="' + name + '">' +
      (i + 1) + ' ' + LENS_SHORT[i] + '</button>').join('');
  $('ov-lens').innerHTML = '<div class="ov-hdr">LENS</div><div class="ov-lensrow">' + btns + '</div>';
}

// ── bottom-centre command bar (PLACE palette + tabs) ──

function paintCommand() {
  const tab = Hud.getTab();
  const armed = Hud.getArmedTool();
  const TOOLS = [['wall', 'WALL'], ['door', 'DOOR'], ['cancel', '⌫ CANCEL']];
  const palette = tab === 'build'
    ? '<div class="hud ov-place">' +
        '<span class="ov-hdr">PLACE ▸</span>' +
        TOOLS.map(([kind, label]) =>
          '<button class="ov-tool' + (kind === 'cancel' ? ' cancel' : '') + (armed === kind ? ' on' : '') +
          '" data-ov-tool="' + kind + '">' + esc(label) + '</button>').join('') +
      '</div>'
    : '';
  const tabs = '<div class="hud ov-tabs">' + OV_TABS.map(([key, label]) =>
    '<button class="ov-tab' + (key === tab ? ' on' : '') + '" data-ov-tab="' + key + '">' + esc(label) + '</button>').join('') + '</div>';
  $('ov-cmd').innerHTML = palette + tabs;
}

// ── bottom-right SENSOR LOG ──

function paintSensor() {
  const tail = logTail(Hud.getLog(), 5);
  const lines = tail.length
    ? tail.map((l, i) => {
      const p = logLineParts(l);
      const tsCls = i === tail.length - 1 ? 'ov-ts new' : 'ov-ts';
      return p.ts
        ? '<div class="ov-logline"><span class="' + tsCls + '">' + esc(p.ts) + '</span> ' + esc(p.rest) + '</div>'
        : '<div class="ov-logline">' + esc(p.rest) + '</div>';
    }).join('')
    : '<div class="ov-logline ov-faint">— no events yet —</div>';
  $('ov-sensor').innerHTML = '<div class="ov-hdr">SENSOR LOG — LAST ' + tail.length + '</div>' + lines;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function onSceneClick(e) {
  const svg = _stage.querySelector('svg.pl-overview');
  if (!svg) return;
  const armed = Hud.getArmedTool();
  const hit = hitTest(e.target);
  const action = overviewClickAction(armed, hit);
  switch (action.type) {
    case 'build': {
      const t = pointToTile(svg, e);
      if (t) { _send(Cmd.build(armed, t.x, t.y)); Hud.toolUsed(armed, t.x, t.y); }
      break;
    }
    case 'move': {
      const t = pointToTile(svg, e);
      if (t) { _send(Cmd.cursor(t.x, t.y)); _send(Cmd.move()); Hud.toolUsed('move', t.x, t.y); }
      break;
    }
    case 'select': Hud.selectCrewByCid(action.cid); break;
    case 'addroom': _onAddRoom(_ctx.frame ? _ctx.frame.deck : 0, action.slot); break;
    case 'enterRoom': _onEnterRoom(action.anchor); break;
    default: break; // bare space / hall → no-op (IX-O-18)
  }
}

/** DOM hit → {pawnCid|addRoomSlot|roomAnchor|hallSlot}, richest-first (IX-O-11/13/15). */
function hitTest(target) {
  if (!target || !target.closest) return {};
  const pawn = target.closest('.pl-pawn');
  if (pawn && pawn.dataset.cid != null) return { pawnCid: Number(pawn.dataset.cid) };
  const add = target.closest('.pl-addroom');
  if (add) { const hall = add.closest('.pl-hall'); return { addRoomSlot: hall ? Number(hall.dataset.slot) : 0 }; }
  const room = target.closest('.pl-room');
  if (room && room.dataset.anchor) return { roomAnchor: room.dataset.anchor };
  const hall = target.closest('.pl-hall');
  if (hall) return { hallSlot: Number(hall.dataset.slot) };
  return {};
}

/** Map a DOM click to a sim tile via the SVG CTM + the cached deck transform, or null. */
function pointToTile(svg, e) {
  if (!svg.createSVGPoint || !svg.getScreenCTM) return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const v = pt.matrixTransform(ctm.inverse());
  return tileAt(_ctx.transform, v.x, v.y, _ctx.frame);
}

function onHudClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.ov-stage')) return; // scene has its own handler
  if (t.id === 'ov-picker') { closeRoomPicker(); return; } // click the picker backdrop → dismiss
  const btn = t.closest('button');
  if (!btn || btn.disabled) return;
  const d = btn.dataset;
  if (d.ovPick != null) { submitRoomPick(d.ovPick); return; }
  if ('ovPickCancel' in d) { closeRoomPicker(); return; }
  if (d.ovDeck != null) { _send(Cmd.deck(deckDelta(Number(d.ovDeck), _ctx.frame ? _ctx.frame.deck : 0))); }
  else if (d.ovLens != null) { _send(Cmd.lens(d.ovLens)); }
  else if (d.ovTab != null) { Hud.selectTab(d.ovTab); }
  else if (d.ovTool != null) { Hud.armTool(d.ovTool); }
  else if (d.ovCrew != null) { Hud.selectCrewByCid(d.ovCrew); }
  else if ('ovPause' in d) { _send(Cmd.pause()); }
  else if ('ovTalk' in d) { Hud.talkSelectedCrew(); }
  else if ('ovMove' in d) { Hud.armTool('move'); }
  else if ('ovBio' in d) { Hud.openBioForSelected(); }
}

// ── ＋ADD ROOM room-type picker ──

/** Open the room-type picker for a hall (deck + slot index). A choice sends Cmd.addRoom. */
function showRoomPicker(deck, slot) {
  _pickDeck = deck | 0;
  _pickSlot = slot | 0;
  const el = $('ov-picker');
  if (!el) return;
  const btns = ROOM_TYPE_CHOICES.map(([type, label]) =>
    '<button class="ov-pickbtn" data-ov-pick="' + type + '" ' +
      'style="padding:8px 10px;border:1px solid rgba(255,196,128,.35);border-radius:6px;' +
      'background:rgba(24,18,12,.9);color:#ffdcb0;font:inherit;cursor:pointer;letter-spacing:.04em">' +
      esc(label) + '</button>').join('');
  el.innerHTML =
    '<div class="ov-pickcard" style="max-width:420px;padding:18px;border-radius:12px;' +
      'background:rgba(14,12,10,.96);border:1px solid rgba(255,196,128,.4);box-shadow:0 12px 48px rgba(0,0,0,.6)">' +
      '<div class="ov-hdr" style="margin-bottom:12px;color:#ffb570">COMMISSION ROOM · DECK ' +
        esc(_pickDeck) + ' · SLOT ' + esc(_pickSlot) + '</div>' +
      '<div class="ov-pickgrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' + btns + '</div>' +
      '<button class="ov-pickcancel" data-ov-pick-cancel ' +
        'style="margin-top:14px;width:100%;padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:6px;' +
        'background:transparent;color:#cbb;font:inherit;cursor:pointer">CANCEL</button>' +
    '</div>';
  el.hidden = false;
}

function submitRoomPick(type) {
  _send(Cmd.addRoom(_pickDeck, _pickSlot, type));
  toast('COMMISSIONING ' + String(type).toUpperCase() + ' — DECK ' + _pickDeck + ' SLOT ' + _pickSlot);
  closeRoomPicker();
}

function closeRoomPicker() {
  const el = $('ov-picker');
  if (el) { el.hidden = true; el.innerHTML = ''; }
}

// ── transient toast (room-zoom stub) ──

function toast(msg) {
  if (!_toast) return;
  _toast.textContent = msg;
  _toast.hidden = false;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toast.hidden = true; }, 2600);
}

const $ = (id) => document.getElementById(id);
