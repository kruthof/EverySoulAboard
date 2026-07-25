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
const CREW_TASK_TOKENS = [
  '<span class="ov-crewtask"></span>', "querySelector('.ov-crewtask')",
  'watchTask', "setCls(rec.taskEl, 'working'",
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
  // Negative control: with the `.working` rule commented out, the assertion above must fail.
  const blinded = src('styles.css').replace('.ov-crewtask.working{', '/*.ov-crewtask.working{')
    .replace('}\n.ov-morale{', '}*/\n.ov-morale{');
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
    const tokens = [id, 'makeNudge', 'nudgeOnIntent();', 'unpause()'];
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
  const tokens = ['taskTag', 'rz-worktag'];
  assert.ok(wired(raw, tokens),
    'the Room Zoom draws people but never says which of them is working (plan §1(b) B4). It is the '
    + 'surface where a player watches individuals, so the marker belongs there too.');
  assert.equal(wired(commentOutLines(raw, 'rz-worktag'), tokens), false,
    'the scan passes with the Room Zoom work tag commented out (CLAUDE.md trap #1)');
  // and it must come from console-model's taskTag, not a private second table that can drift
  assert.match(stripJsComments(raw), /import\s*\{\s*taskTag\s*\}\s*from\s*'\.\/console-model\.js'/,
    'the Room Zoom classifies work with something other than the shared `taskTag`, so the two '
    + 'surfaces can now disagree about who is working');
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
