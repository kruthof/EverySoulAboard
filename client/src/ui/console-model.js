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

/** @typedef {null|'wall'|'door'|'cancel'|'dig'|'stockpile'|'strip'|'move'} ArmedTool */

const BUILD_KINDS = ['wall', 'door', 'cancel'];
export function isBuildTool(t) { return BUILD_KINDS.indexOf(t) >= 0; }

// E0-3/E0-5 ORDER tools. Structurally these behave exactly like the build kinds — they share the
// one armed slot, live in the BUILD tab, and lower a click to a single tile order — but they are a
// DIFFERENT wire verb (Cmd.dig / Cmd.stockpile / Cmd.strip, never Cmd.build), so the click sites
// must be able to tell them apart. Keeping `isBuildTool` narrow and adding a separate predicate
// makes that distinction explicit rather than leaving it to a string compare at each call site.
// 'strip' (E0-5 deconstruct) joins dig/stockpile as an order verb.
const ORDER_KINDS = ['dig', 'stockpile', 'strip'];
export function isOrderTool(t) { return ORDER_KINDS.indexOf(t) >= 0; }

/** Tools that live in the BUILD tab's palette — i.e. everything that a tab switch away from BUILD
 *  should disarm. MOVE is deliberately NOT one: it is a crew order and survives the tab. PURE. */
export function isPaletteTool(t) { return isBuildTool(t) || isOrderTool(t); }

/**
 * The armed-tool transition table. Events:
 *   {t:'toggle', tool}   palette / MOVE ORDER button click: arm, or disarm when already armed
 *   {t:'keyB'}           B: any build tool armed → disarm; else arm 'wall'
 *   {t:'keyX'}           X: 'cancel' armed → disarm; else arm 'cancel'
 *   {t:'keyG'}           G: 'dig' armed → disarm; else arm 'dig' (E0-3)
 *   {t:'keyZ'}           Z: 'stockpile' armed → disarm; else arm 'stockpile' (E0-3)
 *   {t:'keyV'}           V: 'strip' armed → disarm; else arm 'strip' (E0-5; V = salVage)
 *   {t:'escape'}         Esc: disarm (stack step 2)
 *   {t:'tab', tab}       bottom-bar tab switch: leaving BUILD disarms palette tools (move survives)
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
    case 'keyG': return s === 'dig' ? null : 'dig';
    case 'keyZ': return s === 'stockpile' ? null : 'stockpile';
    case 'keyV': return s === 'strip' ? null : 'strip';
    case 'escape': return null;
    case 'disconnect': return null;
    case 'tab': return ev.tab !== 'build' && isPaletteTool(s) ? null : s;
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
 * the idle chrome). surname only matters for 'move'; stockLabel only for 'stockpile'.
 *
 * The stockpile line NAMES ITS FILTER (E0-4 WP-5), and that is load-bearing rather than decorative:
 * a filtered stockpile tile is visually identical to an unfiltered one — the frame carries raw
 * GlyphColor bytes and there is no wire channel for a zone's accept-set (MECHANICS §13) — so this
 * string is the only place in the whole client where a player can read the filter they are about to
 * paint. An absent label degrades to ALL, matching defaultStockFilter().
 * @param {ArmedTool} tool @param {string} [surname] @param {string} [stockLabel]
 * @returns {string|null}
 */
export function hintLine(tool, surname, stockLabel) {
  if (tool === 'wall') return 'BUILD ▸ WALL — CLICK DECK TO PLACE · ESC EXIT';
  if (tool === 'door') return 'BUILD ▸ DOOR — CLICK DECK TO PLACE · ESC EXIT';
  if (tool === 'cancel') return 'CANCEL ▸ CLICK A QUEUED ORDER TO REVOKE · ESC EXIT';
  if (tool === 'move') return 'MOVE ORDER ▸ CLICK A TILE — ' + (surname || 'CREW') + ' WILL WALK THERE · ESC EXIT';
  if (tool === 'stockpile') return 'STOCKPILE ▸ CLICK DECK TO ZONE — ACCEPTS ' + (stockLabel || 'ALL') + ' · ESC EXIT';
  return null;
}

// ---- build ghosts (designs channel): the persistent designation markers ----

/** The pending designations on a given deck, from the authoritative `designs` wire. Each cell is
 *  the tuple [x, y, deck, kind, delivered, required] (kind 0 wall / 1 door); elements 5 and 6 are
 *  the host's APPEND-ONLY material ledger and are optional — an older four-element tuple decodes
 *  with an empty ledger and no starved state, exactly as before. Tolerant: a null/garbage list →
 *  []. PURE.
 *
 *  `state` is the ghost's supply story, which is the whole point of carrying the ledger: a site
 *  nobody is feeding looked IDENTICAL to one under active construction, so an order that could
 *  never complete just sat there silently.
 *    'starved' — required material, none of it delivered (nothing is arriving)
 *    'supplied' — partially delivered, still short
 *    'ready'   — the full requirement is on site; only the building is left
 *    'plain'   — no ledger on the wire (nothing to say) */
export function designsOnDeck(cells, deck) {
  if (!Array.isArray(cells)) return [];
  const out = [];
  for (const c of cells) {
    if (Array.isArray(c) && c.length >= 4 && c[2] === deck) {
      const delivered = c.length >= 6 && Number.isFinite(c[4]) ? c[4] : 0;
      const required = c.length >= 6 && Number.isFinite(c[5]) ? c[5] : 0;
      out.push({ x: c[0], y: c[1], kind: c[3], delivered, required, state: ghostState(delivered, required) });
    }
  }
  return out;
}

/** The supply state of a build site from its material ledger (see `designsOnDeck`). PURE. */
export function ghostState(delivered, required) {
  if (!(required > 0)) return 'plain';
  if (delivered >= required) return 'ready';
  return delivered > 0 ? 'supplied' : 'starved';
}

/** The "n/m" material label under a ghost, or '' when the wire carried no ledger. PURE. */
export function ghostLabel(g) {
  if (!g || !(g.required > 0)) return '';
  return (g.delivered || 0) + '/' + g.required;
}

/** The one-glyph marker for a designation kind (0 wall → ▚, 1 door → ▯, else ?). PURE. */
export function designGlyph(kind) {
  return kind === 0 ? '▚' : kind === 1 ? '▯' : '?';
}

// ---- on-map work markers (roster deck/x/y/task, no wire change) ----

/** Leading task verb → the short tag shown on the map and in CREW WATCH. The host's roster label
 *  always OPENS with one of these verbs (see GameSession.TaskLabel, which is test-pinned against
 *  this very vocabulary); a job-less label (Walking / Holding / Idle) maps to null and gets no
 *  marker — that is the honesty rule: standing around must not look like working. */
const TASK_TAGS = {
  digging: 'DIG',
  fetching: 'HAUL',
  hauling: 'HAUL',
  building: 'BUILD',
  stripping: 'STRIP', // E0-5 deconstruct — build's inverse, so it earns its own tag, not BUILD
  servicing: 'SVC',
  crafting: 'CRAFT',
  eating: 'MEAL',
  drinking: 'WATER',
};

/** The host's en-route verb ("Heading to service scrubber_ls"): a crew member who HAS a job but is
 *  still walking to it. Deliberately absent from TASK_TAGS — a tag floating over a walking pawn is
 *  the very "claimed to be fixing X while doing nothing visible" complaint the markers exist to
 *  answer — while CREW WATCH still reads it as assigned work, because they are not idle. */
const EN_ROUTE_VERB = 'heading';

/** The first word of a roster task label, lowercased ('' for a missing/garbage label). PURE. */
function taskVerb(task) {
  return typeof task === 'string' ? task.trim().split(/\s+/)[0].toLowerCase() : '';
}

/** The work tag for a roster task label, or null when the crew member is not (yet) working on
 *  something at a place: idle, merely walking, or still en route to the job. PURE. */
export function taskTag(task) {
  const first = taskVerb(task);
  return Object.prototype.hasOwnProperty.call(TASK_TAGS, first) ? TASK_TAGS[first] : null;
}

/** The CREW WATCH task cell for a roster entry: the label the host sent plus whether it counts as
 *  real work (so the row can dim the doing-nothing case instead of implying activity). A crew
 *  member en route to a job counts — they are assigned, just not there yet. PURE. */
export function watchTask(entry) {
  const task = entry && typeof entry.task === 'string' ? entry.task.trim() : '';
  return { text: task || '—', working: taskTag(task) != null || taskVerb(task) === EN_ROUTE_VERB };
}

/** Crew on `deck` who are actually working, as map markers joined from the roster's own
 *  deck/x/y/task (no extra wire field needed). Idle/walking crew are deliberately absent: the
 *  marker answers "is anyone truly working on something", so it must only ever appear for a real
 *  job. Tolerant of a missing/garbage roster. PURE. */
export function workMarkers(crew, deck) {
  const out = [];
  if (!Array.isArray(crew)) return out;
  for (const e of crew) {
    if (!e || e.deck !== deck || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    const tag = taskTag(e.task);
    if (!tag) continue;
    out.push({ cid: e.cid, x: e.x, y: e.y, tag, task: e.task });
  }
  return out;
}

// ---- paused-ship nudge (when to show "PRESS SPACE TO RUN") ----

/** How long the nudge lingers before auto-dismissing (ms). */
export const NUDGE_MS = 4200;

/**
 * The paused-nudge state reducer. The nudge fires when the player arms a build tool or places a
 * designation WHILE the ship is paused (first-time players never unpause and think nothing works);
 * it dismisses on unpause. Events:
 *   {t:'trigger', paused}  an arm/placement happened — start the timer only while paused
 *   {t:'unpause'}          the sim resumed — clear immediately
 * State is {shownAt:number|null}. PURE (visibility is time-derived via nudgeVisible).
 * @param {{shownAt:number|null}|null} state @param {{t:string, paused?:boolean}|null} ev
 * @param {number} now @returns {{shownAt:number|null}}
 */
export function nextNudge(state, ev, now) {
  const s = state || { shownAt: null };
  if (!ev || typeof ev.t !== 'string') return s;
  if (ev.t === 'trigger') return ev.paused ? { shownAt: now } : s;
  if (ev.t === 'unpause') return { shownAt: null };
  return s;
}

/** Whether the nudge should currently render (within NUDGE_MS of its trigger). PURE. */
export function nudgeVisible(state, now) {
  return !!(state && state.shownAt != null && now - state.shownAt < NUDGE_MS);
}

// ---- CREW-tab scroll affordance (▾ N MORE) ----

/**
 * How many rows sit below the visible fold of a scroll container, for the "▾ N MORE" indicator.
 * Derived from the container's scroll metrics + a uniform row stride; ≤1px of overhang counts as
 * fully scrolled (no false "1 MORE" at the bottom). PURE, node-tested with exact strides.
 * @param {number} scrollTop @param {number} clientHeight @param {number} scrollHeight
 * @param {number} rowStride  a row's height incl. gap
 * @returns {number}
 */
export function moreBelow(scrollTop, clientHeight, scrollHeight, rowStride) {
  const below = scrollHeight - clientHeight - scrollTop;
  if (!(rowStride > 0) || below <= 1) return 0;
  return Math.round(below / rowStride);
}

// ---- MOSS terminal directory (terminals channel) ----

/** The terminal directory from the `terminals` wire, as {tid,deck,x,y} objects. Each entry is the
 *  tuple [tid, deck, x, y]. Tolerant: null/garbage → []. PURE. */
export function terminalList(msg) {
  const list = msg && Array.isArray(msg.list) ? msg.list : Array.isArray(msg) ? msg : [];
  const out = [];
  for (const t of list) {
    if (Array.isArray(t) && t.length >= 4 && t[0] != null && t[0] !== '') {
      out.push({ tid: String(t[0]), deck: t[1], x: t[2], y: t[3] });
    }
  }
  return out;
}

/** The MOSS-tab row label for a terminal: "TID · DECK n". PURE. */
export function terminalLabel(entry) {
  return String(entry && entry.tid != null ? entry.tid : '') + ' · DECK ' +
    String(entry && entry.deck != null ? entry.deck : '?');
}

// ---- Escape priority stack (IX-13 + relations-spec IX-R10 + moss-terminal IX-M2) ----

/**
 * The Escape action, in priority order: an armed tool disarms first, then an open dialogue closes,
 * then an open crew DOSSIER (BIO) card closes, then — if the MOSS terminal has taken the window —
 * Escape belongs to MOSS's OWN inner stack (PROGRAM → DETAIL/FAULTLOG → LEDGER → ship; and a
 * non-empty prompt clears first), then — if the RELATIONS tab is up — Escape returns to the BUILD
 * tab (restoring the ship viewport), else nothing.
 *
 * The rung order armed → dialogue → dossier → MOSS → relations → none is INVARIANT. The `dossier`
 * rung slots in with the other floating-panel closers (dialogue) ABOVE the full-screen-surface
 * navigators (moss, relations): a focused inspector card is dismissed before Escape descends into
 * screen navigation. Without this rung an open BIO card left Escape falling through to the browser
 * (which, in a fullscreen tab, exits fullscreen instead of closing the card).
 * MOSS returns a single `'moss'` verdict rather than its inner step: the inner stack is the MOSS
 * model's pure key state machine (`moss-model.keyPress`), and duplicating it here would give the
 * screen two disagreeing sources of truth. PURE; the caller performs the returned action.
 * @param {{armed:boolean, dialogueOpen:boolean, dossierOpen?:boolean, mossActive?:boolean, relationsActive:boolean}} s
 * @returns {'disarm'|'dialogue'|'dossier'|'moss'|'relations'|'none'}
 */
export function escapeTarget(s) {
  if (s && s.armed) return 'disarm';
  if (s && s.dialogueOpen) return 'dialogue';
  if (s && s.dossierOpen) return 'dossier';
  if (s && s.mossActive) return 'moss';
  if (s && s.relationsActive) return 'relations';
  return 'none';
}
