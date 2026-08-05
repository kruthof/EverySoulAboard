// M2-20 — THE SHIP IS WAITING ON YOU: the client half of the two-word vocabulary.
//
// THE HOST OWNS THE WORDS. `GameSession.TaskLabel` emits "Awaiting orders" for a crew
// member the player has switched nothing on for, and "Idle" for one who is enabled and has nothing
// reachable to do. Both surfaces render the host's own sentence — that is the single-authority rule
// the `marks` channel was built to enforce, and it is why there is no client-side derivation of the
// STATE anywhere in this file's subject. What the client adds is CLASSIFICATION for colour, on the
// first word of the sentence it was sent, exactly as `taskTag` has always classified every other
// label (`console-model.js`).
//
// ⚠️ WHAT THIS FILE CAN AND CANNOT SEE, stated rather than discovered.
//   · It CAN pin the derivation (pure, driven), the CSS the two docks resolve, and that each of the
//     two surfaces carries the payload line — the last with a commented-out negative control, so
//     `CLAUDE.md` trap 1 cannot satisfy it.
//   · It CANNOT mount either view. `dom-lite` parses no markup and `paintCrewWatch` builds its row
//     through `innerHTML` + `querySelector`; there is no jsdom in this repo. So "the class actually
//     reaches the element, and the two colours are different pixels" is proven in real Chrome by
//     `client/tools/awaiting-shot.mjs`, committed beside this file, which drives the shipping game
//     and reads back `className` and `getComputedStyle().color` from BOTH docks under a CHANGED
//     INPUT (the WORK tab toggled on and off again). A source scan is the weaker instrument and it
//     is labelled as such where it is used.
//
// THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-07-30). Each row was edited into the
// shipped tree, the four affected node files were run (92 tests), and the tree was restored from an
// in-memory copy — never `git checkout` (TRAPS 2). "RED" is what the run reported:
//
//   3   derive the word client-side in `paintCrewWatch`
//       (`workPriorityFor(e.cid,0) === 0 ? 'Awaiting orders' : t.text`)
//       ⇒ RED 3: this file's scoped scan, its shared-derivation leg, and — unplanned and welcome —
//         `console-carryover.js` B1, whose `setText(rec.taskEl, t.text)` token the mutation broke.
//   4   drop the waiting class from roomzoom-view.js  ⇒ RED 1: the ROOM ZOOM leg only.
//   4b  drop it from overview-view.js instead         ⇒ RED 1: the OVERVIEW leg only.
//       (Each surface fails ALONE. That is the point of two tests: `assert` throws.)
//   6   give `.ov-crewtask.waiting` the idle colour   ⇒ RED 1: the Overview MUTATION 6 leg.
//   6b  give `.rz-crewtask.waiting` the WORK colour   ⇒ RED 1: the Room Zoom leg — the cheap wrong
//       fix (borrow amber) is caught by the three-way check, not by "waiting differs from idle".
//   7   delete the WORK row from the card             ⇒ RED 2: `onboarding.test.js`'s first-order
//       census (M1-B's own guard shape — no second guard was invented for it) AND its pre-existing
//       `claims.length >= 10` floor, which the WORK row takes to 11 (review-measured 2026-07-30).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly, cssCodeOnly } from './code-only.js';
import { watchTask, taskTag } from '../src/ui/console-model.js';
import { stylesSource } from './styles-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const src = (rel) => readFileSync(join(CLIENT, rel), 'utf8');
const CSS = stylesSource();
// ⚠️ READ THROUGH THE SHARED CSS COMMENT STRIPPER, and this is not tidiness. The block walker below
// captures everything between the previous `}` and the next `{` as the selector, so a rule with an
// explanatory comment above it — which every rule this package adds has — resolves to a "selector"
// of comment-plus-selector and is invisible. MEASURED: both MUTATION 6 legs failed on a correct
// tree until this line existed, which is the fourth trap shape (a scope filter that excludes the
// very thing under test) arriving as a FALSE RED rather than a false green.
const CODE_CSS = cssCodeOnly(CSS);

// ⚠️ THE HOST'S STRING, TYPED OUT ONCE, and deliberately NOT imported from anywhere: the client
// must not own this word. It is here so that a change to `GameSession.AwaitingOrdersLabel` (which
// is REVERSIBLE — owner batch item 11) fails loudly on this side too, rather than silently leaving
// the two docks unable to recognise the sentence they are rendering.
const AWAITING = 'Awaiting orders';

// ═════════════════════════════════════════════════ 1. the derivation: three states, not two

test('the awaiting sentence is NOT work — no map tag floats over a crew member who is waiting', () => {
  assert.equal(taskTag(AWAITING), null,
    'a waiting crew member got a work marker on the map. "Standing around must not look like '
    + 'working" is the rule the whole marker vocabulary exists for.');
  // Non-vacuity, in this test: the same classifier still tags a real job, so the null above is a
  // fact about the sentence and not about a classifier that has stopped answering.
  assert.equal(taskTag('Servicing scrubber_ls'), 'SVC');
});

test('watchTask flags `waiting` for the awaiting sentence and for nothing else', () => {
  assert.equal(watchTask({ task: AWAITING }).waiting, true, 'the awaiting sentence is not flagged');
  // ⚠️ EVERY OTHER JOB-LESS STATE, ONE BY ONE. `Idle` is the one that matters most — it is the
  // state the retired `overview-view.js` comment was written about, and a package that styled the
  // two identically would be the mutation this leg exists to catch.
  for (const other of ['Idle', 'Holding position', 'Walking to 7,11 (no task)',
    'Servicing scrubber_ls', 'Heading to dig out 12,5', '', '—']) {
    assert.equal(watchTask({ task: other }).waiting, false,
      `"${other}" was flagged as awaiting orders — it is a different state with a different word`);
  }
});

test('waiting and working are separate flags: the awaiting row is not lifted to the work colour', () => {
  const w = watchTask({ task: AWAITING });
  assert.equal(w.working, false,
    'the awaiting row reads as WORK. Amber means "work is happening" and that signal is the dock\'s '
    + 'whole legibility mechanism — spending it on a pawn doing nothing makes every new game open '
    + 'with a dock full of activity that is not there.');
  assert.equal(w.text, AWAITING, 'and the row still shows the host\'s sentence');
});

// ═════════════════════════ 2. MUTATION 3 — the word is the HOST'S, never derived on this side

test('MUTATION 3 — the rendered text is the host\'s field VERBATIM, including words the client does not know', () => {
  // Recorded AT THE SEAM: `entry.task` in, the same characters out. A client that synthesised its
  // own vocabulary would have to fail on a sentence it has never been taught — so the fixture uses
  // one. (If the owner reverses the strings, this leg keeps passing, which is the point.)
  const invented = 'Zzyzx — waiting for a word this client has never seen';
  assert.equal(watchTask({ task: invented }).text, invented);
  assert.equal(watchTask({ task: AWAITING }).text, AWAITING);
  assert.equal(watchTask({ task: 'Idle' }).text, 'Idle');
  // …and the ONE substitution it is allowed to make, which is for an ABSENT label, not a state.
  assert.equal(watchTask({ task: '   ' }).text, '—');
});

test('MUTATION 3 — the cell is a function of `entry.task` and of nothing else on the entry', () => {
  // Same task, wildly different everything else ⇒ identical cell. This is the structural form of
  // "no client-side derivation": if the row consulted the `work` channel, or the cid, or the deck,
  // these two would differ.
  const a = watchTask({ cid: 1, task: AWAITING, deck: 0, role: 'ENGINEER', mood: 'calm', x: 2, y: 3 });
  const b = watchTask({ cid: 99, task: AWAITING, deck: 1, role: 'PILOT', mood: 'furious', x: 40, y: 9 });
  assert.deepEqual(a, b);
  // Its own positive control, in this test: change the ONE field that is allowed to matter and the
  // cell must change. Without this line the assertion above is satisfied by a `watchTask` that
  // returns a constant.
  const c = watchTask({ cid: 1, task: 'Idle', deck: 0, role: 'ENGINEER', mood: 'calm', x: 2, y: 3 });
  assert.notDeepEqual(a, c, 'the cell did not move when the TASK changed — the instrument is dead');
});

/** The brace-matched body of `function NAME(` in `code` (comments and strings already stripped). */
function fnBody(code, name) {
  const at = code.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${name} is gone from the module — re-point this scan`);
  const from = code.indexOf('{', at);
  let depth = 0;
  let j = from;
  for (; j < code.length; j++) {
    if (code[j] === '{') depth += 1;
    else if (code[j] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return code.slice(from, j + 1);
}

test('MUTATION 3 — the CREW WATCH row never reaches for the work channel (scoped, with an inclusion control)', () => {
  // ⚠️ SCOPED TO THE ROW, NOT THE FILE. `overview-view.js` legitimately reads the work channel —
  // the WORK tab is in the same module — so a file-wide scan for `workPriorityFor` would be red on
  // a correct tree and would then be "fixed" by narrowing it into uselessness. The scope is the
  // crew-watch painter, which is where the defect would live.
  // ⭐ D4 fix-back: the scope locator is `watchTask(e, OV_DOCK_TASK_CHARS)` — the dock now passes its
  // browser-measured character budget so the air warning survives the ellipsis. The token moved with
  // the line it names; the claim below is untouched.
  const body = fnBody(codeOnly(src('src/ui/overview-view.js')), 'paintCrewWatch');
  assert.ok(body.includes('watchTask(e, OV_DOCK_TASK_CHARS)'),
    'the scope is wrong — this is not the crew-watch painter');
  for (const forbidden of ['workPriorityFor', 'getWork', 'decodeWork']) {
    assert.ok(!body.includes(forbidden),
      `the CREW WATCH row reads ${forbidden}: the state now has TWO sources (the host's sentence `
      + 'and the client\'s own reading of the grid) and they will disagree the day one of them lags');
  }
  // INCLUSION: plant the violation into the same scope and require the scan to catch it. Without
  // this, "no match" is equally consistent with a scan that is looking in the wrong place.
  const planted = body.replace('watchTask(e, OV_DOCK_TASK_CHARS)',
    'workPriorityFor(e.cid, 0) != null ? {} : watchTask(e, OV_DOCK_TASK_CHARS)');
  assert.notEqual(planted, body, 'the plant did not apply — the control below is vacuous');
  assert.ok(planted.includes('workPriorityFor'), 'the scan cannot see a planted client-side derivation');
});

// ═══════════════════════════════ 3. MUTATION 4 — BOTH surfaces, each pinned on its own

// ⚠️ THE TOKENS ARE THE PAYLOAD LINE, not the class name. `console-carryover.test.js` learned this
// the expensive way: `ov-crewtask` also appears in the `querySelector` that resolves the node, so a
// scan for the bare class stayed green while the row rendered nothing. `t.waiting` with its argument,
// because the bare word `waiting` appears in prose all over both files.
// (One constant, because the two surfaces genuinely write the same line — they share the row-record
// shape as well as the derivation. Two names for one string would only look like two guards.)
const WAITING_PAYLOAD = "setCls(rec.taskEl, 'waiting', t.waiting)";
// ⭐ D5 OVERVIEW — AND THE TWO SURFACES NO LONGER WRITE THE SAME LINE, so the shared constant above
// is now the Room Zoom's alone. The Overview's row acquired a FOURTH state — the direct order this
// crew member was given is stuck, and the `blocked` channel says why — which is a FAULT rather than
// an activity, so it turns the other two states off explicitly rather than layering on them. The
// `!bl &&` is spelt into the token deliberately: a scan for the bare old line would go green on a
// tree where the fault state had been dropped and `waiting` had quietly taken the row back.
const OV_WAITING_PAYLOAD = "setCls(rec.taskEl, 'waiting', !bl && t.waiting)";

/** Comment out every line containing `token` — the trap-1 negative control, shared by both legs. */
function commentOutLines(source, token) {
  return source.split('\n').map((l) => (l.includes(token) ? '// ' + l : l)).join('\n');
}

test('MUTATION 4 — the OVERVIEW\'s CREW WATCH writes the waiting class', () => {
  const raw = src('src/ui/overview-view.js');
  assert.ok(codeOnly(raw).includes(OV_WAITING_PAYLOAD),
    `the Overview no longer writes the waiting class (looked for: ${OV_WAITING_PAYLOAD})`);
  // NEGATIVE CONTROL — commented out, the same scan must FAIL (CLAUDE.md trap 1).
  assert.equal(codeOnly(commentOutLines(raw, OV_WAITING_PAYLOAD)).includes(OV_WAITING_PAYLOAD), false,
    'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing');
});

test('MUTATION 4 — the ROOM ZOOM\'s crew dock writes the same class, and it is a separate leg', () => {
  // A SEPARATE `test`, deliberately: `assert` throws, so a two-surface claim inside one test reports
  // only the first surface and a dead second leg looks exactly like a live one (fifth trap shape).
  // "The two surfaces cannot disagree" was the Overview comment's own claim and NOTHING pinned it
  // until this package — a player who steps into a room to find their crew member has not stopped
  // needing to be told the ship is waiting on them.
  const raw = src('src/ui/roomzoom-view.js');
  assert.ok(codeOnly(raw).includes(WAITING_PAYLOAD),
    `the Room Zoom dock no longer writes the waiting class (looked for: ${WAITING_PAYLOAD})`);
  assert.equal(codeOnly(commentOutLines(raw, WAITING_PAYLOAD)).includes(WAITING_PAYLOAD), false,
    'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing');
});

// ⭐ M2-6 fix-back: the payload is `t.what` — the docks render WHAT she is doing and stop at the
// ranking separator, because neither is wide enough to hold the clause (`console-model.js`). The
// claim this leg makes is unchanged: BOTH docks still write the host's sentence through the shared
// derivation, and neither may go silent.
test('MUTATION 4 — and BOTH docks still render the host\'s text through the shared derivation', () => {
  // ⭐ D5 OVERVIEW — the Overview's payload gained the stuck-order branch (see the constant above);
  // `t.what` is still the whole of the other branch, which is what this leg pins.
  const PAYLOAD = {
    'src/ui/overview-view.js': 'setText(rec.taskEl, bl ? bl.sentence : t.what)',
    'src/ui/roomzoom-view.js': 'setText(rec.taskEl, t.what)',
  };
  for (const [f, line] of Object.entries(PAYLOAD)) {
    const code = codeOnly(src(f));
    assert.ok(code.includes(line),
      `${f} stopped writing the task TEXT — the class without the sentence is a colour with no word`);
    assert.ok(code.includes('watchTask('),
      `${f} no longer uses the shared derivation, so the two surfaces can now disagree`);
  }
});

// ═══════════════ 4. MUTATION 6 — unassigned must be DISTINGUISHABLE from idle, in the stylesheet

/** The last `prop` declaration for an EXACT selector, over real CSS blocks. */
function lastDeclaration(css, selector, prop) {
  const want = selector.replace(/\s+/g, ' ').trim();
  const re = new RegExp(prop + '\\s*:\\s*([^;}]+)', 'g');
  let value = null;
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (!selectors.includes(want)) continue;
    for (const d of block[2].matchAll(re)) value = d[1].trim();
  }
  return value;
}

/** The three-way colour check for one dock's task line, plus the blinding control for `.waiting`. */
function assertThreeWayDistinct(prefix, nextSelector, tokens) {
  const idle = lastDeclaration(CODE_CSS, prefix, 'color');
  const waiting = lastDeclaration(CODE_CSS, prefix + '.waiting', 'color');
  const working = lastDeclaration(CODE_CSS, prefix + '.working', 'color');
  assert.ok(idle, `${prefix} has no colour rule`);
  assert.ok(waiting, `${prefix}.waiting has no colour rule, so a crew member waiting for her first `
    + 'order is drawn exactly like one with nothing to do — which is the state the player must be '
    + 'able to tell apart at a glance, on the first screen of a new game');
  assert.ok(working, `${prefix}.working has no colour rule`);

  // THREE-WAY, not "waiting differs from idle": the cheap wrong fix is to give waiting the WORK
  // colour, which makes a dock full of doing-nothing read as a dock full of work.
  assert.notEqual(waiting, idle, `${prefix}: waiting and idle resolve to the same colour`);
  assert.notEqual(waiting, working, `${prefix}: waiting borrowed the WORK colour (${working}). Amber `
    + 'means work is happening; that is the dock\'s legibility mechanism and it is not for sale.');
  assert.notEqual(idle, working, `${prefix}: idle and working share a colour — the base rule moved`);

  // DIRECTION, not merely difference (the B2 shape in `console-carryover.test.js`): each side is
  // pinned to its own token, so a swap cannot pass.
  //
  // ⚠️ THE TOKENS ARE A PARAMETER NOW, AND THE REASON IS SAID OUT LOUD RATHER THAN AVERAGED AWAY.
  // The visual redesign lands one surface per package (charter §3), so during the wave the two docks
  // speak two dialects: the Overview is still the warm one (amber = work, dim cream = idle) and the
  // Room Zoom is the paper one (full INK = work, micro-label ink = idle, prose ink = waiting). The
  // property this test is about — three states, three colours, each pinned to its OWN token so a
  // swap cannot pass — is unchanged and is asserted on both. Loosening the direction pins to a
  // regex that accepts either dialect is what would have weakened it; taking the triple as an
  // argument does not. ⇒ WHEN P4 LANDS, the Overview row becomes the paper triple too and this
  // parameter can go back to being a constant.
  assert.match(idle, tokens.idle, `${prefix} is no longer the dim ink`);
  assert.match(working, tokens.working, `${prefix}.working is no longer the WORK colour`);
  assert.match(waiting, tokens.waiting,
    `${prefix}.waiting resolves to "${waiting}" — it should lift ONE step out of the dim ink. `
    + '⛔ Not --cold either: that hue is reserved for cryo/coolant (H-2).');

  // A SECOND CUE. A colour step alone is thin at 8px, and the row is the only thing on the first
  // screen saying why nothing is happening.
  assert.equal(lastDeclaration(CODE_CSS, prefix + '.waiting', 'font-style'), 'italic',
    `${prefix}.waiting carries only a colour difference; the two cues are deliberate`);

  // BLINDING CONTROL — comment the rule out and the reader must go blind. The closing anchor is the
  // rule that really does follow it; the sanity check proves the substitution applied, rather than
  // trusting it (a no-op `replace` here would leave an unclosed `/*` and pass for the wrong reason).
  const open = prefix + '.waiting{';
  const blinded = CSS.replace(open, '/*' + open).replace('}\n' + nextSelector, '}*/\n' + nextSelector);
  assert.ok(blinded.includes('}*/\n' + nextSelector),
    `the blinding substitution did not apply — re-point the closing anchor at whatever rule now `
    + `follows ${prefix}.waiting`);
  assert.equal(lastDeclaration(cssCodeOnly(blinded), prefix + '.waiting', 'color'), null,
    'commenting the rule out did not blind the reader, so the reader is not reading the rule');
}

test('MUTATION 6 — on the OVERVIEW, waiting is a different colour from BOTH idle and working', () => {
  assertThreeWayDistinct('.ov-crewtask', '.ov-crewtask.working{', {
    idle: /ink-mute|#?8c8377/i, working: /amber-light|#?f2b563/i, waiting: /ink-body|#?b3aa9c/i,
  });
});

test('MUTATION 6 — and the same on the ROOM ZOOM dock (its own leg, so it can fail alone)', () => {
  assertThreeWayDistinct('.rz-crewtask', '.rz-crewtask.working{', {
    // The paper dialect (VR-P3): idle is the micro-label ink, WORK is full ink, and waiting lifts
    // one step to the prose ink — the same three-step ladder, in the ground the surface now has.
    idle: /ink-micro|#?6B6252/i, working: /--ink[,)]|#?14120F/i, waiting: /ink-prose|#?4E463A/i,
  });
});
