// C6 MOSS terminal IDE tests — the PURE model (terminal-model.js): the editor state machine, the
// diagnostic sort/merge, the gutter-marker layout geometry, the audit ring, and unknown-tid /
// absent-terminal safety. The DOM drawer (terminal.js) is browser-only glue over this model and is
// exercised in the browser, not node. Replays the real W3 wire shapes from a fixture end-to-end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  initTerminal, openTerminal, reduceMoss, editDraft, beginCompile,
  applySource, applyDiag, applyAudit, applyRterror,
  normalizeDiags, sortMergeDiags, gutterMarkers, auditView, canInstall, AUDIT_CAP,
} from '../src/ui/terminal-model.js';
import { decode } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
function loadJsonl(name) {
  return readFileSync(join(here, 'fixtures', name), 'utf8')
    .split('\n').filter((l) => l.trim().length).map((l) => decode(l)).filter((m) => m != null);
}
const moss = (ev, extra = {}) => ({ type: 'moss', ev, tid: 't1', ...extra });

// ---------------- state machine ----------------

test('the editor state machine walks viewing → dirty → compiling → installed', () => {
  let s = openTerminal('t1');
  assert.equal(s.state, 'viewing');
  assert.equal(s.tid, 't1');
  // installed source arrives → viewing, draft mirrors it
  s = reduceMoss(s, moss('source', { text: 'rule a', hash: 42 }));
  assert.equal(s.state, 'viewing');
  assert.equal(s.draft, 'rule a');
  assert.equal(s.hash, 42);
  // user edits → dirty; reverting to the installed text → viewing again
  s = editDraft(s, 'rule b');
  assert.equal(s.state, 'dirty');
  assert.equal(canInstall(s), true);
  assert.equal(editDraft(s, 'rule a').state, 'viewing');
  // Install → compiling; a successful diag commits the draft as the installed source
  s = beginCompile(s);
  assert.equal(s.state, 'compiling');
  s = applyDiag(s, { ok: true, diags: [] });
  assert.equal(s.state, 'installed');
  assert.equal(s.installed, 'rule b', 'the compiled draft became installed');
  assert.equal(canInstall(s), false, 'nothing left to install');
});

test('a failed compile → error (draft preserved); a runtime error raises the banner', () => {
  let s = applySource(openTerminal('t1'), { text: 'rule a', hash: 1 });
  s = editDraft(s, 'rule bad');
  s = beginCompile(s);
  s = applyDiag(s, { ok: false, diags: [[1, 1, 'error', 'boom']] });
  assert.equal(s.state, 'error');
  assert.equal(s.draft, 'rule bad', 'the failed draft is kept for fixing');
  assert.equal(s.installed, 'rule a', 'installed source unchanged on failure');
  assert.equal(s.diags.length, 1);
  assert.equal(canInstall(s), true, 'error with edits can retry install');
  // a runtime error surfaces as a banner and holds the error state
  s = applyRterror(s, { text: 'crash at 1:1' });
  assert.equal(s.rterror, 'crash at 1:1');
  assert.equal(s.state, 'error');
  // editing back to the installed text clears dirty (banner text stays until the next source/compile)
  assert.equal(editDraft(s, 'rule a').state, 'viewing');
});

test('applyDiag infers ok from the absence of errors when the host omits the flag', () => {
  let s = beginCompile(applySource(openTerminal('t1'), { text: 'x' }));
  // ok omitted, only a warning → treated as success (installed)
  s = applyDiag(s, { diags: [[1, 1, 'warning', 'style']] });
  assert.equal(s.state, 'installed');
  assert.equal(s.ok, true);
});

// ---------------- diagnostics: normalize + sort/merge ----------------

test('normalizeDiags coerces wire tuples and clamps 1-based coords; garbage rows drop', () => {
  const got = normalizeDiags([[3, 4, 'error', 'a'], [0, -2, 'warning', 'b'], [1], 'nope', null]);
  assert.deepEqual(got, [
    { line: 3, col: 4, severity: 'error', message: 'a' },
    { line: 1, col: 1, severity: 'warning', message: 'b' }, // 0/-2 clamped to 1
  ]);
});

test('sortMergeDiags orders by line, col, severity and collapses exact duplicates', () => {
  const diags = normalizeDiags([
    [2, 3, 'error', 'unknown verb'],
    [1, 1, 'warning', 'no cooldown'],
    [2, 3, 'error', 'unknown verb'],   // exact duplicate → merged away
    [2, 3, 'warning', 'also here'],    // same tile, different sev/msg → kept, after the error
  ]);
  const merged = sortMergeDiags(diags);
  assert.deepEqual(merged, [
    { line: 1, col: 1, severity: 'warning', message: 'no cooldown' },
    { line: 2, col: 3, severity: 'error', message: 'unknown verb' },
    { line: 2, col: 3, severity: 'warning', message: 'also here' },
  ]);
});

// ---------------- gutter-marker layout math ----------------

test('gutterMarkers maps 1-based line/col to 0-based pixel offsets', () => {
  const diags = [
    { line: 1, col: 1, severity: 'error', message: 'a' },
    { line: 3, col: 5, severity: 'warning', message: 'b' },
  ];
  const marks = gutterMarkers(diags, { lineHeight: 18, charWidth: 8, padTop: 2, padLeft: 4 });
  assert.deepEqual(marks[0], { line: 1, col: 1, severity: 'error', top: 2, left: 4 });   // line 1 → 0*18
  assert.deepEqual(marks[1], { line: 3, col: 5, severity: 'warning', top: 38, left: 36 }); // 2*18+2, 4*8+4
  // padding + charWidth default to 0; a degenerate line/col never goes negative
  const bare = gutterMarkers([{ line: 1, col: 1, severity: 'error', message: 'x' }], { lineHeight: 20 });
  assert.deepEqual(bare[0], { line: 1, col: 1, severity: 'error', top: 0, left: 0 });
});

// ---------------- audit ring ----------------

test('applyAudit appends into a bounded ring keeping the most recent lines', () => {
  let s = openTerminal('t1');
  s = applyAudit(s, { lines: [[1, 'a'], [2, 'b']] });
  assert.deepEqual(auditView(s), [{ tick: 1, text: 'a' }, { tick: 2, text: 'b' }]);
  s = applyAudit(s, { lines: [[3, 'c']] });
  assert.equal(s.audit.length, 3);
  // overflow past the cap drops the oldest
  let big = openTerminal('t1');
  const many = Array.from({ length: AUDIT_CAP + 20 }, (_, i) => [i, 'line' + i]);
  big = applyAudit(big, { lines: many });
  assert.equal(big.audit.length, AUDIT_CAP);
  assert.equal(big.audit[0].tick, 20, 'oldest 20 dropped');
  assert.equal(big.audit[AUDIT_CAP - 1].text, 'line' + (AUDIT_CAP + 19));
});

// ---------------- unknown-tid / absent-terminal safety ----------------

test('reduceMoss ignores messages for another tid or when no terminal is open', () => {
  const s = applySource(openTerminal('t1'), { text: 'rule a' });
  assert.equal(reduceMoss(s, { ev: 'source', tid: 't2', text: 'HIJACK' }), s, 'other tid: no-op (same ref)');
  assert.equal(reduceMoss(s, { ev: 'diag', tid: 't2', ok: false, diags: [[1, 1, 'error', 'x']] }), s);
  // terminal-less model: nothing matches
  const none = initTerminal();
  assert.equal(reduceMoss(none, moss('source', { text: 'x' })), none);
  // malformed / unknown ev: no-op, never throws
  assert.equal(reduceMoss(s, { ev: 'nonsense', tid: 't1' }), s);
  assert.doesNotThrow(() => reduceMoss(s, null));
  assert.doesNotThrow(() => reduceMoss(s, { tid: 't1' })); // no ev
});

test('reduceMoss does not mutate the prior state', () => {
  const s0 = applySource(openTerminal('t1'), { text: 'rule a' });
  const before = JSON.stringify(s0);
  reduceMoss(s0, moss('diag', { ok: false, diags: [[1, 1, 'error', 'x']] }));
  reduceMoss(s0, moss('audit', { lines: [[1, 'a']] }));
  assert.equal(JSON.stringify(s0), before, 's0 untouched by the reducers');
});

// ---------------- fixture replay (real W3 wire shapes) ----------------

test('fixture replay: moss_session.jsonl drives source → multi-error diag → audit → rterror', () => {
  const events = loadJsonl('moss_session.jsonl').filter((m) => m.type === 'moss');
  let s = openTerminal('t1');
  for (const ev of events) s = reduceMoss(s, ev);
  // the installed source loaded; the two identical errors merged to one, warning sorted first
  assert.equal(s.installed, 'when power < 0.3 do\n  alert crew\nend');
  assert.equal(s.hash, 2882343476);
  assert.deepEqual(s.diags, [
    { line: 1, col: 1, severity: 'warning', message: 'rule has no cooldown' },
    { line: 2, col: 3, severity: 'error', message: "unknown verb 'alert'" },
  ]);
  // audit ring populated; runtime error banner raised; state is error (diag had errors + rterror)
  assert.deepEqual(auditView(s), [{ tick: 1200, text: 'rule installed' }, { tick: 1500, text: 'rule matched: power 0.28' }]);
  assert.equal(s.rterror, "runtime: verb 'alert' is not bound");
  assert.equal(s.state, 'error');
});
