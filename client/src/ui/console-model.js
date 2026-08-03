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

// M1-C ERASE — the un-designate tool. It shares the one armed slot with the kinds above and it
// lives in the BUILD tab beside them, so it belongs in `isPaletteTool`.
//
// ⚠️ DELIBERATELY NOT IN `ORDER_KINDS`, and that is a boundary and not a taxonomy quibble.
// `client/test/surface-boundary.test.js` reads `ORDER_KINDS` as one of the two authorities on WHAT
// THE DEPRECATED CONSOLE CAN DO; adding erase there would assert the console has an un-designate
// verb it does not have, and would satisfy the parity guard with a fiction. ERASE exists only on the
// standard surface (`ROOM_TOOLS` + the Overview's ORDERS bar). What lives here is the shared
// ARMED-SLOT machine, which both modern surfaces drive through `hud.js`.
const ERASE_KINDS = ['erase'];
export function isEraseTool(t) { return ERASE_KINDS.indexOf(t) >= 0; }

/** Tools that live in the BUILD tab's palette — i.e. everything that a tab switch away from BUILD
 *  should disarm. MOVE is deliberately NOT one: it is a crew order and survives the tab. PURE.
 *
 *  ERASE IS ONE, AND IT MUST BE. The Overview's ORDERS bar is hidden off the BUILD tab, so a tool
 *  that could be armed without opening the tab would be armed with nothing anywhere on screen saying
 *  so — the "invisible feedback is FUNCTIONAL" rule, which is what makes this a one-line correctness
 *  fix rather than tidiness: `hud.js`'s `armTool`/`armFromKey` both switch to BUILD on the strength
 *  of this predicate. */
export function isPaletteTool(t) { return isBuildTool(t) || isOrderTool(t) || isEraseTool(t); }

/**
 * The armed-tool transition table. Events:
 *   {t:'toggle', tool}   palette / MOVE ORDER button click: arm, or disarm when already armed
 *   {t:'keyB'}           B: any build tool armed → disarm; else arm 'wall'
 *   {t:'keyX'}           X: 'cancel' armed → disarm; else arm 'cancel'
 *   {t:'keyG'}           G: 'dig' armed → disarm; else arm 'dig' (E0-3)
 *   {t:'keyZ'}           Z: 'stockpile' armed → disarm; else arm 'stockpile' (E0-3)
 *   {t:'keyV'}           V: 'strip' armed → disarm; else arm 'strip' (E0-5; V = salVage)
 *   {t:'keyC'}           C: 'erase' armed → disarm; else arm 'erase' (M1-C; C = Cancel)
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
    case 'keyC': return s === 'erase' ? null : 'erase';
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
 * The stockpile line NAMES ITS FILTER (E0-4 WP-5): it is where a player reads the filter they are
 * ABOUT TO paint, as opposed to one already on the floor. An absent label degrades to ALL, matching
 * defaultStockFilter().
 *
 * CORRECTED (console-retirement WP-3): this doc used to justify itself with "a filtered stockpile tile
 * is visually identical to an unfiltered one … there is no wire channel for a zone's accept-set", and
 * called itself "the only place in the whole client". Both are now false — the `zones` channel carries
 * every tile's mask and the Room Zoom draws it with a named key. This surface is the deprecated console
 * anyway (CLAUDE.md, THE STANDARD SURFACE); the line is kept accurate rather than kept load-bearing.
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
  // ⭐ M3-9 — sleeping is a NEED, and needs are tagged here (eating/drinking already are): a crew
  // member asleep is doing something AT A PLACE, so the map may say so. The host's two resting
  // labels ("Sleeping in bed_9_4_0" / "Sleeping on the deck") share this one verb by design —
  // the WHERE is the payload of the sentence, not of the tag.
  sleeping: 'REST',
};

/** The host's en-route verb ("Heading to service scrubber_ls"): a crew member who HAS a job but is
 *  still walking to it. Deliberately absent from TASK_TAGS — a tag floating over a walking pawn is
 *  the very "claimed to be fixing X while doing nothing visible" complaint the markers exist to
 *  answer — while CREW WATCH still reads it as assigned work, because they are not idle. */
const EN_ROUTE_VERB = 'heading';

/**
 * ⭐ M2-20 — the host's verb for a crew member the player has given NO work type at all
 * ("Awaiting orders", `GameSession.AwaitingOrdersLabel`). Deliberately absent from
 * TASK_TAGS for the same reason Walking/Holding/Idle are: waiting is not working, and no map
 * marker may float over it.
 *
 * ⚠️ WHY THE CLIENT LOOKS AT THE VERB AT ALL, given that the WORD is the host's and must stay the
 * host's. It does NOT re-derive the state — it CLASSIFIES the host's own sentence, exactly as
 * `taskTag` has always classified the first verb of every other label, so that the row can be
 * styled. The `work` channel carries this crew member's grid and deriving *unassigned* from THAT
 * would be a second source of truth for one layer; reading the first word of the label the host
 * already sent is one source, read twice. Keep this token and `GameSession.AwaitingOrdersLabel`
 * in step — `WebTaskLabelTests.Every_JobKind_Label_Opens_With_A_Known_Verb` pins the host side.
 */
const AWAITING_VERB = 'awaiting';

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

/**
 * ⭐ M2-6 — THE SEPARATOR BETWEEN *WHAT* A CREW MEMBER IS DOING AND *WHY THAT JOB*.
 *
 * The host appends `" — Deconstruct is priority 4"` to the task label when the ranking is worth
 * explaining, so one wire field carries two facts. This is the client's half of a two-sided
 * contract: the host half is `GameSession.RankingSeparator` in `hosts/web/GameSession.cs`.
 * ⛔ CHANGE ONE AND YOU MUST CHANGE THE OTHER — `client/test/why-line.test.js` pins the pairing by
 * driving a host-shaped label through the split.
 *
 * ⚠️ SPLITTING ON IT IS UNAMBIGUOUS, and that is a property of the host, not a hope. No base label
 * `GameSession.TaskLabel` can emit contains `" — "` — the labels are verbs, device names, item
 * names and tile coordinates — and the clause is always a SUFFIX, because the host appends it after
 * every branch of its switch. `WhyLineTests.NoBaseLabel_ContainsTheSeparator` drives every `JobKind`
 * and reddens the day either of those stops being true.
 *
 * ⚠️ NOT to be confused with the bare em dash `'—'` that `watchTask` returns for a MISSING label.
 * That one has no spaces, so it can never match this separator — the empty-cell placeholder and the
 * clause marker are different strings and `why-line.test.js` drives that case too.
 */
export const WHY_SEPARATOR = ' — ';

/** The *WHAT* half of a roster task label: everything before the ranking clause, or the whole label
 *  when there is no clause. PURE. Uses `lastIndexOf` because the clause is a SUFFIX — that is the
 *  structural fact, and reading from the end is what keeps a base label safe if one ever does
 *  acquire the separator. */
export function taskWhat(task) {
  if (typeof task !== 'string') return '';
  const i = task.lastIndexOf(WHY_SEPARATOR);
  return i < 0 ? task : task.slice(0, i);
}

/**
 * ⭐⭐ D4 fix-back — THE HOST'S AIR WARNING, VERBATIM. The client's half of a second two-sided contract:
 * the host half is `GameSession.AirWarningClause` in `hosts/web/GameSession.cs` (:4034).
 * ⛔ CHANGE ONE AND YOU MUST CHANGE THE OTHER — `client/test/why-line.test.js` pins the pairing, and
 * unlike `WHY_SEPARATOR` it pins it against the HOST FILE ITSELF, because this literal is a whole
 * phrase rather than a punctuation mark and a silent drift would simply switch the fix below off.
 *
 * ⚠️ THE CLIENT KNOWS THIS PHRASE FOR ONE REASON ONLY: to protect it from the ellipsis. Nothing here
 * re-derives the warning, decides when it applies, or renders it anywhere the host did not put it —
 * `AtmosphereSafety.IsBreathable` and the `HeldByOrder` gate are the host's, upstream, untouched.
 * ⛔ AND IT MUST NOT BECOME A SECOND `WHY_SEPARATOR`: the middot clause rides INSIDE the *what* half
 * ON PURPOSE (see `GameSession.cs:4019-4030` — spelt with an em dash it would be cut by `taskWhat`
 * in exactly the case that matters most). Splitting it off and dropping it from the docks is the one
 * change this constant exists to make impossible.
 */
export const AIR_WARNING_CLAUSE = ' · NO AIR';

/**
 * ⭐ THE TWO CREW DOCKS' CHARACTER BUDGETS — MEASURED IN REAL CHROME, NOT DERIVED FROM THE CSS.
 *
 * `client/tools/why-line-shot.mjs` reads `clientWidth` off each shipped element and walks `'M'.repeat(n)`
 * up until `scrollWidth > clientWidth`. On `--ship wreck` at 1600×1000, this tree (2026-08-02):
 *
 *   `.ov-crewtask`  145 px @ 8.5px Space Mono + 0.34px letter-spacing ⇒ **26 characters** (styles.css:1014)
 *   `.rz-crewtask`  118 px @ 8px   Space Mono + 0.32px letter-spacing ⇒ **22 characters** (styles.css:1381)
 *
 * ⚠️ THE ROOM ZOOM NUMBER IS 22, NOT THE 23 EVERY COMMENT IN THIS REPO SAID. The 120 px/23 figure was
 * carried forward from M2-6 and is off by one dock border plus one character: `Servicing fab… · NO AIR`
 * (23 chars) measures 120 px in a 118 px box and IS CLIPPED. M2-20's own browser run had the right
 * number all along ("146 px in a 118 px box") and the derived figure drifted away from it. This is the
 * repo's own rule arriving on time — a count you did not measure yourself is not evidence.
 *
 * ⛔ THEY ARE TWO NUMBERS AND NOT ONE. Clamping the Overview to the Room Zoom's budget would cost four
 * characters of device name on the surface the player reads most (`Servicing fa…` where `Servicing
 * fabric…` fits), for no reason except that a different dock is narrower. Each view passes its own.
 *
 * ⚠️ AND THE FIX IS STILL THE TEXT, NEVER THE GEOMETRY — M2-20's precedent (`GameSession.cs:4152-4180`),
 * `overview-view.js`'s dock comment and VS-Z-52 all pre-argue against widening these islands, and this
 * package does not move one pixel of CSS.
 */
export const OV_DOCK_TASK_CHARS = 26;
export const RZ_DOCK_TASK_CHARS = 22;

/**
 * ⭐⭐ D4 fix-back — THE STRING A NARROW CREW DOCK RENDERS: the *what* half, shortened so that the AIR
 * WARNING SURVIVES instead of being the part the ellipsis eats.
 *
 * <b>THE DEFECT, MEASURED.</b> D4 made the host say `"Servicing fabricator_1 · NO AIR"` — 31
 * characters. Both docks ellipsize by CSS, so the row read `"Servicing fabricator…"` and
 * `"Servicing fabri…"`: the clipped tail is EXACTLY the warning, on the only two surfaces that show a
 * crew member's task inside a room (the Room Zoom has no selected readout at all — M4 gap). A pawn
 * the player ordered into a vacuum was silently normal again, which is D4's own defect wearing a
 * stylesheet.
 *
 * <b>THE RULE, and it is deliberately narrow:</b>
 *   1. it fits ⇒ RETURN IT UNTOUCHED. Every clause-free label — which under OD-H is nearly every
 *      label for the player's whole first hour — is byte-identical to what shipped before.
 *   2. it does not fit and carries NO warning ⇒ RETURN IT UNTOUCHED, and let CSS ellipsize exactly as
 *      it always has. ⛔ This package does not take over truncation in general; a client that started
 *      shortening every long label would be a second, invisible opinion about the host's prose.
 *   3. it does not fit and ENDS in the warning ⇒ shorten the BASE and keep the warning whole.
 *      `"Servicing fabricator_1 · NO AIR"` ⇒ `"Servicing fabric… · NO AIR"` (26) / `"Servicing fa… · NO AIR"` (22).
 *
 * The base is trimmed before the ellipsis is appended, so a cut landing on a space cannot ship
 * `"Servicing … · NO AIR"` — the same hygiene `why-line.test.js` leg (a) demands of the em-dash split.
 *
 * PURE. No DOM, no measurement, no font metric: the budget is a MEASURED CONSTANT passed in by the
 * view that owns the box, so this function is testable in node and identical on both surfaces.
 * ⚠️ Character-counted rather than pixel-counted BECAUSE THE DOCKS ARE MONOSPACE — Space Mono, one
 * advance per character including `·` and `…` (verified in the browser: 22 chars = 118 px = the box).
 * A proportional font would make this wrong, and the rig is what would catch it.
 *
 * @param {unknown} task the RAW roster label (with or without either clause)
 * @param {number} [budget] the dock's measured character budget; omitted ⇒ no shortening at all
 */
export function dockTask(task, budget) {
  const what = taskWhat(task);
  if (!Number.isFinite(budget) || budget <= 0) return what;   // no box declared ⇒ the pre-D4 fix-back string
  if (what.length <= budget) return what;                     // rule 1 — it fits
  if (!what.endsWith(AIR_WARNING_CLAUSE)) return what;        // rule 2 — nothing to protect
  const keep = budget - AIR_WARNING_CLAUSE.length - 1;        // -1 for the ellipsis this adds
  if (keep < 1) return what;                                  // the box cannot hold the warning at all
  const base = what.slice(0, what.length - AIR_WARNING_CLAUSE.length);
  return base.slice(0, keep).trimEnd() + '…' + AIR_WARNING_CLAUSE;
}

/** The CREW WATCH task cell for a roster entry: the label the host sent plus whether it counts as
 *  real work (so the row can dim the doing-nothing case instead of implying activity). A crew
 *  member en route to a job counts — they are assigned, just not there yet. PURE.
 *
 *  ⭐ `waiting` (M2-20) is the THIRD state, and it is a third state rather than a second because
 *  `working` and `waiting` answer different questions: *is work happening* and *is the ship waiting
 *  on the player*. They are mutually exclusive in practice (the host never emits the awaiting label
 *  for a crew member on a job) and the styles are ordered so that `working` wins if that ever stops
 *  being true. `text` is ALWAYS the host's string, untouched.
 *
 *  ⭐ M2-6 fix-back — `what` IS THE FIELD THE TWO CREW DOCKS RENDER, and `text` the one the
 *  Overview's selected readout renders. They differ only for a clause-bearing label, and the split
 *  exists because the docks are TOO NARROW TO HOLD ONE: `.ov-crewtask` fits 26 characters (145 px)
 *  and `.rz-crewtask` 22 (118 px) at the shipped Space Mono sizes (MEASURED — see the budgets above;
 *  this line said ~26/~23 at 147/120 px until D4 fix-back walked the boxes), against labels of
 *  43–54. Rendering the full string there does not truncate the explanation, it truncates the
 *  PAYLOAD — the priority number is past the ellipsis 100% of the time and the row reads
 *  `"Servicing door_d0_s0 — Re…"`, which is worse than not saying it. ⛔ The fix is the TEXT, never
 *  the dock geometry: that is M2-20's precedent, which shortened its own sentence rather than widen
 *  two shared docks for one label. The whole sentence is fully readable in `.ov-task`
 *  (264 px, wraps — MEASURED `clientWidth` in real Chrome by `why-line-shot.mjs` STEP 4; this repo
 *  carried 266 from M2-6), which renders the raw wire field and is deliberately NOT on this derivation.
 *
 *  ⭐ D4 fix-back — `what` NOW TAKES THE DOCK'S OWN MEASURED BUDGET (`dockTask` above), because
 *  dropping the ranking clause is no longer enough: D4's air warning rides INSIDE the *what* half by
 *  design and `"Servicing fabricator_1 · NO AIR"` is 31 characters against 26 and 22, so the CSS
 *  ellipsis ate the warning and nothing else. Each view passes its own constant
 *  (`OV_DOCK_TASK_CHARS` / `RZ_DOCK_TASK_CHARS`); omitting it — which the deprecated console shell
 *  does, and which renders `text` anyway — leaves this derivation exactly as it was.
 *  @param {*} entry a roster row @param {number} [budget] the calling dock's character budget */
export function watchTask(entry, budget) {
  const task = entry && typeof entry.task === 'string' ? entry.task.trim() : '';
  const verb = taskVerb(task);
  return {
    text: task || '—',
    what: dockTask(task, budget) || '—',
    working: taskTag(task) != null || verb === EN_ROUTE_VERB,
    waiting: verb === AWAITING_VERB,
  };
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
