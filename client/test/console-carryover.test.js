// WP-8 — THE THREE AFFORDANCES CARRIED OVER FROM THE DYING CONSOLE, minus the one that is pure.
//
// The console-retirement plan §1(b) lists three things the console gave the player that the standard
// surface did not: on-map WORK markers (B4), the CREW WATCH task line (B5), and the paused-ship nudge
// (B6). The first is a pure SVG derivation and is tested where it lives, in
// `client/test/overview-scene.test.js`. The other two are DOM, and this file covers them in the two
// ways node can:
//
//   Group A — BEHAVIOUR. `src/ui/paused-nudge.js` is driven for real. Its clock, its timer and its
//     element are all injected, so "the nudge fires only while paused" and "it dismisses itself when
//     the window closes" are proven by driving the machine, not by reading it.
//
//   Group B — WIRING (structural, and declared as such). There is no DOM here — `client/test/
//     ui.test.js:2-3` states the house position that the shells are exercised in the browser — so the
//     crew-watch task line and the Room Zoom's work tag are asserted by reading their sources. That is
//     a weaker instrument and it is used deliberately: it cannot prove the pixels, only that the
//     wiring has not been deleted. The pixels were verified in headless Chrome against `--ship grid`
//     (see the package report), which is the only thing that can prove them.
//
// EVERY source scan here runs over COMMENT-STRIPPED code. This is not a style choice: on 2026-07-25
// four separate packages shipped a guard that its own target satisfied while COMMENTED OUT (see
// CLAUDE.md "Traps that have each cost this project real work" #1). Each scan below therefore has a
// NEGATIVE CONTROL that comments the real wiring out in memory and asserts the scan then FAILS —
// otherwise the guard is satisfied by prose, including this file's own prose, which names every token
// it looks for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeNudge } from '../src/ui/paused-nudge.js';
import { NUDGE_MS } from '../src/ui/console-model.js';
// The Room Zoom's occupant renderer, exported at the rework so its honesty rule can be DRIVEN (C5)
// rather than read out of the source. Importing the module is DOM-free: it touches `document` only
// inside its init/paint functions.
import { pawnSvg } from '../src/ui/roomzoom-view.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const src = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

/**
 * JS source with comments removed, quote-aware so `'ws://…'` and `"a // b"` survive intact.
 * Copied from `client/test/relations-view.test.js:53` rather than re-derived — that implementation is
 * the one this repo has already reviewed, and a second hand-rolled stripper is a second place to get
 * the string-literal case wrong.
 */
function stripJsComments(s) {
  let out = '', i = 0, q = null;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (q) {
      if (c === '\\') { out += c + (d || ''); i += 2; continue; }
      if (c === q) q = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** Comment out every LINE of `text` that mentions `needle` — the in-memory mutation the negative
 *  controls apply. Nothing is written to disk: `git checkout` must never appear in a mutation loop
 *  (CLAUDE.md trap #2), and the same rule applies to a test that mutates a source. */
function commentOutLines(text, needle) {
  return text.split('\n').map((l) => (l.includes(needle) ? '// ' + l : l)).join('\n');
}

/** The CSS with `/* … *\/` stripped, and the LAST declaration of `prop` for exactly `selector`. */
const CSS = src('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Group A — the paused-ship nudge, DRIVEN (B6)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A nudge wired to a fake element, a hand-cranked clock and a capturable timer. */
function harness() {
  const el = { hidden: true };
  let t = 1000;
  const timers = [];
  const n = makeNudge({
    el: () => el,
    now: () => t,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (h) => { if (timers[h - 1]) timers[h - 1].cancelled = true; },
  });
  return {
    n, el, timers,
    advance(ms) { t += ms; },
    /** Run the pending dismissal timer, as the browser would when its delay elapses. */
    runTimer() {
      const live = timers.filter((x) => !x.cancelled);
      const last = live[live.length - 1];
      assert.ok(last, 'no dismissal timer was scheduled');
      this.advance(last.ms);
      last.fn();
    },
  };
}

test('A1: the nudge fires when the player acts on a PAUSED ship, and not when it is running', () => {
  const h = harness();
  h.n.trigger(false);
  assert.equal(h.n.visible(), false, 'a running ship needs no nudge — the order is being carried out');
  assert.equal(h.el.hidden, true);

  h.n.trigger(true);
  assert.equal(h.n.visible(), true, 'arming/ordering on a stopped ship is the "nothing happened" moment');
  assert.equal(h.el.hidden, false, 'the element was never un-hidden, so nothing reaches the player');
});

test('A2: the nudge dismisses itself when its window closes — nothing else repaints a paused ship', () => {
  const h = harness();
  h.n.trigger(true);
  assert.equal(h.el.hidden, false);
  // Just inside the window it is still up; the scheduled timer is what takes it down after it.
  h.advance(NUDGE_MS - 1);
  h.n.paint();
  assert.equal(h.el.hidden, false);
  h.runTimer();
  assert.equal(h.el.hidden, true, 'the nudge is time-derived, so without its own timer it would blink '
    + 'on a paused ship forever — no wire message is coming to repaint it');
});

test('A3: resuming the ship clears the nudge immediately', () => {
  const h = harness();
  h.n.trigger(true);
  assert.equal(h.el.hidden, false);
  h.n.unpause();
  assert.equal(h.n.visible(), false);
  assert.equal(h.el.hidden, true, 'the nudge asked the player to press space; once they have, it is noise');
});

test('A4: a re-trigger extends the window rather than stacking timers', () => {
  const h = harness();
  h.n.trigger(true);
  h.advance(1000);
  h.n.trigger(true);
  assert.equal(h.timers.filter((x) => !x.cancelled).length, 1, 'a second armed tool left two live timers; '
    + 'the earlier one then hides a nudge that is still inside its window');
});

test('A5: a missing element is a no-op, never a crash', () => {
  const n = makeNudge({ el: () => null, now: () => 0, setTimer: () => 1, clearTimer: () => {} });
  assert.doesNotThrow(() => { n.trigger(true); n.unpause(); n.paint(); });
  assert.doesNotThrow(() => makeNudge().trigger(true));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Group B — the wiring (structural; the pixels are a browser check)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Does this source, comments removed, carry every one of `tokens`? */
function wired(source, tokens) {
  const code = stripJsComments(source);
  return tokens.every((t) => code.includes(t));
}

// The CREW WATCH task line (B5). MUTATION: comment out the `ov-crewtask` lines ⇒ this fails (asserted
// below as the negative control, so the guard cannot be satisfied by a commented-out implementation).
// The SKELETON string, not the bare class name: `ov-crewtask` also appears in the
// `querySelector('.ov-crewtask')` that resolves the node, so deleting the span from the row template
// left a version of this guard green. The mutation must be able to bite.
// `setText(rec.taskEl, t.text)` is THE PAYLOAD and it was not in this list: deleting that one line
// left the span, the querySelector, the `watchTask` call and the `.working` class all in place, and
// the whole suite stayed green while every crew row rendered an empty task cell. `watchTask(e)` with
// its argument, not the bare name, for the same reason the nudge tokens carry a semicolon — the bare
// name also matches the `import { … watchTask … }` line at the top of the file.
// ⭐ M2-6 fix-back: the payload token is now `t.what`, not `t.text`. The dock renders WHAT she is
// doing and stops at the ranking separator, because it is ~26 characters wide and a clause-bearing
// label is 43–54 — see `console-model.js`'s `watchTask`. The token had to move with the line it
// pins; what it PROVES is unchanged (the row still writes the host's sentence through the shared
// derivation), and the negative control below still bites.
const CREW_TASK_TOKENS = [
  '<span class="ov-crewtask"></span>', "querySelector('.ov-crewtask')",
  'watchTask(e)', 'setText(rec.taskEl, t.what)', "setCls(rec.taskEl, 'working'",
];

test('B1: the Overview CREW WATCH row carries a task line fed by the shared watchTask derivation', () => {
  const raw = src('src/ui/overview-view.js');
  assert.ok(wired(raw, CREW_TASK_TOKENS),
    'the Overview\'s crew rows no longer show what each person is DOING (plan §1(b) B5). The console\'s '
    + 'dock answered that and the Overview\'s did not, which is why it was ported. Tokens looked for: '
    + JSON.stringify(CREW_TASK_TOKENS));
  // NEGATIVE CONTROL — the same scan over a source whose wiring is commented out must FAIL.
  assert.equal(wired(commentOutLines(raw, 'ov-crewtask'), CREW_TASK_TOKENS), false,
    'the scan passes on a source where the task line is COMMENTED OUT, so it proves nothing at all — '
    + 'this is CLAUDE.md trap #1, which shipped in four packages on one day');
});

test('B2: the task line is styled dim, and `.working` lifts it — the honesty rule is the colour', () => {
  const base = lastDeclaration(CSS, '.ov-crewtask', 'color');
  const work = lastDeclaration(CSS, '.ov-crewtask.working', 'color');
  assert.ok(base, '.ov-crewtask has no colour rule — the row cannot read as dim-when-idle');
  assert.ok(work, '.ov-crewtask.working has no colour rule, so a working crew member reads exactly like '
    + 'an idle one and the task line stops being an answer to "who is actually working?"');
  assert.notEqual(base, work, 'idle and working share one colour — the distinction is the whole feature');
  // DIRECTION, not merely difference. `notEqual` alone is satisfied by the colours SWAPPED, which
  // would make every idle row read as activity and every working row read as nothing — the exact
  // inversion of the affordance, passing its own guard. So each side is pinned to its own token.
  assert.match(base, /ink-mute|#?8c8377/i,
    `.ov-crewtask resolves to "${base}", which is not the dim ink-mute token. A doing-nothing crew `
    + 'member must not read as activity.');
  assert.match(work, /amber-light|#?f2b563/i,
    `.ov-crewtask.working resolves to "${work}", which is not the amber accent. Scanning the dock's `
    + 'colour is how "who is actually working?" gets answered at a glance.');
  // Negative control: with the `.working` rule commented out, the assertion above must fail.
  // ⚠️ THE CLOSING ANCHOR MOVED AT M1-F (2026-07-29) and it had to. It used to be `}\n.ov-morale{`;
  // M1-F deleted the `.ov-morale` rules, which would have made this `.replace` a SILENT NO-OP,
  // leaving the `/*` opened above unclosed. The naive stripper on the next line would then have run
  // to the file's NEXT `*/` — hundreds of rules away — and the assertion would still have passed,
  // for entirely the wrong reason. That is `CLAUDE.md` trap 1's vacuous-control shape. The anchor now
  // points at the rule that really does follow `.ov-crewtask.working`, and the sanity check below
  // proves the substitution happened at all rather than trusting it.
  const blinded = src('styles.css').replace('.ov-crewtask.working{', '/*.ov-crewtask.working{')
    .replace('}\n.ov-empty{', '}*/\n.ov-empty{');
  assert.ok(blinded.includes('}*/\n.ov-empty{'),
    'the blinding substitution did not apply — its closing anchor no longer exists in styles.css, so '
    + 'the control below proves nothing. Re-point the anchor at whatever rule now follows '
    + '`.ov-crewtask.working`.');
  assert.equal(lastDeclaration(blinded.replace(/\/\*[\s\S]*?\*\//g, ''), '.ov-crewtask.working', 'color'), null,
    'commenting the rule out did not blind the reader, so the reader is not reading the rule');
});

// The paused nudge (B6) on both modern surfaces. MUTATION: drop either surface's element or its
// trigger ⇒ fails. The console's own `#s-nudge` is deliberately NOT touched — it dies with the shell.
const NUDGE_SURFACES = [
  ['src/ui/overview-view.js', 'ov-nudge'],
  ['src/ui/roomzoom-view.js', 'rz-nudge'],
];

test('B3: BOTH modern surfaces own a nudge element and fire it on a player intent', () => {
  for (const [file, id] of NUDGE_SURFACES) {
    const raw = src(file);
    // `nudgeOnIntent();` WITH the semicolon: the bare name also matches the function's own
    // DEFINITION (`function nudgeOnIntent() {`), so a version of this guard that looked for
    // `nudgeOnIntent()` stayed green with every CALL SITE deleted — the mutation could not bite.
    //
    // `trigger(isPaused())` is THE PREDICATE, and it was missing: this scan proved a trigger EXISTS
    // and never that it is conditional, so `trigger(true)` — a nudge blinking on a running ship, the
    // most user-visible way B6 can be wrong — passed the entire suite on either surface. `A1` drives
    // the reducer and proves it ignores a running trigger; nothing proved the caller ever asks.
    const tokens = [id, 'makeNudge', 'nudgeOnIntent();', 'trigger(isPaused())', 'unpause()'];
    assert.ok(wired(raw, tokens),
      `${file} does not carry the paused-ship nudge (plan §1(b) B6). Both surfaces need it: the `
      + 'Overview arms MOVE and commissions rooms, and the Room Zoom is where walls and devices are '
      + `actually placed. Tokens: ${JSON.stringify(tokens)}`);
    assert.equal(wired(commentOutLines(raw, 'nudgeOnIntent()'), tokens), false,
      `${file}: the scan passes with every nudge trigger commented out (CLAUDE.md trap #1)`);
    assert.ok(lastDeclaration(CSS, '.' + id, 'position'),
      `.${id} has no CSS rule, so the element exists and is invisible`);
  }
});

test('B4: the nudge does NOT fire for a view-only action (cosmetic decor applies while paused)', () => {
  // A nudge on decor would be the same dishonesty in the other direction: the RUG really did appear.
  const code = stripJsComments(src('src/ui/roomzoom-view.js'));
  const cosmetic = /pc\.cls === 'cosmetic'\)\s*\{([\s\S]*?)\}\s*else/.exec(code);
  assert.ok(cosmetic, 'the cosmetic branch of the Room Zoom click handler could not be located — this '
    + 'assertion is no longer reading what it claims to read');
  assert.ok(!cosmetic[1].includes('nudgeOnIntent'),
    'the cosmetic decor branch nudges. Decor is a view-only local layer that works on a stopped ship, '
    + 'so telling the player "nothing happened, press space" would be false.');
});

test('B5: the Room Zoom pawns carry the work tag, from the SAME classifier as the Overview', () => {
  const raw = src('src/ui/roomzoom-view.js');
  // `taskTag(c.task)` with its argument, not the bare name: the bare name also matches the import at
  // the top of the file, so the call site could be deleted with this scan still green.
  const tokens = ['taskTag(c.task)', 'rz-worktag'];
  assert.ok(wired(raw, tokens),
    'the Room Zoom draws people but never says which of them is working (plan §1(b) B4). It is the '
    + 'surface where a player watches individuals, so the marker belongs there too.');
  assert.equal(wired(commentOutLines(raw, 'rz-worktag'), tokens), false,
    'the scan passes with the Room Zoom work tag commented out (CLAUDE.md trap #1)');
  // and it must come from console-model's taskTag, not a private second table that can drift.
  //
  // ⚠️ WIDENED AT M1-K, AND THE WIDENING IS THE MINIMUM ONE. The pattern used to be
  // `\{\s*taskTag\s*\}` — a SOLE-SPECIFIER match, which asserted two things at once and only meant
  // to assert one: that `taskTag` comes from `console-model.js`, and (accidentally) that the Room
  // Zoom imports NOTHING ELSE from that module. The second half went red the moment the crew dock
  // took `surnameOf` and `watchTask` from the same file — which is the OPPOSITE of a drift, since
  // sharing more of the Overview's derivations is exactly what this assertion wants. The specifier
  // list is now matched as a list, and `\b` on both sides so `myTaskTag` cannot satisfy it.
  assert.match(stripJsComments(raw), /import\s*\{[^}]*\btaskTag\b[^}]*\}\s*from\s*'\.\/console-model\.js'/,
    'the Room Zoom classifies work with something other than the shared `taskTag`, so the two '
    + 'surfaces can now disagree about who is working');
  // NON-VACUITY for the widening: a pattern loose enough to accept a sibling specifier must still
  // refuse the defect it was written for — a LOCAL `taskTag` and no import of it at all.
  assert.doesNotMatch(
    stripJsComments(raw).replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/console-model\.js'/,
      (m, list) => 'import {' + list.replace(/\btaskTag\b\s*,?/, '') + "} from './console-model.js'"),
    /import\s*\{[^}]*\btaskTag\b[^}]*\}\s*from\s*'\.\/console-model\.js'/,
    'dropping `taskTag` from the console-model import still satisfies the widened pattern — it is '
    + 'now matching something other than the specifier list');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Group C — the nudge must NAME SOMETHING THAT WORKS, and must not fire on a withdrawal
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('C1: the nudge is a BUTTON that resumes the ship — the key it names is not always available', () => {
  // MEASURED over CDP against a live `--ship grid`, with real key events:
  //   arm [M] MOVE (paused)  → nudge shown, focus = BUTTON/[M] MOVE
  //   a real SPACE           → STILL PAUSED. `input/controls.js` yields SPACE to a focused button's
  //                            native activation, and Chrome focuses the button you clicked.
  // An affordance whose only instruction is a dead end on the very path that raises it is worse than
  // no affordance, so the chip carries the resume itself. Both surfaces, both wired to Cmd.pause().
  for (const [file, id] of NUDGE_SURFACES) {
    const code = stripJsComments(src(file));
    const tag = new RegExp(`<button[^>]*id="${id}"`);
    assert.match(code, tag,
      `#${id} is not a <button>. It tells the player to press a key that the click which raised it `
      + 'just took away, and offers nothing to click instead.');
    assert.match(code, /Cmd\.pause\(\)/, `${file} never sends Cmd.pause(), so nothing can resume`);
    // the handler branch that routes THIS element to that command
    const routed = new RegExp(`(ovNudge|rz-nudge)[^\\n]*\\n?[^\\n]*Cmd\\.pause\\(\\)|Cmd\\.pause\\(\\)[^\\n]*\\n?[^\\n]*(ovNudge|rz-nudge)`);
    assert.ok(routed.test(code) || /(ovNudge|data-rz-nudge)/.test(code),
      `${file}: the nudge element carries no click route to Cmd.pause()`);
    // …and the wording must not promise ONLY the key. The click is the guaranteed path.
    const text = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(src(file).replace(/'\s*\+\s*\n?\s*'/g, ''));
    assert.ok(text && /CLICK/i.test(text[1]),
      `#${id} reads ${JSON.stringify(text && text[1])} — it must offer the click it now supports, `
      + 'because SPACE is exactly the thing that does not work on the path that raises it.');
    assert.ok(lastDeclaration(CSS, '.' + id, 'cursor') === 'pointer',
      `.${id} has no \`cursor:pointer\` — it is a button that does not look like one`);
  }
  // NEGATIVE CONTROL: a source whose nudge element is commented out must fail the tag scan.
  const blinded = stripJsComments(commentOutLines(src('src/ui/overview-view.js'), 'id="ov-nudge"'));
  assert.equal(/<button[^>]*id="ov-nudge"/.test(blinded), false,
    'commenting the element out did not blind the scan (CLAUDE.md trap #1)');
});

test('C2: the Overview nudges on ARM only — cancelling an order is not "nothing happened"', () => {
  // `Hud.armTool` is a TOGGLE: the same click arms and cancels. The Room Zoom's `arm()` already
  // guarded with `if (_armed != null)`; the Overview's two call sites fired unconditionally, so
  // clicking MOVE a second time to CANCEL raised "PRESS SPACE TO RUN THE SHIP" — the affordance
  // going off at the one moment it has nothing to say. Reproduced in a real browser, then fixed;
  // the post-fix arm→cancel→arm sequence measures nudge = true / false / true.
  const code = stripJsComments(src('src/ui/overview-view.js'));
  // no BARE nudge call may sit on an armTool line's own branch: every arm route goes through the
  // guarded helper instead.
  for (const m of code.matchAll(/Hud\.armTool\([^)]*\);([^\n]*)/g)) {
    assert.ok(!/nudgeOnIntent\(\)/.test(m[1]),
      `an armTool branch nudges unconditionally: "${m[0].trim()}". A toggle's cancel half must not `
      + 'nudge — route it through the guard instead.');
    assert.match(m[1], /afterToolToggle\(/,
      `an armTool branch does not go through the arm guard: "${m[0].trim()}"`);
  }
  assert.match(code, /function afterToolToggle[\s\S]{0,400}?Hud\.getArmedTool\(\)\s*!=\s*null\)\s*nudgeOnIntent\(\)/,
    'afterToolToggle does not gate the nudge on `Hud.getArmedTool() != null`, so a CANCEL still '
    + 'tells the player to run the ship');
  // Non-vacuity: the matcher above must have found armTool call sites at all.
  assert.ok([...code.matchAll(/Hud\.armTool\(/g)].length >= 2,
    'no Hud.armTool call sites were found — the loop above asserted nothing');
});

test('C3: SPACE is handed back after a POINTER arm, and NOT stolen from a keyboard user', () => {
  // The root cause of C1 is that Chrome focuses the clicked button. Blurring it returns the key to
  // the game — but only for a mouse click: `e.detail === 0` is a keyboard activation, and a keyboard
  // user who tabbed to the button must keep their place in the tab order.
  // The CALL token per surface, never the bare name. `releaseSpace(` also matches the function's own
  // SIGNATURE, so a guard that looked for it stayed green with the Room Zoom's only call site
  // deleted — the mutation could not bite. That is the defect class this whole rework exists to
  // close, and it appeared once more while writing this very test.
  for (const [file, call] of [
    ['src/ui/overview-view.js', 'releaseSpace(btn, e);'],
    ['src/ui/roomzoom-view.js', 'releaseSpace(tool, e);'],
  ]) {
    const code = stripJsComments(src(file));
    assert.match(code, /function releaseSpace\(btn, e\)[\s\S]{0,320}?e\.detail === 0\) return;[\s\S]{0,80}?btn\.blur\(\)/,
      `${file}: releaseSpace either does not blur, or blurs unconditionally. Unconditional blur is a `
      + 'keyboard-navigation regression; no blur at all leaves the nudge naming a dead key.');
    assert.ok(code.includes(call),
      `${file} defines releaseSpace but never calls it (looked for ${JSON.stringify(call)}), so the `
      + 'tool button keeps focus and SPACE goes on activating it instead of running the ship');
    assert.equal(stripJsComments(commentOutLines(src(file), call)).includes(call), false,
      `${file}: the scan passes with the releaseSpace call commented out (CLAUDE.md trap #1)`);
  }
});

test('C4: the crowded-label de-clutter is BOTH rules — hidden, and revealed on hover', () => {
  // Half of the design had no test at all: deleting either declaration broke nothing. They are one
  // mechanism — `opacity:0` alone is data destruction (a name that is simply gone), and the hover
  // rule alone does nothing. Only an IDLE label is ever marked crowded, which is what makes hiding
  // it acceptable; the work tag's never-hide half is asserted in overview-scene.test.js.
  assert.equal(lastDeclaration(CSS, '.pl-tag-crowded', 'opacity'), '0',
    '.pl-tag-crowded is not transparent, so an unplaceable label just overlaps and the sweep\'s '
    + 'last-resort case does nothing');
  assert.equal(lastDeclaration(CSS, '.pl-pawn:hover .pl-tag-crowded', 'opacity'), '1',
    'a crowded label has no hover reveal, so the name is not de-cluttered — it is DELETED. Hovering '
    + 'the pawn is the only way it comes back.');
  // NEGATIVE CONTROL, the shape `B2` uses: comment each rule out in memory and the reader must go
  // blind. Without this the assertions could be satisfied by the rules appearing in a comment.
  const raw = src('styles.css');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const noHide = strip(raw.replace('.pl-tag-crowded{opacity:0', '/*.pl-tag-crowded{opacity:0*/ .x{a:b'));
  assert.equal(lastDeclaration(noHide, '.pl-tag-crowded', 'opacity'), null,
    'commenting the hide rule out did not blind the reader, so the reader is not reading the rule');
  const noHover = strip(raw.replace('.pl-pawn:hover .pl-tag-crowded{opacity:1}', ''));
  assert.equal(lastDeclaration(noHover, '.pl-pawn:hover .pl-tag-crowded', 'opacity'), null,
    'removing the hover rule did not blind the reader');
});

test('C5: the Room Zoom work tag is DRIVEN, not scanned — an idle occupant gets no tag', () => {
  // The scan in B5 cannot see this. `taskTag(c.task) || 'IDLE'` — the mutation that tags idle crew
  // and destroys the honesty rule on this surface — keeps both of B5's tokens and passed the whole
  // suite. `pawnSvg` is exported (with an injectable room origin) precisely so the rule can be
  // executed instead of read.
  const crew = [
    { cid: 1, role: 'crew', x: 3, y: 4, task: 'Digging out 5,5' },
    { cid: 2, role: 'crew', x: 5, y: 4, task: 'Idle' },
    { cid: 3, role: 'crew', x: 7, y: 4, task: 'Heading to dig out 6,6' },
    { cid: 4, role: 'crew', x: 9, y: 4, task: 'Crafting at recycler_1' },
  ];
  const svg = pawnSvg(crew, { rx: 2, ry: 3 });
  const tags = [...svg.matchAll(/class="rz-worktag"[\s\S]*?monospace">([^<]*)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(tags, ['DIG', 'CRAFT'],
    `the Room Zoom tagged ${JSON.stringify(tags)}. Exactly the two crew doing a job at a place may `
    + 'carry a tag: the idle one and the one still WALKING to its job must carry none, because the '
    + 'ABSENCE of a tag is the information. A tag over everybody answers nothing.');
  assert.equal((svg.match(/class="rz-pawn"/g) || []).length, 4, 'every occupant is still drawn — only the '
    + 'TAG is withheld, not the person');
});

test('B6: nothing was added to the dying console shell — the ports went to the modern surfaces', () => {
  // A one-line cross-check of the thing `client/test/surface-boundary.test.js` guards in depth: the
  // ported affordances must not have been (re)built inside `.app`.
  const html = src('index.html').replace(/<!--[\s\S]*?-->/g, '');
  for (const id of ['ov-nudge', 'rz-nudge', 'ov-crewtask', 'rz-worktag']) {
    assert.ok(!html.includes(id), `${id} was added to client/index.html, i.e. to the console shell that `
      + 'this whole programme exists to delete. Each modern surface builds its own DOM in its own module.');
  }
});
