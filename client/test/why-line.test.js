// M2-6 fix-back — WHERE THE `why` CLAUSE IS READ, AND WHERE IT DELIBERATELY IS NOT.
//
// THE DEFECT THIS FILE EXISTS FOR, MEASURED BEFORE IT WAS FIXED. M2-6 made the host append a
// ranking clause to the roster's `task` field — "Servicing door_d0_s0 — Repair is priority 1" —
// and both crew docks rendered the whole string. They cannot hold it. At the shipped Space Mono
// sizes (612/1000 em monospace) `.ov-crewtask` is 147 px ≈ 26 characters and `.rz-crewtask` is
// 120 px ≈ 23, against clause-bearing labels of 43–54. With `text-overflow:ellipsis` the result was
// not a truncated explanation but a truncated PAYLOAD: the priority number — the entire point of
// the package — fell past the ellipsis 100% of the time, and the row read "Servicing door_d0_s0 —
// Re…". A junk fragment is worse than saying nothing, because it looks like a rendering bug.
//
// THE RULING, AND WHY IT IS THE TEXT AND NOT THE GEOMETRY. The docks render only the WHAT half;
// the Overview's selected readout `.ov-task` (266 px, wrapping) renders the whole sentence. That
// follows M2-20's precedent exactly — when its own label was measured clipped in these same two
// docks it SHORTENED THE SENTENCE rather than widen two shared docks for one label. No CSS moves
// here, no tooltip is added (a title needs a hover nobody knows to perform), and the wire is
// untouched: `task` still carries "WHAT — WHY" exactly as the host built it.
//
// ⚠️ WHAT THIS FILE CAN AND CANNOT SEE, stated rather than discovered — the same limit
// `awaiting-orders.test.js` records. There is no jsdom in this repo and `dom-lite` has neither
// `innerHTML` nor `querySelector`, so NEITHER VIEW CAN BE MOUNTED and "the element's textContent
// is X" is not provable here. What is provable, and is: the DERIVATION both docks call (driven,
// pure, with the host's own strings), and that each dock's payload line reads the WHAT field while
// the readout reads the raw wire field (source scans, each with a negative control — CLAUDE.md
// trap 1). The element-level claim is proven in real Chrome and reported with the commit.
//
// THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30). Each row was edited into the
// shipped tree, these four node files were run together (BASELINE: 80 green), and the three source
// files were restored from an in-memory copy — never `git checkout` (TRAPS 2):
//
//   1  the OVERVIEW dock shows the FULL string (`t.what` → `t.text`) ⇒ RED 3 of 80: this file's
//      Overview leg, `console-carryover.test.js` B1 and `awaiting-orders.test.js` MUTATION 4 — the
//      two pre-existing payload guards whose token moved with the line. ⭐ THE ROOM ZOOM LEG STAYED
//      GREEN, which is the blinding working and the reason the two docks are two tests.
//   1b the same in roomzoom-view.js ⇒ RED 2 of 80: this file's Room Zoom leg and MUTATION 4.
//      ⭐ The Overview leg stayed GREEN.
//   2  `taskWhat` returns the whole label (drop the `lastIndexOf` split) ⇒ RED 2 of 80: leg (a) and
//      the separator-declaration leg. ⭐ Legs (b) and (c) stayed GREEN — correctly: `text` is
//      untouched and a clause-free label is unaffected, which is what makes (a) a real
//      discrimination rather than a suite-wide tripwire.
//   3  route the selected readout through `watchTask(...).what` ⇒ RED 1 of 80: the readout leg
//      only. That is the dangerous one — the clause would exist nowhere on either surface, and
//      every other leg in this file would still be green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from './code-only.js';
import { watchTask, taskWhat, WHY_SEPARATOR } from '../src/ui/console-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const src = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

// ⚠️ THE HOST'S OWN OUTPUT, TYPED OUT ONCE AND NOT IMPORTED FROM ANYWHERE — these are verbatim
// strings read off the wire on `--ship wreck` (recorded in `WhyLineTests`). The client must not own
// the host's format, and asserting against a constant the client also uses to split would be
// `Is.EqualTo(the thing under test)`. If `GameSession.RankingSeparator` changes, these fail loudly.
const WITH_CLAUSE = 'Servicing door_d0_s0 — Repair is priority 1';
const WITH_CLAUSE_WHAT = 'Servicing door_d0_s0';
const STRIP_CLAUSE = 'Stripping the wall at 0,1 — Deconstruct is priority 4';
const STRIP_WHAT = 'Stripping the wall at 0,1';
const NO_CLAUSE = 'Servicing door_d0_s0';          // the one-work-type state: the host emits no clause
const AWAITING = 'Awaiting orders';

/** Comment out every line containing `token` — the trap-1 negative control. */
function commentOutLines(source, token) {
  return source.split('\n').map((l) => (l.includes(token) ? '// ' + l : l)).join('\n');
}

// ═══════════════════════════════ 1. the split itself — driven on the host's own strings

test('(c) NON-VACUITY: the fixture labels really do carry a clause, and the separator is the pair', () => {
  // ⛔ THIS LEG RUNS FIRST AND EVERY OTHER LEG DEPENDS ON IT. "The dock shows no clause" is
  // satisfied trivially by a fixture that never had one, which is the shape that makes a
  // truncation guard pass on a package that has simply stopped emitting clauses.
  for (const s of [WITH_CLAUSE, STRIP_CLAUSE]) {
    assert.ok(s.includes(WHY_SEPARATOR),
      `the fixture label ${JSON.stringify(s)} does not contain the separator the client splits on, `
      + 'so every truncation assertion in this file is vacuous. The host constant is '
      + '`GameSession.RankingSeparator` — if it moved, move these strings with it.');
  }
  assert.ok(!NO_CLAUSE.includes(WHY_SEPARATOR),
    'the clause-FREE fixture contains the separator, so the no-regression leg cannot tell the two apart');
  assert.ok(!AWAITING.includes(WHY_SEPARATOR), 'M2-20\'s unassigned sentence must never look like a clause');
});

test('(a) the docks\' derivation drops the clause — and leaves no dangling separator', () => {
  // Driven on the exact strings the host emits, through the function BOTH docks call.
  assert.equal(watchTask({ task: WITH_CLAUSE }).what, WITH_CLAUSE_WHAT);
  assert.equal(watchTask({ task: STRIP_CLAUSE }).what, STRIP_WHAT);
  // NO DANGLING SEPARATOR, asked as its own question. An off-by-one split that kept the em dash
  // ("Servicing door_d0_s0 —") satisfies "the clause is gone" perfectly and still ships a row that
  // ends in a floating punctuation mark.
  for (const s of [WITH_CLAUSE, STRIP_CLAUSE]) {
    const what = watchTask({ task: s }).what;
    assert.ok(!what.includes('—'), `the dock text ${JSON.stringify(what)} still carries an em dash`);
    assert.equal(what, what.trimEnd(), `the dock text ${JSON.stringify(what)} ends in whitespace`);
    assert.ok(!/priority/i.test(what), `the dock text ${JSON.stringify(what)} still carries the payload word`);
  }
});

test('(b) the selected readout\'s derivation keeps the whole sentence, clause included', () => {
  // The mirror of (a), and a SEPARATE test: `assert` throws, and "the clause is dropped here and
  // kept there" is precisely the two-sided claim one test cannot make (CLAUDE.md fifth trap).
  assert.equal(watchTask({ task: WITH_CLAUSE }).text, WITH_CLAUSE);
  assert.equal(watchTask({ task: STRIP_CLAUSE }).text, STRIP_CLAUSE);
  for (const s of [WITH_CLAUSE, STRIP_CLAUSE]) {
    assert.ok(watchTask({ task: s }).text.includes(WHY_SEPARATOR),
      'the readout lost the separator, so the WHY is now unreachable on both surfaces');
  }
});

test('(c) NO REGRESSION: a label with no clause renders identically in dock and readout', () => {
  // The one-work-type state — which under OD-H is nearly every crew member for the player's whole
  // first hour — must be byte-identical to what shipped before this package.
  for (const s of [NO_CLAUSE, AWAITING, 'Idle', 'Walking to 7,11 (no task)', 'Holding position']) {
    const t = watchTask({ task: s });
    assert.equal(t.what, s, `${JSON.stringify(s)} was altered on its way to the dock`);
    assert.equal(t.text, t.what, `${JSON.stringify(s)} now differs between dock and readout for no reason`);
  }
});

test('the bare em-dash placeholder for a MISSING label is not mistaken for a clause', () => {
  // `watchTask` returns '—' (no spaces) for an absent label. It cannot match ' — ', and this leg
  // exists because a split written with a bare '—' instead of the separator would return '' here
  // and blank the cell — a silent empty row, which is the defect `console-carryover` B1 was
  // written about.
  assert.equal(watchTask({}).what, '—');
  assert.equal(watchTask({ task: '   ' }).what, '—');
  assert.equal(taskWhat('—'), '—');
});

// ═══════════════════ 2. the two docks and the readout, each pinned on its own

// ⚠️ THE PAYLOAD LINE, not the class name — `console-carryover.test.js` learned the expensive way
// that a bare class name also matches the `querySelector` that resolves the node, so a scan for it
// stayed green while the row rendered nothing.
const DOCK_PAYLOAD = 'setText(rec.taskEl, t.what)';

test('MUTATION 1 — the OVERVIEW\'s crew dock renders the WHAT half', () => {
  const raw = src('src/ui/overview-view.js');
  assert.ok(codeOnly(raw).includes(DOCK_PAYLOAD),
    `the Overview's crew dock no longer renders the WHAT half (looked for: ${DOCK_PAYLOAD}). If it `
    + 'went back to the full string, every row now ends in a truncated priority number.');
  assert.equal(codeOnly(commentOutLines(raw, DOCK_PAYLOAD)).includes(DOCK_PAYLOAD), false,
    'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing (trap 1)');
});

test('MUTATION 1b — the ROOM ZOOM\'s crew dock does the same, and it is a separate leg', () => {
  // A SEPARATE `test`, deliberately: this dock is the NARROWER of the two (120 px vs 147), so it is
  // the one where a regression bites hardest, and a two-surface claim inside one test reports only
  // the first surface.
  const raw = src('src/ui/roomzoom-view.js');
  assert.ok(codeOnly(raw).includes(DOCK_PAYLOAD),
    `the Room Zoom's crew dock no longer renders the WHAT half (looked for: ${DOCK_PAYLOAD})`);
  assert.equal(codeOnly(commentOutLines(raw, DOCK_PAYLOAD)).includes(DOCK_PAYLOAD), false,
    'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing (trap 1)');
});

test('MUTATION 3 — the selected readout renders the RAW wire field, never the docks\' derivation', () => {
  // ⛔ THE LEG THAT KEEPS THE CLAUSE REACHABLE AT ALL. If this readout is ever routed through
  // `watchTask`, the WHY vanishes from both surfaces at once and every other test in this file
  // stays green — the package would then be shipping a wire field nothing renders.
  const code = codeOnly(src('src/ui/overview-view.js'));
  const READOUT_PAYLOAD = "setText(_el.roTask, '> ' + (sel.task || ''))";
  assert.ok(code.includes(READOUT_PAYLOAD),
    `the selected readout no longer writes the raw task field (looked for: ${READOUT_PAYLOAD}). `
    + 'It is the ONLY place on either surface wide enough to show the ranking clause.');
  // INCLUSION CONTROL: plant the violation and require the scan to see it. "No match for watchTask
  // near roTask" is equally consistent with a scan looking in the wrong place.
  const planted = code.replace(READOUT_PAYLOAD, "setText(_el.roTask, '> ' + watchTask(sel).what)");
  assert.notEqual(planted, code, 'the plant did not apply — the control is vacuous');
  assert.equal(planted.includes(READOUT_PAYLOAD), false,
    'the scan cannot see the readout being rerouted through the docks\' derivation');
});

test('the separator is declared ONCE on each side, and each declaration cites the other', () => {
  // ⛔ A TWO-SIDED PARSING CONTRACT WITH THE LITERAL SCATTERED IS THE HAND-MIRRORED-PAIR SHAPE.
  // The host builds the string, the client splits it, and nothing in either language can check the
  // other — so each constant names the other's file, and this leg requires that it still does.
  const model = codeOnly(src('src/ui/console-model.js'));
  assert.ok(model.includes("export const WHY_SEPARATOR = ' — '"),
    'the client no longer declares the separator as a named constant');
  assert.ok(src('src/ui/console-model.js').includes('GameSession.RankingSeparator'),
    'the client\'s separator constant no longer cites the host constant it must stay in step with');

  // ⛔ THE SPLITTER READS THE CONSTANT, NOT A LITERAL. Scoped to `taskWhat`'s body rather than
  // counting em dashes in the file: `console-model.js` legitimately spells ' — ' elsewhere (the
  // chronicle's "DAY 3 — …" formatter at :299), and a file-wide count was RED on a correct tree the
  // first time it ran — the fourth trap shape arriving as a false red. What matters is that the one
  // function which parses the host's format does not carry its own copy of the format.
  const body = model.slice(model.indexOf('export function taskWhat'));
  const fn = body.slice(0, body.indexOf('\n}') + 2);
  assert.ok(fn.includes('WHY_SEPARATOR'), 'taskWhat no longer reads the named separator');
  assert.equal(fn.includes("' — '"), false,
    'taskWhat carries its own copy of the separator literal instead of reading WHY_SEPARATOR — '
    + 'two spellings of a two-sided parsing contract is how the next change misses one');

  // ⛔ AND NEITHER VIEW MAY RE-IMPLEMENT THE SPLIT. A dock that did its own slicing would drift
  // from the host the day the separator moves, and would do it silently on the surface the player
  // reads most.
  for (const f of ['src/ui/overview-view.js', 'src/ui/roomzoom-view.js']) {
    assert.equal(codeOnly(src(f)).includes("' — '"), false,
      `${f} spells the ranking separator itself. The split belongs to console-model.js; a view that `
      + 'parses the host\'s format is a second implementation of it.');
  }
});
