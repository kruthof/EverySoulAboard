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
  isTextEntryTarget, SCROLL_KEYS, shouldFollowTail, TAIL_SLACK_PX,
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

/**
 * Reach a screen the way a player now has to (OD-P, 2026-07-31): TYPE the command and press Enter.
 * `L` and `P` are deleted, so every navigation below that used to be one keystroke is a typed line
 * — which is the point of the ruling, and driving it through `inputEl` + a real Enter keydown keeps
 * these tests exercising the DOM path (input event → editPrompt → routing → submit) end to end.
 * @param {object} s @param {string} text
 */
function typeCmd(s, text) {
  const input = s.screen.inputEl;
  input.value = text;
  fire(input, 'input');
  s.screen.handleKey(keyEvent('Enter', { target: input }));
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

test('OD-P: `l` and `p` are TYPED on an empty buffer — the screens are reached by a typed command', () => {
  // The owner's report: *"I do not like these shortcuts like 'L' or 'P' … as soon as we press l,
  // the log opens."* MOSS is the ship's OS, so the console is a real terminal. This is the DOM half
  // of the contract: the key is not swallowed, `editable` applies the browser default the handler
  // left alone, and the character is in the input AND in the model buffer.
  const s = openWithSystems();
  const input = s.screen.inputEl;
  for (const ch of ['l', 'p']) {
    // ⚠️ EACH LETTER IS TRIED ON AN EMPTY BUFFER, and the first version of this test was not.
    // Typing `l` then `p` proves nothing about `p`: the typed-buffer column was ALWAYS `pass`, so
    // the second letter passes even with its hotkey fully restored. MEASURED — the named mutation
    // "restore P only" left this test GREEN until the buffer was cleared between the two.
    input.value = '';
    fire(input, 'input');
    assert.equal(s.screen.model.prompt, '', 'precondition: the buffer is empty for ' + ch);

    const e = keyEvent(ch, { target: input });
    s.screen.handleKey(e);
    assert.equal(e.defaultPrevented, false, ch + ' must reach the input, not be swallowed');
    editable(input, e);
    fire(input, 'input');
    assert.equal(input.value, ch, ch + ' was typed into the command line');
    assert.equal(s.screen.model.prompt, ch, 'and the model buffer followed');
    assert.equal(s.screen.model.screen, 'ledger', ch + ' opened a screen');
    assert.equal(s.root.oneClass('moss-echo').textContent, ch, 'and the echo shows it');
  }

  // …and the typed command is what navigates. `log` + Enter opens the FAULT LOG.
  s.screen.escape();
  typeCmd(s, 'log');
  assert.equal(s.screen.model.screen, 'faultlog', '`log` + ENTER opens the FAULT LOG');
  s.screen.escape();
  typeCmd(s, 'prog');
  assert.equal(s.screen.model.screen, 'program', '`prog` + ENTER opens PROGRAM');
});

test('OD-P: `l` mid-command is still just a character (the old typed-buffer leg, unchanged)', () => {
  const s = openWithSystems();
  s.screen.inputEl.value = 'open ';
  fire(s.screen.inputEl, 'input');
  const e = keyEvent('l');
  s.screen.handleKey(e);
  assert.equal(s.screen.model.screen, 'ledger', 'mid-command, L is a character not a hotkey');
  assert.equal(e.defaultPrevented, false, 'so the input must be allowed to receive it');
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
  typeCmd(s, 'log');
  assert.notEqual(s.screen.footEl.textContent, ledgerHints, 'the FAULT LOG has its own hints');
  assert.ok(s.screen.footEl.textContent.includes('[ESC]'));
  // OD-P: no hint may advertise a single LETTER key again — the screens are typed commands now.
  assert.ok(!/\[[A-Za-z]\]/.test(ledgerHints), 'a single-letter key hint survives on the LEDGER');
  assert.ok(!/\[[A-Za-z]\]/.test(s.screen.footEl.textContent), 'and one on the FAULT LOG');
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

test('IX-M5: `log` opens the FAULT LOG; from DETAIL it is filtered to that system', () => {
  const s = openWithSystems();
  s.screen.onChron(msgOf('chron'));
  typeCmd(s, 'log');
  assert.equal(s.screen.model.screen, 'faultlog');
  assert.equal(s.screen.model.filterId, null, 'from the LEDGER it opens unfiltered (null, not "")');
  // The fixture's chronicle carries 3 LINES over 2 days; its 2 day headlines are not rows (each is
  // one of its own day's lines re-stamped — see `reduceChron`), and the live `log` tail is not a
  // second section beneath them (it is the same ring; reading both printed the tail twice).
  // ⚠️ FILED, not fixed here: this fixture emits its days NEWEST-FIRST, which the host never does
  // (`Chronicle.Render` emits ascending), so the row order asserted below is the fixture's, not the
  // ship's. The day STAMPS are still the fixture's own and that is what this leg checks.
  const entries = s.root.byClass('moss-logrow').map((e) => e.textContent);
  assert.equal(entries.length, 3);
  assert.ok(entries[0].startsWith('DAY 212'), entries[0]);
  assert.ok(entries[entries.length - 1].startsWith('DAY 213'));
  assert.ok(s.root.oneClass('moss-note').textContent.includes('NOT THE CURRENT PROBLEM'),
    '§5.1: the column must not imply a live diagnosis');

  s.screen.escape(); // back — ESC is the close verb now that `L` no longer toggles
  s.screen.handleKey(keyEvent('Enter')); // DETAIL for reactor
  typeCmd(s, 'log');                     // typed ON DETAIL: the line must submit from there too
  assert.equal(s.screen.model.filterId, 'reactor', 'from DETAIL it is filtered to that system');
  // the model's own title already names the system — the DOM must not print it a second time
  const head = s.root.oneClass('moss-subhead').textContent;
  assert.ok(head.includes('REACTOR'), head);
  assert.equal(head.split('REACTOR').length - 1, 1, 'the filtered system is named exactly once');
});

test('⭐ the rendered fault log lists each fault ONCE, with the live tail also folded in', () => {
  // The DOM half of the session-E defect. `chron` and the `log` tail are two costumes of the SAME
  // history ring, so the screen that renders both renders the newest entries twice — and THIS is
  // the leg that sees it: the model test above can only see the view-model, and the earlier DOM
  // leg fed `onChron` alone, so the concatenation was invisible to it (measured: restoring the
  // concatenation in the test double left every existing DOM assertion green).
  const s = openWithSystems();
  const chron = msgOf('chron');
  // A tail that IS a suffix of that chronicle — the shape `GameSession.BuildLog` actually sends.
  const tailTexts = chron.days[0].lines;
  s.screen.onChron(chron);
  s.screen.onLog({ type: 'log', lines: tailTexts.map((t, i) => 'D213.' + (10 + i) + ' ' + t) });
  typeCmd(s, 'log');
  const rows = s.root.byClass('moss-logrow').map((e) => e.textContent);
  assert.equal(rows.length, 3, 'three ring entries, three rows: ' + rows.join(' | '));
  for (const t of tailTexts) {
    assert.equal(rows.filter((r) => r.includes(t)).length, 1,
      'listed more than once on screen: ' + t);
  }
  // Non-vacuity in the INCLUSION direction: the tail's lines really are on screen (a fault log that
  // simply dropped them would satisfy the count above).
  for (const t of tailTexts) assert.ok(rows.some((r) => r.includes(t)), 'missing from the screen: ' + t);
});

test('an empty fault log says so rather than rendering a blank pane', () => {
  const s = openWithSystems();
  typeCmd(s, 'log');
  assert.ok(s.root.oneClass('moss-empty').textContent.includes('NO ATTRIBUTABLE FAULTS'));
});

test('…but a ship with faults and no chronicle YET shows the tail, not that sentence', () => {
  // IX-M4 honesty at the surface: opening the log REQUESTS `chron`, and between the ask and the
  // reply the only record the client holds is the live tail. Rendering "NO ATTRIBUTABLE FAULTS ON
  // RECORD" over fourteen of them would be the screen lying about the ship.
  const s = openWithSystems();
  s.screen.onLog({ type: 'log', lines: ['D213.10 Scrubber sc_galley ran at 2.3x nameplate all shift.'] });
  typeCmd(s, 'log');
  assert.equal(s.root.byClass('moss-empty').length, 0, 'the pane must not claim an empty record');
  const rows = s.root.byClass('moss-logrow').map((e) => e.textContent);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].startsWith('DAY 213'), rows[0]);
  assert.ok(rows[0].includes('Scrubber sc_galley ran at 2.3x nameplate all shift.'), rows[0]);
});

// ---------------- IX-M6: PROGRAM (the shell + directory; the IDE is the follow-up lane) ----------

test('IX-M6: `prog` opens the PROGRAM directory; selecting a terminal requests its source', () => {
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }, { tid: 'aft', deck: 1 }]);
  typeCmd(s, 'prog');
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
  typeCmd(s, 'prog');
  s.screen.selectProgram('bridge');
  assert.deepEqual(mounted.slice(-1), ['bridge']);
  assert.ok(s.root.oneClass('moss-prog-editor').textContent.includes('IDE bridge'));
});

// ---------------- M3-17: the owner's keyboard defects (2026-07-31 live play) ----------------
//
// TWO reports, one lane:
//   A. "writing code in this frame is nearly impossible — only when I left click while writing and
//      only for a few seconds."   → every render MOVED `programMount`, and moving a node blurs the
//      focused element inside it. A wire message arrives every few seconds, hence "a few seconds".
//   B. "The MOSS CLI does not work, i.e. I cannot type anything."  → a declined printable key is
//      left to "the browser's text editing", which inserts it into the FOCUSED element — nowhere
//      at all when focus is not the prompt, while rule 2 has already starved controls.js of it.
//
// WHAT THE HARNESS CAN AND CANNOT SEE. There is no jsdom here (see dom-lite.js's header). Focus is
// modelled by this package to the depth the browser was MEASURED at over CDP — a removal blurs what
// is focused inside it, a hidden element cannot take focus — and every claim below was checked
// against real Chrome first (`client/tools/moss-preview.html`, trusted keys via CDP). What node
// still cannot show is the browser DEFAULT ACTION delivering the character into the newly focused
// input: `dom-lite`'s `editable()` applies that default explicitly, so leg 3 of the typing test
// says "the key was not swallowed AND focus is on the input", which is the pair that makes the
// insertion happen — not a claim that node performed it.
//
// ⚠️ FOCUS IS ASSERTED BY NAME, NEVER BY ELEMENT IDENTITY — not a style preference, MEASURED.
// `assert.equal(doc.activeElement, someElement)` builds its failure message by inspecting BOTH
// values, and a dom-lite element is a cyclic graph (`parentNode` ↔ `childNodes`) hundreds of nodes
// wide. The first version of these tests did exactly that, and the mutation that was supposed to
// redden them instead pinned a core at ~110% CPU and 30% of RAM and printed NOTHING — the guard
// could not report its own failure, which is the fifth trap's family (a test that cannot say it
// failed). `focusProbe` maps the few elements that matter to short labels, so a failure is one line.

/** @param {object} s @param {Array<[object,string]>} [named] element → label */
function focusProbe(s, named) {
  const names = new Map(named || []);
  names.set(s.screen.inputEl, 'prompt');
  return () => {
    const a = s.doc.activeElement;
    if (!a) return 'none';
    return names.get(a) || (String(a.tagName).toLowerCase() + '.' + (a.className || ''));
  };
}

test('M3-17/A: a render on the PROGRAM screen does not blur the editor (wire message or key)', () => {
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'term_moss', deck: 0 }, { tid: 'term_nav', deck: 1 }]);
  typeCmd(s, 'prog');
  s.screen.selectProgram('term_moss');
  const code = s.root.oneClass('moss-prog-code');
  assert.ok(code, 'precondition: the IDE textarea is mounted');
  const at = focusProbe(s, [[code, 'editor']]);

  code.focus();
  code.setSelectionRange(2, 5);
  assert.equal(at(), 'editor', 'precondition: the editor has focus');

  // 1. a WIRE message — the live-play trigger (systems/log/chron land every few seconds)
  s.screen.onSystems(msgOf('systems'));
  assert.equal(at(), 'editor',
    'a systems message blurred the PROGRAM editor. This is the owner\'s "only for a few seconds": '
    + 'the render re-parented programMount, and moving a node blurs what is focused inside it.');
  assert.deepEqual([code.selectionStart, code.selectionEnd], [2, 5], 'and the selection survived');

  // 2. a same-tid program event — `source|diag|audit|rterror` all repaint the editor in place
  s.screen.onMossEvent({ type: 'moss', ev: 'audit', tid: 'term_moss', lines: [[10, 'vent opened']] });
  assert.equal(at(), 'editor', 'a same-tid program event must repaint in place, not blur');

  // 3. and a bare render, which is what every other path funnels into
  s.screen.render();
  assert.equal(at(), 'editor', 'a plain render blurred the editor');
});

test('M3-17/A: the STRUCTURAL pin — render never moves programMount and never re-inserts the wrap', () => {
  // Survives even if the focus model above is ever judged too shallow: it asserts the DOM identity
  // that makes the blur impossible in the first place.
  //
  // ⚠️ `parentNode` BEFORE/AFTER IS NOT ENOUGH, and the ninth trap says to name what an instrument
  // cannot see. Measured in Chrome: `parent.replaceChildren(sameNode)` removes and re-inserts the
  // node — it BLURS — and leaves `parentNode` identical, so a same-parent assertion passes on a
  // screen that is still broken. `_detachCount` (dom-lite) counts the REMOVAL itself, which is the
  // event that matters, and covers both spellings.
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'term_moss', deck: 0 }]);
  typeCmd(s, 'prog');
  s.screen.selectProgram('term_moss');
  const mount = s.screen.programMount;
  const mountParent = mount.parentNode;
  const wrap = s.screen.bodyEl.childNodes[0];
  const code = s.root.oneClass('moss-prog-code');
  const detaches = () => [mount._detachCount | 0, wrap._detachCount | 0, code._detachCount | 0];
  const base = detaches();

  s.screen.onSystems(msgOf('systems'));
  s.screen.setTerminals([{ tid: 'term_moss', deck: 0 }, { tid: 'term_nav', deck: 1 }]);
  s.screen.render();

  // `assert.ok(a === b)` rather than `assert.equal(a, b)`: see focusProbe's note — comparing two
  // dom-lite elements with `assert.equal` makes a FAILURE inspect a cyclic tree and hang.
  assert.ok(s.screen.programMount === mount, 'the mount div is created once');
  assert.ok(mount.parentNode === mountParent, 'and is never re-parented by a render');
  assert.ok(s.screen.bodyEl.childNodes[0] === wrap, 'the PROGRAM wrap stays the body\'s one child');
  assert.deepEqual(detaches(), base,
    'a render REMOVED the editor subtree from the document (mount/wrap/textarea detach counts '
    + 'moved). Re-inserting it does not give focus back — this is the owner\'s defect, and it is '
    + 'true of `replaceChildren(sameNode)` as much as of a move to a new parent.');
  assert.ok(s.root.oneClass('moss-prog-code') === code, 'and the textarea node itself is the same one');
  assert.equal(s.root.byClass('moss-prog-row').length, 2, 'while the DIRECTORY did re-render');
});

test('M3-17/A: PROGRAM → ESC → LEDGER → P returns to the SAME editor, and it still does not blur', () => {
  // The attach-only-when-absent branch's most likely regression: leaving the screen legitimately
  // detaches the wrap (the LEDGER render replaces the body), so coming back must re-attach the SAME
  // subtree rather than build a new one. If it rebuilds, the draft and the selected row are gone and
  // the blur is back — with every other test still green, because they never leave the screen.
  const s = openWithSystems();
  s.screen.setTerminals([{ tid: 'term_moss', deck: 0 }, { tid: 'term_nav', deck: 1 }]);
  typeCmd(s, 'prog');
  s.screen.selectProgram('term_nav');
  const wrap = s.screen.programWrap;
  const mount = s.screen.programMount;
  const code = s.root.oneClass('moss-prog-code');
  code.value = 'when reactor.temp > 900:';
  fire(code, 'input');                                   // → editProgramDraft, the live buffer

  s.screen.escape();                                     // PROGRAM → LEDGER (the body is replaced)
  assert.equal(s.screen.model.screen, 'ledger');
  assert.equal(s.root.oneClass('moss-prog-code'), null, 'the editor really did leave the document');

  typeCmd(s, 'prog');                                    // …and back
  const at = focusProbe(s, [[code, 'editor']]);
  assert.ok(s.screen.programWrap === wrap, 'the PROGRAM wrap is the same object, not a rebuild');
  assert.ok(s.screen.programMount === mount, 'and so is the mount');
  assert.ok(s.root.oneClass('moss-prog-code') === code, 'and the textarea, with its buffer');
  assert.equal(code.value, 'when reactor.temp > 900:', 'the draft survived the round trip');
  assert.equal(s.root.byClass('moss-prog-row')[1].classList.contains('sel'), true,
    'and the selected terminal is still marked');

  code.focus();
  s.screen.onSystems(msgOf('systems'));
  assert.equal(at(), 'editor', 'a wire render after the round trip blurred the editor');
});

test('M3-17/B: opening MOSS puts focus on the prompt — the takeover first, then the focus', () => {
  // Mirrors hud.js:reflectMossView, which caches channels into the screen and THEN opens it.
  const s = setup();
  const at = focusProbe(s);
  s.screen.setTerminals([{ tid: 'term_moss', deck: 0 }]);
  s.screen.onSystems(msgOf('systems'));
  s.screen.onChron(msgOf('chron'));
  assert.equal(at(), 'none', 'precondition: nothing is focused before MOSS opens');

  s.screen.open();
  assert.equal(at(), 'prompt',
    'the command prompt must hold focus the instant MOSS is up, or the first keystroke is lost. '
    + 'If open() focuses BEFORE applyTakeover, #moss-view is still hidden and focus() is a no-op.');
});

test('M3-17/B: a printable key with focus anywhere else lands in the prompt; hotkeys still fire', () => {
  const s = openWithSystems();
  const input = s.screen.inputEl;
  // Focus somewhere that is not a text surface — the state the player is in after clicking the tab
  // button that opened MOSS, or after any render that blurred the prompt.
  const elsewhere = s.doc.createElement('button');
  s.doc.body.appendChild(elsewhere);
  const at = focusProbe(s, [[elsewhere, 'button']]);
  elsewhere.focus();
  assert.equal(at(), 'button', 'precondition: the prompt does NOT have focus');

  // 1. a key the TABLE still routes is still a hotkey (IX-M8's table remains the authority).
  //    ⚠️ The subject used to be `l`, and OD-P made it a plain character — so this leg had to move
  //    to a key that is genuinely still routed, or it would assert "a declined key does not pull
  //    focus" while claiming to assert the opposite (leg 2's job, done twice, and leg 1 dead).
  const hot = keyEvent('ArrowDown', { target: elsewhere });
  s.screen.handleKey(hot);
  assert.equal(s.screen.model.selectedId, 'life_support', '↓ still moves the ledger cursor');
  assert.equal(hot.defaultPrevented, true, 'and is swallowed, not typed');
  assert.equal(at(), 'button',
    'a key the MODEL took must not also pull focus into the prompt — rule 5 fires only on a '
    + 'DECLINED key, or it would be a second authority over IX-M8\'s table');

  // 1b. …and the letter that used to sit here is now the OTHER case: declined, focus pulled in.
  const letter = keyEvent('l', { target: elsewhere });
  s.screen.handleKey(letter);
  assert.equal(letter.defaultPrevented, false, 'OD-P: `l` is a character, so it must not be eaten');
  assert.equal(s.screen.model.screen, 'ledger', 'and it must not have opened the FAULT LOG');
  assert.equal(at(), 'prompt', 'rule 5 delivered it to the command line');
  // (no ESC back here: neither leg left the LEDGER, and ESC on the LEDGER with an empty stack EXITS
  // MOSS — after which `handleKey` returns early and every leg below passes vacuously.)

  // 2. a DECLINED printable key moves focus to the prompt and is NOT swallowed, which is the pair
  //    that makes the browser insert it there. `editable` applies that default action explicitly.
  elsewhere.focus();
  const e = keyEvent('o', { target: elsewhere });
  s.screen.handleKey(e);
  assert.equal(e.defaultPrevented, false, 'the character must NOT be swallowed');
  assert.equal(at(), 'prompt',
    'a typed character reached MOSS, was declined by the model, and was inserted NOWHERE: MOSS '
    + 'stopped it reaching controls.js and left it to a browser default that had no text field to '
    + 'act on. That is "I cannot type anything".');
  editable(input, e);
  fire(input, 'input');
  assert.equal(s.screen.model.prompt, 'o', 'and the buffer took it');

  // 3. it stands down where it must: no chords, no Tab, no scroll keys
  for (const [key, extra] of [['o', { ctrlKey: true }], ['o', { altKey: true }],
    ['o', { metaKey: true }], ['o', { metaKey: true, ctrlKey: true, altKey: true }],
    ['Tab', {}], [' ', {}]]) {
    elsewhere.focus();
    s.screen.handleKey(keyEvent(key, { target: elsewhere, ...extra }));
    assert.equal(at(), 'button',
      `${extra.ctrlKey ? 'Ctrl+' : ''}${extra.altKey ? 'Alt+' : ''}${extra.metaKey ? 'Meta+' : ''}`
      + `${key} must not pull focus into the prompt`);
  }

  // 4. and a key out of the IDE textarea is never touched (rule 1 still returns first)
  const fake = { tagName: 'TEXTAREA' };
  const fromEditor = keyEvent('o', { target: fake });
  s.screen.handleKey(fromEditor);
  assert.equal(fromEditor.defaultPrevented, false);
  assert.equal(at(), 'button', 'focus was not stolen out of a text-entry surface');
});

test('M3-17/B: AltGr is not a chord — `@` on a German layout reaches the prompt', () => {
  // The dev machine is de-DE and so is the owner's. Chrome has no AltGr flag on a keydown: it
  // reports `ctrlKey && altKey`, so a "no Ctrl, no Alt" guard silently refuses `@ { [ ] } \ | ~` —
  // the characters a MOSS command (`open @console`) or a program line (`{`, `[`) begins with. The
  // first keystroke after any focus loss is therefore the one most likely to be one of these.
  const s = openWithSystems();
  const elsewhere = s.doc.createElement('button');
  s.doc.body.appendChild(elsewhere);
  const at = focusProbe(s, [[elsewhere, 'button']]);

  elsewhere.focus();
  const altGr = keyEvent('@', { target: elsewhere, ctrlKey: true, altKey: true });
  s.screen.handleKey(altGr);
  assert.equal(altGr.defaultPrevented, false, 'an AltGr character must not be swallowed');
  assert.equal(at(), 'prompt',
    'AltGr+@ was treated as a Ctrl+Alt chord and left focus where it was, so the character went '
    + 'nowhere. On a German keyboard that is the de-DE half of "I cannot type anything".');
  editable(s.screen.inputEl, altGr);
  fire(s.screen.inputEl, 'input');
  assert.equal(s.screen.model.prompt, '@', 'and the buffer took it');

  // ...while the real chord it is spelled like still stands down (leg 3 covers ctrl-only and
  // alt-only; this is the pair that must NOT be read as AltGr because Meta is in it).
  elsewhere.focus();
  s.screen.handleKey(keyEvent('@', { target: elsewhere, ctrlKey: true, altKey: true, metaKey: true }));
  assert.equal(at(), 'button', 'a Meta chord is never AltGr');
});

test('M3-17/B: an ordinary LEDGER render leaves the prompt focused', () => {
  // The prompt row lives OUTSIDE `.moss-body`, so today no ledger render can blur it. Pinned rather
  // than assumed: a future render that rebuilds the page (or moves the prompt into the body) would
  // re-ship the same defect on the screen the player spends all their time on.
  const s = openWithSystems();
  const at = focusProbe(s);
  assert.equal(at(), 'prompt');
  s.screen.inputEl.value = 'sta';
  fire(s.screen.inputEl, 'input');
  s.screen.onSystems(msgOf('systems'));
  s.screen.onChron(msgOf('chron'));
  s.screen.handleKey(keyEvent('ArrowDown'));      // a HANDLED key → render
  assert.equal(at(), 'prompt', 'the prompt kept focus across renders');
  assert.equal(s.screen.model.prompt, 'sta', 'and the half-typed command survived');
});

test('PROGRAM with no terminals aboard says so', () => {
  const s = openWithSystems();
  typeCmd(s, 'prog');
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

test('M3-17: `commission` addresses the prompt pseudo-terminal, so the SIM resolves the console', () => {
  // `Device.Condition` and `Device.Scriptable` are the two facts OD-N's two tiers turn on and
  // NEITHER has ever reached the client, so a client-picked terminal would be a guess. The host
  // resolves the live console (`MossGate.LiveServer`) and names it back in its own sentence.
  assert.deepEqual(wireForEffect({ k: 'moss', op: 'commission' }),
    { type: 'moss', op: 'commission', tid: '@console' });
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

  // 2. QUOTE-AWARENESS. A comment marker inside a CSS string must not open a comment.
  //
  // ⚠️ THE TRAILING COMMENT IN THIS FIXTURE IS LOAD-BEARING AND THE FIRST VERSION OF THIS LEG DID
  // NOT HAVE IT, so the leg could not fail — this control's own named mutation was dead, inside the
  // package written to hunt dead named mutations. The fixture was
  // `'.a::before{content:"/*"}\n.moss-crt{pointer-events:none}\n'`, which contains NO closing `*/`
  // ANYWHERE. The naive `replace(/\/\*[\s\S]*?\*\//g, '')` the prose names therefore found no match
  // at all, returned the string untouched, and the assertion passed. Measured: substituting that
  // regex for `cssCodeOnly` left the whole client suite green, 280 pass / 0 fail.
  //
  // THE GENERAL RULE, worth more than this fixture: A NEGATIVE CONTROL FOR A COMMENT STRIPPER MUST
  // CONTAIN A LATER REAL COMMENT. The characteristic failure of a non-quote-aware stripper is that
  // it opens a comment at the quoted marker and runs forward to the NEXT terminator, swallowing
  // everything between. With no later terminator there is nothing to run to, so the bug cannot
  // occur and the control measures nothing. (The prose in `code-only.js` is CORRECT about the naive
  // regex in general; it was the fixture that failed to exercise it.)
  const quoted = [
    '.a::before{content:"/*"}',
    '.moss-crt{pointer-events:none}',
    '/* a later, real comment — the terminator a naive stripper runs forward to */',
    '.z{color:red}',
    '',
  ].join('\n');

  assert.ok(CRT.exec(cssCodeOnly(quoted)),
    'a `content: "/*"` string swallowed the rule after it — the stripper is not quote-aware, so it '
    + 'opened a comment inside a string and ran to the next `*/`, deleting real rules on the way. '
    + 'Every scan downstream would then pass vacuously on a sheet containing one such string.');
  // B measures the OPPOSITE direction from A, and its first message said otherwise — corrected
  // rather than quietly reworded, because the wrong version described a swallow that provably
  // cannot reach this rule. `.z` sits PAST the later comment's `*/`, and every stripper defect
  // known to this fixture (naive non-greedy, greedy, and the real scanner with its quote branch
  // removed) terminates AT that `*/` — measured, all three leave `.z` intact. So B cannot catch an
  // over-swallow from the quoted marker; what it catches is a stripper that runs to EOF instead of
  // stopping at the terminator.
  //
  // MEASURED, and recorded so nobody re-derives it: B is DECORATIVE. Deleting it changes no verdict
  // under any of the four mutations. It is kept because an explicit "does not over-reach" assertion
  // reads well beside an "over-reaches" one, not because it is load-bearing.
  assert.match(cssCodeOnly(quoted), /\.z\{color:red\}/,
    'a rule sitting AFTER the later comment\'s terminator was stripped. The stripper ran past the '
    + '`*/` it should have stopped at — the over-reach direction, opposite to the assertion above.');

  // C: the converse of A — a "stripper" that gives up on quotes by stripping NOTHING would satisfy
  // A and B trivially. MEASURED: C is also DECORATIVE, because leg 1 (five lines up) already fails
  // under strips-nothing, so C never executes in that case. Kept deliberately as belt-and-braces on
  // a control that has already been wrong once; do not read it as the catcher for that mutation.
  assert.doesNotMatch(cssCodeOnly(quoted), /a later, real comment/,
    'the later, genuinely-commented-out text SURVIVED the stripper — it is not stripping at all');

  // 3. and it must not over-reach: ordinary declarations come through untouched.
  assert.equal(cssCodeOnly('.x{color:red}'), '.x{color:red}');
  assert.equal(cssCodeOnly('.x{/*c*/color:red}'), '.x{ color:red}');
});

// ⚠️ THE TWO PROPERTIES THAT SURVIVED A MERGE, AND NEITHER WAS PINNED WHERE IT MATTERED.
//
// `lane/palette-overflow` and this lane each independently added a `cssCodeOnly` to `code-only.js`.
// Git combined them WITHOUT A CONFLICT — they landed at different offsets — and the result was a
// duplicate `export` that crashed eight test files. When the two were finally compared behaviourally
// rather than textually, NEITHER WAS A SUPERSET: this lane's emitted a space for a comment and lost
// its line breaks; the other's kept the line breaks and emitted nothing. One property was pinned
// (the space, five lines above); the other was pinned by nobody, on either side, which is exactly
// how it would have been dropped silently in the resolution.
//
// MUTATION: drop `out += ' '` from the comment branch ⇒ RED on leg 1 (and on the pin above).
// MUTATION: drop the `if (src[i] === '\n') out += '\n'` from the comment branch ⇒ RED on leg 2.
test('the CSS stripper: a comment leaves WHITESPACE behind, and keeps its own line breaks', () => {
  // 1. A SPACE, NOT NOTHING. ⚠️ This leg used to justify itself with *"`.a/*x*/.b` is a DESCENDANT
  //    selector in CSS"* — FALSE, and retracted. A CSS comment is not whitespace: the tokenizer
  //    discards it and emits no whitespace token (CSS Syntax L3 §4.3.2), so `.a/*x*/.b` is the
  //    COMPOUND `.a.b` (Chrome: `selectorText === '.a.b'`; it colours `<i class="a b">`, not a
  //    nested pair). The assertion is unchanged and still right, for the OTHER reason: `cssCodeOnly`
  //    is a TEXT FILTER feeding selector-shaped guards, and emitting nothing FUSES identifiers —
  //    `.rz/*x*/-palette` becomes the string `.rz-palette`, a rule Chrome DROPS as invalid, handed
  //    to the palette guard as the very selector it watches. That is a false positive fabricated out
  //    of thin air. A space can only SPLIT a token, into a selector the guard ignores. Fabricating a
  //    match is unsafe; splitting one is not.
  assert.equal(cssCodeOnly('.a/*x*/.b{color:red}'), '.a .b{color:red}',
    'a comment between two class selectors was deleted rather than replaced with a space, ' +
    'fusing the identifiers either side of it into one');

  // 2. LINE FIDELITY. The stripped sheet must keep the raw sheet's line numbering, or every
  //    `file:line` a guard quotes off it is wrong. Measured on the real styles.css, where the
  //    space-only implementation lost 156 lines.
  const raw = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  const nl = (s) => (s.match(/\n/g) || []).length;
  assert.equal(nl(cssCodeOnly(raw)), nl(raw),
    `the stripped stylesheet has ${nl(cssCodeOnly(raw))} newlines against the raw file's ${nl(raw)}. ` +
    'A comment must re-emit its own line breaks, or line numbers taken off the stripped text drift ' +
    'against the file a reader opens.');
  // …and the same property in isolation, so a failure says WHICH behaviour broke rather than only
  // that the totals disagree.
  assert.equal(cssCodeOnly('.x{/*a\nb\nc*/color:red}'), '.x{\n\n color:red}',
    'a multi-line comment did not re-emit its line breaks');
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

// ═══════════════════════════════════════════════ M3-4 — THE POD BAY, on the DOM
//
// ⚠️ THESE DRIVE THE SHIPPING MODEL, NOT THE DOUBLE. Every other test in this file uses
// `moss-model-fake.js`, which is right for a lane that had to render against a stub. The bay is a
// JOIN — what the wire says, what the model decides, what the DOM draws — and a fake that agreed
// with the screen would prove the two halves of one lane agree with each other. The `moss-shot.mjs`
// PROGRAM phase set this precedent for exactly the same reason.

import * as REAL from '../src/ui/moss-model.js';
import { POD_COLS, POD_HEAD_LINE, POD_REFRESH_MS, POD_POLL_STALE } from '../src/ui/moss-screen.js';

// ⚠️ `pod_ozawa`'s occupant is `Ozawa-Reyes` ON PURPOSE — see the same note over `PODS_MSG` in
// moss-model.test.js. The click path's message assertion below is the one that has to bite when a
// capsule key is COMPOSED from a display name, and it cannot bite on a fixture that round-trips.
const BAY = {
  type: 'moss', ev: 'pods', tid: '@console', term: 'term_moss', moss: 'COMMISSIONED',
  note: 'HEADROOM FOR 2 CREW — FOOD 60 U, CARRIED AND RESERVED INCLUDED',
  rows: [
    [1, 'pod_rell', 'Rell', 0, 'OPEN', 2, 'POD IS EMPTY — ALREADY THAWED', 0],
    [2, 'pod_ozawa', 'Ozawa-Reyes', 1, 'SEALED', 0, 'READY — 2 SEALS', 1],
    [3, 'pod_vance', 'Vance', 2, 'NO SIGNAL', 3, 'POD — NO SIGNAL', 0],
    [7, 'pod_torres', 'Torres', 1, 'SEALED', 6, 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0', 0],
  ],
};

/** A screen wearing the REAL model, opened, with the bay asked for and answered. */
function bayScreen(msg) {
  const doc = new DocumentLite();
  const root = doc.createElement('div');
  root.hidden = true;
  doc.register('moss-view', root);
  doc.body.appendChild(root);
  const win = makeWindow();
  const sent = [];
  const screen = new MossScreen({ root, document: doc, window: win, model: REAL,
    send: (o) => sent.push(o) });
  screen.open();
  const s = { doc, root, win, sent, screen };
  if (msg !== null) {
    typeCmd(s, 'pods');
    screen.onMossEvent(msg || BAY);
  }
  return s;
}

const podRows = (s) => s.root.byClass('moss-podrow');

test('M3-4: the bay is drawn from the WIRE — and the ASK is recorded at the seam', () => {
  const s = bayScreen(null);
  typeCmd(s, 'pods');
  // MUTATION 1's first half: the MESSAGE, not a text scan (trap 4). A client-side census would
  // need no request at all, and this is the assertion that would then have nothing to see.
  assert.deepEqual(s.sent.slice(-1), [{ type: 'moss', op: 'pods', tid: '@console' }],
    'the bay must be ASKED for; a client-side guess sends nothing');
  assert.equal(s.root.dataset.screen, 'ledger',
    'and the ask alone must not open the screen — the reply does');
  assert.equal(podRows(s).length, 0, 'nothing is drawn from a bay that has not arrived');

  s.screen.onMossEvent(BAY);
  assert.equal(s.root.dataset.screen, 'podbay', 'the reply drew the POD BAY');
  assert.equal(podRows(s).length, BAY.rows.length,
    'MUTATION 1: every row on screen came off the wire, one for one');
});

test('M3-4: each row lays the wire\'s own four columns on the monospace grid', () => {
  const s = bayScreen();
  const line = (i) => podRows(s)[i].textContent;
  assert.match(line(0), /RELL/, 'the occupant is the sim\'s own SleeperName');
  assert.match(line(0), /OPEN/);
  assert.ok(line(3).includes('NEEDS 3 CONTROLLER MODULE — SHIP HAS 0'),
    'MUTATION 3: the reason column is the feature, rendered VERBATIM and never truncated');
  assert.ok(POD_HEAD_LINE.includes('WHY / WHAT IT NEEDS'), 'and the table says what the column is');

  // The grid holds: the state column starts at the same character offset on every row.
  const at = POD_COLS.gutter + POD_COLS.num + POD_COLS.occupant;
  for (let i = 0; i < BAY.rows.length; i++) {
    assert.equal(line(i).slice(at, at + BAY.rows[i][4].length), BAY.rows[i][4],
      'row ' + i + ' is off the grid: ' + JSON.stringify(line(i)));
  }
});

test('M3-4: [THAW] is offered on exactly the rows the GATE allows', () => {
  const s = bayScreen();
  const offered = podRows(s)
    .filter((el) => el.byClass('moss-thaw').length > 0)
    .map((el) => el.dataset.pod);
  assert.deepEqual(offered, ['pod_ozawa'],
    'MUTATION 4: the affordance is `row.can` — the gate\'s own verdict — and nothing else. ' +
    'Deriving it from the STATE word offers three of these four rows.');
  // …and the refused rows are GREYED WITH THEIR REASON, never hidden (RW §2.2).
  const dim = podRows(s).filter((el) => /\bdim\b/.test(el.className)).map((el) => el.dataset.pod);
  assert.deepEqual(dim, ['pod_rell', 'pod_vance']);
});

test('M3-4: clicking [THAW] emits the thaw MESSAGE, addressed to the console the sim resolved', () => {
  const s = bayScreen();
  s.sent.length = 0;
  const btn = podRows(s).find((el) => el.dataset.pod === 'pod_ozawa').byClass('moss-thaw')[0];
  fire(btn, 'click');
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'thaw', tid: 'term_moss', text: 'pod_ozawa' }],
    'recorded at the seam: the tid is the WIRE\'s `term`, not the prompt\'s @console pseudo-tid');
});

test('M3-4: activating a REFUSED capsule sends nothing and prints the gate\'s sentence', () => {
  const s = bayScreen();
  s.sent.length = 0;
  fire(podRows(s).find((el) => el.dataset.pod === 'pod_torres'), 'dblclick');
  assert.deepEqual(s.sent, [], 'the click path may not out-vote the gate');
  const lines = s.root.byClass('moss-cline').map((e) => e.textContent);
  assert.ok(lines.some((t) => t === 'NEEDS 3 CONTROLLER MODULE — SHIP HAS 0'),
    '…and the player is told why, at the point of the click: ' + JSON.stringify(lines.slice(-3)));
});

test('M3-4: the bay POLLS while it is up, and the poll dies with the screen', () => {
  const s = bayScreen();
  assert.equal(s.win.timers.size, 1, 'a cycling badge that never re-asks freezes on the wall');
  assert.equal([...s.win.timers.values()][0].ms, POD_REFRESH_MS);

  s.sent.length = 0;
  s.win.tickTimers();
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'pods', tid: '@console' }], 'the poll re-asks');

  // Leaving the bay stops it — and a poll in flight must never RE-OPEN a screen the player left.
  s.screen.handleKey(keyEvent('Escape'));
  s.screen.escape();
  assert.equal(s.root.dataset.screen, 'ledger', 'precondition: ESC left the bay');
  assert.equal(s.win.timers.size, 0, 'the poll outlived the screen it drew in');
  s.sent.length = 0;
  s.screen.refreshPods();
  assert.deepEqual(s.sent, [], 'a stray refresh off the bay must send nothing');

  s.screen.close();
  assert.equal(s.win.timers.size, 0);
});

test('M3-4: the bay closes its poll when MOSS closes with the bay still up', () => {
  const s = bayScreen();
  assert.equal(s.win.timers.size, 1);
  s.screen.close();
  assert.equal(s.win.timers.size, 0, 'MOSS can be left with the bay open; the timer may not survive it');
});

test('M3-4: the bay\'s keys travel through the SAME capture-phase listener as every other screen', () => {
  const s = bayScreen();
  assert.equal(s.win.capture.length, 1, 'precondition: one capture-phase keydown listener');
  assert.equal(s.win.bubble.length, 0, 'MUTATION 5: registering in the BUBBLE phase lets a game ' +
    'shortcut fire first and silently kills the gesture with this suite green');

  const before = s.screen.model.pods.selectedPod;
  const e = keyEvent('ArrowDown');
  s.win.capture[0](e);                      // exactly what the browser would do
  assert.notEqual(s.screen.model.pods.selectedPod, before,
    'an arrow key on the bay must reach the model through that listener');
  assert.equal(e.defaultPrevented, true, 'and be swallowed, because the model claimed it');
});

test('M3-4: the header states WHICH MOSS state, and the headroom note says which food number', () => {
  const s = bayScreen();
  const term = s.root.byClass('moss-podterm').map((e) => e.textContent);
  assert.deepEqual(term, ['term_moss · COMMISSIONED'],
    'OD-N: the console is DARK, REPAIRED or COMMISSIONED and the header must say which');
  const notes = s.root.byClass('moss-note').map((e) => e.textContent);
  assert.ok(notes.some((t) => /CARRIED AND RESERVED/.test(t)), 'the headroom label reached the screen');
});

test('M3-4: an empty bay says so rather than reading as "everybody is out"', () => {
  const s = bayScreen({ ...BAY, rows: [] });
  assert.equal(podRows(s).length, 0);
  assert.ok(s.root.byClass('moss-empty').map((e) => e.textContent).some((t) => /NO CAPSULES/.test(t)));
});

test('M3-4: the DOM fixture can see the forbidden derivation too (the click path is a second door)', () => {
  // The same guard as moss-model.test.js's, on the OTHER fixture: the click path reaches
  // `thawPod` → `activateThaw` and asserts its own wire message, so BAY has to be shaped to bite
  // as well. Two fixtures, two files, either one tidy-able on its own.
  const compose = (occupant) => 'pod_' + String(occupant).replace(/[A-Z]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 32));
  const offered = BAY.rows.filter((r) => r[7] === 1);
  assert.ok(offered.length > 0, 'precondition: BAY offers at least one capsule');
  assert.ok(offered.some((r) => compose(r[2]) !== r[1]),
    'every offered BAY row round-trips occupant → key, so composing the key from the display ' +
    'name is indistinguishable from reading it, and the click-path message assertion cannot bite');
});

// ═══════════════════════════ THE POD BAY POLL MUST NOT EAT THE TRANSCRIPT (2026-08-04)
//
// ⛔ THE DEFECT, found by review on the moss-autoscroll merge and driven against the shipped host.
// The bay polls at 1 Hz (`POD_REFRESH_MS`) while it is on screen. When MOSS stops being live —
// `Device.Powered` drops in a brownout, or wear takes the console under `MaintainBelow` —
// `GameSession.HandleMoss`'s `pods` arm answers EVERY poll with `Refuse(...)` →
// `MossExec(ok:false,[(2,sentence)])`, and `reduceMossEvent`'s `exec` arm pushes it onto the
// transcript. One unbidden line per second; `CONSOLE_CAP` is 200, so ~3.3 minutes of a bay left
// open erases everything the player had — on the screen the thaw arc is run from.
//
// ⚠️ THE REFUSAL SENTENCE BELOW IS A SAMPLE OF THE SHAPE, NOT A PIN ON THE WORDING — and it is
// written that way because the wording moved UNDER THIS PACKAGE. Probed 2026-08-04 over a plain
// socket against `hosts/web --ship wreck`, a boot-state `{"type":"moss","op":"pods","tid":"@console"}`
// came back `ev:exec ok:false` with `MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO
// REACH THE DOORS`; re-probed on the merged tree an hour later, the SAME request answered `…; REPAIR
// TERM_MOSS ON DECK 0 AT 1,3 TO REACH THE PODS` — the gate-sentences lane had landed on `main` in
// between and now DERIVES the tail per call site. So nothing here asserts the words. What is pinned
// is the SHAPE `MossGate` refuses in (`ev:exec`, `ok:false`, one stream-2 line) and the COUNTS, and
// the sentence is only ever compared against itself.
// ⛔ THAT PROBE ALSO CORRECTS A PREMISE WORTH RECORDING: on the BOOT wreck the bay cannot be opened
// at all (the ask is refused, and `reducePods` is the only thing that moves the screen to PODBAY),
// so the defect's window is a bay opened while the ship was live that then goes dark under the
// player — not a cold boot.
//
// ⭐ WHAT IS PINNED HERE, and what deliberately is not. The fix is on the SEND side: after one
// unanswered period the poll stands down. So the assertions are about the two counts that matter —
// how many requests leave, and how many lines land — plus the leg that says a TYPED refusal is
// untouched. There is no assertion that "poll refusals are filtered", because they are not: the
// wire's `ev:exec` carries no op, a poll's refusal and a typed command's are the same message, and
// any filter would eventually eat a sentence the player asked for.

const OFFLINE_REFUSAL =
  'MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR TERM_MOSS ON DECK 0 AT 1,3 TO REACH THE PODS';
const REFUSED = { type: 'moss', ev: 'exec', tid: '@console', ok: false, lines: [[2, OFFLINE_REFUSAL]] };

/**
 * A bay screen wearing the REAL model behind a HOST DOUBLE that answers `moss pods` the way
 * `GameSession` does: `ev:pods` while the ship is live, `Refuse` → `ev:exec ok:false` once it is
 * not. `defer` holds the answer back so a LATE reply can be delivered by hand — the case that
 * decides whether a poll suspended by a slow link ever heals.
 */
function bayHost() {
  const doc = new DocumentLite();
  const root = doc.createElement('div');
  root.hidden = true;
  doc.register('moss-view', root);
  doc.body.appendChild(root);
  const win = makeWindow();
  const sent = [];
  const state = { live: true, defer: false, held: [] };
  const screen = new MossScreen({
    root, document: doc, window: win, model: REAL,
    send: (o) => {
      sent.push(o);
      if (!o || o.op !== 'pods') return;
      const reply = state.live ? BAY : REFUSED;
      if (state.defer) state.held.push(reply); else screen.onMossEvent(reply);
    },
  });
  screen.open();
  const s = {
    doc, root, win, sent, screen, state,
    lines: () => root.byClass('moss-cline').map((e) => e.textContent),
    polls: () => sent.filter((o) => o.op === 'pods').length,
    deliverHeld: () => { const h = state.held.splice(0); for (const m of h) screen.onMossEvent(m); },
  };
  typeCmd(s, 'pods');                     // the ask; the double answers and the bay opens
  assert.equal(root.dataset.screen, 'podbay', 'precondition: the bay is up');
  assert.equal(win.timers.size, 1, 'precondition: the poll is running');
  return s;
}

test('POD POLL: a bay left open on a ship that went dark writes ONE line, not one per second', () => {
  const s = bayHost();
  // ⭐ BLINDED LEGS (trap, 5th shape): `assert` throws, so a multi-leg test reports only its first
  // failure. Every leg records, and the whole table is asserted at the end.
  const legs = [];
  const leg = (name, got, want) => legs.push([name, got, want]);

  const before = s.lines().length;
  s.sent.length = 0;
  s.state.live = false;                   // the brownout: MOSS is no longer in service

  for (let i = 0; i < 10; i++) s.win.tickTimers();   // ten seconds of a player just reading

  leg('requests that left the client', s.polls(), 1);
  leg('unbidden transcript lines gained', s.lines().length - before, 1);
  leg('and that one line is the ship\'s own sentence',
    s.lines()[s.lines().length - 1], OFFLINE_REFUSAL);
  // The stand-down is VISIBLE. A frozen census that still looks live is the failure mode the
  // poll exists to prevent, so the fix may not be silent.
  leg('the bay says its refresh has stopped',
    s.root.byClass('moss-stale').map((e) => e.textContent).join('|'), POD_POLL_STALE);

  // ⛔ THE LEG THAT KEEPS THE FIX HONEST. The gate-sentences lane made this refusal valuable — it
  // names the terminal to repair — so a TYPED `pods` must still print it, in full, every time.
  const typedBefore = s.lines().length;
  typeCmd(s, 'pods');
  leg('a typed pods still reaches the ship', s.polls(), 2);
  leg('…and its refusal still prints', s.lines().length - typedBefore, 2);   // the `> pods` echo + the refusal
  leg('…as the ship\'s own words', s.lines()[s.lines().length - 1], OFFLINE_REFUSAL);
  typeCmd(s, 'pods');
  leg('and it prints EVERY time it is asked for',
    s.lines().filter((t) => t === OFFLINE_REFUSAL).length, 3);
  leg('while the poll itself stays quiet', s.polls(), 3);   // 3 = 1 poll + 2 typed, no new polls

  // ⭐ RESUME. The ship comes back; the player types `pods`; the answer lands and the poll lives.
  s.state.live = true;
  typeCmd(s, 'pods');
  const atResume = s.polls();
  s.win.tickTimers();
  leg('an `ev:pods` answer restarts the poll', s.polls() - atResume, 1);
  leg('and the bay stops saying it is stale', s.root.byClass('moss-stale').length, 0);

  const bad = legs.filter(([, got, want]) => !Object.is(got, want));
  assert.deepEqual(bad, [], 'legs that failed: ' + JSON.stringify(bad));
});

test('POD POLL: on a HEALTHY ship the poll keeps asking, and the stand-down never fires', () => {
  // ⛔ THE BLIND SPOT THIS CLOSES (9th shape — an instrument narrowed goes blind; found by review).
  // Every other leg here drives the ship DARK and asserts the poll goes QUIET. Not one of them could
  // see the stand-down OVERSHOOTING: a rule that fired on a ship that IS answering would freeze a
  // LIVE bay and hang the amber marker over it, and the whole suite stayed GREEN. The bound this
  // package added is only half a contract; this is the other half — on a ship that answers, the poll
  // must ask EVERY period and the marker must never appear.
  const s = bayHost();                    // live: the double answers every `pods` with the bay
  const legs = [];
  const leg = (name, got, want) => legs.push([name, got, want]);

  s.sent.length = 0;
  const N = 6;
  let markerEverShown = 0;
  for (let i = 0; i < N; i++) {
    s.win.tickTimers();
    // ⚠️ ASKED EVERY PERIOD, not merely at the end: a marker that flickers up and clears itself is
    // still a frozen-looking bay in the player's face, and an end-state check cannot see it.
    if (s.root.byClass('moss-stale').length) markerEverShown += 1;
  }

  leg('a poll left the client on every period', s.polls(), N);
  leg('the stale marker never appeared, on any period', markerEverShown, 0);
  leg('and the bay is still live at the end', s.root.dataset.screen, 'podbay');
  // The transcript is the other half of "healthy": an answering ship writes NOTHING to it, because
  // `ev:pods` is a screen reply and never a console line.
  leg('a healthy poll writes nothing to the transcript', s.lines().filter((t) => /MOSS IS OFFLINE/.test(t)).length, 0);

  const bad = legs.filter(([, got, want]) => !Object.is(got, want));
  assert.deepEqual(bad, [], 'legs that failed: ' + JSON.stringify(bad));
});

test('POD POLL: a LATE answer heals the stand-down without the player doing anything', () => {
  // ⚠️ WHY THIS LEG EXISTS. "One unanswered period ⇒ stand down" would be a defect of its own on a
  // slow link: a reply that arrives at 1.2 s is a LIVE ship, and a bay that froze itself over
  // latency would be this package trading one silent failure for another. `onMossEvent` clears both
  // flags on any `ev:pods`, whenever it lands — so the recovery needs no keystroke.
  const s = bayHost();
  s.state.defer = true;
  s.sent.length = 0;

  s.win.tickTimers();                     // poll 1 goes out; the answer is held in flight
  s.win.tickTimers();                     // period 2 finds it unanswered ⇒ stand down
  assert.equal(s.polls(), 1, 'precondition: the poll stood down');
  assert.equal(s.root.byClass('moss-stale').length, 1, 'precondition: and said so');

  s.state.defer = false;
  s.deliverHeld();                        // the slow reply finally lands
  assert.equal(s.root.byClass('moss-stale').length, 0, 'a live answer clears the stale marker');
  s.win.tickTimers();
  assert.equal(s.polls(), 2, 'and the poll is asking again, with no player action at all');
});

test('POD POLL: re-entering the bay gives the poll a fresh start', () => {
  const s = bayHost();
  s.state.live = false;
  s.win.tickTimers(); s.win.tickTimers();          // stand down
  assert.equal(s.root.byClass('moss-stale').length, 1, 'precondition: quiet');

  s.screen.escape();                                // leave the bay — the timer dies with it
  assert.equal(s.win.timers.size, 0, 'precondition: the poll died with the screen');
  s.state.live = true;
  typeCmd(s, 'pods');                               // and come back
  assert.equal(s.root.dataset.screen, 'podbay');
  const at = s.polls();
  s.win.tickTimers();
  assert.equal(s.polls() - at, 1, 'a re-entered bay polls again');
});

// ---------------- THE TERMINAL SCROLL CONTRACT (2026-08-04) ----------------
//
// ⛔ THE DEFECT, measured at 1280×800 on the shipped wreck (2026-08-03): typing `help` on the MOSS
// console printed 14 lines into a `max-height:22vh` box and left it at the TOP —
// `clientHeight 157 / scrollHeight 305 / scrollTop 0`. Seven lines visible, and the hidden seven
// were the BOTTOM seven: COMMISSION, PODS and THAW, the three verbs the thaw arc is reached
// through. The player's own answer to their own question was off screen.
//
// ⛔ THE CAUSE IS THE ABSENCE OF A FOLLOW, AND NOTHING ELSE. (An earlier version of this header said
// `replaceChildren` clamped `scrollTop` to 0 on every render. Retracted 2026-08-04 after review and
// MEASURED in Chrome on the shipped pane: parked at 357 of a 714 maximum it reads 357 after the
// rebuild, still 357 when a layout read is forced while the box is empty, and 357 across six real
// 1 Hz wire-driven rebuilds. The pane sat at 0 because nothing had ever scrolled it and every new
// line appended below the fold.) So the FOLLOW arm is the whole of the fix; the no-move arm is
// deliberate defence-in-depth, and the last test below is the one assertion that can see it.

/**
 * A LAYOUT for one dom-lite element — the smallest thing that can ask the scroll question at all.
 * dom-lite has no layout engine, so `.moss-console` reports `undefined` for every metric and a
 * scroll test written straight against it would be vacuous in both directions.
 *
 * ⚠️ THIS FIXTURE IS DELIBERATELY STRICTER THAN CHROME, AND THAT IS A CHOICE, NOT A MODEL OF IT.
 * It DROPS the scroll offset inside `replaceChildren` (empty ⇒ maximum 0 ⇒ the stored offset is
 * clamped away and refilling does not give it back). ⛔ Chrome does NOT do this — measured, see the
 * header above; nothing in this file may be cited as evidence about a browser. It is written this
 * way on purpose: it models the WEAKER guarantee, the engine that does not restore the offset, so
 * `_renderConsole` is pinned to work without leaning on a behaviour no specification promises — and
 * so the `: wasTop` arm, which exists for exactly that contingency, has something that can see it.
 * A fixture that restored the offset like Chrome would leave that arm unpinnable, because in Chrome
 * it genuinely is a no-op.
 *
 * The numbers are the defect's own: `clientHeight` 157, and `help`'s 14 lines made `scrollHeight`
 * 305, i.e. a 305/14 = 21.79px line box.
 */
const CONSOLE_CLIENT_H = 157;
const CONSOLE_STRIDE = 305 / 14;
function fakeLayout(el, clientHeight = CONSOLE_CLIENT_H, stride = CONSOLE_STRIDE) {
  let top = 0;
  const height = () => el.childNodes.length * stride;
  const clamp = () => { top = Math.min(Math.max(0, top), Math.max(0, height() - clientHeight)); };
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height() });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v) => { top = typeof v === 'number' && isFinite(v) ? v : 0; clamp(); },
  });
  const inner = Object.getPrototypeOf(el).replaceChildren.bind(el);
  el.replaceChildren = (...cs) => { inner(); clamp(); inner(...cs); clamp(); };
  return el;
}

/** `help`'s twelve lines, at the length and count the shipped model prints them. */
const HELP_OUTPUT = [
  'HELP                  this list',
  'STATUS                every row, load and state, as one block',
  'OPEN <system>         system detail (also: ENTER on a row)',
  'LOG [system]          fault log, optionally filtered',
  'PROG [terminal]       the MOSS program directory / editor',
  'COMMISSION            fit a controller module to this console',
  'PODS                  the cryo bay — who is aboard',
  'THAW <n|name>         begin that capsule\'s cycle',
  'CLEAR                 empty this transcript',
  'EXIT                  leave MOSS',
  'open|close|lock|unlock <device>',
  '<device>.<property>   read one value',
].map((t) => [1, t]);

/** Open MOSS with a laid-out console pane and the boot line already on it. */
function consoleScreen() {
  const s = openWithSystems();
  fakeLayout(s.screen.consoleEl);
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: [[1, 'MOSS REV 4.2.1 READY — TYPE HELP']] });
  return s;
}

const atBottom = (el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
const consoleTexts = (s) => s.root.byClass('moss-cline').map((e) => e.textContent);

test('the console follows its newest line: HELP\'s bottom half is IN VIEW, not below the fold', () => {
  const s = consoleScreen();
  const el = s.screen.consoleEl;
  assert.equal(el.scrollTop, 0, 'precondition: one boot line does not overflow the pane');

  typeCmd(s, 'help');
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: HELP_OUTPUT });

  const texts = consoleTexts(s);
  assert.ok(texts.length > 10, 'precondition: the transcript really overflows (' + texts.length + ' lines)');
  assert.ok(el.scrollHeight > el.clientHeight, 'precondition: the pane really scrolls');
  // MUTATION 1: `shouldFollowTail` hard-wired to false — the shipped defect, verbatim.
  // MUTATION 2: the `el.scrollTop = …` write deleted — the shipped code, verbatim.
  // MUTATION 3: the metrics read AFTER `replaceChildren` instead of before — the clamp makes the
  //             answer "not at the bottom" forever and the console never follows anything again.
  assert.ok(atBottom(el),
    'the view must have followed the newest line (scrollTop ' + el.scrollTop.toFixed(1)
    + ' of a possible ' + (el.scrollHeight - el.clientHeight).toFixed(1) + ')');

  // …and the payload of the fix: THAW is in the visible window, which is what the defect hid.
  const firstVisible = Math.floor(el.scrollTop / CONSOLE_STRIDE);
  const visible = texts.slice(firstVisible);
  for (const verb of ['COMMISSION', 'PODS', 'THAW']) {
    assert.ok(visible.some((t) => t.startsWith(verb)),
      verb + ' — a verb the thaw arc is reached through — is below the fold');
  }
});

test('a player who scrolled up to read history KEEPS their place, through output and through the '
  + 'renders the wire drives on its own', () => {
  const s = consoleScreen();
  const el = s.screen.consoleEl;
  typeCmd(s, 'help');
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: HELP_OUTPUT });

  el.scrollTop = 0;                       // the player scrolls back to the top of the answer
  assert.equal(el.scrollTop, 0, 'precondition: the pane can be scrolled up at all');

  // 1. an UNBIDDEN render — no new line, just the `systems` push that lands every second or so.
  //    ⚠️ THIS LEG PARKS AT 0 AND THEREFORE CANNOT SEE THE `: wasTop` ARM: restoring 0 and losing
  //    the position to 0 are the same picture (the 4th shape). What it DOES pin is that the FOLLOW
  //    arm stays off — see the non-zero test below for the arm itself.
  s.screen.onSystems(msgOf('systems'));
  // MUTATION 4: `shouldFollowTail` hard-wired to true — the naive always-jump, which drags a
  //             reader to the newest line roughly once a second with no output to justify it.
  assert.equal(el.scrollTop, 0, 'a render with NO new output must not move the player\'s view');

  // 2. and real output while they are still reading: it appends, it does not yank.
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: [[1, 'QUEUED']] });
  assert.equal(el.scrollTop, 0, 'output arriving while the player reads history must not yank them down');
  assert.ok(consoleTexts(s).some((t) => t === 'QUEUED'), 'the line did arrive — it is simply below the fold');
});

test('…and when they scroll back to the bottom, the console follows again', () => {
  const s = consoleScreen();
  const el = s.screen.consoleEl;
  typeCmd(s, 'help');
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: HELP_OUTPUT });
  el.scrollTop = 0;
  s.screen.onSystems(msgOf('systems'));
  assert.equal(el.scrollTop, 0, 'precondition: held');

  el.scrollTop = el.scrollHeight;         // back to the bottom, the way a wheel does it
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: [[1, 'QUEUED']] });
  assert.ok(atBottom(el), 'returning to the bottom re-arms the follow — that is the whole idiom');
  assert.equal(consoleTexts(s)[consoleTexts(s).length - 1], 'QUEUED');
});

test('a reader parked MID-transcript keeps that exact offset — the one assertion that can see the '
  + 'no-move arm', () => {
  // ⛔ WHY THIS TEST EXISTS SEPARATELY (review, 2026-08-04). Every other hold assertion parks the
  // pane at 0, and at 0 "the code restored the position" and "the position was lost to 0" produce
  // the identical reading — a guard that cannot catch its own subject, the 4th shape. Parking
  // mid-transcript is the only place the `: wasTop` arm is distinguishable from doing nothing, and
  // it is the mutation target below.
  const s = consoleScreen();
  const el = s.screen.consoleEl;
  typeCmd(s, 'help');
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: HELP_OUTPUT });

  const parked = Math.round((el.scrollHeight - el.clientHeight) / 2);
  assert.ok(parked > 0, 'precondition: the transcript is tall enough to park inside (' + parked + ')');
  el.scrollTop = parked;
  assert.equal(el.scrollTop, parked, 'precondition: the pane accepted a mid-transcript offset');

  // an unbidden render, then real output — neither may move a reader who is neither at the top nor
  // at the bottom. MUTATION 5: `el.scrollTop = follow ? … : wasTop` reduced to `if (follow) …`,
  // i.e. the no-move arm deleted — under this fixture's (deliberately strict) rebuild the offset is
  // then lost and this reads 0.
  s.screen.onSystems(msgOf('systems'));
  assert.equal(el.scrollTop, parked, 'an unbidden render moved a MID-transcript reader');
  s.screen.onMossEvent({ type: 'moss', ev: 'exec', tid: '@console', ok: true, lines: [[1, 'QUEUED']] });
  assert.equal(el.scrollTop, parked, 'new output moved a MID-transcript reader');
  assert.ok(consoleTexts(s).some((t) => t === 'QUEUED'), 'the line did arrive — it is simply below the fold');
});

test('shouldFollowTail: the pure decision, at the boundaries that decide it', () => {
  const S_ = shouldFollowTail;
  // exactly at the bottom, and one slack short of it
  assert.equal(S_(148, 157, 305), true, 'at the bottom ⇒ follow');
  assert.equal(S_(148 - TAIL_SLACK_PX, 157, 305), true, 'within the slack ⇒ still the bottom');
  assert.equal(S_(148 - TAIL_SLACK_PX - 1, 157, 305), false, 'one px past the slack ⇒ the player is reading');
  // the shipped defect's own numbers: a pane sitting at the top of an overflowing transcript is
  // NOT at the bottom, and that is the only reading that makes the else-branch hold a place.
  assert.equal(S_(0, 157, 305), false, 'the defect\'s metrics ⇒ do not follow (the player is at the top)');
  // nothing overflows ⇒ there is no history to be reading
  assert.equal(S_(0, 157, 100), true, 'content shorter than the box ⇒ follow');
  assert.equal(S_(0, 157, 157), true, 'content exactly the box ⇒ follow');
  // first paint: an empty `.moss-console` is display:none, so every metric is 0
  assert.equal(S_(0, 0, 0), true, 'first paint ⇒ follow');
  // ⚠️ degradation direction is a decision, not an accident: an unmeasurable pane FOLLOWS. The
  // failure mode of following wrongly is a moved view; the failure mode of not following is hidden
  // output, which is the defect.
  assert.equal(S_(undefined, undefined, undefined), true, 'unmeasurable ⇒ follow, never hide output');
  assert.equal(S_(NaN, NaN, NaN), true, 'unmeasurable ⇒ follow, never hide output');
});

// ═══════════════════════════════════════════════════════ the `doors` DIRECTORY verb
//
// Trap 4: the seam is the MESSAGE the screen sends, recorded at the send, never a text scan of the
// module. A client that answered locally would send nothing, and this assertion is what would then
// have nothing to see.

test('doors: typing `doors` sends the wire op through the real screen', () => {
  const s = bayScreen(null);
  typeCmd(s, 'doors');
  assert.deepEqual(s.sent.slice(-1), [{ type: 'moss', op: 'doors', tid: '@console' }],
    'the directory must be ASKED for — the client holds no door census to print');
  assert.equal(s.root.dataset.screen, 'ledger',
    'and it opens no screen: the ship answers on the transcript the player is already looking at');

  // ⭐ NO NEW WIRE SHAPE — the reply is an ordinary `exec` block and the transcript renders it.
  s.screen.onMossEvent({
    type: 'moss', ev: 'exec', tid: '@console', ok: true,
    lines: [[1, 'DOORS — 16 ABOARD · 2 OPEN · 14 SHUT'], [1, 'DOOR_D0_S1 · DECK 0 AT 16,7 · SHUT']],
  });
  const text = s.root.byClass('moss-cline').map((el) => el.textContent).join('\n');
  assert.ok(/DOOR_D0_S1 · DECK 0 AT 16,7 · SHUT/.test(text),
    'the listing never reached the console pane:\n' + text);
});

// ═══════════════════════════════════════════════════════ the `vents` DIRECTORY verb
//
// The owner-ratified second noun (2026-08-04), same seam and same trap-4 discipline as `doors`
// above: the assertion is the MESSAGE the screen sends, recorded at the send.

test('vents: typing `vents` sends the wire op through the real screen', () => {
  const s = bayScreen(null);
  typeCmd(s, 'vents');
  assert.deepEqual(s.sent.slice(-1), [{ type: 'moss', op: 'vents', tid: '@console' }],
    'the directory must be ASKED for — the client holds no vent census to print');
  assert.equal(s.root.dataset.screen, 'ledger',
    'and it opens no screen: the ship answers on the transcript the player is already looking at');

  // ⭐ NO NEW WIRE SHAPE — the reply is an ordinary `exec` block and the transcript renders it,
  // OD-O's board-fault column included, unedited.
  s.screen.onMossEvent({
    type: 'moss', ev: 'exec', tid: '@console', ok: true,
    lines: [[1, 'VENTS — 3 ABOARD · 2 OPEN · 1 SHUT'],
      [1, 'VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT']],
  });
  const text = s.root.byClass('moss-cline').map((el) => el.textContent).join('\n');
  assert.ok(/VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT/.test(text),
    'the listing never reached the console pane:\n' + text);
});
