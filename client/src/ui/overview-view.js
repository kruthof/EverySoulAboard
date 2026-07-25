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
// keeps running behind it). An empty `decks` (e.g. --ship slice) never shows the Overview at all,
// so the legacy tile view is unchanged.
//
// The non-ship tabs are NOT a delegation to the console any more. MOSS (`body.moss-open`) and
// RELATIONS (`body.relations-open`) are body-level takeovers of their own, each hiding `.app` and
// this surface with its own CSS switch; CHRONICLE is the one still-inert slot (`overview-model.js`
// INERT_TABS). That distinction is load-bearing: while RELATIONS was a console overlay, selecting it
// dropped `overview-open` and brought the entire deprecated console back on screen over the modern
// game. Any tab added here that leaves for a surface of its own MUST bring its own body switch —
// `client/test/relations-view.test.js` "A2" fails if one does not.

import * as Hud from './hud.js';
import { Cmd } from '../wire/session.js';
import { selectedCrewCid, decodeDecks, decodeRooms } from '../wire/messages.js';
import { decksView } from './decks-model.js';
import { overviewScene, makeTransform, starLayerSvg } from './overview-scene.js';
import { pawnChip } from '../render/pawn-svg.js';
import {
  clockHHMM, cautionState, moraleColor, surnameOf, speedLabel, logLineParts, logTail,
  selectedRosterEntry, crewClickTarget, terminalList,
} from './console-model.js';
import {
  tileAt, overviewClickAction, lensSlotTint, currentRoom, deckPips, deckDelta,
  fmtO2, fmtCo2, fmtTemp, powerLabel, tabIsInert,
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

// ── keyed in-place reconciliation state (BUG-A fix) ──────────────────────────────────────────
// The HUD islands used to rebuild wholesale (`innerHTML =`) on EVERY coalesced wire rebroadcast
// (~1–5×/s). That tore down every button each frame, so the node under the pointer lost its
// hover/active/armed highlight and clicks that spanned a rebuild were swallowed (the "MOSS button
// doesn't work" report). Now the islands' skeletons are built ONCE (buildSkeleton) and the paint
// helpers MUTATE existing nodes through guarded setters; DOM is only created/removed/reordered when
// the underlying SET changes. Mirrors the console HUD's `reconcileRows` pattern (hud.js). The SVG
// scene (paintScene) is still rebuilt as one string — it holds no interactive focus (its clicks are
// one-shot, resolved synchronously before the next repaint).
const _el = {};                 // cached skeleton element references
const _pips = new Map();        // deck key → {el}
const _crew = new Map();        // cid key → {el, nameEl, roleEl, fill}
let _roBustCid = null;          // readout bust: whose portrait the <svg> currently holds
let _roTraitsKey = '';          // readout traits: the last-rendered trait set (rebuild only on change)
let _lastSpeed = '1×';          // last running speed label — shown (dimmed) while paused so the stepper never blanks

/** Guarded text write — no DOM mutation when the value is unchanged (keeps idle repaints inert). */
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }
/** Guarded className write. */
function setClassName(node, v) { if (node && node.className !== v) node.className = v; }
/** Guarded class toggle (no attribute churn when already in the wanted state). */
function setCls(node, cls, on) { if (node && node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on); }
/** Guarded hidden toggle. */
function setHidden(node, on) { if (node && node.hidden !== !!on) node.hidden = !!on; }
/** Guarded disabled toggle. */
function setDisabled(node, on) { if (node && node.disabled !== !!on) node.disabled = !!on; }

/** Keyed list reconcile: update in place, create/remove only on membership change, reorder with
 *  minimal moves. `container` holds ONLY the reconciled children. Mirrors hud.js reconcileRows. */
function reconcile(container, map, items, keyOf, make, update) {
  const seen = new Set();
  for (const it of items) {
    const k = keyOf(it);
    seen.add(k);
    let rec = map.get(k);
    if (!rec) { rec = make(it); map.set(k, rec); }
    update(rec, it);
  }
  for (const [k, rec] of Array.from(map)) {
    if (!seen.has(k)) { rec.el.remove(); map.delete(k); }
  }
  let cursor = container.firstElementChild;
  for (const it of items) {
    const el = map.get(keyOf(it)).el;
    if (el === cursor) { cursor = cursor.nextElementSibling; continue; }
    container.insertBefore(el, cursor);
  }
}

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
      // The drifting starfield: built ONCE here (not in the per-repaint scene) so its CSS drift is
      // never restarted by the scene's innerHTML rebuild. Sits above the nebula, below the stage.
      starLayerSvg() +
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

  buildIslands();

  // Map clicks: project + classify (IX-O-11..19). Only the scene surface routes here.
  _stage.addEventListener('click', onSceneClick);
  // HUD buttons: one delegated handler, ignoring the scene (which has its own above).
  _root.addEventListener('click', onHudClick);
}

/** Build each HUD island's inner DOM ONCE and cache node references. From here on the paint helpers
 *  mutate these nodes in place; only keyed lists (crew watch, deck rail) create/remove children. */
function buildIslands() {
  // top status bar — fixed structure, only text/classes change.
  //  · LLM chip (which mind is voicing the crew) — hidden until the first llmstatus lands.
  //  · SPEED is now an interactive « value » stepper (was a dead read-only chip): the value IS the
  //    reflected state and the arrows change it (mirrors the +/- keys → Cmd.speed(±1)).
  //  · PAUSE toggles between a loud "▶ RESUME" (with a .paused state class) and "❚❚ HOLD" so a
  //    paused ship unmistakably reads as "click again to resume".
  //  · CAUTION is now a button — clicking it opens the MOSS diagnostics screen (VS-O jump-to-fault).
  $('ov-topbar').innerHTML =
    '<span class="ov-ship">MSV PERILUNE</span>' +
    '<span class="ov-deckctx"></span><span class="ov-clock"></span><span class="ov-spacer"></span>' +
    '<span class="ov-chip ov-stores" data-ov-stores hidden ' +
      'title="Loose regolith aboard — the build material that feeds wall/door work. Wall ghosts starve at 0."></span>' +
    '<span class="ov-chip ov-llm" data-ov-llm hidden ' +
      'title="The AI mind voicing the crew (talk backend). Offline-safe."></span>' +
    '<span class="ov-speedctl" title="Simulation speed — click « / » or press − / +">' +
      '<button class="ov-spdbtn" data-ov-speed-dn aria-label="Slower">«</button>' +
      '<span class="ov-speedval"></span>' +
      '<button class="ov-spdbtn" data-ov-speed-up aria-label="Faster">»</button>' +
    '</span>' +
    '<button class="ov-chip ov-pause" data-ov-pause title="Pause / resume the simulation (Space)"></button>' +
    '<button class="ov-chip ov-caution" data-ov-caution ' +
      'title="Ship status at a glance — click to open MOSS diagnostics"></button>';
  _el.tbDeck = _root.querySelector('.ov-deckctx');
  _el.tbClock = _root.querySelector('.ov-clock');
  _el.tbStores = _root.querySelector('.ov-stores');
  _el.tbLlm = _root.querySelector('.ov-llm');
  _el.tbSpeedCtl = _root.querySelector('.ov-speedctl');
  _el.tbSpeedVal = _root.querySelector('.ov-speedval');
  _el.tbPause = _root.querySelector('.ov-pause');
  _el.tbCaution = _root.querySelector('.ov-caution');
  _el.tbCautionLevel = '';

  // deck rail — a keyed pip list, reconciled directly (all children are pips).
  _el.deckrail = $('ov-deckrail');

  // crew watch — fixed header + empty line, then a display:contents list of reconciled rows.
  $('ov-crewwatch').innerHTML =
    '<div class="ov-hdr"></div><div class="ov-empty" hidden>No souls aboard.</div>' +
    '<div class="ov-crewlist"></div>';
  _el.cwHdr = _root.querySelector('.ov-crewwatch .ov-hdr');
  _el.cwEmpty = _root.querySelector('.ov-crewwatch .ov-empty');
  _el.crewlist = _root.querySelector('.ov-crewlist');

  // selected readout — every part present but toggled; the actions row is stable (never rebuilt).
  $('ov-readout').innerHTML =
    '<div class="ov-hdr">SELECTED</div>' +
    '<div class="ov-empty ov-ro-empty">NO CREW SELECTED</div>' +
    '<div class="ov-guide ov-ro-guide">Click a pawn or a CREW WATCH row.</div>' +
    '<div class="ov-selrow ov-ro-sel" hidden>' +
      '<span class="ov-selbust"><svg viewBox="0 0 16 20"></svg></span>' +
      '<span class="ov-selname"><span class="ov-selN"></span><span class="ov-selR"></span></span>' +
    '</div>' +
    '<div class="ov-traits ov-ro-traits" hidden></div>' +
    '<div class="ov-task ov-ro-task" hidden></div>' +
    '<div class="ov-atmos ov-ro-atmos" hidden>' +
      '<div class="ov-atmos-lbl"></div>' +
      '<div class="ov-atmos-row"><span>ATMOS</span><span class="ov-atmos-v good ov-ro-atmosA"></span></div>' +
      '<div class="ov-atmos-row"><span>TEMP · POWER</span><span class="ov-atmos-v amber ov-ro-atmosB"></span></div>' +
    '</div>' +
    '<div class="ov-actions">' +
      '<button class="ov-act ov-talk" data-ov-talk>[T] OPEN CHANNEL — TALK</button>' +
      '<div class="ov-act-row">' +
        '<button class="ov-act" data-ov-move>[M] MOVE</button>' +
        '<button class="ov-act" data-ov-bio>[B] BIO</button>' +
      '</div>' +
    '</div>';
  _el.roEmpty = _root.querySelector('.ov-ro-empty');
  _el.roGuide = _root.querySelector('.ov-ro-guide');
  _el.roSel = _root.querySelector('.ov-ro-sel');
  _el.roBust = _root.querySelector('.ov-ro-sel .ov-selbust svg');
  _el.roName = _root.querySelector('.ov-selN');
  _el.roRole = _root.querySelector('.ov-selR');
  _el.roTraits = _root.querySelector('.ov-ro-traits');
  _el.roTask = _root.querySelector('.ov-ro-task');
  _el.roAtmos = _root.querySelector('.ov-ro-atmos');
  _el.roAtmosLbl = _root.querySelector('.ov-ro-atmos .ov-atmos-lbl');
  _el.roAtmosA = _root.querySelector('.ov-ro-atmosA');
  _el.roAtmosB = _root.querySelector('.ov-ro-atmosB');
  _el.roTalk = _root.querySelector('[data-ov-talk]');
  _el.roMove = _root.querySelector('[data-ov-move]');
  _el.roBio = _root.querySelector('[data-ov-bio]');

  // lens — a FIXED button set (membership never changes); only `.on` toggles.
  $('ov-lens').innerHTML = '<div class="ov-hdr">LENS</div><div class="ov-lensrow">' +
    LENSES.map((name, i) => '<button class="ov-lensbtn" data-ov-lens="' + name + '">' +
      (i + 1) + ' ' + LENS_SHORT[i] + '</button>').join('') + '</div>';
  _el.lensBtns = Array.from(_root.querySelectorAll('.ov-lensbtn'));

  // command bar — the BUILD tab + a FIXED tab set. Building is ZOOM-ONLY: walls/floors are placed
  // INSIDE a room (the Room Zoom), never on the ship schematic, so the BUILD tab carries no tile-build
  // tools — just a hint pointing the player into a room. (＋ADD ROOM to open a new hall still lives on
  // the scene's hall slots.)
  $('ov-cmd').innerHTML =
    '<div class="hud ov-place" hidden><span class="ov-hdr">BUILD ▸</span>' +
      '<span class="ov-buildhint">CLICK A ROOM TO BUILD INSIDE IT · ＋ADD ROOM OPENS A NEW HALL</span></div>' +
    '<div class="hud ov-tabs">' + OV_TABS.map(([key, label]) =>
      '<button class="ov-tab" data-ov-tab="' + key + '">' + esc(label) + '</button>').join('') + '</div>';
  _el.place = _root.querySelector('.ov-place');
  _el.toolBtns = []; // no tile-build tools on the Overview — building is zoom-only
  _el.tabBtns = Array.from(_root.querySelectorAll('.ov-tab'));

  // sensor log — a fixed header + 5 fixed line slots (each ts span + rest span), toggled/updated.
  let slots = '<div class="ov-hdr"></div>';
  for (let i = 0; i < 5; i++) slots += '<div class="ov-logline" hidden><span class="ov-ts"></span><span class="ov-rest"></span></div>';
  $('ov-sensor').innerHTML = slots;
  _el.sensorHdr = _root.querySelector('.ov-sensor .ov-hdr');
  _el.sensorLines = Array.from(_root.querySelectorAll('.ov-sensor .ov-logline')).map((line) => ({
    el: line, ts: line.querySelector('.ov-ts'), rest: line.querySelector('.ov-rest'),
  }));
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
    terminals: terminalList(Hud.getTerminals()),
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
  setText(_el.tbDeck, 'DECK ' + activeDeck + (total ? ' OF ' + total : ''));
  setText(_el.tbClock, 'DAY ' + day + ' · ' + clock);
  // (1) PAUSE — text AND a strong state class so a paused ship reads unmistakably as "resume me".
  setText(_el.tbPause, paused ? '▶  RESUME' : '❚❚  HOLD');
  setCls(_el.tbPause, 'paused', paused);
  // (2) SPEED — the value IS the state; keep the last running tier visible (dimmed) while paused.
  if (status && status.speed && status.speed !== 'paused') _lastSpeed = speed;
  setText(_el.tbSpeedVal, paused ? _lastSpeed : speed);
  setCls(_el.tbSpeedCtl, 'dim', paused);
  // (3) CAUTION — idle reads "SYSTEMS NOMINAL" (the bare word "NOMINAL" confused players); the
  //     title spells out the meaning and the chip is clickable → MOSS (see onHudClick).
  setText(_el.tbCaution, c.level === 'idle' ? 'SYSTEMS NOMINAL' : c.label);
  if (c.level !== _el.tbCautionLevel) { // caution ramp class: swap only when the level changes
    setClassName(_el.tbCaution, 'ov-chip ov-caution' + (c.level ? ' ' + c.level : ''));
    _el.tbCautionLevel = c.level;
  }
  // (4) LLM — which mind voices the crew; hidden until the first llmstatus lands.
  paintLlmChip();
  // STORES — loose regolith aboard; the currency that gates building. Empty reads as a live warning
  // (a starved wall ghost otherwise sits forever with nothing in the HUD saying why).
  paintStoresChip(metrics);
}

/** The STORES chip: loose build-material stock; hidden until metrics carries it, red/pulse at 0. */
function paintStoresChip(metrics) {
  const reg = metrics && typeof metrics.regolith === 'number' ? metrics.regolith : null;
  if (reg == null) { setHidden(_el.tbStores, true); return; }
  setText(_el.tbStores, '◆ REGOLITH ' + reg);
  setCls(_el.tbStores, 'empty', reg <= 0);
  setHidden(_el.tbStores, false);
}

/** The top-bar LLM chip: backend name (+ degraded flag + hourly cost), or hidden when unknown. */
function paintLlmChip() {
  const llm = Hud.getLlm();
  const backend = llm && llm.backend;
  if (!backend) { setHidden(_el.tbLlm, true); return; }
  const cost = (typeof llm.costPerHour === 'number' && isFinite(llm.costPerHour) && llm.costPerHour > 0)
    ? ' · $' + llm.costPerHour.toFixed(2) + '/h' : '';
  setText(_el.tbLlm, '◈ ' + String(backend).toUpperCase() + (llm.degraded ? ' ⚠ FALLBACK' : '') + cost);
  setCls(_el.tbLlm, 'degraded', !!llm.degraded);
  setHidden(_el.tbLlm, false);
}

// ── deck rail ──

function paintDeckRail(dView, activeDeck) {
  const pips = deckPips(dView, activeDeck);
  reconcile(_el.deckrail, _pips, pips, (p) => String(p.deck),
    (p) => {
      const b = document.createElement('button');
      b.className = 'ov-pip';
      b.dataset.ovDeck = String(p.deck);
      b.textContent = String(p.deck);
      return { el: b };
    },
    (rec, p) => setCls(rec.el, 'on', p.active));
}

// ── left CREW WATCH dock ──

function paintCrewWatch(crew, selCid) {
  setText(_el.cwHdr, 'CREW WATCH — ' + crew.length + ' SOUL' + (crew.length === 1 ? '' : 'S'));
  setHidden(_el.cwEmpty, crew.length !== 0);
  // Rows are created ONCE per cid and mutated in place — the portrait <svg> is never refetched and a
  // hovered/selected row survives the ~2/s roster rebroadcast. Membership change alone adds/removes.
  reconcile(_el.crewlist, _crew, crew, (e) => String(e.cid),
    (e) => {
      const b = document.createElement('button');
      b.className = 'ov-crew';
      b.dataset.ovCrew = String(e.cid);
      b.innerHTML =
        '<span class="ov-bust"><svg viewBox="0 0 16 20">' + pawnChip({ cid: e.cid, role: e.role }) + '</svg></span>' +
        '<span class="ov-crewcol">' +
          '<span class="ov-crewname"></span><span class="ov-crewrole"></span>' +
          '<span class="ov-morale"><span class="ov-morale-fill"></span></span>' +
        '</span>';
      return {
        el: b,
        nameEl: b.querySelector('.ov-crewname'),
        roleEl: b.querySelector('.ov-crewrole'),
        fill: b.querySelector('.ov-morale-fill'),
      };
    },
    (rec, e) => {
      setText(rec.nameEl, surnameOf(e.name));
      setText(rec.roleEl, e.role || '');
      const mv = Math.max(0, Math.min(1, e.morale || 0));
      const w = Math.round(mv * 100) + '%';
      if (rec.fill.style.width !== w) rec.fill.style.width = w; // in-place → the width transition animates
      const color = moraleColor(mv);
      if (rec.fill.style.background !== color) rec.fill.style.background = color;
      setCls(rec.el, 'sel', selCid != null && e.cid === selCid);
    });
}

// ── right SELECTED readout ──

function paintReadout(frame, rosterMsg, dView, activeDeck) {
  const sel = selectedRosterEntry(frame, rosterMsg);
  // The empty↔selected states, the traits, task and atmos box are all pre-built and toggled — the
  // TALK/MOVE/BIO buttons are never rebuilt, so an armed/hovered action survives every repaint.
  const has = !!sel;
  setHidden(_el.roEmpty, has);
  setHidden(_el.roGuide, has);
  setHidden(_el.roSel, !has);
  setDisabled(_el.roTalk, !has);
  setDisabled(_el.roMove, !has);
  setDisabled(_el.roBio, !has);
  if (!has) {
    setHidden(_el.roTraits, true);
    setHidden(_el.roTask, true);
    setHidden(_el.roAtmos, true);
    _roBustCid = null; _roTraitsKey = '';
    return;
  }
  const tile = crewClickTarget(frame, sel);
  const entry = (dView || []).find((d) => d.deck === activeDeck);
  const room = (sel.deck === activeDeck && entry) ? currentRoom(tile, entry.slots) : null;
  const roomName = room ? room.displayName : '—';
  // bust portrait — replace the <svg> body only when the selected crew changes (no per-frame refetch)
  if (String(sel.cid) !== _roBustCid) {
    _el.roBust.innerHTML = pawnChip({ cid: sel.cid, role: sel.role });
    _roBustCid = String(sel.cid);
  }
  setText(_el.roName, sel.name || '');
  setText(_el.roRole, [sel.role, roomName].filter(Boolean).join(' · '));
  // traits — rebuilt only when the trait set changes (cheap and keeps the chips stable otherwise)
  const traits = Array.isArray(sel.traits) ? sel.traits : [];
  const tkey = traits.join('');
  if (tkey !== _roTraitsKey) {
    _el.roTraits.innerHTML = traits.map((t) => '<span class="ov-trait">' + esc(t) + '</span>').join('');
    _roTraitsKey = tkey;
  }
  setHidden(_el.roTraits, traits.length === 0);
  setText(_el.roTask, '> ' + (sel.task || ''));
  setHidden(_el.roTask, false);
  if (room && room.atmos) {
    const a = room.atmos;
    setText(_el.roAtmosLbl, 'CURRENT ROOM · ' + roomName);
    setText(_el.roAtmosA, fmtO2(a.o2) + ' O₂ · ' + fmtCo2(a.co2ppm) + ' CO₂');
    setText(_el.roAtmosB, fmtTemp(a.tempK) + ' · ' + powerLabel(room.active));
    setHidden(_el.roAtmos, false);
  } else {
    setHidden(_el.roAtmos, true);
  }
}

// ── bottom-left LENS ──

function paintLens(activeLens) {
  for (const b of _el.lensBtns) setCls(b, 'on', b.dataset.ovLens === activeLens);
}

// ── bottom-centre command bar (PLACE palette + tabs) ──

function paintCommand() {
  const tab = Hud.getTab();
  const armed = Hud.getArmedTool();
  setHidden(_el.place, tab !== 'build'); // the PLACE palette only exists on the BUILD tab
  for (const b of _el.toolBtns) setCls(b, 'on', armed === b.dataset.ovTool);
  for (const b of _el.tabBtns) setCls(b, 'on', tab === b.dataset.ovTab);
}

// ── bottom-right SENSOR LOG ──

function paintSensor() {
  const tail = logTail(Hud.getLog(), 5);
  setText(_el.sensorHdr, 'SENSOR LOG — LAST ' + tail.length);
  const slots = _el.sensorLines;
  if (!tail.length) { // the honest empty state, reusing slot 0
    const s0 = slots[0];
    setHidden(s0.el, false);
    setCls(s0.el, 'ov-faint', true);
    setHidden(s0.ts, true);
    setText(s0.ts, '');
    setText(s0.rest, '— no events yet —');
    for (let i = 1; i < slots.length; i++) setHidden(slots[i].el, true);
    return;
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (i >= tail.length) { setHidden(s.el, true); continue; }
    const p = logLineParts(tail[i]);
    setHidden(s.el, false);
    setCls(s.el, 'ov-faint', false);
    if (p.ts) {
      setHidden(s.ts, false);
      setText(s.ts, p.ts);
      setCls(s.ts, 'new', i === tail.length - 1); // the freshest line's stamp glows
      setText(s.rest, ' ' + p.rest); // the space the one-string form put between stamp and body
    } else {
      setHidden(s.ts, true);
      setText(s.ts, '');
      setText(s.rest, p.rest);
    }
  }
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
    // No 'build' case — building is zoom-only (walls/floors are placed in the Room Zoom). The
    // Overview never sends Cmd.build; overviewClickAction never returns 'build'.
    case 'move': {
      const t = pointToTile(svg, e);
      if (t) { _send(Cmd.cursor(t.x, t.y)); _send(Cmd.move()); Hud.toolUsed('move', t.x, t.y); }
      break;
    }
    case 'select': Hud.selectCrewByCid(action.cid); break;
    case 'terminal': Hud.selectTab('moss'); break; // clicking a console on the map opens MOSS (IX-M1)
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
  const term = target.closest('.pl-terminal');
  if (term && term.dataset.tid != null) return { terminalId: term.dataset.tid };
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
  else if (d.ovTab != null) { if (!tabIsInert(d.ovTab)) Hud.selectTab(d.ovTab); } // CHRONICLE kept but inert
  else if (d.ovTool != null) { Hud.armTool(d.ovTool); }
  else if (d.ovCrew != null) { Hud.selectCrewByCid(d.ovCrew); }
  else if ('ovSpeedDn' in d) { _send(Cmd.speed(-1)); }
  else if ('ovSpeedUp' in d) { _send(Cmd.speed(1)); }
  else if ('ovCaution' in d) { Hud.selectTab('moss'); } // ship-status chip → MOSS diagnostics
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
