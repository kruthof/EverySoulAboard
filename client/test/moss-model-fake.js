// TEST DOUBLE for `src/ui/moss-model.js` — NOT the shipping model.
//
// The `moss-model` lane owns `moss-model.js`; this lane may not edit it, and in this worktree it is
// still the throwing stub. So the DOM lane's tests and its design harness
// (`client/tools/moss-preview.html`) drive the screen through THIS module.
//
// It is SHAPE-FAITHFUL to the real model as landed on `lane/moss-model` (`b17d451`) — same return
// fields, same sentinels, same preformatted row/device strings, same `{model, effects, handled,
// route}` from `keyPress`. That is the point: a double that returned a *convenient* shape would
// let `moss-screen.js` pass its own tests and then render blank against the real brain. Its
// BEHAVIOUR is deliberately simpler (no history stash, no fault-token join, no PROGRAM IDE state)
// — those are the model lane's tests to write, not this lane's.

import * as MODEL from '../src/ui/moss-model.js';

/**
 * Row normalization comes from the AUTHORITATIVE decoder, `moss-model.js:rowObj` — there must not
 * be a second one. It lands with the model lane's real bodies; while `moss-model.js` is still the
 * frozen stub in this worktree it is absent, so this stands in with rowObj's exact rules.
 *
 * DELETE THE FALLBACK the moment `lane/moss-model` is merged. Note the defaults: a missing state is
 * `-1` (renders UNKNOWN), NEVER `0` (NOMINAL) — DA-M1 forbids inventing a healthy reading for a row
 * we cannot read, and the decoder this replaced got precisely that wrong.
 */
const rowObj = MODEL.rowObj || ((t) => {
  if (!Array.isArray(t) || typeof t[0] !== 'string' || t[0] === '') return null;
  const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const s = (v) => (typeof v === 'string' ? v : '');
  return { id: t[0], label: s(t[1]) || t[0].split('_').join(' ').toUpperCase(), load: n(t[2], -1),
    state: n(t[3], -1), faultDay: n(t[4], -1), faultText: s(t[5]), advisory: s(t[6]) };
});

export const SCREEN = { LEDGER: 'ledger', DETAIL: 'detail', FAULTLOG: 'faultlog', PROGRAM: 'program' };
export const STATE = { NOMINAL: 0, ATTEND: 1, DEGRADED: 2, OFFLINE: 3 };
export const BAR_WIDTH = 8;
export const PROMPT_MAX = 240;
export const NO_TELEMETRY = 'NO TELEMETRY — LINK DOWN';
export const FAULT_CAVEAT =
  'A FAULT LINE IS THE LAST THING THAT WENT WRONG, NOT THE CURRENT PROBLEM.';

const STATE_TEXT = ['NOMINAL', 'ATTEND', 'DEGRADED', 'OFFLINE'];

export function openMoss() {
  return {
    screen: SCREEN.LEDGER, stack: [], linked: false,
    hull: '', day: -1, uptime: -1,
    rows: [], selectedId: null,
    detail: null, filterId: null,
    chron: [], log: [],
    prompt: '', history: [], histIdx: -1,
    console: [],
  };
}

export function reduceSystems(model, msg) {
  if (!msg || !Array.isArray(msg.rows)) return model;
  const rows = [];
  for (const t of msg.rows) { const r = rowObj(t); if (r) rows.push(r); }
  // IX-M12 — selection is preserved by row ID, never by index.
  const keep = rows.some((r) => r.id === model.selectedId) ? model.selectedId
    : (rows.length ? rows[0].id : null);
  return { ...model, linked: true, rows, selectedId: keep,
    hull: msg.hull || '', day: msg.day | 0, uptime: msg.uptime | 0 };
}

export function reduceMossEvent(model, msg) {
  if (!msg || typeof msg.ev !== 'string') return model;
  if (msg.ev === 'sys') {
    if (!model.detail || model.detail.tid !== String(msg.tid)) return model;
    const devices = (Array.isArray(msg.devices) ? msg.devices : []).map((d) => ({
      name: String(d[0]), kind: String(d[1]), condition: d[2], powered: d[3] === 1,
      rate: d[4], deck: d[5], x: d[6], y: d[7], note: d[8] || '',
    }));
    // §1.2's `derivation` (IX-M22) is the HOST's account and lives on the model, not the screen.
    return { ...model,
      detail: { tid: model.detail.tid, devices, loading: false,
        derivation: String(msg.derivation == null ? '' : msg.derivation).trim() } };
  }
  if (msg.ev === 'exec') {
    const lines = (Array.isArray(msg.lines) ? msg.lines : [])
      .map((l) => ({ stream: l[0] | 0, text: String(l[1]) }));
    return { ...model, console: model.console.concat(lines) };
  }
  return model;
}

export function reduceChron(model, msg) {
  const days = msg && Array.isArray(msg.days) ? msg.days : null;
  if (!days) return model;
  const chron = [];
  for (const d of days) {
    if (d.headline) chron.push({ day: d.day | 0, text: String(d.headline) });
    for (const l of (d.lines || [])) chron.push({ day: d.day | 0, text: String(l) });
  }
  return { ...model, chron };
}

export function reduceLog(model, msg) {
  const lines = msg && Array.isArray(msg.lines) ? msg.lines : null;
  if (!lines) return model;
  return { ...model, log: lines.map((l) => ({ day: -1, text: String(l) })) };
}

// ---- input: the IX-M8 routing table ------------------------------------------------------------

/** Key → [routeWhenPromptEmpty, routeWhenPromptHasText] on the LEDGER screen. */
export const KEY_ROUTE = {
  arrowup: ['nav', 'prompt'], arrowdown: ['nav', 'prompt'],
  enter: ['nav', 'prompt'], escape: ['nav', 'prompt'],
  l: ['nav', 'pass'], p: ['nav', 'pass'],
  pageup: ['nav', 'nav'], pagedown: ['nav', 'nav'],
  home: ['nav', 'pass'], end: ['nav', 'pass'],
  tab: ['pass', 'pass'],
};

const hasMod = (m) => !!(m && (m.ctrl || m.ctrlKey || m.alt || m.altKey || m.meta || m.metaKey));

export function routeKey(model, key, mods) {
  if (hasMod(mods)) return 'pass';
  const k = String(key == null ? '' : key).toLowerCase();
  const row = Object.prototype.hasOwnProperty.call(KEY_ROUTE, k) ? KEY_ROUTE[k] : null;
  if (!row) return 'pass';
  const screen = model ? model.screen : SCREEN.LEDGER;
  if (screen === SCREEN.PROGRAM) return k === 'escape' ? 'nav' : 'pass';
  if (screen !== SCREEN.LEDGER) return row[0] === 'prompt' ? 'nav' : row[0];
  return row[model.prompt.length === 0 ? 0 : 1];
}

export function keyPress(model, key, mods) {
  const route = routeKey(model, key, mods);
  const k = String(key == null ? '' : key).toLowerCase();
  if (route === 'pass') return { model, effects: [], handled: false, route };
  const r = route === 'prompt' ? promptKey(model, k) : navKey(model, k);
  return { model: r.model, effects: r.effects || [], handled: !!r.handled, route };
}

function promptKey(m, k) {
  if (k === 'enter') { const o = submitCommand(m, m.prompt); return { ...o, handled: true }; }
  if (k === 'escape') return { model: { ...m, prompt: '', histIdx: -1 }, handled: true };
  if (k === 'arrowup' || k === 'arrowdown') {
    if (!m.history.length) return { model: m, handled: false };
    const at = k === 'arrowup' ? Math.min(m.history.length - 1, m.histIdx + 1)
      : Math.max(-1, m.histIdx - 1);
    return { model: { ...m, histIdx: at, prompt: at < 0 ? '' : m.history[at] }, handled: true };
  }
  return { model: m, handled: false };
}

function navKey(m, k) {
  const at = selIndex(m);
  const to = (i) => {
    if (m.screen !== SCREEN.LEDGER || !m.rows.length) return { model: m, handled: false };
    const id = m.rows[Math.max(0, Math.min(m.rows.length - 1, i))].id;
    return { model: id === m.selectedId ? m : { ...m, selectedId: id }, handled: true };
  };
  switch (k) {
    case 'arrowup': return to(at - 1);
    case 'arrowdown': return to(at + 1);
    case 'pageup': return to(at - 5);
    case 'pagedown': return to(at + 5);
    case 'home': return to(0);
    case 'end': return to(m.rows.length - 1);
    case 'enter': {
      if (m.screen !== SCREEN.LEDGER || !m.selectedId) return { model: m, handled: false };
      return { model: { ...m, screen: SCREEN.DETAIL, stack: m.stack.concat([m.screen]),
        detail: { tid: m.selectedId, devices: [], loading: true } },
      effects: [{ k: 'moss', op: 'sys', tid: m.selectedId }], handled: true };
    }
    case 'l': {
      if (m.screen === SCREEN.FAULTLOG) return { ...pop(m), handled: true };
      const filterId = m.screen === SCREEN.DETAIL && m.detail ? m.detail.tid : null;
      return { model: { ...m, screen: SCREEN.FAULTLOG, stack: m.stack.concat([m.screen]), filterId },
        effects: [{ k: 'chron' }], handled: true };
    }
    case 'p': {
      const next = { ...m, screen: SCREEN.PROGRAM };
      if (m.screen !== SCREEN.PROGRAM) next.stack = m.stack.concat([m.screen]);
      return { model: next, handled: true };
    }
    case 'escape':
      if (m.stack.length) return { ...pop(m), handled: true };
      return { model: m, effects: [{ k: 'exit' }], handled: true };
    default: return { model: m, handled: false };
  }
}

function pop(m) {
  const stack = m.stack.slice(0, -1);
  const screen = m.stack[m.stack.length - 1];
  return { model: { ...m, screen, stack, filterId: screen === SCREEN.FAULTLOG ? m.filterId : null } };
}

export function editPrompt(model, text) {
  // Bounded at PROMPT_MAX exactly as the real model is; the DOM caps independently (IX-M42) and
  // `moss-screen`'s own cap is probed by breaking it (see the mutation-probe notes).
  return { ...model, prompt: String(text == null ? '' : text).slice(0, PROMPT_MAX), histIdx: -1 };
}

export function submitCommand(model, text) {
  const raw = String(text == null ? '' : text).trim();
  let m = { ...model, prompt: '', histIdx: -1 };
  if (!raw) return { model: m, effects: [] };
  m = { ...m, console: m.console.concat([{ stream: 0, text: '> ' + raw }]),
    history: [raw].concat(m.history) };
  const p = parseCommand(raw);
  if (p.verb === 'clear') return { model: { ...m, console: [] }, effects: [] };
  if (p.verb === 'exit') return { model: m, effects: [{ k: 'exit' }] };
  if (!m.linked && (p.kind === 'device' || p.kind === 'read')) {
    return { model: { ...m, console: m.console.concat([{ stream: 2, text: NO_TELEMETRY + ' — COMMAND REFUSED' }]) },
      effects: [] };
  }
  return { model: m, effects: [{ k: 'moss', op: 'exec', text: raw }] };
}

const NAV_VERBS = ['help', 'status', 'open', 'log', 'prog', 'clear', 'exit'];

export function parseCommand(text) {
  const raw = String(text == null ? '' : text).trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const verb = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);
  if (!verb) return { verb: '', args: [], raw, kind: 'bad' };
  if (NAV_VERBS.indexOf(verb) >= 0) return { verb, args, raw, kind: 'nav' };
  if (verb.indexOf('.') > 0 && !args.length) return { verb, args, raw, kind: 'read' };
  return { verb, args, raw, kind: 'device' };
}

export function normalizeSystemId(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ---- formatters --------------------------------------------------------------------------------

export function loadBar(loadPct, width) {
  const w = width > 0 ? width : BAR_WIDTH;
  if (!(loadPct >= 0)) return '[' + ' '.repeat(w) + ']';
  const filled = Math.max(0, Math.min(w, Math.round((loadPct / 100) * w)));
  return '[' + '█'.repeat(filled) + '▒'.repeat(w - filled) + ']';
}

export function loadText(loadPct) { return loadPct >= 0 ? Math.round(loadPct) + '%' : '--'; }

export function stateCell(state) {
  const s = state | 0;
  return { text: STATE_TEXT[s] || 'UNKNOWN', warn: s === STATE.ATTEND || s === STATE.DEGRADED };
}

export function faultCell(faultDay, faultText) {
  if (!(faultDay >= 0)) return '—';
  const t = String(faultText == null ? '' : faultText).trim();
  return t ? 'DAY ' + faultDay + ' · ' + t : 'DAY ' + faultDay;
}

export function uptimeText(ticks) {
  if (!(ticks >= 0)) return '—';
  const s = Math.floor(ticks / 10);
  return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') +
    ':' + String(s % 60).padStart(2, '0');
}

export function headerLines(model) {
  return [
    'MOSS ▮ MODULAR OPERATIONS & SYSTEMS SUPERVISOR — REV 4.2.1',
    'PERILUNE HULL ' + (model.hull || '—') + ' · DAY ' + (model.day >= 0 ? model.day : '—') +
      ' · UPTIME ' + uptimeText(model.uptime),
  ];
}

export function footerHints(model) {
  switch (model.screen) {
    case SCREEN.DETAIL: return ['[L] FAULT LOG', '[P] PROGRAMS', '[ESC] BACK TO LEDGER'];
    case SCREEN.FAULTLOG: return ['[L] CLOSE LOG', '[ESC] BACK'];
    case SCREEN.PROGRAM: return ['[ESC] BACK'];
    default: return ['[↑↓] SELECT ROW', '[ENTER] SYSTEM DETAIL', '[L] FAULT LOG', '[P] PROGRAMS',
      '[ESC] BACK TO SHIP'];
  }
}

function selIndex(model) {
  const i = model.rows.findIndex((r) => r.id === model.selectedId);
  return i < 0 ? 0 : i;
}

/** Rows arrive at the screen ALREADY FORMATTED — the screen writes strings onto a monospace grid
 *  and makes no rendering decisions of its own. Same field set as the real model. */
export function ledgerView(model) {
  const i = model.rows.length ? selIndex(model) : -1;
  const rows = model.rows.map((r, n) => {
    const st = stateCell(r.state);
    return {
      id: r.id, label: r.label, load: r.load,
      bar: loadBar(r.load, BAR_WIDTH), loadText: loadText(r.load),
      state: r.state, stateText: st.text, warn: st.warn,
      fault: faultCell(r.faultDay, r.faultText),
      advisory: r.advisory, selected: n === i,
    };
  });
  return {
    rows, selectedIndex: i,
    advisory: i >= 0 ? model.rows[i].advisory : '',
    linked: model.linked,
    notice: model.linked ? '' : NO_TELEMETRY,
  };
}

export function detailView(model) {
  if (!model.detail) return { title: '', devices: [], notes: [], loading: false };
  const id = model.detail.tid;
  const row = model.rows.find((r) => r.id === id);
  const devices = model.detail.devices.map((d) => ({
    name: d.name, kind: d.kind,
    condition: d.condition, conditionBar: loadBar(d.condition, BAR_WIDTH), conditionText: loadText(d.condition),
    powered: d.powered, poweredText: d.powered ? 'PWR' : 'OFF',
    rate: d.rate, rateText: loadText(d.rate),
    deck: d.deck, x: d.x, y: d.y,
    place: d.deck >= 0 ? 'DECK ' + d.deck + ' · ' + d.x + ',' + d.y : '—',
    note: d.note,
  }));
  // No derivation until the host's own account arrives — while `loading` there are NO notes at all,
  // so the screen must not reserve or draw a notes block for that frame.
  const notes = model.detail.loading ? []
    : [model.detail.derivation || 'DERIVATION UNDOCUMENTED — this row\'s numbers are not explained here.',
      FAULT_CAVEAT];
  return {
    title: row ? row.label : normalizeSystemId(id).split('_').join(' ').toUpperCase(),
    devices,
    notes,
    loading: !!model.detail.loading,
  };
}

export function faultLogView(model) {
  const id = model.filterId;
  const row = id ? model.rows.find((r) => r.id === id) : null;
  const keep = (e) => !id || e.text.toLowerCase().indexOf(normalizeSystemId(id).split('_')[0]) >= 0;
  const entries = [];
  for (let i = model.log.length - 1; i >= 0; i--) if (keep(model.log[i])) entries.push({ ...model.log[i], live: true });
  for (let i = model.chron.length - 1; i >= 0; i--) if (keep(model.chron[i])) entries.push({ ...model.chron[i], live: false });
  return {
    title: id ? 'FAULT LOG — ' + (row ? row.label : id) : 'FAULT LOG',
    entries,
    filterId: id == null ? null : id,
  };
}

export function consoleLines(model) { return model.console.map((l) => ({ stream: l.stream, text: l.text })); }
