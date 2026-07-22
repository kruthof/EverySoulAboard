// MOSS terminal model tests — the PURE brain behind the phosphor ledger (moss-model.js), against
// `docs/design/perilune-moss-terminal.spec.md` §6 row 2:
//   · the IX-M8 key-routing table, key by key, in BOTH prompt-buffer states
//   · selection preserved by row id across a row-set change (IX-M12)
//   · the ESC stack (IX-M2) incl. the prompt-clears-first rung
//   · loadBar / loadText / uptimeText / faultCell / stateCell incl. the -1 sentinels (VS-M4/M8)
//   · command parsing (IX-M10): case + space tolerance, the open ambiguity, unknown verbs
//   · M-PURITY by source scan (with a self-check so the scanner cannot silently pass)
//   · reducers never mutate their argument (proved by deep-freezing every input)
// No DOM, no socket, no wire access beyond the committed fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SCREEN, STATE, SYSTEM_IDS, KEY_ROUTE, FAULT_CAVEAT,
  BAR_WIDTH, PROMPT_MAX, HISTORY_CAP, CONSOLE_CAP, PAGE_STEP, NO_TELEMETRY, NO_ROWS,
  TICKS_PER_DAY, TICKS_PER_SECOND,
  openMoss, reduceSystems, reduceMossEvent, reduceChron, reduceLog,
  keyPress, routeKey, editPrompt, submitCommand, parseCommand, normalizeSystemId, rowObj,
  loadBar, loadText, stateCell, faultCell, uptimeText,
  headerLines, footerHints, ledgerView, detailView, faultLogView, consoleLines,
} from '../src/ui/moss-model.js';
import { decode } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
function loadJsonl(name) {
  return readFileSync(join(here, 'fixtures', name), 'utf8')
    .split('\n').filter((l) => l.trim().length).map((l) => decode(l)).filter((m) => m != null);
}
const SYSTEMS = loadJsonl('systems.jsonl');
const MOSS = loadJsonl('moss_sys.jsonl');

/** Recursively freeze so any in-place write inside the module throws (ES modules are strict). */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/** A linked model on the 8-row fixture ledger. */
function linked() { return reduceSystems(openMoss(), SYSTEMS[0]); }

// ---------------- fixtures are internally honest ----------------

test('the systems fixture is self-consistent: uptime and day describe the same instant', () => {
  const m = SYSTEMS[0];
  assert.equal(m.type, 'systems');
  assert.equal(Math.floor(m.uptime / TICKS_PER_DAY), m.day, 'uptime/TicksPerDay must equal day');
  assert.equal(uptimeText(m.uptime), '5112:07:44', 'the mock header line, from real ticks');
  assert.equal(m.rows.length, 8);
  // DA-M2: the mock's medical/comms/grav rows are deliberately absent; these eight are real.
  assert.deepEqual(m.rows.map((r) => r[0]), SYSTEM_IDS);
});

// ---------------- formatters (VS-M4 / VS-M8 and the -1 sentinels) ----------------

test('loadBar: filled/stipple run at the fixed 8-cell width', () => {
  assert.equal(BAR_WIDTH, 8);
  assert.equal(loadBar(0, 8), '[▒▒▒▒▒▒▒▒]');
  assert.equal(loadBar(50, 8), '[████▒▒▒▒]');
  assert.equal(loadBar(100, 8), '[████████]');
  assert.equal(loadBar(61, 8), '[█████▒▒▒]');   // 4.88 cells → 5
  assert.equal(loadBar(12, 8), '[█▒▒▒▒▒▒▒]');   // 0.96 cells → 1
  assert.equal(loadBar(50), '[████▒▒▒▒]', 'width defaults to VS-M4\'s 8');
});

test('loadBar: -1 renders an EMPTY bar of spaces, never a 0% bar (VS-M4)', () => {
  assert.equal(loadBar(-1, 8), '[        ]');
  assert.equal(loadBar(-1, 8).length, loadBar(0, 8).length, 'the column must stay aligned');
  assert.notEqual(loadBar(-1, 8), loadBar(0, 8), 'an unknown load must not look like an idle one');
  // anything unreadable is treated as the sentinel, not as zero
  assert.equal(loadBar(undefined, 8), '[        ]');
  assert.equal(loadBar(NaN, 8), '[        ]');
});

test('loadBar: out-of-range loads clamp instead of overflowing the bar', () => {
  assert.equal(loadBar(140, 8), '[████████]');
});

test('loadText: percent, and `--` for the -1 sentinel', () => {
  assert.equal(loadText(61), '61%');
  assert.equal(loadText(0), '0%');
  assert.equal(loadText(100), '100%');
  assert.equal(loadText(-1), '--');
  assert.equal(loadText(undefined), '--');
  assert.notEqual(loadText(-1), '0%', 'the sentinel must never render as a real reading');
  // the clamp is load-bearing: a host that overshoots must not print 140% next to an 8-cell bar
  assert.equal(loadText(140), '100%');
  assert.equal(loadText(1e9), '100%');
  assert.equal(loadText(60.6), '61%', 'and a fraction rounds rather than printing 60.6%');
  assert.equal(loadText(0.4), '0%');
});

test('stateCell: the ladder, and ⚠ on ATTEND/DEGRADED only (VS-M8)', () => {
  assert.deepEqual(stateCell(STATE.NOMINAL), { text: 'NOMINAL', warn: false });
  assert.deepEqual(stateCell(STATE.ATTEND), { text: 'ATTEND', warn: true });
  assert.deepEqual(stateCell(STATE.DEGRADED), { text: 'DEGRADED', warn: true });
  assert.deepEqual(stateCell(STATE.OFFLINE), { text: 'OFFLINE', warn: false },
    'OFFLINE is an absence, not an alarm');
  // the ladder is append-only: a value we do not know must not read as healthy
  assert.deepEqual(stateCell(7), { text: 'UNKNOWN', warn: false });
  assert.deepEqual(stateCell(undefined), { text: 'UNKNOWN', warn: false });
});

test('faultCell: composes DAY n · TEXT, and -1 is an em dash', () => {
  assert.equal(faultCell(190, 'SCRAM DRILL'), 'DAY 190 · SCRAM DRILL');
  assert.equal(faultCell(-1, ''), '—');
  assert.equal(faultCell(undefined, ''), '—');
  assert.equal(faultCell(0, 'LAUNCH ABORT'), 'DAY 0 · LAUNCH ABORT',
    'day 0 is a real day, not a missing one');
  assert.equal(faultCell(190, ''), 'DAY 190', 'a fault with no summary still shows its day');
  assert.equal(faultCell(190.7, 'X'), 'DAY 190 · X', 'a day is a whole day, never 190.7');
  assert.equal(faultCell(-0.5, 'X'), '—', 'and a fractional negative is still the sentinel');
});

test('no row ever renders a DAY prefix without a real day (DA-M1)', () => {
  // The generalisable guard behind the nav_sensors ruling: a timestamp on a diagnostic screen may
  // come from a day and from nothing else. An absent instrument is not a fault; STATE says OFFLINE
  // and LAST FAULT says nothing at all.
  for (const msg of SYSTEMS) {
    for (const row of msg.rows) {
      const cell = faultCell(row[4], row[5]);
      assert.equal(cell.indexOf('DAY ') === 0, row[4] >= 0, msg.rows.indexOf(row) + ' ' + row[0]);
      if (row[4] < 0) {
        assert.equal(cell, '—', row[0]);
        assert.equal(row[5], '', row[0] + ': §1.1 — faultText is "" when faultDay is -1');
      }
    }
  }
  for (const view of SYSTEMS.map((s) => ledgerView(reduceSystems(openMoss(), s)))) {
    for (const r of view.rows) {
      if (r.fault !== '—') assert.equal(r.fault.indexOf('DAY '), 0, r.id);
    }
  }
  // across the sentinel boundary, directly
  for (const d of [-1000, -2, -1]) assert.equal(faultCell(d, 'ANYTHING AT ALL'), '—', String(d));
  for (const d of [0, 1, 213]) assert.equal(faultCell(d, 'X'), 'DAY ' + d + ' · X');
  // and nav_sensors specifically: the reason lives in the advisory, where it costs no timestamp
  const nav = ledgerView(reduceSystems(openMoss(), SYSTEMS[0])).rows[7];
  assert.equal(nav.id, 'nav_sensors');
  assert.equal(nav.fault, '—');
  assert.equal(nav.stateText, 'OFFLINE');
  assert.ok(nav.advisory.toLowerCase().indexOf('no telescope') >= 0,
    'the reason is stated, just not as a dated fault');
});

test('uptimeText: unbounded hours, zero-padded minutes/seconds, no locale', () => {
  assert.equal(TICKS_PER_SECOND, 10);
  assert.equal(TICKS_PER_DAY, 864000);
  assert.equal(uptimeText(0), '0:00:00');
  assert.equal(uptimeText(74), '0:00:07');           // 7.4 s → truncated, never rounded up
  assert.equal(uptimeText(36000), '1:00:00');        // one hour at 10 Hz
  assert.equal(uptimeText(213 * TICKS_PER_DAY), '5112:00:00', 'hours do not wrap at 24');
  assert.equal(uptimeText(213 * TICKS_PER_DAY + 4640), '5112:07:44');
  assert.equal(uptimeText(-1), '—', 'an unknown uptime is not 0:00:00');
});

// ---------------- row normalization ----------------

test('rowObj: wire tuple → object; a missing state reads UNKNOWN, never NOMINAL', () => {
  assert.deepEqual(rowObj(['reactor', 'REACTOR', 61, 0, 190, 'SCRAM DRILL', 'note']), {
    id: 'reactor', label: 'REACTOR', load: 61, state: 0, faultDay: 190,
    faultText: 'SCRAM DRILL', advisory: 'note',
  });
  const sparse = rowObj(['thermal']);
  assert.equal(sparse.label, 'THERMAL', 'a missing label falls back to the id');
  assert.equal(sparse.load, -1);
  assert.equal(stateCell(sparse.state).text, 'UNKNOWN');
  assert.equal(rowObj(['']), null, 'a row with no id is not a row');
  assert.equal(rowObj(null), null);
});

// ---------------- IX-M12: selection by ID, never index ----------------

test('IX-M12: a row set that changes length does not move the cursor (selection is an id)', () => {
  let m = linked();
  assert.equal(m.selectedId, 'reactor', 'row 0 selected on first telemetry');
  for (let i = 0; i < 4; i++) m = keyPress(m, 'ArrowDown').model;
  assert.equal(m.selectedId, 'thermal');
  assert.equal(ledgerView(m).selectedIndex, 4);
  // the second fixture message drops `hydroponics`: thermal is now index 3
  m = reduceSystems(m, SYSTEMS[1]);
  assert.equal(m.rows.length, 7);
  assert.equal(m.selectedId, 'thermal', 'the SAME ROW stays selected');
  assert.equal(ledgerView(m).selectedIndex, 3, 'and its index moved under it, as it must');
  assert.equal(ledgerView(m).rows[3].label, 'THERMAL');
});

test('IX-M12: when the selected row disappears, the nearest surviving index is taken', () => {
  let m = linked();
  m = keyPress(m, 'End').model;
  assert.equal(m.selectedId, 'nav_sensors');
  const shrunk = reduceSystems(m, { type: 'systems', hull: '7741', day: 213, uptime: 1, rows: SYSTEMS[0].rows.slice(0, 3) });
  assert.equal(shrunk.selectedId, 'water_reclaim', 'index 7 clamps into a 3-row list');
  assert.equal(ledgerView(shrunk).selectedIndex, 2);
});

test('reduceSystems: a malformed message is a no-op and does NOT claim a link (IX-M13)', () => {
  const fresh = deepFreeze(openMoss());
  assert.equal(reduceSystems(fresh, null), fresh);
  assert.equal(reduceSystems(fresh, { type: 'systems' }), fresh);
  assert.equal(reduceSystems(fresh, { rows: 'nope' }).linked, false);
  assert.equal(ledgerView(fresh).notice, NO_TELEMETRY);
  assert.deepEqual(ledgerView(fresh).rows, []);
  assert.equal(ledgerView(fresh).selectedIndex, -1);
  assert.equal(headerLines(fresh)[1], 'PERILUNE HULL — · DAY — · UPTIME —',
    'an unknown header shows dashes, not a plausible zero');
});

// ---------------- IX-M8: the key-routing table, both buffer states ----------------

// The expectation is written out LITERALLY here rather than read from KEY_ROUTE — a test that
// derives its expectation from the table it is checking cannot fail.
const ROUTE_TABLE = [
  // key,        empty buffer, buffer = 'op'
  ['ArrowUp',    'nav',    'prompt'],
  ['ArrowDown',  'nav',    'prompt'],
  ['Enter',      'nav',    'prompt'],
  ['Escape',     'nav',    'prompt'],
  ['l',          'nav',    'pass'],
  ['L',          'nav',    'pass'],
  ['p',          'nav',    'pass'],
  ['P',          'nav',    'pass'],
  ['PageUp',     'nav',    'nav'],
  ['PageDown',   'nav',    'nav'],
  ['Home',       'nav',    'pass'],
  ['End',        'nav',    'pass'],
  ['Tab',        'pass',   'pass'],
  ['a',          'pass',   'pass'],
  ['1',          'pass',   'pass'],
  [' ',          'pass',   'pass'],
];

test('IX-M8: every navigation key routes by buffer state, key by key', () => {
  const empty = linked();
  const typed = editPrompt(empty, 'op');
  assert.equal(empty.prompt, '');
  assert.equal(typed.prompt, 'op');
  for (const [key, whenEmpty, whenTyped] of ROUTE_TABLE) {
    assert.equal(routeKey(empty, key), whenEmpty, key + ' with an EMPTY buffer');
    assert.equal(routeKey(typed, key), whenTyped, key + ' with a TYPED buffer');
  }
});

test('IX-M8: the KEY_ROUTE export is the table the router actually uses', () => {
  // guards against the table being decorative: every documented row must be reachable
  for (const [key, whenEmpty, whenTyped] of ROUTE_TABLE) {
    const k = key.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(KEY_ROUTE, k)) continue;
    assert.deepEqual(KEY_ROUTE[k], [whenEmpty, whenTyped], 'KEY_ROUTE.' + k);
  }
});

test('IX-M8: a modifier hands the key back to the browser (Ctrl-L is not ours)', () => {
  const m = linked();
  for (const mods of [{ ctrl: true }, { ctrlKey: true }, { alt: true }, { meta: true }]) {
    assert.equal(routeKey(m, 'l', mods), 'pass');
    assert.equal(routeKey(m, 'Enter', mods), 'pass');
  }
  assert.equal(routeKey(m, 'l', { shift: true }), 'nav', 'Shift alone does not change routing');
});

test('IX-M8 empty buffer: the nav keys actually navigate', () => {
  const m = linked();
  // ↓ moves the selection, clamped at both ends (IX-M3, no wrap)
  assert.equal(keyPress(m, 'ArrowDown').model.selectedId, 'life_support');
  assert.equal(keyPress(m, 'ArrowUp').model.selectedId, 'reactor', 'clamped at the top, not wrapped');
  const last = keyPress(m, 'End').model;
  assert.equal(last.selectedId, 'nav_sensors');
  assert.equal(keyPress(last, 'ArrowDown').model.selectedId, 'nav_sensors', 'clamped at the bottom');
  assert.equal(keyPress(last, 'Home').model.selectedId, 'reactor');
  assert.equal(keyPress(m, 'PageDown').model.selectedId, SYSTEMS[0].rows[PAGE_STEP][0]);
  assert.equal(keyPress(last, 'PageUp').model.selectedId, SYSTEMS[0].rows[7 - PAGE_STEP][0]);
  // ENTER opens DETAIL and asks the host (IX-M4)
  const ent = keyPress(m, 'Enter');
  assert.equal(ent.model.screen, SCREEN.DETAIL);
  assert.deepEqual(ent.effects, [{ k: 'moss', op: 'sys', tid: 'reactor' }]);
  assert.equal(detailView(ent.model).loading, true, 'LOADING…, never a fabricated table');
  assert.deepEqual(detailView(ent.model).devices, []);
  // L opens the fault log and asks for the chronicle (IX-M5)
  const log = keyPress(m, 'L');
  assert.equal(log.model.screen, SCREEN.FAULTLOG);
  assert.equal(log.model.filterId, null, 'from the LEDGER it opens unfiltered');
  assert.deepEqual(log.effects, [{ k: 'chron' }]);
  // P opens the program screen (IX-M6)
  assert.equal(keyPress(m, 'p').model.screen, SCREEN.PROGRAM);
});

test('IX-M8 typed buffer: ENTER submits, ↑↓ are history, L/P are just letters', () => {
  const m = editPrompt(linked(), 'help');
  const submitted = keyPress(m, 'Enter');
  assert.equal(submitted.route, 'prompt');
  assert.equal(submitted.model.screen, SCREEN.LEDGER, 'ENTER did NOT open a system detail');
  assert.equal(submitted.model.prompt, '');
  assert.ok(consoleLines(submitted.model).some((l) => l.text.indexOf('HELP') === 0));
  // L with a typed buffer must not open the fault log — it is a character
  const typedL = keyPress(m, 'L');
  assert.equal(typedL.route, 'pass');
  assert.equal(typedL.handled, false, 'the caller must let the character through');
  assert.equal(typedL.model, m, 'and the model is untouched');
  assert.equal(keyPress(m, 'p').model.screen, SCREEN.LEDGER);
  // ↑ with a typed buffer walks history, it does not move the ledger cursor
  const withHistory = submitCommand(linked(), 'status').model;
  const typed = editPrompt(withHistory, 'x');
  const up = keyPress(typed, 'ArrowUp');
  assert.equal(up.route, 'prompt');
  assert.equal(up.model.prompt, 'status');
  assert.equal(up.model.selectedId, withHistory.selectedId, 'the ledger cursor did not move');
});

test('IX-M8: off the LEDGER there is no prompt, so a stale buffer cannot capture keys', () => {
  const m = editPrompt(linked(), 'op');
  const detail = keyPress(editPrompt(m, ''), 'Enter').model;   // descend with an empty buffer
  const stale = { ...detail, prompt: 'op' };
  assert.equal(routeKey(stale, 'Escape'), 'nav', 'ESC still pops the stack on DETAIL');
  assert.equal(routeKey(stale, 'l'), 'nav', 'L still opens the fault log on DETAIL');
  // on PROGRAM the IDE owns its own text area: only ESC is taken
  const prog = keyPress(linked(), 'p').model;
  assert.equal(routeKey(prog, 'Escape'), 'nav');
  assert.equal(routeKey(prog, 'l'), 'pass');
  assert.equal(routeKey(prog, 'ArrowUp'), 'pass');
});

// ---------------- IX-M2: the ESC stack ----------------

test('IX-M2: ESC with a non-empty prompt clears the prompt FIRST', () => {
  const m = editPrompt(linked(), 'set vent_ls.rate max');
  const esc = keyPress(m, 'Escape');
  assert.equal(esc.route, 'prompt');
  assert.equal(esc.model.prompt, '');
  assert.equal(esc.model.screen, SCREEN.LEDGER, 'no screen transition happened');
  assert.deepEqual(esc.effects, [], 'and MOSS was not exited');
  // a second ESC — now with an empty buffer — leaves MOSS
  assert.deepEqual(keyPress(esc.model, 'Escape').effects, [{ k: 'exit' }]);
});

test('IX-M2: PROGRAM → DETAIL/FAULTLOG → LEDGER → exit, innermost first', () => {
  let m = linked();
  m = keyPress(m, 'Enter').model;                       // → DETAIL
  assert.equal(m.screen, SCREEN.DETAIL);
  m = keyPress(m, 'L').model;                           // → FAULTLOG (filtered from DETAIL)
  assert.equal(m.screen, SCREEN.FAULTLOG);
  assert.equal(m.filterId, 'reactor', 'IX-M5: from DETAIL the log opens filtered');
  m = keyPress(m, 'p').model;                           // → PROGRAM
  assert.equal(m.screen, SCREEN.PROGRAM);
  let step = keyPress(m, 'Escape');
  assert.equal(step.model.screen, SCREEN.FAULTLOG);
  assert.deepEqual(step.effects, []);
  step = keyPress(step.model, 'Escape');
  assert.equal(step.model.screen, SCREEN.DETAIL);
  step = keyPress(step.model, 'Escape');
  assert.equal(step.model.screen, SCREEN.LEDGER);
  assert.deepEqual(step.effects, [], 'the ship view is NOT restored until the ledger is the top');
  step = keyPress(step.model, 'Escape');
  assert.deepEqual(step.effects, [{ k: 'exit' }]);
  assert.equal(step.model.screen, SCREEN.LEDGER, 'the exit is the caller\'s to perform');
});

test('IX-M5: L closes the fault log again, returning where it came from', () => {
  const fromLedger = keyPress(linked(), 'l').model;
  assert.equal(keyPress(fromLedger, 'l').model.screen, SCREEN.LEDGER);
  const detail = keyPress(linked(), 'Enter').model;
  const fromDetail = keyPress(detail, 'l').model;
  assert.equal(keyPress(fromDetail, 'l').model.screen, SCREEN.DETAIL);
});

test('the ESC stack cannot grow without bound when a screen is re-entered', () => {
  // by key: P on PROGRAM belongs to the IDE, so it never re-enters at all
  let m = keyPress(linked(), 'p').model;
  for (let i = 0; i < 5; i++) m = keyPress(m, 'p').model;
  assert.equal(m.stack.length, 1);
  // by command: picking a second terminal out of the PROGRAM directory re-enters PROGRAM, and
  // that must swap the terminal, not deepen the ladder.
  let p = submitCommand(linked(), 'prog t1').model;
  assert.equal(p.stack.length, 1);
  p = submitCommand(p, 'prog t2').model;
  assert.equal(p.screen, SCREEN.PROGRAM);
  assert.equal(p.program.tid, 't2');
  assert.equal(p.stack.length, 1, 're-entering PROGRAM does not push another rung');
  assert.equal(keyPress(p, 'Escape').model.screen, SCREEN.LEDGER);
  // the same for the fault log: LOG <other system> re-filters in place
  let f = submitCommand(linked(), 'log reactor').model;
  f = submitCommand(f, 'log thermal').model;
  assert.equal(f.screen, SCREEN.FAULTLOG);
  assert.equal(f.filterId, 'thermal');
  assert.equal(f.stack.length, 1);
  assert.equal(keyPress(f, 'Escape').model.screen, SCREEN.LEDGER);
  // and OPEN from a deeper screen returns to the ledger before descending, never stacking twice
  const deep = submitCommand(submitCommand(linked(), 'open reactor').model, 'open thermal').model;
  assert.equal(deep.screen, SCREEN.DETAIL);
  assert.equal(deep.detail.tid, 'thermal');
  assert.equal(deep.stack.length, 1);
  assert.equal(keyPress(deep, 'Escape').model.screen, SCREEN.LEDGER);
});

// ---------------- IX-M9: command history ----------------

test('IX-M9: history walks newest first, clamps, and restores the draft at the bottom', () => {
  // deliberately three lines that all stay on the LEDGER — `open` would navigate away and the
  // prompt would no longer be the thing receiving ↑ (that is IX-M8, tested above).
  let m = linked();
  m = submitCommand(m, 'status').model;
  m = submitCommand(m, 'ship.power').model;
  m = submitCommand(m, 'help').model;
  assert.deepEqual(m.history, ['status', 'ship.power', 'help']);
  m = editPrompt(m, 'z');                       // a draft, so ↑ routes to the prompt
  m = keyPress(m, 'ArrowUp').model;
  assert.equal(m.prompt, 'help', 'newest first');
  m = keyPress(m, 'ArrowUp').model;
  assert.equal(m.prompt, 'ship.power');
  m = keyPress(m, 'ArrowUp').model;
  assert.equal(m.prompt, 'status');
  m = keyPress(m, 'ArrowUp').model;
  assert.equal(m.prompt, 'status', 'clamped at the oldest line, no wrap');
  m = keyPress(m, 'ArrowDown').model;
  assert.equal(m.prompt, 'ship.power');
  m = keyPress(m, 'ArrowDown').model;
  m = keyPress(m, 'ArrowDown').model;
  assert.equal(m.prompt, 'z', 'past the newest line the stashed draft returns');
});

test('IX-M9: consecutive duplicate lines collapse; the ring is bounded', () => {
  let m = linked();
  m = submitCommand(m, 'status').model;
  m = submitCommand(m, 'status').model;
  assert.deepEqual(m.history, ['status']);
  m = submitCommand(m, 'help').model;
  m = submitCommand(m, 'status').model;
  assert.deepEqual(m.history, ['status', 'help', 'status'], 'non-consecutive repeats are kept');
  for (let i = 0; i < HISTORY_CAP + 10; i++) m = submitCommand(m, 'help ' + i).model;
  assert.equal(m.history.length, HISTORY_CAP);
  assert.equal(m.history[m.history.length - 1], 'help ' + (HISTORY_CAP + 9));
});

test('editPrompt: bounded at 240 chars (IX-M42) and it ends a history walk', () => {
  const base = submitCommand(linked(), 'status').model;
  const long = editPrompt(base, 'x'.repeat(400));
  assert.equal(long.prompt.length, PROMPT_MAX);
  const walking = keyPress(editPrompt(base, 'q'), 'ArrowUp').model;
  assert.equal(walking.histIdx, 0);
  assert.equal(editPrompt(walking, 'stat').histIdx, -1, 'typing leaves the history walk');
});

// ---------------- IX-M10: command parsing ----------------

test('IX-M10: parsing is case-insensitive and space-tolerant', () => {
  assert.deepEqual(parseCommand('OPEN life_support').kind, 'nav');
  assert.deepEqual(parseCommand('open life support').kind, 'nav');
  assert.deepEqual(parseCommand('  Open   LIFE   Support  ').kind, 'nav');
  assert.equal(parseCommand('OPEN life_support').verb, 'open');
  assert.equal(parseCommand('  status ').raw, 'status');
  for (const s of ['life support', 'LIFE_SUPPORT', 'Life-Support', 'life   support']) {
    assert.equal(normalizeSystemId(s), 'life_support', s);
  }
  assert.equal(normalizeSystemId('NAV / SENSORS'), 'nav_sensors');
  assert.equal(normalizeSystemId(''), '');
});

test('IX-M10: `open` is nav for a system and a device write for anything else', () => {
  assert.equal(parseCommand('open reactor').kind, 'nav');
  assert.equal(parseCommand('open door_storage').kind, 'device');
  // a multi-word argument cannot be a device id, so it is a system attempt — which then fails
  // honestly rather than being posted to the host as a device write (DA-M2's absent rows land here)
  assert.equal(parseCommand('open medical suite').kind, 'nav');
  assert.equal(parseCommand('open').kind, 'nav');
  assert.equal(parseCommand('close door_storage').kind, 'device');
  assert.equal(parseCommand('lock door_lab').kind, 'device');
  assert.equal(parseCommand('unlock door_lab').kind, 'device');
  assert.equal(parseCommand('set vent_ls.rate max').kind, 'device');
});

test('IX-M10: bare property reads classify as `read`', () => {
  assert.equal(parseCommand('ship.power').kind, 'read');
  assert.equal(parseCommand('hydro.co2').kind, 'read');
  assert.equal(parseCommand('vent_ls.rate').kind, 'read');
  assert.equal(parseCommand('SHIP.POWER').kind, 'read', 'reads are case-insensitive too');
  assert.equal(parseCommand('ship.power = 1').kind, 'bad', 'an assignment is not a bare read');
});

test('IX-M10: an unknown verb is `bad` and answers with the HELP pointer, never a trace', () => {
  assert.equal(parseCommand('frobnicate the reactor').kind, 'bad');
  assert.equal(parseCommand('').kind, 'bad');
  const out = submitCommand(linked(), 'frobnicate the reactor');
  const last = consoleLines(out.model).pop();
  assert.equal(last.stream, 2);
  assert.equal(last.text, "UNKNOWN COMMAND 'FROBNICATE' — TYPE HELP");
  assert.deepEqual(out.effects, [], 'nothing was sent to the host');
});

// ---------------- submitCommand dispatch ----------------

test('submitCommand: device and read lines are FORWARDED, never executed here', () => {
  const m = linked();
  assert.deepEqual(submitCommand(m, 'close door_storage').effects,
    [{ k: 'moss', op: 'exec', text: 'close door_storage' }]);
  assert.deepEqual(submitCommand(m, 'ship.power').effects,
    [{ k: 'moss', op: 'exec', text: 'ship.power' }]);
  // the echo is in the transcript; the OUTPUT only ever arrives from the host
  const out = submitCommand(m, 'close door_storage').model;
  assert.deepEqual(consoleLines(out).pop(), { stream: 0, text: '> close door_storage' });
});

test('IX-M13: with the link down, device/read lines are refused with a typed error', () => {
  const dark = openMoss();
  const refused = submitCommand(dark, 'close door_storage');
  assert.deepEqual(refused.effects, [], 'no write leaves the client');
  assert.equal(consoleLines(refused.model).pop().stream, 2);
  assert.ok(consoleLines(refused.model).pop().text.indexOf(NO_TELEMETRY) === 0);
  assert.equal(submitCommand(dark, 'status').effects.length, 0);
  assert.equal(consoleLines(submitCommand(dark, 'status').model).pop().text, NO_TELEMETRY);
  // reads that need no link still work
  assert.ok(consoleLines(submitCommand(dark, 'help').model).length > 3);
});

test('IX-M42: an over-long line is a typed error, not a truncated command', () => {
  const m = submitCommand(linked(), 'status').model;
  const out = submitCommand(m, 'close ' + 'x'.repeat(PROMPT_MAX));
  assert.deepEqual(out.effects, []);
  assert.equal(consoleLines(out.model).pop().stream, 2);
  assert.ok(consoleLines(out.model).pop().text.indexOf('LINE TOO LONG') === 0);
  assert.deepEqual(out.model.history, ['status'],
    'a line the client itself rejected must not come back on ↑ as if it had run');
});

test('IX-M10: a row on the player\'s own ledger opens, even outside the fixed vocabulary', () => {
  // The live ledger is the authority. If the host ships a row `parseCommand` has never heard of,
  // the player can still see it — so typing its id must open it, not tell them it does not exist.
  const extra = ['medical_suite', 'MEDICAL SUITE', 44, 1, -1, '', 'a row from a newer host'];
  const m = reduceSystems(openMoss(),
    { type: 'systems', hull: '7741', day: 213, uptime: 1, rows: SYSTEMS[0].rows.concat([extra]) });
  assert.equal(SYSTEM_IDS.indexOf('medical_suite'), -1, 'deliberately outside parseCommand\'s list');
  assert.equal(parseCommand('open medical_suite').kind, 'device', 'the model-free parse cannot know');
  const out = submitCommand(m, 'open medical_suite');
  assert.equal(out.model.screen, SCREEN.DETAIL, 'but submitCommand re-resolves against the rows');
  assert.equal(out.model.selectedId, 'medical_suite');
  assert.deepEqual(out.effects, [{ k: 'moss', op: 'sys', tid: 'medical_suite' }]);
  // by label, and case/space tolerantly, too
  assert.equal(submitCommand(m, 'OPEN medical suite').model.detail.tid, 'medical_suite');
  // and a name that is NOT on the ledger is still a device line for the host to judge
  assert.deepEqual(submitCommand(m, 'open door_storage').effects,
    [{ k: 'moss', op: 'exec', text: 'open door_storage' }]);
});

test('IX-M13: a link that is up but carries no rows says so (an empty grid is not "nominal")', () => {
  const empty = reduceSystems(openMoss(), { type: 'systems', hull: '7741', day: 213, uptime: 1, rows: [] });
  assert.equal(empty.linked, true);
  const view = ledgerView(empty);
  assert.deepEqual(view.rows, []);
  assert.equal(view.selectedIndex, -1);
  assert.equal(view.notice, NO_ROWS);
  assert.notEqual(view.notice, '', 'a silent empty table is the precise thing IX-M13 forbids');
  // rows that are all malformed land in the same place
  const junk = reduceSystems(openMoss(), { type: 'systems', rows: [null, [''], 7] });
  assert.equal(ledgerView(junk).notice, NO_ROWS);
  // and the prompt's own answer agrees with the screen's
  assert.equal(consoleLines(submitCommand(empty, 'status').model).pop().text, NO_ROWS);
  // the three notices are distinct states, not one blurred one
  assert.notEqual(NO_ROWS, NO_TELEMETRY);
  assert.equal(ledgerView(openMoss()).notice, NO_TELEMETRY);
  assert.equal(ledgerView(linked()).notice, '');
});

test('submitCommand: the nav verbs', () => {
  const m = linked();
  // OPEN <system> == ENTER on the row
  const opened = submitCommand(m, 'open life support');
  assert.equal(opened.model.screen, SCREEN.DETAIL);
  assert.equal(opened.model.selectedId, 'life_support');
  assert.deepEqual(opened.effects, [{ k: 'moss', op: 'sys', tid: 'life_support' }]);
  // an unknown system is a typed error, and no screen change
  const bad = submitCommand(m, 'open medical suite');
  assert.equal(bad.model.screen, SCREEN.LEDGER);
  assert.deepEqual(bad.effects, []);
  assert.ok(consoleLines(bad.model).pop().text.indexOf('UNKNOWN SYSTEM') === 0);
  // LOG [system]
  const log = submitCommand(m, 'LOG Thermal');
  assert.equal(log.model.screen, SCREEN.FAULTLOG);
  assert.equal(log.model.filterId, 'thermal');
  assert.deepEqual(log.effects, [{ k: 'chron' }]);
  // PROG [terminal]
  const prog = submitCommand(m, 'prog t_bridge');
  assert.equal(prog.model.screen, SCREEN.PROGRAM);
  assert.equal(prog.model.program.tid, 't_bridge');
  assert.deepEqual(prog.effects, [{ k: 'moss', op: 'open', tid: 't_bridge' }]);
  // EXIT / CLEAR
  assert.deepEqual(submitCommand(m, 'exit').effects, [{ k: 'exit' }]);
  assert.deepEqual(consoleLines(submitCommand(m, 'clear').model), []);
  // STATUS renders one line per live row, no invented rows
  const before = consoleLines(m).length;
  const status = submitCommand(m, 'status').model;
  const body = consoleLines(status).slice(before + 1).map((l) => l.text);  // skip the '> status' echo
  assert.equal(body.length, 8, 'one line per live row, no invented rows');
  // STATUS is this module's only column layout (VS-M2: alignment by monospace grid, not CSS), so
  // it is pinned exactly — including the case that misaligns first, a `--` where a number goes.
  assert.equal(body[0], 'REACTOR           61%  NOMINAL');
  assert.equal(body[7], 'NAV / SENSORS      --  OFFLINE');
  assert.equal(body[0].indexOf('%'), body[7].indexOf('-') + 1,
    'the load column ends in the same place whether or not there is a reading');
  const states = ['NOMINAL', 'DEGRADED', 'ATTEND', 'ATTEND', 'ATTEND', 'NOMINAL', 'NOMINAL', 'OFFLINE'];
  body.forEach((l, i) => assert.equal(l.slice(23), states[i],
    'the STATE column starts at the same character on every row'));
});

test('submitCommand: an empty line is a no-op that does not pollute history', () => {
  const m = submitCommand(linked(), 'status').model;
  const out = submitCommand(m, '   ');
  assert.deepEqual(out.effects, []);
  assert.deepEqual(out.model.history, ['status']);
  assert.equal(consoleLines(out.model).length, consoleLines(m).length);
});

// ---------------- moss events ----------------

test('reduceMossEvent: `sys` fills the OPEN detail only, and clears LOADING', () => {
  const m = keyPress(submitCommand(linked(), 'open life_support').model, 'x').model;
  assert.equal(detailView(m).loading, true);
  const filled = reduceMossEvent(m, MOSS[0]);
  const view = detailView(filled);
  assert.equal(view.loading, false);
  assert.equal(view.title, 'LIFE SUPPORT');
  assert.equal(view.devices.length, 4);
  assert.equal(view.devices[0].name, 'scrubber_ls');
  assert.equal(view.devices[0].conditionText, '88%');
  assert.equal(view.devices[0].poweredText, 'PWR');
  assert.equal(view.devices[3].poweredText, 'OFF');
  assert.equal(view.devices[3].note, 'FAILED');
  assert.equal(view.devices[0].place, 'DECK 0 · 12,7');
  // a reply for a system we are NOT looking at must not overwrite the screen
  assert.equal(reduceMossEvent(filled, MOSS[1]), filled);
});

test('IX-M22: the DERIVATION is the host\'s own sentence, off the wire, and nothing else', () => {
  const pending = submitCommand(linked(), 'open life_support').model;
  const m = reduceMossEvent(pending, MOSS[0]);
  const notes = detailView(m).notes;
  assert.equal(notes[0], MOSS[0].derivation, 'the host\'s own account of its own arithmetic');
  assert.equal(notes[1], FAULT_CAVEAT, 'and §5.1\'s caveat about THIS module\'s name join');
  assert.equal(notes.length, 2, 'one wire sentence + the caveat — no client prose at all');
});

test('IX-M22: no derivation is rendered before the reply lands (there is nothing true to say)', () => {
  // The client used to hold a fallback table. It drifted — its THERMAL entry stated the ratio
  // upside down against the host's as-built derivation — so it is gone. LOADING… is IX-M4's
  // honest answer for this frame, and a screen that says nothing beats one that says a reciprocal.
  const pending = submitCommand(linked(), 'open life_support').model;
  assert.equal(detailView(pending).loading, true);
  assert.deepEqual(detailView(pending).notes, []);
  assert.deepEqual(detailView(pending).devices, []);
});

test('IX-M22: a reply that carries no derivation says so, rather than inventing one', () => {
  // moss_sys.jsonl:5 — a real protocol case (an older host, or a row whose derivation is unwritten)
  // with committed wire behind it, not an inline literal.
  const noDerivation = MOSS[4];
  assert.equal(noDerivation.ev, 'sys');
  assert.equal(noDerivation.tid, 'thermal');
  assert.equal(noDerivation.derivation, undefined, 'the fixture must actually lack the field');
  const m = reduceMossEvent(submitCommand(linked(), 'open thermal').model, noDerivation);
  const notes = detailView(m).notes;
  assert.equal(detailView(m).loading, false);
  assert.ok(notes[0].indexOf('DERIVATION UNDOCUMENTED') === 0);
  assert.equal(notes[1], FAULT_CAVEAT);
  assert.equal(detailView(m).devices.length, 1, 'the device table still arrived');
  // whitespace is not a derivation either
  const blank = reduceMossEvent(submitCommand(linked(), 'open thermal').model,
    { ev: 'sys', tid: 'thermal', derivation: '   ', devices: [] });
  assert.ok(detailView(blank).notes[0].indexOf('DERIVATION UNDOCUMENTED') === 0);
});

test('IX-M22: a device place needs all three coordinates, or it is —', () => {
  const open = () => submitCommand(linked(), 'open thermal').model;
  const at = (deck, x, y) => detailView(reduceMossEvent(open(),
    { ev: 'sys', tid: 'thermal', derivation: 'd', devices: [['rad_a', 'Radiator', 50, 1, 100, deck, x, y, '']] })).devices[0].place;
  assert.equal(at(0, 12, 7), 'DECK 0 · 12,7');
  assert.equal(at(2, 0, 0), 'DECK 2 · 0,0', 'the origin tile is a real place');
  assert.equal(at(-1, 12, 7), '—');
  assert.equal(at(0, -1, 7), '—', 'a missing x is not a location');
  assert.equal(at(0, 12, -1), '—', 'a missing y is not a location');
  // the wire tuple that omits the coordinates entirely
  const short = detailView(reduceMossEvent(open(),
    { ev: 'sys', tid: 'thermal', derivation: 'd', devices: [['rad_a', 'Radiator', 50, 1, 100]] })).devices[0];
  assert.equal(short.place, '—');
});

test('reduceMossEvent: `exec` lines land in the transcript, minus the host\'s duplicate echo', () => {
  // §1.3: stream 0 is the host echoing back a line this client already echoed at submit time.
  // Rendering both prints every command twice; the LOCAL echo is the one kept, because it appears
  // instantly and survives a slow or dead link.
  let m = submitCommand(linked(), 'close door_storage').model;
  const before = consoleLines(m).length;
  m = reduceMossEvent(m, MOSS[2]);
  assert.equal(MOSS[2].lines[0][0], 0, 'the fixture really does carry a stream-0 echo');
  assert.equal(consoleLines(m).length, before + 1, 'one line rendered, not two');
  assert.deepEqual(consoleLines(m).slice(-2), [
    { stream: 0, text: '> close door_storage' },
    { stream: 1, text: 'door_storage: CLOSED' },
  ]);
  assert.equal(consoleLines(m).filter((l) => l.text === 'close door_storage').length, 0,
    'the host\'s bare echo never reaches the transcript');
  // a reply that is ONLY a stream-0 echo renders nothing at all
  const echoOnly = reduceMossEvent(m, { ev: 'exec', tid: '@console', ok: true, lines: [[0, 'status']] });
  assert.equal(consoleLines(echoOnly).length, consoleLines(m).length);
  // …and if that reply also failed, the failure is still surfaced
  const failedEcho = reduceMossEvent(m, { ev: 'exec', tid: '@console', ok: false, lines: [[0, 'status']] });
  assert.deepEqual(consoleLines(failedEcho).pop(), { stream: 2, text: 'COMMAND FAILED' });
  m = reduceMossEvent(m, MOSS[3]);
  assert.deepEqual(consoleLines(m).pop(), { stream: 2, text: 'ship.power is read-only' });
  // a failure with no lines still says something
  m = reduceMossEvent(m, { ev: 'exec', tid: '@console', ok: false, lines: [] });
  assert.deepEqual(consoleLines(m).pop(), { stream: 2, text: 'COMMAND FAILED' });
});

test('reduceMossEvent: PROGRAM events are delegated to the IDE model; junk is ignored', () => {
  const m = submitCommand(linked(), 'prog t1').model;
  const withSource = reduceMossEvent(m, { ev: 'source', tid: 't1', text: 'rule a', hash: 7 });
  assert.equal(withSource.program.installed, 'rule a');
  assert.equal(withSource.program.state, 'viewing');
  const err = reduceMossEvent(withSource, { ev: 'rterror', tid: 't1', text: 'boom' });
  assert.equal(err.program.rterror, 'boom');
  // unknown / malformed events are forward-compatibly ignored, and identity is preserved
  assert.equal(reduceMossEvent(m, { ev: 'weather' }), m);
  assert.equal(reduceMossEvent(m, null), m);
  assert.equal(reduceMossEvent(m, { tid: 't1' }), m);
});

test('the transcript ring is bounded', () => {
  let m = linked();
  for (let i = 0; i < CONSOLE_CAP + 20; i++) m = reduceMossEvent(m, { ev: 'exec', lines: [[1, 'line ' + i]] });
  assert.equal(consoleLines(m).length, CONSOLE_CAP);
  assert.equal(consoleLines(m).pop().text, 'line ' + (CONSOLE_CAP + 19));
});

// ---------------- fault log ----------------

const CHRON = {
  type: 'chron',
  days: [
    { day: 190, headline: 'Day 190 — a quiet watch', lines: ['REACTOR SCRAM DRILL COMPLETED'] },
    { day: 211, headline: 'Day 211 — the tanks', lines: ['TANK_HYDRO RAN DRY', 'GALLEY MEAL SKIPPED'] },
  ],
};
const LOG = { type: 'log', lines: ['D213.10 BROWNOUT ON THE REACTOR BUS', 'D213.44 SCRUBBER_AFT WORN'] };

test('the fault log joins chron + the live log tail, newest first', () => {
  let m = reduceChron(reduceLog(linked(), LOG), CHRON);
  m = keyPress(m, 'l').model;
  const view = faultLogView(m);
  assert.equal(view.title, 'FAULT LOG');
  assert.equal(view.filterId, null);
  assert.equal(view.entries[0].text, 'SCRUBBER_AFT WORN', 'the newest live line leads');
  assert.equal(view.entries[0].day, 213, 'the D-token became the day stamp');
  assert.equal(view.entries[0].live, true);
  assert.equal(view.entries[1].text, 'BROWNOUT ON THE REACTOR BUS');
  assert.equal(view.entries[2].live, false, 'then the chronicle, newest day first');
  assert.equal(view.entries[2].day, 211);
  assert.equal(view.entries.length, 2 + 2 + 3);
});

test('the fault log filter is the documented weak NAME join (§5.1)', () => {
  let m = reduceChron(reduceLog(linked(), LOG), CHRON);
  m = keyPress(keyPress(m, 'Enter').model, 'l').model;      // DETAIL(reactor) → filtered log
  const view = faultLogView(m);
  assert.equal(view.filterId, 'reactor');
  assert.equal(view.title, 'FAULT LOG — REACTOR');
  assert.deepEqual(view.entries.map((e) => e.text),
    ['BROWNOUT ON THE REACTOR BUS', 'REACTOR SCRAM DRILL COMPLETED']);
  // once DETAIL is fetched, member device NAMES widen the join
  const water = keyPress(submitCommand(reduceChron(reduceLog(linked(), LOG), CHRON), 'open water reclaim').model, 'l').model;
  assert.deepEqual(faultLogView(water).entries.map((e) => e.text), [],
    'nothing mentions "water" or "reclaim" — the honest answer is nothing');
  const named = reduceMossEvent(
    { ...water, screen: SCREEN.DETAIL, detail: { tid: 'water_reclaim', devices: [], loading: true } },
    { ev: 'sys', tid: 'water_reclaim', devices: [['tank_hydro', 'WaterTank', 20, 1, 0, 0, 4, 4, '']] });
  const filtered = { ...named, screen: SCREEN.FAULTLOG, filterId: 'water_reclaim' };
  // The join is a loose SUBSTRING match on purpose: on a diagnostic screen, catching an extra
  // line ('the tanks' from the device `tank_hydro`) is a far cheaper mistake than hiding a real
  // fault. §5.1 says out loud that this is a string join, and this is what that costs.
  assert.deepEqual(faultLogView(filtered).entries.map((e) => e.text),
    ['TANK_HYDRO RAN DRY', 'Day 211 — the tanks']);
});

test('reduceChron / reduceLog: garbage is a no-op', () => {
  const m = deepFreeze(linked());
  assert.equal(reduceChron(m, null), m);
  assert.equal(reduceChron(m, { days: 'nope' }), m);
  assert.equal(reduceLog(m, null), m);
  assert.deepEqual(reduceLog(m, { lines: ['no day token here'] }).log, [{ day: -1, text: 'no day token here' }]);
});

// ---------------- views ----------------

test('ledgerView: every cell is formatted, and the -1 row is honest', () => {
  const view = ledgerView(linked());
  assert.equal(view.linked, true);
  assert.equal(view.notice, '');
  assert.equal(view.rows.length, 8);
  const nav = view.rows[7];
  assert.equal(nav.label, 'NAV / SENSORS');
  assert.equal(nav.bar, '[        ]');
  assert.equal(nav.loadText, '--');
  assert.equal(nav.stateText, 'OFFLINE');
  assert.equal(nav.warn, false, 'OFFLINE carries no ⚠ (VS-M8)');
  assert.equal(nav.fault, '—', 'an absent instrument is not a fault and has no day');
  const ls = view.rows[1];
  assert.equal(ls.stateText, 'DEGRADED');
  assert.equal(ls.warn, true);
  assert.equal(ls.bar, '[██████▒▒]');
  const hull = view.rows[6];
  assert.equal(hull.fault, '—', 'no breach event is ever published, so this is legitimately blank');
  // the advisory under the rule belongs to the SELECTED row
  assert.equal(view.advisory, SYSTEMS[0].rows[0][6]);
  assert.equal(ledgerView(keyPress(linked(), 'ArrowDown').model).advisory, SYSTEMS[0].rows[1][6]);
  assert.equal(view.rows[0].selected, true);
  assert.equal(view.rows[1].selected, false);
});

test('headerLines / footerHints: VS-M6 and per-screen VS-M7 hints', () => {
  const m = linked();
  const h = headerLines(m);
  assert.equal(h.length, 2);
  assert.equal(h[0], 'MOSS ▮ MODULAR OPERATIONS & SYSTEMS SUPERVISOR — REV 4.2.1');
  assert.equal(h[1], 'PERILUNE HULL 7741 · DAY 213 · UPTIME 5112:07:44');
  assert.ok(footerHints(m).join(' · ').indexOf('[ESC] BACK TO SHIP') > 0);
  assert.ok(footerHints(keyPress(m, 'Enter').model).join(' · ').indexOf('[ESC] BACK TO LEDGER') > 0);
  assert.deepEqual(footerHints(keyPress(m, 'l').model), ['[L] CLOSE LOG', '[ESC] BACK']);
  assert.deepEqual(footerHints(keyPress(m, 'p').model), ['[ESC] BACK']);
});

test('the view-models never hand out the model\'s own arrays to mutate', () => {
  const m = reduceMossEvent(submitCommand(linked(), 'open life_support').model, MOSS[0]);
  detailView(m).notes.push('INJECTED');
  detailView(m).devices.push({});
  consoleLines(m).push({ stream: 1, text: 'INJECTED' });
  ledgerView(m).rows.push({});
  assert.equal(detailView(m).notes.indexOf('INJECTED'), -1);
  assert.equal(detailView(m).devices.length, 4);
  assert.equal(ledgerView(m).rows.length, 8);
  assert.equal(consoleLines(m).filter((l) => l.text === 'INJECTED').length, 0);
  assert.equal(detailView(m).notes[1], FAULT_CAVEAT, 'the shared caveat constant is intact');
});

// ---------------- immutability ----------------

test('reducers never mutate their argument (every input deep-frozen)', () => {
  const fresh = deepFreeze(openMoss());
  const a = deepFreeze(reduceSystems(fresh, SYSTEMS[0]));
  const b = deepFreeze(reduceSystems(a, SYSTEMS[1]));
  const c = deepFreeze(reduceChron(deepFreeze(reduceLog(b, LOG)), CHRON));
  const d = deepFreeze(editPrompt(c, 'open life support'));
  const e = deepFreeze(keyPress(d, 'Enter').model);
  const f = deepFreeze(reduceMossEvent(e, MOSS[0]));
  const g = deepFreeze(keyPress(f, 'l').model);
  const h = deepFreeze(keyPress(g, 'Escape').model);
  const i = deepFreeze(submitCommand(h, 'status').model);
  const j = deepFreeze(keyPress(deepFreeze(editPrompt(i, 'q')), 'ArrowUp').model);
  deepFreeze(keyPress(j, 'Escape').model);
  deepFreeze(reduceMossEvent(i, { ev: 'exec', lines: [[1, 'ok']] }));
  // and the originals are untouched
  assert.equal(a.rows.length, 8);
  assert.equal(b.rows.length, 7);
  assert.equal(fresh.linked, false);
  assert.equal(fresh.console.length, 1);
});

test('a fresh model is genuinely fresh (openMoss shares nothing between calls)', () => {
  const a = openMoss(), b = openMoss();
  assert.notEqual(a.console, b.console);
  assert.notEqual(a.rows, b.rows);
  assert.notEqual(a.history, b.history);
  assert.deepEqual(a.stack, []);
  assert.equal(a.screen, SCREEN.LEDGER);
  assert.equal(a.prompt, '');
});

// ---------------- M-PURITY (source scan) ----------------

// Read the module's RAW text and look for anything that would make two identical runs differ, or
// that would drag the DOM into a module the node tests are supposed to be able to run headless.
const BANNED = [
  ['DOM handle', /\bdocument\b/],
  ['global frame', /\bwindow\b/],
  ['network', /\bfetch\s*\(/],
  ['network', /\bWebSocket\b/],
  ['storage', /\blocalStorage\b/],
  ['wall clock', /\bDate\s*\.\s*now\b/],
  ['wall clock', /\bnew\s+Date\b/],
  ['wall clock', /\bperformance\s*\.\s*now\b/],
  ['RNG', /\bMath\s*\.\s*random\b/],
  ['locale API', /toLocale[A-Za-z]*\s*\(/],
  ['locale API', /\bIntl\b/],
  // Defence in depth: `Math['random']()` and friends read past a name-based scan. Every
  // OBSERVABLE indirection is already caught by the determinism test below — this closes the
  // window where an unobservable one is introduced and then made observable later.
  ['bracket indirection', /\[\s*['"](random|document|now|fetch|localStorage|WebSocket)['"]\s*\]/],
];

function scan(source) {
  const hits = [];
  for (const [what, re] of BANNED) if (re.test(source)) hits.push(what + ' ' + re);
  return hits;
}

test('M-PURITY: the scanner itself can fail (it is not a decorative regex list)', () => {
  const violations = [
    'const el = document.getElementById("x");',
    'window.addEventListener("keydown", f);',
    'await fetch("/systems");',
    'new WebSocket("ws://host");',
    'localStorage.setItem("k", "v");',
    'const t = Date.now();',
    'const d = new Date();',
    'const p = performance.now();',
    'const r = Math.random();',
    'label.toLocaleUpperCase();',
    'new Intl.NumberFormat().format(1);',
    'const r = Math["random"]();',
    "const t = Date['now']();",
    'globalThis[ "document" ].title = "x";',
  ];
  for (const v of violations) assert.ok(scan(v).length > 0, 'should have been caught: ' + v);
  assert.deepEqual(scan('const x = Math.round(1.4) + Math.max(0, 1);'), [],
    'ordinary arithmetic must not trip the scan');
});

test('M-PURITY: moss-model.js (and the module it imports) contain no impure API', () => {
  for (const f of ['../src/ui/moss-model.js', '../src/ui/terminal-model.js']) {
    const src = readFileSync(join(here, f), 'utf8');
    assert.deepEqual(scan(src), [], f + ' must stay pure');
  }
});

test('M-PURITY: moss-model.js imports only from the pure allowlist', () => {
  const src = readFileSync(join(here, '../src/ui/moss-model.js'), 'utf8');
  const allowed = ['./terminal-model.js'];
  const specs = [...src.matchAll(/^import[^;]*?from\s*'([^']+)'/gm)].map((mt) => mt[1]);
  assert.ok(specs.length > 0, 'the regex must actually be finding the import lines');
  for (const s of specs) assert.ok(allowed.indexOf(s) >= 0, 'unexpected import: ' + s);
});

test('M-PURITY: the model is deterministic — the same inputs give the same outputs', () => {
  const run = () => {
    let m = openMoss();
    for (const msg of SYSTEMS) m = reduceSystems(m, msg);
    m = reduceChron(reduceLog(m, LOG), CHRON);
    m = submitCommand(m, 'open thermal').model;
    m = reduceMossEvent(m, { ev: 'sys', tid: 'thermal', devices: [['rad_a', 'Radiator', 77, 1, 100, 0, 3, 9, '']] });
    return { ledger: ledgerView(m), detail: detailView(m), header: headerLines(m), console: consoleLines(m) };
  };
  assert.deepEqual(run(), run());
});
