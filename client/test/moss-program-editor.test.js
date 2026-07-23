// MOSS PROGRAM editor — the moss-programs lane. Three layers:
//   1. the PURE moss-model reducers (selectProgram / editProgramDraft / beginProgramCompile) against
//      the REAL moss-model.js, including the wiring gap: a `source` reply before selectProgram is a
//      no-op (terminal-model's tid guard drops it) and MUST be accepted after.
//   2. the embedded editor DOM (moss-program-editor.js) over a dom-lite textarea: the refill rule in
//      BOTH directions, the diagnostics/markers/audit/banner render, canInstall enablement, and that
//      gestures fire the callbacks.
//   3. the whole path through moss-screen + the shape-faithful fake: select → source → edit →
//      install → diag, and that a stray render never clobbers a live edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  openMoss, reduceMossEvent, selectProgram, editProgramDraft, beginProgramCompile,
} from '../src/ui/moss-model.js';
import {
  openTerminal, applySource, editDraft, applyDiag, applyAudit, applyRterror, canInstall,
} from '../src/ui/terminal-model.js';
import { MossProgramEditor } from '../src/ui/moss-program-editor.js';
import { DocumentLite, makeWindow, keyEvent, fire } from './dom-lite.js';
import * as FAKE from './moss-model-fake.js';
import { MossScreen } from '../src/ui/moss-screen.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------- 1. pure reducers ----------------

test('selectProgram opens the terminal in model.program (the tid is set BEFORE the source arrives)', () => {
  const m = deepFreeze(openMoss());
  assert.equal(m.program.tid, null, 'a fresh model is terminal-less');
  const sel = selectProgram(m, 'bridge');
  assert.equal(sel.program.tid, 'bridge');
  assert.equal(sel.program.draft, '');
  assert.equal(sel.program.state, 'viewing');
  assert.notEqual(sel, m, 'a new model (no mutation)');
  // a null/empty tid clears the selection back to terminal-less
  assert.equal(selectProgram(sel, null).program.tid, null);
  assert.equal(selectProgram(sel, '').program.tid, null);
});

test('THE GAP: a source reply is DROPPED before selectProgram and ACCEPTED after', () => {
  const src = { type: 'moss', ev: 'source', tid: 'bridge', text: 'rule foo', hash: 7 };
  // before: program.tid is null, terminal-model's matches() fails, the reduce is a no-op
  const before = reduceMossEvent(openMoss(), src);
  assert.equal(before.program.draft, '', 'source dropped while the terminal is not open');
  // after selectProgram folds openTerminal, the same reply lands
  const opened = selectProgram(openMoss(), 'bridge');
  const after = reduceMossEvent(opened, src);
  assert.equal(after.program.draft, 'rule foo', 'source accepted once the terminal is open');
  assert.equal(after.program.installed, 'rule foo');
});

test('editProgramDraft folds the draft (dirty) and keeps program.draft === the text', () => {
  const opened = selectProgram(openMoss(), 't1');
  const withSrc = reduceMossEvent(opened, { type: 'moss', ev: 'source', tid: 't1', text: 'a', hash: 1 });
  const edited = editProgramDraft(deepFreeze(withSrc), 'a b');
  assert.equal(edited.program.draft, 'a b');
  assert.equal(edited.program.state, 'dirty');
  // reverting to the installed text returns to viewing (terminal-model's rule, inherited)
  assert.equal(editProgramDraft(edited, 'a').program.state, 'viewing');
});

test('beginProgramCompile marks the program compiling (no mutation of the input)', () => {
  const opened = selectProgram(openMoss(), 't1');
  const withSrc = reduceMossEvent(opened, { type: 'moss', ev: 'source', tid: 't1', text: 'a', hash: 1 });
  const dirty = deepFreeze(editProgramDraft(withSrc, 'a b'));
  const compiling = beginProgramCompile(dirty);
  assert.equal(compiling.program.state, 'compiling');
  assert.equal(dirty.program.state, 'dirty', 'the input is untouched');
});

// ---------------- 2. the editor DOM ----------------

function mountEditor(opts) {
  const doc = new DocumentLite();
  const host = doc.createElement('div');
  const calls = { edit: [], install: 0, audit: 0 };
  const ed = new MossProgramEditor({
    document: doc,
    onEdit: (t) => calls.edit.push(t),
    onInstall: () => { calls.install += 1; },
    onAudit: () => { calls.audit += 1; },
    ...(opts || {}),
  });
  ed.mount(host, 't1');
  return { doc, host, ed, calls };
}

test('mount builds a REAL <textarea>; sync renders the installed source into it', () => {
  const { host, ed } = mountEditor();
  assert.equal(host.oneClass('moss-prog-code').tagName, 'TEXTAREA', 'a real textarea (guard-covered)');
  let p = applySource(openTerminal('t1'), { text: 'line1\nline2', hash: 1 });
  ed.sync(p);
  assert.equal(ed.code.value, 'line1\nline2');
  assert.equal(ed.nums.textContent, '1\n2\n', 'one gutter number per source row');
});

test('THE REFILL RULE, both directions: no-op during typing, authoritative on source', () => {
  const { ed } = mountEditor();
  ed.sync(applySource(openTerminal('t1'), { text: 'a\nb', hash: 1 }));
  assert.equal(ed.code.value, 'a\nb');
  // the user types: the textarea now holds their live buffer, and editProgramDraft keeps draft equal
  ed.code.value = 'a\nb EDIT';
  const dirty = editDraft(applySource(openTerminal('t1'), { text: 'a\nb', hash: 1 }), 'a\nb EDIT');
  ed.sync(dirty);
  assert.equal(ed.code.value, 'a\nb EDIT', 'sync must NOT clobber a caret mid-type when value === draft');
  // an authoritative source resets the draft to the installed text → the textarea refills
  ed.sync(applySource(openTerminal('t1'), { text: 'a\nb', hash: 1 }));
  assert.equal(ed.code.value, 'a\nb', 'a source event refills the textarea');
});

test('a triggered refill fills from DRAFT, not installed (they diverge in a dirty state)', () => {
  // A fresh editor whose textarea is stale ('') synced with a DIRTY program (draft !== installed):
  // the refill must adopt the DRAFT (the live editor buffer), never the installed source. This is
  // the one case that distinguishes `p.draft` from `p.installed` in the refill.
  const { ed } = mountEditor();
  const dirty = editDraft(applySource(openTerminal('t1'), { text: 'installed', hash: 1 }), 'DRAFT edit');
  assert.notEqual(dirty.draft, dirty.installed);
  ed.sync(dirty);
  assert.equal(ed.code.value, 'DRAFT edit', 'refill adopts the draft, not the installed source');
});

test('diagnostics render as gutter markers + a list; canInstall drives the Install button', () => {
  const { ed } = mountEditor();
  let p = applySource(openTerminal('t1'), { text: 'x\ny\nz', hash: 1 });
  ed.sync(p);
  assert.equal(ed.install.disabled, true, 'viewing → nothing to install');
  p = editDraft(p, 'x\ny\nZZ');
  ed.sync(p);
  assert.equal(ed.install.disabled, false, 'dirty → installable');
  assert.equal(ed.stateChip.textContent, 'dirty');
  // a failed compile: markers + a diag list, each severity coloured
  p = applyDiag(p, { ok: false, diags: [[2, 3, 'error', 'boom'], [1, 1, 'warning', 'meh']] });
  ed.sync(p);
  assert.equal(ed.markers.childNodes.length, 2, 'one gutter marker per diagnostic');
  assert.equal(ed.diagsEl.childNodes.length, 2);
  assert.ok(ed.diagsEl.textContent.includes('boom') && ed.diagsEl.textContent.includes('meh'));
  assert.ok(ed.markers.childNodes.some((n) => n.classList.contains('sev-error')));
  assert.equal(ed.markers.childNodes[0].style.top, '2px', 'marker top from line 1 (padTop 2 + 0*18)');
});

test('the audit ring renders, and the runtime-error banner shows then hides', () => {
  const { ed } = mountEditor();
  let p = applyAudit(openTerminal('t1'), { lines: [[10, 'ran'], [20, 'again']] });
  ed.sync(p);
  assert.equal(ed.auditEl.childNodes.length, 2);
  assert.ok(ed.auditEl.textContent.includes('t10  ran'));
  // rterror raises the banner
  p = applyRterror(p, { text: 'kaboom' });
  ed.sync(p);
  assert.equal(ed.banner.hidden, false);
  assert.equal(ed.banner.textContent, 'kaboom');
  // a fresh source clears it
  ed.sync(applySource(openTerminal('t1'), { text: 'ok', hash: 1 }));
  assert.equal(ed.banner.hidden, true);
});

test('gestures fire the callbacks: input → onEdit, Install (only when enabled) → onInstall, ⟳ → onAudit', () => {
  const { ed, calls } = mountEditor();
  ed.code.value = 'typed';
  fire(ed.code, 'input');
  assert.deepEqual(calls.edit, ['typed']);
  // Install is disabled while viewing → a click is a no-op (dom-lite has no native disabled guard)
  ed.sync(applySource(openTerminal('t1'), { text: 'typed', hash: 1 }));
  assert.equal(ed.install.disabled, true);
  fire(ed.install, 'click');
  assert.equal(calls.install, 0, 'a disabled Install must not fire');
  // dirty → enabled → the click fires
  ed.sync(editDraft(applySource(openTerminal('t1'), { text: 'a', hash: 1 }), 'a b'));
  fire(ed.install, 'click');
  assert.equal(calls.install, 1);
  fire(ed.refresh, 'click');
  assert.equal(calls.audit, 1);
});

test('detach empties the mount and stops syncing', () => {
  const { host, ed } = mountEditor();
  ed.detach();
  assert.equal(host.childNodes.length, 0);
  ed.sync(applySource(openTerminal('t1'), { text: 'x', hash: 1 })); // must not throw after detach
});

// ---------------- 3. the whole path through moss-screen ----------------

function setupScreen() {
  const doc = new DocumentLite();
  const app = doc.createElement('div'); app.className = 'app'; doc.body.appendChild(app);
  const panels = doc.createElement('div'); doc.register('panels', panels); doc.body.appendChild(panels);
  const root = doc.createElement('div'); root.className = 'moss'; root.hidden = true;
  doc.register('moss-view', root); doc.body.appendChild(root);
  const sent = [];
  const screen = new MossScreen({
    root, document: doc, window: makeWindow(), model: FAKE, send: (o) => sent.push(o), onExit() {},
  });
  return { doc, root, sent, screen };
}

test('end-to-end: select → source loads → edit → install sends `moss set` → diag installs', () => {
  const s = setupScreen();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }]);
  s.screen.open();
  s.screen.handleKey(keyEvent('p'));
  s.screen.selectProgram('bridge');
  // the gap fix: model.program.tid is set before the reply, and the wire op went out
  assert.equal(s.screen.model.program.tid, 'bridge');
  assert.deepEqual(s.sent, [{ type: 'moss', op: 'open', tid: 'bridge' }]);

  // the source reply reaches the editor (it would stay '' without the tid fix)
  s.screen.onMossEvent({ type: 'moss', ev: 'source', tid: 'bridge', text: 'rule x', hash: 9 });
  const code = s.root.oneClass('moss-prog-code');
  assert.equal(code.value, 'rule x');

  // edit flows back through editProgramDraft
  code.value = 'rule x EDIT';
  fire(code, 'input');
  assert.equal(s.screen.model.program.draft, 'rule x EDIT');
  assert.equal(s.screen.model.program.state, 'dirty');

  // Install → compiling + `moss set {tid, draft}`
  const install = s.root.oneClass('moss-prog-install');
  assert.equal(install.disabled, false);
  fire(install, 'click');
  assert.equal(s.screen.model.program.state, 'compiling');
  assert.deepEqual(s.sent.slice(-1), [{ type: 'moss', op: 'set', tid: 'bridge', text: 'rule x EDIT' }]);

  // a successful diag commits the draft as installed
  s.screen.onMossEvent({ type: 'moss', ev: 'diag', tid: 'bridge', ok: true, diags: [] });
  assert.equal(s.screen.model.program.state, 'installed');
  assert.equal(s.screen.model.program.installed, 'rule x EDIT');
  assert.equal(canInstall(s.screen.model.program), false);

  // ⟳ asks the host for the audit ring
  s.root.oneClass('moss-prog-refresh') && fire(s.root.oneClass('moss-prog-refresh'), 'click');
  assert.deepEqual(s.sent.slice(-1), [{ type: 'moss', op: 'audit', tid: 'bridge' }]);
});

test('a stray full render never clobbers a live edit (the refill rule holds through the screen)', () => {
  const s = setupScreen();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }]);
  s.screen.open();
  s.screen.handleKey(keyEvent('p'));
  s.screen.selectProgram('bridge');
  s.screen.onMossEvent({ type: 'moss', ev: 'source', tid: 'bridge', text: 'base', hash: 1 });
  const code = s.root.oneClass('moss-prog-code');
  code.value = 'base + user edit';
  fire(code, 'input');
  // an unrelated render (e.g. a `systems` refresh) must not wipe the buffer
  s.screen.render();
  assert.equal(s.root.oneClass('moss-prog-code').value, 'base + user edit');
});

test('re-entering PROGRAM after close resets the selection (fresh model, fresh selection)', () => {
  const s = setupScreen();
  s.screen.setTerminals([{ tid: 'bridge', deck: 0 }]);
  s.screen.open();
  s.screen.handleKey(keyEvent('p'));
  s.screen.selectProgram('bridge');
  s.screen.close();
  s.screen.open();
  s.screen.handleKey(keyEvent('p'));
  assert.ok(s.root.oneClass('moss-empty').textContent.includes('SELECT A TERMINAL'),
    'a re-entered PROGRAM screen starts unselected');
});
