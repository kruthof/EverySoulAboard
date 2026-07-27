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

import { DocumentLite, makeWindow, keyEvent, dispatchKey, fire, editable } from './dom-lite.js';
import { cssCodeOnly } from './code-only.js';
import * as FAKE from './moss-model-fake.js';
import {
  MossScreen, COLS, COL_AT, HEAD_LINE, NO_TELEMETRY, DEV_COLS, applyTakeover, wireForEffect,
  isTextEntryTarget, SCROLL_KEYS,
} from '../src/ui/moss-screen.js';
import { decode } from '../src/wire/messages.js';
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

/** HTML elements that never have a closing tag, so they must not open a nesting level. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr']);
/** Not chrome: they render nothing the player could see behind MOSS. */
const NON_VISUAL = new Set(['script', 'template', 'style', 'noscript']);

/**
 * Every element that is a DIRECT child of `<body>`, whatever its tag or indentation. A depth
 * counter, not a line-anchored regex: the previous version matched `^<(div|main|…)` per line, so an
 * indented root, or one using a tag outside a hand-written list (`nav`, `dialog`, `canvas`, `ul`,
 * `form`), slipped through the very check that is supposed to be exhaustive.
 */
function topLevelBodyRoots(html) {
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  const roots = [];
  let depth = 0, m;
  while ((m = re.exec(body)) !== null) {
    const closing = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3], selfClosed = m[4] === '/';
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) roots.push({ tag, attrs });
    if (!VOID_TAGS.has(tag) && !selfClosed) depth++;
  }
  return roots;
}

test('IX-M1: EVERY top-level game-chrome root index.html declares is display:none under the takeover', () => {
  // The strong form of "no game chrome shows through": the covered set is derived from the real
  // index.html, not hand-listed here — so adding a new top-level chrome root without covering it
  // in the takeover rules turns this test red, whatever tag it uses and however it is indented.
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  const css = cssCodeOnly(readFileSync(join(CLIENT, 'styles.css'), 'utf8'));
  const roots = topLevelBodyRoots(html);
  const tags = roots.map((r) => r.tag);
  assert.ok(tags.includes('script'), 'the scanner sees the module script, i.e. it reached the end');
  assert.ok(roots.length >= 4, 'index.html declares several top-level roots, got ' + tags.join(','));

  const covered = [];
  for (const { tag, attrs } of roots) {
    if (NON_VISUAL.has(tag)) continue;
    const id = (/id="([^"]+)"/.exec(attrs) || [])[1] || '';
    const cls = ((/class="([^"]+)"/.exec(attrs) || [])[1] || '').split(/\s+/).filter(Boolean);
    if (id === 'moss-view') continue; // the terminal itself
    const selectors = [id ? '#' + id : null, ...cls.map((c) => '.' + c)].filter(Boolean);
    assert.ok(selectors.length, `top-level <${tag}> has no id or class, so nothing can hide it`);
    const hidden = selectors.some((sel) => {
      const re = new RegExp('body\\.moss-open\\s+' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*display\\s*:\\s*none');
      return re.test(css);
    });
    assert.ok(hidden, `top-level root <${tag}> ${selectors.join('/')} is not hidden by the takeover`);
    covered.push(selectors[0]);
  }
  assert.ok(covered.length >= 3, 'expected the app frame, the panel layer and the disconnect overlay');
});

test('the top-level root scanner survives indentation, unlisted tags and nested lookalikes', () => {
  // Pins the scanner itself — the previous line-anchored regex passed its own test while missing
  // both of these.
  const doc = '<body>\n  <div class="app"><div id="inner"></div></div>\n' +
    '    <nav id="deep"></nav>\n<dialog id="dlg"></dialog>\n<img id="v">\n' +
    '<script src="x"></script>\n</body>';
  const roots = topLevelBodyRoots(doc);
  assert.deepEqual(roots.map((r) => r.tag), ['div', 'nav', 'dialog', 'img', 'script']);
  assert.ok(!roots.some((r) => /id="inner"/.test(r.attrs)), 'a nested element is not a root');
  assert.ok(roots.some((r) => /id="deep"/.test(r.attrs)), 'indentation does not hide a root');
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

/**
 * THE PHASE, ASSERTED BY NAME — `CLAUDE.md` trap 4, and it is here because the indirect guard below
 * had a hole that a runtime-recording stub did NOT close by itself.
 *
 * IX-M11 infers the phase: it pushes a handler onto `win.bubble` and asserts the game never sees a
 * key. That inference is only as good as `dom-lite`'s filing rule, and the filing rule used a bare
 * truthiness test on the third argument. MEASURED, before `dom-lite.js` was fixed: dropping the
 * argument from `moss-screen.js:271` went RED, but rewriting it as `{ capture: false }` — the SAME
 * regression in the modern options spelling — stayed GREEN, because an object is truthy and was
 * filed as capture.
 *
 * So this test says the thing out loud instead of inferring it: MOSS's keydown handler must land in
 * the CAPTURE list, and nothing of MOSS's may land in the BUBBLE list. `controls.js:225` binds
 * `keydown` on `window` with no third argument at BOOT, so a bubble-phase MOSS handler runs second
 * and the game reads every keystroke while the terminal is up.
 *
 * MUTATION: any of `moss-screen.js:271` → drop the `true`, → `{ capture: false }`, → `false`
 * ⇒ this fails (all three verified). MUTATION 2: `{ capture: true }` ⇒ GREEN, correctly — it is the
 * same registration in a different spelling, which is precisely the pair a text scan cannot tell
 * apart and this assertion can.
 */
test('IX-M11b: the MOSS key handler is registered in the CAPTURE phase, by name', () => {
  const s = setup();
  assert.equal(s.win.capture.length, 0, 'precondition: nothing is registered before MOSS opens');
  assert.equal(s.win.bubble.length, 0, 'precondition: and the bubble list starts empty too');

  s.screen.open();
  assert.equal(s.win.capture.length, 1,
    'MOSS must register its keydown handler in the CAPTURE phase. controls.js binds window keydown '
    + 'in BUBBLE at boot, so a bubble-phase MOSS handler runs SECOND and the game shortcut handler '
    + 'reads every keystroke while the terminal is up.');
  assert.equal(s.win.bubble.length, 0,
    'MOSS put a handler in the BUBBLE phase, where controls.js has already been listening since boot');

  s.screen.close();
  assert.equal(s.win.capture.length, 0, 'and it lets the window go again on close');
});

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

test('the command prompt can be CORRECTED — Backspace, Delete and the caret keys reach the input', () => {
  // The defect this pins: a "any multi-character key cannot type" heuristic swallowed Backspace,
  // Delete, ArrowLeft/Right, Home, End and Tab, so a player who mistyped `open reacotr` had no way
  // back but ESC, which throws the whole line away. `editable()` applies the browser default the
  // handler did or did not suppress, so this fails in node rather than only in Chrome.
  const s = openWithSystems();
  const input = s.screen.inputEl;
  const type = (str) => { for (const ch of str) { const e = keyEvent(ch, { target: input }); s.screen.handleKey(e); editable(input, e); fire(input, 'input'); } };

  type('abcd');
  assert.equal(s.screen.model.prompt, 'abcd');

  for (const k of ['Backspace', 'Backspace']) {
    const e = keyEvent(k, { target: input });
    s.screen.handleKey(e);
    assert.equal(e.defaultPrevented, false, k + ' must reach the input');
    editable(input, e);
    fire(input, 'input');
  }
  assert.equal(input.value, 'ab', 'two backspaces actually deleted two characters');
  assert.equal(s.screen.model.prompt, 'ab', 'and the model followed');

  for (const k of ['ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End', 'Tab']) {
    const e = keyEvent(k, { target: input });
    s.screen.handleKey(e);
    assert.equal(e.defaultPrevented, false, k + ' belongs to the browser inside a text field');
  }
});

test('Tab is never swallowed — KEY_ROUTE leaves it unbound on purpose, so focus traversal lives', () => {
  const s = openWithSystems();
  for (const target of [undefined, s.screen.inputEl]) {
    const e = keyEvent('Tab', { target });
    s.screen.handleKey(e);
    assert.equal(e.defaultPrevented, false, 'Tab from ' + (target ? 'the prompt' : 'the page'));
  }
  assert.equal(s.screen.model.screen, 'ledger');
});

test('only PageUp/PageDown/Space are swallowed on the DOM\'s own account, and never from the prompt', () => {
  // The narrow allowlist that replaced the heuristic: it exists to stop the PAGE scrolling under a
  // declined key. Anything wider starts overriding the model again.
  const s = openWithSystems();
  assert.deepEqual(SCROLL_KEYS, ['PageUp', 'PageDown', ' ', 'Spacebar']);
  s.screen.M = { ...FAKE, keyPress: (m) => ({ model: m, effects: [], handled: false, route: 'pass' }) };
  for (const k of SCROLL_KEYS) {
    const away = keyEvent(k, { target: undefined });
    s.screen.handleKey(away);
    assert.equal(away.defaultPrevented, true, k + ' must not scroll the ledger away');
    const fromPrompt = keyEvent(k, { target: s.screen.inputEl });
    s.screen.handleKey(fromPrompt);
    assert.equal(fromPrompt.defaultPrevented, false, k + ' in the prompt belongs to the browser');
  }
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

test('the guard is BYTE-for-byte the same predicate as controls.js:isTextEntryTarget', () => {
  // It is a deliberate local copy (a `hud → moss-screen → controls → hud` cycle is not worth four
  // lines). A behavioural corpus cannot pin a copy: any branch added to ONE of them over an element
  // the corpus never tries survives it — and the `moss-programs` lane is next and brings a custom
  // editor element, which is exactly that case. So compare the SOURCE, normalized for whitespace:
  // the two are textually identical today, and any edit to either side has to be made to both.
  const body = (src) => {
    const at = src.indexOf('export function isTextEntryTarget');
    assert.ok(at >= 0, 'isTextEntryTarget is exported from both files');
    const open = src.indexOf('{', at);
    let depth = 0, i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(open, i + 1).replace(/\s+/g, ' ').trim();
  };
  const mine = body(readFileSync(join(CLIENT, 'src/ui/moss-screen.js'), 'utf8'));
  const theirs = body(readFileSync(join(CLIENT, 'src/input/controls.js'), 'utf8'));
  assert.equal(mine, theirs,
    'moss-screen.js and controls.js must implement isTextEntryTarget identically');

  // and, belt and braces, they agree behaviourally on the cases we can name
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

/**
 * Where each column's CONTENT actually begins in a rendered line — measured from the line, never
 * assumed. The earlier version of this test computed the fault offset as `COL_AT.fault` (a module
 * constant) inside the loop and asserted the set had one member, which is true by construction: it
 * could not fail. Under the exact mutation that matters — the `⚠` split writing one character too
 * few, so every ATTEND/DEGRADED row's LAST FAULT slides a cell left — all tests stayed green.
 */
function columnStarts(line) {
  const bar = line.indexOf('[');
  const close = line.indexOf(']');
  // the state word is the first run of A-Z after the load column
  const tail = line.slice(COL_AT.load + COLS.load);
  const stateRel = tail.search(/[A-Z]/);
  const state = stateRel < 0 ? -1 : COL_AT.load + COLS.load + stateRel;
  // LAST FAULT is whatever follows the state cell's fixed width
  const fault = state < 0 ? -1 : state + (COL_AT.fault - COL_AT.state);
  return { bar, close, state, fault };
}

test('VS-M2: every ledger line is one fixed-width monospace record — a `--` shifts nothing', () => {
  const s = openWithSystems();
  const lines = rowsOf(s.root).map(lineOf);
  assert.equal(lines.length, 8);

  // Every measured offset must be the SAME on every row, and must equal the declared geometry.
  const seen = { bar: new Set(), close: new Set(), state: new Set(), fault: new Set() };
  for (const line of lines) {
    const at = columnStarts(line);
    for (const k of Object.keys(seen)) seen[k].add(at[k]);
    // the fault cell must begin exactly where the geometry says, measured from the line itself
    assert.equal(line.slice(0, at.fault).length, COL_AT.fault, line);
    const load = line.slice(COL_AT.load, COL_AT.load + COLS.load);
    assert.equal(load, load.trim().padStart(COLS.load), 'the load number is right-aligned: ' + line);
  }
  assert.equal(seen.bar.size, 1, 'the load bar starts in the same cell on every row');
  assert.equal(seen.close.size, 1, 'and ends in the same cell (VS-M4: exactly 8 inner cells)');
  assert.equal(seen.state.size, 1, 'STATE begins in the same cell on every row');
  assert.equal(seen.fault.size, 1, 'LAST FAULT begins in the same cell on every row');
  assert.equal([...seen.bar][0], COL_AT.bar);
  assert.equal([...seen.close][0], COL_AT.bar + COLS.bar - 1);
  assert.equal([...seen.state][0], COL_AT.state);
  assert.equal([...seen.fault][0], COL_AT.fault);

  // the fixture mixes warned and unwarned rows, which is what makes the ⚠ split testable at all
  assert.ok(lines.some((l) => l.includes('⚠')) && lines.some((l) => !l.includes('⚠')));

  // the `--` row (nav_sensors carries load -1) uses an EMPTY bar and still lines up
  const navLine = lines[7];
  assert.equal(navLine.slice(COL_AT.bar, COL_AT.bar + COLS.bar), '[        ]');
  assert.equal(navLine.slice(COL_AT.load, COL_AT.load + COLS.load), '  --');
  assert.deepEqual(columnStarts(navLine), columnStarts(lines[0]),
    'a `--` row and a loaded row put every column in the same cell');
});

test('DA-M1: a row whose state the wire did not carry reads UNKNOWN, never NOMINAL', () => {
  // The whole point of this screen. An unreadable row must not be dressed as a healthy one — and
  // the decoder that used to live in `messages.js` defaulted state to 0 (NOMINAL) with a green test
  // pinning it, which is exactly the invention DA-M1 forbids. Row normalization now has ONE home
  // (`moss-model.js:rowObj`), and this asserts what reaches the pixels.
  const s = setup();
  s.screen.onSystems({ type: 'systems', hull: 'X', day: 1, uptime: 10,
    rows: [['mystery', 'MYSTERY']] }); // no load, no state, no fault
  s.screen.open();
  const line = lineOf(rowsOf(s.root)[0]);
  assert.ok(line.includes('UNKNOWN'), line);
  assert.ok(!line.includes('NOMINAL'), 'an unreadable row must never read as healthy');
  assert.ok(line.includes('[        ]'), 'and its load bar is empty, not zero');
  assert.ok(line.includes('  --') && line.includes('—'), line);
});

test('VS-M2: the ⚠ split writes the state cell at its exact declared width', () => {
  // The one place alignment can realistically break: `_ledgerLine` splits the state cell into three
  // nodes so the ⚠ can be width-pinned, and a slice arithmetic slip there shifts LAST FAULT on
  // warned rows only — invisible to any assertion that reads the geometry constants back.
  const s = openWithSystems();
  const rows = rowsOf(s.root);
  const view = FAKE.ledgerView(s.screen.model);
  rows.forEach((el, i) => {
    const cell = el.oneClass('c-state').textContent;
    assert.equal(cell.length, COLS.state, `row ${i} state cell width`);
    assert.equal(cell.trimEnd(), view.rows[i].stateText + (view.rows[i].warn ? ' ⚠' : ''),
      `row ${i} state cell content`);
  });
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
  assert.equal(s.root.oneClass('moss-thead'), null,
    'and no column head — it would imply a table is about to appear beneath it');
  // and the moment telemetry lands, the real table replaces it
  s.screen.onSystems(msgOf('systems'));
  assert.equal(rowsOf(s.root).length, 8);
  assert.equal(s.root.oneClass('moss-nolink'), null);
  assert.ok(s.root.oneClass('moss-thead'), 'the column head returns with the rows');
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

test('IX-M22: the DERIVATION is the host\'s, carried by the model — and NOTHING while loading', () => {
  // §1.2 puts a `derivation` string on the ev:sys reply and the MODEL keeps it. The screen holds no
  // derivation state of its own: a client that explained the host's maths from its own table is
  // precisely the drift MECHANICS.md §13 catalogues, and a second cache here would be a second
  // authority. While `loading`, `LOADING…` is the whole render — a notes block drawn early would
  // claim an explanation the screen has not been given.
  const s = openWithSystems();
  s.screen.handleKey(keyEvent('ArrowDown'));
  s.screen.handleKey(keyEvent('Enter'));
  assert.ok(s.root.oneClass('moss-loading'));
  assert.equal(s.root.oneClass('moss-notes'), null, 'no notes block while loading');
  assert.equal(s.root.byClass('moss-note').length, 0);

  // ...and the screen refuses on its OWN account, not merely because the model returned none:
  // `LOADING…` is the whole render for that frame, so a model handing over stale prose is ignored.
  const stale = { ...FAKE, detailView: (m) => ({ ...FAKE.detailView(m), notes: ['STALE PROSE'] }) };
  const saved = s.screen.M;
  s.screen.M = stale;
  s.screen.render();
  assert.equal(s.root.byClass('moss-note').length, 0, 'the DOM draws no notes while loading');
  s.screen.M = saved;

  s.screen.onMossEvent({ ...msgOf('moss', 'sys'), derivation: 'WORST-ROOM CO2 PPM, MEASURED.' });
  const notes = s.root.byClass('moss-note').map((e) => e.textContent);
  assert.equal(notes[0], 'WORST-ROOM CO2 PPM, MEASURED.', 'the host\'s own account, verbatim');
  assert.equal(notes.length, 2, 'the §5.1 fault caveat still trails it');

  // the fixture's own reply carries the host's prose, as the amended §1.2 says it must
  s.screen.escape();
  s.screen.handleKey(keyEvent('Enter'));
  s.screen.onMossEvent(msgOf('moss', 'sys'));
  assert.ok(s.root.byClass('moss-note')[0].textContent.includes('WORST-ROOM CO2 PPM'));

  // ...and an older host that sends none says so rather than the client inventing one
  const stripped = { ...msgOf('moss', 'sys') };
  delete stripped.derivation;
  s.screen.escape();
  s.screen.handleKey(keyEvent('Enter'));
  s.screen.onMossEvent(stripped);
  const bare = s.root.byClass('moss-note').map((e) => e.textContent);
  assert.ok(bare[0].includes('DERIVATION UNDOCUMENTED'), bare[0]);
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
  // the shipped IDE (a real <textarea>) mounts on selection — the old "editor not installed"
  // placeholder is gone (moss-programs lane).
  assert.ok(s.root.oneClass('moss-prog-code'), 'the embedded editor mounts with a real textarea');
});

test('IX-M6: attachProgramEditor swaps in a supplied editor, mounted with the selected tid', () => {
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
//
// ⚠️ AND "DELETING ONE IS RED" WAS ONLY HALF TRUE UNTIL THE STRIPPER WENT IN. Every scan below read
// styles.css RAW, so COMMENTING a rule out — the ordinary way a rule is disabled during a layout
// experiment, and the ordinary way one gets left disabled — kept the substring present and the
// assertion green with the rule inert in the browser. `CLAUDE.md` trap 1, in CSS, five times in one
// section. Both other CSS readers in this suite already stripped (`relations-view.test.js:78`,
// `console-carryover.test.js:74`); this file was the outlier. Every read now goes through the
// SHARED `cssCodeOnly`, and the negative control below is what stops the fix from rotting — without
// it, the next person to widen a scan has nothing telling them prose must not satisfy it.

/**
 * THE NEGATIVE CONTROL for the stripper the four scans below now share. `CLAUDE.md` trap 1 says the
 * countermeasure has TWO required halves — strip comments quote-aware, AND prove a commented-out
 * occurrence does not trip the scan — because a stripper with no control is a claim, and because a
 * guard that fires on prose teaches people to delete explanatory comments to appease a test.
 *
 * Leg 1 is the one that matters: it takes the REAL stylesheet, comments out the real `.moss-crt`
 * rule the way a person would, and asserts VS-M5's own matcher no longer finds it. Leg 2 is the
 * quote-awareness bound — `content: "/*"` must not open a comment and eat the rule after it, which
 * a naive `replace(/\/\*[\s\S]*?\*\//g,'')` does. Leg 3 is the anti-over-reach half: real rules
 * survive byte-for-byte.
 */
test('the CSS stripper: a commented-out rule does not satisfy a scan, and quotes do not blind it', () => {
  const raw = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const CRT = /\.moss-crt\{([^}]*)\}/;

  // NON-VACUITY FIRST: the matcher must find the rule in the real sheet, or leg 1 proves nothing.
  assert.ok(CRT.exec(cssCodeOnly(raw)), 'precondition: VS-M5 matches the live .moss-crt rule');

  // 1. blind the real rule the way a layout experiment would, and watch the scan stop finding it.
  const live = CRT.exec(raw)[0];
  const blinded = raw.replace(live, '/* ' + live + ' */');
  assert.ok(!CRT.exec(cssCodeOnly(blinded)),
    'a COMMENTED-OUT .moss-crt rule still satisfied VS-M5. The rule is inert in the browser and '
    + 'the guard is green — CLAUDE.md trap 1, which is why every read here is stripped.');
  assert.ok(CRT.exec(blinded),
    'control on the control: the raw text DOES still contain the rule, so the line above is '
    + 'measuring the stripper and not a typo in the fixture');

  // 2. quote-awareness: a comment marker inside a CSS string must not open a comment.
  const quoted = '.a::before{content:"/*"}\n.moss-crt{pointer-events:none}\n';
  assert.ok(CRT.exec(cssCodeOnly(quoted)),
    'a `content: "/*"` string swallowed the rule after it — the stripper is not quote-aware, and '
    + 'every scan downstream of it would pass vacuously on a sheet that contains one');

  // 3. and it must not over-reach: ordinary declarations come through untouched.
  assert.equal(cssCodeOnly('.x{color:red}'), '.x{color:red}');
  assert.equal(cssCodeOnly('.x{/*c*/color:red}'), '.x{ color:red}');
});

test('VS-M10: reduced motion turns the block cursor steady', () => {
  const css = cssCodeOnly(readFileSync(join(CLIENT, 'styles.css'), 'utf8'));
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.moss-cursor\s*\{([^}]*)\}/.exec(css);
  assert.ok(block, 'the MOSS reduced-motion block exists');
  assert.match(block[1], /animation\s*:\s*none/);
});

test('VS-M9: the responsive floor drops LAST FAULT before any other column, and never scrolls x', () => {
  const css = cssCodeOnly(readFileSync(join(CLIENT, 'styles.css'), 'utf8'));
  const mq = /@media\s*\(max-width:\s*1023px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(mq, 'a below-1024 breakpoint exists');
  assert.match(mq[1], /\.c-fault\s*\{[^}]*display\s*:\s*none/, 'the fault column is what drops');
  assert.doesNotMatch(mq[1], /\.c-label\s*\{[^}]*display\s*:\s*none/, 'and never the label');
  assert.match(css, /\.moss\{[\s\S]*?overflow:hidden/, '.moss clips its own axes');
  assert.match(css, /\.moss-body\{[^}]*overflow-x:hidden/, 'the body never scrolls the page sideways');
  // above the floor, the fault column truncates rather than pushing the row wide
  assert.match(css, /\.moss-row \.c-fault\{[^}]*text-overflow:ellipsis/);
});

test('VS-M4a: the bar cell stays width-pinned, so a `--` row does not drift the columns after it', () => {
  const css = cssCodeOnly(readFileSync(join(CLIENT, 'styles.css'), 'utf8'));
  // The block/stipple glyphs come from a fallback face, so `[████▒▒▒▒]` and `[        ]` do not
  // advance identically; without this pin every column after the bar sat ~1.2px out on the `load:-1`
  // row. Measured, not reasoned — and it was the one recorded deviation with no guard, so a future
  // tidy-up could have deleted the rule with the whole suite staying green.
  assert.match(css, /\.moss-row \.c-bar\{[^}]*width:calc\(12ch/,
    'VS-M4a pins .c-bar in ch — deleting it silently re-drifts the `--` row');
});

test('VS-M5: the CRT treatment is ONE non-interactive overlay, never a per-character effect', () => {
  const css = cssCodeOnly(readFileSync(join(CLIENT, 'styles.css'), 'utf8'));
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
