// HTML chrome — "The Console" skin (P2.1). Owns every DOM write outside the canvas: the top bar
// (deck stepper, clock, pause/speed chips, caution chip, LLM chip), the CREW WATCH sidebar, the
// READOUT panel (+ ship vitals), the bottom console (tabs BUILD/CREW/MOSS/CHRONICLE, build
// palette, lens select, sensor log), the stage overlays (inspect card, legend card, hint line,
// placement pulse), and the floating P2 panels (dialogue window, citizen card, MOSS terminal).
//
// All non-trivial derivations are PURE in console-model.js (node-tested); this file is DOM glue.
// State model (IX-1..3): the wire is authoritative for everything it carries; the only client-
// latched state here is the armedTool slot, the active tab, panel positions, the citizen cache,
// and the two transient acknowledgments (placement pulse, pending row style).

import { PanelManager } from './panels.js';
import { initChatState, reduceChat, getSession, sessionModel, chatPanelAction } from './chat.js';
import { portraitRegistry } from '../../assets/portraits-registry.js';
import { Cmd } from '../wire/session.js';
import { selectedCrewCid } from '../wire/messages.js';
import { transform } from '../render/camera.js';
import {
  clockHHMM, cautionState, moraleColor, surnameOf, surnameFirst, crewInitials, crewHue,
  speedLabel, logLineParts, logTail, soulsLabel, selectedRosterEntry, crewClickTarget,
  beginPendingClick, resolvePendingClick, supersedePending, nextArmedTool, isPaletteTool,
  hintLine, chronHeader,
  designsOnDeck, designGlyph, ghostLabel, nextNudge, nudgeVisible, NUDGE_MS, moreBelow,
  terminalList, terminalLabel, escapeTarget, workMarkers, watchTask,
} from './console-model.js';
import { edgesOf, regardRows } from './relations-model.js';
import {
  STOCK_KINDS, defaultStockFilter, stockKindAccepted, toggleStockKind, stockFilterLabel,
} from './stock-filter-model.js';
import { MossScreen } from './moss-screen.js';

const METRIC_DEFS = [
  ['power', 'Power'], ['oxygen', 'Oxygen'], ['water', 'Water'], ['food', 'Food'],
  ['heat', 'Heat'], ['structural', 'Structure'], ['morale', 'Morale'],
];

const IDLE_HINT = 'LIVE SPRITE FEED · CLICK DECK TO SELECT · DRAG TO PAN';

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function setChip(id, v) { $(id).textContent = v; }

function barColor(v) { return v >= 0.66 ? 'var(--good)' : v >= 0.33 ? 'var(--warn)' : 'var(--bad)'; }
const now = () => Date.now();

// ---- console state (client-latched by design; everything else renders from the wire) ----
let _send = () => {};
let _getCanvas = () => null; // getter: the canvas element is REPLACED on a WebGL2→2D fallback
let _camera = null;
let _frame = null;        // latest frame message (authoritative selection/deck/lens)
let _roster = null;       // latest roster message (authoritative crew list)
let _chron = null;        // latest chron message
let _relations = null;    // latest relations message (directed opinion graph → the RELATIONS web)
let _armed = null;        // the ONE input-mode slot: null|'wall'|'door'|'cancel'|'dig'|'stockpile'|'strip'|'move'
// E0-4 WP-5: the accept-mask the STOCKPILE tool paints with. A PREFERENCE, not part of the armed
// transition — like the Room Zoom's material picker it survives disarm, tab switches and Escape, so
// a player who set "FOOD only" does not silently get accept-all back after one Esc. Deliberately not
// touched by nextArmedTool (console-model.js needs no change for it).
let _stockFilter = defaultStockFilter();
let _tab = 'build';       // active bottom-bar tab (presentation only, IX-20)
let _pending = null;      // pending cross-deck row click (IX-42)
let _chronRequested = false; // CHRONICLE requests once per connection (IX-74)
let _designs = null;      // latest designs message (pending build ghosts)
let _terminals = null;    // latest terminals message (MOSS directory)
let _systems = null;      // latest systems message (the MOSS ledger channel)
let _decks = null;        // latest decks message (per-deck compartment grid → warm SVG Overview)
let _rooms = null;        // latest rooms message (per-room atmosphere)
let _decor = null;        // latest decor message (cosmetic view-only furniture layer)
let _materials = null;    // latest materials message (sparse wall/floor material variants → tile skins)
let _zones = null;        // latest zones message (sparse stockpile zones: accept mask + back-off bit)
let _marks = null;        // latest marks message (sparse debris/dig/stockpile/strip mark layer)
let _items = null;        // latest items message (sparse ground item stacks: kind + COUNT per stack)
let _ledger = null;       // latest ledger message (E0-8: matter census + the runway/rate members)
let _devices = null;      // latest devices message (sparse per-device wear: kind + CONDITION + oper)
let _blocked = null;      // latest blocked message (sparse refused orders: which order, and WHY)
let _work = null;         // latest work message (M2-4: per-citizen manual work priorities; absent = off)
let _workCaps = null;     // latest workcaps message (M3-7: per-citizen skills + the incapability mask)
let _ending = null;       // latest ending message (M3-5: the emergency-thaw grace line / the lose state)
let _alerts = null;       // latest alerts message (D2: the standing one-line warning bar; '' = all quiet)
let _moss = null;         // the MOSS terminal (created on the first MOSS-tab activation)
let _paused = false;      // last status.paused (for the paused nudge)
let _nudge = { shownAt: null }; // paused-nudge state (nextNudge/nudgeVisible)
let _nudgeTimer = 0;      // pending auto-dismiss timeout id
const _citizens = new Map(); // cid → last citizen msg (IX-50/53; never purged, IX-98)
// Caches for the Overview surface (overview-view.js). The console renders status/metrics/log
// straight to DOM; the Overview needs the last values too, so they are also retained here and read
// through the getters below. Additive — the console's own rendering is unchanged.
let _status = null;       // last status message
let _metrics = null;      // last metrics message
let _log = null;          // last sensor-log lines
let _llm = null;          // last llmstatus message (backend/degraded/cost — surfaced in the Overview top bar)
let _connected = true;    // last connection state

// The Overview subscribes here; every wire dispatch that moves a ship-surface input notifies it so
// it repaints (throttled its own side). One shared tab/armed/selection/cache truth, two renders.
const _shipSubs = [];
/** Register a callback fired after each ship-surface-relevant wire dispatch (Overview repaint). */
export function onShipUpdate(fn) { if (typeof fn === 'function') _shipSubs.push(fn); }
function notifyShip() { for (const fn of _shipSubs) { try { fn(); } catch (e) { /* isolate */ } } }

// ---- read-only accessors for the Overview (the wire is authoritative; these expose the caches) ----
export function getFrame() { return _frame; }
export function getRoster() { return _roster; }
export function getDecks() { return _decks; }
export function getRooms() { return _rooms; }
export function getDesigns() { return _designs; }
export function getTerminals() { return _terminals; }
export function getDecor() { return _decor; }
export function getMaterials() { return _materials; }
/** The cached `zones` message (sparse stockpile zones), for the standard surface's zone overlay. */
export function getZones() { return _zones; }
/** The cached `marks` message (the sparse debris/dig/stockpile/strip mark layer), for the mark layer
 *  on BOTH standard surfaces. It replaces reading the projected `cell[1]` byte off `getFrame()`,
 *  which no later GlyphMapper pass can be stopped from overwriting. */
export function getMarks() { return _marks; }
/** The cached `items` message (the sparse ground item stacks), for the Room Zoom's item layer. It
 *  replaces reading a ground stack off the frame's glyph byte, which cannot carry the COUNT at all,
 *  keeps only the LAST stack on a tile, and is overwritten wholesale by any device on that tile
 *  (`GlyphMapper` passes 3 and 4 — `hosts/web/WireFormat.Items.cs`). */
export function getItems() { return _items; }
/** The cached `devices` message (the sparse per-device wear layer): kind, CONDITION (0..255) and the
 *  sim's own `oper` bit per tile-resident device. `Device.Condition` reaches the client on this
 *  channel and NOWHERE ELSE — the projection's only trace of it is a `GlyphColor.Broken` foreground
 *  byte that neither standard surface reads, that carries one bit rather than a gradient, and that
 *  `GlyphMapper` pass 5 overwrites whenever a crew member stands on the tile
 *  (`hosts/web/WireFormat.Devices.cs`). Utility overlays (Conduit/Pipe) are absent host-side. */
export function getDevices() { return _devices; }
/** The cached `blocked` message (the sparse refused-order layer): for each dig/strip/build site the
 *  player queued that the sim's worksite staging rule refuses, WHICH order it is and WHY it is stuck.
 *  There is no other route to this fact — `CanStageWorkerAt` is a live predicate the sim asks and
 *  discards, it stamps nothing on the tile, and the frame carries no trace of a refusal at all. The
 *  refusal is otherwise completely silent, which is what makes a stuck order indistinguishable from a
 *  broken verb (`hosts/web/WireFormat.Blocked.cs`). */
export function getBlocked() { return _blocked; }
/** The cached `work` message (M2-4): one row per switched-ON (crew member, work type) pair,
 *  `[cid, workType, priority]` with **1 the HIGHEST** priority. There is no other route to this fact —
 *  a work priority is per-PERSON state with no tile to be projected onto, so unlike `marks` or `items`
 *  this is not a better source for something the frame carried badly; the frame never carried it at all
 *  (`hosts/web/WireFormat.Work.cs`).
 *  ⚠️ ABSENT = OFF, and an EMPTY payload is the normal boot state: OD-H makes work opt-in, so nothing
 *  is enabled until the player says so. A reader must not treat `[]` as "no data yet". */
export function getWork() { return _work; }
/** ⭐ The cached `workcaps` message (M3-7): one row per LIVING crew member, `[cid, s0..s5,
 *  incapableMask]` — what she is GOOD at (levels 0..20 in WorkType value order) and what she CANNOT do
 *  at all (`Citizen.WorkIncapable`'s own byte, copied by the host rather than re-derived).
 *  ⚠️ DENSE WHERE `work` IS SPARSE: a crew member with nothing switched on STILL HAS A ROW, which
 *  under OD-H is the boot state and therefore the default case. An empty `cells` means "no living
 *  crew", never "no data yet".
 *  ⛔ `incapableMask` IS NOT "priority 0" — a fact about the PERSON versus an order from the PLAYER.
 *  On the sparse `work` channel the two are indistinguishable by construction, which is why this
 *  channel exists; a reader that collapses them has thrown the fact away. RimWorld draws a disabled
 *  cell BLANK and an incapable one as NO CELL AT ALL — the rendering is ABSENCE, not decoration, and
 *  it is M3-12's to draw (`hosts/web/WireFormat.WorkCaps.cs`). */
export function getWorkCaps() { return _workCaps; }
/** The cached `ledger` message (E0-8): the matter census plus PARTS/DAY, DAYS OF WATER and DAYS OF
 *  AIR, each with the host's own derivation note. Read by the Overview's LEDGER island.
 *  ⚠️ HONOUR THE SENTINELS — `window === 0` means every rate on the payload is meaningless, and a
 *  negative runway means NOT DEPLETING, not "missing". Rendering either as a zero would put a
 *  confident wrong number on screen, which is the exact defect this channel exists to remove. */
export function getLedger() { return _ledger; }
/** M3-5, the `ending` channel: `{text, over}`. `text === ''` means the run is ordinary and the bar
 *  is hidden; `over` is the sim's own `CryoSystem.RunEnded`, NOT something to infer from the prose. */
export function getEnding() { return _ending; }
/** D2, the `alerts` channel: `{text}`. `text === ''` means the ship has nothing to warn about and the
 *  bar is hidden — "all quiet" is a STATE the wire expresses, never an absence the client infers from
 *  a channel that stopped arriving. Today the only alert is the thaw ladder decaying (a capsule
 *  within a sim-day of its next band edge); M5-2/T17 turns `text` into a list. */
export function getAlerts() { return _alerts; }
export function getStatus() { return _status; }
export function getMetrics() { return _metrics; }
export function getLog() { return _log; }
export function getLlm() { return _llm; }
export function getTab() { return _tab; }
/** The cached `relations` message (the directed opinion graph), for the RELATIONS surface + tests. */
export function getRelations() { return _relations; }
export function isConnected() { return _connected; }
export function isMossActive() { return !!(_moss && _moss.isOpen()); }
export function getSelectedEntry() { return selectedRosterEntry(_frame, _roster); }

// ---- action seams the Overview lowers to (reusing the ONE armed-tool/tab/selection machinery) ----
/** Public tab switch (Overview command-bar tabs reuse the console's `setTab`). */
export function selectTab(tab) { setTab(tab); }
/** Toggle-arm a tool from the Overview PLACE palette / MOVE button (mirrors the console palette). */
export function armTool(kind) {
  _armed = nextArmedTool(_armed, { t: 'toggle', tool: kind });
  if (isPaletteTool(_armed) && _tab !== 'build') setTab('build');
  if (_armed != null) nudgeIfPaused();
  reflectArmed();
  notifyShip();
}
/** Select a crew member by cid through the ONE shared selection flow (same as a CREW WATCH row). */
export function selectCrewByCid(cid) { selectCrew(Number(cid)); }
/** Open a channel with the currently selected crew (Overview [T] TALK). */
export function talkSelectedCrew() { const cid = selectedCrewCid(_frame); if (cid != null) _send(Cmd.talk(cid)); }
/** Open the biography card for the selected crew (Overview [B] BIO), enabled iff cached. */
export function openBioForSelected() {
  const sel = selectedRosterEntry(_frame, _roster);
  if (!sel || !_citizens.has(sel.cid)) return;
  _send(Cmd.bio(sel.cid));
  panels().citizen(enrichCitizen(_citizens.get(sel.cid)), PORTRAIT_REGISTRY);
}

/** Join the roster + relations caches onto a raw `citizen` payload so the DOSSIER card can show the
 *  REAL current-task and directed relationships (which ride other channels) — the wire's `citizen`
 *  message itself carries only role/mood/traits/log today. Presentation-only.
 *
 *  ⚠️ THIS LINE USED TO SAY "REAL morale/current-task" AND THE `morale` HALF WAS FALSE (M1-F,
 *  2026-07-29). `Citizen.Morale` is carried by the wire but no system in `sim/` ever changes it, so
 *  it is a CONSTANT, not a reading — and the dossier's MORALE meter has been removed. This ledger is
 *  corrected even though `hud.js` is the deprecated console shell and is closed to new work, because
 *  it is not a console ledger: `openBioForSelected` above is the STANDARD surface's [B] BIOGRAPHY
 *  button (`overview-view.js`'s `ovBio` → here → `panels().citizen(...)`), so this sentence
 *  describes the SAME card `panels.js`'s REAL/SAMPLE ledger describes. M1-F's `hud.js` exclusion
 *  covers DRAW SITES and the equality-pinned widget census — and that census reads `codeOnly(raw)`,
 *  so it is comment-blind and this edit cannot move it (measured: 1004/1004, census unchanged).
 *
 *  The `morale:` join below is KEPT and is currently DEAD: the console dock, CREW table and readout
 *  all read `entry.morale` straight off the roster, and `panels.js` was its only consumer. It stays
 *  because the field is saved-and-hashed sim state whose future is an open M4-4 decision — if morale
 *  is ever made real, this is where the dossier reads it — and because removing it is a change to a
 *  surface scheduled for deletion at M4-8/WP-9. Dead-and-deliberate, not overlooked. */
function enrichCitizen(cit) {
  if (!cit || cit.cid == null) return cit;
  const crew = _roster && Array.isArray(_roster.crew) ? _roster.crew : [];
  const sel = crew.find((e) => e.cid === cit.cid);
  const nameByCid = (id) => { const c = crew.find((e) => e.cid === id); return c ? c.name : ('#' + id); };
  const { outgoing, incoming } = regardRows(edgesOf(_relations), cit.cid);
  const relations = [
    ...outgoing.map((r) => ({ dir: 'out', name: nameByCid(r.cid), opinion: r.opinion, note: r.note })),
    ...incoming.map((r) => ({ dir: 'in', name: nameByCid(r.cid), opinion: r.opinion, note: r.note })),
  ];
  return Object.assign({}, cit, {
    morale: sel && typeof sel.morale === 'number' ? sel.morale : cit.morale,
    task: cit.task != null ? cit.task : (sel ? sel.task : undefined),
    relations,
  });
}

/** @param {import('../wire/messages.js').MetricsMsg} m */
export function renderMetrics(m) {
  const el = $('metrics'); let html = '';
  for (const [k, label] of METRIC_DEFS) {
    const v = Math.max(0, Math.min(1, m[k] || 0)); const pct = Math.round(v * 100);
    html += `<div class="metric"><div class="row"><span>${label}</span><span>${pct}%</span></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%;background:${barColor(v)}"></div></div></div>`;
  }
  const co2 = Math.round(m.co2ppm || 0);
  html += `<div class="metric"><div class="row"><span>CO₂ worst</span><span>${co2} ppm</span></div>` +
    `<div class="track"><div class="fill" style="width:${Math.min(100, co2 / 20)}%;background:${co2 > 2000 ? 'var(--bad)' : co2 > 1000 ? 'var(--warn)' : 'var(--good)'}"></div></div></div>`;
  el.innerHTML = html;
  _metrics = m;
  // Top-bar clock (IX-81): day verbatim (0-based, matches the log channel's D<day.dd>), HH:MM
  // from dayFrac. Caution chip (IX-84): derived, display-only, ~1 Hz with metrics.
  setChip('s-day', 'DAY ' + m.day + ' · ' + clockHHMM(m.dayFrac || 0));
  const c = cautionState(m);
  const chip = $('s-caution');
  if (chip) { chip.className = 'caution ' + c.level; chip.textContent = c.label; }
  notifyShip();
}

/** Sensor log (IX-90): last 5 lines, leading D-token wrapped in .ts (newest tinted via CSS). Also
 *  the MOSS FAULT LOG's live section (spec §2 `reduceLog`), which wants the message not the tail. */
export function renderLog(lines) {
  _log = Array.isArray(lines) ? lines : [];
  if (_moss) _moss.onLog({ type: 'log', lines: _log });
  const tail = logTail(lines, 5);
  const el = $('log');
  el.innerHTML = tail.length
    ? tail.map((l) => {
      const p = logLineParts(l);
      return p.ts
        ? `<div class="line"><span class="ts">${esc(p.ts)}</span> ${esc(p.rest)}</div>`
        : `<div class="line">${esc(p.rest)}</div>`;
    }).join('')
    : '<div class="line" style="color:var(--faint)">— no events yet · unpause or speed up to run the ship —</div>';
  el.scrollTop = el.scrollHeight;
  notifyShip();
}

export function renderLegend(lines) {
  lines = lines || [];
  $('legend').innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
}

export function renderInspect(lines) {
  lines = lines || [];
  $('inspect').innerHTML = lines.map((l, i) => `<div class="l${i === 0 ? 0 : 1}">${esc(l)}</div>`).join('');
}

/** @param {import('../wire/messages.js').StatusMsg} m */
export function renderStatus(m) {
  _status = m;
  $('s-speed').textContent = speedLabel(m.speed);
  $('s-msg').textContent = m.text || '';
  const dot = $('s-runstate');
  dot.className = m.paused ? 'paused-dot' : 'run-dot';
  const label = $('s-pauselabel');
  if (label) label.textContent = m.paused ? '► RUN' : '‖ HOLD';
  $('b-pause').classList.toggle('paused', m.paused);
  // While paused the speed chip shows the wire label ("paused") dimmed — the pause chip one
  // control over already carries the glyph; duplicating ‖ would be noise.
  const speedChip = $('s-speedchip');
  if (speedChip) speedChip.classList.toggle('dim', !!m.paused);
  // Paused-nudge bookkeeping: resuming the ship dismisses the "PRESS SPACE" hint immediately.
  const wasPaused = _paused;
  _paused = !!m.paused;
  if (wasPaused && !_paused) { _nudge = nextNudge(_nudge, { t: 'unpause' }, now()); paintNudge(); }
  notifyShip();
}

/** Reflect the active lens on the legend card + lens buttons when a frame lands. */
export function reflectLens(lens) {
  $('legendcard').style.display = lens === 'none' ? 'none' : 'block';
  document.querySelectorAll('#lensbtns button').forEach((b) =>
    b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.lens === lens));
}

export const LENSES = ['none', 'pressure', 'oxygen', 'co2', 'temperature', 'power', 'water'];
const LENS_SHORT = ['∅', 'PRES', 'O₂', 'CO₂', 'TEMP', 'PWR', 'H₂O'];

/** Build the 7 lens buttons (IX-91: the printed digit IS the hotkey); onLens(name) on click. */
export function buildLensButtons(onLens) {
  const wrap = $('lensbtns');
  LENSES.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} ${LENS_SHORT[i]}`;
    b.onclick = () => onLens(name);
    b.dataset.lens = name; wrap.appendChild(b);
  });
}

// ==== The Console (P2.1) ====

/**
 * Wire the console chrome. Called once from main.js after the DOM exists.
 * @param {{send:(o:object)=>void, getCanvas:()=>HTMLCanvasElement, camera:object}} opts
 */
export function initConsole(opts) {
  _send = opts.send || (() => {});
  _getCanvas = opts.getCanvas || (() => null);
  _camera = opts.camera || null;

  // Bottom-bar tabs (IX-70; IX-R1): BUILD · CREW · MOSS · CHRONICLE · RELATIONS. Append-ready.
  const TABS = [['build', 'BUILD'], ['crew', 'CREW'], ['moss', 'MOSS'], ['chron', 'CHRONICLE'], ['relations', 'RELATIONS']];
  const tabs = $('tabs');
  for (const [key, label] of TABS) {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.tab = key; b.textContent = label;
    b.onclick = () => setTab(key);
    tabs.appendChild(b);
  }

  // Build palette (IX-21/31): WALL / DOOR / ⌫ CANCEL, plus the E0-3 order verbs ⛏ DIG and
  // ▤ STOCKPILE. Cancel is not demolition. DIG and STOCKPILE are ORDERS, not construction — they
  // mark work for the crew rather than spending material — but they share this palette because
  // they share the one armed-tool slot and the same click-a-tile gesture.
  const TOOLS = [
    ['wall', 'WALL', ''],
    ['door', 'DOOR', ''],
    ['dig', '⛏ DIG', 'Mark rubble for the crew to clear (G)'],
    ['stockpile', '▤ STOCKPILE', 'Zone a floor tile as a haul destination (Z)'],
    ['strip', '✂ STRIP', 'Mark a wall or machine to deconstruct for salvage (V)'],
    ['cancel', '⌫ CANCEL', 'Cancel a queued build order (refunds staged material)'],
  ];
  const pal = $('palette');
  for (const [kind, label, title] of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool' + (kind === 'cancel' ? ' tool-cancel' : '');
    b.dataset.tool = kind; b.textContent = label;
    if (title) b.title = title;
    b.onclick = () => {
      _armed = nextArmedTool(_armed, { t: 'toggle', tool: kind });
      if (_armed != null) nudgeIfPaused();
      reflectArmed();
    };
    pal.appendChild(b);
  }

  // E0-4 WP-5: the stockpile ACCEPT-filter chips — one per ItemKind, reusing the .tool/.tool.on
  // chip because a filter toggle IS an on/off tool. They are real <button>s, so they sit in the
  // console's natural tab order and Enter/Space activate them natively (controls.js already stands
  // down for both on a focused BUTTON). No new global hotkey: digits 1–7 are the LENS keys, and Z
  // still arms the tool — the row it reveals is then keyboard-reachable.
  const sf = $('stockfilter');
  for (const { kind, label } of STOCK_KINDS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.kind = String(kind);
    b.textContent = label;
    b.title = 'Accept ' + label + ' in stockpiles painted from now on';
    b.onclick = () => { _stockFilter = toggleStockKind(_stockFilter, kind); reflectArmed(); };
    sf.appendChild(b);
  }

  // Readout actions (IX-51/52/53).
  $('b-talk').onclick = () => {
    const cid = selectedCrewCid(_frame);
    if (cid != null) _send(Cmd.talk(cid));
  };
  $('b-move').onclick = () => {
    _armed = nextArmedTool(_armed, { t: 'toggle', tool: 'move' });
    if (_armed != null) nudgeIfPaused();
    reflectArmed();
  };
  $('b-bio').onclick = () => {
    const sel = selectedRosterEntry(_frame, _roster);
    if (!sel || !_citizens.has(sel.cid)) return;
    _send(Cmd.bio(sel.cid)); // re-request so the conversation log is CURRENT (B3); the refresh
    panels().citizen(_citizens.get(sel.cid), PORTRAIT_REGISTRY); // lands via citizenIfOpen → re-render
  };

  // (The RELATIONS web's own node-click binding moved with the surface — relations-view.js owns it
  // and lowers to `selectCrewByCid`, i.e. the same shared selection flow this file exports.)

  // CREW-tab scroll affordance: keep the "▾ N MORE" indicator + bottom fade current as the
  // table scrolls (pure count via moreBelow; thin DOM glue here).
  const crewtable = $('crewtable');
  if (crewtable) crewtable.addEventListener('scroll', updateCrewMore);

  setTab('build');
  refreshSelection();
  reflectArmed();
}

/** Frame dispatch (main.js): deck/lens chrome, pending cross-deck click, selection render. */
export function renderFrame(m) {
  _frame = m;
  setChip('s-deck', 'DECK ' + m.deck);
  setChip('s-lens', m.lens);
  reflectLens(m.lens);
  const r = resolvePendingClick(_pending, m, now());
  _pending = r.next;
  if (r.send) _send(Cmd.click(r.send.x, r.send.y));
  refreshSelection();
  // Deck may have changed — refilter both glued overlays to the shown deck.
  paintStageOverlays();
  notifyShip();
}

/** Roster dispatch: CREW WATCH list + CREW tab table + selection-dependent surfaces. */
export function renderRoster(m) {
  _roster = m;
  renderCrewWatch();
  if (_tab === 'crew') renderCrewTable();
  refreshSelection();
  paintWorkMarks(); // the roster IS the work-marker source (deck/x/y/task)
  notifyShip();
}

/** Chron dispatch: cache + live re-render when the CHRONICLE tab is up (IX-74). Also the MOSS
 *  FAULT LOG's source (IX-M5), so it is forwarded to the terminal whenever that exists. */
export function renderChron(m) {
  _chron = m;
  if (_moss) _moss.onChron(m);
  if (_tab === 'chron') renderChronBlock();
}

/** Designs dispatch: cache the pending-designation graph + repaint the ghost overlay. The channel
 *  is authoritative — a ghost persists until its designation resolves (built/cancelled) and drops
 *  off the wire, so there is no client guessing (honest, wire-backed; see interaction-spec IX-38). */
export function renderDesigns(m) {
  _designs = m;
  paintDesignGhosts();
  notifyShip();
}

/** Terminals dispatch: cache the MOSS directory + refresh the MOSS tab if it is up. Also feeds the
 *  MOSS terminal's PROGRAM screen, whose directory is the same channel (IX-M6). */
export function renderTerminals(m) {
  _terminals = m;
  if (_moss) _moss.setTerminals(terminalList(m));
  if (_tab === 'moss') renderMossTab();
}

/** Systems dispatch (moss-terminal §1.1): the ship-systems ledger. Cached here so the MOSS
 *  terminal shows live telemetry the instant it opens rather than a blank first frame. */
export function renderSystems(m) {
  _systems = m;
  if (_moss) _moss.onSystems(m);
}

/** Decks dispatch (warm-SVG view channels): cache the per-deck compartment grid. Cached here so
 *  the future warm SVG Overview / Room-Zoom render live geometry the instant they mount; the
 *  decoded per-deck view-model is decks-model.js:decksView over this + the rooms channel. */
export function renderDecks(m) { _decks = m; notifyShip(); }

/** Rooms dispatch: cache the per-room atmosphere (LENS overlays + atmos box). */
export function renderRooms(m) { _rooms = m; notifyShip(); }

/** Decor dispatch: cache the cosmetic view-only decor layer. */
export function renderDecor(m) { _decor = m; }

/** Materials dispatch: cache the sparse wall/floor material layer; notify the SVG views to re-skin
 *  their built walls/floors. View-only — never touches the sim. */
export function renderMaterials(m) { _materials = m; notifyShip(); }

/** Zones dispatch (console-retirement WP-3): cache the sparse stockpile-zone layer — per-tile accept
 *  mask + the WP-7 haul back-off bit — and notify the SVG surfaces so a zone paint, a filter change or
 *  a tile going unreachable becomes visible on the next repaint. View-only; never touches the sim.
 *  STATE-LAYER ONLY: this function draws nothing and reaches no DOM, so it survives the console
 *  deletion with the rest of the cache (see SHIP_STATE_REACH in client/test/surface-boundary.test.js). */
export function renderZones(m) { _zones = m; notifyShip(); }

/** Marks dispatch (the `marks` channel): cache the sparse debris / dig / stockpile / strip layer and
 *  notify the SVG surfaces, so a designation appears on the next repaint. This is the channel
 *  HANDOVER §4g calls "the `designations` channel"; it is named `marks` because debris is terrain and
 *  not an order (hosts/web/WireFormat.Marks.cs). View-only; never touches the sim. STATE-LAYER ONLY:
 *  draws nothing, reaches no DOM, so it survives the console deletion with the rest of the cache
 *  (see SHIP_STATE_REACH in client/test/surface-boundary.test.js). */
export function renderMarks(m) { _marks = m; notifyShip(); }

/** Items dispatch (the `items` channel): cache the sparse ground-item-stack layer — kind AND COUNT
 *  per stack, read from `sim.Items` rather than from the one lossy glyph the projection writes — and
 *  notify the SVG surfaces so a delivered haul, a second kind landing on a tile, or a stack sitting on
 *  a device becomes visible on the next repaint. View-only; never touches the sim. STATE-LAYER ONLY:
 *  draws nothing, reaches no DOM, so it survives the console deletion with the rest of the cache (see
 *  SHIP_STATE_REACH in client/test/surface-boundary.test.js). */
export function renderItems(m) { _items = m; notifyShip(); }

/** Devices dispatch (the `devices` channel, PLURAL — not the one-shot `device` terminal reply):
 *  cache the sparse per-device wear layer (kind + condition byte + the sim's `oper` bit, read from
 *  `sim.Devices` rather than from a projection that never carried Condition at all) and notify the
 *  SVG surfaces. NOTHING DRAWS IT YET, deliberately: the wrecked-art join is a separate package
 *  against `client/src/items/`, and shipping the data first is what makes that package possible.
 *  View-only; never touches the sim. STATE-LAYER ONLY: draws nothing, reaches no DOM, so it survives
 *  the console deletion with the rest of the cache (see SHIP_STATE_REACH in
 *  client/test/surface-boundary.test.js). */
export function renderDevices(m) { _devices = m; notifyShip(); }

/** Blocked dispatch (the `blocked` channel): cache the sparse refused-order layer — one row per
 *  dig/strip/build site the player queued that the sim's worksite staging rule will not staff, with
 *  the reason — and notify the SVG surfaces so a compartment that has just been vented clears its
 *  badges on the next repaint. Drawn by the Room Zoom's blocked layer. View-only; never touches the
 *  sim. STATE-LAYER ONLY: draws nothing, reaches no DOM, so it survives the console deletion with the
 *  rest of the cache (see SHIP_STATE_REACH in client/test/surface-boundary.test.js). */
export function renderBlocked(m) { _blocked = m; notifyShip(); }

/** Work dispatch (the `work` channel, M2-4): cache each crew member's manual work priorities — read
 *  host-side off `sim.Citizens`, the only place they exist — and notify the SVG surfaces. NOTHING DRAWS
 *  IT YET, deliberately: the WORK tab is its own package (M2-3) and the data had to exist before the
 *  grid could read it back. View-only; never touches the sim, and setting a priority goes the other way
 *  round through `Cmd`, not through here. STATE-LAYER ONLY: draws nothing, reaches no DOM, so it
 *  survives the console deletion with the rest of the cache (see SHIP_STATE_REACH in
 *  client/test/surface-boundary.test.js). */
export function renderWork(m) { _work = m; notifyShip(); }

/** ⭐ M3-7 `workcaps` dispatch: cache each crew member's skills and incapability mask and notify the
 *  SVG surfaces. STATE-LAYER ONLY, exactly like `renderWork`/`renderLedger` — draws nothing, reaches
 *  no DOM, creates no element, so it adds nothing to the four pinned console-DOM counts and moves to
 *  ship-state.js at WP-9 with the rest of the wire cache. The WORK tab that DRAWS it is M3-12. */
export function renderWorkCaps(m) { _workCaps = m; notifyShip(); }

/** Ledger dispatch (E0-8, the `ledger` channel): cache the ship's matter census and its rate members
 *  and notify the SVG surfaces so the LEDGER island repaints. View-only; never touches the sim.
 *  STATE-LAYER ONLY: draws nothing, reaches no DOM, creates no element, so it adds nothing to the
 *  four pinned console-DOM counts and survives the console deletion with the rest of the cache (see
 *  SHIP_STATE_REACH in client/test/surface-boundary.test.js). */
export function renderLedger(m) { _ledger = m; notifyShip(); }

/** M3-5 `ending` dispatch: cache the one-line banner and notify the SVG surfaces so the Overview's
 *  ENDING bar repaints. STATE-LAYER ONLY, exactly like `renderLedger` — draws nothing, reaches no
 *  DOM, creates no element, so it adds nothing to the four pinned console-DOM counts. */
export function renderEnding(m) { _ending = m; notifyShip(); }

/** D2 dispatch: cache the standing alert line and repaint the ship surfaces. Same shape as
 *  `renderEnding` — the host owns the sentence, the client owns only whether it is on screen. */
export function renderAlerts(m) { _alerts = m; notifyShip(); }

/** Relations dispatch (IX-R3): cache the directed graph and notify. The RELATIONS surface reads the
 *  cache back through `getRelations()` and repaints itself off `notifyShip` (relations-view.js);
 *  `refreshSelection` keeps the DOSSIER-facing readout current. */
export function renderRelations(m) {
  _relations = m;
  refreshSelection();
  notifyShip();
}

// ---- armed tool (the single client input mode) ----

export function getArmedTool() { return _armed; }

/** The stockpile accept-mask the palette currently carries (E0-4 WP-5). Read at click time by
 *  controls.js through the getStockFilter option — never imported as module state. */
export function getStockFilter() { return _stockFilter; }

/** B/X/G/Z/V/C from controls.js (IX-10/23, E0-3/E0-5, M1-C): toggle
 *  wall/cancel/dig/stockpile/strip/erase; arming surfaces the BUILD tab so the palette (or, for
 *  erase, the Overview's ORDERS bar) showing the armed state is actually on screen.
 *
 *  ⚠️ EVERY KIND MUST APPEAR HERE. The fallback below is `'keyB'`, so a kind this table does not know
 *  does not fail — IT ARMS WALL. A missing row is therefore not an inert key, it is the wrong tool
 *  silently armed, which is why `erase` landing here is part of the same commit as its key. */
const KEY_EVENT = {
  cancel: 'keyX', dig: 'keyG', stockpile: 'keyZ', strip: 'keyV', erase: 'keyC', build: 'keyB',
};
export function armFromKey(kind) {
  _armed = nextArmedTool(_armed, { t: KEY_EVENT[kind] || 'keyB' });
  if (isPaletteTool(_armed) && _tab !== 'build') setTab('build');
  if (_armed != null) nudgeIfPaused();
  reflectArmed();
  notifyShip(); // the Overview PLACE palette reflects the armed tool immediately
}

/** A placement/move click landed (controls.js): pulse the tile; a move order disarms (IX-52).
 *  Any armed click is also a newer intent, superseding a pending cross-deck click (IX-42). */
export function toolUsed(tool, x, y) {
  _pending = supersedePending(_pending, { t: 'click' });
  pulseAt(tool, x, y);
  nudgeIfPaused(); // placing a designation while paused is the classic "nothing happened" moment
  if (tool === 'move') { _armed = null; reflectArmed(); }
  notifyShip();
}

// ---- paused-ship nudge (surface "PRESS SPACE TO RUN" near the run-state chip) ----

/** Fire the paused nudge when the player arms/places while the sim is paused, then schedule the
 *  auto-dismiss. A no-op while running (nextNudge ignores a non-paused trigger). */
function nudgeIfPaused() {
  _nudge = nextNudge(_nudge, { t: 'trigger', paused: _paused }, now());
  paintNudge();
  if (nudgeVisible(_nudge, now())) {
    if (_nudgeTimer) clearTimeout(_nudgeTimer);
    _nudgeTimer = setTimeout(() => { _nudgeTimer = 0; paintNudge(); }, NUDGE_MS + 40);
  }
}

/** Show/hide the transient nudge chip from the pure visibility derivation. */
function paintNudge() {
  const el = $('s-nudge');
  if (!el) return;
  el.hidden = !nudgeVisible(_nudge, now());
}

/** A plain/shift canvas click was sent (controls.js): a newer selection intent — drop any
 *  pending cross-deck row click so it can't clobber this one when the deck frame lands (IX-42). */
export function canvasClicked() {
  _pending = supersedePending(_pending, { t: 'click' });
}

/** The Escape stack (IX-13 + relations-spec IX-R10 + moss-terminal IX-M2), called from main.js's
 *  onEscape: armed tool → dialogue → the MOSS terminal's OWN inner stack → (if the RELATIONS tab
 *  is active) back to BUILD (restoring the ship viewport) → nothing. The rung order + when-to-act
 *  is the pure `escapeTarget`; this function only performs the verdict. MOSS's inner stack
 *  (prompt → PROGRAM → DETAIL/FAULTLOG → LEDGER → ship) belongs to the MOSS model, so the 'moss'
 *  verdict just hands Escape over — a `{k:'exit'}` effect is what eventually restores the ship. */
export function handleEscape() {
  const act = escapeTarget({
    armed: _armed != null,
    dialogueOpen: !!(_panels && _panels.activeDialogueSid != null),
    dossierOpen: !!(_panels && _panels.hasOpenCitizen()),
    mossActive: !!(_moss && _moss.isOpen()),
    relationsActive: _tab === 'relations',
  });
  if (act === 'disarm') { _armed = null; reflectArmed(); }
  else if (act === 'dialogue') closeActiveDialogue();
  else if (act === 'dossier') _panels.closeActiveCitizen();
  else if (act === 'moss') _moss.escape();
  else if (act === 'relations') setTab('build');
}

/** Connection change (IX-96): disarm, drop the pending click, re-request chron next open.
 *  On reconnect with CHRONICLE already active, re-request immediately (IX-74 "per connection" —
 *  the tab can't be re-activated to fire it, so the reconnect fires it). */
export function setConnected(connected) {
  _connected = connected;
  if (!connected) {
    _armed = nextArmedTool(_armed, { t: 'disconnect' });
    _pending = supersedePending(_pending, { t: 'disconnect' });
    _chronRequested = false;
    reflectArmed();
  } else if (_tab === 'chron' && !_chronRequested) {
    _chronRequested = true;
    _send(Cmd.chron());
  }
  notifyShip();
}

function reflectArmed() {
  document.querySelectorAll('#palette .tool').forEach((b) =>
    b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tool === _armed));
  // E0-4 WP-5: the accept-filter row lives INSIDE reflectArmed rather than beside the palette
  // button's onclick, so it appears identically whether STOCKPILE was armed by the button or by the
  // Z key — a second reflection point is the drift bug this function already exists to prevent.
  const filterRow = $('stockfilter-row');
  if (filterRow) filterRow.hidden = _armed !== 'stockpile';
  document.querySelectorAll('#stockfilter .tool').forEach((b) =>
    b.classList.toggle('on', stockKindAccepted(_stockFilter, +(/** @type {HTMLElement} */ (b).dataset.kind))));
  const move = $('b-move');
  if (move) move.classList.toggle('armed', _armed === 'move');
  const cnv = _getCanvas();
  const stage = cnv ? cnv.parentElement : document.querySelector('.stage');
  if (stage) stage.classList.toggle('arming', _armed != null);
  const hint = $('hint');
  if (hint) {
    const sel = selectedRosterEntry(_frame, _roster);
    const armedText = hintLine(_armed, sel ? surnameOf(sel.name) : '', stockFilterLabel(_stockFilter));
    hint.textContent = armedText || IDLE_HINT;
    hint.classList.toggle('armed', !!armedText);
  }
}

/** IX-36: a single ≤150ms tile-outline pulse acknowledging the INPUT (never the outcome). */
function pulseAt(tool, x, y) {
  const cnv = _getCanvas();
  if (!cnv || !_camera) return;
  const stage = cnv.parentElement;
  if (!stage) return;
  const { s, ox, oy } = transform(_camera);
  const T = _camera.tile;
  const crect = cnv.getBoundingClientRect();
  const srect = stage.getBoundingClientRect();
  if (!crect.width || !cnv.width) return;
  const k = crect.width / cnv.width;
  const d = document.createElement('div');
  d.className = 'pulse' + (tool === 'cancel' ? ' pulse-red' : '');
  d.style.left = (crect.left - srect.left + (x * T * s + ox) * k) + 'px';
  d.style.top = (crect.top - srect.top + (y * T * s + oy) * k) + 'px';
  d.style.width = d.style.height = (T * s * k) + 'px';
  stage.appendChild(d);
  setTimeout(() => d.remove(), 160);
}

/** The persistent build-ghost overlay layer (created lazily inside the stage, above the canvas,
 *  non-interactive). Keyed sibling of the pulse — same camera-transform math so ghosts glue under
 *  pan/zoom/deck-change; cleared to empty when there is nothing to show. */
function designLayer() { return stageLayer('design-layer'); }

/** Lazily create (once) a non-interactive absolute overlay inside the stage, above the canvas.
 *  Shared by the build-ghost layer and the work-marker layer — both are camera-glued and both
 *  paint by replacing their own innerHTML on each draw. */
function stageLayer(cls) {
  const cnv = _getCanvas();
  const stage = cnv ? cnv.parentElement : document.querySelector('.stage');
  if (!stage) return null;
  let layer = stage.querySelector(':scope > .' + cls);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = cls;
    stage.appendChild(layer);
  }
  return layer;
}

/** The camera→stage-pixel transform shared by every glued overlay, or null when the canvas has no
 *  measurable box yet. Returns the stage-relative origin of tile (0,0) plus a tile side in px. */
function stageProjection() {
  const cnv = _getCanvas();
  if (!cnv || !_camera || !_frame) return null;
  const stage = cnv.parentElement;
  if (!stage) return null;
  const crect = cnv.getBoundingClientRect();
  if (!crect.width || !cnv.width) return null;
  const { s, ox, oy } = transform(_camera);
  const srect = stage.getBoundingClientRect();
  const k = crect.width / cnv.width;
  const T = _camera.tile;
  return {
    side: T * s * k,
    left: (x) => crect.left - srect.left + (x * T * s + ox) * k,
    top: (y) => crect.top - srect.top + (y * T * s + oy) * k,
  };
}

/** Repaint BOTH camera-glued stage overlays (build ghosts + work markers) from ONE measurement of
 *  the canvas box. Painting them independently would read the layout, write innerHTML, then read
 *  the layout again — a forced synchronous reflow every animation frame. Call this from the draw
 *  loop and from any wire dispatch that moves either layer's source data. */
export function paintStageOverlays() {
  const p = stageProjection();
  paintDesignGhosts(p);
  paintWorkMarks(p);
}

/**
 * Repaint the pending-designation ghosts on the CURRENT deck. Called on every draw (so the ghosts
 * track drag-pan/zoom continuously), on deck change, and when the designs channel updates. Ghosts
 * for other decks are hidden (the deck filter is the pure `designsOnDeck`); a resolved designation
 * drops off the wire and its ghost vanishes on the next channel update.
 */
export function paintDesignGhosts(proj) {
  const layer = designLayer();
  if (!layer) return;
  const cells = _designs && Array.isArray(_designs.cells) ? _designs.cells : null;
  if (!cells || !_frame || !_camera || !_getCanvas()) { if (layer.firstChild) layer.replaceChildren(); return; }
  const list = designsOnDeck(cells, _frame.deck);
  if (!list.length) { if (layer.firstChild) layer.replaceChildren(); return; }
  const p = proj || stageProjection();
  if (!p) return;
  const side = p.side;
  let html = '';
  for (const g of list) {
    // IX-39: the ledger drives a distinct STARVED look + an n/m readout, so an order nothing is
    // being hauled to stops looking exactly like one under construction.
    const cls = `ghost ghost-${g.kind === 1 ? 'door' : 'wall'} ghost-${g.state}`;
    const label = ghostLabel(g);
    html += `<div class="${cls}" ` +
      `style="left:${p.left(g.x).toFixed(1)}px;top:${p.top(g.y).toFixed(1)}px;` +
      `width:${side.toFixed(1)}px;height:${side.toFixed(1)}px">` +
      `<span class="ghost-glyph" style="font-size:${Math.max(8, side * 0.5).toFixed(1)}px">${designGlyph(g.kind)}</span>` +
      (label
        ? `<span class="ghost-count" style="font-size:${Math.max(6, side * 0.26).toFixed(1)}px">${esc(label)}</span>`
        : '') +
      '</div>';
  }
  layer.innerHTML = html;
}

/**
 * Repaint the on-map WORK markers (IX-103): a small tag over every crew member on the shown deck
 * who is actually doing a job, joined from the roster's own deck/x/y/task (no wire change). The
 * console could tell you what someone was doing only in the CREW tab or the READOUT of the one
 * selected crew member — so "are they truly working on something?" had no answer on the map at
 * all. Idle and merely-walking crew get NO marker, deliberately: the absence is information.
 *
 * Painted from the same camera transform as the ghosts, on every draw, so the tags stay glued
 * under pan/zoom/deck-change. The tag sits on the crew member's sim tile; a walking pawn's slide
 * interpolates between tiles, so a hauler's tag steps a fraction of a tile behind the body.
 */
export function paintWorkMarks(proj) {
  const layer = stageLayer('work-layer');
  if (!layer) return;
  const crew = _roster && Array.isArray(_roster.crew) ? _roster.crew : null;
  if (!crew || !_frame || !_camera || !_getCanvas()) { if (layer.firstChild) layer.replaceChildren(); return; }
  const list = workMarkers(crew, _frame.deck);
  if (!list.length) { if (layer.firstChild) layer.replaceChildren(); return; }
  const p = proj || stageProjection();
  if (!p) return;
  const side = p.side;
  let html = '';
  for (const w of list) {
    // Centred over the tile, floated just above it — never covering the pawn's face.
    const cx = p.left(w.x) + side / 2;
    const cy = p.top(w.y) - side * 0.18;
    html += `<div class="work-mark" title="${esc(w.task)}" ` +
      `style="left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;font-size:${Math.max(6, side * 0.24).toFixed(1)}px">` +
      `${esc(w.tag)}</div>`;
  }
  layer.innerHTML = html;
}

// ---- tabs ----

function setTab(tab) {
  const prevArmed = _armed;
  _armed = nextArmedTool(_armed, { t: 'tab', tab }); // leaving BUILD disarms build kinds (IX-30)
  _tab = tab;
  document.querySelectorAll('#tabs .tab').forEach((b) =>
    b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tab === tab));
  for (const key of ['build', 'crew', 'moss', 'chron', 'relations']) {
    const blk = $('tab-' + key);
    if (blk) blk.hidden = key !== tab;
  }
  if (tab === 'crew') renderCrewTable();
  // IX-M1: the MOSS tab replaces the WHOLE window with the terminal; any other tab restores the
  // ship. The `#tab-moss` pane below still renders — it is simply behind the takeover, and it is
  // what the console falls back to if the takeover is ever switched off.
  reflectMossView(tab === 'moss');
  if (tab === 'moss') renderMossTab();
  if (tab === 'chron') {
    if (!_chronRequested) { _chronRequested = true; _send(Cmd.chron()); }
    renderChronBlock();
  }
  refreshSelection();
  if (prevArmed !== _armed) reflectArmed();
  // IX-R1: the RELATIONS tab replaces the whole window with the crew web; any other tab returns the
  // ship. Unlike MOSS there is no `reflect…` call here — relations-view.js derives its visibility
  // from `getTab()` on this very notification, so the tab state stays the ONE truth and hud.js needs
  // no import of the surface (no cycle).
  notifyShip(); // the Overview shows for BUILD/CREW, hides for RELATIONS/MOSS/CHRONICLE
}

// ---- MOSS terminal (the full-window takeover, IX-M1) ----

/**
 * Open/close the MOSS terminal. The screen is created on FIRST activation (a session that never
 * opens MOSS builds no MOSS DOM at all — the same rule as the P2 panels), then reused, so its
 * cached channels survive a round-trip to the ship and back.
 *
 * The takeover is `moss-screen.applyTakeover`: `body.moss-open` puts `.app`, `#panels` and the
 * disconnect overlay at `display:none` and un-hides `#moss-view`. The ship canvas, `composeScene`
 * and the executors are untouched — MOSS changes no render state, it simply is not the view.
 *
 * It does NOT stop the renderer, and saying so would be a comfortable lie: `main.js` still runs
 * `layout(); draw();` on every incoming frame (`main.js:201-206`), so `composeScene` and the
 * executor keep working on a display:none canvas the whole time MOSS is up. Harmless at 1 Hz frames
 * and deliberately left alone — gating the draw loop on a UI flag would put view state inside the
 * render path — but it is real cost, not free.
 */
function reflectMossView(active) {
  if (!active) { if (_moss) _moss.close(); return; }
  if (!_moss) {
    const root = $('moss-view');
    if (!root) return;
    _moss = new MossScreen({
      root,
      send: (o) => _send(o),
      // IX-M2's last rung: leaving MOSS restores the ship view through the ordinary tab flow.
      onExit: () => { if (_tab === 'moss') setTab('build'); },
    });
    _moss.setTerminals(terminalList(_terminals));
    if (_systems) _moss.onSystems(_systems);
    if (_chron) _moss.onChron(_chron);
  }
  _moss.open();
}

// ---- RELATIONS (a body-level takeover; see relations-view.js) ----
//
// The web, its crew list and its two directed regard sections now live in `relations-view.js` behind
// `body.relations-open`. What stays here is the STATE seam only: the tab machinery is still the one
// truth for "is RELATIONS up?" (exactly as it is for MOSS), and hud.js tells the surface to reflect
// it. Nothing here reads or writes the relations DOM.

/** Select a crew member by cid through the ONE shared selection flow (IX-R2). Reuses crewRowClick
 *  so same-deck / cross-deck resolution is identical to a CREW WATCH row click. */
function selectCrew(cid) {
  const entry = crewList().find((e) => e.cid === cid);
  if (entry) crewRowClick(entry, document.createElement('div')); // throwaway el for the .pending style
}

// ---- crew watch (left column) + CREW tab (bottom) ----

function crewList() {
  return _roster && Array.isArray(_roster.crew) ? _roster.crew : [];
}

/** Shared row-click flow (IX-41/42/43): same-deck → click the fresh tile; cross-deck → deck
 *  switch + pending click. DOM click, so it works identically while a tool is armed. Either
 *  branch is a NEWER selection intent, so any earlier pending cross-deck click is dropped
 *  (IX-42 supersession); a new cross-deck click then installs its own pending state. */
function crewRowClick(entry, rowEl) {
  if (!_frame) return;
  _pending = supersedePending(_pending, { t: 'row-click' });
  rowEl.classList.add('pending'); // IX-44: clears on the next roster/frame render pass
  if (entry.deck === _frame.deck) {
    const t = crewClickTarget(_frame, entry);
    _send(Cmd.click(t.x, t.y));
  } else {
    _send(Cmd.deck(entry.deck - _frame.deck));
    _pending = beginPendingClick(entry, now());
  }
}

// -- keyed in-place row reconciliation --
// The roster rebroadcasts on every crew tile-step (~2/s at 1x, more at speed). Rebuilding row
// DOM at that cadence swallows clicks that span a rebuild, destroys keyboard focus (IX-46's
// native Tab/Enter mechanism), refetches portrait <img>s (no-store dev server → blank flashes),
// and kills the VS-35 morale width transition. So rows are created ONCE per cid and mutated in
// place; nodes are added/removed only when the cid set changes, and reordered with minimal
// moves (host order is stable, so moves are rare and never touch an in-place node).

const _watchRows = new Map(); // cid key → {el, entry, avatar, portraitKey, nameEl, roleEl, fill}
const _tableRows = new Map(); // cid key → {el, entry, cells}

function setText(node, v) { if (node.textContent !== v) node.textContent = v; }

function setEmptyLine(wrap, show) {
  let e = wrap.querySelector(':scope > .empty-line');
  if (show && !e) {
    e = document.createElement('div');
    e.className = 'empty-line';
    e.textContent = 'No souls aboard.';
    wrap.appendChild(e);
  } else if (!show && e) e.remove();
}

/** Reconcile a row container against the roster: update existing rows in place (keyed by cid),
 *  create/remove only on membership change, reorder with minimal insertBefore moves. */
function reconcileRows(wrap, map, entries, make, update) {
  const seen = new Set();
  for (const entry of entries) {
    const k = String(entry.cid);
    seen.add(k);
    let rec = map.get(k);
    if (!rec) { rec = make(entry); map.set(k, rec); }
    rec.entry = entry; // click handlers read rec.entry — always the latest wire truth
    update(rec, entry);
  }
  for (const [k, rec] of Array.from(map)) {
    if (!seen.has(k)) { rec.el.remove(); map.delete(k); }
  }
  let cursor = wrap.firstElementChild;
  for (const entry of entries) {
    const el = map.get(String(entry.cid)).el;
    if (el === cursor) { cursor = cursor.nextElementSibling; continue; }
    wrap.insertBefore(el, cursor); // moves only the out-of-place node; focus elsewhere survives
  }
}

/** The registry-resolvable portrait key for an entry, or '' (→ initials fallback). */
function portraitKeyOf(entry) {
  const key = entry.portrait;
  return key && Object.prototype.hasOwnProperty.call(PORTRAIT_REGISTRY, key) && PORTRAIT_REGISTRY[key]
    ? key : '';
}

function avatarEl(entry) {
  const key = portraitKeyOf(entry);
  if (key) {
    const img = document.createElement('img');
    img.className = 'avatar'; img.src = PORTRAIT_REGISTRY[key]; img.alt = '';
    return img;
  }
  const d = document.createElement('div');
  d.className = 'avatar avatar-initials';
  d.style.background = crewHue(entry.cid);
  d.textContent = crewInitials(entry.name);
  return d;
}

function makeWatchRow(entry) {
  const row = document.createElement('button');
  row.className = 'crew-row';
  row.dataset.cid = String(entry.cid);
  const avatar = avatarEl(entry);
  const col = document.createElement('div');
  col.className = 'crew-col';
  const nameEl = document.createElement('div');
  nameEl.className = 'crew-surname';
  const roleEl = document.createElement('div');
  roleEl.className = 'crew-role';
  // VS-66: the always-visible answer to "what is this person doing right now" — the task used to
  // live only in the CREW tab and the selected crew member's READOUT.
  const taskEl = document.createElement('div');
  taskEl.className = 'crew-task';
  const track = document.createElement('div');
  track.className = 'morale-track';
  const fill = document.createElement('div');
  fill.className = 'morale-fill';
  track.appendChild(fill);
  col.appendChild(nameEl); col.appendChild(roleEl); col.appendChild(taskEl); col.appendChild(track);
  row.appendChild(avatar); row.appendChild(col);
  const rec = { el: row, entry, avatar, portraitKey: portraitKeyOf(entry), nameEl, roleEl, taskEl, fill };
  row.onclick = () => crewRowClick(rec.entry, row);
  return rec;
}

function updateWatchRow(rec, entry) {
  const pk = portraitKeyOf(entry);
  if (pk !== rec.portraitKey) {
    // portrait availability changed (img ↔ initials) — the ONLY case that replaces the node;
    // an unchanged <img> src is never touched, so it never refetches or flashes.
    const fresh = avatarEl(entry);
    rec.avatar.replaceWith(fresh);
    rec.avatar = fresh;
    rec.portraitKey = pk;
  } else if (pk === '') {
    setText(rec.avatar, crewInitials(entry.name));
  }
  setText(rec.nameEl, surnameOf(entry.name));
  setText(rec.roleEl, entry.role || '');
  // Working crew read bright, doing-nothing crew read dim — the row must never make standing
  // around look like activity (the same honesty rule as the on-map marker).
  const t = watchTask(entry);
  setText(rec.taskEl, t.text);
  rec.taskEl.classList.toggle('working', t.working);
  const mv = Math.max(0, Math.min(1, entry.morale || 0));
  const w = (mv * 100) + '%';
  if (rec.fill.style.width !== w) rec.fill.style.width = w; // in-place → VS-35 transition animates
  const color = moraleColor(mv);
  if (rec.fill.style.background !== color) rec.fill.style.background = color;
}

function renderCrewWatch() {
  const list = crewList();
  setChip('crew-count', soulsLabel(list.length));
  const wrap = $('crewlist');
  setEmptyLine(wrap, list.length === 0);
  reconcileRows(wrap, _watchRows, list, makeWatchRow, updateWatchRow);
  reflectRowSelection();
}

// ⚠️ FILED, NOT FIXED (pawn-glide review, 2026-08-05): this is the ONE document-wide query on the
// per-roster path — `document.querySelectorAll` over the whole document, not a scoped container —
// and the pawn glide made the roster arrive on every sim tick while anyone walks (measured on
// `--ship wreck`: 7.67 roster msg/s walking, 0 idle). So it now runs ~5-8×/s instead of ~2×/s. It
// is O(document), it is not the package's to fix, and the honest scoping is that `rooms` was
// already re-driving these rows ~5×/s before the glide existed. The fix, when someone takes it, is
// to scope the query to the two list containers (or to reuse the keyed row maps both docks already
// hold) — NOT to throttle the channel.
function reflectRowSelection() {
  const sel = selectedRosterEntry(_frame, _roster);
  const selCid = sel ? String(sel.cid) : null;
  document.querySelectorAll('.crew-row, .crew-trow').forEach((r) => {
    r.classList.toggle('sel', /** @type {HTMLElement} */ (r).dataset.cid === selCid);
    r.classList.remove('pending'); // the render pass is the settle point (IX-44)
  });
}

// IX-72 + polish: SURNAME NAME · ROLE · MOOD · TRAITS · MORALE% · TASK · DECK n. TRAITS is the
// enrichment column (persona chips off the roster wire's appended `traits` field).
const TABLE_CELLS = ['tc-name', 'tc-role', 'tc-mood', 'tc-traits', 'tc-morale', 'tc-task', 'tc-deck'];

function makeTableRow(entry) {
  const row = document.createElement('button');
  row.className = 'crew-trow';
  row.dataset.cid = String(entry.cid);
  const cells = {};
  for (const cls of TABLE_CELLS) {
    const c = document.createElement('span');
    c.className = cls;
    row.appendChild(c);
    cells[cls] = c;
  }
  const rec = { el: row, entry, cells, traitsKey: '' };
  row.onclick = () => crewRowClick(rec.entry, row);
  return rec;
}

function updateTableRow(rec, entry) {
  const mv = Math.max(0, Math.min(1, entry.morale || 0));
  setText(rec.cells['tc-name'], surnameFirst(entry.name)); // IX-72: SURNAME-first identity
  setText(rec.cells['tc-role'], entry.role || '');
  setText(rec.cells['tc-mood'], entry.mood || '');
  // TRAITS chips — rebuilt only when the trait set changes (roster re-sends on change; keep it cheap).
  const traits = Array.isArray(entry.traits) ? entry.traits : [];
  const key = traits.join('');
  if (key !== rec.traitsKey) {
    rec.cells['tc-traits'].innerHTML = traits.length
      ? traits.map((t) => `<span class="tchip">${esc(t)}</span>`).join('')
      : '<span class="tchip-none">—</span>';
    rec.traitsKey = key;
  }
  setText(rec.cells['tc-morale'], Math.round(mv * 100) + '%');
  const color = moraleColor(mv);
  if (rec.cells['tc-morale'].style.color !== color) rec.cells['tc-morale'].style.color = color;
  setText(rec.cells['tc-task'], entry.task || '');
  setText(rec.cells['tc-deck'], 'DECK ' + entry.deck);
}

/** CREW tab (IX-72): the roster long-form, host order, row click = the selection flow.
 *  Same keyed in-place reconciliation as CREW WATCH. */
function renderCrewTable() {
  const wrap = $('crewtable');
  if (!wrap) return;
  const list = crewList();
  setEmptyLine(wrap, list.length === 0);
  reconcileRows(wrap, _tableRows, list, makeTableRow, updateTableRow);
  reflectRowSelection();
  updateCrewMore();
}

/** Refresh the "▾ N MORE" affordance + the bottom fade from the scroll container's metrics (pure
 *  `moreBelow`). One uniform row stride is read off the first row (all rows share a height). */
function updateCrewMore() {
  const wrap = $('crewtable');
  const more = $('crew-more');
  const shell = $('tab-crew');
  if (!wrap || !more || !shell) return;
  const first = wrap.querySelector('.crew-trow');
  const stride = first ? first.getBoundingClientRect().height + 4 /* .crew-table gap */ : 0;
  const n = moreBelow(wrap.scrollTop, wrap.clientHeight, wrap.scrollHeight, stride);
  more.hidden = n <= 0;
  more.textContent = '▾ ' + n + ' MORE';
  shell.classList.toggle('has-more', n > 0);
}

/**
 * MOSS tab (IX-73 + polish): honest guidance, a clickable directory of the ship's terminals, and a
 * live line when the drawer is open.
 *
 * Terminal-list design decision: opening a terminal's IDE needs only its tid — the host answers a
 * `moss open` with the program source regardless of which deck is shown — so a list row opens the
 * IDE directly through the SAME client path a console-tile click triggers (the `device` message
 * calls `panels().openTerminal(tid)`, which fires `moss open`). No deck switch and no device toggle
 * are needed (unlike replaying a `Cmd.click` on the tile, which would also flip the terminal's
 * power and be blocked when a crew member stands on it). So every terminal is openable from the
 * list irrespective of the current deck; the DECK n label is orientation only.
 */
function renderMossTab() {
  const wrap = $('tab-moss');
  if (!wrap) return;
  const openTid = _panels ? _panels.openTerminalTid() : null;
  wrap.replaceChildren();
  const msg = document.createElement('div');
  msg.className = 'menu-msg';
  msg.textContent = 'Click a terminal to open its MOSS program in the IDE (or click a console on the deck).';
  wrap.appendChild(msg);

  const terms = terminalList(_terminals);
  if (terms.length) {
    const list = document.createElement('div');
    list.className = 'term-list';
    for (const t of terms) {
      const row = document.createElement('button');
      row.className = 'term-row' + (openTid != null && String(openTid) === t.tid ? ' open' : '');
      row.textContent = terminalLabel(t);
      row.title = 'Open ' + t.tid + '’s MOSS IDE';
      row.onclick = () => { panels().openTerminal(t.tid); if (_tab === 'moss') renderMossTab(); };
      list.appendChild(row);
    }
    wrap.appendChild(list);
  } else {
    const none = document.createElement('div');
    none.className = 'menu-msg';
    none.textContent = 'No MOSS terminals aboard.';
    wrap.appendChild(none);
  }

  if (openTid != null) {
    const live = document.createElement('div');
    live.className = 'menu-msg moss-live';
    live.textContent = 'TERMINAL ' + openTid + ' — IDE OPEN';
    wrap.appendChild(live);
  }
}

/** CHRONICLE tab (IX-74): days newest-first; the honest empty state, no spinner. */
function renderChronBlock() {
  const wrap = $('tab-chron');
  if (!wrap) return;
  wrap.replaceChildren();
  const days = _chron && Array.isArray(_chron.days) ? _chron.days.slice() : [];
  if (!days.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-msg';
    empty.textContent = 'The chronicle has no entries yet.';
    wrap.appendChild(empty);
    return;
  }
  days.sort((a, b) => (b.day || 0) - (a.day || 0));
  for (const d of days) {
    const head = document.createElement('div');
    head.className = 'chron-day';
    head.textContent = chronHeader(d.day, d.headline); // dedupes the host's "Day n —" prefix
    wrap.appendChild(head);
    for (const l of (d.lines || [])) {
      const line = document.createElement('div');
      line.className = 'chron-line';
      line.textContent = l;
      wrap.appendChild(line);
    }
  }
}

// ---- readout (right column) ----

/** Re-render every selection-derived surface from authoritative state (IX-40/50/55). */
function refreshSelection() {
  const sel = selectedRosterEntry(_frame, _roster);
  // The move order loses its subject when the selection dies (IX-52).
  if (!sel && _armed === 'move') { _armed = nextArmedTool(_armed, { t: 'selectionLost' }); reflectArmed(); }
  reflectRowSelection();

  const body = $('ro-body');
  const talk = $('b-talk'), move = $('b-move'), bio = $('b-bio');
  if (!body) return;
  if (!sel) {
    body.innerHTML =
      '<div class="ro-empty">NO CREW SELECTED</div>' +
      '<div class="ro-guide">Click a pawn or a CREW WATCH row.</div>';
    for (const b of [talk, move, bio]) if (b) b.disabled = true;
    return;
  }
  const cit = _citizens.get(sel.cid);
  const mv = Math.max(0, Math.min(1, sel.morale || 0));
  const pct = Math.round(mv * 100);
  let html = '';
  html += `<div class="ro-name">${esc(sel.name || '')}</div>`;
  html += `<div class="ro-role">${esc([sel.role, sel.mood].filter(Boolean).join(' · '))}</div>`;
  if (cit && Array.isArray(cit.traits) && cit.traits.length) {
    html += '<div class="ro-traits">' + cit.traits.map((t) => `<span class="trait">${esc(t)}</span>`).join('') + '</div>';
  }
  html += `<div class="ro-task">&gt; ${esc(sel.task || '')}</div>`;
  html += `<div class="ro-morale">MORALE <span style="color:${moraleColor(mv)}">${pct}%</span></div>`;
  // IX-R7's two directed regard sections used to be appended here while the RELATIONS tab was up.
  // They moved with the surface: the console readout is hidden under `body.relations-open`, so the
  // sections now live in the RELATIONS surface's own readout (relations-view.js) — same derivation,
  // same `.rr-*` markup, a home that survives the console's deletion.
  body.innerHTML = html;
  if (talk) talk.disabled = false;
  if (move) move.disabled = false;
  if (bio) bio.disabled = !_citizens.has(sel.cid); // IX-53: no cache → disabled, never an empty card
  reflectArmed(); // move-hint surname may have changed
}

// ---- P2 panels: dialogue / citizen card / terminal drawer ----
// The panel manager and the chat store are created lazily on the FIRST chat/citizen/moss message,
// so a session that never opens a conversation renders no panel DOM at all.

let _panels = null;
let _chat = initChatState();
/** Portrait key → resolvable image URL, from the generated manifest via the registry glue. A
 *  citizen whose key is absent keeps the procedural silhouette fallback (portraits.js). */
const PORTRAIT_REGISTRY = portraitRegistry;

function panels() {
  if (!_panels) {
    _panels = new PanelManager();
    _panels.onSend = (sid, text) => onSendHandler(sid, text);
    _panels.onBye = (sid) => onByeHandler(sid);
    _panels.onMoss = (op, tid, text) => onMossHandler(op, tid, text);
    // IX-73: the MOSS tab's "TERMINAL {tid} — IDE OPEN" line must go away when the drawer closes.
    _panels.onClosed = (key) => { if (key === 'terminal' && _tab === 'moss') renderMossTab(); };
  }
  return _panels;
}

let onSendHandler = () => {};
let onByeHandler = () => {};
let onMossHandler = () => {};
/** Register a handler for the dialogue input box → `say {sid,text}`. */
export function onDialogueSend(fn) { onSendHandler = fn || (() => {}); }
/** Register a handler for a dialogue closing → `bye {sid}`. */
export function onDialogueClose(fn) { onByeHandler = fn || (() => {}); }
/** Register a handler for a terminal gesture → `moss {op,tid,text?}`. */
export function onTerminalOp(fn) { onMossHandler = fn || (() => {}); }
/** Close the active dialogue (Esc key) — fires the bye handler. No-op when none is open. */
export function closeActiveDialogue() { if (_panels) _panels.closeActiveDialogue(); }

/**
 * Route a decoded `chat` wire message through the pure reassembler and update its dialogue window.
 * Binds the full stream (start/delta/line/effect/end) — the reducer keys by sid, so interleaved
 * conversations and a mid-session reconnect (a fresh `start` for a live sid) both stay correct.
 * @param {import('../wire/messages.js').ChatMsg} m
 */
export function renderChat(m) {
  _chat = reduceChat(_chat, m); // ALWAYS fold — the transcript (+ B3 history) stays complete
  const p = panels();
  // B2: a conversation the user closed must never resurrect. Only a `start` (re)opens the window;
  // trailing delta/line/effect/end events update it only while it is open, else touch no DOM.
  if (chatPanelAction(m.ev, p.hasDialogue(m.sid)) === 'skip') return;
  const model = sessionModel(getSession(_chat, m.sid));
  if (model) p.dialogue(model);
}

/** Cache the citizen payload + live-refresh its card ONLY if already open (IX-54: the card opens
 *  solely via BIOGRAPHY — the readout is the glance surface, the card is the dossier).
 *  @param {import('../wire/messages.js').CitizenMsg} m */
export function renderCitizen(m) {
  if (!m || m.cid == null) return;
  _citizens.set(m.cid, m);
  if (_panels) _panels.citizenIfOpen(enrichCitizen(m), PORTRAIT_REGISTRY);
  refreshSelection(); // traits may have just become available; BIO may enable
}

/** A device was selected: open its panel. v0 opens the MOSS terminal drawer for a terminal (which
 *  fires a `moss open` to fetch its source). @param {import('../wire/messages.js').DeviceMsg} m */
export function renderDevice(m) {
  if (m && m.kind === 'terminal') {
    panels().openTerminal(m.tid);
    if (_tab === 'moss') renderMossTab();
  }
}

/** Route a MOSS terminal event. The full-window terminal takes `sys`/`exec` (its own ops); the
 *  floating IDE drawer takes the four program events it has always handled. Splitting the routing
 *  matters: forwarding `sys`/`exec` to `panels()` would lazily build the whole panel layer for a
 *  message it has nothing to do with. @param {import('../wire/messages.js').MossMsg} m */
export function renderMoss(m) {
  if (_moss) _moss.onMossEvent(m);
  const ev = m && m.ev;
  if (ev === 'source' || ev === 'diag' || ev === 'audit' || ev === 'rterror') panels().mossEvent(m);
}

/** Reflect the LLM backend status in the top-bar chip: backend name, degraded flag, cost/hr.
 *  Hidden until the first llmstatus message arrives. @param {import('../wire/messages.js').LlmStatusMsg} m */
export function renderLlmStatus(m) {
  _llm = m;                // cache for the Overview top-bar chip (read via getLlm)
  notifyShip();           // let the Overview repaint its LLM chip
  const chip = $('s-llmchip');
  if (!chip) return;
  chip.style.display = '';
  const backend = m.backend || '—';
  const cost = typeof m.costPerHour === 'number' && isFinite(m.costPerHour)
    ? ' · $' + m.costPerHour.toFixed(2) + '/h' : '';
  $('s-llm').textContent = backend + (m.degraded ? ' (degraded)' : '') + cost;
  chip.classList.toggle('degraded', !!m.degraded);
}
