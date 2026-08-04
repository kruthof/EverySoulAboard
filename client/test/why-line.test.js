// M2-6 fix-back — WHERE THE `why` CLAUSE IS READ, AND WHERE IT DELIBERATELY IS NOT.
//
// THE DEFECT THIS FILE EXISTS FOR, MEASURED BEFORE IT WAS FIXED. M2-6 made the host append a
// ranking clause to the roster's `task` field — "Servicing door_d0_s0 — Repair is priority 1" —
// and both crew docks rendered the whole string. They cannot hold it. At the shipped Space Mono
// sizes (612/1000 em monospace) `.ov-crewtask` is 145 px = 26 characters and `.rz-crewtask` is
// 118 px = 22 (⚠️ CORRECTED 2026-08-02 by section 3's browser measurement — this line said 147/120
// ≈ 26/23, and 23 characters are 120 px in a 118 px box, i.e. the inherited figure was the CLIPPED
// one), against clause-bearing labels of 43–54. With `text-overflow:ellipsis` the result was
// not a truncated explanation but a truncated PAYLOAD: the priority number — the entire point of
// the package — fell past the ellipsis 100% of the time, and the row read "Servicing door_d0_s0 —
// Re…". A junk fragment is worse than saying nothing, because it looks like a rendering bug.
//
// THE RULING, AND WHY IT IS THE TEXT AND NOT THE GEOMETRY. The docks render only the WHAT half;
// the Overview's selected readout `.ov-task` (264 px, wrapping — MEASURED `clientWidth`, D4 fix-back;
// this repo carried 266 from M2-6) renders the whole sentence. That
// follows M2-20's precedent exactly — when its own label was measured clipped in these same two
// docks it SHORTENED THE SENTENCE rather than widen two shared docks for one label. No CSS moves
// here and the wire is untouched: `task` still carries "WHAT — WHY" exactly as the host built it.
// ⚠️ "no tooltip is added (a title needs a hover nobody knows to perform)" stood here until D4
// fix-back. The reasoning is unchanged and is why a title is still NOT the fix — but section 3 adds
// one as a BONUS surface, because shortening the base is what finally put the device name out of
// reach, and in the Room Zoom there is no readout to fall back on.
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
import {
  watchTask, taskWhat, dockTask, WHY_SEPARATOR,
  AIR_WARNING_CLAUSE, OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS,
} from '../src/ui/console-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
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
  // ⭐ D4 fix-back: driven at BOTH shipped budgets as well as budget-free, because a shortening rule
  // that fires on a label which already fits would rewrite the entire first hour of the game.
  for (const s of [NO_CLAUSE, AWAITING, 'Idle', 'Walking to 7,11 (no task)', 'Holding position']) {
    for (const budget of [undefined, OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS]) {
      const t = watchTask({ task: s }, budget);
      assert.equal(t.what, s, `${JSON.stringify(s)} was altered on its way to the dock (budget ${budget})`);
      assert.equal(t.text, s, `${JSON.stringify(s)} was altered on its way to the readout (budget ${budget})`);
    }
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
// ⭐ D5 OVERVIEW — the Overview's row acquired a SECOND thing it can say: when the direct order this
// crew member was given is stuck, the `blocked` channel's fault sentence replaces the label (the
// dock is 26 characters and an appended clause would leave two of them for the base — argued at the
// line itself). `t.what` is still the whole of the other branch, which is what this leg has always
// pinned; the ternary is spelt out so the scan cannot be satisfied by a row that renders the reason
// and has quietly stopped rendering the task.
const OV_DOCK_PAYLOAD = 'setText(rec.taskEl, bl ? bl.sentence : t.what)';

test('MUTATION 1 — the OVERVIEW\'s crew dock renders the WHAT half', () => {
  const raw = src('src/ui/overview-view.js');
  assert.ok(codeOnly(raw).includes(OV_DOCK_PAYLOAD),
    `the Overview's crew dock no longer renders the WHAT half (looked for: ${OV_DOCK_PAYLOAD}). If it `
    + 'went back to the full string, every row now ends in a truncated priority number.');
  assert.equal(codeOnly(commentOutLines(raw, OV_DOCK_PAYLOAD)).includes(OV_DOCK_PAYLOAD), false,
    'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing (trap 1)');
});

test('MUTATION 1b — the ROOM ZOOM\'s crew dock does the same, and it is a separate leg', () => {
  // A SEPARATE `test`, deliberately: this dock is the NARROWER of the two (118 px vs 145 — measured;
  // this line said 120 vs 147 until section 3 walked the boxes), so it is
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ⭐⭐ D4 fix-back — THE WARNING SURVIVES THE DOCK
//
// THE DEFECT, MEASURED IN REAL CHROME BEFORE IT WAS FIXED (`client/tools/why-line-shot.mjs`,
// --ship wreck, 1600×1000, 2026-08-02). D4 gave the label a SECOND clause, spelt with a middot on
// purpose so it rides INSIDE the *what* half and reaches the docks (`GameSession.cs:4019-4030`;
// an em-dash spelling would be cut by `taskWhat` in exactly the case that matters most). But
// `"Servicing fabricator_1 · NO AIR"` is 31 characters and the docks are 26 and 22, so
// `text-overflow:ellipsis` ate the tail — and the tail IS the warning. Measured on the shipped
// elements: 172 px in a 145 px box, 162 px in a 118 px box. A held worker suffocating in a vacuum
// was silently normal again on both docks, which is finding D4 wearing a stylesheet.
//
// ⛔ AND THE ROOM ZOOM HAS NO SELECTED READOUT (roomzoom-view.js, the M4 Persona gap): inside a room
// the dock row is the ONLY place the warning can appear at all. That is why this is a defect and
// not a cosmetic preference.
//
// THE BUDGETS ARE MEASURED, NOT DERIVED. `.ov-crewtask` 145 px @ 8.5px Space Mono ⇒ 26 chars;
// `.rz-crewtask` 118 px @ 8px ⇒ 22 chars — walked by the rig as `'M'.repeat(n)` against
// `scrollWidth > clientWidth`. ⚠️ The Room Zoom number every comment in this repo carried was 23,
// and 23 characters measure 120 px in a 118 px box: the inherited figure WAS THE CLIPPED ONE.
//
// THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-08-02). Each row was edited into the
// shipped tree, the four node files were run together (BASELINE: 88 green — MEASURED on this tree;
// this line said 87 in the first cut while its own rows read "of 88"), and every source file
// was restored from an in-memory copy taken before the first edit — never `git checkout`, and with
// the restore mtime set FORWARD (TRAPS 2). Each row's failure SET, not just its count:
//
//   JS-1  `dockTask` never shortens (the fix removed) ⇒ RED 3 of 88: the two OUTCOME legs and the
//         both-clauses leg. ⭐ Every other leg — including the no-regression legs and the whole of
//         sections 1 and 2 — stayed GREEN, which is what makes the outcome legs a discrimination
//         rather than a suite-wide tripwire.
//   JS-2  CROSSED BUDGETS: the Room Zoom dock passes the Overview's 26 into its 118px box ⇒ RED 1
//         of 88: the budget-wiring leg only. ⛔ This is the silent one — 26 is a real budget, just
//         not this box's, and every other assertion in the file is satisfied by it. The browser rig
//         measures the same mutation as 136px of content in a 118px box.
//   JS-3  the hover title dropped from both docks ⇒ RED 1 of 88: the BONUS leg.
//   JS-4  the HOST rewords the warning to " · NO OXYGEN" and the client is never told ⇒ RED 1 of
//         88: the cross-language pairing leg. ⛔ Nothing else moves — the shortening rule simply
//         stops firing and the docks go back to clipping, which is the failure this leg exists for.
//
// The browser half is recorded in `client/tools/why-line-shot.mjs`: RZ_DOCK_TASK_CHARS = 23 (the
// figure this repo carried for four packages) ⇒ 2 CHECKS FAILED, the "fixed" string measured at
// 120px in a 118px box.
const NO_AIR = 'Servicing fabricator_1 · NO AIR';               // 31 — the host's own D4 string
const NO_AIR_BASE = 'Servicing fabricator_1';
const NO_AIR_AND_WHY = 'Servicing fabricator_1 · NO AIR — Repair is priority 1';
const LONG_NO_WARNING = 'Hauling scrap plate to hull breach 14,9';  // 39, and no warning to protect

test('(d) NON-VACUITY: the NO-AIR fixture really does overflow BOTH docks, warning last', () => {
  // ⛔ RUNS FIRST AND EVERY LEG BELOW DEPENDS ON IT. "The warning survives" is satisfied trivially by
  // a fixture that already fit, and by a fixture whose warning is not at the end (where the ellipsis
  // eats). Both facts are asserted here so no outcome leg below is vacuous.
  assert.ok(NO_AIR.length > OV_DOCK_TASK_CHARS,
    `the fixture is ${NO_AIR.length} chars against an Overview budget of ${OV_DOCK_TASK_CHARS} — it fits, `
    + 'so nothing below is measuring a truncation');
  assert.ok(NO_AIR.length > RZ_DOCK_TASK_CHARS, 'the fixture fits the Room Zoom dock — see above');
  assert.ok(NO_AIR.endsWith(AIR_WARNING_CLAUSE),
    'the fixture does not END in the warning, so the ellipsis would not have eaten it and this whole '
    + 'section is about a defect the fixture cannot reproduce');
  assert.equal(NO_AIR, NO_AIR_BASE + AIR_WARNING_CLAUSE);
  // …and the both-clauses fixture is genuinely both, in the host's own ORDER (air, then ranking).
  assert.ok(NO_AIR_AND_WHY.includes(AIR_WARNING_CLAUSE) && NO_AIR_AND_WHY.includes(WHY_SEPARATOR));
  assert.ok(NO_AIR_AND_WHY.indexOf(AIR_WARNING_CLAUSE) < NO_AIR_AND_WHY.indexOf(WHY_SEPARATOR),
    'the fixture puts the ranking clause BEFORE the air clause. The host appends them the other way '
    + '(GameSession.TaskLabel: AppendAirWarning then AppendRankingClause) and `taskWhat` strips the '
    + 'LAST separator — flip the order and the air clause is what gets dropped. '
    + 'WhyLineTests.NoBaseLabel_ContainsTheSeparator pins the host half of this ordering.');
  // and the no-warning control is long enough to be a real control
  assert.ok(LONG_NO_WARNING.length > OV_DOCK_TASK_CHARS && !LONG_NO_WARNING.includes('NO AIR'));
});

test('(d) THE OUTCOME — the OVERVIEW dock keeps the whole warning inside its 26 characters', () => {
  const what = watchTask({ task: NO_AIR }, OV_DOCK_TASK_CHARS).what;
  assert.ok(what.length <= OV_DOCK_TASK_CHARS,
    `the dock string is ${what.length} chars (${JSON.stringify(what)}) against a measured budget of `
    + `${OV_DOCK_TASK_CHARS} — CSS will ellipsize it, and what it ellipsizes is the warning`);
  assert.ok(what.endsWith(AIR_WARNING_CLAUSE),
    `${JSON.stringify(what)} does not end in the host's warning — the payload is gone, which is the `
    + 'defect this package exists for');
  assert.ok(what.startsWith('Servicing'),
    `${JSON.stringify(what)} lost its first word. The client's on-map work marker classifies on it `
    + '(`taskTag`), so shortening from the FRONT silently unmarks the pawn on the map');
  assert.equal(what, 'Servicing fabric… · NO AIR');
});

test('(d) THE OUTCOME — the ROOM ZOOM dock does the same in 22, and it is a separate leg', () => {
  // A SEPARATE `test` (fifth trap shape): this is the narrow dock, the one with NO readout behind it,
  // and a two-dock claim inside one test reports only the first dock.
  const what = watchTask({ task: NO_AIR }, RZ_DOCK_TASK_CHARS).what;
  assert.ok(what.length <= RZ_DOCK_TASK_CHARS,
    `the dock string is ${what.length} chars (${JSON.stringify(what)}) against a measured budget of `
    + `${RZ_DOCK_TASK_CHARS}. This is the dock inside a room, where the warning has nowhere else to go`);
  assert.ok(what.endsWith(AIR_WARNING_CLAUSE), `${JSON.stringify(what)} does not end in the warning`);
  assert.ok(what.startsWith('Servicing'), `${JSON.stringify(what)} lost its first word`);
  assert.equal(what, 'Servicing fa… · NO AIR');
  // NO DANGLING SPACE BEFORE THE ELLIPSIS, asked as its own question — the same hygiene leg (a)
  // demands of the em-dash split. A cut landing on a space ships "Servicing … · NO AIR".
  for (const budget of [OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS]) {
    for (let n = 1; n <= NO_AIR_BASE.length + 4; n++) {
      const s = dockTask(NO_AIR_BASE.slice(0, n) + AIR_WARNING_CLAUSE, budget);
      assert.equal(s.includes(' …'), false, `${JSON.stringify(s)} carries a space before the ellipsis`);
      assert.ok(s.length <= Math.max(budget, n + AIR_WARNING_CLAUSE.length),
        `${JSON.stringify(s)} is over budget ${budget}`);
    }
  }
});

test('(d) BOTH clauses: the ranking is dropped, the warning is kept, and the readout keeps both', () => {
  for (const budget of [OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS]) {
    const t = watchTask({ task: NO_AIR_AND_WHY }, budget);
    assert.equal(t.what.includes(WHY_SEPARATOR), false,
      `${JSON.stringify(t.what)} still carries the ranking clause at budget ${budget}`);
    assert.ok(t.what.endsWith(AIR_WARNING_CLAUSE),
      `${JSON.stringify(t.what)} dropped the AIR clause and kept nothing of it. The two clauses are `
      + 'not interchangeable: one explains a preference, the other says she is dying');
    assert.ok(t.what.length <= budget, `${JSON.stringify(t.what)} is over budget ${budget}`);
    // ⛔ THE READOUT IS UNTOUCHED. `text` is the raw wire field and must still carry BOTH clauses —
    // it is the only surface wide enough for the whole sentence, and routing it through a budget
    // would delete the explanation from the last place it lives.
    assert.equal(t.text, NO_AIR_AND_WHY);
  }
});

test('(d) NO REGRESSION: a long label with NO warning is not shortened by the client at all', () => {
  // ⛔ THIS PACKAGE DOES NOT TAKE OVER TRUNCATION. A client that started shortening every long label
  // would be a second, invisible opinion about the host's prose, and it would silently change rows
  // this defect never touched. CSS keeps doing what it always did when there is nothing to protect.
  for (const budget of [OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS]) {
    assert.equal(dockTask(LONG_NO_WARNING, budget), LONG_NO_WARNING,
      `a ${LONG_NO_WARNING.length}-char label with no warning was rewritten at budget ${budget}`);
    assert.equal(dockTask(LONG_NO_WARNING + WHY_SEPARATOR + 'Haul is priority 3', budget), LONG_NO_WARNING,
      'the ranking clause split changed behaviour for a warning-free label');
  }
  // …and with NO budget declared the derivation is exactly the pre-fix-back one.
  assert.equal(dockTask(NO_AIR), NO_AIR);
  assert.equal(dockTask(NO_AIR, 0), NO_AIR);
  assert.equal(watchTask({ task: NO_AIR }).what, NO_AIR);
  assert.equal(dockTask('—', RZ_DOCK_TASK_CHARS), '—');
  assert.equal(watchTask({}, RZ_DOCK_TASK_CHARS).what, '—');
});

test('(d) the AIR clause is declared once on each side, and the two sides are compared', () => {
  // ⛔ THE SECOND TWO-SIDED CONTRACT IN THIS FILE, and it is pinned HARDER than the separator's:
  // `WHY_SEPARATOR`'s pairing leg can only check that each declaration NAMES the other file. This one
  // reads the host's source and compares the literals, because the failure mode is silent — a host
  // that reworded the warning would not break any assertion here, it would simply switch the
  // shortening rule off and put the docks back where D4 found them.
  const model = codeOnly(src('src/ui/console-model.js'));
  assert.ok(model.includes("export const AIR_WARNING_CLAUSE = ' · NO AIR'"),
    'the client no longer declares the air clause as a named constant');
  assert.ok(src('src/ui/console-model.js').includes('GameSession.AirWarningClause'),
    'the client\'s air-clause constant no longer cites the host constant it must stay in step with');

  const cs = readFileSync(join(REPO, 'hosts/web/GameSession.cs'), 'utf8');
  const m = /internal const string AirWarningClause = "([^"]*)";/.exec(cs);
  assert.ok(m, 'GameSession.AirWarningClause is gone from hosts/web/GameSession.cs — this guard has rotted');
  assert.equal(m[1], AIR_WARNING_CLAUSE,
    `the host emits ${JSON.stringify(m[1])} and the client protects ${JSON.stringify(AIR_WARNING_CLAUSE)}. `
    + 'They must be the same string: the client shortens the base ONLY when the label ends in this '
    + 'exact phrase, so a drift here silently restores the clipped row D4 was fixed for.');

  // AND THE SPLITTER READS THE CONSTANT, NOT A LITERAL — scoped to `dockTask`'s body, the same
  // shape as the `taskWhat` scope above (the file legitimately spells ' · ' elsewhere).
  const body = model.slice(model.indexOf('export function dockTask'));
  const fn = body.slice(0, body.indexOf('\n}') + 2);
  assert.ok(fn.includes('AIR_WARNING_CLAUSE'), 'dockTask no longer reads the named clause constant');
  assert.equal(fn.includes("'NO AIR'") || fn.includes("' · NO AIR'"), false,
    'dockTask carries its own copy of the warning literal instead of reading AIR_WARNING_CLAUSE');
});

test('(d) each dock passes its OWN measured budget, and no view owns a copy of the format', () => {
  const model = codeOnly(src('src/ui/console-model.js'));
  assert.ok(model.includes('export const OV_DOCK_TASK_CHARS = 26'), 'the Overview budget is not declared');
  assert.ok(model.includes('export const RZ_DOCK_TASK_CHARS = 22'), 'the Room Zoom budget is not declared');
  assert.notEqual(OV_DOCK_TASK_CHARS, RZ_DOCK_TASK_CHARS,
    'the two docks now share one budget. They are 145 px and 118 px — one number means the wider dock '
    + 'is throwing away four characters of device name for nothing');

  const ov = codeOnly(src('src/ui/overview-view.js'));
  const rz = codeOnly(src('src/ui/roomzoom-view.js'));
  assert.ok(ov.includes('watchTask(e, OV_DOCK_TASK_CHARS)'),
    'the Overview dock no longer passes its budget, so the warning is back past the ellipsis');
  assert.ok(rz.includes('watchTask(r.entry, RZ_DOCK_TASK_CHARS)'),
    'the Room Zoom dock no longer passes its budget — and it is the dock with no readout behind it');
  // ⛔ CROSSED BUDGETS ARE THE SILENT FAILURE: the Room Zoom on 26 clips by 18 px and every node
  // assertion above still passes, because 26 is a real budget — just not this box's.
  assert.equal(rz.includes('RZ_DOCK_TASK_CHARS') && rz.includes('OV_DOCK_TASK_CHARS'), false,
    'the Room Zoom reaches for the Overview\'s budget');
  assert.equal(ov.includes('OV_DOCK_TASK_CHARS') && ov.includes('RZ_DOCK_TASK_CHARS'), false,
    'the Overview reaches for the Room Zoom\'s budget');
  // NEGATIVE CONTROLS (trap 1) — commented out, both scans must fail.
  assert.equal(codeOnly(commentOutLines(src('src/ui/overview-view.js'), 'watchTask(e, OV_DOCK_TASK_CHARS)'))
    .includes('watchTask(e, OV_DOCK_TASK_CHARS)'), false, 'the Overview scan passes on commented-out code');
  assert.equal(codeOnly(commentOutLines(src('src/ui/roomzoom-view.js'), 'watchTask(r.entry, RZ_DOCK_TASK_CHARS)'))
    .includes('watchTask(r.entry, RZ_DOCK_TASK_CHARS)'), false, 'the Room Zoom scan passes on commented-out code');

  // and NEITHER VIEW re-implements the shortening — no literal budget, no ellipsis, no warning text.
  for (const [f, code] of [['overview-view.js', ov], ['roomzoom-view.js', rz]]) {
    assert.equal(code.includes("'NO AIR'"), false, `${f} spells the host's warning itself`);
    assert.equal(/\.slice\([^)]*\)\s*\+\s*'…'/.test(code), false, `${f} does its own ellipsizing`);
  }
});

test('(d) BONUS: both docks carry the whole sentence as a hover title', () => {
  // NOT the fix and never described as one — a tooltip needs a gesture nobody knows to perform, and
  // "invisible feedback is FUNCTIONAL" is binding. It is the repair for what the fix COSTS: with the
  // base shortened, the full device name is out of reach, and in the Room Zoom (no readout) so is the
  // ranking clause. `t.text` is the RAW wire field, so this surface is the whole sentence.
  // ⭐ D5 OVERVIEW — TWO LITERALS NOW, BECAUSE THE TWO DOCKS NO LONGER WRITE THE SAME LINE. The
  // Overview's row can be replaced by the `blocked` channel's fault sentence, and when it is, the
  // hover carries BOTH — the reason first, then the host's own label on a second line — so the
  // shortened row never costs the player the whole sentence. The Room Zoom dock is untouched by that
  // package and keeps the original expression; one constant for two different lines would only look
  // like two guards (the fifth trap shape).
  const TITLES = {
    'src/ui/overview-view.js': "setAttr(rec.taskEl, 'title', bl ? bl.sentence + '\\n' + t.text : t.text)",
    'src/ui/roomzoom-view.js': "setAttr(rec.taskEl, 'title', t.text)",
  };
  for (const [f, TITLE] of Object.entries(TITLES)) {
    const raw = src(f);
    assert.ok(codeOnly(raw).includes(TITLE), `${f} does not carry the full sentence on hover (${TITLE})`);
    assert.equal(codeOnly(commentOutLines(raw, TITLE)).includes(TITLE), false,
      `${f}: the scan passes on a source where the line is COMMENTED OUT (trap 1)`);
  }
});
