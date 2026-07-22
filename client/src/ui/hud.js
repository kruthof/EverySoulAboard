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
  beginPendingClick, resolvePendingClick, supersedePending, nextArmedTool, isBuildTool,
  hintLine, chronHeader,
} from './console-model.js';
import {
  ringLayout, drawnEdges, focusTag, regardRows, signed,
} from './relations-model.js';

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
let _armed = null;        // the ONE input-mode slot: null|'wall'|'door'|'cancel'|'move'
let _tab = 'build';       // active bottom-bar tab (presentation only, IX-20)
let _pending = null;      // pending cross-deck row click (IX-42)
let _chronRequested = false; // CHRONICLE requests once per connection (IX-74)
const _citizens = new Map(); // cid → last citizen msg (IX-50/53; never purged, IX-98)

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
  // Top-bar clock (IX-81): day verbatim (0-based, matches the log channel's D<day.dd>), HH:MM
  // from dayFrac. Caution chip (IX-84): derived, display-only, ~1 Hz with metrics.
  setChip('s-day', 'DAY ' + m.day + ' · ' + clockHHMM(m.dayFrac || 0));
  const c = cautionState(m);
  const chip = $('s-caution');
  if (chip) { chip.className = 'caution ' + c.level; chip.textContent = c.label; }
}

/** Sensor log (IX-90): last 5 lines, leading D-token wrapped in .ts (newest tinted via CSS). */
export function renderLog(lines) {
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

  // Build palette (IX-21/31): WALL / DOOR / ⌫ CANCEL only. Cancel is not demolition.
  const TOOLS = [['wall', 'WALL'], ['door', 'DOOR'], ['cancel', '⌫ CANCEL']];
  const pal = $('palette');
  for (const [kind, label] of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool' + (kind === 'cancel' ? ' tool-cancel' : '');
    b.dataset.tool = kind; b.textContent = label;
    if (kind === 'cancel') b.title = 'Cancel a queued build order (refunds staged material)';
    b.onclick = () => { _armed = nextArmedTool(_armed, { t: 'toggle', tool: kind }); reflectArmed(); };
    pal.appendChild(b);
  }

  // Readout actions (IX-51/52/53).
  $('b-talk').onclick = () => {
    const cid = selectedCrewCid(_frame);
    if (cid != null) _send(Cmd.talk(cid));
  };
  $('b-move').onclick = () => { _armed = nextArmedTool(_armed, { t: 'toggle', tool: 'move' }); reflectArmed(); };
  $('b-bio').onclick = () => {
    const sel = selectedRosterEntry(_frame, _roster);
    if (!sel || !_citizens.has(sel.cid)) return;
    _send(Cmd.bio(sel.cid)); // re-request so the conversation log is CURRENT (B3); the refresh
    panels().citizen(_citizens.get(sel.cid), PORTRAIT_REGISTRY); // lands via citizenIfOpen → re-render
  };

  // RELATIONS web (IX-R2): a node click selects that crew — the ONE shared selection mechanism,
  // so CREW WATCH, the web, and the READOUT stay in lockstep. Delegated so re-rendered nodes need
  // no re-binding.
  const relSvg = $('rel-svg');
  if (relSvg) relSvg.addEventListener('click', (e) => {
    const g = e.target && e.target.closest ? e.target.closest('.rel-node') : null;
    if (g && g.dataset.cid != null) selectCrew(Number(g.dataset.cid));
  });

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
}

/** Roster dispatch: CREW WATCH list + CREW tab table + selection-dependent surfaces. */
export function renderRoster(m) {
  _roster = m;
  renderCrewWatch();
  if (_tab === 'crew') renderCrewTable();
  refreshSelection();
}

/** Chron dispatch: cache + live re-render when the CHRONICLE tab is up (IX-74). */
export function renderChron(m) {
  _chron = m;
  if (_tab === 'chron') renderChronBlock();
}

/** Relations dispatch (IX-R3): cache the directed graph; re-render the web when the RELATIONS tab
 *  is up, and refresh the readout (its regard sections are relations-derived). */
export function renderRelations(m) {
  _relations = m;
  if (_tab === 'relations') renderRelationsWeb();
  refreshSelection();
}

// ---- armed tool (the single client input mode) ----

export function getArmedTool() { return _armed; }

/** B/X from controls.js (IX-10/23): toggle wall/cancel; arming surfaces the BUILD tab. */
export function armFromKey(kind) {
  _armed = nextArmedTool(_armed, kind === 'cancel' ? { t: 'keyX' } : { t: 'keyB' });
  if (isBuildTool(_armed) && _tab !== 'build') setTab('build');
  reflectArmed();
}

/** A placement/move click landed (controls.js): pulse the tile; a move order disarms (IX-52).
 *  Any armed click is also a newer intent, superseding a pending cross-deck click (IX-42). */
export function toolUsed(tool, x, y) {
  _pending = supersedePending(_pending, { t: 'click' });
  pulseAt(tool, x, y);
  if (tool === 'move') { _armed = null; reflectArmed(); }
}

/** A plain/shift canvas click was sent (controls.js): a newer selection intent — drop any
 *  pending cross-deck row click so it can't clobber this one when the deck frame lands (IX-42). */
export function canvasClicked() {
  _pending = supersedePending(_pending, { t: 'click' });
}

/** The Escape stack (IX-13), called from main.js's onEscape: armed tool → dialogue → nothing. */
export function handleEscape() {
  if (_armed != null) { _armed = null; reflectArmed(); return; }
  closeActiveDialogue();
}

/** Connection change (IX-96): disarm, drop the pending click, re-request chron next open.
 *  On reconnect with CHRONICLE already active, re-request immediately (IX-74 "per connection" —
 *  the tab can't be re-activated to fire it, so the reconnect fires it). */
export function setConnected(connected) {
  if (!connected) {
    _armed = nextArmedTool(_armed, { t: 'disconnect' });
    _pending = supersedePending(_pending, { t: 'disconnect' });
    _chronRequested = false;
    reflectArmed();
  } else if (_tab === 'chron' && !_chronRequested) {
    _chronRequested = true;
    _send(Cmd.chron());
  }
}

function reflectArmed() {
  document.querySelectorAll('#palette .tool').forEach((b) =>
    b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tool === _armed));
  const move = $('b-move');
  if (move) move.classList.toggle('armed', _armed === 'move');
  const cnv = _getCanvas();
  const stage = cnv ? cnv.parentElement : document.querySelector('.stage');
  if (stage) stage.classList.toggle('arming', _armed != null);
  const hint = $('hint');
  if (hint) {
    const sel = selectedRosterEntry(_frame, _roster);
    const armedText = hintLine(_armed, sel ? surnameOf(sel.name) : '');
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
  if (tab === 'moss') renderMossTab();
  if (tab === 'chron') {
    if (!_chronRequested) { _chronRequested = true; _send(Cmd.chron()); }
    renderChronBlock();
  }
  if (tab === 'relations') renderRelationsWeb();
  // IX-R1: the RELATIONS tab swaps the ship viewport for the web; any other tab returns the ship
  // view. The readout's regard sections depend on the active tab, so refresh selection either way.
  reflectRelationsView();
  refreshSelection();
  if (prevArmed !== _armed) reflectArmed();
}

// ---- RELATIONS web (the viewport swap) ----

function relEdges() { return _relations && Array.isArray(_relations.edges) ? _relations.edges : []; }

/** IX-R1: show the relations overlay only while its tab is active (ship canvas untouched beneath). */
function reflectRelationsView() {
  const view = $('relations-view');
  if (view) view.hidden = _tab !== 'relations';
}

/** Select a crew member by cid through the ONE shared selection flow (IX-R2). Reuses crewRowClick
 *  so same-deck / cross-deck resolution is identical to a CREW WATCH row click. */
function selectCrew(cid) {
  const entry = crewList().find((e) => e.cid === cid);
  if (entry) crewRowClick(entry, document.createElement('div')); // throwaway el for the .pending style
}

/** Build the SVG crew-web from the directed graph + roster order (IX-R4..R8). Nodes ring in roster
 *  order; edges are the deduped mutual lines (color = mutual tier, dashed = secret); the focused
 *  crew's edges brighten/thicken with boxed tags; other edges recede. Pure derivations live in
 *  relations-model.js — this is SVG glue. */
function renderRelationsWeb() {
  const svg = $('rel-svg');
  if (!svg) return;
  const list = crewList();
  const titleEl = $('rel-title');
  if (titleEl) {
    titleEl.textContent = 'RELATIONS — ' + list.length + ' SOUL' + (list.length === 1 ? '' : 'S') +
      ' · CLICK A NAME TO FOCUS';
  }
  // viewBox is 1000×640 (see index.html); the ellipse leaves room for surname labels + tags.
  const pos = ringLayout(list.length, { cx: 500, cy: 300, rx: 372, ry: 232 });
  const idxByCid = new Map(list.map((e, i) => [e.cid, i]));
  const lines = drawnEdges(relEdges());
  const sel = selectedRosterEntry(_frame, _roster);
  const focusCid = sel ? sel.cid : null;
  svg.classList.toggle('has-focus', focusCid != null);

  let edgesSvg = '', tagsSvg = '', nodesSvg = '';
  for (const ln of lines) {
    const ai = idxByCid.get(ln.a), bi = idxByCid.get(ln.b);
    if (ai == null || bi == null) continue; // an endpoint not on the current roster — skip
    const focused = focusCid != null && (ln.a === focusCid || ln.b === focusCid);
    if (!focused && !ln.draw) continue;      // unfocused noise stays invisible (IX-R6)
    const pa = pos[ai], pb = pos[bi];
    const cls = 'rel-edge tier-' + ln.tier + (ln.secret ? ' secret' : '') + (focused ? ' focus' : '');
    edgesSvg += `<line class="${cls}" x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" ` +
      `x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"/>`;
    if (focused) {
      const tag = focusTag(ln, focusCid);
      if (tag) {
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        const w = Math.max(48, tag.length * 7.4 + 14);
        tagsSvg += `<g class="rel-tag" transform="translate(${mx.toFixed(1)},${my.toFixed(1)})">` +
          `<rect x="${(-w / 2).toFixed(1)}" y="-10" width="${w.toFixed(1)}" height="20" rx="2"/>` +
          `<text x="0" y="4">${esc(tag)}</text></g>`;
      }
    }
  }
  for (let i = 0; i < list.length; i++) {
    const e = list[i], p = pos[i];
    const focused = e.cid === focusCid;
    nodesSvg += `<g class="rel-node${focused ? ' focus' : ''}" data-cid="${esc(e.cid)}" ` +
      `transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">` +
      `<circle class="rel-badge" r="24" style="fill:${crewHue(e.cid)}"/>` +
      (focused ? '<circle class="rel-ring" r="29"/>' : '') +
      `<text class="rel-initials" y="6">${esc(crewInitials(e.name))}</text>` +
      `<text class="rel-surname" y="46">${esc(surnameOf(e.name))}</text></g>`;
  }
  svg.innerHTML = edgesSvg + tagsSvg + nodesSvg; // edges behind, tags mid, nodes on top
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
  const track = document.createElement('div');
  track.className = 'morale-track';
  const fill = document.createElement('div');
  fill.className = 'morale-fill';
  track.appendChild(fill);
  col.appendChild(nameEl); col.appendChild(roleEl); col.appendChild(track);
  row.appendChild(avatar); row.appendChild(col);
  const rec = { el: row, entry, avatar, portraitKey: portraitKeyOf(entry), nameEl, roleEl, fill };
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

function reflectRowSelection() {
  const sel = selectedRosterEntry(_frame, _roster);
  const selCid = sel ? String(sel.cid) : null;
  document.querySelectorAll('.crew-row, .crew-trow').forEach((r) => {
    r.classList.toggle('sel', /** @type {HTMLElement} */ (r).dataset.cid === selCid);
    r.classList.remove('pending'); // the render pass is the settle point (IX-44)
  });
}

const TABLE_CELLS = ['tc-name', 'tc-role', 'tc-mood', 'tc-morale', 'tc-task', 'tc-deck'];

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
  const rec = { el: row, entry, cells };
  row.onclick = () => crewRowClick(rec.entry, row);
  return rec;
}

function updateTableRow(rec, entry) {
  const mv = Math.max(0, Math.min(1, entry.morale || 0));
  setText(rec.cells['tc-name'], surnameFirst(entry.name)); // IX-72: SURNAME-first identity
  setText(rec.cells['tc-role'], entry.role || '');
  setText(rec.cells['tc-mood'], entry.mood || '');
  setText(rec.cells['tc-morale'], Math.round(mv * 100) + '%');
  const color = moraleColor(mv);
  if (rec.cells['tc-morale'].style.color !== color) rec.cells['tc-morale'].style.color = color;
  setText(rec.cells['tc-task'], entry.task || '');
  setText(rec.cells['tc-deck'], 'DECK ' + entry.deck);
}

/** CREW tab (IX-72): the roster long-form, host order, row click = the selection flow.
 *  Same keyed in-place reconciliation as CREW WATCH. */
function renderCrewTable() {
  const wrap = $('tab-crew');
  if (!wrap) return;
  const list = crewList();
  setEmptyLine(wrap, list.length === 0);
  reconcileRows(wrap, _tableRows, list, makeTableRow, updateTableRow);
  reflectRowSelection();
}

/** MOSS tab (IX-73): honest guidance + a live line when the terminal drawer is open. */
function renderMossTab() {
  const wrap = $('tab-moss');
  if (!wrap) return;
  const tid = _panels ? _panels.openTerminalTid() : null;
  wrap.replaceChildren();
  const msg = document.createElement('div');
  msg.className = 'menu-msg';
  msg.textContent = 'MOSS terminals live on the deck. Click a console to open its program in the IDE.';
  wrap.appendChild(msg);
  if (tid != null) {
    const live = document.createElement('div');
    live.className = 'menu-msg moss-live';
    live.textContent = 'TERMINAL ' + tid + ' — IDE OPEN';
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
    if (_tab === 'relations') renderRelationsWeb(); // clear the focus highlight (IX-R2)
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
  // IX-R7: while RELATIONS is active, the readout gains the two directed regard sections below the
  // normal glance content. The [T]/[M]/BIOGRAPHY controls (below, in .ro-actions) are untouched.
  if (_tab === 'relations') html += regardSectionsHtml(sel);
  body.innerHTML = html;
  if (talk) talk.disabled = false;
  if (move) move.disabled = false;
  if (bio) bio.disabled = !_citizens.has(sel.cid); // IX-53: no cache → disabled, never an empty card
  if (_tab === 'relations') renderRelationsWeb();   // selection drives the web focus (IX-R2)
  reflectArmed(); // move-hint surname may have changed
}

/** The two directed regard sections for the focused crew (IX-R7): THEIR REGARD FOR OTHERS
 *  (outgoing "→ NAME  +N") and HOW OTHERS SEE {SURNAME} (incoming "NAME →  +N"), each with the
 *  relationship note beneath. Signed values: positive green, negative rust (VS-R). */
function regardSectionsHtml(sel) {
  const { outgoing, incoming } = regardRows(relEdges(), sel.cid);
  const byCid = new Map(crewList().map((e) => [e.cid, e]));
  const rowHtml = (r, arrowBefore) => {
    const other = byCid.get(r.cid);
    const label = other ? surnameOf(other.name) : ('#' + r.cid);
    const vcls = r.opinion > 0 ? 'pos' : r.opinion < 0 ? 'neg' : 'zero';
    const head = arrowBefore ? `→ ${esc(label)}` : `${esc(label)} →`;
    return `<div class="rr-row"><div class="rr-line"><span class="rr-name">${head}</span>` +
      `<span class="rr-val ${vcls}">${esc(signed(r.opinion))}</span></div>` +
      (r.note ? `<div class="rr-note">${esc(r.note.toUpperCase())}</div>` : '') + '</div>';
  };
  let h = '<div class="rr-section"><div class="zone-label">THEIR REGARD FOR OTHERS</div>';
  h += outgoing.length ? outgoing.map((r) => rowHtml(r, true)).join('')
    : '<div class="ro-guide">No recorded regard.</div>';
  h += '</div><div class="rr-section"><div class="zone-label">HOW OTHERS SEE ' +
    esc(surnameOf(sel.name)) + '</div>';
  h += incoming.length ? incoming.map((r) => rowHtml(r, false)).join('')
    : '<div class="ro-guide">No one has recorded regard.</div>';
  return h + '</div>';
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
  if (_panels) _panels.citizenIfOpen(m, PORTRAIT_REGISTRY);
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

/** Route a MOSS terminal event to the open drawer. @param {import('../wire/messages.js').MossMsg} m */
export function renderMoss(m) {
  panels().mossEvent(m);
}

/** Reflect the LLM backend status in the top-bar chip: backend name, degraded flag, cost/hr.
 *  Hidden until the first llmstatus message arrives. @param {import('../wire/messages.js').LlmStatusMsg} m */
export function renderLlmStatus(m) {
  const chip = $('s-llmchip');
  if (!chip) return;
  chip.style.display = '';
  const backend = m.backend || '—';
  const cost = typeof m.costPerHour === 'number' && isFinite(m.costPerHour)
    ? ' · $' + m.costPerHour.toFixed(2) + '/h' : '';
  $('s-llm').textContent = backend + (m.degraded ? ' (degraded)' : '') + cost;
  chip.classList.toggle('degraded', !!m.degraded);
}
