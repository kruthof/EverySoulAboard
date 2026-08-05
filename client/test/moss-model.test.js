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
  podRow, reducePods, podBayView, thawPod, selectPod, POD_STATE, NO_PODS,
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

test('loadBar: filled/stipple run at the fixed cell width', () => {
  // VR-P6 (the paper retint) widened the DEFAULT 8 → 10 so the engraved gauge draws the design's
  // ten cells. The explicit-width legs below are unchanged on purpose: `loadBar` is parameterised
  // and its arithmetic is what they pin, so they keep biting whatever the default becomes.
  assert.equal(BAR_WIDTH, 10);
  assert.equal(loadBar(0, 10), '[▒▒▒▒▒▒▒▒▒▒]');
  assert.equal(loadBar(50, 10), '[█████▒▒▒▒▒]');
  assert.equal(loadBar(100, 10), '[██████████]');
  assert.equal(loadBar(0, 8), '[▒▒▒▒▒▒▒▒]');
  assert.equal(loadBar(50, 8), '[████▒▒▒▒]');
  assert.equal(loadBar(100, 8), '[████████]');
  assert.equal(loadBar(61, 8), '[█████▒▒▒]');   // 4.88 cells → 5
  assert.equal(loadBar(12, 8), '[█▒▒▒▒▒▒▒]');   // 0.96 cells → 1
  assert.equal(loadBar(50), '[█████▒▒▒▒▒]', 'width defaults to BAR_WIDTH, which VR-P6 made 10');
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
  ['PageUp',     'nav',    'nav'],
  ['PageDown',   'nav',    'nav'],
  ['Home',       'nav',    'pass'],
  ['End',        'nav',    'pass'],
  ['Tab',        'pass',   'pass'],
  // OD-P (2026-07-31): NO printable character is routed, in EITHER buffer state. `l` and `p` used
  // to read ['nav','pass'] — they are ordinary letters now, exactly like `a`, `1` and space.
  ['l',          'pass',   'pass'],
  ['L',          'pass',   'pass'],
  ['p',          'pass',   'pass'],
  ['P',          'pass',   'pass'],
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

test('doors: KEY_ROUTE contains NO printable character — the whole class, not just L and P', () => {
  // ⚠️ WRITTEN OVER THE CLASS ON PURPOSE. A test naming only `l` and `p` would pass the day someone
  // adds `s` for STATUS or `h` for HELP, which is the same defect the owner ruled on: *"we need to
  // expand the MOSS OS and part might be 'ls' command later, to read directories.. but as soon as
  // we press l, the log opens."* Every key in this table must be a key a TERMINAL also owns, i.e.
  // one that types nothing. `Array.from` counts CODE POINTS, so an emoji or an accented letter is
  // caught as the single character it is.
  const printable = Object.keys(KEY_ROUTE).filter((k) => Array.from(k).length === 1);
  assert.deepEqual(printable, [],
    'a single-character key is routed by IX-M8, so pressing it does not type it: ' + printable.join(' '));

  // NON-VACUITY (trap 4's shape): the filter must actually be able to SEE such a key, or the
  // assertion above is satisfied by a predicate that matches nothing at all.
  const withLetter = { ...KEY_ROUTE, l: ['nav', 'pass'] };
  assert.deepEqual(Object.keys(withLetter).filter((k) => Array.from(k).length === 1), ['l'],
    'the filter cannot see a single-letter row, so the emptiness above proves nothing');
  // ...and the rows that DO remain are the non-printable ones, so the table is not simply empty.
  assert.ok(Object.keys(KEY_ROUTE).length >= 8, 'the navigation rows are still there');
});

test('doors: every printable ASCII routes `pass` THROUGH routeKey, in both buffer states', () => {
  // The guard above reads the TABLE. This one reads the FUNCTION, and they are not the same claim:
  // `routeKey` has branches of its own (the modifier check, the PROGRAM branch, the off-LEDGER
  // branch, the buffer-state pick), so a character special-cased inside it — `if (k === 's') return
  // 'nav'` — would satisfy an empty KEY_ROUTE and still steal the keystroke. A table-only guard
  // cannot see that; this sweeps the whole printable range against the real router.
  const empty = linked();
  const typed = editPrompt(empty, 'op');
  const detail = keyPress(empty, 'Enter').model;
  const faultlog = submitCommand(empty, 'log').model;
  const program = submitCommand(empty, 'prog').model;
  const screens = [['LEDGER empty', empty], ['LEDGER typed', typed], ['DETAIL', detail],
    ['FAULTLOG', faultlog], ['PROGRAM', program]];

  const offenders = [];
  for (let code = 0x20; code <= 0x7e; code++) {
    const ch = String.fromCharCode(code);
    for (const [label, model] of screens) {
      if (routeKey(model, ch) !== 'pass') offenders.push(label + ' ' + JSON.stringify(ch));
    }
  }
  assert.deepEqual(offenders, [],
    'a printable character is intercepted instead of typed — OD-P: ' + offenders.join(', '));

  // NON-VACUITY: the sweep must be able to REPORT an interception, or the emptiness is a tautology
  // over a loop that never evaluates its predicate. `Enter` is routed on every screen but PROGRAM,
  // and it is the same call shape — so if this finds nothing, the loop above proves nothing.
  const control = screens.filter(([, m]) => routeKey(m, 'Enter') !== 'pass').map(([l]) => l);
  assert.deepEqual(control, ['LEDGER empty', 'LEDGER typed', 'DETAIL', 'FAULTLOG'],
    'the sweep cannot see a routed key at all');
});

test('IX-M8: a modifier hands the key back to the browser (Ctrl-Home is not ours)', () => {
  // The keys probed here must be ones the table DOES route, or "a modifier makes it pass" is
  // satisfied by a key that passes anyway — since OD-P `l` is exactly such a key, so it is no
  // longer usable as this test's subject.
  const m = linked();
  for (const mods of [{ ctrl: true }, { ctrlKey: true }, { alt: true }, { meta: true }]) {
    assert.equal(routeKey(m, 'Home', mods), 'pass');
    assert.equal(routeKey(m, 'Enter', mods), 'pass');
  }
  assert.equal(routeKey(m, 'Home', {}), 'nav', 'control: unmodified, that key IS routed');
  assert.equal(routeKey(m, 'Home', { shift: true }), 'nav', 'Shift alone does not change routing');
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
});

test('doors: `l` and `p` on an EMPTY buffer are TYPED — they open nothing', () => {
  // The owner's own words: *"as soon as we press l, the log opens"* — the defect. MOSS is the ship's
  // OS, so a printable character always belongs to the command line. Both halves are asserted: the
  // model declines the key (so the DOM lets the browser type it) AND no screen moved.
  const m = linked();
  for (const key of ['l', 'L', 'p', 'P']) {
    const r = keyPress(m, key);
    assert.equal(r.route, 'pass', key + ' must route to nobody, so the character reaches the prompt');
    assert.equal(r.handled, false, key + ' must be DECLINED — `handled` is what stops the browser');
    assert.equal(r.model, m, key + ' must leave the model untouched (same object, not just equal)');
    assert.deepEqual(r.effects, [], key + ' must not fetch anything');
    assert.equal(r.model.screen, SCREEN.LEDGER, key + ' opened a screen');
  }
  // …and the character genuinely lands in the buffer (the DOM's `input` event → editPrompt).
  const typed = editPrompt(editPrompt(m, 'l'), 'lo');
  assert.equal(typed.prompt, 'lo', 'the letters accumulate in the command line');
  assert.equal(typed.screen, SCREEN.LEDGER);
});

test('doors: `log` and `prog` are the typed replacements, end to end from the prompt', () => {
  // The acceptance is deliberately driven through the PROMPT — editPrompt then Enter — and not by
  // calling submitCommand directly: the routing table is what OD-P changed, so a test that skipped
  // it would still pass with Enter mis-routed.
  const m = linked();
  const run = (model, line) => keyPress(editPrompt(model, line), 'Enter');

  const log = run(m, 'log');
  assert.equal(log.route, 'prompt', 'ENTER on a typed buffer submits');
  assert.equal(log.model.screen, SCREEN.FAULTLOG, '`log` opens the FAULT LOG');
  assert.equal(log.model.filterId, null, 'from the LEDGER it opens unfiltered (null, not "")');
  assert.deepEqual(log.effects, [{ k: 'chron' }], 'and asks the host for the chronicle (IX-M5)');
  assert.equal(log.model.prompt, '', 'the buffer is spent');
  assert.ok(consoleLines(log.model).some((l) => l.text === '> log'), 'the line is echoed');

  const prog = run(m, 'prog');
  assert.equal(prog.model.screen, SCREEN.PROGRAM, '`prog` opens PROGRAM (IX-M6)');
  // `prog <terminal>` goes straight into one terminal's source and asks the host for it
  const one = run(m, 'prog term_moss');
  assert.equal(one.model.program.tid, 'term_moss');
  assert.deepEqual(one.effects, [{ k: 'moss', op: 'open', tid: 'term_moss' }]);

  // `log <system>` filters, and an unknown system is refused rather than opening an empty log
  const filtered = run(m, 'log thermal');
  assert.equal(filtered.model.filterId, 'thermal');
  const bad = run(m, 'log nowhere');
  assert.equal(bad.model.screen, SCREEN.LEDGER, 'an unknown system must not open the log');
  assert.ok(consoleLines(bad.model).some((l) => l.stream === 2 && l.text.indexOf('UNKNOWN SYSTEM') === 0));
});

test('doors: a bare `log` typed on DETAIL inherits that system — the whole of what `L` did', () => {
  // `L` from DETAIL opened the log FILTERED to that system (IX-M5). If the typed command dropped
  // the filter, the replacement would be strictly weaker than the key it replaced and the FILTERED
  // log would be reachable only by naming the system a second time.
  const detail = keyPress(linked(), 'Enter').model;              // DETAIL(reactor)
  assert.equal(detail.screen, SCREEN.DETAIL);
  const log = keyPress(editPrompt(detail, 'log'), 'Enter');
  assert.equal(log.route, 'prompt',
    'ENTER on DETAIL with a typed buffer must SUBMIT. The prompt renders on this screen and OD-P '
    + 'makes letters land in it, so routing ENTER to `nav` here drops the line silently.');
  assert.equal(log.model.screen, SCREEN.FAULTLOG);
  assert.equal(log.model.filterId, 'reactor', 'the bare command inherited DETAIL\'s subject');
  // an explicit argument still overrides the inheritance
  assert.equal(keyPress(editPrompt(detail, 'log thermal'), 'Enter').model.filterId, 'thermal');
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

test('IX-M8: off the LEDGER the screen keeps its keys — ENTER is the ONE the buffer can claim', () => {
  const m = editPrompt(linked(), 'op');
  const detail = keyPress(editPrompt(m, ''), 'Enter').model;   // descend with an empty buffer
  const stale = { ...detail, prompt: 'op' };
  assert.equal(routeKey(stale, 'Escape'), 'nav', 'ESC still pops the stack on DETAIL');
  assert.equal(routeKey(stale, 'ArrowUp'), 'nav', 'and a stale buffer does not turn ↑ into history');
  assert.equal(routeKey(stale, 'l'), 'pass', 'OD-P: L is a letter on every screen');
  // …but ENTER goes to the prompt once there is a line to submit, and ONLY then (OD-P): without it
  // a command typed on DETAIL — the only way left to reach the filtered fault log — is unsendable.
  assert.equal(routeKey(stale, 'Enter'), 'prompt');
  assert.equal(routeKey(detail, 'Enter'), 'nav', 'with an EMPTY buffer ENTER is still the screen\'s');
  // on PROGRAM the IDE owns its own text area: only ESC is taken, buffer or no buffer
  const prog = submitCommand(linked(), 'prog').model;
  assert.equal(routeKey(prog, 'Escape'), 'nav');
  assert.equal(routeKey(prog, 'l'), 'pass');
  assert.equal(routeKey(prog, 'ArrowUp'), 'pass');
  assert.equal(routeKey({ ...prog, prompt: 'op' }, 'Enter'), 'pass',
    'the IDE owns ENTER — a newline in the source is not a submitted command');
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
  m = submitCommand(m, 'log').model;                    // → FAULTLOG (filtered from DETAIL)
  assert.equal(m.screen, SCREEN.FAULTLOG);
  assert.equal(m.filterId, 'reactor', 'IX-M5: from DETAIL the log opens filtered');
  m = submitCommand(m, 'prog').model;                   // → PROGRAM
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

test('IX-M5: ESC closes the fault log, returning where it came from — a command is not a toggle', () => {
  // `L` used to toggle. OD-P deleted it, and `log` deliberately does NOT inherit the toggle: typing
  // a command twice re-runs it. ESC is the close verb, and it was always the one that worked from
  // both entry points.
  const fromLedger = submitCommand(linked(), 'log').model;
  assert.equal(keyPress(fromLedger, 'Escape').model.screen, SCREEN.LEDGER);
  const detail = keyPress(linked(), 'Enter').model;
  const fromDetail = submitCommand(detail, 'log').model;
  assert.equal(keyPress(fromDetail, 'Escape').model.screen, SCREEN.DETAIL);
  // …and `log` typed AGAIN on the open log re-opens it in place, keeping the ladder one rung deep
  const twice = submitCommand(fromDetail, 'log').model;
  assert.equal(twice.screen, SCREEN.FAULTLOG, 'still open — the command is not a toggle');
  assert.equal(twice.filterId, 'reactor', 'and it still inherits the DETAIL below it');
  assert.equal(twice.stack.length, fromDetail.stack.length, 'without deepening the ESC ladder');
});

test('the ESC stack cannot grow without bound when a screen is re-entered', () => {
  // typing `prog` again while PROGRAM is up re-enters in place rather than stacking a rung
  let m = submitCommand(linked(), 'prog').model;
  for (let i = 0; i < 5; i++) m = submitCommand(m, 'prog').model;
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

test('the live-ledger re-resolve is scoped to `open` — a device WRITE is never navigation', () => {
  // Without the verb guard, `close reactor` would open the REACTOR detail screen instead of
  // forwarding a write: the player would watch a page turn where they asked for a door to shut.
  const m = linked();
  for (const verb of ['close', 'lock', 'unlock']) {
    const out = submitCommand(m, verb + ' reactor');
    assert.equal(out.model.screen, SCREEN.LEDGER, verb + ' must not navigate');
    assert.equal(out.model.detail, null, verb + ' must not open a detail');
    assert.deepEqual(out.effects, [{ k: 'moss', op: 'exec', text: verb + ' reactor' }], verb);
  }
  // `set` aimed at a row name likewise stays a write, for the host to accept or reject
  assert.deepEqual(submitCommand(m, 'set reactor.rate max').effects,
    [{ k: 'moss', op: 'exec', text: 'set reactor.rate max' }]);
  // …while `open` on that very same name navigates
  assert.equal(submitCommand(m, 'open reactor').model.screen, SCREEN.DETAIL);
});

test('exec: a malformed line tuple degrades toward showing the host\'s words', () => {
  const base = linked();
  const tail = (msg) => consoleLines(reduceMossEvent(base, msg)).pop();
  const count = (msg) => consoleLines(reduceMossEvent(base, msg)).length - consoleLines(base).length;
  // a one-element tuple is TEXT at stream 1 — rendering an empty line here would be the worst of
  // both: a blank row that says nothing AND hides what the host actually said
  assert.deepEqual(tail({ ev: 'exec', lines: [['door_storage: CLOSED']] }),
    { stream: 1, text: 'door_storage: CLOSED' });
  // a missing stream byte defaults to OUTPUT, never to 0 (which is dropped as the duplicate echo)
  assert.deepEqual(tail({ ev: 'exec', lines: [[null, 'still here']] }), { stream: 1, text: 'still here' });
  assert.equal(count({ ev: 'exec', lines: [[null, 'still here']] }), 1, 'and it is not swallowed');
  // a bare string line, and an explicit error stream, are unchanged
  assert.deepEqual(tail({ ev: 'exec', lines: ['bare'] }), { stream: 1, text: 'bare' });
  assert.deepEqual(tail({ ev: 'exec', lines: [[2, 'nope']] }), { stream: 2, text: 'nope' });
  // a null entry is not a line — but a failed reply made only of them still reports the failure
  assert.equal(count({ ev: 'exec', ok: true, lines: [null] }), 0);
  assert.deepEqual(tail({ ev: 'exec', ok: false, lines: [null] }), { stream: 2, text: 'COMMAND FAILED' });
  assert.equal(count({ ev: 'exec', ok: false, lines: [null] }), 1, 'exactly one line, not two');
  // a zero-length tuple has no words to show
  assert.equal(count({ ev: 'exec', ok: true, lines: [[]] }), 0);
  assert.deepEqual(tail({ ev: 'exec', ok: false, lines: [[]] }), { stream: 2, text: 'COMMAND FAILED' });
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

test('the fault caveat describes THIS client\'s filter and claims nothing about host code', () => {
  // F1's shape at smaller scale, guarded: an unversioned second copy of a fact about code this
  // module cannot see goes silently false the day that code changes. "repairs publish no event"
  // used to sit in this constant — it is MachineWearSystem's fact, and it now travels in the
  // host's own `derivation`, where there is one copy of it.
  const c = FAULT_CAVEAT.toLowerCase();
  assert.ok(c.indexOf('this client') >= 0, 'it must say WHOSE join it describes');
  assert.ok(c.indexOf('fault log') >= 0, 'and WHICH join — not the ledger\'s host-derived LAST FAULT');
  for (const hostClaim of ['repair', 'publish', 'maintenance', 'alarm', 'wearperhour']) {
    assert.equal(c.indexOf(hostClaim), -1, 'no claim about host code: ' + hostClaim);
  }
  // and the claim it DOES make is the one faultTokens implements — a name match on the line's
  // text, loose enough to over-catch (pinned in 'the fault log filter is the documented weak
  // NAME join' above, which is the behavioural half of this pin).
  assert.ok(c.indexOf('name match') >= 0);
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

// ⛔ THE FIXTURE'S TWO HALVES ARE THE SAME RING, BECAUSE THE SHIP'S ARE. `chron` is
// `Chronicle.Render` over the whole 200-entry `HistorySystem` ring — day-grouped, each line
// `"[Kind] " + entry.Text` — and `log` is `GameSession.BuildLog`'s tail of THAT SAME ring, the
// newest 14 as `"D<day>.<frac> " + entry.Text`. Both shapes were read off a running `--ship wreck`
// host on 2026-08-03 before this fixture was written.
//
// ⚠️ THE FIXTURE THIS REPLACED WAS DISJOINT — `log` lived on day 213 and `chron` on days 190/211,
// no entry in both — so it could not see the shipped defect (the newest 14 printed TWICE) even
// though the code under it was the code that printed them. A fault-log fixture whose tail is not a
// suffix of its chronicle is testing a ship that does not exist.
const CHRON = {
  type: 'chron',
  days: [
    { day: 190, headline: 'Day 190 — REACTOR SCRAM DRILL COMPLETED',
      lines: ['[Note] REACTOR SCRAM DRILL COMPLETED'] },
    { day: 211, headline: 'Day 211 — TANK_HYDRO RAN DRY',
      lines: ['[Alarm] TANK_HYDRO RAN DRY', '[Note] GALLEY MEAL SKIPPED', '[Note] THE TANKS ARE QUIET'] },
    { day: 213, headline: 'Day 213 — BROWNOUT ON THE REACTOR BUS',
      lines: ['[Power] BROWNOUT ON THE REACTOR BUS', '[Alarm] SCRUBBER_AFT WORN'] },
  ],
};
// The newest two entries of the same ring, in the sensor tail's costume.
const LOG = { type: 'log', lines: ['D213.10 BROWNOUT ON THE REACTOR BUS', 'D213.44 SCRUBBER_AFT WORN'] };

/** The FACT a rendered row is about: the ring entry's own text, out of whichever costume. */
const factOf = (t) => t.replace(/^\[[A-Za-z]+\] /, '');

test('⭐ the fault log lists each fault ONCE — chron + log are one ring, not two records', () => {
  let m = reduceChron(reduceLog(linked(), LOG), CHRON);
  m = submitCommand(m, 'log').model;
  const view = faultLogView(m);
  assert.equal(view.title, 'FAULT LOG');
  assert.equal(view.filterId, null);
  // Newest first, the chronicle's own lines, and NOTHING repeated from the live tail.
  assert.deepEqual(view.entries.map((e) => e.text), [
    '[Alarm] SCRUBBER_AFT WORN',
    '[Power] BROWNOUT ON THE REACTOR BUS',
    '[Note] THE TANKS ARE QUIET',
    '[Note] GALLEY MEAL SKIPPED',
    '[Alarm] TANK_HYDRO RAN DRY',
    '[Note] REACTOR SCRAM DRILL COMPLETED',
  ]);
  assert.deepEqual(view.entries.map((e) => e.day), [213, 213, 211, 211, 211, 190]);
  assert.deepEqual(view.entries.map((e) => e.live), [false, false, false, false, false, false]);

  // THE OUTCOME, stated as the player's sentence: no fault is listed twice. This is the leg that
  // the shipped concatenation fails — it printed SCRUBBER_AFT WORN and BROWNOUT ON THE REACTOR BUS
  // a second time, bare, above the tagged copies.
  const facts = view.entries.map((e) => factOf(e.text));
  assert.equal(new Set(facts).size, facts.length, 'a fault appears twice: ' + facts.join(' | '));
  // …and not by hiding anything: the two the live tail also carries are present, once each.
  for (const t of ['BROWNOUT ON THE REACTOR BUS', 'SCRUBBER_AFT WORN'])
    assert.equal(facts.filter((f) => f === t).length, 1, t + ' must be listed exactly once');
  // Non-vacuity: the tail really does overlap the chronicle in this fixture (a disjoint one would
  // satisfy every assertion above while the defect stood).
  const tail = LOG.lines.map((l) => l.replace(/^D\d+\.\d+\s+/, ''));
  for (const t of tail) assert.ok(facts.includes(t), 'the fixture tail must overlap the chronicle: ' + t);
  assert.equal(view.entries.length, 6, 'six ring entries, six rows');
});

test('the day HEADLINE is not a second row — it is the day\'s own worst line, re-stamped', () => {
  const m = submitCommand(reduceChron(reduceLog(linked(), LOG), CHRON), 'log').model;
  const view = faultLogView(m);
  for (const d of CHRON.days) {
    assert.ok(!view.entries.some((e) => e.text === d.headline), 'headline leaked as a row: ' + d.headline);
    // the fact it names is still in the list — through its tagged line, exactly once
    const fact = d.headline.replace(/^Day \d+ — /, '');
    assert.equal(view.entries.filter((e) => factOf(e.text) === fact).length, 1,
      'the day\'s worst fault must be listed exactly once: ' + fact);
  }
});

test('before the chronicle lands the live tail IS the log — never an empty pane over a faulted ship', () => {
  // IX-M4 honesty: `openFaultLog` REQUESTS `chron`; until the reply arrives a chronicle-only list
  // would say NO ATTRIBUTABLE FAULTS ON RECORD while the ring holds fourteen of them.
  const m = submitCommand(reduceLog(linked(), LOG), 'log').model;
  assert.deepEqual(m.chron, [], 'the fixture for this leg has no chronicle yet');
  const view = faultLogView(m);
  assert.deepEqual(view.entries.map((e) => e.text), ['SCRUBBER_AFT WORN', 'BROWNOUT ON THE REACTOR BUS']);
  assert.deepEqual(view.entries.map((e) => e.day), [213, 213], 'the D-token became the day stamp');
  assert.deepEqual(view.entries.map((e) => e.live), [true, true]);
});

test('a live brownout episode whose text has moved on is still ONE row (this is not a text dedupe)', () => {
  // ⭐ WHY THE FIX IS "ONE SOURCE" AND NOT "MATCH THE TWO COSTUMES BY TEXT". `HistorySystem`
  // rewrites a brownout EPISODE entry IN PLACE as its edges accumulate
  // (`BrownoutEpisodeLine`), so a `log` tail sampled after a `chron` snapshot legitimately
  // disagrees with it word for word. MEASURED on a running `--ship wreck` host, 2026-08-03: the
  // tail said "344 changes in this episode" where the chronicle still said "144".
  const line = (n) => 'Power network 1 browned out — non-critical loads shed; ' + n +
    ' changes in this episode, still shedding.';
  const ch = { type: 'chron', days: [{ day: 0, headline: 'Day 0 — ' + line(144), lines: ['[Power] ' + line(144)] }] };
  const lg = { type: 'log', lines: ['D0.53 ' + line(344)] };
  const view = faultLogView(submitCommand(reduceChron(reduceLog(linked(), lg), ch), 'log').model);
  assert.equal(view.entries.length, 1, 'one episode, one row — a text join would have printed two');
  // The chronicle is the record, so its snapshot of the sentence is what shows. That staleness is
  // the documented cost of dropping the tail; the alternative was printing the episode twice.
  assert.equal(view.entries[0].text, '[Power] ' + line(144));
});

test('the fault log filter is the documented weak NAME join (§5.1)', () => {
  let m = reduceChron(reduceLog(linked(), LOG), CHRON);
  m = submitCommand(keyPress(m, 'Enter').model, 'log').model;   // DETAIL(reactor) → filtered log
  const view = faultLogView(m);
  assert.equal(view.filterId, 'reactor');
  assert.equal(view.title, 'FAULT LOG — REACTOR');
  assert.deepEqual(view.entries.map((e) => e.text),
    ['[Power] BROWNOUT ON THE REACTOR BUS', '[Note] REACTOR SCRAM DRILL COMPLETED']);
  // once DETAIL is fetched, member device NAMES widen the join
  const water = submitCommand(submitCommand(reduceChron(reduceLog(linked(), LOG), CHRON), 'open water reclaim').model, 'log').model;
  assert.deepEqual(faultLogView(water).entries.map((e) => e.text), [],
    'nothing mentions "water" or "reclaim" — the honest answer is nothing');
  const named = reduceMossEvent(
    { ...water, screen: SCREEN.DETAIL, detail: { tid: 'water_reclaim', devices: [], loading: true } },
    { ev: 'sys', tid: 'water_reclaim', devices: [['tank_hydro', 'WaterTank', 20, 1, 0, 0, 4, 4, '']] });
  const filtered = { ...named, screen: SCREEN.FAULTLOG, filterId: 'water_reclaim' };
  // The join is a loose SUBSTRING match on purpose: on a diagnostic screen, catching an extra
  // line ('THE TANKS ARE QUIET', off the device `tank_hydro`) is a far cheaper mistake than hiding
  // a real fault. §5.1 says out loud that this is a string join, and this is what that costs.
  assert.deepEqual(faultLogView(filtered).entries.map((e) => e.text),
    ['[Note] THE TANKS ARE QUIET', '[Alarm] TANK_HYDRO RAN DRY']);
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
  assert.equal(nav.bar, '[          ]', 'BAR_WIDTH cells of space — VR-P6 made that ten');
  assert.equal(nav.loadText, '--');
  assert.equal(nav.stateText, 'OFFLINE');
  assert.equal(nav.warn, false, 'OFFLINE carries no attention mark (VS-M8)');
  assert.equal(nav.fault, '—', 'an absent instrument is not a fault and has no day');
  const ls = view.rows[1];
  assert.equal(ls.stateText, 'DEGRADED');
  assert.equal(ls.warn, true);
  assert.equal(ls.bar, '[███████▒▒▒]', 'the same 71% load, over VR-P6\'s ten cells');
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
  // OD-P: no fragment may name a letter key; the two screens are signposted by the words to TYPE.
  assert.deepEqual(footerHints(submitCommand(m, 'log').model), ['TYPE: LOG <SYSTEM>, HELP', '[ESC] BACK']);
  assert.deepEqual(footerHints(submitCommand(m, 'prog').model), ['[ESC] BACK']);
  for (const screen of [m, keyPress(m, 'Enter').model, submitCommand(m, 'log').model, submitCommand(m, 'prog').model]) {
    for (const hint of footerHints(screen)) {
      assert.ok(!/^\[[A-Za-z]\]/.test(hint), 'a single-LETTER key hint survived OD-P: ' + hint);
    }
  }
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
  const g = deepFreeze(submitCommand(f, 'log').model);
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

// ═══════════════════════════════════════════════ M3-4 — THE POD BAY (the fifth screen)
//
// The bay is the one screen the COMMAND does not open: `pods` sends an ask, and the REPLY takes the
// screen, because the ask is commission-gated and can come back as a refusal instead. Every test
// below drives that handshake rather than setting `screen` by hand.

/**
 * A bay as the host serialises it: twelve capsules cut down to the four shapes that matter.
 *
 * ⚠️ **`pod_ozawa`'s OCCUPANT IS DELIBERATELY NOT ITS KEY'S STEM, AND IT MAY NOT BE "TIDIED".**
 * The one capsule these tests thaw is `pod_ozawa` / `Ozawa-Reyes`, so `'pod_' + lower(occupant)`
 * is `pod_ozawa-reyes` — a DIFFERENT string from the key. With a round-tripping fixture
 * (`pod_ozawa` / `Ozawa`) the forbidden derivation is byte-identical to reading `row.pod`, and
 * every assertion below stays green while the client composes the capsule key out of a display
 * name. Measured: that mutation left this file 83/83 green. The `pod_` convention is AUTHORING's
 * (`AuthoredShips.cs:1963`) and the sim owns its inverse (`CryoSystem.SleeperName`); a real ship
 * is free to name a capsule and its sleeper differently, and this fixture is that ship.
 * Guarded below by `the fixture can SEE the forbidden derivation`.
 */
const PODS_MSG = {
  type: 'moss', ev: 'pods', tid: '@console', term: 'term_moss', moss: 'COMMISSIONED',
  note: 'HEADROOM FOR 2 CREW (1 AWAKE + 1) — FOOD 60 U … CARRIED AND RESERVED INCLUDED, NOT THE LOOSE STOCK',
  rows: [
    [1, 'pod_rell', 'Rell', 0, 'OPEN', 2, 'POD IS EMPTY — ALREADY THAWED', 0],
    [2, 'pod_ozawa', 'Ozawa-Reyes', 1, 'SEALED', 0, 'READY — 2 SEALS', 1],
    [3, 'pod_vance', 'Vance', 2, 'NO SIGNAL', 3, 'POD — NO SIGNAL', 0],
    [7, 'pod_torres', 'Torres', 1, 'SEALED', 6, 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0', 0],
    [9, 'pod_lindqvist', 'Lindqvist', 3, 'CYCLING', 5, 'POD LINDQVIST IS CYCLING — 4 min', 0],
  ],
};

/** Ask for the bay, then answer — the whole handshake, as the screen performs it. */
function withBay(msg) {
  const asked = submitCommand(openMoss(), 'pods');
  return { model: reduceMossEvent(asked.model, msg || PODS_MSG), effects: asked.effects };
}

test('M3-4: `pods` ASKS and does not navigate — the reply is what opens the bay', () => {
  const asked = submitCommand(openMoss(), 'pods');
  assert.deepEqual(asked.effects, [{ k: 'moss', op: 'pods' }],
    'the command must send the wire op');
  assert.equal(asked.model.screen, SCREEN.LEDGER,
    'THE BAY IS COMMISSION-GATED: a screen opened by the COMMAND would sit empty beside the ' +
    'refusal that explains why it is empty, which is the M3-13 defect this package is warned about');

  const answered = reduceMossEvent(asked.model, PODS_MSG);
  assert.equal(answered.screen, SCREEN.PODBAY, 'the reply takes the screen');
  assert.deepEqual(answered.stack, [SCREEN.LEDGER], 'and ESC goes back where the player came from');
});

test('M3-4: an UNSOLICITED bay updates the data and never yanks the screen', () => {
  const m = reduceMossEvent(openMoss(), PODS_MSG);
  assert.equal(m.screen, SCREEN.LEDGER,
    'a reply nobody asked for must not pull the player out of what they were reading');
  assert.equal(m.pods.rows.length, 5, '…but the data is folded, so a later `pods` renders instantly');
});

test('M3-4: the rows are the WIRE\'s — the reason is rendered verbatim, never re-composed', () => {
  const v = podBayView(withBay().model);
  assert.deepEqual(v.rows.map((r) => [r.num, r.occupant, r.state, r.reason, r.can]), [
    ['1', 'RELL', 'OPEN', '—', false],
    ['2', 'OZAWA-REYES', 'SEALED', 'READY — 2 SEALS', true],
    ['3', 'VANCE', 'NO SIGNAL', '—', false],
    ['7', 'TORRES', 'SEALED', 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0', false],
    ['9', 'LINDQVIST', 'CYCLING', 'POD LINDQVIST IS CYCLING — 4 min', false],
  ]);
  assert.equal(v.term, 'term_moss');
  assert.equal(v.moss, 'COMMISSIONED', 'the header states WHICH of OD-N\'s three MOSS states it is');
  assert.match(v.note, /CARRIED AND RESERVED/, 'the headroom line says which food number it is');
});

test('M3-4: OD-L — every SEALED row carries a non-empty reason WITH a number in it', () => {
  const v = podBayView(withBay().model);
  const sealed = v.rows.filter((r) => r.state === 'SEALED');
  assert.ok(sealed.length >= 2, 'precondition: sealed rows were examined');
  const problems = [];
  for (const r of sealed) {
    if (!r.reason || r.reason === '—') problems.push(r.pod + ': blank reason');
    else if (!/\d/.test(r.reason)) problems.push(r.pod + ': no number — ' + r.reason);
  }
  assert.deepEqual(problems, [],
    'a sealed capsule reached the player with nothing to act on: ' + problems.join(' | '));
});

test('M3-4: `thaw` on a refused row sends NOTHING and answers with the GATE\'s own sentence', () => {
  const { model } = withBay();
  const out = submitCommand(model, 'thaw 7');
  assert.deepEqual(out.effects, [],
    'MUTATION 4: the command and the affordance share ONE rule — a row the gate refuses is not sent');
  assert.deepEqual(out.model.console.slice(-1)[0],
    { stream: 2, text: 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0' },
    'and the refusal is the ROW\'s reason, not a bare no (RW §2.2)');
});

test('M3-4: `thaw` on an allowed row addresses the CONSOLE THE SIM RESOLVED, by capsule key', () => {
  const { model } = withBay();
  const out = submitCommand(model, 'thaw 2');
  assert.deepEqual(out.effects, [{ k: 'moss', op: 'thaw', tid: 'term_moss', text: 'pod_ozawa' }],
    'the tid is the wire\'s `term` (the prompt\'s own @console has no device behind it), and the ' +
    'capsule is the wire\'s key — never "pod_" + the occupant, which is authoring\'s convention');
});

test('M3-4: the capsule resolves by number, by key and by occupant — all three are on screen', () => {
  const { model } = withBay();
  for (const arg of ['2', 'pod_ozawa', 'OZAWA-REYES', 'ozawa-reyes']) {
    assert.deepEqual(submitCommand(model, 'thaw ' + arg).effects,
      [{ k: 'moss', op: 'thaw', tid: 'term_moss', text: 'pod_ozawa' }], 'failed for: ' + arg);
  }
  const bad = submitCommand(model, 'thaw 44');
  assert.deepEqual(bad.effects, []);
  assert.match(bad.model.console.slice(-1)[0].text, /NO SUCH CAPSULE/);
});

test('M3-4: SINGLE-FLIGHT — a second thaw in the same breath sends nothing (M3-3\'s filed defect)', () => {
  const first = submitCommand(withBay().model, 'thaw 2');
  assert.equal(first.effects.length, 1, 'precondition: the first ask went out');
  const second = submitCommand(first.model, 'thaw 2');
  assert.deepEqual(second.effects, [],
    'TWO ASKS INSIDE ONE TICK both read Progress == 0 and BOTH hear ACCEPTED, while only the first ' +
    'capsule cycles — this surface may never be the thing that produces that pair');
  assert.match(second.model.console.slice(-1)[0].text, /ALREADY REQUESTED/);
});

test('M3-4: the latch clears when the SHIP\'s own rows show the capsule moved — not before', () => {
  const asked = submitCommand(withBay().model, 'thaw 2');
  assert.equal(asked.model.pods.thawing, 'pod_ozawa');

  // A bay that still shows the capsule READY (the same tick, before the command drained) must NOT
  // release the latch — that is exactly the window the double-thaw lives in.
  const same = reduceMossEvent(asked.model, PODS_MSG);
  assert.equal(same.pods.thawing, 'pod_ozawa', 'the ship has not moved yet');

  // …and a bay in which it is now CYCLING does.
  const moved = JSON.parse(JSON.stringify(PODS_MSG));
  moved.rows[1] = [2, 'pod_ozawa', 'Ozawa-Reyes', 3, 'CYCLING', 5, 'POD OZAWA IS CYCLING — 4 min', 0];
  assert.equal(reduceMossEvent(asked.model, moved).pods.thawing, null);
});

test('M3-4: a REFUSED thaw reply clears the latch and reaches the transcript', () => {
  const asked = submitCommand(withBay().model, 'thaw 2');
  const after = reduceMossEvent(asked.model, { ev: 'thaw', tid: 'term_moss', ok: false,
    pod: 'pod_ozawa', why: 5, reason: 'POD LINDQVIST IS CYCLING — 3 min' });
  assert.deepEqual(after.console.slice(-1)[0],
    { stream: 2, text: 'POD LINDQVIST IS CYCLING — 3 min' },
    'M3-3 filed that nothing folded this reply at all — a thaw was answered into the void');
  assert.equal(after.pods.thawing, null, 'a refused ask has nothing in flight');
});

test('M3-4: selection survives by CAPSULE ID across a re-arriving bay (IX-M12\'s rule)', () => {
  let m = withBay().model;
  m = keyPress(m, 'ArrowDown').model;
  m = keyPress(m, 'ArrowDown').model;
  assert.equal(m.pods.selectedPod, 'pod_vance', 'precondition: the cursor moved');

  // The bay re-arrives one row shorter (a capsule was deconstructed). The cursor must not jump.
  const shorter = { ...PODS_MSG, rows: PODS_MSG.rows.filter((r) => r[1] !== 'pod_rell') };
  m = reduceMossEvent(m, shorter);
  assert.equal(m.pods.selectedPod, 'pod_vance', 'a row set that changed length moved the cursor');
});

test('M3-4: ENTER on the selected row is the SAME rule as the typed command', () => {
  let m = withBay().model;
  m = keyPress(m, 'ArrowDown').model;            // → pod_ozawa, the allowed one
  assert.equal(m.pods.selectedPod, 'pod_ozawa');
  const enter = keyPress(m, 'Enter');
  assert.deepEqual(enter.effects, [{ k: 'moss', op: 'thaw', tid: 'term_moss', text: 'pod_ozawa' }],
    'ENTER and `thaw` must ask the same predicate and produce the same message (RW §8.4 rung 3)');

  // …and on a refused row it refuses with the same sentence, again.
  let r = keyPress(keyPress(m, 'ArrowDown').model, 'ArrowDown');   // → pod_torres
  assert.equal(r.model.pods.selectedPod, 'pod_torres');
  const refused = keyPress(r.model, 'Enter');
  assert.deepEqual(refused.effects, []);
  assert.equal(refused.model.console.slice(-1)[0].text, 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0');
});

test('M3-4: `thaw` with no bay on the link says so — it never invents a capsule', () => {
  const out = submitCommand(openMoss(), 'thaw 2');
  assert.deepEqual(out.effects, []);
  assert.match(out.model.console.slice(-1)[0].text, /NO POD BAY ON THIS LINK/);
});

test('M3-4: OD-P holds — `pods` and `thaw` add no printable key to the routing table', () => {
  for (const k of Object.keys(KEY_ROUTE)) {
    assert.ok(k.length > 1, 'a single-character key entered KEY_ROUTE: ' + k);
  }
  // …and on the bay a letter still types rather than acting.
  const m = withBay().model;
  assert.equal(routeKey(m, 'p'), 'pass', '`p` must reach the prompt, not open anything');
  assert.equal(routeKey(m, 't'), 'pass', 'and `t` must not thaw anything');
});

test('M3-4: podRow invents nothing — no `can` means NO, no state means UNKNOWN', () => {
  assert.equal(podRow([1, 'pod_x', 'X', 1, 'SEALED', 6, 'NEEDS 1 PARTS — SHIP HAS 0']).can, false,
    'the affordance to wake somebody must be GRANTED by the gate, never assumed from a gap');
  assert.equal(podRow([1, 'pod_x', 'X']).state, 'UNKNOWN',
    'an unreadable state must never print as the healthy one (DA-M1)');
  assert.equal(podRow([1, '', 'X', 1, 'SEALED', 0, 'READY — 1 SEALS', 1]), null,
    'a capsule with no key cannot be addressed, so it is not a row');
  assert.equal(podRow(null), null);
});

test('M3-4: the CLICK path (`selectPod` + `thawPod`) is the same rule again, not a third one', () => {
  const { model } = withBay();
  const picked = selectPod(model, 'pod_torres');
  assert.equal(picked.pods.selectedPod, 'pod_torres');
  assert.equal(selectPod(model, 'pod_nobody'), model, 'a capsule not on the bay moves nothing');

  assert.deepEqual(thawPod(picked, 'pod_ozawa').effects,
    [{ k: 'moss', op: 'thaw', tid: 'term_moss', text: 'pod_ozawa' }]);
  const refused = thawPod(picked, 'pod_torres');
  assert.deepEqual(refused.effects, []);
  assert.equal(refused.model.console.slice(-1)[0].text, 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0');
  assert.equal(thawPod(picked, 'pod_nobody').handled, false, 'and an unknown capsule is not handled');
});

test('M3-4: an EMPTY bay says so — it never reads as "everybody is out"', () => {
  const m = reducePods(submitCommand(openMoss(), 'pods').model, { ev: 'pods', rows: [] });
  const v = podBayView(m);
  assert.deepEqual(v.rows, []);
  assert.equal(v.notice, NO_PODS);
  assert.equal(podBayView(openMoss()).notice, NO_PODS, 'and so does a bay that never arrived');
});

test('M3-4: the POD_STATE codes are the host\'s, and only two of them hide their reason', () => {
  assert.deepEqual(POD_STATE, { OPEN: 0, SEALED: 1, NO_SIGNAL: 2, CYCLING: 3 });
  const v = podBayView(withBay().model);
  const hidden = v.rows.filter((r) => r.reason === '—').map((r) => r.st).sort();
  assert.deepEqual(hidden, [POD_STATE.OPEN, POD_STATE.NO_SIGNAL],
    'a state word that already IS the reason does not repeat itself; every OTHER row must show one');
});

test('M3-4: the fixture can SEE the forbidden derivation — the capsule key is not the occupant', () => {
  // ⛔ THE GUARD ON THE GUARD. `activateThaw` must send `row.pod`, the wire's own key, and never
  // `'pod_' + occupant` — the `pod_` convention belongs to authoring (`AuthoredShips.cs:1963`) and
  // its inverse to the sim (`CryoSystem.SleeperName`), so a client that rebuilds it is one rename
  // away from addressing a capsule that does not exist. That rule is stated in three places and,
  // until this test, pinned in none: with a round-tripping fixture (`pod_ozawa`/`Ozawa`) the
  // forbidden expression is byte-identical to the correct one and the mutation leaves this whole
  // file green. This asserts the FIXTURE is still shaped so the mutation can bite.
  const compose = (occupant) => 'pod_' + String(occupant).replace(/[A-Z]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 32));
  const thawable = PODS_MSG.rows.filter((r) => r[7] === 1);
  assert.ok(thawable.length > 0, 'precondition: the fixture offers at least one capsule');
  const biting = thawable.filter((r) => compose(r[2]) !== r[1]);
  assert.deepEqual(biting.map((r) => r[1]), ['pod_ozawa'],
    'no THAWABLE fixture row has an occupant that fails to compose back to its key, so ' +
    '`text: row.pod` → `text: "pod_" + lower(row.occupant)` is a no-op and every message ' +
    'assertion in this file is satisfied by the defect it exists to forbid. Keep at least one ' +
    'offered capsule whose sleeper is not simply its key with a capital letter.');
});

// ═══════════════════════════════════════════════════════ M3-17 — the COMMISSIONING verb
//
// ⭐ THE PLAYTEST BLOCKER'S CLIENT HALF. `HandleCommission`, `CommissionDeviceCommand` and
// `build.def commission_cost` have all existed since E0-6; what did not exist was a SENDER, so
// the opening arc dead-ended one step before the pod bay. These tests pin the sender.

test('M3-17: `commission` parses as a NAV verb — not a device write, not UNKNOWN', () => {
  const cmd = parseCommand('commission');
  assert.equal(cmd.kind, 'nav',
    'it must not go out as `exec` — a device line is refused when the link is down and needs a ' +
    'target, and `commission` has neither');
  assert.equal(cmd.verb, 'commission');
  assert.deepEqual(cmd.args, []);
});

test('M3-17: typing `commission` sends the wire op and NOTHING else', () => {
  const before = openMoss();
  const out = submitCommand(before, 'commission');
  assert.deepEqual(out.effects, [{ k: 'moss', op: 'commission' }],
    'the ONLY effect is the ask — the client resolves no terminal, checks no stock and ' +
    'quotes no price, because none of those three facts has ever crossed the wire');
  assert.equal(out.model.screen, SCREEN.LEDGER, 'it opens no screen');
  // The command's only transcript mark is its own stream-0 echo. Anything NEW on stream 1 or 2
  // would be the client answering for the ship.
  const added = out.model.console.slice(before.console.length);
  assert.deepEqual(added.map((l) => l.stream), [0],
    'the client answered for the ship. A local "you have no controller module" is a second ' +
    'gate, and a second gate eventually disagrees with the sim (RW §2.2). Added: ' +
    JSON.stringify(added));
});

test('M3-17: case and spacing tolerance, like every other nav verb', () => {
  for (const raw of ['COMMISSION', '  Commission  ']) {
    assert.deepEqual(submitCommand(openMoss(), raw).effects, [{ k: 'moss', op: 'commission' }],
      'failed for: ' + JSON.stringify(raw));
  }
});

test('M3-17: the ship\'s verdict reaches the transcript, verbatim, on BOTH streams', () => {
  const asked = submitCommand(openMoss(), 'commission');
  const ok = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: true,
    lines: [[1, 'COMMISSION ACCEPTED — TERM_MOSS — 1 CONTROLLER MODULE FITTED; PROGRAMS AND THE POD BAY ARE OPEN']],
  });
  assert.ok(ok.console.some((l) => l.stream === 1 && l.text.startsWith('COMMISSION ACCEPTED')),
    'an accepted commission repaints nothing, so without this line "it worked" and "the key ' +
    'did nothing" are the same picture');

  const no = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: false,
    lines: [[2, 'COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0']],
  });
  assert.ok(no.console.some((l) => l.stream === 2
    && l.text === 'COMMISSIONING NEEDS 1 CONTROLLER MODULE — SHIP HAS 0'),
    'the refusal must arrive with its reason AND its number, unedited');
});

test('M3-17: BOTH signposts name the verb — a command nobody can discover is one nobody sends', () => {
  const helped = submitCommand(openMoss(), 'help');
  const lines = helped.model.console.filter((l) => l.stream === 1).map((l) => l.text);
  assert.ok(lines.some((l) => l.startsWith('COMMISSION')),
    'HELP lists every other verb the console answers; leaving this one out is how the blocker ' +
    'survived a whole milestone. Saw:\n' + lines.join('\n'));
  // …and the screen the player is ON, not only the list they have to know to ask for. The LEDGER
  // is where MOSS opens, and it already signposts PODS — the screen commissioning unlocks.
  const hints = footerHints(openMoss()).join(' · ');
  assert.ok(/COMMISSION/.test(hints),
    'the LEDGER footer does not name COMMISSION beside PODS: ' + hints);
});

// ═══════════════════════════════════════════════════════ the `doors` DIRECTORY verb
//
// ⛔ THE STALL, MEASURED IN LIVE PLAY (thaw-path audit, 2026-08-03). Since OD-N the ship's doors
// answer ONLY to MOSS, MOSS addresses a door BY NAME, and no surface anywhere named one: `open`
// answered UNKNOWN SYSTEM '', `open door` answered NO SUCH DEVICE 'DOOR', and only the exact
// `open door_d0_s1` worked — a key the player had no way to learn. The Regolith → Scrap → Parts →
// ControllerModule chain sits behind two of those doors on the shipping wreck.
//
// ⚠️ EXACTLY ONE VERB SHIPS, and OD-P is the SHAPE precedent rather than the authority: its row
// says MOSS-OS expansion is VISION and "never implement from this row". This is a defect closure
// wearing OD-P's typed-only style. No `ls`, no second noun; the shape awaits the owner's
// ratification on return.

test('doors: `doors` parses as a NAV verb — not a device write, not UNKNOWN', () => {
  const cmd = parseCommand('doors');
  assert.equal(cmd.kind, 'nav',
    'it names no device — and the entire reason it exists is that the player does not yet KNOW ' +
    'a device name, so it cannot be a device line');
  assert.equal(cmd.verb, 'doors');
  assert.deepEqual(cmd.args, []);
});

test('doors: typing `doors` sends the wire op and NOTHING else', () => {
  const before = openMoss();
  const out = submitCommand(before, 'doors');
  assert.deepEqual(out.effects, [{ k: 'moss', op: 'doors' }],
    'the ONLY effect is the ask — this client has never been told a door exists, so any local ' +
    'listing would be a second authority derived from a channel that does not carry the fact');
  assert.equal(out.model.screen, SCREEN.LEDGER, 'it opens no screen');
  const added = out.model.console.slice(before.console.length);
  assert.deepEqual(added.map((l) => l.stream), [0],
    'the client answered for the ship instead of asking it. Added: ' + JSON.stringify(added));
});

test('doors: case, spacing and stray-argument tolerance, like every other nav verb', () => {
  for (const raw of ['DOORS', '  Doors  ', 'doors deck 1']) {
    assert.deepEqual(submitCommand(openMoss(), raw).effects, [{ k: 'moss', op: 'doors' }],
      '`doors` is ONE noun — a filter would be a grammar, and this lane self-limits to one verb. ' +
      'Failed for: ' + JSON.stringify(raw));
  }
});

test('doors: the ship\'s listing reaches the transcript verbatim, on the exec channel', () => {
  // ⭐ NO NEW WIRE SHAPE — the listing rides `MossExec`'s existing stream-1 lines, which
  // `reduceMossEvent` already folds. This test is what says the client needs no new arm.
  const asked = submitCommand(openMoss(), 'doors');
  const shown = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: true,
    lines: [
      [1, 'DOORS — 16 ABOARD · 2 OPEN · 14 SHUT'],
      [1, 'DOOR_D0_S1 · DECK 0 AT 16,7 · SHUT'],
    ],
  });
  const out = shown.console.slice(asked.model.console.length)
    .filter((l) => l.stream === 1).map((l) => l.text);
  assert.deepEqual(out, ['DOORS — 16 ABOARD · 2 OPEN · 14 SHUT', 'DOOR_D0_S1 · DECK 0 AT 16,7 · SHUT'],
    'the ship\'s own words must arrive unedited, un-re-cased and un-re-ordered');

  const dark = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: false,
    lines: [[2, 'MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR TERM_MOSS ON DECK 0 AT 1,3 TO REACH THE DOORS']],
  });
  assert.ok(dark.console.some((l) => l.stream === 2 && /TO REACH THE DOORS$/.test(l.text)),
    'the dark-ship refusal must land on the error stream with its tail intact');
});

test('doors: BOTH signposts name the verb — a command nobody can discover is one nobody sends', () => {
  const helped = submitCommand(openMoss(), 'help');
  const lines = helped.model.console.filter((l) => l.stream === 1).map((l) => l.text);
  assert.ok(lines.some((l) => l.startsWith('DOORS')),
    'HELP does not list DOORS, and the onboarding card hands the player to HELP. Saw:\n' +
    lines.join('\n'));
  // …and the screen the player is ON. M3-17's own argument, applied to a worse stall: the door
  // names are what the whole opening is locked behind.
  const hints = footerHints(openMoss()).join(' · ');
  assert.ok(/DOORS/.test(hints),
    'the LEDGER footer does not name DOORS beside PODS and COMMISSION: ' + hints);
});

// ═══════════════════════════════════════════════════════ the `vents` DIRECTORY verb
//
// ⭐ OWNER-DIRECTED, 2026-08-04: the `doors` shape is RATIFIED and `vents` is the sanctioned second
// noun. Same shape, different stall — OD-N put the vents behind MOSS too, and on the shipping wreck
// the upper deck's only source of air is a NAME (`vent_d1`, OD-O's dead board) while the
// life-support compartment's authored first gesture is `open vent_ls`. Two keys with no surface
// that could read them out.
//
// ⚠️ STILL NO THIRD NOUN and still no filter grammar: two nouns were ruled, `ls` was not.

test('vents: `vents` parses as a NAV verb — not a device write, not UNKNOWN', () => {
  const cmd = parseCommand('vents');
  assert.equal(cmd.kind, 'nav',
    'it names no device — and the entire reason it exists is that the player does not yet KNOW ' +
    'a vent name, so it cannot be a device line');
  assert.equal(cmd.verb, 'vents');
  assert.deepEqual(cmd.args, []);
});

test('vents: typing `vents` sends the wire op and NOTHING else', () => {
  const before = openMoss();
  const out = submitCommand(before, 'vents');
  assert.deepEqual(out.effects, [{ k: 'moss', op: 'vents' }],
    'the ONLY effect is the ask — the `devices` channel carries ledger wear and no vent census, ' +
    'no OPEN/SHUT and no board-fault flag, so any local listing would be invented');
  assert.equal(out.model.screen, SCREEN.LEDGER, 'it opens no screen');
  const added = out.model.console.slice(before.console.length);
  assert.deepEqual(added.map((l) => l.stream), [0],
    'the client answered for the ship instead of asking it. Added: ' + JSON.stringify(added));
});

test('vents: case, spacing and stray-argument tolerance, like every other nav verb', () => {
  for (const raw of ['VENTS', '  Vents  ', 'vents deck 1']) {
    assert.deepEqual(submitCommand(openMoss(), raw).effects, [{ k: 'moss', op: 'vents' }],
      '`vents` is ONE noun — a filter would be a grammar, and the ratification covered a noun, ' +
      'not a query language. Failed for: ' + JSON.stringify(raw));
  }
});

test('vents: the ship\'s listing reaches the transcript verbatim, on the exec channel', () => {
  // ⭐ NO NEW WIRE SHAPE — the listing rides `MossExec`'s existing stream-1 lines, which
  // `reduceMossEvent` already folds. This test is what says the client needs no new arm.
  // ⚠️ THE FIXTURE IS THREE OF THE SHIPPING WRECK'S FOUR LINES, NOT THE WHOLE REPLY — the header
  // and two of its three rows (VENT_CRYO is left out), so the header's `3 ABOARD` deliberately does
  // not match the row count here. That is the doors fixture's shape and it is fine for what THIS
  // test asks: the reducer must carry whatever lines arrive, unedited, and it has no opinion about
  // how many there are. The whole reply is pinned in C#, against the real wire, by
  // `VentsVerbTests.TheWreckListingIsPinnedVERBATIM`. What the subset keeps on purpose is OD-O's
  // flag row, which must survive the trip unedited: a client that re-rendered it would be a second
  // vocabulary for a fault.
  const asked = submitCommand(openMoss(), 'vents');
  const shown = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: true,
    lines: [
      [1, 'VENTS — 3 ABOARD · 2 OPEN · 1 SHUT'],
      [1, 'VENT_LS · DECK 0 AT 35,6 · SHUT'],
      [1, 'VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT'],
    ],
  });
  const out = shown.console.slice(asked.model.console.length)
    .filter((l) => l.stream === 1).map((l) => l.text);
  assert.deepEqual(out, [
    'VENTS — 3 ABOARD · 2 OPEN · 1 SHUT',
    'VENT_LS · DECK 0 AT 35,6 · SHUT',
    'VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT',
  ], 'the ship\'s own words must arrive unedited, un-re-cased and un-re-ordered');

  const dark = reduceMossEvent(asked.model, {
    ev: 'exec', tid: '@console', ok: false,
    lines: [[2, 'MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR TERM_MOSS ON DECK 0 AT 1,3 TO REACH THE VENTS']],
  });
  assert.ok(dark.console.some((l) => l.stream === 2 && /TO REACH THE VENTS$/.test(l.text)),
    'the dark-ship refusal must land on the error stream with its own noun intact');
});

test('vents: BOTH signposts name the verb — a command nobody can discover is one nobody sends', () => {
  const helped = submitCommand(openMoss(), 'help');
  const lines = helped.model.console.filter((l) => l.stream === 1).map((l) => l.text);
  assert.ok(lines.some((l) => l.startsWith('VENTS')),
    'HELP does not list VENTS, and the onboarding card hands the player to HELP. Saw:\n' +
    lines.join('\n'));
  // …and the screen the player is ON. ⚠️ HELP is 14 lines in a ~7-line pane (FILED, not this
  // lane's), which is exactly why the permanent footer has to carry the verb too.
  const hints = footerHints(openMoss()).join(' · ');
  assert.ok(/VENTS/.test(hints),
    'the LEDGER footer does not name VENTS beside DOORS: ' + hints);
  assert.ok(/DOORS/.test(hints), 'INCLUSION CONTROL: the footer lost DOORS as well — ' + hints);
});
