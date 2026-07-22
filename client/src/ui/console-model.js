// Console view-model — PURE. Every derivation the "Console" UI skin needs that is more than a
// straight DOM write lives here, node-tested, with no DOM and no wire access: the top-bar clock,
// the caution chip heuristic, morale colors, crew-name splitting, the speed-chip label map, the
// sensor-log timestamp splitter, the selection/roster join, the cross-deck pending-click reducer,
// and the armed-tool transition table (the client's ONE input mode slot).
//
// Invariants honored: InvariantCulture-safe (no locale APIs — padStart + ASCII toUpperCase only),
// nothing here fabricates data the wire doesn't carry, and everything is deterministic.

import { selectedCrewCid } from '../wire/messages.js';

// ---- clock (IX-81) ----

/**
 * HH:MM from a 0..1 day fraction. f is clamped to [0,1) first so f≈1 renders 23:59, never 24:00.
 * Zero-padded via padStart — no locale APIs.
 * @param {number} f @returns {string}
 */
export function clockHHMM(f) {
  let v = typeof f === 'number' && isFinite(f) ? f : 0;
  if (v < 0) v = 0;
  if (v >= 1) v = 1 - 1e-9; // clamp to [0,1): 23:59 is the latest printable minute
  const hours = v * 24;
  const hh = Math.floor(hours);
  const mm = Math.floor((hours - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// ---- caution chip (IX-84) ----

/**
 * Derive the top-bar caution chip from ship-wide metrics. Stateless (no hysteresis — metrics move
 * slowly at 1 Hz). Rails deliberately reuse the established metric-bar thresholds and CO₂
 * 1000/2000 rails: one danger language across the UI.
 * @param {{co2ppm?:number,oxygen?:number,power?:number,structural?:number,water?:number,food?:number}} m
 * @returns {{level:'idle'|'warn'|'alert', label:string}}
 */
export function cautionState(m) {
  const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const co2 = n(m && m.co2ppm, 0);
  const o2 = n(m && m.oxygen, 1), pwr = n(m && m.power, 1), str = n(m && m.structural, 1);
  const h2o = n(m && m.water, 1), food = n(m && m.food, 1);
  if (co2 >= 2000 || o2 < 0.33 || pwr < 0.33 || str < 0.33) {
    return { level: 'alert', label: 'MASTER CAUTION' };
  }
  // warn-cause precedence is fixed so the label is deterministic when several trip:
  // O₂ > PWR > STRUCT > CO₂ > H₂O > FOOD.
  const cause =
    o2 < 0.5 ? 'O₂' :
    pwr < 0.5 ? 'PWR' :
    str < 0.5 ? 'STRUCT' :
    co2 >= 1000 ? 'CO₂' :
    h2o < 0.33 ? 'H₂O' :
    food < 0.33 ? 'FOOD' : null;
  if (cause) return { level: 'warn', label: 'CAUTION · ' + cause };
  return { level: 'idle', label: 'NOMINAL' };
}

// ---- morale (VS-4 / IX-47: 75/50 rails — distinct from the ship-vitals 66/33 barColor) ----

/** @param {number} m 0..1 @returns {string} a CSS custom-property reference */
export function moraleColor(m) {
  return m >= 0.75 ? 'var(--good)' : m >= 0.5 ? 'var(--warn)' : 'var(--bad)';
}

// ---- crew name parts (IX-47; ASCII toUpperCase only — crew names are ASCII by content contract) ----

/** SURNAME = last whitespace-separated token, uppercased. Empty-safe. */
export function surnameOf(name) {
  const parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toUpperCase() : '';
}

/** Initials = first letters of the first + last tokens ("Ada Vale" → "AV"; one token → its first two). */
export function crewInitials(name) {
  const parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Family-name-first identity for the CREW tab (IX-72 "SURNAME NAME", consistent with CREW
 *  WATCH's surname-led rows): "Dmitri Volkov" → "VOLKOV Dmitri". Single token uppercases. */
export function surnameFirst(name) {
  const parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].toUpperCase();
  return parts[parts.length - 1].toUpperCase() + ' ' + parts.slice(0, -1).join(' ');
}

// ---- avatar hue (VS-6: six fixed hues, assigned stably by cid hash) ----

export const CREW_HUES = ['#cf7a33', '#5aa77f', '#c25a3f', '#e8934a', '#b5652a', '#8c8377'];

/** Stable hue per cid — FNV-1a over the cid's string form, mod the palette. Deterministic. */
export function crewHue(cid) {
  const s = cid == null ? '' : String(cid);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return CREW_HUES[(h >>> 0) % CREW_HUES.length];
}

// ---- speed chip (IX-83; unknown values render verbatim — forward-compatible) ----
// 'paused' deliberately has no glyph mapping: the pause chip one control over already says it,
// so the speed chip renders the wire label verbatim (dimmed by the caller) instead of a second ‖.

const SPEED_LABELS = { '1x': '1×', '5x': '5×', '20x': '20×', '100x': '100×', '1000x': '1000×' };

/** @param {string} speed the wire's status.speed @returns {string} */
export function speedLabel(speed) {
  const s = String(speed == null ? '' : speed);
  return Object.prototype.hasOwnProperty.call(SPEED_LABELS, s) ? SPEED_LABELS[s] : s;
}

// ---- sensor log (IX-90: leading D<day.dd> token tinted, remainder verbatim; no time conversion) ----

/**
 * Split one log line into its leading D-token and the remainder. Lines without the token render
 * whole and untinted ({ts:null}).
 * @param {string} line @returns {{ts:string|null, rest:string}}
 */
export function logLineParts(line) {
  const s = String(line == null ? '' : line);
  const m = /^(D\d+\.\d+)\s+(.*)$/s.exec(s);
  return m ? { ts: m[1], rest: m[2] } : { ts: null, rest: s };
}

/** The last n lines of a log message, oldest→newest (render order, newest at the bottom). */
export function logTail(lines, n = 5) {
  const a = Array.isArray(lines) ? lines : [];
  return a.slice(Math.max(0, a.length - n));
}

// ---- crew watch header (IX-47/IX-97) ----

/** @param {number} n @returns {string} */
export function soulsLabel(n) {
  const c = typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return 'CREW WATCH — ' + c + ' SOUL' + (c === 1 ? '' : 'S');
}

// ---- selection / roster join (IX-40/41) ----

/**
 * The roster entry for the host-side selection, or null. Selection truth is frame.sel + frame.crew
 * (via selectedCrewCid); the roster supplies the person. Never latched client-side.
 * @param {object|null} frame
 * @param {{crew?:object[]}|object[]|null} roster  the roster message (or its crew array)
 */
export function selectedRosterEntry(frame, roster) {
  const cid = selectedCrewCid(frame);
  if (cid == null) return null;
  const list = Array.isArray(roster) ? roster
    : roster && Array.isArray(roster.crew) ? roster.crew : [];
  for (const e of list) if (e && e.cid === cid) return e;
  return null;
}

/**
 * Where to click to select a crew member: their CURRENT tile from frame.crew (fresher than the
 * roster snapshot for a walker), falling back to the roster x/y when the cid isn't in frame.crew
 * (fog / other deck).
 * @param {{crew?:number[][]}|null} frame @param {{cid:*,x:number,y:number}} entry
 * @returns {{x:number,y:number}}
 */
export function crewClickTarget(frame, entry) {
  if (frame && Array.isArray(frame.crew)) {
    for (const c of frame.crew) {
      if (Array.isArray(c) && c.length > 3 && c[3] === entry.cid) return { x: c[0], y: c[1] };
    }
  }
  return { x: entry.x, y: entry.y };
}

// ---- cross-deck pending click (IX-42): deck-switch first, click when the deck's frame arrives ----

/**
 * Start a pending cross-deck selection click. deadline is now+1000ms; past it the click drops
 * silently (roster x/y would be stale beyond that).
 * @param {{cid:*,deck:number,x:number,y:number}} entry @param {number} now ms
 */
export function beginPendingClick(entry, now) {
  return { cid: entry.cid, deck: entry.deck, x: entry.x, y: entry.y, deadline: now + 1000 };
}

/**
 * Fold an arriving frame into a pending click. Returns {send, next}: send is the {x,y} to
 * Cmd.click (or null), next the surviving pending state (or null when resolved/expired).
 * @param {{cid:*,deck:number,x:number,y:number,deadline:number}|null} pending
 * @param {{deck?:number,crew?:number[][]}|null} frame
 * @param {number} now ms
 */
export function resolvePendingClick(pending, frame, now) {
  if (!pending) return { send: null, next: null };
  if (now > pending.deadline) return { send: null, next: null };
  if (frame && frame.deck === pending.deck) {
    return { send: crewClickTarget(frame, pending), next: null };
  }
  return { send: null, next: pending };
}

/**
 * IX-42 supersession: any NEWER user selection intent — a plain/armed canvas click
 * ({t:'click'}), another crew-row click ({t:'row-click'}) — or a disconnect
 * ({t:'disconnect'}) drops the pending cross-deck click, so a stale Cmd.click can never
 * clobber the user's later selection when the deck frame lands. Unknown events keep it.
 * @param {object|null} pending @param {{t:string}|null} ev
 */
export function supersedePending(pending, ev) {
  if (!pending) return null;
  const t = ev && ev.t;
  return (t === 'click' || t === 'row-click' || t === 'disconnect') ? null : pending;
}

// ---- armed tool (IX-1/2, IX-10 B/X, IX-30, IX-52): the ONE client-side input mode slot ----

/** @typedef {null|'wall'|'door'|'cancel'|'move'} ArmedTool */

const BUILD_KINDS = ['wall', 'door', 'cancel'];
export function isBuildTool(t) { return BUILD_KINDS.indexOf(t) >= 0; }

/**
 * The armed-tool transition table. Events:
 *   {t:'toggle', tool}   palette / MOVE ORDER button click: arm, or disarm when already armed
 *   {t:'keyB'}           B: any build tool armed → disarm; else arm 'wall'
 *   {t:'keyX'}           X: 'cancel' armed → disarm; else arm 'cancel'
 *   {t:'escape'}         Esc: disarm (stack step 2)
 *   {t:'tab', tab}       bottom-bar tab switch: leaving BUILD disarms build kinds (move survives)
 *   {t:'selectionLost'}  selCid became null: the move order lost its subject → disarm move only
 *   {t:'disconnect'}     link lost: disarm everything
 * Anything unrecognized leaves the state unchanged. PURE.
 * @param {ArmedTool} state @param {{t:string, tool?:string, tab?:string}} ev @returns {ArmedTool}
 */
export function nextArmedTool(state, ev) {
  const s = state === undefined ? null : state;
  if (!ev || typeof ev.t !== 'string') return s;
  switch (ev.t) {
    case 'toggle': return s === ev.tool ? null : (ev.tool || null);
    case 'keyB': return isBuildTool(s) ? null : 'wall';
    case 'keyX': return s === 'cancel' ? null : 'cancel';
    case 'escape': return null;
    case 'disconnect': return null;
    case 'tab': return ev.tab !== 'build' && isBuildTool(s) ? null : s;
    case 'selectionLost': return s === 'move' ? null : s;
    default: return s;
  }
}

/**
 * The CHRONICLE day header, deduplicated: the host's headline often already begins
 * "Day {n} —", so a fixed "DAY {n} — " prefix would print the day twice. Strips a leading
 * day-token matching THIS day (case-insensitive, with any dash/colon separator) before
 * prefixing. Headlines about other days (or none) pass through verbatim.
 * @param {number} day @param {string} headline
 */
export function chronHeader(day, headline) {
  const h = String(headline == null ? '' : headline).trim();
  const d = String(typeof day === 'number' && isFinite(day) ? day : 0);
  const rest = h.replace(new RegExp('^day\\s+' + d + '\\b[\\s—–:.-]*', 'i'), '').trim();
  return rest ? 'DAY ' + d + ' — ' + rest : 'DAY ' + d;
}

/**
 * The stage hint line while a tool is armed (IX-37 / IX-52), or null when idle (the caller shows
 * the idle chrome). surname only matters for 'move'.
 * @param {ArmedTool} tool @param {string} [surname]
 * @returns {string|null}
 */
export function hintLine(tool, surname) {
  if (tool === 'wall') return 'BUILD ▸ WALL — CLICK DECK TO PLACE · ESC EXIT';
  if (tool === 'door') return 'BUILD ▸ DOOR — CLICK DECK TO PLACE · ESC EXIT';
  if (tool === 'cancel') return 'CANCEL ▸ CLICK A QUEUED ORDER TO REVOKE · ESC EXIT';
  if (tool === 'move') return 'MOVE ORDER ▸ CLICK A TILE — ' + (surname || 'CREW') + ' WILL WALK THERE · ESC EXIT';
  return null;
}
