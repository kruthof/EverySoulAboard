// MOSS terminal — the pure brain (`docs/design/perilune-moss-terminal.spec.md` §2). Every
// derivation the phosphor ledger needs beyond a straight DOM write lives here, node-tested:
// the IX-M8 key-routing table, the ESC stack, id-keyed selection (IX-M12), command parsing
// (IX-M10), the `-1` sentinel formatters (VS-M4), and the four screen view-models.
//
// The signatures are FROZEN by spec §2 so the `moss-screen` lane can import this module while it
// is being written. Only the `moss-model` lane edits this file; a signature change is a contract
// request, not a unilateral edit.
//
// PURITY (spec M-PURITY, enforced by a source scan in client/test/moss-model.test.js): this file
// touches no DOM global, no network, no wall clock, no RNG. `Math.round`/`Math.max` are arithmetic
// and fine; anything that would make two identical runs differ is not. The scan reads this file's
// RAW text, so the banned names must not appear even inside a comment — describe them in prose.
// Reducers take a model and return a NEW model; they never mutate their argument (a node test
// deep-freezes the input, which would throw on any in-place write).
//
// Screens: LEDGER (the systems table) → DETAIL (per-device breakdown) / FAULTLOG (history) /
// PROGRAM (the MOSS DSL IDE). Input handlers return {model, effects}; `effects` are requests the
// DOM layer fulfils (see the table in spec §2) — this module never touches the socket.
//
// The IDE half of PROGRAM is `terminal-model.js` (already shipped, already pure): the `source` /
// `diag` / `audit` / `rterror` events are delegated to it rather than reimplemented, so the
// `moss-programs` lane inherits a live editor state machine under `model.program`.

import { initTerminal, openTerminal, reduceMoss, editDraft, beginCompile } from './terminal-model.js';

export const SCREEN = {
  LEDGER: 'ledger', DETAIL: 'detail', FAULTLOG: 'faultlog', PROGRAM: 'program',
  // ⭐ M3-4 — the fifth screen. Reached by TYPING `pods` (OD-P: no letter hotkey), and — unlike
  // every other screen here — it is opened by the REPLY, not by the command: the bay is
  // commission-gated, so the ask can be refused, and a screen that opened first would sit empty
  // beside a refusal it could not show. See `navCommand`'s `pods` case.
  PODBAY: 'podbay',
};
export const STATE = { NOMINAL: 0, ATTEND: 1, DEGRADED: 2, OFFLINE: 3 };

/**
 * The capsule states the POD BAY prints, as the HOST numbers them
 * (`hosts/web/WireFormat.Pods.cs`). Codes are append-only. ⛔ The WORDS are not held here — they
 * travel on each row, so this client keeps no second copy of the vocabulary; these constants exist
 * only so the screen can decide LAYOUT (which rows carry a reason, which are greyed) from the code
 * rather than by matching prose.
 */
export const POD_STATE = { OPEN: 0, SEALED: 1, NO_SIGNAL: 2, CYCLING: 3 };

/** What the POD BAY says when the link answered with a bay that has no capsules in it. An empty
 *  table under a POD BAY heading would read as "everyone is out", which is the opposite claim. */
export const NO_PODS = 'NO CAPSULES ABOARD';

/** Ticks per sim-day — `SimClockUtil.TicksPerDay` (Simulation.TicksPerSecond 10 × 86400). */
export const TICKS_PER_DAY = 864000;
/** Sim ticks per second (`Simulation.TicksPerSecond`). */
export const TICKS_PER_SECOND = 10;
/** VS-M4: the load bar is exactly 8 cells wide. */
export const BAR_WIDTH = 8;
/** IX-M42: the prompt is bounded (the host caps at the same number — this is the client half). */
export const PROMPT_MAX = 240;
/** IX-M9: the command-history ring. */
export const HISTORY_CAP = 50;
/** The `>` transcript ring. */
export const CONSOLE_CAP = 200;
/** IX-M3: how far PageUp/PageDown jump in the ledger. */
export const PAGE_STEP = 5;
/** IX-M13: what the ledger says before any `systems` message has arrived. */
export const NO_TELEMETRY = 'NO TELEMETRY — LINK DOWN';
/** IX-M13's other empty table: the link is up but the payload carried no rows. An empty grid with
 *  no caption reads as "all systems nominal", which is the one thing it must never read as. */
export const NO_ROWS = 'NO ROWS ON THIS LINK';

/** The fixed system ids of spec §1.1, in wire order. Used ONLY as `parseCommand`'s vocabulary
 *  (it has no model to consult); `submitCommand` resolves against the LIVE ledger first, so a row
 *  the host adds later still opens. */
export const SYSTEM_IDS = [
  'reactor', 'life_support', 'water_reclaim', 'hydroponics',
  'thermal', 'fabrication', 'hull_integrity', 'nav_sensors',
];

// IX-M22's derivation prose is NOT held here. §1.2 ships a `derivation` string on the `ev:sys`
// reply: the host does the arithmetic, so the host writes the sentence about it, and there is
// exactly one copy of that sentence in the codebase. A client-side table was tried and deleted —
// it had already drifted into stating THERMAL's ratio upside down (rejection ÷ load, where the
// host computes load ÷ rejection) during the frame before the reply landed. While DETAIL is
// loading the screen renders no derivation at all; IX-M4's `LOADING…` is the honest thing to say.

/**
 * §5.1's weak-join admission, narrowed to what THIS module actually does: the FAULT LOG filter
 * (`faultTokens` below) is a name match on the log text and nothing more, so it has to say so.
 *
 * Deliberately scoped two ways. It names the *fault-log filter in this client*, because §5.1 uses
 * nearly the same words for the ledger's LAST FAULT column, which is derived host-side — and this
 * text renders on DETAIL, where that column is also in view. And it makes no claim about host code:
 * the old wording carried "repairs publish no event", a fact about `MachineWearSystem` that this
 * module cannot see and would have gone silently false the day `MaintenanceSystem` starts
 * publishing on repair. That limit travels in the host's own `derivation`, where it has one copy.
 * (This is F1's shape at smaller scale: an unversioned second copy of a fact about code elsewhere.)
 */
export const FAULT_CAVEAT =
  'The FAULT LOG filter in this client attributes a line to a system by matching that system\'s ' +
  'id, label and device names against the line\'s own text. It is a name match and nothing more: ' +
  'it can catch a line that merely mentions a device, and miss one that names none.';

const HELP_LINES = [
  'HELP                  this list',
  'STATUS                every row, load and state, as one block',
  'OPEN <system>         system detail (also: ENTER on a row)',
  'LOG [system]          fault log, optionally filtered',
  'PROG [terminal]       the MOSS program directory / editor',
  'COMMISSION            fit a controller module to this console — opens programs and PODS',
  'PODS                  the cryo bay — who is aboard, and what each capsule needs',
  'THAW <n|name>         begin that capsule\'s cycle (also: ENTER on a POD BAY row)',
  'CLEAR                 empty this transcript',
  'EXIT                  leave MOSS',
  'open|close|lock|unlock <device>   ·   set <device>.rate <n|max|min>',
  '<device>.<property>   read one value (ship.power, hydro.co2)',
];

// ---- small pure helpers ---------------------------------------------------------------------

function str(v) { return v == null ? '' : String(v); }
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** ASCII-only upper-casing — no locale APIs anywhere in this module (the dev machine is de-DE). */
function upper(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 97 && c <= 122 ? String.fromCharCode(c - 32) : s[i];
  }
  return out;
}

/** ASCII-only lower-casing (same reason). */
function lower(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

/**
 * IX-M10's space/case tolerance, as one function: `"LIFE SUPPORT"`, `"life-support"` and
 * `"Life_Support"` all normalize to `life_support`; `"NAV / SENSORS"` to `nav_sensors`.
 * @param {string} s @returns {string}
 */
export function normalizeSystemId(s) {
  const t = lower(str(s)).trim();
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) out += c;
    else if (out.length && out[out.length - 1] !== '_') out += '_';
  }
  while (out.length && out[out.length - 1] === '_') out = out.slice(0, -1);
  return out;
}

/**
 * Normalize one `systems` row — wire tuple `[id,label,load,state,faultDay,faultText,advisory]`, or
 * an already-object row. A row with no id is not a row. A MISSING state becomes `-1` (rendered
 * `UNKNOWN`), never `NOMINAL`: DA-M1 forbids inventing a healthy reading for a row we cannot read.
 * @param {*} t
 * @returns {{id:string,label:string,load:number,state:number,faultDay:number,faultText:string,advisory:string}|null}
 */
export function rowObj(t) {
  let r;
  if (Array.isArray(t)) {
    r = { id: str(t[0]), label: str(t[1]), load: num(t[2], -1), state: num(t[3], -1),
      faultDay: num(t[4], -1), faultText: str(t[5]), advisory: str(t[6]) };
  } else if (t && typeof t === 'object') {
    r = { id: str(t.id), label: str(t.label), load: num(t.load, -1), state: num(t.state, -1),
      faultDay: num(t.faultDay, -1), faultText: str(t.faultText), advisory: str(t.advisory) };
  } else return null;
  if (!r.id) return null;
  if (!r.label) r.label = upper(r.id.split('_').join(' '));
  return r;
}

// ---- lifecycle / reducers -------------------------------------------------------------------

/**
 * A fresh model: SCREEN.LEDGER, row 0 selected, empty prompt + history, link down until a
 * `systems` message arrives (IX-M13).
 * @returns {object}
 */
export function openMoss() {
  return {
    screen: SCREEN.LEDGER,
    stack: [],                 // the ESC ladder beneath `screen` (IX-M2); innermost last
    linked: false,             // has any `systems` message landed?
    hull: '', day: -1, uptime: -1,
    rows: [],
    selectedId: null,          // IX-M12: selection is an ID, never an index
    detail: null,              // {tid, devices, loading}
    filterId: null,            // FAULTLOG filter (IX-M5)
    chron: [],                 // {day, text} from the `chron` channel
    log: [],                   // {day, text} from the `log` tail
    prompt: '',
    history: [],               // submitted lines, oldest first
    histIdx: -1,               // -1 = not walking history
    histDraft: '',             // the buffer stashed when a history walk began
    console: [{ stream: 1, text: 'MOSS REV 4.2.1 READY — TYPE HELP' }],
    program: initTerminal(),   // the PROGRAM screen's IDE state (terminal-model.js)
    // M3-4: the POD BAY. `pods` is null until a `moss ev:pods` reply lands — there is no
    // client-side census and no default bay, so a screen drawn from a guess has nothing to draw.
    pods: null,
    // Has a `pods` REQUEST gone out that has not been answered? Only a reply that answers one of
    // these may take the screen; an unsolicited (or stale) bay must never yank the player out of
    // whatever they were reading. The `detail.tid` guard's rule, applied to a screen.
    podsAsked: false,
  };
}

/**
 * Fold a `systems` channel message. Selection is preserved by row ID (IX-M12): a row set that
 * changed length must not move the cursor under the player's hand. If the selected row is GONE the
 * old index is clamped into the new list (its nearest surviving neighbour) rather than snapping to
 * the top. A malformed message is a no-op and — importantly — does not flip `linked` true.
 * @param {object} model @param {{rows?:*[], hull?:string, day?:number, uptime?:number}} msg
 * @returns {object}
 */
export function reduceSystems(model, msg) {
  const m = model || openMoss();
  if (!msg || !Array.isArray(msg.rows)) return m;
  const rows = [];
  for (const t of msg.rows) { const r = rowObj(t); if (r) rows.push(r); }
  const prevIndex = indexOfId(m.rows, m.selectedId);
  let selectedId = null;
  if (m.selectedId != null && rows.some((r) => r.id === m.selectedId)) selectedId = m.selectedId;
  else if (rows.length) selectedId = rows[clamp(prevIndex < 0 ? 0 : prevIndex, 0, rows.length - 1)].id;
  return {
    ...m,
    linked: true,
    hull: str(msg.hull),
    day: num(msg.day, -1),
    uptime: num(msg.uptime, -1),
    rows,
    selectedId,
  };
}

/**
 * Fold a `moss` event: `sys` fills the open DETAIL, `exec` appends to the `>` transcript, and
 * `source|diag|audit|rterror` belong to the PROGRAM editor and are delegated to terminal-model.
 * A `sys` reply for a system we are not looking at is ignored — a stale reply must never overwrite
 * the screen the player is on. Unknown `ev` values are ignored forward-compatibly.
 * @param {object} model @param {{ev?:string, tid?:*, devices?:*[], lines?:*[], ok?:boolean}} msg
 * @returns {object}
 */
export function reduceMossEvent(model, msg) {
  const m = model || openMoss();
  if (!msg || typeof msg.ev !== 'string') return m;
  if (msg.ev === 'sys') {
    if (!m.detail || m.detail.tid !== str(msg.tid)) return m;
    const devices = [];
    if (Array.isArray(msg.devices)) for (const d of msg.devices) { const o = deviceObj(d); if (o) devices.push(o); }
    // §1.2's `derivation` (IX-M22): the host's own account of how this row's LOAD and STATE were
    // computed. An older host that sends none leaves this '' and the client falls back.
    return { ...m, detail: { tid: m.detail.tid, devices, loading: false, derivation: str(msg.derivation).trim() } };
  }
  if (msg.ev === 'pods') return reducePods(m, msg);
  if (msg.ev === 'thaw') {
    // ⭐ THE COMMAND'S OWN VERDICT, RENDERED — M3-3 filed that nothing in this client folded this
    // reply at all, so a thaw was answered into the void. `reason` is the SIM's sentence
    // (`ThawGate.Describe`), printed verbatim: this module never re-words, re-cases or re-derives
    // what the ship said. Stream 2 for a refusal, so it lands on the error stream the transcript
    // already styles apart.
    const ok = msg.ok === true;
    let next = pushConsole(m, ok ? 1 : 2, str(msg.reason) || (ok ? 'THAW ACCEPTED' : 'THAW REFUSED'));
    // A REFUSED thaw has nothing in flight, so the latch must not hold the player's next attempt
    // hostage. An ACCEPTED one keeps it until the bay's own rows show the capsule moved.
    if (!ok && next.pods && next.pods.thawing) next = { ...next, pods: { ...next.pods, thawing: null } };
    return next;
  }
  if (msg.ev === 'exec') {
    let next = m;
    let rendered = 0;
    const lines = Array.isArray(msg.lines) ? msg.lines : [];
    for (const l of lines) {
      // §1.3 stream 0 is the host's echo of a line THIS client already echoed locally at submit
      // time (submitCommand), so rendering it would print every command twice. The local echo is
      // the one kept: it appears instantly and survives a slow or dead link, the same reason
      // ConversationHub emits the player's line at dispatch instead of awaiting the model.
      if (Array.isArray(l)) {
        // `[stream, text]`. A malformed tuple degrades toward SHOWING the host's words: a
        // one-element tuple is text at stream 1 (output), and a missing stream byte defaults to
        // output too — never to stream 0, which is dropped, and never to an empty line, which
        // would be a blank row that silently ate what the host said. A zero-length tuple has no
        // words to show and renders nothing at all.
        if (!l.length) continue;
        const stream = l.length >= 2 ? num(l[0], 1) : 1;
        if (stream === 0) continue;
        next = pushConsole(next, stream, l.length >= 2 ? str(l[1]) : str(l[0]));
      } else if (l != null) next = pushConsole(next, 1, str(l));
      else continue;   // a null entry is not a line; a reply made only of them can still say ok:false
      rendered++;
    }
    if (!rendered && msg.ok === false) next = pushConsole(next, 2, 'COMMAND FAILED');
    return next;
  }
  const program = reduceMoss(m.program, msg);
  return program === m.program ? m : { ...m, program };
}

/** A `moss ev:sys` device tuple `[name,kind,condition,powered,rate,deck,x,y,note]` → an object. */
function deviceObj(d) {
  if (Array.isArray(d)) {
    if (d[0] == null || d[0] === '') return null;
    return { name: str(d[0]), kind: str(d[1]), condition: num(d[2], -1), powered: num(d[3], 0) === 1,
      rate: num(d[4], -1), deck: num(d[5], -1), x: num(d[6], -1), y: num(d[7], -1), note: str(d[8]) };
  }
  if (d && typeof d === 'object' && d.name) {
    return { name: str(d.name), kind: str(d.kind), condition: num(d.condition, -1), powered: !!d.powered,
      rate: num(d.rate, -1), deck: num(d.deck, -1), x: num(d.x, -1), y: num(d.y, -1), note: str(d.note) };
  }
  return null;
}

/**
 * Normalize ONE POD BAY row — wire tuple `[n, pod, occupant, state, stateWord, why, reason, can]`
 * (`hosts/web/WireFormat.Pods.cs`), or an already-object row. A row with no `pod` key is not a row:
 * the key is what a thaw is addressed to, and a capsule nobody can address is not renderable.
 *
 * ⛔ NOTHING IS INVENTED HERE. A missing state code reads `-1` and its word reads `UNKNOWN`, never
 * `OPEN` — the DA-M1 rule that made a missing ledger state `UNKNOWN` rather than `NOMINAL`, which
 * matters more for a capsule than for a load bar. A missing `can` is FALSE: the affordance to wake
 * somebody must be granted by the gate, never assumed from an absent field.
 * @param {*} t
 * @returns {{n:number,pod:string,occupant:string,st:number,state:string,why:number,reason:string,can:boolean}|null}
 */
export function podRow(t) {
  let r;
  if (Array.isArray(t)) {
    r = { n: num(t[0], -1), pod: str(t[1]), occupant: str(t[2]), st: num(t[3], -1),
      state: str(t[4]), why: num(t[5], -1), reason: str(t[6]), can: num(t[7], 0) === 1 };
  } else if (t && typeof t === 'object') {
    r = { n: num(t.n, -1), pod: str(t.pod), occupant: str(t.occupant), st: num(t.st, -1),
      state: str(t.state), why: num(t.why, -1), reason: str(t.reason), can: !!t.can };
  } else return null;
  if (!r.pod) return null;
  if (!r.state) r.state = 'UNKNOWN';
  return r;
}

/**
 * ⭐ Fold a `moss ev:pods` reply — the POD BAY census, straight off the sim's gate.
 *
 * <p>THREE things happen here and each is a rule this package owes an answer for.</p>
 *
 * 1. **The reply takes the screen, the command does not.** Only when `podsAsked` is set: the bay is
 *    commission-gated, so the ask can come back as a refusal instead, and a screen that had already
 *    opened would sit empty next to a sentence explaining why it is empty. A reply nobody asked for
 *    updates the data and leaves the player where they are.
 * 2. **Selection survives by capsule id** (IX-M12's rule, one screen over): a bay that re-arrives
 *    every second must not move the cursor under the player's hand.
 * 3. **The in-flight thaw latch clears only when the SIM's own rows show it moved** — see
 *    `activateThaw` for why the latch exists at all.
 * @param {object} model @param {{rows?:*[], term?:string, moss?:string, note?:string}} msg
 * @returns {object}
 */
export function reducePods(model, msg) {
  const m = model || openMoss();
  if (!msg || !Array.isArray(msg.rows)) return m;
  const rows = [];
  for (const t of msg.rows) { const r = podRow(t); if (r) rows.push(r); }
  const prev = m.pods;
  const wanted = prev && prev.selectedPod;
  const selectedPod = wanted && rows.some((r) => r.pod === wanted) ? wanted
    : rows.length ? rows[0].pod : null;
  // The latch holds until the ship's own answer has moved: the gate refuses EVERY capsule while one
  // is mid-cycle, so an accepted thaw turns `can` false on the very row we asked about. Holding it
  // until then is what stops the same-tick double request M3-3 filed — two asks inside one tick
  // both read `Progress == 0` and both hear ACCEPTED, and only the first one cycles.
  let thawing = prev ? prev.thawing : null;
  if (thawing && !rows.some((r) => r.pod === thawing && r.can)) thawing = null;
  return {
    ...m,
    pods: {
      term: str(msg.term), moss: str(msg.moss), note: str(msg.note),
      rows, selectedPod, thawing,
    },
    podsAsked: false,
    screen: m.podsAsked && m.screen !== SCREEN.PODBAY ? SCREEN.PODBAY : m.screen,
    stack: m.podsAsked && m.screen !== SCREEN.PODBAY ? m.stack.concat([m.screen]) : m.stack,
  };
}

/**
 * Fold a `chron` message — the FAULT LOG's day-stamped source. Each day contributes its headline
 * plus its lines, all carrying the day so the log can stamp them without re-deriving anything.
 * @param {object} model @param {{days?:{day:number,headline:string,lines:string[]}[]}} msg
 * @returns {object}
 */
export function reduceChron(model, msg) {
  const m = model || openMoss();
  const days = msg && Array.isArray(msg.days) ? msg.days : null;
  if (!days) return m;
  const chron = [];
  for (const d of days) {
    if (!d || typeof d !== 'object') continue;
    const day = num(d.day, -1);
    if (d.headline) chron.push({ day, text: str(d.headline) });
    if (Array.isArray(d.lines)) for (const l of d.lines) if (l) chron.push({ day, text: str(l) });
  }
  return { ...m, chron };
}

/**
 * Fold a `log` channel tail — the FAULT LOG's live section. Log lines open with a `D<day>.<frac>`
 * token (the sensor-log format); it is split off into the entry's day so the log renders one stamp
 * style. A line without the token keeps its text whole and carries day `-1`.
 * @param {object} model @param {{lines?:string[]}|string[]} msg
 * @returns {object}
 */
export function reduceLog(model, msg) {
  const m = model || openMoss();
  const lines = msg && Array.isArray(msg.lines) ? msg.lines : Array.isArray(msg) ? msg : null;
  if (!lines) return m;
  const log = [];
  for (const raw of lines) {
    if (raw == null) continue;
    const s = str(raw);
    const mt = /^D(\d+)\.\d+\s+(.*)$/.exec(s);
    log.push(mt ? { day: parseInt(mt[1], 10), text: mt[2] } : { day: -1, text: s });
  }
  return { ...m, log };
}

// ---- input: the IX-M8 routing table ----------------------------------------------------------

/**
 * IX-M8, as data. Key (normalized) → `[routeWhenPromptEmpty, routeWhenPromptHasText]` on the
 * LEDGER screen, where the `>` prompt is always focused:
 *
 * | key          | buffer empty          | buffer has text                          |
 * |--------------|-----------------------|------------------------------------------|
 * | ArrowUp/Down | nav — move selection  | prompt — walk command history (IX-M9)    |
 * | Enter        | nav — open DETAIL     | prompt — submit the line                 |
 * | Escape       | nav — pop the stack   | prompt — clear the buffer FIRST (IX-M2)  |
 * | PageUp/Down  | nav — jump            | nav — meaningless in a one-line input    |
 * | Home/End     | nav — jump            | pass — real text-cursor keys             |
 * | Tab          | pass                  | pass — deliberately unbound (see below)  |
 *
 * ⚠️ **NO PRINTABLE CHARACTER IS IN THIS TABLE, AND NONE MAY BE ADDED (OD-P, 2026-07-31).** `L`
 * (FAULT LOG) and `P` (PROGRAM) used to hold the two rows above `PageUp`; the owner deleted them:
 * *"I do not like these shortcuts like 'L' or 'P' — we need to expand the MOSS OS and part might be
 * 'ls' command later, to read directories.. but as soon as we press l, the log opens."* MOSS is the
 * ship's OS (OD-N), so the console is a REAL TERMINAL: **a printable character always types into
 * the prompt, and every screen is reached by a typed command** — `log`, `prog`, `open`, `status`,
 * `clear`, `exit` (`submitCommand`/`navCommand` below; the host advertises the same set in
 * `GameSession.ConsoleHelp`). Only non-printable keys — the ones a terminal also owns — navigate.
 * An unlisted key routes `'pass'`, so a letter needs no row here to reach the prompt; adding one
 * would silently steal a character back off the command line.
 *
 * `pass` means "the model did not take this key; let the character reach the prompt". Tab is
 * unbound in v1: spec §2 lists it among the keys `keyPress` sees but never says what it does, and
 * inventing a completion behaviour is a design decision this lane does not own.
 */
export const KEY_ROUTE = {
  arrowup: ['nav', 'prompt'],
  arrowdown: ['nav', 'prompt'],
  enter: ['nav', 'prompt'],
  escape: ['nav', 'prompt'],
  pageup: ['nav', 'nav'],
  pagedown: ['nav', 'nav'],
  home: ['nav', 'pass'],
  end: ['nav', 'pass'],
  tab: ['pass', 'pass'],
};

/** True when a modifier that belongs to the browser or the OS is held (accepts both the DOM
 *  event's `ctrlKey…` spelling and a plain `ctrl…`). Ctrl-Home scrolls the page, Ctrl-Enter is
 *  the browser's — a chord over a LISTED key is still handed back, which is what this decides.
 *  (Since OD-P the classic example, Ctrl-L, is moot: `l` is not in the table at all.) */
function hasMod(mods) {
  if (!mods) return false;
  return !!(mods.ctrl || mods.ctrlKey || mods.alt || mods.altKey || mods.meta || mods.metaKey);
}

/**
 * Who gets this key: `'nav'` (the MOSS screen), `'prompt'` (the command line) or `'pass'` (nobody
 * here — the DOM layer lets it type). See KEY_ROUTE for the LEDGER table.
 *
 * Off the LEDGER the screen's own keys apply (the empty-buffer column) — except on PROGRAM, where
 * the IDE owns a text area and only Escape is taken (IX-M11's guard-first rule).
 *
 * ONE exception, and OD-P is what makes it load-bearing: **ENTER on a NON-EMPTY buffer submits the
 * line on EVERY screen that shows the prompt**. The prompt row is rendered on DETAIL and FAULTLOG
 * too (`moss-screen.js:_build` appends it to the page, not to the body), and since OD-P a letter
 * typed there lands in that buffer. Routing Enter to `nav` regardless — as this function did while
 * `L`/`P` were hotkeys — meant the player could see their command in the prompt and have Enter drop
 * it silently: exactly the shape of "the MOSS CLI does not work". `log` from DETAIL was the ONLY
 * way left to reach the filtered fault log that `L` used to open, so without this the ruling's
 * replacement path is unreachable from the screen that needed it most. PROGRAM is untouched — its
 * textarea is guarded before any of this.
 * @param {object} model @param {string} key @param {object} [mods]
 * @returns {'nav'|'prompt'|'pass'}
 */
export function routeKey(model, key, mods) {
  if (hasMod(mods)) return 'pass';
  const k = lower(str(key));
  const row = Object.prototype.hasOwnProperty.call(KEY_ROUTE, k) ? KEY_ROUTE[k] : null;
  if (!row) return 'pass';
  const screen = model ? model.screen : SCREEN.LEDGER;
  const typed = str(model && model.prompt).length > 0;
  if (screen === SCREEN.PROGRAM) return k === 'escape' ? 'nav' : 'pass';
  if (screen !== SCREEN.LEDGER) {
    if (k === 'enter' && typed) return 'prompt';
    return row[0] === 'prompt' ? 'nav' : row[0];
  }
  return row[typed ? 1 : 0];
}

/**
 * The pure key state machine (IX-M8). Returns `{model, effects}` per the frozen contract, plus two
 * additive fields the DOM layer needs and cannot derive: `handled` (did the model take the key? if
 * false the caller must let it reach the input) and `route` (which column of the table fired).
 * @param {object} model @param {string} key @param {object} [mods]
 * @returns {{model:object, effects:object[], handled:boolean, route:string}}
 */
export function keyPress(model, key, mods) {
  const m = model || openMoss();
  const route = routeKey(m, key, mods);
  const k = lower(str(key));
  if (route === 'pass') return { model: m, effects: [], handled: false, route };
  const r = route === 'prompt' ? promptKey(m, k) : navKey(m, k);
  return { model: r.model, effects: r.effects || [], handled: !!r.handled, route };
}

/** The prompt's own keys: history walk, submit, clear. */
function promptKey(m, k) {
  if (k === 'enter') {
    const out = submitCommand(m, m.prompt);
    return { model: out.model, effects: out.effects, handled: true };
  }
  if (k === 'escape') {
    // IX-M2: a non-empty prompt is cleared BEFORE any screen transition.
    return { model: { ...m, prompt: '', histIdx: -1, histDraft: '' }, handled: true };
  }
  if (k === 'arrowup') return historyStep(m, -1);
  if (k === 'arrowdown') return historyStep(m, 1);
  return { model: m, handled: false };
}

/** IX-M9: walk the history ring. dir -1 = older, +1 = newer; the bottom restores the stashed draft. */
function historyStep(m, dir) {
  const h = m.history;
  if (!h.length) return { model: m, handled: false };
  if (m.histIdx < 0) {
    if (dir > 0) return { model: m, handled: false };   // not walking: nothing is newer than the draft
    return { model: { ...m, histIdx: h.length - 1, histDraft: m.prompt, prompt: h[h.length - 1] }, handled: true };
  }
  const next = m.histIdx + dir;
  if (next < 0) return { model: m, handled: true };      // clamp at the oldest line (no wrap)
  if (next > h.length - 1) return { model: { ...m, histIdx: -1, prompt: m.histDraft, histDraft: '' }, handled: true };
  return { model: { ...m, histIdx: next, prompt: h[next] }, handled: true };
}

/** The screen's own keys: selection, activation and the ESC stack. NO LETTER APPEARS HERE (OD-P):
 *  the FAULT LOG and PROGRAM screens are reached by typing `log` / `prog`, through `navCommand`. */
function navKey(m, k) {
  // M3-4: inside the POD BAY the same non-printable keys mean the same things one list over —
  // move the cursor, ENTER activates. Nothing printable is added (OD-P); `thaw` is still a word.
  if (m.screen === SCREEN.PODBAY) {
    switch (k) {
      case 'arrowup': return movePod(m, -1);
      case 'arrowdown': return movePod(m, 1);
      case 'pageup': return movePod(m, -PAGE_STEP);
      case 'pagedown': return movePod(m, PAGE_STEP);
      case 'home': return movePodTo(m, 0);
      case 'end': return movePodTo(m, m.pods ? m.pods.rows.length - 1 : 0);
      case 'enter': {
        const row = m.pods ? m.pods.rows.find((r) => r.pod === m.pods.selectedPod) : null;
        if (!row) return { model: m, handled: false };
        return activateThaw(m, row);
      }
      case 'escape': return escapeStep(m);
      default: return { model: m, handled: false };
    }
  }
  switch (k) {
    case 'arrowup': return moveSelection(m, -1);
    case 'arrowdown': return moveSelection(m, 1);
    case 'pageup': return moveSelection(m, -PAGE_STEP);
    case 'pagedown': return moveSelection(m, PAGE_STEP);
    case 'home': return moveSelectionTo(m, 0);
    case 'end': return moveSelectionTo(m, m.rows.length - 1);
    case 'enter': {
      const can = m.screen === SCREEN.LEDGER && !!m.selectedId;
      return { ...openDetail(m, m.selectedId), handled: can };
    }
    case 'escape': return escapeStep(m);
    default: return { model: m, handled: false };
  }
}

/** IX-M3's clamped, never-wrapping walk, on the bay's own list. */
function movePod(m, delta) {
  if (!m.pods || !m.pods.rows.length) return { model: m, handled: false };
  const cur = m.pods.rows.findIndex((r) => r.pod === m.pods.selectedPod);
  return movePodTo(m, (cur < 0 ? 0 : cur) + delta);
}

function movePodTo(m, index) {
  if (!m.pods || !m.pods.rows.length) return { model: m, handled: false };
  const pod = m.pods.rows[clamp(index, 0, m.pods.rows.length - 1)].pod;
  if (pod === m.pods.selectedPod) return { model: m, handled: true };
  return { model: { ...m, pods: { ...m.pods, selectedPod: pod } }, handled: true };
}

/**
 * ⭐ THE ONE PUBLIC WAY A SURFACE ACTIVATES A CAPSULE — the click path's entry into the SAME rule
 * ENTER and the typed `thaw` use. Exported so `moss-screen.js` never needs its own copy of "may
 * this row be thawed?"; a `[THAW]` cell that decided for itself is mutation 4.
 * @param {object} model @param {string} podId @returns {{model:object, effects:object[], handled:boolean}}
 */
export function thawPod(model, podId) {
  const m = model || openMoss();
  if (!m.pods) return { model: m, effects: [], handled: false };
  const row = m.pods.rows.find((r) => r.pod === podId);
  if (!row) return { model: m, effects: [], handled: false };
  const out = activateThaw(m, row);
  return { model: out.model, effects: out.effects || [], handled: true };
}

/** Move the POD BAY cursor to one capsule (the click path's selection half, IX-M7). */
export function selectPod(model, podId) {
  const m = model || openMoss();
  if (!m.pods || !m.pods.rows.some((r) => r.pod === podId)) return m;
  if (m.pods.selectedPod === podId) return m;
  return { ...m, pods: { ...m.pods, selectedPod: podId } };
}

function indexOfId(rows, id) {
  if (id == null) return -1;
  for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
  return -1;
}

/** IX-M3: clamped at both ends, never wrapping — a wrapping diagnostic table is a misread. */
function moveSelection(m, delta) {
  if (m.screen !== SCREEN.LEDGER || !m.rows.length) return { model: m, handled: false };
  const cur = indexOfId(m.rows, m.selectedId);
  return moveSelectionTo(m, (cur < 0 ? 0 : cur) + delta);
}

function moveSelectionTo(m, index) {
  if (m.screen !== SCREEN.LEDGER || !m.rows.length) return { model: m, handled: false };
  const id = m.rows[clamp(index, 0, m.rows.length - 1)].id;
  if (id === m.selectedId) return { model: m, handled: true };
  return { model: { ...m, selectedId: id }, handled: true };
}

/** IX-M4: DETAIL opens EMPTY and `loading`, and asks the host. Never a fabricated table. */
function openDetail(m, id) {
  if (m.screen !== SCREEN.LEDGER || !id) return { model: m, effects: [] };
  return {
    model: { ...m, screen: SCREEN.DETAIL, stack: m.stack.concat([m.screen]),
      detail: { tid: id, devices: [], loading: true } },
    effects: [{ k: 'moss', op: 'sys', tid: id }],
  };
}

/**
 * IX-M5: open the FAULT LOG, filtered when opened from DETAIL. Reached by typing `log` (OD-P
 * deleted the `L` hotkey); `log <system>` passes an `explicitId`, a bare `log` passes `undefined`
 * and so INHERITS the current screen's subject — which is what `L` did from DETAIL and the reason
 * the argument is `undefined`-sentinelled rather than nullable. Closing is ESC (a command is not a
 * toggle: `log` while the log is open re-opens it, re-filtered, see `navCommand`).
 */
function openFaultLog(m, explicitId) {
  const filterId = explicitId !== undefined ? explicitId
    : m.screen === SCREEN.DETAIL && m.detail ? m.detail.tid : null;
  return {
    model: { ...m, screen: SCREEN.FAULTLOG, stack: m.stack.concat([m.screen]), filterId },
    effects: [{ k: 'chron' }],
    handled: true,
  };
}

/** IX-M6: `prog` opens the PROGRAM screen — the directory, or straight into one terminal's source
 *  (`prog <terminal>`). The `P` hotkey that used to call this is deleted (OD-P). */
function openProgram(m, tid) {
  const next = { ...m, screen: SCREEN.PROGRAM, program: tid ? openTerminal(tid) : m.program };
  if (m.screen !== SCREEN.PROGRAM) next.stack = m.stack.concat([m.screen]);
  return { model: next, effects: tid ? [{ k: 'moss', op: 'open', tid }] : [], handled: true };
}

/**
 * IX-M6: select a terminal on the PROGRAM directory (the directory-click path). Opens — or switches
 * — that terminal in `model.program` so the `source` reply that follows is ACCEPTED. Without this,
 * `program.tid` is still the terminal-less `null` from `initTerminal`, terminal-model's `matches()`
 * tid-check fails, and `reduceMoss` silently DROPS the source (a no-op). The screen sends the
 * `moss open` wire op separately; this reducer only moves the model. A null/empty tid clears the
 * selection back to a terminal-less editor. Mirrors `openProgram(m, tid)`, which already
 * `openTerminal`s for the `prog <terminal>` command.
 * @param {object} model @param {string|null} tid @returns {object}
 */
export function selectProgram(model, tid) {
  const m = model || openMoss();
  const id = tid == null || tid === '' ? null : String(tid);
  return { ...m, program: id ? openTerminal(id) : initTerminal() };
}

/**
 * IX-M6: the PROGRAM editor's textarea changed — fold the draft edit into `model.program` through
 * terminal-model's `editDraft`. Keeping `program.draft` equal to the textarea on every keystroke is
 * what makes the DOM refill rule a no-op during normal typing (it only refills on an authoritative
 * `source`), so the caret is never clobbered mid-type.
 * @param {object} model @param {string} text @returns {object}
 */
export function editProgramDraft(model, text) {
  const m = model || openMoss();
  return { ...m, program: editDraft(m.program, text) };
}

/** IX-M6: Install pressed — mark the PROGRAM editor `compiling` (the screen sends `moss set`
 *  alongside). A successful `diag` reply then commits the draft as the installed source. */
export function beginProgramCompile(model) {
  const m = model || openMoss();
  return { ...m, program: beginCompile(m.program) };
}

/** Pop one rung of the ESC ladder (IX-M2). */
function popScreen(m) {
  if (!m.stack.length) return { model: m, effects: [] };
  const stack = m.stack.slice(0, -1);
  const screen = m.stack[m.stack.length - 1];
  return { model: { ...m, screen, stack, filterId: screen === SCREEN.FAULTLOG ? m.filterId : null }, effects: [] };
}

/** IX-M2: PROGRAM → DETAIL/FAULTLOG → LEDGER → leave MOSS. (The prompt-clearing rung is handled one
 *  level up, in the routing table: a non-empty prompt routes Escape to `promptKey`.) */
function escapeStep(m) {
  if (m.stack.length) return { ...popScreen(m), handled: true };
  return { model: m, effects: [{ k: 'exit' }], handled: true };
}

/**
 * Prompt buffer edit (the DOM layer's input event). Bounded at PROMPT_MAX (IX-M42), and it ends any
 * history walk — the player is typing their own line again.
 * @param {object} model @param {string} text @returns {object}
 */
export function editPrompt(model, text) {
  const m = model || openMoss();
  const t = str(text).slice(0, PROMPT_MAX);
  if (t === m.prompt && m.histIdx < 0) return m;
  return { ...m, prompt: t, histIdx: -1, histDraft: '' };
}

/** Append a transcript line (stream 0 echo · 1 output · 2 error), bounded. */
function pushConsole(m, stream, text) {
  const line = { stream: num(stream, 1), text: str(text) };
  const c = m.console.concat([line]);
  return { ...m, console: c.length > CONSOLE_CAP ? c.slice(c.length - CONSOLE_CAP) : c };
}

function pushConsoleAll(m, stream, texts) {
  let next = m;
  for (const t of texts) next = pushConsole(next, stream, t);
  return next;
}

/** IX-M9: append to the history ring; a line identical to the previous one collapses. */
function pushHistory(m, line) {
  const h = m.history;
  if (h.length && h[h.length - 1] === line) return m;
  const next = h.concat([line]);
  return { ...m, history: next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next };
}

/**
 * IX-M10 command classification. PURE and model-free, so `parseCommand` cannot consult the live
 * ledger: `open` — the one verb the systems ledger and the device whitelist share — is resolved by
 * shape and vocabulary. A MULTI-WORD argument cannot be a device id (`open life support`), and no
 * argument at all cannot be a device either, so both are navigation; a single token is navigation
 * when it is a known system id (SYSTEM_IDS) and a device write otherwise (`open door_storage`).
 * `submitCommand` re-resolves against the live rows, which are the authority.
 * @param {string} text
 * @returns {{verb:string, args:string[], raw:string, kind:'nav'|'device'|'read'|'bad'}}
 */
export function parseCommand(text) {
  const raw = str(text).trim();
  const parts = raw.length ? raw.split(/\s+/) : [];
  const verb = parts.length ? lower(parts[0]) : '';
  const args = parts.slice(1);
  if (!verb) return { verb: '', args: [], raw, kind: 'bad' };
  // A bare property read: `ship.power`, `hydro.co2`, `vent_ls.rate` (IX-M41).
  if (!args.length && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(verb)) return { verb, args, raw, kind: 'read' };
  switch (verb) {
    // `pods` and `thaw` are M3-4's. Both are CLIENT-resolved (`kind:'nav'`) even though `thaw`
    // ends in a wire op: the capsule is resolved against the bay the player is looking at, and the
    // affordance and the command must therefore share one row — see `activateThaw`.
    // ⭐ M3-17 — `commission` is a WIRE op wearing a nav verb, exactly like `pods`: the client
    // resolves nothing (which terminal, whether a module is aboard, what it costs are three facts
    // that have never crossed the wire) and the ship answers on the transcript.
    case 'help': case 'status': case 'log': case 'prog': case 'clear': case 'exit':
    case 'pods': case 'thaw': case 'commission':
      return { verb, args, raw, kind: 'nav' };
    case 'open': {
      const navish = args.length !== 1 || SYSTEM_IDS.indexOf(normalizeSystemId(args[0])) >= 0;
      return { verb, args, raw, kind: navish ? 'nav' : 'device' };
    }
    case 'close': case 'lock': case 'unlock': case 'set':
      return { verb, args, raw, kind: 'device' };
    default:
      return { verb, args, raw, kind: 'bad' };
  }
}

/** Resolve a system argument against the LIVE ledger, by id or by label (IX-M10 tolerance). */
function resolveSystem(m, argText) {
  const want = normalizeSystemId(argText);
  if (!want) return null;
  for (const r of m.rows) if (r.id === want) return r.id;
  for (const r of m.rows) if (normalizeSystemId(r.label) === want) return r.id;
  return null;
}

/**
 * Submit one prompt line (IX-M10). The line is echoed, remembered, then either handled locally (nav
 * verbs) or forwarded to the host as `{k:'moss', op:'exec', text}` — this module executes nothing.
 * An unknown verb answers with the one-line HELP pointer, never a trace (IX-M10); a device/read
 * line while the link is down is refused with a typed error (IX-M13).
 * @param {object} model @param {string} text @returns {{model:object, effects:object[]}}
 */
export function submitCommand(model, text) {
  const m0 = model || openMoss();
  const raw = str(text).trim();
  let m = { ...m0, prompt: '', histIdx: -1, histDraft: '' };
  if (!raw) return { model: m, effects: [] };
  m = pushConsole(m, 0, '> ' + raw);
  // The length check comes BEFORE the history push: a line the client itself rejected should not
  // come back on ↑ as if it were a command that had been run.
  if (raw.length > PROMPT_MAX) {
    return { model: pushConsole(m, 2, 'LINE TOO LONG — MAX ' + PROMPT_MAX + ' CHARACTERS'), effects: [] };
  }
  m = pushHistory(m, raw);
  const cmd = parseCommand(raw);
  const argText = cmd.args.join(' ');
  switch (cmd.kind) {
    case 'nav': return navCommand(m, cmd, argText);
    case 'device': case 'read':
      // The live ledger is the authority (see `parseCommand`): a row the player can SEE must open
      // when they type its id, even when it is outside parseCommand's fixed vocabulary. Telling
      // someone a row on their own screen does not exist is the honesty failure in miniature.
      if (cmd.verb === 'open' && resolveSystem(m, argText)) return navCommand(m, cmd, argText);
      if (!m.linked) return { model: pushConsole(m, 2, NO_TELEMETRY + ' — COMMAND REFUSED'), effects: [] };
      return { model: m, effects: [{ k: 'moss', op: 'exec', text: raw }] };
    default:
      return { model: pushConsole(m, 2, 'UNKNOWN COMMAND \'' + upper(cmd.verb) + '\' — TYPE HELP'), effects: [] };
  }
}

function navCommand(m, cmd, argText) {
  switch (cmd.verb) {
    case 'help':
      return { model: pushConsoleAll(m, 1, HELP_LINES), effects: [] };
    case 'clear':
      return { model: { ...m, console: [] }, effects: [] };
    case 'exit':
      return { model: m, effects: [{ k: 'exit' }] };
    case 'status': {
      if (!m.linked) return { model: pushConsole(m, 2, NO_TELEMETRY), effects: [] };
      const lines = m.rows.map((r) => statusLine(r));
      return { model: lines.length ? pushConsoleAll(m, 1, lines) : pushConsole(m, 2, NO_ROWS), effects: [] };
    }
    case 'open': {
      const id = resolveSystem(m, argText);
      if (!id) return { model: pushConsole(m, 2, 'UNKNOWN SYSTEM \'' + upper(argText) + '\' — TYPE HELP'), effects: [] };
      // `open` from a deeper screen still works: return to the ledger first, then descend.
      const base = m.screen === SCREEN.LEDGER ? m : { ...m, screen: SCREEN.LEDGER, stack: [] };
      const out = openDetail({ ...base, selectedId: id }, id);
      return { model: out.model, effects: out.effects };
    }
    case 'log': {
      // `undefined` — NOT null — when no system was named: that is the sentinel `openFaultLog` reads
      // as "inherit this screen's subject", so a bare `log` typed on DETAIL opens the log filtered to
      // that system, which is what the deleted `L` key did (OD-P: the typed command must be the
      // whole replacement, not a weaker one). `log <system>` names its filter and overrides it.
      let filterId;
      if (argText) {
        filterId = resolveSystem(m, argText);
        if (!filterId) return { model: pushConsole(m, 2, 'UNKNOWN SYSTEM \'' + upper(argText) + '\' — TYPE HELP'), effects: [] };
      }
      // Re-open in place rather than stacking a second FAULTLOG rung; the screen it came from is
      // still the one below, so the inherit-the-subject rule reads the popped screen.
      const base = m.screen === SCREEN.FAULTLOG ? popScreen(m).model : m;
      const out = openFaultLog(base, filterId);
      return { model: out.model, effects: out.effects };
    }
    case 'prog': {
      const tid = argText ? argText.split(/\s+/)[0] : null;
      const out = openProgram(m, tid);
      return { model: out.model, effects: out.effects };
    }
    case 'pods': {
      // ⛔ NO SCREEN CHANGE HERE. The ask goes out; `reducePods` opens the bay when the ship
      // answers with one. The bay is COMMISSION-gated (M3-3 term 2), so the honest replies are
      // "here is your crew" and "MOSS IS NOT COMMISSIONED — FIT A CONTROLLER MODULE", and the
      // second one arrives on the transcript with the player still on the screen they were on.
      return { model: { ...m, podsAsked: true }, effects: [{ k: 'moss', op: 'pods' }] };
    }
    case 'commission': {
      // ⛔ NO SCREEN CHANGE AND NO LOCAL VERDICT. The ask goes out and the SHIP answers on the
      // transcript — accepted or refused — from `MossGate`'s own sentences. A client-side "you
      // have no controller module" would be a second gate, and the one thing this repo has proved
      // repeatedly is that a surface which decides for itself eventually disagrees with the sim
      // (RW §2.2, the menu/job rule). `pods`'s shape exactly, minus the screen it opens.
      return { model: m, effects: [{ k: 'moss', op: 'commission' }] };
    }
    case 'thaw':
      return thawCommand(m, argText);
    default:
      return { model: pushConsole(m, 2, 'UNKNOWN COMMAND — TYPE HELP'), effects: [] };
  }
}

/**
 * ⭐ `THAW <n|capsule|name>` — resolve the argument against the BAY THE PLAYER IS LOOKING AT, then
 * hand it to the one rule (`activateThaw`). A bare `thaw` on the POD BAY means the selected row,
 * which is the same gesture ENTER makes: RW §8.4 rung 3, one rule asked in two places.
 *
 * Resolution is by the `#` column, by the capsule key (`pod_ozawa`) or by the occupant — all three
 * are on the screen in front of the player, and telling somebody that a row they can read does not
 * exist is `submitCommand`'s own stated honesty failure.
 */
function thawCommand(m, argText) {
  if (!m.pods || !m.pods.rows.length) {
    return { model: pushConsole(m, 2, 'NO POD BAY ON THIS LINK — TYPE PODS'), effects: [] };
  }
  const rows = m.pods.rows;
  const arg = str(argText).trim();
  let row = null;
  if (!arg) {
    if (m.screen !== SCREEN.PODBAY) {
      return { model: pushConsole(m, 2, 'THAW NEEDS A CAPSULE — TYPE THAW <N>'), effects: [] };
    }
    row = rows.find((r) => r.pod === m.pods.selectedPod) || null;
  } else {
    const want = lower(arg);
    row = rows.find((r) => String(r.n) === want)
      || rows.find((r) => lower(r.pod) === want)
      || rows.find((r) => lower(r.occupant) === want)
      || null;
  }
  if (!row) {
    return { model: pushConsole(m, 2, 'NO SUCH CAPSULE \'' + upper(arg) + '\' — TYPE PODS'), effects: [] };
  }
  return activateThaw(m, row);
}

/**
 * ⭐⭐ THE ONE RULE, AND IT IS THE GATE'S — asked by the `[THAW]` affordance, by ENTER on a row and
 * by the typed `thaw` command, so no two of them can ever disagree.
 *
 * <p>⛔ **`row.can` IS THE SIM'S OWN BIT**, carried on the row by `ThawGate.Evaluate`. This function
 * does not look at the state word, at the refusal ordinal, or at anything it could compute for
 * itself — re-deriving "is this thawable?" client-side is exactly the menu/job disagreement RW §2.2
 * forbids, and a row refused here is refused WITH THE GATE'S OWN SENTENCE, never with a bare no.</p>
 *
 * <p>⭐ **AND IT IS SINGLE-FLIGHT** (M3-3's filed defect, discharged). `HandleMoss`'s thaw op
 * evaluates, replies, then enqueues — so two requests inside one tick BOTH read `Progress == 0` and
 * BOTH hear ACCEPTED, while only the first capsule cycles. The latch holds from the moment the ask
 * leaves until the bay's own rows show the ship moved (`reducePods`), so this surface can never be
 * the thing that produces that pair.</p>
 */
function activateThaw(m, row) {
  if (m.pods && m.pods.thawing) {
    const held = m.pods.rows.find((r) => r.pod === m.pods.thawing);
    return {
      model: pushConsole(m, 2, 'THAW ALREADY REQUESTED — '
        + upper(held ? held.occupant : m.pods.thawing) + '; AWAITING THE BAY'),
      effects: [], handled: true,
    };
  }
  if (!row.can) {
    return { model: pushConsole(m, 2, row.reason || 'THAW REFUSED'), effects: [], handled: true };
  }
  return {
    model: { ...m, pods: { ...m.pods, thawing: row.pod } },
    effects: [{ k: 'moss', op: 'thaw', tid: m.pods.term, text: row.pod }],
    handled: true,
  };
}

/** One STATUS line, aligned on the monospace grid with padEnd/padStart (no locale APIs). */
function statusLine(r) {
  return r.label.padEnd(16, ' ') + ' ' + loadText(r.load).padStart(4, ' ') + '  ' + stateCell(r.state).text;
}

// ---- pure formatters ------------------------------------------------------------------------

/**
 * VS-M4. `[████▒▒▒▒]` — solid cells for the filled run, stipple for the rest. A load of `-1` (or
 * anything unreadable) renders `[` + width spaces + `]`: an EMPTY bar, never a `0%` bar, because
 * "no meaningful load" and "no load at all" are different claims.
 * @param {number} loadPct @param {number} [width] @returns {string}
 */
export function loadBar(loadPct, width) {
  const w = Math.max(0, Math.round(num(width, BAR_WIDTH)));
  const v = num(loadPct, -1);
  if (v < 0) return '[' + ' '.repeat(w) + ']';
  const pct = clamp(v, 0, 100);
  const filled = clamp(Math.round((pct / 100) * w), 0, w);
  return '[' + '█'.repeat(filled) + '▒'.repeat(w - filled) + ']';
}

/** VS-M4's text half: `61%`, or `--` for the `-1` sentinel / an unreadable value. */
export function loadText(loadPct) {
  const v = num(loadPct, -1);
  if (v < 0) return '--';
  return Math.round(clamp(v, 0, 100)) + '%';
}

/**
 * VS-M8. `warn` drives the `⚠` glyph and trails ATTEND and DEGRADED only — OFFLINE is an absence,
 * not an alarm. A state outside the append-only ladder reads UNKNOWN, never NOMINAL.
 * @param {number} state @returns {{text:string, warn:boolean}}
 */
export function stateCell(state) {
  switch (num(state, -1)) {
    case STATE.NOMINAL: return { text: 'NOMINAL', warn: false };
    case STATE.ATTEND: return { text: 'ATTEND', warn: true };
    case STATE.DEGRADED: return { text: 'DEGRADED', warn: true };
    case STATE.OFFLINE: return { text: 'OFFLINE', warn: false };
    default: return { text: 'UNKNOWN', warn: false };
  }
}

/**
 * `DAY 190 · SCRAM DRILL`, or `—` for the `-1` sentinel. A day with no text still renders the day
 * (the fault happened; we simply have no summary for it).
 * @param {number} faultDay @param {string} faultText @returns {string}
 */
export function faultCell(faultDay, faultText) {
  const d = Math.floor(num(faultDay, -1));   // a day is a whole day; 190.7 must not reach the screen
  if (d < 0) return '—';
  const t = str(faultText).trim();
  return t ? 'DAY ' + d + ' · ' + t : 'DAY ' + d;
}

/**
 * Raw tick count → `H:MM:SS` at 10 Hz. Hours are UNBOUNDED — a ship's uptime is not a wall clock —
 * so day 213 reads `5112:07:44`, matching the mock. Zero-padded with padStart; no locale APIs. A
 * missing/negative tick count renders `—`, never `0:00:00`.
 * @param {number} ticks @returns {string}
 */
export function uptimeText(ticks) {
  const t = num(ticks, -1);
  if (t < 0) return '—';
  const total = Math.floor(t / TICKS_PER_SECOND);
  const h = Math.floor(total / 3600);
  const mm = Math.floor(total / 60) % 60;
  const ss = total % 60;
  return h + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

/** VS-M6's two header lines. Unknown fields render `—` rather than a plausible zero (IX-M13). */
export function headerLines(model) {
  const m = model || openMoss();
  return [
    'MOSS ▮ MODULAR OPERATIONS & SYSTEMS SUPERVISOR — REV 4.2.1',
    'PERILUNE HULL ' + (m.hull || '—') + ' · DAY ' + (m.day >= 0 ? m.day : '—') +
      ' · UPTIME ' + uptimeText(m.uptime),
  ];
}

/**
 * VS-M7's bracket-key hints, per screen. The caller joins them with ` · `.
 *
 * A bracket is a KEY; a bare `TYPE:` fragment is a COMMAND LINE. Since OD-P deleted `[L]`/`[P]`
 * the two screens they reached are only signposted here, so the hint names the words to type
 * instead of dropping the signpost — the vocabulary itself stays in one place (`HELP_LINES`, and
 * `TYPE: … HELP` points at it). No fragment may name a letter key again.
 */
export function footerHints(model) {
  const m = model || openMoss();
  switch (m.screen) {
    case SCREEN.DETAIL:
      return ['TYPE: LOG, PROG, HELP', '[ESC] BACK TO LEDGER'];
    case SCREEN.FAULTLOG:
      return ['TYPE: LOG <SYSTEM>, HELP', '[ESC] BACK'];
    case SCREEN.PROGRAM:
      return ['[ESC] BACK'];
    case SCREEN.PODBAY:
      return ['[↑↓] SELECT CAPSULE', '[ENTER] THAW', 'TYPE: THAW <N>, PODS, HELP', '[ESC] BACK'];
    default:
      // ⭐ M3-17 — COMMISSION joins the LEDGER's signpost, and that is not decoration. The whole
      // reason the commissioning verb was missing for a milestone is that nothing on any surface
      // named it; a verb only `HELP` knows about is one the player has to already know to find.
      return ['[↑↓] SELECT ROW', '[ENTER] SYSTEM DETAIL', 'TYPE: LOG, PROG, PODS, COMMISSION, HELP',
        '[ESC] BACK TO SHIP'];
  }
}

/**
 * The LEDGER view-model. `rows` are fully formatted (the screen writes strings onto a monospace
 * grid and makes no decisions of its own). `notice` carries IX-M13's `NO TELEMETRY — LINK DOWN`:
 * an empty table must never read as "all systems nominal".
 * @param {object} model
 * @returns {{rows:object[], selectedIndex:number, advisory:string, linked:boolean, notice:string}}
 */
export function ledgerView(model) {
  const m = model || openMoss();
  const sel = indexOfId(m.rows, m.selectedId);
  const selectedIndex = m.rows.length ? clamp(sel < 0 ? 0 : sel, 0, m.rows.length - 1) : -1;
  const rows = m.rows.map((r, i) => {
    const st = stateCell(r.state);
    return {
      id: r.id, label: r.label, load: r.load,
      bar: loadBar(r.load, BAR_WIDTH), loadText: loadText(r.load),
      state: r.state, stateText: st.text, warn: st.warn,
      fault: faultCell(r.faultDay, r.faultText),
      advisory: r.advisory, selected: i === selectedIndex,
    };
  });
  return {
    rows, selectedIndex,
    advisory: selectedIndex >= 0 ? m.rows[selectedIndex].advisory : '',
    linked: m.linked,
    notice: !m.linked ? NO_TELEMETRY : rows.length ? '' : NO_ROWS,
  };
}

/**
 * The DETAIL view-model. `loading` is honest (IX-M4): until the `moss ev:sys` reply lands the
 * device table is EMPTY, `notes` is EMPTY, and the screen says LOADING. `notes` is IX-M22's
 * derivation — always the host's own, straight off §1.2's `derivation` field — plus §5.1's fault
 * caveat, which is about this module's own name-matching and so belongs here. That text is part of
 * the feature, not a comment.
 * @param {object} model
 * @returns {{title:string, devices:object[], notes:string[], loading:boolean}}
 */
export function detailView(model) {
  const m = model || openMoss();
  if (!m.detail) return { title: '', devices: [], notes: [], loading: false };
  const id = m.detail.tid;
  const row = m.rows.find((r) => r.id === id);
  const devices = m.detail.devices.map((d) => ({
    name: d.name, kind: d.kind,
    condition: d.condition, conditionBar: loadBar(d.condition, BAR_WIDTH), conditionText: loadText(d.condition),
    powered: d.powered, poweredText: d.powered ? 'PWR' : 'OFF',
    rate: d.rate, rateText: loadText(d.rate),
    deck: d.deck, x: d.x, y: d.y,
    // A place needs all three coordinates. `DECK 0 · -1,-1` is a fabricated location, and this is
    // the screen where a fabricated location is least excusable.
    place: d.deck >= 0 && d.x >= 0 && d.y >= 0 ? 'DECK ' + d.deck + ' · ' + d.x + ',' + d.y : '—',
    note: d.note,
  }));
  // No derivation until the host's own account arrives; a reply that carries none says so.
  const notes = m.detail.loading ? []
    : [m.detail.derivation || 'DERIVATION UNDOCUMENTED — this row\'s numbers are not explained here.',
      FAULT_CAVEAT];
  return {
    title: row ? row.label : upper(str(id).split('_').join(' ')),
    devices,
    notes,
    loading: !!m.detail.loading,
  };
}

/**
 * The tokens that attribute a fault line to a row (§5.1). This is a STRING JOIN and nothing more:
 * `AlarmRaisedEvent` carries no device id, so the only thing available is the entry's text. Tokens
 * come from the row id, its label and — once DETAIL has been fetched — its device names. Tokens
 * shorter than 3 characters are dropped so that no row claims half the log.
 */
function faultTokens(m, id) {
  const out = [];
  const add = (s) => { for (const t of normalizeSystemId(s).split('_')) if (t.length >= 3) out.push(t); };
  add(id);
  const row = m.rows.find((r) => r.id === id);
  if (row) add(row.label);
  if (m.detail && m.detail.tid === id) for (const d of m.detail.devices) add(d.name);
  return out;
}

/**
 * The FAULT LOG view-model (IX-M5). Newest first — the live `log` tail above the day-stamped
 * chronicle — optionally filtered to one system by the weak name join described in `faultTokens`.
 * @param {object} model
 * @returns {{title:string, entries:object[], filterId:string|null}}
 */
export function faultLogView(model) {
  const m = model || openMoss();
  const id = m.filterId;
  const tokens = id ? faultTokens(m, id) : null;
  const keep = (e) => {
    if (!tokens) return true;
    const t = lower(e.text);
    for (const tok of tokens) if (t.indexOf(tok) >= 0) return true;
    return false;
  };
  const entries = [];
  for (let i = m.log.length - 1; i >= 0; i--) {
    const e = m.log[i];
    if (keep(e)) entries.push({ day: e.day, text: e.text, live: true });
  }
  for (let i = m.chron.length - 1; i >= 0; i--) {
    const e = m.chron[i];
    if (keep(e)) entries.push({ day: e.day, text: e.text, live: false });
  }
  const row = id ? m.rows.find((r) => r.id === id) : null;
  return {
    title: id ? 'FAULT LOG — ' + (row ? row.label : upper(str(id).split('_').join(' '))) : 'FAULT LOG',
    entries,
    filterId: id == null ? null : id,
  };
}

/**
 * ⭐⭐ THE POD BAY VIEW-MODEL (M3-4). Twelve capsules, four columns, and the fourth one is the
 * feature: `# · OCCUPANT · STATE · WHY / WHAT IT NEEDS`.
 *
 * <p>⛔ **EVERY FIELD BELOW CAME OFF THE WIRE.** The occupant is the sim's own `SleeperName`, the
 * state word is the host's, the reason is `ThawGate.Describe`'s sentence rendered VERBATIM — not
 * re-cased, not re-worded, not recomposed from the refusal ordinal. The only judgements this
 * function makes are layout ones: which rows show a reason (a state word that already IS the reason
 * does not repeat itself) and which show `[THAW]`.</p>
 *
 * <p>⚠️ **A SEALED ROW WITH A BLANK REASON IS THE PACKAGE FAILING** (the charter's words). The
 * blank is impossible to produce here — a sealed row's reason is whatever the gate said and the
 * gate's default arm is a sentence, never `''` — and it is pinned by a driven test rather than by
 * this note.</p>
 * @param {object} model
 * @returns {{title:string, term:string, moss:string, note:string, rows:object[],
 *            selectedIndex:number, notice:string, thawing:string}}
 */
export function podBayView(model) {
  const m = model || openMoss();
  const p = m.pods;
  if (!p) return { title: 'POD BAY', term: '', moss: '', note: '', rows: [], selectedIndex: -1,
    notice: NO_PODS, thawing: '' };
  const sel = p.rows.findIndex((r) => r.pod === p.selectedPod);
  const selectedIndex = p.rows.length ? clamp(sel < 0 ? 0 : sel, 0, p.rows.length - 1) : -1;
  const rows = p.rows.map((r, i) => ({
    n: r.n, num: r.n >= 0 ? String(r.n) : '—',
    pod: r.pod,
    occupant: upper(r.occupant) || upper(r.pod),
    st: r.st, state: r.state,
    // The two states whose word already says the whole story print an em dash rather than repeat
    // themselves ("NO SIGNAL / POD — NO SIGNAL"). Every other row prints the gate's sentence.
    reason: r.st === POD_STATE.OPEN || r.st === POD_STATE.NO_SIGNAL ? '—' : r.reason,
    why: r.why,
    can: r.can,
    // Greyed, in the RimWorld sense (§2.2): visible, refused, and STATING WHY beside it.
    dim: r.st === POD_STATE.NO_SIGNAL || r.st === POD_STATE.OPEN,
    pending: p.thawing === r.pod,
    selected: i === selectedIndex,
  }));
  return {
    title: 'POD BAY', term: p.term, moss: p.moss, note: p.note,
    rows, selectedIndex,
    notice: rows.length ? '' : NO_PODS,
    thawing: p.thawing || '',
  };
}

/** The `>` transcript, oldest first / newest last, already bounded by CONSOLE_CAP. */
export function consoleLines(model) {
  const m = model || openMoss();
  return m.console.map((l) => ({ stream: l.stream, text: l.text }));
}
