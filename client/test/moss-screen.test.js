// MOSS terminal — the DOM/CRT face. Contract: docs/design/perilune-moss-terminal.spec.md,
// test obligations §6 row 3: the full takeover leaves no game chrome visible (IX-M1), the ESC
// stack order (IX-M2), click/double-click row semantics (IX-M7), reduced motion (VS-M10), and a
// live-pixel check of the ledger at 1024px and at full width (VS-M9 — that one is
// client/tools/moss-shot.mjs, in real Chrome; a stylesheet cannot be proven by node alone).
//
// The pure model is the `moss-model` lane's and ships as a THROWING STUB, so every test here
// drives the screen through the reference double in ./moss-model-fake.js. That is deliberate: it
// keeps this file testing the DOM layer and nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DocumentLite, makeWindow, keyEvent, dispatchKey, fire } from './dom-lite.js';
import * as FAKE from './moss-model-fake.js';
import {
  MossScreen, COLS, COL_AT, HEAD_LINE, NO_TELEMETRY, DEV_COLS, applyTakeover, wireForEffect,
  isTextEntryTarget,
} from '../src/ui/moss-screen.js';
import { systemRows, decode } from '../src/wire/messages.js';
import { escapeTarget } from '../src/ui/console-model.js';
import { isTextEntryTarget as controlsIsTextEntryTarget } from '../src/input/controls.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const FIX = join(here, 'fixtures', 'moss.jsonl');

const FIXTURE = readFileSync(FIX, 'utf8').split('\n').filter((l) => l.trim()).map(decode);
const msgOf = (type, ev) => FIXTURE.find((m) => m.type === type && (ev === undefined || m.ev === ev));

/** A page with the two things the takeover touches: a `.app` chrome root and `#moss-view`. */
function setup() {
  const doc = new DocumentLite();
  const app = doc.createElement('div');
  app.className = 'app';
  doc.body.appendChild(app);
  const panels = doc.createElement('div');
  doc.register('panels', panels);
  doc.body.appendChild(panels);
  const root = doc.createElement('div');
  root.className = 'moss';
  root.hidden = true;
  doc.register('moss-view', root);
  doc.body.appendChild(root);

  const win = makeWindow();
  const sent = [];
  let exits = 0;
  const screen = new MossScreen({
    root, document: doc, window: win, model: FAKE,
    send: (o) => sent.push(o), onExit: () => { exits += 1; },
  });
  return { doc, root, win, sent, screen, exitCount: () => exits };
}

/** Open with the fixture ledger already folded in. */
function openWithSystems() {
  const s = setup();
  s.screen.onSystems(msgOf('systems'));
  s.screen.open();
  return s;
}

const rowsOf = (root) => root.byClass('moss-row');
const lineOf = (rowEl) => rowEl.textContent;

// ---------------- IX-M1: the full takeover ----------------

test('IX-M1: opening MOSS takes the whole window; closing gives it back', () => {
  const s = setup();
  assert.equal(s.doc.body.classList.contains('moss-open'), false);
  assert.equal(s.root.hidden, true);

  s.screen.open();
  assert.equal(s.screen.isOpen(), true);
  assert.equal(s.doc.body.classList.contains('moss-open'), true, 'body carries the takeover hook');
  assert.equal(s.root.hidden, false, '#moss-view is shown');

  s.screen.close();
  assert.equal(s.doc.body.classList.contains('moss-open'), false);
  assert.equal(s.root.hidden, true);
  assert.equal(s.screen.isOpen(), false);
});

test('IX-M1: EVERY top-level game-chrome root index.html declares is display:none under the takeover', () => {
  // The strong form of "no game chrome shows through": the covered set is derived from the real
  // index.html, not hand-listed here — so adding a new top-level chrome root without covering it
  // in the takeover rules turns this test red.
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
  const roots = [...body.matchAll(/^<(?:div|main|section|aside|header|footer)\b([^>]*)>/gm)]
    .map((m) => m[1]);
  assert.ok(roots.length >= 3, 'index.html should declare several top-level roots');

  const covered = [];
  for (const attrs of roots) {
    const id = (/id="([^"]+)"/.exec(attrs) || [])[1] || '';
    const cls = ((/class="([^"]+)"/.exec(attrs) || [])[1] || '').split(/\s+/).filter(Boolean);
    if (id === 'moss-view') continue; // the terminal itself
    const selectors = [id ? '#' + id : null, ...cls.map((c) => '.' + c)].filter(Boolean);
    const hidden = selectors.some((sel) => {
      const re = new RegExp('body\\.moss-open\\s+' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*display\\s*:\\s*none');
      return re.test(css);
    });
    assert.ok(hidden, `top-level root ${selectors.join('/')} is not hidden by the takeover`);
    covered.push(selectors[0]);
  }
  assert.ok(covered.length >= 3, 'expected the app frame, the panel layer and the disconnect overlay');
});

test('IX-M1: the MOSS root contains no game chrome — it is a replacement, not an overlay', () => {
  const s = openWithSystems();
  for (const cls of ['app', 'topbar', 'crewwatch', 'stage', 'readout', 'console', 'crew-row', 'tabrow']) {
    assert.equal(s.root.byClass(cls).length, 0, `game chrome .${cls} must not live inside #moss-view`);
  }
  // ...and the takeover never touches the canvas: the screen only reads/writes its own root + body.
  assert.equal(s.doc.body.childNodes.filter((c) => c.classList && c.classList.contains('app')).length, 1);
});

// ---------------- IX-M2: the ESC stack ----------------

test('IX-M2: escapeTarget rung order is armed → dialogue → MOSS → relations → none', () => {
  const all = { armed: true, dialogueOpen: true, mossActive: true, relationsActive: true };
  assert.equal(escapeTarget(all), 'disarm');
  assert.equal(escapeTarget({ ...all, armed: false }), 'dialogue');
  assert.equal(escapeTarget({ ...all, armed: false, dialogueOpen: false }), 'moss');
  assert.equal(escapeTarget({ ...all, armed: false, dialogueOpen: false, mossActive: false }), 'relations');
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, mossActive: false, relationsActive: false }), 'none');
  // The rung is additive: a caller that never mentions MOSS keeps the pre-existing behaviour.
  assert.equal(escapeTarget({ armed: false, dialogueOpen: false, relationsActive: true }), 'relations');
});

test('IX-M2: MOSS ESC is a stack — prompt, then screen, then out to the ship', () => {
  const s = openWithSystems();
  // 1. a non-empty prompt clears first
  s.screen.inputEl.value = 'open reactor';
  fire(s.screen.inputEl, 'input');
  s.screen.escape();
  assert.equal(s.screen.model.prompt, '', 'ESC cleared the prompt');
  assert.equal(s.screen.isOpen(), true, 'and did NOT leave MOSS');

  // 2. an inner screen returns to the LEDGER
  s.screen.handleKey(keyEvent('Enter')); // ledger → DETAIL
  assert.equal(s.screen.model.screen, 'detail');
  s.screen.escape();
  assert.equal(s.screen.model.screen, 'ledger');
  assert.equal(s.screen.isOpen(), true);

  // 3. from the LEDGER, ESC leaves MOSS and restores the ship
  s.screen.escape();
  assert.equal(s.screen.isOpen(), false);
  assert.equal(s.exitCount(), 1);
  assert.equal(s.doc.body.classList.contains('moss-open'), false, 'the ship chrome is back');
});

// ---------------- IX-M8 / IX-M11: key routing + typing isolation ----------------

test('IX-M11: while MOSS holds the window, no key reaches the game shortcut handler', () => {
  const s = openWithSystems();
  let gameSawIt = 0;
  s.win.bubble.push(() => { gameSawIt += 1; });
  for (const k of ['ArrowUp', 'Enter', 'l', 'b', ' ', 'x']) {
    dispatchKey(s.win, keyEvent(k));
  }
  assert.equal(gameSawIt, 0, 'controls.js must never see a key while MOSS is up');
  s.screen.close();
  dispatchKey(s.win, keyEvent('b'));
  assert.equal(gameSawIt, 1, 'and must see them again the moment MOSS lets go');
});

test('IX-M2: Escape is the ONE key MOSS lets through — the shared stack decides who gets it', () => {
  // Two rungs sit above MOSS (a surviving move order, an open dialogue). If the MOSS view ate
  // Escape in its capture handler, both would be unreachable and the pure `escapeTarget` would be
  // decoration. So Escape must reach controls.js → Hud.handleEscape() → (maybe) screen.escape().
  const s = openWithSystems();
  let gameSawEscape = 0;
  s.win.bubble.push((e) => { if (e.key === 'Escape') gameSawEscape += 1; });
  const e = dispatchKey(s.win, keyEvent('Escape'));
  assert.equal(gameSawEscape, 1, 'the shared Escape handler must still be reached');
  assert.equal(e.propagationStopped, false);
  assert.equal(e.defaultPrevented, false);
  assert.equal(s.screen.isOpen(), true, 'and MOSS must NOT have acted on it by itself');
  assert.equal(s.exitCount(), 0);
  // it is `escape()` — what Hud calls once escapeTarget says 'moss' — that acts:
  s.screen.escape();
  assert.equal(s.screen.isOpen(), false);
});

test('IX-M8: `L` opens the FAULT LOG on an empty buffer and is a plain letter once typing has begun', () => {
  const s = openWithSystems();
  const e1 = keyEvent('l');
  s.screen.handleKey(e1);
  assert.equal(s.screen.model.screen, 'faultlog');
  assert.equal(e1.defaultPrevented, true, 'the navigation key is swallowed, not typed');

  s.screen.escape();
  s.screen.inputEl.value = 'open ';
  fire(s.screen.inputEl, 'input');
  const e2 = keyEvent('l');
  s.screen.handleKey(e2);
  assert.equal(s.screen.model.screen, 'ledger', 'mid-command, L is a character not a hotkey');
  assert.equal(e2.defaultPrevented, false, 'so the input must be allowed to receive it');
});

test('IX-M8: `handled` — not "did anything change" — decides whether the key is swallowed', () => {
  // The model reports `handled`; a key it declines must reach the input as a character. Proven by
  // a stub that changes NOTHING yet claims the key, and one that changes state yet disclaims it.
  const s = openWithSystems();
  s.screen.M = { ...FAKE, keyPress: (m) => ({ model: m, effects: [], handled: true, route: 'nav' }) };
  const claimed = keyEvent('l');
  s.screen.handleKey(claimed);
  assert.equal(claimed.defaultPrevented, true, 'a claimed key is swallowed even with no state change');

  s.screen.M = { ...FAKE, keyPress: (m) => ({ model: { ...m }, effects: [], handled: false, route: 'pass' }) };
  const declined = keyEvent('l');
  s.screen.handleKey(declined);
  assert.equal(declined.defaultPrevented, false, 'a declined key reaches the input, state change or not');
});

test('IX-M11: a key out of the PROGRAM IDE\'s textarea is never offered to the model (guard first)', () => {
  const s = openWithSystems();
  let sawKey = 0;
  s.screen.M = { ...FAKE, keyPress: (m, k, mods) => { sawKey += 1; return FAKE.keyPress(m, k, mods); } };
  const fromTextarea = keyEvent('l', { target: { tagName: 'TEXTAREA' } });
  s.screen.handleKey(fromTextarea);
  assert.equal(sawKey, 0, 'the model must not even see it');
  assert.equal(fromTextarea.defaultPrevented, false);
  assert.equal(fromTextarea.propagationStopped, false, 'controls.js keeps its own guard-first rule');
  // ...while our OWN prompt input is exempt, or MOSS could never be typed into at all
  const fromPrompt = keyEvent('l', { target: s.screen.inputEl });
  s.screen.handleKey(fromPrompt);
  assert.equal(sawKey, 1);
});

test('the guard is the same predicate as controls.js:isTextEntryTarget', () => {
  // It is a deliberate local copy (a `hud → moss-screen → controls → hud` cycle is not worth four
  // lines); this pins the two together so the copy can never drift.
  const cases = [
    { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true }, { tagName: 'DIV', isContentEditable: false },
    { tagName: 'DIV' }, { tagName: 'CANVAS' }, { tagName: 'BUTTON' }, {}, null, undefined,
  ];
  for (const c of cases) {
    assert.equal(isTextEntryTarget(c), controlsIsTextEntryTarget(c), JSON.stringify(c));
  }
});

test('IX-M3/M8: ↑↓ move the ledger selection when empty and walk history once typing has begun', () => {
  const s = openWithSystems();
  const sel = () => FAKE.ledgerView(s.screen.model).selectedIndex;
  assert.equal(sel(), 0);
  s.screen.handleKey(keyEvent('ArrowUp'));
  assert.equal(sel(), 0, 'clamped at the top — a diagnostic table must not wrap');
  s.screen.handleKey(keyEvent('ArrowDown'));
  s.screen.handleKey(keyEvent('ArrowDown'));
  assert.equal(sel(), 2);
  s.screen.handleKey(keyEvent('End'));
  assert.equal(sel(), 7);
  s.screen.handleKey(keyEvent('ArrowDown'));
  assert.equal(sel(), 7, 'clamped at the bottom too');

  // submit a line so there is history, then type and walk it
  s.screen.inputEl.value = 'status';
  fire(s.screen.inputEl, 'input');
  s.screen.handleKey(keyEvent('Enter'));
  const before = sel();
  s.screen.inputEl.value = 'o';
  fire(s.screen.inputEl, 'input');
  s.screen.handleKey(keyEvent('ArrowUp'));
  assert.equal(s.screen.model.prompt, 'status', '↑ on a non-empty buffer is history');
  assert.equal(sel(), before, 'and must NOT have moved the ledger cursor');
});

test('the prompt echoes the model buffer and is capped at 240 characters (IX-M42)', () => {
  const s = openWithSystems();
  assert.equal(s.screen.inputEl.getAttribute('maxlength'), '240');
  s.screen.inputEl.value = 'x'.repeat(400);
  fire(s.screen.inputEl, 'input');
  assert.equal(s.screen.model.prompt.length, 240);
  assert.equal(s.screen.echoEl.textContent, s.screen.model.prompt, 'the visible echo mirrors the buffer');
  assert.equal(s.screen.inputEl.value, s.screen.model.prompt, 'and so does the real input element');
});

test('IX-M42: the DOM caps the prompt itself, not only because the model does', () => {
  // The model caps at PROMPT_MAX too, so the previous test passes even with the DOM's own cap
  // deleted — a test that cannot fail. This one isolates the DOM's cap with a model that has none.
  const s = openWithSystems();
  s.screen.M = { ...FAKE, editPrompt: (m, t) => ({ ...m, prompt: String(t) }) };
  s.screen.inputEl.value = 'x'.repeat(400);
  fire(s.screen.inputEl, 'input');
  assert.equal(s.screen.model.prompt.length, 240, 'the DOM refuses to hand on more than 240');
});

// ---------------- IX-M7: mouse ----------------

test('IX-M7: a click selects without activating; a double-click activates', () => {
  const s = openWithSystems();
  const rows = rowsOf(s.root);
  assert.equal(rows.length, 8);

  fire(rows[3], 'click');
  assert.equal(FAKE.ledgerView(s.screen.model).selectedIndex, 3, 'the click moved the selection');
  assert.equal(s.screen.model.screen, 'ledger', 'and did NOT open the detail screen');
  assert.deepEqual(s.sent, [], 'a bare click asks the host for nothing');

  fire(rowsOf(s.root)[3], 'dblclick');
  assert.equal(s.screen.model.screen, 'detail', 'the double-click activated the row');
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'sys', tid: 'hydroponics' }]);
});

test('IX-M7: clicking a row far from the cursor lands exactly on it, both directions', () => {
  const s = openWithSystems();
  fire(rowsOf(s.root)[7], 'click');
  assert.equal(FAKE.ledgerView(s.screen.model).selectedIndex, 7);
  fire(rowsOf(s.root)[1], 'click');
  assert.equal(FAKE.ledgerView(s.screen.model).selectedIndex, 1);
  fire(rowsOf(s.root)[1], 'click');
  assert.equal(FAKE.ledgerView(s.screen.model).selectedIndex, 1, 'clicking the selected row is a no-op');
});

test('IX-M7: a row click with a half-typed command moves the CURSOR, not the command line', () => {
  // IX-M8 routes ↑/↓ to command history once the buffer has text, so a naive click implementation
  // (walk the cursor with arrow presses on the live model) silently rewrites what the player typed.
  const s = openWithSystems();
  s.screen.inputEl.value = 'set vent_ls.rate max';
  fire(s.screen.inputEl, 'input');
  // give the history something to walk into, so a wrong implementation would visibly clobber
  s.screen.model = FAKE.submitCommand(s.screen.model, 'status').model;
  s.screen.model = FAKE.editPrompt(s.screen.model, 'set vent_ls.rate max');
  s.screen.render();

  fire(rowsOf(s.root)[4], 'click');
  assert.equal(FAKE.ledgerView(s.screen.model).selectedIndex, 4, 'the cursor moved');
  assert.equal(s.screen.model.prompt, 'set vent_ls.rate max', 'and the command line survived intact');
  assert.equal(s.screen.echoEl.textContent, 'set vent_ls.rate max');
});

// ---------------- VS-M2/M3/M4/M8: the monospace grid ----------------

test('VS-M2: every ledger line is one fixed-width monospace record — a `--` shifts nothing', () => {
  const s = openWithSystems();
  const lines = rowsOf(s.root).map(lineOf);
  assert.equal(lines.length, 8);
  const faultStarts = new Set();
  for (const line of lines) {
    assert.equal(line.indexOf('['), COL_AT.bar, 'the load bar starts in the same cell on every row');
    assert.equal(line.indexOf(']'), COL_AT.bar + COLS.bar - 1, 'and is exactly 8 cells wide (VS-M4)');
    const load = line.slice(COL_AT.load, COL_AT.load + COLS.load);
    assert.equal(load.length, COLS.load);
    assert.equal(load, load.trimStart().padStart(COLS.load), 'the load number is right-aligned');
    faultStarts.add(COL_AT.fault);
    assert.equal(line.slice(COL_AT.state, COL_AT.fault).length, COLS.state);
  }
  assert.equal(faultStarts.size, 1, 'LAST FAULT begins in the same cell on every row');

  // the `--` row (nav_sensors carries load -1) uses an EMPTY bar and still lines up
  const navLine = lines[7];
  assert.equal(navLine.slice(COL_AT.bar, COL_AT.bar + COLS.bar), '[        ]');
  assert.equal(navLine.slice(COL_AT.load, COL_AT.load + COLS.load), '  --');
  // ...at byte-identical column offsets to a row that DOES have a load
  const reactor = lines[0];
  assert.equal(reactor.indexOf('['), navLine.indexOf('['));
  assert.equal(reactor.slice(COL_AT.state).indexOf('NOMINAL'), 0);
});

test('VS-M3: the selection band carries the `>` caret and unselected rows keep a blank gutter', () => {
  const s = openWithSystems();
  let lines = rowsOf(s.root).map(lineOf);
  assert.equal(lines[0].slice(0, COLS.gutter), '> ');
  for (let i = 1; i < lines.length; i++) {
    assert.equal(lines[i].slice(0, COLS.gutter), '  ', 'nothing shifts when the cursor moves');
  }
  assert.equal(rowsOf(s.root)[0].classList.contains('sel'), true);

  s.screen.handleKey(keyEvent('ArrowDown'));
  lines = rowsOf(s.root).map(lineOf);
  assert.equal(lines[0].slice(0, COLS.gutter), '  ');
  assert.equal(lines[1].slice(0, COLS.gutter), '> ');
  assert.equal(rowsOf(s.root)[1].classList.contains('sel'), true);
  assert.equal(rowsOf(s.root)[0].classList.contains('sel'), false);
});

test('VS-M8: ⚠ trails ATTEND/DEGRADED only; OFFLINE is dim, not an alarm', () => {
  const s = openWithSystems();
  const rows = rowsOf(s.root);
  const states = FAKE.ledgerView(s.screen.model).rows.map((r) => r.state);
  rows.forEach((el, i) => {
    const state = states[i];
    const warns = state === 1 || state === 2;
    assert.equal(lineOf(el).includes('⚠'), warns, `row ${i} (state ${state}) ⚠`);
    assert.equal(el.oneClass('c-state').classList.contains('warn'), warns);
    assert.equal(el.classList.contains('offline'), state === 3, `row ${i} offline class`);
  });
  assert.equal(states[7], 3, 'nav_sensors is the OFFLINE row in the fixture');
});

test('VS-M6: the header is the two title lines and the column head is the ledger geometry', () => {
  const s = openWithSystems();
  const head = s.root.byClass('moss-headline').map((e) => e.textContent);
  assert.equal(head.length, 2);
  assert.ok(head[0].startsWith('MOSS ▮ MODULAR OPERATIONS & SYSTEMS SUPERVISOR'));
  assert.ok(head[1].includes('HULL 7741') && head[1].includes('DAY 213'));
  const thead = s.root.oneClass('moss-thead').textContent;
  assert.equal(thead, HEAD_LINE);
  assert.equal(thead.indexOf('SYSTEM'), COL_AT.label);
  assert.equal(thead.indexOf('LOAD'), COL_AT.bar);
  assert.equal(thead.indexOf('STATE'), COL_AT.state);
  assert.equal(thead.indexOf('LAST FAULT'), COL_AT.fault);
});

test('VS-M7: footer hints are per-screen bracket keys, joined with ` · `', () => {
  const s = openWithSystems();
  assert.ok(s.screen.footEl.textContent.includes('[ESC] BACK TO SHIP'));
  assert.ok(s.screen.footEl.textContent.includes(' · '), 'the DOM joins the model\'s fragments');
  const ledgerHints = s.screen.footEl.textContent;
  s.screen.handleKey(keyEvent('l'));
  assert.notEqual(s.screen.footEl.textContent, ledgerHints, 'the FAULT LOG has its own hints');
  assert.ok(s.screen.footEl.textContent.includes('[ESC]'));
});

// ---------------- IX-M13: the honest empty state ----------------

test('IX-M13: with no telemetry the ledger says LINK DOWN, never an empty table', () => {
  const s = setup();
  s.screen.open();
  assert.equal(rowsOf(s.root).length, 0, 'no rows at all');
  const nolink = s.root.oneClass('moss-nolink');
  assert.ok(nolink, 'a LINK DOWN block is rendered instead');
  assert.ok(nolink.textContent.includes(NO_TELEMETRY));
  assert.ok(nolink.textContent.includes('NOTHING BELOW IS A READING'));
  // and the moment telemetry lands, the real table replaces it
  s.screen.onSystems(msgOf('systems'));
  assert.equal(rowsOf(s.root).length, 8);
  assert.equal(s.root.oneClass('moss-nolink'), null);
});

test('IX-M13: the headline is the MODEL\'s `notice`, and `linked` — not "zero rows" — is the verdict', () => {
  // A link that is UP and reports nothing is a different claim from a link that is DOWN, and the
  // screen must not collapse the two. `linked` comes from the model; the DOM only renders it.
  const s = setup();
  const stub = {
    ...FAKE,
    ledgerView: () => ({ rows: [], selectedIndex: -1, advisory: '', linked: true, notice: '' }),
  };
  s.screen.M = stub;
  s.screen.open();
  const block = s.root.oneClass('moss-nolink');
  assert.ok(block.textContent.includes('THE LINK IS UP AND REPORTS NO SYSTEMS'));
  assert.ok(!block.textContent.includes('NO TELEMETRY HAS ARRIVED'));
  // a model that carries a custom notice has it rendered verbatim
  s.screen.M = { ...FAKE, ledgerView: () => ({ rows: [], selectedIndex: -1, advisory: '', linked: false, notice: 'SIGNAL LOST — RELAY 3' }) };
  s.screen.render();
  assert.ok(s.root.oneClass('moss-nolink-head').textContent.includes('SIGNAL LOST — RELAY 3'));
});

// ---------------- IX-M4 / IX-M22: DETAIL ----------------

test('IX-M4: DETAIL shows an honest LOADING… until the reply, then the device table (IX-M22 note)', () => {
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('ArrowDown')); // life_support
  s.screen.handleKey(keyEvent('Enter'));
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'sys', tid: 'life_support' }]);
  assert.ok(s.root.oneClass('moss-loading'), 'LOADING… is shown, never a fabricated table');
  assert.equal(s.root.byClass('moss-devrow').length, 0);

  s.screen.onMossEvent(msgOf('moss', 'sys'));
  assert.equal(s.root.oneClass('moss-loading'), null);
  const devs = s.root.byClass('moss-devrow').map((e) => e.textContent);
  assert.equal(devs.length, 4);
  assert.equal(devs[0].indexOf('Scrubber'), DEV_COLS.name, 'the device table is the same grid rule');
  assert.ok(devs[1].endsWith('WORN — MAINTENANCE DUE'));
  assert.ok(devs[3].includes('OFF'), 'an unpowered device says so');
  assert.ok(devs[0].includes('DECK 0 · 18,5'), 'the model\'s preformatted place string is used');
  assert.ok(s.root.oneClass('moss-notes-head'), 'the DERIVATION note is part of the feature (IX-M22)');
});

test('IX-M22: the HOST\'s derivation prose wins over the model\'s built-in fallback', () => {
  // §1.2 carries a `derivation` string on the ev:sys reply. The client explaining the host's maths
  // from its own table is precisely the drift MECHANICS.md §13 catalogues — so the wire wins, and
  // the §5.1 fault caveat (the model's, and about the client's own join) still trails it.
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('ArrowDown'));
  s.screen.handleKey(keyEvent('Enter'));
  s.screen.onMossEvent(msgOf('moss', 'sys'));
  const fallback = s.root.byClass('moss-note').map((e) => e.textContent);
  assert.ok(fallback[0].includes('TEST DOUBLE PROSE'), 'the model\'s fallback shows pre-wire');

  s.screen.onMossEvent({ ...msgOf('moss', 'sys'), derivation: 'WORST-ROOM CO2 PPM, MEASURED.' });
  const notes = s.root.byClass('moss-note').map((e) => e.textContent);
  assert.equal(notes[0], 'WORST-ROOM CO2 PPM, MEASURED.');
  assert.equal(notes.length, 2, 'the fault caveat still trails it');
  assert.ok(!notes.join(' ').includes('TEST DOUBLE PROSE'), 'and the fallback is gone');
});

// ---------------- IX-M5 / §5.1: FAULT LOG ----------------

test('IX-M5: L opens the FAULT LOG; from DETAIL it is filtered to that system', () => {
  const s = openWithSystems();
  s.screen.onChron(msgOf('chron'));
  s.screen.handleKey(keyEvent('l'));
  assert.equal(s.screen.model.screen, 'faultlog');
  assert.equal(s.screen.model.filterId, null, 'from the LEDGER it opens unfiltered (null, not "")');
  // the fixture's chronicle carries 2 headlines + 3 lines, all day-stamped, newest first
  const entries = s.root.byClass('moss-logrow').map((e) => e.textContent);
  assert.equal(entries.length, 5);
  assert.ok(entries[0].startsWith('DAY 212'), entries[0]);
  assert.ok(entries[entries.length - 1].startsWith('DAY 213'));
  assert.ok(s.root.oneClass('moss-note').textContent.includes('NOT THE CURRENT PROBLEM'),
    '§5.1: the column must not imply a live diagnosis');

  s.screen.handleKey(keyEvent('l')); // back
  s.screen.handleKey(keyEvent('Enter')); // DETAIL for reactor
  s.screen.handleKey(keyEvent('l'));
  assert.equal(s.screen.model.filterId, 'reactor', 'from DETAIL it is filtered to that system');
  // the model's own title already names the system — the DOM must not print it a second time
  const head = s.root.oneClass('moss-subhead').textContent;
  assert.ok(head.includes('REACTOR'), head);
  assert.equal(head.split('REACTOR').length - 1, 1, 'the filtered system is named exactly once');
});

test('an empty fault log says so rather than rendering a blank pane', () => {
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('l'));
  assert.ok(s.root.oneClass('moss-empty').textContent.includes('NO ATTRIBUTABLE FAULTS'));
});

// ---------------- IX-M6: PROGRAM (the shell + directory; the IDE is the follow-up lane) ----------

test('IX-M6: P opens the PROGRAM directory; selecting a terminal requests its source', () => {
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }, { tid: 'aft', deck: 1 }]);
  s.screen.handleKey(keyEvent('p'));
  assert.equal(s.screen.model.screen, 'program');
  const rows = s.root.byClass('moss-prog-row');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].textContent.includes('bridge') && rows[0].textContent.includes('DECK 0'));
  assert.ok(s.root.oneClass('moss-prog-editor').textContent.includes('SELECT A TERMINAL'));

  fire(rows[1], 'click');
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'open', tid: 'aft' }]);
  assert.ok(s.root.oneClass('moss-prog-editor').textContent.includes('EDITOR NOT INSTALLED'),
    'the seam states plainly that the editor half is a follow-up lane');
});

test('IX-M6: the PROGRAM seam mounts a supplied editor with the selected tid', () => {
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }]);
  const mounted = [];
  s.screen.attachProgramEditor({ mount: (el, tid) => { mounted.push(tid); el.textContent = 'IDE ' + tid; } });
  s.screen.handleKey(keyEvent('p'));
  s.screen.selectProgram('bridge');
  assert.deepEqual(mounted.slice(-1), ['bridge']);
  assert.ok(s.root.oneClass('moss-prog-editor').textContent.includes('IDE bridge'));
});

test('PROGRAM with no terminals aboard says so', () => {
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('p'));
  assert.ok(s.root.oneClass('moss-empty').textContent.includes('NO MOSS TERMINALS ABOARD'));
});

// ---------------- the prompt → wire ----------------

test('§1.2/§1.3: MOSS wire ops are keyed by "type" (a "cmd" message is silently dropped host-side)', () => {
  // hosts/web/GameSession.cs:956-968 dispatches any message carrying "cmd" through the view-command
  // switch, where `moss` is not a case — it falls to `default` and is ignored. The spec's §1.2/§1.3
  // examples said `"cmd":"moss"`; they are amended, and this pins the corrected shape.
  assert.deepEqual(wireForEffect({ k: 'moss', op: 'sys', tid: 'reactor' }),
    { type: 'moss', op: 'sys', tid: 'reactor' });
  assert.deepEqual(wireForEffect({ k: 'moss', op: 'exec', text: 'close door_storage' }),
    { type: 'moss', op: 'exec', tid: '@console', text: 'close door_storage' });
  assert.deepEqual(wireForEffect({ k: 'chron' }), { type: 'chron' });
  assert.equal(wireForEffect({ k: 'exit' }), null, 'exit is not a wire request');
  assert.equal(wireForEffect(null), null);
});

test('submitting a command echoes it, clears the buffer, and sends one exec', () => {
  const s = openWithSystems();
  s.screen.inputEl.value = 'close door_storage';
  fire(s.screen.inputEl, 'input');
  s.screen.handleKey(keyEvent('Enter'));
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'exec', tid: '@console', text: 'close door_storage' }]);
  assert.equal(s.screen.model.prompt, '');
  assert.equal(s.screen.inputEl.value, '', 'the input follows the model, not the other way round');
  // the MODEL writes the `> ` on an echo line; the DOM renders it verbatim, never prefixing a second
  const echo = s.root.byClass('moss-cline').map((e) => e.textContent);
  assert.deepEqual(echo, ['> close door_storage']);
  assert.equal(echo[0].indexOf('> >'), -1, 'the caret is not printed twice');

  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: false, lines: [[2, 'NO SUCH DEVICE']] });
  const after = s.root.byClass('moss-cline');
  assert.equal(after[1].textContent, 'NO SUCH DEVICE');
  assert.ok(after[1].className.includes('err'), 'stream 2 renders as an error');
});

// ---------------- the wire decoder ----------------

test('systemRows: honest sentinels, wire order, and no invented values', () => {
  const rows = systemRows(msgOf('systems'));
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r) => r.id), [
    'reactor', 'life_support', 'water_reclaim', 'hydroponics',
    'thermal', 'fabrication', 'hull_integrity', 'nav_sensors',
  ]);
  assert.equal(rows[7].load, -1, '-1 is "no meaningful load", not zero');
  assert.equal(rows[5].faultDay, -1);
  assert.equal(rows[5].faultText, '');
  // tolerance: garbage in, nothing out — never a plausible placeholder
  assert.deepEqual(systemRows(null), []);
  assert.deepEqual(systemRows({ rows: 'nope' }), []);
  assert.deepEqual(systemRows({ rows: [[], ['', 'X'], 42] }), []);
  const short = systemRows({ rows: [['x', 'X']] });
  assert.deepEqual(short, [{ id: 'x', label: 'X', load: -1, state: 0, faultDay: -1, faultText: '', advisory: '' }]);
});

// ---------------- IX-M12 ----------------

test('IX-M12: a row set that changes length must not move the cursor under the player', () => {
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('ArrowDown'));
  s.screen.handleKey(keyEvent('ArrowDown')); // water_reclaim
  assert.equal(s.screen.model.selectedId, 'water_reclaim');
  const trimmed = { ...msgOf('systems'), rows: msgOf('systems').rows.filter((r) => r[0] !== 'reactor') };
  s.screen.onSystems(trimmed);
  assert.equal(s.screen.model.selectedId, 'water_reclaim', 'selection is preserved by id, not index');
  assert.equal(rowsOf(s.root).length, 7);
  assert.equal(lineOf(rowsOf(s.root)[1]).slice(0, COLS.gutter), '> ', 'and the caret followed the id');
});

// ---------------- VS-M9 / VS-M10: the stylesheet obligations ----------------
// A stylesheet cannot be proven by node — client/tools/moss-shot.mjs renders these in real Chrome
// at 1440px and 1024px. What node CAN pin is that the rules exist at all, so deleting one is red.

test('VS-M10: reduced motion turns the block cursor steady', () => {
  const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.moss-cursor\s*\{([^}]*)\}/.exec(css);
  assert.ok(block, 'the MOSS reduced-motion block exists');
  assert.match(block[1], /animation\s*:\s*none/);
});

test('VS-M9: the responsive floor drops LAST FAULT before any other column, and never scrolls x', () => {
  const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const mq = /@media\s*\(max-width:\s*1023px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(mq, 'a below-1024 breakpoint exists');
  assert.match(mq[1], /\.c-fault\s*\{[^}]*display\s*:\s*none/, 'the fault column is what drops');
  assert.doesNotMatch(mq[1], /\.c-label\s*\{[^}]*display\s*:\s*none/, 'and never the label');
  assert.match(css, /\.moss\{[\s\S]*?overflow:hidden/, '.moss clips its own axes');
  assert.match(css, /\.moss-body\{[^}]*overflow-x:hidden/, 'the body never scrolls the page sideways');
  // above the floor, the fault column truncates rather than pushing the row wide
  assert.match(css, /\.moss-row \.c-fault\{[^}]*text-overflow:ellipsis/);
});

test('VS-M5: the CRT treatment is ONE non-interactive overlay, never a per-character effect', () => {
  const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const crt = /\.moss-crt\{([^}]*)\}/.exec(css);
  assert.ok(crt);
  assert.match(crt[1], /pointer-events:none/);
  assert.match(crt[1], /repeating-linear-gradient/);
  assert.match(css, /\.moss-crt::after\{[^}]*box-shadow:\s*inset /, 'the vignette rides the same overlay');
});

// ---------------- applyTakeover in isolation ----------------

test('applyTakeover is total and degenerate-safe', () => {
  const doc = new DocumentLite();
  const root = doc.createElement('div');
  root.hidden = true;
  doc.register('moss-view', root);
  applyTakeover(doc, true);
  assert.equal(doc.body.classList.contains('moss-open'), true);
  assert.equal(root.hidden, false);
  applyTakeover(doc, false);
  assert.equal(doc.body.classList.contains('moss-open'), false);
  assert.equal(root.hidden, true);
  assert.doesNotThrow(() => applyTakeover(null, true));
});
