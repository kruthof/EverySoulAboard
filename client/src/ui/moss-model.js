// MOSS terminal — the pure brain. STUB: signatures are FROZEN by
// `docs/design/perilune-moss-terminal.spec.md` §2 so the `moss-screen` lane can import a real
// module while the `moss-model` lane fills these bodies in parallel. Only the `moss-model` lane
// edits this file; a signature change is a contract request, not a unilateral edit.
//
// PURITY (spec M-PURITY, node-test enforced by source scan): no `document`, no `window`, no
// `fetch`, no `Date.now()`/`new Date()`, no `Math.random()` in this file, ever. Reducers take a
// model and return a model — they never mutate the argument.
//
// Screens: LEDGER (the systems table) → DETAIL (per-device breakdown) / FAULTLOG (history) /
// PROGRAM (the MOSS DSL IDE). Input handlers return {model, effects}; `effects` are requests the
// DOM layer fulfils (see the table in spec §2) — this module never touches the socket.

export const SCREEN = { LEDGER: 'ledger', DETAIL: 'detail', FAULTLOG: 'faultlog', PROGRAM: 'program' };
export const STATE = { NOMINAL: 0, ATTEND: 1, DEGRADED: 2, OFFLINE: 3 };

const TODO = (name) => { throw new Error('moss-model: ' + name + ' not implemented (stub)'); };

// ---- lifecycle / reducers -------------------------------------------------------------------

/** @returns {object} a fresh model: SCREEN.LEDGER, row 0 selected, empty prompt + history. */
export function openMoss() { return TODO('openMoss'); }

/** Fold a `systems` channel message. Selection is preserved by row ID, never index (IX-M12). */
export function reduceSystems(model, msg) { return TODO('reduceSystems'); }

/** Fold a `moss` event: ev = sys | exec | source | diag | audit | rterror. */
export function reduceMossEvent(model, msg) { return TODO('reduceMossEvent'); }

/** Fold a `chron` message — the FAULT LOG's source. */
export function reduceChron(model, msg) { return TODO('reduceChron'); }

/** Fold a `log` channel tail — the FAULT LOG's live section. */
export function reduceLog(model, msg) { return TODO('reduceLog'); }

// ---- input ----------------------------------------------------------------------------------

/** Pure key state machine. See IX-M8: navigation keys are intercepted before the prompt ONLY
 *  while the prompt buffer is empty. @returns {{model:object, effects:object[]}} */
export function keyPress(model, key, mods) { return TODO('keyPress'); }

/** Prompt buffer edit. @returns {object} model */
export function editPrompt(model, text) { return TODO('editPrompt'); }

/** Submit the prompt line. @returns {{model:object, effects:object[]}} */
export function submitCommand(model, text) { return TODO('submitCommand'); }

/** @returns {{verb:string, args:string[], raw:string, kind:'nav'|'device'|'read'|'bad'}} */
export function parseCommand(text) { return TODO('parseCommand'); }

// ---- pure formatters ------------------------------------------------------------------------

/** `[████▒▒▒▒]`; loadPct -1 → `[` + width spaces + `]` (VS-M4). */
export function loadBar(loadPct, width) { return TODO('loadBar'); }

/** `61%` | `--` */
export function loadText(loadPct) { return TODO('loadText'); }

/** @returns {{text:string, warn:boolean}} — warn drives the `⚠` glyph (VS-M8). */
export function stateCell(state) { return TODO('stateCell'); }

/** `DAY 190 · SCRAM DRILL` | `—` */
export function faultCell(faultDay, faultText) { return TODO('faultCell'); }

/** Raw tick count → `5112:07:44` (H:MM:SS, InvariantCulture, 10 Hz). */
export function uptimeText(ticks) { return TODO('uptimeText'); }

/** The two header lines (VS-M6). @returns {string[]} */
export function headerLines(model) { return TODO('headerLines'); }

/** Per-screen bracket-key hints (VS-M7). @returns {string[]} */
export function footerHints(model) { return TODO('footerHints'); }

/** @returns {{rows:object[], selectedIndex:number, advisory:string}} */
export function ledgerView(model) { return TODO('ledgerView'); }

/** @returns {{title:string, devices:object[], notes:string[], loading:boolean}} */
export function detailView(model) { return TODO('detailView'); }

/** @returns {{title:string, entries:object[], filterId:string}} */
export function faultLogView(model) { return TODO('faultLogView'); }

/** The `>` transcript, newest last, bounded. @returns {object[]} */
export function consoleLines(model) { return TODO('consoleLines'); }
